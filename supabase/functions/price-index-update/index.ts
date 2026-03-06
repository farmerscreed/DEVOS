// Supabase Edge Function: price-index-update
// T4.4 — Monthly scheduled update of Nigerian construction materials price index
// Triggered by pg_cron (monthly) or called directly by super_admin
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

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

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-cron-secret') || '';
  if (CRON_SECRET && secret !== CRON_SECRET) {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.includes(serviceKey)) return json({ error: 'Forbidden' }, 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const updates: Array<{
      material_name: string; unit: string; rate_kobo: number; region?: string; source?: string;
    }> = body.updates || [];

    const effectiveDate = new Date().toISOString().split('T')[0];
    let inserted = 0;

    for (const u of updates) {
      if (!u.material_name || !u.unit || !u.rate_kobo) continue;
      await db('price_index', {
        method: 'POST',
        body: JSON.stringify({
          material_name: u.material_name, unit: u.unit, rate_kobo: u.rate_kobo,
          region: u.region || 'Lagos', effective_date: effectiveDate,
          source: u.source || 'monthly_update',
        }),
        headers: { Prefer: 'return=minimal' },
      });
      inserted++;
    }

    await db('agent_logs', {
      method: 'POST',
      body: JSON.stringify({
        organisation_id: null, agent_type: 'system',
        event_type: 'price_index_update',
        input_summary: 'Monthly price index update',
        output_summary: `Inserted ${inserted} new price entries`,
        status: 'completed', cost_usd: 0,
      }),
      headers: { Prefer: 'return=minimal' },
    });

    return json({ success: true, inserted, effective_date: effectiveDate });
  } catch (err) {
    console.error('price-index-update error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}
