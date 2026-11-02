
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,

    user_id BIGINT,

    user_name VARCHAR(255),
    user_email VARCHAR(255),

    action VARCHAR(50) NOT NULL,

    module VARCHAR(100) NOT NULL,

    record_id VARCHAR(100),

    description TEXT,

    old_values JSONB,
    new_values JSONB,

    ip_address VARCHAR(100),

    user_agent TEXT,

    request_method VARCHAR(10),
    request_url TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',

    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module
ON audit_logs(module);

CREATE INDEX IF NOT EXISTS idx_audit_logs_status
ON audit_logs(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id
ON audit_logs(record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
ON audit_logs(user_id, created_at DESC);
