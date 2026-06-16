/**
 * A pulsing red "LIVE" indicator, optionally with the live match clock — including stoppage time
 * when the API reports it, e.g. "LIVE 67'" or "LIVE 45+2'".
 */
export function LiveBadge({ minute, injuryTime }: { minute?: number; injuryTime?: number }) {
  const clock =
    typeof minute === 'number'
      ? ` ${minute}${typeof injuryTime === 'number' && injuryTime > 0 ? `+${injuryTime}` : ''}'`
      : '';
  return (
    <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
      Live{clock}
    </span>
  );
}
