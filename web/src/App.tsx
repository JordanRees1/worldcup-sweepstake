import { useEffect, useState } from 'react';
import { API_ROUTES, type HealthResponse } from '@sweepstake/shared';

type HealthState =
  | { state: 'loading' }
  | { state: 'ok'; data: HealthResponse }
  | { state: 'error'; message: string };

export default function App() {
  const [health, setHealth] = useState<HealthState>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(API_ROUTES.health)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as HealthResponse;
      })
      .then((data) => {
        if (!cancelled) setHealth({ state: 'ok', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHealth({
            state: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/80 px-5 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold tracking-tight">Sweepstake</h1>
        <p className="text-xs text-slate-400">World Cup 2026 · live monitor</p>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 py-8">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
            API connection
          </h2>
          <ApiStatus health={health} />
        </section>

        <p className="text-center text-xs text-slate-500">
          WP0 scaffold — the player table, leaderboard and bracket land next.
        </p>
      </main>
    </div>
  );
}

function ApiStatus({ health }: { health: HealthState }) {
  if (health.state === 'loading') {
    return <StatusRow dotClass="animate-pulse bg-amber-400" label="Connecting to API…" />;
  }
  if (health.state === 'error') {
    return (
      <StatusRow
        dotClass="bg-rose-500"
        label="API unreachable"
        detail={`${health.message} — is the server running? (npm run dev)`}
      />
    );
  }
  return (
    <StatusRow
      dotClass="bg-emerald-400"
      label="Connected"
      detail={`source: ${health.data.dataSource} · v${health.data.version}`}
    />
  );
}

function StatusRow({
  dotClass,
  label,
  detail,
}: {
  dotClass: string;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
      <div>
        <p className="font-medium">{label}</p>
        {detail ? <p className="text-sm text-slate-400">{detail}</p> : null}
      </div>
    </div>
  );
}
