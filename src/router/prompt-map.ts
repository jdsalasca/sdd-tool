function findAnswer(answers: Record<string, string>, keywords: string[]): string | undefined {
  const entries = Object.entries(answers);
  for (const [question, response] of entries) {
    const normalized = question.toLowerCase();
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return response;
    }
  }
  return undefined;
}

export function mapAnswersToRequirement(answers: Record<string, string>): Record<string, string> {
  const objective = findAnswer(answers, ["objective"]) ?? answers["What is the objective?"] ?? "N/A";
  const actors =
    findAnswer(answers, ["users", "actors", "user", "actor"]) ?? answers["Who are the users and actors?"] ?? "";
  const scope =
    findAnswer(answers, ["in scope", "out of scope", "scope"]) ?? answers["What is in scope and out of scope?"] ?? "";
  const acceptance =
    findAnswer(answers, ["acceptance"]) ?? answers["What are the acceptance criteria?"] ?? "";
  const nfrs =
    findAnswer(answers, ["nfr", "security", "performance", "availability"]) ??
    answers["What NFRs apply (security, performance, availability)?"] ??
    "";

  return {
    objective,
    actors,
    scope_in: scope,
    scope_out: "",
    acceptance_criteria: acceptance,
    nfr_security: nfrs,
    nfr_performance: nfrs,
    nfr_availability: nfrs
  };
}
