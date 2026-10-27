
const quotationService = require("../services/quotations.service");

function handleError(res, error, fallbackMessage) {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
        console.error("[QUOTATION API ERROR]", {
            message: error.message,
            code: error.code,
            detail: error.detail,
            table: error.table,
            column: error.column,
            constraint: error.constraint,
            stack: error.stack,
        });
    }

    return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500
            ? fallbackMessage
            : error.message,
    });
}

exports.getAllQuotations = async (req, res) => {
    try {
        const result = await quotationService.getAllQuotations(req.query);

        return res.status(200).json({
            success: true,
            data: result.rows,
            pagination: result.pagination,
        });
    } catch (error) {
        return handleError(res, error, "Unable to load quotations.");
    }
};

exports.getQuotationById = async (req, res) => {
    try {
        const quotation = await quotationService.getQuotationById(
            req.params.id
        );

        return res.status(200).json({
            success: true,
            data: quotation,
        });
    } catch (error) {
        return handleError(res, error, "Unable to load quotation details.");
    }
};

exports.createQuotation = async (req, res) => {
    try {
        const quotation = await quotationService.createQuotation(req.body);

        return res.status(201).json({
            success: true,
            message: "Quotation created successfully.",
            data: quotation,
        });
    } catch (error) {
        return handleError(res, error, "Unable to create quotation.");
    }
};

exports.updateQuotation = async (req, res) => {
    try {
        const quotation = await quotationService.updateQuotation(
            req.params.id,
            req.body
        );

        return res.status(200).json({
            success: true,
            message: "Quotation updated successfully.",
            data: quotation,
        });
    } catch (error) {
        return handleError(res, error, "Unable to update quotation.");
    }
};

exports.updateQuotationStatus = async (req, res) => {
    try {
        const quotation = await quotationService.updateQuotationStatus(
            req.params.id,
            req.body.status
        );

        return res.status(200).json({
            success: true,
            message: "Quotation status updated successfully.",
            data: quotation,
        });
    } catch (error) {
        return handleError(res, error, "Unable to update quotation status.");
    }
};

exports.printQuotation = async (req, res) => {
    try {
        const quotation = await quotationService.getQuotationById(
            req.params.id
        );

        return res.status(200).json({
            success: true,
            data: quotation,
        });
    } catch (error) {
        return handleError(res, error, "Unable to load quotation for printing.");
    }
};

exports.sendQuotationEmail = async (req, res) => {
    return res.status(501).json({
        success: false,
        message: "Email sending is not configured. Connect an email provider first.",
    });
};

exports.deleteQuotation = async (req, res) => {
    try {
        await quotationService.deleteQuotation(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Quotation deleted successfully.",
        });
    } catch (error) {
        return handleError(res, error, "Unable to delete quotation.");
    }
};
