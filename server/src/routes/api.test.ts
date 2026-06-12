import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ApiError,
  BracketResponse,
  GroupsResponse,
  MatchesResponse,
  MetaResponse,
  OverviewResponse,
  ScheduleResponse,
  TeamsResponse,
} from '@sweepstake/shared';
import { createApp } from '../app';
import { loadStructural } from '../data/dataset';
import { createSeedProvider } from '../providers/seedProvider';
import { createGateway } from '../services/appState';

async function getJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe('API routes (in-process HTTP, seed mode, multi-tenant gateway)', () => {
  let server: Server;
  let base: string;
  const code = 'crackers'; // the friends sweepstake (6 players)

  beforeAll(async () => {
    const gateway = createGateway(loadStructural(), createSeedProvider(), 1000);
    const app = createApp(gateway, { port: 0, dataSource: 'seed', cacheTtlMs: 1000, version: 'test' });
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const { port } = server.address() as AddressInfo;
    base = `http://127.0.0.1:${port}/api`;
  });

  afterAll(() => {
    server.close();
  });

  it('GET /health → ok + seed + version (global, no tenant)', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ ok: true, dataSource: 'seed', version: 'test' });
  });

  it('GET /s/:code/meta → code + player count', async () => {
    const body = await getJson<MetaResponse>(await fetch(`${base}/s/${code}/meta`));
    expect(body).toMatchObject({ code, playerCount: 6 });
  });

  it('GET /s/:code/overview → Group Stage + 6 players', async () => {
    const body = await getJson<OverviewResponse>(await fetch(`${base}/s/${code}/overview`));
    expect(body.currentStage).toBe('Group Stage');
    expect(body.leaderboard).toHaveLength(6);
  });

  it('GET /s/:code/groups → 12 tables', async () => {
    const body = await getJson<GroupsResponse>(await fetch(`${base}/s/${code}/groups`));
    expect(body.groups).toHaveLength(12);
  });

  it('GET /s/:code/teams → 48 with status', async () => {
    const body = await getJson<TeamsResponse>(await fetch(`${base}/s/${code}/teams`));
    expect(body.teams).toHaveLength(48);
    expect(body.teams[0]?.status.teamId).toBe(body.teams[0]?.team.id);
  });

  it('GET /s/:code/bracket → 6 rounds', async () => {
    const body = await getJson<BracketResponse>(await fetch(`${base}/s/${code}/bracket`));
    expect(body.rounds).toHaveLength(6);
  });

  it('GET /s/:code/matches?group=A → 6', async () => {
    const body = await getJson<MatchesResponse>(await fetch(`${base}/s/${code}/matches?group=A`));
    expect(body.matches).toHaveLength(6);
  });

  it('GET /s/:code/schedule → days present', async () => {
    const body = await getJson<ScheduleResponse>(await fetch(`${base}/s/${code}/schedule`));
    expect(body.days.length).toBeGreaterThan(0);
  });

  it('GET /s/:code/players/:id → 404 envelope for unknown player', async () => {
    const res = await fetch(`${base}/s/${code}/players/9999`);
    expect(res.status).toBe(404);
    expect((await getJson<ApiError>(res)).error.code).toBe('not_found');
  });

  it('GET /s/:code/players/abc → 400 for non-numeric id', async () => {
    const res = await fetch(`${base}/s/${code}/players/abc`);
    expect(res.status).toBe(400);
  });

  it('GET /s/zzzz/overview → 404 for an unknown sweepstake code', async () => {
    const res = await fetch(`${base}/s/zzzz/overview`);
    expect(res.status).toBe(404);
    expect((await getJson<ApiError>(res)).error.code).toBe('not_found');
  });

  it('unknown route → 404 envelope', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect((await getJson<ApiError>(res)).error.code).toBe('not_found');
  });
});
