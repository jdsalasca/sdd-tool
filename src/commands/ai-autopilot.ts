import fs from "fs";
import path from "path";
import { resolveProvider } from "../providers";
import { RequirementDraft } from "./req-create";

type ProviderExecFn = (prompt: string) => { ok: boolean; output: string; error?: string };

type PromptDebugContext = {
  providerId: string;
  stage: string;
  filePath?: string;
};

function resolvePromptDebugFile(filePath?: string): string | null {
  const envPath = process.env.SDD_PROMPT_DEBUG_FILE?.trim();
  const target = envPath || filePath?.trim();
  if (!target) {
    return null;
  }
  return path.resolve(target);
}

function appendPromptDebug(
  context: PromptDebugContext,
  payload: {
    prompt: string;
    ok: boolean;
    output: string;
    error?: string;
    durationMs: number;
  }
): void {
  const file = resolvePromptDebugFile(context.filePath);
  if (!file) {
    return;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const entry = {
      at: new Date().toISOString(),
      provider: context.providerId,
      stage: context.stage,
      durationMs: payload.durationMs,
      ok: payload.ok,
      error: payload.error || "",
      prompt: payload.prompt,
      output: payload.output
    };
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
    const metadataFile = file.replace(/provider-prompts\.jsonl$/i, "provider-prompts.metadata.jsonl");
    const snippet = (value: string): string => {
      const clean = value.replace(/\s+/g, " ").trim();
      return clean.length > 320 ? `${clean.slice(0, 320)}...[truncated]` : clean;
    };
    const metaEntry = {
      at: entry.at,
      provider: context.providerId,
      stage: context.stage,
      durationMs: payload.durationMs,
      ok: payload.ok,
      error: payload.error || "",
      promptPreview: snippet(payload.prompt),
      outputPreview: snippet(payload.output)
    };
    fs.appendFileSync(metadataFile, `${JSON.stringify(metaEntry)}\n`, "utf-8");
  } catch {
    // best effort
  }
}

function createLoggedExec(providerExec: ProviderExecFn, context: PromptDebugContext): ProviderExecFn {
  return (prompt: string) => {
    const started = Date.now();
    const result = providerExec(prompt);
    appendPromptDebug(context, {
      prompt,
      ok: result.ok,
      output: result.output ?? "",
      error: result.error,
      durationMs: Date.now() - started
    });
    return result;
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const parseFirstBalancedObject = (raw: string): Record<string, unknown> | null => {
    const source = raw.trim();
    const start = source.indexOf("{");
    if (start < 0) {
      return null;
    }
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaping) {
          escaping = false;
        } else if (char === "\\") {
          escaping = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }
      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = source.slice(start, i + 1);
          try {
            const parsed = JSON.parse(candidate) as Record<string, unknown>;
            return unwrapResponse(parsed);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  };
  const parseCandidate = (raw: string): Record<string, unknown> | null => {
    const direct = raw.trim();
    if (!direct) {
      return null;
    }
    try {
      const parsed = JSON.parse(direct);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      // keep trying
    }

    const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
    if (fenceMatch && fenceMatch[1]) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim());
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        // keep trying
      }
    }
    return parseFirstBalancedObject(raw);
  };
  const unwrapResponse = (value: Record<string, unknown>): Record<string, unknown> | null => {
    const nested = value.response;
    if (typeof nested !== "string") {
      return value;
    }
    const parsedNested = parseCandidate(nested);
    return parsedNested ?? value;
  };

  const parsed = parseCandidate(text);
  if (!parsed) {
    return null;
  }
  return unwrapResponse(parsed);
}

function normalizeFileEntries(items: unknown[]): Array<{ path: string; content: string }> {
  const normalized: Array<{ path: string; content: string }> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const pathCandidate =
      (typeof row.path === "string" && row.path) ||
      (typeof row.file === "string" && row.file) ||
      (typeof row.filePath === "string" && row.filePath) ||
      (typeof row.filename === "string" && row.filename) ||
      (typeof row.name === "string" && row.name);
    const contentCandidate =
      (typeof row.content === "string" && row.content) ||
      (typeof row.code === "string" && row.code) ||
      (typeof row.text === "string" && row.text) ||
      (typeof row.body === "string" && row.body) ||
      (typeof row.patch === "string" && row.patch);
    if (typeof pathCandidate !== "string" || typeof contentCandidate !== "string") {
      continue;
    }
    const rel = safeRelativePath(pathCandidate);
    if (!rel) {
      continue;
    }
    normalized.push({ path: rel, content: contentCandidate });
  }
  return normalized;
}

function extractFilesFromParsed(parsed: Record<string, unknown> | null): Array<{ path: string; content: string }> {
  if (!parsed) {
    return [];
  }
  const keys = ["files", "artifacts", "changes", "patches", "file_updates", "updates"];
  for (const key of keys) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      const files = normalizeFileEntries(value);
      if (files.length > 0) {
        return files;
      }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, content]) => typeof content === "string")
        .map(([filePath, content]) => ({ path: filePath, content: content as string }));
      const files = normalizeFileEntries(entries);
      if (files.length > 0) {
        return files;
      }
    }
  }
  const wrappers = ["result", "data", "payload", "output", "response"];
  for (const key of wrappers) {
    const nested = parsed[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedFiles = extractFilesFromParsed(nested as Record<string, unknown>);
      if (nestedFiles.length > 0) {
        return nestedFiles;
      }
    }
  }
  return [];
}

function parseFilesFromRawText(raw: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const patterns = [
    /(?:^|\r?\n)(?:FILE|File|PATH|Path)\s*:\s*([^\r\n]+)\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```/g,
    /(?:^|\r?\n)#+\s+([^\r\n]+\.[a-z0-9._-]+)\r?\n```[^\n]*\r?\n([\s\S]*?)\r?\n```/gi
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const rel = safeRelativePath(match[1].trim());
      if (!rel) {
        continue;
      }
      files.push({ path: rel, content: match[2] });
    }
  }
  return files;
}

function asText(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const clean = value.trim();
    return clean.length > 0 ? clean : fallback;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join("; ");
    }
    return fallback;
  }
  if (value && typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>)
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (entries.length > 0) {
      return entries.join("; ");
    }
  }
  return fallback;
}

function parseCsvLikeItems(input: string): string[] {
  return String(input || "")
    .split(/[\n,;|]+/g)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function containsGenericOnly(items: string[]): boolean {
  const genericTokens = [
    "baseline",
    "first iteration",
    "refinement",
    "tbd",
    "n/a",
    "best practices",
    "simple",
    "generic"
  ];
  if (items.length === 0) return true;
  const signalCount = items.filter((item) => {
    const lower = item.toLowerCase();
    return !genericTokens.some((token) => lower.includes(token));
  }).length;
  return signalCount < Math.max(2, Math.floor(items.length * 0.6));
}

function hasMeasurableAcceptance(items: string[]): boolean {
  return items.some((item) => /(\d+%|\d+\s*(ms|s|sec|seconds|min|minutes)|p95|p99|under\s+\d+|>=?\s*\d+|<=?\s*\d+)/i.test(item));
}

function measurableAcceptanceCount(items: string[]): number {
  return items.filter((item) => /(\d+%|\d+\s*(ms|s|sec|seconds|min|minutes)|p95|p99|under\s+\d+|>=?\s*\d+|<=?\s*\d+)/i.test(item)).length;
}

function requirementsNeedRefinement(draft: RequirementDraft): boolean {
  const actors = parseCsvLikeItems(draft.actors ?? "");
  const scopeIn = parseCsvLikeItems(draft.scope_in ?? "");
  const scopeOut = parseCsvLikeItems(draft.scope_out ?? "");
  const acceptance = parseCsvLikeItems(draft.acceptance_criteria ?? "");
  const constraints = parseCsvLikeItems(draft.constraints ?? "");
  const risks = parseCsvLikeItems(draft.risks ?? "");
  const weakObjective = (draft.objective ?? "").trim().length < 80;
  const weakNfr =
    (draft.nfr_security ?? "").trim().length < 30 ||
    (draft.nfr_performance ?? "").trim().length < 30 ||
    (draft.nfr_availability ?? "").trim().length < 30;
  if (weakObjective) return true;
  if (actors.length < 4 || containsGenericOnly(actors)) return true;
  if (scopeIn.length < 8 || containsGenericOnly(scopeIn)) return true;
  if (scopeOut.length < 3) return true;
  if (acceptance.length < 10 || containsGenericOnly(acceptance)) return true;
  if (!hasMeasurableAcceptance(acceptance) || measurableAcceptanceCount(acceptance) < 2) return true;
  if (constraints.length < 4 || containsGenericOnly(constraints)) return true;
  if (risks.length < 4 || containsGenericOnly(risks)) return true;
  if (weakNfr) return true;
  return false;
}

function intentKeywords(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !/^(create|build|app|application|with|using|from|that|this|for|and|then)$/.test(token))
    .slice(0, 8);
}

function ensureMinItems(items: string[], min: number, fallbackFactory: (index: number) => string): string[] {
  const next = [...items];
  for (let i = next.length; i < min; i += 1) {
    next.push(fallbackFactory(i));
  }
  return next;
}

function hardenRequirementDraft(draft: RequirementDraft, input: string, domain: string): RequirementDraft {
  const keywords = intentKeywords(input);
  const keyA = keywords[0] || "core";
  const keyB = keywords[1] || "business";
  const keyC = keywords[2] || "quality";
  const objective = (draft.objective || "").trim();
  const safeObjective =
    objective.length >= 80
      ? objective
      : `Deliver a production-ready ${domain} solution focused on ${keyA} and ${keyB}, with measurable value outcomes, clear operational readiness, and quality gates that must pass before release.`;

  const actors = ensureMinItems(parseCsvLikeItems(draft.actors || ""), 4, (i) => {
    const defaults = ["end user", "product owner", "operations engineer", "quality engineer", "security reviewer"];
    return defaults[i] || `stakeholder-${i + 1}`;
  });
  const scopeIn = ensureMinItems(parseCsvLikeItems(draft.scope_in || ""), 8, (i) => {
    const defaults = [
      `support ${keyA} creation workflow with validation`,
      `support ${keyA} update workflow with audit trail`,
      `support ${keyB} search and filtering`,
      "persist domain records with deterministic local storage adapters",
      "provide role-aware access controls for key workflows",
      "include health/status and error handling paths",
      `provide reporting view for ${keyC} outcomes`,
      "export/import baseline data for local validation"
    ];
    return defaults[i] || `deliver scope capability ${i + 1}`;
  });
  const scopeOut = ensureMinItems(parseCsvLikeItems(draft.scope_out || ""), 3, (i) => {
    const defaults = [
      "third-party billing and payments integration",
      "multi-region deployment and enterprise SSO",
      "native mobile applications beyond desktop/web scope"
    ];
    return defaults[i] || `out-of-scope item ${i + 1}`;
  });
  const acceptance = ensureMinItems(parseCsvLikeItems(draft.acceptance_criteria || ""), 10, (i) => {
    const defaults = [
      "critical create/read/update/delete paths pass with 100% success in local smoke run",
      "automated tests cover critical flows with at least 80% statements on core modules",
      "lint/test/build/smoke commands complete successfully in local environment",
      "p95 API response time remains under 300ms for baseline dataset",
      "application starts in under 30 seconds on local machine",
      "no blocker or critical findings remain after digital role review",
      "README includes complete setup, test, run, and release instructions",
      "required architecture/components/schema/dummy-local artifacts are present and consistent",
      "at least one regression scenario is documented and automated",
      "release candidate and final release metadata are generated without FAIL entries"
    ];
    return defaults[i] || `acceptance criterion ${i + 1} with measurable threshold >= 1`;
  });
  const constraints = ensureMinItems(parseCsvLikeItems(draft.constraints || ""), 4, (i) => {
    const defaults = [
      "all deliverables must run locally without external paid services",
      "all project documentation and code comments must be in English",
      "cross-platform scripts must support Windows and macOS",
      "release progression must respect stage gates and quality checks"
    ];
    return defaults[i] || `constraint ${i + 1}`;
  });
  const risks = ensureMinItems(parseCsvLikeItems(draft.risks || ""), 4, (i) => {
    const defaults = [
      "provider may return partial/unusable payloads causing iteration delay",
      "dependency/version mismatch may break build or tests",
      "insufficient requirement precision can produce low-value implementations",
      "long-running campaign can stall without clear recovery policies"
    ];
    return defaults[i] || `risk ${i + 1}`;
  });

  return {
    ...draft,
    objective: safeObjective,
    actors: actors.join("; "),
    scope_in: scopeIn.join("; "),
    scope_out: scopeOut.join("; "),
    acceptance_criteria: acceptance.join("; "),
    constraints: constraints.join("; "),
    risks: risks.join("; "),
    nfr_security:
      (draft.nfr_security || "").trim().length >= 30
        ? (draft.nfr_security || "").trim()
        : "Enforce secure defaults, least privilege, input validation, and auditability for sensitive operations.",
    nfr_performance:
      (draft.nfr_performance || "").trim().length >= 30
        ? (draft.nfr_performance || "").trim()
        : "Meet baseline performance budget with p95 response under defined thresholds and stable resource usage.",
    nfr_availability:
      (draft.nfr_availability || "").trim().length >= 30
        ? (draft.nfr_availability || "").trim()
        : "Provide resilient startup, deterministic local runtime behavior, and graceful error handling for core flows."
  };
}

function safeRelativePath(input: string): string | null {
  const clean = input.trim().replace(/\\/g, "/");
  if (!clean || clean.startsWith("/") || /^[A-Za-z]:/.test(clean)) {
    return null;
  }
  let normalized = path.posix.normalize(clean);
  if (normalized.toLowerCase().startsWith("generated-app/")) {
    normalized = normalized.slice("generated-app/".length);
  }
  if (normalized.startsWith("../") || normalized === "..") {
    return null;
  }
  if (!normalized || normalized === "." || normalized.toLowerCase().startsWith("node_modules/")) {
    return null;
  }
  return normalized;
}

function flattenSingleTopFolder(
  files: Array<{ path: string; content: string }>,
  projectName?: string
): Array<{ path: string; content: string }> {
  if (files.length < 2) {
    return files;
  }
  const segments = files
    .map((file) => file.path.split("/").filter(Boolean)[0] ?? "")
    .filter((segment) => segment.length > 0);
  if (segments.length !== files.length) {
    return files;
  }
  const unique = [...new Set(segments)];
  if (unique.length !== 1) {
    return files;
  }
  const root = unique[0];
  const safeRoots = new Set(["src", "backend", "frontend", "docs", "deploy", "tests", "test", "config"]);
  const normalizedProject = projectName
    ? projectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    : "";
  const looksNestedProjectRoot =
    root.toLowerCase().includes("autopilot") ||
    root.toLowerCase().includes("generated-app") ||
    root.toLowerCase().includes("project") ||
    (normalizedProject.length > 0 && root.toLowerCase().includes(normalizedProject));
  if (safeRoots.has(root.toLowerCase()) || !looksNestedProjectRoot) {
    return files;
  }
  return files
    .map((file) => {
      const stripped = file.path.startsWith(`${root}/`) ? file.path.slice(root.length + 1) : file.path;
      const rel = safeRelativePath(stripped);
      return rel ? { path: rel, content: file.content } : null;
    })
    .filter((item): item is { path: string; content: string } => Boolean(item));
}

function askProviderForJson(
  providerExec: ProviderExecFn,
  prompt: string,
  debug?: { attempts: string[]; errors: string[] }
): Record<string, unknown> | null {
  const compactRepairSource = (rawOutput: string): string => {
    // Keep retry payload conservative on Windows to avoid command-length overflow in CLI wrappers.
    const platformCap = process.platform === "win32" ? 1200 : 2600;
    const compact = String(rawOutput || "").replace(/\s+/g, " ").trim();
    if (compact.length <= platformCap) {
      return compact;
    }
    return `${compact.slice(0, platformCap)} ...[truncated by sdd-tool due command length limits]`;
  };
  const buildDirectJsonRetryPrompt = (rawOutput: string): string =>
    [
      "Return ONLY valid JSON. No markdown. No explanations.",
      "Do not call tools or mention tools (for example write_file/read_file).",
      'Schema: {"files":[{"path":"relative/path","content":"..."}]}',
      "You must provide direct file contents in JSON.",
      "If previous output included tool limitations, ignore them and return the JSON payload now.",
      compactRepairSource(rawOutput)
    ].join("\n");
  const looksLikeRefusal = (raw: string): boolean => {
    const lower = raw.toLowerCase();
    return (
      lower.includes("cannot directly create or modify files") ||
      lower.includes("can't directly create or modify files") ||
      lower.includes("cannot create files directly") ||
      lower.includes("you can create them manually") ||
      lower.includes("i can provide the content") ||
      lower.includes("i cannot fulfill the request to generate the project files directly") ||
      lower.includes("tool \"write_file\" not found") ||
      lower.includes("write_file tool") ||
      lower.includes("unable to activate any skills at this time")
    );
  };
  const first = providerExec(prompt);
  if (debug) {
    debug.attempts.push(first.output?.slice(0, 1000) ?? "");
    if (first.error) debug.errors.push(first.error);
  }
  if (!first.ok) {
    return null;
  }
  if (looksLikeRefusal(first.output ?? "")) {
    if (debug) {
      debug.errors.push("provider_refused_file_generation");
    }
    const forced = providerExec(buildDirectJsonRetryPrompt(first.output ?? ""));
    if (debug) {
      debug.attempts.push(forced.output?.slice(0, 1000) ?? "");
      if (forced.error) debug.errors.push(forced.error);
    }
    if (forced.ok) {
      const forcedParsed = extractJsonObject(forced.output);
      if (forcedParsed) {
        return forcedParsed;
      }
      const forcedTextFiles = parseFilesFromRawText(forced.output);
      if (forcedTextFiles.length > 0) {
        return { files: forcedTextFiles };
      }
    }
    return null;
  }
  const looksLikeProviderFailure = (raw: string): boolean => {
    const lower = raw.toLowerCase();
    return (
      lower.trim() === "" ||
      lower.includes("ready for your command") ||
      lower.includes("terminalquotaerror") ||
      lower.includes("you have exhausted your capacity") ||
      lower.includes("error executing tool write_file") ||
      lower.includes("tool \"write_file\" not found") ||
      lower.includes("code: 429")
    );
  };
  if (looksLikeProviderFailure(first.output ?? "")) {
    if (debug) {
      debug.errors.push("provider_output_failure_signature");
    }
    return null;
  }
  const parsed = extractJsonObject(first.output);
  if (parsed) {
    return parsed;
  }
  const textFiles = parseFilesFromRawText(first.output);
  if (textFiles.length > 0) {
    return { files: textFiles };
  }
  const repairSource = compactRepairSource(first.output ?? "");
  const repairPrompt = [
    "Convert the following response into valid JSON only.",
    "Keep the same information.",
    "No markdown fences, no explanations.",
    "Do not call tools. Return direct file JSON payload.",
    repairSource
  ].join("\n");
  const second = providerExec(repairPrompt);
  if (debug) {
    debug.attempts.push(second.output?.slice(0, 1000) ?? "");
    if (second.error) debug.errors.push(second.error);
  }
  if (!second.ok) {
    return null;
  }
  if (looksLikeRefusal(second.output ?? "")) {
    if (debug) {
      debug.errors.push("provider_refused_file_generation");
    }
    return null;
  }
  const repaired = extractJsonObject(second.output);
  if (repaired) {
    return repaired;
  }
  const repairedTextFiles = parseFilesFromRawText(second.output);
  if (repairedTextFiles.length > 0) {
    return { files: repairedTextFiles };
  }
  return null;
}

function hasUnrecoverableProviderError(errors: string[]): boolean {
  const joined = errors.join("\n").toLowerCase();
  if (!joined) return false;
  return (
    joined.includes("terminalquotaerror") ||
    joined.includes("exhausted your capacity") ||
    joined.includes("code: 429") ||
    joined.includes(" 429") ||
    joined.includes("timed out") ||
    joined.includes("etimedout") ||
    joined.includes("the command line is too long") ||
    joined.includes("linea de comandos es demasiado larga") ||
    joined.includes("la línea de comandos es demasiado larga")
  );
}

function lastProviderError(errors: string[]): string {
  const line = errors
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return "";
  }
  return line.length > 220 ? `${line.slice(0, 220)}...[truncated]` : line;
}

function detectBaselineKind(intent: string): "notes" | "user_news" | "generic" {
  const lower = intent.toLowerCase();
  if (/\bnotes?\b|\bnotas?\b/.test(lower)) {
    return "notes";
  }
  if (
    (/usuarios?|users?/.test(lower) && /novedades|news|announcements?/.test(lower)) ||
    /gestion de usuarios/.test(lower) ||
    /user management/.test(lower)
  ) {
    return "user_news";
  }
  return "generic";
}

function normalizeIntentText(intent: string): string {
  return intent
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function intentRequiresJavaReactFullstack(intent: string): boolean {
  const lower = normalizeIntentText(intent);
  return /\bjava\b/.test(lower) && /\breact\b/.test(lower);
}

function intentExplicitlyRequestsTypeScript(intent: string): boolean {
  const lower = normalizeIntentText(intent);
  return /\btypescript\b|\bts\b/.test(lower);
}

function intentSuggestsRelationalDataDomain(intent: string): boolean {
  const lower = normalizeIntentText(intent);
  return [
    "library",
    "biblioteca",
    "inventario",
    "inventory",
    "prestamo",
    "prestamos",
    "loan",
    "loans",
    "usuario",
    "usuarios",
    "user",
    "users",
    "book",
    "books",
    "cita",
    "citas",
    "appointment",
    "appointments",
    "hospital",
    "contract",
    "contracts",
    "lawyer",
    "client",
    "clients",
    "cost",
    "costs"
  ].some((token) => lower.includes(token));
}

type AutopilotDomain = "software" | "legal" | "business" | "humanities" | "learning" | "design" | "data_science" | "generic";

function detectAutopilotDomain(intent: string, domainHint?: string): AutopilotDomain {
  const hinted = normalizeIntentText(domainHint ?? "");
  if (
    hinted === "software" ||
    hinted === "legal" ||
    hinted === "business" ||
    hinted === "humanities" ||
    hinted === "learning" ||
    hinted === "design" ||
    hinted === "data_science" ||
    hinted === "generic"
  ) {
    return hinted as AutopilotDomain;
  }
  const lower = normalizeIntentText(intent);
  if (/\bcourt\b|\blaw\b|\bpolicy\b|\bcompliance\b|\blawyer\b|\bregulation\b|\bcontract\b/.test(lower)) return "legal";
  if (/\bpricing\b|\bmarket\b|\bforecast\b|\beconomics\b|\baccounting\b|\bfinanzas\b|\bcontador\b/.test(lower)) return "business";
  if (/\bhistory\b|\bsociology\b|\banthropology\b|\bphilosophy\b|\bliterature\b|\bhumanities\b/.test(lower)) return "humanities";
  if (/\blearn\b|\bteach\b|\blesson\b|\bcourse\b|\bstudent\b|\bmentor\b|\bwriter\b|\bescritor\b/.test(lower)) return "learning";
  if (/\blogo\b|\bbrand\b|\blayout\b|\bvisual\b|\bdesign\b/.test(lower)) return "design";
  if (/\bmodel\b|\bdataset\b|\bprediction\b|\bmachine learning\b|\bml\b/.test(lower)) return "data_science";
  if (
    /\bfeature\b|\bapi\b|\bbackend\b|\bfrontend\b|\bimplement\b|\bdeveloper\b|\bcode\b|\bapp\b|\bweb\b|\bdesktop\b|\bmovil\b|\bmobile\b/.test(
      lower
    )
  ) {
    return "software";
  }
  return "generic";
}

function domainPromptConstraints(domain: AutopilotDomain): string[] {
  if (domain === "legal") {
    return [
      "Create legal-quality docs: compliance-matrix.md, risk-register.md, and legal-citations.md.",
      "Compliance docs must define jurisdiction, applicable regulations, controls, and evidence mapping.",
      "Risk register must include severity, likelihood, mitigation owner, and due date."
    ];
  }
  if (domain === "business") {
    return [
      "Create business-quality docs: assumptions.md, sensitivity-analysis.md, and unit-economics.md.",
      "Unit economics must include numeric metrics (CAC, LTV, margin, break-even or equivalent).",
      "Sensitivity analysis must include best/base/worst scenarios and trigger thresholds."
    ];
  }
  if (domain === "humanities") {
    return [
      "Create humanities-quality docs: methodology.md and sources.md.",
      "sources.md must include at least 3 primary or high-quality secondary references.",
      "Methodology must describe scope, analytical lens, limitations, and citation criteria."
    ];
  }
  if (domain === "learning") {
    return [
      "Create learning-quality docs: curriculum.md, exercises.md, and references.md.",
      "Exercises must include expected outcomes and evaluation criteria.",
      "Curriculum must include modules, objectives, prerequisites, and progression."
    ];
  }
  if (domain === "design") {
    return [
      "Create design-quality docs: design-system.md, accessibility.md, and rationale.md.",
      "accessibility.md must include WCAG-oriented checks and contrast/keyboard validation.",
      "rationale.md must capture major design decisions and tradeoffs."
    ];
  }
  if (domain === "data_science") {
    return [
      "Create data-science quality docs: dataset-schema.md, evaluation-metrics.md, monitoring-plan.md, reproducibility.md.",
      "evaluation-metrics.md must define baseline, target metrics, and acceptance thresholds.",
      "monitoring-plan.md must define drift detection and alerting rules."
    ];
  }
  return [];
}

function extraPromptConstraints(intent: string, domainHint?: string): string[] {
  const constraints: string[] = [];
  const domain = detectAutopilotDomain(intent, domainHint);
  constraints.push(...domainPromptConstraints(domain));
  constraints.push("All generated artifacts, docs, code comments, and commit-ready messages must be in English.");
  constraints.push("Do not generate proof-of-concept, MVP draft, or first-draft placeholders. Deliver production-ready baseline quality.");
  constraints.push("Default architecture style is MVC unless the user explicitly requests another pattern.");
  constraints.push("Use modular, extensible component blocks. Add components.md with responsibilities, contracts, and extension points.");
  constraints.push("Add mission.md and vision.md with concrete product mission, business direction, and value outcomes.");
  constraints.push("Prefer clear OOP-oriented modules/classes with explicit interfaces and separation of concerns.");
  constraints.push("Always generate a root README.md at repository root (not only docs/README.md).");
  constraints.push("README.md must include sections for Features, Setup/Run, Testing, and Release/Artifacts.");
  if (!intentExplicitlyRequestsTypeScript(intent)) {
    constraints.push("Default to JavaScript implementation and JavaScript tests unless the user explicitly requests TypeScript.");
  }
  constraints.push("Folder structure must be clean, scalable, and easy to evolve.");
  constraints.push("Generate real production code modules; do not deliver docs/tests-only repositories.");
  constraints.push("Do not rely on tool-calling output (for example write_file/read_file); return direct file JSON payload only.");
  constraints.push("Avoid placeholder text (TODO, FIXME, coming soon, lorem ipsum) in README, architecture.md, and components.md.");
  constraints.push("Include local runtime verification with a smoke script (npm run smoke or test:smoke or e2e).");
  constraints.push("Smoke script must be cross-platform (Node/npm command), avoid bash-only commands like ./smoke.sh.");
  constraints.push("Smoke/test/build scripts in package.json must reference files that exist in the repository.");
  constraints.push("If lint script uses eslint, include a valid eslint config file (.eslintrc.* or eslint.config.js).");
  constraints.push("Do not lint transpiled output folders (dist/build/out); lint source directories only.");
  constraints.push("Ensure every imported/required third-party package is declared in package.json dependencies/devDependencies.");
  constraints.push("If tests are written in TypeScript, configure Jest for TypeScript (ts-jest or equivalent) and include required test type packages.");
  constraints.push("Keep module format consistent between source and tests: CommonJS with require/module.exports or ESM with import/export + matching Jest config.");
  constraints.push("Do not place TypeScript-only syntax inside .js files. Keep smoke scripts valid for the selected runtime.");
  constraints.push("Avoid non-existent package versions. Use currently available npm versions for dependencies and type packages.");
  constraints.push("All automated tests must pass; fix failing assertions before delivery.");
  constraints.push("If coverage tooling exists, target at least 80% statement coverage for core modules.");
  constraints.push("If API/backend exists, include curl-based local endpoint checks in smoke docs/scripts.");
  constraints.push("Target minimum automated test depth of 8 tests across critical flows.");
  if (/\brbac\b|\brole[-\s]?based\b|\bauth\b|\bauthorization\b|\baccess control\b/.test(normalizeIntentText(intent))) {
    constraints.push("Implement strict RBAC middleware/guards and include negative authorization tests that assert 403 for unauthorized roles.");
  }
  if (/\bwindows\b|\bdesktop\b|\binstaller\b|\bexe\b|\belectron\b/.test(normalizeIntentText(intent))) {
    constraints.push("For Windows desktop goals, include executable packaging strategy (Electron/Forge/Builder) with scripts like package:win/dist:win.");
    constraints.push("Provide packaging config file (electron-builder.yml/json or forge.config.js) and document EXE artifact generation path in README.");
    constraints.push("Ensure icon assets for packaging are valid formats and readable by the selected packaging tool.");
    constraints.push("Desktop test/smoke commands must be non-GUI and CI-safe; do not require launching visible desktop windows.");
    constraints.push("Avoid fragile spawn-based Electron smoke tests in unit test suite; keep automated tests deterministic in headless environments.");
  }
  if (intentRequiresJavaReactFullstack(intent)) {
    constraints.push("Use split structure: backend/ (Java Spring Boot) and frontend/ (React + Vite).");
    constraints.push("Backend must expose REST APIs for users, books, loans, and inventory.");
    constraints.push("Frontend must consume backend APIs (do not keep data only in static mocks).");
    constraints.push("Use modern React data layer: @tanstack/react-query (not react-query).");
    constraints.push("Backend architecture must include DTO classes, service interfaces, and repository interfaces.");
    constraints.push("Use Java records for immutable request/response or transport models.");
    constraints.push("Use Lombok in backend entities/DTOs where appropriate (builder/getter/setter/constructor patterns).");
    constraints.push("Use Jakarta/Javax Bean Validation annotations and @Valid in request boundaries.");
    constraints.push("Include @RestControllerAdvice for global exception handling.");
    constraints.push("Add Spring Actuator telemetry and basic Prometheus-friendly metrics configuration.");
    constraints.push("Frontend architecture must include src/api, src/hooks (use*.ts/tsx), and src/components layers.");
    constraints.push("Frontend bootstrap must use React.StrictMode.");
    constraints.push("Frontend should include safe input validation and avoid direct unsafe HTML rendering.");
    constraints.push("Include frontend tests and backend tests that run in local CI.");
    constraints.push("Include architecture.md and execution-guide.md with clear local run instructions.");
  }
  if (intentSuggestsRelationalDataDomain(intent)) {
    constraints.push("Use a scalable relational database default (prefer PostgreSQL).");
    constraints.push("Include SQL schema file named schema.sql (or db/schema.sql) with tables, keys, indexes, and constraints.");
    constraints.push("Document local database strategy in README and DummyLocal docs.");
    if (/\bcontract|contracts|lawyer|client|clients|cost|costs\b/.test(normalizeIntentText(intent))) {
      constraints.push("Schema must include contract, lawyer, client, and cost entities with explicit foreign keys.");
      constraints.push("README and API docs must explain contract-lawyer-client-cost relationships and validation rules.");
    }
  }
  return constraints;
}

function commonPackageJson(projectName: string): string {
  return `{
  "name": "${projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test core.test.js"
  }
}
`;
}

function notesBaselineFiles(projectName: string): Array<{ path: string; content: string }> {
  const readme = `# ${projectName} - Notes App

A focused notes application with persistence, pinning, search, and inline edit/delete.

## Features
- Create, edit, pin, and delete notes
- Persistent storage via localStorage
- Search notes by text in real time
- Keyboard and screen-reader friendly controls
- Core domain logic covered with unit tests

## Run
1. Open \`index.html\` in your browser.
2. Use the app normally; notes persist automatically.

## Test
- Run \`npm test\` for store-level unit tests.
`;
  const core = `(function (globalScope) {
function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\\s+/g, " ");
}

function createNotesStore(storage, options) {
  const key = (options && options.key) || "notes-app-state-v1";
  const version = 1;

  function emptyState() {
    return { version, notes: [] };
  }

  function parseState(raw) {
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyState();
      const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      return { version, notes };
    } catch {
      return emptyState();
    }
  }

  function loadState() {
    return parseState(storage.getItem(key));
  }

  function saveState(state) {
    storage.setItem(key, JSON.stringify(state));
    return state;
  }

  function sorted(notes) {
    return [...notes].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  }

  function requireExisting(state, id) {
    const target = state.notes.find((n) => String(n.id) === String(id));
    if (!target) throw new Error("Note not found");
    return target;
  }

  return {
    list() {
      const state = loadState();
      return sorted(state.notes);
    },
    add(text) {
      const value = normalizeText(text);
      if (!value) throw new Error("Note text is required");
      if (value.length > 240) throw new Error("Note text too long (max 240)");
      const state = loadState();
      const timestamp = nowIso();
      const note = {
        id: String(Date.now()) + "-" + Math.random().toString(16).slice(2, 8),
        text: value,
        pinned: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.notes.push(note);
      saveState(state);
      return note;
    },
    update(id, text) {
      const value = normalizeText(text);
      if (!value) throw new Error("Note text is required");
      if (value.length > 240) throw new Error("Note text too long (max 240)");
      const state = loadState();
      const note = requireExisting(state, id);
      note.text = value;
      note.updatedAt = nowIso();
      saveState(state);
      return note;
    },
    togglePin(id) {
      const state = loadState();
      const note = requireExisting(state, id);
      note.pinned = !note.pinned;
      note.updatedAt = nowIso();
      saveState(state);
      return note;
    },
    remove(id) {
      const state = loadState();
      const before = state.notes.length;
      state.notes = state.notes.filter((n) => String(n.id) !== String(id));
      if (state.notes.length === before) throw new Error("Note not found");
      saveState(state);
      return true;
    },
    search(query) {
      const term = normalizeText(query).toLowerCase();
      if (!term) return this.list();
      return this.list().filter((n) => n.text.toLowerCase().includes(term));
    }
  };
}
const api = { createNotesStore };
if (typeof module !== "undefined" && module.exports) module.exports = api;
globalScope.NotesCore = api;
})(typeof window !== "undefined" ? window : globalThis);
`;
  const tests = `const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotesStore } = require("./core");

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

test("add stores normalized note text", () => {
  const store = createNotesStore(memoryStorage());
  const note = store.add("  First    note  ");
  assert.equal(note.text, "First note");
  assert.equal(store.list().length, 1);
});

test("add rejects empty text", () => {
  const store = createNotesStore(memoryStorage());
  assert.throws(() => store.add("   "), /required/);
});

test("add rejects too long text", () => {
  const store = createNotesStore(memoryStorage());
  assert.throws(() => store.add("x".repeat(241)), /too long/);
});

test("update modifies note text", () => {
  const store = createNotesStore(memoryStorage());
  const note = store.add("Old");
  const updated = store.update(note.id, "New");
  assert.equal(updated.text, "New");
  assert.equal(store.list()[0].text, "New");
});

test("togglePin moves note to top", () => {
  const store = createNotesStore(memoryStorage());
  const a = store.add("first");
  const b = store.add("second");
  store.togglePin(a.id);
  const list = store.list();
  assert.equal(list[0].id, a.id);
  assert.equal(list[1].id, b.id);
});

test("search filters by term", () => {
  const store = createNotesStore(memoryStorage());
  store.add("Buy milk");
  store.add("Read docs");
  const found = store.search("milk");
  assert.equal(found.length, 1);
  assert.equal(found[0].text, "Buy milk");
});

test("remove deletes existing note", () => {
  const store = createNotesStore(memoryStorage());
  const note = store.add("Temp");
  assert.equal(store.remove(note.id), true);
  assert.equal(store.list().length, 0);
});

test("remove throws when note is missing", () => {
  const store = createNotesStore(memoryStorage());
  assert.throws(() => store.remove("missing"), /not found/);
});
`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Notes App</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="app">
      <header class="header">
        <h1>Notes</h1>
        <p class="subtitle">Quick notes with persistence and search.</p>
      </header>

      <form id="note-form" class="row" aria-label="Create note">
        <label for="note-input" class="sr-only">New note text</label>
        <input id="note-input" type="text" maxlength="240" placeholder="Write a note..." required />
        <button type="submit">Add</button>
      </form>

      <section class="controls" aria-label="Notes filters">
        <label for="search-input" class="sr-only">Search notes</label>
        <input id="search-input" type="search" placeholder="Search notes..." />
        <button type="button" id="filter-all" data-filter="all" class="active">All</button>
        <button type="button" id="filter-pinned" data-filter="pinned">Pinned</button>
      </section>

      <p id="status-text" class="status" aria-live="polite"></p>
      <ul id="note-list" class="list" aria-label="Notes list"></ul>
    </main>
    <script src="core.js"></script>
    <script src="app.js"></script>
  </body>
</html>
`;
  const css = `:root {
  --bg: #f3f6fb;
  --card: #ffffff;
  --text: #1f2937;
  --muted: #6b7280;
  --primary: #0a66c2;
  --border: #d1d5db;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; background: radial-gradient(circle at top left, #ffffff, var(--bg)); color: var(--text); }
.app { max-width: 860px; margin: 40px auto; padding: 0 16px; }
.header h1 { margin: 0 0 4px; font-size: 32px; }
.subtitle { margin: 0 0 20px; color: var(--muted); }
.row, .controls { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
input[type="text"], input[type="search"] { flex: 1; min-width: 220px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
button { border: 1px solid transparent; border-radius: 10px; padding: 10px 14px; cursor: pointer; background: #e5e7eb; color: var(--text); }
button[type="submit"] { background: var(--primary); color: #fff; }
button.active { border-color: var(--primary); color: var(--primary); background: #e8f1fc; }
.status { color: var(--muted); margin: 8px 0 12px; min-height: 20px; }
.list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
.note { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; box-shadow: 0 2px 10px rgba(17, 24, 39, 0.05); }
.note-top { display: flex; justify-content: space-between; align-items: start; gap: 8px; }
.note-text { margin: 0; white-space: pre-wrap; word-break: break-word; }
.note-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.btn-danger { background: #fee2e2; color: #b91c1c; }
.btn-subtle { background: #eef2ff; color: #3730a3; }
.pin { color: #92400e; background: #fef3c7; }
.sr-only { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
@media (max-width: 640px) {
  .header h1 { font-size: 28px; }
}
`;
  const js = `const store = window.NotesCore.createNotesStore(window.localStorage);
const form = document.getElementById("note-form");
const input = document.getElementById("note-input");
const searchInput = document.getElementById("search-input");
const list = document.getElementById("note-list");
const statusText = document.getElementById("status-text");
const filterAll = document.getElementById("filter-all");
const filterPinned = document.getElementById("filter-pinned");

const state = {
  filter: "all",
  search: ""
};

function showStatus(message) {
  statusText.textContent = message;
}

function currentNotes() {
  let items = state.search ? store.search(state.search) : store.list();
  if (state.filter === "pinned") {
    items = items.filter((item) => item.pinned);
  }
  return items;
}

function render() {
  const notes = currentNotes();
  list.innerHTML = "";
  if (notes.length === 0) {
    const li = document.createElement("li");
    li.className = "note";
    li.textContent = "No notes yet. Add your first one.";
    list.appendChild(li);
    showStatus("0 notes");
    return;
  }

  notes.forEach((item) => {
    const li = document.createElement("li");
    li.className = "note";

    const top = document.createElement("div");
    top.className = "note-top";
    const text = document.createElement("p");
    text.className = "note-text";
    text.textContent = item.text;
    if (item.pinned) {
      const badge = document.createElement("span");
      badge.className = "pin";
      badge.textContent = "Pinned";
      top.appendChild(badge);
    }
    top.appendChild(text);
    li.appendChild(top);

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn-subtle";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      const next = window.prompt("Edit note", item.text);
      if (next === null) return;
      try {
        store.update(item.id, next);
        render();
      } catch (error) {
        showStatus(error.message);
      }
    });

    const pin = document.createElement("button");
    pin.type = "button";
    pin.className = "btn-subtle";
    pin.textContent = item.pinned ? "Unpin" : "Pin";
    pin.addEventListener("click", () => {
      store.togglePin(item.id);
      render();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      if (!window.confirm("Delete this note?")) return;
      try {
        store.remove(item.id);
        render();
      } catch (error) {
        showStatus(error.message);
      }
    });

    actions.appendChild(edit);
    actions.appendChild(pin);
    actions.appendChild(remove);
    li.appendChild(actions);
    list.appendChild(li);
  });

  showStatus(notes.length + " note(s)");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    store.add(input.value);
    input.value = "";
    input.focus();
    render();
  } catch (error) {
    showStatus(error.message);
  }
});

searchInput.addEventListener("input", () => {
  state.search = searchInput.value.trim();
  render();
});

filterAll.addEventListener("click", () => {
  state.filter = "all";
  filterAll.classList.add("active");
  filterPinned.classList.remove("active");
  render();
});

filterPinned.addEventListener("click", () => {
  state.filter = "pinned";
  filterPinned.classList.add("active");
  filterAll.classList.remove("active");
  render();
});

render();
`;
  return [
    { path: "package.json", content: commonPackageJson(projectName) },
    { path: "README.md", content: readme },
    { path: "core.js", content: core },
    { path: "core.test.js", content: tests },
    { path: "index.html", content: html },
    { path: "styles.css", content: css },
    { path: "app.js", content: js }
  ];
}

function userNewsBaselineFiles(projectName: string): Array<{ path: string; content: string }> {
  const readme = `# ${projectName} - User Management and News

Web app for managing users and publishing internal news updates.

## Features
- Create, activate/deactivate, and remove users
- Publish news updates linked to an author user
- Filter news by author and status
- Persistent local storage
- Unit-tested domain logic

## Run
1. Open \`index.html\` in your browser.
2. Manage users in the first section and post updates in the second section.

## Test
- Run \`npm test\`
`;
  const core = `(function (globalScope) {
function normalize(value) {
  return String(value || "").trim().replace(/\\s+/g, " ");
}

function createManagementStore(storage, key) {
  const storageKey = key || "sdd-user-news-v1";
  function emptyState() {
    return { users: [], news: [] };
  }
  function load() {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyState();
    try {
      const parsed = JSON.parse(raw);
      return {
        users: Array.isArray(parsed.users) ? parsed.users : [],
        news: Array.isArray(parsed.news) ? parsed.news : []
      };
    } catch {
      return emptyState();
    }
  }
  function save(state) {
    storage.setItem(storageKey, JSON.stringify(state));
    return state;
  }
  function requireUser(state, userId) {
    const user = state.users.find((u) => String(u.id) === String(userId));
    if (!user) throw new Error("User not found");
    return user;
  }
  return {
    listUsers() {
      return load().users.slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    addUser(name, email) {
      const cleanName = normalize(name);
      const cleanEmail = normalize(email).toLowerCase();
      if (!cleanName) throw new Error("User name is required");
      if (!/^\\S+@\\S+\\.\\S+$/.test(cleanEmail)) throw new Error("Valid email is required");
      const state = load();
      if (state.users.some((u) => String(u.email).toLowerCase() === cleanEmail)) {
        throw new Error("User email must be unique");
      }
      const user = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: cleanName, email: cleanEmail, active: true };
      state.users.push(user);
      save(state);
      return user;
    },
    setUserActive(userId, active) {
      const state = load();
      const user = requireUser(state, userId);
      user.active = Boolean(active);
      save(state);
      return user;
    },
    removeUser(userId) {
      const state = load();
      const before = state.users.length;
      state.users = state.users.filter((u) => String(u.id) !== String(userId));
      if (state.users.length === before) throw new Error("User not found");
      state.news = state.news.filter((n) => String(n.authorId) !== String(userId));
      save(state);
      return true;
    },
    listNews(filter) {
      const state = load();
      let items = state.news.slice();
      if (filter && filter.authorId) {
        items = items.filter((n) => String(n.authorId) === String(filter.authorId));
      }
      return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    addNews(title, content, authorId) {
      const cleanTitle = normalize(title);
      const cleanContent = normalize(content);
      if (!cleanTitle) throw new Error("News title is required");
      if (cleanTitle.length > 120) throw new Error("News title too long");
      if (!cleanContent) throw new Error("News content is required");
      const state = load();
      const author = requireUser(state, authorId);
      if (!author.active) throw new Error("Author user is inactive");
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: cleanTitle,
        content: cleanContent,
        authorId: author.id,
        authorName: author.name,
        createdAt: new Date().toISOString()
      };
      state.news.push(entry);
      save(state);
      return entry;
    }
  };
}

const api = { createManagementStore };
if (typeof module !== "undefined" && module.exports) module.exports = api;
globalScope.ManagementCore = api;
})(typeof window !== "undefined" ? window : globalThis);
`;
  const tests = `const test = require("node:test");
const assert = require("node:assert/strict");
const { createManagementStore } = require("./core");

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
}

test("addUser creates active user", () => {
  const store = createManagementStore(memoryStorage());
  const user = store.addUser("Alice", "alice@example.com");
  assert.equal(user.active, true);
  assert.equal(store.listUsers().length, 1);
});

test("addUser enforces unique email", () => {
  const store = createManagementStore(memoryStorage());
  store.addUser("Alice", "alice@example.com");
  assert.throws(() => store.addUser("Alice 2", "alice@example.com"), /unique/);
});

test("setUserActive updates status", () => {
  const store = createManagementStore(memoryStorage());
  const user = store.addUser("Bob", "bob@example.com");
  store.setUserActive(user.id, false);
  assert.equal(store.listUsers()[0].active, false);
});

test("addNews requires active author", () => {
  const store = createManagementStore(memoryStorage());
  const user = store.addUser("Nina", "nina@example.com");
  store.setUserActive(user.id, false);
  assert.throws(() => store.addNews("Update", "Hello", user.id), /inactive/);
});

test("addNews creates entry for active user", () => {
  const store = createManagementStore(memoryStorage());
  const user = store.addUser("Leo", "leo@example.com");
  const news = store.addNews("Launch", "System ready", user.id);
  assert.equal(news.authorName, "Leo");
  assert.equal(store.listNews({}).length, 1);
});

test("listNews filters by author", () => {
  const store = createManagementStore(memoryStorage());
  const a = store.addUser("A", "a@example.com");
  const b = store.addUser("B", "b@example.com");
  store.addNews("N1", "x", a.id);
  store.addNews("N2", "y", b.id);
  const onlyA = store.listNews({ authorId: a.id });
  assert.equal(onlyA.length, 1);
  assert.equal(onlyA[0].authorId, a.id);
});

test("removeUser removes dependent news", () => {
  const store = createManagementStore(memoryStorage());
  const user = store.addUser("C", "c@example.com");
  store.addNews("N1", "text", user.id);
  store.removeUser(user.id);
  assert.equal(store.listUsers().length, 0);
  assert.equal(store.listNews({}).length, 0);
});
`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>User and News Management</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="app">
      <h1>User Management and News</h1>
      <p id="status" aria-live="polite"></p>

      <section class="card">
        <h2>Users</h2>
        <form id="user-form" class="row">
          <input id="user-name" placeholder="Name" required />
          <input id="user-email" type="email" placeholder="Email" required />
          <button type="submit">Add User</button>
        </form>
        <ul id="user-list"></ul>
      </section>

      <section class="card">
        <h2>News</h2>
        <form id="news-form" class="column">
          <input id="news-title" placeholder="Title" maxlength="120" required />
          <textarea id="news-content" placeholder="Content" rows="3" required></textarea>
          <select id="news-author"></select>
          <button type="submit">Publish News</button>
        </form>
        <ul id="news-list"></ul>
      </section>
    </main>
    <script src="core.js"></script>
    <script src="app.js"></script>
  </body>
</html>
`;
  const css = `body { margin:0; font-family:"Segoe UI", Arial, sans-serif; background:#f4f6fb; color:#1f2937; }
.app { max-width:960px; margin:28px auto; padding:0 16px 24px; }
.card { background:#fff; border:1px solid #d8dce6; border-radius:12px; padding:14px; margin-bottom:14px; box-shadow:0 3px 12px rgba(0,0,0,.04); }
.row { display:flex; gap:8px; flex-wrap:wrap; }
.column { display:flex; flex-direction:column; gap:8px; }
input, textarea, select, button { font:inherit; }
input, textarea, select { width:100%; padding:10px; border:1px solid #c7cdd9; border-radius:8px; }
button { padding:10px 12px; border:0; border-radius:8px; background:#0a66c2; color:#fff; cursor:pointer; }
ul { list-style:none; padding:0; margin:10px 0 0; }
li { border:1px solid #d8dce6; border-radius:8px; padding:10px; margin-bottom:8px; background:#fff; }
.meta { color:#6b7280; font-size:13px; }
.actions { display:flex; gap:8px; margin-top:6px; }
.muted { color:#6b7280; }
`;
  const js = `const store = window.ManagementCore.createManagementStore(window.localStorage);
const statusEl = document.getElementById("status");
const userForm = document.getElementById("user-form");
const userName = document.getElementById("user-name");
const userEmail = document.getElementById("user-email");
const userList = document.getElementById("user-list");
const newsForm = document.getElementById("news-form");
const newsTitle = document.getElementById("news-title");
const newsContent = document.getElementById("news-content");
const newsAuthor = document.getElementById("news-author");
const newsList = document.getElementById("news-list");

function status(message) { statusEl.textContent = message; }

function renderUsers() {
  const users = store.listUsers();
  userList.innerHTML = "";
  newsAuthor.innerHTML = "";
  if (!users.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No users yet";
    userList.appendChild(li);
    return;
  }
  users.forEach((u) => {
    const li = document.createElement("li");
    li.innerHTML = "<strong>" + u.name + "</strong> <span class=\\"meta\\">" + u.email + " | " + (u.active ? "active" : "inactive") + "</span>";
    const actions = document.createElement("div");
    actions.className = "actions";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.textContent = u.active ? "Deactivate" : "Activate";
    toggle.addEventListener("click", () => { store.setUserActive(u.id, !u.active); render(); });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => { store.removeUser(u.id); render(); });
    actions.appendChild(toggle);
    actions.appendChild(remove);
    li.appendChild(actions);
    userList.appendChild(li);

    if (u.active) {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.name + " (" + u.email + ")";
      newsAuthor.appendChild(opt);
    }
  });
}

function renderNews() {
  const items = store.listNews({});
  newsList.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No news published yet";
    newsList.appendChild(li);
    return;
  }
  items.forEach((n) => {
    const li = document.createElement("li");
    li.innerHTML = "<strong>" + n.title + "</strong><div>" + n.content + "</div><div class=\\"meta\\">By " + n.authorName + " at " + n.createdAt + "</div>";
    newsList.appendChild(li);
  });
}

function render() {
  renderUsers();
  renderNews();
  status("Users: " + store.listUsers().length + " | News: " + store.listNews({}).length);
}

userForm.addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    store.addUser(userName.value, userEmail.value);
    userName.value = "";
    userEmail.value = "";
    render();
  } catch (err) {
    status(err.message);
  }
});

newsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  try {
    store.addNews(newsTitle.value, newsContent.value, newsAuthor.value);
    newsTitle.value = "";
    newsContent.value = "";
    render();
  } catch (err) {
    status(err.message);
  }
});

render();
`;
  return [
    { path: "package.json", content: commonPackageJson(projectName) },
    { path: "README.md", content: readme },
    { path: "core.js", content: core },
    { path: "core.test.js", content: tests },
    { path: "index.html", content: html },
    { path: "styles.css", content: css },
    { path: "app.js", content: js }
  ];
}

function genericBaselineFiles(projectName: string): Array<{ path: string; content: string }> {
  const readme = `# ${projectName} - Starter App

Features:
- Item capture and listing
- Local persistence
- Tested core module

Run:
- Open \`index.html\` in a browser
- Run tests with \`npm test\`
`;
  const core = `(function (globalScope) {
function createStore(storage, key) {
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };
  const write = (items) => storage.setItem(key, JSON.stringify(items));
  return {
    list() { return read(); },
    add(text) {
      const value = String(text || "").trim();
      if (!value) throw new Error("Text is required");
      const next = [...read(), { id: Date.now(), text: value }];
      write(next);
      return next;
    }
  };
}
const api = { createStore };
if (typeof module !== "undefined" && module.exports) module.exports = api;
globalScope.AppCore = api;
})(typeof window !== "undefined" ? window : globalThis);
`;
  const tests = `const test = require("node:test");
const assert = require("node:assert/strict");
const { createStore } = require("./core");

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

test("store adds items", () => {
  const store = createStore(memoryStorage(), "items");
  store.add("First");
  assert.equal(store.list().length, 1);
});
`;
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Starter App</title><link rel="stylesheet" href="styles.css" /></head>
  <body>
    <main class="app">
      <h1>Starter App</h1>
      <form id="item-form" class="row"><input id="item-input" type="text" placeholder="Add item" /><button type="submit">Add</button></form>
      <ul id="item-list"></ul>
    </main>
    <script src="core.js"></script><script src="app.js"></script>
  </body>
</html>
`;
  const css = `body { font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #f4f6fb; } .app { max-width: 720px; margin: 32px auto; padding: 0 16px; } .row { display:flex; gap:8px; } input { flex:1; padding:10px; } button { padding:10px 14px; }`;
  const js = `const store = window.AppCore.createStore(window.localStorage, "starter-items");
const form = document.getElementById("item-form");
const input = document.getElementById("item-input");
const list = document.getElementById("item-list");
function render(){ list.innerHTML = ""; store.list().forEach((item) => { const li = document.createElement("li"); li.textContent = item.text; list.appendChild(li); }); }
form.addEventListener("submit", (event) => { event.preventDefault(); try { store.add(input.value); input.value = ""; render(); } catch {} });
render();
`;
  return [
    { path: "package.json", content: commonPackageJson(projectName) },
    { path: "README.md", content: readme },
    { path: "core.js", content: core },
    { path: "core.test.js", content: tests },
    { path: "index.html", content: html },
    { path: "styles.css", content: css },
    { path: "app.js", content: js }
  ];
}

function fallbackAppFiles(projectName: string, intent: string): Array<{ path: string; content: string }> {
  return detectBaselineKind(intent) === "notes" ? notesBaselineFiles(projectName) : genericBaselineFiles(projectName);
}

export function resetToFunctionalBaseline(appDir: string, projectName: string, intent: string): number {
  const files = fallbackAppFiles(projectName, intent);
  for (const file of files) {
    const full = path.join(appDir, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content, "utf-8");
  }
  return files.length;
}

function ensureQualityBaseline(
  files: Array<{ path: string; content: string }>,
  _projectName: string,
  _intent: string
): Array<{ path: string; content: string }> {
  return files;
}

export function enrichDraftWithAI(
  input: string,
  flow: string,
  domain: string,
  baseDraft: RequirementDraft,
  providerRequested?: string
): RequirementDraft {
  if (process.env.SDD_DISABLE_AI_AUTOPILOT === "1") {
    return baseDraft;
  }

  const resolution = resolveProvider(providerRequested);
  if (!resolution.ok) {
    return baseDraft;
  }
  const providerExec = createLoggedExec(resolution.provider.exec, {
    providerId: resolution.provider.id,
    stage: "requirements_enrichment"
  });

  const prompt = [
    "You are an SDD requirements assistant.",
    "Return ONLY valid JSON with keys:",
    "objective, actors, scope_in, scope_out, acceptance_criteria, nfr_security, nfr_performance, nfr_availability, constraints, risks.",
    "No markdown. No explanation.",
    "Do not mention tool limits or inability; provide the JSON payload directly.",
    "Each key must be a plain string. For list-like fields, return semicolon-separated items (not arrays).",
    "Quality bar:",
    "- objective: clear business value and user impact.",
    "- actors: at least 3 specific roles.",
    "- scope_in: at least 6 concrete capabilities.",
    "- acceptance_criteria: at least 8 testable criteria with measurable thresholds where possible.",
    "- constraints: at least 3 concrete constraints.",
    "- risks: at least 3 concrete risks.",
    "Write all values in English.",
    `Intent: ${input}`,
    `Flow: ${flow}`,
    `Domain: ${domain}`
  ].join("\n");
  const parsed = askProviderForJson(providerExec, prompt);
  if (!parsed) {
    return baseDraft;
  }
  let enriched: RequirementDraft = {
    ...baseDraft,
    objective: asText(parsed.objective, baseDraft.objective ?? ""),
    actors: asText(parsed.actors, baseDraft.actors ?? ""),
    scope_in: asText(parsed.scope_in, baseDraft.scope_in ?? ""),
    scope_out: asText(parsed.scope_out, baseDraft.scope_out ?? ""),
    acceptance_criteria: asText(parsed.acceptance_criteria, baseDraft.acceptance_criteria ?? ""),
    nfr_security: asText(parsed.nfr_security, baseDraft.nfr_security ?? ""),
    nfr_performance: asText(parsed.nfr_performance, baseDraft.nfr_performance ?? ""),
    nfr_availability: asText(parsed.nfr_availability, baseDraft.nfr_availability ?? ""),
    constraints: asText(parsed.constraints, baseDraft.constraints ?? ""),
    risks: asText(parsed.risks, baseDraft.risks ?? "")
  };
  if (requirementsNeedRefinement(enriched)) {
    const retryPrompt = [
      "Refine the following requirement draft to production-grade quality.",
      "Return ONLY valid JSON with the same keys:",
      "objective, actors, scope_in, scope_out, acceptance_criteria, nfr_security, nfr_performance, nfr_availability, constraints, risks.",
      "Output plain strings only. Use semicolon-separated lists where applicable.",
      "Do not use placeholders, generic wording, or MVP-first language.",
      "Guarantee: actors>=3, scope_in>=6, acceptance_criteria>=8 (measurable), constraints>=3, risks>=3.",
      `Intent: ${input}`,
      `Flow: ${flow}`,
      `Domain: ${domain}`,
      `Current draft JSON: ${JSON.stringify(enriched)}`
    ].join("\n");
    const refined = askProviderForJson(providerExec, retryPrompt);
    if (refined) {
      enriched = {
        ...enriched,
        objective: asText(refined.objective, enriched.objective ?? ""),
        actors: asText(refined.actors, enriched.actors ?? ""),
        scope_in: asText(refined.scope_in, enriched.scope_in ?? ""),
        scope_out: asText(refined.scope_out, enriched.scope_out ?? ""),
        acceptance_criteria: asText(refined.acceptance_criteria, enriched.acceptance_criteria ?? ""),
        nfr_security: asText(refined.nfr_security, enriched.nfr_security ?? ""),
        nfr_performance: asText(refined.nfr_performance, enriched.nfr_performance ?? ""),
        nfr_availability: asText(refined.nfr_availability, enriched.nfr_availability ?? ""),
        constraints: asText(refined.constraints, enriched.constraints ?? ""),
        risks: asText(refined.risks, enriched.risks ?? "")
      };
    }
  }
  if (requirementsNeedRefinement(enriched)) {
    const hardenPrompt = [
      "HARD REQUIREMENTS REWRITE.",
      "Return ONLY valid JSON with keys:",
      "objective, actors, scope_in, scope_out, acceptance_criteria, nfr_security, nfr_performance, nfr_availability, constraints, risks.",
      "All values must be plain strings and list-like values must be semicolon-separated.",
      "Mandatory thresholds:",
      "- actors >= 4",
      "- scope_in >= 8 concrete capabilities",
      "- scope_out >= 3",
      "- acceptance_criteria >= 10 and at least 2 measurable thresholds",
      "- constraints >= 4",
      "- risks >= 4",
      "Do not use generic placeholders or draft language.",
      `Intent: ${input}`,
      `Flow: ${flow}`,
      `Domain: ${domain}`,
      `Current draft JSON: ${JSON.stringify(enriched)}`
    ].join("\n");
    const hardened = askProviderForJson(providerExec, hardenPrompt);
    if (hardened) {
      enriched = {
        ...enriched,
        objective: asText(hardened.objective, enriched.objective ?? ""),
        actors: asText(hardened.actors, enriched.actors ?? ""),
        scope_in: asText(hardened.scope_in, enriched.scope_in ?? ""),
        scope_out: asText(hardened.scope_out, enriched.scope_out ?? ""),
        acceptance_criteria: asText(hardened.acceptance_criteria, enriched.acceptance_criteria ?? ""),
        nfr_security: asText(hardened.nfr_security, enriched.nfr_security ?? ""),
        nfr_performance: asText(hardened.nfr_performance, enriched.nfr_performance ?? ""),
        nfr_availability: asText(hardened.nfr_availability, enriched.nfr_availability ?? ""),
        constraints: asText(hardened.constraints, enriched.constraints ?? ""),
        risks: asText(hardened.risks, enriched.risks ?? "")
      };
    }
  }
  return hardenRequirementDraft(enriched, input, domain);
}

export type CodeBootstrapResult = {
  attempted: boolean;
  provider?: string;
  generated: boolean;
  outputDir: string;
  fileCount: number;
  reason?: string;
};

export type ImproveAppResult = {
  attempted: boolean;
  applied: boolean;
  fileCount: number;
  reason?: string;
};

function toolkitContextLinesForGeneration(): string[] {
  return [
    "Toolkit context available during lifecycle/runtime validation:",
    "- generated-app/deploy/runtime-visual-probe.json (screenshot analysis with blank/static heuristics).",
    "- generated-app/deploy/software-diagnostic-report.json (functional checks, action timeline, ui labels, blocking issues).",
    "- generated-app/deploy/runtime-processes.json (runtime process and start metadata).",
    "If runtime visual probe flags blankLikely=true or staticLikely=true, prioritize fixing renderer/main-window bootstrapping, route mounting, and startup scripts."
  ];
}

function readRuntimeVisualProbeContext(appDir: string): string | null {
  try {
    const file = path.join(appDir, "deploy", "runtime-visual-probe.json");
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      blankLikely?: boolean;
      staticLikely?: boolean;
      summary?: string;
      stats?: Record<string, unknown>;
      screenshotPath?: string;
    };
    return JSON.stringify(
      {
        blankLikely: Boolean(parsed.blankLikely),
        staticLikely: Boolean(parsed.staticLikely),
        summary: String(parsed.summary || ""),
        screenshotPath: String(parsed.screenshotPath || ""),
        stats: parsed.stats ?? {}
      },
      null,
      0
    );
  } catch {
    return null;
  }
}

function readSoftwareDiagnosticContext(appDir: string): string | null {
  try {
    const file = path.join(appDir, "deploy", "software-diagnostic-report.json");
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      summary?: string;
      qualityScore?: number;
      blockingIssues?: string[];
      http?: { status?: string; reachableUrl?: string };
      interaction?: {
        status?: string;
        clickableCount?: number;
        clicksPerformed?: number;
        blankLikely?: boolean;
        uiLabels?: string[];
        functionalChecks?: Array<{ name?: string; status?: string; detail?: string }>;
        actionTimeline?: Array<{ at?: string; action?: string; target?: string; result?: string; detail?: string }>;
      };
    };
    return JSON.stringify(
      {
        summary: String(parsed.summary || ""),
        qualityScore: Number(parsed.qualityScore || 0),
        blockingIssues: Array.isArray(parsed.blockingIssues) ? parsed.blockingIssues.slice(0, 8) : [],
        http: parsed.http ?? {},
        interaction: {
          status: String(parsed.interaction?.status || ""),
          clickableCount: Number(parsed.interaction?.clickableCount || 0),
          clicksPerformed: Number(parsed.interaction?.clicksPerformed || 0),
          blankLikely: Boolean(parsed.interaction?.blankLikely),
          uiLabels: Array.isArray(parsed.interaction?.uiLabels) ? parsed.interaction?.uiLabels.slice(0, 20) : [],
          functionalChecks: Array.isArray(parsed.interaction?.functionalChecks) ? parsed.interaction?.functionalChecks.slice(0, 12) : [],
          actionTimeline: Array.isArray(parsed.interaction?.actionTimeline) ? parsed.interaction?.actionTimeline.slice(-12) : []
        }
      },
      null,
      0
    );
  } catch {
    return null;
  }
}

function templateFallbackAllowed(): boolean {
  return process.env.SDD_ALLOW_TEMPLATE_FALLBACK === "1" || process.env.SDD_DISABLE_AI_AUTOPILOT === "1";
}

export function bootstrapProjectCode(
  projectRoot: string,
  projectName: string,
  intent: string,
  providerRequested?: string,
  domainHint?: string
): CodeBootstrapResult {
  const outputDir = path.join(projectRoot, "generated-app");
  fs.mkdirSync(outputDir, { recursive: true });

  if (process.env.SDD_DISABLE_AI_AUTOPILOT === "1") {
    if (templateFallbackAllowed()) {
      const files = fallbackAppFiles(projectName, intent);
      for (const file of files) {
        const destination = path.join(outputDir, file.path);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, file.content, "utf-8");
      }
      return {
        attempted: false,
        generated: true,
        outputDir,
        fileCount: files.length,
        reason: "disabled by env, template fallback generated"
      };
    }
    return { attempted: false, generated: false, outputDir, fileCount: 0, reason: "disabled by env" };
  }

  const resolution = resolveProvider(providerRequested);
  let files: Array<{ path: string; content: string }> = [];
  let fallbackReason: string | undefined;
  const providerDebug = { attempts: [] as string[], errors: [] as string[] };

  if (resolution.ok) {
    const providerExec = createLoggedExec(resolution.provider.exec, {
      providerId: resolution.provider.id,
      stage: "bootstrap_generation",
      filePath: path.join(path.dirname(outputDir), "debug", "provider-prompts.jsonl")
    });
    const domain = detectAutopilotDomain(intent, domainHint);
    const constraints = extraPromptConstraints(intent, domainHint);
    const prompt = [
      "Generate a production-grade, extensible application from user intent.",
      "This is not a prototype task. Do not output first-draft or demo-only quality.",
      "The project must be executable fully in local development.",
      `Domain profile: ${domain}.`,
      "Use MVC architecture by default (models/controllers/views or equivalent backend/frontend MVC layering).",
      "Add a component map file named components.md with component responsibilities and extension points.",
      "Add mission.md and vision.md with concrete product mission and long-term direction.",
      "Use DummyLocal adapters for integrations (databases, external APIs, queues) so everything runs locally.",
      "Add a schema document named schemas.md with entities, fields, relations, and constraints.",
      "Add regression tests and regression notes/documentation.",
      "Quality gate is strict: if required artifacts are missing, your output will be rejected and repaired.",
      ...toolkitContextLinesForGeneration(),
      ...constraints,
      "Do not mix unrelated runtime stacks unless the intent explicitly requests a multi-tier architecture.",
      "Return ONLY valid JSON with this shape:",
      '{"files":[{"path":"relative/path","content":"file content"}],"run_command":"...","deploy_steps":["..."],"publish_steps":["..."]}',
      "Use only relative file paths. Keep files concise and runnable.",
      "Use English for README/docs/messages/comments.",
      "Do not use package name sdd-cli in generated package.json files; use project-specific names.",
      "Every npm script you define must reference files that actually exist in the generated output.",
      "Never mention unavailable tools or ask the user to create files manually.",
      "Assume you can directly author repository files and return only the JSON payload.",
      `Project: ${projectName}`,
      `Intent: ${intent}`
    ].join("\n");
    const parsed = askProviderForJson(providerExec, prompt, providerDebug);
    if (parsed) {
      files.push(...extractFilesFromParsed(parsed));
    }
    const providerHardFailure = hasUnrecoverableProviderError(providerDebug.errors);
    if (files.length === 0 && !providerHardFailure) {
      const fallbackConstraints = extraPromptConstraints(intent, domainHint);
      const fallbackPrompt = [
        "Return ONLY valid JSON. No markdown.",
        "Schema: {\"files\":[{\"path\":\"relative/path\",\"content\":\"...\"}]}",
        "Generate only essential production-ready files to run locally with quality-first defaults.",
        "Must include: README.md, architecture.md, components.md, mission.md, vision.md, schemas.md, regression notes, and DummyLocal integration docs.",
        "Use MVC architecture by default and keep files in English.",
        ...toolkitContextLinesForGeneration(),
        "Never mention unavailable tools or ask the user to create files manually.",
        "Assume you can directly author repository files and return only the JSON payload.",
        `Domain profile: ${domain}.`,
        ...fallbackConstraints,
        `Project: ${projectName}`,
        `Intent: ${intent}`
      ].join("\n");
      const parsedFallback = askProviderForJson(providerExec, fallbackPrompt, providerDebug);
      if (parsedFallback) {
        files.push(...extractFilesFromParsed(parsedFallback));
      }
    }
    if (files.length === 0 && !hasUnrecoverableProviderError(providerDebug.errors) && intentRequiresJavaReactFullstack(intent)) {
      const compactPrompt = [
        "Return ONLY valid JSON. No markdown.",
        'Schema: {"files":[{"path":"relative/path","content":"..."}]}',
        "Generate a MINIMAL but production-ready Java+React starter with at most 16 files total.",
        "Required paths:",
        "- backend/pom.xml",
        "- backend/src/main/java/com/example/Application.java",
        "- backend/src/main/java/com/example/controller/SalesController.java",
        "- backend/src/main/java/com/example/dto/SaleDto.java",
        "- backend/src/main/java/com/example/service/SalesService.java",
        "- backend/src/main/java/com/example/repository/SalesRepository.java",
        "- backend/src/main/java/com/example/advice/GlobalExceptionHandler.java",
        "- backend/src/main/resources/application.yml",
        "- frontend/package.json",
        "- frontend/src/main.tsx",
        "- frontend/src/App.tsx",
        "- frontend/src/api/client.ts",
        "- frontend/src/hooks/useSales.ts",
        "- frontend/src/components/SalesDashboard.tsx",
        "- README.md",
        "- components.md",
        "- architecture.md",
        "- mission.md",
        "- vision.md",
        "- schemas.md",
        "Also include: dummy-local.md, regression.md, schema.sql, LICENSE, and a smoke script in package.json.",
        ...toolkitContextLinesForGeneration(),
        "Use English only.",
        "Never mention unavailable tools or ask the user to create files manually.",
        "Assume you can directly author repository files and return only the JSON payload.",
        `Project: ${projectName}`,
        `Intent: ${intent}`
      ].join("\n");
      const parsedCompact = askProviderForJson(providerExec, compactPrompt, providerDebug);
      if (parsedCompact) {
        files.push(...extractFilesFromParsed(parsedCompact));
      }
    }
    if (files.length === 0 && !hasUnrecoverableProviderError(providerDebug.errors)) {
      const ultraCompactPrompt = [
        "Return ONLY valid JSON. No markdown.",
        'Schema: {"files":[{"path":"relative/path","content":"..."}]}',
        "Generate ULTRA-COMPACT output with at most 12 files and concise content.",
        "Must include: package.json, README.md, architecture.md, components.md, mission.md, vision.md, schemas.md, dummy-local.md, regression.md, LICENSE.",
        "Use MVC architecture by default and English-only content.",
        "Include one runnable app entrypoint and one smoke validation script command in package.json.",
        "Include at least one test file and keep dependencies aligned with imports.",
        ...toolkitContextLinesForGeneration(),
        "Do not include explanations. Output JSON only.",
        "Never mention unavailable tools or ask the user to create files manually.",
        "Assume you can directly author repository files and return only the JSON payload.",
        `Project: ${projectName}`,
        `Intent: ${intent}`
      ].join("\n");
      const parsedUltraCompact = askProviderForJson(providerExec, ultraCompactPrompt, providerDebug);
      if (parsedUltraCompact) {
        files.push(...extractFilesFromParsed(parsedUltraCompact));
      }
    }
  }

  if (files.length === 0) {
    const fallbackAllowed = templateFallbackAllowed();
    if (fallbackAllowed) {
      fallbackReason = resolution.ok ? "provider response unusable, template fallback generated" : "provider unavailable, template fallback generated";
      files = fallbackAppFiles(projectName, intent);
    } else {
      const debugPath = path.join(outputDir, "provider-debug.md");
      const lines = [
        "# Provider Debug",
        "",
        `Provider available: ${resolution.ok ? "yes" : "no"}`,
        `Requested provider: ${providerRequested ?? "auto"}`,
        `Reason: ${resolution.ok ? "provider response unusable" : "provider unavailable"}`,
        "",
        "## Errors",
        ...(providerDebug.errors.length > 0 ? providerDebug.errors.map((line) => `- ${line}`) : ["- none"]),
        "",
        "## Output excerpts",
        ...(providerDebug.attempts.length > 0 ? providerDebug.attempts.map((out, idx) => `### Attempt ${idx + 1}\n\`\`\`\n${out}\n\`\`\`\n`) : ["- none"])
      ];
      fs.writeFileSync(debugPath, `${lines.join("\n")}\n`, "utf-8");
      return {
        attempted: resolution.ok,
        provider: resolution.ok ? resolution.provider.id : undefined,
        generated: false,
        outputDir,
        fileCount: 0,
        reason: resolution.ok
          ? hasUnrecoverableProviderError(providerDebug.errors)
            ? `provider temporarily unavailable: ${lastProviderError(providerDebug.errors) || "hard provider failure"}`
            : "provider response unusable (see generated-app/provider-debug.md)"
          : "provider unavailable"
      };
    }
  }
  files = flattenSingleTopFolder(files, projectName);
  files = ensureQualityBaseline(files, projectName, intent);

  const unique = new Map<string, string>();
  for (const file of files) {
    unique.set(file.path, file.content);
  }
  for (const [rel, content] of unique.entries()) {
    const destination = path.join(outputDir, rel);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, "utf-8");
  }

  return {
    attempted: resolution.ok,
    provider: resolution.ok ? resolution.provider.id : undefined,
    generated: true,
    outputDir,
    fileCount: unique.size,
    reason: fallbackReason
  };
}

function compactFilesForPrompt(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
  const maxFiles = 6;
  const maxChars = 360;
  return files.slice(0, maxFiles).map((file) => ({
    path: file.path,
    content: file.content.length > maxChars ? `${file.content.slice(0, maxChars)}\n/* ...truncated... */` : file.content
  }));
}

function compactIntentForPrompt(intent: string, maxChars = 700): string {
  const normalized = intent.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  for (const sentence of sentences) {
    if (!deduped.includes(sentence)) {
      deduped.push(sentence);
    }
  }
  const rebuilt = deduped.join(". ");
  return rebuilt.length > maxChars ? `${rebuilt.slice(0, maxChars)}...[truncated]` : rebuilt;
}

function looksLikeCliPackageJson(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes('"name": "sdd-cli"') ||
    lower.includes('"name":"sdd-cli"') ||
    lower.includes("ai-orchestrated specification-driven delivery cli")
  );
}

function clampPromptSize(prompt: string, maxChars = 6000): string {
  const envOverride = Number.parseInt(process.env.SDD_GEMINI_PROMPT_MAX_CHARS ?? "", 10);
  const platformDefault = process.platform === "win32" ? 3200 : maxChars;
  const cap = Number.isFinite(envOverride) && envOverride > 0 ? Math.min(envOverride, maxChars) : platformDefault;
  if (prompt.length <= cap) {
    return prompt;
  }
  return `${prompt.slice(0, cap)}\n...[truncated by sdd-tool due command length limits]`;
}

function collectProjectFiles(appDir: string): Array<{ path: string; content: string }> {
  const output: Array<{ path: string; content: string }> = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(appDir, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        if (rel === "node_modules" || rel.startsWith("node_modules/") || rel === ".git" || rel.startsWith(".git/")) {
          continue;
        }
        walk(full);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (![".js", ".ts", ".json", ".md", ".html", ".css", ".py", ".java", ".xml", ".yml", ".yaml", ".jsx", ".tsx", ".sql", ".properties"].includes(ext)) {
          continue;
        }
        const content = fs.readFileSync(full, "utf-8");
        output.push({ path: rel, content });
      }
    }
  };
  walk(appDir);
  return output;
}

export function improveGeneratedApp(
  appDir: string,
  intent: string,
  providerRequested?: string,
  qualityDiagnostics?: string[],
  domainHint?: string
): ImproveAppResult {
  if (process.env.SDD_DISABLE_AI_AUTOPILOT === "1") {
    return { attempted: false, applied: false, fileCount: 0, reason: "disabled by env" };
  }
  if (!fs.existsSync(appDir)) {
    return { attempted: false, applied: false, fileCount: 0, reason: "app directory missing" };
  }
  const resolution = resolveProvider(providerRequested);
  if (!resolution.ok) {
    return { attempted: false, applied: false, fileCount: 0, reason: "provider unavailable" };
  }
  const providerExec = createLoggedExec(resolution.provider.exec, {
    providerId: resolution.provider.id,
    stage: "repair_iteration",
    filePath: path.join(path.dirname(appDir), "debug", "provider-prompts.jsonl")
  });
  const providerDebug = { attempts: [] as string[], errors: [] as string[] };

  const collectedFiles = collectProjectFiles(appDir);
  const currentFiles = compactFilesForPrompt(collectedFiles);
  const currentFileNames = collectedFiles.map((file) => file.path).slice(0, 120);
  const compactDiagnostics = (qualityDiagnostics ?? [])
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .slice(0, 8)
    .map((line) => (line.length > 280 ? `${line.slice(0, 280)}...[truncated]` : line));
  const domain = detectAutopilotDomain(intent, domainHint);
  const constraints = extraPromptConstraints(intent, domainHint);
  const compactIntent = compactIntentForPrompt(intent, 700);
  const runtimeProbeContext = readRuntimeVisualProbeContext(appDir);
  const softwareDiagnosticContext = readSoftwareDiagnosticContext(appDir);
  const prompt = clampPromptSize([
    "Improve this generated app to production-grade, release-ready quality.",
    "Do not return prototype or first-draft quality.",
    `Domain profile: ${domain}.`,
    "Requirements:",
    "- Keep app intent and behavior.",
    "- Keep all outputs in English.",
    "- Use MVC architecture by default and maintain modular extensible components.",
    "- Ensure architecture.md and components.md are present and aligned with implementation.",
    "- Ensure tests pass for the selected stack.",
    "- Ensure code is clear and maintainable.",
    "- Ensure schemas.md exists and documents data schemas.",
    "- Ensure relational-data apps include schema.sql with proper keys/indexes.",
    "- Ensure DummyLocal integration exists and is documented.",
    "- Ensure regression tests (or explicit regression test documentation) exists.",
    ...toolkitContextLinesForGeneration().map((line) => `- ${line}`),
    ...constraints.map((line) => `- ${line}`),
    "- Fix every listed quality diagnostic failure.",
    "Return ONLY JSON with shape:",
    '{"files":[{"path":"relative/path","content":"full file content"}]}',
    "Never mention unavailable tools or ask the user to create files manually.",
    "Assume you can directly author repository files and return only the JSON payload.",
    `Intent: ${compactIntent}`,
    `Quality diagnostics: ${JSON.stringify(compactDiagnostics)}`,
    `Runtime visual probe context: ${runtimeProbeContext ?? "not available"}`,
    `Software diagnostic toolkit context: ${softwareDiagnosticContext ?? "not available"}`,
    `Current file names: ${JSON.stringify(currentFileNames)}`,
    `Sample files JSON: ${JSON.stringify(currentFiles)}`
  ].join("\n"));

  let parsed = askProviderForJson(providerExec, prompt, providerDebug);
  if (
    flattenSingleTopFolder(extractFilesFromParsed(parsed), path.basename(appDir)).length === 0 &&
    compactDiagnostics.length > 0 &&
    !hasUnrecoverableProviderError(providerDebug.errors)
  ) {
    const targetedPrompt = clampPromptSize([
      "Return ONLY valid JSON. No markdown.",
      'Schema: {"files":[{"path":"relative/path","content":"..."}]}',
      "Fix exactly the listed quality diagnostics with minimal file edits.",
      "If diagnostics mention missing docs/tests, generate them.",
      "Never mention unavailable tools or ask the user to create files manually.",
      "Assume you can directly author repository files and return only the JSON payload.",
      `Domain profile: ${domain}.`,
      `Intent: ${compactIntent}`,
      `Quality diagnostics: ${JSON.stringify(compactDiagnostics)}`,
      `Runtime visual probe context: ${runtimeProbeContext ?? "not available"}`,
      `Software diagnostic toolkit context: ${softwareDiagnosticContext ?? "not available"}`,
      `Current file names: ${JSON.stringify(currentFileNames)}`
    ].join("\n"));
    parsed = askProviderForJson(providerExec, targetedPrompt, providerDebug);
  }
  if (
    flattenSingleTopFolder(extractFilesFromParsed(parsed), path.basename(appDir)).length === 0 &&
    !hasUnrecoverableProviderError(providerDebug.errors)
  ) {
    const minimalPrompt = clampPromptSize([
      "Return ONLY valid JSON. No markdown.",
      'Schema: {"files":[{"path":"relative/path","content":"..."}]}',
      "Apply minimal patch set: 1 to 5 files only.",
      "Prioritize fixing the first quality diagnostic immediately.",
      "Never mention unavailable tools or ask the user to create files manually.",
      "Assume you can directly author repository files and return only the JSON payload.",
      `Domain profile: ${domain}.`,
      `Intent: ${compactIntent}`,
      `Top quality diagnostics: ${JSON.stringify(compactDiagnostics.slice(0, 2))}`,
      `Runtime visual probe context: ${runtimeProbeContext ?? "not available"}`,
      `Software diagnostic toolkit context: ${softwareDiagnosticContext ?? "not available"}`,
      `Current file names: ${JSON.stringify(currentFileNames.slice(0, 40))}`
    ].join("\n"));
    parsed = askProviderForJson(providerExec, minimalPrompt, providerDebug);
  }
  if (flattenSingleTopFolder(extractFilesFromParsed(parsed), path.basename(appDir)).length === 0) {
    return {
      attempted: true,
      applied: false,
      fileCount: 0,
      reason: hasUnrecoverableProviderError(providerDebug.errors)
        ? `provider temporarily unavailable: ${lastProviderError(providerDebug.errors) || "hard provider failure"}`
        : "provider response unusable"
    };
  }

  const updates = flattenSingleTopFolder(extractFilesFromParsed(parsed), path.basename(appDir)).filter((file) => {
    if (file.path !== "package.json") {
      return true;
    }
    return !looksLikeCliPackageJson(file.content);
  });
  if (updates.length === 0) {
    return { attempted: true, applied: false, fileCount: 0, reason: "no valid files in response" };
  }

  for (const file of updates) {
    const full = path.join(appDir, file.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content, "utf-8");
  }

  return { attempted: true, applied: true, fileCount: updates.length };
}

export const __internal = {
  extractJsonObject,
  parseFilesFromRawText,
  extractFilesFromParsed
};
