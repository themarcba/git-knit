import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse, stringify } from "yaml";

// Basename of the config file inside the git directory (see Git.gitPath).
export const CONFIG_BASENAME = "knit.yaml";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface Integration {
  base: string;
  depends_on: string[];
}
export interface Config {
  integrations: Record<string, Integration>;
}

export function emptyConfig(): Config {
  return { integrations: {} };
}

export function configExists(file: string): boolean {
  return existsSync(file);
}

export function loadConfig(file: string): Config {
  if (!existsSync(file)) throw new ConfigError(`No knit config found (run: git knit init)`);
  let raw: unknown;
  try {
    raw = parse(readFileSync(file, "utf8"));
  } catch {
    throw new ConfigError(`${CONFIG_BASENAME} is not valid YAML`);
  }
  return validate(raw);
}

function validate(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || !("integrations" in raw)) {
    throw new ConfigError(`${CONFIG_BASENAME} must have an "integrations" mapping`);
  }
  const integrations = (raw as { integrations: unknown }).integrations;
  if (typeof integrations !== "object" || integrations === null) {
    throw new ConfigError(`"integrations" must be a mapping`);
  }
  for (const [name, value] of Object.entries<any>(integrations)) {
    if (!value || typeof value.base !== "string" || value.base === "") {
      throw new ConfigError(`Integration "${name}" is missing a "base"`);
    }
    if (
      !Array.isArray(value.depends_on) ||
      value.depends_on.some((d: unknown) => typeof d !== "string")
    ) {
      throw new ConfigError(`Integration "${name}" has an invalid "depends_on"`);
    }
  }
  return raw as Config;
}

export function writeConfig(file: string, cfg: Config): void {
  validate(cfg);
  writeFileSync(file, stringify(cfg));
}

export function addDependency(
  cfg: Config,
  integration: string,
  branch: string,
  base?: string,
): Config {
  const next: Config = { integrations: { ...cfg.integrations } };
  const existing = next.integrations[integration];
  if (!existing) {
    if (!base) throw new ConfigError(`New integration "${integration}" needs a base`);
    next.integrations[integration] = { base, depends_on: [branch] };
    return next;
  }
  if (existing.depends_on.includes(branch)) {
    throw new ConfigError(`${branch} is already a dependency of ${integration}`);
  }
  next.integrations[integration] = {
    base: existing.base,
    depends_on: [...existing.depends_on, branch],
  };
  return next;
}

export function removeDependency(cfg: Config, integration: string, branch: string): Config {
  const existing = cfg.integrations[integration];
  if (!existing) throw new ConfigError(`No integration "${integration}"`);
  if (!existing.depends_on.includes(branch)) {
    throw new ConfigError(`${branch} is not a dependency of ${integration}`);
  }
  const next: Config = { integrations: { ...cfg.integrations } };
  next.integrations[integration] = {
    base: existing.base,
    depends_on: existing.depends_on.filter((d) => d !== branch),
  };
  return next;
}
