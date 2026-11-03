const { auditContext } = require("./audit-context");

const clientStates = new WeakMap();
const ignoredTables = new Set([
  "audit_logs",
  "password_reset_tokens",
  "refresh_tokens",
]);

function getQuery(queryConfig, values) {
  if (typeof queryConfig === "string") {
    return { text: queryConfig, values: Array.isArray(values) ? values : [] };
  }

  if (queryConfig && typeof queryConfig.text === "string") {
    return {
      text: queryConfig.text,
      values: Array.isArray(queryConfig.values) ? queryConfig.values : [],
    };
  }

  return null;
}

function parseMutation(queryConfig, values) {
  const query = getQuery(queryConfig, values);
  if (!query) return null;

  const match = query.text.match(
    /^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?(?:(?:"?[\w]+"?)\s*\.\s*)?"?([\w]+)"?/i
  );
  if (!match) return null;

  const table = match[2].toLowerCase();
  if (ignoredTables.has(table)) return null;

  const verb = match[1].toUpperCase().replace(/\s+/g, " ");
  const action = verb.startsWith("INSERT")
    ? "CREATE"
    : verb === "UPDATE"
      ? "UPDATE"
      : "DELETE";

  return {
    action,
    table,
    text: query.text,
    values: query.values,
  };
}

function getSelectTable(queryConfig, values) {
  const query = getQuery(queryConfig, values);
  if (!query || !/^\s*SELECT\b/i.test(query.text)) return null;

  const match = query.text.match(
    /\bFROM\s+(?:(?:"?[\w]+"?)\s*\.\s*)?"?([\w]+)"?/i
  );
  return match ? match[1].toLowerCase() : null;
}

function toWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getModuleName(req, table) {
  const path = String(req.originalUrl || req.url || "").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  const modulePart = parts[0]?.toLowerCase() === "api" ? parts[1] : parts[0];
  return modulePart ? toWords(modulePart) : toWords(table);
}

function getEntityType(table) {
  const singular = table.endsWith("ies")
    ? `${table.slice(0, -3)}y`
    : table.endsWith("s") && !table.endsWith("ss")
      ? table.slice(0, -1)
      : table;
  return toWords(singular).replace(/\s/g, "");
}

function getEntityId(req, result) {
  const returnedId = result?.rows?.find(
    (row) => row?.id !== undefined && row.id !== null
  )?.id;
  return returnedId ?? req.params?.id ?? null;
}

function getIdFilter(mutation, req) {
  const whereClause = mutation.text.match(
    /\bWHERE\b([\s\S]*?)(?:\bRETURNING\b|\bORDER\s+BY\b|\bLIMIT\b|$)/i
  )?.[1];
  const idParameter = whereClause?.match(
    /(?:^|[^\w])"?id"?(?![\w])\s*=\s*\$(\d+)/i
  );
  if (!idParameter) return null;

  return mutation.values[Number(idParameter[1]) - 1] ?? req?.params?.id ?? null;
}

function getSnapshotKey(table, id) {
  return id === null || id === undefined ? null : `${table}:${id}`;
}

function getPreflightQuery(mutation, req, context) {
  if (!mutation || !["UPDATE", "DELETE"].includes(mutation.action)) return null;
  const id = getIdFilter(mutation, req);
  const key = getSnapshotKey(mutation.table, id);
  if (!key || context?.snapshots.has(key)) return null;

  return {
    key,
    id,
    text: `SELECT * FROM public."${mutation.table}" WHERE id = $1 LIMIT 1`,
  };
}

function getRequestActor(req) {
  const user = req.auth?.user || req.user || {};
  const userId = req.auth?.userId || user.id || user.user_id || null;
  if (!userId) return null;

  return {
    id: userId,
    full_name: user.full_name || user.name || null,
    email: user.email || null,
  };
}

function cacheSelectedRows(table, result) {
  const context = auditContext.getStore();
  if (!context || !table || !Array.isArray(result?.rows)) return;

  for (const row of result.rows) {
    if (row && row.id !== undefined && row.id !== null) {
      context.snapshots.set(`${table}:${row.id}`, row);
    }
  }
}

function makeActivity(context, mutation, result, status, failureMessage) {
  const req = context?.req;
  if (!req) return null;

  const actor = getRequestActor(req);
  const entityId = getEntityId(req, result);
  const oldValues =
    context.snapshots.get(getSnapshotKey(mutation.table, entityId)) || null;
  const returnedRow = result?.rows?.find((row) => row && Object.keys(row).length);
  const requestValues = req.body && Object.keys(req.body).length ? req.body : null;
  const newValues =
    mutation.action === "DELETE"
      ? null
      : { ...(requestValues || {}), ...(returnedRow || {}) };
  const moduleName = getModuleName(req, mutation.table);
  const entityType = getEntityType(mutation.table);
  const route = String(req.originalUrl || req.url || "").toLowerCase();
  let action = mutation.action;
  if (route.includes("/import")) action = "IMPORT";
  else if (route.includes("/approve")) action = "APPROVE";
  else if (route.includes("/reject")) action = "REJECT";
  else if (route.includes("/roles")) action = "ASSIGN_ROLE";
  else if (route.includes("/permissions")) action = "ASSIGN_PERMISSION";
  else if (
    mutation.action === "UPDATE" &&
    (route.includes("/status") ||
      (requestValues?.status !== undefined &&
        oldValues &&
        oldValues.status !== requestValues.status))
  ) {
    action = "STATUS_CHANGE";
  }
  const actionWord = {
    CREATE: "created",
    UPDATE: "updated",
    DELETE: "deleted",
    APPROVE: "approved",
    REJECT: "rejected",
    ASSIGN_ROLE: "changed role for",
    ASSIGN_PERMISSION: "changed permissions for",
    STATUS_CHANGE: "changed status of",
    IMPORT: "imported",
  }[action];
  const description = `${actor?.full_name || actor?.email || "System"} ${
    actionWord
  } ${entityType.toLowerCase()}`;

  return {
    req,
    user: actor,
    action,
    module: moduleName,
    entity_type: entityType,
    record_id: entityId,
    description,
    old_values: oldValues,
    new_values: newValues,
    status,
    error_message: failureMessage || null,
  };
}

function shouldSkipMutation(req) {
  const path = String(req?.originalUrl || req?.url || "").split("?")[0];
  return /^\/api\/auth\/(?:login|logout)(?:\/|$)/i.test(path);
}

async function persistActivity(activity) {
  if (!activity) return;

  try {
    const { logActivity } = require("./activity.service");
    await logActivity(activity);
  } catch (error) {
    console.error("AUDIT LOG ERROR: activity could not be persisted", {
      message: error.message,
      code: error.code || "unknown",
    });
  }
}

async function completeQuery(state, queryConfig, values, result) {
  const text = getQuery(queryConfig, values)?.text || "";

  if (/^\s*(BEGIN|START\s+TRANSACTION)\b/i.test(text)) {
    state.inTransaction = true;
    state.pending.length = 0;
    return;
  }

  if (/^\s*COMMIT\b/i.test(text)) {
    state.inTransaction = false;
    const events = state.pending.splice(0);
    const rolledBack = result?.command === "ROLLBACK";
    for (const event of events) {
      await persistActivity({
        ...event,
        auditClient: state.client,
        ...(rolledBack
          ? {
              status: "FAILED",
              error_message: "The database transaction was rolled back.",
            }
          : {}),
      });
    }
    return;
  }

  if (/^\s*ROLLBACK\b/i.test(text)) {
    state.inTransaction = false;
    const events = state.pending.splice(0);
    for (const event of events) {
      await persistActivity({
        ...event,
        auditClient: state.client,
        status: "FAILED",
        error_message: "The database transaction was rolled back.",
      });
    }
    return;
  }

  const selectTable = getSelectTable(queryConfig, values);
  if (selectTable) cacheSelectedRows(selectTable, result);

  const mutation = parseMutation(queryConfig, values);
  if (!mutation || !result?.rowCount) return;

  let activityResult = result;
  const returnedId = result.rows?.some(
    (row) => row?.id !== undefined && row.id !== null
  );
  if (mutation.action === "CREATE" && !returnedId) {
    try {
      const sequenceResult = await state.client.query(
        `SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM pg_attribute
             WHERE attrelid = to_regclass($1)
               AND attname = 'id'
               AND NOT attisdropped
           )
           THEN pg_get_serial_sequence($1, 'id')
         END AS sequence`,
        [`public.${mutation.table}`]
      );
      const sequence = sequenceResult.rows[0]?.sequence;
      if (sequence) {
        const identity = await state.client.query(
          "SELECT currval($1::regclass) AS id",
          [sequence]
        );
        if (identity.rows[0]?.id !== null && identity.rows[0]?.id !== undefined) {
          activityResult = {
            ...result,
            rows: [...(result.rows || []), { id: identity.rows[0].id }],
          };
        }
      }
    } catch (error) {
      console.error("AUDIT ENTITY ID ERROR:", {
        table: mutation.table,
        message: error.message,
        code: error.code || "unknown",
      });
    }
  }

  const context = auditContext.getStore();
  if (shouldSkipMutation(context?.req)) return;
  const activity = makeActivity(
    context,
    mutation,
    activityResult,
    "SUCCESS",
    null
  );
  if (!activity) return;

  if (state.inTransaction) {
    state.pending.push(activity);
  } else {
    await persistActivity({ ...activity, auditClient: state.client });
  }
}

async function failQuery(state, queryConfig, values) {
  const mutation = parseMutation(queryConfig, values);
  if (!mutation) return;

  const context = auditContext.getStore();
  if (shouldSkipMutation(context?.req)) return;
  const activity = makeActivity(
    context,
    mutation,
    null,
    "FAILED",
    "The database operation failed."
  );
  if (!activity) return;

  if (state.inTransaction) {
    state.pending.push(activity);
  } else {
    await persistActivity({ ...activity, auditClient: state.client });
  }
}

function trackClient(client) {
  if (!client || clientStates.has(client)) return client;
  const state = { inTransaction: false, pending: [], client };
  clientStates.set(client, state);

  const originalQuery = client.query;
  client.query = function trackedQuery(...args) {
    const queryConfig = args[0];
    const values = args[1];
    const callbackIndex = args.findIndex(
      (argument, index) => index > 0 && typeof argument === "function"
    );

    if (callbackIndex !== -1) {
      const callback = args[callbackIndex];
      args[callbackIndex] = (error, result) => {
        const completion = error
          ? failQuery(state, queryConfig, values)
          : completeQuery(state, queryConfig, values, result);
        void completion
          .catch((auditError) => {
            console.error("AUDIT TRACKER ERROR:", auditError.message);
          })
          .finally(() => callback(error, result));
      };
      return originalQuery.apply(this, args);
    }

    const mutation = parseMutation(queryConfig, values);
    const context = auditContext.getStore();
    const preflight = getPreflightQuery(mutation, context?.req, context);

    if (preflight) {
      const captureSnapshot = async () => {
        const savepoint = state.inTransaction;
        if (savepoint) {
          await originalQuery.call(this, "SAVEPOINT audit_snapshot");
        }

        try {
          const snapshot = await originalQuery.call(this, preflight.text, [
            preflight.id,
          ]);
          cacheSelectedRows(mutation.table, snapshot);
          if (savepoint) {
            await originalQuery.call(this, "RELEASE SAVEPOINT audit_snapshot");
          }
        } catch (error) {
          if (savepoint) {
            try {
              await originalQuery.call(
                this,
                "ROLLBACK TO SAVEPOINT audit_snapshot"
              );
              await originalQuery.call(
                this,
                "RELEASE SAVEPOINT audit_snapshot"
              );
            } catch (rollbackError) {
              console.error("AUDIT SNAPSHOT RECOVERY ERROR:", {
                table: mutation.table,
                message: rollbackError.message,
              });
            }
          }
          console.error("AUDIT SNAPSHOT ERROR:", {
            table: mutation.table,
            message: error.message,
          });
        }
      };

      return captureSnapshot()
        .then(() => originalQuery.apply(this, args))
        .then(
          async (queryResult) => {
            try {
              await completeQuery(state, queryConfig, values, queryResult);
            } catch (error) {
              console.error("AUDIT TRACKER ERROR:", error.message);
            }
            return queryResult;
          },
          async (error) => {
            try {
              await failQuery(state, queryConfig, values);
            } catch (auditError) {
              console.error("AUDIT TRACKER ERROR:", auditError.message);
            }
            throw error;
          }
        );
    }

    const result = originalQuery.apply(this, args);
    if (!result || typeof result.then !== "function") return result;

    return result.then(
      async (queryResult) => {
        try {
          await completeQuery(state, queryConfig, values, queryResult);
        } catch (error) {
          console.error("AUDIT TRACKER ERROR:", error.message);
        }
        return queryResult;
      },
      async (error) => {
        try {
          await failQuery(state, queryConfig, values);
        } catch (auditError) {
          console.error("AUDIT TRACKER ERROR:", auditError.message);
        }
        throw error;
      }
    );
  };

  return client;
}

function trackPoolConnections(pool) {
  const originalPoolQuery = pool.query.bind(pool);
  pool.query = function trackedPoolQuery(...args) {
    const queryConfig = args[0];
    const values = args[1];
    const callbackIndex = args.findIndex(
      (argument, index) => index > 0 && typeof argument === "function"
    );
    const context = auditContext.getStore();
    const mutation = parseMutation(queryConfig, values);
    const preflight = getPreflightQuery(mutation, context?.req, context);

    if (!preflight || callbackIndex !== -1) {
      return originalPoolQuery(...args);
    }

    return originalPoolQuery(preflight.text, [preflight.id])
      .catch((error) => {
        console.error("AUDIT SNAPSHOT ERROR:", {
          table: mutation.table,
          message: error.message,
        });
      })
      .then(() => originalPoolQuery(...args));
  };

  const originalConnect = pool.connect.bind(pool);
  pool.connect = function trackedConnect(...args) {
    const callbackIndex = args.findIndex(
      (argument) => typeof argument === "function"
    );

    if (callbackIndex !== -1) {
      const callback = args[callbackIndex];
      args[callbackIndex] = (error, client, release) => {
        if (client) trackClient(client);
        callback(error, client, release);
      };
      return originalConnect(...args);
    }

    return originalConnect(...args).then((client) => trackClient(client));
  };
  return pool;
}

module.exports = {
  parseMutation,
  trackPoolConnections,
};
