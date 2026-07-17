export interface Glyphs {
  success: string;
  failure: string;
  arrow: string;
  warning: string;
  bullet: string;
  ahead: string;
  behind: string;
  progress: string;
}

const UNICODE: Glyphs = {
  success: "✓",
  failure: "✗",
  arrow: "→",
  warning: "⚠",
  bullet: "•",
  ahead: "↑",
  behind: "↓",
  progress: "⋯",
};

const ASCII: Glyphs = {
  success: "v",
  failure: "x",
  arrow: "->",
  warning: "!",
  bullet: "*",
  ahead: "^",
  behind: "v",
  progress: "...",
};

export function glyphs(unicode: boolean): Glyphs {
  return unicode ? UNICODE : ASCII;
}
