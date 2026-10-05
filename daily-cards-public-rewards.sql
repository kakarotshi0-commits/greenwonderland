-- Apply after daily-cards-fulfillment.sql. Public reward collection, never customer results.
begin;
create or replace function public.gw_cards_public() returns jsonb
language sql security definer set search_path=public as $$
 select jsonb_build_object('ok',true,'enabled',s.enabled,'reset_at',public.gw_card_reset(),
 'server_now',now(),'timezone','Asia/Dhaka','displayable_rewards',
 (select coalesce(jsonb_agg(r.reward order by r.first_position),'[]'::jsonb) from (
  select value reward,min(ord) first_position
  from jsonb_array_elements_text(s.rewards) with ordinality t(value,ord)
  where coalesce((s.displayable->>((ord-1)::int))::boolean,false)
  group by value
 ) r)) from public.gw_card_settings s where id=true
$$;
revoke all on function public.gw_cards_public() from public,anon,authenticated;
grant execute on function public.gw_cards_public() to anon,authenticated;
commit;
