const MAX_INTEGER_CENTS = 2_147_483_647;
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/** Convert an optional plain decimal amount into an exact integer-cent value. */
export function parseMoneyCents(value: string | undefined): number {
  const normalized = value?.trim();
  if (!normalized) return 0;
  if (normalized.length > 32 || !MONEY_PATTERN.test(normalized)) {
    throw new Error("Invalid monetary value.");
  }

  const [whole, decimal = ""] = normalized.split(".");
  const wholeDigits = whole.replace(/^0+/, "") || "0";
  if (wholeDigits.length > 8) {
    throw new Error("Invalid monetary value.");
  }
  const cents = Number(wholeDigits) * 100 + Number(decimal.padEnd(2, "0"));
  if (cents > MAX_INTEGER_CENTS) {
    throw new Error("Invalid monetary value.");
  }
  return cents;
}
