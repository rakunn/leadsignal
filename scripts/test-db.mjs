import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const source = process.env.TEST_DATABASE_URL;
if (!source) throw new Error("Set TEST_DATABASE_URL to a disposable Postgres server with CREATE DATABASE permission.");
const files = process.argv.slice(2);
if (files.some(file => !/^tests\/[a-zA-Z0-9_./-]+\.int\.test\.ts$/.test(file) || file.includes(".."))) {
  throw new Error("Only tests/*.int.test.ts file arguments are accepted.");
}
const selected = files.length ? files : (await readdir("tests")).filter(f => f.endsWith(".int.test.ts")).map(f => `tests/${f}`);
if (!selected.length) throw new Error("No integration tests found.");
const name = `leadsignal_test_${randomBytes(10).toString("hex")}`;
const url = new URL(source);
url.pathname = `/${name}`;
const admin = new pg.Client({ connectionString: source });
const owned = [];
let pool;
let child;
let interrupted;
const stop = (signal) => {
  interrupted = signal;
  child?.kill(signal);
};
const onInt = () => stop("SIGINT");
const onTerm = () => stop("SIGTERM");
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  owned.push(name);
  const upgradeName = `${name}_upgrade`;
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  owned.push(upgradeName);
  const upgradeUrl = new URL(url);
  upgradeUrl.pathname = `/${upgradeName}`;
  pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
  pool = undefined;
  if (interrupted) throw new Error(`Tests interrupted by ${interrupted}`);
  console.log(`Running integration tests in owned database ${name}`);
  const code = await new Promise((resolveCode, reject) => {
    child = spawn(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", ...selected, "--no-file-parallelism"], {
      stdio: "inherit", shell: false,
      env: { ...process.env, DATABASE_URL: url.toString(), RUN_DB_TESTS: "1", UPGRADE_DATABASE_URL: upgradeUrl.toString() },
    });
    child.on("error", reject);
    child.on("exit", (status) => resolveCode(status ?? 1));
  });
  process.exitCode = code;
} finally {
  if (pool) await pool.end();
  try {
    for (const database of owned.reverse()) {
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
    if (interrupted) process.exitCode = interrupted === "SIGINT" ? 130 : 143;
  }
}
