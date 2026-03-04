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
      primary_model: 'claude-3-haiku-20240307',
      fallback_model: 'gpt-4o-mini',
      primary_provider: 'anthropic',
      fallback_provider: 'openai'
    };
  }
  
  return data;
}

/**
 * Process a single agent job
 */
async function processJob(job) {
  const { id: jobId, organisation_id: orgId, agent_type, payload, attempts } = job;
  
  console.log(`\n[Job ${jobId}] Processing ${agent_type} for org ${orgId}`);
  console.log(`[Job ${jobId}] Attempt: ${attempts + 1} of ${MAX_ATTEMPTS}`);
  
  try {
    // Get LLM config for this organisation and agent type
    const llmConfig = await getLLMConfig(orgId, agent_type);
    const model = llmConfig.primary_model;
    
    // Build messages from payload
    const messages = payload.messages || [
      { role: 'system', content: payload.systemPrompt || 'You are a helpful real estate sales assistant.' },
      { role: 'user', content: payload.userMessage || '' }
    ];
    
    // Define tools available to this agent
    const tools = defineAgentTools(agent_type);
    
    // Call LiteLLM
    console.log(`[Job ${jobId}] Calling LiteLLM with model: ${model}`);
    const startTime = Date.now();
    
    const response = await callLiteLLM(messages, model, tools);
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
      model_used: model,
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
      cost_usd: calculateCost(model, response.usage),
      duration_ms: duration,
      status: 'completed'
    });
    
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
    return baseTools;
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
    
    case 'update_lead_score':
      return await updateLeadScore(orgId, params.lead_id, params.score, params.category);
    
    case 'update_lead_status':
      return await updateLeadStatus(orgId, params.lead_id, params.status);
    
    case 'log_message':
      return await logMessage(orgId, params.lead_id, params.direction, params.content);
    
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
  const { data: creds } = await supabase
    .from('org_credentials')
    .select('encrypted_credentials')
    .eq('organisation_id', orgId)
    .eq('provider', 'telegram')
    .single();
  
  if (!creds) {
    throw new Error('Telegram credentials not configured for this organisation');
  }
  
  console.log(`[Telegram] Would send to ${chatId}: ${message}`);
  
  return { success: true, channel: 'telegram', chatId, message };
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

async function logMessage(orgId, leadId, direction, content) {
  const { error } = await supabase
    .from('message_threads')
    .insert({
      organisation_id: orgId,
      lead_id: leadId,
      channel: 'whatsapp',
      direction,
      content,
      delivered_at: new Date().toISOString()
    });
  
  if (error) throw error;
  
  return { success: true };
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
      event_type: 'execution',
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

// Start polling
console.log('\nWorker is now polling for jobs...\n');

setInterval(pollForJobs, POLL_INTERVAL);

// Initial poll
pollForJobs();