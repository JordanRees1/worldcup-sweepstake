import { NavLink } from 'react-router-dom';
import { useHealth, useMeta } from '../lib/api';
import { useSweepstakeCode } from '../lib/sweepstake';

const TABS = [
  { seg: '', label: 'Players', icon: '👥' },
  { seg: 'groups', label: 'Groups', icon: '📊' },
  { seg: 'bracket', label: 'Bracket', icon: '🏆' },
  { seg: 'schedule', label: 'Schedule', icon: '📅' },
];

const tabPath = (code: string, seg: string) => (seg ? `/s/${code}/${seg}` : `/s/${code}`);

export function Header() {
  const code = useSweepstakeCode();
  const { data: meta } = useMeta();
  const { data, isError, isLoading } = useHealth();
  const dotClass = isLoading
    ? 'animate-pulse bg-amber-400'
    : isError
      ? 'bg-rose-500'
      : 'bg-emerald-400';
  const label = isLoading ? 'connecting' : isError ? 'offline' : (data?.dataSource ?? 'seed');

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-6 px-4 py-3 lg:max-w-6xl lg:px-8">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-base font-semibold tracking-tight">{meta?.name ?? 'Sweepstake'}</h1>
            <p className="text-[11px] text-slate-400">World Cup 2026</p>
          </div>
          {/* Desktop top nav — replaces the bottom tab bar on laptop/desktop screens. */}
          <nav className="hidden items-center gap-1 lg:flex">
            {TABS.map((tab) => (
              <NavLink
                key={tab.seg}
                to={tabPath(code, tab.seg)}
                end={tab.seg === ''}
                className={({ isActive }) =>
                  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/10 text-brand-400' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
          {label}
        </span>
      </div>
    </header>
  );
}

export function BottomNav() {
  const code = useSweepstakeCode();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map((tab) => (
          <NavLink
            key={tab.seg}
            to={tabPath(code, tab.seg)}
            end={tab.seg === ''}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-brand-400' : 'text-slate-400'
              }`
            }
          >
            <span className="text-lg leading-none" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
