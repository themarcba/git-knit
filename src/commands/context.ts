import type { Git } from "../git.js";
import type { Ui } from "../ui/spinner.js";
import type { Glyphs } from "../ui/glyphs.js";
import type { Palette } from "../ui/color.js";

export interface Ctx {
  git: Git;
  root: string;
  configFile: string;
  ui: Ui;
  glyphs: Glyphs;
  palette: Palette;
  interactive: boolean;
  debug: boolean;
}
