const express = require("express");
const controller = require("../controllers/rate-matrices.controller");
const { authorizeModuleAction } = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", authorizeModuleAction("settings", "read"), controller.list);
router.get("/:id", authorizeModuleAction("settings", "read"), controller.getById);
router.post("/", authorizeModuleAction("settings", "update"), controller.create);
router.put("/:id", authorizeModuleAction("settings", "update"), controller.update);
router.delete("/:id", authorizeModuleAction("settings", "delete"), controller.remove);

module.exports = router;