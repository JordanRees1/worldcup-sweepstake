import 'dotenv/config';
import { createApp } from './app';
import { loadStructural } from './data/dataset';
import { listSweepstakes } from './data/sweepstake';
import { loadConfig } from './env';
import { createProvider } from './providers';
import { createTenantStore } from './data/tenantStore';
import { createGateway } from './services/appState';

const config = loadConfig();
const structural = loadStructural();

const provider = createProvider(structural.teams, structural.matches, {
  source: config.dataSource,
  apiKey: config.apiKey,
  cacheTtlMs: config.cacheTtlMs,
});

const store = createTenantStore();
const gateway = createGateway(structural, provider, config.cacheTtlMs, store);
const app = createApp(gateway, store, config);

const server = app.listen(config.port, () => {
  const tenants = listSweepstakes()
    .map((s) => s.code)
    .join(', ');
  console.log(
    `[sweepstake] gateway on http://localhost:${config.port} ` +
      `(source=${config.dataSource}, teams=${structural.teams.length}, ` +
      `matches=${structural.matches.length}, tenants=[${tenants}])`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[sweepstake] Port ${config.port} is already in use — another server is probably ` +
        'still running. Stop it (e.g. `pkill -f tsx`) or set PORT to a free port.',
    );
  } else {
    console.error('[sweepstake] Failed to start server:', err.message);
  }
  process.exit(1);
});
