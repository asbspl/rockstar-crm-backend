
const model = require("../models/contractor.model");

const requiredFields = [
    "name",
    "phone",
    "email",
    "address_line1",
    "location",
    "state",
    "city",
    "pin_code",
    "pan_card",
    "payment_upi",
    "account_name",
    "account_number",
    "ifsc_code",
];

function validate(data, requireDocuments = true) {
    for (const field of requiredFields) {
        if (!String(data[field] ?? "").trim()) {
            const error = new Error(`${field.replaceAll("_", " ")} is required.`);
            error.statusCode = 400;
            throw error;
        }
    }

    if (!/^\d{10}$/.test(data.phone)) {
        const error = new Error("Phone must contain exactly 10 digits.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        const error = new Error("Enter a valid email address.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(data.pan_card.toUpperCase())) {
        const error = new Error("Enter a valid PAN number.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^\d{12}$/.test(data.aadhaar_card)) {
        const error = new Error("Aadhaar must contain exactly 12 digits.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^\d{6}$/.test(data.pin_code)) {
        const error = new Error("PIN code must contain exactly 6 digits.");
        error.statusCode = 400;
        throw error;
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifsc_code.toUpperCase())) {
        const error = new Error("Enter a valid IFSC code.");
        error.statusCode = 400;
        throw error;
    }

    if (
        requireDocuments &&
        (!data.pan_card_document || !data.aadhaar_card_document)
    ) {
        const error = new Error("Both PAN and Aadhaar documents are required.");
        error.statusCode = 400;
        throw error;
    }

    if (!["Active", "Inactive"].includes(data.status || "Active")) {
        const error = new Error("Invalid contractor status.");
        error.statusCode = 400;
        throw error;
    }
}

async function list(options) {
    return model.findAll(options);
}

async function get(id) {
    const contractor = await model.findById(id);

    if (!contractor) {
        const error = new Error("Contractor not found.");
        error.statusCode = 404;
        throw error;
    }

    return contractor;
}

async function create(data) {
    data.status = data.status || "Active";
    data.pan_card = data.pan_card.toUpperCase();
    data.ifsc_code = data.ifsc_code.toUpperCase();
    validate(data);

    return model.create(data);
}

async function update(id, data) {
    const existing = await get(id);

    data.pan_card_document =
        data.pan_card_document || existing.pan_card_document;
    data.aadhaar_card_document =
        data.aadhaar_card_document || existing.aadhaar_card_document;

    data.status = data.status || existing.status;
    data.pan_card = data.pan_card.toUpperCase();
    data.ifsc_code = data.ifsc_code.toUpperCase();

    validate(data);

    return model.update(id, data);
}

async function changeStatus(id, status) {
    if (!["Active", "Inactive"].includes(status)) {
        const error = new Error("Status must be Active or Inactive.");
        error.statusCode = 400;
        throw error;
    }

    await get(id);
    return model.updateStatus(id, status);
}

async function remove(id) {
    await get(id);
    await model.remove(id);
}

module.exports = { list, get, create, update, changeStatus, remove };
