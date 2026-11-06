const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const controller = require("../controllers/clients.controller");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

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

// Do not expose client identity documents through a public static URL.

router.get("/", authorizeModuleAction("clients", "read"), controller.list);
router.get("/:id", authorizeModuleAction("clients", "read"), controller.getById);
router.post("/", authorizeModuleAction("clients", "create"), clientUploads, controller.create);
router.put("/:id", authorizeModuleAction("clients", "update"), clientUploads, controller.update);
router.patch("/:id/status", authorizeModuleAction("clients", "update"), express.json(), controller.updateStatus);
router.delete("/:id", authorizeModuleAction("clients", "delete"), controller.remove);

module.exports = router;