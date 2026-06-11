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
 * Shift an ISO instant by `hours`, re-expressing the result with the SAME UTC offset
 * (so the offset string is preserved and date rollover is handled correctly).
 */
function shiftHours(iso: string, hours: number): string {
  const m = /^(.*T\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, , offset] = m;
  const shifted = new Date(new Date(iso).getTime() + hours * 3_600_000);
  const offMin =
    (offset[0] === '-' ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  // Re-express in the original offset by reading the wall-clock fields off a UTC-shifted copy.
  const wall = new Date(shifted.getTime() + offMin * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${wall.getUTCFullYear()}-${p(wall.getUTCMonth() + 1)}-${p(wall.getUTCDate())}` +
    `T${p(wall.getUTCHours())}:${p(wall.getUTCMinutes())}:${p(wall.getUTCSeconds())}`;
  return `${stamp}${offset}`;
}

/**
 * "2026-06-11 15:00:00-06" -> "2026-06-11T14:00:00-06:00" (valid ISO 8601).
 *
 * BF1: the dataset's kickoff wall-clock times run one hour late for our (all-UK) audience,
 * so we correct every kickoff by -1h here, preserving each venue's UTC offset. This is the
 * single source of the correction — change KICKOFF_CORRECTION_HOURS to 0 to disable it.
 */
const KICKOFF_CORRECTION_HOURS: number = -1;
function toIso(raw: string): string {
  const iso = raw
    .trim()
    .replace(' ', 'T')
    .replace(/([+-]\d{2})$/, '$1:00');
  return KICKOFF_CORRECTION_HOURS === 0 ? iso : shiftHours(iso, KICKOFF_CORRECTION_HOURS);
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
