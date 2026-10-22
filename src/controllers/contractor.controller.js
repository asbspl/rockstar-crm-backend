
const contractorModel = require("../models/contractor.model");

function getUploadedPath(files, fieldName) {
    const file = files?.[fieldName]?.[0];

    // Store paths relative to the backend project directory.
    return file
        ? `uploads/contractors/${file.filename}`
        : null;
}

function validateBody(body, isUpdate = false) {
    const requiredFields = [
        ["name", "Name"],
        ["phone", "Phone"],
        ["email", "Email"],
        ["address_line1", "Address Line 1"],
        ["location", "Location"],
        ["state", "State"],
        ["city", "City"],
        ["pin_code", "Pin Code"],
        ["pan_card", "PAN Card"],
        ["aadhaar_card", "Aadhaar Card"],
        ["payment_upi", "Contractor Payment UPI"],
        ["account_name", "Account Name"],
        ["account_number", "Account Number"],
        ["ifsc_code", "IFSC Code"],
    ];

    for (const [field, label] of requiredFields) {
        if (!String(body[field] ?? "").trim()) {
            return `${label} is required.`;
        }
    }

    const email = String(body.email).trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "Enter a valid email address.";
    }

    const phone = String(body.phone).trim();

    if (!/^[0-9+\-()\s]{7,20}$/.test(phone)) {
        return "Enter a valid phone number.";
    }

    const pan = String(body.pan_card).trim().toUpperCase();

    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
        return "Enter a valid PAN number.";
    }

    const aadhaar = String(body.aadhaar_card).replace(/\s/g, "");

    if (!/^\d{12}$/.test(aadhaar)) {
        return "Enter a valid 12-digit Aadhaar number.";
    }

    const pinCode = String(body.pin_code).trim();

    if (!/^\d{6}$/.test(pinCode)) {
        return "Enter a valid 6-digit Pin Code.";
    }

    const ifsc = String(body.ifsc_code).trim().toUpperCase();

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
        return "Enter a valid IFSC Code.";
    }

    const status = String(body.status || "active").toLowerCase();

    if (!["active", "inactive"].includes(status)) {
        return "Status must be active or inactive.";
    }

    return null;
}

function buildData(body, files = {}, existing = null) {
    return {
        name: String(body.name || "").trim(),
        phone: String(body.phone || "").trim(),
        email: String(body.email || "").trim().toLowerCase(),
        address_line1: String(body.address_line1 || "").trim(),
        address_line2: String(body.address_line2 || "").trim() || null,
        location: String(body.location || "").trim(),
        state: String(body.state || "").trim(),
        city: String(body.city || "").trim(),
        pin_code: String(body.pin_code || "").trim(),
        pan_card: String(body.pan_card || "").trim().toUpperCase(),
        pan_card_document:
            getUploadedPath(files, "pan_card_document") ||
            existing?.pan_card_document ||
            null,
        aadhaar_card: String(body.aadhaar_card || "").replace(/\s/g, ""),
        aadhaar_card_document:
            getUploadedPath(files, "aadhaar_card_document") ||
            existing?.aadhaar_card_document ||
            null,
        payment_upi: String(body.payment_upi || "").trim(),
        account_name: String(body.account_name || "").trim(),
        account_number: String(body.account_number || "").trim(),
        ifsc_code: String(body.ifsc_code || "").trim().toUpperCase(),
        status: String(body.status || existing?.status || "active").toLowerCase(),
    };
}

function parseId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function list(req, res, next) {
    try {
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(
            Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
            100
        );

        const result = await contractorModel.findAll({
            page,
            limit,
            search: String(req.query.search || "").trim(),
            status: String(req.query.status || "All"),
        });

        return res.status(200).json({
            success: true,
            data: {
                contractors: result.rows,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    totalPages: Math.ceil(result.total / limit),
                },
            },
        });
    } catch (error) {
        next(error);
    }
}

async function getById(req, res, next) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid contractor ID.",
            });
        }

        const contractor = await contractorModel.findById(id);

        if (!contractor) {
            return res.status(404).json({
                success: false,
                message: "Contractor not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: { contractor },
        });
    } catch (error) {
        next(error);
    }
}

async function create(req, res, next) {
    try {
        const body = req.body || {};
        const validationError = validateBody(body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        const files = req.files || {};
        const panDocument = getUploadedPath(files, "pan_card_document");
        const aadhaarDocument = getUploadedPath(files, "aadhaar_card_document");

        if (!panDocument || !aadhaarDocument) {
            return res.status(400).json({
                success: false,
                message: "Please upload both PAN and Aadhaar documents.",
            });
        }

        const contractor = await contractorModel.create(
            buildData(body, files)
        );

        return res.status(201).json({
            success: true,
            message: "Contractor created successfully.",
            data: { contractor },
        });
    } catch (error) {
        next(error);
    }
}

async function update(req, res, next) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid contractor ID.",
            });
        }

        const existing = await contractorModel.findById(id);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Contractor not found.",
            });
        }

        const body = req.body || {};
        const validationError = validateBody(body);

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
            });
        }

        const contractor = await contractorModel.update(
            id,
            buildData(body, req.files || {}, existing)
        );

        return res.status(200).json({
            success: true,
            message: "Contractor updated successfully.",
            data: { contractor },
        });
    } catch (error) {
        next(error);
    }
}

async function changeStatus(req, res, next) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid contractor ID.",
            });
        }

        const status = String(req.body?.status || "").toLowerCase();

        if (!["active", "inactive"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be active or inactive.",
            });
        }

        const contractor = await contractorModel.updateStatus(id, status);

        if (!contractor) {
            return res.status(404).json({
                success: false,
                message: "Contractor not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Contractor status updated successfully.",
            data: { contractor },
        });
    } catch (error) {
        next(error);
    }
}

async function remove(req, res, next) {
    try {
        const id = parseId(req.params.id);

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "Invalid contractor ID.",
            });
        }

        const removed = await contractorModel.remove(id);

        if (!removed) {
            return res.status(404).json({
                success: false,
                message: "Contractor not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Contractor deleted successfully.",
            data: { id },
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    list,
    getById,
    create,
    update,
    changeStatus,
    remove,
};
