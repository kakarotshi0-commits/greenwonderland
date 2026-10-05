-- Apply after daily-cards-removal.sql. Reveal actual prizes immediately; fulfillment stays separate.
begin;
create or replace function public.gw_card_board(p_account uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare d public.gw_card_days; faces jsonb; history jsonb;
begin
 select * into d from public.gw_card_days where account_id=p_account and day=public.gw_card_day();
 select jsonb_agg(jsonb_build_object('position',i,'revealed',coalesce(i=any(d.revealed),false),
  'removed',coalesce(z.active,false),'done',c.done_at is not null and not coalesce(z.active,false),'reward',case when not coalesce(z.active,false) and i=any(d.revealed) then d.deck->>(i-1) else null end) order by i)
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
commit;
