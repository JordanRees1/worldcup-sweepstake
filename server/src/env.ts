export interface ServerConfig {
  port: number;
  dataSource: 'seed' | 'live';
  apiKey?: string;
  cacheTtlMs: number;
  version: string;
  /** Shared "create password" gating self-service creation. Unset = creation open (dev). */
  createToken?: string;
  /** Global admin token: edit/delete any sweepstake + the admin panel. */
  adminToken?: string;
}

export function loadConfig(): ServerConfig {
  const ttlSeconds = Number(process.env.RESULTS_CACHE_TTL_SECONDS ?? 60);
  return {
    port: Number(process.env.PORT ?? 8787),
    dataSource: process.env.DATA_SOURCE === 'live' ? 'live' : 'seed',
    apiKey: process.env.FOOTBALL_API_KEY || undefined,
    cacheTtlMs: (Number.isFinite(ttlSeconds) ? ttlSeconds : 60) * 1000,
    version: '0.1.0',
    createToken: process.env.CREATE_TOKEN || undefined,
    adminToken: process.env.ADMIN_TOKEN || undefined,
  };
}
