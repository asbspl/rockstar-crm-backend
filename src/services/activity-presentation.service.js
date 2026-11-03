const tableOverrides = {
    company: "companies",
    client: "clients",
    customer: "customers",
    site: "sites",
    location: "locations",
    product: "products",
    employee: "employees",
    driver: "drivers",
    contractor: "contractors",
    user: "users",
    role: "roles",
    permission: "permissions",
    quotation: "quotations",
    order: "orders",
};

const moduleTableOverrides = {
    quotations: {
        company_id: "companies",
        client_id: "clients",
        customer_id: "customers",
        location_id: "locations",
        product_id: "products",
        site_id: "sites",
    },
};

const metadataCache = new Map();

function parseStoredValue(value) {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return "Details unavailable";
    }
}

function getTableName(field, module = "") {
    const moduleKey = String(module).toLowerCase().replace(/[^a-z0-9]/g, "");
    const moduleTable = moduleTableOverrides[moduleKey]?.[field.toLowerCase()];
    if (moduleTable) return moduleTable;

    const singular = field.slice(0, -3).toLowerCase();
    if (tableOverrides[singular]) return tableOverrides[singular];
    if (singular.endsWith("y")) return `${singular.slice(0, -1)}ies`;
    if (singular.endsWith("s")) return singular;
    return `${singular}s`;
}

function collectForeignKeys(value, keysByTable, module) {
    value = parseStoredValue(value);
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
        value.forEach((item) => collectForeignKeys(item, keysByTable, module));
        return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        if (/_id$/i.test(key) && nestedValue !== null && nestedValue !== undefined) {
            const table = getTableName(key, module);
            if (!keysByTable.has(table)) keysByTable.set(table, new Set());
            keysByTable.get(table).add(String(nestedValue));
        } else if (nestedValue && typeof nestedValue === "object") {
            collectForeignKeys(nestedValue, keysByTable, module);
        }
    }
}

async function getDisplayColumn(table, query) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
        throw new Error("Invalid activity lookup table name.");
    }

    if (!metadataCache.has(table)) {
        metadataCache.set(
            table,
            query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1`,
                [table]
            ).then((result) => {
                const columns = new Set(result.rows.map((row) => row.column_name));
                const singular = table.endsWith("ies")
                    ? `${table.slice(0, -3)}y`
                    : table.endsWith("s")
                        ? table.slice(0, -1)
                        : table;
                const candidates = [
                    `${singular}_name`,
                    "full_name",
                    "name",
                    `${singular}_no`,
                    "title",
                    "code",
                    "email",
                ];
                return candidates.find((candidate) => columns.has(candidate)) || null;
            })
        );
    }

    try {
        return await metadataCache.get(table);
    } catch (error) {
        metadataCache.delete(table);
        throw error;
    }
}

function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

async function getLookupValues(table, ids, query) {
    const displayColumn = await getDisplayColumn(table, query);
    if (!displayColumn || !/^[a-z_][a-z0-9_]*$/i.test(table)) return new Map();

    const result = await query(
        `SELECT id::text AS id,
                NULLIF(BTRIM(${quoteIdentifier(displayColumn)}::text), '') AS label
         FROM public.${quoteIdentifier(table)}
         WHERE id::text = ANY($1::text[])`,
        [ids]
    );

    return new Map(
        result.rows
            .filter((row) => row.label !== null && row.label !== undefined)
            .map((row) => [String(row.id), String(row.label)])
    );
}

function replaceForeignKeys(value, lookups, module) {
    value = parseStoredValue(value);
    if (Array.isArray(value)) {
        return value.map((item) => replaceForeignKeys(item, lookups, module));
    }
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => {
            if (/_id$/i.test(key)) {
                if (nestedValue === null || nestedValue === undefined || nestedValue === "") {
                    return [key, null];
                }
                const table = getTableName(key, module);
                const resolved = lookups.get(table)?.get(String(nestedValue));
                return [key, resolved || "Name unavailable"];
            }
            return [key, replaceForeignKeys(nestedValue, lookups, module)];
        })
    );
}

async function enrichActivities(activities, query) {
    let executeQuery = query;
    if (!executeQuery) {
        const pool = require("../config/db");
        executeQuery = pool.query.bind(pool);
    }
    const rows = Array.isArray(activities) ? activities : [activities];
    const keysByTable = new Map();

    for (const activity of rows) {
        collectForeignKeys(activity?.old_values, keysByTable, activity?.module);
        collectForeignKeys(activity?.new_values, keysByTable, activity?.module);
    }

    const lookupEntries = await Promise.all(
        [...keysByTable.entries()].map(async ([table, ids]) => [
            table,
            await getLookupValues(table, [...ids], executeQuery),
        ])
    );
    const lookups = new Map(lookupEntries);

    const enriched = rows.map((activity) => ({
        ...activity,
        resolved_old_values: replaceForeignKeys(
            activity?.old_values,
            lookups,
            activity?.module
        ),
        resolved_new_values: replaceForeignKeys(
            activity?.new_values,
            lookups,
            activity?.module
        ),
    }));

    return Array.isArray(activities) ? enriched : enriched[0];
}

module.exports = {
    enrichActivities,
    getTableName,
};
