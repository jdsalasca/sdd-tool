import fs from "fs";
import path from "path";
import { getWorkspaceInfo } from "../workspace/index";
import { validateJson } from "../validation/validate";

function collectJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function inferSchema(filePath: string): string | null {
  if (filePath.endsWith("requirement.json")) return "requirement.schema.json";
  if (filePath.endsWith("technical-spec.json")) return "technical-spec.schema.json";
  if (filePath.endsWith("functional-spec.json")) return "functional-spec.schema.json";
  if (filePath.endsWith("architecture.json")) return "architecture.schema.json";
  if (filePath.endsWith("test-plan.json")) return "test-plan.schema.json";
  return null;
}

export function runDoctor(): void {
  const workspace = getWorkspaceInfo();
  const jsonFiles = collectJsonFiles(workspace.root);
  if (jsonFiles.length === 0) {
    console.log("No JSON artifacts found in workspace.");
    return;
  }

  let failures = 0;
  for (const filePath of jsonFiles) {
    const schema = inferSchema(filePath);
    if (!schema) {
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const result = validateJson(schema, data);
    if (!result.valid) {
      failures += 1;
      console.log(`Invalid: ${filePath}`);
      result.errors.forEach((error) => console.log(`- ${error}`));
    }
  }

  if (failures === 0) {
    console.log("All JSON artifacts are valid.");
  } else {
    console.log(`Validation failed for ${failures} artifact(s).`);
  }
}
