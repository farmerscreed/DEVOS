# DEVOS Technical Architecture Document

**Version 2.0 | March 2026**
**Prepared by:** Senior Software Architect
**Based on:** PRD v1.2, Implementation Plan v1.0, Enhanced Brief (resolved), Senior Architect Review (v1.0)

---

## MCP Server Configuration

### Connected MCP Servers

| Server Name | Project Ref | Purpose | Status |
|-------------|-------------|---------|--------|
| `supabase` | hxeqqgwcdnzxpwtsuuvv | Default project | Active |
| `supabase-devos` | gvcadlzjpsfabrqkzdwt | DEVOS project | Active |
| `github` | farmerscreed/DEVOS | GitHub repo | Active |
| `playwright` | - | Browser automation | Available |
| `vercel` | - | Vercel deployment | Available |

### Supabase Projects

1. **Default** (`supabase`): `hxeqqgwcdnzxpwtsuuvv.supabase.co`
   - Original/default Supabase project

2. **DEVOS** (`supabase-devos`): `gvcadlzjpsfabrqkzdwt.supabase.co`
   - New Supabase project specifically for the DEVOS application
   - Currently empty (ready for schema development)

### GitHub Repository

- **Owner**: farmerscreed
- **Repo**: DEVOS
- **Status**: Empty (just created, ready for initial commit)

---

## 1. App Identity

DEVOS (Real Estate Development Operating System) is a multi-tenant, AI-powered operating system for off-plan real estate developers in Nigeria and West Africa. It replaces the fragmented stack of sales agents, financial controllers, ad managers, and project coordinators with three integrated modules: **PRESELL** (autonomous lead-to-sale pipeline via messaging channel + paid ads), **GUARDIAN** (AI budget watchdog that catches overcharges before payment), and **COMMAND** (a single-screen daily dashboard). The target user is a real estate developer who spends 15–20 minutes per day reviewing a morning brief, approving flagged invoices, and taking hot-lead calls. Everything else runs autonomously via a purpose-built multi-model agent system with per-organisation data isolation.

A successful version of DEVOS handles the entire sales pipeline without human intervention (qualifying leads via messaging, converting to reservations, generating documents), monitors every contractor invoice against market rates and flags anomalies before payment, runs autonomous ad campaigns with budget optimization, and delivers a daily morning brief that requires less than 2 minutes to read. The first deployment is Primerose Smart City Cluster (200-unit development in Rivers State), but the architecture supports unlimited concurrent organisations with complete data isolation.

---

## 2. Tech Stack Decisions

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Frontend Framework** | React 18 + TypeScript + Vite | Industry-standard, type-safe, fast HMR. Vite provides excellent DX. |
| **Styling** | Tailwind CSS + shadcn/ui | Rapid UI development, consistent design tokens, accessible components. |
| **Multi-tenant Routing** | Vercel wildcard subdomains | Native wildcard SSL, automatic CI/CD, `[slug].devos.app` pattern. |
| **Backend/Database** | Supabase (PostgreSQL + Auth + Storage + Realtime) | All-in-one backend-as-a-service, RLS built-in, scales to 100+ orgs. |
| **Multi-tenancy** | `organisation_id` on every table + RLS policies | Database-enforced isolation, impossible to bypass at application level. |
| **Credential Store** | Supabase Vault | Encrypted per-org API credentials at rest, injected at MCP call time. |
| **Event Routing** | Supabase Edge Functions (Deno runtime) | Replaces n8n entirely—fast, cheap, deterministic, no AI cost for routing. |
| **AI Agent System** | DEVOS Agent Engine Worker (LiteLLM-powered) | Purpose-built multi-tenant agent system with model-agnostic routing. |
| **LLM Router** | LiteLLM | Unified OpenAI-compatible API across 100+ providers, built-in fallback chains, retry logic, per-request cost tracking. |
| **LLM Primary** | LiteLLM Router → routes to appropriate model per task | Model-agnostic routing (see Model Routing Table below). |
| **LLM Fallback** | Built into LiteLLM | Automatic fallback chains. |
| **LLM Local** | Ollama (out of scope for MVP) | Lightweight classification/summarisation for cost reduction. Deferred to Phase 4. |
| **Agent Tool Protocol** | MCP (Model Context Protocol) | All external service connections with per-client credential injection. |
| **Messaging Channel** | Custom channel_interface.ts + whatsapp-mcp + telegram-mcp | Pluggable messaging abstraction. WhatsApp in Phase 1, Telegram in Phase 2/3. |
| **WhatsApp** | Custom whatsapp-mcp (Meta WhatsApp Business Cloud API) | Send text/media/PDFs, read incoming, template messages. Per-org credentials. |
| **Telegram** | Custom telegram-mcp (Telegram Bot API) | Send text/media, inline keyboards for approval workflows. Phase 2/3. |
| **Ads** | Custom meta-ads-mcp | Read performance, pause/resume, adjust budgets within ±40%. Per-org credentials. |
| **Video** | Custom video-mcp (fal.ai API) | Generate ad creatives, replaces Veo3 — better pricing and accessibility. |
| **Email** | Custom email-mcp (Resend API) | JV reports, documents, notifications. Per-org sender identity. |
| **Documents** | Supabase Edge Function + React-PDF | Generate PDFs from org-scoped templates. |
| **Billing** | Paystack (Nigeria) + Stripe (international) | Phase 5. Dual-currency support. Stripe confirmed for international. |
| **Hosting** | Vercel | CI/CD from GitHub + wildcard subdomain support. |
| **Agent Engine Worker** | Railway / Fly.io / Vercel Serverless (Pro Plan) | Separate service from Supabase Edge Functions — no 150s timeout. |
| **Auth** | Supabase Auth (email/password + magic link + MFA) | Role-based per organisation, TOTP 2FA for org_admin. |
| **State** | TanStack Query + Zustand | Server state + UI state separation. |
| **Charts** | Recharts | React-native charting, lightweight. |
| **Version Control** | GitHub (private) | Full CI/CD pipeline. |

### Decisions Where PRD/Plan Was Vague

1. **DEVOS Agent Engine Runtime**: The PRD was vague on how the agent engine runs. **Decision:** Agent Engine Worker deployed on Railway/Fly.io/Vercel (separate from Supabase Edge Functions). Edge Functions dispatch work via `agent_queue` table. Worker calls LiteLLM, executes MCP tool calls in loop, writes results back. No timeout constraints. Cost metered per LLM call, tracked in `mcp_tool_calls` with cost_usd.

2. **LLM Selection**: The PRD specified Claude as the only LLM. **Decision:** Multi-model routing via LiteLLM. Each agent/task type uses a specific model based on cost/quality tradeoffs (see Model Routing Table below). Claude Sonnet only for GUARDIAN invoice analysis; cheaper models for high-volume tasks.

3. **Ollama on VPS**: Listed in PRD but no specific use case. **Decision:** Out of scope for MVP. All AI calls go through LiteLLM with appropriate models. Simpler architecture, acceptable cost for Phase 1.

4. **E-signature Provider**: Implementation Plan lists DocuSign/Zoho. **Decision:** DocuSign as industry standard for Phase 4.

5. **BOQ Parsing**: Implementation Plan underestimates complexity. **Decision:** MVP uses manual rate entry during budget setup. Automated parsing is Phase 4 enhancement.

6. **Messaging Channels**: PRD hardcoded WhatsApp. **Decision:** Plurable channel abstraction. WhatsApp + Telegram behind common interface. Telegram in Phase 2/3 (free, instant setup).

---

## 3. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Web App   │  │  WhatsApp   │  │  Telegram   │  │    Email    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
└─────────┼────────────────┼────────────────┼────────────────┼───────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER (React/Vercel)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Command    │  │   Buyer     │  │ Contractor  │  │   Sales     │        │
│  │  Dashboard  │  │   Portal    │  │   Portal    │  │   Agent     │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         └────────────────┴────────────────┴────────────────┘                │
│                           Subdomain Routing ([slug].devos.app)               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA LAYER (Supabase Multi-Tenant)                      │
│  ┌────────────────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL + RLS + Auth + Storage                   │   │
│  │         Every table: organisation_id (FK) + RLS policy                 │   │
│  └────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │  Edge Functions  │  │  Supabase Vault  │  │    Storage       │           │
│  │  (Deterministic)  │  │ (Per-org creds)  │  │   Buckets        │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                                │
│  │   agent_queue    │  │    llm_config    │                                │
│  │  (Job queue)     │  │  (Per-org model) │                                │
│  └──────────────────┘  └──────────────────┘                                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   INTELLIGENCE LAYER (DEVOS Agent Engine Worker)             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    LiteLLM Router                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────┐ │   │
│  │  │   PRESELL    │  │   GUARDIAN   │  │  ADENGINE   │  │  MASTER │ │   │
│  │  │  (Haiku)     │  │  (Sonnet)    │  │ (GPT-4o-mini)│ │ (Haiku) │ │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                     │                 │                 │                 │  │
│                     └─────────────────┴─────────────────┴─────────────────┘  │
│                     Claude (Anthropic) │ GPT-4o (OpenRouter) │ fal.ai         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MCP TOOL LAYER (Shared Infrastructure)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │whatsapp-mcp  │  │telegram-mcp  │  │ meta-ads-mcp │  │  email-mcp   │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                      │
│  │  video-mcp   │  │  pdf-mcp     │  │ supabase-mcp │                      │
│  └──────────────┘  └──────────────┘  └──────────────┘                      │
│                                                                              │
│   Per-Client Credential Injection: org_id → Vault → API call               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### LiteLLM Model Routing Table

The Intelligence Layer routes to different models based on task requirements:

| Agent / Task | Primary Model | Fallback Model | Rationale |
|-------------|---------------|----------------|-----------|
| PRESELL Agent (WhatsApp qualification) | Claude 3.5 Haiku (via Anthropic) | GPT-4o-mini (via OpenRouter) | Fast response needed, conversational quality, cost-effective |
| GUARDIAN Agent (invoice analysis) | Claude Sonnet (via Anthropic) | GPT-4o (via OpenRouter) | Highest reasoning quality needed for financial decisions |
| ADENGINE Agent (copy generation) | GPT-4o-mini (via OpenRouter) | Claude Haiku | Creative writing, cost-sensitive, high volume |
| MASTER Agent (morning brief) | GPT-4o-mini (via OpenRouter) | Claude Haiku | Summarisation is simpler, cost-sensitive |
| Lead scoring | Rule-based engine (NO LLM) | N/A | Deterministic — must NOT use an LLM |
| Photo analysis (GUARDIAN) | GPT-4o Vision (via OpenRouter) | Claude Vision | Multi-modal capability needed |
| Video generation | fal.ai | None | More accessible API, better pricing than Veo3 |
| Ad copy variants | GPT-4o-mini | Claude Haiku | High volume, cost-sensitive |

### Per-Org LLM Budget Caps

| Plan Tier | Monthly LLM Budget | Alert Threshold |
|-----------|-------------------|-----------------|
| Starter | ₦50,000/month | 80% (₦40,000) |
| Growth | ₦200,000/month | 80% (₦160,000) |
| Enterprise | ₦500,000/month (soft cap) | 80% (₦400,000) |

### Critical Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Multi-tenant from Sprint 1** | Retrofitting single-tenant to multi-tenant is one of the most expensive rebuilds. Costs 3 days at start vs months later. |
| **Shared database with RLS** | One Supabase instance scales to 100+ clients. Automatic data isolation enforced at DB level, impossible to bypass. |
| **Edge Functions replace n8n** | Removes runtime dependency, keeps deterministic routing fast/cheap, limits AI costs to tasks needing reasoning. |
| **Agent Engine Worker separate from Edge Functions** | Supabase Edge Functions have 150s timeout / 150MB memory. GUARDIAN Agent with multiple LLM calls exceeds this. Worker deployed on Railway/Fly.io has no timeout. |
| **LiteLLM for model routing** | Unified API, automatic fallbacks, per-request cost tracking critical for per-org billing. |
| **Messaging channel abstraction** | WhatsApp has per-message costs and 2-4 week verification. Telegram is free and instant. Both behind common interface. |
| **Per-client credential injection** | One MCP infrastructure, per-org credentials at call time. Scalable. Running separate MCP servers per client is not. |
| **organisation_id on EVERY table** | Non-negotiable. RLS policies use `get_active_org_id()` helper to enforce isolation. |
| **Active organisation in JWT** | Multi-org users (contractors, super_admins) need org-switcher. Active org stored in JWT claim. |

---

## 4. Data Models & Schema

All tables carry `organisation_id` as a non-nullable foreign key to `organisations`. RLS policies enforce complete data isolation between organisations.

### Core Tables

#### PLATFORM LAYER (Multi-Tenancy Root)

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `organisations` | id (UUID), name, slug (unique), plan_tier, billing_status, timezone, enabled_channels TEXT[] DEFAULT '{whatsapp}', created_at | slug: unique, 3-30 chars, lowercase alphanumeric + hyphens | Public read for subdomain routing |
| `subscriptions` | id, organisation_id (FK), plan_tier, status, current_period_start, current_period_end, monthly_rate_kobo | organisation_id: unique | org_members only |
| `org_credentials` | id, organisation_id (FK), provider (enum), encrypted_credentials (Vault), status, last_verified_at, updated_at | organisation_id + provider: unique | service role only |
| `org_members` | id, organisation_id (FK), user_id (FK to auth.users), role (enum), created_at | organisation_id + user_id: unique | org_members read, org_admin write |
| `agent_context` | id, organisation_id (FK), agent_type, context_json, updated_at | organisation_id + agent_type: unique | org_members only |
| `llm_config` | id, organisation_id (FK), task_type, primary_provider, primary_model, fallback_provider, fallback_model, max_tokens, temperature, monthly_budget_kobo, created_at | organisation_id + task_type: unique | org_members only |
| `feature_flags` | id, organisation_id (FK), flag_name (enum), enabled, updated_by, updated_at | organisation_id + flag_name: unique | super_admin only |
| `tracking_links` | id, organisation_id (FK), campaign_name, utm_source, utm_medium, utm_campaign, utm_content, destination_url, token (UUID), clicks, created_at | token: unique | org_members only |

#### PROJECT LAYER

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `projects` | id, organisation_id (FK), name, location, total_units, completion_date, status, created_at | organisation_id required | org_members only |
| `units` | id, organisation_id (FK), project_id (FK), unit_number, unit_type, floor, size_sqm, price_kobo, status (enum), buyer_id (FK), created_at | organisation_id + project_id + unit_number: unique | org_members read; buyer sees own |
| `payment_schedule` | id, organisation_id (FK), buyer_id (FK), reservation_id (FK), instalment_number, amount_kobo, currency, due_date, status (enum), paid_at, payment_in_id (FK) | organisation_id required | buyer sees own; org_members read |

#### PRESELL LAYER

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `leads` | id, organisation_id (FK), project_id (FK), source_ad, utm_campaign, utm_medium, utm_content, name, phone, email, city, country, budget_min, budget_max, investment_type, unit_interest, score, category, status, preferred_channel, assigned_agent_id, created_at | organisation_id required | org_members + sales_agent |
| `buyers` | id, organisation_id (FK), lead_id (FK), user_id (FK to auth.users), reservation_id (FK), unit_id (FK), created_at | organisation_id required | buyer sees own; org_members read |
| `reservations` | id, organisation_id (FK), unit_id (FK), buyer_id (FK), deposit_kobo, deposit_paid_at, payment_plan, status, expires_at, created_at | organisation_id required | buyer sees own; org_members read |
| `payments_in` | id, organisation_id (FK), buyer_id (FK), reservation_id (FK), amount_kobo, reference_code, receipt_url, confirmed_by, confirmed_at, status | organisation_id required | finance + org_admin |
| `documents` | id, organisation_id (FK), buyer_id (FK), reservation_id (FK), document_type (enum: 'reservation_letter', 'sale_agreement', 'notice_of_default', 'handover_certificate', 'payment_receipt'), file_url, status, created_at | organisation_id required | buyer sees own; org_members read |
| `message_threads` | id, organisation_id (FK), lead_id (FK), channel TEXT DEFAULT 'whatsapp', message_id (unique), direction, content, media_url, delivered_at, read_at | organisation_id + message_id: unique | org_members + agent |

#### ADENGINE LAYER

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `campaigns` | id, organisation_id (FK), project_id (FK), name, objective, target_reservations, total_budget_kobo, start_date, end_date, platforms[], status, created_at | organisation_id required | org_members only |
| `ad_sets` | id, organisation_id (FK), campaign_id (FK), platform, audience_name, budget_kobo, status, external_id | organisation_id + campaign_id required | org_members only |
| `ad_creatives` | id, organisation_id (FK), ad_set_id (FK), type, content, media_url, approval_status, external_id | organisation_id required | org_members only |
| `lead_attribution` | id, organisation_id (FK), lead_id (FK), ad_creative_id (FK), click_timestamp | organisation_id + lead_id: unique | org_members only |
| `ad_performance` | id, organisation_id (FK), ad_creative_id (FK), date, impressions, clicks, ctr, leads, spend_kobo, conversions, roas | organisation_id + ad_creative_id + date: unique | org_members only |

#### GUARDIAN LAYER

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `budget_phases` | id, organisation_id (FK), project_id (FK), phase_name, category, allocated_kobo, spent_kobo, status | organisation_id required | org_members only |
| `price_index` | id, material_name, unit, rate_kobo, region, effective_date | material_name + region + effective_date: unique | super_admin write; org_members read |
| `purchase_requests` | id, organisation_id (FK), project_id (FK), phase_id (FK), requested_by, description, quantity, unit_rate_kobo, supplier_name, evidence_urls[], status, guardian_analysis, created_at | organisation_id required | site_manager + org_admin |
| `contractors` | id, organisation_id (FK), name, email, phone, trade, contract_rate_kobo, reliability_score, status, user_id (FK to auth.users) | organisation_id + email: unique | org_members read; contractor sees own |
| `invoices` | id, organisation_id (FK), contractor_id (FK), project_id (FK), phase_id (FK), description, amount_kobo, before_photo_urls[], after_photo_urls[], delivery_receipt_url, work_completion_cert_url, measurement_cert_url, status, guardian_flags[], site_manager_verified, approved_by, payment_ticket_id (FK), created_at | organisation_id required | contractor sees own; org_members read |
| `invoice_flags` | id, organisation_id (FK), invoice_id (FK), severity (enum), check_type, details, resolved, resolved_by, resolved_at | organisation_id + invoice_id required | org_members only |
| `approvals` | id, organisation_id (FK), reference_type, reference_id, actor_id, action (enum), notes, created_at | organisation_id required | org_admin + finance |
| `payment_tickets` | id, organisation_id (FK), invoice_id (FK), amount_kobo, reference_code, status, generated_by, generated_at | organisation_id required | finance + org_admin |
| `payments_out` | id, organisation_id (FK), payment_ticket_id (FK), contractor_id (FK), amount_kobo, bank_reference, payment_date, status | organisation_id required | finance + org_admin |
| `progress_updates` | id, organisation_id (FK), project_id (FK), phase_id (FK), reported_by, percent_complete, summary, photo_urls[], submitted_at | organisation_id required | site_manager + org_admin |

#### SYSTEM LAYER

| Table | Fields | Constraints | RLS Policy |
|-------|--------|-------------|------------|
| `notifications` | id, organisation_id (FK), user_id (FK), type, title, message, read, created_at | organisation_id required | user sees own |
| `agent_logs` | id, organisation_id (FK), agent_type, event_type, input_summary, output_summary, tool_calls_json, reasoning_summary, status, duration_ms, model_used, input_tokens, output_tokens, cost_usd, provider, created_at | organisation_id required | org_members + super_admin |
| `mcp_tool_calls` | id, organisation_id (FK), tool_name, input_summary, output_summary, status, latency_ms, error_message, created_at | organisation_id required | super_admin only |
| `agent_queue` | id, organisation_id (FK), agent_type, payload JSONB, status, attempts, max_attempts, result JSONB, error_message, created_at, started_at, completed_at | organisation_id required | service role only |
| `error_logs` | id, organisation_id (FK), source, function_name, input_summary, error_message, stack_trace, created_at | organisation_id required | super_admin only |
| `config` | id, key, value_json, updated_at | key: unique | super_admin only |

### Auth Roles (Supabase Auth)

| Role | Description | RLS Access |
|------|-------------|------------|
| `super_admin` | LawOne Cloud platform admin | All orgs, all tables |
| `org_admin` | Developer/owner | Full access within own org |
| `sales_agent` | Sales rep | Leads, buyers, reservations, message_threads |
| `finance` | Accountant | Payments_in, payments_out, payment_tickets |
| `site_manager` | Construction supervisor | Purchase_requests, progress_updates |
| `buyer` | Unit purchaser | Own reservation, payments, documents |
| `contractor` | Vendor | Own invoices, own payment status |

### RLS Policy Pattern (Applied to Every Table)

```sql
-- Helper function to get active org_id from JWT (for multi-org users)
CREATE OR REPLACE FUNCTION get_active_org_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'active_organisation_id')::UUID;
$$ LANGUAGE sql STABLE;

-- RPC function to set active organisation at login/org-switch
CREATE OR REPLACE FUNCTION set_active_organisation(target_org_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Verify user is member of target org
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE user_id = auth.uid() AND organisation_id = target_org_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;

  -- Update JWT custom claim
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('active_organisation_id', target_org_id)
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Example: Leads table org isolation using active org
CREATE POLICY "org_isolation_leads" ON leads
  USING (organisation_id = get_active_org_id());

-- Buyer sees own record only
CREATE POLICY "buyer_own_record" ON leads
  USING (buyer_user_id = auth.uid());
```

### Database Indexes (Created in Sprint 1)

- `leads(organisation_id, status, score DESC)`
- `invoices(organisation_id, status, submitted_at DESC)`
- `payments_in(organisation_id, buyer_id, confirmed_at DESC)`
- `message_threads(organisation_id, contact_phone, channel, created_at DESC)`
- `agent_logs(organisation_id, agent_type, created_at DESC)`
- `agent_queue(organisation_id, status, created_at)`

---

## 5. Feature Breakdown

### PRESELL Module

| Feature | Description | Components | Edge Cases | Priority |
|---------|-------------|------------|------------|----------|
| **Lead Capture Form** | Branded landing page with hero, unit cards, payment calculator, lead form + reCAPTCHA v3 | Landing page component, on-lead-created Edge Function | Duplicate submission (same phone/email within 24h) → upsert; Bot detection with score <0.3 → reject | CORE |
| **Lead Scoring** | Rule-based 0-100 score based on signal categories (NO LLM) | scoring algorithm in on-lead-created | All positive signals capped at 100; all negative capped at 0 | CORE |
| **Messaging Qualification** | Multi-turn AI conversation via WhatsApp or Telegram | PRESELL Agent, channel_interface.ts, whatsapp-mcp/telegram-mcp | Out-of-order messages; media instead of text; restart after 48h silence | CORE |
| **Hot Lead Escalation** | Score ≥70 triggers notification to sales agent | Edge Function, notifications table | Agent offline → escalation persists until acknowledged | CORE |
| **Unit Inventory** | Real-time availability grid (Available/Reserved/Sold/Held) | units table, landing page component | Two simultaneous reservations → SELECT FOR UPDATE | CORE |
| **Reservation Workflow** | Unit selection → payment instructions → receipt upload → finance confirmation | reservation flow, on-payment-confirmed Edge Function | Receipt rejected → unit returns to Available | CORE |
| **Buyer Portal** | Payment progress bar, construction status, documents, support chat | Buyer Portal components, payments_in table, channel_router | No payments yet → show "first payment due" card; Support chat routes via messaging channel | CORE |
| **Payment Reminders** | 7d before, 3d before, due date, overdue escalation | payment-reminder Edge Functions | Multiple overdue → send consolidated notice | CORE |
| **Overdue Escalation** | Due date → 3d → 7d → 14d (agent escalation) → 30d (Notice of Default) | payment-overdue Edge Function | 30d → auto-generate DRAFT Notice of Default | IMPORTANT |
| **Magic Link Tracking** | UUID-based UTM-tagged URLs for attribution (prevents enumeration) | tracking_links table, on-lead-created Edge Function | No UTM → attribute to "Direct/Organic" | IMPORTANT |
| **Document Generation** | Reservation Letter, Sale Agreement, Notice of Default, Handover Certificate | pdf-mcp Edge Function | Template not found → log error, alert admin | IMPORTANT |

### GUARDIAN Module

| Feature | Description | Components | Edge Cases | Priority |
|---------|-------------|------------|------------|----------|
| **Budget Setup** | Phases, categories, amounts, contingency | Budget setup UI, budget_phases table | BOQ upload → reference PDF only, manual rate entry | CORE |
| **Purchase Request** | Site manager submits request with evidence | Site Manager View, on-purchase-request Edge Function | Missing evidence → block submission | CORE |
| **Price Analysis** | Compare request vs market index, flag >5% above | GUARDIAN Agent | Exactly 5% → flag as INFO | CORE |
| **Invoice Submission** | Contractor portal with mandatory evidence (5 types) | Contractor Portal, on-invoice-submitted Edge Function | Incomplete evidence → block submission | CORE |
| **Invoice Verification** | 6 checks: rate vs contract, progress vs site manager, quantity vs BOQ, cumulative BOQ, photo analysis, duplicate detection | GUARDIAN Agent | No progress data to compare → flag as INFO | CORE |
| **Auto-Approve** | Low Risk: All checks pass, within budget, price within market range → advance to payment without developer review | GUARDIAN Agent | Configurable per-org | IMPORTANT |
| **Auto-Reject** | Block: Price >30% above market OR would breach budget ceiling → reject automatically | GUARDIAN Agent | Configurable per-org | IMPORTANT |
| **Separation of Duties** | Submitter cannot approve their own request/invoice | on-approval-granted Edge Function | Enforced at RLS/application level | CORE |
| **Flag System** | Severity levels: CLEAR, INFO, WARNING, CRITICAL | invoice_flags table | Critical flag → auto-pause payment | CORE |
| **Approval Workflow** | Developer approves → Payment Ticket → Finance | on-approval-granted Edge Function | Retract before finance processes → cancel ticket | CORE |
| **Payment Ticket** | System-generated reference, PDF | payment_tickets table, pdf-mcp | PDF generation fails → retry, don't leave in limbo | CORE |
| **Finance View** | Payment ticket queue, mark as PAID with bank reference | Finance View components | Wrong reference → allow note discrepancy | CORE |
| **JV Weekly Report** | Monday 7am automated report | weekly-jv-report Edge Function, email-mcp | Agent fails → send fallback "check dashboard" | IMPORTANT |
| **Budget Dashboard** | Real-time spend vs plan, health indicators | GUARDIAN dashboard components | Budget at 84.9% → flag WARNING | IMPORTANT |
| **Burn Rate vs Remaining Budget** | Early warning calculation (simplified predictive) | GUARDIAN dashboard | Full predictions deferred to Phase 4 | IMPORTANT |

### ADENGINE Module

| Feature | Description | Components | Edge Cases | Priority |
|---------|-------------|------------|------------|----------|
| **Campaign Setup** | Name, objective, budget, duration, platforms, audiences | Campaign UI, campaigns table | ₦0 budget → block at validation | CORE |
| **Audience Templates** | Pre-configured Nigerian market audiences | Audience library | Custom audience → validate parameters | IMPORTANT |
| **Magic Link Generation** | UTM-tagged URLs per ad/audience/creative | tracking_links table, on-lead-created Edge Function | Duplicate UTM → overwrite | IMPORTANT |
| **Creative Factory** | Generate copy variants (3 per creative), video via video-mcp (fal.ai) | ADENGINE Agent, video-mcp | All 0 approved → stay DRAFT | IMPORTANT |
| **Creative Approval** | Developer reviews before publish | Approval workflow UI | Meta rejects → surface error with reason | IMPORTANT |
| **Performance Sync** | Every 6 hours pull metrics | ad-performance-sync Edge Function | API rate limit → skip, alert super admin | IMPORTANT |
| **48h Optimisation** | Pause underperformers, scale top performers ≤40% | ADENGINE Agent | All underperforming → keep least-bad, alert | IMPORTANT |
| **Ad Fatigue Detection** | CTR decline >30% over 7 days | ADENGINE Agent | No recent data → skip cycle | ENHANCEMENT |
| **Lead Attribution** | Last-click attribution per lead | lead_attribution table | Ad paused/deleted → preserve attribution | IMPORTANT |
| **Revenue Attribution Report** | Monthly ROAS per ad/audience/platform | Report generation | Zero conversions → show "insufficient data" | ENHANCEMENT |
| **Google Display & YouTube Ads** | Deferred to Phase 4 | google-ads-mcp | Interim: YouTube video ads via Meta Ads Manager | PHASE 4 |

### COMMAND DASHBOARD Module

| Feature | Description | Components | Edge Cases | Priority |
|---------|-------------|------------|------------|----------|
| **Morning Brief** | 7am per org timezone WhatsApp synthesis of overnight activity | morning-brief Edge Function, MASTER Agent | Exceeds 4096-char → truncate to top 5 items, add "See dashboard" link; Zero activity → "All clear" not empty | CORE |
| **KPI Dashboard** | Units, revenue, leads, budget health | Command Dashboard components | No data → show setup checklist | CORE |
| **Flag Queue** | Pending approvals, hot leads, critical invoices | Dashboard components | Empty → show "nothing needs attention" | CORE |
| **Agent Logs Viewer** | Full audit trail of AI decisions with model/cost tracking | agent_logs table UI | Large dataset → paginate, filter by date | IMPORTANT |

### Platform Layer Features

| Feature | Description | Components | Edge Cases | Priority |
|---------|-------------|------------|------------|----------|
| **Multi-tenant Subdomain** | [slug].devos.app routing | Vercel config, React routing | Slug taken → show "taken" instantly; Prevent confusable slugs | CORE |
| **Org-switcher** | UI for users with multiple org memberships | React components, JWT active_org | Must switch org on login if >1 membership | CORE |
| **Org Onboarding** | <2 hour to first lead | Onboarding wizard | Incomplete setup → block campaign launch | IMPORTANT |
| **Subscription Billing** | Paystack + Stripe integration | subscriptions table, billing UI | Payment fails → 7-day grace period | PHASE 5 |
| **Super Admin** | All orgs, usage, health, impersonation | Super Admin panel | Impersonation → read-only enforced at DB | PHASE 5 |
| **Credential Health Check** | Daily scheduled Edge Function tests stored credentials | credential-health-check Edge Function | Alerts org_admin when credentials near expiry or invalid | IMPORTANT |

---

## 6. User Flows

### Flow 1: Lead to Reservation (Happy Path)

1. **Lead clicks Magic Link** → `devos.primerose.ng/ref/a3f82b1c-...` (UUID-based)
2. **Landing page loads** → Unit cards, payment calculator, hero video
3. **Lead submits form** → reCAPTCHA v3 validation, Name, Phone, Email, Budget, Unit Interest
4. **on-lead-created Edge Function fires** → Creates lead, calculates score, tags source
5. **PRESELL Agent triggered** → Composes opening message via channel_router
6. **Message sent via preferred channel** → WhatsApp: "Hi Amaka! Thanks for your interest in Primerose..." or Telegram equivalent
7. **Lead replies** → Messaging webhook → on-inbound → Agent responds
8. **Qualification progresses** → Agent asks questions, scores update after each turn
9. **Lead score hits 70+** → Status → HOT → Sales agent notification
10. **Sales agent follows up** → Human conversation → Reservation intent
11. **Buyer selects unit** → Unit changes to Reserved status
12. **Payment instructions sent** → Reference code generated, details sent via channel
13. **Buyer uploads receipt** → Payment confirmed by finance
14. **Reservation confirmed** → Unit → Reserved, Buyer Portal activates
15. **Reservation Letter generated** → PDF sent via messaging channel + email

### Flow 2: Lead to Reservation (Edge Cases)

| Step | Edge Case | Handling |
|------|-----------|----------|
| Lead form submit | Duplicate phone/email within 24h | Upsert existing lead, don't create new, don't trigger new conversation |
| Messaging conversation | Message delivered twice | Check message_id, reject duplicates |
| LLM API timeout | Agent fails to respond | 30s timeout → fallback model → queue for retry in 5min → on 3rd failure: log FAILED, alert super_admin, send "temporarily unavailable" |
| Two buyers reserve same unit | Race condition | SELECT FOR UPDATE on units table; first confirmed wins |
| Lead goes 30+ turns without progress | Conversation stalls | Auto-escalate to human, mark as NEEDS_INTERVENTION |
| Morning brief exceeds WhatsApp limit | >4096 characters | Truncate to top 5 items per category, add "See dashboard" link |

### Flow 3: Contractor Invoice to Payment (Happy Path)

1. **Contractor logs in** → Contractor Portal
2. **Contractor fills invoice form** → Amount, description, 5 evidence types (before photos min 2, after photos min 3, delivery receipt, work completion cert, measurement cert)
3. **Contractor submits** → Evidence validated (all types present)
4. **on-invoice-submitted Edge Function fires** → Creates invoice record
5. **GUARDIAN Agent triggered** → Retrieves contract rates, BOQ, site progress
6. **Agent runs 6 checks** → Rate vs contract, quantity vs BOQ, photo analysis, etc.
7. **Flag report generated** → Severity assigned, details stored
8. **Auto-decision check** → If all clear + within budget + price within range → Auto-approve; If >30% above market OR would breach budget → Auto-reject
9. **If manual review needed** → Developer notified via messaging + dashboard flag queue
10. **Developer reviews** → Approve / Adjust / Reject
11. **If approval granted** → on-approval-granted fires (validates submitter != approver)
12. **Payment Ticket generated** → PDF created, reference code
13. **Finance notified** → Email via email-mcp
14. **Finance confirms payment** → Optimistic locking on ticket status, marks PAID with bank reference
15. **payments_out recorded** → Budget dashboard updates in real-time

### Flow 4: Contractor Invoice to Payment (Edge Cases)

| Step | Edge Case | Handling |
|------|-----------|----------|
| Invoice submitted | Evidence incomplete | Block submission, show required fields |
| GUARDIAN analysis | No progress data to compare | Flag as INFO, don't block |
| Invoice for phase <50% complete | Site manager hasn't reported | GUARDIAN flags as CRITICAL, blocked |
| Submitter == Approver | Separation of duties violation | REJECT with "Submitter cannot approve their own request" |
| Developer approves then retracts | Before finance processes | Cancel Payment Ticket, update status |
| Finance marks PAID with wrong amount | Typo in reference | Allow note, but record actual amount |
| Concurrent approval + payment | Race condition | Optimistic locking on payment_tickets.status |

### Flow 5: Daily Morning Brief

1. **Scheduled trigger fires** → 7am per org timezone (using `now() AT TIME ZONE org.timezone`)
2. **Edge Function compiles overnight data** → New leads, payments, invoices, flags
3. **MASTER Agent triggered** → Receives data snapshot + org context (GPT-4o-mini)
4. **Agent synthesises** → 2-3 key decisions, everything else handled
5. **Brief sent via messaging channel** → "Good morning! Here's your brief..."
6. **If exceeds 4096 chars** → Truncate to top 5 items, add dashboard link
7. **Developer reads** → <2 minutes

### Flow 6: Morning Brief (Edge Cases)

| Step | Edge Case | Handling |
|------|-----------|----------|
| Zero overnight activity | No leads, payments, flags | Send "All clear — nothing requires attention" |
| Agent Engine fails | LLM API error | Retry 1x → fallback → queue → on 3rd failure: send fallback "Brief generation failed. Check dashboard." |
| Multiple orgs | Different timezones | Each org gets brief at their configured timezone |

### Flow 7: Buyer Portal Support Chat

1. **Buyer clicks "Support Chat"** in Buyer Portal
2. **Channel router checks** lead's `preferred_channel` or org's `enabled_channels`
3. **Message tagged** with `source: buyer_portal` to differentiate from lead qualification
4. **Routing handled** via messaging channel abstraction (WhatsApp or Telegram)
5. **Conversation stored** in message_threads with channel tag

---

## 7. API & Integration Map

### Supabase Edge Functions (Deterministic Event Routing)

| Function | Trigger | What It Does | Auth | Error Handling |
|----------|---------|--------------|------|----------------|
| `on-lead-created` | Lead form POST | Create lead, score (rule-based), tag source, trigger PRESELL Agent, validate reCAPTCHA | Public (with reCAPTCHA) | Log to error_logs, return 500 |
| `on-messaging-inbound` | WhatsApp/Telegram webhook | Log message, trigger PRESELL Agent | Webhook | Idempotent check, duplicate reject |
| `on-payment-confirmed` | Finance marks PAID | Update unit status, activate buyer portal, trigger docs | Finance role | Log error, alert admin |
| `on-approval-granted` | Developer approves | Generate Payment Ticket, validate separation of duties, notify finance | Org_admin | Retry PDF generation 1x |
| `on-invoice-submitted` | Contractor submits | Validate 5 evidence types, trigger GUARDIAN Agent | Contractor role | Block if incomplete |
| `on-purchase-request` | Site manager submits | Validate, trigger GUARDIAN Agent | Site_manager | Log error, alert |
| `payment-reminder-7d` | Scheduled (7 days before) | Find due payments, send template message | Service role | Skip if already paid |
| `payment-reminder-3d` | Scheduled (3 days before) | Find due payments, send template message | Service role | Skip if already paid |
| `payment-overdue` | Scheduled (daily) | Run full escalation chain | Service role | Log each stage |
| `morning-brief` | Scheduled (7am) | Compile data, trigger MASTER Agent | Service role | Fallback message on failure |
| `weekly-jv-report` | Scheduled (Monday 7am) | Compile report, trigger GUARDIAN, send email | Service role | Fallback email on failure |
| `ad-performance-sync` | Scheduled (every 6h) | Pull Meta metrics, store | Service role | Skip on rate limit |
| `price-index-update` | Scheduled (monthly) | Update materials index | Service role | Log, continue partial |
| `credential-health-check` | Scheduled (daily) | Test stored credentials, update status, alert if expiring | Service role | Log each org |

### MCP Tools (External Service Integrations)

| MCP Server | Tools Provided | Per-Org Credential | Blocked Actions |
|------------|----------------|-------------------|-----------------|
| `supabase-mcp` | read tables, write lead scores, message_threads, agent_logs, notifications | Via org_id context | payments_out, approvals, unit_prices without ticket |
| `whatsapp-mcp` | send text, send media, send template, read inbound | Per-org WhatsApp Business token | delete messages, modify profile |
| `telegram-mcp` | send text, send media, send inline keyboard, read inbound | Per-org Telegram Bot token | delete messages, modify bot profile |
| `channel_router` | route_message(lead_id, content, source) | Routes by lead's preferred_channel or org config | N/A |
| `meta-ads-mcp` | get campaigns, get ad set performance, pause/resume ad set, adjust daily budget | Per-org Meta System User token | increase total budget, create campaigns |
| `email-mcp` | send email with attachments | Shared Resend key (from-address per org) | Send to non-registered addresses |
| `video-mcp` | generate video from prompt (fal.ai) | Per-org fal.ai API key | publish directly |
| `pdf-mcp` | generate PDF from template | Per-org template storage | N/A |

### Messaging Channel Abstraction

```
messaging/
├── channel_interface.ts    ← send_text(), send_media(), send_template(), on_inbound()
├── whatsapp_channel.ts   ← WhatsApp Business API implementation (Phase 1)
├── telegram_channel.ts   ← Telegram Bot API implementation (Phase 2/3)
└── channel_router.ts     ← Routes by lead's preferred channel or org config
```

### API Contracts (Frontend ↔ Backend)

All API calls go through Supabase client with org-scoped queries. Key data shapes:

```typescript
// Lead creation request
interface CreateLeadRequest {
  name: string;
  phone: string; // +234...
  email: string;
  city: string;
  country: string;
  budget_min?: number;
  budget_max?: number;
  investment_type?: 'own_use' | 'investment';
  unit_interest?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  recaptcha_token: string; // v3 score validated server-side
}

// Lead response
interface LeadResponse {
  id: string;
  name: string;
  phone: string;
  email: string;
  score: number;
  category: 'cold' | 'warm' | 'hot';
  status: string;
  source_ad?: string;
  created_at: string;
}

// Invoice submission (5 evidence types)
interface SubmitInvoiceRequest {
  contractor_id: string;
  phase_id: string;
  description: string;
  amount_kobo: number;
  before_photo_urls: string[]; // Min 2 required
  after_photo_urls: string[]; // Min 3 required
  delivery_receipt_url: string;
  work_completion_cert_url: string;
  measurement_cert_url: string;
}

// Payment ticket
interface PaymentTicket {
  id: string;
  invoice_id: string;
  amount_kobo: number;
  reference_code: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  generated_at: string;
}
```

---

## 8. Authentication & Authorization

### Supabase Auth Configuration

| Auth Method | Users | Notes |
|-------------|-------|-------|
| Email + Password | All users | Primary authentication |
| Magic Link (UUID-based tokens) | Buyers, Contractors | UUID tokens prevent enumeration attacks. Mapping stored in `tracking_links`. |
| MFA (TOTP) | org_admin (mandatory) | Required within 7-day grace period |

### Role Assignment

Roles are stored in `org_members.role` column. RLS policies use helper functions:

```sql
-- Fix for multi-org users: filter by active organisation
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS TEXT AS $
  SELECT role FROM org_members 
  WHERE user_id = $1 AND organisation_id = get_active_org_id();
$ LANGUAGE sql STABLE;
```

### Multi-Org User Support

Users can belong to multiple organisations (contractors, super_admins). Flow:

1. **Login** → JWT contains `organisation_ids` array in app_metadata
2. **If >1 org** → Show org-switcher UI
3. **User selects org** → Call `set_active_organisation(target_org_id)` RPC
4. **JWT updated** with `active_organisation_id` claim
5. **All subsequent requests** scoped via `get_active_org_id()` in RLS

### Permission Matrix

| Action | super_admin | org_admin | sales_agent | finance | site_manager | buyer | contractor |
|--------|-------------|-----------|-------------|---------|--------------|-------|------------|
| View all orgs | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View own org all data | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| View leads | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View buyers/reservations | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View own reservation | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| View payments_in | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| View payments_out | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Create lead | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Update lead score | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Approve invoice | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve own request | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Mark ticket PAID | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Submit purchase request | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ |
| Submit invoice | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| View own invoices | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| View budget data | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create organisation | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Impersonate org | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Session Management

- JWT contains: `user_id`, `organisation_id`, `role`, `active_organisation_id`
- Token expiry: 24 hours (configurable)
- Refresh token: 30 days
- MFA required for org_admin on all sensitive actions

### Unauthorized Access Response

| Attempt | Response |
|---------|----------|
| No valid JWT | 401 Unauthorized → Login redirect |
| JWT valid but no org membership | 403 Forbidden → "Access denied" |
| Cross-org read attempt | RLS returns 0 rows → Silent empty |
| Cross-org write attempt | RLS blocks → 403 Forbidden |
| Insufficient role for action | 403 Forbidden → "Action not permitted" |

### CORS Policy

All Edge Functions must restrict `Access-Control-Allow-Origin` to `*.devos.app` only. No wildcard `*`.

---

## 9. Error Handling & Edge Case Strategy

### Global Error Handling Pattern

All Edge Functions wrap core logic in try/catch:

```typescript
// Pseudocode pattern
try {
  // Validate input
  // Check auth
  // Execute logic
  // Return success
} catch (error) {
  // Log to error_logs
  // Return friendly message to user
  // If critical, alert super admin
}
```

### User-Facing Error Messages

| Failure | Message |
|---------|---------|
| LLM API timeout | "Our AI assistant is temporarily busy. Your request has been queued and will be processed shortly." |
| Messaging send failure | "We couldn't reach this contact on the preferred channel. An email has been sent instead." |
| File upload too large | "This file is over 10MB. Please compress it or upload a smaller version." |
| File format not supported | "Supported formats: JPEG, PNG, PDF. HEIC must be converted before upload." |
| Lead form validation | Inline errors on specific fields |
| Session expired | Redirect to login with "Session expired" toast |
| Bot detected (reCAPTCHA) | "Submission blocked. Please try again." |
| Submitter == Approver | "You cannot approve your own request." |

### Graceful Degradation Chain

| Dependency | Failure | Fallback |
|------------|---------|----------|
| Primary LLM | Timeout / 5xx | Retry 1x → Fallback LLM → queue for retry in 5 min → on 3rd failure: log FAILED, alert super_admin, send fallback to user |
| Messaging API | Rate limit / send failure | Retry 1x after 5s → email fallback → log to failed_messages |
| Meta Ads API | Auth failure / rate limit | Skip sync cycle → alert super_admin → retry next cycle |
| Supabase Realtime | Connection drop | Frontend polls every 30s → reconnect on visibility change |
| Supabase Storage | Upload failure | Retry 1x → show "Upload failed, please try again" |
| Exchange rate API | Stale (>24h) | Use cached rate with "Rate as of [date]" display, block transaction if >24h stale |

### Loading & Empty States

| Screen | Empty State | Loading State |
|--------|-------------|---------------|
| Command Dashboard (no leads) | Setup checklist: "✅ Project created → ⬜ First campaign launched → ⬜ First lead captured" | Skeleton loaders for KPI cards |
| Buyer Portal (no payments) | "Your first payment is due on [date]. Here's how to pay." | Progress bar shows "Loading payment details..." |
| GUARDIAN (no invoices) | "No invoices submitted yet. Here's how contractors submit invoices." with link | Spinner with "GUARDIAN is analysing..." for submitted invoices |
| Leads list | "No leads yet. Launch a campaign to get started." | Table skeleton |
| Messaging conversation | "Start a conversation to begin qualification" | Message bubble with spinner |

### Rate Limiting

- **Lead form**: 10 submissions per IP per hour, reCAPTCHA v3 validation
- **Duplicate lead**: Same phone/email within 24h → upsert existing
- **Messaging webhook**: Idempotent via message_id check
- **Agent tool calls**: Hard cap at 10 tool calls per agent invocation → fail gracefully

### Conversation Guardrails (PRESELL Agent)

| Guardrail | Implementation |
|-----------|----------------|
| Message deduplication | If agent generates message identical to last → suppress + log warning |
| Rate limit | Max 3 agent-initiated messages per hour per lead |
| Length limit | If >30 turns without advancing past QUALIFYING → auto-escalate to human |
| Tool loop cap | Max 10 tool calls per invocation → stop + alert super_admin |

### Additional Edge Cases (v2.0)

1. **Agent infinite tool loop:** Hard cap at 10 tool calls per agent invocation. Exceeded → fail gracefully → log → alert super_admin.
2. **Morning brief exceeds WhatsApp 4096-char limit:** Truncate to top 5 items per category, add "See dashboard for full details" link.
3. **iPhone HEIC photo uploads:** Accept HEIC, convert server-side to JPEG on upload. Or reject with clear "supported formats: JPEG, PNG, PDF" message.
4. **Stale exchange rate for diaspora pricing:** Cache last-known rate with timestamp. Display "Rate as of [date]". Block transactions if rate is >24h stale.
5. **Partial PDF generation:** Generate to temp storage, validate completeness, then move to permanent storage. Never serve partial PDFs.
6. **Concurrent approval + payment processing:** Optimistic locking on `payment_tickets.status`. Finance must verify ticket is still PENDING before marking PAID.
7. **Organisation slug collisions:** Check against reserved/confusable list. Prevent visually similar slugs (e.g., "primerose" vs "prime-rose").
8. **User in multiple organisations:** Login loads org-switcher if user has >1 membership. All subsequent requests scoped to active org via JWT claim.

---

## 10. Test Coverage Map

### Unit Tests Required

| Feature | What to Test | Test Scenarios |
|---------|--------------|----------------|
| Lead scoring algorithm | Each signal weight | Lagos +15, diaspora +20, below min price -20, all positive → 100 (cap), all negative → 0 (cap) |
| Messaging state machine | Each state transition | INTAKE→QUALIFYING, QUALIFYING→HOT, QUALIFYING→COLD |
| Reservation workflow | Unit status transitions | Available→Reserved, Reserved→Sold, race condition handling |
| Payment reminders | Trigger logic | 7d before, 3d before, due date, skip if already paid |
| GUARDIAN price check | >5% flag threshold | Exactly 5% → INFO, 5.1% → WARNING |
| Auto-approve/reject | Decision logic | All checks pass + within budget → auto-approve; >30% above market → auto-reject |
| Budget calculation | Spent vs allocated | 84.9% → WARNING, 85%+ → CRITICAL |
| UTM parsing | Source extraction | All UTM params, missing params, duplicate params |
| reCAPTCHA validation | Score threshold | <0.3 → reject, >=0.3 → accept |

### Integration Tests Required

| Flow | What to Test | Test Scenarios |
|------|--------------|----------------|
| Lead capture | Form → Supabase → Message sent | Happy path, duplicate, invalid phone, messaging fails, reCAPTCHA fail |
| Qualification flow | Lead → Message → reply → response → score update | Out-of-order, media, restart after silence |
| Reservation | Unit select → payment → receipt → confirm → portal | Two simultaneous, receipt reject, expiry |
| Invoice flow | Submit → GUARDIAN → flag → approve → ticket → paid | Incomplete evidence (5 types), all clear, critical flag, auto-approve, auto-reject |
| Morning brief | Scheduled → data → agent → message | Zero activity, agent failure, exceeds char limit, multiple orgs |
| Org-switching | Login → multi-org → switch → data scoped | Verify data isolation per active org |

### The 5 Most Critical Edge Cases (MUST NOT reach production untested)

1. **Duplicate lead submission** → Must upsert, not create duplicate
2. **Messaging duplicate message** → Must reject at Edge Function level (idempotent)
3. **LLM API timeout during conversation** → Must fallback through chain (primary → fallback → queue → fail with message), then alert
4. **Two simultaneous reservations** → Must use SELECT FOR UPDATE, first wins
5. **Cross-org data leak** → Must be blocked by RLS with active_org, test as each role

### RLS & Auth Test Scenarios

| Test | Setup | Assert |
|------|-------|--------|
| Org isolation - read | 2 orgs, insert data in A, query as B user | 0 rows returned |
| Org isolation - write | User in org B, attempt write to org A row | 403 error |
| Multi-org user - active org | User in orgs A+B, set active=A, query leads | Only org A data visible |
| Buyer sees own | Buyer user queries leads table | Only own record visible |
| Contractor sees own | Contractor queries invoices | Only own invoices visible |
| Super admin all | Super admin queries any org data | All data visible |
| Impersonation read-only | Super admin impersonates org | No writes succeed |
| Separation of duties | User submits invoice, attempts to approve | Blocked with appropriate error |

---

## 11. Build Sequence

### Phase 1: Foundation (Weeks 1-3) — CORE

**Definition of Done:** Lead form → Messaging qualification → Reservation flow → Buyer Portal MVP → Command Dashboard MVP → Morning brief

| Sprint | Tasks | Dependencies | Complexity |
|--------|-------|--------------|------------|
| **Sprint 1** (Week 1) | | | |
| T1.1 | Supabase project setup | - | SMALL |
| T1.2 | PLATFORM LAYER schema (organisations, org_members, subscriptions, org_credentials, agent_context, feature_flags, llm_config, tracking_links) | T1.1 | SMALL |
| T1.3 | All remaining tables with organisation_id (including message_threads, agent_queue, evidence fields in invoices) | T1.2 | MEDIUM |
| T1.4 | RLS policies + helper functions (get_active_org_id, set_active_organisation) | T1.3 | LARGE |
| T1.5 | Supabase Auth roles config | T1.4 | SMALL |
| T1.6 | Vercel wildcard subdomain config | - | SMALL |
| T1.7 | React subdomain routing + org loading + org-switcher | T1.6 | MEDIUM |
| T1.8 | Landing page (hero, unit cards, calculator, lead form + reCAPTCHA v3) | T1.7 | MEDIUM |
| T1.9 | Lead form → Supabase + UTM parsing + UUID-based tracking links | T1.8 | SMALL |
| T1.10 | WhatsApp Business API setup | - | MEDIUM |
| T1.11 | whatsapp-mcp server with credential injection | T1.10 | MEDIUM |
| T1.12 | channel_interface.ts + channel_router.ts abstraction | T1.11 | MEDIUM |
| T1.13 | email-mcp server (Resend API) — moved from Sprint 5 | T1.1 | SMALL |
| T1.14 | on-lead-created Edge Function | T1.9, T1.11, T1.12 | SMALL |
| T1.15 | on-messaging-inbound Edge Function | T1.12 | SMALL |
| T1.16 | **Agent Engine Worker setup** (Railway/Fly.io) — Sprint 1 priority | T1.2, T1.3, T1.11 | LARGE |
| T1.17 | **Agent Engine Integration Smoke Test** (full chain: Edge Function → Queue → Worker → LiteLLM → LLM → MCP → DB) | T1.16 | MEDIUM |
| T1.18 | Create Primerose organisation | T1.2 | SMALL |
| T1.19 | Deploy to Vercel | T1.7 | SMALL |
| **Sprint 2** (Week 2) | | | |
| T2.1 | PRESELL Agent refinement | T1.16 | SMALL |
| T2.2 | Multi-turn messaging qualification E2E | T1.15, T2.1 | MEDIUM |
| T2.3 | Lead scoring update via supabase-mcp | T2.2 | SMALL |
| T2.4 | Sales agent dashboard (lead list, scores, profile) | T1.3 | MEDIUM |
| T2.5 | Hot lead notification | T2.3 | SMALL |
| T2.6 | Media library in Supabase Storage | T1.1 | SMALL |
| T2.7 | agent_logs viewer (with model_used, cost_usd tracking) | T1.3 | SMALL |
| **Sprint 3** (Week 3) | | | |
| T3.1 | Reservation workflow | T2.4 | MEDIUM |
| T3.2 | Unit inventory tracker (real-time) | T1.3 | MEDIUM |
| T3.3 | Buyer Portal MVP + Support Chat | T3.1 | MEDIUM |
| T3.4 | on-payment-confirmed Edge Function | T3.1 | SMALL |
| T3.5 | pdf-mcp for Reservation Letter | - | SMALL |
| T3.6 | Payment tracking + finance workflow | T3.4 | MEDIUM |
| T3.7 | Command Dashboard MVP | T3.2, T2.4 | MEDIUM |
| T3.8 | Payment reminder Edge Functions | T3.4 | SMALL |
| T3.9 | MASTER Agent for morning brief | - | MEDIUM |
| T3.10 | morning-brief Edge Function | T3.9 | SMALL |

**⚠️ CRITICAL PATH ITEMS (Start Week 0):**

- **Legal template review** — Initiate immediately for Reservation Letter, Sale Agreement, Notice of Default (2-4 week lead time)
- **WhatsApp Business API verification** — Initiate immediately. Target Tier 2 (10K/day) before production launch

### Phase 2: GUARDIAN Core (Weeks 4-6) — CORE

**Definition of Done:** Purchase request → GUARDIAN analysis → Invoice verification → Approval → Payment Ticket → Finance notified

| Sprint | Tasks | Dependencies | Complexity |
|--------|-------|--------------|------------|
| **Sprint 4** (Week 4) | | | |
| T4.1 | Budget setup UI | Phase 1 | MEDIUM |
| T4.2 | BOQ/contract upload (PDF reference) | T4.1 | SMALL |
| T4.3 | Materials price index initial | T1.3 | SMALL |
| T4.4 | price-index-update Edge Function | T4.3 | SMALL |
| T4.5 | Site Manager mobile interface | Phase 1 | MEDIUM |
| T4.6 | on-purchase-request Edge Function | T4.5 | SMALL |
| T4.7 | GUARDIAN Agent system prompt | - | MEDIUM |
| T4.8 | Developer approval interface | Phase 1 | MEDIUM |
| T4.9 | on-approval-granted Edge Function (with separation of duties check) | T4.8 | SMALL |
| **Sprint 5** (Week 5) | | | |
| T5.1 | Contractor Portal | Phase 1 | MEDIUM |
| T5.2 | on-invoice-submitted Edge Function (validates 5 evidence types) | T5.1 | SMALL |
| T5.3 | GUARDIAN invoice analysis (6 checks + auto-approve/reject logic) | T4.7 | LARGE |
| T5.4 | Site manager verification step | T5.3 | SMALL |
| T5.5 | Invoice flag system | T5.3 | SMALL |
| T5.6 | Payment approval workflow | T4.9 | SMALL |
| T5.7 | payment_tickets + PDF generation | T4.9 | SMALL |
| T5.8 | Finance notification via email-mcp | T5.7 | SMALL |
| **Sprint 6** (Week 6) | | | |
| T6.1 | GUARDIAN dashboard | Phase 1 | MEDIUM |
| T6.2 | Budget trend chart | T6.1 | SMALL |
| T6.3 | Guardian Savings Tracker | T5.5 | SMALL |
| T6.4 | Burn rate vs remaining budget (early warning) | T4.7 | MEDIUM |
| T6.5 | weekly-jv-report Edge Function | T4.7 | MEDIUM |
| T6.6 | GUARDIAN → Command Dashboard integration | T6.1 | SMALL |
| T6.7 | mcp_tool_calls viewer | Phase 1 | SMALL |
| T6.8 | credential-health-check Edge Function (daily) | Phase 1 | SMALL |

### Phase 3: Intelligence (Weeks 7-10) — IMPORTANT

**Definition of Done:** AdEngine live → Campaign creation → Creative approval → 48h optimisation → Attribution → Basic predictive analytics

**Note:** TikTok Ads MCP and full predictive overrun engine deferred to Phase 4 (see Section F).

| Sprint | Tasks | Dependencies | Complexity |
|--------|-------|--------------|------------|
| **Sprint 7** (Week 7) | | | |
| T7.1 | Campaign setup UI | Phase 1 | MEDIUM |
| T7.2 | Audience template library | T7.1 | SMALL |
| T7.3 | Magic Link tracking (UUID-based) | T7.1 | MEDIUM |
| T7.4 | meta-ads-mcp server | - | LARGE |
| T7.5 | ADENGINE Agent system prompt | - | MEDIUM |
| T7.6 | Creative Factory | T7.5 | MEDIUM |
| T7.7 | Creative approval workflow | T7.6 | SMALL |
| **Sprint 8** (Week 8) | | | |
| T8.1 | ad-performance-sync Edge Function (6h) | T7.4 | MEDIUM |
| T8.2 | AdEngine performance dashboard | T8.1 | MEDIUM |
| T8.3 | ADENGINE 48h optimisation | T7.5 | LARGE |
| T8.4 | Ad fatigue detection | T8.3 | SMALL |
| T8.5 | Retargeting audience automation | T7.4 | MEDIUM |
| T8.6 | Lead attribution tracking | T7.3 | SMALL |
| **Sprint 9** (Week 9) | | | |
| T9.1 | Materials price trend | T4.3 | SMALL |
| T9.2 | MASTER Agent refinement | Phase 1 | SMALL |
| T9.3 | Full agent_logs dashboard | Phase 1 | SMALL |
| T9.4 | Telegram channel implementation (telegram-mcp) | Phase 1 | MEDIUM |
| **Sprint 10** (Week 10) | | | |
| T10.1 | Revenue attribution report | T8.6 | MEDIUM |
| T10.2 | Lead-to-revenue traceability | T10.1 | SMALL |
| T10.3 | PRESELL analytics dashboard | Phase 1 | SMALL |
| T10.4 | Final Command Dashboard | Phase 1+2 | MEDIUM |
| T10.5 | End-to-end integration testing | All | LARGE |
| T10.6 | Performance optimisation | T10.5 | SMALL |

### Phase 4: Polish (Weeks 11-14) — ENHANCEMENT

| Sprint | Tasks | Dependencies | Complexity |
|--------|-------|--------------|------------|
| T11.1 | Sale Agreement auto-generation | Phase 2 | SMALL |
| T11.2 | E-signature integration (DocuSign) | T11.1 | MEDIUM |
| T11.3 | Notice of Default generation | Phase 2 | SMALL |
| T11.4 | Contractor performance dashboard | Phase 2 | SMALL |
| T11.5 | Buyer upgrade module | Phase 1 | SMALL |
| T11.6 | Diaspora flow refinement | Phase 1 | SMALL |
| T11.7 | Multi-language messaging | Phase 1 | SMALL |
| T11.8 | Unit floor plan SVG viewer | Phase 1 | SMALL |
| T11.9 | Construction photo gallery | Phase 2 | SMALL |
| T11.10 | DEVOS mobile PWA | Phase 1 | MEDIUM |
| T11.11 | Comprehensive error handling | All | LARGE |
| T11.12 | Security audit + pen testing | All | LARGE |
| T11.13 | UAT: 5 buyer + 3 contractor journeys | All | MEDIUM |
| T11.14 | Load testing (200 sessions) | All | SMALL |
| **Phase 4 Deferred Items** | | | |
| T11.15 | Google Ads MCP (google-ads-mcp) | T7.4 | MEDIUM |
| T11.16 | TikTok Ads MCP | T7.4 | MEDIUM |
| T11.17 | Full predictive overrun engine | Phase 2 | MEDIUM |
| T11.18 | Contractor performance scoring (refined) | Phase 2 | SMALL |
| T11.19 | Lookalike audience builder | Phase 3 | MEDIUM |

### Phase 5: SaaS (Months 4-6) — PHASE 5

| Sprint | Tasks | Dependencies | Complexity |
|--------|-------|--------------|------------|
| T12.1 | Multi-tenant architecture review | Phase 1 | SMALL |
| T12.2 | Organisation onboarding wizard | T12.1 | MEDIUM |
| T12.3 | White-label configuration | T12.2 | MEDIUM |
| T12.4 | Instance isolation verification | T12.1 | SMALL |
| T13.1 | Subscription tiers UI | Phase 1 | MEDIUM |
| T13.2 | Paystack integration | T13.1 | MEDIUM |
| T13.3 | Stripe integration | T13.1 | MEDIUM |
| T13.4 | Usage metering | T13.1 | MEDIUM |
| T13.5 | Client admin dashboard | T12.2 | MEDIUM |
| T14.1 | Guided onboarding wizard | Phase 1 | MEDIUM |
| T14.2 | Template library | Phase 2 | SMALL |
| T14.3 | In-app help system | Phase 1 | SMALL |

---

## 12. Resolved Decisions

The following questions from v1.0 have been resolved through the Senior Architect review:

| # | Question | Decision |
|---|----------|----------|
| Q1 | Flutterwave or Stripe for international? | **Stripe.** Better API, broader currency support, SaaS standard. |
| Q2 | Per-org LLM cost cap? | Starter: ₦50K/month. Growth: ₦200K/month. Enterprise: ₦500K/month (soft cap). 80% alert threshold. |
| Q3 | Can a user belong to multiple orgs? | **Yes.** Contractors and super_admins can. Use JWT active-org claim + org-switcher UI. |
| Q4 | Credentials expire/invalid? | Agent operations for that org degrade gracefully. Daily health check alerts org_admin. Critical: agents stop for that org with clear error. |
| Q5 | Who creates document templates? | Lawyer creates templates. Loaded manually into Supabase Storage per-org. DEVOS generates documents FROM templates, never creates legal language. |
| Q6 | Google Ads MCP needed for MVP? | **Deferred to Phase 4.** Phase 3 focuses on Meta. YouTube video ads via Meta Ads Manager in interim. |
| Q7 | Retry budget for agent failures? | **3 attempts max.** Primary model → fallback model → queue for retry in 5 min → on 3rd failure: log as FAILED, send alert to super_admin, send fallback message to user ("temporarily unavailable"). |
| Q8 | fal.ai vs Veo3? | **fal.ai.** More accessible API, better pricing, proven reliability. Rename `veo3-mcp` to `video-mcp`. |
| Q9 | Scheduled functions per-org timezone? | Each org has a `timezone` field on the `organisations` table. Scheduled Edge Functions query for orgs where `now() AT TIME ZONE org.timezone` matches the target time (e.g., 7:00 AM local). |
| Q10 | WhatsApp Business API tier verified? | **Must be initiated immediately (Week 0).** Verification takes 2-4 weeks. Target: Tier 2 (10K messages/day) before production launch. |

---

## 13. Open Questions & Assumptions

### Questions from Enhanced Brief (Resolved in Section 12)

All questions A1-A10 from the Enhanced Brief have been resolved and documented in Section 12 (Resolved Decisions). They are retained here for reference only.

See Section 12 (Resolved Decisions) for the answers to all A1-A10 questions.

### New Questions Identified

| # | Question | Impact | Recommendation |
|---|----------|--------|----------------|
| N1 | **Which exchange rate API for diaspora display?** | Display | Use exchangerate-api.com or similar free tier. Update daily. Cache with timestamp. |
| N2 | **Document template storage format?** | PDF generation | Store as React-PDF templates in Supabase Storage per org. |
| N3 | **BOQ/contract file size limits?** | Storage | Max 10MB per file, PDF only. |
| N4 | **Progress photo geotagging requirement?** | Mobile | Optional for MVP, required Phase 4 if device supports. |
| N5 | **Maximum concurrent agent conversations?** | Cost/performance | Cap at 50 concurrent per org. Queue excess. |
| N6 | **Site manager offline support?** | Mobile | Not in MVP. Phase 4 consideration. |
| N7 | **Notification preferences per role?** | UX | Allow role-based notification toggles (email, WhatsApp, in-app). |
| N8 | **Telegram bot username availability?** | Branding | Check early. Telegram verification instant but usernames must be unique. |

### Assumptions Made in This Document

1. **Supabase project already provisioned** — No setup time allocated for Supabase account creation
2. **WhatsApp Business account verified** — API access already granted
3. **Meta Ads account has System User** — Technical access configured
4. **Legal templates reviewed by Sprint 3** — Must be ready for reservation flow
5. **Team has React + Supabase experience** — No learning curve time
6. **GitHub repository created** — CI/CD ready from day one
7. **Domain `devos.app` registered** — DNS configurable

---

## 14. Scope Reduction Summary

The following items have been deferred from Phase 3 to Phase 4 to redirect effort toward critical architecture improvements:

| Item | Original Phase | New Phase | Reason |
|------|----------------|-----------|--------|
| TikTok Ads MCP | Phase 3 | Phase 4 | Meta is primary. 90% of meta-ads-mcp patterns reusable later. Saves ~3-4 days. |
| Full Predictive Overrun Engine | Phase 3 | Phase 4 | Not enough historical data at Week 7. Ship "burn rate vs remaining budget" early warning in Phase 3. Saves ~3-4 days. |
| Contractor Performance Scoring (refined) | Phase 3 | Phase 4 | No contractors will have enough invoices for meaningful scoring by Week 6. Track raw data now, score later. Saves ~1-2 days. |
| Lookalike Audience Builder | Phase 3 | Phase 4 | Requires significant confirmed buyer data. At Week 8, sample size too small. Saves ~1-2 days. |
| Google Ads MCP | Phase 3 | Phase 4 | Phase 3 focuses on Meta. YouTube video ads via Meta Ads Manager in interim. |

**Total saved:** ~10-15 days redirected to:

- LiteLLM integration and multi-model routing setup
- Agent Engine Worker service deployment
- Messaging channel abstraction
- More thorough RLS testing
- Comprehensive E2E testing

---

*This Technical Architecture Document v2.0 incorporates all revisions from the Senior Architect review of v1.0. It serves as the single source of truth for the build team. Where documents conflict, the revision prompt takes precedence.*

**Document Version:** 2.0
**Last Updated:** March 2026
**Previous Version:** 1.0 (superseded)
**Next Review:** After Phase 1 Sprint 1 completion
