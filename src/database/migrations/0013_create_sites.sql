CREATE TABLE IF NOT EXISTS public.sites (
    id BIGSERIAL PRIMARY KEY,
    site_name VARCHAR(150),
    customer_id BIGINT,
    location_id BIGINT,
    contact_person VARCHAR(150),
    contact_number VARCHAR(20),
    line_1 VARCHAR(255),
    line_2 VARCHAR(255),
    country VARCHAR(100) DEFAULT 'India',
    state VARCHAR(100),
    city VARCHAR(100),
    pin_code VARCHAR(10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.sites
    ADD COLUMN IF NOT EXISTS site_name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS customer_id BIGINT,
    ADD COLUMN IF NOT EXISTS location_id BIGINT,
    ADD COLUMN IF NOT EXISTS contact_person VARCHAR(150),
    ADD COLUMN IF NOT EXISTS contact_number VARCHAR(20),
    ADD COLUMN IF NOT EXISTS line_1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS line_2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS state VARCHAR(100),
    ADD COLUMN IF NOT EXISTS city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS pin_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_sites_site_name
    ON public.sites (site_name);

CREATE INDEX IF NOT EXISTS idx_sites_customer_id
    ON public.sites (customer_id);

CREATE INDEX IF NOT EXISTS idx_sites_location_id
    ON public.sites (location_id);

CREATE INDEX IF NOT EXISTS idx_sites_created_at
    ON public.sites (created_at DESC);
