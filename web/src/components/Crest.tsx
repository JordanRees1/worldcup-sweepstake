import type { Team } from '@sweepstake/shared';

type CrestProps = {
  team: Pick<Team, 'name' | 'fifaCode' | 'crestUrl'>;
  size?: number;
};

/** Team crest: the API-supplied image if present, else a tidy FIFA-code badge fallback. */
export function Crest({ team, size = 28 }: CrestProps) {
  if (team.crestUrl) {
    return (
      <img
        src={team.crestUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-sm object-cover"
      />
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-sm bg-white/10 font-mono text-[10px] font-semibold tracking-tight text-slate-200"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {team.fifaCode}
    </span>
  );
}
