alter table users alter column email drop not null;
alter table users alter column password_hash drop not null;
alter table users add column kind text not null default 'account';
alter table users add constraint users_kind_check check (kind in ('account', 'guest'));
alter table users add column guest_token_hash text;
alter table users add column ip_hash text;
create unique index users_guest_token_idx on users (guest_token_hash);

create table ip_bans (
  ip_hash text primary key,
  created_at timestamptz not null default now()
);
