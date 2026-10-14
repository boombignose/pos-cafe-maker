# POS Café Maker Implementation Plan
> Execute the approved user spec; use Superpowers workflows, test-first changes and independent subsystem workers. No new approval gate: user explicitly requested implementation.

**Latest approved steer:** demo first, no Docker. Default local browser simulation; optional PostgreSQL is not a demo acceptance gate. Destination boombignose.

**Goal:** publish the Thai POS, printable enclosure and KiCad accessory kit to boombignose/pos-cafe-maker.
**Architecture:** React/Vite interface, canonical JSCAD model generator, Express/PostgreSQL transactions, separate KiCad hardware artifacts. Browser geometry and PCB manifests use mm.
**Spec:** ../../REQUIREMENTS.md
**Global constraints:** wall 2.4mm; clearance 0.3mm; tilt 60°; bed 220×220×250mm; integer satang; Bangkok days; one café; cash/manual transfer; physical prototype labels.

## Task 1 — Designer and geometry
- [x] Fail tests for dimensions, invalid parameters, excluded electronics, collisions and part export.
- [x] Implement src/designer/* and scripts/export-models.ts; default export Designer React component.
- [x] Test and generate STL plus JSON examples; capture browser evidence.
## Task 2 — POS backend
- [x] Fail real DB integration tests for checkout/stock/idempotency/refunds/roles/shifts.
- [x] Implement server/* and tests/db.test.ts against docs/API.md; migrate, bootstrap owner, demo seed explicitly.
- [x] Test rollback, two simultaneous checkouts and persistence.
## Task 3 — Hardware
- [x] Implement hardware/* and scripts/hardware/* with genuine KiCad 10 source, BOM, wiring, return manifest, manufacturing artifacts.
- [x] ERC/DRC, exports and manifest tests; retain actual reports and mark prototype.
## Task 4 — UI and delivery
- [x] Test form/cart logic first; implement cashier/bar/admin pages using docs/API.md.
- [x] User changed delivery to no-Docker demo: Thai docs, simulated persistence, experimental backend clearly separated.
- [x] Run build, tests, browser end-to-end, fresh compiled ZIP and scoped review; DB backup/restore excluded from revised demo scope.
- [ ] Publish authorized GitHub repository and release; verify URLs, CI and ZIP.

## Review focus
Duplicate/mutated idempotency keys, recipe replacement, non-restocking prepared refunds, malformed imported geometry, stale PCB manifests and secrets in public artifacts.

## Progress and rulings
User explicitly changed scope to demo first/no Docker and deferred CLI login; browser boombignose account is authorized and publishing through web UI. Optional DB runtime remains unverified locally. Reviewer hardware intersections, checkout replay and transfer/refund accounting findings repaired with regressions. Slicer runtime blocked; captured actual blocker and preserved prototype label.
