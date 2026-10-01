(function () {
  var st = document.createElement('style');
  st.textContent = '.product-media[data-dark]{background:var(--gw-edge,#000)}' +
    '.card .product-media[data-dark] .photo{padding:0;mix-blend-mode:normal;filter:none;' +
    '-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent),linear-gradient(180deg,transparent,#000 8%,#000 92%,transparent);-webkit-mask-composite:source-in;' +
    'mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent),linear-gradient(180deg,transparent,#000 8%,#000 92%,transparent);mask-composite:intersect}';
  document.head.appendChild(st);

  var cache = {};
  function edgeOf(t) {
    var s = 48, c = document.createElement('canvas'); c.width = c.height = s;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(t, 0, 0, s, s);
    var d = x.getImageData(0, 0, s, s).data, R = [], G = [], B = [];
    for (var py = 0; py < s; py++) for (var px = 0; px < s; px++) {
      if (px > 1 && px < s - 2 && py > 1 && py < s - 2) continue;
      var i = (py * s + px) * 4; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]);
    }
    function med(a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; }
    return [med(R), med(G), med(B)];
  }
  function mark(media, e) {
    if (e && (e[0] + e[1] + e[2]) / 3 < 50) {
      media.style.setProperty('--gw-edge', 'rgb(' + e.join(',') + ')');
      media.setAttribute('data-dark', '');
    }
  }
  function prep(media) {
    if (media.dataset.gwDark) return;
    var img = media.querySelector('img.photo');
    if (!img) return;
    media.dataset.gwDark = '1';
    var src = img.currentSrc || img.src;
    if (cache[src]) return mark(media, cache[src]);
    var t = new Image(); t.crossOrigin = 'anonymous';
    t.onload = function () { try { cache[src] = edgeOf(t); mark(media, cache[src]); } catch (e) {} };
    t.src = src;
  }
  function scan() { document.querySelectorAll('#grid .product-media').forEach(prep); }
  scan();
  var grid = document.getElementById('grid');
  if (grid) new MutationObserver(scan).observe(grid, { childList: true });
})();
