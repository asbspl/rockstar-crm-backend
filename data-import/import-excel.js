
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const COLUMN_MAPPINGS = {
  companies: {
    "Company Name": "company_name",
    "Phone": "phone",
    "Email": "email",
    "Address Line 1": "address_line1",
    "Address Line 2": "address_line2",
    "Country": "country",
    "State": "state",
    "City": "city",
    "Pin Code": "pin_code",
    "Company Logo": "company_logo",
    "Company Signature": "company_signature",
    "Bank Details": "bank_details",
    "Terms and Conditions": "terms_and_conditions",
    "PAN Number": "pan_number",
    "PAN Document": "pan_document",
    "GST Number": "gst_number",
    "GST Certificate": "gst_certificate",
    "Status": "status"
  },
  clients: {
    "Client Name": "client_name",
    "Client Code": "client_code",
    "Phone": "phone",
    "Client Phone": "client_phone",
    "Email": "email",
    "Client Email": "client_email",

    "Address / Line-1": "address_line1",
    "Line-2": "address_line2",
    "Country": "country",
    "State": "state",
    "City": "city",
    "Pin Code": "pin_code",
    "Location": "location",

    "Addition Date": "addition_date",
    "Client Addition Date": "client_addition_date",

    "GSTIN": "gstin",
    "Client GSTIN": "client_gstin",
    "Contact Person": "contact_person",

    "Status": "status",
    "Client Status": "client_status",
    "Credit Days": "credit_days",

    "Assigned Employee": "assigned_employee",
    "Under Employee ID": "under_employee_id",

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

    "GST Document": "gst_document_path"
  },
  employees: {
    "Employee Name": "employee_name",
    "Employee ID": "employee_code",
    "Employee Phone No": "phone",
    "Employee Email ID": "email",
    "Employee Address / Line-1": "address_line1",
    "Line-2": "address_line2",
    "Country": "country",
    "State": "state",
    "City": "city",
    "Pin Code": "pin_code",
    "Location": "location",
    "Employee Joining Date": "joining_date",
    "Employee Resignation Date": "resignation_date",
    "Employee Status": "status",
    "Profile Picture": "profile_picture",
    "Last Salary Slip": "last_salary_slip",
    "PAN Card": "pan_card",
    "Aadhaar Card": "aadhar_card",
    "Resume": "resume",
    "Account Statement": "account_statement",
    "Experience Certificate": "experience_certificate",
    "Allotment List": "allotment_list",
  },
  contractors: {
    "Contractor Name": "name",
    "Name": "name",

    "Phone": "phone",
    "Contact Number": "phone",
    "Email": "email",

    "Address / Line-1": "address_line1",
    "Address Line 1": "address_line1",
    "Line-2": "address_line2",
    "Address Line 2": "address_line2",

    "Location": "location",
    "State": "state",
    "City": "city",
    "Pin Code": "pin_code",

    "PAN Card": "pan_card",
    "PAN Card Document": "pan_card_document",

    "Aadhaar Card": "aadhaar_card",
    "Aadhaar Card Document": "aadhaar_card_document",

    "Payment UPI": "payment_upi",

    "Account Name": "account_name",
    "Account Number": "account_number",
    "IFSC Code": "ifsc_code",

    "Status": "status"
  },
  drivers: {
    "Driver Full Name": "driver_full_name",
    "Vehicle Number": "vehicle_number",
    "Contact Number": "contact_no",
    "Type of Vehicle": "vehicle_type",
    "Status": "status",
    "Aadhaar Card": "aadhar_card_document",
    "Vehicle Registration Document": "vehicle_registration_document",
  },
  customers: {
    "Customer Name": "customer_name",

    "Client ID": "client_id",
    "Location ID": "location_id",

    "Phone": "phone",
    "Customer Phone": "phone",

    "Email": "email",
    "Customer Email": "email",

    "Address / Line-1": "address_line1",
    "Address Line 1": "address_line1",
    "Line-2": "address_line2",
    "Address Line 2": "address_line2",

    "Country": "country",
    "State": "state",
    "City": "city",
    "Pin Code": "pin_code",

    "Contact Person": "contact_person",
    "Status": "status",

    "Under Employee ID": "under_employee_id",

    "Visiting Card Front": "visiting_card_front",
    "Visiting Card Back": "visiting_card_back",

    "Shop Front": "shop_front",
    "Shop Back": "shop_back",

    "Location Name": "location_name",
    "Location Mode": "location_mode",
    "Location Address": "location_address",
    "Location Latitude": "location_latitude",
    "Location Longitude": "location_longitude",
    "Location Map URL": "location_map_url",

    "Vehicle Tracking Reference": "vehicle_tracking_reference"
  },
  products: {
    "Product Code": "product_code",
    "Product Name": "product_name",
    "Unit": "unit",
    "Product Description": "product_description",
    "HSN Code": "hsn_code",
    "Standard Rate": "standard_rate",
    "Status": "status",
    "Product Image": "product_image"
  },
  locations: {
    "Location Name": "location_name"
  },
  sites: {
    "Site Name": "site_name",
    "Customer ID": "customer_id",
    "Location ID": "location_id",
    "Contact Person": "contact_person",
    "Contact Number": "contact_number",
    "Address Line 1": "line_1",
    "Address Line 2": "line_2",
    "Country": "India",
    "State": "maharashtra",
    "City": "(city)",
    "Pin Code": "pin_code",
    "Site Location Mode": "site_location_mode",
    "Site Location Name": "site_location_name",
    "Site Location Address": "site_location_address",
    "Site Location Latitude": "site_location_latitude",
    "Site Location Longitude": "site_location_longitude",
    "Site Location Map URL": "site_location_map_url",
    "Vehicle Tracking Reference": "vehicle_tracking_reference"
  },
rate_matrices: {
    "Client Name": "client_id",
    "Site Name": "site_id",
    "Customer Name": "customer_id",
    "Area": "location_id",
    "Product Name": "product_id",
    "Rate": "rate"
},
  quotations: {
    "Quotation No": "quotation_no",
    "Company ID": "company_id",
    "Client ID": "client_id",
    "Customer ID": "customer_id",
    "Site ID": "site_id",
    "Location ID": "location_id",
    "Quotation Date": "quotation_date",
    "Expiry Date": "expiry_date",
    "Reference": "reference",
    "Comment": "comment",
    "Total Amount": "total_amount",
    "Grand Total": "grand_total",
    "Status": "status"
  },
  quotation_items: {
    "Quotation ID": "quotation_id",
    "Product ID": "product_id",
    "Unit": "unit",
    "Quantity": "quantity",
    "Rate Incl GST": "rate_incl_gst",
    "Amount": "amount"
  },
  orders: {
    "PI No": "pino",
    "DC No": "dcsno",
    "Company ID": "company_id",
    "Client ID": "client_id",
    "Customer ID": "customer_id",
    "Customer Site Name": "customer_site_name",
    "Location ID": "location_id",
    "Proforma Date": "proforma_date",
    "Expected Shipping Date": "expected_shipping_date",
    "Reference": "reference",
    "Comment": "comment",
    "Image 1": "image1",
    "Image 2": "image2",
    "Image 3": "image3",
    "Image 4": "image4",
    "Subtotal": "subtotal",
    "Total Discount": "total_discount",
    "Grand Total": "grand_total",
    "Status": "status",
    "Dispatch Status": "dispatch_status",
    "Dispatch Date": "dispatch_date",
    "Company Name": "company_name",
    "Client Name": "client_name",
    "Customer Name": "customer_name",
    "Location Name": "location_name",
    "Dispatch Sequence No": "dispatch_sequence_no",
    "Driver ID": "driver_id",
    "Driver Name": "driver_name",
    "Vehicle No": "vehicle_no",
    "Vehicle Type": "vehicle_type",
    "Contact": "contact",
    "Site ID": "site_id"
  },
  order_items: {
    "Order ID": "order_id",
    "Product ID": "product_id",
    "Product Name": "product_name",
    "Unit": "unit",
    "Quantity": "quantity",
    "Rate Incl GST": "rate_incl_gst",
    "Discount": "discount",
    "Amount": "amount"
  },
};

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function normalizeDate(value, XLSX) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`Invalid Excel date: ${value}`);
    return [
      parsed.y,
      String(parsed.m).padStart(2, "0"),
      String(parsed.d).padStart(2, "0"),
    ].join("-");
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${text}`);
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
}

async function main() {
  const tableName = process.argv[2];
  const excelFile = process.argv[3];

  if (!tableName || !excelFile) {
    throw new Error(
      "Usage: node data-import/import-excel.js <table_name> <excel_file>"
    );
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error("Invalid table name.");
  }

  const filePath = path.resolve(process.cwd(), excelFile);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel file not found: ${filePath}`);
  }

  const client = new Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
        host: process.env.DB_HOST || process.env.PGHOST || "localhost",
        port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
        database:
          process.env.DB_NAME ||
          process.env.DB_DATABASE ||
          process.env.PGDATABASE,
        user: process.env.DB_USER || process.env.PGUSER,
        password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
      }
  );

  let transactionStarted = false;

  try {
    await client.connect();
    console.log("Database connected!");
    console.log(`Target table: public.${tableName}`);

    const tableResult = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default,
              is_identity, is_generated
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName]
    );

    if (tableResult.rows.length === 0) {
      throw new Error(`Table public.${tableName} not found.`);
    }

    const dbColumns = tableResult.rows;
    const dbColumnMap = new Map(
      dbColumns.map((column) => [normalize(column.column_name), column])
    );

    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (rows.length < 2) {
      throw new Error("Excel file has no data rows.");
    }

    const headers = rows[0].map((header) => String(header ?? "").trim());
    const customMapping = COLUMN_MAPPINGS[tableName] || {};

    const mappedHeaders = headers.map((header) => {
      if (!header) return null;

      const mappedName = customMapping[header];

      if (mappedName) {
        const column = dbColumnMap.get(normalize(mappedName));
        if (!column) {
          throw new Error(
            `Mapping error: "${header}" points to missing DB column "${mappedName}".`
          );
        }
        return column;
      }

      const exactColumn = dbColumnMap.get(normalize(header));

      if (!exactColumn) {
        throw new Error(
          `Excel column "${header}" does not match any database column. ` +
          `Add its mapping in COLUMN_MAPPINGS for table "${tableName}".`
        );
      }

      return exactColumn;
    });

    const dataRows = rows.slice(1).filter((row) =>
      row.some((value) => !isEmpty(value))
    );

    if (dataRows.length === 0) {
      throw new Error("No non-empty data rows found.");
    }

    await client.query("BEGIN");
    transactionStarted = true;

    // Automatically generate IDs for tables where id has no default.
    const idColumn = dbColumns.find(
      (column) => normalize(column.column_name) === "id"
    );

    const idIsRequired =
      idColumn &&
      idColumn.is_nullable === "NO" &&
      !idColumn.column_default &&
      idColumn.is_identity === "NO" &&
      idColumn.is_generated === "NEVER";

    const excelHasId = mappedHeaders.some(
      (column) => column && normalize(column.column_name) === "id"
    );

    let nextId = null;

    if (idIsRequired && !excelHasId) {
      await client.query(
        `LOCK TABLE public.${quoteIdentifier(tableName)} IN SHARE ROW EXCLUSIVE MODE`
      );

      const maxResult = await client.query(
        `SELECT COALESCE(MAX(${quoteIdentifier(idColumn.column_name)}), 0) + 1 AS next_id
         FROM public.${quoteIdentifier(tableName)}`
      );

      nextId = Number(maxResult.rows[0].next_id);
    }

  
    let inserted = 0;
    const importedRateMatrixKeys = new Set();

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const excelRow = dataRows[rowIndex];
      const rowNumber = rowIndex + 2;
      const record = {};

      if (tableName === "rate_matrices") {
        const getExcelValue = (headerName) => {
          const index = headers.findIndex(
            (header) => normalize(header) === normalize(headerName)
          );

          if (index === -1) {
            throw new Error(
              `Required Excel column "${headerName}" not found.`
            );
          }

          return excelRow[index];
        };

        const clientName = String(getExcelValue("Client Name") ?? "").trim();
        const customerName = String(getExcelValue("Customer Name") ?? "").trim();
        const siteName = String(getExcelValue("Site Name") ?? "").trim();
        const areaName = String(getExcelValue("Area") ?? "").trim();
        const excelProductName = String(getExcelValue("Product Name") ?? "").trim();
        const rateValue = getExcelValue("Rate");

        if (
          !clientName ||
          !customerName ||
          !siteName ||
          !areaName ||
          !excelProductName ||
          isEmpty(rateValue)
        ) {
          throw new Error(
            `Row ${rowNumber}: One or more required Excel values are missing.`
          );
        }

        const normalizeSQL = (value) => normalize(value);

        // 1. Resolve Client ID.
        const clientResult = await client.query(
          `SELECT id
           FROM public.clients
           WHERE regexp_replace(LOWER(BTRIM(client_name)), '[^a-z0-9]', '', 'g') = $1`,
          [normalizeSQL(clientName)]
        );

        if (clientResult.rows.length !== 1) {
          throw new Error(
            `Row ${rowNumber}: Client "${clientName}" not found uniquely.`
          );
        }

        const clientId = clientResult.rows[0].id;

        // 2. Resolve Customer ID under selected Client.
        const customerResult = await client.query(
          `SELECT id
           FROM public.customers
           WHERE regexp_replace(LOWER(BTRIM(customer_name)), '[^a-z0-9]', '', 'g') = $1
             AND client_id = $2`,
          [normalizeSQL(customerName), clientId]
        );

        if (customerResult.rows.length !== 1) {
          throw new Error(
            `Row ${rowNumber}: Customer "${customerName}" not found uniquely under client "${clientName}".`
          );
        }

        const customerId = customerResult.rows[0].id;

        // 3. Resolve Site ID under selected Customer.
        const siteResult = await client.query(
          `SELECT id
           FROM public.sites
           WHERE regexp_replace(LOWER(BTRIM(site_name)), '[^a-z0-9]', '', 'g') = $1
             AND customer_id = $2
           ORDER BY id`,
          [normalizeSQL(siteName), customerId]
        );

        if (siteResult.rows.length === 0) {
          throw new Error(
            `Row ${rowNumber}: Site "${siteName}" not found under customer "${customerName}".`
          );
        }

        // Confirmed selections for duplicate site names.
        const siteOverrides = {
          "2|aaijicrystalawing": "2",
          "5|anandmindspaceresidencyphase1": "5",
        };

        const siteKey = `${customerId}|${normalizeSQL(siteName)}`;
        let siteId;

        if (siteResult.rows.length === 1) {
          siteId = siteResult.rows[0].id;
        } else if (siteOverrides[siteKey]) {
          const selectedSite = siteResult.rows.find(
            (site) => String(site.id) === siteOverrides[siteKey]
          );

          if (!selectedSite) {
            throw new Error(
              `Row ${rowNumber}: Selected site ID ${siteOverrides[siteKey]} not found.`
            );
          }

          siteId = selectedSite.id;
        } else {
          throw new Error(
            `Row ${rowNumber}: Multiple sites found for "${siteName}" under "${customerName}".`
          );
        }

        // 4. Resolve Location ID.
        // Confirmed: Vadgaon Budruk maps to Vadgaon ID 77.
        const locationName =
          normalizeSQL(areaName) === "vadgaonbudruk"
            ? "Vadgaon"
            : areaName;

        const locationResult = await client.query(
          `SELECT id
           FROM public.locations
           WHERE regexp_replace(LOWER(BTRIM(location_name)), '[^a-z0-9]', '', 'g') = $1`,
          [normalizeSQL(locationName)]
        );

        if (locationResult.rows.length !== 1) {
          throw new Error(
            `Row ${rowNumber}: Location "${areaName}" not found uniquely.`
          );
        }

        const locationId = locationResult.rows[0].id;

        if (
          normalizeSQL(areaName) === "vadgaonbudruk" &&
          String(locationId) !== "77"
        ) {
          throw new Error(
            `Row ${rowNumber}: Vadgaon Budruk must map to confirmed location ID 77.`
          );
        }

        // 5. Resolve Product ID.
        // Remove Excel prefixes such as B40_ and B20_.
        const productName = excelProductName
          .replace(/^[A-Z]+\d+_/i, "")
          .trim();

        const productResult = await client.query(
          `SELECT id
           FROM public.products
           WHERE regexp_replace(LOWER(BTRIM(product_name)), '[^a-z0-9]', '', 'g') = $1`,
          [normalizeSQL(productName)]
        );

        if (productResult.rows.length !== 1) {
          throw new Error(
            `Row ${rowNumber}: Product "${excelProductName}" not found uniquely.`
          );
        }

        const productId = productResult.rows[0].id;

        // 6. Validate Rate.
        const rate = Number(
          String(rateValue).replace(/,/g, "").trim()
        );

        if (!Number.isFinite(rate) || rate < 0) {
          throw new Error(
            `Row ${rowNumber}: Invalid rate "${rateValue}".`
          );
        }

        // 7. Check duplicate combination inside Excel.
        const duplicateKey = [
          clientId,
          customerId,
          siteId,
          locationId,
          productId,
        ].join("|");

        if (importedRateMatrixKeys.has(duplicateKey)) {
          throw new Error(
            `Row ${rowNumber}: Duplicate Rate Matrix combination found inside Excel.`
          );
        }

        // 8. Check existing LIVE database record.
        const existingResult = await client.query(
          `SELECT id
           FROM public.rate_matrices
           WHERE client_id = $1
             AND customer_id = $2
             AND site_id = $3
             AND location_id = $4
             AND product_id = $5
           LIMIT 1`,
          [clientId, customerId, siteId, locationId, productId]
        );

        if (existingResult.rows.length > 0) {
          throw new Error(
            `Row ${rowNumber}: Rate Matrix already exists in database (ID ${existingResult.rows[0].id}).`
          );
        }

        importedRateMatrixKeys.add(duplicateKey);

        // Final database record.
        record.client_id = clientId;
        record.customer_id = customerId;
        record.site_id = siteId;
        record.location_id = locationId;
        record.product_id = productId;
        record.rate = rate;

      } else {
        // Existing import logic for all other tables.
        for (let i = 0; i < mappedHeaders.length; i++) {
          const column = mappedHeaders[i];
          const value = excelRow[i];

          if (!column || isEmpty(value)) continue;

          let finalValue = value;

          // Automatically resolve Customer Name to Customer ID for sites.
          if (
            tableName === "sites" &&
            normalize(headers[i]) === "customername"
          ) {
            const customerName = String(value).trim();

            const customerResult = await client.query(
              `SELECT id
               FROM public.customers
               WHERE LOWER(BTRIM(customer_name)) = LOWER(BTRIM($1))`,
              [customerName]
            );

            if (customerResult.rows.length === 0) {
              throw new Error(
                `Row ${rowNumber}: Customer "${customerName}" not found in database.`
              );
            }

            if (customerResult.rows.length > 1) {
              throw new Error(
                `Row ${rowNumber}: Multiple customers found with name "${customerName}".`
              );
            }

            finalValue = customerResult.rows[0].id;
          }

          if (column.data_type === "date") {
            finalValue = normalizeDate(value, XLSX);
          }

          if (
            tableName === "employees" &&
            column.column_name === "status"
          ) {
            finalValue = String(value).trim().toLowerCase();

            if (!["active", "inactive", "resign"].includes(finalValue)) {
              throw new Error(
                `Row ${rowNumber}: Invalid employee status "${value}". Use Active, Inactive or Resign.`
              );
            }
          }

          record[column.column_name] = finalValue;
        }
      }

      // Automatically generate ID if required.
      if (idIsRequired && !excelHasId) {
        record[idColumn.column_name] = nextId++;
      }

      // Validate required database columns.
      for (const column of dbColumns) {
        const generated =
          column.is_identity !== "NO" ||
          column.is_generated !== "NEVER";

        if (
          column.is_nullable === "NO" &&
          !column.column_default &&
          !generated &&
          isEmpty(record[column.column_name])
        ) {
          throw new Error(
            `Row ${rowNumber}: Required database column "${column.column_name}" is missing.`
          );
        }
      }

      const insertColumns = Object.keys(record);

      if (insertColumns.length === 0) {
        continue;
      }

      const values = insertColumns.map((column) => record[column]);
      const columnSQL = insertColumns.map(quoteIdentifier).join(", ");
      const placeholders = values
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      await client.query(
        `INSERT INTO public.${quoteIdentifier(tableName)}
         (${columnSQL})
         VALUES (${placeholders})`,
        values
      );

      inserted++;
      console.log(`Imported row ${rowNumber}`);
    }

    await client.query("COMMIT");
    transactionStarted = false;

    console.log("--------------------------------");
    console.log("IMPORT SUCCESSFUL");
    console.log(`Rows imported: ${inserted}`);
    console.log(`Table: public.${tableName}`);
    console.log("--------------------------------");

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
      console.log("Transaction rolled back. No partial import retained.");
    }

    console.error("\nIMPORT FAILED:", error.message);
    process.exitCode = 1;

  } finally {
    await client.end();
  }
}

main();
