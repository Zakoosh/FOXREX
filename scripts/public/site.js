/* FOXREX public site behaviour: mobile menu, language toggle, scroll reveal, year. No dependencies. */
(function () {
  'use strict';
  var d = document.documentElement;

  /* Language (EN/LTR <-> AR/RTL). Both languages are in the markup; CSS hides the inactive one. */
  function setLang(lang) {
    d.lang = lang === 'ar' ? 'ar' : 'en';
    d.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('foxrex-lang', d.lang); } catch (e) { /* storage unavailable */ }
    document.dispatchEvent(new CustomEvent('foxrex:lang', { detail: d.lang }));
  }
  document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(d.lang === 'ar' ? 'en' : 'ar'); });
  });

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
