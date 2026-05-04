# syntax=docker/dockerfile:1.7

############################
# Stage 1: builder
############################
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifest first for cacheable dependency layer
COPY package.json package-lock.json ./

# Reproducible install (CLAUDE.md quality gate requirement)
RUN npm ci

# Copy source
COPY . .

# Vite embeds VITE_* at build time, so receive them via ARG
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Build (output: dist/)
RUN npm run build

############################
# Stage 2: runner
############################
FROM node:20-alpine AS runner

WORKDIR /app
# /app is created by WORKDIR with root ownership; let `node` user write transient
# files (e.g. Vite's timestamp-*.mjs config bundle) by chowning the directory.
RUN chown node:node /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# vite preview needs vite itself, so bring node_modules
# Use --chown so the `node` user can write Vite's transient config bundle (timestamp-*.mjs).
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/vite.config.ts ./vite.config.ts
COPY --from=builder --chown=node:node /app/index.html ./index.html
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/tsconfig.node.json ./tsconfig.node.json

# Run as non-root user
USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3001"]
