import 'dotenv/config';
import { createApp } from './app';
import { loadDataset } from './data/dataset';
import { loadConfig } from './env';
import { createProvider } from './providers';
import { createAppStateService } from './services/appState';

const config = loadConfig();
const dataset = loadDataset();

const provider = createProvider(dataset.teams, dataset.matches, {
  source: config.dataSource,
  apiKey: config.apiKey,
  cacheTtlMs: config.cacheTtlMs,
});

const service = createAppStateService(dataset, provider, config.cacheTtlMs);
const app = createApp(service, config);

const server = app.listen(config.port, () => {
  console.log(
    `[sweepstake] API on http://localhost:${config.port} ` +
      `(sweepstake=${dataset.sweepstake.name}, source=${config.dataSource}, ` +
      `teams=${dataset.teams.length}, matches=${dataset.matches.length})`,
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
