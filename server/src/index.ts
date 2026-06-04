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

app.listen(config.port, () => {
  console.log(
    `[sweepstake] API on http://localhost:${config.port} ` +
      `(source=${config.dataSource}, teams=${dataset.teams.length}, matches=${dataset.matches.length})`,
  );
});
