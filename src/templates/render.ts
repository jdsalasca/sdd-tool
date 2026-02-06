import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";

export function loadTemplate(name: string): string {
  const root = getRepoRoot();
  const mdPath = path.join(root, "templates", `${name}.md`);
  const ymlPath = path.join(root, "templates", `${name}.yml`);
  const filePath = fs.existsSync(mdPath) ? mdPath : fs.existsSync(ymlPath) ? ymlPath : null;
  if (!filePath) {
    throw new Error(`Template not found: ${name} (.md or .yml)`);
  }
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
