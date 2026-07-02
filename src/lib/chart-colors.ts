/**
 * Chart data-ink palettes — validated with the dataviz skill's
 * validate_palette.js against the light surface (#fcfcfb):
 * all checks PASS (lightness band, chroma floor, CVD ΔE, contrast).
 * UI chrome tokens (globals.css) are deliberately NOT reused as data ink —
 * they fail the chart lightness/chroma bands.
 */

/** Raw vs qualified CPL pair (CVD ΔE 78). Qualified carries the brand teal. */
export const RAW_COLOR = "#B5791F";
export const QUALIFIED_COLOR = "#0891B2";

/** Fixed categorical order for series (campaigns etc.) — never cycled. */
export const CATEGORICAL = [
  "#0891B2",
  "#C25A1F",
  "#6D5BD0",
  "#9A8112",
  "#C2367B",
] as const;

/** Entities beyond the fixed slots fold into "Other" (never a generated hue). */
export const OTHER_COLOR = "#8A8F94";

/**
 * Segment mix — status role (quality states), not categorical: always rendered
 * with % labels + legend, never color alone. Muted "test" is deliberate.
 */
export const SEGMENT_COLORS: Record<string, string> = {
  high_value: "#1E9160",
  nurture: "#3E8FBF",
  test: "#A8A29E",
  review: "#E0A22E",
  suppress: "#CC4141",
};

/** Stable color assignment: sort entity names, then map to fixed slots. */
export function assignSeriesColors(names: string[]): Map<string, string> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  sorted.forEach((name, i) => {
    map.set(name, i < CATEGORICAL.length ? CATEGORICAL[i] : OTHER_COLOR);
  });
  return map;
}
