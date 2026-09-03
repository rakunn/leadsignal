import { performance } from "node:perf_hooks";
import { scoreLeads } from "@/lib/scoring/score";
import type { RawLead } from "@/lib/scoring/types";

function equalTimestampLeads(count: number): RawLead[] {
  const createdAt = new Date("2026-06-01T12:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    createdAt,
    email: `bench${i}@example.com`,
    phone: null,
    campaign: "Burst benchmark",
    adSet: "bench",
    creative: "bench",
    platform: "Meta",
    landingPage: "lp-bench",
    costCents: 100,
    emailOpened: false,
    emailClicked: false,
    smsClicked: false,
    converted: false,
    revenueCents: 0,
  }));
}

function distinctSourceLeads(count: number): RawLead[] {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date("2026-06-01T12:00:00Z"),
    email: `value-bench${i}@example.com`,
    phone: null,
    campaign: `Campaign ${i}`,
    adSet: "bench",
    creative: "bench",
    platform: "Meta",
    landingPage: null,
    costCents: 100,
    emailOpened: false,
    emailClicked: false,
    smsClicked: false,
    converted: false,
    revenueCents: i,
  }));
}

for (const count of [4_000, 8_000, 16_000, 25_000]) {
  const startedAt = performance.now();
  scoreLeads(equalTimestampLeads(count));
  console.log(`${count} equal-timestamp rows: ${(performance.now() - startedAt).toFixed(1)}ms`);
}

for (const count of [4_000, 8_000, 16_000, 25_000]) {
  const startedAt = performance.now();
  scoreLeads(distinctSourceLeads(count));
  console.log(`${count} distinct-source rows: ${(performance.now() - startedAt).toFixed(1)}ms`);
}
