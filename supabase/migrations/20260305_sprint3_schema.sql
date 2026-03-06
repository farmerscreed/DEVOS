-- ============================================================
-- Sprint 3 Schema Migration
-- DEVOS — Reservation, Buyer Portal, Payments, Documents
-- ============================================================

-- ---------------------------------------------------------------
-- 1. units table — ensure status + buyer_id columns exist
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'status'
  ) THEN
    ALTER TABLE units ADD COLUMN status TEXT DEFAULT 'available'
      CHECK (status IN ('available','reserved','sold','held'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'buyer_id'
  ) THEN
    ALTER TABLE units ADD COLUMN buyer_id UUID;
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 2. buyers
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buyers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  lead_id           UUID REFERENCES leads(id),
  user_id           UUID REFERENCES auth.users(id),
  reservation_id    UUID, -- FK added after reservations table created
  unit_id           UUID REFERENCES units(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyers_org ON buyers(organisation_id);
CREATE INDEX IF NOT EXISTS idx_buyers_lead ON buyers(lead_id);

-- ---------------------------------------------------------------
-- 3. reservations
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  unit_id           UUID NOT NULL REFERENCES units(id),
  buyer_id          UUID REFERENCES buyers(id),
  lead_id           UUID REFERENCES leads(id),
  reference_code    TEXT NOT NULL UNIQUE,
  deposit_kobo      BIGINT,
  deposit_paid_at   TIMESTAMPTZ,
  payment_plan      JSONB,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','expired','cancelled')),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_org ON reservations(organisation_id);
CREATE INDEX IF NOT EXISTS idx_reservations_unit ON reservations(unit_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, expires_at);

-- Now add FK from buyers to reservations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buyers' AND column_name = 'reservation_id'
  ) THEN
    ALTER TABLE buyers ADD COLUMN reservation_id UUID REFERENCES reservations(id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------
-- 4. payments_in
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments_in (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  buyer_id          UUID NOT NULL REFERENCES buyers(id),
  reservation_id    UUID REFERENCES reservations(id),
  amount_kobo       BIGINT NOT NULL,
  reference_code    TEXT,
  receipt_url       TEXT,
  notes             TEXT,
  confirmed_by      UUID,
  confirmed_at      TIMESTAMPTZ,
  rejected_by       UUID,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  instalment_number INT DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_in_org ON payments_in(organisation_id);
CREATE INDEX IF NOT EXISTS idx_payments_in_status ON payments_in(organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_in_buyer ON payments_in(buyer_id);

-- ---------------------------------------------------------------
-- 5. payment_schedule
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_schedule (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  buyer_id          UUID NOT NULL REFERENCES buyers(id),
  reservation_id    UUID NOT NULL REFERENCES reservations(id),
  instalment_number INT NOT NULL,
  amount_kobo       BIGINT NOT NULL,
  currency          TEXT DEFAULT 'NGN',
  due_date          DATE NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  paid_at           TIMESTAMPTZ,
  payment_in_id     UUID REFERENCES payments_in(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_schedule_org ON payment_schedule(organisation_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_due ON payment_schedule(due_date, status);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_buyer ON payment_schedule(buyer_id);

-- ---------------------------------------------------------------
-- 6. documents
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  buyer_id          UUID REFERENCES buyers(id),
  reservation_id    UUID REFERENCES reservations(id),
  document_type     TEXT CHECK (document_type IN (
    'reservation_letter','sale_agreement','notice_of_default',
    'handover_certificate','payment_receipt'
  )),
  file_url          TEXT,
  status            TEXT DEFAULT 'generating' CHECK (status IN ('generating','ready','failed')),
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organisation_id);
CREATE INDEX IF NOT EXISTS idx_documents_buyer ON documents(buyer_id);

-- ---------------------------------------------------------------
-- 7. progress_updates
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES projects(id),
  phase_id          UUID,
  reported_by       UUID,
  percent_complete  INT DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  summary           TEXT,
  photo_urls        TEXT[] DEFAULT '{}',
  submitted_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_updates_org ON progress_updates(organisation_id, project_id);

-- ---------------------------------------------------------------
-- 8. RLS Policies
-- ---------------------------------------------------------------

-- buyers
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_buyers" ON buyers;
CREATE POLICY "org_isolation_buyers" ON buyers
  USING (organisation_id = get_active_org_id());

-- reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_reservations" ON reservations;
CREATE POLICY "org_isolation_reservations" ON reservations
  USING (organisation_id = get_active_org_id());

-- payments_in
ALTER TABLE payments_in ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_payments_in" ON payments_in;
CREATE POLICY "org_isolation_payments_in" ON payments_in
  USING (organisation_id = get_active_org_id());

-- payment_schedule
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_payment_schedule" ON payment_schedule;
CREATE POLICY "org_isolation_payment_schedule" ON payment_schedule
  USING (organisation_id = get_active_org_id());

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_documents" ON documents;
CREATE POLICY "org_isolation_documents" ON documents
  USING (organisation_id = get_active_org_id());

-- progress_updates
ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation_progress_updates" ON progress_updates;
CREATE POLICY "org_isolation_progress_updates" ON progress_updates
  USING (organisation_id = get_active_org_id());

-- ---------------------------------------------------------------
-- 9. reserve_unit_atomic — SELECT FOR UPDATE stored procedure
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION reserve_unit_atomic(
  p_unit_id    UUID,
  p_lead_id    UUID,
  p_org_id     UUID,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unit          RECORD;
  v_reference     TEXT;
  v_reservation_id UUID;
  v_buyer_id       UUID;
BEGIN
  -- Lock the row — prevents concurrent reservations for the same unit
  SELECT * INTO v_unit
  FROM units
  WHERE id = p_unit_id AND organisation_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unit_not_found: Unit % does not exist in this organisation', p_unit_id;
  END IF;

  IF v_unit.status <> 'available' THEN
    RAISE EXCEPTION 'unit_unavailable: Unit is %. Cannot reserve.', v_unit.status;
  END IF;

  -- Generate reference code: RES-XXXXXXXXXX
  v_reference := 'RES-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 10));

  -- Create buyer record first (reservation FK is added after)
  INSERT INTO buyers (organisation_id, lead_id, unit_id, created_at)
  VALUES (p_org_id, p_lead_id, p_unit_id, now())
  RETURNING id INTO v_buyer_id;

  -- Create reservation
  INSERT INTO reservations (
    organisation_id, unit_id, buyer_id, lead_id,
    reference_code, expires_at, created_by, status
  )
  VALUES (
    p_org_id, p_unit_id, v_buyer_id, p_lead_id,
    v_reference, now() + INTERVAL '72 hours', p_created_by, 'pending'
  )
  RETURNING id INTO v_reservation_id;

  -- Update buyer with reservation_id
  UPDATE buyers SET reservation_id = v_reservation_id WHERE id = v_buyer_id;

  -- Mark unit as reserved
  UPDATE units
  SET status = 'reserved', buyer_id = v_buyer_id
  WHERE id = p_unit_id;

  RETURN jsonb_build_object(
    'success',         true,
    'reservation_id',  v_reservation_id,
    'buyer_id',        v_buyer_id,
    'reference_code',  v_reference,
    'expires_at',      (now() + INTERVAL '72 hours')::TEXT,
    'unit_id',         p_unit_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise — Postgres will rollback the transaction automatically
    RAISE;
END;
$$;

-- Grant execute to authenticated users (agent-worker uses service role, frontend uses anon/auth)
GRANT EXECUTE ON FUNCTION reserve_unit_atomic(UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_unit_atomic(UUID, UUID, UUID, UUID) TO service_role;
