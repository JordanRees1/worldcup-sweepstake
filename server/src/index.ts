import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import type { DataSource, HealthResponse } from '@sweepstake/shared';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_SOURCE: DataSource = process.env.DATA_SOURCE === 'live' ? 'live' : 'seed';
const VERSION = '0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    dataSource: DATA_SOURCE,
    lastUpdated: null,
    version: VERSION,
  };
  res.json(body);
});

app.listen(PORT, () => {
  console.log(`[sweepstake] API listening on http://localhost:${PORT} (source=${DATA_SOURCE})`);
});
