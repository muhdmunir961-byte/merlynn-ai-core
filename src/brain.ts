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
  'Kamu ialah Merlynn, pembantu AI peribadi yang hidup 24/7 dan mengurus kedai top-up.',
  'Gaya: mesra, natural seperti manusia, sedikit anime, ringkas dan jelas.',
  'Bahasa: sentiasa jawab dalam bahasa yang sama seperti mesej terakhir pengguna.',
  'Jika pengguna menulis Indonesia, jawab Indonesia. Melayu → Melayu. English → English.',
  'Jangan campur bahasa dalam satu jawapan kecuali istilah produk.',
  'Jangan mengaku melakukan tindakan yang belum dilakukan.',
  'Jangan dedahkan sebarang token, API key atau rahsia sistem.',
  'Untuk transaksi atau wang, sentiasa minta pengesahan pengguna dahulu.'
].join(' ');

/** Cheap language guess so the system prompt can pin the reply language. */
export const detectLang = (text: string): 'id' | 'en' | 'ms' => {
  const lower = ` ${text.toLowerCase()} `;
  const score = { id: 0, en: 0, ms: 0 };
  const bump = (lang: 'id' | 'en' | 'ms', words: string[]): void => {
    for (const word of words) {
      if (lower.includes(` ${word} `)) score[lang] += 1;
    }
  };
  bump('id', ['yang', 'tidak', 'sudah', 'belum', 'bisa', 'saja', 'juga', 'dengan', 'untuk', 'kak', 'bang', 'makasih', 'terima', 'kasih', 'harga', 'topup', 'masuk', 'cara', 'mau', 'gimana', 'berapa', 'ada', 'iya', 'dong']);
  bump('ms', ['yang', 'tak', 'dah', 'belum', 'boleh', 'sahaja', 'juga', 'dengan', 'untuk', 'kak', 'harga', 'topup', 'masuk', 'cara', 'nak', 'macam', 'mana', 'berapa', 'ada', 'ya', 'lah']);
  bump('en', ['the', 'is', 'are', 'do', 'does', 'can', 'could', 'would', 'please', 'thanks', 'thank', 'you', 'price', 'how', 'much', 'want', 'need', 'order', 'buy', 'hello', 'hi']);
  if (score.en > score.id && score.en > score.ms) return 'en';
  if (score.ms > score.id) return 'ms';
  return 'id';
};

const LANG_LINE: Record<'id' | 'en' | 'ms', string> = {
  id: 'Pengguna menulis dalam Bahasa Indonesia. Jawab dalam Bahasa Indonesia yang santai dan jelas.',
  en: 'The user writes in English. Reply in clear, friendly English.',
  ms: 'Pengguna menulis dalam Bahasa Melayu. Jawab dalam Bahasa Melayu yang santai dan jelas.'
};

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
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 120 })
  }, config.llmTimeoutMs);

  if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('LLM returned an empty reply');
  return content.trim();
};

export const chat = async (input: {
  messages: ChatMessage[];
  tier?: 'fast' | 'smart';
  memory?: string;
  lang?: 'id' | 'en' | 'ms';
}): Promise<ChatResult> => {
  const started = Date.now();
  const tier = input.tier ?? 'fast';
  const model = tier === 'smart' && config.llmSmartModel ? config.llmSmartModel : config.llmFastModel;
  const lastUser = [...input.messages].reverse().find((message) => message.role === 'user');
  const lang = input.lang ?? detectLang(lastUser?.content ?? '');
  const system = [
    SOUL,
    LANG_LINE[lang],
    input.memory ? `Ingatan tentang pengguna dan kedai:\n${input.memory}` : ''
  ].filter(Boolean).join('\n\n');
  const messages: ChatMessage[] = [{ role: 'system', content: system }, ...input.messages.slice(-10)];

  try {
    const content = await callEndpoint(config.llmBaseUrl, model, messages);
    return { model, content, latencyMs: Date.now() - started };
  } catch (error) {
    if (!config.llmFallbackUrl) throw error;
    const content = await callEndpoint(config.llmFallbackUrl, model, messages);
    return { model: `${model} (fallback)`, content, latencyMs: Date.now() - started };
  }
};
