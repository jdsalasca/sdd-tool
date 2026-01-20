import { validateJson } from "../validation/validate";
import { loadPromptPacks } from "./prompt-packs";

export function validatePromptPacks(): { valid: boolean; errors: string[] } {
  const packs = loadPromptPacks();
  const errors: string[] = [];
  for (const pack of packs) {
    const result = validateJson("prompt-pack.schema.json", pack);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `${pack.id}: ${error}`));
    }
  }
  return { valid: errors.length === 0, errors };
}
