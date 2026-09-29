// Green Wonderland animations v2: scroll reveal, header state, scroll-spy, cursor effects.
(() => {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = s => document.querySelector(s), raf = requestAnimationFrame;
  const seen = new Set(); let userAction = 0;
  const forced = () => performance.now() - userAction < 800;

  /* ---- scroll reveal ---- */
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } }),
    { threshold: .1, rootMargin: '0px 0px -6% 0px' });
  function show(el) {
    if (!el.isConnected) return;
    if (el._k) seen.add(el._k);
    el.classList.add('in');
    if (el.matches('#grid > .card')) countUp(el.querySelector('.price'));
    let done = false;
    const finish = () => { if (done) return; done = true; el.classList.remove('gw-reveal', 'gw-blur', 'in'); el.style.removeProperty('--d'); el.classList.add('gw-seen'); };
    el.addEventListener('transitionend', e => { if (e.target === el && e.propertyName === 'opacity') finish(); });
    setTimeout(finish, 2000);
  }
  function mark(el, i, blur) {
    if (el.classList.contains('gw-reveal') || el.classList.contains('gw-seen')) return;
    el.style.setProperty('--d', Math.min(i, 8) * 80 + 'ms');
    el.classList.add('gw-reveal'); if (blur) el.classList.add('gw-blur');
    io.observe(el);
  }
  function countUp(el) {
    const m = el && el.textContent.trim().match(/^(\D*?)([\d,]*\.?\d+)(\D*)$/); if (!m) return;
    const txt = el.textContent, end = parseFloat(m[2].replace(/,/g, '')); if (!end) return;
    const dec = (m[2].split('.')[1] || '').length, t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / 900); if (!el.isConnected) return;
      el.textContent = p < 1 ? m[1] + (end * (1 - Math.pow(1 - p, 4))).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3] : txt;
      if (p < 1) raf(step); };
    raf(step);
  }
  const keyOf = (c, n) => { const img = n.querySelector('img'); return c.id + '|' + (n.querySelector('h3')?.textContent || '') + '|' + (img?.getAttribute('src') || '') + '|' + (n.querySelector('.price')?.textContent || ''); };
  function addKids(c, nodes) {
    let i = 0;
    for (const n of nodes) {
      if (n.nodeType !== 1 || !n.isConnected) continue;
      const k = keyOf(c, n);
      if (seen.has(k) && !forced()) { n.classList.add('gw-seen'); continue; }
      n._k = k; mark(n, i++, false);
    }
  }
  try {
    document.querySelectorAll('section').forEach(sec => {
      if (sec.classList.contains('hero')) return; let i = 0;
      sec.querySelectorAll('.section-head,.gallery-heading,.tools,.card2,.gallery-upload,.gallery-refresh,#about .wrap > *')
        .forEach(el => mark(el, i++, el.matches('.section-head,.gallery-heading')));
    });
    const foot = $('footer'); if (foot) mark(foot, 0, false);
    ['grid', 'crewGalleryGrid', 'communityGalleryGrid', 'staffgrid'].forEach(id => {
      const c = document.getElementById(id); if (!c) return;
      addKids(c, [...c.children]);
      new MutationObserver(ms => { const a = []; ms.forEach(r => r.addedNodes.forEach(n => a.push(n))); addKids(c, a); }).observe(c, { childList: true });
    });
  } catch (err) { document.querySelectorAll('.gw-reveal').forEach(e => e.classList.remove('gw-reveal', 'gw-blur')); }
  document.addEventListener('click', e => { if (e.target.closest?.('.chip')) userAction = performance.now(); }, true);
  document.addEventListener('input', e => { if (e.target.id === 'search') userAction = performance.now(); }, true);

  /* ---- ambient layers, progress bar, header, scroll-spy ---- */
  const amb = document.createElement('div'); amb.className = 'gw-ambient'; amb.setAttribute('aria-hidden', 'true');
  amb.innerHTML = '<i class="gw-orb o1"></i><i class="gw-orb o2"></i><i class="gw-orb o3"></i>';
  const bar = document.createElement('div'); bar.className = 'gw-progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.append(amb, bar);
  const header = $('header'), crest = $('.crest');
  const links = [...document.querySelectorAll('.navlinks a[href^="#"]')];
  const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(es => es.forEach(en => { if (!en.isIntersecting) return;
    links.forEach(l => l.classList.remove('gw-active')); byId.get(en.target.id)?.classList.add('gw-active'); }), { rootMargin: '-45% 0px -50% 0px' });
  byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  let mx = innerWidth / 2, my = innerHeight / 2, cx = mx, cy = my, px = 0, py = 0, loopOn = false, tick = false;
  const glow = fine ? Object.assign(document.createElement('div'), { className: 'gw-cursor' }) : null;
  if (glow) document.body.append(glow);
  const place = () => crest && crest.style.setProperty('translate', px.toFixed(2) + 'px ' + (py + Math.min(scrollY, 700) * .1).toFixed(2) + 'px');
  function onScroll() {
    if (tick) return; tick = true;
    raf(() => { tick = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max) : 0);
      header && header.classList.toggle('gw-scrolled', scrollY > 24);
      if (scrollY < 200) links.forEach(l => l.classList.remove('gw-active'));
      place(); });
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---- fine-pointer effects: cursor glow, crest parallax, card tilt, magnetic CTA, ripple ---- */
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest?.('.btn,.chip'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, i = document.createElement('span');
    i.className = 'gw-ripple'; i.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.append(i); i.addEventListener('animationend', () => i.remove());
  });
  if (!fine) return;
  function loop() {
    cx += (mx - cx) * .12; cy += (my - cy) * .12;
    const tx = (mx / innerWidth - .5) * -14, ty = (my / innerHeight - .5) * -14;
    px += (tx - px) * .08; py += (ty - py) * .08;
    glow.style.transform = `translate3d(${cx}px,${cy}px,0)`; place();
    if (Math.abs(mx - cx) + Math.abs(my - cy) + Math.abs(tx - px) + Math.abs(ty - py) < .4) { loopOn = false; return; }
    raf(loop);
  }
  let last = null, ev = null, sched = false;
  const release = () => { if (last) last.style.transform = ''; last = null; };
  function hover() {
    sched = false; const el = ev.target instanceof Element ? ev.target.closest('.card,.gallery-photo,.staff') : null;
    if (last && last !== el) release(); last = el; if (!el) return;
    const r = el.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
    if (el.classList.contains('card') && !el.classList.contains('gw-reveal'))
      el.style.transform = `perspective(900px) rotateX(${(-(y / r.height - .5) * 6).toFixed(2)}deg) rotateY(${((x / r.width - .5) * 7).toFixed(2)}deg) translateY(-4px)`;
  }
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return; mx = e.clientX; my = e.clientY; ev = e;
    glow.classList.add('on'); if (!loopOn) { loopOn = true; raf(loop); }
    if (!sched) { sched = true; raf(hover); }
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { release(); glow.classList.remove('on'); });
  addEventListener('scroll', release, { passive: true });
  const cta = $('.hero .btn');
  if (cta) {
    cta.addEventListener('pointermove', e => { const r = cta.getBoundingClientRect();
      cta.style.translate = `${(e.clientX - r.left - r.width / 2) * .25}px ${(e.clientY - r.top - r.height / 2) * .35}px`; });
    cta.addEventListener('pointerleave', () => { cta.style.translate = ''; });
  }
})();
