# Multi-stage Dockerfile
# Stage 1: builder - install deps and build the repository
FROM node:18 AS builder

WORKDIR /app

# Install OS build deps required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  python3 \
  python3-dev \
  pkg-config \
  libsqlite3-dev \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/bin/python

# Copy lockfiles and package manifests to leverage Docker cache
COPY package.json package-lock.json ./
COPY packages ./packages
COPY examples ./examples

# Install full deps (including dev) so we can build TypeScript + web
RUN npm ci

# Build SDK, server and web (produces top-level dist/)
RUN npm run build

# Remove dev deps so node_modules contains only production deps for runtime
RUN npm prune --production

# Stage 2: runtime - small image with only production deps + built artifacts
FROM node:18-slim AS runtime

WORKDIR /app

# Copy production node_modules and server package metadata from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./
COPY packages/server/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=4000
ENV SQLITE_DB_PATH=/app/data/data.db
EXPOSE 4000

# Ensure the runtime process can write to the data and public folders
RUN mkdir -p /app/data && chown -R node:node /app/data /app/public

# Run as unprivileged node user from official image
USER node

# Default command runs the built server (which serves built web from dist/public when SERVE_WEB=1)
CMD ["node", "index.js"]

# Optional healthcheck (uncomment if desired)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -q -O- http://localhost:4000/health || exit 1
