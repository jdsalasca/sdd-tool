import fs from "fs";
import path from "path";
import Ajv from "ajv";
import { getRepoRoot } from "../paths";

export function validateJson(schemaFile: string, data: unknown): { valid: boolean; errors: string[] } {
  const root = getRepoRoot();
  const schemaPath = path.join(root, "schemas", schemaFile);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  const ajv = new Ajv();
  const validate = ajv.compile(schema);
  const valid = validate(data);
  const errors = (validate.errors ?? []).map((error) => `${error.instancePath} ${error.message}`.trim());
  return { valid: Boolean(valid), errors };
}
