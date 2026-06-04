import { NavLink } from 'react-router-dom';
import { useHealth } from '../lib/api';

export function Header() {
  const { data, isError, isLoading } = useHealth();
  const dotClass = isLoading
    ? 'animate-pulse bg-amber-400'
    : isError
      ? 'bg-rose-500'
      : 'bg-emerald-400';
  const label = isLoading ? 'connecting' : isError ? 'offline' : (data?.dataSource ?? 'seed');

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Sweepstake</h1>
          <p className="text-[11px] text-slate-400">World Cup 2026</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
          {label}
        </span>
      </div>
    </header>
  );
}

const TABS = [
  { to: '/players', label: 'Players', icon: '👥' },
  { to: '/bracket', label: 'Bracket', icon: '🏆' },
  { to: '/schedule', label: 'Schedule', icon: '📅' },
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-md">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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
