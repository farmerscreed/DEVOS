// Supabase Edge Function: payment-reminder-3d
// T3.8 — Scheduled: 3 days before due date, send urgent reminders for pending instalments

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 3);
        const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD

        const { data: dueInstalments, error } = await supabase
            .from("payment_schedule")
            .select("*, buyers(lead_id)")
            .eq("due_date", dateStr)
            .eq("status", "pending");

        if (error) throw error;

        if (!dueInstalments || dueInstalments.length === 0) {
            return new Response(
                JSON.stringify({ message: "No reminders to send for 3d window", date: dateStr }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }

        // Group by buyer to consolidate multiple overdue instalments
        const byBuyer: Record<string, typeof dueInstalments> = {};
        for (const inst of dueInstalments) {
            if (!byBuyer[inst.buyer_id]) byBuyer[inst.buyer_id] = [];
            byBuyer[inst.buyer_id].push(inst);
        }

        let sent = 0;
        let failed = 0;

        for (const [buyerId, instalments] of Object.entries(byBuyer)) {
            try {
                const totalKobo = instalments.reduce((sum, i) => sum + i.amount_kobo, 0);
                await supabase.from("agent_queue").insert({
                    organisation_id: instalments[0].organisation_id,
                    agent_type: "send_payment_reminder",
                    lead_id: instalments[0].buyers?.lead_id || null,
                    payload: {
                        action: "send_payment_reminder",
                        days_until_due: 3,
                        urgent: true,
                        buyer_id: buyerId,
                        instalments: instalments.map(i => ({
                            id: i.id,
                            instalment_number: i.instalment_number,
                            amount_kobo: i.amount_kobo,
                            due_date: i.due_date,
                        })),
                        total_amount_kobo: totalKobo,
                        due_date: dateStr,
                    },
                    status: "pending",
                    attempts: 0,
                    max_attempts: 3,
                });
                sent++;
            } catch (err: any) {
                console.error(`Failed to queue 3d reminder for buyer ${buyerId}:`, err);
                failed++;
            }
        }

        return new Response(
            JSON.stringify({ date: dateStr, reminders_queued: sent, failed }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("payment-reminder-3d error:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
        });
    }
});
