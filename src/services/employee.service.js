
const employeeModel = require("../models/employee.model");

const STATUSES = ["active", "inactive", "resign"];

function validateEmployee(data, isCreate = false) {
  const required = [
    "employee_name",
    "phone",
    "email",
    "address_line1",
    "country",
    "state",
    "city",
    "pin_code",
    "location",
    "joining_date",
    "status",
  ];

  if (isCreate) {
    const missing = required.filter(
      (field) => !String(data[field] ?? "").trim()
    );

    if (missing.length) {
      const error = new Error(
        `Required fields missing: ${missing.join(", ")}`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (
    data.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)
  ) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }

  if (data.status && !STATUSES.includes(data.status)) {
    const error = new Error("Invalid employee status.");
    error.statusCode = 400;
    throw error;
  }

  if (
    data.joining_date &&
    data.resignation_date &&
    data.resignation_date < data.joining_date
  ) {
    const error = new Error(
      "Resignation date cannot be before joining date."
    );
    error.statusCode = 400;
    throw error;
  }
}

async function getEmployees(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number(query.limit) || 10)
  );

  const result = await employeeModel.list({
    search: String(query.search || "").trim(),
    status: query.status || "all",
    limit,
    offset: (page - 1) * limit,
  });

  return {
    employees: result.rows,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  };
}

async function getEmployee(id) {
  const employee = await employeeModel.findById(id);

  if (!employee) {
    const error = new Error("Employee not found.");
    error.statusCode = 404;
    throw error;
  }

  return employee;
}

async function createEmployee(data) {
  validateEmployee(data, true);
  return employeeModel.create(data);
}

async function updateEmployee(id, data) {
  await getEmployee(id);
  validateEmployee(data);
  return employeeModel.update(id, data);
}

async function changeEmployeeStatus(id, status) {
  if (!STATUSES.includes(status)) {
    const error = new Error(
      "Status must be active, inactive or resign."
    );
    error.statusCode = 400;
    throw error;
  }

  await getEmployee(id);
  return employeeModel.updateStatus(id, status);
}

async function deleteEmployee(id) {
  await getEmployee(id);
  return employeeModel.remove(id);
}

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  changeEmployeeStatus,
  deleteEmployee,
};
