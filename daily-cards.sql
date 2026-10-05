-- Daily roleplay cards. Server time, private decks and Owner-managed customer codes.
begin;
create table if not exists public.gw_card_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 rewards jsonb not null default '["Try again","Try again","Try again","Try again","Try again","Try again","Try again","Try again","Try again","Try again"]',
 check(jsonb_typeof(rewards)='array' and jsonb_array_length(rewards)=10)
);
insert into public.gw_card_settings(id) values(true) on conflict do nothing;
create table if not exists public.gw_card_accounts (
 id uuid primary key default gen_random_uuid(), cid text not null unique,
 name text not null default '', code_hash text not null, active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.gw_card_sessions (
 token_hash text primary key, account_id uuid not null references public.gw_card_accounts(id),
 expires_at timestamptz not null
);
create table if not exists public.gw_card_days (
 account_id uuid not null references public.gw_card_accounts(id), day date not null,
 deck jsonb not null, revealed int[] not null default '{}',
 revealed_at timestamptz[] not null default '{}',
 primary key(account_id,day), check(cardinality(revealed)<=3)
);
create table if not exists public.gw_card_login_limits (
 key text primary key, started_at timestamptz not null, attempts int not null
);
alter table public.gw_card_settings enable row level security;
alter table public.gw_card_accounts enable row level security;
alter table public.gw_card_sessions enable row level security;
alter table public.gw_card_days enable row level security;
alter table public.gw_card_login_limits enable row level security;
revoke all on public.gw_card_settings,public.gw_card_accounts,public.gw_card_sessions,public.gw_card_days,public.gw_card_login_limits from public,anon,authenticated;

create or replace function public.gw_card_day(p_now timestamptz default now()) returns date
language sql stable set search_path=public as $$ select (p_now at time zone 'Asia/Dhaka'-interval '6 hours')::date $$;
create or replace function public.gw_card_reset(p_now timestamptz default now()) returns timestamptz
language sql stable set search_path=public as $$ select (public.gw_card_day(p_now)+1+time '06:00') at time zone 'Asia/Dhaka' $$;

-- Returns only revealed faces; unrevealed rewards never leave the database.
create or replace function public.gw_card_board(p_account uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare d public.gw_card_days; faces jsonb;
begin
 select * into d from public.gw_card_days where account_id=p_account and day=public.gw_card_day();
 select jsonb_agg(jsonb_build_object('position',i,'revealed',coalesce(i=any(d.revealed),false),
  'reward',case when i=any(d.revealed) then d.deck->>(i-1) else null end) order by i) into faces from generate_series(1,10) i;
 return jsonb_build_object('day',public.gw_card_day(),'reset_at',public.gw_card_reset(),'server_now',now(),
 'remaining',3-coalesce(cardinality(d.revealed),0),'cards',faces);
end $$;

create or replace function public.gw_card_identity(p_token text) returns uuid
language plpgsql security definer set search_path=public,extensions as $$
declare found_id uuid;
begin
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then return null; end if;
 select a.id into found_id from public.gw_card_sessions s join public.gw_card_accounts a on a.id=s.account_id
 where s.token_hash=encode(digest(p_token,'sha256'),'hex') and s.expires_at>now() and a.active;
 return found_id;
end $$;

create or replace function public.gw_cards_public() returns jsonb
language sql security definer set search_path=public as $$
 select jsonb_build_object('ok',true,'enabled',enabled,'reset_at',public.gw_card_reset(),'server_now',now(),'timezone','Asia/Dhaka') from public.gw_card_settings where id=true
$$;

create or replace function public.gw_cards_login(p_cid text,p_code text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare a public.gw_card_accounts; token text; k text; lim int; tries int; ip text; enabled boolean;
begin
 select s.enabled into enabled from public.gw_card_settings s where id=true;
 if not enabled then return jsonb_build_object('ok',false,'msg','Daily cards are not open yet. Please check back after the Owner enables them.'); end if;
 if length(coalesce(p_cid,''))>40 or length(coalesce(p_code,''))>80 or btrim(coalesce(p_cid,''))='' then return jsonb_build_object('ok',false,'msg','Enter your CID and login code.'); end if;
 ip:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-forwarded-for','unknown');
 -- Limit guesses by both customer and source. Failed attempts return normally so they persist.
 foreach k in array array['cid:'||upper(btrim(p_cid)),'ip:'||split_part(ip,',',1)] loop
  lim:=case when k like 'cid:%' then 10 else 60 end;
  insert into public.gw_card_login_limits(key,started_at,attempts) values(encode(digest(k,'sha256'),'hex'),now(),1)
  on conflict(key) do update set attempts=case when gw_card_login_limits.started_at<now()-interval '10 minutes' then 1 else gw_card_login_limits.attempts+1 end,
   started_at=case when gw_card_login_limits.started_at<now()-interval '10 minutes' then now() else gw_card_login_limits.started_at end
  returning attempts into tries;
  if tries>lim then return jsonb_build_object('ok',false,'msg','Too many login attempts. Wait 10 minutes and try again.'); end if;
 end loop;
 select * into a from public.gw_card_accounts where cid=upper(btrim(p_cid)) and active;
 if not found or a.code_hash<>encode(digest(upper(regexp_replace(btrim(coalesce(p_code,'')),'[ -]','','g')),'sha256'),'hex') then
  return jsonb_build_object('ok',false,'msg','CID or code not recognised, or this account is disabled. Ask the Owner for your login details.');
 end if;
 delete from public.gw_card_login_limits where key=encode(digest('cid:'||a.cid,'sha256'),'hex');
 delete from public.gw_card_sessions where expires_at<=now();
 delete from public.gw_card_login_limits where started_at<now()-interval '1 day';
 token:=encode(gen_random_bytes(32),'hex');
 insert into public.gw_card_sessions values(encode(digest(token,'sha256'),'hex'),a.id,public.gw_card_reset());
 return jsonb_build_object('ok',true,'token',token,'cid',a.cid,'name',a.name,'board',public.gw_card_board(a.id));
end $$;

create or replace function public.gw_cards_status(p_token text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid; a public.gw_card_accounts;
begin
 aid:=public.gw_card_identity(p_token);
 if aid is null then return jsonb_build_object('ok',false,'expired',true,'msg','Sign in with your CID and code for today’s cards.'); end if;
 select * into a from public.gw_card_accounts where id=aid;
 return jsonb_build_object('ok',true,'cid',a.cid,'name',a.name,'enabled',(select enabled from public.gw_card_settings where id=true),'board',public.gw_card_board(aid));
end $$;

create or replace function public.gw_cards_reveal(p_token text,p_position int) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid; d public.gw_card_days; rewards jsonb; enabled boolean;
begin
 aid:=public.gw_card_identity(p_token);
 if aid is null then return jsonb_build_object('ok',false,'expired',true,'msg','Your daily login expired. Sign in again with your CID and code.'); end if;
 if p_position is null or p_position<1 or p_position>10 then return jsonb_build_object('ok',false,'msg','Choose one of the 10 cards.'); end if;
 select s.enabled,s.rewards into enabled,rewards from public.gw_card_settings s where id=true;
 if not enabled then return jsonb_build_object('ok',false,'msg','Daily cards are currently paused. Your revealed cards are saved.'); end if;
 -- Serializes all devices/tabs for this account and day, including the first reveal.
 perform pg_advisory_xact_lock(hashtextextended(aid::text||public.gw_card_day()::text,17));
 select * into d from public.gw_card_days where account_id=aid and day=public.gw_card_day() for update;
 if not found then
  select jsonb_agg(value order by gen_random_bytes(16)) into rewards from jsonb_array_elements(rewards);
  insert into public.gw_card_days(account_id,day,deck) values(aid,public.gw_card_day(),rewards) returning * into d;
 end if;
 if p_position=any(d.revealed) then return jsonb_build_object('ok',true,'board',public.gw_card_board(aid)); end if;
 if cardinality(d.revealed)>=3 then return jsonb_build_object('ok',false,'msg','You have revealed all 3 cards for today. Come back after 6 AM Bangladesh time.','board',public.gw_card_board(aid)); end if;
 update public.gw_card_days set revealed=array_append(revealed,p_position),revealed_at=array_append(revealed_at,now()) where account_id=aid and day=d.day;
 return jsonb_build_object('ok',true,'board',public.gw_card_board(aid));
end $$;

create or replace function public.gw_cards_logout(p_token text) returns jsonb
language sql security definer set search_path=public,extensions as $$
 delete from public.gw_card_sessions where token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex'); select '{"ok":true}'::jsonb;
$$;

create or replace function public.gw_cards_owner_get(p_pin text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; accounts jsonb; activity jsonb;
begin
 auth:=public.gw_order_staff(p_pin,true); if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Owner access required.'); end if;
 select coalesce(jsonb_agg(to_jsonb(a)-'code_hash' order by a.created_at desc),'[]') into accounts from public.gw_card_accounts a;
 select coalesce(jsonb_agg(x order by x.at desc),'[]') into activity from (
  select a.cid,a.name,d.day,d.deck->>(d.revealed[i]-1) reward,d.revealed[i] position,d.revealed_at[i] at
  from public.gw_card_days d join public.gw_card_accounts a on a.id=d.account_id,generate_subscripts(d.revealed,1) i
  order by d.revealed_at[i] desc limit 100
 ) x;
 return jsonb_build_object('ok',true,'settings',(select to_jsonb(s)-'id' from public.gw_card_settings s where id=true),'accounts',accounts,'activity',activity);
end $$;

create or replace function public.gw_cards_owner_save(p_pin text,p_enabled boolean,p_rewards jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb;
begin
 auth:=public.gw_order_staff(p_pin,true); if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can manage daily cards.'); end if;
 if p_enabled is null or jsonb_typeof(p_rewards) is distinct from 'array' then return jsonb_build_object('ok',false,'msg','Enter 10 card rewards.'); end if;
 if jsonb_array_length(p_rewards)<>10 or exists(select 1 from jsonb_array_elements(p_rewards) v where jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 120) then
  return jsonb_build_object('ok',false,'msg','Enter exactly 10 rewards, each from 1 to 120 characters. Use “Try again” for a card without a reward.');
 end if;
 update public.gw_card_settings set enabled=p_enabled,rewards=p_rewards where id=true;
 return '{"ok":true}'::jsonb;
end $$;

create or replace function public.gw_cards_owner_account(p_pin text,p_cid text,p_name text,p_action text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; a public.gw_card_accounts; code text; normalized text;
begin
 auth:=public.gw_order_staff(p_pin,true); if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can manage customer IDs.'); end if;
 normalized:=upper(btrim(coalesce(p_cid,'')));
 if length(normalized) not between 1 and 40 or length(coalesce(p_name,''))>60 then return jsonb_build_object('ok',false,'msg','CID is required (up to 40 characters). Name may be up to 60 characters.'); end if;
 if p_action not in ('create','reset','enable','disable') or p_action is null then return jsonb_build_object('ok',false,'msg','Invalid account action.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,18));
 select * into a from public.gw_card_accounts where cid=normalized for update;
 if p_action='create' and found then return jsonb_build_object('ok',false,'msg','This CID already exists. Reset its code if the customer lost it.'); end if;
 if p_action<>'create' and not found then return jsonb_build_object('ok',false,'msg','Customer CID not found.'); end if;
 if p_action in ('create','reset') then
  code:=upper(encode(gen_random_bytes(12),'hex'));
  if p_action='create' then
   insert into public.gw_card_accounts(cid,name,code_hash) values(normalized,btrim(coalesce(p_name,'')),encode(digest(code,'sha256'),'hex')) returning * into a;
  else
   update public.gw_card_accounts set code_hash=encode(digest(code,'sha256'),'hex') where id=a.id;
  end if;
 else
  update public.gw_card_accounts set active=p_action='enable' where id=a.id;
 end if;
 if p_action in ('reset','disable') then delete from public.gw_card_sessions where account_id=a.id; end if;
 return jsonb_build_object('ok',true,'cid',normalized,'code',code,'msg',case p_action when 'create' then 'Customer created. Copy their code now; it is shown only once.' when 'reset' then 'New code created. The previous code and sessions no longer work. Daily reveals are preserved.' when 'enable' then 'Customer enabled.' else 'Customer disabled.' end);
end $$;

revoke all on function public.gw_card_day(timestamptz),public.gw_card_reset(timestamptz),public.gw_card_board(uuid),public.gw_card_identity(text),public.gw_cards_public(),public.gw_cards_login(text,text),public.gw_cards_status(text),public.gw_cards_reveal(text,int),public.gw_cards_logout(text),public.gw_cards_owner_get(text),public.gw_cards_owner_save(text,boolean,jsonb),public.gw_cards_owner_account(text,text,text,text) from public,anon,authenticated;
grant execute on function public.gw_cards_public(),public.gw_cards_login(text,text),public.gw_cards_status(text),public.gw_cards_reveal(text,int),public.gw_cards_logout(text),public.gw_cards_owner_get(text),public.gw_cards_owner_save(text,boolean,jsonb),public.gw_cards_owner_account(text,text,text,text) to anon,authenticated;
commit;
