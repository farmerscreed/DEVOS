# DEVOS Agent Worker

The Agent Engine Worker polls the `agent_queue` table and processes AI agent jobs.

## Quick Deploy to Railway

1. Go to [Railway](https://railway.app)
2. Create new project → "Deploy from GitHub repo"
3. Select `farmerscreed/DEVOS`
4. **Important**: Set root directory to `agent-worker`
5. Add environment variables:
   - `SUPABASE_URL = https://gvcadlzjpsfabrqkzdwt.supabase.co`
   - `SUPABASE_SERVICE_KEY = (from Supabase Dashboard > Settings > API)`
   - `LITELLM_BASE_URL = http://161.97.95.101:4000`
   - `LITELLM_API_KEY = your_litellm_key`
6. Deploy!

## Local Development

```bash
cd agent-worker
npm install

# Set environment variables
export SUPABASE_URL=https://gvcadlzjpsfabrqkzdwt.supabase.co
export SUPABASE_SERVICE_KEY=your_service_key
export LITELLM_BASE_URL=http://161.97.95.101:4000
export LITELLM_API_KEY=your_key

npm start
```

## What It Does

1. Polls `agent_queue` table every 5 seconds for `pending` jobs
2. Gets LLM config for the organisation
3. Calls LiteLLM with the appropriate model
4. Executes MCP tool calls (send WhatsApp, update lead, etc.)
5. Logs to `agent_logs` table with cost tracking
6. Updates job status to `completed` or schedules retry

## Retry Logic

- Max 3 attempts per job
- Primary model → fallback model → queue retry in 5 min
- On 3rd failure: mark as `FAILED`, alert super_admin

## Cost Tracking

Every execution logs:
- `model_used`
- `input_tokens`
- `output_tokens`  
- `cost_usd`