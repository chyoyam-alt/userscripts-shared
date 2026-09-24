// ==UserScript==
// @name         🍪 Crack Answer Cost (답변별 크래커)
// @namespace    crack-answer-cost
// @version      1.0.0
// @description  설치 후 실제로 측정된 크래커 차감량만 답변별로 표시합니다. 리롤 전환은 messageId 기준으로 따라가며, 답변 삭제 시 해당 표시 기록도 함께 삭제합니다.
// @downloadURL  https://gist.github.com/chyoyam-alt/7a3cfea04d68525f1cdc6ccfe00e5665/raw/AnswerCost.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/7a3cfea04d68525f1cdc6ccfe00e5665/raw/AnswerCost.user.js
// @match        *://crack.wrtn.ai/stories/*/episodes/*
// @grant        unsafeWindow
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    /*
     * 중요 원칙
     * - 설치 전 답변은 역산하지 않는다.
     * - 모델 가격표로 추정하지 않는다.
     * - generate_done의 실제 messageId와 crackers/history의 실제 차감 기록이
     *   한 쌍으로 측정된 경우에만 답변 아래에 표시한다.
     */

    const APP = Object.freeze({
        id: 'cac',
        version: '1.0.0',
        messageLimit: 200,
        messageCacheMs: 15000,
        renderDelayMs: 100,
        claimedKeepMs: 14 * 24 * 60 * 60 * 1000,
        deletedKeepMs: 7 * 24 * 60 * 60 * 1000
    });

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const ORIGINAL_FETCH = typeof W.fetch === 'function' ? W.fetch : null;
    const ORIGINAL_XHR_OPEN = W.XMLHttpRequest?.prototype?.open || null;
    const ORIGINAL_XHR_SEND = W.XMLHttpRequest?.prototype?.send || null;

    const API = Object.freeze({
        history: 'https://crack-api.wrtn.ai/crack-cash/crackers/history',
        chats: 'https://crack-api.wrtn.ai/crack-gen/v3/chats'
    });

    const STORAGE = Object.freeze({
        costsPrefix: 'cac:measured-costs:v1:',
        deletedPrefix: 'cac:deleted-messages:v1:',
        claimedHistory: 'cac:claimed-history:v1',
        claimLock: 'cac:claim-lock:v1',
        tabId: 'cac:tab-id:v1'
    });

    const DELETE_API_RE = /\/crack-gen\/v\d+\/chats\/([^/?#]+)\/messages\/([^/?#]+)/i;
    const COMPARE_RE = /답변\s*비교\s*(\d+)\s*\/\s*(\d+)/;
    const MESSAGE_GROUP_SELECTOR = 'div[data-message-group-id]';
    const BADGE_CLASS = 'cac-answer-cost';

    const COST_ICON_HTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false" style="pointer-events:none;display:inline-block;vertical-align:-2px"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.2 4.2A4.5 4.5 0 0 1 12 4.2A4.5 4.5 0 0 1 13.5 3.36A7 7 0 0 0 20.17 11.5A4.5 4.5 0 0 1 19.8 12A4.5 4.5 0 0 1 19.8 17.8A2 2 0 0 1 17.8 19.8A4.5 4.5 0 0 1 12 19.8A4.5 4.5 0 0 1 6.2 19.8A2 2 0 0 1 4.2 17.8A4.5 4.5 0 0 1 4.2 12A4.5 4.5 0 0 1 4.2 6.2A2 2 0 0 1 6.2 4.2ZM8 6.6L9.4 8L8 9.4L6.6 8ZM8 14.6L9.4 16L8 17.4L6.6 16ZM16 14.6L17.4 16L16 17.4L14.6 16ZM12 10.6L13.4 12L12 13.4L10.6 12Z"/></svg>';

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const pendingJobs = new Map();
    const pendingStarts = new Map();
    const seenDoneEvents = new Set();
    const XHR_DELETE_META = Symbol('cacDeleteMeta');

    let renderTimer = 0;
    let renderSequence = 0;
    let messageCache = makeEmptyMessageCache();
    let uiObserver = null;
    let lastRouteKey = getRouteKey();

    const TAB_ID = getOrCreateTabId();

    function makeEmptyMessageCache() {
        return {
            chatId: '',
            loadedAt: 0,
            messages: [],
            lookup: null,
            inFlight: null
        };
    }

    function getOrCreateTabId() {
        try {
            let value = sessionStorage.getItem(STORAGE.tabId);
            if (!value) {
                value = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
                sessionStorage.setItem(STORAGE.tabId, value);
            }
            return value;
        } catch (_) {
            return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        }
    }

    function getRouteKey() {
        return `${location.origin}${location.pathname}${location.search}`;
    }

    function getCurrentChatId() {
        const match = location.pathname.match(/\/stories\/[^/]+\/episodes\/([^/?#]+)/i);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function normalizeId(value) {
        return String(value || '').trim();
    }

    function getCookie(name) {
        const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getCommonHeaders() {
        const headers = {
            accept: 'application/json, text/plain, */*',
            platform: 'web',
            'wrtn-locale': 'ko-KR'
        };

        const token = getCookie('access_token');
        if (token) headers.authorization = `Bearer ${token}`;

        const wrtnId = getCookie('__w_id');
        if (wrtnId) headers['x-wrtn-id'] = wrtnId;

        const mixpanelId = getCookie('Mixpanel-Distinct-Id');
        if (mixpanelId) headers['mixpanel-distinct-id'] = mixpanelId;

        return headers;
    }

    async function requestJson(url) {
        if (!ORIGINAL_FETCH) throw new Error('fetch unavailable');
        const response = await ORIGINAL_FETCH.call(W, url, {
            method: 'GET',
            credentials: 'include',
            headers: getCommonHeaders()
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    function parseStoredObject(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '{}');
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        } catch (_) {
            return {};
        }
    }

    function loadCosts(chatId) {
        if (!chatId) return {};
        return parseStoredObject(STORAGE.costsPrefix + chatId);
    }

    function saveCosts(chatId, costs) {
        if (!chatId) return;
        try {
            localStorage.setItem(STORAGE.costsPrefix + chatId, JSON.stringify(costs || {}));
        } catch (error) {
            console.debug('[답변별 크래커] 측정값 저장 실패:', error);
        }
    }

    function loadDeleted(chatId) {
        if (!chatId) return {};
        const deleted = parseStoredObject(STORAGE.deletedPrefix + chatId);
        const cutoff = Date.now() - APP.deletedKeepMs;
        let changed = false;

        for (const [messageId, timestamp] of Object.entries(deleted)) {
            if (!Number(timestamp) || Number(timestamp) < cutoff) {
                delete deleted[messageId];
                changed = true;
            }
        }

        if (changed) saveDeleted(chatId, deleted);
        return deleted;
    }

    function saveDeleted(chatId, deleted) {
        if (!chatId) return;
        try {
            localStorage.setItem(STORAGE.deletedPrefix + chatId, JSON.stringify(deleted || {}));
        } catch (_) {}
    }

    function isDeletedMessage(chatId, messageId) {
        return !!loadDeleted(chatId)[normalizeId(messageId)];
    }

    function loadClaimedHistory() {
        const claimed = parseStoredObject(STORAGE.claimedHistory);
        const cutoff = Date.now() - APP.claimedKeepMs;
        let changed = false;

        for (const [key, value] of Object.entries(claimed)) {
            const timestamp = typeof value === 'number' ? value : Number(value?.claimedAt || 0);
            if (!timestamp || timestamp < cutoff) {
                delete claimed[key];
                changed = true;
            }
        }

        if (changed) saveClaimedHistory(claimed);
        return claimed;
    }

    function saveClaimedHistory(claimed) {
        try {
            localStorage.setItem(STORAGE.claimedHistory, JSON.stringify(claimed || {}));
        } catch (_) {}
    }

    async function withLocalStorageLock(callback) {
        const owner = `${TAB_ID}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const deadline = Date.now() + 3500;

        while (Date.now() < deadline) {
            try {
                const current = JSON.parse(localStorage.getItem(STORAGE.claimLock) || 'null');
                if (!current || !current.ts || Date.now() - Number(current.ts) > 5000) {
                    localStorage.setItem(STORAGE.claimLock, JSON.stringify({ owner, ts: Date.now() }));
                    await sleep(25);
                    const confirmed = JSON.parse(localStorage.getItem(STORAGE.claimLock) || 'null');

                    if (confirmed?.owner === owner) {
                        try {
                            return await callback();
                        } finally {
                            try {
                                const latest = JSON.parse(localStorage.getItem(STORAGE.claimLock) || 'null');
                                if (latest?.owner === owner) localStorage.removeItem(STORAGE.claimLock);
                            } catch (_) {}
                        }
                    }
                }
            } catch (_) {}

            await sleep(60 + Math.floor(Math.random() * 80));
        }

        return callback();
    }

    async function withClaimLock(callback) {
        try {
            if (navigator?.locks?.request) {
                return await navigator.locks.request('cac-answer-cost-claim', { mode: 'exclusive' }, callback);
            }
        } catch (_) {}
        return withLocalStorageLock(callback);
    }

    function getConsumedAmount(record) {
        let value = record?.balance?.total;
        if (typeof value === 'string') value = Number(value.replace(/[^0-9.-]/g, ''));
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
        return Math.abs(value);
    }

    function getHistoryTime(record) {
        const value = record?.date || record?.createdAt || record?.created_at || '';
        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function makeHistoryKey(record) {
        const id = record?._id || record?.id || record?.historyId || record?.transactionId || '';
        if (id) return `id:${id}`;

        return [
            'history',
            record?.date || record?.createdAt || record?.created_at || '',
            record?.title || '',
            getConsumedAmount(record),
            record?.balance?.paid ?? '',
            record?.balance?.free ?? '',
            record?.consumedType || '',
            record?.product || ''
        ].join('|');
    }

    async function fetchRecentHistory() {
        const json = await requestJson(`${API.history}?limit=20&type=all&page=1`);
        return Array.isArray(json?.data) ? json.data : [];
    }

    function findHistoryCandidates(items, job) {
        const minTime = Math.max(0, Number(job.startedAt || 0) - 30000);
        const maxTime = Number(job.doneAt || Date.now()) + 45000;

        return (items || [])
            .map((record) => ({
                record,
                time: getHistoryTime(record),
                amount: getConsumedAmount(record)
            }))
            .filter((item) => item.time > 0 && item.time >= minTime && item.time <= maxTime)
            .filter((item) => {
                const product = String(item.record?.product || '').toLowerCase();
                return String(item.record?.isConsumed) === 'true'
                    && (!product || product.includes('cracker'))
                    && item.amount > 0;
            })
            .sort((a, b) => {
                const ad = Math.abs(a.time - job.doneAt);
                const bd = Math.abs(b.time - job.doneAt);
                return ad - bd || b.time - a.time;
            })
            .map((item) => item.record);
    }

    async function claimMeasuredCost(record, job) {
        const amount = getConsumedAmount(record);
        if (!job.chatId || !job.messageId || amount <= 0) return null;

        const historyKey = makeHistoryKey(record);
        let measured = null;

        await withClaimLock(async () => {
            if (isDeletedMessage(job.chatId, job.messageId)) return;

            const currentCosts = loadCosts(job.chatId);
            const existing = currentCosts[job.messageId];
            if (existing && Number(existing.amount) > 0) {
                measured = existing;
                return;
            }

            const claimed = loadClaimedHistory();
            if (claimed[historyKey]) return;

            const value = {
                amount,
                historyKey,
                measuredAt: Date.now(),
                isReroll: !!job.isReroll
            };

            claimed[historyKey] = {
                claimedAt: Date.now(),
                chatId: job.chatId,
                messageId: job.messageId,
                amount
            };
            currentCosts[job.messageId] = value;

            saveClaimedHistory(claimed);
            saveCosts(job.chatId, currentCosts);
            measured = value;
        });

        if (measured) {
            invalidateMessageCache(job.chatId);
            scheduleRender(0);
        }

        return measured;
    }

    async function pollAndMeasure(job) {
        const delays = [0, 700, 1200, 2000, 3500, 5500];

        for (const delay of delays) {
            if (delay) await sleep(delay);
            if (isDeletedMessage(job.chatId, job.messageId)) return;

            try {
                const items = await fetchRecentHistory();
                const candidates = findHistoryCandidates(items, job);

                for (const record of candidates) {
                    const measured = await claimMeasuredCost(record, job);
                    if (measured) return;
                }
            } catch (error) {
                console.debug('[답변별 크래커] 차감내역 확인 재시도:', error);
            }
        }
    }

    function eventParts(entry) {
        if (!entry) return { name: '', meta: {} };

        const arrayLike = (Array.isArray(entry) || typeof entry.length === 'number')
            && typeof entry !== 'string';

        if (arrayLike && String(entry[0] || '') === 'event') {
            const rawMeta = entry[2] || {};
            const meta = rawMeta?.eventProperties || rawMeta?.properties || rawMeta;
            return { name: String(entry[1] || ''), meta: meta || {} };
        }

        const rawMeta = entry?.eventProperties || entry?.properties || entry;
        return {
            name: String(entry?.event || entry?.eventName || ''),
            meta: rawMeta || {}
        };
    }

    function firstValidMessageId(meta) {
        const values = [meta?.msg_id, meta?.message_id, meta?.messageId, meta?.id, meta?.fe_msg_id];
        for (const value of values) {
            const id = normalizeId(value);
            if (/^[a-f0-9]{24}$/i.test(id)) return id;
        }
        return '';
    }

    function readDurationMs(meta) {
        const values = [meta?.generate_time, meta?.generateTime, meta?.duration_ms, meta?.durationMs];
        for (const value of values) {
            const duration = Number(value);
            if (Number.isFinite(duration) && duration > 0 && duration <= 10 * 60 * 1000) return duration;
        }
        return 0;
    }

    function rememberGenerationStart(meta) {
        const chatId = normalizeId(meta?.chat_id || meta?.chatId || getCurrentChatId());
        if (!chatId) return;
        pendingStarts.set(chatId, {
            startedAt: Date.now(),
            isReroll: meta?.is_regenerate === true || meta?.isRegenerate === true
        });
    }

    function handleGenerateDone(meta) {
        const chatId = normalizeId(meta?.chat_id || meta?.chatId || getCurrentChatId());
        const messageId = firstValidMessageId(meta);
        if (!chatId || !messageId) return;

        const eventKey = `${chatId}:${messageId}`;
        if (seenDoneEvents.has(eventKey) || pendingJobs.has(eventKey)) return;
        seenDoneEvents.add(eventKey);

        if (isDeletedMessage(chatId, messageId)) return;

        const existing = loadCosts(chatId)[messageId];
        if (existing && Number(existing.amount) > 0) {
            scheduleRender(0);
            return;
        }

        const doneAt = Date.now();
        const duration = readDurationMs(meta);
        const remembered = pendingStarts.get(chatId);
        const fallbackStartedAt = remembered?.startedAt && doneAt - remembered.startedAt <= 10 * 60 * 1000
            ? remembered.startedAt
            : doneAt - 3 * 60 * 1000;
        const startedAt = duration ? doneAt - duration : fallbackStartedAt;

        const job = {
            chatId,
            messageId,
            startedAt,
            doneAt,
            isReroll: meta?.is_regenerate === true
                || meta?.isRegenerate === true
                || remembered?.isReroll === true
        };

        pendingStarts.delete(chatId);
        invalidateMessageCache(chatId);
        scheduleRender(250);

        const promise = pollAndMeasure(job)
            .catch((error) => console.debug('[답변별 크래커] 측정 실패:', error))
            .finally(() => pendingJobs.delete(eventKey));

        pendingJobs.set(eventKey, promise);
    }

    function handleDataLayerEntry(entry) {
        const { name, meta } = eventParts(entry);
        if (/^(generate_open|generate_start)$/i.test(name)) {
            rememberGenerationStart(meta);
            return;
        }
        if (/^generate_done$/i.test(name)) handleGenerateDone(meta);
    }

    function installDataLayerHook() {
        const dataLayer = W.dataLayer = W.dataLayer || [];
        if (!Array.isArray(dataLayer) || dataLayer.__cacAnswerCostPushWrapped) return;

        const originalPush = dataLayer.push;
        dataLayer.push = function (...items) {
            const result = originalPush.apply(this, items);
            try {
                for (const item of items) handleDataLayerEntry(item);
            } catch (error) {
                console.debug('[답변별 크래커] 생성 이벤트 처리 실패:', error);
            }
            return result;
        };

        try {
            Object.defineProperty(dataLayer, '__cacAnswerCostPushWrapped', {
                value: true,
                configurable: true
            });
        } catch (_) {
            dataLayer.__cacAnswerCostPushWrapped = true;
        }
    }

    function parseDeleteRequest(method, url) {
        if (String(method || '').toUpperCase() !== 'DELETE') return null;
        const match = String(url || '').match(DELETE_API_RE);
        if (!match) return null;

        try {
            return {
                chatId: decodeURIComponent(match[1]),
                messageId: decodeURIComponent(match[2])
            };
        } catch (_) {
            return { chatId: match[1], messageId: match[2] };
        }
    }

    async function recordSuccessfulDeletion(chatId, messageId) {
        chatId = normalizeId(chatId);
        messageId = normalizeId(messageId);
        if (!chatId || !messageId) return;

        await withClaimLock(async () => {
            const deleted = loadDeleted(chatId);
            deleted[messageId] = Date.now();
            saveDeleted(chatId, deleted);

            const costs = loadCosts(chatId);
            if (Object.prototype.hasOwnProperty.call(costs, messageId)) {
                delete costs[messageId];
                saveCosts(chatId, costs);
            }
        });

        document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => {
            if (badge.dataset.messageId === messageId) badge.remove();
        });

        invalidateMessageCache(chatId);
        scheduleRender(80);
        setTimeout(() => scheduleRender(0), 500);
    }

    function installDeleteFetchHook() {
        if (!ORIGINAL_FETCH || W.fetch?.__cacAnswerCostWrapped) return;

        const wrapped = function (input, init) {
            const method = init?.method || input?.method || 'GET';
            const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
            const deletion = parseDeleteRequest(method, url);
            const result = ORIGINAL_FETCH.apply(this, arguments);

            if (!deletion) return result;

            return Promise.resolve(result).then((response) => {
                if (response?.ok) {
                    recordSuccessfulDeletion(deletion.chatId, deletion.messageId)
                        .catch((error) => console.debug('[답변별 크래커] 삭제 기록 정리 실패:', error));
                }
                return response;
            });
        };

        wrapped.__cacAnswerCostWrapped = true;
        W.fetch = wrapped;
    }

    function installDeleteXhrHook() {
        if (!W.XMLHttpRequest || !ORIGINAL_XHR_OPEN || !ORIGINAL_XHR_SEND) return;
        if (W.XMLHttpRequest.prototype.send?.__cacAnswerCostWrapped) return;

        W.XMLHttpRequest.prototype.open = function (method, url) {
            this[XHR_DELETE_META] = parseDeleteRequest(method, url);
            return ORIGINAL_XHR_OPEN.apply(this, arguments);
        };

        const wrappedSend = function () {
            const deletion = this[XHR_DELETE_META];
            if (deletion) {
                this.addEventListener('loadend', () => {
                    if (this.status >= 200 && this.status < 300) {
                        recordSuccessfulDeletion(deletion.chatId, deletion.messageId)
                            .catch((error) => console.debug('[답변별 크래커] 삭제 기록 정리 실패:', error));
                    }
                }, { once: true });
            }
            return ORIGINAL_XHR_SEND.apply(this, arguments);
        };

        wrappedSend.__cacAnswerCostWrapped = true;
        W.XMLHttpRequest.prototype.send = wrappedSend;
    }

    function messageIdOf(message) {
        return normalizeId(message?._id || message?.id || message?.messageId || message?.message_id);
    }

    function isAssistantMessage(message) {
        const role = String(message?.role || message?.sender || '').toLowerCase();
        return role === 'assistant' || role === 'ai' || role === 'model';
    }

    function getObjectIdTime(id) {
        if (!/^[a-f0-9]{24}$/i.test(String(id || ''))) return 0;
        const timestamp = parseInt(String(id).slice(0, 8), 16) * 1000;
        return Number.isFinite(timestamp) ? timestamp : 0;
    }

    function getMessageTime(message) {
        const direct = message?.createdAt || message?.created_at || message?.date || '';
        const timestamp = direct ? new Date(direct).getTime() : 0;
        if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
        return getObjectIdTime(messageIdOf(message));
    }

    function buildMessageLookup(messages) {
        const idMap = new Map();
        const indexMap = new Map();

        messages.forEach((message, index) => {
            const id = messageIdOf(message);
            if (!id) return;
            idMap.set(id, message);
            indexMap.set(id, index);
        });

        return { idMap, indexMap };
    }

    function sortVariantsInUiOrder(variants, indexMap) {
        return [...variants].sort((a, b) => {
            const at = getMessageTime(a);
            const bt = getMessageTime(b);
            if (at > 0 && bt > 0 && at !== bt) return at - bt;

            const ai = indexMap.get(messageIdOf(a)) ?? 0;
            const bi = indexMap.get(messageIdOf(b)) ?? 0;
            return bi - ai;
        });
    }

    function parseCompareInfo(group) {
        if (!group) return null;
        const buttons = Array.from(group.querySelectorAll('button, [role="button"]'));

        for (const button of buttons) {
            const text = String(button.textContent || '').replace(/\s+/g, ' ').trim();
            const match = text.match(COMPARE_RE);
            if (!match) continue;

            const current = Number(match[1]);
            const total = Number(match[2]);
            if (current > 0 && total > 1 && current <= total) {
                return { button, current, total };
            }
        }

        return null;
    }

    function resolveDisplayedMessageId(group, compareInfo, lookup, messages) {
        const domMessageId = normalizeId(group?.getAttribute('data-message-group-id'));
        if (!compareInfo) return domMessageId;
        if (!domMessageId || !lookup) return '';

        const anchor = lookup.idMap.get(domMessageId);
        if (!anchor || !isAssistantMessage(anchor) || !anchor.parentTurnId) return '';

        const variants = messages.filter((message) =>
            isAssistantMessage(message)
            && message.parentTurnId
            && message.parentTurnId === anchor.parentTurnId
            && messageIdOf(message)
        );

        // 일부 답변만 API에 들어온 상태라면 순번을 추측하지 않고 표시하지 않는다.
        if (variants.length !== compareInfo.total) return '';

        const ordered = sortVariantsInUiOrder(variants, lookup.indexMap);
        const selected = ordered[compareInfo.current - 1];
        return selected ? messageIdOf(selected) : '';
    }

    async function fetchMessages(chatId) {
        const json = await requestJson(`${API.chats}/${encodeURIComponent(chatId)}/messages?limit=${APP.messageLimit}`);
        const messages = json?.data?.messages || json?.messages || json?.data || [];
        return Array.isArray(messages) ? messages : [];
    }

    function invalidateMessageCache(chatId = '') {
        if (!chatId || messageCache.chatId === chatId) messageCache = makeEmptyMessageCache();
    }

    async function getMessages(chatId) {
        const now = Date.now();
        if (messageCache.chatId === chatId
            && messageCache.lookup
            && now - messageCache.loadedAt < APP.messageCacheMs) {
            return messageCache;
        }

        if (messageCache.chatId === chatId && messageCache.inFlight) return messageCache.inFlight;

        const holder = messageCache.chatId === chatId ? messageCache : makeEmptyMessageCache();
        holder.chatId = chatId;
        messageCache = holder;

        holder.inFlight = fetchMessages(chatId)
            .then((messages) => {
                if (messageCache !== holder) return messageCache;
                holder.messages = messages;
                holder.lookup = buildMessageLookup(messages);
                holder.loadedAt = Date.now();
                return holder;
            })
            .finally(() => {
                if (messageCache === holder) holder.inFlight = null;
            });

        return holder.inFlight;
    }

    function findActionHost(group, compareInfo) {
        if (!group) return null;

        const optionButton = group.querySelector(
            'button[aria-label="메시지 옵션"], button[aria-label*="메시지 옵션"], button[aria-label*="옵션"]'
        );

        const rows = Array.from(group.querySelectorAll('div.flex.items-center.justify-between, div[class*="justify-between"]'));
        for (let index = rows.length - 1; index >= 0; index--) {
            const row = rows[index];
            if (!row.contains(optionButton) && !row.contains(compareInfo?.button)) continue;

            const directChildren = Array.from(row.children);
            const left = directChildren.find((child) => {
                if (!(child instanceof HTMLElement)) return false;
                const style = getComputedStyle(child);
                return style.display === 'flex' || style.display === 'inline-flex';
            });
            return left || row;
        }

        if (optionButton?.parentElement) return optionButton.parentElement;
        if (compareInfo?.button?.parentElement) return compareInfo.button.parentElement;
        return null;
    }

    function removeBadge(group) {
        group?.querySelectorAll?.(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
    }

    function createBadge() {
        const badge = document.createElement('span');
        badge.className = BADGE_CLASS;
        badge.innerHTML = COST_ICON_HTML;

        const amount = document.createElement('span');
        amount.className = 'cac-answer-cost-amount';
        badge.appendChild(amount);
        return badge;
    }

    function placeBadge(group, host, messageId, record) {
        if (!host || !record || Number(record.amount) <= 0) {
            removeBadge(group);
            return;
        }

        let badge = group.querySelector(`.${BADGE_CLASS}`);
        if (!badge) badge = createBadge();
        if (badge.parentElement !== host) host.insertBefore(badge, host.firstChild);

        const amount = Number(record.amount);
        badge.dataset.messageId = messageId;
        badge.title = `이 답변에서 측정된 크래커 소모량: ${amount.toLocaleString('ko-KR')}개`;
        badge.querySelector('.cac-answer-cost-amount').textContent = `${amount.toLocaleString('ko-KR')}개`;
    }

    async function renderCosts() {
        const sequence = ++renderSequence;
        const chatId = getCurrentChatId();
        const groups = Array.from(document.querySelectorAll(MESSAGE_GROUP_SELECTOR));

        if (!chatId || !groups.length) return;

        const costs = loadCosts(chatId);
        if (!Object.keys(costs).length) {
            groups.forEach(removeBadge);
            return;
        }

        const entries = groups.map((group) => ({ group, compareInfo: parseCompareInfo(group) }));
        const needsMessages = entries.some((entry) => !!entry.compareInfo);
        let cache = null;

        if (needsMessages) {
            try {
                cache = await getMessages(chatId);
            } catch (error) {
                console.debug('[답변별 크래커] 리롤 목록 확인 실패:', error);
            }
        }

        if (sequence !== renderSequence || chatId !== getCurrentChatId()) return;

        for (const { group, compareInfo } of entries) {
            const messageId = compareInfo
                ? resolveDisplayedMessageId(group, compareInfo, cache?.lookup, cache?.messages || [])
                : normalizeId(group.getAttribute('data-message-group-id'));

            const record = messageId ? costs[messageId] : null;
            if (!record || Number(record.amount) <= 0) {
                removeBadge(group);
                continue;
            }

            const host = findActionHost(group, compareInfo);
            if (!host) {
                removeBadge(group);
                continue;
            }

            placeBadge(group, host, messageId, record);
        }
    }

    function scheduleRender(delay = APP.renderDelayMs) {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            renderTimer = 0;
            renderCosts().catch((error) => console.debug('[답변별 크래커] 표시 갱신 실패:', error));
        }, Math.max(0, delay));
    }

    function isOwnMutationNode(node) {
        if (node?.nodeType === Node.TEXT_NODE) return !!node.parentElement?.closest?.(`.${BADGE_CLASS}`);
        return node instanceof Element && (node.matches(`.${BADGE_CLASS}`) || !!node.closest(`.${BADGE_CLASS}`));
    }

    function mutationTouchesMessages(mutation) {
        const target = mutation.target?.nodeType === Node.ELEMENT_NODE
            ? mutation.target
            : mutation.target?.parentElement;

        if (target?.closest?.(`.${BADGE_CLASS}`)) return false;
        if (target?.closest?.(MESSAGE_GROUP_SELECTOR)) {
            if (mutation.type !== 'childList') return true;
            const changed = [...mutation.addedNodes, ...mutation.removedNodes];
            if (changed.length && changed.every(isOwnMutationNode)) return false;
            return true;
        }

        if (mutation.type === 'childList') {
            for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
                if (!(node instanceof Element)) continue;
                if (node.matches(MESSAGE_GROUP_SELECTOR) || node.querySelector(MESSAGE_GROUP_SELECTOR)) return true;
            }
        }

        return target === document.body || target?.tagName === 'MAIN' || target?.id === '__next';
    }

    function installUiObserver() {
        if (!document.body || uiObserver) return;

        injectStyle();
        uiObserver = new MutationObserver((mutations) => {
            if (mutations.some(mutationTouchesMessages)) scheduleRender();
        });
        uiObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        scheduleRender(0);
    }

    function injectStyle() {
        if (document.getElementById('cac-answer-cost-style')) return;
        const style = document.createElement('style');
        style.id = 'cac-answer-cost-style';
        style.textContent = `
            .${BADGE_CLASS} {
                display: inline-flex;
                align-items: center;
                flex: 0 0 auto;
                gap: 3px;
                margin-right: 6px;
                color: var(--icon_tertiary, var(--text-tertiary, #888));
                font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-size: 12px;
                font-weight: 600;
                line-height: 1;
                letter-spacing: -0.01em;
                opacity: .86;
                pointer-events: none;
                user-select: none;
                white-space: nowrap;
            }
            .${BADGE_CLASS} svg { flex: 0 0 auto; }
            .${BADGE_CLASS}-amount { line-height: 14px; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function handlePossibleCompareClick(event) {
        const target = event.target?.closest?.('button, [role="button"], [role="menuitem"]');
        if (!target) return;

        const text = String(target.textContent || '').replace(/\s+/g, ' ').trim();
        if (!COMPARE_RE.test(text) && target.getAttribute('role') !== 'menuitem') return;

        scheduleRender(50);
        setTimeout(() => scheduleRender(0), 180);
        setTimeout(() => scheduleRender(0), 420);
    }

    function handleRouteChange() {
        const next = getRouteKey();
        if (next === lastRouteKey) return;
        lastRouteKey = next;
        invalidateMessageCache();
        renderSequence++;
        document.querySelectorAll(`.${BADGE_CLASS}`).forEach((badge) => badge.remove());
        scheduleRender(200);
    }

    function installHistoryHooks() {
        if (W.__cacAnswerCostHistoryHooked) return;
        W.__cacAnswerCostHistoryHooked = true;

        for (const key of ['pushState', 'replaceState']) {
            const original = W.history?.[key];
            if (typeof original !== 'function') continue;
            W.history[key] = function () {
                const result = original.apply(this, arguments);
                setTimeout(handleRouteChange, 0);
                return result;
            };
        }

        W.addEventListener('popstate', () => setTimeout(handleRouteChange, 0));
    }

    function installFallbackGenerationStartListeners() {
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
            const input = event.target?.closest?.(
                'textarea[placeholder*="메시지"], textarea[aria-label*="메시지"], [contenteditable="true"][role="textbox"]'
            );
            if (!input) return;
            const chatId = getCurrentChatId();
            if (chatId) pendingStarts.set(chatId, { startedAt: Date.now(), isReroll: false });
        }, true);

        document.addEventListener('pointerdown', (event) => {
            const button = event.target?.closest?.('button, [role="button"]');
            if (!button) return;

            const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''}`.trim();
            const isReroll = button.id === 'exp-reroll-btn' || /리롤|다시\s*생성|재생성/.test(text);
            const isSend = button.type === 'submit' || /메시지\s*보내기|전송/.test(text);
            if (!isReroll && !isSend) return;

            const chatId = getCurrentChatId();
            if (chatId) pendingStarts.set(chatId, { startedAt: Date.now(), isReroll });
        }, true);
    }

    function installStorageListener() {
        W.addEventListener('storage', (event) => {
            const chatId = getCurrentChatId();
            if (!chatId) return;

            if (event.key === STORAGE.costsPrefix + chatId || event.key === STORAGE.deletedPrefix + chatId) {
                invalidateMessageCache(chatId);
                scheduleRender(50);
            }
        });
    }

    function startDomFeatures() {
        if (document.body) {
            installUiObserver();
            return;
        }
        document.addEventListener('DOMContentLoaded', installUiObserver, { once: true });
    }

    installDataLayerHook();
    installDeleteFetchHook();
    installDeleteXhrHook();
    installHistoryHooks();
    installFallbackGenerationStartListeners();
    installStorageListener();
    document.addEventListener('click', handlePossibleCompareClick, true);
    startDomFeatures();
})();
