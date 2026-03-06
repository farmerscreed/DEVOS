# DEVOS — Full System Test Plan
**Phase 1 → Sprint 4 | Telegram Edition**

Run every block in order on first test. On subsequent runs you can jump to specific blocks.
Each block has a **PASS** condition — do not proceed to the next block until it passes.

---

## Before You Start

### Things you need open
- [ ] App running: `cd devos-frontend && npm run dev` → `http://localhost:5173`
- [ ] Agent worker running: `cd agent-worker && node index.js` (or confirm Railway shows `Running`)
- [ ] Supabase SQL editor: `https://supabase.com/dashboard/project/gvcadlzjpsfabrqkzdwt/sql`
- [ ] Telegram open on your phone or desktop
- [ ] Dashboard logged in: `http://localhost:5173/dashboard`

### Bot details
| Item | Value |
|---|---|
| Bot name | `@DevosConstructionBot` |
| Organisation | Primerose Smart City Cluster |
| Org ID | `0a697de3-7fe5-421a-a3f5-e47829cc21de` |

---

## SETUP — Admin Telegram Chat ID (do this once)

You need your personal Telegram Chat ID so the bot can send you admin alerts.

1. Open Telegram → search `@userinfobot` → send it any message
2. Copy the **Id** number it returns (e.g. `123456789`)
3. Run this in Supabase SQL editor — replace `YOUR_CHAT_ID`:

```sql
UPDATE org_credentials
SET credentials = credentials || '{"notification_chat_ids": ["YOUR_CHAT_ID"]}'::jsonb
WHERE provider = 'telegram'
  AND organisation_id = '0a697de3-7fe5-421a-a3f5-e47829cc21de';
```

4. Restart the agent worker so it loads the updated credentials
5. In the agent worker logs you should see:
   ```
   [Telegram] Starting bot for org: Primerose Smart City Cluster
   ```

**PASS:** Agent worker shows Telegram polling started with no errors.

---

## BLOCK 1 — Lead Form Submission

**Tests:** Lead capture, `on-lead-created` edge function, initial scoring, agent job dispatch

### Steps

1. Go to `http://localhost:5173/lead`
2. Fill in the form:
   - **Name:** Test User One
   - **Phone:** +2348012345678
   - **City:** Lagos
   - **Budget:** ₦50,000,000
   - **Investment type:** Investment
3. Click **Submit**
4. You should land on a thank-you page

### Verify

**Dashboard:** Go to `http://localhost:5173/dashboard` → PRESELL Agent → Leads
→ `Test User One` should appear in the list with a score > 0

**Supabase:**
```sql
SELECT name, phone, score, category, status, preferred_channel
FROM leads
ORDER BY created_at DESC
LIMIT 3;
```
Expected: row exists, `score > 0`, `status = new`

```sql
SELECT agent_type, status, payload->>'action' AS action
FROM agent_queue
ORDER BY created_at DESC
LIMIT 3;
```
Expected: a `presell` job with `status = pending` or `completed`

**PASS:** Lead appears in dashboard. Agent job created in `agent_queue`.

---

## BLOCK 2 — Telegram Deep Link + PRESELL Agent First Reply

**Tests:** Telegram bot polling, deep link lead linking, PRESELL agent Telegram response

### Steps

1. On the thank-you page, click **"Message us on Telegram"** button
   - This opens: `t.me/DevosConstructionBot?start=lead_<UUID>`
2. Telegram opens → tap **START** (or it auto-sends `/start lead_<UUID>`)
3. Wait up to 30 seconds

### Verify

**Telegram:** The bot sends you a warm greeting message referencing your registration

**Agent worker logs should show:**
```
[Telegram] Inbound message from <chatId>: /start lead_...
[Telegram] Linked chatId <chatId> to existing lead <UUID>
[Telegram] Queued presell job for lead <UUID>
[Job xxxxx] Processing presell for org...
[Job xxxxx] Completed successfully
```

**Supabase:**
```sql
SELECT name, telegram_chat_id, preferred_channel, conversation_turns
FROM leads
ORDER BY updated_at DESC
LIMIT 1;
```
Expected: `telegram_chat_id` = your Telegram chat ID, `preferred_channel = telegram`

```sql
SELECT direction, content, channel
FROM message_threads
ORDER BY created_at DESC
LIMIT 5;
```
Expected: outbound message from the bot, `channel = telegram`

**Dashboard:** PRESELL Agent → Leads → click Test User One → conversation tab shows the bot's reply

**PASS:** Bot replied in Telegram. `telegram_chat_id` linked. Message logged in `message_threads`.

---

## BLOCK 3 — PRESELL Multi-Turn Qualification

**Tests:** Conversation continuity, qualification data extraction, score updates

### Steps

Reply to the bot in Telegram. Carry a natural conversation — the bot will ask about your needs. Suggested replies:

1. `"I'm interested in a 3 bedroom flat"`
2. `"My budget is around 80 million naira"`
3. `"I want to buy within 3 months"`
4. `"It's for investment, I plan to rent it out"`

Wait for a bot reply after each message (up to 15 seconds each).

### Verify after all 4 replies

```sql
SELECT name, score, category, qualification_data, conversation_turns
FROM leads
ORDER BY updated_at DESC
LIMIT 1;
```
Expected:
- `score` higher than initial (budget ₦80m + investment type + Lagos = strong signals)
- `qualification_data` has budget, timeline, investment_type populated
- `conversation_turns` = 4 or more

```sql
SELECT COUNT(*) AS jobs_processed
FROM agent_logs
WHERE agent_type = 'presell'
ORDER BY created_at DESC;
```

**PASS:** Score has increased. `qualification_data` is populated. Bot replied to all 4 messages.

---

## BLOCK 4 — Hot Lead Alert (Telegram notification to admin)

**Tests:** Hot lead scoring threshold, Telegram admin notification

### Steps

Force a lead to hot (or wait for score to naturally reach 70+):

```sql
UPDATE leads
SET score = 80, category = 'hot', status = 'hot_lead'
WHERE preferred_channel = 'telegram'
ORDER BY created_at DESC
LIMIT 1;
```

If the agent worker is running and `notification_chat_ids` is set (SETUP step), a Telegram message should arrive in your personal chat within a few seconds.

### Verify

**Telegram (your personal chat, not the bot):** You receive an alert like:
```
🔥 Hot Lead: Test User One scored 80/100
```

**Dashboard:** PRESELL Agent → Overview → Hot count = 1 (or more)

**PASS:** Hot lead alert arrives in your Telegram admin chat.

> If no alert arrives: confirm `notification_chat_ids` is set (run the SETUP SQL again), then restart the agent worker.

---

## BLOCK 5 — Unit Inventory

**Tests:** Unit data, inventory display

### Check units exist

```sql
SELECT unit_number, type, bedrooms, status, price_kobo/100 AS price_naira
FROM units
LIMIT 10;
```

If empty, insert a test unit:
```sql
INSERT INTO units (organisation_id, project_id, unit_number, type, bedrooms, price_kobo, status)
SELECT
  '0a697de3-7fe5-421a-a3f5-e47829cc21de',
  id,
  'A-101', 'flat', 3, 8500000000, 'available'
FROM projects
LIMIT 1;
```

### Verify

**Dashboard:** PRESELL Agent → Unit Inventory → unit `A-101` appears as `available`

**PASS:** At least one unit visible in the Unit Inventory page.

---

## BLOCK 6 — Morning Brief (MASTER Agent)

**Tests:** MASTER agent synthesis, Telegram brief delivery to admin

### Steps

Trigger the morning brief manually:

```bash
curl -X POST https://gvcadlzjpsfabrqkzdwt.supabase.co/functions/v1/morning-brief \
  -H "Content-Type: application/json"
```

Wait up to 60 seconds.

### Verify

**Telegram (your personal admin chat):** You receive a structured brief with lead counts, hot leads, pending payments, etc.

**Agent worker logs:**
```
[MASTER xxxxxx] Processing morning brief for org...
[MASTER xxxxxx] Brief sent successfully
```

**Supabase:**
```sql
SELECT agent_type, output_summary, status, created_at
FROM agent_logs
WHERE agent_type = 'master'
ORDER BY created_at DESC
LIMIT 1;
```
Expected: `status = completed`, `output_summary` contains summary text

**PASS:** Morning brief message received in Telegram. `agent_logs` shows `completed`.

---

## BLOCK 7 — Budget Manager (T4.1)

**Tests:** Budget phase creation, line items, health indicators

### Steps

1. Check a project exists:
```sql
SELECT id, name, location FROM projects LIMIT 5;
```
If empty:
```sql
INSERT INTO projects (organisation_id, name, location, total_units, status)
VALUES ('0a697de3-7fe5-421a-a3f5-e47829cc21de', 'Primerose Phase 1', 'Lekki, Lagos', 50, 'active');
```

2. Dashboard → **GUARDIAN Agent → Budget Manager**
3. Select the project from the dropdown
4. Click **+ Add Phase / Category**:
   - Phase name: `Block A Foundation`
   - Category: `Foundation`
   - Allocated budget: `15000000` (type: 15000000 — this is ₦15m)
   - Contingency: `5`
   - Click **Add Phase**
5. The phase appears. Click on it to expand it.
6. Click **+ Add line item**:
   - Description: `Dangote Cement 50kg`
   - Qty: `200`
   - Unit: `bag`
   - Rate: `8500` (₦8,500)
   - Click **Add Item**
7. Add a second line item:
   - Description: `16mm Iron Rod`
   - Qty: `50`
   - Unit: `length`
   - Rate: `18500`
   - Click **Add Item**

### Verify

Health badge shows **GREEN 0%** (nothing spent yet).

```sql
SELECT phase_name, category, allocated_kobo/100 AS allocated_naira,
       spent_kobo, contingency_pct
FROM budget_phases;

SELECT description, quantity, unit, unit_rate_kobo/100 AS rate_naira,
       total_kobo/100 AS total_naira
FROM budget_line_items;
```
Expected: 1 phase row, 2 line item rows with correct totals.

**PASS:** Phase and line items visible in Budget Manager. Health badge GREEN.

---

## BLOCK 8 — Site Manager: Submit Purchase Request (T4.5 + T4.6)

**Tests:** Site manager mobile UI, purchase request submission, GUARDIAN job dispatch

### Steps

1. Open `http://localhost:5173/site` — use a narrow/mobile browser window
2. Sign in with your Supabase credentials
3. Tap **+ Purchase** tab
4. Fill in:
   - **Phase:** Block A Foundation
   - **Material:** `Dangote Cement 50kg`
   - **Description:** `Foundation pour — Block A`
   - **Quantity:** `100`
   - **Unit:** `bag`
   - **Unit Rate (₦):** `8500`
   - **Evidence:** paste any public image URL, e.g. `https://picsum.photos/400/300` → tap **Add**
5. Tap **Submit Purchase Request**
6. You see: `"Purchase request submitted. GUARDIAN is analyzing…"`

### Verify

```sql
SELECT description, material_name, quantity, unit,
       unit_rate_kobo/100 AS rate_naira, status, guardian_flag
FROM purchase_requests
ORDER BY created_at DESC
LIMIT 1;
```
Expected: row exists, `status = pending`, `guardian_flag = null` (GUARDIAN not done yet)

```sql
SELECT agent_type, status, payload->>'purchase_request_id' AS pr_id
FROM agent_queue
ORDER BY created_at DESC
LIMIT 3;
```
Expected: a `guardian` job in `pending` or `completed`

**PASS:** Purchase request row created. GUARDIAN job queued.

---

## BLOCK 9 — GUARDIAN Agent Analysis (T4.7)

**Tests:** Price index comparison, flag levels, auto-approve / auto-reject logic

### Wait for GUARDIAN to complete (up to 30 seconds)

Watch agent worker logs:
```
[GUARDIAN xxxxxx] Analyzing PR <uuid>
[GUARDIAN xxxxxx] Done. Flag: CLEAR, Auto: none
```

### Verify CLEAR result (₦8,500 = market rate)

```sql
SELECT
  description,
  status,
  guardian_flag,
  guardian_analysis->>'narrative'                          AS narrative,
  guardian_analysis->'price_analysis'->>'deviation_pct'   AS deviation_pct,
  guardian_analysis->'budget_analysis'->>'would_breach'   AS would_breach,
  guardian_analysis->>'auto_action'                       AS auto_action
FROM purchase_requests
ORDER BY created_at DESC
LIMIT 1;
```
Expected:
- `guardian_flag = CLEAR`
- `deviation_pct` close to `0`
- `would_breach = false`
- `auto_action = null` or `approved`
- `narrative` contains readable analysis text

### Now test CRITICAL path

Submit a second purchase request via `/site` with an inflated price:
- Material: `Dangote Cement 50kg`
- Qty: `100`, Unit: `bag`
- **Rate: `20000`** (₦20,000 — 135% above market)
- Add any evidence URL → Submit

Wait 30 seconds, then:

```sql
SELECT description, status, guardian_flag,
       guardian_analysis->'price_analysis'->>'deviation_pct' AS deviation_pct
FROM purchase_requests
ORDER BY created_at DESC
LIMIT 2;
```
Expected second row:
- `guardian_flag = CRITICAL`
- `status = rejected` (auto-rejected)
- `deviation_pct > 30`

**PASS:** First PR flagged CLEAR. Second PR flagged CRITICAL and auto-rejected. Narratives populated.

---

## BLOCK 10 — Developer Approval Interface (T4.8)

**Tests:** Approval UI, flag colour-coding, GUARDIAN analysis display

### Steps

1. Dashboard → **GUARDIAN Agent → Purchase Approvals**
2. Filter = `pending` → your first request (CLEAR) should appear
3. Click it → right panel shows:
   - GUARDIAN flag badge (GREEN — CLEAR)
   - Price deviation %
   - Budget impact (allocated, remaining, this request total)
   - GUARDIAN narrative text
4. Read the analysis — it should make sense given the ₦8,500 cement price
5. Confirm you can see the **Approve / Adjust / Reject** buttons

**PASS:** Approval panel loads with GUARDIAN analysis. Flag correctly colour-coded. Action buttons visible.

---

## BLOCK 11 — Approve a Purchase Request (T4.9)

**Tests:** Separation of duties, payment ticket generation, `spent_kobo` trigger

### Steps — Part A: Test separation of duties

Try to approve the request **as the same user who submitted it**:
- In Approvals panel → click **Approve** → **Confirm Approve**

Expected error:
> `"Submitter cannot approve their own request"`

This is correct behaviour — the system is working.

### Steps — Part B: Approve with a different user

Sign in as a second Supabase user (admin role) OR temporarily adjust the `requested_by` field:
```sql
-- Temporarily change requested_by so you can approve as yourself (test only)
UPDATE purchase_requests
SET requested_by = '00000000-0000-0000-0000-000000000000'
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 1;
```

Then in Dashboard → Approvals:
1. Click the CLEAR pending request
2. Click **Approve**
3. Add a note: `Approved — price verified against market`
4. Click **Confirm Approve**

### Verify

**On screen:** Payment ticket reference code appears, e.g. `PT-M5XK2A-B7F3`

```sql
SELECT reference_code, amount_kobo/100 AS amount_naira,
       status, purchase_request_id
FROM payment_tickets
ORDER BY created_at DESC
LIMIT 3;
```
Expected: new ticket row linked to the purchase request

```sql
SELECT action, notes, reference_type
FROM approvals
ORDER BY created_at DESC
LIMIT 3;
```
Expected: `action = approved`, `reference_type = purchase_request`

```sql
-- Budget trigger: spent_kobo should have incremented
SELECT phase_name, allocated_kobo/100 AS allocated,
       spent_kobo/100 AS spent
FROM budget_phases;
```
Expected: `spent_kobo` = 100 bags × ₦8,500 = ₦850,000

**PASS:** Payment ticket generated. Approvals logged. Budget `spent_kobo` updated. Budget health badge updates from GREEN to reflect spending.

---

## BLOCK 12 — Price Index (T4.3)

**Tests:** Seed data, price lookup, update function

### Verify seed data

```sql
SELECT material_name, unit, rate_kobo/100 AS rate_naira, region
FROM price_index
ORDER BY material_name
LIMIT 20;
```
Expected: at least 39 rows covering cement, rebar, sand, blocks, tiles, timber, roofing, pipes, labour.

### Test the update endpoint

```bash
curl -X POST https://gvcadlzjpsfabrqkzdwt.supabase.co/functions/v1/price-index-update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_SERVICE_ROLE_KEY>" \
  -d '{
    "updates": [
      {
        "material_name": "Dangote Cement 50kg",
        "unit": "bag",
        "rate_kobo": 880000,
        "region": "Lagos",
        "source": "test_update"
      }
    ]
  }'
```

Expected response:
```json
{ "success": true, "inserted": 1, "effective_date": "2026-03-06" }
```

**PASS:** 39+ price index rows exist. Update endpoint returns `inserted: 1`.

---

## BLOCK 13 — Progress Update (T4.5)

**Tests:** Site manager progress submission, `progress_updates` table

### Steps

1. Open `http://localhost:5173/site`
2. Tap **+ Update** tab
3. Fill in:
   - Phase: `Block A Foundation`
   - Drag slider to `25%`
   - Summary: `Excavation complete, blinding concrete poured`
   - Add a photo URL: `https://picsum.photos/600/400` → tap **Add**
4. Tap **Submit Progress Update**

### Verify

**On screen:** `"Progress update submitted successfully."`

Progress tab now shows the 25% update with a progress bar.

```sql
SELECT percent_complete, summary, photo_urls, submitted_at
FROM progress_updates
ORDER BY submitted_at DESC
LIMIT 3;
```
Expected: row with `percent_complete = 25`, summary text, photo URL array

**PASS:** Progress update submitted. Visible in progress tab. Row in `progress_updates`.

---

## Final System Health Check

Run this single query — all counts should be > 0:

```sql
SELECT
  (SELECT COUNT(*) FROM leads)                           AS leads,
  (SELECT COUNT(*) FROM leads WHERE preferred_channel='telegram') AS telegram_leads,
  (SELECT COUNT(*) FROM message_threads)                 AS messages,
  (SELECT COUNT(*) FROM agent_queue WHERE status='completed') AS completed_jobs,
  (SELECT COUNT(*) FROM agent_logs)                      AS agent_logs,
  (SELECT COUNT(*) FROM price_index)                     AS price_index,
  (SELECT COUNT(*) FROM budget_phases)                   AS budget_phases,
  (SELECT COUNT(*) FROM budget_line_items)               AS line_items,
  (SELECT COUNT(*) FROM purchase_requests)               AS purchase_requests,
  (SELECT COUNT(*) FROM purchase_requests WHERE guardian_flag IS NOT NULL) AS guardian_analyzed,
  (SELECT COUNT(*) FROM payment_tickets)                 AS payment_tickets,
  (SELECT COUNT(*) FROM approvals)                       AS approvals,
  (SELECT COUNT(*) FROM progress_updates)                AS progress_updates;
```

All values should be ≥ 1. `guardian_analyzed` should be ≥ 2 (CLEAR + CRITICAL test).

---

## Troubleshooting Reference

| Symptom | Cause | Fix |
|---|---|---|
| Bot doesn't reply | Agent worker not running | Start agent worker, check logs |
| `409 Conflict` in logs | Two agent worker instances running | Stop the duplicate instance |
| No hot lead alert | `notification_chat_ids` not set | Run SETUP SQL, restart worker |
| No morning brief | Same as above | Same fix |
| GUARDIAN flag not updating | Agent worker crashed mid-job | Restart worker; re-submit PR |
| Approval 403 "Submitter cannot approve" | Working as designed | Use a different user to approve |
| `spent_kobo` not incrementing | Trigger only fires on approval | Approve PR first |
| Lead created fresh instead of linked | Deep link not used | Test via thank-you page `/start lead_<UUID>` |
| Score not updating | PRESELL agent not extracting signals | Check `agent_logs` for errors |
| Budget Manager shows no project | No project in DB | Insert project via SQL (Block 7) |
