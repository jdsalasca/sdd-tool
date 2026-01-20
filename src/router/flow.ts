import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";

export function loadFlow(flowId: string): string | null {
  const root = getRepoRoot();
  const flowPath = path.join(root, "router", `${flowId}.flow.md`);
  if (!fs.existsSync(flowPath)) {
    return null;
  }
  return fs.readFileSync(flowPath, "utf-8");
}
