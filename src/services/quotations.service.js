
const model = require("../models/quotations.model");

const ALLOWED_STATUSES = ["Draft", "Send", "Approved", "Declined"];

function fail(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function positiveId(value, label, optional = false) {
    if (optional && (value === null || value === undefined || value === "")) {
        return null;
    }

    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        fail(`${label} must be a valid ID.`);
    }
    return id;
}

function validate(input = {}) {
    const company_id = positiveId(input.company_id, "Company");
    const client_id = positiveId(input.client_id, "Client");
    const customer_id = positiveId(input.customer_id, "Customer", true);
    const site_id = positiveId(input.site_id, "Site", true);
    const location_id = positiveId(input.location_id, "Location", true);

    if (!input.quotation_date || !input.expiry_date) {
        fail("Quotation Date and Expiry Date are required.");
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(input.quotation_date) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry_date)
    ) {
        fail("Quotation Date and Expiry Date must use YYYY-MM-DD format.");
    }

    if (input.expiry_date < input.quotation_date) {
        fail("Expiry Date cannot be before Quotation Date.");
    }

    const reference = String(input.reference || "").trim();
    const comment = String(input.comment || "").trim();

    if (!reference) fail("Reference is required.");
    if (reference.length > 255) fail("Reference cannot exceed 255 characters.");
    if (!comment) fail("Comment is required.");

    if (!Array.isArray(input.items) || input.items.length === 0) {
        fail("Please add at least one quotation item.");
    }

    const items = input.items.map((item, index) => {
        const product_id = positiveId(
            item.product_id,
            `Item ${index + 1} product`
        );
        const unit = String(item.unit || "").trim();
        const quantity = Number(item.quantity);
        const rate_incl_gst = Number(item.rate_incl_gst);

        if (!unit) fail(`Item ${index + 1}: Unit is required.`);
        if (unit.length > 50) fail(`Item ${index + 1}: Unit is too long.`);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            fail(`Item ${index + 1}: Quantity must be greater than zero.`);
        }
        if (!Number.isFinite(rate_incl_gst) || rate_incl_gst < 0) {
            fail(`Item ${index + 1}: Rate must be zero or greater.`);
        }

        const amount = Math.round(quantity * rate_incl_gst * 100) / 100;

        return { product_id, unit, quantity, rate_incl_gst, amount };
    });

    const total_amount = Math.round(
        items.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;

    return {
        company_id,
        client_id,
        customer_id,
        site_id,
        location_id,
        quotation_date: input.quotation_date,
        expiry_date: input.expiry_date,
        reference,
        comment,
        items,
        total_amount,
        // Rate includes GST; do not add GST again.
        grand_total: total_amount,
    };
}

function validateRequestId(value) {
    return positiveId(value, "Quotation ID");
}

async function getAllQuotations(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const requestedLimit = Number(query.limit) || 10;
    const limit = [10, 25, 50, 100].includes(requestedLimit)
        ? requestedLimit
        : 10;
    const search = String(query.search || "");
    const status = String(query.status || "All");

    if (status !== "All" && !ALLOWED_STATUSES.includes(status)) {
        fail("Invalid quotation status.");
    }

    return model.getAll({ page, limit, search, status });
}

async function getQuotationById(id) {
    const quotation = await model.getById(validateRequestId(id));
    if (!quotation) fail("Quotation not found.", 404);
    return quotation;
}

async function createQuotation(input) {
    const data = validate(input);
    const db = await model.pool.connect();
    let transactionOpen = false;

    try {
        await db.query("BEGIN");
        transactionOpen = true;

        const id = await model.insertHeader(db, data);
        await model.replaceItems(db, id, data.items);

        // Read the new record using the same transaction connection.
        const quotation = await model.getById(id, db);
        if (!quotation) throw new Error("Created quotation could not be loaded.");

        await db.query("COMMIT");
        transactionOpen = false;

        return quotation;
    } catch (error) {
        if (transactionOpen) {
            try {
                await db.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("[QUOTATION ROLLBACK ERROR]", rollbackError.message);
            }
        }
        throw error;
    } finally {
        db.release();
    }
}

async function updateQuotation(id, input) {
    const quotationId = validateRequestId(id);
    const data = validate(input);
    const db = await model.pool.connect();
    let transactionOpen = false;

    try {
        await db.query("BEGIN");
        transactionOpen = true;

        const existing = await db.query(
            `SELECT id, status
             FROM public.quotations
             WHERE id = $1
             FOR UPDATE`,
            [quotationId]
        );

        if (!existing.rowCount) fail("Quotation not found.", 404);
        if (existing.rows[0].status !== "Draft") {
            fail("Only Draft quotations can be edited.");
        }

        await model.updateHeader(db, quotationId, data);
        await model.replaceItems(db, quotationId, data.items);

        const quotation = await model.getById(quotationId, db);
        if (!quotation) throw new Error("Updated quotation could not be loaded.");

        await db.query("COMMIT");
        transactionOpen = false;

        return quotation;
    } catch (error) {
        if (transactionOpen) {
            try {
                await db.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("[QUOTATION ROLLBACK ERROR]", rollbackError.message);
            }
        }
        throw error;
    } finally {
        db.release();
    }
}

async function updateQuotationStatus(id, status) {
    const quotationId = validateRequestId(id);
    if (!ALLOWED_STATUSES.includes(status)) {
        fail("Status must be Draft, Send, Approved, or Declined.");
    }

    const result = await model.setStatus(quotationId, status);
    if (!result) fail("Quotation not found.", 404);
    return result;
}

async function deleteQuotation(id) {
    const quotationId = validateRequestId(id);
    const deleted = await model.remove(quotationId);
    if (!deleted) fail("Quotation not found.", 404);
}

module.exports = {
    getAllQuotations,
    getQuotationById,
    createQuotation,
    updateQuotation,
    updateQuotationStatus,
    deleteQuotation,
};
