// ==UserScript==
// @name         🔁 LogShift (로그 일괄 편집기)
// @namespace    crack.logshift
// @version      1.0.3
// @downloadURL  https://gist.github.com/chyoyam-alt/173783fbe395a65ec40dffeef73cfcb3/raw/LogShift.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/173783fbe395a65ec40dffeef73cfcb3/raw/LogShift.user.js
// @description  크랙 채팅 로그의 문자열 일괄 치환/삭제 + HUD 턴 번호 구간 재번호 도구. 전체 로그 API 조회, 후보 제외, 시작/끝 앵커, 마지막 턴 계산, 백업/되돌리기를 지원합니다.
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const APP = Object.freeze({
    version: '1.0.3',
    apiBase: 'https://crack-api.wrtn.ai/crack-gen/v3',
    pageSize: 300,
    hardLimit: 20000,
    patchDelayMs: 220,
    retryCount: 3,
    retryBaseDelayMs: 700,
    maxReplacePreviewItems: 120,
    backupKey: 'crack_bulk_editor:last_backup:v2',
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
    exportBackup: 'cbe-export-backup',

    tabReplace: 'cbe-tab-replace',
    tabTurn: 'cbe-tab-turn',
    paneReplace: 'cbe-pane-replace',
    paneTurn: 'cbe-pane-turn',

    replaceSummary: 'cbe-replace-summary',
    replacePreview: 'cbe-replace-preview',
    replaceScan: 'cbe-replace-scan',
    replaceApply: 'cbe-replace-apply',
    find: 'cbe-find',
    replace: 'cbe-replace',
    target: 'cbe-target',
    caseSensitive: 'cbe-case-sensitive',

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
    },
  };

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

  function setStatus(message, type = 'neutral') {
    const el = document.getElementById(ID.status);
    const text = document.getElementById(ID.statusText);
    if (!el) return;

    const empty = !String(message ?? '').trim();
    el.dataset.type = type;
    el.hidden = empty && !state.loading && !state.patching;
    if (text) text.textContent = String(message ?? '');
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

  function saveBackup(backup) {
    GM_setValue(APP.backupKey, backup);
  }

  function loadBackup() {
    return GM_getValue(APP.backupKey, null);
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
    const backup = loadBackup();
    const undo = document.getElementById(ID.undo);
    const exportBtn = document.getElementById(ID.exportBackup);

    const hasBackup = !!(
      backup?.chatId &&
      Array.isArray(backup?.items) &&
      backup.items.length
    );

    if (undo) {
      undo.disabled = state.loading || state.patching || !hasBackup;
      undo.title = hasBackup
        ? `직전 백업: ${backup.items.length.toLocaleString()}개`
        : '저장된 백업 없음';
    }

    if (exportBtn) {
      exportBtn.disabled = state.loading || state.patching || !hasBackup;
    }
  }

  function setProgress(current, total) {
    const wrap = document.getElementById(ID.progress);
    if (!wrap) return;

    if (!total) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    const bar = wrap.querySelector('i');
    if (bar) bar.style.width = `${Math.min(100, (current / total) * 100)}%`;
  }

  function setBusyUi(isBusy) {
    document.querySelectorAll(`#${ID.panel} input, #${ID.panel} select, #${ID.panel} .cbe-btn, #${ID.panel} .cbe-tab`)
      .forEach(el => {
        if (el.id === ID.cancel) return;
        el.disabled = isBusy;
      });

    const cancel = document.getElementById(ID.cancel);
    if (cancel) {
      cancel.disabled = !isBusy;
      cancel.style.display = isBusy ? '' : 'none';
    }

    if (!isBusy) {
      setProgress(0, 0);
      syncApplyButtons();
      updateBackupButtons();
    }
  }

  function syncApplyButtons() {
    const replaceApply = document.getElementById(ID.replaceApply);
    const turnApply = document.getElementById(ID.turnApply);

    if (replaceApply) {
      replaceApply.disabled =
        state.loading ||
        state.patching ||
        !state.replace.matches.length;
    }

    if (turnApply) {
      const patchCount = state.turn.plan?.patches?.length || 0;
      turnApply.disabled =
        state.loading ||
        state.patching ||
        !state.turn.analyzed ||
        !patchCount;
    }
  }

  // ---------------------------------------------------------------------------
  // 문자열 치환/삭제
  // ---------------------------------------------------------------------------

  function buildLiteralRegex(findText, caseSensitive) {
    return new RegExp(escapeRegExp(findText), caseSensitive ? 'g' : 'gi');
  }

  function replaceLiteral(text, findText, replacement, caseSensitive) {
    const regex = buildLiteralRegex(findText, caseSensitive);
    let count = 0;

    const after = text.replace(regex, () => {
      count += 1;
      return replacement;
    });

    return { after, count };
  }

  function getReplaceUiValues() {
    return {
      findText: document.getElementById(ID.find)?.value ?? '',
      replacement: document.getElementById(ID.replace)?.value ?? '',
      target: document.getElementById(ID.target)?.value ?? 'all',
      caseSensitive: !!document.getElementById(ID.caseSensitive)?.checked,
    };
  }

  function makeReplaceSignature(values) {
    return JSON.stringify(values);
  }

  function scanReplaceMessages(messages, values) {
    const results = [];

    for (let index = 0; index < messages.length; index++) {
      const raw = messages[index];
      const role = getMessageRole(raw);

      if (!roleMatches(role, values.target)) continue;

      const before = getMessageContent(raw);
      if (!before) continue;

      const { after, count } = replaceLiteral(
        before,
        values.findText,
        values.replacement,
        values.caseSensitive
      );

      if (!count || after === before) continue;

      results.push({
        index,
        id: getMessageId(raw),
        role,
        before,
        after,
        count,
        createdAt: getMessageCreatedAt(raw),
      });
    }

    return results;
  }

  function resetReplaceScan() {
    state.replace.matches = [];
    state.replace.lastScanSignature = '';

    const preview = document.getElementById(ID.replacePreview);
    const summary = document.getElementById(ID.replaceSummary);

    if (preview) {
      preview.innerHTML = `
        <div class="cbe-empty">
          <strong>문자열을 한꺼번에 바꿉니다</strong>
          찾을 내용과 바꿀 내용을 넣고 먼저 변경점을 검사하세요.
        </div>`;
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

  function splitByMatches(text, findText, caseSensitive) {
    const regex = buildLiteralRegex(findText, caseSensitive);
    const parts = [];
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) parts.push({ hit: false, text: text.slice(last, match.index) });
      parts.push({ hit: true, text: match[0] });
      last = match.index + match[0].length;
      if (match[0] === '') regex.lastIndex += 1;
    }

    if (last < text.length) parts.push({ hit: false, text: text.slice(last) });
    return parts;
  }

  function buildDiffHtml(beforeText, findText, replacement, caseSensitive) {
    const source = truncateText(beforeText, 900);
    const parts = splitByMatches(source, findText, caseSensitive);
    const rep = escapeHtml(replacement);

    let before = '';
    let after = '';
    let inline = '';

    for (const part of parts) {
      const esc = escapeHtml(part.text);

      if (!part.hit) {
        before += esc;
        after += esc;
        inline += esc;
        continue;
      }

      before += `<mark>${esc}</mark>`;
      after += replacement ? `<mark class="g">${rep}</mark>` : '';
      inline += `<del>${esc}</del>` + (replacement ? `<ins>${rep}</ins>` : '');
    }

    return { before, after, inline };
  }

  function renderReplaceSummary(matches, loadedCount, truncated) {
    const extra = document.getElementById(ID.statusExtra);
    const summary = document.getElementById(ID.replaceSummary);
    if (summary) summary.innerHTML = '';
    if (!extra) return;

    if (!matches.length) {
      extra.innerHTML = '';
      return;
    }

    const aiCount = matches.filter(item => item.role === 'assistant').length;
    const userCount = matches.filter(item => item.role === 'user').length;

    extra.innerHTML =
      (aiCount ? `<span class="cbe-pill ai">AI ${aiCount.toLocaleString()}</span>` : '') +
      (userCount ? `<span class="cbe-pill user">USER ${userCount.toLocaleString()}</span>` : '') +
      (truncated ? `<span class="cbe-pill warn" title="로그가 20,000개를 넘어 조회를 멈췄습니다">일부만 조회됨</span>` : '');
  }

  function renderReplacePreview(matches) {
    const preview = document.getElementById(ID.replacePreview);
    if (!preview) return;

    if (!matches.length) {
      preview.innerHTML = `
        <div class="cbe-empty">
          <strong>바꿀 내용이 없습니다</strong>
          찾을 내용이나 대상을 바꿔서 다시 검사해 보세요.
        </div>`;
      return;
    }

    const values = getReplaceUiValues();
    const visible = matches.slice(0, APP.maxReplacePreviewItems);

    const html = visible.map((item, order) => {
      const diff = buildDiffHtml(
        item.before,
        values.findText,
        values.replacement,
        values.caseSensitive
      );

      return `
        <article class="cbe-preview-item ${order === 0 ? '' : 'collapsed'}">
          <header>
            <span class="cbe-role ${item.role === 'assistant' ? 'ai' : 'user'}">${escapeHtml(roleLabel(item.role))}</span>
            <b>#${(item.index + 1).toLocaleString()}</b>
            <span class="cbe-num">${item.count.toLocaleString()}회</span>
            <time>${escapeHtml(formatDate(item.createdAt))}</time>
            <span class="cbe-caret">⌄</span>
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

  async function handleReplaceScan() {
    if (state.loading || state.patching) return;

    const chatId = parseChatId();
    if (!chatId) {
      setStatus('크랙 채팅방 안에서 실행해 주세요.', 'error');
      return;
    }

    const values = getReplaceUiValues();
    if (!values.findText) {
      setStatus('찾을 내용을 입력해 주세요.', 'error');
      document.getElementById(ID.find)?.focus();
      return;
    }

    state.loading = true;
    state.cancelling = false;
    state.logLines = [];
    resetReplaceScan();
    setBusyUi(true);
    appendLog(`치환 검사 시작 · chatId=${chatId}`);

    try {
      const loaded = await ensureMessagesLoaded(chatId);
      const matches = scanReplaceMessages(loaded.messages, values);

      state.replace.matches = matches;
      state.replace.lastScanSignature = makeReplaceSignature(values);

      renderReplaceSummary(matches, loaded.messages.length, loaded.truncated);
      renderReplacePreview(matches);

      const occurrences = matches.reduce((sum, item) => sum + item.count, 0);

      if (matches.length) {
        setStatus(
          `${matches.length.toLocaleString()}개 메시지에서 ${occurrences.toLocaleString()}회 변경됩니다.`,
          'ok'
        );
      } else {
        setStatus('변경할 메시지가 없습니다.', 'neutral');
      }

      appendLog(`치환 검사 완료 · ${matches.length.toLocaleString()}개 메시지 · ${occurrences.toLocaleString()}회`);
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
    }
  }

  async function handleReplaceApply() {
    if (state.loading || state.patching || !state.replace.matches.length) return;

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

    const totalOccurrences = state.replace.matches.reduce((sum, item) => sum + item.count, 0);
    const ok = confirm(
      `정말 수정할까요?\n\n` +
      `메시지 ${state.replace.matches.length.toLocaleString()}개\n` +
      `총 치환 ${totalOccurrences.toLocaleString()}회\n\n` +
      `적용 직전에 원문 백업을 저장합니다.`
    );

    if (!ok) return;

    const backup = makeBackup('replace', chatId, values, state.replace.matches);

    try {
      saveBackup(backup);
    } catch (error) {
      setStatus(`백업 저장 실패: ${error.message || error}`, 'error');
      alert('안전 백업 저장에 실패해서 일괄 수정을 시작하지 않았습니다.');
      return;
    }

    await runPatchItems({
      chatId,
      items: state.replace.matches,
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

    const plan = state.turn.plan;
    const countLabel = plan
      ? `턴 ${plan.counted.length.toLocaleString()}개 · 제외 ${plan.excluded.length.toLocaleString()}`
      : '구간';

    el.hidden = false;
    el.innerHTML = `
      <div class="cbe-end">
        <div class="k">시작</div>
        <div class="v">#${(start.messageIndex + 1).toLocaleString()} · ${escapeHtml(candidateDisplayNumber(start))}</div>
        <span class="s">${escapeHtml(compactText(start.content, 90))}</span>
      </div>
      <div class="cbe-line"><span>${escapeHtml(countLabel)}</span></div>
      <div class="cbe-end right">
        <div class="k">끝</div>
        <div class="v">#${(end.messageIndex + 1).toLocaleString()} · ${escapeHtml(candidateDisplayNumber(end))}</div>
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
      if (verify) verify.textContent = '';
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
      `${plan.startNumber.toLocaleString()} → ${plan.lastTurn === null ? '-' : plan.lastTurn.toLocaleString()} 로 다시 매김 · ` +
      `<b>${plan.patches.length.toLocaleString()}개</b> 수정${escapeHtml(reviewNote)}`;

    if (line) {
      line.hidden = false;
      line.className = plan.review.length ? 'cbe-check off' : 'cbe-check';
    }

    if (verify) {
      if (plan.expectedEnd === null) {
        verify.textContent = '';
      } else if (plan.endDelta === 0) {
        verify.textContent = '일치 ✓';
      } else {
        const sign = plan.endDelta > 0 ? '+' : '';
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

    const visible = filtered;
    const planRows = new Map((state.turn.plan?.rows || []).map(row => [row.id, row]));

    const html = visible.map(candidate => {
      const isStart = candidate.id === state.turn.startCandidateId;
      const isEnd = candidate.id === state.turn.endCandidateId;
      const row = planRows.get(candidate.id);
      const excluded = candidate.mode === 'exclude';

      let move = '';
      if (excluded) {
        move = '<span class="cbe-move same">제외됨</span>';
      } else if (candidate.mode === 'review') {
        move = '<span class="cbe-move changed">검토 필요</span>';
      } else if (row) {
        move = `<span class="cbe-move ${row.changed ? 'changed' : 'same'}">${row.currentNumber} → ${row.expectedNumber}</span>`;
      }

      const statusClass = excluded ? 'excluded' : (candidate.mode === 'review' ? 'review' : '');

      return `
        <article class="cbe-turn-item ${statusClass} ${isStart ? 'is-start' : ''} ${isEnd ? 'is-end' : ''}">
          <span class="cbe-idx">#${(candidate.messageIndex + 1).toLocaleString()}</span>
          <span class="cbe-text">${escapeHtml(compactText(candidate.content, 160))}</span>
          ${move}
          <span class="cbe-item-actions">
            <button type="button" class="cbe-mini-btn" data-turn-start="${escapeHtml(candidate.id)}" title="여기를 시작점으로">시작</button>
            <button type="button" class="cbe-mini-btn" data-turn-end="${escapeHtml(candidate.id)}" title="여기를 끝점으로">끝</button>
            ${
              excluded
                ? `<button type="button" class="cbe-mini-btn" data-turn-include="${escapeHtml(candidate.id)}" title="다시 포함">＋</button>`
                : `<button type="button" class="cbe-mini-btn danger-lite" data-turn-exclude="${escapeHtml(candidate.id)}" title="턴에서 제외">✕</button>`
            }
          </span>
          ${renderOccurrenceChooser(candidate)}
        </article>
      `;
    }).join('');

    const more = '';
    el.innerHTML = html + more;
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
    setBusyUi(true);
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
    if (!target) return;

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
      console.warn(`[Crack Bulk Editor] ${label} failures:`, failures);
    }

    if (wasCancelled) {
      setStatus(
        `${label} 중단 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 직전 백업으로 되돌릴 수 있습니다.`,
        'neutral'
      );
    } else if (failed) {
      setStatus(
        `${label} 완료 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()} · 작업 로그/콘솔을 확인하세요.`,
        'warn'
      );
    } else {
      setStatus(
        `${label} 완료 · ${success.toLocaleString()}개 메시지를 수정했습니다. 새로고침하면 화면에도 반영됩니다.`,
        'ok'
      );
    }

    appendLog(`${label} 종료 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()}`);

    if (typeof onFinish === 'function') onFinish();
    syncApplyButtons();
  }

  async function handleUndo() {
    if (state.loading || state.patching) return;

    const backup = loadBackup();

    if (!backup?.chatId || !Array.isArray(backup.items) || !backup.items.length) {
      setStatus('되돌릴 백업이 없습니다.', 'error');
      return;
    }

    const currentChatId = parseChatId();

    if (!currentChatId) {
      setStatus('크랙 채팅방 안에서 실행해 주세요.', 'error');
      return;
    }

    if (currentChatId !== backup.chatId) {
      setStatus('현재 채팅방과 직전 백업의 채팅방이 다릅니다.', 'error');
      alert(
        `이 백업은 다른 채팅방의 것입니다.\n\n` +
        `백업 chatId: ${backup.chatId}\n` +
        `현재 chatId: ${currentChatId}`
      );
      return;
    }

    const ok = confirm(
      `직전 작업을 되돌릴까요?\n\n` +
      `종류: ${backup.type || 'unknown'}\n` +
      `${backup.items.length.toLocaleString()}개 메시지를 백업된 원문으로 복원합니다.`
    );

    if (!ok) return;

    state.patching = true;
    state.cancelling = false;
    state.logLines = [];
    setBusyUi(true);
    appendLog(`되돌리기 시작 · ${backup.items.length.toLocaleString()}개`);

    let success = 0;
    let failed = 0;
    const failures = [];

    for (let i = 0; i < backup.items.length; i++) {
      if (state.cancelling) break;

      const item = backup.items[i];

      setStatus(
        `되돌리는 중 ${i + 1} / ${backup.items.length} · 성공 ${success} · 실패 ${failed}`,
        'busy'
      );
      setProgress(i + 1, backup.items.length);

      try {
        await patchMessage(currentChatId, item.id, item.before);
        success += 1;
        appendLog(`복원 성공 ${i + 1}/${backup.items.length} · ${roleLabel(item.role)} · ${item.id}`);
      } catch (error) {
        failed += 1;
        failures.push({
          id: item.id,
          role: item.role,
          status: error?.status ?? null,
          error: String(error?.message || error),
        });

        appendLog(
          `복원 실패 ${i + 1}/${backup.items.length} · ${roleLabel(item.role)} · ${item.id} · ${error.message || error}`
        );
      }

      if (i < backup.items.length - 1) {
        await sleep(APP.patchDelayMs);
      }
    }

    const wasCancelled = state.cancelling;

    state.patching = false;
    state.cancelling = false;
    setBusyUi(false);

    if (!wasCancelled && failed === 0) {
      GM_deleteValue(APP.backupKey);
      setStatus(`되돌리기 완료 · ${success.toLocaleString()}개 복원했습니다.`, 'ok');
      appendLog(`되돌리기 완료 · ${success.toLocaleString()}개`);
    } else if (wasCancelled) {
      setStatus(
        `되돌리기 중단 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()}`,
        'neutral'
      );
    } else {
      setStatus(
        `되돌리기 일부 실패 · 성공 ${success.toLocaleString()} · 실패 ${failed.toLocaleString()}`,
        'warn'
      );
      console.warn('[Crack Bulk Editor] UNDO failures:', failures);
    }

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
    setStatus('직전 백업 JSON을 저장했습니다.', 'ok');
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

  function switchTab(tab) {
    state.activeTab = tab === 'turn' ? 'turn' : 'replace';
    const isReplace = state.activeTab === 'replace';

    document.getElementById(ID.tabReplace)?.classList.toggle('active', isReplace);
    document.getElementById(ID.tabTurn)?.classList.toggle('active', !isReplace);

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
        ? '적용 전 원문 자동 백업'
        : 'AI 메시지만 셉니다 · 적용 전 원문 자동 백업';
    }

    if (isReplace && state.replace.matches.length) {
      const occurrences = state.replace.matches.reduce((sum, item) => sum + item.count, 0);
      setStatus(`${state.replace.matches.length.toLocaleString()}개 메시지에서 ${occurrences.toLocaleString()}회 변경됩니다.`, 'ok');
      renderReplaceSummary(state.replace.matches, state.messages.length, state.truncated);
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

  function closePanel() {
    if (state.loading || state.patching) {
      const ok = confirm('작업 중입니다. 패널만 닫아도 작업은 계속됩니다. 닫을까요?');
      if (!ok) return;
    }

    const overlay = document.getElementById(ID.overlay);
    if (overlay) overlay.style.display = 'none';
  }

  function openPanel() {
    const chatId = parseChatId();

    if (!chatId) {
      alert('크랙 채팅방 안에서만 사용할 수 있습니다.');
      return;
    }

    ensureUi();
    syncCbeTheme();

    const overlay = document.getElementById(ID.overlay);
    if (overlay) overlay.style.display = 'flex';

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
  }

  // ---------------------------------------------------------------------------
  // CSS / UI
  // ---------------------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById('cbe-style')) return;

    const style = document.createElement('style');
    style.id = 'cbe-style';
    style.textContent = `
      #${ID.launch}.cbe-native-toolbar-btn {
        pointer-events: auto !important; touch-action: manipulation !important;
        -webkit-tap-highlight-color: transparent;
      }
      #${ID.launch}.cbe-native-toolbar-btn .cbe-launch-icon {
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        width: 16px !important; height: 16px !important; line-height: 1 !important;
        font-size: 16px !important; font-weight: 700 !important;
        color: hsl(var(--line-gray-2, 0 0% 62%)) !important;
        pointer-events: none !important; transform: translateY(-.25px);
      }

      #${ID.overlay} {
        position: fixed; inset: 0; z-index: 2147483600;
        display: none; align-items: center; justify-content: center;
        padding: 16px; background: rgba(0,0,0,.48); box-sizing: border-box;
      }

      #${ID.panel} {
        --bg:#17171a; --bg2:#202024; --bg3:#26262b;
        --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.14);
        --fg:#f3f3f5; --dim:rgba(255,255,255,.52); --dim2:rgba(255,255,255,.34);
        --pri:#f4f4f5; --pri-fg:#18181b;
        --ai:#7fb3ff; --ai-bg:rgba(96,165,250,.16);
        --user:#f79cc9; --user-bg:rgba(244,114,182,.16);
        --ok:#5fd6a4; --ok-bg:rgba(52,211,153,.14);
        --warn:#f2c14e; --warn-bg:rgba(251,191,36,.14);
        --del:#ff8b8b; --del-bg:rgba(248,113,113,.16); --ins-bg:rgba(52,211,153,.18);
        --busy:#8ab6ff; --busy-bg:rgba(96,165,250,.13);

        width: min(1080px,100%); max-height: calc(100vh - 32px);
        display: flex; flex-direction: column; overflow: hidden;
        border-radius: 16px; background: var(--bg); color: var(--fg);
        border: 1px solid var(--line);
        box-shadow: 0 24px 90px rgba(0,0,0,.5);
        font-family: system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Pretendard",sans-serif;
        font-size: 13px;
      }

      #${ID.overlay}[data-cbe-theme="light"] {
        background: rgba(24,24,27,.32);
      }

      #${ID.panel}[data-cbe-theme="light"] {
        --bg:#ffffff; --bg2:#f4f4f6; --bg3:#ebebee;
        --line:rgba(0,0,0,.09); --line2:rgba(0,0,0,.14);
        --fg:#18181b; --dim:rgba(0,0,0,.55); --dim2:rgba(0,0,0,.36);
        --pri:#18181b; --pri-fg:#ffffff;
        --ai:#2563eb; --ai-bg:rgba(37,99,235,.11);
        --user:#c2185b; --user-bg:rgba(219,39,119,.11);
        --ok:#0f8a5f; --ok-bg:rgba(16,185,129,.12);
        --warn:#a16207; --warn-bg:rgba(234,179,8,.16);
        --del:#c2313b; --del-bg:rgba(239,68,68,.13); --ins-bg:rgba(16,185,129,.18);
        --busy:#1d4ed8; --busy-bg:rgba(37,99,235,.1);
        box-shadow: 0 24px 70px rgba(0,0,0,.18);
        color-scheme: light;
      }

      #${ID.panel}[data-cbe-theme="dark"] {
        color-scheme: dark;
      }

      #${ID.panel} * { box-sizing: border-box; }
      #${ID.panel} button { font-family: inherit; cursor: pointer; }
      #${ID.panel} input, #${ID.panel} select { font-family: inherit; font-size: 13px; }
      #${ID.panel} pre {
        margin: 0;
        font: 12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        white-space: pre-wrap; overflow-wrap: anywhere;
      }
      #${ID.panel} mark {
        background: var(--del-bg); color: var(--del);
        padding: 0 2px; border-radius: 3px;
      }
      #${ID.panel} mark.g {
        background: var(--ins-bg); color: var(--ok); font-weight: 700;
      }
      #${ID.panel} del {
        background: var(--del-bg); color: var(--del);
        text-decoration: line-through; text-decoration-thickness: 1px;
        padding: 0 2px; border-radius: 3px;
      }
      #${ID.panel} ins {
        background: var(--ins-bg); color: var(--ok); text-decoration: none;
        padding: 0 2px; border-radius: 3px; font-weight: 700;
      }
      .cbe-num { font-variant-numeric: tabular-nums; }

      /* ---------- 헤더 ---------- */
      .cbe-head {
        display: flex; align-items: center; gap: 6px;
        padding: 12px 12px 12px 16px;
        border-bottom: 1px solid var(--line); flex: 0 0 auto;
      }
      .cbe-head strong {
        flex: 1; font-size: 13.5px; font-weight: 700; letter-spacing: -.01em;
      }
      .cbe-icon {
        width: 30px; height: 30px; border-radius: 8px;
        border: 1px solid transparent; background: transparent;
        color: var(--dim); font-size: 14px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .cbe-icon:hover { background: var(--bg2); color: var(--fg); }
      .cbe-icon:disabled { opacity: .3; cursor: not-allowed; }

      /* ---------- 탭 ---------- */
      .cbe-tabs {
        display: inline-flex; background: var(--bg2);
        border-radius: 9px; padding: 3px; margin: 12px 16px 0; flex: 0 0 auto;
      }
      .cbe-tab {
        height: 28px; padding: 0 14px; border: 0; border-radius: 7px;
        background: transparent; color: var(--dim);
        font-weight: 700; font-size: 12px;
      }
      .cbe-tab.active {
        background: var(--bg); color: var(--fg);
        box-shadow: 0 1px 3px rgba(0,0,0,.2);
      }
      .cbe-tab:disabled { opacity: .4; cursor: not-allowed; }

      /* ---------- 탭별 입력 영역 ---------- */
      .cbe-setup {
        border: 1px solid var(--line);
        border-radius: 12px;
        background: var(--bg2);
        padding: 12px;
      }

      .cbe-control-label {
        display: block;
        margin-bottom: 6px;
        color: var(--dim);
        font-size: 10.5px;
        font-weight: 800;
        letter-spacing: .04em;
      }

      .cbe-control-field { min-width: 0; }
      .cbe-control-field.grow { flex: 1; }

      .cbe-control-field input,
      .cbe-control-field select,
      .cbe-inline-select select {
        width: 100%;
        height: 36px;
        border: 1px solid var(--line2);
        border-radius: 9px;
        background: var(--bg);
        color: var(--fg);
        padding: 0 10px;
        outline: none;
      }

      .cbe-control-field input:focus,
      .cbe-control-field select:focus,
      .cbe-inline-select select:focus,
      .cbe-search:focus {
        border-color: color-mix(in srgb, var(--ai) 55%, var(--line2));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--ai-bg) 70%, transparent);
      }

      .cbe-control-field input::placeholder { color: var(--dim2); }

      /* 문자열 치환: 찾기 → 바꾸기 흐름 */
      .cbe-replace-setup { display: grid; gap: 10px; }
      .cbe-replace-flow {
        display: grid;
        grid-template-columns: minmax(0,1fr) auto minmax(0,1fr);
        gap: 10px;
        align-items: end;
      }
      .cbe-flow-arrow {
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--dim2);
        font-size: 16px;
        padding-bottom: 1px;
      }
      .cbe-replace-meta {
        display: flex;
        align-items: end;
        gap: 10px;
      }
      .cbe-inline-select { width: 118px; }
      .cbe-inline-select .cbe-control-label { margin-bottom: 6px; }
      .cbe-inline-option {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 36px;
        color: var(--dim);
        font-size: 11.5px;
        cursor: pointer;
        white-space: nowrap;
      }
      .cbe-inline-option input {
        accent-color: var(--ai);
        width: 13px;
        height: 13px;
      }
      .cbe-setup-spacer { flex: 1; }

      /* 연속 번호: 패턴 + 시작 번호를 하나의 설정 묶음으로 */
      .cbe-turn-setup { display: grid; gap: 8px; }
      .cbe-turn-primary {
        display: flex;
        align-items: end;
        gap: 10px;
      }
      .cbe-turn-pattern input {
        font: 12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      }
      .cbe-turn-start { width: 112px; flex: 0 0 112px; }
      .cbe-turn-hint {
        display: flex;
        align-items: center;
        gap: 7px;
        color: var(--dim);
        font-size: 11px;
        line-height: 1.45;
      }
      .cbe-turn-hint code {
        padding: 1px 5px;
        border-radius: 5px;
        background: var(--bg3);
        color: var(--fg);
        font: 10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
      }

      /* ---------- 버튼 ---------- */
      .cbe-btn {
        height: 34px; padding: 0 16px; border-radius: 9px;
        border: 1px solid var(--line2); background: transparent;
        color: var(--fg); font-weight: 600; font-size: 12.5px;
      }
      .cbe-btn.primary { border: 0; background: var(--pri); color: var(--pri-fg); font-weight: 700; }
      .cbe-btn.danger {
        height: 30px; padding: 0 13px; border-radius: 8px;
        border: 1px solid var(--del-bg); background: var(--del-bg);
        color: var(--del); font-weight: 800; font-size: 12px;
      }
      .cbe-btn.small { height: 30px; padding: 0 12px; border-radius: 8px; font-size: 12px; }
      .cbe-btn:disabled { opacity: .38; cursor: not-allowed; }

      /* ---------- 상태 바 ---------- */
      #${ID.status} {
        display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
        margin: 11px 16px 0; padding: 9px 12px;
        border-radius: 10px; font-size: 12.5px; line-height: 1.45;
        background: rgba(127,127,127,.12); flex: 0 0 auto;
      }
      #${ID.status}[hidden] { display: none; }
      #${ID.status}[data-type="ok"] { background: var(--ok-bg); }
      #${ID.status}[data-type="error"] { background: var(--del-bg); color: var(--del); }
      #${ID.status}[data-type="warn"] { background: var(--warn-bg); color: var(--warn); }
      #${ID.status}[data-type="busy"] { background: var(--busy-bg); color: var(--busy); }
      #${ID.statusText} { flex: 1; min-width: 120px; }
      #${ID.statusText} b { font-weight: 800; }
      #${ID.statusExtra} { display: inline-flex; gap: 6px; flex-wrap: wrap; }
      #${ID.statusActions} { display: inline-flex; gap: 6px; }

      .cbe-pill {
        font-size: 10.5px; font-weight: 800; padding: 2px 7px;
        border-radius: 999px; white-space: nowrap;
      }
      .cbe-pill.ai { background: var(--ai-bg); color: var(--ai); }
      .cbe-pill.user { background: var(--user-bg); color: var(--user); }
      .cbe-pill.warn { background: var(--warn-bg); color: var(--warn); }

      #${ID.progress} {
        height: 3px; border-radius: 99px; background: var(--bg3);
        margin: 9px 16px 0; overflow: hidden; flex: 0 0 auto;
      }
      #${ID.progress}[hidden] { display: none; }
      #${ID.progress} i {
        display: block; height: 100%; width: 0%;
        background: var(--busy); transition: width .2s ease;
      }

      /* ---------- 본문 ---------- */
      .cbe-body {
        overflow-y: auto; overflow-x: hidden;
        padding: 12px 16px 16px;
        min-width: 0;
      }
      .cbe-pane[hidden] { display: none !important; }
      .cbe-pane { min-width: 0; }
      .cbe-setup + .cbe-preview-list,
      .cbe-setup + .cbe-range,
      .cbe-check + .cbe-tools { margin-top: 10px; }
      [data-cbe-turn-tools][hidden] { display: none !important; }

      .cbe-empty {
        padding: 32px 18px; border: 1px dashed var(--line2); border-radius: 12px;
        text-align: center; color: var(--dim); font-size: 12.5px; line-height: 1.7;
      }
      .cbe-empty strong {
        display: block; color: var(--fg); font-size: 13px;
        font-weight: 700; margin-bottom: 5px;
      }
      .cbe-more {
        margin-top: 7px; padding: 14px; border-radius: 10px;
        background: var(--bg2); color: var(--dim);
        text-align: center; font-size: 12px;
      }

      .cbe-preview-list {
        display: grid; gap: 7px;
        width: 100%; max-width: 100%; min-width: 0;
        overflow-x: hidden;
      }

      .cbe-preview-item {
        border: 1px solid var(--line); border-radius: 11px;
        background: var(--bg2); overflow: hidden;
      }
      .cbe-preview-item > header {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 11px; font-size: 11px; color: var(--dim); cursor: pointer;
      }
      .cbe-preview-item > header b { color: var(--fg); font-size: 11.5px; }
      .cbe-preview-item > header time { margin-left: auto; }
      .cbe-preview-item > header .cbe-caret { opacity: .5; }
      .cbe-preview-item.collapsed .cbe-diff { display: none; }
      .cbe-preview-item.fail { border-color: var(--del-bg); }
      .cbe-preview-item .cbe-fail-msg { color: var(--del); font-weight: 700; }

      .cbe-role {
        display: inline-flex; align-items: center; justify-content: center;
        height: 19px; padding: 0 7px; border-radius: 5px;
        font-size: 10px; font-weight: 800; letter-spacing: .04em;
      }
      .cbe-role.ai { background: var(--ai-bg); color: var(--ai); }
      .cbe-role.user { background: var(--user-bg); color: var(--user); }

      .cbe-diff {
        display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
        background: var(--line); border-top: 1px solid var(--line);
      }
      .cbe-diff > section { background: var(--bg); padding: 10px 11px; min-width: 0; }
      .cbe-diff .cbe-k {
        font-size: 10px; font-weight: 800; letter-spacing: .06em;
        color: var(--dim2); margin-bottom: 6px;
      }
      .cbe-diff pre { max-height: 150px; overflow: auto; }
      .cbe-diff .d-inline { display: none; }

      /* ---------- 턴 탭 ---------- */
      .cbe-range {
        display: flex; align-items: center;
        margin-bottom: 9px; padding: 11px 14px; border-radius: 11px;
        background: var(--bg2); border: 1px solid var(--line);
      }
      .cbe-range .cbe-end { min-width: 0; }
      .cbe-range .cbe-end .k {
        font-size: 10px; font-weight: 800; letter-spacing: .08em; color: var(--dim2);
      }
      .cbe-range .cbe-end .v {
        font-size: 14px; font-weight: 800; letter-spacing: -.02em; margin-top: 2px;
      }
      .cbe-range .cbe-end .s {
        display: block; font-size: 10.5px; color: var(--dim); margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
      }
      .cbe-range .cbe-line {
        flex: 1; height: 1px; background: var(--line2); margin: 0 14px; position: relative;
      }
      .cbe-range .cbe-line span {
        position: absolute; top: -9px; left: 50%; transform: translateX(-50%);
        background: var(--bg2); padding: 0 8px;
        font-size: 10.5px; color: var(--dim); white-space: nowrap;
      }
      .cbe-range .cbe-end.right { text-align: right; }
      .cbe-range .cbe-end.right .s { margin-left: auto; }

      .cbe-check {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        margin-bottom: 12px; padding: 8px 13px; border-radius: 10px;
        background: var(--ok-bg); font-size: 12px; color: var(--ok); font-weight: 700;
      }
      .cbe-check.off { background: var(--bg2); color: var(--dim); }
      .cbe-check .cbe-spacer { flex: 1; }
      .cbe-check label {
        display: inline-flex; align-items: center; gap: 6px;
        font-weight: 600; opacity: .85;
      }
      .cbe-check input[type="number"] {
        width: 58px; height: 26px; border: 1px solid var(--line2); border-radius: 7px;
        background: var(--bg); color: var(--fg);
        text-align: center; outline: none; font-size: 12px;
      }

      .cbe-tools { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
      .cbe-tools .cbe-search {
        flex: 1; height: 32px; border: 1px solid var(--line2); border-radius: 9px;
        background: var(--bg2); color: var(--fg); padding: 0 11px; outline: none;
      }
      .cbe-tools .cbe-search::placeholder { color: var(--dim2); }
      .cbe-tools .cbe-toggle {
        display: inline-flex; align-items: center; gap: 6px;
        height: 32px; padding: 0 11px; border-radius: 9px;
        border: 1px solid var(--line2); background: transparent;
        color: var(--dim); font-size: 11.5px; font-weight: 700; cursor: pointer;
      }
      .cbe-tools .cbe-toggle input { accent-color: var(--ai); }

      .cbe-menu { position: relative; }
      .cbe-menu > summary {
        list-style: none; width: 32px; height: 32px; border-radius: 9px;
        border: 1px solid var(--line2); color: var(--dim);
        display: flex; align-items: center; justify-content: center; cursor: pointer;
      }
      .cbe-menu > summary::-webkit-details-marker { display: none; }
      .cbe-menu[open] > summary { background: var(--bg2); color: var(--fg); }
      .cbe-menu > div {
        position: absolute; right: 0; top: 38px; z-index: 5;
        display: grid; gap: 4px; padding: 6px; min-width: 168px;
        border: 1px solid var(--line2); border-radius: 10px;
        background: var(--bg); box-shadow: 0 12px 32px rgba(0,0,0,.35);
      }
      .cbe-menu > div button {
        height: 30px; padding: 0 10px; border: 0; border-radius: 7px;
        background: transparent; color: var(--fg);
        font-size: 12px; font-weight: 600; text-align: left;
      }
      .cbe-menu > div button:hover { background: var(--bg2); }

      .cbe-turn-item {
        display: flex; align-items: center; gap: 9px;
        width: 100%; max-width: 100%; min-width: 0;
        padding: 8px 10px; border: 1px solid var(--line);
        border-radius: 10px; background: var(--bg2);
        overflow: hidden;
      }
      .cbe-turn-item.is-start { box-shadow: inset 2px 0 0 var(--ai); }
      .cbe-turn-item.is-end { box-shadow: inset -2px 0 0 var(--user); }
      .cbe-turn-item.is-start.is-end { box-shadow: inset 2px 0 0 var(--ai), inset -2px 0 0 var(--user); }
      .cbe-turn-item.excluded { opacity: .45; }
      .cbe-turn-item.review { border-color: var(--warn-bg); flex-wrap: wrap; }
      .cbe-turn-item .cbe-idx {
        flex: 0 0 auto;
        font-size: 11px; color: var(--dim2); min-width: 42px;
      }
      .cbe-turn-item .cbe-text {
        flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font: 11.5px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color: var(--dim);
      }
      .cbe-turn-item .cbe-move {
        flex: 0 0 auto;
        font-size: 11.5px; font-weight: 800; font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cbe-turn-item .cbe-move.changed { color: var(--warn); }
      .cbe-turn-item .cbe-move.same { color: var(--dim2); }
      .cbe-turn-item .cbe-item-actions {
        display: none;
        flex: 0 0 auto;
        gap: 4px;
      }
      .cbe-turn-item:hover .cbe-item-actions,
      .cbe-turn-item:focus-within .cbe-item-actions {
        display: flex;
      }
      .cbe-mini-btn {
        height: 26px; padding: 0 8px; border-radius: 7px;
        border: 1px solid var(--line2); background: transparent; color: var(--dim);
        font-size: 11px; font-weight: 700;
      }
      .cbe-mini-btn:hover { background: var(--bg3); color: var(--fg); }
      .cbe-mini-btn.selected { background: var(--ai-bg); color: var(--ai); border-color: transparent; }
      .cbe-mini-btn.danger-lite:hover { background: var(--del-bg); color: var(--del); }
      .cbe-occurrences {
        flex: 1 0 100%; margin-top: 7px; padding: 8px;
        border-radius: 8px; background: var(--warn-bg);
      }
      .cbe-occurrences strong {
        display: block; font-size: 11px; margin-bottom: 6px; color: var(--warn);
      }
      .cbe-occurrences > div { display: flex; flex-wrap: wrap; gap: 5px; }

      /* ---------- 푸터 / 로그 ---------- */
      .cbe-foot {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 16px; border-top: 1px solid var(--line);
        color: var(--dim); font-size: 11.5px; flex: 0 0 auto;
      }
      .cbe-foot .cbe-spacer { flex: 1; }

      .cbe-log-wrap { display: none; margin: 0 16px 14px; flex: 0 0 auto; }
      #${ID.panel}.show-log .cbe-log-wrap { display: block; }
      #${ID.log} {
        margin: 0; padding: 10px 11px; max-height: 150px; overflow: auto;
        border: 1px solid var(--line); border-radius: 10px;
        background: var(--bg2);
        font: 11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        white-space: pre-wrap; overflow-wrap: anywhere;
      }

      /* ---------- 좁은 화면 ---------- */
      @media (max-width: 820px) {
        #${ID.overlay} { padding: 8px; align-items: stretch; }
        #${ID.panel} { max-height: calc(100vh - 16px); border-radius: 14px; }
        .cbe-body { padding: 10px 12px 14px; }
        .cbe-tabs, #${ID.status}, #${ID.progress} { margin-left: 12px; margin-right: 12px; }
        .cbe-setup { padding: 10px; }
        .cbe-replace-flow { grid-template-columns: 1fr; gap: 8px; }
        .cbe-flow-arrow {
          height: 14px;
          justify-content: flex-start;
          padding-left: 10px;
          transform: rotate(90deg);
          transform-origin: 18px 7px;
        }
        .cbe-replace-meta { flex-wrap: wrap; align-items: center; }
        .cbe-inline-select { width: 112px; }
        .cbe-turn-primary { display: grid; grid-template-columns: 1fr 96px; }
        .cbe-turn-primary .cbe-btn { grid-column: 1 / -1; }
        .cbe-turn-start { width: auto; min-width: 0; }

        .cbe-diff { grid-template-columns: 1fr; }
        .cbe-diff .d-before, .cbe-diff .d-after { display: none; }
        .cbe-diff .d-inline { display: block; }

        .cbe-range { flex-direction: column; align-items: stretch; gap: 8px; }
        .cbe-range .cbe-line { display: none; }
        .cbe-range .cbe-end.right { text-align: left; }
        .cbe-range .cbe-end .s { max-width: 100%; }

        .cbe-turn-item { flex-wrap: wrap; }
        .cbe-turn-item .cbe-text { flex-basis: 0; }
        .cbe-turn-item .cbe-item-actions {
          display: flex;
          flex: 1 0 100%;
          justify-content: flex-end;
          padding-top: 2px;
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
          <strong>🔁 LogShift <span class="cbe-title-ko">(로그 일괄 편집기)</span></strong>
          <button type="button" class="cbe-icon cbe-btn" id="${ID.undo}" title="직전 작업 되돌리기">↺</button>
          <button type="button" class="cbe-icon cbe-btn" id="${ID.exportBackup}" title="백업 JSON 저장">⤓</button>
          <button type="button" class="cbe-icon" id="${ID.logToggle}" title="작업 로그">☰</button>
          <button type="button" class="cbe-icon" data-cbe-close aria-label="닫기">✕</button>
        </div>

        <div class="cbe-tabs">
          <button id="${ID.tabReplace}" type="button" class="cbe-tab active">문자열 치환</button>
          <button id="${ID.tabTurn}" type="button" class="cbe-tab">연속 번호</button>
        </div>

        <div id="${ID.status}" data-type="neutral" hidden>
          <span id="${ID.statusText}"></span>
          <span id="${ID.statusExtra}"></span>
          <span id="${ID.statusActions}">
            <button id="${ID.replaceApply}" type="button" class="cbe-btn danger" disabled>일괄 수정</button>
            <button id="${ID.turnApply}" type="button" class="cbe-btn danger" disabled hidden>재번호 적용</button>
            <button id="${ID.cancel}" type="button" class="cbe-btn small" disabled style="display:none">중단</button>
          </span>
        </div>

        <div id="${ID.progress}" hidden><i></i></div>

        <div class="cbe-body">
          <section id="${ID.paneReplace}" class="cbe-pane">
            <div class="cbe-setup cbe-replace-setup">
              <div class="cbe-replace-flow">
                <label class="cbe-control-field">
                  <span class="cbe-control-label">찾을 내용</span>
                  <input id="${ID.find}" type="text" autocomplete="off" placeholder="로그에서 찾을 문자열">
                </label>

                <span class="cbe-flow-arrow" aria-hidden="true">→</span>

                <label class="cbe-control-field">
                  <span class="cbe-control-label">바꿀 내용</span>
                  <input id="${ID.replace}" type="text" autocomplete="off" placeholder="비워두면 삭제">
                </label>
              </div>

              <div class="cbe-replace-meta">
                <label class="cbe-inline-select">
                  <span class="cbe-control-label">대상</span>
                  <select id="${ID.target}">
                    <option value="all">전체</option>
                    <option value="assistant">AI만</option>
                    <option value="user">USER만</option>
                  </select>
                </label>

                <label class="cbe-inline-option">
                  <input id="${ID.caseSensitive}" type="checkbox">
                  대소문자 구분
                </label>

                <span class="cbe-setup-spacer"></span>
                <button id="${ID.replaceScan}" type="button" class="cbe-btn primary">변경점 검사</button>
              </div>
            </div>

            <div id="${ID.replaceSummary}"></div>
            <div id="${ID.replacePreview}" class="cbe-preview-list" style="margin-top:10px">
              <div class="cbe-empty">
                <strong>문자열을 한꺼번에 바꿉니다</strong>
                찾을 내용과 바꿀 내용을 넣고 먼저 변경점을 검사하세요.
              </div>
            </div>
          </section>

          <section id="${ID.paneTurn}" class="cbe-pane" hidden>
            <div class="cbe-setup cbe-turn-setup">
              <div class="cbe-turn-primary">
                <label class="cbe-control-field grow cbe-turn-pattern">
                  <span class="cbe-control-label">턴 번호 형식</span>
                  <input id="${ID.turnPattern}" type="text" autocomplete="off"
                         placeholder="예: **[{N}]**"
                         title="실제 숫자가 들어가는 자리를 {N}으로 적습니다">
                </label>

                <label class="cbe-control-field cbe-turn-start">
                  <span class="cbe-control-label">시작 턴</span>
                  <input id="${ID.turnStartNumber}" type="number" step="1" placeholder="자동">
                </label>

                <button id="${ID.turnAnalyze}" type="button" class="cbe-btn primary">턴 로그 분석</button>
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
              <span id="${ID.turnVerify}"></span>
            </div>

            <div class="cbe-tools" data-cbe-turn-tools hidden>
              <input id="${ID.turnFilter}" type="text" autocomplete="off"
                     class="cbe-search" placeholder="후보 안에서 번호 · 본문 검색">
              <label class="cbe-toggle">
                <input id="${ID.turnOnlyReview}" type="checkbox">
                검토 필요만
              </label>
              <details class="cbe-menu" id="${ID.turnMenu}">
                <summary title="더보기">⋯</summary>
                <div>
                  <button id="${ID.turnFirstAnchor}" type="button">첫 후보를 시작점으로</button>
                  <button id="${ID.turnLatestAnchor}" type="button">마지막 후보를 끝점으로</button>
                  <button id="${ID.turnExcludeFiltered}" type="button">검색결과 모두 제외</button>
                  <button id="${ID.turnIncludeFiltered}" type="button">검색결과 모두 포함</button>
                </div>
              </details>
            </div>

            <div id="${ID.turnCandidateList}" class="cbe-preview-list" style="margin-top:10px">
              <div class="cbe-empty">
                <strong>턴 번호 구간을 다시 매깁니다</strong>
                위에서 턴 번호 형식과 시작 턴을 정한 뒤 분석하세요.
              </div>
            </div>
          </section>
        </div>

        <div class="cbe-log-wrap"><pre id="${ID.log}"></pre></div>

        <div class="cbe-foot">
          <span id="cbe-foot-left">적용 전 원문 자동 백업</span>
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

    document.getElementById(ID.tabReplace)?.addEventListener('click', () => switchTab('replace'));
    document.getElementById(ID.tabTurn)?.addEventListener('click', () => switchTab('turn'));

    document.getElementById(ID.logToggle)?.addEventListener('click', () => {
      document.getElementById(ID.panel)?.classList.toggle('show-log');
    });

    document.getElementById(ID.replaceScan)?.addEventListener('click', handleReplaceScan);
    document.getElementById(ID.replaceApply)?.addEventListener('click', handleReplaceApply);
    document.getElementById(ID.find)?.addEventListener('input', invalidateReplaceScan);
    document.getElementById(ID.replace)?.addEventListener('input', invalidateReplaceScan);
    document.getElementById(ID.target)?.addEventListener('change', invalidateReplaceScan);
    document.getElementById(ID.caseSensitive)?.addEventListener('change', invalidateReplaceScan);
    document.getElementById(ID.replacePreview)?.addEventListener('click', event => {
      const header = event.target.closest('.cbe-preview-item > header');
      if (header) header.parentElement.classList.toggle('collapsed');
    });

    document.getElementById(ID.turnAnalyze)?.addEventListener('click', handleTurnAnalyze);
    document.getElementById(ID.turnApply)?.addEventListener('click', handleTurnApply);
    document.getElementById(ID.turnPattern)?.addEventListener('input', invalidateTurnAnalysis);
    document.getElementById(ID.turnStartNumber)?.addEventListener('input', handleTurnStartNumberInput);
    document.getElementById(ID.turnExpectedEnd)?.addEventListener('input', handleTurnExpectedEndInput);
    document.getElementById(ID.turnFilter)?.addEventListener('input', renderTurnCandidates);
    document.getElementById(ID.turnOnlyReview)?.addEventListener('change', renderTurnCandidates);
    document.getElementById(ID.turnCandidateList)?.addEventListener('click', handleTurnCandidateListClick);
    document.getElementById(ID.turnFirstAnchor)?.addEventListener('click', handleTurnFirstAnchor);
    document.getElementById(ID.turnLatestAnchor)?.addEventListener('click', handleTurnLatestAnchor);
    document.getElementById(ID.turnExcludeFiltered)?.addEventListener(
      'click', () => handleBulkTurnCandidateMode('exclude')
    );
    document.getElementById(ID.turnIncludeFiltered)?.addEventListener(
      'click', () => handleBulkTurnCandidateMode('include')
    );

    document.getElementById(ID.cancel)?.addEventListener('click', handleCancel);
    document.getElementById(ID.undo)?.addEventListener('click', handleUndo);
    document.getElementById(ID.exportBackup)?.addEventListener('click', handleExportBackup);

    document.addEventListener('keydown', event => {
      if (
        event.key === 'Escape' &&
        document.getElementById(ID.overlay)?.style.display !== 'none'
      ) {
        closePanel();
      }
    });

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
    button.innerHTML = '<span class="cbe-launch-icon" aria-hidden="true">⇄</span>';
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