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
        return [...baseTools,
        {
            type: 'function',
            function: {
                name: 'analyze_invoice',
                description: 'Analyze an invoice for potential issues',
                parameters: {
                    type: 'object',
                    properties: {
                        invoice_id: { type: 'string', description: 'Invoice UUID' }
                    },
                    required: ['invoice_id']
                }
            }
        }
        ];
    }

    return baseTools;
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