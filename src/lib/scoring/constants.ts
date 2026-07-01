import type { LeadSegment } from "./types";

/**
 * Single source of truth for every scoring number in LeadSignal.
 * The scorer, rollups, synthetic-data generator, tests, and analyst prompts
 * all import from here — change weights here and the story test will tell you
 * if the demo narrative broke.
 */
export const SCORING_VERSION = "2026-07-v1";

export const WEIGHTS = {
  validity: 0.4,
  intent: 0.35,
  value: 0.25,
} as const;

export const VALIDITY_POINTS = {
  emailValid: 35,
  nonDisposable: 15,
  phoneValid: 25,
  notDuplicate: 15,
  noBurst: 10,
} as const;

export const INTENT_POINTS = {
  emailOpened: 30,
  emailClicked: 40,
  smsClicked: 30,
} as const;

/** Blend of source-level expected revenue used for the value sub-score. */
export const VALUE_BLEND = {
  campaign: 0.7,
  landingPage: 0.3,
} as const;

export const COMPOSITE_CAPS = {
  duplicate: 15,
  bothContactsInvalid: 20,
} as const;

/** Hand-set logistic coefficients; intercept is Platt-shifted per dataset. */
export const LOGISTIC = {
  b0: -3.2,
  validity: 1.2,
  intent: 2.8,
  value: 1.4,
  /** Observed conversion rate is clamped into this range before logit(). */
  minRate: 0.005,
  maxRate: 0.95,
} as const;

export const BURST = {
  windowSeconds: 120,
  minLeads: 5,
} as const;

export const SEGMENT_THRESHOLDS = {
  suppressValidityBelow: 40,
  suppressCompositeBelow: 25,
  highValueCompositeMin: 75,
  highValueProbabilityMin: 0.25,
  nurtureCompositeMin: 50,
  testCompositeMin: 25,
  /** "decent engagement" bar for the review segment. */
  reviewMinIntent: 30,
} as const;

export const FLAG_THRESHOLDS = {
  lowValueSourceBelow: 20,
  highCostMedianMultiple: 2,
  highCostCompositeBelow: 40,
} as const;

/**
 * THE definition the whole product hangs on:
 * a high-quality (HQ) lead, and qualified CPL = spend ÷ HQ leads.
 */
export const HQ_COMPOSITE_MIN = 70;

export function isHighQuality(
  compositeScore: number,
  segment: LeadSegment,
): boolean {
  return compositeScore >= HQ_COMPOSITE_MIN && segment !== "suppress";
}

/** Qualified CPL in cents; null when there are no HQ leads (undefined ratio). */
export function qualifiedCplCents(
  spendCents: number,
  hqLeadCount: number,
): number | null {
  if (hqLeadCount <= 0) return null;
  return Math.round(spendCents / hqLeadCount);
}
