import { LOGISTIC } from "./constants";

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export interface SubScores {
  validity: number;
  intent: number;
  value: number;
}

export function rawZ(s: SubScores): number {
  return (
    LOGISTIC.b0 +
    LOGISTIC.validity * (s.validity / 100) +
    LOGISTIC.intent * (s.intent / 100) +
    LOGISTIC.value * (s.value / 100)
  );
}

/**
 * Calibrated conversion probabilities: a hand-set logistic over the
 * transparent sub-scores, with a Platt-style intercept shift solved (by
 * bisection — mean is monotonic in the shift) so the dataset's mean predicted
 * probability equals its observed conversion rate.
 */
export function computeProbabilities(
  subs: SubScores[],
  observedConversionRate: number,
): number[] {
  if (subs.length === 0) return [];
  const zs = subs.map(rawZ);
  const target = Math.min(
    LOGISTIC.maxRate,
    Math.max(LOGISTIC.minRate, observedConversionRate),
  );

  const meanAt = (shift: number) =>
    zs.reduce((acc, z) => acc + sigmoid(z + shift), 0) / zs.length;

  let lo = -15;
  let hi = 15;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (meanAt(mid) < target) lo = mid;
    else hi = mid;
  }
  const shift = (lo + hi) / 2;

  return zs.map((z) => Number(sigmoid(z + shift).toFixed(4)));
}
