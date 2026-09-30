# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL and build utilities for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY prisma ./prisma/

# Install dependencies for shared, api, and prisma
RUN npm ci --workspace=packages/shared --workspace=apps/api

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generate Prisma Client & Build Packages
RUN npx prisma generate
RUN npm run build -w packages/shared
RUN npm run build -w apps/api

# ----------------------------------------------------
# Production Runner Stage
# ----------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat curl bash

ENV NODE_ENV=production
ENV PORT=4000

# Copy node_modules and built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api ./apps/api

EXPOSE 4000

# Health check using express /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Apply schema migrations and start API server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node apps/api/dist/server.js"]
