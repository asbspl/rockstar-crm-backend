
const express = require("express");
const controller = require("../controllers/customers.controller");
const uploadCustomerDocuments = require("../middlewares/customerUpload");

const router = express.Router();

router.get("/", controller.list);
router.get("/:id", controller.getById);

router.post(
    "/",
    uploadCustomerDocuments,
    controller.create
);

router.put(
    "/:id",
    uploadCustomerDocuments,
    controller.update
);

router.delete("/:id", controller.remove);

module.exports = router;
