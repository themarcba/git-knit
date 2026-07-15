import { describe, it, expect } from "vitest";
import { glyphs } from "../src/ui/glyphs.js";
import { colorEnabled, palette } from "../src/ui/color.js";

describe("glyphs", () => {
  it("provides unicode glyphs when unicode is supported", () => {
    const g = glyphs(true);
    expect(g.success).toBe("✓");
    expect(g.failure).toBe("✗");
    expect(g.arrow).toBe("→");
    expect(g.warning).toBe("⚠");
    expect(g.bullet).toBe("•");
    expect(g.ahead).toBe("↑");
    expect(g.progress).toBe("⋯");
  });

  it("falls back to ASCII when unicode is not supported", () => {
    const g = glyphs(false);
    expect(g.success).toBe("v");
    expect(g.failure).toBe("x");
    expect(g.arrow).toBe("->");
  });

  it("contains no emoji characters", () => {
    const g = glyphs(true);
    const all = Object.values(g).join("");
    for (const ch of all) {
      expect(ch.codePointAt(0)!).toBeLessThan(0x2800);
    }
  });
});

describe("color", () => {
  it("disables color when NO_COLOR is set", () => {
    expect(colorEnabled({ NO_COLOR: "1" }, { isTTY: true } as any)).toBe(false);
  });
  it("disables color for non-TTY", () => {
    expect(colorEnabled({}, { isTTY: false } as any)).toBe(false);
  });
  it("palette is identity when disabled", () => {
    const p = palette(false);
    expect(p.success("ok")).toBe("ok");
  });
});
