import { FLAG_THRESHOLDS } from "./constants";

export function medianCents(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function isHighCostLowQuality(
  costCents: number,
  medianCostCents: number,
  compositeScore: number,
): boolean {
  return (
    medianCostCents > 0 &&
    costCents > FLAG_THRESHOLDS.highCostMedianMultiple * medianCostCents &&
    compositeScore < FLAG_THRESHOLDS.highCostCompositeBelow
  );
}
