
BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS employee_code VARCHAR(30),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line2 TEXT,
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pin_code VARCHAR(15),
  ADD COLUMN IF NOT EXISTS location VARCHAR(150),
  ADD COLUMN IF NOT EXISTS joining_date DATE,
  ADD COLUMN IF NOT EXISTS resignation_date DATE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS profile_picture TEXT,
  ADD COLUMN IF NOT EXISTS last_salary_slip TEXT,
  ADD COLUMN IF NOT EXISTS pan_card TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_card TEXT,
  ADD COLUMN IF NOT EXISTS resume TEXT,
  ADD COLUMN IF NOT EXISTS account_statement TEXT,
  ADD COLUMN IF NOT EXISTS experience_certificate TEXT,
  ADD COLUMN IF NOT EXISTS allotment_list TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_status_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_status_check
  CHECK (status IN ('active', 'inactive', 'resign'));

CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_code_unique
  ON public.employees(employee_code)
  WHERE employee_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS employees_name_search_idx
  ON public.employees(employee_name);

CREATE INDEX IF NOT EXISTS employees_status_idx
  ON public.employees(status);

COMMIT;
