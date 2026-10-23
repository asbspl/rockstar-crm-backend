const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const controller = require("../controllers/clients.controller");

const router = express.Router();

const uploadDirectory = path.resolve(
    process.cwd(),
    "uploads",
    "clients"
);

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, uploadDirectory);
    },

    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname).toLowerCase();

        callback(
            null,
            `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`
        );
    },
});

const allowedMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const upload = multer({
    storage,
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 6,
    },
    fileFilter: (_req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            return callback(
                new Error("Only PDF, JPG, PNG, and WEBP files are allowed.")
            );
        }

        return callback(null, true);
    },
});

const clientUploads = upload.fields([
    { name: "gst_document", maxCount: 1 },
    { name: "pan_document", maxCount: 1 },
    { name: "aadhaar_document", maxCount: 1 },
    { name: "dealer_registration_document", maxCount: 1 },
    { name: "visiting_card_front", maxCount: 1 },
    { name: "visiting_card_back", maxCount: 1 },
]);

// Add your existing authentication and RBAC middleware here.
// Do not expose client identity documents through a public static URL.

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", clientUploads, controller.create);
router.put("/:id", clientUploads, controller.update);
router.patch("/:id/status", express.json(), controller.updateStatus);
router.delete("/:id", controller.remove);

module.exports = router;