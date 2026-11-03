const test = require("node:test");
const assert = require("node:assert/strict");
const { enrichActivities } = require("../src/services/activity-presentation.service");

test("resolves foreign keys in nested activity values without exposing missing IDs", async () => {
  const query = async (text, values) => {
    if (text.includes("information_schema.columns")) {
      const columnsByTable = {
        companies: ["id", "company_name"],
        products: ["id", "product_name"],
      };
      return {
        rows: (columnsByTable[values[0]] || []).map((column_name) => ({ column_name })),
      };
    }

    const table = text.includes('public."companies"') ? "companies" : "products";
    const labels = {
      companies: { "3": "Acme Materials" },
      products: { "7": "Steel Pipe" },
    }[table];
    return {
      rows: values[0]
        .filter((id) => labels[id])
        .map((id) => ({ id, label: labels[id] })),
    };
  };

  const [activity] = await enrichActivities([{
    old_values: {
      company_id: 3,
      quotation_items: [{ id: 10, product_id: 7, quantity: 2 }],
    },
    new_values: {
      company_id: 4,
      quotation_items: [{ id: 10, product_id: 7, quantity: 3 }],
    },
  }], query);

  assert.equal(activity.resolved_old_values.company_id, "Acme Materials");
  assert.equal(activity.resolved_new_values.company_id, "Name unavailable");
  assert.equal(
    activity.resolved_old_values.quotation_items[0].product_id,
    "Steel Pipe"
  );
  assert.equal(activity.resolved_new_values.quotation_items[0].quantity, 3);
});
