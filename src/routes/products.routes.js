const express = require("express");
const controller = require("../controllers/products.controller");
const upload = require("../middlewares/productUpload");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

const router = express.Router();

// List and search.
router.get("/", authorizeModuleAction("settings", "read"), controller.list);

// Product details for the Edit form.
router.get("/:id", authorizeModuleAction("settings", "read"), controller.getById);

// Create with image upload.
router.post(
    "/",
    authorizeModuleAction("settings", "update"),
    upload.single("product_image"),
    controller.create
);

// Update; the old image is retained if no replacement is uploaded.
router.put(
    "/:id",
    authorizeModuleAction("settings", "update"),
    upload.single("product_image"),
    controller.update
);

// Change Active / Inactive status.
router.patch("/:id/status", authorizeModuleAction("settings", "update"), controller.updateStatus);

// Delete product and its stored image.
router.delete("/:id", authorizeModuleAction("settings", "delete"), controller.remove);

module.exports = router;