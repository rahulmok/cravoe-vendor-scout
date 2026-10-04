-- Transactional integration tests. Leaves no test leads or test jobs behind.
begin;
DO $$declare rid uuid:=gen_random_uuid();c jsonb;r jsonb;t uuid;v jsonb;h jsonb;before_count int;begin
 select count(*) into before_count from public.hotels;
 v:=public.hotel_upsert('[{"placeId":"validation_map_a","name":"Validation Bay Resort","location":{"latitude":21.667,"longitude":87.697},"qualification":"verify","researchStatus":"pending"},{"osmId":"way:9990000001","name":"Validation Bay Resort Hotel","location":{"latitude":21.6671,"longitude":87.6971},"qualification":"verify","researchStatus":"pending"}]');
 if (select count(*) from public.hotels)<>before_count+1 then raise exception 'Fuzzy merge failed';end if;
 h:=v->0;
 perform public.hotel_scout('crm',jsonb_build_object('id',h->>'id','patch',jsonb_build_object('notes','Keep shared notes')));
 perform public.hotel_upsert('[{"placeId":"validation_map_a","name":"Validation Bay Resort","location":{"latitude":21.667,"longitude":87.697},"qualification":"verify","researchStatus":"pending"}]');
 if (select outreach_state_json->>'notes' from public.hotels where place_id='validation_map_a')<>'Keep shared notes' then raise exception 'CRM erased by rescan';end if;
 r:=public.hotel_scout('run-create',jsonb_build_object('id',rid,'areaIds',jsonb_build_array('coastal-belt')));
 if r->>'id'<>rid::text then raise exception 'Test requires no active discovery run';end if;
 perform public.hotel_scout('seed',jsonb_build_object('runId',rid,'cells','[{"id":"osm:root","source":"osm","bounds":{"low":{"latitude":21.66,"longitude":87.69},"high":{"latitude":21.67,"longitude":87.70}}},{"id":"google:root","source":"google","bounds":{"low":{"latitude":21.66,"longitude":87.69},"high":{"latitude":21.67,"longitude":87.70}}}]'::jsonb,'done',true));
 c:=public.hotel_scout('claim',jsonb_build_object('runId',rid));if c->>'source'<>'osm' then raise exception 'Baseline barrier broken';end if;
 if public.hotel_scout('claim',jsonb_build_object('runId',rid))<>'null'::jsonb then raise exception 'OSM lease or barrier broken';end if;
 t:=(c->>'claim_token')::uuid;
 perform public.hotel_scout('checkpoint',jsonb_build_object('cellId',c->>'id','claimToken',t,'hotels','[]'::jsonb,'completed',true));
 -- Replaying the exact durable step checkpoint returns its prior result.
 perform public.hotel_scout('checkpoint',jsonb_build_object('cellId',c->>'id','claimToken',t,'hotels','[]'::jsonb,'completed',true));
 c:=public.hotel_scout('claim',jsonb_build_object('runId',rid));if c->>'source'<>'google' then raise exception 'Google phase missing';end if;
 perform public.hotel_scout('checkpoint',jsonb_build_object('cellId',c->>'id','claimToken',c->>'claim_token','hotels','[]'::jsonb,'cursor',1,'completed',false));
 r:=public.hotel_scout('run-status',jsonb_build_object('runId',rid));if r->>'status'='completed' or (r->>'pendingCells')::int<>1 then raise exception 'False completion with pending cell';end if;
 c:=public.hotel_scout('claim',jsonb_build_object('runId',rid));
 perform public.hotel_scout('checkpoint',jsonb_build_object('cellId',c->>'id','claimToken',c->>'claim_token','hotels','[]'::jsonb,'blocked',true,'error','Saturated at safety limit'));
 r:=public.hotel_scout('run-status',jsonb_build_object('runId',rid));if r->>'status'<>'blocked' or (r->>'pendingCells')::int<>1 then raise exception 'Saturated run incorrectly completed';end if;
 perform public.hotel_scout('run-retry',jsonb_build_object('runId',rid));
 c:=public.hotel_scout('claim',jsonb_build_object('runId',rid));
 perform public.hotel_scout('checkpoint',jsonb_build_object('cellId',c->>'id','claimToken',c->>'claim_token','hotels','[]'::jsonb,'completed',true));
 r:=public.hotel_scout('run-status',jsonb_build_object('runId',rid));if r->>'status'<>'completed' or (r->>'pendingCells')::int<>0 then raise exception 'Traversal failed to complete';end if;
 -- Global search must return excluded properties as well.
 perform public.hotel_upsert('[{"placeId":"validation_excluded_b","name":"Validation Excluded Property","location":{"latitude":22.5726,"longitude":88.3639},"qualification":"excluded","qualificationReason":"Kolkata Metropolitan Area excluded","discoveryExclusion":"Kolkata Metropolitan Area excluded"}]');
 r:=public.hotel_scout('search','{"query":"Validation Excluded","limit":10}');if (r->>'total')::int<>1 or r->'hotels'->0->>'inventoryStatus'<>'excluded' then raise exception 'Excluded hotel hidden from global search';end if;
 if has_function_privilege('anon','public.hotel_scout(text,jsonb)','EXECUTE') then raise exception 'Anonymous database access exposed';end if;
end $$;
select 'PASS: dedup + CRM retention + baseline barrier + exclusive claims + replay checkpoint + pending/saturated completion + global excluded search + access controls' as validation;
rollback;
