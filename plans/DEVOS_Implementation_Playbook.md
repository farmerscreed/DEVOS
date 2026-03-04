# DEVOS Implementation Playbook

**Your step-by-step guide from zero to production.**
Reference this document as you move from phase to phase. Each section is self-contained — give the agent the prompt, verify the output, then move to the next.

**Source of truth:** `DEVOS_Technical_Architecture_v2.md` (always attach this to the agent)

---

## How to Use This Document

```
For each sprint:
  1. READ the "Before You Start" checklist
  2. COPY the prompt into your coding agent (attach the v2 architecture doc)
  3. LET the agent build
  4. RUN the verification checklist yourself
  5. FIX any failures (re-prompt the agent with specific errors)
  6. Only when ALL checks pass → move to the next sprint
```

> **IMPORTANT:** Never skip the verification step. Never start the next sprint until the current one passes. The prompts are designed so each sprint builds on verified work from the previous one.

---

## Pre-Flight Checklist (Do This ONCE Before Starting)

These are things YOU must do personally. Not the coding agent.

- [ ] Register domain `devos.app` (or confirm it's registered)
- [ ] Create a GitHub private repository for DEVOS
- [ ] Create a Supabase account (if you don't have one)
- [ ] Create a Vercel account linked to your GitHub
- [ ] Apply for WhatsApp Business API access (Meta Business Manager) — **this takes 2-4 weeks, start NOW**
- [ ] Engage a lawyer for legal template review (Reservation Letter, Sale Agreement, Notice of Default) — **2-4 week lead time, start NOW**
- [ ] Create an OpenRouter account and add API credits
- [ ] Create an Anthropic API account and add API credits
- [ ] Create a fal.ai account (for video generation later)
- [ ] Create a Resend account (for email)
- [ ] Decide on Agent Engine Worker host: Railway or Fly.io (I recommend Railway for simplicity)
- [ ] Optional: Create a Telegram Bot via @BotFather (takes 2 minutes, but reserve the username early)

---

# PHASE 1: FOUNDATION (Weeks 1–3)

**Goal:** Lead form → Messaging qualification → Reservation flow → Buyer Portal MVP → Command Dashboard MVP → Morning brief

---

## Sprint 1 (Week 1) — Infrastructure & Pipeline

### Before You Start

- [ ] Supabase account ready
- [ ] GitHub repo created
- [ ] Vercel account linked to GitHub
- [ ] Railway/Fly.io account created
- [ ] API keys available: Anthropic, OpenRouter, Resend

### Prompt for Agent

```
You are a senior full-stack developer. You have been given the DEVOS Technical 
Architecture Document v2.0 (attached). Your job is to implement Phase 1, Sprint 1 
exactly as specified in Section 11 (Build Sequence).

Your deliverables for Sprint 1 are tasks T1.1 through T1.19, in dependency order:

1. T1.1 — Supabase project setup (create project, enable required extensions)
2. T1.2 — Schema: PLATFORM LAYER tables (organisations, org_members, subscriptions, 
   org_credentials, agent_context, feature_flags, llm_config, tracking_links). Include 
   the `enabled_channels TEXT[] DEFAULT '{whatsapp}'` and `timezone` fields on organisations.
3. T1.3 — Schema: ALL remaining tables with organisation_id. Key details:
   - `message_threads` (NOT `whatsapp_threads`) with `channel TEXT DEFAULT 'whatsapp'`
   - `agent_queue` with status, attempts, max_attempts, result JSONB
   - `invoices` with 5 separate evidence fields: before_photo_urls[], after_photo_urls[],
     delivery_receipt_url, work_completion_cert_url, measurement_cert_url
   - `documents` with document_type ENUM: 'reservation_letter', 'sale_agreement', 
     'notice_of_default', 'handover_certificate', 'payment_receipt'
   - `agent_logs` with model_used, input_tokens, output_tokens, cost_usd, provider columns
   - Create all indexes listed in Section 4
4. T1.4 — RLS policies + helper functions:
   - `get_active_org_id()` reading from JWT app_metadata (NOT a query to org_members)
   - `set_active_organisation(target_org_id UUID)` as SECURITY DEFINER RPC
   - `get_user_role(user_id UUID)` filtered by active org: 
     WHERE user_id = $1 AND organisation_id = get_active_org_id()
   - Apply org isolation policies to EVERY table using get_active_org_id()
5. T1.5 — Supabase Auth roles config (7 roles as defined in Section 4)
6. T1.6 — Vercel wildcard subdomain config for [slug].devos.app
7. T1.7 — React project setup (React 18 + TypeScript + Vite + Tailwind + shadcn/ui + 
   TanStack Query + Zustand). Implement subdomain routing and org-switcher component.
8. T1.8 — Landing page: hero section, unit cards grid, payment calculator, lead capture 
   form with reCAPTCHA v3 (invisible). The form must collect: name, phone, email, city, 
   country, budget range, investment type, unit interest.
9. T1.9 — Lead form submission: POST to on-lead-created Edge Function. Parse UTM params. 
   Generate UUID-based tracking links (not predictable codes).
10. T1.10 — WhatsApp Business API setup (Cloud API configuration)
11. T1.11 — whatsapp-mcp server: send_text, send_media, send_template, read_inbound. 
    Per-org credential injection from Supabase Vault.
12. T1.12 — Messaging channel abstraction layer:
    - channel_interface.ts (send_text, send_media, send_template, on_inbound)
    - whatsapp_channel.ts (WhatsApp implementation)
    - channel_router.ts (routes by lead.preferred_channel or org.enabled_channels)
    - Telegram implementation is Phase 2/3 — just define the interface now.
13. T1.13 — email-mcp server using Resend API. Per-org sender identity.
14. T1.14 — on-lead-created Supabase Edge Function:
    - Validate reCAPTCHA v3 token (reject if score < 0.3)
    - Create lead record with UTM attribution
    - Run rule-based lead scoring (NOT an LLM call)
    - Handle duplicate phone/email within 24h as upsert
    - Dispatch PRESELL agent job to agent_queue
    - Set CORS to *.devos.app only
15. T1.15 — on-messaging-inbound Edge Function: log message, idempotent via message_id, 
    dispatch to agent_queue
16. T1.16 — Agent Engine Worker (deploy on Railway/Fly.io as a separate service):
    - Set up LiteLLM client with model routing config per the Model Routing Table 
      in Section 3
    - Implement the agent loop: poll agent_queue → process → call LiteLLM → execute 
      MCP tool calls → write results → update queue status
    - Hard cap: max 10 tool calls per invocation
    - Retry logic: 3 attempts max, primary → fallback → queue retry in 5 min → FAILED
    - Track cost per invocation in agent_logs (model_used, tokens, cost_usd)
    - The Worker must receive organisation_id from the dispatch context, NEVER from 
      LLM output
17. T1.17 — Integration Smoke Test: verify the FULL chain works end-to-end:
    Edge Function → agent_queue insert → Worker picks up → LiteLLM call → MCP tool 
    call → DB write → result returned. Log the test. This MUST pass.
18. T1.18 — Create Primerose Smart City Cluster organisation record with slug 'primerose'
19. T1.19 — Deploy frontend to Vercel, verify primerose.devos.app loads

Key rules:
- Every table MUST have organisation_id as a non-nullable FK
- ALL RLS policies MUST use get_active_org_id()
- Lead scoring is RULE-BASED, never an LLM call
- Agent Engine Worker is SEPARATE from Supabase Edge Functions
- The table is message_threads, NOT whatsapp_threads
- Magic link tokens are UUIDs, not predictable codes
- CORS: restrict all Edge Functions to *.devos.app

Refer to Section 4 for schema, Section 7 for Edge Function specs, Section 8 for 
auth/RLS patterns, Section 9 for error handling.

Start with T1.1 and proceed in dependency order.
```

### Verification Checklist

After the agent completes Sprint 1, verify these yourself:

- [ ] **Database:** All tables exist in Supabase with correct columns and constraints
- [ ] **RLS Test 1:** Create two test orgs. Insert a lead in Org A. Query as Org B user → should return 0 rows
- [ ] **RLS Test 2:** As Org B user, attempt INSERT with Org A's organisation_id → should fail
- [ ] **Org-switcher:** Login as a user in 2 orgs. Switch org. Data changes correctly
- [ ] **Landing page:** `primerose.devos.app` loads with hero, unit cards, calculator, form
- [ ] **Lead form:** Submit a test lead → appears in `leads` table with correct UTM and score
- [ ] **reCAPTCHA:** Submit from a non-devos.app origin → blocked
- [ ] **Agent Engine:** Check Railway/Fly.io logs — Worker is running, polling agent_queue
- [ ] **Smoke Test (T1.17):** Full chain completed successfully at least once
- [ ] **CORS:** API call from `localhost` or other origin → blocked

### After Sprint 1 Passes

Tell the agent:
> "Sprint 1 is complete and verified. All RLS policies work, the Agent Engine Worker is
> running on Railway, and the smoke test passed. Move to Sprint 2."

---

## Sprint 2 (Week 2) — PRESELL Qualification Engine

### Before You Start

- [ ] Sprint 1 verification checklist ALL passed
- [ ] WhatsApp Business API access confirmed (or use sandbox)
- [ ] Test phone number available for WhatsApp testing

### Prompt for Agent

```
You are continuing DEVOS development. Sprint 1 is complete and verified:
- All schema tables exist with RLS policies using get_active_org_id()
- Agent Engine Worker running on Railway/Fly.io with LiteLLM routing
- Messaging channel abstraction (channel_interface.ts) in place
- on-lead-created and on-messaging-inbound Edge Functions deployed
- Landing page live at primerose.devos.app
- Integration smoke test passed

Your deliverables for Sprint 2 (Section 11, T2.1–T2.7):

1. T2.1 — PRESELL Agent system prompt and refinement:
   - Write the system prompt for PRESELL Agent. It qualifies leads via WhatsApp 
     conversation. Persona: friendly, professional Nigerian real estate consultant.
   - Agent uses Claude 3.5 Haiku as primary (via LiteLLM), GPT-4o-mini as fallback.
   - Agent must: ask qualifying questions (budget, timeline, investment type, unit 
     preference), provide property information, send brochure/media when appropriate.
   - Conversation state machine: INTAKE → QUALIFYING → HOT / WARM / COLD / 
     NEEDS_INTERVENTION
   - Guardrails: max 3 agent-initiated messages per hour per lead, 30-turn escalation 
     cap, message deduplication, 10 tool call limit per invocation.

2. T2.2 — Multi-turn messaging qualification end-to-end:
   - Lead submits form → opening message sent via WhatsApp
   - Lead replies → on-messaging-inbound → agent_queue → Worker processes → 
     Agent responds via channel_router
   - Score updates after each turn based on signals gathered
   - Test with at least 5 different conversation scenarios

3. T2.3 — Lead scoring update: after each agent turn, update lead score via 
   supabase-mcp based on new signals gathered. Score is STILL rule-based 
   (not LLM-determined). The agent extracts signals, the scoring function 
   applies weights.

4. T2.4 — Sales Agent Dashboard:
   - Lead list with filters (score, category, status, date)
   - Lead detail view (conversation history, score breakdown, profile)
   - Real-time updates via Supabase Realtime (with 30s polling fallback)

5. T2.5 — Hot lead notification: when score reaches 70+, create notification 
   record and send WhatsApp alert to assigned sales agent.

6. T2.6 — Media library in Supabase Storage: org-scoped buckets for property 
   renders, floor plans, brochures. Agent can send these as media messages.

7. T2.7 — Agent logs viewer: show agent decisions with model_used, cost_usd, 
   input/output tokens, reasoning summary. Paginated, filterable by date+agent type.

Key references: Section 5 (PRESELL features), Section 6 (Flow 1 + Flow 2), 
Section 9 (conversation guardrails).

Test the full qualification flow end-to-end before marking complete.
```

### Verification Checklist

- [ ] **Qualification flow:** Submit lead form → receive WhatsApp message within 60s
- [ ] **Multi-turn:** Reply to WhatsApp → agent responds with relevant follow-up
- [ ] **Score updates:** After conversation turns, lead score changes in database
- [ ] **Hot lead alert:** Get a lead to score 70+ → sales agent gets WhatsApp notification
- [ ] **Dashboard:** Sales agent dashboard shows leads with correct scores and categories
- [ ] **Guardrails:** Agent doesn't send more than 3 messages/hour unprompted
- [ ] **Agent logs:** Viewer shows correct model (Haiku), cost, tokens for each invocation
- [ ] **Fallback:** Simulate Anthropic API failure → falls back to GPT-4o-mini via OpenRouter

### After Sprint 2 Passes

Tell the agent:
> "Sprint 2 is complete. PRESELL qualification flow works end-to-end on WhatsApp.
> Lead scoring updates correctly. Hot lead notifications fire. Sales agent dashboard
> is live. Move to Sprint 3."

---

## Sprint 3 (Week 3) — Reservation, Buyer Portal & Morning Brief

### Before You Start

- [ ] Sprint 2 verification checklist ALL passed
- [ ] Legal template for Reservation Letter received from lawyer (or use placeholder)
- [ ] At least one test lead has been qualified to HOT status

### Prompt for Agent

```
You are continuing DEVOS development. Sprint 2 is complete and verified:
- PRESELL Agent qualifies leads via WhatsApp (Claude Haiku via LiteLLM)
- Lead scoring updates after each turn (rule-based)
- Hot lead notification fires at score ≥70
- Sales agent dashboard live with real-time lead data
- Agent logs viewer shows model, cost, tokens

Your deliverables for Sprint 3 (Section 11, T3.1–T3.10):

1. T3.1 — Reservation workflow:
   - Sales agent selects a unit for a HOT lead
   - Unit status changes Available → Reserved (use SELECT FOR UPDATE for race condition)
   - Payment instructions generated with unique reference code
   - Instructions sent to buyer via messaging channel + email
   - If reservation expires (configurable, default 72h), unit returns to Available

2. T3.2 — Unit inventory tracker (real-time):
   - Visual grid of all units (Available/Reserved/Sold/Held)
   - Real-time status updates via Supabase Realtime
   - Color-coded status indicators

3. T3.3 — Buyer Portal MVP:
   - Payment progress bar showing instalments paid vs remaining
   - Construction status (from progress_updates table)
   - Document viewer (Reservation Letter, receipts)
   - Support chat routed via channel_router (tag messages as source: buyer_portal)
   - Empty state: "Your first payment is due on [date]"

4. T3.4 — on-payment-confirmed Edge Function:
   - Triggered when finance marks payment as confirmed
   - Updates unit status, buyer record, payment schedule
   - Triggers document generation if applicable
   - Sends confirmation via messaging channel

5. T3.5 — pdf-mcp for Reservation Letter:
   - Generate PDF from template stored in Supabase Storage
   - Org-scoped templates (each org can have their own branding)
   - Generate to temp storage → validate → move to permanent (never serve partial PDFs)
   - If template not found → log error, alert admin, don't crash

6. T3.6 — Payment tracking + finance workflow:
   - Finance view: list of pending payment confirmations
   - Receipt review (view uploaded receipt image)
   - Confirm or reject with notes
   - If rejected: unit returns to Available, buyer notified

7. T3.7 — Command Dashboard MVP:
   - KPI cards: total units, reserved, sold, revenue, active leads, budget health
   - Flag queue: hot leads needing attention, pending approvals
   - Empty state: setup checklist ("✅ Project created → ⬜ First campaign → ⬜ First lead")

8. T3.8 — Payment reminder Edge Functions:
   - payment-reminder-7d: 7 days before due date
   - payment-reminder-3d: 3 days before due date
   - Skip if already paid
   - Multiple overdue → send consolidated notice

9. T3.9 — MASTER Agent for morning brief:
   - Uses GPT-4o-mini (via LiteLLM), fallback to Claude Haiku
   - Receives overnight data snapshot (leads, payments, invoices, flags)
   - Synthesises into 2-3 key decisions + "everything else handled"
   - If exceeds 4096 chars → truncate to top 5 items per category + "See dashboard"
   - Zero activity → "All clear — nothing requires attention"

10. T3.10 — morning-brief Edge Function:
    - Scheduled trigger at 7am per org timezone
    - Query: orgs WHERE now() AT TIME ZONE org.timezone matches 7:00 AM
    - Compile overnight data → dispatch to agent_queue for MASTER Agent
    - On agent failure → send fallback: "Brief generation failed. Check dashboard."

Key references: Section 5 (features), Section 6 (Flows 1-6), Section 9 (edge cases).

Handle the edge cases defined in Flows 2, 4, and 6. Two simultaneous reservations 
MUST be handled with SELECT FOR UPDATE.
```

### Verification Checklist

- [ ] **Reservation flow:** Select unit for HOT lead → unit shows Reserved → payment instructions sent
- [ ] **Race condition:** Two reservations for same unit simultaneously → first wins, second gets error
- [ ] **Buyer Portal:** Buyer logs in → sees payment progress, documents, construction status
- [ ] **Payment confirmation:** Finance confirms payment → unit status + buyer record update
- [ ] **PDF generation:** Reservation Letter PDF generates correctly with org branding
- [ ] **Payment reminders:** Create a payment due in 7 days → reminder fires
- [ ] **Morning brief:** Trigger manually → brief arrives via WhatsApp/Telegram within 2 minutes
- [ ] **Morning brief zero activity:** Org with no overnight events → "All clear" message
- [ ] **Dashboard:** Command dashboard shows correct KPIs, flag queue

### After Sprint 3 Passes — PHASE 1 GATE

**This is the most important gate.** Before continuing to Phase 2:

- [ ] **Full E2E test:** Ad click → landing page → form → WhatsApp → qualification → HOT → reservation → payment → Buyer Portal active → Reservation Letter generated
- [ ] **Test with real WhatsApp** (not sandbox) if API is approved
- [ ] **Test morning brief** over 2-3 days with real overnight data

Tell the agent:
> "Phase 1 is complete and fully verified. The lead-to-reservation pipeline works
> end-to-end. Buyer Portal is active. Morning brief fires daily. Move to Phase 2."

---

# PHASE 2: GUARDIAN CORE (Weeks 4–6)

**Goal:** Purchase request → GUARDIAN analysis → Invoice verification → Approval workflow → Payment Ticket → Finance confirmation

---

## Sprint 4 (Week 4) — Budget & Purchase Requests

### Before You Start

- [ ] Phase 1 fully verified (all Sprint 1-3 checklists passed)
- [ ] Primerose project data available (phases, budget allocations, contractor info)

### Prompt for Agent

```
You are continuing DEVOS development. Phase 1 is complete and verified:
- Lead-to-reservation pipeline works end-to-end
- PRESELL Agent qualifies via WhatsApp (Haiku), scores update, HOT notifications fire
- Reservation workflow with payment tracking and finance confirmation
- Buyer Portal with payment progress, documents, support chat
- Morning brief via MASTER Agent (GPT-4o-mini) at 7am per org timezone
- Command Dashboard shows KPIs and flag queue
- All tables have RLS using get_active_org_id(), Agent Engine Worker on Railway

Your deliverables for Sprint 4 (Phase 2, T4.1–T4.9):

1. T4.1 — Budget setup UI:
   - Project → Phases → Categories → Line items
   - Allocated amounts per phase/category
   - Contingency percentage
   - Budget health indicators (GREEN <70%, YELLOW 70-84%, RED 85%+)

2. T4.2 — BOQ/contract upload:
   - PDF upload to Supabase Storage (max 10MB)
   - Stored as reference document (no parsing in MVP)
   - Linked to project + phase

3. T4.3 — Materials price index (initial data):
   - Create initial price_index entries for common Nigerian construction materials
   - Fields: material_name, unit, rate_kobo, region, effective_date
   - Super_admin manages entries

4. T4.4 — price-index-update Edge Function (monthly scheduled)

5. T4.5 — Site Manager mobile interface:
   - Submit purchase requests with evidence photos
   - View purchase request status
   - Submit progress updates (percent_complete, summary, photos)
   - Mobile-responsive design

6. T4.6 — on-purchase-request Edge Function:
   - Validate required fields and evidence
   - Dispatch GUARDIAN Agent job for price analysis
   - Log to agent_queue

7. T4.7 — GUARDIAN Agent system prompt:
   - Uses Claude Sonnet as primary (via LiteLLM), GPT-4o as fallback
   - Agent must perform price analysis: compare submitted rate vs price_index for 
     the same material + region
   - Flag thresholds: ≤5% → CLEAR, 5.1-15% → INFO, 15.1-30% → WARNING, >30% → CRITICAL
   - Agent must check budget impact: will this purchase breach allocated budget?
   - Auto-Approve: all checks pass + within budget + price within market → advance 
     without developer review (configurable per org)
   - Auto-Reject: >30% above market OR would breach budget ceiling → reject automatically

8. T4.8 — Developer approval interface:
   - View purchase requests with GUARDIAN analysis flags
   - Approve / Adjust / Reject with notes
   - Flag severity color-coding

9. T4.9 — on-approval-granted Edge Function:
   - MUST validate separation of duties: requested_by ≠ actor_id
   - If same person → REJECT with "Submitter cannot approve their own request"
   - Generate Payment Ticket with reference code
   - Notify finance via email-mcp

Key references: Section 5 (GUARDIAN features), Section 6 (Flow 3+4).
```

### Verification Checklist

- [ ] **Budget setup:** Create project with phases, categories, amounts
- [ ] **Price index:** Materials exist with rates
- [ ] **Purchase request:** Site manager submits → GUARDIAN analyzes → flags generated
- [ ] **Price check:** Submit at 6% above market → INFO flag appears
- [ ] **Price check:** Submit at 31% above market → CRITICAL / Auto-Reject
- [ ] **Auto-approve:** All clear + within budget → advances without dev review (if enabled)
- [ ] **Separation of duties:** Same user submits and tries to approve → blocked
- [ ] **Budget health:** Spend tracking shows correct percentages

---

## Sprint 5 (Week 5) — Invoice Verification

### Prompt for Agent

```
You are continuing DEVOS development. Sprint 4 is complete and verified:
- Budget setup with phases, categories, allocations
- Price index with Nigerian construction materials
- Site manager purchase request flow with GUARDIAN analysis
- Auto-approve/reject logic working
- Separation of duties enforced on approvals
- Developer approval interface with flag severity

Your deliverables for Sprint 5 (T5.1–T5.8):

1. T5.1 — Contractor Portal:
   - Login (email/password or magic link)
   - View own contracts and assigned projects
   - Submit invoices
   - View invoice status and payment history

2. T5.2 — on-invoice-submitted Edge Function:
   - Validate ALL 5 evidence types present:
     * before_photo_urls (min 2)
     * after_photo_urls (min 3)
     * delivery_receipt_url (required)
     * work_completion_cert_url (required)
     * measurement_cert_url (required for labour invoices)
   - Block submission if any required evidence is missing
   - Dispatch GUARDIAN Agent job for invoice analysis

3. T5.3 — GUARDIAN invoice analysis (6 checks):
   Check 1: Rate vs contract rate
   Check 2: Progress claimed vs site manager's last progress_update
   Check 3: Quantity invoiced vs BOQ remaining
   Check 4: Cumulative invoiced vs total BOQ
   Check 5: Photo analysis (GPT-4o Vision via LiteLLM) — do photos show actual work?
   Check 6: Duplicate detection — similar amount + description within 30 days
   
   Each check produces a flag: CLEAR / INFO / WARNING / CRITICAL
   Auto-approve/reject logic applies after all 6 checks complete.
   Store flags in invoice_flags table.

4. T5.4 — Site manager verification step:
   - After GUARDIAN analysis, site manager confirms or disputes
   - site_manager_verified field on invoices

5. T5.5 — Invoice flag system UI:
   - Display flags with severity colors
   - Expand to see details of each check
   - Resolved/unresolved toggle

6. T5.6 — Payment approval workflow:
   - Developer sees invoice with all flags
   - Approve → Payment Ticket generated
   - Retract before finance processes → cancel ticket (check ticket status before cancel)

7. T5.7 — Payment tickets + PDF:
   - Generate Payment Ticket PDF with reference code
   - Generate to temp → validate → move to permanent storage

8. T5.8 — Finance notification:
   - Email via email-mcp when new Payment Ticket is ready
   - Include ticket reference, amount, contractor name

Key references: Section 5 (GUARDIAN Invoice features), Section 6 (Flow 3+4), 
Section 7 (on-invoice-submitted spec).
```

### Verification Checklist

- [ ] **Contractor portal:** Contractor logs in, sees own contracts
- [ ] **Invoice submission:** Upload all 5 evidence types → accepted
- [ ] **Incomplete evidence:** Missing delivery receipt → submission blocked
- [ ] **GUARDIAN 6 checks:** All 6 checks run; correct flags generated
- [ ] **Photo analysis:** Send construction photos → GPT-4o Vision provides assessment
- [ ] **Auto-approve:** Invoice passes all checks → advances automatically
- [ ] **Auto-reject:** Invoice 31% above contract rate → rejected
- [ ] **Payment Ticket:** Approved invoice → ticket PDF generated → finance notified
- [ ] **Retraction:** Developer retracts approval before finance processes → ticket cancelled

---

## Sprint 6 (Week 6) — GUARDIAN Dashboard & Reports

### Prompt for Agent

```
You are continuing DEVOS development. Sprint 5 is complete and verified:
- Contractor Portal with invoice submission (5 evidence types)
- GUARDIAN Agent runs 6 checks (including GPT-4o Vision for photos)
- Auto-approve/reject based on flag severity and budget impact
- Invoice flag system with severity display
- Payment Ticket generation with PDF
- Finance notification via email-mcp
- Separation of duties enforced

Your deliverables for Sprint 6 (T6.1–T6.8):

1. T6.1 — GUARDIAN dashboard:
   - Budget overview per project (spent vs allocated per phase)
   - Invoice pipeline (submitted → analyzing → flagged → approved → paid)
   - Active flags requiring attention

2. T6.2 — Budget trend chart (Recharts):
   - Spending over time per phase
   - Projected vs actual
   - Budget ceiling line

3. T6.3 — Guardian Savings Tracker:
   - Total amount saved by catching overcharges (sum of CRITICAL + WARNING flag amounts)
   - Display as a prominent metric

4. T6.4 — Burn rate vs remaining budget (early warning):
   - Simple calculation: current monthly burn rate × remaining months vs remaining budget
   - NOT a full predictive engine (that's Phase 4)
   - Display as: "At current pace, budget will be exhausted by [date]"
   - Flag if projected exhaustion is before project completion date

5. T6.5 — weekly-jv-report Edge Function:
   - Monday 7am scheduled
   - Compiles: invoices submitted/approved/paid, budget spent/remaining, 
     flags generated/resolved, contractor payments
   - Sends via email-mcp
   - On agent failure → fallback email: "Report generation failed. Check dashboard."

6. T6.6 — GUARDIAN → Command Dashboard integration:
   - Add GUARDIAN metrics to main dashboard KPI cards
   - Add budget health to flag queue
   - Invoice flags appear in "Needs Attention" section

7. T6.7 — mcp_tool_calls viewer:
   - Super admin view of all MCP tool invocations
   - Filterable by tool_name, status, org

8. T6.8 — credential-health-check Edge Function:
   - Daily scheduled
   - Tests each org's stored credentials (WhatsApp token, Meta token, etc.)
   - Updates org_credentials.status and last_verified_at
   - Alerts org_admin when credentials expiring or invalid

Key references: Section 5 (GUARDIAN dashboard features).
```

### Verification Checklist

- [ ] **Dashboard:** Budget overview shows correct spent vs allocated
- [ ] **Trend chart:** Spending trend renders correctly over time
- [ ] **Savings tracker:** Shows cumulative savings from caught overcharges
- [ ] **Burn rate:** Displays correct "budget exhausted by" date
- [ ] **JV report:** Trigger manually → report email received with correct data
- [ ] **Command Dashboard:** GUARDIAN metrics visible alongside PRESELL metrics
- [ ] **Credential check:** Run manually → reports credential status per org

### After Sprint 6 Passes — PHASE 2 GATE

- [ ] **Full E2E:** Contractor submits invoice → GUARDIAN analyzes → flags → developer approves → Payment Ticket → finance confirms → paid (status shows in contractor portal)
- [ ] **Test auto-approve** with a clean invoice
- [ ] **Test auto-reject** with an over-market invoice
- [ ] **Verify separation of duties** works end-to-end
- [ ] **JV report** fires on Monday morning

Tell the agent:
> "Phase 2 is complete and fully verified. GUARDIAN invoice verification and budget
> tracking work end-to-end. Move to Phase 3."

---

# PHASE 3: INTELLIGENCE (Weeks 7–10)

**Goal:** AdEngine live → Campaign creation → Creative approval → 48h optimisation → Attribution → Telegram channel

---

## Sprint 7 (Week 7) — AdEngine Setup

### Prompt for Agent

```
You are continuing DEVOS development. Phase 2 is complete and verified:
- GUARDIAN invoice verification with 6 checks (including GPT-4o Vision)
- Budget tracking, auto-approve/reject, separation of duties
- Payment Ticket workflow with finance confirmation
- Budget dashboard, burn rate early warning, savings tracker
- Weekly JV report, credential health checks
- Command Dashboard integrates both PRESELL and GUARDIAN metrics

Your deliverables for Sprint 7 (Phase 3, T7.1–T7.7):

1. T7.1 — Campaign setup UI:
   - Name, objective, target reservations, budget (₦), duration, platforms
   - Budget validation: ₦0 → block
   - Campaign status: DRAFT → PENDING_APPROVAL → ACTIVE → PAUSED → COMPLETED

2. T7.2 — Audience template library:
   - Pre-configured Nigerian market audiences (Lagos HNI, Diaspora UK, 
     First-time buyers, Real estate investors)
   - Custom audience creation with parameter validation

3. T7.3 — Magic Link tracking (UUID-based):
   - Generate unique tracking_links per ad/audience/creative combination
   - UTM parameters auto-populated
   - Click counting

4. T7.4 — meta-ads-mcp server:
   - get_campaigns, get_ad_set_performance
   - pause_ad_set, resume_ad_set
   - adjust_daily_budget (within ±40% only)
   - Per-org Meta System User token from Vault
   - BLOCKED: increase total budget, create new campaigns (requires human)

5. T7.5 — ADENGINE Agent system prompt:
   - Uses GPT-4o-mini (via LiteLLM), fallback Claude Haiku
   - Generate ad copy variants (3 per creative)
   - Analyse performance data and recommend optimisations
   - Context: property details, target audience, Nigerian market knowledge

6. T7.6 — Creative Factory:
   - Generate copy variants via ADENGINE Agent
   - Video generation via video-mcp (fal.ai) — if fal.ai account is ready
   - Store creatives in ad_creatives table

7. T7.7 — Creative approval workflow:
   - Developer reviews generated creatives before publishing
   - Approve / Reject / Edit
   - All rejected → creative stays DRAFT
   - If Meta rejects after publish → surface error with reason

Key references: Section 5 (ADENGINE features).
```

### Verification Checklist

- [ ] **Campaign setup:** Create campaign with budget, dates, audiences → saved correctly
- [ ] **Audience templates:** Pre-configured audiences load; custom audience validates
- [ ] **Tracking links:** UUID-based links generated per creative
- [ ] **meta-ads-mcp:** Can read Meta campaign data via API
- [ ] **Ad copy:** ADENGINE Agent generates 3 copy variants
- [ ] **Creative approval:** Developer can approve/reject creatives

---

## Sprint 8 (Week 8) — Performance & Optimisation

### Prompt for Agent

```
Sprint 7 is complete and verified. Campaign setup, meta-ads-mcp, creative generation,
and approval workflow are all working.

Your deliverables for Sprint 8 (T8.1–T8.6):

1. T8.1 — ad-performance-sync Edge Function (every 6 hours):
   - Pull metrics from Meta via meta-ads-mcp for all active campaigns
   - Store in ad_performance table
   - On API rate limit → skip, alert super_admin, retry next cycle

2. T8.2 — AdEngine performance dashboard:
   - Campaign-level metrics: impressions, clicks, CTR, leads, spend, ROAS
   - Creative-level comparison
   - Charts over time (Recharts)

3. T8.3 — ADENGINE 48h optimisation:
   - After 48h of data, ADENGINE Agent analyses performance
   - Pause underperforming ads (CTR below campaign average by >50%)
   - Scale top performers (increase daily budget ≤40%)
   - If ALL underperforming → keep the least-bad, alert developer
   - Agent logs the reasoning for each decision

4. T8.4 — Ad fatigue detection:
   - CTR decline >30% over 7 days → flag for creative refresh
   - No recent data → skip cycle

5. T8.5 — Retargeting audience automation:
   - Build retargeting audiences from lead data (visited landing page, 
     submitted form but didn't convert)

6. T8.6 — Lead attribution tracking:
   - Last-click attribution per lead via tracking_links
   - Ad paused/deleted → preserve attribution record

Key references: Section 5 (ADENGINE features), Section 7 (ad-performance-sync).
```

---

## Sprint 9 (Week 9) — Telegram & Refinement

### Prompt for Agent

```
Sprint 8 is complete. Ad performance sync, optimisation, fatigue detection, and 
attribution all working.

Your deliverables for Sprint 9 (T9.1–T9.4):

1. T9.1 — Materials price trend view (chart showing index changes over time)

2. T9.2 — MASTER Agent refinement:
   - Include AdEngine metrics in morning brief
   - Include GUARDIAN flags in morning brief
   - Full brief should cover all three modules

3. T9.3 — Full agent_logs dashboard:
   - All agent types, all costs, model distribution chart
   - Per-org cost breakdown matching llm_config budget caps
   - Alert when org nears 80% of monthly budget

4. T9.4 — Telegram channel implementation:
   - Build telegram-mcp: send_text, send_media, send_inline_keyboard, read_inbound
   - Implement telegram_channel.ts (the interface was defined in Sprint 1)
   - Add Telegram webhook handling to on-messaging-inbound Edge Function
   - Add org setting to enable Telegram channel
   - Test: lead qualification conversation works identically over Telegram
   - Inline keyboards: use for quick-reply buttons during qualification

Key references: Section 2 (Messaging Channel), Section 7 (telegram-mcp tools).
```

---

## Sprint 10 (Week 10) — Attribution, Analytics & E2E

### Prompt for Agent

```
Sprint 9 is complete. Telegram channel works, MASTER Agent covers all modules,
agent cost dashboard shows per-org breakdown.

Your deliverables for Sprint 10 (T10.1–T10.6):

1. T10.1 — Revenue attribution report:
   - Monthly ROAS per ad / audience / platform
   - Zero conversions → show "insufficient data"

2. T10.2 — Lead-to-revenue traceability:
   - For any buyer, trace back: which ad → which click → which lead → 
     which conversations → which reservation → which payments

3. T10.3 — PRESELL analytics dashboard:
   - Conversion funnel: leads → qualified → HOT → reserved → sold
   - Average qualification time, cost per lead, cost per reservation

4. T10.4 — Final Command Dashboard:
   - Integrate all three modules (PRESELL + GUARDIAN + ADENGINE)
   - Single-screen overview as described in PRD
   - <2 minute daily review target

5. T10.5 — End-to-end integration testing:
   - Test buyer journey: ad click → qualification → reservation → payment → portal
   - Test contractor journey: login → submit → analysis → approval → payment → status
   - Test morning brief accuracy over 3-day simulation
   - Test Telegram qualification flow
   - Test cross-org data isolation with 3 test orgs

6. T10.6 — Performance optimisation:
   - Dashboard load time < 2 seconds
   - Messaging response < 60 seconds
   - PDF generation < 10 seconds
```

### After Sprint 10 Passes — PHASE 3 GATE

- [ ] **Full buyer journey** (ad → reservation) works via both WhatsApp AND Telegram
- [ ] **Full contractor journey** works end-to-end
- [ ] **Attribution** traces correctly from ad to revenue
- [ ] **Command Dashboard** shows all three modules on one screen
- [ ] **Morning brief** covers all modules
- [ ] **Cross-org isolation** verified with 3 orgs
- [ ] **Performance** meets targets (dashboard <2s, messaging <60s)

---

# PHASE 4: POLISH (Weeks 11–14)

### Prompt for Agent

```
You are continuing DEVOS development. Phases 1-3 are complete and verified:
- Full lead-to-reservation pipeline via WhatsApp AND Telegram
- GUARDIAN invoice verification with 6 checks, auto-approve/reject, budget tracking
- AdEngine with campaign management, 48h optimisation, attribution
- Command Dashboard integrates all three modules
- All agent types working via LiteLLM (Haiku, Sonnet, GPT-4o-mini, GPT-4o Vision)

Your deliverables for Phase 4 (Section 11, T11.1–T11.19):

DOCUMENT GENERATION:
- T11.1: Sale Agreement auto-generation from template
- T11.2: E-signature integration (DocuSign API)
- T11.3: Notice of Default generation (triggered at 30-day overdue)

DEFERRED ITEMS (from Phase 3 scope reduction):
- T11.15: Google Ads MCP (google-ads-mcp)
- T11.16: TikTok Ads MCP (reuse 90% of meta-ads-mcp patterns)
- T11.17: Full predictive overrun engine (now with 10+ weeks of data)
- T11.18: Contractor performance scoring (now with real invoice data)
- T11.19: Lookalike audience builder (now with buyer data)

ENHANCEMENTS:
- T11.4: Contractor performance dashboard
- T11.5: Buyer upgrade module (unit upgrades/add-ons)
- T11.6: Diaspora flow refinement (GBP/USD pricing, trust content)
- T11.7: Multi-language messaging (Pidgin-aware system prompt, not full translation)
- T11.8: Unit floor plan SVG viewer
- T11.9: Construction photo gallery
- T11.10: DEVOS mobile PWA

QUALITY:
- T11.11: Comprehensive error handling audit (review all Edge Functions + Worker)
- T11.12: Security audit + penetration testing prep
- T11.13: UAT: 5 buyer journeys + 3 contractor journeys with real data
- T11.14: Load testing (200 concurrent sessions target)

Note: this is a larger phase. Take tasks in the order listed.
Exchange rate edge case: cache last-known rate with timestamp, display "Rate as of 
[date]", block if rate is >24h stale.
```

---

# PHASE 5: SaaS (Months 4–6)

### Prompt for Agent

```
You are continuing DEVOS development. Phases 1-4 are complete, tested, and live 
for the Primerose deployment. The application is now being prepared for multi-tenant 
SaaS deployment.

Your deliverables for Phase 5 (Section 11, T12.1–T14.3):

MULTI-TENANT VERIFICATION:
- T12.1: Architecture review — verify all tables have org_id, all RLS works, 
  all Edge Functions check org context
- T12.2: Organisation onboarding wizard (<2 hours from signup to first lead):
  1. Create organisation (name, slug)
  2. Connect WhatsApp Business API credentials
  3. Upload project details (units, pricing, media)
  4. Configure LLM budget limits
  5. Launch first campaign
- T12.3: White-label configuration (logo, colours, subdomain)
- T12.4: Instance isolation verification (automated test: create org, add data, 
  verify invisibility from other orgs)

BILLING:
- T13.1: Subscription tiers UI (Starter/Growth/Enterprise with LLM budget caps)
- T13.2: Paystack integration (Nigerian naira payments)
- T13.3: Stripe integration (international payments — confirmed over Flutterwave)
- T13.4: Usage metering (LLM costs, messages sent, storage used)
- T13.5: Client admin dashboard (super_admin view of all orgs, health, billing)

ONBOARDING:
- T14.1: Guided onboarding wizard with progress tracking
- T14.2: Template library (starting templates for landing pages, documents)
- T14.3: In-app help system

Super Admin features:
- Impersonation mode must be READ-ONLY (enforced at DB with separate JWT claims)
- Audit log every impersonation session
- Usage dashboard per org
```

---

# Quick Reference: What to Say Between Sprints

| Transition | What to Tell the Agent |
|------------|----------------------|
| Sprint 1 → 2 | "Sprint 1 verified. Schema, RLS, Agent Engine Worker, landing page, smoke test all pass." |
| Sprint 2 → 3 | "Sprint 2 verified. PRESELL qualification works on WhatsApp, scoring updates, hot lead alerts fire." |
| Sprint 3 → Phase 2 | "Phase 1 complete. Full lead-to-reservation pipeline verified end-to-end." |
| Sprint 4 → 5 | "Sprint 4 verified. Budget setup, purchase requests, GUARDIAN analysis, auto-approve/reject all work." |
| Sprint 5 → 6 | "Sprint 5 verified. Contractor invoice flow with 5 evidence types, 6 GUARDIAN checks, Payment Tickets work." |
| Sprint 6 → Phase 3 | "Phase 2 complete. Full contractor invoice-to-payment pipeline verified." |
| Sprint 7 → 8 | "Sprint 7 verified. Campaign setup, meta-ads-mcp, creative generation + approval work." |
| Sprint 8 → 9 | "Sprint 8 verified. Performance sync, 48h optimisation, attribution tracking work." |
| Sprint 9 → 10 | "Sprint 9 verified. Telegram channel works, MASTER Agent covers all modules." |
| Sprint 10 → Phase 4 | "Phase 3 complete. All three modules integrated, Telegram working, E2E tests pass." |
| Phase 4 → 5 | "Phase 4 complete. Documents, deferred items, PWA, security audit prep done." |

---

*This playbook is your implementation GPS. Follow it sprint by sprint and you'll go from zero to a production multi-tenant SaaS in 14 weeks.*
