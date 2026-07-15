import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILENAME = ".assemble.json";

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

export function configPath(repoDir: string): string {
  return join(repoDir, CONFIG_FILENAME);
}

export function configExists(repoDir: string): boolean {
  return existsSync(configPath(repoDir));
}

export function loadConfig(repoDir: string): Config {
  const p = configPath(repoDir);
  if (!existsSync(p)) throw new ConfigError(`No ${CONFIG_FILENAME} found`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    throw new ConfigError(`${CONFIG_FILENAME} is not valid JSON`);
  }
  return validate(raw);
}

function validate(raw: unknown): Config {
  if (typeof raw !== "object" || raw === null || !("integrations" in raw)) {
    throw new ConfigError(`${CONFIG_FILENAME} must have an "integrations" object`);
  }
  const integrations = (raw as { integrations: unknown }).integrations;
  if (typeof integrations !== "object" || integrations === null) {
    throw new ConfigError(`"integrations" must be an object`);
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

export function writeConfig(repoDir: string, cfg: Config): void {
  validate(cfg);
  writeFileSync(configPath(repoDir), JSON.stringify(cfg, null, 2) + "\n");
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
