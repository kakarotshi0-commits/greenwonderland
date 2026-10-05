-- Apply after daily-cards-public-rewards.sql. Reversible Owner-only reveal removal.
begin;
create table if not exists public.gw_card_removals (
 account_id uuid not null, day date not null, position int not null check(position between 1 and 10),
 active boolean not null default true, removed_at timestamptz not null default now(),
 owner_id text not null, owner_name text not null, restored_at timestamptz,
 primary key(account_id,day,position),foreign key(account_id,day) references public.gw_card_days(account_id,day)
);
alter table public.gw_card_removals enable row level security;
revoke all on public.gw_card_removals from public,anon,authenticated;
create or replace function public.gw_card_board(p_account uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare d public.gw_card_days; faces jsonb; history jsonb;
begin
 select * into d from public.gw_card_days where account_id=p_account and day=public.gw_card_day();
 select jsonb_agg(jsonb_build_object('position',i,'revealed',coalesce(i=any(d.revealed),false),
  'removed',coalesce(z.active,false),'done',c.done_at is not null and not coalesce(z.active,false),'reward',case when not coalesce(z.active,false) and i=any(d.revealed) and c.done_at is not null and d.displayable[i] then d.deck->>(i-1) else null end) order by i)
 into faces from generate_series(1,10) i left join public.gw_card_completions c on c.account_id=p_account and c.day=d.day and c.position=i
 left join public.gw_card_removals z on z.account_id=p_account and z.day=d.day and z.position=i;
 select coalesce(jsonb_agg(x order by x.done_at desc,x.day desc,x.position),'[]') into history from (
  select r.day,c.position,r.deck->>(c.position-1) reward,c.done_at
  from public.gw_card_completions c join public.gw_card_days r using(account_id,day)
  where c.account_id=p_account and c.position=any(r.revealed) and r.displayable[c.position] and not exists(select 1 from public.gw_card_removals z where z.account_id=c.account_id and z.day=c.day and z.position=c.position and z.active)
  order by c.done_at desc,c.day desc,c.position limit 100
 ) x;
 return jsonb_build_object('day',public.gw_card_day(),'reset_at',public.gw_card_reset(),'server_now',now(),
 'remaining',3-coalesce(cardinality(d.revealed),0),'cards',faces,'history',history);
end $$;

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
   d.displayable[d.revealed[i]] displayable,c.done_at,c.employee_name,coalesce(z.active,false) removed,z.removed_at,z.owner_name removed_by
  from public.gw_card_days d cross join lateral generate_subscripts(d.revealed,1) i
  left join public.gw_card_completions c on c.account_id=d.account_id and c.day=d.day and c.position=d.revealed[i]
  left join public.gw_card_removals z on z.account_id=d.account_id and z.day=d.day and z.position=d.revealed[i]
  where d.account_id=a.id and (not coalesce(z.active,false) or lower(btrim(auth->'person'->>'role'))='owner') order by d.revealed_at[i] desc,d.revealed[i] limit 100
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
 if exists(select 1 from public.gw_card_removals where account_id=aid and day=p_day and position=p_position and active) then return jsonb_build_object('ok',false,'msg','This reveal was removed by the Owner.'); end if;
 insert into public.gw_card_completions(account_id,day,position,employee_id,employee_name)
 values(aid,p_day,p_position,auth->'person'->>'id',coalesce(auth->'person'->>'name','Employee')) on conflict do nothing;
 select * into completion from public.gw_card_completions where account_id=aid and day=p_day and position=p_position;
 return jsonb_build_object('ok',true,'done_at',completion.done_at,'employee_name',completion.employee_name,'msg','Reward marked done.');
end $$;

create or replace function public.gw_cards_owner_get(p_pin text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; accounts jsonb; activity jsonb;
begin
 auth:=public.gw_order_staff(p_pin,true); if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Owner access required.'); end if;
 select coalesce(jsonb_agg(to_jsonb(a)-'code_hash' order by a.created_at desc),'[]') into accounts from public.gw_card_accounts a;
 select coalesce(jsonb_agg(x order by x.at desc),'[]') into activity from (
  select a.cid,a.name,d.day,d.deck->>(d.revealed[i]-1) reward,d.revealed[i] position,d.revealed_at[i] at
  from public.gw_card_days d join public.gw_card_accounts a on a.id=d.account_id,generate_subscripts(d.revealed,1) i
  where not exists(select 1 from public.gw_card_removals z where z.account_id=d.account_id and z.day=d.day and z.position=d.revealed[i] and z.active)
  order by d.revealed_at[i] desc limit 100
 ) x;
 return jsonb_build_object('ok',true,'settings',(select to_jsonb(s)-'id' from public.gw_card_settings s where id=true),'accounts',accounts,'activity',activity);
end $$;

create or replace function public.gw_cards_owner_remove_reveal(p_pin text,p_cid text,p_day date,p_position int,p_remove boolean) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; aid uuid; d public.gw_card_days;
begin
 auth:=public.gw_order_staff(p_pin,true);
 if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can remove or restore reveals.'); end if;
 if p_remove is null then return jsonb_build_object('ok',false,'msg','Choose remove or restore.'); end if;
 select id into aid from public.gw_card_accounts where cid=upper(btrim(p_cid));
 select * into d from public.gw_card_days where account_id=aid and day=p_day for update;
 if not found or p_position is null or not coalesce(p_position=any(d.revealed),false) then return jsonb_build_object('ok',false,'msg','Revealed card not found.'); end if;
 if p_remove then
  insert into public.gw_card_removals(account_id,day,position,owner_id,owner_name)
  values(aid,p_day,p_position,auth->'person'->>'id',coalesce(auth->'person'->>'name','Owner'))
  on conflict(account_id,day,position) do update set active=true,removed_at=now(),owner_id=excluded.owner_id,owner_name=excluded.owner_name,restored_at=null where not gw_card_removals.active;
 else
  update public.gw_card_removals set active=false,restored_at=now() where account_id=aid and day=p_day and position=p_position and active;
 end if;
 return jsonb_build_object('ok',true,'msg',case when p_remove then 'Reveal removed. The daily reveal count stays unchanged.' else 'Reveal restored.' end);
end $$;
revoke all on function public.gw_cards_owner_remove_reveal(text,text,date,int,boolean) from public,anon,authenticated;
grant execute on function public.gw_cards_owner_remove_reveal(text,text,date,int,boolean) to anon,authenticated;
commit;
