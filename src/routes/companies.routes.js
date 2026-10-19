
const express = require("express");
const router = express.Router();

const companyController = require("../controllers/company.controller");
const companyUpload = require("../middlewares/company-upload.middleware");

router.get("/", companyController.listCompanies);
router.post("/", companyUpload, companyController.createCompany);

router.put("/:id", companyUpload, companyController.updateCompany);
router.delete("/:id", companyController.deleteCompany);

module.exports = router;
