const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.join(
    __dirname,
    "../../uploads/products"
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const allowedExtensions = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
]);

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadDirectory);
    },

    filename: (_req, file, callback) => {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const filename =
            `product-${Date.now()}-` +
            `${crypto.randomBytes(6).toString("hex")}` +
            extension;

        callback(null, filename);
    },
});

const upload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },

    fileFilter: (_req, file, callback) => {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        if (
            !allowedMimeTypes.has(file.mimetype) ||
            !allowedExtensions.has(extension)
        ) {
            const error = new Error(
                "Product image must be JPG, JPEG, PNG, WEBP, or GIF."
            );

            error.status = 400;
            return callback(error);
        }

        callback(null, true);
    },
});

module.exports = upload;