
CREATE TABLE IF NOT EXISTS public.contractors (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(10) NOT NULL,
    email VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    location VARCHAR(150) NOT NULL,
    state VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    pin_code VARCHAR(10) NOT NULL,

    pan_card VARCHAR(10) NOT NULL,
    pan_card_document TEXT NOT NULL,
    aadhaar_card VARCHAR(12) NOT NULL,
    aadhaar_card_document TEXT NOT NULL,
    payment_upi VARCHAR(100) NOT NULL,

    account_name VARCHAR(150) NOT NULL,
    account_number VARCHAR(34) NOT NULL,
    ifsc_code VARCHAR(11) NOT NULL,

    status VARCHAR(10) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Inactive')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_name
    ON public.contractors (LOWER(name));

CREATE INDEX IF NOT EXISTS idx_contractors_status
    ON public.contractors (status);

CREATE INDEX IF NOT EXISTS idx_contractors_phone
    ON public.contractors (phone);

CREATE INDEX IF NOT EXISTS idx_contractors_email
    ON public.contractors (LOWER(email));
