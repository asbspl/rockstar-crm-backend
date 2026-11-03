const { AsyncLocalStorage } = require("async_hooks");

const auditContext = new AsyncLocalStorage();

function auditContextMiddleware(req, res, next) {
  auditContext.run({ req, snapshots: new Map() }, next);
}

module.exports = {
  auditContext,
  auditContextMiddleware,
};
