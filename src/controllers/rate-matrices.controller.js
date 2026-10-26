const RateMatrix = require("../models/rate-matrices.model");

function parseId(value) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeInput(body = {}) {
    const rawRate = body.rate;

    return {
        client_id: parseId(body.client_id),
        customer_id: parseId(body.customer_id),
        site_id: parseId(body.site_id),
        location_id: parseId(body.location_id),
        product_id: parseId(body.product_id),
        rate:
            rawRate === "" ||
            rawRate === null ||
            rawRate === undefined
                ? NaN
                : Number(rawRate),
    };
}

function validate(input) {
    const requiredIds = [
        ["client_id", "Client"],
        ["customer_id", "Customer"],
        ["site_id", "Customer Site"],
        ["location_id", "Location"],
        ["product_id", "Product"],
    ];

    for (const [field, label] of requiredIds) {
        if (input[field] === null) {
            return `Please select a valid ${label}.`;
        }
    }

    if (!Number.isFinite(input.rate) || input.rate < 0) {
        return "Product rate must be a valid non-negative number.";
    }

    if (input.rate > 9999999999.99) {
        return "Product rate exceeds the allowed maximum.";
    }

    input.rate = Math.round(input.rate * 100) / 100;

    return null;
}

/**
 * GET /api/rate-matrix
 */
exports.list = async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const requestedLimit =
            Number.parseInt(req.query.limit, 10) || 10;

        const limit = [10, 25, 50, 100].includes(requestedLimit)
            ? requestedLimit
            : 10;

        const result = await RateMatrix.list({
            page,
            limit,
            search: String(req.query.search || ""),
        });

        return res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages: result.totalPages,
            },
        });
    } catch (error) {
        console.error("List rate matrices error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load rate matrices.",
        });
    }
};

/**
 * GET /api/rate-matrix/:id
 */
exports.getById = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid Rate Matrix ID.",
        });
    }

    try {
        const rateMatrix = await RateMatrix.getById(id);

        if (!rateMatrix) {
            return res.status(404).json({
                success: false,
                message: "Rate Matrix not found.",
            });
        }

        return res.json({
            success: true,
            data: rateMatrix,
        });
    } catch (error) {
        console.error("Get rate matrix error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load Rate Matrix details.",
        });
    }
};

/**
 * POST /api/rate-matrix
 */
exports.create = async (req, res) => {
    const input = normalizeInput(req.body);
    const errorMessage = validate(input);

    if (errorMessage) {
        return res.status(400).json({
            success: false,
            message: errorMessage,
        });
    }

    try {
        const rateMatrix = await RateMatrix.create(input);

        return res.status(201).json({
            success: true,
            message: "Rate Matrix added successfully.",
            data: rateMatrix,
        });
    } catch (error) {
        console.error("Create Rate Matrix error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to add Rate Matrix.",
        });
    }
};

/**
 * PUT /api/rate-matrix/:id
 */
exports.update = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid Rate Matrix ID.",
        });
    }

    const input = normalizeInput(req.body);
    const errorMessage = validate(input);

    if (errorMessage) {
        return res.status(400).json({
            success: false,
            message: errorMessage,
        });
    }

    try {
        const rateMatrix = await RateMatrix.update(id, input);

        if (!rateMatrix) {
            return res.status(404).json({
                success: false,
                message: "Rate Matrix not found.",
            });
        }

        return res.json({
            success: true,
            message: "Rate Matrix updated successfully.",
            data: rateMatrix,
        });
    } catch (error) {
        console.error("Update Rate Matrix error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update Rate Matrix.",
        });
    }
};

/**
 * DELETE /api/rate-matrix/:id
 */
exports.remove = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid Rate Matrix ID.",
        });
    }

    try {
        const removed = await RateMatrix.remove(id);

        if (!removed) {
            return res.status(404).json({
                success: false,
                message: "Rate Matrix not found.",
            });
        }

        return res.json({
            success: true,
            message: "Rate Matrix deleted successfully.",
        });
    } catch (error) {
        console.error("Delete Rate Matrix error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to delete Rate Matrix.",
        });
    }
};

// Backward-compatible export names.
exports.getRateMatrices = exports.list;
exports.getRateMatrixById = exports.getById;
exports.createRateMatrix = exports.create;
exports.updateRateMatrix = exports.update;
exports.deleteRateMatrix = exports.remove;