import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt from node:crypto: no dependency, and memory-hard, so a stolen hash is
// expensive to attack. Parameters are the Node defaults with a raised cost.
const KEYLEN = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, KEYLEN, COST).toString("hex");
  return { hash, salt };
}

/** Constant-time comparison: a fast reject leaks how much of the hash matched. */
export function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const candidate = scryptSync(password, salt, KEYLEN, COST);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
