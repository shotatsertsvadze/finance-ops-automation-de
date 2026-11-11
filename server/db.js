import pg from "pg";
import { log } from "./log.js";
import { envNumber } from "./config/env.js";

const { Pool, types } = pg;

// Return date and numeric columns as strings: no timezone shifts on dates, no
// float rounding on money.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => value);

/**
 * Every wait on the database is bounded (ADR-075): connecting, a single
 * statement, and a transaction left open while idle. Without them a database
 * that hangs takes every request with it.
 */
export function createPool(
  connectionString = process.env.DATABASE_URL,
  {
    connectTimeoutMs = envNumber("DB_CONNECT_TIMEOUT_MS", 5000),
    statementTimeoutMs = envNumber("DB_STATEMENT_TIMEOUT_MS", 15000),
    idleInTransactionMs = envNumber("DB_IDLE_IN_TRANSACTION_MS", 30000),
  } = {},
) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: connectTimeoutMs,
    statement_timeout: statementTimeoutMs,
    idle_in_transaction_session_timeout: idleInTransactionMs,
  });
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
