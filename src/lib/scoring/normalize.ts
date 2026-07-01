import { parsePhoneNumberFromString } from "libphonenumber-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

export function isEmailSyntaxValid(email: string | null): boolean {
  return !!email && EMAIL_RE.test(email.trim());
}

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/**
 * Canonical identity for duplicate detection: lowercase, plus-tag stripped,
 * and (for gmail) dots removed from the local part. Null when invalid.
 */
export function canonicalEmail(email: string | null): string | null {
  if (!isEmailSyntaxValid(email)) return null;
  const trimmed = email!.trim().toLowerCase();
  const [rawLocal, domain] = trimmed.split("@");
  let local = rawLocal.split("+")[0];
  if (GMAIL_DOMAINS.has(domain)) local = local.replaceAll(".", "");
  if (!local) return null;
  return `${local}@${domain}`;
}

/** E.164 form when the phone is valid (US fallback country), else null. */
export function canonicalPhone(phone: string | null): string | null {
  if (!phone?.trim()) return null;
  const parsed = parsePhoneNumberFromString(phone.trim(), "US");
  return parsed?.isValid() ? parsed.number : null;
}
