import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "ls_auth";
export const AUTH_TTL_SECONDS = 60 * 60 * 24 * 30;

const AUTH_COOKIE_VERSION = 2;
const MAX_AUTH_COOKIE_LENGTH = 1024;
const BASE64_URL = /^[A-Za-z0-9_-]+$/;

type AuthCookiePayload = {
  v: number;
  iat: number;
  exp: number;
  nonce: string;
};

function secret(): string {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s) throw new Error("AUTH_COOKIE_SECRET is not set");
  return s;
}

function passwordSecret(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD is not set");
  return password;
}

function sessionSigningKey(): Buffer {
  return createHmac("sha256", secret()).update(passwordSecret()).digest();
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", sessionSigningKey())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Creates a 30-day session bound to the current password and cookie secret. */
export function createAuthCookie(nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: AuthCookiePayload = {
    v: AUTH_COOKIE_VERSION,
    iat,
    exp: iat + AUTH_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function parsePayload(encodedPayload: string): AuthCookiePayload | null {
  if (!BASE64_URL.test(encodedPayload)) return null;

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { v, iat, exp, nonce } = payload as Partial<AuthCookiePayload>;
    if (
      v !== AUTH_COOKIE_VERSION ||
      typeof iat !== "number" ||
      typeof exp !== "number" ||
      !Number.isSafeInteger(iat) ||
      !Number.isSafeInteger(exp) ||
      iat < 0 ||
      exp - iat !== AUTH_TTL_SECONDS ||
      typeof nonce !== "string" ||
      !/^[A-Za-z0-9_-]{22}$/.test(nonce)
    ) {
      return null;
    }
    return { v, iat, exp, nonce };
  } catch {
    return null;
  }
}

export function isAuthCookieValid(
  value: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!value || value.length > MAX_AUTH_COOKIE_LENGTH) return false;

  const parts = value.split(".");
  if (
    parts.length !== 2 ||
    !BASE64_URL.test(parts[0]) ||
    !BASE64_URL.test(parts[1])
  ) {
    return false;
  }

  const [encodedPayload, signature] = parts;
  if (!safeEqual(signature, signPayload(encodedPayload))) return false;

  const payload = parsePayload(encodedPayload);
  if (!payload) return false;

  const now = Math.floor(nowMs / 1000);
  return payload.iat <= now && now < payload.exp;
}

export function isPasswordValid(password: string): boolean {
  return safeEqual(password, passwordSecret());
}
