import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";

export function loadTemplate(name: string): string {
  const root = getRepoRoot();
  const filePath = path.join(root, "templates", `${name}.md`);
  return fs.readFileSync(filePath, "utf-8");
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(data)) {
    const token = `{{${key}}}`;
    output = output.split(token).join(value);
  }
  return output;
}
