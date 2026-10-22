
const express = require("express");
const router = express.Router();

const locationsController = require("../controllers/locations.controller");

// IMPORTANT: Keep /search BEFORE /:id
router.get("/search", locationsController.search);

router.get("/", locationsController.list);
router.get("/:id", locationsController.getById);

router.post("/", locationsController.create);
router.put("/:id", locationsController.update);
router.delete("/:id", locationsController.remove);

module.exports = router;
