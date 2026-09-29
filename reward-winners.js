/* Green Wonderland - Reward winners: employee claims panel + public winners list.
 * Load AFTER reward-wheel.js. Run reward-winners.sql in Supabase once first. */
(function (global) {
  'use strict';

  var cfg = { supabaseUrl: '', supabaseKey: '', canStaff: function () { return false; }, staffName: function () { return ''; } };
  var pass = null, overlay = null, staffBtn = null, listEl = null;

  function rpc(fn, args) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return Promise.reject(new Error('Missing Supabase URL or key.'));
    var headers = { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(cfg.supabaseKey)) headers.Authorization = 'Bearer ' + cfg.supabaseKey;
    return fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && j.message) || 'Request failed (' + r.status + ')');
          return j;
        });
      });
  }
  function h(tag, props) {
    var el = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    for (var k in (props || {})) {
      var v = props[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    (function add(list) {
      list.forEach(function (kid) {
        if (kid == null || kid === false) return;
        if (Array.isArray(kid)) return add(kid);
        el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }
  function can() { try { return !!cfg.canStaff(); } catch (e) { return false; } }
  function who() { try { return String(cfg.staffName() || ''); } catch (e) { return ''; } }
  function fmt(d) { return d ? new Date(d).toLocaleString() : '-'; }

  /* ---------- modal (uses the wheel's styles) ---------- */
  function onKey(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener('keydown', onKey);
  }
  function openModal(title, body) {
    closeModal();
    overlay = h('div', { class: 'gwrw-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'gwrw-modal gwrw-wide' },
        h('div', { class: 'gwrw-head' }, h('h2', null, title),
          h('button', { class: 'gwrw-x', 'aria-label': 'Close', onclick: closeModal }, '\u00d7')),
        body));
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    var f = overlay.querySelector('input,button.gwrw-primary'); if (f) f.focus();
  }

  /* ---------- public winners section (no CID) ---------- */
  function loadWinners() {
    if (!listEl) return;
    rpc('rw_public_winners').then(function (rows) {
      listEl.textContent = '';
      if (!rows || !rows.length) { listEl.appendChild(h('p', { class: 'sub' }, 'No reward winners yet.')); return; }
      listEl.appendChild(h('div', { class: 'gwrw-wscroll' }, h('table', { class: 'gwrw-wtable' },
        h('thead', null, h('tr', null, h('th', null, 'In-game name'), h('th', null, 'Phone'), h('th', null, 'Reward'), h('th', null, 'Won on'), h('th', null, 'Status'))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null, h('td', null, r.name), h('td', null, r.phone), h('td', null, r.prize),
            h('td', null, new Date(r.used_at).toLocaleDateString()),
            h('td', { class: r.given ? 'gwrw-given' : 'gwrw-wait' }, r.given ? 'Reward given' + (r.given_by ? ' (' + r.given_by + ')' : '') : 'Waiting'));
        })))));
    }).catch(function (e) { listEl.textContent = 'Could not load the winners: ' + e.message; });
  }
  function mountSection() {
    if (!document.getElementById('winners')) {
      listEl = h('div', { id: 'winnersList' }, 'Loading\u2026');
      var sec = h('section', { id: 'winners' }, h('div', { class: 'wrap' },
        h('div', { class: 'section-head' }, h('h2', null, 'Reward Winners'), h('span', { class: 'sub' }, 'Players who won on the reward wheel')),
        listEl));
      var about = document.getElementById('about');
      if (about && about.parentNode) about.parentNode.insertBefore(sec, about); else document.body.appendChild(sec);
      var nav = document.querySelector('.navlinks'), ref = document.getElementById('codeSigninLink');
      if (nav) nav.insertBefore(h('a', { href: '#winners' }, 'Winners'), ref && ref.parentNode === nav ? ref : null);
    } else listEl = document.getElementById('winnersList');
  }

  /* ---------- employee panel (full details + Mark as given) ---------- */
  function openStaff() {
    if (!can()) return;
    var body = h('div', { class: 'gwrw-body' }), onlyWaiting = false;
    openModal('Reward claims', body);
    pass = ''; load();

    function showError(text) {
      body.textContent = '';
      body.appendChild(h('p', { class: 'gwrw-msg gwrw-err' }, text));
    }
    function load() {
      body.textContent = 'Loading\u2026';
      rpc('rw_claims_list', { p_pin: pass }).then(render).catch(function (e) { showError(e.message); });
    }
    function render(res) {
      var rows = res.claims || [];
      var msg = h('p', { class: 'gwrw-msg', 'aria-live': 'polite' });
      var chk = h('input', { type: 'checkbox', onchange: function (e) { onlyWaiting = e.target.checked; render(res); } });
      chk.checked = onlyWaiting;
      var shownRows = rows.filter(function (c) { return !(onlyWaiting && c.reward_given); });

      var trs = shownRows.map(function (c) {
        var toggle = h('button', { class: 'gwrw-btn', onclick: function () {
          toggle.disabled = true;
          rpc('rw_claim_set_given', { p_pin: pass, p_code: c.code, p_given: !c.reward_given, p_by: who() })
            .then(function () { load(); loadWinners(); })
            .catch(function (e) { toggle.disabled = false; msg.className = 'gwrw-msg gwrw-err'; msg.textContent = e.message; });
        } }, c.reward_given ? 'Undo' : 'Mark as given');
        return h('tr', null,
          h('td', null, c.claim_name || '(no details sent)'),
          h('td', { class: 'gwrw-mono' }, c.claim_cid || '-'),
          h('td', null, c.claim_phone || '-'),
          h('td', null, c.prize_label || '-'),
          h('td', null, fmt(c.used_at)),
          h('td', null, c.reward_given ? 'Given' + (c.given_by ? ' by ' + c.given_by : '') + ' \u00b7 ' + fmt(c.given_at) : 'Waiting'),
          h('td', null, toggle));
      });

      body.textContent = '';
      body.appendChild(h('div', null,
        h('p', { class: 'gwrw-hint' }, 'These details are private to employees. Press Mark as given after you hand the reward to the winner.'),
        h('label', { class: 'gwrw-hint' }, chk, ' Hide rewards already given'),
        shownRows.length
          ? h('div', { class: 'gwrw-scroll' }, h('table', { class: 'gwrw-table' },
              h('thead', null, h('tr', null, h('th', null, 'In-game name'), h('th', null, 'CID'), h('th', null, 'Phone'), h('th', null, 'Reward'), h('th', null, 'Won'), h('th', null, 'Status'), h('th'))),
              h('tbody', null, trs)))
          : h('p', { class: 'gwrw-hint' }, rows.length ? 'Nothing is waiting.' : 'No wheel spins yet.'),
        msg));
    }
  }

  /* ---------- button + styles ---------- */
  function refresh() {
    if (!can()) pass = null;
    if (staffBtn) staffBtn.hidden = !can();
  }
  function mountButton() {
    var dock = document.querySelector('.gwrw-dock');
    if (!dock) { dock = h('div', { class: 'gwrw-dock' }); document.body.appendChild(dock); }
    staffBtn = h('button', { class: 'gwrw-fab gwrw-fab-alt', onclick: openStaff }, 'Reward claims');
    dock.appendChild(staffBtn);
    refresh(); setInterval(refresh, 1500);
  }
  function injectCss() {
    var css = [
      '.gwrw-wscroll{overflow-x:auto}',
      '.gwrw-wtable{width:100%;border-collapse:collapse;font-size:.92rem}',
      '.gwrw-wtable th,.gwrw-wtable td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line,#d5e6da);white-space:nowrap}',
      '.gwrw-wtable th{color:var(--muted,#4b6355);font-weight:600;font-size:.8rem}',
      '.gwrw-given{color:var(--lime,#1a7a43);font-weight:600}',
      '.gwrw-wait{color:var(--muted,#4b6355)}'
    ].join('\n');
    var el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
  }

  function init(options) {
    for (var k in (options || {})) cfg[k] = options[k];
    injectCss(); mountSection(); loadWinners(); mountButton();
    setInterval(loadWinners, 60000);
  }
  global.RewardWinners = { init: init, refresh: loadWinners };
})(window);
