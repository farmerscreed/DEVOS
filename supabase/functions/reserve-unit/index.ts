// Supabase Edge Function: reserve-unit
// T3.1 — Reserve a unit for a HOT lead (race-safe via reserve_unit_atomic RPC)
// Called by sales agent from lead detail page

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*.devos.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // Use authed client to get user context
        const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
        if (userErr || !user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { unit_id, lead_id, organisation_id } = await req.json();

        if (!unit_id || !lead_id || !organisation_id) {
            return new Response(
                JSON.stringify({ error: "unit_id, lead_id, and organisation_id are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Service role client for the atomic operation
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Call the SELECT FOR UPDATE stored procedure
        const { data, error } = await supabase.rpc("reserve_unit_atomic", {
            p_unit_id: unit_id,
            p_lead_id: lead_id,
            p_org_id: organisation_id,
            p_created_by: user.id,
        });

        if (error) {
            console.error("reserve_unit_atomic error:", error.message);

            // Map specific DB errors to user-friendly responses
            if (error.message.includes("unit_unavailable")) {
                return new Response(
                    JSON.stringify({ error: "This unit has already been reserved. Please select another unit." }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            if (error.message.includes("unit_not_found")) {
                return new Response(
                    JSON.stringify({ error: "Unit not found." }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            throw error;
        }

        const reservation = data as {
            reservation_id: string;
            buyer_id: string;
            reference_code: string;
            expires_at: string;
            unit_id: string;
        };

        // Dispatch job to agent_queue: send payment instructions via messaging + email
        await supabase.from("agent_queue").insert({
            organisation_id,
            agent_type: "send_payment_instructions",
            lead_id,
            payload: {
                action: "send_payment_instructions",
                reservation_id: reservation.reservation_id,
                buyer_id: reservation.buyer_id,
                reference_code: reservation.reference_code,
                expires_at: reservation.expires_at,
                unit_id: reservation.unit_id,
                lead_id,
            },
            status: "pending",
            attempts: 0,
            max_attempts: 3,
        });

        // Log event
        await supabase.from("agent_logs").insert({
            organisation_id,
            agent_type: "system",
            event_type: "reservation_created",
            input_summary: `Unit ${unit_id} reserved for lead ${lead_id}`,
            output_summary: `Reservation ${reservation.reservation_id} created. Ref: ${reservation.reference_code}`,
            tool_calls_json: JSON.stringify([]),
            status: "completed",
            duration_ms: 0,
        });

        return new Response(JSON.stringify({ success: true, reservation }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (err) {
        console.error("reserve-unit error:", err);
        return new Response(JSON.stringify({ error: "Reservation failed. Please try again." }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
