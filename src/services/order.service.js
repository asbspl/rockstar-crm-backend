const pool = require("../config/db");
const orderModel = require("../models/order.model");

const ORDER_STATUSES = ["Draft", "Submitted", "Approved", "Cancelled"];
const DISPATCH_STATUSES = ["Pending", "Dispatched", "Delivered"];

function parseId(value, fieldName, required = true) {
    if (value === undefined || value === null || value === "") {
        if (!required) return null;
        throw new Error(`${fieldName} is required.`);
    }

    const id = Number(value);

    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error(`${fieldName} must be a valid ID.`);
    }

    return id;
}

function parseMoney(value, fieldName, { required = true, min = 0 } = {}) {
    if ((value === undefined || value === null || value === "") && !required) {
        return 0;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < min) {
        throw new Error(`${fieldName} must be a valid number.`);
    }

    return Math.round((number + Number.EPSILON) * 100) / 100;
}

function parseDate(value, fieldName, required = false) {
    if (!value) {
        if (required) throw new Error(`${fieldName} is required.`);
        return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        throw new Error(`${fieldName} must be a valid date.`);
    }

    return date.toISOString().slice(0, 10);
}

function optionalText(value, maxLength = 2000) {
    if (value === undefined || value === null) return null;

    const text = String(value).trim();
    if (!text) return null;

    if (text.length > maxLength) {
        throw new Error(`Text cannot exceed ${maxLength} characters.`);
    }

    return text;
}

function parseItems(rawItems) {
    let items = rawItems;

    if (typeof items === "string") {
        try {
            items = JSON.parse(items);
        } catch {
            throw new Error("Items must be valid JSON.");
        }
    }

    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Add at least one order item.");
    }

    return items.map((item, index) => {
        const row = index + 1;
        const productId = parseId(item.product_id, `Item ${row}: Product`);
        const quantity = parseMoney(item.quantity, `Item ${row}: Quantity`);

        if (quantity <= 0) {
            throw new Error(`Item ${row}: Quantity must be greater than zero.`);
        }

        const rate = parseMoney(
            item.rate_incl_gst ?? item.rate,
            `Item ${row}: Rate (Incl GST)`
        );

        const discount = parseMoney(
            item.discount ?? 0,
            `Item ${row}: Discount`,
            { required: false }
        );

        const gross = Math.round(quantity * rate * 100) / 100;

        if (discount > gross) {
            throw new Error(`Item ${row}: Discount cannot exceed its amount.`);
        }

        return {
            product_id: productId,
            unit: optionalText(item.unit, 50),
            quantity,
            rate_incl_gst: rate,
            discount,
            amount: Math.round((gross - discount) * 100) / 100,
        };
    });
}

function imagePath(file) {
    return file ? `/uploads/orders/${file.filename}` : null;
}

function getUploadedImages(files = {}) {
    const result = {};

    for (const name of ["image1", "image2", "image3", "image4"]) {
        result[name] = files[name]?.[0] ? imagePath(files[name][0]) : null;
    }

    return result;
}

async function validateMaster(db, table, id, fieldName) {
    if (!id) return null;

    const record = await orderModel.findMasterById(table, id, db);

    if (!record) {
        throw new Error(`${fieldName} was not found.`);
    }

    return record;
}

async function normalizePayload(body, files, existingOrder, db) {
    const companyId = parseId(
        body.company_id ?? existingOrder?.company_id,
        "Company"
    );
    const clientId = parseId(
        body.client_id ?? existingOrder?.client_id,
        "Client"
    );
    const customerId = parseId(
        body.customer_id ?? existingOrder?.customer_id,
        "Customer"
    );
    const locationId = parseId(
        body.location_id ?? existingOrder?.location_id,
        "Location",
        false
    );

    const company = await validateMaster(db, "companies", companyId, "Company");
    const client = await validateMaster(db, "clients", clientId, "Client");
    const customer = await validateMaster(db, "customers", customerId, "Customer");
    const location = await validateMaster(db, "locations", locationId, "Location");

    const rawItems =
        body.items !== undefined
            ? body.items
            : existingOrder?.items;

    const items = parseItems(rawItems);

    for (const item of items) {
        const product = await validateMaster(
            db,
            "products",
            item.product_id,
            "Product"
        );

        item.product_name =
            product.product_name ??
            product.name ??
            product.product_code ??
            `Product ${product.id}`;

        if (!item.unit) {
            item.unit = product.unit ?? "Nos";
        }
    }

    const subtotal = Math.round(
        items.reduce((sum, item) => {
            return sum + item.quantity * item.rate_incl_gst;
        }, 0) * 100
    ) / 100;

    const totalDiscount = Math.round(
        items.reduce((sum, item) => sum + item.discount, 0) * 100
    ) / 100;

    const grandTotal = Math.round(
        items.reduce((sum, item) => sum + item.amount, 0) * 100
    ) / 100;

    const uploadedImages = getUploadedImages(files);

    const status = optionalText(
        body.status ?? existingOrder?.status ?? "Draft",
        30
    );

    const dispatchStatus = optionalText(
        body.dispatch_status ?? existingOrder?.dispatch_status ?? "Pending",
        30
    );

    if (!ORDER_STATUSES.includes(status)) {
        throw new Error("Invalid order status.");
    }

    if (!DISPATCH_STATUSES.includes(dispatchStatus)) {
        throw new Error("Invalid dispatch status.");
    }

    return {
        pino: existingOrder?.pino ?? null,
        dcsno: optionalText(body.dcsno ?? existingOrder?.dcsno, 100),
        company_id: companyId,
        client_id: clientId,
        customer_id: customerId,
        customer_site_name: optionalText(
            body.customer_site_name ?? existingOrder?.customer_site_name,
            255
        ),
        location_id: locationId,
        proforma_date: parseDate(
            body.proforma_date ?? existingOrder?.proforma_date,
            "Proforma date"
        ),
        expected_shipping_date: parseDate(
            body.expected_shipping_date ?? existingOrder?.expected_shipping_date,
            "Expected shipping date"
        ),
        reference: optionalText(body.reference ?? existingOrder?.reference, 255),
        comment: optionalText(
            body.comment ?? existingOrder?.comment ??
                "Looking forward for your business.",
            5000
        ),
        image1: uploadedImages.image1 ?? existingOrder?.image1 ?? null,
        image2: uploadedImages.image2 ?? existingOrder?.image2 ?? null,
        image3: uploadedImages.image3 ?? existingOrder?.image3 ?? null,
        image4: uploadedImages.image4 ?? existingOrder?.image4 ?? null,
        subtotal,
        total_discount: totalDiscount,
        grand_total: grandTotal,
        status,
        dispatch_status: dispatchStatus,
        items,
        // Retain master labels for convenient use in responses if needed.
        company_name: company?.company_name ?? null,
        client_name: client?.client_name ?? null,
        customer_name: customer?.customer_name ?? null,
        location_name: location?.location_name ?? null,
    };
}

async function list(options = {}) {
    const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(options.limit, 10) || 10)
    );

    const result = await orderModel.list({
        page,
        limit,
        search: String(options.search ?? ""),
        status: options.status ?? "All",
        dispatch: options.dispatch ?? "All",
    });

    return {
        orders: result.rows,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
        },
    };
}

async function getById(id) {
    const orderId = parseId(id, "Order ID");
    const order = await orderModel.getById(orderId);

    if (!order) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
    }

    return order;
}

async function save(id, body = {}, files = {}) {
    const orderId = id ? parseId(id, "Order ID") : null;
    const db = await pool.connect();

    try {
        await db.query("BEGIN");

        let existingOrder = null;

        if (orderId) {
            existingOrder = await orderModel.getById(orderId, db);

            if (!existingOrder) {
                const error = new Error("Order not found.");
                error.statusCode = 404;
                throw error;
            }

            if (existingOrder.status === "Cancelled") {
                throw new Error("Cancelled orders cannot be edited.");
            }
        }

        const data = await normalizePayload(body, files, existingOrder, db);

        if (existingOrder) {
            data.pino = existingOrder.pino;

            await orderModel.updateOrder(orderId, data, db);
            await orderModel.replaceItems(orderId, data.items, db);
        } else {
            data.pino = await orderModel.getNextPino(db);

            const created = await orderModel.insertOrder(data, db);
            await orderModel.replaceItems(created.id, data.items, db);
        }

        await db.query("COMMIT");

        return await orderModel.getById(
            orderId ?? (await findOrderIdByPino(data.pino))
        );
    } catch (error) {
        await db.query("ROLLBACK");
        throw error;
    } finally {
        db.release();
    }
}

// Resolve the newly created order by its generated PINO.
// The unique constraint on pino in the migration protects its uniqueness.
async function findOrderIdByPino(pino) {
    const result = await pool.query(
        `SELECT id FROM public.orders WHERE pino = $1 LIMIT 1`,
        [pino]
    );

    if (!result.rows.length) {
        throw new Error("Order was saved, but could not be retrieved.");
    }

    return result.rows[0].id;
}

async function remove(id) {
    const orderId = parseId(id, "Order ID");
    const existing = await orderModel.getById(orderId);

    if (!existing) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
    }

    if (["Submitted", "Approved"].includes(existing.status)) {
        throw new Error(
            "Submitted or approved orders cannot be deleted."
        );
    }

    const deleted = await orderModel.deleteOrder(orderId);

    if (!deleted) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
    }

    return { id: deleted.id };
}

async function updateStatus(id, status) {
    const orderId = parseId(id, "Order ID");

    if (!ORDER_STATUSES.includes(status)) {
        throw new Error("Invalid order status.");
    }

    const existing = await orderModel.getById(orderId);

    if (!existing) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
    }

    const updated = await orderModel.updateStatus(orderId, status);

    return await orderModel.getById(updated.id);
}

async function updateDispatch(id, body = {}) {
    const orderId = parseId(id, "Order ID");
    const dispatchStatus = String(body.dispatch_status ?? "").trim();

    if (!DISPATCH_STATUSES.includes(dispatchStatus)) {
        throw new Error("Invalid dispatch status.");
    }

    const existing = await orderModel.getById(orderId);

    if (!existing) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
    }

    const dispatchDate = body.dispatch_date
        ? parseDate(body.dispatch_date, "Dispatch date")
        : dispatchStatus === "Pending"
            ? null
            : new Date().toISOString().slice(0, 10);

    await orderModel.updateDispatch(orderId, dispatchStatus, dispatchDate);

    return await orderModel.getById(orderId);
}

module.exports = {
    list,
    getById,
    save,
    remove,
    updateStatus,
    updateDispatch,
};