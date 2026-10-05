-- Shared roleplay orders. Apply once; keeps existing sales and wheel codes.
begin;
create table if not exists public.gw_orders (
 id uuid primary key,
 token_hash text not null,
 customer_name text not null,
 customer_cid text not null,
 customer_phone text,
 items jsonb not null,
 total numeric(14,2) not null check(total >= 0),
 status text not null default 'pending' check(status in ('pending','confirmed','declined')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 employee_id text,
 employee_name text,
 decline_reason text,
 sale_id text unique,
 reward_code text,
 wheel_name text,
 wheel_id int
);
create index if not exists gw_orders_queue on public.gw_orders(status,created_at desc);
create table if not exists public.gw_manual_codes (
 request_id uuid primary key,
 code text not null unique,
 wheel_id int not null,
 wheel_name text not null,
 owner_id text not null,
 owner_name text not null,
 note text,
 created_at timestamptz not null default now()
);
alter table public.gw_orders enable row level security;
alter table public.gw_manual_codes enable row level security;
revoke all on public.gw_orders, public.gw_manual_codes from public, anon, authenticated;

-- Re-check the shared crew code and sell permission on every staff request.
create or replace function public.gw_order_staff(p_pin text,p_owner boolean default false) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare login jsonb; person jsonb; allowed boolean;
begin
 login := public.crew_login(p_pin);
 if coalesce((login->>'ok')::boolean,false)=false then return login; end if;
 person := login->'person';
 if p_owner then
   allowed := lower(btrim(person->>'role'))='owner';
 else
   select coalesce(bool_or(coalesce((r->'perms'->>'sell')::boolean,false)),false) into allowed
   from public.site_crew c, jsonb_array_elements(c.payload->'roles') r where r->>'name'=person->>'role';
   allowed := allowed or lower(btrim(person->>'role'))='owner';
 end if;
 if not coalesce(allowed,false) then return jsonb_build_object('ok',false,'msg',case when p_owner then 'Only the Owner can generate a manual code.' else 'Your role cannot manage orders.' end); end if;
 return login;
end $$;
revoke all on function public.gw_order_staff(text,boolean) from public,anon,authenticated;

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
   return jsonb_build_object('ok',true,'order',to_jsonb(existing)-'token_hash');
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
 return jsonb_build_object('ok',true,'order',to_jsonb(existing)-'token_hash');
end $$;

create or replace function public.gw_get_order(p_id uuid,p_token text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare o public.gw_orders;
begin
 select * into o from public.gw_orders where id=p_id and token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex');
 if not found then return jsonb_build_object('ok',false,'msg','Order not found. Open your saved private order link.'); end if;
 return jsonb_build_object('ok',true,'order',to_jsonb(o)-'token_hash');
end $$;

create or replace function public.gw_order_queue(p_pin text,p_status text default 'pending') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare who jsonb; orders jsonb;
begin
 who:=public.gw_order_staff(p_pin); if not coalesce((who->>'ok')::boolean,false) then return who; end if;
 select coalesce(jsonb_agg(to_jsonb(o)-'token_hash' order by o.created_at desc),'[]') into orders
 from (select * from public.gw_orders where status=p_status order by created_at desc limit 100) o;
 return jsonb_build_object('ok',true,'orders',orders);
end $$;

-- Confirm, record the sale, and issue at most one eligible reward in one transaction.
create or replace function public.gw_decide_order(p_pin text,p_id uuid,p_decision text,p_reason text default '') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare who jsonb; person jsonb; o public.gw_orders; reward jsonb; sid text;
begin
 who:=public.gw_order_staff(p_pin); if not coalesce((who->>'ok')::boolean,false) then return who; end if;
 if p_decision is null or p_decision not in ('confirmed','declined') or length(coalesce(p_reason,''))>300 then return jsonb_build_object('ok',false,'msg','Choose Confirm or Decline. Keep the reason under 300 characters.'); end if;
 select * into o from public.gw_orders where id=p_id for update;
 if not found then return jsonb_build_object('ok',false,'msg','Order not found.'); end if;
 if o.status<>'pending' then
   if o.status=p_decision then return jsonb_build_object('ok',true,'order',to_jsonb(o)-'token_hash'); end if;
   return jsonb_build_object('ok',false,'msg','Another employee already handled this order. Refresh the queue.');
 end if;
 person:=who->'person';
 if p_decision='confirmed' then
   sid:='order-'||o.id;
   insert into public.gw_sales(id,ts,employee_id,employee_name,employee_role,items,total)
   values(sid,now(),person->>'id',person->>'name',person->>'role',o.items,o.total);
   reward:=public.rw_issue_code(sid,person->>'name',o.total);
   if coalesce((reward->>'ok')::boolean,false)=false and reward->>'msg' is not null then raise exception '%',reward->>'msg'; end if;
 end if;
 update public.gw_orders set status=p_decision,decided_at=now(),employee_id=person->>'id',employee_name=person->>'name',
 decline_reason=case when p_decision='declined' then nullif(btrim(coalesce(p_reason,'')),'') end,
 sale_id=sid,reward_code=reward->>'code',wheel_id=(reward->>'wheel')::int,wheel_name=reward->>'wheel_name' where id=p_id returning * into o;
 return jsonb_build_object('ok',true,'order',to_jsonb(o)-'token_hash');
end $$;

-- Existing POS sales also require staff authorization and use the saved total.
create or replace function public.gw_issue_sale_reward(p_pin text,p_sale_id text) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare who jsonb; s public.gw_sales; c public.rw_codes; wname text; reward jsonb;
begin
 who:=public.gw_order_staff(p_pin); if not coalesce((who->>'ok')::boolean,false) then return who; end if;
 select * into s from public.gw_sales where id=p_sale_id for update;
 if not found then return jsonb_build_object('ok',false,'msg','Save the sale before issuing its reward code.'); end if;
 if s.employee_id is distinct from who->'person'->>'id' and lower(who->'person'->>'role')<>'owner' then return jsonb_build_object('ok',false,'msg','Only the employee who recorded this sale or the Owner can issue its code.'); end if;
 select * into c from public.rw_codes where sale_id=p_sale_id;
 if found then
   if c.wheel_id=1 then select name into wname from public.rw_settings where id=1; else select name into wname from public.rw_wheels where id=c.wheel_id; end if;
   return jsonb_build_object('ok',true,'code',c.code,'wheel',c.wheel_id,'wheel_name',wname);
 end if;
 reward:=public.rw_issue_code(s.id,s.employee_name,s.total);
 if reward->>'code' is null and reward->>'msg' is null then return jsonb_build_object('ok',true,'eligible',false); end if;
 return reward;
end $$;

create or replace function public.gw_owner_generate_code(p_pin text,p_request_id uuid,p_wheel_id int,p_note text default '') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare who jsonb; saved public.gw_manual_codes; wname text; amount numeric; bytes bytea; suffix text; code_text text; i int;
 alpha constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
 who:=public.gw_order_staff(p_pin,true); if not coalesce((who->>'ok')::boolean,false) then return who; end if;
 if p_request_id is null or length(coalesce(p_note,''))>300 then return jsonb_build_object('ok',false,'msg','A request ID and a note under 300 characters are required.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,1));
 select * into saved from public.gw_manual_codes where request_id=p_request_id;
 if found then return jsonb_build_object('ok',true,'code',saved.code,'wheel_name',saved.wheel_name); end if;
 if p_wheel_id=1 then select name,threshold into wname,amount from public.rw_settings where id=1;
 else select name,min_amount into wname,amount from public.rw_wheels where id=p_wheel_id and enabled; end if;
 if wname is null then return jsonb_build_object('ok',false,'msg','Choose an enabled wheel.'); end if;
 loop
   bytes:=gen_random_bytes(8); suffix:='';
   for i in 0..7 loop suffix:=suffix||substr(alpha,(get_byte(bytes,i)%32)+1,1); end loop;
   code_text:='GW-'||substr(suffix,1,4)||'-'||substr(suffix,5,4);
   begin
     insert into public.rw_codes(code,sale_id,employee,amount,wheel_id) values(code_text,'manual-'||p_request_id,who->'person'->>'name',amount,p_wheel_id);
     exit;
   exception when unique_violation then null;
   end;
 end loop;
 insert into public.gw_manual_codes(request_id,code,wheel_id,wheel_name,owner_id,owner_name,note)
 values(p_request_id,code_text,p_wheel_id,wname,who->'person'->>'id',who->'person'->>'name',nullif(btrim(p_note),''));
 return jsonb_build_object('ok',true,'code',code_text,'wheel_name',wname);
end $$;

-- The old unverified issuance endpoint becomes an internal function.
revoke all on function public.rw_issue_code(text,text,numeric) from public,anon,authenticated;
revoke all on function public.gw_place_order(uuid,text,text,text,text,jsonb,numeric),public.gw_get_order(uuid,text),public.gw_order_queue(text,text),public.gw_decide_order(text,uuid,text,text),public.gw_issue_sale_reward(text,text),public.gw_owner_generate_code(text,uuid,int,text) from public;
grant execute on function public.gw_place_order(uuid,text,text,text,text,jsonb,numeric),public.gw_get_order(uuid,text),public.gw_order_queue(text,text),public.gw_decide_order(text,uuid,text,text),public.gw_issue_sale_reward(text,text),public.gw_owner_generate_code(text,uuid,int,text) to anon,authenticated;
commit;
