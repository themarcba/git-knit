import ora, { type Ora } from "ora";
import { glyphs } from "./glyphs.js";
import { palette } from "./color.js";

export interface Ui {
  step: (msg: string) => void;
  ok: (msg: string) => void;
  fail: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  plain: (msg: string) => void;
}

export interface UiOptions {
  color: boolean;
  unicode: boolean;
  spinner: boolean;
}

export function makeUi(opts: UiOptions): Ui {
  const g = glyphs(opts.unicode);
  const p = palette(opts.color);
  let active: Ora | null = null;

  const stop = () => {
    if (active) {
      active.stop();
      active = null;
    }
  };
  return {
    step: (msg) => {
      stop();
      if (opts.spinner) {
        active = ora({ text: msg, prefixText: " ", color: "cyan" }).start();
      } else {
        process.stdout.write(`  ${p.dim(g.progress)} ${msg}\n`);
      }
    },
    ok: (msg) => {
      stop();
      process.stdout.write(`  ${p.success(g.success)} ${msg}\n`);
    },
    fail: (msg) => {
      stop();
      process.stdout.write(`  ${p.failure(g.failure)} ${msg}\n`);
    },
    warn: (msg) => {
      stop();
      process.stdout.write(`  ${p.warning(g.warning)} ${msg}\n`);
    },
    info: (msg) => {
      stop();
      process.stdout.write(`  ${p.dim(g.arrow)} ${msg}\n`);
    },
    plain: (msg) => {
      stop();
      process.stdout.write(`${msg}\n`);
    },
  };
}
