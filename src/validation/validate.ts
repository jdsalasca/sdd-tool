import fs from "fs";
import path from "path";
import Ajv2020 from "ajv/dist/2020";
import type { AnySchema } from "ajv";
import { getRepoRoot } from "../paths";

function loadSchemas(root: string): Map<string, unknown> {
  const schemaDir = path.join(root, "schemas");
  const schemaFiles = fs.readdirSync(schemaDir).filter((file) => file.endsWith(".schema.json"));
  const schemas = new Map<string, unknown>();
  for (const file of schemaFiles) {
    const schemaPath = path.join(schemaDir, file);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as { $id?: string };
    if (!schema.$id) {
      schema.$id = file;
    }
    schemas.set(file, schema);
  }
  return schemas;
}

export function validateJson(schemaFile: string, data: unknown): { valid: boolean; errors: string[] } {
  const root = getRepoRoot();
  const schemas = loadSchemas(root);
  const ajv = new Ajv2020({ allErrors: true });
  for (const schema of schemas.values()) {
    const candidate = schema as AnySchema & { $id?: string };
    ajv.addSchema(candidate, candidate.$id);
  }
  const validate = ajv.getSchema(schemaFile);
  if (!validate) {
    return { valid: false, errors: [`Schema not found: ${schemaFile}`] };
  }
  const valid = validate(data);
  const errors = (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`.trim());
  return { valid: Boolean(valid), errors };
}
