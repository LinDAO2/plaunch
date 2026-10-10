alter table games add column poster_state text not null default '';

create table game_posters (
  game_id text primary key references games (id) on delete cascade,
  png bytea not null,
  updated_at timestamptz not null default now()
);
