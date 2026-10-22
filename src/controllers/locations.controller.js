const locationService = require("../services/location.service");

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

const list = asyncHandler(async (req, res) => {
    const result = await locationService.list(req.query);

    res.status(200).json({
        success: true,
        message: "Locations fetched successfully.",
        data: result.locations,
        pagination: result.pagination,
    });
});

const getById = asyncHandler(async (req, res) => {
    const location = await locationService.getById(req.params.id);

    res.status(200).json({
        success: true,
        message: "Location fetched successfully.",
        data: location,
    });
});

const create = asyncHandler(async (req, res) => {
    const location = await locationService.create(req.body);

    res.status(201).json({
        success: true,
        message: "Location created successfully.",
        data: location,
    });
});

const update = asyncHandler(async (req, res) => {
    const location = await locationService.update(
        req.params.id,
        req.body
    );

    res.status(200).json({
        success: true,
        message: "Location updated successfully.",
        data: location,
    });
});

const remove = asyncHandler(async (req, res) => {
    await locationService.remove(req.params.id);

    res.status(200).json({
        success: true,
        message: "Location deleted successfully.",
    });
});
const search = asyncHandler(async (req, res) => {
    const suggestions = await locationService.searchSuggestions(
        req.query.q
    );

    res.status(200).json({
        success: true,
        data: suggestions,
    });
});

module.exports = { list, getById, create, update, remove, search, };