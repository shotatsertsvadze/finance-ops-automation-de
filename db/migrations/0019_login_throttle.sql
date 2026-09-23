-- Failed sign-ins are throttled per client address, not by locking the
-- account (ADR-059). A lock on the account let anyone who knew an address
-- shut its owner out.
set search_path to finops;

create table finops.login_failures (
  ip text not null,
  email text not null,
  failed_at timestamptz not null default now()
);
create index login_failures_by_ip on finops.login_failures (ip, failed_at);

alter table finops.users drop column failed_attempts;
alter table finops.users drop column locked_until;
