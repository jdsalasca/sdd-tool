import { runHello } from "./hello";
import { printError } from "../errors";

type LinearRef = {
  identifier: string;
};

type LinearIssueResponse = {
  data?: {
    issue?: {
      identifier?: string;
      title?: string;
      description?: string;
      url?: string;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

function parseLinearTicket(input: string): LinearRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const keyOnly = trimmed.match(/^([a-z][a-z0-9_]*-\d+)$/i);
  if (keyOnly) {
    return { identifier: keyOnly[1].toUpperCase() };
  }

  const linearUrl = trimmed.match(/^https?:\/\/linear\.app\/[^/]+\/issue\/([a-z][a-z0-9_]*-\d+)(?:[/?#].*)?$/i);
  if (linearUrl) {
    return { identifier: linearUrl[1].toUpperCase() };
  }

  return null;
}

async function fetchLinearTicket(
  ref: LinearRef
): Promise<{ identifier: string; title: string; description: string; sourceUrl: string }> {
  const endpoint = (process.env.SDD_LINEAR_API_BASE || "https://api.linear.app/graphql").trim();
  const token = (process.env.SDD_LINEAR_API_KEY || "").trim();
  const query = `
    query IssueByIdentifier($identifier: String!) {
      issue(identifier: $identifier) {
        identifier
        title
        description
        url
      }
    }
  `;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "sdd-cli"
  };
  if (token.length > 0) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      variables: { identifier: ref.identifier }
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Linear ticket (${response.status}).`);
  }

  const payload = (await response.json()) as LinearIssueResponse;
  if (payload.errors && payload.errors.length > 0) {
    const message = payload.errors[0]?.message || "Unknown Linear API error.";
    throw new Error(`Linear API error: ${message}`);
  }

  const issue = payload.data?.issue;
  if (!issue) {
    throw new Error(`Linear ticket not found: ${ref.identifier}`);
  }

  return {
    identifier: (issue.identifier || ref.identifier).toUpperCase(),
    title: issue.title?.trim() || `Linear ticket ${ref.identifier.toUpperCase()}`,
    description: issue.description?.trim() || "",
    sourceUrl: issue.url?.trim() || `https://linear.app/issue/${ref.identifier.toUpperCase()}`
  };
}

function buildSeedText(ticket: { identifier: string; title: string; description: string; sourceUrl: string }): string {
  const bodySnippet = ticket.description.trim().slice(0, 400).replace(/\s+/g, " ");
  return `Resolve Linear ticket: ${ticket.identifier} ${ticket.title}. Context: ${bodySnippet}. Source: ${ticket.sourceUrl}`;
}

export async function runImportLinear(ticketInput: string): Promise<void> {
  const ref = parseLinearTicket(ticketInput);
  if (!ref) {
    printError("SDD-1121", "Invalid Linear ticket. Expected LIN-123 or https://linear.app/<team>/issue/LIN-123/<slug>");
    return;
  }

  console.log(`Importing Linear ticket ${ref.identifier} ...`);
  try {
    const ticket = await fetchLinearTicket(ref);
    console.log(`Imported: ${ticket.title}`);
    await runHello(buildSeedText(ticket), false);
  } catch (error) {
    printError("SDD-1122", (error as Error).message);
  }
}
