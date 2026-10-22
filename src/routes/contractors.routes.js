
const express = require("express");
const router = express.Router();

const contractorController = require("../controllers/contractor.controller");
const uploadContractorDocuments = require("../middlewares/contractor-upload.middleware");

// Verify exports before registering routes
if (typeof uploadContractorDocuments !== "function") {
    throw new Error(
        "Contractor upload middleware is not a function. Check upload.middleware.js"
    );
}

router.get("/", contractorController.list);
router.get("/:id", contractorController.getById);

router.post(
    "/",
    uploadContractorDocuments,
    contractorController.create
);

router.put(
    "/:id",
    uploadContractorDocuments,
    contractorController.update
);

router.patch("/:id/status", contractorController.changeStatus);
router.delete("/:id", contractorController.remove);

module.exports = router;
