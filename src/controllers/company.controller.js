
const companyModel = require("../models/company.model");

function getUploadedPath(files, fieldName) {
  const file = files?.[fieldName]?.[0];
  return file ? `uploads/companies/${file.filename}` : null;
}

function validateCompanyBody(body) {
  const requiredFields = [
    ["companyName", "Company Name"],
    ["phone", "Phone"],
    ["email", "Email ID"],
    ["addressLine1", "Address / Line-1"],
    ["country", "Country"],
    ["state", "State"],
    ["city", "City"],
    ["pinCode", "Pin Code"],
    ["bankDetails", "Bank Details"],
    ["termsAndConditions", "Terms And Conditions"],
    ["panNumber", "PAN Card number"],
    ["gstNumber", "GST number"],
  ];

  for (const [field, label] of requiredFields) {
    if (!String(body[field] || "").trim()) {
      return `${label} is required.`;
    }
  }

  const email = String(body.email).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email address.";
  }

  const phone = String(body.phone).trim();

  if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
    return "Enter a valid phone number.";
  }

  return null;
}

function getCompanyData(body, files = {}, existing = null) {
  return {
    companyName: String(body.companyName).trim(),
    phone: String(body.phone).trim(),
    email: String(body.email).trim().toLowerCase(),
    addressLine1: String(body.addressLine1).trim(),
    addressLine2: String(body.addressLine2 || "").trim(),
    country: String(body.country).trim(),
    state: String(body.state).trim(),
    city: String(body.city).trim(),
    pinCode: String(body.pinCode).trim(),
    bankDetails: String(body.bankDetails).trim(),
    termsAndConditions: String(body.termsAndConditions).trim(),
    panNumber: String(body.panNumber).trim().toUpperCase(),
    gstNumber: String(body.gstNumber).trim().toUpperCase(),

    // Keep the existing document path if no replacement is uploaded.
    companyLogo:
      getUploadedPath(files, "companyLogo") ||
      existing?.company_logo ||
      null,
    companySignature:
      getUploadedPath(files, "companySignature") ||
      existing?.company_signature ||
      null,
    panDocument:
      getUploadedPath(files, "panDocument") ||
      existing?.pan_document ||
      null,
    gstCertificate:
      getUploadedPath(files, "gstCertificate") ||
      existing?.gst_certificate ||
      null,
  };
}

async function listCompanies(req, res, next) {
  try {
    const search = String(req.query.search || "").trim();

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const offset = (page - 1) * limit;

    const [companies, total] = await Promise.all([
      companyModel.listCompanies({ search, limit, offset }),
      companyModel.countCompanies(search),
    ]);

    res.status(200).json({
      success: true,
      data: {
        companies,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createCompany(req, res, next) {
  try {
    const body = req.body || {};
    const validationError = validateCompanyBody(body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const files = req.files || {};

    const companyLogo = getUploadedPath(files, "companyLogo");
    const companySignature = getUploadedPath(
      files,
      "companySignature"
    );
    const panDocument = getUploadedPath(files, "panDocument");
    const gstCertificate = getUploadedPath(
      files,
      "gstCertificate"
    );

    if (
      !companyLogo ||
      !companySignature ||
      !panDocument ||
      !gstCertificate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Company logo, signature, PAN document and GST certificate are required.",
      });
    }

    const company = await companyModel.createCompany({
      ...getCompanyData(body, files),
      companyLogo,
      companySignature,
      panDocument,
      gstCertificate,
    });

    return res.status(201).json({
      success: true,
      message: "Company created successfully.",
      data: { company },
    });
  } catch (error) {
    next(error);
  }
}

async function updateCompany(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID.",
      });
    }

    const existing = await companyModel.getCompanyById(id);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    const body = req.body || {};
    const validationError = validateCompanyBody(body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const data = getCompanyData(body, req.files || {}, existing);
    const company = await companyModel.updateCompany(id, data);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Company updated successfully.",
      data: { company },
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCompany(req, res, next) {
  try {
    const id = Number.parseInt(req.params.id, 10);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID.",
      });
    }

    const company = await companyModel.deleteCompany(id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Company deleted successfully.",
      data: { id: company.id },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
};
