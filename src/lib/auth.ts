import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "ls_auth";
const COOKIE_PAYLOAD = "leadsignal-v1";

function secret(): string {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s) throw new Error("AUTH_COOKIE_SECRET is not set");
  return s;
}

/** The only valid value of the auth cookie: HMAC-SHA256(secret, payload). */
export function expectedAuthCookie(): string {
  return createHmac("sha256", secret()).update(COOKIE_PAYLOAD).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function isAuthCookieValid(value: string | undefined): boolean {
  if (!value) return false;
  return safeEqual(value, expectedAuthCookie());
}

export function isPasswordValid(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD is not set");
  return safeEqual(password, expected);
}
