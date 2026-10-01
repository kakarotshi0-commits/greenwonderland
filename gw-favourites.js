/* gw-favourites.js — Green Wonderland
 * The public Menu opens on "★ Favourites". Owner, Admin and Manager choose the favourites.
 *
 *  - Visitors: the menu opens on Favourites (when at least one is set). The chip row gets a "★ Favourites"
 *    chip in front of "All". Typing in the search box searches the whole menu, not just favourites.
 *  - Owner / Admin / Manager (signed in): a ☆ / ★ button appears on every menu card. Tapping it adds or removes
 *    the item from Favourites and saves it for everyone through the same save the "Save menu" button uses.
 *    If the save is refused, the star goes back and the reason is shown.
 *
 * Install: add  <script src="gw-favourites.js?v=1"></script>  at the very bottom of index.html (after the
 * other scripts). Favourites are stored as  fav: true  on each menu item, inside the shared menu.
 */
(function () {
  var FAV_LABEL = '\u2605 Favourites';
  var MANAGER_ROLES = ['owner', 'admin', 'administrator', 'manager'];
  var favMode = false;      // is the Favourites view showing?
  var userChose = false;    // once a visitor taps any chip, stop auto-opening on Favourites
  var lastSig = '';

  var st = document.createElement('style');
  st.textContent =
    '.card .gw-fav-star{position:absolute;top:20px;right:20px;z-index:3;width:34px;height:34px;border-radius:50%;' +
    'border:1px solid #96d62a55;background:rgba(13,23,15,.82);color:#c9d6b0;font-size:1.05rem;line-height:1;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center;padding:0;transition:transform .15s,background .15s}' +
    '.card .gw-fav-star:hover{transform:scale(1.1);background:rgba(13,23,15,.95)}' +
    '.card .gw-fav-star.on{color:#f5c542;border-color:#f5c54299}' +
    '.card .gw-fav-star:disabled{opacity:.5;cursor:wait}' +
    '.chip.fav-chip{font-weight:700}' +
    '.gw-fav-toast{position:fixed;left:50%;bottom:78px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,420px);' +
    'background:#142116;color:#e9f3d6;border:1px solid #96d62a55;border-radius:12px;padding:10px 16px;font-size:.85rem;' +
    'box-shadow:0 10px 30px #0006;text-align:center}';
  document.head.appendChild(st);

  function role() { try { return signedIn ? String(signedIn.role || '').trim().toLowerCase() : ''; } catch (e) { return ''; } }
  function canManage() { return MANAGER_ROLES.indexOf(role()) > -1; }
  function favCount() { return STATE.menu.filter(function (it) { return it.fav; }).length; }
  function signature() {
    return STATE.menu.map(function (it) { return it.id + (it.fav ? '*' : ''); }).join(',') + '|' + role();
  }

  var toastTimer;
  function toast(text) {
    var t = document.querySelector('.gw-fav-toast');
    if (!t) { t = document.createElement('div'); t.className = 'gw-fav-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  var base = renderMenu;
  renderMenu = function () {
    var q = ((document.getElementById('search') || {}).value || '').trim();
    if (!userChose) favMode = favCount() > 0;                    // open on Favourites when there are some
    base();
    decorate(q);
    lastSig = signature();
  };

  function decorate(q) {
    var chips = document.getElementById('categoryFilters');
    var grid = document.getElementById('grid');
    if (!chips || !grid) return;
    var showFav = favMode && !q;                                  // searching always looks at the whole menu

    // "★ Favourites" chip, first in the row (visitors only see it when there is something in it)
    if (favCount() > 0 || canManage()) {
      var chip = document.createElement('button');
      chip.className = 'chip fav-chip' + (showFav ? ' active' : '');
      chip.textContent = FAV_LABEL;
      chips.insertBefore(chip, chips.firstChild);
    }
    if (showFav) {
      var all = chips.querySelector('.chip[data-cat="All"]');
      if (all) all.classList.remove('active');
    }

    // the same list the original renderMenu() just drew, so cards and items line up one to one
    var ql = q.toLowerCase();
    var items = STATE.menu.filter(function (it) {
      return (activeCat === 'All' || it.category === activeCat) && (!ql || it.name.toLowerCase().indexOf(ql) > -1);
    });
    var cards = grid.querySelectorAll('.card');
    if (cards.length !== items.length) return;                    // something else drew the grid: leave it alone

    var manage = canManage();
    var drop = [];
    cards.forEach(function (card, i) {
      var item = items[i];
      if (manage) card.appendChild(starButton(item));
      if (showFav && !item.fav) drop.push(card);
    });
    if (showFav) {
      drop.forEach(function (c) { c.remove(); });
      var n = items.length - drop.length;
      var count = document.getElementById('count');
      if (count) count.textContent = n + ' favourite' + (n === 1 ? '' : 's');
      if (!n) {
        grid.innerHTML = '<p class="empty" style="grid-column:1/-1;display:block">No favourites yet.' +
          (manage ? ' Open <b>All</b> and tap the \u2606 on an item to add it.' : '') + '</p>';
      }
    }
  }

  function starButton(item) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gw-fav-star' + (item.fav ? ' on' : '');
    b.textContent = item.fav ? '\u2605' : '\u2606';
    b.title = item.fav ? 'Remove from Favourites' : 'Add to Favourites';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', item.fav ? 'true' : 'false');
    b.addEventListener('click', async function (ev) {
      ev.stopPropagation();
      var was = !!item.fav;
      b.disabled = true;
      if (was) delete item.fav; else item.fav = true;
      var res;
      try { res = await publishState({ catalog: true }); }
      catch (e) { res = { ok: false, reason: 'Something went wrong while saving.' }; }
      if (!res || !res.ok) {                                      // not saved: put it back and say why
        if (was) item.fav = true; else delete item.fav;
        toast(typeof msgFor === 'function' ? msgFor(res || { ok: false, reason: 'Not saved.' }) : 'Could not save.');
      } else {
        toast(was ? 'Removed from Favourites.' : 'Added to Favourites.');
      }
      renderMenu();
    });
    return b;
  }

  // chip taps (capture phase, so this runs before the original chip handlers)
  var chipsEl = document.getElementById('categoryFilters');
  if (chipsEl) chipsEl.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.chip');
    if (!c) return;
    userChose = true;
    if (c.classList.contains('fav-chip')) {
      favMode = true; activeCat = 'All';
      e.stopPropagation(); renderMenu();
    } else {
      favMode = false;                                            // the original handler sets the category and redraws
    }
  }, true);

  // the search box was wired to the original function; point it at the new one
  var search = document.getElementById('search');
  if (search) { search.removeEventListener('input', base); search.addEventListener('input', renderMenu); }

  // shared menu arriving from the server, or someone signing in/out
  setInterval(function () { if (signature() !== lastSig) renderMenu(); }, 1200);
  window.addEventListener('gw-auth-changed', function () { renderMenu(); });

  renderMenu();
})();
