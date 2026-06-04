import type { PlayerTeam } from '@sweepstake/shared';
import { Crest } from './Crest';
import { StatusChip } from './StatusChip';

export function TeamRow({ team, status }: PlayerTeam) {
  const dimmed = !status.alive && status.outcome !== 'upcoming';
  return (
    <div className={`flex items-center gap-3 py-2 ${dimmed ? 'opacity-60' : ''}`}>
      <Crest team={team} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{team.name}</p>
        <p className="text-[11px] text-slate-400">{team.group ? `Group ${team.group}` : 'Playoff'}</p>
      </div>
      <StatusChip outcome={status.outcome} />
    </div>
  );
}
