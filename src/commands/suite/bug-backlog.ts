import fs from "fs";
import path from "path";

type BugEntry = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: "open" | "in_progress" | "resolved";
  source: "quality_feedback";
  priority: "P0" | "P1";
  notes: string[];
};

type BugBacklog = {
  version: 1;
  project: string;
  updatedAt: string;
  items: BugEntry[];
};

function normalizeBugTitle(input: string): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .replace(/[.;:]+$/g, "")
    .trim();
}

function bugKey(input: string): string {
  return normalizeBugTitle(input).toLowerCase();
}

function isBugFeedback(item: string): boolean {
  const lower = String(item || "").toLowerCase();
  return (
    /missing dependency|cannot find module|install\/configure module|smoke|lint|test|build|eresolve|eslint|jest|ts-jest|runtime manifest|quality gate|placeholder/.test(
      lower
    ) ||
    /provider output contract failed|provider non-delivery detected/.test(lower)
  );
}

function splitBugAndQuality(hints: string[]): { bugs: string[]; quality: string[] } {
  const bugSet = new Set<string>();
  const qualitySet = new Set<string>();
  for (const raw of hints) {
    const value = normalizeBugTitle(raw);
    if (!value) continue;
    if (isBugFeedback(value)) {
      bugSet.add(value);
    } else {
      qualitySet.add(value);
    }
  }
  return { bugs: [...bugSet], quality: [...qualitySet] };
}

function readBugBacklog(file: string): BugBacklog {
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as BugBacklog;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.items)) {
        return parsed;
      }
    }
  } catch {
    // ignore and return empty
  }
  return {
    version: 1,
    project: "",
    updatedAt: "",
    items: []
  };
}

function writeBugBacklogMarkdown(file: string, backlog: BugBacklog): void {
  const lines: string[] = [
    "# Bug Backlog",
    "",
    `Updated: ${backlog.updatedAt}`,
    ""
  ];
  if (backlog.items.length === 0) {
    lines.push("- No open bugs.");
  } else {
    for (const item of backlog.items) {
      lines.push(`- [${item.priority}] ${item.id} (${item.status}) ${item.title}`);
      if (item.notes.length > 0) {
        lines.push(`  Notes: ${item.notes[item.notes.length - 1]}`);
      }
    }
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf-8");
}

/**
 * Splits quality hints into bug fixes and non-bug quality improvements.
 * Bug-like items are persisted into a dedicated bug backlog to avoid polluting requirements.
 */
export function persistBugBacklog(
  projectRoot: string,
  projectName: string,
  hints: string[],
  cycle: number
): { bugs: string[]; quality: string[] } {
  const split = splitBugAndQuality(hints);
  if (split.bugs.length === 0) {
    return split;
  }
  const deployDir = path.join(projectRoot, "generated-app", "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const jsonFile = path.join(deployDir, "bug-backlog.json");
  const mdFile = path.join(deployDir, "bug-backlog.md");
  const now = new Date().toISOString();
  const backlog = readBugBacklog(jsonFile);
  backlog.project = projectName;
  backlog.updatedAt = now;
  const byKey = new Map(backlog.items.map((item) => [bugKey(item.title), item] as const));
  let counter = backlog.items.length;
  for (const title of split.bugs) {
    const key = bugKey(title);
    const existing = byKey.get(key);
    if (existing) {
      existing.updatedAt = now;
      existing.status = existing.status === "resolved" ? "open" : existing.status;
      existing.notes.push(`cycle ${cycle}: observed again`);
      continue;
    }
    counter += 1;
    const id = `BUG-${String(counter).padStart(4, "0")}`;
    const item: BugEntry = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      status: "open",
      source: "quality_feedback",
      priority: /build|test|lint|smoke|cannot find module|missing dependency|runtime manifest/i.test(title) ? "P0" : "P1",
      notes: [`cycle ${cycle}: captured from quality feedback`]
    };
    backlog.items.push(item);
    byKey.set(key, item);
  }
  fs.writeFileSync(jsonFile, JSON.stringify(backlog, null, 2), "utf-8");
  writeBugBacklogMarkdown(mdFile, backlog);
  return split;
}
