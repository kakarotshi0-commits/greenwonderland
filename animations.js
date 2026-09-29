// Animate menu cards only in response to the visitor: a chip click or typing in search.
// This keeps the initial load (and the shared-menu sync) from replaying the animation.
(() => {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const enable = () => grid.classList.add('animate-in');
  document.addEventListener('click', e => { if (e.target.closest('.chip')) enable(); });
  const search = document.getElementById('search');
  if (search) search.addEventListener('input', enable);
})();
