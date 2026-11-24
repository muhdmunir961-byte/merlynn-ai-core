import Fastify from 'fastify';
import { config, llmConfigured } from './config.js';
import { chat, type ChatMessage } from './brain.js';
import { MemoryStore } from './memory.js';

const app = Fastify({ logger: { level: config.logLevel } });
const memory = new MemoryStore(process.env.MEMORY_FILE ?? './data/memory.json');
await memory.load();

const startedAt = Date.now();
const stats = { requests: 0, llmCalls: 0, llmErrors: 0, lastLatencyMs: 0 };

const dashboard = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Merlynn Command Center</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1b2735 0%, #090a0f 60%); color: #e6edf3; }
  header { padding: 28px 22px 8px; }
  h1 { margin: 0; font-size: 22px; letter-spacing: .3px; font-weight: 650; }
  .sub { color: #8b98a5; font-size: 13px; margin-top: 6px; }
  .wrap { padding: 18px 22px 40px; display: grid; gap: 16px; max-width: 1100px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .card { background: #12161d; border: 1px solid #1f2733; border-radius: 14px; padding: 14px 16px; }
  .card .k { color: #7d8b99; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .card .v { font-size: 20px; font-weight: 650; margin-top: 6px; }
  .ok { color: #4ade80; } .off { color: #f87171; }
  .panel { background: #12161d; border: 1px solid #1f2733; border-radius: 14px; padding: 14px 16px; }
  textarea { width: 100%; min-height: 84px; background: #0b0f14; color: #e6edf3; border-radius: 10px;
    border: 1px solid #22303d; padding: 10px; font: inherit; resize: vertical; }
  button { margin-top: 10px; background: #1f6feb; border: 0; color: #fff; padding: 9px 16px;
    border-radius: 9px; font-weight: 600; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  #out { margin-top: 12px; white-space: pre-wrap; line-height: 1.55; color: #cbd5e1; font-size: 14px; }
  .row { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
  .hint { color: #6b7887; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Merlynn Command Center</h1>
  <div class="sub">AI Core &middot; WhatsApp gateway bridge &middot; Digiflazz commerce</div>
</header>
<div class="wrap">
  <div class="cards" id="cards"></div>
  <div class="panel">
    <div class="row"><strong>Live chat</strong><span class="hint" id="model"></span></div>
    <textarea id="prompt" placeholder="Tanya Merlynn apa-apa..."></textarea>
    <button id="send">Hantar</button>
    <div id="out"></div>
  </div>
</div>
<script>
const cards = document.getElementById('cards');
const out = document.getElementById('out');
const promptEl = document.getElementById('prompt');
const send = document.getElementById('send');

const render = (s) => {
  const items = [
    ['Status', s.ok ? 'online' : 'offline', s.ok],
    ['LLM', s.llmConfigured ? 'ready' : 'not configured', s.llmConfigured],
    ['WhatsApp gateway', s.waGatewayConfigured ? 'linked' : 'not linked', s.waGatewayConfigured],
    ['Digiflazz', s.digiflazzConfigured ? 'configured' : 'not configured', s.digiflazzConfigured],
    ['Chat requests', s.stats.requests, true],
    ['Avg latency', s.stats.lastLatencyMs + ' ms', true]
  ];
  cards.innerHTML = items.map(([k, v, ok]) =>
    '<div class="card"><div class="k">' + k + '</div><div class="v ' + (ok ? 'ok' : 'off') + '">' + v + '</div></div>'
  ).join('');
  document.getElementById('model').textContent = s.fastModel ? 'model: ' + s.fastModel : '';
};

const refresh = async () => {
  const res = await fetch('/api/status');
  render(await res.json());
};

send.addEventListener('click', async () => {
  const text = promptEl.value.trim();
  if (!text) return;
  send.disabled = true;
  out.textContent = '...';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();
    out.textContent = data.reply || data.error || 'Tiada jawapan.';
  } catch (e) {
    out.textContent = 'Ralat: ' + e.message;
  } finally {
    send.disabled = false;
    refresh().catch(() => {});
  }
});

refresh().catch(() => {});
setInterval(() => refresh().catch(() => {}), 15000);
</script>
</body>
</html>`;

app.get('/', async (_request, reply) => {
  return reply.type('text/html').send(dashboard);
});

app.get('/health', async () => ({ ok: true, service: 'merlynn-ai-core', uptimeMs: Date.now() - startedAt }));

app.get('/api/status', async () => ({
  ok: true,
  uptimeMs: Date.now() - startedAt,
  fastModel: config.llmFastModel,
  smartModel: config.llmSmartModel,
  llmConfigured: llmConfigured(),
  waGatewayConfigured: Boolean(config.waGatewayUrl),
  digiflazzConfigured: config.digiflazzConfigured,
  memories: memory.list().length,
  stats
}));

app.get('/api/memory', async () => ({ records: memory.list() }));

app.get('/api/memory/search', async (request) => {
  const query = String((request.query as { q?: string } | undefined)?.q ?? '').trim();
  if (!query) return { records: [] };
  return { records: await memory.recall(query, 10) };
});

app.post('/api/memory', async (request, reply) => {
  const body = request.body as { key?: unknown; value?: unknown; tags?: unknown } | undefined;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const value = typeof body?.value === 'string' ? body.value.trim() : '';
  if (!key || !value) return reply.code(400).send({ error: 'key and value are required' });
  const tags = Array.isArray(body?.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  try {
    const record = await memory.remember({ key, value, tags, source: 'owner' });
    return { record };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : 'failed' });
  }
});

app.delete('/api/memory/:id', async (request, reply) => {
  const id = String((request.params as { id?: string } | undefined)?.id ?? '');
  if (!id) return reply.code(400).send({ error: 'id required' });
  const removed = await memory.forget(id);
  return removed ? { ok: true } : reply.code(404).send({ error: 'not found' });
});

app.post('/api/chat', async (request, reply) => {
  const body = request.body as { message?: unknown; tier?: unknown } | undefined;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return reply.code(400).send({ error: 'message is required' });
  if (!llmConfigured()) {
    return reply.code(503).send({ error: 'LLM is not configured. Set LLM_BASE_URL and LLM_FAST_MODEL.' });
  }
  const tier = body?.tier === 'smart' ? 'smart' : 'fast';
  stats.requests += 1;
  stats.llmCalls += 1;
  try {
    const memoryContext = await memory.contextFor(message);
    const result = await chat({ messages: [{ role: 'user', content: message }], tier, memory: memoryContext });
    stats.lastLatencyMs = result.latencyMs;
    return { reply: result.content, model: result.model, latencyMs: result.latencyMs };
  } catch (error) {
    stats.llmErrors += 1;
    request.log.error({ error }, 'LLM request failed');
    return reply.code(502).send({ error: error instanceof Error ? error.message : 'LLM request failed' });
  }
});

// Bridge used by the WhatsApp bot running on Pterodactyl.
app.post('/api/wa/reply', async (request, reply) => {
  if (config.waGatewayToken) {
    const supplied = request.headers.authorization ?? '';
    if (supplied !== `Bearer ${config.waGatewayToken}`) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  }
  const body = request.body as { jid?: unknown; message?: unknown; history?: unknown } | undefined;
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return reply.code(400).send({ error: 'message is required' });
  if (!llmConfigured()) return reply.code(503).send({ error: 'LLM is not configured' });
  const history = Array.isArray(body?.history)
    ? (body.history as ChatMessage[]).filter((item) => typeof item?.content === 'string').slice(-8)
    : [];
  try {
    const memoryContext = await memory.contextFor(message);
    const result = await chat({ messages: [...history, { role: 'user', content: message }], memory: memoryContext });
    return { reply: result.content, model: result.model, jid: body?.jid ?? null };
  } catch (error) {
    return reply.code(502).send({ error: error instanceof Error ? error.message : 'LLM request failed' });
  }
});

const start = async (): Promise<void> => {
  await app.listen({ host: config.host, port: config.port });
};

await start();
