# ReachInbox / Outbox Labs — Distributed Full-Stack Email Job Scheduler

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0-green.svg)](https://nodejs.org/)
[![BullMQ](https://img.shields.io/badge/Queue-BullMQ%20v5-red.svg)](https://bullmq.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Cache%20%26%20RateLimit-Redis%207-red.svg)](https://redis.io/)
[![Elasticsearch](https://img.shields.io/badge/Search-Elasticsearch%208.13-yellow.svg)](https://www.elastic.co/)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite%205-cyan.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%203-38B2AC.svg)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Testing-Vitest%201.4%20(29%2F29%20Pass)-brightgreen.svg)](https://vitest.dev/)

A production-grade, distributed email scheduling platform built for ReachInbox / Outbox Labs. The system executes scheduled outbound email campaigns with **strictly zero cron or recurring timer loops**, using BullMQ persistent delayed jobs, atomic Redis Lua sliding-window rate limiting, sender round-robin rotation, real Ethereal SMTP delivery, Slack OAuth/webhook alerting, and Elasticsearch full-text search.

---

## Table of Contents
1. [Architecture Overview & System Design](#1-architecture-overview--system-design)
2. [Strict Zero-Cron Guarantee](#2-strict-zero-cron-guarantee)
3. [Tech Stack & Technical Justifications](#3-tech-stack--technical-justifications)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Prerequisites & Environment Configuration](#5-prerequisites--environment-configuration)
6. [Quickstart Guide (Zero to Running)](#6-quickstart-guide-zero-to-running)
7. [OAuth & Integrations Setup](#7-oauth--integrations-setup)
   - [Google OAuth 2.0](#google-oauth-20)
   - [Slack OAuth 2.0 & Webhook Alerting](#slack-oauth-20--webhook-alerting)
   - [Ethereal SMTP Email Accounts](#ethereal-smtp-email-accounts)
8. [Rate Limiting Algorithm & Slack Alerting Engine](#8-rate-limiting-algorithm--slack-alerting-engine)
9. [Idempotency Guarantees & Crash Persistence](#9-idempotency-guarantees--crash-persistence)
10. [Full-Text Search Engine (Elasticsearch)](#10-full-text-search-engine-elasticsearch)
11. [Bull Board Queue Dashboard](#11-bull-board-queue-dashboard)
12. [Automated Verification & Test Suite](#12-automated-verification--test-suite)
13. [5-Minute Interactive Demo Script](#13-5-minute-interactive-demo-script)
14. [Assignment Requirements Traceability Matrix](#14-assignment-requirements-traceability-matrix)

---

## 1. Architecture Overview & System Design

```
                                      +---------------------------------------------+
                                      |             React + Vite Frontend           |
                                      |   - Dashboard (Scheduled & Sent Tables)    |
                                      |   - Compose Modal (Immediate CSV Preview)  |
                                      |   - Elasticsearch Live Search Modal        |
                                      |   - Slack Status & Connect Toggle           |
                                      +----------------------+----------------------+
                                                             |
                                               HTTP / JSON REST API & Sessions
                                                             |
                                                             v
+------------------------------------------------------------------------------------------------------------------+
|                                              Express.js API Service (Port 4000)                                  |
|  - Google OAuth 2.0 / Local Dev Session Auth                                                                     |
|  - Slack OAuth 2.0 & Webhook Management (AES-256-GCM Encrypted)                                                  |
|  - Campaign Scheduling & File Ingestion (Multer CSV/TXT parser)                                                  |
|  - Round-Robin Sender Rotation Engine                                                                            |
|  - Bull Board Queue Management Dashboard (/admin/queues)                                                         |
|  - Elasticsearch Proxy (/api/search)                                                                             |
+--------------------------+---------------------------------+----------------------------------+------------------+
                           |                                 |                                  |
                           v                                 v                                  v
+------------------------------------+  +-------------------------------------+  +---------------------------------+
|        PostgreSQL Database         |  |         Redis 7 (In-Memory)         |  |     Elasticsearch 8.13.0        |
|  - Users & Sessions (pg-simple)    |  |  - BullMQ Delayed ZSETs             |  |  - Index: emails                |
|  - EmailSenders (Encrypted Pass)   |  |  - Atomic Lua Rate Limiting         |  |  - recipient, subject, body     |
|  - Campaigns & EmailMessages       |  |  - Slack Alert Cooldown Locks       |  |  - status, sender, dates        |
|  - SlackConnections (Encrypted)    |  |    (Key: sender:{id}:slack_alert)   |  |  - Wildcard, fuzzy & prefix     |
+------------------------------------+  +------------------+------------------+  +---------------------------------+
                                                           ^
                                                           | Pulls Delayed Jobs
                                                           v
+------------------------------------------------------------------------------------------------------------------+
|                                        BullMQ Distributed Worker Service                                         |
|  - Configurable Concurrency (WORKER_CONCURRENCY=10)                                                              |
|  - Atomic State Machine: scheduled -> sending -> sent / failed                                                   |
|  - Idempotency Gate (Deterministic Job ID: email-${messageId}, status check)                                    |
|  - Atomic Lua Rate Limiter Check (MIN_SEND_DELAY_MS & MAX_EMAILS_PER_HOUR_PER_SENDER)                             |
|  - Reschedule to BullMQ delayed queue if limit reached                                                           |
|  - Fire Rate Limit Slack Notification (Max once per sender per hour via Redis NX lock)                           |
|  - Nodemailer SMTP Dispatch -> Ethereal Email SMTP Server                                                        |
|  - Capture Message-ID & Preview URL (https://ethereal.email/message/...)                                         |
|  - Sync Updates to PostgreSQL & Elasticsearch Index                                                              |
|  - Startup Queue Reconciliation (Re-queues any DB scheduled emails missing from BullMQ)                         |
+------------------------------------------------------------------------------------------------------------------+
```

---

## 2. Strict Zero-Cron Guarantee

> [!IMPORTANT]
> This platform strictly adheres to the **zero-cron rule**. You will not find `cron`, `node-cron`, `crontab`, `agenda`, `setInterval`, or recursive `setTimeout` polling loops anywhere in this repository.

### How Scheduling Works Without Cron:
1. **BullMQ Delayed Jobs**: When a user schedules an email for time $T$, the API computes `delayMs = Math.max(0, T - Date.now())` and enqueues a delayed job:
   ```ts
   await emailQueue.add('send-email', { emailMessageId }, {
     delay: delayMs,
     jobId: `email-${emailMessageId}`, // Deterministic deduplication
     removeOnComplete: true,
     attempts: 3,
     backoff: { type: 'exponential', delay: 5000 }
   });
   ```
2. **Redis Sorted Sets (ZSET)**: BullMQ stores delayed jobs in Redis under `bull:email-queue:delayed` sorted by timestamp $T$.
3. **Event-Driven Delivery**: BullMQ's internal Redis streams and keyevent hooks awaken the worker exactly when a job matures.
4. **Crash & Reboot Resilience**: If workers crash or restart, delayed jobs stay safely in Redis. Upon worker reboot, any matured or upcoming jobs fire accurately with zero duplicate sends.
5. **Startup Queue Reconciliation**: On worker initialization, `reconcileQueue()` checks PostgreSQL for any `scheduled` emails missing from BullMQ and re-enqueues them with deterministic IDs.

---

## 3. Tech Stack & Technical Justifications

| Component | Technology | Rationale & Justification |
| :--- | :--- | :--- |
| **Monorepo** | npm Workspaces + TypeScript | Centralizes `@reachinbox/shared` types and schemas, avoiding drift between API, Worker, and Web apps. |
| **API Framework** | Express.js 4 + TypeScript | Lightweight, unopinionated, battle-tested HTTP server with rich middleware support (Helmet, CORS, Multer, Sessions). |
| **Queue Engine** | BullMQ v5 + Redis 7 | High-performance distributed message queue. Supports delayed jobs natively in Redis ZSETs without cron timers. |
| **Database** | PostgreSQL 16 + Prisma ORM | Relational ACID compliance for transactional state transitions (`scheduled` -> `sending` -> `sent`). Type-safe Prisma client. |
| **Rate Limiter** | Redis Lua Scripts | Atomic sliding-window evaluation executed in a single Redis roundtrip without distributed concurrency race conditions. |
| **Search Engine** | Elasticsearch 8.13.0 | Distributed inverted index for sub-millisecond search across recipient, subject, and body text with fuzziness. |
| **SMTP Delivery** | Nodemailer + Ethereal Email | Real SMTP protocol delivery (`smtp.ethereal.email:587`) providing real HTTP preview URLs for manual visual verification. |
| **Frontend** | React 18 + Vite 5 + Tailwind CSS | Sub-second HMR, instant client-side CSV parsing, accessible UI, and rapid reactive search modals. |
| **Security** | Node crypto (`aes-256-gcm`) | Military-grade authenticated encryption for all stored SMTP passwords, Slack webhooks, and OAuth tokens. |
| **Test Framework** | Vitest 1.4 | Native ESM test runner sharing Vite's pipeline for ultra-fast unit and integration testing. |

---

## 4. Monorepo Structure

```
.
├── apps/
│   ├── api/                     # Express.js REST API & Bull Board dashboard
│   │   ├── src/
│   │   │   ├── config/          # Zod-validated environment variables
│   │   │   ├── db/              # Prisma client & database seed script
│   │   │   ├── middleware/      # Auth session, file upload, error handling
│   │   │   ├── modules/         # Auth, Campaigns, Emails, Slack, Search
│   │   │   ├── queues/          # BullMQ queue instances & Bull Board setup
│   │   │   ├── services/        # Elasticsearch, Slack, SMTP, Rate limiter
│   │   │   └── utils/           # AES-256-GCM encryption/decryption
│   ├── worker/                  # BullMQ Background Worker Service
│   │   ├── src/
│   │   │   ├── config/          # Worker configuration (concurrency, delays)
│   │   │   ├── db/              # Prisma client for worker
│   │   │   ├── processors/      # BullMQ email and index processors
│   │   │   ├── scripts/         # Reindex & queue reconciliation CLI scripts
│   │   │   ├── services/        # Atomic Lua rate limiter, Slack, Nodemailer
│   │   │   └── worker.ts        # Worker startup, lifecycle & reconciliation
│   └── web/                     # React + Vite + Tailwind CSS Single-Page App
│       ├── src/
│       │   ├── api/             # Typed API clients (Axios)
│       │   ├── components/      # Header, ComposeModal, Tables, SearchModal
│       │   ├── pages/           # DashboardPage, LoginPage
│       │   └── App.tsx          # Root application component
├── packages/
│   └── shared/                  # Shared TypeScript types, Zod schemas & utils
│       ├── src/
│       │   ├── schemas/         # Campaign & Email Zod validation schemas
│       │   ├── types/           # Domain models, queue payloads, status enums
│       │   └── utils/           # Client/server email parser, time math, round-robin
├── prisma/
│   └── schema.prisma            # Database schema (User, EmailMessage, Campaign, etc.)
├── scripts/
│   ├── verify.mjs               # 1-step verification script (Typecheck, Lint, Test, Build)
│   ├── init-services.sh         # Automated Docker service bootstrapper
│   └── test-db.mjs              # Quick database sanity checker
├── tests/
│   ├── unit/                    # 5 unit test suites (Parser, Rate Limiter, Crypto, Math)
│   └── integration/             # 6 integration test suites (API, Worker, ES, Persistence)
├── docker-compose.yml           # Multi-container Postgres, Redis, Elasticsearch
├── package.json                 # Monorepo workspaces & root scripts
└── vitest.config.ts             # Vitest test runner configuration
```

---

## 5. Prerequisites & Environment Configuration

### System Prerequisites
- **Node.js**: `>= 20.0.0` (Recommended: v20.x or v22.x)
- **npm**: `>= 10.0.0`
- **Docker & Docker Compose**: (Or locally installed PostgreSQL 16, Redis 7, and Elasticsearch 8)

### Environment File (`.env`)
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```

| Variable | Default Value | Description | Required? |
| :--- | :--- | :--- | :--- |
| `PORT` | `4000` | Express API port | Required |
| `NODE_ENV` | `development` | Runtime environment (`development`/`production`/`test`) | Required |
| `DATABASE_URL` | `postgresql://reachinbox:reachinbox_secret@127.0.0.1:5432/reachinbox` | PostgreSQL connection string | Required |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL | Required |
| `ELASTICSEARCH_NODE` | `http://127.0.0.1:9200` | Elasticsearch node URL | Required |
| `SESSION_SECRET` | `reachinbox-scheduler-session-secret-key-32chars` | Express session encryption key | Required |
| `ENCRYPTION_KEY` | `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` | 32-byte hex key for AES-256-GCM | Required |
| `WORKER_CONCURRENCY` | `10` | BullMQ worker concurrency | Optional (Default: 10) |
| `MIN_SEND_DELAY_MS` | `2000` | Per-sender throttle delay (ms) | Optional (Default: 2000) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `5` | Per-sender hourly quota | Optional (Default: 5) |
| `GOOGLE_CLIENT_ID` | `""` | Google OAuth Client ID | Optional (Dev fallback available) |
| `GOOGLE_CLIENT_SECRET` | `""` | Google OAuth Client Secret | Optional (Dev fallback available) |
| `GOOGLE_CALLBACK_URL` | `http://localhost:4000/api/auth/google/callback` | Google OAuth Redirect URI | Required for OAuth |
| `SLACK_CLIENT_ID` | `""` | Slack App Client ID | Optional |
| `SLACK_CLIENT_SECRET` | `""` | Slack App Client Secret | Optional |
| `SLACK_REDIRECT_URI` | `http://localhost:4000/api/slack/callback` | Slack OAuth Redirect URI | Required for Slack OAuth |
| `SLACK_WEBHOOK_URL` | `""` | Incoming Slack Webhook URL | Optional (Can configure in UI) |
| `VITE_API_URL` | `http://localhost:4000` | Frontend API base URL | Required |

---

## 6. Quickstart Guide (Zero to Running)

Follow these steps to get the entire platform up and running in under 3 minutes:

### Step 1: Start Backing Services (Docker or Native)
If using Docker, boot PostgreSQL, Redis, and Elasticsearch with persistent volumes and healthchecks:
```bash
docker compose up -d
```
*(Alternatively, if running services natively, ensure PostgreSQL is on `5432`, Redis on `6379`, and Elasticsearch on `9200`).*

### Step 2: Install Dependencies & Build Shared Package
```bash
npm install
npm run build -w packages/shared
```

### Step 3: Run Database Migrations & Seed Senders
Push the Prisma schema to PostgreSQL and seed initial Ethereal SMTP senders and a default test user:
```bash
npm run db:migrate
npm run db:seed
```

### Step 4: Start Development Servers
Run the API, Worker, and Web frontend concurrently in one command:
```bash
npm run dev
```

The services will become available at:
- 🌐 **Web Frontend**: [http://localhost:5173](http://localhost:5173)
- 🔌 **API Service**: [http://localhost:4000](http://localhost:4000)
- 📊 **Bull Board Queue Dashboard**: [http://localhost:4000/admin/queues](http://localhost:4000/admin/queues)
- 🔍 **Elasticsearch Index**: [http://localhost:9200/emails](http://localhost:9200/emails)

---

## 7. OAuth & Integrations Setup

### Google OAuth 2.0
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Under **APIs & Services > Credentials**, create an **OAuth 2.0 Client ID** (Web application).
3. Add Authorized Redirect URI: `http://localhost:4000/api/auth/google/callback`.
4. Copy Client ID and Secret into your `.env`.
> **Local Dev Fallback**: If you do not have Google credentials configured, clicking **"Continue in Local Dev Mode"** on the login page will instantly authenticate you as the default workspace user.

### Slack OAuth 2.0 & Webhook Alerting
1. Go to [Slack API: Your Apps](https://api.slack.com/apps) and create a new app.
2. Under **Incoming Webhooks**, toggle **Activate Incoming Webhooks** on, create a new webhook for your channel, and copy the URL.
3. Paste the Webhook URL into `.env` under `SLACK_WEBHOOK_URL` or use the **"Connect Slack Webhook"** button in the Web header.
4. When a sender reaches `MAX_EMAILS_PER_HOUR_PER_SENDER`, an alert with sender details, current hourly count, and next allowed reset time is automatically posted to Slack.

### Ethereal SMTP Email Accounts
This platform uses real Ethereal SMTP accounts (`smtp.ethereal.email:587`).
- Ethereal accounts are generated via `nodemailer.createTestAccount()`.
- The database seed (`npm run db:seed`) automatically provisions two active Ethereal senders.
- Every email sent produces a real web preview link:
  ```
  https://ethereal.email/message/aruuFQcJu4JvKl7haru...
  ```
- Clicking the link in the **Sent Emails** table opens the live rendered HTML email in your browser!

---

## 8. Rate Limiting Algorithm & Slack Alerting Engine

The platform enforces two levels of throttling per sender using an atomic Redis Lua script (`DistributedRateLimiter`):

### 1. Sliding Window & Minimum Delay
- **`MIN_SEND_DELAY_MS`** (Default: 2000ms): Prevents burst transmission. The Lua script stores `sender:{senderId}:last_sent` and rejects execution if `now - lastSent < minDelayMs`.
- **`MAX_EMAILS_PER_HOUR_PER_SENDER`** (Default: 5 emails/hour): Uses a Redis Sorted Set `sender:{senderId}:window` where member scores are timestamps.
  1. `ZREMRANGEBYSCORE` removes timestamps older than `now - 3600000`.
  2. `ZCARD` counts sends in the last 60 minutes.
  3. If count $\ge$ hourly limit, the request is rejected and returns `rescheduleDelayMs = oldestTimestamp + 3600000 - now`.
  4. The BullMQ worker reschedules the job to BullMQ delayed queue:
     ```ts
     await job.moveToDelayed(Date.now() + rescheduleDelayMs, token);
     ```

### 2. De-duplicated Slack Alerting
When a sender is throttled, the worker attempts to acquire an hourly Slack alert lock:
```lua
SET sender:{senderId}:slack_alert_sent 1 EX 3600 NX
```
If the lock is acquired, exactly **one** Slack notification is broadcast for that sender. Subsequent throttled emails for the same sender within that hour execute silently without flooding Slack channels.

---

## 9. Idempotency Guarantees & Crash Persistence

### 1. State Machine Transitions
Each email message transitions strictly through:
$$\text{scheduled} \longrightarrow \text{sending} \longrightarrow \text{sent} \quad \text{or} \quad \text{failed}$$

- The worker uses an ACID transaction with an idempotency gate:
  ```ts
  const email = await prisma.emailMessage.findUnique({ where: { id: emailMessageId } });
  if (email.status === 'sent') {
    logger.info(`[IDEMPOTENT_SKIP] Message ${email.id} already sent. Skipping.`);
    return;
  }
  ```
- BullMQ jobs use deterministic IDs: `jobId: email-${emailMessageId}`. Submitting the same email twice will never create duplicate queue jobs.

### 2. Crash & Reboot Persistence
- Because delayed jobs are persisted in Redis sorted sets, stopping or crashing the worker process does **not** lose jobs.
- Upon worker reboot, jobs that matured while the worker was offline are executed immediately, while future jobs execute at their scheduled time.
- Verified in automated test: `tests/integration/restart-persistence.test.ts`.

---

## 10. Full-Text Search Engine (Elasticsearch)

All scheduled and sent emails are automatically indexed in Elasticsearch (`emails` index) on creation and updated upon status transitions.

### Search Capabilities:
- **Multi-Field Query**: Matches across `recipient`, `subject`, `body`, and `senderEmail`.
- **Typo Tolerance**: Automatic fuzziness (`AUTO:3,6`) for forgiving keyword matches.
- **Prefix & Wildcard Queries**: Instant live search suggestions as the user types in the header search modal.
- **CLI Reindexer**: Re-index all existing database records anytime:
  ```bash
  npm run reindex
  ```

---

## 11. Bull Board Queue Dashboard

Bull Board is integrated directly into the Express API for real-time queue observability.
- **URL**: [http://localhost:4000/admin/queues](http://localhost:4000/admin/queues)
- **Features**:
  - Live inspection of `email-queue` and `index-queue`.
  - Filter jobs by state: **Active**, **Waiting**, **Completed**, **Failed**, and **Delayed**.
  - Inspect job payloads, delayed timestamps, stack traces, and retry attempts.
  - Manual controls to retry failed jobs, clean completed jobs, or promote delayed jobs.

---

## 12. Automated Verification & Test Suite

The project includes a single comprehensive verification script that runs all checks and outputs a colorized summary report:

```bash
npm run verify
```

### Verification Pipeline:
1. **TypeScript Typecheck**: Validates shared, api, worker, and web workspaces with `tsc --noEmit`.
2. **Code Style & Linting**: Validates 100% Prettier formatting consistency across all codebase files.
3. **Full Vitest Test Suite**: Runs all 11 test suites and 29 unit and integration tests.
4. **Monorepo Production Build**: Builds production artifacts for `@reachinbox/shared`, `@reachinbox/api`, `@reachinbox/worker`, and `@reachinbox/web`.

```
============================================================
  VERIFICATION SUMMARY REPORT
============================================================

STEP                                       STATUS     DURATION  
----------------------------------------------------------------
1. TypeScript Typechecking                 PASSED     87.45s
2. Code Formatting & Linting               PASSED     9.04s
3. Full Test Suite (Unit & Integration)    PASSED     86.54s
4. Monorepo Production Build               PASSED     140.24s
----------------------------------------------------------------
Total Execution Time: 323.43s

✔ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY.
```

### Running Individual Tests:
```bash
# Run all tests
npm test

# Run specific suite
npx vitest run tests/unit/rate-limiter.test.ts
npx vitest run tests/integration/restart-persistence.test.ts
```

---

## 13. 5-Minute Interactive Demo Script

Follow this script to demonstrate and verify every key capability of the platform:

| Step | Action | Expected Result |
| :---: | :--- | :--- |
| **1** | Open [http://localhost:5173](http://localhost:5173) and click **"Continue in Local Dev Mode"**. | Authenticated session created; redirected to Dashboard. |
| **2** | Inspect the header: verify active user profile, **Slack Webhook** status, and **Compose** button. | Clean modern dashboard matching Figma design tokens. |
| **3** | Click **"Compose New Campaign"**; enter Campaign Name, Subject, and HTML Body. | Compose modal opens with validation. |
| **4** | Type 3 comma-separated emails or paste a CSV list into the Recipient field. | Client-side badge immediately displays **"3 valid recipients parsed"** without delay. |
| **5** | Set schedule date/time to 5 seconds in the future and click **"Schedule Campaign"**. | Campaign created; 3 emails appear in the **Scheduled Emails** table with countdown badges. |
| **6** | Wait 5 seconds; observe the table automatically refresh. | Emails transition from **Scheduled** $\to$ **Sending** $\to$ **Sent**. |
| **7** | Switch to the **Sent Emails** tab and click **"View Preview"** on any email. | Browser opens the real rendered Ethereal HTML email in a new tab. |
| **8** | Open [http://localhost:4000/admin/queues](http://localhost:4000/admin/queues). | Bull Board displays completed jobs and current queue health. |
| **9** | Click **"Search"** in the web header and type part of the subject or recipient. | Elasticsearch returns matching emails with highlighted search tokens. |
| **10** | Schedule 10 emails at once to trigger the hourly limit ($> 5$ per sender). | Worker reschedules excess jobs to the delayed queue and triggers a rate-limit alert to Slack. |

---

## 14. Assignment Requirements Traceability Matrix

| Requirement # | Description | Implementation File & Location | Verification Test / Evidence |
| :---: | :--- | :--- | :--- |
| **REQ-01 to 05** | Monorepo Architecture with TypeScript & Workspaces | `packages/shared`, `apps/api`, `apps/worker`, `apps/web` | `package.json`, `tsconfig.base.json` |
| **REQ-06 to 10** | Strict Zero-Cron Rule (BullMQ delayed jobs only) | `apps/api/src/modules/campaigns/campaign.controller.ts`<br>`apps/worker/src/processors/email.processor.ts` | Codebase scan: zero cron occurrences |
| **REQ-11 to 15** | PostgreSQL Database Schema & Prisma ORM | `prisma/schema.prisma`<br>`apps/api/src/db/prisma.ts` | `prisma db push` / `prisma/schema.prisma` |
| **REQ-16 to 20** | Secret Encryption with AES-256-GCM | `apps/api/src/utils/crypto.ts`<br>`apps/worker/src/utils/crypto.ts` | `tests/unit/crypto.test.ts` (3 tests pass) |
| **REQ-21 to 25** | CSV / TXT Recipient Parsing & Validation | `packages/shared/src/utils/index.ts`<br>`apps/api/src/middleware/upload.middleware.ts` | `tests/unit/email-parser.test.ts` (7 tests pass) |
| **REQ-26 to 30** | Round-Robin Sender Rotation Engine | `packages/shared/src/utils/index.ts`<br>`apps/api/src/modules/campaigns/campaign.controller.ts` | `tests/unit/sender-allocation.test.ts` (3 tests pass) |
| **REQ-31 to 35** | Atomic Redis Lua Sliding-Window Rate Limiter | `apps/worker/src/services/rate-limiter/redis-rate-limiter.ts` | `tests/unit/rate-limiter.test.ts` (4 tests pass) |
| **REQ-36 to 40** | High-Concurrency Load & Cooldown Lock | `apps/worker/src/services/rate-limiter/redis-rate-limiter.ts` | `tests/integration/load-rate-limit.test.ts` (1 test pass) |
| **REQ-41 to 45** | Real Ethereal SMTP Delivery & Preview URLs | `apps/worker/src/services/smtp/smtp.service.ts`<br>`apps/api/src/services/smtp/smtp.service.ts` | `tests/integration/worker-state-machine.test.ts` |
| **REQ-46 to 50** | Atomic State Machine & Idempotency Gate | `apps/worker/src/processors/email.processor.ts` | `tests/integration/worker-state-machine.test.ts` |
| **REQ-51 to 55** | Worker Crash & Restart Delayed Job Persistence | `apps/worker/src/worker.ts`<br>`apps/api/src/queues/email.queue.ts` | `tests/integration/restart-persistence.test.ts` (1 test pass) |
| **REQ-56 to 60** | Startup Queue Reconciliation | `apps/worker/src/scripts/reconcile.ts`<br>`apps/worker/src/worker.ts` | `tests/integration/reconciliation.test.ts` (1 test pass) |
| **REQ-61 to 65** | Elasticsearch 8 Full-Text Search Integration | `apps/api/src/services/elasticsearch/elasticsearch.service.ts`<br>`apps/worker/src/processors/index.processor.ts` | `tests/integration/elasticsearch.test.ts` (2 tests pass) |
| **REQ-66 to 70** | Bull Board Administration Dashboard | `apps/api/src/queues/index.queue.ts`<br>`apps/api/src/app.ts` | Mounted at `/admin/queues` |
| **REQ-71 to 75** | Google & Slack OAuth 2.0 Integrations | `apps/api/src/modules/auth/`<br>`apps/api/src/modules/slack/` | Live OAuth routes & local dev fallback |
| **REQ-76 to 80** | React + Vite Frontend (Tables, Modals, Badges) | `apps/web/src/pages/DashboardPage.tsx`<br>`apps/web/src/components/ComposeModal.tsx` | Production Vite build succeeds |
| **REQ-81** | Unified Automated Verification Script | `scripts/verify.mjs` | `npm run verify` passes with code 0 |

---

## License
MIT License. Built for ReachInbox / Outbox Labs Technical Assignment.
