// ==UserScript==
// @name         🧰 Crack Vault Restorer (크랙 보관함 복구기)
// @namespace    crack-vault-restorer
// @version      0.5.1
// @description  Crack 이미지 보관함의 로딩, 스크롤, 해금 이미지 상단 정렬 문제를 순정 UI 안에서 복구합니다. DOM 카드 삽입 없음.
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.5.1';
  const TAG = `[Crack Vault Restorer v${VERSION}]`;

  const MODAL_SEL = '#web-modal';
  const SCROLL_SEL = '.e17pqnyp0.css-1pjine4';
  const GRID_SEL = '.css-1qjm0pv.e1pfv5720, .css-1qjm0pv';
  const CARD_SEL = '.css-1p2snqa.e1pfv5720, .css-1p2snqa';

  const API_RE = /crack-api\.wrtn\.ai\/crack-api\/collected-images\/story-starting-sets\/([^/]+)\/images/i;
  const INFO_API_RE = /crack-api\.wrtn\.ai\/crack-api\/collected-images\/story-snapshots\/[^/]+\/info/i;
  const CLEAR_HOST_RE = /wrtn-image-ai-character\.static\.wrtn\.ai/i;
  const ENCRYPTED_HOST_RE = /crack-prod\.static\.wrtn\.ai/i;

  const nativeFetch = window.fetch.bind(window);

  const state = {
    installed: true,
    version: VERSION,
    mode: 'api-response-proxy-collected-first',
    upgradedRequests: 0,
    proxiedRequests: 0,
    proxyErrors: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastProxyAt: 0,
    lastProxySetId: '',
    lastProxyStats: null,
    sortRuns: 0,
    lastSortAt: 0,
    lastStats: null,
    knownStartingSets: {},
    cache: new Map(),
  };

  window.__CIL_NATIVE_LAZYLOAD_FIX__ = state;

  function isImageApiUrl(url) {
    return API_RE.test(String(url || ''));
  }

  function getSetId(url) {
    const m = String(url || '').match(API_RE);
    return m?.[1] || '';
  }

  function upgradeLimit(url) {
    const raw = String(url || '');
    if (!isImageApiUrl(raw)) return url;

    try {
      const u = new URL(raw, location.href);
      const current = Number(u.searchParams.get('limit') || '0');
      if (!current || current < 40) {
        u.searchParams.set('limit', '40');
        state.upgradedRequests++;
      }
      return u.href;
    } catch {
      if (/([?&])limit=\d+/.test(raw)) {
        state.upgradedRequests++;
        return raw.replace(/([?&])limit=\d+/, '$1limit=40');
      }
      state.upgradedRequests++;
      return raw + (raw.includes('?') ? '&' : '?') + 'limit=40';
    }
  }

  function textOf(el) {
    return ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  }

  function safeHeaders(headers) {
    const out = {};
    for (const [k, v] of Object.entries(headers || {})) {
      if (/^(host|connection|content-length)$/i.test(k)) continue;
      out[k] = v;
    }
    return out;
  }

  function parseInfoJson(text) {
    try {
      const json = JSON.parse(text);
      const sets = json?.data?.startingSets;
      if (Array.isArray(sets)) {
        for (const s of sets) {
          if (s?.startingSetId && s?.name) state.knownStartingSets[s.startingSetId] = s.name;
        }
      }
    } catch {}
  }

  function sortImagesCollectedFirst(images) {
    return images
      .map((image, index) => ({ image, index }))
      .sort((a, b) => {
        const ac = a.image?.isCollected === true ? 0 : 1;
        const bc = b.image?.isCollected === true ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return a.index - b.index;
      })
      .map(x => x.image);
  }

  function dedupeImages(images) {
    const map = new Map();
    for (const img of images || []) {
      const key = img?.id || img?.imageUrl || JSON.stringify(img);
      if (!map.has(key)) map.set(key, img);
    }
    return [...map.values()];
  }

  function buildPageUrl(baseUrl, cursor) {
    const u = new URL(String(baseUrl), location.href);
    u.searchParams.set('limit', '40');
    if (cursor) u.searchParams.set('cursor', cursor);
    else u.searchParams.delete('cursor');
    return u.href;
  }

  async function fetchJson(url, headers) {
    const res = await nativeFetch(url, {
      credentials: 'include',
      headers: safeHeaders(headers),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, statusText: res.statusText, text, json };
  }

  async function fetchAllImagesForRequest(requestUrl, headers) {
    const setId = getSetId(requestUrl);
    const cacheKey = `${setId}`;
    const cached = state.cache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.at < 60_000) {
      state.cacheHits++;
      return cached.payload;
    }

    state.cacheMisses++;

    const pages = [];
    let cursor = null;
    let baseJson = null;
    let baseStatus = 200;
    let baseStatusText = 'OK';
    let guard = 0;
    const seenCursors = new Set();

    while (guard < 12) {
      const url = buildPageUrl(requestUrl, cursor);
      const got = await fetchJson(url, headers);
      baseStatus = got.status;
      baseStatusText = got.statusText || baseStatusText;

      if (!baseJson) baseJson = got.json;
      const data = got.json?.data || {};
      const images = Array.isArray(data.images) ? data.images : [];
      pages.push({ url, status: got.status, count: images.length });

      if (!got.json || got.status < 200 || got.status >= 300) break;
      if (!images.length) break;

      const nextCursor = data.nextCursor;
      if (!data.hasNext || !nextCursor) break;
      if (seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      guard++;
    }

    const allImages = dedupeImages(pages.flatMap((_, idx) => {
      // Re-fetching from page metadata would be wasteful; this placeholder is replaced below.
      return [];
    }));

    // Keep the actual page images without storing full raw page objects in state.
    const collectedImages = [];
    cursor = null;
    guard = 0;
    seenCursors.clear();
    baseJson = null;
    pages.length = 0;

    while (guard < 12) {
      const url = buildPageUrl(requestUrl, cursor);
      const got = await fetchJson(url, headers);
      baseStatus = got.status;
      baseStatusText = got.statusText || baseStatusText;
      if (!baseJson) baseJson = got.json;

      const data = got.json?.data || {};
      const images = Array.isArray(data.images) ? data.images : [];
      collectedImages.push(...images);
      pages.push({
        url: url.replace(/([?&]cursor=)[^&]+/, '$1…'),
        status: got.status,
        count: images.length,
        hasNext: data.hasNext === true,
        nextCursor: data.nextCursor || null,
      });

      if (!got.json || got.status < 200 || got.status >= 300) break;
      if (!images.length) break;

      const nextCursor = data.nextCursor;
      if (!data.hasNext || !nextCursor) break;
      if (seenCursors.has(nextCursor)) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      guard++;
    }

    const uniqueImages = dedupeImages(collectedImages);
    const sortedImages = sortImagesCollectedFirst(uniqueImages);

    const outJson = baseJson && typeof baseJson === 'object'
      ? JSON.parse(JSON.stringify(baseJson))
      : { result: 'SUCCESS', data: {} };

    if (!outJson.data || typeof outJson.data !== 'object') outJson.data = {};
    outJson.data.images = sortedImages;
    outJson.data.hasNext = false;
    outJson.data.nextCursor = null;
    outJson.data.cursor = null;

    const payload = {
      status: baseStatus,
      statusText: baseStatusText,
      json: outJson,
      text: JSON.stringify(outJson),
      stats: {
        setId,
        tabName: state.knownStartingSets[setId] || '',
        pages: pages.length,
        pageCounts: pages.map(p => p.count),
        total: uniqueImages.length,
        collected: uniqueImages.filter(x => x?.isCollected === true).length,
        locked: uniqueImages.filter(x => x?.isCollected === false).length,
        clearHost: uniqueImages.filter(x => CLEAR_HOST_RE.test(x?.imageUrl || '')).length,
        encryptedHost: uniqueImages.filter(x => ENCRYPTED_HOST_RE.test(x?.imageUrl || '')).length,
        firstId: sortedImages[0]?.id || null,
      },
    };

    state.cache.set(cacheKey, { at: now, payload });
    return payload;
  }

  function defineXHRResult(xhr, payload, finalUrl) {
    let readyStateValue = 1;
    const responseTextValue = payload.text || '';
    const responseURLValue = finalUrl || '';
    const statusValue = Number(payload.status || 200);
    const statusTextValue = payload.statusText || 'OK';

    const define = (name, get) => {
      try {
        Object.defineProperty(xhr, name, { configurable: true, get });
      } catch {}
    };

    define('readyState', () => readyStateValue);
    define('status', () => statusValue);
    define('statusText', () => statusTextValue);
    define('responseURL', () => responseURLValue);
    define('responseText', () => responseTextValue);
    define('response', () => {
      if (xhr.responseType === 'json') {
        try { return JSON.parse(responseTextValue); } catch { return null; }
      }
      return responseTextValue;
    });

    try {
      xhr.getAllResponseHeaders = () => 'content-type: application/json\r\n';
      xhr.getResponseHeader = name => /^content-type$/i.test(String(name || '')) ? 'application/json' : null;
    } catch {}

    const fire = type => {
      try { xhr.dispatchEvent(new Event(type)); } catch {}
    };

    const step = rs => {
      readyStateValue = rs;
      fire('readystatechange');
    };

    setTimeout(() => {
      step(2);
      step(3);
      step(4);
      fire('load');
      fire('loadend');
    }, 0);
  }

  function defineXHRError(xhr, error) {
    let readyStateValue = 4;
    const define = (name, get) => {
      try { Object.defineProperty(xhr, name, { configurable: true, get }); } catch {}
    };
    define('readyState', () => readyStateValue);
    define('status', () => 0);
    define('statusText', () => 'CIL Proxy Error');
    define('responseText', () => String(error || ''));
    define('response', () => String(error || ''));
    setTimeout(() => {
      try { xhr.dispatchEvent(new Event('readystatechange')); } catch {}
      try { xhr.dispatchEvent(new Event('error')); } catch {}
      try { xhr.dispatchEvent(new Event('loadend')); } catch {}
    }, 0);
  }

  function patchXHR() {
    const XHR = window.XMLHttpRequest;
    if (!XHR || XHR.prototype.__cilNativePatchedV050) return;

    const open = XHR.prototype.open;
    const setRequestHeader = XHR.prototype.setRequestHeader;
    const send = XHR.prototype.send;

    XHR.prototype.open = function(method, url, ...rest) {
      const originalUrl = String(url || '');
      const nextUrl = upgradeLimit(url);
      this.__cilNative = {
        method: String(method || 'GET').toUpperCase(),
        originalUrl,
        url: String(nextUrl || originalUrl),
        headers: {},
        args: rest,
      };
      return open.call(this, method, nextUrl, ...rest);
    };

    XHR.prototype.setRequestHeader = function(name, value) {
      if (this.__cilNative) this.__cilNative.headers[name] = value;
      return setRequestHeader.call(this, name, value);
    };

    XHR.prototype.send = function(...args) {
      const meta = this.__cilNative || {};
      const url = meta.url || '';

      if (INFO_API_RE.test(url)) {
        this.addEventListener('loadend', () => parseInfoJson(String(this.responseText || '')), { once: true });
        return send.apply(this, args);
      }

      if (meta.method === 'GET' && isImageApiUrl(url) && Object.keys(meta.headers || {}).length) {
        state.proxiedRequests++;
        state.lastProxyAt = Date.now();
        state.lastProxySetId = getSetId(url);

        fetchAllImagesForRequest(url, meta.headers)
          .then(payload => {
            state.lastProxyStats = payload.stats;
            defineXHRResult(this, payload, url);
            setTimeout(() => scheduleSort('api-proxy'), 80);
            setTimeout(() => scheduleSort('api-proxy-350'), 350);
          })
          .catch(error => {
            state.proxyErrors++;
            console.warn(TAG, 'API proxy failed; falling back is not possible after proxy send:', error);
            defineXHRError(this, error);
          });
        return;
      }

      return send.apply(this, args);
    };

    Object.defineProperty(XHR.prototype, '__cilNativePatchedV050', { value: true });
  }

  function patchFetch() {
    if (!window.fetch || window.fetch.__cilNativePatchedV050) return;

    const patched = function(input, init) {
      let url = '';
      try { url = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || ''); } catch {}

      try {
        if (typeof input === 'string' || input instanceof URL) {
          input = upgradeLimit(String(input));
        } else if (input?.url && isImageApiUrl(input.url)) {
          input = new Request(upgradeLimit(input.url), input);
        }
      } catch {}

      const p = nativeFetch(input, init);
      if (INFO_API_RE.test(url)) {
        p.then(res => {
          try { res.clone().text().then(parseInfoJson).catch(() => {}); } catch {}
        }).catch(() => {});
      }
      return p;
    };

    Object.defineProperty(patched, '__cilNativePatchedV050', { value: true });
    window.fetch = patched;
  }

  function installStyle() {
    if (document.getElementById('cil-native-lazyload-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'cil-native-lazyload-fix-style';
    style.textContent = `${MODAL_SEL} [data-cilnf-card="true"] { min-width: 0; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  function findGrid(modal) {
    const pane = modal?.querySelector?.(SCROLL_SEL);
    if (!pane) return null;

    const direct = pane.querySelector(GRID_SEL);
    if (direct && direct.querySelectorAll('img').length) return direct;

    const candidates = Array.from(pane.querySelectorAll('div')).filter(el => el.querySelectorAll('img').length >= 2);
    candidates.sort((a, b) => {
      const ai = a.querySelectorAll('img').length;
      const bi = b.querySelectorAll('img').length;
      const ar = a.getBoundingClientRect?.();
      const br = b.getBoundingClientRect?.();
      return (bi * 10 + (br?.height || 0)) - (ai * 10 + (ar?.height || 0));
    });
    return candidates[0] || pane;
  }

  function findCard(img, grid) {
    const direct = img.closest?.(CARD_SEL);
    if (direct && grid.contains(direct)) return direct;

    let cur = img.parentElement;
    for (let depth = 0; cur && depth < 6; depth++, cur = cur.parentElement) {
      if (cur === grid || cur.matches?.(SCROLL_SEL) || cur.matches?.(MODAL_SEL)) break;
      const imgs = cur.querySelectorAll?.('img').length || 0;
      const r = cur.getBoundingClientRect?.();
      if (imgs >= 1 && imgs <= 3 && r && r.width >= 36 && r.height >= 36 && r.width <= 560 && r.height <= 720) return cur;
    }
    return img.parentElement || img;
  }

  function activeTabText(modal) {
    const buttons = Array.from(modal?.querySelectorAll?.('button') || []);
    const names = new Set(Object.values(state.knownStartingSets));
    names.add('상황 이미지');
    for (const b of buttons) {
      const t = textOf(b);
      if (!names.has(t)) continue;
      const cls = String(b.className || '');
      const aria = b.getAttribute('aria-selected');
      if (aria === 'true' || /bg-primary|text-primary-foreground|border-chat-foreground|bg-foreground|text-background/.test(cls)) return t;
    }
    return buttons.map(textOf).find(t => names.has(t)) || '';
  }

  function sortCollectedFirst(reason = 'auto') {
    const modal = document.querySelector(MODAL_SEL);
    if (!modal) return null;
    const grid = findGrid(modal);
    if (!grid) return null;

    const cards = new Map();
    const imgs = Array.from(grid.querySelectorAll('img'));

    for (const img of imgs) {
      const card = findCard(img, grid);
      if (!card || !grid.contains(card)) continue;
      const srcs = Array.from(card.querySelectorAll('img')).map(x => x.currentSrc || x.src || x.getAttribute('src') || '').filter(Boolean);
      const isClear = srcs.some(src => CLEAR_HOST_RE.test(src));
      const isEncrypted = srcs.some(src => ENCRYPTED_HOST_RE.test(src));
      cards.set(card, { isClear, isEncrypted });
    }

    let clear = 0;
    let encrypted = 0;
    let other = 0;
    let orderClear = 0;
    let orderOther = 5000;
    let orderLocked = 10000;

    for (const [card, info] of cards) {
      card.setAttribute('data-cilnf-card', 'true');
      if (info.isClear) {
        clear++;
        card.setAttribute('data-cilnf-clear', 'true');
        card.removeAttribute('data-cilnf-locked');
        card.style.setProperty('order', String(orderClear++), 'important');
      } else if (info.isEncrypted) {
        encrypted++;
        card.setAttribute('data-cilnf-locked', 'true');
        card.removeAttribute('data-cilnf-clear');
        card.style.setProperty('order', String(orderLocked++), 'important');
      } else {
        other++;
        card.removeAttribute('data-cilnf-clear');
        card.removeAttribute('data-cilnf-locked');
        card.style.setProperty('order', String(orderOther++), 'important');
      }
    }

    const stats = {
      reason,
      tab: activeTabText(modal),
      cards: cards.size,
      clear,
      encrypted,
      other,
      at: new Date().toISOString(),
    };
    state.sortRuns++;
    state.lastStats = stats;
    return stats;
  }

  function scheduleSort(reason = 'mutation') {
    const now = performance.now();
    if (now - state.lastSortAt < 120) {
      clearTimeout(state.sortTimer);
      state.sortTimer = setTimeout(() => scheduleSort(reason), 160);
      return;
    }
    state.lastSortAt = now;
    try { sortCollectedFirst(reason); } catch (e) { console.warn(TAG, 'sort failed', e); }
  }

  function installMutationObserver() {
    const mo = new MutationObserver(() => {
      if (document.querySelector(MODAL_SEL)) scheduleSort('mutation');
    });
    const start = () => {
      if (document.documentElement) mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'style', 'aria-selected', 'data-state'] });
    };
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  }

  function installTabReset() {
    document.addEventListener('click', event => {
      const btn = event.target?.closest?.(`${MODAL_SEL} button`);
      if (!btn) return;
      const t = textOf(btn);
      if (!t) return;

      const maybeTab = t === '상황 이미지' || Object.values(state.knownStartingSets).includes(t) || /한국|옥상|자유설정|캐릭터|프로필/.test(t);
      if (!maybeTab) return;

      const pane = document.querySelector(`${MODAL_SEL} ${SCROLL_SEL}`);
      setTimeout(() => { try { if (pane) pane.scrollTop = 0; } catch {} scheduleSort('tab-80'); }, 80);
      setTimeout(() => scheduleSort('tab-350'), 350);
      setTimeout(() => scheduleSort('tab-900'), 900);
    }, true);
  }

  function installConsoleApi() {
    window.__CIL_NATIVE_LAZYLOAD_FIX__ = state;
    state.sort = () => sortCollectedFirst('manual');
    state.status = () => ({ ...state, cache: `Map(${state.cache.size})` });
    state.clearCache = () => { state.cache.clear(); return 'ok'; };
  }

  function boot() {
    patchXHR();
    patchFetch();
    installMutationObserver();
    installTabReset();
    installConsoleApi();

    const ready = () => {
      installStyle();
      scheduleSort('boot');
      console.info(TAG, 'installed');
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }

  boot();
})();
