
const multer = require("multer");

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf",
];

const upload = multer({
  storage: multer.memoryStorage(),
limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB per file
        files: 4,                  // Allow four uploaded files
    },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG, and PDF files are allowed.")
      );
    }

    callback(null, true);
  },
});

module.exports = upload;
