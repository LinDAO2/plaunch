alter table games drop constraint games_mechanic_check;
alter table games add constraint games_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge', 'arcade'));

alter table scores drop constraint scores_mechanic_check;
alter table scores add constraint scores_mechanic_check check (mechanic in ('tap', 'reaction', 'guess', 'dodge', 'arcade'));

alter table scores add column assurance text not null default 'unverified';
alter table scores add constraint scores_assurance_check check (assurance in ('unverified', 'checked'));

alter table plays add column round_token_hash text;
alter table plays add column consumed_at timestamptz;

create index plays_round_token_idx on plays (round_token_hash);
