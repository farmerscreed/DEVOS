# Devos — Claude Instructions

## MANDATORY: jcodemunch-first workflow

These rules apply on every session without exception.

### Session start
Always run `index_folder` (incremental) before any work:
- path: `/home/lawone-cloud/Downloads/apps/Devos`
- `incremental: true`
- `use_ai_summaries: false`
- `extra_ignore_patterns: ["node_modules", ".git"]`

### Navigation order (strictly enforce)
1. `get_file_tree` — locate the right file
2. `get_file_outline` — inspect symbols before reading
3. `search_symbols` — find definitions across the repo
4. `search_text` — find all usages
5. `Read` — ONLY after confirming the exact file via jcodemunch, and ONLY when editing

**Never use Read, Grep, or Glob for exploration. jcodemunch first, always.**

## Project structure
- `agent-worker/` — Node.js agent/worker (JS)
- `devos-frontend/` — React/TypeScript frontend (Vite)
- `supabase/` — Supabase edge functions (TypeScript)
- `MCP/jcodemunch-mcp/` — jcodemunch MCP server source (Python)
