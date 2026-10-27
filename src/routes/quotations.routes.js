
const express = require("express");
const controller = require("../controllers/quotations.controller");

const router = express.Router();

router.get("/", controller.getAllQuotations);
router.post("/", controller.createQuotation);

// Keep the specific routes before the generic /:id route.
router.get("/:id/print", controller.printQuotation);
router.post("/:id/send-email", controller.sendQuotationEmail);
router.patch("/:id/status", controller.updateQuotationStatus);

router.get("/:id", controller.getQuotationById);
router.put("/:id", controller.updateQuotation);
router.delete("/:id", controller.deleteQuotation);

module.exports = router;
