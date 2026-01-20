import fs from "fs";
import path from "path";
import { getRepoRoot } from "../paths";

export type PromptPack = {
  id: string;
  questions: string[];
  gates: string[];
  followUps?: string[];
};

export function loadPromptPacks(): PromptPack[] {
  const root = getRepoRoot();
  const packPath = path.join(root, "templates", "prompt-pack-index.json");
  const raw = fs.readFileSync(packPath, "utf-8");
  const parsed = JSON.parse(raw) as { packs: PromptPack[] };
  return parsed.packs ?? [];
}

export function getPromptPackById(packs: PromptPack[], id: string): PromptPack | undefined {
  return packs.find((pack) => pack.id === id);
}
