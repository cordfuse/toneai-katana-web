# ToneAI Kat — Next.js standalone build, multi-stage.
#
# Build context expectation: the repo root (one level above docker/), NOT
# inside docker/. The compose files set `build.context: ..` for this reason.
#
# Final image is ~120 MB:
#   - node:22-alpine runtime (~50 MB)
#   - Next.js standalone bundle (~60 MB)
#   - config/ + public/ + .next/static (~10 MB)

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install deps first (cached layer if package files don't change)
COPY nodejs/package*.json ./
RUN npm ci

# next.config.ts reads ../VERSION at build time as the source of truth for
# NEXT_PUBLIC_APP_VERSION. The file lives at the repo root so it's the
# canonical version for badges/CI/everything; copy it one level above the
# nodejs source so the relative `../VERSION` resolves the same as in dev.
COPY VERSION /VERSION

# Then the source — invalidates the build cache on app changes only
COPY nodejs/. .
RUN npm run build
# `npm run build` produces:
#   .next/standalone/        → self-contained server bundle (+ server.js)
#   .next/standalone/.next/static  → static assets (copied by our build script)
#   .next/standalone/public/       → public assets (copied by our build script)
#   .next/standalone/config/       → bundled default config (copied by our build script)

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Tell loadToneaiConfig() where the operator-mounted config
# volume lives. Compose mounts the host config dir at this path.
ENV TONEAI_CONFIG_DIR=/app/config

# Copy the prepared standalone bundle. server.js becomes /app/server.js;
# the bundled config + public + static are nested inside it already.
COPY --from=builder /app/.next/standalone ./

# The SQLite DB (device auth, quota, logs — DB_PATH defaults to data/katana.db)
# needs a writable, persistent home owned by the runtime user. `next build`
# evaluates db.ts as root and bakes a root-owned data/katana.db into the
# bundle; remove it and re-create a clean, node-owned dir so the runtime opens
# a fresh DB it can write (otherwise the first quota write 500s "readonly
# database"). The compose files mount a named volume here for persistence —
# it seeds from this clean dir, so it inherits node ownership too.
RUN rm -rf /app/data && mkdir -p /app/data && chown node:node /app/data

# Drop privileges. node:24-alpine ships with a "node" user (uid 1000) —
# use it so the container doesn't run as root.
USER node

EXPOSE 3000

# Standalone server reads PORT (default 3000) and HOSTNAME (default localhost
# inside Next). Bind 0.0.0.0 so the published port works without extra flags.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

CMD ["node", "server.js"]
