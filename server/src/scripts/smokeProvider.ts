// One-shot smoke test: run with `npm run smoke:provider`
import 'dotenv/config';
import { loadDataset } from '../data/dataset.js';
import { createProvider } from '../providers/index.js';

const ds = loadDataset();
const source = (process.env.DATA_SOURCE ?? 'seed') === 'live' ? 'live' : 'seed';
const provider = createProvider(ds.teams, ds.matches, {
  source,
  apiKey: process.env.FOOTBALL_API_KEY,
  cacheTtlMs: 60_000,
});

console.log('meta:', provider.meta());
const [results, slots] = await Promise.all([provider.getResults(), provider.getResolvedSlots()]);
console.log(`results: ${results.length}  |  slots: ${slots.length}`);
if (results.length > 0) {
  console.log('sample result:', JSON.stringify(results[0], null, 2));
} else {
  console.log('(no results yet — tournament not started)');
}
