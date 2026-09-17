-- Real authentication, replacing the trusted X-Actor-Id header.
set search_path to finops;

-- scrypt, salt per user. Nullable so an account can exist without a password
-- until one is set; such an account cannot log in.
alter table finops.users add column password_hash text;
alter table finops.users add column password_salt text;
alter table finops.users add column failed_attempts integer not null default 0;
alter table finops.users add column locked_until timestamptz;

-- Server-side sessions, so logout and revocation actually end access. Only a
-- hash of the token is stored: a dump of this table does not yield usable
-- sessions.
create table finops.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references finops.users(id) on delete cascade,
  token_hash    text not null unique,
  csrf_token    text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  user_agent    text
);

create index sessions_user_idx on finops.sessions (user_id) where revoked_at is null;
create index sessions_expiry_idx on finops.sessions (expires_at) where revoked_at is null;

comment on column finops.sessions.token_hash is
  'SHA-256 of the session token. The token itself is only ever in the cookie.';
