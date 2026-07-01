import { VALIDITY_POINTS } from "./constants";
import { DISPOSABLE_DOMAINS } from "./disposable-domains";
import { canonicalPhone, emailDomain, isEmailSyntaxValid } from "./normalize";
import type { RiskFlag, ScoreBreakdownItem } from "./types";

export interface ValidityInput {
  email: string | null;
  phone: string | null;
  isDuplicate: boolean;
  inBurst: boolean;
}

export interface SubScoreResult {
  score: number;
  items: ScoreBreakdownItem[];
  flags: RiskFlag[];
}

export function computeValidity(input: ValidityInput): SubScoreResult {
  const items: ScoreBreakdownItem[] = [];
  const flags: RiskFlag[] = [];
  let score = 0;

  const emailValid = isEmailSyntaxValid(input.email);
  if (emailValid) {
    score += VALIDITY_POINTS.emailValid;
    items.push({
      scope: "validity",
      rule: "email_syntax",
      detail: `valid email (+${VALIDITY_POINTS.emailValid})`,
      points: VALIDITY_POINTS.emailValid,
    });
    const disposable = DISPOSABLE_DOMAINS.has(emailDomain(input.email!));
    if (disposable) {
      flags.push("disposable_email");
      items.push({
        scope: "validity",
        rule: "email_domain",
        detail: `disposable domain ${emailDomain(input.email!)} (+0)`,
        points: 0,
      });
    } else {
      score += VALIDITY_POINTS.nonDisposable;
      items.push({
        scope: "validity",
        rule: "email_domain",
        detail: `reputable domain (+${VALIDITY_POINTS.nonDisposable})`,
        points: VALIDITY_POINTS.nonDisposable,
      });
    }
  } else {
    flags.push("invalid_email");
    items.push({
      scope: "validity",
      rule: "email_syntax",
      detail: input.email ? "unparseable email (+0)" : "no email provided (+0)",
      points: 0,
    });
  }

  const phoneValid = canonicalPhone(input.phone) !== null;
  if (phoneValid) {
    score += VALIDITY_POINTS.phoneValid;
    items.push({
      scope: "validity",
      rule: "phone",
      detail: `valid phone (+${VALIDITY_POINTS.phoneValid})`,
      points: VALIDITY_POINTS.phoneValid,
    });
  } else {
    flags.push("invalid_phone");
    items.push({
      scope: "validity",
      rule: "phone",
      detail: input.phone ? "invalid phone (+0)" : "no phone provided (+0)",
      points: 0,
    });
  }

  if (input.isDuplicate) {
    flags.push("duplicate");
    items.push({
      scope: "validity",
      rule: "duplicate",
      detail: "duplicate of an earlier lead (+0)",
      points: 0,
    });
  } else {
    score += VALIDITY_POINTS.notDuplicate;
    items.push({
      scope: "validity",
      rule: "duplicate",
      detail: `first occurrence (+${VALIDITY_POINTS.notDuplicate})`,
      points: VALIDITY_POINTS.notDuplicate,
    });
  }

  if (input.inBurst) {
    flags.push("burst_submission");
    items.push({
      scope: "validity",
      rule: "burst",
      detail: "part of a submission burst (+0)",
      points: 0,
    });
  } else {
    score += VALIDITY_POINTS.noBurst;
    items.push({
      scope: "validity",
      rule: "burst",
      detail: `organic submission timing (+${VALIDITY_POINTS.noBurst})`,
      points: VALIDITY_POINTS.noBurst,
    });
  }

  return { score, items, flags };
}
