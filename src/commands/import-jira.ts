import { runHello } from "./hello";

type JiraTicketRef = {
  key: string;
  siteBase?: string;
};

type JiraIssueResponse = {
  key?: string;
  fields?: {
    summary?: string;
    description?: unknown;
  };
};

function parseJiraTicket(input: string): JiraTicketRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const keyOnly = trimmed.match(/^([a-z][a-z0-9_]*-\d+)$/i);
  if (keyOnly) {
    return { key: keyOnly[1].toUpperCase() };
  }

  const browseUrl = trimmed.match(/^https?:\/\/([^/]+)\/browse\/([a-z][a-z0-9_]*-\d+)(?:[/?#].*)?$/i);
  if (browseUrl) {
    const parsed = new URL(trimmed);
    return {
      key: browseUrl[2].toUpperCase(),
      siteBase: `${parsed.protocol}//${parsed.host}`
    };
  }

  return null;
}

function collectAdfText(node: unknown, chunks: string[]): void {
  if (!node || typeof node !== "object") {
    return;
  }

  const obj = node as { text?: unknown; content?: unknown };
  if (typeof obj.text === "string") {
    chunks.push(obj.text);
  }

  if (Array.isArray(obj.content)) {
    for (const child of obj.content) {
      collectAdfText(child, chunks);
    }
  }
}

function toDescriptionText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const chunks: string[] = [];
  collectAdfText(value, chunks);
  return chunks.join(" ").trim();
}

function getJiraApiBase(ref: JiraTicketRef): string[] {
  if (process.env.SDD_JIRA_API_BASE && process.env.SDD_JIRA_API_BASE.trim().length > 0) {
    return [process.env.SDD_JIRA_API_BASE.trim().replace(/\/$/, "")];
  }

  if (ref.siteBase) {
    const site = ref.siteBase.replace(/\/$/, "");
    return [`${site}/rest/api/3`, `${site}/rest/api/2`];
  }

  return [];
}

function getJiraAuthHeader(): string | null {
  if (process.env.SDD_JIRA_AUTH && process.env.SDD_JIRA_AUTH.trim().length > 0) {
    return process.env.SDD_JIRA_AUTH.trim();
  }

  const email = process.env.SDD_JIRA_EMAIL || "";
  const token = process.env.SDD_JIRA_TOKEN || "";
  if (email.trim().length > 0 && token.trim().length > 0) {
    const basic = Buffer.from(`${email.trim()}:${token.trim()}`, "utf-8").toString("base64");
    return `Basic ${basic}`;
  }

  return null;
}

async function fetchJiraTicket(
  ref: JiraTicketRef
): Promise<{ key: string; summary: string; description: string; sourceUrl: string }> {
  const apiBases = getJiraApiBase(ref);
  if (apiBases.length === 0) {
    throw new Error(
      "Jira API base is required. Set SDD_JIRA_API_BASE or provide a full browse URL: https://<site>/browse/PROJ-123"
    );
  }

  const auth = getJiraAuthHeader();
  let lastStatus = 0;
  for (const base of apiBases) {
    const endpoint = `${base}/issue/${encodeURIComponent(ref.key)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "sdd-cli"
    };
    if (auth) {
      headers.Authorization = auth;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      lastStatus = response.status;
      continue;
    }

    const payload = (await response.json()) as JiraIssueResponse;
    const key = (payload.key || ref.key).toUpperCase();
    const summary = payload.fields?.summary?.trim() || `Ticket ${key}`;
    const description = toDescriptionText(payload.fields?.description);

    let sourceUrl = `${key}`;
    if (ref.siteBase) {
      sourceUrl = `${ref.siteBase.replace(/\/$/, "")}/browse/${key}`;
    } else if (process.env.SDD_JIRA_SITE_BASE && process.env.SDD_JIRA_SITE_BASE.trim().length > 0) {
      sourceUrl = `${process.env.SDD_JIRA_SITE_BASE.trim().replace(/\/$/, "")}/browse/${key}`;
    }

    return { key, summary, description, sourceUrl };
  }

  throw new Error(`Failed to fetch Jira ticket (${lastStatus || "unknown status"}).`);
}

function buildSeedText(ticket: { key: string; summary: string; description: string; sourceUrl: string }): string {
  const bodySnippet = ticket.description.trim().slice(0, 400).replace(/\s+/g, " ");
  return `Resolve Jira ticket: ${ticket.key} ${ticket.summary}. Context: ${bodySnippet}. Source: ${ticket.sourceUrl}`;
}

export async function runImportJira(ticketInput: string): Promise<void> {
  const ref = parseJiraTicket(ticketInput);
  if (!ref) {
    console.log(
      "Invalid Jira ticket. Expected format: PROJ-123 or https://<your-jira-site>/browse/PROJ-123"
    );
    return;
  }

  console.log(`Importing Jira ticket ${ref.key} ...`);
  try {
    const ticket = await fetchJiraTicket(ref);
    console.log(`Imported: ${ticket.summary}`);
    await runHello(buildSeedText(ticket), false);
  } catch (error) {
    console.log((error as Error).message);
  }
}
