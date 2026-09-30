/* Green Wonderland: shared sales + attendance (Supabase).
   Sales and clock events are saved to the database, not the browser.
   Load AFTER the other scripts (it wraps publishState / msgFor). */
(() => {
  'use strict';
  const API = 'https://wtiefpuczygmyjaampdg.supabase.co';
  const KEY = 'sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif';
  const LOCAL_KEY = typeof STORAGE_KEY === 'string' ? STORAGE_KEY : 'green-wonderland-local-v1';
  const POLL_MS = 20000, PAGE = 1000, MAX_PAGES = 20;
  const syncedSales = new Set(), syncedClock = new Set();
  const removedSales = new Set();   // sales the Owner removed; never show or re-upload them
  let queue = Promise.resolve(), refreshing = false, lastOk = null;

  const evidOf = c => c.evid || (c.evid = 'c-' + c.id + '-' + c.type + '-' + c.ts);

  async function api(path, options = {}) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(API + '/rest/v1/' + path, {
        ...options, signal: ctl.signal,
        headers: { apikey: KEY, 'Content-Type': 'application/json', ...options.headers }
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Server error ' + res.status);
      }
      return res.status === 204 ? null : res.json().catch(() => null);
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Connection timed out.' : (e.message || 'No connection.'));
    } finally { clearTimeout(timer); }
  }

  const saleRow = s => ({ id: String(s.id), ts: s.ts, employee_id: s.employeeId || null, employee_name: s.employeeName,
    employee_role: s.employeeRole || null, items: s.items, total: Number(s.total) });
  const clockRow = c => ({ evid: evidOf(c), ts: c.ts, employee_id: c.id, employee_name: c.name || null,
    employee_role: c.role || null, type: c.type });
  const saleFrom = r => ({ id: r.id, ts: r.ts, employeeId: r.employee_id, employeeName: r.employee_name,
    employeeRole: r.employee_role, items: r.items || [], total: Number(r.total) });
  const clockFrom = r => ({ evid: r.evid, id: r.employee_id, name: r.employee_name, role: r.employee_role, type: r.type, ts: r.ts });
  const validSale = s => s && s.id && Array.isArray(s.items) && Number.isFinite(Number(s.total)) && Number.isFinite(Date.parse(s.ts));
  const validClock = c => c && c.id && (c.type === 'in' || c.type === 'out') && Number.isFinite(Date.parse(c.ts));
  const byTs = (a, b) => Date.parse(a.ts) - Date.parse(b.ts);

  const pendingCount = () =>
    STATE.sales.filter(s => s && !syncedSales.has(String(s.id))).length +
    STATE.clock.filter(c => c && !syncedClock.has(evidOf(c))).length;

  async function doFlush() {
    const sales = STATE.sales.filter(s => validSale(s) && !syncedSales.has(String(s.id)));
    const clock = STATE.clock.filter(c => validClock(c) && !syncedClock.has(evidOf(c)));
    try {
      const opt = { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } };
      if (sales.length) { await api('gw_sales?on_conflict=id', { ...opt, body: JSON.stringify(sales.map(saleRow)) }); sales.forEach(s => syncedSales.add(String(s.id))); }
      if (clock.length) { await api('gw_clock?on_conflict=evid', { ...opt, body: JSON.stringify(clock.map(clockRow)) }); clock.forEach(c => syncedClock.add(evidOf(c))); }
      return { ok: true, shared: true };
    } catch (e) { return { ok: false, shared: true, reason: e.message }; }
  }
  const flush = () => (queue = queue.then(doFlush, doFlush));

  async function fetchAll(table, order) {
    const rows = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      const part = await api(table + '?select=*&order=' + order + '&limit=' + PAGE + '&offset=' + (p * PAGE));
      rows.push(...(part || []));
      if (!part || part.length < PAGE) break;
    }
    return rows;
  }

  function status(text) {
    let el = document.getElementById('gwSyncStatus');
    if (!el) {
      const box = document.getElementById('reportsBlock'); if (!box) return;
      el = document.createElement('div'); el.id = 'gwSyncStatus'; el.className = 'sub'; el.style.margin = '10px 0';
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn small'; btn.textContent = 'Refresh now'; btn.style.marginLeft = '10px';
      btn.addEventListener('click', () => cycle());
      const span = document.createElement('span'); span.id = 'gwSyncText'; el.append(span, btn); box.prepend(el);
    }
    document.getElementById('gwSyncText').textContent = text;
  }

  function refreshClockUI() {
    if (!signedIn) return;
    const s = clockStatusFor(signedIn.id);
    document.getElementById('clockStatus').textContent = s === 'in' ? 'Clocked in' : 'Clocked out';
    document.getElementById('clockBtn').textContent = s === 'in' ? 'Clock out' : 'Clock in';
  }

  async function refresh() {
    if (refreshing || !signedIn) return;
    refreshing = true;
    try {
      const perms = getPerms(signedIn.role);
      const clockRows = await fetchAll('gw_clock', 'ts.asc');
      clockRows.forEach(r => syncedClock.add(r.evid));
      const local = STATE.clock.filter(c => validClock(c) && !syncedClock.has(evidOf(c)));
      STATE.clock = [...clockRows.map(clockFrom), ...local].sort(byTs);
      if (perms.reports) {
        const saleRows = (await fetchAll('gw_sales', 'ts.asc')).filter(r => !removedSales.has(String(r.id)));
        saleRows.forEach(r => syncedSales.add(r.id));
        const localSales = STATE.sales.filter(s => validSale(s) && !syncedSales.has(String(s.id)));
        STATE.sales = [...saleRows.map(saleFrom), ...localSales].sort(byTs);
        status('Shared records, updated ' + new Date().toLocaleTimeString());
      }
      if (typeof gwSeenSales !== 'undefined') gwSeenSales = STATE.sales.length; // keeps reward-code logic in step
      lastOk = Date.now();
      refreshClockUI(); renderLogs();
    } catch (e) {
      if (signedIn && getPerms(signedIn.role).reports) status('Could not load shared records (' + e.message + '). Showing what is already loaded.');
    } finally { refreshing = false; }
  }
  const cycle = async () => { await flush(); await refresh(); };

  // Remove sales/clock data from browser storage; upload any old local records first.
  function readLocal() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || null; } catch (e) { return null; } }
  function scrubLocal() {
    try {
      const saved = readLocal(); if (!saved || (!('sales' in saved) && !('clock' in saved))) return;
      delete saved.sales; delete saved.clock; localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));
    } catch (e) {}
  }
  async function migrateLegacy() {
    const saved = readLocal(); if (!saved) return;
    const sales = (saved.sales || []).filter(validSale), clock = (saved.clock || []).filter(validClock);
    try {
      const opt = { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } };
      if (sales.length) await api('gw_sales?on_conflict=id', { ...opt, body: JSON.stringify(sales.map(saleRow)) });
      if (clock.length) await api('gw_clock?on_conflict=evid', { ...opt, body: JSON.stringify(clock.map(clockRow)) });
      scrubLocal();
    } catch (e) { console.warn('Old local records not uploaded yet; will retry next visit.', e.message); }
  }

  // ---- Owner: remove a recorded sale for everyone ----
  const isOwnerRole = () => !!signedIn && String(signedIn.role || '').trim().toLowerCase() === 'owner';
  async function removeSale(id) {
    if (!confirm('Remove this sale for everyone? This cannot be undone.')) return;
    if (!window.gwPin && window.gwEnsurePin) window.gwEnsurePin();   // asks for the Owner code if this tab lost it
    if (!window.gwPin) { alert('Owner code needed to remove a sale.'); return; }
    try {
      const res = await api('rpc/gw_owner_delete', { method: 'POST', body: JSON.stringify({ p_pin: window.gwPin, p_kind: 'sale', p_key: String(id) }) });
      if (!res || res.ok === false) throw new Error((res && res.msg) || 'Not allowed.');
    } catch (e) { window.gwPin = null; alert('Could not remove: ' + e.message); return; }
    removedSales.add(String(id)); syncedSales.add(String(id));
    const i = STATE.sales.findIndex(x => String(x.id) === String(id)); if (i >= 0) STATE.sales.splice(i, 1);
    if (typeof gwSeenSales !== 'undefined') gwSeenSales = STATE.sales.length; // keeps reward-code logic in step
    renderLogs();
  }
  function addRemoveButtons() {
    if (!isOwnerRole()) return;
    const box = document.getElementById('salesLog'); if (!box) return;
    box.querySelectorAll('[data-sid]').forEach(row => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small'; b.textContent = 'Remove'; b.style.marginLeft = '10px';
      b.addEventListener('click', () => removeSale(row.dataset.sid));
      row.appendChild(b);
    });
  }
  const baseRenderLogs = renderLogs;
  renderLogs = function () { baseRenderLogs.apply(this, arguments); addRemoveButtons(); };

  // Sales / clock saves (publishState called with no options) go to the shared database.
  const originalPublish = publishState, originalMsg = msgFor;
  publishState = async function (opts) {
    if (opts) { const r = await originalPublish.apply(this, arguments); scrubLocal(); return r; }
    const r = await flush(); if (r.ok) refresh(); return r;
  };
  msgFor = function (r) {
    if (r && r.shared) return r.ok ? 'Saved for everyone.' : 'NOT saved yet: ' + r.reason + ' Keep this page open. It retries automatically.';
    return originalMsg(r);
  };

  window.addEventListener('beforeunload', e => { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('gw-permissions-changed', () => { refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cycle(); });
  window.addEventListener('online', cycle);
  setInterval(() => { if (!document.hidden) cycle(); }, POLL_MS);

  migrateLegacy().then(cycle);
})();
