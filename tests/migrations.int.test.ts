import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { assertTestDatabase } from "./helpers/database";

const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("historical HQ revenue migration", () => {
  test("backfills UTC groups without changing other measures and is idempotent", async () => {
    assertTestDatabase();
    const upgradeUrl = process.env.UPGRADE_DATABASE_URL;
    if (!upgradeUrl || !/^\/leadsignal_test_[a-z0-9]+_upgrade$/.test(new URL(upgradeUrl).pathname)) {
      throw new Error("Upgrade checks require the harness-owned upgrade database.");
    }
    const client = new Client({ connectionString: upgradeUrl });
    try {
      await client.connect();
      for (const file of ["0000_init.sql", "0001_rollup-hq-revenue.sql"]) {
        await client.query(await readFile(`drizzle/${file}`, "utf8"));
      }
      await client.query("SET TIME ZONE 'America/Los_Angeles'");
      const { rows: ds } = await client.query("INSERT INTO datasets(name, source) VALUES ('one','sample'),('two','sample') RETURNING id");
      const a = ds[0].id, b = ds[1].id;
      // HQ on UTC Sep 3, suppressed + low quality on same day, HQ on next UTC day,
      // and a second dataset sharing the same dimension values.
      await client.query(`INSERT INTO leads(dataset_id, created_at, campaign, ad_set, creative, platform, landing_page, revenue_cents, composite_score, segment)
        VALUES ($1,'2026-09-03T00:30:00Z','X','A','C','P','L',10000,70,'high_value'),
        ($1,'2026-09-03T01:00:00Z','X',NULL,NULL,NULL,NULL,20000,90,'suppress'),
        ($1,'2026-09-03T02:00:00Z','X',NULL,NULL,NULL,NULL,30000,69,'nurture'),
        ($1,'2026-09-04T00:01:00Z','X',NULL,NULL,NULL,NULL,5000,80,'high_value'),
        ($2,'2026-09-03T00:30:00Z','X',NULL,NULL,NULL,NULL,7000,80,'high_value')`, [a,b]);
      for (const [dim,value] of [["campaign","X"],["ad_set","A"],["creative","C"],["platform","P"],["landing_page","L"]]) {
        await client.query(`INSERT INTO rollups(dataset_id,dimension,dimension_value,day,lead_count,spend_cents,revenue_cents,score_sum)
          VALUES ($1,$2,$3,'2026-09-03',3,1234,60000,229)`, [a,dim,value]);
      }
      await client.query(`INSERT INTO rollups(dataset_id,dimension,dimension_value,day,lead_count,spend_cents)
        VALUES ($1,'campaign','X','2026-09-04',1,99), ($1,'campaign','X','2026-09-05',1,42), ($2,'campaign','X','2026-09-03',1,88)`,[a,b]);
      const before = (await client.query("SELECT * FROM rollups ORDER BY id")).rows;
      const migration = await readFile("drizzle/0002_backfill-hq-revenue.sql", "utf8");
      await client.query(migration);
      const after = (await client.query("SELECT * FROM rollups ORDER BY id")).rows;
      expect(after.map(r => Number(r.hq_revenue_cents))).toEqual([10000,10000,10000,10000,10000,5000,0,7000]);
      for (let i=0; i<before.length; i++) {
        expect({ ...after[i], hq_revenue_cents: 0 }).toEqual({ ...before[i], hq_revenue_cents: 0 });
      }
      await client.query(migration);
      expect((await client.query("SELECT * FROM rollups ORDER BY id")).rows).toEqual(after);
    } finally {
      await client.end();
    }
  }, 30_000);
});
