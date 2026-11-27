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

if (!rows.length) throw new Error("No employee records found");

const codes = new Set();
for (const r of rows) {
  if (codes.has(r.employee_code)) {
    throw new Error("Duplicate Employee ID in Excel: " + r.employee_code);
  }
  codes.add(r.employee_code);
}

const remoteScript = String.raw`
const { Client } = require("pg");
require("dotenv").config();

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => input += chunk);

process.stdin.on("end", async () => {
  const rows = JSON.parse(input);
  const db = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  try {
    await db.connect();
    await db.query("BEGIN");
    await db.query("LOCK TABLE public.employees IN EXCLUSIVE MODE");

    const existing = await db.query(
      "SELECT employee_code FROM public.employees WHERE employee_code = ANY($1::varchar[])",
      [rows.map(r => r.employee_code)]
    );

    const existingCodes = new Set(existing.rows.map(r => r.employee_code));

    const maxResult = await db.query(
      "SELECT COALESCE(MAX(id), 0) AS max_id FROM public.employees"
    );

    let nextId = Number(maxResult.rows[0].max_id) + 1;
    let inserted = 0;
    let skipped = 0;

    for (const r of rows) {
      if (existingCodes.has(r.employee_code)) {
        skipped++;
        continue;
      }

      await db.query(
        "INSERT INTO public.employees " +
        "(id, employee_name, employee_code, phone, email, address_line1, location, status) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          nextId++,
          r.employee_name,
          r.employee_code,
          r.phone || null,
          r.email || null,
          r.address_line1 || null,
          r.location || null,
          r.status
        ]
      );

      inserted++;
    }

    await db.query("COMMIT");

    console.log("IMPORT SUCCESS");
    console.log("Excel records:", rows.length);
    console.log("Inserted:", inserted);
    console.log("Skipped existing IDs:", skipped);
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("IMPORT FAILED:", e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
});
`;

const quote = s => "'" + s.replace(/'/g, "'\\''") + "'";
const remoteCommand =
  "cd /home/decospaa/rockstar-crm-staging/backend && node -e " +
  quote(remoteScript);

console.log("Excel records:", rows.length);
console.log("Connecting to staging...");

const result = spawnSync(
  "ssh",
  ["decospaa@66.116.197.16", remoteCommand],
  {
    input: JSON.stringify(rows),
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"]
  }
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error("Import failed. See SSH/database error above.");
}
