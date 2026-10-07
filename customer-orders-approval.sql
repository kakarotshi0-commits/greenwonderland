-- Customer order approval gate and an order queue that includes every status.
-- Apply after customer-orders.sql and reward-wheel-random-claims.sql.
begin;
create or replace function public.gw_order_receipt(o public.gw_orders) returns jsonb
language sql immutable set search_path=public as $$
 select (to_jsonb(o)-'token_hash') || case when o.status='confirmed' then '{}'::jsonb
 else jsonb_build_object('reward_code',null) end;
$$;
revoke all on function public.gw_order_receipt(public.gw_orders) from public,anon,authenticated;
create or replace function public.gw_place_order(p_id uuid,p_token text,p_name text,p_cid text,p_phone text,p_items jsonb,p_expected_total numeric) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare existing public.gw_orders; menu jsonb; item jsonb; entry jsonb; lines jsonb:='[]'; qty int; price numeric; total numeric:=0; seen text[]:='{}'; token_digest text;
begin
 if p_id is null or coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'msg','Start a new order and try again.'); end if;
 token_digest := encode(digest(p_token,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.gw_orders where id=p_id;
 if found then
   if existing.token_hash<>token_digest then return jsonb_build_object('ok',false,'msg','Order access denied.'); end if;
   return jsonb_build_object('ok',true,'order',public.gw_order_receipt(existing));
 end if;
 if btrim(coalesce(p_name,''))='' or length(p_name)>60 or btrim(coalesce(p_cid,''))='' or length(p_cid)>30 or length(coalesce(p_phone,''))>30 then
   return jsonb_build_object('ok',false,'msg','Enter your name and CID. Phone is optional. Keep name under 60 characters and CID/phone under 30.');
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' then return jsonb_build_object('ok',false,'msg','Add products to your order.'); end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>40 then return jsonb_build_object('ok',false,'msg','Choose between 1 and 40 different products.'); end if;
 select payload->'menu' into menu from public.site_catalog where id=true;
 for entry in select jsonb_array_elements(p_items) loop
   if coalesce(entry->>'qty','') !~ '^[1-9][0-9]{0,3}$' or coalesce(entry->>'id','')='' or entry->>'id'=any(seen) then
     return jsonb_build_object('ok',false,'msg','Use one line per product and a quantity from 1 to 9999.');
   end if;
   qty := (entry->>'qty')::int; seen:=array_append(seen,entry->>'id');
   select x into item from jsonb_array_elements(menu) x where x->>'id'=entry->>'id' limit 1;
   if item is null then return jsonb_build_object('ok',false,'msg','A product is no longer available. Refresh the menu and review your order.'); end if;
   price := round((item->>'price')::numeric,2);
   if price is null or price<0 or price>100000000 then return jsonb_build_object('ok',false,'msg','A product price is unavailable. Ask staff for help.'); end if;
   total := total+price*qty;
   lines := lines||jsonb_build_array(jsonb_build_object('id',item->>'id','name',item->>'name','qty',qty,'price',price));
 end loop;
 if total>999999999 or p_expected_total is null or total<>round(p_expected_total,2) then return jsonb_build_object('ok',false,'msg','Prices have changed or the order is too large. Refresh the menu and review your order.'); end if;
 if (select count(*) from public.gw_orders where customer_cid=btrim(p_cid) and status='pending')>=5 then return jsonb_build_object('ok',false,'msg','You already have five pending orders. Wait for staff to review them.'); end if;
 insert into public.gw_orders(id,token_hash,customer_name,customer_cid,customer_phone,items,total)
 values(p_id,token_digest,btrim(p_name),btrim(p_cid),nullif(btrim(coalesce(p_phone,'')),''),lines,total) returning * into existing;
 return jsonb_build_object('ok',true,'order',public.gw_order_receipt(existing));
end $$;

create or replace function public.gw_get_order(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare o public.gw_orders;
begin
 select * into o from public.gw_orders where id=p_id and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex');
 if not found then return jsonb_build_object('ok',false,'msg','Order not found. Open your saved private order link.'); end if;
 return jsonb_build_object('ok',true,'order',public.gw_order_receipt(o));
end $$;

create or replace function public.gw_order_queue(p_pin text,p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare who jsonb; orders jsonb; pending_count bigint;
begin
 who:=public.gw_order_staff(p_pin); if not coalesce((who->>'ok')::boolean,false) then return who; end if;
 if p_status is null or p_status not in ('all','pending','confirmed','declined') then
  return jsonb_build_object('ok',false,'msg','Choose a valid order status.');
 end if;
 select count(*) into pending_count from public.gw_orders where status='pending';
 select coalesce(jsonb_agg(public.gw_order_receipt(o) order by (o.status='pending') desc,o.created_at desc,o.id),'[]') into orders
 from public.gw_orders o where o.id in (
  select id from public.gw_orders where p_status='all' or status=p_status
  order by (status='pending') desc,created_at desc,id limit 100
 );
 return jsonb_build_object('ok',true,'orders',orders,'pending_count',pending_count);
end $$;
CREATE OR REPLACE FUNCTION public.rw_redeem(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  n text; v_code text; rec rw_codes; p jsonb; chosen jsonb;
  total numeric := 0; r numeric; w numeric; entropy bytea; draw numeric := 0; byte_index int;
  wid int; wname text; wtheme text; wprizes jsonb;
begin
  n := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(n) = 8 then n := 'GW' || n; end if;
  if length(n) <> 10 then
    return jsonb_build_object('ok', false, 'msg', 'Enter the full code, for example GW-ABCD-EFGH.');
  end if;
  v_code := 'GW-' || substr(n, 3, 4) || '-' || substr(n, 7, 4);

  select * into rec from rw_codes where code = v_code for update;
  if not found then return jsonb_build_object('ok', false, 'msg', 'That code was not found. Check it and try again.'); end if;
  -- An order-linked code is never usable before the staff decision commits.
  if (rec.sale_id like 'order-%' and not exists (
    select 1 from public.gw_orders o where 'order-'||o.id::text=rec.sale_id and o.status='confirmed'
  )) or exists (
    select 1 from public.gw_orders o where (o.reward_code=rec.code or o.sale_id=rec.sale_id) and o.status<>'confirmed'
  ) then
    return jsonb_build_object('ok',false,'msg','This reward code is inactive. Staff must confirm the order before you can spin.');
  end if;
  if rec.voided then return jsonb_build_object('ok', false, 'msg', 'This code was cancelled by the owner.'); end if;
  if rec.used_at is not null then
    return jsonb_build_object('ok', false, 'msg', 'This code was already used on ' || to_char(rec.used_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC.');
  end if;

  wid := coalesce(rec.wheel_id, 1);
  if wid = 1 then
    select prizes, name, theme into wprizes, wname, wtheme from rw_settings where id = 1;
  else
    select prizes, name, theme into wprizes, wname, wtheme from rw_wheels where id = wid;
  end if;
  if wprizes is null then
    return jsonb_build_object('ok', false, 'msg', 'This wheel is not set up yet. Ask the owner to add rewards.');
  end if;

  for p in select jsonb_array_elements(wprizes) loop
    total := total + greatest((p->>'weight')::numeric, 0);
  end loop;
  if total <= 0 then return jsonb_build_object('ok', false, 'msg', 'The wheel is not set up yet. Ask the owner to add rewards.'); end if;

  /* Fresh entropy for every draw, independent of pooled-session PRNG seeds. */
  entropy := gen_random_bytes(7);
  for byte_index in 0..6 loop
    draw := draw * 256 + get_byte(entropy, byte_index);
  end loop;
  r := (draw / 72057594037927936::numeric) * total;
  for p in select jsonb_array_elements(wprizes) loop
    w := greatest((p->>'weight')::numeric, 0);
    if w > 0 then chosen := p; end if;      -- fallback: last reward with a weight
    r := r - w;
    if r < 0 and w > 0 then chosen := p; exit; end if;
  end loop;

  update rw_codes set used_at = now(), prize_label = chosen->>'label'
  where code = v_code and used_at is null and not voided;
  if not found then return jsonb_build_object('ok', false, 'msg', 'This code was just used.'); end if;

  return jsonb_build_object('ok', true, 'prize', chosen, 'prizes', wprizes,
                            'wheel', jsonb_build_object('id', wid, 'name', wname, 'theme', wtheme));
end $function$;

commit;
