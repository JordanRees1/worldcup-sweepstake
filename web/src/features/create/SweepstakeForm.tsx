import { useState, type FormEvent } from 'react';
import type { GenerateMode, PickIssue, SweepstakeInput } from '@sweepstake/shared';

/** teams-per-player options that divide the 48-team field evenly (excluding the silly extremes). */
const DIVISORS = [2, 3, 4, 6, 8, 12, 16, 24];

interface PlayerRow {
  name: string;
  picks: string; // comma/newline-separated team names
}

export interface FormResult {
  ok: boolean;
  issues?: PickIssue[];
  errors?: string[];
}

interface Props {
  initialName?: string;
  initialTeamsPerPlayer?: number;
  initialPlayers?: PlayerRow[];
  /** Edit mode keeps teams-per-player fixed (changing it would invalidate the roster shape). */
  lockTeamsPerPlayer?: boolean;
  /** Offer the "draw the teams for me" option (create flow only — not edit). */
  allowGenerate?: boolean;
  submitLabel: string;
  onSubmit: (input: SweepstakeInput) => Promise<FormResult>;
}

function resize(rows: PlayerRow[], n: number): PlayerRow[] {
  const out = rows.slice(0, n);
  while (out.length < n) out.push({ name: '', picks: '' });
  return out;
}

const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-brand-400';

export function SweepstakeForm({
  initialName = '',
  initialTeamsPerPlayer = 8,
  initialPlayers,
  lockTeamsPerPlayer = false,
  allowGenerate = false,
  submitLabel,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName);
  const [tpp, setTpp] = useState(initialTeamsPerPlayer);
  const [players, setPlayers] = useState<PlayerRow[]>(
    initialPlayers ?? resize([], 48 / initialTeamsPerPlayer),
  );
  const [generate, setGenerate] = useState(false);
  const [mode, setMode] = useState<GenerateMode>('balanced');
  const [issues, setIssues] = useState<PickIssue[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const changeTpp = (v: number): void => {
    setTpp(v);
    setPlayers((p) => resize(p, 48 / v));
  };
  const setRow = (i: number, patch: Partial<PlayerRow>): void =>
    setPlayers((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setIssues([]);
    setErrors([]);
    const drawing = allowGenerate && generate;
    const input: SweepstakeInput = {
      name: name.trim(),
      teamsPerPlayer: tpp,
      players: players.map((r) => ({
        name: r.name.trim(),
        picks: drawing
          ? []
          : r.picks
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
      })),
      ...(drawing ? { generate: { mode } } : {}),
    };
    const res = await onSubmit(input);
    if (!res.ok) {
      setIssues(res.issues ?? []);
      setErrors(res.errors ?? []);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Name</span>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dave's Mates"
          required
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Teams per player
        </span>
        <select
          className={inputCls}
          value={tpp}
          disabled={lockTeamsPerPlayer}
          onChange={(e) => changeTpp(Number(e.target.value))}
        >
          {DIVISORS.map((d) => (
            <option key={d} value={d}>
              {d} teams each · {48 / d} players
            </option>
          ))}
        </select>
      </label>

      {allowGenerate && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={generate}
              onChange={(e) => setGenerate(e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            <span className="text-sm font-medium">Draw the teams for me 🎲</span>
          </label>
          {generate && (
            <fieldset className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              {(
                [
                  ['balanced', 'Balanced', 'One team from each ranking tier - fairer spread'],
                  ['chaos', 'Complete chaos', 'Fully random... anything goes'],
                ] as const
              ).map(([value, title, desc]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border p-2.5 text-sm ${
                    mode === value
                      ? 'border-brand-400 bg-brand-500/10'
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="generate-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                      className="accent-brand-500"
                    />
                    {title}
                  </span>
                  <span className="mt-0.5 block pl-6 text-[11px] text-slate-400">{desc}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Players ({players.length}) —{' '}
          {generate
            ? 'just the names; we’ll draw their teams'
            : `${tpp} team${tpp > 1 ? 's' : ''} each, all 48 between them`}
        </p>
        {players.map((r, i) => (
          <div key={i} className="space-y-1.5 rounded-xl border border-white/10 bg-white/5 p-3">
            <input
              className={inputCls}
              value={r.name}
              onChange={(e) => setRow(i, { name: e.target.value })}
              placeholder={`Player ${i + 1} name`}
            />
            {!generate && (
              <input
                className={inputCls}
                value={r.picks}
                onChange={(e) => setRow(i, { picks: e.target.value })}
                placeholder={`${tpp} teams, comma-separated`}
              />
            )}
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">
          {errors.map((er, i) => (
            <li key={i}>• {er}</li>
          ))}
        </ul>
      )}
      {issues.length > 0 && (
        <div className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-300">
          <p className="font-medium">Couldn&apos;t match these teams:</p>
          <ul className="space-y-0.5">
            {issues.map((is, i) => (
              <li key={i}>
                • <span className="text-amber-200">{is.player}</span>: “{is.rawName}”
                {is.suggestion ? ` — did you mean ${is.suggestion}?` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors active:bg-brand-600 disabled:opacity-50"
      >
        {busy ? 'Working…' : submitLabel}
      </button>
    </form>
  );
}
