
BEGIN;

-- =====================================================
-- 1. CREATE QUOTATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.quotations (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 2. ADD / UPDATE QUOTATION COLUMNS
-- =====================================================

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS quotation_no VARCHAR(30),
    ADD COLUMN IF NOT EXISTS company_id BIGINT,
    ADD COLUMN IF NOT EXISTS client_id BIGINT,
    ADD COLUMN IF NOT EXISTS customer_id BIGINT,
    ADD COLUMN IF NOT EXISTS site_id BIGINT,
    ADD COLUMN IF NOT EXISTS location_id BIGINT,
    ADD COLUMN IF NOT EXISTS quotation_date DATE,
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS comment TEXT
        DEFAULT 'Looking forward for your business.',
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2)
        NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS grand_total NUMERIC(14, 2)
        NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS status VARCHAR(20)
        NOT NULL DEFAULT 'Draft',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();

-- =====================================================
-- 3. ALLOW OPTIONAL CUSTOMER, SITE AND LOCATION
-- =====================================================

ALTER TABLE public.quotations
    ALTER COLUMN customer_id DROP NOT NULL,
    ALTER COLUMN site_id DROP NOT NULL,
    ALTER COLUMN location_id DROP NOT NULL;

-- =====================================================
-- 4. GENERATE MISSING QUOTATION NUMBERS
-- =====================================================

UPDATE public.quotations
SET quotation_no =
    'QS' ||
    TO_CHAR(created_at::DATE, 'YY') ||
    LPAD(id::TEXT, 4, '0')
WHERE quotation_no IS NULL
   OR BTRIM(quotation_no) = '';

-- =====================================================
-- 5. CHECK FOR DUPLICATE QUOTATION NUMBERS
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.quotations
        GROUP BY quotation_no
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Duplicate quotation numbers exist. Resolve them before creating the unique index.';
    END IF;
END $$;

-- =====================================================
-- 6. REQUIRE QUOTATION NUMBER
-- =====================================================

ALTER TABLE public.quotations
    ALTER COLUMN quotation_no SET NOT NULL;

-- =====================================================
-- 7. CREATE QUOTATION INDEXES
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS quotations_quotation_no_unique
    ON public.quotations (quotation_no);

CREATE INDEX IF NOT EXISTS quotations_status_index
    ON public.quotations (status);

CREATE INDEX IF NOT EXISTS quotations_created_at_index
    ON public.quotations (created_at DESC);

CREATE INDEX IF NOT EXISTS quotations_company_id_index
    ON public.quotations (company_id);

CREATE INDEX IF NOT EXISTS quotations_client_id_index
    ON public.quotations (client_id);

CREATE INDEX IF NOT EXISTS quotations_customer_id_index
    ON public.quotations (customer_id);

CREATE INDEX IF NOT EXISTS quotations_site_id_index
    ON public.quotations (site_id);

CREATE INDEX IF NOT EXISTS quotations_location_id_index
    ON public.quotations (location_id);

-- =====================================================
-- 8. CREATE QUOTATION ITEMS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id BIGSERIAL PRIMARY KEY,

    quotation_id BIGINT NOT NULL
        REFERENCES public.quotations(id)
        ON DELETE CASCADE,

    product_id BIGINT NOT NULL,

    unit VARCHAR(50) NOT NULL,

    quantity NUMERIC(14, 3) NOT NULL
        CHECK (quantity > 0),

    rate_incl_gst NUMERIC(14, 2) NOT NULL
        CHECK (rate_incl_gst >= 0),

    amount NUMERIC(14, 2) NOT NULL
        CHECK (amount >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 9. CREATE QUOTATION ITEM INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS quotation_items_quotation_id_index
    ON public.quotation_items (quotation_id);

CREATE INDEX IF NOT EXISTS quotation_items_product_id_index
    ON public.quotation_items (product_id);

COMMIT;

-- =====================================================
-- 10. VERIFY TABLE STRUCTURE
-- =====================================================

SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('quotations', 'quotation_items')
ORDER BY table_name, ordinal_position;

-- =====================================================
-- 11. VERIFY QUOTATIONS
-- =====================================================

SELECT
    id,
    quotation_no,
    company_id,
    client_id,
    customer_id,
    site_id,
    location_id,
    quotation_date,
    expiry_date,
    total_amount,
    grand_total,
    status
FROM public.quotations
ORDER BY id DESC
LIMIT 20;
