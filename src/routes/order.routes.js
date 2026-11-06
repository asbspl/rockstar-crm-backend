const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");
const orderUpload = require("../middlewares/orderUpload");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

// Keep the fixed paths before /:id.
router.get("/", authorizeModuleAction("orders", "read"), orderController.getOrders);
router.post("/", authorizeModuleAction("orders", "create"), orderUpload, orderController.createOrder);
router.patch("/:id/status", authorizeModuleAction("orders", "update"), orderController.updateOrderStatus);
router.patch("/:id/dispatch", authorizeModuleAction("dispatch", "update"), orderController.saveDispatch);
router.patch("/:id/email", authorizeModuleAction("orders", "update"), orderController.sendEmail);
router.get("/:id", authorizeModuleAction("orders", "read"), orderController.getOrder);
router.put("/:id", authorizeModuleAction("orders", "update"), orderUpload, orderController.updateOrder);
router.delete("/:id", authorizeModuleAction("orders", "delete"), orderController.deleteOrder);

module.exports = router;
