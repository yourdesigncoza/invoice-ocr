import { describe, it, expect } from "vitest";
import { formatVat, formatMoney, formatPct } from "@/lib/utils";

describe("formatVat", () => {
  it("strips all whitespace", () => {
    expect(formatVat("4110 107 291")).toBe("4110107291");
    expect(formatVat("  4540 2721 29 ")).toBe("4540272129");
  });
  it("returns null for empty/nullish", () => {
    expect(formatVat(null)).toBeNull();
    expect(formatVat("")).toBeNull();
    expect(formatVat("   ")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats ZAR with a dash for missing values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(335.37)).toMatch(/335[.,]37/);
  });
});

describe("formatPct", () => {
  it("rounds a 0–1 score to a percentage", () => {
    expect(formatPct(0.857)).toBe("86%");
    expect(formatPct(null)).toBe("—");
  });
});
