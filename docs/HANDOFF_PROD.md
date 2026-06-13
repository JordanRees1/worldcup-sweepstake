# Production Handoff — Azure Deployment Plan

> ⚠️ **Superseded — historical planning doc.** This described the original containerise/deploy plan
> (a two-app `SWEEPSTAKE=work`/`friends` setup). The app is now a **single multi-tenant gateway**
> deployed at **sstake.co.uk**, and the canonical deployment guide is
> [`DEPLOYMENT.md`](./DEPLOYMENT.md) (with [`MULTI_TENANT_PLAN.md`](./MULTI_TENANT_PLAN.md) for the
> consolidation). Use those, not this, for anything operational. Kept for history.

**Context:** This is a World Cup 2026 sweepstake web app. WP0–WP7 are complete, all user-testing
fixes are done, and Phase 1+2 of the multi-instance work is committed. This document is for the
next agent to design and build Phase 3 (containerise) and Phase 4 (deploy to Azure).

Read `CLAUDE.md`, `docs/DEVELOPMENT.md`, and `docs/HANDOFF.md` first — they cover the full
architecture. This document covers only the production-specific decisions still outstanding.

---

## 1. Where we are

| Phase | Status | Commit |
|-------|--------|--------|
| 1 — Config-driven sweepstakes (`SWEEPSTAKE` env, per-game picks folders) | ✅ done | `37e5cfc` |
| 2 — Bracket player filter wraps to multiple rows (24-player support) | ✅ done | `830b704` |
| 3 — Express serves built web assets + Dockerfile | ⏳ next | — |
| 4 — Deploy to Azure Container Apps, wire secrets, docs | ⏳ after | — |

**The two sweepstakes:**
- `friends` — 6 players × 8 teams (the original game, fully tested)
- `work` — 24 players × 2 teams (`datasets/sweepstakes/work/player_picks.csv` populated, 48/48 picks matched)

---

## 2. Phase 3 — Containerise

### 2a. Express serves the built web

In dev, Vite runs on `:5173` and proxies `/api` to Express on `:8787`. In production there is
no Vite — the web build is static HTML/JS/CSS in `web/dist/`. Express should serve it.

> ✅ **Implemented.** Production static serving (`server/src/app.ts`, guarded by `NODE_ENV`),
> the multi-stage `Dockerfile` (repo root), and a fast-boot **esbuild server bundle** are all
> done. The server no longer runs TypeScript through `tsx` at runtime — it ships a pre-built
> `server/dist/index.js` that plain `node` runs (cold boot ≈0.5s locally vs ≈1–1.6s under tsx).
> See `docs/DEPLOYMENT.md` for the canonical guide. The notes below are the original plan.

What needs doing:
- Add a static-file middleware route to `server/src/app.ts` (something like
  `express.static(path.join(__dirname, '../../web/dist'))` + a catch-all `index.html` fallback
  for client-side routing). **Guard this behind a `NODE_ENV === 'production'` check** so dev
  is unaffected.
- Verify the Vite build output path (`web/dist`) and the Express resolve path match.
- Test that `npm run build && node server/src/index.js` (or `tsx server/src/index.ts`) serves
  the web on the same port as the API (default 8787 in prod, or whatever `PORT` is set to).

### 2b. Dockerfile

A single-stage or multi-stage Dockerfile. Suggested approach:

```
# Stage 1 — build the web
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build -w @sweepstake/shared && npm run build -w @sweepstake/web

# Stage 2 — production image
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/datasets ./datasets
COPY --from=builder /app/package*.json ./
ENV NODE_ENV=production PORT=80
EXPOSE 80
CMD ["node", "server/dist/index.js"]   # pre-built esbuild bundle — no tsx at runtime
```

Notes:
- The `datasets/` folder is COPY'd into the image — it contains the tournament CSVs and the
  sweepstake picks CSVs (no secrets). The `server/.env` is NOT copied (gitignored, secrets).
- The server is bundled with **esbuild** at build time (`npm run bundle -w @sweepstake/server`
  → `server/dist/index.js`, with `@sweepstake/shared` inlined). Runtime is plain `node`, so the
  image carries no `tsx` and does no on-boot transpilation. Root-relative paths (datasets,
  web/dist) resolve via `APP_ROOT` (set to `/app` in the image) — see `server/src/data/paths.ts`.
- The `SWEEPSTAKE` env var selects which game to serve (see §3 below).
- Add a `.dockerignore` to exclude `node_modules`, `web/dist` (rebuilt in the image),
  `server/.env`, and `datasets/sweepstakes/**/picks.normalized.json`.

### 2c. Verify locally

```bash
docker build -t sweepstake .
docker run -e SWEEPSTAKE=friends -e FOOTBALL_API_KEY=<key> -e DATA_SOURCE=live -p 8080:80 sweepstake
# open http://localhost:8080
```

---

## 3. The multi-sweepstake routing question (UNRESOLVED — needs design)

This is the key design question Jordan wants to discuss. In dev, you run two separate processes
with different `SWEEPSTAKE` env vars on different ports. In prod, there are two options:

### Option A — One container per sweepstake (two deployments)

Deploy two separate Azure Container App instances from the same image:
- `https://sweepstake-friends.azurecontainerapps.io` → `SWEEPSTAKE=friends`
- `https://sweepstake-work.azurecontainerapps.io` → `SWEEPSTAKE=work`

**Pros:** Completely isolated. Simple. Each game has its own URL — just share the link.
No multi-tenancy logic in the app at all. Separate API keys per instance if needed.
**Cons:** Two deployments to update when the app changes. Two sets of secrets to manage.
Cost is negligible (scale-to-zero on free tier).
**Jordan's take:** Leaning toward this. Clean and simple.

### Option B — One container, sweepstake selected via URL path

A single deployment serves both games at `/friends/` and `/work/`. Express reads the
sweepstake slug from the URL path and re-routes to the right data. The React app is aware
of its base path.

**Pros:** One deployment, one update cycle.
**Cons:** Significantly more complex — requires path-prefix routing in both Express and Vite,
React Router `basename`, and either loading both sweepstakes at startup or lazy-loading.
Not worth it for 2 games.

**Recommendation: Option A.** The two-deployment approach is by far simpler and costs
nothing extra at this scale. The "one update cycle" benefit of Option B is minor (deploying
to Azure Container Apps is a single `az` command) and not worth the complexity.

---

## 4. Access / identity design (UNRESOLVED — Jordan's ask)

Jordan asked: how do users access their specific sweepstake in production? Options discussed:

### Option A — URL is the identity (recommended)
The full URL already identifies the game. Jordan shares:
- Friends: `https://sweepstake-friends.azurecontainerapps.io`
- Work: `https://sweepstake-work.azurecontainerapps.io`

No login, no token, no friction. Works in any browser, bookmarkable, shareable.
The app is read-only (no writes, no accounts, no personal data), so access control
is just "who has the link". If you want minimal obscurity, use less-guessable slugs
(e.g. `sweepstake-abc123.azurecontainerapps.io`).

### Option B — Short URL token (e.g. 4-char code in the path)
`https://sweepstake.yourdomain.com/xk7p` → friends game.
`https://sweepstake.yourdomain.com/m4qz` → work game.
Requires a custom domain (cheap, ~£10/yr) and a router that maps tokens to sweepstakes.
Adds complexity but gives a much nicer shareable link.

### Option C — Persistent token in URL (no re-entry)
As Jordan requested: user visits the URL once, the token is part of the path, and the
browser bookmark/history means they never have to enter it again. This is essentially
Option A or B — the "token" is the URL itself. A separate login step would be overkill
for a read-only app.

**Recommendation:** Start with Option A (free Azure subdomain, URL = identity).
Once deployed and working, optionally add a custom domain (Option B) for polish.
No need for a login screen on a public read-only app.

---

## 5. Azure deployment specifics

### Target service
**Azure Container Apps** — serverless containers, scale-to-zero (cost ~£0 on free grant),
built-in HTTPS subdomain, easy secret injection.

**Jordan's Azure context:** Visual Studio / MPN subscription with ~£140/mo credit.
Per Microsoft terms, this is a **dev/test** subscription — fine for building and
testing. For the always-on production instance, either:
(a) Use the **free monthly grant** on Azure Container Apps (no billing, just needs a card
    on file for identity verification), or
(b) If the subscription owner confirms personal side projects are OK under their org's MPN terms.

### Secrets management
- `FOOTBALL_API_KEY` → Azure Container Apps secret (never in the image or in source)
- `DATA_SOURCE=live` → set as an environment variable in the Container App
- `SWEEPSTAKE=friends` (or `work`) → environment variable per deployment

### Rough deployment steps (for Phase 4 documentation)
```bash
# Login
az login
az acr login --name <registry>

# Build + push
docker build -t sweepstake .
docker tag sweepstake <registry>.azurecr.io/sweepstake:latest
docker push <registry>.azurecr.io/sweepstake:latest

# Deploy friends game
az containerapp create \
  --name sweepstake-friends \
  --env-vars SWEEPSTAKE=friends DATA_SOURCE=live FOOTBALL_API_KEY=secretref:api-key \
  --image <registry>.azurecr.io/sweepstake:latest \
  --ingress external --target-port 80

# Deploy work game (same image, different env)
az containerapp create \
  --name sweepstake-work \
  --env-vars SWEEPSTAKE=work DATA_SOURCE=live FOOTBALL_API_KEY=secretref:api-key \
  ...
```

### Domain / URL
- No purchase needed to start: Azure gives `https://<name>.<region>.azurecontainerapps.io`
- Optional custom domain later: buy `yoursweepstake.co.uk` (~£8/yr), attach via Azure portal,
  then serve `friends.yoursweepstake.co.uk` and `work.yoursweepstake.co.uk`. Custom domain
  requires at minimum the Consumption tier (effectively free at this scale).

---

## 6. Documentation Jordan wants alongside Phase 3/4

Jordan is new to hosting and wants clear, split documentation:

1. **Dev workflow** — how to run locally (seed, live, scenarios) — already in `docs/DEVELOPMENT.md`
2. **Building the container** — how to `docker build` and `docker run` locally to test prod mode
3. **Deploying to Azure** — step-by-step first-time setup + how to redeploy when code changes
4. **Adding a new sweepstake** — add folder, fill picks CSV, run report:picks, set env var, deploy
5. **Switching data source** — how `DATA_SOURCE=live` vs `seed` works, where the API key goes

This documentation should live in `docs/DEPLOYMENT.md`.

---

## 7. Decisions needed before Phase 3 starts

1. **Routing model confirmed?** Recommendation is Option A (one container per sweepstake).
   If yes, Phase 3 can proceed without any routing changes to the app.

2. **TypeScript compilation in Docker?** Cleaner to add `tsc` output for production rather than
   running `tsx` in the container. Requires adding a `dist/` output target to `server/tsconfig.json`
   and updating the `CMD`. Worth doing properly.

3. **Azure subscription confirmed OK for personal use?** Clarify before billing starts.
   Free tier alternative if not: Azure Container Apps free grant (750 vCPU-s and 1500 GiB-s/mo)
   covers this workload comfortably.
