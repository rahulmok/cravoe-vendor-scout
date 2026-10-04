create index discovery_cells_status on public.discovery_cells(run_id,source,status,blocked);
create extension if not exists pg_trgm with schema extensions;
create index hotels_name_search on public.hotels using gin(normalized_name extensions.gin_trgm_ops);
create or replace function public.hotel_scout(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
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
  update public.discovery_runs set workflow_id=p_payload->>'workflowId',workflow_token=coalesce(p_payload->>'token',workflow_token),updated_at=now() where id=(p_payload->>'runId')::uuid and (workflow_id is null or workflow_id=p_payload->>'workflowId');
  return jsonb_build_object('owner',exists(select 1 from public.discovery_runs where id=(p_payload->>'runId')::uuid and workflow_id=p_payload->>'workflowId'));
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
 elsif p_action='claim-batch' then
  rows:='[]';for remaining in 1..6 loop v:=public.hotel_scout('claim',p_payload);exit when v='null'::jsonb;rows:=rows||jsonb_build_array(v);exit when v->>'source'='osm';end loop;return rows;
 elsif p_action='checkpoint' then
  select result_json into result from public.hotel_cell_checkpoints where claim_token=(p_payload->>'claimToken')::uuid;if found then return result;end if;
  select * into c from public.discovery_cells where id=p_payload->>'cellId' for update;
  select result_json into result from public.hotel_cell_checkpoints where claim_token=(p_payload->>'claimToken')::uuid;if found then return result;end if;
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
  insert into public.hotel_cell_checkpoints(claim_token,cell_id,result_json) values((p_payload->>'claimToken')::uuid,c.id,result) on conflict do nothing;
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
  select jsonb_build_object('pendingCells',count(*) filter(where status not in ('completed','split')),'completedCells',count(*) filter(where status='completed'),'splitCells',count(*) filter(where status='split'),'totalCells',count(*),'blockedCells',count(*) filter(where blocked),'requests',coalesce(sum(requests),0)) into result from public.discovery_cells where run_id=rid;
  return to_jsonb(r)||result;
 elsif p_action='run-retry' then
  rid:=(p_payload->>'runId')::uuid;
  if exists(select 1 from public.discovery_runs where status in ('seeding','running') and id<>rid) then raise exception 'Another discovery job is active';end if;
  update public.discovery_cells set blocked=false,attempts=0,status='pending',lease_until=null,claim_token=null,next_attempt_at=now(),error=null where run_id=rid and status in ('pending','in_progress');
  update public.discovery_runs set status=case when seed_complete then 'running' else 'seeding' end,error=null,workflow_id=null,workflow_token=null,updated_at=now() where id=rid and status in ('blocked','cancelled');
  select * into r from public.discovery_runs where id=rid;return to_jsonb(r);
 elsif p_action='run-cancel' then
  update public.discovery_runs set status='cancelled',updated_at=now() where workflow_id=p_payload->>'workflowId' and status in ('seeding','running');return '{}';
 elsif p_action='research-link' then
  insert into public.hotel_research_jobs(workflow_id,token) values(p_payload->>'workflowId',p_payload->>'token') on conflict do nothing;return '{}';
 elsif p_action='upsert' then return public.hotel_upsert(p_payload->'hotels');
 elsif p_action='research-queue' then
  select coalesce(jsonb_agg(j),'[]') into result from (select record_json j from (select record_json,creator_score,id,row_number() over(partition by region_id order by creator_score desc,id) n from public.hotels where status='needs_review' and coalesce(record_json->>'researchStatus','pending') in ('pending','failed') and (coalesce(p_payload->>'regionId','all')='all' or region_id=p_payload->>'regionId')) h order by n,creator_score desc,id limit 20) t;return result;
 elsif p_action='search' then
  q:=regexp_replace(lower(normalize(coalesce(p_payload->>'query',''),NFKC)),'[^[:alnum:]]','','g');
  lim:=least(500,greatest(1,coalesce((p_payload->>'limit')::integer,100)));offst:=greatest(0,coalesce((p_payload->>'offset')::integer,0));
  select count(*) into count_total from public.hotels where (q<>'' and position(q in regexp_replace(lower(name||' '||coalesce(locality,'')||' '||coalesce(district,'')||' '||coalesce(record_json->>'address','')),'[^[:alnum:]]','','g'))>0) or (q='' and (coalesce(p_payload->>'status','all')='all' or status=p_payload->>'status') and (coalesce(p_payload->>'regionId','all')='all' or region_id=p_payload->>'regionId') and (coalesce(p_payload->>'saved','false')<>'true' or coalesce(outreach_state_json->>'stage','New')<>'New') and (coalesce(p_payload->>'proof','all')='all' or (p_payload->>'proof'='multiple' and coalesce((record_json->>'creatorCount')::int,0)>=2) or (p_payload->>'proof'='disclosed' and coalesce((record_json->>'disclosedCreatorCount')::int,0)>0) or (p_payload->>'proof'='recent' and coalesce((record_json->>'recentCreatorCount')::int,0)>0)));
  select coalesce(jsonb_agg(j),'[]') into rows from (select record_json||jsonb_build_object('inventoryId',id,'id','hotel:'||id,'inventoryStatus',status,'exclusionReason',exclusion_reason) j from public.hotels where (q<>'' and position(q in regexp_replace(lower(name||' '||coalesce(locality,'')||' '||coalesce(district,'')||' '||coalesce(record_json->>'address','')),'[^[:alnum:]]','','g'))>0) or (q='' and (coalesce(p_payload->>'status','all')='all' or status=p_payload->>'status') and (coalesce(p_payload->>'regionId','all')='all' or region_id=p_payload->>'regionId') and (coalesce(p_payload->>'saved','false')<>'true' or coalesce(outreach_state_json->>'stage','New')<>'New') and (coalesce(p_payload->>'proof','all')='all' or (p_payload->>'proof'='multiple' and coalesce((record_json->>'creatorCount')::int,0)>=2) or (p_payload->>'proof'='disclosed' and coalesce((record_json->>'disclosedCreatorCount')::int,0)>0) or (p_payload->>'proof'='recent' and coalesce((record_json->>'recentCreatorCount')::int,0)>0))) order by (status='qualified') desc,creator_score desc,id limit lim offset offst) s;
  return jsonb_build_object('hotels',rows,'total',count_total,'offset',offst,'nextOffset',case when offst+lim<count_total then offst+lim else null end);
 elsif p_action='workspace' then
  select jsonb_build_object('crm',coalesce((select jsonb_object_agg('hotel:'||id,outreach_state_json) from public.hotels where outreach_state_json<>'{}'),'{}'),'profile',(select profile_json from public.hotel_workspace where id='default'),'runs',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from public.discovery_runs order by created_at desc limit 30) t),'[]'),'total',(select count(*) from public.hotels),'counts',(select jsonb_build_object('qualified',count(*) filter(where status='qualified'),'needsReview',count(*) filter(where status='needs_review'),'excluded',count(*) filter(where status='excluded'),'saved',count(*) filter(where coalesce(outreach_state_json->>'stage','New')<>'New')) from public.hotels),'researchJobs',coalesce((select jsonb_agg(to_jsonb(j)) from (select * from public.hotel_research_jobs order by created_at desc limit 30) j),'[]')) into result;return result;
 elsif p_action='crm' then
  update public.hotels set outreach_state_json=outreach_state_json||coalesce(p_payload->'patch','{}'),updated_at=now() where id=replace(p_payload->>'id','hotel:','')::uuid returning outreach_state_json into result;return result;
 elsif p_action='profile' then
  update public.hotel_workspace set profile_json=profile_json||coalesce(p_payload->'patch','{}'),updated_at=now() where id='default';return '{}';
 elsif p_action='import' then
  keytext:=p_payload->>'migrationId';if exists(select 1 from public.hotel_migrations where id=keytext) then return '[]';end if;
  result:=public.hotel_upsert(p_payload->'hotels');
  for v in select value from jsonb_array_elements(result) loop
   -- Resolve old browser IDs through stable source aliases. Never replace newer shared notes.
   update public.hotels set outreach_state_json=coalesce(p_payload->'crm'->(v->>'id'),p_payload->'crm'->('maps:'||(v->>'placeId')),p_payload->'crm'->('osm:'||(v->>'osmId')),'{}')||outreach_state_json where id=(v->>'inventoryId')::uuid;
  end loop;
  if p_payload->'profile' is not null then update public.hotel_workspace set profile_json=p_payload->'profile'||profile_json where id='default';end if;
  insert into public.hotel_migrations(id) values(keytext) on conflict do nothing;return result;
 elsif p_action='rate-limit' then
  keytext:=p_payload->>'key';
  insert into public.hotel_request_limits values(keytext,now(),1) on conflict(key) do update set count=case when hotel_request_limits.window_start<now()-interval '1 minute' then 1 else hotel_request_limits.count+1 end,window_start=case when hotel_request_limits.window_start<now()-interval '1 minute' then now() else hotel_request_limits.window_start end returning count into remaining;
  return jsonb_build_object('allowed',remaining<=coalesce((p_payload->>'limit')::integer,10));
 else raise exception 'Unknown scout action';end if;
end $$;
