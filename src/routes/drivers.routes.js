
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const controller = require("../controllers/driver.controller");

const router = express.Router();

const uploadDir = path.join(
  process.cwd(),
  "uploads",
  "drivers"
);

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${require("crypto").randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only PDF, JPG, and PNG files are allowed"));
    }

    cb(null, true);
  },
});

const driverDocuments = upload.fields([
  { name: "aadhar_card_document", maxCount: 1 },
  { name: "vehicle_registration_document", maxCount: 1 },
]);

// IMPORTANT: Add your existing authentication and Driver permission
// middleware to these routes, following Company/Employee route conventions.

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", driverDocuments, controller.create);
router.put("/:id", driverDocuments, controller.update);
router.patch("/:id/status", controller.updateStatus);
router.delete("/:id", controller.remove);

module.exports = router;
