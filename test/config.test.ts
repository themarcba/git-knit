import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { makeRepo, type TempRepo } from "./helpers/repo.js";
import {
  loadConfig,
  writeConfig,
  addDependency,
  removeDependency,
  emptyConfig,
  ConfigError,
  CONFIG_FILENAME,
} from "../src/config.js";

let repo: TempRepo;
afterEach(() => repo?.cleanup());

describe("config", () => {
  it("loadConfig throws ConfigError when file missing", () => {
    repo = makeRepo();
    expect(() => loadConfig(repo.dir)).toThrow(ConfigError);
  });

  it("round-trips an integration with a mandatory base", () => {
    repo = makeRepo();
    let cfg = emptyConfig();
    cfg = addDependency(cfg, "big-feature", "fix-a", "main");
    writeConfig(repo.dir, cfg);
    const loaded = loadConfig(repo.dir);
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
    writeFileSync(
      join(repo.dir, CONFIG_FILENAME),
      JSON.stringify({ integrations: { bf: { depends_on: [] } } }),
    );
    expect(() => loadConfig(repo.dir)).toThrow(ConfigError);
  });
});
