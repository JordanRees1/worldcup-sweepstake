import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { AdminSweepstake } from '@sweepstake/shared';
import { loadStructural, loadTenantDataset } from '../data/dataset';
import { listSweepstakes, resolveSweepstakeByCode } from '../data/sweepstake';
import type { TenantRecord, TenantStore } from '../data/tenantStore';
import type { ServerConfig } from '../env';
import type { AppState, Gateway } from '../services/appState';
import { createMetrics } from '../services/metrics';
import {
  buildBracket,
  buildGroups,
  buildMatches,
  buildMeta,
  buildOverview,
  buildPlayerDetail,
  buildPlayers,
  buildSchedule,
  buildTeams,
  buildVenues,
} from '../services/responses';
import { buildTenant, generateRoster, type RosterInput } from '../services/sweepstakeCreate';

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    handler(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal error';
      console.error('[api] error:', message);
      res.status(500).json({ error: { code: 'internal_error', message } });
    });
  };
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function createApiRouter(gateway: Gateway, store: TenantStore, config: ServerConfig): Router {
  const router = Router();
  const structural = loadStructural(); // teams/matches/venues (loaded once)
  const teams = structural.teams; // for create/validate normalization
  const metrics = createMetrics(); // best-effort, in-memory usage signals

  const header = (req: Request, name: string): string => (req.header(name) ?? '').trim();
  const createAllowed = (req: Request): boolean =>
    !config.createToken || header(req, 'x-create-token') === config.createToken;
  const isAdmin = (req: Request): boolean =>
    !!config.adminToken && header(req, 'x-admin-token') === config.adminToken;
  const ownerOrAdmin = (req: Request, record: TenantRecord): boolean => {
    if (isAdmin(req)) return true;
    const tok = header(req, 'x-owner-token');
    return !!record.ownerTokenHash && !!tok && sha256(tok) === record.ownerTokenHash;
  };

  async function uniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = randomBytes(3).toString('hex');
      if (!resolveSweepstakeByCode(code) && !(await store.resolve(code))) return code;
    }
    throw new Error('could not allocate a unique code');
  }

  // ── Global ──────────────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => {
    const meta = gateway.meta();
    res.json({ ok: true, dataSource: meta.source, lastUpdated: meta.lastUpdated, version: config.version });
  });

  // ── Admin (global token) ────────────────────────────────────────────────────────
  router.get(
    '/a/admin',
    asyncRoute(async (req, res) => {
      if (!isAdmin(req)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or missing admin token' } });
        return;
      }
      const baked: AdminSweepstake[] = listSweepstakes().map((cfg) => {
        const m = metrics.snapshot(cfg.code);
        return {
          code: cfg.code,
          name: cfg.name,
          kind: 'baked',
          teamsPerPlayer: cfg.teamsPerPlayer,
          playerCount: loadTenantDataset(structural, cfg).players.length,
          createdAt: null,
          views: m.views,
          activeNow: m.activeNow,
        };
      });
      const bakedCodes = new Set(baked.map((b) => b.code));
      const custom: AdminSweepstake[] = (await store.list())
        .filter((r) => !bakedCodes.has(r.code.toLowerCase())) // a baked code shadows the store
        .map((r) => {
          const m = metrics.snapshot(r.code);
          return {
            code: r.code,
            name: r.name,
            kind: 'custom' as const,
            teamsPerPlayer: r.teamsPerPlayer,
            playerCount: r.players.length,
            createdAt: r.createdAt,
            views: m.views,
            activeNow: m.activeNow,
          };
        });
      const sweepstakes = [...baked, ...custom];
      res.json({
        totals: {
          sweepstakes: sweepstakes.length,
          players: sweepstakes.reduce((n, s) => n + s.playerCount, 0),
        },
        metricsNote: 'Views/active-now are best-effort, per-replica, and reset on restart.',
        sweepstakes,
      });
    }),
  );

  // ── Create / validate ─────────────────────────────────────────────────────────
  router.post(
    '/sweepstakes/validate',
    asyncRoute(async (req, res) => {
      const result = buildTenant(teams, req.body as RosterInput);
      res.json(result);
    }),
  );

  router.post(
    '/sweepstakes',
    asyncRoute(async (req, res) => {
      if (!createAllowed(req)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or missing create token' } });
        return;
      }
      const input = req.body as RosterInput;
      // Either draw the teams for them (generate) or resolve the roster they typed.
      const result = input.generate
        ? generateRoster(teams, { ...input, generate: input.generate })
        : buildTenant(teams, input);
      if (!result.ok || !result.players || !result.picks) {
        res.status(422).json({
          error: { code: 'validation', message: 'Could not create sweepstake' },
          issues: result.issues ?? [],
          errors: result.errors ?? [],
        });
        return;
      }
      const code = await uniqueCode();
      const ownerToken = randomBytes(16).toString('hex');
      const record: TenantRecord = {
        code,
        name: input.name.trim(),
        teamsPerPlayer: input.teamsPerPlayer,
        players: result.players,
        picks: result.picks,
        createdAt: new Date().toISOString(),
        ownerTokenHash: sha256(ownerToken),
      };
      await store.save(record);

      // For a generated draw, reveal who got which teams on the success screen.
      let roster: { name: string; teams: string[] }[] | undefined;
      if (input.generate) {
        const teamName = new Map(teams.map((t) => [t.id, t.name]));
        const byPlayer = new Map<number, string[]>(result.players.map((p) => [p.id, []]));
        for (const pk of result.picks) {
          byPlayer.get(pk.playerId)?.push(teamName.get(pk.teamId) ?? `#${pk.teamId}`);
        }
        roster = result.players.map((p) => ({ name: p.name, teams: byPlayer.get(p.id) ?? [] }));
      }
      res.status(201).json({ code, ownerToken, ...(roster ? { roster } : {}) });
    }),
  );

  // ── Edit / delete (owner token or global admin) ────────────────────────────────
  router.patch(
    '/s/:code',
    asyncRoute(async (req, res) => {
      const code = req.params.code.toLowerCase();
      if (resolveSweepstakeByCode(code)) {
        res.status(403).json({ error: { code: 'forbidden', message: 'Built-in sweepstakes cannot be edited' } });
        return;
      }
      const record = await store.resolve(code);
      if (!record) {
        res.status(404).json({ error: { code: 'not_found', message: `No sweepstake "${code}"` } });
        return;
      }
      if (!ownerOrAdmin(req, record)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid owner/admin token' } });
        return;
      }
      const body = req.body as Partial<RosterInput>;
      let next: TenantRecord = { ...record };
      if (typeof body.name === 'string' && body.name.trim()) next.name = body.name.trim();
      if (body.players) {
        const result = buildTenant(teams, {
          name: next.name,
          teamsPerPlayer: body.teamsPerPlayer ?? record.teamsPerPlayer,
          players: body.players,
        });
        if (!result.ok || !result.players || !result.picks) {
          res.status(422).json({
            error: { code: 'validation', message: 'Could not update sweepstake' },
            issues: result.issues ?? [],
            errors: result.errors ?? [],
          });
          return;
        }
        next = {
          ...next,
          teamsPerPlayer: body.teamsPerPlayer ?? record.teamsPerPlayer,
          players: result.players,
          picks: result.picks,
        };
      }
      await store.save(next);
      gateway.invalidate(code);
      res.json({ code, name: next.name });
    }),
  );

  router.delete(
    '/s/:code',
    asyncRoute(async (req, res) => {
      const code = req.params.code.toLowerCase();
      if (resolveSweepstakeByCode(code)) {
        res.status(403).json({ error: { code: 'forbidden', message: 'Built-in sweepstakes cannot be deleted' } });
        return;
      }
      const record = await store.resolve(code);
      if (!record) {
        res.status(404).json({ error: { code: 'not_found', message: `No sweepstake "${code}"` } });
        return;
      }
      if (!ownerOrAdmin(req, record)) {
        res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid owner/admin token' } });
        return;
      }
      await store.remove(code);
      gateway.invalidate(code);
      res.status(204).end();
    }),
  );

  // ── Tenant reads (/api/s/:code/*) ──────────────────────────────────────────────
  const tenant = (handler: (state: AppState, req: Request, res: Response) => void) =>
    asyncRoute(async (req, res) => {
      const state = await gateway.get(req.params.code);
      if (!state) {
        res
          .status(404)
          .json({ error: { code: 'not_found', message: `No sweepstake with code "${req.params.code}"` } });
        return;
      }
      handler(state, req, res);
    });

  router.get(
    '/s/:code/meta',
    tenant((s, req, res) => {
      metrics.track(s.sweepstake.code, header(req, 'x-client-id') || undefined);
      res.json(buildMeta(s));
    }),
  );
  router.get('/s/:code/overview', tenant((s, _req, res) => res.json(buildOverview(s))));
  router.get('/s/:code/players', tenant((s, _req, res) => res.json(buildPlayers(s))));
  router.get(
    '/s/:code/players/:id',
    tenant((s, req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: { code: 'bad_request', message: 'Invalid player id' } });
        return;
      }
      const detail = buildPlayerDetail(s, id);
      if (!detail) {
        res.status(404).json({ error: { code: 'not_found', message: `Player ${id} not found` } });
        return;
      }
      res.json(detail);
    }),
  );
  router.get('/s/:code/teams', tenant((s, _req, res) => res.json(buildTeams(s))));
  router.get('/s/:code/venues', tenant((s, _req, res) => res.json(buildVenues(s))));
  router.get('/s/:code/groups', tenant((s, _req, res) => res.json(buildGroups(s))));
  router.get('/s/:code/bracket', tenant((s, _req, res) => res.json(buildBracket(s))));
  router.get(
    '/s/:code/matches',
    tenant((s, req, res) => {
      const { stage, group, date } = req.query;
      res.json(
        buildMatches(s, {
          stage: typeof stage === 'string' ? stage : undefined,
          group: typeof group === 'string' ? group : undefined,
          date: typeof date === 'string' ? date : undefined,
        }),
      );
    }),
  );
  router.get('/s/:code/schedule', tenant((s, _req, res) => res.json(buildSchedule(s))));

  return router;
}
