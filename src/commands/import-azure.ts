import { runHello } from "./hello";
import { printError } from "../errors";

type AzureRef = {
  id: string;
  siteBase?: string;
  project?: string;
};

type AzureWorkItemResponse = {
  id?: number;
  fields?: Record<string, unknown>;
  _links?: {
    html?: {
      href?: string;
    };
  };
};

function parseAzureWorkItem(input: string): AzureRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const shorthand = trimmed.match(/^AB#(\d+)$/i);
  if (shorthand) {
    return { id: shorthand[1] };
  }

  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) {
    return { id: numeric[1] };
  }

  const azureUrl = trimmed.match(
    /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)(?:[/?#].*)?$/i
  );
  if (azureUrl) {
    const parsed = new URL(trimmed);
    return {
      id: azureUrl[3],
      siteBase: `${parsed.protocol}//${parsed.host}/${azureUrl[1]}`,
      project: azureUrl[2]
    };
  }

  return null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getAzureApiBase(ref: AzureRef): string | null {
  if (process.env.SDD_AZURE_API_BASE && process.env.SDD_AZURE_API_BASE.trim().length > 0) {
    return process.env.SDD_AZURE_API_BASE.trim().replace(/\/$/, "");
  }

  if (ref.siteBase && ref.project) {
    return `${ref.siteBase.replace(/\/$/, "")}/${ref.project}/_apis/wit`;
  }

  return null;
}

function getAzureAuthHeader(): string | null {
  const pat = (process.env.SDD_AZURE_PAT || "").trim();
  if (pat.length === 0) {
    return null;
  }
  const basic = Buffer.from(`:${pat}`, "utf-8").toString("base64");
  return `Basic ${basic}`;
}

async function fetchAzureWorkItem(
  ref: AzureRef
): Promise<{ id: string; title: string; description: string; sourceUrl: string }> {
  const apiBase = getAzureApiBase(ref);
  if (!apiBase) {
    throw new Error(
      "Azure API base is required. Set SDD_AZURE_API_BASE or provide a full URL: https://dev.azure.com/<org>/<project>/_workitems/edit/<id>"
    );
  }

  const endpoint = `${apiBase}/workitems/${encodeURIComponent(ref.id)}?api-version=7.1`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "sdd-cli"
  };
  const auth = getAzureAuthHeader();
  if (auth) {
    headers.Authorization = auth;
  }

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch Azure work item (${response.status}).`);
  }

  const payload = (await response.json()) as AzureWorkItemResponse;
  const resolvedId = String(payload.id ?? ref.id);
  const titleRaw = payload.fields?.["System.Title"];
  const descriptionRaw = payload.fields?.["System.Description"];
  const sourceUrlRaw = payload._links?.html?.href;

  const title = typeof titleRaw === "string" && titleRaw.trim().length > 0 ? titleRaw.trim() : `Work item ${resolvedId}`;
  const description =
    typeof descriptionRaw === "string" && descriptionRaw.trim().length > 0 ? stripHtml(descriptionRaw) : "";
  const sourceUrl =
    typeof sourceUrlRaw === "string" && sourceUrlRaw.trim().length > 0
      ? sourceUrlRaw.trim()
      : ref.siteBase && ref.project
        ? `${ref.siteBase.replace(/\/$/, "")}/${ref.project}/_workitems/edit/${resolvedId}`
        : `AB#${resolvedId}`;

  return {
    id: resolvedId,
    title,
    description,
    sourceUrl
  };
}

function buildSeedText(item: { id: string; title: string; description: string; sourceUrl: string }): string {
  const bodySnippet = item.description.trim().slice(0, 400).replace(/\s+/g, " ");
  return `Resolve Azure work item: ${item.id} ${item.title}. Context: ${bodySnippet}. Source: ${item.sourceUrl}`;
}

export async function runImportAzure(workItemInput: string): Promise<void> {
  const ref = parseAzureWorkItem(workItemInput);
  if (!ref) {
    printError(
      "SDD-1131",
      "Invalid Azure work item. Expected AB#1234, 1234, or https://dev.azure.com/<org>/<project>/_workitems/edit/1234"
    );
    return;
  }

  console.log(`Importing Azure work item ${ref.id} ...`);
  try {
    const ticket = await fetchAzureWorkItem(ref);
    console.log(`Imported: ${ticket.title}`);
    await runHello(buildSeedText(ticket), false);
  } catch (error) {
    printError("SDD-1132", (error as Error).message);
  }
}
