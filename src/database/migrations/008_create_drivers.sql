
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS driver_full_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(30),
  ADD COLUMN IF NOT EXISTS contact_no VARCHAR(15),
  ADD COLUMN IF NOT EXISTS aadhar_card_document TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_registration_document TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_drivers_vehicle_number
  ON public.drivers (vehicle_number);

CREATE INDEX IF NOT EXISTS idx_drivers_contact_no
  ON public.drivers (contact_no);
