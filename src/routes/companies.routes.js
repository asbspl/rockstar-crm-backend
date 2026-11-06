
const express = require("express");
const router = express.Router();

const companyController = require("../controllers/company.controller");
const companyUpload = require("../middlewares/company-upload.middleware");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

router.get("/", authorizeModuleAction("company", "read"), companyController.listCompanies);
router.post("/", authorizeModuleAction("company", "create"), companyUpload, companyController.createCompany);

router.put("/:id", authorizeModuleAction("company", "update"), companyUpload, companyController.updateCompany);
router.delete("/:id", authorizeModuleAction("company", "delete"), companyController.deleteCompany);


module.exports = router;
