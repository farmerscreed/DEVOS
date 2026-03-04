const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://gvcadlzjpsfabrqkzdwt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
});

const activeBots = new Map();

// Graceful shutdown: stop all bots cleanly on SIGTERM (Railway sends this on redeploy)
process.on('SIGTERM', async () => {
    console.log('[Telegram] SIGTERM received — stopping all bots gracefully...');
    const stopPromises = [];
    for (const [orgId, bot] of activeBots.entries()) {
        console.log(`[Telegram] Stopping bot for org ${orgId}`);
        stopPromises.push(bot.stopPolling());
    }
    await Promise.allSettled(stopPromises);
    activeBots.clear();
    console.log('[Telegram] All bots stopped. Exiting.');
    process.exit(0);
});

async function startTelegramBots() {
    console.log('[Telegram] Checking for active Telegram credentials...');

    const { data: creds, error } = await supabase
        .from('org_credentials')
        .select('*, organisations(name)')
        .eq('provider', 'telegram')
        .eq('status', 'active');

    if (error) {
        console.error('[Telegram] Error fetching credentials:', error);
        return;
    }

    for (const cred of creds) {
        const orgId = cred.organisation_id;
        const orgName = cred.organisations?.name || 'Organisation';

        let botToken = null;
        try {
            if (typeof cred.credentials === 'string') {
                const parsed = JSON.parse(cred.credentials);
                botToken = parsed.bot_token;
            } else if (cred.credentials && cred.credentials.bot_token) {
                botToken = cred.credentials.bot_token;
            }
        } catch (e) {
            console.error(`[Telegram] Could not parse credentials for org ${orgId}`);
            continue;
        }

        if (!botToken) continue;

        if (!activeBots.has(orgId)) {
            console.log(`[Telegram] Starting bot for org: ${orgName}`);

            // ── Step 1: Force-close ANY stale getUpdates session ──
            // A raw getUpdates call with timeout=0 immediately terminates
            // any long-polling connection on Telegram's side.
            try {
                const https = require('https');
                await new Promise((resolve, reject) => {
                    const url = `https://api.telegram.org/bot${botToken}/deleteWebhook?drop_pending_updates=true`;
                    https.get(url, (res) => {
                        let d = '';
                        res.on('data', c => d += c);
                        res.on('end', () => { console.log(`[Telegram] deleteWebhook result:`, d); resolve(); });
                    }).on('error', reject);
                });

                // Force a short getUpdates to steal the session from any other instance
                await new Promise((resolve, reject) => {
                    const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=-1&timeout=0`;
                    https.get(url, (res) => {
                        let d = '';
                        res.on('data', c => d += c);
                        res.on('end', () => { console.log(`[Telegram] Force getUpdates result:`, d.substring(0, 100)); resolve(); });
                    }).on('error', reject);
                });

                console.log(`[Telegram] Cleared stale session for org: ${orgName}`);
            } catch (e) {
                console.warn(`[Telegram] Could not clear stale session: ${e.message}`);
            }

            // ── Step 2: Wait for Telegram to fully release the old session ──
            console.log(`[Telegram] Waiting 5s for old session to fully release...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            // ── Step 3: Start polling ──
            const bot = new TelegramBot(botToken, { polling: false });
            bot.startPolling({ restart: false, polling: { params: { timeout: 10 } } });
            activeBots.set(orgId, bot);

            bot.on('message', async (msg) => {
                await handleInboundMessage(orgId, orgName, bot, msg);
            });

            // ── Step 4: Handle 409 with auto-recovery ──
            let conflictRetries = 0;
            bot.on('polling_error', async (err) => {
                if (err.message && err.message.includes('409 Conflict')) {
                    conflictRetries++;
                    console.warn(`[Telegram] 409 Conflict for ${orgName} (retry ${conflictRetries})`);
                    if (conflictRetries <= 5) {
                        // Stop, wait, then restart polling
                        await bot.stopPolling();
                        const backoff = conflictRetries * 3000; // 3s, 6s, 9s, 12s, 15s
                        console.log(`[Telegram] Backing off ${backoff / 1000}s before retry...`);
                        await new Promise(r => setTimeout(r, backoff));
                        bot.startPolling({ restart: false, polling: { params: { timeout: 10 } } });
                    } else {
                        console.error(`[Telegram] Too many 409 conflicts for ${orgName}. Stopping bot. Another instance may be running.`);
                        await bot.stopPolling();
                        activeBots.delete(orgId);
                    }
                } else {
                    console.error(`[Telegram] Polling error for org ${orgName}:`, err.message);
                }
            });
        }
    }
}

async function handleInboundMessage(orgId, orgName, bot, msg) {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    if (!text) return; // ignore non-text for now

    console.log(`[Telegram] Inbound message from ${chatId}: ${text}`);

    // 1. Find or create lead
    // We use `tg_${chatId}` as a pseudo-phone number to uniquely identify telegram leads
    const pseudoPhone = `tg_${chatId}`;

    let { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('organisation_id', orgId)
        .eq('phone', pseudoPhone)
        .single();

    let leadId = null;
    let leadName = msg.from.first_name || 'User';

    if (!lead) {
        console.log(`[Telegram] Creating new lead for chatId ${chatId}`);
        const { data: newLead, error } = await supabase
            .from('leads')
            .insert({
                organisation_id: orgId,
                name: leadName,
                phone: pseudoPhone,
                preferred_channel: 'telegram',
                status: 'new',
                score: 30, // base score
                category: 'cold'
            })
            .select()
            .single();

        if (error) {
            console.error('[Telegram] Error creating lead:', error);
            return;
        }
        leadId = newLead.id;
    } else {
        leadId = lead.id;
        leadName = lead.name;
        // Update preferred channel if not already
        if (lead.preferred_channel !== 'telegram') {
            await supabase.from('leads').update({ preferred_channel: 'telegram' }).eq('id', leadId);
        }
    }

    // 2. Log to message_threads
    await supabase
        .from('message_threads')
        .insert({
            organisation_id: orgId,
            lead_id: leadId,
            channel: 'telegram',
            direction: 'inbound',
            content: text,
            contact_phone: pseudoPhone
        });

    // 3. Dispatch to agent_queue
    const sysPrompt = `You are a real estate agent for ${orgName}. The user is messaging you on Telegram. \n` +
        `Ask qualifying questions smoothly: budget, timeline, investment type, unit preference. ` +
        `Important: when sending a message to the user, use the 'send_telegram_message' tool and pass the chat_id: "${chatId}".`;

    await supabase
        .from('agent_queue')
        .insert({
            organisation_id: orgId,
            agent_type: 'presell',
            status: 'pending',
            attempts: 0,
            max_attempts: 3,
            lead_id: leadId,
            payload: {
                action: 'inbound_reply',
                lead_name: leadName,
                lead_phone: pseudoPhone,
                chat_id: String(chatId),
                content: text,
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: `User ${leadName} says: "${text}"\nPlease respond passing chat_id="${chatId}".` }
                ]
            }
        });

    console.log(`[Telegram] Queued presell job for lead ${leadId}`);
}

async function sendOutboundTelegram(orgId, chatId, text) {
    const bot = activeBots.get(orgId);
    if (!bot) {
        throw new Error(`[Telegram] No active bot for org ${orgId}`);
    }

    await bot.sendMessage(chatId, text);
    console.log(`[Telegram] Outbound message sent to ${chatId}`);
    return { success: true, channel: 'telegram', chatId };
}

module.exports = {
    startTelegramBots,
    sendOutboundTelegram
};
