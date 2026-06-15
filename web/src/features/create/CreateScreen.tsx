import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { SweepstakeInput } from '@sweepstake/shared';
import { createSweepstake } from '../../lib/api';
import { saveSweep } from '../../lib/savedSweeps';
import { SweepstakeForm, type FormResult } from './SweepstakeForm';

interface Created {
  code: string;
  ownerToken: string;
  name: string;
  roster?: { name: string; teams: string[] }[];
}

export function CreateScreen() {
  const [createToken, setCreateToken] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  const onSubmit = async (input: SweepstakeInput): Promise<FormResult> => {
    const out = await createSweepstake(input, createToken);
    if (out.ok && out.data) {
      saveSweep({ code: out.data.code, name: input.name.trim() });
      setCreated({
        code: out.data.code,
        ownerToken: out.data.ownerToken,
        name: input.name.trim(),
        roster: out.data.roster,
      });
      return { ok: true };
    }
    if (out.status === 401) {
      return { ok: false, errors: ['Wrong or missing create password.'] };
    }
    return { ok: false, issues: out.issues, errors: out.errors };
  };

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16 pt-10 lg:max-w-lg">
        <Link to="/" className="text-sm text-slate-400">
          ← Back
        </Link>

        {created ? (
          <section className="mt-6 space-y-4">
            <h1 className="text-xl font-semibold">“{created.name}” is live 🎉</h1>
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
              <p>
                Share link:{' '}
                <Link to={`/s/${created.code}`} className="font-medium text-brand-400">
                  sstake.co.uk/s/{created.code}
                </Link>
              </p>
              <p className="text-slate-400">
                Owner token (save this — it&apos;s the only way to edit/delete later):
              </p>
              <code className="block break-all rounded bg-black/30 px-2 py-1.5 text-[12px] text-amber-300">
                {created.ownerToken}
              </code>
              <p className="text-[11px] text-slate-500">
                Manage at <span className="text-slate-400">/s/{created.code}/manage</span>
              </p>
            </div>

            {created.roster && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  The draw 🎲
                </p>
                <ul className="space-y-1.5 text-sm">
                  {created.roster.map((p) => (
                    <li key={p.name}>
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-slate-400"> — {p.teams.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link
              to={`/s/${created.code}`}
              className="block rounded-xl bg-brand-500 px-4 py-2.5 text-center text-sm font-semibold text-white"
            >
              Open it
            </Link>
          </section>
        ) : (
          <section className="mt-6 space-y-5">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Create a sweepstake</h1>
              <p className="mt-1 text-sm text-slate-400">
                Add your players and the teams they drew. Every one of the 48 World Cup teams must be
                picked exactly once.
              </p>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Create password
              </span>
              <input
                type="password"
                value={createToken}
                onChange={(e) => setCreateToken(e.target.value)}
                placeholder="ask the organiser"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>
            <SweepstakeForm allowGenerate submitLabel="Create sweepstake" onSubmit={onSubmit} />
          </section>
        )}
      </main>
    </div>
  );
}
