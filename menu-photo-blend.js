/* Green Wonderland: menu photos that blend into the site.
 * Load with <script src="menu-photo-blend.js"></script> just above </body> in index.html. */
(function () {
  var st = document.createElement('style');
  st.textContent = "/* Items without a photo get the same light green tile as photo items, so the whole grid matches */\n.product-media.illustrated{background:radial-gradient(ellipse at 50% 35%,#d7dfbd,#aebe91 75%);border:0}\n.illustrated .icon{color:#3f5a2b;filter:none}\n.illustrated span{color:#4d6638}\n\n/* Backup for busy photo backgrounds that cannot be cut out cleanly: the tile takes the photo's edge colour\n   and the photo's edges fade into it, so there is no visible box */\n.product-media[data-solid]{background:var(--gw-edge,#9fb07f)}\n.card .product-media[data-solid] .photo{width:auto;height:auto;min-width:0;min-height:0;\n  max-width:calc(100% - 12px);max-height:calc(100% - 12px);padding:0;mix-blend-mode:normal;filter:none;\n  -webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent),linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);\n  -webkit-mask-composite:source-in;\n  mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent),linear-gradient(180deg,transparent,#000 12%,#000 88%,transparent);\n  mask-composite:intersect}";
  document.head.appendChild(st);
})();

(function () {
  var cache = new Map();                       // original photo -> result, so rebuilding the menu is instant

  function dist(d, a, b) {                     // colour distance between pixel a and pixel b
    var dr = d[a] - d[b], dg = d[a + 1] - d[b + 1], db = d[a + 2] - d[b + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function median(arr) { arr.sort(function (x, y) { return x - y; }); return arr[arr.length >> 1]; }

  function analyse(img) {
    var s = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(8, Math.round(img.naturalWidth * s)), h = Math.max(8, Math.round(img.naturalHeight * s));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    var id = x.getImageData(0, 0, w, h), d = id.data, N = w * h;

    // 1. what colour is the edge of the photo?
    var R = [], G = [], B = [], A = 0, ring = 0, whiteish = 0;
    for (var py = 0; py < h; py++) for (var px = 0; px < w; px++) {
      if (px > 1 && px < w - 2 && py > 1 && py < h - 2) continue;
      var i = (py * w + px) * 4; ring++; A += d[i + 3];
      R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]);
      if (d[i] >= 250 && d[i + 1] >= 250 && d[i + 2] >= 250) whiteish++;
    }
    var edge = [median(R), median(G), median(B)];
    if (A / ring < 200) return { kind: 'asis' };                 // already see-through
    if (whiteish / ring >= 0.9) return { kind: 'asis' };         // pure white: already blends (the first item)

    // 2. flood fill the background inward from the edge. A pixel joins if it is almost the same colour as the
    //    pixel it was reached from, so smooth gradients are followed but the product's outline stops the fill.
    var bg = new Uint8Array(N), q = new Int32Array(N), qh = 0, qt = 0, STEP = 13, BOUND = 95;
    function near(p) { var o = p * 4, dr = d[o] - edge[0], dg = d[o + 1] - edge[1], db = d[o + 2] - edge[2]; return Math.sqrt(dr * dr + dg * dg + db * db) <= BOUND; }
    for (var p0 = 0; p0 < N; p0++) {
      var X = p0 % w, Y = (p0 / w) | 0;
      if ((X < 1 || X > w - 2 || Y < 1 || Y > h - 2) && near(p0)) { bg[p0] = 1; q[qt++] = p0; }
    }
    while (qh < qt) {
      var p = q[qh++], X2 = p % w, Y2 = (p / w) | 0, nb = [];
      if (X2 > 0) nb.push(p - 1); if (X2 < w - 1) nb.push(p + 1); if (Y2 > 0) nb.push(p - w); if (Y2 < h - 1) nb.push(p + w);
      for (var k = 0; k < nb.length; k++) {
        var n = nb[k];
        if (!bg[n] && dist(d, p * 4, n * 4) <= STEP && near(n)) { bg[n] = 1; q[qt++] = n; }
      }
    }
    var cover = qt / N, centre = bg[((h >> 1) * w + (w >> 1))];
    if (cover < 0.15 || cover > 0.97 || centre) return { kind: 'solid', edge: edge };   // not a clean studio shot

    // 3. shrink the product mask by two pixels (removes the coloured fringe), soften it, and write it as transparency
    var er = new Uint8Array(N);
    for (var p1 = 0; p1 < N; p1++) er[p1] = bg[p1] ? 0 : 1;
    for (var pass = 0; pass < 2; pass++) {
      var nx = new Uint8Array(N);
      for (var yy = 1; yy < h - 1; yy++) for (var xx = 1; xx < w - 1; xx++) {
        var pp = yy * w + xx;
        nx[pp] = (er[pp] && er[pp - 1] && er[pp + 1] && er[pp - w] && er[pp + w]) ? 1 : 0;
      }
      er = nx;
    }
    for (var yb = 0; yb < h; yb++) for (var xb = 0; xb < w; xb++) {
      var sum = 0, cnt = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var ax = xb + dx, ay = yb + dy;
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        sum += er[ay * w + ax]; cnt++;
      }
      d[(yb * w + xb) * 4 + 3] = Math.round(255 * sum / cnt);
    }
    x.putImageData(id, 0, 0);
    return { kind: 'cut', url: c.toDataURL('image/png') };
  }

  function apply(media, img, res) {
    if (res.kind === 'cut') { img.src = res.url; }
    else if (res.kind === 'solid') {
      media.style.setProperty('--gw-edge', 'rgb(' + res.edge.join(',') + ')');
      media.setAttribute('data-solid', '');
    }
  }
  function prep(media) {
    if (media.dataset.gwBlend) return;
    var img = media.querySelector('img.photo');
    if (!img) return;
    media.dataset.gwBlend = '1';
    var key = img.getAttribute('src');
    function run() {
      try {
        var res = cache.get(key);
        if (!res) { res = analyse(img); cache.set(key, res); }
        apply(media, img, res);
      } catch (e) { /* if the browser blocks pixel reading, the photo is simply left as it was */ }
    }
    if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
  }
  function scan() { document.querySelectorAll('#grid .product-media').forEach(prep); }
  scan();
  var grid = document.getElementById('grid');
  if (grid) new MutationObserver(scan).observe(grid, { childList: true, subtree: true });
})();
