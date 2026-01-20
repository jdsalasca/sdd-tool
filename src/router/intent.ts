import { RouterIntent } from "../types";

const SIGNALS: Array<{ intent: RouterIntent["intent"]; flow: string; domain: RouterIntent["domain"]; keywords: string[] }> = [
  { intent: "bug_fix", flow: "BUG_FIX", domain: "bug_fix", keywords: ["bug", "issue", "error", "crash", "stack"] },
  { intent: "pr_review", flow: "PR_REVIEW", domain: "pr_review", keywords: ["pr", "pull request", "review"] },
  { intent: "learning", flow: "LEARN", domain: "learning", keywords: ["learn", "explain", "teach me", "what is"] },
  { intent: "design", flow: "DESIGN", domain: "design", keywords: ["logo", "brand", "layout", "visual", "design"] },
  { intent: "data_science", flow: "DATA_SCIENCE", domain: "data_science", keywords: ["model", "dataset", "prediction", "ml"] },
  { intent: "business", flow: "BUSINESS", domain: "business", keywords: ["pricing", "market", "forecast", "economics"] },
  { intent: "legal", flow: "LEGAL", domain: "legal", keywords: ["court", "law", "policy", "compliance"] },
  { intent: "software", flow: "SOFTWARE_FEATURE", domain: "software", keywords: ["feature", "api", "backend", "frontend", "implement"] }
];

export const FLOW_PROMPT_PACKS: Record<string, string[]> = {
  BUG_FIX: ["discovery.core", "bug_fix.core"],
  PR_REVIEW: ["pr_review.core", "review.severity"],
  SOFTWARE_FEATURE: ["discovery.core", "release.rollout"],
  DATA_SCIENCE: ["discovery.core", "data.monitoring"],
  DESIGN: ["discovery.core", "design.accessibility"],
  HUMANITIES: ["discovery.core", "humanities.sources"],
  BUSINESS: ["discovery.core", "business.sensitivity"],
  LEGAL: ["discovery.core", "legal.compliance"],
  LEARN: ["discovery.core", "learn.format"],
  GENERIC: ["discovery.core"]
};

export function classifyIntent(input: string): RouterIntent {
  const normalized = input.toLowerCase();
  for (const rule of SIGNALS) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return {
        intent: rule.intent,
        confidence: 0.7,
        flow: rule.flow,
        domain: rule.domain,
        signals: rule.keywords.filter((keyword) => normalized.includes(keyword))
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
