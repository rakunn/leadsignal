const intFmt = new Intl.NumberFormat("en-US");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function fmtInt(n: number): string {
  return intFmt.format(n);
}

export function fmtUsdFromCents(cents: number): string {
  return usdFmt.format(cents / 100);
}

export function fmtPct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function timeAgo(date: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
