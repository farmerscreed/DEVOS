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

            // Create bot without polling first, so we can clear stale sessions
            const bot = new TelegramBot(botToken, { polling: false });

            // deleteWebHook also forces Telegram to close any stale getUpdates session
            // This is the key fix for Railway 409 Conflict on redeploy
            try {
                await bot.deleteWebHook({ drop_pending_updates: true });
                console.log(`[Telegram] Cleared stale session for org: ${orgName}`);
            } catch (e) {
                console.warn(`[Telegram] Could not clear stale session: ${e.message}`);
            }

            // Small delay to let any old container's polling timeout expire (Telegram ~1s)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Now start polling — dropPendingUpdates skips any messages queued while bot was offline
            bot.startPolling({ restart: false, polling: { params: { timeout: 10 } } });
            activeBots.set(orgId, bot);

            bot.on('message', async (msg) => {
                await handleInboundMessage(orgId, orgName, bot, msg);
            });

            bot.on('polling_error', (err) => {
                console.error(`[Telegram] Polling error for org ${orgName}:`, err.message);
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
