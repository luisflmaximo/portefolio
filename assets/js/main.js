/* ================================================================
   LUIS MAXIMO - PORTFOLIO - main.js
   ================================================================ */

(function () {
  'use strict';

  /* ── Nav scroll class ── */
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('nav--scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Burger menu ── */
  const burger   = document.getElementById('navBurger');
  const navLinks = document.getElementById('navLinks');
  if (nav && burger && navLinks) {
    burger.addEventListener('click', () => {
      const open = navLinks.classList.toggle('nav__links--open');
      burger.classList.toggle('nav__burger--open', open);
      burger.setAttribute('aria-expanded', open);
    });
    navLinks.querySelectorAll('.nav__link').forEach((link) => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', (e) => {
      if (!nav.contains(e.target)) {
        navLinks.classList.remove('nav__links--open');
        burger.classList.remove('nav__burger--open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Language preference: save on switcher click ── */
  document.querySelectorAll('.nav__lang a.nav__lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const href = btn.getAttribute('href') || '';
      const lang = (href.includes('/en/') || href.endsWith('/en')) ? 'en' : 'pt';
      try { localStorage.setItem('lang-pref', lang); } catch (_) {}
    });
  });

  /* ── Secret: profile photo tap ── */
  const profilePhoto = document.getElementById('profilePhoto');
  if (profilePhoto) {
    let count = 0, timer = null;
    const handleTap = () => {
      count += 1;
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

  function showSecretTab() {
    document.querySelectorAll('.nav__secret-link').forEach((el) => { el.removeAttribute('hidden'); });
  }

  const hasInternalReferrer = (() => {
    if (!document.referrer) return false;
    try { return new URL(document.referrer).origin === window.location.origin; } catch (_) { return false; }
  })();
  if (!hasInternalReferrer) sessionStorage.removeItem('secretUnlocked');
  if (sessionStorage.getItem('secretUnlocked') === '1') showSecretTab();

  /* ── Reveal on scroll ── */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length && 'IntersectionObserver' in window) {
    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('revealed'); revealObs.unobserve(e.target); } }),
      { threshold: 0.08, rootMargin: '0px 0px -32px 0px' }
    );
    reveals.forEach((el) => revealObs.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('revealed'));
  }

  /* ── Skill bars ── */
  const skillBars = document.querySelectorAll('.cv-skill-bar__fill');
  if (skillBars.length && 'IntersectionObserver' in window) {
    const barObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          setTimeout(() => { e.target.style.width = e.target.dataset.width || '0%'; }, 100);
          barObs.unobserve(e.target);
        }
      }),
      { threshold: 0.5 }
    );
    skillBars.forEach((bar) => { bar.style.width = '0%'; barObs.observe(bar); });
  }

  /* ══════════════════════════════════════════════════════════════
     INSTAGRAM — lazy-load embed.js via IntersectionObserver.
     The script is only injected when the grid scrolls into view,
     saving ~100 KB of third-party script on every page load.
  ══════════════════════════════════════════════════════════════ */
  const instagramGrid = document.querySelector('.instagram-embed-grid');
  if (instagramGrid) {
    const injectInstagram = () => {
      if (document.querySelector('script[src*="instagram.com/embed.js"]')) return;
      const s = document.createElement('script');
      s.src   = 'https://www.instagram.com/embed.js';
      s.async = true;
      document.body.appendChild(s);
    };

    if ('IntersectionObserver' in window) {
      const igObs = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { injectInstagram(); igObs.disconnect(); } }),
        { rootMargin: '300px 0px' }
      );
      igObs.observe(instagramGrid);
    } else {
      injectInstagram();
    }
  }

  /* ══════════════════════════════════════════════════════════════
     LINKEDIN — lazy-load + adblocker detection.

     Strategy:
       1. Observe the LinkedIn section; load only when in viewport.
       2. Probe by loading platform.linkedin.com/badges/js/profile.js
          as a <script> tag with onload / onerror handlers.
       3. onload  → LinkedIn reachable → activate iframes + badge.
       4. onerror → LinkedIn blocked   → activate fallback cards.
          (An 8-second timeout also triggers the fallback, covering
           adblockers that stall rather than reject the request.)
  ══════════════════════════════════════════════════════════════ */
  const linkedinSection      = document.querySelector('[data-linkedin-section]');
  const linkedinProfilePanels = Array.from(document.querySelectorAll('[data-linkedin-profile-panel]'));
  const linkedinFrames        = Array.from(document.querySelectorAll('.linkedin-post-card__frame'));
  const LINKEDIN_BADGE_SCRIPT = 'https://platform.linkedin.com/badges/js/profile.js';

  if (linkedinSection || linkedinFrames.length) {

    /* Resize iframes to match viewport */
    const setLinkedinFrameHeight = () => {
      const vw = window.innerWidth  || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      linkedinFrames.forEach((frame) => {
        const fw = frame.getBoundingClientRect().width || 320;
        let h = (vw <= 480) ? Math.max(680, Math.min(880, Math.round(vh * 0.84)))
              : (vw <= 768) ? Math.max(640, Math.min(820, Math.round(vh * 0.8)))
              : 614;
        if (fw < 340) h += 28;
        frame.style.height = frame.style.minHeight = h + 'px';
      });
    };

    if (linkedinFrames.length) {
      let rTimer;
      const onVpChange = () => { clearTimeout(rTimer); rTimer = setTimeout(setLinkedinFrameHeight, 120); };
      setLinkedinFrameHeight();
      window.addEventListener('resize',            onVpChange, { passive: true });
      window.addEventListener('orientationchange', onVpChange, { passive: true });
    }

    /* Remove the inactive badge variant before the script runs */
    const keepOnlyActiveLinkedinProfileEmbed = () => {
      if (!linkedinProfilePanels.length) return;
      const useMobile = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      linkedinProfilePanels.forEach((panel) => {
        const inactive = useMobile
          ? panel.querySelector('.linkedin-profile-embed--desktop')
          : panel.querySelector('.linkedin-profile-embed--mobile');
        if (inactive && inactive.parentNode) inactive.parentNode.removeChild(inactive);
      });
    };

    /* Show fallback when LinkedIn is blocked */
    const activateLinkedinFallback = () => {
      if (linkedinSection) linkedinSection.classList.add('linkedin-section--blocked');
      document.querySelectorAll('.linkedin-embed-fallback, .linkedin-badge-fallback').forEach((el) => {
        el.removeAttribute('aria-hidden');
      });
    };

    /* Set iframe src from data-src and mark card as loaded */
    const activateLinkedinFrames = () => {
      linkedinFrames.forEach((frame) => {
        if (frame.dataset.src && !frame.getAttribute('src')) {
          frame.setAttribute('src', frame.dataset.src);
        }
        const card = frame.closest('.linkedin-post-card');
        if (card) card.classList.add('linkedin-post-card--loaded');
      });
    };

    /* Probe: try to load badge script — resolves { blocked: boolean } */
    let badgeScriptPromise = null;
    const probeLinkedIn = () => {
      if (badgeScriptPromise) return badgeScriptPromise;

      badgeScriptPromise = new Promise((resolve) => {
        /* No profile panels → skip probe, load frames directly */
        if (!linkedinProfilePanels.length) { resolve({ blocked: false }); return; }

        let settled = false;
        const settle = (blocked) => { if (settled) return; settled = true; resolve({ blocked }); };
        const timeout = setTimeout(() => settle(true), 8000);

        const script  = document.createElement('script');
        script.src    = LINKEDIN_BADGE_SCRIPT;
        script.async  = true;
        script.defer  = true;
        script.addEventListener('load',  () => { clearTimeout(timeout); settle(false); }, { once: true });
        script.addEventListener('error', () => { clearTimeout(timeout); settle(true);  }, { once: true });
        document.body.appendChild(script);
      });

      return badgeScriptPromise;
    };

    /* Main entry point */
    let linkedinEmbedsLoaded = false;
    const loadLinkedinEmbeds = () => {
      if (linkedinEmbedsLoaded) return;
      linkedinEmbedsLoaded = true;

      setLinkedinFrameHeight();
      if (linkedinProfilePanels.length) keepOnlyActiveLinkedinProfileEmbed();

      probeLinkedIn().then(({ blocked }) => {
        if (blocked) { activateLinkedinFallback(); }
        else         { activateLinkedinFrames();   }
      });
    };

    if (linkedinSection && 'IntersectionObserver' in window) {
      const liObs = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { loadLinkedinEmbeds(); liObs.disconnect(); } }),
        { rootMargin: '240px 0px' }
      );
      liObs.observe(linkedinSection);
    } else if (document.readyState === 'complete') {
      loadLinkedinEmbeds();
    } else {
      window.addEventListener('load', loadLinkedinEmbeds, { once: true });
    }

  } // end LinkedIn block

})();