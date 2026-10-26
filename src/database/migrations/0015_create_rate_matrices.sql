CREATE TABLE IF NOT EXISTS public.rate_matrices (
    id BIGSERIAL PRIMARY KEY,

    client_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    site_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,

    rate NUMERIC(12, 2) NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT rate_matrices_rate_check
        CHECK (rate >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_matrices_client_id
    ON public.rate_matrices (client_id);

CREATE INDEX IF NOT EXISTS idx_rate_matrices_customer_id
    ON public.rate_matrices (customer_id);

CREATE INDEX IF NOT EXISTS idx_rate_matrices_site_id
    ON public.rate_matrices (site_id);

CREATE INDEX IF NOT EXISTS idx_rate_matrices_location_id
    ON public.rate_matrices (location_id);

CREATE INDEX IF NOT EXISTS idx_rate_matrices_product_id
    ON public.rate_matrices (product_id);

-- Verify the table.
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rate_matrices'
ORDER BY ordinal_position;