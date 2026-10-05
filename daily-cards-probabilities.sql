-- Owner-defined percentages for daily cards. Existing daily decks stay unchanged.
begin;
alter table public.gw_card_settings add column if not exists probabilities jsonb not null default '[10,10,10,10,10,10,10,10,10,10]';

create or replace function public.gw_card_weighted_deck(p_rewards jsonb,p_probabilities jsonb) returns jsonb
language plpgsql volatile security definer set search_path=public,extensions as $$
declare limits int[]:='{}'; total int:=0; v jsonb; chance numeric; bytes bytea; draw int; i int; j int; deck jsonb:='[]';
begin
 if jsonb_typeof(p_rewards) is distinct from 'array' or jsonb_typeof(p_probabilities) is distinct from 'array' then raise exception 'Invalid card settings'; end if;
 if jsonb_array_length(p_rewards)<>10 or jsonb_array_length(p_probabilities)<>10 then raise exception 'Expected 10 rewards and probabilities'; end if;
 for v in select value from jsonb_array_elements(p_probabilities) loop
  if jsonb_typeof(v)<>'number' then raise exception 'Probabilities must be numbers'; end if;
  chance:=(v#>>'{}')::numeric;
  if chance<0 or chance>100 or chance<>round(chance,2) then raise exception 'Probability must be 0 to 100 with at most 2 decimal places'; end if;
  total:=total+(chance*100)::int; limits:=array_append(limits,total);
 end loop;
 if total<>10000 then raise exception 'Probabilities must total 100 percent'; end if;
 for i in 1..10 loop
  -- Rejection sampling avoids modulo bias in the 10,000 equally likely outcomes.
  loop
   bytes:=gen_random_bytes(2); draw:=get_byte(bytes,0)*256+get_byte(bytes,1);
   exit when draw<60000;
  end loop;
  draw:=draw%10000;
  for j in 1..10 loop
   if draw<limits[j] then deck:=deck||jsonb_build_array(p_rewards->>(j-1)); exit; end if;
  end loop;
 end loop;
 return deck;
end $$;

create or replace function public.gw_cards_owner_save_probabilities(p_pin text,p_enabled boolean,p_rewards jsonb,p_probabilities jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare auth jsonb; v jsonb; chance numeric; total numeric:=0;
begin
 auth:=public.gw_order_staff(p_pin,true);
 if not coalesce((auth->>'ok')::boolean,false) then return jsonb_build_object('ok',false,'msg','Only the Owner can set reward probabilities.'); end if;
 if p_enabled is null or jsonb_typeof(p_rewards) is distinct from 'array' or jsonb_typeof(p_probabilities) is distinct from 'array' then
  return jsonb_build_object('ok',false,'msg','Enter 10 rewards and their probabilities.'); end if;
 if jsonb_array_length(p_rewards)<>10 or jsonb_array_length(p_probabilities)<>10 or exists(select 1 from jsonb_array_elements(p_rewards) reward_entry where jsonb_typeof(reward_entry)<>'string' or length(btrim(reward_entry#>>'{}')) not between 1 and 120) then
  return jsonb_build_object('ok',false,'msg','Enter 10 reward names (1–120 characters each) and 10 probabilities.'); end if;
 for v in select value from jsonb_array_elements(p_probabilities) loop
  if jsonb_typeof(v)<>'number' then return jsonb_build_object('ok',false,'msg','Probabilities must be numbers.'); end if;
  chance:=(v#>>'{}')::numeric;
  if chance<0 or chance>100 or chance<>round(chance,2) then return jsonb_build_object('ok',false,'msg','Use percentages from 0 to 100 with up to 2 decimal places.'); end if;
  total:=total+chance;
 end loop;
 if total<>100 then return jsonb_build_object('ok',false,'msg','Probabilities must add up to exactly 100%.'); end if;
 update public.gw_card_settings set enabled=p_enabled,rewards=p_rewards,probabilities=p_probabilities where id=true;
 return '{"ok":true}'::jsonb;
end $$;

create or replace function public.gw_cards_reveal(p_token text,p_position int) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid; d public.gw_card_days; rewards jsonb; probabilities jsonb; enabled boolean;
begin
 aid:=public.gw_card_identity(p_token);
 if aid is null then return jsonb_build_object('ok',false,'expired',true,'msg','Your daily login expired. Sign in again with your CID and code.'); end if;
 if p_position is null or p_position<1 or p_position>10 then return jsonb_build_object('ok',false,'msg','Choose one of the 10 cards.'); end if;
 select s.enabled,s.rewards,s.probabilities into enabled,rewards,probabilities from public.gw_card_settings s where id=true;
 if not enabled then return jsonb_build_object('ok',false,'msg','Daily cards are currently paused. Your revealed cards are saved.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(aid::text||public.gw_card_day()::text,17));
 select * into d from public.gw_card_days where account_id=aid and day=public.gw_card_day() for update;
 if not found then
  rewards:=public.gw_card_weighted_deck(rewards,probabilities);
  insert into public.gw_card_days(account_id,day,deck) values(aid,public.gw_card_day(),rewards) returning * into d;
 end if;
 if p_position=any(d.revealed) then return jsonb_build_object('ok',true,'board',public.gw_card_board(aid)); end if;
 if cardinality(d.revealed)>=3 then return jsonb_build_object('ok',false,'msg','You have revealed all 3 cards for today. Come back after 6 AM Bangladesh time.','board',public.gw_card_board(aid)); end if;
 update public.gw_card_days set revealed=array_append(revealed,p_position),revealed_at=array_append(revealed_at,now()) where account_id=aid and day=d.day;
 return jsonb_build_object('ok',true,'board',public.gw_card_board(aid));
end $$;
revoke all on function public.gw_card_weighted_deck(jsonb,jsonb),public.gw_cards_owner_save_probabilities(text,boolean,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.gw_cards_owner_save_probabilities(text,boolean,jsonb,jsonb) to anon,authenticated;
commit;
