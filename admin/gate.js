/* FOXREX admin gate.
   admin/gate.json holds a verifier encrypted with AES-GCM under a key derived (PBKDF2-SHA256)
   from "USERNAME\0password". No password, hash or comparison ships in this file: a key that
   decrypts the verifier is the proof. Rotating credentials (tools/admin/set-credentials.mjs)
   invalidates every stored session automatically.
   This is a browser-side gate on a static GitHub Pages site. It keeps visitors out of the
   interface; server-side protection comes from Cloudflare Access on /admin/* (SECURITY.md). */
(function () {
  'use strict';
  var SESSION_KEY = 'foxrex-admin-session', REMEMBER_KEY = 'foxrex-admin-remember', REMEMBER_MS = 7 * 864e5;
  var enc = new TextEncoder(), dec = new TextDecoder();
  var $ = function (id) { return document.getElementById(id); };
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function store(get, k, v) { try { return get ? window[get].getItem(k) : null; } catch (e) { return null; } }
  function put(area, k, v) { try { v === null ? window[area].removeItem(k) : window[area].setItem(k, v); } catch (e) {} }

  var gatePromise = fetch('gate.json', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) throw Error('gate.json ' + r.status);
    return r.json();
  });

  function derive(user, pass, g) {
    return crypto.subtle.importKey('raw', enc.encode(String(user).trim().toUpperCase() + '\u0000' + pass), 'PBKDF2', false, ['deriveBits'])
      .then(function (base) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(g.salt), iterations: g.iterations }, base, 256); })
      .then(function (bits) { return new Uint8Array(bits); });
  }
  function verify(raw, g) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
      .then(function (key) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(g.iv) }, key, unb64(g.ct)); })
      .then(function (pt) { var o = JSON.parse(dec.decode(pt)); if (o.ok !== 'foxrex-admin') throw Error('verifier'); return o; });
  }

  function unlock(info) {
    window.FOXREX_UNLOCKED = true;
    window.FOXREX_ADMIN = { user: info.user || 'FOXREX', issuedAt: info.issuedAt };
    $('gate').hidden = true;
    $('app').hidden = false;
    if (typeof window.FOXREX_BOOT === 'function') window.FOXREX_BOOT();
  }

  function logout() {
    put('sessionStorage', SESSION_KEY, null);
    put('localStorage', REMEMBER_KEY, null);
    location.reload();
  }
  window.FoxAdminLogout = logout;
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-act="admin-logout"]');
    if (t) { e.preventDefault(); e.stopPropagation(); logout(); }
  }, true);

  function storedKey() {
    var s = store('sessionStorage', SESSION_KEY);
    if (s) return s;
    var r = store('localStorage', REMEMBER_KEY);
    if (!r) return null;
    try { var o = JSON.parse(r); if (o.exp > Date.now()) return o.key; } catch (e) {}
    put('localStorage', REMEMBER_KEY, null);
    return null;
  }

  // Resume an existing session without asking again.
  var saved = storedKey();
  var resume = saved ? gatePromise.then(function (g) { return verify(unb64(saved), g); }).then(unlock).catch(function () {
    put('sessionStorage', SESSION_KEY, null); put('localStorage', REMEMBER_KEY, null);
  }) : Promise.resolve();

  var failures = 0, busy = false;
  resume.then(function () {
    if (window.FOXREX_UNLOCKED) return;
    var form = $('gate-form'), msg = $('gate-msg'), btn = $('gate-submit');
    $('gate-user').focus();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      busy = true; btn.disabled = true; msg.textContent = 'جارٍ التحقق…';
      var user = $('gate-user').value, pass = $('gate-pass').value, remember = $('gate-remember').checked;
      gatePromise.then(function (g) {
        return derive(user, pass, g).then(function (raw) {
          return verify(raw, g).then(function (info) {
            var k = b64(raw);
            put('sessionStorage', SESSION_KEY, k);
            if (remember) put('localStorage', REMEMBER_KEY, JSON.stringify({ key: k, exp: Date.now() + REMEMBER_MS }));
            $('gate-pass').value = '';
            msg.textContent = '';
            unlock(info);
          });
        });
      }).catch(function (err) {
        failures++;
        var wait = Math.min(30, 2 * failures);
        msg.textContent = /gate\.json/.test(String(err && err.message)) ? 'تعذّر تحميل إعداد الدخول. تحقق من الاتصال وأعد المحاولة.' : 'اسم المستخدم أو كلمة المرور غير صحيحة. حاول مجددًا بعد ' + wait + ' ثانية.';
        return new Promise(function (r) { setTimeout(r, wait * 1000); });
      }).then(function () { busy = false; btn.disabled = false; });
    });
  });
})();
