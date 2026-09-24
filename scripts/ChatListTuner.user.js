// ==UserScript==
// @name         📑 Crack Chat List Tuner (크랙 채팅방 목록 튜너)
// @namespace    chat list tuner
// @version      1.2.3
// @description  채팅방 목록을 프로필 링 색상·통합 검색·한눈에 보기(PC·모바일)·스마트 자동 정리로 정돈합니다.
// @match        *://crack.wrtn.ai/*
// @downloadURL  https://gist.github.com/chyoyam-alt/4a9b682d5f64cd0e9ca76f5f5a85f6c5/raw/ChatListTuner.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/4a9b682d5f64cd0e9ca76f5f5a85f6c5/raw/ChatListTuner.user.js
// @grant        none
// @run-at       document-start
// ==/UserScript==


(function () {
    'use strict';
    if (window.__crackChatListTunerRunning) return;
    window.__crackChatListTunerRunning = true;

    // 크랙 앱이 API를 호출할 때 사용하는 인증 관련 헤더를 브라우저 내부에서만 재사용합니다.
    // 캡처한 값은 외부로 출력하지 않고, 같은 crack-api.wrtn.ai 검색 API 호출에만 사용합니다.
    const CRACK_AUTH_CAPTURE = {
        headers: {},
        capturedAt: 0,
        waiters: []
    };

    function isCrackApiUrl(url) {
        try {
            return new URL(String(url || ''), location.origin).origin === 'https://crack-api.wrtn.ai';
        } catch {
            return false;
        }
    }

    function isReusableAuthHeader(name) {
        return String(name || '').toLowerCase() === 'authorization';
    }
    function rememberAuthHeader(name, value) {
        if (!isReusableAuthHeader(name)) return;
        if (value == null || value === '') return;

        CRACK_AUTH_CAPTURE.headers[String(name).toLowerCase()] = String(value);
        CRACK_AUTH_CAPTURE.capturedAt = Date.now();

        const waiters = CRACK_AUTH_CAPTURE.waiters.splice(0);
        waiters.forEach(resolve => resolve(true));
    }


    // 직접 API 호출 시에는 authorization 토큰 하나만 보낸다.
    // x-wrtn-id 등 캡처된 다른 헤더가 섞이면 크랙 서버가 401로 거부할 수 있다.
    function getAuthHeaderOnly() {
        const h = CRACK_AUTH_CAPTURE.headers;
        const token = h['authorization'] || h['Authorization'];
        return token ? { authorization: token } : {};
    }


    function hasAuthToken() {
        return !!(CRACK_AUTH_CAPTURE.headers['authorization'] || CRACK_AUTH_CAPTURE.headers['Authorization']);
    }

    function waitForAuthToken(timeout = 6000) {
        if (hasAuthToken()) return Promise.resolve(true);

        return new Promise(resolve => {
            const timer = setTimeout(() => {
                const idx = CRACK_AUTH_CAPTURE.waiters.indexOf(done);
                if (idx >= 0) CRACK_AUTH_CAPTURE.waiters.splice(idx, 1);
                resolve(false);
            }, timeout);

            function done(value) {
                clearTimeout(timer);
                resolve(value);
            }

            CRACK_AUTH_CAPTURE.waiters.push(done);
        });
    }


    function headersToEntries(headers) {
        const entries = [];
        if (!headers) return entries;

        try {
            if (headers instanceof Headers) {
                headers.forEach((value, key) => entries.push([key, value]));
                return entries;
            }
        } catch {}

        if (Array.isArray(headers)) {
            for (const pair of headers) {
                if (Array.isArray(pair) && pair.length >= 2) entries.push([pair[0], pair[1]]);
            }
            return entries;
        }

        if (typeof headers === 'object') {
            for (const [key, value] of Object.entries(headers)) entries.push([key, value]);
        }

        return entries;
    }

    function captureHeadersFromFetch(input, init) {
        const url = input instanceof Request ? input.url : String(input || '');
        if (!isCrackApiUrl(url)) return;

        try {
            if (input instanceof Request) {
                headersToEntries(input.headers).forEach(([key, value]) => rememberAuthHeader(key, value));
            }
        } catch {}

        try {
            headersToEntries(init?.headers).forEach(([key, value]) => rememberAuthHeader(key, value));
        } catch {}
    }

    function isArchiveMutationRequest(input, init = {}) {
        const url = input instanceof Request ? input.url : String(input || '');
        if (!isCrackApiUrl(url)) return false;

        const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;

        let pathname = '';
        try {
            pathname = new URL(url, location.origin).pathname.toLowerCase();
        } catch {}

        // 자동 정리 미리보기 생성은 POST지만 서버 데이터를 바꾸지 않는다.
        // 이를 변경 요청으로 취급하면 스마트 정리 도중 전체 개수 조회가 중복 실행된다.
        if (pathname.endsWith('/chat-folders/auto-organize/preview')) return false;

        // 보관함 생성/삭제/자동 정리/채팅 이동 API는 보통 chat-folders 계열을 사용한다.
        if (pathname.includes('chat-folder') || pathname.includes('chat_folder') || pathname.includes('/archive')) {
            return true;
        }

        // 채팅 수정 API 본문에 폴더 ID가 실리는 구조도 함께 잡는다.
        const body = init?.body;
        if (typeof body === 'string' && /(?:chatFolderId|folderId|folder_id)/i.test(body)) return true;

        try {
            if (body instanceof URLSearchParams || body instanceof FormData) {
                for (const key of body.keys()) {
                    if (/^(?:chatFolderId|folderId|folder_id)$/i.test(String(key))) return true;
                }
            }
        } catch {}

        return false;
    }

    function markArchiveDataChanged() {
        // 현재 숫자와 검색 인덱스를 낡은 상태로 표시하고 서버 반영 뒤 정확한 값을 다시 읽는다.
        archiveSearchState.countUpdatedAt = 0;
        archiveSearchState.refreshedThisPage = false;
        scheduleCountRefresh(true);
    }

    function installAuthHeaderCapture() {
        try {
            const originalFetch = window.fetch;
            if (typeof originalFetch === 'function' && !originalFetch.__crackUiAuthCapture) {
                const wrappedFetch = function(input, init) {
                    captureHeadersFromFetch(input, init);
                    const refreshArchiveCount = isArchiveMutationRequest(input, init);
                    const request = originalFetch.apply(this, arguments);

                    if (refreshArchiveCount) {
                        Promise.resolve(request).then(response => {
                            if (response?.ok) markArchiveDataChanged();
                        }).catch(() => {});
                    }

                    return request;
                };
                wrappedFetch.__crackUiAuthCapture = true;
                wrappedFetch.__originalFetch = originalFetch;
                window.fetch = wrappedFetch;
            }
        } catch (error) {
            console.warn('[Crack UI] fetch 인증 헤더 캡처 설치 실패:', error);
        }

        try {
            const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
            if (proto && !proto.__crackUiAuthCapture) {
                const originalOpen = proto.open;
                const originalSetRequestHeader = proto.setRequestHeader;
                const originalSend = proto.send;

                proto.open = function(method, url) {
                    this.__crackUiRequestUrl = String(url || '');
                    this.__crackUiRequestMethod = String(method || 'GET');
                    return originalOpen.apply(this, arguments);
                };

                proto.setRequestHeader = function(name, value) {
                    if (isCrackApiUrl(this.__crackUiRequestUrl)) {
                        rememberAuthHeader(name, value);
                    }
                    return originalSetRequestHeader.apply(this, arguments);
                };

                proto.send = function(body) {
                    const refreshArchiveCount = isArchiveMutationRequest(this.__crackUiRequestUrl, {
                        method: this.__crackUiRequestMethod,
                        body
                    });

                    if (refreshArchiveCount) {
                        this.addEventListener('loadend', () => {
                            if (this.status >= 200 && this.status < 300) markArchiveDataChanged();
                        }, { once: true });
                    }

                    return originalSend.apply(this, arguments);
                };

                proto.__crackUiAuthCapture = true;
            }
        } catch (error) {
            console.warn('[Crack UI] XHR 인증 헤더 캡처 설치 실패:', error);
        }
    }

    installAuthHeaderCapture();

    function addCrackStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        const mount = () => (document.head || document.documentElement)?.appendChild(style);
        if (document.documentElement) mount();
        else document.addEventListener('DOMContentLoaded', mount, { once: true });
        return style;
    }
    // 로컬 스토리지 키값
    const STORAGE_KEY = 'crackColor_episode_v10_';
    const ARCHIVE_HEIGHT_KEY = 'crack_archive_h';
    const ARCHIVE_HEIGHT_MIN = 50;
    const ARCHIVE_HEIGHT_DEFAULT = 284;

    // 보관함 및 채팅 목록 제목 검색 인덱스
    const ARCHIVE_SEARCH_CACHE_KEY = 'crackUnifiedTitleSearchIndex_v6_overlay';
    const ARCHIVE_SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30분
    const CRACK_API_BASE = 'https://crack-api.wrtn.ai';
    const API_PAGE_LIMIT = 40;
    const API_CONCURRENCY = 4;
    const MAX_ARCHIVE_FOLDERS = 80;
    const MAX_ARCHIVE_CHATS = 3000;
    const MAX_ARCHIVE_RESULTS = 200;
    const SMART_ORGANIZE_LOAD_CONCURRENCY = 4;

    // 커스텀 팔레트 색상 정의
    const colorValues = {
        rose: '#d87791',
        gold: '#c9ab55',
        emerald: '#65b984',
        teal: '#67b9c0',
        violet: '#b188c7'
    };

    // 테마별(다크/라이트) 배경 투명도 및 발광(Glow) 효과 정의
    const themeColorSets = {
        dark: {
            accents: {
                rose: '#d87791',
                gold: '#c9ab55',
                emerald: '#65b984',
                teal: '#67b9c0',
                violet: '#b188c7'
            },
            backgrounds: {
                rose: 'rgba(74, 30, 42, 0.72)',
                gold: 'rgba(76, 64, 30, 0.70)',
                emerald: 'rgba(27, 62, 47, 0.72)',
                teal: 'rgba(25, 59, 66, 0.72)',
                violet: 'rgba(58, 42, 68, 0.72)'
            },
            borders: {
                rose: 'rgba(216, 119, 145, 0.24)',
                gold: 'rgba(201, 171, 85, 0.23)',
                emerald: 'rgba(101, 185, 132, 0.22)',
                teal: 'rgba(103, 185, 192, 0.22)',
                violet: 'rgba(177, 136, 199, 0.23)'
            },
            glows: {
                rose: 'rgba(216, 119, 145, 0.26)',
                gold: 'rgba(201, 171, 85, 0.24)',
                emerald: 'rgba(101, 185, 132, 0.23)',
                teal: 'rgba(103, 185, 192, 0.23)',
                violet: 'rgba(177, 136, 199, 0.25)'
            }
        },
        light: {
            accents: {
                rose: '#c85f7b',
                gold: '#aa852c',
                emerald: '#459b68',
                teal: '#3f929c',
                violet: '#8f67a4'
            },
            backgrounds: {
                rose: 'rgba(255, 133, 162, 0.15)',
                gold: 'rgba(214, 172, 64, 0.17)',
                emerald: 'rgba(92, 174, 122, 0.14)',
                teal: 'rgba(83, 172, 184, 0.14)',
                violet: 'rgba(177, 136, 199, 0.15)'
            },
            borders: {
                rose: 'rgba(200, 95, 123, 0.22)',
                gold: 'rgba(170, 133, 44, 0.22)',
                emerald: 'rgba(69, 155, 104, 0.20)',
                teal: 'rgba(63, 146, 156, 0.20)',
                violet: 'rgba(143, 103, 164, 0.21)'
            },
            glows: {
                rose: 'rgba(200, 95, 123, 0.18)',
                gold: 'rgba(170, 133, 44, 0.16)',
                emerald: 'rgba(69, 155, 104, 0.16)',
                teal: 'rgba(63, 146, 156, 0.16)',
                violet: 'rgba(143, 103, 164, 0.17)'
            }
        }
    };

    let lastMenuTarget = null;
    let lastMenuTime = 0;
    let updateTimer = null;
    let isUpdatingUI = false; // DOM 중복 트리거 방지 플래그

    // 보관함 DOM은 React 재렌더 때만 바뀌므로 매 Mutation마다 전체 탐색하지 않도록 캐시합니다.
    let cachedArchiveDivider = null;
    let cachedArchiveContainer = null;
    let lastArchiveScrollTarget = null;
    let lastArchiveAppliedHeight = 0;
    let archiveFastApplyRaf = 0;

    const archiveSearchState = {
        items: [],
        status: 'idle', // idle | ready | indexing | error
        inFlight: null,
        started: false,
        loadedFolders: 0,
        totalFolders: 0,
        loadedChats: 0,
        totalArchiveChats: null,
        totalRootChats: null,
        totalAllChats: null,
        countUpdatedAt: 0,
        countStatus: 'idle', // idle | loading | ready | error
        savedAt: 0,
        partial: false,
        lastError: '',
        lastFailedAt: 0,
        lastRenderKey: '',
        lastResultKey: ''
    };
    let archiveCountRefreshPending = false;

    const smartOrganizeState = {
        runId: 0,
        open: false,
        busy: false,
        phase: 'idle', // idle | loading | review | preparing | applying | done | error
        previewId: '',
        rows: [],
        status: '',
        singletonStatus: 'idle', // idle | ready | error
        singletonCount: 0,
        singletonError: '',
        result: null
    };

    // React 재렌더 중에도 검색어가 날아가지 않도록 별도 상태로 보관합니다.
    let currentSearchQueryRaw = '';
    // 검색 입력창이 React 재렌더로 "새로 만들어진 것"인지 판별하기 위한 기준.
    let lastSearchInputEl = null;
    let legacySearchCleanupDone = false;
    const chatVisualCache = new WeakMap();

    // 검색 입력 직후 즉시 무거운 DOM/API 결과 렌더를 돌리면 한글 입력 중 포커스/조합이 끊길 수 있다.
    // 입력 중 과도한 렌더링을 막기 위해 짧은 지연 후 검색을 적용합니다.
    const SEARCH_DEBOUNCE_MS = 30;
    let searchDebounceTimer = null;
    let isSearchComposing = false;
    let searchOverlayPositionTimer = null;
    let archiveSearchRenderRaf = 0;

    function getThemeColors() {
        const theme = document.body.getAttribute('data-theme') || 'dark';
        return themeColorSets[theme] || themeColorSets.dark;
    }

    // 스타일 주입 (v1.2.0 전면 리디자인: 먹색 단일 포인트 + 프로필 링)
    addCrackStyle(`
        body {
            --ct-ease: cubic-bezier(.2, .8, .2, 1);
            --ct-spring: cubic-bezier(.34, 1.56, .64, 1);
            --ct-soft: cubic-bezier(.22, 1.2, .36, 1);
        }
        body:not([data-theme="light"]) {
            --ct-bg: #18181b;
            --ct-canvas: #141417;
            --ct-raise: #202024;
            --ct-field: rgba(255, 255, 255, 0.06);
            --ct-tint: rgba(255, 255, 255, 0.03);
            --ct-sunk: rgba(0, 0, 0, 0.3);
            --ct-knob: #303036;
            --ct-hover: rgba(255, 255, 255, 0.05);
            --ct-hover2: rgba(255, 255, 255, 0.085);
            --ct-text: #f1f1f3;
            --ct-muted: #9a9aa3;
            --ct-faint: #62626b;
            --ct-line: rgba(255, 255, 255, 0.07);
            --ct-line2: rgba(255, 255, 255, 0.13);
            --ct-ink: #f1f1f3;
            --ct-ink-fg: #18181b;
            --ct-ring: rgba(255, 255, 255, 0.14);
            --ct-current: rgba(255, 255, 255, 0.075);
            --ct-menu: #212125;
            --ct-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.3);
            --ct-shadow-lg: 0 30px 80px rgba(0, 0, 0, 0.6);
            --ct-lift: 0 10px 24px -12px rgba(0, 0, 0, 0.7);
            --ct-danger: #f08a9b;
            --ct-scrim: rgba(6, 6, 8, 0.55);
        }
        body[data-theme="light"] {
            --ct-bg: #ffffff;
            --ct-canvas: #f6f6f7;
            --ct-raise: #ffffff;
            --ct-field: rgba(0, 0, 0, 0.05);
            --ct-tint: #f6f6f8;
            --ct-sunk: #ececef;
            --ct-knob: #ffffff;
            --ct-hover: rgba(0, 0, 0, 0.04);
            --ct-hover2: rgba(0, 0, 0, 0.065);
            --ct-text: #18181b;
            --ct-muted: #6b6b74;
            --ct-faint: #a3a3ab;
            --ct-line: rgba(0, 0, 0, 0.075);
            --ct-line2: rgba(0, 0, 0, 0.12);
            --ct-ink: #18181b;
            --ct-ink-fg: #ffffff;
            --ct-ring: rgba(0, 0, 0, 0.1);
            --ct-current: rgba(0, 0, 0, 0.055);
            --ct-menu: #ffffff;
            --ct-shadow: 0 16px 40px rgba(20, 16, 40, 0.14), 0 2px 6px rgba(20, 16, 40, 0.06);
            --ct-shadow-lg: 0 30px 70px rgba(20, 16, 40, 0.2);
            --ct-lift: 0 10px 24px -14px rgba(20, 16, 40, 0.35);
            --ct-danger: #c9566b;
            --ct-scrim: rgba(24, 24, 27, 0.3);
        }

        /* 1. 검색창 + 한눈에 보기 버튼 */
        .crack-search-container {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 8px 10px 10px;
            position: relative;
        }
        .crack-search-box {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            box-sizing: border-box;
            padding: 0 6px 0 11px;
            background: var(--ct-field);
            border: 0;
            border-radius: 11px;
            transition: background-color 180ms, box-shadow 180ms var(--ct-ease);
        }
        .crack-search-box:focus-within {
            background: var(--ct-raise);
            box-shadow: 0 0 0 1px var(--ct-line2), 0 0 0 4px var(--ct-ring);
        }
        .crack-search-icon {
            color: var(--ct-faint);
            flex-shrink: 0;
            display: flex;
            align-items: center;
            transition: color 180ms, transform 220ms var(--ct-spring);
        }
        .crack-search-box:focus-within .crack-search-icon {
            color: var(--ct-text);
            transform: scale(1.1);
        }
        .crack-search-input {
            width: 100%;
            min-width: 0;
            background: transparent;
            border: none;
            outline: none;
            font-size: 13px;
            color: var(--ct-text);
        }
        .crack-search-input::placeholder { color: var(--ct-faint); }
        .crack-search-clear {
            width: 24px;
            height: 24px;
            flex: 0 0 24px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 11px;
            line-height: 1;
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transform: scale(.6);
            transition: opacity 140ms, transform 220ms var(--ct-spring), background-color 140ms;
        }
        .crack-search-clear.visible {
            opacity: 1;
            pointer-events: auto;
            transform: none;
        }
        .crack-search-clear:hover {
            background: var(--ct-hover2);
            color: var(--ct-text);
        }
        .crack-lounge-btn {
            display: grid;
            width: 36px;
            height: 36px;
            flex: 0 0 36px;
            place-items: center;
            padding: 0;
            border: 0;
            border-radius: 11px;
            background: var(--ct-field);
            color: var(--ct-text);
            cursor: pointer;
            transition: background-color 150ms, transform 120ms;
        }
        @media (hover: hover) and (pointer: fine) and (min-width: 900px) {
            .crack-lounge-btn { display: grid; }
        }
        .crack-lounge-btn:hover,
        .crack-lounge-btn[aria-expanded="true"] { background: var(--ct-hover2); }
        .crack-lounge-btn:active { transform: scale(.94); }
        .crack-lounge-btn:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: 2px; }
        .crack-lounge-btn rect { transition: transform 300ms var(--ct-spring); }
        .crack-lounge-btn:hover .ct-g1 { transform: translate(-1.3px, -1.3px); }
        .crack-lounge-btn:hover .ct-g2 { transform: translate(1.3px, -1.3px); }
        .crack-lounge-btn:hover .ct-g3 { transform: translate(-1.3px, 1.3px); }
        .crack-lounge-btn:hover .ct-g4 { transform: translate(1.3px, 1.3px); }

        /* 2. 보관함/채팅 목록 개수 */
        .crack-section-count {
            display: inline-flex;
            align-items: center;
            height: 18px;
            padding: 0 2px;
            border: 0;
            background: none;
            color: var(--ct-faint);
            font-size: 12px;
            font-weight: 600;
            font-variant-numeric: tabular-nums;
            line-height: 1;
            white-space: nowrap;
            box-sizing: border-box;
            flex: 0 0 auto;
            transition: color 180ms;
        }
        .crack-section-count[data-kind="archive"] { margin-left: 6px; }
        .crack-section-count[data-kind="root"] { margin-left: auto; margin-right: 8px; }
        .crack-section-count[data-state="ready"] { color: var(--ct-muted); }
        .crack-section-count[data-state="loading"] { animation: ctPulse 1.2s ease-in-out infinite; }
        @keyframes ctPulse { 50% { opacity: .4; } }

        /* 검색 결과는 오버레이에서만 렌더링 (컨테이너 안 구버전 요소는 숨김) */
        .crack-search-container .crack-api-search-status,
        .crack-search-container .crack-api-search-results { display: none !important; }

        /* 3. 검색 결과 오버레이 */
        #crack-search-overlay {
            display: none;
            position: fixed;
            z-index: 9990;
            box-sizing: border-box;
            padding: 2px 10px 88px;
            overflow-y: auto;
            overflow-x: hidden;
            overscroll-behavior: contain;
            background: var(--ct-bg);
            color: var(--ct-text);
        }
        #crack-search-overlay.visible {
            display: block;
            animation: ctOverlayIn 220ms var(--ct-ease) both;
        }
        @keyframes ctOverlayIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: none; }
        }
        #crack-search-overlay .crack-api-search-status {
            display: block;
            visibility: hidden;
            min-height: 15px;
            margin: 6px 4px 4px;
            padding: 0;
            font-size: 11px;
            line-height: 1.35;
            color: var(--ct-faint);
            background: transparent;
            border: 0;
        }
        #crack-search-overlay .crack-api-search-status.visible { visibility: visible; }
        #crack-search-overlay .crack-api-search-results {
            display: none;
            margin: 0;
            padding: 0;
            overflow: visible !important;
            max-height: none !important;
        }
        #crack-search-overlay .crack-api-search-results.visible {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        #crack-search-overlay .crack-api-result-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin: 12px 4px 6px;
            color: var(--ct-muted);
            font-size: 11.5px;
            font-weight: 680;
        }
        #crack-search-overlay .crack-api-result-header:first-child { margin-top: 4px; }
        #crack-search-overlay .crack-api-result-item {
            width: 100%;
            box-sizing: border-box;
            display: flex;
            gap: 10px;
            align-items: center;
            padding: 8px;
            border: 0;
            border-radius: 11px;
            background: transparent;
            color: var(--ct-text);
            text-align: left;
            cursor: pointer;
            transition: background-color 140ms;
        }
        #crack-search-overlay .crack-api-result-item:hover,
        #crack-search-overlay .crack-api-result-item:focus-visible {
            background: var(--ct-hover);
            outline: none;
        }
        #crack-search-overlay .crack-api-result-item:active { transform: scale(.99); }
        .crack-api-result-thumb {
            width: 32px;
            height: 32px;
            flex: 0 0 32px;
            border-radius: 50%;
            overflow: hidden;
            background: var(--ct-hover2);
        }
        .crack-api-result-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .crack-api-result-main {
            min-width: 0;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .crack-api-result-title {
            font-size: 12.5px;
            font-weight: 640;
            line-height: 1.25;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .crack-api-result-meta,
        .crack-api-result-snippet {
            font-size: 11px;
            line-height: 1.25;
            color: var(--ct-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* 4. 채팅방 줄: 색 = 프로필 테두리 고리 + 옅은 배경 */
        .crack-chat-item {
            position: relative !important;
            border-radius: 12px !important;
            transition: background-color 180ms var(--ct-ease) !important;
        }
        .crack-chat-item:not([data-chat-color]):not(.crack-current-chat):hover {
            background-color: var(--ct-hover) !important;
        }
        .crack-chat-item[data-chat-color] {
            background-color: color-mix(in srgb, var(--crack-color-bg) 40%, transparent) !important;
        }
        .crack-chat-item[data-chat-color]:hover {
            background-color: color-mix(in srgb, var(--crack-color-bg) 72%, transparent) !important;
        }
        .crack-chat-item > span.rounded-full:first-child {
            outline: 2px solid transparent;
            outline-offset: 0;
            transition: outline-color 220ms, outline-offset 320ms var(--ct-spring);
        }
        .crack-chat-item[data-chat-color] > span.rounded-full:first-child {
            outline-color: var(--crack-accent);
            outline-offset: 2px;
        }
        .crack-current-chat {
            background-color: var(--ct-current) !important;
        }
        .crack-current-chat[data-chat-color] {
            background-color: color-mix(in srgb, var(--crack-color-bg) 85%, transparent) !important;
        }
        .crack-current-chat .typo-text-sm_leading-none_medium { font-weight: 760; }
        .crack-chat-item:focus-visible {
            outline: 2px solid var(--ct-ink) !important;
            outline-offset: -2px !important;
        }
        .crack-chat-item:active { opacity: .9; }

        .crack-so-thumb { overflow: hidden; }
        .crack-so-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        #crack-search-overlay .crack-api-result-preview {
            display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
            font-size: 12px; line-height: 1.4; color: var(--ct-muted);
        }
        .custom-palette-dot { padding: 0; border: 0; flex-shrink: 0; }
        .custom-palette-dot:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: 3px; }
        .crack-menu-solid[role="menu"][data-state="open"] {
            opacity: 1 !important; visibility: visible !important; animation: none !important;
        }
        /* 5. 채팅방 메뉴 + 색 팔레트 */
        .crack-menu-solid {
            background: var(--ct-menu, #212125) !important;
            border: 1px solid var(--ct-line2) !important;
            border-radius: 14px !important;
            box-shadow: var(--ct-shadow) !important;
            z-index: 999999 !important;
        }
        .custom-palette-container {
            display: flex;
            gap: 9px;
            padding: 8px 8px 4px;
            align-items: center;
            margin: 6px 0 0;
            border: 0;
            border-top: 1px solid var(--ct-line);
            background: transparent;
        }
        .custom-palette-container::before {
            content: '색상';
            margin-right: auto;
            font-size: 11.5px;
            color: var(--ct-faint);
        }
        .custom-palette-dot {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            cursor: pointer;
            border: 0;
            display: grid;
            place-items: center;
            font-size: 0;
            user-select: none;
            flex-shrink: 0;
            outline: 2px solid transparent;
            outline-offset: 0;
            transition: transform 180ms var(--ct-spring), outline-color 160ms, outline-offset 260ms var(--ct-spring);
        }
        .custom-palette-dot:hover { transform: scale(1.18); }
        .custom-palette-dot.active {
            outline-color: var(--ct-ink);
            outline-offset: 2px;
        }
        .custom-palette-dot.active::after {
            content: '';
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #fff;
        }

        /* 6. 긴 제목 흐르기 */
        .marquee-target.can-animate:hover {
            text-overflow: clip !important;
            overflow: visible !important;
            display: inline-block !important;
            animation: moveTextDynamic 6s var(--ct-ease) .4s infinite;
            padding-right: 50px;
        }
        @keyframes moveTextDynamic {
            0%, 10% { transform: translateX(0); }
            45%, 60% { transform: translateX(var(--move-dist)); }
            95%, 100% { transform: translateX(0); }
        }

        /* 7. 보관함 높이 조절 핸들 */
        .crack-resizer-handle {
            cursor: ns-resize !important;
            height: 4px !important;
            position: relative;
            background: transparent !important;
            transition: background-color 160ms;
        }
        .crack-resizer-handle::after {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            width: 30px;
            height: 4px;
            margin: -2px 0 0 -15px;
            border-radius: 4px;
            background: var(--ct-ink);
            opacity: 0;
            transform: scaleX(.3);
            transition: opacity 160ms, transform 260ms var(--ct-spring);
            pointer-events: none;
        }
        .crack-resizer-handle:hover { background: var(--ct-line2) !important; }
        .crack-resizer-handle:hover::after { opacity: .8; transform: none; }

        .crack-archive-resized {
            max-height: var(--crack-archive-h, 284px) !important;
            overflow-y: auto !important;
            overflow-y: overlay !important;
            overflow-x: hidden !important;
            overscroll-behavior: contain !important;
            padding-bottom: 4px !important;
            transition: none !important;
            scrollbar-width: thin !important;
            scrollbar-color: transparent transparent !important;
        }
        .crack-archive-resized:hover {
            scrollbar-color: rgba(150, 150, 150, 0.5) transparent !important;
        }
        .crack-archive-resized::-webkit-scrollbar { width: 4px !important; }
        .crack-archive-resized::-webkit-scrollbar-track { background: transparent !important; }
        .crack-archive-resized::-webkit-scrollbar-thumb {
            background: transparent !important;
            border-radius: 4px !important;
        }
        .crack-archive-resized:hover::-webkit-scrollbar-thumb {
            background: rgba(150, 150, 150, 0.5) !important;
        }

        /* 8. 스마트 자동 정리 메뉴 항목 + 반짝이 아이콘 */
        .crack-smart-organize-menu-item {
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 34px;
            box-sizing: border-box;
            margin: 2px 0;
            padding: 0 10px;
            border-radius: 9px;
            color: inherit;
            font-size: 13px;
            line-height: 1.2;
            cursor: pointer;
            user-select: none;
            outline: none;
            transition: background-color 120ms;
        }
        .crack-smart-organize-menu-item:hover,
        .crack-smart-organize-menu-item:focus-visible { background: var(--ct-hover2); }
        .crack-smart-organize-menu-icon {
            width: 18px;
            flex: 0 0 18px;
            display: grid;
            place-items: center;
            color: var(--ct-text);
        }
        .crack-smart-organize-menu-label { flex: 1; min-width: 0; }
        .crack-smart-organize-menu-badge {
            padding: 2px 7px;
            border-radius: 999px;
            background: var(--ct-ink);
            color: var(--ct-ink-fg);
            font-size: 10px;
            font-weight: 720;
        }
        .crack-spark path { transform-box: fill-box; transform-origin: center; }
        .crack-spark .ct-s1 { transition: transform 480ms var(--ct-spring); }
        .crack-spark .ct-s2,
        .crack-spark .ct-s3 { transform: scale(0); transition: transform 300ms var(--ct-spring); }
        .crack-smart-organize-menu-item:hover .ct-s1,
        .crack-smart-organize-menu-item:focus-visible .ct-s1 { transform: rotate(90deg) scale(.88); }
        .crack-smart-organize-menu-item:hover .ct-s2,
        .crack-smart-organize-menu-item:focus-visible .ct-s2 { transform: scale(1); transition-delay: 70ms; }
        .crack-smart-organize-menu-item:hover .ct-s3,
        .crack-smart-organize-menu-item:focus-visible .ct-s3 { transform: scale(1); transition-delay: 140ms; }
        @keyframes ctSparkSpin {
            0% { transform: rotate(0) scale(1); }
            50% { transform: rotate(90deg) scale(.76); }
            100% { transform: rotate(180deg) scale(1); }
        }
        @keyframes ctTwinkle {
            0%, 100% { transform: scale(.2); opacity: .3; }
            50% { transform: scale(1); opacity: 1; }
        }
        @keyframes ctSparkPop {
            0% { transform: scale(.5) rotate(-60deg); }
            100% { transform: none; }
        }
        @keyframes ctSpin { to { transform: rotate(360deg); } }
    `);

    // 스마트 자동 정리 창 + 한눈에 보기 스타일
    addCrackStyle(`
        /* ── 스마트 자동 정리 창 ── */
        .crack-so {
            position: fixed;
            inset: 0;
            z-index: 2147483000;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 22px;
            background: var(--ct-scrim);
            -webkit-backdrop-filter: blur(4px);
            backdrop-filter: blur(4px);
            color: var(--ct-text);
            font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif;
            opacity: 0;
            transition: opacity 180ms;
        }
        .crack-so.is-open { opacity: 1; transition: opacity 220ms; }
        .crack-so.is-closing { pointer-events: none; }
        .crack-so * { box-sizing: border-box; }
        .crack-so-dlg {
            width: min(640px, 100%);
            max-height: min(820px, calc(100vh - 44px));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid var(--ct-line2);
            border-radius: 22px;
            background: var(--ct-raise);
            box-shadow: var(--ct-shadow-lg);
            outline: none;
            opacity: 0;
            transform: translateY(14px) scale(.965);
            transition: transform 200ms var(--ct-ease), opacity 150ms;
        }
        .crack-so.is-open .crack-so-dlg {
            opacity: 1;
            transform: none;
            transition: transform 420ms var(--ct-soft), opacity 200ms;
        }
        .crack-smart-head {
            display: flex;
            align-items: center;
            gap: 13px;
            padding: 18px 16px 14px 20px;
        }
        .crack-so-mark {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            border-radius: 13px;
            display: grid;
            place-items: center;
            background: var(--ct-sunk);
            color: var(--ct-text);
        }
        .crack-so-mark .ct-s2,
        .crack-so-mark .ct-s3,
        .crack-so-orb .ct-s2,
        .crack-so-orb .ct-s3 { transform: scale(1); }
        .crack-so[data-phase="loading"] .crack-so-mark .ct-s1,
        .crack-so[data-phase="preparing"] .crack-so-mark .ct-s1,
        .crack-so[data-phase="applying"] .crack-so-mark .ct-s1,
        .crack-so-orb .ct-s1 { animation: ctSparkSpin 1.8s var(--ct-ease) infinite; }
        .crack-so[data-phase="loading"] .crack-so-mark .ct-s2,
        .crack-so[data-phase="preparing"] .crack-so-mark .ct-s2,
        .crack-so[data-phase="applying"] .crack-so-mark .ct-s2,
        .crack-so-orb .ct-s2 { animation: ctTwinkle 1.8s ease-in-out infinite; }
        .crack-so[data-phase="loading"] .crack-so-mark .ct-s3,
        .crack-so[data-phase="preparing"] .crack-so-mark .ct-s3,
        .crack-so[data-phase="applying"] .crack-so-mark .ct-s3,
        .crack-so-orb .ct-s3 { animation: ctTwinkle 1.8s ease-in-out .6s infinite; }
        .crack-so[data-phase="done"] .crack-so-mark .ct-s1 { animation: ctSparkPop 700ms var(--ct-spring); }
        .crack-smart-title-wrap { min-width: 0; flex: 1; }
        .crack-smart-title {
            margin: 0;
            color: var(--ct-text);
            font-size: 16.5px;
            font-weight: 760;
            letter-spacing: -.02em;
            line-height: 1.3;
        }
        .crack-smart-subtitle {
            margin-top: 3px;
            color: var(--ct-muted);
            font-size: 12px;
            line-height: 1.5;
        }
        .crack-smart-close {
            width: 32px;
            height: 32px;
            padding: 0;
            border: 0;
            border-radius: 9px;
            background: transparent;
            color: var(--ct-muted);
            display: grid;
            place-items: center;
            cursor: pointer;
            transition: background-color 140ms, opacity 140ms;
        }
        .crack-smart-close:hover:not(:disabled) { background: var(--ct-hover2); color: var(--ct-text); }
        .crack-smart-close:disabled { opacity: .3; cursor: default; }
        .crack-so-steps {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            margin: 0;
            padding: 2px 20px 16px;
            list-style: none;
            border-bottom: 1px solid var(--ct-line);
        }
        .crack-so-steps li {
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 7px;
            font-size: 11px;
            color: var(--ct-faint);
            transition: color 240ms;
        }
        .crack-so-steps li::before {
            content: '';
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--ct-line2);
            position: relative;
            z-index: 1;
            transition: background-color 260ms, transform 360ms var(--ct-spring), box-shadow 260ms;
        }
        .crack-so-ln {
            position: absolute;
            top: 3.5px;
            left: calc(50% + 10px);
            width: calc(100% - 20px);
            height: 2px;
            border-radius: 2px;
            background: var(--ct-line);
            overflow: hidden;
        }
        .crack-so-steps li:last-child .crack-so-ln { display: none; }
        .crack-so-ln::after {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--ct-ink);
            transform: scaleX(0);
            transform-origin: left;
            transition: transform 480ms var(--ct-ease);
        }
        .crack-so-steps li.is-done .crack-so-ln::after { transform: none; }
        .crack-so-steps li.is-done { color: var(--ct-muted); }
        .crack-so-steps li.is-done::before { background: var(--ct-ink); }
        .crack-so-steps li.is-now { color: var(--ct-text); font-weight: 680; }
        .crack-so-steps li.is-now::before {
            background: var(--ct-ink);
            box-shadow: 0 0 0 4px var(--ct-ring);
            transform: scale(1.2);
        }
        .crack-so-steps li.is-err { color: var(--ct-danger); font-weight: 680; }
        .crack-so-steps li.is-err::before {
            background: var(--ct-danger);
            box-shadow: 0 0 0 4px color-mix(in srgb, var(--ct-danger) 22%, transparent);
        }
        .crack-smart-body {
            position: relative;
            flex: 1;
            min-height: 200px;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 14px 20px 16px;
            container-type: inline-size;
        }
        .crack-smart-foot {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 14px 16px 16px 20px;
            border-top: 1px solid var(--ct-line);
        }
        .crack-smart-summary {
            margin-right: auto;
            color: var(--ct-muted);
            font-size: 12.5px;
            font-variant-numeric: tabular-nums;
        }
        .crack-smart-summary.is-bump { animation: ctBump 320ms var(--ct-spring); }
        @keyframes ctBump { from { transform: translateY(3px); opacity: .4; } }
        .crack-smart-button {
            min-height: 36px;
            padding: 0 15px;
            border: 1px solid var(--ct-line2);
            border-radius: 10px;
            background: transparent;
            color: var(--ct-text);
            font-size: 12.5px;
            font-weight: 660;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            white-space: nowrap;
            cursor: pointer;
            transition: background-color 150ms, transform 120ms, opacity 150ms;
        }
        .crack-smart-button:hover:not(:disabled) { background: var(--ct-hover); }
        .crack-smart-button:active:not(:disabled) { transform: scale(.97); }
        .crack-smart-button:focus-visible,
        .crack-smart-close:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: 2px; }
        .crack-smart-button.primary {
            border-color: transparent;
            background: var(--ct-ink);
            color: var(--ct-ink-fg);
        }
        .crack-smart-button.primary:hover:not(:disabled) {
            background: color-mix(in srgb, var(--ct-ink) 86%, var(--ct-raise));
        }
        .crack-smart-button.small { min-height: 30px; padding: 0 11px; font-size: 11.5px; border-radius: 8px; }
        .crack-smart-button:disabled { cursor: default; opacity: .42; }
        .crack-so-spin {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            border: 1.5px solid color-mix(in srgb, var(--ct-ink-fg) 35%, transparent);
            border-top-color: var(--ct-ink-fg);
            animation: ctSpin .8s linear infinite;
        }
        .crack-so-pane { animation: ctPaneIn 300ms var(--ct-ease) both; }
        @keyframes ctPaneIn { from { opacity: 0; transform: translateY(8px); } }
        .crack-so-center {
            min-height: 250px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 10px 0;
            color: var(--ct-muted);
            text-align: center;
        }
        .crack-so-center h4 {
            margin: 6px 0 0;
            color: var(--ct-text);
            font-size: 16px;
            font-weight: 740;
            letter-spacing: -.015em;
        }
        .crack-so-center p { margin: 0; font-size: 13px; line-height: 1.7; }
        .crack-so-faint { color: var(--ct-faint); font-size: 12px; }
        .crack-smart-progress-text { font-size: 13px; color: var(--ct-muted); }
        .crack-smart-progress-text { animation: none; }
        @keyframes ctStatusIn { from { opacity: 0; transform: translateY(4px); } }
        .crack-so-orb {
            position: relative;
            width: 70px;
            height: 70px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            color: var(--ct-text);
            background: var(--ct-sunk);
        }
        .crack-so-orb::before {
            content: '';
            position: absolute;
            inset: -5px;
            border-radius: 50%;
            border: 2px solid transparent;
            border-top-color: var(--ct-ink);
            border-right-color: var(--ct-line2);
            animation: ctSpin 1.1s linear infinite;
        }
        .crack-so-bar {
            height: 4px;
            width: 100%;
            border-radius: 4px;
            background: var(--ct-line);
            overflow: hidden;
        }
        .crack-so-center .crack-so-bar { width: min(240px, 80%); }
        .crack-so-bar > i {
            display: block;
            height: 100%;
            width: 0;
            border-radius: inherit;
            background: var(--ct-ink);
            transition: width 420ms var(--ct-ease);
        }
        .crack-so-bar.is-ind > i { width: 34%; animation: ctInd 1.3s var(--ct-ease) infinite; }
        @keyframes ctInd { 0% { transform: translateX(-110%); } 100% { transform: translateX(310%); } }
        .crack-so-tools {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            margin: 0 0 12px;
        }
        .crack-so-grow { flex: 1; }
        .crack-smart-chip {
            padding: 4px 9px;
            border-radius: 999px;
            background: var(--ct-sunk);
            color: var(--ct-muted);
            font-size: 11px;
            font-weight: 660;
        }
        .crack-smart-chip.conflict {
            background: transparent;
            color: var(--ct-text);
            box-shadow: inset 0 0 0 1px var(--ct-line2);
        }
        .crack-so-rows { display: flex; flex-direction: column; gap: 6px; }
        .crack-so-row {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            column-gap: 12px;
            padding: 10px 10px 10px 12px;
            border: 1px solid var(--ct-line);
            border-radius: 14px;
            background: var(--ct-tint);
            animation: ctRowIn 340ms var(--ct-ease) both;
            animation-delay: calc(60ms + var(--d, 0) * 32ms);
        }
        @keyframes ctRowIn { from { opacity: 0; transform: translateY(6px); } }
        .crack-so-thumb {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            background: var(--ct-sunk);
            color: var(--ct-muted);
            font-size: 13px;
            font-weight: 700;
            transition: opacity 200ms;
        }
        .crack-so-row-main { min-width: 0; transition: opacity 200ms; }
        .crack-so-row[data-action="skip"] .crack-so-row-main,
        .crack-so-row[data-action="skip"] > .crack-so-thumb { opacity: .4; }
        .crack-so-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
        .crack-so-name strong {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--ct-text);
            font-size: 13px;
            font-weight: 660;
        }
        .crack-so-tag {
            flex: 0 0 auto;
            padding: 2px 6px;
            border-radius: 5px;
            background: var(--ct-hover2);
            color: var(--ct-muted);
            font-size: 10px;
            font-weight: 720;
        }
        .crack-so-meta { margin-top: 4px; color: var(--ct-muted); font-size: 11.5px; }
        .crack-so-seg {
            position: relative;
            display: grid;
            grid-template-columns: repeat(var(--n, 2), 1fr);
            padding: 3px;
            border-radius: 10px;
            background: var(--ct-sunk);
            isolation: isolate;
        }
        .crack-so-seg-ind {
            position: absolute;
            z-index: -1;
            top: 3px;
            bottom: 3px;
            left: 3px;
            width: calc((100% - 6px) / var(--n, 2));
            border-radius: 7px;
            background: var(--ct-knob);
            box-shadow: 0 1px 3px rgba(0, 0, 0, .14), 0 0 0 1px var(--ct-line);
            transform: translateX(calc(100% * var(--i, 0)));
            transition: transform 300ms var(--ct-ease);
        }
        .crack-so-seg button {
            padding: 6px 11px;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 12px;
            font-weight: 640;
            white-space: nowrap;
            cursor: pointer;
            transition: color 180ms;
        }
        .crack-so-seg button[aria-pressed="true"] { color: var(--ct-text); }
        .crack-so-seg button:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: -2px; }
        .crack-so-target {
            grid-column: 1 / -1;
            display: grid;
            grid-template-rows: 0fr;
            transition: grid-template-rows 300ms var(--ct-ease);
        }
        .crack-so-target > div { overflow: hidden; min-height: 0; }
        .crack-so-row.is-target .crack-so-target { grid-template-rows: 1fr; }
        .crack-so-tg {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px 10px;
            padding: 10px 0 2px 46px;
            color: var(--ct-muted);
            font-size: 11.5px;
        }
        .crack-so-tg em { font-style: normal; color: var(--ct-text); font-weight: 620; }
        .crack-smart-select {
            height: 32px;
            max-width: 100%;
            min-width: 0;
            padding: 0 10px;
            border: 1px solid var(--ct-line2);
            border-radius: 8px;
            outline: none;
            background: var(--ct-sunk);
            color: var(--ct-text);
            font-size: 12px;
        }
        .crack-smart-select:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: 1px; }
        .crack-so-note { margin: 14px 2px 0; color: var(--ct-faint); font-size: 11.5px; line-height: 1.6; }
        @container (max-width: 470px) {
            .crack-so-row { grid-template-columns: auto minmax(0, 1fr); }
            .crack-so-row .crack-so-seg { grid-column: 1 / -1; margin-top: 10px; }
            .crack-so-tg { padding-left: 0; }
        }
        .crack-so-prog-top {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 12px;
            margin: 4px 0 9px;
        }
        .crack-so-prog-top .crack-smart-progress-text {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--ct-text);
        }
        .crack-so-count { font-size: 12px; font-variant-numeric: tabular-nums; }
        .crack-so-apply {
            list-style: none;
            margin: 14px 0 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .crack-so-apply li {
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 9px 10px;
            border-radius: 10px;
            color: var(--ct-faint);
            font-size: 12.5px;
            transition: background-color 220ms, color 220ms;
        }
        .crack-so-apply li.is-now { background: var(--ct-hover); color: var(--ct-text); }
        .crack-so-apply li.is-done { color: var(--ct-text); }
        .crack-so-st {
            position: relative;
            width: 16px;
            height: 16px;
            flex: 0 0 16px;
            border-radius: 50%;
            border: 1.5px solid var(--ct-line2);
            transition: border-color 200ms, background-color 200ms;
        }
        .crack-so-apply li.is-now .crack-so-st { border-top-color: var(--ct-ink); animation: ctSpin .8s linear infinite; }
        .crack-so-apply li.is-done .crack-so-st { border-color: var(--ct-ink); background: var(--ct-ink); }
        .crack-so-apply li.is-done .crack-so-st::after {
            content: '';
            position: absolute;
            left: 4.2px;
            top: 1.6px;
            width: 3.6px;
            height: 7px;
            border: solid var(--ct-ink-fg);
            border-width: 0 1.6px 1.6px 0;
            transform: rotate(45deg) scale(0);
            animation: ctCheckPop 300ms var(--ct-spring) forwards;
        }
        @keyframes ctCheckPop { to { transform: rotate(45deg) scale(1); } }
        .crack-so-ap-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .crack-so-ap-act { color: var(--ct-faint); font-size: 11px; }
        .crack-so-check {
            width: 60px;
            height: 60px;
            fill: none;
            stroke: var(--ct-ink);
            stroke-width: 2.5;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
        .crack-so-check circle { stroke-dasharray: 145; stroke-dashoffset: 145; animation: ctDraw 560ms var(--ct-ease) forwards; }
        .crack-so-check path { stroke-dasharray: 32; stroke-dashoffset: 32; animation: ctDraw 380ms var(--ct-ease) 460ms forwards; }
        @keyframes ctDraw { to { stroke-dashoffset: 0; } }
        .crack-so-err {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            color: var(--ct-danger);
            background: color-mix(in srgb, var(--ct-danger) 14%, transparent);
            animation: ctShake 460ms var(--ct-ease) 120ms;
        }
        @keyframes ctShake {
            0%, 100% { transform: none; }
            20% { transform: translateX(-5px); }
            40% { transform: translateX(5px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(2px); }
        }
        .crack-smart-error { color: var(--ct-danger); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
        .crack-smart-result-list { width: min(520px, 100%); margin: 4px 0 0; padding-left: 18px; text-align: left; }
        @media (max-width: 700px) {
            .crack-so { align-items: flex-end; padding: 0; }
            .crack-so-dlg { width: 100%; max-height: 92vh; border-radius: 20px 20px 0 0; transform: translateY(40px); }
            .crack-smart-foot { padding-bottom: max(16px, env(safe-area-inset-bottom, 0px)); }
        }

        /* ── 한눈에 보기 (PC·모바일) ── */
        #crack-lounge {
            position: fixed;
            right: 0;
            bottom: 0;
            z-index: 9995;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            box-sizing: border-box;
            background: var(--ct-canvas);
            color: var(--ct-text);
            border-left: 1px solid var(--ct-line);
            container-type: inline-size;
            clip-path: inset(0 calc(100% - var(--crack-lg-from, 260px)) 0 0);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: clip-path 380ms var(--ct-ease), opacity 220ms 120ms, visibility 0s 400ms;
        }
        #crack-lounge.is-open {
            clip-path: inset(0 0 0 0);
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transition: clip-path 520ms var(--ct-ease), opacity 140ms, visibility 0s;
        }
        #crack-lounge * { box-sizing: border-box; }
        .crack-lg-top {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px 12px;
            padding: 12px 16px;
            border-bottom: 1px solid var(--ct-line);
            background: var(--ct-bg);
        }
        .crack-lg-close {
            width: 36px;
            height: 36px;
            flex: 0 0 36px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 0;
            border-radius: 11px;
            background: var(--ct-field);
            color: var(--ct-text);
            cursor: pointer;
            transition: background-color 150ms, transform 120ms;
        }
        .crack-lg-close:hover { background: var(--ct-hover2); }
        .crack-lg-close:active { transform: scale(.94); }
        .crack-lg-heading { display: flex; align-items: baseline; gap: 8px; margin-right: 4px; }
        .crack-lg-heading strong { font-size: 17px; font-weight: 780; letter-spacing: -.025em; }
        .crack-lg-sub { font-style: normal; font-size: 12px; color: var(--ct-faint); font-variant-numeric: tabular-nums; }
        .crack-lg-search {
            flex: 1 1 180px;
            max-width: 320px;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            padding: 0 6px 0 11px;
            border-radius: 11px;
            background: var(--ct-field);
            transition: background-color 180ms, box-shadow 180ms var(--ct-ease);
        }
        .crack-lg-search:focus-within { background: var(--ct-raise); box-shadow: 0 0 0 1px var(--ct-line2), 0 0 0 4px var(--ct-ring); }
        .crack-lg-search > svg { color: var(--ct-faint); flex: 0 0 auto; }
        .crack-lg-search input {
            flex: 1;
            min-width: 0;
            border: 0;
            outline: 0;
            background: transparent;
            color: var(--ct-text);
            font-size: 13px;
        }
        .crack-lg-search input::placeholder { color: var(--ct-faint); }
        .crack-lg-clear {
            width: 24px;
            height: 24px;
            flex: 0 0 24px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--ct-muted);
            cursor: pointer;
            opacity: 0;
            pointer-events: none;
            transform: scale(.6);
            transition: opacity 140ms, transform 220ms var(--ct-spring), background-color 140ms;
        }
        .crack-lg-clear.is-on { opacity: 1; pointer-events: auto; transform: none; }
        .crack-lg-clear:hover { background: var(--ct-hover2); color: var(--ct-text); }
        .crack-lg-colors {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 3px 10px 3px 3px;
            border-radius: 999px;
            background: var(--ct-sunk);
        }
        .crack-lg-cf {
            width: 16px;
            height: 16px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: var(--d);
            cursor: pointer;
            outline: 2px solid transparent;
            outline-offset: 0;
            transition: outline-color 160ms, outline-offset 260ms var(--ct-spring), transform 200ms var(--ct-spring);
        }
        .crack-lg-cf:hover { transform: scale(1.15); }
        .crack-lg-cf.is-on { outline-color: var(--d); outline-offset: 2px; }
        .crack-lg-cf.is-all {
            width: auto;
            height: 26px;
            padding: 0 11px;
            border-radius: 999px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 11.5px;
            font-weight: 680;
            outline: 0;
            transform: none;
        }
        .crack-lg-cf.is-all.is-on { background: var(--ct-knob); color: var(--ct-text); box-shadow: 0 0 0 1px var(--ct-line); }
        .crack-lg-seg {
            position: relative;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            padding: 3px;
            border-radius: 10px;
            background: var(--ct-sunk);
            isolation: isolate;
        }
        .crack-lg-seg > i {
            position: absolute;
            z-index: -1;
            top: 3px;
            bottom: 3px;
            left: 3px;
            width: calc((100% - 6px) / 2);
            border-radius: 7px;
            background: var(--ct-knob);
            box-shadow: 0 1px 3px rgba(0, 0, 0, .14), 0 0 0 1px var(--ct-line);
            transform: translateX(calc(100% * var(--i, 0)));
            transition: transform 300ms var(--ct-ease);
        }
        .crack-lg-seg button {
            padding: 6px 11px;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 12px;
            font-weight: 640;
            white-space: nowrap;
            cursor: pointer;
            transition: color 180ms;
        }
        .crack-lg-seg button[aria-pressed="true"] { color: var(--ct-text); }
        .crack-lg-body { display: grid; grid-template-columns: 196px minmax(0, 1fr); min-height: 0; }
        .crack-lg-rail {
            padding: 12px 8px;
            overflow-y: auto;
            border-right: 1px solid var(--ct-line);
            background: var(--ct-bg);
            scrollbar-width: thin;
        }
        .crack-lg-rail-btn {
            display: flex;
            align-items: center;
            gap: 9px;
            width: 100%;
            height: 34px;
            padding: 0 10px;
            border: 0;
            border-radius: 9px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 12.5px;
            font-weight: 620;
            text-align: left;
            cursor: pointer;
            transition: background-color 160ms, color 160ms;
        }
        .crack-lg-rail-btn:hover { background: var(--ct-hover); color: var(--ct-text); }
        .crack-lg-rail-btn.is-on { background: var(--ct-current); color: var(--ct-text); }
        .crack-lg-rail-ic { display: grid; place-items: center; color: var(--ct-faint); transition: color 160ms; }
        .crack-lg-rail-btn.is-on .crack-lg-rail-ic { color: var(--ct-text); }
        .crack-lg-rail-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-style: normal; }
        .crack-lg-rail-count { color: var(--ct-faint); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .crack-lg-rail-h { margin: 16px 10px 6px; color: var(--ct-faint); font-size: 11px; font-weight: 600; }
        .crack-lg-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 18px 56px; }
        .crack-lg-status {
            display: none;
            align-items: center;
            gap: 8px;
            margin: 0 2px 14px;
            color: var(--ct-faint);
            font-size: 11.5px;
        }
        .crack-lg-status.is-on { display: flex; }
        .crack-lg-status.is-busy::before {
            content: '';
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 1.5px solid var(--ct-line2);
            border-top-color: var(--ct-ink);
            animation: ctSpin .8s linear infinite;
        }
        .crack-lg-group { content-visibility: auto; contain-intrinsic-size: auto 420px; }
        .crack-lg-gh {
            display: flex;
            align-items: baseline;
            gap: 8px;
            margin: 22px 2px 10px;
            font-size: 13px;
            letter-spacing: -.01em;
        }
        .crack-lg-group:first-child .crack-lg-gh { margin-top: 0; }
        .crack-lg-gh strong { font-weight: 740; }
        .crack-lg-gh em { font-style: normal; color: var(--ct-faint); font-weight: 600; font-size: 11.5px; font-variant-numeric: tabular-nums; }
        .crack-lg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
        .crack-lg-tile {
            position: relative;
            display: flex;
            gap: 11px;
            align-items: center;
            min-width: 0;
            padding: 10px 10px 10px 11px;
            border: 1px solid var(--ct-line);
            border-radius: 13px;
            background: var(--ct-raise);
            cursor: pointer;
            outline: none;
            transition: background-color 180ms, border-color 180ms, transform 240ms var(--ct-ease), box-shadow 240ms var(--ct-ease);
        }
        .crack-lg-tile:hover,
        .crack-lg-tile.is-menu { border-color: var(--ct-line2); transform: translateY(-2px); box-shadow: var(--ct-lift); }
        .crack-lg-tile:active { transform: translateY(0) scale(.99); }
        .crack-lg-tile:focus-visible { box-shadow: 0 0 0 2px var(--ct-ink); }
        .crack-lg-tile[data-color] { background: color-mix(in srgb, var(--cbg) 42%, var(--ct-raise)); }
        .crack-lg-tile.is-current { border-color: var(--ct-ink); box-shadow: 0 0 0 1px var(--ct-ink); }
        .crack-lg-thumb {
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            border-radius: 50%;
            display: grid;
            place-items: center;
            overflow: hidden;
            background: var(--ct-sunk);
            color: var(--ct-muted);
            font-size: 13px;
            font-weight: 700;
            outline: 2px solid transparent;
            outline-offset: 0;
            transition: outline-color 220ms, outline-offset 320ms var(--ct-spring);
        }
        .crack-lg-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .crack-lg-tile[data-color] .crack-lg-thumb { outline-color: var(--c); outline-offset: 2px; }
        .crack-lg-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
        .crack-lg-title {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            font-size: 13px;
            font-weight: 620;
            letter-spacing: -.01em;
        }
        .crack-lg-tile.is-current .crack-lg-title { font-weight: 760; }
        .crack-lg-pv {
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            color: var(--ct-muted);
            font-size: 11.5px;
        }
        .crack-lg-date {
            align-self: flex-start;
            margin-top: 1px;
            color: var(--ct-faint);
            font-size: 10.5px;
            white-space: nowrap;
            transition: opacity 140ms;
        }
        .crack-lg-tile:hover .crack-lg-date,
        .crack-lg-tile.is-menu .crack-lg-date,
        .crack-lg-tile:focus-within .crack-lg-date { opacity: 0; }
        .crack-lg-more {
            position: absolute;
            top: 7px;
            right: 6px;
            width: 24px;
            height: 24px;
            display: grid;
            place-items: center;
            padding: 0;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--ct-muted);
            cursor: pointer;
            opacity: 0;
            transition: opacity 140ms, background-color 140ms, color 140ms;
        }
        .crack-lg-tile:hover .crack-lg-more,
        .crack-lg-tile:focus-within .crack-lg-more,
        .crack-lg-more[aria-expanded="true"] { opacity: 1; }
        .crack-lg-more:hover,
        .crack-lg-more[aria-expanded="true"] { background: var(--ct-hover2); color: var(--ct-text); }
        #crack-lounge.is-dense .crack-lg-grid { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 10px; }
        #crack-lounge.is-dense .crack-lg-tile {
            padding: 5px 8px;
            border-color: transparent;
            border-radius: 9px;
            background: transparent;
            transform: none;
            box-shadow: none;
        }
        #crack-lounge.is-dense .crack-lg-tile:hover,
        #crack-lounge.is-dense .crack-lg-tile.is-menu { background: var(--ct-hover); transform: none; box-shadow: none; }
        #crack-lounge.is-dense .crack-lg-tile[data-color] { background: color-mix(in srgb, var(--cbg) 38%, transparent); }
        #crack-lounge.is-dense .crack-lg-tile.is-current { background: var(--ct-current); box-shadow: inset 0 0 0 1px var(--ct-line2); }
        #crack-lounge.is-dense .crack-lg-thumb { width: 26px; height: 26px; flex-basis: 26px; font-size: 11px; }
        #crack-lounge.is-dense .crack-lg-tile[data-color] .crack-lg-thumb { outline-offset: 1.5px; }
        #crack-lounge.is-dense .crack-lg-pv { display: none; }
        #crack-lounge.is-dense .crack-lg-date { align-self: center; margin: 0; }
        #crack-lounge.is-dense .crack-lg-more { top: 50%; margin-top: -12px; }
        .crack-lg-groups.is-enter .crack-lg-tile {
            animation: ctTileIn 380ms var(--ct-ease) both;
            animation-delay: calc(160ms + var(--i, 0) * 12ms);
        }
        .crack-lg-groups.is-enter .crack-lg-gh { animation: ctFadeIn 300ms var(--ct-ease) 120ms both; }
        .crack-lg-groups.is-swap { animation: ctSwapIn 220ms var(--ct-ease); }
        @keyframes ctTileIn { from { opacity: 0; transform: translateY(10px) scale(.97); } }
        @keyframes ctFadeIn { from { opacity: 0; } }
        @keyframes ctSwapIn { from { opacity: 0; transform: translateY(4px); } }
        .crack-lg-more-btn {
            display: block;
            margin: 10px auto 0;
            padding: 7px 14px;
            border: 1px solid var(--ct-line2);
            border-radius: 999px;
            background: transparent;
            color: var(--ct-muted);
            font-size: 12px;
            font-weight: 640;
            cursor: pointer;
            transition: background-color 150ms, color 150ms;
        }
        .crack-lg-more-btn:hover { background: var(--ct-hover); color: var(--ct-text); }
        .crack-lg-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 60px 20px;
            color: var(--ct-muted);
            font-size: 13px;
            line-height: 1.7;
            text-align: center;
        }
        .crack-lg-pop {
            position: absolute;
            z-index: 5;
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 8px 10px;
            border: 1px solid var(--ct-line2);
            border-radius: 12px;
            background: var(--ct-menu);
            box-shadow: var(--ct-shadow);
            transform-origin: top right;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: scale(.94) translateY(-4px);
            transition: opacity 130ms var(--ct-ease), transform 150ms var(--ct-ease), visibility 0s 150ms;
        }
        .crack-lg-pop[data-side="top"] { transform-origin: bottom right; transform: scale(.94) translateY(4px); }
        .crack-lg-pop.is-open {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: none;
            transition: opacity 170ms var(--ct-ease), transform 260ms var(--ct-soft), visibility 0s;
        }
        .crack-lg-pop-label { margin-right: 4px; color: var(--ct-faint); font-size: 11.5px; }
        .crack-lg-pop-dot {
            width: 18px;
            height: 18px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: var(--d);
            display: grid;
            place-items: center;
            cursor: pointer;
            outline: 2px solid transparent;
            outline-offset: 0;
            transition: transform 180ms var(--ct-spring), outline-color 160ms, outline-offset 260ms var(--ct-spring);
        }
        .crack-lg-pop-dot:hover { transform: scale(1.18); }
        .crack-lg-pop-dot.is-on { outline-color: var(--d); outline-offset: 2px; }
        .crack-lg-pop-dot.is-on::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #fff; }
        #crack-lounge button:focus-visible { outline: 2px solid var(--ct-ink); outline-offset: 2px; }
        @container (max-width: 700px) {
            .crack-lg-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
            .crack-lg-rail { display: flex; gap: 4px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--ct-line); padding: 8px 10px; }
            .crack-lg-rail-btn { width: auto; flex: 0 0 auto; }
            .crack-lg-rail-h { display: none; }
        }

        /* Mobile lounge: full visual viewport, independent scroll areas. */
        #crack-lounge.is-mobile {
            border: 0; overflow: hidden;
            grid-template-rows: minmax(0, auto) minmax(0, 1fr);
            padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
            clip-path: none; transform: translateY(16px);
            transition: transform 240ms var(--ct-ease), opacity 180ms, visibility 0s 240ms;
        }
        #crack-lounge.is-mobile.is-open { transform: none; transition-delay: 0s; }
        #crack-lounge.is-mobile .crack-lg-top {
            display: grid; grid-template-columns: 44px minmax(0, 1fr) auto;
            gap: 6px; padding: 8px; max-height: 45vh; max-height: 45dvh;
            overflow: auto; overscroll-behavior: contain;
        }
        #crack-lounge.is-mobile .crack-lg-heading { min-width: 0; flex-wrap: wrap; gap: 2px 6px; }
        #crack-lounge.is-mobile .crack-lg-heading strong { font-size: 15px; }
        #crack-lounge.is-mobile .crack-lg-seg { grid-column: 3; grid-row: 1; }
        #crack-lounge.is-mobile .crack-lg-search { grid-column: 1 / -1; max-width: none; height: 44px; }
        #crack-lounge.is-mobile .crack-lg-search input { font-size: 16px; }
        #crack-lounge.is-mobile .crack-lg-colors { grid-column: 1 / -1; min-width: 0; overflow-x: auto; gap: 0; padding: 0; border-radius: 12px; }
        #crack-lounge.is-mobile .crack-lg-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
        #crack-lounge.is-mobile .crack-lg-rail { display: flex; gap: 4px; overflow-x: auto; overflow-y: hidden; border-right: 0; border-bottom: 1px solid var(--ct-line); padding: 4px 8px; overscroll-behavior-x: contain; }
        #crack-lounge.is-mobile .crack-lg-rail-btn { width: auto; flex: 0 0 auto; max-width: 240px; }
        #crack-lounge.is-mobile .crack-lg-rail-h { display: none; }
        #crack-lounge.is-mobile .crack-lg-scroll { padding: 10px 10px 24px; min-width: 0; -webkit-overflow-scrolling: touch; }
        #crack-lounge.is-mobile .crack-lg-grid { grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); }
        #crack-lounge.is-mobile .crack-lg-tile { padding-right: 48px; min-height: 68px; transform: none; }
        #crack-lounge.is-mobile.is-dense .crack-lg-tile { min-height: 52px; }
        #crack-lounge.is-mobile .crack-lg-title { font-size: 14px; }
        #crack-lounge.is-mobile .crack-lg-date { display: none; }
        #crack-lounge.is-mobile .crack-lg-more { opacity: 1; top: 50%; margin-top: -22px; right: 2px; }
        #crack-lounge.is-mobile .crack-lg-close,
        #crack-lounge.is-mobile .crack-lg-clear,
        #crack-lounge.is-mobile .crack-lg-more { width: 44px; height: 44px; flex-basis: 44px; }
        #crack-lounge.is-mobile .crack-lg-seg button,
        #crack-lounge.is-mobile .crack-lg-rail-btn,
        #crack-lounge.is-mobile .crack-lg-more-btn { min-height: 44px; }
        #crack-lounge.is-mobile .crack-lg-cf,
        #crack-lounge.is-mobile .crack-lg-pop-dot { width: 44px; height: 44px; flex: 0 0 44px; background: radial-gradient(circle, var(--d) 0 9px, transparent 10px); outline-offset: -8px; transform: none; }
        #crack-lounge.is-mobile .crack-lg-cf.is-all { background: transparent; outline: 0; padding: 0; }
        #crack-lounge.is-mobile .crack-lg-cf.is-all.is-on { background: var(--ct-knob); }
        #crack-lounge.is-mobile .crack-lg-pop { max-width: calc(100% - 16px); flex-wrap: wrap; gap: 0; padding: 8px; }
        #crack-lounge.is-mobile .crack-lg-pop-label { flex: 0 0 100%; padding: 0 8px 4px; }
        #crack-lounge.is-mobile button { touch-action: manipulation; }
        @media (max-width: 900px), (pointer: coarse) {
            .crack-lounge-btn { width: 44px; height: 44px; flex-basis: 44px; }
            .crack-lg-more { opacity: 1; }
        }

        /* ── 터치 기기 / 동작 줄이기 ── */
        @media (hover: none), (pointer: coarse) {
            .crack-search-input { font-size: 16px; }
            #crack-search-overlay .crack-api-result-item { min-height: 48px; }
            .crack-smart-button { min-height: 42px; }
            .crack-smart-close { width: 40px; height: 40px; }
            .marquee-target.can-animate:hover { animation: none; }
        }
        @media (prefers-reduced-motion: reduce) {
            .crack-search-box, .crack-search-icon, .crack-search-clear,
            .crack-lounge-btn, .crack-lounge-btn rect,
            .crack-chat-item, .crack-chat-item > span.rounded-full:first-child,
            .custom-palette-dot, #crack-search-overlay .crack-api-result-item,
            .crack-smart-organize-menu-item, .crack-spark path,
            .crack-so, .crack-so *, .crack-so *::before, .crack-so *::after,
            #crack-lounge, #crack-lounge *, #crack-lounge *::before, #crack-lounge *::after {
                transition-duration: 1ms !important;
                transition-delay: 0s !important;
                animation: none !important;
            }
            #crack-search-overlay.visible,
            .marquee-target.can-animate:hover,
            .crack-section-count { animation: none !important; }
            .crack-so-check circle, .crack-so-check path { stroke-dashoffset: 0 !important; }
            .crack-so-apply li.is-done .crack-so-st::after { transform: rotate(45deg) !important; }
            #crack-lounge { clip-path: none !important; }
        }
    `);

    // 비동기 딜레이 헬퍼
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


    // ── v1.2.0 디자인 헬퍼 (새 UI 조각 생성용) ──
    function ctEl(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function ctSvg(body, size = 16) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    function ctSparkIcon(size = 16) {
        return `<svg class="crack-spark" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">` +
            '<path class="ct-s1" d="M11 3C11.6 7.6 14.4 10.4 19 11C14.4 11.6 11.6 14.4 11 19C10.4 14.4 7.6 11.6 3 11C7.6 10.4 10.4 7.6 11 3Z"/>' +
            '<path class="ct-s2" d="M19 1.8C19.2 3.2 19.8 3.8 21.2 4C19.8 4.2 19.2 4.8 19 6.2C18.8 4.8 18.2 4.2 16.8 4C18.2 3.8 18.8 3.2 19 1.8Z"/>' +
            '<path class="ct-s3" d="M20 17.5C20.1 18.4 20.6 18.9 21.5 19C20.6 19.1 20.1 19.6 20 20.5C19.9 19.6 19.4 19.1 18.5 19C19.4 18.9 19.9 18.4 20 17.5Z"/>' +
            '</svg>';
    }

    const CT_ICON = {
        search: ctSvg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 15),
        x: ctSvg('<path d="M18 6 6 18M6 6l12 12"/>', 13),
        back: ctSvg('<path d="M14.5 6 8.5 12l6 6"/>', 17),
        dots: ctSvg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 16),
        grid: ctSvg('<rect class="ct-g1" x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect class="ct-g2" x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect class="ct-g3" x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect class="ct-g4" x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>', 16),
        all: ctSvg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>', 15),
        chat: ctSvg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20 12z"/>', 15),
        folder: ctSvg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', 15),
        alert: ctSvg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>', 26)
    };

    function readSavedArchiveHeight() {
        try {
            const raw = localStorage.getItem(ARCHIVE_HEIGHT_KEY);
            const value = Number.parseInt(raw || '', 10);
            return Number.isFinite(value) && value >= ARCHIVE_HEIGHT_MIN ? value : null;
        } catch (e) {
            return null;
        }
    }

    function setArchiveHeightValue(height) {
        if (!height) return;

        document.documentElement.style.setProperty('--crack-archive-h', `${height}px`);

        try {
            localStorage.setItem(ARCHIVE_HEIGHT_KEY, String(height));
        } catch (e) {}
    }

    // document-start 시점에 저장 높이를 CSS 변수로 먼저 올려둔다.
    // React가 사이드바를 다시 그릴 때 기본 높이가 번쩍 보이는 현상을 줄이기 위함.
    const initialArchiveHeight = readSavedArchiveHeight();
    if (initialArchiveHeight && document.documentElement) {
        document.documentElement.style.setProperty('--crack-archive-h', `${initialArchiveHeight}px`);
    }

    function findArchiveDivider() {
        const dividers = Array.from(document.querySelectorAll('.border-t'));

        return dividers.find(el => {
            const prevText = cleanText(el.previousElementSibling?.textContent || '');
            const nextText = cleanText(el.nextElementSibling?.textContent || '');

            // 현재 DOM: [보관함 섹션] [border-t] [채팅 목록 헤더]
            // 구형 DOM: border 다음 형제에 보관함/채팅 목록 텍스트가 붙어 있던 구조
            return (
                (prevText.includes('보관함') && nextText.includes('채팅 목록')) ||
                nextText.includes('채팅 목록') ||
                nextText.includes('보관함')
            );
        }) || null;
    }

    function isLiveArchiveContainer(el) {
        if (!(el instanceof HTMLElement) || !el.isConnected) return false;
        return !!el.querySelector?.('button[aria-label="보관함 전체보기"]') ||
            el.matches?.('.crack-archive-resized');
    }

    function resetArchiveCache() {
        cachedArchiveDivider = null;
        cachedArchiveContainer = null;
    }

    function findArchiveContainerByButton(scope = document) {
        const root = scope instanceof HTMLElement || scope === document ? scope : document;
        const buttons = Array.from(root.querySelectorAll?.('button[aria-label="보관함 전체보기"]') || []);

        for (const button of buttons) {
            if (!isInActiveSidebar(button)) continue;

            // 상대 확프에서 스크롤이 살아난 핵심 타겟:
            // div.flex.flex-col:has(> div > button[aria-label="보관함 전체보기"])
            // :has 의존을 줄이려고 JS로 같은 구조를 직접 찾는다.
            const directChild = button.parentElement;
            for (let el = directChild?.parentElement, depth = 0; el && el !== document.body && depth < 8; el = el.parentElement, depth += 1) {
                if (!(el instanceof HTMLElement)) continue;
                if (!el.classList?.contains('flex') || !el.classList?.contains('flex-col')) continue;

                if (directChild && directChild.parentElement === el) return el;
                if (Array.from(el.children || []).some(child => child instanceof HTMLElement && child.contains(button))) return el;
            }
        }

        return null;
    }

    function getArchiveContainerFromDivider(divider) {
        if (!divider) return findArchiveContainerByButton(document);

        const previous = divider.previousElementSibling;
        if (!previous) return findArchiveContainerByButton(document);

        // 1순위: 보관함 전체보기 버튼을 기준으로 실제 스크롤 박스 flex-col을 잡는다.
        // 기존처럼 .overflow-hidden 내부 요소를 잡으면 max-height는 먹어도 스크롤이 막힐 수 있다.
        const buttonTarget = findArchiveContainerByButton(previous);
        if (buttonTarget) return buttonTarget;

        // 2순위: 기존 로직 유지. 단, overflow-hidden은 스크롤 컨테이너로 쓰기 전에 auto로 강제될 예정이다.
        if (previous.classList?.contains('overflow-hidden')) return previous;

        const directOverflow = Array.from(previous.children || [])
            .find(el => el.classList?.contains('overflow-hidden'));
        if (directOverflow) return directOverflow;

        return previous.querySelector(':scope > .overflow-hidden, :scope > .overflow-y-auto, :scope > .scrollbar') ||
            previous.querySelector('.overflow-y-auto, .scrollbar') ||
            findArchiveContainerByButton(document) ||
            null;
    }

    function getArchivePartsCached() {
        if (isLiveArchiveContainer(cachedArchiveContainer)) {
            if (!(cachedArchiveDivider instanceof HTMLElement) || !cachedArchiveDivider.isConnected) {
                cachedArchiveDivider = findArchiveDivider();
            }

            return {
                divider: cachedArchiveDivider,
                archiveContainer: cachedArchiveContainer
            };
        }

        const divider = findArchiveDivider();
        const archiveContainer = getArchiveContainerFromDivider(divider);

        cachedArchiveDivider = divider || null;
        cachedArchiveContainer = archiveContainer || null;

        return { divider, archiveContainer };
    }

    function applyArchiveScrollBox(archiveContainer, height) {
        if (!archiveContainer) return;

        const safeHeight = Math.max(ARCHIVE_HEIGHT_MIN, Number.parseInt(height || '', 10) || ARCHIVE_HEIGHT_DEFAULT);
        document.documentElement.style.setProperty('--crack-archive-h', `${safeHeight}px`);

        // 같은 DOM/같은 높이에 반복 적용되는 경우가 제일 많아서 여기서 바로 탈출한다.
        if (archiveContainer === lastArchiveScrollTarget && lastArchiveAppliedHeight === safeHeight && archiveContainer.classList.contains('crack-archive-resized')) {
            return;
        }

        if (archiveContainer !== lastArchiveScrollTarget) {
            cleanupWrongArchiveResizeTargets(archiveContainer);
            lastArchiveScrollTarget = archiveContainer;
        }

        lastArchiveAppliedHeight = safeHeight;
        archiveContainer.classList.add('crack-archive-resized');
        archiveContainer.style.setProperty('max-height', `${safeHeight}px`, 'important');
        archiveContainer.style.setProperty('transition', 'none', 'important');
    }

    function cleanupWrongArchiveResizeTargets(archiveContainer) {
        document.querySelectorAll('.crack-archive-resized').forEach(el => {
            if (el === archiveContainer) return;
            if (el.classList?.contains('border-t')) return;

            // v1.0.4에서 내부 overflow-hidden 버튼/자식에 max-height가 먹은 경우 제거
            el.classList.remove('crack-archive-resized');
            el.style.removeProperty('max-height');
            el.style.removeProperty('overflow-y');
            el.style.removeProperty('overflow-x');
            el.style.removeProperty('overscroll-behavior');
            el.style.removeProperty('padding-bottom');
            el.style.removeProperty('transition');
        });
    }

    function applySavedArchiveHeightFast() {
        const { archiveContainer } = getArchivePartsCached();
        if (!archiveContainer) return null;

        // 저장값이 없어도 기본 높이를 줘야 overflow-y가 실제로 스크롤 영역을 만든다.
        // 저장은 드래그 종료 시에만 하므로 기존 사용자 설정 로직은 유지된다.
        const height = readSavedArchiveHeight() || ARCHIVE_HEIGHT_DEFAULT;
        applyArchiveScrollBox(archiveContainer, height);

        return archiveContainer;
    }

    function scheduleArchiveHeightFastApply() {
        if (archiveFastApplyRaf) return;

        archiveFastApplyRaf = requestAnimationFrame(() => {
            archiveFastApplyRaf = 0;
            applySavedArchiveHeightFast();
        });
    }

    // 텍스트 정제 헬퍼
    function cleanText(text) {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    // 검색/스캔에서 제외할 사이드바 헤더 이름 필터
    function isBadHeaderName(name) {
        return /^(보관함|채팅 목록|채팅목록|전체|메뉴|에피소드|파티챗)$/.test(cleanText(name));
    }

    // 실제 사이드바 내부 요소인지 확인하는 가드
    function isInActiveSidebar(el) {
        if (!el) return false;

        if (el.closest('[data-message-group-id], .wrtn-markdown, .__chat_input_textarea, #crack-search-overlay, #crack-smart-organize-modal, .crack-so, #crack-lounge')) return false;

        // 1. 드롭다운 메뉴, 팝오버, 라디오그룹 내부 제외
        if (
            el.closest('[role="menu"]') ||
            el.closest('[role="popover"]') ||
            el.closest('[role="radiogroup"]')
        ) {
            return false;
        }

        // 2. 보관함 이동 팝업 다이얼로그 및 편집 도구창 제외 (순정 사이드바는 필터 통과)
        const dialog = el.closest('[role="dialog"]');
        if (dialog) {
            if (
                dialog.textContent.includes('보관함 이동') ||
                dialog.querySelector('h2')?.textContent?.includes('이동') ||
                dialog.querySelector('button[aria-label="편집 종료"]')
            ) {
                return false;
            }
        }

        return true;
    }

    // 엘리먼트 내부에서 채팅 이름이나 텍스트를 추출해내는 안전 함수
    function getNameText(container) {
        if (!container) return '';

        const selectors = [
            '.text-popover-foreground.whitespace-nowrap',
            '.text-popover-foreground',
            '.typo-text-sm_leading-none_medium',
            '[class*="typo-text-sm"]'
        ];

        for (const selector of selectors) {
            const el = container.querySelector(selector);
            const text = cleanText(el?.textContent);
            if (text) return text;
        }

        return '';
    }

    function isRealChatLink(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (!isInActiveSidebar(el)) return false;
        if (el.tagName.toLowerCase() !== 'a') return false;
        if (el.closest('[role="tablist"]')) return false;

        const name = getNameText(el);
        if (name && isBadHeaderName(name)) return false;

        const href = el.getAttribute('href');
        if (!href) return false;

        try {
            const url = new URL(href, location.origin);
            const parts = url.pathname.split('/').filter(Boolean);

            if (parts.length <= 1) return false;

            return parts.includes('episodes') || parts.includes('stories');
        } catch {
            return false;
        }
    }
    // 채팅방 고유 ID 파싱
    // 채팅방 고유 ID는 episode ID를 우선 사용합니다.
    function getChatId(container) {
        if (!container) return null;

        const tag = container.tagName.toLowerCase();

        // 1. 일반/보관함 내부 개별 채팅방 (a 링크 구조)
        if (tag === 'a') {
            if (!isRealChatLink(container)) return null;

            const href = container.getAttribute('href');
            if (!href) return null;

            const episodeMatch = href.match(/\/episodes\/([a-f0-9]+)/i);
            if (episodeMatch && episodeMatch[1]) {
                return `episode_${episodeMatch[1]}`;
            }

            const storyMatch = href.match(/\/stories\/([a-f0-9]+)/i);
            if (storyMatch && storyMatch[1]) {
                return `story_${storyMatch[1]}`;
            }

            return `chat_${href}`;
        }

        // 2. 보관함 폴더 버튼은 채팅방 팔레트 대상이 아니지만,
        //    기존 보관함 색상 표시가 필요할 수 있어 별도 archive ID만 유지한다.
        const name = getNameText(container);
        if (name && !isBadHeaderName(name)) {
            return `archive_${cleanText(name)}`;
        }

        return null;
    }

    function getChatContainers() {
        return Array.from((getListScope() || document).querySelectorAll('a[href*="/episodes"], a[href*="/stories"]'))
            .filter(isRealChatLink);
    }

    function applyVisualColor(container, colorKey) {
        if (!container) return;

        container.classList.add('crack-chat-item');

        // v1.1.5 이하가 남긴 인라인 색/그림자는 정리한다. 이제 모양은 CSS(프로필 링)가 맡는다.
        ['background-color', 'box-shadow', 'border-top', 'border-bottom'].forEach(prop => {
            container.style.removeProperty(prop);
        });

        if (!colorKey || colorKey === 'none') {
            // CSS 변수는 남겨 두어야 링이 부드럽게 사라진다.
            container.removeAttribute('data-chat-color');
            return;
        }

        const themeColors = getThemeColors();
        const accent = themeColors.accents?.[colorKey] || colorValues[colorKey];
        const bg = themeColors.backgrounds?.[colorKey] || 'transparent';

        container.style.setProperty('--crack-accent', accent);
        container.style.setProperty('--crack-color-bg', bg);
        container.setAttribute('data-chat-color', colorKey);
    }

    function paintSameChat(id, colorKey) {
        getChatContainers().forEach(container => {
            if (getChatId(container) === id) {
                applyVisualColor(container, colorKey);
                markCurrentChat(container);
            }
        });
    }

    function saveColor(id, colorKey) {
        if (!id) return;

        try {
            if (!colorKey || colorKey === 'none') {
                localStorage.removeItem(STORAGE_KEY + id);
                paintSameChat(id, null);
                return;
            }

            localStorage.setItem(STORAGE_KEY + id, colorKey);
            paintSameChat(id, colorKey);
        } catch (e) {
            console.warn("[Crack UI] LocalStorage 저장 실패:", e);
        }
    }

    function isCurrentChat(container) {
        if (!container) return false;

        if (container.getAttribute('aria-current') === 'page') return true;
        if (container.dataset.state === 'active') return true;
        if (container.getAttribute('data-state') === 'active') return true;

        const href = container.getAttribute?.('href');
        if (!href) return false;

        try {
            const url = new URL(href, location.origin);
            const targetPath = url.pathname.replace(/\/+$/, '');
            const currentPath = location.pathname.replace(/\/+$/, '');

            if (!targetPath || targetPath === '/episodes' || targetPath === '/stories') return false;

            return currentPath === targetPath || currentPath.startsWith(targetPath + '/');
        } catch {
            return false;
        }
    }

    // 현재 채팅 표시 (강조 모양은 CSS .crack-current-chat 이 담당)
    function markCurrentChat(container) {
        if (!container) return;

        container.classList.add('crack-chat-item');
        container.classList.toggle('crack-current-chat', isCurrentChat(container));
    }

    function findChatContainerFromMenuButton(trigger) {
        if (!trigger) return null;

        // 팔레트는 오직 개별 채팅방의 메뉴 버튼에서만 허용한다.
        // 보관함 메뉴/채팅 목록 상단 메뉴/기타 드롭다운은 여기서 전부 탈락한다.
        if (trigger.getAttribute('aria-label') !== '채팅방 메뉴') return null;

        const link = trigger.closest('a[href*="/episodes"], a[href*="/stories"]');
        if (link && isRealChatLink(link)) return link;

        return null;
    }

    // Radix 채팅방 메뉴가 열린 동안에는 튜너가 사이드바 DOM을 건드리지 않는다.
    // 메뉴 Content는 body 포털에 있으므로 트리거의 open 상태를 기준으로 판별한다.
    function isChatMenuOpen() {
        return !!document.querySelector(
            'button[aria-label="채팅방 메뉴"][data-state="open"], ' +
            'button[aria-label="채팅방 메뉴"][aria-expanded="true"]'
        );
    }

    function rememberMenuTarget(e) {
        const trigger = e.target.closest?.('button[aria-haspopup="menu"]');

        if (!trigger) return;

        // 다른 메뉴를 누른 순간, 직전에 잡아둔 채팅방 대상을 반드시 비운다.
        if (trigger.getAttribute('aria-label') !== '채팅방 메뉴') {
            lastMenuTarget = null;
            lastMenuTime = 0;
            return;
        }

        const container = findChatContainerFromMenuButton(trigger);
        const id = getChatId(container);

        if (container && id) {
            lastMenuTarget = {
                container,
                id,
                trigger,
                triggerId: trigger.id || '',
                menuId: trigger.getAttribute('aria-controls') || ''
            };
            lastMenuTime = Date.now();
        } else {
            lastMenuTarget = null;
            lastMenuTime = 0;
        }
    }

    document.addEventListener('pointerdown', rememberMenuTarget, true);

    // One delegated handler also covers virtualized/remounted chat rows.
    function openChatMenuFromContext(event) {
        // Shift+right-click keeps the browser menu; don't hijack mobile long-press.
        if (event.defaultPrevented || event.shiftKey || event.pointerType === 'touch') return;
        const target = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!target || target.closest('input, textarea, [contenteditable="true"], [role="menu"]')) return;

        const tile = target.closest('#crack-lounge .crack-lg-tile');
        if (tile) {
            const button = tile.querySelector('.crack-lg-more');
            if (!button || button.disabled) return;
            event.preventDefault();
            event.stopPropagation();
            if (loungeState.popChatId !== tile.dataset.chatId) openLoungePop(button);
            return;
        }

        const link = target.closest('a[href*="/episodes"], a[href*="/stories"]');
        if (!link || !isRealChatLink(link)) return;
        const trigger = link.querySelector('button[aria-label="채팅방 메뉴"][aria-haspopup="menu"]');
        if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;

        event.preventDefault();
        event.stopPropagation();
        rememberMenuTarget({ target: trigger });
        if (trigger.getAttribute('data-state') === 'open' || trigger.getAttribute('aria-expanded') === 'true') return;

        // Radix opens on left pointerdown, not HTMLElement.click(). No link click
        // is dispatched, so the current chat is not navigated away from.
        trigger.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, composed: true,
            button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true,
            clientX: event.clientX, clientY: event.clientY
        }));
    }
    document.addEventListener('contextmenu', openChatMenuFromContext, true);



    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            lastMenuTarget = null;
            if (smartOrganizeState.open && !smartOrganizeState.busy) {
                closeSmartOrganize();
            }
        }
    });

    function injectPalette(menuNode) {
        if (!menuNode) return;

        if (!lastMenuTarget || !lastMenuTarget.container || !lastMenuTarget.id) return;
        if (Date.now() - lastMenuTime > 3000) return;

        // 현재 열린 메뉴가 방금 누른 채팅방 메뉴와 연결된 메뉴인지 확인한다.
        // aria-controls/id는 Radix가 여는 동안 붙이는 임시값이라 있을 때만 보조 확인용으로 사용한다.
        if (lastMenuTarget.menuId && menuNode.id && lastMenuTarget.menuId !== menuNode.id) return;
        if (lastMenuTarget.triggerId && menuNode.getAttribute('aria-labelledby') && menuNode.getAttribute('aria-labelledby') !== lastMenuTarget.triggerId) return;

        // 메뉴 내용이 채팅방 메뉴 구성인지 2차 확인한다. 다른 메뉴에 팔레트가 묻어나는 것을 방지한다.
        const menuText = cleanText(menuNode.textContent);
        const looksLikeChatMenu =
            menuText.includes('이름 변경') &&
            menuText.includes('삭제') &&
            (menuText.includes('고정') || menuText.includes('고정 해제'));
        if (!looksLikeChatMenu) return;

        menuNode.classList.add('crack-menu-solid');

        // 같은 메뉴에 팔레트를 제거/재삽입하면 Radix의 포커스·선택 상태가 흔들릴 수 있다.
        // 이미 주입된 경우에는 DOM을 더 바꾸지 않는다.
        if (menuNode.querySelector(':scope > .custom-palette-container')) return;

        const wrap = document.createElement('div');
        wrap.className = 'custom-palette-container';
        let currentColor = null;
        try {
            currentColor = localStorage.getItem(STORAGE_KEY + lastMenuTarget.id);
        } catch (e) {}

        Object.keys(colorValues).forEach(key => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.dataset.color = key;
            dot.setAttribute('aria-pressed', String(currentColor === key));
            dot.className = `custom-palette-dot ${currentColor === key ? 'active' : ''}`;
            dot.style.backgroundColor = colorValues[key];
            dot.title = currentColor === key ? `${key} 색상 제거` : `${key} 색상 적용`;
            dot.setAttribute('aria-label', dot.title);

            const applyPaletteColor = e => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const target = lastMenuTarget;
                if (!target || !target.id) {
                    console.warn('[Crack UI] 색상 적용 실패: 채팅방 대상을 찾지 못했습니다.');
                    return;
                }

                let saved = null;
                try {
                    saved = localStorage.getItem(STORAGE_KEY + target.id);
                } catch (err) {}

                // 이미 같은 색이면 제거, 아니면 해당 색 적용
                const nextColor = saved === key ? null : key;
                saveColor(target.id, nextColor);

                wrap.querySelectorAll('.custom-palette-dot').forEach(button => {
                    const selected = button.dataset.color === nextColor;
                    button.classList.toggle('active', selected);
                    button.setAttribute('aria-pressed', String(selected));
                    button.title = selected ? button.dataset.color + ' 색상 제거' : button.dataset.color + ' 색상 적용';
                    button.setAttribute('aria-label', button.title);
                });
            };
            dot.addEventListener('pointerdown', applyPaletteColor, true);

            dot.addEventListener('click', e => {
                if (e.detail === 0) { applyPaletteColor(e); return; }
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);

            wrap.appendChild(dot);
        });


        menuNode.appendChild(wrap);
    }

    function closeOpenRadixMenu() {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        }));
    }

    function injectSmartAutoOrganizeMenu(menuNode) {
        if (!(menuNode instanceof HTMLElement)) return;
        if (menuNode.querySelector('.crack-smart-organize-menu-item')) return;

        const candidates = Array.from(menuNode.querySelectorAll('[role="menuitem"], button, [data-radix-collection-item]'));
        const nativeAutoOrganize = candidates.find(item => {
            const text = cleanText(item.textContent || '');
            return text === '자동 정리' || text.includes('자동 정리');
        });
        if (!nativeAutoOrganize) return;

        const item = document.createElement('div');
        item.className = 'crack-smart-organize-menu-item';
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');

        const icon = document.createElement('span');
        icon.className = 'crack-smart-organize-menu-icon';
        icon.innerHTML = ctSparkIcon(16);

        const label = document.createElement('span');
        label.className = 'crack-smart-organize-menu-label';
        label.textContent = '스마트 자동 정리';

        const badge = document.createElement('span');
        badge.className = 'crack-smart-organize-menu-badge';
        badge.textContent = '추천';

        item.append(icon, label, badge);

        item.addEventListener('pointerdown', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            closeOpenRadixMenu();
            setTimeout(() => openSmartOrganize(), 60);
        }, true);

        item.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        }, true);

        const parent = nativeAutoOrganize.parentElement || menuNode;
        parent.insertBefore(item, nativeAutoOrganize);
        menuNode.classList.add('crack-menu-solid');
    }

    function isSmartOrganizeRunActive(runId) {
        return smartOrganizeState.open && smartOrganizeState.runId === runId;
    }

    function getSmartOrganizeRoot() {
        return document.getElementById('crack-smart-organize-modal');
    }

    function getSmartOrganizeParts() {
        const root = getSmartOrganizeRoot();
        if (!root) return {};
        return {
            root,
            title: root.querySelector('.crack-smart-title'),
            subtitle: root.querySelector('.crack-smart-subtitle'),
            close: root.querySelector('.crack-smart-close'),
            body: root.querySelector('.crack-smart-body'),
            foot: root.querySelector('.crack-smart-foot')
        };
    }

    function ensureSmartOrganizeModal() {
        let root = getSmartOrganizeRoot();
        if (root) return root;

        root = document.createElement('div');
        root.id = 'crack-smart-organize-modal';
        root.className = 'crack-so';
        root.dataset.phase = 'loading';
        root.innerHTML = `
            <section class="crack-so-dlg" role="dialog" aria-modal="true" aria-labelledby="crack-smart-title" tabindex="-1">
                <header class="crack-smart-head">
                    <span class="crack-so-mark">${ctSparkIcon(22)}</span>
                    <div class="crack-smart-title-wrap">
                        <h2 class="crack-smart-title" id="crack-smart-title">스마트 자동 정리</h2>
                        <div class="crack-smart-subtitle">동명 보관함을 확인하고 안전하게 정리합니다.</div>
                    </div>
                    <button type="button" class="crack-smart-close" aria-label="닫기">${CT_ICON.x}</button>
                </header>
                <ol class="crack-so-steps">
                    <li><span class="crack-so-ln"></span>불러오기</li>
                    <li><span class="crack-so-ln"></span>검토</li>
                    <li><span class="crack-so-ln"></span>적용</li>
                    <li><span class="crack-so-ln"></span>완료</li>
                </ol>
                <main class="crack-smart-body"></main>
                <footer class="crack-smart-foot"></footer>
            </section>
        `;

        root.addEventListener('pointerdown', event => {
            if (event.target === root && !smartOrganizeState.busy) closeSmartOrganize();
        });

        root.querySelector('.crack-smart-close').addEventListener('click', () => closeSmartOrganize());
        document.body.appendChild(root);

        requestAnimationFrame(() => {
            root.classList.add('is-open');
            root.querySelector('.crack-so-dlg')?.focus({ preventScroll: true });
        });
        return root;
    }

    function closeSmartOrganize(force = false) {
        if (smartOrganizeState.busy && !force && ['preparing', 'applying'].includes(smartOrganizeState.phase)) return;

        smartOrganizeState.runId += 1;
        smartOrganizeState.open = false;
        smartOrganizeState.busy = false;
        smartOrganizeState.phase = 'idle';
        smartOrganizeState.previewId = '';
        smartOrganizeState.rows = [];
        smartOrganizeState.status = '';
        smartOrganizeState.singletonStatus = 'idle';
        smartOrganizeState.singletonCount = 0;
        smartOrganizeState.singletonError = '';
        smartOrganizeState.result = null;

        // 닫힘 애니메이션 동안 id를 먼저 떼어, 곧바로 다시 열어도 새 창이 만들어지게 한다.
        const root = getSmartOrganizeRoot();
        if (root) {
            root.removeAttribute('id');
            root.classList.remove('is-open');
            root.classList.add('is-closing');
            setTimeout(() => root.remove(), 220);
        }
    }

    function setSmartOrganizeHeader(title, subtitle) {
        const parts = getSmartOrganizeParts();
        if (parts.title) parts.title.textContent = title;
        if (parts.subtitle) parts.subtitle.textContent = subtitle;
    }

    function setSmartSteps(phase) {
        const root = getSmartOrganizeRoot();
        if (!root) return;

        root.dataset.phase = phase;
        const index = { loading: 0, review: 1, preparing: 2, applying: 2, done: 3, error: 0 }[phase] ?? 0;
        root.querySelectorAll('.crack-so-steps li').forEach((li, i) => {
            if (phase === 'error') li.className = i === 0 ? 'is-err' : '';
            else if (phase === 'done') li.className = 'is-done';
            else li.className = i < index ? 'is-done' : i === index ? 'is-now' : '';
        });
    }

    function makeSmartBusyButton(label) {
        const button = ctEl('button', 'crack-smart-button primary');
        button.type = 'button';
        button.disabled = true;
        button.append(ctEl('span', 'crack-so-spin'), document.createTextNode(label));
        return button;
    }

    function renderSmartOrganizeLoading(title, status, phase = 'loading') {
        ensureSmartOrganizeModal();
        smartOrganizeState.phase = phase;
        smartOrganizeState.status = status;
        setSmartOrganizeHeader(title, phase === 'preparing'
            ? '실제로 옮기기 전에 대상 채팅을 먼저 모두 확인해요.'
            : '크랙의 자동 정리 미리보기를 불러와 기존 보관함과 비교해요.');
        setSmartSteps(phase);

        const parts = getSmartOrganizeParts();
        const locked = ['preparing', 'applying'].includes(phase);
        parts.close.disabled = locked;
        parts.body.replaceChildren();
        parts.foot.replaceChildren();

        const pane = ctEl('div', 'crack-so-pane crack-so-center crack-smart-loading');
        const orb = ctEl('div', 'crack-so-orb');
        orb.innerHTML = ctSparkIcon(28);
        const text = ctEl('div', 'crack-smart-progress-text', status);
        const bar = ctEl('div', 'crack-so-bar is-ind');
        bar.appendChild(document.createElement('i'));
        pane.append(orb, text, bar);
        parts.body.appendChild(pane);

        if (locked) {
            parts.foot.appendChild(makeSmartBusyButton('처리 중'));
        } else {
            const cancel = ctEl('button', 'crack-smart-button', '취소');
            cancel.type = 'button';
            cancel.addEventListener('click', () => closeSmartOrganize());
            parts.foot.appendChild(cancel);
        }
    }

    function renderSmartOrganizeApplying() {
        const root = getSmartOrganizeRoot();
        if (!root) return;

        setSmartSteps('applying');
        setSmartOrganizeHeader('보관함에 적용하는 중', '창을 닫지 말고 잠시만 기다려 주세요.');

        const parts = getSmartOrganizeParts();
        parts.close.disabled = true;
        parts.body.replaceChildren();
        parts.foot.replaceChildren();

        // applySmartOrganize와 같은 필터·순서라서 진행 번호와 줄 번호가 일치한다.
        const rows = smartOrganizeState.rows.filter(row => row.action === 'create' || row.action === 'merge');

        const pane = ctEl('div', 'crack-so-pane');
        const top = ctEl('div', 'crack-so-prog-top');
        top.append(
            ctEl('span', 'crack-smart-progress-text', smartOrganizeState.status || '보관함에 적용하는 중'),
            ctEl('b', 'crack-so-count', `0/${rows.length}`)
        );
        const bar = ctEl('div', 'crack-so-bar');
        bar.appendChild(document.createElement('i'));
        const list = ctEl('ul', 'crack-so-apply');
        rows.forEach(row => {
            const li = document.createElement('li');
            li.append(
                ctEl('span', 'crack-so-st'),
                ctEl('span', 'crack-so-ap-name', row.name || '이름 없는 보관함'),
                ctEl('span', 'crack-so-ap-act', row.action === 'merge' ? '기존에 합치기' : '새 보관함')
            );
            list.appendChild(li);
        });
        pane.append(top, bar, list);
        parts.body.appendChild(pane);

        parts.foot.append(ctEl('span', 'crack-smart-summary', '창을 닫지 말고 기다려 주세요'), makeSmartBusyButton('정리하는 중'));
    }

    function updateSmartOrganizeProgress(status) {
        smartOrganizeState.status = status;
        const root = getSmartOrganizeRoot();
        if (!root) return;

        // applySmartOrganize는 phase만 'applying'으로 바꾸고 화면은 그대로 두므로 여기서 전환한다.
        if (smartOrganizeState.phase === 'applying' && root.dataset.phase !== 'applying') {
            renderSmartOrganizeApplying();
        }

        const text = root.querySelector('.crack-smart-progress-text');
        if (text && text.textContent !== status) {
            text.textContent = status;

        }

        const match = /(\d+)\s*\/\s*(\d+)/.exec(String(status || ''));
        if (!match) return;

        const current = Number(match[1]);
        const total = Number(match[2]);
        if (!total) return;

        const applying = smartOrganizeState.phase === 'applying';
        const bar = root.querySelector('.crack-so-bar');
        if (bar) {
            bar.classList.remove('is-ind');
            const fill = bar.querySelector('i');
            // 적용 문구의 숫자는 "지금 시작한 항목" 번호라서 하나 덜 채운다.
            const done = applying ? current - 1 : current;
            if (fill) fill.style.width = `${Math.max(0, Math.min(100, (done / total) * 100))}%`;
        }

        if (!applying) return;

        const count = root.querySelector('.crack-so-count');
        if (count) count.textContent = `${current}/${total}`;

        const body = root.querySelector('.crack-smart-body');
        root.querySelectorAll('.crack-so-apply li').forEach((li, index) => {
            li.className = index < current - 1 ? 'is-done' : index === current - 1 ? 'is-now' : '';
            if (index === current - 1 && body && li.offsetTop + li.offsetHeight > body.scrollTop + body.clientHeight - 8) {
                body.scrollTop = li.offsetTop + li.offsetHeight - body.clientHeight + 16;
            }
        });
    }

    function formatSmartFolderDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    }

    function getSmartOrganizeSummary() {
        const rows = smartOrganizeState.rows;
        const createRows = rows.filter(row => row.action === 'create');
        const mergeRows = rows.filter(row => row.action === 'merge');
        const skipRows = rows.filter(row => row.action === 'skip');
        return {
            createGroups: createRows.length,
            mergeGroups: mergeRows.length,
            skipGroups: skipRows.length,
            selectedGroups: createRows.length + mergeRows.length,
            selectedChats: [...createRows, ...mergeRows].reduce((sum, row) => sum + Math.max(0, Number(row.chatCount || 0)), 0)
        };
    }

    function updateSmartOrganizeReviewSummary(bump = false) {
        const root = getSmartOrganizeRoot();
        if (!root) return;

        const summary = getSmartOrganizeSummary();
        const text = root.querySelector('.crack-smart-summary');
        const apply = root.querySelector('[data-smart-action="apply"]');

        if (text) {
            text.textContent = summary.selectedGroups
                ? `그룹 ${summary.selectedGroups}개, 채팅 ${summary.selectedChats}개를 옮겨요`
                : '옮길 채팅이 없어요';
            text.title = `새로 만들기 ${summary.createGroups}개, 합치기 ${summary.mergeGroups}개, 건너뛰기 ${summary.skipGroups}개`;
            if (bump) {
                text.classList.remove('is-bump');
                void text.offsetWidth;
                text.classList.add('is-bump');
            }
        }
        if (apply) {
            apply.disabled = summary.selectedGroups === 0;
            apply.textContent = summary.selectedGroups ? `${summary.selectedGroups}개 그룹 정리` : '정리할 항목 없음';
        }
    }

    function makeSmartSelect(options, value) {
        const select = document.createElement('select');
        select.className = 'crack-smart-select';
        for (const optionInfo of options) {
            const option = document.createElement('option');
            option.value = optionInfo.value;
            option.textContent = optionInfo.label;
            select.appendChild(option);
        }
        select.value = value;
        return select;
    }

    function syncSmartReviewRow(rowEl, row) {
        rowEl.dataset.action = row.action;
        const seg = rowEl.querySelector('.crack-so-seg');
        const buttons = Array.from(seg?.querySelectorAll('button') || []);
        const index = Math.max(0, buttons.findIndex(button => button.dataset.value === row.action));
        seg?.style.setProperty('--i', String(index));
        buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === row.action)));
        rowEl.classList.toggle('is-target', row.action === 'merge' && row.existingMatches.length > 0);
    }

    const smartStoryImages = new Map();
    let searchResultsOpen = false;
    function rememberSmartStoryImages(chats) {
        for (const chat of chats) {
            const id = String(chat?.story?._id || '');
            const image = getBestImage(chat);
            if (id && image) smartStoryImages.set(id, image);
        }
    }
    function seedSmartStoryImages() {
        for (const item of archiveSearchState.items) {
            if (item?.storyId && item.imageUrl) smartStoryImages.set(String(item.storyId), item.imageUrl);
        }
        // Only currently mounted chat rows; no full-page image scan.
        for (const link of getChatContainers()) {
            const id = (link.getAttribute('href') || '').match(/\/stories\/([^/]+)\/episodes\//)?.[1];
            const image = link.querySelector('img');
            if (id && image?.src) smartStoryImages.set(id, image.currentSrc || image.src);
        }
    }
    function createSmartThumbnail(row) {
        const thumb = ctEl('span', 'crack-so-thumb');
        thumb.setAttribute('aria-hidden', 'true');
        const fallback = () => { thumb.innerHTML = CT_ICON.folder; };
        const url = smartStoryImages.get(String(row.storyId));
        if (!url) { fallback(); return thumb; }
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', fallback, { once: true });
        img.src = url;
        thumb.appendChild(img);
        return thumb;
    }

    function buildSmartReviewRow(row, index) {
        const hasMatches = row.existingMatches.length > 0;
        const rowEl = ctEl('div', 'crack-so-row');
        rowEl.dataset.conflict = hasMatches ? 'true' : 'false';
        rowEl.style.setProperty('--d', String(Math.min(index, 10)));

        const thumb = createSmartThumbnail(row);

        const main = ctEl('div', 'crack-so-row-main');
        const nameLine = ctEl('div', 'crack-so-name');
        nameLine.appendChild(ctEl('strong', '', row.name || '이름 없는 보관함'));
        if (row.isSingletonSupplement) nameLine.appendChild(ctEl('span', 'crack-so-tag', '단일 채팅'));
        const meta = ctEl('div', 'crack-so-meta', hasMatches
            ? `새 채팅 ${row.chatCount}개, 같은 이름 보관함 ${row.existingMatches.length}개`
            : `새 채팅 ${row.chatCount}개, 새 보관함으로`);
        main.append(nameLine, meta);

        const options = hasMatches
            ? [['merge', '합치기'], ['create', '새로 만들기'], ['skip', '건너뛰기']]
            : [['create', '새로 만들기'], ['skip', '건너뛰기']];
        const seg = ctEl('div', 'crack-so-seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', '처리 방법');
        seg.style.setProperty('--n', String(options.length));
        seg.appendChild(ctEl('span', 'crack-so-seg-ind'));
        options.forEach(([value, label]) => {
            const button = ctEl('button', '', label);
            button.type = 'button';
            button.dataset.value = value;
            button.addEventListener('click', () => {
                if (row.action === value) return;
                row.action = value;
                syncSmartReviewRow(rowEl, row);
                updateSmartOrganizeReviewSummary(true);
            });
            seg.appendChild(button);
        });

        const target = ctEl('div', 'crack-so-target');
        const targetInner = document.createElement('div');
        if (hasMatches) {
            const label = ctEl('label', 'crack-so-tg');
            label.appendChild(ctEl('span', '', '합칠 보관함'));
            const targetOptions = row.existingMatches.map((folder, i) => {
                const date = formatSmartFolderDate(folder.createdAt);
                const pinned = folder.pinnedAt ? ', 고정됨' : '';
                return {
                    value: folder._id,
                    label: `기존 ${i + 1} (${Number(folder.chatCount || 0)}개${date ? ', ' + date : ''}${pinned})`
                };
            });
            if (targetOptions.length > 1) {
                const select = makeSmartSelect(targetOptions, row.targetFolderId || targetOptions[0].value);
                select.addEventListener('change', () => {
                    row.targetFolderId = select.value;
                });
                label.appendChild(select);
            } else {
                label.appendChild(ctEl('em', '', targetOptions[0].label));
            }
            targetInner.appendChild(label);
        }
        target.appendChild(targetInner);

        rowEl.append(thumb, main, seg, target);
        syncSmartReviewRow(rowEl, row);
        return rowEl;
    }

    function renderSmartOrganizeReview() {
        seedSmartStoryImages();
        smartOrganizeState.phase = 'review';
        smartOrganizeState.busy = false;
        setSmartSteps('review');
        setSmartOrganizeHeader('스마트 자동 정리', '같은 이름 보관함이 있으면 합치고, 없으면 새로 만들어요.');

        const parts = getSmartOrganizeParts();
        parts.close.disabled = false;
        parts.body.replaceChildren();
        parts.foot.replaceChildren();

        if (!smartOrganizeState.rows.length) {
            const empty = ctEl('div', 'crack-so-pane crack-so-center crack-smart-message');
            empty.appendChild(ctEl('h4', '', smartOrganizeState.singletonStatus === 'error'
                ? '순정 자동 정리 후보가 없습니다. 단일 채팅 확인도 실패했어요.'
                : '자동 정리할 채팅이 없습니다.'));
            if (smartOrganizeState.singletonStatus === 'error') {
                empty.appendChild(ctEl('p', 'crack-smart-error', `단일 채팅 확인 실패: ${smartOrganizeState.singletonError || '알 수 없는 오류'}`));
            }
            parts.body.appendChild(empty);

            const close = ctEl('button', 'crack-smart-button primary', '닫기');
            close.type = 'button';
            close.addEventListener('click', () => closeSmartOrganize());
            parts.foot.appendChild(close);
            return;
        }

        const pairs = [];
        const conflictCount = smartOrganizeState.rows.filter(row => row.existingMatches.length > 0).length;

        const pane = ctEl('div', 'crack-so-pane');
        const toolbar = ctEl('div', 'crack-so-tools');
        toolbar.appendChild(ctEl('span', 'crack-smart-chip', `정리 후보 ${smartOrganizeState.rows.length}개`));

        if (smartOrganizeState.singletonStatus === 'ready') {
            toolbar.appendChild(ctEl('span', 'crack-smart-chip', smartOrganizeState.singletonCount
                ? `단일 채팅 +${smartOrganizeState.singletonCount}개`
                : '단일 채팅 추가 없음'));
        } else if (smartOrganizeState.singletonStatus === 'error') {
            const chip = ctEl('span', 'crack-smart-chip conflict', '단일 채팅 확인 실패');
            chip.title = smartOrganizeState.singletonError || '';
            toolbar.appendChild(chip);
        }

        if (conflictCount) {
            toolbar.appendChild(ctEl('span', 'crack-smart-chip conflict', `이름 겹침 ${conflictCount}개`));
            toolbar.appendChild(ctEl('span', 'crack-so-grow'));

            const bulk = (action, label) => {
                const button = ctEl('button', 'crack-smart-button small', label);
                button.type = 'button';
                button.addEventListener('click', () => {
                    pairs.forEach(([rowEl, row]) => {
                        if (!row.existingMatches.length) return;
                        row.action = action;
                        syncSmartReviewRow(rowEl, row);
                    });
                    updateSmartOrganizeReviewSummary(true);
                });
                return button;
            };
            toolbar.append(bulk('merge', '겹치는 건 모두 합치기'), bulk('create', '모두 따로 만들기'));
        }

        const list = ctEl('div', 'crack-so-rows');
        smartOrganizeState.rows.forEach((row, index) => {
            const rowEl = buildSmartReviewRow(row, index);
            pairs.push([rowEl, row]);
            list.appendChild(rowEl);
        });

        const note = ctEl('p', 'crack-so-note', smartOrganizeState.singletonStatus === 'error'
            ? `이름은 띄어쓰기와 대소문자 차이를 무시하고 비교해요. 단일 채팅 확인은 실패해서 순정 후보만 보여줘요: ${smartOrganizeState.singletonError || '알 수 없는 오류'}`
            : '이름은 띄어쓰기와 대소문자 차이를 무시하고 비교해요. 보관함에 없는 1개짜리 채팅도 함께 찾았고, 정리 버튼을 누르기 전에는 아무것도 바뀌지 않아요.');

        pane.append(toolbar, list, note);
        parts.body.appendChild(pane);

        const summaryText = ctEl('span', 'crack-smart-summary');

        const cancel = ctEl('button', 'crack-smart-button', '취소');
        cancel.type = 'button';
        cancel.addEventListener('click', () => closeSmartOrganize());

        const apply = ctEl('button', 'crack-smart-button primary');
        apply.type = 'button';
        apply.dataset.smartAction = 'apply';
        apply.addEventListener('click', () => applySmartOrganize());

        parts.foot.append(summaryText, cancel, apply);
        updateSmartOrganizeReviewSummary();
    }

    function renderSmartOrganizeError(error, retry = true) {
        smartOrganizeState.phase = 'error';
        smartOrganizeState.busy = false;
        ensureSmartOrganizeModal();
        setSmartSteps('error');
        setSmartOrganizeHeader('스마트 자동 정리 실패', '아직 보관함 변경은 적용되지 않았습니다.');

        const parts = getSmartOrganizeParts();
        parts.close.disabled = false;
        parts.body.replaceChildren();
        parts.foot.replaceChildren();

        const pane = ctEl('div', 'crack-so-pane crack-so-center crack-smart-message');
        const mark = ctEl('div', 'crack-so-err');
        mark.innerHTML = CT_ICON.alert;
        pane.append(
            mark,
            ctEl('h4', '', '미리보기를 준비하지 못했어요.'),
            ctEl('p', 'crack-smart-error', getSmartOrganizeErrorMessage(error))
        );
        parts.body.appendChild(pane);

        const close = ctEl('button', 'crack-smart-button', '닫기');
        close.type = 'button';
        close.addEventListener('click', () => closeSmartOrganize());
        parts.foot.append(ctEl('span', 'crack-smart-summary'), close);

        if (retry) {
            const retryButton = ctEl('button', 'crack-smart-button primary', '다시 시도');
            retryButton.type = 'button';
            retryButton.addEventListener('click', () => {
                closeSmartOrganize(true);
                setTimeout(() => openSmartOrganize(), 50);
            });
            parts.foot.appendChild(retryButton);
        }
    }

    function renderSmartOrganizeDone(result) {
        smartOrganizeState.phase = 'done';
        smartOrganizeState.busy = false;
        smartOrganizeState.result = result;

        const failed = result.items.filter(item => !item.ok);
        setSmartSteps('done');
        setSmartOrganizeHeader(
            failed.length ? '스마트 자동 정리 일부 완료' : '스마트 자동 정리 완료',
            failed.length ? '성공한 항목은 적용됐고, 실패한 항목은 아래에 표시했어요.' : '선택한 채팅을 모두 안전하게 정리했어요.'
        );

        const parts = getSmartOrganizeParts();
        parts.close.disabled = false;
        parts.body.replaceChildren();
        parts.foot.replaceChildren();

        const pane = ctEl('div', 'crack-so-pane crack-so-center crack-smart-message');
        if (failed.length) {
            const mark = ctEl('div', 'crack-so-err');
            mark.innerHTML = CT_ICON.alert;
            pane.appendChild(mark);
        } else {
            const mark = document.createElement('div');
            mark.innerHTML = '<svg class="crack-so-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M16 27l7 7 14-15"/></svg>';
            pane.appendChild(mark);
        }

        pane.appendChild(ctEl('h4', '', failed.length ? '일부만 정리했어요' : '정리를 마쳤어요'));
        pane.appendChild(ctEl('p', '', `새 보관함 ${result.createdGroups}개를 만들고 ${result.mergedGroups}개 그룹을 기존 보관함에 합쳤어요. 옮긴 채팅은 모두 ${result.movedChats}개예요.`));

        if (failed.length) {
            const list = ctEl('ul', 'crack-smart-result-list crack-smart-error');
            failed.forEach(item => list.appendChild(ctEl('li', '', `${item.name}: ${item.error}`)));
            pane.appendChild(list);
        } else {
            pane.appendChild(ctEl('p', 'crack-so-faint', '보관함 및 채팅 목록 개수도 자동으로 다시 계산합니다.'));
        }
        parts.body.appendChild(pane);

        const close = ctEl('button', 'crack-smart-button primary', '완료');
        close.type = 'button';
        close.addEventListener('click', () => closeSmartOrganize());
        parts.foot.append(ctEl('span', 'crack-smart-summary'), close);
    }

    function normalizeSmartFolderName(value) {
        return cleanText(value || '')
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase();
    }

    function sortSmartExistingFolders(folders) {
        return [...folders].sort((a, b) => {
            const countDiff = Number(b?.chatCount || 0) - Number(a?.chatCount || 0);
            if (countDiff) return countDiff;
            return String(a?.createdAt || '').localeCompare(String(b?.createdAt || ''));
        });
    }

    function buildSmartOrganizeRows(groups, existingFolders) {
        const byName = new Map();
        for (const folder of existingFolders) {
            if (!folder?._id) continue;
            const key = normalizeSmartFolderName(folder.name);
            if (!key) continue;
            if (!byName.has(key)) byName.set(key, []);
            byName.get(key).push(folder);
        }

        return groups
            .filter(group => group?.storyId && Number(group?.chatCount || 0) > 0)
            .map(group => {
                const matches = sortSmartExistingFolders(byName.get(normalizeSmartFolderName(group.name)) || []);
                return {
                    storyId: group.storyId,
                    name: cleanText(group.name || '이름 없는 보관함'),
                    chatCount: Math.max(0, Number(group.chatCount || 0)),
                    preloadedChatIds: Array.isArray(group.preloadedChatIds)
                        ? [...new Set(group.preloadedChatIds.filter(Boolean))]
                        : null,
                    isSingletonSupplement: !!group.isSingletonSupplement,
                    existingMatches: matches,
                    action: matches.length ? 'merge' : 'create',
                    targetFolderId: matches[0]?._id || ''
                };
            });
    }

    function buildSmartSingletonGroups(rootChats, existingFolders, previewGroups) {
        const existingNames = new Set(
            existingFolders
                .filter(folder => folder?._id)
                .map(folder => normalizeSmartFolderName(folder.name))
                .filter(Boolean)
        );
        const previewStoryIds = new Set(
            previewGroups
                .map(group => String(group?.storyId || ''))
                .filter(Boolean)
        );
        const grouped = new Map();

        for (const chat of rootChats) {
            const chatId = String(chat?._id || '');
            const storyId = String(chat?.story?._id || '');
            if (!chatId || !storyId || previewStoryIds.has(storyId)) continue;

            const name = cleanText(chat?.story?.name || chat?.title || '');
            if (!name) continue;

            if (!grouped.has(storyId)) {
                grouped.set(storyId, {
                    storyId,
                    name,
                    chatIds: new Set()
                });
            }
            grouped.get(storyId).chatIds.add(chatId);
        }

        return [...grouped.values()]
            .filter(group => group.chatIds.size === 1)
            .filter(group => existingNames.has(normalizeSmartFolderName(group.name)))
            .map(group => ({
                storyId: group.storyId,
                name: group.name,
                chatCount: 1,
                preloadedChatIds: [...group.chatIds],
                isSingletonSupplement: true
            }));
    }

    function getSmartOrganizeErrorMessage(error) {
        if (error?.message === 'NO_AUTH_TOKEN') {
            return '인증 토큰을 아직 못 잡았어요. 채팅방을 아무거나 한 번 열었다 나온 뒤 다시 시도해 주세요.';
        }
        if (error?.status === 401) return '인증이 만료됐어요. 크랙을 새로고침한 뒤 다시 시도해 주세요.';
        return cleanText(error?.detail || error?.message || String(error || '알 수 없는 오류'));
    }

    async function openSmartOrganize() {
        if (smartOrganizeState.open) return;

        smartOrganizeState.runId += 1;
        const runId = smartOrganizeState.runId;
        smartOrganizeState.open = true;
        smartOrganizeState.busy = true;
        smartOrganizeState.previewId = '';
        smartOrganizeState.rows = [];
        smartOrganizeState.singletonStatus = 'idle';
        smartOrganizeState.singletonCount = 0;
        smartOrganizeState.singletonError = '';
        smartOrganizeState.result = null;

        ensureSmartOrganizeModal();
        renderSmartOrganizeLoading('스마트 자동 정리 준비', '인증 정보를 확인하는 중…', 'loading');

        try {
            if (!hasAuthToken()) await waitForAuthToken(6000);
            if (!isSmartOrganizeRunActive(runId)) return;
            if (!hasAuthToken()) throw new Error('NO_AUTH_TOKEN');

            updateSmartOrganizeProgress('크랙 자동 정리 미리보기를 만드는 중…');
            const previewJson = await requestCrackJson('/crack-gen/chat-folders/auto-organize/preview', {
                method: 'POST'
            });
            if (!isSmartOrganizeRunActive(runId)) return;

            const previewId = previewJson?.data?.previewId;
            if (!previewId) throw new Error('미리보기 ID를 받지 못했습니다.');
            smartOrganizeState.previewId = previewId;

            updateSmartOrganizeProgress('기존 보관함과 정리 후보를 비교하는 중…');
            const [existingFolders, groups] = await Promise.all([
                fetchSmartExistingFolders(),
                fetchSmartPreviewGroups(previewId)
            ]);
            if (!isSmartOrganizeRunActive(runId)) return;

            updateSmartOrganizeProgress('기존 보관함에 합칠 단일 채팅을 확인하는 중…');
            let singletonGroups = [];
            try {
                singletonGroups = await fetchSmartSingletonGroups(existingFolders, groups, (completed, total) => {
                    if (isSmartOrganizeRunActive(runId)) {
                        updateSmartOrganizeProgress(`보관함과 대조하는 중 ${completed}/${total}`);
                    }
                });
                smartOrganizeState.singletonStatus = 'ready';
                smartOrganizeState.singletonCount = singletonGroups.length;
            } catch (error) {
                // 보충 조회가 실패해도 순정 미리보기 기반 스마트 정리는 그대로 사용할 수 있게 둡니다.
                console.warn('[Crack UI] 단일 채팅 스마트 정리 후보 확인 실패:', error);
                smartOrganizeState.singletonStatus = 'error';
                smartOrganizeState.singletonCount = 0;
                smartOrganizeState.singletonError = getSmartOrganizeErrorMessage(error);
            }
            if (!isSmartOrganizeRunActive(runId)) return;

            smartOrganizeState.rows = buildSmartOrganizeRows([...groups, ...singletonGroups], existingFolders);
            renderSmartOrganizeReview();
        } catch (error) {
            if (!isSmartOrganizeRunActive(runId)) return;
            console.warn('[Crack UI] 스마트 자동 정리 준비 실패:', error);
            renderSmartOrganizeError(error, true);
        }
    }

    async function mapSmartWithConcurrency(items, limit, mapper, onProgress) {
        const results = new Array(items.length);
        let cursor = 0;
        let completed = 0;

        async function worker() {
            while (cursor < items.length) {
                const index = cursor++;
                results[index] = await mapper(items[index], index);
                completed += 1;
                onProgress?.(completed, items.length);
            }
        }

        const workers = Array.from(
            { length: Math.min(Math.max(1, limit), Math.max(1, items.length)) },
            () => worker()
        );
        await Promise.all(workers);
        return results;
    }

    async function applySmartOrganize() {
        if (smartOrganizeState.busy || smartOrganizeState.phase !== 'review') return;

        const selectedRows = smartOrganizeState.rows
            .filter(row => row.action === 'create' || row.action === 'merge')
            .map(row => ({ ...row }));
        if (!selectedRows.length) return;

        const runId = smartOrganizeState.runId;
        smartOrganizeState.busy = true;
        renderSmartOrganizeLoading('정리할 채팅 확인', `채팅 목록을 불러오는 중 0/${selectedRows.length}`, 'preparing');

        try {
            // 실제 변경 전에 모든 대상 채팅 ID를 먼저 확보한다. 중간 조회 실패로 반쯤 적용되는 일을 막는다.
            const prepared = await mapSmartWithConcurrency(
                selectedRows,
                SMART_ORGANIZE_LOAD_CONCURRENCY,
                async row => ({
                    row,
                    chatIds: row.preloadedChatIds?.length
                        ? [...row.preloadedChatIds]
                        : await fetchSmartPreviewChatIds(smartOrganizeState.previewId, row.storyId)
                }),
                (completed, total) => {
                    if (isSmartOrganizeRunActive(runId)) {
                        updateSmartOrganizeProgress(`채팅 목록을 불러오는 중 ${completed}/${total}`);
                    }
                }
            );
            if (!isSmartOrganizeRunActive(runId)) return;

            smartOrganizeState.phase = 'applying';
            const result = {
                createdGroups: 0,
                mergedGroups: 0,
                movedChats: 0,
                items: []
            };

            for (let index = 0; index < prepared.length; index += 1) {
                const { row, chatIds } = prepared[index];
                updateSmartOrganizeProgress(`보관함에 적용하는 중 ${index + 1}/${prepared.length} · ${row.name}`);

                try {
                    const uniqueChatIds = [...new Set(chatIds.filter(Boolean))];
                    if (!uniqueChatIds.length) {
                        result.items.push({ name: row.name, ok: true, action: 'skip-empty', chatCount: 0 });
                        continue;
                    }

                    if (row.action === 'merge') {
                        if (!row.targetFolderId) throw new Error('합칠 보관함을 선택하지 않았습니다.');
                        await moveSmartChatsToFolder(uniqueChatIds, row.targetFolderId);
                        result.mergedGroups += 1;
                    } else {
                        await createSmartFolderWithChats(row.name, uniqueChatIds);
                        result.createdGroups += 1;
                    }

                    result.movedChats += uniqueChatIds.length;
                    result.items.push({
                        name: row.name,
                        ok: true,
                        action: row.action,
                        chatCount: uniqueChatIds.length
                    });
                } catch (error) {
                    console.warn('[Crack UI] 스마트 자동 정리 항목 실패:', row.name, error);
                    result.items.push({
                        name: row.name,
                        ok: false,
                        action: row.action,
                        chatCount: 0,
                        error: getSmartOrganizeErrorMessage(error)
                    });
                }
            }

            archiveSearchState.refreshedThisPage = false;
            archiveSearchState.savedAt = 0;
            archiveSearchState.lastRenderKey = '';
            archiveSearchState.lastResultKey = '';
            markArchiveDataChanged();
            setTimeout(() => ensureArchiveSearchIndex(), 1200);
            renderSmartOrganizeDone(result);
        } catch (error) {
            if (!isSmartOrganizeRunActive(runId)) return;
            console.warn('[Crack UI] 스마트 자동 정리 적용 준비 실패:', error);
            renderSmartOrganizeError(error, true);
        }
    }

    function setupMarquee(container) {
        const nameSpan = container.querySelector(
            '.typo-text-sm_leading-none_medium, .text-popover-foreground.whitespace-nowrap, .text-popover-foreground'
        );

        if (!nameSpan || nameSpan.classList.contains('marquee-target')) return;

        nameSpan.classList.add('marquee-target');

        requestAnimationFrame(() => {
            const diff = nameSpan.scrollWidth - nameSpan.clientWidth;

            if (diff > 0) {
                nameSpan.classList.add('can-animate');
                nameSpan.style.setProperty('--move-dist', `${(diff + 10) * -1}px`);
            }
        });
    }

    // 보관함 상단 검색바 생성 및 삽입
    function scheduleSearchQueryApply(delay = SEARCH_DEBOUNCE_MS) {
        clearTimeout(searchDebounceTimer);

        searchDebounceTimer = setTimeout(() => {
            searchDebounceTimer = null;

            const input = document.querySelector('.crack-search-input');
            if (input && input.value !== currentSearchQueryRaw) {
                currentSearchQueryRaw = input.value || '';
            }

            filterChatsAndFolders(normalizeSearchText(currentSearchQueryRaw));
        }, delay);
    }

    function syncSearchInputFromState(input, clearBtn) {
        if (!input) return;

        const isNewInput = input !== lastSearchInputEl;
        lastSearchInputEl = input;

        if (isNewInput) {
            // React가 검색창을 새로 만든 경우에만 이전 검색어를 되살린다.
            // 조합(IME) 중에는 value를 건드리면 자모가 겹치므로 건너뛴다.
            if (!isSearchComposing && currentSearchQueryRaw && !input.value) {
                input.value = currentSearchQueryRaw;
            }
        } else if (!isSearchComposing) {
            // 살아있는 입력창에서는 입력창 값이 항상 진실이다.
            // 사용자가 직접 지웠으면 백업본도 같이 비워야 글자가 되살아나지 않는다.
            currentSearchQueryRaw = input.value || '';
        }

        if (clearBtn) {
            clearBtn.classList.toggle('visible', !!input.value.trim());
        }
    }

    function ensureSearchBarEvents(searchContainer) {
        if (!searchContainer) return;

        // 검색 결과는 fixed overlay에서만 렌더링합니다.
        searchContainer.querySelectorAll('.crack-api-result-snippet, .crack-api-search-status, .crack-api-search-results').forEach(el => el.remove());
        ensureSearchOverlay();

        const input = searchContainer.querySelector('.crack-search-input');
        const clearBtn = searchContainer.querySelector('.crack-search-clear');
        if (!input || !clearBtn) return;

        input.placeholder = '채팅방 제목 검색...';
        syncSearchInputFromState(input, clearBtn);

        if (searchContainer.dataset.crackSearchBound === 'true') return;

        input.addEventListener('compositionstart', () => {
            isSearchComposing = true;
        });

        input.addEventListener('compositionend', () => {
            isSearchComposing = false;
            currentSearchQueryRaw = input.value || '';
            const query = normalizeSearchText(currentSearchQueryRaw);
            clearBtn.classList.toggle('visible', !!query);
            scheduleSearchQueryApply(SEARCH_DEBOUNCE_MS);
        });

        // IME 조합 중에도 input.value 기준으로 검색을 갱신한다.
        input.addEventListener('input', () => {
            currentSearchQueryRaw = input.value || '';
            const query = normalizeSearchText(currentSearchQueryRaw);
            clearBtn.classList.toggle('visible', !!query);

            scheduleSearchQueryApply(SEARCH_DEBOUNCE_MS);
        });

        // 조합 중에 X를 누르면 포커스가 빠지면서 만들던 글자가 되돌아온다.
        // 클릭 전에 포커스가 빠지지 않도록 막는다.
        clearBtn.addEventListener('mousedown', e => {
            e.preventDefault();
        });

        clearBtn.addEventListener('click', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
            isSearchComposing = false;

            currentSearchQueryRaw = '';
            input.value = '';
            clearBtn.classList.remove('visible');
            filterChatsAndFolders('');
            input.focus();

            // 뒤늦게 되돌아온 조합 문자를 한 번 더 정리한다.
            requestAnimationFrame(() => {
                if (currentSearchQueryRaw === '' && input.value) {
                    input.value = '';
                    clearBtn.classList.remove('visible');
                    filterChatsAndFolders('');
                }
            });
        });

        // 조합 입력/자동완성 직후에도 상태를 한 번 더 맞춘다.
        input.addEventListener('change', () => {
            currentSearchQueryRaw = input.value || '';
            clearBtn.classList.toggle('visible', !!normalizeSearchText(currentSearchQueryRaw));
            scheduleSearchQueryApply(SEARCH_DEBOUNCE_MS);
        });

        searchContainer.dataset.crackSearchBound = 'true';
    }


    function ensureSearchOverlay() {
        let overlay = document.getElementById('crack-search-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'crack-search-overlay';
        overlay.innerHTML = `
            <div class="crack-api-search-status"></div>
            <div class="crack-api-search-results"></div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function getSearchOverlayParts() {
        const overlay = ensureSearchOverlay();
        return {
            overlay,
            status: overlay.querySelector('.crack-api-search-status'),
            results: overlay.querySelector('.crack-api-search-results')
        };
    }

    function getSearchSidebarRect(searchContainer) {
        const searchRect = searchContainer.getBoundingClientRect();
        let best = null;

        for (let el = searchContainer.parentElement, depth = 0; el && el instanceof HTMLElement && el !== document.body && depth < 14; el = el.parentElement, depth += 1) {
            const rect = el.getBoundingClientRect();
            if (
                rect.width >= searchRect.width - 2 &&
                rect.width <= 430 &&
                rect.height >= 220 &&
                rect.left <= searchRect.left + 12 &&
                rect.right >= searchRect.right - 12
            ) {
                best = rect;
            }
        }

        if (best) return best;

        return {
            left: Math.max(0, searchRect.left - 10),
            right: searchRect.right + 10,
            width: searchRect.width + 20,
            top: searchRect.top,
            bottom: window.innerHeight,
            height: window.innerHeight - searchRect.top
        };
    }

    function updateSearchOverlayPosition() {
        const overlay = document.getElementById('crack-search-overlay');
        const searchContainer = document.querySelector('.crack-search-container');
        if (!overlay || !searchContainer || !overlay.classList.contains('visible')) return;

        const searchRect = searchContainer.getBoundingClientRect();
        const sidebarRect = getSearchSidebarRect(searchContainer);
        const top = Math.max(0, Math.round(searchRect.bottom + 6));
        const height = Math.max(120, Math.round(window.innerHeight - top));

        overlay.style.left = `${Math.max(0, Math.round(sidebarRect.left))}px`;
        overlay.style.top = `${top}px`;
        overlay.style.width = `${Math.max(180, Math.round(sidebarRect.width))}px`;
        overlay.style.height = `${height}px`;
    }

    function scheduleSearchOverlayPositionUpdate() {
        clearTimeout(searchOverlayPositionTimer);
        searchOverlayPositionTimer = setTimeout(() => {
            searchOverlayPositionTimer = null;
            updateSearchOverlayPosition();
        }, 30);
    }

    function setSearchOverlayActive(active) {
        searchResultsOpen = !!active;
        const overlay = ensureSearchOverlay();

        if (!active) {
            overlay.classList.remove('visible');
            return;
        }

        overlay.classList.add('visible');
        updateSearchOverlayPosition();
    }

    function isInsideSearchOverlay(node) {
        if (!node) return false;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        return !!el?.closest?.('#crack-search-overlay');
    }

    function isInsideSmartOrganize(node) {
        if (!node) return false;
        const el = node instanceof HTMLElement ? node : node.parentElement;
        return !!el?.closest?.('#crack-smart-organize-modal');
    }

    // Radix 메뉴 포털의 생성·제거 및 팔레트 주입은 튜너 전체 UI 갱신 사유가 아니다.
    // 제거된 노드는 closest()가 동작하지 않을 수 있어 자기 자신/내부 role="menu"도 함께 확인한다.
    function isMenuLayerNode(node) {
        if (!(node instanceof HTMLElement)) return false;

        if (node.matches?.('[role="menu"]') || node.querySelector?.('[role="menu"]')) return true;
        if (node.closest?.('[role="menu"]')) return true;

        const popper = node.closest?.('[data-radix-popper-content-wrapper]');
        return !!popper?.querySelector?.('[role="menu"]');
    }

    function isMenuOnlyMutation(mutation) {
        if (!mutation) return false;
        if (isMenuLayerNode(mutation.target)) return true;

        const changedNodes = [
            ...Array.from(mutation.addedNodes || []),
            ...Array.from(mutation.removedNodes || [])
        ].filter(node => node instanceof HTMLElement);

        return changedNodes.length > 0 && changedNodes.every(isMenuLayerNode);
    }

    // 이전 버전에서 남긴 숨김/레이아웃 흔적을 정리합니다.
    function cleanupLegacySearchModeArtifacts(force = false) {
        // 구버전(v4.5.x 계열) 잔여 속성 정리는 대부분 최초 1회면 충분하다.
        // 검색어가 비어 있을 때마다 전역 querySelectorAll을 반복하지 않도록 막는다.
        if (!force && legacySearchCleanupDone) return;

        restoreSearchModeHiddenElements();
        restoreSearchLayoutExpansion();
        document.querySelectorAll('.crack-search-container.crack-search-active').forEach(el => {
            el.classList.remove('crack-search-active');
        });

        legacySearchCleanupDone = true;
    }

    function restoreSearchModeHiddenElements() {
        document.querySelectorAll('[data-crack-search-hidden-v457="true"]').forEach(el => {
            if (!(el instanceof HTMLElement)) return;
            const prev = el.dataset.crackPrevDisplayV457 || '';
            if (prev) {
                el.style.display = prev;
            } else {
                el.style.removeProperty('display');
            }
            delete el.dataset.crackSearchHiddenV457;
            delete el.dataset.crackPrevDisplayV457;
        });
    }

    function restoreSearchLayoutExpansion() {
        document.querySelectorAll('[data-crack-search-expanded-v458="true"]').forEach(el => {
            if (!(el instanceof HTMLElement)) return;

            const props = ['overflow', 'overflowY', 'overflowX', 'maxHeight', 'height', 'minHeight', 'flex', 'flexBasis'];
            props.forEach(prop => {
                const key = 'crackPrev' + prop.charAt(0).toUpperCase() + prop.slice(1) + '';
                const value = el.dataset[key] || '';
                if (value) {
                    el.style[prop] = value;
                } else {
                    el.style.removeProperty(prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase()));
                }
                delete el.dataset[key];
            });

            delete el.dataset.crackSearchExpandedV458;
        });

        document.querySelectorAll('.crack-search-container.crack-search-active').forEach(el => {
            el.classList.remove('crack-search-active');
        });
    }

    const sectionHeaderCache = new Map();
    let tunerUiStarted = false;
    let countRetryAt = 0;
    let countFailures = 0;
    const pendingMenuInjections = new WeakSet();
    const OWN_TUNER_UI = '.crack-section-count, .crack-search-container, #crack-search-overlay, #crack-smart-organize-modal, .crack-so, #crack-lounge, .custom-palette-container, .crack-smart-organize-menu-item';
    const NON_LIST_CONTENT = '[data-message-group-id], .wrtn-markdown, .__chat_input_textarea, #cawf-root, #cawf-panel, #sgb-bg-root';

    function getListScope() {
        const archive = findArchiveHeaderSpan();
        const chats = findChatListHeaderSpan();
        const header = chats || archive;
        if (!header) return null;
        // Crack renders the heading and room rows as siblings inside this viewport.
        const viewport = header.closest('.scrollbar');
        if (viewport && (!archive || viewport.contains(archive))) return viewport;
        let scope = header.parentElement?.parentElement;
        while (scope && archive && !scope.contains(archive)) scope = scope.parentElement;
        while (scope && scope !== document.body && scope !== document.documentElement &&
            !scope.querySelector('a[href*="/episodes"], a[href*="/stories"]')) scope = scope.parentElement;
        if (scope === document.body || scope === document.documentElement) return null;
        return scope;
    }

    function nodeTouchesList(node) {
        if (!(node instanceof Element)) return false;
        if (node.closest(OWN_TUNER_UI + ', ' + NON_LIST_CONTENT)) return false;
        return node.matches('a[href*="/episodes"], a[href*="/stories"], button[aria-label="보관함 전체보기"]')
            || !!node.querySelector('a[href*="/episodes"], a[href*="/stories"], button[aria-label="보관함 전체보기"]');
    }

    function queueMenuInjection(menu) {
        if (pendingMenuInjections.has(menu)) return;
        pendingMenuInjections.add(menu);
        setTimeout(() => {
            pendingMenuInjections.delete(menu);
            if (!menu.isConnected) return;
            injectPalette(menu);
            injectSmartAutoOrganizeMenu(menu);
        }, 0);
    }


    function findSectionHeaderSpan(label) {
        const cached = sectionHeaderCache.get(label);
        if (cached?.isConnected && cleanText(cached.textContent) === label && cached.getClientRects().length) return cached;
        const found = Array.from(document.querySelectorAll('span')).find(el => {
            if (cleanText(el.textContent) !== label) return false;
            if (el.closest('#crack-search-overlay, [data-message-group-id], .wrtn-markdown, .__chat_input_textarea')) return false;
            if (!el.getClientRects().length) return false;
            const dialog = el.closest('[role="dialog"]');
            if (dialog && (
                dialog.textContent.includes('보관함 이동') ||
                dialog.querySelector('h2')?.textContent?.includes('이동')
            )) return false;
            return isInActiveSidebar(el);
        }) || null;
        if (found) sectionHeaderCache.set(label, found);
        else sectionHeaderCache.delete(label);
        return found;
    }

    function findArchiveHeaderSpan() {
        return findSectionHeaderSpan('보관함');
    }

    function findChatListHeaderSpan() {
        return findSectionHeaderSpan('채팅 목록');
    }

    function findSectionHeaderRow(header) {
        if (!header) return null;

        for (let el = header.parentElement, depth = 0; el && el !== document.body && depth < 6; el = el.parentElement, depth += 1) {
            if (!(el instanceof HTMLElement)) continue;
            if (!el.classList.contains('flex') || !el.classList.contains('items-center')) continue;

            const text = cleanText(el.textContent);
            if (text.includes(cleanText(header.textContent))) return el;
        }

        return header.parentElement;
    }

    function placeSectionCountBadge(header, badge, kind) {
        let row = findSectionHeaderRow(header);
        if (!row) return false;

        if (kind === 'root') {
            // 채팅 목록 제목의 가장 가까운 flex가 내부 묶음일 수 있으므로,
            // 실제 점 세 개 메뉴 버튼을 포함한 상위 헤더 행까지 올라간다.
            let menuButton = null;
            for (let el = row; el && el !== document.body; el = el.parentElement) {
                if (!(el instanceof HTMLElement)) continue;
                const candidate = Array.from(el.querySelectorAll('button[aria-haspopup="menu"]'))
                    .find(button => button instanceof HTMLElement && isInActiveSidebar(button));
                if (!candidate) continue;
                row = el;
                menuButton = candidate;
                break;
            }

            if (menuButton) {
                let anchor = menuButton;
                while (anchor.parentElement && anchor.parentElement !== row) anchor = anchor.parentElement;
                if (anchor.parentElement !== row) return false;
                if (badge.parentElement !== row || badge.nextElementSibling !== anchor) row.insertBefore(badge, anchor);
                return true;
            }
        }

        // 보관함은 제목을 소유한 버튼/요소 바로 뒤에 둔다.
        const titleOwner = header.closest('button') || header;
        if (titleOwner.parentElement === row) {
            if (badge.parentElement !== row || badge.previousElementSibling !== titleOwner) {
                titleOwner.insertAdjacentElement('afterend', badge);
            }
        } else if (badge.parentElement !== row) {
            row.appendChild(badge);
        }

        return true;
    }

    function updateSectionCountBadge(kind, header, count) {
        if (!header) return null;

        const selector = `.crack-section-count[data-kind="${kind}"]`;
        let badge = document.querySelector(selector);

        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'crack-section-count';
            badge.dataset.kind = kind;
        }

        if (!placeSectionCountBadge(header, badge, kind)) return null;

        const state = archiveSearchState.countStatus;
        const hasCount = Number.isFinite(count);
        const nextState = hasCount ? 'ready' : state;
        const nextText = hasCount
            ? `${count.toLocaleString()}개`
            : state === 'error' ? '—' : '…';
        const label = kind === 'archive' ? '보관함 채팅' : '채팅 목록';
        const nextAria = hasCount
            ? `${label} ${count}개`
            : state === 'error' ? `${label} 개수를 불러오지 못함` : `${label} 개수 불러오는 중`;

        // 같은 값이면 DOM을 다시 쓰지 않는다. MutationObserver 재렌더 깜빡임을 줄인다.
        if (badge.textContent !== nextText) badge.textContent = nextText;
        if (badge.dataset.state !== nextState) badge.dataset.state = nextState;
        if (badge.getAttribute('aria-label') !== nextAria) badge.setAttribute('aria-label', nextAria);
        badge.title = nextAria;

        return badge;
    }

    function updateChatCountBadges() {
        const archiveHeader = findArchiveHeaderSpan();
        const rootHeader = findChatListHeaderSpan();

        updateSectionCountBadge('archive', archiveHeader, archiveSearchState.totalArchiveChats);
        updateSectionCountBadge('root', rootHeader, archiveSearchState.totalRootChats);
    }

    function injectSearchBar() {
        updateChatCountBadges();
        const existing = document.querySelector('.crack-search-container');
        if (existing) {
            ensureSearchBarEvents(existing);
            return;
        }

        // 보관함 검색바 생성 시 진짜 사이드바 헤더만 정밀 타겟팅
        const archiveHeader = findArchiveHeaderSpan();
        if (!archiveHeader) return;

        const headerDiv = archiveHeader.closest('.flex.items-center');
        if (headerDiv && headerDiv.parentNode) {
            const searchContainer = document.createElement('div');
            searchContainer.className = 'crack-search-container';
            searchContainer.innerHTML = `
                <div class="crack-search-box">
                    <span class="crack-search-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" width="14" height="14">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </span>
                    <input type="text" class="crack-search-input" aria-label="채팅방 제목 검색" placeholder="채팅방 제목 검색...">
                    <button type="button" class="crack-search-clear" aria-label="검색어 지우기">✕</button>
                </div>
                <button type="button" class="crack-lounge-btn" aria-label="한눈에 보기" title="한눈에 보기" aria-expanded="false">${CT_ICON.grid}</button>
            `;

            headerDiv.parentNode.insertBefore(searchContainer, headerDiv);
            ensureSearchBarEvents(searchContainer);
        }
    }
    // API 기반 보관함 내부 검색 인덱스 -----------------------------
    function normalizeSearchText(text) {
        return cleanText(text).toLowerCase();
    }

    function textMatchesQuery(text, query) {
        const normalizedText = normalizeSearchText(text);
        const terms = normalizeSearchText(query).split(' ').filter(Boolean);
        if (!terms.length) return false;
        return terms.every(term => normalizedText.includes(term));
    }

    function getBestImage(chat) {
        const profile = chat?.story?.profileImage || {};
        const portrait = chat?.story?.portraitImage || {};
        return portrait.w200 || profile.w200 || portrait.origin || profile.origin || '';
    }

    function formatArchiveDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';

        const diff = Date.now() - date.getTime();
        const day = 24 * 60 * 60 * 1000;

        if (diff >= 0 && diff < day) return '오늘';
        if (diff >= day && diff < 2 * day) return '어제';
        if (diff >= 2 * day && diff < 7 * day) return `${Math.floor(diff / day)}일 전`;

        return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    }

    function buildChatHref(chat) {
        const storyId = chat?.story?._id;
        const chatId = chat?._id;
        if (!storyId || !chatId) return '';
        return `/stories/${storyId}/episodes/${chatId}`;
    }

    function mapArchiveChat(folder, chat, source = 'archive') {
        const href = buildChatHref(chat);
        if (!href) return null;

        const title = cleanText(chat?.title || chat?.story?.name || '제목 없음');
        const isRoot = source === 'root';

        return {
            source,
            folderId: isRoot ? '__root__' : (folder?._id || ''),
            folderName: isRoot ? '채팅 목록' : (folder?.name || '보관함'),
            chatId: chat?._id || '',
            storyId: chat?.story?._id || '',
            title,
            // 최근 메시지는 미리보기로만 표시하며 제목 검색 조건에는 포함하지 않는다.
            lastMessage: cleanText(chat?.lastMessage || ''),
            storyName: cleanText(chat?.story?.name || ''),
            updatedAt: chat?.messagedAt || chat?.updatedAt || chat?.pinnedAt || chat?.createdAt || '',
            imageUrl: getBestImage(chat),
            href
        };
    }

    function getNextCursor(data) {
        if (!data || typeof data !== 'object') return null;
        return data.nextCursor || data.cursor || data.next || data.pageInfo?.nextCursor || data.pagination?.nextCursor || null;
    }

    function makeApiUrl(path, params = {}) {
        const url = new URL(path, CRACK_API_BASE);
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });
        return url.toString();
    }

    async function fetchCrackJson(path, params = {}) {
        return requestCrackJson(path, { params });
    }
    async function requestCrackJson(path, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const url = makeApiUrl(path, options.params || {});
        const hasBody = options.body !== undefined;
        const headers = { accept: 'application/json', ...getAuthHeaderOnly() };
        if (hasBody) headers['content-type'] = 'application/json';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), method === 'GET' ? 20000 : 60000);
        try {
            const response = await fetch(url, {
                method, mode: 'cors', credentials: 'include', headers, signal: controller.signal,
                ...(hasBody ? { body: JSON.stringify(options.body) } : {})
            });
            let json = null;
            try { json = await response.json(); } catch {}
            if (!response.ok) {
                const error = new Error(`API ${response.status}: ${path}`);
                error.status = response.status;
                error.url = url;
                error.detail = json?.message || json?.error || '';
                throw error;
            }
            if (response.status === 204 && method !== 'GET') return { result: 'SUCCESS' };
            if (!json || typeof json !== 'object' || json.success === false || /^(?:FAIL|FAILED|FAILURE|ERROR)$/i.test(json.result || '')) {
                throw new Error(`API_INVALID_RESPONSE: ${path}`);
            }
            if (method === 'GET' && (
                (path === '/crack-gen/v3/chats' && !Array.isArray(json.data?.chats)) ||
                (path === '/crack-gen/chat-folders' && !Array.isArray(json.data?.folders))
            )) throw new Error(`API_INVALID_LIST: ${path}`);
            return json;
        } finally {
            clearTimeout(timeout);
        }
    }
    async function fetchSmartExistingFolders() {
        const folders = [];
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;

        do {
            const params = { limit: API_PAGE_LIMIT };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/chat-folders', params);
            const data = json?.data || {};
            const list = Array.isArray(data.folders) ? data.folders : [];
            folders.push(...list.filter(folder => folder?._id));

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 50);

        if (cursor) throw new Error('보관함 목록이 너무 많아 전부 불러오지 못했습니다.');
        return folders;
    }

    async function fetchSmartPreviewGroups(previewId) {
        const groups = [];
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;

        do {
            const params = {
                previewId,
                limit: API_PAGE_LIMIT
            };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/chat-folders/auto-organize/preview', params);
            const data = json?.data || {};
            const list = Array.isArray(data.folders) ? data.folders : [];
            groups.push(...list);

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 50);

        if (cursor) throw new Error('자동 정리 후보가 너무 많아 전부 불러오지 못했습니다.');
        return groups;
    }

    async function fetchSmartPreviewChatIds(previewId, storyId) {
        const chatIds = [];
        const seen = new Set();
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;

        do {
            const params = {
                previewId,
                storyId,
                limit: API_PAGE_LIMIT
            };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/chat-folders/auto-organize/preview', params);
            const data = json?.data || {};
            const chats = Array.isArray(data.chats) ? data.chats : [];

            for (const chat of chats) {
                const chatId = chat?._id;
                if (!chatId || seen.has(chatId)) continue;
                seen.add(chatId);
                chatIds.push(chatId);
            }

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 80);

        if (cursor) throw new Error('정리할 채팅을 전부 불러오지 못했습니다.');
        return chatIds;
    }

    async function fetchSmartAllChats() {
        const chats = [];
        const seen = new Set();
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;

        do {
            const params = { limit: API_PAGE_LIMIT };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/v3/chats', params);
            const data = json?.data || {};
            const list = Array.isArray(data.chats) ? data.chats : [];

            for (const chat of list) {
                const chatId = chat?._id;
                if (!chatId || seen.has(chatId)) continue;
                seen.add(chatId);
                chats.push(chat);
            }

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 80);

        if (cursor) throw new Error('전체 채팅을 전부 불러오지 못했습니다.');
        rememberSmartStoryImages(chats);
        return chats;
    }

    async function fetchSmartFolderChatIds(folder) {
        const chatIds = [];
        const seen = new Set();
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;

        do {
            const params = {
                folderId: folder._id,
                limit: API_PAGE_LIMIT
            };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/v3/chats', params);
            const data = json?.data || {};
            const chats = Array.isArray(data.chats) ? data.chats : [];

            for (const chat of chats) {
                const chatId = chat?._id;
                if (!chatId || seen.has(chatId)) continue;
                seen.add(chatId);
                chatIds.push(chatId);
            }

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 80);

        if (cursor) throw new Error(`${cleanText(folder?.name || '보관함')} 내부 채팅을 전부 불러오지 못했습니다.`);
        return chatIds;
    }

    async function fetchSmartArchivedChatIds(existingFolders, onProgress) {
        const folders = existingFolders.filter(folder => folder?._id);
        const pages = await mapSmartWithConcurrency(
            folders,
            SMART_ORGANIZE_LOAD_CONCURRENCY,
            folder => fetchSmartFolderChatIds(folder),
            onProgress
        );

        const archivedChatIds = new Set();
        pages.forEach(chatIds => chatIds.forEach(chatId => archivedChatIds.add(chatId)));
        return archivedChatIds;
    }

    async function fetchSmartRootChats(existingFolders, onProgress) {
        // folderId 없는 호출은 보관함 채팅까지 포함한 전체 목록이다.
        // 모든 실제 보관함의 chatId를 빼면 순정 자동 정리와 무관한 미보관 목록만 남는다.
        const [allChats, archivedChatIds] = await Promise.all([
            fetchSmartAllChats(),
            fetchSmartArchivedChatIds(existingFolders, onProgress)
        ]);
        return allChats.filter(chat => chat?._id && !archivedChatIds.has(chat._id));
    }

    async function fetchSmartSingletonGroups(existingFolders, previewGroups, onProgress) {
        const rootChats = await fetchSmartRootChats(existingFolders, onProgress);
        if (!rootChats.length) return [];
        return buildSmartSingletonGroups(rootChats, existingFolders, previewGroups);
    }

    async function moveSmartChatsToFolder(chatIds, targetFolderId) {
        return requestCrackJson('/crack-gen/chat-folders/chats/move', {
            method: 'PATCH',
            body: {
                chatIds,
                targetFolderId
            }
        });
    }

    async function createSmartFolderWithChats(name, chatIds) {
        return requestCrackJson('/crack-gen/chat-folders', {
            method: 'POST',
            body: {
                name,
                chatIds
            }
        });
    }

    function loadArchiveSearchCache() {
        try {
            const raw = localStorage.getItem(ARCHIVE_SEARCH_CACHE_KEY);
            if (!raw) return false;

            const cached = JSON.parse(raw);
            if (!cached || !Array.isArray(cached.items)) return false;

            archiveSearchState.items = cached.items;
            archiveSearchState.savedAt = Number(cached.savedAt || 0);
            archiveSearchState.loadedChats = archiveSearchState.items.length;
            archiveSearchState.partial = !!cached.partial;
            // v1.0.15 이전 캐시는 totalRootChats에 전체 채팅 수가 들어 있어 재사용하면 안 된다.
            if (cached.countMode === 'root-minus-archive-v1') {
                const cachedArchiveCount = Number(cached.totalArchiveChats);
                const cachedRootCount = Number(cached.totalRootChats);
                const cachedAllCount = Number(cached.totalAllChats);
                if (Number.isFinite(cachedArchiveCount) && cachedArchiveCount >= 0) archiveSearchState.totalArchiveChats = cachedArchiveCount;
                if (Number.isFinite(cachedRootCount) && cachedRootCount >= 0) archiveSearchState.totalRootChats = cachedRootCount;
                if (Number.isFinite(cachedAllCount) && cachedAllCount >= 0) archiveSearchState.totalAllChats = cachedAllCount;
                if (Number.isFinite(archiveSearchState.totalArchiveChats) && Number.isFinite(archiveSearchState.totalRootChats)) {
                    archiveSearchState.countStatus = 'ready';
                }
            }
            archiveSearchState.status = 'ready';
            updateChatCountBadges();

            return true;
        } catch (error) {
            console.warn('[Crack UI] 보관함 검색 캐시 읽기 실패:', error);
            return false;
        }
    }

    function isArchiveSearchCacheFresh() {
        return archiveSearchState.items.length > 0 &&
            archiveSearchState.savedAt > 0 &&
            Date.now() - archiveSearchState.savedAt < ARCHIVE_SEARCH_CACHE_TTL;
    }

    function saveArchiveSearchCache() {
        try {
            localStorage.setItem(ARCHIVE_SEARCH_CACHE_KEY, JSON.stringify({
                savedAt: Date.now(),
                partial: archiveSearchState.partial,
                countMode: 'root-minus-archive-v1',
                totalArchiveChats: archiveSearchState.totalArchiveChats,
                totalRootChats: archiveSearchState.totalRootChats,
                totalAllChats: archiveSearchState.totalAllChats,
                items: archiveSearchState.items
            }));
        } catch (error) {
            console.warn('[Crack UI] 보관함 검색 캐시 저장 실패:', error);
        }
    }

    let archiveFoldersInFlight = null;

    let rootChatsInFlight = null;
    async function fetchRootChats() {
        if (rootChatsInFlight) return rootChatsInFlight;
        rootChatsInFlight = fetchRootChatsUnshared();
        try { return await rootChatsInFlight; }
        finally { rootChatsInFlight = null; }
    }

    async function fetchRootChatsUnshared() {
        const items = [];
        const seen = new Set();
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;
        let truncated = false;

        do {
            const params = { limit: API_PAGE_LIMIT };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/v3/chats', params);
            const data = json?.data || {};
            const chats = Array.isArray(data.chats) ? data.chats : [];

            for (const chat of chats) {
                const mapped = mapArchiveChat(null, chat, 'root');
                if (!mapped || seen.has(mapped.chatId)) continue;
                seen.add(mapped.chatId);
                items.push(mapped);
                if (items.length >= MAX_ARCHIVE_CHATS) {
                    truncated = true;
                    break;
                }
            }

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 80 && !truncated);

        return {
            items,
            totalCount: items.length,
            truncated: truncated || !!cursor
        };
    }

    async function fetchAllFolders() {
        if (archiveFoldersInFlight) return archiveFoldersInFlight;

        archiveFoldersInFlight = (async () => {
            const folders = [];
            const seenPageCursors = new Set();
            let cursor = null;
            let page = 0;
            let truncated = false;
            let totalChatCount = 0;

            do {
                const params = { limit: API_PAGE_LIMIT };
                if (cursor) params.cursor = cursor;

                const json = await fetchCrackJson('/crack-gen/chat-folders', params);
                const data = json?.data || {};
                const list = Array.isArray(data.folders) ? data.folders : [];

                // 검색 인덱스에 쓸 폴더는 기존 제한까지만 보관하되,
                // 전체 채팅 수는 모든 페이지의 chatCount를 끝까지 합산한다.
                totalChatCount += list.reduce(
                    (sum, folder) => sum + Math.max(0, Number(folder?.chatCount || 0)),
                    0
                );

                if (folders.length + list.length > MAX_ARCHIVE_FOLDERS) truncated = true;
                if (folders.length < MAX_ARCHIVE_FOLDERS) {
                    folders.push(...list.slice(0, MAX_ARCHIVE_FOLDERS - folders.length));
                }

                cursor = getNextCursor(data);
                if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
                if (cursor) seenPageCursors.add(String(cursor));
                page += 1;

                if (folders.length >= MAX_ARCHIVE_FOLDERS && cursor) {
                    truncated = true;
                }
            } while (cursor && page < 30);

            if (cursor) truncated = true;

            return {
                folders,
                totalChatCount,
                countComplete: !cursor,
                truncated
            };
        })();

        try {
            return await archiveFoldersInFlight;
        } finally {
            archiveFoldersInFlight = null;
        }
    }

    async function ensureArchiveCount(force = false) {
        if (document.hidden || !getListScope() || Date.now() < countRetryAt) return;
        if (archiveSearchState.countStatus === 'loading') {
            // 이동 직전 시작된 집계가 낡은 값으로 끝나더라도, 완료 직후 반드시 한 번 더 읽는다.
            if (force) archiveCountRefreshPending = true;
            return;
        }

        const fresh = archiveSearchState.countUpdatedAt && Date.now() - archiveSearchState.countUpdatedAt < 60000;
        const hasBothCounts = Number.isFinite(archiveSearchState.totalArchiveChats) && Number.isFinite(archiveSearchState.totalRootChats);
        if (!force && fresh && hasBothCounts) return;

        archiveSearchState.countStatus = 'loading';
        // 이미 확인된 숫자는 지우지 않는다. 재수집 중에도 기존 배지가 그대로 남는다.
        try {
            updateChatCountBadges();
            if (!hasAuthToken()) await waitForAuthToken(6000);
            if (!hasAuthToken()) throw new Error('NO_AUTH_TOKEN');

            const [folderResult, rootResult] = await Promise.all([
                fetchAllFolders(),
                fetchRootChats()
            ]);

            // 폴더 조건 없는 /v3/chats 응답은 보관함까지 포함한 전체 목록이다.
            // 따라서 화면의 "채팅 목록" 숫자는 전체에서 보관함 합계를 빼서 분리한다.
            if (rootResult.truncated || !folderResult.countComplete) throw new Error('COUNT_INCOMPLETE');
            const totalAllChats = Math.max(0, Number(rootResult.totalCount || 0));
            const totalArchiveChats = Math.max(0, Number(folderResult.totalChatCount || 0));
            archiveSearchState.totalArchiveChats = totalArchiveChats;
            archiveSearchState.totalRootChats = Math.max(0, totalAllChats - totalArchiveChats);
            archiveSearchState.totalAllChats = totalAllChats;
            archiveSearchState.countUpdatedAt = Date.now();
            archiveSearchState.countStatus = 'ready';
            countFailures = 0;
            countRetryAt = 0;
            saveArchiveSearchCache();
        } catch (error) {
            countFailures += 1;
            countRetryAt = Date.now() + Math.min(300000, 30000 * 2 ** Math.min(countFailures - 1, 4));
            const hasCachedCount = Number.isFinite(archiveSearchState.totalArchiveChats) || Number.isFinite(archiveSearchState.totalRootChats);
            archiveSearchState.countStatus = hasCachedCount ? 'ready' : 'error';
            console.warn('[Crack UI] 채팅 영역별 개수 로딩 실패:', error);
        } finally {
            updateChatCountBadges();

            if (archiveCountRefreshPending) {
                archiveCountRefreshPending = false;
                setTimeout(() => ensureArchiveCount(true), 250);
            }
        }
    }

    async function fetchFolderChats(folder) {
        const items = [];
        const seenPageCursors = new Set();
        let cursor = null;
        let page = 0;
        let truncated = false;

        do {
            if (archiveSearchState.loadedChats + items.length >= MAX_ARCHIVE_CHATS) {
                truncated = true;
                break;
            }

            const params = {
                folderId: folder._id,
                limit: API_PAGE_LIMIT
            };
            if (cursor) params.cursor = cursor;

            const json = await fetchCrackJson('/crack-gen/v3/chats', params);
            const data = json?.data || {};
            const chats = Array.isArray(data.chats) ? data.chats : [];

            for (const chat of chats) {
                const mapped = mapArchiveChat(folder, chat, 'archive');
                if (mapped) items.push(mapped);

                if (archiveSearchState.loadedChats + items.length >= MAX_ARCHIVE_CHATS) {
                    truncated = true;
                    break;
                }
            }

            cursor = getNextCursor(data);
            if (cursor && seenPageCursors.has(String(cursor))) throw new Error('API_CURSOR_LOOP');
            if (cursor) seenPageCursors.add(String(cursor));
            page += 1;
        } while (cursor && page < 80 && !truncated);

        return {
            items,
            truncated: truncated || !!cursor
        };
    }

    async function buildArchiveSearchIndex() {
        // 이미 화면에 쓸 수 있는 목록이 있으면, 재인덱싱 도중에는 items를 갈아끼우지 않는다.
        // 중간중간 교체하면 검색 결과 카드가 사라졌다 나타나며 깜빡인다.
        const keepExistingUntilDone = archiveSearchState.items.length > 0;

        archiveSearchState.status = 'indexing';
        archiveSearchState.started = true;
        archiveSearchState.lastError = '';
        archiveSearchState.loadedFolders = 0;
        archiveSearchState.totalFolders = 0;
        archiveSearchState.loadedChats = archiveSearchState.items.length;
        archiveSearchState.partial = false;
        archiveSearchState.lastRenderKey = '';
        scheduleArchiveSearchRender();

        if (!hasAuthToken()) await waitForAuthToken(6000);

        if (!hasAuthToken()) {
            const error = new Error('NO_AUTH_TOKEN');
            error.status = 401;
            throw error;
        }

        const allItems = [];
        let totalAllChatsFromRoot = null;

        // 폴더 조건 없는 일반 호출은 보관함까지 포함한 전체 채팅을 반환한다.
        // 검색 인덱스에는 그대로 넣되, 표시용 채팅 목록 개수는 폴더 합계를 받은 뒤 계산한다.
        try {
            const rootResult = await fetchRootChats();
            allItems.push(...rootResult.items);
            archiveSearchState.partial = archiveSearchState.partial || rootResult.truncated;
            totalAllChatsFromRoot = Math.max(0, Number(rootResult.totalCount || 0));
            archiveSearchState.loadedChats = Math.min(allItems.length, MAX_ARCHIVE_CHATS);

            if (!keepExistingUntilDone) {
                archiveSearchState.items = allItems.slice(0, MAX_ARCHIVE_CHATS);
                archiveSearchState.lastRenderKey = '';
            }
            scheduleArchiveSearchRender();
        } catch (error) {
            if ([401, 403, 429].includes(error?.status)) throw error;
            archiveSearchState.partial = true;
            console.warn('[Crack UI] 일반 채팅 목록 로딩 실패:', error);
        }

        // 보관함 목록 및 내부 채팅 인덱싱
        const folderResult = await fetchAllFolders();
        const folders = folderResult.folders.filter(folder => folder && folder._id && Number(folder.chatCount || 0) > 0);

        const totalArchiveChats = Math.max(0, Number(folderResult.totalChatCount || 0));
        const totalAllChats = Number.isFinite(totalAllChatsFromRoot)
            ? totalAllChatsFromRoot
            : Math.max(0, Number(archiveSearchState.totalAllChats || 0));
        if (Number.isFinite(totalAllChatsFromRoot) && !archiveSearchState.partial && folderResult.countComplete) {
        archiveSearchState.totalArchiveChats = totalArchiveChats;
        archiveSearchState.totalRootChats = Math.max(0, totalAllChats - totalArchiveChats);
        archiveSearchState.totalAllChats = totalAllChats;
        archiveSearchState.countUpdatedAt = Date.now();
        archiveSearchState.countStatus = 'ready';
        updateChatCountBadges();
        }

        archiveSearchState.totalFolders = folders.length;
        archiveSearchState.partial = archiveSearchState.partial || folderResult.truncated;
        archiveSearchState.loadedFolders = 0;
        archiveSearchState.lastRenderKey = '';
        scheduleArchiveSearchRender();

        let cursor = 0;

        async function worker() {
            while (cursor < folders.length && allItems.length < MAX_ARCHIVE_CHATS) {
                const folder = folders[cursor++];

                try {
                    const result = await fetchFolderChats(folder);
                    allItems.push(...result.items);
                    archiveSearchState.partial = archiveSearchState.partial || result.truncated;
                } catch (error) {
                    if ([401, 403, 429].includes(error?.status)) throw error;
                    archiveSearchState.partial = true;
                    console.warn('[Crack UI] 보관함 내부 채팅 로딩 실패:', folder?.name, error);
                } finally {
                    archiveSearchState.loadedFolders += 1;
                    archiveSearchState.loadedChats = Math.min(allItems.length, MAX_ARCHIVE_CHATS);

                    if (!keepExistingUntilDone) {
                        archiveSearchState.items = allItems.slice(0, MAX_ARCHIVE_CHATS);
                        archiveSearchState.lastRenderKey = '';
                    }

                    scheduleArchiveSearchRender();
                    await delay(40);
                }
            }
        }

        const workers = Array.from({ length: Math.min(API_CONCURRENCY, Math.max(1, folders.length)) }, () => worker());
        await Promise.all(workers);

        // 같은 채팅이 여러 경로로 잡혔을 때 중복 제거.
        // 같은 chatId가 일반 목록과 보관함 내부에 모두 있으면 보관함 내부 쪽을 우선한다.
        const unique = new Map();
        for (const item of allItems) {
            const prev = unique.get(item.chatId);
            if (!prev || (prev.source === 'root' && item.source === 'archive')) {
                unique.set(item.chatId, item);
            }
        }

        archiveSearchState.items = Array.from(unique.values()).slice(0, MAX_ARCHIVE_CHATS);
        archiveSearchState.loadedChats = archiveSearchState.items.length;
        archiveSearchState.status = 'ready';
        archiveSearchState.refreshedThisPage = true;
        archiveSearchState.savedAt = Date.now();
        archiveSearchState.inFlight = null;
        archiveSearchState.lastRenderKey = '';
        saveArchiveSearchCache();
        scheduleArchiveSearchRender();

        return archiveSearchState.items;
    }

    function ensureArchiveSearchIndex() {
        // 캐시가 있어도 페이지당 한 번은 뒤에서 새로 긁어온다.
        if (isArchiveSearchCacheFresh() && archiveSearchState.refreshedThisPage) {
            return Promise.resolve(archiveSearchState.items);
        }
        if (archiveSearchState.inFlight) return archiveSearchState.inFlight;

        // 인덱싱이 실패한 직후에는 잠깐 쉬어간다.
        // 실패할 때마다 글자 하나 칠 때마다 전체 재수집이 돌면서 결과가 깜빡이는 문제를 막는다.
        if (archiveSearchState.lastFailedAt && Date.now() - archiveSearchState.lastFailedAt < 15000) {
            return Promise.resolve(archiveSearchState.items);
        }

        const hadFreshCache = isArchiveSearchCacheFresh();

        archiveSearchState.inFlight = buildArchiveSearchIndex().then(items => {
            archiveSearchState.refreshedThisPage = true;
            archiveSearchState.lastFailedAt = 0;
            return items;
        }).catch(error => {
            archiveSearchState.status = archiveSearchState.items.length ? 'ready' : 'error';
            archiveSearchState.lastFailedAt = Date.now();

            if (error?.message === 'NO_AUTH_TOKEN') {
                archiveSearchState.lastError = '인증 토큰을 아직 못 잡았어. 채팅방을 아무거나 한 번 열었다 나오면 검색이 켜져.';
            } else if (error?.status === 401) {
                archiveSearchState.lastError = '인증 토큰이 거절됐어. 새로고침 후 채팅방을 한 번 열고 다시 검색해줘.';
            } else {
                archiveSearchState.lastError = String(error?.message || error);
            }

            archiveSearchState.inFlight = null;
            archiveSearchState.lastRenderKey = '';
            console.warn('[Crack UI] 보관함 검색 인덱싱 실패:', error);
            scheduleArchiveSearchRender();
            return archiveSearchState.items;
        });

        // 신선한 캐시가 있으면 기존 결과는 바로 보여주고, 새 인덱싱은 뒤에서 갱신한다.
        if (hadFreshCache) return Promise.resolve(archiveSearchState.items);
        return archiveSearchState.inFlight;
    }

    function getCurrentSearchQuery() {
        const input = document.querySelector('.crack-search-input');

        // 여기서는 절대 input.value를 되돌려 쓰지 않는다. 복구는 syncSearchInputFromState 전담.
        if (input && !isSearchComposing && input === lastSearchInputEl) {
            currentSearchQueryRaw = input.value || '';
        }

        return normalizeSearchText(currentSearchQueryRaw);
    }

    function scheduleArchiveSearchRender() {
        if (archiveSearchRenderRaf) return;

        archiveSearchRenderRaf = requestAnimationFrame(() => {
            archiveSearchRenderRaf = 0;
            renderArchiveSearchResults(getCurrentSearchQuery());
        });
    }

    function getArchiveSearchMatches(query) {
        if (!query) return [];

        const matches = [];
        const seen = new Set();

        for (const item of archiveSearchState.items) {
            if (!item || seen.has(item.chatId)) continue;

            // 검색 기준: 채팅방 제목 + 스토리(캐릭터)명
            const haystack = `${item.title || ''} ${item.storyName || ''}`;
            if (textMatchesQuery(haystack, query)) {
                seen.add(item.chatId);
                matches.push(item);
                if (matches.length >= MAX_ARCHIVE_RESULTS) break;
            }
        }

        return matches;
    }

    // 상태 문구가 인덱싱 진행에 맞춰 0.1초마다 바뀌면 글자 길이가 계속 달라져 깜빡이는 것처럼 보인다.
    // 같은 문구는 무시하고, 갱신도 최소 간격을 둔다.
    const STATUS_UPDATE_MIN_INTERVAL = 600;
    let lastStatusText = '';
    let lastStatusAt = 0;
    let statusPendingTimer = null;

    function setStatusText(message, visible = true) {
        const { status } = getSearchOverlayParts();
        if (!status) return;

        const text = message || '';

        const apply = () => {
            statusPendingTimer = null;
            lastStatusText = text;
            lastStatusAt = Date.now();
            status.textContent = text;
            status.classList.toggle('visible', !!visible && !!text);
        };

        // 검색어를 지운 경우(빈 문구)는 즉시 반영한다.
        if (!text) {
            clearTimeout(statusPendingTimer);
            statusPendingTimer = null;
            apply();
            return;
        }

        if (text === lastStatusText) {
            status.classList.toggle('visible', !!visible);
            return;
        }

        const remain = STATUS_UPDATE_MIN_INTERVAL - (Date.now() - lastStatusAt);
        clearTimeout(statusPendingTimer);

        if (remain <= 0) {
            apply();
        } else {
            statusPendingTimer = setTimeout(apply, remain);
        }
    }

    function renderArchiveSearchResults(query) {
        const { overlay, results: resultsBox, status: statusBox } = getSearchOverlayParts();
        if (!overlay || !resultsBox || !statusBox) return;

        const normalizedQuery = normalizeSearchText(query);

        if (!normalizedQuery) {
            archiveSearchState.lastRenderKey = '';
            archiveSearchState.lastResultKey = '';
            resultsBox.classList.remove('visible');
            resultsBox.replaceChildren();
            setStatusText('', false);
            setSearchOverlayActive(false);
            cleanupLegacySearchModeArtifacts();
            return;
        }

        setSearchOverlayActive(true);

        const matches = getArchiveSearchMatches(normalizedQuery);
        const rootMatches = matches.filter(item => item.source === 'root');
        const archiveMatches = matches.filter(item => item.source !== 'root');

        // 상태 문구는 매 렌더마다 갱신하되, 결과 카드 DOM 재생성 조건과 분리한다.
        // 인덱싱 진행 숫자만 바뀔 때 카드 전체가 replaceChildren() 되며 깜빡이는 문제를 막기 위함.
        let statusText = '';
        if (archiveSearchState.status === 'indexing') {
            // 진행 숫자를 실시간으로 찍지 않는다. 문구가 고정되어야 깜빡임이 없다.
            statusText = archiveSearchState.items.length
                ? '검색 결과 갱신 중'
                : '검색 목록 준비 중';
        } else if (archiveSearchState.status === 'ready') {
            const suffix = archiveSearchState.partial ? ' · 최대 수집 한도 적용' : '';
            statusText = `${archiveSearchState.loadedChats.toLocaleString()}개 채팅에서 검색${suffix}`;
        } else if (archiveSearchState.status === 'error') {
            statusText = archiveSearchState.items.length
                ? `${archiveSearchState.loadedChats.toLocaleString()}개 캐시에서 검색 · 최신화 실패`
                : `검색 준비 실패: ${archiveSearchState.lastError || '알 수 없는 오류'}`;
        } else {
            statusText = '검색 목록 준비 중';
        }

        setStatusText(statusText, true);

        // 결과 카드는 실제 매치 목록이 바뀔 때만 다시 그린다.
        // loadedFolders/loadedChats 같은 진행 상태는 resultKey에 넣지 않는다.
        const resultKey = JSON.stringify([normalizedQuery, matches.map(item => [item.source, item.chatId, item.title, item.lastMessage, item.imageUrl, item.folderName, item.updatedAt])]);
        if (archiveSearchState.lastResultKey === resultKey) return;
        archiveSearchState.lastResultKey = resultKey;

        resultsBox.replaceChildren();

        if (matches.length === 0) {
            resultsBox.classList.remove('visible');
            return;
        }

        function appendGroup(label, items) {
            if (!items.length) return;

            const header = document.createElement('div');
            header.className = 'crack-api-result-header';
            header.textContent = `${label} ${items.length}개`;
            resultsBox.appendChild(header);

            items.forEach(item => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'crack-api-result-item';
                btn.title = `${item.folderName} / ${item.title}`;
                btn.addEventListener('click', () => {
                    if (item.href) location.href = item.href;
                });

                const thumb = document.createElement('span');
                thumb.className = 'crack-api-result-thumb';
                if (item.imageUrl) {
                    const img = document.createElement('img');
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    img.src = item.imageUrl;
                    thumb.appendChild(img);
                }

                const main = document.createElement('span');
                main.className = 'crack-api-result-main';

                const title = document.createElement('span');
                title.className = 'crack-api-result-title';
                title.textContent = item.title || '제목 없음';

                const meta = document.createElement('span');
                meta.className = 'crack-api-result-meta';
                if (item.source === 'root') {
                    meta.textContent = `채팅 목록${item.updatedAt ? ' · ' + formatArchiveDate(item.updatedAt) : ''}`;
                } else {
                    meta.textContent = `${item.folderName || '보관함'}${item.updatedAt ? ' · ' + formatArchiveDate(item.updatedAt) : ''}`;
                }

                main.appendChild(title);
                if (item.lastMessage) {
                    const preview = document.createElement('span');
                    preview.className = 'crack-api-result-preview';
                    preview.textContent = cleanText(item.lastMessage).slice(0, 180);
                    main.appendChild(preview);
                }
                main.appendChild(meta);

                btn.appendChild(thumb);
                btn.appendChild(main);
                resultsBox.appendChild(btn);
            });
        }

        appendGroup('보관함', archiveMatches);
        appendGroup('채팅 목록', rootMatches);

        resultsBox.classList.add('visible');
    }

    function handleArchiveSearchQuery(query) {
        const normalizedQuery = normalizeSearchText(query);
        renderArchiveSearchResults(normalizedQuery);

        if (normalizedQuery) {
            ensureArchiveSearchIndex();
        }
    }

    // 검색 중에는 기존 사이드바 DOM을 숨기거나 필터링하지 않는다.
    //          검색 결과 fixed overlay만 갱신해서 타자 끊김과 레이아웃 충돌을 줄인다.
    function filterChatsAndFolders(query) {
        const normalizedQuery = normalizeSearchText(query || '');

        if (!normalizedQuery) {
            handleArchiveSearchQuery('');
            cleanupLegacySearchModeArtifacts();
            return;
        }

        handleArchiveSearchQuery(normalizedQuery);
    }

    // ── 한눈에 보기 (PC·모바일 넓은 목록) ─────────────────────────────
    // 크랙 원래 목록(Virtuoso)은 건드리지 않는다. 검색용으로 모아 둔 archiveSearchState.items로 따로 그린다.
    const LOUNGE_VIEW_KEY = 'crackTunerLoungeView_v1';
    const LOUNGE_GROUP_LIMIT = 48;
    const loungeState = {
        open: false,
        folder: 'all',
        color: '',
        query: '',
        view: 'grid',
        expanded: new Set(),
        popChatId: '',
        pollTimer: 0,
        queryTimer: 0,
        animTimer: 0,
        lastSig: ''
    };

    try {
        const savedView = localStorage.getItem(LOUNGE_VIEW_KEY);
        if (savedView === 'grid' || savedView === 'dense') loungeState.view = savedView;
    } catch (e) {}

    function getLoungeRoot() {
        return document.getElementById('crack-lounge');
    }

    function readChatColorById(chatId) {
        if (!chatId) return '';
        try {
            return localStorage.getItem(STORAGE_KEY + 'episode_' + chatId) || '';
        } catch (e) {
            return '';
        }
    }

    function getLoungeSig() {
        return `${archiveSearchState.items.length}|${archiveSearchState.status}|${archiveSearchState.savedAt}`;
    }

    function ensureLounge() {
        let root = getLoungeRoot();
        if (root) return root;

        root = document.createElement('section');
        root.id = 'crack-lounge';
        root.setAttribute('aria-label', '한눈에 보기');
        root.setAttribute('aria-hidden', 'true');
        root.inert = true;
        root.innerHTML = `
            <header class="crack-lg-top">
                <button type="button" class="crack-lg-close" aria-label="접기" title="접기 (Esc)">${CT_ICON.back}</button>
                <div class="crack-lg-heading"><strong>한눈에 보기</strong><em class="crack-lg-sub"></em></div>
                <div class="crack-lg-search">${CT_ICON.search}<input type="text" placeholder="검색" aria-label="검색"><button type="button" class="crack-lg-clear" aria-label="지우기">${CT_ICON.x}</button></div>
                <div class="crack-lg-colors" role="group" aria-label="색으로 거르기">
                    <button type="button" class="crack-lg-cf is-all" data-k="">전체</button>
                    ${Object.keys(colorValues).map(key => `<button type="button" class="crack-lg-cf" data-k="${key}" aria-label="${key}만 보기" title="${key}"></button>`).join('')}
                </div>
                <div class="crack-lg-seg" role="group" aria-label="보기 방식"><i></i><button type="button" data-view="grid">카드</button><button type="button" data-view="dense">촘촘히</button></div>
            </header>
            <div class="crack-lg-body">
                <nav class="crack-lg-rail" aria-label="보관함 고르기"></nav>
                <div class="crack-lg-scroll"><div class="crack-lg-status"></div><div class="crack-lg-groups"></div></div>
            </div>
            <div class="crack-lg-pop" role="menu" aria-label="색상"></div>
        `;

        root.addEventListener('click', onLoungeClick);
        root.addEventListener('input', onLoungeInput);
        root.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target.classList?.contains('crack-lg-tile')) {
                event.preventDefault();
                openLoungeItem(event.target);
            }
        });
        root.querySelector('.crack-lg-scroll').addEventListener('scroll', closeLoungePop, { passive: true });

        document.body.appendChild(root);
        return root;
    }

    function isMobileLounge() {
        return window.innerWidth <= 900 || (window.innerWidth <= 1100 && window.matchMedia('(pointer: coarse)').matches);
    }

    function positionLounge(root, searchContainer) {
        if (!root) return;
        const mobile = isMobileLounge();
        root.classList.toggle('is-mobile', mobile);
        if (mobile) {
            const viewport = window.visualViewport;
            root.style.left = `${viewport?.offsetLeft || 0}px`;
            root.style.top = `${viewport?.offsetTop || 0}px`;
            root.style.width = `${viewport?.width || window.innerWidth}px`;
            root.style.height = `${viewport?.height || window.innerHeight}px`;
            root.style.right = 'auto';
            root.style.bottom = 'auto';
            return;
        }
        for (const key of ['width', 'height', 'right', 'bottom']) root.style.removeProperty(key);
        if (!searchContainer) { root.style.left = '0px'; root.style.top = '0px'; return; }
        const rect = getSearchSidebarRect(searchContainer);
        root.style.left = `${Math.max(0, Math.round(rect.left))}px`;
        root.style.top = `${Math.max(0, Math.round(rect.top))}px`;
        root.style.setProperty('--crack-lg-from', `${Math.max(180, Math.round(rect.width))}px`);
    }

    function playLoungeAnim(mode) {
        const box = getLoungeRoot()?.querySelector('.crack-lg-groups');
        if (!box || !mode) return;
        box.classList.remove('is-enter', 'is-swap');
        void box.offsetWidth;
        box.classList.add(mode === 'enter' ? 'is-enter' : 'is-swap');
        clearTimeout(loungeState.animTimer);
        loungeState.animTimer = setTimeout(() => box.classList.remove('is-enter', 'is-swap'), 1400);
    }

    function makeLoungeRailButton(key, label, count, icon) {
        const button = ctEl('button', 'crack-lg-rail-btn');
        button.type = 'button';
        button.dataset.folder = key;
        button.classList.toggle('is-on', loungeState.folder === key);
        const ic = ctEl('span', 'crack-lg-rail-ic');
        ic.innerHTML = icon;
        // 채팅 목록/보관함 헤더 탐색(span 텍스트 비교)과 겹치지 않도록 span 대신 em을 쓴다.
        button.append(ic, ctEl('em', 'crack-lg-rail-name', label), ctEl('b', 'crack-lg-rail-count', count.toLocaleString()));
        return button;
    }

    function makeLoungeTile(item, index, color, themeColors, currentPath) {
        const tile = ctEl('div', 'crack-lg-tile');
        tile.setAttribute('role', 'link');
        tile.tabIndex = 0;
        tile.dataset.chatId = item.chatId || '';
        tile.dataset.href = item.href || '';
        tile.title = item.source === 'root' ? (item.title || '') : `${item.folderName || '보관함'} / ${item.title || ''}`;
        tile.style.setProperty('--i', String(Math.min(index, 30)));

        if (color && themeColors.accents?.[color]) {
            tile.dataset.color = color;
            tile.style.setProperty('--c', themeColors.accents[color]);
            tile.style.setProperty('--cbg', themeColors.backgrounds?.[color] || 'transparent');
        }
        if (item.chatId && currentPath.includes(`/episodes/${item.chatId}`)) tile.classList.add('is-current');

        const thumb = ctEl('span', 'crack-lg-thumb');
        if (item.imageUrl) {
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = '';
            img.src = item.imageUrl;
            thumb.appendChild(img);
        } else {
            thumb.textContent = (cleanText(item.title) || '?').charAt(0);
        }

        const main = ctEl('span', 'crack-lg-main');
        main.append(
            ctEl('span', 'crack-lg-title', item.title || '제목 없음'),
            ctEl('span', 'crack-lg-pv', item.lastMessage || item.storyName || '')
        );

        const more = ctEl('button', 'crack-lg-more');
        more.type = 'button';
        more.setAttribute('aria-label', '색상 바꾸기');
        more.setAttribute('aria-haspopup', 'menu');
        more.setAttribute('aria-expanded', 'false');
        more.innerHTML = CT_ICON.dots;

        tile.append(thumb, main, ctEl('span', 'crack-lg-date', formatArchiveDate(item.updatedAt)), more);
        return tile;
    }

    function renderLounge(mode) {
        const root = getLoungeRoot();
        if (!root || !loungeState.open) return;

        const items = (Array.isArray(archiveSearchState.items) ? archiveSearchState.items : []).filter(Boolean);
        const themeColors = getThemeColors();
        const colorCache = new Map();
        const colorOf = item => {
            if (!colorCache.has(item.chatId)) colorCache.set(item.chatId, readChatColorById(item.chatId));
            return colorCache.get(item.chatId);
        };
        const query = normalizeSearchText(loungeState.query);
        const pass = item =>
            (!loungeState.color || colorOf(item) === loungeState.color) &&
            (!query || textMatchesQuery(`${item.title || ''} ${item.storyName || ''}`, query));
        const byRecent = (a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));

        const rootItems = [];
        const folderMap = new Map();
        for (const item of items) {
            if (item.source === 'root') {
                rootItems.push(item);
                continue;
            }
            const key = item.folderId || item.folderName || '__archive__';
            if (!folderMap.has(key)) folderMap.set(key, { key, name: item.folderName || '보관함', items: [] });
            folderMap.get(key).items.push(item);
        }
        const folders = [...folderMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        if (!['all', '__root__'].includes(loungeState.folder) && !folderMap.has(loungeState.folder)) {
            loungeState.folder = 'all';
        }

        // 왼쪽 레일
        const rail = root.querySelector('.crack-lg-rail');
        rail.replaceChildren(
            makeLoungeRailButton('all', '전체', items.length, CT_ICON.all),
            makeLoungeRailButton('__root__', '채팅 목록', rootItems.length, CT_ICON.chat),
            ctEl('div', 'crack-lg-rail-h', '보관함'),
            ...folders.map(folder => makeLoungeRailButton(folder.key, folder.name, folder.items.length, CT_ICON.folder))
        );

        // 묶음 목록
        let groups;
        if (loungeState.folder === 'all') groups = [{ key: '__root__', name: '채팅 목록', items: rootItems }, ...folders];
        else if (loungeState.folder === '__root__') groups = [{ key: '__root__', name: '채팅 목록', items: rootItems }];
        else groups = [folderMap.get(loungeState.folder)];

        const limited = loungeState.folder === 'all';
        const currentPath = location.pathname;
        const frag = document.createDocumentFragment();
        let tileIndex = 0;
        let shown = 0;

        for (const group of groups) {
            const list = group.items.filter(pass).sort(byRecent);
            if (!list.length) continue;
            shown += list.length;

            const section = ctEl('section', 'crack-lg-group');
            const head = ctEl('div', 'crack-lg-gh');
            head.append(ctEl('strong', '', group.name), ctEl('em', '', list.length.toLocaleString()));
            const grid = ctEl('div', 'crack-lg-grid');
            const cap = limited && !loungeState.expanded.has(group.key) ? LOUNGE_GROUP_LIMIT : Infinity;
            list.slice(0, cap).forEach(item => {
                grid.appendChild(makeLoungeTile(item, tileIndex++, colorOf(item), themeColors, currentPath));
            });
            section.append(head, grid);

            if (list.length > cap) {
                const more = ctEl('button', 'crack-lg-more-btn', `${(list.length - cap).toLocaleString()}개 더 보기`);
                more.type = 'button';
                more.dataset.lgMore = group.key;
                section.appendChild(more);
            }
            frag.appendChild(section);
        }

        const filtered = loungeState.folder !== 'all' || !!loungeState.color || !!query;
        if (!shown) {
            const empty = ctEl('div', 'crack-lg-empty');
            if (!items.length) {
                empty.textContent = archiveSearchState.status === 'indexing' || archiveSearchState.status === 'idle'
                    ? '채팅 목록을 불러오는 중이에요.'
                    : '보여줄 채팅이 아직 없어요.';
            } else {
                empty.appendChild(ctEl('div', '', '조건에 맞는 채팅방이 없어요.'));
                if (filtered) {
                    const reset = ctEl('button', 'crack-smart-button small', '거르기 모두 풀기');
                    reset.type = 'button';
                    reset.dataset.lgReset = 'true';
                    empty.appendChild(reset);
                }
            }
            frag.appendChild(empty);
        }

        root.querySelector('.crack-lg-groups').replaceChildren(frag);

        // 상태 문구
        const status = root.querySelector('.crack-lg-status');
        let statusText = '';
        if (archiveSearchState.status === 'indexing') {
            statusText = items.length ? '목록을 최신으로 갱신하는 중' : '목록을 불러오는 중';
        } else if (archiveSearchState.status === 'error') {
            statusText = items.length ? '최신화 실패, 저장된 목록을 보여주는 중' : `불러오기 실패: ${archiveSearchState.lastError || '알 수 없는 오류'}`;
        } else if (archiveSearchState.partial) {
            statusText = '최대 수집 한도까지만 보여주는 중';
        }
        status.textContent = statusText;
        status.classList.toggle('is-on', !!statusText);
        status.classList.toggle('is-busy', archiveSearchState.status === 'indexing');

        root.querySelector('.crack-lg-sub').textContent = filtered
            ? `${items.length.toLocaleString()}개 중 ${shown.toLocaleString()}개`
            : `${items.length.toLocaleString()}개 채팅`;

        root.querySelectorAll('.crack-lg-cf').forEach(button => {
            const key = button.dataset.k || '';
            if (key) button.style.setProperty('--d', themeColors.accents?.[key] || colorValues[key]);
            button.classList.toggle('is-on', key === loungeState.color);
        });

        const seg = root.querySelector('.crack-lg-seg');
        seg.style.setProperty('--i', loungeState.view === 'dense' ? '1' : '0');
        seg.querySelectorAll('button').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.view === loungeState.view));
        });
        root.classList.toggle('is-dense', loungeState.view === 'dense');

        loungeState.lastSig = getLoungeSig();
        playLoungeAnim(mode);
    }

    function openLoungeItem(tile) {
        const href = tile?.dataset?.href;
        if (href) location.href = href;
    }

    function closeLoungePop() {
        const root = getLoungeRoot();
        if (!root) return;
        root.querySelector('.crack-lg-pop')?.classList.remove('is-open');
        root.querySelectorAll('.crack-lg-tile.is-menu').forEach(tile => tile.classList.remove('is-menu'));
        root.querySelectorAll('.crack-lg-more[aria-expanded="true"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
        loungeState.popChatId = '';
    }

    function openLoungePop(button) {
        const root = getLoungeRoot();
        const pop = root?.querySelector('.crack-lg-pop');
        const tile = button.closest('.crack-lg-tile');
        if (!pop || !tile) return;

        if (loungeState.popChatId && loungeState.popChatId === tile.dataset.chatId) {
            closeLoungePop();
            return;
        }
        closeLoungePop();
        loungeState.popChatId = tile.dataset.chatId || '';

        const current = readChatColorById(loungeState.popChatId);
        const accents = getThemeColors().accents || {};
        pop.replaceChildren(ctEl('span', 'crack-lg-pop-label', '색상'));
        Object.keys(colorValues).forEach(key => {
            const dot = ctEl('button', 'crack-lg-pop-dot');
            dot.type = 'button';
            dot.dataset.k = key;
            dot.style.setProperty('--d', accents[key] || colorValues[key]);
            dot.classList.toggle('is-on', current === key);
            dot.title = current === key ? `${key} 색상 제거` : `${key} 색상 적용`;
            dot.setAttribute('aria-label', dot.title);
            pop.appendChild(dot);
        });

        const rootRect = root.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const width = pop.offsetWidth;
        const height = pop.offsetHeight;
        let top = buttonRect.bottom - rootRect.top + 6;
        let side = 'bottom';
        if (top + height > root.clientHeight - 8) {
            top = buttonRect.top - rootRect.top - height - 6;
            side = 'top';
        }
        const left = Math.max(8, Math.min(buttonRect.right - rootRect.left - width, root.clientWidth - width - 8));
        pop.dataset.side = side;
        pop.style.top = `${Math.max(8, top)}px`;
        pop.style.left = `${left}px`;

        tile.classList.add('is-menu');
        button.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => pop.classList.add('is-open'));
    }

    function onLoungeClick(event) {
        const target = event.target;
        let el;

        if ((el = target.closest('.crack-lg-pop-dot'))) {
            const chatId = loungeState.popChatId;
            if (chatId) {
                const key = el.dataset.k;
                const current = readChatColorById(chatId);
                saveColor('episode_' + chatId, key && current !== key ? key : null);
            }
            const root = getLoungeRoot();
            const chosen = readChatColorById(chatId);
            const tile = root?.querySelector('.crack-lg-tile.is-menu');
            if (tile) {
                const colors = getThemeColors();
                if (chosen) tile.dataset.color = chosen;
                else delete tile.dataset.color;
                tile.style.setProperty('--c', colors.accents?.[chosen] || 'transparent');
                tile.style.setProperty('--cbg', colors.backgrounds?.[chosen] || 'transparent');
            }
            root?.querySelectorAll('.crack-lg-pop-dot').forEach(dot => {
                const selected = dot.dataset.k === chosen;
                dot.classList.toggle('is-on', selected);
                dot.setAttribute('aria-pressed', String(selected));
            });
            loungeState.lastSig = ''; // Reconcile filters after the palette closes.
            return;
        }
        if ((el = target.closest('.crack-lg-more'))) {
            event.stopPropagation();
            openLoungePop(el);
            return;
        }
        if (!target.closest('.crack-lg-pop')) closeLoungePop();

        if (target.closest('.crack-lg-close')) {
            closeLounge();
            return;
        }
        if ((el = target.closest('.crack-lg-clear'))) {
            const input = getLoungeRoot()?.querySelector('.crack-lg-search input');
            if (input) {
                input.value = '';
                input.focus({ preventScroll: true });
            }
            el.classList.remove('is-on');
            clearTimeout(loungeState.queryTimer);
            loungeState.query = '';
            renderLounge('swap');
            return;
        }
        if ((el = target.closest('.crack-lg-cf'))) {
            const key = el.dataset.k || '';
            loungeState.color = key && loungeState.color !== key ? key : '';
            renderLounge('swap');
            return;
        }
        if ((el = target.closest('.crack-lg-seg button'))) {
            const view = el.dataset.view === 'dense' ? 'dense' : 'grid';
            if (view !== loungeState.view) {
                loungeState.view = view;
                try { localStorage.setItem(LOUNGE_VIEW_KEY, view); } catch (e) {}
                renderLounge('swap');
            }
            return;
        }
        if ((el = target.closest('.crack-lg-rail-btn'))) {
            loungeState.folder = el.dataset.folder || 'all';
            const scroller = getLoungeRoot()?.querySelector('.crack-lg-scroll');
            if (scroller) scroller.scrollTop = 0;
            renderLounge('swap');
            return;
        }
        if ((el = target.closest('[data-lg-more]'))) {
            loungeState.expanded.add(el.dataset.lgMore);
            renderLounge();
            return;
        }
        if (target.closest('[data-lg-reset]')) {
            loungeState.folder = 'all';
            loungeState.color = '';
            loungeState.query = '';
            const input = getLoungeRoot()?.querySelector('.crack-lg-search input');
            if (input) input.value = '';
            getLoungeRoot()?.querySelector('.crack-lg-clear')?.classList.remove('is-on');
            renderLounge('swap');
            return;
        }
        if ((el = target.closest('.crack-lg-tile'))) {
            openLoungeItem(el);
        }
    }

    function onLoungeInput(event) {
        const input = event.target.closest?.('.crack-lg-search input');
        if (!input) return;
        input.closest('.crack-lg-search')?.querySelector('.crack-lg-clear')?.classList.toggle('is-on', !!input.value.trim());
        clearTimeout(loungeState.queryTimer);
        loungeState.queryTimer = setTimeout(() => {
            loungeState.query = input.value || '';
            renderLounge();
        }, 80);
    }

    function openLounge() {
        if (loungeState.open) return;
        const searchContainer = document.querySelector('.crack-search-container');
        if (!searchContainer) return;

        const root = ensureLounge();
        positionLounge(root, searchContainer);
        loungeState.open = true;
        root.inert = false;
        root.setAttribute('aria-hidden', 'false');
        document.querySelectorAll('.crack-lounge-btn').forEach(button => button.setAttribute('aria-expanded', 'true'));

        renderLounge();
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!loungeState.open) return;
            root.classList.add('is-open');
            playLoungeAnim('enter');
        }));

        // 목록이 비었거나 오래됐으면 뒤에서 새로 모으고, 끝나면 다시 그린다.
        ensureArchiveSearchIndex();
        const inFlight = archiveSearchState.inFlight;
        if (inFlight) inFlight.then(() => renderLounge()).catch(() => {});

        clearInterval(loungeState.pollTimer);
        loungeState.pollTimer = setInterval(() => {
            if (!loungeState.open || loungeState.popChatId) return;
            if (getLoungeSig() !== loungeState.lastSig) renderLounge();
        }, 900);

        setTimeout(() => {
            if (loungeState.open) root.querySelector(isMobileLounge() ? '.crack-lg-close' : '.crack-lg-search input')?.focus({ preventScroll: true });
        }, 380);
    }

    function closeLounge() {
        if (!loungeState.open) return;
        const root = getLoungeRoot();
        const hadFocus = !!root?.contains(document.activeElement);

        loungeState.open = false;
        clearInterval(loungeState.pollTimer);
        loungeState.pollTimer = 0;
        closeLoungePop();
        root?.classList.remove('is-open');
        document.querySelectorAll('.crack-lounge-btn').forEach(button => button.setAttribute('aria-expanded', 'false'));
        if (hadFocus) {
            document.activeElement?.blur();
            document.querySelector('.crack-lounge-btn')?.focus({ preventScroll: true });
        }
        if (root) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest?.('.crack-lounge-btn');
        if (!button) return;
        event.preventDefault();
        if (loungeState.open) closeLounge();
        else openLounge();
    });

    document.addEventListener('pointerdown', event => {
        if (loungeState.popChatId && !event.target.closest?.('.crack-lg-pop, .crack-lg-more')) closeLoungePop();
    }, true);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !loungeState.open || smartOrganizeState.open) return;
        if (event.isComposing) return;
        if (loungeState.popChatId) {
            closeLoungePop();
            return;
        }
        closeLounge();
    });

    window.addEventListener('resize', () => {
        if (!loungeState.open) return;
        closeLoungePop();
        positionLounge(getLoungeRoot(), document.querySelector('.crack-search-container'));
    }, { passive: true });

    let loungeViewportFrame = 0;
    function updateLoungeViewport() {
        if (!loungeState.open || loungeViewportFrame) return;
        loungeViewportFrame = requestAnimationFrame(() => {
            loungeViewportFrame = 0;
            if (!loungeState.open) return;
            closeLoungePop();
            positionLounge(getLoungeRoot(), document.querySelector('.crack-search-container'));
        });
    }
    window.visualViewport?.addEventListener('resize', updateLoungeViewport, { passive: true });
    window.visualViewport?.addEventListener('scroll', updateLoungeViewport, { passive: true });

    function refreshChatItem(container) {
        const id = getChatId(container);
        if (!id) return;

        container.classList.add('crack-chat-item');
        container.dataset.crackChatId = id;

        let saved = null;
        try {
            saved = localStorage.getItem(STORAGE_KEY + id);
        } catch (e) {
            console.warn("[Crack UI] LocalStorage 읽기 실패:", e);
        }

        const current = isCurrentChat(container);
        const theme = document.body.getAttribute('data-theme') || 'dark';
        const visualKey = `${id}|${saved || ''}|${current ? '1' : '0'}|${theme}`;

        if (chatVisualCache.get(container) !== visualKey) {
            applyVisualColor(container, saved || null);
            markCurrentChat(container);
            chatVisualCache.set(container, visualKey);
        }

        setupMarquee(container);
    }

    // 핵심 통합 UI 리프레시 엔진 (React 렌더링 동시성 제어)
    function updateUI() {
        if (isUpdatingUI || !tunerUiStarted) return;
        if (!findArchiveHeaderSpan() && !findChatListHeaderSpan()) return;

        // 열린 Radix 메뉴의 포커스/선택 수명주기를 보존한다.
        // 메뉴가 닫힌 뒤 실제 목록 변화가 생기면 MutationObserver가 다시 갱신한다.
        if (isChatMenuOpen()) return;

        isUpdatingUI = true;

        try {
            // 1. 검색창 및 보관함/채팅 목록 개수 주입
            injectSearchBar();
            ensureArchiveCount();
            scheduleSearchOverlayPositionUpdate();

            // 2. 채팅방/보관함 컬러 세팅 및 커스텀 UI 적용
            getChatContainers().forEach(refreshChatItem);

            // 3. 보관함 높이 리사이저 핸들 세팅
            setupResizer();

            // 4. 검색 필터 유지 보완
            const searchInput = document.querySelector('.crack-search-input');
            if (searchInput) {
                syncSearchInputFromState(searchInput, document.querySelector('.crack-search-clear'));
                const query = getCurrentSearchQuery();

                // 검색 중 MutationObserver가 계속 updateUI를 부르며 타자를 끊지 않도록,
                // 실제 검색 적용은 입력 디바운스 타이머에 맡긴다.
                if (!query) {
                    filterChatsAndFolders('');
                } else if (!searchDebounceTimer) {
                    scheduleSearchQueryApply(SEARCH_DEBOUNCE_MS);
                }
            }
        } catch (error) {
            console.error("[Crack UI] updateUI 과정 중 오류 발생:", error);
        } finally {
            isUpdatingUI = false;
        }
    }

    function scheduleUpdate() {
        if (updateTimer) return;
        updateTimer = setTimeout(() => { updateTimer = null; updateUI(); }, 80);
    }

    function setupResizer() {
        const { divider, archiveContainer } = getArchivePartsCached();
        if (!divider || !archiveContainer) return;

        // 매번 빠르게 재적용한다. divider가 이미 핸들 처리되어 있어도 새 컨테이너가 생길 수 있다.
        const savedHeight = readSavedArchiveHeight() || ARCHIVE_HEIGHT_DEFAULT;
        applyArchiveScrollBox(archiveContainer, savedHeight);

        if (divider.classList.contains('crack-resizer-handle')) return;

        divider.classList.add('crack-resizer-handle');

        divider.addEventListener('mousedown', e => {
            e.preventDefault();

            const liveContainer = isLiveArchiveContainer(cachedArchiveContainer)
                ? cachedArchiveContainer
                : getArchivePartsCached().archiveContainer;
            if (!liveContainer) return;

            const startY = e.clientY;
            const startH = Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--crack-archive-h'), 10) ||
                liveContainer.offsetHeight ||
                ARCHIVE_HEIGHT_DEFAULT;

            const onMouseMove = ev => {
                const newH = Math.max(ARCHIVE_HEIGHT_MIN, startH + (ev.clientY - startY));
                setArchiveHeightValue(newH);
                applyArchiveScrollBox(liveContainer, newH);
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove, true);
                document.removeEventListener('mouseup', onMouseUp, true);
            };

            document.addEventListener('mousemove', onMouseMove, true);
            document.addEventListener('mouseup', onMouseUp, true);
        }, true);
    }

    let lastKnownPathname = location.pathname;
    let countRefreshTimer = null;
    let countFollowupTimer = null;

    function scheduleCountRefresh(force = true) {
        clearTimeout(countRefreshTimer);
        clearTimeout(countFollowupTimer);

        countRefreshTimer = setTimeout(() => {
            countRefreshTimer = null;
            ensureArchiveCount(force);

            // 생성/이동 직후 서버 집계 반영이 늦는 경우를 위해 한 번 더 확인한다.
            countFollowupTimer = setTimeout(() => {
                countFollowupTimer = null;
                ensureArchiveCount(true);
            }, 2200);
        }, 700);
    }

    // 실시간 페이지 변화(DOM Mutation) 감시
    const observer = new MutationObserver(mutations => {
        let relevant = false;
        const pathnameChanged = location.pathname !== lastKnownPathname;
        if (pathnameChanged) { lastKnownPathname = location.pathname; relevant = true; }
        // Resolve cached headers once per delivery, never once per changed text node.
        const headers = [...sectionHeaderCache.values()].filter(el => el.isConnected);
        for (const mutation of mutations) {
            const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
            if (!target || target.closest(OWN_TUNER_UI + ', ' + NON_LIST_CONTENT)) continue;
            if (mutation.type === 'attributes') {
                if (target === document.body) relevant = true;
                continue;
            }
            const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
            const ownAddition = !mutation.removedNodes.length && mutation.addedNodes.length && [...mutation.addedNodes].every(n => n instanceof Element && n.matches(OWN_TUNER_UI));
            if (ownAddition) continue;
            const closestMenu = target.closest('[role="menu"]');
            if (closestMenu) queueMenuInjection(closestMenu);
            for (const node of nodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches(NON_LIST_CONTENT)) continue;
                if (node.matches('[role="menu"]')) {
                    if (node.isConnected) queueMenuInjection(node);
                    else relevant = true;
                }
                if (node.isConnected) node.querySelectorAll('[role="menu"]').forEach(queueMenuInjection);
                else if (node.querySelector('[role="menu"]')) relevant = true;
                if (cachedArchiveContainer && node.contains(cachedArchiveContainer) && !node.isConnected) resetArchiveCache();
                if (nodeTouchesList(node)) relevant = true;
            }
            // Header/sidebar changes matter; chat streaming and foreign decorations do not.
            if (headers.some(h => h.parentElement?.parentElement?.contains(target))) relevant = true;
        }
        if (relevant) {
            scheduleArchiveHeightFastApply();
            scheduleUpdate();
        }
    });
    // 핫픽스: DOM이 완전히 빌드되기 전 observer가 실행되어 스크립트 전체가 사망하는 구조적 결함 원천 해결
    // UI Plus 2.6.3 keeps its auto-close timer private and checks only :hover.
    // Extend that check on its TWO marked elements, never Element.prototype.
    // Native clicks, React handlers, menu focus and the user's auto-hide setting stay intact.
    function installUiPlusInteractionGuard() {
        const PANEL = '[data-crack-ui-chat-list-panel="1"]';
        const ZONE = '#crack-ui-chat-list-zone';
        const OWN = '#crack-lounge, .crack-so, .crack-lounge-btn, .crack-search-container, #crack-search-overlay, #crack-smart-organize-modal, .custom-palette-container, .crack-smart-organize-menu-item, .crack-resizer-handle';
        const nativeMatches = Element.prototype.matches;
        const patched = new Map();
        const dialogs = new Set();
        let graceUntil = 0;
        let dialogIntentUntil = 0;
        let dragging = false;
        let outside = false;
        let wasHeld = false;
        let timer = null;
        let queued = false;
        let discoveryNeeded = true;

        const visible = el => !!el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
        const panelFor = el => el instanceof Element ? el.closest(PANEL) : null;
        const owned = el => el instanceof Element && !!el.closest(OWN);
        function relatedMenu(menu) {
            return (menu.getAttribute('aria-labelledby') || '').split(/\s+/).some(id => {
                const trigger = document.getElementById(id);
                return panelFor(trigger) || owned(trigger);
            }) || !!menu.querySelector('.custom-palette-container, .crack-smart-organize-menu-item');
        }
        function related(el) {
            if (!(el instanceof Element)) return false;
            if (owned(el) || panelFor(el) || el.closest(ZONE)) return true;
            const menu = el.closest('[role="menu"]');
            if (menu && relatedMenu(menu)) return true;
            return [...dialogs].some(d => visible(d) && d.contains(el));
        }
        function held() {
            if (smartOrganizeState.open || loungeState.open || searchResultsOpen || dragging) return true;
            for (const dialog of dialogs) {
                if (!visible(dialog)) dialogs.delete(dialog);
                else return true;
            }
            if ([...document.querySelectorAll('[role="menu"][data-state="open"]')].some(m => visible(m) && relatedMenu(m))) return true;
            if (outside) return false;
            const focused = document.activeElement;
            if (related(focused) && focused.matches('input, textarea, select, [contenteditable="true"]')) return true;
            if ([...document.querySelectorAll(OWN)].some(el => visible(el) && nativeMatches.call(el, ':hover'))) return true;
            return Date.now() < graceUntil;
        }
        function restore(el, entry) {
            if (el.matches !== entry.wrapper) return;
            if (entry.descriptor) Object.defineProperty(el, 'matches', entry.descriptor);
            else delete el.matches;
        }
        function sync() {
            queued = false;
            if (discoveryNeeded) {
            discoveryNeeded = false;
            for (const [el, entry] of patched) {
                if (!el.isConnected || !nativeMatches.call(el, PANEL + ', ' + ZONE)) {
                    restore(el, entry);
                    patched.delete(el);
                }
            }
            for (const el of document.querySelectorAll(PANEL + ', ' + ZONE)) {
                if (patched.has(el)) continue;
                const original = el.matches;
                const descriptor = Object.getOwnPropertyDescriptor(el, 'matches');
                const wrapper = function(selector) {
                    if (this === el && selector === ':hover' && held()) return true;
                    return original.call(this, selector);
                };
                try {
                    Object.defineProperty(el, 'matches', { configurable: true, writable: true, value: wrapper });
                    patched.set(el, { wrapper, descriptor });
                } catch { /* An incompatible owner must not stop the tuner. */ }
            }
            }
            const active = patched.size > 0 && held();
            if (wasHeld && !active) {
                // UI Plus's previous timeout may have expired while we held it.
                // Re-arm its normal timeout once; do not click/toggle the panel.
                for (const el of patched.keys()) {
                    if (visible(el) && !nativeMatches.call(el, ':hover')) {
                        el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
                    }
                }
            }
            wasHeld = active;
            clearTimeout(timer);
            timer = active ? setTimeout(sync, 120) : null;
        }
        function queue() {
            if (queued) return;
            queued = true;
            queueMicrotask(sync);
        }
        document.addEventListener('pointerdown', event => {
            if (!patched.size) return;
            outside = !related(event.target);
            if (!outside) {
                graceUntil = Date.now() + 450;
                dialogIntentUntil = Date.now() + 1200;
                dragging = !!event.target.closest('.crack-resizer-handle');
            } else {
                graceUntil = 0;
                dialogIntentUntil = 0;
            }
            queue();
        }, true);
        for (const type of ['pointerup', 'pointercancel', 'mouseup']) {
            document.addEventListener(type, () => {
                if (!patched.size) return;
                if (dragging) graceUntil = Date.now() + 300;
                dragging = false;
                queue();
            }, true);
        }
        for (const type of ['focusin', 'focusout', 'pointerover', 'pointerout', 'input', 'keydown', 'click']) {
            document.addEventListener(type, event => {
                if (!patched.size) return;
                if (related(event.target)) {
                    if (type !== 'focusout' && type !== 'pointerout') outside = false;
                    graceUntil = Date.now() + 350;
                    if (type === 'click' || type === 'keydown') dialogIntentUntil = Date.now() + 1200;
                    queue();
                }
            }, true);
        }
        window.addEventListener('blur', () => {
            if (!patched.size) return;
            dragging = false;
            outside = true;
            graceUntil = 0;
            queue();
        });
        const observer = new MutationObserver(records => {
            let relevant = false;
            for (const record of records) {
                if (record.type === 'attributes') { relevant = true; continue; }
                const owner = record.target instanceof Element ? record.target : record.target?.parentElement;
                if (owner?.closest(OWN + ', ' + NON_LIST_CONTENT)) continue;
                for (const node of [...record.addedNodes, ...record.removedNodes]) {
                    if (!(node instanceof Element)) continue;
                    const selector = patched.size ? PANEL + ', ' + ZONE + ', ' + OWN + ', [role="menu"], [role="dialog"]' : PANEL + ', ' + ZONE;
                    if (node.matches(selector) || node.querySelector(selector)) relevant = true;
                    if (node.isConnected && Date.now() < dialogIntentUntil) {
                        const candidates = [...node.querySelectorAll('[role="dialog"]')];
                        if (node.matches('[role="dialog"]')) candidates.push(node);
                        candidates.forEach(d => { if (visible(d)) dialogs.add(d); });
                    }
                }
            }
            if (relevant) { discoveryNeeded = true; queue(); }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-crack-ui-chat-list-panel'] });
        sync();
    }


    function init() {
        if (tunerUiStarted || !document.body) return;
        tunerUiStarted = true;
        installUiPlusInteractionGuard();
        loadArchiveSearchCache();
        cleanupLegacySearchModeArtifacts(true);
        applySavedArchiveHeightFast();
        window.addEventListener('resize', scheduleSearchOverlayPositionUpdate, { passive: true });
        window.addEventListener('scroll', scheduleSearchOverlayPositionUpdate, { capture: true, passive: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleUpdate(); });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-theme'] });
        scheduleUpdate();
        setInterval(() => ensureArchiveCount(false), 60000);
    }
    // Authentication capture stays at document-start; visible DOM work waits for page load.
    const startUi = () => requestAnimationFrame(() => requestAnimationFrame(init));
    if (document.readyState === 'complete') startUi();
    else window.addEventListener('load', startUi, { once: true });
})();
