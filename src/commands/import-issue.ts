import { runHello } from "./hello";

type GitHubIssueRef = {
  owner: string;
  repo: string;
  number: string;
};

function parseGitHubIssueUrl(input: string): GitHubIssueRef | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2], number: match[3] };
}

async function fetchIssue(ref: GitHubIssueRef): Promise<{ title: string; body: string; url: string }> {
  const baseApi = process.env.SDD_GITHUB_API_BASE || "https://api.github.com";
  const endpoint = `${baseApi.replace(/\/$/, "")}/repos/${ref.owner}/${ref.repo}/issues/${ref.number}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sdd-cli"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch issue (${response.status}).`);
  }
  const payload = (await response.json()) as { title?: string; body?: string; html_url?: string };
  return {
    title: payload.title || `Issue #${ref.number}`,
    body: payload.body || "",
    url: payload.html_url || `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`
  };
}

function buildSeedText(issue: { title: string; body: string; url: string }): string {
  const bodySnippet = issue.body.trim().slice(0, 400).replace(/\s+/g, " ");
  return `Resolve issue: ${issue.title}. Context: ${bodySnippet}. Source: ${issue.url}`;
}

export async function runImportIssue(issueUrl: string): Promise<void> {
  const ref = parseGitHubIssueUrl(issueUrl);
  if (!ref) {
    console.log("Invalid GitHub issue URL. Expected format: https://github.com/<owner>/<repo>/issues/<number>");
    return;
  }

  console.log(`Importing issue ${ref.owner}/${ref.repo}#${ref.number} ...`);
  try {
    const issue = await fetchIssue(ref);
    const seedText = buildSeedText(issue);
    console.log(`Imported: ${issue.title}`);
    await runHello(seedText, false);
  } catch (error) {
    console.log((error as Error).message);
  }
}
