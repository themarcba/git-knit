import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, readFileSync } from "node:fs";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import {
  loadConfig,
  writeConfig,
  addDependency,
  removeDependency,
  emptyConfig,
  ConfigError,
} from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("config", () => {
  it("loadConfig throws ConfigError when file missing", () => {
    repo = makeRepo();
    expect(() => loadConfig(repo.configPath)).toThrow(ConfigError);
  });

  it("round-trips an integration as YAML with a mandatory base", () => {
    repo = makeRepo();
    let cfg = emptyConfig();
    cfg = addDependency(cfg, "big-feature", "fix-a", "main");
    writeConfig(repo.configPath, cfg);
    // stored as YAML, not JSON
    expect(readFileSync(repo.configPath, "utf8")).toContain("integrations:");
    const loaded = loadConfig(repo.configPath);
    expect(loaded.integrations["big-feature"].base).toBe("main");
    expect(loaded.integrations["big-feature"].depends_on).toEqual(["fix-a"]);
  });

  it("addDependency preserves order and rejects duplicates", () => {
    let cfg = addDependency(emptyConfig(), "bf", "a", "main");
    cfg = addDependency(cfg, "bf", "b", "main");
    expect(cfg.integrations["bf"].depends_on).toEqual(["a", "b"]);
    expect(() => addDependency(cfg, "bf", "a", "main")).toThrow(ConfigError);
  });

  it("removeDependency removes but keeps empty integration", () => {
    let cfg = addDependency(emptyConfig(), "bf", "a", "main");
    cfg = removeDependency(cfg, "bf", "a");
    expect(cfg.integrations["bf"].depends_on).toEqual([]);
    expect(() => removeDependency(cfg, "bf", "missing")).toThrow(ConfigError);
  });

  it("rejects config missing a base", () => {
    repo = makeRepo();
    writeFileSync(repo.configPath, "integrations:\n  bf:\n    depends_on: []\n");
    expect(() => loadConfig(repo.configPath)).toThrow(ConfigError);
  });
});
