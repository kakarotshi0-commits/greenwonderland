/* Green Wonderland - Reward Wheel (shared version, backed by Supabase)
 * No dependencies. Run reward-wheel-setup.sql in Supabase once first.
 *
 *   <script src="reward-wheel.js"></script>
 *   RewardWheel.init({
 *     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',   // same values your gallery already uses
 *     supabaseKey: 'YOUR-PUBLIC-ANON-KEY',
 *     canManage: () => currentUserIsOwnerOrAdmin()
 *   });
 *   // when a sale is finalized:
 *   RewardWheel.onSale({ id: sale.id, employee: sale.employeeName, total: sale.total });
 */
(function (global) {
  'use strict';

  var PALETTE = ['#2f9e5a', '#e8a317', '#3b82c4', '#c8453b', '#8a5cc2', '#1f8a8a', '#d9683f', '#6b7d2f'];
  var TAU = Math.PI * 2;
  var cfg = { supabaseUrl: '', supabaseKey: '', canManage: function () { return false; }, currency: '$', dock: true };
  var overlay = null, raf = 0, adminBtn = null, adminPin = null, settingsCache = null;

  /* ---------- server calls ---------- */
  function rpc(fn, args) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return Promise.reject(new Error('The reward wheel is missing its Supabase URL or key.'));
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
  function fetchSettings() { return rpc('rw_get_settings').then(function (s) { settingsCache = s; return s; }); }

  function rand() { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  function money(n) { return cfg.currency + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function can() { try { return !!cfg.canManage(); } catch (e) { return false; } }

  /* ---------- tiny DOM helper (textContent only, so reward names can't inject HTML) ---------- */
  function h(tag, props) {
    var el = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    for (var k in (props || {})) {
      var v = props[k];
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (k === 'style') el.style.cssText = v;
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

  /* ---------- modal ---------- */
  function onKey(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    cancelAnimationFrame(raf);
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener('keydown', onKey);
  }
  function openModal(title, body, wide) {
    closeModal();
    overlay = h('div', { class: 'gwrw-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'gwrw-modal' + (wide ? ' gwrw-wide' : '') },
        h('div', { class: 'gwrw-head' }, h('h2', null, title),
          h('button', { class: 'gwrw-x', 'aria-label': 'Close', onclick: closeModal }, '\u00d7')),
        body));
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    var f = overlay.querySelector('input,button.gwrw-primary'); if (f) f.focus();
  }

  /* ---------- sale hook ---------- */
  /* Returns a Promise for the new code, or null if the sale did not qualify. Safe to call again for the same sale id. */
  function onSale(sale) {
    var total = Number(sale && sale.total);
    if (!isFinite(total)) return Promise.resolve(null);
    var employee = String(sale.employee || '');
    return rpc('rw_issue_code', { p_sale_id: sale.id != null ? String(sale.id) : null, p_employee: employee, p_amount: total })
      .then(function (r) {
        if (r && r.ok) { showIssued({ code: r.code, employee: employee, amount: total }); return r.code; }
        return null;
      })
      .catch(function (e) {
        console.warn('[RewardWheel]', e);
        if (settingsCache && total >= settingsCache.threshold) {
          openModal('Reward wheel', h('div', { class: 'gwrw-body' },
            h('p', { class: 'gwrw-msg gwrw-err' }, 'This sale qualifies for a wheel code, but the code could not be created: ' + e.message),
            h('p', null, 'The sale itself was not affected. Ask the owner to try again in a moment.'),
            h('div', { class: 'gwrw-row' }, h('button', { class: 'gwrw-primary', onclick: closeModal }, 'Close'))));
        }
        return null;
      });
  }
  function showIssued(rec) {
    var copy = h('button', { class: 'gwrw-btn', onclick: function () {
      var done = function () { copy.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(rec.code).then(done, done); else done();
    } }, 'Copy code');
    openModal('Reward wheel code', h('div', { class: 'gwrw-body' },
      h('p', null, rec.employee ? rec.employee + '\u2019s sale of ' : 'This sale of ', h('strong', null, money(rec.amount)),
        ' qualifies for one spin. Give the customer this code. It works once.'),
      h('div', { class: 'gwrw-code' }, rec.code),
      h('div', { class: 'gwrw-row' }, copy, h('button', { class: 'gwrw-primary', onclick: closeModal }, 'Done'))));
  }

  /* ---------- wheel drawing / animation ---------- */
  function sumW(prizes) { return prizes.reduce(function (s, p) { return s + p.weight; }, 0); }
  function drawWheel(cv, prizes, rot) {
    var ctx = cv.getContext('2d'), s = cv.width, c = s / 2, r = c - 10, total = sumW(prizes), a = -Math.PI / 2 + rot;
    ctx.clearRect(0, 0, s, s);
    prizes.forEach(function (p) {
      var span = p.weight / total * TAU;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, r, a, a + span); ctx.closePath();
      ctx.fillStyle = p.color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (span > 0.3) {
        ctx.save(); ctx.translate(c, c); ctx.rotate(a + span / 2); ctx.textAlign = 'right';
        ctx.font = '600 ' + Math.round(s / 24) + 'px system-ui, sans-serif';
        var t = p.label.length > 14 ? p.label.slice(0, 13) + '\u2026' : p.label;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(t, r - 16, 6);
        ctx.fillStyle = '#fff'; ctx.fillText(t, r - 16, 6);
        ctx.restore();
      }
      a += span;
    });
    ctx.beginPath(); ctx.arc(c, c, s / 16, 0, TAU); ctx.fillStyle = '#12261b'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  function spinTo(cv, prizes, prize, done) {
    var total = sumW(prizes), cum = 0, i = 0;
    while (prizes[i].id !== prize.id) { cum += prizes[i].weight / total * TAU; i++; }
    var span = prize.weight / total * TAU, off = cum + span / 2 + (rand() - 0.5) * span * 0.7;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var target = (still ? 0 : 6) * TAU + TAU - off, dur = still ? 300 : 5200, t0 = performance.now();
    (function frame(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      drawWheel(cv, prizes, target * e);
      if (k < 1) raf = requestAnimationFrame(frame); else done();
    })(t0);
  }
  function shown(prizes) { return prizes.filter(function (p) { return Number(p.weight) > 0; }).map(function (p) { p.weight = Number(p.weight); return p; }); }

  /* ---------- spin screen ---------- */
  function openSpin() {
    var cv = h('canvas', { class: 'gwrw-canvas', width: 520, height: 520, 'aria-label': 'Reward wheel' });
    var input = h('input', { class: 'gwrw-input', placeholder: 'GW-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Wheel code' });
    var msg = h('p', { class: 'gwrw-msg', 'aria-live': 'polite' });
    var go = h('button', { class: 'gwrw-primary' }, 'Spin');
    var busy = false, finished = false, usedCode = '';
    var claimBox = h('div', { class: 'gwrw-claim' });

    fetchSettings().then(function (s) {
      var pz = shown(s.prizes);
      if (pz.length >= 2) drawWheel(cv, pz, 0);
      else { msg.className = 'gwrw-msg gwrw-err'; msg.textContent = 'The wheel is not set up yet. Ask the owner to add rewards.'; }
    }).catch(function (e) { msg.className = 'gwrw-msg gwrw-err'; msg.textContent = 'Could not load the wheel: ' + e.message; });

    function showClaimForm() {
      var nameIn = h('input', { class: 'gwrw-input', maxlength: '60', placeholder: 'In-game name', 'aria-label': 'In-game name', autocomplete: 'off' });
      var cidIn = h('input', { class: 'gwrw-input', maxlength: '30', placeholder: 'In-game CID', 'aria-label': 'In-game CID', autocomplete: 'off' });
      var phoneIn = h('input', { class: 'gwrw-input', type: 'tel', maxlength: '30', placeholder: 'In-game phone number', 'aria-label': 'In-game phone number', autocomplete: 'off' });
      var cmsg = h('p', { class: 'gwrw-msg', 'aria-live': 'polite' });
      var send = h('button', { class: 'gwrw-primary' }, 'Send my details');
      function cfail(t) { send.disabled = false; cmsg.className = 'gwrw-msg gwrw-err'; cmsg.textContent = t; }
      function submit() {
        var n = nameIn.value.trim(), c = cidIn.value.trim(), p = phoneIn.value.trim();
        if (!n || !c || !p) return cfail('Please fill in all three boxes.');
        send.disabled = true; cmsg.className = 'gwrw-msg'; cmsg.textContent = 'Sending\u2026';
        rpc('rw_submit_claim', { p_code: usedCode, p_name: n, p_cid: c, p_phone: p }).then(function (r) {
          if (r && r.ok) {
            claimBox.textContent = '';
            claimBox.appendChild(h('p', { class: 'gwrw-msg gwrw-win' }, 'Thank you! Your details were sent.'));
          } else cfail((r && r.msg) || 'Could not send your details. Try again.');
        }).catch(function (e) { cfail(e.message); });
      }
      send.addEventListener('click', submit);
      phoneIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      claimBox.textContent = '';
      claimBox.appendChild(h('div', null,
        h('h3', null, 'Claim your reward'),
        h('p', { class: 'gwrw-hint' }, 'Fill in your details so we can give you your reward.'),
        nameIn, cidIn, phoneIn,
        h('div', { class: 'gwrw-row' }, send), cmsg));
      nameIn.focus();
    }

    function fail(text) { busy = false; go.disabled = false; msg.className = 'gwrw-msg gwrw-err'; msg.textContent = text; }
    function run() {
      if (finished) return closeModal();
      if (busy) return;
      busy = true; go.disabled = true; msg.className = 'gwrw-msg'; msg.textContent = 'Checking code\u2026';
      rpc('rw_redeem', { p_code: input.value }).then(function (res) {
        if (!res.ok) return fail(res.msg);
        var pz = shown(res.prizes);
        usedCode = input.value; input.disabled = true; msg.textContent = 'Spinning\u2026';
        spinTo(cv, pz, res.prize, function () {
          finished = true; msg.className = 'gwrw-msg gwrw-win'; msg.textContent = 'You won: ' + res.prize.label + '!';
          go.textContent = 'Close'; go.disabled = false;
          showClaimForm();
        });
      }).catch(function (e) { fail(e.message); });
    }
    go.addEventListener('click', run);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    openModal('Spin the wheel', h('div', { class: 'gwrw-body' },
      h('div', { class: 'gwrw-wheelbox' }, h('div', { class: 'gwrw-pointer' }), cv),
      h('div', { class: 'gwrw-row' }, input, go), msg, claimBox));
  }

  /* ---------- admin panel (no passphrase) ---------- */
  function openAdmin() {
    if (!can()) return;
    var body = h('div', { class: 'gwrw-body' }), draft = null, codes = [];
    openModal('Reward wheel settings', body, true);
    adminPin = ''; load();

    function showError(text) {
      body.textContent = '';
      body.appendChild(h('p', { class: 'gwrw-msg gwrw-err' }, text));
    }
    function load() {
      body.textContent = 'Loading\u2026';
      Promise.all([fetchSettings(), rpc('rw_admin_codes', { p_pin: adminPin })]).then(function (r) {
        draft = { threshold: Number(r[0].threshold), prizes: JSON.parse(JSON.stringify(r[0].prizes)) };
        draft.prizes.forEach(function (p) { p.weight = Number(p.weight); });
        codes = r[1]; render();
      }).catch(function (e) { showError(e.message); });
    }
    function reloadCodes() { rpc('rw_admin_codes', { p_pin: adminPin }).then(function (c) { codes = c; render(); }).catch(function (e) { showError(e.message); }); }

    function render() {
      var total = draft.prizes.reduce(function (s, p) { return s + (p.weight > 0 ? p.weight : 0); }, 0);
      var msg = h('p', { class: 'gwrw-msg', 'aria-live': 'polite' });
      function say(cls, t) { msg.className = 'gwrw-msg ' + cls; msg.textContent = t; }

      var thr = h('input', { class: 'gwrw-input gwrw-narrow', type: 'number', min: '1', step: 'any', value: draft.threshold,
        'aria-label': 'Sale amount that earns a code', oninput: function (e) { draft.threshold = Number(e.target.value); } });

      var rows = draft.prizes.map(function (p) {
        var pct = total > 0 && p.weight > 0 ? (p.weight / total * 100) : 0;
        return h('div', { class: 'gwrw-prize' },
          h('input', { type: 'color', value: p.color, 'aria-label': 'Colour for ' + p.label, onchange: function (e) { p.color = e.target.value; } }),
          h('input', { class: 'gwrw-input', value: p.label, maxlength: '40', 'aria-label': 'Reward name', oninput: function (e) { p.label = e.target.value; } }),
          h('input', { class: 'gwrw-input gwrw-narrow', type: 'number', min: '0', step: 'any', value: p.weight, 'aria-label': 'Weight for ' + p.label,
            onchange: function (e) { p.weight = Number(e.target.value); render(); } }),
          h('span', { class: 'gwrw-pct' }, pct.toFixed(1) + '%'),
          h('button', { class: 'gwrw-btn', disabled: draft.prizes.length <= 2, title: draft.prizes.length <= 2 ? 'The wheel needs at least two rewards' : 'Remove reward',
            onclick: function () { draft.prizes = draft.prizes.filter(function (x) { return x !== p; }); render(); } }, 'Remove'));
      });

      var addBtn = h('button', { class: 'gwrw-btn', onclick: function () {
        draft.prizes.push({ id: 'p' + Date.now().toString(36) + Math.floor(rand() * 1e4), label: 'New reward', weight: 10, color: PALETTE[draft.prizes.length % PALETTE.length] });
        render();
      } }, 'Add reward');

      var saveBtn = h('button', { class: 'gwrw-primary', onclick: function () {
        var bad = null;
        if (!(draft.threshold > 0)) bad = 'The sale amount must be greater than 0.';
        else if (draft.prizes.length < 2) bad = 'Add at least two rewards.';
        else if (draft.prizes.some(function (p) { return !p.label.trim(); })) bad = 'Every reward needs a name.';
        else if (draft.prizes.some(function (p) { return !isFinite(p.weight) || p.weight < 0; })) bad = 'Weights must be zero or higher.';
        else if (!(total > 0)) bad = 'At least one reward needs a weight above 0.';
        if (bad) return say('gwrw-err', bad);
        draft.prizes.forEach(function (p) { p.label = p.label.trim(); });
        saveBtn.disabled = true; say('', 'Saving\u2026');
        rpc('rw_admin_save', { p_pin: adminPin, p_threshold: draft.threshold, p_prizes: draft.prizes })
          .then(function () { settingsCache = { threshold: draft.threshold, prizes: draft.prizes }; saveBtn.disabled = false; say('gwrw-win', 'Saved. New settings apply to the next code and spin.'); })
          .catch(function (e) { saveBtn.disabled = false; say('gwrw-err', e.message); });
      } }, 'Save settings');

      var list = codes.map(function (c) {
        var status = c.voided ? 'Cancelled' : c.used_at ? 'Used: ' + c.prize_label : 'Unused';
        return h('tr', null,
          h('td', { class: 'gwrw-mono' }, c.code), h('td', null, c.employee || '-'), h('td', null, money(c.amount)),
          h('td', null, new Date(c.created_at).toLocaleString()), h('td', null, status),
          h('td', null, c.claim_name ? c.claim_name + ' \u00b7 CID ' + c.claim_cid + ' \u00b7 ' + c.claim_phone : (c.used_at ? 'Not sent yet' : '-')),
          h('td', null, !c.used_at && !c.voided ? h('button', { class: 'gwrw-btn', onclick: function () {
            rpc('rw_admin_void', { p_pin: adminPin, p_code: c.code }).then(reloadCodes).catch(function (e) { say('gwrw-err', e.message); });
          } }, 'Cancel code') : ''));
      });

      body.textContent = '';
      body.appendChild(h('div', null,
        h('label', { class: 'gwrw-label' }, 'A sale of this amount or more earns one code', h('div', null, cfg.currency, thr)),
        h('h3', null, 'Rewards and chances'),
        h('p', { class: 'gwrw-hint' }, 'Weight is relative. A reward with weight 30 out of 100 total wins 30% of spins.'),
        h('div', { class: 'gwrw-prize gwrw-cols' }, h('span'), h('span', null, 'Reward'), h('span', null, 'Weight'), h('span', null, 'Chance'), h('span')),
        rows, h('div', { class: 'gwrw-row' }, addBtn, saveBtn), msg,
        h('h3', null, 'Latest codes'),
        codes.length ? h('div', { class: 'gwrw-scroll' }, h('table', { class: 'gwrw-table' },
          h('thead', null, h('tr', null, h('th', null, 'Code'), h('th', null, 'Employee'), h('th', null, 'Sale'), h('th', null, 'Created'), h('th', null, 'Status'), h('th', null, 'Player details'), h('th'))),
          h('tbody', null, list))) : h('p', { class: 'gwrw-hint' }, 'No codes yet. One is created when a sale reaches the amount above.')));
    }
  }

  /* ---------- floating buttons + styles ---------- */
  function refresh() { if (adminBtn) adminBtn.hidden = !can(); }
  function mountDock() {
    var dock = h('div', { class: 'gwrw-dock' },
      h('button', { class: 'gwrw-fab', onclick: openSpin }, 'Spin the wheel'),
      adminBtn = h('button', { class: 'gwrw-fab gwrw-fab-alt', onclick: openAdmin }, 'Wheel settings'));
    document.body.appendChild(dock);
    refresh(); setInterval(refresh, 1500);
  }
  function injectCss() {
    var css = [
      '.gwrw-dock{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:9998}',
      '.gwrw-dock button[hidden]{display:none}',
      '.gwrw-fab,.gwrw-btn,.gwrw-primary{font:600 14px system-ui,sans-serif;border-radius:10px;padding:10px 16px;cursor:pointer;border:1px solid #1f8a4c}',
      '.gwrw-fab,.gwrw-primary{background:#1f8a4c;color:#fff}',
      '.gwrw-fab-alt,.gwrw-btn{background:#fff;color:#12261b}',
      '.gwrw-btn:disabled,.gwrw-primary:disabled{opacity:.5;cursor:not-allowed}',
      '.gwrw-fab:focus-visible,.gwrw-btn:focus-visible,.gwrw-primary:focus-visible,.gwrw-input:focus-visible,.gwrw-x:focus-visible{outline:3px solid #e8a317;outline-offset:2px}',
      '.gwrw-overlay{position:fixed;inset:0;background:rgba(10,25,16,.6);display:flex;align-items:center;justify-content:center;padding:12px;z-index:9999}',
      '.gwrw-modal{background:#f6fbf7;color:#12261b;border-radius:16px;width:100%;max-width:440px;max-height:94vh;overflow:auto;font:15px/1.5 system-ui,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.35)}',
      '.gwrw-modal.gwrw-wide{max-width:760px}',
      '.gwrw-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #d5e6da}',
      '.gwrw-head h2{margin:0;font-size:18px}',
      '.gwrw-x{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:#12261b;padding:2px 8px}',
      '.gwrw-body{padding:18px}.gwrw-body h3{margin:22px 0 6px;font-size:16px}',
      '.gwrw-row{display:flex;gap:8px;margin-top:14px}.gwrw-row .gwrw-input{flex:1}',
      '.gwrw-input{box-sizing:border-box;font:15px system-ui,sans-serif;padding:9px 11px;border:1px solid #9dbba8;border-radius:9px;background:#fff;color:#12261b;min-width:0}',
      '.gwrw-narrow{width:92px}',
      '.gwrw-wheelbox{position:relative;max-width:340px;margin:0 auto}',
      '.gwrw-canvas{width:100%;height:auto;display:block}',
      '.gwrw-pointer{position:absolute;left:50%;top:-4px;transform:translateX(-50%);width:0;height:0;border-left:13px solid transparent;border-right:13px solid transparent;border-top:26px solid #12261b;z-index:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}',
      '.gwrw-msg{min-height:1.5em;margin:12px 0 0;font-weight:600}.gwrw-err{color:#b3261e}.gwrw-win{color:#1a7a43}',
      '.gwrw-wheelbox ~ .gwrw-msg.gwrw-win{font-size:18px}',
      '.gwrw-code{font:700 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.06em;text-align:center;background:#fff;border:2px dashed #1f8a4c;border-radius:12px;padding:16px;margin-top:14px;user-select:all}',
      '.gwrw-claim:not(:empty){margin-top:16px;padding-top:6px;border-top:1px solid #d5e6da}',
      '.gwrw-claim .gwrw-input{display:block;width:100%;margin-top:8px}',
      '.gwrw-label{display:block;font-weight:600}.gwrw-label .gwrw-input{margin-top:6px}',
      '.gwrw-hint{color:#4b6355;margin:0 0 10px;font-size:14px}',
      '.gwrw-prize{display:grid;grid-template-columns:36px 1fr 92px 56px 84px;gap:8px;align-items:center;margin-top:8px}',
      '.gwrw-prize input[type=color]{width:36px;height:36px;padding:0;border:1px solid #9dbba8;border-radius:8px;background:#fff}',
      '.gwrw-cols{font-size:13px;color:#4b6355;margin-top:0}.gwrw-pct{font-variant-numeric:tabular-nums}',
      '.gwrw-scroll{overflow-x:auto}.gwrw-table{width:100%;border-collapse:collapse;font-size:14px}',
      '.gwrw-table th,.gwrw-table td{text-align:left;padding:7px 8px;border-bottom:1px solid #d5e6da;white-space:nowrap}',
      '.gwrw-mono{font-family:ui-monospace,Menlo,Consolas,monospace}',
      '@media (max-width:520px){.gwrw-prize{grid-template-columns:36px 1fr 70px 50px}.gwrw-prize .gwrw-btn{grid-column:1/-1}}'
    ].join('\n');
    var el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
  }

  function init(options) {
    for (var k in (options || {})) cfg[k] = options[k];
    injectCss();
    fetchSettings().catch(function (e) { console.warn('[RewardWheel] could not load settings:', e.message); });
    if (cfg.dock) { if (document.body) mountDock(); else document.addEventListener('DOMContentLoaded', mountDock); }
  }

  global.RewardWheel = { init: init, onSale: onSale, openSpin: openSpin, openAdmin: openAdmin, refresh: refresh };
})(window);
