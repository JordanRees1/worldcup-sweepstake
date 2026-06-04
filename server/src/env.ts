export interface ServerConfig {
  port: number;
  dataSource: 'seed' | 'live';
  apiKey?: string;
  cacheTtlMs: number;
  version: string;
}

export function loadConfig(): ServerConfig {
  const ttlSeconds = Number(process.env.RESULTS_CACHE_TTL_SECONDS ?? 60);
  return {
    port: Number(process.env.PORT ?? 8787),
    dataSource: process.env.DATA_SOURCE === 'live' ? 'live' : 'seed',
    apiKey: process.env.FOOTBALL_API_KEY || undefined,
    cacheTtlMs: (Number.isFinite(ttlSeconds) ? ttlSeconds : 60) * 1000,
    version: '0.1.0',
  };
}
