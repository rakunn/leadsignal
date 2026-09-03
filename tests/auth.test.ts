import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_TTL_SECONDS,
  createAuthCookie,
  isAuthCookieValid,
} from "@/lib/auth";

const now = Date.parse("2026-09-03T00:00:00Z");

afterEach(() => {
  vi.unstubAllEnvs();
});

function configureSecrets() {
  vi.stubEnv("APP_PASSWORD", "test-demo-password");
  vi.stubEnv("AUTH_COOKIE_SECRET", "test-cookie-secret");
}

function signedCookie(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = createHmac("sha256", "test-cookie-secret")
    .update("test-demo-password")
    .digest();
  const signature = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

describe("authentication cookies", () => {
  it("accepts a newly issued cookie before its expiry and rejects it at expiry", () => {
    configureSecrets();
    const token = createAuthCookie(now);

    expect(isAuthCookieValid(token, now)).toBe(true);
    expect(isAuthCookieValid(token, now + AUTH_TTL_SECONDS * 1000)).toBe(false);
  });

  it("rejects missing, tampered, truncated, and overlong cookies", () => {
    configureSecrets();
    const token = createAuthCookie(now);

    expect(isAuthCookieValid(undefined, now)).toBe(false);
    expect(isAuthCookieValid(`${token}x`, now)).toBe(false);
    expect(isAuthCookieValid(token.slice(0, -1), now)).toBe(false);
    expect(isAuthCookieValid("x".repeat(1025), now)).toBe(false);
  });

  it("rejects signed cookies with an unsupported version or future issue time", () => {
    configureSecrets();
    const iat = Math.floor(now / 1000);

    expect(
      isAuthCookieValid(
        signedCookie({
          v: 1,
          iat,
          exp: iat + AUTH_TTL_SECONDS,
          nonce: "Qe9dqi6H8tzLkLkjpYodZA",
        }),
        now,
      ),
    ).toBe(false);
    expect(
      isAuthCookieValid(
        signedCookie({
          v: 2,
          iat: iat + 1,
          exp: iat + AUTH_TTL_SECONDS + 1,
          nonce: "Qe9dqi6H8tzLkLkjpYodZA",
        }),
        now,
      ),
    ).toBe(false);
  });

  it("invalidates existing cookies after password or signing-secret rotation", () => {
    configureSecrets();
    const token = createAuthCookie(now);

    vi.stubEnv("APP_PASSWORD", "rotated-test-password");
    expect(isAuthCookieValid(token, now)).toBe(false);

    configureSecrets();
    vi.stubEnv("AUTH_COOKIE_SECRET", "rotated-cookie-secret");
    expect(isAuthCookieValid(token, now)).toBe(false);
  });

  it("issues distinct valid cookies for separate sign-ins", () => {
    configureSecrets();
    const first = createAuthCookie(now);
    const second = createAuthCookie(now);

    expect(first).not.toBe(second);
    expect(isAuthCookieValid(first, now)).toBe(true);
    expect(isAuthCookieValid(second, now)).toBe(true);
  });
});
