

**DEVOS**

**Real Estate Development Operating System**

Product Requirements Document

Version 1.2  |  March 2026

Prepared by: LawOne Cloud LLC

*Confidential & Proprietary*

*"An AI agent that runs your real estate development —*

*generating buyers, protecting your budget, and keeping your project on track."*

# **1\. Executive Summary**

DEVOS (Real Estate Development Operating System) is an AI-powered, autonomous platform built for off-plan real estate developers. It replaces a full team of sales agents, marketing managers, financial controllers, and project coordinators with a single intelligent system that operates 24/7 with minimal human input.

The developer interacts with DEVOS for approximately 15–20 minutes per day — reviewing a morning brief, approving invoices, and taking flagged phone calls. Every other operational function is handled autonomously by the DEVOS agent layer.

DEVOS is built on three core modules:

* PRESELL — Autonomous sales engine. Runs paid advertising campaigns, captures and qualifies leads via WhatsApp, converts qualified prospects into paying buyers, manages payment plans, generates legal documents, and provides buyers with a personal portal to track their unit and payments.

* GUARDIAN — Autonomous budget intelligence. Monitors every purchase request and contractor invoice against market rates, contract terms, and physical site progress. Flags anomalies, enforces approval workflows, predicts overruns, and generates financial reports for JV partners.

* COMMAND DASHBOARD — The developer's single daily interface. A unified view of sales performance, budget health, construction progress, active flags, and AI recommendations — all updated in real time.

DEVOS is built first as the operational backbone of Primerose Smart City Cluster — a 200-unit development in New Port City, Eleme, Rivers State — and subsequently packaged as a SaaS product for other developers across Nigeria and West Africa.

| Attribute | Detail |
| :---- | :---- |
| Product Name | DEVOS — Real Estate Development Operating System |
| Version | 1.0 |
| Build Target | Primerose Smart City Cluster (200 units, New Port City, Eleme) |
| Developer Entity | Vantara International Limited (60% JV, LawOne Cloud) |
| Tech Entity | LawOne Cloud LLC |
| Primary Stack | React \+ Supabase \+ n8n \+ WhatsApp Business API \+ Claude AI |
| Target Launch (MVP) | Phase 1: 3 weeks from project kick-off |
| SaaS Launch Target | Phase 5: 6 months from kick-off |

# **2\. Product Vision & Strategic Goals**

## **2.1 Vision Statement**

"Every serious real estate developer in Africa should have an AI agent running their business — so they can focus on decisions, not operations."

## **2.2 The Problem Being Solved**

Nigerian and West African real estate developers face a consistent set of operational failures that kill profitability:

| Problem | Current Reality | DEVOS Solution |
| :---- | :---- | :---- |
| No lead tracking | Ad money spent, no idea what it produced | Full attribution: ad → lead → naira |
| Slow lead response | Leads go cold waiting for a human to respond | WhatsApp response in \<60 seconds, 24/7 |
| Payment chasing | Manual calls/texts to every buyer every month | Automated WhatsApp reminders & escalation |
| Contractor fraud | Invoices inflated, materials claimed not delivered | Photo evidence \+ AI price check before payment |
| Budget overruns | Discovered too late to course-correct | Real-time burn tracking \+ 6–8 week predictions |
| JV transparency | Partners calling for manual updates constantly | Automated weekly JV report, zero manual effort |
| Developer bandwidth | Developer must be on-site or reachable 24/7 | 15–20 min daily review, everything else autonomous |

## **2.3 Strategic Goals**

1. Validate DEVOS on Primerose: pre-sell 40+ units in 60 days before construction completes.

2. Demonstrate Guardian savings: capture and document ₦10M+ in identified overcharges/savings in Phase 1 construction.

3. Launch DEVOS as a SaaS product to 3 paying developer clients within 6 months of MVP launch.

4. Reach ₦2M/month SaaS revenue within 12 months of product launch.

5. Build the definitive AI-native real estate development platform for the African market.

# **3\. User Personas & Roles**

## **3.1 Internal Users**

| Role | Who They Are | Primary Interface | Key Actions |
| :---- | :---- | :---- | :---- |
| Developer / Owner | Law — Deputy Governor, founder, primary decision-maker | Command Dashboard \+ WhatsApp Brief | Approve invoices, review dashboard, take hot lead calls |
| Sales Agent | In-house marketer or sales rep managing buyer relationships | PRESELL pipeline view | Follow up hot leads, manage reservations, update buyer records |
| Finance/Admin | Accountant or admin processing approved payments | Guardian payment queue | Process payment after approval ticket generated |
| Site Manager | On-ground construction supervisor (Chukwudi) | Mobile Guardian interface | Submit purchase requests, upload progress photos, update phase completion |

## **3.2 External Users**

| Role | Who They Are | Primary Interface | Key Actions |
| :---- | :---- | :---- | :---- |
| Buyer | Individual purchasing a unit off-plan | Buyer Portal \+ WhatsApp | View unit status, make payments, download documents, raise queries |
| Contractor / Supplier | Construction firms and materials vendors | Contractor Portal | Submit invoices, upload delivery evidence, view payment status |
| JV Partner | NPC Development Ltd (40% JV partner) | Weekly Email Report | Review financial and construction progress reports |
| Future: SaaS Client | Other Nigerian real estate developers | Their own DEVOS instance | Full platform access for their own development projects |

# **4\. System Architecture Overview**

## **4.1 Architectural Philosophy**

DEVOS is designed as a multi-tenant SaaS product from day one. It is built first for Primerose Smart City Cluster and used exactly as any other client would use it — but the infrastructure, database schema, agent system, and frontend routing are all architected to serve many developers simultaneously from the start. This decision costs 3–4 extra days in Sprint 1 and saves months of painful retrofitting later.

The architecture has three brains working together. Supabase Edge Functions handle all simple, deterministic event routing — fast, cheap, and reliable. The DEVOS Agent Engine (a purpose-built Claude-powered agent system, separate from any personal AI infrastructure) handles everything requiring reasoning, analysis, or intelligent decision-making. MCP tools give the agent direct, structured, per-client-authenticated access to every external service it needs to act on.

OpenClaw — LawOne Cloud's personal Chief of Staff agent — sits above DEVOS as a read-only supervisor for the developer's own use. It reads DEVOS output and synthesises it into broader business context. It is not part of the DEVOS product. This distinction is critical: DEVOS must work for any developer, not just one person with a personal VPS agent.

| CORE ARCHITECTURAL PRINCIPLES |
| :---- |
| PRINCIPLE 1: MULTI-TENANT FROM DAY ONE   Every database table carries organisation\_id.   RLS policies enforce complete data isolation between organisations.   One Supabase instance serves all clients safely.   Retrofitting single-tenant to multi-tenant is one of the most expensive rebuilds in software.   It costs 3 days to do it right at the start. It costs months to fix it later. PRINCIPLE 2: DEVOS AGENT ENGINE IS THE PRODUCT — NOT OPENCLAW   DEVOS ships with its own standalone Claude-powered agent system.   Each client organisation gets isolated agent context (their project data only).   OpenClaw is a personal tool. DEVOS Agent Engine is a product.   OpenClaw can read DEVOS data for Law's personal morning brief.   OpenClaw cannot write to DEVOS or act on behalf of other organisations. PRINCIPLE 3: SHARED MCP INFRASTRUCTURE WITH PER-CLIENT CREDENTIALS   One set of MCP servers handles requests from all client organisations.   Each MCP call is authenticated with that client's own credentials.   (Each client connects their own WhatsApp number, Meta Ads account, TikTok account)   This is scalable. Running separate MCP servers per client is not. PRINCIPLE 4: SIMPLE EVENT vs INTELLIGENT EVENT   Simple event?  →  Supabase Edge Function (no AI cost, instant, deterministic)   Needs reasoning?  →  DEVOS Agent Engine (Claude reads context, decides, acts)   Needs a service?  →  Agent uses the appropriate MCP tool |

## **4.2 System Layers**

| LAYER 1 — PRESENTATION LAYER (React \+ Vercel) |
| :---- |
| What humans see and interact with. Multi-tenant from day one via subdomain routing.   SUBDOMAIN ROUTING (built from Sprint 1):   devos.app/login          — Platform login and registration   \[slug\].devos.app         — Each client's branded instance (e.g. primerose.devos.app)   \[slug\].devos.app/buy     — Public-facing landing page and lead capture   \[slug\].devos.app/portal  — Buyer portal (authenticated)   \[slug\].devos.app/site    — Contractor portal (authenticated)   INTERNAL VIEWS (authenticated, role-gated):   Command Dashboard   — Developer's 10-minute morning view. All KPIs, flags, approvals.   Buyer Portal        — Buyer's personal account: unit, payments, docs, construction progress.   Contractor Portal   — Invoice submission with mandatory evidence uploads.   Sales Agent View    — Lead pipeline, buyer management, hot lead queue.   Finance View        — Payment ticket queue, outbound payment confirmation.   Site Manager View   — Mobile-optimised purchase request and progress updates.   Super Admin         — LawOne Cloud internal: all organisations, billing, usage, health.   Stack: React 18 \+ TypeScript \+ Vite \+ Tailwind CSS \+ shadcn/ui   Hosting: Vercel (automatic CI/CD from GitHub \+ wildcard subdomain support)   State: TanStack Query (server state) \+ Zustand (UI state)   Charts: Recharts |

| LAYER 2 — DATA LAYER (Supabase — Multi-Tenant) |
| :---- |
| The single source of truth for ALL organisations on the DEVOS platform. One Supabase instance. Complete data isolation enforced at the database level.   MULTI-TENANCY DESIGN:   organisations table  — Root entity. Every other table references this.   organisation\_id      — Present on EVERY table. This is non-negotiable.   RLS Policies         — auth.uid() must belong to the organisation that owns the row.                          A buyer from Organisation A can never see Organisation B data.                          A contractor from Project X can never see Project Y invoices.   Supabase Auth        — Roles: super\_admin, org\_admin, sales\_agent, finance,                                 site\_manager, buyer, contractor   INFRASTRUCTURE:   PostgreSQL Database  — All project, sales, financial, and construction data   Row-Level Security   — Enforced at DB level, not application level   Realtime             — Live dashboard updates scoped per organisation   Storage Buckets      — Organised by org\_id/project\_id/file\_type   Edge Functions       — Serverless event routing (replaces n8n entirely)   Supabase Vault       — Per-client API credentials stored encrypted                          (each client's WhatsApp token, Meta token, TikTok token)   EDGE FUNCTIONS (deterministic tasks — no AI reasoning needed):     • on-lead-created: create record → tag source → call DEVOS Agent Engine     • on-whatsapp-inbound: log message → call DEVOS Agent Engine     • on-invoice-submitted: validate evidence → call DEVOS Agent Engine     • on-payment-confirmed: update portal → check thresholds → trigger documents     • on-approval-granted: generate Payment Ticket → notify finance     • payment-reminder-7d/3d: scheduled, template messages, no AI needed     • morning-brief: 7am trigger → compile data → call DEVOS Agent Engine     • weekly-jv-report: Monday 7am → call DEVOS Agent Engine     • ad-performance-sync: every 6 hours → pull metrics → store to DB     • price-index-update: monthly → update materials index → run predictions |

| LAYER 3 — INTELLIGENCE LAYER (DEVOS Agent Engine) |
| :---- |
| The brain of DEVOS. A purpose-built, multi-tenant AI agent system powered by Claude. This is NOT OpenClaw. It is a standalone product component that any DEVOS client uses.   DESIGN:   Each agent call is scoped to a single organisation\_id.   The agent only ever sees data belonging to that organisation.   Agent context (project details, buyer histories, contractor records) is isolated per org.   All agent decisions are logged to agent\_logs with org\_id for full per-client auditability.   INFRASTRUCTURE:   Primary LLM:   Claude Sonnet via Anthropic API (hosted, no VPS dependency)   Fallback LLM:  OpenRouter (automatic rerouting on latency or downtime)   Local tasks:   Lightweight classification/summarisation via Ollama (cost reduction)                  (runs on LawOne Cloud VPS — does not affect other clients)   FOUR SPECIALISED AGENTS (each with its own system prompt and tool permissions):   PRESELL AGENT:     • Conduct multi-turn WhatsApp qualification conversations     • Analyse lead profile, dynamically update lead score     • Decide when to escalate a lead to human (Hot threshold)     • Compose personalised brochure sends and payment plan explanations     • Generate diaspora-specific messaging with currency conversion     • Draft cold lead reactivation messages   GUARDIAN AGENT:     • Analyse purchase requests vs market index, BOQ, and budget position     • Analyse invoices vs contract rates, progress records, and photo evidence     • Write detailed flag reports with severity, evidence, and recommended action     • Generate weekly JV partner financial reports     • Run predictive overrun analysis across all active budget categories   ADENGINE AGENT:     • Analyse campaign performance and recommend budget reallocation     • Detect ad fatigue and trigger creative refresh workflow     • Generate ad copy variants (3 per creative) tailored per audience     • Evaluate audience quality based on lead-to-reservation conversion     • Recommend campaign strategy adjustments based on attribution data   MASTER AGENT:     • Compose daily morning brief synthesising all overnight data per organisation     • Coordinate cross-module intelligence (budget risk → intensify sales)     • Maintain per-organisation context memory in agent\_context table     • Log all decisions, tool calls, and reasoning to agent\_logs   OPENCLAW RELATIONSHIP (LawOne Cloud internal only):     • OpenClaw connects to DEVOS via read-only supabase-mcp     • OpenClaw reads Law's DEVOS morning brief and synthesises with broader context     • OpenClaw CANNOT write to DEVOS, act as DEVOS agent, or access other orgs     • This connection is a private integration — not a product feature |

| LAYER 4 — MCP TOOL LAYER (Shared Infrastructure, Per-Client Credentials) |
| :---- |
| One set of MCP servers handles all client organisations. Each MCP call is authenticated using that specific client's credentials, retrieved from Supabase Vault (encrypted per-org credential store). Clients connect their own WhatsApp number, Meta Ads account, TikTok account. DEVOS never uses one client's credentials for another client's requests.   CREDENTIAL FLOW:   1\. Client onboards → enters their API credentials in DEVOS Settings   2\. DEVOS stores credentials encrypted in Supabase Vault under their org\_id   3\. When agent makes an MCP call → MCP server retrieves credentials for that org\_id   4\. MCP call is made using that client's credentials only   supabase-mcp (Official Supabase MCP)     READ:  all tables scoped to caller's organisation\_id     WRITE: lead scores, whatsapp\_threads, agent\_logs, notifications (org-scoped)     BLOCKED: payments\_out, approvals, unit\_prices without Payment Ticket   whatsapp-mcp (Custom — wraps Meta WhatsApp Business Cloud API)     CREDENTIALS: per-org WhatsApp Business token from Supabase Vault     SEND:  text, media, PDF documents, approved template messages     READ:  incoming message webhooks (routed to correct org by phone number)     BLOCKED: delete messages, modify business profile   meta-ads-mcp (Custom — wraps Meta Marketing API)     CREDENTIALS: per-org Meta System User Token from Supabase Vault     READ:  campaign performance, ad set metrics, audience insights     WRITE: pause/resume ad sets; adjust daily budget within ±40% of approved     BLOCKED: increase total campaign budget; create campaigns without approval   tiktok-ads-mcp (Custom — wraps TikTok Business API)     CREDENTIALS: per-org TikTok Business API token from Supabase Vault     READ:  campaign and ad group performance metrics     WRITE: pause/resume ad groups; adjust bids within approved parameters     BLOCKED: increase total budget; create campaigns without approval   email-mcp (Custom — wraps Resend API)     CREDENTIALS: shared Resend API key (from-address customised per org)     SEND:  JV reports, documents, portal invitations, finance notifications     BLOCKED: send to addresses not registered in that org's DEVOS contacts   pdf-mcp (Supabase Edge Function)     GENERATE: documents from org's approved templates (stored per org in Supabase)     STORE:  PDFs saved to org-scoped Supabase Storage path   veo3-mcp (Custom — wraps Google Veo 3 / AI Studio API)     GENERATE: ad video creatives from prompts \+ org's project render assets     STORE:  generated videos saved as PENDING\_APPROVAL in org-scoped storage     BLOCKED: publish directly — requires explicit developer approval per org |

## **4.3 Event Flow: How the Layers Connect**

Every interaction in DEVOS follows a clean, traceable path through the layers. Every event is scoped to an organisation\_id from the moment it enters the system. Below are the three most important event flows.

### **Flow A — New Lead From Ad Click**

| LEAD CAPTURE FLOW |
| :---- |
| 1\. Amaka clicks Instagram ad (Magic Link URL: primerose.devos.app/ref/META-DIA-A) 2\. VERCEL serves Primerose landing page (React, subdomain-routed) 3\. Amaka fills lead form and submits 4\. SUPABASE EDGE FUNCTION fires (on-lead-created):      → Creates lead record tagged with organisation\_id (Primerose) \+ source ad ref      → Calculates initial lead score (profile signals)      → Retrieves Primerose project context from DB      → Calls DEVOS PRESELL AGENT with: lead profile \+ org context \+ conversation prompt 5\. DEVOS PRESELL AGENT decides opening qualification message      → Calls whatsapp-mcp (with Primerose WhatsApp credentials): SEND message      → Logs decision to agent\_logs (org\_id: Primerose) 6\. Amaka replies on WhatsApp 7\. WHATSAPP WEBHOOK fires → on-whatsapp-inbound Edge Function:      → Identifies organisation by phone number → routes to correct org      → Updates whatsapp\_threads (org-scoped)      → Calls DEVOS PRESELL AGENT with full conversation history (org-scoped) 8\. DEVOS PRESELL AGENT reads context, decides next response      → Updates lead score via supabase-mcp (org-scoped write)      → Calls whatsapp-mcp: SEND next message      → If score ≥70: flags lead as HOT → Edge Function alerts sales agent 9\. Complete audit trail in agent\_logs. Zero data visible to other organisations. |

### **Flow B — Contractor Submits Invoice**

| INVOICE VERIFICATION FLOW |
| :---- |
| 1\. Bayo Contractors logs into Contractor Portal (primerose.devos.app/site) 2\. Fills invoice form, uploads 6 required evidence photos 3\. Submits — SUPABASE EDGE FUNCTION fires (on-invoice-submitted):      → Validates all evidence fields present (blocks submission if missing)      → Creates invoice record (org\_id: Primerose)      → Retrieves signed contract, BOQ, latest progress report (all org-scoped)      → Calls DEVOS GUARDIAN AGENT with full invoice \+ context package 4\. DEVOS GUARDIAN AGENT runs full analysis:      → Compares invoice rate vs contract rate      → Compares quantities vs BOQ estimates      → Compares prices vs materials market index      → Cross-references claimed progress vs site manager progress report      → Reviews photo evidence consistency      → Writes structured flag report with severity levels      → Calls supabase-mcp: WRITE analysis \+ flags (org-scoped) 5\. EDGE FUNCTION detects completed analysis:      → Notifies site manager to verify (if discrepancies found)      → Sends developer WhatsApp alert (via whatsapp-mcp with org credentials)      → Places invoice in approval queue on Command Dashboard 6\. Developer taps Approve/Adjust/Reject on dashboard 7\. EDGE FUNCTION fires on-approval-granted:      → Generates Payment Ticket via pdf-mcp (org-scoped template)      → Notifies finance via email-mcp      → Updates budget dashboard (Supabase Realtime, org-scoped)      → Logs full approval chain to approvals table |

### **Flow C — Daily Morning Brief**

| MORNING BRIEF FLOW |
| :---- |
| 1\. SUPABASE EDGE FUNCTION scheduled trigger fires at 07:00 AM (per organisation timezone) 2\. Edge Function compiles overnight data snapshot (all queries org-scoped):      → New leads, score changes, WhatsApp replies      → Payments received, missed, overdue      → Invoice and approval activity      → Ad campaign performance (last 24h)      → Construction progress updates      → Active GUARDIAN flags 3\. Edge Function calls DEVOS MASTER AGENT with data snapshot \+ org context 4\. DEVOS MASTER AGENT synthesises:      → Identifies 2–3 most important decisions needed      → Summarises everything else as handled      → Composes personalised WhatsApp brief      → Calls whatsapp-mcp (org credentials): SEND to developer      → Logs to agent\_logs (org-scoped) 5\. Developer reads brief in \<2 minutes.    FOR LAW PERSONALLY (not a product feature):    OpenClaw reads the Primerose morning brief from Supabase via read-only supabase-mcp    and synthesises it with broader LawOne Cloud business context.    This is a private connection — invisible to all other DEVOS clients. |

## **4.4 Agent Permission Boundaries**

The DEVOS Agent Engine operates within explicitly defined permission boundaries enforced at both the MCP tool level and Supabase RLS level — not just in the agent's system prompt. This is critical for financial integrity, legal compliance, and client trust.

| DEVOS Agent Engine CAN Do Autonomously | DEVOS Agent Engine CANNOT Do — Human Required |
| :---- | :---- |
| Send WhatsApp messages to leads and buyers | Confirm a reservation (finance must verify bank receipt) |
| Update lead scores and conversation state | Approve any outbound payment |
| Flag invoices and write analysis reports | Modify unit prices or payment terms |
| Generate draft documents (stored, not sent) | Sign or dispatch a legal document |
| Pause underperforming ad sets (within campaign) | Increase total campaign budget |
| Generate new ad copy variants | Publish new video creatives (requires approval) |
| Write and send morning brief | Create a new campaign from scratch |
| Send payment reminder templates to buyers | Write off or waive a buyer payment |
| Generate and send JV weekly report | Change JV partner reporting recipients |
| Recommend budget reallocation | Execute any budget reallocation |
| Escalate hot leads to sales agent | Mark a unit as Sold |

## **4.5 Technology Stack**

| Component | Technology / Decision |
| :---- | :---- |
| Frontend Framework | React 18 \+ TypeScript \+ Vite |
| Styling | Tailwind CSS \+ shadcn/ui component library |
| Multi-tenant Routing | Wildcard subdomain routing via Vercel (\[slug\].devos.app) |
| Backend / Database | Supabase — single multi-tenant instance (PostgreSQL \+ Auth \+ Storage \+ Realtime) |
| Multi-tenancy | organisation\_id on every table \+ RLS policies enforced at DB level |
| Credential Store | Supabase Vault — per-org API credentials encrypted at rest |
| Event Routing | Supabase Edge Functions (Deno runtime) — replaces n8n entirely |
| AI Agent System | DEVOS Agent Engine — purpose-built, multi-tenant Claude-powered agent system |
| LLM — Primary | Claude Sonnet via Anthropic API (hosted, no VPS dependency) |
| LLM — Fallback | OpenRouter (automatic failover routing) |
| LLM — Local Lightweight | Ollama on LawOne Cloud VPS (classification \+ summarisation — cost reduction) |
| Agent Tool Protocol | MCP — all external service connections with per-client credential injection |
| WhatsApp Integration | Custom whatsapp-mcp server (Meta WhatsApp Business Cloud API) |
| Ad Management | Custom meta-ads-mcp \+ tiktok-ads-mcp (per-client credentials) |
| Video Generation | Custom veo3-mcp (Google Veo 3 / AI Studio API) |
| Email Delivery | Custom email-mcp (Resend API — per-org sender identity) |
| Document Generation | Supabase Edge Function \+ React-PDF (per-org templates) |
| Billing / Subscriptions | Paystack (Nigerian market) \+ Stripe (international) — Phase 5 |
| Frontend Hosting | Vercel (CI/CD from GitHub \+ wildcard subdomain) |
| OpenClaw Integration | Read-only supabase-mcp connection — private, not a product feature |
| Auth | Supabase Auth (email/password \+ magic link \+ role-based per organisation) |
| State Management | TanStack Query \+ Zustand |
| Charts | Recharts |
| Version Control | GitHub (private repository) |

## **4.6 Database Schema Overview**

Every table carries organisation\_id as a foreign key to the organisations table. RLS policies ensure all queries are automatically scoped to the authenticated user's organisation. This is the foundation of multi-tenancy — set up in Sprint 1, never retrofitted.

| CORE DATABASE TABLES |
| :---- |
| ── PLATFORM LAYER (multi-tenancy root) ────────────────────────────────── organisations     — Root entity for every DEVOS client. All other tables ref this.   Fields: id, name, slug (subdomain), plan\_tier, billing\_status, created\_at subscriptions     — Billing and plan management per organisation org\_credentials   — Encrypted per-org API keys (WhatsApp, Meta, TikTok) via Supabase Vault org\_members       — Users belonging to an organisation with their role agent\_context     — Per-org persistent context for DEVOS Agent Engine memory ── PROJECT LAYER ──────────────────────────────────────────────────────── projects          — Development projects (one org can have multiple projects) units             — Individual housing units per project with status tracking ── PRESELL LAYER ──────────────────────────────────────────────────────── leads             — All incoming inquiries: source ad, score, stage, conversation state buyers            — Confirmed buyers converted from leads reservations      — Unit reservations with status, deposit, payment schedule payments\_in       — All inbound buyer payments with receipt evidence documents         — Generated documents per buyer (Reservation Letter, Agreement, etc.) whatsapp\_threads  — Full conversation history per lead/buyer (org-scoped) ── ADENGINE LAYER ─────────────────────────────────────────────────────── campaigns         — Ad campaigns with budget, platforms, duration, objective ad\_sets           — Individual ad sets within campaigns ad\_creatives      — Creative assets with approval\_status (PENDING/APPROVED/LIVE/PAUSED) ad\_performance    — Daily metrics per ad: spend, impressions, clicks, leads, ROAS lead\_attribution  — Maps every lead to the exact ad\_creative that generated it ── GUARDIAN LAYER ─────────────────────────────────────────────────────── budget\_phases     — Construction budget by phase and category price\_index       — Materials market rates by region, updated monthly purchase\_requests — Procurement requests with GUARDIAN analysis attached invoices          — Contractor invoices with evidence URLs and AI analysis invoice\_flags     — Individual flags per invoice: severity, evidence, resolution approvals         — Full approval chain: actor, decision, timestamp, reference payments\_out      — Outbound construction payments (requires Payment Ticket) payment\_tickets   — System-generated approval references for all outbound payments contractors       — Contractor profiles: rates, reliability score, dispute history progress\_updates  — Weekly site progress per phase with photo evidence ── SYSTEM LAYER ───────────────────────────────────────────────────────── notifications     — System notifications per user (org-scoped) agent\_logs        — ALL DEVOS Agent Engine decisions: timestamp, agent\_type, org\_id,                     tool\_calls, reasoning\_summary, outcome mcp\_tool\_calls    — Individual MCP invocations: tool, org\_id, inputs, outputs, latency |

# **5\. SaaS Infrastructure Design**

This section defines how DEVOS operates as a multi-client commercial product. These decisions are made and implemented in Sprint 1 — not Phase 5\. Building SaaS infrastructure after the fact is one of the most expensive mistakes in software development. The extra 3–4 days spent now saves months of rebuilding later.

## **5.1 Multi-Tenancy Model**

DEVOS uses a shared database multi-tenancy model. One Supabase instance serves all client organisations. Data isolation is enforced at the database level through Row-Level Security policies — not at the application level.

| WHY SHARED DATABASE (NOT SEPARATE INSTANCES PER CLIENT) |
| :---- |
| Option 1: Separate Supabase instance per client   ✗ Exponentially increasing operational cost as clients grow   ✗ Cannot run platform-wide analytics or price index updates   ✗ Each new client requires manual infrastructure provisioning   ✗ Cannot share MCP servers across clients (separate deployments needed) Option 2: Shared database with organisation\_id \+ RLS (CHOSEN)   ✓ One instance scales to 100+ clients with no architecture change   ✓ Automatic data isolation — enforced at DB level, impossible to bypass   ✓ Platform-wide materials price index updated once, available to all   ✓ Instant client onboarding — create org record, configure credentials, done   ✓ Shared MCP infrastructure with per-client credential injection   ✓ Single codebase, single deployment, single monitoring surface |

### **RLS Policy Pattern (Applied to Every Table)**

| RLS POLICY EXAMPLE — leads table |
| :---- |
| \-- Developers and sales agents can only see leads in their organisation CREATE POLICY "org\_isolation" ON leads   USING (organisation\_id \= get\_user\_org\_id(auth.uid())); \-- Buyers can only see their own lead/buyer record CREATE POLICY "buyer\_own\_record" ON leads   USING (buyer\_user\_id \= auth.uid()); \-- DEVOS Agent Engine uses a service role key (bypasses RLS) \-- BUT agent is always called with org\_id parameter \-- AND agent\_logs records org\_id on every action \-- This provides auditability without sacrificing performance |

## **5.2 Organisation Onboarding Flow**

When a new developer client signs up for DEVOS, the onboarding flow takes them from account creation to first lead captured in under 2 hours. This is the target from Phase 5 — but the infrastructure to support it is built from Sprint 1\.

6. Create Account — Developer registers on devos.app. Organisation record created. Subdomain reserved (\[slug\].devos.app).

7. Choose Plan — Starter / Growth / Enterprise. Billing connected via Paystack (Nigeria) or Stripe (international). Subscription record created.

8. Create Project — Project name, location, total units, completion date. Unit types configured with prices and payment plans.

9. Configure Budget — Upload BOQ. Set phase budgets. Upload signed contractor contracts. Materials price index auto-populated for their region.

10. Connect Credentials — WhatsApp Business number, Meta Ads account, TikTok account. Credentials stored encrypted in Supabase Vault.

11. Upload Assets — Project renders, logo, brand colours. Landing page auto-generated at \[slug\].devos.app/buy.

12. Launch First Campaign — AdEngine generates first creative suite. Developer reviews and approves. Campaign live.

13. First Lead — Within hours of campaign launch, first lead captured. DEVOS Agent Engine sends opening WhatsApp. Developer sees it on dashboard.

    *⚠ Onboarding target: \< 2 hours from signup to first lead captured. This is a KPI for the product team.*

## **5.3 Subscription Tiers**

|  | Starter | Growth | Enterprise |
| :---- | :---- | :---- | :---- |
| Price | ₦150,000/month | ₦400,000/month | ₦800,000+/month |
| Active Projects | 1 | 1 | Multiple |
| Units Per Project | Up to 50 | Up to 200 | Unlimited |
| PRESELL Module | ✓ Full | ✓ Full | ✓ Full |
| GUARDIAN Module | ✗ | ✓ Full | ✓ Full |
| AdEngine Module | ✗ | ✓ Full | ✓ Full |
| WhatsApp Conversations | 500/month | 3,000/month | Unlimited |
| Ad Spend Managed | Up to ₦500K/month | Up to ₦5M/month | Unlimited |
| Team Members | 3 | 10 | Unlimited |
| JV Partner Reports | ✗ | ✓ Automated | ✓ Automated |
| White Label | ✗ | ✗ | ✓ Custom domain \+ branding |
| SLA / Support | Email | Priority WhatsApp | Dedicated \+ SLA |
| Onboarding | Self-serve | Guided (2 sessions) | Full concierge |

*⚠ Primerose Smart City Cluster uses the Growth tier as a reference implementation. Law's account is not free — it is invoiced internally at Growth tier pricing to validate the real client experience.*

## **5.4 Billing Architecture**

* Paystack integration for Nigerian naira subscriptions (primary market)

* Stripe integration for USD/GBP subscriptions (diaspora developer clients)

* Monthly recurring billing on subscription anniversary date

* Usage metering: WhatsApp conversation count, unit count, ad spend volume tracked against plan limits

* Overage alerts at 80% of plan limits — developer can upgrade or DEVOS warns before throttling

* Grace period: 7 days after failed payment before service restriction

* Subscription management portal within DEVOS account settings

## **5.5 Super Admin Panel**

LawOne Cloud operates a Super Admin panel accessible only to platform administrators. This is the operational control centre for the DEVOS SaaS business.

| Super Admin Capability | Purpose |
| :---- | :---- |
| All organisations list \+ health status | Monitor all client accounts at a glance |
| Per-org usage metrics | Conversations, leads, ad spend, units — against plan limits |
| Billing and payment status | Identify at-risk accounts, chase failed payments |
| Agent performance dashboard | DEVOS Agent Engine decision quality, error rates, latency |
| MCP server health | Uptime, error rates, and latency per MCP server |
| Platform-wide materials price index | Update market rates that serve all clients |
| Feature flags per organisation | Enable/disable features for specific clients |
| Impersonate organisation (read-only) | Debug client issues without seeing sensitive data |
| Manual onboarding assistance | Create/edit org records for clients needing help |

## **5.6 The OpenClaw — DEVOS Relationship (Defined Once, Clearly)**

| Dimension | OpenClaw vs DEVOS Agent Engine |
| :---- | :---- |
| What it is | OpenClaw: Law's personal business AI  |  DEVOS: A commercial product |
| Who uses it | OpenClaw: Only Law  |  DEVOS Agent Engine: Every DEVOS client |
| Infrastructure | OpenClaw: LawOne Cloud VPS  |  DEVOS: Anthropic API (hosted, scalable) |
| Context | OpenClaw: Full LawOne Cloud business (govt, KeepFlock, FarmFlow, etc.)  |  DEVOS: Project data only, isolated per org |
| Data access | OpenClaw: Read-only connection to Primerose DEVOS data  |  DEVOS Agent: Full read/write within org permissions |
| Other clients | OpenClaw: Cannot access any other org's DEVOS data  |  DEVOS Agent: Serves all orgs in isolation |
| Product status | OpenClaw: Private tool  |  DEVOS Agent Engine: Core product component |
| Revenue | OpenClaw: No revenue  |  DEVOS: ₦150K–₦800K+/month per client |

# **6\. Module 1: PRESELL**

PRESELL is the autonomous sales engine of DEVOS. It encompasses two tightly integrated sub-systems: AdEngine (acquisition) and the Conversion Engine (qualification through signed agreement). Together they form a single, unbroken pipeline from the first ad impression to a signed sale agreement — with revenue attributed back to the originating ad creative.

| PRESELL OBJECTIVE |
| :---- |
| Generate buyer demand via targeted paid advertising, capture every lead automatically, qualify leads 24/7 via AI-driven WhatsApp conversations, convert qualified leads into paying buyers, manage their payment schedules, generate legal documents, and provide each buyer with a personalised portal — all with minimal human involvement. |

## **5.1 AdEngine — Acquisition Sub-System**

### **5.1.1 Campaign Management**

AdEngine allows the developer to create, configure, launch, and monitor paid advertising campaigns across multiple platforms from a single interface within DEVOS.

**Campaign Setup Fields**

| Field | Description |
| :---- | :---- |
| Campaign Name | Internal reference name (e.g., "Primerose Phase 1 Launch") |
| Objective | Unit Reservations / Lead Generation / Brand Awareness |
| Target Reservations | Numeric goal (e.g., 40 reservations) |
| Total Budget (₦) | Total campaign budget allocated |
| Duration | Start date and end date |
| Platforms | Multi-select: Meta (Instagram/Facebook), TikTok, YouTube, Google Display |
| Budget Split | AI-suggested % allocation per platform, editable by user |
| Target Audiences | Multi-select from pre-configured audience templates \+ custom |
| Unit Types to Promote | Link to specific unit types in the project inventory |

**Audience Templates (Pre-configured for Nigerian Market)**

* Lagos Professionals (35–55) — salaried workers, business owners, Lagos metro

* Port Harcourt / Abuja Middle Class (30–50) — local buyers, relocation interest

* Nigerian Diaspora UK — Nigerian heritage users in London, Manchester, Birmingham

* Nigerian Diaspora US — Houston, Atlanta, Maryland metro areas

* Nigerian Diaspora Canada — Toronto, Calgary Nigerian communities

* Warm Retargeting — users who visited the landing page but did not convert

* Buyer Lookalike — meta lookalike audience built from confirmed buyer profiles

### **5.1.2 Creative Factory**

AdEngine integrates with Google Veo 3 and the AI API to generate a full suite of ad creatives automatically when a campaign is set up. The developer reviews and approves before publishing.

**Creative Types Generated**

| Type | Length | Platform | Message Focus | Audience |
| :---- | :---- | :---- | :---- | :---- |
| Vision Video | 30 sec | Meta, TikTok, YouTube | Project overview, lifestyle, community | General, Diaspora |
| Investment Video | 15 sec | Meta, TikTok | ROI, yield, capital growth | Investors, Diaspora |
| Lifestyle Video | 20 sec | Meta, Instagram Reels | Family, community, smart living | Family buyers |
| Urgency Video | 10 sec | Meta, TikTok (Retargeting) | Limited units, price escalation | Warm leads |
| Static Price Card | Image | Meta, Google Display | Unit types \+ prices \+ payment plan | All |
| Payment Plan Graphic | Image | Meta, WhatsApp | Monthly instalment calculator | Price-sensitive |
| Progress Update | Image/Video | All platforms | Construction milestone achieved | All (weekly) |
| Testimonial Card | Image | Meta | Buyer quote/photo post-reservation | All (Phase 2+) |

**Copy Variants**

For every video ad, AdEngine generates 3 copy variants (caption/headline). These are A/B tested automatically. The worst performer is paused after 7 days. Copy is tailored per audience — diaspora audiences receive pound/dollar-equivalent pricing.

**Creative Approval Workflow**

14. AdEngine generates creative suite and presents for review in DEVOS dashboard.

15. Developer reviews all creatives in one session (estimated 10–15 minutes).

16. Approved creatives are published to configured platforms automatically.

17. When AdEngine generates new creatives (ad refresh cycle), it sends a WhatsApp preview to the developer for 30-second approval before publishing.

    *⚠ CRITICAL: AdEngine NEVER publishes new creative without explicit developer approval. This is a hard rule, not a configurable option.*

### **5.1.3 Magic Link Tracking System**

Every ad and every audience combination receives a unique UTM-tagged tracking URL. This is the mechanism that closes the attribution loop between ad spend and revenue.

Format: devos.\[projectslug\].ng/ref/\[PLATFORM\]-\[AUDIENCE\]-\[CREATIVE\]

Example: devos.primerose.ng/ref/META-DIA-A (Meta, Diaspora audience, Creative Set A)

When a lead clicks this link and submits the lead capture form, their DEVOS profile is permanently tagged with the source ad. This tag persists through their entire buyer journey — reservation, payments, and signed agreement. The AdEngine can then calculate exact revenue attribution per ad creative.

### **5.1.4 Campaign Monitoring & Autonomous Optimisation**

AdEngine runs an automated optimisation cycle every 48 hours. The following actions are taken autonomously (no human approval required):

* Pause ad copy variants with CTR below campaign average after 7 days

* Pause ad sets with zero conversions after 14 days (funds reallocated to top performers)

* Scale daily budget of top-performing ad sets by up to 40% if conversion rate justifies

* Add warm site visitors to retargeting audience and deploy urgency ads

* Refresh creative when ad fatigue is detected (CTR declining \>30% over 7 days)

The following actions require developer approval before execution:

* Pause an entire campaign or platform (not just an ad set)

* Increase total campaign budget beyond original allocation

* Publish new video creatives generated during campaign

* Change target audience parameters

**Performance Metrics Tracked (per ad, per ad set, per campaign)**

| Metric | Description |
| :---- | :---- |
| Impressions | Total number of times the ad was shown |
| Clicks | Total link clicks to landing page |
| CTR | Click-through rate (clicks / impressions) |
| Leads Generated | Number of lead form completions attributed to this ad |
| Cost Per Lead (CPL) | Ad spend / leads generated |
| Reservations | Number of confirmed reservations attributed to this ad |
| Cost Per Reservation | Ad spend / reservations |
| Revenue Attributed | Total unit value of buyers traced to this ad |
| ROAS | Return on Ad Spend (revenue attributed / ad spend) |
| Time to Reservation | Average days from first click to confirmed reservation |

### **5.1.5 Revenue Attribution Report**

Generated automatically at end of each calendar month. Distributed to developer \+ finance. Contains:

* Total ad spend vs total revenue attributed (by platform, by audience, by creative)

* Top 3 performing ads with full metrics

* Bottom 3 performing ads with recommendation (pause / refresh / reallocate)

* Cost per reservation benchmarks vs industry average

* Budget recommendations for following month based on performance data

## **5.2 Conversion Engine**

### **5.2.1 Landing Page**

Each project has a branded, mobile-optimised landing page hosted on DEVOS. The page is dynamically updated as unit inventory changes.

**Landing Page Components**

* Hero section: AI-generated project renders / Veo walkthrough video (auto-plays muted)

* Project overview: location, unit count, key features, completion timeline

* Unit type selector: interactive cards for each available unit type with price, size, floor plan thumbnail

* Payment plan calculator: buyer enters budget → DEVOS calculates deposit \+ monthly instalment

* Construction progress bar: auto-updated from site manager weekly uploads

* Developer credentials: company registration, JV documentation summary, project director bio

* Lead capture form: Name, Phone, Email, City/Country, Unit Interest, Budget Range, Investment or Own-Use

* WhatsApp CTA button: "Chat with us now" — opens pre-populated WhatsApp message

**Unit Inventory Display**

A visual unit availability grid shows all units colour-coded by status:

| Colour | Status |
| :---- | :---- |
| Green | Available — can be reserved |
| Amber | Reserved — deposit received, payment plan active |
| Red | Sold — sale agreement signed |
| Grey | Held — temporarily unavailable |

As units are reserved and sold within DEVOS, the landing page inventory updates in real time without any manual intervention.

### **5.2.2 Lead Capture & Scoring**

Every lead form submission triggers an immediate DEVOS intake sequence:

18. Lead profile created in Supabase with all form data \+ source ad tag.

19. Lead Score calculated automatically (0–100).

20. Lead categorised: Cold (0–39), Warm (40–69), Hot (70–100).

21. Instant WhatsApp acknowledgement sent to lead (within 60 seconds).

22. Sales agent notified of new lead with score and recommended next action.

**Lead Scoring Algorithm**

| Signal | Score Points |
| :---- | :---- |
| Located in Lagos or Abuja | \+15 |
| Diaspora location (UK/US/Canada) | \+20 |
| Budget matches available unit types | \+20 |
| Investment purpose (vs own-use) | \+10 |
| Clicked from paid ad (vs organic) | \+5 |
| Returned to landing page 2+ times | \+15 |
| Requested brochure or walkthrough | \+10 |
| Responded to WhatsApp within 1 hour | \+15 |
| Unresponsive after 48 hours | \-10 |
| Budget below minimum unit price | \-20 |

### **5.2.3 WhatsApp Qualification Flow**

This is the core intelligence of PRESELL. The AI agent conducts a structured but conversational qualification dialogue with every new lead via WhatsApp. The goal is to move the lead from initial inquiry to a confirmed reservation appointment — without human involvement until the lead is Hot.

**Qualification Flow States**

| State | Trigger / Description |
| :---- | :---- |
| INTAKE | Lead form submitted → send welcome message and opening question |
| QUALIFYING | Gathering intent, budget confirmation, unit preference |
| EDUCATING | Sending brochure, walkthrough video, payment plan details |
| OBJECTION | Handling trust, pricing, timing, or location objections |
| HOT | Lead score ≥70 and has engaged with brochure → escalate to human |
| APPOINTMENT | Human call scheduled → brief sales agent with lead summary |
| RESERVATION | Lead ready to pay deposit → send payment instructions |
| COLD | No response for 5 days → move to retargeting sequence |
| DEAD | Explicitly declined or unresponsive for 30 days → archive |

**Diaspora-Specific Qualification Logic**

Leads identified as diaspora (UK/US/Canada via location or country code) receive a modified flow:

* Prices quoted in both ₦ and GBP/USD equivalent

* Additional trust-building content: escrow process, developer credentials, legal framework

* Virtual tour link sent proactively (they cannot visit in person)

* NPC Development JV summary shared to establish institutional credibility

* Flexible international payment options highlighted (domiciliary account, wire transfer)

### **5.2.4 Reservation Process**

When a lead is ready to reserve, the WhatsApp agent walks them through the full reservation sequence:

23. Agent presents unit options matching buyer's stated budget and preference.

24. Buyer selects unit. Agent confirms availability in real-time (checks Supabase inventory).

25. Agent presents personalised reservation summary: unit details, total price, deposit amount, payment schedule.

26. Agent sends bank payment details with unique reference code (format: PRMS-\[BUYERINITIALS\]-\[UNITCODE\]).

27. Buyer makes transfer and sends receipt photo to WhatsApp.

28. DEVOS logs receipt, marks unit as "Reserved — Pending Confirmation."

29. Finance team notified to verify bank receipt.

30. On confirmation: unit status updated to "Reserved," buyer portal account created, Reservation Letter PDF auto-generated and sent.

    *⚠ The unit is NOT marked Reserved until the developer or finance team confirms receipt in DEVOS. This is the ONE mandatory human checkpoint in the reservation flow.*

### **5.2.5 Buyer Portal**

Every confirmed buyer receives access to a personalised web-based Buyer Portal. This is their single source of truth throughout the entire project.

**Buyer Portal Sections**

| Section | Content |
| :---- | :---- |
| My Unit | Unit number, type, floor, orientation, size, render images |
| Payment Tracker | Visual progress bar showing total paid vs outstanding; list of all payments with dates and receipts; next payment due date and amount |
| Construction Progress | Phase-by-phase progress bars; latest site photos (auto-updated weekly); estimated completion date |
| My Documents | All generated documents: Reservation Letter, Sale Agreement, payment receipts — all downloadable as PDF |
| Support Chat | WhatsApp redirect for queries; escalation to human agent for complex issues |
| Unit Upgrades (Phase 2\) | Optional add-ons: smart home package, interior fit-out, parking upgrade |

### **5.2.6 Payment Management**

For every buyer on a payment plan, DEVOS manages the entire payment lifecycle autonomously:

**Payment Reminder Sequence**

| Timing | Action |
| :---- | :---- |
| 7 days before due date | WhatsApp reminder with payment details and reference code |
| 3 days before due date | Second WhatsApp reminder |
| Due date (if unpaid) | WhatsApp notice: payment due today |
| 3 days late | WhatsApp: gentle follow-up with payment link |
| 7 days late | WhatsApp: formal notice with contract reference |
| 14 days late | Flag to sales agent for personal phone call |
| 30 days late | Auto-generate Notice of Default letter for developer review and signature |

All payment reminders include the exact amount, bank details, unique reference code, and a link to the buyer portal. When a buyer sends a receipt, DEVOS logs it and updates the portal within 24 hours of finance confirmation.

### **5.2.7 Document Generation**

DEVOS auto-generates all legal and administrative documents from pre-approved templates. Every document is stored in the buyer's profile and accessible via the Buyer Portal.

| Document | Trigger |
| :---- | :---- |
| Reservation Letter | Finance confirms deposit receipt |
| Sale & Purchase Agreement | Buyer reaches 10% of total unit price paid |
| Payment Receipt | Every confirmed payment |
| Payment Schedule | Generated at reservation, updated if payment plan changes |
| Notice of Default | Auto-generated at 30 days late, requires developer approval before sending |
| Handover Certificate (Phase 2\) | Unit completion confirmed by site manager |

*⚠ All document templates must be legally reviewed and approved by the developer's solicitor before activation. DEVOS generates from fixed templates; it does not create novel legal language.*

# **7\. Module 2: GUARDIAN**

GUARDIAN is the autonomous budget intelligence engine of DEVOS. It functions as a financial immune system for the construction project — monitoring every purchase request and contractor invoice against market rates, contract terms, BOQ estimates, and physical site progress before any payment is approved.

| GUARDIAN OBJECTIVE |
| :---- |
| Ensure no naira leaves the project without passing through an automated intelligence check. Catch overpricing, quantity inflation, and progress misrepresentation before payment is made. Give the developer real-time visibility into budget health and predict overruns 6–8 weeks before they become critical — and automatically generate transparent reports for JV partners. |

## **6.1 Budget Structure Setup**

When a project is created in DEVOS, the developer inputs the master budget structured by phase and category. This becomes the financial baseline against which all actual costs are measured.

**Budget Setup Fields**

| Field | Description |
| :---- | :---- |
| Project Total Budget | Total construction budget (₦) |
| Contingency Reserve % | Percentage held as contingency (recommended: 10–15%) |
| Phase Names | Developer defines phases (e.g., Phase 1: Foundation, Phase 2: Structural) |
| Phase Budget | Budget allocated per phase |
| Budget Categories | Within each phase: Materials, Labour, Equipment, Preliminaries, Professional Fees |
| Category Budgets | Allocated amount per category per phase |
| Phase Start / End Dates | Planned timeline for each phase |
| Bill of Quantities (BOQ) | Upload of project BOQ document (used for quantity validation) |
| Signed Contracts | Upload of all contractor contracts (used for rate validation) |

*⚠ The budget structure, BOQ, and signed contracts are the foundation of GUARDIAN's intelligence. The more accurately these are set up, the more precise GUARDIAN's anomaly detection will be.*

## **6.2 Materials Price Intelligence**

GUARDIAN maintains a live Nigerian construction materials price index, updated monthly via automated web scraping of major supplier websites and price aggregation services. This index covers the most common materials used in residential construction in Rivers State and Lagos.

**Materials Index Coverage (Initial)**

* Cement (Portland, OPC) — per bag, by brand

* Reinforcement steel (rods) — per tonne, by grade

* Blocks (9-inch, 6-inch) — per unit

* Roofing sheets (various gauges) — per sheet

* Sand and gravel — per trip

* Roofing timber — per length

* Plumbing materials (PVC pipes, fittings) — per item

* Electrical cables and fittings — per item

* Ceramic tiles — per square metre

* Paint (emulsion, gloss) — per litre/bucket

When a purchase request is submitted, the submitted price is compared against the index range. Prices within range are auto-approved (subject to budget availability). Prices above range trigger a flag.

## **6.3 Purchase Request Workflow**

All materials and services procurement must be initiated through DEVOS as a Purchase Request. No procurement outside of this system should result in payment from the project.

**Purchase Request Fields**

| Field | Description |
| :---- | :---- |
| Category | Materials / Labour / Equipment / Professional Services |
| Item Description | Specific item name and specification |
| Quantity | Amount with unit of measure |
| Preferred Supplier | Supplier name from contractor database |
| Quoted Unit Price | Price per unit as quoted |
| Total Value | Auto-calculated (quantity × unit price) |
| Phase & Budget Line | Which phase and category this request falls under |
| Urgency | Within 24h / Within 3 days / Within 1 week |
| Justification Notes | Brief explanation (e.g., "For blocks B1-B40 foundation pour") |
| Supporting Quote | Optional: upload of written supplier quote |

**GUARDIAN Automated Checks on Purchase Request**

31. PRICE CHECK: Compare submitted price against materials index. Flag if \>5% above market midpoint.

32. QUANTITY CHECK: Cross-reference with BOQ. Flag if quantity exceeds BOQ estimate by \>15%.

33. BUDGET CHECK: Verify sufficient budget remains in the specified phase/category. Flag if approval would take phase to \>85% budget consumed before it is \>85% physically complete.

34. SUPPLIER CHECK: Verify supplier exists in approved contractor database. Flag if new/unregistered supplier.

35. DUPLICATE CHECK: Scan for similar recent requests (same item, same supplier within 14 days) to detect duplicate submissions.

**GUARDIAN Decision Output**

| Outcome | Condition |
| :---- | :---- |
| Auto-Approve (Low Risk) | All checks pass, within budget, price within market range |
| Recommend Adjusted Price | Price flagged — GUARDIAN recommends approval at market midpoint |
| Flag for Review | One or more checks triggered — sent to developer with full analysis |
| Auto-Reject (Block) | Submitted price \>30% above market OR would breach budget ceiling |

## **6.4 Invoice Submission & Verification**

After work is completed or materials are delivered, contractors submit invoices through the DEVOS Contractor Portal. The portal enforces evidence requirements — invoices cannot be submitted without supporting documentation.

**Contractor Portal — Invoice Submission Requirements**

| Evidence Type | Requirement |
| :---- | :---- |
| Before Photos | Minimum 2 photos of work area before commencement |
| After / Completion Photos | Minimum 3 photos showing completed work |
| Delivery Receipt | Signed delivery note for all materials invoices |
| Work Completion Certificate | Site manager signature confirming work acceptance |
| Measurement Certificate | For labour invoices: measured quantities certified by site manager |

*⚠ The system physically prevents invoice submission without uploading all required evidence. This is enforced at the UI level — the submit button is disabled until all mandatory uploads are complete.*

**GUARDIAN Automated Checks on Invoice**

36. RATE CHECK: Compare invoice rate against signed contract rate. Flag any invoice rate exceeding contract rate by \>2%.

37. PROGRESS RECONCILIATION: Cross-reference invoice claimed completion against most recent site manager progress report. Flag discrepancies exceeding 10%.

38. QUANTITY RECONCILIATION: Cross-reference materials quantities claimed against delivery receipts and previous deliveries for same item.

39. BOQ CUMULATIVE CHECK: Check if total invoiced for this work category cumulatively exceeds BOQ allowance.

40. PHOTO ANALYSIS: AI review of before/after photos to confirm visible evidence of work claimed (basic computer vision check — flags if photos appear mismatched to claimed work type).

41. DUPLICATE INVOICE CHECK: Check for identical invoice amounts from same contractor within 30 days.

**Flag Severity Levels**

| Level | Condition / Action |
| :---- | :---- |
| 🟢 CLEAR | All checks pass → Advance to developer approval queue |
| 🟡 INFO | Minor variance (\<5%) or soft warning → Shown in developer dashboard, not blocking |
| 🟠 WARNING | Moderate issue (5–20% variance) → Requires developer acknowledgement before approval |
| 🔴 CRITICAL | Serious issue (\>20% variance, progress mismatch, contract breach) → Blocks payment, detailed alert sent |

## **6.5 Approval Workflow**

Every payment — whether from a purchase request or an invoice — follows a locked approval workflow. No payment can be processed without a completed workflow ticket.

| PAYMENT APPROVAL WORKFLOW |
| :---- |
| Step 1: SUBMISSION   → Contractor/Supplier submits invoice via Contractor Portal   → Site Manager submits Purchase Request via mobile interface Step 2: GUARDIAN AI ANALYSIS (Automatic — within 5 minutes)   → All checks run as described in 6.3 and 6.4   → Analysis report generated with flag summary Step 3: SITE MANAGER VERIFICATION (for invoices)   → Site manager receives notification to confirm physical work matches invoice claim   → Site manager approves, disputes, or escalates Step 4: DEVELOPER APPROVAL   → Developer receives notification with full GUARDIAN analysis   → Options: Approve Full / Approve Adjusted Amount / Query (request more info) / Reject   → Action taken via DEVOS mobile dashboard (one-tap for standard approvals) Step 5: PAYMENT TICKET GENERATED   → On developer approval, DEVOS generates a Payment Ticket with approval reference   → Finance team receives notification to process payment   → Finance uploads payment confirmation / transfer receipt Step 6: BUDGET UPDATED   → Budget dashboard updated in real time upon payment confirmation   → Contractor notified of payment via Contractor Portal |

*⚠ Finance CANNOT process any construction payment without a valid DEVOS Payment Ticket. The developer must enforce this as an operational rule with their finance team and bank.*

## **6.6 Budget Dashboard**

The GUARDIAN dashboard gives the developer a real-time financial view of the entire project at a glance.

**Dashboard Components**

| Component | Description |
| :---- | :---- |
| Project Financial Health Indicator | Green / Amber / Red status based on spend-vs-progress ratio |
| Total Budget vs Spent vs Committed | Three-figure summary with % breakdown |
| Phase Budget Cards | Per-phase: budget, spent, % consumed, physical progress %, health status |
| Active Flags | List of all unresolved GUARDIAN flags with severity and recommended action |
| Approval Queue | Pending purchase requests and invoices awaiting developer action |
| Guardian Savings Tracker | Running total of savings captured: price negotiations \+ overcharge rejections \+ quantity corrections |
| Payments Made This Month | List of all outbound payments with contractor, amount, date, approval reference |
| Budget Trend Chart | Line chart showing actual spend vs planned spend curve over time |

## **6.7 Predictive Overrun Engine**

GUARDIAN does not only track historical spend — it forecasts future risk. The predictive engine analyses current burn rate, materials price trends, and physical progress to project potential overruns 6–8 weeks before they become critical.

**Prediction Triggers**

* Phase spending pace is \>10% ahead of physical completion pace

* A tracked materials category shows \>8% national price increase over 30 days

* A phase is behind schedule (increasing likelihood of penalty costs or acceleration costs)

* Committed \+ spent exceeds 80% of phase budget while physical completion is \<70%

**Prediction Alert Content**

| Element | Description |
| :---- | :---- |
| Affected Category | Which phase/category is at risk |
| Current vs Budgeted Rate | Actual cost rate vs planned rate |
| Projected Shortfall | Estimated budget gap at current trajectory |
| Confidence Level | High / Medium / Low based on data completeness |
| Recommended Actions | Minimum 2 concrete options (e.g., lock in price now, revise budget from contingency, source alternative supplier) |
| Deadline to Act | Date by which action is recommended to avoid the overrun |

## **6.8 JV Partner Reporting**

Every Monday at 7:00 AM, GUARDIAN auto-generates and distributes a Project Financial Report to the developer, JV partners (NPC Development Ltd), and the project accountant. The report requires zero manual preparation.

**Weekly JV Report Contents**

* Executive summary: overall project health, week headline

* Budget burn by phase: allocated, spent, remaining, % consumed

* Physical progress by phase: % complete vs % budget spent (the critical ratio)

* All payments made during the week: contractor, description, amount, approval reference, evidence links

* GUARDIAN flags raised and how they were resolved

* Guardian savings captured this week (with breakdown)

* Cost-to-complete forecast (updated projection)

* Materials price index movements relevant to upcoming phases

* Any active predictive overrun alerts with recommended actions

# **8\. Command Dashboard**

The Command Dashboard is the developer's single daily interface with DEVOS. It is designed to deliver the complete state of the development in a 10–15 minute morning review. It requires no navigation — everything critical is visible on the primary screen.

## **7.1 Dashboard Layout**

| COMMAND DASHBOARD — COMPONENT MAP |
| :---- |
| ROW 1 — PROJECT HEALTH STRIP   Overall status indicator | Day count since launch | Completion % | Next milestone ROW 2 — KEY METRICS (4 cards)   \[Units Available / Reserved / Sold\]   \[Sales Revenue: Received / Expected / Overdue\]   \[Budget: Spent / Remaining / Health\]   \[Construction: Current Phase / % Complete / On Schedule?\] ROW 3 — DECISIONS NEEDED   Approval Queue: pending invoices and purchase requests needing your action   Hot Leads: leads with score ≥70 flagged for personal outreach   GUARDIAN Flags: unresolved critical issues ROW 4 — PERFORMANCE PANELS (side by side)   LEFT: PRESELL funnel — leads by stage, conversion rates, top source ad   RIGHT: GUARDIAN budget trend — actual vs planned spend curve ROW 5 — RECENT ACTIVITY FEED   Real-time log of all significant DEVOS events (payments received, invoices flagged,   leads converted, ads paused, documents generated, etc.) |

## **7.2 Morning Brief (WhatsApp)**

Every day at 7:00 AM, the DEVOS Master Agent composes and sends a personalised morning brief to the developer via WhatsApp. This is a structured summary of overnight activity and decisions needed.

| MORNING BRIEF FORMAT |
| :---- |
| Good morning \[Name\]. Primerose overnight summary: SALES   • X new leads (Y hot — action needed)   • Z payments received: ₦X,XXX,XXX   • Units: XX reserved, XX sold (XX remaining) CONSTRUCTION   • Phase X: XX% complete (on/behind/ahead of schedule)   • Site manager update submitted: \[Yes/No\] BUDGET   • X invoices in approval queue (₦X total)   • X flags raised: \[brief description\]   • Guardian savings this week: ₦X,XXX ADS   • Campaign spend: ₦X,XXX yesterday   • X new leads from ads   • \[Any autonomous actions taken by AdEngine\] DECISIONS NEEDED: X  |  Everything else: handled. |

# **9\. MCP Tools & External Integrations**

All external service connections are implemented as MCP (Model Context Protocol) servers. This gives the OpenClaw Agent direct, structured, permission-controlled access to every service it needs — without brittle webhook chains or manual API wiring. Each MCP server defines exactly what the agent can and cannot do with that service.

## **8.1 MCP Server Registry**

| MCP Server | Wraps | Agent Can | Agent Cannot | Build Type |
| :---- | :---- | :---- | :---- | :---- |
| supabase-mcp | Supabase REST \+ Realtime API | Read all tables; write to permitted tables; trigger realtime updates | Write to payments\_out or approvals without Payment Ticket | Official Supabase MCP (existing) |
| whatsapp-mcp | Meta WhatsApp Business Cloud API | Send text, media, PDFs, templates; read incoming messages | Delete messages; modify business profile | Custom MCP server (build) |
| meta-ads-mcp | Meta Marketing API (Facebook/Instagram) | Read performance data; pause/resume ad sets; adjust daily budget within approved total | Increase total campaign budget; create new campaigns without approval | Custom MCP server (build) |
| tiktok-ads-mcp | TikTok Business API | Read performance metrics; pause/resume ad groups; adjust bids | Increase total budget; create new campaigns without approval | Custom MCP server (build) |
| email-mcp | Resend API | Send transactional emails to registered contacts (JV reports, docs, notifications) | Send to unregistered addresses; modify email templates | Custom MCP server (build) |
| pdf-mcp | Supabase Edge Function \+ React-PDF | Generate documents from approved templates; store to Supabase Storage | Create new document templates; modify legal template content | Edge Function (build) |
| veo3-mcp | Google Veo 3 / AI Studio API | Generate ad video creatives from prompts and project renders | Publish generated videos directly — requires human approval first | Custom MCP server (build) |

## **8.2 MCP Server Build Specifications**

### **whatsapp-mcp**

| Attribute | Detail |
| :---- | :---- |
| Base API | Meta WhatsApp Business Cloud API v18+ |
| Auth | Meta System User Token stored in Supabase Vault (never in codebase) |
| Inbound | Webhook endpoint (Supabase Edge Function) receives all incoming messages → stores to whatsapp\_threads → calls OpenClaw Agent |
| Outbound Tools | send\_text(to, message), send\_media(to, url, caption), send\_document(to, url, filename), send\_template(to, template\_name, params) |
| Rate Limiting | Built into MCP server — respects Meta tier limits, queues excess messages |
| Delivery Tracking | Webhook updates message status (sent/delivered/read) in whatsapp\_threads table |
| Error Handling | Failed sends trigger email fallback via email-mcp; logged to mcp\_tool\_calls |

### **meta-ads-mcp**

| Attribute | Detail |
| :---- | :---- |
| Base API | Meta Marketing API v19+ |
| Auth | Meta System User Token with Ads Management permission |
| Read Tools | get\_campaign\_performance(campaign\_id, date\_range), get\_ad\_set\_metrics(ad\_set\_id), get\_creative\_stats(creative\_id), get\_audience\_insights(audience\_id) |
| Write Tools | pause\_ad\_set(ad\_set\_id), resume\_ad\_set(ad\_set\_id), update\_daily\_budget(ad\_set\_id, amount) — capped at \+40% of original |
| Restricted | create\_campaign(), delete\_campaign(), update\_total\_budget() — these require developer action in Meta Ads Manager directly |
| Sync Schedule | Edge Function pulls performance data every 6 hours and stores to ad\_performance table |

### **veo3-mcp**

| Attribute | Detail |
| :---- | :---- |
| Base API | Google AI Studio / Veo 3 API |
| Input | Text prompt \+ reference image URLs from Supabase Storage (project renders) |
| Output | Generated video file → stored to Supabase Storage → status set to PENDING\_APPROVAL |
| Approval Gate | Generated videos are NEVER published automatically. They are stored and a WhatsApp message is sent to developer with preview link and one-tap approve button. Only on explicit approval does meta-ads-mcp publish the creative. |
| Audit | Every generation logged: prompt used, model version, output URL, approval decision |

## **8.3 Edge Functions Register**

Supabase Edge Functions handle all deterministic event routing — events that require action but not AI reasoning. They are the connective tissue between database events and the OpenClaw Agent.

| Edge Function | Trigger & Action |
| :---- | :---- |
| on-lead-created | DB trigger: new row in leads → parse UTM source → calculate initial score → call OpenClaw PRESELL Agent |
| on-whatsapp-inbound | Webhook: incoming WhatsApp message → store to whatsapp\_threads → call OpenClaw PRESELL Agent with full conversation |
| on-invoice-submitted | DB trigger: new row in invoices → validate evidence fields → retrieve contract+BOQ → call OpenClaw GUARDIAN Agent |
| on-progress-update | DB trigger: new row in progress\_updates → update unit construction display → check for invoice discrepancies |
| on-payment-confirmed | DB trigger: payment\_in confirmed → update buyer payment bar → check 10% threshold → trigger agreement generation if met |
| on-approval-granted | DB trigger: approvals row updated to APPROVED → generate Payment Ticket → notify finance via email-mcp |
| payment-reminder-7d | Scheduled: daily 8am → query payments due in 7 days → send WhatsApp template (no AI needed) |
| payment-reminder-3d | Scheduled: daily 8am → query payments due in 3 days → send WhatsApp template |
| payment-overdue | Scheduled: daily 9am → query overdue payments → escalate per overdue schedule (3d/7d/14d/30d logic) |
| morning-brief | Scheduled: daily 7am → compile overnight data snapshot → call OpenClaw MASTER Agent to compose and send brief |
| weekly-jv-report | Scheduled: Monday 7am → compile full financial data → call OpenClaw GUARDIAN Agent to write and send report |
| ad-performance-sync | Scheduled: every 6 hours → pull Meta \+ TikTok metrics → store to ad\_performance → call AdEngine Agent if anomalies detected |
| price-index-update | Scheduled: 1st of each month → scrape materials price sources → update price\_index table → run overrun predictions |

# **10\. Development Phases**

DEVOS is built in 5 phases. Phases 1–3 deliver a fully operational product for Primerose. Phase 4 polishes the product for external sale. Phase 5 packages and launches DEVOS as a SaaS offering.

| Phase | Name / Timeline / Goal |
| :---- | :---- |
| Phase 1 (Weeks 1–3) | Foundation — Core PRESELL pipeline live, first leads captured |
| Phase 2 (Weeks 4–6) | GUARDIAN Core — Invoice and purchase request workflows live |
| Phase 3 (Weeks 7–10) | Intelligence Layer — AI agents, AdEngine optimisation, predictive analytics |
| Phase 4 (Weeks 11–14) | Polish & Completeness — Full product readiness for Primerose launch |
| Phase 5 (Months 4–6) | SaaS Packaging — Multi-tenant, onboarding, pricing, first external clients |

## **Phase 1 — Foundation (Weeks 1–3)**

### **Goal: First lead captured and managed within DEVOS by end of Week 3\.**

**Sprint 1 (Week 1): Multi-Tenant Foundation \+ Landing Page**

*⚠ This sprint is the most important sprint in the entire project. Getting the multi-tenant schema right here saves months of painful rebuilding later. Do not skip or defer any of the items below.*

* Set up Supabase project

* Build PLATFORM LAYER schema first: organisations, subscriptions, org\_credentials (Supabase Vault), org\_members, agent\_context — these are the root of everything

* Build ALL remaining tables with organisation\_id as a non-nullable foreign key on every single table (see Section 4.6 schema)

* Write RLS policies for every table: auth.uid() must resolve to a user whose org\_id matches the row's organisation\_id

* Configure Supabase Auth with all roles: super\_admin, org\_admin, sales\_agent, finance, site\_manager, buyer, contractor

* Build get\_user\_org\_id(user\_id) helper function used in all RLS policies

* Configure Vercel wildcard subdomain routing: \[slug\].devos.app → subdomain-aware React app

* Build React subdomain routing: app reads subdomain → fetches org by slug → loads org-scoped context

* Build landing page (React): hero, unit type cards, payment calculator, lead capture form (org-scoped by subdomain)

* Connect lead capture form: insert into leads table with organisation\_id \+ UTM tag parsing

* WhatsApp Business API setup: Meta Business account, phone number, webhook config

* Build whatsapp-mcp: credential injection from Supabase Vault per org, send\_text, send\_media, send\_document, send\_template tools

* Build on-lead-created Edge Function: parse UTM → score lead → call DEVOS PRESELL Agent with org context

* Build on-whatsapp-inbound Edge Function: identify org by phone number → log to whatsapp\_threads → call DEVOS PRESELL Agent

* Write DEVOS PRESELL Agent system prompt: qualification flow states, scoring logic, diaspora variant, escalation rules

* Configure DEVOS Agent Engine: Claude API connection, org-scoped context isolation, agent\_logs writing

* Build Primerose organisation record: slug=primerose, plan=growth, credentials configured

* Deploy landing page to Vercel at primerose.devos.app

**Sprint 2 (Week 2): WhatsApp Qualification \+ Lead Management**

* Write OpenClaw PRESELL Agent system prompt: all qualification flow states, scoring logic, diaspora variant, escalation rules

* Test full multi-turn WhatsApp qualification conversation end-to-end through OpenClaw \+ whatsapp-mcp

* Build lead scoring update logic in supabase-mcp: agent writes score updates after each conversation turn

* Build sales agent dashboard: lead list, score display, lead profile view, status management

* Build hot lead notification: OpenClaw detects HOT → calls whatsapp-mcp to alert sales agent/developer

* Build brochure and walkthrough media library in Supabase Storage (renders, videos, PDFs for agent to reference)

* Build agent\_logs viewer in developer dashboard: see every OpenClaw decision and reasoning

**Sprint 3 (Week 3): Reservation \+ Buyer Portal (MVP)**

* Build reservation workflow: unit selection, payment instruction generation, receipt upload

* Build unit inventory tracker with real-time status updates (Available / Reserved / Sold) via Supabase Realtime

* Build Buyer Portal (MVP): payment progress bar, construction status, documents tab

* Build on-payment-confirmed Edge Function: receipt uploaded → alert finance → on confirmation update portal

* Build pdf-mcp Edge Function: Reservation Letter PDF auto-generated from template on reservation confirmation

* Build payment tracking: receipt upload, finance confirmation workflow, portal real-time update

* Build Command Dashboard MVP: units card, revenue card, leads pipeline summary

* Build payment-reminder-7d and payment-reminder-3d Edge Functions (scheduled, no AI needed)

* Write OpenClaw MASTER Agent system prompt for morning brief composition

* Build morning-brief Edge Function: 7am trigger → data snapshot → calls MASTER Agent → sends via whatsapp-mcp

**Phase 1 Acceptance Criteria**

| Criteria | Verification |
| :---- | :---- |
| Lead form submission creates Supabase record \+ sends WhatsApp in \<60s | End-to-end test |
| Qualification bot conducts multi-turn WhatsApp conversation correctly | Test all flow states |
| Lead scoring assigns correct score based on profile signals | Unit test scoring algorithm |
| Hot lead notification reaches developer/sales agent immediately | Live test |
| Unit can be reserved: deposit instructions sent, receipt logged, portal created | Full reservation flow test |
| Buyer Portal shows correct unit, payment status, and Reservation Letter | Buyer UAT |
| Command Dashboard shows live unit count and revenue figure | Dashboard verification |

## **Phase 2 — GUARDIAN Core (Weeks 4–6)**

### **Goal: Every purchase request and invoice passes through GUARDIAN before developer approval.**

**Sprint 4 (Week 4): Budget Setup \+ Purchase Request Flow**

* Build budget setup interface: project phases, categories, allocated amounts, contingency

* Build BOQ and contract upload and parsing (extract key rates and quantities into structured DB tables)

* Build materials price index: initial dataset \+ price-index-update Edge Function (monthly scheduled scraper)

* Build site manager mobile interface: purchase request submission form (all fields as per 6.3)

* Build on-purchase-request Edge Function: retrieves market index \+ BOQ \+ budget position → calls OpenClaw GUARDIAN Agent

* Write OpenClaw GUARDIAN Agent system prompt: purchase request analysis, invoice analysis, flag severity rules

* Build developer approval interface: view GUARDIAN analysis, approve/adjust/reject with one tap (React → Supabase)

* Build on-approval-granted Edge Function: Payment Ticket generation \+ finance notification via email-mcp

**Sprint 5 (Week 5): Contractor Portal \+ Invoice Verification**

* Build Contractor Portal: login, invoice submission form, evidence upload enforcement (submit blocked until all fields complete)

* Build on-invoice-submitted Edge Function: validates evidence → retrieves contract+BOQ+progress → calls OpenClaw GUARDIAN Agent

* GUARDIAN Agent invoice analysis: all 6 checks as defined in 8.4 (rate, progress, quantity, BOQ cumulative, photo review, duplicate)

* Build site manager verification step: notification \+ approve/dispute interface (React)

* Build invoice flag system in DB: severity levels, flag detail view, resolution tracking

* Build full payment approval workflow chain as defined in 8.5

* Build payment\_tickets table and Payment Ticket PDF generation via pdf-mcp

* Build finance notification: on-approval-granted Edge Function → email-mcp → finance team

**Sprint 6 (Week 6): Budget Dashboard \+ JV Reports**

* Build GUARDIAN dashboard: all components as defined in 8.6

* Build budget trend chart: actual vs planned spend over time (Recharts)

* Build Guardian Savings Tracker: running total with breakdown by savings type

* Build cost-to-complete projection: GUARDIAN Agent analyses burn rate \+ price trends → writes forecast to DB

* Build weekly-jv-report Edge Function: Monday 7am → compile financial snapshot → call GUARDIAN Agent → generate PDF via pdf-mcp → send via email-mcp

* Integrate GUARDIAN summary into Command Dashboard (Supabase Realtime for live updates)

* Build contractor performance scoring: reliability rating calculated from invoice history and dispute rate

* Build mcp\_tool\_calls log viewer for developer: see every MCP call made by OpenClaw with inputs and outputs

**Phase 2 Acceptance Criteria**

| Criteria | Verification |
| :---- | :---- |
| Purchase request submitted → GUARDIAN analysis generated within 5 minutes | Timed test |
| Price flag raised correctly when submitted price exceeds market range by \>5% | Test with above-market price |
| Invoice rejected at submission level if evidence uploads incomplete | Try to submit without photos |
| Rate discrepancy against contract correctly identified and flagged | Test with above-contract rate |
| Developer approves invoice → Payment Ticket generated → Finance notified | Full workflow test |
| Weekly JV report auto-generated and delivered correctly on Monday 7am | Scheduled trigger test |
| Guardian Savings accurately accumulated across multiple flagged events | Cumulative test |

## **Phase 3 — Intelligence Layer (Weeks 7–10)**

### **Goal: Full AdEngine live, AI agents operating autonomously, predictive analytics active.**

**Sprint 7 (Week 7): AdEngine — Campaign Management \+ Creative Factory**

* Build campaign setup interface: all fields as defined in 7.1.1

* Build audience template library and custom audience configuration

* Build Magic Link tracking system: UTM generation, URL routing, lead source tagging on form submit

* Build meta-ads-mcp custom MCP server: read performance, pause/resume ad sets, update daily budget tools

* Build tiktok-ads-mcp custom MCP server: same as above for TikTok

* Build veo3-mcp custom MCP server: generate video from prompt \+ renders → store to Supabase → flag for approval

* Write OpenClaw ADENGINE Agent system prompt: campaign analysis, optimisation logic, copy generation, fatigue detection

* Build Creative Factory: ADENGINE Agent generates 3 copy variants per ad; veo3-mcp generates video on approval

* Build creative approval workflow: generated creatives in dashboard \+ WhatsApp preview → developer tap-approve → meta-ads-mcp publishes

**Sprint 8 (Week 8): AdEngine — Monitoring \+ Optimisation**

* Build ad-performance-sync Edge Function: every 6 hours → pull Meta \+ TikTok metrics via MCP → store to ad\_performance

* Build AdEngine performance dashboard: all metrics as defined in 7.1.4 (Recharts)

* Build ADENGINE Agent 48-hour optimisation cycle: Edge Function triggers Agent → Agent analyses → calls meta/tiktok MCP to act

* Build ad fatigue detection: CTR decline algorithm in ADENGINE Agent → triggers veo3-mcp creative refresh

* Build retargeting audience automation: landing page visitor tracking → ADENGINE Agent adds to Meta retargeting segment via meta-ads-mcp

* Build Lookalike audience builder: confirmed buyer profiles → ADENGINE Agent submits to Meta via meta-ads-mcp

* Integrate AdEngine lead attribution: every lead tagged to source creative; attribution chain stored in lead\_attribution table

**Sprint 9 (Week 9): Predictive Analytics \+ Master Agent**

* Build predictive overrun engine: price-index-update triggers GUARDIAN Agent to analyse all phases for overrun risk

* Build materials price trend monitoring: monthly scraper updates price\_index → GUARDIAN Agent runs predictions automatically

* Build cost-to-complete forecast: GUARDIAN Agent weighted model using burn rate \+ price trends → stored and displayed on dashboard

* Refine OpenClaw MASTER Agent: cross-module synthesis, cross-module intelligence (budget risk → PRESELL intensity)

* Build agent\_logs full dashboard: developer can see every Agent decision, tool call, reasoning, and outcome across all agents

* Build mcp\_tool\_calls audit table viewer: complete MCP call history with inputs, outputs, and latency

**Sprint 10 (Week 10): Revenue Attribution \+ Reporting**

* Build revenue attribution report: monthly Edge Function trigger → ADENGINE Agent composes report → pdf-mcp generates → email-mcp delivers

* Build lead-to-revenue traceability view: full chain ad\_creative → lead → reservation → payments (interactive in dashboard)

* Build PRESELL analytics dashboard: funnel visualisation, conversion rates by stage and source

* Build Command Dashboard final version: all rows and components as defined in Section 9

* End-to-end integration testing: simulate 3 complete buyer journeys \+ 2 invoice journeys \+ 1 full campaign cycle

* Performance optimisation: dashboard load time \<2s, WhatsApp response time \<60s, Edge Function cold start \<500ms

## **Phase 4 — Polish & Completeness (Weeks 11–14)**

### **Goal: DEVOS is fully production-ready for Primerose commercial launch.**

**Features & Work**

* Sale & Purchase Agreement auto-generation (triggered at 10% payment threshold)

* E-signature integration (DocuSign or similar) for digital agreement signing

* Notice of Default auto-generation with developer approval before sending

* Contractor performance scoring dashboard (reliability rating system)

* Buyer upgrade module: smart home package, interior fit-out options (upsell revenue)

* Diaspora-specific WhatsApp flow refinement based on real interaction data from Phase 1–3

* Multi-language WhatsApp support (English primary, Pidgin variant for local buyers)

* Unit floor plan interactive SVG viewer in Buyer Portal and landing page

* Construction photo gallery: weekly auto-updated gallery per phase in Buyer Portal

* DEVOS mobile PWA: optimised for developer and site manager on mobile

* Comprehensive error handling, edge case coverage, and logging

* Security audit: penetration testing, RLS verification, API key management review

* UAT with 5 simulated buyer journeys and 3 simulated contractor invoice journeys

* Load testing: simulate 200 concurrent buyer portal sessions

## **Phase 5 — SaaS Packaging (Months 4–6)**

### **Goal: DEVOS ready for commercial licensing to external developers.**

**Multi-Tenancy**

* Refactor database for full multi-tenant architecture: all data scoped to project/organisation

* Build organisation onboarding flow: create account, create project, configure budget, import units

* Build white-label configuration: custom logo, colour scheme, project domain per client

* Build instance isolation: ensure complete data separation between client organisations

**Subscription & Billing**

| Tier | Included |
| :---- | :---- |
| Starter — ₦150,000/month | 1 active project, up to 50 units, PRESELL module only, email support |
| Growth — ₦400,000/month | 1 active project, up to 200 units, PRESELL \+ GUARDIAN \+ AdEngine, priority support |
| Enterprise — ₦800,000+/month | Multiple projects, 200+ units, all modules, white label, dedicated onboarding, SLA |

* Build subscription management: plan selection, billing cycle, payment via Paystack/Flutterwave

* Build usage metering: unit count, lead volume, ad spend managed (for tier enforcement)

* Build client admin dashboard: account settings, team members, billing history

**Developer Onboarding**

* Build guided onboarding wizard: project setup → budget configuration → unit import → first campaign launch (target: \<2 hours to first lead)

* Build template library: standard BOQ templates, contract rate templates, document templates

* Build in-app help system and documentation

* Build onboarding support workflow: first 30 days check-ins via WhatsApp

**SaaS Launch Assets**

* DEVOS marketing website (separate from product)

* Case study: Primerose — "X units pre-sold before construction completed, ₦Xm in savings captured"

* Pricing page, demo booking flow, and video explainer

* Outreach to 10 target developers in Port Harcourt, Lagos, and Abuja

# **11\. Security & Compliance**

## **10.1 Authentication & Authorisation**

* All users authenticated via Supabase Auth (email/password \+ optional magic link)

* Role-based access control: developer, sales\_agent, finance, site\_manager, buyer, contractor — each with strictly scoped permissions

* Row-Level Security (RLS) enforced at database level: buyers cannot access other buyers' data; contractors cannot access financial dashboards; site managers cannot access buyer portal data

* JWT tokens with appropriate expiry; refresh token rotation

* Developer account protected with mandatory 2FA

## **10.2 Data Protection**

* All data encrypted at rest (Supabase default AES-256)

* All data in transit over HTTPS/TLS 1.3

* Buyer personal data (name, phone, email) stored in encrypted columns

* Payment receipt images stored in private Supabase Storage bucket (not publicly accessible)

* WhatsApp conversation content stored in DEVOS database (not only on Meta servers)

* No buyer financial data (bank account numbers) stored in DEVOS — payment instructions use developer's bank details only

## **10.3 Financial Controls**

* No automated payment initiation: DEVOS generates approval tickets and notifies finance, but never directly initiates bank transfers

* Every payment requires a human-generated Payment Ticket with a unique reference before processing

* Complete audit trail: every approval decision logged with actor, timestamp, and reasoning

* Separation of duties: purchase request submitter cannot be the approver

## **10.4 AI Safety Rules**

* AI agent (PRESELL) cannot commit the developer to any legal obligation — it can only send information and capture intent

* AI agent cannot confirm reservations — only the developer or finance team can confirm after bank verification

* AI agent cannot change prices, payment terms, or unit availability without explicit developer configuration

* All AI agent decisions logged in agent\_logs table for audit and review

* AI agent conversations reviewed weekly by sales agent for quality and compliance

# **12\. Non-Functional Requirements**

| Requirement | Specification |
| :---- | :---- |
| WhatsApp Response Time | \<60 seconds from lead form submission to first WhatsApp message |
| Dashboard Load Time | \<2 seconds for Command Dashboard initial load |
| Buyer Portal Load Time | \<3 seconds on mobile (3G connection baseline) |
| GUARDIAN Analysis Time | \<5 minutes from purchase request/invoice submission to analysis output |
| System Uptime | 99.5% minimum (Supabase SLA \+ Vercel SLA) |
| Concurrent Users | Support 200 concurrent buyer portal sessions without performance degradation |
| Data Backup | Supabase automated daily backups; 30-day retention |
| Mobile Responsiveness | All interfaces fully functional on mobile browsers (iOS Safari \+ Android Chrome) |
| Browser Support | Chrome 100+, Safari 15+, Firefox 100+, Edge 100+ |
| File Upload Size | Maximum 10MB per photo upload; maximum 25MB per document upload |
| WhatsApp Message Delivery | \>98% delivery rate; failed messages trigger email fallback |
| API Rate Limits | n8n workflows implement retry logic and rate limit handling for all external APIs |

# **13\. Success Metrics & KPIs**

## **12.1 Primerose Product Metrics (First 90 Days)**

| Metric | Target | Measurement Method | Review Frequency |
| :---- | :---- | :---- | :---- |
| Units Pre-Sold (Reservations) | 40 units in 60 days | DEVOS reservation count | Weekly |
| Cost Per Reservation | \<₦200,000 | AdEngine attribution report | Monthly |
| Lead Response Time | \<60 seconds | n8n timestamp logs | Weekly |
| Lead-to-Reservation Rate | \>8% | PRESELL funnel metrics | Weekly |
| Buyer Portal Adoption | \>90% of buyers logged in | Supabase auth logs | Monthly |
| Payment Default Rate | \<5% at any given time | Payment status dashboard | Weekly |
| GUARDIAN Savings Captured | ₦10M+ in 90 days | Savings tracker | Monthly |
| Invoice Fraud/Overcharge Caught | Every instance | Flag resolution log | Weekly |
| Developer Daily Time in DEVOS | \<20 minutes | Session analytics | Monthly |
| JV Report Satisfaction | Zero missed reports | Delivery confirmation | Weekly |

## **12.2 SaaS Business Metrics (Months 4–12)**

| Metric | Target |
| :---- | :---- |
| First External Client | Month 4 |
| Paying Clients by Month 6 | 3 clients minimum |
| Monthly Recurring Revenue by Month 6 | ₦1,200,000/month |
| Monthly Recurring Revenue by Month 12 | ₦4,000,000/month |
| Client Churn Rate | \<5% monthly |
| Net Promoter Score | \>50 |
| Average Onboarding Time | \<2 hours to first lead |

# **14\. Open Questions & Decisions Required**

| \# | Question | Status |
| :---- | :---- | :---- |
| 1 | Which e-signature provider for Sale Agreements — DocuSign, Zoho Sign, or custom implementation? | Decision needed before Phase 4 |
| 2 | WhatsApp Business phone number: dedicated Primerose number or shared LawOne Cloud number? | Decision needed before Phase 1 Sprint 1 |
| 3 | Payment confirmation method: manual finance team confirmation only, or semi-automated bank webhook (if bank supports it)? | Decision needed before Phase 1 Sprint 3 |
| 4 | Materials price index: build proprietary scraper or license third-party Nigerian construction price data? | Decision needed before Phase 2 Sprint 4 |
| 5 | JV report distribution: email only, or NPC Development Ltd gets read-only DEVOS dashboard access? | Consult with JV partner before Phase 2 |
| 6 | Buyer portal domain: primerose.ng or devos.primerose.ng or another structure? | Decision needed before Phase 1 deploy |
| 7 | SaaS billing currency: ₦ only, or dual ₦/$? | Decision needed before Phase 5 |
| 8 | Data residency: is Supabase US-hosted acceptable, or required to use African-region hosting? | Legal/compliance review recommended |

# **15\. Appendix**

## **A. Glossary**

| Term | Definition |
| :---- | :---- |
| DEVOS | Real Estate Development Operating System — the product name |
| DEVOS Agent Engine | The purpose-built, multi-tenant Claude-powered AI agent system that is the intelligence layer of the DEVOS product. Not OpenClaw. |
| OpenClaw | LawOne Cloud's personal Chief of Staff AI agent. Private tool. Not part of the DEVOS product. Reads DEVOS data via read-only connection for Law's personal briefing only. |
| PRESELL | DEVOS module covering all sales activity from ad to signed agreement |
| GUARDIAN | DEVOS module covering all budget and financial protection functions |
| AdEngine | Acquisition sub-system within PRESELL managing paid advertising |
| Conversion Engine | Qualification-through-agreement sub-system within PRESELL |
| Organisation | A DEVOS client account. The root entity in the multi-tenant data model. Every piece of data belongs to an organisation. |
| organisation\_id | The foreign key present on every database table that enforces multi-tenant data isolation |
| Multi-tenancy | Architecture where one platform instance serves many client organisations with complete data isolation between them |
| RLS (Row-Level Security) | Supabase database-level security that automatically filters all queries to the authenticated user's organisation — enforced at DB level, not application level |
| Supabase Vault | Encrypted credential storage within Supabase used to store each client's API keys (WhatsApp, Meta, TikTok) securely |
| Magic Link | Unique UTM-tagged tracking URL connecting an ad to its resulting lead and revenue |
| Lead Score | AI-calculated score (0–100) indicating a lead's likelihood to convert |
| Payment Ticket | System-generated approval reference required before any construction payment is processed |
| GUARDIAN Flag | An anomaly or risk identified by the GUARDIAN engine requiring attention |
| Morning Brief | Daily WhatsApp summary sent to developer at 7am by the DEVOS Master Agent |
| JV Partner | NPC Development Ltd — 40% joint venture partner on Primerose Smart City Cluster |
| BOQ | Bill of Quantities — the itemised list of materials and labour for the construction project |
| Ad Fatigue | Decline in ad CTR due to the same audience seeing the same creative repeatedly |
| Slug | The unique subdomain identifier for each client organisation (e.g., "primerose" in primerose.devos.app) |

## **B. Recommended Build Team**

| Role | Responsibility |
| :---- | :---- |
| Lead Full-Stack Developer | React frontend, Supabase schema \+ RLS, Edge Functions, primary architecture decisions |
| AI / Agent Developer | OpenClaw agent configuration, all system prompts, MCP server builds, agent testing and tuning |
| Backend Developer | All custom MCP servers (WhatsApp, Meta Ads, TikTok, Veo3, Email), Supabase Edge Functions |
| UI/UX Designer (Part-time) | Command Dashboard, Buyer Portal, Contractor Portal, landing page — Figma mockups before build |
| QA Engineer (Phase 3+) | End-to-end testing, UAT coordination, load testing, agent behaviour regression testing |

## **C. Recommended Development Tools**

* Version Control: GitHub (private repository)

* Project Management: Linear or Notion for sprint tracking

* Design: Figma for UI mockups before build

* API Testing: Postman for all external API integrations and MCP server endpoints

* Agent Testing: Claude.ai \+ OpenClaw test environment for system prompt refinement

* MCP Development: MCP Inspector (official Anthropic tool) for testing MCP servers locally

* Monitoring: Sentry for error tracking; Supabase Dashboard for DB monitoring; agent\_logs table for AI behaviour

* Communication: Slack channel for dev team with DEVOS project context and OpenClaw memory

## **D. Document Control**

| Version | Description |
| :---- | :---- |
| 1.0 — March 2026 | Initial comprehensive PRD covering all modules and phases |
| 1.1 — March 2026 | Architecture updated: n8n replaced with Supabase Edge Functions \+ DEVOS Agent Engine \+ MCP tool layer |
| 1.2 — March 2026 | Critical update: Multi-tenant SaaS architecture baked in from Sprint 1\. DEVOS Agent Engine defined as separate product component from OpenClaw. New Section 5: SaaS Infrastructure Design. Subdomain routing, per-org credentials, Super Admin panel, subscription tiers, and onboarding flow added. |
| Future 2.0 | Post-Primerose launch: Updated based on real client learnings. SaaS go-to-market iteration. |

