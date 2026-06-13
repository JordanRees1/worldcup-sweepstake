import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSavedSweeps } from '../../lib/savedSweeps';

export function LandingScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const saved = getSavedSweeps();

  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toLowerCase();
    if (c) navigate(`/s/${encodeURIComponent(c)}`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-12 lg:max-w-lg">
        <h1 className="text-xl font-semibold tracking-tight">World Cup 2026 Sweepstake</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your sweepstake code to see its leaderboard, groups and bracket.
        </p>

        <form onSubmit={join} className="mt-6 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. aa26"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Sweepstake code"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!code.trim()}
            className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors active:bg-brand-600 disabled:opacity-40"
          >
            Go
          </button>
        </form>

        {saved.length > 0 && (
          <section className="mt-9">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Your sweepstakes
            </h2>
            <div className="space-y-2">
              {saved.map((s) => (
                <Link
                  key={s.code}
                  to={`/s/${s.code}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors active:bg-white/10 lg:hover:bg-white/10"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs tabular-nums text-slate-500">/s/{s.code} ›</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-10 border-t border-white/10 pt-6">
          <p className="text-sm text-slate-400">Running your own?</p>
          <Link
            to="/new"
            className="mt-2 inline-block rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium transition-colors active:bg-white/10 lg:hover:bg-white/10"
          >
            + Create a sweepstake
          </Link>
        </div>
      </main>
    </div>
  );
}
