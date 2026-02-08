import fs from "fs";
import os from "os";
import path from "path";

export type SddModeDefault = "guided" | "non-interactive" | "beginner";
export type SddProviderDefault = "gemini" | "codex" | "auto";

export type SddConfig = {
  workspace: {
    default_root: string;
  };
  ai: {
    preferred_cli: SddProviderDefault;
    model: string;
  };
  mode: {
    default: SddModeDefault;
  };
  git: {
    publish_enabled: boolean;
  };
};

function homeDocumentsDir(): string {
  const home = os.homedir();
  return path.join(home, "Documents");
}

function inferUserName(home: string): string {
  const normalized = home.replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
  return normalized.length > 0 ? normalized[normalized.length - 1] : "user";
}

export function configPath(): string {
  const override = process.env.SDD_CONFIG_PATH?.trim();
  if (override) {
    return path.resolve(override);
  }
  const root = process.env.APPDATA
    ? path.join(process.env.APPDATA, "sdd-cli")
    : path.join(os.homedir(), ".config", "sdd-cli");
  return path.join(root, "config.yml");
}

export function defaultConfig(): SddConfig {
  return {
    workspace: {
      default_root: path.join(homeDocumentsDir(), "sdd-tool-projects")
    },
    ai: {
      preferred_cli: "gemini",
      model: "gemini-2.5-flash-lite"
    },
    mode: {
      default: "guided"
    },
    git: {
      publish_enabled: false
    }
  };
}

function normalizeProvider(value: string): SddProviderDefault {
  const clean = value.trim().toLowerCase();
  if (clean === "codex" || clean === "auto" || clean === "gemini") {
    return clean;
  }
  return "gemini";
}

function normalizeMode(value: string): SddModeDefault {
  const clean = value.trim().toLowerCase();
  if (clean === "non-interactive") {
    return "non-interactive";
  }
  if (clean === "beginner") {
    return "beginner";
  }
  return "guided";
}

function expandRoot(value: string): string {
  let out = value.trim();
  const home = os.homedir();
  const user = inferUserName(home);
  out = out.replace(/\{\{user\}\}/gi, user);
  out = out.replace(/\{\{home\}\}/gi, home);
  if (out.startsWith("~/")) {
    out = path.join(home, out.slice(2));
  }
  return path.resolve(out);
}

function parseSimpleYaml(raw: string): Partial<SddConfig> {
  const result: Partial<SddConfig> = {};
  let section = "";
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const sectionMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/.exec(trimmed);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const valueMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.+)\s*$/.exec(trimmed);
    if (!valueMatch || !section) {
      continue;
    }
    const key = valueMatch[1];
    const value = valueMatch[2].replace(/^["']|["']$/g, "");
    if (section === "workspace" && key === "default_root") {
      result.workspace = { default_root: value };
    } else if (section === "ai" && key === "preferred_cli") {
      result.ai = { ...(result.ai ?? { model: defaultConfig().ai.model }), preferred_cli: normalizeProvider(value) };
    } else if (section === "ai" && key === "model") {
      result.ai = { ...(result.ai ?? { preferred_cli: defaultConfig().ai.preferred_cli }), model: value.trim() };
    } else if (section === "mode" && key === "default") {
      result.mode = { default: normalizeMode(value) };
    } else if (section === "git" && key === "publish_enabled") {
      result.git = { publish_enabled: value.trim().toLowerCase() === "true" };
    }
  }
  return result;
}

function renderYaml(config: SddConfig): string {
  return [
    "# sdd-cli configuration",
    "# You can use {{user}} or {{home}} in workspace.default_root",
    "workspace:",
    `  default_root: ${config.workspace.default_root}`,
    "ai:",
    `  preferred_cli: ${config.ai.preferred_cli}`,
    `  model: ${config.ai.model}`,
    "mode:",
    `  default: ${config.mode.default}`,
    "git:",
    `  publish_enabled: ${config.git.publish_enabled ? "true" : "false"}`,
    ""
  ].join("\n");
}

function mergeConfig(base: SddConfig, input: Partial<SddConfig>): SddConfig {
  const root = input.workspace?.default_root ? expandRoot(input.workspace.default_root) : base.workspace.default_root;
  return {
    workspace: {
      default_root: root
    },
    ai: {
      preferred_cli: input.ai?.preferred_cli ? normalizeProvider(input.ai.preferred_cli) : base.ai.preferred_cli,
      model: typeof input.ai?.model === "string" && input.ai.model.trim() ? input.ai.model.trim() : base.ai.model
    },
    mode: {
      default: input.mode?.default ? normalizeMode(input.mode.default) : base.mode.default
    },
    git: {
      publish_enabled:
        typeof input.git?.publish_enabled === "boolean" ? input.git.publish_enabled : base.git.publish_enabled
    }
  };
}

export function loadConfig(): SddConfig {
  const defaults = defaultConfig();
  const file = configPath();
  if (!fs.existsSync(file)) {
    return defaults;
  }
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return mergeConfig(defaults, parseSimpleYaml(raw));
  } catch {
    return defaults;
  }
}

export function saveConfig(config: SddConfig): string {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderYaml(config), "utf-8");
  return file;
}

export function ensureConfig(): SddConfig {
  const existing = loadConfig();
  const file = configPath();
  if (!fs.existsSync(file)) {
    saveConfig(existing);
  }
  fs.mkdirSync(existing.workspace.default_root, { recursive: true });
  return existing;
}

export function updateConfigValue(key: string, value: string): SddConfig | null {
  const current = ensureConfig();
  const next: SddConfig = {
    workspace: { ...current.workspace },
    ai: { ...current.ai },
    mode: { ...current.mode },
    git: { ...current.git }
  };
  const normalized = key.trim().toLowerCase();
  if (normalized === "workspace.default_root") {
    next.workspace.default_root = expandRoot(value);
  } else if (normalized === "ai.preferred_cli") {
    next.ai.preferred_cli = normalizeProvider(value);
  } else if (normalized === "ai.model") {
    next.ai.model = value.trim() || next.ai.model;
  } else if (normalized === "mode.default") {
    next.mode.default = normalizeMode(value);
  } else if (normalized === "git.publish_enabled") {
    next.git.publish_enabled = value.trim().toLowerCase() === "true";
  } else {
    return null;
  }
  saveConfig(next);
  fs.mkdirSync(next.workspace.default_root, { recursive: true });
  return next;
}
