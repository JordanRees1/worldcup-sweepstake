import { describe, expect, it } from 'vitest';
import { STAGE_NAMES } from './index';

describe('STAGE_NAMES', () => {
  it('lists the seven 2026 tournament stages in order', () => {
    expect(STAGE_NAMES).toHaveLength(7);
    expect(STAGE_NAMES[0]).toBe('Group Stage');
    expect(STAGE_NAMES.at(-1)).toBe('Final');
  });
});
