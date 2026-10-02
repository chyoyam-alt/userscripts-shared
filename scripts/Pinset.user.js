// ==UserScript==
// @name         ✂️ Crack Pinset (핀셋 수정)
// @namespace    crack-pinset
// @version      0.1.0
// @description  [시험판] 메시지에서 글자를 드래그하면 그 부분만 바로 고칩니다. 크랙 수정창을 열 필요가 없고 새로고침도 하지 않습니다. 고친 자리에는 분홍색 흔적이 남고, 원래 글 보기·되돌리기를 할 수 있습니다.
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

  const VERSION = '0.1.0';
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
  const books = new Map();
  const dirty = new Map();
  const watchedKeys = new Set();

  // 방마다 { 메시지id: { base, current, spans, edits, at } }
  // base: 처음 본 원문, current: 마지막으로 확인한 서버 원문, spans: current 안에서 바뀐 자리 [시작, 끝] (끝=시작이면 지운 자리)
  function book(chatId) {
    if (!chatId) return {};
    if (!books.has(chatId)) {
      books.set(chatId, readValue(chatKey(chatId), {}));
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
    const records = readValue(chatKey(chatId), {});
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
      message = (shown !== null && candidates.find(item => item.content === shown)) || null;
      if (!message && candidates.length > 1) {
        // 문단별 말풍선이라 props가 문단 하나뿐이면, 화면 글과 가장 잘 맞는 답변을 고릅니다.
        let best = -1;
        for (const item of candidates) {
          const score = coverage(item.content, mds);
          if (score > best) {
            best = score;
            message = item;
          }
        }
        if (best < 0.9) message = null;
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
  const LINK_DEF_RE = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<[^>\n]*>|[^\s<>]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*(?:\n|$)/gm;
  const IMAGE_RE = /!\[[^\]\n]*\]\([^)\n]*\)/g;
  const LINK_DEST_RE = /\]\([^)\n]*\)/g;
  const COMMENT_RE = /<!--[\s\S]*?-->/g;
  const BLOCK_MARK_RE = /^[ \t]*(?:>[ \t]?|(?:\d{1,9}[.)]|[-+*]|#{1,6})[ \t]+)+/gm;

  function stripHidden(src, ren) {
    const drop = new Uint8Array(src.length);
    const res = [LINK_DEF_RE, IMAGE_RE, LINK_DEST_RE, BLOCK_MARK_RE];
    if (!ren.includes('<!--')) res.push(COMMENT_RE);
    for (const re of res) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        drop.fill(1, m.index, m.index + m[0].length);
        if (!m[0].length) re.lastIndex += 1;
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
      if (a === c) {
        r2s[j] = i;
        i += 1;
        j += 1;
        continue;
      }
      if (a === '&') {
        const entity = /^&(#\d+|#x[0-9a-f]+|[a-z]+);/i.exec(src.slice(i, i + 12));
        if (entity && decodeEntity(entity[0]) === c) {
          jumps[j] = 1;
          r2s[j] = i;
          i += entity[0].length;
          j += 1;
          continue;
        }
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
    const visible = new Uint8Array(src.length);
    let first = -1;
    let last = -1;
    let missing = 0;
    for (let j = rs; j < re; j += 1) {
      const s = r2s[j];
      if (jumps[j]) missing += 1;
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
        let j = -1;
        for (let i = s; i < Math.min(s2r.length, s + 40) && j < 0; i += 1) j = s2r[i];
        for (let i = s - 1; i >= Math.max(0, s - 40) && j < 0; i -= 1) j = s2r[i];
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

  // 선택한 글(oldText)과 새 글을 앞뒤로 비교해 실제로 달라진 가운데만 원문에서 바꿉니다. 그래서 서식 기호는 대부분 제자리에 남습니다.
  // 바뀌는 자리 안에 기울임·굵게 기호가 아닌 것(목록·인용·링크·이미지·이스케이프)이 끼어 있으면 null → 원문 창으로 넘깁니다.
  function planSplice(src, mapped, replacement) {
    const old = mapped.oldText;
    const vpos = mapped.vpos;
    const max = Math.min(old.length, replacement.length);
    let p = 0;
    while (p < max && old[p] === replacement[p]) p += 1;
    let s = 0;
    while (s < max - p && old[old.length - 1 - s] === replacement[replacement.length - 1 - s]) s += 1;
    const oldEnd = old.length - s;
    const ins = replacement.slice(p, replacement.length - s);
    let a;
    let b;
    if (oldEnd > p) {
      a = vpos[p];
      b = vpos[oldEnd - 1] + 1;
    } else {
      a = p > 0 ? vpos[p - 1] + 1 : vpos[0];
      b = a;
    }
    const changed = new Set(vpos.slice(p, oldEnd));
    let kept = '';
    for (let i = a; i < b; i += 1) if (!changed.has(i)) kept += src[i];
    if (kept && !/^[*_~]+$/.test(kept)) return null;
    if (!ins) [a, b] = tidyDelete(src, a, b, kept);
    return { a, b, ins, kept, next: src.slice(0, a) + ins + kept + src.slice(b) };
  }

  // 지운 뒤 서식이 깨지지 않게 다듬습니다.
  // 1) *글*의 글을 통째로 지우면 남는 빈 기호 쌍(**, ****)도 지웁니다.
  // 2) 기호 바로 앞뒤에 공백이 남으면(*글 *, * 글*) 그 공백도 지웁니다. 크랙에서는 기울임이 풀려 별표가 그대로 보이기 때문입니다.
  function tidyDelete(src, a, b, kept) {
    if (!kept) {
      for (let guard = 0; guard < 3; guard += 1) {
        const left = /[*_~]+$/.exec(src.slice(Math.max(0, a - 4), a))?.[0] || '';
        const right = /^[*_~]+/.exec(src.slice(b, b + 4))?.[0] || '';
        if (!left || !right) break;
        const ch = right[0];
        let l = 0;
        while (l < left.length && left[left.length - 1 - l] === ch) l += 1;
        let r = 0;
        while (r < right.length && right[r] === ch) r += 1;
        const k = Math.min(l, r);
        if (!k) break;
        a -= k;
        b += k;
      }
    }
    const next = kept ? kept[0] : src[b];
    const lineStart = a === 0 || src[a - 1] === '\n';
    if (/[ \t]/.test(src[a - 1] || '') && (next === undefined || next === '\n' || isDelim(next))) {
      while (a > 0 && /[ \t]/.test(src[a - 1])) a -= 1;
    } else if (!kept && /[ \t]/.test(src[b] || '') && (lineStart || isDelim(src[a - 1]))) {
      while (b < src.length && /[ \t]/.test(src[b])) b += 1;
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

  // 통째로 바뀐 경우(크랙 수정창·원문 편집)는 앞뒤가 같은 부분을 빼고 가운데를 바뀐 자리로 봅니다.
  function wholeChange(before, after) {
    let p = 0;
    const max = Math.min(before.length, after.length);
    while (p < max && before[p] === after[p]) p += 1;
    let s = 0;
    while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
    return { a: p, b: before.length - s, newLen: after.length - s - p, oldText: before.slice(p, before.length - s), newText: after.slice(p, after.length - s) };
  }

  // ---------- 저장 경로 ----------

  // 우리가 쓴 내용은 '크랙 수정창 기록'으로 잘못 남지 않게 잠깐 표시해 둡니다. 저장이 끝나면 2초 뒤 풀어서, 곧이어 크랙 수정창으로 고친 것은 기록되게 합니다.
  const ownWrites = new Map();
  function markOwn(id, ttl, ...contents) {
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
  const isOwn = (id, content) => (ownWrites.get(id)?.get(normalize(content)) || 0) > Date.now();

  // 저장 중인 메시지. 이 동안에는 화면이 잠깐 원문으로 보여도 기록을 지우지 않습니다.
  const inFlight = new Set();
  // 크랙 내부를 못 찾아 서버에만 저장한 메시지(새로고침 전까지 화면은 옛 글)
  const reloadNeeded = new Set();
  const diagState = { lastPath: '', lastError: '', xhrHooked: false, fetchHooked: false, nativeCaptured: 0 };

  // 크랙과 같은 길(A1) → 저장소만 직접 고치기(A2) → API로만 고치고 새로고침 안내(C) 순서로 시도합니다.
  async function writeContent(target, next) {
    const h = here();
    if (h.chatId !== target.chatId) throw new UserError('다른 방으로 옮겨져서 취소했어요.');
    if (!normalize(next)) throw new UserError('메시지를 전부 비울 수는 없어요.');
    if (inFlight.has(target.msgId)) throw new UserError('아직 앞의 수정을 저장하고 있어요.');
    const anchor = target.group?.isConnected ? mdsOf(target.group)[0] : null;
    const bridge = findBridge(anchor);
    if ((bridge.state && String(bridge.state.status).toUpperCase() !== 'IDLE') || streamingNow()) throw new UserError('답변이 만들어지는 중에는 고칠 수 없어요.');
    if (nativeEditorOpen(target.group) || bridge.state?.isEdit) throw new UserError('크랙 수정창이 열려 있어요. 먼저 끝내거나 닫아 주세요.');
    const fresh = bridge.store?.getState().messages.get(target.msgId);
    if (fresh && fresh.content !== target.content) throw new UserError('그사이 메시지가 바뀌었어요. 다시 선택해 주세요.');
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
      await bridge.actions.updateMessage({ _id: fresh._id, content: fresh.content }, next);
      let content = null;
      try {
        await bridge.actions.resyncMessage(target.msgId);
        content = bridge.store.getState().messages.get(target.msgId)?.content ?? null;
      } catch (error) {
        log('resync failed', error);
      }
      if (content === null) content = (await api('GET', messagePath(h, target.msgId)))?.content;
      if (normalize(content) !== normalize(next)) throw new UserError('크랙 서버에 반영되지 않았어요. 새로고침해서 확인해 주세요.');
      markOwn(target.msgId, 30000, content);
      return { content, reload: false };
    }

    log('direct PATCH', target.msgId);
    const data = await api('PATCH', messagePath(h, target.msgId), { message: next });
    const check = await api('GET', messagePath(h, target.msgId)).catch(() => data);
    const content = typeof check?.content === 'string' ? check.content : next;
    if (normalize(content) !== normalize(next)) throw new UserError('크랙 서버에 반영되지 않았어요. 새로고침해서 확인해 주세요.');
    markOwn(target.msgId, 30000, content);
    const live = bridge.store?.getState();
    if (live?.messages.has(target.msgId) && typeof live.updateMessage === 'function') {
      diagState.lastPath = 'A2';
      live.updateMessage(target.msgId, { content });
      return { content, reload: false };
    }
    diagState.lastPath = 'C';
    reloadNeeded.add(target.msgId);
    return { content, reload: true };
  }

  // 화면에서 고칠 메시지와 그 원문을 찾습니다. node는 그 메시지 그룹 안의 아무 요소나 됩니다.
  async function resolveTarget(node) {
    const h = here();
    if (!h.chatId) throw new UserError('채팅방에서만 쓸 수 있어요.');
    const group = groupOf(node);
    const bridge = findBridge(group ? mdsOf(group)[0] : null);
    const info = messageOf(group, bridge);
    if (!info) throw new UserError('이 글은 메시지가 아니라서 고칠 수 없어요.');
    let { msgId, content } = info;
    if (!info.fromStore) {
      // 크랙 내부를 못 찾았을 때: 그룹의 첫 메시지를 API로 읽고, 화면 글과 맞는지 확인합니다.
      msgId = msgId || info.groupId;
      if (!ID_RE.test(msgId)) throw new UserError('메시지 id를 찾지 못했어요.');
      const data = await api('GET', messagePath(h, msgId));
      content = typeof data?.content === 'string' ? data.content : null;
      if (content === null || coverage(content, info.mds) < 0.9) throw new UserError('화면 글과 서버 원문이 달라요. 새로고침한 뒤 다시 해 주세요. (답변 비교 중이면 크랙 수정창을 써 주세요)');
    }
    if (typeof content !== 'string') throw new UserError('메시지 원문을 읽지 못했어요.');
    return { chatId: h.chatId, msgId, content, group: info.group, mds: info.mds, via: info.fromStore ? 'store' : 'api' };
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
    record.spans = shiftSpans(record.spans, plan.a, plan.b, plan.ins.length + plan.kept.length, plan.ins.length);
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

  async function undoLast(chatId, msgId, node) {
    const record = book(chatId)[msgId];
    const edit = record?.edits[record.edits.length - 1];
    if (!edit || typeof edit.prev !== 'string') throw new UserError('되돌릴 수정이 없어요.');
    const target = await resolveTarget(node);
    if (target.msgId !== msgId) throw new UserError('보이는 답변이 바뀌었어요.');
    if (normalize(target.content) !== normalize(record.current)) throw new UserError('그사이 다른 곳에서 바뀌어서 되돌리지 않았어요.');
    const result = await writeContent(target, edit.prev);
    const live = book(chatId)[msgId] || record;
    live.edits.pop();
    live.spans = edit.prevSpans || [];
    finishRecord(chatId, msgId, live, result.content);
    return result;
  }

  async function restoreBase(chatId, msgId, node) {
    const record = book(chatId)[msgId];
    if (!record) throw new UserError('흔적이 없어요.');
    const target = await resolveTarget(node);
    if (target.msgId !== msgId) throw new UserError('보이는 답변이 바뀌었어요.');
    if (normalize(target.content) !== normalize(record.current)) throw new UserError('그사이 다른 곳에서 바뀌어서 되돌리지 않았어요.');
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
          const entry = { chatId: here().chatId, before: old.content, after: message.content, at: Date.now() };
          pendingNative.set(id, entry);
          setTimeout(() => { if (pendingNative.get(id) === entry) pendingNative.delete(id); }, 15000);
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

  function onPatchDone(url, status, bodyText) {
    if (status < 200 || status >= 300) return;
    const m = MSG_URL.exec(url);
    if (!m) return;
    const [, chatId, msgId] = m;
    const entry = pendingNative.get(msgId);
    if (!entry) return;
    pendingNative.delete(msgId);
    let content = entry.after;
    try {
      const json = JSON.parse(bodyText);
      if (typeof json?.data?.content === 'string') content = json.data.content;
    } catch (error) { /* 무시 */ }
    if (isOwn(msgId, content)) return;
    const record = recordFor(book(chatId)[msgId], entry.before);
    const change = wholeChange(entry.before, content);
    const prevSpans = (record.spans || []).map(span => span.slice());
    record.spans = shiftSpans(record.spans, change.a, change.b, change.newLen, change.newLen);
    record.edits.push({ at: Date.now(), kind: 'native', before: change.oldText, after: change.newText, prev: entry.before, prevSpans });
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
              this.addEventListener('loadend', () => {
                let text = '';
                try { text = this.responseType === '' || this.responseType === 'text' ? this.responseText : JSON.stringify(this.response); } catch (error) { text = ''; }
                onPatchDone(req.url, this.status, text);
              });
            }
          } catch (error) { /* 무시 */ }
          return send.apply(this, arguments);
        };
        proto.__cpnHooked = true;
      }
      diagState.xhrHooked = true;
    } catch (error) {
      log('xhr hook failed', error);
    }
    try {
      const original = pageWindow.fetch;
      if (typeof original === 'function' && !original.__cpnHooked) {
        const wrapped = function (input, init) {
          const promise = original.apply(this ?? pageWindow, arguments);
          try {
            const url = typeof input === 'string' ? input : String(input?.url || '');
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            if (method === 'PATCH' && MSG_URL.test(url)) {
              promise.then(response => response.clone().text().then(text => onPatchDone(url, response.status, text))).catch(() => {});
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
          if (info.content === record.current) status = 'ok';
          else if (!busy && normalize(info.content) === normalize(record.base)) {
            putRecord(h.chatId, id, null);
            changed = true;
            continue;
          } else status = 'stale';
        } else {
          status = coverage(record.current, info.mds) > 0.97 ? 'ok' : 'stale';
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
      badge.innerHTML = `${ICONS.pen}<span>${label}</span>`;
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
::highlight(cpn-edit){background-color:rgba(255,105,180,.26)}
::highlight(cpn-cut){text-decoration:underline wavy rgba(229,72,77,.9);text-decoration-thickness:1.5px;text-underline-offset:3px}
.cpn-badge{display:inline-flex;align-items:center;gap:4px;align-self:flex-start;width:max-content;height:22px;margin:4px 0 0;padding:0 8px 0 6px;border:0;border-radius:999px;background:rgba(255,105,180,.14);color:#c2185b;font-size:11.5px;font-weight:700;line-height:1;cursor:pointer;transition:background-color .15s,scale .15s}
.cpn-badge:hover{background:rgba(255,105,180,.24)}
.cpn-badge:active{scale:.97}
.cpn-badge svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.cpn-badge.is-stale{background:rgba(127,127,127,.14);color:inherit;opacity:.7}
body[data-theme="dark"] .cpn-badge{color:#ff8cc6}
body[data-theme="dark"] .cpn-badge.is-stale{color:inherit}`;

  const STAGE_CSS = `
*{box-sizing:border-box}
button,textarea{font:inherit;color:inherit;letter-spacing:inherit}
button{cursor:pointer}
.stage{--canvas:#18181a;--surface:#212123;--surface-2:#2a2a2d;--text:#ededee;--text-2:#9b9ba1;--text-3:#66666c;--rule:rgba(255,255,255,.08);--rail:#46464c;--accent:#8cc59e;--accent-on:#122018;--pink:#ff8cc6;--pink-soft:rgba(255,105,180,.16);--danger:#ee8a8a;--ring:0 0 0 1px rgba(255,255,255,.08);--lift:0 0 0 1px rgba(255,255,255,.1),0 24px 56px -16px rgba(0,0,0,.75);--out:cubic-bezier(.2,0,0,1);position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-size:13px;line-height:1.45;letter-spacing:-.01em}
.stage[data-theme=light]{--canvas:#fff;--surface:#f5f5f4;--surface-2:#ededec;--text:#1c1c1b;--text-2:#6b6b68;--text-3:#a3a3a0;--rule:rgba(0,0,0,.08);--rail:#d0d0cd;--accent:#4f8a63;--accent-on:#fff;--pink:#c2185b;--pink-soft:rgba(255,105,180,.12);--danger:#c4545a;--ring:0 0 0 1px rgba(0,0,0,.06),0 1px 2px -1px rgba(0,0,0,.06);--lift:0 0 0 1px rgba(0,0,0,.06),0 24px 56px -18px rgba(0,0,0,.32)}
svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tb{position:absolute;display:flex;gap:2px;padding:4px;border-radius:12px;background:#1b1b1d;color:#f2f2f2;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 10px 28px -8px rgba(0,0,0,.6);pointer-events:auto;animation:pop .16s var(--out) both}
.stage[data-theme=light] .tb{background:#fff;color:#1c1c1b;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 10px 28px -10px rgba(0,0,0,.3)}
@keyframes pop{from{opacity:0;translate:0 4px;scale:.97}}
.tb button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 10px;border:0;border-radius:8px;background:none;font-size:12.5px;font-weight:600;white-space:nowrap;transition:background .12s}
.tb button:hover{background:rgba(127,127,127,.18)}
.tb .main{color:var(--pink)}
.pop{position:absolute;width:380px;max-width:calc(100vw - 20px);display:flex;flex-direction:column;max-height:calc(100vh - 24px);background:var(--canvas);color:var(--text);border-radius:16px;box-shadow:var(--lift);pointer-events:auto;outline:none;animation:pop .2s var(--out) both}
.pop.wide{width:620px}
.hd{display:flex;align-items:center;gap:8px;padding:12px 10px 8px 14px}
.hd b{flex:1;font-size:14px;font-weight:700;letter-spacing:-.02em}
.hd small{color:var(--text-3);font-size:11.5px;font-weight:500;margin-left:6px}
.x{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:none;color:var(--text-2)}
.x:hover{background:var(--surface);color:var(--text)}
.bd{padding:0 14px 12px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--rail) transparent}
.was{margin-bottom:8px;padding:8px 10px;border-radius:10px;background:var(--surface);color:var(--text-2);font-size:12.5px;max-height:84px;overflow:auto;white-space:pre-wrap;word-break:break-all}
.was i{font-style:normal;color:var(--text-3);font-size:11px;font-weight:700;margin-right:6px}
textarea{width:100%;min-height:72px;max-height:46vh;padding:10px 12px;border:0;border-radius:12px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--rule);color:var(--text);font-size:14px;line-height:1.6;resize:vertical;outline:none;white-space:pre-wrap;word-break:break-all}
textarea:focus{box-shadow:inset 0 0 0 1.5px var(--pink)}
.wide textarea{min-height:44vh;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.note{margin-top:6px;color:var(--text-3);font-size:11.5px}
.note.warn{color:var(--danger)}
.ft{display:flex;align-items:center;gap:6px;padding:10px 14px 12px;border-top:1px solid var(--rule)}
.ft .grow{flex:1}
.btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:10px;background:var(--surface);color:var(--text);box-shadow:var(--ring);font-size:12.5px;font-weight:600;transition:scale .12s,opacity .12s}
.btn:active{scale:.97}
.btn.pri{background:var(--pink);color:#fff;box-shadow:none}
.stage[data-theme=dark] .btn.pri{color:#2a0f1d}
.btn.danger{color:var(--danger)}
.btn[disabled]{opacity:.45;pointer-events:none}
.btn.busy{opacity:.6;pointer-events:none}
.list{display:flex;flex-direction:column;gap:8px}
.it{padding:9px 10px;border-radius:12px;background:var(--surface)}
.it .meta{display:flex;gap:6px;color:var(--text-3);font-size:11px;font-weight:700;margin-bottom:4px}
.it .meta b{color:var(--text-2)}
.it.old{opacity:.55}
.del,.ins{display:block;white-space:pre-wrap;word-break:break-all;font-size:12.5px}
.del{color:var(--text-3);text-decoration:line-through;text-decoration-color:var(--danger)}
.ins{color:var(--text)}
.ins mark{background:var(--pink-soft);color:inherit;border-radius:3px;padding:0 1px}
.empty{color:var(--text-3);font-size:12px}
.stale{margin-bottom:8px;padding:8px 10px;border-radius:10px;background:var(--surface);color:var(--text-2);font-size:12px}
.sw{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 4px;border:0;background:none;color:var(--text-2);font-size:12px;font-weight:600}
.sw i{position:relative;width:30px;height:18px;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--rule)}
.sw i::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--text-2);transition:translate .2s var(--out)}
.sw[aria-pressed=true] i{background:var(--pink)}
.sw[aria-pressed=true] i::after{translate:12px 0;background:#fff}
.toast{position:absolute;left:50%;bottom:28px;translate:-50% 0;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:9px 10px 9px 14px;border-radius:12px;background:#1b1b1d;color:#f2f2f2;box-shadow:0 10px 28px -8px rgba(0,0,0,.6);font-size:13px;font-weight:600;pointer-events:auto;animation:pop .2s var(--out) both}
.toast.err{background:#3a1a1c;color:#ffd7d9}
.toast button{height:28px;padding:0 10px;border:0;border-radius:8px;background:rgba(255,255,255,.12);font-size:12px;font-weight:700}
@media (max-width:560px){.pop{left:10px!important;right:10px!important;top:auto!important;bottom:10px!important;width:auto!important}}`;

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
    // 편집 창 안의 키(Enter 등)가 크랙 단축키로 새지 않게 여기서 멈춥니다.
    ['keydown', 'keyup', 'keypress'].forEach(type => ui.shadow.addEventListener(type, event => {
      if (type === 'keydown') onPanelKey(event);
      event.stopPropagation();
    }));
    // 막대를 누를 때 선택이 풀리지 않게 합니다.
    ui.shadow.addEventListener('mousedown', event => {
      if (event.target.closest('.tb')) event.preventDefault();
    });
    ui.shadow.addEventListener('click', onPanelClick);
    return ui.stage;
  }

  function hideToolbar() {
    ui.toolbar?.remove();
    ui.toolbar = null;
  }

  function closePop() {
    ui.pop?.remove();
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
  }

  function toast(message, options = {}) {
    const stage = ensureStage();
    stage.querySelectorAll('.toast').forEach(node => node.remove());
    const node = document.createElement('div');
    node.className = `toast${options.error ? ' err' : ''}`;
    node.innerHTML = `${options.error ? ICONS.alert : ICONS.check}<span>${esc(message)}</span>`;
    if (options.action) {
      const button = document.createElement('button');
      button.textContent = options.action.label;
      button.addEventListener('click', () => {
        node.remove();
        options.action.run();
      });
      node.append(button);
    }
    stage.append(node);
    setTimeout(() => node.remove(), options.ms || (options.action ? 6000 : 2600));
  }

  function failed(error) {
    diagState.lastError = String(error?.message || error);
    if (!(error instanceof UserError)) console.warn(LOG, error);
    toast(error instanceof UserError ? error.message : '고치지 못했어요. 새로고침 뒤 다시 해 주세요.', { error: true, ms: 4200 });
  }

  function doneToast(result, label, undo) {
    if (result.reload) {
      toast(`${label} · 새로고침하면 화면에 보여요`, { action: { label: '새로고침', run: () => location.reload() } });
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

  function sourceFallback(target, region, why) {
    toast(why, { ms: 3400 });
    openSource(target, region);
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
        sourceFallback(target, [mapped.a, mapped.b], '목록·링크 같은 서식이 섞여 있어서 원문 창으로 열었어요.');
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
    pop.querySelector('.bd').innerHTML = `<div class="was"><i>원래</i>${esc(mapped.oldText)}</div><textarea spellcheck="false" aria-label="바꿀 글"></textarea><div class="note" data-base="Enter 고치기 · Shift+Enter 줄바꿈 · Esc 닫기">Enter 고치기 · Shift+Enter 줄바꿈 · Esc 닫기</div>`;
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
    pop.querySelector('.bd').innerHTML = '<textarea spellcheck="false" aria-label="메시지 원문"></textarea><div class="note" data-base="Ctrl+Enter 고치기 · Esc 닫기">Ctrl+Enter 고치기 · Esc 닫기</div>';
    pop.querySelector('.ft').innerHTML = '<span class="grow"></span><button class="btn" data-act="close">취소</button><button class="btn pri" data-act="save-source">고치기</button>';
    const area = pop.querySelector('textarea');
    area.value = target.content;
    area.addEventListener('input', () => lengthNote(target, area.value.length));
    pop.edit = { target, source: true };
    pop.style.left = `${Math.max(10, (innerWidth - pop.offsetWidth) / 2)}px`;
    pop.style.top = `${Math.max(12, (innerHeight - pop.offsetHeight) / 2)}px`;
    area.focus({ preventScroll: true });
    if (approx) {
      area.setSelectionRange(approx[0], approx[1]);
      const line = target.content.slice(0, approx[0]).split('\n').length;
      area.scrollTop = Math.max(0, (line - 3) * 21);
    }
  }

  async function saveEditor() {
    const pop = ui.pop;
    if (!pop?.edit || ui.busy) return;
    const button = pop.querySelector('[data-act^="save"]');
    const area = pop.querySelector('textarea');
    const { target, mapped, source } = pop.edit;
    ui.busy = true;
    button.classList.add('busy');
    try {
      let result;
      if (source) {
        const next = area.value;
        if (next === target.content) {
          closePop();
          return;
        }
        const change = wholeChange(target.content, next);
        const plan = { a: change.a, b: change.b, ins: change.newText, kept: '', next };
        result = await commitEdit(target, plan, { kind: 'source', before: change.oldText, after: change.newText });
      } else {
        const replacement = area.value;
        if (replacement === mapped.oldText) {
          closePop();
          return;
        }
        const plan = planSplice(target.content, mapped, replacement);
        if (!plan) {
          closePop();
          sourceFallback(target, [mapped.a, mapped.b], '목록·링크 같은 서식이 섞여 있어서 원문 창으로 열었어요.');
          return;
        }
        result = await commitEdit(target, plan, { kind: 'pin', before: mapped.oldText, after: replacement });
      }
      closePop();
      doneToast(result, '고쳤어요', undoAction(target));
    } catch (error) {
      ui.busy = false;
      button.classList.remove('busy');
      failed(error);
    }
  }

  const KIND_LABEL = { pin: '핀셋', source: '원문 고치기', native: '크랙 수정창' };

  function ago(at) {
    const sec = Math.max(0, (Date.now() - at) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
    return `${Math.floor(sec / 86400)}일 전`;
  }

  const clip = (text, max = 160) => (text.length > max ? `${text.slice(0, max)}…` : text);

  function openTrace(group, msgId, rect) {
    const chatId = here().chatId;
    const record = book(chatId)[msgId];
    if (!record || !group) return;
    hideToolbar();
    const pop = popShell('수정 흔적', `${record.edits.length}번 고침`);
    const bridge = findBridge(mdsOf(group)[0]);
    const info = messageOf(group, bridge, new Set([msgId]));
    const stale = !info || (info.fromStore ? info.content !== record.current : reloadNeeded.has(msgId) || coverage(record.current, info.mds) <= 0.97);
    const items = record.edits.slice().reverse().map(edit => `<div class="it${edit.old ? ' old' : ''}"><div class="meta"><b>${KIND_LABEL[edit.kind] || '수정'}</b><span>${ago(edit.at)}</span></div>${edit.before ? `<span class="del">${esc(clip(edit.before))}</span>` : ''}<span class="ins">${edit.after ? `<mark>${esc(clip(edit.after))}</mark>` : '<i>(지움)</i>'}</span></div>`).join('');
    const notes = [
      stale ? '<div class="stale">이 메시지가 다른 곳에서 바뀌어서 흔적을 칠하지 못했어요. 되돌리기도 막아 두었어요.</div>' : '',
      record.rebased ? '<div class="stale">중간에 다른 곳에서 글이 바뀌어서, 그 뒤의 수정만 되돌릴 수 있어요. 흐린 기록은 보기만 돼요.</div>' : '',
    ].join('');
    pop.querySelector('.bd').innerHTML = `${notes}<div class="list">${items || '<div class="empty">기록이 없어요.</div>'}</div>`;
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
    if (!pop?.edit || event.target.tagName !== 'TEXTAREA') return;
    if (pop.edit.source ? (event.ctrlKey || event.metaKey) : !event.shiftKey && !coarse()) {
      event.preventDefault();
      swallowKeyUp('Enter');
      saveEditor();
    }
  }

  // 키를 누르는 순간 창이 닫히면, 손을 뗄 때의 keyup이 본문으로 가서 크랙 단축키(Enter → 입력창 이동)가 움직입니다. 그 keyup 하나를 삼킵니다.
  function swallowKeyUp(key) {
    const handler = event => {
      if (event.key !== key) return;
      event.stopPropagation();
      window.removeEventListener('keyup', handler, true);
    };
    window.addEventListener('keyup', handler, true);
    setTimeout(() => window.removeEventListener('keyup', handler, true), 1500);
  }

  async function runTrace(action) {
    const { chatId, msgId, group } = ui.pop.trace;
    const live = group.isConnected ? group : findGroup(msgId);
    const button = ui.pop.querySelector(`[data-act="${action}"]`);
    button?.classList.add('busy');
    try {
      if (action === 'undo') doneToast(await undoLast(chatId, msgId, live), '방금 수정을 되돌렸어요');
      if (action === 'restore') doneToast(await restoreBase(chatId, msgId, live), '처음 글로 되돌렸어요');
      closePop();
    } catch (error) {
      button?.classList.remove('busy');
      failed(error);
    }
  }

  function onPanelClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const act = button.dataset.act;
    if (act === 'close') return closePop();
    if (act === 'edit' || act === 'erase' || act === 'source') return startEdit(act);
    if (act === 'save' || act === 'save-source') return saveEditor();
    if (act === 'undo' || act === 'restore') return runTrace(act);
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

  function currentSelection() {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const md = mdOf(range.startContainer);
    const group = groupOf(md);
    if (!md || !group || !mdOf(range.endContainer) || groupOf(range.endContainer) !== group) return null;
    if (md.closest('[contenteditable="true"]')) return null;
    if (!here().chatId || !/[\p{L}\p{N}]/u.test(range.toString())) return null;
    return { md, group, range: range.cloneRange() };
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
      if (!sel || streamingNow()) {
        hideToolbar();
        return;
      }
      if (ui.toolbar && ui.sel && ui.sel.md === sel.md && ui.sel.range.toString() === sel.range.toString()) return;
      showToolbar(sel);
    }, delay);
  }

  document.addEventListener('pointerup', event => {
    pointerHeld = false;
    if (event.composedPath().includes(ui.host)) return;
    checkSelection(30);
  }, true);
  document.addEventListener('pointercancel', () => { pointerHeld = false; }, true);
  document.addEventListener('keyup', event => {
    if (event.shiftKey || event.key === 'Shift') checkSelection(60);
  }, true);
  // 마우스로 끄는 중에는 기다렸다가 뗄 때 확인합니다. 휴대폰은 선택 손잡이를 움직여도 포인터 이벤트가 없어서 이것으로 확인합니다.
  document.addEventListener('selectionchange', () => {
    if (pointerHeld && !coarse()) return;
    checkSelection(coarse() ? 450 : 250);
  });
  document.addEventListener('pointerdown', event => {
    const path = event.composedPath();
    if (path.includes(ui.host)) return;
    pointerHeld = event.pointerType === 'mouse';
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
        network: { xhr: diagState.xhrHooked, fetch: diagState.fetchHooked },
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
