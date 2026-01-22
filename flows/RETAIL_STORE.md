# Flow: Retail store

## Goal
Support in-store sales, inventory, and customer management in a reliable, low-latency system.

## Discovery prompts
- What POS systems and devices are in scope?
- What inventory sources are authoritative?
- What promotions and discount rules exist?
- How should returns and exchanges work?
- What offline mode is required?

## Required artifacts
- `requirement.md` with store operations constraints
- `functional-spec.md` for POS, inventory, and staff flows
- `technical-spec.md` for device integration and offline sync
- `architecture.md` for store-local resiliency
- `test-plan.md` for offline/online transitions

## Risk and compliance
- Inventory drift across locations
- Offline mode data loss
- PCI compliance for payments

## Acceptance criteria examples
- Store can operate for 8+ hours offline.
- Inventory reconciles within SLA after reconnect.
- Payment flows pass compliance checks.

## Recommended outputs
- POS workflow diagram
- Offline sync strategy
- Store ops checklist


