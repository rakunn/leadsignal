import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Reuse the pool across dev HMR reloads; keep max small so
// (Cloud Run instances × pool size) stays under Cloud SQL's connection limit.
const globalForDb = globalThis as unknown as { __lsPool?: Pool };

export const pool =
  globalForDb.__lsPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__lsPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
