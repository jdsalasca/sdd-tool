import path from "path";

export function getRepoRoot(): string {
  const override = process.env.SDD_REPO_ROOT?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.resolve(__dirname, "..");
}
