# ── Stage 1: Build ────────────────────────────────────────────────────────────
# Installs all deps (including devDeps) and builds the web app's static assets.
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package manifests before source so Docker can cache the npm ci layer —
# it only re-runs if a package.json / lockfile changes, not on every code edit.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/

RUN npm ci

# Copy source and build shared types + web assets.
COPY . .
RUN npm run build -w @sweepstake/shared
RUN npm run build -w @sweepstake/web

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# Lean production image — only runtime dependencies, no build tools.
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies (tsx is now in server/dependencies).
COPY package*.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci --omit=dev

# Built web assets from stage 1.
COPY --from=builder /app/web/dist ./web/dist

# Server + shared TypeScript source (tsx runs them directly — no tsc compile step).
COPY server ./server
COPY shared ./shared

# Tournament CSVs + sweepstake picks (no secrets — .env is not copied).
COPY datasets ./datasets

# Default port. Override with the PORT env var (Azure sets this automatically).
ENV PORT=8080
EXPOSE 8080

# tsx runs TypeScript directly via Node's --import loader hook (Node 18.19+).
CMD ["node", "--import", "tsx/esm", "server/src/index.ts"]
