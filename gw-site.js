(function () {
  var URL_ = 'https://wtiefpuczygmyjaampdg.supabase.co', KEY = 'sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif';
  var NAME = 'Customer Favourites', CACHE = 'gw_favs_v1';
  var MANAGE = ['owner', 'admin', 'administrator', 'manager'];   // roles that can edit favourites (the database has the same list)
  var favs = [], favMode = false, loaded = false, touched = false;
  var chips = document.getElementById('categoryFilters'), grid = document.getElementById('grid');

  function rpc(fn, args) {
    return fetch(URL_ + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) throw new Error((j && j.message) || 'Request failed'); return j; }); });
  }
  function low(s) { return String(s || '').trim().toLowerCase(); }
  function isFav(n) { return favs.some(function (f) { return low(f) === low(n); }); }
  function remember() { try { localStorage.setItem(CACHE, JSON.stringify(favs)); } catch (e) {} }

  /* Show the last known favourites straight away so customers never see the full menu flash first */
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE) || '[]');
    if (Array.isArray(cached) && cached.length) { favs = cached; loaded = true; favMode = true; }
  } catch (e) {}

  /* First-time visitors have no saved copy yet: keep the menu hidden for a moment so the full menu never flashes before favourites load */
  function release() { if (grid) grid.style.visibility = ''; }
  if (!loaded && grid) { grid.style.visibility = 'hidden'; setTimeout(release, 2500); }

  /* --- page order: customer content first, staff sign-in and admin last --- */
  var foot = document.querySelector('footer');
  ['staff', 'admin'].forEach(function (id) { var s = document.getElementById(id); if (s && foot) foot.parentNode.insertBefore(s, foot); });

  /* --- Customer Favourites tab --- */
  var note = document.createElement('p');
  note.className = 'empty'; note.hidden = true; note.textContent = 'None of the Customer Favourites are on the menu right now.';
  if (grid) grid.parentNode.insertBefore(note, grid.nextSibling);

  function apply() {
    if (!chips || !grid) return;
    var chip = chips.querySelector('[data-gwfav]');
    if (!favs.length) { favMode = false; if (chip) chip.remove(); chip = null; }
    if (!chip && loaded && favs.length) {
      chip = document.createElement('button');
      chip.className = 'chip'; chip.setAttribute('data-gwfav', ''); chip.textContent = NAME;
      chips.insertBefore(chip, chips.firstChild);
    }
    if (chip) chip.classList.toggle('active', favMode);
    if (favMode) chips.querySelectorAll('.chip').forEach(function (c) { if (c !== chip) c.classList.remove('active'); });
    var shown = 0;
    grid.querySelectorAll('.card').forEach(function (card) {
      var h3 = card.querySelector('h3'), hide = favMode && !isFav(h3 ? h3.textContent : '');
      card.classList.toggle('gw-hide', hide);
      if (!hide) shown++;
    });
    if (favMode) { var c = document.getElementById('count'); if (c) c.textContent = shown + ' item' + (shown === 1 ? '' : 's'); }
    note.hidden = !(favMode && !shown && grid.children.length);
  }
  if (chips) chips.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.chip') : null;
    if (!b) return;
    touched = true;
    if (b.hasAttribute('data-gwfav')) { favMode = true; activeCat = 'All'; renderMenu(); }
    else favMode = false;
  }, true);
  if (chips) new MutationObserver(apply).observe(chips, { childList: true });
  if (grid) new MutationObserver(apply).observe(grid, { childList: true });

  /* --- owner / manager control --- */
  var card = document.createElement('div');
  card.className = 'card2'; card.id = 'favAdmin'; card.hidden = true;
  var admin = document.getElementById('admin'), wrap = admin && admin.querySelector('.wrap');
  if (wrap) { var ref = document.getElementById('menuBlock'); wrap.insertBefore(card, ref && ref.parentNode === wrap ? ref : null); }

  function canManage() {
    var r = typeof signedIn !== 'undefined' && signedIn ? low(signedIn.role) : '';
    return MANAGE.indexOf(r) > -1;
  }
  function menuNames() { return (typeof STATE !== 'undefined' && STATE.menu ? STATE.menu : []).map(function (m) { return m.name; }); }
  function sigOf() { return menuNames().join('|') + '#' + favs.join('|'); }
  function buildAdmin() {
    if (card.dataset.sig === sigOf()) return;
    card.dataset.sig = sigOf(); card.textContent = '';
    var title = document.createElement('h3'); title.textContent = 'Customer Favourites';
    var hint = document.createElement('p'); hint.className = 'sub';
    hint.textContent = 'Tick the items customers see first when they open the menu. Saving uses the code you signed in with.';
    var list = document.createElement('div'); list.className = 'gw-favlist';
    menuNames().forEach(function (n) {
      var l = document.createElement('label'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = n; cb.checked = isFav(n);
      l.appendChild(cb); l.appendChild(document.createTextNode(' ' + n)); list.appendChild(l);
    });
    var btn = document.createElement('button'); btn.className = 'btn solid small'; btn.textContent = 'Save favourites';
    var msg = document.createElement('p'); msg.className = 'msg';
    btn.addEventListener('click', function () {
      var picked = Array.prototype.map.call(list.querySelectorAll('input:checked'), function (c) { return c.value; });
      var code = window.gwPin || window.prompt('Enter your code to save favourites for everyone:');
      if (!code || !String(code).trim()) { msg.textContent = 'Nothing saved. Your code is needed.'; return; }
      btn.disabled = true; msg.textContent = 'Saving\u2026';
      rpc('gw_set_favourites', { p_pin: String(code).trim(), p_items: picked }).then(function () {
        favs = picked; loaded = true; touched = false; favMode = favs.length > 0; remember();
        card.dataset.sig = sigOf(); apply(); renderMenu();
        btn.disabled = false; msg.textContent = 'Saved. Customers will see it now.';
      }).catch(function (e) { btn.disabled = false; msg.textContent = e.message; });
    });
    var row = document.createElement('div'); row.className = 'row'; row.appendChild(btn);
    card.appendChild(title); card.appendChild(hint); card.appendChild(list); card.appendChild(row); card.appendChild(msg);
  }
  function sync() {
    card.hidden = !canManage();
    if (!card.hidden) buildAdmin();
    addMoveButtons();
  }
  document.addEventListener('gw-permissions-changed', sync);
  setInterval(sync, 1500);

  /* --- owner: change the order items show on the menu (customers, Customer Favourites and every category follow this order) --- */
  var TOP = ['owner', 'admin', 'administrator'];   // the roles that can publish the menu
  function canReorder() {
    var r = typeof signedIn !== 'undefined' && signedIn ? low(signedIn.role) : '';
    return TOP.indexOf(r) > -1;
  }
  function move(i, dir) {
    var m = STATE.menu, j = i + dir;
    if (j < 0 || j >= m.length) return;
    var t = m[i]; m[i] = m[j]; m[j] = t;
    renderMenuAdmin();
    var again = document.querySelector('#menuRows .rrow[data-i="' + j + '"] .gw-move button[data-dir="' + dir + '"]');
    if (again && !again.disabled) again.focus();
    var msg = document.getElementById('menuMsg');
    if (msg) msg.textContent = 'Order changed. Press Save menu to publish it.';
  }
  function addMoveButtons() {
    var rows = document.getElementById('menuRows');
    if (!rows || typeof STATE === 'undefined' || !STATE.menu) return;
    var hint = document.getElementById('gwMoveHint');
    if (!canReorder()) {
      if (hint) hint.remove();
      rows.querySelectorAll('.gw-move').forEach(function (b) { b.remove(); });
      return;
    }
    if (!hint) {
      hint = document.createElement('p'); hint.id = 'gwMoveHint'; hint.className = 'sub';
      hint.textContent = 'Use the \u25B2 \u25BC buttons to change the order customers see, then press Save menu.';
      rows.parentNode.insertBefore(hint, rows);
    }
    rows.querySelectorAll('.rrow').forEach(function (row) {
      if (row.querySelector('.gw-move')) return;
      var i = +row.dataset.i, box = document.createElement('div');
      box.className = 'gw-move'; box.style.cssText = 'display:flex;gap:4px;flex:0 0 auto';
      [['\u25B2', -1, 'Move up'], ['\u25BC', 1, 'Move down']].forEach(function (d) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small'; b.textContent = d[0]; b.dataset.dir = d[1];
        b.title = d[2]; b.setAttribute('aria-label', d[2] + ': ' + (STATE.menu[i] ? STATE.menu[i].name : ''));
        b.style.padding = '4px 9px';
        b.disabled = i + d[1] < 0 || i + d[1] >= STATE.menu.length;
        if (b.disabled) b.style.opacity = '.35';
        b.addEventListener('click', function () { move(i, d[1]); });
        box.appendChild(b);
      });
      row.insertBefore(box, row.firstChild);
    });
  }
  if (typeof renderMenuAdmin === 'function') {
    var origAdmin = renderMenuAdmin;
    window.renderMenuAdmin = function () { var out = origAdmin.apply(this, arguments); addMoveButtons(); return out; };
  }

  apply();
  rpc('gw_get_favourites').then(function (items) {
    favs = Array.isArray(items) ? items : []; loaded = true; remember();
    if (!touched) favMode = favs.length > 0;
    apply(); sync(); release();
  }).catch(function () { loaded = true; release(); });
})();
