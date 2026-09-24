// ==UserScript==
// @name         Crack Char Clock Badge (크랙 글자수·시간 배지) 🕒
// @namespace    crack char clock badge
// @version      1.2.8
// @description  크랙 채팅 메시지에 정확 글자수(API content 기준)와 생성 시각을 기본 툴바 스타일로 표시합니다.
// @author       Assistant
// @downloadURL  https://gist.github.com/chyoyam-alt/b13ba3e1039a8cf4765566b10f8cfb8a/raw/CrackBadge.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/b13ba3e1039a8cf4765566b10f8cfb8a/raw/CrackBadge.user.js
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = 'https://crack-api.wrtn.ai/crack-gen/v3';
    const SCRIPT_NS = 'crack-char-clock-badge';
    const LOG_PREFIX = '[Crack Char Clock Badge]';
    const BADGE_CLASS = `${SCRIPT_NS}-badge`;
    const COMPARE_BUTTON_RE = /답변\s*비교\s*(\d+)\s*\/\s*(\d+)/;
    const USER_PAD_ABS_PLACEMENT = 'user-pad-abs';
    const USER_NOVEL_PAD_ABS_PLACEMENT = 'user-novel-pad-abs';
    const USER_FLOW_ROW_CLASS = `${SCRIPT_NS}-flow-row`;
    const USER_BUBBLE_FLOW_PLACEMENT = 'user-bubble-flow';
    const USER_NOVEL_FLOW_PLACEMENT = 'user-novel-flow';
    const MESSAGE_SELECTOR = 'div[data-message-group-id]';
    const MESSAGE_LIMIT = 200;

    const SETTING_KEYS = {
        showChars: `${SCRIPT_NS}:showChars`,
        showTime: `${SCRIPT_NS}:showTime`
    };

    const DEFAULT_SETTINGS = {
        showChars: true,
        showTime: true
    };

    // 답변 비교 n/m 상태에서 data-message-group-id가 실제 현재 답변 ID가 아닐 수 있어서,
    // API 메시지 목록을 읽어 현재 표시 중인 리롤 답변의 시간/글자수를 보정합니다.
    // API 실패 시에는 DOM의 data-message-group-id 기준 시간으로 fallback합니다.
    const RESOLVE_COMPARE_BY_API = true;

    // 새 답변이 생성된 직후에는 기존 messages API 캐시에 새 messageId가 없을 수 있습니다.
    // 글자수 미해결 상태에서만 캐시를 제한적으로 새로고침해, 새 메시지 글자수가 계속 time-only로 남는 문제를 막습니다.
    const API_FORCE_REFRESH_MIN_INTERVAL = 1600;

    let lastUrlKey = getUrlKey();
    let scanTimer = null;
    let apiCache = null;
    let apiPromise = null;
    let forcedApiRefreshPromise = null;
    let lastForcedApiRefreshAt = 0;
    const resultCache = new Map();
    const queuedGroups = new Set();
    const retryGroups = new Set();
    let fullScanPending = false;

    function getUrlKey() {
        return location.origin + location.pathname + location.search;
    }

    function resetPageCacheIfNeeded() {
        const key = getUrlKey();
        if (key === lastUrlKey) return;

        lastUrlKey = key;
        retryGroups.clear();
        apiCache = null;
        apiPromise = null;
        resultCache.clear();
    }

    function legacySettingKey(name) {
        const oldNs = 'crack-message-info-badge';
        if (name === 'showChars') return `${oldNs}:showChars`;
        if (name === 'showTime') return `${oldNs}:showTime`;
        return '';
    }

    function getSetting(name) {
        const key = SETTING_KEYS[name];
        const fallback = DEFAULT_SETTINGS[name];
        const legacyKey = legacySettingKey(name);

        try {
            if (typeof GM_getValue === 'function') {
                const saved = GM_getValue(key, undefined);
                if (typeof saved !== 'undefined') return saved !== false;

                if (legacyKey) {
                    const legacy = GM_getValue(legacyKey, undefined);
                    if (typeof legacy !== 'undefined') return legacy !== false;
                }

                return fallback;
            }
        } catch (e) {}

        try {
            const saved = localStorage.getItem(key);
            if (saved != null) return saved !== 'false';

            if (legacyKey) {
                const legacy = localStorage.getItem(legacyKey);
                if (legacy != null) return legacy !== 'false';
            }

            return fallback;
        } catch (e) {
            return fallback;
        }
    }

    function setSetting(name, value) {
        const key = SETTING_KEYS[name];
        const bool = !!value;

        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, bool);
            }
        } catch (e) {}

        try {
            localStorage.setItem(key, String(bool));
        } catch (e) {}
    }

    function anyInfoEnabled() {
        return getSetting('showChars') || getSetting('showTime');
    }

    function needApiForInfo() {
        // 글자수뿐 아니라 역할 보정에도 messages API를 씁니다.
        return anyInfoEnabled();
    }

    function toggleSetting(name, label) {
        const next = !getSetting(name);
        setSetting(name, next);

        // 설정 변경 후 기존 캐시를 버려야 껐다 켰을 때 글자수/API 보정이 즉시 반영됩니다.
        resultCache.clear();

        if (!anyInfoEnabled()) {
            retryGroups.clear();
            removeAllBadges();
        } else {
            scanAllVisibleGroups();
        }

        console.info(`${LOG_PREFIX} ${label}: ${next ? 'ON' : 'OFF'}`);
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('글자수 On/Off', () => {
            toggleSetting('showChars', '글자수');
        });

        GM_registerMenuCommand('생성 시간 On/Off', () => {
            toggleSetting('showTime', '생성 시간');
        });
    }

    function normalizeText(text = '') {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function countChars(text = '') {
        // [...str] 기준이라 이모지/서로게이트 페어를 1글자로 세는 쪽에 가깝습니다.
        return [...String(text || '')].length;
    }

    function formatNumber(value) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '';
        return value.toLocaleString('ko-KR');
    }

    function getCookie(name) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getCommonHeaders() {
        const token = getCookie('access_token');
        const headers = {
            accept: 'application/json, text/plain, */*',
            platform: 'web',
            'wrtn-locale': 'ko-KR'
        };

        if (token) headers.authorization = `Bearer ${token}`;

        const wrtnId = getCookie('__w_id');
        if (wrtnId) headers['x-wrtn-id'] = wrtnId;

        const mixpanelId = getCookie('Mixpanel-Distinct-Id');
        if (mixpanelId) headers['mixpanel-distinct-id'] = mixpanelId;

        return headers;
    }

    function extractChatIdFromUrl(url = location.href) {
        const str = String(url || '');
        const patterns = [
            /\/episodes\/([a-f0-9]{24})(?:[/?#]|$)/i,
            /\/chats\/([a-f0-9]{24})(?:[/?#]|$)/i,
            /"chatId":"([a-f0-9]{24})"/i
        ];

        for (const pattern of patterns) {
            const match = str.match(pattern);
            if (match) return match[1];
        }

        return null;
    }

    function findChatId() {
        const fromUrl = extractChatIdFromUrl();
        if (fromUrl) return fromUrl;

        try {
            return extractChatIdFromUrl(document.documentElement.innerHTML);
        } catch (e) {
            return null;
        }
    }

    async function fetchAllMessagesOnce(options = {}) {
        const force = !!options.force;

        if (!force && apiCache) return apiCache;
        if (apiPromise) return apiPromise;

        if (force) apiCache = null;

        const chatId = findChatId();
        if (!chatId) throw new Error('chatId not found');

        apiPromise = fetch(`${API_BASE}/chats/${chatId}/messages?limit=${MESSAGE_LIMIT}`, {
            method: 'GET',
            credentials: 'include',
            headers: getCommonHeaders()
        })
            .then(async res => {
                if (!res.ok) throw new Error(`messages fetch failed: ${res.status}`);
                const json = await res.json();
                const messages = json?.data?.messages || json?.messages || [];
                const list = Array.isArray(messages) ? messages : [];
                apiCache = buildApiCache(list);
                return apiCache;
            })
            .catch(err => {
                console.warn(`${LOG_PREFIX} API resolve failed:`, err);
                apiCache = null;
                throw err;
            })
            .finally(() => {
                apiPromise = null;
            });

        return apiPromise;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function refreshApiCacheThrottled() {
        if (forcedApiRefreshPromise) return forcedApiRefreshPromise;

        forcedApiRefreshPromise = (async () => {
            const elapsed = Date.now() - lastForcedApiRefreshAt;
            const wait = Math.max(0, API_FORCE_REFRESH_MIN_INTERVAL - elapsed);
            if (wait > 0) await sleep(wait);

            lastForcedApiRefreshAt = Date.now();
            return fetchAllMessagesOnce({ force: true });
        })().finally(() => {
            forcedApiRefreshPromise = null;
        });

        return forcedApiRefreshPromise;
    }

    function hasResolvedChars(resolved) {
        return typeof resolved?.charCount === 'number' && Number.isFinite(resolved.charCount);
    }

    function buildApiCache(messages) {
        const idMap = new Map();
        const apiIndexMap = new Map();

        messages.forEach((msg, index) => {
            const id = messageIdOf(msg);
            if (!id) return;
            idMap.set(id, msg);
            apiIndexMap.set(id, index);
        });

        return { messages, idMap, apiIndexMap };
    }

    function messageIdOf(msg) {
        return msg?._id || msg?.id || msg?.messageId || '';
    }

    function isAssistantMessage(msg) {
        return String(msg?.role || '').toLowerCase() === 'assistant';
    }

    function isUserResolvedMessage(resolved) {
        return String(resolved?.role || '').toLowerCase() === 'user';
    }

    function messageContentOf(msg) {
        if (!msg) return '';

        const direct = msg.content ?? msg.text ?? msg.message ?? msg.answer ?? msg.response ?? '';
        if (typeof direct === 'string') return direct;

        if (Array.isArray(direct)) {
            return direct.map(item => {
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object') {
                    return item.text || item.content || item.value || '';
                }
                return '';
            }).join('');
        }

        if (direct && typeof direct === 'object') {
            return direct.text || direct.content || direct.value || '';
        }

        return '';
    }

    function sortVariantsUiOrder(variants, apiIndexMap) {
        // 크랙 메시지 API는 보통 최신 리롤이 앞에 옵니다.
        // UI의 답변 1 → n 순서로 보려면 API index가 큰 것부터 정렬합니다.
        return [...variants].sort((a, b) => {
            const ai = apiIndexMap.get(messageIdOf(a)) ?? 0;
            const bi = apiIndexMap.get(messageIdOf(b)) ?? 0;
            return bi - ai;
        });
    }

    function getGroupMessageId(group) {
        return group?.getAttribute?.('data-message-group-id') || '';
    }

    function isObjectId(value = '') {
        return /^[a-f0-9]{24}$/i.test(String(value || ''));
    }

    function objectIdToDate(objectId = '') {
        if (!isObjectId(objectId)) return null;

        const seconds = parseInt(String(objectId).slice(0, 8), 16);
        if (!Number.isFinite(seconds) || seconds <= 0) return null;

        const date = new Date(seconds * 1000);
        if (Number.isNaN(date.getTime())) return null;

        return date;
    }

    function findCompareButtonInGroup(group) {
        if (!group) return null;

        const buttons = Array.from(group.querySelectorAll('button'));
        return buttons.find(btn => COMPARE_BUTTON_RE.test(normalizeText(btn.textContent || ''))) || null;
    }

    function parseCompareButton(group) {
        const btn = findCompareButtonInGroup(group);
        if (!btn) return null;

        const text = normalizeText(btn.textContent || '');
        const match = text.match(COMPARE_BUTTON_RE);
        if (!match) return null;

        return {
            current: Number(match[1]),
            total: Number(match[2])
        };
    }

    function makeCacheKey(group) {
        const id = getGroupMessageId(group);
        const compare = parseCompareButton(group);
        return compare ? `${id}:${compare.current}/${compare.total}` : id;
    }

    function resolveByDomId(group) {
        const domId = getGroupMessageId(group);
        const date = objectIdToDate(domId);

        return {
            messageId: domId,
            date,
            source: 'dom',
            role: null,
            note: date ? 'DOM messageId 기준 생성 시각' : 'ObjectId 형식이 아니어서 시간 계산 불가',
            charCount: null
        };
    }

    function enrichResolvedWithMessage(resolved, msg, sourceNote) {
        if (!msg) return resolved;

        const currentId = messageIdOf(msg) || resolved.messageId;
        const content = messageContentOf(msg);

        return {
            ...resolved,
            messageId: currentId,
            date: objectIdToDate(currentId) || resolved.date,
            source: sourceNote || resolved.source,
            role: String(msg?.role || resolved.role || '').toLowerCase() || null,
            note: sourceNote === 'api-current-reroll'
                ? resolved.note
                : 'messages API 기준 메시지 본문/생성 시각',
            charCount: content ? countChars(content) : null
        };
    }

    async function resolveCurrentMessageInfo(group, options = {}) {
        const fallback = resolveByDomId(group);
        const compare = parseCompareButton(group);

        const shouldUseApi =
            needApiForInfo() ||
            (RESOLVE_COMPARE_BY_API && compare && compare.total > 1);

        if (!shouldUseApi) return fallback;
        if (!fallback.messageId || !isObjectId(fallback.messageId)) return fallback;

        try {
            const { messages, idMap, apiIndexMap } = await fetchAllMessagesOnce(options);

            if (RESOLVE_COMPARE_BY_API && compare && compare.total > 1) {
                const anchor = idMap.get(fallback.messageId);

                if (!anchor || !isAssistantMessage(anchor) || !anchor.parentTurnId) {
                    return enrichResolvedWithMessage(fallback, idMap.get(fallback.messageId), 'api-message');
                }

                const variants = messages.filter(msg =>
                    isAssistantMessage(msg) &&
                    msg.parentTurnId &&
                    msg.parentTurnId === anchor.parentTurnId &&
                    messageIdOf(msg)
                );

                if (variants.length !== compare.total) {
                    return enrichResolvedWithMessage(fallback, idMap.get(fallback.messageId), 'api-message');
                }

                const ordered = sortVariantsUiOrder(variants, apiIndexMap);
                const currentMsg = ordered[compare.current - 1];
                const currentId = messageIdOf(currentMsg);
                const date = objectIdToDate(currentId);

                if (!date) {
                    return enrichResolvedWithMessage(fallback, currentMsg, 'api-current-reroll');
                }

                return enrichResolvedWithMessage({
                    messageId: currentId,
                    date,
                    source: 'api-current-reroll',
                    note: `답변 비교 ${compare.current}/${compare.total} 현재 답변 기준`
                }, currentMsg, 'api-current-reroll');
            }

            return enrichResolvedWithMessage(fallback, idMap.get(fallback.messageId), 'api-message');
        } catch (e) {
            return fallback;
        }
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatBadgeDate(date) {
        if (!date) return '';

        // 요청 형식: 0000.00.00. 24:00
        // 실제 표기는 24시간제 HH:mm으로 표시합니다.
        return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}. ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }

    function formatFullDate(date) {
        if (!date) return '';

        return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ` +
            `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    }

    function buildBadgeParts(resolved) {
        const parts = [];

        // 요청 순서: 몇 자 · 시간
        if (getSetting('showChars') && hasResolvedChars(resolved)) {
            parts.push(`${formatNumber(resolved.charCount)}자`);
        }

        if (getSetting('showTime') && resolved?.date) {
            parts.push(formatBadgeDate(resolved.date));
        }

        return parts;
    }

    function findMessageOptionAnchor(group) {
        if (!group) return null;

        const optionButton = group.querySelector('button[aria-label="메시지 옵션"]');
        if (!optionButton) return null;

        return optionButton.closest('.dropdown-button') || optionButton;
    }

    function findRerollButtonAnchor(group) {
        if (!group) return null;

        const buttons = Array.from(group.querySelectorAll('button'));
        const compareButton = findCompareButtonInGroup(group);
        const optionButton = group.querySelector('button[aria-label="메시지 옵션"]');

        return buttons.find(btn => {
            if (!btn || btn === compareButton || btn === optionButton) return false;
            if (btn.closest('.dropdown-button')) return false;

            const text = normalizeText(btn.textContent || '');
            if (COMPARE_BUTTON_RE.test(text)) return false;

            const html = btn.innerHTML || '';
            return (
                html.includes('M3.8 12a8.2') ||
                html.includes('M3.8 12') ||
                html.includes('A9.8 9.8') ||
                html.includes('A8.21 8.21') ||
                /viewBox="0 0 24 24"[\s\S]*?M3\.8\s+12/.test(html)
            );
        }) || null;
    }

    function findSmartAnchor(group) {
        // AI 답변: 답변 비교 버튼 왼쪽 → 리롤 버튼 왼쪽 → ... 메뉴 왼쪽
        // 유저 메시지/지나간 메시지: ... 메뉴 왼쪽
        const compareButton = findCompareButtonInGroup(group);
        if (compareButton) {
            return {
                anchor: compareButton,
                placement: 'compare-left'
            };
        }

        const rerollButton = findRerollButtonAnchor(group);
        if (rerollButton) {
            return {
                anchor: rerollButton,
                placement: 'reroll-left'
            };
        }

        const optionAnchor = findMessageOptionAnchor(group);
        if (optionAnchor) {
            return {
                anchor: optionAnchor,
                placement: 'option-left'
            };
        }

        return {
            anchor: null,
            placement: 'fallback'
        };
    }

    function getVisibleRect(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        return rect;
    }

    function findUserPadAbsContainer(group) {
        if (!group) return null;

        // UI 2 기준 유저 말풍선 바깥 wrapper:
        // div.flex.flex-col.gap-2.relative.mb-5.w-full.items-end
        // 이미 relative + mb-5를 가진 이 컨테이너의 기존 아래 여백을 배지 자리로 재활용합니다.
        const selectors = [
            ':scope > div.relative.mb-5.w-full.items-end',
            ':scope > div.relative.mb-5.items-end',
            'div.relative.mb-5.w-full.items-end',
            'div.relative.mb-5.items-end'
        ];

        for (const selector of selectors) {
            try {
                const found = group.querySelector(selector);
                if (found && getVisibleRect(found)) return found;
            } catch (e) {}
        }

        return null;
    }

    function ensurePositionAnchor(el) {
        if (!el) return;

        try {
            const position = getComputedStyle(el).position;
            if (!position || position === 'static') {
                el.style.position = 'relative';
            }
        } catch (e) {
            el.style.position = 'relative';
        }
    }

    function findUserNovelPadAbsContainer(group) {
        if (!group) return null;

        // UI 2 소설형 유저 메시지 기준 박스:
        // div.flex.flex-row.gap-4.w-full.items-end.justify-between.border-y.border-outline_tertiary.py-5
        // 이 박스의 아래쪽 py-5 패딩 영역을 배지 자리로 재활용합니다.
        // 말풍선형은 mb-5 + bg-surface_chat_secondary 쪽을 쓰므로 여기와 분리됩니다.
        const selectors = [
            ':scope div.flex.flex-row.gap-4.w-full.items-end.justify-between.border-y.border-outline_tertiary.py-5',
            ':scope div.border-y.border-outline_tertiary.py-5',
            ':scope div[class*="border-y"][class*="border-outline_tertiary"][class*="py-5"]',
            ':scope div[class*="border-y"][class*="py-5"]'
        ];

        for (const selector of selectors) {
            try {
                const found = group.querySelector(selector);
                if (found && getVisibleRect(found)) return found;
            } catch (e) {}
        }

        return null;
    }

    function ensureUserFlowRowAfter(box) {
        const parent = box?.parentElement;
        if (!parent) return null;

        let row = box.nextElementSibling;
        if (!row || !row.classList?.contains(USER_FLOW_ROW_CLASS)) {
            row = document.createElement('div');
            row.className = USER_FLOW_ROW_CLASS;
            parent.insertBefore(row, box.nextSibling);
        }
        return row;
    }

    function ensureUserFlowRowInside(wrap) {
        if (!wrap) return null;

        let row = wrap.querySelector(`:scope > .${USER_FLOW_ROW_CLASS}`);
        if (!row) {
            row = document.createElement('div');
            row.className = USER_FLOW_ROW_CLASS;
            wrap.appendChild(row);
        } else if (row !== wrap.lastElementChild) {
            wrap.appendChild(row);
        }
        return row;
    }

    function ensureUserPadAbs(group, badge) {
        if (!group || !badge) return false;

        // 소설형 UI 2: border-y + py-5 박스는 flex-row라 박스 안에 넣으면 옆으로 붙습니다.
        // 박스 바로 아래에 normal-flow 줄을 만들어 그 안에 배지를 넣습니다. (absolute 제거)
        const novelBox = findUserNovelPadAbsContainer(group);
        if (novelBox) {
            const row = ensureUserFlowRowAfter(novelBox);
            if (row) {
                if (badge.parentElement !== row) row.appendChild(badge);
                badge.dataset.placement = USER_NOVEL_FLOW_PLACEMENT;
                return true;
            }
        }

        // 말풍선형 UI: flex-col items-end wrapper의 마지막 자식 줄로 넣으면
        // 말풍선 아래에 우측 정렬로 자연스럽게 쌓입니다. (absolute 제거)
        const bubbleWrap = findUserPadAbsContainer(group);
        if (bubbleWrap) {
            const row = ensureUserFlowRowInside(bubbleWrap);
            if (row) {
                if (badge.parentElement !== row) row.appendChild(badge);
                badge.dataset.placement = USER_BUBBLE_FLOW_PLACEMENT;
                return true;
            }
        }

        return false;
    }

    function ensureBadge(group, resolved) {
        let badge = group.querySelector(`.${BADGE_CLASS}`);

        if (!badge) {
            badge = document.createElement('span');
            badge.className = `${BADGE_CLASS} relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap font-medium transition-colors duration-200 h-6 rounded px-2 py-1 text-xs bg-transparent text-line-gray-2`;
            badge.setAttribute('aria-label', '메시지 정보');
        }

        // 유저 메시지는 UI 유형별 기존 여백에 absolute로 얹습니다.
        // 새 줄을 만들지 않고, 말풍선 옆 flex 공간도 먹지 않고, 본문 끝에 섞이지도 않게 합니다.
        if (isUserResolvedMessage(resolved) && ensureUserPadAbs(group, badge)) {
            return badge;
        }

        const { anchor, placement } = findSmartAnchor(group);

        if (anchor?.parentElement) {
            if (badge.parentElement !== anchor.parentElement || badge.nextElementSibling !== anchor) {
                anchor.parentElement.insertBefore(badge, anchor);
            }
            badge.dataset.placement = placement;
        } else if (badge.parentElement !== group) {
            group.appendChild(badge);
            badge.dataset.placement = 'fallback';
        }

        return badge;
    }

    function removeBadge(group) {
        group?.querySelector?.(`.${BADGE_CLASS}`)?.remove();
    }

    function removeAllBadges() {
        document.querySelectorAll(`.${BADGE_CLASS}`).forEach(el => el.remove());
    }

    function setBadge(group, resolved) {
        const parts = buildBadgeParts(resolved);

        if (!parts.length) {
            removeBadge(group);
            return;
        }

        const badge = ensureBadge(group, resolved);

        // 다운그레이드 방지:
        // 글자수가 이미 붙어있는데, API 실패/미스 fallback 결과가 뒤늦게 와서
        // 시간-only 배지로 덮어쓰는 것을 막습니다.
        const wantChars = getSetting('showChars');
        const hasCharsNow = /\d[\d,]*자/.test(badge.textContent || '');
        const hasCharsNew = hasResolvedChars(resolved);
        if (wantChars && hasCharsNow && !hasCharsNew) return;

        const label = parts.join(' · ');
        const full = formatFullDate(resolved.date);

        const titleLines = [
            label,
            full ? `생성 시각: ${full}` : '',
            hasResolvedChars(resolved) ? `글자수: ${formatNumber(resolved.charCount)}자 (API content 기준)` : '',
            resolved.note || '',
            resolved.messageId ? `messageId: ${resolved.messageId}` : ''
        ].filter(Boolean);

        const title = titleLines.join('\n');
        const source = resolved.source || 'dom';

        // 값이 실제로 바뀐 경우에만 DOM 갱신합니다.
        // textContent를 같은 값으로 다시 써도 childList mutation이 발생할 수 있어서,
        // 자기 MutationObserver를 계속 깨우는 무한 루프를 차단합니다.
        if (badge.textContent !== label) badge.textContent = label;
        if (badge.title !== title) badge.title = title;
        if (badge.dataset.source !== source) badge.dataset.source = source;

        const role = resolved.role || '';
        if (role && badge.dataset.role !== role) badge.dataset.role = role;
        if (!role && 'role' in badge.dataset) delete badge.dataset.role;

        if (resolved.source === 'api-current-reroll') {
            if (badge.dataset.rerollResolved !== 'true') badge.dataset.rerollResolved = 'true';
        } else if ('rerollResolved' in badge.dataset) {
            delete badge.dataset.rerollResolved;
        }
    }

    function isUserGroupByDom(group) {
        // messages API role 응답 전에도, 유저 말풍선/소설형 박스 구조만 보고 유저 메시지를 판정합니다.
        // ensureUserPadAbs가 실제로 노리는 컨테이너와 동일 기준이라, 최종 배치와 어긋나지 않습니다.
        if (!group) return false;
        return !!(findUserNovelPadAbsContainer(group) || findUserPadAbsContainer(group));
    }

    function applyDomUserRole(group, resolved) {
        if (!resolved || resolved.role || !isUserGroupByDom(group)) return resolved;
        return { ...resolved, role: 'user' };
    }

    function cacheResolvedIfReady(key, resolved) {
        if (!getSetting('showChars') || hasResolvedChars(resolved)) {
            resultCache.set(key, resolved);
        }
    }

    function processGroup(group) {
        if (!group?.isConnected || !group.matches?.(MESSAGE_SELECTOR)) return;

        if (!anyInfoEnabled()) {
            removeBadge(group);
            return;
        }

        const key = makeCacheKey(group);
        if (!key) return;

        const cached = resultCache.get(key);

        if (cached) {
            retryGroups.delete(group);
            setBadge(group, cached);
            return;
        }

        retryGroups.add(group);
        const fallback = applyDomUserRole(group, resolveByDomId(group));

        if (fallback.date && getSetting('showTime')) {
            // API 보정 전에도 바로 보이게 가볍게 붙입니다.
            setBadge(group, fallback);
        }

        resolveCurrentMessageInfo(group).then(resolved => {
            resolved = applyDomUserRole(group, resolved);

            // 글자수가 필요한데 못 구한 결과(fallback/API 미스)는 캐시에 박지 않습니다.
            // 한 번 실패한 time-only 결과가 영구 캐시되어 글자수 재시도를 막는 문제를 방지합니다.
            const needChars = getSetting('showChars');
            const gotChars = hasResolvedChars(resolved);

            cacheResolvedIfReady(key, resolved);
            setBadge(group, resolved);

            // 새 답변은 기존 messages API 캐시에 아직 없을 수 있습니다.
            // 글자수가 필요하지만 못 구한 경우에만 API 캐시를 한 번 새로고침한 뒤 재확인합니다.
            if (needChars && !gotChars && group.isConnected) {
                refreshApiCacheThrottled()
                    .then(() => {
                        if (!group.isConnected || resultCache.has(key)) return null;
                        return resolveCurrentMessageInfo(group, { force: false });
                    })
                    .then(retryResolved => {
                        if (!retryResolved) return;

                        retryResolved = applyDomUserRole(group, retryResolved);
                        cacheResolvedIfReady(key, retryResolved);
                        setBadge(group, retryResolved);
                    })
                    .catch(err => {
                        console.warn(`${LOG_PREFIX} API refresh retry failed:`, err);
                    });
            }
        });
    }

    function collectGroupsFromNode(node) {
        if (!node) return [];
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el) return [];
        const owner = el.closest?.(MESSAGE_SELECTOR);
        if (owner) return [owner];
        return Array.from(el.querySelectorAll?.(MESSAGE_SELECTOR) || []);
    }

    function scanAllVisibleGroups() {
        resetPageCacheIfNeeded();

        if (!anyInfoEnabled()) {
            removeAllBadges();
            return;
        }

        document.querySelectorAll(MESSAGE_SELECTOR).forEach(processGroup);
    }

    function scheduleScan(nodes = null) {
        if (nodes === null) fullScanPending = true;
        else for (const node of nodes) {
            for (const group of collectGroupsFromNode(node)) if (group.isConnected) queuedGroups.add(group);
        }
        if (!fullScanPending && !queuedGroups.size) return;
        // Coalesce a burst without discarding earlier groups or starving under streaming.
        if (scanTimer !== null) return;
        scanTimer = setTimeout(() => {
            scanTimer = null;
            const full = fullScanPending || getUrlKey() !== lastUrlKey;
            fullScanPending = false;
            const groups = Array.from(queuedGroups);
            queuedGroups.clear();
            resetPageCacheIfNeeded();
            if (!anyInfoEnabled()) {
                retryGroups.clear();
                removeAllBadges();
                return;
            }
            if (full) scanAllVisibleGroups();
            else groups.forEach(group => { if (group.isConnected) processGroup(group); });
        }, 120);
    }

    function injectStyles() {
        GM_addStyle(`
            .${BADGE_CLASS} {
                flex: 0 0 auto;
                width: fit-content;
                max-width: 100%;
                height: 1.5rem;
                min-height: 1.5rem;
                margin: 0;
                padding: .25rem .5rem;
                border: 0 !important;
                border-radius: 4px;
                background-color: var(--transparent) !important;
                background-image: none !important;
                color: hsl(var(--line-gray-2)) !important;
                font-size: 12px;
                font-weight: 500;
                line-height: inherit;
                letter-spacing: inherit;
                white-space: nowrap;
                user-select: none;
                pointer-events: none;
                opacity: 1;
                box-sizing: border-box;
                vertical-align: middle;
                -webkit-font-smoothing: antialiased;
                transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;
                transition-timing-function: cubic-bezier(.4,0,.2,1);
                transition-duration: .2s;
            }

            .${BADGE_CLASS}[data-placement="fallback"] {
                margin: 4px 10px 0 auto;
            }

            .${BADGE_CLASS}[data-placement="compare-left"],
            .${BADGE_CLASS}[data-placement="reroll-left"],
            .${BADGE_CLASS}[data-placement="option-left"] {
                align-self: center;
            }

            /* 유저 배지: absolute 대신 normal-flow 줄에 배치 (입력창 위로 떠오름 방지) */
            .${USER_FLOW_ROW_CLASS} {
                width: 100%;
                flex-basis: 100%;
                text-align: right;
                pointer-events: none;
            }

            .${BADGE_CLASS}[data-placement="user-bubble-flow"],
            .${BADGE_CLASS}[data-placement="user-novel-flow"] {
                position: static;
                display: inline-flex;
                align-items: center;
                justify-content: flex-end;
                flex: 0 0 auto;
                width: fit-content;
                max-width: 100%;
                height: 18px;
                min-height: 18px;
                max-height: 18px;
                margin: 0;
                padding: 0;
                border: 0 !important;
                border-radius: 0;
                background-color: transparent !important;
                background-image: none !important;
                color: hsl(var(--line-gray-2)) !important;
                font-size: 12px;
                font-weight: 500;
                line-height: 18px;
                white-space: nowrap;
                overflow: visible;
                opacity: .76;
                pointer-events: none;
                user-select: none;
            }

            .${BADGE_CLASS}[data-placement="user-novel-flow"] {
                margin-top: 2px;
            }

            .${BADGE_CLASS}[data-reroll-resolved="true"] {
                color: hsl(var(--line-gray-2)) !important;
                background-color: var(--transparent) !important;
            }

            body[data-theme="dark"] .${BADGE_CLASS},
            [data-theme="dark"] .${BADGE_CLASS} {
                color: hsl(var(--line-gray-2)) !important;
            }

            @media (prefers-color-scheme: dark) {
                body:not([data-theme="light"]) .${BADGE_CLASS} {
                    color: hsl(var(--line-gray-2)) !important;
                }
            }

            @media (max-width: 720px) {
                .${BADGE_CLASS} {
                    font-size: 12px;
                    opacity: 1;
                }

                .${BADGE_CLASS}[data-placement="fallback"] {
                    margin: 4px 8px 0 auto;
                }

                .${BADGE_CLASS}[data-placement="user-bubble-flow"],
                .${BADGE_CLASS}[data-placement="user-novel-flow"] {
                    font-size: 12px;
                    opacity: 1;
                }
            }
        `);
    }

    function init() {
        injectStyles();
        registerMenuCommands();

        const ready = () => {
            if (!document.body) return;

            scanAllVisibleGroups();

            const observer = new MutationObserver(mutations => {
                const nodes = [];
                for (const mutation of mutations) {
                    const target = mutation.target?.nodeType === Node.ELEMENT_NODE
                        ? mutation.target : mutation.target?.parentElement;
                    if (target?.closest?.(`.${BADGE_CLASS}`)) continue;
                    const onlyOwnAddition = mutation.type === 'childList' && !mutation.removedNodes.length &&
                        mutation.addedNodes.length && Array.from(mutation.addedNodes).every(node =>
                            node.nodeType === Node.ELEMENT_NODE && node.matches?.(`.${BADGE_CLASS}, .${USER_FLOW_ROW_CLASS}`));
                    if (onlyOwnAddition) continue;
                    const owner = target?.closest?.(MESSAGE_SELECTOR);
                    if (owner) nodes.push(owner);
                    mutation.addedNodes?.forEach(node => nodes.push(node));
                }
                scheduleScan(nodes);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // Placement may change through root theme classes or responsive layout,
            // without replacing messages. Recover on these actual changes, not every 3.5s.
            const rootThemeSignature = () => [document.documentElement, document.body]
                .map(el => `${el?.className || ''}|${el?.getAttribute('data-theme') || ''}`).join('\n');
            let lastRootTheme = rootThemeSignature();
            const rootThemeObserver = new MutationObserver(() => {
                const next = rootThemeSignature();
                if (next === lastRootTheme) return;
                lastRootTheme = next;
                scheduleScan();
            });
            for (const root of [document.documentElement, document.body]) {
                rootThemeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
            }
            window.addEventListener('resize', () => scheduleScan(), { passive: true });
            document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleScan(); });

            // DOM remounts are handled above. Keep API-miss recovery without scanning history.
            setInterval(() => {
                if (document.hidden) return;
                if (getUrlKey() !== lastUrlKey) { scheduleScan(); return; }
                if (!anyInfoEnabled()) { retryGroups.clear(); return; }
                for (const group of retryGroups) {
                    if (!group.isConnected || resultCache.has(makeCacheKey(group))) retryGroups.delete(group);
                    else processGroup(group);
                }
            }, 3500);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ready, { once: true });
        } else {
            ready();
        }
    }

    init();
})();