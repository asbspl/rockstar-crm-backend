const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");
const orderUpload = require("../middlewares/orderUpload");

// Keep the fixed paths before /:id.
router.get("/", orderController.getOrders);
router.post("/", orderUpload, orderController.createOrder);
router.patch("/:id/status", orderController.updateOrderStatus);
router.patch("/:id/dispatch", orderController.saveDispatch);
router.patch("/:id/email", orderController.sendEmail);
router.get("/:id", orderController.getOrder);
router.put("/:id", orderUpload, orderController.updateOrder);
router.delete("/:id", orderController.deleteOrder);

module.exports = router;
