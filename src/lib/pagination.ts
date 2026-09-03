/** Normalize untrusted query input before it can become a database offset. */
export function normalizePage(
  value: string | string[] | undefined,
  totalPages: number,
): number {
  const last = Math.max(1, Math.floor(totalPages));
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  if (page < 1) return 1;
  // Infinity from an enormous positive integer also clamps to the last page.
  return Math.min(page, last);
}
