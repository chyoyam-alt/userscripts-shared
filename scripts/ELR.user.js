// ==UserScript==
// @name         ♻️ ELR (에리 로어 제외 재전송)
// @namespace    local.crack.elr
// @version      1.6.1
// @description  에리 로어 설치 여부와 무관하게 마지막 USER 원문을 다시 보냅니다. 에리가 있으면 이번 전송만 에리 처리에서 제외하고, 호환 Wish에는 같은 턴 재전송 신호를 전달합니다.
// @author       ChatGPT
// @downloadURL  https://gist.github.com/chyoyam-alt/15d02dc45fe3ea2fd5396f774ca42a04/raw/ELR.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/15d02dc45fe3ea2fd5396f774ca42a04/raw/ELR.user.js
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @match        https://crack.wrtn.ai/characters/*/chats/*
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const PAGE = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const SCRIPT_ID = 'ELR';
  const VERSION = '1.6.1';
  const RECOVERY_KEY = 'elr:last-recovery:v1';
  const CHAT_PATH_RE = /^\/(?:stories\/[^/]+\/episodes|characters\/[^/]+\/chats|u\/[^/]+\/c)\/([^/?#]+)/;

  const RESEND_ICON_HTML = `
    <svg class="elr-resend-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.3 2.6a1.1 1.1 0 0 0-1.02.7L6.7 4.7H3.8a1 1 0 0 0 0 2h10.4a1 1 0 0 0 0-2h-2.9l-.58-1.4a1.1 1.1 0 0 0-1.02-.7H8.3z"/>
      <path d="M5.2 8.1l.72 8.9A2.4 2.4 0 0 0 8.3 19.2h1.5a7.2 7.2 0 0 1 5.2-9.9l.12-1.2H5.2z"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M17.8 11.4a5.4 5.4 0 1 0 5.1 7 .95.95 0 0 0-1.8-.6 3.5 3.5 0 1 1-.36-2.9h-1.3a.95.95 0 0 0 0 1.9h3.2a.95.95 0 0 0 .95-.95v-3.2a.95.95 0 1 0-1.9 0v.5a5.38 5.38 0 0 0-3.94-1.75z"/>
    </svg>`;

  const RESENT_OK_ICON_HTML = `
    <svg class="elr-resend-svg elr-resend-ok-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.3 2.6a1.1 1.1 0 0 0-1.02.7L6.7 4.7H3.8a1 1 0 0 0 0 2h10.4a1 1 0 0 0 0-2h-2.9l-.58-1.4a1.1 1.1 0 0 0-1.02-.7H8.3z"/>
      <path d="M5.2 8.1l.72 8.9A2.4 2.4 0 0 0 8.3 19.2h1.5a7.2 7.2 0 0 1 5.2-9.9l.12-1.2H5.2z"/>
      <path d="M14.4 16.8l2.15 2.15 4.45-5.15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const state = {
    busy: false,
    originalInject: null,
    wrapper: null,
    bridgeReady: false,
    bypassTicket: null,
    activeButton: null,
    injectScheduled: false,
    latestUserContainer: null,
    lastMessageScanAt: 0,
    currentHref: location.href,
    activationButton: null,
    activationAt: 0,
    recoveryClearTimer: null,
    lastResentMessageId: null,
    toastHideTimer: null,
    toastRemoveTimer: null,
    wishReplay: null,
  };

  const log = (...args) => console.log(`[${SCRIPT_ID} ${VERSION}]`, ...args);
  const warn = (...args) => console.warn(`[${SCRIPT_ID} ${VERSION}]`, ...args);

  function getChatId() {
    return location.pathname.match(CHAT_PATH_RE)?.[1] || null;
  }

  function isChatPage() {
    return Boolean(getChatId());
  }

  function getCookie(name) {
    const escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  function authHeaders() {
    const token = getCookie('access_token');
    if (!token) throw new Error('크랙 로그인 토큰을 찾지 못했습니다. 페이지를 새로고침해 주세요.');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async function authFetch(url, options = {}) {
    let response;

    try {
      response = await PAGE.fetch(url, {
        ...options,
        headers: {
          ...authHeaders(),
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      warn('크랙 서버 연결 실패', { url, error });
      throw new Error('크랙 서버와 연결하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }

    if (!response.ok) {
      let detail = '';
      try {
        detail = JSON.stringify(await response.json());
      } catch (_) {
        try { detail = await response.text(); } catch (_) { /* 응답 내용을 읽지 못해도 계속 처리합니다. */ }
      }

      warn('크랙 서버 요청 실패', {
        url,
        status: response.status,
        detail,
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('로그인 정보를 확인하지 못했습니다. 크랙에 다시 로그인하거나 페이지를 새로고침해 주세요.');
      }

      throw new Error('크랙 서버와 통신하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    }

    if (response.status === 204) return null;
    const bodyText = await response.text();
    return bodyText ? JSON.parse(bodyText) : null;
  }

  async function fetchMessages(chatId, limit = 5) {
    const url = `https://contents-api.wrtn.ai/character-chat/v3/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}`;
    const result = await authFetch(url, { method: 'GET' });
    return Array.isArray(result?.data?.messages) ? result.data.messages : [];
  }

  function getReactFiber(node) {
    if (!(node instanceof Element)) return null;

    let cursor = node;
    for (let depth = 0; cursor instanceof Element && depth < 12; depth += 1, cursor = cursor.parentElement) {
      const key = Object.getOwnPropertyNames(cursor).find(name => (
        name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$')
      ));
      if (key && cursor[key]) return cursor[key];
    }
    return null;
  }

  function providerValues(fiber) {
    const values = [];
    for (const candidate of [fiber, fiber?.alternate]) {
      if (!candidate) continue;
      for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
        const value = props?.value;
        if (value && typeof value === 'object' && !values.includes(value)) values.push(value);
      }
    }
    return values;
  }

  function isNativeActionController(value) {
    try {
      return Boolean(
        value
        && typeof value.sendMessage === 'function'
        && typeof value.removeMessage === 'function'
        && typeof value.stopMessage === 'function'
        && typeof value.autoPlay === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  function isNativeStatusController(value, chatId) {
    try {
      return Boolean(
        value
        && String(value.chatId || '') === String(chatId)
        && typeof value.status === 'string'
        && Object.prototype.hasOwnProperty.call(value, 'selectedMessageId')
      );
    } catch (_) {
      return false;
    }
  }

  function nativeControllerFromFiber(startFiber, chatId) {
    let actions = null;
    let status = null;
    let fiber = startFiber;

    for (let depth = 0; fiber && depth < 240; depth += 1, fiber = fiber.return) {
      for (const value of providerValues(fiber)) {
        if (!actions && isNativeActionController(value)) actions = value;
        if (!status && isNativeStatusController(value, chatId)) status = value;
      }
      if (actions && status) return { actions, status };
    }
    return null;
  }

  function nativeControllerAnchors(button) {
    const anchors = [];
    const add = node => {
      if (node instanceof Element && !anchors.includes(node)) anchors.push(node);
    };

    add(button?.closest?.('[data-elr-user-message]'));
    add(button?.parentElement);

    for (const container of findUserMessageContainers().slice().reverse()) add(container);

    // 메시지 쪽 React 경로를 못 찾는 레이아웃에서는 크랙의 원래 버튼을 기준으로 다시 찾습니다.
    for (const nativeButton of document.querySelectorAll('button')) {
      if (!nativeButton.classList.contains('elr-message-resend-btn')) add(nativeButton);
    }

    return anchors;
  }

  function findNativeChatController(button, chatId) {
    for (const anchor of nativeControllerAnchors(button)) {
      const fiber = getReactFiber(anchor);
      if (!fiber) continue;
      const found = nativeControllerFromFiber(fiber, chatId);
      if (found) {
        log('크랙 내부 메시지 컨트롤러 확인', {
          status: found.status.status,
          actions: Object.keys(found.actions).sort(),
        });
        return found;
      }
    }
    return null;
  }

  function startNativeSend(actions, message) {
    let rejectFailure;
    const failure = new Promise((_, reject) => { rejectFailure = reject; });

    try {
      actions.sendMessage(message, {
        actionType: 'click',
        onFail: detail => {
          const code = detail?.code ? ` (${detail.code})` : '';
          rejectFailure(new Error(`크랙 내부 전송이 거부되었습니다${code}.`));
        },
      });
    } catch (error) {
      rejectFailure(error instanceof Error ? error : new Error(String(error)));
    }

    return failure;
  }

  function messageIdOf(message) {
    return message?._id || message?.id || null;
  }

  function saveRecovery(payload) {
    if (state.recoveryClearTimer) {
      clearTimeout(state.recoveryClearTimer);
      state.recoveryClearTimer = null;
    }

    try {
      localStorage.setItem(RECOVERY_KEY, JSON.stringify({
        ...payload,
        savedAt: Date.now(),
      }));
    } catch (error) {
      warn('복구용 원문 저장 실패', error);
    }
  }

  function clearRecovery() {
    try { localStorage.removeItem(RECOVERY_KEY); } catch (_) { /* 저장값이 없어도 문제없습니다. */ }
  }

  function keepRecoveryForAWhile(delayMs = 5 * 60_000) {
    if (state.recoveryClearTimer) clearTimeout(state.recoveryClearTimer);

    state.recoveryClearTimer = setTimeout(() => {
      clearRecovery();
      state.recoveryClearTimer = null;
    }, delayMs);
  }

  function loadRecovery() {
    try {
      const raw = localStorage.getItem(RECOVERY_KEY);
      if (!raw) return null;

      const recovery = JSON.parse(raw);
      if (recovery?.savedAt && Date.now() - recovery.savedAt > 5 * 60_000) {
        clearRecovery();
        return null;
      }

      return recovery;
    } catch (_) {
      return null;
    }
  }

  function makeTicket(message) {
    state.bypassTicket = {
      message: String(message),
      expiresAt: Date.now() + 30_000,
      consumed: false,
    };
  }

  function clearTicket() {
    state.bypassTicket = null;
  }

  // Wish RP Manager 2.3.3+ 호환: 이 삭제→재전송을 새 USER 턴이 아니라
  // 같은 USER 턴의 교체로 취급할 수 있도록 짧은 런타임 신호만 전달합니다.
  // Wish가 설치되지 않았으면 CustomEvent는 아무 효과 없이 끝납니다.
  function dispatchWishReplay(type, detail = {}) {
    try {
      PAGE.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
      return true;
    } catch (error) {
      warn('Wish 재전송 호환 신호 전달 실패', error);
      return false;
    }
  }

  function beginWishReplay(chatId, oldUserId) {
    const token = crypto.randomUUID();
    state.wishReplay = {
      token,
      chatId: String(chatId || ''),
      oldUserId: String(oldUserId || ''),
      startedAt: Date.now(),
    };
    dispatchWishReplay('wish:external-replay-begin', {
      source: SCRIPT_ID,
      token,
      apiChatId: state.wishReplay.chatId,
      oldUserId: state.wishReplay.oldUserId,
      at: state.wishReplay.startedAt,
    });
    return token;
  }

  function confirmWishReplay(newUserId) {
    const replay = state.wishReplay;
    if (!replay) return;
    dispatchWishReplay('wish:external-replay-user-replaced', {
      source: SCRIPT_ID,
      token: replay.token,
      apiChatId: replay.chatId,
      oldUserId: replay.oldUserId,
      newUserId: String(newUserId || ''),
      at: Date.now(),
    });
    state.wishReplay = null;
  }

  function cancelWishReplay(reason = '') {
    const replay = state.wishReplay;
    if (!replay) return;
    dispatchWishReplay('wish:external-replay-cancel', {
      source: SCRIPT_ID,
      token: replay.token,
      apiChatId: replay.chatId,
      oldUserId: replay.oldUserId,
      reason: String(reason || ''),
      at: Date.now(),
    });
    state.wishReplay = null;
  }

  function installLoreBridge() {
    const lore = PAGE.__LoreInj;
    const register = PAGE.__loreRegister;

    if (!lore?.__injectLoaded || typeof lore.inject !== 'function' || typeof register !== 'function') {
      state.bridgeReady = false;
      syncButtons();
      return false;
    }

    if (state.originalInject !== lore.inject || !state.wrapper) {
      state.originalInject = lore.inject;
      state.wrapper = async function elrLoreWrapper(message) {
        const text = String(message ?? '');
        const ticket = state.bypassTicket;

        if (
          ticket &&
          !ticket.consumed &&
          Date.now() <= ticket.expiresAt &&
          text === ticket.message
        ) {
          ticket.consumed = true;
          log('이번 재전송은 에리 처리에서 제외합니다.');
          return message;
        }

        return state.originalInject(message);
      };
    }

    register(state.wrapper);
    state.bridgeReady = true;
    syncButtons();
    return true;
  }

  async function waitUntilDeleted(chatId, deletedId, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs;
    let latest = [];

    do {
      latest = await fetchMessages(chatId, 5);
      if (!latest.some(message => messageIdOf(message) === deletedId)) return latest;
      await sleep(180);
    } while (Date.now() < deadline);

    throw new Error('사용자 메시지 삭제가 서버에 반영되지 않았습니다.');
  }

  async function waitForResentUserMessage(chatId, knownMessageIds, originalContent, timeoutMs = 10_000) {
    const normalized = String(originalContent ?? '').replace(/\r\n?/g, '\n');
    const deadline = Date.now() + timeoutMs;

    do {
      const messages = await fetchMessages(chatId, 12);
      const resent = messages.find(message => {
        const messageId = messageIdOf(message);
        if (message?.role !== 'user' || !messageId) return false;

        // 작업을 시작하기 전에는 없던 새 메시지만 성공으로 인정합니다.
        if (knownMessageIds.has(messageId)) return false;

        return String(message?.content ?? '').replace(/\r\n?/g, '\n') === normalized;
      });

      if (resent) return resent;
      await sleep(180);
    } while (Date.now() < deadline);

    throw new Error('같은 내용으로 새로 만들어진 USER 메시지를 확인하지 못했습니다.');
  }

  async function resendLatestUserMessage(button) {
    if (state.busy) return;
    state.busy = true;
    state.activeButton = button instanceof HTMLElement ? button : null;
    syncButtons();

    let originalContent = '';
    let deleted = false;
    let deletionAttempted = false;

    try {
      const chatId = getChatId();
      if (!chatId) throw new Error('현재 채팅방을 확인하지 못했습니다.');

      // 에리는 선택 사항입니다. 있으면 현재 인젝터를 감싸고, 없으면 그대로 단독 재전송합니다.
      installLoreBridge();

      // 원문을 지우기 전에 크랙의 내부 삭제·전송 함수부터 확보합니다.
      // 찾지 못하면 기존 메시지는 전혀 건드리지 않습니다.
      let native = findNativeChatController(button, chatId);
      if (!native) {
        throw new Error('크랙 내부 전송 함수를 찾지 못했습니다. 페이지를 새로고침한 뒤 다시 눌러 주세요.');
      }
      if (native.status.status !== 'IDLE') {
        throw new Error('현재 답변 생성이 끝난 뒤 다시 눌러 주세요.');
      }

      const messages = await fetchMessages(chatId, 30);
      const latest = messages[0];
      if (!latest) throw new Error('다시 보낼 USER 메시지를 찾지 못했습니다.');

      if (latest.role !== 'user') {
        throw new Error('AI 답변을 먼저 삭제한 뒤 다시 눌러 주세요.');
      }

      const latestId = messageIdOf(latest);
      const rawContent = typeof latest.content === 'string' ? latest.content : '';
      if (!latestId || !rawContent) {
        throw new Error('USER 메시지 원문을 읽지 못했습니다.');
      }

      // 기존 에리 OOC를 포함한 서버 원문 전체를 그대로 보존합니다.
      originalContent = rawContent;

      // 어느 ↻ 버튼을 눌렀는지는 따로 판단하지 않습니다.
      // 서버에서 확인한 현재 마지막 USER 메시지를 그대로 다시 보냅니다.

      if (Array.isArray(latest.situationImages) && latest.situationImages.length > 0) {
        throw new Error('이미지가 포함된 USER 메시지는 자동으로 다시 보낼 수 없습니다.');
      }

      const knownMessageIds = new Set(messages.map(messageIdOf).filter(Boolean));

      saveRecovery({
        chatId,
        messageId: latestId,
        content: originalContent,
      });
      toast('재전송 중…', 'working', 10_000);

      // 서버 조회 사이에 상태가 바뀌었을 수 있으므로 삭제 직전에 최신 컨텍스트를 다시 잡습니다.
      native = findNativeChatController(button, chatId);
      if (!native) {
        throw new Error('크랙 내부 전송 함수가 사라졌습니다. 기존 USER 메시지는 그대로 두었습니다.');
      }
      if (native.status.status !== 'IDLE') {
        throw new Error('현재 답변 생성이 시작되어 재전송을 중단했습니다.');
      }

      // Wish 호환 신호는 USER 원문을 실제로 지우기 직전에 엽니다.
      // 삭제~새 USER 저장 사이의 짧은 공백을 Wish가 분기 변경/새 턴으로 오인하지 않게 합니다.
      beginWishReplay(chatId, latestId);

      deletionAttempted = true;
      await Promise.resolve(native.actions.removeMessage(latestId));

      await waitUntilDeleted(chatId, latestId);
      deleted = true;

      makeTicket(originalContent);
      const nativeFailure = startNativeSend(native.actions, originalContent);

      const resent = await Promise.race([
        waitForResentUserMessage(chatId, knownMessageIds, originalContent),
        nativeFailure,
      ]);
      const resentId = messageIdOf(resent);
      state.lastResentMessageId = resentId;
      confirmWishReplay(resentId);

      if (!state.bypassTicket?.consumed) {
        // 에리가 이 전송을 직접 보지 못한 경우에도 에리 카운트와 로어 삽입은 실행되지 않습니다.
        log('이번 재전송은 에리 처리 경로를 지나지 않았습니다.');
      }

      clearTicket();
      keepRecoveryForAWhile();
      scheduleInjectMessageButtons();
      markResentMessage(resent).catch(error => warn('재전송 표시 추가 실패', error));

      toast('재전송 완료', 'success', 1800);
      log('삭제·재전송 확인 완료', {
        oldMessageId: latestId,
        newMessageId: resentId,
      });
    } catch (error) {
      clearTicket();
      cancelWishReplay(error?.message || '재전송 실패');
      warn('재전송 실패', error);

      if ((deleted || deletionAttempted) && originalContent) {
        try {
          GM_setClipboard(originalContent, 'text');
          toast(
            `재전송 실패 · 원문을 클립보드에 복사했습니다.\n${error.message}`,
            'error',
            5000,
          );
        } catch (_) {
          toast(
            `재전송 실패 · 복구 원문은 브라우저 저장소에 남아 있습니다.\n${error.message}`,
            'error',
            5000,
          );
        }
      } else {
        toast(
          `재전송 실패\n${error?.message || '알 수 없는 문제가 발생했습니다.'}`,
          'error',
          5000,
        );
      }
    } finally {
      state.busy = false;
      state.activeButton = null;
      syncButtons();
      scheduleInjectMessageButtons();
    }
  }

  function cleanComparableText(value) {
    return String(value ?? '')
      .replace(/<ooc_lore_context>[\s\S]*?<\/ooc_lore_context>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .replace(/[`*_>#~|\[\]{}()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function messageNodeMatchesContent(node, content) {
    if (!(node instanceof HTMLElement)) return false;
    const markdown = node.querySelector('.wrtn-markdown') || node;
    const domText = cleanComparableText(markdown.innerText || markdown.textContent || '');
    const sourceText = cleanComparableText(content);
    if (!domText || !sourceText) return false;
    const probe = sourceText.slice(0, Math.min(80, sourceText.length));
    return domText.includes(probe) || sourceText.includes(domText.slice(0, Math.min(80, domText.length)));
  }

  function findRenderedResentContainer(messageId, content) {
    const containers = findUserMessageContainers();

    const exact = containers.find(container => getExactMessageIdFromNode(container) === messageId);
    if (exact) return exact;

    // 화면에서 메시지 고유 번호를 찾을 수 없을 때는 같은 내용의 가장 아래쪽 USER 메시지를 찾습니다.
    return containers
      .filter(container => messageNodeMatchesContent(container, content))
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .at(-1) || null;
  }

  async function markResentMessage(message, timeoutMs = 5_000) {
    const messageId = messageIdOf(message);
    const content = String(message?.content ?? '');
    const deadline = Date.now() + timeoutMs;
    let container = null;

    do {
      scheduleInjectMessageButtons();
      container = findRenderedResentContainer(messageId, content);
      if (container) break;
      await sleep(100);
    } while (Date.now() < deadline);

    if (!container) return false;

    const resendButton = container.querySelector('.elr-message-resend-btn');
    if (!(resendButton instanceof HTMLButtonElement)) return false;

    resendButton.classList.add('elr-resent-ok');
    resendButton.innerHTML = RESENT_OK_ICON_HTML;
    resendButton.title = '재전송 완료';

    setTimeout(() => {
      if (!resendButton.isConnected) return;
      resendButton.classList.remove('elr-resent-ok');
      resendButton.innerHTML = RESEND_ICON_HTML;
      syncButtons();
    }, 5_000);
    return true;
  }

  function getExactMessageIdFromNode(node) {
    if (!(node instanceof Element)) return null;
    const owner = node.closest('[data-message-id]');
    const value = owner?.getAttribute('data-message-id') || node.getAttribute?.('data-message-id') || null;
    return value && /^[a-f0-9]{24}$/i.test(value) ? value : null;
  }

  function getMessageIdFromNode(node) {
    if (!(node instanceof Element)) return null;
    const owner = node.closest('[data-message-id], [data-message-group-id]');
    return owner?.getAttribute('data-message-id')
      || owner?.getAttribute('data-message-group-id')
      || node.dataset?.elrMessageId
      || node.getAttribute?.('data-message-id')
      || node.getAttribute?.('data-message-group-id')
      || null;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise.then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); },
      );
    });
  }

  function toast(message, type = 'info', duration = 4000) {
    const hostId = 'elr-toast-host';
    let host = document.getElementById(hostId);
    if (!host) {
      host = document.createElement('div');
      host.id = hostId;
      (document.body || document.documentElement).appendChild(host);
    }

    let item = host.querySelector('.elr-toast');
    if (!item) {
      item = document.createElement('div');
      item.className = 'elr-toast';
      host.appendChild(item);
    }

    if (state.toastHideTimer) clearTimeout(state.toastHideTimer);
    if (state.toastRemoveTimer) clearTimeout(state.toastRemoveTimer);

    item.className = `elr-toast elr-toast-${type}`;
    item.textContent = String(message);
    item.classList.remove('elr-toast-show');
    requestAnimationFrame(() => item.classList.add('elr-toast-show'));

    state.toastHideTimer = setTimeout(() => {
      item.classList.remove('elr-toast-show');
      state.toastRemoveTimer = setTimeout(() => {
        item.remove();
        state.toastRemoveTimer = null;
      }, 180);
      state.toastHideTimer = null;
    }, duration);
  }

  function isChatUserBubble(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.classList.contains('bg-surface_chat_secondary')) return false;
    return Boolean(node.querySelector('.wrtn-markdown'));
  }

  function isNovelUserRow(node) {
    if (!(node instanceof HTMLElement)) return false;
    const classes = node.classList;
    return classes.contains('border-y')
      && classes.contains('border-outline_tertiary')
      && classes.contains('items-end')
      && classes.contains('justify-between')
      && Boolean(node.querySelector('.wrtn-markdown'));
  }

  function isUserMessageContainer(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest('#elr-toast-host, [contenteditable="true"], .ProseMirror, .tiptap')) return false;

    // 일반 채팅 화면에서는 사용자 말풍선만 찾습니다.
    const chatBubble = isChatUserBubble(node)
      ? node
      : Array.from(node.querySelectorAll('[class~="bg-surface_chat_secondary"]')).find(isChatUserBubble);
    if (chatBubble) return true;

    // 소설형 화면에서도 사용자 메시지만 찾습니다.
    if (isNovelUserRow(node)) return true;
    return Boolean(Array.from(node.querySelectorAll('[class~="border-y"][class~="border-outline_tertiary"][class~="items-end"][class~="justify-between"]'))
      .find(isNovelUserRow));
  }

  function findUserMessageContainers() {
    const found = new Set();

    // 일반 채팅 화면의 사용자 메시지를 모읍니다.
    for (const bubble of document.querySelectorAll('[class~="bg-surface_chat_secondary"]')) {
      if (!isChatUserBubble(bubble)) continue;
      const row = bubble.closest('[data-message-group-id], [data-message-id]')
        || bubble.closest('.items-end')
        || bubble.parentElement?.parentElement
        || bubble.parentElement;
      if (row instanceof HTMLElement && isUserMessageContainer(row)) found.add(row);
    }

    // 소설형 화면의 사용자 메시지를 모읍니다.
    for (const row of document.querySelectorAll('[class~="border-y"][class~="border-outline_tertiary"][class~="items-end"][class~="justify-between"]')) {
      if (!isNovelUserRow(row)) continue;
      const group = row.closest('[data-message-group-id], [data-message-id]') || row;
      if (group instanceof HTMLElement && isUserMessageContainer(group)) found.add(group);
    }

    return Array.from(found);
  }

  function cleanupMisplacedButtons() {
    for (const button of document.querySelectorAll('.elr-message-resend-btn')) {
      const container = button.closest('[data-elr-user-message], [data-message-group-id], [data-message-id]');
      if (container instanceof HTMLElement && isUserMessageContainer(container)) continue;
      const marked = button.closest('[data-elr-user-message]');
      button.closest('.elr-message-button-slot')?.remove();
      if (button.isConnected) button.remove();
      marked?.removeAttribute('data-elr-user-message');
    }
  }

  function findOptionButton(container) {
    if (!(container instanceof HTMLElement)) return null;
    const direct = container.querySelector('button[aria-label="메시지 옵션"]');
    if (direct) return direct;

    const bubble = container.querySelector('[class*="bg-surface_chat_secondary"], .wrtn-markdown');
    let cursor = bubble;
    for (let depth = 0; cursor instanceof HTMLElement && depth < 4; depth += 1, cursor = cursor.parentElement) {
      const option = cursor.querySelector(':scope > button[aria-label="메시지 옵션"], :scope > * > button[aria-label="메시지 옵션"]');
      if (option) return option;
    }
    return null;
  }

  function createMessageButton(optionButton, container) {
    // 기존 메뉴 기능이 따라오지 않도록 새 버튼을 따로 만듭니다.
    const button = document.createElement('button');
    button.type = 'button';

    // 버튼 모양만 가져오고 기존 메뉴 동작은 가져오지 않습니다.
    if (optionButton instanceof HTMLButtonElement) {
      button.className = optionButton.className;
      button.style.cssText = optionButton.style.cssText;
    }
    button.classList.add('elr-message-resend-btn');
    button.setAttribute('aria-label', '에리 로어 제외 재전송');
    button.title = '현재 마지막 USER 메시지를 에리 로어 제외 상태로 다시 전송';
    button.dataset.elrMessageId = getMessageIdFromNode(container) || '';
    button.innerHTML = RESEND_ICON_HTML;

    return button;
  }

  function eventResendButton(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest?.('.elr-message-resend-btn') || null;
  }

  function swallowButtonEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function activateMessageButton(button) {
    if (!(button instanceof HTMLButtonElement)) return;

    // 버튼을 브라우저의 disabled 상태로 만들면 클릭이 옆의 점 세 개 메뉴로 새어 나갈 수 있습니다.
    // 그래서 클릭은 항상 여기서 먼저 받은 뒤, 실행할 수 없는 이유만 안내합니다.
    if (state.busy) return;
    const now = performance.now();
    if (state.activationButton === button && now - state.activationAt < 700) return;
    state.activationButton = button;
    state.activationAt = now;

    resendLatestUserMessage(button);
  }

  function installMessageButtonEventShield() {
    // 점 세 개 메뉴가 열리지 않도록 재전송 버튼 클릭을 먼저 처리합니다.
    const blockOnly = event => {
      const button = eventResendButton(event);
      if (!button) return;
      swallowButtonEvent(event);
    };

    const activateOnPress = event => {
      const button = eventResendButton(event);
      if (!button) return;
      if (event instanceof MouseEvent && event.button !== 0) return;
      swallowButtonEvent(event);
      activateMessageButton(button);
    };

    document.addEventListener('pointerdown', activateOnPress, true);
    document.addEventListener('mousedown', blockOnly, true);
    document.addEventListener('touchstart', blockOnly, { capture: true, passive: false });
    document.addEventListener('pointerup', blockOnly, true);
    document.addEventListener('mouseup', blockOnly, true);
    document.addEventListener('touchend', blockOnly, { capture: true, passive: false });
    document.addEventListener('click', event => {
      const button = eventResendButton(event);
      if (!button) return;
      swallowButtonEvent(event);
      // 일부 환경에서는 일반 클릭 방식으로 대신 실행합니다.
      if (!('PointerEvent' in PAGE)) activateMessageButton(button);
    }, true);
    document.addEventListener('contextmenu', blockOnly, true);
    document.addEventListener('keydown', event => {
      const button = eventResendButton(event);
      if (!button || (event.key !== 'Enter' && event.key !== ' ')) return;
      swallowButtonEvent(event);
      activateMessageButton(button);
    }, true);
  }

  function injectButtonIntoContainer(container) {
    if (!(container instanceof HTMLElement)) return;
    if (container.querySelector('.elr-message-resend-btn')) return;

    const option = findOptionButton(container);
    const button = createMessageButton(option, container);

    if (option?.parentElement) {
      // ↻ 버튼을 기존 메시지 버튼 옆의 자연스러운 위치에 놓습니다.
      const bubble = container.querySelector('[class*="bg-surface_chat_secondary"]') || container.querySelector('.wrtn-markdown');
      const optionRect = option.getBoundingClientRect();
      const bubbleRect = bubble?.getBoundingClientRect?.();
      if (bubbleRect && optionRect.left >= bubbleRect.right) option.insertAdjacentElement('beforebegin', button);
      else option.insertAdjacentElement('afterend', button);
    } else {
      const bubble = container.querySelector('[class*="bg-surface_chat_secondary"]') || container.querySelector('.wrtn-markdown');
      const row = bubble?.parentElement?.parentElement || bubble?.parentElement || container;
      const slot = document.createElement('span');
      slot.className = 'elr-message-button-slot';
      slot.appendChild(button);
      row.insertBefore(slot, row.firstChild);
    }

    container.setAttribute('data-elr-user-message', 'true');
  }

  function injectMessageButtons() {
    if (!isChatPage()) return;
    cleanupMisplacedButtons();
    state.lastMessageScanAt = Date.now();

    const containers = findUserMessageContainers()
      .filter(container => container.isConnected);
    // Keep the existing visual ordering, but measure each candidate once per pass.
    const bottoms = new Map(containers.map(node => [node, node.getBoundingClientRect().bottom]));
    containers.sort((a, b) => {
        // 크랙은 메시지 DOM을 역순으로 쌓을 수 있으므로 문서 순서가 아닌 실제 화면 위치로 정렬합니다.
        const verticalDifference = bottoms.get(a) - bottoms.get(b);
        if (Math.abs(verticalDifference) > 0.5) return verticalDifference;

        // 같은 위치로 측정되는 예외 상황에서만 역방향 DOM 순서를 보조 기준으로 씁니다.
        if (a === b) return 0;
        const position = a.compareDocumentPosition(b);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return -1;
        return 0;
      });
    const latestUserContainer = containers.at(-1) || null;
    state.latestUserContainer = latestUserContainer;

    // AI 메시지가 뒤에 있더라도, 화면에서 가장 최근 USER 메시지 하나만 아이콘을 유지합니다.
    for (const button of document.querySelectorAll('.elr-message-resend-btn')) {
      if (latestUserContainer?.contains(button)) continue;

      const marked = button.closest('[data-elr-user-message]');
      const slot = button.closest('.elr-message-button-slot');
      if (slot) slot.remove();
      else button.remove();
      marked?.removeAttribute('data-elr-user-message');
    }

    for (const container of containers) {
      if (container !== latestUserContainer) container.removeAttribute('data-elr-user-message');
    }
    if (latestUserContainer) injectButtonIntoContainer(latestUserContainer);
    syncButtons();
  }

  function scheduleInjectMessageButtons() {
    if (state.injectScheduled) return;
    state.injectScheduled = true;
    requestAnimationFrame(() => {
      state.injectScheduled = false;
      injectMessageButtons();
    });
  }

  function syncButtons() {
    for (const button of document.querySelectorAll('.elr-message-resend-btn')) {
      const isActive = state.busy && button === state.activeButton;

      // 실제 disabled 속성은 쓰지 않습니다. 클릭이 옆의 점 세 개 메뉴로 새지 않게 하기 위해서입니다.
      button.disabled = false;
      button.setAttribute('aria-disabled', String(state.busy));
      button.classList.toggle('elr-busy', isActive);
      button.classList.remove('elr-not-ready');
      button.classList.toggle('elr-blocked', state.busy && !isActive);

      button.title = state.busy
        ? (isActive ? 'USER 메시지를 다시 보내는 중' : '다른 재전송이 진행 중')
        : (state.bridgeReady
          ? '현재 마지막 USER 메시지를 같은 내용으로 다시 보냅니다. · 에리 처리 제외'
          : '현재 마지막 USER 메시지를 같은 내용으로 다시 보냅니다. · 에리 없이 단독 동작');
    }
  }

  function injectStyles() {
    GM_addStyle(`
      .elr-message-resend-btn {
        position: relative;
        z-index: 2;
        flex: 0 0 auto;
        color: inherit;
        opacity: .58;
        pointer-events: auto !important;
        transition: opacity .14s ease, transform .14s ease, background-color .14s ease;
      }
      .elr-message-resend-btn:hover {
        opacity: 1;
        transform: scale(1.06);
      }
      .elr-message-resend-btn:active {
        transform: scale(.92);
      }
      .elr-message-resend-btn.elr-blocked {
        opacity: .28;
        cursor: wait;
      }
      .elr-message-resend-btn .elr-resend-svg {
        display: block;
        pointer-events: none;
        transform-origin: 50% 50%;
      }
      .elr-message-resend-btn.elr-resent-ok {
        opacity: 1;
      }
      .elr-message-resend-btn.elr-busy .elr-resend-svg {
        animation: elr-spin .8s linear infinite;
      }
      .elr-message-button-slot {
        display: inline-flex;
        align-items: flex-end;
        flex: 0 0 auto;
      }
      [data-elr-user-message="true"]:not(:hover):not(:focus-within) .elr-message-resend-btn {
        opacity: .36;
      }
      @keyframes elr-spin { to { transform: rotate(360deg); } }

      #elr-toast-host {
        position: fixed;
        top: 20px;
        left: 50%;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        width: min(88vw, 360px);
        pointer-events: none;
        transform: translateX(-50%);
      }
      .elr-toast {
        box-sizing: border-box;
        width: 100%;
        padding: 9px 12px;
        border: 1px solid rgba(127, 127, 127, .24);
        border-radius: 9px;
        background: color-mix(in srgb, Canvas 92%, transparent);
        color: CanvasText;
        box-shadow: 0 5px 18px rgba(0, 0, 0, .16);
        font: 600 12px/1.4 Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: pre-line;
        text-align: center;
        opacity: 0;
        transform: translateY(-10px);
        transition: opacity .2s ease, transform .2s ease;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .elr-toast-show { opacity: 1; transform: translateY(0); }
      .elr-toast-success { border-color: rgba(45, 185, 110, .42); }
      .elr-toast-error { border-color: rgba(235, 75, 75, .48); }
      .elr-toast-working { border-color: rgba(80, 130, 235, .42); }

    `);
  }

  function elrMutationNeedsScan(mutation) {
    const own = '.elr-message-resend-btn, .elr-message-button-slot, #elr-toast-host';
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest(own)) return false;
    const hint = '[data-message-group-id], [data-message-id], .wrtn-markdown, [class~="bg-surface_chat_secondary"], [class~="border-y"][class~="border-outline_tertiary"], button[aria-label="메시지 옵션"]';
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
      if (!(node instanceof Element) || node.matches(own) || node.closest(own)) return false;
      return node.matches(hint) || !!node.querySelector(hint);
    });
  }

  function maintainMessageButtons() {
    if (state.currentHref !== location.href) {
      state.currentHref = location.href;
      state.latestUserContainer = null;
      state.lastMessageScanAt = 0;
      clearTicket();
      document.querySelectorAll('.elr-message-resend-btn').forEach(node => node.remove());
      scheduleInjectMessageButtons();
      return;
    }
    if (document.hidden || !isChatPage()) return;
    const latest = state.latestUserContainer;
    // Retain a slow safety pass for pure CSS mode changes/unrecognised native markup.
    const recoveryDue = Date.now() - state.lastMessageScanAt >= 15000;
    if (recoveryDue || (latest && (!latest.isConnected || !latest.querySelector('.elr-message-resend-btn')))) {
      scheduleInjectMessageButtons();
    }
  }

  function onReady() {
    injectStyles();
    scheduleInjectMessageButtons();
    syncButtons();

    // 에리가 설치된 환경에서는 뒤늦게 로드되어도 선택적으로 연결합니다. 없어도 ELR은 정상 동작합니다.
    const bridgeTimer = setInterval(() => {
      if (installLoreBridge()) clearInterval(bridgeTimer);
    }, 100);
    setTimeout(() => clearInterval(bridgeTimer), 30_000);

    // Fast tick checks only route/retained button; native structural changes drive scans.
    setInterval(maintainMessageButtons, 900);
    const observer = new MutationObserver(mutations => {
      if (mutations.some(elrMutationNeedsScan)) scheduleInjectMessageButtons();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleInjectMessageButtons, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleInjectMessageButtons(); });

    log('loaded');
  }

  installMessageButtonEventShield();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    onReady();
  }
})();
