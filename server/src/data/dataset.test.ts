import { describe, expect, it } from 'vitest';
import { loadDataset } from './dataset';
import { validateDataset } from './validate';

describe('loadDataset', () => {
  it('loads and validates the full tournament', () => {
    const ds = loadDataset();
    expect(ds.teams).toHaveLength(48);
    expect(ds.venues).toHaveLength(16);
    expect(ds.stages).toHaveLength(7);
    expect(ds.matches).toHaveLength(104);
    expect(ds.players).toHaveLength(6);
    expect(ds.picks).toHaveLength(48);
  });

  it('does not throw on the real, well-formed data', () => {
    expect(() => loadDataset({ validate: true })).not.toThrow();
  });

  it('throws a combined error when the data is structurally broken', () => {
    const ds = loadDataset();
    const broken = { ...ds, teams: ds.teams.slice(0, 47) };
    expect(() => validateDataset(broken)).toThrow(/validation failed/i);
  });
});
