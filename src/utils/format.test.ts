import { describe, expect, it } from "vitest";
import { formatDateTime, formatMoney, formatPercent, formatWeight } from "./format";

describe("format helpers", () => {
  it("formats finite values", () => {
    expect(formatMoney(12.3)).toBe("¥12.30");
    expect(formatPercent(6)).toBe("6.00%");
    expect(formatWeight(123.4)).toBe("123g");
  });

  it("returns placeholder for invalid values", () => {
    expect(formatMoney(null)).toBe("--");
    expect(formatPercent(undefined)).toBe("--");
    expect(formatWeight(Number.NaN)).toBe("--");
    expect(formatDateTime("invalid-date")).toBe("--");
  });
});
