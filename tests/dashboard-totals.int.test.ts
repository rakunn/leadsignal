import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createDatasetFixture } from "./helpers/database";
import type { LeadInsertRow } from "@/lib/ingest/parse";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {} }),
  usePathname: () => "/datasets/test/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

function row(costCents: number, creative: string | null): LeadInsertRow {
  return { leadExternalId: null, createdAt: new Date("2026-09-03T00:00:00Z"),
    campaign: "X", email: null, phone: null, adSet: null, creative, platform: null,
    landingPage: null, costCents, revenueCents: 0, emailOpened: false,
    emailClicked: false, smsClicked: false, converted: false };
}

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("dashboard coverage", () => {
  test.each([null, "Creative A"])("keeps complete KPIs and controls when creative coverage is %s", async (creative) => {
    const fixture = await createDatasetFixture([row(1000, creative), row(2000, null)]);
    try {
      const { rollupTotalsByValue } = await import("@/lib/queries");
      const { sumTotals } = await import("@/lib/metrics");
      expect(sumTotals(await rollupTotalsByValue(fixture.datasetId, "campaign")).spendCents).toBe(3000);
      expect(sumTotals(await rollupTotalsByValue(fixture.datasetId, "creative")).spendCents).toBe(creative ? 1000 : 0);
      const { default: Page } = await import("@/app/(app)/datasets/[id]/dashboard/page");
      for (const dim of ["campaign", "creative", "ad_set", "platform", "landing_page"]) {
        const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: fixture.datasetId }), searchParams: Promise.resolve({ dim }) }));
        expect(html).toContain("$30.00");
        expect(html).toContain("2 leads ingested");
        expect(html).toContain(">Creatives</button>");
        if (dim === "creative") expect(html).toContain(creative ? "1 lead" : "No creative values");
        expect(html).not.toContain("may still be processing");
      }
    } finally { await fixture.cleanup(); }
  });
});
