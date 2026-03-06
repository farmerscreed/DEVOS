// Supabase Edge Function: on-approval-granted
// T4.9 — Developer approves / adjusts / rejects a purchase request
// Enforces separation of duties: submitter ≠ approver
// On approval → generates Payment Ticket + notifies finance
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FINANCE_EMAIL = Deno.env.get('FINANCE_EMAIL') || '';

async function db(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function generateRefCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PT-${ts}-${rand}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: authHeader },
    });
    const userJson = await userRes.json();
    if (!userJson?.id) return json({ error: 'Unauthorized' }, 401);
    const actorId = userJson.id;

    const body = await req.json();
    const { purchase_request_id, action, notes, adjusted_amount_kobo } = body;

    if (!purchase_request_id || !action) {
      return json({ error: 'purchase_request_id and action are required' }, 400);
    }
    if (!['approved', 'rejected', 'adjusted'].includes(action)) {
      return json({ error: 'action must be approved, rejected, or adjusted' }, 400);
    }

    const prs = await db(`purchase_requests?id=eq.${purchase_request_id}&select=*`);
    const pr = prs?.[0];
    if (!pr) return json({ error: 'Purchase request not found' }, 404);

    // ── SEPARATION OF DUTIES ───────────────────────────────────────
    if (pr.requested_by === actorId) {
      return json({ error: 'Submitter cannot approve their own request' }, 403);
    }

    const members = await db(
      `org_members?user_id=eq.${actorId}&organisation_id=eq.${pr.organisation_id}&select=role`
    );
    if (!members?.length || !['admin', 'super_admin', 'developer'].includes(members[0].role)) {
      return json({ error: 'Insufficient permissions' }, 403);
    }

    const finalStatus = action === 'adjusted' ? 'approved' : action;
    const finalAmount = action === 'adjusted' && adjusted_amount_kobo
      ? adjusted_amount_kobo
      : pr.quantity * pr.unit_rate_kobo;

    await db(`purchase_requests?id=eq.${purchase_request_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: finalStatus, reviewed_by: actorId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
        updated_at: new Date().toISOString(),
      }),
      headers: { Prefer: 'return=minimal' },
    });

    await db('approvals', {
      method: 'POST',
      body: JSON.stringify({
        organisation_id: pr.organisation_id,
        reference_type: 'purchase_request',
        reference_id: purchase_request_id,
        actor_id: actorId, action, notes: notes || null,
      }),
      headers: { Prefer: 'return=minimal' },
    });

    let paymentTicket = null;

    if (finalStatus === 'approved') {
      const refCode = generateRefCode();
      const tickets = await db('payment_tickets', {
        method: 'POST',
        body: JSON.stringify({
          organisation_id: pr.organisation_id,
          purchase_request_id, invoice_id: null,
          amount_kobo: finalAmount, reference_code: refCode,
          status: 'pending', generated_by: actorId,
          generated_at: new Date().toISOString(),
        }),
      });
      paymentTicket = tickets?.[0];

      if (RESEND_API_KEY && FINANCE_EMAIL) {
        const amountNaira = `₦${(finalAmount / 100).toLocaleString('en-NG')}`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'DEVOS Finance <finance@devos.app>',
            to: [FINANCE_EMAIL],
            subject: `Payment Ticket ${refCode} — Action Required`,
            html: `
              <h2>New Payment Ticket: ${refCode}</h2>
              <p><strong>Purchase:</strong> ${pr.description}</p>
              <p><strong>Amount:</strong> ${amountNaira}</p>
              <p><strong>Supplier:</strong> ${pr.supplier_name || 'N/A'}</p>
              <p><strong>Notes:</strong> ${notes || 'None'}</p>
              <p>Please process this in the DEVOS Finance module.</p>
            `,
          }),
        });
      }
    }

    return json({
      success: true, action, status: finalStatus,
      payment_ticket: paymentTicket
        ? { id: paymentTicket.id, reference_code: paymentTicket.reference_code }
        : null,
    });
  } catch (err) {
    console.error('on-approval-granted error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
