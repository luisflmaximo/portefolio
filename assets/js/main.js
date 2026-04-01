/* ================================================================
   LUÍS MÁXIMO — PORTFOLIO — main.js
   ================================================================ */

(function () {
  'use strict';

  /* ── SUPPRESS THIRD-PARTY EMBED NOISE ─────────────────────── */
  // LinkedIn embeds may reject this API in iframe contexts; ignore only this known case.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = typeof reason === 'string'
      ? reason
      : (reason && typeof reason.message === 'string' ? reason.message : '');

    if (
      message.includes('getInstalledRelatedApps') &&
      message.includes('top-level browsing contexts')
    ) {
      event.preventDefault();
    }
  });

  /* ── NAV SCROLL EFFECT ─────────────────────────────────────── */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── MOBILE NAV TOGGLE ─────────────────────────────────────── */
  const burger = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  if (burger && navLinks) {
    burger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('nav__links--open');
      burger.classList.toggle('nav__burger--open', open);
      burger.setAttribute('aria-expanded', open);
    });
    navLinks.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target)) {
        navLinks.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── SECRET TRIGGER (7 taps/clicks on profile photo) ──────── */
  const profilePhoto = document.getElementById('profilePhoto');
  if (profilePhoto) {
    let count = 0;
    let timer = null;

    const handleTap = () => {
      count++;

      if (count === 7) {
        count = 0;
        clearTimeout(timer);
        sessionStorage.setItem('secretUnlocked', '1');
        showSecretTab();
        window.location.href = new URL('../secret/', window.location.href).toString();
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(() => { count = 0; }, 3000);
    };

    profilePhoto.addEventListener('click', handleTap);
  }

  /* ── SECRET TAB visibility (persists during session) ──────── */
  function showSecretTab() {
    document.querySelectorAll('.nav__secret-link').forEach(function(el) {
      el.style.display = '';
    });
  }

  const hasInternalReferrer = (() => {
    if (!document.referrer) return false;
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch (_) {
      return false;
    }
  })();

  // New visits (direct URL, bookmark, external source) require unlocking again.
  if (!hasInternalReferrer) {
    sessionStorage.removeItem('secretUnlocked');
  }

  if (sessionStorage.getItem('secretUnlocked') === '1') {
    showSecretTab();
  }

  /* ── SCROLL REVEAL ─────────────────────────────────────────── */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    );
    reveals.forEach(el => observer.observe(el));
  } else {
    reveals.forEach(el => el.classList.add('revealed'));
  }

  /* ── CV SKILL BARS ANIMATION ───────────────────────────────── */
  const skillBars = document.querySelectorAll('.cv-skill-bar__fill');
  if (skillBars.length && 'IntersectionObserver' in window) {
    const barObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const target = el.dataset.width || '0%';
            setTimeout(() => { el.style.width = target; }, 100);
            barObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.5 }
    );
    skillBars.forEach(bar => {
      bar.style.width = '0%';
      barObserver.observe(bar);
    });
  }

  /* ── ACTIVE NAV LINK ───────────────────────────────────────── */
  // Set active state based on current URL
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && currentPath === href) {
      link.classList.add('nav__link--active');
    }
  });

  /* ── LINKEDIN POST EMBED HEIGHT (ADAPTIVE) ────────────────── */
  const linkedinFrames = document.querySelectorAll('.linkedin-post-card__frame');
  if (linkedinFrames.length) {
    const setLinkedinFrameHeight = () => {
      const viewportW = window.innerWidth || document.documentElement.clientWidth;
      const viewportH = window.innerHeight || document.documentElement.clientHeight;

      linkedinFrames.forEach((frame) => {
        const frameWidth = frame.getBoundingClientRect().width || 320;
        let targetHeight;

        // Cross-origin iframes cannot be measured internally, so use a calibrated viewport-based height.
        if (viewportW <= 480) {
          targetHeight = Math.max(680, Math.min(880, Math.round(viewportH * 0.84)));
        } else if (viewportW <= 768) {
          targetHeight = Math.max(640, Math.min(820, Math.round(viewportH * 0.8)));
        } else {
          targetHeight = 614;
        }

        // Very narrow cards need a bit more height because text wraps sooner.
        if (frameWidth < 340) {
          targetHeight += 28;
        }

        frame.style.height = `${targetHeight}px`;
        frame.style.minHeight = `${targetHeight}px`;
      });
    };

    let resizeTimer;
    const onViewportChange = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setLinkedinFrameHeight, 120);
    };

    setLinkedinFrameHeight();
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('orientationchange', onViewportChange, { passive: true });
  }

})();