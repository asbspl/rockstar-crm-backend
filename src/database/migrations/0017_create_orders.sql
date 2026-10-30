-- 0017_create_orders.sql
-- Adds customer-site, dispatch and image fields to existing orders.

BEGIN;

-- 1. Customer Site relationship
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS site_id BIGINT;

-- 2. Dispatch details
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS dispatch_sequence_no VARCHAR(100),
    ADD COLUMN IF NOT EXISTS driver_id BIGINT,
    ADD COLUMN IF NOT EXISTS driver_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(100),
    ADD COLUMN IF NOT EXISTS vehicle_type VARCHAR(80),
    ADD COLUMN IF NOT EXISTS contact VARCHAR(50);

-- 3. Order images
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS image1 TEXT,
    ADD COLUMN IF NOT EXISTS image2 TEXT,
    ADD COLUMN IF NOT EXISTS image3 TEXT,
    ADD COLUMN IF NOT EXISTS image4 TEXT;

-- 4. Backfill site_id only when exactly one matching site exists
UPDATE public.orders AS o
SET site_id = matched.id
FROM (
    SELECT
        s.customer_id,
        LOWER(TRIM(s.site_name)) AS normalized_site_name,
        MIN(s.id) AS id
    FROM public.sites AS s
    GROUP BY s.customer_id, LOWER(TRIM(s.site_name))
    HAVING COUNT(*) = 1
) AS matched
WHERE o.site_id IS NULL
  AND o.customer_id = matched.customer_id
  AND LOWER(TRIM(o.customer_site_name)) = matched.normalized_site_name;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_orders_site_id
    ON public.orders(site_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_pino
    ON public.orders(pino)
    WHERE pino IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_dcsno
    ON public.orders(dcsno)
    WHERE dcsno IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
    ON public.order_items(order_id);

COMMIT;
