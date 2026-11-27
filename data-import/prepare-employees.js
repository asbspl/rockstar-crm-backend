const XLSX = require("xlsx");
const { spawnSync } = require("child_process");

const file = process.env.USERPROFILE + "\\Downloads\\pratik Rough.xlsx";
const workbook = XLSX.readFile(file);
const sheet = workbook.Sheets["Employee"];

if (!sheet) throw new Error("Employee sheet not found");

const normalize = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const source = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

const rows = source.map(r => {
  const obj = {};
  for (const [k, v] of Object.entries(r)) obj[normalize(k)] = String(v ?? "").trim();

  const statusText = (obj.employeestatus || "active").toLowerCase();

  return {
    employee_name: obj.employeename || "",
    employee_code: obj.employeeid || "",
    phone: obj.employeephoneno || "",
    email: obj.employeeemailid || "",
    address_line1: obj.employeeaddressline1 || "",
    location: obj.location || "",
    status: statusText === "inactive" ? "inactive" :
            statusText === "resign" ? "resign" : "active"
  };
}).filter(r => r.employee_name && r.employee_code);

if (!rows.length) throw new Error("No valid employee records found");

const codes = new Set();
for (const r of rows) {
  if (codes.has(r.employee_code)) {
    throw new Error("Duplicate Employee ID inside Excel: " + r.employee_code);
  }
  codes.add(r.employee_code);
}

console.log("Excel employee records:", rows.length);
console.log("Employee sample:", rows.slice(0, 3));
console.log("Excel validation successful. No database changes made yet.");
