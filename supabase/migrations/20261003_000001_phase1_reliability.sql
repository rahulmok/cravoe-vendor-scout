create extension if not exists pgcrypto;

do $$ begin
  create type public.vendor_scout_lead_lifecycle_status as enum ('NEW','RESEARCHING','QUALIFIED','REVIEW','REJECTED','CONTACTED','INTERESTED','ONBOARDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_scout_lead_research_status as enum ('pending','researching','complete','partial','failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vendor_scout_contact_state as enum ('not_contacted','contacted','interested','onboarded','declined');
exception when duplicate_object then null; end $$;

create table if not exists public.vendor_scout_brands (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  normalized_name text not null unique,
  brand_type text not null default 'unknown' check (brand_type in ('independent','small_group','chain','franchise','restaurant_group','unknown')),
  website text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_scout_restaurants (
  id uuid primary key default gen_random_uuid(),
  google_place_id text unique,
  external_legacy_id text unique,
  brand_id uuid references public.vendor_scout_brands(id) on delete set null,
  name text not null,
  address text,
  area text,
  cuisine text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  review_count integer check (review_count is null or review_count >= 0),
  phone text,
  website text,
  maps_url text,
  score integer check (score is null or (score >= 0 and score <= 100)),
  shortlisted boolean not null default false,
  lifecycle_status public.vendor_scout_lead_lifecycle_status not null default 'NEW',
  research_status public.vendor_scout_lead_research_status not null default 'pending',
  contact_state public.vendor_scout_contact_state not null default 'not_contacted',
  rejection_reason text,
  follow_up_at date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rejected_requires_reason check (
    lifecycle_status <> 'REJECTED' or nullif(trim(rejection_reason), '') is not null
  )
);
create index if not exists vendor_scout_restaurants_status_updated_idx on public.vendor_scout_restaurants(lifecycle_status, updated_at desc);
create index if not exists vendor_scout_restaurants_brand_id_idx on public.vendor_scout_restaurants(brand_id);
create index if not exists vendor_scout_restaurants_shortlisted_idx on public.vendor_scout_restaurants(shortlisted) where shortlisted;
create index if not exists vendor_scout_restaurants_name_search_idx on public.vendor_scout_restaurants using gin (to_tsvector('simple', coalesce(name,'')));

create table if not exists public.vendor_scout_restaurant_aliases (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.vendor_scout_restaurants(id) on delete cascade,
  brand_id uuid references public.vendor_scout_brands(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  language text,
  source text,
  created_at timestamptz not null default now(),
  constraint alias_has_one_owner check ((restaurant_id is null) <> (brand_id is null))
);
create unique index if not exists vendor_scout_restaurant_alias_unique on public.vendor_scout_restaurant_aliases(restaurant_id, normalized_alias);
create unique index if not exists vendor_scout_brand_alias_unique on public.vendor_scout_restaurant_aliases(brand_id, normalized_alias);

create table if not exists public.vendor_scout_research_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  status public.vendor_scout_lead_research_status not null default 'pending',
  provider text not null,
  requested_by text not null default 'owner',
  result jsonb not null default '{}'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists vendor_scout_research_runs_restaurant_idx on public.vendor_scout_research_runs(restaurant_id, created_at desc);

create table if not exists public.vendor_scout_restaurant_evidence (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  research_run_id uuid references public.vendor_scout_research_runs(id) on delete set null,
  source_fingerprint text,
  source_kind text not null default 'other',
  source_name text,
  source_url text,
  evidence_type text not null default 'source_link',
  claim_key text,
  claim_value jsonb not null default '{}'::jsonb,
  claim_status text not null default 'unknown' check (claim_status in ('fact','inference','unknown')),
  excerpt text,
  confidence text check (confidence is null or confidence in ('high','medium','low')),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists vendor_scout_restaurant_evidence_source_fingerprint_unique
  on public.vendor_scout_restaurant_evidence(restaurant_id, source_fingerprint)
  where source_fingerprint is not null;

create table if not exists public.vendor_scout_lead_status_history (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  old_status public.vendor_scout_lead_lifecycle_status,
  new_status public.vendor_scout_lead_lifecycle_status not null,
  changed_by text not null default 'owner',
  reason text,
  is_manual boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists vendor_scout_lead_status_history_restaurant_idx on public.vendor_scout_lead_status_history(restaurant_id, created_at desc);

create or replace function public.vendor_scout_record_initial_lead_status()
returns trigger language plpgsql set search_path = public as $$
begin
  insert into public.vendor_scout_lead_status_history(restaurant_id, old_status, new_status, changed_by, reason, is_manual)
  values (new.id, null, new.lifecycle_status, 'system', 'Lead created or imported', false);
  return new;
end $$;
drop trigger if exists vendor_scout_restaurants_initial_status on public.vendor_scout_restaurants;
create trigger vendor_scout_restaurants_initial_status after insert on public.vendor_scout_restaurants
for each row execute function public.vendor_scout_record_initial_lead_status();

create table if not exists public.vendor_scout_restaurant_notes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  note_key text not null default 'primary',
  content text not null,
  author text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, note_key)
);

create table if not exists public.vendor_scout_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  field text not null,
  value jsonb not null,
  reason text not null,
  overridden_by text not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);
create unique index if not exists vendor_scout_one_active_manual_override on public.vendor_scout_manual_overrides(restaurant_id, field) where active;

create table if not exists public.vendor_scout_outreach_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.vendor_scout_restaurants(id) on delete cascade,
  state public.vendor_scout_contact_state not null,
  event_type text not null default 'state_changed',
  note text,
  follow_up_at date,
  actor text not null default 'owner',
  created_at timestamptz not null default now()
);
create index if not exists vendor_scout_outreach_events_restaurant_idx on public.vendor_scout_outreach_events(restaurant_id, created_at desc);

create table if not exists public.vendor_scout_migration_imports (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null default 'browser_local_storage',
  raw_payload jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.vendor_scout_legacy_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.vendor_scout_migration_imports(id) on delete cascade,
  restaurant_id uuid references public.vendor_scout_restaurants(id) on delete set null,
  source_key text not null,
  legacy_id text not null,
  payload jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'unresolved' check (resolution_status in ('unresolved','linked','imported')),
  created_at timestamptz not null default now(),
  unique (import_id, source_key, legacy_id)
);

create table if not exists public.vendor_scout_api_rate_limits (
  actor text not null,
  scope text not null,
  window_seconds integer not null,
  window_start bigint not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (actor, scope, window_seconds, window_start)
);

create or replace function public.vendor_scout_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

do $$ begin
  create trigger vendor_scout_brands_touch_updated before update on public.vendor_scout_brands for each row execute function public.vendor_scout_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger vendor_scout_restaurants_touch_updated before update on public.vendor_scout_restaurants for each row execute function public.vendor_scout_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger vendor_scout_restaurant_notes_touch_updated before update on public.vendor_scout_restaurant_notes for each row execute function public.vendor_scout_touch_updated_at();
exception when duplicate_object then null; end $$;

create or replace function public.vendor_scout_consume_api_rate_limit(p_actor text, p_scope text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $
declare v_start bigint; v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or length(p_actor) > 128 or length(p_scope) > 128 then return false; end if;
  v_start := floor(extract(epoch from clock_timestamp()) / p_window_seconds)::bigint;
  insert into public.vendor_scout_api_rate_limits(actor, scope, window_seconds, window_start, request_count)
  values (p_actor, p_scope, p_window_seconds, v_start, 1)
  on conflict (actor, scope, window_seconds, window_start)
  do update set request_count = public.vendor_scout_api_rate_limits.request_count + 1, updated_at = now()
  returning request_count into v_count;
  return v_count <= p_limit;
end $$;

create or replace function public.vendor_scout_transition_restaurant_status(
  p_google_place_id text,
  p_new_status public.vendor_scout_lead_lifecycle_status,
  p_rejection_reason text default null,
  p_actor text default 'owner',
  p_manual boolean default true,
  p_restore boolean default false
)
returns jsonb language plpgsql security invoker set search_path = public as $
declare v_id uuid; v_old public.vendor_scout_lead_lifecycle_status; v_next public.vendor_scout_lead_lifecycle_status; v_reason text; v_restore public.vendor_scout_lead_lifecycle_status;
begin
  select id, lifecycle_status into v_id, v_old from public.vendor_scout_restaurants where google_place_id = p_google_place_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_next := p_new_status;
  v_reason := nullif(trim(p_rejection_reason), '');
  if p_restore then
    if v_old <> 'REJECTED' then raise exception 'NOT_REJECTED'; end if;
    select old_status into v_restore from public.vendor_scout_lead_status_history
      where restaurant_id = v_id and new_status = 'REJECTED' and old_status is not null
      order by created_at desc limit 1;
    v_next := coalesce(v_restore, 'REVIEW');
    if v_next in ('REJECTED','RESEARCHING') then v_next := 'REVIEW'; end if;
    v_reason := null;
  end if;
  if v_next = 'REJECTED' and v_reason is null then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  if v_next <> 'REJECTED' then v_reason := null; end if;

  update public.vendor_scout_restaurants set lifecycle_status = v_next, rejection_reason = v_reason,
    contact_state = case v_next when 'ONBOARDED' then 'onboarded'::public.vendor_scout_contact_state
      when 'INTERESTED' then 'interested'::public.vendor_scout_contact_state
      when 'CONTACTED' then 'contacted'::public.vendor_scout_contact_state
      when 'REJECTED' then 'declined'::public.vendor_scout_contact_state
      else contact_state end
  where id = v_id;

  if v_old <> v_next then
    insert into public.vendor_scout_lead_status_history(restaurant_id, old_status, new_status, changed_by, reason, is_manual)
      values (v_id, v_old, v_next, coalesce(nullif(p_actor,''),'owner'),
        coalesce(v_reason, case when p_restore then 'Lead restored from rejection' else 'Lifecycle status changed manually' end), p_manual);
  end if;
  if p_manual then
    update public.vendor_scout_manual_overrides set active = false, cleared_at = now()
      where restaurant_id = v_id and field = 'lifecycle_status' and active;
    insert into public.vendor_scout_manual_overrides(restaurant_id, field, value, reason, overridden_by)
      values (v_id, 'lifecycle_status', to_jsonb(v_next::text),
        coalesce(v_reason, case when p_restore then 'Manually restored' else 'Manually changed in Vendor Scout' end),
        coalesce(nullif(p_actor,''),'owner'));
  end if;
  return jsonb_build_object('id', v_id, 'google_place_id', p_google_place_id, 'lifecycle_status', v_next, 'rejection_reason', v_reason);
end $$;

create or replace function public.vendor_scout_update_restaurant_crm(
  p_google_place_id text,
  p_new_status public.vendor_scout_lead_lifecycle_status default null,
  p_rejection_reason text default null,
  p_restore boolean default false,
  p_note text default null,
  p_note_provided boolean default false,
  p_follow_up date default null,
  p_follow_up_provided boolean default false,
  p_shortlisted boolean default null,
  p_actor text default 'owner'
)
returns jsonb language plpgsql security invoker set search_path = public as $
declare v_row public.vendor_scout_restaurants%rowtype; v_transition jsonb; v_status public.vendor_scout_lead_lifecycle_status;
begin
  select * into v_row from public.vendor_scout_restaurants where google_place_id = p_google_place_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_new_status is not null or p_restore then
    v_transition := public.vendor_scout_transition_restaurant_status(
      p_google_place_id, coalesce(p_new_status, v_row.lifecycle_status), p_rejection_reason,
      p_actor, true, p_restore
    );
    v_status := (v_transition->>'lifecycle_status')::public.vendor_scout_lead_lifecycle_status;
  else
    v_status := v_row.lifecycle_status;
  end if;
  update public.vendor_scout_restaurants set
    follow_up_at = case when p_follow_up_provided then p_follow_up else follow_up_at end,
    shortlisted = coalesce(p_shortlisted, shortlisted)
  where id = v_row.id;
  if p_note_provided then
    if nullif(trim(coalesce(p_note,'')), '') is null then
      delete from public.vendor_scout_restaurant_notes where restaurant_id = v_row.id and note_key = 'primary';
    else
      insert into public.vendor_scout_restaurant_notes(restaurant_id, note_key, content, author)
      values (v_row.id, 'primary', left(p_note,4000), coalesce(nullif(p_actor,''),'owner'))
      on conflict (restaurant_id,note_key) do update set content = excluded.content, author = excluded.author, updated_at = now();
    end if;
  end if;
  if (p_new_status is not null or p_restore) and v_status in ('CONTACTED','INTERESTED','ONBOARDED','REJECTED') and v_status <> v_row.lifecycle_status then
    insert into public.vendor_scout_outreach_events(restaurant_id, state, note, follow_up_at, actor)
    values (v_row.id,
      case v_status when 'REJECTED' then 'declined'::public.vendor_scout_contact_state
        when 'ONBOARDED' then 'onboarded'::public.vendor_scout_contact_state
        when 'INTERESTED' then 'interested'::public.vendor_scout_contact_state
        else 'contacted'::public.vendor_scout_contact_state end,
      p_rejection_reason, case when p_follow_up_provided then p_follow_up else v_row.follow_up_at end,
      coalesce(nullif(p_actor,''),'owner'));
  end if;
  return jsonb_build_object('id', v_row.id, 'google_place_id', p_google_place_id,
    'lifecycle_status', v_status, 'research_status', v_row.research_status,
    'follow_up_at', case when p_follow_up_provided then p_follow_up else v_row.follow_up_at end,
    'shortlisted', coalesce(p_shortlisted,v_row.shortlisted));
end $$;

create or replace function public.vendor_scout_start_restaurant_research(p_google_place_id text, p_provider text, p_actor text default 'owner')
returns jsonb language plpgsql security invoker set search_path = public as $
declare v_id uuid; v_old public.vendor_scout_lead_lifecycle_status; v_run_id uuid; v_attempt integer;
begin
  select id, lifecycle_status into v_id, v_old from public.vendor_scout_restaurants where google_place_id = p_google_place_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_old in ('NEW','RESEARCHING','QUALIFIED','REVIEW') and not exists (
    select 1 from public.vendor_scout_manual_overrides where restaurant_id = v_id and field = 'lifecycle_status' and active
  ) then
    update public.vendor_scout_restaurants set lifecycle_status = 'RESEARCHING', research_status = 'researching' where id = v_id;
    if v_old <> 'RESEARCHING' then
      insert into public.vendor_scout_lead_status_history(restaurant_id, old_status, new_status, changed_by, reason, is_manual)
        values (v_id, v_old, 'RESEARCHING', coalesce(p_actor,'owner'), 'Research started', false);
    end if;
  else
    update public.vendor_scout_restaurants set research_status = 'researching' where id = v_id;
  end if;
  select coalesce(max(attempt),0)+1 into v_attempt from public.vendor_scout_research_runs where restaurant_id = v_id;
  insert into public.vendor_scout_research_runs(restaurant_id, attempt, status, provider, requested_by)
    values (v_id, v_attempt, 'researching', coalesce(nullif(p_provider,''),'unknown'), coalesce(nullif(p_actor,''),'owner'))
    returning id into v_run_id;
  return jsonb_build_object('run_id', v_run_id, 'restaurant_id', v_id, 'attempt', v_attempt);
end $$;

create or replace function public.vendor_scout_finish_restaurant_research(
  p_run_id uuid,
  p_google_place_id text,
  p_status public.vendor_scout_lead_research_status,
  p_result jsonb default '{}'::jsonb,
  p_error_code text default null,
  p_actor text default 'owner'
)
returns jsonb language plpgsql security invoker set search_path = public as $
declare v_id uuid; v_old public.vendor_scout_lead_lifecycle_status; v_next public.vendor_scout_lead_lifecycle_status; v_reason text; v_fit text; v_override boolean;
begin
  select id, lifecycle_status into v_id, v_old from public.vendor_scout_restaurants where google_place_id = p_google_place_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.vendor_scout_research_runs set status = p_status, result = coalesce(p_result,'{}'::jsonb),
    error_code = left(p_error_code,80), finished_at = now() where id = p_run_id and restaurant_id = v_id;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  update public.vendor_scout_restaurants set research_status = p_status where id = v_id;

  select exists(select 1 from public.vendor_scout_manual_overrides where restaurant_id = v_id and field = 'lifecycle_status' and active) into v_override;
  v_next := v_old;
  if not v_override and v_old in ('NEW','RESEARCHING','QUALIFIED','REVIEW') then
    v_fit := upper(coalesce(p_result->>'fitStatus','REVIEW'));
    if p_status = 'failed' or p_status = 'partial' then v_next := 'REVIEW';
    elsif v_fit in ('REJECT','AUTO REJECT') or coalesce((p_result->>'tooBigForCravoe')::boolean,false) then v_next := 'REJECTED';
    elsif v_fit in ('STRONG_FIT','POSSIBLE_FIT') then v_next := 'QUALIFIED';
    else v_next := 'REVIEW'; end if;
    if v_next = 'REJECTED' then
      v_reason := coalesce(nullif(left(p_result->>'rejectionReason',500),''),'Research indicates this business is outside the current Cravoe target');
    else v_reason := null; end if;
    update public.vendor_scout_restaurants set lifecycle_status = v_next, rejection_reason = v_reason where id = v_id;
    if v_old <> v_next then
      insert into public.vendor_scout_lead_status_history(restaurant_id, old_status, new_status, changed_by, reason, is_manual)
        values (v_id, v_old, v_next, coalesce(p_actor,'owner'), 'Research result', false);
    end if;
  end if;

  if jsonb_typeof(p_result->'sources') = 'array' then
    insert into public.vendor_scout_restaurant_evidence(restaurant_id, research_run_id, source_fingerprint, source_kind, source_name, source_url,
      evidence_type, claim_key, claim_value, claim_status)
    select v_id, p_run_id, md5(p_run_id::text || '|' || (item->>'url')), coalesce(nullif(p_result->>'sourceKind',''),'google_search_grounding'), left(item->>'title',300), left(item->>'url',2000),
      'grounding_source', 'unmapped_research_source', item, 'unknown'
    from jsonb_array_elements(p_result->'sources') item
    where coalesce(item->>'url','') ~ '^https?://'
    on conflict (restaurant_id,source_fingerprint) where source_fingerprint is not null do nothing;
  end if;
  return jsonb_build_object('research_status', p_status, 'lifecycle_status', v_next);
end $$;

alter table public.vendor_scout_brands enable row level security;
alter table public.vendor_scout_restaurants enable row level security;
alter table public.vendor_scout_restaurant_aliases enable row level security;
alter table public.vendor_scout_restaurant_evidence enable row level security;
alter table public.vendor_scout_research_runs enable row level security;
alter table public.vendor_scout_lead_status_history enable row level security;
alter table public.vendor_scout_restaurant_notes enable row level security;
alter table public.vendor_scout_manual_overrides enable row level security;
alter table public.vendor_scout_outreach_events enable row level security;
alter table public.vendor_scout_migration_imports enable row level security;
alter table public.vendor_scout_legacy_import_rows enable row level security;
alter table public.vendor_scout_api_rate_limits enable row level security;

revoke all on function public.vendor_scout_consume_api_rate_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.vendor_scout_transition_restaurant_status(text,public.vendor_scout_lead_lifecycle_status,text,text,boolean,boolean) from public, anon, authenticated;
revoke all on function public.vendor_scout_update_restaurant_crm(text,public.vendor_scout_lead_lifecycle_status,text,boolean,text,boolean,date,boolean,boolean,text) from public, anon, authenticated;
revoke all on function public.vendor_scout_start_restaurant_research(text,text,text) from public, anon, authenticated;
revoke all on function public.vendor_scout_finish_restaurant_research(uuid,text,public.vendor_scout_lead_research_status,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.vendor_scout_consume_api_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.vendor_scout_transition_restaurant_status(text,public.vendor_scout_lead_lifecycle_status,text,text,boolean,boolean) to service_role;
grant execute on function public.vendor_scout_update_restaurant_crm(text,public.vendor_scout_lead_lifecycle_status,text,boolean,text,boolean,date,boolean,boolean,text) to service_role;
grant execute on function public.vendor_scout_start_restaurant_research(text,text,text) to service_role;
grant execute on function public.vendor_scout_finish_restaurant_research(uuid,text,public.vendor_scout_lead_research_status,jsonb,text,text) to service_role;

grant select, insert, update, delete on table
  public.vendor_scout_brands,
  public.vendor_scout_restaurants,
  public.vendor_scout_restaurant_aliases,
  public.vendor_scout_restaurant_evidence,
  public.vendor_scout_research_runs,
  public.vendor_scout_lead_status_history,
  public.vendor_scout_restaurant_notes,
  public.vendor_scout_manual_overrides,
  public.vendor_scout_outreach_events,
  public.vendor_scout_migration_imports,
  public.vendor_scout_legacy_import_rows,
  public.vendor_scout_api_rate_limits
to service_role;

revoke all on table
  public.vendor_scout_brands,
  public.vendor_scout_restaurants,
  public.vendor_scout_restaurant_aliases,
  public.vendor_scout_restaurant_evidence,
  public.vendor_scout_research_runs,
  public.vendor_scout_lead_status_history,
  public.vendor_scout_restaurant_notes,
  public.vendor_scout_manual_overrides,
  public.vendor_scout_outreach_events,
  public.vendor_scout_migration_imports,
  public.vendor_scout_legacy_import_rows,
  public.vendor_scout_api_rate_limits
from anon, authenticated;
