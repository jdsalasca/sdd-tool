# Clean architecture checklist

Use this to verify the codebase keeps boundaries and remains maintainable.

## Layers
- Domain (entities, business rules)
- Use cases (application services)
- Interface adapters (CLI, HTTP, persistence)
- Infrastructure (providers, filesystem, AI)

## Rules
- Domain has no dependency on outer layers
- Use cases depend only on domain
- Adapters translate I/O to use case input/output
- Infrastructure details are injected via interfaces

## Testing
- Domain logic unit tests
- Use case tests with fakes
- Adapter tests for I/O
