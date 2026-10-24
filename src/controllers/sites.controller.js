const Site = require("../models/sites.model");

const ALLOWED_SITE_LOCATION_MODES = new Set([
    "na",
    "manual",
    "map_link",
    "gps",
    "vehicle_tracking",
]);

function parseId(value) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}

function parseNullableNumber(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

/**
 * Normalize the request body.
 * Site Location Name is optional and may be an empty string.
 */
function normalizeInput(body = {}) {
    const requestedMode = String(
        body.site_location_mode ?? "manual"
    ).trim();

    return {
        site_name: String(
            body.site_name ?? ""
        ).trim(),

        customer_id: parseId(body.customer_id),

        location_id:
            body.location_id === "" ||
            body.location_id === null ||
            body.location_id === undefined
                ? null
                : parseId(body.location_id),

        contact_person: String(
            body.contact_person ?? ""
        ).trim(),

        contact_number: String(
            body.contact_number ?? ""
        ).trim(),

        line_1: String(
            body.line_1 ?? ""
        ).trim(),

        line_2: String(
            body.line_2 ?? ""
        ).trim(),

        country: String(
            body.country ?? "India"
        ).trim(),

        state: String(
            body.state ?? ""
        ).trim(),

        city: String(
            body.city ?? ""
        ).trim(),

        pin_code: String(
            body.pin_code ?? ""
        ).trim(),

        // Site Location fields
        site_location_mode: requestedMode,

        site_location_name: String(
            body.site_location_name ?? ""
        ).trim(),

        site_location_address: String(
            body.site_location_address ?? ""
        ).trim(),

        site_location_latitude: parseNullableNumber(
            body.site_location_latitude
        ),

        site_location_longitude: parseNullableNumber(
            body.site_location_longitude
        ),

        site_location_map_url: String(
            body.site_location_map_url ?? ""
        ).trim(),

        vehicle_tracking_reference: String(
            body.vehicle_tracking_reference ?? ""
        ).trim(),
    };
}

/**
 * Validate the input.
 */
function validate(input) {
    const required = [
        ["site_name", "Site Name"],
        ["customer_id", "Customer"],
        ["country", "Country"],
        ["state", "State"],
    ];

    const missing = required.find(([key]) => {
        const value = input[key];

        return (
            value === null ||
            value === undefined ||
            value === ""
        );
    });

    if (missing) {
        return `${missing[1]} is required.`;
    }

    if (input.site_name.length > 150) {
        return "Site Name must be 150 characters or fewer.";
    }

    if (
        input.contact_number &&
        !/^[0-9+()\-\s]{7,20}$/.test(
            input.contact_number
        )
    ) {
        return "Enter a valid contact number.";
    }

    if (
        input.pin_code &&
        !/^[0-9A-Za-z\-\s]{3,10}$/.test(
            input.pin_code
        )
    ) {
        return "Enter a valid PIN code.";
    }

    if (
        !ALLOWED_SITE_LOCATION_MODES.has(
            input.site_location_mode
        )
    ) {
        return "Select a valid Site Location mode.";
    }

    // The Site Location Name is optional.
    // A map URL is required only when Map Link mode is selected.
    if (
        input.site_location_mode === "map_link" &&
        !input.site_location_map_url
    ) {
        return "Enter a Google Maps URL.";
    }

    if (
        input.site_location_latitude !== null &&
        (
            input.site_location_latitude < -90 ||
            input.site_location_latitude > 90
        )
    ) {
        return "Latitude must be between -90 and 90.";
    }

    if (
        input.site_location_longitude !== null &&
        (
            input.site_location_longitude < -180 ||
            input.site_location_longitude > 180
        )
    ) {
        return "Longitude must be between -180 and 180.";
    }

    return null;
}

/**
 * GET /api/sites
 */
exports.list = async (req, res) => {
    try {
        const page = Math.max(
            1,
            Number.parseInt(req.query.page, 10) || 1
        );

        const requestedLimit =
            Number.parseInt(req.query.limit, 10) || 10;

        const limit = [10, 25, 50, 100].includes(
            requestedLimit
        )
            ? requestedLimit
            : 10;

        const result = await Site.list({
            page,
            limit,
            search: String(
                req.query.search || ""
            ).trim(),
        });

        return res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages: result.totalPages,
            },
        });
    } catch (error) {
        console.error("List sites error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load sites.",
        });
    }
};

/**
 * GET /api/sites/lookups
 */
exports.lookups = async (_req, res) => {
    try {
        const data = await Site.listLookups();

        return res.json({
            success: true,
            data,
        });
    } catch (error) {
        console.error("Site lookup error:", error);

        return res.status(500).json({
            success: false,
            message:
                error.message ||
                "Unable to load customers and locations.",
        });
    }
};

/**
 * GET /api/sites/:id
 *
 * Includes the saved Site Location fields for the Edit form.
 */
exports.getById = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid site ID.",
        });
    }

    try {
        const site = await Site.getById(id);

        if (!site) {
            return res.status(404).json({
                success: false,
                message: "Site not found.",
            });
        }

        return res.json({
            success: true,
            data: site,
        });
    } catch (error) {
        console.error("Get site error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load site details.",
        });
    }
};

/**
 * POST /api/sites
 */
exports.create = async (req, res) => {
    const input = normalizeInput(req.body);

    const message = validate(input);

    if (message) {
        return res.status(400).json({
            success: false,
            message,
        });
    }

    try {
        const site = await Site.create(input);

        return res.status(201).json({
            success: true,
            message: "Site added successfully.",
            data: site,
        });
    } catch (error) {
        console.error("Create site error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status
                ? error.message
                : "Unable to add site.",
        });
    }
};

/**
 * PUT /api/sites/:id
 */
exports.update = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid site ID.",
        });
    }

    const input = normalizeInput(req.body);

    const message = validate(input);

    if (message) {
        return res.status(400).json({
            success: false,
            message,
        });
    }

    try {
        const site = await Site.update(id, input);

        if (!site) {
            return res.status(404).json({
                success: false,
                message: "Site not found.",
            });
        }

        return res.json({
            success: true,
            message: "Site updated successfully.",
            data: site,
        });
    } catch (error) {
        console.error("Update site error:", error);

        return res.status(error.status || 500).json({
            success: false,
            message: error.status
                ? error.message
                : "Unable to update site.",
        });
    }
};

/**
 * DELETE /api/sites/:id
 */
exports.remove = async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Invalid site ID.",
        });
    }

    try {
        const removed = await Site.remove(id);

        if (!removed) {
            return res.status(404).json({
                success: false,
                message: "Site not found.",
            });
        }

        return res.json({
            success: true,
            message: "Site deleted successfully.",
        });
    } catch (error) {
        console.error("Delete site error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to delete site.",
        });
    }
};

/*
 * Backward-compatible names for routes that use the older exports.
 */
exports.getSites = exports.list;
exports.getSiteById = exports.getById;
exports.createSite = exports.create;
exports.updateSite = exports.update;
exports.deleteSite = exports.remove;