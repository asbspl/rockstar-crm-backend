
const Customer = require("../models/customer.model");

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeInteger(value, fieldName) {
    if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return null;
    }

    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
        throw createError(`${fieldName} must be a valid positive integer.`);
    }

    return number;
}

function normalizeCoordinate(value, fieldName, min, max) {
    if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number < min || number > max) {
        throw createError(`${fieldName} is invalid.`);
    }

    return number;
}

function normalizeCustomerData(data = {}) {
    const normalized = { ...data };

    // Only normalize fields actually provided.
    // This prevents partial updates from clearing omitted fields.
    if (Object.prototype.hasOwnProperty.call(data, "client_id")) {
        normalized.client_id = normalizeInteger(data.client_id, "Client");
    }

    if (Object.prototype.hasOwnProperty.call(data, "location_id")) {
        normalized.location_id = normalizeInteger(data.location_id, "Location");
    }

    if (Object.prototype.hasOwnProperty.call(data, "under_employee_id")) {
        normalized.under_employee_id = normalizeInteger(
            data.under_employee_id,
            "Employee"
        );
    }

    if (Object.prototype.hasOwnProperty.call(data, "location_latitude")) {
        normalized.location_latitude = normalizeCoordinate(
            data.location_latitude,
            "Latitude",
            -90,
            90
        );
    }

    if (Object.prototype.hasOwnProperty.call(data, "location_longitude")) {
        normalized.location_longitude = normalizeCoordinate(
            data.location_longitude,
            "Longitude",
            -180,
            180
        );
    }

    if (Object.prototype.hasOwnProperty.call(data, "customer_name")) {
        normalized.customer_name = String(data.customer_name ?? "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(data, "phone")) {
        normalized.phone = String(data.phone ?? "").trim();
    }

    if (Object.prototype.hasOwnProperty.call(data, "email")) {
        normalized.email = String(data.email ?? "").trim() || null;
    }

    return normalized;
}

async function listCustomers(options = {}) {
    const page = Math.max(1, Number.parseInt(options.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(options.limit, 10) || 10)
    );

    const result = await Customer.list({
        search: String(options.search ?? ""),
        page,
        limit,
    });

    return {
        rows: result.rows,
        pagination: {
            page,
            limit,
            total: result.total,
            totalPages: Math.ceil(result.total / limit),
        },
    };
}

async function getCustomerById(id) {
    return Customer.getById(id);
}

async function createCustomer(data) {
    const normalized = normalizeCustomerData(data);

    if (!normalized.customer_name) {
        throw createError("Customer name is required.");
    }

    if (!normalized.client_id) {
        throw createError("Please select a valid client.");
    }

    if (!normalized.phone) {
        throw createError("Phone number is required.");
    }

    return Customer.create(normalized);
}

async function updateCustomer(id, data) {
    const existing = await Customer.getById(id);

    if (!existing) {
        return null;
    }

    const normalized = normalizeCustomerData(data);

    if (
        Object.prototype.hasOwnProperty.call(normalized, "customer_name") &&
        !normalized.customer_name
    ) {
        throw createError("Customer name cannot be empty.");
    }

    if (
        Object.prototype.hasOwnProperty.call(normalized, "phone") &&
        !normalized.phone
    ) {
        throw createError("Phone number cannot be empty.");
    }

    return Customer.update(id, normalized);
}

async function deleteCustomer(id) {
    return Customer.remove(id);
}

module.exports = {
    listCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer,
};
