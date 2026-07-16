import type { Git } from "./git.js";
import type { Integration } from "./config.js";

export interface DepDrift {
  branch: string;
  exists: boolean;
  merged: boolean;
}
export interface Drift {
  integration: string;
  knitted: boolean;
  baseCurrent: boolean;
  dependencies: DepDrift[];
  upToDate: boolean;
}

export function computeDrift(git: Git, name: string, integ: Integration): Drift {
  const knitted = git.branchExists(name);
  if (!knitted) {
    return {
      integration: name,
      knitted: false,
      baseCurrent: false,
      dependencies: integ.depends_on.map((b) => ({
        branch: b,
        exists: git.branchExists(b),
        merged: false,
      })),
      upToDate: false,
    };
  }
  const baseCurrent = git.branchExists(integ.base) && git.isAncestor(integ.base, name);
  const dependencies: DepDrift[] = integ.depends_on.map((b) => {
    const exists = git.branchExists(b);
    return { branch: b, exists, merged: exists ? git.isAncestor(b, name) : false };
  });
  const upToDate = baseCurrent && dependencies.every((d) => d.merged);
  return { integration: name, knitted, baseCurrent, dependencies, upToDate };
}
