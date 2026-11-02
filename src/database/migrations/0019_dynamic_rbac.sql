CREATE TABLE IF NOT EXISTS public.permission_modules (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS module_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.permissions'::regclass
      AND conname = 'permissions_module_id_fkey'
  ) THEN
    ALTER TABLE public.permissions
      ADD CONSTRAINT permissions_module_id_fkey
      FOREIGN KEY (module_id)
      REFERENCES public.permission_modules(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

INSERT INTO public.permission_modules (key, name)
SELECT DISTINCT
  COALESCE(NULLIF(lower(split_part(p.key, '.', 1)), ''), 'general'),
  initcap(replace(COALESCE(NULLIF(split_part(p.key, '.', 1), ''), 'General'), '_', ' '))
FROM public.permissions p
ON CONFLICT (key) DO NOTHING;

UPDATE public.permissions p
SET module_id = m.id
FROM public.permission_modules m
WHERE p.module_id IS NULL
  AND m.key = COALESCE(NULLIF(lower(split_part(p.key, '.', 1)), ''), 'general');

ALTER TABLE public.permissions
  ALTER COLUMN module_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_permissions_module_id
  ON public.permissions (module_id);

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  effect VARCHAR(8) NOT NULL DEFAULT 'grant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT user_permissions_effect_check CHECK (effect IN ('grant', 'deny'))
);

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS effect VARCHAR(8) NOT NULL DEFAULT 'grant';

ALTER TABLE public.user_permissions
  DROP CONSTRAINT IF EXISTS user_permissions_effect_check;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_effect_check
  CHECK (effect IN ('grant', 'deny'));

CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id
  ON public.user_permissions (permission_id);

INSERT INTO public.permissions (key, name, description, module_id, is_active)
SELECT seed.key, seed.name, seed.description, modules.id, TRUE
FROM (
  VALUES
    ('users.permissions.read', 'User Permissions Read', 'View user permission overrides and effective permissions.', 'users'),
    ('users.permissions.update', 'User Permissions Update', 'Update user permission overrides.', 'users'),
    ('roles.delete', 'Roles Delete', 'Delete roles that are not assigned to users.', 'roles'),
    ('permissions.create', 'Permissions Create', 'Create permission definitions.', 'permissions'),
    ('permissions.update', 'Permissions Update', 'Update permission definitions.', 'permissions'),
    ('permissions.deactivate', 'Permissions Deactivate', 'Activate or deactivate permission definitions.', 'permissions'),
    ('modules.manage', 'Modules Manage', 'Create and manage permission modules.', 'modules')
) AS seed(key, name, description, module_key)
JOIN public.permission_modules modules ON modules.key = seed.module_key
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    module_id = EXCLUDED.module_id,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'SUPER_ADMIN'
  AND p.key IN (
    'users.permissions.read',
    'users.permissions.update',
    'roles.delete',
    'permissions.create',
    'permissions.update',
    'permissions.deactivate',
    'modules.manage'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p
  ON p.key IN (
    'users.assign_role',
    'users.permissions.read',
    'users.permissions.update'
  )
WHERE r.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;
