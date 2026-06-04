import type { Match } from '@sweepstake/shared';
import type { MatchResultDTO, ResolvedSlotDTO } from '../providers';

/**
 * Overlay provider results + resolved knockout slots onto the canonical (structural) matches.
 * Pure and immutable — returns a new array; the engine then consumes the hydrated matches.
 */
export function applyResults(
  matches: Match[],
  results: MatchResultDTO[],
  slots: ResolvedSlotDTO[],
): Match[] {
  const resultById = new Map(results.map((r) => [r.matchId, r]));
  const slotById = new Map(slots.map((s) => [s.matchId, s]));

  return matches.map((m) => {
    const dto = resultById.get(m.id);
    const slot = slotById.get(m.id);
    if (!dto && !slot) return m;

    const next: Match = { ...m };

    // Knockout slot resolution: fill the two team IDs once the API knows them.
    if (slot) {
      next.homeTeamId = slot.homeTeamId;
      next.awayTeamId = slot.awayTeamId;
    }

    if (dto) {
      next.status = dto.status;
      // Only attach a result once there are actual scores.
      if (dto.homeScore !== null && dto.awayScore !== null) {
        next.result = {
          homeScore: dto.homeScore,
          awayScore: dto.awayScore,
          ...(dto.homePenalties !== null ? { homePenalties: dto.homePenalties } : {}),
          ...(dto.awayPenalties !== null ? { awayPenalties: dto.awayPenalties } : {}),
          winnerTeamId: dto.winnerTeamId,
        };
      }
    }

    return next;
  });
}
