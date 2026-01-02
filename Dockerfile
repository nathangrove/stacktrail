# Multi-stage Dockerfile
# Stage 1: builder - install deps and build the repository
FROM node:24 AS builder

WORKDIR /app

# Copy lockfiles and package manifests to leverage Docker cache
COPY package.json package-lock.json ./
COPY packages ./packages
COPY examples ./examples

# Install full deps (including dev) so we can build TypeScript + web
RUN npm ci

# Build SDK, server and web (produces top-level dist/)
RUN npm run build

# Stage 2: runtime - small image with only production deps + built artifacts
FROM node:24-slim AS runtime

WORKDIR /app

# Copy server package metadata and install production deps only
COPY packages/server/package.json ./package.json
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/dist ./

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Run as unprivileged node user from official image
USER node

# Default command runs the built server (which serves built web from dist/public when SERVE_WEB=1)
CMD ["node", "index.js"]

# Optional healthcheck (uncomment if desired)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -q -O- http://localhost:4000/health || exit 1
