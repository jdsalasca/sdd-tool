# Diagrams (text-based)

These diagrams describe the system behavior and are intended for Mermaid or PlantUML.

## High-level flow

```mermaid
flowchart TD
  A[hello] --> B{New or Resume?}
  B -->|New| C[Collect project + domain]
  B -->|Resume| D[Load metadata]
  C --> E[Route intent]
  D --> E[Route intent]
  E --> F[Discovery prompts]
  F --> G[Requirements created]
  G --> H[Refine]
  H --> I[Plan specs]
  I --> J[Start implementation]
  J --> K[Test plan]
  K --> L[Finish]
```

## Router decision

```mermaid
flowchart TD
  A[User input] --> B{Intent classifier}
  B -->|Bug| C[BUG_FIX flow]
  B -->|Learn| D[LEARN flow]
  B -->|Software| E[SOFTWARE_FEATURE flow]
  B -->|Design| F[DESIGN flow]
  B -->|Data Science| G[DATA_SCIENCE flow]
  B -->|Humanities| H[HUMANITIES flow]
  B -->|Business| I[BUSINESS flow]
  B -->|Legal| J[LEGAL flow]
  B -->|Unknown| K[GENERIC flow]
```

## Gate checks

```mermaid
flowchart TD
  A[Requirement] --> B{Acceptance criteria?}
  B -->|No| C[Ask questions]
  B -->|Yes| D{Test plan?}
  D -->|No| E[Generate test plan]
  D -->|Yes| F[Allow implementation]
```

## Diagram templates

Template files live in `templates/diagrams/`:
- `context.mmd`
- `container.mmd`
- `component.mmd`

Example diagrams live in `examples/diagrams/`.
