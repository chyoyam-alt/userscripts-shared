// ==UserScript==
// @name         🚯 Crack Chat Trash (채팅 휴지통)
// @namespace    crack chat trash
// @version      1.0.4
// @description  크랙 채팅방별 삭제 본문 휴지통. 리롤/숨김 답변은 messages 목록 캐시로 본문 복구.
// @downloadURL  https://gist.github.com/chyoyam-alt/aaf84327b4b4e8840b68c4c2846ebd29/raw/chattrash.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/aaf84327b4b4e8840b68c4c2846ebd29/raw/chattrash.user.js
// @match        https://crack.wrtn.ai/*
// @match        https://*.crack.wrtn.ai/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  /**********************************************************************
   * Crack Chat Trash v1.0.1
   *
   * 핵심:
   * - 실제 삭제 요청은 막지 않는다.
   * - DELETE API 직전에 messageId를 URL에서 꺼낸다.
   * - [data-message-group-id="{messageId}"] DOM을 찾아 본문만 저장한다.
   * - 오른쪽 아래 둥둥 버튼 없음.
   * - 사이드바 하단 확장 메뉴 그룹에 "채팅 휴지통" 메뉴를 삽입한다.
   **********************************************************************/

  const APP = {
    id: 'cct',
    name: 'Crack Chat Trash',
    version: '1.0.4',
    dbName: 'crack_chat_trash_v1',
    storeName: 'trash',
    emergencyKey: 'cct:emergency:v1',
    configKey: 'cct:config:v1',
    maxItemsPerChat: 100,
    retentionDays: 30,
    maxEmergency: 60,
    textLimit: 120000,
    previewLimit: 520,
    sidebarCheckMs: 2600,
  };

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const original = {
    fetch: W.fetch,
    XHROpen: W.XMLHttpRequest && W.XMLHttpRequest.prototype.open,
    XHRSend: W.XMLHttpRequest && W.XMLHttpRequest.prototype.send,
  };

  const DELETE_API_RE = /\/crack-gen\/v\d+\/chats\/([^/?#]+)\/messages\/([^/?#]+)/i;

  let dbPromise = null;
  let ui = null;
  let panelOpen = false;
  let seq = 0;
  let itemsCache = [];
  let refreshTimer = 0;
  let sidebarTimer = 0;
  let sidebarObserver = null;
  let sidebarObserverScope = null;
  let sidebarObserverSubtree = false;
  let urlObserverTimer = 0;
  let lastSidebarCountText = '';
  let themeObserver = null;
  let themeTimer = 0;

  const config = loadConfig();

  function loadConfig() {
    const fallback = {
      enabled: true,
      toast: false,
      console: false,
      keepFailed: true,
    };

    try {
      const raw = localStorage.getItem(APP.configKey);
      return Object.assign({}, fallback, raw ? JSON.parse(raw) : {});
    } catch (_) {
      return fallback;
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(APP.configKey, JSON.stringify(config));
    } catch (_) {}
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getContext() {
    const path = location.pathname || '';
    const m = path.match(/^\/stories\/([^/?#]+)\/episodes\/([^/?#]+)/i);

    return {
      pageUrl: location.href,
      path: location.pathname + location.search + location.hash,
      title: document.title || '',
      storyId: m ? m[1] : '',
      chatIdFromPath: m ? m[2] : '',
    };
  }

  function getCurrentChatId() {
    return getContext().chatIdFromPath || '';
  }

  function isChatRoomPath() {
    return !!getCurrentChatId();
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function truncate(value, limit) {
    const text = String(value || '');
    if (text.length <= limit) return text;
    return text.slice(0, limit) + `\n…[truncated ${text.length - limit} chars]`;
  }

  function safeUrl(raw) {
    try {
      return new URL(String(raw || ''), location.href).href;
    } catch (_) {
      return String(raw || '');
    }
  }

  function cssEscape(value) {
    if (W.CSS && typeof W.CSS.escape === 'function') return W.CSS.escape(String(value));
    return String(value).replace(/["\\#.;:[\],>+~*^$|=(){}!`]/g, '\\$&');
  }

  function parseDeleteApi(method, url) {
    if (String(method || '').toUpperCase() !== 'DELETE') return null;

    const m = String(url || '').match(DELETE_API_RE);
    if (!m) return null;

    return {
      method: 'DELETE',
      url: safeUrl(url),
      chatId: decodeURIComponent(m[1]),
      messageId: decodeURIComponent(m[2]),
    };
  }

  function isOwnElement(el) {
    return !!(el && el.closest && el.closest('#cct-root, #cct-toast, [data-cct-sidebar-item]'));
  }

  function safeRect(el) {
    try {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    } catch (_) {
      return null;
    }
  }

  function classOf(el) {
    return String(el?.getAttribute?.('class') || '');
  }

  function findMessageRoot(messageId) {
    if (!messageId) return null;

    try {
      const direct = document.querySelector(`[data-message-group-id="${cssEscape(messageId)}"]`);
      if (direct && !isOwnElement(direct)) return direct;
    } catch (_) {}

    try {
      for (const el of Array.from(document.querySelectorAll('[data-message-group-id]'))) {
        if (isOwnElement(el)) continue;
        if (String(el.getAttribute('data-message-group-id') || '') === String(messageId)) return el;
      }
    } catch (_) {}

    return null;
  }

  function findContentElement(root) {
    if (!root) return null;

    const markdown = root.querySelector?.('.wrtn-markdown');
    if (markdown) return markdown;

    return root;
  }

  function extractBodyText(root) {
    const content = findContentElement(root);
    if (!content) return { text: '', rawText: '' };

    let rawText = '';

    try {
      rawText = normalizeText(content.innerText || content.textContent || '');
    } catch (_) {
      rawText = '';
    }

    let text = rawText;

    try {
      const clone = content.cloneNode(true);

      // 본문 복원에 필요 없는 UI만 제거한다. pre/code 텍스트는 유지.
      clone.querySelectorAll([
        '#cct-root',
        '#cct-toast',
        '[data-cct-sidebar-item]',
        'script',
        'style',
        'noscript',
        'svg',
        'canvas',
        'video',
        'audio',
        'img',
        'button',
        '[role="button"]',
        '[role="menuitem"]',
        '[aria-label="copy code"]',
        '[data-radix-popper-content-wrapper]',
      ].join(',')).forEach(el => el.remove());

      text = markdownLikeText(clone);
    } catch (_) {
      text = rawText;
    }

    if (!text) text = rawText;

    return {
      text: truncate(text, APP.textLimit),
      rawText: truncate(rawText, APP.textLimit),
    };
  }

  function markdownLikeText(root) {
    const out = walkText(root, { inPre: false });
    return normalizeMarkdownText(out);
  }

  function normalizeMarkdownText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function walkText(node, state) {
    if (!node) return '';

    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = String(node.tagName || '').toUpperCase();

    if (tag === 'BR') return '\n';
    if (tag === 'HR') return '\n---\n\n';
    if (tag === 'IMG') return '';

    if (tag === 'PRE') {
      const pre = node.innerText || node.textContent || '';
      return pre.trim() ? `${pre.trim()}\n\n` : '';
    }

    const childText = Array.from(node.childNodes || [])
      .map(child => walkText(child, { inPre: state?.inPre || tag === 'PRE' }))
      .join('');

    const trimmed = childText.trim();
    if (!trimmed) return '';

    if (tag === 'P') return `${trimmed}\n\n`;
    if (tag === 'LI') return `- ${trimmed}\n`;
    if (tag === 'UL' || tag === 'OL') return `${trimmed}\n\n`;
    if (tag === 'BLOCKQUOTE') {
      const quoted = trimmed
        .split(/\n+/)
        .map(line => line.trim() ? `> ${line.trim()}` : '')
        .join('\n');
      return `${quoted}\n\n`;
    }

    // codeblock wrapper, table, article 등은 블록 간격만 살짝 보존.
    if (/^(DIV|SECTION|ARTICLE|TABLE|TR|THEAD|TBODY|TFOOT)$/.test(tag)) {
      const cls = classOf(node);
      if (/wrtn-codeblock|not-wrtn-markdown|shiki|css-vhnxen/.test(cls)) return `${trimmed}\n\n`;
      return childText;
    }

    return childText;
  }

  function detectRoleGuess(root) {
    const signals = [];
    let assistantScore = 0;
    let userScore = 0;

    if (!root) {
      return {
        roleGuess: 'unknown',
        roleConfidence: 'none',
        roleSignals: ['no-root'],
        roleScores: { assistant: 0, user: 0 },
      };
    }

    const direct = root.firstElementChild;
    const content = findContentElement(root);
    const bubble = content?.parentElement || root;

    const rootCls = classOf(root);
    const directCls = classOf(direct);
    const bubbleCls = classOf(bubble);

    // 테마가 여러 개라 완전 확정은 어렵지만, 화면 표시는 AI/유저로 단순화한다.
    // 판정 실패 시에만 unknown으로 둔다.
    if (directCls.includes('items-start')) {
      assistantScore += 3;
      signals.push('assistant:direct-items-start');
    }

    if (root.querySelector?.('.flex.items-center.justify-between.mt-2')) {
      assistantScore += 2;
      signals.push('assistant:action-row');
    }

    if (root.querySelector?.('.dropdown-button [aria-label="메시지 옵션"]')) {
      assistantScore += 1;
      signals.push('assistant:option-button');
    }

    if (bubbleCls.includes('rounded-[4px_20px_20px_20px]')) {
      assistantScore += 2;
      signals.push('assistant:rounded-bubble');
    }

    if (bubbleCls.includes('py-4') && !bubbleCls.includes('bg-surface_chat_secondary')) {
      assistantScore += 1;
      signals.push('assistant:py-4');
    }

    if (root.querySelector?.('.border-y.border-outline_tertiary')) {
      userScore += 3;
      signals.push('user:border-y-shell');
    }

    if (bubbleCls.includes('rounded-[20px_20px_4px_20px]')) {
      userScore += 2;
      signals.push('user:rounded-bubble');
    }

    if (bubbleCls.includes('bg-surface_chat_secondary')) {
      userScore += 2;
      signals.push('user:surface-secondary');
    }

    if (bubbleCls.includes('py-3')) {
      userScore += 1;
      signals.push('user:py-3');
    }

    if (rootCls.includes('items-end') || directCls.includes('items-end')) {
      userScore += 1;
      signals.push('user:items-end');
    }

    const diff = Math.abs(assistantScore - userScore);
    let roleGuess = 'unknown';
    let roleConfidence = 'none';

    if (assistantScore >= userScore + 2) {
      roleGuess = 'assistant';
      roleConfidence = diff >= 4 ? 'high' : 'medium';
    } else if (userScore >= assistantScore + 2) {
      roleGuess = 'user';
      roleConfidence = diff >= 4 ? 'high' : 'medium';
    } else if (assistantScore || userScore) {
      roleConfidence = 'low';
    }

    return {
      roleGuess,
      roleConfidence,
      roleSignals: signals,
      roleScores: { assistant: assistantScore, user: userScore },
    };
  }

  function snapshotForDelete(api, requestType) {
    const root = findMessageRoot(api.messageId);
    const body = extractBodyText(root);
    const role = detectRoleGuess(root);
    const ctx = getContext();

    return {
      id: `trash_${Date.now()}_${++seq}_${Math.random().toString(36).slice(2, 8)}`,
      schema: 2,
      app: APP.name,
      version: APP.version,

      savedAt: nowIso(),
      savedTs: Date.now(),

      status: 'REQUESTING',
      confirmStatus: 'pending',
      requestType,

      chatId: api.chatId,
      messageId: api.messageId,
      deleteApi: api,

      text: body.text,
      rawText: body.rawText,
      hasBody: !!(body.text || body.rawText),
      source: root ? 'data-message-group-id' : 'message-dom-not-found',

      roleGuess: role.roleGuess,
      roleConfidence: role.roleConfidence,
      roleSignals: role.roleSignals,
      roleScores: role.roleScores,

      pageUrl: ctx.pageUrl,
      path: ctx.path,
      title: ctx.title,
      storyId: ctx.storyId,
      chatIdFromPath: ctx.chatIdFromPath,

      domHint: root ? {
        tag: root.tagName || '',
        className: classOf(root),
        firstChildClass: classOf(root.firstElementChild),
        contentClass: classOf(findContentElement(root)),
        dataMessageGroupId: String(root.getAttribute('data-message-group-id') || ''),
        rect: safeRect(root),
      } : null,

      response: null,
      error: '',
    };
  }

  function saveBeforeDelete(api, requestType) {
    const item = snapshotForDelete(api, requestType);

    // 화면에서 본문을 못 찾았으면(리롤/숨김 답변 등),
    // 지나가며 받아둔 messages 목록 캐시에서 즉시 본문을 채운다.
    fillBodyFromCache(item, api);

    emergencyPut(item);

    idbPut(item).then(() => {
      const currentChatId = getCurrentChatId();

      if (currentChatId && String(item.chatId) === String(currentChatId)) {
        itemsCache = pruneItems([item, ...itemsCache]).kept
          .filter(x => getItemChatKey(x) === currentChatId)
          .slice(0, APP.maxItemsPerChat);
        refreshUISoon();
      }

      cleanupStoredItems().then(() => loadItems(false)).catch(() => {});
      updateSidebarCount();
    }).catch((err) => debug('idbPut failed', err));

    if (item.hasBody) {
      toast('🗑️ 삭제될 본문을 채팅 휴지통에 저장했어.');
    } else {
      toast('⚠️ 본문 DOM을 못 찾아서 API로 복구 시도 중…');

      // XHR 삭제처럼 DELETE를 잠깐 멈추기 어려운 경로는 비동기로 복구한다.
      // fetch 삭제는 hookFetch에서 DELETE를 보내기 전에 한 번 더 먼저 복구한다.
      if (requestType !== 'fetch') {
        recoverBodyFromApi(api).then((body) => {
          applyRecoveredBody(item, body, 'api-recover');
        }).catch(() => {});
      }
    }

    debug('saved before delete', item);
    return item;
  }

  function updateItem(id, patch) {
    if (!id) return;

    emergencyPatch(id, patch);

    idbPatch(id, patch)
      .then(() => loadItems(false))
      .catch((err) => debug('idbPatch failed', err));
  }


  // ===== messages 본문 캐시 (리롤/숨김 답변 복구용) =====
  const MESSAGES_LIST_RE = /\/crack-gen\/v\d+\/chats\/([^/?#]+)\/messages(?:\?|$)/i;
  const messageBodyCache = new Map();
  const MESSAGE_CACHE_MAX = 400;
  const MESSAGE_CACHE_TTL_MS = 5 * 60 * 1000;

  function getMessageIdFromApiRow(message) {
    return String(message?._id || message?.id || message?.messageId || message?.message_id || '').trim();
  }

  function getMessageTextFromApiRow(message) {
    return normalizeText(String(message?.content || message?.text || message?.message || message?.answer || ''));
  }

  function getMessageRoleFromApiRow(message) {
    return String(message?.role || message?.sender || message?.authorRole || '').trim();
  }

  function pickMessagesArray(json) {
    const data = json?.data ?? json;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.messages)) return data.messages;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.logs)) return data.logs;
    if (Array.isArray(data?.list)) return data.list;
    if (Array.isArray(json?.messages)) return json.messages;
    return [];
  }

  function harvestMessages(json) {
    try {
      const messages = pickMessagesArray(json);
      if (!Array.isArray(messages) || !messages.length) return;

      const now = Date.now();
      for (const message of messages) {
        const id = getMessageIdFromApiRow(message);
        if (!id) continue;

        const text = getMessageTextFromApiRow(message);
        if (!text) continue;

        messageBodyCache.set(id, {
          text: truncate(text, APP.textLimit),
          role: getMessageRoleFromApiRow(message),
          ts: now,
        });
      }

      if (messageBodyCache.size > MESSAGE_CACHE_MAX) {
        const sorted = [...messageBodyCache.entries()].sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0));
        messageBodyCache.clear();
        sorted.slice(0, MESSAGE_CACHE_MAX).forEach(([key, value]) => messageBodyCache.set(key, value));
      }
    } catch (_) {}
  }

  function getCachedBody(messageId) {
    const hit = messageBodyCache.get(String(messageId || ''));
    if (!hit) return null;
    if (hit.ts && Date.now() - hit.ts > MESSAGE_CACHE_TTL_MS) return null;
    return hit;
  }

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function apiHeaders() {
    const headers = {
      accept: 'application/json, text/plain, */*',
      platform: 'web',
      'wrtn-locale': 'ko-KR',
    };

    const token = getCookie('access_token');
    if (token) headers.authorization = `Bearer ${token}`;

    const wrtnId = getCookie('__w_id');
    if (wrtnId) headers['x-wrtn-id'] = wrtnId;

    const mixpanelId = getCookie('Mixpanel-Distinct-Id');
    if (mixpanelId) headers['mixpanel-distinct-id'] = mixpanelId;

    return headers;
  }

  function buildMessagesListUrl(api) {
    try {
      const url = new URL(api.url, location.href);
      url.pathname = url.pathname.replace(/\/messages\/[^/]+$/, '/messages');
      url.search = 'limit=200';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  async function recoverBodyFromApi(api) {
    const url = buildMessagesListUrl(api);
    if (!url) return null;

    try {
      const res = await original.fetch.call(W, url, {
        method: 'GET',
        credentials: 'include',
        headers: apiHeaders(),
      });

      if (!res || !res.ok) return null;

      const json = await res.json();
      harvestMessages(json);

      const hit = getCachedBody(api.messageId);
      return hit ? { text: hit.text, role: hit.role } : null;
    } catch (_) {
      return null;
    }
  }

  function roleGuessFromApiRole(role) {
    if (/assistant|ai|bot|character|model/i.test(String(role || ''))) return 'assistant';
    if (/user|human|member|owner/i.test(String(role || ''))) return 'user';
    return 'unknown';
  }

  function applyRecoveredBody(item, body, source) {
    if (!item || !body || !body.text) return false;

    const patch = {
      text: body.text,
      rawText: body.text,
      hasBody: true,
      source,
      updatedAt: nowIso(),
      updatedTs: Date.now(),
    };

    const guess = roleGuessFromApiRole(body.role);
    if ((!item.roleGuess || item.roleGuess === 'unknown') && guess !== 'unknown') {
      patch.roleGuess = guess;
      patch.roleConfidence = source === 'messages-cache' ? 'cache' : 'api';
    }

    Object.assign(item, patch);

    const cachedItem = itemsCache.find(x => x.id === item.id);
    if (cachedItem) Object.assign(cachedItem, patch);

    emergencyPatch(item.id, patch);
    idbPatch(item.id, patch).then(() => loadItems(false)).catch((err) => debug('idbPatch failed', err));
    refreshUISoon();
    updateSidebarCount();
    return true;
  }

  function fillBodyFromCache(item, api) {
    if (!item || item.hasBody) return false;

    const cached = getCachedBody(api.messageId);
    if (!cached || !cached.text) return false;

    item.text = cached.text;
    item.rawText = cached.text;
    item.hasBody = true;
    item.source = 'messages-cache';

    const guess = roleGuessFromApiRole(cached.role);
    if ((!item.roleGuess || item.roleGuess === 'unknown') && guess !== 'unknown') {
      item.roleGuess = guess;
      item.roleConfidence = 'cache';
    }

    return true;
  }

  function watchMessagesListResponse(promise, method, fullUrl) {
    try {
      if (!config.enabled) return;
      if (String(method || 'GET').toUpperCase() !== 'GET') return;
      if (!MESSAGES_LIST_RE.test(fullUrl)) return;

      Promise.resolve(promise).then((res) => {
        try {
          if (res && res.ok && res.clone) {
            res.clone().json().then(harvestMessages).catch(() => {});
          }
        } catch (_) {}
      }, () => {});
    } catch (_) {}
  }
  // ===== /messages 본문 캐시 =====

  function hookFetch() {
    if (!original.fetch || original.fetch.__cctHooked) return;

    const wrapped = function cctFetch(input, init) {
      let method = 'GET';
      let url = '';

      try {
        if (typeof input === 'string' || input instanceof URL) {
          url = String(input);
        } else if (input && typeof input === 'object') {
          url = input.url || String(input);
          method = input.method || method;
        }
        if (init && init.method) method = init.method;
      } catch (_) {}

      const fullUrl = safeUrl(url);
      const api = config.enabled ? parseDeleteApi(method, fullUrl) : null;
      const item = api ? saveBeforeDelete(api, 'fetch') : null;

      const runOriginalFetch = () => {
        let promise;
        try {
          promise = original.fetch.apply(this, arguments);
        } catch (err) {
          if (item) {
            updateItem(item.id, {
              status: 'REQUEST_THROWN',
              confirmStatus: 'failed',
              error: String(err && err.message || err),
              updatedAt: nowIso(),
              updatedTs: Date.now(),
            });
          }
          throw err;
        }

        // 지나가는 messages 목록 응답을 본문 캐시에 저장한다.
        watchMessagesListResponse(promise, method, fullUrl);

        if (!item) return promise;

        return Promise.resolve(promise).then((res) => {
          const patch = {
            status: res && res.ok ? 'DELETED_CONFIRMED' : 'DELETE_RESPONSE_NOT_OK',
            confirmStatus: res && res.ok ? 'success' : 'failed',
            updatedAt: nowIso(),
            updatedTs: Date.now(),
            response: {
              phase: 'response',
              status: res && res.status,
              ok: !!(res && res.ok),
              statusText: res && res.statusText,
              preview: '',
            },
          };

          try {
            const ct = res.headers?.get?.('content-type') || '';
            if (res.clone && /json|text|plain/i.test(ct)) {
              res.clone().text().then((txt) => {
                patch.response.preview = truncate(txt, 1600);
                updateItem(item.id, patch);
              }).catch(() => updateItem(item.id, patch));
            } else {
              updateItem(item.id, patch);
            }
          } catch (_) {
            updateItem(item.id, patch);
          }

          return res;
        }, (err) => {
          updateItem(item.id, {
            status: 'DELETE_REJECTED',
            confirmStatus: 'failed',
            error: String(err && err.message || err),
            updatedAt: nowIso(),
            updatedTs: Date.now(),
          });
          throw err;
        });
      };

      if (item && !item.hasBody) {
        // 캐시에도 없을 때만 DELETE를 보내기 전에 메시지 목록을 한 번 더 조회한다.
        return recoverBodyFromApi(api).then((body) => {
          applyRecoveredBody(item, body, 'api-recover');
          return runOriginalFetch();
        }, () => runOriginalFetch());
      }

      return runOriginalFetch();
    };

    wrapped.__cctHooked = true;
    W.fetch = wrapped;
  }

  function hookXHR() {
    if (!W.XMLHttpRequest || !original.XHROpen || !original.XHRSend || original.XHRSend.__cctHooked) return;

    W.XMLHttpRequest.prototype.open = function cctOpen(method, url) {
      try {
        this.__cctReq = {
          method: String(method || 'GET').toUpperCase(),
          url: safeUrl(url),
        };
      } catch (_) {}

      return original.XHROpen.apply(this, arguments);
    };

    const wrappedSend = function cctSend() {
      let item = null;

      try {
        const req = this.__cctReq || {};
        const api = config.enabled ? parseDeleteApi(req.method, req.url) : null;
        if (api) item = saveBeforeDelete(api, 'xhr');
      } catch (err) {
        debug('xhr saveBeforeDelete failed', err);
      }

      if (item) {
        const xhr = this;

        const onDone = () => {
          let preview = '';

          try {
            const rt = xhr.responseType;
            if (!rt || rt === 'text' || rt === 'json') preview = truncate(xhr.responseText || '', 1600);
            else preview = `[responseType=${rt}]`;
          } catch (err) {
            preview = `[response preview blocked: ${String(err && err.message || err)}]`;
          }

          updateItem(item.id, {
            status: xhr.status >= 200 && xhr.status < 300 ? 'DELETED_CONFIRMED' : 'DELETE_RESPONSE_NOT_OK',
            confirmStatus: xhr.status >= 200 && xhr.status < 300 ? 'success' : 'failed',
            updatedAt: nowIso(),
            updatedTs: Date.now(),
            response: {
              phase: 'loadend',
              status: xhr.status,
              ok: xhr.status >= 200 && xhr.status < 300,
              statusText: xhr.statusText,
              preview,
            },
          });
        };

        try {
          xhr.addEventListener('loadend', onDone, { once: true });
        } catch (_) {
          const prev = xhr.onreadystatechange;
          xhr.onreadystatechange = function () {
            if (typeof prev === 'function') {
              try { prev.apply(this, arguments); } catch (err) { setTimeout(() => { throw err; }); }
            }
            if (xhr.readyState === 4) onDone();
          };
        }
      }

      return original.XHRSend.apply(this, arguments);
    };

    wrappedSend.__cctHooked = true;
    W.XMLHttpRequest.prototype.send = wrappedSend;
  }

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(APP.dbName, 1);

      req.onupgradeneeded = () => {
        const db = req.result;
        const store = db.objectStoreNames.contains(APP.storeName)
          ? req.transaction.objectStore(APP.storeName)
          : db.createObjectStore(APP.storeName, { keyPath: 'id' });

        try { store.createIndex('savedTs', 'savedTs'); } catch (_) {}
        try { store.createIndex('messageId', 'messageId'); } catch (_) {}
        try { store.createIndex('chatId', 'chatId'); } catch (_) {}
        try { store.createIndex('confirmStatus', 'confirmStatus'); } catch (_) {}
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return dbPromise;
  }

  async function idbPut(item) {
    const db = await openDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP.storeName, 'readwrite');
      tx.objectStore(APP.storeName).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbPatch(id, patch) {
    const db = await openDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP.storeName, 'readwrite');
      const store = tx.objectStore(APP.storeName);
      const req = store.get(id);

      req.onsuccess = () => {
        const old = req.result;
        if (old) store.put(Object.assign({}, old, patch));
      };

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGetAll() {
    const db = await openDB();

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(APP.storeName, 'readonly');
      const req = tx.objectStore(APP.storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(id) {
    const db = await openDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP.storeName, 'readwrite');
      tx.objectStore(APP.storeName).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbClear() {
    const db = await openDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(APP.storeName, 'readwrite');
      tx.objectStore(APP.storeName).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function retentionCutoffTs() {
    return Date.now() - APP.retentionDays * 24 * 60 * 60 * 1000;
  }

  function getItemChatKey(item) {
    return String(item?.chatId || item?.chatIdFromPath || 'unknown');
  }

  function pruneItems(items) {
    const sorted = dedupeItems(items || []);
    const cutoff = retentionCutoffTs();
    const groups = new Map();
    const kept = [];
    const removed = [];

    for (const item of sorted) {
      if (!item || !item.id) continue;

      if (item.savedTs && item.savedTs < cutoff) {
        removed.push(item);
        continue;
      }

      const key = getItemChatKey(item);
      const count = groups.get(key) || 0;

      if (count < APP.maxItemsPerChat) {
        groups.set(key, count + 1);
        kept.push(item);
      } else {
        removed.push(item);
      }
    }

    return { kept, removed };
  }

  async function cleanupStoredItems() {
    const all = dedupeItems(await idbGetAll());
    const { removed } = pruneItems(all);

    for (const item of removed) {
      try { await idbDelete(item.id); } catch (_) {}
    }

    const emergencyKept = pruneItems(readEmergency()).kept.slice(0, APP.maxEmergency);
    writeEmergency(emergencyKept);
  }

  function readEmergency() {
    try {
      const raw = localStorage.getItem(APP.emergencyKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeEmergency(arr) {
    try {
      localStorage.setItem(APP.emergencyKey, JSON.stringify((arr || []).slice(0, APP.maxEmergency)));
    } catch (_) {}
  }

  function emergencyPut(item) {
    const arr = readEmergency();
    arr.unshift(item);
    writeEmergency(pruneItems(dedupeItems(arr)).kept.slice(0, APP.maxEmergency));
  }

  function emergencyPatch(id, patch) {
    const arr = readEmergency();
    const idx = arr.findIndex(item => item && item.id === id);
    if (idx >= 0) {
      arr[idx] = Object.assign({}, arr[idx], patch);
      writeEmergency(arr);
    }
  }

  function emergencyDelete(id) {
    writeEmergency(readEmergency().filter(item => item && item.id !== id));
  }

  async function importEmergency() {
    const arr = readEmergency();

    for (const item of arr) {
      try { await idbPut(item); } catch (_) {}
    }
  }

  function dedupeItems(items) {
    const out = [];
    const seen = new Set();

    for (const item of items || []) {
      if (!item || !item.id) continue;

      const key = item.messageId
        ? `${item.chatId || ''}:${item.messageId}:${Math.floor((item.savedTs || 0) / 10000)}`
        : item.id;

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out.sort((a, b) => (b.savedTs || 0) - (a.savedTs || 0));
  }

  async function loadItems(render = true) {
    try {
      await importEmergency();
      await cleanupStoredItems();

      const all = pruneItems([...readEmergency(), ...(await idbGetAll())]).kept;
      const currentChatId = getCurrentChatId();

      itemsCache = currentChatId
        ? all.filter(item => getItemChatKey(item) === currentChatId).slice(0, APP.maxItemsPerChat)
        : [];
    } catch (err) {
      debug('loadItems failed', err);

      const currentChatId = getCurrentChatId();
      itemsCache = currentChatId
        ? pruneItems(readEmergency()).kept.filter(item => getItemChatKey(item) === currentChatId).slice(0, APP.maxItemsPerChat)
        : [];
    }

    updateRouteVisibility();
    updateSidebarCount();
    if (render) refreshUI();
  }

  function visibleItems() {
    const q = normalizeText(ui?.querySelector?.('[data-cct-search]')?.value || '').toLowerCase();
    const filter = ui?.querySelector?.('[data-cct-filter]')?.value || 'all';

    return itemsCache.filter((item) => {
      if (filter === 'body' && !item.hasBody) return false;
      if (filter === 'assistant' && item.roleGuess !== 'assistant') return false;
      if (filter === 'user' && item.roleGuess !== 'user') return false;
      if (filter === 'unknown' && item.roleGuess !== 'unknown') return false;

      if (!q) return true;

      const hay = [
        item.text,
        item.rawText,
        item.title,
        item.messageId,
        item.chatId,
        formatRoleGuess(item),
      ].filter(Boolean).join('\n').toLowerCase();

      return hay.includes(q);
    });
  }

  function installUI() {
    if (document.getElementById('cct-root')) {
      ui = document.getElementById('cct-root');
      return;
    }

    const root = document.createElement('div');
    root.id = 'cct-root';
    root.innerHTML = `
      <div id="cct-backdrop" hidden></div>
      <section id="cct-panel" hidden>
        <header class="cct-head">
          <div>
            <strong>채팅 휴지통</strong>
            <span>v${APP.version}</span>
          </div>
          <button type="button" data-cct-close title="닫기">×</button>
        </header>

        <div class="cct-note">
          삭제한 채팅 본문만 로컬에 30일 동안 보관합니다. 채팅방별 최대 100개까지 유지합니다.
        </div>

        <div class="cct-controls">
          <input type="search" data-cct-search placeholder="본문 / messageId 검색">
          <select data-cct-filter>
            <option value="all">전체</option>
            <option value="body">본문 있음</option>
            <option value="assistant">AI</option>
            <option value="user">유저</option>
            <option value="unknown">구분 없음</option>
          </select>
        </div>

        <div class="cct-status" data-cct-status></div>

        <div class="cct-toolbar">
          <button type="button" data-cct-refresh>새로고침</button>
          <button type="button" data-cct-copy-all>전체 TXT 복사</button>
          <button type="button" data-cct-copy-json>JSON 복사</button>
          <button type="button" data-cct-clear>전체 비우기</button>
        </div>

        <div class="cct-list" data-cct-list></div>
      </section>
    `;

    document.documentElement.appendChild(root);
    ui = root;

    injectStyle();
    updateThemeMode();
    installThemeObserver();

    root.querySelector('[data-cct-close]')?.addEventListener('click', closePanel);
    root.querySelector('#cct-backdrop')?.addEventListener('click', closePanel);
    root.querySelector('[data-cct-refresh]')?.addEventListener('click', () => loadItems(true));
    root.querySelector('[data-cct-copy-all]')?.addEventListener('click', copyAllTxt);
    root.querySelector('[data-cct-copy-json]')?.addEventListener('click', copyJson);

    root.querySelector('[data-cct-search]')?.addEventListener('input', refreshUISoon);
    root.querySelector('[data-cct-filter]')?.addEventListener('change', refreshUI);

    root.querySelector('[data-cct-clear]')?.addEventListener('click', async () => {
      const ok = confirm('채팅 휴지통을 전부 비울까? 크랙 메시지는 건드리지 않음.');
      if (!ok) return;

      try { await idbClear(); } catch (_) {}
      writeEmergency([]);
      itemsCache = [];
      refreshUI();
      updateSidebarCount();
      toast('채팅 휴지통을 비웠어.');
    });

    root.addEventListener('click', onPanelClick, true);

    refreshUI();
  }

  function bindToggle(root, selector, key) {
    const el = root.querySelector(selector);
    if (!el) return;

    el.checked = !!config[key];
    el.addEventListener('change', (ev) => {
      config[key] = !!ev.target.checked;
      saveConfig();
      refreshUI();
    });
  }

  function openPanel() {
    if (!isChatRoomPath()) {
      closePanel();
      toast('채팅방 안에서만 채팅 휴지통을 열 수 있어.');
      return;
    }

    installUI();
    updateThemeMode();
    panelOpen = true;
    refreshUI();
    loadItems(true);
  }

  function closePanel() {
    panelOpen = false;
    refreshUI();
  }

  function onPanelClick(ev) {
    const btn = ev.target?.closest?.('[data-cct-action]');
    if (!btn) return;

    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-cct-action');
    const item = itemsCache.find(x => x.id === id);
    if (!item) return;

    if (action === 'copy-text') {
      copyText(item.text || item.rawText || '').then(ok => toast(ok ? '본문 복사 완료.' : '복사 실패.'));
    } else if (action === 'copy-info') {
      copyText(formatItem(item)).then(ok => toast(ok ? '정보 포함 복사 완료.' : '복사 실패.'));
    } else if (action === 'insert') {
      insertIntoEditor(item.text || item.rawText || '').then(ok => toast(ok ? '입력창에 넣었어.' : '입력창을 못 찾았어.'));
    } else if (action === 'delete') {
      idbDelete(item.id).catch(() => {});
      emergencyDelete(item.id);
      itemsCache = itemsCache.filter(x => x.id !== item.id);
      refreshUI();
      updateSidebarCount();
      toast('이 항목을 지웠어.');
    }
  }

  function refreshUISoon() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshUI, 80);
  }

  function refreshUI() {
    if (!ui) return;

    const panel = ui.querySelector('#cct-panel');
    const backdrop = ui.querySelector('#cct-backdrop');
    const status = ui.querySelector('[data-cct-status]');
    const list = ui.querySelector('[data-cct-list]');

    if (panel) panel.hidden = !panelOpen;
    if (backdrop) backdrop.hidden = !panelOpen;

    const shown = visibleItems();
    const withBody = itemsCache.filter(x => x.hasBody).length;

    if (status) {
      status.textContent = [
        `현재방 ${itemsCache.length}/${APP.maxItemsPerChat}`,
        `보관 ${APP.retentionDays}D`,
        `본문 있음 ${withBody}`,
        shown.length !== itemsCache.length ? `표시 ${shown.length}` : '',
      ].filter(Boolean).join(' · ');
    }

    if (!list) return;

    if (!itemsCache.length) {
      list.innerHTML = `<div class="cct-empty">현재 채팅방에 저장된 삭제 본문 없음.<br>이 방에서 메시지를 삭제하면 이곳에 본문이 저장돼.</div>`;
      return;
    }

    if (!shown.length) {
      list.innerHTML = `<div class="cct-empty">검색/필터에 맞는 항목이 없어.</div>`;
      return;
    }

    list.innerHTML = shown.map(renderItem).join('');
  }

  function renderItem(item) {
    const text = item.text || item.rawText || '';
    const preview = text ? escapeHtml(truncate(text, APP.previewLimit)) : '<span class="cct-warn">본문 없음</span>';
    const roleLabel = formatRoleGuess(item);

    return `
      <details class="cct-item">
        <summary>
          <div class="cct-line1">
            <span class="cct-role">${escapeHtml(roleLabel)}</span>
            <span class="cct-title">${escapeHtml(item.title || '크랙')}</span>
          </div>
          <div class="cct-meta">
            ${escapeHtml(formatDate(item.savedTs))}
            · msg ${escapeHtml(shortId(item.messageId))}
          </div>
          <div class="cct-preview">${preview}</div>
        </summary>
        <div class="cct-detail">
          <div class="cct-actions">
            <button type="button" data-cct-action="copy-text" data-id="${escapeAttr(item.id)}">본문 복사</button>
            <button type="button" data-cct-action="copy-info" data-id="${escapeAttr(item.id)}">정보 포함 복사</button>
            <button type="button" data-cct-action="insert" data-id="${escapeAttr(item.id)}">입력창에 넣기</button>
            <button type="button" data-cct-action="delete" data-id="${escapeAttr(item.id)}">휴지통에서 삭제</button>
          </div>
          <pre>${escapeHtml(text || '(본문 없음)')}</pre>
        </div>
      </details>
    `;
  }

  function formatRoleGuess(item) {
    const role = item?.roleGuess || 'unknown';
    if (role === 'assistant') return 'AI';
    if (role === 'user') return '유저';
    return '구분 없음';
  }

  function formatItem(item) {
    const lines = [];
    lines.push('[크랙 채팅 휴지통]');
    lines.push(`저장시각: ${item.savedAt || ''}`);
    lines.push(`구분: ${formatRoleGuess(item)}`);
    lines.push(`채팅: ${item.title || ''}`);
    lines.push(`chatId: ${item.chatId || ''}`);
    lines.push(`messageId: ${item.messageId || ''}`);
    lines.push('');
    lines.push(item.text || item.rawText || '(본문 없음)');
    return lines.join('\n');
  }

  function copyAllTxt() {
    const shown = visibleItems();
    const text = shown.map(formatItem).join('\n\n---\n\n') || '(저장된 삭제 본문 없음)';
    copyText(text).then(ok => toast(ok ? 'TXT 복사 완료.' : '복사 실패.'));
  }

  function copyJson() {
    const payload = {
      tool: APP.name,
      version: APP.version,
      exportedAt: nowIso(),
      page: getContext(),
      items: visibleItems(),
    };

    copyText(JSON.stringify(payload, null, 2)).then(ok => toast(ok ? 'JSON 복사 완료.' : '복사 실패.'));
  }

  function copyText(text) {
    text = String(text || '');

    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return Promise.resolve(true);
      }
    } catch (_) {}

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, () => false);
      }
    } catch (_) {}

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return Promise.resolve(!!ok);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  async function insertIntoEditor(text) {
    text = String(text || '');
    if (!text) return false;

    const editor = findEditor();
    if (!editor) return false;

    try {
      editor.focus();

      if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? editor.value.length;
        editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
        const pos = start + text.length;
        try { editor.setSelectionRange(pos, pos); } catch (_) {}
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (editor.isContentEditable || editor.getAttribute('contenteditable') === 'true') {
        let ok = false;

        try {
          ok = document.execCommand('insertText', false, text);
        } catch (_) {}

        if (!ok) {
          const sel = getSelection();
          const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;

          if (range) {
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            editor.textContent = (editor.textContent || '') + text;
          }
        }

        try {
          editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        } catch (_) {
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }

        return true;
      }
    } catch (err) {
      debug('insert failed', err);
    }

    return false;
  }

  function findEditor() {
    const selectors = [
      'textarea:not([disabled])',
      '[contenteditable="true"].ProseMirror',
      '.ProseMirror[contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
    ];

    for (const sel of selectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        const found = els.find((el) => {
          if (isOwnElement(el)) return false;
          const r = safeRect(el);
          return r && r.width > 100 && r.height > 20;
        });

        if (found) return found;
      } catch (_) {}
    }

    return null;
  }

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }


  function removeSidebarItem() {
    document.querySelectorAll('[data-cct-sidebar-item]').forEach(el => {
      try { el.remove(); } catch (_) {}
    });

    lastSidebarCountText = '';
  }

  function updateRouteVisibility() {
    if (isChatRoomPath()) {
      installSidebarItem();
      return;
    }

    removeSidebarItem();

    if (panelOpen) {
      closePanel();
    }
  }

  function findUpdateVersionButton() {
    const buttons = Array.from(document.querySelectorAll('button'));

    // 가장 직접적: V41 같은 업데이트 버튼.
    let found = buttons.find(btn => /^V\s*\d+/i.test(norm(btn.textContent || '')));
    if (found) return found;

    // 보조: "업데이트 정보" 라벨 다음 형제 중 버튼 찾기.
    const labels = Array.from(document.querySelectorAll('p, span')).filter(el => norm(el.textContent) === '업데이트 정보');
    for (const label of labels) {
      let cur = label.nextElementSibling;
      let guard = 0;
      while (cur && guard < 8) {
        if (cur.matches?.('button')) return cur;
        const btn = cur.querySelector?.('button');
        if (btn && /^V\s*\d+/i.test(norm(btn.textContent || ''))) return btn;
        cur = cur.nextElementSibling;
        guard += 1;
      }
    }

    return null;
  }

  function makeSidebarItem() {
    const wrap = document.createElement('div');
    wrap.dataset.cctSidebarItem = '1';
    wrap.className = 'px-2.5 h-4 box-content py-[18px]';
    wrap.innerHTML = `
      <div role="button" tabindex="0" class="w-full flex h-4 items-center justify-between typo-text-base_leading-none_medium space-x-2 [&_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar cursor-pointer">
        <span class="flex space-x-2 items-center min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_secondary)" viewBox="0 0 24 24" width="24" height="24" color="icon_secondary" style="flex:0 0 auto;" aria-hidden="true"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"></path></svg>
          <span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">채팅 휴지통</span>
        </span>
        <span class="cct-sidebar-count" data-cct-sidebar-count></span>
      </div>
    `;

    wrap.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openPanel();
    }, true);

    wrap.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        ev.stopPropagation();
        openPanel();
      }
    }, true);

    return wrap;
  }

  function installSidebarItem() {
    if (!isChatRoomPath()) {
      removeSidebarItem();
      return false;
    }

    if (document.querySelector('[data-cct-sidebar-item]')) {
      updateSidebarCount();
      return true;
    }

    // 다른 확장 버튼(캡처/다운로드/모델통계)이 들어가는 같은 컨테이너를 찾아 그 맨 밑에 붙인다.
    const anchor = getSidebarAnchor();
    const container = anchor && anchor.parentElement;
    if (!container) return false;

    const item = makeSidebarItem();
    container.appendChild(item);

    updateSidebarCount();
    return true;
  }

  function scheduleSidebarInstall(delay = 180) {
    clearTimeout(sidebarTimer);
    sidebarTimer = setTimeout(() => {
      sidebarTimer = 0;
      installSidebarItem();
    }, delay);
  }

  function updateSidebarCount() {
    if (!isChatRoomPath()) {
      removeSidebarItem();
      return;
    }

    const el = document.querySelector('[data-cct-sidebar-count]');
    if (!el) return;

    const count = itemsCache.length || 0;
    const nextText = count ? String(count) : '';
    const nextHidden = !count;
    const signature = `${nextText}:${nextHidden ? 'hidden' : 'shown'}`;

    // 같은 숫자를 계속 다시 써서 사이드바가 재계산되는 상황 방지.
    if (lastSidebarCountText === signature) return;
    lastSidebarCountText = signature;

    if (el.textContent !== nextText) el.textContent = nextText;
    if (el.hidden !== nextHidden) el.hidden = nextHidden;
  }

  function getSidebarAnchor() {
    return document.getElementById('hcd-sidebar-button')
      || document.getElementById('rr-capture-settings-sidebar-button')
      || document.getElementById('ccms-chat-model-stats-sidebar')
      || findUpdateVersionButton();
  }

  function getSidebarObserverScope() {
    const anchor = getSidebarAnchor();
    const container = anchor && anchor.parentElement;

    if (container) return {
      scope: container,
      subtree: false,
    };

    const sidebar = document.querySelector('aside, nav, [class*="sidebar"], [class*="Sidebar"], [class*="side"], [class*="Side"]');

    if (sidebar) return {
      scope: sidebar,
      subtree: false,
    };

    // 최후의 폴백. 기존처럼 documentElement 전체 subtree를 보지는 않는다.
    return {
      scope: document.body || document.documentElement,
      subtree: false,
    };
  }

  function connectSidebarObserver() {
    const info = getSidebarObserverScope();
    if (!info || !info.scope) return;

    if (
      sidebarObserver
      && sidebarObserverScope === info.scope
      && sidebarObserverSubtree === info.subtree
    ) {
      return;
    }

    try {
      sidebarObserver?.disconnect?.();
    } catch (_) {}

    sidebarObserverScope = info.scope;
    sidebarObserverSubtree = info.subtree;

    try {
      sidebarObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type !== 'childList') continue;
          if (m.target?.closest?.('[data-cct-sidebar-item], #cct-root, #cct-toast')) continue;

          if (m.addedNodes?.length || m.removedNodes?.length) {
            scheduleSidebarInstall(220);
            return;
          }
        }
      });

      sidebarObserver.observe(info.scope, {
        childList: true,
        subtree: info.subtree,
      });
    } catch (_) {}
  }

  function installSidebarObserver() {
    connectSidebarObserver();

    setInterval(() => {
      updateRouteVisibility();
      connectSidebarObserver();
    }, APP.sidebarCheckMs);

    patchHistoryForSpa();
  }

  function patchHistoryForSpa() {
    if (history.__cctPatched) return;
    history.__cctPatched = true;

    const fire = () => {
      clearTimeout(urlObserverTimer);
      urlObserverTimer = setTimeout(() => {
        updateRouteVisibility();
        connectSidebarObserver();
        loadItems(false);
      }, 350);
    };

    for (const key of ['pushState', 'replaceState']) {
      const orig = history[key];
      history[key] = function cctHistoryPatched() {
        const ret = orig.apply(this, arguments);
        fire();
        return ret;
      };
    }

    window.addEventListener('popstate', fire);
  }


  function parseCssColor(color) {
    const text = String(color || '').trim();
    if (!text || text === 'transparent') return null;

    let m = text.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(',').map(v => Number(String(v).trim().replace('%', '')));
      if (parts.length >= 3) {
        const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
        if (Number.isFinite(alpha) && alpha <= 0.05) return null;
        return { r: parts[0], g: parts[1], b: parts[2] };
      }
    }

    m = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let hex = m[1];
      if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }

    return null;
  }

  function luminance(rgb) {
    if (!rgb) return 0;

    const srgb = [rgb.r, rgb.g, rgb.b].map(v => {
      v = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function getEffectiveBackgroundColor() {
    const candidates = [
      document.body,
      document.documentElement,
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('[class*="bg-"]'),
    ].filter(Boolean);

    for (const el of candidates) {
      try {
        const bg = parseCssColor(getComputedStyle(el).backgroundColor);
        if (bg) return bg;
      } catch (_) {}
    }

    return null;
  }

  function updateThemeMode() {
    if (!ui) return;

    let mode = 'dark';

    try {
      const htmlText = [
        document.documentElement.getAttribute('class'),
        document.documentElement.getAttribute('data-theme'),
        document.documentElement.getAttribute('color-theme'),
        document.body?.getAttribute?.('class'),
        document.body?.getAttribute?.('data-theme'),
      ].filter(Boolean).join(' ').toLowerCase();

      if (/\blight\b|theme-light|light-mode/.test(htmlText)) {
        mode = 'light';
      } else if (/\bdark\b|theme-dark|dark-mode/.test(htmlText)) {
        mode = 'dark';
      } else {
        const bg = getEffectiveBackgroundColor();
        mode = luminance(bg) > 0.62 ? 'light' : 'dark';
      }
    } catch (_) {
      mode = 'dark';
    }

    ui.dataset.cctTheme = mode;
  }

  function scheduleThemeUpdate() {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(updateThemeMode, 80);
  }

  function installThemeObserver() {
    if (themeObserver) return;

    try {
      themeObserver = new MutationObserver(scheduleThemeUpdate);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'color-theme'],
      });

      if (document.body) {
        themeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'color-theme'],
        });
      }
    } catch (_) {}

    setInterval(updateThemeMode, 2500);
    updateThemeMode();
  }

  function injectStyle() {
    const css = `
      #cct-backdrop {
        position: fixed; inset: 0; z-index: 2147483645;
        background: rgba(8,8,12,.55);
        backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
      }
      #cct-backdrop[hidden], #cct-panel[hidden] { display: none !important; }

      #cct-panel {
        position: fixed; right: 22px; bottom: 22px; z-index: 2147483646;
        display: flex; flex-direction: column;
        width: min(680px, calc(100vw - 44px));
        max-height: min(800px, calc(100vh - 44px));
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.07);
        background: rgba(22,22,27,.97);
        color: #f4f4f5;
        box-shadow: 0 32px 80px -12px rgba(0,0,0,.6);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        font-family: 'Pretendard', ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        font-size: 13px;
        animation: cct-pop .18s ease-out;
      }
      @keyframes cct-pop { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }
      #cct-panel * { box-sizing: border-box; }

      .cct-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 18px 14px; }
      .cct-head strong { font-size: 15px; font-weight: 700; letter-spacing: -.01em; }
      .cct-head > div > span { margin-left: 8px; padding: 2px 7px; border-radius: 999px; background: rgba(255,255,255,.06); color: rgba(244,244,245,.5); font-size: 10px; font-weight: 600; vertical-align: middle; }
      .cct-head button[data-cct-close] { width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: 9px; background: rgba(255,255,255,.05); color: rgba(244,244,245,.7); font-size: 18px; line-height: 1; cursor: pointer; transition: background .15s, color .15s; }
      .cct-head button[data-cct-close]:hover { background: rgba(255,255,255,.12); color: #fff; }

      .cct-note { margin: 0 18px; padding: 9px 12px; border-radius: 11px; background: rgba(139,92,246,.10); border: 1px solid rgba(139,92,246,.18); color: rgba(221,214,254,.92); font-size: 11.5px; line-height: 1.5; }

      .cct-controls { display: grid; grid-template-columns: minmax(0,1fr) 124px; gap: 8px; padding: 12px 18px 0; }
      .cct-controls input, .cct-controls select { width: 100%; padding: 9px 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 11px; background: rgba(255,255,255,.04); color: #f4f4f5; font-size: 12.5px; outline: none; transition: border-color .15s, background .15s; }
      .cct-controls input:focus, .cct-controls select:focus { border-color: rgba(139,92,246,.5); background: rgba(139,92,246,.06); }
      .cct-controls input::placeholder { color: rgba(244,244,245,.35); }
      .cct-controls option { color: #18181b; }

      .cct-status { padding: 11px 18px 0; color: rgba(244,244,245,.45); font-size: 11px; letter-spacing: .01em; }
      .cct-toolbar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 18px 0; }

      .cct-toolbar button, .cct-actions button { border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(255,255,255,.04); color: rgba(244,244,245,.9); padding: 7px 11px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s; }
      .cct-toolbar button:hover, .cct-actions button:hover { background: rgba(255,255,255,.10); }
      .cct-toolbar button[data-cct-clear], .cct-actions button[data-cct-action="delete"] { color: rgba(248,150,150,.95); }
      .cct-toolbar button[data-cct-clear]:hover, .cct-actions button[data-cct-action="delete"]:hover { background: rgba(248,113,113,.10); border-color: rgba(248,113,113,.25); }
      .cct-actions button[data-cct-action="insert"] { background: rgba(139,92,246,.16); border-color: rgba(139,92,246,.3); color: #ddd6fe; }
      .cct-actions button[data-cct-action="insert"]:hover { background: rgba(139,92,246,.26); }

      .cct-list { overflow: auto; padding: 12px 14px 16px; }
      .cct-list::-webkit-scrollbar { width: 10px; }
      .cct-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.10); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
      .cct-empty { padding: 44px 16px; text-align: center; color: rgba(244,244,245,.4); font-size: 12.5px; line-height: 1.6; }

      .cct-item { margin-top: 8px; border-radius: 14px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.025); overflow: hidden; transition: border-color .15s, background .15s; }
      .cct-item:hover { border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.04); }
      .cct-item[open] { border-color: rgba(139,92,246,.3); background: rgba(139,92,246,.04); }
      .cct-item[open] .cct-preview { display: none; }
      .cct-item[open] summary { padding-bottom: 9px; }
      .cct-item summary { cursor: pointer; list-style: none; padding: 11px 13px; }
      .cct-item summary::-webkit-details-marker { display: none; }
      .cct-line1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .cct-badge, .cct-role { flex: 0 0 auto; border-radius: 7px; padding: 3px 8px; font-size: 10.5px; font-weight: 700; letter-spacing: .01em; }
      .cct-badge.ok { background: rgba(52,211,153,.14); color: #6ee7b7; }
      .cct-badge.bad { background: rgba(248,113,113,.14); color: #fca5a5; }
      .cct-badge.pending { background: rgba(251,191,36,.14); color: #fcd34d; }
      .cct-role { background: rgba(255,255,255,.06); color: rgba(244,244,245,.6); font-weight: 600; }
      .cct-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(244,244,245,.85); font-size: 12px; font-weight: 600; }
      .cct-meta { margin-top: 5px; color: rgba(244,244,245,.4); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cct-preview { margin-top: 8px; color: rgba(244,244,245,.72); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
      .cct-warn { color: #fca5a5; font-weight: 700; }
      .cct-detail { border-top: 1px solid rgba(255,255,255,.06); padding: 12px 13px 13px; }
      .cct-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .cct-detail pre { margin: 0; max-height: none; overflow: visible; white-space: pre-wrap; word-break: break-word; border-radius: 11px; padding: 12px; background: rgba(0,0,0,.28); color: rgba(244,244,245,.78); font-size: 11.8px; line-height: 1.65; }

      #cct-toast { position: fixed; right: 16px; bottom: 72px; z-index: 2147483647; max-width: min(420px, calc(100vw - 32px)); border-radius: 12px; border: 1px solid rgba(255,255,255,.1); background: rgba(22,22,27,.98); color: #f4f4f5; box-shadow: 0 16px 40px -8px rgba(0,0,0,.5); padding: 11px 14px; font: 12px/1.5 'Pretendard', ui-sans-serif, system-ui, sans-serif; animation: cct-pop .18s ease-out; }
      [data-cct-sidebar-item] { user-select: none; contain: layout paint style; }
      [data-cct-sidebar-item] [data-cct-sidebar-count] { min-width: 18px; height: 18px; padding: 0 6px; border-radius: 999px; background: var(--primary, #8b5cf6); color: var(--primary-foreground, #fff); font-size: 10.5px; line-height: 18px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }

      #cct-root[data-cct-theme="light"] #cct-backdrop { background: rgba(15,23,42,.22); }
      #cct-root[data-cct-theme="light"] #cct-panel { background: rgba(255,255,255,.98); color: #18181b; border-color: rgba(15,23,42,.10); box-shadow: 0 28px 70px -18px rgba(15,23,42,.38); }
      #cct-root[data-cct-theme="light"] .cct-head > div > span,
      #cct-root[data-cct-theme="light"] .cct-head button[data-cct-close],
      #cct-root[data-cct-theme="light"] .cct-toolbar button,
      #cct-root[data-cct-theme="light"] .cct-actions button,
      #cct-root[data-cct-theme="light"] .cct-role { background: rgba(15,23,42,.035); color: rgba(24,24,27,.72); border-color: rgba(15,23,42,.10); }
      #cct-root[data-cct-theme="light"] .cct-head button[data-cct-close]:hover,
      #cct-root[data-cct-theme="light"] .cct-toolbar button:hover,
      #cct-root[data-cct-theme="light"] .cct-actions button:hover { background: rgba(15,23,42,.075); color: #18181b; }
      #cct-root[data-cct-theme="light"] .cct-note { background: rgba(139,92,246,.08); border-color: rgba(139,92,246,.18); color: rgba(88,28,135,.88); }
      #cct-root[data-cct-theme="light"] .cct-controls input,
      #cct-root[data-cct-theme="light"] .cct-controls select { background: rgba(15,23,42,.035); color: #18181b; border-color: rgba(15,23,42,.10); }
      #cct-root[data-cct-theme="light"] .cct-controls input::placeholder,
      #cct-root[data-cct-theme="light"] .cct-status,
      #cct-root[data-cct-theme="light"] .cct-meta { color: rgba(24,24,27,.52); }
      #cct-root[data-cct-theme="light"] .cct-title { color: #18181b; }
      #cct-root[data-cct-theme="light"] .cct-preview,
      #cct-root[data-cct-theme="light"] .cct-detail pre { color: rgba(24,24,27,.74); }
      #cct-root[data-cct-theme="light"] .cct-item { background: rgba(15,23,42,.025); border-color: rgba(15,23,42,.08); }
      #cct-root[data-cct-theme="light"] .cct-item:hover { background: rgba(15,23,42,.045); border-color: rgba(15,23,42,.16); }
      #cct-root[data-cct-theme="light"] .cct-item[open] { background: rgba(139,92,246,.045); border-color: rgba(139,92,246,.28); }
      #cct-root[data-cct-theme="light"] .cct-detail { border-color: rgba(15,23,42,.08); }
      #cct-root[data-cct-theme="light"] .cct-detail pre { background: rgba(15,23,42,.055); }
      #cct-root[data-cct-theme="light"] .cct-empty { color: rgba(24,24,27,.50); }
      #cct-root[data-cct-theme="light"] .cct-warn,
      #cct-root[data-cct-theme="light"] .cct-toolbar button[data-cct-clear],
      #cct-root[data-cct-theme="light"] .cct-actions button[data-cct-action="delete"] { color: rgba(185,28,28,.92); }
      #cct-root[data-cct-theme="light"] #cct-toast { background: rgba(255,255,255,.98); color: #18181b; border-color: rgba(15,23,42,.10); box-shadow: 0 22px 60px -18px rgba(15,23,42,.38); }
      @media (max-width: 640px) { #cct-panel { inset: 10px; width: auto; max-height: none; } .cct-controls { grid-template-columns: 1fr; } }
    `;

    try {
      if (typeof GM_addStyle === 'function') GM_addStyle(css);
      else {
        const style = document.createElement('style');
        style.textContent = css;
        document.head?.appendChild(style);
      }
    } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function formatDate(ts) {
    try {
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (_) {
      return '';
    }
  }

  function shortId(id) {
    id = String(id || '');
    if (!id) return '-';
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}…${id.slice(-5)}`;
  }

  let toastTimer = 0;
  function toast(msg) {
    if (!config.toast) return;

    try {
      clearTimeout(toastTimer);
      let el = document.getElementById('cct-toast');

      if (!el) {
        el = document.createElement('div');
        el.id = 'cct-toast';
        document.documentElement.appendChild(el);
      }

      el.textContent = msg;
      toastTimer = setTimeout(() => {
        try { el.remove(); } catch (_) {}
      }, 2500);
    } catch (_) {}
  }

  function debug(...args) {
    if (!config.console) return;
    try { console.log(`[${APP.name}]`, ...args); } catch (_) {}
  }

  function registerMenu() {
    try {
      if (typeof GM_registerMenuCommand !== 'function') return;

      GM_registerMenuCommand('채팅 휴지통 열기', () => {
        openPanel();
      });

      GM_registerMenuCommand('채팅 휴지통 TXT 복사', () => {
        installUI();
        loadItems(true).then(copyAllTxt);
      });
    } catch (_) {}
  }

  function bootUI() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        installUI();
        installSidebarObserver();
        updateRouteVisibility();
        loadItems(false);
      }, { once: true });
    } else {
      installUI();
      installSidebarObserver();
      updateRouteVisibility();
      loadItems(false);
    }
  }

  function boot() {
    try {
      hookFetch();
      hookXHR();
      bootUI();
      registerMenu();

      setTimeout(() => {
        updateRouteVisibility();
        importEmergency().then(() => loadItems(false)).catch(() => {});
      }, 800);

      debug('loaded');
    } catch (err) {
      try { console.error(`[${APP.name}] boot failed`, err); } catch (_) {}
    }
  }

  boot();
})();
