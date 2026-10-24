const fs = require("fs/promises");
const path = require("path");
const Product = require("../models/products.model");

const STATUSES = new Set(["Active", "Inactive"]);

function parseId(value) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}

function removeUploadedFile(file) {
    if (file?.path) {
        return fs.unlink(file.path).catch(() => {});
    }

    return Promise.resolve();
}

function normalizeInput(body = {}) {
    const rawRate = body.standard_rate;

    return {
        product_code: String(body.product_code ?? "").trim(),
        product_name: String(body.product_name ?? "").trim(),
        unit: String(body.unit ?? "").trim(),
        product_description: String(
            body.product_description ?? ""
        ).trim(),
        hsn_code: String(body.hsn_code ?? "").trim(),
        standard_rate:
            rawRate === "" ||
            rawRate === null ||
            rawRate === undefined
                ? NaN
                : Number(rawRate),
    };
}

function validateInput(input, imageRequired) {
    const requiredFields = [
        ["product_code", "Product Code"],
        ["product_name", "Product Name"],
        ["unit", "Unit"],
        ["product_description", "Product Description"],
        ["hsn_code", "HSN Code"],
    ];

    for (const [field, label] of requiredFields) {
        if (!input[field]) {
            return `${label} is required.`;
        }
    }

    if (input.product_code.length > 50) {
        return "Product Code cannot exceed 50 characters.";
    }

    if (input.product_name.length > 200) {
        return "Product Name cannot exceed 200 characters.";
    }

    if (input.unit.length > 50) {
        return "Unit cannot exceed 50 characters.";
    }

    if (input.hsn_code.length > 30) {
        return "HSN Code cannot exceed 30 characters.";
    }

    if (
        !Number.isFinite(input.standard_rate) ||
        input.standard_rate < 0
    ) {
        return "Standard Rate must be a valid non-negative number.";
    }

    if (input.standard_rate > 9999999999.99) {
        return "Standard Rate exceeds the allowed maximum.";
    }

    if (imageRequired) {
        return "Please upload a product image.";
    }

    return null;
}

function isDuplicateCode(error) {
    return (
        error.code === "23505" &&
        (
            error.constraint === "products_product_code_key" ||
            String(error.detail || "").includes("product_code")
        )
    );
}

function toStoredImagePath(file) {
    if (!file) return null;

    return `uploads/products/${file.filename}`;
}

async function deleteStoredImage(imagePath) {
    if (
        !imagePath ||
        !imagePath.startsWith("uploads/products/")
    ) {
        return;
    }

    const filename = path.basename(imagePath);
    const fullPath = path.join(
        __dirname,
        "../../uploads/products",
        filename
    );

    await fs.unlink(fullPath).catch(() => {});
}

/**
 * GET /api/products
 */
exports.list = async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const requestedLimit =
            Number.parseInt(req.query.limit, 10) || 10;

        const limit = [10, 25, 50, 100].includes(
            requestedLimit
        )
            ? requestedLimit
            : 10;

        const status = String(
            req.query.status || "All"
        );

        if (
            status !== "All" &&
            !STATUSES.has(status)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid product status filter.",
            });
        }

        const result = await Product.list({
            page,
            limit,
            search: String(req.query.search || ""),
            status,
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
        console.error("List products error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load products.",
        });
    }
};

/**
 * GET /api/products/:id
 */
exports.getById = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
        });
    }

    try {
        const product = await Product.getById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        return res.json({
            success: true,
            data: product,
        });
    } catch (error) {
        console.error("Get product error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load product details.",
        });
    }
};

/**
 * POST /api/products
 */
exports.create = async (req, res) => {
    const input = normalizeInput(req.body);
    const errorMessage = validateInput(
        input,
        !req.file
    );

    if (errorMessage) {
        await removeUploadedFile(req.file);

        return res.status(400).json({
            success: false,
            message: errorMessage,
        });
    }

    try {
        input.product_image = toStoredImagePath(req.file);

        const product = await Product.create(input);

        return res.status(201).json({
            success: true,
            message: "Product added successfully.",
            data: product,
        });
    } catch (error) {
        await removeUploadedFile(req.file);

        console.error("Create product error:", error);

        if (isDuplicateCode(error)) {
            return res.status(409).json({
                success: false,
                message: "This Product Code already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to add product.",
        });
    }
};

/**
 * PUT /api/products/:id
 */
exports.update = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        await removeUploadedFile(req.file);

        return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
        });
    }

    const input = normalizeInput(req.body);
    const errorMessage = validateInput(input, false);

    if (errorMessage) {
        await removeUploadedFile(req.file);

        return res.status(400).json({
            success: false,
            message: errorMessage,
        });
    }

    try {
        const existing = await Product.getById(id);

        if (!existing) {
            await removeUploadedFile(req.file);

            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        input.product_image = toStoredImagePath(req.file);

        const product = await Product.update(id, input);

        if (
            req.file &&
            existing.product_image &&
            existing.product_image !== product?.product_image
        ) {
            await deleteStoredImage(existing.product_image);
        }

        return res.json({
            success: true,
            message: "Product updated successfully.",
            data: product,
        });
    } catch (error) {
        await removeUploadedFile(req.file);

        console.error("Update product error:", error);

        if (isDuplicateCode(error)) {
            return res.status(409).json({
                success: false,
                message: "This Product Code already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Unable to update product.",
        });
    }
};

/**
 * PATCH /api/products/:id/status
 */
exports.updateStatus = async (req, res) => {
    const id = parseId(req.params.id);
    const status = String(req.body.status || "");

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
        });
    }

    if (!STATUSES.has(status)) {
        return res.status(400).json({
            success: false,
            message: "Status must be Active or Inactive.",
        });
    }

    try {
        const product = await Product.updateStatus(id, status);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        return res.json({
            success: true,
            message: `Product status changed to ${status}.`,
            data: product,
        });
    } catch (error) {
        console.error("Update product status error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update product status.",
        });
    }
};

/**
 * DELETE /api/products/:id
 */
exports.remove = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid product ID.",
        });
    }

    try {
        const product = await Product.remove(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found.",
            });
        }

        await deleteStoredImage(product.product_image);

        return res.json({
            success: true,
            message: "Product deleted successfully.",
        });
    } catch (error) {
        console.error("Delete product error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to delete product.",
        });
    }
};