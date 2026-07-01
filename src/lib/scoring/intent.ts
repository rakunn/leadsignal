import { INTENT_POINTS } from "./constants";
import type { SubScoreResult } from "./validity";

export interface IntentInput {
  emailOpened: boolean;
  emailClicked: boolean;
  smsClicked: boolean;
}

export function computeIntent(input: IntentInput): SubScoreResult {
  const items: SubScoreResult["items"] = [];
  let score = 0;

  const signals: Array<[keyof IntentInput, string, number]> = [
    ["emailOpened", "opened email", INTENT_POINTS.emailOpened],
    ["emailClicked", "clicked email", INTENT_POINTS.emailClicked],
    ["smsClicked", "clicked SMS", INTENT_POINTS.smsClicked],
  ];

  for (const [key, label, points] of signals) {
    if (input[key]) {
      score += points;
      items.push({
        scope: "intent",
        rule: key,
        detail: `${label} (+${points})`,
        points,
      });
    } else {
      items.push({
        scope: "intent",
        rule: key,
        detail: `never ${label} (+0)`,
        points: 0,
      });
    }
  }

  const flags: SubScoreResult["flags"] = score === 0 ? ["no_engagement"] : [];
  return { score, items, flags };
}
