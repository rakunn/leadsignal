import { describe, expect, test } from "vitest";
import {
  canonicalEmail,
  isEmailSyntaxValid,
} from "@/lib/scoring/normalize";

describe("email normalization", () => {
  test("rejects input whose trimmed length exceeds the email limit", () => {
    expect(isEmailSyntaxValid(`${"a".repeat(245)}@example.com`)).toBe(false);
    expect(isEmailSyntaxValid(` ${"a".repeat(245)}@example.com `)).toBe(false);
  });

  test("rejects malformed domains and malformed at-sign structure", () => {
    for (const email of [
      "anna@example.",
      "anna@example.c",
      "anna @example.com",
      "anna@@example.com",
      "annaexample.com",
      `a@${".".repeat(8000)}@`,
    ]) {
      expect(isEmailSyntaxValid(email)).toBe(false);
    }
  });

  test("retains existing short-address validation and Gmail canonicalization", () => {
    expect(isEmailSyntaxValid("  anna.b+promo@gmail.com ")).toBe(true);
    expect(canonicalEmail("Anna.B+promo@gmail.com")).toBe("annab@gmail.com");
    expect(canonicalEmail(null)).toBeNull();
  });
});
