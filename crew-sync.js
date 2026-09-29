// Shares the crew roster and roles across browsers (Supabase). Load AFTER catalog.js.
(() => {
  const c = window.gwClient; if (!c) return;
  let rev = 0, owner = false, live = false, base = null, first = true;
  const snap = () => JSON.stringify({ r: STATE.roster.map(p => [p.id, p.name, p.role, owner ? p.pin : '']), ro: STATE.roles });

  function apply(d) {
    STATE.roles = d.roles || STATE.roles;
    STATE.roster.splice(0, STATE.roster.length, ...(d.roster || []).map(p => ({ id: p.id, name: p.name, role: p.role, pin: p.pin || '' })));
    ensureRoles();
    if (signedIn) {
      signedIn = STATE.roster.find(p => p.id === signedIn.id) || null;
      if (!signedIn) { try { sessionStorage.removeItem('gw_local_signed_in'); } catch (e) {} }
    }
    base = snap();
    try { renderStaffGrid(); renderCrewPanel(); initPerms(); renderRolesAdmin(); renderRosterAdmin(); refreshNewRoleOptions(); } catch (e) { console.warn(e); }
  }
  async function pull(force) {
    const r = await (owner ? c.rpc('crew_admin_get') : c.rpc('crew_public'));
    const d = r.data; if (r.error || !d) return;
    if (!(d.revision > 0)) { live = false; return; }
    live = true;
    if (!force && d.revision === rev) return;
    if (!force && base !== null && snap() !== base) return; // unsaved local edits: don't overwrite
    rev = d.revision; apply(d);
  }
  async function checkOwner() {
    const { data: { session } } = await c.auth.getSession();
    let o = false;
    if (session) { const r = await c.rpc('is_catalog_owner'); o = r.data === true; }
    const changed = o !== owner; owner = o;
    await pull(first || changed); first = false;
  }

  const prev = publishState;
  publishState = async function (opts = {}) {
    const r = await prev(opts);
    if (!opts.crew) return r;
    if (!owner) return { ok: false, reason: 'Verify your Owner email in Shared menu access first. Nothing was published.' };
    const payload = { roster: STATE.roster.map(p => ({ id: p.id, name: p.name, role: p.role, pin: p.pin })), roles: STATE.roles };
    const { data, error } = await c.rpc('crew_admin_save', { p_payload: payload, p_revision: rev });
    if (error) return { ok: false, reason: error.message };
    rev = data; live = true; base = snap();
    return { ok: true, shared: true };
  };
  gwFindPerson = async pin => {
    if (live) {
      const { data, error } = await c.rpc('crew_login', { p_pin: pin });
      if (error || !data || !data.ok) return null;
      return STATE.roster.find(p => p.id === data.person.id) || null;
    }
    return STATE.roster.find(p => p.pin === pin) || null; // before the first shared save
  };
  c.auth.onAuthStateChange(() => setTimeout(checkOwner, 0));
  checkOwner();
  setInterval(() => { if (!document.hidden) pull(false); }, 15000);
  addEventListener('focus', () => pull(false));
})();
