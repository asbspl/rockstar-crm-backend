const clientsService = require("../services/clients.service");

function sendError(res, error) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message:
            statusCode === 500
                ? "An unexpected error occurred."
                : error.message,
    });
}

function uploadedPaths(req) {
    const files = req.files || {};

    const getPath = (key) =>
        files[key]?.[0]?.filename
            ? `uploads/clients/${files[key][0].filename}`
            : undefined;

return {
    gst_document_path: getPath("gst_document"),
    pan_document_path: getPath("pan_document"),
    aadhaar_document_path: getPath("aadhaar_document"),
    dealer_registration_document_path: getPath(
        "dealer_registration_document"
    ),
    visiting_card_front: getPath("visiting_card_front"),
    visiting_card_back_path: getPath("visiting_card_back"),
};
}

exports.list = async (req, res) => {
    try {
        const result = await clientsService.list(req.query);

        return res.json({
            success: true,
            data: result.rows,
            pagination: result.pagination,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.getById = async (req, res) => {
    try {
        const client = await clientsService.getById(req.params.id);

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found.",
            });
        }

        return res.json({ success: true, data: client });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.create = async (req, res) => {
    try {
        const client = await clientsService.create({
            ...req.body,
            ...uploadedPaths(req),
        });

        return res.status(201).json({
            success: true,
            message: "Client added successfully.",
            data: client,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.update = async (req, res) => {
    try {
        const client = await clientsService.update(req.params.id, {
            ...req.body,
            ...uploadedPaths(req),
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found.",
            });
        }

        return res.json({
            success: true,
            message: "Client updated successfully.",
            data: client,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.update = async (req, res) => {
    try {
        const client = await clientsService.update(req.params.id, {
            ...req.body,
            ...uploadedPaths(req),
        });

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found.",
            });
        }

        return res.json({
            success: true,
            message: "Client updated successfully.",
            data: client,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.updateStatus = async (req, res) => {
    try {
        const client = await clientsService.updateStatus(
            req.params.id,
            req.body.status
        );

        if (!client) {
            return res.status(404).json({
                success: false,
                message: "Client not found.",
            });
        }

        return res.json({
            success: true,
            message: "Client status updated.",
            data: client,
        });
    } catch (error) {
        return sendError(res, error);
    }
};

exports.remove = async (req, res) => {
    try {
        const deleted = await clientsService.remove(req.params.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Client not found.",
            });
        }

        return res.json({
            success: true,
            message: "Client deleted successfully.",
        });
    } catch (error) {
        return sendError(res, error);
    }
};