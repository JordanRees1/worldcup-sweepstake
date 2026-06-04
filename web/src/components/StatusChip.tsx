import type { TeamOutcome } from '@sweepstake/shared';

// Colour AND a label/icon — never colour alone (accessibility).
const STYLES: Record<TeamOutcome, { label: string; icon: string; className: string }> = {
  alive: {
    label: 'Alive',
    icon: '●',
    className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  },
  upcoming: {
    label: 'Upcoming',
    icon: '○',
    className: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  },
  eliminated: {
    label: 'Out',
    icon: '✕',
    className: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  },
  champion: {
    label: 'Champion',
    icon: '★',
    className: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
  },
  did_not_qualify: {
    label: 'DNQ',
    icon: '–',
    className: 'bg-slate-500/15 text-slate-400 ring-slate-500/30',
  },
};

export function StatusChip({ outcome }: { outcome: TeamOutcome }) {
  const style = STYLES[outcome];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style.className}`}
    >
      <span aria-hidden>{style.icon}</span>
      {style.label}
    </span>
  );
}
