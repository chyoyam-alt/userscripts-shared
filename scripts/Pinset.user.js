// ==UserScript==
// @name         ✂️ Crack Pinset (핀셋 수정)
// @namespace    crack-pinset
// @version      0.1.5
// @description메시지에서 글자를 드래그하면 그 부분만 바로 고칩니다. 크랙 수정창을 열 필요가 없고 새로고침도 하지 않습니다. 고친 자리에는 주황색 흔적이 남고, 원래 글 보기·되돌리기를 할 수 있습니다.
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/Pinset.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/Pinset.user.js
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

// 동작 설명과 실기기 점검표: docs/pinset-guide.md · 아이콘: Lucide (ISC)

(() => {
  'use strict';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__crackPinsetRunning) return;
  pageWindow.__crackPinsetRunning = true;

  const VERSION = '0.1.5';
  const LOG = '[핀셋]';
  const API_BASE = 'https://crack-api.wrtn.ai/crack-gen';
  const SETTINGS_KEY = 'cpn:settings:v1';
  const INDEX_KEY = 'cpn:index:v1';
  const chatKey = chatId => `cpn:chat:${chatId}`;
  const LIMITS = Object.freeze({ edits: 30, undo: 10, messages: 120, chats: 150, soft: 8000 });
  const ID_RE = /^[a-f0-9]{24}$/i;
  const MSG_URL = /\/(?:v3\/chats|character-chats)\/([a-f0-9]{24})\/messages\/([a-f0-9]{24})(?:[?#]|$)/i;

  let debug = (() => {
    try { return pageWindow.localStorage.getItem('cpn:debug') === '1'; } catch (error) { return false; }
  })();
  const log = (...args) => { if (debug) console.log(LOG, ...args); };

  class UserError extends Error {}

  // ---------- 저장 ----------

  function readValue(key, fallback) {
    try {
      const value = GM_getValue(key, fallback);
      return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeValue(key, value) {
    try { GM_setValue(key, value); } catch (error) { console.warn(LOG, 'save failed', error); }
  }

  function deleteValue(key) {
    try { GM_deleteValue(key); } catch (error) { writeValue(key, {}); }
  }

  const settings = { paint: true, ...readValue(SETTINGS_KEY, {}) };
  // 다른 탭에서 '색칠'을 바꾸면 이 탭도 따라갑니다.
  if (typeof GM_addValueChangeListener === 'function') {
    try {
      GM_addValueChangeListener(SETTINGS_KEY, (name, before, after, remote) => {
        if (!remote || !after || typeof after !== 'object') return;
        settings.paint = after.paint !== false;
        schedulePaint(0);
      });
    } catch (error) { /* 무시 */ }
  }
  const books = new Map();
  const dirty = new Map();
  const watchedKeys = new Set();

  // 저장된 기록 가운데 모양이 이상한 것(손상·다른 판)은 버립니다.
  const isRecord = r => Boolean(r && typeof r === 'object' && typeof r.base === 'string' && typeof r.current === 'string' && Array.isArray(r.edits) && (r.spans === undefined || Array.isArray(r.spans)));
  function cleanBook(records) {
    const out = {};
    if (records && typeof records === 'object' && !Array.isArray(records)) {
      for (const [id, record] of Object.entries(records)) if (ID_RE.test(id) && isRecord(record)) out[id] = record;
    }
    return out;
  }

  // 방마다 { 메시지id: { base, current, spans, edits, at } }
  // base: 처음 본 원문, current: 마지막으로 확인한 서버 원문, spans: current 안에서 바뀐 자리 [시작, 끝] (끝=시작이면 지운 자리)
  function book(chatId) {
    if (!chatId) return {};
    if (!books.has(chatId)) {
      books.set(chatId, cleanBook(readValue(chatKey(chatId), {})));
      // 다른 탭이 같은 방 기록을 바꾸면 다시 읽습니다.
      if (!watchedKeys.has(chatId) && typeof GM_addValueChangeListener === 'function') {
        watchedKeys.add(chatId);
        try {
          GM_addValueChangeListener(chatKey(chatId), (name, before, after, remote) => {
            if (!remote) return;
            books.delete(chatId);
            schedulePaint();
          });
        } catch (error) { /* 무시 */ }
      }
    }
    return books.get(chatId);
  }

  function putRecord(chatId, msgId, record) {
    const records = book(chatId);
    if (record) records[msgId] = record;
    else delete records[msgId];
    const changes = dirty.get(chatId) || new Map();
    changes.set(msgId, record || null);
    dirty.set(chatId, changes);
  }

  // 다른 탭이 그사이 저장한 기록을 지우지 않도록, 저장된 것을 다시 읽어 이 탭이 바꾼 메시지만 덮어씁니다.
  function saveBook(chatId) {
    const records = cleanBook(readValue(chatKey(chatId), {}));
    (dirty.get(chatId) || new Map()).forEach((record, msgId) => {
      if (record) records[msgId] = record;
      else delete records[msgId];
    });
    dirty.delete(chatId);
    const ids = Object.keys(records);
    if (ids.length > LIMITS.messages) {
      ids.sort((a, b) => (records[b].at || 0) - (records[a].at || 0)).slice(LIMITS.messages).forEach(id => delete records[id]);
    }
    books.set(chatId, records);
    const index = readValue(INDEX_KEY, {});
    if (Object.keys(records).length) {
      writeValue(chatKey(chatId), records);
      index[chatId] = Date.now();
    } else {
      deleteValue(chatKey(chatId));
      delete index[chatId];
    }
    const chats = Object.keys(index);
    if (chats.length > LIMITS.chats) {
      chats.sort((a, b) => index[b] - index[a]).slice(LIMITS.chats).forEach(id => {
        delete index[id];
        books.delete(id);
        deleteValue(chatKey(id));
      });
    }
    writeValue(INDEX_KEY, index);
  }

  // ---------- 크랙 API (React 내부를 못 찾을 때만 씁니다) ----------

  function here() {
    const path = location.pathname;
    let m = path.match(/^\/stories\/([^/]+)\/episodes\/([a-f0-9]{24})/i);
    if (m) return { kind: 'story', chatId: m[2] };
    m = path.match(/^\/characters\/([^/]+)\/chats\/([a-f0-9]{24})/i);
    if (m) return { kind: 'character', chatId: m[2] };
    m = path.match(/^\/u\/([^/]+)\/c\/([a-f0-9]{24})/i);
    if (m) return { kind: 'character', chatId: m[2] };
    return { kind: '', chatId: '' };
  }

  const messagePath = (h, id) => (h.kind === 'character' ? `/character-chats/${h.chatId}/messages/${id}` : `/v3/chats/${h.chatId}/messages/${id}`);

  function getCookie(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function api(method, path, body) {
    const headers = { accept: 'application/json, text/plain, */*', platform: 'web', 'wrtn-locale': 'ko-KR' };
    const token = getCookie('access_token');
    if (token) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await fetch(API_BASE + path, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    } catch (error) {
      throw new UserError('크랙 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (error) { json = null; }
    if (!response.ok) throw new UserError(json?.message ? `크랙이 거절했어요: ${json.message}` : `크랙 서버 오류 (${response.status})`);
    return json && typeof json === 'object' && 'data' in json ? json.data : json;
  }

  // ---------- 크랙 내부 연결 (React fiber) ----------
  // 크랙 화면은 메시지 저장소(zustand)에서 그려집니다. 크랙이 쓰는 updateMessage를 그대로 부르면 새로고침 없이 바뀝니다.

  const rawEl = el => (el && el.wrappedJSObject) || el;

  function fiberOf(el) {
    for (let cur = el, depth = 0; cur && depth < 15; cur = cur.parentElement, depth += 1) {
      const raw = rawEl(cur);
      let key = null;
      try { key = Object.keys(raw).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$')); } catch (error) { key = null; }
      if (key && raw[key]) return raw[key];
    }
    return null;
  }

  function propValues(fiber) {
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

  // 화면 요소에 붙은 fiber는 처음 만들어질 때의 것이라, 위로 따라가다 보면 한 번 전 렌더의 값(alternate)을 만날 수 있습니다.
  // 맨 위(HostRoot)가 지금 화면의 것이 아니면 짝(alternate) 쪽 값을 씁니다.
  function isCurrentTree(fiber) {
    let top = fiber;
    for (let depth = 0; top.return && depth < 3000; depth += 1) top = top.return;
    const current = top.stateNode && top.stateNode.current;
    return !current || current === top;
  }
  const liveProps = fiber => ((fiber.alternate && !isCurrentTree(fiber) ? fiber.alternate : fiber).memoizedProps || fiber.memoizedProps);

  const isMapLike = value => Boolean(value && typeof value.get === 'function' && typeof value.has === 'function' && typeof value.forEach === 'function');
  const isActions = value => typeof value?.updateMessage === 'function' && typeof value.resyncMessage === 'function' && typeof value.removeMessage === 'function';
  const isChatState = value => Boolean(value && typeof value.status === 'string' && 'selectedMessageId' in value && 'chatId' in value);
  const isStore = value => {
    if (!value || typeof value.getState !== 'function' || typeof value.subscribe !== 'function') return false;
    try { return isMapLike(value.getState()?.messages); } catch (error) { return false; }
  };

  // ChatActions는 크랙이 다시 그릴 때마다 새로 만들어지므로 쓸 때마다 다시 찾습니다.
  function findBridge(anchor) {
    const h = here();
    const start = fiberOf(anchor) || fiberOf(document.querySelector('[data-message-group-id] .wrtn-markdown')) || fiberOf(document.querySelector('[data-message-group-id]'));
    const out = { fiber: Boolean(start), actions: null, state: null, store: null, mismatch: false };
    for (let fiber = start, depth = 0; fiber && depth < 500; fiber = fiber.return, depth += 1) {
      for (const value of propValues(fiber)) {
        try {
          for (const [slot, test] of [['actions', isActions], ['state', isChatState], ['store', isStore]]) {
            if (out[slot] || !test(value)) continue;
            const live = liveProps(fiber)?.value;
            out[slot] = live && test(live) ? live : value;
          }
        } catch (error) { /* 무시 */ }
      }
      if (out.actions && out.state && out.store) break;
    }
    if (out.state && h.chatId && String(out.state.chatId) !== h.chatId) {
      out.mismatch = true;
      out.actions = null;
    }
    if (out.store) watchStore(out.store);
    return out;
  }

  // 메시지 한 개의 화면 = 그룹 안의 .wrtn-markdown 전부. 캐릭터 채팅은 문단마다 말풍선(.wrtn-markdown)이 따로 있습니다.
  const groupOf = node => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('[data-message-group-id]') || null;
  const mdsOf = group => Array.from(group.querySelectorAll('.wrtn-markdown'));

  // 그룹이 어느 메시지인지 찾습니다. 그룹 id는 첫 메시지 id라서, 답변 비교 중이면 실제로 보이는 메시지와 다를 수 있습니다.
  // wanted가 있으면 그 id가 이 그룹에 없을 때 바로 null을 돌려줍니다(칠하기를 가볍게).
  function messageOf(group, bridge, wanted) {
    if (!group) return null;
    const groupId = group.dataset.messageGroupId;
    const mds = mdsOf(group);
    if (!mds.length) return null;
    let shown = null;
    let ids = null;
    for (let fiber = fiberOf(mds[0]), depth = 0; fiber && depth < 80; fiber = fiber.return, depth += 1) {
      const raw = fiber.memoizedProps;
      if (!raw || typeof raw !== 'object') continue;
      if (shown === null && typeof raw.content === 'string' && 'isUserMessage' in raw) shown = liveProps(fiber)?.content ?? raw.content;
      if (Array.isArray(raw.messageIds)) {
        ids = Array.from(liveProps(fiber)?.messageIds || raw.messageIds);
        break;
      }
    }
    const state = bridge?.store ? bridge.store.getState() : null;
    if (!ids && state?.messageGroups) {
      const found = Array.from(state.messageGroups).find(item => item && item[0] === groupId);
      if (found) ids = Array.from(found);
    }
    if (!ids) ids = [groupId];
    if (wanted && !ids.some(id => wanted.has(id))) return null;
    let message = null;
    if (state) {
      const candidates = ids.map(id => state.messages.get(id)).filter(item => item && typeof item.content === 'string');
      // 같은 글의 답변이 여럿이면 크랙이 고른 답변(selectedMessageId), 없으면 마지막 답변을 씁니다.
      const selectedId = bridge?.state?.selectedMessageId;
      const pick = list => list.find(item => item._id === selectedId) || list[list.length - 1] || null;
      // props 글과 정확히 같은지는 말풍선이 하나일 때만 믿습니다(말풍선이 여럿이면 props는 첫 문단뿐).
      message = shown !== null && mds.length === 1 ? pick(candidates.filter(item => item.content === shown)) : null;
      if (!message && candidates.length > 1) {
        // 문단별 말풍선이라 props가 문단 하나뿐이면, 화면 글과 가장 잘 맞는 답변을 고릅니다. 점수가 같으면 위 규칙으로 고릅니다.
        let best = -1;
        let ties = [];
        for (const item of candidates) {
          const score = coverage(item.content, mds);
          if (score > best + 1e-9) {
            best = score;
            ties = [item];
          } else if (Math.abs(score - best) <= 1e-9) ties.push(item);
        }
        message = best < 0.9 ? null : pick(ties);
      }
      if (!message && candidates.length) {
        const index = ids.indexOf(bridge.state?.selectedMessageId ?? '');
        message = state.messages.get(ids[index >= 0 ? index : ids.length - 1]) || candidates[candidates.length - 1];
      }
    }
    return {
      group,
      mds,
      groupId,
      ids,
      msgId: message?._id || (ids.length === 1 ? ids[0] : null),
      content: typeof message?.content === 'string' ? message.content : shown,
      fromStore: Boolean(message),
    };
  }

  const streamingNow = () => Boolean(document.querySelector('.wrtn-markdown .animate'));
  const nativeEditorOpen = group => Boolean(group?.querySelector('.ProseMirror:not(.__chat_input_textarea), [contenteditable="true"]:not(.__chat_input_textarea)'));
  const normalize = text => String(text ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');

  // ---------- 원문 ↔ 화면 글자 맞추기 ----------

  // 화면에 안 그려지는 것: 링크 정의 줄([//]: # (…), [//]: <> (…)), 이미지, 링크 주소 부분(](…)), 줄 앞 목록·인용·제목 기호.
  // HTML 주석은 크랙이 글자 그대로 보여 주므로, 화면에 '<!--'가 없을 때(다른 확프가 지운 경우)만 뺍니다.
  // 정의 줄의 제목 (…)은 다음 줄이나 여러 줄에 걸칠 수도 있습니다(빈 줄 전까지). 크랙도 이것을 숨깁니다.
  const LINK_DEF_RE = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\n?[ \t]*(?:<[^>\n]*>|[^\s<>]+)(?:[ \t]*\n?[ \t]*(?:"(?:[^"\n]|\n(?![ \t]*\n))*"|'(?:[^'\n]|\n(?![ \t]*\n))*'|\((?:[^()\n]|\n(?![ \t]*\n))*\)))?[ \t]*(?:\n|$)/gm;
  // 표의 정렬 줄(|:---|---:|)
  const TABLE_DELIM_RE = /^[ \t]*\|?(?:[ \t]*:?-+:?[ \t]*\|)+(?:[ \t]*:?-+:?[ \t]*)?$/gm;
  const IMAGE_RE = /!\[[^\]\n]*\]\([^)\n]*\)/g;
  const LINK_DEST_RE = /\]\([^)\n]*\)/g;
  const COMMENT_RE = /<!--[\s\S]*?-->/g;
  const BLOCK_MARK_RE = /^[ \t]*(?:>[ \t]?|(?:\d{1,9}[.)]|[-+*]|#{1,6})[ \t]+)+/gm;

  // 코드블록(``` 또는 ~~~) 안쪽 범위. 그 안의 '- '·'1. '·'[x]: …' 같은 줄은 화면에 글자 그대로 보입니다.
  // 여는 줄의 정보 문자열(```INFO)은 크랙이 코드블록 머리표로 보여 주므로 빼지 않습니다.
  function fenceRanges(src) {
    const out = [];
    let open = null;
    const re = /^[ \t]{0,3}(`{3,}|~{3,})([^\n]*)$/gm;
    let m;
    while ((m = re.exec(src))) {
      if (!open) {
        if (m[1][0] === '`' && m[2].includes('`')) continue;
        open = { start: m.index + m[0].length, ch: m[1][0], len: m[1].length };
      } else if (m[1][0] === open.ch && m[1].length >= open.len && !m[2].trim()) {
        out.push([open.start, m.index]);
        open = null;
      }
    }
    if (open) out.push([open.start, src.length]);
    return out;
  }

  function stripHidden(src, ren) {
    const drop = new Uint8Array(src.length);
    const fences = fenceRanges(src);
    const inFence = i => fences.some(([s, e]) => i >= s && i < e);
    const res = [LINK_DEF_RE, IMAGE_RE, LINK_DEST_RE, BLOCK_MARK_RE, TABLE_DELIM_RE];
    if (!ren.includes('<!--')) res.push(COMMENT_RE);
    for (const re of res) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        if (!m[0].length) {
          re.lastIndex += 1;
          continue;
        }
        if (inFence(m.index)) continue;
        // 문단에 바로 붙은 정의 줄은 문단을 끊지 못해 화면에 글자 그대로 보입니다.
        if (re === LINK_DEF_RE && ren.includes(m[0].trim())) continue;
        // 문단 바로 다음 줄의 '2. '처럼 1이 아닌 번호도 문단을 끊지 못해 글자 그대로 보입니다.
        if (re === BLOCK_MARK_RE && m.index > 0 && /^[ \t]*\d/.test(m[0]) && !/^[ \t]*0*1[.)]/.test(m[0])) {
          const prevEnd = m.index - 1;
          const prevLine = src.slice(src.lastIndexOf('\n', prevEnd - 1) + 1, prevEnd);
          if (prevLine.trim() && !/^[ \t]{0,3}(?:\d{1,9}[.)]|[-+*]|#{1,6}|`{3,}|~{3,})(?:[ \t]|$)/.test(prevLine) && !/^[ \t]*\|/.test(prevLine)) continue;
        }
        drop.fill(1, m.index, m.index + m[0].length);
      }
    }
    const keep = [];
    const parts = [];
    for (let i = 0; i < src.length; i += 1) {
      if (drop[i]) continue;
      keep.push(i);
      parts.push(src[i]);
    }
    return { text: parts.join(''), keep };
  }

  const SKIP_SEL = 'button, svg, style, script, textarea, input, select, [aria-hidden="true"], .cpn-ui';

  function renderedText(mds) {
    const nodes = [];
    let text = '';
    for (const md of mds) {
      const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          const skip = node.parentElement?.closest(SKIP_SEL);
          return skip && md.contains(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node, start: text.length });
        text += node.nodeValue;
      }
    }
    return { text, nodes };
  }

  const SYNTAX = new Set('*_~`#>|-+=[]()!\\'.split(''));
  const SPACE = /\s/;
  const LETTER = /[\p{L}\p{N}]/u;
  const entityBox = document.createElement('textarea');
  function decodeEntity(entity) {
    entityBox.innerHTML = entity;
    return entityBox.value;
  }

  // 화면 글자는 원문에서 서식 기호만 빠진 모양이라, 앞에서부터 짝을 지어 갑니다. 어긋나면 다음 몇 글자를 원문에서 찾아 다시 맞춥니다.
  // 그렇게 건너뛰면서 글자(기호가 아닌 것)를 넘긴 자리는 jumps에 표시해 두고, 그 자리를 고칠 때는 원문 창으로 넘깁니다.
  function align(src, ren) {
    const r2s = new Int32Array(ren.length).fill(-1);
    const jumps = new Uint8Array(ren.length);
    let i = 0;
    let j = 0;
    while (j < ren.length && i < src.length) {
      const a = src[i];
      const c = ren[j];
      // 문자 참조(&amp; 등)를 먼저 봅니다. '&' 한 글자만 짝지으면 'amp;'가 남거나 엉뚱한 곳으로 건너뜁니다.
      // 인라인 코드처럼 참조가 화면에도 그대로 보이면 보통 글자로 맞춥니다.
      if (a === '&') {
        const entity = /^&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.exec(src.slice(i, i + 12));
        if (entity && !ren.startsWith(entity[0], j) && decodeEntity(entity[0]) === c) {
          jumps[j] = 1;
          r2s[j] = i;
          i += entity[0].length;
          j += 1;
          continue;
        }
      }
      if (a === c) {
        r2s[j] = i;
        i += 1;
        j += 1;
        continue;
      }
      if (SPACE.test(c) && !SPACE.test(a) && !SYNTAX.has(a)) {
        j += 1;
        continue;
      }
      if (SYNTAX.has(a) || SPACE.test(a)) {
        if (a === '\\') jumps[j] = 1;
        i += 1;
        continue;
      }
      const probe = ren.slice(j, j + 6);
      const k = probe.length >= 2 ? src.indexOf(probe, i) : -1;
      if (k >= 0 && k - i < 600) {
        if (LETTER.test(src.slice(i, k))) jumps[j] = 1;
        i = k;
        continue;
      }
      jumps[j] = 1;
      j += 1;
    }
    return { r2s, jumps };
  }

  // 뒤에서부터 맞춘 결과. 앞에서 맞춘 자리와 다르면 숨은 글(주석 등)에 같은 말이 있어 헷갈린 것이므로 원문 창으로 넘깁니다.
  function alignBack(src, ren) {
    const rev = text => text.split('').reverse().join('');
    const { r2s } = align(rev(src), rev(ren));
    const out = new Int32Array(ren.length).fill(-1);
    for (let j = 0; j < ren.length; j += 1) {
      const s = r2s[ren.length - 1 - j];
      out[j] = s < 0 ? -1 : src.length - 1 - s;
    }
    return out;
  }

  function offsetOf(nodes, root, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      const hit = nodes.find(item => item.node === container);
      if (hit) return hit.start + offset;
    }
    const before = document.createRange();
    before.setStart(root, 0);
    try { before.setEnd(container, offset); } catch (error) { return -1; }
    let pos = 0;
    for (const item of nodes) {
      if (before.intersectsNode(item.node)) pos = item.start + item.node.nodeValue.length;
      else break;
    }
    return pos;
  }

  function rangeFor(nodes, start, end) {
    const locate = (pos, isEnd) => {
      let lo = 0;
      let hi = nodes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (nodes[mid].start < pos || (!isEnd && nodes[mid].start === pos)) lo = mid;
        else hi = mid - 1;
      }
      const item = nodes[lo];
      return [item.node, Math.max(0, Math.min(item.node.nodeValue.length, pos - item.start))];
    };
    if (!nodes.length || end <= start) return null;
    const range = document.createRange();
    const [sn, so] = locate(start, false);
    const [en, eo] = locate(end, true);
    try {
      range.setStart(sn, so);
      range.setEnd(en, eo);
    } catch (error) {
      return null;
    }
    return range;
  }

  // 선택한 화면 글자 → 원문 위치. 결과의 oldText는 '보이는 글자(와 공백)'만 모은 것이고, vpos는 그 글자들의 원문 위치입니다.
  function mapSelection(mds, range, src) {
    const { text: ren, nodes } = renderedText(mds);
    let rs = offsetOf(nodes, mds[0], range.startContainer, range.startOffset);
    let re = offsetOf(nodes, mds[0], range.endContainer, range.endOffset);
    if (rs < 0 || re < 0) return { ok: false };
    if (rs > re) [rs, re] = [re, rs];
    while (rs < re && SPACE.test(ren[rs])) rs += 1;
    while (re > rs && SPACE.test(ren[re - 1])) re -= 1;
    if (rs >= re) return { ok: false };
    const stripped = stripHidden(src, ren);
    const { r2s, jumps } = align(stripped.text, ren);
    const back = alignBack(stripped.text, ren);
    const visible = new Uint8Array(src.length);
    let first = -1;
    let last = -1;
    let missing = 0;
    for (let j = rs; j < re; j += 1) {
      const s = r2s[j];
      if (jumps[j]) missing += 1;
      if (s >= 0 && !SPACE.test(ren[j]) && back[j] !== s) missing += 1;
      if (s < 0) {
        if (!SPACE.test(ren[j])) missing += 1;
        continue;
      }
      if (first >= 0 && s <= last) missing += 1;
      if (first < 0) first = s;
      last = s;
      visible[stripped.keep[s]] = 1;
    }
    const shownText = ren.slice(rs, re);
    if (first < 0) return { ok: false, shownText };
    const a = stripped.keep[first];
    const b = stripped.keep[last] + 1;
    if (missing) return { ok: false, approx: [a, b], shownText };
    const inStripped = new Uint8Array(src.length);
    stripped.keep.forEach(index => { inStripped[index] = 1; });
    let oldText = '';
    const vpos = [];
    for (let i = a; i < b; i += 1) {
      if (visible[i] || (inStripped[i] && SPACE.test(src[i]))) {
        oldText += src[i];
        vpos.push(i);
      }
    }
    return { ok: true, a, b, oldText, vpos, shownText };
  }

  // 화면 글자 중 원문과 짝이 맞은 비율. 화면이 정말 그 원문인지 판단하는 데 씁니다.
  function coverage(src, mds) {
    const { text: ren } = renderedText(mds);
    const { r2s } = align(stripHidden(src, ren).text, ren);
    let total = 0;
    let hit = 0;
    for (let j = 0; j < ren.length; j += 1) {
      if (SPACE.test(ren[j])) continue;
      total += 1;
      if (r2s[j] >= 0) hit += 1;
    }
    return total ? hit / total : 0;
  }

  // 원문 위치(spans) → 화면 Range
  function rangesFor(mds, record) {
    const { text: ren, nodes } = renderedText(mds);
    const stripped = stripHidden(record.current, ren);
    const { r2s } = align(stripped.text, ren);
    const s2r = new Int32Array(record.current.length).fill(-1);
    for (let j = 0; j < r2s.length; j += 1) if (r2s[j] >= 0) s2r[stripped.keep[r2s[j]]] = j;
    const ranges = [];
    const cuts = [];
    for (const [s, e] of record.spans || []) {
      if (e > s) {
        let runStart = -1;
        let prev = -2;
        const flush = () => {
          if (runStart >= 0) {
            const range = rangeFor(nodes, runStart, prev + 1);
            if (range) ranges.push(range);
          }
        };
        for (let i = s; i < Math.min(e, s2r.length); i += 1) {
          const j = s2r[i];
          if (j < 0) continue;
          if (j !== prev + 1) {
            flush();
            runStart = j;
          }
          prev = j;
        }
        flush();
      } else {
        // 지운 자리: 같은 줄의 뒤 글자 → 같은 줄의 앞 글자 → (그래도 없으면) 줄을 넘어서 찾습니다.
        // 줄 끝을 지웠을 때 밑줄이 다음 문단 첫 글자에 그어지지 않게 하고, 공백·줄바꿈 글자에는 긋지 않습니다.
        const cur = record.current;
        const shown = i => (s2r[i] >= 0 && !SPACE.test(ren[s2r[i]]) ? s2r[i] : -1);
        let j = -1;
        for (let i = s; i < Math.min(s2r.length, s + 40) && j < 0 && cur[i] !== '\n'; i += 1) j = shown(i);
        for (let i = s - 1; i >= Math.max(0, s - 40) && j < 0 && cur[i] !== '\n'; i -= 1) j = shown(i);
        for (let i = s; i < Math.min(s2r.length, s + 40) && j < 0; i += 1) j = shown(i);
        for (let i = s - 1; i >= Math.max(0, s - 40) && j < 0; i -= 1) j = shown(i);
        if (j >= 0) {
          const range = rangeFor(nodes, j, j + 1);
          if (range) cuts.push(range);
        }
      }
    }
    return { ranges, cuts };
  }

  // ---------- 바꿀 자리 계산 ----------

  const isDelim = ch => ch === '*' || ch === '_' || ch === '~';

  // 안전망: CommonMark 강조 규칙(process emphasis)으로 한 블록에서 짝을 못 찾아 글자로 남는 * _ 개수.
  // 고친 뒤 이 수가 늘면 화면에 별표·밑줄이 드러나는 것이므로 원문 창으로 넘깁니다.
  function emphasisLeft(s) {
    const ws = c => c === undefined || /\s/.test(c);
    const pu = c => c !== undefined && /[\p{P}\p{S}]/u.test(c);
    // 이모지 같은 서로게이트 쌍은 한 글자(코드 포인트)로 봅니다.
    const prevCp = idx => {
      if (idx <= 0) return undefined;
      const lo = s.charCodeAt(idx - 1);
      if (lo >= 0xdc00 && lo <= 0xdfff && idx >= 2) {
        const hi = s.charCodeAt(idx - 2);
        if (hi >= 0xd800 && hi <= 0xdbff) return s.slice(idx - 2, idx);
      }
      return s[idx - 1];
    };
    const nextCp = idx => (idx >= s.length ? undefined : String.fromCodePoint(s.codePointAt(idx)));
    const D = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
        i += 2;
        continue;
      }
      if (c === '`') {
        let e = i;
        while (s[e] === '`') e += 1;
        const n = e - i;
        let k = e;
        let found = -1;
        while (k < s.length) {
          if (s[k] === '`') {
            let f = k;
            while (s[f] === '`') f += 1;
            if (f - k === n) {
              found = f;
              break;
            }
            k = f;
          } else k += 1;
        }
        i = found >= 0 ? found : e;
        continue;
      }
      if (c === '*' || c === '_') {
        let e = i;
        while (s[e] === c) e += 1;
        const p = prevCp(i);
        const n = nextCp(e);
        const L = !ws(n) && (!pu(n) || ws(p) || pu(p));
        const R = !ws(p) && (!pu(p) || ws(n) || pu(n));
        const open = c === '_' ? L && (!R || pu(p)) : L;
        const close = c === '_' ? R && (!L || pu(n)) : R;
        D.push({ c, n: e - i, len: e - i, open, close, dead: false });
        i = e;
        continue;
      }
      i += 1;
    }
    for (let ci = 0; ci < D.length; ci += 1) {
      const cl = D[ci];
      if (!cl.close || cl.dead) continue;
      while (cl.n > 0) {
        let oi = -1;
        for (let k = ci - 1; k >= 0; k -= 1) {
          const op = D[k];
          if (op.dead || op.n === 0 || op.c !== cl.c || !op.open) continue;
          if ((op.close || cl.open) && (op.len + cl.len) % 3 === 0 && !(op.len % 3 === 0 && cl.len % 3 === 0)) continue;
          oi = k;
          break;
        }
        if (oi < 0) break;
        const op = D[oi];
        const use = op.n >= 2 && cl.n >= 2 ? 2 : 1;
        op.n -= use;
        cl.n -= use;
        for (let k = oi + 1; k < ci; k += 1) D[k].dead = true;
      }
    }
    return D.reduce((sum, d) => sum + d.n, 0);
  }

  function literalDelims(text) {
    const blocks = [];
    let cur = [];
    const flush = () => {
      if (cur.length) blocks.push(cur.join('\n'));
      cur = [];
    };
    for (const raw of String(text).split('\n')) {
      if (/^[ \t]*$/.test(raw) || /^[ \t]{0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*$/.test(raw) || /^[ \t]{0,3}\[[^\]\n]+\]:/.test(raw)) {
        flush();
        continue;
      }
      const m = /^[ \t]*(?:>[ \t]?|(?:\d{1,9}[.)]|[-+*]|#{1,6})[ \t]+)+/.exec(raw);
      if (m) {
        flush();
        cur.push(raw.slice(m[0].length));
      } else cur.push(raw);
    }
    flush();
    return blocks.reduce((sum, block) => sum + emphasisLeft(block), 0);
  }

  // 선택한 글(oldText)과 새 글을 앞뒤로 비교해 실제로 달라진 가운데만 원문에서 바꿉니다. 그래서 서식 기호는 대부분 제자리에 남습니다.
  // 바꾸면 서식이 깨질 수 있는 경우는 null을 돌려주고, 그때는 원문 창으로 넘깁니다.
  function planSplice(src, mapped, replacement) {
    const old = mapped.oldText;
    const vpos = mapped.vpos;
    const max = Math.min(old.length, replacement.length);
    let p = 0;
    while (p < max && old[p] === replacement[p]) p += 1;
    if (p > 0 && /[\uD800-\uDBFF]/.test(old[p - 1])) p -= 1;
    let s = 0;
    while (s < max - p && old[old.length - 1 - s] === replacement[replacement.length - 1 - s]) s += 1;
    if (s > 0 && /[\uDC00-\uDFFF]/.test(old[old.length - s])) s -= 1;
    const oldEnd = old.length - s;
    const ins = replacement.slice(p, replacement.length - s);
    let a;
    let b;
    if (oldEnd > p) {
      a = vpos[p];
      b = vpos[oldEnd - 1] + 1;
    } else {
      a = p > 0 ? vpos[p - 1] + 1 : vpos[0];
      // 줄바꿈 바로 뒤에 넣는 글은 그 줄의 목록·인용 기호 뒤에 넣습니다(- 첫째\n그리고 - 둘째 가 되지 않게).
      if (p > 0 && src[a - 1] === '\n') {
        const mark = /^[ \t]*(?:>[ \t]?|(?:\d{1,9}[.)]|[-+*]|#{1,6})[ \t]+)+/.exec(src.slice(a));
        if (mark) a += mark[0].length;
      }
      b = a;
    }
    const changed = new Set(vpos.slice(p, oldEnd));
    let kept = '';
    for (let i = a; i < b; i += 1) if (!changed.has(i)) kept += src[i];
    const removed = src.slice(a, b);
    // 바뀌는 가운데에 기울임·굵게 기호가 끼어 있으면 그 기호를 새 글 바로 뒤에 둡니다.
    // 기호 양옆이 글자일 때만 서식이 유지되므로, 공백·줄바꿈이 닿거나 다른 기호(목록·링크·이스케이프)가 끼면 원문 창으로 넘깁니다.
    // 밑줄(_)은 단어 안에서 열고 닫히지 않으므로 옮기지 않고, 기호 양옆은 둘 다 글자여야 합니다(공백·문장부호가 닿으면 서식이 풀림).
    if (kept) {
      if (!/^[*~]+$/.test(kept) || removed.includes('\n') || ins.includes('\n')) return null;
      const before = ins ? ins[ins.length - 1] : src[a - 1];
      const after = src[b];
      if (!before || !after || !LETTER.test(before) || !LETTER.test(after)) return null;
    }
    // 새 글의 앞뒤 공백이 기호 안쪽에 붙으면(*비가 오기 *) 서식이 풀립니다.
    if (/^\s/.test(ins) && isDelim(src[a - 1])) return null;
    if (/\s$/.test(ins) && !kept && isDelim(src[b])) return null;
    // 서식이 있는 문단 안에 줄바꿈을 넣으면 기울임이 풀려 별표가 보이므로 원문 창에서 합니다.
    if (ins.includes('\n')) {
      const ps = src.lastIndexOf('\n\n', a);
      const pe = src.indexOf('\n\n', b);
      if (/[*_~`]/.test(src.slice(ps < 0 ? 0 : ps, pe < 0 ? src.length : pe))) return null;
      // 새 줄의 맨 앞이 '- '·'> '·'1. '처럼 되면 목록·인용이 됩니다.
      const le = src.indexOf('\n', b);
      const tail = ins.slice(ins.lastIndexOf('\n') + 1) + src.slice(b, le < 0 ? src.length : le);
      if (/^[ \t]*(?:>|(?:\d{1,9}[.)]|[-+*]|#{1,6})(?:[ \t]|$))/.test(tail)) return null;
    }
    // 줄을 합치면 다음 줄 앞의 목록·인용·제목 기호가 글자로 남으므로 원문 창에서 합니다.
    if (removed.includes('\n')) {
      const lineAt = src.lastIndexOf('\n', b - 1) + 1;
      if (lineAt > a && /^[ \t]*(?:>|(?:\d{1,9}[.)]|[-+*]|#{1,6})[ \t])/.test(src.slice(lineAt))) return null;
    }
    if (!ins && !kept) [a, b] = tidyDelete(src, a, b);
    const next = src.slice(0, a) + ins + kept + src.slice(b);
    // 안전망 1: 짝 없는(글자로 보일) * _ 가 늘면 원문 창. 새 글에 사용자가 직접 쓴 * _ 만큼은 허용합니다(snake_case 같은 글).
    if (literalDelims(next) - literalDelims(src) > (ins.match(/[*_]/g) || []).length) return null;
    // 안전망 2: 새 글이 직접 넣은 것 말고, 줄 앞 목록·인용·제목 기호 줄이 새로 생기면 원문 창
    const BM = /^[ \t]*(?:>|(?:\d{1,9}[.)]|[-+*]|#{1,6})(?:[ \t]|$))/;
    const marks = text => text.split('\n').filter(line => BM.test(line)).length;
    const typed = ins.split('\n').slice(1).filter(line => BM.test(line)).length;
    if (marks(next) > marks(src) + typed) return null;
    return { a, b, ins, kept, next };
  }

  const isBlank = ch => ch === ' ' || ch === '\t';
  const CLOSE_NEXT = /[\s.,!?…~"'”’」』)\]]/;

  // 지운 뒤 서식이 깨지지 않게 다듬습니다.
  // 1) *글*·`코드`의 글을 통째로 지우면 남는 빈 기호 쌍(**, ****, ``)도 지웁니다.
  // 2) 닫는 기호 바로 앞(*글 *)이나 여는 기호 바로 뒤(* 글*)에 공백이 남으면 그 공백을 지웁니다.
  //    크랙에서는 이럴 때 기울임이 풀려 별표가 그대로 보이기 때문입니다. 단어 사이 공백(**철수** 학교)은 건드리지 않습니다.
  function tidyDelete(src, a, b) {
    for (let guard = 0; guard < 3; guard += 1) {
      const left = /[*_~`]+$/.exec(src.slice(Math.max(0, a - 4), a))?.[0] || '';
      const right = /^[*_~`]+/.exec(src.slice(b, b + 4))?.[0] || '';
      if (!left || !right) break;
      const ch = right[0];
      let l = 0;
      while (l < left.length && left[left.length - 1 - l] === ch) l += 1;
      let r = 0;
      while (r < right.length && right[r] === ch) r += 1;
      const k = Math.min(l, r);
      if (!k) break;
      // 짝이 아닌 기호(여는 쪽 앞이 글자, 밑줄 닫는 쪽 뒤가 글자)는 빈 쌍이 아니므로 넓히지 않습니다.
      const ls = a - left.length;
      if (ls > 0 && !/[\s\p{P}\p{S}]/u.test(src[ls - 1])) break;
      if (ch === '_' && b + right.length < src.length && !/[\s\p{P}\p{S}]/u.test(src[b + right.length])) break;
      a -= k;
      b += k;
    }
    const closerAt = i => {
      if (!isDelim(src[i])) return false;
      let j = i;
      while (isDelim(src[j])) j += 1;
      if (j >= src.length || CLOSE_NEXT.test(src[j])) return true;
      // *비가 내리기*를 처럼 닫는 기호 바로 뒤에 조사가 붙은 경우: 앞쪽에 짝 없는 여는 기호가 있을 때만 닫는 기호로 봅니다.
      if (src[i] === '_' || !LETTER.test(src[j])) return false;
      const ps = src.lastIndexOf('\n\n', i);
      const head = src.slice(ps < 0 ? 0 : ps, i);
      return ((head.match(src[i] === '*' ? /\*+/g : /~+/g) || []).length % 2) === 1;
    };
    const openerBefore = i => {
      let j = i;
      while (j > 0 && isDelim(src[j - 1])) j -= 1;
      return j < i && (j === 0 || SPACE.test(src[j - 1]));
    };
    const lineStart = a === 0 || src[a - 1] === '\n';
    if (isBlank(src[a - 1]) && (b >= src.length || src[b] === '\n' || closerAt(b))) {
      while (a > 0 && isBlank(src[a - 1])) a -= 1;
    } else if (isBlank(src[b]) && (lineStart || openerBefore(a))) {
      while (b < src.length && isBlank(src[b])) b += 1;
    } else if (isBlank(src[a - 1]) && isBlank(src[b])) {
      // 낱말을 통째로 지워 양옆 공백이 두 칸 남으면 한 칸으로 줄입니다(크랙은 공백을 그대로 보여 줘서 두 칸이 보임).
      b += 1;
    }
    return [a, b];
  }

  // ---------- 흔적 계산 ----------

  // [a, b) 자리를 newLen 글자로 바꿨을 때 이전 흔적 위치를 옮기고, 새로 바뀐 자리(repLen)를 더합니다.
  function shiftSpans(spans, a, b, newLen, repLen) {
    const delta = newLen - (b - a);
    const out = [];
    for (const [s, e] of spans || []) {
      if (e === s) {
        if (s < a) out.push([s, s]);
        else if (s > b) out.push([s + delta, s + delta]);
        continue;
      }
      if (e <= a) out.push([s, e]);
      else if (s >= b) out.push([s + delta, e + delta]);
      else {
        if (s < a) out.push([s, a]);
        if (e > b) out.push([b + delta, e + delta]);
      }
    }
    out.push(repLen > 0 ? [a, a + repLen] : [a, a]);
    out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const merged = [];
    for (const span of out) {
      const prev = merged[merged.length - 1];
      if (prev && prev[1] > prev[0] && span[1] > span[0] && span[0] <= prev[1]) prev[1] = Math.max(prev[1], span[1]);
      else if (prev && span[0] === span[1] && prev[1] > prev[0] && span[0] >= prev[0] && span[0] <= prev[1]) continue;
      else if (prev && prev[0] === prev[1] && span[1] > span[0] && prev[0] >= span[0] && prev[0] <= span[1]) merged[merged.length - 1] = span;
      else merged.push(span);
    }
    return merged;
  }

  // 크랙 수정창·원문 창·다른 확프의 일괄 바꾸기처럼 여러 군데가 한 번에 바뀐 것은 낱말 단위로 비교해
  // 바뀐 조각마다 따로 흔적을 남깁니다(처음 바뀐 곳~마지막 바뀐 곳을 통째로 칠하지 않게).
  // 결과: [{ a, b(옛 글 위치), oldText, newText }] (앞에서부터)
  function changeList(before, after) {
    const changes = [];
    let oldPos = 0;
    let cur = null;
    for (const [type, text] of diffParts(before, after)) {
      if (type === '=') {
        if (cur) changes.push(cur);
        cur = null;
        oldPos += text.length;
        continue;
      }
      if (!cur) cur = { a: oldPos, b: oldPos, oldText: '', newText: '' };
      if (type === '-') {
        cur.b += text.length;
        cur.oldText += text;
        oldPos += text.length;
      } else cur.newText += text;
    }
    if (cur) changes.push(cur);
    return changes;
  }

  // 뒤쪽 조각부터 옮겨야 앞쪽 조각의 옛 위치가 그대로 맞습니다.
  function applyChanges(spans, changes) {
    let out = spans || [];
    for (let i = changes.length - 1; i >= 0; i -= 1) {
      const c = changes[i];
      out = shiftSpans(out, c.a, c.b, c.newText.length, c.newText.length);
    }
    return out;
  }

  // 흔적 창에 보일 '원래 → 바뀐 글' (조각이 여럿이면 … 로 이어 붙임)
  function changeSummary(changes) {
    return { before: changes.map(c => c.oldText).filter(Boolean).join(' … '), after: changes.map(c => c.newText).filter(Boolean).join(' … ') };
  }

  // 통째로 바뀐 경우(크랙 수정창·원문 편집)는 앞뒤가 같은 부분을 빼고 가운데를 바뀐 자리로 봅니다.
  function wholeChange(before, after) {
    let p = 0;
    const max = Math.min(before.length, after.length);
    while (p < max && before[p] === after[p]) p += 1;
    // 이모지 같은 서로게이트 쌍을 반으로 자르지 않습니다.
    if (p > 0 && /[\uD800-\uDBFF]/.test(before[p - 1])) p -= 1;
    let s = 0;
    while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
    if (s > 0 && /[\uDC00-\uDFFF]/.test(before[before.length - s])) s -= 1;
    return { a: p, b: before.length - s, newLen: after.length - s - p, oldText: before.slice(p, before.length - s), newText: after.slice(p, after.length - s) };
  }

  // ---------- 저장 경로 ----------

  // 우리가 쓴 내용은 '크랙 수정창 기록'으로 잘못 남지 않게 잠깐 표시해 둡니다. 저장이 끝나면 2초 뒤 풀어서, 곧이어 크랙 수정창으로 고친 것은 기록되게 합니다.
  const ownWrites = new Map();
  function pruneOwn(id) {
    const entry = ownWrites.get(id);
    if (!entry) return;
    const now = Date.now();
    entry.forEach((until, key) => { if (until <= now) entry.delete(key); });
    if (!entry.size) ownWrites.delete(id);
  }
  function markOwn(id, ttl, ...contents) {
    pruneOwn(id);
    const entry = ownWrites.get(id) || new Map();
    const until = Date.now() + ttl;
    contents.forEach(content => entry.set(normalize(content), until));
    ownWrites.set(id, entry);
  }
  function settleOwn(id) {
    const entry = ownWrites.get(id);
    const until = Date.now() + 2000;
    entry?.forEach((value, key) => entry.set(key, Math.min(value, until)));
  }
  const isOwn = (id, content) => {
    pruneOwn(id);
    return (ownWrites.get(id)?.get(normalize(content)) || 0) > Date.now();
  };

  // 저장 중인 메시지. 이 동안에는 화면이 잠깐 원문으로 보여도 기록을 지우지 않습니다.
  const inFlight = new Set();
  // 크랙 내부를 못 찾아 서버에만 저장한 메시지(새로고침 전까지 화면은 옛 글)
  const reloadNeeded = new Set();
  const diagState = { lastPath: '', lastError: '', xhrHooked: false, xhrWrapped: false, fetchHooked: false, nativeCaptured: 0 };

  // 보이는 글이 하나도 남지 않으면(숨김 주석·목록 기호·폭 0 글자만 남음) 빈 메시지로 봅니다.
  function visibleLeft(text) {
    return stripHidden(String(text ?? ''), '<!--').text
      .replace(/^[ \t]*(?:>[ \t]?|(?:\d{1,9}[.)]|[-+*]|#{1,6})(?=[ \t]|$))+/gm, '')
      .replace(/[\s​-‍⁠﻿ㅤᅟᅠ]/g, '');
  }

  // 크랙과 같은 길(A1) → 저장소만 직접 고치기(A2) → API로만 고치고 새로고침 안내(C) 순서로 시도합니다.
  async function writeContent(target, next) {
    const h = here();
    if (h.chatId !== target.chatId) throw new UserError('다른 방으로 옮겨져서 취소했어요.');
    if (!normalize(next) || !visibleLeft(next)) throw new UserError('메시지를 전부 비울 수는 없어요.');
    if (inFlight.has(target.msgId)) throw new UserError('아직 앞의 수정을 저장하고 있어요.');
    // 재생성 등으로 그룹 요소가 새로 그려졌으면 지금 화면의 그룹으로 검사합니다.
    const liveGroup = target.group?.isConnected
      ? target.group
      : findGroup(target.msgId) || (target.groupId ? document.querySelector(`[data-message-group-id="${CSS.escape(target.groupId)}"]`) : null);
    const anchor = liveGroup ? mdsOf(liveGroup)[0] : null;
    const bridge = findBridge(anchor);
    if (bridge.mismatch) throw new UserError('다른 방으로 옮겨져서 취소했어요.');
    if ((bridge.state && String(bridge.state.status).toUpperCase() !== 'IDLE') || streamingNow()) throw new UserError('답변이 만들어지는 중에는 고칠 수 없어요.');
    if (nativeEditorOpen(liveGroup) || bridge.state?.isEdit) throw new UserError('크랙 수정창이 열려 있어요. 먼저 끝내거나 닫아 주세요.');
    const fresh = bridge.store?.getState().messages.get(target.msgId);
    if (fresh && fresh.content !== target.content) throw new UserError('그사이 메시지가 바뀌었어요. 다시 선택해 주세요.');
    // 편집 창을 연 사이 답변 비교 화살표나 재생성으로 보이는 답변이 바뀌었으면 거절합니다.
    const shownNow = liveGroup ? messageOf(liveGroup, bridge) : null;
    if (shownNow?.fromStore && shownNow.msgId && shownNow.msgId !== target.msgId) throw new UserError('보이는 답변이 바뀌었어요. 다시 선택해 주세요.');
    markOwn(target.msgId, 30000, next, target.content);
    inFlight.add(target.msgId);
    try {
      return await sendContent(h, bridge, fresh, target, next);
    } finally {
      inFlight.delete(target.msgId);
      settleOwn(target.msgId);
    }
  }

  async function sendContent(h, bridge, fresh, target, next) {
    if (bridge.actions && fresh) {
      diagState.lastPath = 'A1';
      log('A1 updateMessage', target.msgId);
      const local = () => bridge.store.getState().messages.get(target.msgId)?.content;
      try {
        await bridge.actions.updateMessage({ _id: fresh._id, content: fresh.content }, next);
      } catch (error) {
        const why = error?.response?.data?.message || error?.body?.message;
        throw new UserError(why ? `크랙이 거절했어요: ${why}` : '크랙이 저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
      }
      // 크랙은 저장에 실패하면 오류를 밖으로 던지지 않고 저장소를 원래 글로 되돌리기도 합니다.
      if (normalize(fresh.content) !== normalize(next) && normalize(local()) === normalize(fresh.content)) throw new UserError('크랙이 저장하지 못해서 원래 글로 되돌렸어요.');
      let content = null;
      let unverified = false;
      try {
        await bridge.actions.resyncMessage(target.msgId);
        content = local() ?? null;
      } catch (error) {
        log('resync failed', error);
      }
      if (content === null) content = await api('GET', messagePath(h, target.msgId)).then(data => (typeof data?.content === 'string' ? data.content : null), () => null);
      if (content === null) {
        // 서버 확인은 못 했지만 크랙 저장소에는 새 글이 들어가 있으면, 저장된 것으로 보고 기록을 남깁니다.
        if (normalize(local()) !== normalize(next)) throw new UserError('크랙 서버에 반영되지 않았어요. 새로고침해서 확인해 주세요.');
        content = local();
        unverified = true;
      }
      if (normalize(content) !== normalize(next)) throw new UserError('크랙 서버에 반영되지 않았어요. 새로고침해서 확인해 주세요.');
      markOwn(target.msgId, 30000, content);
      return { content, reload: false, unverified };
    }

    log('direct PATCH', target.msgId);
    // 저장소가 없으면 '그사이 바뀜'을 서버에서 확인합니다.
    if (!fresh) {
      const now = await api('GET', messagePath(h, target.msgId));
      if (typeof now?.content !== 'string' || normalize(now.content) !== normalize(target.content)) throw new UserError('그사이 메시지가 바뀌었어요. 다시 선택해 주세요.');
    }
    const data = await api('PATCH', messagePath(h, target.msgId), { message: next });
    const check = await api('GET', messagePath(h, target.msgId)).catch(() => null);
    const verified = typeof check?.content === 'string';
    const content = verified ? check.content : typeof data?.content === 'string' ? data.content : next;
    if (normalize(content) !== normalize(next)) throw new UserError('크랙 서버에 반영되지 않았어요. 새로고침해서 확인해 주세요.');
    markOwn(target.msgId, 30000, content);
    const live = bridge.store?.getState();
    if (live?.messages.has(target.msgId) && typeof live.updateMessage === 'function') {
      // PATCH가 성공했으면(확인 GET만 실패했어도) 크랙 저장소에 넣어 화면을 맞춥니다. 확인 못 한 것은 알림에 적습니다.
      diagState.lastPath = 'A2';
      live.updateMessage(target.msgId, { content });
      return { content, reload: false, unverified: !verified };
    }
    diagState.lastPath = 'C';
    reloadNeeded.add(target.msgId);
    return { content, reload: true, unverified: !verified };
  }

  // 화면에서 고칠 메시지와 그 원문을 찾습니다. node는 그 메시지 그룹 안의 아무 요소나 됩니다.
  async function resolveTarget(node) {
    const h = here();
    if (!h.chatId) throw new UserError('채팅방에서만 쓸 수 있어요.');
    const group = groupOf(node);
    const bridge = findBridge(group ? mdsOf(group)[0] : null);
    if (bridge.mismatch) throw new UserError('방을 옮기는 중이에요. 잠시 뒤 다시 해 주세요.');
    const info = messageOf(group, bridge);
    if (!info) throw new UserError('이 글은 메시지가 아니라서 고칠 수 없어요.');
    let { msgId, content } = info;
    if (!info.fromStore) {
      // 크랙 내부를 못 찾았을 때: 그룹의 메시지들을 API로 읽고, 화면 글과 가장 잘 맞는 것을 고릅니다.
      // 답변 비교처럼 후보가 여럿이면 거의 똑같이 맞고 2등과 차이가 날 때만, 하나뿐이어도 화면 글과 아주 잘 맞을 때만 고칩니다.
      const ids = (msgId ? [msgId] : info.ids || [info.groupId]).filter(id => ID_RE.test(id));
      if (!ids.length) throw new UserError('메시지 id를 찾지 못했어요.');
      const scored = [];
      for (const id of ids) {
        const data = ids.length === 1 ? await api('GET', messagePath(h, id)) : await api('GET', messagePath(h, id)).catch(() => null);
        if (typeof data?.content === 'string') scored.push({ id, content: data.content, score: coverage(data.content, info.mds) });
      }
      scored.sort((x, y) => y.score - x.score);
      const best = scored[0];
      const close = Boolean(scored[1] && best.score - scored[1].score < 0.005);
      if (!best || best.score < (scored.length > 1 ? 0.995 : 0.97) || close) throw new UserError('화면 글과 서버 원문이 달라요. 새로고침한 뒤 다시 해 주세요. (답변 비교 중이면 크랙 수정창을 써 주세요)');
      msgId = best.id;
      content = best.content;
    }
    if (typeof content !== 'string') throw new UserError('메시지 원문을 읽지 못했어요.');
    return { chatId: h.chatId, msgId, content, group: info.group, groupId: info.groupId, mds: info.mds, via: info.fromStore ? 'store' : 'api' };
  }

  // 지금 원문(content)에 맞는 기록을 돌려줍니다. 그사이 다른 곳에서 바뀌었으면 거기서부터 새로 시작하고,
  // 옛 수정들은 보기용으로만 남깁니다(되돌리기가 남이 쓴 글을 지우지 않게).
  function recordFor(prev, content) {
    if (prev && normalize(prev.current) === normalize(content)) return prev;
    const edits = (prev?.edits || []).map(edit => ({ at: edit.at, kind: edit.kind, before: edit.before, after: edit.after, old: true }));
    return { base: content, origin: prev?.origin ?? prev?.base, current: content, spans: [], edits, rebased: Boolean(prev) };
  }

  // 수정 1번을 저장하고 흔적을 남깁니다. plan: { a, b, ins, kept, next } (원문에서 바뀌는 자리와 새 원문)
  async function commitEdit(target, plan, meta) {
    const snapshot = book(target.chatId)[target.msgId] || null;
    const result = await writeContent(target, plan.next);
    const record = recordFor(book(target.chatId)[target.msgId] || snapshot, target.content);
    const prevSpans = (record.spans || []).map(span => span.slice());
    record.spans = plan.changes ? applyChanges(record.spans, plan.changes) : shiftSpans(record.spans, plan.a, plan.b, plan.ins.length + plan.kept.length, plan.ins.length);
    record.edits.push({ at: Date.now(), kind: meta.kind, before: meta.before, after: meta.after, prev: target.content, prevSpans });
    finishRecord(target.chatId, target.msgId, record, result.content);
    return result;
  }

  function finishRecord(chatId, msgId, record, content) {
    record.current = content;
    record.at = Date.now();
    record.edits = record.edits.slice(-LIMITS.edits);
    record.edits.slice(0, -LIMITS.undo).forEach(edit => { delete edit.prev; delete edit.prevSpans; });
    putRecord(chatId, msgId, normalize(record.current) === normalize(record.base) ? null : record);
    saveBook(chatId);
    schedulePaint(0);
  }

  // 되돌리기 전에 서버 글도 기록의 current와 같은지 확인합니다(다른 기기·탭이 서버만 바꾼 것을 덮어쓰지 않게).
  async function confirmServer(msgId, expected) {
    const data = await api('GET', messagePath(here(), msgId));
    if (typeof data?.content !== 'string' || normalize(data.content) !== normalize(expected)) throw new UserError('서버 글이 그사이 바뀌어서 되돌리지 않았어요. 새로고침해 주세요.');
  }

  async function undoLast(chatId, msgId, node) {
    const record = book(chatId)[msgId];
    const edit = record?.edits[record.edits.length - 1];
    if (!edit || typeof edit.prev !== 'string') throw new UserError('되돌릴 수정이 없어요.');
    const target = await resolveTarget(node);
    if (target.msgId !== msgId) throw new UserError('보이는 답변이 바뀌었어요.');
    if (normalize(target.content) !== normalize(record.current)) throw new UserError('그사이 다른 곳에서 바뀌어서 되돌리지 않았어요.');
    await confirmServer(msgId, record.current);
    const result = await writeContent(target, edit.prev);
    const live = book(chatId)[msgId] || record;
    const popped = live.edits.pop();
    // '하나만 되돌리기'를 되돌리면, 되돌렸던 수정의 표시도 풉니다.
    if (popped?.revertOf) {
      const original = live.edits.find(item => item.at === popped.revertOf);
      if (original) delete original.reverted;
    }
    live.spans = edit.prevSpans || [];
    finishRecord(chatId, msgId, live, result.content);
    return result;
  }

  // ---------- 하나만 골라 되돌리기 ----------
  // 수정 i의 바로 전 글(prev)과 바로 뒤 글(다음 수정의 prev 또는 current)로 바뀐 자리를 구하고,
  // 그 뒤 수정들의 위치 변화를 따라 지금 글에서의 자리를 찾아 그 부분만 원래 글로 돌립니다. 뒤 수정과 겹치면 하지 않습니다.
  function planRevertOne(record, i) {
    const edits = record.edits;
    const edit = edits[i];
    if (!edit || edit.old || edit.reverted) return null;
    const states = edits.map(item => (typeof item.prev === 'string' ? item.prev : null)).concat([record.current]);
    for (let k = i; k < states.length; k += 1) if (typeof states[k] !== 'string') return null;
    const change = wholeChange(states[i], states[i + 1]);
    let a = change.a;
    let b = change.a + change.newLen;
    for (let k = i + 1; k < edits.length; k += 1) {
      const later = wholeChange(states[k], states[k + 1]);
      if (later.b <= a) {
        // 앞쪽 변화: 길이 차이만큼 자리를 옮깁니다.
        const delta = later.newLen - (later.b - later.a);
        a += delta;
        b += delta;
      } else if (later.a < b) return { conflict: true };
      // 뒤쪽 변화는 자리에 영향이 없습니다.
    }
    const cur = record.current;
    if (cur.slice(a, b) !== change.newText) return { conflict: true };
    return { a, b, ins: change.oldText, removed: change.newText, next: cur.slice(0, a) + change.oldText + cur.slice(b) };
  }

  // [a, b)를 newLen 글자(원래 글)로 돌렸을 때: 그 자리의 흔적은 빼고 나머지 자리만 옮깁니다.
  function dropRegion(spans, a, b, newLen) {
    const delta = newLen - (b - a);
    const out = [];
    for (const [s, e] of spans || []) {
      if (e === s) {
        if (s < a) out.push([s, s]);
        else if (s > b) out.push([s + delta, s + delta]);
        continue;
      }
      if (e <= a) out.push([s, e]);
      else if (s >= b) out.push([s + delta, e + delta]);
      else {
        if (s < a) out.push([s, a]);
        if (e > b) out.push([a + newLen, e + delta]);
      }
    }
    return out;
  }

  async function revertOne(chatId, msgId, node, at) {
    const record = book(chatId)[msgId];
    const i = record ? record.edits.findIndex(item => item.at === at) : -1;
    if (i < 0) throw new UserError('그 수정을 찾지 못했어요.');
    if (i === record.edits.length - 1) return undoLast(chatId, msgId, node);
    const plan = planRevertOne(record, i);
    if (!plan) throw new UserError('오래된 수정이라 이것만 되돌릴 수는 없어요.');
    if (plan.conflict) throw new UserError('뒤에 고친 것과 자리가 겹쳐서 이것만 되돌릴 수 없어요.');
    const target = await resolveTarget(node);
    if (target.msgId !== msgId) throw new UserError('보이는 답변이 바뀌었어요.');
    if (normalize(target.content) !== normalize(record.current)) throw new UserError('그사이 다른 곳에서 바뀌어서 되돌리지 않았어요.');
    await confirmServer(msgId, record.current);
    const result = await writeContent(target, plan.next);
    const live = book(chatId)[msgId] || record;
    const prevSpans = (live.spans || []).map(span => span.slice());
    live.spans = dropRegion(live.spans, plan.a, plan.b, plan.ins.length);
    const original = live.edits.find(item => item.at === at);
    if (original) original.reverted = true;
    live.edits.push({ at: Date.now(), kind: 'revert', before: plan.removed, after: plan.ins, prev: record.current, prevSpans, revertOf: at });
    finishRecord(chatId, msgId, live, result.content);
    return result;
  }

  async function restoreBase(chatId, msgId, node) {
    const record = book(chatId)[msgId];
    if (!record) throw new UserError('흔적이 없어요.');
    const target = await resolveTarget(node);
    if (target.msgId !== msgId) throw new UserError('보이는 답변이 바뀌었어요.');
    if (normalize(target.content) !== normalize(record.current)) throw new UserError('그사이 다른 곳에서 바뀌어서 되돌리지 않았어요.');
    await confirmServer(msgId, record.current);
    const result = await writeContent(target, record.base);
    forget(chatId, msgId);
    return result;
  }

  function forget(chatId, msgId) {
    putRecord(chatId, msgId, null);
    saveBook(chatId);
    schedulePaint(0);
  }

  // ---------- 크랙 수정창으로 고친 것도 기록 ----------
  // 크랙은 저장소를 먼저 바꾼 뒤 PATCH를 보냅니다. 저장소 변화(전/후)를 잡아 두었다가 그 메시지의 PATCH가 성공하면 확정합니다.
  // 답변 생성·재생성·resync는 PATCH가 없으므로 기록되지 않습니다.

  const watchedStores = new WeakSet();
  const pendingNative = new Map();
  // 이 탭의 저장소에서 'current → base'로 돌아가는 것을 본 메시지. 이때만 기록을 지웁니다(다른 탭·옛 화면이 지우지 않게).
  const revertSeen = new Map();

  // 답변 생성·이어서 생성 중인지(이때의 저장소 변화는 크랙 수정창 기록 후보가 아님)
  function generatingNow() {
    if (streamingNow()) return true;
    try {
      const state = findBridge().state;
      return Boolean(state && String(state.status).toUpperCase() !== 'IDLE');
    } catch (error) {
      return false;
    }
  }

  function watchStore(store) {
    if (watchedStores.has(store)) return;
    watchedStores.add(store);
    try {
      store.subscribe((state, prev) => {
        if (!prev || state.messages === prev.messages) return;
        schedulePaint();
        state.messages.forEach((message, id) => {
          const old = prev.messages.get(id);
          if (!old || old === message || typeof old.content !== 'string' || typeof message.content !== 'string' || old.content === message.content) return;
          if (isOwn(id, message.content) || isOwn(id, old.content)) return;
          const recNow = books.get(here().chatId)?.[id];
          if (recNow && normalize(old.content) === normalize(recNow.current) && normalize(message.content) === normalize(recNow.base)) revertSeen.set(id, recNow.current);
          if (generatingNow()) return;
          const entry = { chatId: here().chatId, before: old.content, after: message.content, at: Date.now() };
          pendingNative.set(id, entry);
          setTimeout(() => {
            if (pendingNative.get(id) === entry) {
              pendingNative.delete(id);
              schedulePaint();
            }
          }, 15000);
        });
        prev.messages.forEach((message, id) => {
          if (!state.messages.has(id) && state.messages.size >= prev.messages.size - 3) {
            const chatId = here().chatId;
            if (book(chatId)[id]) forget(chatId, id);
          }
        });
      });
    } catch (error) {
      log('store subscribe failed', error);
    }
  }

  function sentMessage(body) {
    if (typeof body !== 'string') return null;
    try {
      const json = JSON.parse(body);
      return typeof json?.message === 'string' ? json.message : null;
    } catch (error) {
      return null;
    }
  }

  // info: { sentAt, entry(보낸 순간의 후보), body(보낸 글) }
  function onPatchDone(url, status, bodyText, info = {}) {
    if (status < 200 || status >= 300) return;
    const m = MSG_URL.exec(url);
    if (!m) return;
    const [, chatId, msgId] = m;
    const sent = sentMessage(info.body);
    // 경로 C(새로고침 대기)인 메시지를 크랙 수정창이 옛 글로 저장하면 핀셋 수정이 덮입니다.
    if (reloadNeeded.has(msgId) && sent !== null && !isOwn(msgId, sent)) {
      reloadNeeded.delete(msgId);
      toast('크랙 수정창 저장이 핀셋 수정을 덮었어요. 새로고침해서 확인해 주세요.', { error: true, ms: 6000 });
    }
    const entry = info.entry || pendingNative.get(msgId);
    if (!entry) return;
    if (pendingNative.get(msgId) === entry) pendingNative.delete(msgId);
    // 크랙 수정창은 저장소를 바꾸자마자 PATCH를 보냅니다. 오래된 변화나, 보낸 글이 그 변화와 다른 PATCH는 크랙 수정창 기록이 아닙니다.
    if (info.sentAt && info.sentAt - entry.at > 3000) return;
    if (sent !== null && normalize(sent) !== normalize(entry.after)) return;
    let content = entry.after;
    try {
      const json = JSON.parse(bodyText);
      if (typeof json?.data?.content === 'string') content = json.data.content;
    } catch (error) { /* 무시 */ }
    if (isOwn(msgId, content)) return;
    const record = recordFor(book(chatId)[msgId], entry.before);
    // 끝 공백·줄바꿈만 다른 것은 바뀐 자리로 치지 않습니다.
    const changes = changeList(entry.before.replace(/\s+$/, ''), content.replace(/\s+$/, ''));
    const prevSpans = (record.spans || []).map(span => span.slice());
    record.spans = applyChanges(record.spans, changes);
    record.edits.push({ at: Date.now(), kind: 'native', ...changeSummary(changes), prev: entry.before, prevSpans });
    diagState.nativeCaptured += 1;
    finishRecord(chatId, msgId, record, content);
  }

  // 다른 확프(모바일 유틸 등)의 감시와 겹쳐도 되도록, 지금 있는 함수를 감싸기만 합니다.
  function hookNetwork() {
    try {
      const proto = pageWindow.XMLHttpRequest.prototype;
      if (!proto.__cpnHooked) {
        const open = proto.open;
        const send = proto.send;
        proto.open = function (method, url) {
          try { this.__cpnReq = { method: String(method).toUpperCase(), url: String(url) }; } catch (error) { /* 무시 */ }
          return open.apply(this, arguments);
        };
        proto.send = function () {
          try {
            const req = this.__cpnReq;
            if (req && req.method === 'PATCH' && MSG_URL.test(req.url)) {
              const info = { sentAt: Date.now(), entry: pendingNative.get(MSG_URL.exec(req.url)[2]), body: arguments[0] };
              this.addEventListener('loadend', () => {
                let text = '';
                try { text = this.responseType === '' || this.responseType === 'text' ? this.responseText : JSON.stringify(this.response); } catch (error) { text = ''; }
                onPatchDone(req.url, this.status, text, info);
              });
            }
          } catch (error) { /* 무시 */ }
          return send.apply(this, arguments);
        };
        proto.__cpnHooked = true;
      }
      // 다른 확프가 XMLHttpRequest를 자기 가짜 생성자로 바꿔 두었으면(ajax-hook 식), 만들어지는 객체마다 open/send를 감쌉니다.
      const Ctor = pageWindow.XMLHttpRequest;
      if (!/\[native code\]/.test(Function.prototype.toString.call(Ctor)) && !Ctor.__cpnProxy) {
        diagState.xhrWrapped = true;
        pageWindow.XMLHttpRequest = new Proxy(Ctor, {
          construct(target, args, newTarget) {
            const x = Reflect.construct(target, args, newTarget);
            try {
              if (Object.prototype.hasOwnProperty.call(x, 'send') && !x.__cpnInst) {
                x.__cpnInst = true;
                const o = x.open;
                const s = x.send;
                x.open = function (method, url) {
                  try { x.__cpnReq = { method: String(method).toUpperCase(), url: String(url) }; } catch (error) { /* 무시 */ }
                  return o.apply(this, arguments);
                };
                x.send = function () {
                  try {
                    const req = x.__cpnReq;
                    if (req && req.method === 'PATCH' && MSG_URL.test(req.url)) {
                      const info = { sentAt: Date.now(), entry: pendingNative.get(MSG_URL.exec(req.url)[2]), body: arguments[0] };
                      x.addEventListener('loadend', () => {
                        let text = '';
                        try { text = x.responseType === '' || x.responseType === 'text' ? x.responseText : JSON.stringify(x.response); } catch (error) { text = ''; }
                        onPatchDone(req.url, x.status, text, info);
                      });
                    }
                  } catch (error) { /* 무시 */ }
                  return s.apply(this, arguments);
                };
              }
            } catch (error) { /* 무시 */ }
            return x;
          },
          get(target, key) {
            return key === '__cpnProxy' ? true : Reflect.get(target, key);
          },
        });
      }
      diagState.xhrHooked = true;
    } catch (error) {
      log('xhr hook failed', error);
    }
    try {
      const original = pageWindow.fetch;
      if (typeof original === 'function' && !original.__cpnHooked) {
        const wrapped = function (input, init) {
          const sentAt = Date.now();
          const promise = original.apply(this ?? pageWindow, arguments);
          try {
            // 주소는 문자열, Request, URL 객체 모두 됩니다.
            const url = typeof input === 'string' ? input : typeof input?.url === 'string' ? input.url : String(input ?? '');
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            if (method === 'PATCH' && MSG_URL.test(url)) {
              const info = { sentAt, entry: pendingNative.get(MSG_URL.exec(url)[2]), body: typeof init?.body === 'string' ? init.body : null };
              promise.then(response => response.clone().text().then(text => onPatchDone(url, response.status, text, info))).catch(() => {});
            }
          } catch (error) { /* 무시 */ }
          return promise;
        };
        wrapped.__cpnHooked = true;
        pageWindow.fetch = wrapped;
      }
      diagState.fetchHooked = true;
    } catch (error) {
      log('fetch hook failed', error);
    }
  }

  // ---------- 흔적 칠하기 ----------

  const HL = pageWindow.Highlight || window.Highlight;
  const registry = () => pageWindow.CSS?.highlights || window.CSS?.highlights || null;
  const hits = new Map();
  let paintTimer = 0;

  function schedulePaint(delay = 250) {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(paint, delay);
  }

  function paint() {
    const h = here();
    const records = book(h.chatId);
    const reg = registry();
    if (streamingNow()) {
      schedulePaint(800);
      return;
    }
    hits.clear();
    const edits = [];
    const cuts = [];
    const keep = new Set();
    const wanted = new Set(Object.keys(records));
    if (h.chatId && wanted.size) {
      const bridge = findBridge();
      let changed = false;
      for (const group of document.querySelectorAll('[data-message-group-id]')) {
        const info = messageOf(group, bridge, wanted);
        if (!info) continue;
        const id = info.msgId || info.groupId;
        const record = records[id];
        if (!record) continue;
        // 저장 중이거나 확정을 기다리는 동안에는 화면이 잠깐 원문과 같아도 기록을 지우지 않습니다.
        const busy = inFlight.has(id) || pendingNative.has(id) || reloadNeeded.has(id);
        let status;
        if (info.fromStore) {
          if (normalize(info.content) === normalize(record.current)) status = 'ok';
          else if (!busy && revertSeen.get(id) === record.current && normalize(info.content) === normalize(record.base)) {
            // 이 탭에서 원래 글로 돌아가는 것을 직접 본 경우에만 기록을 지웁니다.
            // (같은 방을 연 다른 탭이나 옛 글이 한 번 그려진 화면은 '어긋남'으로만 둡니다.)
            revertSeen.delete(id);
            putRecord(h.chatId, id, null);
            changed = true;
            continue;
          } else status = 'stale';
        } else {
          status = !reloadNeeded.has(id) && coverage(record.current, info.mds) > 0.97 ? 'ok' : 'stale';
        }
        keep.add(ensureBadge(info.mds[info.mds.length - 1], id, record, status));
        if (status === 'ok' && settings.paint) {
          const painted = rangesFor(info.mds, record);
          edits.push(...painted.ranges);
          cuts.push(...painted.cuts);
          const hit = { id, group, ranges: painted.ranges.concat(painted.cuts) };
          info.mds.forEach(md => hits.set(md, hit));
        }
      }
      if (changed) saveBook(h.chatId);
    }
    document.querySelectorAll('.cpn-badge').forEach(badge => {
      if (!keep.has(badge)) badge.remove();
    });
    if (reg && HL) {
      try {
        reg.set('cpn-edit', new HL(...edits));
        reg.set('cpn-cut', new HL(...cuts));
      } catch (error) {
        log('highlight failed', error);
      }
    }
  }

  // 배지는 .wrtn-markdown 안이 아니라 바로 뒤에 붙입니다(크랙이 본문을 다시 그려도 지워지지 않게).
  function ensureBadge(md, id, record, status) {
    let badge = md.nextElementSibling;
    if (!badge?.classList.contains('cpn-badge')) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'cpn-badge cpn-ui';
      // 방금 고친 메시지의 배지만 톡 튀어나오게 합니다(새로고침이나 크랙이 다시 그릴 때는 조용히).
      if (Date.now() - (record.at || 0) < 4000) {
        badge.classList.add('is-new');
        badge.addEventListener('animationend', () => badge.classList.remove('is-new'), { once: true });
      }
      badge.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openTrace(groupOf(badge), badge.dataset.id, badge.getBoundingClientRect());
      });
      md.after(badge);
    }
    const count = record.edits.length;
    const label = status === 'stale' ? (reloadNeeded.has(id) ? '수정 흔적 · 새로고침하면 보여요' : '수정 흔적 · 어긋남') : `수정 흔적 ${count}`;
    if (badge.dataset.id !== id) badge.dataset.id = id;
    if (badge.dataset.label !== label) {
      badge.dataset.label = label;
      badge.innerHTML = `${ICONS.pen}<span></span>`;
      badge.lastElementChild.textContent = label;
    }
    badge.classList.toggle('is-stale', status === 'stale');
    return badge;
  }

  // ---------- 화면 (선택 막대, 편집 창, 흔적 창, 알림) ----------

  const ICONS = {
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    erase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    source: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
  };

  const HOST_CSS = `
::highlight(cpn-edit){background-color:rgba(255,140,60,.28)}
::highlight(cpn-cut){text-decoration:underline wavy rgba(234,88,12,.9);text-decoration-thickness:1.5px;text-underline-offset:3px}
.cpn-badge{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;width:max-content;height:22px;margin:4px 0 0;padding:0 8px 0 6px;border:0;border-radius:999px;background:rgba(255,140,60,.15);color:#c2410c;font-size:11.5px;font-weight:700;line-height:1;cursor:pointer;transition:background-color .15s,scale .15s}
.cpn-badge:hover{background:rgba(255,140,60,.26)}
.cpn-badge:active{scale:.97}
.cpn-badge svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.cpn-badge.is-stale{background:rgba(127,127,127,.14);color:inherit;opacity:.7}
html[data-cpn-theme="dark"] .cpn-badge{color:#ffab70}
html[data-cpn-theme="dark"] .cpn-badge.is-stale{color:inherit}
.cpn-badge.is-new{animation:cpnBadgeIn .38s cubic-bezier(.34,1.56,.64,1)}
@keyframes cpnBadgeIn{from{opacity:0;transform:scale(.6)}}
@media (prefers-reduced-motion:reduce){.cpn-badge.is-new{animation:none}}`;

  // 유리(글라스) 느낌: 반투명 바탕 + 뒤 흐림. 움직임은 짧고 가볍게, '동작 줄이기' 설정이면 끕니다.
  const STAGE_CSS = `
*{box-sizing:border-box}
button,textarea{font:inherit;color:inherit;letter-spacing:inherit}
button{cursor:pointer}
.stage{--glass:rgba(30,30,34,.58);--glass-solid:rgba(30,30,34,.94);--edge:inset 0 0 0 1px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.08);--drop:0 18px 48px -16px rgba(0,0,0,.6),0 2px 6px -2px rgba(0,0,0,.3);--blur:blur(22px) saturate(170%);--surface:rgba(255,255,255,.06);--surface-2:rgba(255,255,255,.11);--hover:rgba(255,255,255,.1);--text:#f1f1f2;--text-2:#a9a9b0;--text-3:#74747b;--rule:rgba(255,255,255,.08);--rail:rgba(255,255,255,.18);--pink:#ffab70;--pink-soft:rgba(255,140,60,.2);--on-pink:#2a1306;--danger:#ff9a9a;--out:cubic-bezier(.2,0,0,1);--spring:cubic-bezier(.34,1.4,.64,1);position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-size:13px;line-height:1.45;letter-spacing:-.01em}
.stage[data-theme=light]{--glass:rgba(255,255,255,.62);--glass-solid:rgba(255,255,255,.96);--edge:inset 0 0 0 1px rgba(255,255,255,.7),0 0 0 1px rgba(0,0,0,.07);--drop:0 18px 48px -18px rgba(0,0,0,.28),0 2px 6px -2px rgba(0,0,0,.08);--surface:rgba(0,0,0,.04);--surface-2:rgba(0,0,0,.08);--hover:rgba(0,0,0,.06);--text:#1c1c1b;--text-2:#5f5f5c;--text-3:#9a9a96;--rule:rgba(0,0,0,.07);--rail:rgba(0,0,0,.18);--pink:#c2410c;--pink-soft:rgba(255,140,60,.16);--on-pink:#fff;--danger:#c4545a}
.tb,.pop,.toast{background:var(--glass);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);box-shadow:var(--edge),var(--drop);color:var(--text)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.tb,.pop,.toast{background:var(--glass-solid)}}
svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@keyframes cpnIn{from{opacity:0;transform:translateY(4px) scale(.92)}}
@keyframes cpnPop{from{opacity:0;transform:translateY(6px) scale(.97)}}
@keyframes cpnFade{from{opacity:0;transform:translateY(3px)}}
@keyframes cpnOut{to{opacity:0;transform:scale(.96)}}
@keyframes cpnToast{from{opacity:0;transform:translateY(10px) scale(.96)}}
@keyframes cpnTimer{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.tb{position:absolute;display:flex;gap:2px;padding:4px;border-radius:14px;pointer-events:auto;animation:cpnIn .22s var(--spring) both}
.tb button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:0;border-radius:10px;background:none;font-size:12.5px;font-weight:600;white-space:nowrap;transition:background .15s,scale .12s;animation:cpnFade .2s var(--out) both}
.tb button:nth-child(2){animation-delay:.03s}
.tb button:nth-child(3){animation-delay:.06s}
.tb button:hover{background:var(--hover)}
.tb button:active{scale:.95}
.tb .main{color:var(--pink)}
.pop{position:absolute;width:380px;max-width:calc(100vw - 20px);display:flex;flex-direction:column;max-height:calc(100vh - 24px);border-radius:18px;pointer-events:auto;outline:none;animation:cpnPop .24s var(--out) both}
.pop.wide{width:620px}
.tb.out,.pop.out{pointer-events:none;animation:cpnOut .13s var(--out) forwards}
.hd{display:flex;align-items:center;gap:8px;padding:12px 10px 8px 14px}
.hd b{flex:1;font-size:14px;font-weight:700;letter-spacing:-.02em}
.hd small{color:var(--text-3);font-size:11.5px;font-weight:500;margin-left:6px}
.x{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:none;color:var(--text-2);transition:background .15s,color .15s,rotate .2s var(--out)}
.x:hover{background:var(--hover);color:var(--text);rotate:90deg}
.bd{padding:0 14px 12px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--rail) transparent}
.was{margin-bottom:8px;padding:8px 10px;border-radius:11px;background:var(--surface);color:var(--text-2);font-size:12.5px;max-height:84px;overflow:auto;white-space:pre-wrap;word-break:break-all;animation:cpnFade .22s var(--out) both}
.was i{font-style:normal;color:var(--text-3);font-size:11px;font-weight:700;margin-right:6px}
textarea{width:100%;min-height:72px;max-height:46vh;padding:10px 12px;border:0;border-radius:12px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--rule);color:var(--text);font-size:14px;line-height:1.6;resize:vertical;outline:none;white-space:pre-wrap;word-break:break-all;transition:box-shadow .18s,background .18s}
textarea:focus{background:var(--surface-2);box-shadow:inset 0 0 0 1.5px var(--pink),0 0 0 4px var(--pink-soft)}
.wide textarea{min-height:44vh;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.note{margin-top:6px;color:var(--text-3);font-size:11.5px;transition:color .15s}
.note.warn{color:var(--danger)}
.ft{display:flex;align-items:center;gap:6px;padding:10px 14px 12px;border-top:1px solid var(--rule)}
.ft .grow{flex:1}
.btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:11px;background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--rule);font-size:12.5px;font-weight:600;transition:scale .12s,opacity .15s,background .15s,filter .15s}
.btn:hover{background:var(--surface-2)}
.btn:active{scale:.96}
.btn.pri{background:var(--pink);color:var(--on-pink);box-shadow:none}
.btn.pri:hover{filter:brightness(1.08)}
.btn.danger{color:var(--danger)}
.btn[disabled]{opacity:.4;pointer-events:none}
.btn.busy{opacity:.6;pointer-events:none}
.list{display:flex;flex-direction:column;gap:8px}
.it{padding:9px 10px;border-radius:12px;background:var(--surface);animation:cpnFade .22s var(--out) both}
.it:nth-child(2){animation-delay:.03s}.it:nth-child(3){animation-delay:.06s}.it:nth-child(4){animation-delay:.09s}.it:nth-child(n+5){animation-delay:.12s}
.it .meta{display:flex;gap:6px;color:var(--text-3);font-size:11px;font-weight:700;margin-bottom:4px}
.it .meta b{color:var(--text-2)}
.it.old{opacity:.55}
.del,.ins{display:block;white-space:pre-wrap;word-break:break-all;font-size:12.5px}
.del{color:var(--text-3);text-decoration:line-through;text-decoration-color:var(--danger)}
.ins{color:var(--text)}
.ins mark{background:var(--pink-soft);color:inherit;border-radius:3px;padding:0 1px}
.empty{color:var(--text-3);font-size:12px}
.stale{margin-bottom:8px;padding:8px 10px;border-radius:11px;background:var(--surface);color:var(--text-2);font-size:12px}
.sw{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 4px;border:0;background:none;color:var(--text-2);font-size:12px;font-weight:600}
.sw i{position:relative;width:30px;height:18px;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--rule);transition:background .2s}
.sw i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--text-2);transition:translate .22s var(--spring),background .2s}
.sw[aria-pressed=true] i{background:var(--pink)}
.sw[aria-pressed=true] i::after{translate:12px 0;background:#fff}
.toast{position:absolute;left:50%;bottom:28px;translate:-50% 0;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:9px 10px 9px 14px;border-radius:14px;font-size:13px;font-weight:600;pointer-events:auto;overflow:hidden;animation:cpnToast .26s var(--spring) both}
.toast svg{color:var(--pink)}
.toast.err svg{color:var(--danger)}
.toast.err{box-shadow:var(--edge),inset 0 0 0 1px rgba(238,138,138,.35),var(--drop)}
.toast.out{pointer-events:none;animation:cpnOut .15s var(--out) forwards}
.toast button{height:28px;padding:0 10px;border:0;border-radius:9px;background:var(--surface-2);color:var(--text);font-size:12px;font-weight:700;transition:background .15s}
.toast button:hover{background:var(--pink-soft);color:var(--pink)}
.toast .tm{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--pink);opacity:.7;transform-origin:left;animation:cpnTimer linear forwards}
.seg{display:inline-flex;gap:2px;padding:3px;margin-bottom:10px;border-radius:11px;background:var(--surface)}
.seg button{height:26px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--text-2);font-size:12px;font-weight:600;transition:background .18s var(--out),color .18s}
.seg button[aria-pressed=true]{background:var(--surface-2);color:var(--text);box-shadow:inset 0 0 0 1px var(--rule)}
.it .meta{align-items:center}
.it .meta .grow{flex:1}
.mini{display:inline-flex;align-items:center;gap:3px;height:22px;padding:0 8px;border:0;border-radius:7px;background:var(--surface-2);color:var(--text-2);font-size:11px;font-weight:700;opacity:.55;transition:opacity .15s,background .15s,color .15s}
.mini svg{width:12px;height:12px}
.it:hover .mini,.mini:focus-visible{opacity:1}
@media (hover:none){.mini{opacity:1}}
.mini:hover{background:var(--pink-soft);color:var(--pink)}
.mini.busy{opacity:.6;pointer-events:none}
.tag{padding:1px 6px;border-radius:6px;background:var(--surface-2);color:var(--text-2);font-size:10.5px}
.it.gone{opacity:.5}
.it.gone .ins mark{background:none;text-decoration:line-through}
.v-cmp{animation:cpnFade .2s var(--out) both}
.cmp{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
.pane{min-width:0;padding:9px 10px;border-radius:12px;background:var(--surface)}
.pane .lab{margin-bottom:5px;color:var(--text-3);font-size:11px;font-weight:700}
.pane .txt{max-height:46vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.6;scrollbar-width:thin;scrollbar-color:var(--rail) transparent}
.pane del{color:var(--danger);text-decoration:line-through;text-decoration-thickness:1.5px;background:rgba(238,138,138,.12);border-radius:3px}
.pane ins{text-decoration:none;color:var(--text);background:var(--pink-soft);box-shadow:inset 0 -1.5px 0 var(--pink);border-radius:3px}
.pane .gap{display:inline-block;margin:0 4px;padding:0 6px;border-radius:6px;background:var(--surface-2);color:var(--text-3);font-size:11px}
.cmp-full{margin-top:6px}
@media (max-width:560px){.pop{left:10px!important;right:10px!important;top:auto!important;bottom:10px!important;width:auto!important}.cmp{grid-template-columns:1fr}.pane .txt{max-height:28vh}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important}}`;

  const ui = { host: null, shadow: null, stage: null, toolbar: null, pop: null, busy: false, sel: null };
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const $ = selector => ui.shadow?.querySelector(selector);

  function currentTheme() {
    const theme = document.body?.dataset.theme;
    if (theme === 'light' || theme === 'dark') return theme;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return pageWindow.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function injectHostStyle() {
    if (document.getElementById('cpn-host-style')) return;
    const style = document.createElement('style');
    style.id = 'cpn-host-style';
    style.textContent = HOST_CSS;
    document.head.append(style);
  }

  function ensureStage() {
    if (ui.host?.isConnected) {
      ui.stage.dataset.theme = currentTheme();
      return ui.stage;
    }
    ui.host = document.createElement('div');
    ui.host.id = 'cpn-host';
    ui.shadow = ui.host.attachShadow({ mode: 'open' });
    ui.shadow.innerHTML = `<style>${STAGE_CSS}</style><div class="stage"></div>`;
    ui.stage = ui.shadow.querySelector('.stage');
    ui.stage.dataset.theme = currentTheme();
    document.body.append(ui.host);
    // 편집 창 안의 키(Enter 등)가 크랙 단축키로 새지 않게, 창(window)의 잡기 단계에서 가장 먼저 멈춥니다.
    // (그림자 DOM 안에서 멈추면 document·window의 잡기 단계 리스너에는 이미 닿은 뒤입니다.)
    if (!ui.keyGuard) {
      ui.keyGuard = true;
      ['keydown', 'keyup', 'keypress'].forEach(type => pageWindow.addEventListener(type, event => {
        if (!ui.host || !event.composedPath().includes(ui.host)) return;
        if (type === 'keydown') onPanelKey(event);
        event.stopPropagation();
      }, true));
    }
    // 막대를 누를 때 선택이 풀리지 않게 합니다.
    ui.shadow.addEventListener('mousedown', event => {
      if (event.target.closest('.tb')) event.preventDefault();
    });
    ui.shadow.addEventListener('click', onPanelClick);
    return ui.stage;
  }

  // 닫힐 때 살짝 줄어들며 사라지게 합니다(그동안은 눌리지 않음).
  const reduceMotion = () => Boolean(pageWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function fadeOut(el, ms = 140) {
    if (!el) return;
    if (reduceMotion()) {
      el.remove();
      return;
    }
    el.classList.add('out');
    setTimeout(() => el.remove(), ms);
  }

  function hideToolbar() {
    fadeOut(ui.toolbar);
    ui.toolbar = null;
  }

  function closePop() {
    fadeOut(ui.pop);
    ui.pop = null;
    ui.busy = false;
  }

  function place(el, rect, prefer = 'below') {
    const gap = 8;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(10, Math.min(innerWidth - width - 10, left));
    let top = prefer === 'above' ? rect.top - height - gap : rect.bottom + gap;
    if (prefer === 'above' && top < 8) top = rect.bottom + gap;
    if (prefer === 'below' && top + height > innerHeight - 8) top = Math.max(8, rect.top - height - gap);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.max(8, Math.min(innerHeight - height - 8, top)))}px`;
  }

  const coarse = () => pageWindow.matchMedia?.('(pointer: coarse)').matches;

  function showToolbar(sel) {
    ensureStage();
    hideToolbar();
    ui.sel = sel;
    const bar = document.createElement('div');
    bar.className = 'tb';
    bar.innerHTML = `<button class="main" data-act="edit">${ICONS.pen}고치기</button><button data-act="erase">${ICONS.erase}지우기</button><button data-act="source" title="이 메시지 원문 전체 고치기">${ICONS.source}원문</button>`;
    ui.stage.append(bar);
    ui.toolbar = bar;
    const rect = sel.range.getBoundingClientRect();
    // 휴대폰은 위쪽에 기본 복사 메뉴가 뜨므로 아래에 둡니다.
    place(bar, rect, coarse() ? 'below' : 'above');
    // 선택한 글 쪽에서 튀어나오게 합니다.
    bar.style.transformOrigin = parseFloat(bar.style.top) < rect.top ? '50% 100%' : '50% 0';
  }

  function toast(message, options = {}) {
    const stage = ensureStage();
    stage.querySelectorAll('.toast:not(.out)').forEach(node => fadeOut(node, 160));
    const node = document.createElement('div');
    node.className = `toast${options.error ? ' err' : ''}`;
    node.innerHTML = `${options.error ? ICONS.alert : ICONS.check}<span>${esc(message)}</span>`;
    if (options.action) {
      const button = document.createElement('button');
      button.textContent = options.action.label;
      button.addEventListener('click', () => {
        fadeOut(node, 160);
        options.action.run();
      });
      node.append(button);
    }
    stage.append(node);
    // 채팅 입력창을 덮지 않게 그 위로 올립니다.
    const input = document.querySelector('.__chat_input_textarea') || Array.from(document.querySelectorAll('textarea, .ProseMirror[contenteditable="true"]')).find(el => !el.closest('[data-message-group-id]') && !el.closest('#cpn-host'));
    const box = input ? (input.closest('form') || input.parentElement || input).getBoundingClientRect() : null;
    if (box && box.top > innerHeight / 2 && box.top < innerHeight) node.style.bottom = `${Math.max(28, Math.round(innerHeight - box.top + 12))}px`;
    const ms = options.ms || (options.action ? 6000 : 2600);
    // 되돌리기 같은 버튼이 있으면 남은 시간을 아래 막대로 보여 줍니다.
    if (options.action) {
      const timer = document.createElement('i');
      timer.className = 'tm';
      timer.style.animationDuration = `${ms}ms`;
      node.append(timer);
    }
    setTimeout(() => fadeOut(node, 160), ms);
  }

  function failed(error) {
    diagState.lastError = String(error?.message || error);
    if (!(error instanceof UserError)) console.warn(LOG, error);
    toast(error instanceof UserError ? error.message : '고치지 못했어요. 새로고침 뒤 다시 해 주세요.', { error: true, ms: 4200 });
  }

  function doneToast(result, label, undo) {
    if (result.unverified) label = `${label} (서버 확인은 못 했어요)`;
    if (result.reload) {
      // 새로고침 전에 크랙 수정창으로 저장하면 그 창이 들고 있던 옛 글로 덮입니다.
      toast(`${label} · 새로고침하면 화면에 보여요. 그 전에 크랙 수정창을 쓰면 옛 글로 덮여요`, { action: { label: '새로고침', run: () => location.reload() }, ms: 8000 });
      return;
    }
    toast(label, undo ? { action: { label: '되돌리기', run: undo } } : {});
  }

  // 선택 → 대상 메시지 확인 → 원문 위치 찾기
  async function prepare(sel) {
    const target = await resolveTarget(sel.group);
    const mapped = mapSelection(target.mds, sel.range, target.content);
    return { target, mapped };
  }

  const liveGroup = target => (target.group?.isConnected ? target.group : findGroup(target.msgId));
  const undoAction = target => () => undoLast(target.chatId, target.msgId, liveGroup(target)).then(r => doneToast(r, '되돌렸어요')).catch(failed);

  // 원문 창으로 넘어간 이유는 창 안에 적습니다(휴대폰에서는 아래쪽 시트가 알림을 가리므로).
  function sourceFallback(target, region, why) {
    openSource(target, region);
    ui.pop?.querySelector('.bd')?.insertAdjacentHTML('afterbegin', `<div class="stale cpn-why">${esc(why)}</div>`);
  }

  async function startEdit(mode) {
    const sel = ui.sel;
    hideToolbar();
    if (!sel) return;
    let prepared;
    try {
      prepared = await prepare(sel);
    } catch (error) {
      failed(error);
      return;
    }
    const { target, mapped } = prepared;
    const rect = sel.range.getBoundingClientRect();
    document.getSelection()?.removeAllRanges();
    if (mode === 'source') {
      openSource(target, mapped.ok ? [mapped.a, mapped.b] : mapped.approx || null);
      return;
    }
    if (!mapped.ok) {
      sourceFallback(target, mapped.approx || null, '이 부분은 원문에서 정확히 못 찾아서, 원문 전체를 열었어요.');
      return;
    }
    if (mode === 'erase') {
      const plan = planSplice(target.content, mapped, '');
      if (!plan) {
        sourceFallback(target, [mapped.a, mapped.b], '고치면 서식(기울임·목록·링크)이 깨질 수 있어서 원문 창으로 열었어요.');
        return;
      }
      try {
        const result = await commitEdit(target, plan, { kind: 'pin', before: mapped.oldText, after: '' });
        doneToast(result, '지웠어요', undoAction(target));
      } catch (error) {
        failed(error);
      }
      return;
    }
    openEditor(target, mapped, rect);
  }

  function findGroup(msgId) {
    const bridge = findBridge();
    const wanted = new Set([msgId]);
    for (const group of document.querySelectorAll('[data-message-group-id]')) {
      const info = messageOf(group, bridge, wanted);
      if (info && (info.msgId || info.groupId) === msgId) return group;
    }
    return null;
  }

  function popShell(title, sub, wide) {
    ensureStage();
    closePop();
    const pop = document.createElement('div');
    pop.className = `pop${wide ? ' wide' : ''}`;
    pop.tabIndex = -1;
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<div class="hd"><b>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</b><button class="x" data-act="close" aria-label="닫기">${ICONS.close}</button></div><div class="bd"></div><div class="ft"></div>`;
    ui.stage.append(pop);
    ui.pop = pop;
    return pop;
  }

  function lengthNote(target, nextLength) {
    const note = ui.pop?.querySelector('.note');
    if (!note) return;
    const over = nextLength > LIMITS.soft;
    note.classList.toggle('warn', over);
    note.textContent = over
      ? `고친 뒤 ${nextLength.toLocaleString()}자예요. 8,000자가 넘으면 나중에 크랙 수정창으로 열 때 앞부분이 잘릴 수 있어요.`
      : (note.dataset.base || '');
  }

  function openEditor(target, mapped, rect) {
    const pop = popShell('핀셋 수정', '이 부분만 바꿔요');
    // 휴대폰에서는 Enter가 줄바꿈이고 [고치기] 버튼으로 저장합니다.
    const hint = coarse() ? '[고치기] 버튼으로 저장 · Enter 줄바꿈' : 'Enter 고치기 · Shift+Enter 줄바꿈 · Esc 닫기';
    pop.querySelector('.bd').innerHTML = `<div class="was"><i>원래</i>${esc(mapped.oldText)}</div><textarea spellcheck="false" aria-label="바꿀 글"></textarea><div class="note" data-base="${esc(hint)}">${esc(hint)}</div>`;
    pop.querySelector('.ft').innerHTML = '<span class="grow"></span><button class="btn" data-act="close">취소</button><button class="btn pri" data-act="save">고치기</button>';
    const area = pop.querySelector('textarea');
    area.value = mapped.oldText;
    const rest = target.content.length - mapped.oldText.length;
    area.addEventListener('input', () => lengthNote(target, rest + area.value.length));
    lengthNote(target, rest + area.value.length);
    pop.edit = { target, mapped };
    place(pop, rect, 'below');
    area.focus({ preventScroll: true });
    area.select();
  }

  function openSource(target, approx) {
    const pop = popShell('원문 고치기', '숨김 주석·서식 기호까지 보여요', true);
    const hint = coarse() ? '[고치기] 버튼으로 저장' : 'Ctrl+Enter 고치기 · Esc 닫기';
    pop.querySelector('.bd').innerHTML = `<textarea spellcheck="false" aria-label="메시지 원문"></textarea><div class="note" data-base="${esc(hint)}">${esc(hint)}</div>`;
    pop.querySelector('.ft').innerHTML = '<span class="grow"></span><button class="btn" data-act="close">취소</button><button class="btn pri" data-act="save-source">고치기</button>';
    const area = pop.querySelector('textarea');
    // 글 상자는 CRLF를 LF로 바꿔 보여 주므로, 선택 위치와 '손대지 않음' 판정도 LF 기준으로 맞춥니다.
    const shownSrc = target.content.replace(/\r\n?/g, '\n');
    const toShown = i => i - (target.content.slice(0, i).match(/\r\n/g) || []).length;
    area.value = shownSrc;
    area.addEventListener('input', () => lengthNote(target, area.value.length));
    lengthNote(target, area.value.length);
    pop.edit = { target, source: true, shown: shownSrc };
    pop.style.left = `${Math.max(10, (innerWidth - pop.offsetWidth) / 2)}px`;
    pop.style.top = `${Math.max(12, (innerHeight - pop.offsetHeight) / 2)}px`;
    area.focus({ preventScroll: true });
    if (approx) {
      area.setSelectionRange(toShown(approx[0]), toShown(approx[1]));
      const line = target.content.slice(0, approx[0]).split('\n').length;
      area.scrollTop = Math.max(0, (line - 3) * 21);
    }
  }

  async function saveEditor() {
    const pop = ui.pop;
    if (!pop?.edit || pop.busy) return;
    const button = pop.querySelector('[data-act^="save"]');
    const area = pop.querySelector('textarea');
    const { target, mapped, source } = pop.edit;
    pop.busy = true;
    button.classList.add('busy');
    // 저장하는 사이 다른 창을 열었으면 그 창은 닫지 않습니다.
    const done = () => {
      if (ui.pop === pop) closePop();
    };
    try {
      let result;
      if (source) {
        const next = area.value;
        if (next === (pop.edit.shown ?? target.content)) {
          done();
          return;
        }
        const change = wholeChange(target.content, next);
        const changes = changeList(target.content, next);
        const plan = { a: change.a, b: change.b, ins: change.newText, kept: '', next, changes };
        result = await commitEdit(target, plan, { kind: 'source', ...changeSummary(changes) });
      } else {
        let replacement = area.value;
        // 휴대폰에서 실수로 넣은 끝 줄바꿈은 뺍니다.
        if (!/\n$/.test(mapped.oldText)) replacement = replacement.replace(/\n+$/, '');
        if (replacement.replace(/\r\n?/g, '\n') === mapped.oldText.replace(/\r\n?/g, '\n')) {
          done();
          return;
        }
        const plan = planSplice(target.content, mapped, replacement);
        if (!plan) {
          done();
          sourceFallback(target, [mapped.a, mapped.b], '고치면 서식(기울임·목록·링크)이 깨질 수 있어서 원문 창으로 열었어요.');
          return;
        }
        result = await commitEdit(target, plan, { kind: 'pin', before: mapped.oldText, after: replacement });
      }
      done();
      doneToast(result, '고쳤어요', undoAction(target));
    } catch (error) {
      pop.busy = false;
      button.classList.remove('busy');
      failed(error);
    }
  }

  const KIND_LABEL = { pin: '핀셋', source: '원문 고치기', native: '크랙 수정창', revert: '하나 되돌림' };

  // ---------- 전후 비교 ----------
  // 낱말·공백·기호 단위로 나눠 Myers 차이 계산을 합니다. 너무 많이 다르면 앞뒤 같은 부분만 빼고 가운데를 통째로 바뀐 것으로 봅니다.
  const tokensOf = text => text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];

  function diffTokens(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const limit = Math.min(max, 300);
    const off = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];
    let found = -1;
    for (let d = 0; d <= limit && found < 0; d += 1) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[k - 1 + off] < v[k + 1 + off]) ? v[k + 1 + off] : v[k - 1 + off] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) {
          x += 1;
          y += 1;
        }
        v[k + off] = x;
        if (x >= n && y >= m) {
          found = d;
          break;
        }
      }
    }
    if (found < 0) return null;
    const ops = [];
    let x = n;
    let y = m;
    for (let d = found; d >= 0; d -= 1) {
      const vv = trace[d];
      const k = x - y;
      const prevK = k === -d || (k !== d && vv[k - 1 + off] < vv[k + 1 + off]) ? k + 1 : k - 1;
      const prevX = vv[prevK + off];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) {
        ops.push(['=', a[x - 1]]);
        x -= 1;
        y -= 1;
      }
      if (d > 0) {
        if (x === prevX) ops.push(['+', b[y - 1]]);
        else ops.push(['-', a[x - 1]]);
      }
      x = prevX;
      y = prevY;
    }
    return ops.reverse();
  }

  // 같은 종류끼리 이어 붙인 조각 목록 [[종류, 글], …]
  function diffParts(before, after) {
    let ops = diffTokens(tokensOf(before), tokensOf(after));
    if (!ops) {
      const c = wholeChange(before, after);
      ops = [['=', before.slice(0, c.a)], ['-', c.oldText], ['+', c.newText], ['=', before.slice(c.b)]];
    }
    const parts = [];
    for (const [type, text] of ops) {
      if (!text) continue;
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart[0] === type) lastPart[1] += text;
      else parts.push([type, text]);
    }
    return parts;
  }

  // 한쪽(처음 글 = 'old', 지금 글 = 'new')을 그립니다. 바뀌지 않은 긴 부분은 앞뒤만 남기고 접습니다(full이면 다 보여 줌).
  function diffPaneHtml(parts, side, full) {
    const skip = side === 'old' ? '+' : '-';
    const visible = parts.filter(([type]) => type !== skip);
    return visible.map(([type, text], index) => {
      if (type === '-') return `<del>${esc(text)}</del>`;
      if (type === '+') return `<ins>${esc(text)}</ins>`;
      if (full || text.length <= 260) return esc(text);
      const head = index > 0 ? esc(text.slice(0, 90)) : '';
      const tail = index < visible.length - 1 ? esc(text.slice(-90)) : '';
      return `${head}<span class="gap">⋯</span>${tail}`;
    }).join('');
  }

  function compareHtml(record, full) {
    const parts = diffParts(record.base, record.current);
    const changed = parts.filter(([type]) => type !== '=').length;
    if (!changed) return '<div class="empty">처음 글과 지금 글이 같아요.</div>';
    return `<div class="cmp"><div class="pane"><div class="lab">처음 글</div><div class="txt">${diffPaneHtml(parts, 'old', full)}</div></div><div class="pane"><div class="lab">지금 글</div><div class="txt">${diffPaneHtml(parts, 'new', full)}</div></div></div>
<button class="sw cmp-full" data-act="cmp-full" aria-pressed="${Boolean(full)}"><i></i>바뀌지 않은 부분도 다 보기</button>`;
  }

  function ago(at) {
    const sec = Math.max(0, (Date.now() - at) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
    return `${Math.floor(sec / 86400)}일 전`;
  }

  const clip = (text, max = 160) => (text.length > max ? `${text.slice(0, max)}…` : text);

  function openTrace(group, msgId, rect) {
    // 쓰던 편집 창(글을 바꿨거나 저장 중)이 있으면 흔적 창으로 바꾸지 않습니다(입력이 사라지지 않게).
    if (ui.pop?.edit) {
      const area = ui.pop.querySelector('textarea');
      const original = ui.pop.edit.source ? (ui.pop.edit.shown ?? ui.pop.edit.target.content) : ui.pop.edit.mapped.oldText;
      if (ui.pop.busy || !area || area.value !== original) {
        area?.focus({ preventScroll: true });
        return;
      }
    }
    const chatId = here().chatId;
    const record = book(chatId)[msgId];
    if (!record || !group) return;
    hideToolbar();
    const pop = popShell('수정 흔적', `${record.edits.length}번 고침`);
    const bridge = findBridge(mdsOf(group)[0]);
    const info = messageOf(group, bridge, new Set([msgId]));
    const stale = !info || (info.fromStore ? normalize(info.content) !== normalize(record.current) : reloadNeeded.has(msgId) || coverage(record.current, info.mds) <= 0.97);
    // 수정마다 '이것만 되돌리기'(가장 최근 것은 '방금 것'과 같음). 오래됐거나 뒤 수정과 겹치면 버튼을 두지 않습니다.
    const lastIndex = record.edits.length - 1;
    const canRevert = (edit, i) => {
      if (stale || edit.old || edit.reverted) return false;
      if (i === lastIndex) return typeof edit.prev === 'string';
      const plan = planRevertOne(record, i);
      return Boolean(plan && !plan.conflict);
    };
    const items = record.edits.map((edit, i) => {
      const button = canRevert(edit, i) ? `<button class="mini" data-act="revert-one" data-at="${Number(edit.at)}" title="이 수정만 원래 글로 되돌려요">${ICONS.undo}이것만</button>` : '';
      const tag = edit.reverted ? '<span class="tag">되돌림</span>' : '';
      return `<div class="it${edit.old ? ' old' : ''}${edit.reverted ? ' gone' : ''}"><div class="meta"><b>${KIND_LABEL[edit.kind] || '수정'}</b><span>${ago(edit.at)}</span>${tag}<span class="grow"></span>${button}</div>${edit.before ? `<span class="del">${esc(clip(edit.before))}</span>` : ''}<span class="ins">${edit.after ? `<mark>${esc(clip(edit.after))}</mark>` : '<i>(지움)</i>'}</span></div>`;
    }).reverse().join('');
    const notes = [
      stale && reloadNeeded.has(msgId)
        ? '<div class="stale">서버에는 저장됐어요. 새로고침하면 흔적이 칠해지고 되돌리기도 쓸 수 있어요.</div>'
        : stale ? '<div class="stale">이 메시지가 다른 곳에서 바뀌어서 흔적을 칠하지 못했어요. 되돌리기도 막아 두었어요.</div>' : '',
      record.rebased ? '<div class="stale">중간에 다른 곳에서 글이 바뀌어서, 그 뒤의 수정만 되돌릴 수 있어요. 흐린 기록은 보기만 돼요.</div>' : '',
    ].join('');
    const seg = '<div class="seg"><button data-act="view" data-view="log" aria-pressed="true">기록</button><button data-act="view" data-view="cmp" aria-pressed="false">전후 비교</button></div>';
    pop.querySelector('.bd').innerHTML = `${seg}<div class="v-log">${notes}<div class="list">${items || '<div class="empty">기록이 없어요.</div>'}</div></div><div class="v-cmp" hidden></div>`;
    const last = record.edits[record.edits.length - 1];
    const canUndo = !stale && last && typeof last.prev === 'string';
    pop.querySelector('.ft').innerHTML = `<button class="sw" data-act="paint" aria-pressed="${settings.paint}"><i></i>색칠</button><span class="grow"></span><button class="btn danger" data-act="forget" title="글은 그대로 두고 기록만 지워요">기록 지우기</button><button class="btn" data-act="undo"${canUndo ? '' : ' disabled'}>${ICONS.undo}방금 것</button><button class="btn pri" data-act="restore"${stale ? ' disabled' : ''}>처음 글로</button>`;
    pop.trace = { chatId, msgId, group };
    place(pop, rect, 'below');
    pop.focus({ preventScroll: true });
  }

  function onPanelKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      swallowKeyUp('Escape');
      if (ui.pop) closePop();
      else hideToolbar();
      return;
    }
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    const pop = ui.pop;
    if (!pop?.edit || (event.composedPath()[0] || event.target)?.tagName !== 'TEXTAREA') return;
    if (pop.edit.source ? (event.ctrlKey || event.metaKey) : !event.shiftKey && !coarse()) {
      event.preventDefault();
      swallowKeyUp('Enter');
      saveEditor();
    }
  }

  // 키를 누르는 순간 창이 닫히면, 손을 뗄 때의 keyup이 본문으로 가서 크랙 단축키(Enter → 입력창 이동)가 움직입니다. 그 keyup 하나를 삼킵니다.
  // 키를 누른 채로 있으면 반복 keydown도 새므로 같이 막고, keyup은 실제로 올 때까지(최대 5초) 기다립니다.
  function swallowKeyUp(key) {
    const onDown = event => {
      if (event.key !== key || !event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onUp = event => {
      if (event.key !== key) return;
      event.stopPropagation();
      stop();
    };
    const stop = () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    setTimeout(stop, 5000);
  }

  async function runTrace(action, button) {
    const pop = ui.pop;
    if (pop.busy) return;
    const { chatId, msgId, group } = pop.trace;
    const live = group.isConnected ? group : findGroup(msgId);
    pop.busy = true;
    button?.classList.add('busy');
    try {
      if (action === 'undo') doneToast(await undoLast(chatId, msgId, live), '방금 수정을 되돌렸어요');
      if (action === 'restore') doneToast(await restoreBase(chatId, msgId, live), '처음 글로 되돌렸어요');
      if (action === 'revert-one') doneToast(await revertOne(chatId, msgId, live, Number(button.dataset.at)), '그 수정만 되돌렸어요');
      pop.busy = false;
      if (ui.pop === pop) closePop();
    } catch (error) {
      pop.busy = false;
      button?.classList.remove('busy');
      failed(error);
    }
  }

  // 흔적 창의 '기록 | 전후 비교' 전환. 비교는 처음 열 때 한 번 그립니다. 비교는 넓은 창으로 보여 줍니다.
  function switchTraceView(view, full) {
    const pop = ui.pop;
    if (!pop?.trace) return;
    const record = book(pop.trace.chatId)[pop.trace.msgId];
    pop.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    const log = pop.querySelector('.v-log');
    const cmp = pop.querySelector('.v-cmp');
    if (view === 'cmp' && record && (!cmp.dataset.ready || full !== undefined)) {
      cmp.innerHTML = compareHtml(record, Boolean(full));
      cmp.dataset.ready = '1';
    }
    log.hidden = view !== 'log';
    cmp.hidden = view !== 'cmp';
    pop.classList.toggle('wide', view === 'cmp');
    const left = parseFloat(pop.style.left) || 10;
    pop.style.left = `${Math.max(10, Math.min(innerWidth - pop.offsetWidth - 10, left))}px`;
    const top = parseFloat(pop.style.top) || 10;
    pop.style.top = `${Math.max(8, Math.min(innerHeight - pop.offsetHeight - 8, top))}px`;
  }

  function onPanelClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'close') return closePop();
    if (act === 'edit' || act === 'erase' || act === 'source') return startEdit(act);
    if (act === 'save' || act === 'save-source') return saveEditor();
    if (act === 'undo' || act === 'restore' || act === 'revert-one') return runTrace(act, button);
    if (act === 'view') return switchTraceView(button.dataset.view);
    if (act === 'cmp-full') return switchTraceView('cmp', button.getAttribute('aria-pressed') !== 'true');
    if (act === 'forget') {
      const { chatId, msgId } = ui.pop.trace;
      forget(chatId, msgId);
      closePop();
      toast('기록만 지웠어요. 글은 그대로예요.');
      return;
    }
    if (act === 'paint') {
      settings.paint = !settings.paint;
      writeValue(SETTINGS_KEY, settings);
      button.setAttribute('aria-pressed', String(settings.paint));
      schedulePaint(0);
    }
  }

  // ---------- 선택 감지 ----------

  const mdOf = node => (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('.wrtn-markdown') || null;

  // 선택 안에 다른 메시지의 글자가 들어 있는지
  function otherMessageTextIn(range, group) {
    for (const other of document.querySelectorAll('.wrtn-markdown')) {
      if (group.contains(other)) continue;
      const o = document.createRange();
      o.selectNodeContents(other);
      if (range.compareBoundaryPoints(Range.START_TO_END, o) <= 0 || range.compareBoundaryPoints(Range.END_TO_START, o) >= 0) continue;
      const x = range.cloneRange();
      if (x.compareBoundaryPoints(Range.START_TO_START, o) < 0) x.setStart(o.startContainer, o.startOffset);
      if (x.compareBoundaryPoints(Range.END_TO_END, o) > 0) x.setEnd(o.endContainer, o.endOffset);
      if (/[\p{L}\p{N}]/u.test(x.toString())) return true;
    }
    return false;
  }

  function currentSelection() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0).cloneRange();
    const home = mdOf(sel.anchorNode) || mdOf(range.startContainer) || mdOf(range.endContainer);
    const group = groupOf(home);
    if (!home || !group) return null;
    const inGroup = node => {
      const m = mdOf(node);
      return Boolean(m && group.contains(m));
    };
    // 세 번 클릭처럼 끝이 메시지 글 밖(버튼·다음 블록 맨 앞)에 걸리면, 다른 메시지 글자가 없을 때만 이 메시지 글 끝으로 줄입니다.
    if (!inGroup(range.startContainer) || !inGroup(range.endContainer)) {
      // 시작 쪽이 다른 메시지에 있으면(목록 아래 빈틈까지 끈 경우) 화면에 칠해진 곳과 끈 곳이 달라서 거절합니다.
      if (!inGroup(range.startContainer) && !group.contains(range.startContainer)) return null;
      if (otherMessageTextIn(range, group)) return null;
      const mds = mdsOf(group);
      if (!inGroup(range.startContainer)) {
        const first = mds.find(m => range.comparePoint(m, 0) === 0);
        if (!first) return null;
        range.setStart(first, 0);
      }
      if (!inGroup(range.endContainer)) {
        const last = mds.slice().reverse().find(m => range.comparePoint(m, m.childNodes.length) === 0);
        if (!last) return null;
        range.setEnd(last, last.childNodes.length);
      }
    }
    const md = mdOf(range.startContainer);
    const el = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (!md || md.closest('[contenteditable="true"]')) return null;
    // 본문 안의 버튼 글자·입력 칸·핀셋 UI를 고른 것은 무시합니다.
    if ([range.startContainer, range.endContainer].some(node => el(node)?.closest('[contenteditable="true"], button, textarea, input, select, .cpn-ui'))) return null;
    if (!here().chatId || !/[\p{L}\p{N}]/u.test(range.toString())) return null;
    return { md, group, range };
  }

  // 이미 더 빨리 확인하기로 한 게 있으면 미루지 않습니다(마우스를 뗀 직후에 막대가 바로 뜨게).
  let selTimer = 0;
  let selDue = 0;
  let pointerHeld = false;
  function checkSelection(delay) {
    const due = Date.now() + delay;
    if (selTimer && selDue <= due) return;
    clearTimeout(selTimer);
    selDue = due;
    selTimer = setTimeout(() => {
      selTimer = 0;
      if (ui.pop) return;
      const sel = currentSelection();
      // 답변을 만드는 중(글자가 아직 안 나오는 대기 구간 포함)에는 막대를 띄우지 않습니다.
      const state = sel ? findBridge(sel.md).state : null;
      if (!sel || streamingNow() || (state && String(state.status).toUpperCase() !== 'IDLE')) {
        hideToolbar();
        return;
      }
      if (ui.toolbar && ui.sel && ui.sel.md === sel.md && ui.sel.range.toString() === sel.range.toString()) return;
      showToolbar(sel);
    }, delay);
  }

  let downAt = null;
  let warnedBlocked = false;
  document.addEventListener('pointerup', event => {
    pointerHeld = false;
    if (event.composedPath().includes(ui.host)) return;
    // 메시지 글을 마우스로 끌었는데 선택이 안 되면, 다른 확프가 글자 선택을 막고 있는 것입니다(한 번만 알림).
    if (!warnedBlocked && event.pointerType === 'mouse' && downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 12) {
      const md = event.target instanceof Element ? event.target.closest('.wrtn-markdown') : null;
      if (md && document.getSelection()?.isCollapsed && getComputedStyle(md).userSelect === 'none') {
        warnedBlocked = true;
        toast('다른 확프(모바일 유틸의 길게 누르기 메뉴)가 글자 선택을 막고 있어요. 그 설정을 끄면 핀셋을 쓸 수 있어요.', { error: true, ms: 6000 });
      }
    }
    downAt = null;
    checkSelection(30);
  }, true);
  document.addEventListener('pointercancel', () => { pointerHeld = false; }, true);
  document.addEventListener('keyup', event => {
    if (event.shiftKey || event.key === 'Shift') checkSelection(60);
  }, true);
  // 마우스로 끄는 중에는 기다렸다가 뗄 때 확인합니다. 휴대폰은 선택 손잡이를 움직여도 포인터 이벤트가 없어서 이것으로 확인합니다.
  document.addEventListener('selectionchange', () => {
    if (coarse()) {
      // 휴대폰: 손잡이를 끄는 동안에는 막대를 다시 만들지 않고, 멈춘 뒤 한 번만 확인합니다.
      clearTimeout(selTimer);
      selTimer = 0;
      checkSelection(450);
      return;
    }
    if (pointerHeld) return;
    checkSelection(250);
  });
  document.addEventListener('pointerdown', event => {
    const path = event.composedPath();
    if (path.includes(ui.host)) return;
    pointerHeld = event.pointerType === 'mouse';
    downAt = { x: event.clientX, y: event.clientY };
    // 새로 누르면 옛 선택의 막대는 바로 숨깁니다(새 선택을 옛 막대 위에서 놓아 옛 선택을 고치지 않게).
    hideToolbar();
    if (ui.pop && !ui.pop.edit) closePop();
  }, true);
  window.addEventListener('scroll', () => hideToolbar(), true);
  window.addEventListener('resize', () => hideToolbar());

  // 칠해진 흔적을 누르면 흔적 창을 엽니다.
  // 크랙 메시지 칸이 클릭 전파를 막아 두어서, 잡는 단계(capture)에서 듣습니다.
  document.addEventListener('click', event => {
    if (!document.getSelection()?.isCollapsed || event.composedPath().includes(ui.host)) return;
    const md = event.target instanceof Element ? event.target.closest('.wrtn-markdown') : null;
    const hit = md && hits.get(md);
    if (!hit) return;
    let node = null;
    let offset = 0;
    if (document.caretRangeFromPoint) {
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      node = caret?.startContainer;
      offset = caret?.startOffset ?? 0;
    } else if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(event.clientX, event.clientY);
      node = caret?.offsetNode;
      offset = caret?.offset ?? 0;
    }
    if (!node) return;
    const inside = hit.ranges.some(range => {
      try {
        return range.isPointInRange(node, offset) && (range.comparePoint(node, offset) === 0);
      } catch (error) {
        return false;
      }
    });
    if (inside) openTrace(hit.group, hit.id, { left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY + 8, width: 0, height: 8 });
  }, true);

  // ---------- 시작 ----------

  let listObserver = null;
  let observedList = null;
  let lastPath = location.pathname;

  function tick() {
    injectHostStyle();
    // 배지와 창이 같은 테마 판단을 쓰고, 창을 연 채 테마를 바꿔도 따라가게 합니다.
    const theme = currentTheme();
    if (document.documentElement.dataset.cpnTheme !== theme) document.documentElement.dataset.cpnTheme = theme;
    if (ui.stage && ui.stage.dataset.theme !== theme) ui.stage.dataset.theme = theme;
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      hideToolbar();
      closePop();
      schedulePaint(300);
    }
    const list = document.querySelector('[data-message-group-id]')?.parentElement || null;
    if (list !== observedList) {
      listObserver?.disconnect();
      observedList = list;
      if (list) {
        listObserver = new MutationObserver(mutations => {
          if (mutations.every(m => m.target instanceof Element && m.target.closest?.('.cpn-badge'))) return;
          schedulePaint();
        });
        listObserver.observe(list, { childList: true, subtree: true, characterData: true });
        findBridge();
        schedulePaint(100);
      }
    }
  }

  hookNetwork();
  tick();
  setInterval(tick, 1000);

  // 실기기 점검용: 개발자 도구 콘솔에서 CrackPinset.diag() 를 실행하면 연결 상태를 보여 줍니다.
  pageWindow.CrackPinset = {
    version: VERSION,
    diag() {
      const h = here();
      const md = document.querySelector('[data-message-group-id] .wrtn-markdown');
      const bridge = findBridge(md);
      const state = bridge.store ? bridge.store.getState() : null;
      const info = md ? messageOf(groupOf(md), bridge) : null;
      return {
        version: VERSION,
        route: h,
        fiber: bridge.fiber,
        actions: bridge.actions ? Object.keys(bridge.actions).sort() : null,
        chatState: bridge.state ? { status: bridge.state.status, chatId: bridge.state.chatId, selectedMessageId: bridge.state.selectedMessageId } : null,
        chatIdMismatch: bridge.mismatch,
        store: state ? { messages: state.messages.size, groups: state.messageGroups ? state.messageGroups.length : null, updateMessage: typeof state.updateMessage === 'function' } : null,
        firstMessage: info ? { groupId: info.groupId, ids: info.ids, msgId: info.msgId, fromStore: info.fromStore, contentLength: info.content?.length ?? null, mds: info.mds.length, coverage: info.content ? Number(coverage(info.content, info.mds).toFixed(3)) : null } : null,
        highlightApi: Boolean(HL && registry()),
        // 다른 확프(모바일 유틸 길게 누르기 메뉴 등)가 메시지 글자 선택을 막고 있는지
        selectBlocked: md ? getComputedStyle(md).userSelect === 'none' : null,
        network: { xhr: diagState.xhrHooked, xhrWrapped: diagState.xhrWrapped, fetch: diagState.fetchHooked },
        lastPath: diagState.lastPath,
        lastError: diagState.lastError,
        nativeCaptured: diagState.nativeCaptured,
        records: Object.keys(book(h.chatId)).length,
      };
    },
    records: () => JSON.parse(JSON.stringify(book(here().chatId))),
    debug(on = true) {
      debug = Boolean(on);
      try { pageWindow.localStorage.setItem('cpn:debug', debug ? '1' : '0'); } catch (error) { /* 무시 */ }
      return debug;
    },
    // 원문 대조 시험: CrackPinset.mapTest() → 현재 선택한 글이 원문 어디에 해당하는지
    async mapTest() {
      const sel = currentSelection();
      if (!sel) return '메시지 안에서 글자를 먼저 선택해 주세요.';
      const { target, mapped } = await prepare(sel);
      const { vpos, ...rest } = mapped;
      const erase = mapped.ok ? planSplice(target.content, mapped, '') : null;
      return { msgId: target.msgId, via: target.via, ...rest, sourceSlice: mapped.ok ? target.content.slice(mapped.a, mapped.b) : null, eraseWouldGive: erase ? erase.next.slice(Math.max(0, erase.a - 30), erase.a + erase.kept.length + 30) : '(원문 창으로 넘어감)' };
    },
  };
  console.info(LOG, `v${VERSION} 준비됨`);
})();
