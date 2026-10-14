# Shop-ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a no-Docker single-shop POS release that Windows operators can configure without editing source.
**Architecture:** Reuse Express/PostgreSQL accounting and React views. Add protected setup/settings, durable checkout recovery, a managed local PostgreSQL launcher with backups, and separate compiled shop/demo packages.
**Tech Stack:** React/TypeScript, Express, PostgreSQL 17/18, Node 24, built-in filesystem/process/readline, existing pg/zod/Playwright.
**Spec:** docs/superpowers/specs/2026-10-14-shop-ready.md

## Global Constraints
- Windows primary, Mac local verification; no Docker required; source and existing DB untouched.
- One shop, integer satang, server prices/roles, atomic checkout/refund, Bangkok dates.
- No common owner password; install-specific setup token; no bank or hardware certification claim.
- Preserve demo, designer, geometry/hardware evidence and licenses.

## Review Focus
- LAN HTTP crypto availability and session expiry must not drop an unresolved sale.
- Lost checkout response followed by edits/reload must never generate another sale.
- Setup races/invalid tokens and last-owner changes must preserve control of the shop.
- Failed/partial restore and interrupted backup must leave original data/config intact.
- Existing database/config and duplicate launcher starts must not overwrite data.

### Task 1: Shop backend lifecycle
**Files:** server/db.ts, server/app.ts, server/shop.ts, server/migrations/002-shop.sql, tests/shop.test.ts
**Interfaces:** createApp(pool, {setupToken?:string}); GET/PUT settings; POST setup; date-filtered orders; existing financial interfaces unchanged.
- [ ] Write real PostgreSQL tests for invalid token/concurrent setup/settings roles/history/repeated migrations, run RED.
- [ ] Add ordered migrations and validated shop settings, setup transaction/owner lock, historical orders.
- [ ] Run new and existing DB tests GREEN and commit.

### Task 2: Shop frontend and recoverable payment
**Files:** src/main.tsx, src/pos/api.ts, src/pos/logic.ts, src/pos/Sales.tsx, src/pos/Admin.tsx, src/pos/Setup.tsx, src/pos/checkout-intent.ts, tests/checkout-intent.test.ts, scripts/shop-browser-smoke.mjs
**Interfaces:** Session includes setupRequired; settings shape {name,address,phone,paper}; immutable persisted pending payload; api failures include code/status/uncertain.
- [ ] Write tests for persisted exact key/payload and UUID fallback; browser test lost response/reload/login/receipt/settings/users; observe RED.
- [ ] Add Thai setup/settings/team/history controls; user-scoped draft and pending lock; retry original intent only; auth/error handling.
- [ ] Run suite/build, server browser workflow and demo regression GREEN; commit.

### Task 3: Windows-first launcher and recovery
**Files:** scripts/shop/*.mjs, Start.cmd, start.sh, tsconfig.server.json, package.json, tests/shop-runtime.test.ts, scripts/package-shop.py, docs/INSTALL.md
**Interfaces:** node scripts/shop/cli.mjs start|backup|restore <file>; POS_DATA_DIR override for isolated tests; POS_PG_BIN explicit directory or discovered official install; compiled runtime in runtime/.
- [ ] Write real cluster test first: separate temporary data dirs, unchanged sentinel, start/setup/restart, backup/restore original kept, malformed archive rejected; run RED.
- [ ] Build JS server and package; implement dedicated cluster/config/start lock, periodic backups and empty-target atomic restore; no destructive DB commands.
- [ ] Run integration and fresh extracted ZIP restart/restore GREEN; commit.

### Task 4: Verify and publish accurately
**Files:** .github/workflows/ci.yml, README.md, docs/BACKEND.md, docs/REQUIREMENTS.md, docs/TEST-REPORT.md, docs/evidence/, release artifacts
- [ ] Add Windows/Linux real PostgreSQL shop checks, verify all existing tests and demo.
- [ ] Complete one fresh whole-branch review; fix Critical/Important once with RED→GREEN regressions.
- [ ] Build source/shop/demo ZIPs; inspect hashes and fresh package; publish source/release with truthful OS/hardware evidence and preserve Pages demo.
- [ ] Confirm public CI and release assets, record limitations and deliver.
