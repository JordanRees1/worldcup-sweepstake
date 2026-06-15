# Deployment Guide

This guide covers everything from running the app locally in dev mode through to deploying
it as a live hosted container on Azure. Read it top to bottom the first time; after that you
only need the relevant section.

---

## Part 1 — Local development (how things work on your laptop)

### How dev mode works

Running `npm run dev` starts **two processes** side by side:

```
Terminal                        Your browser
─────────────────────────────────────────────────────
npm run dev
  ├── Express API  :8787   ←── /api/* requests
  └── Vite web    :5173   ←── http://localhost:5173
            │
            └── Vite proxies /api/* to :8787
                (so the browser only talks to one port)
```

- The **API** (`server/`) reads your CSVs, calls football-data.org (or uses seed data), and
  computes the leaderboard, standings, etc.
- The **web** (`web/`) is React + TypeScript served hot-reload by Vite. It calls `/api/*`
  which Vite silently forwards to the Express server.
- The two processes are completely independent — you can restart the server without losing
  your browser state.

### Dev commands

```bash
npm run dev              # gateway + web (seed/no-API mode) — all sweepstakes by code
npm run dev:group-stage  # demo: matchday 1+2 done
npm run dev:quarters     # demo: groups + R32 + R16 done
npm run dev:final        # demo: everything through the semis, Final tomorrow
npm run dev:live-demo    # demo: some matches in play (LIVE badge)

# Live results (needs server/.env with FOOTBALL_API_KEY set — see server/.env.example):
DATA_SOURCE=live npm run dev       # macOS/Linux
$env:DATA_SOURCE="live"; npm run dev  # Windows PowerShell
```

### Working with sweepstakes locally

The gateway serves every sweepstake at once by code — no env switch. The two committed (baked)
ones are at `/s/crackers` (6×8) and `/s/aa26` (24×2); the landing page (`/`) is the picker.
To add one, either commit a baked sweepstake under `datasets/sweepstakes/<slug>/` or create a
runtime one with `npm run sweepstake:create -- …` (writes to `datasets/tenants/` in dev). See
[Part 5](#part-5--adding-a-new-sweepstake).

---

## Part 2 — Production mode (how it works when deployed)

### How production differs from dev

In production there is **no Vite**. The web was built once into static files (`web/dist/`)
and Express serves them directly. Everything runs from a single port:

```
Browser                         Container (single process)
────────────────────────────────────────────────────────────
                                Express on PORT (default 8080)
GET /            ───────────►  serve web/dist/index.html
GET /players     ───────────►  serve web/dist/index.html  (React Router handles it)
GET /api/health  ───────────►  API route
GET /api/overview ──────────►  API route
```

This means:
- One port, one process, one container — no separate Vite server
- `/api/*` is still the Express API
- Everything else is the React app (client-side routing handles the rest)
- CORS is disabled (the web and API are the same origin)

### Environment variables in production

The server is a **multi-tenant gateway** — one container hosts every sweepstake by code, so there
is no per-game `SWEEPSTAKE` var.

| Variable | Required | Example | Notes |
|---|---|---|---|
| `DATA_SOURCE` | No | `live` | `seed` (offline) or `live` (API). Default: `seed` |
| `FOOTBALL_API_KEY` | If `DATA_SOURCE=live` | `abc123...` | From football-data.org. **Secret — never in the image** |
| `AZURE_STORAGE_ACCOUNT` | For self-service | `sstkcb76f50e` | Set → Blob tenant store; unset → local dir. Authed by managed identity |
| `CREATE_TOKEN` | For self-service | `…` | **Seeds** the one-time create password (then it rotates in the store after each create; current value on `/a/admin`). **Secret** |
| `ADMIN_TOKEN` | For admin panel | `…` | Global admin (edit any + `/a/admin`). **Secret** |
| `PORT` | No | `8080` | Azure sets this automatically |
| `RESULTS_CACHE_TTL_SECONDS` | No | `30` | How long to cache API results in memory |
| `NODE_ENV` | Set in Dockerfile | `production` | Already set — do not override |

**Secrets are always host-managed** — set them as Azure Container App secrets (`secretref:`),
never in the image or in source control. The tenant store needs no secret: the container's
**system-assigned managed identity** (granted *Storage Blob Data Contributor* on the account)
authenticates to Blob.

---

## Part 3 — Building and testing the container locally

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

### Build the image

```bash
# From the repo root:
docker build -t sweepstake .
```

This takes ~2 minutes the first time (npm ci + Vite build). Subsequent builds are fast —
Docker caches each layer, so only changed layers rebuild.

### Run it locally

```bash
# Seed mode (no API key, offline data):
docker run --rm -p 8080:8080 sweepstake

# Live mode with your real API key:
docker run --rm -p 8080:8080 \
  -e DATA_SOURCE=live \
  -e FOOTBALL_API_KEY=your_key_here \
  sweepstake

# With self-service enabled (local dir store, create + admin tokens):
docker run --rm -p 8080:8080 \
  -e CREATE_TOKEN=test-create -e ADMIN_TOKEN=test-admin sweepstake
```

Open http://localhost:8080 — the landing page (picker / enter-a-code / create). The
`● seed` / `● live` badge in the header tells you which mode it's running in.

### What to verify

- [ ] `http://localhost:8080/` loads the landing / picker
- [ ] `http://localhost:8080/api/health` returns `{"ok":true,...}`
- [ ] `http://localhost:8080/s/crackers` loads the 6-player game; `/s/aa26` the 24-player one
- [ ] `http://localhost:8080/s/crackers/groups` and `/bracket` load (React Router)
- [ ] The header shows `● seed` (or `● live` if you passed a key)
- [ ] `GET /api/a/admin` with `x-admin-token` lists the sweepstakes (if `ADMIN_TOKEN` set)

---

## Part 4 — Deploying to Azure Container Apps

> **Where it lives now (migrated June 2026):** the apps run in the **work subscription**
> `Sandbox` (`94442dd5-4818-4620-8e2d-c557baf52b6b`), resource group
> `rg-personal-n-jordan-rg-jordan-sandbox`, region **uksouth**. The image is hosted on
> **GitHub Container Registry (GHCR)**, not Azure Container Registry.

### Architecture: one image, one app (multi-tenant gateway)

A **single** container app hosts every sweepstake by code (consolidated June 2026 — the old
second app `sweepstake-dev` was deleted; its `friends` data lives on as the `crackers` tenant):

```
ghcr.io/jordanrees1/sweepstake:latest   (one public image)
        │
   env: sweepstake-env   (uksouth, in rg-personal-n-jordan-rg-jordan-sandbox)
        └── sweepstake-prod   →  https://sstake.co.uk            (apex, canonical)
                                  ├─ /s/aa26      "Advancing"  (24×2)
                                  ├─ /s/crackers  "Crackers"   (6×8)
                                  └─ /s/<code>    self-service tenants
                                 (old aa./crackers. subdomains 301 → /s/aa26, /s/crackers)
                              │
                       Azure Blob (account sstkcb76f50e, container `tenants`)
                       one JSON per runtime tenant — authed by the app's managed identity
```

The app: **0.25 vCPU / 0.5 GiB**, external ingress on `:8080`, `DATA_SOURCE=live`,
`RESULTS_CACHE_TTL_SECONDS=30`, **`min-replicas 1 / max-replicas 3`** (always-warm, bursts to 3),
a **system-assigned managed identity** with *Storage Blob Data Contributor* on `sstkcb76f50e`, and
these Azure secrets:

| Secret | Env var | Purpose |
|---|---|---|
| `football-api-key` | `FOOTBALL_API_KEY` | football-data.org key |
| `create-token` | `CREATE_TOKEN` | self-service create password |
| `admin-token` | `ADMIN_TOKEN` | global admin + `/a/admin` |

`AZURE_STORAGE_ACCOUNT=sstkcb76f50e` is a plain env var (not a secret) — it just names the account;
access is via managed identity.

### Prerequisites

- **Azure CLI** + **Docker Desktop** installed. On this Windows machine they aren't on PATH by
  default — prepend them in PowerShell:
  ```powershell
  $env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
  ```
- `az login`, then target the work sub:
  ```powershell
  az account set --subscription 94442dd5-4818-4620-8e2d-c557baf52b6b
  ```

### Routine redeploy (the common case)

After a code change is merged to `main`, rebuild → push → roll the app:

```powershell
$rg  = "rg-personal-n-jordan-rg-jordan-sandbox"
$sub = "94442dd5-4818-4620-8e2d-c557baf52b6b"

docker build -t ghcr.io/jordanrees1/sweepstake:latest .
docker push  ghcr.io/jordanrees1/sweepstake:latest

# A unique --revision-suffix forces the app to re-pull :latest
$suffix = (git rev-parse --short HEAD) + "-" + (Get-Date -Format 'MMddHHmm')
az containerapp update -n sweepstake-prod -g $rg --subscription $sub `
  --image ghcr.io/jordanrees1/sweepstake:latest --revision-suffix $suffix
```

Health-check: `https://sstake.co.uk/api/health` returns `{"ok":true,"dataSource":"live"}`, and
`https://sstake.co.uk/s/aa26` + `/s/crackers` load. (CI already pushed the image, so a routine
redeploy is just the one `az containerapp update` — no local build needed.)

> First GHCR push from a new machine needs a one-time `docker login ghcr.io` with a GitHub PAT
> (scope `write:packages`). The image is **public**, so the apps pull it with no registry creds.

### One-time setup (only if recreating from scratch)

The environment, app, and storage already exist. To rebuild from scratch in a fresh RG
(`$KEY` = football-data.org key, `$CREATE` / `$ADMIN` = your chosen tokens — never commit them):

```powershell
az containerapp env create -n sweepstake-env -g $rg --location uksouth --subscription $sub

# 1) Storage account for the tenant store (one tiny JSON per runtime sweepstake)
$STG = "sstkcb76f50e"   # globally-unique, lowercase
az storage account create -n $STG -g $rg --subscription $sub -l uksouth --sku Standard_LRS

# 2) The gateway app
az containerapp create -n sweepstake-prod -g $rg --subscription $sub `
  --environment sweepstake-env `
  --image ghcr.io/jordanrees1/sweepstake:latest `
  --target-port 8080 --ingress external `
  --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 3 `
  --secrets football-api-key=$KEY create-token=$CREATE admin-token=$ADMIN `
  --env-vars DATA_SOURCE=live RESULTS_CACHE_TTL_SECONDS=30 `
    AZURE_STORAGE_ACCOUNT=$STG `
    FOOTBALL_API_KEY=secretref:football-api-key `
    CREATE_TOKEN=secretref:create-token ADMIN_TOKEN=secretref:admin-token

# 3) Managed identity + Blob access (no secret needed for the store)
az containerapp identity assign -n sweepstake-prod -g $rg --subscription $sub --system-assigned
$PRINCIPAL = az containerapp show -n sweepstake-prod -g $rg --subscription $sub `
  --query identity.principalId -o tsv
$SCOPE = az storage account show -n $STG -g $rg --subscription $sub --query id -o tsv
az role assignment create --assignee $PRINCIPAL `
  --role "Storage Blob Data Contributor" --scope $SCOPE
```

The `tenants` blob container is auto-created on the first save. Then bind the custom domains
(Part 6).

### CI/CD — automated build on push to `main`

`.github/workflows/deploy.yml` runs on every push to `main`:

- **`build-and-push`** _(always runs, free)_ — builds the image and pushes
  `ghcr.io/jordanrees1/sweepstake:latest` + `:<sha>` to GHCR using the built-in `GITHUB_TOKEN`
  (no external secrets). Public repo → unlimited Actions minutes; private → 2,000 free min/month,
  ample here.
- **`deploy`** _(opt-in, off by default)_ — updates the `sweepstake-prod` Container App to the new
  image. It only runs when the repo **variable `DEPLOY_ENABLED` = `true`** and the Azure OIDC
  secrets are present.

**To enable auto-deploy** you need an Azure identity GitHub can assume. This requires creating an
app registration + federated credential in the **work tenant**, which a corporate sandbox may
restrict — ask IT if blocked:

1. Create an app registration + service principal; assign it **Contributor** on the resource group.
2. Add a **federated credential** trusting `repo:JordanRees1/worldcup-sweepstake:ref:refs/heads/main`.
3. Add repo **secrets** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
4. Add repo **variable** `DEPLOY_ENABLED=true`.

Until then the image still auto-builds on every push — you just run the one
`az containerapp update` from **Routine redeploy** above (fast: no local build needed, since CI
already pushed the image).

### Cost

We run **one** always-warm app at `--min-replicas 1 --max-replicas 3`, **0.25 vCPU / 0.5 GiB**.
Always-warm was a deliberate choice (instant boot — no scale-from-zero cold start). Idle compute
from `min-replicas 1` is billed at a reduced idle rate (~$0.000008/vCPU-s, ~$0.000001/GiB-s)
**from the first second and is NOT covered by the free grant** — ≈ **$0.009/hr ≈ ~£5/month** for
the single warm replica. `max-replicas 3` only bills extra *during* a burst (rare, brief).

For the ~38-day tournament that's **~£6–12 total**. Blob storage for the tiny tenant JSONs is
pennies. The image is on **GitHub Container Registry (GHCR)** — free for public images — so no
registry cost. (To drop the warm-replica charge entirely, set `--min-replicas 0` and accept the
cold start.)

> The Azure Container Apps **free grant** — 180,000 vCPU-seconds, 360,000 GiB-seconds, 2M requests
> per subscription per calendar month — covers **active usage only**, not the `min-replicas 1`
> idle compute above.

---

## Part 5 — Adding a new sweepstake

There are two ways, depending on whether the sweepstake should live in the codebase or be
created at runtime.

### A. Runtime (self-service — no redeploy) — the normal case

Created against the live gateway and stored in Blob; appears immediately at `/s/<code>`.

- **Web:** `https://sstake.co.uk/new` — enter the create password, add players + picks. You get a
  share code and a one-time owner token (manage later at `/s/<code>/manage`).
- **CLI** (run locally, bypasses the create gate — useful for bulk import from a CSV):
  ```bash
  npm run sweepstake:create -- --picks ./player_picks.csv --name "My Game" \
    --teams-per-player 4 [--code mygame]
  ```
  Point it at the prod store by setting `AZURE_STORAGE_ACCOUNT=sstkcb76f50e` (with `az login` /
  managed-identity access); omit it to write to the local dev store.

Both reject typos and any roster that isn't a clean 48-team partition, surfacing
"did you mean…?" suggestions.

### B. Baked into the image (committed, read-only)

For the "official" sweepstakes shipped with the app (like `crackers` / `aa26`):

1. `mkdir datasets/sweepstakes/mygame` and add `sweepstake.json`:
   ```json
   { "name": "My Game", "teamsPerPlayer": 4, "code": "mygame" }
   ```
   (`teamsPerPlayer × numPlayers` must equal 48.)
2. Add `datasets/sweepstakes/mygame/player_picks.csv` (`player,team` rows).
3. Check picks resolve: `SWEEPSTAKE=mygame npm run report:picks -w @sweepstake/server`. Fix any ❓
   (add spelling variants to `server/src/data/aliases.ts`) until all 48 show ✅.
4. Verify locally at `http://localhost:5173/s/mygame`, then commit + redeploy the image (Part 4).

---

## Part 6 — Custom domains (live)

Everything points at the single `sweepstake-prod` app on **`sstake.co.uk`** (123-reg), with free
auto-renewing Azure managed TLS certificates:

- **https://sstake.co.uk** — the **apex is canonical** (landing/picker; tenants at `/s/<code>`).
- **https://aa.sstake.co.uk** → 301 → `sstake.co.uk/s/aa26`
- **https://crackers.sstake.co.uk** → 301 → `sstake.co.uk/s/crackers`

The 301s are server-side middleware (`VANITY_HOSTS` in [`server/src/app.ts`](../server/src/app.ts)),
so old bookmarks keep working. The `*.azurecontainerapps.io` URL also works.

### Apex (`sstake.co.uk`)

The apex can't be a CNAME — use an **A record → the environment's static IP** plus the `asuid` TXT.
Fetch the verification ID with
`az containerapp show -n sweepstake-prod -g $rg --query properties.customDomainVerificationId -o tsv`:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `85.210.22.170` (the `sweepstake-env` static IP) |
| `TXT` | `asuid` | the verification ID |

### Subdomains (the `aa.` / `crackers.` redirects)

| Type | Name | Value |
|---|---|---|
| `CNAME` | `<sub>` | `sweepstake-prod.ambitiousisland-9356d105.uksouth.azurecontainerapps.io` |
| `TXT` | `asuid.<sub>` | the verification ID |

Once DNS resolves, add + bind the hostname on the one app (a managed cert is provisioned):
```powershell
az containerapp hostname add  --hostname sstake.co.uk -n sweepstake-prod -g $rg --subscription $sub
az containerapp hostname bind --hostname sstake.co.uk -n sweepstake-prod -g $rg --subscription $sub `
  --environment sweepstake-env --validation-method TXT   # CNAME for subdomains
```

Azure renews the certificates automatically.
