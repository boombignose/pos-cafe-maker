# Approved requirements and progress
Latest user steering: **demo first, no Docker**. Default browser demo stores simulated café records locally; PostgreSQL remains an optional experimental extension, excluded from demo acceptance. No claim of multi-terminal financial consistency in browser storage.

This implements the user's 2026-10-14 plan, with destination changed by the user to **boombignose/pos-cafe-maker**.

| Requirement | Delivery/check |
|---|---|
| Adjustable mm screen/board/ports, placement, rotation, assembled/exploded/transparent | Designer + browser evidence |
| Canonical 3D + print-ready separate frame/body/lid/base STL and JSON/ZIP | Geometry tests + slicer review |
| 5V accessory PCB with reverse polarity/fuse, BOM/schematic/wiring | KiCad sources + ERC/DRC + prototype labels |
| KiCad to JSON geometry, regenerated mounting posts | Manifest round trip test |
| Café sales/options/recipes, cash and confirmed transfer | API + browser/DB tests |
| Owner/cashier/bar authorization, shifts, queue and reports | Permission and workflow tests |
| Atomic stock/checkout/refund, integer money and idempotency | Concurrent DB integration tests |
| No-Docker browser demo; durable DB remains optional | Fresh compiled ZIP browser smoke passes; PostgreSQL integration locally SKIP |
| Thai docs, licenses, examples, evidence, CI, ZIP, public repo | Release verification |

Physical prints, assembled hardware thermal/load tests and manufactured PCB are distinct from digital validation; no claim of physical validation without evidence.

## Current evidence
- Web/demo: build and fresh ZIP browser smoke PASS.
- TypeScript tests:32 PASS,1 optional PostgreSQL SKIP locally; Python hardware tests:5 PASS.
- Default CAD:closed meshes at0.001mm and no solid default collisions; physical fit unverified.
- KiCad10.0.7:ERC/DRC/parity/unconnected/exclusions0; hashes current.
- Slicer:official Prusa2.9.6 verified but fails to start on this Mac; no slicing claim.
- Public repository created; publication verified separately after upload.
