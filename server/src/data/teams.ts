import { join } from 'node:path';
import type { GroupLetter, Team } from '@sweepstake/shared';
import { readCsv } from './csv';
import { DATASETS_DIR } from './paths';

type TeamRow = {
  id: string;
  team_name: string;
  fifa_code: string;
  group_letter: string;
  is_placeholder: string;
};

export function loadTeams(): Team[] {
  const rows = readCsv<TeamRow>(join(DATASETS_DIR, 'teams.csv'));
  return rows.map((r): Team => {
    const isPlaceholder = r.is_placeholder.toLowerCase() === 'true';
    return {
      id: Number(r.id),
      name: r.team_name,
      fifaCode: r.fifa_code,
      group: (r.group_letter || null) as GroupLetter | null,
      isPlaceholder,
      ...(isPlaceholder ? { placeholderLabel: r.team_name } : {}),
    };
  });
}
