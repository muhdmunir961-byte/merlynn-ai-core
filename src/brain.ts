import { config } from './config.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  model: string;
  content: string;
  latencyMs: number;
}

const SOUL = [
  'Kamu ialah Merlynn, pembantu AI peribadi yang hidup 24/7.',
  'Gaya: mesra, natural seperti manusia, sedikit anime, ringkas dan jelas.',
  'Bahasa: ikut bahasa pengguna (Malay, Indonesia, English).',
  'Jangan mengaku melakukan tindakan yang belum dilakukan.',
  'Jangan dedahkan sebarang token, API key atau rahsia sistem.',
  'Untuk transaksi atau wang, sentiasa minta pengesahan pengguna dahulu.'
].join(' ');

const withTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const callEndpoint = async (baseUrl: string, model: string, messages: ChatMessage[]): Promise<string> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.llmApiKey) headers.authorization = `Bearer ${config.llmApiKey}`;

  const response = await withTimeout(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.8 })
  }, config.llmTimeoutMs);

  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('LLM returned an empty reply');
  return content.trim();
};

export const chat = async (input: { messages: ChatMessage[]; tier?: 'fast' | 'smart' }): Promise<ChatResult> => {
  const started = Date.now();
  const tier = input.tier ?? 'fast';
  const model = tier === 'smart' && config.llmSmartModel ? config.llmSmartModel : config.llmFastModel;
  const messages: ChatMessage[] = [{ role: 'system', content: SOUL }, ...input.messages.slice(-10)];

  try {
    const content = await callEndpoint(config.llmBaseUrl, model, messages);
    return { model, content, latencyMs: Date.now() - started };
  } catch (error) {
    if (!config.llmFallbackUrl) throw error;
    const content = await callEndpoint(config.llmFallbackUrl, model, messages);
    return { model: `${model} (fallback)`, content, latencyMs: Date.now() - started };
  }
};
