
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Store uploaded files in: backend/uploads/companies
const uploadDir = path.join(__dirname, "../../uploads/companies");

// Create the upload directory if it doesn't exist
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${file.fieldname}-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extension}`;

    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    return cb(
      new Error("Only JPG, PNG, WEBP, and PDF files are allowed.")
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 4,
  },
});

// Accept one file for each field
module.exports = upload.fields([
  { name: "companyLogo", maxCount: 1 },
  { name: "companySignature", maxCount: 1 },
  { name: "panDocument", maxCount: 1 },
  { name: "gstCertificate", maxCount: 1 },
]);
