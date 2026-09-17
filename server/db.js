import pg from "pg";

const { Pool, types } = pg;

// Return date and numeric columns as strings: no timezone shifts on dates, no
// float rounding on money.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1700, (value) => value);

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString });
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
