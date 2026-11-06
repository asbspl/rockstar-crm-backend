const express = require("express");
const controller = require("../controllers/sites.controller");

const router = express.Router();

const { authorizeModuleAction } = require("../middlewares/auth.middleware");

router.get("/", authorizeModuleAction("sites", "read"), controller.getSites);
router.get("/:id", authorizeModuleAction("sites", "read"), controller.getSiteById);
router.post("/", authorizeModuleAction("sites", "create"), controller.createSite);
router.put("/:id", authorizeModuleAction("sites", "update"), controller.updateSite);
router.delete("/:id", authorizeModuleAction("sites", "delete"), controller.deleteSite);

module.exports = router;