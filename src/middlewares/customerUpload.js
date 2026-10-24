
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const uploadDir = path.join(
    process.cwd(),
    "uploads",
    "customers"
);

fs.mkdirSync(uploadDir, { recursive: true });

const fieldNames = {
    visiting_card_front: "visiting-card-front",
    visiting_card_back: "visiting-card-back",
    shop_front: "shop-front",
    shop_back: "shop-back",
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, uploadDir);
    },

    filename: (_req, file, cb) => {
        const prefix =
            fieldNames[file.fieldname] || "customer-file";

        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        cb(
            null,
            `${prefix}-${crypto.randomUUID()}${extension}`
        );
    },
});

const uploadCustomerDocuments = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 4,
    },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(
                new Error(
                    "Only JPG, PNG, WEBP and PDF files are allowed."
                )
            );
        }

        cb(null, true);
    },
}).fields([
    { name: "visiting_card_front", maxCount: 1 },
    { name: "visiting_card_back", maxCount: 1 },
    { name: "shop_front", maxCount: 1 },
    { name: "shop_back", maxCount: 1 },
]);

module.exports = uploadCustomerDocuments;
