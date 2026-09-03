import { describe, expect, test } from "vitest";
import { normalizePage } from "@/lib/pagination";

describe("pagination boundaries", () => {
  test.each([
    ["999", 3, 3], ["2oops", 3, 1], [undefined, 0, 1], ["2", 3, 2],
    ["0", 3, 1], ["-1", 3, 1], ["1.5", 3, 1], [" 2", 3, 1],
    ["1e2", 200, 1], ["", 3, 1], [["2", "3"], 3, 1],
    ["9".repeat(500), 3, 3], ["2", 0, 1], ["0002", 3, 2],
  ] as const)("normalizes %s within %s pages to %s", (value, total, expected) => {
    expect(normalizePage(Array.isArray(value) ? [...value] : value as string | undefined, total)).toBe(expected);
  });
});
