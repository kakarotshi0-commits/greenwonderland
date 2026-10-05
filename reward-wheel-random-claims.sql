-- Independent weighted draws and optional phone numbers.
-- Preserves reward weights, existing codes, winners, and function permissions.
begin;
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
CREATE OR REPLACE FUNCTION public.rw_submit_claim(p_code text, p_name text, p_cid text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare n text; v_code text;
begin
  n := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(n) = 8 then n := 'GW' || n; end if;
  if length(n) <> 10 then return jsonb_build_object('ok', false, 'msg', 'That code is not valid.'); end if;
  v_code := 'GW-' || substr(n, 3, 4) || '-' || substr(n, 7, 4);

  if btrim(coalesce(p_name, '')) = '' or btrim(coalesce(p_cid, '')) = '' then
    return jsonb_build_object('ok', false, 'msg', 'Please enter your name and CID. Phone number is optional.');
  end if;
  if length(p_name) > 60 or length(p_cid) > 30 or length(coalesce(p_phone, '')) > 30 then
    return jsonb_build_object('ok', false, 'msg', 'One of the boxes is too long.');
  end if;

  update rw_codes
     set claim_name = btrim(p_name), claim_cid = btrim(p_cid), claim_phone = nullif(btrim(coalesce(p_phone, '')), ''), claimed_at = now()
   where code = v_code and used_at is not null and not voided and claimed_at is null
     and used_at > now() - interval '1 hour';
  if not found then
    return jsonb_build_object('ok', false, 'msg', 'Your details could not be saved. They may already have been sent.');
  end if;
  return jsonb_build_object('ok', true);
end $function$;
commit;
