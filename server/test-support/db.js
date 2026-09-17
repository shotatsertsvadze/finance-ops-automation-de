import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPool } from "../db.js";
import { createStorage } from "../storage/files.js";
import { loadPolicy } from "../config/policy.js";
import { loadCompany } from "../config/company.js";
import { reset } from "../../scripts/reset.js";

/**
 * Fresh schema in TEST_DATABASE_URL (dropped and rebuilt), temp storage dir,
 * default policy. Returns deps for the domain functions and createApp().
 */
export async function testDeps() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const pool = createPool(url);
  await reset(pool);
  const storage = createStorage(await mkdtemp(path.join(tmpdir(), "finops-test-")));
  return { pool, storage, policy: loadPolicy({}), company: loadCompany({}) };
}

export const USERS = {
  clerk: "00000000-0000-0000-0000-000000000001",
  manager: "00000000-0000-0000-0000-000000000002",
  manager2: "00000000-0000-0000-0000-000000000003",
  finance: "00000000-0000-0000-0000-000000000004",
  cfo: "00000000-0000-0000-0000-000000000005",
};

// Note: every test file that calls testDeps() drops and rebuilds the schema in
// TEST_DATABASE_URL. The test script therefore runs files with
// --test-concurrency=1; without it two files reset the database under each other.
