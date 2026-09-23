import pg from "pg";
import { log } from "./log.js";

const { Pool, types } = pg;

// Return date and numeric columns as strings: no timezone shifts on dates, no
// float rounding on money.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => value);

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  // An idle client whose connection dies is removed by pg, which then emits
  // this. Unhandled, it would take the whole process down.
  pool.on("error", (error) => log("error", "postgres idle client error", { error: error.message }));
  return pool;
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
