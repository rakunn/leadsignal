import { describe, expect, it } from "vitest";
import { safeLoginDestination } from "@/lib/auth-redirect";

const origin = "https://demo.example";

describe("safeLoginDestination", () => {
  it("keeps a local destination with its query and hash", () => {
    expect(safeLoginDestination("/datasets?view=all#top", origin)).toBe(
      "/datasets?view=all#top",
    );
  });

  it("falls back for destinations that can leave the application or loop", () => {
    for (const value of [
      "https://elsewhere.example",
      "//elsewhere.example",
      "javascript:alert(1)",
      "/\\elsewhere.example",
      "/login",
      "/login/",
      "/a/..//elsewhere.example/phish",
      "/%2e//elsewhere.example/phish",
    ]) {
      expect(safeLoginDestination(value, origin)).toBe("/datasets");
    }
  });

  it("rejects controls, credentials, and non-path values", () => {
    for (const value of ["/data\nsets", "https://user:pass@demo.example", "datasets"]) {
      expect(safeLoginDestination(value, origin)).toBe("/datasets");
    }
  });
});
