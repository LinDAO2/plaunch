create table world_sparks (
  game_id text not null references games(id) on delete cascade,
  spark_id integer not null,
  picker_name text not null default '',
  picked_at timestamptz not null default now(),
  primary key (game_id, spark_id)
);
