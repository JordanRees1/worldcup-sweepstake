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
npm run dev              # default (friends sweepstake, seed/no-API mode)
npm run dev:work         # work sweepstake
npm run dev:group-stage  # demo: matchday 1+2 done
npm run dev:quarters     # demo: groups + R32 + R16 done
npm run dev:final        # demo: everything through the semis, Final tomorrow

# Live results (needs server/.env with FOOTBALL_API_KEY set — see server/.env.example):
DATA_SOURCE=live npm run dev       # macOS/Linux
$env:DATA_SOURCE="live"; npm run dev  # Windows PowerShell
```

### Switching between sweepstakes

```bash
npm run dev                     # friends (default)
npm run dev:work                # work

# Any sweepstake by name:
$env:SWEEPSTAKE="work"; npm run dev       # PowerShell
SWEEPSTAKE=work npm run dev               # macOS/Linux
```

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

| Variable | Required | Example | Notes |
|---|---|---|---|
| `SWEEPSTAKE` | No | `friends` | Which game to serve. Default: `friends` |
| `DATA_SOURCE` | No | `live` | `seed` (offline) or `live` (API). Default: `seed` |
| `FOOTBALL_API_KEY` | If `DATA_SOURCE=live` | `abc123...` | From football-data.org. **Never put in the image** |
| `PORT` | No | `8080` | Azure sets this automatically |
| `RESULTS_CACHE_TTL_SECONDS` | No | `60` | How long to cache API results in memory |
| `NODE_ENV` | Set in Dockerfile | `production` | Already set — do not override |

**The API key is always a host-managed secret** — set it in the Azure portal, never in the
image or in source control.

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
# Seed mode (no API key, offline data) — the friends game:
docker run --rm -p 8080:8080 sweepstake

# Seed mode — the work game:
docker run --rm -p 8080:8080 -e SWEEPSTAKE=work sweepstake

# Live mode — friends game with your real API key:
docker run --rm -p 8080:8080 \
  -e DATA_SOURCE=live \
  -e FOOTBALL_API_KEY=your_key_here \
  sweepstake
```

Open http://localhost:8080 — you should see the sweepstake app served from the container.
The `● seed` / `● live` badge in the header tells you which mode it's running in.

### What to verify

- [ ] `http://localhost:8080` loads the Players screen
- [ ] `http://localhost:8080/api/health` returns `{"ok":true,...}`
- [ ] `http://localhost:8080/groups` loads group standings (React Router)
- [ ] `http://localhost:8080/bracket` loads the bracket
- [ ] The header shows `● seed` (or `● live` if you passed a key)
- [ ] Running with `SWEEPSTAKE=work` shows 24 players instead of 6

---

## Part 4 — Deploying to Azure Container Apps

> **Where it lives now (migrated June 2026):** the apps run in the **work subscription**
> `Sandbox` (`94442dd5-4818-4620-8e2d-c557baf52b6b`), resource group
> `rg-personal-n-jordan-rg-jordan-sandbox`, region **uksouth**. The image is hosted on
> **GitHub Container Registry (GHCR)**, not Azure Container Registry.

### Architecture: one image, two apps

Both sweepstakes run the **same public image**, differing only by the `SWEEPSTAKE` env var:

```
ghcr.io/jordanrees1/sweepstake:latest   (one public image)
        │
   env: sweepstake-env   (uksouth, in rg-personal-n-jordan-rg-jordan-sandbox)
        ├── sweepstake-dev    SWEEPSTAKE=friends  → https://crackers.sstake.co.uk
        └── sweepstake-prod   SWEEPSTAKE=work     → https://aa.sstake.co.uk
```

Each app: **0.25 vCPU / 0.5 GiB**, external ingress on `:8080`, `DATA_SOURCE=live`,
`RESULTS_CACHE_TTL_SECONDS=30`, the API key as the Azure secret `football-api-key`, and
**`min-replicas 1 / max-replicas 1`** (always-warm — see the Cost note below).

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

After a code change is merged to `main`, rebuild → push → roll both apps:

```powershell
$rg  = "rg-personal-n-jordan-rg-jordan-sandbox"
$sub = "94442dd5-4818-4620-8e2d-c557baf52b6b"

docker build -t ghcr.io/jordanrees1/sweepstake:latest .
docker push  ghcr.io/jordanrees1/sweepstake:latest

# A unique --revision-suffix forces both apps to re-pull :latest
$suffix = (git rev-parse --short HEAD) + "-" + (Get-Date -Format 'MMddHHmm')
foreach ($app in @('sweepstake-dev','sweepstake-prod')) {
  az containerapp update -n $app -g $rg --subscription $sub `
    --image ghcr.io/jordanrees1/sweepstake:latest --revision-suffix $suffix
}
```

Health-check: `https://crackers.sstake.co.uk/api/health` and `https://aa.sstake.co.uk/api/health`
should each return `{"ok":true,"dataSource":"live"}`.

> First GHCR push from a new machine needs a one-time `docker login ghcr.io` with a GitHub PAT
> (scope `write:packages`). The image is **public**, so the apps pull it with no registry creds.

### One-time setup (only if recreating from scratch)

The environment and apps already exist. To rebuild them in a fresh resource group:

```powershell
az containerapp env create -n sweepstake-env -g $rg --location uksouth --subscription $sub

# dev = friends, prod = work. $KEY = your football-data.org key (never commit it).
$apps = [ordered]@{ 'sweepstake-dev'='friends'; 'sweepstake-prod'='work' }
foreach ($app in $apps.Keys) {
  az containerapp create -n $app -g $rg --subscription $sub `
    --environment sweepstake-env `
    --image ghcr.io/jordanrees1/sweepstake:latest `
    --target-port 8080 --ingress external `
    --cpu 0.25 --memory 0.5Gi --min-replicas 1 --max-replicas 1 `
    --secrets football-api-key=$KEY `
    --env-vars "SWEEPSTAKE=$($apps[$app])" DATA_SOURCE=live `
      FOOTBALL_API_KEY=secretref:football-api-key RESULTS_CACHE_TTL_SECONDS=30
}
```

Then bind the custom domains (Part 6).

### CI/CD — automated build on push to `main`

`.github/workflows/deploy.yml` runs on every push to `main`:

- **`build-and-push`** _(always runs, free)_ — builds the image and pushes
  `ghcr.io/jordanrees1/sweepstake:latest` + `:<sha>` to GHCR using the built-in `GITHUB_TOKEN`
  (no external secrets). Public repo → unlimited Actions minutes; private → 2,000 free min/month,
  ample here.
- **`deploy`** _(opt-in, off by default)_ — updates both Container Apps to the new image. It only
  runs when the repo **variable `DEPLOY_ENABLED` = `true`** and the Azure OIDC secrets are present.

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

With `--min-replicas 0`, each app **scales to zero** when nobody is using it — at zero replicas
you pay nothing. At your scale (≤50 users, occasional visits) the cost is effectively £0/month,
comfortably inside the Azure Container Apps free grant: **180,000 vCPU-seconds, 360,000
GiB-seconds, and 2 million requests per subscription per calendar month**. The grant applies to
**active usage only** (a replica handling requests). Each app runs at **0.25 vCPU / 0.5 GiB**.

The image is hosted on **GitHub Container Registry (GHCR)** — free for public images — so there's
no container-registry cost.

> ⚠️ **Always-warm (instant boot) costs extra.** Idle compute from `--min-replicas > 0` is billed
> at a reduced idle rate (~$0.000008/vCPU-s, ~$0.000001/GiB-s) **from the first second and is NOT
> covered by the free grant**. At 0.25 vCPU / 0.5 GiB that's ≈ **$0.009/hr ≈ $6.5 (~£5) per app
> per month** for a single always-on replica. Keep `min-replicas 0` unless you specifically need to
> eliminate the (~1s, post-bundle) cold start.

---

## Part 5 — Adding a new sweepstake

1. Create the folder and config:
   ```bash
   mkdir datasets/sweepstakes/mygame
   ```

2. Create `datasets/sweepstakes/mygame/sweepstake.json`:
   ```json
   { "name": "My Game", "teamsPerPlayer": 4 }
   ```
   (`teamsPerPlayer × numPlayers` must equal 48.)

3. Create `datasets/sweepstakes/mygame/player_picks.csv`:
   ```csv
   player,team
   Alice,Brazil
   Alice,France
   Alice,England
   Alice,Japan
   Bob,Argentina
   ...
   ```

4. Check all picks resolve (catches typos before going live):
   ```bash
   SWEEPSTAKE=mygame npm run report:picks -w @sweepstake/server
   ```
   Fix any ❓ unmatched entries (add spelling variants to `server/src/data/aliases.ts`
   if needed) and re-run until all 48 show ✅.

5. Run locally:
   ```bash
   SWEEPSTAKE=mygame npm run dev          # macOS/Linux
   $env:SWEEPSTAKE="mygame"; npm run dev  # PowerShell
   ```

6. Deploy: rebuild the image and `az containerapp create` with `SWEEPSTAKE=mygame`.

---

## Part 6 — Custom domains (live)

The apps are served on **`sstake.co.uk`** (registered at 123-reg), with free auto-renewing Azure
managed TLS certificates:

- **https://crackers.sstake.co.uk** → `sweepstake-dev`
- **https://aa.sstake.co.uk** → `sweepstake-prod`

The `*.azurecontainerapps.io` URLs keep working alongside them.

### To (re)bind a subdomain

1. At the registrar, add two records (the verification ID is per-environment — fetch it with
   `az containerapp show -n <app> -g $rg --query properties.customDomainVerificationId -o tsv`):

   | Type | Name | Value |
   |---|---|---|
   | `CNAME` | `<sub>` | `<app>.<env-default-domain>` (e.g. `sweepstake-prod.ambitiousisland-9356d105.uksouth.azurecontainerapps.io`) |
   | `TXT` | `asuid.<sub>` | the verification ID |

2. Once DNS resolves, add the hostname and provision the managed cert:
   ```powershell
   az containerapp hostname add  --hostname crackers.sstake.co.uk -n sweepstake-dev -g $rg --subscription $sub
   az containerapp hostname bind --hostname crackers.sstake.co.uk -n sweepstake-dev -g $rg --subscription $sub `
     --environment sweepstake-env --validation-method CNAME
   ```

Azure renews the certificates automatically.
