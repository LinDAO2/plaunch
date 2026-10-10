create table ai_daily (
  scope text not null,
  day date not null,
  total integer not null,
  primary key (scope, day)
);

alter table games add column shares integer not null default 0;
