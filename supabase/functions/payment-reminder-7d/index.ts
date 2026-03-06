// Supabase Edge Function: payment-reminder-7d
// T3.8 — Scheduled: 7 days before due date, send reminders for pending instalments

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7);
        const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD

        const { data: dueInstalments, error } = await supabase
            .from("payment_schedule")
            .select("*, buyers(lead_id)")
            .eq("due_date", dateStr)
            .eq("status", "pending");

        if (error) throw error;

        if (!dueInstalments || dueInstalments.length === 0) {
            return new Response(
                JSON.stringify({ message: "No reminders to send for 7d window", date: dateStr }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        let sent = 0;
        let failed = 0;

        for (const instalment of dueInstalments) {
            try {
                await supabase.from("agent_queue").insert({
                    organisation_id: instalment.organisation_id,
                    agent_type: "send_payment_reminder",
                    lead_id: instalment.buyers?.lead_id || null,
                    payload: {
                        action: "send_payment_reminder",
                        days_until_due: 7,
                        instalment_id: instalment.id,
                        buyer_id: instalment.buyer_id,
                        reservation_id: instalment.reservation_id,
                        instalment_number: instalment.instalment_number,
                        amount_kobo: instalment.amount_kobo,
                        currency: instalment.currency,
                        due_date: instalment.due_date,
                    },
                    status: "pending",
                    attempts: 0,
                    max_attempts: 3,
                });
                sent++;
            } catch (err: any) {
                console.error(`Failed to queue reminder for instalment ${instalment.id}:`, err);
                failed++;
            }
        }

        return new Response(
            JSON.stringify({ date: dateStr, reminders_queued: sent, failed }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("payment-reminder-7d error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
        });
    }
});
