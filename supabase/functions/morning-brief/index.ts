// Supabase Edge Function: morning-brief
// T3.10 — Scheduled daily: fires at 7am per org timezone
// Compiles overnight data and dispatches to agent_queue for MASTER Agent

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const results: { org_id: string; status: string; jobs?: any }[] = [];

    try {
        const { data: orgs, error: orgsErr } = await supabase
            .from("organisations")
            .select("id, name, timezone, settings")
            .not("timezone", "is", null);

        if (orgsErr) throw orgsErr;

        for (const org of orgs || []) {
            try {
                const orgTimezone = org.timezone || "UTC";

                // Determine local hour for this org
                const localHour = parseInt(
                    new Intl.DateTimeFormat("en-US", {
                        timeZone: orgTimezone,
                        hour: "2-digit",
                        hour12: false,
                    }).format(now)
                );

                // Only process if it's 7am in this org's timezone
                // (for manual invocation / testing, FORCE_ALL=true env override)
                const forceAll = Deno.env.get("FORCE_ALL_ORGS") === "true";
                if (!forceAll && localHour !== 7) {
                    results.push({ org_id: org.id, status: "skipped_not_7am" });
                    continue;
                }

                // Calculate overnight window (last 24 hours)
                const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                const windowEnd = now.toISOString();

                // Compile overnight data snapshot
                const [
                    { data: newLeads },
                    { data: hotLeads },
                    { data: newPayments },
                    { data: pendingPayments },
                    { data: newReservations },
                    { data: expiredReservations },
                ] = await Promise.all([
                    supabase
                        .from("leads")
                        .select("id, name, phone, score, status, created_at")
                        .eq("organisation_id", org.id)
                        .gte("created_at", windowStart)
                        .order("created_at", { ascending: false }),

                    supabase
                        .from("leads")
                        .select("id, name, phone, score, status")
                        .eq("organisation_id", org.id)
                        .gte("score", 70)
                        .eq("status", "hot")
                        .is("reservation_id", null)
                        .limit(10),

                    supabase
                        .from("payments_in")
                        .select("id, amount_kobo, status, confirmed_at, buyer_id")
                        .eq("organisation_id", org.id)
                        .eq("status", "confirmed")
                        .gte("confirmed_at", windowStart),

                    supabase
                        .from("payments_in")
                        .select("id, amount_kobo, created_at, buyer_id")
                        .eq("organisation_id", org.id)
                        .eq("status", "pending")
                        .limit(20),

                    supabase
                        .from("reservations")
                        .select("id, reference_code, unit_id, status, created_at")
                        .eq("organisation_id", org.id)
                        .gte("created_at", windowStart),

                    supabase
                        .from("reservations")
                        .select("id, reference_code, unit_id, expires_at")
                        .eq("organisation_id", org.id)
                        .eq("status", "expired")
                        .gte("expires_at", windowStart),
                ]);

                const overnightData = {
                    window: { start: windowStart, end: windowEnd },
                    new_leads: newLeads || [],
                    hot_leads_needing_attention: hotLeads || [],
                    confirmed_payments: newPayments || [],
                    pending_payments: pendingPayments || [],
                    new_reservations: newReservations || [],
                    expired_reservations: expiredReservations || [],
                    // Summary counts for quick agent parsing
                    summary: {
                        new_leads_count: (newLeads || []).length,
                        hot_leads_count: (hotLeads || []).length,
                        confirmed_payments_count: (newPayments || []).length,
                        pending_payments_count: (pendingPayments || []).length,
                        new_reservations_count: (newReservations || []).length,
                        expired_reservations_count: (expiredReservations || []).length,
                    },
                };

                const hasActivity =
                    overnightData.summary.new_leads_count > 0 ||
                    overnightData.summary.confirmed_payments_count > 0 ||
                    overnightData.summary.hot_leads_count > 0 ||
                    overnightData.summary.pending_payments_count > 0 ||
                    overnightData.summary.new_reservations_count > 0;

                // Insert job for MASTER Agent
                const { data: job, error: jobErr } = await supabase
                    .from("agent_queue")
                    .insert({
                        organisation_id: org.id,
                        agent_type: "master",
                        payload: {
                            action: "morning_brief",
                            org_name: org.name,
                            org_timezone: orgTimezone,
                            has_activity: hasActivity,
                            overnight_data: overnightData,
                        },
                        status: "pending",
                        attempts: 0,
                        max_attempts: 3,
                    })
                    .select()
                    .single();

                if (jobErr) throw jobErr;

                results.push({ org_id: org.id, status: "queued", jobs: job });

            } catch (orgErr: any) {
                console.error(`Failed to queue morning brief for org ${org.id}:`, orgErr);

                // Fallback: insert simple notification rather than crashing
                try {
                    await supabase.from("agent_queue").insert({
                        organisation_id: org.id,
                        agent_type: "send_fallback_message",
                        payload: {
                            action: "send_fallback_message",
                            message: "Brief generation failed. Check dashboard.",
                        },
                        status: "pending",
                        attempts: 0,
                        max_attempts: 3,
                    });
                } catch (_) { /* swallow — best effort */ }

                results.push({ org_id: org.id, status: "error", jobs: orgErr.message });
            }
        }

        return new Response(JSON.stringify({ success: true, results }), {
            status: 200, headers: { "Content-Type": "application/json" },
        });

    } catch (err: any) {
        console.error("morning-brief error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
        });
    }
});
