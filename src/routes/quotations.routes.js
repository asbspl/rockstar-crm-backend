
const express = require("express");
const controller = require("../controllers/quotations.controller");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", authorizeModuleAction("quotations", "read"), controller.getAllQuotations);
router.post("/", authorizeModuleAction("quotations", "create"), controller.createQuotation);

// Keep the specific routes before the generic /:id route.
router.get("/:id/print", authorizeModuleAction("quotations", "read"), controller.printQuotation);
router.post("/:id/send-email", authorizeModuleAction("quotations", "update"), controller.sendQuotationEmail);
router.patch("/:id/status", authorizeModuleAction("quotations", "update"), controller.updateQuotationStatus);

router.get("/:id", authorizeModuleAction("quotations", "read"), controller.getQuotationById);
router.put("/:id", authorizeModuleAction("quotations", "update"), controller.updateQuotation);
router.delete("/:id", authorizeModuleAction("quotations", "delete"), controller.deleteQuotation);

module.exports = router;
