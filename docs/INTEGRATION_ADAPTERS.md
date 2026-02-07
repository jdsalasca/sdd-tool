# Integration Adapters Roadmap

This document defines the adapter contract for external work-item providers and the rollout plan beyond GitHub and Jira.

## Goal

Enable `sdd-cli` to import and normalize work items from multiple trackers using one stable internal shape.

## Adapter contract (v1)

Each adapter should provide the following interface:

```ts
type TrackerRef = {
  raw: string;          // user input
  projectKey?: string;  // tracker-specific project/workspace
  id: string;           // canonical ticket/issue id
};

type NormalizedWorkItem = {
  source: "github" | "jira" | "linear" | "azure" | "gitlab";
  id: string;
  title: string;
  body: string;
  url?: string;
  labels?: string[];
  state?: string;
  assignees?: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

interface TrackerAdapter {
  parseRef(input: string): TrackerRef | null;
  fetch(ref: TrackerRef): Promise<NormalizedWorkItem>;
}
```

## Normalization rules

- `title` must be non-empty and concise.
- `body` should include key context; if missing, default to `"N/A"`.
- `id` should remain source-native (`ABC-123`, `#42`, etc.).
- `source` controls downstream telemetry and reporting.
- Preserve provider-specific data under `metadata` instead of expanding top-level keys.

## Error handling

- Adapter parse failures must emit deterministic `SDD-11xx`/`SDD-18xx` codes.
- Network and auth failures must preserve provider message in `printError(...)`.
- Import command should fail gracefully without partial artifact writes.

## Adapters

### Linear
- Status: Implemented (`sdd-cli import linear <ticket|url>`)
- Input examples:
  - `LIN-123`
  - `https://linear.app/<team>/issue/LIN-123/...`
- Candidate command:
  - `sdd-cli import linear <ticket>`

### Azure Boards
- Status: Implemented (`sdd-cli import azure <work-item|url>`)
- Input examples:
  - `AB#1234`
  - `1234`
  - `https://dev.azure.com/<org>/<project>/_workitems/edit/1234`
- Candidate command:
  - `sdd-cli import azure <work-item>`

### GitLab Issues
- Input examples:
  - `https://gitlab.com/<group>/<project>/-/issues/123`
- Candidate command:
  - `sdd-cli import gitlab <url>`

## Rollout plan

1. Finalize adapter interface in code (`src/adapters/*`).
2. Implement one adapter (Linear) as architecture validation. (Done)
3. Implement Azure Boards importer with deterministic errors and integration tests. (Done)
4. Add integration tests with local HTTP stubs (same strategy used by GitHub/Jira tests). (Done for Linear/Azure)
5. Add docs and examples for each adapter. (In progress, GitLab pending)
6. Gate release with adapter smoke checks.

## Non-goals (v1)

- Two-way sync back to trackers.
- Remote state persistence.
- Custom field mapping UI.
