/* gw-cutout.js — Green Wonderland
 * Makes menu photos with a solid-colour background transparent, so they blend into the card.
 *
 *  0) AUTOMATIC: every photo shown on the public Menu is made transparent as the page draws it, so ALL photos
 *     (old and new) look cut-out for every visitor, with nothing to press. Photos it cannot cut out cleanly are
 *     shown as they were.
 *  1) NEW UPLOADS: replaces readImageCompressed() so every menu photo you add or change is cut out
 *     automatically and saved with transparency (WebP/PNG instead of JPEG, which cannot be transparent).
 *     Photos that are already transparent keep their transparency.
 *  2) OPTIONAL, makes it permanent: a "Make photos transparent" button next to "Save menu" converts the stored
 *     photos themselves. Press it once, check the result, then press "Save menu". (Visitors then skip the
 *     automatic step, so the menu loads a little faster.)
 *
 * Install: add  <script src="gw-cutout.js?v=1"></script>  at the bottom of index.html,
 * after the existing inline scripts (next to gw-dark-photos.js).
 * Works on white / coloured backgrounds AND on black backgrounds with smoke, glow or splash artwork.
 * Photos it cannot cut out cleanly are left exactly as they were (the button lists them by name).
 */
(function () {
  function gwCutoutPixels(d, w, h, opts) {
    opts = opts || {};
    var N = w * h;
    var STEP = opts.step || 14, BOUND = opts.bound || 70;
    var R = [], G = [], B = [], A = 0, ring = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (x > 1 && x < w - 2 && y > 1 && y < h - 2) continue;
      var i = (y * w + x) * 4; ring++; A += d[i + 3];
      R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]);
    }
    if (A / ring < 200) return { ok: false, transparent: true, why: 'already transparent' };
    function med(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    var bg = [med(R), med(G), med(B)];

    // ---- black background (artwork on black, with smoke / glow / splashes) ----
    if (Math.max(bg[0], bg[1], bg[2]) < 45) {
      var DK = 34, LO = 5, dark = 0;
      function mx(p) { var o = p * 4; return Math.max(d[o], d[o + 1], d[o + 2]); }
      for (var e0 = 0; e0 < R.length; e0++) if (Math.max(R[e0], G[e0], B[e0]) <= DK) dark++;
      if (dark / R.length < 0.5) return { ok: false, why: 'edge is not black' };
      var out = new Uint8Array(N), qd = new Int32Array(N), a0 = 0, a1 = 0;
      for (var s = 0; s < N; s++) {
        var sx = s % w, sy = (s / w) | 0;
        if ((sx === 0 || sx === w - 1 || sy === 0 || sy === h - 1) && mx(s) <= DK) { out[s] = 1; qd[a1++] = s; }
      }
      while (a0 < a1) {
        var p2 = qd[a0++], x2 = p2 % w, y2 = (p2 / w) | 0, nb2 = [];
        if (x2 > 0) nb2.push(p2 - 1); if (x2 < w - 1) nb2.push(p2 + 1); if (y2 > 0) nb2.push(p2 - w); if (y2 < h - 1) nb2.push(p2 + w);
        for (var t = 0; t < nb2.length; t++) { var q2 = nb2[t]; if (!out[q2] && mx(q2) <= DK) { out[q2] = 1; qd[a1++] = q2; } }
      }
      var cov = a1 / N;
      if (cov < 0.08) return { ok: false, why: 'background not found' };
      if (cov > 0.97) return { ok: false, why: 'nothing left of the product' };
      // inside the black region: opacity follows brightness (smoke and glow fade out smoothly, pure black goes clear);
      // everything not connected to the edge (e.g. the black screen of a device) stays fully solid
      for (var u = 0; u < N; u++) {
        if (!out[u]) continue;
        var m = mx(u), al = Math.min(1, Math.max(0, (m - LO) / (DK - LO)));
        var o2 = u * 4;
        if (al > 0.04) { d[o2] = Math.min(255, d[o2] / al); d[o2 + 1] = Math.min(255, d[o2 + 1] / al); d[o2 + 2] = Math.min(255, d[o2 + 2] / al); }
        d[o2 + 3] = Math.round(255 * al * al);
      }
      return { ok: true, cover: cov, mode: 'dark' };
    }

    // ---- plain solid-colour background (white, grey, coloured) ----
    // edge must be fairly uniform to count as a solid background
    var off = 0;
    for (var k = 0; k < R.length; k++) {
      var dr = R[k] - bg[0], dg = G[k] - bg[1], db = B[k] - bg[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) > BOUND) off++;
    }
    if (off / R.length > 0.12) return { ok: false, why: 'edge is not a solid colour' };
    // 2. flood fill inward from the edge
    function near(p) { var o = p * 4, dr = d[o] - bg[0], dg = d[o + 1] - bg[1], db = d[o + 2] - bg[2]; return Math.sqrt(dr * dr + dg * dg + db * db) <= BOUND; }
    function step(p, q) { var a = p * 4, b = q * 4, dr = d[a] - d[b], dg = d[a + 1] - d[b + 1], db = d[a + 2] - d[b + 2]; return Math.sqrt(dr * dr + dg * dg + db * db) <= STEP; }
    var isbg = new Uint8Array(N), queue = new Int32Array(N), qh = 0, qt = 0;
    for (var p0 = 0; p0 < N; p0++) {
      var X = p0 % w, Y = (p0 / w) | 0;
      if ((X === 0 || X === w - 1 || Y === 0 || Y === h - 1) && near(p0)) { isbg[p0] = 1; queue[qt++] = p0; }
    }
    while (qh < qt) {
      var p = queue[qh++], px = p % w, py = (p / w) | 0, nb = [];
      if (px > 0) nb.push(p - 1); if (px < w - 1) nb.push(p + 1); if (py > 0) nb.push(p - w); if (py < h - 1) nb.push(p + w);
      for (var n = 0; n < nb.length; n++) { var q = nb[n]; if (!isbg[q] && near(q) && step(p, q)) { isbg[q] = 1; queue[qt++] = q; } }
    }
    var cover = qt / N;
    if (cover < 0.08) return { ok: false, why: 'background not found' };
    if (cover > 0.97) return { ok: false, why: 'nothing left of the product' };
    if (isbg[(h >> 1) * w + (w >> 1)]) return { ok: false, why: 'centre looks like background' };
    // 3. product mask: erode 1px (kills the coloured fringe), blur 3x3 for a soft edge
    var m = new Uint8Array(N);
    for (var a = 0; a < N; a++) m[a] = isbg[a] ? 0 : 1;
    var e = new Uint8Array(N);
    for (var yy = 1; yy < h - 1; yy++) for (var xx = 1; xx < w - 1; xx++) {
      var pp = yy * w + xx;
      e[pp] = (m[pp] && m[pp - 1] && m[pp + 1] && m[pp - w] && m[pp + w]) ? 1 : 0;
    }
    for (var by = 0; by < h; by++) for (var bx = 0; bx < w; bx++) {
      var s = 0, c = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var ax = bx + dx, ay = by + dy;
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) { c++; continue; }
        s += e[ay * w + ax]; c++;
      }
      d[(by * w + bx) * 4 + 3] = Math.round(255 * s / c);
    }
    return { ok: true, cover: cover };
  }

  var SIZE = 500;

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var i = new Image();
      if (!/^(data|blob):/i.test(src)) i.crossOrigin = 'anonymous';   // remote photos need CORS to be readable
      i.onload = function () { res(i); }; i.onerror = rej; i.src = src;
    });
  }
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function encode(canvas) {                      // WebP keeps transparency at a small size; PNG is the fallback
    var out = canvas.toDataURL('image/webp', 0.88);
    return out.indexOf('data:image/webp') === 0 ? out : canvas.toDataURL('image/png');
  }

  // Returns { url, cut } or { fail: reason }. cut = true when a background was removed.
  async function process(src, maxSize) {
    var img = await loadImage(src);
    var s = Math.min(1, (maxSize || SIZE) / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    var id = x.getImageData(0, 0, w, h);
    var r = gwCutoutPixels(id.data, w, h);
    if (r.ok) { x.putImageData(id, 0, 0); return { url: encode(c), cut: true }; }
    if (r.transparent) return { url: encode(c), cut: false, already: true };
    return { fail: r.why };
  }
  window.gwCutout = process;

  // 1) new uploads
  var original = window.readImageCompressed;
  window.readImageCompressed = async function (file, maxSize) {
    try {
      if (file && file.type && file.type.indexOf('image/') === 0 && file.type !== 'image/gif') {
        var res = await process(await fileToDataUrl(file), maxSize);
        if (res.url) return res.url;
      }
    } catch (e) { /* fall back to the normal upload below */ }
    return original(file, maxSize);
  };

  // 2) existing photos
  var save = document.getElementById('saveMenu');
  if (save && !document.getElementById('gwCutAll')) {
    var btn = document.createElement('button');
    btn.className = 'btn small'; btn.id = 'gwCutAll'; btn.type = 'button';
    btn.textContent = 'Make photos transparent'; btn.style.marginLeft = '8px';
    save.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', async function () {
      var msg = document.getElementById('menuMsg');
      btn.disabled = true; msg.textContent = 'Working on your photos…';
      var done = 0, skipped = [];
      for (var k = 0; k < STATE.menu.length; k++) {
        var it = STATE.menu[k];
        if (!it.photo) continue;
        try {
          var r = await process(it.photo);
          if (r.cut) { it.photo = r.url; done++; }
          else if (r.fail) skipped.push(it.name + ' (' + r.fail + ')');
        } catch (e) { skipped.push(it.name + ' (could not read)'); }
      }
      btn.disabled = false;
      if (typeof renderMenuAdmin === 'function') renderMenuAdmin();
      if (typeof renderMenu === 'function') renderMenu();
      msg = document.getElementById('menuMsg');
      msg.textContent = done + ' photo' + (done === 1 ? '' : 's') + ' made transparent. ' +
        (done ? 'Check the menu, then press "Save menu" to publish for everyone. ' : '') +
        (skipped.length ? 'Left as they were: ' + skipped.join(', ') + '.' : '');
    });
  }

  // 0) automatic: make every photo on the public menu transparent as it is drawn
  var css = document.createElement('style');
  css.textContent =
    '.product-media[data-gw-wait] .photo{opacity:0}' +
    // a cut-out photo always sits on the normal light tile, whatever the dark-photo fallback script decided
    '.product-media[data-gw-cut]{background:radial-gradient(ellipse at 50% 35%,#d7dfbd,#aebe91 75%) !important}' +
    '.card .product-media[data-gw-cut] .photo{padding:18px !important;mix-blend-mode:multiply !important;' +
    'filter:saturate(.78) contrast(1.03) !important;-webkit-mask-image:none !important;mask-image:none !important}' +
    '@media(max-width:420px){.card .product-media[data-gw-cut] .photo{padding:10px !important}}';
  document.head.appendChild(css);

  var results = new Map();     // original photo -> result, so each photo is processed once per visit
  var inflight = new Map();
  var queue = Promise.resolve();
  var busy = 0;                // photos still being processed

  function request(src) {
    if (inflight.has(src)) return;
    busy++;
    var p = new Promise(function (resolve) {
      queue = queue.then(function () {
        return process(src).catch(function () { return { fail: 'unreadable' }; }).then(function (r) {
          results.set(src, r); busy--; resolve();
          return new Promise(function (t) { setTimeout(t, 0); });   // let the page breathe between photos
        });
      });
    });
    inflight.set(src, p);
    p.then(autoClean);
  }

  function autoClean() {
    var grid = document.getElementById('grid');
    if (!grid) return;
    grid.querySelectorAll('.product-media').forEach(function (media) {
      var img = media.querySelector('img.photo');
      if (!img || media.dataset.gwSeen) return;
      var src = img.getAttribute('src');
      if (!src) return;
      var r = results.get(src);
      if (r) {
        media.removeAttribute('data-gw-wait');
        media.dataset.gwSeen = '1';
        if (r.cut) img.src = r.url;
        if (r.cut || r.already) media.setAttribute('data-gw-cut', '');
        return;
      }
      media.setAttribute('data-gw-wait', '');
      request(src);
    });
  }
  // never leave a photo hidden if something goes wrong
  setInterval(function () {
    document.querySelectorAll('#grid .product-media[data-gw-wait]').forEach(function (m) {
      if (!busy) m.removeAttribute('data-gw-wait');
    });
  }, 6000);

  if (typeof renderMenu === 'function') {
    var baseRender = renderMenu;
    renderMenu = function () { var out = baseRender.apply(this, arguments); autoClean(); return out; };
  }
  var gridEl = document.getElementById('grid');
  if (gridEl) new MutationObserver(autoClean).observe(gridEl, { childList: true });
  autoClean();
})();
