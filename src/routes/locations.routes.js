
const express = require("express");
const router = express.Router();

const locationsController = require("../controllers/locations.controller");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

// IMPORTANT: Keep /search BEFORE /:id
router.get("/search", authorizeModuleAction("settings", "read"), locationsController.search);

router.get("/", authorizeModuleAction("settings", "read"), locationsController.list);
router.get("/:id", authorizeModuleAction("settings", "read"), locationsController.getById);

router.post("/", authorizeModuleAction("settings", "update"), locationsController.create);
router.put("/:id", authorizeModuleAction("settings", "update"), locationsController.update);
router.delete("/:id", authorizeModuleAction("settings", "delete"), locationsController.remove);

module.exports = router;
