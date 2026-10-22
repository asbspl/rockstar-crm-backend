const pool = require("../config/db");

const normalizeLocationName = (value) => {
    if (typeof value !== "string" || !value.trim()) {
        const error = new Error("Location name is required.");
        error.statusCode = 400;
        throw error;
    }

    return value.trim();
};

const list = async (query = {}) => {
    const search = String(query.search || "").trim();

    const result = await pool.query(
        `SELECT id, location_name, created_at, updated_at
         FROM public.locations
         WHERE ($1 = '' OR location_name ILIKE '%' || $1 || '%')
         ORDER BY id DESC`,
        [search]
    );

    return {
        locations: result.rows,
        pagination: {
            total: result.rowCount,
        },
    };
};

const getById = async (id) => {
    const result = await pool.query(
        `SELECT id, location_name, created_at, updated_at
         FROM public.locations
         WHERE id = $1`,
        [id]
    );

    if (!result.rowCount) {
        const error = new Error("Location not found.");
        error.statusCode = 404;
        throw error;
    }

    return result.rows[0];
};

const create = async (body = {}) => {
    const locationName = normalizeLocationName(
        body.locationName ?? body.location_name
    );

    const result = await pool.query(
        `INSERT INTO public.locations (location_name)
         VALUES ($1)
         RETURNING id, location_name, created_at, updated_at`,
        [locationName]
    );

    return result.rows[0];
};

const update = async (id, body = {}) => {
    const locationName = normalizeLocationName(
        body.locationName ?? body.location_name
    );

    const result = await pool.query(
        `UPDATE public.locations
         SET location_name = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, location_name, created_at, updated_at`,
        [locationName, id]
    );

    if (!result.rowCount) {
        const error = new Error("Location not found.");
        error.statusCode = 404;
        throw error;
    }

    return result.rows[0];
};

const remove = async (id) => {
    const result = await pool.query(
        `DELETE FROM public.locations WHERE id = $1`,
        [id]
    );

    if (!result.rowCount) {
        const error = new Error("Location not found.");
        error.statusCode = 404;
        throw error;
    }
};
const searchSuggestions = async (query) => {
    const searchTerm = String(query || "").trim();

    if (searchTerm.length < 2) {
        return [];
    }

    const params = new URLSearchParams({
        q: searchTerm,
        countrycode: "IN",
        limit: "10",
        lang: "en",
    });

    const response = await fetch(
        `https://photon.komoot.io/api/?${params.toString()}`
    );

    if (!response.ok) {
        const error = new Error("Location search service is unavailable.");
        error.statusCode = 502;
        throw error;
    }

    const result = await response.json();

    return (result.features || [])
        .filter((feature) => {
            const properties = feature.properties || {};
            return (
                properties.countrycode?.toUpperCase() === "IN" ||
                properties.country?.toLowerCase() === "india"
            );
        })
        .map((feature) => {
            const properties = feature.properties || {};

            const parts = [
                properties.name,
                properties.city,
                properties.district,
                properties.state,
                properties.postcode,
            ].filter(Boolean);

            return {
                name: properties.name || searchTerm,
                label: [...new Set(parts)].join(", "),
                state: properties.state || "",
                city: properties.city || properties.district || "",
                postcode: properties.postcode || "",
            };
        })
        .filter((item) => item.label);
};

module.exports = {
    list,
    getById,
    create,
    update,
    remove,
    searchSuggestions,
};
