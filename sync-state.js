/* Green Wonderland - shared roster, roles, sales and attendance (no password) */
(function () {
  'use strict';
  var ROW = 'state';
  var ENDPOINT = GW_URL + '/rest/v1/app_state';
  var HEAD = { apikey: GW_KEY, 'Content-Type': 'application/json' };
  var POLL_MS = 20000;
  var pushing = false, again = false, pendingRender = false, retryTimer = null;
  var base = snap();

  function snap() {
    return { roster: JSON.stringify(STATE.roster), roles: JSON.stringify(STATE.roles) };
  }
  function rosterDirty() { return JSON.stringify(STATE.roster) !== base.roster; }
  function rolesDirty() { return JSON.stringify(STATE.roles) !== base.roles; }

  function union(a, b, keyFn) {
    var map = {};
    (a || []).concat(b || []).forEach(function (x) { map[keyFn(x)] = x; });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return x.ts < y.ts ? -1 : x.ts > y.ts ? 1 : 0; });
  }

  function merged(rd) {
    rd = rd || {};
    return {
      roster: (rd.roster && !rosterDirty()) ? rd.roster : STATE.roster,
      roles: (rd.roles && !rolesDirty()) ? rd.roles : STATE.roles,
      sales: union(rd.sales, STATE.sales, function (s) { return s.id; }),
      clock: union(rd.clock, STATE.clock, function (c) { return c.id + '|' + c.type + '|' + c.ts; })
    };
  }

  function apply(d, pushed) {
    var rd = rosterDirty(), ld = rolesDirty();
    var before = JSON.stringify([STATE.roster, STATE.roles, STATE.sales, STATE.clock]);
    STATE.roster = d.roster; STATE.roles = d.roles; STATE.sales = d.sales; STATE.clock = d.clock;
    var changed = before !== JSON.stringify([STATE.roster, STATE.roles, STATE.sales, STATE.clock]);
    if (pushed) { base = snap(); }
    else {
      if (!rd) base.roster = JSON.stringify(STATE.roster);
      if (!ld) base.roles = JSON.stringify(STATE.roles);
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (e) {}
    return changed;
  }

  function setStatus(text) {
    var el = document.getElementById('gw-sync-status');
    if (!el) {
      el = document.createElement('p');
      el.id = 'gw-sync-status';
      el.className = 'msg';
      var f = document.querySelector('footer');
      if (f) f.appendChild(el);
    }
    el.textContent = text;
  }

  function rerender() {
    var el = document.activeElement, tag = el && el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { pendingRender = true; return; }
    pendingRender = false;
    if (signedIn) {
      signedIn = STATE.roster.find(function (p) { return p.id === signedIn.id; }) || null;
    }
    renderStaffGrid(); renderCrewPanel(); initPerms(); renderLogs();
  }

  async function fetchRemote() {
    var r = await fetch(ENDPOINT + '?id=eq.' + ROW + '&select=data,updated_at', { headers: HEAD, cache: 'no-store' });
    if (!r.ok) throw new Error('read failed ' + r.status);
    var rows = await r.json();
    return rows[0] || null;
  }

  async function push() {
    if (pushing) { again = true; return; }
    pushing = true;
    try {
      var remote = await fetchRemote();
      var d = merged(remote && remote.data);
      var res = await fetch(ENDPOINT + '?on_conflict=id', {
        method: 'POST',
        headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, HEAD),
        body: JSON.stringify({ id: ROW, data: d })
      });
      if (!res.ok) throw new Error('write failed ' + res.status);
      if (apply(d, true)) rerender();
      setStatus('Synced ' + new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('[GWSync]', e.message);
      setStatus('Sync problem - will retry');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(push, 10000);
    } finally {
      pushing = false;
      if (again) { again = false; push(); }
    }
  }

  async function pull() {
    if (pushing) return;
    try {
      var remote = await fetchRemote();
      if (!remote || !remote.data) {
        if (STATE.sales.length || STATE.clock.length) await push();
        return;
      }
      var d = merged(remote.data);
      var changed = apply(d, false);
      var unsynced = d.sales.length !== (remote.data.sales || []).length ||
                     d.clock.length !== (remote.data.clock || []).length ||
                     rosterDirty() || rolesDirty();
      if (changed) rerender();
      if (unsynced) push(); else setStatus('Synced ' + new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('[GWSync]', e.message);
      setStatus('Offline - using data saved on this device');
    }
  }

  function poll() {
    if (document.hidden) return;
    if (pendingRender) rerender();
    pull();
  }

  window.addEventListener('load', function () {
    var prev = window.publishState;
    window.publishState = async function () {
      var result = await prev.apply(this, arguments);
      push();
      return result;
    };
    pull();
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  });
})();
