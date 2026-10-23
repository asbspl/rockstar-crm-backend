-- BACK UP your database and inspect public.clients before applying.

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS client_code VARCHAR(40),
    ADD COLUMN IF NOT EXISTS client_name VARCHAR(180),
    ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS client_email VARCHAR(254),
    ADD COLUMN IF NOT EXISTS address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS address_line2 TEXT,
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS state VARCHAR(120),
    ADD COLUMN IF NOT EXISTS city VARCHAR(120),
    ADD COLUMN IF NOT EXISTS pin_code VARCHAR(12),
    ADD COLUMN IF NOT EXISTS location_name VARCHAR(180),
    ADD COLUMN IF NOT EXISTS location_mode VARCHAR(30) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS location_address TEXT,
    ADD COLUMN IF NOT EXISTS location_latitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS location_longitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS location_map_url TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_tracking_reference TEXT,
    ADD COLUMN IF NOT EXISTS client_addition_date DATE,
    ADD COLUMN IF NOT EXISTS client_gstin VARCHAR(20),
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(180),
    ADD COLUMN IF NOT EXISTS client_status VARCHAR(20) NOT NULL DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS credit_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS under_employee_id INTEGER,
    ADD COLUMN IF NOT EXISTS delivery_challan_provided BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS gst_document_path TEXT,
    ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS pan_document_path TEXT,
    ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12),
    ADD COLUMN IF NOT EXISTS aadhaar_document_path TEXT,
    ADD COLUMN IF NOT EXISTS dealer_registration_number TEXT,
    ADD COLUMN IF NOT EXISTS dealer_registration_document_path TEXT,
    ADD COLUMN IF NOT EXISTS visiting_card_path TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS clients_client_code_unique_idx
    ON public.clients (client_code)
    WHERE client_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_client_name_idx
    ON public.clients (client_name);

CREATE INDEX IF NOT EXISTS clients_client_status_idx
    ON public.clients (client_status);