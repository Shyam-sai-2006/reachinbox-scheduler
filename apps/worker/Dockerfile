# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL and build utilities for Prisma
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/
COPY prisma ./prisma/

# Install dependencies for shared, worker, and prisma
RUN npm ci --workspace=packages/shared --workspace=apps/worker

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/worker ./apps/worker

# Generate Prisma Client & Build Packages
RUN npx prisma generate
RUN npm run build -w packages/shared
RUN npm run build -w apps/worker

# ----------------------------------------------------
# Production Runner Stage
# ----------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat bash

ENV NODE_ENV=production

# Copy node_modules and built artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/worker ./apps/worker

# Start BullMQ worker service
CMD ["node", "apps/worker/dist/worker.js"]
