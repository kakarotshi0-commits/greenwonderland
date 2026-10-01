// Shares the crew roster and roles across browsers (Supabase). Load AFTER catalog.js.
// Owner/Admin access is proven by their crew code (checked on the server); no email verification.
(() => {
  const c = window.gwClient; if (!c) return;
  let rev = 0, live = false, base = null;
  const TOP = ['owner', 'admin', 'administrator'];
  const isTop = p => !!p && TOP.includes(String(p.role).trim().toLowerCase());
  const owner = () => isTop(signedIn) && !!window.gwPin;
  const snap = () => JSON.stringify({ r: STATE.roster.map(p => [p.id, p.name, p.role, owner() ? p.pin : '']), ro: STATE.roles });
  const authChanged = () => { window.dispatchEvent(new Event('gw-auth-changed')); pull(true); };

  function apply(d) {
    STATE.roles = d.roles || STATE.roles;
    STATE.roster.splice(0, STATE.roster.length, ...(d.roster || []).map(p => ({ id: p.id, name: p.name, role: p.role, pin: p.pin || '' })));
    ensureRoles();
    if (signedIn) {
      signedIn = STATE.roster.find(p => p.id === signedIn.id) || null;
      if (!signedIn) { window.gwPin = null; try { sessionStorage.removeItem('gw_local_signed_in'); } catch (e) {} }
    }
    base = snap();
    try { renderStaffGrid(); renderCrewPanel(); initPerms(); renderRolesAdmin(); renderRosterAdmin(); refreshNewRoleOptions(); } catch (e) { console.warn(e); }
  }
  async function pull(force) {
    const r = await (owner() ? c.rpc('crew_admin_get_pin', { p_pin: window.gwPin }) : c.rpc('crew_public'));
    const d = r.data; if (r.error || !d) return;
    if (d.ok === false) return;
    if (!(d.revision > 0)) { live = false; return; }
    live = true;
    if (!force && d.revision === rev) return;
    if (!force && base !== null && snap() !== base) return; // unsaved local edits: don't overwrite
    rev = d.revision; apply(d);
  }

  const prev = publishState;
  publishState = async function (opts = {}) {
    const r = await prev(opts);
    if (!opts.crew) return r;
    if (isTop(signedIn) && !window.gwPin && window.gwEnsurePin) window.gwEnsurePin();
    if (!owner()) return { ok: false, reason: 'Sign in as Owner or Admin with your code first. Nothing was published.' };
    const payload = { roster: STATE.roster.map(p => ({ id: p.id, name: p.name, role: p.role, pin: p.pin })), roles: STATE.roles };
    const { data, error } = await c.rpc('crew_admin_save_pin', { p_pin: window.gwPin, p_payload: payload, p_revision: rev });
    if (error) return { ok: false, reason: error.message };
    if (!data || !data.ok) { window.gwPin = null; return { ok: false, reason: (data && data.msg) || 'Not allowed.' }; }
    rev = data.revision; live = true; base = snap();
    return { ok: true, shared: true };
  };
  gwFindPerson = async pin => {
    let person = null;
    if (live) {
      const { data, error } = await c.rpc('crew_login', { p_pin: pin });
      if (!error && data && data.ok) person = STATE.roster.find(p => p.id === data.person.id) || null;
    } else {
      person = STATE.roster.find(p => p.pin === pin) || null; // before the first shared save
    }
    window.gwPin = person ? pin : null;   // kept in memory only; the server re-checks it on every request
    setTimeout(authChanged, 0);
    return person;
  };
  document.getElementById('signoutBtn').addEventListener('click', () => { window.gwPin = null; setTimeout(authChanged, 0); });
  pull(true);
  setInterval(() => { if (!document.hidden) pull(false); }, 15000);
  addEventListener('focus', () => pull(false));
})();
