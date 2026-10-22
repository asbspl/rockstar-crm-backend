const pool = require("../config/db");

const getLocations = async ({ search = "", limit = 10, offset = 0 }) => {
    const result = await pool.query(
        `SELECT id, location_name, created_at, updated_at
         FROM public.locations
         WHERE location_name ILIKE $1
         ORDER BY id DESC
         LIMIT $2 OFFSET $3`,
        [`%${search}%`, limit, offset]
    );

    return result.rows;
};

const countLocations = async (search = "") => {
    const result = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM public.locations
         WHERE location_name ILIKE $1`,
        [`%${search}%`]
    );

    return result.rows[0].total;
};

const getLocationById = async (id) => {
    const result = await pool.query(
        `SELECT id, location_name, created_at, updated_at
         FROM public.locations
         WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
};

const createLocation = async (locationName) => {
    const result = await pool.query(
        `INSERT INTO public.locations (location_name)
         VALUES ($1)
         RETURNING id, location_name, created_at, updated_at`,
        [locationName]
    );

    return result.rows[0];
};

const updateLocation = async (id, locationName) => {
    const result = await pool.query(
        `UPDATE public.locations
         SET location_name = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, location_name, created_at, updated_at`,
        [locationName, id]
    );

    return result.rows[0] || null;
};

const deleteLocation = async (id) => {
    const result = await pool.query(
        `DELETE FROM public.locations
         WHERE id = $1
         RETURNING id`,
        [id]
    );

    return result.rowCount > 0;
};

module.exports = {
    getLocations,
    countLocations,
    getLocationById,
    createLocation,
    updateLocation,
    deleteLocation,
};