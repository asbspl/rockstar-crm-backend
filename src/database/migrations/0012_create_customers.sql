ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS client_id INTEGER,
    ADD COLUMN IF NOT EXISTS location_id INTEGER,

    -- Contact information
    ADD COLUMN IF NOT EXISTS phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS address_line2 TEXT,
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pin_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(200),

    -- Customer status and assigned employee
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS under_employee_id INTEGER,

    -- Customer location details
    ADD COLUMN IF NOT EXISTS location_name VARCHAR(180),
    ADD COLUMN IF NOT EXISTS location_mode VARCHAR(30) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS location_address TEXT,
    ADD COLUMN IF NOT EXISTS location_latitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS location_longitude NUMERIC(10,7),
    ADD COLUMN IF NOT EXISTS location_map_url TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_tracking_reference TEXT,

    -- Uploaded customer images
    ADD COLUMN IF NOT EXISTS visiting_card_front TEXT,
    ADD COLUMN IF NOT EXISTS visiting_card_back TEXT,
    ADD COLUMN IF NOT EXISTS shop_front TEXT,
    ADD COLUMN IF NOT EXISTS shop_back TEXT,

    -- Timestamps
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_client_id
    ON public.customers(client_id);

CREATE INDEX IF NOT EXISTS idx_customers_location_id
    ON public.customers(location_id);

CREATE INDEX IF NOT EXISTS idx_customers_employee_id
    ON public.customers(under_employee_id);