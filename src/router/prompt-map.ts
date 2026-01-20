export function mapAnswersToRequirement(answers: Record<string, string>): Record<string, string> {
  const objective = answers["What is the objective?"] ?? "N/A";
  const actors = answers["Who are the users and actors?"] ?? "";
  const scope = answers["What is in scope and out of scope?"] ?? "";
  const acceptance = answers["What are the acceptance criteria?"] ?? "";
  const nfrs = answers["What NFRs apply (security, performance, availability)?"] ?? "";

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
