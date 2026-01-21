# Flow: Ecommerce

## Goal
Build or extend an ecommerce platform with reliable checkout and inventory integrity.

## Discovery prompts
- What products and catalog rules exist?
- What payment providers are used?
- What are peak traffic expectations?
- What are return/refund rules?
- What are compliance requirements (PCI, taxes)?

## Required artifacts
- `requirement.md` with revenue and conversion goals
- `functional-spec.md` for browse, cart, checkout, returns
- `technical-spec.md` for payment and order integrations
- `docs/ARCHITECTURE.md` for scaling and availability
- `test-plan.md` for checkout and payment validation

## Risk and compliance
- Payment failures and data leakage
- Inventory inconsistencies
- Peak traffic and downtime

## Acceptance criteria examples
- Checkout success rate above threshold.
- Inventory updates are consistent across channels.
- Payment data never stored in plaintext.

## Recommended outputs
- Checkout flow diagram
- Fraud prevention checklist
- Post-purchase email templates

