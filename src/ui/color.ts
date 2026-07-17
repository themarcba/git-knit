import pc from "picocolors";

export function colorEnabled(
  env: NodeJS.ProcessEnv = process.env,
  stream: { isTTY?: boolean } = process.stdout,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "") return true;
  return Boolean(stream.isTTY);
}

export type Painter = (s: string) => string;

export interface Palette {
  success: Painter;
  failure: Painter;
  warning: Painter;
  dim: Painter;
  bold: Painter;
}

const identity: Painter = (s) => s;

export function palette(enabled: boolean): Palette {
  if (!enabled) {
    return { success: identity, failure: identity, warning: identity, dim: identity, bold: identity };
  }
  return {
    success: pc.green,
    failure: pc.red,
    warning: pc.yellow,
    dim: pc.dim,
    bold: pc.bold,
  };
}
