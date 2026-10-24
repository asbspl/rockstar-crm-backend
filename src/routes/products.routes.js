const express = require("express");
const controller = require("../controllers/products.controller");
const upload = require("../middlewares/productUpload");

const router = express.Router();

// List and search.
router.get("/", controller.list);

// Product details for the Edit form.
router.get("/:id", controller.getById);

// Create with image upload.
router.post(
    "/",
    upload.single("product_image"),
    controller.create
);

// Update; the old image is retained if no replacement is uploaded.
router.put(
    "/:id",
    upload.single("product_image"),
    controller.update
);

// Change Active / Inactive status.
router.patch("/:id/status", controller.updateStatus);

// Delete product and its stored image.
router.delete("/:id", controller.remove);

module.exports = router;