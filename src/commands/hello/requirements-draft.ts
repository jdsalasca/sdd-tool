import { RequirementDraft } from "../req-create";

const TRANSLATE_TOKENS: Record<string, string> = {
  calculadora: "calculator",
  notas: "notes",
  parqueadero: "parking",
  registro: "registry",
  contratos: "contracts",
  abogado: "lawyer",
  cliente: "client",
  costo: "cost",
  ventas: "sales",
  tienda: "store",
  vendedores: "sellers",
  vendedor: "seller",
  cafe: "coffee",
  coffe: "coffee",
  inventario: "inventory",
  usuarios: "users",
  usuario: "user",
  prestamos: "loans",
  libros: "books",
  citas: "appointments",
  medicas: "medical",
  medicaso: "medical",
  hospital: "hospital",
  posiciones: "slots",
  posicion: "slot",
  historial: "history",
  informes: "reports",
  mensual: "monthly",
  mensuales: "monthly"
};

const PROJECT_NAME_STOPWORDS = new Set([
  "genera",
  "generar",
  "app",
  "application",
  "create",
  "build",
  "sistema",
  "system",
  "de",
  "la",
  "el",
  "y",
  "con"
]);

const FLOW_SCOPE_MAP: Record<string, string> = {
  BUG_FIX: "Reproduce issue, isolate root cause, define fix",
  PR_REVIEW: "Review feedback, plan responses, track actions",
  SOFTWARE_FEATURE: "Core feature behavior and acceptance flow",
  DATA_SCIENCE: "Dataset, modeling approach, and evaluation plan",
  DESIGN: "Core design goals, accessibility, and deliverables",
  HUMANITIES: "Research question, sources, and analytical lens",
  BUSINESS: "Business objective, model assumptions, and constraints",
  LEGAL: "Applicable legal constraints and compliance requirements",
  LEARN: "Learning objective, structure, and practice outputs",
  GENERIC: "Core user need and initial delivery scope"
};

const FLOW_SCOPE_OUT_MAP: Record<string, string> = {
  BUG_FIX: "Unrelated refactors not needed for this fix",
  PR_REVIEW: "Changes outside current PR scope",
  SOFTWARE_FEATURE: "Future enhancements after MVP",
  DATA_SCIENCE: "Production hardening beyond first iteration",
  DESIGN: "Full rebrand outside stated objective",
  HUMANITIES: "Unrelated historical periods or disciplines",
  BUSINESS: "Additional markets not in initial launch",
  LEGAL: "Jurisdictions outside selected compliance scope",
  LEARN: "Advanced topics outside current learning target",
  GENERIC: "Additional ideas to evaluate in next iteration"
};

const DOMAIN_ACTORS_MAP: Record<string, string> = {
  bug_fix: "developer, qa",
  pr_review: "reviewer, contributor",
  software: "end user, product owner, developer",
  data_science: "analyst, data scientist, stakeholder",
  design: "designer, end user, stakeholder",
  humanities: "researcher, reader",
  business: "customer, business owner, operator",
  legal: "legal team, compliance owner",
  learning: "learner, mentor",
  generic: "user, stakeholder"
};

const LAYERED_SCOPE_DEFAULT =
  "Iteration 1: scaffold monorepo with backend/ and frontend/ subprojects; Iteration 1: define API contracts and DTO validation boundaries in backend; Iteration 1: implement frontend feature module consuming backend APIs; Iteration 1: persist domain data with schema and repository/service layers; Iteration 1: add smoke/build/test scripts for backend and frontend; Iteration 1: document architecture/components/schemas and DummyLocal; Iteration 1: capture regression checks for core flows; Iteration 1: prepare release candidate documentation with quality evidence";

const LAYERED_ACCEPTANCE_DEFAULT =
  "Iteration 1: backend build/test pass for contract and validation boundaries; Iteration 1: frontend build/test pass for core user journey with API calls; Iteration 1: smoke checks pass on local runtime for backend/frontend integration; At least 10 acceptance checks are documented and traceable; p95 response time remains under 300 ms for baseline load; Release notes and deployment docs are complete; No blocker findings remain after role review";

export function deriveProjectName(input: string, flow: string): string {
  const seed = input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((token) => TRANSLATE_TOKENS[token] ?? token)
    .filter((token) => token.length > 2 && !PROJECT_NAME_STOPWORDS.has(token))
    .slice(0, 5)
    .join("-");
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join("");
  const base = seed.length > 0 ? `${seed}-platform` : `${flow.toLowerCase()}-platform`;
  return `autopilot-${base}-${date}-${time}`;
}

export function buildAutopilotDraft(input: string, flow: string, domain: string): RequirementDraft {
  const cleanInput = input.trim();
  const objective = cleanInput.length > 0 ? cleanInput : "Deliver a clear first requirement draft.";
  const safeFlow = FLOW_SCOPE_MAP[flow] ? flow : "GENERIC";
  const safeDomain = DOMAIN_ACTORS_MAP[domain] ? domain : "generic";
  const baseObjective =
    objective.length >= 80
      ? objective
      : `Deliver a production-ready ${safeDomain} product from "${objective}" with measurable outcomes, quality gates, and release readiness.`;
  const scopeInDefault =
    safeDomain === "software" || safeDomain === "generic"
      ? LAYERED_SCOPE_DEFAULT
      : `${FLOW_SCOPE_MAP[safeFlow]}; production deployment readiness; automated quality gates; release documentation`;
  const acceptanceDefault =
    safeDomain === "software" || safeDomain === "generic"
      ? LAYERED_ACCEPTANCE_DEFAULT
      : "Core workflows pass lint, test, build, and smoke locally; At least 10 acceptance checks are documented and traceable; p95 response time remains under 300 ms for baseline load; Release notes and deployment docs are complete; No blocker findings remain after role review";
  return {
    domain: safeDomain === "generic" ? "software" : safeDomain,
    actors: `${DOMAIN_ACTORS_MAP[safeDomain]}; qa engineer; operations engineer`,
    objective: baseObjective,
    scope_in: scopeInDefault,
    scope_out: `${FLOW_SCOPE_OUT_MAP[safeFlow]}; non-essential integrations; roadmap-only enhancements`,
    acceptance_criteria: acceptanceDefault,
    nfr_security: "Enforce secure defaults, input validation, least-privilege access, and traceable audit paths.",
    nfr_performance: "Meet baseline performance budget with measurable thresholds and stable runtime behavior.",
    nfr_availability: "Ensure local runtime startup reliability and graceful error handling for critical flows.",
    constraints:
      "Cross-platform Windows/macOS compatibility; Local-first execution without paid external dependencies; Stage-gate progression is mandatory",
    risks:
      "Provider non-delivery or unusable payloads; Dependency/version conflicts breaking build; Scope drift reducing business value",
    links: ""
  };
}
