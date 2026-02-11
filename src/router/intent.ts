import { RouterIntent } from "../types";

const SIGNALS: Array<{ intent: RouterIntent["intent"]; flow: string; domain: RouterIntent["domain"]; keywords: string[] }> = [
  {
    intent: "bug_fix",
    flow: "BUG_FIX",
    domain: "bug_fix",
    keywords: ["bug", "issue", "error", "crash", "stack trace", "stacktrace"]
  },
  { intent: "pr_review", flow: "PR_REVIEW", domain: "pr_review", keywords: ["pull request", "review"] },
  {
    intent: "learning",
    flow: "HUMANITIES",
    domain: "humanities",
    keywords: ["history", "sociology", "anthropology", "philosophy", "literature", "humanities"]
  },
  {
    intent: "learning",
    flow: "LEARN",
    domain: "learning",
    keywords: ["learn", "explain", "teach me", "what is", "course", "syllabus", "lesson", "student", "teacher"]
  },
  { intent: "design", flow: "DESIGN", domain: "design", keywords: ["logo", "brand", "layout", "visual", "design"] },
  { intent: "data_science", flow: "DATA_SCIENCE", domain: "data_science", keywords: ["model", "dataset", "prediction", "ml"] },
  { intent: "business", flow: "BUSINESS", domain: "business", keywords: ["pricing", "market", "forecast", "economics"] },
  { intent: "business", flow: "BUSINESS", domain: "business", keywords: ["ecommerce", "retail", "inventory", "checkout"] },
  {
    intent: "legal",
    flow: "LEGAL",
    domain: "legal",
    keywords: ["court", "law", "policy", "compliance", "lawyer", "tax", "audit", "regulation"]
  },
  {
    intent: "software",
    flow: "SOFTWARE_FEATURE",
    domain: "software",
    keywords: [
      "feature",
      "api",
      "backend",
      "frontend",
      "implement",
      "developer",
      "refactor",
      "code",
      "crear",
      "crea",
      "aplicacion",
      "aplicación",
      "app",
      "web",
      "desktop",
      "movil",
      "móvil"
    ]
  }
];

export const FLOW_PROMPT_PACKS: Record<string, string[]> = {
  BUG_FIX: ["discovery.core", "bug_fix.core"],
  PR_REVIEW: ["pr_review.core", "review.severity"],
  SOFTWARE_FEATURE: ["discovery.core", "release.rollout", "software.quality"],
  DATA_SCIENCE: ["discovery.core", "data.monitoring", "data.quality"],
  DESIGN: ["discovery.core", "design.accessibility", "design.quality"],
  HUMANITIES: ["discovery.core", "humanities.sources", "humanities.quality"],
  BUSINESS: ["discovery.core", "business.sensitivity", "business.quality"],
  LEGAL: ["discovery.core", "legal.compliance", "legal.quality"],
  LEARN: ["discovery.core", "learn.format", "learning.quality"],
  GENERIC: ["discovery.core"]
};

export function classifyIntent(input: string): RouterIntent {
  const normalized = input.toLowerCase();
  const prContext =
    /\bpull request\b/i.test(normalized) ||
    /\bcode review\b/i.test(normalized) ||
    (/\breview\b/i.test(normalized) && /\bpr\b/i.test(normalized));
  if (prContext) {
    return {
      intent: "pr_review",
      confidence: 0.8,
      flow: "PR_REVIEW",
      domain: "pr_review",
      signals: ["review"]
    };
  }
  const containsKeyword = (keyword: string): boolean => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped.length <= 3 && !escaped.includes(" ")) {
      return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
    }
    return normalized.includes(keyword);
  };
  const softwareRule = SIGNALS.find((rule) => rule.intent === "software");
  const hasBuildVerb =
    /\b(create|build|generate|implement|develop|ship|crear|crea|genera|desarrolla|construye)\b/i.test(normalized);
  const hasAppContext =
    /\b(app|application|aplicacion|aplicación|system|sistema|platform|plataforma|web|desktop|mobile|movil|móvil|api|backend|frontend)\b/i.test(
      normalized
    );
  if (softwareRule && hasBuildVerb && hasAppContext && softwareRule.keywords.some((keyword) => containsKeyword(keyword))) {
    return {
      intent: softwareRule.intent,
      confidence: 0.85,
      flow: softwareRule.flow,
      domain: softwareRule.domain,
      signals: softwareRule.keywords.filter((keyword) => containsKeyword(keyword))
    };
  }
  for (const rule of SIGNALS) {
    if (
      rule.intent === "learning" &&
      hasBuildVerb &&
      hasAppContext &&
      !/\b(teach me|what is|syllabus|lesson|course)\b/i.test(normalized)
    ) {
      continue;
    }
    if (rule.keywords.some((keyword) => containsKeyword(keyword))) {
      return {
        intent: rule.intent,
        confidence: 0.7,
        flow: rule.flow,
        domain: rule.domain,
        signals: rule.keywords.filter((keyword) => containsKeyword(keyword))
      };
    }
  }

  return {
    intent: "generic",
    confidence: 0.3,
    flow: "GENERIC",
    domain: "generic",
    signals: []
  };
}
