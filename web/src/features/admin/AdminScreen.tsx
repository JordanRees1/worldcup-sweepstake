import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminResponse } from '@sweepstake/shared';
import { deleteSweepstake, queryClient, rotateCreationPassword, useAdmin } from '../../lib/api';
import { getAdminToken, setAdminToken } from '../../lib/clientId';
import { removeSweep } from '../../lib/savedSweeps';

/** Global-admin monitoring panel (`/a/admin`). Token-gated; not a login — just a shared secret. */
export function AdminScreen() {
  const [token, setToken] = useState(getAdminToken());
  const [input, setInput] = useState(getAdminToken());
  const admin = useAdmin(token);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    setAdminToken(t);
    setToken(t);
  };

  const signOut = () => {
    setAdminToken('');
    setToken('');
    setInput('');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-10 lg:max-w-3xl">
        <Link to="/" className="text-sm text-slate-400">
          ← Back
        </Link>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">Admin</h1>

        {!token || (admin.isError && !admin.data) ? (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Admin token
              </span>
              <input
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
            {admin.isError && token && <p className="text-sm text-red-400">Wrong admin token.</p>}
            <button
              type="submit"
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open admin
            </button>
          </form>
        ) : admin.isLoading ? (
          <p className="mt-6 text-sm text-slate-400">Loading…</p>
        ) : admin.data ? (
          <AdminTable data={admin.data} token={token} onSignOut={signOut} />
        ) : null}
      </main>
    </div>
  );
}

function AdminTable({
  data,
  token,
  onSignOut,
}: {
  data: AdminResponse;
  token: string;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState(data.creationPassword);
  const [rotating, setRotating] = useState(false);

  const onDelete = async (code: string) => {
    setBusy(code);
    if (await deleteSweepstake(code, token)) {
      removeSweep(code);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    }
    setBusy('');
    setConfirm('');
  };

  const onRotate = async () => {
    setRotating(true);
    const next = await rotateCreationPassword(token);
    if (next) {
      setPassword(next);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    }
    setRotating(false);
  };

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">
          <span className="font-semibold text-white">{data.totals.sweepstakes}</span> sweepstakes ·{' '}
          <span className="font-semibold text-white">{data.totals.players}</span> players
        </p>
        <button onClick={onSignOut} className="text-xs text-slate-400 underline">
          Sign out
        </button>
      </div>

      {!data.creationOpen && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Current creation password
            </p>
            <code className="break-all text-base font-semibold text-amber-300">
              {password ?? '—'}
            </code>
            <p className="text-[11px] text-slate-500">
              One-time — expires automatically after each sweepstake is created.
            </p>
          </div>
          <button
            onClick={onRotate}
            disabled={rotating}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-slate-200 active:bg-white/20 disabled:opacity-50"
          >
            {rotating ? '…' : 'Regenerate'}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Sweepstake</th>
              <th className="px-3 py-2 text-right">Players</th>
              <th className="px-3 py-2 text-right">Views</th>
              <th className="px-3 py-2 text-right">Now</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.sweepstakes.map((s) => (
              <tr key={s.code} className="align-top">
                <td className="px-3 py-2">
                  <Link to={`/s/${s.code}`} className="font-medium text-brand-400">
                    {s.name}
                  </Link>
                  <div className="text-[11px] text-slate-500">
                    /s/{s.code}
                    {s.kind === 'baked' && <span className="ml-1 text-slate-600">· built-in</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.playerCount}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{s.views}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-400">{s.activeNow}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {s.kind === 'custom' &&
                    (confirm === s.code ? (
                      <span className="inline-flex gap-2">
                        <button
                          onClick={() => onDelete(s.code)}
                          disabled={busy === s.code}
                          className="text-red-400 disabled:opacity-50"
                        >
                          {busy === s.code ? '…' : 'Confirm'}
                        </button>
                        <button onClick={() => setConfirm('')} className="text-slate-500">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-3">
                        <Link to={`/s/${s.code}/manage`} className="text-slate-400 hover:text-slate-200">
                          Edit
                        </Link>
                        <button onClick={() => setConfirm(s.code)} className="text-red-400/80 hover:text-red-400">
                          Delete
                        </button>
                      </span>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">{data.metricsNote}</p>
    </section>
  );
}
