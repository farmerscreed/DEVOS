/**
 * DEVOS Agent Engine Worker
 * 
 * This worker polls the agent_queue table, processes jobs via LiteLLM,
 * executes MCP tool calls, and writes results back.
 * 
 * Deploy on Railway/Fly.io (not Supabase Edge Functions due to 150s timeout)
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gvcadlzjpsfabrqkzdwt.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY || '';
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'https://api.litellm.ai';

// Max tool calls per invocation (hard cap as per spec)
const MAX_TOOL_CALLS = 10;
// Max retries
const MAX_ATTEMPTS = 3;
// Retry delay in ms
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

interface AgentQueueJob {
    id: string;
    organisation_id: string;
    agent_type: string;
    payload: Record<string, unknown>;
    status: string;
    attempts: number;
    max_attempts: number;
    result: Record<string, unknown>;
    error_message: string | null;
    lead_id: string | null;
}

interface LLMConfig {
    primary_provider: string;
    primary_model: string;
    fallback_provider: string;
    fallback_model: string;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function getLLMConfig(orgId: string, taskType: string): Promise<LLMConfig | null> {
    const { data } = await supabase
        .from('llm_config')
        .select('primary_provider, primary_model, fallback_provider, fallback_model')
        .eq('organisation_id', orgId)
        .eq('task_type', taskType)
        .single();
    return data;
}

async function getOrgContext(orgId: string, agentType: string): Promise<{ system_prompt: string; context_json: Record<string, unknown> } | null> {
    const { data } = await supabase
        .from('agent_context')
        .select('system_prompt, context_json')
        .eq('organisation_id', orgId)
        .eq('agent_type', agentType)
        .single();
    return data;
}

async function pollQueue(): Promise<void> {
    console.log('Polling agent_queue...');

    // Get pending jobs, ordered by priority then created_at
    const { data: jobs, error } = await supabase
        .from('agent_queue')
        .select('*')
        .eq('status', 'pending')
        .or('scheduled_for.is.null,scheduled_for.lt.' + new Date().toISOString())
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(10);

    if (error) {
        console.error('Error polling queue:', error);
        return;
    }

    if (!jobs || jobs.length === 0) {
        console.log('No pending jobs');
        return;
    }

    for (const job of jobs as AgentQueueJob[]) {
        await processJob(job);
    }
}

async function processJob(job: AgentQueueJob): Promise<void> {
    console.log(`Processing job ${job.id} (${job.agent_type}) for org ${job.organisation_id}`);

    // Mark as running
    await supabase
        .from('agent_queue')
        .update({ status: 'running', started_at: new Date().toISOString(), attempts: job.attempts + 1 })
        .eq('id', job.id);

    try {
        // Get LLM config
        const llmConfig = await getLLMConfig(job.organisation_id, job.agent_type);
        if (!llmConfig) {
            throw new Error(`No LLM config for task type: ${job.agent_type}`);
        }

        // Get agent context
        const agentContext = await getOrgContext(job.organisation_id, job.agent_type);

        // Build the prompt based on job payload
        const messages = buildMessages(job, agentContext);

        // Call LiteLLM
        const llmResponse = await callLiteLLM(llmConfig, messages);

        // Process tool calls (max 10)
        const toolCalls = llmResponse.tool_calls?.slice(0, MAX_TOOL_CALLS) || [];
        const toolResults = await executeToolCalls(toolCalls, job.organisation_id);

        // Update job as completed
        await supabase
            .from('agent_queue')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                result: {
                    response: llmResponse.content,
                    tool_calls: toolCalls.map((tc: any) => tc.function?.name || tc.name),
                    tool_results: toolResults,
                    model_used: llmConfig.primary_model,
                    provider: llmConfig.primary_provider
                }
            })
            .eq('id', job.id);

        // Log to agent_logs
        await logAgentExecution(job, llmConfig, llmResponse, toolResults);

    } catch (error: any) {
        console.error(`Error processing job ${job.id}:`, error);

        const newAttempts = job.attempts + 1;

        if (newAttempts >= job.max_attempts) {
            // Mark as failed
            await supabase
                .from('agent_queue')
                .update({
                    status: 'failed',
                    error_message: error.message,
                    completed_at: new Date().toISOString()
                })
                .eq('id', job.id);
        } else {
            // Queue for retry
            await supabase
                .from('agent_queue')
                .update({
                    status: 'queued_retry',
                    attempts: newAttempts,
                    error_message: error.message,
                    scheduled_for: new Date(Date.now() + RETRY_DELAY_MS).toISOString()
                })
                .eq('id', job.id);
        }
    }
}

function buildMessages(job: AgentQueueJob, context: { system_prompt: string; context_json: Record<string, unknown> } | null): any[] {
    const messages: any[] = [];

    // System message
    if (context?.system_prompt) {
        messages.push({ role: 'system', content: context.system_prompt });
    } else {
        messages.push({
            role: 'system',
            content: `You are a DEVOS AI agent. Process the following task: ${job.agent_type}`
        });
    }

    // Build user message from payload
    const payload = job.payload as Record<string, unknown>;
    let userContent = '';

    if (job.agent_type === 'presell') {
        const action = payload.action;
        if (action === 'initial_contact') {
            userContent = `Send an initial WhatsApp message to ${payload.lead_name} (${payload.lead_phone}). Introduce yourself and ask about their interest.`;
        } else if (action === 'inbound_reply') {
            userContent = `The lead sent this message: "${payload.content}". Respond appropriately to continue the conversation.`;
        }
    }

    if (userContent) {
        messages.push({ role: 'user', content: userContent });
    }

    return messages;
}

async function callLiteLLM(config: LLMConfig, messages: any[]): Promise<any> {
    const response = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LITELLM_API_KEY}`
        },
        body: JSON.stringify({
            model: `${config.primary_provider}/${config.primary_model}`,
            messages,
            tools: getToolsForAgent(config.primary_model),
            temperature: 0.7,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const error = await response.text();
        // Try fallback
        if (config.fallback_model) {
            console.log('Primary failed, trying fallback:', config.fallback_model);
            return callLiteLLM({ ...config, primary_model: config.fallback_model, primary_provider: config.fallback_provider }, messages);
        }
        throw new Error(`LiteLLM error: ${response.status} ${error}`);
    }

    return response.json();
}

function getToolsForAgent(model: string): any[] {
    // Define MCP tools available to agents
    return [
        {
            type: 'function',
            function: {
                name: 'send_whatsapp_message',
                description: 'Send a WhatsApp message to a lead',
                parameters: {
                    type: 'object',
                    properties: {
                        phone: { type: 'string', description: 'Phone number' },
                        message: { type: 'string', description: 'Message content' }
                    },
                    required: ['phone', 'message']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_lead_details',
                description: 'Get details about a lead',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string', description: 'Lead ID' }
                    },
                    required: ['lead_id']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'update_lead',
                description: 'Update lead information',
                parameters: {
                    type: 'object',
                    properties: {
                        lead_id: { type: 'string' },
                        updates: { type: 'object', description: 'Fields to update' }
                    },
                    required: ['lead_id', 'updates']
                }
            }
        },
        {
            type: 'function',
            function: {
                name: 'get_unit_availability',
                description: 'Check available units for a project',
                parameters: {
                    type: 'object',
                    properties: {
                        project_id: { type: 'string' },
                        unit_type: { type: 'string' }
                    },
                    required: ['project_id']
                }
            }
        }
    ];
}

async function executeToolCalls(toolCalls: any[], organisationId: string): Promise<any[]> {
    const results = [];

    for (const toolCall of toolCalls) {
        const fnName = toolCall.function?.name || toolCall.name;
        const args = toolCall.function?.arguments ? JSON.parse(toolCall.function.arguments) : {};

        console.log(`Executing tool: ${fnName}`);

        try {
            let result;
            switch (fnName) {
                case 'send_whatsapp_message':
                    result = await sendWhatsAppMessage(organisationId, args.phone, args.message);
                    break;
                case 'get_lead_details':
                    result = await getLeadDetails(organisationId, args.lead_id);
                    break;
                case 'update_lead':
                    result = await updateLead(organisationId, args.lead_id, args.updates);
                    break;
                case 'get_unit_availability':
                    result = await getUnitAvailability(organisationId, args.project_id, args.unit_type);
                    break;
                default:
                    result = { error: `Unknown tool: ${fnName}` };
            }

            results.push({ tool: fnName, success: true, result });
        } catch (error: any) {
            results.push({ tool: fnName, success: false, error: error.message });
        }
    }

    return results;
}

// Tool implementations
async function sendWhatsAppMessage(orgId: string, phone: string, message: string): Promise<any> {
    // Get WhatsApp credentials from org_credentials
    const { data: creds } = await supabase
        .from('org_credentials')
        .select('*')
        .eq('organisation_id', orgId)
        .eq('provider', 'whatsapp')
        .eq('status', 'active')
        .single();

    if (!creds) {
        throw new Error('No WhatsApp credentials configured');
    }

    // In production, use the WhatsApp Business API
    // This is a placeholder
    console.log(`Sending WhatsApp to ${phone}: ${message}`);

    // Log to message_threads
    await supabase.from('message_threads').insert({
        organisation_id: orgId,
        channel: 'whatsapp',
        direction: 'outbound',
        content: message,
        contact_phone: phone
    });

    return { sent: true, phone, message_length: message.length };
}

async function getLeadDetails(orgId: string, leadId: string): Promise<any> {
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('organisation_id', orgId)
        .single();

    if (error) throw error;
    return data;
}

async function updateLead(orgId: string, leadId: string, updates: Record<string, unknown>): Promise<any> {
    const { data, error } = await supabase
        .from('leads')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('organisation_id', orgId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function getUnitAvailability(orgId: string, projectId?: string, unitType?: string): Promise<any> {
    let query = supabase
        .from('units')
        .select('*')
        .eq('organisation_id', orgId)
        .eq('status', 'available');

    if (projectId) query = query.eq('project_id', projectId);
    if (unitType) query = query.eq('unit_type', unitType);

    const { data, error } = await query;
    if (error) throw error;

    return { units: data, count: data?.length || 0 };
}

async function logAgentExecution(job: AgentQueueJob, config: LLMConfig, llmResponse: any, toolResults: any[]): Promise<void> {
    await supabase.from('agent_logs').insert({
        organisation_id: job.organisation_id,
        agent_type: job.agent_type,
        event_type: 'completed',
        input_summary: JSON.stringify(job.payload),
        output_summary: llmResponse.content?.substring(0, 500),
        tool_calls_json: JSON.stringify(toolResults),
        status: 'completed',
        model_used: config.primary_model,
        provider: config.primary_provider,
        lead_id: job.lead_id,
        cost_usd: estimateCost(config, llmResponse)
    });
}

function estimateCost(config: LLMConfig, response: any): number {
    // Rough cost estimation (in production, use actual token counts)
    const inputTokens = response.usage?.prompt_tokens || 1000;
    const outputTokens = response.usage?.completion_tokens || 500;

    // Approximate costs per 1M tokens
    const costs: Record<string, { input: number; output: number }> = {
        'anthropic/claude-3-5-haiku-20241022': { input: 1.5, output: 7.5 },
        'anthropic/claude-3-5-sonnet-20241022': { input: 15, output: 75 },
        'openrouter/gpt-4o-mini': { input: 0.15, output: 0.6 }
    };

    const modelCosts = costs[`${config.primary_provider}/${config.primary_model}`] || { input: 1, output: 5 };
    return (inputTokens / 1000000 * modelCosts.input) + (outputTokens / 1000000 * modelCosts.output);
}

// Main loop
async function main() {
    console.log('Agent Engine Worker started');

    // Poll every 10 seconds
    setInterval(pollQueue, 10000);

    // Initial poll
    await pollQueue();
}

main().catch(console.error);
