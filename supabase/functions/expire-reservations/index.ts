// Supabase Edge Function: expire-reservations
// T3.1 — Scheduled (every hour): expire pending reservations past expires_at
// Returns units back to Available status and notifies buyers

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: any[] = [];
    const errors: any[] = [];

    try {
        // Find all expired pending reservations
        const { data: expired, error: fetchErr } = await supabase
            .from("reservations")
            .select("id, organisation_id, unit_id, buyer_id, lead_id, reference_code")
            .eq("status", "pending")
            .lt("expires_at", new Date().toISOString());

        if (fetchErr) throw fetchErr;

        if (!expired || expired.length === 0) {
            return new Response(JSON.stringify({ message: "No expired reservations", processed: 0 }), {
                status: 200, headers: { "Content-Type": "application/json" },
            });
        }

        for (const reservation of expired) {
            try {
                // Mark reservation as expired
                await supabase
                    .from("reservations")
                    .update({ status: "expired" })
                    .eq("id", reservation.id);

                // Return unit to available
                await supabase
                    .from("units")
                    .update({ status: "available", buyer_id: null })
                    .eq("id", reservation.unit_id);

                // Queue notification to buyer/lead
                if (reservation.lead_id) {
                    await supabase.from("agent_queue").insert({
                        organisation_id: reservation.organisation_id,
                        agent_type: "send_expiry_notification",
                        lead_id: reservation.lead_id,
                        payload: {
                            action: "send_expiry_notification",
                            reservation_id: reservation.id,
                            reference_code: reservation.reference_code,
                            lead_id: reservation.lead_id,
                        },
                        status: "pending",
                        attempts: 0,
                        max_attempts: 3,
                    });
                }

                results.push({ reservation_id: reservation.id, unit_id: reservation.unit_id });

            } catch (err: any) {
                console.error(`Failed to expire reservation ${reservation.id}:`, err);
                errors.push({ reservation_id: reservation.id, error: err.message });
            }
        }

        return new Response(
            JSON.stringify({ processed: results.length, errors: errors.length, results, errors }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("expire-reservations error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
        });
    }
});
