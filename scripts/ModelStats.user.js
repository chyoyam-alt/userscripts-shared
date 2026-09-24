// ==UserScript==
// @name         📊 Crack Chat Model Stats (채팅별 모델 통계)
// @namespace    crack-chat-model-stats
// @version      2.0.1
// @description  크랙 AI 채팅 사용 모델을 방별로 누적하고, 처음 보는 crackerModel을 자동 등록해 표시합니다.
// @downloadURL  https://gist.github.com/chyoyam-alt/efa19fd1c79283d5d3dd5d3f3aa13152/raw/ModelStats.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/efa19fd1c79283d5d3dd5d3f3aa13152/raw/ModelStats.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (W.__CCMS_CHAT_MODEL_STATS_LOADED__) return;
  W.__CCMS_CHAT_MODEL_STATS_LOADED__ = true;

  const VERSION = '2.0.1';
  const STORE_KEY = 'ccms_chat_model_stats_v1';
  const REGISTRY_KEY = 'ccms_model_registry_v1';
  const STYLE_ID = 'ccms-chat-model-stats-style';
  const SIDEBAR_ID = 'ccms-chat-model-stats-sidebar';

  const MAX_SEEN_IDS_PER_ROOM = 2000;
  const PENDING_TTL_MS = 90 * 1000;
  const UI_REFRESH_DEBOUNCE_MS = 180;

  // registry: { [token]: { label, engine, firstSeen } }
  const TOKEN_RE = /^[a-z][a-z0-9]*(?:_\d+)*$/;

  function readRegistry() {
    try {
      const parsed = JSON.parse(localStorage.getItem(REGISTRY_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  const modelRegistry = readRegistry();
  const engineTokenIndex = new Map();

  const pendingByRoom = new Map();
  const pendingSeen = new Set();
  const seenSetCache = new Map();

  let uiTimer = null;
  let routeTimer = null;
  let lastHref = location.href;
  let sidebarObserver = null;
  let sidebarObserverScope = null;
  let sidebarObserverSubtree = false;
  let ignoreMutationUntil = 0;
  let lastRenderSignature = '';

  // ─────────────────────────────────────────────
  // Storage
  // ─────────────────────────────────────────────
  function createEmptyStore() {
    return {
      v: 1,
      version: VERSION,
      rooms: {},
    };
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '');
      if (!parsed || parsed.v !== 1 || typeof parsed !== 'object') return createEmptyStore();
      if (!parsed.rooms || typeof parsed.rooms !== 'object') parsed.rooms = {};
      return parsed;
    } catch (_) {
      return createEmptyStore();
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) {
      console.warn('[CCMS] 저장 실패:', err);
    }
  }

  function getRoomData(store, roomKey) {
    const key = roomKey || getCurrentRoomKey();

    if (!store.rooms[key]) {
      store.rooms[key] = {
        models: {},
        seenIds: [],
        updatedAt: 0,
      };
    }

    const room = store.rooms[key];
    if (!room.models || typeof room.models !== 'object') room.models = {};
    if (!Array.isArray(room.seenIds)) room.seenIds = [];

    if (!seenSetCache.has(key)) {
      seenSetCache.set(key, new Set(room.seenIds.map(String)));
    }

    return room;
  }

  function getSeenSet(roomKey, room) {
    const key = roomKey || getCurrentRoomKey();

    if (!seenSetCache.has(key)) {
      seenSetCache.set(key, new Set((room?.seenIds || []).map(String)));
    }

    return seenSetCache.get(key);
  }

  function hasSeen(roomKey, room, id) {
    if (!id) return false;
    return getSeenSet(roomKey, room).has(String(id));
  }

  function markSeen(roomKey, room, id) {
    if (!id) return;

    const key = roomKey || getCurrentRoomKey();
    const safeId = String(id);
    const set = getSeenSet(key, room);

    if (set.has(safeId)) return;

    set.add(safeId);
    room.seenIds.push(safeId);

    if (room.seenIds.length > MAX_SEEN_IDS_PER_ROOM) {
      room.seenIds.splice(0, room.seenIds.length - MAX_SEEN_IDS_PER_ROOM);
      seenSetCache.set(key, new Set(room.seenIds.map(String)));
    }
  }

  function incrementModelCount(roomKey, modelKey, messageId) {
    const rawKey = String(modelKey || '');
    const key = rawKey === 'unknown' || !TOKEN_RE.test(rawKey) ? 'unknown' : rawKey;
    const safeRoomKey = roomKey || getCurrentRoomKey();

    const store = readStore();
    const room = getRoomData(store, safeRoomKey);

    if (hasSeen(safeRoomKey, room, messageId)) return false;

    room.models[key] = Number(room.models[key] || 0) + 1;
    markSeen(safeRoomKey, room, messageId);
    room.updatedAt = Date.now();

    writeStore(store);
    scheduleUiRefresh();
    return true;
  }

  function getCurrentRoomCounts() {
    const store = readStore();
    const room = store.rooms[getCurrentRoomKey()];
    return room?.models || {};
  }

  // ─────────────────────────────────────────────
  // Room key
  // ─────────────────────────────────────────────
  function getCurrentPathInfo() {
    const path = location.pathname || '';

    const storyEpisode = path.match(/\/stories\/([^/?#]+)\/episodes\/([^/?#]+)/);
    if (storyEpisode) {
      return {
        storyId: storyEpisode[1],
        episodeId: storyEpisode[2],
        key: `${storyEpisode[1]}:${storyEpisode[2]}`,
      };
    }

    const episode = path.match(/\/episodes\/([^/?#]+)/);
    if (episode) {
      return {
        storyId: '',
        episodeId: episode[1],
        key: episode[1],
      };
    }

    const chat = path.match(/\/chat\/([^/?#]+)/);
    if (chat) {
      return {
        storyId: '',
        episodeId: chat[1],
        key: chat[1],
      };
    }

    return {
      storyId: '',
      episodeId: '',
      key: path || 'default',
    };
  }

  function isCrackChatRoomPath(pathname = location.pathname) {
    const path = String(pathname || '');

    return /\/stories\/[^/?#]+\/episodes\/[^/?#]+\/?$/i.test(path)
      || /\/episodes\/[^/?#]+\/?$/i.test(path)
      || /\/chat\/[^/?#]+\/?$/i.test(path);
  }

  function isCurrentChatRoom() {
    return isCrackChatRoomPath(location.pathname || '');
  }

  function getCurrentRoomKey() {
    return getCurrentPathInfo().key;
  }

  function getCurrentEpisodeId() {
    return getCurrentPathInfo().episodeId;
  }

  function resolveRoomKeyFromMessage(message) {
    const explicit = getMessageRoomId(message);
    const current = getCurrentPathInfo();

    if (!explicit) return current.key;
    if (current.episodeId && String(explicit) === String(current.episodeId)) return current.key;

    return String(explicit);
  }

  function getMessageRoomId(message) {
    return message?.chatId
      || message?.chat_id
      || message?.episodeId
      || message?.episode_id
      || message?.roomId
      || message?.room_id
      || message?.chat?._id
      || message?.chat?.id
      || message?.episode?._id
      || message?.episode?.id
      || '';
  }

  // ─────────────────────────────────────────────
  // Model registry / normalize
  // ─────────────────────────────────────────────
  function normalizeToken(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s.-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  function autoLabel(token) {
    // hyperchat_2_0 → "Hyperchat 2.0", powerchat → "Powerchat"
    const m = String(token).match(/^([a-z][a-z0-9]*?)(?:_(\d+)(?:_(\d+))?)?$/);
    if (!m) return String(token);
    const brand = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    if (!m[2]) return brand;
    return `${brand} ${m[2]}${m[3] != null ? `.${m[3]}` : ''}`;
  }

  function iconUrl(token) {
    // hyperchat_2_0 → hyperchat2_0.webp (첫 밑줄만 제거)
    const urlToken = String(token).replace(/^([a-z][a-z0-9]*)_(?=\d)/, '$1');
    return `https://cdn-image.wrtn.ai/crack/graphics/model-icon/${urlToken}.webp`;
  }

  function cleanEngine(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function engineLookupKey(value) {
    return cleanEngine(value).toLowerCase();
  }

  function indexEngine(token, engine) {
    const key = engineLookupKey(engine);
    if (!key || !TOKEN_RE.test(token)) return;
    if (!engineTokenIndex.has(key)) engineTokenIndex.set(key, token);
  }

  function rebuildEngineIndex() {
    engineTokenIndex.clear();

    for (const [token, meta] of Object.entries(modelRegistry)) {
      indexEngine(token, meta?.engine);
    }
  }

  rebuildEngineIndex();

  function writeRegistry() {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(modelRegistry));
    } catch (_) {
      // 저장이 막혀도 현재 페이지의 메모리 registry는 계속 사용한다.
    }
  }

  function ensureModel(token, rawEngine) {
    const safeToken = normalizeToken(token);
    if (!TOKEN_RE.test(safeToken) || safeToken === 'unknown') return null;

    const engine = cleanEngine(rawEngine);
    const current = modelRegistry[safeToken];

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      modelRegistry[safeToken] = {
        label: autoLabel(safeToken),
        engine,
        firstSeen: Date.now(),
      };
      indexEngine(safeToken, engine);
      writeRegistry();
      scheduleUiRefresh();
      return modelRegistry[safeToken];
    }

    let changed = false;

    if (!current.label) {
      current.label = autoLabel(safeToken);
      changed = true;
    }

    if (!current.engine && engine) {
      current.engine = engine;
      indexEngine(safeToken, engine);
      changed = true;
    }

    if (!current.firstSeen) {
      current.firstSeen = Date.now();
      changed = true;
    }

    if (changed) {
      writeRegistry();
      scheduleUiRefresh();
    }

    return current;
  }

  function findRegistryTokenByEngine(rawEngine) {
    const target = engineLookupKey(rawEngine);
    return target ? (engineTokenIndex.get(target) || '') : '';
  }

  function resolveModelToken(rawCrackerModel, rawEngine) {
    const hasCrackerModel = String(rawCrackerModel || '').trim().length > 0;

    if (hasCrackerModel) {
      const token = normalizeToken(rawCrackerModel);

      if (TOKEN_RE.test(token)) {
        ensureModel(token, rawEngine);
        return token;
      }

      console.debug('[CCMS] 등록할 수 없는 crackerModel 토큰:', rawCrackerModel);
      return '';
    }

    return findRegistryTokenByEngine(rawEngine);
  }

  function normalizeCrackerModelFromMessage(message) {
    const rawCrackerModel = message?.crackerModel || message?.cracker_model || '';
    const rawEngine = message?.model || message?.modelId || message?.model_id || message?.engine || '';

    return resolveModelToken(rawCrackerModel, rawEngine);
  }

  // ─────────────────────────────────────────────
  // Message candidate collection
  // ─────────────────────────────────────────────
  function getMessageId(message) {
    return message?._id
      || message?.id
      || message?.messageId
      || message?.message_id
      || message?.msgId
      || message?.msg_id
      || message?.fe_msg_id
      || '';
  }

  function getMessageContent(message) {
    const value = message?.content
      ?? message?.text
      ?? message?.message
      ?? message?.reply
      ?? message?.body
      ?? '';

    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v : '').join('\n');
    return '';
  }

  function getMessageTimestamp(message) {
    const raw = message?.createdAt || message?.created_at || message?.updatedAt || message?.updated_at || '';
    const parsed = raw ? new Date(raw).getTime() : 0;

    if (Number.isFinite(parsed) && parsed > 0) return parsed;

    const id = String(getMessageId(message) || '');
    if (/^[a-f0-9]{8}/i.test(id)) {
      const ts = parseInt(id.slice(0, 8), 16) * 1000;
      if (Number.isFinite(ts) && ts > 0) return ts;
    }

    return Date.now();
  }

  function isAssistantLikeMessage(message) {
    if (!message || typeof message !== 'object') return false;

    const role = String(message.role || message.sender || message.authorRole || message.type || '').toLowerCase();
    if (/user|human|member|owner/.test(role)) return false;

    const hasModel = !!(
      message.crackerModel
      || message.cracker_model
      || message.model
      || message.modelId
      || message.model_id
      || message.engine
    );

    if (!hasModel) return false;

    const id = getMessageId(message);
    const content = getMessageContent(message);
    const hasContent = typeof content === 'string' && content.trim().length > 0;

    if (/assistant|ai|bot|character|model/.test(role)) return !!(id || hasContent);
    if (id && hasContent) return true;

    return false;
  }

  function tinyHash(text) {
    const source = String(text || '');
    let h = 2166136261;

    for (let i = 0; i < Math.min(source.length, 240); i += 1) {
      h ^= source.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }

    return Math.abs(h >>> 0).toString(36);
  }

  function makeFallbackMessageId(roomKey, modelKey, content, ts) {
    const bucket = Math.floor(Number(ts || Date.now()) / 5000);
    return `fallback:${roomKey}:${modelKey}:${content.length}:${tinyHash(content)}:${bucket}`;
  }

  function addPendingCandidate(message) {
    if (!isAssistantLikeMessage(message)) return;

    const modelKey = normalizeCrackerModelFromMessage(message) || 'unknown';
    if (modelKey === 'unknown') {
      console.debug('[CCMS] 모델 키 확인 실패:', {
        crackerModel: message?.crackerModel || message?.cracker_model || '',
        model: message?.model || message?.modelId || message?.model_id || message?.engine || '',
      });
    }

    const roomKey = resolveRoomKeyFromMessage(message);
    const content = getMessageContent(message);
    const ts = getMessageTimestamp(message);
    const rawId = getMessageId(message);

    const id = rawId
      ? String(rawId)
      : makeFallbackMessageId(roomKey, modelKey, content, ts);

    const pendingKey = `${roomKey}::${id}`;
    if (pendingSeen.has(pendingKey)) return;

    pendingSeen.add(pendingKey);

    if (!pendingByRoom.has(roomKey)) pendingByRoom.set(roomKey, []);

    pendingByRoom.get(roomKey).push({
      id,
      roomKey,
      modelKey,
      ts,
      addedAt: Date.now(),
    });

    prunePending();
  }

  function prunePending() {
    const now = Date.now();

    for (const [roomKey, list] of pendingByRoom.entries()) {
      const next = list.filter(item => now - item.addedAt <= PENDING_TTL_MS);

      if (next.length) pendingByRoom.set(roomKey, next);
      else pendingByRoom.delete(roomKey);
    }

    if (pendingSeen.size > 5000) {
      pendingSeen.clear();

      for (const list of pendingByRoom.values()) {
        for (const item of list) {
          pendingSeen.add(`${item.roomKey}::${item.id}`);
        }
      }
    }
  }

  function collectFreshCandidates(options = {}) {
    prunePending();

    const currentKey = getCurrentRoomKey();
    const currentEpisodeId = getCurrentEpisodeId();
    const requestedChatId = options.chatId ? String(options.chatId) : '';

    const keys = new Set([currentKey]);

    if (currentEpisodeId) keys.add(String(currentEpisodeId));
    if (requestedChatId) keys.add(requestedChatId);

    const candidates = [];

    for (const key of keys) {
      const list = pendingByRoom.get(key);
      if (!list || !list.length) continue;

      for (const item of list) {
        candidates.push({
          ...item,
          roomKey: currentKey,
        });
      }
    }

    const now = Date.now();

    return candidates
      .filter(item => now - item.addedAt <= PENDING_TTL_MS)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0) || (b.addedAt || 0) - (a.addedAt || 0));
  }

  function finalizeLatestCandidate(options = {}) {
    const fresh = collectFreshCandidates(options);
    if (!fresh.length) return false;

    let target = null;

    if (options.msgId) {
      const msgId = String(options.msgId);
      target = fresh.find(item => String(item.id) === msgId)
        || fresh.find(item => String(item.id).includes(msgId) || msgId.includes(String(item.id)));
    }

    if (!target) target = fresh[0];
    if (!target) return false;

    const currentKey = getCurrentRoomKey();
    const ok = incrementModelCount(currentKey, target.modelKey, target.id);

    if (ok) {
      removePendingCandidate(target);
      console.log('[CCMS] 모델 통계 +1:', {
        roomKey: currentKey,
        model: target.modelKey,
        messageId: target.id,
        trigger: options.trigger || 'unknown',
        msgId: options.msgId || '',
      });
    }

    return ok;
  }

  function removePendingCandidate(target) {
    for (const [roomKey, list] of pendingByRoom.entries()) {
      const next = list.filter(item => item.id !== target.id);

      if (next.length) pendingByRoom.set(roomKey, next);
      else pendingByRoom.delete(roomKey);
    }
  }

  // ─────────────────────────────────────────────
  // JSON walk / network patch
  // ─────────────────────────────────────────────
  function walkJson(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 12) return;

    if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
    }

    if (Array.isArray(value)) {
      for (const item of value) walkJson(item, depth + 1, seen);
      return;
    }

    if (typeof value !== 'object') return;

    if (isAssistantLikeMessage(value)) addPendingCandidate(value);

    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        walkJson(child, depth + 1, seen);
      }
    }
  }

  function handleJson(json) {
    try {
      walkJson(json);
    } catch (_) {}
  }

  function handleText(text) {
    if (typeof text !== 'string') return;
    if (!/crackerModel|cracker_model|"model"|"modelId"|"model_id"/.test(text)) return;

    try {
      handleJson(JSON.parse(text));
      return;
    } catch (_) {}

    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    if (lines.length > 1 && lines.length < 300) {
      for (const line of lines) {
        const cleaned = line.replace(/^data:\s*/i, '').trim();

        if (!cleaned || cleaned === '[DONE]') continue;
        if (!/crackerModel|cracker_model|"model"|"modelId"|"model_id"/.test(cleaned)) continue;

        try {
          handleJson(JSON.parse(cleaned));
        } catch (_) {}
      }
    }
  }

  function shouldInspectUrl(url) {
    const u = String(url || '');

    if (!u) return false;
    if (/\.(webp|png|jpe?g|gif|svg|css|js|woff2?|ttf|otf|mp4|webm|mp3|wav)(\?|$)/i.test(u)) return false;
    if (/cdn-image\.wrtn\.ai|static\.wrtn\.ai|gstatic|googletagmanager|google-analytics|analytics/i.test(u)) return false;

    // 모델 통계에 필요한 후보만 훑는다.
    // API 메모상 메시지/채팅 생성 흐름은 crack-gen, contents-api, character-chat 계열에서 관찰됐다.
    return /crack-api\.wrtn\.ai\/(crack-gen|character-chat)\//i.test(u)
      || /contents-api\.wrtn\.ai\/character-chat\//i.test(u)
      || /\/(crack-gen|character-chat)\//i.test(u);
  }

  function shouldInspectContentType(contentType) {
    const ct = String(contentType || '').toLowerCase();

    if (!ct) return true;
    return /json|event-stream|text\/plain|x-ndjson/.test(ct);
  }

  function patchFetch() {
    const originalFetch = W.fetch;
    if (!originalFetch || originalFetch.__ccmsPatched) return;

    function patchedFetch(input, ...rest) {
      const url = typeof input === 'string' ? input : (input?.url || input?.href);
      const inspectUrl = shouldInspectUrl(url);

      const promise = originalFetch.call(this, input, ...rest);

      if (!inspectUrl) return promise;

      return promise.then((response) => {
        try {
          const ct = response.headers?.get?.('content-type') || '';

          if (shouldInspectContentType(ct)) {
            response.clone().text().then(handleText).catch(() => {});
          }
        } catch (_) {}

        return response;
      });
    }

    patchedFetch.__ccmsPatched = true;
    W.fetch = patchedFetch;
  }

  function patchXHR() {
    const XHR = W.XMLHttpRequest;
    if (!XHR || XHR.prototype.__ccmsPatched) return;

    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, ...rest) {
      try {
        this.__ccmsUrl = url;
      } catch (_) {}

      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      try {
        this.addEventListener('load', function () {
          try {
            if (!shouldInspectUrl(this.__ccmsUrl)) return;

            const responseType = String(this.responseType || '');
            if (responseType && responseType !== 'text') return;

            const ct = this.getResponseHeader?.('content-type') || '';
            if (!shouldInspectContentType(ct)) return;

            if (typeof this.responseText === 'string') handleText(this.responseText);
          } catch (_) {}
        });
      } catch (_) {}

      return originalSend.apply(this, args);
    };

    XHR.prototype.__ccmsPatched = true;
  }

  // ─────────────────────────────────────────────
  // generate_done hook
  // ─────────────────────────────────────────────
  function getGenerateDoneWindow() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow?.document === document) return unsafeWindow;
    } catch (_) {}

    return window;
  }

  function extractGenerateDoneMeta(entry) {
    let eventName = '';
    let meta = null;

    if ((Array.isArray(entry) || typeof entry?.length === 'number') && entry[0] === 'event') {
      eventName = String(entry[1] || '');
      meta = entry[2] || {};
    } else {
      eventName = String(entry?.event || '');
      meta = entry || {};
    }

    return {
      eventName,
      msgId: meta?.msg_id || meta?.fe_msg_id || meta?.message_id || meta?.messageId || meta?.id || '',
      chatId: meta?.chat_id || meta?.episode_id || meta?.chatId || meta?.episodeId || '',
      chatMode: meta?.chat_mode || meta?.chatMode || '',
      modelName: meta?.model_name || meta?.modelName || '',
    };
  }

  function isGenerateDoneEntry(entry) {
    return /^generate_done$/i.test(extractGenerateDoneMeta(entry).eventName);
  }

  function getGenerateDoneEntryKey(entry) {
    const meta = extractGenerateDoneMeta(entry);

    if (meta.msgId) return `${meta.chatId || getCurrentRoomKey()}::${meta.msgId}`;

    return `time::${getCurrentRoomKey()}::${Math.floor(Date.now() / 1500)}`;
  }

  function handleGenerateDoneEntry(entry) {
    if (!isGenerateDoneEntry(entry)) return false;

    const eventWindow = getGenerateDoneWindow();
    const key = getGenerateDoneEntryKey(entry);

    if (eventWindow.__ccmsLastGenerateDoneKey === key) return true;
    eventWindow.__ccmsLastGenerateDoneKey = key;

    const meta = extractGenerateDoneMeta(entry);
    onGenerateDoneSignal(meta);

    return true;
  }

  function resolveGenerateDoneRoomKey(chatId) {
    const current = getCurrentPathInfo();

    if (!chatId) return current.key;
    if (current.episodeId && String(chatId) === String(current.episodeId)) return current.key;

    return String(chatId);
  }

  function onGenerateDoneSignal(meta = {}) {
    const msgId = meta.msgId || '';
    const chatId = meta.chatId || '';

    // 1순위: generate_done 이벤트의 chat_mode/model_name로 직접 집계.
    //        네트워크 응답 파싱에 의존하지 않으므로 모든 방에서 동작.
    const directModel = resolveModelToken(meta.chatMode, meta.modelName);

    if (directModel) {
      const roomKey = resolveGenerateDoneRoomKey(chatId);
      const dedupId = msgId
        ? String(msgId)
        : `gd:${roomKey}:${directModel}:${Math.floor(Date.now() / 1500)}`;

      const ok = incrementModelCount(roomKey, directModel, dedupId);

      if (ok) {
        console.log('[CCMS] 모델 통계 +1 (generate_done):', {
          roomKey,
          model: directModel,
          messageId: dedupId,
          chatMode: meta.chatMode || '',
          modelName: meta.modelName || '',
        });
      }

      return;
    }

    // 2순위(폴백): chat_mode를 못 읽었을 때만 기존 pending 파이프라인 사용.
    const options = { msgId, chatId };

    setTimeout(() => finalizeLatestCandidate({ ...options, trigger: 'generate_done:200ms' }), 200);
    setTimeout(() => finalizeLatestCandidate({ ...options, trigger: 'generate_done:800ms' }), 800);
    setTimeout(() => finalizeLatestCandidate({ ...options, trigger: 'generate_done:1600ms' }), 1600);
  }

  function processDataLayerBacklog(eventWindow) {
    try {
      const layer = eventWindow.dataLayer;
      if (!Array.isArray(layer)) return;

      const from = Math.max(0, Number(eventWindow.__ccmsDataLayerSeenLen || 0));
      const to = layer.length;

      if (to < from) {
        eventWindow.__ccmsDataLayerSeenLen = to;
        return;
      }

      for (let i = from; i < to; i += 1) {
        handleGenerateDoneEntry(layer[i]);
      }

      eventWindow.__ccmsDataLayerSeenLen = to;
    } catch (_) {}
  }

  function startGenerateDoneHook() {
    const eventWindow = getGenerateDoneWindow();
    const dl = eventWindow.dataLayer = eventWindow.dataLayer || [];

    if (eventWindow.__ccmsGenerateDoneHookStarted) return;
    eventWindow.__ccmsGenerateDoneHookStarted = true;

    if (eventWindow.__ccmsDataLayerSeenLen == null) {
      eventWindow.__ccmsDataLayerSeenLen = 0;
    }

    clearInterval(eventWindow.__ccmsGenerateDonePollTimer);
    processDataLayerBacklog(eventWindow);

    if (!Array.isArray(dl) || dl.__ccmsPushPatched) return;

    const originalPush = dl.push;

    dl.push = function (...items) {
      const result = originalPush.apply(this, items);

      try {
        for (const item of items) {
          handleGenerateDoneEntry(item);
        }

        eventWindow.__ccmsDataLayerSeenLen = this.length;
      } catch (_) {}

      return result;
    };

    dl.__ccmsPushPatched = true;
  }

  // ─────────────────────────────────────────────
  // Sidebar UI
  // ─────────────────────────────────────────────
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${SIDEBAR_ID} {
        /* 레이아웃 들썩임 방지: 통계 영역 높이를 예측 가능하게 고정 */
        padding: 0 0 14px;
        box-sizing: border-box;
        contain: layout paint style;
      }

      #${SIDEBAR_ID} .ccms-title {
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 29px;
        padding: 8px 8px 7px;
        box-sizing: border-box;
        color: var(--text_tertiary, #8a8a8a);
        line-height: 1;
        user-select: none;
      }

      #${SIDEBAR_ID} .ccms-total {
        margin-left: auto;
        padding-right: 2px;
        font-size: 11px;
        font-weight: 700;
        color: var(--text_secondary, #a0a0a0);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      #${SIDEBAR_ID} .ccms-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        align-items: center;
        gap: 6px;
        min-height: 30px;
        padding: 0 10px;
        box-sizing: border-box;
        overflow: visible;
      }

      #${SIDEBAR_ID} .ccms-item {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 0;
        padding: 4px 5px;
        border-radius: 999px;
        background: var(--bg_input, rgba(128,128,128,.10));
        border: 1px solid var(--border, rgba(128,128,128,.14));
        line-height: 1;
        box-sizing: border-box;
      }

      #${SIDEBAR_ID} .ccms-icon-slot {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
      }

      #${SIDEBAR_ID} .ccms-icon {
        width: 18px;
        height: 18px;
        object-fit: contain;
        display: block;
        pointer-events: none;
        user-select: none;
        flex: 0 0 auto;
      }

      #${SIDEBAR_ID} .ccms-count {
        font-size: 11px;
        font-weight: 700;
        color: var(--text_secondary, #a0a0a0);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      #${SIDEBAR_ID} .ccms-fallback[hidden] {
        display: none !important;
      }

      #${SIDEBAR_ID} .ccms-fallback {
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border-radius: 999px;
        font-size: 10px;
        font-weight: 800;
        color: var(--text_tertiary, #999);
        background: var(--bg_input, rgba(128,128,128,.16));
        border: 1px solid var(--border, rgba(128,128,128,.22));
        box-sizing: border-box;
      }
    `;

    const head = document.head || document.documentElement;
    head.appendChild(style);
  }

  function removeSidebarUi() {
    const row = document.getElementById(SIDEBAR_ID);
    if (row) row.remove();

    lastRenderSignature = '';
  }

  function findCrackerBalanceRow() {
    const labels = Array.from(document.querySelectorAll('span, p'))
      .filter(el => (el.textContent || '').trim() === '나의 크래커');

    for (const label of labels) {
      let cursor = label;

      for (let i = 0; i < 8 && cursor; i += 1) {
        cursor = cursor.nextElementSibling;
        if (!cursor) break;

        const text = cursor.textContent || '';
        const hasNumber = /[\d,]{2,}/.test(text);
        const isDiv = cursor.tagName === 'DIV';

        if (isDiv && hasNumber) return cursor;
      }
    }

    return null;
  }

  function ensureSidebarUi() {
    if (!document.body) return null;

    if (!isCurrentChatRoom()) {
      removeSidebarUi();
      return null;
    }

    injectStyle();

    let row = document.getElementById(SIDEBAR_ID);
    if (row && row.isConnected) return row;

    const balanceRow = findCrackerBalanceRow();
    if (!balanceRow || !balanceRow.parentElement) return null;

    row = document.createElement('div');
    row.id = SIDEBAR_ID;
    row.innerHTML = `
      <div class="ccms-title typo-text-md_leading-none_medium p-2 text-text_tertiary">
        <span>모델별 통계</span>
        <span class="ccms-total" data-ccms-total></span>
      </div>
      <div class="ccms-grid" data-ccms-grid></div>
    `;

    balanceRow.insertAdjacentElement('afterend', row);
    return row;
  }

  function getRegistryMeta(token) {
    if (token === 'unknown') {
      return {
        label: '알 수 없음',
        engine: '',
      };
    }

    const normalized = normalizeToken(token);
    const registered = TOKEN_RE.test(normalized) ? modelRegistry[normalized] : null;

    return {
      label: registered?.label || autoLabel(normalized || token),
      engine: cleanEngine(registered?.engine),
    };
  }

  function getSortedModelEntries(counts) {
    return Object.entries(counts || {})
      .map(([key, count]) => [String(key), Number(count || 0)])
      .filter(([, count]) => count > 0)
      .sort((a, b) => {
        const countDiff = Number(b[1] || 0) - Number(a[1] || 0);
        if (countDiff) return countDiff;

        const aLabel = getRegistryMeta(a[0]).label;
        const bLabel = getRegistryMeta(b[0]).label;
        return aLabel.localeCompare(bLabel);
      });
  }


  function renderSidebarUi() {
    if (!isCurrentChatRoom()) {
      removeSidebarUi();
      return false;
    }

    const row = ensureSidebarUi();
    if (!row) return false;

    const grid = row.querySelector('[data-ccms-grid]');
    const totalEl = row.querySelector('[data-ccms-total]');
    if (!grid) return false;

    const entries = getSortedModelEntries(getCurrentRoomCounts());
    const total = entries.reduce((sum, [, c]) => sum + Number(c || 0), 0);

    // 같은 내용이면 DOM을 다시 갈아엎지 않음.
    // 사이드바 재감지/MutationObserver 때문에 생기는 잔떨림 완화용.
    const signature = `${getCurrentRoomKey()}::${total}::${entries.map(([key, count]) => {
      const meta = getRegistryMeta(key);
      return `${key}:${count}:${meta.label}:${meta.engine}`;
    }).join('|')}`;

    if (lastRenderSignature === signature && row.isConnected) {
      return true;
    }

    lastRenderSignature = signature;

    ignoreMutationUntil = Date.now() + 500;

    if (totalEl) totalEl.textContent = total ? `총 ${total}회` : '';

    if (!entries.length) {
      grid.innerHTML = '';
      return true;
    }

    grid.innerHTML = entries.map(([key, count]) => {
      const meta = getRegistryMeta(key);
      const title = `${meta.label}${meta.engine ? ' / ' + meta.engine : ''} · ${count}회`;
      const normalized = normalizeToken(key);
      const canUseIcon = key !== 'unknown' && TOKEN_RE.test(normalized);

      const icon = canUseIcon
        ? `<span class="ccms-icon-slot"><img class="ccms-icon" data-ccms-icon src="${escapeHtml(iconUrl(normalized))}" alt="${escapeHtml(meta.label)}" loading="eager" decoding="async" draggable="false"><span class="ccms-fallback" data-ccms-fallback hidden>?</span></span>`
        : `<span class="ccms-fallback">?</span>`;

      return `
        <div class="ccms-item" title="${escapeHtml(title)}">
          ${icon}
          <span class="ccms-count">${escapeHtml(String(count))}</span>
        </div>
      `;
    }).join('');

    for (const img of grid.querySelectorAll('[data-ccms-icon]')) {
      const showFallback = () => {
        img.hidden = true;
        const fallback = img.nextElementSibling;
        if (fallback?.matches?.('[data-ccms-fallback]')) fallback.hidden = false;
      };

      img.addEventListener('error', showFallback, { once: true });
      if (img.complete && !img.naturalWidth) showFallback();
    }

    return true;
  }

  function scheduleUiRefresh() {
    clearTimeout(uiTimer);

    uiTimer = setTimeout(() => {
      renderSidebarUi();
      connectSidebarObserver();
    }, UI_REFRESH_DEBOUNCE_MS);
  }

  function getSidebarObserverScope() {
    const balanceRow = findCrackerBalanceRow();

    return balanceRow?.closest?.('aside, nav, [class*="sidebar"], [class*="Sidebar"], [class*="side"], [class*="Side"]')
      || document.body
      || null;
  }

  function connectSidebarObserver() {
    if (!document.body) return;

    if (!isCurrentChatRoom()) {
      removeSidebarUi();

      try {
        sidebarObserver?.disconnect?.();
      } catch (_) {}

      sidebarObserver = null;
      sidebarObserverScope = null;
      sidebarObserverSubtree = false;
      return;
    }

    const scope = getSidebarObserverScope();
    if (!scope) return;

    const subtree = scope !== document.body;

    if (sidebarObserver && sidebarObserverScope === scope && sidebarObserverSubtree === subtree) return;

    try {
      sidebarObserver?.disconnect?.();
    } catch (_) {}

    sidebarObserverScope = scope;
    sidebarObserverSubtree = subtree;

    sidebarObserver = new MutationObserver((mutations) => {
      if (Date.now() < ignoreMutationUntil) return;

      let worth = false;

      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        if (m.target?.closest?.(`#${SIDEBAR_ID}`)) continue;

        if (m.addedNodes?.length || m.removedNodes?.length) {
          worth = true;
          break;
        }
      }

      if (worth) scheduleUiRefresh();
    });

    sidebarObserver.observe(scope, {
      childList: true,
      subtree,
    });
  }

  function startRouteWatcher() {
    clearInterval(routeTimer);

    routeTimer = setInterval(() => {
      if (location.href === lastHref) return;

      lastHref = location.href;

      if (!isCurrentChatRoom()) removeSidebarUi();

      scheduleUiRefresh();
    }, 800);
  }

  // ─────────────────────────────────────────────
  // Init / console API
  // ─────────────────────────────────────────────
  function installPatches() {
    patchFetch();
    patchXHR();
    startGenerateDoneHook();
  }

  function initDomPart() {
    injectStyle();
    connectSidebarObserver();
    startRouteWatcher();
    scheduleUiRefresh();
  }

  installPatches();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDomPart, { once: true });
  } else {
    initDomPart();
  }

  W.__ccmsModelStats = {
    version: VERSION,
    store: () => readStore(),
    currentKey: () => getCurrentRoomKey(),
    currentCounts: () => getCurrentRoomCounts(),
    refresh: () => renderSidebarUi(),
    finalize: (msgId = '') => finalizeLatestCandidate({ trigger: 'manual', msgId }),
    pending: () => {
      const out = {};
      for (const [key, list] of pendingByRoom.entries()) out[key] = list.slice();
      return out;
    },
    clearCurrent: () => {
      const store = readStore();
      const key = getCurrentRoomKey();

      delete store.rooms[key];
      seenSetCache.delete(key);

      writeStore(store);
      renderSidebarUi();

      console.log('[CCMS] 현재 방 통계 초기화 완료');
    },
    clearAll: () => {
      localStorage.removeItem(STORE_KEY);
      seenSetCache.clear();
      renderSidebarUi();

      console.log('[CCMS] 전체 통계 초기화 완료');
    },
    addTest: (model = 'hyperchat_2_0', n = 1) => {
      const roomKey = getCurrentRoomKey();

      for (let i = 0; i < Number(n || 1); i += 1) {
        incrementModelCount(roomKey, model, `test:${Date.now()}:${Math.random()}`);
      }

      renderSidebarUi();
    },
  };

  console.log(`[CCMS] Crack Chat Model Stats v${VERSION} 로드됨`);
})();