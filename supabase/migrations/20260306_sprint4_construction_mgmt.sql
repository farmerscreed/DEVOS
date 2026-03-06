-- ================================================================
-- Sprint 4 — Phase 2: Construction Management
-- T4.1 budget_line_items, T4.2 project_documents, T4.3 price_index RLS,
-- T4.6 purchase_requests additions, T4.9 payment_tickets addition
-- ================================================================

-- 1. budget_phases: add contingency_pct + description
ALTER TABLE budget_phases
  ADD COLUMN IF NOT EXISTS contingency_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text;

-- 2. budget_line_items — detailed line items within a phase/category
CREATE TABLE IF NOT EXISTS budget_line_items (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id          uuid NOT NULL REFERENCES budget_phases(id) ON DELETE CASCADE,
  description       text NOT NULL,
  quantity          numeric(12,3) NOT NULL DEFAULT 1,
  unit              text NOT NULL DEFAULT 'item',
  unit_rate_kobo    bigint NOT NULL DEFAULT 0,
  total_kobo        bigint GENERATED ALWAYS AS (ROUND(quantity * unit_rate_kobo)) STORED,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage budget line items"
  ON budget_line_items
  USING (organisation_id = get_active_org_id())
  WITH CHECK (organisation_id = get_active_org_id());

-- 3. project_documents — BOQ / contract uploads (T4.2)
CREATE TABLE IF NOT EXISTS project_documents (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id        uuid REFERENCES budget_phases(id) ON DELETE SET NULL,
  uploaded_by     uuid NOT NULL REFERENCES auth.users(id),
  doc_type        text NOT NULL DEFAULT 'boq' CHECK (doc_type IN ('boq','contract','drawing','other')),
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  file_size_bytes bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage project documents"
  ON project_documents
  USING (organisation_id = get_active_org_id())
  WITH CHECK (organisation_id = get_active_org_id());

-- 4. purchase_requests: additional columns for GUARDIAN analysis (T4.6/T4.7)
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS material_name text,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS guardian_flag text CHECK (guardian_flag IN ('CLEAR','INFO','WARNING','CRITICAL')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notes text;

-- 5. payment_tickets: link to purchase request (T4.9)
ALTER TABLE payment_tickets
  ADD COLUMN IF NOT EXISTS purchase_request_id uuid REFERENCES purchase_requests(id) ON DELETE SET NULL;

ALTER TABLE payment_tickets
  ALTER COLUMN invoice_id DROP NOT NULL;

-- 6. price_index RLS (super_admin manages, all members can read) (T4.3)
ALTER TABLE price_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_index read by all"
  ON price_index FOR SELECT USING (true);

CREATE POLICY "price_index write by admin"
  ON price_index FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

CREATE POLICY "price_index update by admin"
  ON price_index FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM org_members WHERE user_id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- 7. Trigger: auto-update budget_phases.spent_kobo when PR approved
CREATE OR REPLACE FUNCTION update_phase_spent_kobo()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') AND NEW.phase_id IS NOT NULL THEN
    UPDATE budget_phases
    SET spent_kobo = spent_kobo + (NEW.quantity * NEW.unit_rate_kobo), updated_at = now()
    WHERE id = NEW.phase_id;
  END IF;
  IF OLD.status = 'approved' AND NEW.status != 'approved' AND NEW.phase_id IS NOT NULL THEN
    UPDATE budget_phases
    SET spent_kobo = GREATEST(0, spent_kobo - (OLD.quantity * OLD.unit_rate_kobo)), updated_at = now()
    WHERE id = NEW.phase_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_phase_spent_kobo ON purchase_requests;
CREATE TRIGGER trg_update_phase_spent_kobo
  AFTER UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION update_phase_spent_kobo();

-- 8. updated_at trigger for budget_line_items
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_budget_line_items_updated_at ON budget_line_items;
CREATE TRIGGER trg_budget_line_items_updated_at
  BEFORE UPDATE ON budget_line_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
