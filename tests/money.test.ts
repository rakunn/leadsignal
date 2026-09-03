import { describe, expect, it } from "vitest";
import { parseMoneyCents } from "@/lib/ingest/money";

describe("parseMoneyCents", () => {
  it("converts plain decimal strings to exact integer cents", () => {
    expect(parseMoneyCents("21474836.47")).toBe(2_147_483_647);
    expect(parseMoneyCents("0.29")).toBe(29);
    expect(parseMoneyCents("12.4")).toBe(1_240);
  });

  it("treats missing and blank optional amounts as zero", () => {
    expect(parseMoneyCents(undefined)).toBe(0);
    expect(parseMoneyCents("  ")).toBe(0);
  });

  it.each([
    "21474836.48",
    "12oops",
    "$1,234.50",
    "1e3",
    "-1",
    "1.001",
    "9".repeat(33),
  ])("rejects malformed or overflowing amounts: %s", (value) => {
    expect(() => parseMoneyCents(value)).toThrow("Invalid monetary value.");
  });
});
