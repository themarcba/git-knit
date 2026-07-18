import { describe, it, expect } from "vitest";
import { parseConflictChoice, parseConfirm } from "../src/ui/prompt.js";

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

describe("parseConfirm", () => {
  it("treats y/yes (any case) as yes", () => {
    expect(parseConfirm("y")).toBe(true);
    expect(parseConfirm("yes")).toBe(true);
    expect(parseConfirm("Y")).toBe(true);
    expect(parseConfirm(" YES ")).toBe(true);
  });
  it("treats anything else as no (default No)", () => {
    expect(parseConfirm("")).toBe(false);
    expect(parseConfirm("n")).toBe(false);
    expect(parseConfirm("no")).toBe(false);
    expect(parseConfirm("x")).toBe(false);
  });
});
