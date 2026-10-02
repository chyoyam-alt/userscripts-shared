// ==UserScript==
// @name         🌳 Crack Route Map (루트 지도)
// @namespace    crack-route-map
// @version      0.1.0
// @description  분기로 갈라진 채팅방을 원본 방 기준 나무 모양 지도로 보여줍니다. 채팅방 상단과 채팅 목록에서 열 수 있습니다.
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/RouteMap.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/RouteMap.user.js
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__crackRouteMapRunning) return;
  pageWindow.__crackRouteMapRunning = true;

  const APP = Object.freeze({
    version: '0.1.0',
    apiBase: 'https://crack-api.wrtn.ai/crack-gen',
    listPageSize: 40,
    messagePageSize: 300,
    maxListPages: 150,
    maxMessagePages: 120,
    requestGapMs: 150,
    retryCount: 3,
    autoRefreshMs: 5 * 60 * 1000,
    unresolvedRetryMs: 6 * 60 * 60 * 1000,
    storeKey: 'crm:store:v1',
  });

  const LOG = '[RouteMap]';
  const ID_RE = /^[a-f0-9]{24}$/i;
  const ICON_BRANCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>';

  // 분기 방의 메시지 중 분기 시점까지 복사된 메시지는 chatId가 원본 방 ID로 남아 있습니다.
  // 최신 메시지부터 거슬러 올라가 처음 만나는 "다른 방 chatId" 메시지가 갈라진 지점이고, 그 chatId가 원본 방입니다.
  const state = {
    store: loadStore(),
    refreshing: null,
    status: { text: '', tone: '' },
    panel: null,
    scope: 'story',
    scrolledToCurrent: false,
  };

  // ---------- 저장소 ----------

  function loadStore() {
    let raw = null;
    try { raw = GM_getValue(APP.storeKey, null); } catch (error) { console.warn(LOG, 'store read failed', error); }
    const store = raw && typeof raw === 'object' ? raw : {};
    return {
      rooms: store.rooms && typeof store.rooms === 'object' ? store.rooms : {},
      branches: store.branches && typeof store.branches === 'object' ? store.branches : {},
      updatedAt: Number(store.updatedAt) || 0,
    };
  }

  function saveStore() {
    try { GM_setValue(APP.storeKey, state.store); } catch (error) { console.warn(LOG, 'store write failed', error); }
  }

  // 지도에 필요한 방(분기 방과 그 원본)만 남겨 저장 용량을 줄입니다.
  function persist(rooms) {
    const { store } = state;
    const keep = {};
    const add = id => {
      const room = rooms.get(id) || store.rooms[id];
      if (room) keep[id] = room;
    };
    for (const room of rooms.values()) {
      if (!room.isBranch) continue;
      add(room.id);
      const parentId = store.branches[room.id]?.parentId;
      if (parentId) add(parentId);
    }
    for (const id of Object.keys(store.branches)) {
      if (!keep[id]) delete store.branches[id];
    }
    store.rooms = keep;
    saveStore();
  }

  // ---------- 크랙 API ----------

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  function buildHeaders() {
    const headers = {
      accept: 'application/json, text/plain, */*',
      platform: 'web',
      'wrtn-locale': 'ko-KR',
    };
    const token = getCookie('access_token');
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function apiGet(path) {
    let lastError = null;
    for (let attempt = 0; attempt < APP.retryCount; attempt++) {
      let response;
      try {
        response = await fetch(APP.apiBase + path, { method: 'GET', credentials: 'include', headers: buildHeaders() });
      } catch (error) {
        lastError = error;
        await sleep(700 * (attempt + 1));
        continue;
      }
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.result && body.result !== 'SUCCESS') throw new Error('크랙 서버가 실패 응답을 보냈어요.');
        return body?.data ?? body;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('로그인 정보를 읽지 못했어요. 크랙을 새로고침한 뒤 다시 시도해 주세요.');
      }
      if (response.status === 404) {
        const error = new Error('찾을 수 없음');
        error.status = 404;
        throw error;
      }
      lastError = new Error(`크랙 서버 오류 (${response.status})`);
      if (response.status < 500 && response.status !== 429) throw lastError;
      await sleep(700 * (attempt + 1));
    }
    throw lastError || new Error('크랙 서버에 연결하지 못했어요.');
  }

  function cleanTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function toRoom(raw) {
    const id = String(raw?._id || '');
    if (!ID_RE.test(id)) return null;
    const story = raw.story || {};
    return {
      id,
      title: cleanTitle(raw.title) || cleanTitle(story.name) || '제목 없는 방',
      storyId: String(story._id || ''),
      storyName: cleanTitle(story.name),
      isBranch: raw.isCreatedFromBranch === true,
      createdAt: Date.parse(raw.createdAt || '') || 0,
      messagedAt: Date.parse(raw.messagedAt || raw.updatedAt || raw.createdAt || '') || 0,
    };
  }

  async function fetchRoomPages(params, onRows) {
    const seen = new Set();
    let cursor = '';
    for (let page = 0; page < APP.maxListPages; page++) {
      const query = new URLSearchParams(params);
      query.set('limit', String(APP.listPageSize));
      if (cursor) query.set('cursor', cursor);
      const data = await apiGet(`/v3/chats?${query}`);
      const rows = Array.isArray(data?.chats) ? data.chats : [];
      onRows(rows);
      const next = data?.nextCursor ? String(data.nextCursor) : '';
      if (!rows.length || !next || seen.has(next)) return;
      seen.add(next);
      cursor = next;
      await sleep(APP.requestGapMs);
    }
  }

  async function fetchFolderIds() {
    const ids = [];
    const seen = new Set();
    let cursor = '';
    for (let page = 0; page < 30; page++) {
      const query = new URLSearchParams({ limit: '40' });
      if (cursor) query.set('cursor', cursor);
      const data = await apiGet(`/chat-folders?${query}`);
      const folders = Array.isArray(data?.folders) ? data.folders : [];
      folders.forEach(folder => {
        const id = String(folder?._id || '');
        if (id) ids.push(id);
      });
      const next = data?.nextCursor ? String(data.nextCursor) : '';
      if (!folders.length || !next || seen.has(next)) break;
      seen.add(next);
      cursor = next;
      await sleep(APP.requestGapMs);
    }
    return ids;
  }

  async function fetchAllRooms(report) {
    const rooms = new Map();
    const take = rows => rows.forEach(raw => {
      const room = toRoom(raw);
      if (room) rooms.set(room.id, room);
    });
    await fetchRoomPages({}, rows => {
      take(rows);
      report(`채팅방 목록 확인 중… ${rooms.size}개`);
    });
    // 보관함 안의 방이 기본 목록에서 빠지는 경우를 대비해 보관함도 한 번씩 훑습니다.
    let folderIds = [];
    try { folderIds = await fetchFolderIds(); } catch (error) { console.warn(LOG, 'folder list failed', error); }
    for (const folderId of folderIds) {
      try {
        await fetchRoomPages({ folderId }, rows => {
          take(rows);
          report(`보관함 확인 중… ${rooms.size}개`);
        });
      } catch (error) {
        console.warn(LOG, 'folder rooms failed', folderId, error);
      }
    }
    return rooms;
  }

  async function resolveBranch(room, report) {
    const seenIds = new Set();
    const seenCursors = new Set();
    let cursor = '';
    let point = null;
    let turn = 0;
    for (let page = 0; page < APP.maxMessagePages; page++) {
      const query = new URLSearchParams({ limit: String(APP.messagePageSize) });
      if (cursor) query.set('cursor', cursor);
      const data = await apiGet(`/v3/chats/${encodeURIComponent(room.id)}/messages?${query}`);
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      // 최신 메시지부터 오래된 메시지 순서로 옵니다.
      for (const message of messages) {
        const id = String(message?._id || '');
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);
        const owner = String(message?.chatId || '');
        if (!point && owner && owner !== room.id) {
          point = { parentId: owner, messageId: id, snippet: tailSnippet(message?.content) };
        }
        if (point && String(message?.role || '').toLowerCase() === 'user') turn++;
      }
      report(seenIds.size);
      const next = data?.nextCursor ? String(data.nextCursor) : '';
      if (!messages.length || !next || data?.hasNext === false || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
      await sleep(APP.requestGapMs);
    }
    if (!point) return { parentId: '', unresolved: true, checkedAt: Date.now() };
    return { ...point, turn, checkedAt: Date.now() };
  }

  async function fetchRoomDetail(id) {
    try {
      return toRoom(await apiGet(`/v3/chats/${encodeURIComponent(id)}`));
    } catch (error) {
      if (error.status !== 404) throw error;
      return { id, title: '삭제됐거나 열 수 없는 방', storyId: '', storyName: '', isBranch: false, missing: true, createdAt: 0, messagedAt: 0 };
    }
  }

  function needsResolve(info) {
    if (!info || info.failed) return true;
    if (info.unresolved) return Date.now() - (info.checkedAt || 0) > APP.unresolvedRetryMs;
    return false;
  }

  function refresh({ recheck = false } = {}) {
    if (state.refreshing) return state.refreshing;
    state.refreshing = (async () => {
      const { store } = state;
      if (recheck) store.branches = {};
      setStatus('채팅방 목록을 불러오는 중…', 'busy');
      const rooms = await fetchAllRooms(text => setStatus(text, 'busy'));

      const branchRooms = [...rooms.values()].filter(room => room.isBranch);
      const todo = branchRooms.filter(room => needsResolve(store.branches[room.id]));
      for (let i = 0; i < todo.length; i++) {
        const room = todo[i];
        const label = `갈라진 지점 찾는 중… ${i + 1}/${todo.length}`;
        setStatus(`${label} · ${room.title}`, 'busy');
        try {
          store.branches[room.id] = await resolveBranch(room, count => setStatus(`${label} · 메시지 ${count}개 확인`, 'busy'));
        } catch (error) {
          console.warn(LOG, 'branch resolve failed', room.id, error);
          store.branches[room.id] = { parentId: '', unresolved: true, failed: true, checkedAt: Date.now() };
        }
        persist(rooms);
        render();
        await sleep(APP.requestGapMs);
      }

      // 목록에 없는 원본 방은 방 정보를 따로 조회해 이름을 채웁니다.
      const missing = new Set();
      for (const room of branchRooms) {
        const parentId = store.branches[room.id]?.parentId;
        if (parentId && !rooms.has(parentId)) missing.add(parentId);
      }
      for (const id of missing) {
        const cached = store.rooms[id];
        if (cached) {
          rooms.set(id, cached);
          continue;
        }
        try {
          const detail = await fetchRoomDetail(id);
          if (detail) rooms.set(id, detail);
        } catch (error) {
          console.warn(LOG, 'parent detail failed', id, error);
        }
        await sleep(APP.requestGapMs);
      }

      store.updatedAt = Date.now();
      persist(rooms);
      setStatus('', '');
    })()
      .catch(error => {
        console.warn(LOG, 'refresh failed', error);
        setStatus(error?.message || String(error), 'error');
      })
      .finally(() => {
        state.refreshing = null;
        render();
        markSidebarRows();
      });
    return state.refreshing;
  }

  // ---------- 지도 데이터 ----------

  function buildForest() {
    const { rooms, branches } = state.store;
    const nodes = new Map();
    const nodeOf = id => {
      if (!nodes.has(id)) nodes.set(id, { id, room: rooms[id] || null, info: branches[id] || null, parent: null, children: [] });
      return nodes.get(id);
    };
    for (const room of Object.values(rooms)) {
      if (!room?.isBranch) continue;
      const node = nodeOf(room.id);
      const parentId = node.info?.parentId;
      if (parentId && parentId !== room.id) {
        const parent = nodeOf(parentId);
        node.parent = parent;
        parent.children.push(node);
      }
    }

    // 혹시 원본 관계가 꼬여 고리가 생기면 루트에서 닿지 않는 방을 루트로 끊어 냅니다.
    const roots = [...nodes.values()].filter(node => !node.parent);
    const seen = new Set();
    const walk = node => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      node.children.forEach(walk);
    };
    roots.forEach(walk);
    for (const node of nodes.values()) {
      if (seen.has(node.id)) continue;
      if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node);
      node.parent = null;
      roots.push(node);
      walk(node);
    }

    const latest = node => Math.max(node.room?.messagedAt || 0, ...node.children.map(latest));
    const sortTree = node => {
      node.children.sort((a, b) => (a.info?.turn ?? Infinity) - (b.info?.turn ?? Infinity)
        || (a.room?.createdAt || 0) - (b.room?.createdAt || 0));
      node.children.forEach(sortTree);
    };
    const storyOf = node => {
      if (node.room?.storyId) return { id: node.room.storyId, name: node.room.storyName };
      for (const child of node.children) {
        const story = storyOf(child);
        if (story.id) return story;
      }
      return { id: '', name: '' };
    };

    const groups = new Map();
    for (const root of roots) {
      sortTree(root);
      root.latest = latest(root);
      const story = storyOf(root);
      const key = story.id || '_';
      if (!groups.has(key)) groups.set(key, { storyId: story.id, storyName: story.name || '작품 정보 없음', roots: [], latest: 0, branchCount: 0 });
      const group = groups.get(key);
      group.roots.push(root);
      group.latest = Math.max(group.latest, root.latest);
    }
    const countBranches = node => (node.room?.isBranch ? 1 : 0) + node.children.reduce((sum, child) => sum + countBranches(child), 0);
    for (const group of groups.values()) {
      group.roots.sort((a, b) => b.latest - a.latest);
      group.branchCount = group.roots.reduce((sum, root) => sum + countBranches(root), 0);
    }
    return [...groups.values()].sort((a, b) => b.latest - a.latest);
  }

  function branchIdSet() {
    return new Set(Object.values(state.store.rooms).filter(room => room?.isBranch).map(room => room.id));
  }

  // ---------- 글자 다듬기 ----------

  function plainText(content) {
    return String(content || '')
      .replace(/^\s*\[\/\/\]: # \(.*\)\s*$/gm, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_~`>#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 갈라진 지점은 메시지의 끝부분이 더 잘 보여 주므로 뒤쪽을 잘라 씁니다.
  function tailSnippet(content, max = 80) {
    const text = plainText(content);
    return text.length > max ? '…' + text.slice(-max) : text;
  }

  function formatDate(ms) {
    if (!ms) return '';
    const date = new Date(ms);
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
    return date.getFullYear() === new Date().getFullYear() ? monthDay : `${String(date.getFullYear()).slice(2)}/${monthDay}`;
  }

  function parseLocation() {
    const match = location.pathname.match(/^\/stories\/([a-f0-9]{24})\/episodes\/([a-f0-9]{24})/i);
    return match ? { storyId: match[1], chatId: match[2] } : { storyId: '', chatId: '' };
  }

  // ---------- 화면 ----------

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) {
      if (child) node.append(child);
    }
    return node;
  }

  function injectStyle() {
    if (document.getElementById('crm-style')) return;
    const style = el('style', { id: 'crm-style' });
    style.textContent = `
.crm-icon-btn{display:inline-flex;align-items:center;justify-content:center;flex:none;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:8px;padding:0;opacity:.8;transition:background-color .15s,opacity .15s}
.crm-icon-btn:hover{opacity:1;background:rgba(127,127,127,.16)}
.crm-icon-btn svg{width:100%;height:100%}
.crm-header-btn{width:32px;height:32px;padding:6px}
.crm-sidebar-btn{width:20px;height:20px;padding:2px;border-radius:4px}
.crm-row-badge{display:inline-flex;align-items:center;flex:none;width:14px;height:14px;margin-right:4px;vertical-align:-2px;color:#2f9e6b}
.crm-row-badge svg{width:100%;height:100%}
.crm-overlay{--crm-bg:#fff;--crm-fg:#1d1d1f;--crm-sub:#6b6b73;--crm-line:#d9d9de;--crm-card:#f6f6f8;--crm-hover:#ececf0;--crm-accent:#2f9e6b;--crm-accent-soft:rgba(47,158,107,.12);--crm-error:#d14343;
position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);pointer-events:auto;font-family:inherit}
body[data-theme="dark"] .crm-overlay,html.dark .crm-overlay{--crm-bg:#1c1c1f;--crm-fg:#ececf0;--crm-sub:#9a9aa3;--crm-line:#3a3a40;--crm-card:#26262a;--crm-hover:#303036;--crm-accent:#4cc38a;--crm-accent-soft:rgba(76,195,138,.15);--crm-error:#ff6b6b}
.crm-panel{width:min(720px,calc(100vw - 24px));max-height:min(86vh,900px);display:flex;flex-direction:column;background:var(--crm-bg);color:var(--crm-fg);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);overflow:hidden}
.crm-head{display:flex;align-items:center;gap:8px;padding:16px 16px 8px}
.crm-head h2{margin:0;font-size:17px;font-weight:700;flex:1;display:flex;align-items:center;gap:8px}
.crm-head h2 svg{width:20px;height:20px;color:var(--crm-accent)}
.crm-head small{font-size:11px;font-weight:400;color:var(--crm-sub)}
.crm-close{width:32px;height:32px;font-size:20px;line-height:1;color:var(--crm-sub)}
.crm-toolbar{display:flex;align-items:center;gap:8px;padding:0 16px 10px;flex-wrap:wrap}
.crm-seg{display:inline-flex;background:var(--crm-card);border-radius:10px;padding:3px}
.crm-seg button,.crm-btn{border:0;background:transparent;color:var(--crm-sub);font:inherit;font-size:13px;padding:6px 12px;border-radius:8px;cursor:pointer}
.crm-seg button[aria-pressed="true"]{background:var(--crm-bg);color:var(--crm-fg);font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.crm-btn{background:var(--crm-card);color:var(--crm-fg)}
.crm-btn:hover{background:var(--crm-hover)}
.crm-btn:disabled{opacity:.5;cursor:default}
.crm-spacer{flex:1}
.crm-status{margin:0 16px 8px;font-size:12px;color:var(--crm-sub);min-height:16px}
.crm-status[data-tone="busy"]::before{content:'';display:inline-block;width:10px;height:10px;margin-right:6px;border:2px solid var(--crm-line);border-top-color:var(--crm-accent);border-radius:50%;vertical-align:-1px;animation:crm-spin .8s linear infinite}
.crm-status[data-tone="error"]{color:var(--crm-error)}
@keyframes crm-spin{to{transform:rotate(360deg)}}
.crm-body{flex:1;overflow:auto;padding:0 16px 12px;overscroll-behavior:contain}
.crm-empty{padding:28px 12px;text-align:center;color:var(--crm-sub);font-size:14px;line-height:1.6}
.crm-empty .crm-btn{margin-top:12px}
.crm-group{margin:6px 0 14px}
.crm-group>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:8px 4px;font-weight:700;font-size:14px}
.crm-group>summary::-webkit-details-marker{display:none}
.crm-group>summary::before{content:'▸';color:var(--crm-sub);transition:transform .15s}
.crm-group[open]>summary::before{transform:rotate(90deg)}
.crm-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crm-count{font-size:12px;font-weight:400;color:var(--crm-sub)}
.crm-roots,.crm-children{list-style:none;margin:0;padding:0}
.crm-roots>li{margin:4px 0 10px}
.crm-children{margin-left:16px}
.crm-children>li{position:relative;padding:6px 0 0 18px}
.crm-children>li::before{content:'';position:absolute;left:0;top:0;bottom:0;border-left:2px solid var(--crm-line)}
.crm-children>li:last-child::before{bottom:auto;height:30px}
.crm-children>li::after{content:'';position:absolute;left:0;top:30px;width:14px;border-top:2px solid var(--crm-line)}
.crm-node{display:block;padding:9px 12px;border-radius:12px;background:var(--crm-card);border:1.5px solid transparent;cursor:pointer;text-align:left;transition:background-color .15s,border-color .15s}
.crm-node:hover{background:var(--crm-hover)}
.crm-node:focus-visible{outline:2px solid var(--crm-accent);outline-offset:2px}
.crm-node.is-current{border-color:var(--crm-accent);background:var(--crm-accent-soft)}
.crm-node.is-missing{cursor:default;opacity:.7}
.crm-node-title{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;min-width:0}
.crm-node-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.crm-node-icon{flex:none;width:15px;height:15px;color:var(--crm-sub)}
.crm-node.is-branch .crm-node-icon{color:var(--crm-accent)}
.crm-node-icon svg{width:100%;height:100%}
.crm-chip{flex:none;font-size:11px;font-weight:600;padding:2px 7px;border-radius:999px;background:var(--crm-bg);color:var(--crm-sub)}
.crm-chip.is-current{background:var(--crm-accent);color:#fff}
.crm-node-meta{margin-top:3px;font-size:12px;color:var(--crm-sub)}
.crm-node-snippet{margin-top:4px;font-size:12.5px;line-height:1.5;color:var(--crm-fg);opacity:.85;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:keep-all;overflow-wrap:anywhere}
.crm-foot{display:flex;align-items:center;gap:8px;padding:10px 16px 14px;border-top:1px solid var(--crm-line);font-size:12px;color:var(--crm-sub)}
.crm-foot .crm-btn{font-size:12px;padding:5px 10px}
@media (max-width:640px){
.crm-overlay{align-items:stretch}
.crm-panel{width:100vw;max-height:none;height:100dvh;border-radius:0}
.crm-children{margin-left:8px}
.crm-children>li{padding-left:14px}
.crm-children>li::after{width:10px}
}`;
    document.head.append(style);
  }

  function setStatus(text, tone) {
    state.status = { text, tone };
    const node = state.panel?.querySelector('.crm-status');
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function summaryText(groups) {
    const branchCount = groups.reduce((sum, group) => sum + group.branchCount, 0);
    const at = state.store.updatedAt ? new Date(state.store.updatedAt) : null;
    const when = at ? `${formatDate(at.getTime())} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}` : '';
    return `분기 방 ${branchCount}개 · 작품 ${groups.length}개${when ? ` · ${when} 기준` : ''}`;
  }

  function openPanel(scope) {
    injectStyle();
    const here = parseLocation();
    state.scope = scope === 'story' && here.storyId ? 'story' : 'all';
    state.scrolledToCurrent = false;
    if (!state.panel) {
      const overlay = el('div', { class: 'crm-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': '루트 지도', onclick: event => { if (event.target === overlay) closePanel(); } }, [
        el('div', { class: 'crm-panel' }, [
          el('div', { class: 'crm-head' }, [
            el('h2', { html: `${ICON_BRANCH}<span>루트 지도</span><small>v${APP.version}</small>` }),
            el('button', { class: 'crm-icon-btn crm-close', type: 'button', 'aria-label': '닫기', text: '×', onclick: closePanel }),
          ]),
          el('div', { class: 'crm-toolbar' }, [
            el('div', { class: 'crm-seg', role: 'group' }, [
              el('button', { type: 'button', 'data-scope': 'story', text: '이 작품', onclick: () => setScope('story') }),
              el('button', { type: 'button', 'data-scope': 'all', text: '전체', onclick: () => setScope('all') }),
            ]),
            el('span', { class: 'crm-spacer' }),
            el('button', { class: 'crm-btn crm-refresh', type: 'button', text: '새로고침', onclick: () => { refresh(); render(); } }),
          ]),
          el('div', { class: 'crm-status', 'aria-live': 'polite' }),
          el('div', { class: 'crm-body' }),
          el('div', { class: 'crm-foot' }, [
            el('span', { class: 'crm-spacer', text: '방을 누르면 그 방으로 이동해요.' }),
            el('button', { class: 'crm-btn crm-recheck', type: 'button', text: '갈라진 지점 다시 찾기', onclick: () => {
              if (confirm('저장해 둔 분기 정보를 지우고 모든 분기 방을 처음부터 다시 확인할까요?\n방이 많으면 시간이 조금 걸려요.')) { refresh({ recheck: true }); render(); }
            } }),
          ]),
        ]),
      ]);
      state.panel = overlay;
      document.addEventListener('keydown', onKeydown, true);
    }
    document.body.append(state.panel);
    setStatus(state.status.text, state.status.tone);
    if (!state.refreshing && Date.now() - state.store.updatedAt > APP.autoRefreshMs) refresh();
    render();
  }

  function closePanel() {
    if (!state.panel) return;
    state.panel.remove();
    state.panel = null;
    document.removeEventListener('keydown', onKeydown, true);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && state.panel) {
      event.stopPropagation();
      closePanel();
    }
  }

  function setScope(scope) {
    state.scope = scope;
    state.scrolledToCurrent = false;
    render();
  }

  function openRoom(room) {
    if (!room?.storyId || room.missing) return;
    const path = `/stories/${room.storyId}/episodes/${room.id}`;
    closePanel();
    if (location.pathname === path) return;
    const router = pageWindow.next?.router;
    if (router && typeof router.push === 'function') {
      try {
        router.push(path);
        return;
      } catch (error) {
        console.warn(LOG, 'router push failed', error);
      }
    }
    location.assign(path);
  }

  function renderNode(node, currentId) {
    const room = node.room;
    const isBranch = !!room?.isBranch;
    const isCurrent = node.id === currentId;
    const missing = !room || room.missing;
    const info = node.info;

    const meta = [];
    if (isBranch) {
      if (info?.unresolved) meta.push('원본을 찾지 못했어요');
      else if (info) meta.push(info.turn > 0 ? `${info.turn}턴에서 갈라짐` : '프롤로그에서 갈라짐');
      else meta.push('갈라진 지점 확인 전');
    } else if (!missing) {
      meta.push('원본');
    }
    if (room?.messagedAt) meta.push(`최근 ${formatDate(room.messagedAt)}`);

    const card = el('div', {
      class: `crm-node${isBranch ? ' is-branch' : ' is-root'}${isCurrent ? ' is-current' : ''}${missing ? ' is-missing' : ''}`,
      role: missing ? null : 'button',
      tabindex: missing ? null : '0',
      'data-room-id': node.id,
      onclick: () => openRoom(room),
      onkeydown: event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openRoom(room);
        }
      },
    }, [
      el('div', { class: 'crm-node-title' }, [
        el('span', { class: 'crm-node-icon', html: ICON_BRANCH }),
        el('span', { class: 'crm-node-name', text: missing ? (room?.title || '목록에 없는 방') : room.title }),
        isCurrent ? el('span', { class: 'crm-chip is-current', text: '지금 보는 방' }) : null,
        isBranch && info?.unresolved ? el('span', { class: 'crm-chip', text: '원본 미확인' }) : null,
      ]),
      meta.length ? el('div', { class: 'crm-node-meta', text: meta.join(' · ') }) : null,
      isBranch && info?.snippet ? el('div', { class: 'crm-node-snippet', text: info.snippet, title: '갈라지기 직전 장면' }) : null,
    ]);

    const item = el('li', {}, [card]);
    if (node.children.length) {
      item.append(el('ul', { class: 'crm-children' }, node.children.map(child => renderNode(child, currentId))));
    }
    return item;
  }

  function render() {
    const panel = state.panel;
    if (!panel) return;
    const here = parseLocation();
    panel.querySelectorAll('.crm-seg button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.scope === state.scope));
      if (button.dataset.scope === 'story') button.disabled = !here.storyId;
    });
    panel.querySelector('.crm-refresh').disabled = !!state.refreshing;
    panel.querySelector('.crm-recheck').disabled = !!state.refreshing;

    const groups = buildForest();
    const visible = state.scope === 'story' ? groups.filter(group => group.storyId === here.storyId) : groups;
    if (!state.refreshing && state.status.tone !== 'error') setStatus(state.store.updatedAt ? summaryText(groups) : '', '');

    const body = panel.querySelector('.crm-body');
    const scrollTop = body.scrollTop;
    body.replaceChildren();

    if (!visible.length) {
      let text;
      if (state.refreshing && !state.store.updatedAt) text = '처음 한 번은 채팅방을 모두 훑어보느라 시간이 조금 걸려요.';
      else if (state.scope === 'story') text = '이 작품에는 아직 분기 방이 없어요.\n메시지 메뉴의 [분기]로 새 가지를 만들 수 있어요.';
      else if (state.store.updatedAt) text = '분기로 만든 방이 아직 없어요.';
      else text = '아직 불러온 정보가 없어요. [새로고침]을 눌러 주세요.';
      const empty = el('div', { class: 'crm-empty' });
      text.split('\n').forEach((line, index) => {
        if (index) empty.append(el('br'));
        empty.append(line);
      });
      if (state.scope === 'story' && groups.length) {
        empty.append(el('br'), el('button', { class: 'crm-btn', type: 'button', text: '전체 지도 보기', onclick: () => setScope('all') }));
      }
      body.append(empty);
      return;
    }

    for (const group of visible) {
      body.append(el('details', { class: 'crm-group', open: true }, [
        el('summary', {}, [
          el('span', { class: 'crm-group-name', text: group.storyName }),
          el('span', { class: 'crm-count', text: `분기 ${group.branchCount}개` }),
        ]),
        el('ul', { class: 'crm-roots' }, group.roots.map(root => renderNode(root, here.chatId))),
      ]));
    }

    const current = body.querySelector('.crm-node.is-current');
    if (current && !state.scrolledToCurrent) {
      state.scrolledToCurrent = true;
      current.scrollIntoView({ block: 'center' });
    } else {
      body.scrollTop = scrollTop;
    }
  }

  // ---------- 크랙 화면에 버튼 붙이기 ----------

  function makeIconButton(className, label, onClick) {
    return el('button', {
      class: `crm-icon-btn ${className}`,
      type: 'button',
      title: label,
      'aria-label': label,
      html: ICON_BRANCH,
      onclick: event => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      },
    });
  }

  // 채팅방 상단 줄의 오른쪽 묶음(모델 버튼이 있는 곳) 맨 앞에 붙입니다.
  function ensureHeaderButton() {
    if (!parseLocation().chatId) return;
    const header = document.querySelector('.group\\/header');
    if (!header || header.querySelector('.crm-header-btn')) return;
    const modelButton = header.querySelector('button[aria-haspopup="dialog"]');
    const group = modelButton?.parentElement;
    if (!group) return;
    group.insertBefore(makeIconButton('crm-header-btn', '루트 지도', () => openPanel('story')), group.firstChild);
  }

  // 왼쪽 사이드바의 "채팅 목록" 제목 줄, 목록 메뉴 버튼 앞에 붙입니다.
  function ensureSidebarButton() {
    const sidebar = document.querySelector('.bg-sidebar');
    if (!sidebar || sidebar.querySelector('.crm-sidebar-btn')) return;
    const label = [...sidebar.querySelectorAll('div > span')].find(span => span.textContent.trim() === '채팅 목록');
    const row = label?.parentElement;
    if (!row) return;
    const menu = row.querySelector('button[aria-haspopup="menu"]');
    row.insertBefore(makeIconButton('crm-sidebar-btn', '루트 지도 (전체)', () => openPanel('all')), menu || null);
  }

  function markSidebarRows() {
    const ids = branchIdSet();
    document.querySelectorAll('a.group\\/chat-list-item[href*="/episodes/"]').forEach(link => {
      const id = (link.getAttribute('href').match(/\/episodes\/([a-f0-9]{24})/i) || [])[1];
      const badge = link.querySelector('.crm-row-badge');
      if (id && ids.has(id)) {
        if (badge) return;
        // 제목 글자를 크랙이 다시 그릴 때 함께 지워지지 않도록 제목 span 안이 아니라 바로 앞에 둡니다.
        const title = link.querySelector('span.typo-text-sm_leading-none_medium');
        if (title?.parentElement) title.parentElement.insertBefore(el('span', { class: 'crm-row-badge', title: '분기로 만든 방', html: ICON_BRANCH }), title);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function ensureUi() {
    injectStyle();
    ensureHeaderButton();
    ensureSidebarButton();
    markSidebarRows();
  }

  let uiTimer = 0;
  const observer = new MutationObserver(() => {
    if (uiTimer) return;
    uiTimer = setTimeout(() => {
      uiTimer = 0;
      ensureUi();
    }, 400);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  ensureUi();

  try {
    GM_registerMenuCommand('🌳 루트 지도 열기', () => openPanel(parseLocation().chatId ? 'story' : 'all'));
  } catch (error) {
    console.warn(LOG, 'menu command failed', error);
  }

  pageWindow.CrackRouteMap = Object.freeze({
    version: APP.version,
    open: scope => openPanel(scope === 'all' ? 'all' : 'story'),
  });
})();
