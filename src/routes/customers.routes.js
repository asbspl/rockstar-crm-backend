
const express = require("express");
const controller = require("../controllers/customers.controller");
const uploadCustomerDocuments = require("../middlewares/customerUpload");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", authorizeModuleAction("customers", "read"), controller.list);
router.get("/:id", authorizeModuleAction("customers", "read"), controller.getById);

router.post(
    "/",
    authorizeModuleAction("customers", "create"),
    uploadCustomerDocuments,
    controller.create
);

router.put(
    "/:id",
    authorizeModuleAction("customers", "update"),
    uploadCustomerDocuments,
    controller.update
);

router.delete("/:id", authorizeModuleAction("customers", "delete"), controller.remove);

module.exports = router;
