// Supabase Edge Function: on-payment-confirmed
// T3.4 — Finance marks a payment as confirmed or rejected
// Updates unit status, buyer record, payment schedule
// Triggers document generation and buyer notification

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

        const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
        if (userErr || !user) {
            return new Response(JSON.stringify({ error: "Invalid token" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { payment_id, action, rejection_reason, organisation_id } = await req.json();

        if (!payment_id || !action || !organisation_id) {
            return new Response(
                JSON.stringify({ error: "payment_id, action, and organisation_id are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!["confirm", "reject"].includes(action)) {
            return new Response(JSON.stringify({ error: "action must be 'confirm' or 'reject'" }), {
                status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get the payment record
        const { data: payment, error: payErr } = await supabase
            .from("payments_in")
            .select("*, reservations(*, units(*))")
            .eq("id", payment_id)
            .eq("organisation_id", organisation_id)
            .single();

        if (payErr || !payment) {
            return new Response(JSON.stringify({ error: "Payment not found" }), {
                status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        if (payment.status !== "pending") {
            return new Response(
                JSON.stringify({ error: `Payment is already ${payment.status}` }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (action === "confirm") {
            // Update payment to confirmed
            await supabase
                .from("payments_in")
                .update({
                    status: "confirmed",
                    confirmed_by: user.id,
                    confirmed_at: new Date().toISOString(),
                })
                .eq("id", payment_id);

            // Update payment_schedule instalment if linked
            if (payment.reservation_id) {
                await supabase
                    .from("payment_schedule")
                    .update({ status: "paid", paid_at: new Date().toISOString(), payment_in_id: payment_id })
                    .eq("reservation_id", payment.reservation_id)
                    .eq("instalment_number", payment.instalment_number || 1)
                    .eq("status", "pending");

                // Activate reservation if not already
                await supabase
                    .from("reservations")
                    .update({ status: "active", deposit_paid_at: new Date().toISOString() })
                    .eq("id", payment.reservation_id)
                    .eq("status", "pending");
            }

            // Queue Reservation Letter generation (if first instalment)
            if ((payment.instalment_number || 1) === 1) {
                await supabase.from("documents").insert({
                    organisation_id,
                    buyer_id: payment.buyer_id,
                    reservation_id: payment.reservation_id,
                    document_type: "reservation_letter",
                    status: "generating",
                });

                await supabase.from("agent_queue").insert({
                    organisation_id,
                    agent_type: "generate_reservation_letter",
                    payload: {
                        action: "generate_reservation_letter",
                        payment_id,
                        buyer_id: payment.buyer_id,
                        reservation_id: payment.reservation_id,
                    },
                    status: "pending",
                    attempts: 0,
                    max_attempts: 3,
                });
            }

            // Queue confirmation notification to buyer
            await supabase.from("agent_queue").insert({
                organisation_id,
                agent_type: "send_payment_confirmation",
                lead_id: null,
                payload: {
                    action: "send_payment_confirmation",
                    payment_id,
                    buyer_id: payment.buyer_id,
                    reservation_id: payment.reservation_id,
                    amount_kobo: payment.amount_kobo,
                },
                status: "pending",
                attempts: 0,
                max_attempts: 3,
            });

        } else {
            // REJECT: return unit to available
            await supabase
                .from("payments_in")
                .update({
                    status: "rejected",
                    rejected_by: user.id,
                    rejected_at: new Date().toISOString(),
                    rejection_reason: rejection_reason || "No reason provided",
                })
                .eq("id", payment_id);

            // Return unit to available if reservation exists
            if (payment.reservation_id && payment.reservations?.unit_id) {
                await supabase
                    .from("units")
                    .update({ status: "available", buyer_id: null })
                    .eq("id", payment.reservations.unit_id);

                await supabase
                    .from("reservations")
                    .update({ status: "cancelled" })
                    .eq("id", payment.reservation_id);
            }

            // Notify buyer of rejection
            await supabase.from("agent_queue").insert({
                organisation_id,
                agent_type: "send_payment_rejection",
                payload: {
                    action: "send_payment_rejection",
                    payment_id,
                    buyer_id: payment.buyer_id,
                    reason: rejection_reason,
                },
                status: "pending",
                attempts: 0,
                max_attempts: 3,
            });
        }

        return new Response(
            JSON.stringify({ success: true, payment_id, action }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("on-payment-confirmed error:", err);
        return new Response(JSON.stringify({ error: "Payment processing failed. Please try again." }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
