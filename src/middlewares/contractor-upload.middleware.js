
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDirectory = path.resolve(
    process.cwd(),
    "uploads",
    "contractors"
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadDirectory);
    },
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${crypto.randomUUID()}${extension}`);
    },
});

const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const allowedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
]);

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 2,
    },
    fileFilter: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (
            !allowedExtensions.has(extension) ||
            !allowedMimeTypes.has(file.mimetype)
        ) {
            return callback(
                new Error("Only PDF, JPG, JPEG and PNG documents are allowed.")
            );
        }

        callback(null, true);
    },
});

module.exports = upload.fields([
    { name: "pan_card_document", maxCount: 1 },
    { name: "aadhaar_card_document", maxCount: 1 },
]);
