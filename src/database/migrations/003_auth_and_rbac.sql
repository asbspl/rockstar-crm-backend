CREATE TABLE IF NOT EXISTS public.roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id BIGINT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  jti VARCHAR(128),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_id BIGINT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, token_hash)
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, token_hash)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON public.refresh_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON public.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON public.password_reset_tokens (expires_at);

INSERT INTO public.roles (code, name, description, is_active)
VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Full system administration across all modules.', TRUE),
  ('ADMIN', 'Admin', 'Operational administration with bounded administrative privileges.', TRUE),
  ('MANAGER', 'Manager', 'Team-scoped operational oversight and approvals when granted.', TRUE),
  ('SALES_EXECUTIVE', 'Sales Executive', 'Assigned account and sales access across customer and quotation workflows.', TRUE),
  ('ACCOUNTS', 'Accounts', 'Financial workflow and billing access.', TRUE),
  ('READ_ONLY', 'Read Only', 'Read-only access to approved modules.', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.permissions (key, name, description, is_active)
VALUES
  ('dashboard.read', 'Dashboard Read', 'View dashboard summary and metrics.', TRUE),
  ('users.read', 'Users Read', 'Read users and their permissions.', TRUE),
  ('users.create', 'Users Create', 'Create new users.', TRUE),
  ('users.update', 'Users Update', 'Update user details.', TRUE),
  ('users.deactivate', 'Users Deactivate', 'Deactivate or reactivate users.', TRUE),
  ('roles.read', 'Roles Read', 'View roles.', TRUE),
  ('roles.create', 'Roles Create', 'Create roles.', TRUE),
  ('roles.update', 'Roles Update', 'Update roles.', TRUE),
  ('roles.assign', 'Roles Assign', 'Assign roles to users.', TRUE),
  ('permissions.read', 'Permissions Read', 'View permissions.', TRUE),
  ('permissions.assign', 'Permissions Assign', 'Assign permissions to roles.', TRUE),
  ('company.read', 'Company Read', 'View company settings.', TRUE),
  ('company.update', 'Company Update', 'Update company settings.', TRUE),
  ('employees.read', 'Employees Read', 'View employee records.', TRUE),
  ('employees.create', 'Employees Create', 'Create employee records.', TRUE),
  ('employees.update', 'Employees Update', 'Update employee records.', TRUE),
  ('drivers.read', 'Drivers Read', 'View driver records.', TRUE),
  ('drivers.create', 'Drivers Create', 'Create driver records.', TRUE),
  ('drivers.update', 'Drivers Update', 'Update driver records.', TRUE),
  ('contractors.read', 'Contractors Read', 'View contractor records.', TRUE),
  ('contractors.create', 'Contractors Create', 'Create contractor records.', TRUE),
  ('contractors.update', 'Contractors Update', 'Update contractor records.', TRUE),
  ('customers.read', 'Customers Read', 'View customer records.', TRUE),
  ('customers.create', 'Customers Create', 'Create customer records.', TRUE),
  ('customers.update', 'Customers Update', 'Update customer records.', TRUE),
  ('dealers.read', 'Dealers Read', 'View dealer records.', TRUE),
  ('dealers.create', 'Dealers Create', 'Create dealer records.', TRUE),
  ('dealers.update', 'Dealers Update', 'Update dealer records.', TRUE),
  ('sites.read', 'Sites Read', 'View site records.', TRUE),
  ('sites.create', 'Sites Create', 'Create site records.', TRUE),
  ('sites.update', 'Sites Update', 'Update site records.', TRUE),
  ('samples.read', 'Samples Read', 'View sample records.', TRUE),
  ('samples.create', 'Samples Create', 'Create sample records.', TRUE),
  ('samples.update', 'Samples Update', 'Update sample records.', TRUE),
  ('testing.read', 'Testing Read', 'View testing records.', TRUE),
  ('testing.create', 'Testing Create', 'Create testing records.', TRUE),
  ('testing.update', 'Testing Update', 'Update testing records.', TRUE),
  ('quotations.read', 'Quotations Read', 'View quotations.', TRUE),
  ('quotations.create', 'Quotations Create', 'Create quotations.', TRUE),
  ('quotations.update', 'Quotations Update', 'Update quotations.', TRUE),
  ('quotations.approve', 'Quotations Approve', 'Approve quotations.', TRUE),
  ('orders.read', 'Orders Read', 'View orders.', TRUE),
  ('orders.create', 'Orders Create', 'Create orders.', TRUE),
  ('orders.update', 'Orders Update', 'Update orders.', TRUE),
  ('dispatch.read', 'Dispatch Read', 'View dispatch records.', TRUE),
  ('dispatch.update', 'Dispatch Update', 'Update dispatch records.', TRUE),
  ('challans.read', 'Challans Read', 'View challans.', TRUE),
  ('challans.create', 'Challans Create', 'Create challans.', TRUE),
  ('challans.update', 'Challans Update', 'Update challans.', TRUE),
  ('invoices.read', 'Invoices Read', 'View invoices.', TRUE),
  ('invoices.create', 'Invoices Create', 'Create invoices.', TRUE),
  ('invoices.update', 'Invoices Update', 'Update invoices.', TRUE),
  ('payments.read', 'Payments Read', 'View payment records.', TRUE),
  ('payments.record', 'Payments Record', 'Record payments.', TRUE),
  ('payments.approve', 'Payments Approve', 'Approve payments.', TRUE),
  ('visits.read', 'Visits Read', 'View customer visits.', TRUE),
  ('visits.create', 'Visits Create', 'Create customer visits.', TRUE),
  ('visits.update', 'Visits Update', 'Update customer visits.', TRUE),
  ('queries.read', 'Queries Read', 'View support queries.', TRUE),
  ('queries.create', 'Queries Create', 'Create support queries.', TRUE),
  ('queries.update', 'Queries Update', 'Update support queries.', TRUE),
  ('reports.read', 'Reports Read', 'View reports.', TRUE),
  ('reports.export', 'Reports Export', 'Export reports.', TRUE),
  ('audit_logs.read', 'Audit Logs Read', 'View audit logs.', TRUE)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON 1 = 1
WHERE rm.code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON pm.key IN (
  'dashboard.read', 'users.read', 'users.create', 'users.update', 'users.deactivate',
  'roles.read', 'roles.create', 'roles.update', 'roles.assign',
  'permissions.read', 'permissions.assign',
  'company.read', 'company.update',
  'employees.read', 'employees.create', 'employees.update',
  'drivers.read', 'drivers.create', 'drivers.update',
  'contractors.read', 'contractors.create', 'contractors.update',
  'customers.read', 'customers.create', 'customers.update',
  'dealers.read', 'dealers.create', 'dealers.update',
  'sites.read', 'sites.create', 'sites.update',
  'samples.read', 'samples.create', 'samples.update',
  'testing.read', 'testing.create', 'testing.update',
  'quotations.read', 'quotations.create', 'quotations.update', 'quotations.approve',
  'orders.read', 'orders.create', 'orders.update',
  'dispatch.read', 'dispatch.update',
  'challans.read', 'challans.create', 'challans.update',
  'invoices.read', 'invoices.create', 'invoices.update',
  'payments.read', 'payments.record', 'payments.approve',
  'visits.read', 'visits.create', 'visits.update',
  'queries.read', 'queries.create', 'queries.update',
  'reports.read', 'reports.export',
  'audit_logs.read'
)
WHERE rm.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON pm.key IN (
  'dashboard.read', 'company.read', 'employees.read', 'drivers.read', 'contractors.read',
  'customers.read', 'dealers.read', 'sites.read', 'samples.read', 'testing.read',
  'quotations.read', 'orders.read', 'dispatch.read', 'challans.read',
  'invoices.read', 'payments.read', 'visits.read', 'queries.read', 'reports.read'
)
WHERE rm.code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON pm.key IN (
  'dashboard.read', 'customers.read', 'customers.create', 'customers.update',
  'dealers.read', 'dealers.create', 'dealers.update', 'sites.read', 'sites.create', 'sites.update',
  'samples.read', 'samples.create', 'samples.update', 'testing.read', 'testing.create', 'testing.update',
  'quotations.read', 'quotations.create', 'quotations.update', 'orders.read', 'orders.create', 'orders.update',
  'visits.read', 'visits.create', 'visits.update', 'queries.read', 'queries.create', 'queries.update'
)
WHERE rm.code = 'SALES_EXECUTIVE'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON pm.key IN (
  'dashboard.read', 'payments.read', 'payments.record', 'payments.approve',
  'invoices.read', 'invoices.create', 'invoices.update', 'reports.read', 'reports.export'
)
WHERE rm.code = 'ACCOUNTS'
ON CONFLICT (role_id, permission_id) DO NOTHING;

WITH role_map AS (
  SELECT id AS role_id, code FROM public.roles
), permission_map AS (
  SELECT id AS permission_id, key FROM public.permissions
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rm.role_id, pm.permission_id
FROM role_map rm
JOIN permission_map pm ON pm.key IN (
  'dashboard.read', 'company.read', 'employees.read', 'drivers.read', 'contractors.read',
  'customers.read', 'dealers.read', 'sites.read', 'samples.read', 'testing.read',
  'quotations.read', 'orders.read', 'dispatch.read', 'challans.read', 'invoices.read',
  'payments.read', 'visits.read', 'queries.read', 'reports.read'
)
WHERE rm.code = 'READ_ONLY'
ON CONFLICT (role_id, permission_id) DO NOTHING;
