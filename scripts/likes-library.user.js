// ==UserScript==
// @name         💗 Crack Likes Library (좋아요 보관함)
// @namespace    crack-likes-library
// @downloadURL  https://gist.github.com/chyoyam-alt/7e0f818e9e5d3bf2950d2d1c279b1891/raw/likes-library.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/7e0f818e9e5d3bf2950d2d1c279b1891/raw/likes-library.user.js
// @version      1.0.1
// @description  스토리·캐릭터 좋아요를 통합해 검색·정렬·폴더 관리하고, 스토리 기본 정보 팝업과 좋아요 취소를 지원합니다.
// @author       뤼붕이
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const SCRIPT_VERSION = '1.0.1';
  const SCRIPT_KEY = '__crack_likes_library__';
  if (PAGE[SCRIPT_KEY]) return;
  PAGE[SCRIPT_KEY] = SCRIPT_VERSION;

  const CONFIG = Object.freeze({
    likedPath: '/liked',
    apiSources: [
      { type: 'story', label: '스토리', url: 'https://crack-api.wrtn.ai/crack-api/stories/me/liked', dataKey: 'stories' },
      { type: 'character', label: '캐릭터', url: 'https://crack-api.wrtn.ai/crack-api/characters/me/liked', dataKey: 'characters' }
    ],
    apiLimit: 100,
    fallbackApiLimit: 30,
    maxPages: 500,
    pageDelayMs: 60,
    routeCheckMs: 700,
    renderChunk: 48,
    cacheKey: '__crack_likes_library_cache_v1__',
    folderKey: '__crack_likes_library_folders_v1__',
    membershipKey: '__crack_likes_library_memberships_v1__',
    prefsKey: '__crack_likes_library_prefs_v1__'
  });

  const state = {
    authHeaders: {},
    apiFetch: null,
    stories: [],
    loading: false,
    loadToken: 0,
    loadedCount: 0,
    totalPages: 0,
    loadingLabel: '',
    hasLoadedOnce: false,
    lastSyncAt: null,
    error: '',
    query: '',
    view: 'card',
    sort: 'default',
    sortDirections: { default: 'desc', title: 'asc', creator: 'asc', updated: 'desc' },
    creatorSortDirection: 'asc',
    activeFolder: 'all',
    visibleLimit: CONFIG.renderChunk,
    folders: [],
    memberships: {},
    host: null,
    shadow: null,
    countText: null,
    statusText: null,
    content: null,
    searchInput: null,
    sortSelect: null,
    sortDirectionButton: null,
    creatorSortButton: null,
    folderBar: null,
    folderManager: null,
    folderManagerOpen: false,
    folderManagerSignature: '',
    moreWrap: null,
    folderSheet: null,
    folderSheetStoryId: null,
    openCreatorIds: new Set(),
    routeActive: false,
    renderTimer: 0,
    initialized: false,
    mountParent: null,
    hiddenNativeNodes: new Map(),
    autoLoadAttempted: false,
    autoLoadRaf: 0,
    nativeModalCheckTimer: 0,
    nativeModalRoot: null,
    nativeModalContainer: null,
    nativeModalRootStyleBackup: null,
    nativeModalObserver: null,
    nativeModalOpened: false,
    nativeModalMatched: false,
    longPressTimer: 0,
    longPressStartX: 0,
    longPressStartY: 0,
    longPressKey: '',
    suppressNextClick: false,
    unlikeInFlight: new Set(),
    folderDrag: null
  };

  loadPrefs();
  loadFolders();
  loadCache();
  installNetworkHooks();
  startRouteWatcher();

  function safeJsonParse(text, fallback) {
    try {
      const value = JSON.parse(text);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function loadPrefs() {
    const prefs = safeJsonParse(localStorage.getItem(CONFIG.prefsKey) || '{}', {});
    if (['card', 'list', 'creator'].includes(prefs.view)) state.view = prefs.view;
    if (['default', 'title', 'creator', 'updated'].includes(prefs.sort)) state.sort = prefs.sort;
    const savedDirections = prefs.sortDirections && typeof prefs.sortDirections === 'object' ? prefs.sortDirections : {};
    for (const key of ['default', 'title', 'creator', 'updated']) {
      if (['asc', 'desc'].includes(savedDirections[key])) state.sortDirections[key] = savedDirections[key];
    }
    // v0.4.3까지의 기본순 방향 설정을 새 구조로 자동 이전합니다.
    if (!savedDirections.default && ['asc', 'desc'].includes(prefs.likeSortDirection)) {
      state.sortDirections.default = prefs.likeSortDirection;
    }
    if (['asc', 'desc'].includes(prefs.creatorSortDirection)) state.creatorSortDirection = prefs.creatorSortDirection;
    if (typeof prefs.activeFolder === 'string') state.activeFolder = prefs.activeFolder;
  }

  function savePrefs() {
    try {
      localStorage.setItem(CONFIG.prefsKey, JSON.stringify({
        view: state.view,
        sort: state.sort,
        sortDirections: state.sortDirections,
        likeSortDirection: state.sortDirections.default, // 구버전 설정 호환용
        creatorSortDirection: state.creatorSortDirection,
        activeFolder: state.activeFolder
      }));
    } catch (_) {}
  }

  function loadFolders() {
    const folders = safeJsonParse(localStorage.getItem(CONFIG.folderKey) || '[]', []);
    const memberships = safeJsonParse(localStorage.getItem(CONFIG.membershipKey) || '{}', {});
    state.folders = Array.isArray(folders)
      ? folders.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
      : [];
    state.memberships = memberships && typeof memberships === 'object' && !Array.isArray(memberships)
      ? memberships
      : {};
  }

  function saveFolders() {
    try {
      localStorage.setItem(CONFIG.folderKey, JSON.stringify(state.folders));
      localStorage.setItem(CONFIG.membershipKey, JSON.stringify(state.memberships));
    } catch (error) {
      showToast('폴더 저장 공간이 부족해요.');
    }
  }

  function loadCache() {
    const cache = safeJsonParse(localStorage.getItem(CONFIG.cacheKey) || '{}', {});
    if (!cache || !Array.isArray(cache.stories)) return;
    state.stories = cache.stories
      .filter((item) => item && item.id)
      .map((item) => normalizeCachedItem(item));
    state.lastSyncAt = cache.syncedAt || null;
    // 통합 캐시(version 2)가 있으면 즉시 사용하고 자동 재수집하지 않습니다.
    state.hasLoadedOnce = state.stories.length > 0 && Number(cache.version || 1) >= 2;
  }

  function normalizeCachedItem(item) {
    const type = item.type === 'character' ? 'character' : 'story';
    return {
      ...item,
      type,
      key: String(item.key || (type === 'character' ? `character:${item.id}` : item.id)),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      genre: String(item.genre || ''),
      target: String(item.target || ''),
      chatType: String(item.chatType || '')
    };
  }

  function saveCache() {
    try {
      localStorage.setItem(CONFIG.cacheKey, JSON.stringify({
        version: 2,
        syncedAt: state.lastSyncAt,
        stories: state.stories
      }));
    } catch (_) {
      // 이미지 URL과 최소 메타데이터만 저장하지만, 브라우저 용량이 아주 작을 때는 캐시를 포기합니다.
    }
  }

  function normalizeHeaders(headersLike) {
    const output = {};
    if (!headersLike) return output;
    try {
      if (headersLike instanceof Headers || typeof headersLike.forEach === 'function') {
        headersLike.forEach((value, key) => { output[String(key).toLowerCase()] = String(value); });
      } else if (Array.isArray(headersLike)) {
        for (const pair of headersLike) {
          if (Array.isArray(pair) && pair.length >= 2) output[String(pair[0]).toLowerCase()] = String(pair[1]);
        }
      } else if (typeof headersLike === 'object') {
        for (const [key, value] of Object.entries(headersLike)) {
          output[String(key).toLowerCase()] = String(value);
        }
      }
    } catch (_) {}
    return output;
  }

  function rememberAuth(headersLike) {
    const headers = normalizeHeaders(headersLike);
    const allow = [
      'authorization',
      'accept',
      'content-type',
      'platform',
      'x-wrtn-id',
      'wrtn-locale',
      'mixpanel-distinct-id'
    ];
    let changed = false;
    for (const key of allow) {
      if (headers[key] && state.authHeaders[key] !== headers[key]) {
        state.authHeaders[key] = headers[key];
        changed = true;
      }
    }
    if (changed && state.error && /인증|새로고침/.test(state.error)) {
      state.error = '';
      if (state.routeActive && !state.loading) {
        state.autoLoadAttempted = false;
        PAGE.setTimeout(updateRouteVisibility, 0);
      }
      scheduleRender();
    }
  }

  function isCrackApiUrl(rawUrl) {
    try {
      return new URL(String(rawUrl || ''), PAGE.location.href).hostname === 'crack-api.wrtn.ai';
    } catch (_) {
      return false;
    }
  }

  function installNetworkHooks() {
    patchFetch();
    patchXhr();
  }

  function patchFetch() {
    const originalFetch = PAGE.fetch;
    if (typeof originalFetch !== 'function') return;
    state.apiFetch = (...args) => Reflect.apply(originalFetch, PAGE, args);
    if (originalFetch.__crackLikesLibraryWrapped) return;

    function wrappedFetch(input, init) {
      try {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
        if (isCrackApiUrl(url)) {
          const fromRequest = typeof Request !== 'undefined' && input instanceof Request ? input.headers : null;
          rememberAuth(fromRequest);
          rememberAuth(init?.headers);
        }
      } catch (_) {}
      return Reflect.apply(originalFetch, this, arguments);
    }

    try {
      wrappedFetch.toString = () => originalFetch.toString();
      Object.defineProperty(wrappedFetch, 'name', { value: 'fetch' });
    } catch (_) {}
    wrappedFetch.__crackLikesLibraryWrapped = true;
    PAGE.fetch = wrappedFetch;
  }

  function patchXhr() {
    const XHR = PAGE.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    const proto = XHR.prototype;
    if (proto.__crackLikesLibraryWrapped) return;

    const originalOpen = proto.open;
    const originalSetRequestHeader = proto.setRequestHeader;
    const originalSend = proto.send;

    proto.open = function (method, url) {
      this.__cllMeta = { url: String(url || ''), headers: {} };
      return Reflect.apply(originalOpen, this, arguments);
    };

    proto.setRequestHeader = function (name, value) {
      try {
        if (this.__cllMeta) this.__cllMeta.headers[String(name).toLowerCase()] = String(value);
      } catch (_) {}
      return Reflect.apply(originalSetRequestHeader, this, arguments);
    };

    proto.send = function () {
      try {
        if (this.__cllMeta && isCrackApiUrl(this.__cllMeta.url)) rememberAuth(this.__cllMeta.headers);
      } catch (_) {}
      return Reflect.apply(originalSend, this, arguments);
    };

    proto.__crackLikesLibraryWrapped = true;
  }

  function startRouteWatcher() {
    const tick = () => {
      const active = PAGE.location.pathname === CONFIG.likedPath || PAGE.location.pathname.startsWith(`${CONFIG.likedPath}/`);
      if (active !== state.routeActive) {
        state.routeActive = active;
        state.autoLoadAttempted = false;
      }

      if (active) {
        ensureUi();
        if (state.initialized) updateRouteVisibility();
      } else if (state.initialized && (state.host?.isConnected || state.hiddenNativeNodes.size)) {
        updateRouteVisibility();
      }
    };
    tick();
    setInterval(tick, CONFIG.routeCheckMs);
  }

  function ensureUi() {
    if (state.initialized || !document.documentElement) return;
    const mount = () => {
      if (state.initialized || !document.body) return;
      state.initialized = true;
      createUi();
      updateRouteVisibility();
      scheduleRender(true);
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount, { once: true });
  }

  function createUi() {
    const host = document.createElement('div');
    host.id = 'crack-likes-library-host';
    host.style.display = 'none';
    const shadow = host.attachShadow({ mode: 'open' });
    state.host = host;
    state.shadow = shadow;

    shadow.innerHTML = `
      <style>${getCss()}</style>
      <div class="page-root">
        <section class="panel" aria-label="크랙 좋아요 보관함">
          <header class="header">
            <div class="heading">
              <div class="title-row"><h2>좋아요 보관함</h2><span class="version">v${SCRIPT_VERSION}</span></div>
              <div class="count-text">불러오는 중…</div>
            </div>
            <div class="header-actions">
              <button class="icon-btn refresh-btn" type="button" title="전체 좋아요 새로고침" aria-label="전체 좋아요 새로고침">↻</button>
            </div>
          </header>

          <div class="toolbar">
            <label class="search-wrap">
              <span>⌕</span>
              <input class="search" type="search" placeholder="제목·제작자·장르·해시태그 검색" autocomplete="off">
            </label>
            <div class="sort-controls">
              <select class="sort" aria-label="정렬">
                <option value="default">기본순</option>
                <option value="title">제목순</option>
                <option value="creator">제작자순</option>
                <option value="updated">최근 수정순</option>
              </select>
              <button class="sort-direction-toggle" type="button" aria-label="현재 정렬 방향 전환" title="API 기본 순서">↓</button>
              <button class="creator-sort-toggle control-hidden" type="button" aria-label="제작자 이름 정렬 방향 전환" title="제작자 이름순: ㄱ에서 ㅎ">이름순 ↑</button>
            </div>
            <div class="view-tabs" role="tablist" aria-label="보기 방식">
              <button type="button" data-view="card">▦<span>카드</span></button>
              <button type="button" data-view="list">☷<span>리스트</span></button>
              <button type="button" data-view="creator">♟<span>제작자</span></button>
            </div>
          </div>

          <div class="folder-row">
            <div class="folder-bar"></div>
            <button class="folder-manage" type="button" aria-expanded="false">폴더 관리</button>
          </div>
          <section class="folder-manager-panel" hidden aria-label="폴더 관리"></section>

          <div class="status" aria-live="polite"></div>
          <main class="content"></main>
          <div class="more-wrap" aria-hidden="true"><div class="auto-sentinel"></div></div>
        </section>
      </div>
      <div class="sheet-backdrop" aria-hidden="true">
        <section class="folder-sheet" role="dialog" aria-modal="true" aria-label="빠른 폴더 분류"></section>
      </div>
      <div class="toast" aria-live="polite"></div>
    `;

    state.countText = shadow.querySelector('.count-text');
    state.statusText = shadow.querySelector('.status');
    state.content = shadow.querySelector('.content');
    state.searchInput = shadow.querySelector('.search');
    state.sortSelect = shadow.querySelector('.sort');
    state.sortDirectionButton = shadow.querySelector('.sort-direction-toggle');
    state.creatorSortButton = shadow.querySelector('.creator-sort-toggle');
    state.folderBar = shadow.querySelector('.folder-bar');
    state.folderManager = shadow.querySelector('.folder-manager-panel');
    state.moreWrap = shadow.querySelector('.more-wrap');
    state.folderSheet = shadow.querySelector('.folder-sheet');

    state.searchInput.value = state.query;
    state.sortSelect.value = state.sort;

    shadow.querySelector('.refresh-btn').addEventListener('click', () => loadAllLikes());
    shadow.querySelector('.sheet-backdrop').addEventListener('click', (event) => {
      if (event.target.classList.contains('sheet-backdrop')) closeFolderSheet();
    });
    state.searchInput.addEventListener('input', () => {
      state.query = state.searchInput.value.trim();
      state.visibleLimit = CONFIG.renderChunk;
      scheduleRender();
    });
    state.sortSelect.addEventListener('change', () => {
      state.sort = state.sortSelect.value;
      state.visibleLimit = CONFIG.renderChunk;
      savePrefs();
      scheduleRender(true);
    });
    state.sortDirectionButton.addEventListener('click', () => {
      const current = state.sortDirections[state.sort] || defaultSortDirection(state.sort);
      state.sortDirections[state.sort] = current === 'asc' ? 'desc' : 'asc';
      state.visibleLimit = CONFIG.renderChunk;
      savePrefs();
      scheduleRender(true);
    });
    state.creatorSortButton.addEventListener('click', () => {
      state.creatorSortDirection = state.creatorSortDirection === 'asc' ? 'desc' : 'asc';
      savePrefs();
      scheduleRender(true);
    });
    shadow.querySelector('.view-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (!button) return;
      state.view = button.dataset.view;
      state.visibleLimit = CONFIG.renderChunk;
      savePrefs();
      scheduleRender(true);
    });
    state.folderBar.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-folder]');
      if (!chip) return;
      state.activeFolder = chip.dataset.folder;
      state.visibleLimit = CONFIG.renderChunk;
      savePrefs();
      scheduleRender(true);
    });
    shadow.querySelector('.folder-manage').addEventListener('click', toggleFolderManager);
    state.folderManager.addEventListener('click', handleFolderManagerClick);
    state.folderManager.addEventListener('submit', handleFolderManagerSubmit);
    state.folderManager.addEventListener('change', handleFolderManagerChange);
    state.folderManager.addEventListener('keydown', handleFolderManagerKeydown);
    state.folderManager.addEventListener('pointerdown', handleFolderDragStart);
    PAGE.addEventListener('pointermove', handleFolderDragMove, { passive: false });
    PAGE.addEventListener('pointerup', handleFolderDragEnd, { passive: false });
    PAGE.addEventListener('pointercancel', handleFolderDragCancel, { passive: false });
    state.content.addEventListener('click', handleContentClick);
    state.content.addEventListener('pointerdown', handleContentPointerDown, { passive: true });
    state.content.addEventListener('pointermove', handleContentPointerMove, { passive: true });
    state.content.addEventListener('pointerup', clearContentLongPress, { passive: true });
    state.content.addEventListener('pointercancel', clearContentLongPress, { passive: true });
    state.content.addEventListener('contextmenu', handleContentContextMenu);
    state.content.addEventListener('toggle', handleCreatorToggle, true);
    state.folderSheet.addEventListener('click', handleFolderSheetClick);
    state.folderSheet.addEventListener('submit', handleFolderSheetSubmit);
    PAGE.addEventListener('resize', syncInlineMetrics, { passive: true });
    state.host.addEventListener('scroll', handleLibraryScroll, { passive: true });
    shadow.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (shadow.querySelector('.sheet-backdrop').classList.contains('show')) closeFolderSheet();
    });
  }

  function updateRouteVisibility() {
    if (!state.host) return;

    if (!state.routeActive) {
      clearTimeout(state.nativeModalCheckTimer);
      state.nativeModalCheckTimer = 0;
      finishFolderDrag(false);
      closeFolderSheet();
      restoreNativePage();
      state.host.style.display = 'none';
      if (state.host.isConnected) state.host.remove();
      return;
    }

    const wasVisible = state.host.style.display !== 'block';
    const mountChanged = mountIntoLikedPage();
    state.host.style.display = 'block';
    syncTheme();
    syncInlineMetrics();

    // 라우트 감시는 마운트 상태만 복구합니다. 매 주기 전체 렌더는 하지 않습니다.
    if (wasVisible || mountChanged) scheduleRender(true);

    // 통합 캐시가 없을 때만 최초 1회 자동 수집합니다.
    // 캐시가 있으면 즉시 표시하고, 이후 갱신은 상단 ↻ 버튼으로만 수행합니다.
    if (!state.hasLoadedOnce && !state.loading && !state.autoLoadAttempted) {
      state.autoLoadAttempted = true;
      loadAllLikes();
    }

  }

  function findInlineMountParent() {
    const candidates = [];
    for (const selector of ['main', '[role="main"]']) {
      for (const node of document.querySelectorAll(selector)) {
        if (!candidates.includes(node)) candidates.push(node);
      }
    }

    const usable = candidates.filter((node) => {
      if (!node || node === state.host || state.host?.contains(node)) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 240 || node.scrollWidth > 240;
    });
    if (!usable.length) return null;

    const withLikedContent = usable.find((node) =>
      node.querySelector('a[href*="/stories/"], a[href*="/story/"]') ||
      /좋아요/.test(node.textContent || '')
    );
    if (withLikedContent) return withLikedContent;

    return usable.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * Math.max(br.height, 1)) - (ar.width * Math.max(ar.height, 1));
    })[0];
  }

  function mountIntoLikedPage() {
    const inlineParent = findInlineMountParent();
    const parent = inlineParent || document.body;
    if (!parent) return false;

    const nextMount = inlineParent ? 'inline' : 'fallback';
    const changed = state.mountParent !== parent || !state.host.isConnected || state.host.dataset.mount !== nextMount;

    if (state.mountParent !== parent || !state.host.isConnected) {
      restoreNativePage();
      state.mountParent = parent;
      parent.appendChild(state.host);
    }

    state.host.dataset.mount = nextMount;
    if (inlineParent) hideNativeChildren(parent);
    return changed;
  }

  function rememberNativeNode(node) {
    if (!node || state.hiddenNativeNodes.has(node)) return;
    state.hiddenNativeNodes.set(node, {
      display: node.style.getPropertyValue('display'),
      displayPriority: node.style.getPropertyPriority('display'),
      visibility: node.style.getPropertyValue('visibility'),
      visibilityPriority: node.style.getPropertyPriority('visibility'),
      pointerEvents: node.style.getPropertyValue('pointer-events'),
      pointerEventsPriority: node.style.getPropertyPriority('pointer-events'),
      ariaHidden: node.getAttribute('aria-hidden')
    });
  }

  function restoreNativeNode(node) {
    const previous = state.hiddenNativeNodes.get(node);
    if (!node || !previous) return;
    if (previous.display) node.style.setProperty('display', previous.display, previous.displayPriority || '');
    else node.style.removeProperty('display');
    if (previous.visibility) node.style.setProperty('visibility', previous.visibility, previous.visibilityPriority || '');
    else node.style.removeProperty('visibility');
    if (previous.pointerEvents) node.style.setProperty('pointer-events', previous.pointerEvents, previous.pointerEventsPriority || '');
    else node.style.removeProperty('pointer-events');
    if (previous.ariaHidden == null) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', previous.ariaHidden);
  }

  function hideNativeNode(node) {
    if (!node) return;
    rememberNativeNode(node);
    node.style.setProperty('display', 'none', 'important');
    node.style.removeProperty('visibility');
    node.style.removeProperty('pointer-events');
    node.setAttribute('aria-hidden', 'true');
  }

  function hideNativeChildren(parent) {
    for (const child of Array.from(parent.children)) {
      if (child === state.host || child.id === 'crack-likes-library-host') continue;
      if (child === state.nativeModalRoot) continue;
      hideNativeNode(child);
    }
  }

  function restoreNativePage() {
    clearNativeModalBridge(false);
    for (const node of state.hiddenNativeNodes.keys()) {
      try { restoreNativeNode(node); } catch (_) {}
    }
    state.hiddenNativeNodes.clear();
    state.mountParent = null;
  }

  function syncInlineMetrics() {
    if (!state.host || state.host.dataset.mount !== 'inline' || !state.mountParent?.isConnected) return;
    const rect = state.mountParent.getBoundingClientRect();
    const top = Math.max(0, Math.min(PAGE.innerHeight - 240, rect.top));
    state.host.style.setProperty('--cll-top-offset', `${Math.round(top)}px`);
  }

  function syncTheme() {
    if (!state.host) return;
    const nextTheme = detectSiteTheme();
    const themeChanged = state.host.dataset.theme !== nextTheme;
    state.host.dataset.theme = nextTheme;
    if (themeChanged || !state.host.style.getPropertyValue('--cll-site-bg')) syncSitePalette();
  }

  // 크랙 본체의 실제 계산된 배경색을 읽어 Shadow DOM 안으로 전달합니다.
  // 하드코딩된 다크/라이트 색 대신 현재 사이트 테마와 같은 바탕색을 사용합니다.
  function syncSitePalette() {
    if (!state.host) return;

    const candidates = [];
    let node = state.mountParent;
    while (node && node !== document.documentElement) {
      if (node !== state.host && !candidates.includes(node)) candidates.push(node);
      node = node.parentElement;
    }

    for (const candidate of [
      document.querySelector('main[data-sgb-main-host]'),
      document.querySelector('main'),
      document.querySelector('#__next > div'),
      document.body,
      document.documentElement
    ]) {
      if (candidate && candidate !== state.host && !candidates.includes(candidate)) candidates.push(candidate);
    }

    let background = '';
    for (const candidate of candidates) {
      try {
        const color = PAGE.getComputedStyle(candidate).backgroundColor;
        if (backgroundLuminance(color) != null) {
          background = color;
          break;
        }
      } catch (_) {}
    }

    if (!background) {
      background = state.host.dataset.theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 18, 18)';
    }
    state.host.style.setProperty('--cll-site-bg', background);
  }

  function detectSiteTheme() {
    const html = document.documentElement;
    const body = document.body;
    const declared = [
      html?.getAttribute('data-theme'),
      html?.getAttribute('data-color-mode'),
      body?.getAttribute('data-theme'),
      body?.getAttribute('data-color-mode')
    ].filter(Boolean).join(' ').toLowerCase();

    if (/dark|night/.test(declared)) return 'dark';
    if (/light|day/.test(declared)) return 'light';

    const classes = `${html?.className || ''} ${body?.className || ''}`.toLowerCase();
    if (/(^|\s|[-_])dark(\s|$|[-_])/.test(classes)) return 'dark';
    if (/(^|\s|[-_])light(\s|$|[-_])/.test(classes)) return 'light';

    const samples = [state.mountParent, state.mountParent?.firstElementChild, body, html];
    for (const node of samples) {
      if (!node || node === state.host) continue;
      const luminance = backgroundLuminance(PAGE.getComputedStyle(node).backgroundColor);
      if (luminance != null) return luminance < 150 ? 'dark' : 'light';
    }
    return PAGE.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function backgroundLuminance(color) {
    const match = String(color || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/i);
    if (!match) return null;
    if (match[4] != null && Number(match[4]) < 0.08) return null;
    const [r, g, b] = match.slice(1, 4).map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  async function waitForAuth(timeoutMs = 5000) {
    if (state.authHeaders.authorization) return true;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await delay(120);
      if (state.authHeaders.authorization) return true;
    }
    return false;
  }

  function buildApiHeaders() {
    const headers = new Headers();
    headers.set('Accept', state.authHeaders.accept || 'application/json, text/plain, */*');
    for (const key of ['authorization', 'platform', 'x-wrtn-id', 'wrtn-locale', 'mixpanel-distinct-id']) {
      if (state.authHeaders[key]) headers.set(key, state.authHeaders[key]);
    }
    return headers;
  }

  async function loadAllLikes() {
    if (state.loading) return;
    if (!state.apiFetch) {
      state.error = '이 브라우저에서는 API 호출 함수를 찾지 못했어요.';
      scheduleRender(true);
      return;
    }

    state.loading = true;
    state.error = '';
    state.loadedCount = 0;
    state.totalPages = 0;
    state.loadingLabel = '';
    const token = ++state.loadToken;
    scheduleRender(true);

    try {
      const hasAuth = await waitForAuth();
      if (!hasAuth) throw new Error('인증 정보를 아직 못 잡았어요. 좋아요 페이지를 새로고침한 뒤 다시 눌러주세요.');

      const map = new Map();

      for (const source of CONFIG.apiSources) {
        let cursor = '';
        let requestLimit = CONFIG.apiLimit;
        const seenCursors = new Set();
        state.loadingLabel = source.label;
        scheduleRender();

        for (let page = 0; page < CONFIG.maxPages; page += 1) {
          if (token !== state.loadToken) return;
          const url = new URL(source.url);
          url.searchParams.set('limit', String(requestLimit));
          if (cursor) url.searchParams.set('cursor', cursor);

          let response = await state.apiFetch(url.href, {
            method: 'GET',
            headers: buildApiHeaders(),
            credentials: 'include',
            cache: 'no-store'
          });

          // 서버가 큰 limit를 거부하는 경우 첫 페이지만 안전한 30개로 자동 재시도합니다.
          if (page === 0 && requestLimit !== CONFIG.fallbackApiLimit && [400, 413, 422].includes(response.status)) {
            requestLimit = CONFIG.fallbackApiLimit;
            url.searchParams.set('limit', String(requestLimit));
            response = await state.apiFetch(url.href, {
              method: 'GET',
              headers: buildApiHeaders(),
              credentials: 'include',
              cache: 'no-store'
            });
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error('로그인 인증이 만료됐어요. 크랙을 새로고침한 뒤 다시 시도해주세요.');
          }
          if (!response.ok) throw new Error(`${source.label} 좋아요 API 요청 실패 (${response.status})`);

          const payload = await response.json();
          const data = payload?.data;
          const rows = Array.isArray(data?.[source.dataKey]) ? data[source.dataKey] : [];
          for (const raw of rows) {
            const item = source.type === 'character' ? normalizeCharacter(raw) : normalizeStory(raw);
            if (item?.key && !map.has(item.key)) map.set(item.key, item);
          }

          state.loadedCount = map.size;
          state.totalPages += 1;
          scheduleRender();

          const nextCursor = typeof data?.nextCursor === 'string' ? data.nextCursor : '';
          if (!nextCursor || rows.length === 0 || seenCursors.has(nextCursor)) break;
          seenCursors.add(nextCursor);
          cursor = nextCursor;
          await delay(CONFIG.pageDelayMs);
        }
      }

      state.stories = Array.from(map.values());
      state.lastSyncAt = new Date().toISOString();
      state.hasLoadedOnce = true;
      state.visibleLimit = CONFIG.renderChunk;
      cleanMemberships();
      saveCache();
    } catch (error) {
      state.error = String(error?.message || error || '좋아요 목록을 불러오지 못했어요.');
    } finally {
      if (token === state.loadToken) {
        state.loading = false;
        state.loadingLabel = '';
        scheduleRender(true);
      }
    }
  }

  function normalizeStory(raw) {
    if (!raw || typeof raw !== 'object' || !raw._id) return null;
    const creator = raw.creator || {};
    const portrait = raw.portraitImage || {};
    const profile = raw.profileImage || {};
    const id = String(raw._id);
    return {
      key: id,
      id,
      type: 'story',
      name: String(raw.name || '제목 없음'),
      simple: String(raw.simpleDescription || ''),
      creatorId: String(creator.wrtnUid || creator.profileId || raw.wrtnUid || raw.userId || 'unknown'),
      creatorName: String(creator.nickname || '알 수 없는 제작자'),
      creatorProfileId: String(creator.profileId || ''),
      thumb: safeUrl(portrait.w200 || portrait.w600 || portrait.origin || profile.w200 || profile.w600 || profile.origin || ''),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      genre: String(raw.genre?.name || ''),
      target: normalizeTarget(raw.target),
      chatType: String(raw.chatType?.name || ''),
      adult: Boolean(raw.isAdult),
      updatedAt: String(raw.updatedAt || ''),
      createdAt: String(raw.createdAt || '')
    };
  }

  function normalizeCharacter(raw) {
    if (!raw || typeof raw !== 'object' || !raw._id) return null;
    const creator = raw.creator || {};
    const profile = raw.profileImage || raw.character?.profileImage || {};
    const id = String(raw._id);
    return {
      key: `character:${id}`,
      id,
      type: 'character',
      name: String(raw.name || raw.character?.name || '이름 없음'),
      simple: String(raw.simpleDescription || raw.character?.simpleDescription || ''),
      creatorId: String(creator.wrtnUid || creator.profileId || creator.userId || 'unknown'),
      creatorName: String(creator.nickname || '알 수 없는 제작자'),
      creatorProfileId: String(creator.profileId || ''),
      thumb: safeUrl(profile.w200 || profile.w600 || profile.origin || ''),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      genre: String(raw.genre?.name || ''),
      target: normalizeTarget(raw.target),
      chatType: '',
      adult: Boolean(raw.isAdult),
      updatedAt: String(raw.updatedAt || ''),
      createdAt: String(raw.createdAt || '')
    };
  }

  function normalizeTarget(rawTarget) {
    if (rawTarget && typeof rawTarget === 'object') return String(rawTarget.name || '');
    const value = String(rawTarget || '').toLocaleLowerCase('en-US');
    if (value === 'female') return '여성향';
    if (value === 'male') return '남성향';
    if (value === 'all' || value === 'both' || value === 'neutral') return '전체';
    return String(rawTarget || '');
  }

  function itemKey(item) {
    if (!item) return '';
    return String(item.key || (item.type === 'character' ? `character:${item.id}` : item.id || ''));
  }

  function findItemByKey(key) {
    const value = String(key || '');
    return state.stories.find((item) => itemKey(item) === value) || null;
  }

  function cleanMemberships() {
    const validFolderIds = new Set(state.folders.map((folder) => folder.id));
    let changed = false;
    for (const [storyId, folderIds] of Object.entries(state.memberships)) {
      if (!Array.isArray(folderIds)) {
        delete state.memberships[storyId];
        changed = true;
        continue;
      }
      const cleaned = Array.from(new Set(folderIds.filter((id) => validFolderIds.has(id))));
      if (cleaned.length) {
        if (cleaned.length !== folderIds.length) {
          state.memberships[storyId] = cleaned;
          changed = true;
        }
      } else {
        delete state.memberships[storyId];
        changed = true;
      }
    }
    if (changed) saveFolders();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function scheduleRender(immediate = false) {
    if (!state.initialized) return;
    clearTimeout(state.renderTimer);
    state.renderTimer = setTimeout(render, immediate ? 0 : 90);
  }

  function render() {
    if (!state.initialized) return;
    renderHeader();
    renderViewTabs();
    renderFolderBar();
    renderFolderManager();
    renderStatus();
    renderContent();
  }

  function renderHeader() {
    const creators = new Set(state.stories.map((item) => item.creatorId)).size;
    const storyCount = state.stories.filter((item) => item.type !== 'character').length;
    const characterCount = state.stories.filter((item) => item.type === 'character').length;
    const syncText = state.lastSyncAt ? ` · 마지막 동기화 ${formatShortDateTime(state.lastSyncAt)}` : '';
    state.countText.textContent = state.loading
      ? `${state.loadingLabel || '좋아요'} 수집 중 ${state.loadedCount.toLocaleString()}개 · ${state.totalPages}페이지`
      : `전체 좋아요 ${state.stories.length.toLocaleString()}개 · 스토리 ${storyCount.toLocaleString()} · 캐릭터 ${characterCount.toLocaleString()} · 제작자 ${creators.toLocaleString()}명${syncText}`;
    const refreshButton = state.shadow.querySelector('.refresh-btn');
    if (refreshButton) {
      refreshButton.classList.toggle('spinning', state.loading);
      refreshButton.disabled = state.loading;
    }
  }

  function renderViewTabs() {
    for (const button of state.shadow.querySelectorAll('[data-view]')) {
      const active = button.dataset.view === state.view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    state.sortSelect.value = state.sort;

    const creatorMode = state.view === 'creator';
    state.sortSelect.classList.toggle('control-hidden', creatorMode);
    state.sortDirectionButton.classList.toggle('control-hidden', creatorMode);
    state.creatorSortButton.classList.toggle('control-hidden', !creatorMode);

    const sortMeta = sortDirectionMeta(state.sort);
    const direction = state.sortDirections[state.sort] || defaultSortDirection(state.sort);
    const ascending = direction === 'asc';
    state.sortDirectionButton.textContent = ascending ? '↑' : '↓';
    state.sortDirectionButton.title = ascending ? sortMeta.ascTitle : sortMeta.descTitle;
    state.sortDirectionButton.setAttribute('aria-label', state.sortDirectionButton.title);

    const creatorAscending = state.creatorSortDirection !== 'desc';
    state.creatorSortButton.textContent = creatorAscending ? '이름순 ↑' : '이름순 ↓';
    state.creatorSortButton.title = creatorAscending ? '제작자 이름순: ㄱ에서 ㅎ' : '제작자 이름순: ㅎ에서 ㄱ';
    state.creatorSortButton.setAttribute('aria-label', state.creatorSortButton.title);
  }


  function defaultSortDirection(sortKey) {
    return sortKey === 'updated' || sortKey === 'default' ? 'desc' : 'asc';
  }

  function sortDirectionMeta(sortKey) {
    const meta = {
      default: {
        label: '기본',
        ascTitle: 'API 기본 순서의 역방향',
        descTitle: 'API 기본 순서'
      },
      title: {
        label: '제목',
        ascTitle: '제목 오름차순: ㄱ에서 ㅎ',
        descTitle: '제목 내림차순: ㅎ에서 ㄱ'
      },
      creator: {
        label: '제작자',
        ascTitle: '제작자 이름 오름차순: ㄱ에서 ㅎ',
        descTitle: '제작자 이름 내림차순: ㅎ에서 ㄱ'
      },
      updated: {
        label: '수정',
        ascTitle: '오래 수정된 작품부터',
        descTitle: '최근 수정된 작품부터'
      }
    };
    return meta[sortKey] || meta.default;
  }

  function folderCount(folderId) {
    if (folderId === 'all') return state.stories.length;
    if (folderId === 'unfiled') {
      return state.stories.reduce((count, item) => count + ((state.memberships[itemKey(item)] || []).length ? 0 : 1), 0);
    }
    return state.stories.reduce((count, item) => count + ((state.memberships[itemKey(item)] || []).includes(folderId) ? 1 : 0), 0);
  }

  function renderFolderBar() {
    if (state.activeFolder !== 'all' && state.activeFolder !== 'unfiled' && !state.folders.some((item) => item.id === state.activeFolder)) {
      state.activeFolder = 'all';
      savePrefs();
    }
    const system = [
      { id: 'all', name: '전체' },
      { id: 'unfiled', name: '미분류' }
    ];
    state.folderBar.innerHTML = [...system, ...state.folders].map((folder) => {
      const active = folder.id === state.activeFolder;
      return `<button type="button" class="folder-chip${active ? ' active' : ''}" data-folder="${escapeAttr(folder.id)}">${escapeHtml(folder.name)} <small>${folderCount(folder.id)}</small></button>`;
    }).join('');
  }

  function renderFolderManager(force = false) {
    if (!state.folderManager) return;
    const manageButton = state.shadow.querySelector('.folder-manage');
    manageButton.classList.toggle('active', state.folderManagerOpen);
    manageButton.setAttribute('aria-expanded', state.folderManagerOpen ? 'true' : 'false');
    state.folderManager.hidden = !state.folderManagerOpen;

    if (!state.folderManagerOpen) {
      state.folderManagerSignature = '';
      state.folderManager.innerHTML = '';
      return;
    }

    const signature = JSON.stringify(state.folders.map((folder) => [folder.id, folder.name, folderCount(folder.id)]));
    if (!force && signature === state.folderManagerSignature && state.folderManager.innerHTML) return;
    state.folderManagerSignature = signature;

    state.folderManager.innerHTML = `
      <div class="folder-manager-card">
        <div class="fm-head">
          <div><b>폴더 관리</b><span>왼쪽 ≡ 손잡이를 누른 채 끌어서 표시 순서를 바꿀 수 있어요.</span></div>
          <button type="button" data-fm-action="close" aria-label="폴더 관리 닫기">×</button>
        </div>
        <form class="fm-create" data-fm-create-form>
          <input type="text" name="folderName" maxlength="40" placeholder="새 폴더 이름" autocomplete="off">
          <button type="submit">새 폴더</button>
        </form>
        <div class="fm-list">
          ${state.folders.length ? state.folders.map((folder) => `
            <div class="fm-item" data-fm-folder="${escapeAttr(folder.id)}">
              <button class="fm-drag" type="button" data-fm-drag="${escapeAttr(folder.id)}" aria-label="${escapeAttr(folder.name)} 폴더 순서 이동" title="끌어서 순서 변경"><span aria-hidden="true">≡</span></button>
              <input class="fm-name" type="text" maxlength="40" value="${escapeAttr(folder.name)}" data-fm-name="${escapeAttr(folder.id)}" aria-label="${escapeAttr(folder.name)} 폴더 이름">
              <small>${folderCount(folder.id).toLocaleString()}개 작품</small>
              <button class="fm-delete" type="button" data-fm-action="delete" data-folder-id="${escapeAttr(folder.id)}" aria-label="${escapeAttr(folder.name)} 폴더 삭제" title="폴더 삭제">×</button>
            </div>`).join('') : '<div class="fm-empty">아직 폴더가 없어요.<br>위에서 첫 폴더를 만들어보세요.</div>'}
        </div>
      </div>`;
  }

  function renderStatus() {
    const filtered = getFilteredStories();
    if (state.error) {
      state.statusText.innerHTML = `<span class="error">${escapeHtml(state.error)}</span>`;
      return;
    }
    if (state.loading) {
      state.statusText.textContent = `${state.loadingLabel || '좋아요'} 목록을 페이지당 최대 ${CONFIG.apiLimit}개씩 수집 중이에요 · 현재 ${state.loadedCount.toLocaleString()}개`;
      return;
    }
    if (!state.stories.length) {
      state.statusText.textContent = '좋아요가 없거나 아직 수집되지 않았어요. 오른쪽 위 ↻ 버튼으로 다시 확인할 수 있어요.';
      return;
    }
    state.statusText.textContent = `표시 ${filtered.length.toLocaleString()}개${state.query ? ` · “${state.query}” 검색` : ''}`;
  }

  function getFilteredStories() {
    const query = state.query.toLocaleLowerCase('ko-KR');
    let rows = state.stories.filter((item) => {
      const folders = state.memberships[itemKey(item)] || [];
      if (state.activeFolder === 'unfiled' && folders.length) return false;
      if (state.activeFolder !== 'all' && state.activeFolder !== 'unfiled' && !folders.includes(state.activeFolder)) return false;
      if (!query) return true;
      return [item.name, item.creatorName, item.simple, item.type === 'character' ? '캐릭터' : '스토리', item.genre, item.target, item.chatType, ...item.tags]
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(query);
    });

    rows = rows.slice();
    if (state.view === 'creator') return rows;

    const direction = state.sortDirections[state.sort] || defaultSortDirection(state.sort);
    const multiplier = direction === 'asc' ? 1 : -1;
    if (state.sort === 'default') {
      if (direction === 'asc') rows.reverse();
    } else if (state.sort === 'title') {
      rows.sort((a, b) => (a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base', numeric: true })
        || a.creatorName.localeCompare(b.creatorName, 'ko-KR', { sensitivity: 'base', numeric: true })) * multiplier);
    } else if (state.sort === 'creator') {
      rows.sort((a, b) => (a.creatorName.localeCompare(b.creatorName, 'ko-KR', { sensitivity: 'base', numeric: true })
        || a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base', numeric: true })) * multiplier);
    } else if (state.sort === 'updated') {
      rows.sort((a, b) => ((Date.parse(a.updatedAt || '') || 0) - (Date.parse(b.updatedAt || '') || 0)) * multiplier);
    }
    return rows;
  }

  function renderContent() {
    if (state.loading && !state.stories.length) {
      state.content.innerHTML = `
        <div class="initial-loading">
          <span class="loading-ring" aria-hidden="true"></span>
          <b>좋아요 목록을 준비하는 중…</b>
          <small>${escapeHtml(state.loadingLabel || '잠시만 기다려주세요')}</small>
        </div>`;
      state.moreWrap.classList.remove('show');
      return;
    }

    const rows = getFilteredStories();
    if (!rows.length) {
      state.content.innerHTML = `
        <div class="empty">
          <div class="empty-icon">♡</div>
          <b>${state.error ? '불러오지 못했어요' : '표시할 작품이 없어요'}</b>
          <span>${state.query ? '검색어나 폴더를 바꿔보세요.' : '오른쪽 위 ↻ 버튼으로 좋아요 목록을 다시 불러올 수 있어요.'}</span>
        </div>`;
      state.moreWrap.classList.remove('show');
      return;
    }

    if (state.view === 'creator') {
      renderCreators(rows);
      state.moreWrap.classList.remove('show');
      return;
    }

    const visible = rows.slice(0, state.visibleLimit);
    if (state.view === 'list') {
      state.content.innerHTML = `<div class="list-view">${visible.map(renderListItem).join('')}</div>`;
    } else {
      state.content.innerHTML = `<div class="card-grid">${visible.map(renderCard).join('')}</div>`;
    }
    state.moreWrap.classList.toggle('show', visible.length < rows.length);
  }

  function handleLibraryScroll() {
    if (state.autoLoadRaf) return;
    state.autoLoadRaf = requestAnimationFrame(() => {
      state.autoLoadRaf = 0;
      loadNextChunkNearBottom();
    });
  }

  function loadNextChunkNearBottom() {
    if (!state.host || state.view === 'creator' || state.loading) return;
    const rows = getFilteredStories();
    if (state.visibleLimit >= rows.length) return;

    const remaining = state.host.scrollHeight - state.host.scrollTop - state.host.clientHeight;
    const threshold = Math.max(520, state.host.clientHeight * 0.75);
    if (remaining > threshold) return;

    state.visibleLimit = Math.min(rows.length, state.visibleLimit + CONFIG.renderChunk);
    scheduleRender(true);
  }

  function renderCreators(rows) {
    const groups = new Map();
    for (const item of rows) {
      const key = item.creatorId || item.creatorName;
      if (!groups.has(key)) groups.set(key, { id: key, name: item.creatorName, items: [] });
      groups.get(key).items.push(item);
    }
    const direction = state.creatorSortDirection === 'desc' ? -1 : 1;
    const list = Array.from(groups.values()).sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base', numeric: true });
      return (byName || a.id.localeCompare(b.id, 'ko-KR')) * direction;
    });
    state.content.innerHTML = `<div class="creator-view">${list.map((group) => {
      const isOpen = state.openCreatorIds.has(group.id);
      return `
      <details class="creator-group" data-creator-id="${escapeAttr(group.id)}"${isOpen ? ' open' : ''}>
        <summary>
          <span class="creator-avatar">${escapeHtml(firstGrapheme(group.name))}</span>
          <span class="creator-name">${escapeHtml(group.name)}</span>
          <small>${group.items.length.toLocaleString()}개</small>
          <span class="creator-arrow">⌄</span>
        </summary>
        <div class="creator-items" data-empty="${isOpen ? 'false' : 'true'}">${isOpen ? group.items.map(renderListItem).join('') : ''}</div>
      </details>`;
    }).join('')}</div>`;
  }

  function handleCreatorToggle(event) {
    const detail = event.target.closest?.('.creator-group');
    if (!detail) return;
    const creatorId = detail.dataset.creatorId;
    if (detail.open) state.openCreatorIds.add(creatorId);
    else state.openCreatorIds.delete(creatorId);
    if (!detail.open) return;

    const container = detail.querySelector('.creator-items');
    if (!container || container.dataset.empty !== 'true') return;
    const rows = getFilteredStories().filter((item) => (item.creatorId || item.creatorName) === creatorId);
    container.innerHTML = rows.map(renderListItem).join('');
    container.dataset.empty = 'false';
  }

  function classificationValues(item) {
    return [item.genre, item.target, item.chatType]
      .map((value) => String(value || '').trim())
      .filter((value, index, list) => value && list.indexOf(value) === index);
  }

  function renderClassification(item, compact = false) {
    const values = classificationValues(item);
    if (!values.length) return '';
    const className = compact ? 'row-taxonomy' : 'taxonomy-line';
    return `<div class="${className}">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join('')}</div>`;
  }

  function renderHashtags(item, compact = false) {
    const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
    if (!tags.length) return '';
    const className = compact ? 'row-hashtags' : 'hashtag-list';
    const fullText = tags.map((tag) => `#${String(tag)}`).join(' ');
    // 화면에서는 한 줄로 줄이지만 검색은 getFilteredStories()가 item.tags 전체를 사용한다.
    return `<div class="${className}" title="${escapeAttr(fullText)}"><span class="hashtag-text">${escapeHtml(fullText)}</span></div>`;
  }

  function renderCard(item) {
    const key = itemKey(item);
    const folders = folderNamesForStory(key);
    return `
      <article class="story-card" data-story-id="${escapeAttr(key)}" data-open-key="${escapeAttr(key)}">
        <a class="thumb-wrap" href="${detailUrlForItem(item)}" data-open-key="${escapeAttr(key)}" target="_self">
          ${item.thumb ? `<img loading="lazy" decoding="async" src="${escapeAttr(item.thumb)}" alt="">` : `<span class="no-image">NO IMAGE</span>`}
          ${item.adult ? '<span class="adult-badge">19</span>' : ''}
        </a>
        <div class="card-body">
          <a class="story-title" href="${detailUrlForItem(item)}" data-open-key="${escapeAttr(key)}" target="_self">${escapeHtml(item.name)}</a>
          <div class="creator-line">${escapeHtml(item.creatorName)}</div>
          ${item.simple ? `<div class="simple">${escapeHtml(item.simple)}</div>` : ''}
          ${renderClassification(item)}
          ${renderHashtags(item)}
          <div class="folder-summary">${folders.length ? folders.map((name) => `<span>${escapeHtml(name)}</span>`).join('') : '<span class="muted">미분류</span>'}</div>
        </div>
      </article>`;
  }

  function renderListItem(item) {
    const key = itemKey(item);
    const folders = folderNamesForStory(key);
    return `
      <article class="story-row${folders.length ? ' has-folders' : ''}" data-story-id="${escapeAttr(key)}" data-open-key="${escapeAttr(key)}">
        <a class="row-thumb" href="${detailUrlForItem(item)}" data-open-key="${escapeAttr(key)}" target="_self">
          ${item.thumb ? `<img loading="lazy" decoding="async" src="${escapeAttr(item.thumb)}" alt="">` : '<span>—</span>'}
          ${item.adult ? '<i>19</i>' : ''}
        </a>
        <div class="row-main">
          <div class="row-left">
            <a class="row-title" href="${detailUrlForItem(item)}" data-open-key="${escapeAttr(key)}" target="_self">${escapeHtml(item.name)}</a>
            <div class="row-sub">${escapeHtml(item.creatorName)}</div>
            ${renderHashtags(item, true)}
          </div>
          <div class="row-side${folders.length ? '' : ' no-folders'}">
            ${folders.length ? `<div class="row-folders">${folders.map((name) => `<span>${escapeHtml(name)}</span>`).join('')}</div>` : ''}
            ${renderClassification(item, true)}
          </div>
        </div>
      </article>`;
  }

  function handleContentPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, input, select, textarea')) return;
    const card = event.target.closest('[data-story-id]');
    if (!card) return;

    clearContentLongPress();
    state.longPressStartX = Number(event.clientX || 0);
    state.longPressStartY = Number(event.clientY || 0);
    state.longPressKey = String(card.dataset.storyId || '');
    state.longPressTimer = PAGE.setTimeout(() => {
      const key = state.longPressKey;
      state.longPressTimer = 0;
      state.longPressKey = '';
      if (!key) return;
      state.suppressNextClick = true;
      PAGE.setTimeout(() => { state.suppressNextClick = false; }, 900);
      try { PAGE.navigator?.vibrate?.(18); } catch (_) {}
      openFolderSheet(key);
    }, 520);
  }

  function handleContentPointerMove(event) {
    if (!state.longPressTimer) return;
    const dx = Math.abs(Number(event.clientX || 0) - state.longPressStartX);
    const dy = Math.abs(Number(event.clientY || 0) - state.longPressStartY);
    if (dx > 9 || dy > 9) clearContentLongPress();
  }

  function clearContentLongPress() {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
    state.longPressKey = '';
  }

  function handleContentContextMenu(event) {
    const card = event.target.closest('[data-story-id]');
    if (!card) return;
    event.preventDefault();
    clearContentLongPress();
    state.suppressNextClick = true;
    PAGE.setTimeout(() => { state.suppressNextClick = false; }, 900);
    openFolderSheet(card.dataset.storyId);
  }

  function handleContentClick(event) {
    if (state.suppressNextClick) {
      state.suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const openLink = event.target.closest('[data-open-key]');
    if (!openLink) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const key = openLink.dataset.openKey;
    const item = findItemByKey(key);
    if (!item) return;

    event.preventDefault();
    const detailUrl = detailUrlForItem(item);

    // 크랙 원래 동작처럼 모바일에서는 상세 페이지로 바로 이동합니다.
    if (usesMobileDetailNavigation()) {
      PAGE.location.assign(detailUrl);
      return;
    }

    // PC 스토리는 원본 카드 한 장을 대리 호출해 즉시 기본 모달을 열고,
    // 직접 호출이 불가능한 항목만 상세 페이지로 이동합니다.
    if (!tryOpenNativeInfoModal(item, detailUrl)) PAGE.location.assign(detailUrl);
  }

  function usesMobileDetailNavigation() {
    const navigatorRef = PAGE.navigator || navigator;
    const userAgent = String(navigatorRef?.userAgent || '');
    const mobileHint = navigatorRef?.userAgentData?.mobile === true;
    const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
    const iPadDesktopMode = navigatorRef?.platform === 'MacIntel' && Number(navigatorRef?.maxTouchPoints || 0) > 1;
    const narrowViewport = Boolean(PAGE.matchMedia?.('(max-width: 767px)').matches);
    return mobileHint || mobileUserAgent || iPadDesktopMode || narrowViewport;
  }

  function getReactClickHandler(node) {
    if (!node) return null;
    try {
      const key = Object.keys(node).find((name) =>
        name.startsWith('__reactProps$') || name.startsWith('__reactEventHandlers$')
      );
      const handler = key ? node[key]?.onClick : null;
      return typeof handler === 'function' ? handler : null;
    } catch (_) {
      return null;
    }
  }


  function getReactFiberNode(node) {
    if (!node) return null;
    try {
      const key = Object.keys(node).find((name) => name.startsWith('__reactFiber$'));
      return key ? node[key] : null;
    } catch (_) {
      return null;
    }
  }

  function reactFiberProps(fiber) {
    if (!fiber) return null;
    return fiber.memoizedProps || fiber.pendingProps || null;
  }

  function nativeStoryClickLooksUsable(fn) {
    if (typeof fn !== 'function') return false;
    let source = '';
    try { source = Function.prototype.toString.call(fn); } catch (_) {}
    return source.includes('storyId') && source.includes('fallbackData');
  }

  // 원본 카드 한 장을 "대리 카드"로 사용합니다.
  // StoryCard의 상위 컴포넌트가 가진 story 객체(c)를 클릭 순간에만 목표 작품으로 교체하면,
  // 기존 클로저 안의 m({ storyId: c._id, fallbackData: eqb(c) }) 경로를 그대로 재사용할 수 있습니다.
  function findNativeStoryPopupBridge() {
    for (const root of state.hiddenNativeNodes.keys()) {
      if (!root?.isConnected) continue;
      const candidates = root.querySelectorAll('[role="button"], button, a, div');
      const limit = Math.min(candidates.length, 420);
      for (let index = 0; index < limit; index += 1) {
        const node = candidates[index];
        let fiber = getReactFiberNode(node);
        if (!fiber) continue;

        let storyCardClick = null;
        let donorStory = null;
        for (let depth = 0; fiber && depth < 10; depth += 1, fiber = fiber.return) {
          const props = reactFiberProps(fiber);
          if (!props || typeof props !== 'object') continue;

          if (!storyCardClick && nativeStoryClickLooksUsable(props.onClick)) {
            storyCardClick = props.onClick;
          }
          if (storyCardClick && props.story && typeof props.story === 'object' && props.story._id) {
            donorStory = props.story;
            break;
          }
        }

        if (storyCardClick && donorStory && Object.isExtensible(donorStory)) {
          return { root, node, click: storyCardClick, donorStory };
        }
      }
    }
    return null;
  }

  function buildNativeStoryPayload(item) {
    const thumb = String(item?.thumb || '');
    const creatorName = String(item?.creatorName || '알 수 없는 제작자');
    const creatorId = String(item?.creatorId || '');
    return {
      _id: String(item?.id || ''),
      name: String(item?.name || '제목 없음'),
      description: String(item?.simple || ''),
      simpleDescription: String(item?.simple || ''),
      detailDescription: String(item?.simple || ''),
      creator: {
        nickname: creatorName,
        wrtnUid: creatorId,
        profileId: String(item?.creatorProfileId || ''),
        isCertifiedCreator: false,
        isWithdrawn: false
      },
      wrtnUid: creatorId,
      totalMessageCount: 0,
      initialMessages: [],
      categories: [],
      tags: Array.isArray(item?.tags) ? item.tags.slice() : [],
      portraitImage: thumb ? { origin: thumb, w200: thumb, w600: thumb } : null,
      profileImage: null,
      genre: item?.genre ? { name: String(item.genre) } : null,
      target: item?.target ? { name: String(item.target) } : null,
      chatType: item?.chatType ? { name: String(item.chatType) } : null,
      isAdult: Boolean(item?.adult),
      isLiked: true,
      isDisliked: false,
      hasImage: Boolean(thumb),
      status: 'active',
      visibility: 'public',
      badges: [],
      replySuggestions: [],
      createdAt: String(item?.createdAt || ''),
      updatedAt: String(item?.updatedAt || ''),
      original: { isOriginal: false, isEditBlocked: false, isFanficEnabled: false }
    };
  }

  function temporarilyReplacePlainObject(target, replacement, callback) {
    if (!target || typeof target !== 'object' || !Object.isExtensible(target)) return false;
    const oldKeys = Reflect.ownKeys(target);
    const oldDescriptors = new Map();
    for (const key of oldKeys) oldDescriptors.set(key, Object.getOwnPropertyDescriptor(target, key));

    const restore = () => {
      for (const key of Reflect.ownKeys(target)) {
        try { delete target[key]; } catch (_) {}
      }
      for (const [key, descriptor] of oldDescriptors) {
        try { Object.defineProperty(target, key, descriptor); } catch (_) {
          try { target[key] = descriptor?.value; } catch (_) {}
        }
      }
    };

    try {
      for (const key of oldKeys) {
        const descriptor = oldDescriptors.get(key);
        if (descriptor?.configurable === false) return false;
        delete target[key];
      }
      for (const [key, value] of Object.entries(replacement || {})) target[key] = value;
      callback();
      return true;
    } finally {
      restore();
    }
  }

  function normalizedNodeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function findClickableAncestor(start, root, item, baseScore = 0) {
    let node = start;
    for (let depth = 0; node && depth < 18; depth += 1, node = node.parentElement) {
      if (node === root.parentElement) break;
      const handler = getReactClickHandler(node);
      if (!handler) continue;
      const cardText = normalizedNodeText(node.textContent);
      let score = baseScore + 1;
      if (item.creatorName && cardText.includes(normalizedNodeText(item.creatorName))) score += 3;
      if (node.getAttribute?.('role') === 'button') score += 2;
      if (node.tagName === 'BUTTON') score += 1;
      return { root, node, handler, score, depth };
    }
    return null;
  }

  function findNativeCardClick(item) {
    const wantedName = normalizedNodeText(item?.name);
    const wantedId = String(item?.id || '');
    if (!wantedId || !state.hiddenNativeNodes.size) return null;

    const matches = [];
    for (const root of state.hiddenNativeNodes.keys()) {
      if (!root?.isConnected) continue;

      // 제목보다 작품 ID가 가장 정확합니다. 스토리/캐릭터의 실제 상세 경로를 먼저 비교합니다.
      const wantedPath = detailPathForItem(item);
      for (const link of root.querySelectorAll('a[href]')) {
        let href = '';
        try { href = new URL(link.getAttribute('href') || '', PAGE.location.origin).pathname; } catch (_) {}
        if (href !== wantedPath) continue;
        const match = findClickableAncestor(link, root, item, 20);
        if (match) matches.push(match);
      }

      if (matches.some((match) => match.root === root && match.score >= 20)) continue;
      if (!wantedName) continue;

      const nodes = root.querySelectorAll('p, span, h1, h2, h3, a, button, [role="button"]');
      for (const textNode of nodes) {
        if (normalizedNodeText(textNode.textContent) !== wantedName) continue;
        const match = findClickableAncestor(textNode, root, item, 0);
        if (match) matches.push(match);
      }
    }

    matches.sort((a, b) => (b.score - a.score) || (a.depth - b.depth));
    return matches[0] || null;
  }


  const NATIVE_MODAL_TEMP_STYLE_PROPS = Object.freeze([
    'position', 'inset', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'overflow', 'overflow-x', 'overflow-y',
    'z-index', 'background', 'background-color', 'opacity',
    'transform', 'filter', 'perspective', 'contain', 'isolation'
  ]);

  function captureInlineStyleBackup(node, props) {
    return {
      node,
      values: props.map((prop) => ({
        prop,
        value: node.style.getPropertyValue(prop),
        priority: node.style.getPropertyPriority(prop)
      }))
    };
  }

  function restoreInlineStyleBackup(backup) {
    if (!backup?.node) return;
    for (const { prop, value, priority } of backup.values || []) {
      try {
        if (value) backup.node.style.setProperty(prop, value, priority || '');
        else backup.node.style.removeProperty(prop);
      } catch (_) {}
    }
  }

  function prepareNativeModalRoot(root) {
    if (!root) return;
    clearNativeModalBridge(false);
    rememberNativeNode(root);

    state.nativeModalRootStyleBackup = captureInlineStyleBackup(root, NATIVE_MODAL_TEMP_STYLE_PROPS);

    // display:none 상태에서는 원본 React 모달이 렌더돼도 보이지 않으므로 display만 복구합니다.
    // 대신 원본 목록 전체를 고정 투명 레이어로 빼서 보관함 레이아웃을 밀지 않게 합니다.
    root.style.setProperty('visibility', 'hidden', 'important');
    root.style.setProperty('pointer-events', 'none', 'important');
    restoreNativeNode(root);

    root.style.setProperty('position', 'fixed', 'important');
    root.style.setProperty('inset', '0', 'important');
    root.style.setProperty('top', '0', 'important');
    root.style.setProperty('right', '0', 'important');
    root.style.setProperty('bottom', '0', 'important');
    root.style.setProperty('left', '0', 'important');
    root.style.setProperty('width', '100vw', 'important');
    root.style.setProperty('height', '100dvh', 'important');
    root.style.setProperty('min-width', '0', 'important');
    root.style.setProperty('min-height', '0', 'important');
    root.style.setProperty('max-width', 'none', 'important');
    root.style.setProperty('max-height', 'none', 'important');
    root.style.setProperty('margin', '0', 'important');
    root.style.setProperty('padding', '0', 'important');
    root.style.setProperty('overflow', 'visible', 'important');
    root.style.setProperty('z-index', '2147482500', 'important');
    root.style.setProperty('background', 'transparent', 'important');
    root.style.setProperty('background-color', 'transparent', 'important');
    root.style.setProperty('opacity', '1', 'important');
    root.style.setProperty('transform', 'none', 'important');
    root.style.setProperty('filter', 'none', 'important');
    root.style.setProperty('perspective', 'none', 'important');
    root.style.setProperty('contain', 'none', 'important');
    root.style.setProperty('isolation', 'auto', 'important');
    root.style.setProperty('visibility', 'hidden', 'important');
    root.style.setProperty('pointer-events', 'none', 'important');
    root.setAttribute('aria-hidden', 'false');

    state.nativeModalRoot = root;
    state.nativeModalContainer = null;
    state.nativeModalOpened = false;
    state.nativeModalMatched = false;
  }

  function findNativeModalContainer(body, boundaryRoot) {
    let node = body;
    let fixed = null;
    let directChild = body;
    while (node && node !== boundaryRoot?.parentElement && node !== document.body) {
      if (node.parentElement === boundaryRoot) directChild = node;
      try {
        const style = PAGE.getComputedStyle(node);
        if (style.position === 'fixed') fixed = node;
      } catch (_) {}
      node = node.parentElement;
    }
    return fixed || directChild || body;
  }

  function nativeModalLooksClosed(body) {
    if (!body?.isConnected) return true;
    const root = state.nativeModalRoot;
    let node = body;
    while (node && node !== root) {
      try {
        if (node.hidden) return true;
        if (node.getAttribute?.('data-state') === 'closed') return true;
        if (node.getAttribute?.('aria-hidden') === 'true') return true;
        const style = PAGE.getComputedStyle(node);
        if (style.display === 'none') return true;
        if (style.visibility === 'hidden' && node !== state.nativeModalContainer) return true;
        const opacity = Number.parseFloat(style.opacity);
        if (Number.isFinite(opacity) && opacity <= 0.001) return true;
      } catch (_) {}
      node = node.parentElement;
    }
    const rect = body.getBoundingClientRect();
    return rect.width <= 0 || rect.height <= 0;
  }

  function modalMatchesItem(item, body = document.querySelector('.character-info-modal-content-body')) {
    if (!item || !body) return false;

    const wantedPath = detailPathForItem(item);
    const wantedId = String(item.id || '');
    const wantedName = normalizedNodeText(item.name);
    const scope = findNativeModalContainer(body, state.nativeModalRoot) || body;

    // 상세 링크가 생긴 뒤 작품 ID를 비교하는 것이 가장 정확합니다.
    const detailLinks = [];
    for (const link of scope.querySelectorAll?.('a[href]') || []) {
      let pathname = '';
      try { pathname = new URL(link.getAttribute('href') || '', PAGE.location.origin).pathname; } catch (_) {}
      if (!pathname) continue;
      if (pathname === wantedPath) return true;
      if (/^\/detail\/[A-Za-z0-9_-]+$/.test(pathname) || /^\/characters\/[A-Za-z0-9_-]+\/detail$/.test(pathname)) {
        detailLinks.push(pathname);
      }
    }

    // 상세 링크가 아직 생성되지 않은 초기 렌더에서는 DOM 안의 ID를 보조 판정으로 사용합니다.
    if (wantedId) {
      try {
        if (String(scope.innerHTML || '').includes(wantedId)) return true;
      } catch (_) {}
    }

    // 다른 작품의 상세 링크가 이미 보인다면 제목만 같아도 일치로 보지 않습니다.
    if (detailLinks.length > 0) return false;

    // 링크가 늦게 붙는 경우에만 제목을 마지막 보조 수단으로 사용합니다.
    const modalText = normalizedNodeText(body.textContent);
    return Boolean(wantedName && modalText.includes(wantedName));
  }

  function ensureNativeModalCloseObserver() {
    if (state.nativeModalObserver) return;
    const root = state.nativeModalRoot;
    if (!root?.isConnected || typeof MutationObserver !== 'function') return;

    state.nativeModalObserver = new MutationObserver(() => {
      if (!state.nativeModalOpened) return;
      const body = document.querySelector('.character-info-modal-content-body');
      if (!body || nativeModalLooksClosed(body)) clearNativeModalBridge(true);
    });

    try {
      state.nativeModalObserver.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-state', 'aria-hidden', 'hidden', 'style', 'class']
      });
    } catch (_) {
      try { state.nativeModalObserver.disconnect(); } catch (_) {}
      state.nativeModalObserver = null;
    }
  }

  function revealNativeModalIfPresent() {
    const body = document.querySelector('.character-info-modal-content-body');
    if (!body) return false;

    const root = state.nativeModalRoot;
    const container = findNativeModalContainer(body, root);
    if (container) {
      // 원본 목록은 투명하게 둔 채, 딤 배경과 모달이 들어 있는 고정 컨테이너만 표시합니다.
      container.style.setProperty('visibility', 'visible', 'important');
      container.style.setProperty('pointer-events', 'auto', 'important');
      container.style.setProperty('z-index', '2147482600', 'important');
      state.nativeModalContainer = container;
    }

    const visible = !nativeModalLooksClosed(body);
    if (visible) {
      state.nativeModalOpened = true;
      ensureNativeModalCloseObserver();
    }
    return visible;
  }

  function clearNativeModalBridge(rehide = true) {
    clearTimeout(state.nativeModalCheckTimer);
    state.nativeModalCheckTimer = 0;

    if (state.nativeModalObserver) {
      try { state.nativeModalObserver.disconnect(); } catch (_) {}
      state.nativeModalObserver = null;
    }

    const root = state.nativeModalRoot;
    const container = state.nativeModalContainer;
    if (container) {
      try {
        container.style.removeProperty('visibility');
        container.style.removeProperty('pointer-events');
        container.style.removeProperty('z-index');
      } catch (_) {}
    }

    restoreInlineStyleBackup(state.nativeModalRootStyleBackup);
    state.nativeModalRootStyleBackup = null;
    state.nativeModalContainer = null;
    state.nativeModalOpened = false;
    state.nativeModalMatched = false;
    state.nativeModalRoot = null;

    if (rehide && root?.isConnected && state.routeActive) {
      hideNativeNode(root);
      // 원본 고정 레이어가 사라진 뒤 보관함의 높이와 스크롤 영역을 즉시 재동기화합니다.
      PAGE.requestAnimationFrame(() => {
        syncInlineMetrics();
        if (state.host?.isConnected) state.host.style.display = 'block';
      });
    }
  }

  function dispatchNativeCardClick(target) {
    const event = new PAGE.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: PAGE
    });
    return target.node.dispatchEvent(event);
  }


  function tryOpenNativeInfoModal(item, detailUrl) {
    // 스토리는 원본 카드 한 장의 살아 있는 React 클로저를 대리 호출하여,
    // 원본 무한스크롤 로딩 없이 작품 ID별 기본 정보 모달을 즉시 엽니다.
    if (item?.type === 'story') {
      const bridge = findNativeStoryPopupBridge();
      if (bridge && openNativeStoryModalWithBridge(bridge, item, detailUrl)) return true;
    }

    // 직접 대리 호출이 불가능한 경우에도, 이미 원본 DOM에 있는 카드는 기존 클릭 경로를 사용합니다.
    const target = findNativeCardClick(item);
    if (target) return openNativeModalWithTarget(target, item, detailUrl);

    // 캐릭터 카드의 내부 호출 구조는 아직 별도 검증 전이므로 안전하게 상세 페이지로 폴백합니다.
    return false;
  }

  function openNativeStoryModalWithBridge(bridge, item, detailUrl) {
    try {
      prepareNativeModalRoot(bridge.root);
      const payload = buildNativeStoryPayload(item);
      const invoked = temporarilyReplacePlainObject(bridge.donorStory, payload, () => {
        Reflect.apply(bridge.click, undefined, []);
      });
      if (!invoked) {
        clearNativeModalBridge(true);
        return false;
      }
      return beginNativeModalWatch(item, detailUrl);
    } catch (error) {
      console.warn('[좋아요 보관함] 원본 카드 대리 팝업 호출 실패', error);
      clearNativeModalBridge(true);
      return false;
    }
  }

  function openNativeModalWithTarget(target, item, detailUrl) {
    try {
      prepareNativeModalRoot(target.root);
      dispatchNativeCardClick(target);
      return beginNativeModalWatch(item, detailUrl);
    } catch (_) {
      clearNativeModalBridge(true);
      return false;
    }
  }

  function beginNativeModalWatch(item, detailUrl) {
    const startedAt = Date.now();
    const originalUrl = PAGE.location.href;
    const checkOpened = () => {
      if (PAGE.location.href !== originalUrl) {
        clearNativeModalBridge(true);
        return;
      }

      const modalBody = document.querySelector('.character-info-modal-content-body');

      // 한 번 열린 모달은 DOM 제거뿐 아니라 Radix의 closed/aria-hidden 상태도 닫힘으로 봅니다.
      if (state.nativeModalOpened) {
        if (!modalBody || nativeModalLooksClosed(modalBody)) {
          clearNativeModalBridge(true);
          return;
        }

        // 이미 원하는 작품으로 확인된 뒤에는 컨테이너를 다시 건드리지 않고 닫힘만 감시합니다.
        if (state.nativeModalMatched) {
          state.nativeModalCheckTimer = PAGE.setTimeout(checkOpened, 180);
          return;
        }
      }

      if (modalBody) {
        // 첫 호출에서는 대리 카드의 기존 내용이 잠깐 렌더된 뒤 목표 작품으로 갱신될 수 있습니다.
        // 원하는 작품으로 확인되기 전에는 모달 컨테이너를 계속 숨겨 잘못된 팝업이 번쩍이지 않게 합니다.
        if (!state.nativeModalContainer) {
          state.nativeModalContainer = findNativeModalContainer(modalBody, state.nativeModalRoot);
        }

        if (modalMatchesItem(item, modalBody)) {
          state.nativeModalMatched = true;
          revealNativeModalIfPresent();
          state.nativeModalCheckTimer = PAGE.setTimeout(checkOpened, 180);
          return;
        }

        if (Date.now() - startedAt < 6000) {
          state.nativeModalCheckTimer = PAGE.setTimeout(checkOpened, 70);
          return;
        }

        console.warn('[좋아요 보관함] 목표 작품 팝업 확인 시간 초과:', item?.id, item?.name);
        clearNativeModalBridge(true);
        PAGE.location.assign(detailUrl);
        return;
      }

      if (Date.now() - startedAt >= 6000) {
        console.warn('[좋아요 보관함] 기본 팝업 생성 시간 초과:', item?.id, item?.name);
        clearNativeModalBridge(true);
        PAGE.location.assign(detailUrl);
        return;
      }

      state.nativeModalCheckTimer = PAGE.setTimeout(checkOpened, 70);
    };

    state.nativeModalCheckTimer = PAGE.setTimeout(checkOpened, 40);
    return true;
  }

  function folderNamesForStory(storyId) {
    const selected = new Set(state.memberships[storyId] || []);
    // 폴더 관리에서 정한 표시 순서를 카드·리스트·빠른 분류창에 동일하게 사용합니다.
    return state.folders.filter((folder) => selected.has(folder.id)).map((folder) => folder.name);
  }

  function openFolderSheet(storyId) {
    const story = findItemByKey(storyId);
    if (!story) return;
    const key = itemKey(story);
    state.folderSheetStoryId = key;
    const selected = new Set(state.memberships[key] || []);
    state.folderSheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div><b>빠른 분류</b><span>${escapeHtml(story.name)}</span></div>
        <button type="button" data-sheet-action="close" aria-label="닫기">×</button>
      </div>
      <button type="button" class="quick-unlike${state.unlikeInFlight.has(key) ? ' loading' : ''}" data-sheet-action="unlike" ${state.unlikeInFlight.has(key) ? 'disabled' : ''}>
        <span>${state.unlikeInFlight.has(key) ? '좋아요 취소 중…' : '좋아요 취소'}</span>
        <small>${story.type === 'character' ? '캐릭터 좋아요에서 제거' : '스토리 좋아요에서 제거'}</small>
      </button>
      <div class="quick-help">폴더를 누르면 바로 추가·해제돼요.</div>
      <div class="quick-folder-list">
        ${state.folders.length ? state.folders.map((folder) => `
          <button type="button" class="quick-folder${selected.has(folder.id) ? ' active' : ''}" data-quick-folder="${escapeAttr(folder.id)}">
            <span>${escapeHtml(folder.name)}</span><small>${folderCount(folder.id).toLocaleString()}</small>
          </button>`).join('') : '<div class="sheet-empty">아직 만든 폴더가 없어요.<br>아래에서 바로 만들어보세요.</div>'}
      </div>
      <form class="sheet-create quick-create" data-sheet-create-form>
        <input type="text" name="folderName" maxlength="40" placeholder="새 폴더 이름" autocomplete="off">
        <button type="submit">+ 만들기</button>
      </form>`;
    const backdrop = state.shadow.querySelector('.sheet-backdrop');
    backdrop.classList.add('show');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeFolderSheet() {
    if (!state.shadow) return;
    const backdrop = state.shadow.querySelector('.sheet-backdrop');
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden', 'true');
    state.folderSheetStoryId = null;
  }

  function handleFolderSheetClick(event) {
    const action = event.target.closest('[data-sheet-action]')?.dataset.sheetAction;
    if (action === 'close') {
      closeFolderSheet();
      return;
    }

    if (action === 'unlike') {
      const item = findItemByKey(state.folderSheetStoryId);
      if (item) cancelLike(item);
      return;
    }

    const folderButton = event.target.closest('[data-quick-folder]');
    if (!folderButton || !state.folderSheetStoryId) return;
    const folderId = folderButton.dataset.quickFolder;
    const current = new Set(state.memberships[state.folderSheetStoryId] || []);
    const adding = !current.has(folderId);
    if (adding) current.add(folderId);
    else current.delete(folderId);

    if (current.size) state.memberships[state.folderSheetStoryId] = Array.from(current);
    else delete state.memberships[state.folderSheetStoryId];
    saveFolders();
    state.folderManagerSignature = '';
    scheduleRender(true);
    openFolderSheet(state.folderSheetStoryId);
    showToast(adding ? '폴더에 추가했어요.' : '폴더에서 뺐어요.');
  }

  function likeActionUrl(item) {
    const id = encodeURIComponent(String(item?.id || ''));
    if (!id) return '';
    if (item?.type === 'character') {
      // 스토리 취소 API와 동일한 REST 명명 규칙을 사용합니다.
      // 서버가 이 경로를 받지 않으면 로컬 목록은 건드리지 않고 오류만 표시합니다.
      return `https://crack-api.wrtn.ai/crack-api/characters/${id}/character-user-actions/like`;
    }
    return `https://crack-api.wrtn.ai/crack-api/stories/${id}/story-user-actions/like`;
  }

  async function cancelLike(item) {
    const key = itemKey(item);
    if (!key || state.unlikeInFlight.has(key)) return;
    if (!state.apiFetch) {
      showToast('이 브라우저에서는 좋아요 취소 API를 호출할 수 없어요.');
      return;
    }

    state.unlikeInFlight.add(key);
    if (state.folderSheetStoryId === key) openFolderSheet(key);

    try {
      const hasAuth = await waitForAuth(3500);
      if (!hasAuth) throw new Error('로그인 인증을 아직 잡지 못했어요. 크랙을 새로고침한 뒤 다시 시도해주세요.');

      const url = likeActionUrl(item);
      if (!url) throw new Error('좋아요 취소 주소를 만들지 못했어요.');

      const response = await state.apiFetch(url, {
        method: 'DELETE',
        headers: buildApiHeaders(),
        credentials: 'include',
        cache: 'no-store'
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('로그인 인증이 만료됐어요. 크랙을 새로고침한 뒤 다시 시도해주세요.');
      }
      if (!response.ok) {
        if (item.type === 'character' && (response.status === 404 || response.status === 405)) {
          throw new Error('캐릭터 좋아요 취소 API 경로를 아직 확인하지 못했어요.');
        }
        throw new Error(`좋아요 취소 요청 실패 (${response.status})`);
      }

      let payload = null;
      try { payload = await response.json(); } catch (_) {}
      if (payload && payload.result && payload.result !== 'SUCCESS') {
        throw new Error('서버가 좋아요 취소를 완료하지 못했어요.');
      }

      // 서버 취소가 성공한 뒤에만 현재 항목 하나를 로컬 목록·캐시·폴더에서 제거합니다.
      state.stories = state.stories.filter((candidate) => itemKey(candidate) !== key);
      if (Object.prototype.hasOwnProperty.call(state.memberships, key)) {
        delete state.memberships[key];
        saveFolders();
      }
      state.visibleLimit = Math.max(CONFIG.renderChunk, state.visibleLimit);
      state.folderManagerSignature = '';
      saveCache();
      closeFolderSheet();
      scheduleRender(true);
      showToast('좋아요를 취소하고 목록에서 제거했어요.');
    } catch (error) {
      showToast(String(error?.message || error || '좋아요 취소에 실패했어요.'));
    } finally {
      state.unlikeInFlight.delete(key);
      if (state.folderSheetStoryId === key && findItemByKey(key)) openFolderSheet(key);
    }
  }

  function handleFolderSheetSubmit(event) {
    const form = event.target.closest('[data-sheet-create-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.folderName;
    const folder = createFolder(input?.value || '');
    if (!folder || !state.folderSheetStoryId) {
      input?.focus();
      return;
    }
    const current = new Set(state.memberships[state.folderSheetStoryId] || []);
    current.add(folder.id);
    state.memberships[state.folderSheetStoryId] = Array.from(current);
    saveFolders();
    state.folderManagerSignature = '';
    scheduleRender(true);
    openFolderSheet(state.folderSheetStoryId);
    showToast('새 폴더를 만들고 추가했어요.');
  }

  function createFolder(rawName) {
    const name = String(rawName || '').trim().slice(0, 40);
    if (!name) {
      showToast('폴더 이름을 입력해주세요.');
      return null;
    }
    if (state.folders.some((item) => item.name.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) {
      showToast('같은 이름의 폴더가 이미 있어요.');
      return null;
    }
    const folder = { id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, name };
    state.folders.push(folder);
    saveFolders();
    state.folderManagerSignature = '';
    scheduleRender(true);
    return folder;
  }

  function toggleFolderManager() {
    state.folderManagerOpen = !state.folderManagerOpen;
    renderFolderManager(true);
    if (state.folderManagerOpen) {
      requestAnimationFrame(() => {
        state.folderManager.querySelector('[name="folderName"]')?.focus({ preventScroll: true });
        state.folderManager.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  function handleFolderManagerSubmit(event) {
    const form = event.target.closest('[data-fm-create-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.folderName;
    const folder = createFolder(input?.value || '');
    if (!folder) {
      input?.focus();
      return;
    }
    renderFolderManager(true);
    requestAnimationFrame(() => state.folderManager.querySelector('[name="folderName"]')?.focus());
    showToast('새 폴더를 만들었어요.');
  }

  function handleFolderManagerClick(event) {
    const actionButton = event.target.closest('[data-fm-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.fmAction;
    if (action === 'close') {
      finishFolderDrag(false);
      state.folderManagerOpen = false;
      renderFolderManager(true);
      return;
    }
    const folderId = actionButton.dataset.folderId;
    if (action !== 'delete') return;
    const folder = state.folders.find((item) => item.id === folderId);
    if (!folder) return;
    if (!PAGE.confirm(`“${folder.name}” 폴더를 삭제할까요?\n작품 좋아요 자체는 삭제되지 않아요.`)) return;
    state.folders = state.folders.filter((item) => item.id !== folderId);
    for (const [storyId, ids] of Object.entries(state.memberships)) {
      const next = (ids || []).filter((id) => id !== folderId);
      if (next.length) state.memberships[storyId] = next;
      else delete state.memberships[storyId];
    }
    if (state.activeFolder === folderId) state.activeFolder = 'all';
    saveFolders();
    savePrefs();
    state.folderManagerSignature = '';
    scheduleRender(true);
    showToast('폴더를 삭제했어요.');
  }

  function handleFolderDragStart(event) {
    const handle = event.target.closest?.('[data-fm-drag]');
    if (!handle || state.folderDrag || !state.folderManagerOpen) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const item = handle.closest('.fm-item');
    const list = item?.closest('.fm-list');
    if (!item || !list) return;

    event.preventDefault();
    const rect = item.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'fm-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    item.after(placeholder);

    state.folderDrag = {
      pointerId: event.pointerId,
      item,
      list,
      placeholder,
      handle,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      originalStyle: item.getAttribute('style'),
      originalOrder: state.folders.map((folder) => folder.id),
      moved: false
    };

    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.left = `${rect.left}px`;
    item.style.top = `${rect.top}px`;
    item.style.width = `${rect.width}px`;
    item.style.height = `${rect.height}px`;
    item.style.margin = '0';
    item.style.zIndex = '2147483006';
    item.style.pointerEvents = 'none';

    try { handle.setPointerCapture(event.pointerId); } catch (_) {}
  }

  function handleFolderDragMove(event) {
    const drag = state.folderDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();

    drag.moved = true;
    drag.item.style.left = `${event.clientX - drag.offsetX}px`;
    drag.item.style.top = `${event.clientY - drag.offsetY}px`;

    const listRect = drag.list.getBoundingClientRect();
    const edge = Math.min(42, listRect.height * 0.18);
    if (event.clientY < listRect.top + edge) drag.list.scrollTop -= 14;
    else if (event.clientY > listRect.bottom - edge) drag.list.scrollTop += 14;

    const candidates = Array.from(drag.list.querySelectorAll('.fm-item:not(.dragging)'));
    if (!candidates.length) return;

    let target = null;
    let targetRect = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        target = candidate;
        targetRect = rect;
      }
    }
    if (!target || !targetRect) return;

    const centerY = targetRect.top + targetRect.height / 2;
    const centerX = targetRect.left + targetRect.width / 2;
    const sameRowZone = Math.abs(event.clientY - centerY) <= targetRect.height * 0.38;
    const before = sameRowZone ? event.clientX < centerX : event.clientY < centerY;
    drag.list.insertBefore(drag.placeholder, before ? target : target.nextSibling);
  }

  function handleFolderDragEnd(event) {
    const drag = state.folderDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    finishFolderDrag(true);
  }

  function handleFolderDragCancel(event) {
    const drag = state.folderDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    finishFolderDrag(false);
  }

  function finishFolderDrag(commit) {
    const drag = state.folderDrag;
    if (!drag) return;
    state.folderDrag = null;

    try { drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}

    if (commit) drag.list.insertBefore(drag.item, drag.placeholder);
    drag.placeholder.remove();
    drag.item.classList.remove('dragging');
    if (drag.originalStyle == null) drag.item.removeAttribute('style');
    else drag.item.setAttribute('style', drag.originalStyle);

    if (!commit) {
      const byId = new Map(state.folders.map((folder) => [folder.id, folder]));
      state.folders = drag.originalOrder.map((id) => byId.get(id)).filter(Boolean);
      state.folderManagerSignature = '';
      renderFolderManager(true);
      return;
    }

    const ids = Array.from(drag.list.querySelectorAll('.fm-item[data-fm-folder]'))
      .map((node) => node.dataset.fmFolder)
      .filter(Boolean);
    const byId = new Map(state.folders.map((folder) => [folder.id, folder]));
    const nextFolders = ids.map((id) => byId.get(id)).filter(Boolean);
    const changed = nextFolders.length === state.folders.length
      && nextFolders.some((folder, index) => folder.id !== state.folders[index]?.id);

    if (changed) {
      state.folders = nextFolders;
      saveFolders();
      showToast('폴더 순서를 바꿨어요.');
    }

    state.folderManagerSignature = '';
    scheduleRender(true);
  }

  function handleFolderManagerChange(event) {
    const input = event.target.closest('[data-fm-name]');
    if (!input) return;
    const folder = state.folders.find((item) => item.id === input.dataset.fmName);
    if (!folder) return;
    const nextName = input.value.trim().slice(0, 40);
    if (!nextName) {
      input.value = folder.name;
      showToast('폴더 이름은 비워둘 수 없어요.');
      return;
    }
    const duplicate = state.folders.some((item) => item.id !== folder.id && item.name.toLocaleLowerCase('ko-KR') === nextName.toLocaleLowerCase('ko-KR'));
    if (duplicate) {
      input.value = folder.name;
      showToast('같은 이름의 폴더가 이미 있어요.');
      return;
    }
    if (nextName === folder.name) return;
    folder.name = nextName;
    saveFolders();
    state.folderManagerSignature = '';
    scheduleRender(true);
    showToast('폴더 이름을 바꿨어요.');
  }

  function handleFolderManagerKeydown(event) {
    const input = event.target.closest('[data-fm-name]');
    if (!input) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    } else if (event.key === 'Escape') {
      const folder = state.folders.find((item) => item.id === input.dataset.fmName);
      if (folder) input.value = folder.name;
      input.blur();
    }
  }

  function showToast(message) {
    if (!state.shadow) return;
    const toast = state.shadow.querySelector('.toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => toast.classList.remove('show'), 1800);
  }


  function detailPathForItem(item) {
    const id = encodeURIComponent(String(item?.id || ''));
    if (!id) return '';
    return item?.type === 'character'
      ? `/characters/${id}/detail`
      : `/detail/${id}`;
  }

  function detailUrlForItem(item) {
    const path = detailPathForItem(item);
    return path ? `${PAGE.location.origin}${path}` : PAGE.location.origin;
  }


  function safeUrl(raw) {
    try {
      const url = new URL(String(raw || ''));
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function firstGrapheme(text) {
    const value = String(text || '?').trim();
    try {
      return Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value))[0]?.segment || '?';
    } catch (_) {
      return Array.from(value)[0] || '?';
    }
  }

  function formatShortDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function getCss() {
    return `
      :host {
        all: initial;
        display: block;
        width: 100%;
        min-width: 0;
        font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #f5f5f5;
        color-scheme: dark;
      }
      :host([data-mount="inline"]) {
        flex: 1 1 auto;
        min-height: 0;
        height: calc(100dvh - var(--cll-top-offset, 0px));
        max-height: calc(100dvh - var(--cll-top-offset, 0px));
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-gutter: stable;
      }
      :host([data-mount="fallback"]) {
        position: fixed;
        inset: 0;
        z-index: 2147482000;
        overflow: auto;
        background: var(--cll-site-bg, #121212);
      }
      *, *::before, *::after { box-sizing: border-box; }
      button, input, select { font: inherit; }
      button { -webkit-tap-highlight-color: transparent; }
      a { color: inherit; text-decoration: none; }

      .page-root { width: 100%; min-height: 100%; background: var(--cll-site-bg, #121212); }
      .panel {
        width: 100%; min-height: 100%; overflow: visible;
        display: flex; flex-direction: column;
        border: 0; border-radius: 0; background: var(--cll-site-bg, #121212); box-shadow: none;
      }
      .header, .toolbar, .folder-row, .folder-manager-panel, .status, .content, .more-wrap {
        width: min(1180px, 100%); margin-left: auto; margin-right: auto;
      }
      .header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 22px 20px 12px; }
      .heading { min-width: 0; }
      .title-row { display: flex; align-items: center; gap: 8px; }
      h2 { margin: 0; font-size: 22.5px; line-height: 1.2; color: #fff; }
      .version { font-size: 10.5px; color: #8d9098; border: 1px solid #34363d; border-radius: 999px; padding: 2px 6px; }
      .count-text { margin-top: 5px; font-size: 11.5px; color: #9ea1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .header-actions { display: flex; gap: 7px; }
      .icon-btn { width: 38px; height: 38px; border: 1px solid #34363d; border-radius: 11px; background: #22242a; color: #e7e7ea; cursor: pointer; font-size: 20.5px; }
      .icon-btn:hover { background: #2a2d34; }
      .icon-btn:disabled { cursor: default; opacity: 0.65; }
      .refresh-btn.spinning { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .toolbar { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto; gap: 9px; padding: 0 20px 11px; }
      .sort-controls { display: flex; align-items: center; gap: 6px; }
      .search-wrap { min-width: 0; height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 1px solid #34363d; border-radius: 12px; background: #202127; }
      .search-wrap span { color: #9396a0; font-size: 18.5px; }
      .search { width: 100%; border: 0; outline: 0; background: transparent; color: #f1f1f3; font-size: 13.5px; }
      .search::placeholder { color: #777a83; }
      .sort, .sort-direction-toggle, .creator-sort-toggle { height: 40px; border: 1px solid #34363d; border-radius: 12px; padding: 0 11px; background: #202127; color: #e6e6e9; outline: none; font-size: 12.5px; }
      .sort-direction-toggle, .creator-sort-toggle { cursor: pointer; white-space: nowrap; }
      .sort-direction-toggle { width: 40px; min-width: 40px; padding: 0; font-size: 16.5px; }
      .creator-sort-toggle { min-width: 82px; }
      .sort-direction-toggle:hover, .creator-sort-toggle:hover { background: #2a2d34; }
      .control-hidden { display: none !important; }
      .view-tabs { display: flex; padding: 3px; border: 1px solid #34363d; border-radius: 12px; background: #202127; }
      .view-tabs button { min-width: 62px; height: 32px; padding: 0 8px; border: 0; border-radius: 9px; background: transparent; color: #9ea1aa; cursor: pointer; font-size: 13.5px; }
      .view-tabs button span { margin-left: 4px; font-size: 11.5px; }
      .view-tabs button.active { background: #3a3d47; color: #fff; }

      .folder-row { display: flex; align-items: center; gap: 8px; padding: 0 20px 10px; }
      .folder-bar { min-width: 0; flex: 1; display: flex; gap: 7px; overflow-x: auto; scrollbar-width: none; }
      .folder-bar::-webkit-scrollbar { display: none; }
      .folder-chip, .folder-manage { flex: 0 0 auto; height: 31px; border: 1px solid #34363d; border-radius: 999px; padding: 0 11px; background: #202127; color: #b9bbc2; cursor: pointer; font-size: 11.5px; }
      .folder-chip small { margin-left: 4px; color: #777b85; }
      .folder-chip.active { border-color: #7c6fec; background: rgba(124,111,236,.18); color: #e8e4ff; }
      .folder-chip.active small { color: #bfb5ff; }
      .folder-manage { border-radius: 10px; color: #b8b9c0; }
      .folder-manage.active { border-color: #7164db; background: rgba(113,100,219,.16); color: #ded9ff; }

      .folder-manager-panel { padding: 0 20px 12px; }
      .folder-manager-panel[hidden] { display: none !important; }
      .folder-manager-card { overflow: hidden; border: 1px solid #34363d; border-radius: 14px; background: #1d1f24; }
      .fm-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 13px 8px; }
      .fm-head > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .fm-head b { color: #f0f0f2; font-size: 13.5px; }
      .fm-head span { color: #7f828b; font-size: 10.5px; }
      .fm-head button { width: 29px; height: 29px; border: 0; border-radius: 9px; background: #292b32; color: #bfc1c8; cursor: pointer; font-size: 17.5px; }
      .fm-create, .sheet-create { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 7px; }
      .fm-create { padding: 0 12px 11px; }
      .fm-create input, .sheet-create input, .fm-name { min-width: 0; height: 36px; border: 1px solid #363840; border-radius: 10px; outline: none; background: #24262c; color: #e7e7e9; padding: 0 10px; font-size: 11.5px; }
      .fm-create input:focus, .sheet-create input:focus, .fm-name:focus { border-color: #786ce0; box-shadow: 0 0 0 2px rgba(120,108,224,.13); }
      .fm-create button, .sheet-create button { min-width: 60px; height: 36px; border: 1px solid #6559c7; border-radius: 10px; background: #5e52ba; color: #fff; cursor: pointer; font-size: 11.5px; }
      .fm-list { max-height: 280px; overflow: auto; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; padding: 10px; border-top: 1px solid #2c2e35; }
      .fm-item { min-width: 0; display: grid; grid-template-columns: 27px minmax(0,1fr) 27px; grid-template-areas: "drag name delete" "drag count delete"; align-items: center; column-gap: 7px; row-gap: 3px; padding: 8px; border: 1px solid #30323a; border-radius: 11px; background: #22242a; transition: border-color .12s ease, background .12s ease, box-shadow .12s ease; }
      .fm-name { grid-area: name; width: 100%; height: 25px; padding: 0; border: 0; border-radius: 0; background: transparent; color: #ececef; font-size: 12.5px; font-weight: 650; }
      .fm-name:focus { border: 0; box-shadow: none; outline: 1px solid #786ce0; outline-offset: 3px; border-radius: 3px; }
      .fm-item small { grid-area: count; color: #7d8089; font-size: 9.5px; white-space: nowrap; }
      .fm-drag { grid-area: drag; width: 27px; height: 100%; min-height: 39px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #777b86; cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
      .fm-drag span { display: block; transform: scaleX(1.15); font-size: 19.5px; line-height: 1; }
      .fm-drag:hover { background: #2c2e35; color: #c4c6cd; }
      .fm-drag:active { cursor: grabbing; }
      .fm-delete { grid-area: delete; width: 27px; height: 27px; padding: 0; border: 1px solid #49343a; border-radius: 8px; background: #2b2327; color: #dca2aa; cursor: pointer; font-size: 15.5px; line-height: 1; }
      .fm-item.dragging { opacity: .96; border-color: #7568df; background: #292b35; box-shadow: 0 14px 34px rgba(0,0,0,.38); transform: rotate(.5deg); }
      .fm-placeholder { box-sizing: border-box; min-width: 0; border: 1px dashed #6359b7; border-radius: 11px; background: rgba(99,89,183,.12); }
      .fm-empty { grid-column: 1 / -1; padding: 24px 14px; color: #858892; text-align: center; font-size: 11.5px; }

      .status { min-height: 27px; padding: 5px 20px 8px; color: #878a93; font-size: 11.5px; }
      .status .error { color: #ff9d9d; }
      .content { min-height: 260px; overflow: visible; padding: 0 14px 22px; }

      .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 8px; }
      .story-card { min-width: 0; overflow: hidden; display: flex; flex-direction: column; border: 1px solid #2f3138; border-radius: 15px; background: #1e2025; touch-action: manipulation; }
      .thumb-wrap { position: relative; display: block; width: 100%; aspect-ratio: 3 / 4; overflow: hidden; background: #292b31; }
      .thumb-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s ease; }
      .story-card:hover .thumb-wrap img { transform: scale(1.02); }
      .no-image { width: 100%; height: 100%; display: grid; place-items: center; color: #686b73; font-size: 10.5px; letter-spacing: .08em; }
      .adult-badge { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 25px; height: 25px; border-radius: 8px; background: rgba(163,42,55,.92); color: white; font-size: 10.5px; font-weight: 800; }
      .card-body { min-height: 0; flex: 1; display: flex; flex-direction: column; padding: 8px 9px 9px; }
      .story-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #f4f4f5; font-size: 14.5px; line-height: 1.32; font-weight: 750; }
      .creator-line { margin-top: 4px; color: #a9abb3; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .simple { margin-top: 6px; min-height: 14px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; color: #80838c; font-size: 11px; line-height: 1.4; }
      .taxonomy-line, .row-taxonomy { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .taxonomy-line span, .row-taxonomy span { max-width: 100%; padding: 2px 6px; border: 1px solid #343741; border-radius: 999px; background: #25272e; color: #aeb1ba; font-size: 10.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .taxonomy-line .type-chip, .row-taxonomy .type-chip { border-color: #574da8; background: #332f59; color: #d8d2ff; }
      .hashtag-list, .row-hashtags { min-width: 0; margin-top: 5px; color: #8c83d9; font-size: 10.5px; line-height: 1.3; }
      .hashtag-text { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .folder-summary, .row-folders { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 7px; }
      .folder-summary { min-height: 17px; margin-top: auto; padding-top: 6px; align-items: center; align-content: flex-start; }
      .folder-summary span, .row-folders span { box-sizing: border-box; min-height: 17px; max-width: 100%; display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; background: #2b2d34; color: #b3b5bd; font-size: 10.5px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .folder-summary .muted, .row-folders .muted { color: #747780; background: transparent; padding: 2px 0; }

      /* 왼쪽은 제목·제작자·태그, 오른쪽은 폴더·분류로 나눈 2열 압축 리스트. */
      .list-view { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .creator-items { display: flex; flex-direction: column; gap: 9px; }
      .story-row { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 70px; padding: 7px 9px; border: 1px solid #34363e; border-radius: 12px; background: #1e2025; touch-action: manipulation; }
      .row-thumb { position: relative; width: 56px; height: 56px; overflow: hidden; border-radius: 10px; background: #292b31; display: grid; place-items: center; color: #777a83; }
      .row-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .row-thumb i { position: absolute; right: 3px; top: 3px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 6px; background: rgba(163,42,55,.94); color: white; font-size: 9.5px; font-style: normal; font-weight: 800; }
      .row-main { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(138px, 42%); align-items: center; gap: 10px; }
      .row-left { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
      .row-side { min-width: 0; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 5px; }
      .row-side.no-folders { justify-content: center; }
      .row-title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; color: #f5f5f7; font-size: 14.5px; line-height: 1.24; font-weight: 760; letter-spacing: -.01em; white-space: normal; overflow-wrap: anywhere; }
      .row-sub { min-width: 0; margin: 0; color: #a0a3ac; font-size: 10.5px; line-height: 1.2; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .row-hashtags { min-width: 0; margin: 0; color: #9d94e8; font-size: 10.5px; line-height: 1.25; text-align: left; }
      .row-folders { width: 100%; min-width: 0; max-width: none; margin: 0; flex-wrap: nowrap; justify-content: flex-end; overflow: hidden; gap: 4px; }
      .row-folders span { flex: 0 0 auto; min-height: 18px; padding: 2px 6px; background: #2d2f38; color: #c2c4cc; font-size: 10.5px; line-height: 1.2; }
      .row-taxonomy { width: 100%; min-width: 0; margin: 0; flex-wrap: wrap; justify-content: flex-end; overflow: hidden; gap: 4px; max-height: 42px; }
      .row-taxonomy span { flex: 0 0 auto; max-width: 100%; min-height: 18px; padding: 2px 6px; color: #bec1c9; font-size: 10.5px; line-height: 1.2; }

      @media (max-width: 760px) {
        .list-view { grid-template-columns: minmax(0, 1fr); }
      }

      .creator-view { display: flex; flex-direction: column; gap: 8px; }
      .creator-group { border: 1px solid #2f3138; border-radius: 14px; background: #1e2025; overflow: hidden; }
      .creator-group summary { list-style: none; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto 22px; align-items: center; gap: 9px; min-height: 54px; padding: 9px 12px; cursor: pointer; }
      .creator-group summary::-webkit-details-marker { display: none; }
      .creator-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 11px; background: #343640; color: #e7e3ff; font-size: 13.5px; font-weight: 800; }
      .creator-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ececef; font-size: 13.5px; font-weight: 700; }
      .creator-group summary small { color: #8f929b; font-size: 10.5px; }
      .creator-arrow { color: #8c8f98; transition: transform .18s ease; }
      .creator-group[open] .creator-arrow { transform: rotate(180deg); }
      .creator-items { padding: 0 10px 10px; }

      .more-wrap { display: none; height: max(24px, env(safe-area-inset-bottom)); padding: 0 20px; }
      .more-wrap.show { display: block; }
      .auto-sentinel { width: 100%; height: 1px; pointer-events: none; }

      .initial-loading { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #8f929b; text-align: center; }
      .initial-loading b { color: #c9cbd1; font-size: 13.5px; font-weight: 650; }
      .initial-loading small { font-size: 10.5px; }
      .loading-ring { width: 24px; height: 24px; border: 2px solid #343741; border-top-color: #8679ef; border-radius: 50%; animation: spin .85s linear infinite; }

      .empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: #8c8f98; text-align: center; }
      .empty-icon { font-size: 36.5px; color: #62656e; }
      .empty b { color: #bfc1c8; font-size: 13.5px; }
      .empty span { font-size: 11.5px; }


      .sheet-backdrop { position: fixed; inset: 0; z-index: 2147483003; display: none; align-items: flex-end; justify-content: center; padding: 16px; background: rgba(0,0,0,.48); }
      .sheet-backdrop.show { display: flex; }
      .folder-sheet { width: min(470px, 100%); max-height: min(620px, 82vh); overflow: hidden; display: grid; grid-template-rows: auto auto auto auto minmax(0,1fr) auto; border: 1px solid #383a43; border-radius: 20px; background: #1b1c21; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
      .sheet-handle { width: 38px; height: 4px; margin: 9px auto 2px; border-radius: 999px; background: #4c4f58; }
      .sheet-head { display: flex; justify-content: space-between; gap: 12px; padding: 12px 16px; }
      .sheet-head div { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
      .sheet-head b { color: #f2f2f3; font-size: 15.5px; }
      .sheet-head span { color: #858892; font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .sheet-head button { width: 32px; height: 32px; border: 0; border-radius: 10px; background: #282a31; color: #c9cad0; font-size: 18.5px; cursor: pointer; }
      .sheet-create { padding: 0 12px 10px; }
      .quick-unlike { margin: 0 12px 9px; min-height: 44px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid rgba(224,76,86,.5); border-radius: 11px; background: rgba(190,48,59,.12); color: #ff9aa2; cursor: pointer; text-align: left; }
      .quick-unlike span { font-size: 11.5px; font-weight: 700; }
      .quick-unlike small { color: #ad7479; font-size: 9.5px; }
      .quick-unlike:hover { background: rgba(190,48,59,.2); border-color: rgba(238,95,105,.72); }
      .quick-unlike:disabled, .quick-unlike.loading { cursor: wait; opacity: .65; }
      .quick-help { padding: 0 16px 9px; color: #838690; font-size: 10.5px; }
      .quick-folder-list { min-height: 76px; overflow: auto; display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; padding: 0 12px 10px; }
      .quick-folder { min-width: 0; min-height: 42px; display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 7px; padding: 0 11px; border: 1px solid #343741; border-radius: 11px; background: #24262c; color: #c7c9cf; cursor: pointer; text-align: left; }
      .quick-folder span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 11.5px; }
      .quick-folder small { color: #777b85; font-size: 9.5px; }
      .quick-folder.active { border-color: #7568df; background: rgba(117,104,223,.2); color: #eeeaff; box-shadow: inset 0 0 0 1px rgba(117,104,223,.15); }
      .quick-folder.active small { color: #bdb5ff; }
      .quick-create { padding: 10px 12px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid #2c2e35; }
      .sheet-empty { grid-column: 1 / -1; padding: 24px; color: #858892; text-align: center; font-size: 11.5px; }


      .toast { position: fixed; left: 50%; bottom: max(28px, calc(12px + env(safe-area-inset-bottom))); z-index: 2147483005; transform: translate(-50%, 20px); opacity: 0; pointer-events: none; padding: 10px 14px; border-radius: 999px; background: rgba(20,20,24,.94); color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.35); font-size: 11.5px; transition: .18s ease; }
      .toast.show { opacity: 1; transform: translate(-50%, 0); }

      @media (max-width: 720px) {
        .page-root, .panel { min-height: 100%; }
        .header { padding: 18px 14px 10px; }
        h2 { font-size: 19.5px; }
        .count-text { max-width: calc(100vw - 86px); font-size: 10.5px; }
        .toolbar { grid-template-columns: 1fr auto; padding: 0 14px 9px; gap: 7px; }
        .search-wrap { grid-column: 1 / -1; height: 38px; }
        .sort-controls { min-width: 0; gap: 5px; }
        .sort, .sort-direction-toggle, .creator-sort-toggle { height: 37px; max-width: 118px; }
        .sort-direction-toggle { width: 37px; min-width: 37px; padding: 0; }
        .creator-sort-toggle { min-width: 74px; padding: 0 8px; }
        .view-tabs { justify-self: end; }
        .view-tabs button { min-width: 39px; padding: 0 7px; }
        .view-tabs button span { display: none; }
        .folder-row { padding: 0 14px 8px; }
        .folder-manage { padding: 0 9px; }
        .folder-manager-panel { padding: 0 14px 10px; }
        .fm-head { padding: 11px 11px 7px; }
        .fm-create { padding: 0 10px 10px; }
        .fm-list { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; padding: 8px; }
        .fm-item { grid-template-columns: 24px minmax(0,1fr) 24px; column-gap: 5px; padding: 7px 6px; }
        .fm-name { font-size: 11.5px; }
        .fm-drag { width: 24px; min-height: 37px; }
        .fm-drag span { font-size: 18.5px; }
        .fm-delete { width: 24px; height: 24px; }
        .status { padding: 4px 14px 7px; }
        .content { padding: 0 10px 18px; }
        /* 모바일은 고정 2열이 아니라 가용 폭에 맞춰 자동 열 수를 결정한다. */
        .card-grid { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 6px; }
        .story-card { border-radius: 12px; }
        .card-body { padding: 7px 7px 8px; }
        .story-title { font-size: 12.5px; line-height: 1.3; }
        .creator-line { margin-top: 4px; font-size: 10.5px; }
        .simple { display: none; }
        .taxonomy-line { gap: 3px; margin-top: 5px; }
        .taxonomy-line span { padding: 2px 4px; font-size: 9.5px; }
        .hashtag-list { margin-top: 4px; font-size: 9.5px; }
        .folder-summary { padding-top: 5px; }
        .folder-summary span { padding: 2px 4px; font-size: 9.5px; }
        .adult-badge { right: 6px; top: 6px; width: 23px; height: 23px; border-radius: 7px; font-size: 9.5px; }
        .list-view { grid-template-columns: minmax(0, 1fr); gap: 8px; }
        .story-row { grid-template-columns: 52px minmax(0,1fr); min-height: 66px; gap: 8px; padding: 7px; }
        .row-thumb { width: 52px; height: 52px; }
        .row-main { grid-template-columns: minmax(0, 1fr) minmax(112px, 43%); gap: 7px; }
        .row-title { font-size: 13.5px; line-height: 1.22; }
        .row-sub { font-size: 10px; }
        .row-hashtags { font-size: 9.5px; }
        .row-side { gap: 4px; }
        .row-folders { max-width: none; justify-content: flex-end; }
        .row-folders span { min-height: 17px; padding: 2px 5px; font-size: 9.5px; }
        .row-taxonomy { flex-wrap: wrap; justify-content: flex-end; overflow: hidden; gap: 3px; max-height: 40px; }
        .row-taxonomy span { flex: 0 0 auto; max-width: 100%; min-height: 17px; padding: 2px 5px; font-size: 9.5px; }
        .quick-folder-list { grid-template-columns: repeat(2, minmax(0,1fr)); gap: 7px; }
        .quick-folder { min-height: 40px; padding: 0 9px; }
        .more-wrap { height: max(20px, env(safe-area-inset-bottom)); padding: 0 14px; }
        .sheet-backdrop { padding: 8px; }
        .folder-sheet { border-radius: 18px; max-height: 86dvh; }
      }

      @media (max-width: 340px) {
        /* 아주 좁은 화면에서만 2열로 내려 카드가 찌그러지는 것을 막는다. */
        .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
      }

      :host([data-theme="light"]) { color: #222; color-scheme: light; }
      :host([data-theme="light"][data-mount="fallback"]),
      :host([data-theme="light"]) .page-root,
      :host([data-theme="light"]) .panel { background: var(--cll-site-bg, #fff); }
      :host([data-theme="light"]) .folder-sheet,
      :host([data-theme="light"]) .folder-manager-card { background: #f8f8fa; border-color: #d8d9df; }
      :host([data-theme="light"]) h2,
      :host([data-theme="light"]) .story-title,
      :host([data-theme="light"]) .row-title,
      :host([data-theme="light"]) .creator-name,
      :host([data-theme="light"]) .sheet-head b,
      :host([data-theme="light"]) .fm-head b { color: #17181b; }
      :host([data-theme="light"]) .icon-btn,
      :host([data-theme="light"]) .search-wrap,
      :host([data-theme="light"]) .sort,
      :host([data-theme="light"]) .sort-direction-toggle,
      :host([data-theme="light"]) .creator-sort-toggle,
      :host([data-theme="light"]) .view-tabs,
      :host([data-theme="light"]) .folder-chip,
      :host([data-theme="light"]) .folder-manage,
      :host([data-theme="light"]) .story-card,
      :host([data-theme="light"]) .story-row,
      :host([data-theme="light"]) .creator-group,
      :host([data-theme="light"]) .fm-head button,
      :host([data-theme="light"]) .fm-create input,
      :host([data-theme="light"]) .sheet-create input,
      :host([data-theme="light"]) .fm-name { background: #fff; border-color: #dcdde2; color: #45474d; }
      :host([data-theme="light"]) .search { color: #222; }
      :host([data-theme="light"]) .view-tabs button.active { background: #e7e5fb; color: #463c9a; }
      :host([data-theme="light"]) .row-sub { color: #646870; }
      :host([data-theme="light"]) .row-taxonomy span { color: #555963; background: #f4f4f7; border-color: #d9dbe2; }
      :host([data-theme="light"]) .row-folders span { color: #535663; background: #efeff5; }
      :host([data-theme="light"]) .row-hashtags { color: #6659bd; }
      :host([data-theme="light"]) .folder-chip.active { background: #ece9ff; color: #4c3db3; border-color: #988eee; }
      :host([data-theme="light"]) .thumb-wrap,
      :host([data-theme="light"]) .row-thumb { background: #ececf0; }
      :host([data-theme="light"]) .folder-summary span,
      :host([data-theme="light"]) .row-folders span { background: #ececf1; color: #5f6168; }
      :host([data-theme="light"]) .folder-summary .muted,
      :host([data-theme="light"]) .row-folders .muted { background: transparent; color: #858891; padding: 2px 0; }
      :host([data-theme="light"]) .creator-avatar { background: #ece9ff; color: #5545b4; }
      :host([data-theme="light"]) .quick-unlike { background: #fff4f5; border-color: #efb7bb; color: #b12e3a; }
      :host([data-theme="light"]) .quick-unlike small { color: #9b676c; }
      :host([data-theme="light"]) .quick-unlike:hover { background: #ffe9eb; border-color: #df8c93; }
      :host([data-theme="light"]) .quick-folder { background: #fff; border-color: #dcdde3; color: #4c4f56; }
      :host([data-theme="light"]) .quick-folder.active { background: #ece9ff; border-color: #9489ea; color: #4d3faa; }
      :host([data-theme="light"]) .fm-item { background: #fff; border-color: #e0e0e5; }
      :host([data-theme="light"]) .taxonomy-line span,
      :host([data-theme="light"]) .row-taxonomy span { background: #f1f1f5; border-color: #dcdde3; color: #646770; }
      :host([data-theme="light"]) .taxonomy-line .type-chip,
      :host([data-theme="light"]) .row-taxonomy .type-chip { background: #ece9ff; border-color: #a59aed; color: #5547b2; }
      :host([data-theme="light"]) .hashtag-list,
      :host([data-theme="light"]) .row-hashtags { color: #6657bd; }
      :host([data-theme="light"]) .fm-list { border-top-color: #dedee3; }
      :host([data-theme="light"]) .fm-item { border-bottom-color: #e5e5e9; }
      :host([data-theme="light"]) .fm-drag { color: #8a8c95; }
      :host([data-theme="light"]) .fm-drag:hover { background: #f0f0f4; color: #555861; }
      :host([data-theme="light"]) .fm-item.dragging { background: #f2f0ff; border-color: #8f83e8; box-shadow: 0 14px 34px rgba(70,60,130,.18); }
      :host([data-theme="light"]) .fm-placeholder { border-color: #9489ea; background: rgba(148,137,234,.1); }
      :host([data-theme="light"]) .fm-delete { background: #fff5f6; border-color: #efcfd3; color: #a14d58; }
    `;
  }
})();
