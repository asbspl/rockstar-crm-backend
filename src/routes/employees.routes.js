
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const createEmployeesController = require("../controllers/employees.controller");

const router = express.Router();
const controller = createEmployeesController();

const uploadDir = path.join(process.cwd(), "uploads", "employees");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 8,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error("Only JPG, PNG, WEBP and PDF files are allowed.")
      );
    }
    cb(null, true);
  },
});

const employeeFiles = upload.fields([
  { name: "profile_picture", maxCount: 1 },
  { name: "last_salary_slip", maxCount: 1 },
  { name: "pan_card", maxCount: 1 },
  { name: "aadhar_card", maxCount: 1 },
  { name: "resume", maxCount: 1 },
  { name: "account_statement", maxCount: 1 },
  { name: "experience_certificate", maxCount: 1 },
  { name: "allotment_list", maxCount: 1 },
]);

function validateId(req, res, next) {
  const id = Number(req.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid employee ID.",
    });
  }

  req.params.id = String(id);
  next();
}

// List and create.
router.get("/", controller.list);
router.post("/", employeeFiles, controller.create);

// Fetch and edit.
router.get("/:id", validateId, controller.getById);
router.put("/:id", validateId, employeeFiles, controller.update);
router.patch("/:id/status", validateId, controller.updateStatus);
router.delete("/:id", validateId, controller.remove);

module.exports = router;
