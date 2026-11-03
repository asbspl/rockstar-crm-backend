const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMutation,
  trackPoolConnections,
} = require("../src/services/audit-query-tracker");
const { auditContext } = require("../src/services/audit-context");
const activityModel = require("../src/models/activity.model");

function createMockPool({ failedCommit = false } = {}) {
  const calls = [];
  const client = {
    query(queryConfig, values, callback) {
      if (typeof values === "function") {
        callback = values;
        values = [];
      }

      const text = typeof queryConfig === "string"
        ? queryConfig
        : queryConfig.text;
      calls.push({ text, values });
      if (/^\s*COMMIT\b/i.test(text)) {
        const result = {
          command: failedCommit ? "ROLLBACK" : "COMMIT",
          rowCount: 0,
          rows: [],
        };
        if (callback) {
          queueMicrotask(() => callback(null, result));
          return {};
        }
        return Promise.resolve(result);
      }

      if (/pg_get_serial_sequence/i.test(text)) {
        const sequence = values[0] === "public.user_roles"
          ? null
          : "public.inventory_id_seq";
        const result = { rowCount: 1, rows: [{ sequence }] };
        if (callback) {
          queueMicrotask(() => callback(null, result));
          return {};
        }
        return Promise.resolve(result);
      }

      if (/currval\(/i.test(text)) {
        const result = { rowCount: 1, rows: [{ id: 35 }] };
        if (callback) {
          queueMicrotask(() => callback(null, result));
          return {};
        }
        return Promise.resolve(result);
      }

      if (/FAIL/i.test(text)) {
        const error = new Error("database write failed");
        if (callback) {
          queueMicrotask(() => callback(error));
          return {};
        }
        return Promise.reject(error);
      }

      if (/^\s*SELECT\b/i.test(text) && /public\."inventory"/i.test(text)) {
        const result = { rowCount: 1, rows: [{ id: 12, name: "Old Widget" }] };
        if (callback) {
          queueMicrotask(() => callback(null, result));
          return {};
        }
        return Promise.resolve(result);
      }

      const result = /^\s*INSERT\b/i.test(text)
        ? {
            rowCount: 1,
            rows: /\bRETURNING\b/i.test(text)
              ? [{ id: 27, name: "Widget" }]
              : [],
          }
        : /^\s*UPDATE\b/i.test(text)
          ? { rowCount: 1, rows: [{ id: 12, name: "New Widget" }] }
          : /^\s*DELETE\b/i.test(text)
            ? { rowCount: 1, rows: [{ id: 12 }] }
          : { rowCount: 0, rows: [] };

      if (callback) {
        queueMicrotask(() => callback(null, result));
        return {};
      }
      return Promise.resolve(result);
    },
  };

  const pool = {
    connect(callback) {
      if (callback) {
        queueMicrotask(() => callback(null, client, () => {}));
        return undefined;
      }
      return Promise.resolve(client);
    },
    query(queryConfig, values, callback) {
      if (typeof values === "function") {
        callback = values;
        values = [];
      }

      if (callback) {
        this.connect((error, connectedClient) => {
          if (error) return callback(error);
          connectedClient.query(queryConfig, values, callback);
        });
        return {};
      }

      return this.connect().then((connectedClient) =>
        connectedClient.query(queryConfig, values)
      );
    },
  };

  return { pool, client, calls };
}

function requestContext() {
  return {
    req: {
      originalUrl: "/api/inventory",
      url: "/api/inventory",
      method: "POST",
      ip: "127.0.0.1",
      headers: { "user-agent": "audit-test" },
      params: {},
      body: { name: "Widget", password: "not-stored" },
      auth: {
        userId: "9",
        user: { id: 9, full_name: "Test User", email: "test@example.com" },
      },
    },
    snapshots: new Map(),
  };
}

test("recognizes application mutations and excludes audit/auth secret tables", () => {
  assert.deepEqual(
    parseMutation("INSERT INTO public.inventory (name) VALUES ($1) RETURNING id", ["x"]),
    {
      action: "CREATE",
      table: "inventory",
      text: "INSERT INTO public.inventory (name) VALUES ($1) RETURNING id",
      values: ["x"],
    }
  );
  assert.equal(parseMutation('UPDATE "public"."companies" SET name = $1 WHERE id = $2', ["x", 1]).action, "UPDATE");
  assert.equal(parseMutation("DELETE FROM public.orders WHERE id = $1", [1]).action, "DELETE");
  assert.equal(parseMutation("INSERT INTO audit_logs (action) VALUES ($1)", ["CREATE"]), null);
  assert.equal(parseMutation("UPDATE public.refresh_tokens SET revoked_at = NOW()", []), null);
});

test("captures a successful write using server-authenticated request identity", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();

  try {
    await auditContext.run(requestContext(), async () => {
      await trackPoolConnections(pool).query(
        "INSERT INTO public.inventory (name) VALUES ($1) RETURNING id, name",
        ["Widget"]
      );
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].user_id, "9");
    assert.equal(captured[0].action, "CREATE");
    assert.equal(captured[0].module, "Inventory");
    assert.equal(captured[0].entity_type, "Inventory");
    assert.equal(captured[0].record_id, "27");
    assert.equal(captured[0].status, "SUCCESS");
    assert.equal(captured[0].new_values.password, "[REDACTED]");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("resolves generated IDs when inserts omit RETURNING", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();

  try {
    await auditContext.run(requestContext(), async () => {
      await trackPoolConnections(pool).query(
        "INSERT INTO public.inventory (name) VALUES ($1)",
        ["Widget"]
      );
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].record_id, "35");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("does not assume association tables have an id column", async () => {
  const previousCreateActivity = activityModel.createActivity;
  activityModel.createActivity = async () => {};
  const { pool, calls } = createMockPool();
  const trackedPool = trackPoolConnections(pool);

  try {
    await auditContext.run(requestContext(), async () => {
      const client = await trackedPool.connect();
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM public.user_roles WHERE user_id = $1",
        [498]
      );
      await client.query(
        `INSERT INTO public.user_roles (user_id, role_id)
         SELECT $1, role_id FROM UNNEST($2::bigint[]) AS role_id`,
        [498, [4]]
      );
      await client.query("SELECT 1");
      await client.query("COMMIT");
    });

    assert.equal(
      calls.some(({ text }) =>
        /SELECT \* FROM public\."user_roles" WHERE id = \$1/i.test(text)
      ),
      false
    );
    assert.equal(
      calls.some(({ text, values }) =>
        /pg_get_serial_sequence/i.test(text) &&
        values[0] === "public.user_roles"
      ),
      true
    );
    assert.equal(
      calls.some(({ text }) => /currval\(/i.test(text)),
      false
    );
    assert.equal(calls.at(-1).text, "COMMIT");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("records deleted values as previous values without duplicating them as new values", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();

  try {
    await auditContext.run(requestContext(), async () => {
      await trackPoolConnections(pool).query(
        "DELETE FROM public.inventory WHERE id = $1 RETURNING id",
        [12]
      );
    });

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].old_values, { id: 12, name: "Old Widget" });
    assert.equal(captured[0].new_values, null);
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("writes transaction audit entries only after commit and marks rollback failed", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();
  const trackedPool = trackPoolConnections(pool);

  try {
    await auditContext.run(requestContext(), async () => {
      const client = await trackedPool.connect();
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO public.inventory (name) VALUES ($1) RETURNING id",
        ["Widget"]
      );
      assert.equal(captured.length, 0);
      await client.query("COMMIT");
      assert.equal(captured.length, 1);
      assert.equal(captured[0].status, "SUCCESS");

      await client.query("BEGIN");
      await client.query(
        "INSERT INTO public.inventory (name) VALUES ($1) RETURNING id",
        ["Widget"]
      );
      await client.query("ROLLBACK");
      assert.equal(captured.length, 2);
      assert.equal(captured[1].status, "FAILED");

      await client.query("BEGIN");
      await client.query(
        "UPDATE public.inventory SET name = $1 WHERE id = $2 RETURNING id, name",
        ["New Widget", 12]
      );
      await client.query("COMMIT");
      assert.equal(captured.length, 3);
      assert.deepEqual(captured[2].old_values, { id: 12, name: "Old Widget" });
      assert.deepEqual(captured[2].new_values, {
        name: "New Widget",
        password: "[REDACTED]",
        id: 12,
      });
    });
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("records before-and-after values for successful updates", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();
  const request = requestContext();
  request.req.method = "PUT";
  request.req.originalUrl = "/api/inventory/12";
  request.req.params.id = "12";

  try {
    await auditContext.run(request, async () => {
      await trackPoolConnections(pool).query(
        "UPDATE public.inventory SET name = $1 WHERE id = $2 RETURNING id, name",
        ["New Widget", 12]
      );
    });

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0].old_values, { id: 12, name: "Old Widget" });
    assert.deepEqual(captured[0].new_values, {
      name: "New Widget",
      password: "[REDACTED]",
      id: 12,
    });
    assert.equal(captured[0].action, "UPDATE");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("records failed database mutations as failed instead of success", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool();

  try {
    await auditContext.run(requestContext(), async () => {
      await assert.rejects(
        trackPoolConnections(pool).query(
          "INSERT INTO public.inventory /* FAIL */ (name) VALUES ($1)",
          ["Widget"]
        )
      );
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].status, "FAILED");
    assert.notEqual(captured[0].status, "SUCCESS");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});

test("does not mark a commit that PostgreSQL rolled back as successful", async () => {
  const previousCreateActivity = activityModel.createActivity;
  const captured = [];
  activityModel.createActivity = async (data) => captured.push(data);
  const { pool } = createMockPool({ failedCommit: true });

  try {
    await auditContext.run(requestContext(), async () => {
      const client = await trackPoolConnections(pool).connect();
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO public.inventory (name) VALUES ($1) RETURNING id",
        ["Widget"]
      );
      await client.query("COMMIT");
    });

    assert.equal(captured.length, 1);
    assert.equal(captured[0].status, "FAILED");
  } finally {
    activityModel.createActivity = previousCreateActivity;
  }
});
