-- Apply after daily-cards-fixed-codes.sql. Staff fulfillment and private reward visibility.
begin;
alter table public.gw_card_settings add column if not exists displayable jsonb not null default '[true,true,true,true,true,true,true,true,true,true]';
alter table public.gw_card_days add column if not exists displayable boolean[] not null default array_fill(true,array[10]);
create table if not exists public.gw_card_completions (
 account_id uuid not null, day date not null, position int not null check(position between 1 and 10),
 done_at timestamptz not null default now(), employee_id text not null, employee_name text not null,
 primary key(account_id,day,position),
 foreign key(account_id,day) references public.gw_card_days(account_id,day)
);
alter table public.gw_card_completions enable row level security;
revoke all on public.gw_card_completions from public,anon,authenticated;

create or replace function public.gw_cards_owner_save_displayable(p_pin text,p_enabled boolean,p_rewards jsonb,p_probabilities jsonb,p_displayable jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 if not coalesce((public.gw_order_staff(p_pin,true)->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Owner access required.'); end if;
 if jsonb_typeof(p_displayable) is distinct from 'array' then return jsonb_build_object('ok',false,'msg','Choose Displayable for each reward.'); end if;
 if jsonb_array_length(p_displayable)<>10 or exists(select 1 from jsonb_array_elements(p_displayable) x where jsonb_typeof(x)<>'boolean') then return jsonb_build_object('ok',false,'msg','Choose Displayable for all 10 rewards.'); end if;
 result:=public.gw_cards_owner_save_probabilities(p_pin,p_enabled,p_rewards,p_probabilities);
 if not coalesce((result->>'ok')::boolean,false) then return result; end if;
 update public.gw_card_settings set displayable=p_displayable where id=true;
 return '{"ok":true}'::jsonb;
end $$;

-- Only completed, displayable rewards leave the database for customer sessions.
create or replace function public.gw_card_board(p_account uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare d public.gw_card_days; faces jsonb; history jsonb;
begin
 select * into d from public.gw_card_days where account_id=p_account and day=public.gw_card_day();
 select jsonb_agg(jsonb_build_object('position',i,'revealed',coalesce(i=any(d.revealed),false),
  'done',c.done_at is not null,'reward',case when i=any(d.revealed) and c.done_at is not null and d.displayable[i] then d.deck->>(i-1) else null end) order by i)
 into faces from generate_series(1,10) i left join public.gw_card_completions c on c.account_id=p_account and c.day=d.day and c.position=i;
 select coalesce(jsonb_agg(x order by x.done_at desc,x.day desc,x.position),'[]') into history from (
  select r.day,c.position,r.deck->>(c.position-1) reward,c.done_at
  from public.gw_card_completions c join public.gw_card_days r using(account_id,day)
  where c.account_id=p_account and c.position=any(r.revealed) and r.displayable[c.position]
  order by c.done_at desc,c.day desc,c.position limit 100
 ) x;
 return jsonb_build_object('day',public.gw_card_day(),'reset_at',public.gw_card_reset(),'server_now',now(),
 'remaining',3-coalesce(cardinality(d.revealed),0),'cards',faces,'history',history);
end $$;

create or replace function public.gw_cards_reveal(p_token text,p_position int) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid; d public.gw_card_days; s public.gw_card_settings; slots jsonb; rewards jsonb; visibility boolean[];
begin
 aid:=public.gw_card_identity(p_token);
 if aid is null then return jsonb_build_object('ok',false,'expired',true,'msg','Your daily login expired. Sign in again with your CID and code.'); end if;
 if p_position is null or p_position<1 or p_position>10 then return jsonb_build_object('ok',false,'msg','Choose one of the 10 cards.'); end if;
 select * into s from public.gw_card_settings where id=true;
 if not s.enabled then return jsonb_build_object('ok',false,'msg','Daily cards are currently paused. Your revealed cards are saved.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(aid::text||public.gw_card_day()::text,17));
 select * into d from public.gw_card_days where account_id=aid and day=public.gw_card_day() for update;
 if not found then
  -- Draw slot IDs so rewards with identical names retain their own visibility settings.
  slots:=public.gw_card_weighted_deck('["0","1","2","3","4","5","6","7","8","9"]',s.probabilities);
  select jsonb_agg(s.rewards->(v::int) order by ord),array_agg((s.displayable->>(v::int))::boolean order by ord)
   into rewards,visibility from jsonb_array_elements_text(slots) with ordinality t(v,ord);
  insert into public.gw_card_days(account_id,day,deck,displayable) values(aid,public.gw_card_day(),rewards,visibility) returning * into d;
 end if;
 if p_position=any(d.revealed) then return jsonb_build_object('ok',true,'board',public.gw_card_board(aid)); end if;
 if cardinality(d.revealed)>=3 then return jsonb_build_object('ok',false,'msg','You have revealed all 3 cards for today. Come back after 6 AM Bangladesh time.','board',public.gw_card_board(aid)); end if;
 update public.gw_card_days set revealed=array_append(revealed,p_position),revealed_at=array_append(revealed_at,now()) where account_id=aid and day=d.day;
 return jsonb_build_object('ok',true,'board',public.gw_card_board(aid));
end $$;

-- Every current crew member can look up revealed rewards, regardless of sales permission.
create or replace function public.gw_cards_staff_lookup(p_pin text,p_cid text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; a public.gw_card_accounts; activity jsonb;
begin
 auth:=public.crew_login(p_pin);
 if not coalesce((auth->>'ok')::boolean,false) or auth->'person'->>'id' is null then return jsonb_build_object('ok',false,'msg','Sign in with your employee code.'); end if;
 if length(btrim(coalesce(p_cid,''))) not between 1 and 40 then return jsonb_build_object('ok',false,'msg','Enter a customer CID.'); end if;
 select * into a from public.gw_card_accounts where cid=upper(btrim(p_cid));
 if not found then return jsonb_build_object('ok',false,'msg','Customer CID not found.'); end if;
 select coalesce(jsonb_agg(x order by x.at desc,x.position),'[]') into activity from (
  select d.day,d.revealed[i] position,d.deck->>(d.revealed[i]-1) reward,d.revealed_at[i] at,
   d.displayable[d.revealed[i]] displayable,c.done_at,c.employee_name
  from public.gw_card_days d cross join lateral generate_subscripts(d.revealed,1) i
  left join public.gw_card_completions c on c.account_id=d.account_id and c.day=d.day and c.position=d.revealed[i]
  where d.account_id=a.id order by d.revealed_at[i] desc,d.revealed[i] limit 100
 ) x;
 return jsonb_build_object('ok',true,'cid',a.cid,'name',a.name,'activity',activity);
end $$;

create or replace function public.gw_cards_staff_done(p_pin text,p_cid text,p_day date,p_position int) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; aid uuid; d public.gw_card_days; completion public.gw_card_completions;
begin
 auth:=public.crew_login(p_pin);
 if not coalesce((auth->>'ok')::boolean,false) or auth->'person'->>'id' is null then return jsonb_build_object('ok',false,'msg','Sign in with your employee code.'); end if;
 select id into aid from public.gw_card_accounts where cid=upper(btrim(p_cid));
 select * into d from public.gw_card_days where account_id=aid and day=p_day for update;
 if not found or p_position is null or not coalesce(p_position=any(d.revealed),false) then return jsonb_build_object('ok',false,'msg','Only a revealed card can be marked done.'); end if;
 insert into public.gw_card_completions(account_id,day,position,employee_id,employee_name)
 values(aid,p_day,p_position,auth->'person'->>'id',coalesce(auth->'person'->>'name','Employee')) on conflict do nothing;
 select * into completion from public.gw_card_completions where account_id=aid and day=p_day and position=p_position;
 return jsonb_build_object('ok',true,'done_at',completion.done_at,'employee_name',completion.employee_name,'msg','Reward marked done.');
end $$;
revoke all on function public.gw_cards_owner_save_displayable(text,boolean,jsonb,jsonb,jsonb),public.gw_cards_staff_lookup(text,text),public.gw_cards_staff_done(text,text,date,int) from public,anon,authenticated;
grant execute on function public.gw_cards_owner_save_displayable(text,boolean,jsonb,jsonb,jsonb),public.gw_cards_staff_lookup(text,text),public.gw_cards_staff_done(text,text,date,int) to anon,authenticated;
commit;
