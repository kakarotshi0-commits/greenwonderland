// Lightweight navigation feedback. No continuous canvas or pointer animation loop.
(() => {
  'use strict';
  const header = document.querySelector('header');
  let scheduled = false;
  function updateHeader() {
    scheduled = false;
    header?.classList.toggle('gw-scrolled', scrollY > 24);
  }
  addEventListener('scroll', () => {
    if (!scheduled && !document.hidden) {
      scheduled = true;
      requestAnimationFrame(updateHeader);
    }
  }, { passive: true });
  updateHeader();
  // Deferred features add navigation links after this script loads.
  const links = new Map();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((link, id) => link.classList.toggle('gw-active', id === entry.target.id));
    }
  }, { rootMargin: '-20% 0px -65% 0px' });
  function observeLinks() {
    document.querySelectorAll('.navlinks a[href^="#"]').forEach(link => {
      const id = link.getAttribute('href').slice(1), section = document.getElementById(id);
      if (!section || links.has(id)) return;
      links.set(id, link); observer.observe(section);
    });
  }
  observeLinks();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeLinks, { once: true });
})();
