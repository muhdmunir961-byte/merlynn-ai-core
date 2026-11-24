# Merlynn AI Core

Autonomous AI assistant core for the Merlynn 2-in-1 stack. It runs on the VPS
(Coolify or any Docker host) while the WhatsApp bot runs separately on
Pterodactyl.

## What it does

- Serves the **Merlynn Command Center** dashboard at `/`.
- Exposes `GET /health` for container health checks.
- Exposes `GET /api/status` with live counters and integration state.
- Exposes `POST /api/chat` for the dashboard chat.
- Exposes `POST /api/wa/reply`, the authenticated bridge the WhatsApp bot calls
  to get an AI reply.

## Architecture

```text
WhatsApp  <->  merlynn-wa-bot (Pterodactyl)
                     |
                     |  POST /api/wa/reply
                     v
              merlynn-ai-core (VPS / Coolify)
                     |
                     |  OpenAI-compatible /v1/chat/completions
                     v
              LLM (Ollama / llama.cpp / router)
```

## Run locally

```sh
cp .env.example .env
npm install
npm run build
npm start
```

Dashboard: <http://localhost:3000>

## Environment

| Variable | Purpose |
| --- | --- |
| `LLM_BASE_URL` | OpenAI-compatible base URL, no trailing `/v1` |
| `LLM_API_KEY` | Optional bearer token for the LLM endpoint |
| `LLM_FAST_MODEL` | Model used for normal replies |
| `LLM_SMART_MODEL` | Model used for `tier: "smart"` requests |
| `LLM_FALLBACK_URL` | Second endpoint tried when the first fails |
| `WA_GATEWAY_TOKEN` | Shared secret the WhatsApp bot must send |
| `DIGIFLAZZ_USERNAME` / `DIGIFLAZZ_API_KEY` | Commerce credentials |

The AI core never sends secrets to the model and never executes payments by
itself; the WhatsApp bot owns transaction validation.
