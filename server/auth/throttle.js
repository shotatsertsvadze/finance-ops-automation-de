export const LOGIN_LIMITS = {
  perAccount: Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5),
  perAddress: Number(process.env.LOGIN_MAX_ATTEMPTS_PER_IP ?? 20),
  windowMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? 15),
};

/**
 * Records a sign-in attempt from this address and says whether it may go on
 * (ADR-059). The attempt is written before the password is checked, so
 * parallel guesses count one another and cannot all slip under the limit; a
 * success takes it back with `forgiveAttempts`. The account itself is never
 * locked: whoever guesses stops, its owner signs in from elsewhere.
 */
export async function admitAttempt(pool, ip, email) {
  const limits = LOGIN_LIMITS;
  const window = `${limits.windowMinutes} minutes`;
  await pool.query("delete from finops.login_failures where failed_at < now() - $1::interval", [window]);
  await pool.query("insert into finops.login_failures (ip, email) values ($1, $2)", [ip, email]);
  const { rows: [counts] } = await pool.query(
    `select count(*) filter (where email = $2)::int as account, count(*)::int as address
     from finops.login_failures where ip = $1 and failed_at >= now() - $3::interval`,
    [ip, email, window],
  );
  return counts.account <= limits.perAccount && counts.address <= limits.perAddress;
}

/** A correct password clears this address's attempts on the account. */
export function forgiveAttempts(pool, ip, email) {
  return pool.query("delete from finops.login_failures where ip = $1 and email = $2", [ip, email]);
}
