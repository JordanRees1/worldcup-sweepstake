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

    // Knockout slot resolution: fill whichever team IDs are known (a side may resolve before its
    // opponent — e.g. one feeding match finished while the other hasn't).
    if (slot) {
      if (slot.homeTeamId !== null) next.homeTeamId = slot.homeTeamId;
      if (slot.awayTeamId !== null) next.awayTeamId = slot.awayTeamId;
    }

    if (dto) {
      next.status = dto.status;
      // Live match clock + stoppage time (when the provider supplies them for an in-play game).
      if (dto.minute != null) next.minute = dto.minute;
      if (dto.injuryTime != null) next.injuryTime = dto.injuryTime;
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
