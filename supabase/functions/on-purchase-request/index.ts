// Supabase Edge Function: on-purchase-request
// T4.6 — Site manager submits a purchase request
// Validates required fields + evidence, dispatches GUARDIAN agent job
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const userId = userJson.id;

    const body = await req.json();
    const {
      organisation_id, project_id, phase_id, description,
      material_name, quantity, unit, unit_rate_kobo,
      supplier_name, evidence_urls,
    } = body;

    if (!organisation_id || !project_id || !description || !quantity || !unit_rate_kobo) {
      return json({ error: 'Missing required fields: organisation_id, project_id, description, quantity, unit_rate_kobo' }, 400);
    }
    if (!evidence_urls || evidence_urls.length === 0) {
      return json({ error: 'At least one evidence photo is required' }, 400);
    }
    if (quantity <= 0) return json({ error: 'Quantity must be positive' }, 400);
    if (unit_rate_kobo <= 0) return json({ error: 'Unit rate must be positive' }, 400);

    const members = await db(`org_members?user_id=eq.${userId}&organisation_id=eq.${organisation_id}&select=role`);
    if (!members || members.length === 0) {
      return json({ error: 'Not a member of this organisation' }, 403);
    }

    const [pr] = await db('purchase_requests', {
      method: 'POST',
      body: JSON.stringify({
        organisation_id, project_id,
        phase_id: phase_id || null,
        requested_by: userId,
        description,
        material_name: material_name || description,
        quantity,
        unit: unit || 'item',
        unit_rate_kobo,
        supplier_name: supplier_name || null,
        evidence_urls: evidence_urls || [],
        status: 'pending',
      }),
    });

    if (!pr?.id) return json({ error: 'Failed to create purchase request' }, 500);

    await db('agent_queue', {
      method: 'POST',
      body: JSON.stringify({
        organisation_id,
        agent_type: 'guardian',
        payload: {
          purchase_request_id: pr.id,
          project_id, phase_id: phase_id || null,
          material_name: material_name || description,
          quantity, unit: unit || 'item',
          unit_rate_kobo, description, submitted_by: userId,
        },
        status: 'pending', priority: 8, max_attempts: 3,
      }),
    });

    return json({ success: true, purchase_request_id: pr.id });
  } catch (err) {
    console.error('on-purchase-request error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
