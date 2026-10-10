alter table games drop constraint games_mechanic_check;
alter table games add constraint games_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge', 'arcade', 'world'));

alter table scores drop constraint scores_mechanic_check;
alter table scores add constraint scores_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge', 'arcade', 'world'));

create table world_edits (
  game_id text not null references games(id) on delete cascade,
  x integer not null,
  y integer not null,
  z integer not null,
  block smallint not null,
  editor_name text not null default '',
  updated_at timestamptz not null default now(),
  primary key (game_id, x, y, z)
);

create table world_stats (
  game_id text not null references games(id) on delete cascade,
  player_name text not null,
  blocks_placed integer not null default 0,
  time_ms bigint not null default 0,
  primary key (game_id, player_name)
);
