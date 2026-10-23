const express = require("express");
const router = express.Router();

router.post("/resolve", async (req, res) => {
    try {
        const { mapUrl } = req.body;

        if (!mapUrl) {
            return res.status(400).json({
                success: false,
                message: "Google Maps URL is required",
            });
        }

        const parsed = new URL(mapUrl);

        if (
            !["maps.app.goo.gl", "goo.gl", "google.com",
              "www.google.com", "maps.google.com"].includes(parsed.hostname)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid Google Maps URL",
            });
        }

        const response = await fetch(mapUrl, {
            redirect: "follow",
            headers: { "User-Agent": "Mozilla/5.0" },
        });

        const resolvedUrl = response.url;

        const patterns = [
            /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
            /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
        ];

        let match = null;

        for (const pattern of patterns) {
            match = resolvedUrl.match(pattern);
            if (match) break;
        }

        if (!match) {
            return res.status(422).json({
                success: false,
                message: "Coordinates were not found in this map link",
            });
        }

        return res.json({
            success: true,
            data: {
                latitude: Number(match[1]),
                longitude: Number(match[2]),
            },
        });
    } catch (error) {
        console.error("Google Maps resolve error:", error.message);

        return res.status(422).json({
            success: false,
            message: "Unable to resolve this Google Maps link",
        });
    }
});

module.exports = router;