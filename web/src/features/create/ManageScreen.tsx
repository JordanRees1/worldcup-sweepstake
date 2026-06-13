import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { SweepstakeInput } from '@sweepstake/shared';
import { EmptyState, LoadingState } from '../../components/states';
import { deleteSweepstake, updateSweepstake, useMeta, useOverview } from '../../lib/api';
import { getAdminToken } from '../../lib/clientId';
import { removeSweep } from '../../lib/savedSweeps';
import { useSweepstakeCode } from '../../lib/sweepstake';
import { SweepstakeForm, type FormResult } from './SweepstakeForm';

export function ManageScreen() {
  const code = useSweepstakeCode();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get('owner') ?? getAdminToken());
  const [confirming, setConfirming] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');
  const meta = useMeta();
  const overview = useOverview();

  if (meta.isLoading || overview.isLoading) return <LoadingState label="Loading…" />;
  if (!meta.data || !overview.data) return <EmptyState>Couldn't load this sweepstake.</EmptyState>;

  const initialPlayers = overview.data.leaderboard.map((p) => ({
    name: p.player.name,
    picks: p.teams.map((t) => t.team.name).join(', '),
  }));

  const onSubmit = async (input: SweepstakeInput): Promise<FormResult> => {
    if (!token.trim()) return { ok: false, errors: ['Enter your owner (or admin) token first.'] };
    const out = await updateSweepstake(code, input, token.trim());
    if (out.ok) {
      await Promise.all([meta.refetch(), overview.refetch()]);
      return { ok: true };
    }
    if (out.status === 401) return { ok: false, errors: ['Wrong owner/admin token.'] };
    return { ok: false, issues: out.issues, errors: out.errors };
  };

  const onDelete = async (): Promise<void> => {
    setDeleteErr('');
    if (!token.trim()) {
      setDeleteErr('Enter your owner/admin token first.');
      return;
    }
    if (await deleteSweepstake(code, token.trim())) {
      removeSweep(code);
      navigate('/');
    } else {
      setDeleteErr('Delete failed — check your token.');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Manage “{meta.data.name}”</h2>
        <p className="text-[11px] text-slate-400">
          Owner-only. Paste the owner token you got when it was created (or the admin token).
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Owner / admin token
        </span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-400"
        />
      </label>

      <SweepstakeForm
        initialName={meta.data.name}
        initialTeamsPerPlayer={meta.data.teamsPerPlayer}
        initialPlayers={initialPlayers}
        lockTeamsPerPlayer
        submitLabel="Save changes"
        onSubmit={onSubmit}
      />

      <div className="space-y-2 border-t border-white/10 pt-4">
        {deleteErr && <p className="text-sm text-red-400">{deleteErr}</p>}
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onDelete}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Yes, delete it
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-sm text-red-400 active:text-red-300"
          >
            Delete sweepstake…
          </button>
        )}
      </div>
    </div>
  );
}
