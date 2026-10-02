// ==UserScript==
// @name         🌳 Crack Branch Knot (갈래 매듭)
// @namespace    crack-branch-knot
// @version      1.1.0
// @description  분기로 갈라진 채팅방을 원본 방에 매듭지어 나무 모양 지도로 보여줍니다. 채팅방 상단과 채팅 목록에서 열고, 채팅 목록에는 원본 방과 분기 방을 표시합니다.
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/BranchKnot.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/BranchKnot.user.js
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

// 로고: 효정 제작 · 아이콘: Tabler Icons (MIT)

(() => {
  'use strict';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__crackBranchKnotRunning) return;
  pageWindow.__crackBranchKnotRunning = true;

  const APP = Object.freeze({
    version: '1.1.0',
    apiBase: 'https://crack-api.wrtn.ai/crack-gen',
    listPageSize: 40,
    messagePageSize: 300,
    maxListPages: 150,
    maxMessagePages: 120,
    requestGapMs: 150,
    retryCount: 3,
    autoRefreshMs: 5 * 60 * 1000,
    unresolvedRetryMs: 6 * 60 * 60 * 1000,
    storeKey: 'cbk:store:v1',
    arriveKey: 'cbk:arrive',
  });

  const LOG = '[BranchKnot]';
  const ID_RE = /^[a-f0-9]{24}$/i;

  // 분기 방의 메시지 중 분기 시점까지 복사된 메시지는 chatId가 원본 방 ID로 남아 있습니다.
  // 최신 메시지부터 거슬러 올라가 처음 만나는 "다른 방 chatId" 메시지가 갈라진 지점이고, 그 chatId가 원본 방입니다.
  const state = {
    store: loadStore(),
    refreshing: null,
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
      if (response.status < 500 && response.status !== 429) throw new Error(`크랙 서버가 요청을 받지 않았어요 (${response.status}).`);
      await sleep(700 * (attempt + 1));
    }
    console.warn(LOG, 'request failed', path, lastError);
    throw new Error('크랙 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }

  function cleanTitle(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  // 작품 썸네일: 세로 표지를 먼저 쓰고, 없으면 프로필 사진을 씁니다.
  function imageOf(story) {
    for (const image of [story.portraitImage, story.profileImage]) {
      const url = image?.w200 || image?.w600 || image?.origin || '';
      if (/^https:\/\//.test(url)) return url;
    }
    return '';
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
      image: imageOf(story),
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

  async function fetchAllRooms() {
    const rooms = new Map();
    const take = rows => rows.forEach(raw => {
      const room = toRoom(raw);
      if (room) rooms.set(room.id, room);
    });
    await fetchRoomPages({}, rows => {
      take(rows);
      setBusy(`채팅방 목록 확인 중… ${rooms.size}개`, null);
    });
    // 보관함 안의 방이 기본 목록에서 빠지는 경우를 대비해 보관함도 한 번씩 훑습니다.
    let folderIds = [];
    try { folderIds = await fetchFolderIds(); } catch (error) { console.warn(LOG, 'folder list failed', error); }
    for (const folderId of folderIds) {
      try {
        await fetchRoomPages({ folderId }, rows => {
          take(rows);
          setBusy(`보관함 확인 중… ${rooms.size}개`, null);
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
        if (!point && ID_RE.test(owner) && owner !== room.id) {
          point = { parentId: owner, messageId: id, tail: plainText(message?.content).slice(-300) };
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
      return { id, title: '원본 방을 열 수 없어요', storyId: '', storyName: '', isBranch: false, missing: true, createdAt: 0, messagedAt: 0 };
    }
  }

  function needsResolve(info) {
    if (!info || info.failed) return true;
    if (info.unresolved) return Date.now() - (info.checkedAt || 0) > APP.unresolvedRetryMs;
    return false;
  }

  function knownBranchIds() {
    return new Set(Object.values(state.store.rooms).filter(room => room?.isBranch).map(room => room.id));
  }

  function refresh({ recheck = false, manual = false } = {}) {
    if (state.refreshing) return state.refreshing;
    const firstLoad = !state.store.updatedAt;
    const before = knownBranchIds();
    ui.error = '';
    ui.found = 0;
    setBusy('채팅방 목록 확인 중…', null);
    if (firstLoad) redrawBody();

    const job = (async () => {
      const { store } = state;
      const rooms = await fetchAllRooms();
      if (recheck) store.branches = {};

      const branchRooms = [...rooms.values()].filter(room => room.isBranch);
      const todo = branchRooms.filter(room => needsResolve(store.branches[room.id]));
      for (let i = 0; i < todo.length; i++) {
        const room = todo[i];
        const label = `갈라진 지점 찾는 중 ${i + 1}/${todo.length} · ${room.title}`;
        setBusy(label, i / todo.length);
        try {
          store.branches[room.id] = await resolveBranch(room, count => setBusy(`${label} · 메시지 ${count}개 확인`, (i + 0.5) / todo.length));
        } catch (error) {
          console.warn(LOG, 'branch resolve failed', room.id, error);
          store.branches[room.id] = { parentId: '', unresolved: true, failed: true, checkedAt: Date.now() };
        }
        persist(rooms);
        await sleep(APP.requestGapMs);
      }

      // 목록에 없는 원본 방은 방 정보를 따로 조회해 이름을 채웁니다.
      const missing = new Set();
      for (const room of branchRooms) {
        const parentId = store.branches[room.id]?.parentId;
        if (parentId && !rooms.has(parentId)) missing.add(parentId);
      }
      // 목록에 없다는 건 지워졌을 수 있다는 뜻이라, 예전에 저장한 정보가 있어도 다시 확인합니다.
      for (const id of missing) {
        const cached = store.rooms[id];
        if (cached?.missing && !recheck) {
          rooms.set(id, cached);
          continue;
        }
        try {
          const detail = await fetchRoomDetail(id);
          if (detail) rooms.set(id, detail);
        } catch (error) {
          console.warn(LOG, 'parent detail failed', id, error);
          if (cached) rooms.set(id, cached);
        }
        await sleep(APP.requestGapMs);
      }

      store.updatedAt = Date.now();
      persist(rooms);
      const after = knownBranchIds();
      return { firstLoad, newIds: new Set([...after].filter(id => !before.has(id))) };
    })();

    state.refreshing = job
      .then(result => {
        ui.busy = null;
        onRefreshDone(result, manual);
      })
      .catch(error => {
        console.warn(LOG, 'refresh failed', error);
        ui.busy = null;
        ui.error = error?.message || String(error);
        redrawStatus();
        if (!state.store.updatedAt) redrawBody();
      })
      .finally(() => {
        state.refreshing = null;
        redrawStatus();
        updateHostUi();
      });
    return state.refreshing;
  }

  // ---------- 지도 데이터 ----------

  function parseLocation() {
    const match = location.pathname.match(/^\/stories\/([a-f0-9]{24})\/episodes\/([a-f0-9]{24})/i);
    return match ? { storyId: match[1], chatId: match[2] } : { storyId: '', chatId: '' };
  }

  function buildForest() {
    const { rooms, branches } = state.store;
    const nodes = new Map();
    const nodeOf = id => {
      if (!nodes.has(id)) nodes.set(id, { id, room: rooms[id] || null, info: branches[id] || null, parent: null, children: [], desc: 0 });
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

    const finish = node => {
      node.children.sort((a, b) => (a.info?.turn ?? Infinity) - (b.info?.turn ?? Infinity)
        || (a.room?.createdAt || 0) - (b.room?.createdAt || 0));
      node.latest = node.room?.messagedAt || 0;
      node.desc = 0;
      for (const child of node.children) {
        finish(child);
        node.desc += 1 + child.desc;
        node.latest = Math.max(node.latest, child.latest);
      }
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
      finish(root);
      const story = storyOf(root);
      const key = story.id || '_';
      if (!groups.has(key)) groups.set(key, { key, storyId: story.id, storyName: story.name || '작품 정보 없음', roots: [], latest: 0, count: 0 });
      const group = groups.get(key);
      group.roots.push(root);
      group.latest = Math.max(group.latest, root.latest);
      group.count += (root.room?.isBranch ? 1 : 0) + root.desc;
    }
    const hereStory = parseLocation().storyId;
    const list = [...groups.values()];
    list.forEach(group => group.roots.sort((a, b) => b.latest - a.latest));
    list.sort((a, b) => (b.storyId === hereStory) - (a.storyId === hereStory) || b.latest - a.latest);
    for (const node of nodes.values()) {
      let top = node;
      while (top.parent) top = top.parent;
      node.groupKey = storyOf(top).id || '_';
    }
    return { groups: list, nodes };
  }

  function ancestorsOf(id) {
    const ids = new Set();
    let node = ui.forest?.nodes.get(id);
    while (node && !ids.has(node.id)) {
      ids.add(node.id);
      node = node.parent;
    }
    return ids;
  }

  function descendantsOf(id) {
    const out = [];
    const walk = node => node.children.forEach(child => {
      out.push(child.id);
      walk(child);
    });
    const node = ui.forest?.nodes.get(id);
    if (node) walk(node);
    return out;
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

  // 갈라지기 직전 장면은 메시지 끝부분이 가장 잘 보여 주므로 마지막 문장을 한 줄로 씁니다.
  function sceneLine(info) {
    if (!info?.tail) return '';
    const sentences = info.tail.match(/[^.!?…。]+[.!?…。]+["'”’」』)]*|[^.!?…。]+$/g) || [info.tail];
    let line = sentences.pop().trim();
    while (sentences.length && line.length < 24) {
      const prev = sentences.pop().trim();
      if (prev.length + line.length > 90) break;
      line = `${prev} ${line}`;
    }
    return line.length > 90 ? '…' + line.slice(-90) : line;
  }

  function formatDate(ms) {
    if (!ms) return '';
    const date = new Date(ms);
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
    return date.getFullYear() === new Date().getFullYear() ? monthDay : `${String(date.getFullYear()).slice(2)}/${monthDay}`;
  }

  function shortDate(ms) {
    if (!ms) return '';
    return Date.now() - ms < 60 * 60 * 1000 ? '방금' : formatDate(ms);
  }

  function checkedAtText(ms) {
    const date = new Date(ms);
    return `${formatDate(ms)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function hueOf(id) {
    let hue = 0;
    for (const ch of String(id)) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    return hue;
  }

  const firstChar = text => Array.from(String(text || '').trim())[0] || '·';

  // ---------- 아이콘·로고 ----------

  const TI = {
    "refresh": "<path pathLength=\"1\" d=\"M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4\"/> <path pathLength=\"1\" d=\"M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4\"/>",
    "radar": "<path pathLength=\"1\" d=\"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\"/> <path pathLength=\"1\" d=\"M15.51 15.56a5 5 0 1 0 -3.51 1.44\"/> <path pathLength=\"1\" d=\"M18.832 17.86a9 9 0 1 0 -6.832 3.14\"/> <path pathLength=\"1\" d=\"M12 12v9\"/>",
    "down": "<path pathLength=\"1\" d=\"M6 9l6 6l6 -6\"/>",
    "go": "<path pathLength=\"1\" d=\"M5 12l14 0\"/> <path pathLength=\"1\" d=\"M13 18l6 -6\"/> <path pathLength=\"1\" d=\"M13 6l6 6\"/>",
    "x": "<path pathLength=\"1\" d=\"M18 6l-12 12\"/> <path pathLength=\"1\" d=\"M6 6l12 12\"/>",
    "warn": "<path pathLength=\"1\" d=\"M12 9v4\"/> <path pathLength=\"1\" d=\"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0\"/> <path pathLength=\"1\" d=\"M12 16h.01\"/>",
    "help": "<path pathLength=\"1\" d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\"/> <path pathLength=\"1\" d=\"M12 16v.01\"/> <path pathLength=\"1\" d=\"M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483\"/>",
    "check": "<path pathLength=\"1\" d=\"M5 12l5 5l10 -10\"/>",
    "unlink": "<path pathLength=\"1\" d=\"M17 22v-2\"/> <path pathLength=\"1\" d=\"M9 15l6 -6\"/> <path pathLength=\"1\" d=\"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464\"/> <path pathLength=\"1\" d=\"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463\"/> <path pathLength=\"1\" d=\"M20 17h2\"/> <path pathLength=\"1\" d=\"M2 7h2\"/> <path pathLength=\"1\" d=\"M7 2v2\"/>",
    "seed": "<path pathLength=\"1\" d=\"M12 10a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3\"/> <path pathLength=\"1\" d=\"M12 14a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3\"/> <path pathLength=\"1\" d=\"M12 20l0 -10\"/>",
    "clock": "<path pathLength=\"1\" d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\"/> <path pathLength=\"1\" d=\"M12 12l3 2\"/> <path pathLength=\"1\" d=\"M12 7v5\"/>",
    "flag": "<path pathLength=\"1\" d=\"M5 14h14l-4.5 -4.5l4.5 -4.5h-14v16\"/>"
  };
  const LOGO_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 128 128\" fill=\"none\" color=\"#171719\" role=\"img\" aria-labelledby=\"storyknot-title storyknot-desc\"> <defs><mask id=\"storyknot-weave\" maskUnits=\"userSpaceOnUse\" x=\"0\" y=\"0\" width=\"128\" height=\"128\"><rect width=\"128\" height=\"128\" fill=\"white\"/><path d=\"M64.291 56.001C66.516 56.013 68.740 56.164 70.933 56.452C73.125 56.739 75.287 57.163 77.388 57.716C79.490 58.269 81.531 58.951 83.485 59.750C85.439 60.549 87.306 61.465 89.061 62.482C90.816 63.499 92.460 64.616 93.970 65.815C95.481 67.014 96.858 68.295 98.086 69.633\" fill=\"none\" stroke=\"black\" stroke-width=\"18.0\"/><path d=\"M76.844 78.751C75.721 80.673 74.478 82.523 73.133 84.278C71.788 86.033 70.340 87.693 68.810 89.237C67.280 90.780 65.669 92.207 64.000 93.500C62.331 94.793 60.605 95.951 58.846 96.963C57.088 97.974 55.298 98.839 53.505 99.547C51.711 100.256 49.914 100.809 48.141 101.203\" fill=\"none\" stroke=\"black\" stroke-width=\"18.0\"/><path d=\"M50.865 78.248C49.763 76.315 48.782 74.313 47.934 72.270C47.087 70.228 46.373 68.144 45.802 66.047C45.230 63.951 44.800 61.842 44.514 59.750C44.229 57.659 44.089 55.584 44.092 53.555C44.095 51.527 44.242 49.545 44.525 47.637C44.808 45.730 45.228 43.896 45.773 42.164\" fill=\"none\" stroke=\"black\" stroke-width=\"18.0\"/></mask></defs> <g stroke=\"currentColor\" stroke-width=\"12.8\" stroke-linecap=\"butt\" stroke-linejoin=\"round\"><g mask=\"url(#storyknot-weave)\"><path id=\"ribbon-1\" d=\"M64.000 56.000C68.363 56.000 72.726 56.539 76.865 57.581C81.005 58.624 84.920 60.169 88.414 62.114C91.908 64.059 94.980 66.404 97.481 68.990C99.982 71.577 101.911 74.405 103.186 77.281C104.461 80.158 105.080 83.082 105.035 85.851C104.990 88.620 104.280 91.233 102.971 93.500C101.662 95.767 99.755 97.688 97.379 99.112C95.003 100.535 92.161 101.461 89.033 101.796C85.904 102.130 82.491 101.873 79.000 101.000C75.509 100.127 71.943 98.639 68.512 96.586C65.080 94.533 61.784 91.915 58.812 88.851C55.839 85.787 53.191 82.279 51.010 78.500C48.828 74.721 47.114 70.674 45.946 66.568C44.779 62.462 44.160 58.298 44.098 54.300C44.035 50.301 44.530 46.469 45.519 43.010C46.509 39.550 47.993 36.465 49.847 33.923C51.701 31.381 53.923 29.383 56.344 28.037C58.765 26.692 61.382 26.000 64.000 26.000C66.618 26.000 69.235 26.692 71.656 28.037C74.077 29.383 76.299 31.381 78.153 33.923C80.007 36.465 81.491 39.550 82.481 43.010C83.470 46.469 83.965 50.301 83.902 54.300C83.840 58.298 83.221 62.462 82.054 66.568C80.886 70.674 79.172 74.721 76.990 78.500C74.809 82.279 72.161 85.787 69.188 88.851C66.216 91.915 62.920 94.533 59.488 96.586C56.057 98.639 52.491 100.127 49.000 101.000C45.509 101.873 42.096 102.130 38.967 101.796C35.839 101.461 32.997 100.535 30.621 99.112C28.245 97.688 26.338 95.767 25.029 93.500C23.720 91.233 23.010 88.620 22.965 85.851C22.920 83.082 23.539 80.158 24.814 77.281C26.089 74.405 28.018 71.577 30.519 68.990C33.020 66.404 36.092 64.059 39.586 62.114C43.080 60.169 46.995 58.624 51.135 57.581C55.274 56.539 59.637 56.000 64.000 56.000Z\"/></g><g id=\"overpasses\"><path id=\"overpass-1\" d=\"M62.689 56.016C65.091 55.957 67.500 56.061 69.878 56.324C72.256 56.587 74.603 57.011 76.883 57.586C79.163 58.161 81.375 58.887 83.485 59.750C85.596 60.613 87.604 61.612 89.480 62.728C91.356 63.843 93.100 65.075 94.685 66.397C96.270 67.719 97.697 69.132 98.944 70.607\"/><path id=\"overpass-2\" d=\"M77.632 77.356C76.482 79.466 75.188 81.501 73.771 83.428C72.354 85.356 70.813 87.177 69.176 88.864C67.538 90.551 65.803 92.104 64.000 93.500C62.198 94.896 60.328 96.136 58.424 97.203C56.520 98.270 54.581 99.164 52.644 99.876C50.706 100.587 48.769 101.116 46.869 101.459\"/><path id=\"overpass-3\" d=\"M51.679 79.627C50.427 77.577 49.312 75.439 48.351 73.248C47.390 71.056 46.583 68.812 45.941 66.550C45.299 64.288 44.822 62.009 44.514 59.750C44.207 57.491 44.068 55.252 44.096 53.070C44.124 50.887 44.319 48.761 44.671 46.727C45.024 44.694 45.534 42.752 46.187 40.934\"/></g></g> </svg>";

  const ti = (name, cls = '') => `<svg class="ti ${cls}" viewBox="0 0 24 24" aria-hidden="true">${TI[name]}</svg>`;
  const LIVE = '<i class="live" aria-hidden="true"></i>';

  // 리본(rb)과 위로 지나가는 조각(ov)을 나눠 움직입니다. 크랙 화면에 붙일 때는 cbk- 접두어를 씁니다.
  let logoSeq = 0;
  function logo(cls = '', prefix = '') {
    const n = ++logoSeq;
    let svg = LOGO_SVG
      .replace(/id="storyknot-weave"/, `id="cbk-lw${n}"`)
      .replace(/url\(#storyknot-weave\)/, `url(#cbk-lw${n})`)
      .replace(/<path id="ribbon-\d"/g, `<path class="${prefix}rb" pathLength="1"`)
      .replace(/<path id="overpass-\d"/g, `<path class="${prefix}ov" pathLength="1"`)
      .replace('<g id="overpasses">', `<g class="${prefix}ovs">`)
      .replace(/ role="img" aria-labelledby="[^"]*"/, ' aria-hidden="true" focusable="false"')
      .replace(/ color="#171719"/, '')
      .replace('<svg ', `<svg class="${prefix}lg ${prefix}lg-storyknot ${cls}" `);
    if (cls.includes('loader')) svg = svg.replace(/(<path class="rb"[^>]*\/>)/g, m => m + m.replace('class="rb"', 'class="rb run"'));
    return svg;
  }

  // ---------- 스타일 ----------

  // 디자인 시안에서 창에 필요한 규칙만 옮겨 왔습니다(미리보기 틀·색 묶음 제외).
  const PANEL_CSS = `
*{box-sizing:border-box}
button{font:inherit;color:inherit;letter-spacing:inherit;cursor:pointer}
/* 색: 무채색 한 줄 + 세이지 하나(지금 위치·지금 길에만) */
.stage{
 --canvas:#18181a;--surface:#212123;--surface-2:#2a2a2d;--surface-3:#323236;--text:#ededee;--text-2:#9b9ba1;--text-3:#66666c;--rule:rgba(255,255,255,.08);--rule-2:rgba(255,255,255,.16);--rail:#46464c;
 --accent:#8cc59e;--accent-soft:rgba(140,197,158,.13);--accent-on:#122018;--danger:#ee8a8a;
 --ring:0 0 0 1px rgba(255,255,255,.08);--ring-hover:0 0 0 1px rgba(255,255,255,.14);--lift:0 0 0 1px rgba(255,255,255,.1),0 28px 64px -16px rgba(0,0,0,.75);--dim:rgba(0,0,0,.55);
 --out:cubic-bezier(.2,0,0,1);--spring:cubic-bezier(.34,1.4,.64,1)}
.stage[data-theme=light]{
 --canvas:#ffffff;--surface:#f5f5f4;--surface-2:#ededec;--surface-3:#e4e4e2;--text:#1c1c1b;--text-2:#6b6b68;--text-3:#a3a3a0;--rule:rgba(0,0,0,.08);--rule-2:rgba(0,0,0,.15);--rail:#d0d0cd;
 --accent:#4f8a63;--accent-soft:rgba(79,138,99,.1);--accent-on:#fff;--danger:#c4545a;
 --ring:0 0 0 1px rgba(0,0,0,.06),0 1px 2px -1px rgba(0,0,0,.06),0 2px 4px 0 rgba(0,0,0,.04);--ring-hover:0 0 0 1px rgba(0,0,0,.09),0 1px 2px -1px rgba(0,0,0,.08),0 2px 4px 0 rgba(0,0,0,.06);--lift:0 0 0 1px rgba(0,0,0,.06),0 28px 64px -18px rgba(0,0,0,.32);--dim:rgba(0,0,0,.34)}
.ti{display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
.ti.thin{stroke-width:1.75}
/* ── 창 ── */
.ov{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:var(--dim);animation:fade .2s var(--out) both}
@keyframes fade{from{opacity:0}}
.ov.out{animation:fadeOut .16s var(--out) forwards}
@keyframes fadeOut{to{opacity:0}}
.pn{width:min(720px,calc(100% - 24px));height:min(640px,calc(100% - 48px));display:flex;flex-direction:column;overflow:hidden;background:var(--canvas);color:var(--text);border-radius:20px;box-shadow:var(--lift);animation:pnIn .32s var(--out) both}
@keyframes pnIn{from{opacity:0;translate:0 8px;scale:.985}}
.ov.out .pn{animation:pnOut .16s var(--out) forwards}
@keyframes pnOut{to{opacity:0;translate:0 4px}}
.hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px}
.mark{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--surface);color:var(--text);box-shadow:var(--ring)}
.mark .ti{width:18px;height:18px}
.mark .ti :is(path,circle,line){stroke-dasharray:1;stroke-dashoffset:1;animation:draw .7s var(--out) forwards}
.mark .ti :nth-child(2){animation-delay:.08s}
.mark .ti :nth-child(3){animation-delay:.16s}
.mark .ti :nth-child(4){animation-delay:.24s}
.mark .ti :nth-child(n+5){animation-delay:.32s}
@keyframes draw{to{stroke-dashoffset:0}}
.ttl{display:flex;flex-direction:column;gap:1px}
.ttl b{font-size:15.5px;font-weight:700;letter-spacing:-.025em;line-height:1.25}
.ttl small{font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.grow{flex:1 1 auto;min-width:0}
.ib{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:none;color:var(--text-2);transition:background .15s var(--out),color .15s var(--out),scale .15s var(--out)}
.ib:hover{background:var(--surface);color:var(--text)}
.ib:active{scale:.96}
.ib .ti{width:18px;height:18px}
.tb{display:flex;align-items:center;gap:8px;padding:0 14px 10px 16px}
.seg{position:relative;display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:var(--surface);isolation:isolate}
.seg>i{position:absolute;z-index:-1;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:7px;background:var(--canvas);box-shadow:var(--ring);translate:calc(100% * var(--i)) 0;transition:translate .3s var(--out)}
.seg button{min-width:78px;height:30px;padding:0 12px;border:0;background:none;color:var(--text-2);font-size:12.5px;font-weight:600;transition:color .15s var(--out)}
.seg button.on{color:var(--text)}
.btn{height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px 0 10px;border:0;border-radius:9px;background:var(--canvas);box-shadow:var(--ring);color:var(--text);font-size:12.5px;font-weight:600;white-space:nowrap;transition:box-shadow .15s var(--out),background .15s var(--out),scale .15s var(--out)}
.btn:hover{box-shadow:var(--ring-hover);background:var(--surface)}
.btn:active{scale:.96}
.btn:disabled{opacity:.45;cursor:default;scale:1}
.btn .ti{width:16px;height:16px;color:var(--text-2)}
.btn.solid{background:var(--text);color:var(--canvas);box-shadow:none;padding:0 12px}
.btn.solid:hover{background:var(--text);opacity:.88}
.btn.accent{background:var(--accent);color:var(--accent-on);box-shadow:none;padding:0 10px 0 12px}
.btn.accent .ti{color:inherit}
.busy .rf .ti{animation:spin .9s linear infinite}
@keyframes spin{to{rotate:360deg}}
.st{display:flex;align-items:center;gap:7px;min-height:28px;margin:0 16px;padding-bottom:8px;font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums}
.st b{color:var(--text);font-weight:600}
.st .ti{width:15px;height:15px}
.st[data-tone=err]{color:var(--danger)}
.st .sp{width:12px;height:12px;flex:0 0 12px;border:2px solid var(--rule-2);border-top-color:var(--text);border-radius:50%;animation:spin .8s linear infinite}
.prog{position:relative;height:2px;margin:-4px 16px 6px;border-radius:2px;background:var(--rule);overflow:hidden}
.prog i{position:absolute;inset:0 auto 0 0;width:var(--w,0%);background:var(--text);transition:width .35s var(--out)}
.prog.ind i{width:28%;animation:ind 1.1s ease-in-out infinite}
@keyframes ind{from{left:-28%}to{left:100%}}
.bd{flex:1 1 auto;min-height:0;overflow:auto;padding:2px 16px 16px;overscroll-behavior:contain;scrollbar-width:thin;position:relative}
.ft{position:relative;display:flex;align-items:center;gap:8px;padding:10px 14px 12px 16px;border-top:1px solid var(--rule);font-size:12px;color:var(--text-3)}
.ft .btn{height:30px;font-size:12px}
.ft .btn:hover .ti{rotate:30deg}
.ft .btn .ti{transition:rotate .4s var(--out)}
.cf{position:absolute;right:14px;bottom:calc(100% + 8px);z-index:5;width:296px;padding:14px;border-radius:16px;background:var(--canvas);box-shadow:var(--lift);animation:cfIn .2s var(--out) both;transform-origin:90% 100%}
@keyframes cfIn{from{opacity:0;translate:0 4px;scale:.97}}
.cf b{display:block;font-size:13.5px;margin-bottom:5px;color:var(--text)}
.cf p{margin:0 0 12px;font-size:12px;line-height:1.55;color:var(--text-2)}
.cf div{display:flex;justify-content:flex-end;gap:6px}
.toast{position:absolute;left:50%;bottom:22px;z-index:60;translate:-50% 0;display:flex;align-items:center;gap:7px;padding:9px 14px 9px 12px;border-radius:999px;background:var(--text);color:var(--canvas);font-size:12.5px;font-weight:600;white-space:nowrap;box-shadow:0 10px 26px rgba(0,0,0,.28);animation:toast 2.4s var(--out) both;pointer-events:none}
.toast .ti{width:15px;height:15px}
@keyframes toast{0%{opacity:0;translate:-50% 6px}10%,82%{opacity:1;translate:-50% 0}100%{opacity:0}}
/* 작품 묶음 */
.grp+.grp{margin-top:8px}
.gh{position:sticky;top:-2px;z-index:3;display:flex;align-items:center;gap:8px;width:100%;margin:0;padding:10px 2px 8px;border:0;background:var(--canvas);color:var(--text);font-size:13px;font-weight:700;text-align:left}
.gh .ti{width:16px;height:16px;color:var(--text-3);transition:rotate .25s var(--out)}
.grp.closed .gh>.ti{rotate:-90deg}
.gh .nm{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{font-size:12px;font-weight:600;color:var(--text-3);font-variant-numeric:tabular-nums}
.gh .here{margin-left:2px;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;color:var(--accent)}
.gh .here{gap:6px}
.gh::after{content:'';flex:1;height:1px;background:var(--rule);margin-left:4px}
.gb{display:grid;grid-template-rows:1fr;transition:grid-template-rows .3s var(--out)}
.grp.closed .gb{grid-template-rows:0fr}
.gb>div{min-height:0;overflow:hidden}
/* 나무: 원본 카드 + 레일 위의 분기 줄 */
.tree{position:relative;padding:4px 0 6px}
.tree>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}
.tree .rl{fill:none;stroke:var(--rail);stroke-width:1.5;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:draw .5s var(--out) forwards;animation-delay:calc(var(--k) * 40ms + 60ms)}
.tree .rl.lv2{opacity:.8}
.tree .rl.lv3{opacity:.6;stroke-width:1.25}
.tree .rl.hot{stroke:var(--accent);stroke-width:2;opacity:1}
.tree .jn{fill:var(--canvas);stroke:var(--text-2);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:jn .3s var(--spring) backwards;animation-delay:calc(var(--k) * 40ms + 280ms)}
.tree .jn.lv2{stroke:var(--text-3)}
.tree .jn.lv3{stroke:var(--rail);fill:var(--rail)}
.tree .jn.hot{stroke:var(--accent)}
.tree .jn.cur{fill:var(--accent);stroke:var(--accent)}
.tree .pulse{fill:none;stroke:var(--accent);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:pulse 2.2s ease-out infinite}
@keyframes pulse{from{scale:1;opacity:.8}to{scale:2.6;opacity:0}}
@keyframes jn{from{scale:0}}
.quiet .rl,.quiet .jn,.quiet .nd{animation:none!important;stroke-dashoffset:0}
.nd{position:relative;animation:ndIn .38s var(--out) backwards;animation-delay:calc(var(--k) * 40ms)}
@keyframes ndIn{from{opacity:0;translate:0 4px}}
.nd.top{margin:0 0 4px}
.nd.top+.nd.top,.nd.br+.nd.top{margin-top:12px}
/* 원본 카드: 표지 + 제목 + 분기 수 */
.card{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 10px 8px 8px;border:0;border-radius:16px;background:var(--canvas);box-shadow:var(--ring);color:var(--text);text-align:left;cursor:pointer;transition:box-shadow .15s var(--out),background .15s var(--out),scale .15s var(--out)}
.card:hover{box-shadow:var(--ring-hover);background:var(--surface)}
.card:active{scale:.99}
.card:focus-visible,.nd.br:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card.cur{box-shadow:0 0 0 1.5px var(--accent);background:var(--accent-soft)}
.card.missing{cursor:default;background:none;box-shadow:none;outline:1.5px dashed var(--rule-2);outline-offset:-1.5px}
.cover{position:relative;width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(150deg,hsl(var(--h) 20% 58%),hsl(calc(var(--h) + 30) 16% 40%));color:rgba(255,255,255,.92);font-size:15px;font-weight:700;overflow:hidden}
.cover::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.stage[data-theme=light] .cover::after{box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.card.missing .cover,.card.unres .cover{background:var(--surface-2);color:var(--text-3)}
.cover .ti{width:18px;height:18px}
.card .cb b{font-size:14px;font-weight:650}
.card .cb small{color:var(--text-3)}
/* 분기 줄: 상자 없음 */
.nd.br{display:flex;align-items:center;gap:10px;min-height:46px;margin:1px 0;padding:6px 8px 6px calc(var(--d) * 20px + 44px);color:var(--text);cursor:pointer;outline:0}
.nd.br::before{content:'';position:absolute;inset:0 0 0 calc(var(--d) * 20px + 36px);z-index:-1;border-radius:10px;background:transparent;transition:background .15s var(--out)}
.nd.br:hover::before{background:var(--surface)}
.nd.br:active{scale:.995}
.nd.br.cur::before{background:var(--accent-soft)}
.tree{isolation:isolate}
.turn{width:38px;flex:0 0 38px;font-size:11.5px;font-weight:700;color:var(--text-2);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.nd.br.cur .turn{color:var(--accent)}
.cb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cb b{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;font-weight:600;line-height:1.35}
.cb b span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb small{font-size:12px;line-height:1.4;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 깊어질수록 옅게 */
.nd.br.lv2 .cb b{font-weight:550;color:color-mix(in srgb,var(--text) 86%,var(--canvas))}
.nd.br.lv2 .cb small,.nd.br.lv2 .turn{color:var(--text-3)}
.nd.br.lv3 .cb b{font-weight:500;font-size:13px;color:color-mix(in srgb,var(--text) 72%,var(--canvas))}
.nd.br.lv3 .cb small{display:none}
.nd.br.lv3 .turn{color:var(--text-3)}
.nd.br.cur .cb b{color:var(--text)}
.nd.br.cur .cb small{color:var(--text-2);display:block}
.now{font-style:normal;flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;height:19px;padding:0 7px 0 7px;border-radius:999px;background:var(--accent);color:var(--accent-on);font-size:11px;font-weight:700}
.now .live{color:var(--accent-on)}
.warn{font-style:normal;flex:0 0 auto;display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:var(--danger)}
.warn .ti{width:13px;height:13px}
.dt{flex:0 0 auto;font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.go{flex:0 0 18px;width:18px;height:18px;color:var(--text-3);opacity:0;translate:-4px 0;transition:opacity .15s var(--out),translate .2s var(--out)}
.go .ti{width:18px;height:18px}
.card:hover .go,.nd.br:hover .go{opacity:1;translate:0 0}
.fold{position:relative;z-index:2;flex:0 0 auto;height:24px;display:inline-flex;align-items:center;gap:2px;padding:0 6px 0 4px;border:0;border-radius:7px;background:var(--canvas);box-shadow:var(--ring);color:var(--text-2);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;transition:background .15s var(--out),scale .15s var(--out)}
.nd.br .fold{background:var(--surface-2);box-shadow:none}
.fold:hover{background:var(--surface-3)}
.fold:active{scale:.96}
.fold .ti{width:14px;height:14px;transition:rotate .25s var(--out)}
.fold.closed .ti{rotate:-90deg}
.card:has(.fold) .go,.nd.br:has(.fold) .go{display:none}
/* 빈 상태·처음 */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:100%;padding:24px;text-align:center;color:var(--text-2);font-size:13px;line-height:1.6}
.empty b{color:var(--text);font-size:15px;font-weight:700}
.art{width:84px;height:84px;margin-bottom:6px;display:grid;place-items:center;border-radius:24px;background:var(--surface);color:var(--text)}
.art .ti{width:40px;height:40px;stroke-width:1.5}
.art.seed .ti :is(path,circle){stroke-dasharray:1;stroke-dashoffset:1;animation:draw .9s var(--out) forwards}
.art.seed .ti :nth-child(2){animation-delay:.35s}
.art.seed .ti :nth-child(3){animation-delay:.55s}
.art.seed .ti{transform-origin:50% 100%;animation:sway 3.6s 1.4s ease-in-out infinite}
@keyframes sway{0%,100%{rotate:0deg}50%{rotate:-4deg}}
.art.load .ti :is(path,circle,line){stroke-dasharray:1;animation:loop 2.2s var(--out) infinite}
.art.load .ti :nth-child(2){animation-delay:.15s}
.art.load .ti :nth-child(3){animation-delay:.3s}
.art.load .ti :nth-child(4){animation-delay:.45s}
.art.load .ti :nth-child(n+5){animation-delay:.6s}
@keyframes loop{0%{stroke-dashoffset:1}45%,80%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
.skel{display:flex;flex-direction:column;gap:6px;width:100%;max-width:420px;margin-top:10px}
.skel i{height:52px;border-radius:12px;background:linear-gradient(90deg,var(--surface) 30%,var(--surface-2) 50%,var(--surface) 70%);background-size:300% 100%;animation:shim 1.4s linear infinite}
.skel i:nth-child(2){margin-left:28px}
.skel i:nth-child(3){margin-left:56px}
@keyframes shim{from{background-position:100% 0}to{background-position:-50% 0}}
/* ── 모바일 ── */
@container (max-width:520px){
  .ov{align-items:flex-end}
  .pn{width:100%;height:calc(100% - 36px);border-radius:22px 22px 0 0;animation:sheetIn .36s var(--out) both}
  @keyframes sheetIn{from{translate:0 40px;opacity:0}}
  .ov.out .pn{animation:sheetOut .2s var(--out) forwards}
  @keyframes sheetOut{to{translate:0 40px;opacity:0}}
  .pn::before{content:'';display:block;width:40px;height:4px;margin:8px auto 0;border-radius:4px;background:var(--rule-2)}
  .hd{padding:8px 12px 10px 14px}
  .tb{padding:0 12px 10px 14px}
  .seg button{min-width:0;height:36px;padding:0 14px}
  .btn{height:36px}
  .ib{width:40px;height:40px;flex-basis:40px}
  .bd{padding:2px 12px 14px}
  .ft{padding:10px 12px 14px}
  .ft>span:first-child{display:none}
  .cf{width:calc(100% - 24px);right:12px}
  .nd.br{padding-left:calc(var(--d) * 16px + 40px);min-height:52px;gap:8px}
  .nd.br::before{left:calc(var(--d) * 16px + 32px)}
  .cover{width:36px;height:36px;flex-basis:36px}
  .card{min-height:56px;gap:8px}
  .turn{width:34px;flex-basis:34px}
  .go,.dt{display:none}
}
@media (prefers-reduced-motion:reduce){.stage *,.stage *::before,.stage *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
/* 숨 쉬는 점 ('지금') */
.live{position:relative;display:inline-block;width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:currentColor;font-style:normal}
.live::after{content:'';position:absolute;inset:0;border-radius:50%;background:currentColor;animation:ping 2.2s ease-out infinite}
@keyframes ping{from{scale:1;opacity:.55}to{scale:2.8;opacity:0}}
/* ── 로고 (올려준 SVG): 리본이 그려지며 엮임 ── */
.lg{display:block;flex:0 0 auto;overflow:visible}
.lg .rb,.lg .ov{transition:opacity .2s}
.lg.weave .rb{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.1s var(--out) .05s forwards}
.lg.weave .ov{opacity:0;animation:ovIn .3s var(--out) forwards}
.lg.weave .ov:nth-child(1){animation-delay:.8s}
.lg.weave .ov:nth-child(2){animation-delay:.88s}
.lg.weave .ov:nth-child(3){animation-delay:.96s}
.lg.weave .ov:nth-child(4){animation-delay:1.04s}
@keyframes ovIn{from{opacity:0;scale:.92}to{opacity:1;scale:1}}
.lg .ov{transform-box:fill-box;transform-origin:center}
/* 불러오는 중: 매듭을 따라 빛이 한 바퀴씩 돎 */
.lg.loader .rb:not(.run),.lg.loader .ov{opacity:.2}
.lg.loader .run{stroke-dasharray:.14 .86;animation:run 1.5s linear infinite}
@keyframes run{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
/* 마우스를 올리면 대칭 한 칸만큼 돎 (매듭 120도, 교차고리 180도) */
.spin-on-hover .lg{transition:rotate .7s var(--spring)}
.spin-on-hover:hover .lg-storyknot{rotate:120deg}
.mark{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--surface);box-shadow:var(--ring);color:var(--text)}
.mark .lg{width:22px;height:22px}
.st .ld{width:16px;height:16px;flex:0 0 16px;color:var(--text)}
.st .ld .lg{width:16px;height:16px}
.art .lg{width:44px;height:44px}
/* ── 마우스를 올리면 원본부터 그 방까지 길만 또렷하게 ── */
.tree .rl,.tree .jn{transition:opacity .15s var(--out),stroke .15s var(--out),stroke-width .15s var(--out)}
.nd.br .cb,.nd.br .turn,.nd.br .dt{transition:opacity .15s var(--out)}
.tree.tracing .rl:not(.tr){opacity:.22}
.tree.tracing .jn:not(.tr),.tree.tracing .pulse:not(.tr){opacity:.3}
.tree.tracing .rl.tr:not(.hot){stroke:var(--text-2);stroke-width:2;opacity:1}
.tree.tracing .jn.tr:not(.hot):not(.cur){stroke:var(--text);opacity:1}
.tree.tracing .nd.br:not(.tr) :is(.cb,.turn,.dt){opacity:.42}
/* ── 이동: 그 방까지 길이 초록으로 다시 그려짐 ── */
.tree .rl.go{stroke:var(--accent);stroke-width:2.2;opacity:1!important;stroke-dashoffset:1;animation:trace .4s var(--out) forwards!important}
@keyframes trace{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
.tree .jn.go{fill:var(--accent);stroke:var(--accent);opacity:1!important;animation:jnPop .35s var(--spring) .2s both!important}
@keyframes jnPop{0%{scale:1}50%{scale:1.6}100%{scale:1}}
.nd.br.going::before,.card.going{background:var(--accent-soft)}
/* ── 펼칠 때·새로 찾은 가지: 레일이 다시 자라남 ── */
.quiet .rl.fresh{stroke-dashoffset:1;animation:draw .45s var(--out) forwards!important;animation-delay:calc(var(--k) * 35ms + 60ms)!important}
.quiet .jn.fresh{animation:jn .3s var(--spring) backwards!important;animation-delay:calc(var(--k) * 35ms + 260ms)!important}
.nd.br.new::before{animation:newbg 3.6s var(--out) both}
@keyframes newbg{0%{background:color-mix(in srgb,var(--accent) 30%,transparent)}100%{background:transparent}}
.newchip{font-style:normal;flex:0 0 auto;height:19px;padding:0 7px;display:inline-flex;align-items:center;border-radius:999px;box-shadow:inset 0 0 0 1px var(--accent);color:var(--accent);font-size:11px;font-weight:700;animation:fade .3s var(--out) both}
.st.found{color:var(--accent)}
.st.found b{color:var(--accent)}
/* ══ 색 묶음: 바탕·레일까지 그 색으로 아주 살짝 물들이고, 머리 줄·바닥 줄만 한 톤 진하게 ══ */
.stage{--chrome:var(--surface);--chrome-ln:var(--rule)}
/* 머리 줄(제목·도구·상태)과 바닥 줄 */
.hd,.tb,[data-st]{background:var(--chrome)}
[data-st]{border-bottom:1px solid var(--chrome-ln);margin-bottom:4px}
[data-st] .st{padding-bottom:9px}
.ft{background:var(--chrome);border-top-color:var(--chrome-ln)}
.mark{background:var(--canvas)}
.tb .seg{background:color-mix(in srgb,var(--accent) 7%,var(--surface-2))}
.tb .seg>i{background:var(--canvas)}
.cf{background:var(--canvas)}
.pn{transition:background .25s var(--out)}
`;

  // 실제 크랙 화면 위에 띄우기 위한 바탕과, 시안 이후에 고친 것(빛 테두리 여백·스크롤바·썸네일)입니다.
  const STAGE_CSS = `
:host{all:initial}
.stage{position:fixed;inset:0;pointer-events:none;container-type:inline-size;font-family:Pretendard,-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:14px;line-height:normal;color:var(--text);letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-align:left;isolation:isolate}
.ov{pointer-events:auto}
.pn:focus{outline:none}
.seg button:disabled{opacity:.4;cursor:default}
.gb>div{padding:0 4px;margin:0 -4px}
.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:inherit}
.bd{scrollbar-width:auto;scrollbar-color:auto}
.bd::-webkit-scrollbar{width:10px}
.bd::-webkit-scrollbar-track,.bd::-webkit-scrollbar-corner{background:transparent}
.bd::-webkit-scrollbar-button{display:none;width:0;height:0}
.bd::-webkit-scrollbar-thumb{background:var(--rail) padding-box;border:3px solid transparent;border-radius:999px}
.bd::-webkit-scrollbar-thumb:hover{background-color:var(--text-3)}
@supports not selector(::-webkit-scrollbar){.bd{scrollbar-width:thin;scrollbar-color:var(--rail) transparent}}`;

  // 크랙 화면에 붙이는 버튼과 목록 표시입니다.
  const HOST_CSS = `
.cbk-hbtn,.cbk-mini{position:relative;display:inline-grid;place-items:center;flex:none;padding:0;border:0;background:none;color:inherit;cursor:pointer;opacity:.75;transition:background-color .15s,opacity .15s,scale .15s}
.cbk-hbtn{width:32px;height:32px;border-radius:8px}
.cbk-mini{width:24px;height:24px;padding:4px;border-radius:6px}
.cbk-hbtn:hover,.cbk-mini:hover{opacity:1;background:rgba(127,127,127,.14)}
.cbk-hbtn:active,.cbk-mini:active{scale:.96}
.cbk-lg{display:block;flex:0 0 auto;overflow:visible}
.cbk-lg .cbk-ov{transform-box:fill-box;transform-origin:center}
.cbk-hbtn .cbk-lg{width:20px;height:20px}
.cbk-mini .cbk-lg{width:16px;height:16px}
.cbk-spin .cbk-lg{transition:rotate .7s cubic-bezier(.34,1.4,.64,1)}
.cbk-spin:hover .cbk-lg{rotate:120deg}
.cbk-dot{position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:#4f8a63;box-shadow:0 0 0 2px var(--bg_screen,#fff)}
body[data-theme="dark"] .cbk-dot{background:#8cc59e;box-shadow:0 0 0 2px var(--bg_screen,#141413)}
.cbk-tip::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;translate:-50% -2px;z-index:60;padding:5px 8px;border-radius:7px;background:#1b1b1b;color:#fff;font-size:11.5px;font-weight:600;line-height:1.2;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s cubic-bezier(.2,0,0,1),translate .15s cubic-bezier(.2,0,0,1)}
body[data-theme="dark"] .cbk-tip::after{background:#ececec;color:#131313}
.cbk-tip:hover::after{opacity:1;translate:-50% 0}
.cbk-tip-end::after{left:auto;right:0;translate:0 -2px}
.cbk-tip-end:hover::after{translate:0 0}
@media (hover:none){.cbk-tip::after{display:none}}
.cbk-arrive .cbk-lg{animation:cbk-arrive .7s cubic-bezier(.34,1.4,.64,1)}
.cbk-arrive .cbk-dot{animation:cbk-ping2 1s ease-out 2}
@keyframes cbk-arrive{0%{scale:.6;rotate:-60deg}60%{scale:1.15}100%{scale:1;rotate:0deg}}
@keyframes cbk-ping2{50%{box-shadow:0 0 0 2px var(--bg_screen,#fff),0 0 0 6px rgba(127,180,145,.35)}}
.cbk-bdg{display:inline-flex;flex:0 0 13px;width:13px;height:13px;opacity:.5}
.cbk-bdg .cbk-lg{width:13px;height:13px}
.cbk-bdg.is-cur{opacity:1;color:#4f8a63}
body[data-theme="dark"] .cbk-bdg.is-cur{color:#8cc59e}
.cbk-origin{display:inline-flex;align-items:center;gap:3px;flex:none;height:17px;padding:0 6px 0 4px;border-radius:999px;background:rgba(127,127,127,.16);font-size:10.5px;font-weight:700;line-height:1;letter-spacing:-.01em;white-space:nowrap}
.cbk-origin svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.cbk-origin b{font-weight:600;opacity:.6;font-variant-numeric:tabular-nums}
.cbk-origin.is-cur{background:#4f8a63;color:#fff}
body[data-theme="dark"] .cbk-origin.is-cur{background:#8cc59e;color:#122018}
.cbk-origin.is-cur b{opacity:.8}`;

  function injectHostStyle() {
    if (document.getElementById('cbk-host-style')) return;
    const style = document.createElement('style');
    style.id = 'cbk-host-style';
    style.textContent = HOST_CSS;
    document.head.append(style);
  }

  function currentTheme() {
    const theme = document.body?.dataset.theme;
    if (theme === 'light' || theme === 'dark') return theme;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return pageWindow.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // ---------- 창 ----------

  const ui = {
    host: null,
    stage: null,
    open: false,
    scope: 'story',
    confirm: false,
    busy: null,
    error: '',
    found: 0,
    newIds: null,
    fresh: null,
    foundTimer: 0,
    forest: null,
    closedGroups: new Set(),
    folded: new Set(),
    returnFocus: null,
    marks: { branch: new Set(), origin: new Map(), stories: new Set() },
  };

  // 창은 Shadow DOM 안에 띄워 크랙이나 다른 확프의 스타일과 섞이지 않게 합니다.
  function ensureStage() {
    if (!ui.stage) {
      const host = document.createElement('div');
      host.id = 'cbk-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>${PANEL_CSS}\n${STAGE_CSS}</style><div class="stage"></div>`;
      ui.host = host;
      ui.stage = shadow.querySelector('.stage');
      bindStage(shadow);
    }
    if (!ui.host.isConnected) document.body.append(ui.host);
    ui.stage.dataset.theme = currentTheme();
    return ui.stage;
  }

  const $ = (selector, root = ui.stage) => root?.querySelector(selector) || null;
  const $$ = (selector, root = ui.stage) => (root ? [...root.querySelectorAll(selector)] : []);

  function setBusy(text, p) {
    ui.busy = { text, p };
    ui.error = '';
    redrawStatus();
  }

  function statusHtml() {
    if (ui.error) return `<div class="st" data-tone="err">${ti('warn')}<span class="grow">${esc(ui.error)}</span><button type="button" class="btn" data-act="refresh">${ti('refresh')}다시 시도</button></div>`;
    if (ui.busy) return `<div class="st"><span class="ld">${logo('loader')}</span><span class="grow">${esc(ui.busy.text)}</span></div><div class="prog ${ui.busy.p == null ? 'ind' : ''}"><i style="--w:${Math.round((ui.busy.p || 0) * 100)}%"></i></div>`;
    if (!state.store.updatedAt) return '<div class="st"></div>';
    if (ui.found) return `<div class="st found">${ti('check')}<span>새 분기 <b>${ui.found}</b>개를 찾았어요</span></div>`;
    const { groups } = buildForest();
    const count = groups.reduce((sum, group) => sum + group.count, 0);
    return `<div class="st">${ti('check')}<span>분기 방 <b>${count}</b>개, 작품 <b>${groups.length}</b>개 · ${checkedAtText(state.store.updatedAt)}에 확인</span></div>`;
  }

  function cfHtml() {
    return `<div class="cf" role="alertdialog"><b>처음부터 다시 찾을까요?</b><p>저장해 둔 분기 정보를 지우고 모든 분기 방을 다시 확인해요. 방이 많으면 몇 분 걸릴 수 있어요.</p><div><button type="button" class="btn" data-act="cfno">취소</button><button type="button" class="btn solid" data-act="cfyes" ${ui.busy ? 'disabled' : ''}>다시 찾기</button></div></div>`;
  }

  function panelHtml() {
    const here = parseLocation();
    const i = ui.scope === 'story' ? 0 : 1;
    const busy = !!ui.busy;
    return `<div class="ov" data-ov><div class="pn ${busy ? 'busy' : ''}" role="dialog" aria-modal="true" aria-label="갈래 매듭" tabindex="-1">
<div class="hd"><span class="mark spin-on-hover">${logo('weave')}</span><span class="ttl"><b>갈래 매듭</b><small>v${APP.version}</small></span><span class="grow"></span><button type="button" class="ib" data-act="close" aria-label="닫기">${ti('x')}</button></div>
<div class="tb"><div class="seg" style="--i:${i}"><i></i><button type="button" class="${i === 0 ? 'on' : ''}" data-act="scope" data-arg="story" ${here.storyId ? '' : 'disabled'}>이 작품</button><button type="button" class="${i === 1 ? 'on' : ''}" data-act="scope" data-arg="all">전체</button></div><span class="grow"></span><button type="button" class="btn rf" data-act="refresh" ${busy ? 'disabled' : ''}>${ti('refresh')}새로고침</button></div>
<div data-st>${statusHtml()}</div>
<div class="bd" data-body>${bodyHtml()}</div>
<div class="ft"><span>방을 누르면 그 방으로 이동해요</span><span class="grow"></span><button type="button" class="btn" data-act="recheck" ${busy ? 'disabled' : ''}>${ti('radar')}갈라진 지점 다시 찾기</button>${ui.confirm ? cfHtml() : ''}</div>
</div></div>`;
  }

  function bodyHtml() {
    const here = parseLocation();
    if (!state.store.updatedAt) {
      if (ui.busy) return `<div class="empty"><span class="art">${logo('loader')}</span><b>처음 한 번은 조금 걸려요</b><span>채팅방을 모두 훑어보면서 어디서 갈라졌는지 찾고 있어요.<br>다음부터는 바로 열려요.</span><div class="skel"><i></i><i></i><i></i></div></div>`;
      return `<div class="empty"><span class="art seed">${ti('seed')}</span><b>지도를 아직 그리지 못했어요</b><span>[새로고침]을 누르면 채팅방을 훑어서 지도를 그려요.</span></div>`;
    }
    ui.forest = buildForest();
    const groups = ui.scope === 'story' ? ui.forest.groups.filter(group => group.storyId === here.storyId) : ui.forest.groups;
    if (!groups.length) {
      return `<div class="empty"><span class="art seed">${ti('seed')}</span><b>${ui.scope === 'story' ? '이 작품에는 아직 분기 방이 없어요' : '분기로 만든 방이 아직 없어요'}</b><span>답변 메뉴의 [분기]로 새 가지를 만들 수 있어요.</span>${ui.scope === 'story' ? '<button type="button" class="btn" data-act="scope" data-arg="all" style="margin-top:8px">전체 지도 보기</button>' : ''}</div>`;
    }
    let k = 0;
    return groups.map(group => {
      const rows = [];
      const walk = (node, depth) => {
        rows.push([node, depth]);
        if (!ui.folded.has(node.id)) node.children.forEach(child => walk(child, depth + 1));
      };
      group.roots.forEach(root => walk(root, 0));
      const closed = ui.closedGroups.has(group.key);
      const isHere = here.storyId && group.storyId === here.storyId;
      return `<section class="grp ${closed ? 'closed' : ''}"><button type="button" class="gh" data-act="grp" data-arg="${esc(group.key)}" aria-expanded="${!closed}">${ti('down')}<span class="nm">${esc(group.storyName)}</span><span class="n">${group.count}</span>${isHere ? `<span class="here">${LIVE}지금 작품</span>` : ''}</button><div class="gb"><div><div class="tree" data-tree><svg></svg>${rows.map(([node, depth]) => nodeHtml(node, depth, k++, here)).join('')}</div></div></div></section>`;
    }).join('');
  }

  // 원본은 표지 카드, 분기는 레일 위의 줄입니다.
  function nodeHtml(node, depth, k, here) {
    const { id, room, info } = node;
    const isCur = id === here.chatId;
    const kk = Math.min(k, 24);
    const folded = ui.folded.has(id);
    const fold = node.desc ? `<button type="button" class="fold ${folded ? 'closed' : ''}" data-act="fold" data-arg="${id}" aria-label="가지 ${folded ? '펼치기' : '접기'}">${ti('down')}${node.desc}</button>` : '';
    const now = isCur ? `<i class="now">${LIVE}지금</i>` : '';
    const dt = room?.messagedAt ? `<span class="dt">${shortDate(room.messagedAt)}</span>` : '';
    const go = `<span class="go">${ti('go')}</span>`;

    if (!depth) {
      const missing = !room || room.missing;
      const pending = !missing && room.isBranch;
      const unresolved = pending && info && !info.failed;
      let cover = `${esc(firstChar(room?.title))}${room?.image ? `<img src="${esc(room.image)}" alt="" loading="lazy" decoding="async">` : ''}`;
      let sub = node.desc ? `원본 · 분기 ${node.desc}개` : '원본';
      if (missing) {
        cover = ti('unlink');
        sub = '지워졌거나 열 수 없는 방이에요';
      } else if (unresolved) {
        cover = ti('help');
        sub = '갈라진 지점을 찾지 못했어요';
      } else if (pending) {
        cover = ti('clock');
        sub = '갈라진 지점을 아직 확인하지 못했어요';
      }
      const title = missing ? (room?.title || '원본 방을 열 수 없어요') : room.title;
      const cls = `${missing ? 'missing' : ''} ${pending ? 'unres' : ''} ${isCur ? 'cur' : ''}`;
      const act = missing ? '' : `role="button" tabindex="0" data-act="goto" data-arg="${id}"`;
      return `<div class="nd top" style="--k:${kk}" data-id="${id}" data-depth="0"><div class="card ${cls}" ${act}><span class="cover" style="--h:${hueOf(id)}">${cover}</span><span class="cb"><b><span>${esc(title)}</span>${now}</b><small>${esc(sub)}</small></span>${missing ? '' : dt}${fold}${missing ? '' : go}</div></div>`;
    }

    const lv = Math.min(depth, 3);
    const isNew = !!ui.newIds?.has(id);
    const turn = info?.turn > 0 ? `${info.turn}턴` : '시작';
    const line = sceneLine(info);
    const label = `${room.title}, ${info?.turn > 0 ? `${info.turn}턴에서` : '시작에서'} 갈라짐`;
    return `<div class="nd br lv${lv} ${isCur ? 'cur' : ''} ${isNew ? 'new' : ''}" style="--d:${depth};--k:${kk}" data-id="${id}" data-parent="${node.parent.id}" data-depth="${depth}" role="button" tabindex="0" data-act="goto" data-arg="${id}" aria-label="${esc(label)}"><span class="turn">${turn}</span><span class="cb"><b><span>${esc(room.title)}</span>${now}${isNew ? '<i class="newchip">새로</i>' : ''}</b>${line ? `<small>${esc(line)}</small>` : ''}</span>${dt}${fold}${go}</div>`;
  }

  // 원본 카드 아래로 이어지는 레일과 갈림점을 실제 줄 위치에 맞춰 그립니다.
  function rails() {
    if (!ui.open || !ui.stage) return;
    const mobile = ui.stage.clientWidth <= 520;
    const BASE = mobile ? 26 : 28;
    const STEP = mobile ? 16 : 20;
    const cur = parseLocation().chatId;
    const hot = ancestorsOf(cur);
    const fresh = ui.fresh;
    $$('[data-tree]').forEach(tree => {
      const svg = tree.querySelector(':scope > svg');
      const pos = {};
      let lines = '';
      let dots = '';
      let k = 0;
      let f = 0;
      // 창이 열리며 움직이는 중에도 어긋나지 않도록 화면 위치 대신 배치 위치(offset)로 잽니다.
      tree.querySelectorAll('.nd').forEach(row => {
        const d = +row.dataset.depth;
        const card = d ? null : row.querySelector('.card');
        const y = d ? row.offsetTop + row.offsetHeight / 2 : row.offsetTop + card.offsetTop + card.offsetHeight;
        pos[row.dataset.id] = { d, x: BASE + d * STEP, y, top: !d };
      });
      tree.querySelectorAll('.nd.br').forEach(row => {
        const id = row.dataset.id;
        const p = pos[row.dataset.parent];
        const c = pos[id];
        if (!p || !c) return;
        const isHot = hot.has(id) && hot.has(row.dataset.parent);
        const lv = Math.min(c.d, 3);
        const isFresh = !!fresh?.has(id);
        const kk = Math.min(isFresh ? f++ : k, 24);
        const y0 = p.top ? p.y : p.y + 5;
        lines += `<path class="rl lv${lv} ${isHot ? 'hot' : ''} ${isFresh ? 'fresh' : ''}" data-c="${id}" pathLength="1" style="--k:${kk}" d="M${p.x} ${y0}V${c.y - 9}Q${p.x} ${c.y} ${p.x + 9} ${c.y}H${c.x}"/>`;
        dots += `${id === cur ? `<circle class="pulse" data-c="${id}" cx="${c.x}" cy="${c.y}" r="5"/>` : ''}<circle class="jn lv${lv} ${isHot ? 'hot' : ''} ${id === cur ? 'cur' : ''} ${isFresh ? 'fresh' : ''}" data-c="${id}" style="--k:${kk}" cx="${c.x}" cy="${c.y}" r="${lv === 1 ? 4.5 : lv === 2 ? 3.75 : 3}"/>`;
        if (!isFresh) k++;
      });
      svg.innerHTML = lines + dots;
    });
    ui.fresh = null;
  }

  function postRender() {
    if (ui.open) requestAnimationFrame(rails);
  }

  function redrawBody(quiet = false) {
    const body = $('[data-body]');
    if (!body) return;
    const top = body.scrollTop;
    body.innerHTML = bodyHtml();
    body.classList.toggle('quiet', !!quiet);
    body.scrollTop = top;
    postRender();
  }

  function redrawStatus() {
    const holder = $('[data-st]');
    if (!holder) return;
    const loader = holder.querySelector('.st .ld');
    if (ui.busy && loader && !ui.error) {
      // 진행 글자만 바꿔서 불러오기 애니메이션이 처음으로 되돌아가지 않게 합니다.
      holder.querySelector('.st .grow').textContent = ui.busy.text;
      const bar = holder.querySelector('.prog');
      bar.classList.toggle('ind', ui.busy.p == null);
      bar.firstElementChild.style.setProperty('--w', `${Math.round((ui.busy.p || 0) * 100)}%`);
    } else {
      holder.innerHTML = statusHtml();
    }
    $('.pn')?.classList.toggle('busy', !!ui.busy);
    $$('[data-act="refresh"],[data-act="recheck"],[data-act="cfyes"]').forEach(button => { button.disabled = !!ui.busy; });
  }

  function toast(message) {
    const stage = ensureStage();
    $$('.toast', stage).forEach(node => node.remove());
    stage.insertAdjacentHTML('beforeend', `<div class="toast">${ti('check')}${esc(message)}</div>`);
    const node = stage.lastElementChild;
    setTimeout(() => node.remove(), 2500);
  }

  function scrollToSelector(selector) {
    const body = $('[data-body]');
    const target = body && $(selector, body);
    if (!target) return;
    setTimeout(() => {
      const b = body.getBoundingClientRect();
      const r = target.getBoundingClientRect();
      body.scrollTo({ top: body.scrollTop + r.top - b.top - b.height / 2 + r.height / 2, behavior: 'smooth' });
    }, 250);
  }

  const scrollToCurrent = () => scrollToSelector('.card.cur,.nd.br.cur');

  function openPanel(scope) {
    const here = parseLocation();
    const stage = ensureStage();
    ui.scope = scope === 'story' && here.storyId ? 'story' : 'all';
    ui.confirm = false;
    if (!ui.open) ui.returnFocus = document.activeElement;
    ui.open = true;
    $('[data-ov]')?.remove();
    stage.insertAdjacentHTML('beforeend', panelHtml());
    $('.pn').focus({ preventScroll: true });
    postRender();
    scrollToCurrent();
    listenDocumentKeys(true);
    if (!state.refreshing && Date.now() - state.store.updatedAt > APP.autoRefreshMs) refresh();
  }

  function closePanel(after) {
    const overlay = $('[data-ov]');
    listenDocumentKeys(false);
    if (ui.open && !after && ui.returnFocus?.isConnected && ui.returnFocus !== document.body) {
      ui.returnFocus.focus({ preventScroll: true });
    }
    ui.returnFocus = null;
    ui.open = false;
    ui.confirm = false;
    if (!overlay) {
      after?.();
      return;
    }
    overlay.classList.add('out');
    setTimeout(() => {
      overlay.remove();
      after?.();
    }, 160);
  }

  function onRefreshDone({ firstLoad, newIds }, manual) {
    ui.forest = buildForest();
    if (!ui.open) return;
    if (!firstLoad && newIds.size) {
      ui.found = newIds.size;
      ui.newIds = newIds;
      ui.fresh = new Set(newIds);
      for (const id of newIds) {
        const node = ui.forest.nodes.get(id);
        if (!node) continue;
        for (let parent = node.parent; parent; parent = parent.parent) ui.folded.delete(parent.id);
        ui.closedGroups.delete(node.groupKey);
      }
      redrawStatus();
      redrawBody(true);
      scrollToSelector('.nd.br.new');
      toast('새 분기를 찾았어요');
      clearTimeout(ui.foundTimer);
      ui.foundTimer = setTimeout(() => {
        ui.found = 0;
        ui.newIds = null;
        redrawStatus();
        $$('.nd.br.new').forEach(row => row.classList.remove('new'));
        $$('.newchip').forEach(chip => chip.remove());
      }, 4200);
      return;
    }
    redrawStatus();
    redrawBody(!firstLoad);
    if (firstLoad) scrollToCurrent();
    else if (manual) toast('지도를 새로 고쳤어요');
  }

  // ---------- 마우스를 올리면 원본에서 그 방까지의 길만 남깁니다 ----------

  function trace(tree, id) {
    const ids = ancestorsOf(id);
    tree.classList.add('tracing');
    tree.querySelectorAll('.rl,.jn,.pulse').forEach(mark => mark.classList.toggle('tr', ids.has(mark.dataset.c)));
    tree.querySelectorAll('.nd.br').forEach(row => row.classList.toggle('tr', ids.has(row.dataset.id)));
  }

  function untrace(tree) {
    tree.classList.remove('tracing');
    tree.querySelectorAll('.tr').forEach(node => node.classList.remove('tr'));
  }

  // ---------- 이동 ----------

  function navigate(room) {
    const path = `/stories/${room.storyId}/episodes/${room.id}`;
    try {
      sessionStorage.setItem(APP.arriveKey, JSON.stringify({ id: room.id, title: room.title, at: Date.now() }));
    } catch (error) {
      console.warn(LOG, 'arrive flag failed', error);
    }
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

  function goto(id, el) {
    const room = ui.forest?.nodes.get(id)?.room;
    if (!room || room.missing || !room.storyId) return;
    if (id === parseLocation().chatId) {
      closePanel();
      return;
    }
    // 원본에서 그 방까지 길이 초록으로 그려진 뒤 창이 닫히고 이동합니다.
    const tree = el.closest('[data-tree]');
    if (tree) {
      untrace(tree);
      const ids = ancestorsOf(id);
      tree.querySelectorAll('.rl,.jn').forEach(mark => {
        if (ids.has(mark.dataset.c)) mark.classList.add('go');
      });
    }
    el.classList.add('going');
    $('.pn').style.pointerEvents = 'none';
    setTimeout(() => closePanel(() => navigate(room)), 460);
  }

  // ---------- 창 동작 ----------

  const ACT = {
    close: () => closePanel(),
    refresh: () => refresh({ manual: true }),
    scope(button) {
      const scope = button.dataset.arg;
      if (ui.scope === scope) return;
      ui.scope = scope;
      const dir = scope === 'all' ? 1 : -1;
      $('.seg').style.setProperty('--i', scope === 'story' ? 0 : 1);
      $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.arg === scope));
      const body = $('[data-body]');
      const fade = body.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${-dir * 10}px 0` }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
      fade.onfinish = () => {
        redrawBody();
        fade.cancel();
        scrollToCurrent();
      };
    },
    recheck() {
      ui.confirm = !ui.confirm;
      const footer = $('.ft');
      $('.cf', footer)?.remove();
      if (ui.confirm) footer.insertAdjacentHTML('beforeend', cfHtml());
    },
    cfno() {
      ui.confirm = false;
      $('.cf')?.remove();
    },
    cfyes() {
      ui.confirm = false;
      $('.cf')?.remove();
      refresh({ recheck: true, manual: true });
    },
    grp(button) {
      const key = button.dataset.arg;
      if (ui.closedGroups.has(key)) ui.closedGroups.delete(key);
      else ui.closedGroups.add(key);
      const closed = ui.closedGroups.has(key);
      button.closest('.grp').classList.toggle('closed', closed);
      button.setAttribute('aria-expanded', String(!closed));
    },
    fold(button, event) {
      event.stopPropagation();
      const id = button.dataset.arg;
      const tree = button.closest('[data-tree]');
      const desc = descendantsOf(id);
      if (!ui.folded.has(id)) {
        // 접기: 아래 줄이 위로 말려 들어갑니다.
        ui.folded.add(id);
        button.classList.add('closed');
        tree.querySelectorAll('.rl,.jn,.pulse').forEach(mark => {
          if (desc.includes(mark.dataset.c)) mark.style.opacity = '0';
        });
        desc.map(d => tree.querySelector(`.nd[data-id="${d}"]`)).filter(Boolean).forEach(row => row.animate(
          [{ opacity: 1, height: `${row.offsetHeight}px` }, { opacity: 0, height: '0px', minHeight: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' }],
          { duration: 220, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards' },
        ));
        setTimeout(() => redrawBody(true), 230);
      } else {
        // 펼치기: 가지가 다시 자라 나옵니다.
        ui.folded.delete(id);
        ui.fresh = new Set(desc);
        redrawBody(true);
        desc.forEach((d, i) => $(`.nd[data-id="${d}"]`)?.animate(
          [{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }],
          { duration: 260, delay: i * 35, easing: 'cubic-bezier(.2,0,0,1)', fill: 'backwards' },
        ));
      }
    },
    goto: (button) => goto(button.dataset.arg, button),
  };

  function bindStage(shadow) {
    shadow.addEventListener('click', event => {
      const button = event.target.closest('[data-act]');
      if (button && !button.disabled) {
        event.preventDefault();
        ACT[button.dataset.act]?.(button, event);
        return;
      }
      if (event.target.matches('[data-ov]')) closePanel();
    });
    shadow.addEventListener('keydown', event => {
      // 크랙의 단축키(Enter로 입력창 이동 등)가 창 뒤에서 반응하지 않게 막습니다. Esc는 문서 쪽에서 먼저 처리합니다.
      event.stopPropagation();
      const row = event.target.closest('[data-act="goto"]');
      if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        goto(row.dataset.arg, row);
      }
    });
    // 썸네일을 못 불러오면 그림을 치우고 첫 글자를 보여 줍니다.
    shadow.addEventListener('error', event => {
      if (event.target.matches?.('.cover img')) event.target.remove();
    }, true);
    shadow.addEventListener('keyup', event => event.stopPropagation());
    shadow.addEventListener('keypress', event => event.stopPropagation());
    shadow.addEventListener('pointerover', event => {
      if (event.pointerType === 'touch' || ui.stage.clientWidth <= 520) return;
      const tree = event.target.closest('[data-tree]');
      if (!tree) return;
      const row = event.target.closest('.nd.br');
      if (row && !row.classList.contains('going')) trace(tree, row.dataset.id);
      else untrace(tree);
    });
    shadow.addEventListener('pointerout', event => {
      const tree = event.target.closest('[data-tree]');
      if (tree && !tree.contains(event.relatedTarget)) untrace(tree);
    });
  }

  // 창이 열려 있는 동안 키 입력이 크랙 단축키(Enter로 입력창 이동 등)에 닿지 않게 합니다.
  // 창 안의 키는 창이 처리하고 거기서 멈추고, 버튼이 잠기거나 다시 그려져 포커스가 본문으로 빠졌을 때의 키는 여기서 막고 포커스를 창으로 돌립니다.
  function onDocumentKey(event) {
    if (!ui.open) return;
    if (event.type === 'keydown' && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (ui.confirm) ACT.cfno();
      else closePanel();
      return;
    }
    if (event.composedPath().includes(ui.host)) return;
    event.stopPropagation();
    if (event.type === 'keydown') $('.pn')?.focus({ preventScroll: true });
  }

  const DOCUMENT_KEYS = ['keydown', 'keyup', 'keypress'];
  const listenDocumentKeys = on => DOCUMENT_KEYS.forEach(type => (on ? document.addEventListener : document.removeEventListener).call(document, type, onDocumentKey, true));

  window.addEventListener('resize', () => postRender());

  // ---------- 크랙 화면에 붙이는 것 ----------

  function computeMarks() {
    const branch = new Set();
    const origin = new Map();
    const stories = new Set();
    const { nodes } = buildForest();
    for (const node of nodes.values()) {
      if (node.room?.storyId) stories.add(node.room.storyId);
      if (node.room?.isBranch) branch.add(node.id);
      else if (node.room && !node.room.missing && node.desc > 0) origin.set(node.id, node.desc);
    }
    ui.marks = { branch, origin, stories };
  }

  function iconButton(className, tip, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.tip = tip;
    button.setAttribute('aria-label', tip);
    button.innerHTML = logo('', 'cbk-');
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    button.cbkBound = true;
    return button;
  }

  // 크랙이 화면을 다시 그리며 버튼 모양만 복사해 둔 경우(눌러도 반응 없음)에는 새로 만듭니다.
  function liveButton(root, selector) {
    const button = root.querySelector(selector);
    if (button && !button.cbkBound) {
      button.remove();
      return null;
    }
    return button;
  }

  // 다른 방에서 지도로 이동해 왔다면 상단 버튼이 한 번 반응하고 알림을 띄웁니다.
  function consumeArrive(button, here) {
    let flag = null;
    try { flag = JSON.parse(sessionStorage.getItem(APP.arriveKey) || 'null'); } catch (error) { flag = null; }
    if (!flag) return;
    if (Date.now() - (flag.at || 0) > 15000) {
      try { sessionStorage.removeItem(APP.arriveKey); } catch (error) { /* 무시 */ }
      return;
    }
    if (flag.id !== here.chatId) return;
    try { sessionStorage.removeItem(APP.arriveKey); } catch (error) { /* 무시 */ }
    button.classList.remove('cbk-arrive');
    void button.offsetWidth;
    button.classList.add('cbk-arrive');
    setTimeout(() => button.classList.remove('cbk-arrive'), 2200);
    toast(`'${flag.title}'(으)로 이동했어요`);
  }

  // 채팅방 상단 줄의 오른쪽 묶음(모델 버튼이 있는 곳) 맨 앞에 붙입니다.
  function ensureHeaderButton() {
    const here = parseLocation();
    if (!here.chatId) return;
    const header = document.querySelector('.group\\/header');
    if (!header) return;
    let button = liveButton(header, '.cbk-hbtn');
    if (!button) {
      const group = header.querySelector('button[aria-haspopup="dialog"]')?.parentElement;
      if (!group) return;
      button = iconButton('cbk-hbtn cbk-tip cbk-spin', '갈래 매듭', () => openPanel('story'));
      group.insertBefore(button, group.firstChild);
    }
    const hasMap = ui.marks.stories.has(here.storyId);
    const dot = button.querySelector('.cbk-dot');
    if (hasMap && !dot) button.insertAdjacentHTML('beforeend', '<i class="cbk-dot" aria-hidden="true"></i>');
    else if (!hasMap && dot) dot.remove();
    consumeArrive(button, here);
  }

  // 데스크톱 사이드바와 모바일 서랍이 따로 있어서 제목 줄마다 확인합니다. 메뉴 버튼이 없는 파티챗 목록에는 붙이지 않습니다.
  function ensureSidebarButton() {
    document.querySelectorAll('.bg-sidebar div > span').forEach(label => {
      if (label.textContent.trim() !== '채팅 목록') return;
      const row = label.parentElement;
      const menu = row?.querySelector(':scope > button[aria-haspopup="menu"]');
      if (!menu || liveButton(row, '.cbk-mini')) return;
      row.insertBefore(iconButton('cbk-mini cbk-tip cbk-tip-end cbk-spin', '갈래 매듭 · 전체', () => openPanel('all')), menu);
    });
  }

  const FLAG_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true">${TI.flag}</svg>`;

  // 원본 방에는 "원본 · 분기 수" 표, 분기 방에는 작은 매듭 표시를 제목 앞에 둡니다.
  // 제목 글자를 크랙이 다시 그릴 때 함께 지워지지 않도록 제목 span 안이 아니라 바로 앞에 둡니다.
  function markSidebarRows() {
    const { branch, origin } = ui.marks;
    const cur = parseLocation().chatId;
    document.querySelectorAll('a.group\\/chat-list-item[href*="/episodes/"]').forEach(link => {
      const id = (link.getAttribute('href').match(/\/episodes\/([a-f0-9]{24})/i) || [])[1] || '';
      const want = origin.has(id) ? 'origin' : branch.has(id) ? 'branch' : '';
      const count = String(origin.get(id) || '');
      let mark = link.querySelector('[data-cbk-mark]');
      if (mark && (mark.dataset.cbkMark !== want || (want === 'origin' && mark.dataset.count !== count))) {
        mark.remove();
        mark = null;
      }
      if (!want) return;
      if (!mark) {
        const title = link.querySelector('span.typo-text-sm_leading-none_medium');
        if (!title?.parentElement) return;
        mark = document.createElement('span');
        mark.dataset.cbkMark = want;
        if (want === 'origin') {
          mark.className = 'cbk-origin';
          mark.dataset.count = count;
          mark.title = `원본 방 · 분기 ${count}개`;
          mark.innerHTML = `${FLAG_ICON}원본<b>${count}</b>`;
        } else {
          mark.className = 'cbk-bdg';
          mark.title = '분기로 만든 방';
          mark.innerHTML = logo('', 'cbk-');
        }
        title.parentElement.insertBefore(mark, title);
      }
      mark.classList.toggle('is-cur', id === cur);
    });
  }

  function updateHostUi() {
    computeMarks();
    ensureHeaderButton();
    markSidebarRows();
  }

  function ensureUi() {
    injectHostStyle();
    ensureHeaderButton();
    ensureSidebarButton();
    markSidebarRows();
  }

  computeMarks();
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
})();
