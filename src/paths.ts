import path from "path";

export function getRepoRoot(): string {
  return path.resolve(__dirname, "..");
}
