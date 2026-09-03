import { describe, expect, it } from "vitest";
import { CsvContractError, parseCsvLeads } from "@/lib/ingest/parse";

describe("CSV structural contract", () => {
  it("rejects an extra unquoted field instead of shifting later values", () => {
    expect(() =>
      parseCsvLeads(
        "created_at,campaign,cost,revenue\n2026-06-01,Spring,1,234.50,500",
      ),
    ).toThrow(CsvContractError);
  });

  it("rejects an unfinished quoted field", () => {
    expect(() =>
      parseCsvLeads('created_at,campaign\n2026-06-01,"unfinished'),
    ).toThrow(/record 2/i);
  });

  it("rejects rows with too few fields", () => {
    expect(() =>
      parseCsvLeads("created_at,campaign,cost\n2026-06-01"),
    ).toThrow(CsvContractError);
  });

  it("rejects duplicate headers after trimming and lowercasing", () => {
    expect(() =>
      parseCsvLeads(
        "created_at, campaign, CAMPAIGN\n2026-06-01,Spring,Duplicate",
      ),
    ).toThrow(/record 1/i);
  });

  it("accepts a UTF-8 BOM, CRLF rows, and quoted commas or newlines", () => {
    const parsed = parseCsvLeads(
      "\uFEFFcreated_at,campaign,creative\r\n2026-06-01,Spring,\"A, B\"\r\n2026-06-02,Summer,\"Two\nlines\"",
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.creative).toBe("A, B");
    expect(parsed.rows[1]?.creative).toBe("Two\nlines");
  });

  it("keeps row-level date and campaign validation for structurally valid files", () => {
    const parsed = parseCsvLeads(
      "created_at,campaign\nnot-a-date,Spring\n2026-06-01,",
    );

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.skipped).toBe(2);
  });
});
