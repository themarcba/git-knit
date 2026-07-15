import { describe, it, expect } from "vitest";
import { parseConflictChoice } from "../src/ui/prompt.js";

describe("parseConflictChoice", () => {
  it("maps r/resolve", () => {
    expect(parseConflictChoice("r")).toBe("resolve");
    expect(parseConflictChoice("resolve")).toBe("resolve");
    expect(parseConflictChoice("R")).toBe("resolve");
  });
  it("maps a/abort", () => {
    expect(parseConflictChoice("a")).toBe("abort");
    expect(parseConflictChoice("abort")).toBe("abort");
  });
  it("returns null for unknown input", () => {
    expect(parseConflictChoice("")).toBeNull();
    expect(parseConflictChoice("x")).toBeNull();
  });
});
