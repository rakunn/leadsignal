/**
 * Campaign archetypes for the synthetic dataset. THE DEMO STORY LIVES HERE:
 * tune these knobs and `tests/story.test.ts` will tell you if the pitch
 * numbers (raw vs qualified CPL inversion, lp-v4 quality drop) still hold.
 */

export interface LandingPageConfig {
  id: string;
  /** Relative weight among landing pages active that day. */
  share: number;
  /** Inclusive day window (0–29); defaults to the whole range. */
  fromDay?: number;
  toDay?: number;
  /** Multiplies open/click/sms rates for traffic on this page. */
  engagementFactor?: number;
  /** Multiplies disposable/invalid/missing identity rates. */
  invalidFactor?: number;
}

export interface BurstConfig {
  day: number;
  size: number;
  landingPage: string;
}

export interface CampaignConfig {
  name: string;
  platform: string;
  adSets: string[];
  creatives: string[];
  dailyBase: number;
  weekendFactor: number;
  costMeanCents: number;
  costStdCents: number;
  duplicateRate: number;
  disposableRate: number;
  invalidPhoneRate: number;
  missingEmailRate: number;
  openRate: number;
  clickGivenOpen: number;
  smsRate: number;
  convGivenEngaged: number;
  revMeanCents: number;
  revStdCents: number;
  landingPages: LandingPageConfig[];
  bursts: BurstConfig[];
}

export const DAYS = 30;

export const CAMPAIGNS: Record<string, CampaignConfig> = {
  broad: {
    name: "Broad Awareness — Instant Forms",
    platform: "Meta",
    adSets: ["broad-lookalike-1", "broad-interest-2"],
    creatives: ["cr-12-carousel", "cr-13-video", "cr-14-static"],
    dailyBase: 80,
    weekendFactor: 1.1,
    costMeanCents: 118,
    costStdCents: 22,
    duplicateRate: 0.22,
    disposableRate: 0.12,
    invalidPhoneRate: 0.15,
    missingEmailRate: 0.06,
    openRate: 0.45,
    clickGivenOpen: 0.55,
    smsRate: 0.05,
    convGivenEngaged: 0.16,
    revMeanCents: 4200,
    revStdCents: 1100,
    landingPages: [
      { id: "lp-instant-a", share: 0.6 },
      { id: "lp-instant-b", share: 0.4, engagementFactor: 0.85 },
    ],
    bursts: [
      { day: 5, size: 15, landingPage: "lp-instant-a" },
      { day: 12, size: 18, landingPage: "lp-instant-a" },
      { day: 22, size: 15, landingPage: "lp-instant-b" },
    ],
  },
  search: {
    name: "Search — High Intent",
    platform: "Google",
    adSets: ["search-brand", "search-nonbrand"],
    creatives: ["cr-7-rsa", "cr-8-rsa"],
    dailyBase: 50,
    weekendFactor: 0.8,
    costMeanCents: 210,
    costStdCents: 30,
    duplicateRate: 0.04,
    disposableRate: 0.02,
    invalidPhoneRate: 0.04,
    missingEmailRate: 0.02,
    openRate: 0.58,
    clickGivenOpen: 0.48,
    smsRate: 0.1,
    convGivenEngaged: 0.22,
    revMeanCents: 5200,
    revStdCents: 1400,
    landingPages: [
      { id: "lp-search-v2", share: 1, toDay: 17 },
      { id: "lp-search-v2", share: 0.15, fromDay: 18 },
      {
        id: "lp-search-v4",
        share: 0.85,
        fromDay: 18,
        engagementFactor: 0.5,
        invalidFactor: 2.2,
      },
    ],
    bursts: [],
  },
  retargeting: {
    name: "Retargeting — Webinar",
    platform: "TikTok",
    adSets: ["rt-30d-visitors", "rt-cart"],
    creatives: ["cr-3-testimonial", "cr-4-demo", "cr-5-countdown"],
    dailyBase: 30,
    weekendFactor: 0.95,
    costMeanCents: 268,
    costStdCents: 35,
    duplicateRate: 0.03,
    disposableRate: 0.01,
    invalidPhoneRate: 0.03,
    missingEmailRate: 0.01,
    openRate: 0.5,
    clickGivenOpen: 0.55,
    smsRate: 0.18,
    convGivenEngaged: 0.3,
    revMeanCents: 8800,
    revStdCents: 2500,
    landingPages: [
      { id: "lp-webinar-reg", share: 0.7 },
      { id: "lp-webinar-replay", share: 0.3, engagementFactor: 1.05 },
    ],
    bursts: [],
  },
  newsletter: {
    name: "Newsletter Signups",
    platform: "Meta",
    adSets: ["nl-broad"],
    creatives: ["cr-20-static", "cr-21-carousel"],
    dailyBase: 23,
    weekendFactor: 1.0,
    costMeanCents: 160,
    costStdCents: 25,
    duplicateRate: 0.06,
    disposableRate: 0.04,
    invalidPhoneRate: 0.06,
    missingEmailRate: 0.03,
    openRate: 0.5,
    clickGivenOpen: 0.6,
    smsRate: 0.05,
    convGivenEngaged: 0.18,
    revMeanCents: 5000,
    revStdCents: 1200,
    landingPages: [
      { id: "lp-newsletter", share: 0.75 },
      { id: "lp-newsletter-b", share: 0.25, engagementFactor: 0.9 },
    ],
    bursts: [],
  },
  quiz: {
    name: "Quiz Funnel — Gadget Giveaway",
    platform: "TikTok",
    adSets: ["quiz-broad-18-34"],
    creatives: ["cr-30-quiz", "cr-31-quiz"],
    dailyBase: 17,
    weekendFactor: 1.2,
    costMeanCents: 140,
    costStdCents: 30,
    duplicateRate: 0.08,
    disposableRate: 0.06,
    invalidPhoneRate: 0.08,
    missingEmailRate: 0.04,
    openRate: 0.22,
    clickGivenOpen: 0.3,
    smsRate: 0.04,
    convGivenEngaged: 0.05,
    revMeanCents: 2400,
    revStdCents: 700,
    landingPages: [
      { id: "lp-quiz-1", share: 0.5 },
      { id: "lp-quiz-2", share: 0.5, engagementFactor: 0.9 },
    ],
    bursts: [],
  },
};
