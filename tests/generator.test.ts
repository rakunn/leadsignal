import { describe, expect, test } from "vitest";
import { generateSampleLeads, SAMPLE_SEED } from "@/lib/sample-data/generate";

const ANCHOR = new Date("2026-06-30T00:00:00Z");

describe("sample data generator", () => {
  test("same seed and anchor produce byte-identical output", () => {
    const a = generateSampleLeads(SAMPLE_SEED, ANCHOR);
    const b = generateSampleLeads(SAMPLE_SEED, ANCHOR);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("different seeds differ", () => {
    const a = generateSampleLeads(SAMPLE_SEED, ANCHOR);
    const b = generateSampleLeads(SAMPLE_SEED + 1, ANCHOR);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  test("produces roughly 6k leads across 5 campaigns within the 30-day window", () => {
    const rows = generateSampleLeads(SAMPLE_SEED, ANCHOR);
    expect(rows.length).toBeGreaterThan(4500);
    expect(rows.length).toBeLessThan(8000);

    const campaigns = new Set(rows.map((r) => r.campaign));
    expect(campaigns.size).toBe(5);

    const start = ANCHOR.getTime() - 30 * 86_400_000;
    for (const r of rows) {
      expect(r.createdAt.getTime()).toBeGreaterThanOrEqual(start);
      expect(r.createdAt.getTime()).toBeLessThanOrEqual(ANCHOR.getTime());
    }
  });
});
