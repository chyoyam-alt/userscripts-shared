// ==UserScript==
// @name         🔁 LogShift (로그 일괄 편집기)
// @namespace    crack.logshift
// @version      1.1.0
// @downloadURL  https://raw.githubusercontent.com/OWNER/REPO/main/scripts/LogShift.user.js
// @updateURL    https://raw.githubusercontent.com/OWNER/REPO/main/scripts/LogShift.user.js
// @description  크랙 채팅 로그의 문자열 일괄 치환/삭제(여러 쌍 · 조사 자동 맞춤) + HUD 턴 번호 구간 재번호 도구. 전체 로그 API 조회, 메시지별 제외, 시작/끝 앵커, 마지막 턴 계산, 백업/되돌리기 기록을 지원합니다.
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const APP = Object.freeze({
    version: '1.1.0',
    apiBase: 'https://crack-api.wrtn.ai/crack-gen/v3',
    pageSize: 300,
    hardLimit: 20000,
    patchDelayMs: 220,
    retryCount: 3,
    retryBaseDelayMs: 700,
    maxReplacePreviewItems: 120,
    backupKey: 'crack_bulk_editor:last_backup:v2', // 1.0.x 단일 백업 (처음 한 번 기록으로 옮김)
    historyKey: 'crack_bulk_editor:history:v1',
    historyPerChat: 5,
    historyTotal: 20,
    recentKey: 'crack_bulk_editor:recent_pairs:v1',
    recentMax: 8,
  });

  const ID = Object.freeze({
    launch: 'cbe-launch',
    statusText: 'cbe-status-text',
    statusExtra: 'cbe-status-extra',
    statusActions: 'cbe-status-actions',
    logToggle: 'cbe-log-toggle',
    progress: 'cbe-progress',
    turnVerify: 'cbe-turn-verify',
    turnMenu: 'cbe-turn-menu',
    overlay: 'cbe-overlay',
    panel: 'cbe-panel',
    status: 'cbe-status',
    log: 'cbe-log',
    cancel: 'cbe-cancel',
    undo: 'cbe-undo',
    undoPop: 'cbe-undo-pop',
    history: 'cbe-history',
    exportBackup: 'cbe-export-backup',

    tabReplace: 'cbe-tab-replace',
    tabTurn: 'cbe-tab-turn',
    paneReplace: 'cbe-pane-replace',
    paneTurn: 'cbe-pane-turn',

    replaceSummary: 'cbe-replace-summary',
    replacePreview: 'cbe-replace-preview',
    replaceScan: 'cbe-replace-scan',
    replaceApply: 'cbe-replace-apply',
    pairs: 'cbe-pairs',
    pairList: 'cbe-pair-list',
    addPair: 'cbe-add-pair',
    recent: 'cbe-recent',
    target: 'cbe-target',
    caseSensitive: 'cbe-case-sensitive',
    josa: 'cbe-josa',

    turnPattern: 'cbe-turn-pattern',
    turnAnalyze: 'cbe-turn-analyze',
    turnApply: 'cbe-turn-apply',
    turnStartNumber: 'cbe-turn-start-number',
    turnExpectedEnd: 'cbe-turn-expected-end',
    turnFilter: 'cbe-turn-filter',
    turnOnlyReview: 'cbe-turn-only-review',
    turnCandidateList: 'cbe-turn-candidates',
    turnSummary: 'cbe-turn-summary',
    turnRange: 'cbe-turn-range',
    turnFirstAnchor: 'cbe-turn-first-anchor',
    turnLatestAnchor: 'cbe-turn-latest-anchor',
    turnExcludeFiltered: 'cbe-turn-exclude-filtered',
    turnIncludeFiltered: 'cbe-turn-include-filtered',
  });

  const state = {
    activeTab: 'replace',
    chatId: '',
    messages: [],
    loadedChatId: '',
    loading: false,
    patching: false,
    cancelling: false,
    truncated: false,
    logLines: [],

    replace: {
      matches: [],
      lastScanSignature: '',
      skipped: new Set(),
    },

    turn: {
      candidates: [],
      patternText: '',
      target: 'assistant',
      startCandidateId: '',
      endCandidateId: '',
      startNumber: null,
      expectedEnd: null,
      plan: null,
      analyzed: false,
      openId: '',
    },
  };

  // ---------------------------------------------------------------------------
  // 아이콘 / 움직임 도우미
  // ---------------------------------------------------------------------------

  // 글자 기호 대신 선 그림(SVG)을 써서 폰트가 바뀌어도 모양이 같게 유지
  const ICON_PATHS = Object.freeze({
    swap: '<path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    save: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    log: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  });

  function icon(name, extraClass = '') {
    return `<svg class="cbe-ic ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`;
  }

  function busyLabel(text) {
    return `<span class="lbl">${text}</span><span class="spin" aria-hidden="true"></span>${icon('check', 'ok')}`;
  }

  function motionOk() {
    try {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return true;
    }
  }

  function retrigger(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function flashDone(button) {
    if (!button) return;
    button.classList.remove('is-loading');
    button.classList.add('is-done');
    setTimeout(() => button.classList.remove('is-done'), 900);
  }

  function nudgeUndo() {
    const undo = document.getElementById(ID.undo);
    if (!undo) return;
    retrigger(undo, 'nudge');
    setTimeout(() => undo.classList.remove('nudge'), 1700);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function parseChatId() {
    const match = location.pathname.match(/\/stories\/[^/]+\/episodes\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function getCookie(name) {
    const prefix = `${name}=`;
    const item = document.cookie
      .split(';')
      .map(value => value.trim())
      .find(value => value.startsWith(prefix));
    return item ? item.slice(prefix.length) : '';
  }

  function buildHeaders(hasBody = false) {
    const token = getCookie('access_token');
    const wrtnId = getCookie('__w_id');
    const headers = {
      Accept: 'application/json, text/plain, */*',
      platform: 'web',
      'wrtn-locale': 'ko-KR',
    };

    if (hasBody) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (wrtnId) headers['x-wrtn-id'] = wrtnId;

    return headers;
  }

  async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  function getApiErrorMessage(body, fallback) {
    if (!body) return fallback;
    if (typeof body === 'string') return `${fallback}: ${body.slice(0, 300)}`;

    const message =
      body?.message ||
      body?.error?.message ||
      body?.error ||
      body?.data?.message ||
      body?.result?.message;

    return message ? `${fallback}: ${String(message).slice(0, 300)}` : fallback;
  }

  async function apiFetch(url, options = {}, label = 'API 요청') {
    let lastError = null;

    for (let attempt = 0; attempt <= APP.retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          credentials: 'include',
          ...options,
        });

        const body = await parseResponseBody(response);

        if (response.ok) {
          return { response, body };
        }

        const message = getApiErrorMessage(body, `${label} 실패 (${response.status})`);
        const retriable = response.status === 429 || response.status >= 500;

        if (!retriable || attempt >= APP.retryCount) {
          const error = new Error(message);
          error.status = response.status;
          error.body = body;
          throw error;
        }

        lastError = new Error(message);
      } catch (error) {
        if (error?.status && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
        if (attempt >= APP.retryCount) throw error;
      }

      await sleep(APP.retryBaseDelayMs * (attempt + 1));
    }

    throw lastError || new Error(`${label} 실패`);
  }

  function extractMessagesPayload(body) {
    const root = body?.data ?? body ?? {};
    const messages = Array.isArray(root?.messages) ? root.messages : [];
    const nextCursor = String(root?.nextCursor ?? root?.cursor ?? '');
    return { messages, nextCursor };
  }

  function getMessageId(message) {
    return String(message?._id ?? message?.id ?? '');
  }

  function getMessageRole(message) {
    return String(message?.role ?? '').toLowerCase();
  }

  function getMessageContent(message) {
    const value = message?.content ?? message?.message ?? message?.text ?? '';
    return typeof value === 'string' ? value : '';
  }

  function getMessageCreatedAt(message) {
    return message?.createdAt ?? message?.created_at ?? message?.timestamp ?? '';
  }

  function roleLabel(role) {
    if (role === 'assistant') return 'AI';
    if (role === 'user') return 'USER';
    return role || 'UNKNOWN';
  }

  function roleMatches(role, target) {
    if (target === 'assistant') return role === 'assistant';
    if (target === 'user') return role === 'user';
    return role === 'assistant' || role === 'user';
  }

  async function fetchMessagePage(chatId, cursor = '') {
    const query = new URLSearchParams();
    query.set('limit', String(APP.pageSize));
    if (cursor) query.set('cursor', cursor);

    const url = `${APP.apiBase}/chats/${encodeURIComponent(chatId)}/messages?${query.toString()}`;
    const { body } = await apiFetch(url, {
      method: 'GET',
      headers: buildHeaders(false),
    }, '메시지 조회');

    return extractMessagesPayload(body);
  }

  async function fetchAllMessages(chatId) {
    const collected = [];
    const seenIds = new Set();
    const seenCursors = new Set();
    let cursor = '';
    let pages = 0;
    let truncated = false;

    while (true) {
      if (state.cancelling) throw new Error('사용자가 작업을 취소했습니다.');

      setStatus(`전체 로그 불러오는 중… ${collected.length.toLocaleString()}개`, 'busy');
      const page = await fetchMessagePage(chatId, cursor);
      pages += 1;

      if (!page.messages.length) break;

      for (const raw of page.messages) {
        const id = getMessageId(raw);
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        collected.push(raw);
      }

      appendLog(`조회 ${pages}페이지 · 누적 ${collected.length.toLocaleString()}개`);

      if (!page.nextCursor) break;

      if (seenCursors.has(page.nextCursor)) {
        appendLog('같은 cursor가 반복되어 조회를 중단했습니다.');
        break;
      }

      if (collected.length >= APP.hardLimit) {
        truncated = true;
        break;
      }

      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
      await sleep(180);
    }

    return {
      messages: collected.slice(0, APP.hardLimit).reverse(),
      truncated,
      pages,
    };
  }

  async function ensureMessagesLoaded(chatId, forceReload = false) {
    if (!forceReload && state.loadedChatId === chatId && state.messages.length) {
      return {
        messages: state.messages,
        truncated: state.truncated,
        cached: true,
      };
    }

    const result = await fetchAllMessages(chatId);
    state.messages = result.messages;
    state.loadedChatId = chatId;
    state.chatId = chatId;
    state.truncated = result.truncated;

    return {
      messages: state.messages,
      truncated: state.truncated,
      cached: false,
    };
  }

  async function patchMessage(chatId, messageId, content) {
    const url = `${APP.apiBase}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`;
    const { body } = await apiFetch(url, {
      method: 'PATCH',
      headers: buildHeaders(true),
      body: JSON.stringify({ message: content }),
    }, '메시지 수정');

    return body;
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    try {
      return date.toLocaleString('ko-KR');
    } catch (_) {
      return '';
    }
  }

  function truncateText(value, max = 900) {
    const text = String(value ?? '');
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n… (${(text.length - max).toLocaleString()}자 생략)`;
  }

  function compactText(value, max = 180) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max)}…`;
  }

  function setStatus(message, type = 'neutral', options = {}) {
    const el = document.getElementById(ID.status);
    const text = document.getElementById(ID.statusText);
    if (!el) return;

    const value = String(message ?? '');
    const empty = !value.trim();
    el.dataset.type = type;
    el.hidden = empty && !state.loading && !state.patching;
    if (text) {
      if (options.html) text.innerHTML = value;
      else text.textContent = value;
    }
  }

  function appendLog(message) {
    const stamp = new Date().toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    state.logLines.push(`[${stamp}] ${message}`);
    if (state.logLines.length > 240) {
      state.logLines.splice(0, state.logLines.length - 240);
    }

    const el = document.getElementById(ID.log);
    if (el) {
      el.textContent = state.logLines.join('\n');
      el.scrollTop = el.scrollHeight;
    }
  }

  // 되돌리기 기록: 채팅방마다 최근 몇 개를 쌓아 둠 (맨 앞이 가장 최근)
  function backupIdentity(backup) {
    return `${backup?.createdAt || ''}|${backup?.chatId || ''}|${backup?.type || ''}`;
  }

  function trimHistory(list) {
    const perChat = new Map();
    const out = [];

    for (const backup of list) {
      const used = perChat.get(backup.chatId) || 0;
      if (used >= APP.historyPerChat) continue;
      perChat.set(backup.chatId, used + 1);
      out.push(backup);
      if (out.length >= APP.historyTotal) break;
    }

    return out;
  }

  function readHistory() {
    let list = GM_getValue(APP.historyKey, null);
    if (!Array.isArray(list)) list = [];

    const legacy = GM_getValue(APP.backupKey, null);
    if (legacy?.chatId && Array.isArray(legacy.items) && legacy.items.length) {
      list = trimHistory([legacy, ...list]);
      try {
        GM_setValue(APP.historyKey, list);
        GM_deleteValue(APP.backupKey);
      } catch (_) {}
    }

    return list.filter(item => item?.chatId && Array.isArray(item.items) && item.items.length);
  }

  function historyForChat(chatId) {
    return readHistory().filter(item => item.chatId === chatId);
  }

  // 적용 직전에 부르는 이름은 그대로 두고, 이제는 기록 맨 앞에 쌓음
  function saveBackup(backup) {
    GM_setValue(APP.historyKey, trimHistory([backup, ...readHistory()]));
  }

  function loadBackup() {
    const chatId = parseChatId();
    return (chatId ? historyForChat(chatId)[0] : null) || null;
  }

  function removeHistoryEntries(entries) {
    const drop = new Set(entries.map(backupIdentity));
    GM_setValue(APP.historyKey, readHistory().filter(item => !drop.has(backupIdentity(item))));
  }

  function loadRecentPairs() {
    const list = GM_getValue(APP.recentKey, []);
    return Array.isArray(list)
      ? list.filter(item => item && typeof item.find === 'string' && item.find)
      : [];
  }

  function saveRecentPairs(pairs) {
    const seen = new Set();
    const list = [...pairs, ...loadRecentPairs()]
      .map(item => ({ find: String(item.find || ''), replace: String(item.replace || '') }))
      .filter(item => {
        if (!item.find) return false;
        const key = `${item.find}\u0000${item.replace}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, APP.recentMax);

    try {
      GM_setValue(APP.recentKey, list);
    } catch (_) {}
  }

  function sanitizeFilename(value) {
    return String(value || 'chat')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'chat';
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function makeBackup(type, chatId, meta, items) {
    return {
      schema: 2,
      type,
      createdAt: new Date().toISOString(),
      chatId,
      pageUrl: location.href,
      pageTitle: document.title,
      meta,
      items: items.map(item => ({
        id: item.id,
        role: item.role,
        before: item.before,
        after: item.after,
        createdAt: item.createdAt || '',
      })),
    };
  }

  function updateBackupButtons() {
    const chatId = parseChatId();
    const list = chatId ? historyForChat(chatId) : [];
    const undo = document.getElementById(ID.undo);
    const exportBtn = document.getElementById(ID.exportBackup);
    const busy = state.loading || state.patching;

    if (undo) {
      undo.disabled = busy;
      undo.title = list.length
        ? `되돌리기 기록 ${list.length.toLocaleString()}개`
        : '되돌리기 기록 (비어 있음)';
    }

    if (exportBtn) {
      exportBtn.disabled = busy || !list.length;
    }

    const pop = document.getElementById(ID.undoPop);
    if (pop && !pop.hidden) renderHistoryPop();
  }

  // 입력창 버튼: 패널을 닫아도 작업 중이면 둘레에 진행 링, 끝나면 점
  function isPanelOpen() {
    return document.getElementById(ID.overlay)?.style.display === 'flex';
  }

  function setLaunchProgress(percent) {
    const button = document.getElementById(ID.launch);
    if (!button) return;

    if (percent === null) {
      button.classList.add('cbe-indet');
    } else {
      button.classList.remove('cbe-indet');
      button.style.setProperty('--cbe-p', String(Math.round(percent)));
    }
  }

  function syncLaunchBusy() {
    const button = document.getElementById(ID.launch);
    if (!button) return;
    const busy = state.loading || state.patching;
    button.classList.toggle('cbe-busy', busy && !isPanelOpen());
  }

  function setProgress(current, total) {
    const wrap = document.getElementById(ID.progress);
    const percent = total ? Math.min(100, (current / total) * 100) : 0;
    setLaunchProgress(total ? percent : null);

    if (!wrap) return;

    if (!total) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    const bar = wrap.querySelector('i');
    if (bar) bar.style.width = `${percent}%`;
  }

  let busyButton = null;

  function setBusyUi(isBusy, sourceButton = null) {
    const lockable = [
      'input', 'select', '.cbe-btn', '.cbe-tab', '.cbe-mini-btn', '.cbe-chip',
      '.cbe-pair-del', '.cbe-flow-arrow', '.cbe-add-pair', '[data-lock]',
    ].map(selector => `#${ID.panel} ${selector}`).join(', ');

    document.querySelectorAll(lockable).forEach(el => {
      if (el.id === ID.cancel) return;
      el.disabled = isBusy;
    });

    const cancel = document.getElementById(ID.cancel);
    if (cancel) {
      cancel.disabled = !isBusy;
      cancel.style.display = isBusy ? '' : 'none';
    }

    if (isBusy) {
      busyButton = sourceButton;
      busyButton?.classList.add('is-loading');
      setLaunchProgress(null);
    } else {
      busyButton?.classList.remove('is-loading');
      busyButton = null;
      setProgress(0, 0);
      syncApplyButtons();
      updateBackupButtons();

      const launch = document.getElementById(ID.launch);
      if (launch?.classList.contains('cbe-busy') && !isPanelOpen()) {
        launch.classList.add('cbe-done');
      }
    }

    syncLaunchBusy();
  }

  function setApplyCount(button, count) {
    const badge = button?.querySelector('.cnt');
    if (!badge) return;

    const text = count ? count.toLocaleString() : '';
    if (badge.textContent === text) return;

    badge.textContent = text;
    badge.classList.remove('pop');
    if (text) retrigger(badge, 'pop');
  }

  function syncApplyButtons() {
    const replaceApply = document.getElementById(ID.replaceApply);
    const turnApply = document.getElementById(ID.turnApply);
    const included = getIncludedMatches().length;

    if (replaceApply) {
      replaceApply.disabled = state.loading || state.patching || !included;
      setApplyCount(replaceApply, included);
    }

    if (turnApply) {
      const patchCount = state.turn.plan?.patches?.length || 0;
      turnApply.disabled =
        state.loading ||
        state.patching ||
        !state.turn.analyzed ||
        !patchCount;
      setApplyCount(turnApply, state.turn.analyzed ? patchCount : 0);
    }
  }

  // ---------------------------------------------------------------------------
  // 문자열 치환/삭제 (여러 쌍 · 조사 자동 맞춤 · 메시지별 제외)
  // ---------------------------------------------------------------------------

  const HANGUL_FIRST = 0xac00;
  const HANGUL_LAST = 0xd7a3;

  function isHangulSyllable(ch) {
    if (!ch) return false;
    const code = ch.charCodeAt(0);
    return code >= HANGUL_FIRST && code <= HANGUL_LAST;
  }

  // 마지막 글자의 받침: 'none' 없음 / 'rieul' ㄹ받침 / 'other' 그 밖의 받침 / null 한글이 아님
  function finalKind(text) {
    const ch = String(text || '').slice(-1);
    if (!isHangulSyllable(ch)) return null;
    const jong = (ch.charCodeAt(0) - HANGUL_FIRST) % 28;
    if (jong === 0) return 'none';
    if (jong === 8) return 'rieul';
    return 'other';
  }

  // [받침 있을 때, 받침 없을 때, 뒤에 한글이 바로 붙으면 안 됨]
  const JOSA_FAMILIES = [
    ['이었', '였', false],
    ['이에요', '예요', true],
    ['이라고', '라고', true],
    ['이라서', '라서', true],
    ['이라도', '라도', true],
    ['이든지', '든지', true],
    ['이랑', '랑', true],
    ['이나', '나', true],
    ['이며', '며', true],
    ['이란', '란', true],
    ['이라', '라', true],
    ['이든', '든', true],
    ['이야', '야', true],
    ['이여', '여', true],
    ['은', '는', true],
    ['이', '가', true],
    ['을', '를', true],
    ['과', '와', true],
    ['아', '야', true],
  ];

  const JOSA_ENTRIES = (() => {
    const entries = [];

    for (const [batchim, plain, boundary] of JOSA_FAMILIES) {
      entries.push({ token: batchim, batchim, plain, boundary, ro: false });
      entries.push({ token: plain, batchim, plain, boundary, ro: false });
    }

    // (으)로: ㄹ받침이거나 받침이 없으면 '로', 그 밖의 받침이면 '으로'
    for (const suffix of ['서', '써', '부터', '는', '도', '만', '']) {
      entries.push({ token: `으로${suffix}`, suffix, boundary: true, ro: true });
      entries.push({ token: `로${suffix}`, suffix, boundary: true, ro: true });
    }

    // 같은 글자가 여러 갈래에 걸치면 (예: '야' = 이야/야, 아/야) 자동으로 고치지 않음
    const families = new Map();
    for (const entry of entries) {
      const key = entry.ro ? 'ro' : `${entry.batchim}/${entry.plain}`;
      if (!families.has(entry.token)) families.set(entry.token, new Set());
      families.get(entry.token).add(key);
    }
    for (const entry of entries) {
      entry.ambiguous = families.get(entry.token).size > 1;
    }

    return entries.sort((a, b) => b.token.length - a.token.length);
  })();

  function matchJosaAt(text, position) {
    for (const entry of JOSA_ENTRIES) {
      if (!text.startsWith(entry.token, position)) continue;
      if (entry.boundary && isHangulSyllable(text[position + entry.token.length])) continue;
      return entry;
    }
    return null;
  }

  function josaTarget(entry, kind) {
    if (entry.ro) return `${kind === 'other' ? '으로' : '로'}${entry.suffix}`;
    return kind === 'none' ? entry.plain : entry.batchim;
  }

  function sameJosaClass(entry, oldKind, newKind) {
    if (!oldKind) return false;
    if (entry.ro) return (oldKind === 'other') === (newKind === 'other');
    return (oldKind === 'none') === (newKind === 'none');
  }

  function readPairsFromUi() {
    return Array.from(document.querySelectorAll(`#${ID.pairs} .cbe-pair:not(.leave)`)).map(row => {
      const [findInput, replaceInput] = row.querySelectorAll('input');
      return {
        find: findInput?.value ?? '',
        replace: replaceInput?.value ?? '',
      };
    });
  }

  function getReplaceUiValues() {
    return {
      pairs: readPairsFromUi().filter(item => item.find),
      target: document.getElementById(ID.target)?.value ?? 'all',
      caseSensitive: !!document.getElementById(ID.caseSensitive)?.checked,
      josa: !!document.getElementById(ID.josa)?.checked,
    };
  }

  function makeReplaceSignature(values) {
    return JSON.stringify(values);
  }

  // 여러 쌍을 한 번에 찾음 (긴 것 먼저). 한 쌍의 결과를 다른 쌍이 또 바꾸는 일이 없음
  function compileReplace(values) {
    const lookup = new Map();

    for (const item of values.pairs) {
      if (!item.find) continue;
      const key = values.caseSensitive ? item.find : item.find.toLowerCase();
      if (!lookup.has(key)) lookup.set(key, item);
    }

    if (!lookup.size) return null;

    const sources = Array.from(lookup.values())
      .map(item => item.find)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);

    return {
      regex: new RegExp(sources.join('|'), values.caseSensitive ? 'g' : 'gi'),
      lookup,
      caseSensitive: values.caseSensitive,
      josa: values.josa,
    };
  }

  function transformText(text, compiled, withSegments = false) {
    const regex = new RegExp(compiled.regex.source, compiled.regex.flags);
    const segments = withSegments ? [] : null;
    let out = '';
    let last = 0;
    let count = 0;
    let josaCount = 0;
    let unsure = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (!match[0]) {
        regex.lastIndex += 1;
        continue;
      }

      const key = compiled.caseSensitive ? match[0] : match[0].toLowerCase();
      const item = compiled.lookup.get(key);
      if (!item) continue;

      const start = match.index;
      const end = start + match[0].length;
      const plain = text.slice(last, start);

      out += plain + item.replace;
      count += 1;
      if (segments) {
        if (plain) segments.push({ t: 'text', text: plain });
        segments.push({ t: 'hit', from: match[0], to: item.replace });
      }
      last = end;

      if (!compiled.josa || !item.replace) continue;

      const newKind = finalKind(item.replace);
      if (!newKind) continue;

      const entry = matchJosaAt(text, end);
      if (!entry) continue;

      const oldKind = finalKind(match[0]);
      const target = josaTarget(entry, newKind);
      if (sameJosaClass(entry, oldKind, newKind) || target === entry.token) continue;

      if (entry.ambiguous) {
        unsure += 1;
        out += entry.token;
        if (segments) segments.push({ t: 'unsure', text: entry.token });
      } else {
        josaCount += 1;
        out += target;
        if (segments) segments.push({ t: 'josa', from: entry.token, to: target });
      }

      last = end + entry.token.length;
      regex.lastIndex = Math.max(regex.lastIndex, last);
    }

    const rest = text.slice(last);
    out += rest;
    if (segments && rest) segments.push({ t: 'text', text: rest });

    return { after: out, count, josaCount, unsure, segments };
  }

  function scanReplaceMessages(messages, values) {
    const compiled = compileReplace(values);
    if (!compiled) return [];

    const results = [];

    for (let index = 0; index < messages.length; index++) {
      const raw = messages[index];
      const role = getMessageRole(raw);

      if (!roleMatches(role, values.target)) continue;

      const before = getMessageContent(raw);
      if (!before) continue;

      const result = transformText(before, compiled);
      if (!result.count || result.after === before) continue;

      results.push({
        index,
        id: getMessageId(raw),
        role,
        before,
        after: result.after,
        count: result.count,
        josa: result.josaCount,
        unsure: result.unsure,
        createdAt: getMessageCreatedAt(raw),
      });
    }

    return results;
  }

  function getIncludedMatches() {
    return state.replace.matches.filter(item => !state.replace.skipped.has(item.id));
  }

  function replaceEmptyHtml(title, body) {
    return `
      <div class="cbe-empty">
        <strong>${title}</strong>
        ${body}
      </div>`;
  }

  function resetReplaceScan() {
    state.replace.matches = [];
    state.replace.lastScanSignature = '';
    state.replace.skipped = new Set();

    const preview = document.getElementById(ID.replacePreview);
    const summary = document.getElementById(ID.replaceSummary);

    if (preview) {
      preview.innerHTML = replaceEmptyHtml(
        '문자열을 한꺼번에 바꿉니다',
        '찾을 내용과 바꿀 내용을 넣고 먼저 변경점을 검사하세요. 쌍을 여러 개 넣으면 한 번에 바꿔요.'
      );
    }
    if (summary) summary.innerHTML = '';
    const extra = document.getElementById(ID.statusExtra);
    if (extra) extra.innerHTML = '';

    syncApplyButtons();
  }

  function invalidateReplaceScan() {
    if (state.patching || state.loading) return;
    resetReplaceScan();
    setStatus('치환 조건이 바뀌었습니다. 다시 검사해 주세요.', 'neutral');
  }

  function buildDiffHtml(beforeText, compiled) {
    const source = truncateText(beforeText, 900);
    const { segments } = transformText(source, compiled, true);
    const unsureMark = text =>
      `<mark class="q" title="조사가 맞는지 확인해 주세요 (자동으로 고치지 않음)">${text}</mark>`;

    let before = '';
    let after = '';
    let inline = '';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (seg.t === 'text') {
        const text = escapeHtml(seg.text);
        before += text;
        after += text;
        inline += text;
        continue;
      }

      if (seg.t === 'unsure') {
        const text = escapeHtml(seg.text);
        before += text;
        after += unsureMark(text);
        inline += unsureMark(text);
        continue;
      }

      if (seg.t === 'josa') {
        // 앞의 hit 와 붙어서 처리되지 않은 경우만 여기로 옴
        const from = escapeHtml(seg.from);
        const to = escapeHtml(seg.to);
        before += `<mark class="jo">${from}</mark>`;
        after += `<mark class="j" title="조사 자동 맞춤: ${from} → ${to}">${to}</mark>`;
        inline += `<del>${from}</del><ins><u>${to}</u></ins>`;
        continue;
      }

      const from = escapeHtml(seg.from);
      const to = escapeHtml(seg.to);
      const next = segments[i + 1];

      if (next?.t === 'josa') {
        const jFrom = escapeHtml(next.from);
        const jTo = escapeHtml(next.to);
        before += `<mark>${from}</mark><mark class="jo">${jFrom}</mark>`;
        after += `${to ? `<mark class="g">${to}</mark>` : ''}<mark class="j" title="조사 자동 맞춤: ${jFrom} → ${jTo}">${jTo}</mark>`;
        inline += `<del>${from}${jFrom}</del><ins>${to}<u>${jTo}</u></ins>`;
        i += 1;
        continue;
      }

      before += `<mark>${from}</mark>`;
      after += to ? `<mark class="g">${to}</mark>` : '';
      inline += `<del>${from}</del>` + (to ? `<ins>${to}</ins>` : '');
    }

    return { before, after, inline };
  }

  function renderReplaceSummary() {
    const extra = document.getElementById(ID.statusExtra);
    const summary = document.getElementById(ID.replaceSummary);
    if (summary) summary.innerHTML = '';
    if (!extra) return;

    if (!state.replace.matches.length) {
      extra.innerHTML = '';
      return;
    }

    const included = getIncludedMatches();
    const aiCount = included.filter(item => item.role === 'assistant').length;
    const userCount = included.filter(item => item.role === 'user').length;
    const josaCount = included.reduce((sum, item) => sum + (item.josa || 0), 0);
    const unsureCount = included.reduce((sum, item) => sum + (item.unsure || 0), 0);

    extra.innerHTML =
      (aiCount ? `<span class="cbe-pill ai">AI ${aiCount.toLocaleString()}</span>` : '') +
      (userCount ? `<span class="cbe-pill user">USER ${userCount.toLocaleString()}</span>` : '') +
      (josaCount ? `<span class="cbe-pill josa" title="받침에 맞춰 조사를 바꾼 곳">조사 ${josaCount.toLocaleString()}</span>` : '') +
      (unsureCount ? `<span class="cbe-pill warn" title="조사가 애매해서 그대로 둔 곳 · 미리보기에 물결 밑줄로 표시">조사 확인 ${unsureCount.toLocaleString()}</span>` : '') +
      (state.truncated ? `<span class="cbe-pill warn" title="로그가 20,000개를 넘어 조회를 멈췄습니다">일부만 조회됨</span>` : '');
  }

  function refreshReplaceStatus() {
    const total = state.replace.matches.length;

    if (!total) {
      setStatus('변경할 메시지가 없습니다.', 'neutral');
      renderReplaceSummary();
      syncApplyButtons();
      return;
    }

    const included = getIncludedMatches();
    const spots = included.reduce((sum, item) => sum + item.count, 0);
    const skipped = total - included.length;

    if (!included.length) {
      setStatus('바꿀 메시지를 하나 이상 골라 주세요.', 'neutral');
    } else {
      setStatus(
        `메시지 <b>${included.length.toLocaleString()}개</b>에서 <b>${spots.toLocaleString()}곳</b>을 바꿉니다.` +
        (skipped ? ` <span class="cbe-dim">${skipped.toLocaleString()}개는 그대로 둬요.</span>` : ''),
        'ok',
        { html: true }
      );
    }

    renderReplaceSummary();
    syncApplyButtons();
  }

  function renderReplacePreview(matches) {
    const preview = document.getElementById(ID.replacePreview);
    if (!preview) return;

    if (!matches.length) {
      preview.innerHTML = replaceEmptyHtml(
        '바꿀 내용이 없습니다',
        '찾을 내용이나 대상을 바꿔서 다시 검사해 보세요.'
      );
      return;
    }

    const compiled = compileReplace(getReplaceUiValues());
    if (!compiled) return;

    const visible = matches.slice(0, APP.maxReplacePreviewItems);

    const html = visible.map((item, order) => {
      const diff = buildDiffHtml(item.before, compiled);
      const skipped = state.replace.skipped.has(item.id);
      const number = (item.index + 1).toLocaleString();
      const extraInfo = item.josa ? ` · 조사 ${item.josa.toLocaleString()}` : '';

      return `
        <article class="cbe-preview-item ${order === 0 ? '' : 'collapsed'} ${skipped ? 'skip' : ''}" data-id="${escapeHtml(item.id)}">
          <header>
            <label class="cbe-pick" title="이 메시지 바꾸기">
              <input type="checkbox" ${skipped ? '' : 'checked'} aria-label="#${number} 바꾸기">
              <span class="box">${icon('check')}</span>
            </label>
            <span class="cbe-role ${item.role === 'assistant' ? 'ai' : 'user'}">${escapeHtml(roleLabel(item.role))}</span>
            <b>#${number}</b>
            <span class="cbe-num">${item.count.toLocaleString()}회${extraInfo}</span>
            <span class="cbe-skip-tag">그대로 둠</span>
            <time>${escapeHtml(formatDate(item.createdAt))}</time>
            <span class="cbe-caret">${icon('chev')}</span>
          </header>
          <div class="cbe-diff">
            <section class="d-before"><div class="cbe-k">변경 전</div><pre>${diff.before}</pre></section>
            <section class="d-after"><div class="cbe-k">변경 후</div><pre>${diff.after}</pre></section>
            <section class="d-inline"><pre>${diff.inline}</pre></section>
          </div>
        </article>
      `;
    }).join('');

    const more = matches.length > visible.length
      ? `<div class="cbe-more">${visible.length.toLocaleString()}개만 미리 보여줍니다. 나머지 ${(matches.length - visible.length).toLocaleString()}개도 함께 수정됩니다.</div>`
      : '';

    preview.innerHTML = html + more;
  }

  function togglePreviewItem(item) {
    const diff = item?.querySelector('.cbe-diff');
    if (!diff || diff.classList.contains('anim')) return;

    if (!motionOk() || typeof diff.animate !== 'function') {
      item.classList.toggle('collapsed');
      return;
    }

    if (item.classList.contains('collapsed')) {
      item.classList.remove('collapsed');
      const height = diff.offsetHeight;
      diff.classList.add('anim');
      diff.animate(
        [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }],
        { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }
      ).onfinish = () => diff.classList.remove('anim');
    } else {
      const height = diff.offsetHeight;
      diff.classList.add('anim');
      item.classList.add('closing');
      diff.animate(
        [{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 170, easing: 'ease-in' }
      ).onfinish = () => {
        item.classList.add('collapsed');
        item.classList.remove('closing');
        diff.classList.remove('anim');
      };
    }
  }

  function handlePreviewPick(event) {
    const box = event.target.closest('.cbe-pick input');
    if (!box) return;

    const item = box.closest('.cbe-preview-item');
    const id = item?.dataset.id;
    if (!id) return;

    if (box.checked) state.replace.skipped.delete(id);
    else state.replace.skipped.add(id);

    item.classList.toggle('skip', !box.checked);
    if (!state.loading && !state.patching) refreshReplaceStatus();
  }

  // ---- 여러 쌍 입력 ----

  function pairRowHtml(find = '', replace = '') {
    return `
      <div class="cbe-pair">
        <div class="cbe-replace-flow">
          <label class="cbe-control-field">
            <span class="cbe-control-label">찾을 내용</span>
            <input type="text" autocomplete="off" spellcheck="false" placeholder="찾을 글자" value="${escapeHtml(find)}">
          </label>
          <button type="button" class="cbe-flow-arrow" title="두 칸 맞바꾸기" aria-label="찾을 내용과 바꿀 내용 맞바꾸기">${icon('swap')}</button>
          <label class="cbe-control-field">
            <span class="cbe-control-label">바꿀 내용</span>
            <input type="text" autocomplete="off" spellcheck="false" placeholder="비우면 삭제" value="${escapeHtml(replace)}">
          </label>
        </div>
        <button type="button" class="cbe-pair-del" title="이 쌍 지우기" aria-label="이 쌍 지우기">${icon('x')}</button>
      </div>`;
  }

  function livePairRows() {
    return Array.from(document.querySelectorAll(`#${ID.pairs} .cbe-pair:not(.leave)`));
  }

  function syncPairRows() {
    document.getElementById(ID.pairs)?.classList.toggle('single', livePairRows().length <= 1);
  }

  function addPairRow(find = '', replace = '') {
    const list = document.getElementById(ID.pairList);
    if (!list) return null;

    const template = document.createElement('template');
    template.innerHTML = pairRowHtml(find, replace).trim();
    const row = template.content.firstElementChild;
    list.appendChild(row);

    if (motionOk()) retrigger(row, 'enter');
    syncPairRows();
    return row;
  }

  function removePairRow(row) {
    if (!row) return;

    if (livePairRows().length <= 1) {
      row.querySelectorAll('input').forEach(input => { input.value = ''; });
      return;
    }

    row.classList.add('leave');
    syncPairRows();
    if (motionOk()) row.addEventListener('animationend', () => row.remove(), { once: true });
    else row.remove();
  }

  function renderRecentChips() {
    const box = document.getElementById(ID.recent);
    if (!box) return;

    const list = loadRecentPairs();
    box.hidden = !list.length;
    box.innerHTML = list.length
      ? `<span class="cbe-recent-k">최근</span>` + list.map((item, index) => `
          <button type="button" class="cbe-chip" data-recent="${index}"
                  title="${escapeHtml(item.find)} → ${escapeHtml(item.replace || '(삭제)')}">${escapeHtml(compactText(item.find, 14))} → ${escapeHtml(compactText(item.replace || '삭제', 14))}</button>`).join('')
      : '';
  }

  function handlePairsClick(event) {
    if (state.loading || state.patching) return;

    const knob = event.target.closest('.cbe-flow-arrow');
    if (knob) {
      const rotation = (Number(knob.dataset.rot) || 0) + 180;
      knob.dataset.rot = String(rotation);
      knob.style.setProperty('--rot', `${rotation}deg`);

      const [findInput, replaceInput] = knob.parentElement.querySelectorAll('input');
      if (findInput && replaceInput) {
        [findInput.value, replaceInput.value] = [replaceInput.value, findInput.value];
      }
      retrigger(knob.parentElement, 'swapped');
      invalidateReplaceScan();
      return;
    }

    const del = event.target.closest('.cbe-pair-del');
    if (del) {
      removePairRow(del.closest('.cbe-pair'));
      invalidateReplaceScan();
      return;
    }

    if (event.target.closest(`#${ID.addPair}`)) {
      addPairRow()?.querySelector('input')?.focus({ preventScroll: true });
      return;
    }

    const chip = event.target.closest('.cbe-chip');
    if (chip) {
      const item = loadRecentPairs()[Number(chip.dataset.recent)];
      if (!item) return;

      const empty = livePairRows().find(row => !row.querySelector('input')?.value.trim());
      if (empty) {
        const [findInput, replaceInput] = empty.querySelectorAll('input');
        findInput.value = item.find;
        replaceInput.value = item.replace;
        retrigger(empty.querySelector('.cbe-replace-flow'), 'swapped');
      } else {
        addPairRow(item.find, item.replace);
      }

      retrigger(chip, 'tap');
      invalidateReplaceScan();
    }
  }

  function handlePairsKeydown(event) {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    if (!event.target.closest('.cbe-pair input')) return;
    event.preventDefault();
    handleReplaceScan();
  }

  function handleOptionToggle(event) {
    const input = event.target;
    input.closest('.cbe-opt')?.classList.toggle('on', input.checked);

    // 조사 맞춤은 이미 불러온 로그로 바로 다시 계산 (다시 검사 안 눌러도 됨)
    if (input.id === ID.josa && rescanReplaceFromCache()) return;
    invalidateReplaceScan();
  }

  function rescanReplaceFromCache() {
    if (state.loading || state.patching || !state.replace.lastScanSignature) return false;

    const chatId = parseChatId();
    if (!chatId || state.loadedChatId !== chatId || !state.messages.length) return false;

    const values = getReplaceUiValues();
    const matches = scanReplaceMessages(state.messages, values);
    const ids = new Set(matches.map(item => item.id));

    state.replace.matches = matches;
    state.replace.lastScanSignature = makeReplaceSignature(values);
    state.replace.skipped = new Set([...state.replace.skipped].filter(id => ids.has(id)));

    renderReplacePreview(matches);
    refreshReplaceStatus();
    return true;
  }

  async function handleReplaceScan() {
    if (state.loading || state.patching) return;

    const button = document.getElementById(ID.replaceScan);
    const chatId = parseChatId();
    if (!chatId) {
      setStatus('크랙 채팅방 안에서 실행해 주세요.', 'error');
      return;
    }

    const values = getReplaceUiValues();
    if (!values.pairs.length) {
      setStatus('찾을 내용을 입력해 주세요.', 'error');
      document.querySelector(`#${ID.pairs} .cbe-pair input`)?.focus();
      return;
    }

    state.loading = true;
    state.cancelling = false;
    state.logLines = [];
    resetReplaceScan();
    setBusyUi(true, button);
    appendLog(`치환 검사 시작 · ${values.pairs.length}쌍 · 조사 맞춤 ${values.josa ? '켬' : '끔'}`);

    let succeeded = false;

    try {
      const loaded = await ensureMessagesLoaded(chatId);
      const matches = scanReplaceMessages(loaded.messages, values);

      state.replace.matches = matches;
      state.replace.lastScanSignature = makeReplaceSignature(values);

      renderReplacePreview(matches);
      refreshReplaceStatus();

      const occurrences = matches.reduce((sum, item) => sum + item.count, 0);
      const josaCount = matches.reduce((sum, item) => sum + (item.josa || 0), 0);
      appendLog(
        `치환 검사 완료 · ${matches.length.toLocaleString()}개 메시지 · ${occurrences.toLocaleString()}회` +
        (josaCount ? ` · 조사 ${josaCount.toLocaleString()}곳` : '')
      );
      succeeded = true;
    } catch (error) {
      const cancelled = state.cancelling || /취소/.test(String(error?.message || ''));
      setStatus(
        cancelled ? '검사를 취소했습니다.' : `검사 실패: ${error.message || error}`,
        cancelled ? 'neutral' : 'error'
      );
      appendLog(cancelled ? '검사 취소' : `검사 실패 · ${error.message || error}`);
    } finally {
      state.loading = false;
      state.cancelling = false;
      setBusyUi(false);
      if (succeeded) {
        flashDone(button);
        retrigger(document.getElementById(ID.replacePreview), 'fresh');
      }
    }
  }

  async function handleReplaceApply() {
    const included = getIncludedMatches();
    if (state.loading || state.patching || !included.length) return;

    const chatId = parseChatId();
    if (!chatId || chatId !== state.loadedChatId) {
      setStatus('검사한 채팅방과 현재 채팅방이 다릅니다. 다시 검사해 주세요.', 'error');
      return;
    }

    const values = getReplaceUiValues();

    if (makeReplaceSignature(values) !== state.replace.lastScanSignature) {
      setStatus('검색 조건이 바뀌었습니다. 다시 검사해 주세요.', 'error');
      resetReplaceScan();
      return;
    }

    const totalOccurrences = included.reduce((sum, item) => sum + item.count, 0);
    const josaCount = included.reduce((sum, item) => sum + (item.josa || 0), 0);
    const skipped = state.replace.matches.length - included.length;

    const ok = confirm(
      `정말 수정할까요?\n\n` +
      `메시지 ${included.length.toLocaleString()}개\n` +
      `총 치환 ${totalOccurrences.toLocaleString()}회\n` +
      (josaCount ? `조사 자동 맞춤 ${josaCount.toLocaleString()}곳\n` : '') +
      (skipped ? `그대로 둘 메시지 ${skipped.toLocaleString()}개\n` : '') +
      `\n적용 직전에 원문 백업을 저장합니다.`
    );

    if (!ok) return;

    const backup = makeBackup('replace', chatId, values, included);

    try {
      saveBackup(backup);
    } catch (error) {
      setStatus(`백업 저장 실패: ${error.message || error}`, 'error');
      alert('안전 백업 저장에 실패해서 일괄 수정을 시작하지 않았습니다.');
      return;
    }

    saveRecentPairs(values.pairs);
    renderRecentChips();

    await runPatchItems({
      chatId,
      items: included,
      label: '치환',
      onFinish: () => {
        resetReplaceScan();
        state.loadedChatId = '';
        state.messages = [];
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 연속 번호 / HUD 턴 재번호
  // ---------------------------------------------------------------------------

  function parseTurnPattern(patternText) {
    const token = '{N}';
    const first = patternText.indexOf(token);
    const last = patternText.lastIndexOf(token);

    if (first < 0) {
      throw new Error('턴 패턴에 {N}이 필요합니다. 예: **[{N}]**');
    }

    if (first !== last) {
      throw new Error('{N}은 패턴 안에 한 번만 넣어 주세요.');
    }

    const prefix = patternText.slice(0, first);
    const suffix = patternText.slice(first + token.length);

    const regex = new RegExp(
      `${escapeRegExp(prefix)}(\\d+)${escapeRegExp(suffix)}`,
      'g'
    );

    return { patternText, prefix, suffix, regex };
  }

  function findTurnOccurrences(content, parsedPattern) {
    const results = [];
    const regex = new RegExp(parsedPattern.regex.source, parsedPattern.regex.flags);
    let match;

    while ((match = regex.exec(content)) !== null) {
      const rawNumber = match[1] || '';
      const number = Number.parseInt(rawNumber, 10);

      results.push({
        number,
        rawNumber,
        full: match[0],
        start: match.index,
        end: match.index + match[0].length,
        numberStart: match.index + match[0].indexOf(rawNumber),
        numberEnd: match.index + match[0].indexOf(rawNumber) + rawNumber.length,
      });

      if (match[0] === '') regex.lastIndex += 1;
    }

    return results;
  }

  function buildTurnCandidates(messages, patternText, target) {
    const parsedPattern = parseTurnPattern(patternText);
    const candidates = [];

    for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
      const raw = messages[messageIndex];
      const role = getMessageRole(raw);
      if (!roleMatches(role, target)) continue;

      const content = getMessageContent(raw);
      if (!content) continue;

      const occurrences = findTurnOccurrences(content, parsedPattern);
      if (!occurrences.length) continue;

      const ambiguous = occurrences.length > 1;
      const id = getMessageId(raw);

      candidates.push({
        id,
        messageIndex,
        role,
        content,
        createdAt: getMessageCreatedAt(raw),
        occurrences,
        selectedOccurrence: ambiguous ? -1 : 0,
        mode: ambiguous ? 'review' : 'include',
        ambiguous,
      });
    }

    return { candidates, parsedPattern };
  }

  function getTurnCandidateById(id) {
    return state.turn.candidates.find(item => item.id === id) || null;
  }

  function getTurnCandidatePosition(id) {
    return state.turn.candidates.findIndex(item => item.id === id);
  }

  function isTurnCandidateCounted(candidate) {
    return (
      candidate &&
      candidate.mode === 'include' &&
      candidate.selectedOccurrence >= 0 &&
      candidate.occurrences[candidate.selectedOccurrence]
    );
  }

  function preserveNumberWidth(number, rawNumber) {
    const text = String(number);
    const source = String(rawNumber || '');

    if (/^0\d+$/.test(source) && source.length > text.length) {
      return text.padStart(source.length, '0');
    }

    return text;
  }

  function replaceOccurrenceNumber(content, occurrence, expectedNumber) {
    const numberText = preserveNumberWidth(expectedNumber, occurrence.rawNumber);

    return (
      content.slice(0, occurrence.numberStart) +
      numberText +
      content.slice(occurrence.numberEnd)
    );
  }

  function inferDefaultTurnAnchors(candidates) {
    const valid = candidates.filter(isTurnCandidateCounted);
    if (!valid.length) {
      return {
        startCandidateId: '',
        endCandidateId: '',
        startNumber: null,
      };
    }

    const first = valid[0];
    const last = valid[valid.length - 1];
    const firstOccurrence = first.occurrences[first.selectedOccurrence];

    return {
      startCandidateId: first.id,
      endCandidateId: last.id,
      startNumber: firstOccurrence?.number ?? null,
    };
  }

  function computeTurnPlan() {
    const candidates = state.turn.candidates;

    if (!candidates.length) {
      state.turn.plan = null;
      return null;
    }

    const startPos = getTurnCandidatePosition(state.turn.startCandidateId);
    const endPos = getTurnCandidatePosition(state.turn.endCandidateId);
    const startNumber = Number.parseInt(String(state.turn.startNumber ?? ''), 10);

    if (startPos < 0 || endPos < 0 || startPos > endPos || !Number.isFinite(startNumber)) {
      state.turn.plan = null;
      return null;
    }

    const inRange = candidates.slice(startPos, endPos + 1);
    const counted = inRange.filter(isTurnCandidateCounted);
    const excluded = inRange.filter(item => item.mode === 'exclude');
    const review = inRange.filter(item => item.mode === 'review' || item.selectedOccurrence < 0);

    let expected = startNumber;
    const rows = [];
    const patches = [];

    for (const candidate of inRange) {
      if (!isTurnCandidateCounted(candidate)) continue;

      const occurrence = candidate.occurrences[candidate.selectedOccurrence];
      const after = replaceOccurrenceNumber(candidate.content, occurrence, expected);
      const changed = after !== candidate.content;

      const row = {
        id: candidate.id,
        role: candidate.role,
        before: candidate.content,
        after,
        createdAt: candidate.createdAt,
        messageIndex: candidate.messageIndex,
        currentNumber: occurrence.number,
        expectedNumber: expected,
        changed,
      };

      rows.push(row);
      if (changed) patches.push(row);
      expected += 1;
    }

    const lastTurn = counted.length ? startNumber + counted.length - 1 : null;
    const expectedEnd = Number.parseInt(String(state.turn.expectedEnd ?? ''), 10);
    const hasExpectedEnd = Number.isFinite(expectedEnd);

    const plan = {
      startPos,
      endPos,
      inRange,
      counted,
      excluded,
      review,
      rows,
      patches,
      startNumber,
      lastTurn,
      expectedEnd: hasExpectedEnd ? expectedEnd : null,
      endDelta: hasExpectedEnd && lastTurn !== null ? lastTurn - expectedEnd : null,
    };

    state.turn.plan = plan;
    return plan;
  }

  function resetTurnAnalysis() {
    state.turn.candidates = [];
    state.turn.patternText = '';
    state.turn.startCandidateId = '';
    state.turn.endCandidateId = '';
    state.turn.startNumber = null;
    state.turn.expectedEnd = null;
    state.turn.plan = null;
    state.turn.analyzed = false;

    const summary = document.getElementById(ID.turnSummary);
    const range = document.getElementById(ID.turnRange);
    const list = document.getElementById(ID.turnCandidateList);

    if (summary) summary.textContent = '패턴을 넣고 분석을 눌러 주세요.';
    if (range) { range.hidden = true; range.innerHTML = ''; }
    if (list) {
      list.innerHTML = `
        <div class="cbe-empty">
          <strong>턴 번호를 다시 매깁니다</strong>
          숫자 자리에 {N}을 넣은 패턴을 입력하고 분석을 눌러 주세요.
        </div>`;
    }
    const verify = document.getElementById(ID.turnVerify);
    const checkLine = document.getElementById('cbe-check-line');
    const tools = document.querySelector('[data-cbe-turn-tools]');
    if (verify) verify.textContent = '';
    if (checkLine) {
      checkLine.hidden = true;
      checkLine.className = 'cbe-check off';
    }
    if (tools) tools.hidden = true;

    syncApplyButtons();
  }

  function invalidateTurnAnalysis() {
    if (state.loading || state.patching) return;

    if (state.turn.analyzed) {
      resetTurnAnalysis();
      setStatus('턴 패턴이 바뀌었습니다. 다시 분석해 주세요.', 'neutral');
    }
  }

  function syncTurnNumberInputsFromState() {
    const startInput = document.getElementById(ID.turnStartNumber);
    const expectedEndInput = document.getElementById(ID.turnExpectedEnd);

    if (startInput && state.turn.startNumber !== null) {
      startInput.value = String(state.turn.startNumber);
    }

    if (expectedEndInput) {
      expectedEndInput.value =
        state.turn.expectedEnd === null || state.turn.expectedEnd === undefined
          ? ''
          : String(state.turn.expectedEnd);
    }
  }

  function candidateDisplayNumber(candidate) {
    if (!candidate) return '?';

    if (candidate.selectedOccurrence >= 0) {
      return candidate.occurrences[candidate.selectedOccurrence]?.number ?? '?';
    }

    if (candidate.occurrences.length === 1) {
      return candidate.occurrences[0]?.number ?? '?';
    }

    return candidate.occurrences.map(item => item.number).join(' / ');
  }

  function renderTurnRange() {
    const el = document.getElementById(ID.turnRange);
    if (!el) return;

    const start = getTurnCandidateById(state.turn.startCandidateId);
    const end = getTurnCandidateById(state.turn.endCandidateId);

    if (!start || !end) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    const plan = computeTurnPlan();
    const countLabel = plan
      ? `턴 ${plan.counted.length.toLocaleString()}개 · 제외 ${plan.excluded.length.toLocaleString()}`
      : '구간';

    el.hidden = false;
    el.innerHTML = `
      <div class="cbe-end">
        <div class="k">시작</div>
        <div class="v"><span class="idx">#${(start.messageIndex + 1).toLocaleString()}</span><span class="n">${escapeHtml(candidateDisplayNumber(start))}</span></div>
        <span class="s">${escapeHtml(compactText(start.content, 90))}</span>
      </div>
      <div class="cbe-line"><span>${escapeHtml(countLabel)}</span></div>
      <div class="cbe-end right">
        <div class="k">끝</div>
        <div class="v"><span class="idx">#${(end.messageIndex + 1).toLocaleString()}</span><span class="n">${escapeHtml(candidateDisplayNumber(end))}</span></div>
        <span class="s">${escapeHtml(compactText(end.content, 90))}</span>
      </div>
    `;
  }

  function renderTurnSummary() {
    const el = document.getElementById(ID.turnSummary);
    const verify = document.getElementById(ID.turnVerify);
    const line = document.getElementById('cbe-check-line');
    if (!el) return;

    const plan = computeTurnPlan();

    if (!plan) {
      el.textContent = '시작점 · 끝점 · 시작 번호를 확인해 주세요.';
      if (verify) {
        verify.className = 'cbe-verify';
        verify.textContent = '';
      }
      if (line) {
        line.hidden = !state.turn.analyzed;
        line.className = 'cbe-check off';
      }
      syncApplyButtons();
      return;
    }

    const reviewNote = plan.review.length
      ? ` · 검토 필요 ${plan.review.length.toLocaleString()}개는 빠짐`
      : '';

    el.innerHTML =
      `<span class="cbe-num">${plan.startNumber.toLocaleString()} → ${plan.lastTurn === null ? '-' : plan.lastTurn.toLocaleString()}</span>로 다시 매김 · ` +
      `<b>${plan.patches.length.toLocaleString()}개</b> 수정${escapeHtml(reviewNote)}`;

    if (line) {
      line.hidden = false;
      line.className = plan.review.length ? 'cbe-check off' : 'cbe-check';
    }

    if (verify) {
      verify.className = 'cbe-verify';
      if (plan.expectedEnd === null) {
        verify.textContent = '';
      } else if (plan.endDelta === 0) {
        verify.innerHTML = `${icon('check')}일치`;
      } else {
        const sign = plan.endDelta > 0 ? '+' : '';
        verify.classList.add('diff');
        verify.textContent = `차이 ${sign}${plan.endDelta}`;
      }
    }

    syncApplyButtons();
  }

  function getTurnFilterValues() {
    return {
      query: (document.getElementById(ID.turnFilter)?.value ?? '').trim().toLowerCase(),
      onlyReview: !!document.getElementById(ID.turnOnlyReview)?.checked,
    };
  }

  function candidateMatchesFilter(candidate, filter) {
    if (filter.onlyReview && candidate.mode !== 'review' && !candidate.ambiguous) {
      return false;
    }

    if (!filter.query) return true;

    const nums = candidate.occurrences.map(item => String(item.number)).join(' ');
    const haystack = [
      candidate.id,
      candidate.role,
      nums,
      candidate.content,
      candidate.mode,
    ].join('\n').toLowerCase();

    return haystack.includes(filter.query);
  }

  function getFilteredTurnCandidates() {
    const filter = getTurnFilterValues();
    return state.turn.candidates.filter(item => candidateMatchesFilter(item, filter));
  }

  function renderOccurrenceChooser(candidate) {
    if (candidate.occurrences.length <= 1) return '';

    return `
      <div class="cbe-occurrences">
        <strong>이 메시지에서 패턴 ${candidate.occurrences.length}개 발견 · 실제 턴 번호를 선택</strong>
        <div>
          ${candidate.occurrences.map((occ, index) => `
            <button
              type="button"
              class="cbe-mini-btn ${candidate.selectedOccurrence === index ? 'selected' : ''}"
              data-turn-occurrence="${index}"
              data-turn-id="${escapeHtml(candidate.id)}"
            >${index + 1}. ${escapeHtml(occ.full)} → ${occ.number}</button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderTurnCandidates() {
    const el = document.getElementById(ID.turnCandidateList);
    const tools = document.querySelector('[data-cbe-turn-tools]');
    if (!el) return;

    if (tools) tools.hidden = !state.turn.analyzed;

    if (!state.turn.analyzed) {
      el.innerHTML = `
        <div class="cbe-empty">
          <strong>턴 번호를 다시 매깁니다</strong>
          숫자 자리에 {N}을 넣은 패턴을 입력하고 분석을 눌러 주세요.
        </div>`;
      return;
    }

    const filtered = getFilteredTurnCandidates();

    if (!filtered.length) {
      el.innerHTML = `
        <div class="cbe-empty">
          <strong>맞는 후보가 없습니다</strong>
          검색어를 지우거나 필터를 꺼 보세요.
        </div>`;
      return;
    }

    const planRows = new Map((state.turn.plan?.rows || []).map(row => [row.id, row]));

    el.innerHTML = filtered.map(candidate => {
      const isStart = candidate.id === state.turn.startCandidateId;
      const isEnd = candidate.id === state.turn.endCandidateId;
      const row = planRows.get(candidate.id);
      const excluded = candidate.mode === 'exclude';
      const id = escapeHtml(candidate.id);

      let move = '';
      if (excluded) {
        move = '<span class="cbe-move excl">제외됨</span>';
      } else if (candidate.mode === 'review') {
        move = '<span class="cbe-move rev">검토 필요</span>';
      } else if (row) {
        move =
          `<span class="cbe-move ${row.changed ? 'changed' : 'same'}">` +
          `<span class="from">${row.currentNumber}</span><span class="arr">→</span><span class="to">${row.expectedNumber}</span>` +
          `</span>`;
      }

      const anchors =
        (isStart ? '<span class="cbe-anchor">시작</span>' : '') +
        (isEnd ? '<span class="cbe-anchor">끝</span>' : '');

      const classes = [
        'cbe-turn-item',
        excluded ? 'excluded' : '',
        candidate.mode === 'review' ? 'review' : '',
        isStart ? 'is-start' : '',
        isEnd ? 'is-end' : '',
        state.turn.openId === candidate.id ? 'open' : '',
      ].filter(Boolean).join(' ');

      return `
        <article class="${classes}" data-id="${id}">
          <span class="cbe-idx">#${(candidate.messageIndex + 1).toLocaleString()}</span>
          <span class="cbe-text">${escapeHtml(compactText(candidate.content, 160))}</span>
          ${anchors}
          ${move}
          <span class="cbe-item-actions">
            <button type="button" class="cbe-mini-btn" data-turn-start="${id}" title="여기를 시작점으로">시작</button>
            <button type="button" class="cbe-mini-btn" data-turn-end="${id}" title="여기를 끝점으로">끝</button>
            ${
              excluded
                ? `<button type="button" class="cbe-mini-btn" data-turn-include="${id}" title="다시 포함">＋</button>`
                : `<button type="button" class="cbe-mini-btn danger-lite" data-turn-exclude="${id}" title="턴에서 제외">✕</button>`
            }
          </span>
          ${renderOccurrenceChooser(candidate)}
        </article>
      `;
    }).join('');
  }

  function recomputeAndRenderTurn() {
    if (!state.turn.analyzed) return;
    renderTurnRange();
    renderTurnSummary();
    renderTurnCandidates();
  }

  function setTurnCandidateMode(id, mode) {
    const candidate = getTurnCandidateById(id);
    if (!candidate) return;

    if (mode === 'include') {
      if (candidate.selectedOccurrence < 0) {
        if (candidate.occurrences.length === 1) {
          candidate.selectedOccurrence = 0;
        } else {
          candidate.mode = 'review';
          setStatus('패턴이 여러 개라 실제 턴 번호를 먼저 선택해 주세요.', 'warn');
          recomputeAndRenderTurn();
          return;
        }
      }
      candidate.mode = 'include';
    } else if (mode === 'exclude') {
      candidate.mode = 'exclude';
    }

    recomputeAndRenderTurn();
  }

  function chooseTurnOccurrence(id, occurrenceIndex) {
    const candidate = getTurnCandidateById(id);
    if (!candidate) return;

    if (!candidate.occurrences[occurrenceIndex]) return;

    candidate.selectedOccurrence = occurrenceIndex;
    candidate.mode = 'include';

    if (candidate.id === state.turn.startCandidateId) {
      const occurrence = candidate.occurrences[occurrenceIndex];
      if (occurrence && state.turn.startNumber === null) {
        state.turn.startNumber = occurrence.number;
        syncTurnNumberInputsFromState();
      }
    }

    recomputeAndRenderTurn();
  }

  function setTurnStartAnchor(id) {
    const pos = getTurnCandidatePosition(id);
    if (pos < 0) return;

    const endPos = getTurnCandidatePosition(state.turn.endCandidateId);
    if (endPos >= 0 && pos > endPos) {
      state.turn.endCandidateId = id;
    }

    state.turn.startCandidateId = id;

    const candidate = getTurnCandidateById(id);
    if (candidate && candidate.selectedOccurrence >= 0) {
      const occurrence = candidate.occurrences[candidate.selectedOccurrence];
      if (occurrence) {
        state.turn.startNumber = occurrence.number;
        syncTurnNumberInputsFromState();
      }
    }

    recomputeAndRenderTurn();
  }

  function setTurnEndAnchor(id) {
    const pos = getTurnCandidatePosition(id);
    if (pos < 0) return;

    const startPos = getTurnCandidatePosition(state.turn.startCandidateId);
    if (startPos >= 0 && pos < startPos) {
      state.turn.startCandidateId = id;
    }

    state.turn.endCandidateId = id;
    recomputeAndRenderTurn();
  }

  function handleBulkTurnCandidateMode(mode) {
    if (!state.turn.analyzed) return;

    const filtered = getFilteredTurnCandidates();
    if (!filtered.length) return;

    const ok = confirm(
      `현재 검색 결과 ${filtered.length.toLocaleString()}개를 모두 ` +
      `${mode === 'exclude' ? '턴 카운터에서 제외' : '카운트 포함'}할까요?`
    );

    if (!ok) return;

    for (const candidate of filtered) {
      if (mode === 'exclude') {
        candidate.mode = 'exclude';
      } else {
        if (candidate.selectedOccurrence >= 0 || candidate.occurrences.length === 1) {
          if (candidate.selectedOccurrence < 0) candidate.selectedOccurrence = 0;
          candidate.mode = 'include';
        }
      }
    }

    recomputeAndRenderTurn();
  }

  async function handleTurnAnalyze() {
    if (state.loading || state.patching) return;

    const chatId = parseChatId();
    if (!chatId) {
      setStatus('크랙 채팅방 안에서 실행해 주세요.', 'error');
      return;
    }

    const patternText = (document.getElementById(ID.turnPattern)?.value ?? '').trim();
    const target = 'assistant';

    if (!patternText) {
      setStatus('턴 패턴을 입력해 주세요. 예: **[{N}]**', 'error');
      document.getElementById(ID.turnPattern)?.focus();
      return;
    }

    try {
      parseTurnPattern(patternText);
    } catch (error) {
      setStatus(error.message || String(error), 'error');
      return;
    }

    state.loading = true;
    state.cancelling = false;
    state.logLines = [];
    setBusyUi(true, document.getElementById(ID.turnAnalyze));
    appendLog(`턴 번호 분석 시작 · 패턴=${patternText}`);

    try {
      const loaded = await ensureMessagesLoaded(chatId);
      const built = buildTurnCandidates(loaded.messages, patternText, target);

      state.turn.candidates = built.candidates;
      state.turn.patternText = patternText;
      state.turn.target = target;
      state.turn.expectedEnd = null;
      state.turn.analyzed = true;

      const defaults = inferDefaultTurnAnchors(built.candidates);
      state.turn.startCandidateId = defaults.startCandidateId;
      state.turn.endCandidateId = defaults.endCandidateId;
      state.turn.startNumber = defaults.startNumber;

      syncTurnNumberInputsFromState();

      const ambiguousCount = built.candidates.filter(item => item.ambiguous).length;

      if (!built.candidates.length) {
        state.turn.plan = null;
        renderTurnRange();
        renderTurnSummary();
        renderTurnCandidates();
        setStatus('해당 패턴을 가진 메시지를 찾지 못했습니다.', 'neutral');
      } else {
        recomputeAndRenderTurn();
        setStatus(
          `턴 후보 ${built.candidates.length.toLocaleString()}개를 찾았습니다.` +
          (ambiguousCount ? ` · 다중 패턴 ${ambiguousCount.toLocaleString()}개는 검토 필요로 제외했습니다.` : ''),
          ambiguousCount ? 'warn' : 'ok'
        );
      }

      appendLog(
        `턴 분석 완료 · 후보 ${built.candidates.length.toLocaleString()}개 · 다중 패턴 ${ambiguousCount.toLocaleString()}개`
      );
    } catch (error) {
      const cancelled = state.cancelling || /취소/.test(String(error?.message || ''));
      setStatus(
        cancelled ? '분석을 취소했습니다.' : `분석 실패: ${error.message || error}`,
        cancelled ? 'neutral' : 'error'
      );
      appendLog(cancelled ? '분석 취소' : `분석 실패 · ${error.message || error}`);
    } finally {
      state.loading = false;
      state.cancelling = false;
      setBusyUi(false);
      if (state.turn.analyzed) {
        flashDone(document.getElementById(ID.turnAnalyze));
        retrigger(document.getElementById(ID.turnCandidateList), 'fresh');
      }
    }
  }

  function handleTurnStartNumberInput() {
    if (!state.turn.analyzed) return;

    const raw = document.getElementById(ID.turnStartNumber)?.value ?? '';
    const parsed = Number.parseInt(raw, 10);
    state.turn.startNumber = Number.isFinite(parsed) ? parsed : null;
    recomputeAndRenderTurn();
  }

  function handleTurnExpectedEndInput() {
    if (!state.turn.analyzed) return;

    const raw = document.getElementById(ID.turnExpectedEnd)?.value ?? '';
    const parsed = Number.parseInt(raw, 10);
    state.turn.expectedEnd = raw.trim() && Number.isFinite(parsed) ? parsed : null;
    recomputeAndRenderTurn();
  }

  function handleTurnCandidateListClick(event) {
    const target = event.target.closest('button');

    // 모바일: 행을 톡 누르면 시작/끝/제외 버튼이 나옴
    if (!target) {
      const row = event.target.closest('.cbe-turn-item');
      const id = row?.dataset.id;
      if (!id) return;

      state.turn.openId = state.turn.openId === id ? '' : id;
      document
        .querySelectorAll(`#${ID.turnCandidateList} .cbe-turn-item.open`)
        .forEach(el => { if (el !== row) el.classList.remove('open'); });
      row.classList.toggle('open', state.turn.openId === id);
      return;
    }

    const startId = target.dataset.turnStart;
    const endId = target.dataset.turnEnd;
    const excludeId = target.dataset.turnExclude;
    const includeId = target.dataset.turnInclude;
    const occurrenceId = target.dataset.turnId;
    const occurrenceIndex = target.dataset.turnOccurrence;

    if (startId) {
      setTurnStartAnchor(startId);
      return;
    }

    if (endId) {
      setTurnEndAnchor(endId);
      return;
    }

    if (excludeId) {
      setTurnCandidateMode(excludeId, 'exclude');
      return;
    }

    if (includeId) {
      setTurnCandidateMode(includeId, 'include');
      return;
    }

    if (occurrenceId && occurrenceIndex !== undefined) {
      chooseTurnOccurrence(occurrenceId, Number(occurrenceIndex));
    }
  }

  function handleTurnFirstAnchor() {
    const first = state.turn.candidates.find(isTurnCandidateCounted);
    if (first) setTurnStartAnchor(first.id);
  }

  function handleTurnLatestAnchor() {
    const valid = state.turn.candidates.filter(isTurnCandidateCounted);
    const last = valid[valid.length - 1];
    if (last) setTurnEndAnchor(last.id);
  }

  async function handleTurnApply() {
    if (state.loading || state.patching || !state.turn.analyzed) return;

    const plan = computeTurnPlan();
    if (!plan || !plan.patches.length) {
      setStatus('실제로 수정할 턴 번호가 없습니다.', 'neutral');
      return;
    }

    if (plan.review.length) {
      const proceed = confirm(
        `범위 안에 “검토 필요” 후보가 ${plan.review.length.toLocaleString()}개 남아 있습니다.\n` +
        `이 메시지들은 현재 턴 카운터에서 제외된 상태입니다.\n\n` +
        `그래도 현재 계산대로 진행할까요?`
      );
      if (!proceed) return;
    }

    const chatId = parseChatId();
    if (!chatId || chatId !== state.loadedChatId) {
      setStatus('분석한 채팅방과 현재 채팅방이 다릅니다. 다시 분석해 주세요.', 'error');
      return;
    }

    const checkText =
      `턴 번호를 재배치할까요?\n\n` +
      `시작 턴: ${plan.startNumber}\n` +
      `마지막 턴: ${plan.lastTurn}\n` +
      `실제 카운트: ${plan.counted.length.toLocaleString()}개\n` +
      `턴 제외: ${plan.excluded.length.toLocaleString()}개\n` +
      `실제 PATCH: ${plan.patches.length.toLocaleString()}개\n\n` +
      `기존 번호와 이미 같은 메시지는 수정하지 않습니다.\n` +
      `적용 직전에 원문 백업을 저장합니다.`;

    if (!confirm(checkText)) return;

    const backup = makeBackup(
      'turn-renumber',
      chatId,
      {
        patternText: state.turn.patternText,
        target: state.turn.target,
        startCandidateId: state.turn.startCandidateId,
        endCandidateId: state.turn.endCandidateId,
        startNumber: plan.startNumber,
        lastTurn: plan.lastTurn,
        countedCount: plan.counted.length,
        excludedCount: plan.excluded.length,
      },
      plan.patches
    );

    try {
      saveBackup(backup);
    } catch (error) {
      setStatus(`백업 저장 실패: ${error.message || error}`, 'error');
      alert('안전 백업 저장에 실패해서 재번호 작업을 시작하지 않았습니다.');
      return;
    }

    await runPatchItems({
      chatId,
      items: plan.patches,
      label: '턴 재번호',
      onFinish: () => {
        state.loadedChatId = '';
        state.messages = [];
        state.turn.plan = null;
        state.turn.analyzed = false;
        syncApplyButtons();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 공통 PATCH / 되돌리기
  // ---------------------------------------------------------------------------

  async function runPatchItems({ chatId, items, label, onFinish }) {
    state.patching = true;
    state.cancelling = false;
    setBusyUi(true);
    updateBackupButtons();

    let success = 0;
    let failed = 0;
    const failures = [];

    appendLog(`${label} 시작 · ${items.length.toLocaleString()}개`);

    for (let i = 0; i < items.length; i++) {
      if (state.cancelling) {
        appendLog(`사용자 취소 · ${success.toLocaleString()}개 성공 후 중단`);
        break;
      }

      const item = items[i];

      setStatus(
        `${label} 중 ${i + 1} / ${items.length} · 성공 ${success} · 실패 ${failed}`,
        'busy'
      );
      setProgress(i + 1, items.length);

      try {
        await patchMessage(chatId, item.id, item.after);
        success += 1;
        appendLog(`성공 ${i + 1}/${items.length} · ${roleLabel(item.role)} · ${item.id}`);
      } catch (error) {
        failed += 1;
        failures.push({
          id: item.id,
          role: item.role,
          status: error?.status ?? null,
          error: String(error?.message || error),
        });

        appendLog(
          `실패 ${i + 1}/${items.length} · ${roleLabel(item.role)} · ${item.id} · ${error.message || error}`
        );
      }

      if (i < items.length - 1) {
        await sleep(APP.patchDelayMs);
      }
    }

    const wasCancelled = state.cancelling;

    state.patching = false;
    state.cancelling = false;
    setBusyUi(false);
    updateBackupButtons();

    if (failed) {
      console.warn(`[LogShift] ${label} failures:`, failures);
    }

    if (wasCancelled) {
      setStatus(
        `${label} 중단 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 되돌리기 기록에서 되돌릴 수 있습니다.`,
        'neutral'
      );
    } else if (failed) {
      setStatus(
        `${label} 완료 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 작업 로그/콘솔을 확인하세요.`,
        'warn'
      );
    } else {
      setStatus(
        `${label} 완료 · <b>${success.toLocaleString()}개</b> 메시지를 고쳤어요. 새로고침하면 화면에도 반영돼요.`,
        'ok',
        { html: true }
      );
    }

    if (success) nudgeUndo();

    appendLog(`${label} 종료 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()}`);

    if (typeof onFinish === 'function') onFinish();
    syncApplyButtons();
  }

  function historyTypeLabel(type) {
    if (type === 'replace') return '문자열 치환';
    if (type === 'turn-renumber') return '턴 재번호';
    return type || '작업';
  }

  function historySummary(backup) {
    const count = `${backup.items.length.toLocaleString()}개`;

    if (backup.type === 'replace') {
      const meta = backup.meta || {};
      const pairs = Array.isArray(meta.pairs)
        ? meta.pairs
        : (meta.findText ? [{ find: meta.findText, replace: meta.replacement }] : []);
      const first = pairs[0];
      const label = first
        ? `${compactText(first.find, 16)} → ${compactText(first.replace || '(삭제)', 16)}` +
          (pairs.length > 1 ? ` 외 ${pairs.length - 1}쌍` : '')
        : '치환';
      return `${label} · ${count}`;
    }

    if (backup.type === 'turn-renumber') {
      return `${backup.meta?.startNumber ?? '?'} → ${backup.meta?.lastTurn ?? '?'} · ${count}`;
    }

    return count;
  }

  function historyTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const hm = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diff = Math.round((today - day) / 86400000);

    if (diff === 0) return `오늘 ${hm}`;
    if (diff === 1) return `어제 ${hm}`;
    return `${date.getMonth() + 1}.${date.getDate()} ${hm}`;
  }

  function renderHistoryPop() {
    const listEl = document.getElementById(ID.history);
    if (!listEl) return;

    const chatId = parseChatId();
    const list = chatId ? historyForChat(chatId) : [];
    const busy = state.loading || state.patching;

    listEl.innerHTML = list.map((backup, index) => `
      <li>
        <div>
          <b>${escapeHtml(historyTypeLabel(backup.type))}</b>
          <span>${escapeHtml(historySummary(backup))}</span>
          <time>${escapeHtml(historyTime(backup.createdAt))}</time>
        </div>
        <button type="button" class="cbe-mini-btn" data-undo-to="${index}" ${busy ? 'disabled' : ''}>${index === 0 ? '되돌리기' : '여기까지'}</button>
      </li>`).join('');

    const empty = document.getElementById('cbe-history-empty');
    const note = document.getElementById('cbe-history-note');
    if (empty) empty.hidden = list.length > 0;
    if (note) note.hidden = list.length < 2;
  }

  function toggleHistoryPop(force) {
    const pop = document.getElementById(ID.undoPop);
    const undo = document.getElementById(ID.undo);
    if (!pop) return;

    const open = typeof force === 'boolean' ? force : pop.hidden;
    if (open) renderHistoryPop();
    pop.hidden = !open;
    undo?.classList.toggle('on', open);
    undo?.setAttribute('aria-expanded', String(open));
  }

  function handleHistoryClick(event) {
    const button = event.target.closest('[data-undo-to]');
    if (!button) return;
    handleUndoTo(Number(button.dataset.undoTo));
  }

  // index 0 = 가장 최근 작업. index 가 크면 그보다 나중 작업까지 한꺼번에 되돌림
  async function handleUndoTo(index = 0) {
    if (state.loading || state.patching) return;

    const chatId = parseChatId();
    if (!chatId) {
      setStatus('크랙 채팅방 안에서 실행해 주세요.', 'error');
      return;
    }

    const entries = historyForChat(chatId).slice(0, index + 1);
    if (!entries.length) {
      setStatus('되돌릴 기록이 없습니다.', 'error');
      return;
    }

    // 같은 메시지를 여러 번 고쳤으면 가장 오래된 기록의 원문으로 돌아감
    const restore = new Map();
    for (const backup of entries) {
      for (const item of backup.items) restore.set(item.id, item);
    }
    const items = Array.from(restore.values());

    const ok = confirm(
      `작업 ${entries.length.toLocaleString()}개를 되돌릴까요?\n\n` +
      entries.map(backup => `· ${historyTypeLabel(backup.type)} (${historySummary(backup)})`).join('\n') +
      `\n\n메시지 ${items.length.toLocaleString()}개를 그 전 원문으로 복원합니다.`
    );

    if (!ok) return;

    toggleHistoryPop(false);

    state.patching = true;
    state.cancelling = false;
    state.logLines = [];
    setBusyUi(true);
    appendLog(`되돌리기 시작 · 작업 ${entries.length}개 · 메시지 ${items.length.toLocaleString()}개`);

    let success = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < items.length; i++) {
      if (state.cancelling) break;

      const item = items[i];

      setStatus(
        `되돌리는 중 ${i + 1} / ${items.length} · 성공 ${success} · 실패 ${failed}`,
        'busy'
      );
      setProgress(i + 1, items.length);

      try {
        await patchMessage(chatId, item.id, item.before);
        success += 1;
        appendLog(`복원 성공 ${i + 1}/${items.length} · ${roleLabel(item.role)} · ${item.id}`);
      } catch (error) {
        failed += 1;
        failures.push({
          id: item.id,
          role: item.role,
          status: error?.status ?? null,
          error: String(error?.message || error),
        });

        appendLog(
          `복원 실패 ${i + 1}/${items.length} · ${roleLabel(item.role)} · ${item.id} · ${error.message || error}`
        );
      }

      if (i < items.length - 1) {
        await sleep(APP.patchDelayMs);
      }
    }

    const wasCancelled = state.cancelling;

    state.patching = false;
    state.cancelling = false;

    if (!wasCancelled && failed === 0) {
      try {
        removeHistoryEntries(entries);
      } catch (_) {}
      setStatus(
        `되돌리기 완료 · 작업 ${entries.length.toLocaleString()}개, 메시지 <b>${success.toLocaleString()}개</b>를 원래대로 돌렸어요.`,
        'ok',
        { html: true }
      );
      appendLog(`되돌리기 완료 · ${success.toLocaleString()}개`);
    } else if (wasCancelled) {
      setStatus(
        `되돌리기 중단 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 기록은 남겨 뒀어요.`,
        'neutral'
      );
    } else {
      setStatus(
        `되돌리기 일부 실패 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 기록은 남겨 뒀어요.`,
        'warn'
      );
      console.warn('[LogShift] UNDO failures:', failures);
    }

    setBusyUi(false);
    state.loadedChatId = '';
    state.messages = [];
    resetReplaceScan();
    resetTurnAnalysis();
    updateBackupButtons();
  }

  function handleExportBackup() {
    const backup = loadBackup();

    if (!backup?.chatId || !Array.isArray(backup.items) || !backup.items.length) {
      setStatus('내보낼 백업이 없습니다.', 'error');
      return;
    }

    const stamp = String(backup.createdAt || new Date().toISOString()).replace(/[:.]/g, '-');
    const filename =
      `crack-log-backup_${sanitizeFilename(backup.pageTitle)}_${sanitizeFilename(backup.type)}_${stamp}.json`;

    downloadJson(backup, filename);
    setStatus('가장 최근 백업 JSON을 저장했습니다.', 'ok');
  }

  function handleCancel() {
    if (!state.loading && !state.patching) return;
    state.cancelling = true;
    setStatus('현재 요청이 끝나는 지점에서 중단합니다…', 'neutral');
    appendLog('중단 요청');
  }

  // ---------------------------------------------------------------------------
  // 탭 / 패널
  // ---------------------------------------------------------------------------

  function moveTabInk(instant = false) {
    const ink = document.querySelector(`#${ID.panel} .cbe-tab-ink`);
    const active = document.querySelector(`#${ID.panel} .cbe-tab.active`);
    if (!ink || !active) return;

    if (instant || !motionOk()) ink.style.transition = 'none';
    ink.style.left = `${active.offsetLeft}px`;
    ink.style.width = `${active.offsetWidth}px`;
    if (instant || !motionOk()) {
      void ink.offsetWidth;
      ink.style.transition = '';
    }
  }

  function switchTab(tab) {
    state.activeTab = tab === 'turn' ? 'turn' : 'replace';
    const isReplace = state.activeTab === 'replace';

    const replaceTab = document.getElementById(ID.tabReplace);
    const turnTab = document.getElementById(ID.tabTurn);
    replaceTab?.classList.toggle('active', isReplace);
    turnTab?.classList.toggle('active', !isReplace);
    replaceTab?.setAttribute('aria-selected', String(isReplace));
    turnTab?.setAttribute('aria-selected', String(!isReplace));

    const replacePane = document.getElementById(ID.paneReplace);
    const turnPane = document.getElementById(ID.paneTurn);
    if (replacePane) replacePane.hidden = !isReplace;
    if (turnPane) turnPane.hidden = isReplace;

    const replaceApply = document.getElementById(ID.replaceApply);
    const turnApply = document.getElementById(ID.turnApply);
    if (replaceApply) replaceApply.hidden = !isReplace;
    if (turnApply) turnApply.hidden = isReplace;

    const extra = document.getElementById(ID.statusExtra);
    if (!isReplace && extra) extra.innerHTML = '';

    const foot = document.getElementById('cbe-foot-left');
    if (foot) {
      foot.textContent = isReplace
        ? '적용 전 원문 자동 백업 · 되돌리기 기록 보관'
        : 'AI 메시지만 셉니다 · 적용 전 원문 자동 백업';
    }

    if (isReplace && state.replace.matches.length) {
      refreshReplaceStatus();
    } else if (!isReplace && state.turn.analyzed) {
      const ambiguousCount = state.turn.candidates.filter(item => item.ambiguous).length;
      setStatus(
        `턴 후보 ${state.turn.candidates.length.toLocaleString()}개를 찾았습니다.` +
        (ambiguousCount ? ` · 다중 패턴 ${ambiguousCount.toLocaleString()}개는 검토 필요입니다.` : ''),
        ambiguousCount ? 'warn' : 'ok'
      );
      renderTurnSummary();
    } else {
      setStatus('');
    }

    moveTabInk();
  }

  let cbeThemeObserver = null;
  let cbeThemeSyncTimer = 0;

  function detectCbeTheme() {
    const html = document.documentElement;
    const body = document.body;

    // 1순위: 크랙/확프가 명시적으로 박아둔 현재 테마 속성
    const directHints = [
      html.getAttribute('data-theme'),
      body?.getAttribute('data-theme'),
      html.getAttribute('data-cmu-theme'),
      body?.getAttribute('data-cmu-theme'),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/\bdark\b|theme-dark|dark-mode|color-scheme-dark/.test(directHints)) {
      return 'dark';
    }
    if (/\blight\b|theme-light|light-mode|color-scheme-light/.test(directHints)) {
      return 'light';
    }

    // 2순위: html/body 클래스와 명시적 color-scheme
    const structuralHints = [
      html.className,
      body?.className,
      html.style.colorScheme,
      body?.style?.colorScheme,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (/\bdark\b|theme-dark|dark-mode|color-scheme-dark/.test(structuralHints)) {
      return 'dark';
    }
    if (/\blight\b|theme-light|light-mode|color-scheme-light/.test(structuralHints)) {
      return 'light';
    }

    // 3순위: 실제 페이지 배경색으로 한 번 더 판정
    const parseRgb = value => {
      const m = String(value || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    };

    const luminance = rgb => {
      if (!rgb) return null;
      const [r, g, b] = rgb.map(v => v / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    try {
      const samples = [
        getComputedStyle(body || html).backgroundColor,
        getComputedStyle(html).backgroundColor,
      ];

      for (const sample of samples) {
        const lum = luminance(parseRgb(sample));
        if (lum === null) continue;
        if (lum < 0.35) return 'dark';
        if (lum > 0.65) return 'light';
      }
    } catch (_) {}

    // 애매하면 크랙 채팅 기본 사용감에 맞춰 다크 우선
    return 'dark';
  }

  function syncCbeTheme() {
    const theme = detectCbeTheme();
    const panel = document.getElementById(ID.panel);
    const overlay = document.getElementById(ID.overlay);

    if (panel) panel.dataset.cbeTheme = theme;
    if (overlay) overlay.dataset.cbeTheme = theme;
  }

  function scheduleCbeThemeSync(delay = 0) {
    clearTimeout(cbeThemeSyncTimer);
    cbeThemeSyncTimer = window.setTimeout(
      syncCbeTheme,
      Math.max(0, Number(delay) || 0)
    );
  }

  function ensureCbeThemeObserver() {
    if (cbeThemeObserver) return;

    const html = document.documentElement;
    const body = document.body;
    const targets = [html, body].filter(Boolean);

    cbeThemeObserver = new MutationObserver(() => {
      scheduleCbeThemeSync(0);
    });

    for (const target of targets) {
      cbeThemeObserver.observe(target, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-cmu-theme', 'class', 'style'],
      });
    }
  }

  let closeTimer = 0;

  function closePanel() {
    if (state.loading || state.patching) {
      const ok = confirm('작업 중입니다. 패널만 닫아도 작업은 계속되고, 입력창 버튼에 진행 상황이 보여요. 닫을까요?');
      if (!ok) return;
    }

    toggleHistoryPop(false);

    const overlay = document.getElementById(ID.overlay);
    if (!overlay || overlay.style.display !== 'flex') return;

    const finish = () => {
      overlay.classList.remove('cbe-closing');
      overlay.style.display = 'none';
      syncLaunchBusy();
    };

    clearTimeout(closeTimer);
    if (motionOk()) {
      overlay.classList.add('cbe-closing');
      closeTimer = window.setTimeout(finish, 160);
    } else {
      finish();
    }
  }

  function openPanel() {
    const chatId = parseChatId();

    if (!chatId) {
      alert('크랙 채팅방 안에서만 사용할 수 있습니다.');
      return;
    }

    ensureUi();
    syncCbeTheme();

    clearTimeout(closeTimer);
    const overlay = document.getElementById(ID.overlay);
    if (overlay) {
      overlay.classList.remove('cbe-closing');
      overlay.style.display = 'flex';
    }

    const launch = document.getElementById(ID.launch);
    launch?.classList.remove('cbe-done');
    syncLaunchBusy();

    if (state.loadedChatId && state.loadedChatId !== chatId && !state.patching && !state.loading) {
      state.loadedChatId = '';
      state.messages = [];
      resetReplaceScan();
      resetTurnAnalysis();
      state.logLines = [];
      const log = document.getElementById(ID.log);
      if (log) log.textContent = '';
    }

    switchTab(state.activeTab);
    updateBackupButtons();
    renderRecentChips();
    requestAnimationFrame(() => moveTabInk(true));
  }

  // ---------------------------------------------------------------------------
  // CSS / UI
  // ---------------------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById('cbe-style')) return;

    const style = document.createElement('style');
    style.id = 'cbe-style';
    style.textContent = `
      /* ---------- 입력창 버튼 ---------- */
      #cbe-launch.cbe-native-toolbar-btn {
        position: relative; pointer-events: auto !important; touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent; color: #ff4432 !important;
      }
      #cbe-launch.cbe-native-toolbar-btn .cbe-launch-icon {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        width: 15px !important; height: 15px !important; pointer-events: none !important;
      }
      #cbe-launch.cbe-native-toolbar-btn svg {
        width: 15px !important; height: 15px !important;
        fill: none !important; stroke: currentColor !important; stroke-width: 2.1 !important;
      }
      #cbe-launch::before {
        content: ""; position: absolute; inset: -2px; border-radius: 999px; pointer-events: none;
        background: conic-gradient(#ff4432 calc(var(--cbe-p, 0) * 1%), rgba(255,68,50,.18) 0);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
        mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
        opacity: 0; transition: opacity .2s;
      }
      #cbe-launch.cbe-busy::before { opacity: 1; }
      #cbe-launch.cbe-busy.cbe-indet::before {
        background: conic-gradient(#ff4432 0 28%, rgba(255,68,50,.18) 0);
        animation: cbe-spin .9s linear infinite;
      }
      #cbe-launch::after {
        content: ""; position: absolute; top: -1px; right: -1px; width: 7px; height: 7px;
        border-radius: 50%; background: #ff4432; pointer-events: none;
        transform: scale(0); transition: transform .3s cubic-bezier(.34,1.56,.64,1);
      }
      #cbe-launch.cbe-done::after { transform: scale(1); }

      /* ---------- 바탕 ---------- */
      #cbe-overlay {
        position: fixed; inset: 0; z-index: 2147483600;
        display: none; align-items: center; justify-content: center;
        padding: 16px; background: rgba(0,0,0,.5); box-sizing: border-box;
        animation: cbe-fade .18s ease;
      }
      #cbe-overlay[data-cbe-theme="light"] { background: rgba(24,24,27,.32); }
      #cbe-overlay.cbe-closing { animation: cbe-fade-out .16s ease forwards; }
      #cbe-overlay.cbe-closing #cbe-panel { animation: cbe-panel-out .16s ease forwards; }

      /* ---------- 패널: 흑백 + 크랙 로고 빨강 하나 ---------- */
      #cbe-panel {
        --bg:#161618; --bg2:#1f1f22; --bg3:#29292d;
        --line:rgba(255,255,255,.07); --line2:rgba(255,255,255,.13);
        --fg:#f2f2f4; --dim:rgba(242,242,244,.56); --dim2:rgba(242,242,244,.34);
        --acc:#ff4432; --acc-ink:#ff7a6b; --acc-fg:#ffffff; --acc-bg:rgba(255,68,50,.15);
        --warn:#f2c14e; --warn-bg:rgba(251,191,36,.14);
        --err:#ff8b8b; --err-bg:rgba(248,113,113,.14);
        --font-ui:"Pretendard","Pretendard Variable",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
        --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        --r-panel:18px; --r-box:14px; --r-ctl:10px; --r-chip:6px;

        position: relative;
        width: min(1080px,100%); max-height: calc(100vh - 32px);
        display: flex; flex-direction: column; overflow: hidden;
        border-radius: var(--r-panel); background: var(--bg); color: var(--fg);
        border: 1px solid var(--line);
        box-shadow: 0 24px 90px rgba(0,0,0,.5);
        font-family: var(--font-ui); font-size: 13px; line-height: 1.45;
        text-align: left; letter-spacing: normal;
        animation: cbe-panel-in .24s cubic-bezier(.2,.8,.2,1);
        color-scheme: dark;
      }
      #cbe-panel[data-cbe-theme="light"] {
        --bg:#ffffff; --bg2:#f5f5f6; --bg3:#ebebed;
        --line:rgba(20,20,24,.08); --line2:rgba(20,20,24,.15);
        --fg:#1a1a1d; --dim:rgba(26,26,29,.58); --dim2:rgba(26,26,29,.38);
        --acc:#ff4432; --acc-ink:#d42d1d; --acc-fg:#ffffff; --acc-bg:rgba(255,68,50,.1);
        --warn:#a16207; --warn-bg:rgba(234,179,8,.16);
        --err:#c2313b; --err-bg:rgba(239,68,68,.1);
        box-shadow: 0 24px 70px rgba(0,0,0,.18);
        color-scheme: light;
      }

      #cbe-panel *, #cbe-panel *::before, #cbe-panel *::after { box-sizing: border-box; }
      #cbe-panel button { font-family: inherit; color: inherit; cursor: pointer; margin: 0; }
      #cbe-panel button:disabled { cursor: not-allowed; }
      #cbe-panel input, #cbe-panel select { font-family: inherit; font-size: 13px; color: var(--fg); margin: 0; }
      #cbe-panel input::placeholder { color: var(--dim2); opacity: 1; }
      #cbe-panel .cbe-ic { display: block; width: 16px; height: 16px; flex: none; }
      #cbe-panel :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
      #cbe-panel .cbe-num { font-variant-numeric: tabular-nums; }
      #cbe-panel .cbe-dim { color: var(--dim); }

      #cbe-panel pre {
        margin: 0; font: 12.5px/1.75 var(--font-ui); color: var(--fg);
        white-space: pre-wrap; overflow-wrap: anywhere;
      }
      /* 지워질 글자: 흐린 글자 + 빨간 취소선 / 새 글자: 빨간 글자 */
      #cbe-panel mark {
        background: var(--bg3); color: var(--dim); padding: 0 2px; border-radius: 3px;
        text-decoration: line-through; text-decoration-color: var(--acc); text-decoration-thickness: 2px;
      }
      #cbe-panel mark.g {
        background: var(--acc-bg); color: var(--acc-ink); font-weight: 700; text-decoration: none;
      }
      #cbe-panel mark.jo { padding: 0 2px 0 0; margin-left: -2px; }
      #cbe-panel mark.j {
        background: transparent; color: var(--acc-ink); font-weight: 700;
        padding: 0 2px 0 0; margin-left: -2px;
        text-decoration: underline dotted; text-decoration-color: var(--acc);
        text-decoration-thickness: 1.5px; text-underline-offset: 3px;
      }
      #cbe-panel mark.q {
        background: transparent; color: var(--fg); padding: 0;
        text-decoration: underline wavy; text-decoration-color: var(--warn);
        text-decoration-thickness: 1.5px; text-underline-offset: 3px;
      }
      #cbe-panel del {
        background: transparent; color: var(--dim); padding: 0 2px; border-radius: 3px;
        text-decoration: line-through; text-decoration-color: var(--acc); text-decoration-thickness: 2px;
      }
      #cbe-panel ins {
        background: var(--acc-bg); color: var(--acc-ink); padding: 0 2px; border-radius: 3px;
        font-weight: 700; text-decoration: none;
      }
      #cbe-panel ins u { text-decoration: underline dotted; text-underline-offset: 3px; }

      /* ---------- 헤더 ---------- */
      #cbe-panel .cbe-head {
        display: flex; align-items: center; gap: 2px;
        padding: 12px 12px 4px 16px; flex: 0 0 auto;
      }
      #cbe-panel .cbe-mark {
        display: inline-grid; place-items: center; flex: none;
        width: 28px; height: 28px; margin-right: 9px; border-radius: 9px;
        background: var(--acc-bg); color: var(--acc-ink);
      }
      #cbe-panel .cbe-mark .cbe-ic { width: 15px; height: 15px; stroke-width: 2.2; }
      #cbe-panel .cbe-title {
        flex: 1; min-width: 0; font-size: 14.5px; font-weight: 800; letter-spacing: -.01em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      #cbe-panel .cbe-title-ko { margin-left: 7px; font-size: 12px; font-weight: 500; letter-spacing: 0; color: var(--dim); }
      #cbe-panel .cbe-icon {
        display: inline-grid; place-items: center; flex: none;
        width: 32px; height: 32px; padding: 0; border: 0; border-radius: var(--r-ctl);
        background: transparent; color: var(--dim);
        transition: background .15s, color .15s;
      }
      #cbe-panel .cbe-icon .cbe-ic { width: 17px; height: 17px; transition: transform .28s cubic-bezier(.34,1.56,.64,1); }
      #cbe-panel .cbe-icon:hover:not(:disabled), #cbe-panel .cbe-icon.on { background: var(--bg2); color: var(--fg); }
      #cbe-panel .cbe-icon:active:not(:disabled) .cbe-ic { transform: scale(.82); }
      #cbe-panel .cbe-icon:disabled { opacity: .35; }
      @media (hover: hover) {
        #cbe-panel .cbe-icon[data-ic="undo"]:hover:not(:disabled) .cbe-ic { transform: rotate(-40deg); }
        #cbe-panel .cbe-icon[data-ic="save"]:hover:not(:disabled) .cbe-ic { transform: translateY(2px); }
        #cbe-panel .cbe-icon[data-ic="close"]:hover .cbe-ic { transform: rotate(90deg); }
      }
      #cbe-panel .cbe-icon.nudge { color: var(--acc-ink); background: var(--acc-bg); }
      #cbe-panel .cbe-icon.nudge .cbe-ic { animation: cbe-nudge .75s ease 2; }

      /* ---------- 되돌리기 기록 ---------- */
      #cbe-undo-pop {
        position: absolute; top: 50px; right: 12px; z-index: 20;
        width: 320px; max-width: calc(100% - 16px); padding: 6px;
        border: 1px solid var(--line2); border-radius: var(--r-box);
        background: var(--bg); box-shadow: 0 18px 44px rgba(0,0,0,.45);
        transform-origin: top right; animation: cbe-pop-in .18s cubic-bezier(.2,.8,.2,1);
      }
      #cbe-panel[data-cbe-theme="light"] #cbe-undo-pop { box-shadow: 0 18px 44px rgba(0,0,0,.14); }
      #cbe-undo-pop[hidden] { display: none; }
      #cbe-panel .cbe-pop-head {
        display: flex; align-items: baseline; gap: 8px;
        padding: 8px 8px 6px; font-size: 12.5px; font-weight: 800;
      }
      #cbe-panel .cbe-pop-head small { color: var(--dim2); font-size: 11px; font-weight: 600; }
      #cbe-panel .cbe-hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
      #cbe-panel .cbe-hist li { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: calc(var(--r-ctl) - 1px); }
      #cbe-panel .cbe-hist li:hover { background: var(--bg2); }
      #cbe-panel .cbe-hist li > div { flex: 1; min-width: 0; display: grid; gap: 1px; }
      #cbe-panel .cbe-hist b { font-size: 12.5px; }
      #cbe-panel .cbe-hist span { font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #cbe-panel .cbe-hist time { font-size: 11px; color: var(--dim2); }
      #cbe-panel .cbe-hist li:first-child .cbe-mini-btn { background: var(--fg); color: var(--bg); border-color: transparent; }
      #cbe-panel .cbe-hist-empty { margin: 0; padding: 14px 8px; color: var(--dim); font-size: 12px; text-align: center; }
      #cbe-panel .cbe-hist-empty[hidden], #cbe-panel .cbe-pop-note[hidden] { display: none; }
      #cbe-panel .cbe-pop-note { margin: 4px 8px 6px; color: var(--dim2); font-size: 11px; line-height: 1.5; }

      /* ---------- 탭 ---------- */
      #cbe-panel .cbe-tabs {
        position: relative; display: flex; gap: 20px; flex: 0 0 auto;
        margin: 0 16px; border-bottom: 1px solid var(--line);
      }
      #cbe-panel .cbe-tab {
        position: relative; height: 38px; padding: 0 1px; border: 0; background: transparent;
        color: var(--dim); font-size: 13px; font-weight: 700; white-space: nowrap;
        transition: color .15s, transform .2s cubic-bezier(.34,1.56,.64,1);
      }
      #cbe-panel .cbe-tab:hover:not(:disabled), #cbe-panel .cbe-tab.active { color: var(--fg); }
      #cbe-panel .cbe-tab:active:not(:disabled) { transform: scale(.95); }
      #cbe-panel .cbe-tab-ink {
        position: absolute; left: 0; bottom: -1px; width: 0; height: 2px;
        border-radius: 2px 2px 0 0; background: var(--acc); pointer-events: none;
        transition: left .26s cubic-bezier(.3,.8,.3,1), width .26s cubic-bezier(.3,.8,.3,1);
      }

      /* ---------- 상태 줄 ---------- */
      #cbe-status {
        display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; flex: 0 0 auto;
        margin: 12px 16px 0; padding: 7px 7px 7px 12px; min-height: 46px;
        border-radius: var(--r-box); background: var(--bg2); color: var(--fg);
        font-size: 12.5px; line-height: 1.45;
        transition: background-color .25s, color .25s;
      }
      #cbe-status[hidden] { display: none; }
      #cbe-status::before {
        content: ""; display: block; flex: none; width: 8px; height: 8px; margin-right: -1px;
        border-radius: 50%; background: var(--dim2);
      }
      #cbe-status[data-type="ok"]::before { background: var(--acc); box-shadow: 0 0 0 3px var(--acc-bg); }
      #cbe-status[data-type="busy"]::before {
        background: var(--acc); box-shadow: 0 0 0 3px var(--acc-bg);
        animation: cbe-pulse 1s ease-in-out infinite;
      }
      #cbe-status[data-type="warn"]::before { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-bg); }
      #cbe-status[data-type="error"] { background: var(--err-bg); color: var(--err); }
      #cbe-status[data-type="error"]::before { background: var(--err); }
      #cbe-status-text { flex: 1; min-width: 150px; }
      #cbe-status-text b { font-weight: 800; }
      #cbe-status-extra { display: inline-flex; gap: 5px; flex-wrap: wrap; }
      #cbe-status-extra:empty { display: none; }
      #cbe-status-actions { display: inline-flex; gap: 6px; flex: none; }

      #cbe-panel .cbe-pill {
        padding: 3px 8px; border-radius: 999px; white-space: nowrap;
        font-size: 10.5px; font-weight: 800; font-variant-numeric: tabular-nums;
        background: var(--bg3); color: var(--fg);
      }
      #cbe-panel .cbe-pill.ai { background: var(--fg); color: var(--bg); }
      #cbe-panel .cbe-pill.user { background: transparent; color: var(--fg); box-shadow: inset 0 0 0 1px var(--line2); }
      #cbe-panel .cbe-pill.josa { background: var(--acc-bg); color: var(--acc-ink); }
      #cbe-panel .cbe-pill.warn { background: var(--warn-bg); color: var(--warn); }

      #cbe-progress {
        flex: 0 0 auto; height: 3px; margin: 8px 16px 0;
        border-radius: 99px; background: var(--bg3); overflow: hidden;
      }
      #cbe-progress[hidden] { display: none; }
      #cbe-progress i {
        position: relative; display: block; height: 100%; width: 0; overflow: hidden;
        background: var(--acc); transition: width .12s linear;
      }
      #cbe-progress i::after {
        content: ""; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);
        animation: cbe-sheen 1.1s linear infinite;
      }

      /* ---------- 버튼 ---------- */
      #cbe-panel .cbe-btn {
        position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
        height: 36px; padding: 0 16px; border: 1px solid var(--line2); border-radius: var(--r-ctl);
        background: transparent; color: var(--fg);
        font-size: 12.5px; font-weight: 700; white-space: nowrap;
        transition: transform .24s cubic-bezier(.34,1.56,.64,1), filter .15s, background .15s, opacity .15s;
      }
      #cbe-panel .cbe-btn:hover:not(:disabled) { filter: brightness(1.08); }
      #cbe-panel .cbe-btn:active:not(:disabled) { transform: scale(.95); transition-duration: .06s; }
      @media (hover: hover) {
        #cbe-panel .cbe-btn.primary:hover:not(:disabled),
        #cbe-panel .cbe-btn.danger:hover:not(:disabled) { transform: translateY(-1px); }
      }
      #cbe-panel .cbe-btn:disabled { opacity: .38; }
      #cbe-panel .cbe-btn[hidden] { display: none; }
      #cbe-panel .cbe-btn.primary { border-color: transparent; background: var(--fg); color: var(--bg); }
      #cbe-panel .cbe-btn.danger {
        height: 34px; padding: 0 6px 0 14px; border-color: transparent;
        background: var(--acc); color: var(--acc-fg); font-size: 12.5px; font-weight: 800;
      }
      #cbe-panel .cbe-btn.danger .cnt {
        display: inline-grid; place-items: center; min-width: 24px; height: 22px; padding: 0 6px;
        border-radius: 7px; background: rgba(0,0,0,.16);
        font-size: 11.5px; font-variant-numeric: tabular-nums;
      }
      #cbe-panel[data-cbe-theme="light"] .cbe-btn.danger .cnt { background: rgba(255,255,255,.24); }
      #cbe-panel .cbe-btn.danger .cnt:empty { display: none; }
      #cbe-panel .cbe-btn .cnt.pop { animation: cbe-pop .4s cubic-bezier(.34,1.56,.64,1); }
      #cbe-panel .cbe-btn.small { height: 32px; padding: 0 12px; font-size: 12px; }
      /* 검사 버튼: 누르면 동그라미가 돌다가 체크로 */
      #cbe-panel .cbe-btn .lbl { transition: opacity .15s; }
      #cbe-panel .cbe-btn .spin, #cbe-panel .cbe-btn .ok {
        position: absolute; left: 50%; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px;
        opacity: 0; pointer-events: none;
      }
      #cbe-panel .cbe-btn .spin {
        border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent;
        transform: scale(.6); transition: opacity .15s, transform .2s;
      }
      #cbe-panel .cbe-btn .ok { stroke-width: 2.8; transform: scale(.4); transition: opacity .15s, transform .3s cubic-bezier(.34,1.56,.64,1); }
      #cbe-panel .cbe-btn.is-loading, #cbe-panel .cbe-btn.is-done { opacity: 1; }
      #cbe-panel .cbe-btn.is-loading .lbl, #cbe-panel .cbe-btn.is-done .lbl { opacity: 0; }
      #cbe-panel .cbe-btn.is-loading .spin { opacity: 1; transform: none; animation: cbe-spin .7s linear infinite; }
      #cbe-panel .cbe-btn.is-done .ok { opacity: 1; transform: none; }

      /* ---------- 본문 ---------- */
      #cbe-panel .cbe-body {
        flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
        padding: 12px 16px 16px; overscroll-behavior: contain;
      }
      #cbe-panel .cbe-pane[hidden] { display: none; }
      #cbe-panel .cbe-setup { border: 1px solid var(--line); border-radius: var(--r-box); background: var(--bg2); padding: 12px; }
      #cbe-panel .cbe-replace-setup { display: grid; gap: 10px; }
      #cbe-panel .cbe-control-field { display: block; min-width: 0; }
      #cbe-panel .cbe-control-label { display: block; margin-bottom: 6px; color: var(--dim); font-size: 11px; font-weight: 700; }
      #cbe-panel .cbe-control-field input,
      #cbe-panel .cbe-inline-select select {
        width: 100%; height: 36px; padding: 0 11px; outline: none;
        border: 1px solid var(--line2); border-radius: var(--r-ctl); background: var(--bg); color: var(--fg);
        transition: border-color .15s, box-shadow .15s;
      }
      #cbe-panel .cbe-control-field input:focus,
      #cbe-panel .cbe-inline-select select:focus,
      #cbe-panel .cbe-search:focus { border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc-bg); }

      /* 여러 쌍: 찾을 내용 | 맞바꾸기 | 바꿀 내용 을 한 줄로 */
      #cbe-pairs { display: grid; gap: 6px; }
      #cbe-panel .cbe-pairs-head {
        display: grid; grid-template-columns: 1fr 1fr; margin-right: 38px;
        color: var(--dim); font-size: 11px; font-weight: 700;
      }
      #cbe-panel .cbe-pairs-head span:first-child { padding-left: 14px; }
      #cbe-panel .cbe-pairs-head span:last-child { padding-left: 26px; }
      #cbe-pair-list { display: grid; gap: 6px; }
      #cbe-panel .cbe-pair { display: grid; grid-template-columns: minmax(0,1fr) 32px; gap: 6px; align-items: center; }
      #cbe-panel .cbe-replace-flow {
        display: grid; grid-template-columns: minmax(0,1fr) 1px minmax(0,1fr); align-items: stretch;
        border: 1px solid var(--line2); border-radius: var(--r-box); background: var(--bg2);
        overflow: hidden; transition: border-color .15s;
      }
      #cbe-panel .cbe-replace-flow:focus-within { border-color: color-mix(in srgb, var(--acc) 60%, var(--line2)); }
      #cbe-panel .cbe-replace-flow .cbe-control-field { padding: 7px 24px 7px 14px; transition: background .15s; }
      #cbe-panel .cbe-replace-flow .cbe-control-field:last-child { padding: 7px 14px 7px 26px; }
      #cbe-panel .cbe-replace-flow .cbe-control-field:focus-within { background: var(--bg3); }
      #cbe-panel .cbe-replace-flow .cbe-control-label {
        position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
      }
      #cbe-panel .cbe-replace-flow input {
        height: 28px; padding: 0; border: 0; border-radius: 0; background: transparent;
        font-size: 15px; font-weight: 600; box-shadow: none !important;
      }
      #cbe-panel .cbe-flow-arrow {
        position: relative; z-index: 1; width: 1px; padding: 0; border: 0; overflow: visible;
        background: var(--line2); color: var(--acc-fg);
      }
      #cbe-panel .cbe-flow-arrow::before {
        content: ""; position: absolute; left: 50%; top: 50%;
        width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%;
        background: var(--acc); box-shadow: 0 0 0 4px var(--bg2); transition: transform .2s;
      }
      #cbe-panel .cbe-flow-arrow:hover:not(:disabled)::before { transform: scale(1.08); }
      #cbe-panel .cbe-flow-arrow:active:not(:disabled)::before { transform: scale(.92); }
      #cbe-panel .cbe-flow-arrow:disabled { opacity: .5; }
      #cbe-panel .cbe-flow-arrow .cbe-ic {
        position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;
        stroke-width: 2.3; transform: rotate(var(--rot, 0deg));
        transition: transform .38s cubic-bezier(.3,.9,.3,1.2);
      }
      #cbe-panel .cbe-replace-flow.swapped .cbe-control-field:first-child input { animation: cbe-in-l .3s cubic-bezier(.2,.8,.2,1); }
      #cbe-panel .cbe-replace-flow.swapped .cbe-control-field:last-child input { animation: cbe-in-r .3s cubic-bezier(.2,.8,.2,1); }
      #cbe-panel .cbe-pair-del {
        display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0;
        border-radius: var(--r-ctl); background: transparent; color: var(--dim2);
        transition: background .15s, color .15s, opacity .15s;
      }
      #cbe-panel .cbe-pair-del:hover:not(:disabled) { background: var(--bg3); color: var(--fg); }
      #cbe-panel .cbe-pair-del .cbe-ic { width: 15px; height: 15px; }
      #cbe-pairs.single .cbe-pair-del { opacity: 0; pointer-events: none; }
      #cbe-panel .enter { animation: cbe-row-in .24s cubic-bezier(.2,.8,.2,1); }
      #cbe-panel .leave { animation: cbe-row-out .18s ease-in forwards; pointer-events: none; }
      #cbe-panel .cbe-pair-tools { display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: 2px; }
      #cbe-panel .cbe-add-pair {
        flex: none; display: inline-flex; align-items: center; gap: 5px;
        height: 30px; padding: 0 11px 0 8px; border: 1px dashed var(--line2); border-radius: 999px;
        background: transparent; color: var(--dim); font-size: 12px; font-weight: 700;
        transition: color .15s, border-color .15s, transform .2s cubic-bezier(.34,1.56,.64,1);
      }
      #cbe-panel .cbe-add-pair:hover:not(:disabled) { color: var(--fg); border-color: var(--dim2); }
      #cbe-panel .cbe-add-pair:active:not(:disabled) { transform: scale(.94); }
      #cbe-panel .cbe-add-pair .cbe-ic { width: 14px; height: 14px; stroke-width: 2.2; }
      #cbe-panel .cbe-recent { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      #cbe-panel .cbe-recent::-webkit-scrollbar { display: none; }
      #cbe-panel .cbe-recent[hidden] { display: none; }
      #cbe-panel .cbe-recent-k { flex: none; color: var(--dim2); font-size: 11px; font-weight: 700; }
      #cbe-panel .cbe-chip {
        flex: none; height: 28px; padding: 0 10px; border: 0; border-radius: 999px;
        background: var(--bg2); color: var(--dim); font-size: 12px; font-weight: 600; white-space: nowrap;
        transition: background .15s, color .15s;
      }
      #cbe-panel .cbe-chip:hover:not(:disabled) { background: var(--bg3); color: var(--fg); }
      #cbe-panel .cbe-chip.tap { animation: cbe-tap .25s ease; }

      #cbe-panel .cbe-replace-meta { display: flex; align-items: flex-end; gap: 10px 12px; flex-wrap: wrap; }
      #cbe-panel .cbe-inline-select { position: relative; display: block; width: 120px; }
      #cbe-panel .cbe-inline-select select { appearance: none; -webkit-appearance: none; padding-right: 30px; cursor: pointer; }
      #cbe-panel .cbe-inline-select::after {
        content: ""; position: absolute; right: 13px; bottom: 15px; width: 6px; height: 6px;
        border-right: 1.6px solid var(--dim); border-bottom: 1.6px solid var(--dim);
        transform: rotate(45deg); pointer-events: none;
      }
      #cbe-panel .cbe-setup-spacer { flex: 1; }
      /* 옵션 칩 (대소문자 / 조사) */
      #cbe-panel .cbe-opt {
        position: relative; display: inline-flex; align-items: center; gap: 6px;
        height: 34px; padding: 0 12px 0 9px; border: 1px solid var(--line2); border-radius: 999px;
        color: var(--dim); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; user-select: none;
        transition: background .15s, color .15s, border-color .15s, transform .2s cubic-bezier(.34,1.56,.64,1);
      }
      #cbe-panel .cbe-opt input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
      #cbe-panel .cbe-opt .tick {
        display: grid; place-items: center; width: 15px; height: 15px; border-radius: 50%;
        border: 1.5px solid var(--dim2); transition: background .15s, border-color .15s;
      }
      #cbe-panel .cbe-opt .tick .cbe-ic { width: 9px; height: 9px; stroke-width: 3.4; opacity: 0; transform: scale(.4); transition: opacity .15s, transform .22s cubic-bezier(.34,1.56,.64,1); }
      #cbe-panel .cbe-opt.on { background: var(--bg3); border-color: transparent; color: var(--fg); }
      #cbe-panel .cbe-opt.on .tick { background: var(--fg); border-color: var(--fg); color: var(--bg); }
      #cbe-panel .cbe-opt.on .tick .cbe-ic { opacity: 1; transform: none; }
      #cbe-panel .cbe-opt:focus-within { outline: 2px solid var(--acc); outline-offset: 2px; }
      #cbe-panel .cbe-opt:active { transform: scale(.94); }
      #cbe-panel .cbe-opt .s { display: none; }

      /* ---------- 미리보기 ---------- */
      #cbe-panel .cbe-preview-list { display: grid; gap: 7px; margin-top: 12px; min-width: 0; }
      #cbe-panel .cbe-preview-list.fresh { animation: cbe-list-in .28s ease-out; }
      #cbe-panel .cbe-empty {
        padding: 28px 16px; border: 1px dashed var(--line2); border-radius: var(--r-box);
        color: var(--dim); text-align: center; font-size: 12.5px; line-height: 1.6;
      }
      #cbe-panel .cbe-empty strong { display: block; margin-bottom: 4px; color: var(--fg); font-size: 13.5px; }
      #cbe-panel .cbe-more { padding: 12px; border-radius: var(--r-box); background: var(--bg2); color: var(--dim); text-align: center; font-size: 12px; }
      #cbe-panel .cbe-preview-item { border: 1px solid var(--line); border-radius: var(--r-box); background: var(--bg2); overflow: hidden; }
      #cbe-panel .cbe-preview-item > header {
        display: flex; align-items: center; gap: 8px; padding: 9px 12px;
        font-size: 11.5px; color: var(--dim); cursor: pointer; user-select: none;
      }
      #cbe-panel .cbe-preview-item > header b { color: var(--fg); font-size: 12px; font-variant-numeric: tabular-nums; }
      #cbe-panel .cbe-preview-item > header time { margin-left: auto; font-variant-numeric: tabular-nums; }
      #cbe-panel .cbe-caret { display: inline-grid; opacity: .6; transition: transform .2s ease; }
      #cbe-panel .cbe-caret .cbe-ic { width: 14px; height: 14px; }
      #cbe-panel .cbe-preview-item.collapsed .cbe-caret,
      #cbe-panel .cbe-preview-item.closing .cbe-caret { transform: rotate(-90deg); }
      #cbe-panel .cbe-preview-item.collapsed .cbe-diff { display: none; }
      #cbe-panel .cbe-role {
        display: inline-flex; align-items: center; height: 20px; padding: 0 7px;
        border-radius: var(--r-chip); font-size: 10px; font-weight: 800; letter-spacing: .03em;
      }
      #cbe-panel .cbe-role.ai { background: var(--fg); color: var(--bg); }
      #cbe-panel .cbe-role.user { background: transparent; color: var(--fg); box-shadow: inset 0 0 0 1px var(--line2); }
      #cbe-panel .cbe-pick { position: relative; display: grid; place-items: center; flex: none; width: 24px; height: 24px; margin: -3px -2px -3px -5px; cursor: pointer; }
      #cbe-panel .cbe-pick input { position: absolute; opacity: 0; width: 1px; height: 1px; }
      #cbe-panel .cbe-pick .box {
        display: grid; place-items: center; width: 17px; height: 17px; border-radius: 5px;
        border: 1.5px solid var(--line2); color: var(--acc-fg);
        transition: background .15s, border-color .15s, transform .22s cubic-bezier(.34,1.56,.64,1);
      }
      #cbe-panel .cbe-pick .box .cbe-ic { width: 11px; height: 11px; stroke-width: 3.2; opacity: 0; transform: scale(.4); transition: opacity .15s, transform .22s cubic-bezier(.34,1.56,.64,1); }
      #cbe-panel .cbe-pick input:checked + .box { background: var(--acc); border-color: var(--acc); }
      #cbe-panel .cbe-pick input:checked + .box .cbe-ic { opacity: 1; transform: none; }
      #cbe-panel .cbe-pick:active .box { transform: scale(.82); }
      #cbe-panel .cbe-pick input:focus-visible + .box { outline: 2px solid var(--acc); outline-offset: 2px; }
      #cbe-panel .cbe-skip-tag { display: none; padding: 1px 7px; border-radius: 999px; background: var(--bg3); color: var(--dim); font-size: 10.5px; font-weight: 700; }
      #cbe-panel .cbe-preview-item .cbe-diff { transition: opacity .2s; }
      #cbe-panel .cbe-preview-item.skip .cbe-skip-tag { display: inline; }
      #cbe-panel .cbe-preview-item.skip .cbe-num { display: none; }
      #cbe-panel .cbe-preview-item.skip > header > :not(.cbe-pick):not(.cbe-skip-tag) { opacity: .45; }
      #cbe-panel .cbe-preview-item.skip .cbe-diff { opacity: .4; }
      #cbe-panel .cbe-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border-top: 1px solid var(--line); }
      #cbe-panel .cbe-diff.anim { overflow: hidden; }
      #cbe-panel .cbe-diff > section { min-width: 0; padding: 11px 12px; background: var(--bg); }
      #cbe-panel .cbe-k { margin-bottom: 6px; color: var(--dim2); font-size: 10.5px; font-weight: 800; }
      #cbe-panel .cbe-diff pre { max-height: 160px; overflow: auto; }
      #cbe-panel .cbe-diff .d-inline { display: none; }

      /* ---------- 연속 번호 ---------- */
      #cbe-panel .cbe-turn-setup { display: grid; gap: 9px; }
      #cbe-panel .cbe-turn-primary { display: flex; align-items: flex-end; gap: 10px; }
      #cbe-panel .cbe-control-field.grow { flex: 1; }
      #cbe-panel .cbe-turn-pattern input { font-family: var(--font-mono); font-size: 12.5px; }
      #cbe-panel .cbe-turn-start { width: 110px; flex: 0 0 110px; }
      #cbe-panel .cbe-turn-hint { display: flex; flex-wrap: wrap; gap: 4px 8px; color: var(--dim); font-size: 11.5px; }
      #cbe-panel .cbe-turn-hint code { padding: 1px 5px; border-radius: 5px; background: var(--bg3); color: var(--fg); font: 11px var(--font-mono); }
      #cbe-panel .cbe-range {
        display: flex; align-items: center; margin-top: 12px; padding: 12px 14px;
        border: 1px solid var(--line); border-radius: var(--r-box); background: var(--bg2);
      }
      #cbe-panel .cbe-range[hidden] { display: none; }
      #cbe-panel .cbe-end { min-width: 0; }
      #cbe-panel .cbe-end .k { color: var(--dim2); font-size: 10.5px; font-weight: 800; }
      #cbe-panel .cbe-end .v { display: flex; align-items: baseline; gap: 7px; margin-top: 2px; font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums; }
      #cbe-panel .cbe-end .v .idx { color: var(--dim); font-size: 12px; font-weight: 700; }
      #cbe-panel .cbe-end .s { display: block; max-width: 260px; margin-top: 3px; color: var(--dim); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #cbe-panel .cbe-end.right { text-align: right; }
      #cbe-panel .cbe-end.right .v { justify-content: flex-end; }
      #cbe-panel .cbe-end.right .s { margin-left: auto; }
      #cbe-panel .cbe-line { position: relative; flex: 1; height: 0; margin: 0 16px; border-top: 1px dashed color-mix(in srgb, var(--acc) 55%, transparent); }
      #cbe-panel .cbe-line span {
        position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
        padding: 0 9px; background: var(--bg2); color: var(--acc-ink); font-size: 11px; font-weight: 700; white-space: nowrap;
      }
      #cbe-panel .cbe-check {
        display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 9px;
        padding: 7px 8px 7px 13px; border-radius: var(--r-box); background: var(--bg2);
        color: var(--dim); font-size: 12px; font-weight: 600;
      }
      #cbe-panel .cbe-check[hidden] { display: none; }
      #cbe-panel .cbe-check b { color: var(--fg); }
      #cbe-panel .cbe-check .cbe-spacer { flex: 1; }
      #cbe-panel .cbe-check label { display: inline-flex; align-items: center; gap: 6px; }
      #cbe-panel .cbe-check input {
        width: 62px; height: 28px; border: 1px solid var(--line2); border-radius: var(--r-ctl);
        background: var(--bg); color: var(--fg); text-align: center; outline: none;
        font-size: 12px; font-variant-numeric: tabular-nums;
      }
      #cbe-panel .cbe-verify {
        display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px 0 7px;
        border-radius: 999px; background: var(--acc-bg); color: var(--acc-ink); font-size: 11.5px; font-weight: 800;
      }
      #cbe-panel .cbe-verify:empty { display: none; }
      #cbe-panel .cbe-verify.diff { padding: 0 9px; background: var(--warn-bg); color: var(--warn); }
      #cbe-panel .cbe-verify .cbe-ic { width: 13px; height: 13px; stroke-width: 2.6; }
      #cbe-panel .cbe-tools { display: flex; align-items: center; gap: 7px; margin-top: 12px; }
      #cbe-panel .cbe-tools[hidden] { display: none; }
      #cbe-panel .cbe-search-wrap { position: relative; display: block; flex: 1; min-width: 0; }
      #cbe-panel .cbe-search-wrap .cbe-ic { position: absolute; left: 11px; top: 50%; width: 15px; height: 15px; margin-top: -7.5px; color: var(--dim2); pointer-events: none; }
      #cbe-panel .cbe-search {
        width: 100%; height: 34px; padding: 0 11px 0 33px; outline: none;
        border: 1px solid var(--line2); border-radius: var(--r-ctl); background: var(--bg2); color: var(--fg);
      }
      #cbe-panel .cbe-toggle {
        display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 11px;
        border: 1px solid var(--line2); border-radius: var(--r-ctl);
        color: var(--dim); font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer;
      }
      #cbe-panel .cbe-toggle input { accent-color: var(--acc); margin: 0; }
      #cbe-panel .cbe-menu { position: relative; }
      #cbe-panel .cbe-menu > summary {
        display: grid; place-items: center; width: 34px; height: 34px; list-style: none; cursor: pointer;
        border: 1px solid var(--line2); border-radius: var(--r-ctl); color: var(--dim);
      }
      #cbe-panel .cbe-menu > summary::-webkit-details-marker { display: none; }
      #cbe-panel .cbe-menu[open] > summary { background: var(--bg2); color: var(--fg); }
      #cbe-panel .cbe-menu > div {
        position: absolute; right: 0; top: 40px; z-index: 5; display: grid; gap: 2px;
        min-width: 184px; padding: 5px; border: 1px solid var(--line2); border-radius: var(--r-box);
        background: var(--bg); box-shadow: 0 14px 34px rgba(0,0,0,.3);
        animation: cbe-pop-in .16s cubic-bezier(.2,.8,.2,1);
      }
      #cbe-panel .cbe-menu > div button {
        height: 32px; padding: 0 10px; border: 0; border-radius: calc(var(--r-ctl) - 2px);
        background: transparent; color: var(--fg); font-size: 12.5px; font-weight: 600; text-align: left;
      }
      #cbe-panel .cbe-menu > div button:hover { background: var(--bg2); }
      #cbe-panel .cbe-turn-list { gap: 6px; }
      #cbe-panel .cbe-turn-item {
        display: flex; align-items: center; gap: 9px; min-width: 0; padding: 8px 10px; overflow: hidden;
        border: 1px solid var(--line); border-radius: var(--r-ctl); background: var(--bg2);
        transition: opacity .2s, border-color .2s;
      }
      #cbe-panel .cbe-turn-item.excluded { opacity: .45; }
      #cbe-panel .cbe-turn-item.review { flex-wrap: wrap; border-style: dashed; border-color: var(--line2); }
      #cbe-panel .cbe-turn-item.is-start, #cbe-panel .cbe-turn-item.is-end { border-color: color-mix(in srgb, var(--acc) 45%, transparent); }
      #cbe-panel .cbe-idx { flex: none; min-width: 40px; color: var(--dim2); font-size: 11px; font-variant-numeric: tabular-nums; }
      #cbe-panel .cbe-text { flex: 1; min-width: 0; color: var(--dim); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #cbe-panel .cbe-anchor {
        flex: none; display: inline-flex; align-items: center; height: 19px; padding: 0 6px;
        border-radius: var(--r-chip); background: var(--acc-bg); color: var(--acc-ink); font-size: 10.5px; font-weight: 800;
      }
      #cbe-panel .cbe-move { flex: none; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
      #cbe-panel .cbe-move .arr { opacity: .55; font-weight: 500; }
      #cbe-panel .cbe-move.changed { color: var(--acc-ink); }
      #cbe-panel .cbe-move.same, #cbe-panel .cbe-move.excl { color: var(--dim2); }
      #cbe-panel .cbe-move.rev { color: var(--fg); }
      #cbe-panel .cbe-item-actions { display: none; flex: none; gap: 4px; }
      #cbe-panel .cbe-turn-item:hover .cbe-item-actions,
      #cbe-panel .cbe-turn-item:focus-within .cbe-item-actions { display: flex; }
      #cbe-panel .cbe-mini-btn {
        height: 26px; padding: 0 9px; border: 1px solid var(--line2); border-radius: calc(var(--r-ctl) - 2px);
        background: transparent; color: var(--dim); font-size: 11px; font-weight: 700;
        transition: transform .2s cubic-bezier(.34,1.56,.64,1), background .15s, color .15s;
      }
      #cbe-panel .cbe-mini-btn:hover:not(:disabled) { background: var(--bg3); color: var(--fg); }
      #cbe-panel .cbe-mini-btn:active:not(:disabled) { transform: scale(.9); }
      #cbe-panel .cbe-mini-btn:disabled { opacity: .4; }
      #cbe-panel .cbe-mini-btn.selected { background: var(--acc-bg); color: var(--acc-ink); border-color: transparent; }
      #cbe-panel .cbe-occurrences { flex: 1 0 100%; margin-top: 6px; padding: 8px 9px; border-radius: calc(var(--r-ctl) - 2px); background: var(--bg3); }
      #cbe-panel .cbe-occurrences strong { display: block; margin-bottom: 6px; color: var(--fg); font-size: 11px; }
      #cbe-panel .cbe-occurrences > div { display: flex; flex-wrap: wrap; gap: 5px; }
      #cbe-panel .cbe-occurrences .cbe-mini-btn { font-family: var(--font-mono); font-weight: 500; }

      /* ---------- 로그 / 푸터 ---------- */
      #cbe-panel .cbe-log-wrap { display: none; flex: 0 0 auto; margin: 0 16px 12px; }
      #cbe-panel.show-log .cbe-log-wrap { display: block; }
      #cbe-log {
        margin: 0; padding: 10px 12px; max-height: 140px; overflow: auto;
        border: 1px solid var(--line); border-radius: var(--r-box); background: var(--bg2);
        color: var(--dim); font: 11px/1.6 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere;
      }
      #cbe-panel .cbe-foot {
        display: flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 10px 16px;
        border-top: 1px solid var(--line); color: var(--dim2); font-size: 11.5px;
      }
      #cbe-panel .cbe-foot .cbe-spacer { flex: 1; }

      /* ---------- 움직임 ---------- */
      @keyframes cbe-spin { to { transform: rotate(360deg); } }
      @keyframes cbe-pulse { 50% { opacity: .35; } }
      @keyframes cbe-sheen { to { transform: translateX(100%); } }
      @keyframes cbe-pop { 0% { transform: scale(.5); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
      @keyframes cbe-nudge { 20% { transform: rotate(-38deg); } 50% { transform: rotate(12deg); } 75% { transform: rotate(-5deg); } }
      @keyframes cbe-row-in { from { opacity: 0; transform: translateY(-6px); } }
      @keyframes cbe-row-out { to { opacity: 0; transform: translateX(12px); } }
      @keyframes cbe-list-in { from { opacity: 0; transform: translateY(4px); } }
      @keyframes cbe-pop-in { from { opacity: 0; transform: translateY(-4px) scale(.97); } }
      @keyframes cbe-tap { 40% { transform: scale(.9); } }
      @keyframes cbe-fade { from { opacity: 0; } }
      @keyframes cbe-fade-out { to { opacity: 0; } }
      @keyframes cbe-panel-in { from { opacity: 0; transform: translateY(10px) scale(.98); } }
      @keyframes cbe-panel-out { to { opacity: 0; transform: translateY(8px) scale(.98); } }
      @keyframes cbe-in-l { from { opacity: 0; transform: translateX(14px); } }
      @keyframes cbe-in-r { from { opacity: 0; transform: translateX(-14px); } }

      /* ---------- 모바일: 화면을 꽉 채우고 촘촘하게 ---------- */
      @media (max-width: 820px) {
        #cbe-overlay { padding: 0; align-items: stretch; }
        #cbe-panel {
          width: 100%; height: 100%; max-height: none; border: 0; border-radius: 0;
          padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        #cbe-panel .cbe-head { padding: 8px 6px 0 12px; }
        #cbe-panel .cbe-mark { width: 26px; height: 26px; margin-right: 8px; }
        #cbe-panel .cbe-title { font-size: 14px; }
        #cbe-panel .cbe-title-ko { margin-left: 6px; font-size: 11.5px; }
        #cbe-panel .cbe-icon { width: 34px; height: 34px; }
        #cbe-panel .cbe-tabs { margin: 0 12px; gap: 16px; }
        #cbe-panel .cbe-tab { height: 36px; }
        #cbe-undo-pop { top: calc(env(safe-area-inset-top, 0px) + 44px); left: 8px; right: 8px; width: auto; max-width: none; }

        /* 상태와 적용 버튼은 엄지가 닿는 맨 아래로 */
        #cbe-panel .cbe-body { order: 4; padding: 8px 10px 12px; }
        #cbe-panel .cbe-log-wrap { order: 5; margin: 0 10px 8px; }
        #cbe-progress { order: 6; margin: 0; height: 2px; border-radius: 0; }
        #cbe-status {
          order: 7; flex-wrap: nowrap; margin: 0; padding: 8px 8px 8px 12px; min-height: 56px;
          border-radius: 0; border-top: 1px solid var(--line); font-size: 12px;
        }
        #cbe-status-extra { display: none; }
        #cbe-status-text { min-width: 0; }
        #cbe-panel .cbe-btn.danger, #cbe-panel .cbe-btn.small { height: 40px; border-radius: 12px; }
        #cbe-panel .cbe-foot { display: none; }

        /* 입력칸 글자 16px: 아이폰이 칸을 누를 때 화면을 확대하지 않게 */
        #cbe-panel .cbe-replace-flow input,
        #cbe-panel .cbe-control-field input,
        #cbe-panel .cbe-inline-select select,
        #cbe-panel .cbe-search,
        #cbe-panel .cbe-check input { font-size: 16px; }
        #cbe-panel .cbe-replace-setup { gap: 8px; }
        #cbe-panel .cbe-replace-flow .cbe-control-field { padding: 6px 20px 6px 12px; }
        #cbe-panel .cbe-replace-flow .cbe-control-field:last-child { padding: 6px 12px 6px 22px; }
        #cbe-panel .cbe-pairs-head span:first-child { padding-left: 12px; }
        #cbe-panel .cbe-pairs-head span:last-child { padding-left: 22px; }
        #cbe-panel .cbe-replace-meta { flex-wrap: nowrap; align-items: center; gap: 6px; }
        #cbe-panel .cbe-inline-select { width: auto; flex: 0 0 88px; }
        #cbe-panel .cbe-inline-select .cbe-control-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
        #cbe-panel .cbe-opt { padding: 0 10px 0 8px; }
        #cbe-panel .cbe-opt .f { display: none; }
        #cbe-panel .cbe-opt .s { display: inline; }
        #cbe-panel .cbe-replace-meta .cbe-setup-spacer { display: none; }
        #cbe-panel .cbe-replace-meta .cbe-btn { flex: 1 1 auto; padding: 0 10px; }
        #cbe-panel .cbe-preview-list { margin-top: 8px; gap: 6px; }
        #cbe-panel .cbe-preview-item > header { padding: 7px 10px; }
        #cbe-panel .cbe-preview-item > header time { display: none; }
        #cbe-panel .cbe-preview-item > header .cbe-caret { margin-left: auto; }
        #cbe-panel .cbe-diff { grid-template-columns: 1fr; }
        #cbe-panel .cbe-diff .d-before, #cbe-panel .cbe-diff .d-after { display: none; }
        #cbe-panel .cbe-diff .d-inline { display: block; }
        #cbe-panel .cbe-diff > section { padding: 9px 10px; }
        #cbe-panel pre { font-size: 13px; line-height: 1.65; }

        #cbe-panel .cbe-setup { padding: 8px; }
        #cbe-panel .cbe-turn-setup { gap: 6px; }
        #cbe-panel .cbe-turn-primary { display: grid; grid-template-columns: minmax(0,1fr) 64px auto; gap: 6px; }
        #cbe-panel .cbe-turn-start { width: auto; min-width: 0; flex: none; }
        #cbe-panel .cbe-turn-primary .cbe-btn { padding: 0 10px; }
        #cbe-panel .cbe-turn-hint { font-size: 11px; }
        #cbe-panel .cbe-range { margin-top: 8px; padding: 8px 10px; }
        #cbe-panel .cbe-line { margin: 0 10px; }
        #cbe-panel .cbe-end .s { display: none; }
        #cbe-panel .cbe-check { margin-top: 6px; padding: 5px 6px 5px 10px; font-size: 11.5px; }
        #cbe-panel .cbe-check input { width: 54px; }
        #cbe-panel .cbe-tools { margin-top: 8px; gap: 6px; }
        #cbe-panel .cbe-toggle { padding: 0 8px; font-size: 11.5px; }
        #cbe-panel .cbe-turn-list { gap: 5px; }
        #cbe-panel .cbe-turn-item { flex-wrap: wrap; gap: 7px; padding: 7px 9px; cursor: pointer; }
        #cbe-panel .cbe-idx { min-width: 34px; }
        #cbe-panel .cbe-text { flex-basis: 0; }
        /* 행을 톡 누르면 시작/끝/제외 버튼이 나옴 */
        #cbe-panel .cbe-item-actions,
        #cbe-panel .cbe-turn-item:hover .cbe-item-actions,
        #cbe-panel .cbe-turn-item:focus-within .cbe-item-actions { display: none; }
        #cbe-panel .cbe-turn-item.open .cbe-item-actions {
          display: flex; flex: 1 0 100%; justify-content: flex-end; animation: cbe-list-in .18s ease-out;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #cbe-overlay, #cbe-overlay *, #cbe-overlay *::before, #cbe-overlay *::after,
        #cbe-launch, #cbe-launch::before, #cbe-launch::after {
          animation: none !important; transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyles();

    if (document.getElementById(ID.overlay)) return;

    const overlay = document.createElement('div');
    overlay.id = ID.overlay;

    overlay.innerHTML = `
      <div id="${ID.panel}" role="dialog" aria-modal="true" aria-label="LogShift 로그 일괄 편집기">
        <div class="cbe-head">
          <span class="cbe-mark" aria-hidden="true">${icon('swap')}</span>
          <strong class="cbe-title">LogShift<span class="cbe-title-ko">로그 일괄 편집기</span></strong>
          <button type="button" class="cbe-icon" id="${ID.undo}" data-ic="undo" data-lock
                  title="되돌리기 기록" aria-label="되돌리기 기록" aria-expanded="false">${icon('undo')}</button>
          <button type="button" class="cbe-icon" id="${ID.exportBackup}" data-ic="save" data-lock
                  title="가장 최근 백업 JSON 저장" aria-label="가장 최근 백업 JSON 저장">${icon('save')}</button>
          <button type="button" class="cbe-icon" id="${ID.logToggle}" data-ic="log"
                  title="작업 로그" aria-label="작업 로그">${icon('log')}</button>
          <button type="button" class="cbe-icon" data-cbe-close data-ic="close"
                  title="닫기" aria-label="닫기">${icon('x')}</button>
        </div>

        <div class="cbe-pop" id="${ID.undoPop}" role="dialog" aria-label="되돌리기 기록" hidden>
          <div class="cbe-pop-head">되돌리기 기록<small>채팅방마다 최근 ${APP.historyPerChat}개까지 보관</small></div>
          <ol class="cbe-hist" id="${ID.history}"></ol>
          <p class="cbe-hist-empty" id="cbe-history-empty">되돌릴 작업이 없어요.</p>
          <p class="cbe-pop-note" id="cbe-history-note" hidden>아래 줄을 누르면 그보다 나중 작업까지 한꺼번에 되돌려요.</p>
        </div>

        <div class="cbe-tabs" role="tablist">
          <button id="${ID.tabReplace}" type="button" class="cbe-tab active" role="tab" aria-selected="true">문자열 치환</button>
          <button id="${ID.tabTurn}" type="button" class="cbe-tab" role="tab" aria-selected="false">연속 번호</button>
          <span class="cbe-tab-ink" aria-hidden="true"></span>
        </div>

        <div id="${ID.status}" data-type="neutral" hidden>
          <span id="${ID.statusText}"></span>
          <span id="${ID.statusExtra}"></span>
          <span id="${ID.statusActions}">
            <button id="${ID.replaceApply}" type="button" class="cbe-btn danger" disabled><span class="lbl">일괄 수정</span><span class="cnt"></span></button>
            <button id="${ID.turnApply}" type="button" class="cbe-btn danger" disabled hidden><span class="lbl">재번호 적용</span><span class="cnt"></span></button>
            <button id="${ID.cancel}" type="button" class="cbe-btn small" disabled style="display:none">중단</button>
          </span>
        </div>

        <div id="${ID.progress}" hidden><i></i></div>

        <div class="cbe-body">
          <section id="${ID.paneReplace}" class="cbe-pane">
            <div class="cbe-replace-setup">
              <div id="${ID.pairs}" class="single">
                <div class="cbe-pairs-head" aria-hidden="true"><span>찾을 내용</span><span>바꿀 내용</span></div>
                <div id="${ID.pairList}">${pairRowHtml()}</div>
                <div class="cbe-pair-tools">
                  <button type="button" class="cbe-add-pair" id="${ID.addPair}">${icon('plus')}한 쌍 더</button>
                  <div class="cbe-recent" id="${ID.recent}" hidden></div>
                </div>
              </div>

              <div class="cbe-replace-meta">
                <label class="cbe-inline-select">
                  <span class="cbe-control-label">대상</span>
                  <select id="${ID.target}" aria-label="대상">
                    <option value="all">전체</option>
                    <option value="assistant">AI만</option>
                    <option value="user">USER만</option>
                  </select>
                </label>

                <label class="cbe-opt" title="대소문자 구분">
                  <input id="${ID.caseSensitive}" type="checkbox">
                  <span class="tick">${icon('check')}</span>
                  <span class="f">대소문자 구분</span><span class="s">Aa</span>
                </label>

                <label class="cbe-opt on" title="받침이 달라지면 은/는, 이/가, 을/를, 과/와, (으)로 등을 알아서 맞춰요. 애매한 곳은 그대로 두고 물결 밑줄로 알려줘요.">
                  <input id="${ID.josa}" type="checkbox" checked>
                  <span class="tick">${icon('check')}</span>
                  <span class="f">조사 자동 맞춤</span><span class="s">은/는</span>
                </label>

                <span class="cbe-setup-spacer"></span>
                <button id="${ID.replaceScan}" type="button" class="cbe-btn primary">${busyLabel('변경점 검사')}</button>
              </div>
            </div>

            <div id="${ID.replaceSummary}"></div>
            <div id="${ID.replacePreview}" class="cbe-preview-list">
              ${replaceEmptyHtml(
                '문자열을 한꺼번에 바꿉니다',
                '찾을 내용과 바꿀 내용을 넣고 먼저 변경점을 검사하세요. 쌍을 여러 개 넣으면 한 번에 바꿔요.'
              )}
            </div>
          </section>

          <section id="${ID.paneTurn}" class="cbe-pane" hidden>
            <div class="cbe-setup cbe-turn-setup">
              <div class="cbe-turn-primary">
                <label class="cbe-control-field grow cbe-turn-pattern">
                  <span class="cbe-control-label">턴 번호 형식</span>
                  <input id="${ID.turnPattern}" type="text" autocomplete="off" spellcheck="false"
                         placeholder="예: **[{N}]**"
                         title="실제 숫자가 들어가는 자리를 {N}으로 적습니다">
                </label>

                <label class="cbe-control-field cbe-turn-start">
                  <span class="cbe-control-label">시작 턴</span>
                  <input id="${ID.turnStartNumber}" type="number" step="1" placeholder="자동">
                </label>

                <button id="${ID.turnAnalyze}" type="button" class="cbe-btn primary">${busyLabel('턴 로그 분석')}</button>
              </div>

              <div class="cbe-turn-hint">
                <span>AI 메시지만 셉니다.</span>
                <span>숫자 자리만 <code>{N}</code>으로 바꿔 입력하세요.</span>
              </div>
            </div>

            <div id="${ID.turnRange}" class="cbe-range" hidden></div>

            <div class="cbe-check off" id="cbe-check-line" hidden>
              <span id="${ID.turnSummary}"></span>
              <span class="cbe-spacer"></span>
              <label title="알고 있는 마지막 턴 번호를 넣으면 계산이 맞는지 대조합니다">
                예상 끝
                <input id="${ID.turnExpectedEnd}" type="number" step="1" placeholder="-">
              </label>
              <span id="${ID.turnVerify}" class="cbe-verify"></span>
            </div>

            <div class="cbe-tools" data-cbe-turn-tools hidden>
              <label class="cbe-search-wrap">
                ${icon('search')}
                <input id="${ID.turnFilter}" type="text" autocomplete="off"
                       class="cbe-search" placeholder="번호나 본문으로 찾기" aria-label="후보 검색">
              </label>
              <label class="cbe-toggle">
                <input id="${ID.turnOnlyReview}" type="checkbox">
                검토 필요만
              </label>
              <details class="cbe-menu" id="${ID.turnMenu}">
                <summary title="더보기" aria-label="더보기">${icon('more')}</summary>
                <div>
                  <button id="${ID.turnFirstAnchor}" type="button">첫 후보를 시작점으로</button>
                  <button id="${ID.turnLatestAnchor}" type="button">마지막 후보를 끝점으로</button>
                  <button id="${ID.turnExcludeFiltered}" type="button">검색결과 모두 제외</button>
                  <button id="${ID.turnIncludeFiltered}" type="button">검색결과 모두 포함</button>
                </div>
              </details>
            </div>

            <div id="${ID.turnCandidateList}" class="cbe-preview-list cbe-turn-list">
              <div class="cbe-empty">
                <strong>턴 번호 구간을 다시 매깁니다</strong>
                위에서 턴 번호 형식과 시작 턴을 정한 뒤 분석하세요.
              </div>
            </div>
          </section>
        </div>

        <div class="cbe-log-wrap"><pre id="${ID.log}"></pre></div>

        <div class="cbe-foot">
          <span id="cbe-foot-left">적용 전 원문 자동 백업 · 되돌리기 기록 보관</span>
          <span class="cbe-spacer"></span>
          <span>v${APP.version}</span>
        </div>
      </div>
    `;

    overlay.addEventListener('click', event => {
      if (event.target === overlay) closePanel();
    });

    overlay.querySelector('[data-cbe-close]')?.addEventListener('click', closePanel);
    document.body.appendChild(overlay);
    syncCbeTheme();
    ensureCbeThemeObserver();

    const byId = id => document.getElementById(id);

    byId(ID.tabReplace)?.addEventListener('click', () => switchTab('replace'));
    byId(ID.tabTurn)?.addEventListener('click', () => switchTab('turn'));

    byId(ID.logToggle)?.addEventListener('click', () => {
      const on = byId(ID.panel)?.classList.toggle('show-log');
      byId(ID.logToggle)?.classList.toggle('on', !!on);
    });

    // 문자열 치환
    byId(ID.replaceScan)?.addEventListener('click', () => handleReplaceScan());
    byId(ID.replaceApply)?.addEventListener('click', handleReplaceApply);
    byId(ID.pairs)?.addEventListener('click', handlePairsClick);
    byId(ID.pairs)?.addEventListener('input', invalidateReplaceScan);
    byId(ID.pairs)?.addEventListener('keydown', handlePairsKeydown);
    byId(ID.target)?.addEventListener('change', invalidateReplaceScan);
    byId(ID.caseSensitive)?.addEventListener('change', handleOptionToggle);
    byId(ID.josa)?.addEventListener('change', handleOptionToggle);

    const preview = byId(ID.replacePreview);
    preview?.addEventListener('click', event => {
      if (event.target.closest('.cbe-pick')) return;
      const header = event.target.closest('.cbe-preview-item > header');
      if (header) togglePreviewItem(header.parentElement);
    });
    preview?.addEventListener('change', handlePreviewPick);

    // 연속 번호
    byId(ID.turnAnalyze)?.addEventListener('click', handleTurnAnalyze);
    byId(ID.turnApply)?.addEventListener('click', handleTurnApply);
    byId(ID.turnPattern)?.addEventListener('input', invalidateTurnAnalysis);
    byId(ID.turnStartNumber)?.addEventListener('input', handleTurnStartNumberInput);
    byId(ID.turnExpectedEnd)?.addEventListener('input', handleTurnExpectedEndInput);
    byId(ID.turnFilter)?.addEventListener('input', renderTurnCandidates);
    byId(ID.turnOnlyReview)?.addEventListener('change', renderTurnCandidates);
    byId(ID.turnCandidateList)?.addEventListener('click', handleTurnCandidateListClick);
    byId(ID.turnFirstAnchor)?.addEventListener('click', handleTurnFirstAnchor);
    byId(ID.turnLatestAnchor)?.addEventListener('click', handleTurnLatestAnchor);
    byId(ID.turnExcludeFiltered)?.addEventListener('click', () => handleBulkTurnCandidateMode('exclude'));
    byId(ID.turnIncludeFiltered)?.addEventListener('click', () => handleBulkTurnCandidateMode('include'));

    // 공통
    byId(ID.cancel)?.addEventListener('click', handleCancel);
    byId(ID.undo)?.addEventListener('click', event => {
      event.stopPropagation();
      toggleHistoryPop();
    });
    byId(ID.history)?.addEventListener('click', handleHistoryClick);
    byId(ID.exportBackup)?.addEventListener('click', handleExportBackup);

    document.addEventListener('click', event => {
      const pop = byId(ID.undoPop);
      if (!pop || pop.hidden) return;
      if (pop.contains(event.target) || byId(ID.undo)?.contains(event.target)) return;
      toggleHistoryPop(false);
    });

    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || byId(ID.overlay)?.style.display !== 'flex') return;
      const pop = byId(ID.undoPop);
      if (pop && !pop.hidden) {
        toggleHistoryPop(false);
        return;
      }
      closePanel();
    });

    const tabs = document.querySelector(`#${ID.panel} .cbe-tabs`);
    if (tabs && typeof ResizeObserver === 'function') {
      new ResizeObserver(() => moveTabInk(true)).observe(tabs);
    }

    renderRecentChips();
    switchTab(state.activeTab);
    updateBackupButtons();
  }

  const CBE_NATIVE_BUTTON_FALLBACK_CLASS = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:fill-current min-w-7 border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';

  function findCbeChatInput() {
    const selectors = [
      '.__chat_input_textarea',
      'p[data-placeholder*="메시지"], p[data-placeholder*="Message"], p[data-placeholder*="message"]',
      'textarea[placeholder*="메시지"], textarea[placeholder*="Message"], textarea[placeholder*="message"]',
      'div.ProseMirror[contenteditable="true"], div.tiptap[contenteditable="true"]',
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (let i = nodes.length - 1; i >= 0; i--) {
        let el = nodes[i];
        if (el.matches?.('p[data-placeholder]')) el = el.closest('[contenteditable="true"]');
        if (!(el instanceof Element) || !el.isConnected || !el.closest('main')) continue;
        if (el.closest(`#${ID.panel}`)) continue;
        return el;
      }
    }

    return null;
  }

  function isCbeNativeButton(btn) {
    if (!(btn instanceof HTMLButtonElement)) return false;
    if (btn.id === ID.launch || btn.closest(`#${ID.panel}`)) return false;
    const cls = String(btn.className || '');
    const label = String(btn.getAttribute('aria-label') || '');
    return (
      (cls.includes('rounded-full') && (cls.includes('size-7') || cls.includes('min-w-7'))) ||
      label.includes('단축어') ||
      btn.id === 'cmu-settings-button'
    );
  }

  function findCbeToolbarInfo() {
    const cmuWrapper = document.getElementById('cmu-toolbar-wrapper');
    const cmuSettings = document.getElementById('cmu-settings-button');
    if (cmuWrapper instanceof HTMLElement) {
      return {
        toolbar: cmuWrapper,
        base: cmuSettings instanceof HTMLButtonElement
          ? cmuSettings
          : Array.from(cmuWrapper.querySelectorAll('button')).find(isCbeNativeButton) || null,
        anchor: cmuSettings instanceof HTMLButtonElement ? cmuSettings : null,
        cmu: true,
      };
    }

    const input = findCbeChatInput();
    if (!input) return null;

    const form = input.closest('form');
    const scope = form || input.parentElement?.parentElement || input.parentElement;
    if (!(scope instanceof Element)) return null;

    const preferred = [
      ...scope.querySelectorAll('button[aria-label*="단축어"]'),
      ...scope.querySelectorAll('#capture-action-button'),
    ].find(btn => btn instanceof HTMLButtonElement && !btn.closest(`#${ID.panel}`));

    if (preferred?.parentElement) {
      return { toolbar: preferred.parentElement, base: preferred, anchor: preferred, cmu: false };
    }

    const buttons = Array.from(scope.querySelectorAll('button')).filter(isCbeNativeButton);
    const base = buttons.find(btn => btn.querySelector('svg')) || buttons[0] || null;
    if (!base?.parentElement) return null;

    return { toolbar: base.parentElement, base, anchor: base, cmu: false };
  }

  function createCbeLaunchButton(baseBtn) {
    const button = document.createElement('button');
    button.id = ID.launch;
    button.type = 'button';
    button.className = baseBtn instanceof HTMLButtonElement
      ? baseBtn.className
      : CBE_NATIVE_BUTTON_FALLBACK_CLASS;
    button.classList.add('cbe-native-toolbar-btn');
    button.setAttribute('data-cbe-toolbar-button', 'bulk-editor');
    button.title = '🔁 LogShift (로그 일괄 편집기)';
    button.setAttribute('aria-label', 'LogShift 로그 일괄 편집기');
    button.innerHTML = `<span class="cbe-launch-icon" aria-hidden="true">${icon('swap')}</span>`;
    button.addEventListener('mousedown', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openPanel();
    });
    return button;
  }

  function ensureLaunchButton() {
    injectStyles();

    const chatId = parseChatId();
    let button = document.getElementById(ID.launch);

    if (!chatId) {
      button?.remove?.();
      return false;
    }

    const info = findCbeToolbarInfo();
    if (!info?.toolbar) {
      button?.remove?.();
      return false;
    }

    if (!(button instanceof HTMLButtonElement)) {
      button?.remove?.();
      button = createCbeLaunchButton(info.base);
    }

    if (info.base instanceof HTMLButtonElement && button.dataset.cbeBaseClass !== info.base.className) {
      const keep = 'cbe-native-toolbar-btn';
      button.className = info.base.className;
      button.classList.add(keep);
      button.dataset.cbeBaseClass = info.base.className;
      syncLaunchBusy();
    }

    if (info.cmu && info.anchor?.parentElement === info.toolbar) {
      if (info.anchor.nextSibling !== button) {
        info.toolbar.insertBefore(button, info.anchor.nextSibling);
      }
    } else if (info.anchor?.parentElement === info.toolbar) {
      if (info.anchor.previousSibling !== button) {
        info.toolbar.insertBefore(button, info.anchor);
      }
    } else if (button.parentElement !== info.toolbar) {
      info.toolbar.appendChild(button);
    }

    return true;
  }

  function init() {
    ensureLaunchButton();

    let lastPath = location.pathname;

    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        ensureLaunchButton();
      } else {
        const button = document.getElementById(ID.launch);
        if (!button?.isConnected || !parseChatId()) ensureLaunchButton();
      }
    }, 1000);
  }

  init();
})();
