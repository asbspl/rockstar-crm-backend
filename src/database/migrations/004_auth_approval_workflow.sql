ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(32),
  ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by BIGINT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_account_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_account_status_check
  CHECK (account_status IN ('pending', 'under_review', 'approved', 'rejected', 'suspended'));

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_phone_format_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_phone_format_check
  CHECK (phone IS NULL OR phone ~* '^[0-9+()\-\s]{8,20}$');

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  address_line1 VARCHAR(200) NOT NULL,
  address_line2 VARCHAR(200),
  location VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  city VARCHAR(120) NOT NULL,
  pin_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_kyc (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  pan_number_encrypted BYTEA,
  aadhaar_number_encrypted BYTEA,
  pan_last4 VARCHAR(4),
  aadhaar_last4 VARCHAR(4),
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.user_documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type VARCHAR(64) NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  upi_id VARCHAR(128),
  account_name VARCHAR(150),
  account_number_encrypted BYTEA NOT NULL,
  account_last4 VARCHAR(4),
  ifsc_code VARCHAR(32),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.registration_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reviewed_by BIGINT,
  decision VARCHAR(32) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.registration_reviews
  ALTER COLUMN reviewed_by DROP NOT NULL;

ALTER TABLE public.registration_reviews
  DROP CONSTRAINT IF EXISTS registration_reviews_decision_check;

ALTER TABLE public.registration_reviews
  ADD CONSTRAINT registration_reviews_decision_check
  CHECK (decision IN ('pending', 'under_review', 'approved', 'rejected'));

INSERT INTO public.permissions (key, name, description, is_active)
VALUES
  ('users.approve', 'Users Approve', 'Approve user accounts and applications.', TRUE),
  ('users.reject', 'Users Reject', 'Reject user applications and accounts.', TRUE),
  ('users.suspend', 'Users Suspend', 'Suspend or reactivate accounts.', TRUE),
  ('users.assign_role', 'Users Assign Role', 'Assign roles to users.', TRUE),
  ('users.assign_permission', 'Users Assign Permission', 'Assign permissions to roles.', TRUE),
  ('kyc.read', 'KYC Read', 'Read KYC details and review state.', TRUE),
  ('kyc.review', 'KYC Review', 'Review KYC submissions.', TRUE),
  ('kyc.download', 'KYC Download', 'Download KYC documents for review.', TRUE),
  ('settings.read', 'Settings Read', 'Read settings and access configuration.', TRUE),
  ('settings.update', 'Settings Update', 'Update settings and access configuration.', TRUE)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN (
  'users.approve', 'users.reject', 'users.suspend', 'users.assign_role', 'users.assign_permission',
  'kyc.read', 'kyc.review', 'kyc.download', 'settings.read', 'settings.update'
)
WHERE r.code = 'SUPER_ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
