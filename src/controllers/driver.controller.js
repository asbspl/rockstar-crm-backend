
const driverModel = require("../models/driver.model");

const fields = [
  "driver_full_name",
  "vehicle_number",
  "contact_no",
  "vehicle_type",
];

function validate(data, isUpdate = false) {
  for (const field of fields) {
    if (!String(data[field] || "").trim()) {
      if (isUpdate) continue;
      return `${field.replaceAll("_", " ")} is required`;
    }
  }

  if (!["Active", "Inactive"].includes(data.status)) {
    return "Please select a valid status: Active or Inactive";
  }

  if (data.contact_no && !/^\d{10}$/.test(data.contact_no.trim())) {
    return "Contact number must contain 10 digits";
  }

  if (data.vehicle_number && data.vehicle_number.length > 30) {
    return "Vehicle number is too long";
  }

  return null;
}

function filePath(file) {
  return file ? `/uploads/drivers/${file.filename}` : null;
}

function getData(req, existing = {}) {
  return {
    driver_full_name: String(
      req.body.driver_full_name ?? existing.driver_full_name ?? ""
    ).trim(),

    vehicle_number: String(
      req.body.vehicle_number ?? existing.vehicle_number ?? ""
    ).trim().toUpperCase(),

    contact_no: String(
      req.body.contact_no ?? existing.contact_no ?? ""
    ).trim(),

    vehicle_type: String(
      req.body.vehicle_type ?? existing.vehicle_type ?? ""
    ).trim(),

    status:
      req.body.status !== undefined
        ? String(req.body.status).trim()
        : existing.status ?? "",

    aadhar_card_document:
      filePath(req.files?.aadhar_card_document?.[0]) ||
      existing.aadhar_card_document ||
      null,

    vehicle_registration_document:
      filePath(req.files?.vehicle_registration_document?.[0]) ||
      existing.vehicle_registration_document ||
      null,
  };
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
  );

  const result = await driverModel.list({
    search: String(req.query.search || ""),
    page,
    limit,
  });

  res.json({ success: true, data: result });
});

exports.getById = asyncHandler(async (req, res) => {
  const driver = await driverModel.findById(req.params.id);

  if (!driver) {
    return res.status(404).json({ message: "Driver not found" });
  }

  res.json({ success: true, data: driver });
});

exports.create = asyncHandler(async (req, res) => {
  const data = getData(req);
  const error = validate(data);

  if (error) {
    return res.status(400).json({ message: error });
  }

  if (!data.aadhar_card_document ||
      !data.vehicle_registration_document) {
    return res.status(400).json({
      message: "Aadhaar Card and Vehicle Registration Document are required",
    });
  }

  const driver = await driverModel.create(data);

  res.status(201).json({
    success: true,
    message: "Driver created successfully",
    data: driver,
  });
});

exports.update = asyncHandler(async (req, res) => {
  const existing = await driverModel.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Driver not found" });
  }

  const data = getData(req, existing);
  const error = validate(data);

  if (error) {
    return res.status(400).json({ message: error });
  }

  const driver = await driverModel.update(req.params.id, data);

  res.json({
    success: true,
    message: "Driver updated successfully",
    data: driver,
  });
});

exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!["Active", "Inactive"].includes(status)) {
    return res.status(400).json({
      message: "Status must be Active or Inactive",
    });
  }

  const driver = await driverModel.updateStatus(req.params.id, status);

  if (!driver) {
    return res.status(404).json({ message: "Driver not found" });
  }

  res.json({
    success: true,
    message: "Driver status updated",
    data: driver,
  });
});

exports.remove = asyncHandler(async (req, res) => {
  const deleted = await driverModel.softDelete(req.params.id);

  if (!deleted) {
    return res.status(404).json({ message: "Driver not found" });
  }

  res.json({ success: true, message: "Driver deleted successfully" });
});
