
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");

// Use Rockstar CRM's actual database configuration
const pool = require("../src/config/db");

const COLUMN_MAPPINGS = {
  "Client Name": "client_name",
  "Client Code": "client_code",
  "Phone": "phone",
  "Client Phone": "client_phone",
  "Email": "email",
  "Client Email": "client_email",
  "Address / Line-1": "address_line1",
  "Address Line 1": "address_line1",
  "Line-2": "address_line2",
  "Address Line 2": "address_line2",
  "Country": "country",
  "State": "state",
  "City": "city",
  "Pin Code": "pin_code",
  "Location": "location",
  "GSTIN": "gstin",
  "Client GSTIN": "client_gstin",
  "Contact Person": "contact_person",
  "Client Status": "client_status",
  "Status": "status",
  "Assigned Employee": "assigned_employee",
  "Under Employee ID": "under_employee_id",
  "Credit Days": "credit_days",
  "Delivery Challan Provided": "delivery_challan_provided",
  "Location Name": "location_name",
  "Location Mode": "location_mode",
  "Location Address": "location_address",
  "Location Latitude": "location_latitude",
  "Location Longitude": "location_longitude",
  "Location Map URL": "location_map_url",
  "Vehicle Tracking Reference": "vehicle_tracking_reference",
  "PAN Number": "pan_number",
  "PAN Document": "pan_document_path",
  "Aadhaar Number": "aadhaar_number",
  "Aadhaar Document": "aadhaar_document_path",
  "Dealer Registration Number": "dealer_registration_number",
  "Dealer Registration Document": "dealer_registration_document_path",
  "Visiting Card Front": "visiting_card_front",
  "Visiting Card Back": "visiting_card_back_path",
  "GST Document": "gst_document_path",
  "Addition Date": "addition_date",
  "Client Addition Date": "client_addition_date"
};

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isEmpty(value) {
  return value === null ||
    value === undefined ||
    String(value).trim() === "";
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function convertValue(value, column, rowNumber) {
  if (isEmpty(value)) return null;

  if (column === "client_status") {
    let status = String(value).trim();

    if (status.toLowerCase() === "close") {
      status = "Inactive";
    }

    const allowed = ["Active", "Hold", "Inactive"];

    const matched = allowed.find(
      item => item.toLowerCase() === status.toLowerCase()
    );

    if (!matched) {
      throw new Error(
        `Excel row ${rowNumber}: Invalid Client Status "${value}".`
      );
    }

    return matched;
  }

  if (column === "status") {
    return String(value).trim().toLowerCase();
  }

  if (column === "credit_days") {
    const number = Number(value);

    if (!Number.isInteger(number) || number < 0) {
      throw new Error(
        `Excel row ${rowNumber}: Invalid Credit Days "${value}".`
      );
    }

    return number;
  }

  if (column === "under_employee_id") {
    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
      throw new Error(
        `Excel row ${rowNumber}: Invalid Under Employee ID "${value}".`
      );
    }

    return number;
  }

  if (
    column === "location_latitude" ||
    column === "location_longitude"
  ) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error(
        `Excel row ${rowNumber}: Invalid ${column} "${value}".`
      );
    }

    return number;
  }

  if (column === "delivery_challan_provided") {
    if (typeof value === "boolean") return value;

    const text = String(value).trim().toLowerCase();

    if (["yes", "true", "1"].includes(text)) return true;
    if (["no", "false", "0"].includes(text)) return false;

    throw new Error(
      `Excel row ${rowNumber}: Invalid Delivery Challan Provided "${value}".`
    );
  }

  return String(value).trim();
}

async function main() {
  const excelFile = process.argv[2];

  if (!excelFile) {
    throw new Error(
      "Usage: node data-import/import-clients-live.js <excel_file>"
    );
  }

  const filePath = path.resolve(process.cwd(), excelFile);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true
  });

  if (rows.length < 2) {
    throw new Error("Excel file has no data rows.");
  }

  const headers = rows[0].map(value => String(value ?? "").trim());

  const ignoredHeaders = [];
  const mappedHeaders = headers.map(header => {
    if (!header) return null;

    const mappedColumn = COLUMN_MAPPINGS[header];

    if (!mappedColumn) {
      ignoredHeaders.push(header);
      return null;
    }

    return mappedColumn;
  });

  const dataRows = rows.slice(1).filter(row =>
    row.some(value => !isEmpty(value))
  );

  if (dataRows.length === 0) {
    throw new Error("No non-empty client records found.");
  }

  if (!mappedHeaders.includes("client_name")) {
    throw new Error('Excel must contain a "Client Name" column.');
  }

  console.log("Excel file:", path.basename(filePath));
  console.log("Records found:", dataRows.length);

  if (ignoredHeaders.length) {
    console.log("Skipped Excel columns:", [...new Set(ignoredHeaders)]);
  }

  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable,
             column_default, is_identity, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clients'
      ORDER BY ordinal_position
    `);

    if (!tableInfo.rows.length) {
      throw new Error("public.clients table not found.");
    }

    const dbColumns = tableInfo.rows;
    const dbColumnNames = new Set(
      dbColumns.map(column => normalize(column.column_name))
    );

    for (const column of mappedHeaders) {
      if (column && !dbColumnNames.has(normalize(column))) {
        throw new Error(`Database column not found: ${column}`);
      }
    }

    const idColumn = dbColumns.find(
      column => column.column_name === "id"
    );

    if (
      !idColumn ||
      idColumn.is_nullable !== "NO" ||
      idColumn.column_default ||
      idColumn.is_identity !== "NO"
    ) {
      throw new Error(
        "Unexpected ID configuration. Import stopped safely."
      );
    }

    await client.query(
      'LOCK TABLE public.clients IN SHARE ROW EXCLUSIVE MODE'
    );

    const maxResult = await client.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM public.clients'
    );

    let nextId = Number(maxResult.rows[0].next_id);
    let inserted = 0;

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const excelRow = dataRows[rowIndex];
      const rowNumber = rowIndex + 2;
      const record = {};

      for (let i = 0; i < mappedHeaders.length; i++) {
        const column = mappedHeaders[i];
        const value = excelRow[i];

        if (!column || isEmpty(value)) continue;

        record[column] = convertValue(value, column, rowNumber);
      }

      if (isEmpty(record.client_name)) {
        throw new Error(
          `Excel row ${rowNumber}: Client Name is required.`
        );
      }

      record.id = nextId++;

      const insertColumns = Object.keys(record);
      const values = insertColumns.map(column => record[column]);

      const columnSQL = insertColumns
        .map(quoteIdentifier)
        .join(", ");

      const placeholders = values
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      await client.query(
        `INSERT INTO public.clients (${columnSQL})
         VALUES (${placeholders})`,
        values
      );

      inserted++;

      if (inserted % 50 === 0) {
        console.log(`Processed ${inserted} records...`);
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const countResult = await client.query(
      "SELECT COUNT(*) AS total FROM public.clients"
    );

    console.log("----------------------------------");
    console.log("CLIENT IMPORT SUCCESSFUL");
    console.log("Imported records:", inserted);
    console.log("Total clients in live table:", countResult.rows[0].total);
    console.log("----------------------------------");

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("CLIENT IMPORT FAILED:", error.message);
    console.error("All changes from this import were rolled back.");
    process.exitCode = 1;

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("IMPORT ERROR:", error.message);
  process.exitCode = 1;
  pool.end();
});
