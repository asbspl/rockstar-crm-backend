const express = require("express");
const controller = require("../controllers/sites.controller");

const router = express.Router();

router.get("/", controller.getSites);
router.get("/:id", controller.getSiteById);
router.post("/", controller.createSite);
router.put("/:id", controller.updateSite);
router.delete("/:id", controller.deleteSite);

module.exports = router;