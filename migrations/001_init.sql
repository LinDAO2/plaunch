create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_lower_idx on users (lower(email));

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_user_id_idx on sessions (user_id);

create table games (
  id text primary key,
  owner_id uuid references users (id) on delete set null,
  name text not null,
  description text not null default '',
  mechanic text not null,
  duration integer not null,
  accent text not null,
  token_interest boolean not null default false,
  status text not null default 'published',
  plays integer not null default 0,
  generation text not null default 'manual',
  spec jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint games_status_check check (status in ('draft', 'published', 'archived')),
  constraint games_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge')),
  constraint games_duration_check check (duration between 5 and 60)
);

create index games_status_created_idx on games (status, created_at desc);
create index games_owner_idx on games (owner_id);

create table game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint game_versions_unique unique (game_id, version)
);

create table plays (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games (id) on delete cascade,
  event_type text not null,
  event_id text,
  created_at timestamptz not null default now(),
  constraint plays_event_check check (event_type in ('game_viewed', 'play_started', 'play_completed')),
  constraint plays_event_id_unique unique (game_id, event_id)
);

create index plays_game_idx on plays (game_id, created_at desc);

create table scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games (id) on delete cascade,
  player_name text not null,
  points integer not null,
  mechanic text not null,
  ranking text not null,
  unit text not null default '',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  constraint scores_ranking_check check (ranking in ('higher', 'lower')),
  constraint scores_verified_false check (verified = false),
  constraint scores_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge')),
  constraint scores_points_check check (points between 0 and 100000)
);

create index scores_game_idx on scores (game_id);

create table game_assets (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games (id) on delete cascade,
  kind text not null,
  uri text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index game_assets_game_idx on game_assets (game_id);

create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  game_id text references games (id) on delete set null,
  reporter_user_id uuid references users (id) on delete set null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint abuse_reports_status_check check (status in ('open', 'reviewed', 'dismissed')),
  constraint abuse_reports_reason_check check (reason in ('spam', 'harassment', 'illegal', 'other'))
);

create index abuse_reports_game_idx on abuse_reports (game_id);
