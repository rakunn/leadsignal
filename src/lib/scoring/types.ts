export type SubScoreKind = "validity" | "intent" | "value";

/** One line of the transparent scoring receipt shown in the UI and cited by the analyst. */
export interface ScoreBreakdownItem {
  /** Which sub-score this rule contributes to, or "composite" for caps. */
  scope: SubScoreKind | "composite";
  rule: string;
  /** Human-readable outcome, e.g. "valid US mobile (+25)" */
  detail: string;
  points: number;
}

export interface LeadScore {
  validityScore: number;
  intentScore: number;
  valueScore: number;
  compositeScore: number;
  conversionProbability: number;
  segment: LeadSegment;
  riskFlags: RiskFlag[];
  breakdown: ScoreBreakdownItem[];
  isDuplicate: boolean;
  /** Index (within the scored batch) of the first occurrence this duplicates. */
  duplicateOfIndex: number | null;
}

export type LeadSegment =
  | "high_value"
  | "nurture"
  | "test"
  | "suppress"
  | "review";

export type RiskFlag =
  | "invalid_email"
  | "disposable_email"
  | "invalid_phone"
  | "duplicate"
  | "burst_submission"
  | "no_engagement"
  | "low_value_source"
  | "high_cost_low_quality";

/** The raw lead fields the scorer consumes (schema-independent, pure data). */
export interface RawLead {
  createdAt: Date;
  email: string | null;
  phone: string | null;
  campaign: string;
  adSet: string | null;
  creative: string | null;
  platform: string | null;
  landingPage: string | null;
  costCents: number;
  emailOpened: boolean;
  emailClicked: boolean;
  smsClicked: boolean;
  converted: boolean;
  revenueCents: number;
}
