import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";

type TemplateIndexEntry = {
  name: string;
  placeholders: string[];
};

type TemplateIndex = {
  templates: TemplateIndexEntry[];
};

function extractPlaceholders(template: string): string[] {
  const matches = template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g);
  const placeholders = new Set<string>();
  for (const match of matches) {
    placeholders.add(match[1]);
  }
  return Array.from(placeholders);
}

function normalize(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function validateTemplates(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const root = getRepoRoot();
  const templatesDir = path.join(root, "templates");
  const indexPath = path.join(templatesDir, "template-index.json");

  if (!fs.existsSync(indexPath)) {
    return { valid: false, errors: ["Missing templates/template-index.json"] };
  }

  const index = JSON.parse(fs.readFileSync(indexPath, "utf-8")) as TemplateIndex;
  const indexByName = new Map(index.templates.map((entry) => [entry.name, entry]));

  const templateFiles = fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yml")))
    .map((entry) => entry.name);

  const fileByName = new Map(
    templateFiles.map((file) => [path.parse(file).name, path.join(templatesDir, file)])
  );

  for (const entry of index.templates) {
    if (!fileByName.has(entry.name)) {
      errors.push(`Template index entry missing file: ${entry.name}`);
    }
  }

  for (const [name, filePath] of fileByName.entries()) {
    const content = fs.readFileSync(filePath, "utf-8");
    const placeholders = normalize(extractPlaceholders(content));
    if (placeholders.length === 0) {
      continue;
    }
    const entry = indexByName.get(name);
    if (!entry) {
      errors.push(`Template file missing index entry: ${name}`);
      continue;
    }
    const indexed = normalize(entry.placeholders);
    if (indexed.join("|") !== placeholders.join("|")) {
      errors.push(
        `Template placeholder mismatch: ${name} (index=${indexed.join(", ")} file=${placeholders.join(", ")})`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}
