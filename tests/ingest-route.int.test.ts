import { describe, expect, test } from "vitest";
import { assertTestDatabase } from "./helpers/database";

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("upload validation feedback", () => {
  test("returns bounded correction details when valid rows are accepted", async () => {
    assertTestDatabase();
    const [{ POST }, { db }, { datasets }, { eq }] = await Promise.all([
      import("@/app/api/datasets/route"), import("@/db"), import("@/db/schema"), import("drizzle-orm"),
    ]);
    const csv = "created_at,campaign,cost\n2026-09-01,Valid,1.00\n" + "2026-09-01,Invalid,12oops\n".repeat(6);
    const body = new FormData();
    body.append("file", new File([csv], "mixed-validation.csv"));
    const response = await POST(new Request("http://localhost/api/datasets", { method: "POST", body }));
    const result = await response.json();
    try {
      expect(response.status).toBe(200);
      expect(result.rows).toBe(1);
      expect(result.skipped).toBe(6);
      expect(result.sampleErrors).toHaveLength(5);
      expect(result.sampleErrors[0]).toMatch(/Row 3.*cost/);
    } finally {
      if (result.id) await db.delete(datasets).where(eq(datasets.id, result.id));
    }
  });
});
