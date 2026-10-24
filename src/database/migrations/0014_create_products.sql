BEGIN;

CREATE TABLE IF NOT EXISTS public.products (
    id BIGSERIAL PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL UNIQUE,
    product_name VARCHAR(200) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    product_description TEXT NOT NULL,
    hsn_code VARCHAR(30) NOT NULL,
    standard_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    product_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT products_status_check
        CHECK (status IN ('Active', 'Inactive')),
    CONSTRAINT products_standard_rate_check
        CHECK (standard_rate >= 0)
);

-- Add columns if the table already existed.
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS product_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS unit VARCHAR(50),
    ADD COLUMN IF NOT EXISTS product_description TEXT,
    ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(30),
    ADD COLUMN IF NOT EXISTS standard_rate NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS product_image TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Fill missing values in any pre-existing rows.
UPDATE public.products
SET
    product_code = COALESCE(
        NULLIF(BTRIM(product_code), ''),
        'PROD' || LPAD(id::TEXT, 5, '0')
    ),
    product_name = COALESCE(
        NULLIF(BTRIM(product_name), ''),
        'Product ' || id::TEXT
    ),
    unit = COALESCE(NULLIF(BTRIM(unit), ''), 'Unit'),
    product_description = COALESCE(product_description, ''),
    hsn_code = COALESCE(NULLIF(BTRIM(hsn_code), ''), 'N/A'),
    standard_rate = COALESCE(standard_rate, 0),
    status = CASE
        WHEN LOWER(BTRIM(COALESCE(status, ''))) = 'inactive'
            THEN 'Inactive'
        ELSE 'Active'
    END,
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP);

ALTER TABLE public.products
    ALTER COLUMN product_code SET NOT NULL,
    ALTER COLUMN product_name SET NOT NULL,
    ALTER COLUMN unit SET NOT NULL,
    ALTER COLUMN product_description SET NOT NULL,
    ALTER COLUMN hsn_code SET NOT NULL,
    ALTER COLUMN standard_rate SET DEFAULT 0,
    ALTER COLUMN standard_rate SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'Active',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN updated_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code
    ON public.products (product_code);

CREATE INDEX IF NOT EXISTS idx_products_product_name
    ON public.products (product_name);

CREATE INDEX IF NOT EXISTS idx_products_status
    ON public.products (status);

COMMIT;

-- Verify the table structure.
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
ORDER BY ordinal_position;