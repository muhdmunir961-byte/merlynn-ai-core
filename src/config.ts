import 'dotenv/config';

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: num(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  botName: process.env.BOT_NAME ?? 'Merlynn',
  dashboardSecret: process.env.DASHBOARD_SECRET ?? '',
  llmBaseUrl: (process.env.LLM_BASE_URL ?? '').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmFastModel: process.env.LLM_FAST_MODEL ?? '',
  llmSmartModel: process.env.LLM_SMART_MODEL ?? '',
  llmFallbackUrl: (process.env.LLM_FALLBACK_URL ?? '').replace(/\/$/, ''),
  llmTimeoutMs: num(process.env.LLM_TIMEOUT_MS, 45_000),
  waGatewayUrl: (process.env.WA_GATEWAY_URL ?? '').replace(/\/$/, ''),
  waGatewayToken: process.env.WA_GATEWAY_TOKEN ?? '',
  digiflazzUsername: process.env.DIGIFLAZZ_USERNAME ?? '',
  digiflazzConfigured: Boolean(process.env.DIGIFLAZZ_API_KEY)
} as const;

export const llmConfigured = (): boolean => Boolean(config.llmBaseUrl && config.llmFastModel);
