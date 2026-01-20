export type RouterIntent = {
  intent: "bug_fix" | "pr_review" | "learning" | "design" | "data_science" | "business" | "legal" | "software" | "generic";
  confidence: number;
  flow: string;
  domain: "bug_fix" | "pr_review" | "learning" | "design" | "data_science" | "business" | "legal" | "software" | "generic";
  signals: string[];
};
