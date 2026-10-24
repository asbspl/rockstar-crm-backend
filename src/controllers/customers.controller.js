
const customerService = require("../services/customer.service");

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const allowedFields = [
    "customer_name",
    "client_id",
    "location_id",
    "phone",
    "email",
    "address_line1",
    "address_line2",
    "country",
    "state",
    "city",
    "pin_code",
    "contact_person",
    "status",
    "under_employee_id",
    "location_name",
    "location_mode",
    "location_address",
    "location_latitude",
    "location_longitude",
    "location_map_url",
    "vehicle_tracking_reference",
    "visiting_card_front",
    "visiting_card_back",
    "shop_front",
    "shop_back",
];

const fileFields = [
    "visiting_card_front",
    "visiting_card_back",
    "shop_front",
    "shop_back",
];

function pickFields(source, fields) {
    const result = {};

    for (const field of fields) {
        if (
            source &&
            Object.prototype.hasOwnProperty.call(source, field)
        ) {
            result[field] = source[field];
        }
    }

    return result;
}


function addUploadedFilePaths(data, req) {
    const fileFields = [
        "visiting_card_front",
        "visiting_card_back",
        "shop_front",
        "shop_back",
    ];

    for (const field of fileFields) {
        const file = req.files?.[field]?.[0];

        if (file?.filename) {
            data[field] = `uploads/customers/${file.filename}`;
        } else {
            delete data[field];
        }
    }

    return data;
}


exports.list = asyncHandler(async (req, res) => {
    const result = await customerService.listCustomers({
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
    });

    res.json({
        success: true,
        message: "Customers fetched successfully.",
        data: result.rows,
        pagination: result.pagination,
    });
});

exports.getById = asyncHandler(async (req, res) => {
    const customer = await customerService.getCustomerById(req.params.id);

    if (!customer) {
        return res.status(404).json({
            success: false,
            message: "Customer not found.",
        });
    }

    res.json({
        success: true,
        message: "Customer fetched successfully.",
        data: customer,
    });
});

exports.create = asyncHandler(async (req, res) => {
    const data = pickFields(req.body, allowedFields);

    addUploadedFilePaths(data, req);

    const customer = await customerService.createCustomer(data);

    res.status(201).json({
        success: true,
        message: "Customer created successfully.",
        data: customer,
    });
});

exports.update = asyncHandler(async (req, res) => {
    const data = pickFields(req.body, allowedFields);

    addUploadedFilePaths(data, req);

    const customer = await customerService.updateCustomer(
        req.params.id,
        data
    );

    if (!customer) {
        return res.status(404).json({
            success: false,
            message: "Customer not found.",
        });
    }

    res.json({
        success: true,
        message: "Customer updated successfully.",
        data: customer,
    });
});

exports.remove = asyncHandler(async (req, res) => {
    const customer = await customerService.deleteCustomer(req.params.id);

    if (!customer) {
        return res.status(404).json({
            success: false,
            message: "Customer not found.",
        });
    }

    res.json({
        success: true,
        message: "Customer deleted successfully.",
        data: customer,
    });
});
