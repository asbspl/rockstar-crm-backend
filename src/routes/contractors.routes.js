
const express = require("express");
const router = express.Router();

const contractorController = require("../controllers/contractor.controller");
const uploadContractorDocuments = require("../middlewares/contractor-upload.middleware");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

// Verify exports before registering routes
if (typeof uploadContractorDocuments !== "function") {
    throw new Error(
        "Contractor upload middleware is not a function. Check upload.middleware.js"
    );
}

router.get("/", authorizeModuleAction("contractors", "read"), contractorController.list);
router.get("/:id", authorizeModuleAction("contractors", "read"), contractorController.getById);

router.post(
    "/",
    authorizeModuleAction("contractors", "create"),
    uploadContractorDocuments,
    contractorController.create
);

router.put(
    "/:id",
    authorizeModuleAction("contractors", "update"),
    uploadContractorDocuments,
    contractorController.update
);

router.patch("/:id/status", authorizeModuleAction("contractors", "update"), contractorController.changeStatus);
router.delete("/:id", authorizeModuleAction("contractors", "delete"), contractorController.remove);

module.exports = router;
