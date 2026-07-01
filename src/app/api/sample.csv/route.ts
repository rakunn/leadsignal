import Papa from "papaparse";
import { CSV_COLUMNS } from "@/lib/ingest/columns";
import {
  defaultAnchor,
  generateSampleLeads,
  SAMPLE_SEED,
} from "@/lib/sample-data/generate";

export const dynamic = "force-dynamic";

/** The sample dataset as a downloadable CSV — same rows the sample button loads. */
export async function GET() {
  const rows = generateSampleLeads(SAMPLE_SEED, defaultAnchor());

  const csv = Papa.unparse(
    {
      fields: [...CSV_COLUMNS],
      data: rows.map((r) => [
        r.leadExternalId,
        r.createdAt.toISOString(),
        r.email ?? "",
        r.phone ?? "",
        r.campaign,
        r.adSet ?? "",
        r.creative ?? "",
        r.platform ?? "",
        r.landingPage ?? "",
        (r.costCents / 100).toFixed(2),
        r.emailOpened ? "1" : "0",
        r.emailClicked ? "1" : "0",
        r.smsClicked ? "1" : "0",
        r.converted ? "1" : "0",
        (r.revenueCents / 100).toFixed(2),
      ]),
    },
    { newline: "\n" },
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leadsignal-sample.csv"',
    },
  });
}
