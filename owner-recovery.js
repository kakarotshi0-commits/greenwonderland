// Owner/Admin "Forgot code?" flow. Load AFTER crew-sync.js.
// 1) On first Owner sign-in the Owner is asked for a backup email.
// 2) "Forgot code?" (shown on Owner/Admin cards) emails a one-time link to that backup email only.
// 3) Opening the link lets the person choose a new code (checked on the server).
(() => {
  const c = window.gwClient; if (!c) return;
  const $ = id => document.getElementById(id);
  const TOP = ['owner', 'admin', 'administrator'];
  const role = p => String(p && p.role || '').trim().toLowerCase();
  const isTop = p => TOP.includes(role(p));
  const REDIRECT = 'https://kakarotshi0-commits.github.io/greenwonderland/';
  const KEY = 'gw_reset_target';

  function box(id, html) {
    const d = document.createElement('div');
    d.id = id; d.className = 'card2'; d.hidden = true; d.innerHTML = html;
    return d;
  }
  // ----- backup email prompt (inside the crew panel, Owner only) -----
  const backup = box('gwBackupBox',
    '<h3 style="font-size:1.1rem;margin-bottom:8px">Set a backup email</h3>' +
    '<p class="sub">If you ever forget your code, a reset link is sent to this address only. Enter your Owner code to confirm it is you.</p>' +
    '<div class="row"><input type="email" id="gwBackupEmail" placeholder="Backup email" style="min-width:220px">' +
    '<input type="password" id="gwBackupPin" placeholder="Owner code" aria-label="Owner code" autocomplete="current-password" style="width:160px">' +
    '<button type="button" class="btn small solid" id="gwBackupSave">Save backup email</button></div>' +
    '<p class="msg" id="gwBackupMsg" role="status"></p>');
  $('crewPanel').insertBefore(backup, $('crewPanel').firstChild);

  // ----- forgot-code panel (under the sign-in box) -----
  const reset = box('gwResetBox',
    '<h3 style="font-size:1.1rem;margin-bottom:8px" id="gwResetTitle">Reset code</h3>' +
    '<div id="gwResetStep1"><p class="sub">Enter the backup email set by the Owner. We will send a one-time link to it.</p>' +
    '<div class="row"><input type="email" id="gwResetEmail" placeholder="Backup email" style="min-width:220px">' +
    '<button type="button" class="btn small solid" id="gwResetSend">Send reset link</button>' +
    '<button type="button" class="btn small" id="gwResetCancel">Cancel</button></div></div>' +
    '<div id="gwResetStep2" hidden><p class="sub">Email confirmed. Choose a new code (at least 4 characters).</p>' +
    '<div class="row"><input type="password" id="gwNewCode" placeholder="New code" style="width:160px">' +
    '<button type="button" class="btn small solid" id="gwResetSave">Save new code</button></div></div>' +
    '<p class="msg" id="gwResetMsg" role="status"></p>');
  $('signinBox').after(reset);

  const say = (id, t) => { $(id).textContent = t; };
  const target = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && Date.now() - o.t < 3600e3 ? o : null; } catch { return null; } };
  const clearTarget = () => { try { localStorage.removeItem(KEY); } catch {} };

  // "Forgot code?" button on every Owner/Admin card
  const baseRender = renderStaffGrid;
  renderStaffGrid = function () {
    baseRender();
    const cards = $('staffgrid').children;
    STATE.roster.forEach((p, i) => {
      if (!isTop(p) || !cards[i]) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn small'; b.style.marginTop = '8px'; b.textContent = 'Forgot code?';
      b.onclick = () => {
        try { localStorage.setItem(KEY, JSON.stringify({ id: p.id, name: p.name, t: Date.now() })); } catch {}
        $('gwResetTitle').textContent = 'Reset code for ' + p.name;
        $('gwResetStep1').hidden = false; $('gwResetStep2').hidden = true;
        say('gwResetMsg', ''); reset.hidden = false; $('gwResetEmail').focus();
      };
      cards[i].appendChild(b);
    });
  };
  renderStaffGrid();

  $('gwResetCancel').onclick = () => { reset.hidden = true; clearTarget(); };
  $('gwResetSend').onclick = async () => {
    const email = $('gwResetEmail').value.trim(); if (!email) return;
    const btn = $('gwResetSend'); btn.disabled = true;
    try {
      const { data } = await c.rpc('owner_recovery_email_matches', { p_email: email });
      if (data === true) await c.auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT } });
      say('gwResetMsg', 'If that is the backup email on file, a reset link has been sent. Open it in this browser.');
    } finally { btn.disabled = false; }
  };

  // Returning from the emailed link: session exists and a reset was started here
  async function checkReturn() {
    const t = target(); if (!t) return;
    const { data: { session } } = await c.auth.getSession(); if (!session) return;
    $('gwResetTitle').textContent = 'Reset code for ' + t.name;
    $('gwResetStep1').hidden = true; $('gwResetStep2').hidden = false; reset.hidden = false;
  }
  $('gwResetSave').onclick = async () => {
    const t = target(); const pin = $('gwNewCode').value.trim();
    if (!t) { say('gwResetMsg', 'Reset expired. Start again with Forgot code?'); return; }
    if (pin.length < 4) { say('gwResetMsg', 'Use at least 4 characters.'); return; }
    const { error } = await c.rpc('owner_reset_code', { p_person_id: t.id, p_new_pin: pin });
    if (error) { say('gwResetMsg', error.message); return; }
    clearTarget(); $('gwNewCode').value = ''; await c.auth.signOut();
    $('gwResetStep2').hidden = true; say('gwResetMsg', 'Code changed. Sign in with your new code.');
  };
  c.auth.onAuthStateChange(() => setTimeout(checkReturn, 0));
  checkReturn();

  // Owner first entry: ask for backup email if none is set
  async function checkBackup() {
    backup.hidden = true;
    if (!isTop(signedIn)) return;   // Owner, Admin or Administrator
    const { data } = await c.rpc('owner_backup_is_set');
    if (data === false) backup.hidden = false;
  }
  $('gwBackupSave').onclick = async () => {
    const email = $('gwBackupEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { say('gwBackupMsg', 'Enter a valid email.'); return; }
    const pin = $('gwBackupPin').value.trim() || window.gwPin || '';
    if (!pin) { say('gwBackupMsg', 'Enter your Owner code in the box above.'); $('gwBackupPin').focus(); return; }
    const btn = $('gwBackupSave'); btn.disabled = true; say('gwBackupMsg', 'Saving…');
    try {
      const { data, error } = await c.rpc('owner_set_backup_email', { p_pin: pin, p_email: email });
      if (error) { say('gwBackupMsg', error.message); return; }
      if (data && data.ok === false) {
        say('gwBackupMsg', (data.msg || 'Could not save.') + ' Check your Owner code and try again.');
        $('gwBackupPin').focus(); return;
      }
      window.gwPin = pin;               // verified by the server; kept in memory only
      $('gwBackupPin').value = ''; $('gwBackupEmail').value = '';
      say('gwBackupMsg', 'Backup email saved.'); backup.hidden = true;
    } catch (e) { say('gwBackupMsg', 'Could not reach the server. Try again.'); }
    finally { btn.disabled = false; }
  };
  window.addEventListener('gw-auth-changed', checkBackup);
  checkBackup();
})();
