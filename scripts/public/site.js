/* FOXREX public site behaviour: mobile menu, language toggle, scroll reveal, year. No dependencies. */
(function () {
  'use strict';

  /* Language: English lives at /, Arabic at /ar/. The switcher is a normal link to the
     equivalent page; the choice is also remembered (used by the 404 page). */
  document.querySelectorAll('[data-lang-switch]').forEach(function (a) {
    a.addEventListener('click', function () {
      try { localStorage.setItem('foxrex-lang', a.getAttribute('data-lang-switch')); } catch (e) { /* storage unavailable */ }
    });
  });

  /* The choice persists across languages and page loads. */
  var themeButton = document.querySelector('[data-theme-toggle]');
  var lang = document.documentElement.lang;
  function themeLabel() {
    if (!themeButton) return;
    var light = document.documentElement.dataset.theme === 'light';
    var label = lang === 'ar' ? (light ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح') : lang === 'tr' ? (light ? 'Koyu temaya geç' : 'Açık temaya geç') : (light ? 'Switch to dark mode' : 'Switch to light mode');
    themeButton.setAttribute('aria-label', label); themeButton.setAttribute('title', label);
    themeButton.setAttribute('aria-pressed', String(light));
  }
  if (themeButton) themeButton.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('foxrex-theme', next); } catch(e) {}
    themeLabel();
  });
  themeLabel();

  /* Mobile navigation */
  var btn = document.querySelector('[data-menu-btn]');
  var nav = document.getElementById('mobile-nav');
  function menu(open) {
    if (!btn || !nav) return;
    btn.setAttribute('aria-expanded', String(open));
    nav.setAttribute('data-open', String(open));
    document.body.setAttribute('data-menu', open ? 'open' : 'closed');
    if (open) { var first = nav.querySelector('a'); if (first) first.focus(); }
  }
  if (btn && nav) {
    btn.addEventListener('click', function () { menu(btn.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) menu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') { menu(false); btn.focus(); }
    });
    window.matchMedia('(min-width: 981px)').addEventListener('change', function (m) { if (m.matches) menu(false); });
  }

  /* Reveal on scroll */
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
