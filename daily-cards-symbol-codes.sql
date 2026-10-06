-- Apply after daily-cards-immediate-reveal.sql. Preserve symbols in new fixed codes.
begin;
alter table public.gw_card_accounts add column if not exists code_format text not null default 'legacy';
create or replace function public.gw_cards_owner_set_code(p_pin text,p_cid text,p_name text,p_code text,p_action text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; a public.gw_card_accounts; normalized text; code text;
begin
 auth:=public.gw_order_staff(p_pin,true);
 if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can set customer login codes.'); end if;
 normalized:=upper(btrim(coalesce(p_cid,''))); code:=upper(btrim(coalesce(p_code,'')));
 if length(normalized) not between 1 and 40 or length(coalesce(p_name,''))>60 then return jsonb_build_object('ok',false,'msg','Enter a CID (up to 40 characters) and an optional name (up to 60 characters).'); end if;
 if length(code) not between 6 and 32 or code ~ '[[:space:][:cntrl:]]' then return jsonb_build_object('ok',false,'msg','Choose a fixed code with 6–32 characters: letters, numbers and symbols, without spaces. Codes are not case-sensitive.'); end if;
 if p_action not in ('create','set_code') or p_action is null then return jsonb_build_object('ok',false,'msg','Invalid account action.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,18));
 select * into a from public.gw_card_accounts where cid=normalized for update;
 if p_action='create' and found then return jsonb_build_object('ok',false,'msg','This CID already exists. Use Change login code to choose its fixed code.'); end if;
 if p_action='set_code' and not found then return jsonb_build_object('ok',false,'msg','Customer CID not found. Create the customer ID first.'); end if;
 if p_action='create' then
  insert into public.gw_card_accounts(cid,name,code_hash,code_format) values(normalized,btrim(coalesce(p_name,'')),encode(digest(code,'sha256'),'hex'),'symbols') returning * into a;
 else
  if a.code_hash<>encode(digest(code,'sha256'),'hex') then
   update public.gw_card_accounts set code_hash=encode(digest(code,'sha256'),'hex') where id=a.id;
   delete from public.gw_card_sessions where account_id=a.id;
  end if;
  update public.gw_card_accounts set code_format='symbols' where id=a.id and code_format<>'symbols';
 end if;
 return jsonb_build_object('ok',true,'cid',normalized,'code',code,'msg','Fixed login code saved. Use this same CID and code every day. Changing a code does not restore used reveals.');
end $$;
revoke all on function public.gw_cards_owner_set_code(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gw_cards_owner_set_code(text,text,text,text,text) to anon,authenticated;
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
 if not found or a.code_hash<>encode(digest(case when a.code_format='symbols' then upper(btrim(coalesce(p_code,''))) else upper(regexp_replace(btrim(coalesce(p_code,'')),'[ -]','','g')) end,'sha256'),'hex') then
  return jsonb_build_object('ok',false,'msg','CID or code not recognised, or this account is disabled. Ask the Owner for your login details.');
 end if;
 delete from public.gw_card_login_limits where key=encode(digest('cid:'||a.cid,'sha256'),'hex');
 delete from public.gw_card_sessions where expires_at<=now();
 delete from public.gw_card_login_limits where started_at<now()-interval '1 day';
 token:=encode(gen_random_bytes(32),'hex');
 insert into public.gw_card_sessions values(encode(digest(token,'sha256'),'hex'),a.id,public.gw_card_reset());
 return jsonb_build_object('ok',true,'token',token,'cid',a.cid,'name',a.name,'board',public.gw_card_board(a.id));
end $$;
commit;
