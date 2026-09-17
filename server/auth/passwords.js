import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt from node:crypto: no dependency, and memory-hard, so a stolen hash is
// expensive to attack. Parameters are the Node defaults with a raised cost.
const KEYLEN = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, KEYLEN, COST).toString("hex");
  return { hash, salt };
}

/**
 * A hash to verify against when no user was found, so an unknown address costs
 * the same scrypt work as a real one. Without it the login answers in about a
 * millisecond for an address that does not exist and about forty for one that
 * does, which enumerates the staff list however identical the wording is.
 *
 * Computed once at startup; the password it came from is irrelevant, because
 * nothing is ever expected to match it.
 */
const DECOY = hashPassword(randomBytes(32).toString("hex"));

/** Spends the same work as a real verification and always fails. */
export function verifyNobody(password) {
  verifyPassword(password || randomBytes(8).toString("hex"), DECOY.hash, DECOY.salt);
  return false;
}

/** Constant-time comparison: a fast reject leaks how much of the hash matched. */
export function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const candidate = scryptSync(password, salt, KEYLEN, COST);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
