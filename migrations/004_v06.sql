alter table games add column tier text not null default 'spec';
alter table games add constraint games_tier_check check (tier in ('spec', 'freeform'));
alter table games add column freeform_html text;

create table freeform_previews (
  token text primary key,
  html text not null,
  owner_id uuid,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
