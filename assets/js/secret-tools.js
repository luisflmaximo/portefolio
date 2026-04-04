(function () {
  'use strict';

  const DATA_URL = './tools-data.json';
  const LOCALE_STORAGE_KEY = 'secretPageLocale';
  const FALLBACK_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23f3ede2'/%3E%3Cpath d='M16 7a9 9 0 1 0 0 18a9 9 0 0 0 0-18Zm0 2a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm-1-1h2v2h-2zm0 14h2v2h-2zM8 15h2v2H8zm14 0h2v2h-2z' fill='%237b8c80'/%3E%3C/svg%3E";
  const SOURCE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:8px;height:8px"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>';
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const LOCALE_COPY = {
    pt: {
      title: 'Ferramentas — Luís Máximo',
      metaDescription: 'Área privada com ferramentas e referências úteis de Luís Máximo.',
      burgerLabel: 'Abrir menu',
      nav: {
        logoHref: '../pt/',
        home: { label: 'Início', href: '../pt/' },
        projects: { label: 'Projetos', href: '../pt/projetos/' },
        curriculum: { label: 'Currículo', href: '../pt/curriculo/' },
        tools: { label: 'Ferramentas', href: './' },
      },
      pageLabel: 'Área Privada',
      pageTitle: 'Ferramentas',
      aiButtonText: 'Perguntar à IA',
      pageDesc(totalCount) {
        if (typeof totalCount !== 'number') {
          return 'Recursos organizados por categoria. Usa a pesquisa ou os filtros para encontrar o que precisas.';
        }
        return totalCount + ' recursos organizados por categoria. Usa a pesquisa ou os filtros para encontrar o que precisas.';
      },
      footerCopy: '© 2026 Luís Máximo · Loures, Lisboa',
    },
    en: {
      title: 'Tools — Luís Máximo',
      metaDescription: 'Private area with useful tools and references curated by Luís Máximo.',
      burgerLabel: 'Open menu',
      nav: {
        logoHref: '../en/',
        home: { label: 'Home', href: '../en/' },
        projects: { label: 'Projects', href: '../en/projects/' },
        curriculum: { label: 'Curriculum', href: '../en/curriculum/' },
        tools: { label: 'Tools', href: './' },
      },
      pageLabel: 'Private Area',
      pageTitle: 'Tools',
      aiButtonText: 'Ask AI',
      pageDesc(totalCount) {
        if (typeof totalCount !== 'number') {
          return 'Resources organized by category. Use search or filters to find what you need.';
        }
        return totalCount + ' resources organized by category. Use search or filters to find what you need.';
      },
      footerCopy: '© 2026 Luís Máximo · Loures, Lisbon',
    },
  };

  const refs = {
    catFilters: document.getElementById('scCatFilters'),
    subFilters: document.getElementById('scSubFilters'),
    search: document.getElementById('scSearch'),
    count: document.getElementById('scCount'),
    content: document.getElementById('scContent'),
    resultsMeta: document.getElementById('scResultsMeta'),
    infiniteSentinel: document.getElementById('scInfiniteSentinel'),
    noResults: document.getElementById('scNoResults'),
    pageDesc: document.querySelector('.page-header__desc'),
    pageLabel: document.getElementById('scPageLabel'),
    pageTitle: document.getElementById('scPageTitle'),
    navLogo: document.getElementById('scNavLogo'),
    navHome: document.getElementById('scNavHome'),
    navProjects: document.getElementById('scNavProjects'),
    navCurriculum: document.getElementById('scNavCurriculum'),
    navTools: document.getElementById('scNavTools'),
    footerCopy: document.getElementById('scFooterCopy'),
    aiFabText: document.querySelector('.secret-ai__fab-text'),
    langPt: document.getElementById('scLangPt'),
    langEn: document.getElementById('scLangEn'),
    burger: document.getElementById('navBurger'),
    metaDescription: document.querySelector('meta[name="description"]'),
  };

  const state = {
    categories: [],
    categoryMap: Object.create(null),
    allCards: [],
    cardLinks: [],
    aiCatalog: [],
    aiCatalogMap: Object.create(null),
    aiListeners: [],
    aiReady: false,
    filterCat: 'all',
    filterSec: 'all',
    searchVal: '',
    filteredCards: [],
    filteredCategoryCounts: Object.create(null),
    renderLimit: 0,
    scopedCount: 0,
    totalCount: null,
    locale: getStoredLocale(),
  };

  let revealSyncTimer = null;
  let filterTimer = null;
  let autoLoadFrame = 0;

  function getStoredLocale() {
    try {
      return localStorage.getItem(LOCALE_STORAGE_KEY) === 'en' ? 'en' : 'pt';
    } catch (_) {
      return 'pt';
    }
  }

  function storeLocale(locale) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (_) {
      // Ignore storage failures and keep the locale in memory only.
    }
  }

  function getLocaleCopy() {
    return LOCALE_COPY[state.locale] || LOCALE_COPY.pt;
  }

  function updateLocalizedChrome() {
    const copy = getLocaleCopy();

    document.title = copy.title;

    if (refs.metaDescription) refs.metaDescription.setAttribute('content', copy.metaDescription);
    if (refs.burger) refs.burger.setAttribute('aria-label', copy.burgerLabel);

    if (refs.navLogo) refs.navLogo.href = copy.nav.logoHref;
    if (refs.navHome) {
      refs.navHome.textContent = copy.nav.home.label;
      refs.navHome.href = copy.nav.home.href;
    }
    if (refs.navProjects) {
      refs.navProjects.textContent = copy.nav.projects.label;
      refs.navProjects.href = copy.nav.projects.href;
    }
    if (refs.navCurriculum) {
      refs.navCurriculum.textContent = copy.nav.curriculum.label;
      refs.navCurriculum.href = copy.nav.curriculum.href;
    }
    if (refs.navTools) {
      refs.navTools.textContent = copy.nav.tools.label;
      refs.navTools.href = copy.nav.tools.href;
    }

    if (refs.pageLabel) refs.pageLabel.textContent = copy.pageLabel;
    if (refs.pageTitle) refs.pageTitle.textContent = copy.pageTitle;
    if (refs.pageDesc) refs.pageDesc.textContent = copy.pageDesc(state.totalCount);
    if (refs.footerCopy) refs.footerCopy.textContent = copy.footerCopy;
    if (refs.aiFabText) refs.aiFabText.textContent = copy.aiButtonText;

    if (refs.langPt) {
      refs.langPt.classList.toggle('nav__lang-btn--active', state.locale === 'pt');
      refs.langPt.setAttribute('aria-pressed', state.locale === 'pt' ? 'true' : 'false');
    }

    if (refs.langEn) {
      refs.langEn.classList.toggle('nav__lang-btn--active', state.locale === 'en');
      refs.langEn.setAttribute('aria-pressed', state.locale === 'en' ? 'true' : 'false');
    }
  }

  function setLocale(locale) {
    if (locale !== 'pt' && locale !== 'en') return;
    if (state.locale === locale) return;

    state.locale = locale;
    storeLocale(locale);
    updateLocalizedChrome();

    if (state.aiReady) {
      renderFilteredResults();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || typeof value === 'undefined') return [];
    return [value];
  }

  function toText(value) {
    if (typeof value === 'string') return value;
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
  }

  function toId(value, fallback) {
    const text = toText(value).trim();
    return text || fallback;
  }

  function trimUnbalancedTrailingParens(value) {
    let text = toText(value).trim();
    if (!text) return text;

    const openCount = (text.match(/\(/g) || []).length;
    let closeCount = (text.match(/\)/g) || []).length;

    while (closeCount > openCount && text.endsWith(')')) {
      text = text.slice(0, -1);
      closeCount -= 1;
    }

    return text;
  }

  function parseMarkdownLikeLink(value) {
    const text = toText(value).trim();
    if (!text || text.charAt(0) !== '[') return null;

    const splitIndex = text.indexOf('](');
    if (splitIndex <= 1) return null;

    const label = text.slice(1, splitIndex).trim();
    const href = trimUnbalancedTrailingParens(text.slice(splitIndex + 2));

    if (!label || !href) return null;

    return {
      label,
      href,
    };
  }

  function normalizeHref(value) {
    const text = toText(value).trim();
    if (!text) return '';

    const markdownLink = parseMarkdownLikeLink(text);
    return trimUnbalancedTrailingParens(markdownLink ? markdownLink.href : text);
  }

  function extractHostname(value) {
    const href = toText(value).trim();
    if (!href) return '';

    try {
      return new URL(href).hostname.replace(/^www\./i, '');
    } catch (_) {
      return '';
    }
  }

  function normalizeDomain(value, href) {
    const text = toText(value).trim();
    if (!text) {
      return extractHostname(href);
    }

    const markdownLink = parseMarkdownLikeLink(text);
    if (markdownLink && markdownLink.label) {
      return markdownLink.label;
    }

    return text;
  }

  function normalizeFavicon(value, href, domain) {
    const text = toText(value).trim();
    if (!text) return text;

    let parsedUrl;
    try {
      parsedUrl = new URL(text);
    } catch (_) {
      return text;
    }

    if (parsedUrl.hostname !== 'www.google.com' || parsedUrl.pathname !== '/s2/favicons') {
      return text;
    }

    const domainParam = trimUnbalancedTrailingParens(parsedUrl.searchParams.get('domain') || '');
    const fallbackDomain = normalizeDomain(domain, href) || extractHostname(href);
    const normalizedDomain = (domainParam || fallbackDomain)
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .trim();

    if (!normalizedDomain) {
      return text;
    }

    parsedUrl.searchParams.set('domain', normalizedDomain);
    return parsedUrl.toString();
  }

  function normalizeBadgeList(badges) {
    return toArray(badges)
      .map((badge) => ({
        className: toText(badge && badge.className).trim(),
        label: toText(badge && badge.label).trim(),
      }))
      .filter((badge) => badge.className || badge.label);
  }

  function normalizeSource(source) {
    if (!source) return null;

    const href = normalizeHref(source.href);
    const label = toText(source.label).trim();

    if (!href || !label) return null;

    return {
      href,
      label,
    };
  }

  function buildSearchText(card, source) {
    const provided = toText(card.search).trim();
    if (provided) return provided.toLowerCase();

    return [
      card.title,
      card.domain,
      card.desc,
      source ? source.label : '',
    ].join(' ').toLowerCase().trim();
  }

  function createAiId(categoryId, sectionId, cardIndex) {
    return categoryId + '__' + sectionId + '__' + cardIndex;
  }

  function normalizeDataset(data) {
    const categories = toArray(data && data.categories).map((category, categoryIndex) => {
      const categoryId = toId(category && category.id, 'category_' + categoryIndex);
      const categoryLabel = toText(category && category.label).trim() || categoryId;
      const categoryEmoji = toText(category && category.emoji).trim();
      const sections = toArray(category && category.sections).map((section, sectionIndex) => {
        const sectionId = toId(section && section.id, categoryId + '_section_' + sectionIndex);
        const sectionLabel = toText(section && section.label).trim() || sectionId;
        const cards = toArray(section && section.cards).map((card, cardIndex) => {
          const source = normalizeSource(card && card.source);
          const badges = normalizeBadgeList(card && card.badges);
          const title = toText(card && card.title).trim();
          const href = normalizeHref(card && card.href);
          const desc = toText(card && card.desc).trim();
          const domain = normalizeDomain(card && card.domain, href);
          const favicon = normalizeFavicon(card && card.favicon, href, domain);

          return {
            aiId: createAiId(categoryId, sectionId, cardIndex),
            categoryId,
            categoryLabel,
            sectionId,
            sectionLabel,
            title,
            href,
            desc,
            search: buildSearchText({
              title,
              domain,
              desc,
              search: card && card.search,
            }, source),
            favicon,
            domain,
            badges,
            source,
          };
        });

        return {
          id: sectionId,
          label: sectionLabel,
          cards,
        };
      });

      return {
        id: categoryId,
        label: categoryLabel,
        emoji: categoryEmoji,
        sections,
      };
    });

    const catalog = [];
    const catalogMap = Object.create(null);

    categories.forEach((category) => {
      category.sections.forEach((section) => {
        section.cards.forEach((card) => {
          const aiCard = {
            id: card.aiId,
            title: card.title,
            href: card.href,
            desc: card.desc,
            domain: card.domain,
            search: card.search,
            favicon: card.favicon,
            badges: card.badges.map((badge) => ({
              className: badge.className,
              label: badge.label,
            })),
            source: card.source ? {
              href: card.source.href,
              label: card.source.label,
            } : null,
            categoryId: card.categoryId,
            categoryLabel: card.categoryLabel,
            sectionId: card.sectionId,
            sectionLabel: card.sectionLabel,
          };

          catalog.push(aiCard);
          catalogMap[aiCard.id] = aiCard;
        });
      });
    });

    const totalCount = typeof data.totalCount === 'number'
      ? data.totalCount
      : catalog.length;

    return {
      categories,
      catalog,
      catalogMap,
      totalCount,
    };
  }

  function getActiveFilters() {
    const category = state.filterCat !== 'all' ? state.categoryMap[state.filterCat] || null : null;
    const section = category && state.filterSec !== 'all'
      ? toArray(category.sections).find((item) => item.id === state.filterSec) || null
      : null;

    return {
      categoryId: category ? category.id : null,
      categoryLabel: category ? category.label : '',
      sectionId: section ? section.id : null,
      sectionLabel: section ? section.label : '',
      searchValue: state.searchVal,
      totalCount: state.totalCount,
      locale: state.locale,
    };
  }

  function notifyAI(reason) {
    const payload = {
      reason,
      ready: state.aiReady,
      filters: getActiveFilters(),
      totalCount: state.totalCount,
    };

    state.aiListeners.slice().forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function subscribeAI(listener) {
    if (typeof listener !== 'function') {
      return function () {};
    }

    state.aiListeners.push(listener);

    if (state.aiReady) {
      listener({
        reason: 'subscribe',
        ready: true,
        filters: getActiveFilters(),
        totalCount: state.totalCount,
      });
    }

    return function () {
      state.aiListeners = state.aiListeners.filter((item) => item !== listener);
    };
  }

  window.SecretToolsAI = {
    getCatalog() {
      return state.aiCatalog.slice();
    },
    getCardById(id) {
      return state.aiCatalogMap[id] || null;
    },
    getActiveFilters,
    isReady() {
      return state.aiReady;
    },
    subscribe: subscribeAI,
  };

  function badgeMarkup(badge) {
    return '<span class="badge ' + escapeHtml(badge.className) + '">' + escapeHtml(badge.label) + '</span>';
  }

  function sourceMarkup(source) {
    if (!source || !source.href || !source.label) return '';
    return '<a href="' + escapeHtml(source.href) + '" target="_blank" rel="noopener" class="card-source">' +
      SOURCE_ICON + escapeHtml(source.label) + '</a>';
  }

  function faviconMarkup(card) {
    const src = card.favicon || FALLBACK_FAVICON;
    return '<img src="' + escapeHtml(src) + '" alt="" class="card-favicon" loading="lazy" onerror="this.onerror=null;this.src=\'' + FALLBACK_FAVICON + '\'">';
  }

  function cardMarkup(card, categoryId) {
    const badges = Array.isArray(card.badges) ? card.badges.map(badgeMarkup).join('') : '';
    const source = sourceMarkup(card.source);
    const cardClass = categoryId === 'jogos' ? 'card card-link card-game' : 'card card-link';

    return '<article class="' + cardClass + '" data-href="' + escapeHtml(card.href) + '" data-sec="' + escapeHtml(card.sectionId) +
      '" data-search="' + escapeHtml(card.search) + '" data-ai-id="' + escapeHtml(card.aiId) + '">' +
      '<div class="card-head">' +
      faviconMarkup(card) +
      '<p class="card-title">' + escapeHtml(card.title) + '</p>' +
      '</div>' +
      '<p class="card-desc">' + escapeHtml(card.desc) + '</p>' +
      '<div class="card-foot">' +
      '<a href="' + escapeHtml(card.href) + '" target="_blank" rel="noopener" class="card-domain card-main-link">' + escapeHtml(card.domain) + '</a>' +
      '<div class="card-meta">' + badges + source + '</div>' +
      '</div>' +
      '</article>';
  }

  function sectionMarkup(section, categoryId) {
    return '<div class="sec-block">' +
      '<p class="sec-title">' + escapeHtml(section.label) + '</p>' +
      '<div class="cards-grid">' + section.cards.map((card) => cardMarkup(card, categoryId)).join('') + '</div>' +
      '</div>';
  }

  function categoryMarkup(category) {
    const count = typeof category.visibleCount === 'number'
      ? category.visibleCount
      : category.sections.reduce((sum, section) => sum + section.cards.length, 0);

    return '<div class="cat-block" data-cat="' + escapeHtml(category.id) + '">' +
      '<div class="projects-section__header"><h2 class="cat-title"><span class="cat-emoji">' + escapeHtml(category.emoji) +
      '</span> ' + escapeHtml(category.label) + '</h2><span class="cat-count">' + count + ' itens</span></div>' +
      category.sections.map((section) => sectionMarkup(section, category.id)).join('') +
      '</div>';
  }

  function updateCount(value) {
    if (state.locale === 'en') {
      refs.count.textContent = value + ' result' + (value !== 1 ? 's' : '');
      return;
    }

    refs.count.textContent = value + ' resultado' + (value !== 1 ? 's' : '');
  }

  function updateSearchPlaceholder(value) {
    if (state.locale === 'en') {
      refs.search.placeholder = 'Search across ' + value + ' resource' + (value !== 1 ? 's' : '') + '...';
      return;
    }

    refs.search.placeholder = 'Pesquisar nos ' + value + ' recurso' + (value !== 1 ? 's' : '') + '...';
  }

  function updateResultsMeta(visibleCount, renderedCount) {
    if (!refs.resultsMeta) return;

    if (!visibleCount || renderedCount >= visibleCount) {
      refs.resultsMeta.hidden = true;
      refs.resultsMeta.textContent = '';
      return;
    }

    refs.resultsMeta.hidden = false;
    refs.resultsMeta.textContent = state.locale === 'en'
      ? 'Showing ' + renderedCount + ' of ' + visibleCount + ' results.'
      : 'A mostrar ' + renderedCount + ' de ' + visibleCount + ' resultados.';
  }

  function updateInfiniteSentinel(visibleCount, renderedCount) {
    if (!refs.infiniteSentinel) return;
    refs.infiniteSentinel.hidden = !(visibleCount > renderedCount);
  }

  function getRenderBatchSize() {
    if (window.innerWidth <= 640) return 72;
    if (window.innerWidth <= 960) return 108;
    return 156;
  }

  function resetRenderLimit() {
    state.renderLimit = getRenderBatchSize();
  }

  function scheduleAutoLoadCheck() {
    if (!refs.infiniteSentinel) return;

    window.cancelAnimationFrame(autoLoadFrame);
    autoLoadFrame = window.requestAnimationFrame(() => {
      autoLoadFrame = 0;

      if (!refs.infiniteSentinel || refs.infiniteSentinel.hidden) return;
      if (!state.filteredCards.length || state.renderLimit >= state.filteredCards.length) return;

      const rect = refs.infiniteSentinel.getBoundingClientRect();
      if (rect.top > window.innerHeight + 180) return;

      if (loadMoreResults()) {
        scheduleAutoLoadCheck();
      }
    });
  }

  function buildRenderedCategories(cards, categoryCounts) {
    const renderedCategories = [];
    const categoryMap = Object.create(null);

    cards.forEach((card) => {
      let category = categoryMap[card.categoryId];

      if (!category) {
        const sourceCategory = state.categoryMap[card.categoryId];
        if (!sourceCategory) return;

        category = {
          id: sourceCategory.id,
          label: sourceCategory.label,
          emoji: sourceCategory.emoji,
          visibleCount: categoryCounts[card.categoryId] || 0,
          sections: [],
          sectionMap: Object.create(null),
        };

        categoryMap[card.categoryId] = category;
        renderedCategories.push(category);
      }

      let section = category.sectionMap[card.sectionId];
      if (!section) {
        section = {
          id: card.sectionId,
          label: card.sectionLabel,
          cards: [],
        };
        category.sectionMap[card.sectionId] = section;
        category.sections.push(section);
      }

      section.cards.push(card);
    });

    renderedCategories.forEach((category) => {
      delete category.sectionMap;
    });

    return renderedCategories;
  }

  function syncSubFilterWidth() {
    if (!refs.subFilters || !refs.subFilters.classList.contains('sub-bar--visible')) {
      if (refs.subFilters) refs.subFilters.style.maxWidth = '';
      return;
    }

    if (window.innerWidth <= 640) {
      refs.subFilters.style.maxWidth = '';
      return;
    }

    const container = refs.subFilters.parentElement;
    if (!container) return;

    const grid = refs.content.querySelector('.cards-grid');
    const gridStyles = grid ? window.getComputedStyle(grid) : null;
    const containerStyles = window.getComputedStyle(container);
    const gridGap = parseFloat((gridStyles && (gridStyles.columnGap || gridStyles.gap)) || '12.8') || 12.8;
    const cardWidth = window.innerWidth <= 960 ? 250 : 280;
    const paddingX = (parseFloat(containerStyles.paddingLeft) || 0) + (parseFloat(containerStyles.paddingRight) || 0);
    const availableWidth = Math.max(0, container.clientWidth - paddingX);
    const columns = Math.max(1, Math.floor((availableWidth + gridGap) / (cardWidth + gridGap)));
    const rowWidth = Math.min(availableWidth, (columns * cardWidth) + ((columns - 1) * gridGap));

    refs.subFilters.style.maxWidth = Math.round(rowWidth) + 'px';
  }

  function closeOpenCards(exceptCard) {
    state.cardLinks.forEach((card) => {
      if (card === exceptCard) return;
      card.classList.remove('card-open');
      if (card.dataset.expandable === 'true') {
        card.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function measureDescHeights(desc) {
    const collapsedHeight = Math.ceil(desc.clientHeight);
    const previousDisplay = desc.style.display;
    const previousClamp = desc.style.webkitLineClamp;
    const previousOrient = desc.style.webkitBoxOrient;
    const previousOverflow = desc.style.overflow;
    const previousMaxHeight = desc.style.maxHeight;

    desc.style.display = 'block';
    desc.style.webkitLineClamp = 'unset';
    desc.style.webkitBoxOrient = 'initial';
    desc.style.overflow = 'visible';
    desc.style.maxHeight = 'none';

    const expandedHeight = Math.ceil(desc.scrollHeight);

    desc.style.display = previousDisplay;
    desc.style.webkitLineClamp = previousClamp;
    desc.style.webkitBoxOrient = previousOrient;
    desc.style.overflow = previousOverflow;
    desc.style.maxHeight = previousMaxHeight;

    return {
      collapsedHeight,
      expandedHeight,
    };
  }

  function buildReveal(card) {
    const desc = card.querySelector('.card-desc');
    if (!desc) return;

    const heights = measureDescHeights(desc);
    if (heights.expandedHeight <= heights.collapsedHeight + 4) return;

    card.classList.add('card-has-reveal');
    card.dataset.expandable = 'true';
    card.setAttribute('aria-expanded', 'false');
    card.style.setProperty('--card-desc-collapsed-height', heights.collapsedHeight + 'px');
    card.style.setProperty('--card-desc-expanded-height', heights.expandedHeight + 'px');
  }

  function syncVisibleCardReveals() {
    state.cardLinks.forEach((card) => {
      if (card.classList.contains('hidden')) return;

      card.classList.remove('card-has-reveal', 'card-open');
      card.removeAttribute('data-expandable');
      card.removeAttribute('aria-expanded');
      card.style.removeProperty('--card-desc-collapsed-height');
      card.style.removeProperty('--card-desc-expanded-height');

      buildReveal(card);
    });
  }

  function scheduleRevealSync() {
    window.clearTimeout(revealSyncTimer);
    revealSyncTimer = window.setTimeout(syncVisibleCardReveals, 80);
  }

  function setupCardInteractions() {
    state.cardLinks.forEach((card) => {
      card.tabIndex = 0;
      card.setAttribute('role', 'link');

      card.addEventListener('click', (event) => {
        if (event.target.closest('.card-source, .card-main-link')) return;

        if (card.dataset.expandable !== 'true') {
          if (!card.dataset.href) return;
          window.open(card.dataset.href, '_blank', 'noopener');
          return;
        }

        if (finePointerQuery.matches) {
          if (!card.dataset.href) return;
          window.open(card.dataset.href, '_blank', 'noopener');
          return;
        }

        event.preventDefault();
        const shouldOpen = !card.classList.contains('card-open');
        closeOpenCards(shouldOpen ? card : null);
        card.classList.toggle('card-open', shouldOpen);
        card.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      });

      card.addEventListener('keydown', (event) => {
        if (event.target.closest('.card-source, .card-main-link')) return;

        if (event.key === 'Escape') {
          card.classList.remove('card-open');
          if (card.dataset.expandable === 'true') card.setAttribute('aria-expanded', 'false');
          return;
        }

        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();

        if (event.key === 'Enter') {
          if (!card.dataset.href) return;
          window.open(card.dataset.href, '_blank', 'noopener');
          return;
        }

        if (card.dataset.expandable !== 'true') return;
        const shouldOpen = !card.classList.contains('card-open');
        closeOpenCards(shouldOpen ? card : null);
        card.classList.toggle('card-open', shouldOpen);
        card.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      });
    });
  }

  function buildCategoryButtons() {
    const buttons = ['<button class="filter-btn active" data-cat="all">Todos</button>'];
    state.categories.forEach((category) => {
      buttons.push('<button class="filter-btn" data-cat="' + escapeHtml(category.id) + '">' +
        escapeHtml(category.emoji) + ' ' + escapeHtml(category.label) + '</button>');
    });
    refs.catFilters.innerHTML = buttons.join('');
  }

  function buildSubcatBtns(catId) {
    refs.subFilters.innerHTML = '';
    state.filterSec = 'all';

    if (catId === 'all' || !state.categoryMap[catId]) {
      refs.subFilters.classList.remove('sub-bar--visible');
      refs.subFilters.style.maxWidth = '';
      return;
    }

    const fragments = ['<button class="filter-btn active" data-sec="all">Todas</button>'];
    state.categoryMap[catId].sections.forEach((section) => {
      fragments.push('<button class="filter-btn" data-sec="' + escapeHtml(section.id) + '">' +
        escapeHtml(section.label) + '</button>');
    });

    refs.subFilters.innerHTML = fragments.join('');
    refs.subFilters.classList.add('sub-bar--visible');
    syncSubFilterWidth();
  }

  function renderContent(categories) {
    refs.content.innerHTML = categories.map(categoryMarkup).join('');
    state.allCards = Array.from(refs.content.querySelectorAll('.card'));
    state.cardLinks = Array.from(refs.content.querySelectorAll('.card-link'));
    setupCardInteractions();
    scheduleRevealSync();
    syncSubFilterWidth();
  }

  function getFilteredCards() {
    const filteredCards = [];
    const categoryCounts = Object.create(null);
    let visibleCount = 0;
    let scopedCount = 0;

    state.categories.forEach((category) => {
      const catMatch = state.filterCat === 'all' || category.id === state.filterCat;
      if (!catMatch) return;

      category.sections.forEach((section) => {
        const secMatch = state.filterSec === 'all' || section.id === state.filterSec;
        if (!secMatch) return;

        section.cards.forEach((card) => {
          scopedCount += 1;

          if (state.searchVal && (!card.search || !card.search.includes(state.searchVal))) {
            return;
          }

          filteredCards.push(card);
          visibleCount += 1;
          categoryCounts[card.categoryId] = (categoryCounts[card.categoryId] || 0) + 1;
        });
      });
    });

    return {
      filteredCards,
      categoryCounts,
      visibleCount,
      scopedCount,
    };
  }

  function renderFilteredResults() {
    const renderedCount = Math.min(state.renderLimit, state.filteredCards.length);
    const visibleCards = state.filteredCards.slice(0, renderedCount);
    const renderedCategories = buildRenderedCategories(visibleCards, state.filteredCategoryCounts);

    closeOpenCards();
    renderContent(renderedCategories);
    updateCount(state.filteredCards.length);
    updateSearchPlaceholder(state.scopedCount);
    updateResultsMeta(state.filteredCards.length, renderedCount);
    updateInfiniteSentinel(state.filteredCards.length, renderedCount);
    refs.noResults.classList.toggle('visible', state.filteredCards.length === 0);
    notifyAI('filters');
    scheduleAutoLoadCheck();
  }

  function applyFilters(resetLimit) {
    const result = getFilteredCards();

    state.filteredCards = result.filteredCards;
    state.filteredCategoryCounts = result.categoryCounts;
    state.scopedCount = result.scopedCount;

    if (resetLimit) {
      resetRenderLimit();
    }

    renderFilteredResults();
  }

  function loadMoreResults() {
    if (!state.filteredCards.length || state.renderLimit >= state.filteredCards.length) return false;

    state.renderLimit = Math.min(
      state.filteredCards.length,
      state.renderLimit + getRenderBatchSize()
    );

    renderFilteredResults();
    return true;
  }

  function bindEvents() {
    refs.search.addEventListener('input', function () {
      const nextValue = this.value.toLowerCase().trim();
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(() => {
        state.searchVal = nextValue;
        applyFilters(true);
      }, 70);
    });

    if (refs.langPt) {
      refs.langPt.addEventListener('click', () => {
        setLocale('pt');
      });
    }

    if (refs.langEn) {
      refs.langEn.addEventListener('click', () => {
        setLocale('en');
      });
    }

    refs.catFilters.addEventListener('click', (event) => {
      const btn = event.target.closest('.filter-btn');
      if (!btn) return;

      refs.catFilters.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      state.filterCat = btn.dataset.cat;
      buildSubcatBtns(state.filterCat);
      applyFilters(true);
    });

    refs.subFilters.addEventListener('click', (event) => {
      const btn = event.target.closest('.filter-btn');
      if (!btn) return;

      refs.subFilters.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
      btn.classList.add('active');
      state.filterSec = btn.dataset.sec;
      applyFilters(true);
    });

    document.addEventListener('click', (event) => {
      if (event.target.closest('.card-link, .card-source, .card-main-link')) return;
      closeOpenCards();
    });

    window.addEventListener('resize', () => {
      closeOpenCards();
      scheduleRevealSync();
      syncSubFilterWidth();
      scheduleAutoLoadCheck();
    }, { passive: true });

    window.addEventListener('scroll', () => {
      if (!finePointerQuery.matches) closeOpenCards();
      scheduleAutoLoadCheck();
    }, { passive: true });
  }

  function applyDataset(data) {
    const normalized = normalizeDataset(data);

    state.categories = normalized.categories;
    state.categoryMap = state.categories.reduce((acc, category) => {
      acc[category.id] = category;
      return acc;
    }, Object.create(null));
    state.aiCatalog = normalized.catalog;
    state.aiCatalogMap = normalized.catalogMap;
    state.totalCount = normalized.totalCount;
    state.aiReady = true;
    updateLocalizedChrome();

    buildCategoryButtons();
    buildSubcatBtns('all');
    applyFilters(true);
    notifyAI('ready');
  }

  function showLoadError() {
    refs.noResults.textContent = 'Não foi possível carregar os recursos.';
    refs.noResults.classList.add('visible');
    refs.count.textContent = '0 resultados';
    state.aiReady = false;
    notifyAI('load-error');
  }

  fetch(DATA_URL, { cache: 'no-store' })
    .then((response) => {
      if (!response.ok) {
        throw new Error('Failed to load tools data');
      }
      return response.json();
    })
    .then(applyDataset)
    .catch((error) => {
      console.error(error);
      showLoadError();
    });

  updateLocalizedChrome();
  bindEvents();
})();