-- Isolated Bengal Stay Scout database. Service-only API, RLS on every table.
create schema if not exists hotel_private;
revoke all on schema hotel_private from public, anon, authenticated;
create table hotel_private.gateway_keys (id text primary key, token_hash text not null);
grant usage on schema hotel_private to service_role;
grant select on hotel_private.gateway_keys to service_role;
create table public.discovery_runs (
 id uuid primary key, area_ids jsonb not null, status text not null default 'seeding' check(status in ('seeding','running','blocked','completed','cancelled')),
 workflow_id text, workflow_token text, error text, seed_complete boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- One active scan prevents two browser tabs from seeding competing state-wide jobs.
create unique index discovery_single_active on public.discovery_runs ((true)) where status in ('seeding','running');
create table public.discovery_cells (
 id text primary key, run_id uuid not null references public.discovery_runs(id), parent_id text references public.discovery_cells(id),
 bounds jsonb not null, region_id text, source text not null check(source in ('osm','google')),
 status text not null default 'pending' check(status in ('pending','in_progress','completed','split')),
 depth integer not null default 0 check(depth between 0 and 12), cursor integer not null default 0,
 page_token text, page_count integer not null default 0, lead_count integer not null default 0,
 last_attempt_at timestamptz, lease_until timestamptz, claim_token uuid, attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(), blocked boolean not null default false, error text,
 requests integer not null default 0, updated_at timestamptz not null default now()
);
create index discovery_cells_claim on public.discovery_cells(run_id,source,next_attempt_at) where status in ('pending','in_progress');
create index discovery_cells_parent on public.discovery_cells(parent_id);
create table public.hotels (
 -- OSM-only rows use a reserved osm:type:id identity until matched to a real place ID.
 place_id text primary key, id uuid not null unique default gen_random_uuid(), osm_id text,
 name text not null, normalized_name text not null, lat double precision, lng double precision,
 district text, locality text, region_id text, star_category smallint check(star_category between 1 and 5),
 google_rating double precision check(google_rating between 0 and 5), photos_json jsonb not null default '[]', website text, phone_number text,
 status text not null default 'needs_review' check(status in ('qualified','needs_review','excluded')),
 exclusion_reason text, creator_score integer not null default 0, outreach_state_json jsonb not null default '{}',
 record_json jsonb not null default '{}', updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
 check(lat is null or lat between -90 and 90), check(lng is null or lng between -180 and 180)
);
create index hotels_coordinates on public.hotels(lat,lng);
create index hotels_rank on public.hotels(creator_score desc,id);
create index hotels_region_status on public.hotels(region_id,status);
create table public.hotel_identity_aliases (alias_id text primary key,hotel_id uuid not null references public.hotels(id) on delete cascade);
create index hotel_aliases_hotel on public.hotel_identity_aliases(hotel_id);
create table public.hotel_workspace (id text primary key, profile_json jsonb not null default '{}', updated_at timestamptz not null default now());
insert into public.hotel_workspace(id) values('default');
create table public.hotel_migrations (id text primary key, migrated_at timestamptz not null default now());
create table public.hotel_request_limits (key text primary key, window_start timestamptz not null, count integer not null);

create function public.hotel_gateway_authorize(p_hash text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from hotel_private.gateway_keys where id='worker' and token_hash=p_hash)
$$;
create function public.hotel_jaro_winkler(a text,b text) returns double precision language plpgsql immutable strict security invoker set search_path='' as $$
declare an integer:=length(a);bn integer:=length(b);w integer:=greatest(0,greatest(an,bn)/2-1); am boolean[]:=array_fill(false,array[an]);bm boolean[]:=array_fill(false,array[bn]);i integer;j integer;k integer:=1;m integer:=0;t integer:=0;prefix integer:=0;s double precision;
begin
 if an=0 or bn=0 then return 0;end if;if a=b then return 1;end if;
 for i in 1..an loop for j in greatest(1,i-w)..least(bn,i+w) loop if not bm[j] and substr(a,i,1)=substr(b,j,1) then am[i]:=true;bm[j]:=true;m:=m+1;exit;end if;end loop;end loop;
 if m=0 then return 0;end if;
 for i in 1..an loop if am[i] then while not bm[k] loop k:=k+1;end loop;if substr(a,i,1)<>substr(b,k,1) then t:=t+1;end if;k:=k+1;end if;end loop;
 s:=(m::float/an+m::float/bn+(m-t::float/2)/m)/3;
 while prefix<least(4,an,bn) and substr(a,prefix+1,1)=substr(b,prefix+1,1) loop prefix:=prefix+1;end loop;
 return case when s>0.7 then s+prefix*0.1*(1-s) else s end;
end $$;
create function public.hotel_distance(a double precision,b double precision,c double precision,d double precision) returns double precision language sql immutable strict security invoker set search_path='' as $$
 select 12742017.6*asin(sqrt(least(1.0,power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2))))
$$;
create function public.hotel_upsert(p_items jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare h jsonb;old public.hotels;merged jsonb;pid text;oid text;nm text;vlat double precision;vlng double precision;hid uuid;result jsonb:='[]';st text; evidence jsonb; src jsonb;
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500 then raise exception 'Invalid hotel batch';end if;
 -- Serialize matching + insert. Prevents two overlapping cells creating twins.
 perform pg_advisory_xact_lock(718532019);
 for h in select value from jsonb_array_elements(p_items) loop
  pid:=nullif(h->>'placeId','');oid:=nullif(h->>'osmId','');
  if pid is null and oid is null then continue;end if;
  nm:=regexp_replace(lower(normalize(coalesce(h->>'name',''),NFKC)),'[^[:alnum:]]+',' ','g');nm:=trim(nm);
  vlat:=nullif(h->'location'->>'latitude','')::float;vlng:=nullif(h->'location'->>'longitude','')::float;
  old:=null;
  select * into old from public.hotels where (pid is not null and place_id=pid) or (oid is not null and osm_id=oid) order by (place_id=pid) desc nulls last limit 1 for update;
  if old.id is null then select hot.* into old from public.hotel_identity_aliases al join public.hotels hot on hot.id=al.hotel_id where al.alias_id in ('maps:'||pid,'osm:'||oid) limit 1 for update of hot;end if;
  if old.id is null and vlat is not null and vlng is not null then
   select * into old from public.hotels where lat between vlat-0.00068 and vlat+0.00068 and lng between vlng-0.0008 and vlng+0.0008
    and public.hotel_distance(lat,lng,vlat,vlng)<=75 and public.hotel_jaro_winkler(normalized_name,nm)>0.82
    -- Distinct Maps IDs can be aliases, but ambiguous adjacent hotels stay available for review.
    order by public.hotel_jaro_winkler(normalized_name,nm) desc, public.hotel_distance(lat,lng,vlat,vlng),id limit 1 for update;
  end if;
  hid:=coalesce(old.id,gen_random_uuid());
  if old.id is not null and old.record_json->>'researchStatus'='complete' and coalesce(h->>'researchStatus','pending')<>'complete' then merged:=h||old.record_json;else merged:=coalesce(old.record_json,'{}')||h;end if;
  select coalesce(jsonb_agg(e),'[]') into evidence from (select distinct on (e->>'url') e from jsonb_array_elements(coalesce(old.record_json->'collaborationEvidence','[]')||coalesce(h->'collaborationEvidence','[]')) e where e->>'url' is not null) t;
  select coalesce(jsonb_agg(v),'[]') into src from (select distinct value v from jsonb_array_elements(coalesce(old.record_json->'discoverySources','[]')||coalesce(h->'discoverySources','[]'))) t;
  pid:=case when old.place_id is not null and old.place_id not like 'osm:%' then old.place_id else coalesce(pid,old.place_id,'osm:'||oid) end;
  merged:=merged||jsonb_build_object('inventoryId',hid,'id','hotel:'||hid,'placeId',case when pid like 'osm:%' then null else pid end,'osmId',coalesce(old.osm_id,oid),'collaborationEvidence',evidence,'discoverySources',src);
  -- Apply current exclusion to an already researched row. Missing discovery data never clears an exclusion.
  if nullif(h->>'discoveryExclusion','') is not null then merged:=merged||jsonb_build_object('discoveryExclusion',h->>'discoveryExclusion','qualification','excluded','qualificationReason',h->>'discoveryExclusion','eligible',false);end if;
  st:=case when merged->>'qualification' in ('excluded','below-category','quality-review') then 'excluded' when merged->>'qualification'='qualified' then 'qualified' else 'needs_review' end;
  if old.id is not null then update public.hotels set place_id=pid where id=hid;end if;
  insert into public.hotels(place_id,id,osm_id,name,normalized_name,lat,lng,district,locality,region_id,star_category,google_rating,photos_json,website,phone_number,status,exclusion_reason,creator_score,record_json)
  values(pid,hid,coalesce(old.osm_id,oid),merged->>'name',regexp_replace(lower(normalize(merged->>'name',NFKC)),'[^[:alnum:]]+',' ','g'),coalesce((merged->'location'->>'latitude')::float,vlat),coalesce((merged->'location'->>'longitude')::float,vlng),merged->>'district',merged->>'city',merged->>'regionId',nullif(merged->>'stars','')::smallint,nullif(merged->>'rating','')::float,coalesce(merged->'photos','[]'),merged->>'website',merged->>'phone',st,case when st<>'qualified' then merged->>'qualificationReason' end,coalesce((merged->>'score')::integer,0),merged)
  on conflict(place_id) do update set osm_id=excluded.osm_id,name=excluded.name,normalized_name=trim(excluded.normalized_name),lat=excluded.lat,lng=excluded.lng,district=excluded.district,locality=excluded.locality,region_id=excluded.region_id,star_category=excluded.star_category,google_rating=excluded.google_rating,photos_json=excluded.photos_json,website=excluded.website,phone_number=excluded.phone_number,status=excluded.status,exclusion_reason=excluded.exclusion_reason,creator_score=excluded.creator_score,record_json=excluded.record_json,updated_at=now();
  if h->>'placeId' is not null then insert into public.hotel_identity_aliases values('maps:'||(h->>'placeId'),hid) on conflict do nothing;end if;
  if oid is not null then insert into public.hotel_identity_aliases values('osm:'||oid,hid) on conflict do nothing;end if;
  result:=result||jsonb_build_array(merged);
 end loop;
 return result;
end $$;

create function public.hotel_scout(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare rid uuid; r public.discovery_runs;c public.discovery_cells; v jsonb;result jsonb; token uuid; phase text; remaining integer; count_total integer; q text; lim integer; offst integer; rows jsonb; keytext text;
begin
 if p_action='run-create' then
  rid:=(p_payload->>'id')::uuid;
  select * into r from public.discovery_runs where status in ('seeding','running') order by created_at limit 1;
  if r.id is not null then return to_jsonb(r);end if;
  begin insert into public.discovery_runs(id,area_ids) values(rid,p_payload->'areaIds') on conflict(id) do nothing;
  exception when unique_violation then select * into r from public.discovery_runs where status in ('seeding','running') limit 1;return to_jsonb(r);end;
  select * into r from public.discovery_runs where id=rid;return to_jsonb(r);
 elsif p_action='seed' then
  rid:=(p_payload->>'runId')::uuid;
  select * into r from public.discovery_runs where id=rid for update;
  if r.status<>'seeding' then return to_jsonb(r);end if;
  for v in select value from jsonb_array_elements(p_payload->'cells') loop
   insert into public.discovery_cells(id,run_id,bounds,region_id,source,depth) values(rid||':'||(v->>'id'),rid,v->'bounds',v->>'region_id',v->>'source',0) on conflict(id) do nothing;
  end loop;
  if (p_payload->>'done')::boolean then update public.discovery_runs set seed_complete=true,status='running',updated_at=now() where id=rid;end if;
  return jsonb_build_object('seeded',(select count(*) from public.discovery_cells where run_id=rid));
 elsif p_action='run-link' then
  update public.discovery_runs set workflow_id=p_payload->>'workflowId',workflow_token=p_payload->>'token',updated_at=now() where id=(p_payload->>'runId')::uuid and (workflow_id is null or workflow_id=p_payload->>'workflowId');return '{}';
 elsif p_action='claim' then
  rid:=(p_payload->>'runId')::uuid;
  select * into r from public.discovery_runs where id=rid;
  if r.status<>'running' or not r.seed_complete then return 'null';end if;
  phase:=case when exists(select 1 from public.discovery_cells where run_id=rid and source='osm' and status not in ('completed','split')) then 'osm' else 'google' end;
  token:=gen_random_uuid();
  select * into c from public.discovery_cells where run_id=rid and source=phase and not blocked and next_attempt_at<=now()
   and (status='pending' or (status='in_progress' and lease_until<now())) order by depth,id for update skip locked limit 1;
  if c.id is null then return 'null';end if;
  update public.discovery_cells set status='in_progress',claim_token=token,lease_until=now()+interval '5 minutes',last_attempt_at=now(),updated_at=now() where id=c.id returning * into c;
  return to_jsonb(c);
 elsif p_action='checkpoint' then
  select * into c from public.discovery_cells where id=p_payload->>'cellId' for update;
  if c.claim_token is distinct from (p_payload->>'claimToken')::uuid or c.status<>'in_progress' then raise exception 'Cell lease lost';end if;
  -- Candidate writes and traversal progress commit in the SAME transaction.
  result:=public.hotel_upsert(coalesce(p_payload->'hotels','[]'));
  if p_payload->'children' is not null and jsonb_array_length(p_payload->'children')=4 then
   for v in select value from jsonb_array_elements(p_payload->'children') loop
    insert into public.discovery_cells(id,run_id,parent_id,bounds,region_id,source,depth) values(v->>'id',c.run_id,c.id,v->'bounds',c.region_id,c.source,(v->>'depth')::integer) on conflict(id) do nothing;
   end loop;
   update public.discovery_cells set status='split',claim_token=null,lease_until=null,lead_count=lead_count+jsonb_array_length(result),requests=requests+1,updated_at=now() where id=c.id;
  else
   update public.discovery_cells set status=case when coalesce((p_payload->>'completed')::boolean,false) then 'completed' else 'pending' end,
    blocked=coalesce((p_payload->>'blocked')::boolean,false),error=p_payload->>'error',cursor=coalesce((p_payload->>'cursor')::integer,c.cursor),page_token=p_payload->>'pageToken',page_count=coalesce((p_payload->>'pageCount')::integer,0),
    claim_token=null,lease_until=null,lead_count=lead_count+jsonb_array_length(result),requests=requests+1,attempts=0,updated_at=now() where id=c.id;
  end if;
  return result;
 elsif p_action='cell-failure' then
  update public.discovery_cells set status='pending',attempts=attempts+1,blocked=attempts+1>=6 or coalesce((p_payload->>'permanent')::boolean,false),next_attempt_at=now()+make_interval(secs=>least(300,power(2,attempts+1)::integer*5)),error=left(p_payload->>'error',500),claim_token=null,lease_until=null,updated_at=now()
   where id=p_payload->>'cellId' and claim_token=(p_payload->>'claimToken')::uuid;return '{}';
 elsif p_action='run-status' then
  rid:=(p_payload->>'runId')::uuid;select * into r from public.discovery_runs where id=rid for update;
  select count(*) into remaining from public.discovery_cells where run_id=rid and status not in ('completed','split');
  if r.status='running' and remaining=0 and r.seed_complete then update public.discovery_runs set status='completed',updated_at=now() where id=rid;
  elsif r.status='running' and exists(select 1 from public.discovery_cells where run_id=rid and blocked) and not exists(select 1 from public.discovery_cells where run_id=rid and not blocked and status not in ('completed','split') and (source='osm' or not exists(select 1 from public.discovery_cells where run_id=rid and source='osm' and status not in ('completed','split')))) then
   update public.discovery_runs set status='blocked',error='Unresolved cells need retry; coverage is incomplete',updated_at=now() where id=rid;
  end if;
  select * into r from public.discovery_runs where id=rid;
  return to_jsonb(r)||jsonb_build_object('pendingCells',remaining,'completedCells',(select count(*) from public.discovery_cells where run_id=rid and status='completed'),'splitCells',(select count(*) from public.discovery_cells where run_id=rid and status='split'),'totalCells',(select count(*) from public.discovery_cells where run_id=rid),'blockedCells',(select count(*) from public.discovery_cells where run_id=rid and blocked),'requests',(select coalesce(sum(requests),0) from public.discovery_cells where run_id=rid));
 elsif p_action='run-retry' then
  rid:=(p_payload->>'runId')::uuid;
  if exists(select 1 from public.discovery_runs where status in ('seeding','running') and id<>rid) then raise exception 'Another discovery job is active';end if;
  update public.discovery_cells set blocked=false,attempts=0,status='pending',lease_until=null,claim_token=null,next_attempt_at=now(),error=null where run_id=rid and status in ('pending','in_progress');
  update public.discovery_runs set status=case when seed_complete then 'running' else 'seeding' end,error=null,workflow_id=null,workflow_token=null,updated_at=now() where id=rid and status in ('blocked','cancelled');
  select * into r from public.discovery_runs where id=rid;return to_jsonb(r);
 elsif p_action='run-cancel' then
  update public.discovery_runs set status='cancelled',updated_at=now() where workflow_id=p_payload->>'workflowId' and status in ('seeding','running');return '{}';
 elsif p_action='upsert' then return public.hotel_upsert(p_payload->'hotels');
 elsif p_action='search' then
  q:=regexp_replace(lower(normalize(coalesce(p_payload->>'query',''),NFKC)),'[^[:alnum:]]','','g');
  lim:=least(500,greatest(1,coalesce((p_payload->>'limit')::integer,100)));offst:=greatest(0,coalesce((p_payload->>'offset')::integer,0));
  select count(*) into count_total from public.hotels where q='' or position(q in regexp_replace(lower(name||' '||coalesce(locality,'')||' '||coalesce(district,'')||' '||coalesce(record_json->>'address','')),'[^[:alnum:]]','','g'))>0;
  select coalesce(jsonb_agg(j),'[]') into rows from (select record_json||jsonb_build_object('inventoryId',id,'id','hotel:'||id,'inventoryStatus',status,'exclusionReason',exclusion_reason) j from public.hotels where q='' or position(q in regexp_replace(lower(name||' '||coalesce(locality,'')||' '||coalesce(district,'')||' '||coalesce(record_json->>'address','')),'[^[:alnum:]]','','g'))>0 order by creator_score desc,id limit lim offset offst) s;
  return jsonb_build_object('hotels',rows,'total',count_total,'offset',offst,'nextOffset',case when offst+lim<count_total then offst+lim else null end);
 elsif p_action='workspace' then
  select jsonb_build_object('crm',coalesce((select jsonb_object_agg('hotel:'||id,outreach_state_json) from public.hotels where outreach_state_json<>'{}'),'{}'),'profile',(select profile_json from public.hotel_workspace where id='default'),'runs',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.discovery_runs order by created_at desc limit 30) t),'[]'),'total',(select count(*) from public.hotels)) into result;return result;
 elsif p_action='crm' then
  update public.hotels set outreach_state_json=outreach_state_json||coalesce(p_payload->'patch','{}'),updated_at=now() where id=replace(p_payload->>'id','hotel:','')::uuid returning outreach_state_json into result;return result;
 elsif p_action='profile' then
  update public.hotel_workspace set profile_json=profile_json||coalesce(p_payload->'patch','{}'),updated_at=now() where id='default';return '{}';
 elsif p_action='import' then
  keytext:=p_payload->>'migrationId';if exists(select 1 from public.hotel_migrations where id=keytext) then return '[]';end if;
  result:=public.hotel_upsert(p_payload->'hotels');
  for v in select value from jsonb_array_elements(result) loop
   -- Resolve old browser IDs through stable source aliases. Never replace newer shared notes.
   update public.hotels set outreach_state_json=coalesce(p_payload->'crm'->('maps:'||(v->>'placeId')),'{}')||outreach_state_json where id=(v->>'inventoryId')::uuid;
  end loop;
  if p_payload->'profile' is not null then update public.hotel_workspace set profile_json=p_payload->'profile'||profile_json where id='default';end if;
  insert into public.hotel_migrations(id) values(keytext) on conflict do nothing;return result;
 elsif p_action='rate-limit' then
  keytext:=p_payload->>'key';
  insert into public.hotel_request_limits values(keytext,now(),1) on conflict(key) do update set count=case when hotel_request_limits.window_start<now()-interval '1 minute' then 1 else hotel_request_limits.count+1 end,window_start=case when hotel_request_limits.window_start<now()-interval '1 minute' then now() else hotel_request_limits.window_start end returning count into remaining;
  return jsonb_build_object('allowed',remaining<=coalesce((p_payload->>'limit')::integer,10));
 else raise exception 'Unknown scout action';end if;
end $$;

-- All application traffic passes the authenticated server gateway. No direct public CRM access.
DO $$declare t text; f record;begin
 foreach t in array array['discovery_runs','discovery_cells','hotels','hotel_identity_aliases','hotel_workspace','hotel_migrations','hotel_request_limits'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'hotel_%' loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
