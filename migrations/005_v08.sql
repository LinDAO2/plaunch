alter table games drop constraint games_status_check;
alter table games add constraint games_status_check check (status in ('draft', 'published', 'archived', 'hidden', 'pending'));
alter table games add column tags jsonb not null default '[]'::jsonb;
alter table games add column featured boolean not null default false;
alter table games add column flag_reason text not null default '';

alter table users add column banned_at timestamptz;

alter table plays add column actor_hash text;
alter table plays add column user_id uuid references users (id) on delete set null;
alter table plays add column burst boolean not null default false;

create index plays_trending_idx on plays (game_id, event_type, created_at desc);
create index plays_actor_idx on plays (game_id, actor_hash, created_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on audit_log (created_at desc);

update games
set tags = jsonb_build_array(mechanic)
where tags = '[]'::jsonb
  and mechanic in ('tap', 'reaction', 'guess', 'dodge', 'arcade');
