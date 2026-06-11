import { join } from 'node:path';
import type { GroupLetter, Match, MatchStatus, Stage } from '@sweepstake/shared';
import { readCsv } from './csv';
import { DATASETS_DIR } from './paths';

type MatchRow = {
  id: string;
  match_number: string;
  home_team_id: string;
  away_team_id: string;
  city_id: string;
  stage_id: string;
  kickoff_at: string;
  match_label: string;
};

// Known dataset bug: match #100's label references W100 (itself); it should read "W95 vs W96".
const LABEL_FIXES: Record<number, string> = {
  100: 'W95 vs W96',
};

/**
 * "2026-06-11 15:00:00-06" -> "2026-06-11T15:00:00-04:00" (valid ISO 8601).
 *
 * BF1: every kickoff wall-clock time in the dataset is in US Eastern time (how the official
 * schedule is published), but the CSV paired each one with its VENUE's local UTC offset — so
 * non-Eastern venues came out 1-3h late (Central +1, Mexico/Mountain +2, Pacific +3). We
 * discard the stored offset and re-attach the Eastern one. The whole June-July tournament is
 * in US daylight time, so EDT (-04:00) applies throughout. The web renders the resulting
 * (correct) instants in UK time.
 */
const EASTERN_OFFSET = '-04:00';
function toIso(raw: string): string {
  return raw
    .trim()
    .replace(' ', 'T')
    .replace(/[+-]\d{2}(:\d{2})?$/, EASTERN_OFFSET);
}

function groupFromLabel(label: string): GroupLetter | undefined {
  const matched = /^Group ([A-L])$/.exec(label);
  return matched ? (matched[1] as GroupLetter) : undefined;
}

function optionalTeamId(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export function loadMatches(stages: Stage[]): Match[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const rows = readCsv<MatchRow>(join(DATASETS_DIR, 'matches.csv'));

  return rows.map((row): Match => {
    const id = Number(row.id);
    const stage = stageById.get(Number(row.stage_id));
    if (!stage) throw new Error(`matches.csv: match ${id} has unknown stage_id "${row.stage_id}"`);

    const label = LABEL_FIXES[id] ?? row.match_label;
    const group = groupFromLabel(label);

    return {
      id,
      matchNumber: Number(row.match_number),
      stage: stage.name,
      stageOrder: stage.order,
      ...(group ? { group } : {}),
      label,
      kickoffAt: toIso(row.kickoff_at),
      venueId: Number(row.city_id),
      homeTeamId: optionalTeamId(row.home_team_id),
      awayTeamId: optionalTeamId(row.away_team_id),
      status: 'scheduled' satisfies MatchStatus,
    };
  });
}
