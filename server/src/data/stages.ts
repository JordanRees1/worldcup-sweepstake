import { join } from 'node:path';
import type { Stage, StageName } from '@sweepstake/shared';
import { readCsv } from './csv';
import { DATASETS_DIR } from './paths';

type StageRow = {
  id: string;
  stage_name: string;
  stage_order: string;
};

export function loadStages(): Stage[] {
  const rows = readCsv<StageRow>(join(DATASETS_DIR, 'tournament_stages.csv'));
  return rows.map(
    (r): Stage => ({
      id: Number(r.id),
      name: r.stage_name as StageName,
      order: Number(r.stage_order),
    }),
  );
}
