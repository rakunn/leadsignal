import { parsePhoneNumberFromString } from "libphonenumber-js";

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** RFC 5321's maximum mailbox length, enforced before syntax inspection. */
export const MAX_EMAIL_LENGTH = 254;

export function isEmailSyntaxValid(email: string | null): boolean {
  if (!email) return false;

  const trimmed = email.trim();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return false;

  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return false;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (!local || !domain || /\s/.test(trimmed)) return false;

  const finalDot = domain.lastIndexOf(".");
  return finalDot > 0 && domain.length - finalDot - 1 >= 2;
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
