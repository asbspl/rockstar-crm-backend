
const employeeService = require("../services/employee.service");

const FILE_FIELDS = [
  "profile_picture",
  "last_salary_slip",
  "pan_card",
  "aadhar_card",
  "resume",
  "account_statement",
  "experience_certificate",
  "allotment_list",
];

function getPayload(req) {
  const data = { ...req.body };

  // Convert uploaded files into paths saved in PostgreSQL.
  for (const field of FILE_FIELDS) {
    if (req.files?.[field]?.[0]) {
      data[field] = `/uploads/employees/${req.files[field][0].filename}`;
    }
  }

  // Do not accept arbitrary object keys from the client.
const allowed = [
  "employee_code",
  "employee_name",
  "phone",
  "email",
  "address_line1",
  "address_line2",
  "country",
  "state",
  "city",
  "pin_code",
  "location",
  "joining_date",
  "resignation_date",
  "status",
  ...FILE_FIELDS,
];

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.includes(key))
  );
}

function handleError(res, error) {
  const status = error.statusCode || 500;

  if (status >= 500) {
    console.error("Employee API error:", error);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500 ? "An internal server error occurred." : error.message,
  });
}

function createEmployeesController() {
  return {
    async list(req, res) {
      try {
        const result = await employeeService.getEmployees(req.query);
        return res.json({
          success: true,
          message: "Employees fetched successfully.",
          data: result,
        });
      } catch (error) {
        return handleError(res, error);
      }
    },

    async getById(req, res) {
      try {
        const employee = await employeeService.getEmployee(req.params.id);
        return res.json({
          success: true,
          message: "Employee fetched successfully.",
          data: employee,
        });
      } catch (error) {
        return handleError(res, error);
      }
    },

    async create(req, res) {
      try {
        const employee = await employeeService.createEmployee(
          getPayload(req)
        );

        return res.status(201).json({
          success: true,
          message: "Employee created successfully.",
          data: employee,
        });
      } catch (error) {
        return handleError(res, error);
      }
    },

    async update(req, res) {
      try {
        const employee = await employeeService.updateEmployee(
          req.params.id,
          getPayload(req)
        );

        return res.json({
          success: true,
          message: "Employee updated successfully.",
          data: employee,
        });
      } catch (error) {
        return handleError(res, error);
      }
    },

    async updateStatus(req, res) {
      try {
        const employee = await employeeService.changeEmployeeStatus(
          req.params.id,
          req.body.status
        );

        return res.json({
          success: true,
          message: "Employee status updated successfully.",
          data: employee,
        });
      } catch (error) {
        return handleError(res, error);
      }
    },

    async remove(req, res) {
      try {
        await employeeService.deleteEmployee(req.params.id);
        return res.json({
          success: true,
          message: "Employee deleted successfully.",
        });
      } catch (error) {
        return handleError(res, error);
      }
    },
  };
}

module.exports = createEmployeesController;
