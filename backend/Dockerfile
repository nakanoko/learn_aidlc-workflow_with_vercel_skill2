# syntax=docker/dockerfile:1.6

FROM node:20-alpine

# openssl/libc6-compat: Prisma engines may require these on Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install dependencies first to maximize Docker cache
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Use npm ci for reproducible installs (CLAUDE.md quality gate)
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source files
COPY tsconfig.json next.config.js ./
COPY app ./app
COPY src ./src

# Build Next.js
RUN npm run build

# Create /data directory for SQLite and grant ownership to node user
RUN mkdir -p /data && chown -R node:node /data /app

# Run as non-root user
USER node

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/invoices.db \
    CORS_ALLOW_ORIGIN=http://localhost:3001

EXPOSE 3000

# Healthcheck: BusyBox wget can return exit 0 even on HTTP 5xx, so we grep the body
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1

# Run migration on startup, then start server
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
