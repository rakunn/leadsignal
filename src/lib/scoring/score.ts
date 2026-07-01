import {
  BURST,
  COMPOSITE_CAPS,
  SEGMENT_THRESHOLDS,
  WEIGHTS,
} from "./constants";
import { isHighCostLowQuality, medianCents } from "./flags";
import { computeIntent } from "./intent";
import { canonicalEmail, canonicalPhone } from "./normalize";
import { computeProbabilities } from "./probability";
import type {
  LeadScore,
  LeadSegment,
  RawLead,
  RiskFlag,
  ScoreBreakdownItem,
} from "./types";
import { computeValidity } from "./validity";
import { buildValueNorms, computeValue } from "./value";

interface DuplicateInfo {
  isDuplicate: boolean;
  duplicateOfIndex: number | null;
}

/** Earliest occurrence (by createdAt) of each canonical email/phone wins. */
function detectDuplicates(leads: RawLead[]): DuplicateInfo[] {
  const result: DuplicateInfo[] = leads.map(() => ({
    isDuplicate: false,
    duplicateOfIndex: null,
  }));
  const order = leads
    .map((_, i) => i)
    .sort(
      (a, b) =>
        leads[a].createdAt.getTime() - leads[b].createdAt.getTime() || a - b,
    );

  const byEmail = new Map<string, number>();
  const byPhone = new Map<string, number>();

  for (const i of order) {
    const email = canonicalEmail(leads[i].email);
    const phone = canonicalPhone(leads[i].phone);
    const emailHit = email !== undefined && email !== null ? byEmail.get(email) : undefined;
    const phoneHit = phone ? byPhone.get(phone) : undefined;
    const original = emailHit ?? phoneHit;

    if (original !== undefined) {
      result[i] = { isDuplicate: true, duplicateOfIndex: original };
      continue;
    }
    if (email) byEmail.set(email, i);
    if (phone) byPhone.set(phone, i);
  }

  return result;
}

/** Indices of leads that share a landing page with ≥ minLeads within the window. */
function detectBursts(leads: RawLead[]): Set<number> {
  const flagged = new Set<number>();
  const byLandingPage = new Map<string, number[]>();

  leads.forEach((lead, i) => {
    if (!lead.landingPage) return;
    const arr = byLandingPage.get(lead.landingPage) ?? [];
    arr.push(i);
    byLandingPage.set(lead.landingPage, arr);
  });

  for (const indices of byLandingPage.values()) {
    const sorted = [...indices].sort(
      (a, b) => leads[a].createdAt.getTime() - leads[b].createdAt.getTime(),
    );
    let lo = 0;
    for (let hi = 0; hi < sorted.length; hi++) {
      while (
        leads[sorted[hi]].createdAt.getTime() -
          leads[sorted[lo]].createdAt.getTime() >
        BURST.windowSeconds * 1000
      ) {
        lo++;
      }
      if (hi - lo + 1 >= BURST.minLeads) {
        for (let k = lo; k <= hi; k++) flagged.add(sorted[k]);
      }
    }
  }

  return flagged;
}

function assignSegment(input: {
  compositeScore: number;
  validityScore: number;
  intentScore: number;
  conversionProbability: number;
  isDuplicate: boolean;
  flags: RiskFlag[];
}): LeadSegment {
  const t = SEGMENT_THRESHOLDS;
  const {
    compositeScore,
    validityScore,
    intentScore,
    conversionProbability,
    isDuplicate,
    flags,
  } = input;

  if (
    isDuplicate ||
    validityScore < t.suppressValidityBelow ||
    compositeScore < t.suppressCompositeBelow
  ) {
    return "suppress";
  }

  const oneContactInvalid =
    flags.includes("invalid_email") !== flags.includes("invalid_phone");
  if (
    flags.includes("burst_submission") ||
    (oneContactInvalid && intentScore >= t.reviewMinIntent)
  ) {
    return "review";
  }

  if (
    compositeScore >= t.highValueCompositeMin &&
    conversionProbability >= t.highValueProbabilityMin
  ) {
    return "high_value";
  }
  if (compositeScore >= t.nurtureCompositeMin) return "nurture";
  return "test";
}

/**
 * Score a batch of leads deterministically. Index-aligned with the input.
 *
 * Two passes: (1) dataset-level context — duplicates, submission bursts,
 * source-value norms, cost median, observed conversion rate; then
 * (2) per-lead sub-scores → composite (with hard caps) → calibrated
 * probability → segment → risk flags, with a line-item breakdown receipt.
 */
export function scoreLeads(leadsIn: RawLead[]): LeadScore[] {
  if (leadsIn.length === 0) return [];

  const duplicates = detectDuplicates(leadsIn);
  const burstSet = detectBursts(leadsIn);
  const norms = buildValueNorms(leadsIn);
  const median = medianCents(leadsIn.map((l) => l.costCents));
  const observedRate =
    leadsIn.filter((l) => l.converted).length / leadsIn.length;

  const partials = leadsIn.map((lead, i) => {
    const validity = computeValidity({
      email: lead.email,
      phone: lead.phone,
      isDuplicate: duplicates[i].isDuplicate,
      inBurst: burstSet.has(i),
    });
    const intent = computeIntent(lead);
    const value = computeValue(lead, norms);

    const breakdown: ScoreBreakdownItem[] = [
      ...validity.items,
      ...intent.items,
      ...value.items,
    ];
    const flags: RiskFlag[] = [
      ...validity.flags,
      ...intent.flags,
      ...value.flags,
    ];

    let composite = Math.round(
      WEIGHTS.validity * validity.score +
        WEIGHTS.intent * intent.score +
        WEIGHTS.value * value.score,
    );

    if (duplicates[i].isDuplicate && composite > COMPOSITE_CAPS.duplicate) {
      composite = COMPOSITE_CAPS.duplicate;
      breakdown.push({
        scope: "composite",
        rule: "cap_duplicate",
        detail: `duplicate lead — capped at ${COMPOSITE_CAPS.duplicate}`,
        points: 0,
      });
    }
    if (
      flags.includes("invalid_email") &&
      flags.includes("invalid_phone") &&
      composite > COMPOSITE_CAPS.bothContactsInvalid
    ) {
      composite = COMPOSITE_CAPS.bothContactsInvalid;
      breakdown.push({
        scope: "composite",
        rule: "cap_unreachable",
        detail: `no valid contact channel — capped at ${COMPOSITE_CAPS.bothContactsInvalid}`,
        points: 0,
      });
    }

    return {
      validityScore: validity.score,
      intentScore: intent.score,
      valueScore: value.score,
      compositeScore: composite,
      flags,
      breakdown,
    };
  });

  const probabilities = computeProbabilities(
    partials.map((p) => ({
      validity: p.validityScore,
      intent: p.intentScore,
      value: p.valueScore,
    })),
    observedRate,
  );

  return partials.map((p, i) => {
    const flags = [...p.flags];
    if (isHighCostLowQuality(leadsIn[i].costCents, median, p.compositeScore)) {
      flags.push("high_cost_low_quality");
    }
    const segment = assignSegment({
      compositeScore: p.compositeScore,
      validityScore: p.validityScore,
      intentScore: p.intentScore,
      conversionProbability: probabilities[i],
      isDuplicate: duplicates[i].isDuplicate,
      flags,
    });
    return {
      validityScore: p.validityScore,
      intentScore: p.intentScore,
      valueScore: p.valueScore,
      compositeScore: p.compositeScore,
      conversionProbability: probabilities[i],
      segment,
      riskFlags: flags,
      breakdown: p.breakdown,
      isDuplicate: duplicates[i].isDuplicate,
      duplicateOfIndex: duplicates[i].duplicateOfIndex,
    };
  });
}
