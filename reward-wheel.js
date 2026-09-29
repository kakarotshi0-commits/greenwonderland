/* Green Wonderland - Reward Wheel (shared version, backed by Supabase)
 * No dependencies. Run reward-wheel-setup.sql in Supabase once first.
 *
 *   <script src="reward-wheel.js"></script>
 *   RewardWheel.init({
 *     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',   // same values your gallery already uses
 *     supabaseKey: 'YOUR-PUBLIC-ANON-KEY',
 *     canManage: () => currentUserIsOwnerOrAdmin()
 *   });
 *   // when a sale is finalized:
 *   RewardWheel.onSale({ id: sale.id, employee: sale.employeeName, total: sale.total });
 */
(function (global) {
  'use strict';

  var PALETTE = ['#2f9e5a', '#e8a317', '#3b82c4', '#c8453b', '#8a5cc2', '#1f8a8a', '#d9683f', '#6b7d2f'];
  var TAU = Math.PI * 2;
  var cfg = { supabaseUrl: '', supabaseKey: '', canManage: function () { return false; }, currency: '$', dock: true };
  var overlay = null, raf = 0, adminBtn = null, adminPin = null, settingsCache = null;

  /* ---------- server calls ---------- */
  function rpc(fn, args) {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return Promise.reject(new Error('The reward wheel is missing its Supabase URL or key.'));
    var headers = { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(cfg.supabaseKey)) headers.Authorization = 'Bearer ' + cfg.supabaseKey;
    return fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(args || {}) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok) throw new Error((j && j.message) || 'Request failed (' + r.status + ')');
          return j;
        });
      });
  }
  function fetchSettings() { return rpc('rw_get_settings').then(function (s) { settingsCache = s; return s; }); }

  function rand() { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  function money(n) { return cfg.currency + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function can() { try { return !!cfg.canManage(); } catch (e) { return false; } }

  /* ---------- tiny DOM helper (textContent only, so reward names can't inject HTML) ---------- */
