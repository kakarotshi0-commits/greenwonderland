// Shares sales/invoices and clock-in/out records across browsers (Supabase). Load AFTER crew-sync.js.
// Every request carries the signed-in person's crew code; the server checks it and their role permissions.
(() => {
  const c = window.gwClient; if (!c) return;
  const $ = id => document.getElementById(id);
  const QKEY = 'gw-activity-queue-v1';
  let salesSeq = 0, clockSeq = 0, seenS = STATE.sales.length, seenC = STATE.clock.length, busy = false;
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
  const keyS = s => s.id;
  const keyC = e => e.cid || 'L|' + e.id + '|' + e.type + '|' + e.ts;
  const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch (e) { return []; } };
  const saveQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) {} };
  const owner = it => (it.k === 'sale' ? it.s.employeeId : it.pid);

  // Union by key, oldest first; never removes anything already shown.
  function merge(arr, incoming, key) {
    const m = new Map(arr.map(x => [key(x), x]));
    incoming.forEach(x => m.set(key(x), x));
    const out = [...m.values()].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    arr.splice(0, arr.length, ...out);
  }
  function refresh() {
    try { renderLogs(); } catch (e) {}
    if (signedIn) {
      const st = clockStatusFor(signedIn.id);
      $('clockStatus').textContent = st === 'in' ? 'Clocked in' : 'Clocked out';
      $('clockBtn').textContent = st === 'in' ? 'Clock out' : 'Clock in';
    }
  }
  function drop(it) {
    if (it.k === 'sale') { const i = STATE.sales.findIndex(s => s.id === it.s.id); if (i >= 0) STATE.sales.splice(i, 1); }
    else { const i = STATE.clock.findIndex(e => e.cid === it.cid); if (i >= 0) STATE.clock.splice(i, 1); }
    refresh();
  }
  async function send(it) {
    try {
      const { data, error } = it.k === 'sale'
        ? await c.rpc('sales_add', { p_pin: window.gwPin, p_sale: it.s })
        : await c.rpc('clock_add', { p_pin: window.gwPin, p_type: it.type, p_cid: it.cid });
      if (error) return { net: true, msg: error.message };
      if (!data || data.ok === false) return { rejected: true, msg: (data && data.msg) || 'Not allowed.' };
      return { ok: true };
    } catch (e) { return { net: true, msg: 'No connection.' }; }
  }
  async function push(items) {
    let last = { ok: true };
    for (const it of items) {
      const r = await send(it);
      if (r.ok) continue;
      if (r.rejected) { drop(it); last = { ok: false, reason: r.msg }; }
      else { const q = loadQ(); q.push(it); saveQ(q); last = { ok: false, reason: 'Not shared yet, will retry automatically. (' + r.msg + ')' }; }
    }
    return last;
  }
  async function flush() {   // retry anything that could not be sent earlier (only the signed-in person's own items)
    const q = loadQ(); if (!q.length || !signedIn) return;
    const mine = q.filter(it => owner(it) === signedIn.id); if (!mine.length) return;
    const rest = q.filter(it => !mine.includes(it));
    for (const it of mine) { const r = await send(it); if (r.net) rest.push(it); else if (r.rejected) drop(it); }
    saveQ(rest);
  }

  // Save wrapper: the app calls publishState() right after adding a sale or clock event.
  const prev = publishState;
  publishState = function (opts = {}) {
    if (opts.catalog || opts.crew) return prev(opts);
    const ns = STATE.sales.slice(seenS), nc = STATE.clock.slice(seenC);
    seenS = STATE.sales.length; seenC = STATE.clock.length;
    nc.forEach(e => { e.cid = e.cid || uid(); });
    const items = [...ns.map(s => ({ k: 'sale', s })), ...nc.map(e => ({ k: 'clock', type: e.type, cid: e.cid, pid: e.id }))];
    return (async () => {
      const base = await prev(opts);
      if (!items.length) return base;
      const r = await push(items);
      return r.ok ? { ok: true, shared: true } : r;
    })();
  };

  async function pull() {
    if (busy || !window.gwPin || !signedIn) return;
    busy = true;
    try {
      await flush();
      const { data, error } = await c.rpc('crew_activity_get', { p_pin: window.gwPin, p_sales_since: salesSeq, p_clock_since: clockSeq });
      if (error || !data || data.ok === false) return;
      const s = data.sales || [], k = data.clock || [];
      s.forEach(x => { salesSeq = Math.max(salesSeq, x.seq); });
      k.forEach(x => { clockSeq = Math.max(clockSeq, x.seq); });
      if (s.length) merge(STATE.sales, s, keyS);
      if (k.length) merge(STATE.clock, k, keyC);
      seenS = STATE.sales.length; seenC = STATE.clock.length;
      if (s.length || k.length) { refresh(); await prev({}); }
    } finally { busy = false; }
  }

  // A restored tab has no code in memory, so ask the person to sign in again.
  if (signedIn && !window.gwPin) {
    signedIn = null;
    try { sessionStorage.removeItem('gw_local_signed_in'); } catch (e) {}
    try { renderStaffGrid(); renderCrewPanel(); initPerms(); } catch (e) {}
  }
  window.addEventListener('gw-auth-changed', () => { salesSeq = 0; clockSeq = 0; pull(); });
  setInterval(() => { if (!document.hidden) pull(); }, 5000);
  addEventListener('focus', pull);
  pull();
})();
