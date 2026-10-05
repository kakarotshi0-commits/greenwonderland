-- Owner-chosen, reusable daily-card login codes. Existing codes stay valid.
begin;
create or replace function public.gw_cards_owner_set_code(p_pin text,p_cid text,p_name text,p_code text,p_action text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; a public.gw_card_accounts; normalized text; code text;
begin
 auth:=public.gw_order_staff(p_pin,true);
 if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can set customer login codes.'); end if;
 normalized:=upper(btrim(coalesce(p_cid,''))); code:=upper(btrim(coalesce(p_code,'')));
 if length(normalized) not between 1 and 40 or length(coalesce(p_name,''))>60 then return jsonb_build_object('ok',false,'msg','Enter a CID (up to 40 characters) and an optional name (up to 60 characters).'); end if;
 if code !~ '^[A-Z0-9]{6,32}$' then return jsonb_build_object('ok',false,'msg','Choose a fixed code with 6–32 letters or numbers. Codes are not case-sensitive.'); end if;
 if p_action not in ('create','set_code') or p_action is null then return jsonb_build_object('ok',false,'msg','Invalid account action.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(normalized,18));
 select * into a from public.gw_card_accounts where cid=normalized for update;
 if p_action='create' and found then return jsonb_build_object('ok',false,'msg','This CID already exists. Use Change login code to choose its fixed code.'); end if;
 if p_action='set_code' and not found then return jsonb_build_object('ok',false,'msg','Customer CID not found. Create the customer ID first.'); end if;
 if p_action='create' then
  insert into public.gw_card_accounts(cid,name,code_hash) values(normalized,btrim(coalesce(p_name,'')),encode(digest(code,'sha256'),'hex')) returning * into a;
 else
  if a.code_hash<>encode(digest(code,'sha256'),'hex') then
   update public.gw_card_accounts set code_hash=encode(digest(code,'sha256'),'hex') where id=a.id;
   delete from public.gw_card_sessions where account_id=a.id;
  end if;
 end if;
 return jsonb_build_object('ok',true,'cid',normalized,'code',code,'msg','Fixed login code saved. Use this same CID and code every day. Changing a code does not restore used reveals.');
end $$;
revoke all on function public.gw_cards_owner_set_code(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.gw_cards_owner_set_code(text,text,text,text,text) to anon,authenticated;
commit;
