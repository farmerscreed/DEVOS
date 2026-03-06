/**
 * DEVOS Agent Engine Worker
 * 
 * This worker polls the agent_queue table for pending jobs and processes them.
 * It calls LiteLLM for AI responses and executes MCP tool calls.
 * 
 * Environment Variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Supabase service role key
 * - LITELLM_BASE_URL: LiteLLM server URL (e.g., http://161.97.95.101:4000)
 * - LITELLM_API_KEY: API key for LiteLLM
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Lazy-load optional dependencies
function requirePdfKit() {
    try { return require('pdfkit'); } catch (_) {
        console.warn('[PDF] pdfkit not installed. Run: npm install pdfkit');
        return null;
    }
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAX_BRIEF_CHARS = 4096;
const MAX_BRIEF_ITEMS_PER_CATEGORY = 5;

// Configuration
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_TOOL_CALLS = 10;
const MAX_ATTEMPTS = 3;

// Guardrail constants
const MAX_AGENT_MESSAGES_PER_HOUR = 3;
const MAX_CONVERSATION_TURNS = 30;
const HOT_LEAD_THRESHOLD = 70;
const WARM_LEAD_THRESHOLD = 40;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://gvcadlzjpsfabrqkzdwt.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const litellmBaseUrl = process.env.LITELLM_BASE_URL || 'http://161.97.95.101:4000';
const litellmApiKey = process.env.LITELLM_API_KEY;

if (!supabaseServiceKey) {
    console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is required');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
});

console.log('=== DEVOS Agent Worker Started ===');
console.log('Supabase URL:', supabaseUrl);
console.log('LiteLLM URL:', litellmBaseUrl);
console.log('Poll Interval:', POLL_INTERVAL, 'ms');
console.log('=================================');

/**
 * Make HTTP request to LiteLLM
 */
async function callLiteLLM(messages, model, tools = null) {
    const payload = {
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1024
    };

    if (tools && tools.length > 0) {
        payload.tools = tools;
    }

    return new Promise((resolve, reject) => {
        const url = new URL('/v1/chat/completions', litellmBaseUrl);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${litellmApiKey}`
            }
        };

        const req = client.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.error) {
                        reject(new Error(response.error.message || 'LiteLLM error'));
                    } else {
                        resolve(response);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse LiteLLM response'));
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

/**
 * Get system prompt for an agent
 */
async function getSystemPrompt(organisationId, agentType) {
    const { data, error } = await supabase
        .from('agent_context')
        .select('system_prompt, context_json')
        .eq('organisation_id', organisationId)
        .eq('agent_type', agentType)  // DB column confirmed as agent_type
        .single();

    if (error || !data) {
        return {
            prompt: 'You are a helpful real estate sales assistant. Ask qualifying questions about budget, timeline, investment type, and unit preference.',
            config: {}
        };
    }

    return {
        prompt: data.system_prompt,
        config: data.context_json || {}
    };
}

/**
 * Get LLM config for an organisation
 */
async function getLLMConfig(organisationId, taskType) {
    const { data, error } = await supabase
        .from('llm_config')
        .select('*')
        .eq('organisation_id', organisationId)
        .eq('task_type', taskType)
        .single();

    if (error) {
        console.log('No specific LLM config found, using defaults');
        return {
            primary_model: 'claude-3-5-haiku',
            fallback_model: 'gpt-4o-mini',
            primary_provider: 'self-hosted',
            fallback_provider: 'self-hosted'
        };
    }

    return data;
}

/**
 * Check guardrails before processing PRESELL agent
 */
async function checkPresellGuardrails(orgId, leadId) {
    const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

    if (error || !lead) {
        return { allowed: false, reason: 'Lead not found' };
    }

    // Check 30-turn cap
    if ((lead.conversation_turns || 0) >= MAX_CONVERSATION_TURNS) {
        // Mark as needs intervention
        await supabase
            .from('leads')
            .update({
                status: 'needs_intervention',
                conversation_state: 'needs_intervention'
            })
            .eq('id', leadId);
        return { allowed: false, reason: 'Max conversation turns reached' };
    }

    // Check agent-initiated message limit per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
        .from('message_threads')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('lead_id', leadId)
        .eq('is_agent_message', true)
        .gte('created_at', oneHourAgo);

    if (count >= MAX_AGENT_MESSAGES_PER_HOUR) {
        return {
            allowed: false,
            reason: 'Max agent messages per hour reached',
            wait_for_user: true
        };
    }

    return { allowed: true };
}

/**
 * Calculate lead score based on qualification data
 */
function calculateScore(qualificationData) {
    // Always recalculate from base 30 to avoid double-counting signals across turns
    let score = 30;
    const q = qualificationData || {};

    // Budget scoring (+10 max)
    if (q.budget_range && q.budget_range.min && q.budget_range.max) {
        const range = q.budget_range.max - q.budget_range.min;
        if (range < 10000000) score += 10; // Specific range
        else score += 5; // Broad range
    }

    // Timeline scoring (+25 max)
    if (q.timeline) {
        switch (q.timeline) {
            case 'immediate':
            case '1-3months':
                score += 25;
                break;
            case '3-6months':
                score += 15;
                break;
            case '6-12months':
                score += 5;
                break;
            default:
                score += 0;
        }
    }

    // Investment type scoring (+15 max)
    if (q.investment_type) {
        switch (q.investment_type) {
            case 'owner-occupier':
                score += 15;
                break;
            case 'buy-to-let':
                score += 12;
                break;
            case 'flip':
                score += 10;
                break;
            default:
                score += 5;
        }
    }

    // Unit preference scoring (+15 max)
    if (q.unit_type && q.unit_type !== 'not-sure') {
        score += 15;
    }

    // Location preference scoring (+10 max)
    if (q.preferred_location) {
        score += 10;
    }

    // Urgency scoring (+15 max)
    if (q.urgency_level) {
        switch (q.urgency_level) {
            case 'high':
                score += 15;
                break;
            case 'medium':
                score += 10;
                break;
            default:
                score += 0;
        }
    }

    // Cap at 100
    return Math.min(100, Math.max(0, score));
}

/**
 * Determine category based on score
 */
function getCategoryFromScore(score) {
    if (score >= HOT_LEAD_THRESHOLD) return 'hot';
    if (score >= WARM_LEAD_THRESHOLD) return 'warm';
    return 'cold';
}

/**
 * Handle hot lead notification
 */
async function handleHotLeadNotification(orgId, leadId, oldScore, newScore) {
    if (oldScore < HOT_LEAD_THRESHOLD && newScore >= HOT_LEAD_THRESHOLD) {
        console.log(`[Lead ${leadId}] Reached HOT status!`);

        // Get lead and assigned agent
        const { data: lead } = await supabase
            .from('leads')
            .select('*, organisations(name)')
            .eq('id', leadId)
            .single();

        if (!lead) return;

        // Update status to hot_lead
        await supabase
            .from('leads')
            .update({ status: 'contacted' })
            .eq('id', leadId);

        // Find all org members to create in-app notifications
        const { data: members } = await supabase
            .from('org_members')
            .select('user_id')
            .eq('organisation_id', orgId);

        if (members && members.length > 0) {
            const notifications = members.map(m => ({
                organisation_id: orgId,
                user_id: m.user_id,
                type: 'lead_hot',
                title: '🔥 Hot Lead Alert!',
                message: `${lead.name} has reached HOT status (Score: ${newScore}). Immediate follow-up recommended!`,
                data: { lead_id: leadId, lead_name: lead.name, score: newScore }
            }));
            await supabase.from('notifications').insert(notifications).then(({ error }) => {
                if (error) console.warn('[HotLead] Notification insert failed:', error.message);
            });
        }

        // Send Telegram alerts to admin chat IDs stored in org_credentials.credentials.notification_chat_ids
        const { getAdminChatIds, sendOutboundTelegram } = require('./telegram');
        const adminChatIds = await getAdminChatIds(orgId);
        for (const chatId of adminChatIds) {
            try {
                await sendOutboundTelegram(
                    orgId,
                    chatId,
                    `🔥 *Hot Lead Alert!*\n\n*${lead.name}* just hit score ${newScore}/100.\n\nImmediate follow-up recommended!\n\nLead ID: \`${leadId}\``
                );
            } catch (e) {
                console.error('[HotLead] Failed to send Telegram alert:', e.message);
            }
        }
    }
}

/**
 * Update lead qualification data and score
 */
async function updateLeadQualification(orgId, leadId, qualificationData) {
    // Get current lead data
    const { data: lead } = await supabase
        .from('leads')
        .select('score, qualification_data, conversation_state')
        .eq('id', leadId)
        .single();

    if (!lead) return null;

    // Merge qualification data
    const newQualificationData = {
        ...(lead.qualification_data || {}),
        ...qualificationData
    };

    // Calculate new score — always from base to avoid double-counting
    const oldScore = lead.score || 30;
    const newScore = calculateScore(newQualificationData);
    const newCategory = getCategoryFromScore(newScore);

    // Determine conversation state
    let newState = 'qualifying';
    if (newCategory === 'hot') newState = 'hot';
    else if (newCategory === 'warm') newState = 'warm';
    else newState = 'cold';

    // Update lead
    const { error } = await supabase
        .from('leads')
        .update({
            score: newScore,
            category: newCategory,
            conversation_state: newState,
            qualification_data: newQualificationData,
            last_contacted_at: new Date().toISOString()
        })
        .eq('id', leadId);

    if (!error) {
        // Handle hot lead notification
        await handleHotLeadNotification(orgId, leadId, oldScore, newScore);
    }

    return { score: newScore, category: newCategory, state: newState };
}

/**
 * Get conversation history for context
 */
async function getConversationHistory(orgId, leadId, limit = 10) {
    const { data: messages } = await supabase
        .from('message_threads')
        .select('*')
        .eq('organisation_id', orgId)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
        .limit(limit);

    return messages || [];
}

/**
 * Process a single agent job
 */
async function processJob(job) {
    const { id: jobId, organisation_id: orgId, agent_type, payload, attempts, lead_id } = job;

    // ---------------------------------------------------------------
    // MASTER Agent (morning brief synthesis)
    // ---------------------------------------------------------------
    if (agent_type === 'master') {
        return await processMasterAgent(job);
    }

    // ---------------------------------------------------------------
    // GUARDIAN Agent — purchase request price analysis
    // ---------------------------------------------------------------
    if (agent_type === 'guardian') {
        return await processGuardianAgent(job);
    }

    // ---------------------------------------------------------------
    // Direct-dispatch jobs — no LiteLLM call needed
    // ---------------------------------------------------------------
    const DIRECT_DISPATCH_TYPES = [
        'send_payment_instructions',
        'send_expiry_notification',
        'send_payment_confirmation',
        'send_payment_rejection',
        'send_payment_reminder',
        'send_fallback_message',
        'generate_reservation_letter',
    ];

    if (DIRECT_DISPATCH_TYPES.includes(agent_type)) {
        return await processDirectDispatch(job);
    }

    console.log(`\n[Job ${jobId}] Processing ${agent_type} for org ${orgId}`);
    console.log(`[Job ${jobId}] Attempt: ${attempts + 1} of ${MAX_ATTEMPTS}`);

    let llmConfig;
    try {
        // Get LLM config for this organisation and agent type
        llmConfig = await getLLMConfig(orgId, agent_type);
        const model = llmConfig.primary_model;

        // Get organisation name for system prompt
        const { data: org } = await supabase
            .from('organisations')
            .select('name')
            .eq('id', orgId)
            .single();
        const orgName = org?.name || 'Our Company';

        // Get system prompt
        const { prompt: systemPrompt, config: agentConfig } = await getSystemPrompt(orgId, agent_type);

        // Replace placeholders in system prompt
        const finalSystemPrompt = systemPrompt
            .replace(/{org_name}/g, orgName)
            .replace(/{agent_name}/g, 'Agent');

        // Build messages - for PRESELL, include conversation history
        let messages = [];

        if (agent_type === 'presell' && lead_id) {
            // Check guardrails first
            const guardrailCheck = await checkPresellGuardrails(orgId, lead_id);

            if (!guardrailCheck.allowed) {
                console.log(`[Job ${jobId}] Guardrail blocked: ${guardrailCheck.reason}`);

                if (guardrailCheck.wait_for_user) {
                    // Mark as completed but don't respond
                    await supabase
                        .from('agent_queue')
                        .update({
                            status: 'completed',
                            result: { blocked: true, reason: guardrailCheck.reason },
                            completed_at: new Date().toISOString()
                        })
                        .eq('id', jobId);
                    return;
                }
            }

            // Get conversation history for context
            const history = await getConversationHistory(orgId, lead_id, 10);

            // Build conversation context
            messages = [
                { role: 'system', content: finalSystemPrompt }
            ];

            // Add recent conversation history
            for (const msg of history) {
                const role = msg.direction === 'inbound' ? 'user' : 'assistant';
                messages.push({ role, content: msg.content });
            }

            // Add current user message
            const userMessage = payload.userMessage || payload.content || '';
            messages.push({ role: 'user', content: userMessage });
        } else {
            // Standard message building for non-presell
            messages = payload.messages || [
                { role: 'system', content: finalSystemPrompt },
                { role: 'user', content: payload.userMessage || '' }
            ];
        }

        // Define tools available to this agent
        const tools = defineAgentTools(agent_type);

        // Call LiteLLM — with fallback to secondary model if primary fails
        let response;
        let usedModel = model;
        const startTime = Date.now();

        console.log(`[Job ${jobId}] Calling LiteLLM with model: ${model}`);
        try {
            response = await callLiteLLM(messages, model, tools);
        } catch (primaryError) {
            const fallbackModel = llmConfig.fallback_model;
            if (fallbackModel && fallbackModel !== model) {
                console.warn(`[Job ${jobId}] Primary model failed (${primaryError.message}), falling back to ${fallbackModel}`);
                response = await callLiteLLM(messages, fallbackModel, tools);
                usedModel = fallbackModel;
            } else {
                throw primaryError;
            }
        }
        const duration = Date.now() - startTime;

        const assistantMessage = response.choices?.[0]?.message;
        const toolCalls = assistantMessage?.tool_calls || [];

        console.log(`[Job ${jobId}] LiteLLM response in ${duration}ms`);
        console.log(`[Job ${jobId}] Tool calls: ${toolCalls.length}`);

        // Process tool calls (max 10)
        const executedTools = [];
        let toolCallCount = 0;

        for (const toolCall of toolCalls) {
            if (toolCallCount >= MAX_TOOL_CALLS) {
                console.log(`[Job ${jobId}] Max tool calls (${MAX_TOOL_CALLS}) reached`);
                break;
            }

            try {
                const result = await executeTool(toolCall, orgId, job);
                executedTools.push({
                    tool: toolCall.function.name,
                    result: result
                });
                toolCallCount++;
            } catch (toolError) {
                console.error(`[Job ${jobId}] Tool error: ${toolError.message}`);
                executedTools.push({
                    tool: toolCall.function.name,
                    error: toolError.message
                });
            }
        }

        // Log to agent_logs
        await logAgentExecution(orgId, agent_type, {
            input_summary: messages[messages.length - 1]?.content?.substring(0, 200),
            output_summary: assistantMessage?.content?.substring(0, 200) || `Tool calls: ${toolCalls.length}`,
            tool_calls_json: JSON.stringify(executedTools),
            model_used: usedModel,
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0,
            cost_usd: calculateCost(usedModel, response.usage),
            duration_ms: duration,
            status: 'completed'
        });

        // Update lead conversation turns after processing (read from DB to avoid race)
        if (agent_type === 'presell' && lead_id) {
            const { data: currentLead } = await supabase
                .from('leads')
                .select('conversation_turns')
                .eq('id', lead_id)
                .single();
            await supabase
                .from('leads')
                .update({
                    conversation_turns: (currentLead?.conversation_turns || 0) + 1,
                    last_agent_message_at: new Date().toISOString()
                })
                .eq('id', lead_id);
        }

        // Update job as completed
        await supabase
            .from('agent_queue')
            .update({
                status: 'completed',
                result: {
                    message: assistantMessage?.content,
                    tool_calls: executedTools,
                    model: model
                },
                completed_at: new Date().toISOString()
            })
            .eq('id', jobId);

        console.log(`[Job ${jobId}] Completed successfully`);

    } catch (error) {
        console.error(`[Job ${jobId}] Error: ${error.message}`);

        // Log error
        await logAgentExecution(orgId, agent_type, {
            input_summary: 'Job processing failed',
            output_summary: error.message,
            tool_calls_json: '[]',
            model_used: llmConfig?.primary_model || 'unknown',
            cost_usd: 0,
            duration_ms: 0,
            status: 'failed'
        });

        // Handle retry logic
        if (attempts + 1 >= MAX_ATTEMPTS) {
            console.log(`[Job ${jobId}] Max attempts reached, marking as FAILED`);
            await supabase
                .from('agent_queue')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    attempts: attempts + 1,
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);
        } else {
            // Schedule retry in 5 minutes
            console.log(`[Job ${jobId}] Scheduling retry in 5 minutes`);
            await supabase
                .from('agent_queue')
                .update({
                    status: 'pending',
                    attempts: attempts + 1,
                    error_message: error.message
                })
                .eq('id', jobId);
        }
    }
}

/**
 * Define tools available to each agent type
 */
function defineAgentTools(agentType) {
    const baseTools = [
        {
            type: 'function',
            function: {
                name: 'send_whatsapp_message',
                description: 'Send a WhatsApp message to a lead',
                parameters: {
                    type: 'object',
                    properties: {
                        phone: { type: 'string', description: 'Phone number with country code' },
                        message: { type: 'string', description: 'Message to send' }
                    },
                    required: ['phone', 'message']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_telegram_message',
                description: 'Send a Telegram message to a lead',
                parameters: {
                    type: 'object',
                    properties: {
                        chat_id: { type: 'string', description: 'Telegram chat ID' },
                        message: { type: 'string', description: 'Message to send' }
                    },
                    required: ['chat_id', 'message']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_lead_score',
                description: 'Update a lead\'s score and category',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string', description: 'Lead UUID' },
                        score: { type: 'number', description: 'Score 0-100' },
                        category: { type: 'string', description: 'Category: cold, warm, hot' }
                    },
                    required: ['lead_id', 'score']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_lead_status',
                description: 'Update a lead\'s status',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string', description: 'Lead UUID' },
                        status: { type: 'string', description: 'Status: new, contacted, qualified, proposal, negotiation, won, lost' }
                    },
                    required: ['lead_id', 'status']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'log_message',
                description: 'Log a message to the message thread',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string', description: 'Lead UUID' },
                        direction: { type: 'string', description: 'inbound or outbound' },
                        content: { type: 'string', description: 'Message content' }
                    },
                    required: ['lead_id', 'direction', 'content']
                }
            }
        }
    ];

    // Add agent-specific tools
    if (agentType === 'presell') {
        return [...baseTools,
        {
            type: 'function',
            function: {
                name: 'update_lead_qualification',
                description: 'Update lead qualification data and recalculate score based on extracted signals',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string', description: 'Lead UUID' },
                        budget_min: { type: 'number', description: 'Minimum budget in Naira' },
                        budget_max: { type: 'number', description: 'Maximum budget in Naira' },
                        timeline: { type: 'string', description: 'Timeline: immediate, 1-3months, 3-6months, 6-12months, unsure' },
                        investment_type: { type: 'string', description: 'Investment type: owner-occupier, buy-to-let, flip, not-sure' },
                        unit_type: { type: 'string', description: 'Unit type: flat, house, land, commercial, not-sure' },
                        preferred_location: { type: 'string', description: 'Preferred location/area' },
                        urgency_level: { type: 'string', description: 'Urgency: high, medium, low' }
                    },
                    required: ['lead_id']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_property_media',
                description: 'Get property media (images, floor plans, brochures) for sharing with leads',
                parameters: {
                    type: 'object',
                    properties: {
                        bucket: { type: 'string', description: 'Bucket name: property-renders, floor-plans, brochures' },
                        folder: { type: 'string', description: 'Optional folder within bucket' }
                    },
                    required: ['bucket']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'send_telegram_photo',
                description: 'Send a property photo or media file to a lead via Telegram using a public URL',
                parameters: {
                    type: 'object',
                    properties: {
                        chat_id: { type: 'string', description: 'Telegram chat ID' },
                        photo_url: { type: 'string', description: 'Public URL of the photo/image to send' },
                        caption: { type: 'string', description: 'Optional caption for the photo' }
                    },
                    required: ['chat_id', 'photo_url']
                }
            }
        }];
    }

    if (agentType === 'guardian') {
        // Guardian uses deterministic processGuardianAgent — no LiteLLM tools needed
        return [];
    }

    // MASTER agent has no LiteLLM tools — it uses direct synthesis
    if (agentType === 'master') {
        return [];
    }

    return baseTools;
}

// ================================================================
// MASTER AGENT — Morning Brief Synthesis
// ================================================================
async function processMasterAgent(job) {
    const { id: jobId, organisation_id: orgId, payload, attempts } = job;
    const overnightData = payload.overnight_data || {};
    const orgName = payload.org_name || 'Your Organisation';
    const hasActivity = payload.has_activity !== false;
    const startTime = Date.now();

    console.log(`[MASTER ${jobId}] Processing morning brief for org ${orgId}`);

    try {
        await supabase.from('agent_queue').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', jobId);

        // Zero-activity short circuit
        if (!hasActivity) {
            await sendMasterBrief(orgId, 'All clear — nothing requires attention.');
            await supabase.from('agent_queue').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
            return;
        }

        // Build synthesis prompt
        const summaryData = overnightData.summary || {};
        const dataSnippet = JSON.stringify({
            new_leads: (overnightData.new_leads || []).slice(0, MAX_BRIEF_ITEMS_PER_CATEGORY).map(l => ({ name: l.name, score: l.score, status: l.status })),
            hot_leads_needing_attention: (overnightData.hot_leads_needing_attention || []).slice(0, MAX_BRIEF_ITEMS_PER_CATEGORY).map(l => ({ name: l.name, score: l.score })),
            confirmed_payments: (overnightData.confirmed_payments || []).slice(0, MAX_BRIEF_ITEMS_PER_CATEGORY).map(p => ({ amount_kobo: p.amount_kobo })),
            pending_payments: (overnightData.pending_payments || []).slice(0, MAX_BRIEF_ITEMS_PER_CATEGORY),
            new_reservations: (overnightData.new_reservations || []).slice(0, MAX_BRIEF_ITEMS_PER_CATEGORY),
            summary: summaryData,
        }, null, 2);

        const messages = [
            {
                role: 'system',
                content: `You are MASTER, the chief of staff AI for ${orgName}'s real estate operations. ` +
                    `Every morning you deliver a concise daily brief to the team. ` +
                    `Focus on 2-3 key decisions or actions needed. ` +
                    `Use plain text (no markdown too heavy), keep it under 800 words. ` +
                    `Format: 📋 GOOD MORNING BRIEF → Key Decisions → Other Updates → All Clear Items. ` +
                    `Do NOT mention internal IDs. Use lead names, amounts in NGN (divide kobo by 100).`
            },
            {
                role: 'user',
                content: `Overnight data for ${new Date().toDateString()}:\n\n${dataSnippet}\n\nSynthesize into a morning brief.`
            }
        ];

        let response;
        let usedModel = 'gpt-4o-mini';
        try {
            response = await callLiteLLM(messages, 'gpt-4o-mini');
        } catch (primaryErr) {
            console.warn(`[MASTER] GPT-4o-mini failed (${primaryErr.message}), falling back to claude-3-5-haiku`);
            response = await callLiteLLM(messages, 'claude-3-5-haiku');
            usedModel = 'claude-3-5-haiku';
        }

        let briefText = response.choices?.[0]?.message?.content || 'Brief generation returned empty. Check dashboard.';

        // Truncate if > 4096 chars
        if (briefText.length > MAX_BRIEF_CHARS) {
            briefText = briefText.substring(0, MAX_BRIEF_CHARS - 100) +
                `\n\n...\n[Brief truncated — top ${MAX_BRIEF_ITEMS_PER_CATEGORY} items per category shown. See full dashboard for details.]`;
        }

        await sendMasterBrief(orgId, briefText);

        const duration = Date.now() - startTime;
        await logAgentExecution(orgId, 'master', {
            input_summary: `Morning brief for ${orgName} — ${JSON.stringify(summaryData)}`,
            output_summary: briefText.substring(0, 300),
            tool_calls_json: '[]',
            model_used: usedModel,
            input_tokens: response.usage?.prompt_tokens || 0,
            output_tokens: response.usage?.completion_tokens || 0,
            cost_usd: calculateCost(usedModel, response.usage),
            duration_ms: duration,
            status: 'completed'
        });

        await supabase.from('agent_queue').update({
            status: 'completed',
            result: { brief: briefText.substring(0, 500), model: usedModel },
            completed_at: new Date().toISOString()
        }).eq('id', jobId);

    } catch (err) {
        console.error(`[MASTER ${jobId}] Error:`, err.message);
        // Fallback message
        try { await sendMasterBrief(orgId, 'Brief generation failed. Check dashboard.'); } catch (_) { }

        if (attempts + 1 >= MAX_ATTEMPTS) {
            await supabase.from('agent_queue').update({ status: 'failed', error_message: err.message, completed_at: new Date().toISOString() }).eq('id', jobId);
        } else {
            await supabase.from('agent_queue').update({ status: 'pending', attempts: attempts + 1, error_message: err.message }).eq('id', jobId);
        }
    }
}

/** Send master brief to all admin chat IDs (Telegram) */
async function sendMasterBrief(orgId, text) {
    const { getAdminChatIds, sendOutboundTelegram } = require('./telegram');
    const chatIds = await getAdminChatIds(orgId);
    for (const chatId of chatIds) {
        try {
            await sendOutboundTelegram(orgId, chatId, text);
        } catch (e) {
            console.error(`[MASTER] Telegram send failed for chatId ${chatId}:`, e.message);
        }
    }
}

// ================================================================
// DIRECT DISPATCH — Non-LLM job handlers
// ================================================================
async function processDirectDispatch(job) {
    const { id: jobId, organisation_id: orgId, agent_type, payload, attempts } = job;
    console.log(`[DirectDispatch ${jobId}] ${agent_type}`);

    try {
        await supabase.from('agent_queue').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', jobId);

        let result;

        switch (agent_type) {

            case 'send_payment_instructions': {
                const { lead_id, reservation_id, reference_code, expires_at, unit_id } = payload;

                // Get lead + unit info
                const { data: lead } = await supabase.from('leads').select('name, phone, telegram_chat_id, email').eq('id', lead_id).single();
                const { data: unit } = await supabase.from('units').select('unit_number, unit_type, floor, price_kobo').eq('id', unit_id).single();
                const { data: org } = await supabase.from('organisations').select('name').eq('id', orgId).single();

                const amountNGN = unit ? (unit.price_kobo / 100).toLocaleString('en-NG') : '(see below)';
                const expiryDate = new Date(expires_at).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });
                const msgText = [
                    `🏠 *Reservation Confirmed!*`,
                    ``,
                    `Dear ${lead?.name || 'Valued Customer'},`,
                    ``,
                    `Your unit has been reserved:`,
                    `📍 Unit ${unit?.unit_number || ''} (${unit?.unit_type || ''}, Floor ${unit?.floor || 'N/A'})`,
                    `💰 Price: ₦${amountNGN}`,
                    ``,
                    `*Reference Code:* \`${reference_code}\``,
                    `*Expires:* ${expiryDate}`,
                    ``,
                    `To confirm your reservation, please make your deposit payment and use the reference code above.`,
                    `Our team will confirm your payment within 24 hours.`,
                    ``,
                    `— ${org?.name || 'Sales Team'}`
                ].join('\n');

                // Send via Telegram if chat_id known
                if (lead?.telegram_chat_id) {
                    const { sendOutboundTelegram } = require('./telegram');
                    await sendOutboundTelegram(orgId, lead.telegram_chat_id, msgText);
                }

                // Send via email if Resend configured and email known
                if (RESEND_API_KEY && lead?.email) {
                    await sendEmailViaResend(lead.email, `Reservation Confirmed — Ref: ${reference_code}`, msgText.replace(/\*/g, '').replace(/`/g, ''));
                }

                result = { sent: true, channels: ['telegram', 'email'], reference_code };
                break;
            }

            case 'send_expiry_notification': {
                const { lead_id, reference_code } = payload;
                const { data: lead } = await supabase.from('leads').select('name, telegram_chat_id').eq('id', lead_id).single();

                const text = `⚠️ *Reservation Expired*\n\nDear ${lead?.name || 'Customer'}, your reservation (Ref: ${reference_code}) has expired as payment was not received in time.\n\nPlease contact us if you wish to re-reserve a unit.`;

                if (lead?.telegram_chat_id) {
                    const { sendOutboundTelegram } = require('./telegram');
                    await sendOutboundTelegram(orgId, lead.telegram_chat_id, text);
                }
                result = { sent: true, lead_id, reference_code };
                break;
            }

            case 'send_payment_confirmation': {
                const { buyer_id, amount_kobo } = payload;
                const { data: buyer } = await supabase.from('buyers').select('*, leads(name, telegram_chat_id)').eq('id', buyer_id).single();

                const amountNGN = ((amount_kobo || 0) / 100).toLocaleString('en-NG');
                const text = `✅ *Payment Confirmed!*\n\nDear ${buyer?.leads?.name || 'Customer'}, we have confirmed your payment of ₦${amountNGN}.\n\nThank you! Your Reservation Letter will be sent shortly.`;

                if (buyer?.leads?.telegram_chat_id) {
                    const { sendOutboundTelegram } = require('./telegram');
                    await sendOutboundTelegram(orgId, buyer.leads.telegram_chat_id, text);
                }
                result = { sent: true, buyer_id };
                break;
            }

            case 'send_payment_rejection': {
                const { buyer_id, reason } = payload;
                const { data: buyer } = await supabase.from('buyers').select('*, leads(name, telegram_chat_id)').eq('id', buyer_id).single();

                const text = `❌ *Payment Not Confirmed*\n\nDear ${buyer?.leads?.name || 'Customer'}, we were unable to confirm your payment.\n\n*Reason:* ${reason || 'Please contact us for details.'}\n\nThe unit has been released. Please contact our team to discuss next steps.`;

                if (buyer?.leads?.telegram_chat_id) {
                    const { sendOutboundTelegram } = require('./telegram');
                    await sendOutboundTelegram(orgId, buyer.leads.telegram_chat_id, text);
                }
                result = { sent: true, buyer_id };
                break;
            }

            case 'send_payment_reminder': {
                const { buyer_id, lead_id: reminderLeadId, days_until_due, due_date, total_amount_kobo, amount_kobo, instalment_number, urgent } = payload;
                const { data: lead } = await supabase.from('leads').select('name, telegram_chat_id').eq('id', reminderLeadId).single();

                const amount = total_amount_kobo || amount_kobo || 0;
                const amountNGN = (amount / 100).toLocaleString('en-NG');
                const urgentFlag = urgent ? '🚨 URGENT: ' : '⏰ Reminder: ';
                const text = `${urgentFlag}*Payment Due in ${days_until_due} Days*\n\nDear ${lead?.name || 'Customer'},\n\nYour payment of ₦${amountNGN} is due on ${due_date}.\n\nPlease ensure timely payment to avoid any impact on your reservation.\n\nContact us if you need assistance.`;

                if (lead?.telegram_chat_id) {
                    const { sendOutboundTelegram } = require('./telegram');
                    await sendOutboundTelegram(orgId, lead.telegram_chat_id, text);
                }
                result = { sent: true, buyer_id, days_until_due };
                break;
            }

            case 'generate_reservation_letter': {
                result = await generateReservationLetterPDF(orgId, payload);
                break;
            }

            case 'send_fallback_message': {
                const { text: fallbackText, message } = payload;
                const briefText = fallbackText || message || 'Brief generation failed. Check dashboard.';
                await sendMasterBrief(orgId, briefText);
                result = { sent: true };
                break;
            }

            default:
                throw new Error(`Unknown direct dispatch type: ${agent_type}`);
        }

        await supabase.from('agent_queue').update({
            status: 'completed',
            result,
            completed_at: new Date().toISOString()
        }).eq('id', jobId);

        console.log(`[DirectDispatch ${jobId}] ${agent_type} completed`);

    } catch (err) {
        console.error(`[DirectDispatch ${jobId}] Error:`, err.message);

        if (attempts + 1 >= MAX_ATTEMPTS) {
            await supabase.from('agent_queue').update({ status: 'failed', error_message: err.message, attempts: attempts + 1, completed_at: new Date().toISOString() }).eq('id', jobId);
        } else {
            await supabase.from('agent_queue').update({ status: 'pending', attempts: attempts + 1, error_message: err.message }).eq('id', jobId);
        }
    }
}

// ================================================================
// PDF GENERATION — Reservation Letter
// ================================================================
async function generateReservationLetterPDF(orgId, payload) {
    const PDFDocument = requirePdfKit();
    if (!PDFDocument) {
        // pdfkit not installed — mark document as failed and log
        await supabase.from('documents').update({ status: 'failed' })
            .eq('reservation_id', payload.reservation_id).eq('document_type', 'reservation_letter');
        // Alert admins
        await sendMasterBrief(orgId, `⚠️ PDF generation failed: pdfkit not installed. Run \`npm install pdfkit\` on the agent worker.`);
        return { success: false, reason: 'pdfkit not installed' };
    }

    const { buyer_id, reservation_id } = payload;

    // Fetch all needed data
    const { data: reservation } = await supabase
        .from('reservations')
        .select('*, units(unit_number, unit_type, floor, price_kobo), buyers(*, leads(name, phone, email))')
        .eq('id', reservation_id).single();

    const { data: org } = await supabase.from('organisations').select('name, settings').eq('id', orgId).single();

    if (!reservation) {
        throw new Error(`Reservation ${reservation_id} not found for PDF generation`);
    }

    const buyerName = reservation.buyers?.leads?.name || 'Valued Customer';
    const buyerPhone = reservation.buyers?.leads?.phone || '';
    const unitNumber = reservation.units?.unit_number || 'N/A';
    const unitType = reservation.units?.unit_type || 'N/A';
    const floor = reservation.units?.floor || 'N/A';
    const priceNGN = ((reservation.units?.price_kobo || 0) / 100).toLocaleString('en-NG');
    const refCode = reservation.reference_code || 'N/A';
    const expiryDate = reservation.expires_at ? new Date(reservation.expires_at).toLocaleDateString('en-NG') : 'N/A';
    const orgName = org?.name || 'DEVOS';
    const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    // Generate PDF to temp
    const tmpPath = path.join(os.tmpdir(), `reservation_${reservation_id}_${Date.now()}.pdf`);

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 60 });
        const stream = fs.createWriteStream(tmpPath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text(orgName, { align: 'center' });
        doc.fontSize(14).font('Helvetica').text('RESERVATION LETTER', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Date: ${today}`, { align: 'right' });
        doc.text(`Reference: ${refCode}`, { align: 'right' });
        doc.moveDown();

        // Addressee
        doc.fontSize(11).font('Helvetica-Bold').text('Dear ' + buyerName + ',');
        doc.moveDown(0.5);
        doc.font('Helvetica').text(
            `We are pleased to confirm that the following unit has been reserved in your name. ` +
            `Please review the details below and make your deposit payment using the reference code provided.`
        );
        doc.moveDown();

        // Unit details
        doc.font('Helvetica-Bold').text('UNIT DETAILS');
        doc.moveTo(60, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica');
        const details = [
            ['Unit Number', unitNumber],
            ['Unit Type', unitType],
            ['Floor', floor.toString()],
            ['Sale Price', `₦${priceNGN}`],
            ['Reservation Ref', refCode],
            ['Reservation Expiry', expiryDate],
        ];
        for (const [label, value] of details) {
            doc.text(`${label}:`, 60, undefined, { continued: true, width: 200 });
            doc.text(value);
        }
        doc.moveDown();

        // Payment instructions
        doc.font('Helvetica-Bold').text('PAYMENT INSTRUCTIONS');
        doc.moveTo(60, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica').text(
            `To secure your reservation, please make your deposit payment and include the reference code \"${refCode}\" ` +
            `in your payment description. Send your payment receipt to our sales team for confirmation.`
        );
        doc.moveDown();

        // Footer
        doc.fontSize(9).fillColor('grey');
        doc.text('This letter is computer-generated and valid without a physical signature.', { align: 'center' });
        doc.text(`${orgName} — Generated by DEVOS`, { align: 'center' });

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    // Validate file size
    const stats = fs.statSync(tmpPath);
    if (stats.size === 0) {
        fs.unlinkSync(tmpPath);
        throw new Error('Generated PDF is empty');
    }

    // Upload to Supabase Storage
    const storagePath = `documents/${orgId}/reservation_${reservation_id}.pdf`;
    const fileBuffer = fs.readFileSync(tmpPath);

    const { error: uploadErr } = await supabase.storage
        .from('documents')
        .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath);
    const fileUrl = urlData.publicUrl;

    // Update documents table
    await supabase.from('documents')
        .update({ status: 'ready', file_url: fileUrl })
        .eq('reservation_id', reservation_id)
        .eq('document_type', 'reservation_letter');

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch (_) { }

    console.log(`[PDF] Reservation letter generated for ${reservation_id}: ${fileUrl}`);
    return { success: true, file_url: fileUrl, reservation_id };
}

/**
 * Send email via Resend API
 */
async function sendEmailViaResend(toEmail, subject, bodyText) {
    if (!RESEND_API_KEY) return { skipped: true, reason: 'RESEND_API_KEY not configured' };

    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            from: 'noreply@devos.app',
            to: [toEmail],
            subject,
            text: bodyText,
        });

        const options = {
            hostname: 'api.resend.com',
            port: 443,
            path: '/emails',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (_) { resolve({ raw: data }); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

/**
 * Execute a tool call
 */
async function executeTool(toolCall, orgId, job) {
    const { name, arguments: args } = toolCall.function;
    const params = JSON.parse(args);

    console.log(`Executing tool: ${name}`, params);

    switch (name) {
        case 'send_whatsapp_message':
            return await sendWhatsAppMessage(orgId, params.phone, params.message);

        case 'send_telegram_message':
            return await sendTelegramMessage(orgId, params.chat_id, params.message);

        case 'send_telegram_photo':
            return await sendTelegramPhoto(orgId, params.chat_id, params.photo_url, params.caption);

        case 'update_lead_score':
            return await updateLeadScore(orgId, params.lead_id, params.score, params.category);

        case 'update_lead_status':
            return await updateLeadStatus(orgId, params.lead_id, params.status);

        case 'update_lead_qualification':
            return await updateLeadQualification(orgId, params.lead_id, {
                budget_range: params.budget_min || params.budget_max ? {
                    min: params.budget_min || 0,
                    max: params.budget_max || params.budget_min || 0,
                    currency: 'NGN'
                } : null,
                timeline: params.timeline,
                investment_type: params.investment_type,
                unit_type: params.unit_type,
                preferred_location: params.preferred_location,
                urgency_level: params.urgency_level
            });

        case 'get_property_media':
            return await getPropertyMedia(orgId, params.bucket, params.folder);

        case 'log_message':
            return await logMessage(orgId, params.lead_id, params.direction, params.content, job.payload?.channel);

        case 'analyze_invoice':
            return await analyzeInvoice(orgId, params.invoice_id);

        case 'lookup_price_index':
            return await lookupPriceIndex(params.material_name, params.region);

        case 'check_budget_impact':
            return await checkBudgetImpact(orgId, params.phase_id, params.total_kobo);

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

/**
 * Tool implementations
 */
async function sendWhatsAppMessage(orgId, phone, message) {
    // Get WhatsApp credentials for org
    const { data: creds } = await supabase
        .from('org_credentials')
        .select('encrypted_credentials')
        .eq('organisation_id', orgId)
        .eq('provider', 'whatsapp')
        .single();

    if (!creds) {
        throw new Error('WhatsApp credentials not configured for this organisation');
    }

    // In production, would call WhatsApp API here
    // For now, just log
    console.log(`[WhatsApp] Would send to ${phone}: ${message}`);

    return { success: true, channel: 'whatsapp', phone, message };
}

async function sendTelegramMessage(orgId, chatId, message) {
    const { sendOutboundTelegram } = require('./telegram');
    return await sendOutboundTelegram(orgId, chatId, message);
}

async function sendTelegramPhoto(orgId, chatId, photoUrl, caption = '') {
    const { sendOutboundTelegramPhoto } = require('./telegram');
    return await sendOutboundTelegramPhoto(orgId, chatId, photoUrl, caption);
}

async function updateLeadScore(orgId, leadId, score, category) {
    const { error } = await supabase
        .from('leads')
        .update({ score, category })
        .eq('id', leadId)
        .eq('organisation_id', orgId);

    if (error) throw error;

    // If score >= 70, escalate to hot lead
    if (score >= 70) {
        await supabase
            .from('leads')
            .update({ status: 'hot_lead' })
            .eq('id', leadId);
    }

    return { success: true, lead_id: leadId, score, category };
}

async function updateLeadStatus(orgId, leadId, status) {
    const { error } = await supabase
        .from('leads')
        .update({ status })
        .eq('id', leadId)
        .eq('organisation_id', orgId);

    if (error) throw error;

    return { success: true, lead_id: leadId, status };
}

async function logMessage(orgId, leadId, direction, content, channel = 'telegram') {
    const { error } = await supabase
        .from('message_threads')
        .insert({
            organisation_id: orgId,
            lead_id: leadId,
            channel: channel,
            direction,
            content,
            is_agent_message: direction === 'outbound',
            delivered_at: new Date().toISOString()
        });

    if (error) throw error;

    return { success: true };
}

/**
 * Get property media from storage
 */
async function getPropertyMedia(orgId, bucket, folder = '') {
    const path = folder ? `${orgId}/${folder}` : orgId;

    const { data, error } = await supabase
        .storage
        .from(bucket)
        .list(path, { limit: 20 });

    if (error) {
        return { success: false, error: error.message, files: [] };
    }

    // Get public URLs
    const files = data.map(file => {
        const { data: urlData } = supabase
            .storage
            .from(bucket)
            .getPublicUrl(`${path}/${file.name}`);

        return {
            name: file.name,
            url: urlData.publicUrl,
            size: file.size,
            updated_at: file.updated_at
        };
    });

    return { success: true, bucket, files };
}

async function analyzeInvoice(orgId, invoiceId) {
    // GUARDIAN invoice analysis logic
    const { data: invoice } = await supabase
        .from('invoices')
        .select('*, contractors(*), projects(*), budget_phases(*)')
        .eq('id', invoiceId)
        .single();

    // Run analysis checks...
    const flags = [];

    // Check 1: Rate vs contract
    if (invoice.contractors?.contract_rate_kobo) {
        const requestedRate = invoice.amount_kobo;
        const contractRate = invoice.contractors.contract_rate_kobo;
        if (requestedRate > contractRate * 1.05) {
            flags.push({
                severity: 'WARNING',
                check_type: 'rate_vs_contract',
                details: `Requested rate ${requestedRate} exceeds contract rate ${contractRate} by >5%`
            });
        }
    }

    return {
        invoice_id: invoiceId,
        flags,
        recommendation: flags.length === 0 ? 'APPROVE' : 'REVIEW'
    };
}

/**
 * Log agent execution to database
 */
async function logAgentExecution(orgId, agentType, logData) {
    const { error } = await supabase
        .from('agent_logs')
        .insert({
            organisation_id: orgId,
            agent_type: agentType,
            event_type: 'tool_call',
            ...logData
        });

    if (error) {
        console.error('Failed to log agent execution:', error);
    }
}

/**
 * Calculate cost based on model and token usage
 */
function calculateCost(model, usage) {
    if (!usage) return 0;

    const pricing = {
        'claude-3-5-haiku': { input: 0.0008, output: 0.004 },       // claude-3-5-haiku (2024)
        'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
        'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
        'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
        'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
        'gpt-4o': { input: 0.0025, output: 0.01 }
    };

    const rates = pricing[model] || { input: 0.001, output: 0.001 };
    const inputCost = (usage.prompt_tokens / 1000) * rates.input;
    const outputCost = (usage.completion_tokens / 1000) * rates.output;

    return inputCost + outputCost;
}

// ================================================================
// GUARDIAN AGENT — Purchase Request Price Analysis
// ================================================================

// Flag thresholds: ≤5% CLEAR, 5.1-15% INFO, 15.1-30% WARNING, >30% CRITICAL
function calcPriceFlag(deviationPct) {
    if (deviationPct <= 5) return 'CLEAR';
    if (deviationPct <= 15) return 'INFO';
    if (deviationPct <= 30) return 'WARNING';
    return 'CRITICAL';
}

async function lookupPriceIndex(materialName, region = 'Lagos') {
    const { data } = await supabase
        .from('price_index')
        .select('material_name, unit, rate_kobo, region, effective_date')
        .ilike('material_name', `%${materialName}%`)
        .eq('region', region)
        .order('effective_date', { ascending: false })
        .limit(3);
    return data || [];
}

async function checkBudgetImpact(orgId, phaseId, totalKobo) {
    if (!phaseId) return null;
    const { data: phase } = await supabase
        .from('budget_phases')
        .select('phase_name, category, allocated_kobo, spent_kobo, contingency_pct')
        .eq('id', phaseId)
        .eq('organisation_id', orgId)
        .single();
    if (!phase) return null;
    const contingencyBuffer = phase.allocated_kobo * ((phase.contingency_pct || 0) / 100);
    const effectiveCeiling = phase.allocated_kobo + contingencyBuffer;
    const remainingKobo = effectiveCeiling - phase.spent_kobo;
    return {
        phase_name: phase.phase_name,
        allocated_kobo: phase.allocated_kobo,
        spent_kobo: phase.spent_kobo,
        contingency_pct: phase.contingency_pct || 0,
        effective_ceiling_kobo: effectiveCeiling,
        remaining_kobo: remainingKobo,
        total_cost_kobo: totalKobo,
        would_breach: totalKobo > remainingKobo,
        utilisation_pct: Math.round(((phase.spent_kobo + totalKobo) / effectiveCeiling) * 100),
    };
}

async function processGuardianAgent(job) {
    const { id: jobId, organisation_id: orgId, payload, attempts } = job;
    const {
        purchase_request_id, material_name, quantity,
        unit = 'item', unit_rate_kobo, phase_id,
    } = payload;

    await supabase.from('agent_queue')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', jobId);

    const startTime = Date.now();

    try {
        console.log(`[GUARDIAN ${jobId}] Analyzing PR ${purchase_request_id}`);

        // Fetch org for region + settings
        const { data: org } = await supabase.from('organisations')
            .select('name, settings').eq('id', orgId).single();
        const region = org?.settings?.region || 'Lagos';
        const autoApproveEnabled = org?.settings?.auto_approve_enabled !== false;

        // 1. Price index lookup
        const priceEntries = await lookupPriceIndex(material_name, region);

        let priceAnalysis = null;
        let priceFlag = 'INFO';

        if (priceEntries.length > 0) {
            const marketRate = priceEntries[0].rate_kobo;
            const deviation = ((unit_rate_kobo - marketRate) / marketRate) * 100;
            priceFlag = calcPriceFlag(deviation);
            priceAnalysis = {
                market_rate_kobo: marketRate,
                submitted_rate_kobo: unit_rate_kobo,
                deviation_pct: Math.round(deviation * 100) / 100,
                flag: priceFlag,
                reference_material: priceEntries[0].material_name,
                effective_date: priceEntries[0].effective_date,
            };
        }

        // 2. Budget impact check
        const totalKobo = quantity * unit_rate_kobo;
        const budgetAnalysis = await checkBudgetImpact(orgId, phase_id, totalKobo);

        // 3. Determine overall flag (worst of price + budget)
        let guardianFlag = priceFlag;
        if (budgetAnalysis?.would_breach) guardianFlag = 'CRITICAL';

        // 4. LiteLLM narrative (Claude Sonnet primary, GPT-4o fallback)
        let narrative = '';
        try {
            const llmConfig = await getLLMConfig(orgId, 'guardian');
            const primaryModel = llmConfig?.primary_model || 'claude-sonnet-4-5';
            const fallbackModel = llmConfig?.fallback_model || 'gpt-4o';

            const contextSummary = JSON.stringify({
                material: material_name,
                quantity,
                unit,
                submitted_rate_kobo: unit_rate_kobo,
                price_analysis: priceAnalysis,
                budget_analysis: budgetAnalysis,
                overall_flag: guardianFlag,
            }, null, 2);

            const msgs = [
                {
                    role: 'system',
                    content: `You are GUARDIAN, a construction procurement compliance agent for a Nigerian real estate developer.
Write a concise 2-3 sentence analysis of this purchase request.
Be direct: state the flag level, the reason, and whether action is required.
Use ₦ for currency. Quote deviation percentages and budget figures.`,
                },
                { role: 'user', content: `Analyze:\n${contextSummary}` },
            ];

            let resp;
            try {
                resp = await callLiteLLM(msgs, primaryModel);
            } catch {
                resp = await callLiteLLM(msgs, fallbackModel);
            }
            narrative = resp.choices?.[0]?.message?.content || '';
        } catch (e) {
            // Fallback narrative
            const devStr = priceAnalysis ? ` Price deviation: ${priceAnalysis.deviation_pct.toFixed(1)}%.` : '';
            const budgStr = budgetAnalysis?.would_breach ? ' BUDGET CEILING WOULD BE BREACHED.' : '';
            narrative = `GUARDIAN flag: ${guardianFlag}.${devStr}${budgStr} ${guardianFlag === 'CRITICAL' ? 'Auto-rejected.' : guardianFlag === 'CLEAR' ? 'All checks passed.' : 'Pending developer review.'}`;
        }

        // 5. Determine auto action
        let autoAction = null;
        if (guardianFlag === 'CRITICAL') {
            autoAction = 'rejected';
        } else if (autoApproveEnabled && guardianFlag === 'CLEAR') {
            autoAction = 'approved';
        }

        const analysis = {
            flag: guardianFlag,
            price_analysis: priceAnalysis,
            budget_analysis: budgetAnalysis,
            narrative,
            analyzed_at: new Date().toISOString(),
            auto_action: autoAction,
        };

        // 6. Update purchase request
        const prUpdate = {
            guardian_analysis: analysis,
            guardian_flag: guardianFlag,
            updated_at: new Date().toISOString(),
        };
        if (autoAction) prUpdate.status = autoAction;

        await supabase.from('purchase_requests').update(prUpdate).eq('id', purchase_request_id);

        // 7. If auto-approved → create payment ticket
        if (autoAction === 'approved') {
            const refCode = `PT-${Date.now().toString(36).toUpperCase()}-AUTO`;
            await supabase.from('approvals').insert({
                organisation_id: orgId,
                reference_type: 'purchase_request',
                reference_id: purchase_request_id,
                action: 'approved',
                notes: `Auto-approved by GUARDIAN. Flag: ${guardianFlag}`,
            });
            await supabase.from('payment_tickets').insert({
                organisation_id: orgId,
                purchase_request_id,
                amount_kobo: totalKobo,
                reference_code: refCode,
                status: 'pending',
                generated_by: payload.submitted_by,
                generated_at: new Date().toISOString(),
            });
            console.log(`[GUARDIAN ${jobId}] Auto-approved → ticket ${refCode}`);
        }

        // 8. If CRITICAL → auto-rejected, log
        if (autoAction === 'rejected') {
            await supabase.from('approvals').insert({
                organisation_id: orgId,
                reference_type: 'purchase_request',
                reference_id: purchase_request_id,
                action: 'rejected',
                notes: `Auto-rejected by GUARDIAN. Flag: CRITICAL. ${priceAnalysis ? `Deviation: ${priceAnalysis.deviation_pct.toFixed(1)}%.` : ''} ${budgetAnalysis?.would_breach ? 'Budget breach.' : ''}`,
            });
            console.log(`[GUARDIAN ${jobId}] Auto-rejected (CRITICAL)`);
        }

        const duration = Date.now() - startTime;
        await logAgentExecution(orgId, 'guardian', {
            input_summary: `PR ${purchase_request_id}: ${material_name} ×${quantity} @ ${(unit_rate_kobo / 100).toFixed(0)} kobo/${unit}`,
            output_summary: `Flag: ${guardianFlag}. Auto: ${autoAction || 'pending_review'}`,
            tool_calls_json: JSON.stringify([{ price_analysis: priceAnalysis, budget_analysis: budgetAnalysis }]),
            model_used: 'guardian',
            cost_usd: 0,
            duration_ms: duration,
            status: 'completed',
        });

        await supabase.from('agent_queue').update({
            status: 'completed',
            result: { flag: guardianFlag, auto_action: autoAction },
            completed_at: new Date().toISOString(),
        }).eq('id', jobId);

        console.log(`[GUARDIAN ${jobId}] Done. Flag: ${guardianFlag}, Auto: ${autoAction || 'none'}`);

    } catch (error) {
        console.error(`[GUARDIAN ${jobId}] Error: ${error.message}`);
        await supabase.from('agent_queue').update({
            status: attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending',
            error_message: error.message,
            attempts: attempts + 1,
            completed_at: new Date().toISOString(),
        }).eq('id', jobId);
    }
}

/**
 * Poll for pending jobs
 */
async function pollForJobs() {
    try {
        const { data: jobs, error } = await supabase
            .from('agent_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) {
            console.error('Poll error:', error);
            return;
        }

        if (jobs && jobs.length > 0) {
            // Mark as processing
            await supabase
                .from('agent_queue')
                .update({ status: 'processing', started_at: new Date().toISOString() })
                .eq('id', jobs[0].id);

            // Process the job
            await processJob(jobs[0]);
        }
    } catch (err) {
        console.error('Job polling error:', err);
    }
}

// Start Telegram bots
const { startTelegramBots } = require('./telegram');
startTelegramBots().catch(console.error);

// Start polling
console.log('\nWorker is now polling for jobs...\n');

setInterval(pollForJobs, POLL_INTERVAL);

// Initial poll
pollForJobs();