// ==UserScript==
// @name         🛠️ 크랙 PC 베이스 (Crack PC Base)
// @namespace    crack-pc-base
// @version      1.0.0
// @description  크랙 PC 채팅을 더 가볍고 편하게 — 화면 정리, 대시보드, 로그 검색, 채팅 목록 정리, 다른 확장 바로가기까지 한곳에서
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/PCBase.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/PCBase.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * window.CrackPcBase — 기반 API (v1.0.0)
 *
 * 수명은 두 가지다.
 *   페이지 수명(스토리 채팅 경로, 폭 무관)   공용 <style>(css.add), '확장 기능' 슬롯(menu.register), regions, 'route'/'regions' 이벤트
 *   레이아웃 수명(페이지 + 폭 1024px 이상)    자동 숨김, 감지 띠, 우측 메뉴 정돈, html[data-cpb]  ← active
 *
 * 영역은 셋이다: 'top' = 사이트 헤더(맨 위 막대)만, 'left' = 사이드바, 'right' = 방 메뉴.
 * 룸 상단바(모델 선택이 있는 막대)는 영역이 아니다. 표식도 이동도 없이 크랙 그대로 둔다(크랙이 클릭으로 스스로 접고 편다).
 *
 *   version                         '1.0.0'
 *   page                            스토리 채팅 페이지인지(폭 무관)
 *   active                          레이아웃이 켜져 있는지(스토리 채팅 페이지 + 폭 1024px 이상)
 *   on(event, fn) → 해제 함수       off(event, fn)
 *     'route'         {active, chat, path}   경로가 바뀔 때마다(채팅 진입/이탈, 채팅방 간 이동, 그 밖의 이동)
 *     'active'        {active}               레이아웃이 켜지거나 꺼짐(채팅 페이지에서 폭이 1024px를 넘나들 때 포함)
 *     'region:open'   {name}                 layout.isOpen(name)이 true로 바뀜. name = 'top' | 'left' | 'right'
 *     'region:close'  {name}                 false로 바뀜(자동 숨김 끄기, 레이아웃 꺼짐, 페이지 이탈 포함)
 *     'regions'       {header, roomBar, left, right, list}   영역 요소를 찾았거나 교체됨
 *     'settings'      {key, value}           설정 변경 (다른 탭에서 바뀌면 key = '*')
 *   regions.get(name)               'header' | 'roomBar' | 'left' | 'right' | 'list' → 요소 또는 null
 *                                   'top' → [header] 배열(없으면 빈 배열)
 *   layout.open(name)               보이기. 포인터가 영역에 들어왔다 나가거나 close/toggle 할 때까지 유지
 *   layout.close(name)              바로 숨김
 *   layout.toggle(name)
 *   layout.isOpen(name)             자동 숨김 중인 영역: 오버레이가 열렸는지.
 *                                   자동 숨김이 꺼졌거나 폭이 좁으면 크랙 기본 배치 기준: right = 크랙 패널이 열림,
 *                                   left = 사이드바가 펼쳐짐(52px 레일·숨김이면 false), top = 영역이 있으면 true
 *   settings.get(key?) / settings.set(key, value)
 *                                   키: 'autoHide.top'(상단 헤더) | 'autoHide.bar'(모델 선택 바) | 'autoHide.left' | 'autoHide.right' (기본 true)
 *                                       'perf.scrollLock'(답변 완성 때 자동 스크롤 막기) | 'perf.renderSkip'(화면 밖 메시지 그리기 생략)
 *                                       | 'perf.fold'(오래된 대화 숨기기) (기본 true) | 'perf.keep'(남길 턴 수, 3~50, 기본 10)
 *                                       'notify.summary'(요약 메모리 업데이트 알림) | 'notify.settings'(설정 변경 알림) | 'notify.crack'(크랙 새 알림)
 *                                       | 'notify.attend'(출석 안 했으면 출석 버튼) | 'notify.done'(답변 완성 알림) (기본 true)
 *                                       | 'notify.doneSound'(답변 완성 소리, 기본 false)
 *   toast(text, {icon, key, duration, onClick, action})  화면 위 가운데에 잠깐 뜨는 알림(icon은 SVG 종류 이름). 같은 key면 새로 쌓지 않고 글자·시간만 갱신(기본 2.6초).
 *                                   onClick이 있으면 누를 수 있고, 누르면 실행 후 닫힌다
 *                                   모듈은 'myModule.foo' 처럼 자기 접두어로 같은 저장소를 써도 된다
 *   menu.register({id, label, icon, order, onClick, toggle: {get, set}, stepper, badge, children})
 *                                   → {update(patch), remove()}
 *     icon: 이모지/텍스트, '<svg…>' 문자열, 또는 Node     order: 작을수록 위(기본 100)
 *     toggle이 있으면 오른쪽에 스위치, 행 클릭 = set(!get())     children: [{id,label,icon,toggle,stepper,onClick}] → 펼침 하위 행
 *     stepper: {get, set, min, max, step(숫자 또는 (값, ±1) → 다음 값), format(값) → 글자} → 오른쪽에 − 값 + 버튼
 *     onClick(event, handle)는 토글/펼침 처리 뒤에 불린다       update()를 인자 없이 부르면 toggle.get()을 다시 읽어 그린다
 *   css.add(id, text) → {remove()}  css.remove(id)     공용 <style> 하나에 모아 넣는다(스토리 채팅 페이지에서만 문서에 붙음).
 *                                   레이아웃이 켜졌을 때만 쓸 규칙은 'html[data-cpb] '로 시작하게 쓴다.
 *                                   핸들의 remove()는 그 핸들이 넣은 블록일 때만 지운다(같은 id로 다시 넣으면 예전 핸들은 무효)
 *
 * 열린 영역은 아래 중 하나라도 이어지는 동안 열려 있고, 모두 끝나면 약 300ms 뒤에 닫힌다.
 *   포인터가 영역이나 그 감지 띠 위 / 영역 안의 키보드 포커스·글 입력 / 영역에서 연 Radix 팝퍼·메뉴·다이얼로그·리스트박스
 * 크랙의 우측 메뉴 토글 버튼(룸 상단바 맨 오른쪽)과 Ctrl+0: 오버레이가 닫혀 있으면 열고(그 뒤는 hover로 연 것과 같다.
 * 포인터가 패널 쪽에 없었다면 패널에 들어왔다 나갈 때까지 유지), 열려 있으면 닫는다. 크랙의 클릭은 그대로 크랙에 간다.
 * 우측 자동 숨김 중에는 그 뒤 토글 버튼을 한 번 더(합성 클릭) 눌러 크랙 내부의 패널 열림 상태를 닫힘으로 되돌린다.
 * 그래야 크랙이 채팅 클릭으로 룸 상단바를 접고 펴는 기본 동작이 이어진다(우측 자동 숨김을 켤 때도 한 번 맞춘다).
 *
 * 저장소(localStorage): 설정 'crack-pc-base:v1'
 * 준비 신호: window 'crack-pc-base:ready' 이벤트(detail = API). 첫 'route'/'regions'보다 먼저 온다
 */

(function () {
  'use strict';
  if (window.CrackPcBase && window.CrackPcBase.version) return;

  const VERSION = '1.0.0';
  const SETTINGS_KEY = 'crack-pc-base:v1';
  const OLD_PINS_KEY = 'crack-pc-base:pins:v1'; // 0.1.0이 쓰던 옛 저장 키. 시작할 때 한 번 지운다
  const CHAT_PATH = /^\/stories\/[^/]+\/episodes\/[^/]+\/?$/;
  // 상단은 2단: bar(룸 상단바 = 모델 선택 바)가 먼저 내려오고, 그 위 끝에 더 머물면 top(사이트 헤더)이 내려온다
  const NAMES = ['top', 'bar', 'left', 'right'];
  const ROLES = ['header', 'roomBar', 'left', 'right'];
  const ROLE_REGION = { header: 'top', roomBar: 'bar', left: 'left', right: 'right' };
  // 가장자리 감지 띠: size = 두께(px), intent = 머무르면 여는 지연(ms). 나중에 설정으로 바꿀 수 있게 한곳에 둔다.
  // bar: 위 끝 띠 → 모델 선택 바. top: 모델 선택 바가 열린 동안에만 생기는 위 끝 띠 → 사이트 헤더(조금 더 머물러야 열림)
  // right.top: 오른쪽 띠는 룸 상단바(크랙 우측 메뉴 토글 버튼이 있는 줄) 아래에서 시작한다. 시작 높이는 룸 상단바 높이를 잰 값
  // (보통 48px, 스탯 바가 있는 작품은 88px)이고, 이 값은 아직 못 쟀을 때의 기본값이자 최솟값이다
  // bar 띠는 바 높이 근처까지 넉넉하게 두어 "위로 올리면 1단", 바가 내려온 뒤 맨 위 끝(top 띠)까지 "더 올리면 2단"이 되게 한다.
  // 화면 끝까지 한 번에 던지면(바가 열릴 때 포인터가 이미 맨 위) 1단만 연다 — 아래로 조금 내렸다 다시 올리면 2단
  const EDGE = {
    bar: { size: 40, intent: 60 },
    top: { size: 10, intent: 120 },
    left: { size: 40, intent: 80 },
    right: { size: 40, intent: 100, top: 48 },
  };
  const T = { grace: 300, recheck: 100, scanDelay: 40, missGap: 200, missMax: 40 };
  const GEO = { leftW: 256, rightW: 260 };
  const MARKS = ['data-cpb-region', 'data-cpb-ah', 'data-cpb-open', 'data-cpb-under'];
  // 크랙 자체 창(플레이 가이드·문체 변경 등)은 role=dialog 없이 z-modal 오버레이(data-state=open)로 뜬다
  const PORTAL_SEL = '[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],.z-modal[data-state="open"]';
  const TRIGGER_OPEN_SEL = '[aria-haspopup][aria-expanded="true"],[aria-haspopup][data-state="open"]';
  const NAV_KEY = /^(Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|F6)$/;
  // 변수는 html이 아니라 쓰는 요소에만 둔다(html에 두면 data-cpb를 넣고 뺄 때마다 문서 전체 스타일이 다시 계산됨)
  const VAR_SEL = 'html[data-cpb] :is([data-cpb-region],.cpb-zone)';

  const perf = () => performance.now();
  const warn = (e) => { try { console.warn('[CrackPcBase]', e); } catch (_) { /* noop */ } };
  const attempt = (fn) => { try { return fn(); } catch (e) { warn(e); return undefined; } };

  // 남의 DOM에는 값이 바뀔 때만 쓴다(다른 스크립트의 옵저버를 깨우지 않도록)
  function setAttr(el, n, v) { if (el.getAttribute(n) !== v) el.setAttribute(n, v); }
  function delAttr(el, n) { if (el.hasAttribute(n)) el.removeAttribute(n); }
  function flag(el, n, on) { if (on) setAttr(el, n, ''); else delAttr(el, n); }

  // ── 이벤트 ─────────────────────────────────────────────
  const handlers = new Map();
  function on(ev, fn) {
    if (typeof fn !== 'function') return () => {};
    let s = handlers.get(ev);
    if (!s) handlers.set(ev, (s = new Set()));
    s.add(fn);
    return () => off(ev, fn);
  }
  function off(ev, fn) { const s = handlers.get(ev); if (s) s.delete(fn); }
  function emit(ev, payload) {
    const s = handlers.get(ev);
    if (!s || !s.size) return;
    for (const fn of Array.from(s)) attempt(() => fn(payload));
  }

  // ── 저장소 · 설정 ─────────────────────────────────────
  function readJSON(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (_) { return null; } }
  function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* 저장 불가여도 동작은 계속 */ } }
  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(base, over) {
    const out = clone(base);
    if (isObj(over)) for (const k of Object.keys(over)) out[k] = isObj(out[k]) && isObj(over[k]) ? deepMerge(out[k], over[k]) : over[k];
    return out;
  }
  const DEFAULTS = { autoHide: { top: true, bar: true, left: true, right: true }, perf: { scrollLock: true, renderSkip: true, fold: true, keep: 10 }, notify: { summary: true, settings: true, crack: true, attend: true, done: true, doneSound: false },
    input: { counter: true, expand: true, draft: true, emptyGuard: true, hideHint: true },
    msg: { chars: true, time: true, cost: true, model: true, user: true },
    models: { stats: true, hide: true, hidden: [] },
    dash: { on: true, row2: true, btn: {}, info: {} }, // btn/info: 키마다 false면 그 버튼·숫자만 숨김
    tools: { rightClick: true, copy: true, pasteFix: true, cleaner: true, cleanerEdit: true, multiDelete: true, variantDelete: true },
    reroll: { hold: true, skipInstr: false, guard: false, compareNav: true },
    radio: { on: true, latency: true, hidden: [] },
    vault: { on: true, collectedFirst: true, fixCount: true },
    chatlist: { on: true, resize: true, archiveH: 284, current: true, color: true, rightClick: true, countArchive: true, countRoot: true, search: true, overview: true, view: 'grid', multi: true, smart: true, smartSingle: false },
    logsearch: { on: true },
    branch: { on: true, live: true, flags: true, listBtn: true, roomBtn: true, arrive: true, hoverPath: true, autoScan: false } };
  let conf = deepMerge(DEFAULTS, readJSON(SETTINGS_KEY));
  const pathGet = (o, key) => String(key).split('.').reduce((a, k) => (a != null && typeof a === 'object' ? a[k] : undefined), o);
  function pathSet(o, key, v) {
    const ks = String(key).split('.');
    let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (!isObj(a[ks[i]])) a[ks[i]] = {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  }
  const settings = {
    get(key) { return clone(key == null ? conf : pathGet(conf, key)); },
    set(key, value) {
      if (key == null || key === '') return;
      if (JSON.stringify(pathGet(conf, key)) === JSON.stringify(value)) return;
      pathSet(conf, key, clone(value));
      writeJSON(SETTINGS_KEY, conf);
      settingsChanged(String(key));
    },
  };
  const autoHide = (name) => !(isObj(conf.autoHide) && conf.autoHide[name] === false);
  function settingsChanged(key) {
    if (active) { for (const n of NAMES) applyRegion(n); if (glowAny() !== !!(glowEls.top && glowEls.top.isConnected)) mountGlow(); }
    if (page) { perfApply(); settingsToast(key); inputRender(); msgSoon(50, true); modelHideCss(); statsSoon(50); }
    emit('settings', { key, value: settings.get(key === '*' ? null : key) });
  }

  // ── 공용 스타일 레지스트리 ─────────────────────────────
  const cssBlocks = new Map(); // id → {text, token}
  let styleEl = null;
  let cssQueued = false;
  let cssSeq = 0;
  function cssAdd(id, text) {
    id = String(id);
    text = String(text);
    const cur = cssBlocks.get(id);
    const token = ++cssSeq;
    cssBlocks.set(id, { text, token });
    if (!cur || cur.text !== text) queueCss();
    // 같은 id로 다시 넣었으면 예전 핸들의 remove()는 아무 일도 하지 않는다(menu 핸들과 같은 규칙)
    return { remove: () => { const b = cssBlocks.get(id); if (b && b.token === token) cssRemove(id); } };
  }
  function cssRemove(id) { if (cssBlocks.delete(String(id))) queueCss(); }
  function queueCss() { if (cssQueued) return; cssQueued = true; queueMicrotask(flushCss); }
  function flushCss() {
    cssQueued = false;
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'crack-pc-base-css'; }
    let text = '';
    for (const [id, b] of cssBlocks) text += '/* ' + id + ' */\n' + b.text + '\n';
    if (styleEl.textContent !== text) styleEl.textContent = text;
  }
  function mountCss() { flushCss(); if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl); }
  function unmountCss() { if (styleEl && styleEl.isConnected) styleEl.remove(); }
  // 사이트 전역 스타일: 스토리 채팅이 아닌 화면(홈·상세·설정 등)에도 늘 붙어 있다(사이드바 채팅 목록, 알림)
  const siteBlocks = new Map();
  let siteEl = null;
  function siteCss(id, text) { siteBlocks.set(String(id), String(text)); if (siteEl) siteFlush(); }
  function siteFlush() {
    let t = '';
    for (const [id, x] of siteBlocks) t += '/* ' + id + ' */\n' + x + '\n';
    if (siteEl.textContent !== t) siteEl.textContent = t;
  }
  function siteMount() {
    if (!siteEl) { siteEl = document.createElement('style'); siteEl.id = 'crack-pc-base-site'; }
    siteFlush();
    if (!siteEl.isConnected) (document.head || document.documentElement).appendChild(siteEl);
  }

  // ── 상태 ──────────────────────────────────────────────
  let page = false;   // 스토리 채팅 경로(폭 무관): 공용 스타일, 영역 찾기, 슬롯
  let active = false; // page + 폭 ≥1024: 자동 숨김, 메뉴 정돈, html[data-cpb]
  const els = { header: null, roomBar: null, left: null, right: null, list: null };
  const R = {};
  // hold: API·토글로 연 뒤 포인터가 영역에 들어왔다 나갈 때까지 유지. held: 직전 확인 때 무언가가 붙잡고 있었음
  for (const n of NAMES) R[n] = { open: false, shown: false, hover: new Set(), intentT: 0, closeT: 0, hold: false, held: false, zone: null };
  const bound = new Map(); // 남의 요소 → {role, h}
  let px = -1, py = -1, lastPress = null, navBy = 'pointer', simTrusted = false, quiet = 0;
  let dims = { hh: 56, rb: EDGE.right.top };
  const stats = { moCalls: 0, moTimeMs: 0, moMaxMs: 0, scans: 0, scanTimeMs: 0 };
  // 다른 스크립트가 보낸 합성 이벤트(isTrusted=false)는 사용자 조작으로 치지 않는다
  const userEvent = (e) => !!e && (e.isTrusted || simTrusted);

  const regionEl = (name) => (name === 'top' ? els.header : name === 'bar' ? els.roomBar : name === 'left' || name === 'right' ? els[name] : null);
  // 크랙 자체 '채팅 클릭으로 모델 선택 바 접기/펴기' 상태(펴져 있으면 true). 펴져 있으면 호버와 상관없이 보인다
  let crackBarShown = false;
  // 모델 선택 바가 지금 보이는지(호버로 열렸거나 크랙 클릭으로 펴짐)
  const barShown = () => managed('bar') && (R.bar.open || crackBarShown);
  // 헤더가 열려 모델 선택 바를 아래로 밀고 있는지
  const barUnder = () => managed('top') && R.top.open && barShown();
  // 2단(헤더)은 바가 보인 뒤 포인터가 맨 위 띠 아래에 있다가 다시 올라올 때만 연다(화면 끝까지 한 번에 던지면 1단만)
  let topArmed = true;
  const managed = (name) => active && autoHide(name) && !!regionEl(name);

  // ── 영역 상태 반영 ────────────────────────────────────
  function applyRegion(name) {
    const r = R[name];
    const el = regionEl(name);
    // 자동 숨김을 켠 순간 포인터가 그 위에 있으면 열린 채로 시작
    if (managed(name) && !r.open && el && r.hover.has(el)) r.open = true;
    syncRegion(name);
  }

  function syncRegion(name) {
    const r = R[name];
    const on = managed(name);
    if (!on) {
      r.open = false; r.hold = false; r.held = false;
      clearTimeout(r.intentT); clearTimeout(r.closeT); r.intentT = r.closeT = 0;
    }
    const el = regionEl(name);
    const b = el && bound.get(el);
    if (b) {
      const had = el.hasAttribute('data-cpb-ah');
      // 우측은 자동 숨김을 꺼도 레이아웃이 켜져 있으면 메뉴 정돈용 표식(data-cpb-region)만 남긴다
      if (on || (b.role === 'right' && active)) setAttr(el, 'data-cpb-region', b.role); else delAttr(el, 'data-cpb-region');
      flag(el, 'data-cpb-ah', on);
      flag(el, 'data-cpb-open', on && (name === 'bar' ? barShown() : r.open));
      if (name === 'bar') flag(el, 'data-cpb-under', on && barUnder());
      if (had && !on) queueRestore(el);
    }
    // 헤더 띠는 모델 선택 바가 열린 동안에만 둔다(2단: 위 끝 → 바, 바 위 끝에 더 머물기 → 헤더)
    const zoneOn = on && !(name === 'top' && managed('bar') && !barShown() && !r.open);
    if (zoneOn) {
      // 우측 자동 숨김이 막 켜졌으면(띠가 새로 붙음) 크랙 내부의 패널 열림 상태를 닫힘으로 맞춘다(settleCrackPanel)
      const fresh = name === 'right' && !(r.zone && r.zone.isConnected);
      ensureZone(name);
      flag(r.zone, 'data-open', name === 'bar' ? barShown() : r.open);
      // 상단 헤더가 크랙 기본 배치(흐름 안)면 룸 상단바도 헤더 높이만큼 아래에 있다 → 오른쪽 띠도 그만큼 내려서 시작
      if (name === 'right') flag(r.zone, 'data-below', !!els.header && !managed('top'));
      if (fresh) setTimeout(() => attempt(() => settleCrackPanel()), 0);
    } else removeZone(name);
    notify(name);
  }

  // layout.isOpen 값이 실제로 바뀔 때만 region:open/close 를 낸다(열고 닫는 모든 경로가 syncRegion을 거쳐 여기로 온다)
  function notify(name) {
    if (active) glowUpdate(); // 열리고 닫히는 순간 빛을 바로 맞춘다(포인터가 움직이지 않아도)
    if (quiet) return;
    const r = R[name];
    const v = !!isOpen(name);
    if (v === r.shown) return;
    r.shown = v;
    emit(v ? 'region:open' : 'region:close', { name });
  }

  // 표식을 뗀 직후 크랙의 transition-all이 우리 값 → 크랙 값으로 다시 애니메이션하지 않게(폭 전환 = 매 프레임 채팅 레이아웃)
  // 그 요소의 전환만 한 번 끝낸다. getAnimations()의 스타일 계산은 한 번뿐이다.
  const restoreQ = new Set();
  function queueRestore(el) {
    if (!restoreQ.size) queueMicrotask(flushRestore);
    restoreQ.add(el);
  }
  function flushRestore() {
    for (const el of restoreQ) {
      attempt(() => { if (el.isConnected && el.getAnimations) for (const a of el.getAnimations()) if (a.transitionProperty) a.finish(); });
    }
    restoreQ.clear();
  }

  function setOpen(name, v) {
    const r = R[name];
    if (!managed(name) || r.open === v) return;
    r.open = v;
    r.held = false;
    if (!v) { cancelClose(name); r.hold = false; }
    syncRegion(name);
    if (name === 'top') syncRegion('bar'); // 헤더가 열리고 닫히면 모델 선택 바를 아래로 밀거나 되돌린다
    if (name === 'bar') barChanged();
  }
  // 모델 선택 바가 보이기 시작하면: 포인터가 이미 맨 위 띠 근처면 2단을 잠가 둔다(조금 내렸다 다시 올리면 풀림)
  function barChanged() {
    if (barShown()) { if (py >= 0 && py <= EDGE.top.size + 6) { topArmed = false; stopIntent('top'); } }
    syncRegion('top'); // 헤더 띠를 붙이거나 뗀다
    glowQueue();
  }
  // 크랙 상태 읽기: 룸 상단바 안쪽 막대에 -translate-y-12가 없으면 펴짐
  function readCrackBar() {
    const h = roomBarHidden();
    const v = h === false;
    if (v === crackBarShown) return;
    crackBarShown = v;
    if (active) { syncRegion('bar'); barChanged(); }
  }

  // why: 'hover' | 'focus' | 'api' | 'toggle'(크랙 토글 버튼·단축키)
  function open(name, why) {
    if (!R[name] || !managed(name)) return false;
    const r = R[name];
    stopIntent(name);
    cancelClose(name);
    // API로 열었거나, 포인터가 영역 쪽에 없을 때 토글로 열었으면 포인터가 영역에 들어왔다 나갈 때까지 유지한다.
    // 토글 버튼을 눌러 연 경우(포인터가 이미 패널 쪽)는 hover로 연 것과 같다
    if (why === 'api' || (why === 'toggle' && !pointerInside(name))) r.hold = true;
    setOpen(name, true);
    if (!r.hover.size) scheduleClose(name, T.grace); // 붙잡는 것이 없으면 잠시 뒤 다시 판단
    return true;
  }

  function forceClose(name) {
    if (!R[name] || !managed(name)) return false;
    const r = R[name];
    r.hold = false;
    r.hover.clear();
    stopIntent(name);
    setOpen(name, false);
    return true;
  }

  // ── 가장자리 빛(우리 요소): 감지 띠보다 넓은 거리에서부터 포인터가 가까울수록 밝아진다. opacity만 바꾼다 ──
  const GLOW = { top: 90, left: 120, right: 120 }; // 빛이 보이기 시작하는 거리(px)
  const GLOW_EDGES = ['top', 'left', 'right'];
  const glowEls = {};
  let glowQueued = false;
  // 자동 숨김을 모두 껐으면 빛도 없다: 요소를 떼고 포인터마다 프레임을 잡지 않는다
  const glowAny = () => NAMES.some(autoHide);
  function glowQueue() { if (!active || glowQueued || !glowAny()) return; glowQueued = true; requestAnimationFrame(glowUpdate); }
  function glowUpdate() {
    glowQueued = false;
    if (!active) return;
    // 다음에 열릴 쪽이 이미 열려 있으면 빛은 끈다(위는 1단 = 모델 선택 바, 바를 안 숨기면 헤더)
    const on = {
      top: managed('bar') ? !barShown() : managed('top') && !R.top.open,
      left: managed('left') && !R.left.open,
      right: managed('right') && !R.right.open && py > dims.rb,
    };
    const dist = { top: py, left: px, right: window.innerWidth - px };
    for (const n of GLOW_EDGES) {
      const el = glowEls[n];
      if (!el) continue;
      let f = 0;
      if (px >= 0 && py >= 0 && on[n]) { f = 1 - dist[n] / GLOW[n]; f = f <= 0 ? 0 : Math.pow(f, 1.3); }
      const v = f.toFixed(2);
      // data-off: 패널이 열렸으면 전환 없이 즉시 끈다. data-idle: 안 보이는 동안 숨쉬기 애니메이션 멈춤
      flag(el, 'data-off', !on[n]);
      flag(el, 'data-idle', v === '0.00');
      if (el.__v !== v) { el.__v = v; el.style.opacity = v; }
    }
  }
  function mountGlow() {
    if (!glowAny()) { unmountGlow(); return; }
    for (const n of GLOW_EDGES) {
      let el = glowEls[n];
      if (!el) { el = document.createElement('div'); el.className = 'cpb-glow'; el.setAttribute('data-edge', n); el.setAttribute('aria-hidden', 'true'); glowEls[n] = el; }
      el.__v = '0'; el.style.opacity = '0';
      if (!el.isConnected) document.body.appendChild(el);
    }
  }
  function unmountGlow() { for (const n of GLOW_EDGES) { const el = glowEls[n]; if (el && el.isConnected) el.remove(); } }

  function isOpen(name) {
    if (!page || !R[name]) return false;
    if (managed(name)) return name === 'bar' ? barShown() : R[name].open;
    const el = regionEl(name);
    if (!el) return false;
    const c = el.classList;
    if (name === 'right') return c.contains('lg:w-[260px]') || c.contains('translate-x-0');
    if (name === 'left') return mql.matches && c.contains('lg:w-[256px]'); // 1024 미만은 52px 레일이거나 숨김
    return true;
  }

  function scheduleClose(name, ms) {
    const r = R[name];
    clearTimeout(r.closeT);
    r.closeT = setTimeout(() => { r.closeT = 0; tryClose(name); }, ms);
  }
  function cancelClose(name) { const r = R[name]; if (r.closeT) { clearTimeout(r.closeT); r.closeT = 0; } }
  // 붙잡던 것(포인터·포커스)이 이벤트로 끝났을 때: 유예 뒤에 다시 판단
  function release(name) {
    const r = R[name];
    if (!r.open) return;
    r.held = false;
    if (!r.hover.size) scheduleClose(name, T.grace);
  }
  function startIntent(name) {
    const r = R[name];
    if (r.open || r.intentT || !managed(name)) return;
    if (name === 'top' && managed('bar') && !topArmed) return; // 화면 끝까지 한 번에 던진 경우: 1단만
    // 모델 선택 바를 자동 숨김하지 않으면 헤더는 1단이라 머무르기 지연 없이 바로(바와 같은 지연) 연다
    const ms = name === 'top' && !managed('bar') ? EDGE.bar.intent : EDGE[name].intent;
    r.intentT = setTimeout(() => { r.intentT = 0; if (r.hover.size) open(name, 'hover'); }, ms);
  }
  function stopIntent(name) { const r = R[name]; if (r.intentT) { clearTimeout(r.intentT); r.intentT = 0; } }

  function tryClose(name) {
    const r = R[name];
    if (!r.open || !managed(name) || r.hold) return; // hold는 영역의 pointerleave가 풀고 다시 예약한다
    for (const x of r.hover) if (!x.isConnected) r.hover.delete(x);
    if (r.hover.size) return; // 나갈 때 pointerleave가 다시 예약한다
    // 헤더가 열려 있는 동안 모델 선택 바는 그 아래에 붙어 있는다(헤더가 닫힌 뒤 유예를 두고 판단)
    if (name === 'bar' && barUnder()) { r.held = true; scheduleClose(name, T.recheck); return; }
    if (pointerInside(name) || focusHold(name) || popperHold(name)) { r.held = true; scheduleClose(name, T.recheck); return; }
    // 다이얼로그가 닫히는 등 붙잡던 것이 방금 끝났으면 바로 닫지 않고 유예를 한 번 둔다
    if (r.held) { r.held = false; scheduleClose(name, T.grace); return; }
    setOpen(name, false);
  }

  // 포인터가 영역 위에 있는지: 우리 CSS가 정한 고정 치수와 클래스로만 계산(레이아웃 읽기 없음).
  // 영역이 멈춘 포인터 밑으로 미끄러져 들어와 pointerenter가 늦게 오는 경우, 토글 버튼처럼 영역 밖이지만 그 줄에 있는 경우를 위한 안전망.
  // 겹치는 곳은 위에 그려지는 쪽으로 친다: 좌측 오버레이(z 70) > 상단 헤더(z 60) > 우측 오버레이
  function pointerInside(name) {
    if (px < 0 || py < 0) return false;
    const leftOver = managed('left') && R.left.open && px < GEO.leftW;
    // 열린 모델 선택 바의 아래 끝(헤더가 열려 있으면 헤더 높이만큼 내려가 있다)
    const barBottom = barShown() ? (barUnder() ? dims.hh : 0) + dims.rb : 0;
    if (name === 'left') return px < GEO.leftW;
    if (name === 'right') return px >= window.innerWidth - GEO.rightW && !(managed('top') && R.top.open && py < dims.hh) && !(py < barBottom) && !leftOver;
    if (name === 'bar') return py < (barUnder() ? dims.hh : 0) + dims.rb && px >= headerLeft() && !leftOver;
    // 헤더가 열려 있으면 헤더와 그 아래 모델 선택 바를 한 덩어리로 본다(바를 쓰는 동안 헤더가 접히며 바가 위로 튀지 않게)
    return py < dims.hh + (barUnder() ? dims.rb : 0) && px >= headerLeft() && !leftOver;
  }
  // 헤더 왼쪽 끝: 좌측이 오버레이면 0, 크랙 기본 배치면 사이드바 폭(256 또는 52px 레일)
  function headerLeft() {
    if (!els.left || managed('left')) return 0;
    return els.left.classList.contains('lg:w-[52px]') && !els.left.classList.contains('lg:w-[256px]') ? 52 : GEO.leftW;
  }

  // 포커스: 글 입력 중이거나, 키보드(Tab·화살표)로 옮겨 온 포커스(:focus-visible)일 때만 붙잡는다.
  // Radix는 메뉴·다이얼로그를 닫으면 트리거로 포커스를 돌려주고, Esc로 닫으면 그 포커스가 :focus-visible이 된다.
  // 마우스로 연 메뉴를 Esc로 닫은 뒤 영역이 계속 남지 않도록 마지막 이동 수단(navBy)을 함께 본다.
  function focusHold(name) {
    const a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) return false;
    const el = regionEl(name);
    if (!el || !el.contains(a)) return false;
    return isTextEntry(a) || (navBy === 'key' && isKeyboardFocus(a));
  }
  function isKeyboardFocus(el) { try { return el.matches(':focus-visible'); } catch (_) { return true; } }
  function isTextEntry(el) {
    if (el.isContentEditable) return true;
    const t = el.tagName;
    if (t === 'TEXTAREA' || t === 'SELECT') return true;
    return t === 'INPUT' && !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/i.test(el.type || '');
  }

  // 영역에서 연 Radix 팝퍼/메뉴/다이얼로그/리스트박스가 떠 있는 동안 붙잡는다
  function popperHold(name) {
    const el = regionEl(name);
    if (el && el.querySelector(TRIGGER_OPEN_SEL)) return true;
    if (lastPress !== name) return false;
    const kids = document.body.children; // Radix 포털은 body 직계
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.matches(PORTAL_SEL)) return true;
      const c = k.firstElementChild;
      if (c && !k.id && c.matches(PORTAL_SEL)) return true;
    }
    // 크랙 자체 창(플레이 가이드 등)은 body가 아니라 main 바로 아래에 그려진다
    return !!document.querySelector('main > [role="dialog"], main > .z-modal[data-state="open"]');
  }

  function regionOf(t) {
    if (!t || t.nodeType !== 1) return null;
    for (const n of NAMES) { const el = regionEl(n); if (el && el.contains(t)) return n; }
    return null;
  }

  // ── 가장자리 감지 띠(우리 요소) ───────────────────────
  let scroller = null;
  function chatScroller() {
    if (!scroller || !scroller.isConnected) {
      const iso = els.roomBar && els.roomBar.parentElement;
      scroller = iso ? iso.querySelector('.stick-to-bottom > div') : null;
    }
    return scroller;
  }
  function onZoneWheel(e) {
    // 가장자리 띠 위에서 굴린 휠은 채팅 스크롤로 넘긴다
    const sc = chatScroller();
    if (!sc) return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sc.clientHeight : 1;
    sc.scrollTop += e.deltaY * k;
  }
  // 오른쪽 띠는 채팅 스크롤바를 덮는다. 띠를 누른 채 끌면 스크롤바 막대를 끈 것처럼 채팅을 스크롤한다(누를 때 한 번만 잰다)
  function onZoneDrag(e, z) {
    const sc = e.button === 0 ? chatScroller() : null;
    if (!sc) return;
    const view = sc.clientHeight, total = sc.scrollHeight;
    if (view <= 0 || total <= view) return;
    const k = total / view, y0 = e.clientY, s0 = sc.scrollTop, id = e.pointerId;
    const move = (ev) => { if (ev.pointerId === id) sc.scrollTop = s0 + (ev.clientY - y0) * k; };
    const end = (ev) => {
      if (ev.pointerId !== id) return;
      z.removeEventListener('pointermove', move);
      z.removeEventListener('pointerup', end);
      z.removeEventListener('pointercancel', end);
      z.removeEventListener('lostpointercapture', end);
    };
    z.addEventListener('pointermove', move);
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
    z.addEventListener('lostpointercapture', end);
    try { z.setPointerCapture(id); } catch (_) { /* 합성 이벤트 등 */ }
    e.preventDefault();
  }
  // 오른쪽 띠의 시작 높이 --cpb-rb = 잰 룸 상단바 높이(measure가 감지 띠에만 넣는다. 스탯 바가 있으면 88px)
  function zoneCss() {
    const e = EDGE;
    const rb = 'var(--cpb-rb,' + e.right.top + 'px)';
    return 'html[data-cpb] .cpb-zone[data-cpb-zone=bar]{top:0;left:0;right:0;height:' + e.bar.size + 'px}\n'
      + 'html[data-cpb] .cpb-zone[data-cpb-zone=top]{top:0;left:0;right:0;height:' + e.top.size + 'px}\n'
      + 'html[data-cpb] .cpb-zone[data-cpb-zone=left]{top:0;bottom:0;left:0;width:' + e.left.size + 'px}\n'
      + 'html[data-cpb] .cpb-zone[data-cpb-zone=right]{top:' + rb + ';bottom:0;right:0;width:' + e.right.size + 'px}\n'
      + 'html[data-cpb] .cpb-zone[data-cpb-zone=right][data-below]{top:calc(var(--cpb-hh) + ' + rb + ')}';
  }
  function ensureZone(name) {
    const r = R[name];
    if (!r.zone) {
      const z = document.createElement('div');
      z.className = 'cpb-zone';
      z.setAttribute('data-cpb-zone', name);
      z.setAttribute('aria-hidden', 'true');
      z.addEventListener('pointerenter', (e) => { r.hover.add(z); cancelClose(name); if (!e.buttons) startIntent(name); });
      z.addEventListener('pointermove', (e) => { if (!e.buttons && !r.open && !r.intentT) startIntent(name); });
      z.addEventListener('pointerleave', () => { r.hover.delete(z); stopIntent(name); release(name); });
      // 띠 위에서 누르거나 휠을 굴리면(스크롤하려는 것) 열기를 취소한다. 다시 움직이면 새로 센다
      z.addEventListener('pointerdown', (e) => { stopIntent(name); if (name === 'right') onZoneDrag(e, z); });
      z.addEventListener('wheel', (e) => { stopIntent(name); onZoneWheel(e); }, { passive: true });
      r.zone = z;
    }
    if (!r.zone.isConnected) document.body.appendChild(r.zone);
  }
  function removeZone(name) {
    const r = R[name];
    stopIntent(name);
    if (r.zone) { r.hover.delete(r.zone); if (r.zone.isConnected) r.zone.remove(); }
  }

  // ── 남의 영역 요소 연결/해제 ──────────────────────────
  let ro = null; // 헤더·룸 상단바 높이를 따라가는 ResizeObserver(룸 상단바는 높이를 읽기만 한다)
  function bindEl(role, el) {
    if (ro && (role === 'header' || role === 'roomBar')) ro.observe(el);
    const name = ROLE_REGION[role];
    if (!name) return;
    const r = R[name];
    const h = {
      enter: () => { r.hover.add(el); cancelClose(name); },
      leave: () => { r.hover.delete(el); r.hold = false; release(name); },
      focusin: (e) => { if (managed(name) && !r.open && navBy === 'key' && isKeyboardFocus(e.target)) open(name, 'focus'); },
      focusout: () => release(name),
    };
    el.addEventListener('pointerenter', h.enter);
    el.addEventListener('pointerleave', h.leave);
    el.addEventListener('focusin', h.focusin);
    el.addEventListener('focusout', h.focusout);
    if (role === 'left') el.addEventListener('click', onSidebarClick, true);
    bound.set(el, { role, h });
  }
  function unbindEl(el) {
    if (ro) ro.unobserve(el);
    const b = bound.get(el);
    if (!b) return;
    el.removeEventListener('pointerenter', b.h.enter);
    el.removeEventListener('pointerleave', b.h.leave);
    el.removeEventListener('focusin', b.h.focusin);
    el.removeEventListener('focusout', b.h.focusout);
    el.removeEventListener('click', onSidebarClick, true);
    const had = el.hasAttribute('data-cpb-ah');
    for (const a of MARKS) delAttr(el, a);
    if (had && el.isConnected) queueRestore(el);
    R[ROLE_REGION[b.role]].hover.delete(el);
    bound.delete(el);
  }
  // 떨어져 나간 요소(크기 0으로 알림)는 재탐색이 새 요소로 다시 잰다
  function onResize() {
    if (page && (!els.header || els.header.isConnected) && (!els.roomBar || els.roomBar.isConnected)) attempt(measure);
  }

  // 크랙의 우측 메뉴 토글(룸 상단바 맨 오른쪽 버튼, 단축키 Ctrl+0): 오버레이가 닫혀 있으면 열고, 열려 있으면 닫는다.
  // 어떤 버튼인지 추측하지 않고, 룸 상단바 클릭(또는 Ctrl+0) 직후 크랙이 패널 클래스(lg:w-[260px])를 뒤집었는지로 판단한다.
  // 크랙의 처리는 막지 않는다. 무엇을 보일지는 오버레이 CSS가 정하고, 바뀐 크랙 내부 상태는 settleCrackPanel이 닫힘으로 되돌린다.
  function crackPanelOpen() {
    let p = els.right;
    if (!p || !p.isConnected) p = findPanel(els.roomBar);
    return p ? p.classList.contains('lg:w-[260px]') : null;
  }
  // 크랙 우측 메뉴 토글 버튼 = 룸 상단바 안쪽 막대(첫 자식)의 마지막 버튼(스탯 바 칸의 버튼은 제외)
  function crackToggleBtn() {
    const rb = els.roomBar && els.roomBar.isConnected ? els.roomBar : document.querySelector('.group\\/header');
    const inner = rb && rb.firstElementChild;
    const bs = inner ? inner.querySelectorAll('button') : null;
    return bs && bs.length ? bs[bs.length - 1] : null;
  }
  // 우측 자동 숨김 중에는 크랙 내부의 '채팅방 설정 열림' 상태를 늘 닫힘으로 둔다. 이 상태가 열림으로 남으면 크랙은
  // 채팅 클릭으로 룸 상단바를 접지 않고(룸 행 onClick: 패널이 닫혀 있을 때만 접기), 토글 아이콘도 활성 색으로 남는다.
  // 토글 버튼에 합성 클릭을 한 번 보내 크랙이 스스로 닫게 한다. isTrusted=false라 onClickCapture는 이 클릭을 지켜보지 않는다.
  // (부작용: 크랙 분석 이벤트 click_menu_btn이 한 번 더 나간다)
  function settleCrackPanel(btn) {
    if (!managed('right') || crackPanelOpen() !== true) return;
    const b = btn && btn.isConnected ? btn : crackToggleBtn();
    if (b) b.click();
  }
  function watchCrackToggle(btn) {
    const before = crackPanelOpen();
    setTimeout(() => {
      const after = crackPanelOpen();
      if (after === null || after === before) return;
      if (!managed('right')) { notify('right'); return; } // 자동 숨김이 꺼져 있으면 크랙 기본 동작 그대로, 이벤트만
      if (R.right.open) forceClose('right'); else open('right', 'toggle');
      if (after) attempt(() => settleCrackPanel(btn));
    }, 0);
  }

  // 사이드바 '사이드바 접기' 버튼: 오버레이 모드에서는 "오버레이 닫기"로 바꾸고 크랙의 52px 접힘은 막는다.
  // ('사이드바 펼치기'는 그대로 둔다 — 크랙이 접힌 상태로 저장돼 있으면 펼쳐서 오버레이 내용이 정상으로 보이게)
  function onSidebarClick(e) {
    if (!managed('left')) return;
    const b = e.target && e.target.closest ? e.target.closest('button[aria-label="사이드바 접기"]') : null;
    if (!b || !els.left || !els.left.contains(b)) return;
    e.stopPropagation();
    e.preventDefault();
    if (!userEvent(e)) return; // 합성 클릭은 크랙의 접힘만 막고 오버레이는 그대로 둔다
    forceClose('left');
  }

  // 우측 오버레이 안의 클릭은 크랙의 룸 행 onClick까지 올라간다. 크랙은 패널이 닫혀 있다고 알고 있으면
  // 그 클릭을 '룸 상단바 숨김 토글'로 처리한다(원래는 패널이 닫혀 있을 때만 생기는 일). 크랙의 처리는 막지 않고
  // (행 클릭이 같이 막히므로), 처리가 끝난 뒤 상단바 상태가 뒤집혔으면 룸 행을 한 번 더 눌러 되돌린다.
  let panelClick = null;
  function roomBarHidden() {
    if (!els.roomBar) return null;
    for (const c of els.roomBar.children) if (c.classList.contains('-translate-y-12')) return true;
    return false;
  }
  function onClickCapture(e) {
    panelClick = null;
    const t = e.target;
    if (!t || t.nodeType !== 1) return;
    // 룸 상단바 클릭은 막지 않고, 크랙 우측 메뉴 토글이었는지만 지켜본다(다른 스크립트의 합성 클릭은 제외)
    if (els.roomBar && els.roomBar.contains(t)) { const b = userEvent(e) && t.closest('button'); if (b) watchCrackToggle(b); return; }
    if (!els.right || !els.right.contains(t) || !managed('right') || crackPanelOpen() !== false) return;
    const hidden = roomBarHidden();
    if (hidden !== null) panelClick = { hidden, row: els.right.parentElement };
  }
  function onClickBubble() {
    // 크랙의 '채팅 클릭으로 모델 선택 바 접기/펴기'를 따라간다(React 반영 뒤 + 전환이 끝난 뒤 한 번 더)
    if (active && managed('bar')) { setTimeout(readCrackBar, 0); setTimeout(readCrackBar, 260); }
    const p = panelClick;
    panelClick = null;
    if (!p) return;
    // React는 이 클릭의 상태 변경을 마이크로태스크로 반영한다 → 그 뒤, 그리기 전에 확인
    queueMicrotask(() => {
      if (roomBarHidden() !== p.hidden && p.row && p.row.isConnected && crackPanelOpen() === false) p.row.click();
    });
  }

  // ── 전역 입력(가볍게) ─────────────────────────────────
  // pointermove는 좌표만 저장(레이아웃 읽기 없음, 브라우저가 프레임당 1회로 합쳐 보냄)
  const onPointerMove = (e) => {
    px = e.clientX; py = e.clientY;
    if (!topArmed && py > EDGE.top.size + 6) topArmed = true;
    glowQueue();
  };
  function onPointerDown(e) {
    if (userEvent(e)) navBy = 'pointer';
    const t = e.target;
    const reg = regionOf(t);
    if (reg) lastPress = reg;
    else if (!(t && t.closest && t.closest(PORTAL_SEL))) lastPress = null; // 포털 안 클릭은 유지
  }
  function onKeyDown(e) {
    if (NAV_KEY.test(e.key) && userEvent(e)) navBy = 'key';
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (mod && !e.shiftKey && (e.code === 'Digit0' || e.key === '0')) {
      // 크랙 단축키 Ctrl+0(채팅방 설정 열기/닫기) = 토글 버튼과 같은 처리
      if (userEvent(e) && !e.repeat) watchCrackToggle();
      return;
    }
    if (mod && e.shiftKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ㅣ') && managed('left')) {
      // 크랙 단축키 Ctrl+Shift+S(대화 내역 열기/닫기)는 사이드바를 52px로 접는다 → 오버레이 열기/닫기로 바꾼다.
      // window 캡처라 크랙(react-hotkeys, document)보다 먼저 받는다
      e.preventDefault();
      e.stopPropagation();
      if (userEvent(e) && !e.repeat) { if (R.left.open) forceClose('left'); else open('left', 'toggle'); }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const reg = regionOf(document.activeElement);
    if (reg) lastPress = reg;
  }

  function onDocLeave() {
    px = py = -1;
    glowQueue();
    for (const n of NAMES) {
      const r = R[n];
      stopIntent(n);
      if (r.hover.size) { r.hover.clear(); release(n); }
    }
  }

  // ── 영역 찾기 ─────────────────────────────────────────
  function findSidebar() {
    let sb = document.querySelector('.bg-sidebar.shrink-0') || document.querySelector('.bg-sidebar');
    while (sb && sb.parentElement) {
      const up = sb.parentElement.closest('.bg-sidebar');
      if (!up) break;
      sb = up;
    }
    return sb;
  }
  function findPanel(roomBar) {
    const iso = roomBar && roomBar.parentElement;
    if (iso) {
      for (const row of iso.children) {
        if (row === roomBar) continue;
        for (const c of row.children) if (c.classList.contains('border-l') && c.classList.contains('border-outline_tertiary')) return c;
      }
    }
    return document.querySelector('main .border-l.border-outline_tertiary');
  }
  function pickHeader(el, main) {
    if (!el || !main || el === main || el.tagName === 'MAIN' || el.contains(main)) return null;
    if (!el.querySelector('a[href^="/stories"],a[href^="/characters"],a[href="/my"],a[href^="/image"]')) return null;
    const h = el.offsetHeight;
    return h >= 40 && h <= 90 ? el : null;
  }
  function findRegions() {
    const keep = (el) => (el && el.isConnected ? el : null);
    const f = { header: null, roomBar: null, left: null, right: null, list: null };
    f.roomBar = keep(els.roomBar) || document.querySelector('.group\\/header');
    f.left = keep(els.left) || findSidebar();
    const main = (f.roomBar && f.roomBar.closest('main')) || document.querySelector('main');
    const col = main && main.parentElement;
    f.header = keep(els.header) && els.header.parentElement === col ? els.header : col ? pickHeader(col.firstElementChild, main) : null;
    f.right = keep(els.right) || findPanel(f.roomBar);
    if (f.right) {
      f.list = keep(els.list) && f.right.contains(els.list) ? els.list
        : f.right.querySelector('.scrollbar > .px-2') || f.right.querySelector('.overflow-y-auto > .px-2');
    }
    return f;
  }

  // 헤더 높이(--cpb-hh)와 룸 상단바 높이(--cpb-rb, 감지 띠에만)를 잰다. 룸 상단바는 읽기만 한다.
  // 룸 상단바 = 48px 막대 + mt-12 칸(스탯 바가 있으면 +40px). 크랙이 접을 때는 transform이라 높이는 그대로다
  function measure() {
    const hh = els.header ? els.header.offsetHeight || 56 : 56;
    const rb = Math.max(els.roomBar ? els.roomBar.offsetHeight : 0, EDGE.right.top);
    dims = { hh, rb };
    cssAdd('base:vars', VAR_SEL + '{--cpb-hh:' + hh + 'px}\nhtml[data-cpb] :is(.cpb-zone,.cpb-glow){--cpb-rb:' + rb + 'px}');
  }

  // ── 재탐색 · 옵저버 ───────────────────────────────────
  let mo = null;
  let scanQueued = false;
  let missing = true, missTries = 0, lastMissAt = 0, idleTicks = 0;

  // O(1): 캐시한 요소와 슬롯이 아직 붙어 있는지만 본다. 레코드는 읽지 않는다.
  function onMutations() {
    const t0 = perf();
    stats.moCalls++;
    if (page && !scanQueued) {
      if ((els.header && !els.header.isConnected) || (els.roomBar && !els.roomBar.isConnected)
        || (els.left && !els.left.isConnected) || (els.right && !els.right.isConnected)
        || (els.list && !els.list.isConnected) || (slot && els.list && !slot.isConnected)) queueScan();
      else if (missing && missTries < T.missMax && t0 - lastMissAt > T.missGap) { missTries++; lastMissAt = t0; queueScan(); }
      perfRetry(t0);
      cmpRetry(t0);
    }
    const dt = perf() - t0;
    stats.moTimeMs += dt;
    if (dt > stats.moMaxMs) stats.moMaxMs = dt;
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(() => requestAnimationFrame(() => { scanQueued = false; if (page) attempt(scan); }), T.scanDelay);
  }

  function scan() {
    const t0 = perf();
    stats.scans++;
    const f = findRegions();
    let changed = false;
    for (const role of ROLES) {
      if (f[role] === els[role]) continue;
      if (els[role]) unbindEl(els[role]);
      els[role] = f[role];
      if (f[role]) bindEl(role, f[role]);
      changed = true;
    }
    if (f.list !== els.list) { els.list = f.list; changed = true; }
    if (changed) { measure(); scroller = null; missTries = 0; }
    quiet++;
    try { if (changed) crackBarShown = roomBarHidden() === false; for (const n of NAMES) applyRegion(n); } finally { quiet--; }
    ensureSlot();
    missing = !(els.header && els.roomBar && els.left && els.right && els.list);
    stats.scanTimeMs += perf() - t0;
    if (changed) emit('regions', snapshot());
    for (const n of NAMES) notify(n); // 'regions' 다음에 열림 상태 알림
  }

  function snapshot() { return { header: els.header, roomBar: els.roomBar, left: els.left, right: els.right, list: els.list }; }
  function getRegion(name) {
    if (name === 'top') return els.header ? [els.header] : [];
    if (name === 'bar') return els.roomBar;
    return Object.prototype.hasOwnProperty.call(els, name) ? els[name] : null;
  }

  // ── 켜기 / 끄기 ───────────────────────────────────────
  const CAP_PASSIVE = { capture: true, passive: true };

  // 페이지 수명: 스토리 채팅 경로에 들어오면(폭 무관) 공용 스타일, 영역 찾기, 슬롯, 크랙 토글 지켜보기
  function enterPage() {
    page = true;
    missTries = 0;
    if (!mo) mo = new MutationObserver(onMutations);
    mo.observe(document.body, { childList: true, subtree: true });
    if (!ro && typeof ResizeObserver === 'function') ro = new ResizeObserver(onResize);
    attempt(scan); // 읽기(영역 찾기, 높이 재기)를 우리 쓰기(스타일, html 속성)보다 먼저 해서 강제 동기 재계산을 피한다
    mountCss();
    window.addEventListener('click', onClickCapture, true);
    document.addEventListener('click', onClickBubble);
  }

  function leavePage() {
    page = false;
    if (mo) mo.disconnect();
    if (ro) ro.disconnect();
    window.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('click', onClickBubble);
    panelClick = null;
    for (const role of ROLES) { if (els[role]) unbindEl(els[role]); els[role] = null; }
    els.list = null;
    cmpDetach();
    inputRender(); // 우리 입력창 UI 정리
    scroller = null;
    if (slot && slot.isConnected) slot.remove();
    missing = true;
    unmountCss();
    for (const n of NAMES) notify(n);
  }

  // 레이아웃 수명: 페이지 + 폭 1024px 이상. 여기서는 쓰기만 한다
  function activate() {
    active = true;
    window.addEventListener('pointermove', onPointerMove, CAP_PASSIVE);
    window.addEventListener('pointerdown', onPointerDown, CAP_PASSIVE);
    window.addEventListener('keydown', onKeyDown, true);
    document.documentElement.addEventListener('mouseleave', onDocLeave);
    crackBarShown = roomBarHidden() === false;
    for (const n of NAMES) applyRegion(n);
    mountGlow();
    perfApply();
    renderMenu();
    document.documentElement.setAttribute('data-cpb', '');
  }

  function deactivate() {
    active = false;
    window.removeEventListener('pointermove', onPointerMove, CAP_PASSIVE);
    window.removeEventListener('pointerdown', onPointerDown, CAP_PASSIVE);
    window.removeEventListener('keydown', onKeyDown, true);
    document.documentElement.removeEventListener('mouseleave', onDocLeave);
    for (const n of NAMES) {
      R[n].hover.clear();
      syncRegion(n); // 표식, 감지 띠 정리(+ 열림 상태가 바뀌면 region:close)
    }
    unmountGlow();
    perfApply(); // active=false → 그리기 생략 표식 제거, 숨긴 대화 모두 펼침
    renderMenu();
    lastPress = null;
    px = py = -1;
    document.documentElement.removeAttribute('data-cpb');
  }

  // ── 라우트 감지 ───────────────────────────────────────
  const mql = window.matchMedia('(min-width: 1024px)');
  let lastPath = null;
  function evaluate() {
    const path = location.pathname;
    const chat = CHAT_PATH.test(path) && !!document.body;
    const want = chat && mql.matches;
    const moved = path !== lastPath;
    const wasActive = active;
    lastPath = path;
    // 전환 중간 상태(예: 페이지만 켜진 순간의 크랙 기본 배치)로 region 이벤트가 깜빡이지 않게, 끝난 상태만 알린다
    quiet++;
    try {
      if (!want && active) attempt(deactivate);
      if (!chat && page) attempt(leavePage);
      else if (chat && !page) attempt(enterPage);
      else if (chat && moved) { missTries = 0; queueScan(); armChat(4000); } // 다른 방으로 옮기면 크랙의 첫 '맨 아래로'는 그대로
      if (want && !active) attempt(activate);
    } finally { quiet--; }
    if (moved) emit('route', { active, chat, path });
    if (active !== wasActive) emit('active', { active });
    for (const n of NAMES) notify(n);
  }
  function hookHistory() {
    for (const m of ['pushState', 'replaceState']) {
      const orig = history[m];
      if (typeof orig !== 'function') continue;
      history[m] = function () {
        const ret = orig.apply(this, arguments);
        setTimeout(evaluate, 0);
        return ret;
      };
    }
    window.addEventListener('popstate', () => setTimeout(evaluate, 0));
  }
  function tick() {
    // 경로 변화 + 미디어쿼리 change 이벤트를 놓친 경우(백그라운드 탭 등)의 안전망
    const path = location.pathname;
    const chat = CHAT_PATH.test(path);
    if (path !== lastPath || chat !== page || (chat && mql.matches) !== active) evaluate();
    // 못 찾은 영역은 3초마다 가볍게 재시도하되, 변이 재시도와 같은 상한(missMax)을 쓴다. 경로가 바뀌거나 영역이 새로 잡히면 다시 센다
    else if (page && missing && missTries < T.missMax && ++idleTicks % 3 === 0) { missTries++; queueScan(); }
    // 채팅 목록: 사이드바가 늦게 그려지거나 다시 마운트된 경우의 안전망(3초마다 한 번)
    // 3초마다 한 번만 찾는다(20번 재시도 사슬은 경로가 바뀔 때만. 여기서 0으로 되돌리면 사이드바가 없는 화면에서 150ms 찾기가 끝나지 않는다)
    if ((!side.root || !side.root.isConnected) && clOn('on') && ++side.idle % 3 === 0) { side.tries = 20; sideEval(); }
    if (siteEl && !siteEl.isConnected) siteMount();
  }

  // ── 확장 기능 슬롯 · 메뉴 등록 ────────────────────────
  let slot = null, slotList = null;
  const items = new Map();
  const rows = new Map();
  const expanded = new Set();
  let seq = 0;

  function buildSlot() {
    slot = document.createElement('div');
    slot.id = 'cpb-ext-slot';
    const sp = document.createElement('div');
    sp.className = 'cpb-spacer';
    const hd = document.createElement('div');
    hd.className = 'cpb-sec typo-text-md_leading-none_medium text-text_tertiary';
    hd.textContent = '확장 기능';
    slotList = document.createElement('div');
    slotList.className = 'cpb-items';
    slotList.setAttribute('role', 'group');
    slotList.setAttribute('aria-label', '확장 기능');
    slot.append(sp, hd, slotList);
  }
  function ensureSlot() {
    // 우측 메뉴 '확장 기능' 칸은 쓰지 않는다: 설정은 입력창 도구 줄의 설정 버튼(설정창)으로 옮겼다
    // (등록 API menu.register는 그대로 받아 두기만 한다)
    if (slot && slot.isConnected) slot.remove();
  }

  const SW_CLS = 'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors border '
    + 'data-[state=unchecked]:border-bg-input-80 data-[state=unchecked]:bg-bg-input-80 data-[state=checked]:border-primary '
    + 'data-[state=checked]:bg-primary focus-visible:outline-none cpb-switch';
  const TH_CLS = 'pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform '
    + 'data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-[-1px] cpb-thumb';
  const CHEVRON = '<svg class="cpb-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
  const MODEL_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>';
  const MSG_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h16v10H9.5L5 19v-3.5H4z"/><path d="M14 18.5h6M17 15.5v6" stroke-width="1.5"/></svg>';
  const VAULT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="6.5" width="14" height="13" rx="2.5"/><path d="M7 3.5h10.5a3 3 0 0 1 3 3V17"/><circle cx="8.5" cy="11" r="1.5"/><path d="M17.5 16.5l-4-4-7 7"/></svg>';
  const RADAR_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5" opacity=".6"/><path d="M12 12L18 6"/></svg>';
  const REROLL_ICON ='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 1 2.2 5.3"/><path d="M4.5 18v-6h6"/></svg>';
  const TOOLS_ICON ='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M13.5 7.5l3 3"/><path d="M14 20h6" stroke-width="1.4"/></svg>';
  const DASH_ICON ='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M6.5 8.5h1.5M10.5 8.5h1.5M14.5 8.5h1.5"/><path d="M3 12h18" stroke-width="1.2"/><path d="M6.5 15.5h4M13 15.5h4.5" stroke-width="1.4"/></svg>';
  const INPUT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M8 14h8"/></svg>';
  const CHAT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5" stroke-linecap="round"/></svg>';
  const BELL_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg>';
  const LAYOUT_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 8.5h18M8.5 8.5v11M15.5 8.5v11"/></svg>';

  function makeSwitch() {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'switch');
    b.tabIndex = -1;
    b.className = SW_CLS;
    const t = document.createElement('span');
    t.className = TH_CLS;
    b.append(t);
    return b;
  }
  function setSwitch(sw, v) {
    const s = v ? 'checked' : 'unchecked';
    setAttr(sw, 'aria-checked', String(!!v));
    setAttr(sw, 'data-state', s);
    setAttr(sw.firstElementChild, 'data-state', s);
  }
  const readToggle = (it) => !!attempt(() => it.toggle.get());

  // 숫자 조절: stepper {get, set, min, max, step(숫자 또는 (값, ±1) → 다음 값), format(값) → 글자}
  function readStep(it) { const v = Number(attempt(() => it.stepper.get())); return isFinite(v) ? v : 0; }
  function nextStep(it, v, dir) {
    const s = it.stepper;
    let n = typeof s.step === 'function' ? Number(attempt(() => s.step(v, dir))) : v + dir * (Number(s.step) || 1);
    if (!isFinite(n)) n = v;
    if (isFinite(s.min)) n = Math.max(s.min, n);
    if (isFinite(s.max)) n = Math.min(s.max, n);
    return n;
  }
  function makeStepper(row) {
    const box = document.createElement('span');
    box.className = 'cpb-step';
    const mk = (txt, dir, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.className = 'cpb-step-btn';
      b.textContent = txt;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // 행 클릭(onClick)으로 번지지 않게
        stepRow(row, dir);
      });
      return b;
    };
    const dec = mk('−', -1, '줄이기');
    const val = document.createElement('span');
    val.className = 'cpb-step-val';
    const inc = mk('+', 1, '늘리기');
    box.append(dec, val, inc);
    return { box, dec, val, inc };
  }
  function stepRow(row, dir) {
    const it = row.item, v = readStep(it), n = nextStep(it, v, dir);
    if (n !== v) attempt(() => it.stepper.set(n));
    fillRow(row);
  }
  function fillStepper(row) {
    const it = row.item, s = it.stepper, v = readStep(it);
    const txt = typeof s.format === 'function' ? String(attempt(() => s.format(v))) : String(v);
    if (row.st.val.textContent !== txt) row.st.val.textContent = txt;
    flag(row.st.dec, 'disabled', nextStep(it, v, -1) === v);
    flag(row.st.inc, 'disabled', nextStep(it, v, 1) === v);
    setAttr(row.btn, 'aria-valuenow', String(v));
    setAttr(row.btn, 'aria-valuetext', txt);
    if (isFinite(s.min)) setAttr(row.btn, 'aria-valuemin', String(s.min));
    if (isFinite(s.max)) setAttr(row.btn, 'aria-valuemax', String(s.max));
  }

  function buildRow(item, sub) {
    const el = document.createElement('div');
    el.className = 'px-2.5 h-4 box-content py-[18px] cpb-row' + (sub ? ' cpb-subrow' : '');
    el.setAttribute('data-cpb-item', item.id);
    const btn = document.createElement('div');
    btn.className = 'cpb-btn';
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    const main = document.createElement('span');
    main.className = 'cpb-main';
    const ico = document.createElement('span');
    ico.className = 'cpb-ico';
    ico.setAttribute('aria-hidden', 'true');
    const lbl = document.createElement('span');
    lbl.className = 'cpb-lbl typo-text-sm_leading-none_medium';
    const badge = document.createElement('span');
    badge.className = 'cpb-badge';
    main.append(ico, lbl, badge);
    const side = document.createElement('span');
    side.className = 'cpb-side';
    btn.append(main, side);
    el.append(btn);
    const row = { item, el, btn, ico, lbl, badge, side, sw: null, st: null, chev: false, sub: null, subRows: [], kids: undefined, iconKey: undefined };
    if (!sub && Array.isArray(item.children)) {
      row.chev = true;
      side.innerHTML = CHEVRON;
      row.sub = document.createElement('div');
      row.sub.className = 'cpb-sub';
      row.sub.setAttribute('role', 'group');
    } else if (item.stepper) {
      row.st = makeStepper(row);
      side.append(row.st.box);
      btn.setAttribute('role', 'spinbutton'); // 화살표 키로 조절, 값은 fillStepper가 aria-value*로 알린다
    } else if (item.toggle) {
      row.sw = makeSwitch();
      side.append(row.sw);
    }
    const act = (e) => activateRow(row, e);
    btn.addEventListener('click', act);
    btn.addEventListener('keydown', (e) => {
      if (e.target !== btn) return; // 안쪽 −/+ 버튼의 기본 Enter/Space는 그대로
      if (row.st) {
        const dir = { ArrowRight: 1, ArrowUp: 1, '+': 1, ArrowLeft: -1, ArrowDown: -1, '-': -1 }[e.key];
        if (dir) { e.preventDefault(); stepRow(row, dir); }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); }
    });
    return row;
  }

  function setIcon(row, icon) {
    if (row.iconKey === icon) return;
    row.iconKey = icon;
    row.ico.replaceChildren();
    if (icon && typeof icon === 'object' && icon.nodeType) row.ico.append(icon.cloneNode(true));
    else if (typeof icon === 'string' && /^\s*</.test(icon)) row.ico.innerHTML = icon;
    else if (icon != null && icon !== '') row.ico.textContent = String(icon);
  }

  function fillRow(row) {
    const it = row.item;
    const label = String(it.label == null ? it.id : it.label);
    if (row.lbl.textContent !== label) row.lbl.textContent = label;
    setIcon(row, it.icon);
    const b = it.badge == null || it.badge === '' || it.badge === false ? '' : String(it.badge);
    if (row.badge.textContent !== b) row.badge.textContent = b;
    flag(row.badge, 'hidden', !b);
    if (row.sw) setSwitch(row.sw, readToggle(it));
    if (row.st) fillStepper(row);
    if (row.chev) {
      setAttr(row.btn, 'aria-expanded', String(expanded.has(it.id)));
      if (row.kids !== it.children) {
        row.kids = it.children;
        row.subRows = (it.children || []).filter((c) => c && c.id != null).map((c) => buildRow(Object.assign({}, c, { id: it.id + '/' + c.id, parent: it }), true));
        row.sub.replaceChildren(...row.subRows.map((s) => s.el));
      }
      for (const s of row.subRows) fillRow(s);
    }
  }

  function activateRow(row, e) {
    const it = row.item;
    if (row.chev) { if (expanded.has(it.id)) expanded.delete(it.id); else expanded.add(it.id); renderMenu(); }
    else if (it.toggle && !row.st) { const v = !readToggle(it); attempt(() => it.toggle.set(v)); fillRow(row); }
    if (typeof it.onClick === 'function') attempt(() => it.onClick(e, it.parent ? it.parent.handle : it.handle));
  }

  function renderMenu() {
    if (!slotList) return;
    const want = [];
    const sorted = Array.from(items.values()).sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
    for (const it of sorted) {
      if (it.layoutOnly && !active) continue; // 레이아웃 전용 항목('레이아웃')은 폭이 좁으면 숨긴다
      let row = rows.get(it.id);
      if (!row || row.item !== it) { if (row) { row.el.remove(); if (row.sub) row.sub.remove(); } row = buildRow(it, false); rows.set(it.id, row); }
      fillRow(row);
      want.push(row.el);
      if (row.sub && expanded.has(it.id)) want.push(row.sub);
    }
    for (const [id, row] of rows) {
      if (items.get(id) !== row.item) { row.el.remove(); if (row.sub) row.sub.remove(); rows.delete(id); }
    }
    const cur = slotList.children;
    let same = cur.length === want.length;
    for (let i = 0; same && i < want.length; i++) if (cur[i] !== want[i]) same = false;
    if (!same) slotList.replaceChildren(...want);
    flag(slot, 'hidden', !want.length);
  }

  function register(opts) {
    if (!opts || opts.id == null) throw new TypeError('CrackPcBase.menu.register: id가 필요합니다');
    const id = String(opts.id);
    const item = Object.assign({ label: id, icon: null, order: 100, onClick: null, toggle: null, badge: null, children: null }, opts, { id, seq: ++seq });
    if (typeof item.order !== 'number' || isNaN(item.order)) item.order = 100;
    const handle = {
      update(patch) {
        if (items.get(id) !== item) return handle;
        if (isObj(patch)) {
          for (const k of Object.keys(patch)) if (k !== 'id' && k !== 'seq' && k !== 'handle') item[k] = patch[k];
          const r = rows.get(id);
          const kids = Array.isArray(item.children);
          if (r && (r.chev !== kids || !!r.st !== (!kids && !!item.stepper) || !!r.sw !== (!kids && !item.stepper && !!item.toggle))) {
            r.el.remove(); if (r.sub) r.sub.remove(); rows.delete(id); // 행 종류가 바뀌면 새로 만든다
          }
        }
        renderMenu();
        return handle;
      },
      remove() { if (items.get(id) === item) { items.delete(id); expanded.delete(id); renderMenu(); } },
    };
    item.handle = handle;
    items.set(id, item);
    renderMenu();
    return handle;
  }

  // ── CSS ───────────────────────────────────────────────
  const BASE_CSS = `
${VAR_SEL}{--cpb-dur:220ms;--cpb-ease:cubic-bezier(.2,.75,.25,1);--cpb-hh:56px}
@media (prefers-reduced-motion: reduce){${VAR_SEL}{--cpb-dur:1ms}}

/* 상단: 사이트 헤더만. 흐름에서 빼고(음수 margin, 한 번만) transform으로만 움직인다. 폭은 크랙 열 그대로(넘치지 않음).
   룸 상단바는 건드리지 않는다 — 헤더가 숨으면 크랙 그대로 y=0에 있고, 헤더가 열리면 그 위를 덮는다 */
html[data-cpb] [data-cpb-region=header][data-cpb-ah]{position:relative!important;z-index:60!important;margin-bottom:calc(-1 * var(--cpb-hh))!important;transform:translate3d(0,calc(-100% - 4px),0)!important;transition:transform var(--cpb-dur) var(--cpb-ease)!important}
html[data-cpb] [data-cpb-region=header][data-cpb-ah][data-cpb-open]{transform:translate3d(0,0,0)!important}

/* 모델 선택 바(룸 상단바): 평소 숨김, 위 끝 호버로 내려온다. 헤더가 열리면 그 아래로 밀려 내려간다.
   크랙 자체 접기(안쪽 막대의 -translate-y-12)는 오버레이가 대신하므로 안쪽은 늘 제자리 */
html[data-cpb] [data-cpb-region=roomBar][data-cpb-ah]{transform:translate3d(0,calc(-100% - 4px),0)!important;transition:transform var(--cpb-dur) var(--cpb-ease)!important}
html[data-cpb] [data-cpb-region=roomBar][data-cpb-ah][data-cpb-open]{transform:translate3d(0,0,0)!important}
html[data-cpb] [data-cpb-region=roomBar][data-cpb-ah][data-cpb-open][data-cpb-under]{transform:translate3d(0,var(--cpb-hh),0)!important}
html[data-cpb] [data-cpb-region=roomBar][data-cpb-ah]>*{transform:none!important}

/* 좌측: 사이드바 오버레이(크랙의 52/256 상태와 무관하게 256px) */
html[data-cpb] [data-cpb-region=left][data-cpb-ah]{position:absolute!important;top:0!important;bottom:0!important;left:0!important;height:100%!important;width:256px!important;z-index:70!important;transform:translate3d(calc(-100% - 40px),0,0)!important;transition:transform var(--cpb-dur) var(--cpb-ease)!important;box-shadow:6px 0 28px rgba(0,0,0,.28)}
html[data-cpb] [data-cpb-region=left][data-cpb-ah][data-cpb-open]{transform:translate3d(0,0,0)!important}

/* 우측: 방 메뉴 오버레이(크랙의 열림/닫힘 클래스와 무관하게 260px). 룸 상단바(z 10) 아래, 채팅·입력창 위 */
html[data-cpb] [data-cpb-region=right][data-cpb-ah]{position:absolute!important;top:0!important;right:0!important;bottom:0!important;left:auto!important;height:100%!important;width:260px!important;z-index:5!important;transform:translate3d(calc(100% + 40px),0,0)!important;transition:transform var(--cpb-dur) var(--cpb-ease)!important;box-shadow:-6px 0 28px rgba(0,0,0,.28)}
html[data-cpb] [data-cpb-region=right][data-cpb-ah][data-cpb-open]{transform:translate3d(0,0,0)!important}
/* 숨은 우측 패널은 오른쪽 바깥에 있어서 .isolate(overflow:hidden)가 포커스·scrollIntoView로 가로 스크롤된다. clip은 그 스크롤도 막는다 */
html[data-cpb] main>.isolate{overflow:clip!important}

/* 가장자리 빛: 감지 띠보다 넓게, 포인터가 가까울수록 밝아진다(JS는 opacity만 바꾼다). 라이트는 옅은 그림자, 다크는 옅은 빛 */
html[data-cpb] .cpb-glow{position:fixed;pointer-events:none;z-index:79;opacity:0;transition:opacity .16s ease-out;--cpb-glow:rgba(40,44,60,.18)}
html[data-cpb] .cpb-glow[data-off]{transition:none;opacity:0!important}
/* 은은한 숨쉬기: 빛 자체(::before)의 밝기만 천천히 오르내린다. 안 보이는 동안은 멈춘다 */
html[data-cpb] .cpb-glow::before{content:"";position:absolute;inset:0;background:var(--cpb-glow-bg);animation:cpb-breathe 2.4s ease-in-out infinite}
html[data-cpb] .cpb-glow:is([data-off],[data-idle])::before{animation-play-state:paused}
@keyframes cpb-breathe{0%,100%{opacity:.65}50%{opacity:1}}
/* 크랙 테마는 body[data-theme=dark|light]로 표시된다 */
html[data-cpb] body[data-theme=dark] .cpb-glow,html.dark[data-cpb] .cpb-glow{--cpb-glow:rgba(255,255,255,.24)}
html[data-cpb] .cpb-glow[data-edge=top]{top:0;left:0;right:0;height:60px;--cpb-glow-bg:linear-gradient(180deg,var(--cpb-glow),transparent)}
html[data-cpb] .cpb-glow[data-edge=left]{top:0;bottom:0;left:0;width:80px;--cpb-glow-bg:linear-gradient(90deg,var(--cpb-glow),transparent)}
html[data-cpb] .cpb-glow[data-edge=right]{top:var(--cpb-rb,48px);bottom:0;right:0;width:80px;--cpb-glow-bg:linear-gradient(270deg,var(--cpb-glow),transparent)}
@media (prefers-reduced-motion: reduce){html[data-cpb] .cpb-glow{transition:none}html[data-cpb] .cpb-glow::before{animation:none}}

/* 가장자리 감지 띠(크기는 EDGE에서 만든 'base:zones' 블록) */
html[data-cpb] .cpb-zone{position:fixed;z-index:80;background:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html[data-cpb] .cpb-zone[data-open]{pointer-events:none}
html[data-cpb] .cpb-zone::after{content:"";position:absolute;opacity:0;pointer-events:none;transition:opacity .18s ease;--cpb-hint:var(--text_tertiary,#8a8a8a)}
html[data-cpb] .cpb-zone:is([data-cpb-zone=top],[data-cpb-zone=bar])::after{left:25%;right:25%;top:0;height:3px;border-radius:0 0 3px 3px;background:linear-gradient(90deg,transparent,var(--cpb-hint),transparent)}
html[data-cpb] .cpb-zone[data-cpb-zone=left]::after{top:25%;bottom:25%;left:0;width:3px;border-radius:0 3px 3px 0;background:linear-gradient(180deg,transparent,var(--cpb-hint),transparent)}
html[data-cpb] .cpb-zone[data-cpb-zone=right]::after{top:25%;bottom:25%;right:0;width:3px;border-radius:3px 0 0 3px;background:linear-gradient(180deg,transparent,var(--cpb-hint),transparent)}
html[data-cpb] .cpb-zone:hover::after{opacity:.75}
html[data-cpb] .cpb-zone[data-open]::after{opacity:0}

/* 우측 메뉴 정돈(CSS만): 52px → 38px 행, 작은 간격, 차분한 머리글. 배경은 전환 없이 바로 바뀐다(transform/opacity 외 애니메이션 없음) */
html[data-cpb] [data-cpb-region=right] .px-2>div:is(.h-10,.h-\\[40px\\]):empty{height:14px}
html[data-cpb] [data-cpb-region=right] .px-2>:is(span,p).p-2,html[data-cpb] #cpb-ext-slot .cpb-sec{display:block;padding:8px 10px 4px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.02em;opacity:.8}
html[data-cpb] [data-cpb-region=right] [data-orientation=vertical]>h3>button.p-2{padding:8px 10px 4px;font-size:12px;line-height:16px;font-weight:600;letter-spacing:.02em;opacity:.8}
/* border-radius는 !important: sgb가 자기 행에 #id 선택자로 border-radius:0을 준다 */
html[data-cpb] [data-cpb-region=right] .px-2\\.5.py-\\[18px\\]{box-sizing:content-box;height:16px;padding-top:11px;padding-bottom:11px;border-radius:8px!important}
html[data-cpb] [data-cpb-region=right] .px-2\\.5.py-\\[18px\\]:hover{background-color:var(--state_hover,rgba(128,128,128,.12))}
html[data-cpb] [data-cpb-region=right] .px-2\\.5.py-\\[18px\\]:active{box-shadow:inset 0 0 0 100px var(--state_hover,rgba(128,128,128,.12))}
html[data-cpb] [data-cpb-region=right] .px-2>button.h-10.p-2{height:34px;border-radius:8px}
html[data-cpb] [data-cpb-region=right] .px-2>button.h-10.p-2:hover{background-color:var(--state_hover,rgba(128,128,128,.12))}

/* 확장 기능 슬롯(우리 행): 페이지 수명이라 html[data-cpb] 없이도(폭이 좁아도) 모양이 맞아야 한다. 크랙 클래스가 없어져도 유지되는 기본값 */
#cpb-ext-slot .cpb-spacer{height:40px}
#cpb-ext-slot .cpb-sec{display:block;padding:8px}
:where(#cpb-ext-slot .cpb-row){box-sizing:content-box;height:16px;padding:18px 10px}
#cpb-ext-slot .cpb-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:16px;cursor:pointer;outline:none;color:inherit}
#cpb-ext-slot .cpb-btn:focus-visible{border-radius:6px;box-shadow:0 0 0 2px hsl(var(--focus,0 0% 60%/.5))}
#cpb-ext-slot .cpb-main{display:flex;align-items:center;gap:8px;min-width:0}
#cpb-ext-slot .cpb-ico{flex:none;width:24px;height:24px;display:grid;place-items:center;font-size:17px;line-height:1;color:var(--icon_tertiary,#85837d)}
#cpb-ext-slot .cpb-ico svg{width:24px;height:24px}
#cpb-ext-slot .cpb-lbl{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
:where(#cpb-ext-slot .cpb-lbl){font-size:14px;line-height:14px;font-weight:500}
#cpb-ext-slot .cpb-badge{flex:none;font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--surface_brand_primary,#ff4432);color:#fff}
#cpb-ext-slot .cpb-badge[hidden]{display:none}
#cpb-ext-slot .cpb-side{flex:none;display:flex;align-items:center;color:var(--text_tertiary,#85837d)}
#cpb-ext-slot .cpb-chev{display:block;transition:transform .15s ease}
#cpb-ext-slot [aria-expanded=true] .cpb-chev{transform:rotate(90deg)}
#cpb-ext-slot .cpb-row.cpb-subrow{padding-left:42px}
#cpb-ext-slot .cpb-subrow .cpb-ico:empty{display:none}
#cpb-ext-slot .cpb-subrow .cpb-lbl{font-size:13px;color:var(--text_secondary,inherit)}
:where(#cpb-ext-slot .cpb-switch){display:inline-flex;align-items:center;box-sizing:border-box;width:36px;height:20px;padding:2px;border-radius:999px;border:1px solid transparent;background:hsl(var(--bg-input-80,0 0% 50%/.3))}
:where(#cpb-ext-slot .cpb-switch[data-state=checked]){background:hsl(var(--primary,0 0% 98%))}
:where(#cpb-ext-slot .cpb-thumb){display:block;width:16px;height:16px;border-radius:999px;background:hsl(var(--background,0 0% 4%))}
:where(#cpb-ext-slot .cpb-thumb[data-state=checked]){transform:translateX(15px)}
#cpb-ext-slot .cpb-step{display:inline-flex;align-items:center;gap:2px}
#cpb-ext-slot .cpb-step-btn{display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:6px;background:transparent;color:inherit;font-size:15px;line-height:1;cursor:pointer}
#cpb-ext-slot .cpb-step-btn:hover:not(:disabled){background:var(--state_hover,rgba(128,128,128,.14))}
#cpb-ext-slot .cpb-step-btn:disabled{opacity:.35;cursor:default}
#cpb-ext-slot .cpb-step-val{min-width:34px;text-align:center;font-size:13px;font-variant-numeric:tabular-nums;color:var(--text_secondary,inherit)}
html[data-cpb] #cpb-ext-slot .cpb-spacer{height:14px}
html[data-cpb] #cpb-ext-slot .cpb-row.cpb-subrow{padding-top:9px;padding-bottom:9px}

/* 성능: 화면 밖 메시지 그룹은 그리기를 건너뛴다(최신 3칸·마우스·포커스가 있는 그룹 제외).
   contain-intrinsic-size는 늘 걸어 두어 그룹이 실제 크기로 그려질 때마다 브라우저가 그 높이를 기억하게 하고,
   건너뛰기(html[data-cpb-rs])는 목록이 한 번 다 그려진 뒤에 켠다 → 건너뛰어도 높이가 그대로라 스크롤이 튀지 않는다 */
html[data-cpb] .flex-col-reverse>[data-message-group-id]{contain-intrinsic-size:auto 600px}
html[data-cpb-rs] .flex-col-reverse>[data-message-group-id]:not(:nth-child(-n+3)):not(:hover):not(:focus-within){content-visibility:auto}
/* 입력창: 글자수(전송 버튼 바로 위 가운데. 전송 버튼은 상자 오른쪽 10px·아래 12px, 25px)와 펼치기 버튼(상자 오른쪽 위).
   가운데 맞춤은 translate 속성으로 해서 흔들기(transform)와 겹치지 않게 한다 */
[data-cpb-cbox]{position:relative}
#cpb-icnt{position:absolute;right:22px;bottom:41px;translate:50% 0;white-space:nowrap;z-index:2;pointer-events:none;font-size:11px;line-height:14px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--cpb-icnt-c,var(--text_tertiary,#85837d));opacity:.8;transition:color .2s ease,opacity .2s ease}
#cpb-icnt[data-empty]{opacity:.42}
#cpb-icnt[data-over]{opacity:1;font-weight:700}
#cpb-icnt.cpb-shake{animation:cpb-shake .5s ease}
@keyframes cpb-shake{0%,100%{transform:none}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
#cpb-iexp{position:absolute;top:6px;right:8px;z-index:2;display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--icon_tertiary,#85837d);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s ease}
#cpb-iexp[data-show]{opacity:.75;pointer-events:auto}
#cpb-iexp[data-show]:hover{opacity:1;background:var(--state_hover,rgba(128,128,128,.14))}
[data-cpb-cbox][data-cpb-exp] .__chat_input_textarea{max-height:min(82vh,1100px)!important}
@media (prefers-reduced-motion: reduce){#cpb-icnt.cpb-shake{animation:none}#cpb-icnt,#cpb-iexp{transition:none}}

/* 메시지 옆 표시(합본 1.2.0 모양 그대로) */
.cpb-info{display:inline-flex;align-items:center;flex:0 0 auto;width:fit-content;height:24px;margin:0;padding:0 3px;font-size:12px;font-weight:500;line-height:1;white-space:nowrap;color:hsl(var(--line-gray-2,0 0% 55%));font-variant-numeric:tabular-nums;user-select:none;pointer-events:none;align-self:center}
.cpb-info-row{width:100%;flex-basis:100%;text-align:right;pointer-events:none}
.cpb-info-row .cpb-info{height:18px;padding:0;line-height:18px;opacity:.76}
.cpb-cost{display:inline-flex;align-items:center;flex:0 0 auto;gap:3px;color:var(--icon_tertiary,#888);font-size:12px;font-weight:600;line-height:1;opacity:.86;user-select:none;white-space:nowrap}
.cpb-cost svg{flex:0 0 auto;display:block}
.cpb-model{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;flex:0 0 18px;border-radius:5px;overflow:hidden}
.cpb-model img{display:block;width:14px;height:14px;object-fit:cover;border-radius:4px;pointer-events:none}
/* 왼쪽 칸은 space-x-3(12px) 간격이라 우리 배지 뒤만 조금 당긴다(남의 요소는 건드리지 않음) */
.cpb-cost,.cpb-model{margin-right:-5px}/* 확장 기능 메뉴의 모델 줄 아이콘(크랙 공식 이미지) */
#cpb-ext-slot .cpb-ico img{display:block;width:18px;height:18px;border-radius:5px;object-fit:cover}
/* 모델별 통계 카드: 우측 방 메뉴 '나의 크래커' 아래 */
/* 글 시작 위치(--tx: 크랙 제목 글자, --cx: 잔액 아이콘)와 제목 글꼴은 statsAlign이 크랙 칸에서 읽어 맞춘다 */
#cpb-mstats{margin:6px 0 4px;font-size:13px;line-height:1.3;color:var(--text_primary,inherit)}
#cpb-mstats .h{display:flex;align-items:center;gap:8px}
#cpb-mstats .h .t{padding:8px 0 8px var(--tx,16px);font-size:12px;font-weight:600;color:var(--text_tertiary,#85837d)}
#cpb-mstats .bd{padding:0 var(--cx,16px) 6px}
#cpb-mstats .nm b em{margin-left:5px;padding:1px 5px;border-radius:4px;font-style:normal;font-size:10px;font-weight:600;vertical-align:1px;color:var(--text_tertiary,#85837d);background:var(--state_hover,rgba(128,128,128,.14))}
#cpb-mstats .tog{margin-left:auto;margin-right:var(--cx,16px);display:inline-flex;padding:2px;border-radius:999px;background:var(--state_hover,rgba(128,128,128,.12))}
#cpb-mstats .tog button{height:20px;padding:0 9px;border:0;border-radius:999px;background:none;color:var(--text_tertiary,#85837d);font:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:background .2s,color .2s}
#cpb-mstats .tog button[aria-pressed="true"]{background:var(--bg_screen,#fff);color:var(--text_primary,inherit);box-shadow:0 1px 2px rgba(0,0,0,.14)}
#cpb-mstats .big{display:flex;align-items:baseline;gap:4px;margin:6px 0 9px}
#cpb-mstats .big b{font-size:20px;line-height:1;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
#cpb-mstats .big span{font-size:12px;color:var(--text_tertiary,#85837d)}
#cpb-mstats .bar{display:flex;gap:2px;height:8px;margin-bottom:8px}
#cpb-mstats .bar i{display:block;height:100%;border-radius:3px;background:var(--c);transform-origin:left;animation:cpb-seg .7s cubic-bezier(.2,.8,.2,1) both;transition:opacity .2s}
#cpb-mstats .bar i:first-child{border-radius:5px 3px 3px 5px}#cpb-mstats .bar i:last-child{border-radius:3px 5px 5px 3px}#cpb-mstats .bar i:only-child{border-radius:5px}
@keyframes cpb-seg{from{transform:scaleX(0);opacity:0}}
#cpb-mstats[data-hl] .bar i{opacity:.22}#cpb-mstats[data-hl] .bar i.on{opacity:1}
#cpb-mstats .list{display:flex;flex-direction:column;gap:1px;margin:0 -6px}
#cpb-mstats .mr{display:grid;grid-template-columns:20px minmax(0,1fr) auto auto;column-gap:8px;align-items:center;height:34px;padding:0 6px;border-radius:9px;transition:background .15s}
#cpb-mstats .mr:hover{background:color-mix(in srgb,var(--c) 12%,transparent)}
#cpb-mstats .ic{position:relative;width:20px;height:20px}
#cpb-mstats .ic img{display:block;width:20px;height:20px;border-radius:5px;object-fit:cover}
#cpb-mstats .ic::after{content:"";position:absolute;right:-2px;bottom:-2px;width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px var(--bg_screen,#fff)}
#cpb-mstats .nm{min-width:0;display:flex;flex-direction:column;line-height:1.2}
#cpb-mstats .nm b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cpb-mstats .nm small{font-size:11px;color:var(--text_tertiary,#85837d)}
#cpb-mstats .v{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
#cpb-mstats .p{width:34px;font-size:11.5px;color:var(--text_tertiary,#85837d);font-variant-numeric:tabular-nums;text-align:right}
#cpb-mstats .empty{margin-top:4px;font-size:12px;color:var(--text_tertiary,#85837d)}
@media (prefers-reduced-motion: reduce){#cpb-mstats .bar i{animation:none}}
/* 대시보드: 입력창 상자 안 맨 위 두 줄. 오른쪽 36px은 펼치기 버튼 자리 */
#cpb-dash{--ease:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.5,.64,1);display:flex;flex-direction:column;gap:2px;padding:6px 36px 0 8px;color:var(--icon_tertiary,var(--text_tertiary,#85837d));font-size:13px;line-height:1}
#cpb-dash [hidden]{display:none!important}
#cpb-dash .d1,#cpb-dash .d2{display:flex;align-items:center;min-width:0}
#cpb-dash .d1{gap:1px}
#cpb-dash .d2{gap:1px;flex-wrap:wrap;color:var(--text_tertiary,#85837d)}
#cpb-dash .dsep{width:1px;height:14px;margin:0 4px;background:var(--outline_secondary,rgba(128,128,128,.3))}
#cpb-dash .dot{width:1px;height:10px;margin:0 3px;background:currentColor;opacity:.2}
.cpb-db{position:relative;display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:inherit;cursor:pointer;transition:background .15s,color .15s}
.cpb-db:hover,.cpb-db[aria-expanded="true"]{background:var(--state_hover,rgba(128,128,128,.14));color:var(--text_primary,inherit)}
.cpb-db:focus-visible,.cpb-dp:focus-visible{outline:2px solid var(--surface_brand_primary,#ff4432);outline-offset:1px}
.cpb-db svg{width:16px;height:16px;overflow:visible}
.cpb-db[aria-pressed="true"]{color:color-mix(in srgb,var(--surface_brand_primary,#ff4432) 70%,var(--text_tertiary,#85837d))}
.cpb-db::after{content:attr(data-tip);position:absolute;left:50%;top:calc(100% + 5px);translate:-50% -3px;padding:4px 8px;border-radius:6px;background:var(--text_primary,#1a1918);color:var(--bg_screen,#fff);font-size:11.5px;font-weight:600;line-height:1.2;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s,translate .12s;z-index:30}
.cpb-db:hover::after{opacity:1;translate:-50% 0}
.cpb-db[aria-expanded="true"]::after{opacity:0}
.cpb-db.dmodel img{width:14px;height:14px;border-radius:3px;object-fit:cover;transition:transform .35s var(--spring)}
.cpb-db.dmodel:hover img{transform:rotate(-8deg) scale(1.08)}
.cpb-db.dswap svg{grid-area:1/1;transition:transform .45s var(--spring),opacity .25s}
.cpb-db.dswap .s2{opacity:0;transform:rotate(-90deg) scale(.5)}
.cpb-db.dswap.on .s1{opacity:0;transform:rotate(90deg) scale(.5)}
.cpb-db.dswap.on .s2{opacity:1;transform:none}
.cpb-dp{all:unset;position:relative;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 6px 0 5px;border-radius:999px;cursor:pointer;transition:background .15s;white-space:nowrap;font-size:13px}
.cpb-dp:hover{background:var(--state_hover,rgba(128,128,128,.14))}
.cpb-dp svg{width:14px;height:14px;opacity:.8;flex:none;overflow:visible}
.cpb-dp b{display:inline-block;font-weight:500;font-variant-numeric:tabular-nums;color:var(--text_secondary,#61605a);transition:color .6s}
.cpb-dp .u{margin-left:-3px;opacity:.85}
/* 숫자가 바뀌면: 굴러 바뀌고(카운트) 잠깐 진해졌다가 돌아온다 */
.cpb-dp.chg b{color:var(--text_primary,inherit);transition:none}
.cpb-dp.chg svg{animation:cpb-dpop .5s var(--spring)}
@keyframes cpb-dpop{40%{transform:scale(1.25)}}
.cpb-dp .lab{display:none;color:var(--text_tertiary,#85837d)}
.cpb-dp.open .lab{display:inline;animation:cpb-labin .28s var(--ease)}
.cpb-dp.open .lab.more:empty{display:none}
@keyframes cpb-labin{from{opacity:0;transform:translateX(-4px)}}
.cpb-dp.ded{cursor:default}.cpb-dp.ded:hover{background:none}
.cpb-dp.ded svg{width:10px;height:10px}
/* 아이콘 움직임(마우스를 올리면): 아이콘 모양에 맞게 */
#cpb-dash .cpb-anim :is(path,circle,g){transform-box:fill-box;transform-origin:center;transition:transform .45s var(--spring),opacity .3s}
.cpb-db:hover .needle{transform:rotate(225deg)}
.cpb-db:hover .front{transform:translate(1.5px,-1.5px)}
.cpb-db:hover .lines{transform:translateX(1.5px) scaleX(.85)}
.cpb-db:hover .spark{transform:rotate(90deg) scale(1.15)}
.cpb-db:hover .gear{transform:rotate(120deg)}
:is(.cpb-db,.cpb-dp):hover .hands{transform:rotate(-200deg)}
.cpb-db:hover .play{transform:translateX(1.5px) scale(1.1)}
.cpb-db:hover .mount{transform:translateY(-1.5px)}
.cpb-dp:hover .crk{transform:rotate(-18deg) scale(1.08)}
.cpb-db:hover .rays{transform:rotate(45deg)}
.cpb-db:hover .star{transform:scale(1.4) rotate(20deg)}
.cpb-db:hover .page2{transform:translateX(1.5px) rotate(4deg)}
.cpb-db:hover .tail{transform:translate(-1px,1px)}
.cpb-db:hover .drop{transform:translateY(1.5px)}
.cpb-db:hover .lang{transform:translate(1px,-1px) scale(1.06)}
.cpb-db:hover .gem{transform:translateY(-1.5px) scale(1.08)}
#cpb-dash .cpb-anim .hp{transform-origin:left center}
.cpb-db:hover .hp{transform:scaleX(1.66)}
/* 모델 빠른 선택 */
#cpb-mpick{position:fixed;z-index:2147483000;width:max-content;min-width:200px;overflow:auto;padding:6px;border:1px solid var(--outline_secondary,rgba(128,128,128,.25));border-radius:12px;background:var(--bg_screen,#fff);color:var(--text_primary,inherit);box-shadow:0 12px 32px -8px rgba(0,0,0,.28);transform-origin:20% 100%;animation:cpb-popin .22s cubic-bezier(.34,1.5,.64,1)}
@keyframes cpb-popin{from{opacity:0;transform:translateY(6px) scale(.97)}}
#cpb-mpick .ph{margin:4px 8px 6px;font-size:11.5px;font-weight:600;line-height:1.4;color:var(--text_tertiary,#85837d)}
#cpb-mpick .mi{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:8px;padding:6px 10px 6px 8px;border-radius:8px;cursor:pointer}
#cpb-mpick .mi:hover{background:var(--state_hover,rgba(128,128,128,.14))}
#cpb-mpick .mi img{display:block;width:22px;height:22px;border-radius:6px;object-fit:cover}
#cpb-mpick .nm{min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cpb-mpick .nm small{margin-left:5px;font-size:11.5px;font-weight:500;color:var(--text_tertiary,#85837d)}
#cpb-mpick .cr{display:inline-flex;align-items:center;gap:3px;margin-left:10px;font-size:12px;color:var(--text_tertiary,#85837d);font-variant-numeric:tabular-nums}
#cpb-mpick .cr svg{width:12px;height:12px}
#cpb-mpick .mi.cur .nm{color:var(--surface_brand_primary,#ff4432)}
/* 메시지 메뉴의 '복사'(크랙 메뉴 줄 class를 빌리고, Radix가 관리하지 않으니 올렸을 때 색만 직접) */
.cpb-copy{cursor:pointer}
.cpb-copy:hover{background:var(--state_hover,rgba(128,128,128,.14))}
/* 반복 표현 정리 창: 크랙 색 토큰(라이트/다크 자동), 3칸(자주 나온 말 · 고칠 말 · 미리보기) */
#cpb-cl{--ease:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.5,.64,1);--cl-bg:var(--bg_screen,#fff);--cl-sub:var(--surface_tertiary,rgba(128,128,128,.07));--cl-line:var(--outline_tertiary,rgba(128,128,128,.18));--cl-line2:var(--outline_secondary,rgba(128,128,128,.3));--cl-tx:var(--text_primary,#1a1918);--cl-tx2:var(--text_secondary,#61605a);--cl-tx3:var(--text_tertiary,#85837d);--cl-hover:var(--state_hover,rgba(128,128,128,.12));--cl-del:#d93a2b;--cl-del-bg:rgba(217,58,43,.11);--cl-add:#178a4c;--cl-add-bg:rgba(23,138,76,.12);position:fixed;inset:0;z-index:94;display:grid;place-items:center;padding:16px;background:rgba(10,10,10,.42);font-size:13px;line-height:1.5;color:var(--cl-tx)}
body[data-theme=dark] #cpb-cl{--cl-del:#ff7466;--cl-del-bg:rgba(255,116,102,.14);--cl-add:#4fd08a;--cl-add-bg:rgba(79,208,138,.14)}
#cpb-cl .win{width:min(1040px,100%);max-height:min(88vh,860px);display:flex;flex-direction:column;border:1px solid var(--cl-line2);border-radius:16px;background:var(--cl-bg);box-shadow:0 24px 60px -18px rgba(0,0,0,.45);overflow:hidden;animation:cpb-popin .22s var(--spring)}
#cpb-cl button{font-family:inherit}
#cpb-cl :focus-visible{outline:2px solid var(--surface_brand_primary,#ff4432);outline-offset:2px}
#cpb-cl .hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--cl-line)}
#cpb-cl .hd .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--cl-sub);color:var(--cl-tx2)}
#cpb-cl .hd .ic svg{width:18px;height:18px}
#cpb-cl .hd b{font-size:14.5px}
#cpb-cl .hd small{display:block;font-size:11.5px;color:var(--cl-tx3)}
#cpb-cl .x{margin-left:auto;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:none;color:var(--cl-tx3);cursor:pointer}
#cpb-cl .x:hover{background:var(--cl-hover);color:var(--cl-tx)}
#cpb-cl .x svg{width:16px;height:16px}
#cpb-cl .bd{flex:1;min-height:0;display:grid;grid-template-columns:230px minmax(0,1fr) minmax(0,1.3fr)}
#cpb-cl .col{min-width:0;min-height:0;padding:14px 16px;display:flex;flex-direction:column;gap:10px;overflow:auto}
#cpb-cl .col+.col{border-left:1px solid var(--cl-line)}
#cpb-cl .ch{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
#cpb-cl .ch b{font-size:12.5px}
#cpb-cl .ch>span{font-size:11.5px;color:var(--cl-tx3)}
#cpb-cl .inp{display:flex;gap:6px}
#cpb-cl input,#cpb-cl select{height:32px;padding:0 10px;border:1px solid var(--cl-line2);border-radius:8px;background:var(--cl-bg);color:var(--cl-tx);font:inherit;font-size:13px}
#cpb-cl .inp input{flex:1;min-width:0}
#cpb-cl input:focus,#cpb-cl select:focus{outline:none;border-color:var(--cl-tx3)}
#cpb-cl .btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:1px solid var(--cl-line2);border-radius:8px;background:var(--cl-bg);color:var(--cl-tx);font-size:12.5px;font-weight:600;cursor:pointer;transition:background .15s,transform .15s}
#cpb-cl .btn:hover{background:var(--cl-hover)}
#cpb-cl .btn:active{transform:translateY(1px)}
#cpb-cl .btn:disabled{opacity:.45;cursor:default;transform:none}
#cpb-cl .btn.p{border-color:transparent;background:var(--cl-tx);color:var(--cl-bg)}
#cpb-cl .cands{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start}
#cpb-cl .cand{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 6px 0 10px;border:1px solid var(--cl-line2);border-radius:999px;background:var(--cl-bg);color:var(--cl-tx);font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s}
#cpb-cl .cand:hover{background:var(--cl-hover)}
#cpb-cl .cand em{font-style:normal;min-width:20px;height:18px;padding:0 5px;border-radius:999px;background:var(--cl-sub);color:var(--cl-tx3);font-size:11px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums}
#cpb-cl .cand[aria-pressed="true"]{border-color:var(--cl-tx);background:var(--cl-sub)}
#cpb-cl .ghost{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 10px;border:1px dashed var(--cl-line2);border-radius:8px;background:none;color:var(--cl-tx2);font-size:12px;font-weight:600;cursor:pointer}
#cpb-cl .ghost:hover{background:var(--cl-hover)}
#cpb-cl .ghost svg{width:14px;height:14px}
#cpb-cl .empty{display:block;width:100%;padding:20px 10px;border:1px dashed var(--cl-line2);border-radius:10px;text-align:center;color:var(--cl-tx3);font-size:12.5px}
#cpb-cl .rules{display:flex;flex-direction:column;gap:8px}
#cpb-cl .rule{display:grid;gap:7px;padding:10px;border:1px solid var(--cl-line);border-radius:10px;background:var(--cl-sub);animation:cpb-popin .2s var(--spring)}
#cpb-cl .rtop{display:flex;align-items:center;gap:7px}
#cpb-cl .rw{font-weight:700;font-size:13.5px;word-break:break-all}
#cpb-cl .rn{font-size:11.5px;color:var(--cl-tx3);font-variant-numeric:tabular-nums;white-space:nowrap}
#cpb-cl .rx{margin-left:auto;display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:var(--cl-tx3);cursor:pointer}
#cpb-cl .rx:hover{background:var(--cl-hover);color:var(--cl-tx)}
#cpb-cl .rx svg{width:14px;height:14px}
#cpb-cl .rmid{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
#cpb-cl .rmid input{flex:1;min-width:90px;height:28px;font-size:12.5px}
#cpb-cl .rmid select{height:28px;padding:0 6px;font-size:12px}
#cpb-cl .mini{display:inline-flex;padding:2px;border-radius:8px;background:var(--cl-hover)}
#cpb-cl .mini button{height:24px;padding:0 9px;border:0;border-radius:6px;background:none;color:var(--cl-tx3);font-size:11.5px;font-weight:700;cursor:pointer}
#cpb-cl .mini button[aria-pressed="true"]{background:var(--cl-bg);color:var(--cl-tx);box-shadow:0 1px 2px rgba(0,0,0,.14)}
#cpb-cl .tabs{display:inline-flex;gap:14px;border-bottom:1px solid var(--cl-line)}
#cpb-cl .tabs button{height:30px;padding:0 1px;border:0;border-bottom:2px solid transparent;background:none;color:var(--cl-tx3);font-size:12.5px;font-weight:700;cursor:pointer}
#cpb-cl .tabs button[aria-selected="true"]{color:var(--cl-tx);border-bottom-color:var(--cl-tx)}
#cpb-cl .prev{flex:1;min-height:160px;overflow:auto;padding:12px 14px;border:1px solid var(--cl-line);border-radius:10px;background:var(--cl-sub);font-size:13.5px;line-height:1.85;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
#cpb-cl .prev mark{padding:0 1px;border-radius:3px;color:inherit;cursor:pointer;transition:opacity .15s,background .15s}
#cpb-cl .prev mark.d{background:var(--cl-del-bg);box-shadow:inset 0 -1.5px 0 var(--cl-del);text-decoration:line-through;text-decoration-color:var(--cl-del)}
#cpb-cl .prev mark.r{background:var(--cl-del-bg);box-shadow:inset 0 -1.5px 0 var(--cl-del)}
#cpb-cl .prev mark.r::after{content:"→" attr(data-to);margin-left:2px;padding:0 3px;border-radius:3px;background:var(--cl-add-bg);color:var(--cl-add);font-weight:700}
#cpb-cl .prev mark.off{opacity:.45;background:none;box-shadow:inset 0 -1px 0 var(--cl-line2);text-decoration:none}
#cpb-cl .prev mark.off::after{content:none}
#cpb-cl .prev ins{text-decoration:none;padding:0 1px;border-radius:3px;background:var(--cl-add-bg);color:var(--cl-add);font-weight:600}
#cpb-cl .legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11.5px;color:var(--cl-tx3)}
#cpb-cl .legend i{display:inline-block;width:10px;height:10px;margin-right:4px;border-radius:3px;vertical-align:-1px}
#cpb-cl .lg-d{background:var(--cl-del-bg);box-shadow:inset 0 -1.5px 0 var(--cl-del)}
#cpb-cl .lg-r{background:var(--cl-add-bg)}
#cpb-cl .lg-o{background:var(--cl-hover)}
#cpb-cl .ft{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--cl-line);background:var(--cl-sub)}
#cpb-cl .note{margin-right:auto;font-size:12px;color:var(--cl-tx3)}
#cpb-cl .sum{font-size:12px;color:var(--cl-tx2);font-variant-numeric:tabular-nums}
@media (max-width:900px){#cpb-cl .bd{grid-template-columns:1fr;overflow:auto}#cpb-cl .col{overflow:visible}#cpb-cl .col+.col{border-left:0;border-top:1px solid var(--cl-line)}}
@media (prefers-reduced-motion: reduce){#cpb-cl *,#cpb-cl .win{animation:none!important;transition:none!important}}
.cpb-clean{cursor:pointer}
.cpb-clean:hover{background:var(--state_hover,rgba(128,128,128,.14))}
.cpb-clbtn svg{width:14px;height:14px;flex:none}
/* 길게 눌러 다시 생성: 누른 자리에 고리가 0.5초 동안 차오른다 */
#cpb-hold{position:fixed;z-index:2147483000;width:44px;height:44px;margin:-22px 0 0 -22px;pointer-events:none;color:var(--text_primary,#1a1918);opacity:0;transform:scale(.7);transition:opacity .12s,transform .2s cubic-bezier(.34,1.5,.64,1)}
#cpb-hold.go{opacity:1;transform:none}
#cpb-hold svg{width:44px;height:44px;overflow:visible}
#cpb-hold .bg{fill:var(--bg_screen,#fff);stroke:var(--outline_secondary,rgba(128,128,128,.3));stroke-width:3;filter:drop-shadow(0 4px 10px rgba(0,0,0,.18))}
#cpb-hold .fg{fill:none;stroke:var(--surface_brand_primary,#ff4432);stroke-width:3;stroke-linecap:round;stroke-dasharray:113.1;stroke-dashoffset:113.1;transform:rotate(-90deg);transform-origin:22px 22px}
#cpb-hold.go .fg{animation:cpb-holdfill .5s linear forwards}
#cpb-hold .ic{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
@keyframes cpb-holdfill{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion: reduce){#cpb-hold,#cpb-hold .fg{transition:none;animation-duration:.01s}}
/* 라디오존데: 원래 라디오존데(4.4.0) 한 줄 모양에 글자 위계만 다듬은 B안 — 입력창 바로 위(아이콘 · 상태 점 · 약자 · 점수 · 응답 시간 · 갱신).
   항목 안은 촘촘하게, 항목 사이는 넓게 + 가는 세로선. 숫자 폭 고정. 점수 > 이름 > 응답 시간 순으로 진하게. 장애는 점에 옅은 테, 값 없음은 속 빈 점. 지금 방 모델은 이름 밑줄.
   이름은 원래 것(#igx-live-popup · #igx-live-head · .bitem · .igx-btn · .inline-icon)이라 배경 테마(SGB)의 라디오존데 스킨이 그대로 입혀진다. 그래서 여기 값은 !important 없이 둔다 */
.cpb-rs{--ok:#3ddc84;--warn:#ffd54a;--bad:#ff5c5c;--unk:#9aa0a6;--bad-ring:rgba(255,92,92,.28);--fg:rgba(255,255,255,.88);--hair:rgba(255,255,255,.16);--cur-line:rgba(255,255,255,.55);--hov-bg:rgba(255,255,255,.12);--hov-bd:rgba(255,255,255,.14);position:relative;width:100%;margin:0 0 4px;padding:0;font-family:inherit;font-size:11px;line-height:1;color:var(--fg);box-sizing:border-box;flex-shrink:0;user-select:none}
body:not([data-theme=dark]) .cpb-rs{--ok:#1da851;--warn:#d49500;--bad:#e03535;--unk:#7b8086;--bad-ring:rgba(224,53,53,.22);--fg:rgba(0,0,0,.85);--hair:rgba(0,0,0,.14);--cur-line:rgba(0,0,0,.45);--hov-bg:rgba(0,0,0,.06);--hov-bd:rgba(0,0,0,.10)}
.cpb-rs .hd{display:flex;align-items:center;justify-content:space-between;height:20px;padding:0 4px;gap:6px;box-sizing:border-box}
.cpb-rs .lf{display:flex;align-items:center;gap:7px;flex:1;min-width:0;overflow:hidden}
.cpb-rs .inline-icon{display:block;width:13px;height:13px;flex:none;margin:0;opacity:.5;color:var(--fg)}
.cpb-rs .inline-icon svg{display:block;width:100%;height:100%}
/* 끝 흐림(마스크)은 쓰지 않는다: 마스크를 씌우면 크롬이 그 줄을 따로 그려 윈도우에서 글씨가 선명하게(ClearType) 안 그려지고 뿌옇게 보인다 */
.cpb-rs .bar{display:flex;align-items:center;gap:11px;flex:1;min-width:0;height:20px;white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.cpb-rs .bar::-webkit-scrollbar{display:none}
.cpb-rs .bitem{position:relative;display:inline-flex;align-items:baseline;flex:none;padding:1px 2px;border-radius:5px}
.cpb-rs .bitem+.bitem::before{content:"";position:absolute;left:-6px;top:50%;width:1px;height:10px;margin-top:-5px;background:var(--hair);pointer-events:none}
.cpb-rs .bdot{align-self:center;flex:none;width:6px;height:6px;border-radius:999px;margin-right:4px;background:var(--st)}
.cpb-rs .bname{font-weight:600;letter-spacing:.01em;line-height:1;opacity:.92;margin-right:5px;transition:opacity .15s ease}
.cpb-rs .bscore{min-width:2ch;margin-right:4px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;text-align:right;color:var(--st)}
.cpb-rs .blat{font-size:10px;font-weight:500;line-height:1;font-variant-numeric:tabular-nums;opacity:.75}
.cpb-rs .bunit{margin-left:.5px;font-size:9px;opacity:.8}
.cpb-rs .st-active{--st:var(--ok)}.cpb-rs .st-degraded{--st:var(--warn)}.cpb-rs .st-impacted{--st:var(--bad)}.cpb-rs .st-unknown{--st:var(--unk)}
.cpb-rs .st-impacted .bdot{box-shadow:0 0 0 2px var(--bad-ring)}
.cpb-rs .st-impacted .bname{opacity:.95}
.cpb-rs .st-unknown .bdot{background:transparent;box-shadow:inset 0 0 0 1.5px var(--unk)}
.cpb-rs .st-unknown .bname{opacity:.5}
.cpb-rs .st-unknown .bscore{font-weight:600}
.cpb-rs .bitem:hover .bname{opacity:1}
.cpb-rs .none{opacity:.6;padding:0 4px}
.cpb-rs .acts{display:flex;align-items:center;flex:none}
.cpb-rs .igx-btn{display:inline-grid;place-items:center;width:18px;height:18px;padding:0;border-radius:7px;border:1px solid transparent;background:transparent;color:inherit;opacity:.55;cursor:pointer;box-sizing:border-box;transition:opacity .15s ease,background-color .15s ease,border-color .15s ease}
.cpb-rs .igx-btn svg{display:block;width:12px;height:12px}
.cpb-rs .igx-btn:hover{opacity:1;background:var(--hov-bg);border-color:var(--hov-bd)}
.cpb-rs .igx-btn:focus-visible{outline:1.5px solid var(--fg);outline-offset:1px;opacity:1}
.cpb-rs .igx-btn:disabled{opacity:.3;cursor:default;background:transparent;border-color:transparent}
/* 움직임은 값이 바뀔 때 한 번만: 점수 톡(.chg) · 상태 점 톡(.bchg) · 새 값 받으면 맥박이 왼쪽부터 한 번 그려짐(.beat) */
.cpb-rs .bitem.chg .bscore{animation:cpb-rs-pop .6s cubic-bezier(.34,1.5,.64,1)}
@keyframes cpb-rs-pop{40%{transform:scale(1.22)}}
.cpb-rs .bitem.bchg .bdot{animation:cpb-rs-pop2 .7s cubic-bezier(.34,1.5,.64,1)}
@keyframes cpb-rs-pop2{40%{transform:scale(1.8)}}
.cpb-rs .inline-icon path{stroke-dasharray:1;stroke-dashoffset:0}
.cpb-rs .inline-icon.beat{animation:cpb-rs-glow 1.1s ease}
.cpb-rs .inline-icon.beat path{animation:cpb-rs-trace .9s cubic-bezier(.4,0,.2,1)}
@keyframes cpb-rs-glow{30%{opacity:1}}
@keyframes cpb-rs-trace{from{stroke-dashoffset:1}}
@media (prefers-reduced-motion:reduce){.cpb-rs,.cpb-rs *{transition:none!important;animation:none!important}}
/* 안전 삭제: 메뉴 항목 · 확인 창 · 고르기 모드(고른 메시지 테두리) · 입력창 위 막대 */
.cpb-mi{cursor:pointer}
.cpb-mi:hover{background:var(--state_hover,rgba(128,128,128,.14))}
.cpb-mdel,.cpb-vdel{color:var(--text_danger,#d93a2b)}
#cpb-dm{--dm-bg:var(--bg_screen,#fff);--dm-sub:var(--surface_tertiary,rgba(128,128,128,.07));--dm-line:var(--outline_tertiary,rgba(128,128,128,.18));--dm-line2:var(--outline_secondary,rgba(128,128,128,.3));--dm-tx:var(--text_primary,#1a1918);--dm-tx3:var(--text_tertiary,#85837d);--dm-hover:var(--state_hover,rgba(128,128,128,.12));--dm-red:#d93a2b;position:fixed;inset:0;z-index:94;display:grid;place-items:center;padding:16px;background:rgba(10,10,10,.42);font-size:13px;line-height:1.5;color:var(--dm-tx)}
body[data-theme=dark] #cpb-dm{--dm-red:#ff6a5c}
#cpb-dm .win{width:min(560px,100%);max-height:min(80vh,720px);display:flex;flex-direction:column;border:1px solid var(--dm-line2);border-radius:16px;background:var(--dm-bg);box-shadow:0 24px 60px -18px rgba(0,0,0,.45);overflow:hidden;animation:cpb-popin .22s cubic-bezier(.34,1.5,.64,1)}
#cpb-dm .hd{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dm-line)}
#cpb-dm .hd .ic{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:color-mix(in srgb,var(--dm-red) 12%,transparent);color:var(--dm-red)}
#cpb-dm .hd .ic svg{width:18px;height:18px}
#cpb-dm .hd b{font-size:14.5px}
#cpb-dm .hd small{display:block;font-size:11.5px;color:var(--dm-tx3)}
#cpb-dm .x{margin-left:auto;display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:none;color:var(--dm-tx3);cursor:pointer}
#cpb-dm .x:hover{background:var(--dm-hover);color:var(--dm-tx)}
#cpb-dm .x svg{width:16px;height:16px}
#cpb-dm .bd{flex:1;min-height:0;overflow:auto;padding:12px 16px}
#cpb-dm .list{display:flex;flex-direction:column;gap:6px}
#cpb-dm .row{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid var(--dm-line);border-radius:10px;background:var(--dm-sub);cursor:default}
#cpb-dm label.row{cursor:pointer}
#cpb-dm label.row:hover{border-color:var(--dm-line2)}
#cpb-dm .row:has(input:checked){border-color:var(--dm-red);background:color-mix(in srgb,var(--dm-red) 7%,transparent)}
#cpb-dm .row.vis{opacity:.6;cursor:default}
#cpb-dm .row input{width:16px;height:16px;margin:0;accent-color:var(--dm-red);flex:none}
#cpb-dm .no,#cpb-dm .who{flex:none;min-width:22px;height:20px;padding:0 6px;border-radius:999px;background:var(--dm-hover);font-size:11px;font-weight:700;display:grid;place-items:center;color:var(--dm-tx3)}
#cpb-dm .who.me{color:var(--dm-tx)}
#cpb-dm .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#cpb-dm em{flex:none;font-style:normal;font-size:11px;font-weight:600;color:var(--dm-tx3)}
#cpb-dm .row small{flex:none;font-size:11px;color:var(--dm-tx3);font-variant-numeric:tabular-nums}
#cpb-dm .ft{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--dm-line);background:var(--dm-sub)}
#cpb-dm .note{margin-right:auto;font-size:12px;color:var(--dm-tx3)}
#cpb-dm .btn,#cpb-delbar .btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 13px;border:1px solid var(--outline_secondary,rgba(128,128,128,.3));border-radius:8px;background:var(--bg_screen,#fff);color:var(--text_primary,#1a1918);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
#cpb-dm .btn:hover,#cpb-delbar .btn:hover{background:var(--state_hover,rgba(128,128,128,.12))}
#cpb-dm .btn.danger,#cpb-delbar .btn.danger{border-color:transparent;background:#d93a2b;color:#fff}
#cpb-dm .btn:disabled,#cpb-delbar .btn:disabled{opacity:.45;cursor:default}
#cpb-delbar .btn svg{width:15px;height:15px}
#cpb-delbar{position:fixed;z-index:93;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 32px);padding:8px 8px 8px 12px;border:1px solid var(--outline_secondary,rgba(128,128,128,.3));border-radius:14px;background:var(--bg_screen,#fff);box-shadow:0 14px 34px -12px rgba(0,0,0,.35);color:var(--text_primary,#1a1918);font-size:12.5px;animation:cpb-popin .2s cubic-bezier(.34,1.5,.64,1)}
#cpb-delbar .ic{display:grid;place-items:center;color:#d93a2b}
#cpb-delbar .ic svg{width:18px;height:18px}
#cpb-delbar .tx{margin-right:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html[data-cpb-delsel] .flex-col-reverse > [data-message-group-id]{cursor:pointer;border-radius:12px;transition:box-shadow .15s,background .15s}
html[data-cpb-delsel] .flex-col-reverse > [data-message-group-id]:hover{box-shadow:0 0 0 2px var(--outline_secondary,rgba(128,128,128,.4))}
.flex-col-reverse > [data-message-group-id][data-cpb-del]{box-shadow:0 0 0 2px #d93a2b!important;background:rgba(217,58,43,.06)}
@media (prefers-reduced-motion: reduce){#cpb-dm .win,#cpb-delbar{animation:none}}
/* 답변 비교 좌우 넘기기: 답변 바깥 여백의 작은 화살표 버튼(누를 수 있는 건 이 버튼뿐) */
.cpb-cmp{position:fixed;z-index:60;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid var(--outline_secondary,rgba(128,128,128,.3));border-radius:50%;background:var(--bg_screen,#fff);color:var(--text_secondary,#61605a);box-shadow:0 4px 14px -4px rgba(0,0,0,.25);cursor:pointer;opacity:0;transition:background .15s,color .15s,opacity .12s linear}
.cpb-cmp:hover:not(:disabled){background:var(--state_hover,rgba(128,128,128,.14));color:var(--text_primary,#1a1918)}
.cpb-cmp:disabled{cursor:default}
.cpb-cmp svg{width:16px;height:16px}
@media (prefers-reduced-motion: reduce){.cpb-cmp{transition:none}}
/* 재생성 지침 창 건너뛰기 대행 중에는 그 창(입력칸 placeholder로 식별)과 뒤 배경을 보이지 않게 */
html[data-cpb-reroll] main:has(> [role="dialog"] textarea[placeholder="원하는 답변 방향을 입력할 수 있어요"]) > :is([role="dialog"],.fixed.inset-0){opacity:0!important;pointer-events:none!important}
/* 모델 바꾸기 대행 중에는 크랙 모델 선택창을 보이지 않게 */
html[data-cpb-proxy] [data-radix-popper-content-wrapper]{opacity:0!important;pointer-events:none!important}
@media (prefers-reduced-motion: reduce){#cpb-dash *,#cpb-dash *::after,#cpb-mpick,#cpb-mpick *{animation:none!important;transition:none!important}}
/* 빈 입력 전송 막기: 막힌 전송 버튼은 흐리게. 엔딩 힌트 버튼과 그 알림 점 숨기기 */
[data-cpb-blocked]:has(path[d^="M18.77"]){opacity:.5!important;cursor:not-allowed!important;filter:grayscale(.22)!important}
[data-cpb-blocked]:has(path[d^="M18.77"]) svg{pointer-events:none!important}
html[data-cpb-nohint] :is(button[aria-label="엔딩 힌트"],span.absolute.top-0.right-0.size-2.rounded-full.bg-surface_brand_primary){display:none!important}
/* 감싸기 도구: 합본 1.2.0 감싸기 화면 그대로(무채색 토큰, 등장·말풍선·스위치·체크 움직임) */
#cpb-wrap-bar,#cpb-wrap-win{--r-pan:16px;--r-ctl:10px;--ease:cubic-bezier(.2,.8,.2,1);--spring:cubic-bezier(.34,1.5,.64,1)}
#cpb-wrap-bar[data-theme=dark],#cpb-wrap-win[data-theme=dark]{--sf:#1c1c1e;--sf2:#232325;--sf3:#161617;--ln:rgba(255,255,255,.09);--ln2:rgba(255,255,255,.18);--tx:#ededee;--mu:#9d9da3;--fa:#68686e;--ac:#ededee;--ac-fg:#1c1c1e;--ac-soft:rgba(255,255,255,.09);--kn-on:#2a2a2d;--bad:#ee8a8a;--sw-off:rgba(255,255,255,.17);--sh:0 22px 50px -10px rgba(4,5,14,.7)}
#cpb-wrap-bar[data-theme=light],#cpb-wrap-win[data-theme=light]{--sf:#fff;--sf2:#f7f7f8;--sf3:#f0f0f2;--ln:rgba(0,0,0,.09);--ln2:rgba(0,0,0,.18);--tx:#1d1d1f;--mu:#6b6b70;--fa:#a0a0a6;--ac:#1d1d1f;--ac-fg:#fff;--ac-soft:rgba(0,0,0,.06);--kn-on:#fff;--bad:#c4545a;--sw-off:rgba(0,0,0,.14);--sh:0 22px 50px -14px rgba(0,0,0,.22),0 1px 3px rgba(0,0,0,.06)}
#cpb-wrap-win *,#cpb-wrap-win *::before,#cpb-wrap-win *::after,#cpb-wrap-bar *{box-sizing:border-box}
#cpb-wrap-win button,#cpb-wrap-win input,#cpb-wrap-bar button{font-family:inherit;letter-spacing:inherit;margin:0}
.cpbw-si{display:block;flex:0 0 auto;overflow:visible}
.cpbw-si :is(path,rect,circle){fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transform-box:fill-box;transform-origin:center;transition:transform .5s cubic-bezier(.34,1.5,.64,1),opacity .3s}
.cpbw-si g{transform-box:fill-box;transform-origin:center;transition:transform .5s cubic-bezier(.34,1.5,.64,1),opacity .3s}
.cpbw-si .fl{fill:currentColor;stroke:none}
/* 드래그 팝업 */
#cpb-wrap-bar{position:fixed;left:0;top:0;display:none;align-items:center;gap:2px;padding:4px;border:1px solid var(--ln2);border-radius:999px;background:var(--sf);color:var(--tx);box-shadow:var(--sh);z-index:2147483643;transform-origin:50% 100%;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif}
#cpb-wrap-bar[data-show]{display:flex;animation:cpbw-bar-in .26s var(--spring) both}
@keyframes cpbw-bar-in{from{opacity:0;transform:translateY(6px) scale(.94)}}
.cpbw-sel-btn{position:relative;min-width:32px;height:30px;padding:0 8px;border:0;border-radius:999px;background:none;color:var(--tx);font:700 15px/1 'Noto Serif KR','Apple SD Gothic Neo',serif;white-space:nowrap;cursor:pointer;transition:background .12s,transform .12s;animation:cpbw-btn-in .3s var(--ease) both;animation-delay:calc(var(--k,0) * 22ms)}
@keyframes cpbw-btn-in{from{opacity:0;transform:translateY(3px)}}
.cpbw-sel-btn.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px}
.cpbw-sel-btn:hover,.cpbw-sel-btn.hit{background:var(--ac-soft)}
.cpbw-sel-btn:active,.cpbw-sel-btn.hit{transform:scale(.9)}
#cpb-wrap-bar .cpbw-sel-btn::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 9px);transform:translate(-50%,3px);padding:5px 8px;border-radius:7px;background:var(--tx);color:var(--sf);font:600 11.5px/1.2 Pretendard,-apple-system,sans-serif;white-space:pre;opacity:0;pointer-events:none;transition:opacity .12s,transform .12s}
#cpb-wrap-bar .cpbw-sel-btn:hover::after{opacity:1;transform:translate(-50%,0)}
.cpbw-sel-sep{width:1px;height:18px;margin:0 3px;background:var(--ln2)}
.cpbw-sel-gear{width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:none;color:var(--mu);cursor:pointer}
.cpbw-sel-gear:hover{background:var(--ac-soft);color:var(--tx)}
.cpbw-sel-gear:hover .cpbw-si-tune .k1{transform:translateX(-4px)}
.cpbw-sel-gear:hover .cpbw-si-tune .k2{transform:translateX(4px)}
/* 설정 창 */
#cpb-wrap-win{position:fixed;z-index:2147483647;left:50%;top:min(12vh,96px);transform:translateX(-50%);width:540px;max-width:calc(100vw - 16px);max-height:min(600px,calc(100vh - min(12vh,96px) - 16px));display:flex;flex-direction:column;overflow:hidden;background:var(--sf);color:var(--tx);border:1px solid var(--ln);border-radius:var(--r-pan);box-shadow:var(--sh);font:14px/1.4 Pretendard,-apple-system,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-align:left;animation:cpbw-win-in .3s var(--ease) backwards}
#cpb-wrap-win[data-moved]{transform:none;max-height:calc(100vh - 16px)}
#cpb-wrap-win.closing{animation:cpbw-win-out .18s ease-in forwards}
@keyframes cpbw-win-in{from{opacity:0;transform:translate(-50%,-8px) scale(.98)}}
@keyframes cpbw-win-out{to{opacity:0;transform:translate(-50%,-6px) scale(.985)}}
#cpb-wrap-win .grow{flex:1 1 auto;min-width:0}
#cpb-wrap-win .ph{display:flex;align-items:center;gap:8px;padding:12px 12px 12px 14px;cursor:grab;user-select:none}
#cpb-wrap-win .ph:active{cursor:grabbing}
#cpb-wrap-win .pt{font-size:14.5px;font-weight:750;letter-spacing:-.025em}
#cpb-wrap-win .ph small{font-size:12px;color:var(--mu);margin-left:2px}
#cpb-wrap-win .logo{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:var(--ac-soft);color:var(--ac)}
#cpb-wrap-win .dirtyb{height:20px;padding:0 8px;display:inline-flex;align-items:center;border-radius:999px;background:var(--ac-soft);color:var(--tx);font-size:11px;font-weight:700;animation:cpbw-btn-in .25s var(--ease) both}
#cpb-wrap-win .ib{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;padding:0;border:1px solid var(--ln);border-radius:8px;background:transparent;color:var(--mu);cursor:pointer;transition:color .15s,background .15s,transform .2s}
#cpb-wrap-win .ib:hover{color:var(--tx);background:var(--sf3)}
#cpb-wrap-win .ib:active{transform:scale(.9)}
#cpb-wrap-win .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:1px solid var(--ln2);border-radius:8px;background:transparent;color:var(--tx);font-size:12px;font-weight:650;white-space:nowrap;cursor:pointer;transition:background .15s,transform .12s}
#cpb-wrap-win .btn:hover{background:var(--sf3)}
#cpb-wrap-win .btn:active{transform:scale(.96)}
#cpb-wrap-win .btn.pri{background:var(--ac);border-color:transparent;color:var(--ac-fg)}
#cpb-wrap-win .btn:disabled{opacity:.4;cursor:default;transform:none}
#cpb-wrap-win :is(.btn,.ib,.cpbw-opt,.cpbw-sw,.del):focus-visible{outline:2px solid var(--ac);outline-offset:2px}
#cpb-wrap-win .opts{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;padding:0 12px 10px}
#cpb-wrap-win .cpbw-opt{display:flex;align-items:center;gap:8px;height:40px;padding:0 10px 0 8px;border:1px solid var(--ln);border-radius:var(--r-ctl);background:var(--sf2);color:var(--mu);font-size:12.5px;font-weight:650;text-align:left;cursor:pointer;transition:background .2s,border-color .2s,color .2s}
#cpb-wrap-win .cpbw-opt:hover{border-color:var(--ln2)}
#cpb-wrap-win .cpbw-opt .ri{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border-radius:7px;background:var(--sf3);transition:background .3s,color .3s}
#cpb-wrap-win .cpbw-opt .ck{margin-left:auto;width:16px;height:16px;flex:0 0 16px;display:grid;place-items:center;border:1px solid var(--ln2);border-radius:5px;transition:background .2s,border-color .2s}
#cpb-wrap-win .cpbw-opt .ck svg{width:11px;height:11px;fill:none;stroke:var(--ac-fg);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:14;stroke-dashoffset:14;transition:stroke-dashoffset .3s .08s var(--ease)}
#cpb-wrap-win .cpbw-opt.on{color:var(--tx);border-color:var(--ln2);background:var(--sf)}
#cpb-wrap-win .cpbw-opt.on .ri{background:var(--ac-soft);color:var(--tx)}
#cpb-wrap-win .cpbw-opt.on .ck{background:var(--ac);border-color:var(--ac)}
#cpb-wrap-win .cpbw-opt.on .ck svg{stroke-dashoffset:0}
#cpb-wrap-win .cpbw-si-selpop .pill,#cpb-wrap-win .cpbw-si-resel .hl2{opacity:0;transform:scale(.3)}
#cpb-wrap-win .on .cpbw-si-selpop .pill{opacity:1;transform:none}
#cpb-wrap-win .on .cpbw-si-resel .hl2{opacity:.35;transform:none}
#cpb-wrap-win .lh,#cpb-wrap-win .cpbw-row{display:grid;grid-template-columns:18px 38px 46px minmax(0,1fr) 58px 58px 58px 28px;gap:6px;align-items:center}
#cpb-wrap-win .lh{padding:0 21px 6px;font-size:11px;font-weight:700;color:var(--fa)}
#cpb-wrap-win .lh span:nth-child(7){text-align:center}
#cpb-wrap-win .wl{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 12px 10px;display:flex;flex-direction:column;gap:5px;scrollbar-width:thin;overscroll-behavior:contain}
#cpb-wrap-win .cpbw-row{padding:6px 8px;border:1px solid var(--ln);border-radius:var(--r-ctl);background:var(--sf2);transition:opacity .25s,box-shadow .2s,background .2s}
#cpb-wrap-win .cpbw-row.off{opacity:.5}
#cpb-wrap-win .cpbw-row.drag{position:relative;z-index:2;background:var(--sf);box-shadow:0 10px 24px -8px rgba(0,0,0,.4),0 0 0 1px var(--ln2);transform:scale(1.015)}
#cpb-wrap-win .cpbw-row.new{animation:cpbw-new-row .6s var(--ease) both}
@keyframes cpbw-new-row{from{opacity:0;transform:translateY(8px)}40%{background:var(--ac-soft)}}
#cpb-wrap-win .grip{width:18px;height:28px;display:grid;place-items:center;color:var(--fa);cursor:grab;touch-action:none}
#cpb-wrap-win .grip:hover{color:var(--tx)}
#cpb-wrap-win .wl.dragging,#cpb-wrap-win .wl.dragging *{cursor:grabbing!important}
#cpb-wrap-win .cpbw-row input{width:100%;min-width:0;height:30px;padding:0 8px;border:1px solid var(--ln);border-radius:7px;background:var(--sf);color:var(--tx);font-size:12.5px;outline:0;transition:border-color .15s,box-shadow .15s}
#cpb-wrap-win .cpbw-row input:focus{border-color:var(--ln2);box-shadow:0 0 0 3px var(--ac-soft)}
#cpb-wrap-win .cpbw-row input.icn{text-align:center;padding:0 2px;font-family:'Noto Serif KR',serif;font-size:14px;font-weight:700}
#cpb-wrap-win .cpbw-row input.mono{text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
#cpb-wrap-win .kbd{height:24px;display:grid;place-items:center;border:1px solid var(--ln);border-bottom-width:2px;border-radius:6px;background:var(--sf);color:var(--mu);font:700 10.5px/1 ui-monospace,Menlo,monospace;white-space:nowrap}
#cpb-wrap-win .kbd.no{border-style:dashed;border-bottom-width:1px;color:var(--fa)}
#cpb-wrap-win .del{width:28px;height:28px;display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:none;color:var(--fa);cursor:pointer}
#cpb-wrap-win .del:hover{background:color-mix(in srgb,var(--bad) 12%,transparent);color:var(--bad)}
#cpb-wrap-win .cpbw-sw{position:relative;width:34px;height:20px;padding:0;border:0;border-radius:999px;background:var(--sw-off);cursor:pointer;transition:background .3s}
#cpb-wrap-win .cpbw-sw .kn{position:absolute;top:2px;left:2px;width:16px;height:16px;display:grid;place-items:center;border-radius:999px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);transition:transform .45s var(--spring),background .3s}
#cpb-wrap-win .cpbw-sw .kn svg{width:100%;height:100%;overflow:visible}
#cpb-wrap-win .cpbw-sw .ck{fill:none;stroke:var(--ac);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:11;stroke-dashoffset:11;transition:stroke-dashoffset .3s .14s}
#cpb-wrap-win .cpbw-sw[aria-checked=true]{background:var(--ac)}
#cpb-wrap-win .cpbw-sw[aria-checked=true] .kn{transform:translateX(14px);background:var(--kn-on)}
#cpb-wrap-win .cpbw-sw[aria-checked=true] .ck{stroke-dashoffset:0}
@keyframes cpbw-sqR{35%{width:21px}}
@keyframes cpbw-sqL{35%{width:21px;margin-left:-5px}}
#cpb-wrap-win .cpbw-sw.flip[aria-checked=true] .kn{animation:cpbw-sqR .45s var(--ease)}
#cpb-wrap-win .cpbw-sw.flip[aria-checked=false] .kn{animation:cpbw-sqL .45s var(--ease)}
#cpb-wrap-win .cf{display:flex;align-items:center;gap:8px;padding:10px 12px 12px;border-top:1px solid var(--ln)}
#cpb-wrap-win .note2{font-size:11.5px;color:var(--fa)}
@media (prefers-reduced-motion: reduce){#cpb-wrap-bar,#cpb-wrap-bar *,#cpb-wrap-win,#cpb-wrap-win *{animation-duration:1ms!important;transition-duration:1ms!important}}
@media (max-width: 640px){#cpb-wrap-bar{max-width:calc(100vw - 16px);overflow-x:auto}#cpb-wrap-win .opts{grid-template-columns:1fr}#cpb-wrap-win .lh{display:none}#cpb-wrap-win .cpbw-row{grid-template-columns:18px 38px 46px minmax(0,1fr) 28px;row-gap:6px}#cpb-wrap-win .cpbw-row input.mono{grid-column:span 2}#cpb-wrap-win .note2{display:none}}
/* 알림(토스트) 스타일은 사이트 전역 스타일(SITE_CSS)에 있다 */
/* 오래된 대화 숨기기: 지우지 않고 화면에서만 뺀다 */
html[data-cpb] .flex-col-reverse>[data-message-group-id][data-cpb-fold]{display:none!important}
`;

  // ── 공개 API ──────────────────────────────────────────
  const api = {
    version: VERSION,
    get page() { return page; },
    get active() { return active; },
    toast: (text, opts) => attempt(() => toast(text, opts)),
    // 입력창: el(편집기) · box(상자) · row(버튼 줄) · tools(왼쪽 버튼 묶음) · send(전송 버튼) · tiptap(인스턴스) · text() · setText(t)
    composer: {
      get el() { return cmp.el; }, get box() { return cmp.box; }, get row() { return cmp.row; },
      get tools() { return cmp.tools; }, get send() { return cmp.send; }, get tiptap() { return cmp.tt; },
      text: () => cmp.text, setText: (t) => attempt(() => cmpSetText(t)),
    },
    on,
    off,
    regions: { get: getRegion },
    layout: {
      open: (name) => open(name, 'api'),
      close: (name) => forceClose(name),
      toggle: (name) => (R[name] && R[name].open ? forceClose(name) : open(name, 'api')),
      isOpen,
    },
    settings,
    menu: { register },
    css: { add: cssAdd, remove: cssRemove },
    _debug: {
      stats: () => Object.assign({}, stats, { page, active, missing, missTries, scanQueued }),
      reset: () => { stats.moCalls = stats.moTimeMs = stats.moMaxMs = stats.scans = stats.scanTimeMs = 0; },
      state: () => ({
        R: Object.fromEntries(NAMES.map((n) => [n, {
          open: R[n].open, shown: R[n].shown, hold: R[n].hold, held: R[n].held, closing: !!R[n].closeT, intent: !!R[n].intentT,
          hover: Array.from(R[n].hover).map((x) => (bound.get(x) ? bound.get(x).role : 'zone')),
        }])),
        lastPress, navBy, px, py, dims, edge: clone(EDGE),
      }),
      chat: () => ({
        list: !!(foldList && foldList.isConnected), keep: foldKeep(), folded: foldCount, reading,
        renderSkip: document.documentElement.hasAttribute('data-cpb-rs'),
        stbHooked, lockOn: lockOn(), lockFreeMs: Math.max(0, Math.round(lockFreeUntil - perf())), sessionHooked: sessOffs.length > 0, genState, awayResult,
      }),
      // 하네스용: fn 안에서 보낸 합성 이벤트를 사용자 조작으로 친다
      asUser: (fn) => { simTrusted = true; try { return fn(); } finally { simTrusted = false; } },
    },
  };

  // ── 성능: 화면 밖 메시지 그리기 생략 + 오래된 대화 숨기기 ──────────
  // 크랙은 새로고침 전까지 메시지 DOM을 쌓기만 한다. 지우면 크랙(React)이 깨지므로 숨기거나 그리기를 건너뛰기만 한다.
  // 목록: .flex-col-reverse > [data-message-group-id]. DOM 순서상 최신이 먼저이고, 그룹 하나가 메시지 하나다
  // (사용자 메시지는 안쪽 첫 자식에 items-end). 스크롤은 위쪽 기준 일반 스크롤이고 overflow-anchor가 켜져 있어서,
  // 화면 위쪽 그룹을 접거나 펼쳐도 보던 위치가 유지된다.
  const KEEP = { min: 3, max: 50, def: 10 }; // 남길 턴 수(사용자 메시지 + 그 답)
  const perfOn = (k) => !(isObj(conf.perf) && conf.perf[k] === false);
  function foldKeep() {
    const v = Math.round(Number(isObj(conf.perf) ? conf.perf.keep : NaN));
    return isFinite(v) ? Math.min(KEEP.max, Math.max(KEEP.min, v)) : KEEP.def;
  }
  const keepStep = (v, dir) => (dir > 0 ? (v < 10 ? v + 1 : v + 5) : (v > 10 ? v - 5 : v - 1));
  // 크랙은 가장자리 그룹 맨 앞에 '더 불러오기' 감지 칸·스피너(items-center)를 넣으므로 첫 자식만 보면 안 된다
  const isUserMsg = (g) => !!g.querySelector(':scope > .items-end');

  let foldList = null, foldSc = null, foldMo = null, foldT = 0, perfLastTry = 0;
  let foldCount = 0, reading = false, foldTop = 0;
  // 턴으로 가기(로그 검색) 뒤 보기: 그 그룹부터 아래(최신 쪽)로 turns턴만 펴고 나머지는 접는다. 펼친 끝 근처로 내리면 keep턴씩 더 편다.
  // 최신까지 다 펴진 채 맨 아래에 닿으면 보통 접기로 돌아간다. {el, turns, more, above(그 위에 접힌 그룹 수)}
  let foldFocus = null;
  const foldFirst = () => { for (const c of foldList.children) if (c.hasAttribute('data-message-group-id')) return c; return null; }; // 최신 그룹
  // 크랙의 ^/↓ 버튼: 아이콘 모양 + 크랙 onClick이 부드러운 스크롤을 부르는 것까지 맞아야(다른 확장이 넣은 비슷한 버튼 제외)
  const CRACK_TOP_D = 'm12 6.87 8.09 8.08', CRACK_DOWN_D = 'M20.09 8.3 12 16.4';
  function isCrackBtn(b, d) {
    const p = b && b.tagName === 'BUTTON' ? b.querySelector('svg path') : null;
    if (!p || !(p.getAttribute('d') || '').startsWith(d)) return false;
    const k = Object.keys(b).find((x) => x.startsWith('__reactProps$'));
    return !!(k && b[k] && String(b[k].onClick || '').includes('smooth'));
  }
  function foldSoon(ms) { if (!foldT) foldT = setTimeout(foldEval, ms); }
  const onFoldScroll = () => foldSoon(100);
  const onFoldList = () => { foldSoon(150); sessionHook(); msgSoon(200); }; // 새 메시지가 붙을 때 크랙 세션이 바뀌었는지도 본다(파이버 몇십 칸, 가벼움)
  // 휠은 사람만 만든다. 보이는 내용 맨 위 근처에서 위로 굴리면 바로 펼친다(이미 맨 위라 scroll 이벤트가 안 나는 경우 포함)
  function onFoldWheel(e) {
    if (e.deltaY >= 0 || reading || !foldCount || !foldSc) return;
    if (foldFocus && !foldFocus.above) return; // 턴으로 가기 뒤: 그 위에 접힌 게 없으면 그대로
    if (foldSc.scrollTop < foldSc.clientHeight * 1.5) { foldFocus = null; reading = true; clearTimeout(foldT); foldEval(); }
  }

  // 켜고 끌 때(설정·레이아웃 변경)만: 그리기 생략 표식(html 속성 하나)과 목록 연결
  const needChat = () => active && (perfOn('fold') || perfOn('scrollLock') || perfOn('renderSkip') || noteOn('summary') || noteOn('done') || inputOn('draft') || msgAny() || modelOn('stats') || dashOn('on'));
  // 그리기 생략은 목록이 실제 크기로 한 번 그려진 뒤에 켠다(rsArm). 처음부터 켜면 아직 안 그린 그룹이 어림 높이(600px)라
  // 크랙의 첫 '맨 아래로'가 중간에 멈춘다(실측: 아래로 약 1만 px 남기고 멈춤).
  let rsReadyAt = 0, rsT = 0;
  function rsSync() {
    flag(document.documentElement, 'data-cpb-rs', active && perfOn('renderSkip') && !!foldList && foldList.isConnected && perf() >= rsReadyAt);
  }
  function rsArm(ms) {
    rsReadyAt = Math.max(rsReadyAt, perf() + ms);
    flag(document.documentElement, 'data-cpb-rs', false);
    clearTimeout(rsT);
    rsT = setTimeout(() => {
      // 숨은 탭에서는 그리기가 한 번도 안 돌아 기억된 크기가 없다 → 처음 보일 때 다시 잰다
      if (document.hidden) { armOnShow = true; return; }
      requestAnimationFrame(() => requestAnimationFrame(rsSync)); // 실제로 그려진 프레임 뒤에 켠다
    }, Math.ceil(rsReadyAt - perf()) + 20);
  }
  // 채팅에 들어오거나 방을 옮긴 직후: 크랙의 첫 '맨 아래로'는 막지 않고, 그리기 생략은 그려진 뒤에 켠다.
  // 시간은 화면에 보인 뒤부터 센다(백그라운드 탭으로 열어 두면 rAF가 안 돌아 크랙의 첫 스크롤이 보일 때에야 움직인다).
  let armOnShow = false;
  function armChat(rsMs) {
    lockFree(4000);
    rsArm(rsMs);
    if (document.hidden) armOnShow = true;
  }
  function consumeArm() {
    if (!armOnShow || document.hidden) return;
    armOnShow = false;
    lockFree(4000);
    rsArm(1500);
  }
  const onVis = () => consumeArm();
  function perfApply() {
    if (needChat()) perfAttach(); else perfDetach();
    rsSync();
    if (!(active && perfOn('fold'))) unfoldAll();
    clearTimeout(foldT); foldEval();
    sessionHook();
  }
  function perfAttach() {
    if (foldList && foldList.isConnected) return true;
    perfDetach();
    const g = document.querySelector('.flex-col-reverse > [data-message-group-id]');
    const list = g && g.parentElement;
    if (!list) return false;
    // 스크롤 영역 = 목록에서 위로 가며 처음 만나는 overflow-y: scroll|auto 요소(연결할 때 한 번만 잰다)
    let sc = list.parentElement;
    while (sc && sc !== document.body && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc || sc === document.body) return false;
    foldList = list; foldSc = sc; foldTop = sc.scrollTop;
    if (!foldMo) foldMo = new MutationObserver(onFoldList);
    foldMo.observe(list, { childList: true }); // 목록 자식(그룹) 추가·삭제만. 그룹 안 글 변화는 보지 않는다
    sc.addEventListener('scroll', onFoldScroll, { passive: true });
    sc.addEventListener('wheel', onFoldWheel, { passive: true });
    window.addEventListener('click', onLockClick, CAP_PASSIVE);
    window.addEventListener('keydown', onLockKey, CAP_PASSIVE);
    document.addEventListener('visibilitychange', onVis);
    armChat(1500);
    stbHooked = !!attempt(() => hookStickToBottom(sc));
    sessionHook();
    msgSoon(500);
    return true;
  }
  function perfDetach() {
    clearTimeout(foldT); foldT = 0;
    if (foldMo) foldMo.disconnect();
    if (foldSc) { foldSc.removeEventListener('scroll', onFoldScroll); foldSc.removeEventListener('wheel', onFoldWheel); }
    window.removeEventListener('click', onLockClick, CAP_PASSIVE);
    window.removeEventListener('keydown', onLockKey, CAP_PASSIVE);
    document.removeEventListener('visibilitychange', onVis);
    unfoldAll();
    foldList = null; foldSc = null;
    sessionHook(); // 목록이 없으니 구독 해제
  }
  function unfoldAll() {
    if (foldList) for (const c of foldList.children) delAttr(c, 'data-cpb-fold');
    foldCount = 0; reading = false; foldFocus = null;
  }
  // 목록을 아직 못 찾았으면(채팅이 늦게 뜸, 다른 방으로 이동) 기반 감시자에서 가끔(0.5초에 한 번까지) 다시 찾는다
  function perfRetry(now) {
    if (!needChat() || (foldList && foldList.isConnected) || now - perfLastTry < 500) return;
    perfLastTry = now;
    setTimeout(() => { if (attempt(perfAttach)) foldEval(); }, 0);
  }

  // ── 답변 완성 때 자동 스크롤 막기 ──
  // 크랙은 stick-to-bottom 라이브러리로 '맨 아래에 붙어 있기'를 한다. 답변이 생성되면 위치를 저장했다가 메시지 묶음 수가
  // 바뀔 때 '붙어 있기'를 다시 켜고 맨 아래까지 내리며, 붙어 있는 동안에는 글이 늘 때마다 따라 내린다.
  // 라이브러리의 스크롤 애니메이션은 매 프레임 state.isAtBottom을 보고 false면 멈춘다. 그래서 그 값만
  // '막는 중에는 읽을 때 늘 false'로 바꿔 끼운다(쓰기는 그대로 받아 둔다). 크랙 코드와 DOM, 스크롤 위치는 건드리지 않는다.
  // 사용자가 채팅 영역의 버튼(보내기, '맨 아래로' 등. 메시지 안 버튼은 제외)을 누르거나 입력창에서 Enter를 친 직후 2.5초와,
  // 채팅에 막 들어온 직후(armChat)에는 원래대로 둔다.
  let lockFreeUntil = 0, stbHooked = false;
  const stbPatched = new WeakSet();
  function lockOn() {
    if (!active || !perfOn('scrollLock')) return false;
    if (armOnShow) { if (document.hidden) return false; consumeArm(); } // visibilitychange보다 크랙의 첫 rAF가 먼저 와도 맞게
    return perf() >= lockFreeUntil;
  }
  function lockFree(ms) { const t = perf() + ms; if (t > lockFreeUntil) lockFreeUntil = t; }
  // click(캡처)이라 마우스·키보드(Space/Enter)·보조기기로 누른 버튼 모두 잡힌다. 크랙은 click 100ms 뒤에 스크롤한다
  function onLockClick(e) {
    const t = e.target, b = e.isTrusted && t && t.closest ? t.closest('button,[role="button"],a') : null;
    if (!(b && foldSc && foldSc.contains(b) && !b.closest('[data-message-group-id]'))) return;
    lockFree(2500);
    // 턴으로 가기 보기 중 크랙 ↓: 그 아래 끝은 우리가 접은 끝이라, 크랙이 100ms 뒤 스크롤하기 전에 보통 접기로 돌려 진짜 최신으로 가게 한다
    if (foldFocus && isCrackBtn(b, CRACK_DOWN_D)) { foldFocus = null; reading = false; foldApply(true); foldTop = foldSc.scrollTop; }
  }
  function onLockKey(e) {
    const t = e.target;
    if (e.isTrusted && e.key === 'Enter' && !e.shiftKey && t && (t.isContentEditable || t.tagName === 'TEXTAREA') && foldSc && foldSc.contains(t)) lockFree(2500);
    // 턴으로 가기 보기 중 맨 위 근처에서 위로 가는 키(이미 맨 위면 scroll이 안 나서 따로 본다): 휠과 같이 위쪽을 편다
    if (e.isTrusted && foldFocus && foldFocus.above && foldSc && /^(PageUp|Home|ArrowUp)$/.test(e.key) && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
      && foldSc.scrollTop < foldSc.clientHeight * 1.5) { foldFocus = null; reading = true; clearTimeout(foldT); foldEval(); }
  }
  // 스크롤 요소의 React 파이버에서 위로 올라가며 라이브러리 상태 객체(escapedFromLock·resizeDifference·isAtBottom을 가진 useMemo 값)를 찾는다
  function hookStickToBottom(sc) {
    const fk = Object.keys(sc).find((k) => k.startsWith('__reactFiber$'));
    let f = fk ? sc[fk] : null;
    for (let d = 0; f && d < 12; d++, f = f.return) {
      let h = f.memoizedState;
      for (let i = 0; h && typeof h === 'object' && 'next' in h && i < 80; i++, h = h.next) {
        const v = Array.isArray(h.memoizedState) ? h.memoizedState[0] : h.memoizedState;
        if (v && typeof v === 'object' && 'escapedFromLock' in v && 'resizeDifference' in v && 'isAtBottom' in v) return patchStb(v);
      }
    }
    return false;
  }
  function patchStb(st) {
    if (stbPatched.has(st)) return true;
    const d = Object.getOwnPropertyDescriptor(st, 'isAtBottom');
    if (!d || !('value' in d) || !d.configurable) return false;
    let stored = d.value;
    Object.defineProperty(st, 'isAtBottom', {
      configurable: true,
      enumerable: true,
      get() {
        if (!stored) return false;
        if (!lockOn()) return true;
        // 막는 중에 맨 아래(70px)에서 벗어나 있으면 '붙어 있기'를 실제로 푼다. 그래야 나중에 잠금이 풀려도(버튼 클릭, 설정 끄기,
        // 폭 줄이기) 예전 위치로 끌려가지 않는다. 사용자가 맨 아래로 돌아오면 라이브러리가 스스로 다시 붙인다.
        if (!st.animation && !(st.scrollDifference <= 70)) stored = false;
        return false;
      },
      set(v) { stored = v; },
    });
    stbPatched.add(st);
    return true;
  }

  // 읽기 모드(다 펼침): 접힌 게 있을 때 사용자가 보이는 맨 위 근처로 올라가면 들어가고, 다시 맨 아래까지 내려오면 나온다.
  // 위치가 아니라 움직인 방향으로 판단해서, 접고 펼칠 때 높이가 바뀌어도 들락날락하지 않는다.
  function foldEval() {
    foldT = 0;
    if (!active || !perfOn('fold') || !foldList || !foldList.isConnected || !foldSc) return;
    const sc = foldSc, view = sc.clientHeight || 1, top = sc.scrollTop;
    const toBottom = sc.scrollHeight - top - view;
    // 턴으로 가기 보기에서 읽기 모드(다 펼침)로 나가는 경우: 그 그룹이 사라짐(삭제·키 바뀜), 새 메시지가 붙음(보내기·답변·자동 진행·다시 생성.
    // 안 나가면 새 메시지가 접혀 안 보인다), 접힌 위쪽으로 올라감(스크롤바·^ 포함). 맨 아래로 내려오면 다시 보통 접기
    if (foldFocus && (!(foldFocus.el.isConnected && foldFocus.el.parentElement === foldList) || foldFirst() !== foldFocus.head
      || (foldFocus.above && top < foldTop && top < view * 1.5))) { foldFocus = null; reading = true; }
    if (foldFocus) {
      // 최신까지 다 펴진 채 맨 아래 → 보통 접기. 막 도착한 직후(아직 더 편 적 없고 움직이지도 않음)는 제외: 목표가 접혀 버린다
      if (!foldFocus.more && toBottom < view * 0.5 && (top > foldTop || foldFocus.turns > foldKeep())) foldFocus = null;
      else {
        // 더 펴기는 펼친 끝 그룹의 아래 기준(전체 높이 기준이면, 끝 바로 뒤에 크랙이 붙인 다음 쪽이 접혀 깜빡이고 읽던 곳이 밀린다)
        const e = foldFocus.end, gap = e && e.isConnected && !e.hasAttribute('data-cpb-fold') ? e.getBoundingClientRect().bottom - sc.getBoundingClientRect().bottom : toBottom;
        if (foldFocus.more && gap < view * 1.5) foldFocus.turns += foldKeep();
        if (foldApplyFocus() & FOLD_CHANGED) msgSoon(200);
        foldTop = sc.scrollTop;
        return;
      }
    }
    if (!reading && foldCount > 0 && top < foldTop && top < view * 1.5) reading = true;
    else if (reading && top > foldTop && toBottom < view * 0.5) reading = false;
    // 위치가 0이면 브라우저 스크롤 고정이 동작하지 않는다(Chromium은 0에서 기준점을 버림).
    // 그래서 펼치기 전에 화면 맨 위의 그룹(DOM상 마지막으로 펼쳐진 그룹)을 기준점으로 잡아 두고 직접 보정한다
    let ref = null, refY = 0;
    if (top === 0 && foldCount > 0) {
      for (let c = foldList.lastElementChild; c; c = c.previousElementSibling) {
        if (c.hasAttribute('data-message-group-id') && !c.hasAttribute('data-cpb-fold')) { ref = c; break; }
      }
      if (ref) refY = ref.getBoundingClientRect().top;
    }
    let r = foldApply(toBottom < view * 1.5);
    if (r & FOLD_GAP) { reading = true; r |= foldApply(false); }
    if (r & FOLD_CHANGED) {
      if (ref && ref.isConnected) { const d = ref.getBoundingClientRect().top - refY; if (d > 0) sc.scrollTop += d; }
      // 우리 변경 뒤의 실제 위치(스크롤 고정 보정 포함, 동기로 반영됨)를 기준으로 삼아 다음 평가에서 사용자 움직임으로 치지 않는다
      foldTop = sc.scrollTop;
      msgSoon(200); // 펼쳐진 묶음에 옆 표시
    } else foldTop = top;
  }
  // 최신부터 턴을 세어 keep턴보다 오래된 그룹을 접는다. 값이 바뀔 때만 쓴다.
  // 턴 = 사용자 메시지 + 그 답. 사용자 메시지 없이 이어진 AI 메시지('이어서 진행', 자동 진행)는 하나가 한 턴이다.
  // 턴 번호는 줄지 않으므로 접힌 구간은 늘 가장 오래된 쪽부터 이어진 한 덩어리다.
  // canFold: 새로 접는 건 맨 아래 근처일 때만(위쪽을 읽는 동안 화면을 건드리지 않게). 펼치기는 언제든.
  // 돌려주는 값: FOLD_CHANGED = 속성을 바꿈, FOLD_GAP = 접힌 것보다 오래된 그룹이 펼쳐진 채 붙음
  //   (맨 위에서 크랙이 예전 페이지를 불러옴) → 중간이 비어 보이니 다 펼쳐야 함
  const FOLD_CHANGED = 1, FOLD_GAP = 2;
  function foldApply(canFold) {
    const keep = foldKeep();
    // 사용자 메시지를 하나도 못 알아보면(크랙 구조 변경) 2그룹을 1턴으로 센다
    let anyUser = false;
    for (const c of foldList.children) if (c.hasAttribute('data-message-group-id') && isUserMsg(c)) { anyUser = true; break; }
    let turn = 0, i = 0, n = 0, prevUser = true, prevAI = false, changed = false, last = null;
    for (const c of foldList.children) {
      if (!c.hasAttribute('data-message-group-id')) continue;
      const user = anyUser && isUserMsg(c);
      if (anyUser ? (prevUser || (!user && prevAI)) : i % 2 === 0) turn++;
      prevUser = user; prevAI = !user;
      const want = !reading && turn > keep;
      const has = c.hasAttribute('data-cpb-fold');
      if (want && !has && canFold) { c.setAttribute('data-cpb-fold', ''); changed = true; }
      else if (!want && has) { c.removeAttribute('data-cpb-fold'); changed = true; }
      if (c.hasAttribute('data-cpb-fold')) n++;
      last = c;
      i++;
    }
    foldCount = n;
    return (changed ? FOLD_CHANGED : 0) | (n > 0 && !!last && !last.hasAttribute('data-cpb-fold') ? FOLD_GAP : 0);
  }
  // 턴으로 가기 뒤 보기: foldFocus.el부터 최신 쪽(DOM 앞쪽)으로 turns턴만 편다. 턴 = 사용자 메시지에서 시작(이어진 AI 메시지는 하나가 한 턴)
  function foldApplyFocus() {
    let anyUser = false;
    for (const c of foldList.children) if (c.hasAttribute('data-message-group-id') && isUserMsg(c)) { anyUser = true; break; }
    const vis = new Set();
    let turn = 0, prevAI = false, i = 0, c = foldFocus.el;
    foldFocus.end = null;
    for (; c; c = c.previousElementSibling) {
      if (!c.hasAttribute('data-message-group-id')) continue;
      const user = anyUser && isUserMsg(c);
      if (i === 0 || (anyUser ? user || prevAI : i % 2 === 0)) turn++;
      if (turn > foldFocus.turns) break;
      prevAI = !user; i++;
      vis.add(c);
      foldFocus.end = c;
    }
    foldFocus.more = !!c;
    let n = 0, above = 0, changed = false, after = false;
    for (const g of foldList.children) {
      if (g === foldFocus.el) after = true;
      if (!g.hasAttribute('data-message-group-id')) continue;
      const want = !vis.has(g), has = g.hasAttribute('data-cpb-fold');
      if (want && !has) { g.setAttribute('data-cpb-fold', ''); changed = true; }
      else if (!want && has) { g.removeAttribute('data-cpb-fold'); changed = true; }
      if (want) { n++; if (after && g !== foldFocus.el) above++; }
    }
    foldCount = n; foldFocus.above = above;
    return changed ? FOLD_CHANGED : 0;
  }
  // 그 그룹부터 보이게 접는다(접기를 끈 상태면 예전처럼 다 펴고 읽기 모드). 돌려주는 값: 접기 보기로 들어갔는지
  function foldFocusOn(g) {
    if (!active || !perfOn('fold') || !foldList || g.parentElement !== foldList) { unfoldAll(); reading = true; return false; }
    clearTimeout(foldT); foldT = 0;
    reading = false;
    foldFocus = { el: g, turns: foldKeep(), more: true, above: 0, head: foldFirst(), end: null };
    foldApplyFocus();
    msgSoon(200);
    return true;
  }

  // ── 입력창 서비스 ──────────────────────────────────────
  // 크랙 스토리 채팅 입력창 = div.tiptap.ProseMirror.__chat_input_textarea[contenteditable] (TipTap 인스턴스가 el.editor로 붙어 있음).
  // 상자 = 편집기의 할아버지(div.flex.w-full.flex-col.rounded-lg.border), 버튼 줄 = 상자 > div.pb-3… > div.flex.items-center.justify-between
  // (왼쪽 div.flex.items-center.gap-2 = ✳·/·추천답변, 오른쪽 마지막 button = 전송). 글 변화는 TipTap 'update'로 받는다(DOM 감시자 없음).
  // 모듈은 api.on('composer', …)(입력창을 새로 찾음)과 'composer:change'({text}), 'composer:send'({text})를 받는다.
  const COMPOSER_SEL = '.ProseMirror.__chat_input_textarea[contenteditable="true"]';
  const cmp = { el: null, box: null, row: null, tools: null, send: null, tt: null, text: '', gen: 0 };
  let cmpLastTry = 0, cmpRaf = 0;
  function cmpText() {
    const tt = cmp.tt;
    if (tt && typeof tt.getText === 'function') return String(attempt(() => tt.getText({ blockSeparator: '\n' })) || '');
    return cmp.el ? cmp.el.innerText.replace(/\n$/, '') : '';
  }
  function onCmpUpdate() {
    if (cmpRaf) return;
    cmpRaf = requestAnimationFrame(() => {
      cmpRaf = 0;
      if (!cmp.el) return;
      const t = cmpText();
      if (t === cmp.text) return;
      cmp.text = t;
      emit('composer:change', { text: t });
    });
  }
  function onCmpKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.isTrusted) emit('composer:send', { text: cmp.text || cmpText() });
  }
  function onCmpClick(e) {
    const send = cmpSend();
    if (e.isTrusted && send && (e.target === send || send.contains(e.target))) emit('composer:send', { text: cmp.text || cmpText() });
  }
  let cmpMo = null, cmpNull = false;
  function cmpDetach() {
    if (!cmp.el) return;
    if (cmp.tt && typeof cmp.tt.off === 'function') attempt(() => cmp.tt.off('update', onCmpUpdate));
    if (cmpMo) cmpMo.disconnect();
    cmp.el.removeEventListener('keydown', onCmpKey, true);
    if (cmp.row) cmp.row.removeEventListener('click', onCmpClick, true);
    cmp.el = cmp.box = cmp.row = cmp.tools = cmp.send = cmp.tt = null;
    cmp.text = '';
  }
  function cmpAttach() {
    if (cmp.el && cmp.el.isConnected) return true;
    cmpDetach();
    const el = page ? document.querySelector(COMPOSER_SEL) : null;
    // 못 찾았다는 알림은 '있다 → 없다'로 바뀔 때 한 번만(재시도마다 보내면 받는 쪽 그리기가 0.5초마다 돈다)
    if (!el) { if (!cmpNull) { cmpNull = true; emit('composer', null); } return false; }
    cmpNull = false;
    const gp = el.parentElement && el.parentElement.parentElement;
    const box = gp && /\brounded-lg\b/.test(gp.className) ? gp : (el.closest('.rounded-lg') || gp);
    if (!box) return false;
    const row = box.querySelector('.flex.items-center.justify-between');
    cmp.el = el;
    cmp.box = box;
    cmp.row = row;
    cmp.tools = row && row.firstElementChild && row.firstElementChild.tagName !== 'BUTTON' ? row.firstElementChild : null;
    cmp.send = row && row.lastElementChild && row.lastElementChild.tagName === 'BUTTON' ? row.lastElementChild : null;
    cmp.tt = el.editor && typeof el.editor.on === 'function' ? el.editor : null;
    flag(box, 'data-cpb-cbox', true);
    if (cmp.tt) attempt(() => cmp.tt.on('update', onCmpUpdate));
    else {
      if (!cmpMo) cmpMo = new MutationObserver(onCmpUpdate);
      cmpMo.observe(el, { childList: true, subtree: true, characterData: true });
    }
    el.addEventListener('keydown', onCmpKey, true);
    if (row) row.addEventListener('click', onCmpClick, true);
    cmp.text = cmpText();
    cmp.gen++;
    emit('composer', cmp);
    return true;
  }
  // 기반 감시자에서: 입력창이 떨어졌거나 아직 없으면 가끔(0.5초에 한 번까지) 다시 찾는다
  function cmpRetry(now) {
    if (cmp.el && cmp.el.isConnected) return;
    if (!page || now - cmpLastTry < 500) return;
    cmpLastTry = now;
    setTimeout(() => attempt(cmpAttach), 0);
  }
  // 글 바꾸기: TipTap 명령으로 넣어야 크랙 상태와 어긋나지 않는다(입력 규칙도 거치지 않음)
  function cmpSetText(text) {
    const tt = cmp.tt;
    if (!tt || !tt.commands) return false;
    const lines = String(text).split('\n');
    const doc = { type: 'doc', content: lines.map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' })) };
    const ok = !!attempt(() => tt.commands.setContent(doc, true));
    onCmpUpdate();
    return ok;
  }

  // ── 입력창: 글자수 ──
  // 상자 안 전송 버튼 왼쪽에 우리 숫자 하나(CSS 고정 위치, 측정 없음). 한도의 70%부터 노랑→주황→빨강, 넘는 순간 한 번 흔든다
  const inputOn = (k) => !(isObj(conf.input) && conf.input[k] === false);
  const inputLimit = () => 2000; // 크랙 입력 한도(고정)
  let cntEl = null, cntPrev = null;
  function cntRender() {
    const want = page && inputOn('counter') && cmp.box && cmp.box.isConnected;
    if (!want) { if (cntEl && cntEl.isConnected) cntEl.remove(); cntPrev = null; return; }
    if (!cntEl) {
      cntEl = document.createElement('span');
      cntEl.id = 'cpb-icnt';
      cntEl.setAttribute('aria-live', 'off');
    }
    if (cntEl.parentNode !== cmp.box) { cmp.box.appendChild(cntEl); cntPrev = null; }
    const n = Array.from(cmp.text).length, lim = inputLimit(), r = n / lim;
    const txt = n.toLocaleString('ko-KR');
    if (cntEl.textContent !== txt) cntEl.textContent = txt;
    const tip = '현재 ' + txt + '자 · 한도 ' + lim.toLocaleString('ko-KR') + '자';
    if (cntEl.title !== tip) cntEl.title = tip;
    // 색: 70% 미만 기본, 70~87.5% 노랑(47)→주황(30), 87.5~100% 주황→빨강(0), 넘으면 빨강 굵게
    const hue = r < 0.7 ? null : r < 0.875 ? 47 - (r - 0.7) / 0.175 * 17 : r < 1 ? 30 - (r - 0.875) / 0.125 * 30 : 0;
    const color = hue == null ? '' : 'hsl(' + Math.round(hue) + ' 90% 55%)';
    if (cntEl.style.getPropertyValue('--cpb-icnt-c') !== color) {
      if (color) cntEl.style.setProperty('--cpb-icnt-c', color); else cntEl.style.removeProperty('--cpb-icnt-c');
    }
    flag(cntEl, 'data-empty', n === 0);
    flag(cntEl, 'data-over', r >= 1);
    if (cntPrev != null && cntPrev <= lim && n > lim) {
      cntEl.classList.remove('cpb-shake');
      void cntEl.offsetWidth; // 애니메이션 다시 시작
      cntEl.classList.add('cpb-shake');
    }
    cntPrev = n;
  }

  // ── 입력창: 펼치기 ──
  // 글이 넘칠 때만 상자 오른쪽 위에 버튼. 누르면 상자에 data-cpb-exp 하나만 붙여 CSS로 최대 높이를 늘린다(높이 계산·인라인 스타일 없음).
  // 보내서 입력창이 비면 자동으로 접는다
  const EXPAND_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>';
  const COLLAPSE_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7"/></svg>';
  let expBtn = null, expRo = null, expShown = null;
  function expOpen() { return !!(cmp.box && cmp.box.hasAttribute('data-cpb-exp')); }
  function expSet(open) {
    if (!cmp.box) return;
    flag(cmp.box, 'data-cpb-exp', open);
    if (!open && cmp.el) cmp.el.scrollTop = cmp.el.scrollHeight;
    expRender();
  }
  function expRender() {
    const want = page && inputOn('expand') && cmp.box && cmp.box.isConnected && cmp.el;
    if (!want) {
      if (expBtn && expBtn.isConnected) expBtn.remove();
      if (expRo) expRo.disconnect();
      if (cmp.box && cmp.box.hasAttribute('data-cpb-exp')) cmp.box.removeAttribute('data-cpb-exp');
      expShown = null;
      return;
    }
    if (!expBtn) {
      expBtn = document.createElement('button');
      expBtn.type = 'button';
      expBtn.id = 'cpb-iexp';
      expBtn.addEventListener('pointerdown', (e) => e.preventDefault()); // 입력창 포커스 유지
      expBtn.addEventListener('click', () => expSet(!expOpen()));
    }
    if (expBtn.parentNode !== cmp.box) {
      cmp.box.appendChild(expBtn);
      expShown = null;
      if (!expRo && typeof ResizeObserver === 'function') expRo = new ResizeObserver(() => expRender());
      if (expRo) { expRo.disconnect(); expRo.observe(cmp.el); }
    }
    const open = expOpen();
    if (open && !cmp.text) { expSet(false); return; } // 보내서 비면 접기
    const show = open || cmp.el.scrollHeight > cmp.el.clientHeight + 3;
    if (show !== expShown) { expShown = show; flag(expBtn, 'data-show', show); }
    const key = open ? 'c' : 'e';
    if (expBtn.getAttribute('data-k') !== key) {
      expBtn.setAttribute('data-k', key);
      expBtn.innerHTML = open ? COLLAPSE_SVG : EXPAND_SVG;
      const label = open ? '입력창 원래 크기로' : '입력창 크게 펼치기';
      expBtn.title = label;
      expBtn.setAttribute('aria-label', label);
    }
  }
  // ── 입력창: 엔딩 힌트 버튼 숨기기 · 빈 입력 전송 막기 ──
  // 힌트: CSS만(html[data-cpb-nohint]일 때 '엔딩 힌트' 버튼과 그 알림 점을 숨김).
  // 빈 입력 전송 막기: 입력창이 빈 채로 전송(재생 삼각형 아이콘)이나 Enter를 누르면 크랙이 이야기를 자동 진행하므로 막는다.
  // 생성 중의 중단 버튼(다른 아이콘)은 막지 않는다. 막을 때는 크랙보다 먼저(document 캡처) 이벤트를 멈춘다
  const SEND_ICON_SEL = 'svg path[d^="M18.77"]';
  const GUARD_TITLE = '입력창이 비어 있어 자동 진행 전송을 막았어요';
  // 전송 버튼은 크랙이 새 요소로 바꿔 끼울 수 있으니 쓸 때마다 버튼 줄의 마지막 버튼으로 다시 확인한다
  function cmpSend() {
    if (cmp.send && cmp.send.isConnected) return cmp.send;
    const last = cmp.row && cmp.row.isConnected ? cmp.row.lastElementChild : null;
    cmp.send = last && last.tagName === 'BUTTON' ? last : null;
    return cmp.send;
  }
  function guardBlocked(fresh) {
    const send = cmpSend();
    if (!page || !inputOn('emptyGuard') || !send) return false;
    if ((fresh ? cmpText() : cmp.text).trim()) return false;
    return !!send.querySelector(SEND_ICON_SEL);
  }
  function guardRender() {
    flag(document.documentElement, 'data-cpb-nohint', page && inputOn('hideHint'));
    const send = cmpSend();
    if (!send) return;
    const b = guardBlocked(false);
    flag(send, 'data-cpb-blocked', b);
    if (b) setAttr(send, 'title', GUARD_TITLE);
    else if (send.getAttribute('title') === GUARD_TITLE) send.removeAttribute('title');
  }
  function stopEv(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  function onGuardPointer(e) {
    const send = cmpSend();
    if (!send || !(e.target === send || send.contains(e.target))) return;
    if (guardBlocked(true)) stopEv(e);
  }
  function onGuardKey(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    if (!page || !inputOn('emptyGuard') || !cmp.el || !(e.target === cmp.el || cmp.el.contains(e.target))) return;
    if (!cmpText().trim()) stopEv(e);
  }

  function inputRender() { cntRender(); expRender(); guardRender(); if (!page) wrapHideBar(); }

  // ── 입력창: 감싸기 도구 ──
  // 사용자 합본 1.2.0 '채팅 도구'의 감싸기를 기반 위에 새로 쓴 것. 드래그한 글을 기호로 감싼다(채팅 입력창·메시지 수정창).
  // 여는 곳: 글을 드래그하면 뜨는 도구줄(끝의 조절 버튼 = 도구 설정), 설정창, Alt+` · Alt+1 … Alt+0(켜진 도구 순서).
  // 넣기는 TipTap 인스턴스(편집기 요소의 .editor)로: 줄바꿈은 hardBreak로 넣어 크랙 입력 규칙(``` → 코드블럭 등)을 타지 않는다.
  // 인스턴스가 없으면 execCommand('insertText'). 설정은 'wrap' 아래, 예전 CrackInputWrapperPopup_* 키는 처음 한 번 옮겨 온다.
  const WRAP_DEFAULT_TOOLS = [
    { id: 'double', label: '쌍따옴표', icon: '“”', pre: '"', suf: '"', enabled: true },
    { id: 'single', label: '작은따옴표', icon: '‘’', pre: "'", suf: "'", enabled: true },
    { id: 'jp-double', label: '『 』', icon: '『』', pre: '『', suf: '』', enabled: true },
    { id: 'jp-single', label: '「 」', icon: '「」', pre: '「', suf: '」', enabled: true },
    { id: 'paren', label: '소괄호', icon: '()', pre: '(', suf: ')', enabled: true },
    { id: 'bold', label: '굵게', icon: '**', pre: '**', suf: '**', enabled: true },
    { id: 'strike', label: '취소선', icon: '~~', pre: '~~', suf: '~~', enabled: true },
    { id: 'codeblock', label: '코드블럭', icon: '⋮', pre: '```\n', suf: '\n```', enabled: true },
  ];
  const WRAP_KEYS = ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  // 아이콘과 움직임은 합본 1.2.0 감싸기 그대로(괄호 벌어짐, 손잡이 이동, 체크 그려짐 등)
  const WRAP_SVG = {
    brk: '<path class="bl" d="M8 6.5 3.5 12 8 17.5"/><path class="br" d="M16 6.5l4.5 5.5-4.5 5.5"/><path class="ac mid" d="M10 12h4"/>',
    tune: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle class="k1" cx="16" cy="7" r="2"/><circle class="k2" cx="8" cy="17" r="2"/>',
    selpop: '<path d="M3.5 19h17"/><g class="pill"><rect class="ac" x="5.5" y="4.5" width="12.5" height="6.5" rx="3.25"/><path class="ac" d="M11.75 11v2.4"/></g>',
    resel: '<path d="M7 7 3.5 12 7 17"/><path d="M17 7l3.5 5-3.5 5"/><rect class="fl ac hl2" x="8.3" y="9.6" width="7.4" height="4.8" rx="1.3" style="opacity:.35"/><path d="M8.3 9v6"/>',
    grip: '<circle class="fl" cx="9" cy="7" r="1.3"/><circle class="fl" cx="15" cy="7" r="1.3"/><circle class="fl" cx="9" cy="12" r="1.3"/><circle class="fl" cx="15" cy="12" r="1.3"/><circle class="fl" cx="9" cy="17" r="1.3"/><circle class="fl" cx="15" cy="17" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  };
  const wsvg = (n, s) => '<svg class="cpbw-si cpbw-si-' + n + '" width="' + (s || 16) + '" height="' + (s || 16) + '" viewBox="0 0 24 24" aria-hidden="true">' + WRAP_SVG[n] + '</svg>';
  const wrapTheme = () => (document.body && document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  const escHtml = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function wrapNormTools(list) {
    return list.filter((t) => isObj(t)).map((t, i) => ({
      id: String(t.id || 'custom-' + i + '-' + Date.now()), label: String(t.label || '도구'),
      icon: String(t.icon || t.label || '?').slice(0, 8), pre: String(t.pre == null ? '' : t.pre), suf: String(t.suf == null ? '' : t.suf),
      enabled: t.enabled !== false,
    }));
  }
  function wrapConf() {
    const w = isObj(conf.wrap) ? conf.wrap : {};
    return { enabled: w.enabled !== false, popup: w.popup !== false, keep: w.keep === true };
  }
  function wrapTools() {
    const t = isObj(conf.wrap) && Array.isArray(conf.wrap.tools) && conf.wrap.tools.length ? conf.wrap.tools : WRAP_DEFAULT_TOOLS;
    return wrapNormTools(t);
  }
  const wrapEnabledTools = () => wrapTools().filter((t) => t.enabled);
  const wrapShortcut = (list, tool) => {
    if (!tool.enabled) return '';
    const k = list.filter((t) => t.enabled).indexOf(tool);
    return k >= 0 && k < WRAP_KEYS.length ? 'Alt+' + WRAP_KEYS[k] : '';
  };
  const wrapMono = (icon) => /^[*~`_<>[\]{}()#=|-]+$|⋮/.test(String(icon || ''));
  // 예전 합본 설정(같은 사이트 localStorage)을 처음 한 번 옮겨 온다
  function wrapMigrate() {
    if (isObj(conf.wrap) && conf.wrap.migrated) return;
    const w = Object.assign({}, isObj(conf.wrap) ? conf.wrap : {}, { migrated: 1 });
    const t = readJSON('CrackInputWrapperPopup_Tools_v1'), s = readJSON('CrackInputWrapperPopup_Settings_v1');
    if (Array.isArray(t) && t.length) w.tools = wrapNormTools(t);
    if (isObj(s)) {
      if (s.enabled === false) w.enabled = false;
      if (s.showOnSelection === false) w.popup = false;
      if (s.keepInnerSelected === true) w.keep = true;
    }
    pathSet(conf, 'wrap', w);
    writeJSON(SETTINGS_KEY, conf);
  }
  // 편집기 판정: 채팅 입력창 또는 메시지 수정창(tiptap). 본문(.wrtn-markdown)과 우리 창은 제외
  function wrapEditorOf(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const ed = el && el.closest ? el.closest('.ProseMirror[contenteditable="true"]') : null;
    if (!ed || ed.closest('.wrtn-markdown, #cpb-wrap-win, #cpb-wrap-bar')) return null;
    return ed.classList.contains('__chat_input_textarea') || ed.classList.contains('tiptap') ? ed : null;
  }
  function wrapSelInfo() {
    const sel = window.getSelection && window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const ed = wrapEditorOf(range.commonAncestorContainer);
    if (!ed) return null; // 편집기 밖 선택(본문 드래그·전체 선택)은 글을 뽑지 않는다
    const text = sel.toString();
    if (!text.trim()) return null;
    return { ed, range: range.cloneRange(), text };
  }
  const textToInline = (s) => {
    const out = [];
    String(s).split('\n').forEach((p, i) => { if (i) out.push({ type: 'hardBreak' }); if (p) out.push({ type: 'text', text: p }); });
    return out;
  };
  function wrapApply(tool, info) {
    if (!tool || !info || !info.ed.isConnected) return false;
    const keep = wrapConf().keep;
    const tt = info.ed.editor;
    if (tt && tt.view && tt.commands && typeof tt.chain === 'function') {
      try {
        const v = tt.view;
        let from = v.posAtDOM(info.range.startContainer, info.range.startOffset);
        let to = v.posAtDOM(info.range.endContainer, info.range.endOffset);
        if (from > to) { const x = from; from = to; to = x; }
        const inner = tt.state.doc.textBetween(from, to, '\n');
        if (inner) {
          const full = tool.pre + inner + tool.suf;
          tt.chain().focus().insertContentAt({ from, to }, textToInline(full)).run();
          if (keep) tt.commands.setTextSelection({ from: from + tool.pre.length, to: from + tool.pre.length + inner.length });
          else tt.commands.setTextSelection(from + full.length);
          return true;
        }
      } catch (e) { warn(e); }
    }
    // 인스턴스가 없으면: 선택을 되살려 브라우저 입력으로 넣는다
    try {
      info.ed.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(info.range);
      return !!document.execCommand('insertText', false, tool.pre + info.text + tool.suf);
    } catch (_) { return false; }
  }

  // 드래그 도구줄(우리 요소 하나, 위치는 선택 영역 위. 자리가 없으면 아래)
  let wrapBar = null, wrapSaved = null, wrapSelT = 0;
  function wrapHideBar() { if (wrapBar && wrapBar.hasAttribute('data-show')) wrapBar.removeAttribute('data-show'); }
  function wrapBuildBar() {
    if (!wrapBar) {
      wrapBar = document.createElement('div');
      wrapBar.id = 'cpb-wrap-bar';
      wrapBar.setAttribute('role', 'toolbar');
      wrapBar.setAttribute('aria-label', '감싸기 도구');
      wrapBar.addEventListener('pointerdown', (e) => e.preventDefault()); // 선택 유지
      wrapBar.addEventListener('mousedown', (e) => e.preventDefault());
      wrapBar.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        if (b.dataset.act === 'tune') { wrapHideBar(); wrapOpenWin(); return; }
        const tool = wrapTools().find((t) => t.id === b.dataset.id);
        const info = wrapSaved;
        b.classList.add('hit'); // 누른 단추가 톡 눌리는 모습이 보이도록 조금 뒤에 닫는다
        if (tool && info && wrapApply(tool, info)) setTimeout(wrapHideBar, 140);
        else { wrapHideBar(); toast('감싸기 실패', { key: 'wrap' }); }
      });
    }
    const all = wrapTools();
    const sig = JSON.stringify(all);
    if (wrapBar.dataset.sig !== sig) {
      wrapBar.dataset.sig = sig;
      wrapBar.innerHTML = all.filter((t) => t.enabled).map((t, i) => {
        const key = wrapShortcut(all, t);
        return '<button type="button" class="cpbw-sel-btn' + (wrapMono(t.icon) ? ' mono' : '') + '" style="--k:' + i + '" data-id="' + escHtml(t.id) + '" data-tip="' + escHtml(key ? t.label + '  ·  ' + key : t.label) + '" aria-label="' + escHtml(t.label) + '">' + escHtml(t.icon || t.label) + '</button>';
      }).join('') + '<i class="cpbw-sel-sep"></i><button type="button" class="cpbw-sel-gear" data-act="tune" title="감싸기 도구 설정" aria-label="감싸기 도구 설정">' + wsvg('tune', 16) + '</button>';
    }
    wrapBar.dataset.theme = wrapTheme();
    if (!wrapBar.isConnected) document.body.appendChild(wrapBar);
    return wrapBar;
  }
  function wrapCheckSel() {
    wrapSelT = 0;
    const c = wrapConf();
    if (!page || !c.enabled || !c.popup) { wrapHideBar(); return; }
    const info = wrapSelInfo();
    if (!info) { wrapSaved = null; wrapHideBar(); return; }
    wrapSaved = info;
    const rects = Array.from(info.range.getClientRects()).filter((r) => r.width || r.height);
    const rect = rects[0] || info.range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) { wrapHideBar(); return; }
    const bar = wrapBuildBar();
    bar.querySelectorAll('.hit').forEach((b) => b.classList.remove('hit'));
    const was = bar.hasAttribute('data-show');
    bar.setAttribute('data-show', ''); // 숨김 → 보임이 될 때마다 등장 애니메이션이 다시 돈다
    const bw = bar.offsetWidth || 240, bh = bar.offsetHeight || 36;
    let left = rect.left + rect.width / 2 - bw / 2, top = rect.top - bh - 8;
    if (top < 8) top = rect.bottom + 8;
    left = Math.max(8, Math.min(left, innerWidth - bw - 8));
    top = Math.max(8, Math.min(top, innerHeight - bh - 8));
    // 위치는 left/top(등장 애니메이션이 transform을 쓰므로). 이미 떠 있으면 자리만 옮긴다
    bar.style.left = Math.round(left) + 'px';
    bar.style.top = Math.round(top) + 'px';
    if (!was) bar.style.transformOrigin = rect.top - bh - 8 >= 8 ? '50% 100%' : '50% 0';
  }
  function onWrapSelChange() {
    if (!page || !wrapConf().enabled) return;
    clearTimeout(wrapSelT);
    wrapSelT = setTimeout(wrapCheckSel, 80);
  }
  function onWrapDown(e) {
    if (wrapBar && wrapBar.hasAttribute('data-show') && !wrapBar.contains(e.target)) wrapHideBar();
  }
  function onWrapKey(e) {
    if (e.key === 'Escape') { wrapHideBar(); return; }
    if (!page || !e.altKey || e.ctrlKey || e.metaKey || !wrapConf().enabled) return;
    const k = e.code === 'Backquote' ? 0 : /^Digit\d$/.test(e.code) ? (Number(e.code.slice(5)) || 10) : -1;
    if (k < 0) return;
    const tool = wrapEnabledTools()[k];
    const info = tool && wrapSelInfo();
    if (!info) return;
    e.preventDefault();
    e.stopPropagation();
    if (wrapApply(tool, info)) wrapHideBar();
  }

  // 도구 설정 창(우리 창 하나). 저장 전까지는 사본(draft)만 고친다
  function wrapOpenWin() {
    if (document.getElementById('cpb-wrap-win')) return;
    let draft = { tools: wrapTools(), opts: wrapConf() };
    let dirty = false;
    const win = document.createElement('div');
    win.id = 'cpb-wrap-win';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', '감싸기 도구');
    win.dataset.theme = wrapTheme();
    const optH = (id, icon, label, tip) => '<button type="button" class="cpbw-opt' + (draft.opts[id] ? ' on' : '') + '" data-act="opt" data-arg="' + id + '" title="' + escHtml(tip) + '"><span class="ri">' + wsvg(icon, 17) + '</span>' + label + '<span class="ck"><svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.3 2.3 4.7-5"/></svg></span></button>';
    const esc = (v) => String(v == null ? '' : v).replace(/\n/g, '\\n');
    const unesc = (v) => String(v == null ? '' : v).replace(/\\n/g, '\n');
    const rowsH = (flash) => draft.tools.map((t, k) => {
      const key = wrapShortcut(draft.tools, t);
      return '<div class="cpbw-row' + (t.enabled ? '' : ' off') + (t.id === flash ? ' new' : '') + '" data-k="' + k + '" data-id="' + escHtml(t.id) + '">'
        + '<span class="grip" data-grip title="끌어서 순서 바꾸기">' + wsvg('grip', 16) + '</span>'
        + '<button type="button" class="cpbw-sw" role="switch" aria-checked="' + t.enabled + '" data-act="ton" data-arg="' + k + '" aria-label="도구줄에 보이기"><span class="kn"><svg viewBox="0 0 16 16"><path class="ck" d="M4.6 8.4l2.2 2.2 4.6-4.9"/></svg></span></button>'
        + '<input class="icn" value="' + escHtml(t.icon) + '" maxlength="8" data-f="icon" data-k="' + k + '" aria-label="버튼 모양">'
        + '<input value="' + escHtml(t.label) + '" data-f="label" data-k="' + k + '" aria-label="이름">'
        + '<input class="mono" value="' + escHtml(esc(t.pre)) + '" data-f="pre" data-k="' + k + '" aria-label="앞 기호">'
        + '<input class="mono" value="' + escHtml(esc(t.suf)) + '" data-f="suf" data-k="' + k + '" aria-label="뒤 기호">'
        + '<span class="kbd' + (key ? '' : ' no') + '">' + (key || '없음') + '</span>'
        + '<button type="button" class="del" data-act="del" data-arg="' + k + '" aria-label="지우기">' + wsvg('x', 14) + '</button></div>';
    }).join('');
    function draw(flash) {
      win.innerHTML = '<div class="ph"><span class="logo">' + wsvg('brk', 16) + '</span><b class="pt">감싸기 도구</b><small>드래그한 글을 기호로 감싸요</small>'
        + (dirty ? '<span class="dirtyb">저장 안 됨</span>' : '') + '<span class="grow"></span><button type="button" class="ib" data-act="close" aria-label="닫기">' + wsvg('x', 15) + '</button></div>'
        + '<div class="opts">' + optH('popup', 'selpop', '드래그 팝업', '글을 드래그하면 도구줄이 떠요') + optH('keep', 'resel', '선택 유지', '감싼 뒤에도 안쪽 글을 선택한 채로 둬요') + '</div>'
        + '<div class="lh"><span></span><span>켜기</span><span>버튼</span><span>이름</span><span>앞</span><span>뒤</span><span>단축키</span><span></span></div>'
        + '<div class="wl">' + rowsH(flash) + '</div>'
        + '<div class="cf"><button type="button" class="btn" data-act="def">기본값</button><span class="note2">줄바꿈은 \\n · 순서는 왼쪽 점을 끌어서</span><span class="grow"></span>'
        + '<button type="button" class="btn" data-act="add">' + wsvg('plus', 14) + '추가</button><button type="button" class="btn pri" data-act="save"' + (dirty ? '' : ' disabled') + '>저장</button></div>';
    }
    const refreshRows = (flash) => { win.querySelector('.wl').innerHTML = rowsH(flash); };
    const refreshKeys = () => win.querySelectorAll('.cpbw-row').forEach((row, i) => {
      const key = wrapShortcut(draft.tools, draft.tools[i]), kb = row.querySelector('.kbd');
      kb.textContent = key || '없음';
      kb.classList.toggle('no', !key);
    });
    function setDirty() {
      if (dirty) return;
      dirty = true;
      const g = win.querySelector('.ph .grow');
      if (g) g.insertAdjacentHTML('beforebegin', '<span class="dirtyb">저장 안 됨</span>');
      const s = win.querySelector('[data-act="save"]');
      if (s) s.disabled = false;
    }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (dirty) toast('저장 안 한 변경은 버렸어요', { key: 'wrap' });
      win.classList.add('closing');
      setTimeout(() => win.remove(), 170);
    }
    function onKey(e) {
      if (e.key !== 'Escape' || !win.isConnected) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    const ACT = {
      close,
      opt(b) { const id = b.dataset.arg; draft.opts[id] = !draft.opts[id]; b.classList.toggle('on', draft.opts[id]); setDirty(); },
      ton(b) {
        const t = draft.tools[Number(b.dataset.arg)];
        t.enabled = !t.enabled;
        b.setAttribute('aria-checked', String(t.enabled));
        b.classList.remove('flip');
        void b.offsetWidth; // 손잡이 늘어나는 움직임을 다시 시작
        b.classList.add('flip');
        b.closest('.cpbw-row').classList.toggle('off', !t.enabled);
        refreshKeys();
        setDirty();
      },
      del(b) {
        const k = Number(b.dataset.arg), gone = draft.tools.splice(k, 1)[0];
        refreshRows();
        setDirty();
        toast("'" + gone.label + "' 지웠어요 · 눌러서 되돌리기", { key: 'wrap', duration: 4000, onClick: () => { if (win.isConnected) { draft.tools.splice(k, 0, gone); refreshRows(gone.id); } } });
      },
      add() {
        const t = { id: 'custom-' + Date.now(), label: '새 도구', icon: '+', pre: '', suf: '', enabled: true };
        draft.tools.push(t);
        refreshRows(t.id);
        setDirty();
        const wl = win.querySelector('.wl');
        wl.scrollTop = wl.scrollHeight;
        const inp = win.querySelector('[data-id="' + t.id + '"] input[data-f="label"]');
        if (inp) { inp.focus(); inp.select(); }
      },
      def() {
        const prev = { tools: draft.tools.map((t) => Object.assign({}, t)), opts: Object.assign({}, draft.opts) };
        draft = { tools: wrapNormTools(WRAP_DEFAULT_TOOLS), opts: { enabled: draft.opts.enabled, popup: true, keep: false } };
        draw();
        setDirty();
        toast('기본값으로 돌렸어요 · 눌러서 되돌리기', { key: 'wrap', duration: 4000, onClick: () => { if (win.isConnected) { draft = prev; draw(); setDirty(); } } });
      },
      save() {
        const tools = wrapNormTools(draft.tools.filter((t) => t.pre || t.suf || t.label || t.icon));
        const w = Object.assign({}, isObj(conf.wrap) ? conf.wrap : {}, { tools, popup: !!draft.opts.popup, keep: !!draft.opts.keep });
        delete w.toolbar; // 입력창 버튼은 없앴다(예전 설정 값만 정리)
        settings.set('wrap', w);
        dirty = false;
        const d = win.querySelector('.dirtyb');
        if (d) d.remove();
        win.querySelector('[data-act="save"]').disabled = true;
        toast('저장했어요', { key: 'wrap' });
      },
    };
    draw();
    document.body.appendChild(win);
    document.addEventListener('keydown', onKey, true);
    win.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      e.preventDefault();
      if (ACT[b.dataset.act]) ACT[b.dataset.act](b);
    });
    win.addEventListener('input', (e) => {
      const f = e.target.dataset && e.target.dataset.f;
      const t = f && draft.tools[Number(e.target.dataset.k)];
      if (!t) return;
      t[f] = f === 'pre' || f === 'suf' ? unesc(e.target.value) : e.target.value;
      setDirty();
    });
    win.addEventListener('animationend', (e) => {
      if (e.target.classList && e.target.classList.contains('kn')) { const sw = e.target.closest('.cpbw-sw'); if (sw) sw.classList.remove('flip'); }
    });
    // 순서 바꾸기(왼쪽 점 끌기)와 창 옮기기(제목줄 끌기). 끄는 동안만 리스너를 둔다
    win.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-grip]');
      if (g) {
        const wl = win.querySelector('.wl');
        let from = Number(g.closest('.cpbw-row').dataset.k);
        const id = draft.tools[from].id;
        wl.setPointerCapture(e.pointerId);
        wl.classList.add('dragging');
        g.closest('.cpbw-row').classList.add('drag');
        e.preventDefault();
        const mv = (ev) => {
          const rows = Array.from(wl.querySelectorAll('.cpbw-row'));
          let to = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
          if (to < 0) to = rows.length - 1;
          if (to === from) return;
          const t = draft.tools.splice(from, 1)[0];
          draft.tools.splice(to, 0, t);
          from = to;
          wl.innerHTML = rowsH();
          const r = wl.querySelector('[data-id="' + CSS.escape(id) + '"]');
          if (r) r.classList.add('drag');
          setDirty();
        };
        const up = () => {
          wl.classList.remove('dragging');
          const r = wl.querySelector('.drag');
          if (r) r.classList.remove('drag');
          wl.removeEventListener('pointermove', mv);
          wl.removeEventListener('pointerup', up);
          wl.removeEventListener('pointercancel', up);
        };
        wl.addEventListener('pointermove', mv);
        wl.addEventListener('pointerup', up);
        wl.addEventListener('pointercancel', up);
        return;
      }
      const h = e.target.closest('.ph');
      if (!h || e.button !== 0 || e.target.closest('button')) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      win.setAttribute('data-moved', '');
      win.style.left = r.left + 'px';
      win.style.top = r.top + 'px';
      const mv = (ev) => {
        win.style.left = Math.max(8, Math.min(ev.clientX - dx, innerWidth - r.width - 8)) + 'px';
        win.style.top = Math.max(8, Math.min(ev.clientY - dy, innerHeight - 60)) + 'px';
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      e.preventDefault();
    });
  }

  // ── 입력창: 임시저장 ──
  // 방(chatId)마다 쓰던 글을 0.4초 묶어 localStorage 'crack-pc-base:draft:<chatId>' = {t, at, p}에 저장한다.
  // 들어왔을 때 입력창이 비어 있으면 되살린다. 보낼 때 p:1(전송 확인 대기)로 두고, 크랙의 '보낸 메시지 생성' 신호
  // (세션 onUserMessageCreated)가 오면 지운다. 신호가 끝내 안 왔으면(실패 등) 다음에 들어올 때 누르면 되살리는 알림을 띄운다.
  // 방을 옮길 때 입력창에 남아 있던 앞 방 글은 바뀌기 전까지 새 방 글로 저장하지 않는다. 30일 지난 저장본은 지운다.
  const DRAFT_PREFIX = 'crack-pc-base:draft:';
  const DRAFT_TTL = 30 * 864e5;
  let draftT = 0, draftRoom = '', draftCarry = null, draftSentAt = 0;
  const roomId = () => { const m = location.pathname.match(/\/episodes\/([^/?#]+)/); return m ? m[1] : ''; };
  const draftKey = (id) => DRAFT_PREFIX + id;
  function draftFlush() {
    if (!draftT) return;
    clearTimeout(draftT);
    draftT = 0;
    draftSave();
  }
  function draftSave() {
    draftT = 0;
    const id = draftRoom;
    if (!id || !inputOn('draft') || !cmp.el) return;
    const t = cmp.text;
    if (draftCarry != null && t === draftCarry) return; // 앞 방에서 넘어온 글
    draftCarry = null;
    if (!t.trim()) {
      // 보낸 직후 비워진 거면 확인 대기 저장본을 남기고, 사용자가 지운 거면 저장본도 지운다
      if (perf() - draftSentAt > 2000) { try { localStorage.removeItem(draftKey(id)); } catch (_) { /* 무시 */ } }
      return;
    }
    const cur = readJSON(draftKey(id));
    if (cur && cur.t === t && !cur.p) return;
    writeJSON(draftKey(id), { t, at: Date.now(), p: 0 });
  }
  function onDraftChange() {
    if (!inputOn('draft')) return;
    clearTimeout(draftT);
    draftT = setTimeout(draftSave, 400);
  }
  function onDraftSend(d) {
    if (!inputOn('draft') || !draftRoom || !d || !String(d.text || '').trim()) return;
    clearTimeout(draftT);
    draftT = 0;
    draftSentAt = perf();
    writeJSON(draftKey(draftRoom), { t: d.text, at: Date.now(), p: 1 });
  }
  function onUserMsgCreated(e) {
    const d = e && e.data;
    const id = (d && d.chatId) || draftRoom;
    if (!id || (d && d.role && d.role !== 'user')) return;
    turnsBump(d);
    try { localStorage.removeItem(draftKey(id)); } catch (_) { /* 무시 */ }
  }
  // 입력창을 (다시) 찾았거나 방이 바뀌면: 방 기록을 맞추고, 비어 있으면 되살린다
  function draftEnter() {
    const id = roomId();
    if (!cmp.el || !id) { draftRoom = id; return; }
    if (id === draftRoom) return;
    draftFlush();
    const moved = !!draftRoom;
    draftRoom = id;
    draftCarry = moved && cmp.text ? cmp.text : null;
    if (!inputOn('draft')) return;
    const d = readJSON(draftKey(id));
    if (!d || !d.t || Date.now() - (Number(d.at) || 0) > DRAFT_TTL) return;
    if (cmp.text.trim() && cmp.text !== draftCarry) return; // 이미 뭔가 쓰여 있으면 건드리지 않는다
    const restore = () => { if (cmpSetText(d.t)) { draftCarry = null; toast('임시저장한 글을 되살렸어요', { icon: 'ok', key: 'draft' }); } };
    if (d.p) toast('보내지 못했을 수 있는 글이 있어요 · 눌러서 되살리기', { icon: 'note', key: 'draft', duration: 8000, onClick: restore });
    else if (cmpSetText(d.t)) { draftCarry = null; toast('임시저장한 글을 되살렸어요', { icon: 'ok', key: 'draft' }); }
  }
  function draftCleanup() {
    try {
      const now = Date.now(), dead = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(DRAFT_PREFIX) !== 0) continue;
        const d = readJSON(k);
        if (!d || now - (Number(d.at) || 0) > DRAFT_TTL) dead.push(k);
      }
      for (const k of dead) localStorage.removeItem(k);
    } catch (_) { /* 저장소 없음 */ }
  }

  // ── 알림(토스트) ──────────────────────────────────────
  // 우리 요소(body 끝의 #cpb-toasts)에만 그린다. 같은 key로 다시 띄우면 새로 쌓지 않고 글자와 시간만 갱신한다(스테퍼 연타 등)
  const noteOn = (k) => !(isObj(conf.notify) && conf.notify[k] === false);
  // 글라스 알약. 왼쪽 SVG 아이콘(종류마다 들어올 때 한 번 움직임), 할 일이 있으면 오른쪽 버튼, 아래 남은 시간 실선(올리면 멈춤).
  // 닫기(X)는 없다: 시간이 되면 스스로 사라진다. 여러 개는 겹쳐 쌓이고(뒤로 갈수록 작고 흐리게) 올리면 펼쳐진다.
  // opts: {icon: 종류 이름(info·ok·err·prog·note·bell·trash·stamp·memory·set·on·off·confirm), key, duration, onClick, action}
  //   onClick만 있으면 알림 전체가 버튼. 글 끝이 ' · 눌러서 되살리기'면 그 말을 오른쪽 버튼(action)으로 옮긴다
  const TS = (body) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const TOAST_ICON = {
    info: TS('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
    ok: TS('<circle cx="12" cy="12" r="8.5" opacity=".35"/><path class="draw" pathLength="1" d="M8 12.3l2.7 2.7L16.2 9.5"/>'),
    err: TS('<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>'),
    prog: TS('<circle cx="12" cy="12" r="8.5" opacity=".2"/><path class="spin" d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/>'),
    note: TS('<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 8.5h8M8 12h6"/>'),
    bell: TS('<g class="bell"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></g>'),
    trash: TS('<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12.5h8L17 7"/>'),
    refresh: TS('<g class="spin1"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/></g>'),
    stamp: TS('<g class="stamp"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path class="pg" d="M4 10h16"/><path d="M8.5 3.5v3.5M15.5 3.5v3.5"/><path class="ck draw" pathLength="1" d="M9 15l2 2 4-4.2"/></g>'),
    memory: TS('<path d="M9.5 4.5A3 3 0 0 0 6.5 7.6 3 3 0 0 0 4.6 13a3 3 0 0 0 2 4.9A3 3 0 0 0 12 18.6V6a2.4 2.4 0 0 0-2.5-1.5z"/><path d="M14.5 4.5a3 3 0 0 1 3 3.1 3 3 0 0 1 1.9 5.4 3 3 0 0 1-2 4.9A3 3 0 0 1 12 18.6"/><path class="draw" pathLength="1" d="M12 10h2.5M12 14h3"/>'),
    set: TS('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="k1" cx="15" cy="7" r="2"/><circle class="k2" cx="9" cy="17" r="2"/>'),
    confirm: (ms) => TS('<circle cx="12" cy="12" r="8.5" opacity=".2"/><circle class="ring" pathLength="1" cx="12" cy="12" r="8.5" style="animation-duration:' + ms + 'ms"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'),
  };
  const TOAST_EMOJI = { '📝': 'note', '🔔': 'bell', '📅': 'stamp', '⚠️': 'err', '⚙️': 'set', '🧠': 'memory' };
  // 아이콘을 안 정했으면 글로 고른다(실패·완료·진행 중)
  function toastKind(text, o) {
    const i = o.icon == null ? '' : String(o.icon);
    if (i) return TOAST_EMOJI[i] || i;
    if (/(못했어요|못 했어요|실패|막혔어요|없어요|않아요)/.test(text)) return 'err';
    if (/한 번 더 누르면/.test(text)) return 'confirm';
    if (/중이에요/.test(text)) return 'prog';
    if (/(지웠어요|비웠어요)/.test(text)) return 'trash';
    if (/(했어요|됐어요|왔어요|렸어요|꿨어요|켰어요|껐어요|완료)/.test(text)) return 'ok';
    return 'info';
  }
  let toastBox = null, toastLay = 0;
  function toastLayout() {
    toastLay = 0;
    if (!toastBox) return;
    // 최신이 맨 앞(위). 뒤로 갈수록 7px 아래·작게·흐리게, 올리면 48px 간격으로 펼친다
    const list = Array.from(toastBox.querySelectorAll('.cpb-toast:not(.out)')).reverse(), open = toastBox.matches(':hover');
    list.forEach((el, i) => {
      el.style.zIndex = String(10 - i);
      el.style.setProperty('--y', (open ? i * 48 : i * 7) + 'px');
      el.style.setProperty('--s', String(open ? 1 : 1 - i * 0.05));
      el.style.setProperty('--o', String(open ? 1 : Math.max(0, 1 - i * 0.3)));
    });
    toastBox.style.height = (open ? Math.max(1, list.length) * 48 : 56) + 'px';
  }
  const toastRelayout = () => { if (!toastLay) toastLay = requestAnimationFrame(toastLayout); };
  function toastDismiss(el) {
    if (!el || el.classList.contains('out')) return;
    clearTimeout(el._cpbT);
    el.classList.add('out');
    setTimeout(() => { el.remove(); toastRelayout(); }, 260);
    toastRelayout();
  }
  function toast(text, opts) {
    if (!document.body || text == null || text === '') return;
    const o = isObj(opts) ? opts : {};
    if (!toastBox || !toastBox.isConnected) {
      toastBox = document.createElement('div');
      toastBox.id = 'cpb-toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      toastBox.addEventListener('mouseover', toastRelayout);
      toastBox.addEventListener('mouseout', toastRelayout);
      document.body.appendChild(toastBox);
    }
    let msg = String(text), action = o.action ? String(o.action) : '';
    const click = typeof o.onClick === 'function' ? o.onClick : null;
    if (click && !action) { const m = msg.match(/^(.*\S)\s*·\s*눌러서\s+(\S.*)$/); if (m) { msg = m[1]; action = m[2]; } }
    const kind = toastKind(msg, o);
    const dur = Math.max(1200, Number(o.duration) || 2600);
    const key = o.key == null ? '' : String(o.key);
    let el = key ? Array.from(toastBox.children).find((c) => c.getAttribute('data-key') === key && !c.classList.contains('out')) : null;
    const fresh = !el;
    if (fresh) {
      el = document.createElement('div');
      if (key) el.setAttribute('data-key', key);
    }
    el.className = 'cpb-toast t-' + kind + (action ? '' : ' plain') + (click && !action ? ' tap' : '');
    const ic = kind === 'confirm' ? TOAST_ICON.confirm(dur) : kind === 'on' || kind === 'off' ? '<span class="mini' + (kind === 'on' ? '' : ' on') + '"></span>' : TOAST_ICON[kind] || TOAST_ICON.info;
    el.innerHTML = '<span class="ti">' + ic + '</span><span class="tx' + (fresh ? '' : ' swap') + '"></span>'
      + (action ? '<button type="button" class="act"></button>' : '') + '<span class="bar" style="animation-duration:' + dur + 'ms"></span>';
    el.querySelector('.tx').textContent = msg;
    if (action) el.querySelector('.act').textContent = action;
    // 설정 켬/끔: 작은 스위치가 실제로 넘어간다
    if (kind === 'on' || kind === 'off') { const mi = el.querySelector('.mini'); requestAnimationFrame(() => requestAnimationFrame(() => mi.classList.toggle('on', kind === 'on'))); }
    el.onclick = click ? (e) => { if (action && !e.target.closest('.act')) return; toastDismiss(el); attempt(click); } : null;
    if (fresh) {
      toastBox.append(el);
      const live = toastBox.querySelectorAll('.cpb-toast:not(.out)');
      if (live.length > 3) toastDismiss(live[0]);
    }
    // 남은 시간: 알림 위에 올려 두면 멈춘다(실선도 같이)
    clearTimeout(el._cpbT);
    let left = dur, t0 = Date.now();
    const tick = () => {
      if (!el.isConnected) return;
      if (toastBox.matches(':hover')) { t0 = Date.now(); el._cpbT = setTimeout(tick, 200); return; }
      left -= Date.now() - t0; t0 = Date.now();
      if (left <= 0) toastDismiss(el); else el._cpbT = setTimeout(tick, Math.min(200, left));
    };
    el._cpbT = setTimeout(tick, 200);
    toastRelayout();
  }
  // ── 크랙 요청 엿듣기 · 크랙 API ──
  // 크랙은 axios(XHR)로 요청한다. 필요한 주소의 응답만 옆에서 읽는다(우리는 요청을 보내지 않는다). 주소 검사는 문자열 정규식 한 번.
  const xhrWatch = []; // {test: RegExp, fn(method, url, status, json), on?(): bool — 있으면 false인 동안 응답을 읽지도 않는다}
  const xhrWants = (x, url) => x.test.test(url) && (!x.on || x.on());
  // 대신 답하기: 켜져 있고 주소가 맞는 GET만, 크랙 요청을 보내지 않고 respond({url, headers})가 돌려준 JSON으로 답한다.
  // respond가 null을 주거나 실패하면 그때 원래 요청을 보낸다(send를 아직 부르지 않았으니 그대로 보낼 수 있다)
  const xhrRespond = []; // {test: RegExp, on(): bool, respond({url, headers}): Promise<json|null>}
  function hookXhr() {
    const P = XMLHttpRequest.prototype, open = P.open, send = P.send, setHeader = P.setRequestHeader;
    P.open = function (m, u) {
      try {
        this.__cpbReq = [String(m).toUpperCase(), String(u)];
        this.__cpbAns = this.__cpbReq[0] === 'GET' ? xhrRespond.find((w) => w.test.test(this.__cpbReq[1]) && w.on()) || null : null;
        this.__cpbHead = this.__cpbAns ? {} : null;
      } catch (_) { /* 기록 실패는 무시 */ }
      return open.apply(this, arguments);
    };
    P.setRequestHeader = function (k, v) {
      if (this.__cpbHead) this.__cpbHead[k] = v;
      return setHeader.apply(this, arguments);
    };
    P.send = function () {
      const r = this.__cpbReq, w = this.__cpbAns, args = arguments;
      if (r && xhrWatch.some((x) => xhrWants(x, r[1]))) { this.__cpbBody = typeof args[0] === 'string' ? args[0] : null; this.addEventListener('load', onXhrLoad); }
      if (!w) return send.apply(this, args);
      this.__cpbAns = null;
      Promise.resolve().then(() => w.respond({ url: r[1], headers: this.__cpbHead || {} })).then(
        (json) => { if (!json) return send.apply(this, args); try { xhrAnswer(this, r[1], json); } catch (_) { send.apply(this, args); } },
        () => send.apply(this, args),
      );
    };
  }
  // 받은 것처럼 꾸미기: 상태·본문을 이 요청 객체에만 덮고, 브라우저와 같은 순서로 사건을 보낸다(axios는 onloadend/onreadystatechange로 받는다)
  function xhrAnswer(x, url, json) {
    const text = JSON.stringify(json);
    let rs = 1, parsed;
    const def = (k, get) => { try { Object.defineProperty(x, k, { configurable: true, get }); } catch (_) { /* 못 덮으면 그대로 */ } };
    def('readyState', () => rs);
    def('status', () => 200);
    def('statusText', () => 'OK');
    def('responseURL', () => url);
    def('responseText', () => text);
    def('response', () => (x.responseType === 'json' ? (parsed === undefined ? (parsed = JSON.parse(text)) : parsed) : text));
    x.getAllResponseHeaders = () => 'content-type: application/json; charset=utf-8\r\n';
    x.getResponseHeader = (n) => (/^content-type$/i.test(String(n)) ? 'application/json; charset=utf-8' : null);
    setTimeout(() => {
      for (const s of [2, 3, 4]) { rs = s; x.dispatchEvent(new Event('readystatechange')); }
      x.dispatchEvent(new ProgressEvent('load'));
      x.dispatchEvent(new ProgressEvent('loadend'));
    }, 0);
  }
  function onXhrLoad() {
    const r = this.__cpbReq;
    let j = null;
    try { j = this.responseType === 'json' ? this.response : (!this.responseType || this.responseType === 'text') ? JSON.parse(this.responseText) : null; } catch (_) { j = null; }
    let body = null; // 보낸 내용(JSON): 분기의 messageId, 방 옮기기의 chatIds 등은 요청에만 있다
    try { body = this.__cpbBody ? JSON.parse(this.__cpbBody) : null; } catch (_) { body = null; }
    for (const w of xhrWatch) if (xhrWants(w, r[1])) attempt(() => w.fn(r[0], r[1], this.status, j, body));
  }
  function cookieGet(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  // 우리가 직접 보내는 요청(출석 확인·출석). 크랙과 같은 인증 머리말을 쓴다
  async function crackFetch(method, path, body) {
    const token = cookieGet('access_token');
    if (!token) return { ok: false, status: 0, json: null }; // 로그아웃 상태
    const h = { Authorization: 'Bearer ' + token, platform: 'web' };
    const wid = cookieGet('__w_id');
    if (wid) h['x-wrtn-id'] = wid;
    const init = { method, headers: h };
    if (body !== undefined) { h['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    const r = await fetch('https://crack-api.wrtn.ai' + path, init);
    let json = null;
    try { json = await r.json(); } catch (_) { json = null; }
    return { ok: r.ok, status: r.status, json };
  }
  function goto(path) {
    const r = window.next && window.next.router;
    if (r && typeof r.push === 'function') r.push(path); else location.assign(path);
  }

  // 크랙 새 알림: 크랙은 알림을 실시간으로 보내지 않는다. 대신 크랙 머리말(종 아이콘)이 창으로 돌아올 때마다(SWR 포커스 재확인,
  // 5초 간격 제한)와 페이지 이동 때 GET /crack-api/alarm/check(→ 안 읽은 알림 있음 true/false)를 스스로 다시 묻는다.
  // 그 응답을 엿듣다가 없음 → 있음이 되면 한 번 토스트로 알린다(머리말을 자동 숨김 중이라 빨간 점이 안 보이므로).
  // 목록(/crack-api/alarm)은 불러오지 않는다(불러오면 읽음 처리될 수 있음). 우리가 직접 묻는 건 페이지를 열 때 한 번뿐
  // (우리 스크립트가 크랙의 첫 확인보다 늦게 붙기 때문). '이미 알림' 여부는 탭끼리 localStorage로 나눠 써서 한 번만 띄운다.
  const ALARM_KEY = 'crack-pc-base:alarm';
  function onAlarmCheck(m, url, status, j) {
    if (status !== 200 || !j || typeof j.data !== 'boolean') return;
    const unread = j.data;
    const cur = readJSON(ALARM_KEY) || {};
    if (unread && !cur.notified && page && noteOn('crack')) {
      toast('크랙에 새 알림이 있어요', { icon: 'bell', action: '보기', key: 'crack-alarm', duration: 6000, onClick: () => goto('/notifications') });
    }
    if (!!cur.notified !== unread && (page || !unread)) writeJSON(ALARM_KEY, { notified: unread });
  }
  let alarmAsked = false;
  async function alarmFirstCheck() {
    if (alarmAsked || !page || !noteOn('crack')) return;
    alarmAsked = true; // 문서당 한 번만
    const r = await crackFetch('GET', '/crack-api/alarm/check');
    onAlarmCheck('GET', '', r.status, r.json);
  }

  // 출석: GET /crack-cash/attendance → attendanceStatus(NOT_ATTENDED | ATTENDED | ATTENDED_BY_ANOTHER_ACCOUNT | ATTENDANCE_NOT_POSSIBLE),
  // POST /crack-cash/attendance(본문 없음) → {cash: {quantity, expiredAt}}. 하루 1회, 한국 시간 0시에 바뀐다.
  // 확인은 페이지를 열 때(새로고침·진입) 딱 한 번만 한다. 했으면 끝, 안 했으면 오른쪽 위에 '출석하기' 버튼을 계속 띄워 두고
  // 다시 묻지 않는다. 누르면 바로 출석한다. 크랙 화면(크래커 › 무료로 받기)에서 출석해도 엿듣고 버튼을 숨긴다.
  // 출석 버튼 스타일은 사이트 전역(홈에서도 뜨므로). 색·움직임 변수(--cpbg-*)도 사이트 전역 알림 스타일에 있다
  const ATTEND_CSS = `
#cpb-attend{position:fixed;top:64px;right:56px;z-index:94;display:flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 11px;border:0;border-radius:999px;font:inherit;font-size:12.5px;line-height:18px;font-weight:600;cursor:pointer;
  color:var(--cpbg-tx);background:var(--cpbg-glass);-webkit-backdrop-filter:var(--cpbg-blur);backdrop-filter:var(--cpbg-blur);box-shadow:0 0 0 1px var(--cpbg-line),inset 0 1px 0 var(--cpbg-hi),0 8px 24px rgba(0,0,0,.14);
  transition:transform .16s var(--cpbg-ease),opacity .4s,translate .5s var(--cpbg-ease);animation:cpbTIn .5s var(--cpbg-spring)}
#cpb-attend:hover{transform:translateY(-1px)}
#cpb-attend:active{transform:scale(.96)}
#cpb-attend svg{display:block;width:16px;height:16px;fill:none;color:var(--cpbg-brand);overflow:visible}
#cpb-attend small{font-size:12px;font-weight:400;color:var(--cpbg-tx3)}
#cpb-attend.busy{pointer-events:none;opacity:.75}
#cpb-attend.busy svg{animation:cpbSpin .8s linear infinite}
#cpb-attend.done{pointer-events:none}
#cpb-attend.done svg{color:var(--cpbg-ok)}
#cpb-attend.gone{opacity:0;translate:0 -8px}
#cpb-attend.fail{animation:cpbAttFail .4s ease-in-out}
@keyframes cpbAttFail{0%,100%{translate:0}25%{translate:-3px 0}50%{translate:3px 0}75%{translate:-1px 0}}
#cpb-attend .stamp .ck{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset .45s var(--cpbg-ease) .1s}
#cpb-attend.done .stamp .ck{stroke-dashoffset:0}
#cpb-attend .stamp .pg{transform-origin:12px 10px}
#cpb-attend.done .stamp .pg{animation:cpbTFlip .45s var(--cpbg-ease)}
#cpb-attend:hover .stamp{animation:cpbAttTap .5s var(--cpbg-spring)}
@keyframes cpbAttTap{40%{transform:rotate(-8deg) scale(1.08)}}
`;
  siteCss('attend', ATTEND_CSS);
  let attendStatus = '', attendBtn = null, attendBusy = false, attendAsked = false, attendCheer = false;
  // 뜨는 곳: 스토리 채팅 + 크랙 첫 화면(홈 '/'). 홈에서는 출석 말고 다른 기능은 돌지 않는다(page가 false)
  const attendHere = () => page || location.pathname === '/';
  function attendSet(status) {
    attendStatus = status;
    attendRender();
  }
  function attendRender() {
    const show = attendHere() && noteOn('attend') && attendStatus === 'NOT_ATTENDED';
    if (!show) { if (!attendCheer && attendBtn && attendBtn.isConnected) attendBtn.remove(); return; }
    if (!attendBtn) {
      attendBtn = document.createElement('button');
      attendBtn.type = 'button';
      attendBtn.id = 'cpb-attend';
      attendBtn.title = '누르면 바로 출석해요';
      attendBtn.addEventListener('click', () => { attendNow(); });
      attendBtn.addEventListener('animationend', (e) => { if (e.animationName === 'cpbAttFail') attendBtn.classList.remove('fail'); });
    }
    if (!attendBtn.isConnected && document.body) {
      attendBtn.className = '';
      attendBtn.innerHTML = TOAST_ICON.stamp + '<span class="lb">출석하기</span><small>오늘 아직 안 했어요</small>';
      document.body.appendChild(attendBtn);
    }
  }
  async function attendCheck() {
    if (attendAsked || !attendHere() || !noteOn('attend')) { attendRender(); return; }
    attendAsked = true; // 문서당 한 번만
    try {
      const r = await crackFetch('GET', '/crack-cash/attendance');
      const s = r.json && r.json.data && r.json.data.attendanceStatus;
      if (r.ok && s) attendSet(String(s));
    } catch (_) { /* 실패하면 다음 새로고침 때 */ }
  }
  // 출석이 되면 달력에 체크 도장이 찍히는 걸 잠깐 보여 주고 조용히 사라진다(오늘은 다시 안 나온다)
  function attendCelebrate() {
    const b = attendBtn;
    if (!b || !b.isConnected) return;
    attendCheer = true;
    b.classList.add('done');
    b.querySelector('.lb').textContent = '출석 완료';
    const sm = b.querySelector('small');
    if (sm) sm.remove();
    setTimeout(() => {
      b.classList.add('gone');
      setTimeout(() => { attendCheer = false; b.remove(); attendRender(); }, 500);
    }, 1800);
  }
  async function attendNow() {
    if (attendBusy || attendCheer) return;
    attendBusy = true;
    if (attendBtn) attendBtn.classList.add('busy');
    let ok = false;
    try {
      const r = await crackFetch('POST', '/crack-cash/attendance');
      if (r.ok) {
        ok = true;
        if (attendBtn) attendBtn.classList.remove('busy');
        attendCelebrate();
        attendSet('ATTENDED');
        toast('출석 완료', { icon: 'stamp', key: 'attend' });
      } else {
        // 400 = 다른 계정에서 이미 출석 등. 상태를 다시 물어 맞춘다
        const g = await crackFetch('GET', '/crack-cash/attendance');
        const s = g.json && g.json.data && g.json.data.attendanceStatus;
        if (g.ok && s) attendSet(String(s));
        toast(s === 'ATTENDED' ? '오늘은 이미 출석했어요' : s === 'ATTENDED_BY_ANOTHER_ACCOUNT' ? '다른 계정으로 이미 출석했어요'
          : '지금은 출석할 수 없어요', { icon: s === 'ATTENDED' || s === 'ATTENDED_BY_ANOTHER_ACCOUNT' ? 'stamp' : 'err', key: 'attend' });
      }
    } catch (_) {
      toast('출석하지 못했어요 · 잠시 뒤 다시 눌러 주세요', { icon: 'err', key: 'attend', duration: 3600 });
      if (attendBtn) attendBtn.classList.add('fail');
    } finally {
      attendBusy = false;
      if (attendBtn && !ok) attendBtn.classList.remove('busy');
    }
  }  // 크랙 화면에서 출석 상태를 묻거나 출석하면 그대로 맞춘다
  function onAttendXhr(m, url, status, j) {
    if (m === 'GET' && status === 200 && j && j.data && j.data.attendanceStatus) attendSet(String(j.data.attendanceStatus));
    else if (m === 'POST' && status >= 200 && status < 300) attendSet('ATTENDED');
  }

  // 설정 변경 알림: 기반 설정은 이름표로 '항목 · 켬/끔'. 다른 탭에서 바뀐 설정('*')도 알린다
  const SETTING_LABELS = {
    'autoHide.top': '상단 헤더 자동 숨김', 'autoHide.bar': '모델 선택 바 자동 숨김',
    'autoHide.left': '좌측 자동 숨김', 'autoHide.right': '우측 자동 숨김',
    'perf.scrollLock': '답변 완성 때 자동 스크롤 막기', 'perf.renderSkip': '화면 밖 메시지 그리기 생략',
    'perf.fold': '오래된 대화 숨기기', 'perf.keep': '남길 최근 대화',
    'notify.summary': '요약 메모리 알림', 'notify.settings': '설정 변경 알림', 'notify.crack': '크랙 새 알림',
    'notify.attend': '출석 버튼',
    'notify.done': '답변 완성 알림', 'notify.doneSound': '답변 완성 소리',
    'input.counter': '입력 글자수', 'input.expand': '입력창 펼치기 버튼', 'input.draft': '임시저장', 'wrap.enabled': '감싸기 도구',
    'input.emptyGuard': '빈 입력 전송 막기', 'input.hideHint': '엔딩 힌트 버튼 숨기기',
    'msg.chars': '메시지 글자수', 'msg.time': '메시지 생성 시각', 'msg.cost': '답변별 크래커', 'msg.model': '답변 모델 아이콘', 'msg.user': '사용자 메시지에도 표시',
    'models.stats': '모델별 통계 카드', 'models.hide': '모델 숨기기',
  };
  function settingsToast(key) {
    if (!noteOn('settings') || setUI.open) return; // 설정창이 열려 있으면 창이 바로 보여 준다
    if (key === '*') { toast('다른 탭에서 바뀐 설정을 적용했어요', { icon: 'set', key: 'set:*' }); return; }
    const label = SETTING_LABELS[key];
    if (!label) return;
    const v = pathGet(conf, key);
    const txt = typeof v === 'boolean' ? (v ? '켬' : '끔') : key === 'perf.keep' ? foldKeep() + '턴' : String(v);
    toast(label + ' · ' + txt, { icon: typeof v === 'boolean' ? (v ? 'on' : 'off') : 'set', key: 'set:' + key });
  }

  // 요약 메모리 알림: 크랙 채팅방 세션(ChatRoomSessionProvider 값)의 onCharacterMessageGenerated(fn) → 해제 함수.
  // 답변이 완성될 때마다 {data: {chatId, isSummaryCreated, …}}가 오고, 요약 메모리가 새로 만들어졌으면 isSummaryCreated가 true다
  // (크랙도 이때 채팅 정보를 다시 불러온다). 세션 값은 메시지 목록에서 파이버를 위로 올라가 찾는다(실측 21칸).
  let sessVal = null, sessOffs = [];
  function sessionHook() {
    let v = null;
    if (active && (noteOn('summary') || noteOn('done') || inputOn('draft') || msgOn('cost') || modelOn('stats') || dashOn('on')) && foldList && foldList.isConnected) {
      const fk = Object.keys(foldList).find((k) => k.startsWith('__reactFiber$'));
      let f = fk ? foldList[fk] : null;
      for (let d = 0; f && d < 60; d++, f = f.return) {
        const p = f.memoizedProps && f.memoizedProps.value;
        if (p && typeof p === 'object' && typeof p.onCharacterMessageGenerated === 'function') { v = p; break; }
      }
    }
    if (v === sessVal) return;
    for (const off of sessOffs) attempt(off);
    sessOffs = [];
    sessVal = v;
    if (v) {
      // 구독 함수는 해제 함수를 돌려준다. 우리 콜백 오류가 크랙 소켓 처리로 번지지 않게 attempt로 감싼다
      const sub = (name, fn) => {
        if (typeof v[name] !== 'function') return;
        const off = attempt(() => v[name]((e) => { attempt(() => fn(e)); }));
        if (typeof off === 'function') sessOffs.push(off);
      };
      sub('onCharacterMessageGenerated', onGenerated);
      sub('onCharacterMessageGenerating', onGenerating); // 글 조각마다 온다 → 콜백은 상태 한 번 비교로 끝낸다
      sub('onGenerationError', onGenError);
      sub('onUserMessageCreated', onUserMsgCreated); // 임시저장: 보낸 글이 생성되면 저장본 삭제
    }
  }
  const sameChat = (id) => { const cur = location.pathname.split('/').filter(Boolean).pop(); return !id || !cur || id === cur; };
  function onGenerated(e) {
    const d = e && e.data;
    if (!d || !active || !sameChat(d.chatId)) return;
    costRecord(d);
    mstatsRecord(d);
    dashOnGenerated(d);
    if (d.isSummaryCreated === true && noteOn('summary')) toast('요약 메모리가 업데이트됐어요', { icon: 'memory', key: 'summary', duration: 3500 });
    genFinish('done');
  }

  // 답변 완성 알림: 생성 중에는 탭 제목 앞에 '생성 중'을 붙인다. 다른 탭·창에 가 있는 동안(문서가 숨었거나 창에 포커스가 없음)
  // 답변이 끝나거나 실패하면 제목 앞 표시를 바꾸고 (선택) 짧은 소리를 낸다. 돌아오면 표시를 지우고 토스트로 알린다.
  const TITLE_MARKS = { gen: '⏳ 생성 중 · ', done: '✅ 답변 완성 · ', err: '⚠️ 생성 실패 · ' };
  let genState = '', awayResult = '', audioCtx = null;
  const away = () => document.hidden || !document.hasFocus();
  function setTitleMark(kind) {
    let t = document.title;
    for (const m of Object.values(TITLE_MARKS)) if (t.startsWith(m)) { t = t.slice(m.length); break; }
    const want = kind ? TITLE_MARKS[kind] + t : t;
    if (document.title !== want) document.title = want;
  }
  function onGenerating(e) {
    const d = e && e.data;
    if (genState === 'gen' || !d || !active || !noteOn('done') || !sameChat(d.chatId)) return;
    genState = 'gen';
    setTitleMark('gen');
  }
  function onGenError(e) {
    const d = e && e.data;
    if (!active || (d && !sameChat(d.chatId))) return;
    genFinish('err');
  }
  function genFinish(kind) {
    genState = '';
    if (!noteOn('done') || !away()) { setTitleMark(''); return; }
    awayResult = kind;
    setTitleMark(kind);
    if (kind === 'done' && noteOn('doneSound')) chime();
  }
  function onBack() {
    if (!awayResult || away()) return;
    const k = awayResult;
    awayResult = '';
    setTitleMark(genState === 'gen' ? 'gen' : '');
    toast(k === 'done' ? '자리를 비운 사이 답변이 완성됐어요' : '자리를 비운 사이 답변 생성에 실패했어요',
      { icon: k === 'done' ? '✅' : '⚠️', key: 'gen-done', duration: 4000 });
  }
  // 짧은 두 음 차임(WebAudio). 사용자가 이 페이지를 한 번이라도 눌렀으면(보내기 등) 백그라운드에서도 울린다
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      for (const [f, dt] of [[880, 0], [1320, 0.13]]) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.exponentialRampToValueAtTime(0.16, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + dt);
        o.stop(t + dt + 0.4);
      }
    } catch (_) { /* 소리를 못 내도 제목 표시는 그대로 */ }
  }

  // ── 메시지 옆 표시: 글자수 · 생성 시각 · 사용 크래커 · 모델 아이콘 ──
  // 데이터는 크랙이 이미 들고 있는 것만 쓴다(API 반복 호출 없음).
  //  - 메시지: 묶음([data-message-group-id]) 안 컴포넌트의 React 상태에 크랙 메시지 객체가 있다(실측: 바로 아래 컴포넌트의 훅).
  //    지금 화면에 보이는 답변(리롤 후보 포함)의 객체라 '답변 비교'를 바꿔도 그대로 따라간다. 시각은 메시지 ID(ObjectId)에서 계산.
  //  - 크래커: 크랙의 답변 완성 신호(characterMessageGenerated)의 cashUsage{total,paid,free}·additionalOutputCracker를
  //    방별로 저장한다(localStorage 'crack-pc-base:cost:<chatId>'). 설치 전 답변은 추정하지 않는다.
  //  - 모델: 크랙 모델 목록 API(/crack-gen/v3/chat-models) 응답에서 이름·엔진·아이콘·색을 받아 기억한다
  //    (localStorage 'crack-pc-base:models'). 크랙이 새 모델을 추가해도 자동으로 나타나고, 목록에서 빠진 옛 모델도 기억으로 보인다.
  // 표시: AI 답변은 하단 버튼 줄 왼쪽 칸 맨 앞, 사용자 메시지는 말풍선 아래 오른쪽. 값이 바뀔 때만 다시 그린다.
  const msgOn = (k) => !(isObj(conf.msg) && conf.msg[k] === false);
  const msgAny = () => msgOn('chars') || msgOn('time') || msgOn('cost') || msgOn('model');
  const isMsgObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v._id === 'string' && 'content' in v && 'role' in v;
  const fiberOf = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$')); return k ? el[k] : null; };
  function groupMsg(g) {
    const root = fiberOf(g);
    if (!root) return null;
    const st = [[root.child, 0]];
    for (let n = 0; st.length && n < 300;) {
      const [f, d] = st.pop();
      if (!f) continue;
      n++;
      let h = f.memoizedState;
      for (let i = 0; h && typeof h === 'object' && 'next' in h && i < 40; i++, h = h.next) {
        const v = h.memoizedState;
        if (isMsgObj(v)) return v;
        if (Array.isArray(v) && isMsgObj(v[0])) return v[0];
      }
      if (f.sibling) st.push([f.sibling, d]);
      if (f.child && d < 6) st.push([f.child, d + 1]);
    }
    return null;
  }
  const oidTime = (id) => { const s = parseInt(String(id).slice(0, 8), 16); return isFinite(s) && s > 0 ? new Date(s * 1000) : null; };
  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  // 크래커 기록(방별)
  const COST_PREFIX = 'crack-pc-base:cost:';
  let costRoom = '', costMap = {};
  function costLoad(id) {
    if (id === costRoom) return costMap;
    costRoom = id;
    costMap = (id && readJSON(COST_PREFIX + id)) || {};
    return costMap;
  }
  function costRecord(d) {
    if (!d || d.role !== 'assistant' || !d._id || !d.cashUsage || !(msgOn('cost') || dashOn('on'))) return; // 대시보드 누적·직전 차감도 이 기록을 쓴다
    const id = d.chatId || roomId();
    if (!id) return;
    const m = costLoad(id);
    const u = d.cashUsage;
    m[d._id] = { t: Number(u.total) || 0, p: Number(u.paid) || 0, f: Number(u.free) || 0, x: Number(d.additionalOutputCracker) || 0, s: d.status || '', at: Date.now() };
    const ids = Object.keys(m);
    if (ids.length > 500) { ids.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)); for (const k of ids.slice(0, ids.length - 500)) delete m[k]; }
    writeJSON(COST_PREFIX + id, m);
    msgSoon(300);
  }

  // 모델 기록(크랙 모델 목록에서 자동으로 채움)
  const MODELS_KEY = 'crack-pc-base:models';
  let models = readJSON(MODELS_KEY) || {};
  let modelsAsked = '';
  // 크랙 목록에는 서비스 종료 모델(deletedAt)이 섞여 오고, 같은 crackerModel이 살아 있는 항목과 종료 항목으로 두 번 올 때도 있다
  // (실측: fablechat_1_0, hyperchat_2_0). 살아 있는 항목을 우선하고 종료 여부는 dead로 기억한다. 목록에서 빠진 모델도 dead.
  function modelsMerge(list) {
    if (!Array.isArray(list)) return;
    const next = {};
    for (const m of list) {
      if (!m || !m.crackerModel) continue;
      const alive = !m.deletedAt && !m.isBlock;
      const prev = next[m.crackerModel];
      if (prev && !prev.dead && !alive) continue;
      const engine = m.displayModelName || (String(m.description || '').match(/^(.+?)(을|를) 활용한/) || [])[1] || '';
      const icon = (m.assets && m.assets.icon && m.assets.icon.default) || '';
      const color = m.styleProperties && m.styleProperties.mainColor ? m.styleProperties.mainColor : null;
      const ev = m.crackerEvent && m.crackerEvent.isDiscountActive ? Number(m.crackerEvent.discountedCrackerQuantity) : NaN;
      next[m.crackerModel] = { name: m.name || m.crackerModel, engine, icon, color, id: m._id || '', cost: isFinite(ev) ? ev : Number(m.crackerQuantity) || 0, dead: !alive };
    }
    let changed = false;
    for (const k of Object.keys(next)) {
      if (JSON.stringify(models[k]) !== JSON.stringify(next[k])) { models[k] = next[k]; changed = true; }
    }
    for (const k of Object.keys(models)) {
      if (!next[k] && !models[k].dead) { models[k] = Object.assign({}, models[k], { dead: true }); changed = true; }
    }
    if (changed) { writeJSON(MODELS_KEY, models); msgSoon(100, true); emit('models', models); }
  }
  // 크랙은 chat-models를 여러 모양으로 부른다(실측: 인자 없음 / serviceType=story만 / storyId만 / 둘 다).
  // 이 작품 스토리 목록(serviceType=story + storyId)만 받는다. 다른 목록을 섞으면 '목록에 없음 → 종료' 판정이 틀어진다
  function onModelsXhr(m, url, status, j) {
    if (!/[?&]serviceType=story(?:&|$)/.test(url) || !/[?&]storyId=/.test(url)) return;
    if (status === 200 && j && j.data) modelsMerge(j.data.models);
  }
  // 크랙이 우리가 붙기 전에 이미 불렀을 수 있어서, 작품마다 한 번은 직접 받아 둔다
  async function modelsEnsure() {
    const sm = location.pathname.match(/\/stories\/([^/?#]+)/);
    const sid = sm ? sm[1] : '';
    if (!sid || modelsAsked === sid || !(msgOn('model') || modelOn('stats') || modelOn('hide') || dashOn('on'))) return;
    modelsAsked = sid;
    const r = await crackFetch('GET', '/crack-gen/v3/chat-models?serviceType=story&storyId=' + encodeURIComponent(sid)).catch(() => null);
    if (r && r.ok && r.json && r.json.data) modelsMerge(r.json.data.models);
  }
  function modelInfo(token) {
    if (!token) return null;
    const m = models[token];
    if (m) return m;
    // 처음 보는 코드: 크랙 아이콘 주소 규칙(hyperchat_1_5 → hyperchat1_5.webp)으로 추정
    return { name: token, engine: '', icon: 'https://cdn-image.wrtn.ai/crack/graphics/model-icon/' + String(token).replace(/_(?=\d)/, '') + '.webp', color: null, guess: true };
  }

  // 배치는 사용자 합본 1.2.0 '메시지 배지' 그대로:
  //  - 글자수·시각: AI 답변은 하단 줄 오른쪽 묶음에서 '답변 비교' > 다시 생성 > 메시지 옵션 버튼 바로 왼쪽.
  //    사용자 메시지는 메시지 아래 오른쪽 정렬 한 줄(소설형은 사용자 상자 바로 아래).
  //  - 크래커·모델 아이콘: AI 답변 하단 줄 왼쪽 칸 맨 앞(모델 → 크래커 순). 모델 아이콘은 크랙이 이미 보여 주는 화면(채팅형)에서는 생략
  const NUMF = new Intl.NumberFormat('ko-KR');
  const COST_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.2 4.2A4.5 4.5 0 0 1 12 4.2A4.5 4.5 0 0 1 13.5 3.36A7 7 0 0 0 20.17 11.5A4.5 4.5 0 0 1 19.8 12A4.5 4.5 0 0 1 19.8 17.8A2 2 0 0 1 17.8 19.8A4.5 4.5 0 0 1 12 19.8A4.5 4.5 0 0 1 6.2 19.8A2 2 0 0 1 4.2 17.8A4.5 4.5 0 0 1 4.2 12A4.5 4.5 0 0 1 4.2 6.2A2 2 0 0 1 6.2 4.2ZM8 6.6L9.4 8L8 9.4L6.6 8ZM8 14.6L9.4 16L8 17.4L6.6 16ZM16 14.6L17.4 16L16 17.4L14.6 16ZM12 10.6L13.4 12L12 13.4L10.6 12Z"/></svg>';
  const fullDate = (d) => d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + '. ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  let msgT = 0, msgVer = 0, msgOffVer = -1;
  // bump: 설정·모델 정보가 바뀌어 모든 그룹을 다시 그려야 할 때(기억해 둔 그림을 무효로)
  function msgSoon(ms, bump) { if (bump) msgVer++; clearTimeout(msgT); msgT = setTimeout(msgRenderAll, ms == null ? 150 : ms); }
  // 그룹마다 마지막으로 그린 상태: 같은 메시지 객체(크랙은 바뀌면 새 객체)·같은 설정판·같은 크래커 값이고 우리 요소가 그대로 붙어 있으면 다시 그리지 않는다
  const msgMemo = new WeakMap();
  // AI 답변 하단 줄: 메시지 옵션 버튼이 든 justify-between 줄. 왼쪽 칸 = 그 줄의 첫 자식(옵션이 들어 있지 않은 쪽)
  function msgActions(g) {
    const opt = g.querySelector('button[aria-label="메시지 옵션"]');
    const row = opt && opt.closest('.flex.items-center.justify-between');
    if (!row || !g.contains(row)) return null;
    const left = row.firstElementChild && !row.firstElementChild.contains(opt) ? row.firstElementChild : null;
    let anchor = null;
    for (const b of g.querySelectorAll('button')) {
      if (/답변\s*비교\s*\d+\s*\/\s*\d+/.test((b.textContent || '').replace(/\s+/g, ' '))) { anchor = b; break; }
    }
    if (!anchor) anchor = Array.from(row.querySelectorAll('button')).find((b) => b !== opt && !b.closest('.dropdown-button') && (b.innerHTML || '').includes('M3.8 12')) || null;
    if (!anchor) anchor = opt.closest('.dropdown-button') || opt;
    return { row, left, anchor };
  }
  function infoRowFor(g) {
    const novel = g.querySelector('div.border-y.border-outline_tertiary.py-5');
    if (novel && novel.parentElement) {
      let row = novel.nextElementSibling;
      if (!row || !row.classList.contains('cpb-info-row')) { row = document.createElement('div'); row.className = 'cpb-info-row'; novel.parentElement.insertBefore(row, novel.nextSibling); }
      return row;
    }
    const wrap = g.querySelector(':scope > .relative.mb-5.items-end') || g.firstElementChild;
    if (!wrap) return null;
    let row = wrap.querySelector(':scope > .cpb-info-row');
    if (!row) { row = document.createElement('div'); row.className = 'cpb-info-row'; }
    if (row !== wrap.lastElementChild) wrap.appendChild(row);
    return row;
  }
  function own(g, cls, tag) {
    let el = g.querySelector('.' + cls);
    if (!el) { el = document.createElement(tag || 'span'); el.className = cls; }
    return el;
  }
  const drop = (g, sel) => { for (const el of g.querySelectorAll(sel)) el.remove(); };
  function msgRenderGroup(g, force) {
    const msg = page && msgAny() ? groupMsg(g) : null;
    const cost = msg && msg.role !== 'user' && msgOn('cost') ? (costLoad(msg.chatId || roomId())[msg._id] || {}).t || 0 : 0;
    const memo = msgMemo.get(g);
    const len = msg ? String(msg.content || '').length : -1;
    if (!force && memo && memo.msg === msg && memo.len === len && memo.ver === msgVer && memo.cost === cost && memo.els.every((el) => el.isConnected && g.contains(el))) return;
    msgRenderGroupNow(g, msg);
    msgMemo.set(g, { msg, len, ver: msgVer, cost, els: Array.from(g.querySelectorAll('.cpb-info, .cpb-cost, .cpb-model')) });
  }
  function msgRenderGroupNow(g, msg) {
    if (g.querySelector('.cpb-mi')) drop(g, '.cpb-mi'); // 0.5.0의 합친 칩 정리
    if (!msg) { drop(g, '.cpb-info, .cpb-info-row, .cpb-cost, .cpb-model'); return; }
    const isUser = msg.role === 'user';
    const a = isUser ? null : msgActions(g); // AI 하단 줄은 한 번만 찾는다
    // 1) 글자수 · 생성 시각(전체 날짜, 마우스 올릴 필요 없음)
    const parts = [];
    if (msgOn('chars')) parts.push(NUMF.format(Array.from(String(msg.content || '')).length) + '자');
    const d = msgOn('time') ? oidTime(msg._id) : null;
    if (d) parts.push(fullDate(d));
    if (!parts.length || (isUser && !msgOn('user'))) drop(g, '.cpb-info, .cpb-info-row');
    else {
      const el = own(g, 'cpb-info');
      if (isUser) {
        const row = infoRowFor(g);
        if (row && el.parentNode !== row) row.appendChild(el);
      } else if (a && a.anchor.parentElement && (el.parentNode !== a.anchor.parentElement || el.nextElementSibling !== a.anchor)) a.anchor.parentElement.insertBefore(el, a.anchor);
      const label = parts.join(' · ');
      if (el.textContent !== label) el.textContent = label;
    }
    if (isUser) { drop(g, '.cpb-cost, .cpb-model'); return; }
    const left = a && a.left;
    // 2) 모델 아이콘(크랙이 이미 보여 주는 채팅형에서는 생략)
    const native = g.querySelector('img[alt="model"]');
    if (!left || !msgOn('model') || !msg.crackerModel || native) drop(g, '.cpb-model');
    else {
      const mi = modelInfo(msg.crackerModel);
      const el = own(g, 'cpb-model');
      if (el.parentNode !== left || left.firstElementChild !== el) left.insertBefore(el, left.firstChild);
      if (el.dataset.k !== msg.crackerModel + '|' + mi.icon) {
        el.dataset.k = msg.crackerModel + '|' + mi.icon;
        el.innerHTML = '<img src="' + escHtml(mi.icon) + '" alt="" aria-hidden="true">';
        el.title = mi.name + (mi.engine ? ' · ' + mi.engine : '');
      }
    }
    // 3) 크래커(설치 뒤 생성된 답변만)
    const c = left && msgOn('cost') ? costLoad(msg.chatId || roomId())[msg._id] : null;
    if (!c || !(c.t > 0)) drop(g, '.cpb-cost');
    else {
      const el = own(g, 'cpb-cost');
      const model = left.querySelector(':scope > .cpb-model');
      const ref = model ? model.nextSibling : left.firstChild;
      if (el.parentNode !== left || (model ? el.previousElementSibling !== model : left.firstElementChild !== el)) left.insertBefore(el, ref);
      const text = NUMF.format(c.t) + '개';
      if (el.dataset.k !== text) { el.dataset.k = text; el.innerHTML = COST_SVG + '<span>' + text + '</span>'; }
      const tip = '이 답변의 크래커 차감: ' + text + ' (유료 ' + c.p + ' · 무료 ' + c.f + ')' + (c.x ? '\n답변 길이 추가분 ' + c.x + '개 포함' : '') + (c.s === 'cancel' ? '\n생성 중단된 답변' : '');
      if (el.title !== tip) el.title = tip;
    }
  }
  function msgRenderAll() {
    msgT = 0;
    if (!page || !foldList || !foldList.isConnected) return;
    modelsEnsure(); // 쓰는 기능이 없으면 안에서 그냥 돌아온다
    statsSoon(300); // 우측 메뉴가 다시 그려졌을 수 있으니 카드도 확인(바뀐 게 없으면 아무것도 안 씀)
    // 메시지 옆 표시가 다 꺼져 있으면 그룹을 돌지 않는다. 꺼진 직후(설정판이 바뀐 뒤) 한 번만 우리 요소를 걷는다
    if (!msgAny()) {
      if (msgOffVer !== msgVer) { msgOffVer = msgVer; for (const el of foldList.querySelectorAll('.cpb-info, .cpb-info-row, .cpb-cost, .cpb-model, .cpb-mi')) el.remove(); }
      return;
    }
    msgOffVer = -1;
    let i = 0;
    for (const g of foldList.children) {
      if (!g.hasAttribute('data-message-group-id')) continue;
      i++;
      if (g.hasAttribute('data-cpb-fold')) continue; // 접힌 건 펼쳐질 때
      // 최신 4그룹은 늘 다시 본다(마지막 답변이 바뀌면 크랙이 하단 줄을 다시 그려 자리가 틀어질 수 있다). 나머지는 바뀐 것만
      attempt(() => msgRenderGroup(g, i <= 4));
    }
  }
  // ── 모델: 숨기기 · 방별 통계 ──
  // 숨기기: 크랙 모델 선택창(룸 상단바 모델 버튼의 Radix 창)과 '답변 길이 및 생각 조절' 창(모델별 접는 칸)에서
  // 고른 모델을 CSS로만 숨긴다(감시자 없음). 각 줄에는 크랙 공식 아이콘(model-icon/<파일>.webp)이 있어 그걸로 가린다.
  // 지금 쓰는 모델은 선택창에서 숨기지 않는다. 설정 'models.hidden' = [crackerModel…], 끄고 켜기 'models.hide'
  const modelOn = (k) => !(isObj(conf.models) && conf.models[k] === false);
  const modelHidden = () => new Set(isObj(conf.models) && Array.isArray(conf.models.hidden) ? conf.models.hidden : []);
  const iconFile = (token) => { const mi = modelInfo(token); return mi ? String(mi.icon).split('?')[0].split('/').pop() : ''; };
  function modelHideCss() {
    const files = modelOn('hide') ? Array.from(modelHidden()).map(iconFile).filter((f) => /^[\w.-]+$/.test(f)) : [];
    const rules = [];
    for (const f of files) {
      const img = 'img[src*="/model-icon/' + f + '"]';
      rules.push('[data-radix-popper-content-wrapper] [role="dialog"] button:not([aria-current="true"]):has(' + img + '){display:none!important}');
      rules.push('[role="dialog"] [data-orientation="vertical"]:has(> h3 ' + img + '){display:none!important}');
    }
    cssAdd('models:hide', rules.join('\n'));
  }
  function modelSetHidden(token, hide) {
    const s = modelHidden();
    if (hide) s.add(token); else s.delete(token);
    settings.set('models.hidden', Array.from(s));
  }

  // 방별 모델 통계: 생성이 끝날 때마다(중단 제외) 그 모델 +1, 쓴 크래커도 더한다. 설치 뒤 기록.
  // 같은 방을 탭 여러 개로 열어도 한 번만 세도록 메시지 ID를 기억한다(저장소를 매번 다시 읽음).
  // 사용자 합본의 예전 통계(ccms_chat_model_stats_v1, 방 키 'storyId:chatId')는 처음 한 번 옮겨 온다.
  const MSTATS_KEY = 'crack-pc-base:mstats';
  function mstatsRead() { const s = readJSON(MSTATS_KEY); return isObj(s) && isObj(s.rooms) ? s : { v: 1, rooms: {} }; }
  function mstatsMigrate() {
    const s = mstatsRead();
    if (s.migrated) return;
    const old = readJSON('ccms_chat_model_stats_v1');
    if (isObj(old) && isObj(old.rooms)) {
      for (const key of Object.keys(old.rooms)) {
        const id = key.split(':').pop();
        const src = old.rooms[key] && old.rooms[key].models;
        if (!id || !isObj(src)) continue;
        const room = s.rooms[id] || (s.rooms[id] = { m: {}, seen: [] });
        for (const tk of Object.keys(src)) {
          if (tk === 'unknown') continue;
          const r = room.m[tk] || (room.m[tk] = { n: 0, c: 0 });
          r.n += Number(src[tk]) || 0;
        }
      }
    }
    s.migrated = 1;
    writeJSON(MSTATS_KEY, s);
  }
  function mstatsRecord(d) {
    if (!d || d.role !== 'assistant' || !d._id || d.status === 'cancel' || !d.crackerModel) return;
    const id = d.chatId || roomId();
    if (!id) return;
    const s = mstatsRead();
    const room = s.rooms[id] || (s.rooms[id] = { m: {}, seen: [] });
    if (!Array.isArray(room.seen)) room.seen = [];
    if (room.seen.includes(d._id)) return;
    room.seen.push(d._id);
    if (room.seen.length > 200) room.seen.splice(0, room.seen.length - 200);
    const r = room.m[d.crackerModel] || (room.m[d.crackerModel] = { n: 0, c: 0 });
    r.n++;
    r.c += Number(d.cashUsage && d.cashUsage.total) || 0;
    room.at = Date.now();
    writeJSON(MSTATS_KEY, s);
    statsSoon(200);
  }

  // 통계 카드: 우측 방 메뉴 '나의 크래커' 잔액 줄 바로 아래. 큰 숫자 + 모델 대표색 비율 막대 + 범례 줄(올리면 그 모델만 또렷)
  let statsT = 0, statsEl = null, statsMode = 'n';
  function statsSoon(ms) { clearTimeout(statsT); statsT = setTimeout(statsRender, ms == null ? 150 : ms); }
  let statsLabel = null;
  function statsAnchor(panel) {
    const label = Array.from(panel.querySelectorAll('span, p, div')).find((el) => el.childElementCount === 0 && el.textContent.trim() === '나의 크래커');
    statsLabel = label || null;
    let cur = label;
    for (let i = 0; i < 6 && cur && cur !== panel; i++) {
      // 제목의 다음 형제 중 숫자가 든 줄(잔액)을 찾는다. 없으면 한 단계 위에서 다시
      for (let s = cur.nextElementSibling; s; s = s.nextElementSibling) if (/\d[\d,]{1,}/.test(s.textContent || '')) return s;
      cur = cur.parentElement;
    }
    return null;
  }
  // 크랙 칸에 맞추기: '나의 크래커' 제목의 실제 글꼴(테마 확프가 바꿨어도 그대로)과 글 시작 위치, 잔액 아이콘 위치를 읽어 쓴다
  function statsAlign(anchor) {
    const t = statsEl.querySelector('.h .t');
    if (!statsLabel || !t) return;
    const ls = getComputedStyle(statsLabel);
    const font = [ls.fontSize, ls.fontWeight, ls.letterSpacing, ls.lineHeight, ls.color, ls.fontFamily].join('|');
    if (t.dataset.f !== font) {
      t.dataset.f = font;
      Object.assign(t.style, { fontSize: ls.fontSize, fontWeight: ls.fontWeight, letterSpacing: ls.letterSpacing, lineHeight: ls.lineHeight, color: ls.color, fontFamily: ls.fontFamily });
    }
    const base = statsEl.getBoundingClientRect().left;
    const r = document.createRange();
    r.selectNodeContents(statsLabel);
    const tx = Math.max(0, Math.round(r.getBoundingClientRect().left - base));
    const icon = anchor.querySelector('svg, img');
    const cx = icon ? Math.max(0, Math.round(icon.getBoundingClientRect().left - base)) : tx;
    if (statsEl.style.getPropertyValue('--tx') !== tx + 'px') statsEl.style.setProperty('--tx', tx + 'px');
    if (statsEl.style.getPropertyValue('--cx') !== cx + 'px') statsEl.style.setProperty('--cx', cx + 'px');
  }
  const modelColor = (mi) => {
    const c = mi && mi.color;
    if (!c) return 'var(--text_tertiary,#85837d)';
    return (document.body && document.body.getAttribute('data-theme') === 'dark' ? c.dark : c.light) || c.light || c.dark;
  };
  function statsRender() {
    statsT = 0;
    const panel = els.right;
    const id = roomId();
    if (!page || !modelOn('stats') || !panel || !panel.isConnected || !id) { if (statsEl && statsEl.isConnected) statsEl.remove(); return; }
    const anchor = statsAnchor(panel);
    if (!anchor) return;
    if (!statsEl) {
      statsEl = document.createElement('div');
      statsEl.id = 'cpb-mstats';
      statsEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (!b || b.dataset.mode === statsMode) return;
        statsMode = b.dataset.mode;
        statsEl.dataset.sig = '';
        statsRender();
      });
      statsEl.addEventListener('mouseover', (e) => {
        const r = e.target.closest('.mr');
        const k = r ? r.dataset.k : '';
        if (statsEl.dataset.hl === k) return;
        if (k) statsEl.dataset.hl = k; else delete statsEl.dataset.hl;
        for (const i of statsEl.querySelectorAll('.bar i')) i.classList.toggle('on', i.dataset.k === k);
      });
      statsEl.addEventListener('mouseleave', () => { delete statsEl.dataset.hl; });
    }
    if (statsEl.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', statsEl);
    const room = mstatsRead().rooms[id];
    const m = (room && room.m) || {};
    const val = (k) => (statsMode === 'n' ? m[k].n : m[k].c) || 0;
    const keys = Object.keys(m).filter((k) => val(k) > 0).sort((a, b) => val(b) - val(a));
    const total = keys.reduce((s, k) => s + val(k), 0);
    const theme = document.body ? document.body.getAttribute('data-theme') : '';
    const sig = id + '|' + statsMode + '|' + theme + '|' + keys.map((k) => k + ':' + val(k)).join(',') + '|' + JSON.stringify(keys.map((k) => models[k] && [models[k].icon, models[k].dead]));
    if (statsEl.dataset.sig === sig) { statsAlign(anchor); return; }
    statsEl.dataset.sig = sig;
    queueMicrotask(() => attempt(() => statsAlign(anchor)));
    const unit = statsMode === 'n' ? '회' : '개';
    // 크랙 칸('시작설정'·'나의 크래커')과 같은 제목 클래스·여백을 쓴다(상자 없음)
    const head = '<div class="h"><span class="t">모델별 통계</span><span class="tog"><button type="button" data-mode="n" aria-pressed="' + (statsMode === 'n') + '">횟수</button><button type="button" data-mode="c" aria-pressed="' + (statsMode === 'c') + '">크래커</button></span></div>';
    if (!total) {
      statsEl.innerHTML = head + '<div class="bd"><div class="empty">' + (statsMode === 'n' ? '새로 생성되는 답변부터 모델별로 세요' : '새로 생성되는 답변부터 크래커를 모델별로 더해요') + '</div></div>';
      return;
    }
    const bar = keys.map((k, i) => '<i data-k="' + escHtml(k) + '" style="flex-grow:' + val(k) + ';--c:' + escHtml(modelColor(models[k] || modelInfo(k))) + ';animation-delay:' + i * 90 + 'ms"></i>').join('');
    const rows = keys.map((k) => {
      const mi = modelInfo(k), p = Math.round(val(k) / total * 100);
      return '<div class="mr" data-k="' + escHtml(k) + '" style="--c:' + escHtml(modelColor(mi)) + '"><span class="ic"><img src="' + escHtml(mi.icon) + '" alt=""></span>'
        + '<span class="nm"><b>' + escHtml(mi.name) + (mi.dead ? '<em>종료</em>' : '') + '</b>' + (mi.engine ? '<small>' + escHtml(mi.engine) + '</small>' : '') + '</span>'
        + '<span class="v">' + NUMF.format(val(k)) + unit + '</span><span class="p">' + p + '%</span></div>';
    }).join('');
    statsEl.innerHTML = head + '<div class="bd"><div class="big"><b>' + NUMF.format(total) + '</b><span>' + (statsMode === 'n' ? '회 생성' : '개 사용') + '</span></div>'
      + '<div class="bar" aria-hidden="true">' + bar + '</div><div class="list">' + rows + '</div></div>';
  }

  // 묶음 안 클릭('답변 비교' 넘기기, 메시지 옵션 등) 뒤에는 그 화면이 바뀔 수 있으니 조금 뒤 다시 본다
  // 목록 안 클릭('답변 비교' 넘기기 등): 누른 그룹만 다시 그린다
  function onMsgClick(e) {
    if (!(page && msgAny() && foldList && foldList.contains(e.target))) return;
    const g = e.target.closest ? e.target.closest('[data-message-group-id]') : null;
    if (g && g.parentElement === foldList) setTimeout(() => attempt(() => msgRenderGroup(g, true)), 300);
  }
  function onMsgXhr(m, url, st) {
    if (m === 'PATCH' || m === 'DELETE') msgSoon(400, true); // 고친 글은 같은 객체일 수 있어 기억한 그림을 무효로
    if (m === 'DELETE' && st >= 200 && st < 300) turnsOnDelete(url);
  }

  // ── 대시보드: 입력창 상자 안 맨 위 두 줄(원래 자리) ──
  // 1줄: 지금 모델 아이콘 버튼(누르면 빠른 선택 · 눈으로 숨기기) | 크랙 우측 메뉴 바로가기(크랙 오리지널 아이콘) · 로그 검색 | 테마 · 작품 화면 | 다른 확장 바로가기
  // 2줄: 진행 턴 · 이 방 누적 크래커 · 잔여 크래커(남은 턴 추정) · 직전 차감. 숫자를 누르면 이름이 펼쳐진다
  // 버튼과 숫자 하나하나 켜고 끌 수 있다(설정 'dash.btn.<키>', 'dash.info.<키>'). 상자 맨 앞에 우리 요소 하나만 넣는다
  const dashOn = (k) => !(isObj(conf.dash) && conf.dash[k] === false);
  const dashBtnOn = (k) => !(isObj(conf.dash) && isObj(conf.dash.btn) && conf.dash.btn[k] === false);
  const dashInfoOn = (k) => !(isObj(conf.dash) && isObj(conf.dash.info) && conf.dash.info[k] === false);
  const DSVG = (inner, fill) => '<svg class="cpb-anim" viewBox="0 0 24 24" fill="' + (fill || 'currentColor') + '" aria-hidden="true">' + inner + '</svg>';
  const DASH_BTNS = [
    { k: 'guide', label: '플레이 가이드', svg: DSVG('<path class="needle" fill-rule="evenodd" d="M15.43 6.9c.5-.25 1.07-.14 1.44.23s.48.93.23 1.44l-2.61 5.33q-.2.4-.6.6l-5.33 2.6c-.5.26-1.08.15-1.44-.22a1.25 1.25 0 0 1-.23-1.44L9.5 10.1q.2-.4.6-.6zm-6.65 8.32 3.72-1.82-1.9-1.9z" clip-rule="evenodd"/><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 1.6a8.41 8.41 0 0 0 0 16.8 8.41 8.41 0 0 0 0-16.8" clip-rule="evenodd"/>') },
    { k: 'profile', label: '대화 프로필', svg: DSVG('<path d="M7.97 4.3v-.77h11.82V16.6h-.78v1.6h1.08c.7 0 1.3-.57 1.3-1.3V3.23c0-.7-.57-1.3-1.3-1.3H7.67c-.7 0-1.3.57-1.3 1.3V4.3z"/><g class="front"><path d="M10.11 8.9a2.66 2.66 0 1 0 0 5.32 2.66 2.66 0 0 0 0-5.32m0 6.13c-1 0-1.94.23-2.7.64a3.2 3.2 0 0 0-1.58 1.8c-.2.7.35 1.3.99 1.3h6.58c.64 0 1.2-.62 1-1.3a3.2 3.2 0 0 0-1.6-1.8 6 6 0 0 0-2.69-.64"/><path fill-rule="evenodd" d="M3.9 5.7c-.72 0-1.3.58-1.3 1.3v13.68c0 .72.58 1.3 1.3 1.3h12.43c.72 0 1.3-.58 1.3-1.3V7c0-.72-.58-1.3-1.3-1.3zm.3 14.68V7.3h11.83v13.08z" clip-rule="evenodd"/></g>') },
    { k: 'note', label: '유저 노트', svg: DSVG('<path class="lines" d="M8 8.35h8v-1.6H8zm8 4H8v-1.6h8zm-8 4h4v-1.6H8z"/><path fill-rule="evenodd" d="M3.75 3.29c0-.72.58-1.3 1.3-1.3h13.9c.72 0 1.3.58 1.3 1.3v12.6c0 .32-.12.65-.37.9l-4.55 4.8q-.38.4-.95.41H5.05a1.3 1.3 0 0 1-1.3-1.3zm1.6.3V20.4h8.44v-3.8c0-.72.58-1.3 1.3-1.3h3.56V3.6zM17.57 16.9l-2.18 2.3v-2.3z" clip-rule="evenodd"/>') },
    { k: 'prose', label: '문체 변경', svg: DSVG('<path class="spark" d="m17.83 7.17 1.07 3.2 3.2 1.07a.6.6 0 0 1 0 1.13l-3.2 1.07-1.07 3.2a.6.6 0 0 1-1.13 0l-1.07-3.2-3.2-1.07a.6.6 0 0 1 0-1.13l3.2-1.07 1.07-3.2a.6.6 0 0 1 1.13 0"/><path d="M3.14 13.28a1.28 1.28 0 1 0 0-2.56 1.28 1.28 0 0 0 0 2.56m5.11 0a1.28 1.28 0 1 0 0-2.56 1.28 1.28 0 0 0 0 2.56"/>') },
    { k: 'output', label: '답변 길이 및 생각 조절', svg: DSVG('<path d="M21 3.2H3v1.6h18zm0 5.75H3v1.6h18zM10 14.7H3v1.6h7z"/><path class="gear" d="m20.62 16.99.01-.31-.01-.31.77-.75a.64.64 0 0 0 .11-.77l-.77-1.33a.7.7 0 0 0-.83-.33l-.96.27a4 4 0 0 0-.54-.31l-.26-1.04a.64.64 0 0 0-.62-.48h-1.61c-.3 0-.55.2-.62.48l-.26 1.04a4 4 0 0 0-.54.31l-1.03-.29a.65.65 0 0 0-.73.29l-.8 1.39c-.15.25-.1.57.11.78l.77.74-.01.31.01.31-.77.75a.64.64 0 0 0-.11.77l.8 1.39c.14.25.44.38.73.3l1.03-.29q.26.18.54.31l.26 1.04c.07.29.32.49.62.49h1.61c.29 0 .54-.2.62-.48l.26-1.04q.29-.13.54-.31l1.04.3c.28.08.58-.05.72-.3l.81-1.4a.64.64 0 0 0-.11-.77zm-3.91 1.06a1.38 1.38 0 0 1 0-2.76 1.38 1.38 0 0 1 0 2.76"/>') },
    { k: 'summary', label: '요약 메모리', svg: DSVG('<path d="M16.25 10.8a5.39 5.39 0 1 0 .02 10.78 5.39 5.39 0 0 0-.02-10.78m0 9.16a3.78 3.78 0 1 1 0-7.57 3.78 3.78 0 0 1 0 7.57"/><path class="hands" d="M17.02 13.43h-1.5v3.12l2.02 1.55.91-1.2-1.43-1.09z"/><path d="M6.8 19.54v-3.29h-3V4.15h14.9V9.5h1.6V3.85c0-.72-.58-1.3-1.3-1.3H3.5c-.72 0-1.3.58-1.3 1.3v12.7c0 .72.58 1.3 1.3 1.3h1.7v3.2a.9.9 0 0 0 .89.89q.3 0 .58-.21l3.35-2.81-1.03-1.22z"/><path d="M16.5 6.72H6v1.6h10.5zM11 10.03H6v1.6h5z"/>') },
    { k: 'image', label: '상황 이미지 보기', sw: true, svg: DSVG('<path class="play" d="m11.7 6.08 6.36 3.67-6.36 3.67z"/><path fill-rule="evenodd" d="M6.71 3.91c0-.94.76-1.7 1.7-1.7H20.1c.94 0 1.7.76 1.7 1.7V15.6c0 .94-.76 1.7-1.7 1.7h-2.81v2.8c0 .94-.76 1.7-1.7 1.7H3.9a1.7 1.7 0 0 1-1.7-1.7V8.41c0-.94.76-1.7 1.7-1.7h2.81zm1.7-.1a.1.1 0 0 0-.1.1V15.6q0 .1.1.1H20.1a.1.1 0 0 0 .1-.1V3.91a.1.1 0 0 0-.1-.1zm0 13.49h7.28v2.8a.1.1 0 0 1-.1.1H3.9a.1.1 0 0 1-.1-.1V8.41q0-.1.1-.1h2.81v7.29c0 .94.76 1.7 1.7 1.7" clip-rule="evenodd"/>') },
    { k: 'archive', label: '이미지 보관함', svg: DSVG('<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m.4 16c0 .22-.18.4-.4.4H5a.4.4 0 0 1-.4-.4V5c0-.22.18-.4.4-.4h14c.22 0 .4.18.4.4z"/><path class="mount" d="M8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>') },
  ];
  // 다른 확장 바로가기(대시보드 1줄, 크랙 버튼 뒤 구분선 다음): 그 확장이 켜져 있을 때만 보인다.
  // 각 확장이 직접 만든 버튼·여는 함수만 정확한 이름으로 찾는다(비슷하게 생긴 다른 버튼을 누르지 않게). 옛 채팅 허브와 같은 연결 방식
  const XSVG = (inner) => '<svg class="cpb-anim" viewBox="1 1 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const XBG_SVG = '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path class="mount" d="M20.5 15.5l-4.5-4.5-8 8"/>';
  const xApi = (name) => { const v = window[name]; return v && typeof v.openSettings === 'function' ? v : null; };
  // 배경 테마 두 판은 설정 창 아이디가 같다. 둘 다 켜져 있으면 남아 있는 창을 치우고 고른 쪽을 연다(옛 허브와 같음)
  function xBgOpen(api) {
    if ((xApi('CrackCustomRoomBackground') || xApi('SGBDirectBackground')) && xApi('CSPGeneratedBackgroundBlur')) { const m = document.getElementById('sgb-bg-settings-modal'); if (m) m.remove(); }
    api.openSettings();
  }
  // 길게 누르기(포인터만, 키보드 신호는 쓰지 않는다): 위시 매니저는 버튼을 0.54초 누르고 있으면 본창을 연다
  function holdPress(el, ms) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 31, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    setTimeout(() => el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, o, { buttons: 0 }))), ms);
  }
  const DASH_EXT = [
    { k: 'xMemory', label: '요약 메모리 도구', svg: XSVG('<path d="M9.5 4.5A3 3 0 0 0 6.5 7.6 3 3 0 0 0 4.6 13a3 3 0 0 0 2 4.9A3 3 0 0 0 12 18.6V6a2.4 2.4 0 0 0-2.5-1.5z"/><path d="M14.5 4.5a3 3 0 0 1 3 3.1 3 3 0 0 1 1.9 5.4 3 3 0 0 1-2 4.9A3 3 0 0 1 12 18.6"/><path class="spark" d="M12 9.5h2.5M12 13.5h3"/>'),
      find: () => document.querySelector('button.crack-ext-header-ai-btn') || document.querySelector('#crack-ext-ai-sidebar-menu [role="button"]'),
      open: (el) => el.click() },
    { k: 'xWish', label: '위시 RP 매니저', svg: XSVG('<path d="M20 4C12.5 4 7 9 6 16.5L5 20"/><path class="tail" d="M7.5 13c4 .3 8-1.7 10.5-5.5M9.5 9.2c2.5 0 5-.8 7-2.4"/>'),
      // Core(.wish-mon-core)는 연결하지 않는다
      find: () => document.querySelector('button#rpcm-fab.rpcm-header-monitor'),
      open: (el) => { if (!document.getElementById('rpcm-overlay')) holdPress(el, 640); } },
    { k: 'xPaint', label: '장면 그리기 설정', svg: XSVG('<path d="M14.5 4.5l5 5-7.5 7.5-5-5z"/><path class="tail" d="M7 12c-2 .5-3.5 2.3-3.5 4.5 0 1.2-.5 2.2-1.5 2.8 1.2.9 2.6 1.2 4 1.2 2.6 0 4.6-1.7 5-4"/>'),
      // 새 판은 html[data-csp-dashboard-bridge]로 설정 열기 신호를 받는다. 아니면 우측 패널 'AI 삽화 생성' 줄 본체(스위치 말고)를 누른다 → 설정 창
      find: () => (document.documentElement.getAttribute('data-csp-dashboard-bridge') === '1' ? 'bridge' : document.querySelector('#csp-scene-painter-row [role="button"]')),
      open: (t) => (t === 'bridge' ? document.dispatchEvent(new CustomEvent('csp:dashboard-open-settings')) : t.click()) },
    { k: 'xTranscript', label: '대화록 (로그 저장)', svg: XSVG('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><g class="drop"><path d="M12 10.5v6M9.5 14l2.5 2.5 2.5-2.5"/></g>'),
      // 🪶 Crack Transcript: 크랙 우측 메뉴에 넣는 '로그 저장' 줄(래퍼 [data-crack-transcript]). 메뉴가 숨어 있어도 DOM에 있다. 다시 눌러도 창은 하나
      find: () => document.querySelector('[data-crack-transcript] > [role="button"]'),
      open: (el) => el.click() },
    { k: 'xHud', label: 'INFO Game HUD', svg: XSVG('<g class="gem"><path d="M12 3l5.5 6.5L12 16l-5.5-6.5z"/><path d="M9.3 9.5h5.4"/></g><path d="M4.5 20h15" opacity=".35"/><path class="hp" d="M4.5 20h9"/>'),
      // 👾 INFO Game HUD: 머리줄 고정(dock)이면 #cigh-clean-dock-fab(click으로 열고 닫음), 아니면 떠 있는 #cigh-clean-fab.
      // 떠 있는 버튼은 click이 아니라 pointerup에서 열린다(0.52초 누르고 있으면 다시 분석) → 누르자마자 뗀다. 둘 다 누를 때마다 열고 닫는다
      find: () => document.getElementById('cigh-clean-dock-fab') || [document.getElementById('cigh-clean-fab')].find((b) => b && b.style.display !== 'none') || null,
      open: (el) => {
        if (el.id === 'cigh-clean-dock-fab') { el.click(); return; }
        const o = { bubbles: true, cancelable: true, composed: true, pointerId: 32, pointerType: 'mouse', isPrimary: true, button: 0 };
        el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ buttons: 1 }, o)));
        el.dispatchEvent(new PointerEvent('pointerup', Object.assign({ buttons: 0 }, o)));
      } },
    { k: 'xArchive', label: '기록보관소', svg: XSVG('<path class="mount" d="M3.5 4.5h17V9h-17z"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>'),
      // 🗃️ Crack Archive: 우측 메뉴 '나의 크래커'/'북마크' 묶음 끝에 넣는 div#coa-sidebar-button(안의 button 클릭이 올라가 보관소 창을 연다).
      // 그 자리를 못 찾으면 떠 있는 #coa-launcher-fallback의 'CA' 버튼. 샌드박스라 전역 API는 없다
      find: () => document.querySelector('#coa-sidebar-button > button') || document.querySelector('#coa-launcher-fallback button'),
      open: (el) => el.click() },
    { k: 'xTrans', label: '초월 번역 설정', svg: XSVG('<path d="M3.5 6h8M7.5 4v2"/><path d="M5.5 6c.6 2.8 2.4 4.8 5 5.8M9.5 6c-.5 2.6-2.2 4.8-5 6"/><g class="lang"><path d="M12.5 20l3.5-8.5 3.5 8.5M13.8 17h4.4"/></g>'),
      // 🅰️ 크랙 초월 번역기: 크랙 우측 메뉴 '키보드 단축키' 다음에 넣는 줄 div#trans-menu-btn(onclick = 설정 창 열기). 샌드박스라 전역 API는 없다
      find: () => document.getElementById('trans-menu-btn'),
      open: (el) => el.click() },
    { k: 'xBgRoom', label: '배경 테마 설정 (방 이미지)', svg: XSVG(XBG_SVG),
      find: () => xApi('CrackCustomRoomBackground') || xApi('SGBDirectBackground'), open: xBgOpen },
    { k: 'xBgScene', label: '배경 테마 설정 (삽화 배경)', svg: XSVG(XBG_SVG + '<path class="spark" d="M17.5 2.5v3M16 4h3"/>'),
      find: () => xApi('CSPGeneratedBackgroundBlur'), open: xBgOpen },
  ];
  const SUN_SVG = '<svg class="cpb-anim s1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><g class="rays"><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/></g></svg>';
  const MOON_SVG = '<svg class="cpb-anim s2" viewBox="1 1 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path class="star" d="M17.6 3.4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor" stroke="none"/></svg>';
  const BUBBLE_SVG = '<svg class="cpb-anim s1" viewBox="2 2 20 20" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v10H11l-4 3.5V15H5z"/><path class="tail" d="M9 9.5h6M9 12h4"/></svg>';
  const BOOK_SVG = '<svg class="cpb-anim s2" viewBox="1 1 22 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5c2.5-.7 5-.3 8 1.5v11.5c-3-1.8-5.5-2.2-8-1.5z"/><path class="page2" d="M20 5.5c-2.5-.7-5-.3-8 1.5v11.5c3-1.8 5.5-2.2 8-1.5z"/></svg>';
  const CRACKER_D = 'M21.17 12.01c.52-.59.83-1.36.83-2.21s-.31-1.62-.83-2.21l.17-.21q0-.01.02-.02l.14-.21q0-.02.03-.05.06-.1.1-.2l.05-.08.09-.2q.01-.05.04-.11l.06-.18q0-.08.04-.14.01-.07.04-.16l.03-.19q0-.06.02-.13v-.33a3.37 3.37 0 0 0-3.36-3.37l-.33.01q-.06 0-.12.02-.1 0-.2.03-.07 0-.15.04l-.14.04-.18.06-.11.04-.2.09-.07.04-.2.11q-.03 0-.05.03l-.21.14-.02.02-.21.17a3.4 3.4 0 0 0-4.42 0 3.3 3.3 0 0 0-2.21-.83c-.85 0-1.62.31-2.21.83l-.21-.17-.02-.02-.21-.14q-.02 0-.05-.03l-.2-.11-.08-.04-.2-.09-.11-.04-.18-.06-.14-.04-.16-.04-.2-.03-.12-.02-.33-.01a3.37 3.37 0 0 0-3.34 3.82q0 .1.03.19 0 .07.04.16 0 .08.04.14l.06.18q0 .05.04.11.03.1.09.19l.04.08.1.2q.01.02.04.05l.16.23q.07.1.17.21a3.3 3.3 0 0 0-.83 2.21c0 .85.3 1.62.83 2.21a3.3 3.3 0 0 0-.83 2.21c0 .85.3 1.62.83 2.21l-.17.21-.02.02-.14.21q0 .02-.03.05l-.11.2-.04.08-.1.2-.03.11-.06.18-.04.14-.04.16-.03.19-.02.13-.01.33A3.4 3.4 0 0 0 3.02 21c.6.61 1.45.99 2.38.99l.33-.01q.06 0 .12-.02.1 0 .19-.03.07 0 .16-.04l.14-.04.18-.06.1-.04.2-.09.08-.04.2-.11q.03 0 .05-.03l.2-.14.03-.02.2-.17a3.4 3.4 0 0 0 4.43 0 3.32 3.32 0 0 0 4.42 0 3 3 0 0 0 .44.33q.03 0 .05.03l.2.11.08.04.2.09.10.04.19.06.14.04.16.04.19.03.13.02.33.01c.92 0 1.75-.37 2.36-.97l.02-.02c.6-.61.99-1.45.99-2.38l-.01-.33q0-.06-.02-.12 0-.1-.03-.19 0-.07-.04-.16l-.04-.14-.06-.18-.04-.11-.1-.19-.03-.08-.11-.2q0-.02-.03-.05l-.14-.21-.02-.02-.17-.21c.52-.59.83-1.36.83-2.21s-.31-1.62-.83-2.21M7.5 13.5 6 12l1.5-1.5L9 12zM12 6l1.5 1.5L12 9l-1.5-1.5zm0 12-1.5-1.5L12 15l1.5 1.5zm4.5-4.5L15 12l1.5-1.5L18 12z';
  const INFO_SVG = {
    turns: '<svg class="cpb-anim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path class="hands" d="M12 6.5v5.5l3.5 2"/></svg>',
    total: '<svg class="cpb-anim" viewBox="0 0 24 24" aria-hidden="true"><path class="crk" fill="currentColor" d="' + CRACKER_D + '"/></svg>',
    balance: '<svg class="cpb-anim" viewBox="0 0 24 24" aria-hidden="true"><defs><mask id="cpb-bite"><rect width="24" height="24" fill="#fff"/><circle cx="24" cy="0" r="12" fill="#000"/></mask></defs><path class="crk" mask="url(#cpb-bite)" fill="currentColor" d="' + CRACKER_D + '"/></svg>',
    last: '<svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1 2.5h8L5 8.5z"/></svg>',
  };

  // 크랙 우측 메뉴 줄 찾기: 이름이 같은 글자의 가장 가까운 role=button(답변 길이는 고유 id). 메뉴가 숨어 있어도 DOM에 있다
  const rowCache = new Map();
  function panelRow(label) {
    const panel = els.right;
    if (label === '답변 길이 및 생각 조절') { const b = document.getElementById('max-output-modal-menu-button'); if (b) return b; }
    if (!panel || !panel.isConnected) return null;
    const hit = rowCache.get(label);
    if (hit && hit.isConnected && panel.contains(hit) && !hit.closest('.cpb-btn')) return hit;
    // 이미지 보관함: 크랙 줄은 '이미지 보관함 (해금/전체)' 글자의 평범한 button이다(role=button 아님)
    const vault = label === '이미지 보관함';
    // 우리 우측 메뉴 줄(.cpb-btn)은 이름이 같아도 제외(예: 우리 '이미지 보관함' 설정 메뉴)
    const lab = Array.from(panel.querySelectorAll(vault ? 'button span' : 'span, p, div')).find((e) => e.childElementCount === 0 && !e.closest('.cpb-btn')
      && (vault ? /^이미지 보관함 \(\d+\/\d+\)$/.test(e.textContent.trim()) : e.textContent.trim() === label));
    const row = lab ? lab.closest(vault ? 'button' : '[role="button"]') : null; // 크랙 메뉴 줄만. 아니면 누르지 않는다
    if (row) rowCache.set(label, row); else rowCache.delete(label);
    return row;
  }
  const rowSwitchOn = (row) => { const sw = row && row.querySelector('[role="switch"]'); return sw ? sw.getAttribute('aria-checked') === 'true' : null; };

  // 지금 모델: 룸 상단바 모델 버튼의 크랙 아이콘 → 우리 모델 기록에서 같은 아이콘 파일을 가진 살아 있는 모델
  function currentModel() {
    const img = els.roomBar && els.roomBar.querySelector('button[aria-haspopup="dialog"] img[src*="model-icon"]');
    const file = img ? String(img.getAttribute('src') || '').split('?')[0].split('/').pop() : '';
    if (!file) return '';
    const keys = Object.keys(models).filter((k) => iconFile(k) === file);
    return keys.find((k) => !models[k].dead) || keys[0] || '';
  }
  // 모델 바꾸기: 크랙 모델 선택창을 보이지 않게 열어 그 모델 줄을 대신 누른다(크랙 화면·상태가 그대로 맞는다)
  async function switchModel(token) {
    const file = iconFile(token);
    // 모델 아이콘이 든 버튼만. 다른 확프(요약 메모리 등)가 같은 aria-haspopup="dialog" 버튼을 모델 버튼 앞에 끼워 넣는다
    const icon = els.roomBar && els.roomBar.querySelector('button[aria-haspopup="dialog"] img[src*="model-icon"]');
    const trig = icon && icon.closest('button');
    if (!trig || !file) return false;
    const html = document.documentElement;
    flag(html, 'data-cpb-proxy', true);
    const sel = '[data-radix-popper-content-wrapper] [role="dialog"] button:has(img[src*="/model-icon/' + file + '"])';
    // 닫을 때는 같은 트리거를 한 번 더 누른다(Radix Popover는 클릭으로 열고 닫음). 가짜 Esc keydown은 keyup이 없어서
    // 크랙 단축키 처리기가 Esc를 계속 눌린 것으로 보고, 뒤의 Ctrl/Shift가 esc 단축키(요약 메모리 등)로 걸린다 — 쓰지 않는다
    const closeIfOpen = () => { if (trig.isConnected && trig.getAttribute('aria-expanded') === 'true') trig.click(); };
    try {
      trig.click();
      let item = null;
      for (let i = 0; i < 30 && !item; i++) { await new Promise((r) => setTimeout(r, 50)); item = document.querySelector(sel); }
      if (!item) { closeIfOpen(); return false; }
      item.click();
      await new Promise((r) => setTimeout(r, 250));
      closeIfOpen();
      return true;
    } finally {
      setTimeout(() => { flag(html, 'data-cpb-proxy', false); dashSoon(100); }, 300);
    }
  }

  // 테마: 크랙 설정 화면과 똑같이 쿠키(crack-user-theme, 크랙 쿠키 도메인)와 body[data-theme]만 바꾼다. 새로고침 없음
  const isDarkTheme = () => !!document.body && document.body.getAttribute('data-theme') === 'dark';
  function setTheme(v) {
    const nd = window.__NEXT_DATA__;
    const dom = nd && nd.props && nd.props.pageProps && nd.props.pageProps.env ? nd.props.pageProps.env.NEXT_PUBLIC_COOKIE_DOMAIN : '';
    document.cookie = 'crack-user-theme=' + v + '; path=/; max-age=' + (99 * 365 * 86400) + '; samesite=lax' + (dom ? '; domain=' + dom : '');
    if (document.body) document.body.dataset.theme = v;
    statsSoon(50);
    dashSoon(50);
  }
  // 작품 화면(소설형/채팅형): 크랙 프로필(SWR '/profiles')의 uiSetting.isEpisodeBubbleEnabled로 정해진다.
  // 빠른 길: 그 프로필 응답을 가진 컴포넌트의 SWR 묶인 mutate로 캐시 값을 바로 고치고(즉시 전환) 서버에 PATCH. 실패하면 되돌린다.
  // mutate를 못 찾으면 예전 길: PATCH 뒤 크랙의 '창에 돌아올 때 프로필 다시 불러오기'를 일으킨다(크랙은 5초에 한 번까지만 해서 느릴 수 있음)
  const isBubble = () => !!(foldList && foldList.isConnected && /\bgap-0\b/.test(foldList.className));
  // 찾는 기준(넓게 잡지 않음): 훅 상태가 SWR 응답이고 그 안에 data.data.uiSetting.isEpisodeBubbleEnabled(불리언)가 있는 컴포넌트,
  // 그 훅 바로 뒤 6칸 안의 의존성 없는 useCallback 중 '(...인자)=>' 모양인 것 = useSWR이 돌려주는 mutate(같은 키 캐시를 고침)
  function profileMutate() {
    if (!foldList || !foldList.isConnected) return null;
    const fk = Object.keys(foldList).find((k) => k.startsWith('__reactFiber$'));
    let top = fk ? foldList[fk] : null;
    while (top && top.return) top = top.return;
    const stack = top ? [top] : [];
    for (let n = 0; stack.length && n < 20000; n++) {
      const x = stack.pop();
      let h = x.memoizedState;
      for (let i = 0; h && typeof h === 'object' && 'next' in h && i < 80; i++, h = h.next) {
        const v = h.memoizedState;
        if (!(v && v.data && v.data.data && v.data.data.uiSetting && typeof v.data.data.uiSetting.isEpisodeBubbleEnabled === 'boolean')) continue;
        let g = h.next;
        for (let j = 0; g && j < 6; j++, g = g.next) {
          const c = g.memoizedState;
          if (Array.isArray(c) && typeof c[0] === 'function' && Array.isArray(c[1]) && c[1].length === 0 && c[0].length === 0 && /^\(\.\.\.\w+\)=>/.test(String(c[0]))) return c[0];
        }
      }
      if (x.sibling) stack.push(x.sibling);
      if (x.child) stack.push(x.child);
    }
    return null;
  }
  const withBubble = (b) => (cur) => (cur && cur.data && cur.data.uiSetting
    ? Object.assign({}, cur, { data: Object.assign({}, cur.data, { uiSetting: Object.assign({}, cur.data.uiSetting, { isEpisodeBubbleEnabled: b }) }) })
    : cur);
  let layoutBusy = false;
  async function setLayout(bubble) {
    if (layoutBusy) return;
    layoutBusy = true;
    try {
      const mut = attempt(profileMutate);
      if (mut) {
        await Promise.resolve(mut(withBubble(bubble), false)).catch(() => {}); // false = 다시 불러오지 않음
        const r = await crackFetch('PATCH', '/crack-api/profiles/ui-setting', { isEpisodeBubbleEnabled: bubble });
        if (!r.ok) { await Promise.resolve(mut(withBubble(!bubble), false)).catch(() => {}); toast('작품 화면을 바꾸지 못했어요', { key: 'layout' }); }
        return;
      }
      toast(bubble ? '채팅형으로 바꾸는 중이에요' : '소설형으로 바꾸는 중이에요', { key: 'layout' });
      const r = await crackFetch('PATCH', '/crack-api/profiles/ui-setting', { isEpisodeBubbleEnabled: bubble });
      if (!r.ok) { toast('작품 화면을 바꾸지 못했어요', { key: 'layout' }); return; }
      const kick = () => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); };
      const done = () => { const b = foldList && foldList.isConnected ? isBubble() : null; return b === bubble; };
      kick();
      for (const wait of [1200, 5200]) {
        await new Promise((res) => setTimeout(res, wait));
        if (done()) break;
        kick();
      }
      await new Promise((res) => setTimeout(res, 900));
      if (!done()) toast('새로고침하면 적용돼요 · 눌러서 새로고침', { icon: 'refresh', key: 'layout', duration: 6000, onClick: () => location.reload() });
    } finally { layoutBusy = false; dashSoon(100); }
  }

  // 정보: 진행 턴(방 전체 사용자 메시지 수), 누적(설치 뒤 이 방 답변 크래커 합), 잔액(크랙 잔액 응답, 생성마다 차감), 직전 차감
  const TURN_KEY = 'crack-pc-base:turns';
  let turnRoom = '', turnN = null, turnBusy = false, turnFail = 0, turnGen = 0, turnRT = 0;
  async function turnsEnsure() {
    const id = roomId();
    if (!id || !dashOn('on') || !dashInfoOn('turns')) return;
    if (turnRoom === id && (turnN != null || turnBusy || Date.now() - turnFail < 60000)) return; // 실패하면 1분 동안 다시 묻지 않는다
    turnRoom = id;
    turnBusy = true;
    const gen = ++turnGen; // 다시 세기가 새로 시작되면 옛 세기는 바로 멈춘다
    const all = readJSON(TURN_KEY) || {};
    const c = isObj(all[id]) ? all[id] : null;
    turnN = c ? Number(c.n) || 0 : null; // 센 적이 있으면 그 수를 먼저 보여 주고 새 메시지만 더한다
    try {
      // 최신부터 500개씩(로그 검색과 같은 크기: 1,300턴 방 = 6번). 지난번에 센 최신 메시지(top)를 만나면 거기서 멈추고 더한다
      let n = 0, top = '', cursor = '', hit = false;
      for (let page = 0; page < 300; page++) {
        const r = await crackFetch('GET', '/crack-gen/v3/chats/' + id + '/messages?limit=500' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        const d = r.ok && r.json && r.json.data;
        if (!d) throw new Error('messages');
        const ms = d.messages || [];
        if (!top && ms[0]) top = ms[0]._id;
        for (const m of ms) {
          if (c && m._id === c.top) { hit = true; break; }
          if (m.role === 'user') n++;
        }
        if (turnRoom !== id || gen !== turnGen) return;
        if (hit || !d.hasNext || !d.nextCursor) break;
        cursor = d.nextCursor;
      }
      turnN = (hit && c ? Number(c.n) || 0 : 0) + n;
      all[id] = { n: turnN, top: top || (c && c.top) || '', at: Date.now() };
      const ks = Object.keys(all);
      if (ks.length > 300) { ks.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)); for (const k of ks.slice(0, ks.length - 300)) delete all[k]; }
      writeJSON(TURN_KEY, all);
    } catch (_) { if (turnRoom === id && gen === turnGen) { turnN = null; turnFail = Date.now(); } } finally { if (turnRoom === id && gen === turnGen) turnBusy = false; dashSoon(); }
  }
  // 메시지를 지웠을 때(성공한 DELETE만): 답변(다시 생성 후보 포함)이면 턴 수 그대로, 내 메시지면 1 뺀다.
  // 모르면(크랙 저장소에 이미 없음 등) 이 방 기록을 버리고 다시 센다 — 여러 개를 지우면 2초로 묶어 한 번만
  function turnsOnDelete(url) {
    const id = roomId(), mid = (String(url).match(/\/messages\/([0-9a-f]{24})/i) || [])[1];
    const st = chatCtx(), msg = mid && st && st.store ? st.store.getState().messages.get(mid) : null;
    const all = readJSON(TURN_KEY) || {}, c = id && isObj(all[id]) ? all[id] : null;
    if (msg && msg.role && msg.role !== 'user' && !(c && c.top === mid)) return; // 답변만 지웠고 기준점도 아니다: 그대로
    if (msg && msg.role && c && turnRoom === id && turnN != null) {
      let top = c.top || '';
      if (top === mid) { // 센 기준점을 지웠으면 그보다 오래된 메시지 가운데 가장 최신을 새 기준점으로
        top = '';
        for (const k of st.store.getState().messages.keys()) if (typeof k === 'string' && k < mid && k > top) top = k;
      }
      if (top) {
        if (msg.role === 'user') turnN = Math.max(0, turnN - 1);
        all[id] = { n: turnN, top, at: Date.now() };
        writeJSON(TURN_KEY, all);
        dashSoon();
        return;
      }
    }
    clearTimeout(turnRT);
    turnRT = setTimeout(turnsReset, 2000);
  }
  // 이 방 기록을 버리고 다시 센다
  function turnsReset() {
    const id = roomId();
    if (!id) return;
    const all = readJSON(TURN_KEY) || {};
    if (all[id]) { delete all[id]; writeJSON(TURN_KEY, all); }
    if (turnRoom === id) { turnRoom = ''; turnN = null; }
    dashSoon(600);
  }
  function turnsBump(d) {
    const id = (d && d.chatId) || roomId();
    if (turnN == null || id !== turnRoom || !d || !d._id) return;
    turnN++;
    const all = readJSON(TURN_KEY) || {};
    all[id] = { n: turnN, top: d._id, at: Date.now() };
    writeJSON(TURN_KEY, all);
    dashSoon();
  }
  let balance = null, balAsked = false, balAt = 0, balT = 0;
  const cashQty = (j) => (j && j.data && typeof j.data.quantity === 'number' ? j.data.quantity : null);
  function onCashXhr(m, url, status, j) { const q = status === 200 ? cashQty(j) : null; if (q != null) { balance = q; balAt = Date.now(); dashSoon(); } }
  async function balanceFetch() {
    const r = await crackFetch('GET', '/crack-cash/cash').catch(() => null);
    const q = r && r.ok ? cashQty(r.json) : null;
    if (q != null) { balance = q; balAt = Date.now(); dashSoon(0); }
  }
  function balanceEnsure() {
    if (balance != null || balAsked || !dashOn('on') || !dashInfoOn('balance')) return;
    balAsked = true;
    balanceFetch();
  }
  // 답변이 완성되면 쓴 만큼 바로 빼서 보여 주고, 1.5초 뒤 실제 잔액으로 맞춘다
  // (그 사이 크랙이 잔액을 다시 불러왔으면 그 값을 쓰고 우리는 묻지 않는다). 생성 한 번에 많아야 한 번
  function dashOnGenerated(d) {
    dashSoon(300);
    const used = d && d.cashUsage ? Number(d.cashUsage.total) || 0 : 0;
    if (used <= 0 || balance == null || !dashOn('on') || !dashInfoOn('balance')) return;
    balance = Math.max(0, balance - used);
    const genAt = Date.now();
    clearTimeout(balT);
    balT = setTimeout(() => { if (balAt < genAt) balanceFetch(); }, 1500);
  }
  function lastCost() {
    const m = costLoad(roomId());
    let best = null;
    for (const k of Object.keys(m)) if (!best || (m[k].at || 0) > (best.at || 0)) best = m[k];
    return best;
  }

  let dashEl = null, dashT = 0, pickEl = null;
  const dashOpen = new Set();
  const calmMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 숫자 칸 갱신. 처음 값(또는 '…'에서 첫 값)은 그냥 쓰고, 값이 바뀌면 옛 값에서 새 값으로 굴려 세고(0.7초)
  // 칸을 잠깐 진하게, 아이콘을 톡 튀게 한다
  function dashNum(p, v) {
    const b = p.querySelector('b');
    if (v == null) { b._v = null; if (b.textContent !== '…') b.textContent = '…'; return; }
    const old = b._v;
    if (old === v) return;
    b._v = v;
    cancelAnimationFrame(b._raf);
    if (old == null || calmMotion() || document.hidden) { b.textContent = NUMF.format(v); return; }
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3);
      b.textContent = NUMF.format(Math.round(old + (v - old) * e));
      if (q < 1) b._raf = requestAnimationFrame(step);
    };
    b._raf = requestAnimationFrame(step);
    p.classList.remove('chg');
    void p.offsetWidth; // 같은 움직임을 처음부터 다시
    p.classList.add('chg');
    clearTimeout(p._chgT);
    p._chgT = setTimeout(() => p.classList.remove('chg'), 900);
  }
  function dashSoon(ms) { clearTimeout(dashT); dashT = setTimeout(dashRender, ms == null ? 120 : ms); }
  function dashBuild() {
    dashEl = document.createElement('div');
    dashEl.id = 'cpb-dash';
    const b = (k, tip, inner, extra) => '<button type="button" class="cpb-db' + (extra || '') + '" data-k="' + k + '" data-tip="' + escHtml(tip) + '" aria-label="' + escHtml(tip) + '">' + inner + '</button>';
    dashEl.innerHTML = '<div class="d1">' + b('model', '모델 바꾸기', '<img class="mimg" alt="">', ' dmodel') + '<i class="dsep" data-sep="model"></i>'
      + DASH_BTNS.map((x) => b(x.k, x.label, x.svg)).join('')
      + '<i class="dsep" data-sep="ui" hidden></i>' + b('theme', '테마 바꾸기', SUN_SVG + MOON_SVG, ' dswap') + b('layout', '작품 화면 바꾸기', BUBBLE_SVG + BOOK_SVG, ' dswap')
      // 확장 묶음: 우리 로그 검색이 맨 앞, 그 뒤로 켜져 있는 다른 확장
      + '<i class="dsep" data-sep="ext" hidden></i>' + b('logsearch', '로그 검색', XSVG('<path d="M4 5h11M4 9.5h7M4 14h5"/><circle cx="15.5" cy="14.5" r="4"/><path d="M18.5 17.5L21 20"/>'))
      + DASH_EXT.map((x) => b(x.k, x.label, x.svg)).join('') + '</div>'
      + '<div class="d2">'
      + '<button type="button" class="cpb-dp" data-p="turns">' + INFO_SVG.turns + '<span class="lab">진행</span><b></b><span class="u">턴</span></button>'
      + '<i class="dot" data-dot="total"></i><button type="button" class="cpb-dp" data-p="total">' + INFO_SVG.total + '<span class="lab">누적</span><b></b><span class="u">개</span></button>'
      + '<i class="dot" data-dot="balance"></i><button type="button" class="cpb-dp" data-p="balance">' + INFO_SVG.balance + '<span class="lab">잔여</span><b></b><span class="u">개</span><span class="lab more"></span></button>'
      + '<i class="dot" data-dot="last"></i><span class="cpb-dp ded" data-p="last" title="직전 차감">' + INFO_SVG.last + '<b></b><span class="u">개</span></span>'
      + '</div>';
    dashEl.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // 입력창 포커스 유지
    dashEl.addEventListener('click', (e) => {
      const p = e.target.closest('button.cpb-dp');
      if (p) { const k = p.dataset.p; if (dashOpen.has(k)) dashOpen.delete(k); else dashOpen.add(k); p.classList.toggle('open', dashOpen.has(k)); return; }
      const btn = e.target.closest('.cpb-db');
      if (!btn) return;
      e.stopPropagation();
      const k = btn.dataset.k;
      if (k === 'model') { pickToggle(); return; }
      if (k === 'theme') { setTheme(isDarkTheme() ? 'light' : 'dark'); return; }
      if (k === 'layout') { setLayout(!isBubble()); return; }
      if (k === 'logsearch') { lsOpen(); return; }
      const ext = DASH_EXT.find((x) => x.k === k);
      if (ext) {
        const t = ext.find();
        if (!t) { toast("'" + ext.label + "'이(가) 지금 켜져 있지 않아요", { key: 'dash' }); dashSoon(0); return; }
        attempt(() => ext.open(t));
        return;
      }
      const def = DASH_BTNS.find((x) => x.k === k);
      const row = def && panelRow(def.label);
      if (!row) { toast(def ? "'" + def.label + "'을(를) 찾지 못했어요" : '찾지 못했어요', { key: 'dash' }); return; }
      row.click();
      if (def.sw) setTimeout(() => dashSoon(0), 300);
    });
  }
  function dashRender() {
    dashT = 0;
    const box = cmp.box;
    const want = page && dashOn('on') && box && box.isConnected;
    if (!want) {
      if (dashEl && dashEl.isConnected) dashEl.remove();
      if (box) delAttr(box, 'data-cpb-dash');
      pickClose();
      return;
    }
    if (!dashEl) dashBuild();
    if (box.firstElementChild !== dashEl) box.insertBefore(dashEl, box.firstChild);
    flag(box, 'data-cpb-dash', true);
    // 1줄: 버튼 보이기(설정 + 크랙 메뉴에 있을 때만)
    const cur = currentModel();
    const mb = dashEl.querySelector('[data-k="model"]');
    const showModel = dashBtnOn('model') && !!cur;
    flag(mb, 'hidden', !showModel);
    flag(dashEl.querySelector('[data-sep="model"]'), 'hidden', !showModel);
    if (showModel) {
      const mi = modelInfo(cur);
      const img = mb.querySelector('img');
      if (img.getAttribute('src') !== mi.icon) img.setAttribute('src', mi.icon);
      const tip = mi.name + (mi.engine ? ' · ' + mi.engine : '');
      if (mb.dataset.tip !== tip) mb.dataset.tip = tip;
    }
    for (const x of DASH_BTNS) {
      const el = dashEl.querySelector('[data-k="' + x.k + '"]');
      const row = dashBtnOn(x.k) ? panelRow(x.label) : null;
      flag(el, 'hidden', !row);
      if (row && x.sw) {
        const on = rowSwitchOn(row);
        setAttr(el, 'aria-pressed', String(!!on));
        const tip = x.label + (on ? ' · 켜짐' : ' · 꺼짐');
        if (el.dataset.tip !== tip) el.dataset.tip = tip;
      }
    }
    let anyExt = dashBtnOn('logsearch') && lsOn('on');
    flag(dashEl.querySelector('[data-k="logsearch"]'), 'hidden', !anyExt);
    for (const x of DASH_EXT) {
      const show = dashBtnOn(x.k) && !!x.find();
      flag(dashEl.querySelector('[data-k="' + x.k + '"]'), 'hidden', !show);
      anyExt = anyExt || show;
    }
    flag(dashEl.querySelector('[data-sep="ext"]'), 'hidden', !anyExt);
    const tb = dashEl.querySelector('[data-k="theme"]'), lb = dashEl.querySelector('[data-k="layout"]');
    flag(tb, 'hidden', !dashBtnOn('theme'));
    flag(lb, 'hidden', !dashBtnOn('layout'));
    flag(dashEl.querySelector('[data-sep="ui"]'), 'hidden', !(dashBtnOn('theme') || dashBtnOn('layout')));
    const dark = isDarkTheme(), bub = isBubble();
    tb.classList.toggle('on', dark);
    lb.classList.toggle('on', !bub);
    const tt = dark ? '라이트로 바꾸기' : '다크로 바꾸기', lt = bub ? '소설형으로 바꾸기' : '채팅형으로 바꾸기';
    if (tb.dataset.tip !== tt) tb.dataset.tip = tt;
    if (lb.dataset.tip !== lt) lb.dataset.tip = lt;
    // 2줄: 숫자
    const d2 = dashEl.querySelector('.d2');
    const row2 = dashOn('row2');
    flag(d2, 'hidden', !row2);
    if (row2) {
      turnsEnsure();
      balanceEnsure();
      const lc = lastCost();
      const roomCost = costLoad(roomId());
      const total = Object.keys(roomCost).reduce((s, k) => s + (Number(roomCost[k].t) || 0), 0);
      const per = lc && lc.t > 0 ? lc.t : (cur && models[cur] ? models[cur].cost : 0);
      const vals = { turns: turnN, total, balance, last: lc ? Number(lc.t) || 0 : null };
      const shown = [];
      for (const k of ['turns', 'total', 'balance', 'last']) {
        const p = dashEl.querySelector('[data-p="' + k + '"]');
        const on = dashInfoOn(k) && (k !== 'last' || !!lc);
        flag(p, 'hidden', !on);
        if (on) { shown.push(k); dashNum(p, vals[k]); }
        else if (p.querySelector('b')._v !== undefined) p.querySelector('b')._v = undefined; // 다시 켤 때는 움직임 없이 바로
      }
      const more = dashEl.querySelector('[data-p="balance"] .more');
      const mt = balance != null && per > 0 ? '· 약 ' + NUMF.format(Math.floor(balance / per)) + '턴 가능 · 1회 ' + NUMF.format(per) + '개' : '';
      if (more.textContent !== mt) more.textContent = mt;
      for (const k of ['total', 'balance', 'last']) flag(dashEl.querySelector('[data-dot="' + k + '"]'), 'hidden', !shown.includes(k) || shown.indexOf(k) === 0);
    }
    if (pickEl && pickEl.isConnected) pickRender();
  }

  // 모델 빠른 선택: 상자 위로 뜨는 우리 창. 살아 있는 모델만(모델 메뉴에서 숨긴 모델은 빼되 지금 모델은 남김), 지금 모델은 강조
  function pickClose() { if (pickEl && pickEl.isConnected) pickEl.remove(); const mb = dashEl && dashEl.querySelector('[data-k="model"]'); if (mb) setAttr(mb, 'aria-expanded', 'false'); }
  function pickToggle() { if (pickEl && pickEl.isConnected) { pickClose(); return; } pickRender(); }
  function pickRender() {
    if (!cmp.box) return;
    if (!pickEl) {
      pickEl = document.createElement('div');
      pickEl.id = 'cpb-mpick';
      pickEl.setAttribute('role', 'dialog');
      pickEl.setAttribute('aria-label', '모델 바꾸기');
      pickEl.addEventListener('mousedown', (e) => e.preventDefault());
      pickEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const it = e.target.closest('[data-m]');
        if (!it) return;
        const t = it.dataset.m;
        if (t === currentModel()) { pickClose(); return; }
        pickClose();
        const ok = await switchModel(t);
        const mi = modelInfo(t);
        toast(ok ? mi.name + '(으)로 바꿨어요' : '모델을 바꾸지 못했어요', { key: 'model' });
      });
    }
    const cur = currentModel(), hid = modelOn('hide') ? modelHidden() : new Set();
    const keys = Object.keys(models).filter((k) => !models[k].dead && (k === cur || !hid.has(k)));
    const html = '<div class="ph">모델 바꾸기</div>' + keys.map((k) => {
      const mi = models[k];
      return '<div class="mi' + (k === cur ? ' cur' : '') + '" data-m="' + escHtml(k) + '"><img src="' + escHtml(mi.icon) + '" alt="">'
        + '<span class="nm">' + escHtml(mi.name) + (mi.engine ? '<small>' + escHtml(mi.engine) + '</small>' : '') + '</span>'
        + '<span class="cr"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + CRACKER_D + '"/></svg>' + NUMF.format(mi.cost || 0) + '</span></div>';
    }).join('');
    if (pickEl.dataset.sig !== html) { pickEl.dataset.sig = html; pickEl.innerHTML = html; }
    // 입력창 쪽은 메시지 목록보다 아래 층이라 상자 안에 두면 메시지에 가린다 → body 끝에 두고 상자 바로 위에 고정
    if (pickEl.parentNode !== document.body) document.body.appendChild(pickEl);
    const br = cmp.box.getBoundingClientRect();
    pickEl.style.left = Math.round(br.left + 8) + 'px';
    pickEl.style.bottom = Math.round(window.innerHeight - br.top + 8) + 'px';
    // 폭은 글 길이에 맞춘다(CSS max-content). 너무 넓어지지 않게 위쪽만 막는다
    pickEl.style.maxWidth = Math.round(Math.min(320, br.width - 16)) + 'px';
    pickEl.style.maxHeight = Math.round(Math.max(160, Math.min(520, br.top - 24))) + 'px';
    const mb = dashEl && dashEl.querySelector('[data-k="model"]');
    if (mb) setAttr(mb, 'aria-expanded', 'true');
  }
  document.addEventListener('mousedown', (e) => { if (pickEl && pickEl.isConnected && !pickEl.contains(e.target) && !(dashEl && dashEl.querySelector('[data-k="model"]').contains(e.target))) pickClose(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pickEl && pickEl.isConnected) pickClose(); }, true);
  window.addEventListener('resize', () => { if (pickEl && pickEl.isConnected) pickClose(); });

  // ── 메시지 메뉴(우클릭) · '복사' · 수정창 붙여넣기 줄바꿈 ──
  // 대상은 좁게: 메시지 = 대화 목록(.flex-col-reverse) 바로 아래 [data-message-group-id], 우클릭은 그 안의 본문(.wrtn-markdown)만.
  // 메뉴 트리거 = 그 그룹의 [aria-label="메시지 옵션"]을 감싼 [aria-haspopup="menu"], 메뉴 = 트리거의 aria-controls가 가리키는 [role=menu].
  // 수정창 = 그 그룹 안 TipTap 편집기(.tiptap.ProseMirror, 입력창 .__chat_input_textarea는 아님).
  // 크랙 단축키 처리기를 건드리지 않게 가짜 키 이벤트는 쓰지 않는다. 메뉴는 트리거의 React onPointerDown을 직접 불러 열고 닫는다
  const toolOn = (k) => !(isObj(conf.tools) && conf.tools[k] === false);
  const msgGroupOf = (el) => {
    const g = el && el.closest ? el.closest('[data-message-group-id]') : null;
    return g && g.parentElement && g.parentElement.classList.contains('flex-col-reverse') ? g : null;
  };
  function optTrigger(g) {
    const lab = g && g.querySelector('[aria-label="메시지 옵션"]');
    const t = lab && lab.closest('[aria-haspopup="menu"]');
    return t && g.contains(t) ? t : null;
  }
  const reactProps = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactProps$')); return k ? el[k] : null; };
  function triggerToggle(t) {
    const p = reactProps(t);
    if (!p || typeof p.onPointerDown !== 'function') return false;
    const r = t.getBoundingClientRect();
    const ev = {
      type: 'pointerdown', target: t, currentTarget: t, button: 0, buttons: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
      pointerType: 'mouse', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, isDefaultPrevented() { return this.defaultPrevented; }, isPropagationStopped() { return false; }, persist() {},
    };
    ev.nativeEvent = ev;
    try { p.onPointerDown(ev); return true; } catch (_) { return false; }
  }
  const trigOpen = (t) => t.getAttribute('aria-expanded') === 'true';
  function trigMenu(t) {
    const id = t.getAttribute('aria-controls');
    const m = id ? document.getElementById(id) : null;
    return m && m.getAttribute('role') === 'menu' ? m : null;
  }
  const COPY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 3.2h9.2c.88 0 1.6.72 1.6 1.6V14c0 .88-.72 1.6-1.6 1.6H8c-.88 0-1.6-.72-1.6-1.6V4.8c0-.88.72-1.6 1.6-1.6m0 1.6V14h9.2V4.8z" clip-rule="evenodd"/><path d="M4.8 8H3.2v11.2c0 .88.72 1.6 1.6 1.6H16V19.2H4.8z"/></svg>';
  // 크랙 메뉴 맨 위에 '복사'(크랙 메뉴 줄 class를 그대로 빌림). 복사하는 글 = 크랙 메시지 원문(content), 없으면 본문 글자
  function addCopyItem(menu, g, t) {
    if (!toolOn('copy') || !menu.isConnected || menu.querySelector(':scope > .cpb-copy')) return;
    const ref = menu.querySelector(':scope > [role="menuitem"]');
    if (!ref) return;
    const it = document.createElement('div');
    it.className = ref.className + ' cpb-copy';
    it.setAttribute('role', 'menuitem');
    it.tabIndex = -1;
    it.innerHTML = COPY_SVG + '<span>복사</span>';
    const rs = ref.querySelector('svg');
    if (rs && rs.getAttribute('class')) it.firstChild.setAttribute('class', rs.getAttribute('class'));
    it.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    it.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const m = groupMsg(g);
      const md = g.querySelector('.wrtn-markdown');
      const text = m && typeof m.content === 'string' && m.content ? m.content : (md ? md.innerText.trim() : '');
      let ok = false;
      try { if (text) { await navigator.clipboard.writeText(text); ok = true; } } catch (_) { ok = false; }
      it.lastChild.textContent = ok ? '복사됨' : '복사 실패';
      setTimeout(() => { if (t.isConnected && trigOpen(t)) triggerToggle(t); }, ok ? 220 : 900);
    });
    menu.prepend(it);
  }
  // 우클릭한 자리에 메뉴를 둔다(Radix가 다시 계산해도 유지되게 important)
  function placeAt(menu, x, y) {
    const w = menu.isConnected ? menu.closest('[data-radix-popper-content-wrapper]') : null;
    if (!w) return;
    const r = w.getBoundingClientRect();
    const px = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const py = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    w.style.setProperty('top', '0px', 'important');
    w.style.setProperty('left', '0px', 'important');
    w.style.setProperty('transform', 'translate(' + Math.round(px) + 'px,' + Math.round(py) + 'px)', 'important');
  }
  let ctxBusy = false;
  document.addEventListener('contextmenu', (e) => {
    if (!page || !toolOn('rightClick') || e.shiftKey || ctxBusy) return; // Shift+우클릭 = 브라우저 메뉴
    const md = e.target && e.target.closest ? e.target.closest('.wrtn-markdown') : null;
    const g = md && msgGroupOf(md);
    if (!g || g.querySelector('.tiptap.ProseMirror:not(.__chat_input_textarea)')) return; // 수정 중인 메시지는 브라우저 메뉴
    const sel = window.getSelection ? window.getSelection() : null;
    if (sel && !sel.isCollapsed && String(sel).trim()) return; // 글을 골라 두었으면 브라우저 메뉴(복사 등)
    const t = optTrigger(g);
    if (!t) return;
    e.preventDefault();
    ctxBusy = true;
    const x = e.clientX, y = e.clientY;
    (async () => {
      try {
        if (!trigOpen(t) && !triggerToggle(t)) return;
        let menu = null;
        for (let i = 0; i < 16 && !menu; i++) { await new Promise((r) => setTimeout(r, 30)); menu = trigMenu(t); }
        if (!menu) return;
        addMenuItems(menu, g, t);
        placeAt(menu, x, y);
        requestAnimationFrame(() => placeAt(menu, x, y));
        setTimeout(() => placeAt(menu, x, y), 80);
      } finally { setTimeout(() => { ctxBusy = false; }, 150); }
    })();
  }, true);
  // 크랙 '…' 버튼으로 연 메뉴에도 우리 항목('복사'·'반복 표현 정리'·'여러 개 지우기'·'다른 답변 지우기')
  document.addEventListener('pointerdown', (e) => {
    if (!page || !(toolOn('copy') || toolOn('cleaner') || toolOn('multiDelete') || toolOn('variantDelete')) || e.button !== 0) return;
    const t = e.target && e.target.closest ? e.target.closest('[aria-haspopup="menu"]') : null;
    const g = t && msgGroupOf(t);
    if (!g || optTrigger(g) !== t) return;
    for (const ms of [60, 160]) setTimeout(() => { const m = trigMenu(t); if (m) addMenuItems(m, g, t); }, ms);
  }, true);
  // 수정창에 여러 줄 붙여넣기: 크랙(TipTap)은 줄마다 문단을 만들어 저장 때 줄바꿈이 두 배가 된다(실측: 'A⏎B⏎⏎C' → 'A⏎⏎B⏎⏎C').
  // 수정창은 원래 문단 하나 + 줄바꿈(hardBreak)이라, 붙여넣은 글도 줄바꿈 노드로 넣는다. 한 줄·이미지 붙여넣기는 크랙 그대로
  document.addEventListener('paste', (e) => {
    if (!page || !toolOn('pasteFix')) return;
    const el = e.target && e.target.closest ? e.target.closest('.tiptap.ProseMirror') : null;
    if (!el || el.classList.contains('__chat_input_textarea') || !msgGroupOf(el) || !el.editor) return;
    const raw = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    const text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    if (!text.includes('\n')) return;
    e.preventDefault();
    e.stopPropagation();
    const ed = el.editor;
    const nodes = [];
    text.split('\n').forEach((line, i) => { if (i) nodes.push({ type: 'hardBreak' }); if (line) nodes.push({ type: 'text', text: line }); });
    const d0 = ed.state.doc;
    attempt(() => ed.chain().focus().insertContent(nodes).run());
    if (ed.state.doc === d0) toast('붙여넣지 못했어요 · 수정창은 8,000자까지 들어가요', { key: 'paste' });
  }, true);

  // ── 반복 표현 정리: 자주 나온 말을 골라 지우거나 바꾼다 ──
  // 여는 곳 두 군데: 메시지 메뉴(우클릭·'…')의 '반복 표현 정리' = 수정창 없이 메시지에 바로 저장(크랙 '수정 완료'와 같은 길, 새로고침 없음),
  // 크랙 수정창 버튼 줄의 '반복 표현 정리' = 수정창 글만 바꾸고 저장은 '수정 완료'로.
  // 크랙 내부 연결: 메시지 목록에서 파이버를 위로 40칸까지 올라가며 모양으로 찾는다(실측 18/19/23칸).
  // actions = ChatActions(updateMessage·resyncMessage·removeMessage 함수), state = ChatState(status·selectedMessageId·chatId), store = 메시지 저장소(messages: Map)
  function chatCtx() {
    if (!foldList || !foldList.isConnected) return null;
    let f = fiberOf(foldList);
    const out = { actions: null, state: null, store: null };
    for (let d = 0; f && d < 40; d++, f = f.return) {
      const v = f.memoizedProps && f.memoizedProps.value;
      if (!v || typeof v !== 'object') continue;
      if (!out.actions && typeof v.updateMessage === 'function' && typeof v.resyncMessage === 'function' && typeof v.removeMessage === 'function') out.actions = v;
      else if (!out.state && typeof v.status === 'string' && 'selectedMessageId' in v && 'chatId' in v) out.state = v;
      else if (!out.store && typeof v.getState === 'function' && typeof v.subscribe === 'function') {
        const s = attempt(() => v.getState());
        if (s && s.messages instanceof Map) out.store = v;
      }
    }
    if (out.state && out.state.chatId !== roomId()) return null;
    return out;
  }
  const groupById = (gid) => { const g = gid ? document.querySelector('.flex-col-reverse > [data-message-group-id="' + CSS.escape(gid) + '"]') : null; return g && msgGroupOf(g) === g ? g : null; };
  const editorIn = (g) => g && g.querySelector('.tiptap.ProseMirror:not(.__chat_input_textarea)');
  // 메시지 원문 저장: 크랙 ChatActions.updateMessage(옛 메시지, 새 글) — 크랙이 저장소를 먼저 바꾸고 PATCH, 실패하면 되돌린다(오류는 안 던짐).
  // 그래서 끝난 뒤 저장소 글이 새 글인지 다시 본다. 반환: '' = 성공, 아니면 알릴 문구
  let msgWriting = false;
  async function msgWrite(gid, id, expect, next) {
    if (msgWriting) return '앞의 저장이 아직 끝나지 않았어요';
    const c = chatCtx();
    if (!c || !c.actions || !c.store) return '크랙 화면 연결을 찾지 못했어요';
    if (c.state && c.state.status !== 'IDLE') return '답변을 만드는 중에는 고칠 수 없어요';
    if (editorIn(groupById(gid))) return '이 메시지는 수정창이 열려 있어요 · 수정창의 반복 표현 정리를 써 주세요';
    const cur = c.store.getState().messages.get(id);
    if (!cur || cur.content !== expect) return '그사이 메시지가 바뀌었어요 · 반복 표현 정리를 다시 열어 주세요';
    if (!String(next).trim()) return '메시지를 전부 비울 수는 없어요';
    msgWriting = true;
    try {
      await c.actions.updateMessage({ _id: id, content: expect }, next);
      const after = c.store.getState().messages.get(id);
      return after && after.content === next ? '' : '크랙이 저장하지 못했어요 · 잠시 뒤 다시 해 주세요';
    } catch (_) {
      return '크랙이 저장하지 못했어요 · 잠시 뒤 다시 해 주세요';
    } finally { msgWriting = false; }
  }
  // 수정창(TipTap) 문서: 문단 하나 + 줄바꿈 노드(크랙 수정창이 여는 모양 그대로)
  function textDoc(text) {
    const nodes = [];
    String(text).split('\n').forEach((line, i) => { if (i) nodes.push({ type: 'hardBreak' }); if (line) nodes.push({ type: 'text', text: line }); });
    return { type: 'doc', content: [nodes.length ? { type: 'paragraph', content: nodes } : { type: 'paragraph' }] };
  }
  // 고칠 곳 찾기: 규칙마다 한 번 훑어 위치 목록. 겹치면 먼저 넣은 규칙이 이긴다.
  // 지우기는 강조 기호 안 글을 통째로 지울 때 빈 기호 쌍(** · __ · ~~)도 같이 지우고, 공백 처리를 고른 대로 한다
  // 단어 경계에서만 잡는다: '카일'은 '카일은'·'카일이' 안에서 잡지 않는다(지우면 조사만 남으니). 조사 붙은 꼴은 후보에 따로 나온다
  const CL_W = /[가-힣A-Za-z0-9_]/;
  function clMatches(text, rules) {
    const out = [];
    rules.forEach((r, ri) => {
      if (!r.word) return;
      const wa = CL_W.test(r.word[0]), wz = CL_W.test(r.word[r.word.length - 1]);
      for (let from = 0, k = 0; ;) {
        const s0 = text.indexOf(r.word, from);
        if (s0 < 0) break;
        const e0 = s0 + r.word.length;
        if ((wa && s0 > 0 && CL_W.test(text[s0 - 1])) || (wz && e0 < text.length && CL_W.test(text[e0]))) { from = s0 + 1; continue; }
        from = e0;
        let s = s0, e = e0;
        if (r.mode === 'del') {
          for (let n = 3; n >= 1; n--) {
            const a = text.slice(s - n, s), b = text.slice(e, e + n);
            if (s - n >= 0 && a === b && /^([*_~])\1*$/.test(a)) { s -= n; e += n; break; }
          }
          if (r.space === 'auto') { if (text[e] === ' ') e++; else if (text[s - 1] === ' ') s--; }
          else if (r.space === 'after') { if (text[e] === ' ') e++; }
          else if (r.space === 'before') { if (text[s - 1] === ' ') s--; }
          else if (r.space === 'both') { if (text[s - 1] === ' ') s--; if (text[e] === ' ') e++; }
        }
        out.push({ s, e, ri, k, off: r.off.has(k) });
        k++;
      }
    });
    out.sort((a, b) => a.s - b.s || a.ri - b.ri);
    const keep = [];
    let last = -1;
    for (const x of out) if (x.s >= last) { keep.push(x); last = x.e; }
    return keep;
  }
  function clResult(text, rules, ms) {
    let o = '', p = 0;
    for (const x of ms) { if (x.off) continue; o += text.slice(p, x.s) + (rules[x.ri].mode === 'rep' ? rules[x.ri].rep : ''); p = x.e; }
    return o + text.slice(p);
  }
  function clCands(text) {
    const src = text.replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
    const m = new Map();
    for (const w of src.match(/[가-힣A-Za-z0-9_]{2,}/g) || []) { if (!/^\d+$/.test(w)) m.set(w, (m.get(w) || 0) + 1); }
    return [...m].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 180);
  }
  const BROOM_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6"/><path d="M12.5 5.5l6 6L11 19l-6-6z"/><path d="M5 13l-1.5 5.5L9 17"/></svg>';
  const X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const CL_SP = [['auto', '공백 자동'], ['word', '단어만'], ['before', '앞 공백까지'], ['after', '뒤 공백까지'], ['both', '양쪽 공백까지']];
  let cl = null; // 열린 창 상태 {mode:'msg'|'edit', gid, id, ed, text, before, rules, tab}
  let clEl = null;
  function clBuild() {
    clEl = document.createElement('div');
    clEl.id = 'cpb-cl';
    clEl.innerHTML = '<div class="win" role="dialog" aria-modal="true" aria-label="반복 표현 정리">'
      + '<div class="hd"><span class="ic">' + BROOM_SVG + '</span><div><b>반복 표현 정리</b><small data-sub></small></div><button type="button" class="x" data-close aria-label="닫기">' + X_SVG + '</button></div>'
      + '<div class="bd">'
      + '<div class="col"><div class="ch"><b>자주 나온 말</b><span>2번 이상</span></div>'
      + '<div class="inp"><input data-q placeholder="찾기 · 직접 추가" aria-label="찾을 말"><button type="button" class="btn" data-add>추가</button></div>'
      + '<div class="cands" data-cands></div>'
      + '<button type="button" class="ghost" data-drag><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M12 9v6M9 12h6"/></svg>드래그한 글자 넣기</button></div>'
      + '<div class="col"><div class="ch"><b>고칠 말</b><span data-rsum></span></div><div class="rules" data-rules></div></div>'
      + '<div class="col"><div class="ch"><div class="tabs" role="tablist"><button type="button" role="tab" data-tab="pos">위치 보기</button><button type="button" role="tab" data-tab="after">고친 뒤</button></div><span data-psum></span></div>'
      + '<div class="prev" data-prev></div>'
      + '<div class="legend"><span><i class="lg-d"></i>지울 곳</span><span><i class="lg-r"></i>바꿀 말</span><span><i class="lg-o"></i>뺀 곳(누르면 다시)</span></div></div>'
      + '</div>'
      + '<div class="ft"><span class="note" data-note></span><span class="sum" data-fsum></span>'
      + '<button type="button" class="btn" data-undo>되돌리기</button><button type="button" class="btn" data-copy>결과 복사</button><button type="button" class="btn p" data-apply>적용</button></div>'
      + '</div>';
    const q = (s) => clEl.querySelector(s);
    // 창 안에서 누른 키는 크랙 단축키로 가지 않게(가짜 키는 만들지 않고 전파만 멈춤). Esc = 닫기
    for (const type of ['keydown', 'keyup', 'keypress']) {
      clEl.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === 'keydown' && e.key === 'Escape') { e.preventDefault(); clClose(); }
      });
    }
    clEl.addEventListener('mousedown', (e) => { if (e.target === clEl) clClose(); });
    q('[data-close]').addEventListener('click', clClose);
    q('[data-cands]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b || !cl) return;
      const i = cl.rules.findIndex((r) => r.word === b.dataset.w);
      if (i >= 0) cl.rules.splice(i, 1); else cl.rules.push({ word: b.dataset.w, mode: 'del', rep: '', space: 'auto', off: new Set() });
      clRender();
    });
    const addTyped = () => { const inp = q('[data-q]'); clAdd(inp.value); inp.value = ''; clRenderCands(); };
    q('[data-q]').addEventListener('input', clRenderCands);
    q('[data-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTyped(); } });
    q('[data-add]').addEventListener('click', addTyped);
    q('[data-drag]').addEventListener('mousedown', (e) => e.preventDefault()); // 고른 글이 풀리지 않게
    q('[data-drag]').addEventListener('click', () => {
      const s = window.getSelection ? String(window.getSelection()).trim() : '';
      if (!s) { toast('먼저 메시지나 미리보기에서 글자를 드래그해 주세요', { key: 'cl' }); return; }
      clAdd(s.split('\n')[0].slice(0, 60));
    });
    const rulesEl = q('[data-rules]');
    rulesEl.addEventListener('click', (e) => {
      const box = e.target.closest('[data-i]');
      if (!box || !cl) return;
      const i = +box.dataset.i, r = cl.rules[i];
      if (e.target.closest('[data-x]')) { cl.rules.splice(i, 1); clRender(); return; }
      const m = e.target.closest('[data-m]');
      if (m && r.mode !== m.dataset.m) {
        r.mode = m.dataset.m;
        r.off.clear();
        clRender();
        if (r.mode === 'rep') { const inp = rulesEl.querySelector('[data-i="' + i + '"] [data-rep]'); if (inp) inp.focus(); }
      }
    });
    rulesEl.addEventListener('change', (e) => { const box = e.target.closest('[data-i]'); if (box && cl && e.target.matches('[data-sp]')) { cl.rules[+box.dataset.i].space = e.target.value; clRender(); } });
    let rt = 0;
    rulesEl.addEventListener('input', (e) => {
      const box = e.target.closest('[data-i]');
      if (!box || !cl || !e.target.matches('[data-rep]')) return;
      cl.rules[+box.dataset.i].rep = e.target.value;
      cancelAnimationFrame(rt);
      rt = requestAnimationFrame(() => { const ms = clMatches(cl.text, cl.rules); clRenderPrev(ms); clRenderSum(ms); });
    });
    q('[data-prev]').addEventListener('click', (e) => {
      const m = e.target.closest('mark');
      if (!m || !cl) return;
      const r = cl.rules[+m.dataset.ri], k = +m.dataset.k;
      if (r.off.has(k)) r.off.delete(k); else r.off.add(k);
      clRender();
    });
    for (const b of clEl.querySelectorAll('[data-tab]')) b.addEventListener('click', () => { if (cl) { cl.tab = b.dataset.tab; clRender(); } });
    q('[data-apply]').addEventListener('click', clApply);
    q('[data-undo]').addEventListener('click', clUndo);
    q('[data-copy]').addEventListener('click', async () => {
      if (!cl) return;
      const out = clResult(cl.text, cl.rules, clMatches(cl.text, cl.rules));
      try { await navigator.clipboard.writeText(out); toast('결과를 복사했어요', { key: 'cl' }); } catch (_) { toast('복사가 막혔어요 · 미리보기에서 직접 골라 복사해 주세요', { key: 'cl' }); }
    });
  }
  function clAdd(w) {
    w = String(w || '').trim();
    if (!w || !cl || cl.rules.some((r) => r.word === w)) return;
    if (!clMatches(cl.text, [{ word: w, mode: 'rep', off: new Set() }]).length) { toast("'" + w + "'은(는) 이 메시지에 낱말로 없어요 · 조사까지 넣어 보세요", { key: 'cl' }); return; }
    cl.rules.push({ word: w, mode: 'del', rep: '', space: 'auto', off: new Set() });
    clRender();
  }
  function clRenderCands() {
    if (!cl) return;
    const q = clEl.querySelector('[data-q]').value.trim();
    const list = clCands(cl.text).filter(([w]) => !q || w.includes(q));
    clEl.querySelector('[data-cands]').innerHTML = list.map(([w, n]) => '<button type="button" class="cand" data-w="' + escHtml(w) + '" aria-pressed="' + cl.rules.some((r) => r.word === w) + '">' + escHtml(w) + '<em>' + n + '</em></button>').join('')
      || '<span class="empty">' + (q ? 'Enter나 추가를 누르면 넣어요' : '2번 이상 나온 말이 없어요') + '</span>';
  }
  function clRenderRules(ms) {
    const el = clEl.querySelector('[data-rules]');
    if (!cl.rules.length) { el.innerHTML = '<div class="empty">왼쪽 말을 누르면 여기에 들어와요<br>기본은 지우기, 필요하면 바꾸기</div>'; return; }
    el.innerHTML = cl.rules.map((r, i) => {
      const all = ms.filter((x) => x.ri === i), off = all.filter((x) => x.off).length;
      return '<div class="rule" data-i="' + i + '"><div class="rtop"><span class="rw">' + escHtml(r.word) + '</span><span class="rn">' + all.length + '곳' + (off ? ' · ' + off + '곳 뺌' : '') + '</span>'
        + '<button type="button" class="rx" data-x aria-label="빼기">' + X_SVG + '</button></div>'
        + '<div class="rmid"><span class="mini"><button type="button" data-m="del" aria-pressed="' + (r.mode === 'del') + '">지우기</button><button type="button" data-m="rep" aria-pressed="' + (r.mode === 'rep') + '">바꾸기</button></span>'
        + (r.mode === 'rep'
          ? '<input data-rep value="' + escHtml(r.rep) + '" placeholder="바꿀 말" aria-label="바꿀 말">'
          : '<select data-sp aria-label="공백 처리">' + CL_SP.map(([v, t]) => '<option value="' + v + '"' + (r.space === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>')
        + '</div></div>';
    }).join('');
  }
  function clRenderPrev(ms) {
    let h = '', p = 0;
    const t = cl.text;
    if (cl.tab === 'pos') {
      for (const x of ms) {
        const r = cl.rules[x.ri];
        h += escHtml(t.slice(p, x.s)) + '<mark class="' + (r.mode === 'rep' ? 'r' : 'd') + (x.off ? ' off' : '') + '" data-ri="' + x.ri + '" data-k="' + x.k + '"'
          + (r.mode === 'rep' ? ' data-to="' + escHtml(r.rep || '…') + '"' : '') + ' title="' + (x.off ? '빠진 곳 · 누르면 다시 고쳐요' : '누르면 이 곳만 빼요') + '">' + escHtml(t.slice(x.s, x.e)) + '</mark>';
        p = x.e;
      }
    } else {
      for (const x of ms) {
        if (x.off) continue;
        const r = cl.rules[x.ri];
        h += escHtml(t.slice(p, x.s)) + (r.mode === 'rep' && r.rep ? '<ins>' + escHtml(r.rep) + '</ins>' : '');
        p = x.e;
      }
    }
    clEl.querySelector('[data-prev]').innerHTML = h + escHtml(t.slice(p));
  }
  function clRenderSum(ms) {
    const on = ms.filter((x) => !x.off).length;
    clEl.querySelector('[data-psum]').textContent = ms.length ? on + '곳 고침' : '';
    clEl.querySelector('[data-fsum]').textContent = cl.rules.length ? NUMF.format(cl.text.length) + '자 → ' + NUMF.format(clResult(cl.text, cl.rules, ms).length) + '자' : '';
    clEl.querySelector('[data-apply]').disabled = !on || msgWriting;
  }
  function clRender() {
    if (!cl || !clEl) return;
    const ms = clMatches(cl.text, cl.rules);
    clEl.querySelector('[data-sub]').textContent = (cl.mode === 'edit' ? '수정창 글' : '이 메시지') + ' · ' + NUMF.format(cl.text.length) + '자';
    clEl.querySelector('[data-rsum]').textContent = cl.rules.length + '개';
    clEl.querySelector('[data-note]').textContent = cl.mode === 'edit' ? '수정창 글만 바꿔요 · 저장은 크랙 수정 완료로' : '메시지에 바로 저장돼요 · 새로고침 없음';
    for (const b of clEl.querySelectorAll('[data-tab]')) setAttr(b, 'aria-selected', String(b.dataset.tab === cl.tab));
    clEl.querySelector('[data-undo]').disabled = cl.before == null || msgWriting;
    clRenderCands();
    clRenderRules(ms);
    clRenderPrev(ms);
    clRenderSum(ms);
  }
  // 연다: 수정창이 열려 있으면 그 수정창 글, 아니면 크랙 저장소의 메시지 원문
  function clOpen(g, ed) {
    if (!g) return;
    ed = ed || editorIn(g);
    let st = null;
    if (ed && ed.editor) {
      st = { mode: 'edit', gid: g.getAttribute('data-message-group-id'), id: '', ed: ed.editor, text: ed.editor.getText() };
    } else {
      const m = groupMsg(g);
      const c = chatCtx();
      const stored = m && c && c.store ? c.store.getState().messages.get(m._id) : null;
      const text = stored && typeof stored.content === 'string' ? stored.content : '';
      if (!m || !text) { toast('메시지 원문을 읽지 못했어요', { key: 'cl' }); return; }
      st = { mode: 'msg', gid: g.getAttribute('data-message-group-id'), id: m._id, ed: null, text };
    }
    cl = Object.assign(st, { before: null, rules: [], tab: 'pos' });
    if (!clEl) clBuild();
    clEl.querySelector('[data-q]').value = '';
    if (clEl.parentNode !== document.body) document.body.appendChild(clEl);
    clRender();
    setTimeout(() => { const i = clEl && clEl.querySelector('[data-q]'); if (i) i.focus(); }, 0);
  }
  function clClose() {
    if (clEl && clEl.isConnected) clEl.remove();
    if (cl && cl.mode === 'edit' && cl.ed && !cl.ed.isDestroyed) attempt(() => cl.ed.commands.focus());
    cl = null;
  }
  async function clSet(next, prev) {
    if (cl.mode === 'edit') {
      if (!cl.ed || cl.ed.isDestroyed) return '수정창이 닫혔어요';
      if (cl.ed.getText() !== prev) return '그사이 수정창 글이 바뀌었어요 · 반복 표현 정리를 다시 열어 주세요';
      attempt(() => cl.ed.commands.setContent(textDoc(next)));
      return cl.ed.getText() === next ? '' : '수정창에 넣지 못했어요 · 수정창은 8,000자까지 들어가요';
    }
    return msgWrite(cl.gid, cl.id, prev, next);
  }
  async function clApply() {
    if (!cl || msgWriting) return;
    const ms = clMatches(cl.text, cl.rules), n = ms.filter((x) => !x.off).length;
    if (!n) return;
    const now = cl, next = clResult(now.text, now.rules, ms);
    clEl.querySelector('[data-apply]').disabled = true;
    const err = await clSet(next, now.text);
    if (cl !== now) return;
    if (err) { toast(err, { key: 'cl', duration: 4000 }); clRender(); return; }
    now.before = now.text;
    now.text = next;
    now.rules = [];
    clRender();
    toast(n + '곳 고쳤어요' + (now.mode === 'edit' ? ' · 저장은 수정 완료로' : ''), { key: 'cl' });
  }
  async function clUndo() {
    if (!cl || cl.before == null || msgWriting) return;
    const now = cl;
    const err = await clSet(now.before, now.text);
    if (cl !== now) return;
    if (err) { toast(err, { key: 'cl', duration: 4000 }); return; }
    now.text = now.before;
    now.before = null;
    clRender();
    toast('되돌렸어요', { key: 'cl' });
  }
  // 메시지 메뉴의 '반복 표현 정리'(복사 바로 아래)
  function addCleanItem(menu, g, t) {
    if (!toolOn('cleaner') || !menu.isConnected || menu.querySelector(':scope > .cpb-clean')) return;
    const ref = menu.querySelector(':scope > [role="menuitem"]:not(.cpb-copy)');
    if (!ref) return;
    const it = document.createElement('div');
    it.className = ref.className + ' cpb-clean';
    it.setAttribute('role', 'menuitem');
    it.tabIndex = -1;
    it.innerHTML = BROOM_SVG + '<span>반복 표현 정리</span>';
    const rs = ref.querySelector('svg');
    if (rs && rs.getAttribute('class')) it.firstChild.setAttribute('class', rs.getAttribute('class'));
    it.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    it.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (t.isConnected && trigOpen(t)) triggerToggle(t);
      setTimeout(() => clOpen(g), 60); // 크랙 메뉴(모달)가 닫힌 뒤 연다
    });
    const copy = menu.querySelector(':scope > .cpb-copy');
    if (copy) copy.after(it); else menu.prepend(it);
  }
  function addMenuItems(menu, g, t) { addCopyItem(menu, g, t); addCleanItem(menu, g, t); addDeleteItems(menu, g, t); }
  // 크랙 수정창 버튼 줄('취소' · '수정 완료')의 맨 앞에 '반복 표현 정리'. 수정창 편집기에 포커스가 들어오거나 메뉴 '수정'을 누른 뒤 찾는다(전역 감시 없음)
  function cleanBtnFor(ed) {
    const g = msgGroupOf(ed);
    if (!g || !page || !toolOn('cleanerEdit')) return;
    const done = Array.from(g.querySelectorAll('button')).find((b) => b.textContent.trim() === '수정 완료');
    const row = done && done.parentElement;
    if (!row || !row.matches('.flex.flex-row.gap-2.items-center.justify-end') || row.querySelector(':scope > .cpb-clbtn')) return;
    const cancel = Array.from(row.children).find((b) => b.tagName === 'BUTTON' && b.textContent.trim() === '취소');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = (cancel || done).className + ' cpb-clbtn';
    b.innerHTML = BROOM_SVG + '<span>반복 표현 정리</span>';
    b.addEventListener('mousedown', (e) => e.preventDefault()); // 편집기 포커스 유지
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); clOpen(g, editorIn(g)); });
    row.insertBefore(b, row.firstChild);
  }
  document.addEventListener('focusin', (e) => {
    const el = e.target && e.target.closest ? e.target.closest('.tiptap.ProseMirror') : null;
    if (el && !el.classList.contains('__chat_input_textarea') && msgGroupOf(el)) cleanBtnFor(el);
  }, true);
  document.addEventListener('click', (e) => {
    if (!page || !toolOn('cleanerEdit')) return;
    const item = e.target && e.target.closest ? e.target.closest('[role="menuitem"]') : null;
    if (!item || item.textContent.trim() !== '수정') return;
    const menu = item.closest('[role="menu"]');
    const t = menu && menu.getAttribute('aria-labelledby') ? document.getElementById(menu.getAttribute('aria-labelledby')) : null;
    const g = t && msgGroupOf(t);
    if (!g || optTrigger(g) !== t) return;
    for (const ms of [250, 700]) setTimeout(() => { const ed = editorIn(g); if (ed) cleanBtnFor(ed); }, ms);
  }, true);

  // ── 다시 생성: 답변 길게 눌러 다시 생성 · 재생성 지침 창 건너뛰기 · 버튼 길게 눌러야 동작 ──
  // 크랙 다시 생성 버튼 = 그룹의 '메시지 옵션'과 같은 줄(.flex.flex-row.gap-2.items-center)에서 메뉴 밖에 있고, 크랙 다시 생성 아이콘(경로 처음·끝 실측)이 든 버튼.
  // 지침 창 건너뛰기 = 버튼을 대신 누르고, 뜨는 '재생성 지침' 창(입력칸 placeholder로 식별)을 보이지 않게 둔 채 비어 있는 그대로 크랙 '답변 재생성'을 누른다(크랙 자기 흐름)
  const rrOn = (k) => !(isObj(conf.reroll) && conf.reroll[k] === false); // 기본 켬
  const rrFlag = (k) => isObj(conf.reroll) && conf.reroll[k] === true; // 기본 끔(지침 창 건너뛰기·버튼 길게)
  const RR_HEAD = 'M3.8 12a8.2 8.', RR_TAIL = '9.8 0 0 0 21.28 8.83z';
  const RR_PH = '원하는 답변 방향을 입력할 수 있어요';
  function rerollBtnOf(el) {
    const b = el && el.closest ? el.closest('button') : null;
    const path = b && b.querySelector('svg path');
    const d = path ? path.getAttribute('d') || '' : '';
    if (!d.startsWith(RR_HEAD) || !d.endsWith(RR_TAIL) || b.closest('.dropdown-button')) return null;
    const g = msgGroupOf(b), t = g && optTrigger(g);
    const row = t && t.closest('.flex.flex-row.gap-2.items-center');
    return row && g.contains(row) && row.contains(b) ? b : null;
  }
  function rerollBtnIn(g) {
    const t = optTrigger(g);
    const row = t && t.closest('.flex.flex-row.gap-2.items-center');
    if (!row || !g.contains(row)) return null;
    return Array.from(row.querySelectorAll('button')).find((b) => rerollBtnOf(b) === b) || null;
  }
  const instrDialog = () => Array.from(document.querySelectorAll('main > [role="dialog"]')).find((d) => d.querySelector('textarea[placeholder="' + RR_PH + '"]')) || null;
  // 크랙 메시지 컴포넌트 props {messageIds, isLastMessage, onRegenerate(id, 지침)} — 그룹 아래로 찾는다(실측)
  function regenProps(g) {
    const st = [[fiberOf(g), 0]];
    for (let n = 0; st.length && n < 500;) {
      const [f, d] = st.pop();
      if (!f) continue;
      n++;
      const p = f.memoizedProps;
      if (p && Array.isArray(p.messageIds) && typeof p.onRegenerate === 'function') return p;
      if (f.sibling) st.push([f.sibling, d]);
      if (f.child && d < 14) st.push([f.child, d + 1]);
    }
    return null;
  }
  // '답변 비교 n/m' 버튼에서 위로 30칸 안의 props {isUserMessage, messageIds, selectedMessageId, onSelect(id)} (실측 22칸)
  function compareOf(g) {
    const b = g && Array.from(g.querySelectorAll('button[aria-haspopup="menu"]')).find((x) => /^답변\s*비교\s*\d+\s*\/\s*\d+$/.test(x.textContent.trim()));
    let f = b ? fiberOf(b) : null;
    for (let i = 0; f && i < 30; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && Array.isArray(p.messageIds) && 'selectedMessageId' in p && typeof p.onSelect === 'function') return p;
    }
    return null;
  }
  let rrBusy = false;
  async function rerollNow(rb) {
    if (rrBusy || !rb.isConnected) return;
    rrBusy = true;
    const skip = rrFlag('skipInstr');
    const html = document.documentElement;
    // 지침 창 건너뛰기: 크랙 onRegenerate(지금 보이는 답변 id)를 바로 부른다(크랙이 지침 창을 껐을 때와 같은 길 → 창이 아예 안 뜬다).
    // 리롤 버튼이 보일 때만 오므로 크랙이 다시 생성을 허용하는 상황이다. props를 못 찾으면 아래 예전 길(창을 숨긴 채 '답변 재생성')
    if (skip) {
      const g = msgGroupOf(rb), mp = g && regenProps(g), cp = g && compareOf(g);
      const c = chatCtx();
      const vid = (cp && cp.selectedMessageId) || (mp && mp.messageIds[mp.messageIds.length - 1]);
      if (mp && vid && mp.isLastMessage !== false && (!c || !c.state || c.state.status === 'IDLE')) {
        try { mp.onRegenerate(vid); } catch (_) { toast('다시 생성하지 못했어요', { key: 'rr' }); } finally { setTimeout(() => { rrBusy = false; }, 350); }
        return;
      }
    }
    if (skip) flag(html, 'data-cpb-reroll', true);
    try {
      rb._cpbOk = true;
      rb.click();
      rb._cpbOk = false;
      if (!skip) return;
      let go = null;
      for (let i = 0; i < 24 && !go; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const d = instrDialog();
        const ta = d && d.querySelector('textarea');
        go = d && ta && !ta.value.trim() ? Array.from(d.querySelectorAll('button')).find((b) => b.textContent.trim() === '답변 재생성') : null;
      }
      if (go && !go.disabled) go.click(); // 창이 안 뜨면(크랙이 지침 창을 껐으면) 이미 다시 생성된 것
    } finally {
      rb._cpbOk = false;
      setTimeout(() => { flag(html, 'data-cpb-reroll', false); rrBusy = false; }, 350);
    }
  }
  // 크랙 다시 생성 버튼 클릭: 우리 대행 클릭은 통과. '길게 눌러야 동작'이 켜져 있으면 그냥 클릭은 막고, '지침 창 건너뛰기'가 켜져 있으면 대행으로 돌린다
  document.addEventListener('click', (e) => {
    // 길게 누르기가 끝난 직후 손을 떼며 생기는 진짜 클릭 한 번은 삼킨다(우리 대행 .click()은 isTrusted=false라 통과)
    if (e.isTrusted && Date.now() < swallowUntil) { swallowUntil = 0; e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (!page) return;
    const rb = rerollBtnOf(e.target);
    if (!rb || rb._cpbOk) return;
    const guard = rrFlag('guard');
    const skip = rrFlag('skipInstr');
    if (!guard && !skip) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (guard) { toast('다시 생성은 버튼을 길게 눌러 주세요', { key: 'rr' }); return; }
    rerollNow(rb);
  }, true);
  // 길게 누르기(왼쪽 버튼·마우스·보조키 없음): 최신 답변 본문(다시 생성 가능할 때만) 또는 '길게 눌러야 동작'일 때의 다시 생성 버튼.
  // 0.3초 뒤 고리가 나타나 0.5초 동안 차오르면 다시 생성. 10px 넘게 움직이거나 떼면 취소. 끝난 직후 손을 떼며 생기는 클릭 한 번은 삼킨다
  let hold = null, holdEl = null, swallowUntil = 0;
  function holdRing(x, y) {
    if (!holdEl) {
      holdEl = document.createElement('div');
      holdEl.id = 'cpb-hold';
      holdEl.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/><path class="ic" d="M15.5 22a6.5 6.5 0 1 1 1.9 4.6M15.5 27v-5h5"/></svg>';
    }
    holdEl.style.left = x + 'px';
    holdEl.style.top = y + 'px';
    holdEl.classList.remove('go');
    if (holdEl.parentNode !== document.body) document.body.appendChild(holdEl);
    void holdEl.offsetWidth;
    holdEl.classList.add('go');
  }
  function holdEnd() {
    if (!hold) return;
    clearTimeout(hold.t1);
    clearTimeout(hold.t2);
    hold = null;
    if (holdEl && holdEl.isConnected) holdEl.remove();
  }
  document.addEventListener('pointerdown', (e) => {
    if (!page || e.button !== 0 || e.pointerType !== 'mouse' || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    let rb = null;
    const onBtn = rerollBtnOf(e.target);
    if (onBtn) {
      if (!rrFlag('guard')) return;
      rb = onBtn;
    } else {
      if (!rrOn('hold')) return;
      const md = e.target.closest ? e.target.closest('.wrtn-markdown') : null;
      const g = md && msgGroupOf(md);
      if (!g || g !== g.parentElement.firstElementChild || e.target.closest('a,button,img,pre,code,input,textarea,[contenteditable="true"]')) return;
      rb = rerollBtnIn(g);
      if (!rb) return;
    }
    holdEnd();
    const x = e.clientX, y = e.clientY;
    hold = { x, y, rb };
    hold.t1 = setTimeout(() => {
      if (!hold) return;
      holdRing(x, y);
      hold.t2 = setTimeout(() => {
        if (!hold) return;
        const target = hold.rb;
        holdEnd();
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel && !sel.isCollapsed) sel.removeAllRanges();
        swallowUntil = Date.now() + 500;
        if (target.isConnected) rerollNow(target);
      }, 500);
    }, 300);
  }, true);
  document.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) holdEnd(); }, true);
  for (const t of ['pointerup', 'pointercancel', 'dragstart', 'wheel']) document.addEventListener(t, holdEnd, true);
  window.addEventListener('blur', holdEnd);
  // 답변 비교 좌우 넘기기: 최신 답변(후보 2개 이상)에 마우스를 올리면 답변 바깥 여백에 작은 화살표 버튼 두 개가 커서 높이를 따라 뜬다.
  // 누를 수 있는 건 그 버튼뿐(예전처럼 본문 가장자리 띠를 누르면 넘어가지 않는다). 크랙 onSelect(id)를 바로 불러 바꾼다(메뉴·키 이벤트 없음)
  const CHEV = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  let navL = null, navR = null, navRaf = 0, navXY = null;
  function navBuild() {
    const mk = (dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cpb-cmp';
      b.dataset.dir = String(dir);
      b.innerHTML = CHEV(dir < 0 ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6');
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); navGo(dir); });
      return b;
    };
    navL = mk(-1);
    navR = mk(1);
  }
  function navHide() {
    if (navL && navL.isConnected) navL.remove();
    if (navR && navR.isConnected) navR.remove();
  }
  const newestGroup = () => { const g = foldList && foldList.isConnected ? foldList.firstElementChild : null; return g && msgGroupOf(g) === g ? g : null; };
  function navState(g) {
    const cp = compareOf(g);
    if (!cp || cp.isUserMessage || cp.messageIds.length < 2) return null;
    let i = cp.messageIds.indexOf(cp.selectedMessageId);
    if (i < 0) i = cp.messageIds.length - 1;
    return { cp, i, n: cp.messageIds.length };
  }
  function navUpdate() {
    const xy = navXY;
    const g = newestGroup();
    const md = g && !editorIn(g) ? g.querySelector('.wrtn-markdown') : null;
    if (!xy || !md || !page || !rrOn('compareNav')) { navHide(); return; }
    const r = md.getBoundingClientRect();
    if (xy.x < r.left - 64 || xy.x > r.right + 64 || xy.y < r.top || xy.y > r.bottom) { navHide(); return; }
    const s = navState(g);
    if (!s) { navHide(); return; }
    if (!navL) navBuild();
    const top = Math.round(Math.max(Math.max(r.top, 8), Math.min(xy.y - 17, Math.min(r.bottom, window.innerHeight) - 42)));
    // 평소엔 안 보이고, 커서가 화살표 쪽으로 가까이 갈수록 진해진다(가로 거리 28px 안 = 다 보임, 150px 밖 = 안 보임). 흐릴 땐 눌리지 않는다
    const place = (b, left, on, label) => {
      b.style.left = Math.round(left) + 'px';
      b.style.top = top + 'px';
      b.disabled = !on;
      const dist = Math.abs(xy.x - (left + 17));
      const k = Math.max(0, Math.min(1, (150 - dist) / 122));
      const op = (on ? 1 : 0.35) * k;
      b.style.opacity = op.toFixed(2);
      b.style.pointerEvents = k > 0.3 ? '' : 'none';
      if (b.title !== label) { b.title = label; b.setAttribute('aria-label', label); }
      if (b.parentNode !== document.body) document.body.appendChild(b);
    };
    place(navL, Math.max(6, r.left - 44), s.i > 0, '이전 답변 (' + Math.max(1, s.i) + '/' + s.n + ')');
    place(navR, Math.min(window.innerWidth - 40, r.right + 10), s.i < s.n - 1, '다음 답변 (' + Math.min(s.n, s.i + 2) + '/' + s.n + ')');
  }
  function navGo(dir) {
    const g = newestGroup();
    const s = g && navState(g);
    if (!s) return;
    const j = s.i + dir;
    if (j < 0 || j >= s.n) return;
    try { s.cp.onSelect(s.cp.messageIds[j]); } catch (_) { return; }
    msgSoon(150);
    setTimeout(navUpdate, 120);
  }
  document.addEventListener('pointermove', (e) => {
    if (!page || !rrOn('compareNav')) return;
    navXY = { x: e.clientX, y: e.clientY };
    if (!navRaf) navRaf = requestAnimationFrame(() => { navRaf = 0; navUpdate(); });
  }, { passive: true });
  window.addEventListener('scroll', () => { if (navL && navL.isConnected) navHide(); }, { capture: true, passive: true });
  on('route', navHide);

  // ── 안전 삭제: 메시지 메뉴의 '여러 개 지우기' · '다른 답변 지우기 (n개)' ──
  // 지우기 = 크랙 ChatActions.removeMessage(id)(크랙 '삭제'와 같은 길: 서버에 지우기 → 화면에서 빼기. 실패하면 크랙이 알림만 띄우고 오류는 안 던짐).
  // 그래서 하나 지울 때마다 저장소에 그 메시지가 남았는지 다시 보고, 남았으면 거기서 멈춘다. 확인은 우리 창 한 번(삭제 버튼 0.8초 잠금), 새로고침 없음
  const DEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/></svg>';
  const MULTI_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="7" height="7" rx="1.5"/><path d="M5.3 7.6l1.4 1.4 2.4-2.8"/><rect x="3.5" y="13" width="7" height="7" rx="1.5"/><path d="M14 7.5h6.5M14 16.5h6.5"/></svg>';
  const VAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3.5" width="13" height="13" rx="2"/><path d="M4 7.5v11a2 2 0 0 0 2 2h11"/><path d="M11 8l5 5M16 8l-5 5"/></svg>';
  const delOn = (k) => !(isObj(conf.tools) && conf.tools[k] === false);
  function msgText(id) {
    const c = chatCtx();
    const m = c && c.store ? c.store.getState().messages.get(id) : null;
    return m && typeof m.content === 'string' ? m.content : '';
  }
  const oneLine = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  // 미리보기: 답변들이 같은 상태줄(인용 '>'·제목 '#'·표·구분선)로 시작하는 경우가 많아, 그 줄들은 건너뛰고 첫 본문 줄을 보여 준다(서식 기호는 뺌)
  // 이미지(![](…))·링크 주소·HTML 태그·숨김 주석([..]: #)도 빼고, 글자가 8자 이상 남는 첫 줄
  function previewOf(s, n) {
    const clean = (l) => l.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/[*_~`]+/g, '').trim();
    const lines = String(s || '').split('\n').map((l) => l.trim());
    const body = lines.filter((l) => l && !/^(>|#|\||-{3,}|\*{3,}|_{3,}|```|\[[^\]]*\]:\s)/.test(l)).map(clean).find((l) => l.length >= 8)
      || lines.map(clean).find(Boolean) || '';
    return oneLine(body, n);
  }
  // 한 그룹이 지울 메시지들: 답변 비교가 있으면 후보 전부, 아니면 보이는 메시지 하나
  function groupIds(g) {
    const cp = compareOf(g);
    if (cp) return cp.messageIds.slice();
    const m = groupMsg(g);
    return m && m._id ? [m._id] : [];
  }
  let delBusy = false;
  async function delIds(ids) {
    const done = [];
    for (const id of ids) {
      const c = chatCtx();
      if (!c || !c.actions || !c.store) return { done, err: '크랙 화면 연결을 찾지 못했어요' };
      if (c.state && c.state.status !== 'IDLE') return { done, err: '답변을 만드는 중에는 지울 수 없어요' };
      const text = msgText(id);
      try { await c.actions.removeMessage(id); } catch (_) { /* 크랙이 알림을 띄운다 */ }
      const after = chatCtx();
      if (after && after.store && after.store.getState().messages.has(id)) return { done, err: '크랙이 지우지 못했어요 · 앞의 ' + done.length + '개만 지웠어요' };
      done.push({ id, text });
    }
    return { done, err: '' };
  }
  // 다 지운 뒤: 알림을 누르면 지운 글을 복사(지운 순서대로, 사이에 구분선)
  function delDoneToast(res, what) {
    const n = res.done.length;
    const texts = res.done.map((x) => x.text).filter(Boolean);
    if (res.err) { toast(res.err, { key: 'del', duration: 5000 }); return; }
    toast(what + ' ' + n + '개를 지웠어요' + (texts.length ? ' · 눌러서 지운 글 복사' : ''), {
      key: 'del', duration: 8000,
      onClick: texts.length ? () => { navigator.clipboard.writeText(texts.join('\n\n────────\n\n')).then(() => toast('지운 글을 복사했어요', { key: 'del' }), () => toast('복사가 막혔어요', { key: 'del' })); } : undefined,
    });
  }
  // 확인 창(하나를 재사용): 제목·부제·본문 + 취소 / 삭제(빨강, 열린 뒤 0.8초 잠금)
  let dmEl = null, dmCtl = null;
  function dmClose() { if (dmEl && dmEl.isConnected) dmEl.remove(); dmCtl = null; }
  function dmOpen(o) {
    if (!dmEl) {
      dmEl = document.createElement('div');
      dmEl.id = 'cpb-dm';
      dmEl.innerHTML = '<div class="win" role="dialog" aria-modal="true"><div class="hd"><span class="ic">' + DEL_SVG + '</span><div><b data-t></b><small data-s></small></div><button type="button" class="x" data-close aria-label="닫기">' + X_SVG + '</button></div>'
        + '<div class="bd" data-b></div><div class="ft"><span class="note" data-n></span><button type="button" class="btn" data-close>취소</button><button type="button" class="btn danger" data-ok></button></div></div>';
      for (const type of ['keydown', 'keyup', 'keypress']) {
        dmEl.addEventListener(type, (e) => { e.stopPropagation(); if (type === 'keydown' && e.key === 'Escape' && !delBusy) { e.preventDefault(); dmClose(); } });
      }
      dmEl.addEventListener('mousedown', (e) => { if (e.target === dmEl && !delBusy) dmClose(); });
      dmEl.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]') && !delBusy) { dmClose(); return; }
        if (e.target.closest('[data-ok]') && dmCtl && !dmCtl.locked && !delBusy) dmCtl.ok();
      });
      dmEl.addEventListener('change', () => { if (dmCtl && dmCtl.change) dmCtl.change(); });
    }
    dmEl.querySelector('[data-t]').textContent = o.title;
    dmEl.querySelector('[data-s]').textContent = o.sub || '';
    dmEl.querySelector('[data-b]').innerHTML = o.body;
    dmEl.querySelector('[data-n]').textContent = o.note || '지운 메시지는 되돌릴 수 없어요';
    const okBtn = dmEl.querySelector('[data-ok]');
    dmCtl = { locked: true, ok: o.onOk, change: null };
    const refresh = () => { const r = o.okState ? o.okState() : { label: o.okLabel, on: true }; okBtn.textContent = r.label; okBtn.disabled = !r.on || dmCtl.locked || delBusy; };
    dmCtl.change = refresh;
    dmCtl.refresh = refresh;
    if (dmEl.parentNode !== document.body) document.body.appendChild(dmEl);
    refresh();
    setTimeout(() => { if (dmCtl) { dmCtl.locked = false; refresh(); } }, 800);
    setTimeout(() => { const f = dmEl.querySelector('input,[data-close]'); if (f) f.focus(); }, 0);
    return dmCtl;
  }
  // '다른 답변 지우기': 답변 후보 가운데 지금 보이는 것은 남기고, 고른 것만(기본은 아무것도 안 고름)
  function variantOpen(g) {
    const cp = compareOf(g);
    if (!cp || cp.isUserMessage || cp.messageIds.length < 2) return;
    const vis = cp.selectedMessageId || cp.messageIds[cp.messageIds.length - 1];
    const ids = cp.messageIds.slice();
    const body = '<div class="list">' + ids.map((id, i) => {
      const isVis = id === vis;
      const text = msgText(id);
      return '<label class="row' + (isVis ? ' vis' : '') + '"><input type="checkbox" data-id="' + escHtml(id) + '"' + (isVis ? ' disabled' : '') + '>'
        + '<span class="no">' + (i + 1) + '</span><span class="tx">' + escHtml(previewOf(text, 140) || '(내용 없음)') + '</span>'
        + '<small>' + NUMF.format(text.length) + '자</small>' + (isVis ? '<em>지금 보이는 답변</em>' : '') + '</label>';
    }).join('') + '</div>';
    const picked = () => Array.from(dmEl.querySelectorAll('input[data-id]:checked')).map((x) => x.dataset.id);
    const ctl = dmOpen({
      title: '다른 답변 지우기',
      sub: '이 턴의 답변 후보 ' + ids.length + '개 · 지금 보이는 답변은 남아요',
      body,
      okState: () => { const n = picked().length; return { label: n ? '고른 ' + n + '개 지우기' : '지울 답변을 고르세요', on: n > 0 }; },
      onOk: async () => {
        const list = picked();
        if (!list.length) return;
        delBusy = true;
        ctl.refresh();
        const res = await delIds(list);
        delBusy = false;
        dmClose();
        msgSoon(300);
        delDoneToast(res, '답변');
      },
    });
  }
  // '여러 개 지우기': 메시지를 눌러 고르는 모드(Shift+클릭 = 범위). 입력창 위 막대에서 지우기/취소. Esc·방 이동이면 끝난다
  let selOn = false, selLast = null, delBar = null;
  const selGroups = () => Array.from(document.querySelectorAll('.flex-col-reverse > [data-message-group-id][data-cpb-del]'));
  function selRender() {
    if (!selOn) return;
    if (!delBar) {
      delBar = document.createElement('div');
      delBar.id = 'cpb-delbar';
      delBar.innerHTML = '<span class="ic">' + MULTI_SVG + '</span><span class="tx" data-tx></span><button type="button" class="btn" data-x>취소</button><button type="button" class="btn danger" data-go>' + DEL_SVG + '<span>지우기</span></button>';
      delBar.addEventListener('click', (e) => {
        if (e.target.closest('[data-x]')) selExit();
        else if (e.target.closest('[data-go]')) selConfirm();
      });
    }
    const n = selGroups().length;
    delBar.querySelector('[data-tx]').textContent = n ? n + '개 고름 · 메시지를 누르면 넣고 빼요 · Shift+클릭은 범위' : '지울 메시지를 눌러 고르세요 · Shift+클릭은 범위';
    delBar.querySelector('[data-go]').disabled = !n;
    if (delBar.parentNode !== document.body) document.body.appendChild(delBar);
    const box = cmp.box && cmp.box.isConnected ? cmp.box.getBoundingClientRect() : null;
    delBar.style.bottom = Math.round(box ? window.innerHeight - box.top + 12 : 96) + 'px';
    delBar.style.left = Math.round(box ? box.left + box.width / 2 : window.innerWidth / 2) + 'px';
  }
  function selEnter(g) {
    selOn = true;
    flag(document.documentElement, 'data-cpb-delsel', true);
    for (const x of selGroups()) delAttr(x, 'data-cpb-del');
    if (g && optTrigger(g)) { flag(g, 'data-cpb-del', true); selLast = g; }
    selRender();
  }
  function selExit() {
    selOn = false;
    selLast = null;
    flag(document.documentElement, 'data-cpb-delsel', false);
    for (const x of selGroups()) delAttr(x, 'data-cpb-del');
    if (delBar && delBar.isConnected) delBar.remove();
  }
  function selConfirm() {
    const gs = selGroups();
    if (!gs.length) return;
    const items = gs.map((g) => {
      const ids = groupIds(g);
      const m = groupMsg(g);
      return { g, ids, role: m && m.role === 'user' ? '나' : 'AI', text: m ? m.content : '' };
    }).filter((x) => x.ids.length);
    const total = items.reduce((s, x) => s + x.ids.length, 0);
    const body = '<div class="list">' + items.map((x) => '<div class="row"><span class="who' + (x.role === '나' ? ' me' : '') + '">' + x.role + '</span><span class="tx">' + escHtml(previewOf(x.text, 140) || '(내용 없음)') + '</span>'
      + (x.ids.length > 1 ? '<em>후보 ' + x.ids.length + '개</em>' : '') + '</div>').join('') + '</div>';
    const ctl = dmOpen({
      title: '메시지 ' + items.length + '개 지우기',
      sub: total > items.length ? '답변 후보까지 모두 ' + total + '개를 지워요' : '고른 메시지를 지워요',
      body,
      okLabel: items.length + '개 지우기',
      onOk: async () => {
        delBusy = true;
        ctl.refresh();
        const res = await delIds(items.flatMap((x) => x.ids));
        delBusy = false;
        dmClose();
        selExit();
        msgSoon(300);
        delDoneToast(res, '메시지');
      },
    });
  }
  document.addEventListener('click', (e) => {
    if (!selOn) return;
    if (e.target.closest && e.target.closest('#cpb-delbar,#cpb-dm')) return;
    const g = msgGroupOf(e.target);
    if (!g) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!optTrigger(g)) { toast('이 메시지는 지울 수 없어요', { key: 'del' }); return; }
    if (e.shiftKey && selLast && selLast.isConnected && selLast.parentElement === g.parentElement) {
      const all = Array.from(g.parentElement.children);
      const a = all.indexOf(selLast), b = all.indexOf(g);
      for (const x of all.slice(Math.min(a, b), Math.max(a, b) + 1)) if (msgGroupOf(x) === x && optTrigger(x)) flag(x, 'data-cpb-del', true);
    } else {
      flag(g, 'data-cpb-del', !g.hasAttribute('data-cpb-del'));
    }
    selLast = g;
    selRender();
  }, true);
  document.addEventListener('keydown', (e) => { if (selOn && e.key === 'Escape' && !(dmEl && dmEl.isConnected)) selExit(); }, true);
  window.addEventListener('resize', () => { if (selOn) selRender(); });
  on('route', () => { selExit(); dmClose(); });
  // 메시지 메뉴 항목: 크랙 '삭제' 바로 위에 넣는다(지우는 것끼리 모아 두기)
  function mkMenuItem(menu, cls, svg, label, onPick, t) {
    if (menu.querySelector(':scope > .' + cls)) return null;
    const ref = menu.querySelector(':scope > [role="menuitem"]:not([class*="cpb-"])');
    if (!ref) return null;
    const it = document.createElement('div');
    it.className = ref.className + ' ' + cls + ' cpb-mi';
    it.setAttribute('role', 'menuitem');
    it.tabIndex = -1;
    it.innerHTML = svg + '<span>' + escHtml(label) + '</span>';
    const rs = ref.querySelector('svg');
    if (rs && rs.getAttribute('class')) it.firstChild.setAttribute('class', rs.getAttribute('class'));
    it.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    it.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (t.isConnected && trigOpen(t)) triggerToggle(t);
      setTimeout(onPick, 60); // 크랙 메뉴(모달)가 닫힌 뒤
    });
    const del = Array.from(menu.querySelectorAll(':scope > [role="menuitem"]')).find((x) => !x.className.includes('cpb-') && x.textContent.trim() === '삭제');
    if (del) del.before(it); else menu.appendChild(it);
    return it;
  }
  // ── 라디오존데: IGX가 5분마다 잰 모델별 상태·점수·첫 토큰 지연을 입력창 바로 위 한 줄로 ──
  // 값: rs.igx.kr/api/v2/simple/bulk?models=…(IGX 공지 권장 묶음 요청. CDN으로 넘어가며 CORS가 열려 있다). 5분에 한 번(측정 30초 뒤), 탭이 보일 때만.
  // 모델 목록 = 2026-10-11 IGX 사이트의 24개 + IGX /v2/models(하루 한 번) + 크랙 모델 엔진 이름을 IGX 이름으로 바꾼 것(IGX에 있을 때만 = 크랙에 새 엔진이 생기면 자동).
  // IGX 사이트 HTML의 최신 목록은 CORS에 막혀 직접 읽지 못한다. 모르는 이름이 섞이면 묶음 요청이 400이라, 그때만 하나씩 확인해 뺀다
  const RAD_API = 'https://rs.igx.kr/api/v2/';
  const RAD_SEED = ['claude-fable-5.1', 'claude-fable-5', 'claude-opus-5.5', 'claude-opus-5', 'claude-opus-4.8', 'claude-opus-4.7', 'claude-opus-4.6', 'claude-sonnet-5.5', 'claude-sonnet-5', 'claude-haiku-5.5',
    'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite',
    'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'deepseek-v4.1-flash', 'deepseek-v4-pro'];
  const RAD_KEY = 'crack-pc-base:rs';
  const radOn = (k) => !(isObj(conf.radio) && conf.radio[k] === false);
  const radHidden = () => new Set(isObj(conf.radio) && Array.isArray(conf.radio.hidden) ? conf.radio.hidden : []);
  let radState = readJSON(RAD_KEY);
  if (!isObj(radState)) radState = {};
  if (!isObj(radState.bad)) radState.bad = {};
  if (!isObj(radState.data)) radState.data = {};
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function radName(slug) {
    let m;
    if ((m = slug.match(/^claude-([a-z]+)-([\d.]+)$/))) return cap1(m[1]) + ' ' + m[2];
    if ((m = slug.match(/^gemini-([\d.]+)-(pro|flash)(-lite)?(?:-preview)?$/))) return 'Gemini ' + m[1] + ' ' + cap1(m[2]) + (m[3] ? '-Lite' : '');
    if ((m = slug.match(/^gpt-([\d.]+)-([a-z]+)$/))) return 'GPT-' + m[1] + ' ' + cap1(m[2]);
    if ((m = slug.match(/^deepseek-v([\d.]+)-([a-z]+)$/))) return 'DeepSeek V' + m[1] + ' ' + cap1(m[2]);
    return slug;
  }
  // 크랙 엔진 이름('Opus 4.7', 'Sonnet-5', 'Gemini 3.1 Pro') → IGX 이름 후보
  function engineSlugs(engine) {
    const e = String(engine || '').toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    let m;
    if ((m = e.match(/^(?:claude )?(fable|opus|sonnet|haiku) (\d+(?:\.\d+)?)$/))) return ['claude-' + m[1] + '-' + m[2]];
    if ((m = e.match(/^gemini (\d+(?:\.\d+)?) (pro|flash)( lite)?$/))) { const b = 'gemini-' + m[1] + '-' + m[2] + (m[3] ? '-lite' : ''); return [b, b + '-preview']; }
    return [];
  }
  // 줄에 쓰는 약자: 원래 라디오존데와 같다(F5.1 · O4.8 · G3.1P · G6S · D4.1F …)
  function radShort(slug) {
    let m;
    if ((m = slug.match(/^claude-([a-z]+)-([\d.]+)$/))) return m[1].charAt(0).toUpperCase() + m[2];
    if ((m = slug.match(/^gemini-([\d.]+)-(pro|flash)(-lite)?(?:-preview)?$/))) return 'G' + m[1] + m[2].charAt(0).toUpperCase() + (m[3] ? 'L' : '');
    if ((m = slug.match(/^([a-z]+)-v?([\d.]+)-([a-z-]+)$/))) return (m[1].charAt(0) + m[2] + m[3].split('-').map((w) => w.charAt(0)).join('')).toUpperCase().slice(0, 8);
    return slug.slice(0, 8);
  }
  // 상태 → 원래 라디오존데 색 단계(정상 초록 · 저하 노랑 · 장애 빨강 · 모름 회색)
  const radBand = (st) => {
    const s = String(st || '').trim().toLowerCase();
    if (['active', 'operational', 'ok', 'healthy', 'online', 'normal'].includes(s)) return 'active';
    if (['degraded', 'slow', 'warning', 'warn', 'unstable'].includes(s)) return 'degraded';
    if (['impacted', 'down', 'offline', 'error', 'failed', 'failure', 'unavailable', 'critical', 'inactive'].includes(s)) return 'impacted';
    return 'unknown';
  };
  const RAD_KO = { active: '정상', degraded: '저하', impacted: '장애', unknown: '값 없음' };
  async function radGet(path) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch(RAD_API + path, { credentials: 'omit', cache: 'no-store', signal: ac.signal });
      const j = await r.json().catch(() => null);
      return { s: r.status, j };
    } catch (_) { return { s: 0, j: null }; } finally { clearTimeout(to); }
  }
  const radSave = () => writeJSON(RAD_KEY, radState);
  function radList() {
    const out = [];
    for (const s of RAD_SEED.concat(Array.isArray(radState.extra) ? radState.extra : [])) if (!out.includes(s) && !radState.bad[s]) out.push(s);
    return out;
  }
  // 하루 한 번: IGX /v2/models에 새 이름이 있으면 더하고, 크랙 엔진에서 나온 이름은 IGX에 있는지 하나씩 확인해 더한다(없으면 7일 동안 다시 안 물음)
  async function radDiscover() {
    if (Date.now() - (radState.listAt || 0) < 86400000) return;
    radState.listAt = Date.now();
    for (const s of Object.keys(radState.bad)) if (Date.now() - radState.bad[s] > 7 * 86400000) delete radState.bad[s];
    const extra = new Set(Array.isArray(radState.extra) ? radState.extra : []);
    const r = await radGet('models');
    const arr = r.j && (Array.isArray(r.j) ? r.j : r.j.data);
    if (Array.isArray(arr)) for (const s of arr) if (typeof s === 'string' && /^[a-z0-9][a-z0-9._-]{2,60}$/.test(s)) extra.add(s);
    const known = new Set(RAD_SEED.concat([...extra]));
    for (const k of Object.keys(models)) {
      if (models[k].dead) continue;
      for (const s of engineSlugs(models[k].engine)) {
        if (known.has(s) || radState.bad[s]) continue;
        const t = await radGet('simple/' + encodeURIComponent(s));
        if (t.s === 200) { extra.add(s); known.add(s); } else if (t.s === 400 || t.s === 404) radState.bad[s] = Date.now();
      }
    }
    radState.extra = [...extra].filter((s) => !RAD_SEED.includes(s));
    radSave();
    radMenuUpdate();
  }
  let radBusy = false, radT = 0, radEl = null, radTryAt = 0;
  const radActive = () => page && radOn('on') && !document.hidden;
  // 자동 받기는 마지막 '시도'에서 1분 뒤부터(성공 시각만 보면 실패·빈 목록일 때 받기→그리기→받기 고리가 쉬지 않고 돈다)
  const radMayAuto = () => !radBusy && radActive() && Date.now() - radTryAt > 60000;
  async function radFetch() {
    if (radBusy || !radActive()) return;
    radBusy = true;
    radTryAt = Date.now();
    const rb = radEl && radEl.querySelector('[data-r]');
    if (rb) rb.disabled = true;
    let got = false;
    try {
      await radDiscover();
      const hid = radHidden();
      const want = () => radList().filter((s) => !hid.has(s));
      const list = want();
      if (!list.length) return;
      // 묶음 요청은 한 번에 20개까지(IGX 실측: 'model array parameter limited up to 20 models'). 묶음에서 400이 나면 그 묶음만 하나씩 확인해 모르는 이름을 뺀다
      let okAny = false, failAny = false;
      for (let i = 0; i < list.length; i += 20) {
        let part = list.slice(i, i + 20);
        let r = await radGet('simple/bulk?models=' + part.map(encodeURIComponent).join(','));
        if (r.s === 400) {
          for (const s of part) { const t = await radGet('simple/' + encodeURIComponent(s)); if (t.s === 400 || t.s === 404) radState.bad[s] = Date.now(); }
          part = part.filter((s) => !radState.bad[s]);
          r = part.length ? await radGet('simple/bulk?models=' + part.map(encodeURIComponent).join(',')) : r;
        }
        const d = r.j && r.j.data;
        if (r.s === 200 && isObj(d)) { Object.assign(radState.data, d); okAny = true; } else failAny = true;
      }
      if (okAny) { radState.at = Date.now(); radState.err = failAny ? Date.now() : 0; got = true; } else radState.err = Date.now();
      radSave();
    } finally {
      radBusy = false;
      radRender();
      if (got) radBeat();
      radSchedule();
    }
  }
  const radLast = () => Object.values(radState.data).reduce((a, v) => Math.max(a, Number(v && v.measuredAt) || 0), 0);
  // 다음 받기: IGX 다음 측정(마지막 측정 + 5분) 30초 뒤. 1~6분 사이로
  function radSchedule() {
    clearTimeout(radT);
    if (!radActive()) return;
    const last = radLast();
    const wait = Math.max(60000, Math.min(6 * 60000, last ? last + 5 * 60000 + 30000 - Date.now() : 5 * 60000));
    radT = setTimeout(radFetch, wait);
  }
  // 원래 라디오존데의 맥박 아이콘과 갱신(↻) 모양
  const RAD_PULSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M2 12h4l2.25-11.25a.5.5 0 0 1 .98 0l4.54 22.5a.5.5 0 0 0 .98 0L17 12h5"/></svg>';
  const RAD_REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4.2h-4.2"/></svg>';
  function radBuild() {
    radEl = document.createElement('div');
    radEl.className = 'cpb-rs';
    // 원래 라디오존데가 따로 켜져 있으면 아이디가 겹치지 않게 테마 이름은 빼고 class만 쓴다
    const own = !document.getElementById('igx-live-popup');
    const id = (x) => (own ? ' id="' + x + '"' : '');
    if (own) radEl.id = 'igx-live-popup';
    radEl.innerHTML = '<div class="hd"' + id('igx-live-head') + '><div class="lf"' + id('igx-live-left') + '><div class="inline-icon">' + RAD_PULSE_SVG + '</div><div class="bar"' + id('igx-live-barline') + ' data-l></div></div>'
      + '<div class="acts"' + id('igx-live-actions') + '><button type="button" class="igx-btn" data-r aria-label="라디오존데 갱신" title="갱신">' + RAD_REFRESH_SVG + '</button></div></div>';
    radEl.querySelector('[data-r]').addEventListener('click', () => { radState.listAt = radState.listAt || 0; radFetch(); });
    radEl.querySelector('[data-r]').addEventListener('mousedown', (e) => e.preventDefault());
    const bar = radEl.querySelector('[data-l]');
    bar.addEventListener('wheel', (e) => { const l = e.currentTarget; if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && l.scrollWidth > l.clientWidth) { l.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  }
  function radRender() {
    const box = cmp.box;
    const want = page && radOn('on') && box && box.isConnected && box.parentNode;
    if (!want) { if (radEl && radEl.isConnected) radEl.remove(); return; }
    if (!radEl) radBuild();
    if (radEl.parentNode !== box.parentNode || radEl.nextElementSibling !== box) box.parentNode.insertBefore(radEl, box);
    // 입력창과 4px만 띄운다: 크랙 묶음의 세로 간격(gap)만큼 아래 여백을 당긴다
    const g = parseFloat(getComputedStyle(box.parentNode).rowGap) || 0;
    const mb = Math.min(4, 4 - g) + 'px';
    if (radEl.style.marginBottom !== mb) radEl.style.marginBottom = mb;
    const hid = radHidden(), data = radState.data;
    const lat = radOn('latency');
    const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x));
    const rows = [];
    const html = radList().filter((s) => !hid.has(s)).map((s) => {
      const v = data[s];
      const b = v ? radBand(v.status) : 'unknown';
      const scN = v ? num(v.score) : NaN, lN = v ? num(v.latency) : NaN, tN = v ? num(v.tps) : NaN;
      const sc = Number.isFinite(scN) ? String(Math.round(scN)) : '—';
      const ls = Number.isFinite(lN) && lN >= 0 ? (lN / 1000).toFixed(2) : '—';
      rows.push({ s, b, sc: sc !== '—' ? +sc : NaN, ls: ls !== '—' ? +ls : NaN });
      const tip = radName(s) + ' · ' + RAD_KO[b] + (sc !== '—' ? ' · 점수 ' + sc : '') + (ls !== '—' ? ' · 첫 토큰 ' + ls + '초' : '') + (Number.isFinite(tN) ? ' · 초당 ' + Math.round(tN) + '토큰' : '');
      return '<span class="bitem st-' + b + '" title="' + escHtml(tip) + '"><span class="bdot"></span><span class="bname">' + escHtml(radShort(s)) + '</span><span class="bscore">' + sc + '</span>'
        + (lat ? '<span class="blat">' + ls + (ls !== '—' ? '<span class="bunit">s</span>' : '') + '</span>' : '') + '</span>';
    }).join('');
    const l = radEl.querySelector('[data-l]');
    if (l.dataset.sig !== html) { l.dataset.sig = html; l.innerHTML = html || '<span class="none">선택된 모델 없음</span>'; radAnimate(l, rows); }
    // 갱신 버튼: 받는 동안 흐리게 잠그고, 풍선 도움말에 마지막 수신 시각(원래 라디오존데와 같은 문구)
    const rb = radEl.querySelector('[data-r]');
    rb.disabled = radBusy;
    const fail = !!radState.err && radState.err > (radState.at || 0);
    const at = radState.at ? new Date(radState.at).toLocaleTimeString() : '';
    const tt = fail ? (at ? '연결 실패 · 마지막 수신 ' + at : '연결 실패 · 다시 갱신') : (at ? '갱신 · 마지막 수신 ' + at : '갱신');
    if (rb.title !== tt) rb.title = tt;
    if ((!radState.at || Date.now() - radState.at > 5 * 60000) && radMayAuto()) radFetch(); else if (!radT) radSchedule();
  }
  // 값이 바뀐 것만 움직인다(대시보드 숫자와 같은 0.7초): 점수·응답 시간은 이전 값에서 굴러가고 점수가 살짝 튐, 상태가 바뀌면 점이 톡. 처음 그릴 때·탭이 안 보일 때·동작 줄이기면 안 움직임
  const radShown = new Map();
  function radCount(node, from, to, dec) {
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      if (!node.isConnected) return;
      const q = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - q, 3);
      node.nodeValue = (from + (to - from) * e).toFixed(dec);
      if (q < 1) requestAnimationFrame(step);
    };
    node.nodeValue = from.toFixed(dec);
    requestAnimationFrame(step);
  }
  function radAnimate(l, rows) {
    const calm = calmMotion() || document.hidden;
    const els = l.querySelectorAll('.bitem');
    rows.forEach((r, i) => {
      const p = radShown.get(r.s), it = els[i];
      radShown.set(r.s, r);
      if (!p || calm || !it) return;
      let moved = false;
      const scEl = it.querySelector('.bscore'), lsEl = it.querySelector('.blat');
      if (Number.isFinite(p.sc) && Number.isFinite(r.sc) && p.sc !== r.sc && scEl && scEl.firstChild) { radCount(scEl.firstChild, p.sc, r.sc, 0); moved = true; }
      if (Number.isFinite(p.ls) && Number.isFinite(r.ls) && p.ls !== r.ls && lsEl && lsEl.firstChild) radCount(lsEl.firstChild, p.ls, r.ls, 2);
      if (moved) it.classList.add('chg');
      if (p.b !== r.b) it.classList.add('bchg');
      if (moved || p.b !== r.b) setTimeout(() => it.classList.remove('chg', 'bchg'), 900);
    });
  }
  // 새 값이 들어오면 맥박 아이콘이 한 번 그려진다
  function radBeat() {
    const ic = radEl && radEl.isConnected && radEl.querySelector('.inline-icon');
    if (!ic || calmMotion() || document.hidden) return;
    ic.classList.remove('beat');
    void ic.offsetWidth; // 같은 움직임을 처음부터 다시
    ic.classList.add('beat');
    clearTimeout(ic._t);
    ic._t = setTimeout(() => ic.classList.remove('beat'), 1100);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(radT); radT = 0; } else if (radActive()) { if (Date.now() - (radState.at || 0) > 5 * 60000 && radMayAuto()) radFetch(); else radSchedule(); } });
  let radMenu = null;
  function radMenuChildren() {
    const kids = [
      { id: 'on', label: '라디오존데 (입력창 위 한 줄)', toggle: { get: () => radOn('on'), set: (v) => settings.set('radio.on', !!v) } },
      { id: 'latency', label: '첫 토큰 지연 시간 표시', toggle: { get: () => radOn('latency'), set: (v) => settings.set('radio.latency', !!v) } },
      { id: 'refresh', label: '지금 새로고침', onClick: () => { radFetch(); toast('라디오존데를 새로 받는 중이에요', { key: 'rs' }); } },
    ];
    for (const s of radList()) {
      kids.push({ id: 'm:' + s, label: radName(s), toggle: { get: () => !radHidden().has(s), set: (v) => {
        const h = radHidden();
        if (v) h.delete(s); else h.add(s);
        settings.set('radio.hidden', [...h]);
      } } });
    }
    return kids;
  }
  function radMenuUpdate() { if (radMenu) radMenu.update({ children: radMenuChildren() }); }

  // ── 이미지 보관함: 크랙은 시작설정 탭마다 10장씩 받는데, 맨 아래까지 내려도 다음 장을 안 받아 20장에서 멈춘다(2026-10-11 실측: 221장 중 20장).
  // 또 첫 장 요청을 두 번 보내서, 엇갈리면 같은 장이 두 번 나온다.
  // 그래서 첫 요청(커서 없음)을 대신 받는다: 그 탭의 모든 장을 40장씩(서버 최대 40) 이어 받아 합치고, 같은 이미지(id)는 하나만, 해금한 것을 위로 올려
  // '더 없음'으로 돌려준다. 같은 탭 요청은 받는 중인 것을 함께 쓰고 20초 동안 다시 쓴다. 하나라도 실패하면 크랙 원래 요청이 그대로 나간다.
  // 스토리 채팅 보관함만(캐릭터 채팅·제작 화면은 건드리지 않는다)
  const VAULT_RE = /\/crack-api\/collected-images\/story-starting-sets\/([^/?#]+)\/images(?:\?|$)/;
  const vaultOn = (k) => !(isObj(conf.vault) && conf.vault[k] === false);
  const vaultCache = new Map(); // 시작설정 id → {at, p: Promise<json|null>}
  function vaultHeaders(headers) {
    const h = {};
    for (const [k, v] of Object.entries(headers)) if (!/^(host|connection|content-length)$/i.test(k)) h[k] = v;
    if (!Object.keys(h).some((k) => /^authorization$/i.test(k))) { const t = cookieGet('access_token'); if (!t) return null; h.Authorization = 'Bearer ' + t; }
    return h;
  }
  // 한 탭의 전체 목록(받는 중이면 함께 쓰고 20초 동안 다시 씀)
  function vaultSet(url, headers) {
    const id = (url.match(VAULT_RE) || [])[1];
    const c = vaultCache.get(id);
    if (c && Date.now() - c.at < 20000) return c.p;
    const p = vaultAll(url, headers).catch(() => null);
    vaultCache.set(id, { at: Date.now(), p });
    p.then((j) => { if (!j) vaultCache.delete(id); });
    return p;
  }
  async function vaultAll(url, headers) {
    const h = vaultHeaders(headers);
    if (!h) return null;
    let first = null, cursor = '';
    const imgs = [];
    for (let i = 0; i < 40; i++) {
      const u = new URL(url, location.href);
      u.searchParams.set('limit', '40');
      if (cursor) u.searchParams.set('cursor', cursor); else u.searchParams.delete('cursor');
      const r = await fetch(u.href, { headers: h });
      if (!r.ok) return null;
      const j = await r.json();
      const d = j && j.data;
      if (!d || !Array.isArray(d.images)) return null;
      if (!first) first = j;
      imgs.push(...d.images);
      if (!d.hasNext || !d.nextCursor || d.nextCursor === cursor) break;
      cursor = d.nextCursor;
    }
    const seen = new Set(), list = [];
    for (const m of imgs) { const k = m && (m.id || m.imageUrl); if (!k || seen.has(k)) continue; seen.add(k); list.push(m); }
    if (vaultOn('collectedFirst')) list.sort((a, b) => (b.isCollected === true) - (a.isCollected === true)); // 순서 유지 정렬
    return { ...first, data: { ...first.data, images: list, hasNext: false, nextCursor: null } };
  }
  xhrRespond.push({
    test: VAULT_RE,
    on: () => page && vaultOn('on'),
    // 이어 받기 요청은 크랙 그대로(우리가 '더 없음'을 주므로 보통 오지 않는다)
    respond: ({ url, headers }) => (/[?&]cursor=[^&]/.test(url) ? null : vaultSet(url, headers)),
  });
  // 해금 수 바로잡기: 크랙 제목·패널 버튼의 '이미지 보관함 (해금/전체)'은 보관함 정보 요청의 count에서 나온다.
  // 그런데 해금 수가 실제보다 적게 온다(2026-10-11 실측: 47이라는데 탭 목록에서 해금된 서로 다른 이미지는 86). 전체 수(서로 다른 이미지)는 맞다.
  // 보관함 버튼을 누른 직후의 정보 요청 때만 세 탭 목록을 동시에 받아(탭 화면에도 그대로 다시 씀) 실제 해금 수를 세고 기억한다.
  // 다른 때(방 들어올 때·창 돌아올 때)는 추가 요청 없이 기억한 값을 쓴다. 그 뒤 크랙 숫자가 늘면 늘어난 만큼 더한다
  const VAULT_INFO_RE = /\/crack-api\/collected-images\/story-snapshots\/([^/?#]+)\/info(?:\?|$)/;
  const VAULT_COUNT_KEY = 'crack-pc-base:vaultCount'; // {스냅샷 id: {server, real, at}}
  let vaultOpenAt = 0;
  async function vaultInfo(url, headers) {
    const h = vaultHeaders(headers);
    if (!h) return null;
    const r = await fetch(url, { headers: h });
    if (!r.ok) return null;
    const j = await r.json();
    const d = j && j.data;
    if (!d || !isObj(d.count) || !Array.isArray(d.startingSets)) return j;
    const sid = (url.match(VAULT_INFO_RE) || [])[1];
    const store = readJSON(VAULT_COUNT_KEY) || {};
    let rec = store[sid];
    if (Date.now() - vaultOpenAt < 5000 && d.startingSets.length) {
      const base = url.replace(/\/story-snapshots\/[^/?#]+\/info.*$/, '/story-starting-sets/');
      const lists = await Promise.all(d.startingSets.map((s) => vaultSet(base + encodeURIComponent(s.startingSetId) + '/images?limit=10', headers)));
      if (lists.every(Boolean)) {
        const col = new Set();
        for (const l of lists) for (const m of l.data.images) if (m && m.isCollected === true) col.add(m.id);
        rec = { server: Number(d.count.collected) || 0, real: col.size, at: Date.now() };
        store[sid] = rec;
        for (const k of Object.keys(store)) if (!isObj(store[k]) || Date.now() - store[k].at > 60 * 86400000) delete store[k];
        writeJSON(VAULT_COUNT_KEY, store);
      }
    }
    if (!isObj(rec)) return j;
    const now = Number(d.count.collected) || 0;
    const real = rec.real + Math.max(0, now - rec.server);
    return real > now ? { ...j, data: { ...d, count: { ...d.count, collected: real } } } : j;
  }
  xhrRespond.push({ test: VAULT_INFO_RE, on: () => page && vaultOn('fixCount'), respond: ({ url, headers }) => vaultInfo(url, headers) });
  // 보관함 버튼(우측 패널 '이미지 보관함 (n/m)')을 누른 때만 기록한다
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (b && /^이미지 보관함 \(\d+\/\d+\)$/.test(b.textContent.trim())) vaultOpenAt = Date.now();
  }, true);
  // 방에 들어올 때 크랙은 우리 스크립트가 붙기 전에 보관함 정보를 받아 버린다. 기억한 해금 수가 있는 작품이면
  // 붙은 뒤 그 정보만 크랙에게 한 번 다시 받게 한다(SWR 다시 받기 → 위 대신 답하기가 숫자를 고침). 작품(스냅샷)마다 페이지당 한 번
  const vaultKicked = new Set();
  function vaultCountKick() {
    if (!page || !vaultOn('fixCount')) return true;
    const span = Array.from(document.querySelectorAll('button span')).find((e) => !e.children.length && /^이미지 보관함 \(\d+\/\d+\)$/.test(e.textContent.trim()));
    if (!span) return false;
    const fk = Object.keys(span).find((k) => k.startsWith('__reactFiber$'));
    let sid = '', mut = null, shown = -1;
    for (let f = fk ? span[fk] : null, n = 0; f && n < 14 && !(sid && mut); f = f.return, n++) {
      const p = f.memoizedProps;
      if (!sid && p && isObj(p.requestInfo) && typeof p.requestInfo.snapshotId === 'string') sid = p.requestInfo.snapshotId;
      let h = f.memoizedState;
      for (let i = 0; !mut && h && typeof h === 'object' && 'next' in h && i < 40; i++, h = h.next) {
        const v = h.memoizedState, d = v && v.data && v.data.data;
        if (!(d && isObj(d.count) && Array.isArray(d.startingSets))) continue;
        shown = Number(d.count.collected) || 0;
        for (let g = h.next, j = 0; g && j < 6; j++, g = g.next) {
          const c = g.memoizedState;
          if (Array.isArray(c) && typeof c[0] === 'function' && Array.isArray(c[1]) && c[1].length === 0 && c[0].length === 0 && /^\(\.\.\.\w+\)=>/.test(String(c[0]))) { mut = c[0]; break; }
        }
      }
    }
    if (!sid) return false;
    if (vaultKicked.has(sid)) return true;
    const rec = (readJSON(VAULT_COUNT_KEY) || {})[sid];
    if (!isObj(rec)) return true;
    if (!mut || shown < 0) return false;
    if (shown >= rec.real) return true;
    vaultKicked.add(sid);
    attempt(() => mut());
    return true;
  }
  on('route', () => { let n = 0; const go = () => { if (!vaultCountKick() && ++n < 6) setTimeout(go, 1500); }; setTimeout(go, 1200); });

  function addDeleteItems(menu, g, t) {
    if (!menu.isConnected || selOn) return;
    if (delOn('multiDelete')) mkMenuItem(menu, 'cpb-mdel', MULTI_SVG, '여러 개 지우기', () => selEnter(g), t);
    const cp = delOn('variantDelete') ? compareOf(g) : null;
    if (cp && !cp.isUserMessage && cp.messageIds.length > 1) mkMenuItem(menu, 'cpb-vdel', VAR_SVG, '다른 답변 지우기 (' + (cp.messageIds.length - 1) + '개)', () => variantOpen(g), t);
  }

  // ── 채팅 목록(왼쪽 사이드바): 사이드바가 있는 모든 화면(홈·상세·설정·스토리 채팅)에서 ──────────────
  // 크랙 사이드바 = .bg-sidebar.shrink-0 안에 '에피소드' 탭이 있는 것만(캐릭터 화면은 구조가 달라 빠진다).
  // 한 스크롤 안에 [보관함 칸(max-h 284px, 스크롤 없음) · 구분선 · '채팅 목록' 머리줄](virtuoso Header) + 방 목록(virtuoso, 행 DOM 재사용).
  // 방 행 ⋯ = Radix 메뉴(Portal 없이 행 <a> 안에 그려진다 → 메뉴에 넣는 우리 버튼은 click에서 preventDefault 필수)
  const SIDE_ROW = 'a[class*="group/chat-list-item"][href^="/stories/"][href*="/episodes/"]';
  const SIDE_TRIG = 'button[aria-label="채팅방 메뉴"][aria-haspopup="menu"]';
  const CL_COLORS_KEY = 'crack-pc-base:chatColors'; // {chatId: 'rose'|'gold'|'emerald'|'teal'|'violet'}
  const CL_COLORS = [['rose', '분홍'], ['gold', '노랑'], ['emerald', '초록'], ['teal', '청록'], ['violet', '보라']];
  const clOn = (k) => !(isObj(conf.chatlist) && conf.chatlist[k] === false);
  const clArchH = () => { const v = Number(isObj(conf.chatlist) ? conf.chatlist.archiveH : 0); return v >= 50 ? Math.min(v, 2000) : 284; };
  const sideChatId = (a) => { const m = String(a.getAttribute('href') || '').match(/\/episodes\/([^/?#]+)/); return m ? m[1] : ''; };
  let clColors = null;
  const colorMap = () => (clColors || (clColors = isObj(readJSON(CL_COLORS_KEY)) ? readJSON(CL_COLORS_KEY) : {}));
  function colorSave(map) { clColors = map; writeJSON(CL_COLORS_KEY, map); }
  const side = { root: null, mo: null, tries: 0, t: 0, raf: 0, arch: null, grip: null, idle: 0 };
  function sideFind() {
    for (const r of document.querySelectorAll('.bg-sidebar.shrink-0')) if (r.querySelector('[id$="-trigger-episode"]')) return r;
    return null;
  }
  function sideDetach() {
    if (side.mo) side.mo.disconnect();
    if (side.root) sideUnbind(side.root);
    side.mo = null;
    side.root = null;
    side.arch = side.grip = null;
  }
  // 사이드바 찾기: 경로가 바뀔 때마다. 못 찾으면 150ms 간격으로 20번까지(그 뒤는 tick이 3초마다 가볍게 본다)
  function sideEval() {
    clearTimeout(side.t);
    if (side.root && side.root.isConnected) { sideSoon(); return; }
    sideDetach();
    const r = clOn('on') ? sideFind() : null;
    if (!r) { if (clOn('on') && ++side.tries <= 20) side.t = setTimeout(sideEval, 150); return; }
    side.tries = 0;
    side.root = r;
    // 사이드바 안만 본다(행 추가·재사용 = childList와 href). 답변 글자 스트리밍과는 무관
    side.mo = new MutationObserver(sideSoon);
    side.mo.observe(r, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    sideBind(r);
    sideSoon();
  }
  function sideSoon() { if (!side.raf) side.raf = requestAnimationFrame(sideRender); }
  // 보관함 칸: virtuoso Header 안에서 첫 줄(div.h-7)의 첫 글자가 정확히 '보관함'인 overflow-hidden 칸. 바로 다음 형제(.border-t)가 끌기 손잡이
  function sideArchive(sc) {
    for (const s of sc.querySelectorAll('div.h-7 > span')) {
      if (s.childElementCount || s.textContent.trim() !== '보관함') continue;
      const arch = s.parentElement.parentElement;
      if (!arch || !arch.classList.contains('overflow-hidden')) continue;
      const grip = arch.nextElementSibling;
      return { arch, grip: grip && grip.classList.contains('border-t') ? grip : null };
    }
    return null;
  }
  function sideRender() {
    side.raf = 0;
    const r = side.root;
    if (!r || !r.isConnected) { sideEval(); return; }
    const on = clOn('on');
    const sc = r.querySelector('[data-testid="virtuoso-scroller"]');
    const found = on && clOn('resize') && sc ? sideArchive(sc) : null;
    const arch = found ? found.arch : null, grip = found ? found.grip : null;
    if (side.arch && side.arch !== arch) { delAttr(side.arch, 'data-cpb-arch'); side.arch.style.removeProperty('--cpb-arch-h'); }
    if (side.grip && side.grip !== grip) delAttr(side.grip, 'data-cpb-grip');
    side.arch = arch;
    side.grip = grip;
    if (arch) {
      flag(arch, 'data-cpb-arch', true);
      const h = clArchH() + 'px';
      if (arch.style.getPropertyValue('--cpb-arch-h') !== h && !side.drag) arch.style.setProperty('--cpb-arch-h', h);
    }
    if (grip) { flag(grip, 'data-cpb-grip', true); if (grip.title !== '끌어서 보관함 칸 높이 조절 · 두 번 누르면 처음 높이') grip.title = '끌어서 보관함 칸 높이 조절 · 두 번 누르면 처음 높이'; }
    // 개수 배지: 보관함 = 크랙이 받아 둔 보관함 목록의 chatCount 합(요청 0), 채팅 목록 = 인덱스가 있을 때 미분류 방 수
    if (sc) {
      const folderPages = on && clOn('countArchive') && (arch || sideArchive(sc)) ? swrInfPages((arch || sideArchive(sc).arch), 'folders') : null;
      let txt = '';
      if (folderPages) {
        const sum = folderPages.reduce((a, p) => a + ((p.data && p.data.folders) || []).reduce((b, f) => b + (f.chatCount || 0), 0), 0);
        const more = !!(folderPages[folderPages.length - 1].data || {}).nextCursor;
        txt = sum + (more ? '+' : '') + '개';
      }
      sideBadge(sc, '보관함', txt, '보관함에 든 채팅방 수');
      const ix = on && clOn('countRoot') ? chatIndex.get() : null;
      let root = '';
      if (ix) { let n = 0; for (const [, fid] of ix.folderOf) if (!fid) n++; root = n + '개'; }
      sideBadge(sc, '채팅 목록', root, '보관함에 넣지 않은 채팅방 수');
    }
    // 방 행: 지금 방 강조, 색 표시, 원본 방 깃발(행 DOM이 다른 방으로 재사용되므로 매번 href로 다시 정한다)
    const path = location.pathname;
    const cur = on && clOn('current');
    const colors = on && clOn('color') ? colorMap() : null;
    const flags = on && brOn('on') && brOn('flags') ? brCounts() : null;
    for (const a of r.querySelectorAll(SIDE_ROW)) {
      flag(a, 'data-cpb-cur', cur && a.getAttribute('href') === path);
      const id = sideChatId(a);
      const c = colors ? colors[id] : '';
      if (c) setAttr(a, 'data-cpb-color', c); else delAttr(a, 'data-cpb-color');
      const n = flags ? flags[id] || 0 : 0;
      let fl = a.querySelector(':scope .cpb-br-flag');
      if (!n) { if (fl) fl.remove(); continue; }
      const title = a.querySelector('.text-popover-foreground');
      if (!title) continue;
      if (!fl) { fl = document.createElement('span'); fl.className = 'cpb-br-flag'; }
      if (fl.previousElementSibling !== title) title.after(fl);
      const html = BR_FLAG_SVG + '<b>' + n + '</b>';
      if (fl.dataset.n !== String(n)) { fl.dataset.n = String(n); fl.innerHTML = html; fl.title = '원본 방 · 분기 ' + n + '개'; }
      flag(fl, 'data-cur', a.getAttribute('href') === path);
    }
    // 꺼졌으면 위에서 표식을 다 걷은 뒤 옵저버까지 뗀다(켜면 설정 변경 → sideEval이 다시 붙는다). 아래 두 줄은 side.root가 없으니 우리 줄·버튼을 치운다
    if (!on) sideDetach();
    attempt(() => { if (typeof ovEnsure === 'function') ovEnsure(); });
    attempt(() => { if (typeof bmEnsure === 'function') bmEnsure(); });
  }
  // 머리줄('보관함'/'채팅 목록') 글자 뒤 개수 배지. 글자는 크랙 것 그대로 두고 우리 span만 옆에 붙인다
  function sideBadge(sc, label, txt, tip) {
    let lab = null;
    for (const s of sc.querySelectorAll('div.h-7 > span')) if (!s.childElementCount && s.textContent.trim() === label) { lab = s; break; }
    if (!lab) return;
    let b = lab.nextElementSibling && lab.nextElementSibling.classList.contains('cpb-count') ? lab.nextElementSibling : null;
    if (!txt) { if (b) b.remove(); delAttr(lab.parentElement, 'data-cpb-cnt'); return; }
    if (!b) { b = document.createElement('span'); b.className = 'cpb-count'; lab.after(b); }
    flag(lab.parentElement, 'data-cpb-cnt', true);
    if (b.textContent !== txt) b.textContent = txt;
    if (b.title !== tip) b.title = tip;
  }
  // 사이드바 안에서만 듣는다(문서 전체에 리스너를 걸지 않는다): 누르기 · 우클릭 · 두 번 누르기 세 개를 사이드바 루트에 붙이고, 루트가 바뀌면 옮긴다
  function sideBind(r) {
    r.addEventListener('pointerdown', sideOnDown, true);
    r.addEventListener('contextmenu', sideOnCtx, true);
    r.addEventListener('dblclick', sideOnDbl, true);
  }
  function sideUnbind(r) {
    r.removeEventListener('pointerdown', sideOnDown, true);
    r.removeEventListener('contextmenu', sideOnCtx, true);
    r.removeEventListener('dblclick', sideOnDbl, true);
  }
  function sideOnDown(e) {
    if (e.button !== 0) return;
    if (side.grip && e.target === side.grip) { gripDown(e); return; }
    paletteArm(e);
    attempt(() => { if (typeof mgSideDown === 'function') mgSideDown(e); });
  }
  // 보관함 칸 높이: 구분선을 끌어서. 놓을 때 한 번만 저장. 두 번 누르면 처음 높이(284px)
  function gripDown(e) {
    const g = side.grip;
    if (!g || !side.arch) return;
    e.preventDefault();
    e.stopPropagation();
    const arch = side.arch, y0 = e.clientY, h0 = arch.getBoundingClientRect().height;
    let h = h0;
    side.drag = true;
    flag(g, 'data-drag', true);
    try { g.setPointerCapture(e.pointerId); } catch (_) { /* 포인터를 못 잡아도 끌기는 된다 */ }
    const max = () => Math.max(120, Math.round(window.innerHeight * 0.75));
    const move = (ev) => { h = Math.max(50, Math.min(max(), Math.round(h0 + ev.clientY - y0))); arch.style.setProperty('--cpb-arch-h', h + 'px'); };
    const up = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      side.drag = false;
      flag(g, 'data-drag', false);
      if (Math.round(h) !== Math.round(h0)) settings.set('chatlist.archiveH', Math.round(h));
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  }
  function sideOnDbl(e) {
    if (!side.grip || e.target !== side.grip) return;
    e.preventDefault();
    settings.set('chatlist.archiveH', 284);
  }
  // 방 ⋯ 메뉴 맨 아래에 '색' 줄(점 5개). 점을 누르면 그 색, 같은 점을 다시 누르면 해제. 메뉴는 열린 채로 둔다
  function addPalette(menu, id) {
    if (!id || !clOn('on') || !clOn('color') || !menu.isConnected || menu.querySelector(':scope > .cpb-pal')) return;
    const row = document.createElement('div');
    row.className = 'cpb-pal';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '방 색 표시');
    row.innerHTML = '<span class="lb">색</span>' + CL_COLORS.map(([k, n]) => '<button type="button" class="dot" data-c="' + k + '" aria-label="' + n + '으로 표시" title="' + n + '"></button>').join('');
    const sync = () => { const c = colorMap()[id]; for (const b of row.querySelectorAll('.dot')) b.setAttribute('aria-pressed', String(b.dataset.c === c)); };
    sync();
    // 메뉴가 행 <a> 안이라 직접 막지 않으면 방으로 이동한다. Radix가 항목처럼 다루지 않게 pointerdown도 막는다
    row.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    row.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const b = e.target.closest ? e.target.closest('.dot') : null;
      if (!b) return;
      const map = Object.assign({}, colorMap());
      if (map[id] === b.dataset.c) delete map[id]; else map[id] = b.dataset.c;
      colorSave(map);
      sync();
      sideSoon();
    });
    menu.appendChild(row);
  }
  // ⋯를 눌러 연 메뉴에도 색 줄
  function paletteArm(e) {
    if (!side.root || !clOn('on') || !clOn('color')) return;
    const t = e.target && e.target.closest ? e.target.closest(SIDE_TRIG) : null;
    const a = t && t.closest(SIDE_ROW);
    if (!a || !side.root.contains(a)) return;
    const id = sideChatId(a);
    for (const ms of [60, 160]) setTimeout(() => { const m = trigMenu(t); if (m) addPalette(m, id); }, ms);
  }
  // 방 줄 우클릭 = 그 방 ⋯ 메뉴를 커서 자리에(Shift+우클릭 = 브라우저 메뉴, 이름 바꾸는 중이면 그대로)
  function sideOnCtx(e) {
    if (!side.root || !clOn('on') || !clOn('rightClick') || e.shiftKey) return;
    const a = e.target && e.target.closest ? e.target.closest(SIDE_ROW) : null;
    if (!a || !side.root.contains(a) || a.querySelector('input')) return;
    const t = a.querySelector(SIDE_TRIG);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX, y = e.clientY, id = sideChatId(a);
    (async () => {
      if (!trigOpen(t) && !triggerToggle(t)) return;
      let menu = null;
      for (let i = 0; i < 16 && !menu; i++) { await new Promise((res) => setTimeout(res, 30)); menu = trigMenu(t); }
      if (!menu) return;
      addPalette(menu, id);
      placeAt(menu, x, y);
      requestAnimationFrame(() => placeAt(menu, x, y));
      setTimeout(() => placeAt(menu, x, y), 80);
    })();
  }
  // 옛 '채팅 목록 튜너' 저장값을 한 번만 옮긴다(보관함 칸 높이, 방 색). 옛 키는 지우지 않는다
  function migrateOnce(name, fn) {
    const k = 'crack-pc-base:mig:' + name;
    try { if (localStorage.getItem(k)) return; } catch (_) { return; }
    attempt(fn);
    try { localStorage.setItem(k, '1'); } catch (_) { /* 저장 불가 */ }
  }
  migrateOnce('archH2', () => {
    const v = parseInt(localStorage.getItem('crack_archive_h'), 10);
    const saved = readJSON(SETTINGS_KEY); // 기본값(284)이 섞이지 않은 저장값으로 판단: 사용자가 이미 우리 쪽에서 정했으면 옮기지 않는다
    if (!(v > 0) || (isObj(saved) && isObj(saved.chatlist) && saved.chatlist.archiveH && saved.chatlist.archiveH !== 284)) return;
    pathSet(conf, 'chatlist.archiveH', Math.max(50, Math.min(2000, v)));
    writeJSON(SETTINGS_KEY, conf);
  });
  migrateOnce('colors', () => {
    const ok = new Set(CL_COLORS.map((c) => c[0]));
    const map = Object.assign({}, colorMap());
    let n = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^crackColor_episode_v10_episode_([0-9a-f]{24})$/);
      if (!m || map[m[1]]) continue;
      const v = localStorage.getItem(k);
      if (ok.has(v)) { map[m[1]] = v; n++; }
    }
    if (n) colorSave(map);
  });
  // ── 크랙 목록 다시 받기: 크랙 SWR 무한 목록의 bound mutate를 파이버에서 찾아 인자 없이 부른다(불러온 페이지 전부 다시 받음).
  // 찾는 법(2026-10-11 실측): 목록 컴포넌트 훅 중 data가 페이지 배열(첫 페이지 .data에 folders 또는 chats)인 SWR 상태 뒤에,
  // 소스에 '_i'·'revalidate'·'arguments'가 든 useCallback = useSWRInfinite의 mutate
  function swrInfMutate(el, field) {
    for (let f = fiberOf(el), i = 0; f && i < 16; f = f.return, i++) {
      if (typeof f.type !== 'function') continue;
      let found = false;
      for (let h = f.memoizedState, j = 0; h && typeof h === 'object' && 'next' in h && j < 60; h = h.next, j++) {
        const v = h.memoizedState;
        if (!found) { const d = v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.data) ? v.data : null; found = !!(d && d[0] && d[0].data && Array.isArray(d[0].data[field])); continue; }
        if (Array.isArray(v) && typeof v[0] === 'function') { const s = String(v[0]); if (s.includes('_i') && s.includes('revalidate') && s.includes('arguments')) return v[0]; }
      }
    }
    return null;
  }
  // 그 SWR 상태의 페이지들(보관함 수 배지용 — 요청 없이 크랙이 받아 둔 값을 읽는다)
  function swrInfPages(el, field) {
    for (let f = fiberOf(el), i = 0; f && i < 16; f = f.return, i++) {
      if (typeof f.type !== 'function') continue;
      for (let h = f.memoizedState, j = 0; h && typeof h === 'object' && 'next' in h && j < 60; h = h.next, j++) {
        const v = h.memoizedState;
        const d = v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.data) ? v.data : null;
        if (d && d[0] && d[0].data && Array.isArray(d[0].data[field])) return d;
      }
    }
    return null;
  }
  async function sideRefresh() {
    const r = side.root;
    if (!r || !r.isConnected) return;
    const list = r.querySelector('[data-testid="virtuoso-item-list"]');
    const fns = [side.arch && swrInfMutate(side.arch, 'folders'), list && swrInfMutate(list, 'chats')].filter(Boolean);
    await Promise.all(fns.map((fn) => Promise.resolve().then(() => fn()).catch(() => null)));
    sideSoon();
  }

  // ── 공용 채팅 인덱스: 모든 방 + 어느 보관함에 든 방인지. 검색·한눈에 보기·갈래 지도가 같이 쓴다.
  // 처음 쓸 때만 받는다(보관함 목록 → 방 전체 /v3/chats 40개씩 → 보관함마다 /v3/chats?folderId). 요청 사이 120ms.
  // 10분 동안 다시 쓰고(새로고침 뒤에도: localStorage에 줄여서 저장), 크랙이 받는 목록 응답·옮기기·이름 바꾸기·삭제를 엿들어 조금씩 고친다
  const CI_KEY = 'crack-pc-base:chatindex';
  const chatIndex = (() => {
    let data = null, status = 'idle', prog = { done: 0, total: 0 }, inflight = null, saveT = 0;
    const slim = (c) => ({
      _id: c._id, title: c.title || '', lastMessage: String(c.lastMessage || '').slice(0, 120), messagedAt: c.messagedAt || null, createdAt: c.createdAt || null,
      pinnedAt: c.pinnedAt || null, isCreatedFromBranch: !!c.isCreatedFromBranch,
      story: c.story ? { _id: c.story._id, name: c.story.name || '', profileImage: c.story.profileImage ? { w200: c.story.profileImage.w200 || c.story.profileImage.origin || '' } : null, portraitImage: c.story.portraitImage ? { w200: c.story.portraitImage.w200 || c.story.portraitImage.origin || '' } : null } : null,
    });
    const build = (chats, folders, folderOf, at) => {
      const byId = new Map(), fo = new Map();
      for (const c of chats) { c.folderId = folderOf[c._id] || null; byId.set(c._id, c); fo.set(c._id, c.folderId); }
      return { chats, folders, byId, folderOf: fo, at };
    };
    const raw = readJSON(CI_KEY);
    if (isObj(raw) && Array.isArray(raw.chats)) data = build(raw.chats, Array.isArray(raw.folders) ? raw.folders : [], isObj(raw.folderOf) ? raw.folderOf : {}, raw.at || 0);
    function persist() {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        if (!data) return;
        const folderOf = {};
        for (const [k, v] of data.folderOf) if (v) folderOf[k] = v;
        try { localStorage.setItem(CI_KEY, JSON.stringify({ chats: data.chats, folders: data.folders, folderOf, at: data.at })); } catch (_) { /* 저장 공간이 모자라면 이번 탭에서만 쓴다 */ }
      }, 800);
    }
    const changed = () => { persist(); emit('chatindex', data); };
    async function pages(path, field) {
      const out = [];
      let cur = '';
      for (let i = 0; i < 300; i++) {
        const r = await crackFetch('GET', path + (path.includes('?') ? '&' : '?') + (cur ? 'cursor=' + encodeURIComponent(cur) + '&' : '') + 'limit=40');
        const d = r.json && r.json.data;
        if (!r.ok || !d || !Array.isArray(d[field])) throw new Error('목록 요청 실패 ' + r.status);
        out.push(...d[field]);
        prog.done++;
        emit('chatindex:progress', { done: prog.done, total: prog.total });
        if (!d.nextCursor || d.nextCursor === cur) break;
        cur = d.nextCursor;
        await new Promise((res) => setTimeout(res, 120));
      }
      return out;
    }
    async function fetchAll() {
      status = 'loading';
      prog = { done: 0, total: 1 };
      const folders = await pages('/crack-gen/chat-folders', 'folders');
      const inFolders = folders.reduce((a, f) => a + Math.ceil((f.chatCount || 0) / 40), 0);
      prog.total = 1 + inFolders + 3; // 방 전체 쪽 수는 받기 전엔 모른다(대충 잡고 받으면서 고친다)
      const all = (await pages('/crack-gen/v3/chats', 'chats')).map(slim);
      prog.total = prog.done + inFolders;
      const folderOf = {};
      for (const f of folders) {
        if (!(f.chatCount > 0)) continue;
        for (const c of await pages('/crack-gen/v3/chats?folderId=' + encodeURIComponent(f._id), 'chats')) folderOf[c._id] = f._id;
        await new Promise((res) => setTimeout(res, 120));
      }
      data = build(all, folders.map((f) => ({ _id: f._id, name: f.name, pinnedAt: f.pinnedAt || null, chatCount: f.chatCount || 0, thumbnailImageUrls: f.thumbnailImageUrls || [], createdAt: f.createdAt || null })), folderOf, Date.now());
      status = 'ready';
      changed();
      return data;
    }
    return {
      get: () => data,
      status: () => status,
      progress: () => ({ done: prog.done, total: prog.total }),
      load(o) {
        const force = !!(o && o.force);
        // 하루 동안 다시 받지 않는다(그 사이는 크랙 자신의 응답·옮기기·이름 바꾸기·삭제를 엿들어 고친다). 새로 받기는 '새로 불러오기' 버튼(force)만
        if (!force && data && Date.now() - data.at < 24 * 3600000) { status = 'ready'; return Promise.resolve(data); }
        if (inflight) return inflight;
        inflight = fetchAll().catch((e) => { status = 'error'; warn(e); return data; }).finally(() => { inflight = null; });
        return inflight;
      },
      patch(p) {
        if (!data || !p) return;
        if (p.moved && Array.isArray(p.moved.chatIds)) {
          for (const id of p.moved.chatIds) { const c = data.byId.get(id); if (c) c.folderId = p.moved.folderId || null; data.folderOf.set(id, p.moved.folderId || null); }
          const cnt = {};
          for (const [, fid] of data.folderOf) if (fid) cnt[fid] = (cnt[fid] || 0) + 1;
          for (const f of data.folders) f.chatCount = cnt[f._id] || 0;
        }
        if (p.renamed && p.renamed.chatId) { const c = data.byId.get(p.renamed.chatId); if (c) c.title = String(p.renamed.title || ''); }
        if (Array.isArray(p.removed) && p.removed.length) {
          const rm = new Set(p.removed);
          data.chats = data.chats.filter((c) => !rm.has(c._id));
          for (const id of rm) { data.byId.delete(id); data.folderOf.delete(id); }
        }
        if (p.added && p.added._id && !data.byId.has(p.added._id)) { const c = slim(p.added); c.folderId = null; data.chats.unshift(c); data.byId.set(c._id, c); data.folderOf.set(c._id, null); }
        if (p.pinned && p.pinned.chatId) { const c = data.byId.get(p.pinned.chatId); if (c) c.pinnedAt = p.pinned.on ? new Date().toISOString() : null; }
        changed();
      },
      // 크랙이 받은 목록 한 쪽: 방 정보 갱신 + (folderId가 붙은 요청이면) 보관함 소속 갱신
      seen(chats, folderId) {
        if (!data || !Array.isArray(chats)) return;
        let n = 0;
        for (const c of chats) {
          const cur = data.byId.get(c._id);
          const s = slim(c);
          if (cur) { Object.assign(cur, s, { folderId: folderId === undefined ? cur.folderId : folderId }); }
          else { s.folderId = folderId === undefined ? null : folderId; data.chats.unshift(s); data.byId.set(s._id, s); }
          if (folderId !== undefined) data.folderOf.set(c._id, folderId);
          n++;
        }
        if (n) changed();
      },
      // 쓰는 기능이 모두 꺼져 엿듣기를 멈출 때: 그동안 못 고친 것이 있을 수 있으니 다음 load()에서 새로 받게 한다
      stale() { if (data && data.at) { data.at = 0; persist(); } },
      seenFolders(folders) {
        if (!data || !Array.isArray(folders) || !folders.length) return;
        const m = new Map(data.folders.map((f) => [f._id, f]));
        for (const f of folders) m.set(f._id, Object.assign(m.get(f._id) || {}, { _id: f._id, name: f.name, pinnedAt: f.pinnedAt || null, chatCount: f.chatCount || 0, thumbnailImageUrls: f.thumbnailImageUrls || [], createdAt: f.createdAt || null }));
        data.folders = [...m.values()];
        changed();
      },
    };
  })();
  // 크랙 자신의 요청을 엿들어 인덱스를 고친다(추가 요청 없음). 목록 응답은 자주 오니 인덱스를 쓰는 기능이 하나라도 켜져 있을 때만 읽는다
  // (옮기기·삭제·이름·고정은 드물어서 늘 듣는다)
  const ciWanted = () => (clOn('on') && (clOn('search') || clOn('overview') || clOn('countRoot') || clOn('smart'))) || brOn('on');
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\?/, on: ciWanted, fn: (m, url, st, j) => {
    if (m !== 'GET' || st !== 200 || !j || !j.data || !Array.isArray(j.data.chats)) return;
    const q = new URL(url, location.href).searchParams;
    const fid = q.has('folderId') ? (q.get('folderId') === 'null' ? null : q.get('folderId')) : undefined;
    chatIndex.seen(j.data.chats, fid);
  } });
  xhrWatch.push({ test: /\/crack-gen\/chat-folders\?/, on: ciWanted, fn: (m, url, st, j) => { if (m === 'GET' && st === 200 && j && j.data && Array.isArray(j.data.folders) && !/[?&]limit=1(&|$)/.test(url)) chatIndex.seenFolders(j.data.folders); } });
  on('settings', () => { if (!ciWanted()) chatIndex.stale(); });
  xhrWatch.push({ test: /\/crack-gen\/chat-folders\/chats\/move(?:\?|$)/, fn: (m, url, st, j, b) => { if (st >= 200 && st < 300 && b && Array.isArray(b.chatIds)) chatIndex.patch({ moved: { chatIds: b.chatIds, folderId: b.targetFolderId || null } }); } });
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/delete(?:\?|$)/, fn: (m, url, st, j, b) => { if (st >= 200 && st < 300 && b && Array.isArray(b.chatIds)) { chatIndex.patch({ removed: b.chatIds }); brForget(b.chatIds); } } });
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/[^/?#]+(?:\/(pin|unpin))?(?:\?|$)/, fn: (m, url, st, j, b) => {
    if (m !== 'PATCH' || st < 200 || st >= 300) return;
    const mm = url.match(/\/v3\/chats\/([^/?#]+)(?:\/(pin|unpin))?/);
    if (!mm) return;
    if (mm[2]) chatIndex.patch({ pinned: { chatId: mm[1], on: mm[2] === 'pin' } });
    else if (b && typeof b.title === 'string') { chatIndex.patch({ renamed: { chatId: mm[1], title: b.title } }); brRename(mm[1], b.title); }
  } });

  // ── 분기 기록(갈래 지도 데이터): 크랙에서 분기하는 순간 응답을 엿들어 바로 적는다(방 메시지를 훑을 필요 없음)
  // 저장: localStorage 'crack-pc-base:branch:v1' = {rooms:{id:{id,title,storyId,storyName,isBranch,missing?,updatedAt}}, branches:{childId:{childId,parentId,messageId,turn,tail,src,at}}, updatedAt}
  const BR_KEY = 'crack-pc-base:branch:v1';
  const brOn = (k) => !(isObj(conf.branch) && conf.branch[k] === false);
  function brRead() { const s = readJSON(BR_KEY); return isObj(s) && isObj(s.rooms) && isObj(s.branches) ? s : { rooms: {}, branches: {}, updatedAt: 0 }; }
  function brWrite(s) { s.updatedAt = Date.now(); writeJSON(BR_KEY, s); emit('branch', s); sideSoon(); }
  function brForget(ids) { const s = brRead(); let n = 0; for (const id of ids) { if (s.branches[id]) { delete s.branches[id]; n++; } if (s.rooms[id]) { s.rooms[id].missing = true; n++; } } if (n) brWrite(s); }
  function brRename(id, title) { const s = brRead(); if (s.rooms[id] && s.rooms[id].title !== title) { s.rooms[id].title = title; brWrite(s); } }
  const plainTail = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>~|]/g, '').replace(/\s+/g, ' ').trim().slice(-300);
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/[^/?#]+\/branch(?:\?|$)/, fn: (m, url, st, j, b) => {
    if (m !== 'POST' || st < 200 || st >= 300 || !brOn('on') || !brOn('live') || !j || !j.data || !j.data._id) return;
    const parentId = (url.match(/\/v3\/chats\/([^/?#]+)\/branch/) || [])[1];
    const child = j.data, messageId = b && b.messageId ? String(b.messageId) : '';
    // 장면 한 줄·턴: 크랙이 새 방으로 옮기기 전에, 지금 불러와 있는 메시지에서 읽는다(요청 없음)
    let tail = '', turn = null;
    attempt(() => {
      const st2 = chatCtx() && chatCtx().store ? chatCtx().store.getState() : null;
      const msg = st2 && messageId ? st2.messages.get(messageId) : null;
      if (msg) tail = plainTail(msg.content);
      const total = (readJSON('crack-pc-base:turns') || {})[parentId];
      if (st2 && total && typeof total.n === 'number') {
        // 기준 메시지보다 뒤(더 최근)에 있는 사용자 메시지 수를 빼면 갈라진 턴
        const ids = [...st2.messages.keys()];
        const at = ids.indexOf(messageId);
        if (at >= 0) turn = Math.max(0, total.n - ids.slice(at + 1).filter((k) => (st2.messages.get(k) || {}).role === 'user').length);
      }
    });
    const s = brRead();
    const parent = chatIndex.get() && chatIndex.get().byId.get(parentId);
    s.rooms[parentId] = Object.assign(s.rooms[parentId] || {}, { id: parentId, title: (parent && parent.title) || (s.rooms[parentId] || {}).title || '', storyId: child.story && child.story._id, storyName: child.story && child.story.name, updatedAt: Date.now() });
    s.rooms[child._id] = { id: child._id, title: child.title || (b && b.title) || '', storyId: child.story && child.story._id, storyName: child.story && child.story.name, isBranch: true, updatedAt: Date.now() };
    s.branches[child._id] = { childId: child._id, parentId, messageId, turn, tail, src: 'live', at: Date.now() };
    brWrite(s);
    chatIndex.patch({ added: child });
  } });
  // 원본 방 깃발(사이드바 행): 분기가 있는 원본 방 제목 뒤에 깃발 + 분기 수
  const BR_FLAG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';
  function brCounts() {
    const s = brRead(), n = {};
    for (const k of Object.keys(s.branches)) { const p = s.branches[k].parentId; if (p) n[p] = (n[p] || 0) + 1; }
    return n;
  }
  // 도착 알림: 갈래 지도에서 방을 눌러 옮겨 왔으면 한 번(15초 안)
  function brArrive() {
    let v = null;
    try { v = JSON.parse(sessionStorage.getItem('crack-pc-base:branch:arrive') || 'null'); } catch (_) { v = null; }
    if (!v) return;
    try { sessionStorage.removeItem('crack-pc-base:branch:arrive'); } catch (_) { /* 무시 */ }
    if (brOn('arrive') && Date.now() - (v.at || 0) < 15000 && v.title) toast("'" + v.title + "'(으)로 이동했어요", { key: 'br-arrive' });
  }

  const CL_DOT = (k, dark, light) => 'a[data-cpb-color="' + k + '"],.cpb-pal .dot[data-c="' + k + '"]{--cpb-c:' + dark + '}body[data-theme=light] :is(a[data-cpb-color="' + k + '"],.cpb-pal .dot[data-c="' + k + '"]){--cpb-c:' + light + '}';
  const CHATLIST_CSS = `
/* 보관함 칸 높이: 크랙 max-h-[284px] overflow-hidden 대신 우리 높이 + 칸 안 스크롤 */
[data-cpb-arch]{max-height:var(--cpb-arch-h,284px)!important;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-width:thin}
[data-cpb-grip]{position:relative;cursor:row-resize;transition:background-color .15s}
[data-cpb-grip]::after{content:"";position:absolute;left:0;right:0;top:-5px;bottom:-5px}
[data-cpb-grip]:hover,[data-cpb-grip][data-drag]{background-color:var(--text_tertiary,#85837d)}
/* 지금 방: 옅은 배경 + 굵은 제목(크랙 행에는 현재 방 표시가 없다) */
a[data-cpb-cur]{background:var(--state_hover,rgba(128,128,128,.12))}
a[data-cpb-cur] .text-popover-foreground{font-weight:700}
/* 방 색: 옅은 배경 + 아바타 고리 */
a[data-cpb-color]{background:color-mix(in srgb,var(--cpb-c) 12%,transparent)}
a[data-cpb-color]:hover{background:color-mix(in srgb,var(--cpb-c) 20%,transparent)}
a[data-cpb-color][data-cpb-cur]{background:color-mix(in srgb,var(--cpb-c) 24%,transparent)}
a[data-cpb-color]>span.rounded-full:first-child{outline:2px solid var(--cpb-c);outline-offset:2px}
${CL_DOT('rose', '#d87791', '#c85f7b')}
${CL_DOT('gold', '#c9ab55', '#aa852c')}
${CL_DOT('emerald', '#65b984', '#459b68')}
${CL_DOT('teal', '#67b9c0', '#3f929c')}
${CL_DOT('violet', '#b188c7', '#8f67a4')}
/* 머리줄 개수 배지(보관함 N개 · 채팅 목록 N개) */
[data-cpb-cnt]>span:first-child{flex:0 1 auto}
.cpb-count{margin:0 auto 0 4px;font-size:12px;color:var(--text_tertiary,#85837d);font-variant-numeric:tabular-nums;white-space:nowrap}
/* 원본 방 깃발 + 분기 수 */
.cpb-br-flag{display:inline-flex;align-items:center;gap:2px;flex:none;margin-left:2px;font-size:11px;line-height:1;color:var(--text_tertiary,#85837d)}
.cpb-br-flag svg{width:11px;height:11px}
.cpb-br-flag b{font-weight:600;font-variant-numeric:tabular-nums}
.cpb-br-flag[data-cur]{color:var(--surface_brand_primary,#ff4432)}
/* 방 ⋯ 메뉴 맨 아래 '색' 줄 */
.cpb-pal{display:flex;align-items:center;gap:9px;margin-top:4px;padding:8px 8px 4px;border-top:1px solid var(--outline_tertiary,rgba(128,128,128,.22))}
.cpb-pal .lb{margin-right:2px;font-size:12px;color:var(--text_tertiary,#85837d)}
.cpb-pal .dot{width:16px;height:16px;padding:0;border:0;border-radius:50%;background:var(--cpb-c);cursor:pointer;transition:transform .15s cubic-bezier(.34,1.5,.64,1)}
.cpb-pal .dot:hover{transform:scale(1.18)}
.cpb-pal .dot[aria-pressed="true"]{outline:2px solid var(--text_primary,#ededee);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.cpb-pal .dot,[data-cpb-grip]{transition:none}}
`;
  // 알림(토스트): 위 가운데. 기본은 어두운 알약, 밝은 테마에서는 흰 알약(어느 화면에서나 쓰므로 사이트 전역)
  const TOAST_CSS = `
body{--cpbg-glass:rgba(32,32,36,.66);--cpbg-line:rgba(255,255,255,.1);--cpbg-hi:rgba(255,255,255,.12);--cpbg-tx:#edece9;--cpbg-tx2:#a9a8a3;--cpbg-tx3:#73726e;--cpbg-sel:rgba(255,255,255,.075);--cpbg-line2:rgba(255,255,255,.11);
  --cpbg-brand:#ff5848;--cpbg-ok:#3ddc84;--cpbg-warn:#f0b43c;--cpbg-bad:#ff6767;--cpbg-ease:cubic-bezier(.23,1,.32,1);--cpbg-spring:linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1);--cpbg-blur:blur(20px) saturate(170%)}
body[data-theme=light]{--cpbg-glass:rgba(255,255,255,.72);--cpbg-line:rgba(0,0,0,.08);--cpbg-hi:rgba(255,255,255,.95);--cpbg-tx:#1b1a19;--cpbg-tx2:#5f5e59;--cpbg-tx3:#94928c;--cpbg-sel:rgba(0,0,0,.06);--cpbg-line2:rgba(0,0,0,.12);
  --cpbg-brand:#ff4432;--cpbg-ok:#1da851;--cpbg-warn:#d49500;--cpbg-bad:#e03535}
#cpb-toasts{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:95;width:min(420px,calc(100vw - 32px));height:56px;pointer-events:none;transition:height .3s var(--cpbg-ease)}
#cpb-toasts .cpb-toast{position:absolute;left:50%;top:0;display:flex;align-items:center;gap:10px;max-width:100%;min-height:40px;padding:0 6px 0 13px;border-radius:999px;white-space:nowrap;overflow:hidden;pointer-events:auto;box-sizing:border-box;
  color:var(--cpbg-tx);background:var(--cpbg-glass);-webkit-backdrop-filter:var(--cpbg-blur);backdrop-filter:var(--cpbg-blur);
  box-shadow:0 0 0 1px var(--cpbg-line),inset 0 1px 0 var(--cpbg-hi),0 10px 30px rgba(0,0,0,.16);
  transform:translate(-50%,var(--y,0px)) scale(var(--s,1));opacity:var(--o,1);transform-origin:50% 0;
  transition:transform .45s var(--cpbg-spring),opacity .3s var(--cpbg-ease);animation:cpbTIn .5s var(--cpbg-spring)}
#cpb-toasts .cpb-toast.plain{padding-right:16px}
#cpb-toasts .cpb-toast.tap{cursor:pointer}
@keyframes cpbTIn{from{opacity:0;transform:translate(-50%,-14px) scale(.94);filter:blur(4px)}}
#cpb-toasts .cpb-toast.out{opacity:0!important;transform:translate(-50%,calc(var(--y,0px) - 10px)) scale(.96)!important;transition:transform .25s var(--cpbg-ease),opacity .2s;pointer-events:none}
#cpb-toasts .tx{font-size:13px;line-height:18px;font-weight:500;overflow:hidden;text-overflow:ellipsis}
#cpb-toasts .tx.swap{animation:cpbTxSwap .3s var(--cpbg-ease)}
@keyframes cpbTxSwap{from{opacity:0;transform:translateY(4px)}}
#cpb-toasts .act{flex-shrink:0;border:0;padding:5px 11px;border-radius:999px;background:color-mix(in srgb,var(--cpbg-tx) 9%,transparent);color:inherit;font:inherit;font-size:12px;font-weight:600;margin-left:2px;cursor:pointer;transition:background .15s,transform .16s var(--cpbg-ease)}
#cpb-toasts .act:hover{background:color-mix(in srgb,var(--cpbg-tx) 15%,transparent)}
#cpb-toasts .act:active{transform:scale(.95)}
#cpb-toasts .bar{position:absolute;left:14px;right:14px;bottom:3px;height:1.5px;border-radius:2px;background:color-mix(in srgb,var(--cpbg-tx) 18%,transparent);transform-origin:left;animation:cpbTBar linear forwards}
#cpb-toasts:hover .bar,#cpb-toasts:hover .ring{animation-play-state:paused}
@keyframes cpbTBar{to{transform:scaleX(0)}}
#cpb-toasts .ti{flex-shrink:0;width:18px;height:18px;display:grid;place-items:center;color:var(--cpbg-tx2)}
#cpb-toasts .ti svg{display:block;width:18px;height:18px;overflow:visible;fill:none}
#cpb-toasts .t-ok .ti{color:var(--cpbg-ok)}#cpb-toasts .t-err .ti{color:var(--cpbg-bad)}#cpb-toasts .t-stamp .ti{color:var(--cpbg-ok)}
#cpb-toasts .ti .draw{stroke-dasharray:1;stroke-dashoffset:1;animation:cpbTDraw .45s var(--cpbg-ease) .15s forwards}
@keyframes cpbTDraw{to{stroke-dashoffset:0}}
#cpb-toasts .t-err .ti svg{animation:cpbTShake .4s ease-in-out .1s}
@keyframes cpbTShake{0%,100%{transform:none}25%{transform:translateX(-2px)}50%{transform:translateX(2px)}75%{transform:translateX(-1px)}}
#cpb-toasts .ti .spin{transform-origin:12px 12px;animation:cpbSpin .8s linear infinite}
#cpb-toasts .ti .spin1{transform-origin:12px 12px;animation:cpbSpin .7s var(--cpbg-ease) .1s}
@keyframes cpbSpin{to{transform:rotate(360deg)}}
#cpb-toasts .ti .bell{transform-origin:12px 4px;animation:cpbTRing .6s ease-in-out .1s}
@keyframes cpbTRing{0%,100%{transform:none}20%{transform:rotate(-14deg)}45%{transform:rotate(12deg)}70%{transform:rotate(-6deg)}}
#cpb-toasts .ti .ring{stroke-dasharray:1;stroke-dashoffset:0;transform:rotate(-90deg);transform-origin:12px 12px;animation:cpbTCount linear forwards}
@keyframes cpbTCount{to{stroke-dashoffset:1}}
#cpb-toasts .ti .k1{animation:cpbTK1 .6s var(--cpbg-spring) .1s}#cpb-toasts .ti .k2{animation:cpbTK2 .6s var(--cpbg-spring) .16s}
@keyframes cpbTK1{from{transform:translateX(-4px)}}@keyframes cpbTK2{from{transform:translateX(4px)}}
#cpb-toasts .stamp .pg{transform-origin:12px 10px;animation:cpbTFlip .45s var(--cpbg-ease)}
@keyframes cpbTFlip{40%{transform:scaleY(.2)}}
#cpb-toasts .mini{position:relative;width:22px;height:13px;border-radius:99px;background:var(--cpbg-line2);transition:background .3s}
#cpb-toasts .mini::after{content:"";position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#fff;transition:transform .4s var(--cpbg-spring)}
#cpb-toasts .mini.on{background:var(--cpbg-brand)}
#cpb-toasts .mini.on::after{transform:translateX(9px)}
@media (prefers-reduced-motion: reduce){#cpb-toasts .cpb-toast,#cpb-toasts .cpb-toast *{animation-duration:.01ms!important;transition-duration:.01ms!important}#cpb-toasts .bar{display:none}}
`;
  const CHATLIST_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M8 4v16"/><path d="M11 9h6M11 12.5h6M11 16h4"/></svg>';

  // ===== cl-overview.js =====
  // ── 채팅 목록: 검색 줄 · 한눈에 보기 · 여러 방 옮기기 ──────────────
  // 검색 줄: 사이드바 virtuoso Header 안, 보관함 칸(크랙이 284px로 자르는 칸) 바로 위에 우리 줄 하나. 보관함 칸 안에는 넣지 않는다.
  //   결과는 body에 붙인 칸(사이드바 폭, 검색 줄 아래부터 사이드바 끝까지). 보관함 묶음 → 채팅 목록 순.
  //   ↑↓ 고르기 · Enter 이동 · Esc 지우기. 한글 조합 중에는 입력칸 값을 절대 건드리지 않는다(읽기만).
  // 한눈에 보기: 화면 가운데 넓은 창(왼쪽 보관함 줄, 위 검색 · 색 거르기 · 카드/촘촘히, 묶음별 카드). 우클릭 = 색 표시.
  //   '선택'을 켜면 여러 방을 골라 보관함으로 옮기기 / 채팅 목록으로 빼기 / 새 보관함 만들기(크랙 API, 확인 뒤 순서대로).
  // 데이터는 공용 chatIndex(검색 줄을 누르거나 창을 열 때만 불러온다). 열린 동안 폴링 없음: 'chatindex' 이벤트로만 다시 그린다.
  // 방 이동은 goto(라우터, 새로고침 없음). 크랙 단축키가 우리 입력의 키를 받지 않게 전파만 멈춘다(가짜 키 이벤트는 만들지 않음).
  const ovSvg = (body, size, sw) => '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  const ovFolderPath = '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
  const ovIco = {
    search: ovSvg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 15),
    x: ovSvg('<path d="M18 6 6 18M6 6l12 12"/>', 13),
    back: ovSvg('<path d="M14.5 6 8.5 12l6 6"/>', 17),
    dots: ovSvg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', 16),
    grid: ovSvg('<rect class="g1" x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect class="g2" x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect class="g3" x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect class="g4" x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>', 16),
    all: ovSvg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>', 15),
    chat: ovSvg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20 12z"/>', 15),
    folder: ovSvg(ovFolderPath, 15),
    into: ovSvg(ovFolderPath + '<path d="M12 10v6M9.5 13.5 12 16l2.5-2.5"/>', 15),
    out: ovSvg(ovFolderPath + '<path d="M12 16v-6M9.5 12.5 12 10l2.5 2.5"/>', 15),
    plus: ovSvg('<path d="M12 5v14M5 12h14"/>', 15),
    select: ovSvg('<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m7.5 12 3 3 6-6"/>', 18),
    reload: ovSvg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>', 17),
    none: ovSvg('<circle cx="12" cy="12" r="8"/><path d="m6.5 17.5 11-11"/>', 16),
    check: '<svg class="ck" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="m7.6 12.3 3 3 5.8-6.3"/></svg>',
  };
  const ovK = { limit: 200, group: 48, chunk: 100, gap: 150 }; // 검색 결과 최대 · '전체'에서 묶음마다 처음 보여 줄 수 · 요청 하나에 옮길 방 수 · 요청 사이 간격(ms)
  // 방 색(사이드바 CL_DOT과 같은 값). [어두운 테마, 밝은 테마]
  const ovCVal = { rose: ['#d87791', '#c85f7b'], gold: ['#c9ab55', '#aa852c'], emerald: ['#65b984', '#459b68'], teal: ['#67b9c0', '#3f929c'], violet: ['#b188c7', '#8f67a4'] };
  const ovView = () => (isObj(conf.chatlist) && conf.chatlist.view === 'dense' ? 'dense' : 'grid');
  const ovNorm = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const ovTerms = (q) => { const n = ovNorm(q); return n ? n.split(' ') : []; };
  const ovClean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
  const ovFirst = (s) => Array.from(String(s || '').trim())[0] || '?';
  const ovCurId = () => { const m = location.pathname.match(/\/episodes\/([^/?#]+)/); return m ? m[1] : ''; };
  const ovHref = (c) => (c && c.story && c.story._id ? '/stories/' + c.story._id + '/episodes/' + c._id : '');
  const ovTitle = (c) => ovClean((c && c.title) || (c && c.story && c.story.name) || '') || '제목 없음';
  const ovStory = (c) => ovClean(c && c.story && c.story.name);
  const ovAt = (c) => { const t = Date.parse((c && (c.messagedAt || c.createdAt)) || ''); return isFinite(t) ? t : 0; };
  const ovSleep = (ms) => new Promise((res) => setTimeout(res, ms));
  function ovImg(c) {
    const s = c && c.story;
    if (!s) return '';
    const p = isObj(s.portraitImage) ? s.portraitImage : {}, f = isObj(s.profileImage) ? s.profileImage : {};
    return String(p.w200 || f.w200 || p.origin || f.origin || '');
  }
  // 오늘 / 어제 / N일 전(7일 안) / M월 D일(올해가 아니면 연도 붙임)
  function ovDate(t) {
    if (!t) return '';
    const d = new Date(t), now = new Date();
    const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t >= day0) return '오늘';
    if (t >= day0 - 864e5) return '어제';
    const days = Math.floor((day0 - t) / 864e5) + 1;
    if (days < 7) return days + '일 전';
    return (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  // ── 인덱스 읽기(공용 chatIndex) ──
  let ovRev = 0;          // 'chatindex' 이벤트마다 +1 (patch가 같은 객체를 고쳐도 다시 계산하게)
  let ovPrepC = null;     // {idx, rev, data}
  const ovExtra = new Map(); // 우리가 방금 만든 보관함(인덱스를 다시 받기 전까지 이름 표시용) id → Folder
  const ovIdxStatus = () => attempt(() => chatIndex.status()) || 'idle';
  function ovIdxProg() {
    const p = attempt(() => chatIndex.progress());
    return p && p.total > 0 ? ' ' + Math.min(p.done || 0, p.total) + '/' + p.total : '';
  }
  // 검색·묶음용으로 한 번만 정리해 둔다: 최근 순 목록, 정규화한 '제목 작품이름', 방 → 보관함, 보관함별 목록, 보관함(가나다 순)
  function ovPrep() {
    const idx = attempt(() => chatIndex.get());
    if (!idx || !Array.isArray(idx.chats)) return null;
    if (ovPrepC && ovPrepC.idx === idx && ovPrepC.rev === ovRev) return ovPrepC.data;
    const folderOf = idx.folderOf instanceof Map ? idx.folderOf : null;
    const chats = idx.chats.filter((c) => c && c._id && c.story && c.story._id).sort((a, b) => ovAt(b) - ovAt(a));
    const folders = new Map();
    for (const f of Array.isArray(idx.folders) ? idx.folders : []) if (f && f._id) folders.set(f._id, f);
    for (const [id, f] of Array.from(ovExtra)) { if (folders.has(id)) ovExtra.delete(id); else folders.set(id, f); }
    const hay = new Map(), fo = new Map(), by = new Map([['', []]]);
    for (const c of chats) {
      const v = folderOf && folderOf.has(c._id) ? folderOf.get(c._id) : c.folderId;
      const k = v ? String(v) : '';
      fo.set(c._id, k);
      hay.set(c._id, ovNorm(ovTitle(c) + ' ' + ovStory(c)));
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(c);
    }
    const flist = Array.from(folders.values()).map((f) => ({ id: f._id, name: ovClean(f.name) || '보관함', count: (by.get(f._id) || []).length }));
    for (const k of by.keys()) if (k && !folders.has(k)) flist.push({ id: k, name: '보관함', count: by.get(k).length });
    flist.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const data = { chats, hay, fo, by, folders: flist, fname: new Map(flist.map((f) => [f.id, f.name])) };
    ovPrepC = { idx, rev: ovRev, data };
    return data;
  }
  function ovMatch(d, c, terms) {
    if (!terms.length) return true;
    const h = d.hay.get(c._id) || '';
    for (const t of terms) if (h.indexOf(t) < 0) return false;
    return true;
  }
  // 사용자가 누르거나 열 때만 부른다. 새로 받을 필요가 없으면 chatIndex가 저장된 것을 그대로 돌려준다
  function ovLoad(force) {
    const p = attempt(() => chatIndex.load({ force: !!force }));
    if (p && typeof p.then === 'function') p.then(() => ovSoon(), () => ovSoon());
    ovTickArm();
    ovSoon();
  }
  // 진행 표시: 불러오는 중이고 우리 칸이 열려 있을 때만 0.25초마다 글자만 바꾼다(그 밖에는 타이머 없음)
  let ovTickT = 0;
  function ovTickArm() { if (!ovTickT && (ovD.open || ovS.open)) ovTickT = setTimeout(ovTick, 250); }
  function ovTick() {
    ovTickT = 0;
    if (ovD.open) ovDropStatus();
    if (ovS.open) ovWinStatus();
    if (ovIdxStatus() === 'loading') ovTickArm();
  }
  let ovSoonR = 0;
  function ovSoon() {
    if (ovSoonR) return;
    ovSoonR = requestAnimationFrame(() => {
      ovSoonR = 0;
      if (ovD.open) ovDropRender();
      if (ovS.open) ovRender();
    });
  }

  // ── 검색 줄(사이드바) ──
  const ovL = { el: null, box: null, input: null, clr: null, grid: null, arch: null, comp: false, focused: false, t: 0 };
  function ovLineBuild() {
    const el = document.createElement('div');
    el.className = 'cpb-ov-line';
    el.innerHTML = '<div class="box"><span class="ic">' + ovIco.search + '</span>'
      + '<input type="text" autocomplete="off" spellcheck="false" placeholder="채팅방 제목 검색" aria-label="채팅방 검색" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cpb-ov-res">'
      + '<button type="button" class="clr" tabindex="-1" aria-label="검색어 지우기" title="지우기">' + ovIco.x + '</button></div>'
      + '<button type="button" class="grid" aria-label="한눈에 보기" title="한눈에 보기" aria-haspopup="dialog" aria-expanded="false">' + ovIco.grid + '</button>';
    ovL.el = el;
    ovL.box = el.querySelector('.box');
    ovL.input = el.querySelector('input');
    ovL.clr = el.querySelector('.clr');
    ovL.grid = el.querySelector('.grid');
    const inp = ovL.input;
    // 크랙 단축키(document)가 우리 입력칸의 키를 받지 않게 전파만 멈춘다. 크랙 행 클릭 처리로도 번지지 않게
    for (const type of ['keydown', 'keyup', 'keypress', 'click']) el.addEventListener(type, (e) => e.stopPropagation());
    inp.addEventListener('focus', () => {
      ovL.focused = true;
      ovLoad(false);
      if (ovNorm(inp.value)) { ovDropOpen(); ovDropRender(); }
    });
    inp.addEventListener('blur', () => { ovL.focused = false; });
    inp.addEventListener('compositionstart', () => { ovL.comp = true; });
    inp.addEventListener('compositionend', () => { ovL.comp = false; ovLineClr(); ovLineQuery(0); });
    // 조합 중에는 값을 읽기만 하고(쓰지 않음) 조금 느긋하게 찾는다. 조합이 끝나면 바로
    inp.addEventListener('input', () => { ovLineClr(); ovLineQuery(ovL.comp ? 120 : 30); });
    inp.addEventListener('keydown', ovLineKey);
    ovL.clr.addEventListener('mousedown', (e) => e.preventDefault()); // 조합 중 지우기를 눌러도 포커스가 빠지지 않게
    ovL.clr.addEventListener('click', ovLineClear);
    ovL.grid.addEventListener('click', (e) => { e.preventDefault(); if (ovS.open) ovClose(); else ovOpen(ovL.grid); });
  }
  function ovLineClr() { if (ovL.clr) flag(ovL.clr, 'data-on', !!(ovL.input && ovL.input.value.trim())); }
  function ovLineRun() {
    clearTimeout(ovL.t);
    ovL.t = 0;
    if (!ovL.input || !clOn('search')) return;
    if (!ovNorm(ovL.input.value)) { ovDropClose(); return; }
    ovLoad(false);
    ovDropOpen();
    ovDropRender();
  }
  function ovLineQuery(delay) {
    clearTimeout(ovL.t);
    ovL.t = setTimeout(ovLineRun, delay);
  }
  function ovLineClear() {
    clearTimeout(ovL.t);
    ovL.comp = false;
    ovL.input.value = '';
    ovLineClr();
    ovDropClose();
    ovL.input.focus({ preventScroll: true });
    // 뒤늦게 되돌아온 조합 글자를 한 번 더 정리한다
    requestAnimationFrame(() => { if (ovL.input.value && !ovL.comp && !ovL.t && !ovD.open) { ovL.input.value = ''; ovLineClr(); } });
  }
  function ovLineKey(e) {
    if (e.isComposing || ovL.comp || e.keyCode === 229) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      if (ovL.t) ovLineRun();
      if (!ovD.open && ovNorm(ovL.input.value)) { ovDropOpen(); ovDropRender(); }
      if (ovD.open) { e.preventDefault(); ovDropMove(k === 'ArrowDown' ? 1 : -1); }
    } else if (k === 'Enter') {
      if (ovL.t) ovLineRun();
      if (!ovD.open) return;
      const o = ovDropOpt(ovD.act >= 0 ? ovD.act : 0);
      if (o) { e.preventDefault(); ovGo(o.getAttribute('href')); }
    } else if (k === 'Escape') {
      e.preventDefault();
      if (ovL.input.value) ovLineClear(); else ovL.input.blur();
    }
  }
  function ovLineSync() {
    if (!ovL.el) return;
    flag(ovL.box, 'hidden', !clOn('search'));
    flag(ovL.grid, 'hidden', !clOn('overview'));
  }
  // 사이드바를 다시 그릴 때마다(sideRender 끝 / 'sidebar' 이벤트) 부른다: 줄이 제자리에 있는지만 보고, 없으면 다시 넣는다.
  // 자리 = 보관함 칸(side.arch 또는 sideArchive) 바로 앞, 같은 Header 열 안. 보관함이 하나도 없어 크랙이 Header를 안 그리면 목록 칸 바로 위.
  // 입력 중(포커스)에는 옮기지 않는다(옮기면 한글 조합이 끊긴다)
  function ovEnsure() {
    const want = clOn('on') && (clOn('search') || clOn('overview'));
    const r = side.root;
    if (!want || !r || !r.isConnected) {
      if (ovL.el && ovL.el.isConnected && (!want || !r || !r.contains(ovL.el))) { ovDropClose(); ovL.el.remove(); }
      return;
    }
    if (!ovL.el) ovLineBuild();
    ovLineSync();
    if (!clOn('search') && ovD.open) ovDropClose();
    const line = ovL.el;
    // 빠른 길: 지난번 자리(보관함 칸 바로 앞) 그대로면 끝
    if (ovL.arch && line.isConnected && line.nextElementSibling === ovL.arch && ovL.arch.isConnected && r.contains(ovL.arch)) return;
    const busy = line.isConnected && line.contains(document.activeElement);
    let sc = null;
    let arch = side.arch && side.arch.isConnected && r.contains(side.arch) ? side.arch : null;
    if (!arch) { sc = r.querySelector('[data-testid="virtuoso-scroller"]'); const f = sc ? sideArchive(sc) : null; arch = f ? f.arch : null; }
    ovL.arch = arch;
    if (arch) {
      const col = arch.parentElement;
      if (!col) return;
      ovCls(line, 'alone', false);
      if (line.parentElement === col && (line.nextElementSibling === arch || busy)) return;
      col.insertBefore(line, arch);
    } else {
      if (!sc) sc = r.querySelector('[data-testid="virtuoso-scroller"]');
      const vp = sc && sc.firstElementChild;
      const head = vp && vp.firstElementChild;
      // Header가 그려져 있는데 보관함 칸을 아직 못 찾았으면 기다린다(곧 그려진다)
      if (!sc || !vp || (head && head.getAttribute('data-testid') !== 'virtuoso-item-list' && head.childElementCount)) return;
      const wrap = sc.parentElement, host = wrap && wrap.parentElement;
      if (!host || !r.contains(host)) return;
      ovCls(line, 'alone', true);
      if (line.parentElement === host && (line.nextElementSibling === wrap || busy)) return;
      host.insertBefore(line, wrap);
    }
    // 크랙이 Header를 새로 그리며 줄이 빠졌던 경우, 쓰던 중이었고 다른 곳으로 포커스가 가지 않았으면 입력칸 포커스를 되돌린다
    const ae = document.activeElement;
    if (ovL.focused && ae !== ovL.input) {
      if (!ae || ae === document.body || ae === document.documentElement) attempt(() => ovL.input.focus({ preventScroll: true }));
      else ovL.focused = false;
    }
  }
  // 우리 요소의 class는 값이 바뀔 때만 쓴다(같은 값을 다시 써도 변이 기록이 생겨 남의 옵저버를 깨우므로)
  function ovCls(el, c, on) { if (el.classList.contains(c) !== on) el.classList.toggle(c, on); }

  // ── 검색 결과 칸(body, 사이드바 위) ──
  // body 바로 아래 role=dialog라 사이드바에서 연 동안 기반의 왼쪽 자동 숨김이 붙잡아 둔다(닫으면 문서에서 뗀다)
  const ovD = { el: null, st: null, res: null, open: false, key: '', cm: null, act: -1, hits: 0, sc: null, stHtml: '', raf: 0 };
  function ovDropBuild() {
    const el = document.createElement('div');
    el.id = 'cpb-ov-drop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '채팅방 검색 결과');
    el.innerHTML = '<div class="st" role="status" aria-live="polite"></div><div class="res" id="cpb-ov-res" role="listbox" aria-label="검색 결과"></div>';
    ovD.el = el;
    ovD.st = el.querySelector('.st');
    ovD.res = el.querySelector('.res');
    for (const type of ['keydown', 'keyup', 'keypress']) el.addEventListener(type, (e) => e.stopPropagation());
    // 결과를 눌러도 입력칸 포커스를 지킨다(사이드바가 접히지 않게). 빈 곳·스크롤 막대는 그대로
    el.addEventListener('mousedown', (e) => { if (e.target !== el) e.preventDefault(); });
    el.addEventListener('click', (e) => {
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      if (t.closest('[data-retry]')) { e.preventDefault(); ovLoad(true); return; }
      const a = t.closest('a[data-id]');
      if (!a || !el.contains(a)) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return; // 새 탭 등은 브라우저 그대로
      e.preventDefault();
      ovGo(a.getAttribute('href'));
    });
  }
  function ovDropOpen() {
    if (!ovL.el || !ovL.el.isConnected || !clOn('on') || !clOn('search') || ovS.open) return;
    if (!ovD.el) ovDropBuild();
    if (!ovD.open) {
      ovD.open = true; ovListen();
      ovD.key = '';
      // 사이드바와 같은 바탕(테마마다 다름)
      const bg = side.root ? getComputedStyle(side.root).backgroundColor : '';
      if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) ovD.el.style.background = bg; else ovD.el.style.removeProperty('background');
    }
    if (!ovD.el.isConnected) document.body.appendChild(ovD.el);
    setAttr(ovL.input, 'aria-expanded', 'true');
    const sc = side.root ? side.root.querySelector('[data-testid="virtuoso-scroller"]') : null;
    if (sc !== ovD.sc) {
      if (ovD.sc) ovD.sc.removeEventListener('scroll', ovDropPlaceSoon);
      ovD.sc = sc;
      if (sc) sc.addEventListener('scroll', ovDropPlaceSoon, { passive: true });
    }
    ovDropPlace();
    ovTickArm();
  }
  function ovDropClose() {
    if (!ovD.open) return;
    ovD.open = false; ovListen();
    ovD.key = '';
    ovD.act = -1;
    if (ovD.sc) { ovD.sc.removeEventListener('scroll', ovDropPlaceSoon); ovD.sc = null; }
    if (ovD.el && ovD.el.isConnected) ovD.el.remove();
    if (ovL.input) { setAttr(ovL.input, 'aria-expanded', 'false'); delAttr(ovL.input, 'aria-activedescendant'); }
  }
  function ovDropPlaceSoon() { if (!ovD.raf) ovD.raf = requestAnimationFrame(() => { ovD.raf = 0; ovDropPlace(); }); }
  // 사이드바 폭 그대로, 검색 줄 아래 6px부터 사이드바 아래 끝까지
  function ovDropPlace() {
    if (!ovD.open || !ovD.el) return;
    if (!ovL.el || !ovL.el.isConnected) { ovDropClose(); return; }
    const r = ovL.el.getBoundingClientRect();
    const s = side.root && side.root.isConnected ? side.root.getBoundingClientRect() : null;
    if (!r.height || (s && (r.bottom < s.top || r.top > s.bottom))) { ovDropClose(); return; } // 줄이 스크롤로 사라졌다
    const left = s ? s.left : Math.max(0, r.left - 10);
    const width = s ? s.width : r.width + 20;
    const top = Math.max(0, Math.round(r.bottom + 6));
    const bottom = s && s.bottom > top + 160 ? Math.min(s.bottom, window.innerHeight) : window.innerHeight;
    const st = ovD.el.style;
    st.left = Math.round(Math.max(0, left)) + 'px';
    st.top = top + 'px';
    st.width = Math.round(Math.max(200, width)) + 'px';
    st.height = Math.max(120, Math.round(bottom - top)) + 'px';
  }
  function ovDropRow(c, i, fname, cm, cur) {
    const img = ovImg(c), t = ovTitle(c), s = ovStory(c), dt = ovDate(ovAt(c)), pv = ovClean(c.lastMessage).slice(0, 180);
    const col = cm ? cm[c._id] : '';
    const now = c._id === cur;
    return '<a class="it" role="option" id="cpb-ov-o' + i + '" tabindex="-1" aria-selected="false" href="' + escHtml(ovHref(c)) + '" data-id="' + escHtml(c._id) + '"'
      + (col && ovCVal[col] ? ' data-c="' + col + '"' : '') + (now ? ' data-cur=""' : '') + ' title="' + escHtml(t) + '">'
      + '<span class="th">' + (img ? '<img src="' + escHtml(img) + '" alt="" loading="lazy" decoding="async">' : escHtml(ovFirst(t))) + '</span>'
      + '<span class="mn"><span class="tt">' + (now ? '<b class="now">지금 방</b>' : '') + escHtml(t) + '</span>'
      + (pv ? '<span class="pv">' + escHtml(pv) + '</span>' : '')
      + '<span class="sb">' + escHtml(s) + (s && dt ? ' · ' : '') + escHtml(dt) + '</span></span>'
      + '<span class="chip">' + escHtml(fname) + '</span></a>';
  }
  function ovDropRender() {
    if (!ovD.open || !ovD.el) return;
    ovDropPlace();
    if (!ovD.open) return;
    const d = ovPrep();
    const terms = ovTerms(ovL.input ? ovL.input.value : '');
    const cm = clOn('color') ? colorMap() : null;
    const cur = clOn('current') ? ovCurId() : '';
    const key = (d ? ovRev : -1) + '\u0001' + terms.join(' ') + '\u0001' + cur;
    // 같은 검색어·같은 인덱스면 결과는 그대로 둔다(진행 숫자만 바뀔 때 깜빡이지 않게)
    if (key === ovD.key && cm === ovD.cm) { ovDropStatus(); return; }
    ovD.key = key;
    ovD.cm = cm;
    ovD.act = -1;
    if (ovL.input) delAttr(ovL.input, 'aria-activedescendant');
    let html = '', hits = 0, n = 0;
    if (d && terms.length) {
      const by = new Map();
      for (const c of d.chats) {
        if (!ovMatch(d, c, terms)) continue;
        const k = d.fo.get(c._id) || '';
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(c);
        if (++hits >= ovK.limit) break;
      }
      // 보관함 묶음(가나다 순) 먼저, 그다음 채팅 목록
      const order = d.folders.map((f) => f.id).filter((id) => by.has(id));
      if (by.has('')) order.push('');
      for (const k of order) {
        const list = by.get(k);
        const name = k ? d.fname.get(k) || '보관함' : '채팅 목록';
        html += '<div class="gh" role="presentation">' + (k ? ovIco.folder + '<span>보관함 · ' + escHtml(name) + '</span>' : ovIco.chat + '<span>채팅 목록</span>') + '<em>' + list.length + '</em></div>';
        for (const c of list) html += ovDropRow(c, n++, name, cm, cur);
      }
    }
    ovD.hits = hits;
    ovD.res.innerHTML = html;
    ovD.el.scrollTop = 0;
    ovDropStatus();
  }
  function ovDropStatus() {
    if (!ovD.open || !ovD.st) return;
    const st = ovIdxStatus(), d = ovPrep();
    let t = '', retry = false;
    if (d) {
      const h = ovD.hits, tot = d.chats.length.toLocaleString();
      t = h ? tot + '개 중 ' + (h >= ovK.limit ? '앞의 ' + h + '개만 보여 줘요' : h + '개 찾았어요') : '찾는 채팅방이 없어요';
      if (st === 'loading') t += ' · 새로 불러오는 중이에요' + ovIdxProg();
      else if (st === 'error') { t += ' · 새로 불러오지 못했어요'; retry = true; }
    } else if (st === 'error') { t = '채팅방 목록을 불러오지 못했어요'; retry = true; }
    else t = '채팅방을 불러오는 중이에요' + ovIdxProg();
    const html = escHtml(t) + (retry ? '<button type="button" class="rt" data-retry>다시 시도</button>' : '');
    if (html !== ovD.stHtml) { ovD.stHtml = html; ovD.st.innerHTML = html; }
  }
  const ovDropOpt = (i) => (ovD.res ? ovD.res.querySelectorAll('a[role="option"]')[i] || null : null);
  function ovDropMove(dir) {
    const opts = ovD.res.querySelectorAll('a[role="option"]');
    if (!opts.length) return;
    let i = ovD.act + dir;
    if (i < 0) i = opts.length - 1;
    if (i >= opts.length) i = 0;
    if (opts[ovD.act]) setAttr(opts[ovD.act], 'aria-selected', 'false');
    ovD.act = i;
    setAttr(opts[i], 'aria-selected', 'true');
    setAttr(ovL.input, 'aria-activedescendant', opts[i].id);
    opts[i].scrollIntoView({ block: 'nearest' });
  }
  function ovGo(href) {
    if (!href) return;
    ovDropClose();
    if (ovL.input && document.activeElement === ovL.input) ovL.input.blur();
    ovClose(true);
    goto(href);
  }

  // ── 한눈에 보기(넓은 창) ──
  const ovS = {
    el: null, win: null, r: null, open: false, folder: 'all', color: '', comp: false, qT: 0,
    selecting: false, sel: new Set(), last: '', more: new Set(), elig: [],
    tiles: new Map(), secs: new Map(), job: 0, paintR: 0, railKey: '', stHtml: null,
    popId: '', popTile: null, popDirty: false, pickOn: false, pickBtn: null, sheetOn: false, sheetOk: null, sheetBack: null,
    busy: false, opener: null, emptyKey: '', downBack: false,
  };
  function ovWinBuild() {
    const el = document.createElement('div');
    el.id = 'cpb-ov-win';
    el.innerHTML = '<div class="win" role="dialog" aria-modal="true" aria-label="한눈에 보기" tabindex="-1">'
      + '<span class="trap" tabindex="0" data-trap="a"></span>'
      + '<header class="top">'
      + '<button type="button" class="ib" data-act="close" aria-label="닫기" title="닫기">' + ovIco.back + '</button>'
      + '<div class="hd"><strong>한눈에 보기</strong><em data-r="sub"></em></div>'
      + '<div class="sch">' + ovIco.search + '<input type="text" data-r="input" autocomplete="off" spellcheck="false" placeholder="제목 · 작품 이름 검색" aria-label="채팅방 검색">'
      + '<button type="button" class="clr" data-act="clr" tabindex="-1" aria-label="검색어 지우기" title="지우기">' + ovIco.x + '</button></div>'
      + '<div class="cf" data-r="cf" role="group" aria-label="색으로 거르기"><button type="button" class="all" data-cf="" aria-pressed="true">전체</button>'
      + CL_COLORS.map(([k, n]) => '<button type="button" class="dot" data-cf="' + k + '" data-c="' + k + '" aria-pressed="false" aria-label="' + n + '만 보기" title="' + n + '만 보기"></button>').join('') + '</div>'
      + '<div class="tools"><div class="seg" data-r="seg" role="group" aria-label="보기 방식"><i></i><button type="button" data-view="grid">카드</button><button type="button" data-view="dense">촘촘히</button></div>'
      + '<div class="qa"><button type="button" class="sel" data-act="select" aria-pressed="false" aria-label="여러 방 선택" title="여러 방 선택">' + ovIco.select + '</button>'
      + '<button type="button" data-act="reload" aria-label="목록 새로 불러오기" title="목록 새로 불러오기">' + ovIco.reload + '</button></div></div>'
      + '</header>'
      + '<div class="bar" data-r="bar" role="toolbar" aria-label="선택한 방 옮기기">'
      + '<button type="button" class="btn" data-act="all"></button><button type="button" class="btn" data-act="none">선택 해제</button>'
      + '<span class="cnt" data-r="cnt" aria-live="polite"></span><span class="note" data-r="note" aria-live="polite"></span><span class="sp"></span>'
      + '<button type="button" class="btn" data-act="move" aria-haspopup="menu" aria-expanded="false">' + ovIco.into + '보관함으로 옮기기</button>'
      + '<button type="button" class="btn" data-act="out">' + ovIco.out + '채팅 목록으로 빼기</button>'
      + '<button type="button" class="btn p" data-act="new">' + ovIco.plus + '새 보관함 만들기</button></div>'
      + '<div class="body"><nav class="rail" data-r="rail" aria-label="보관함 고르기"></nav>'
      + '<div class="scroll" data-r="scroll"><div class="st" data-r="st" role="status" aria-live="polite" hidden></div><div class="groups" data-r="groups"></div><div class="empty" data-r="empty" hidden></div></div></div>'
      + '<div class="pop" data-r="pop" role="menu" aria-label="색 표시" hidden></div>'
      + '<div class="pick" data-r="pick" role="menu" aria-label="옮길 보관함" hidden></div>'
      + '<div class="sheet" data-r="sheet" hidden></div>'
      + '<span class="trap" tabindex="0" data-trap="b"></span></div>';
    const q = (n) => el.querySelector('[data-r="' + n + '"]');
    const r = {
      sub: q('sub'), input: q('input'), cf: q('cf'), seg: q('seg'), bar: q('bar'), cnt: q('cnt'), note: q('note'), rail: q('rail'),
      scroll: q('scroll'), st: q('st'), groups: q('groups'), empty: q('empty'), pop: q('pop'), pick: q('pick'), sheet: q('sheet'),
      clr: el.querySelector('.sch .clr'), selBtn: el.querySelector('[data-act="select"]'), reload: el.querySelector('.qa [data-act="reload"]'),
      allBtn: el.querySelector('.bar [data-act="all"]'), moveBtn: el.querySelector('.bar [data-act="move"]'),
    };
    ovS.el = el;
    ovS.win = el.firstElementChild;
    ovS.r = r;
    // 창 안의 키는 크랙 단축키로 가지 않게(전파만 멈춤). Esc는 document 캡처(ovDocKey)에서 받는다
    for (const type of ['keydown', 'keyup', 'keypress']) el.addEventListener(type, (e) => e.stopPropagation());
    el.addEventListener('keydown', ovWinKey);
    // 바깥(어두운 곳)을 눌렀다 뗀 click에서 닫는다(누르는 순간 닫으면 떼는 클릭이 아래 크랙 화면에 떨어질 수 있다)
    el.addEventListener('mousedown', (e) => {
      ovS.downBack = e.target === el && e.button === 0;
      if (e.button === 1 && e.target.closest && e.target.closest('.tile')) e.preventDefault(); // 가운데 버튼 자동 스크롤 대신 새 탭
    });
    el.addEventListener('click', ovWinClick);
    el.addEventListener('contextmenu', ovWinCtx);
    el.addEventListener('auxclick', (e) => {
      if (e.button !== 1 || ovS.selecting) return;
      const t = e.target.closest && e.target.closest('.tile');
      if (t && t.dataset.href) { e.preventDefault(); window.open(t.dataset.href, '_blank', 'noopener'); }
    });
    r.input.addEventListener('compositionstart', () => { ovS.comp = true; });
    r.input.addEventListener('compositionend', () => { ovS.comp = false; flag(r.clr, 'data-on', !!r.input.value.trim()); ovWinQuery(0); });
    r.input.addEventListener('input', () => { flag(r.clr, 'data-on', !!r.input.value.trim()); ovWinQuery(ovS.comp ? 120 : 30); });
    r.clr.addEventListener('mousedown', (e) => e.preventDefault());
    r.scroll.addEventListener('scroll', () => { if (ovS.popId) ovPopClose(false); }, { passive: true });
    r.sheet.addEventListener('click', ovSheetClick);
    // 포커스 가두기: 처음/끝 문지기에 닿으면 반대쪽으로
    el.querySelector('[data-trap="a"]').addEventListener('focus', () => { const f = ovFocusables(); attempt(() => (f[f.length - 1] || ovS.win).focus({ preventScroll: true })); });
    el.querySelector('[data-trap="b"]').addEventListener('focus', () => { const f = ovFocusables(); attempt(() => (f[0] || ovS.win).focus({ preventScroll: true })); });
  }
  function ovFocusables() {
    const scope = ovS.sheetOn ? ovS.r.sheet : ovS.win;
    return Array.from(scope.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),.tile[tabindex="0"]'))
      .filter((x) => !x.closest('[hidden]') && x.getClientRects().length);
  }
  function ovOpen(opener) {
    if (!clOn('on') || !clOn('overview') || ovS.open || !document.body) return;
    ovDropClose();
    if (!ovS.el) ovWinBuild();
    ovS.opener = opener && opener.nodeType === 1 ? opener : document.activeElement;
    ovS.open = true; ovListen();
    flag(ovS.r.clr, 'data-on', !!ovS.r.input.value.trim());
    document.body.appendChild(ovS.el);
    if (ovL.grid) setAttr(ovL.grid, 'aria-expanded', 'true');
    document.addEventListener('keydown', ovDocKey, true);
    document.addEventListener('focusin', ovDocFocus, true);
    ovLoad(false);
    ovRender();
    requestAnimationFrame(() => { if (ovS.open) attempt(() => ovS.r.input.focus({ preventScroll: true })); });
  }
  function ovClose(noFocus) {
    if (!ovS.open) return;
    const had = ovS.el.contains(document.activeElement);
    ovS.open = false; ovListen();
    ovS.job++;
    cancelAnimationFrame(ovS.paintR);
    clearTimeout(ovS.qT);
    ovPopClose(false);
    ovPickClose(false);
    ovSheetClose(true);
    ovS.selecting = false;
    ovS.sel.clear();
    ovS.last = '';
    document.removeEventListener('keydown', ovDocKey, true);
    document.removeEventListener('focusin', ovDocFocus, true);
    ovS.el.remove();
    // 닫으면 카드는 버린다(다음에 열 때 새로 그림, 큰 목록을 붙잡아 두지 않게)
    ovS.r.groups.replaceChildren();
    ovS.tiles.clear();
    ovS.secs.clear();
    ovS.railKey = '';
    ovS.stHtml = null;
    if (ovL.grid) setAttr(ovL.grid, 'aria-expanded', 'false');
    const op = ovS.opener;
    ovS.opener = null;
    if (had && !noFocus && op && op.isConnected && typeof op.focus === 'function') attempt(() => op.focus({ preventScroll: true }));
  }
  function ovEsc() {
    if (ovS.sheetOn) { ovSheetClose(); return; }
    if (ovS.pickOn) { ovPickClose(true); return; }
    if (ovS.popId) { ovPopClose(true); return; }
    ovClose();
  }
  // 열린 동안만 붙는다. Esc = 안쪽 것부터 닫기(조합 중 Esc는 입력기에 양보)
  function ovDocKey(e) {
    if (!ovS.open || e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    ovEsc();
  }
  function ovDocFocus(e) {
    if (!ovS.open) return;
    const t = e.target;
    if (t && t.nodeType === 1 && !ovS.el.contains(t)) attempt(() => ovS.win.focus({ preventScroll: true }));
  }
  function ovWinQuery(delay) {
    clearTimeout(ovS.qT);
    ovS.qT = setTimeout(() => { ovS.qT = 0; ovRender(); }, delay);
  }
  function ovWinKey(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('tile')) return;
    if (e.key === 'Enter' || (e.key === ' ' && ovS.selecting)) { e.preventDefault(); ovTileAct(t, e); }
  }
  function ovWinCtx(e) {
    const tile = e.target && e.target.closest ? e.target.closest('.tile') : null;
    if (!tile || e.shiftKey || !clOn('color')) return; // Shift+우클릭 = 브라우저 메뉴
    e.preventDefault();
    let x = e.clientX, y = e.clientY;
    if (!x && !y) { const rc = tile.getBoundingClientRect(); x = rc.left + 12; y = rc.bottom - 6; } // 키보드 메뉴 키
    ovPopOpen(tile, x, y, false);
  }
  function ovWinClick(e) {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || !ovS.open) return;
    if (t === ovS.el) { const back = ovS.downBack; ovS.downBack = false; if (back) ovClose(); return; }
    if (ovS.sheetOn || t.closest('.sheet')) return;
    let b;
    if ((b = t.closest('.pop button[data-k]'))) { ovPopPick(b.dataset.k); return; }
    if ((b = t.closest('.pick [data-pf]'))) { ovPickChoose(b.dataset.pf); return; }
    if (t.closest('.pick')) return;
    if ((b = t.closest('.tile .more'))) {
      const tile = b.closest('.tile');
      if (ovS.popId === tile.dataset.id) ovPopClose(false);
      else { const rc = b.getBoundingClientRect(); ovPopOpen(tile, rc.right, rc.bottom + 6, true); }
      return;
    }
    if ((b = t.closest('[data-act]'))) { ovAct(b.dataset.act, b); return; }
    if ((b = t.closest('[data-cf]'))) { const k = b.dataset.cf || ''; ovS.color = k && ovS.color !== k ? k : ''; ovRender('swap'); return; }
    if ((b = t.closest('.seg button[data-view]'))) { settings.set('chatlist.view', b.dataset.view === 'dense' ? 'dense' : 'grid'); ovSegSync(); return; }
    if ((b = t.closest('.rail [data-rf]'))) { ovS.folder = b.dataset.rf; ovS.r.scroll.scrollTop = 0; ovRender('swap'); return; }
    if ((b = t.closest('[data-more]'))) { ovS.more.add(b.dataset.more); ovRender(); return; }
    if ((b = t.closest('[data-gsel]'))) { ovGroupSel(b.dataset.gsel); return; }
    if (t.closest('[data-reset]')) {
      ovS.folder = 'all';
      ovS.color = '';
      ovS.r.input.value = '';
      flag(ovS.r.clr, 'data-on', false);
      ovRender('swap');
      return;
    }
    if ((b = t.closest('.tile'))) ovTileAct(b, e);
  }
  function ovAct(act, btn) {
    const r = ovS.r;
    if (act === 'close') ovClose();
    else if (act === 'clr') { clearTimeout(ovS.qT); ovS.comp = false; r.input.value = ''; flag(r.clr, 'data-on', false); r.input.focus({ preventScroll: true }); ovRender('swap'); }
    else if (act === 'reload') ovLoad(true);
    else if (act === 'select') {
      if (!clOn('multi')) return;
      ovS.selecting = !ovS.selecting;
      if (!ovS.selecting) { ovS.sel.clear(); ovS.last = ''; ovNote(''); }
      ovPopClose(false);
      ovPickClose(false);
      ovRender();
    } else if (act === 'all') { for (const id of ovS.elig) ovS.sel.add(id); ovSelFlags(); }
    else if (act === 'none') { ovS.sel.clear(); ovS.last = ''; ovSelFlags(); }
    else if (act === 'move') { if (ovS.pickOn) ovPickClose(false); else ovPickOpen(btn); }
    else if (act === 'out') ovAskOut(btn);
    else if (act === 'new') ovAskNew(btn);
  }
  function ovTileAct(tile, e) {
    const id = tile.dataset.id;
    if (!id) return;
    if (ovS.selecting) {
      if (e && e.shiftKey && ovS.last && ovS.last !== id) ovSelRange(ovS.last, id);
      else { if (ovS.sel.has(id)) ovS.sel.delete(id); else ovS.sel.add(id); ovTileSel(id); ovBarSync(); }
      ovS.last = id;
      return;
    }
    const href = tile.dataset.href;
    if (!href) return;
    if (e && (e.ctrlKey || e.metaKey)) { window.open(href, '_blank', 'noopener'); return; }
    ovGo(href);
  }
  function ovTileSel(id) {
    const t = ovS.tiles.get(id);
    if (!t) return;
    const on = ovS.sel.has(id);
    flag(t.el, 'data-sel', ovS.selecting && on);
    if (ovS.selecting) setAttr(t.el, 'aria-checked', String(on));
  }
  function ovSelFlags() { for (const id of ovS.tiles.keys()) ovTileSel(id); ovBarSync(); }
  // Shift+클릭: 지금 보이는 순서(거른 결과)에서 앞에 누른 방부터 이 방까지 모두 선택
  function ovSelRange(a, b) {
    const i = ovS.elig.indexOf(a), j = ovS.elig.indexOf(b);
    if (i < 0 || j < 0) { ovS.sel.add(b); ovTileSel(b); ovBarSync(); return; }
    for (let k = Math.min(i, j); k <= Math.max(i, j); k++) ovS.sel.add(ovS.elig[k]);
    ovSelFlags();
  }
  function ovGroupSel(key) {
    const sec = ovS.secs.get(key);
    if (!sec || !sec.all.length) return;
    if (!ovS.selecting) { ovS.selecting = true; ovRender(); }
    const every = sec.all.every((id) => ovS.sel.has(id));
    for (const id of sec.all) { if (every) ovS.sel.delete(id); else ovS.sel.add(id); }
    ovSelFlags();
  }
  function ovSegSync() {
    if (!ovS.el) return;
    const v = ovView();
    setAttr(ovS.el, 'data-view', v);
    for (const b of ovS.r.seg.querySelectorAll('button')) setAttr(b, 'aria-pressed', String(b.dataset.view === v));
    for (const b of ovS.r.cf.querySelectorAll('button')) setAttr(b, 'aria-pressed', String((b.dataset.cf || '') === ovS.color));
  }
  function ovNote(text) { if (ovS.r && ovS.r.note.textContent !== text) ovS.r.note.textContent = text; }
  function ovBarSync() {
    if (!ovS.el) return;
    const r = ovS.r, multi = clOn('multi');
    if (!multi && ovS.selecting) { ovS.selecting = false; ovS.sel.clear(); ovS.last = ''; }
    flag(ovS.el, 'data-multi', multi);
    flag(ovS.el, 'data-selecting', ovS.selecting);
    setAttr(r.selBtn, 'aria-pressed', String(ovS.selecting));
    const n = ovS.sel.size, busy = ovS.busy;
    const cnt = n ? n.toLocaleString() + '개 선택' : '옮길 방을 골라 주세요';
    if (r.cnt.textContent !== cnt) r.cnt.textContent = cnt;
    const all = '보이는 방 모두 선택 (' + ovS.elig.length.toLocaleString() + ')';
    if (r.allBtn.textContent !== all) r.allBtn.textContent = all;
    r.allBtn.disabled = busy || !ovS.elig.length;
    for (const a of ['none', 'move', 'out', 'new']) r.bar.querySelector('[data-act="' + a + '"]').disabled = busy || !n;
  }
  function ovWinStatus() {
    if (!ovS.open) return;
    const r = ovS.r, st = ovIdxStatus(), has = !!ovPrep();
    let t = '', retry = false;
    if (!has) ovEmpty(st === 'error' ? '채팅방 목록을 불러오지 못했어요.' : '채팅방을 불러오는 중이에요' + ovIdxProg(), false, st === 'error'); // 목록이 없으면 가운데 한 줄로만
    else if (st === 'loading') t = '목록을 새로 불러오는 중이에요' + ovIdxProg();
    else if (st === 'error') { t = '새로 불러오지 못해서 저장된 목록을 보여 줘요'; retry = true; }
    const html = t ? '<span>' + escHtml(t) + '</span>' + (retry ? '<button type="button" class="rt" data-act="reload">다시 시도</button>' : '') : '';
    if (ovS.stHtml !== html) { ovS.stHtml = html; r.st.innerHTML = html; flag(r.st, 'hidden', !html); }
    r.reload.disabled = st === 'loading';
    const idx = attempt(() => chatIndex.get());
    const at = idx && idx.at ? Math.floor((Date.now() - idx.at) / 60000) : -1;
    const title = '목록 새로 불러오기' + (at < 0 ? '' : at < 1 ? ' (방금 불러옴)' : ' (' + at + '분 전에 불러옴)');
    if (r.reload.title !== title) r.reload.title = title;
  }
  function ovEmpty(text, reset, retry) {
    const e = ovS.r.empty;
    if (!text) { flag(e, 'hidden', true); return; }
    const key = text + (reset ? '\u0001r' : '') + (retry ? '\u0001t' : '');
    if (ovS.emptyKey !== key) {
      ovS.emptyKey = key;
      e.innerHTML = '<div>' + escHtml(text) + '</div>' + (reset ? '<button type="button" class="btn" data-reset>거르기 모두 풀기</button>' : '')
        + (retry ? '<button type="button" class="btn" data-act="reload">다시 시도</button>' : '');
    }
    flag(e, 'hidden', false);
  }
  // 다시 그리기: 거르기·묶음 계산 후 카드는 캐시에서 재사용하며 여러 프레임에 나눠 붙인다(입력마다 전부 새로 만들지 않음)
  function ovRender(anim) {
    if (!ovS.open) return;
    const r = ovS.r, d = ovPrep();
    ovSegSync();
    flag(ovS.el, 'data-nocolor', !clOn('color'));
    ovWinStatus();
    if (!d) {
      ovS.elig = [];
      ovS.job++;
      cancelAnimationFrame(ovS.paintR);
      r.groups.replaceChildren();
      r.rail.innerHTML = '';
      ovS.railKey = '';
      r.sub.textContent = ''; // 가운데 안내(불러오는 중 n/m · 실패 + 다시 시도)는 ovWinStatus가 맡는다
      ovBarSync();
      return;
    }
    const terms = ovTerms(r.input.value);
    const cm = clOn('color') ? colorMap() : null;
    if (!cm || !ovCVal[ovS.color]) ovS.color = '';
    const col = ovS.color;
    const pass = (c) => (!col || cm[c._id] === col) && ovMatch(d, c, terms);
    if (ovS.folder !== 'all' && ovS.folder !== '' && !d.fname.has(ovS.folder)) ovS.folder = 'all';
    const rootList = d.by.get('') || [];
    let gs;
    if (ovS.folder === 'all') gs = [{ key: '', name: '채팅 목록', list: rootList }].concat(d.folders.map((f) => ({ key: f.id, name: f.name, list: d.by.get(f.id) || [] })));
    else if (ovS.folder === '') gs = [{ key: '', name: '채팅 목록', list: rootList }];
    else gs = [{ key: ovS.folder, name: d.fname.get(ovS.folder) || '보관함', list: d.by.get(ovS.folder) || [] }];
    const limited = ovS.folder === 'all';
    const out = [], elig = [];
    let shown = 0;
    for (const g of gs) {
      const items = g.list.filter(pass);
      if (!items.length) continue;
      const ids = items.map((c) => c._id);
      for (const id of ids) elig.push(id);
      shown += items.length;
      const cap = limited && !ovS.more.has(g.key) ? ovK.group : Infinity;
      out.push({ key: g.key, name: g.name, ids, total: items.length, items: items.length > cap ? items.slice(0, cap) : items, rest: Math.max(0, items.length - cap) });
    }
    ovS.elig = elig;
    ovRail(d, rootList.length);
    const filtered = ovS.folder !== 'all' || !!col || terms.length > 0;
    const total = d.chats.length.toLocaleString();
    const sub = filtered ? total + '개 중 ' + shown.toLocaleString() + '개' : total + '개 채팅';
    if (r.sub.textContent !== sub) r.sub.textContent = sub;
    ovBarSync();
    ovPaint(out);
    if (shown) ovEmpty('', false);
    else if (!d.chats.length) ovEmpty('보여 줄 채팅방이 아직 없어요.', false);
    else if (!col && !terms.length && ovS.folder !== 'all') ovEmpty(ovS.folder === '' ? '채팅 목록이 비어 있어요.' : '이 보관함은 비어 있어요.', false);
    else ovEmpty('조건에 맞는 채팅방이 없어요.', true);
    if (anim === 'swap' && !matchMedia('(prefers-reduced-motion: reduce)').matches && r.groups.animate) {
      attempt(() => r.groups.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    }
  }
  function ovRail(d, rootN) {
    const f = ovS.folder;
    const key = f + '\u0001' + d.chats.length + '\u0001' + rootN + '\u0001' + d.folders.map((x) => x.id + ':' + x.count + ':' + x.name).join('\u0002');
    if (key === ovS.railKey) return;
    ovS.railKey = key;
    const rail = ovS.r.rail, ae = document.activeElement;
    const back = ae && rail.contains(ae) ? ae.getAttribute('data-rf') : null; // 키보드로 고르던 중이면 포커스를 이어 준다
    const btn = (k, ico, name, n) => '<button type="button" class="rb" data-rf="' + escHtml(k) + '"' + (f === k ? ' aria-current="true"' : '') + ' title="' + escHtml(name) + '"><span class="ri">' + ico + '</span><em>' + escHtml(name) + '</em><b>' + n.toLocaleString() + '</b></button>';
    rail.innerHTML = btn('all', ovIco.all, '전체', d.chats.length) + btn('', ovIco.chat, '채팅 목록', rootN)
      + '<div class="rh">보관함<b>' + d.folders.length + '</b></div>' + d.folders.map((x) => btn(x.id, ovIco.folder, x.name, x.count)).join('');
    if (back != null) for (const b of rail.querySelectorAll('[data-rf]')) if (b.getAttribute('data-rf') === back) { attempt(() => b.focus({ preventScroll: true })); break; }
  }
  function ovSec(key) {
    let s = ovS.secs.get(key);
    if (s) return s;
    const el = document.createElement('section');
    el.className = 'grp';
    el.innerHTML = '<div class="gh"><span class="gi">' + (key ? ovIco.folder : ovIco.chat) + '</span><strong></strong><em></em><button type="button" class="gsel">이 묶음 모두 선택</button></div><div class="grid"></div><button type="button" class="mb" hidden></button>';
    s = { el, name: el.querySelector('strong'), cnt: el.querySelector('em'), grid: el.querySelector('.grid'), more: el.querySelector('.mb'), all: [] };
    el.querySelector('.gsel').setAttribute('data-gsel', key);
    s.more.setAttribute('data-more', key);
    ovS.secs.set(key, s);
    return s;
  }
  function ovTile(c, cur, cm) {
    const id = c._id;
    let t = ovS.tiles.get(id);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'tile';
      el.tabIndex = 0;
      el.dataset.id = id;
      t = { el, sig: '' };
      ovS.tiles.set(id, t);
    }
    const el = t.el, title = ovTitle(c), story = ovStory(c), at = ovAt(c), img = ovImg(c), last = ovClean(c.lastMessage).slice(0, 140);
    const sig = title + '\u0001' + story + '\u0001' + last + '\u0001' + at + '\u0001' + img;
    if (t.sig !== sig) {
      t.sig = sig;
      el.dataset.href = ovHref(c);
      el.title = story && story !== title ? title + ' · ' + story : title;
      el.innerHTML = '<span class="pk">' + ovIco.check + '</span>'
        + '<span class="th">' + (img ? '<img src="' + escHtml(img) + '" alt="" loading="lazy" decoding="async">' : escHtml(ovFirst(title))) + '</span>'
        + '<span class="mn"><span class="tt">' + escHtml(title) + '</span><span class="sn">' + escHtml(story) + '</span><span class="pv">' + escHtml(last) + '</span></span>'
        + '<span class="dt"><span class="d">' + escHtml(ovDate(at)) + '</span><b class="now">지금 방</b></span>'
        + '<button type="button" class="more" tabindex="-1" aria-label="색 표시 바꾸기" title="색 표시" aria-haspopup="menu">' + ovIco.dots + '</button>';
    }
    const on = ovS.sel.has(id);
    setAttr(el, 'role', ovS.selecting ? 'checkbox' : 'link');
    if (ovS.selecting) setAttr(el, 'aria-checked', String(on)); else delAttr(el, 'aria-checked');
    flag(el, 'data-sel', ovS.selecting && on);
    flag(el, 'data-cur', id === cur);
    const col = cm ? cm[id] : '';
    if (col && ovCVal[col]) setAttr(el, 'data-c', col); else delAttr(el, 'data-c');
    return el;
  }
  // 묶음·카드를 제자리에 맞춘다. 한 프레임에 12ms까지만 쓰고 나머지는 다음 프레임에(새로 그리면 이전 작업은 버림)
  function ovPaint(out) {
    const token = ++ovS.job;
    cancelAnimationFrame(ovS.paintR);
    const box = ovS.r.groups;
    const cur = clOn('current') ? ovCurId() : '';
    const cm = clOn('color') ? colorMap() : null;
    let gi = 0, ti = 0;
    const step = () => {
      if (token !== ovS.job || !ovS.open) return;
      const t0 = performance.now();
      for (; gi < out.length; gi++, ti = 0) {
        const g = out[gi];
        const sec = ovSec(g.key);
        if (ti === 0) {
          if (box.children[gi] !== sec.el) box.insertBefore(sec.el, box.children[gi] || null);
          if (sec.name.textContent !== g.name) sec.name.textContent = g.name;
          const n = g.total.toLocaleString();
          if (sec.cnt.textContent !== n) sec.cnt.textContent = n;
          sec.all = g.ids;
        }
        const grid = sec.grid;
        for (; ti < g.items.length; ti++) {
          const el = ovTile(g.items[ti], cur, cm);
          if (grid.children[ti] !== el) grid.insertBefore(el, grid.children[ti] || null);
          if ((ti & 31) === 31 && performance.now() - t0 > 12) { ti++; ovS.paintR = requestAnimationFrame(step); return; }
        }
        while (grid.children.length > g.items.length) grid.lastElementChild.remove();
        flag(sec.more, 'hidden', !g.rest);
        if (g.rest) { const m = g.rest.toLocaleString() + '개 더 보기'; if (sec.more.textContent !== m) sec.more.textContent = m; }
      }
      while (box.children.length > out.length) box.lastElementChild.remove();
    };
    step();
  }

  // 색 표시 팝업(카드 우클릭 · 카드 ⋯). 점 = 그 색(같은 점을 다시 누르면 해제), 마지막 버튼 = 해제. 사이드바 행 색과 같은 저장소
  function ovPopOpen(tile, x, y, alignRight) {
    if (!clOn('color') || !tile || !tile.dataset.id) return;
    ovPopClose(false);
    ovPickClose(false);
    const r = ovS.r, id = tile.dataset.id, cur = colorMap()[id] || '';
    r.pop.innerHTML = '<span class="lb">색</span>' + CL_COLORS.map(([k, n]) => '<button type="button" class="dot" role="menuitemradio" data-k="' + k + '" data-c="' + k + '" aria-checked="' + (cur === k) + '" aria-label="' + n + '" title="' + n + '"></button>').join('')
      + '<button type="button" class="nc" role="menuitem" data-k="" aria-label="색 해제" title="색 해제">' + ovIco.none + '</button>';
    flag(r.pop, 'hidden', false);
    ovS.popId = id;
    ovS.popTile = tile;
    flag(tile, 'data-menu', true);
    // 창 안 좌표(창이 transform 애니메이션 중이어도 맞게 absolute로)
    const wr = ovS.win.getBoundingClientRect(), pw = r.pop.offsetWidth, ph = r.pop.offsetHeight;
    let left = (alignRight ? x - pw : x) - wr.left, top = y - wr.top;
    if (top + ph > wr.height - 8) top = top - ph - (alignRight ? 36 : 12);
    left = Math.max(8, Math.min(left, wr.width - pw - 8));
    top = Math.max(8, Math.min(top, wr.height - ph - 8));
    r.pop.style.left = Math.round(left) + 'px';
    r.pop.style.top = Math.round(top) + 'px';
  }
  function ovPopClose(focusBack) {
    if (!ovS.popId) return;
    const tile = ovS.popTile;
    ovS.popId = '';
    ovS.popTile = null;
    flag(ovS.r.pop, 'hidden', true);
    if (tile) flag(tile, 'data-menu', false);
    if (focusBack && tile && tile.isConnected) attempt(() => tile.focus({ preventScroll: true }));
    if (ovS.popDirty) { ovS.popDirty = false; ovRender(); } // 색으로 거르는 중이면 닫을 때 한 번 맞춘다
  }
  function ovPopPick(k) {
    const id = ovS.popId;
    if (!id) return;
    const map = Object.assign({}, colorMap());
    if (!k || map[id] === k) delete map[id]; else map[id] = k;
    colorSave(map);
    sideSoon();
    const c = map[id] || '';
    const t = ovS.tiles.get(id);
    if (t) { if (c) setAttr(t.el, 'data-c', c); else delAttr(t.el, 'data-c'); }
    for (const b of ovS.r.pop.querySelectorAll('.dot')) setAttr(b, 'aria-checked', String(b.dataset.k === c));
    if (ovS.color) ovS.popDirty = true;
  }

  // 옮길 보관함 고르기(가나다 순, 많으면 이름 찾기 칸)
  function ovPickOpen(btn) {
    const d = ovPrep();
    if (!d || !ovS.sel.size || ovS.busy) return;
    ovPopClose(false);
    const r = ovS.r;
    const many = d.folders.length > 8;
    r.pick.innerHTML = (many ? '<div class="pf">' + ovIco.search + '<input type="text" autocomplete="off" spellcheck="false" placeholder="보관함 이름 찾기" aria-label="보관함 이름 찾기"></div>' : '')
      + '<div class="pl">' + (d.folders.length
        ? d.folders.map((f) => '<button type="button" role="menuitem" class="pi" data-pf="' + escHtml(f.id) + '" data-n="' + escHtml(ovNorm(f.name)) + '" title="' + escHtml(f.name) + '"><span class="ri">' + ovIco.folder + '</span><em>' + escHtml(f.name) + '</em><b>' + f.count.toLocaleString() + '</b></button>').join('')
        : '<div class="pe">보관함이 아직 없어요. 새 보관함을 만들어 보세요.</div>') + '</div>';
    flag(r.pick, 'hidden', false);
    ovS.pickOn = true;
    ovS.pickBtn = btn;
    setAttr(btn, 'aria-expanded', 'true');
    const wr = ovS.win.getBoundingClientRect(), br = btn.getBoundingClientRect(), pw = r.pick.offsetWidth;
    r.pick.style.left = Math.round(Math.max(8, Math.min(br.left - wr.left, wr.width - pw - 8))) + 'px';
    r.pick.style.top = Math.round(br.bottom - wr.top + 6) + 'px';
    const fi = r.pick.querySelector('.pf input');
    if (fi) {
      fi.addEventListener('input', () => {
        const qs = ovTerms(fi.value);
        for (const b of r.pick.querySelectorAll('.pi')) { const n = b.dataset.n || ''; flag(b, 'hidden', !qs.every((w) => n.indexOf(w) >= 0)); }
      });
      fi.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
        const first = r.pick.querySelector('.pi:not([hidden])');
        if (first) { e.preventDefault(); ovPickChoose(first.dataset.pf); }
      });
      attempt(() => fi.focus({ preventScroll: true }));
    } else { const first = r.pick.querySelector('.pi'); if (first) attempt(() => first.focus({ preventScroll: true })); }
  }
  function ovPickClose(focusBack) {
    if (!ovS.pickOn) return;
    ovS.pickOn = false;
    flag(ovS.r.pick, 'hidden', true);
    const b = ovS.pickBtn;
    ovS.pickBtn = null;
    if (b) { setAttr(b, 'aria-expanded', 'false'); if (focusBack && b.isConnected) attempt(() => b.focus({ preventScroll: true })); }
  }
  function ovPickChoose(fid) {
    const d = ovPrep();
    const btn = ovS.pickBtn;
    ovPickClose(false);
    if (!d || !fid) return;
    const name = d.fname.get(fid) || '보관함';
    const ids = Array.from(ovS.sel).filter((id) => d.fo.has(id));
    const go = ids.filter((id) => d.fo.get(id) !== fid);
    if (!go.length) { ovNote('선택한 방이 모두 이미 그 보관함에 있어요'); return; }
    const fromOther = go.filter((id) => d.fo.get(id)).length;
    let body = '선택한 방 ' + go.length + '개를 \'' + name + '\' 보관함으로 옮겨요.';
    if (ids.length > go.length) body += ' 이미 그 보관함에 있는 ' + (ids.length - go.length) + '개는 그대로 둬요.';
    if (fromOther) body += ' 다른 보관함에 있던 ' + fromOther + '개는 그 보관함에서 빠져요.';
    ovSheet({ title: '보관함으로 옮길까요?', body, ok: '옮기기', back: btn }, () => ovApply('move', fid, name));
  }
  function ovAskOut(btn) {
    const d = ovPrep();
    if (!d || !ovS.sel.size || ovS.busy) return;
    const ids = Array.from(ovS.sel).filter((id) => d.fo.get(id));
    if (!ids.length) { ovNote('선택한 방이 모두 이미 채팅 목록에 있어요'); return; }
    ovSheet({ title: '채팅 목록으로 뺄까요?', body: '선택한 방 ' + ids.length + '개를 보관함에서 빼서 채팅 목록으로 옮겨요. 방은 지워지지 않아요.', ok: '빼기', back: btn }, () => ovApply('out', null, ''));
  }
  function ovAskNew(btn) {
    const d = ovPrep();
    if (!d || !ovS.sel.size || ovS.busy) return;
    const ids = Array.from(ovS.sel).filter((id) => d.fo.has(id));
    if (!ids.length) return;
    // 모두 같은 작품이면 작품 이름을 미리 넣어 둔다
    const stories = new Set();
    let sname = '';
    for (const c of d.chats) if (ovS.sel.has(c._id)) { stories.add(c.story._id); sname = ovStory(c); }
    const value = stories.size === 1 ? Array.from(sname).slice(0, 32).join('').trim() : '';
    const fromOther = ids.filter((id) => d.fo.get(id)).length;
    let body = '선택한 방 ' + ids.length + '개를 새 보관함에 넣어요.';
    if (fromOther) body += ' 다른 보관함에 있던 ' + fromOther + '개는 그 보관함에서 빠져요.';
    ovSheet({ title: '새 보관함 만들기', body, ok: '만들기', back: btn, input: { ph: '보관함 이름 (1~32자)', value } }, (v) => ovApply('new', null, v));
  }
  // 확인 칸(창 안). input이 있으면 이름 입력(앞뒤 공백 빼고 1~32자)
  function ovSheet(o, onOk) {
    const r = ovS.r;
    ovPopClose(false);
    ovPickClose(false);
    r.sheet.innerHTML = '<div class="card" role="alertdialog" aria-modal="true" aria-labelledby="cpb-ov-sh-t" aria-describedby="cpb-ov-sh-b">'
      + '<b id="cpb-ov-sh-t">' + escHtml(o.title) + '</b><p id="cpb-ov-sh-b">' + escHtml(o.body) + '</p>'
      + (o.input ? '<label class="fld"><input type="text" maxlength="32" autocomplete="off" spellcheck="false" placeholder="' + escHtml(o.input.ph) + '" aria-label="' + escHtml(o.input.ph) + '" value="' + escHtml(o.input.value || '') + '"><span class="ct"></span></label>' : '')
      + '<div class="acts"><button type="button" class="btn" data-sh="no">취소</button><button type="button" class="btn p" data-sh="ok">' + escHtml(o.ok) + '</button></div></div>';
    flag(r.sheet, 'hidden', false);
    ovS.sheetOn = true;
    ovS.sheetOk = onOk;
    ovS.sheetBack = o.back || null;
    const inp = r.sheet.querySelector('input'), ok = r.sheet.querySelector('[data-sh="ok"]');
    if (inp) {
      let comp = false;
      const ct = r.sheet.querySelector('.ct');
      const sync = () => { const v = inp.value.trim(); ct.textContent = v.length + '/32'; ok.disabled = !v || v.length > 32; };
      inp.addEventListener('compositionstart', () => { comp = true; });
      inp.addEventListener('compositionend', () => { comp = false; sync(); });
      inp.addEventListener('input', sync);
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || comp || e.keyCode === 229) return;
        e.preventDefault();
        if (!ok.disabled) ok.click();
      });
      sync();
      attempt(() => { inp.focus({ preventScroll: true }); inp.select(); });
    } else attempt(() => ok.focus({ preventScroll: true }));
  }
  function ovSheetClick(e) {
    const r = ovS.r;
    if (e.target === r.sheet) { ovSheetClose(); return; } // 칸 바깥(창 안 어두운 곳)
    const b = e.target.closest ? e.target.closest('[data-sh]') : null;
    if (!b || b.disabled) return;
    if (b.dataset.sh === 'no') { ovSheetClose(); return; }
    const fn = ovS.sheetOk, inp = r.sheet.querySelector('input');
    const v = inp ? inp.value.trim() : '';
    if (inp && (!v || v.length > 32)) return;
    ovSheetClose();
    if (typeof fn === 'function') fn(v);
  }
  function ovSheetClose(silent) {
    if (!ovS.sheetOn) return;
    ovS.sheetOn = false;
    ovS.sheetOk = null;
    flag(ovS.r.sheet, 'hidden', true);
    const b = ovS.sheetBack;
    ovS.sheetBack = null;
    if (!silent && b && b.isConnected && !b.disabled) attempt(() => b.focus({ preventScroll: true }));
  }
  function ovFailText(st) {
    if (st === -1) return '새 보관함을 찾지 못했어요. 목록을 새로 불러온 뒤 다시 해 주세요';
    if (st === 0) return '로그인 상태나 연결을 확인해 주세요';
    if (st === 401 || st === 403) return '로그인이 만료됐어요. 새로고침 뒤 다시 해 주세요';
    if (st === 429) return '요청이 많아요. 잠시 뒤에 다시 해 주세요';
    if (st === 400) return '요청이 거절됐어요(이름이나 방을 확인해 주세요)';
    return '오류 ' + st;
  }
  // 새 보관함 id 찾기(만들기 응답에 id가 없을 때만): 보관함 목록 앞 2쪽까지, 이름이 같고 인덱스에 없던 것
  async function ovFindFolder(name, known) {
    let cur = '';
    name = ovClean(name);
    for (let i = 0; i < 2; i++) {
      if (i) await ovSleep(ovK.gap);
      const r = await crackFetch('GET', '/crack-gen/chat-folders?' + (cur ? 'cursor=' + encodeURIComponent(cur) + '&' : '') + 'limit=40');
      const d = r.ok && r.json && r.json.data;
      if (!d || !Array.isArray(d.folders)) return null;
      const f = d.folders.find((x) => x && x._id && !known.has(String(x._id)) && ovClean(x.name) === name);
      if (f) return String(f._id);
      if (!d.nextCursor || d.nextCursor === cur) return null;
      cur = d.nextCursor;
    }
    return null;
  }
  // 적용: 요청 하나에 100개씩, 순서대로 150ms 간격. 끝나면 인덱스를 고치고(chatIndex.patch) 크랙 사이드바를 새로 받는다
  async function ovApply(kind, target, name) {
    if (ovS.busy) return;
    const d = ovPrep();
    if (!d) return;
    let ids = Array.from(ovS.sel).filter((id) => d.fo.has(id));
    if (kind === 'move') ids = ids.filter((id) => d.fo.get(id) !== target);
    if (kind === 'out') ids = ids.filter((id) => d.fo.get(id));
    if (!ids.length) return;
    ovS.busy = true;
    ovBarSync();
    const all = ids.length;
    const done = [];
    let folderId = kind === 'move' ? target : null, fail = null, made = false;
    ovNote('옮기는 중이에요 0/' + all);
    const run = async () => {
      let rest = ids.slice();
      if (kind === 'new') {
        // 크랙 '새 보관함' 창처럼 만들 때는 채팅 목록(미분류) 방만 같이 넣는다. 다른 보관함에 있던 방은 만든 뒤 옮긴다
        const first = rest.filter((id) => !d.fo.get(id)).slice(0, ovK.chunk);
        const known = new Set(d.fname.keys());
        const res = await crackFetch('POST', '/crack-gen/chat-folders', first.length ? { name, chatIds: first } : { name });
        if (!res.ok) { fail = res.status; return; }
        made = true;
        const firstSet = new Set(first);
        rest = rest.filter((id) => !firstSet.has(id));
        done.push(...first);
        const j = res.json && isObj(res.json.data) ? res.json.data : null;
        const f = j && j._id ? j : j && isObj(j.folder) ? j.folder : null;
        folderId = f && f._id ? String(f._id) : null;
        if (!folderId) { await ovSleep(ovK.gap); folderId = await ovFindFolder(name, known); } // 응답에 id가 없으면 보관함 목록 앞쪽에서 찾는다(요청 1~2번)
        if (folderId) ovExtra.set(folderId, { _id: folderId, name, pinnedAt: null, chatCount: first.length, thumbnailImageUrls: [], createdAt: new Date().toISOString() });
        else if (rest.length) { fail = -1; return; } // 만든 보관함 id를 모르면 나머지는 옮기지 않는다
        ovNote('옮기는 중이에요 ' + done.length + '/' + all);
      }
      let sent = kind === 'new';
      while (rest.length) {
        if (sent) await ovSleep(ovK.gap); // 요청 사이 간격. 창을 닫아도 끝까지 옮긴다(결과는 알림으로)
        sent = true;
        const part = rest.splice(0, ovK.chunk);
        const res = await crackFetch('PATCH', '/crack-gen/chat-folders/chats/move', { chatIds: part, targetFolderId: folderId });
        if (!res.ok) { fail = res.status; return; }
        done.push(...part);
        ovNote('옮기는 중이에요 ' + done.length + '/' + all);
      }
    };
    try { await run(); } catch (e) { warn(e); if (fail == null) fail = 0; } // 연결 끊김 등
    ovS.busy = false;
    if (done.length) {
      if (kind === 'new' && !folderId) attempt(() => chatIndex.load({ force: true })); // 새 보관함 id를 끝내 모르면 목록을 다시 받는다
      else attempt(() => chatIndex.patch({ moved: { chatIds: done, folderId } }));
      for (const id of done) ovS.sel.delete(id);
    }
    // 크랙 사이드바(보관함·채팅 목록)를 새로 받는다. 빈 보관함만 만들어진 경우도 보이게
    if (done.length || made) attempt(() => { const p = sideRefresh(); if (p && typeof p.catch === 'function') p.catch(warn); });
    let msg;
    if (kind === 'new') msg = !made ? '보관함을 만들지 못했어요 · ' + ovFailText(fail)
      : done.length ? '\'' + name + '\' 보관함을 만들고 ' + done.length + '개 방을 넣었어요'
        : '\'' + name + '\' 보관함은 만들었지만 방을 넣지 못했어요 · ' + ovFailText(fail);
    else if (!done.length) msg = '옮기지 못했어요 · ' + ovFailText(fail);
    else msg = kind === 'out' ? done.length + '개 방을 채팅 목록으로 뺐어요' : done.length + '개 방을 \'' + name + '\' 보관함으로 옮겼어요';
    if (done.length && done.length < all) msg += ' (' + (all - done.length) + '개는 못 옮겼어요' + (fail != null ? ' · ' + ovFailText(fail) : '') + ')';
    ovNote(done.length ? '' : msg);
    toast(msg, { key: 'cpb-ov-move', duration: done.length === all ? 3200 : 5200 });
    if (ovS.open) { ovBarSync(); ovRender(); }
  }

  // ── 이벤트 연결 ──
  on('chatindex', () => { ovRev++; ovSoon(); });
  on('chatindex:progress', () => { if (ovD.open) ovDropStatus(); if (ovS.open) ovWinStatus(); });
  on('sidebar', () => ovEnsure());
  on('route', () => { ovDropClose(); if (ovS.open) ovSoon(); });
  on('region:close', (p) => { if (p && p.name === 'left') ovDropClose(); });
  on('settings', (p) => {
    const k = p && p.key != null ? String(p.key) : '';
    if (k !== '*' && k !== 'chatlist' && k.indexOf('chatlist.') !== 0) return;
    ovEnsure();
    if (!clOn('on') || !clOn('search')) ovDropClose();
    else if (ovD.open) { ovD.key = ''; ovDropRender(); }
    if (ovS.open) {
      if (!clOn('on') || !clOn('overview')) ovClose();
      else ovRender();
    }
  });
  // 바깥을 누르면 검색 결과 칸을 닫는다. 창 안 색 팝업·보관함 고르기도 바깥을 누르면 닫는다.
  // 결과 칸이나 창이 열려 있을 때만 문서에 리스너를 붙이고, 둘 다 닫히면 뗀다(평소에는 리스너 0개)
  function ovOutside(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    if (ovD.open && !(ovL.el && ovL.el.contains(t)) && !(ovD.el && ovD.el.contains(t))) ovDropClose();
    if (ovS.open) {
      if (ovS.popId && !t.closest('#cpb-ov-win .pop, #cpb-ov-win .tile .more')) ovPopClose(false);
      if (ovS.pickOn && !t.closest('#cpb-ov-win .pick, #cpb-ov-win .bar [data-act="move"]')) ovPickClose(false);
    }
  }
  function ovResize() {
    if (ovD.open) ovDropPlaceSoon();
    if (ovS.open) { ovPopClose(false); ovPickClose(false); }
  }
  let ovListening = false;
  function ovListen() {
    const want = !!(ovD.open || ovS.open);
    if (want === ovListening) return;
    ovListening = want;
    if (want) { document.addEventListener('pointerdown', ovOutside, true); window.addEventListener('resize', ovResize, { passive: true }); }
    else { document.removeEventListener('pointerdown', ovOutside, true); window.removeEventListener('resize', ovResize); }
  }
  // 옛 '채팅 목록 튜너'의 한눈에 보기 방식(카드/촘촘히)을 한 번만 옮긴다. 이미 우리 쪽에서 정했으면 그대로
  migrateOnce('ovView', () => {
    const v = localStorage.getItem('crackTunerLoungeView_v1');
    const saved = readJSON(SETTINGS_KEY);
    if (v !== 'dense' || (isObj(saved) && isObj(saved.chatlist) && saved.chatlist.view)) return;
    pathSet(conf, 'chatlist.view', 'dense');
    writeJSON(SETTINGS_KEY, conf);
  });

  // ── CSS(사이트 전역: 사이드바가 있는 모든 화면) ──
  const ovColorCss = Object.keys(ovCVal).map((k) => {
    const sel = ':is(#cpb-ov-win,#cpb-ov-drop) [data-c="' + k + '"]';
    return sel + '{--cpb-c:' + ovCVal[k][0] + '}body[data-theme=light] ' + sel + '{--cpb-c:' + ovCVal[k][1] + '}';
  }).join('\n');
  const ovCss = `
.cpb-ov-line,#cpb-ov-drop,#cpb-ov-win{--ov-ease:cubic-bezier(.2,.8,.2,1);--ov-spring:cubic-bezier(.34,1.5,.64,1);--ov-bg:var(--bg_screen,#fff);--ov-tx:var(--text_primary,#1a1918);--ov-tx2:var(--text_secondary,#61605a);--ov-tx3:var(--text_tertiary,#85837d);--ov-line:var(--outline_tertiary,rgba(128,128,128,.2));--ov-line2:var(--outline_secondary,rgba(128,128,128,.32));--ov-hover:var(--state_hover,rgba(128,128,128,.12));--ov-field:color-mix(in srgb,var(--text_primary,#1a1918) 6%,transparent);--ov-sunk:color-mix(in srgb,var(--text_primary,#1a1918) 7%,transparent);--ov-canvas:color-mix(in srgb,var(--text_primary,#1a1918) 3%,var(--bg_screen,#fff));--ov-ink:var(--text_primary,#1a1918);--ov-ink-fg:var(--bg_screen,#fff);--ov-cur:color-mix(in srgb,var(--text_primary,#1a1918) 7%,transparent);--ov-ring:color-mix(in srgb,var(--text_primary,#1a1918) 12%,transparent);--ov-shadow:0 16px 40px rgba(20,16,40,.14),0 2px 6px rgba(20,16,40,.06);--ov-shadow-lg:0 30px 70px rgba(20,16,40,.22);--ov-lift:0 10px 24px -14px rgba(20,16,40,.35);--ov-scrim:rgba(24,24,27,.32)}
body[data-theme=dark] :is(.cpb-ov-line,#cpb-ov-drop,#cpb-ov-win){--ov-shadow:0 16px 40px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.3);--ov-shadow-lg:0 30px 80px rgba(0,0,0,.6);--ov-lift:0 10px 24px -12px rgba(0,0,0,.7);--ov-scrim:rgba(6,6,8,.58)}
${ovColorCss}
@keyframes cpb-ov-in{from{opacity:0;transform:translateY(6px)}}
@keyframes cpb-ov-fade{from{opacity:0}}
@keyframes cpb-ov-pop{from{opacity:0;transform:translateY(10px) scale(.985)}}
/* 검색 줄: 사이드바 Header 안, 보관함 칸 바로 위 */
.cpb-ov-line{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0;margin:0 2px 0 0;color:var(--ov-tx);font-size:13px;line-height:1.35}
.cpb-ov-line.alone{margin:8px 10px 6px 8px}
.cpb-ov-line [hidden]{display:none!important}
.cpb-ov-line .box{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:36px;box-sizing:border-box;padding:0 6px 0 11px;border-radius:11px;background:var(--ov-field)}
.cpb-ov-line .box:focus-within{background:var(--ov-bg);box-shadow:0 0 0 1px var(--ov-line2),0 0 0 4px var(--ov-ring)}
.cpb-ov-line .ic{display:flex;flex:none;color:var(--ov-tx3);transition:transform .22s var(--ov-spring)}
.cpb-ov-line .box:focus-within .ic{color:var(--ov-tx);transform:scale(1.1)}
.cpb-ov-line input{flex:1;width:100%;min-width:0;height:100%;margin:0;padding:0;border:0;outline:0;background:transparent;color:var(--ov-tx);font:inherit;font-size:13px}
.cpb-ov-line input::placeholder{color:var(--ov-tx3)}
:is(.cpb-ov-line,#cpb-ov-win) .clr{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ov-tx2);cursor:pointer;opacity:0;pointer-events:none;transform:scale(.6);transition:opacity .14s,transform .22s var(--ov-spring)}
:is(.cpb-ov-line,#cpb-ov-win) .clr[data-on]{opacity:1;pointer-events:auto;transform:none}
:is(.cpb-ov-line,#cpb-ov-win) .clr:hover{background:var(--ov-hover);color:var(--ov-tx)}
.cpb-ov-line .grid{display:grid;place-items:center;flex:none;width:36px;height:36px;padding:0;border:0;border-radius:11px;background:var(--ov-field);color:var(--ov-tx);cursor:pointer;transition:transform .12s}
.cpb-ov-line .grid:hover,.cpb-ov-line .grid[aria-expanded="true"]{background:var(--ov-hover)}
.cpb-ov-line .grid:active{transform:scale(.94)}
.cpb-ov-line .grid:focus-visible{outline:2px solid var(--ov-ink);outline-offset:2px}
.cpb-ov-line .grid rect{transition:transform .3s var(--ov-spring)}
.cpb-ov-line .grid:hover .g1{transform:translate(-1.3px,-1.3px)}
.cpb-ov-line .grid:hover .g2{transform:translate(1.3px,-1.3px)}
.cpb-ov-line .grid:hover .g3{transform:translate(-1.3px,1.3px)}
.cpb-ov-line .grid:hover .g4{transform:translate(1.3px,1.3px)}
/* 검색 결과 칸: 사이드바 폭, 검색 줄 아래~사이드바 끝 */
#cpb-ov-drop{position:fixed;z-index:2147483000;box-sizing:border-box;padding:2px 10px 32px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;background:var(--ov-bg);color:var(--ov-tx);font-size:13px;line-height:1.35;animation:cpb-ov-in .2s var(--ov-ease) both}
#cpb-ov-drop *{box-sizing:border-box}
#cpb-ov-drop .st{display:flex;align-items:center;gap:8px;min-height:15px;margin:6px 4px 4px;font-size:11px;color:var(--ov-tx3)}
:is(#cpb-ov-drop,#cpb-ov-win) .rt{flex:none;padding:2px 9px;border:1px solid var(--ov-line2);border-radius:999px;background:transparent;color:var(--ov-tx2);font:inherit;font-size:11px;cursor:pointer}
:is(#cpb-ov-drop,#cpb-ov-win) .rt:hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-drop .res{display:flex;flex-direction:column;gap:2px}
#cpb-ov-drop .gh{display:flex;align-items:center;gap:6px;margin:12px 4px 6px;color:var(--ov-tx2);font-size:11.5px;font-weight:650}
#cpb-ov-drop .gh:first-child{margin-top:4px}
#cpb-ov-drop .gh svg{flex:none;width:13px;height:13px;color:var(--ov-tx3)}
#cpb-ov-drop .gh span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#cpb-ov-drop .gh em{flex:none;font-style:normal;font-weight:600;color:var(--ov-tx3);font-variant-numeric:tabular-nums}
#cpb-ov-drop .it{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border-radius:11px;color:inherit;text-decoration:none;cursor:pointer}
#cpb-ov-drop .it:hover,#cpb-ov-drop .it[aria-selected="true"]{background:var(--ov-hover)}
#cpb-ov-drop .it[aria-selected="true"]{box-shadow:inset 0 0 0 1px var(--ov-line2)}
#cpb-ov-drop .it[data-c]{background:color-mix(in srgb,var(--cpb-c) 12%,transparent)}
#cpb-ov-drop .it[data-c]:hover,#cpb-ov-drop .it[data-c][aria-selected="true"]{background:color-mix(in srgb,var(--cpb-c) 20%,transparent)}
#cpb-ov-drop .th{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;overflow:hidden;background:var(--ov-sunk);color:var(--ov-tx2);font-size:12px;font-weight:700}
#cpb-ov-drop .it[data-c] .th{outline:2px solid var(--cpb-c);outline-offset:2px}
:is(#cpb-ov-drop,#cpb-ov-win) .th img{display:block;width:100%;height:100%;object-fit:cover}
#cpb-ov-drop .mn{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
#cpb-ov-drop .tt{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;font-weight:640}
#cpb-ov-drop .it[data-cur] .tt{font-weight:760}
#cpb-ov-drop .pv{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:1.4;color:var(--ov-tx2)}
#cpb-ov-drop .sb{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;color:var(--ov-tx3)}
#cpb-ov-drop .chip{flex:none;max-width:84px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:2px 7px;border-radius:999px;background:var(--ov-sunk);color:var(--ov-tx2);font-size:10.5px;font-weight:600}
:is(#cpb-ov-drop,#cpb-ov-win) .now{display:inline-block;margin-right:5px;padding:1px 6px;border-radius:999px;background:var(--ov-ink);color:var(--ov-ink-fg);font-size:10px;font-weight:700;font-style:normal;line-height:1.4;vertical-align:1px}
/* 한눈에 보기 창 */
#cpb-ov-win{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:stretch;justify-content:center;padding:20px;box-sizing:border-box;background:var(--ov-scrim);color:var(--ov-tx);font-size:13px;line-height:1.4;animation:cpb-ov-fade .18s ease both}
#cpb-ov-win *{box-sizing:border-box}
#cpb-ov-win button{font-family:inherit}
#cpb-ov-win .win{position:relative;flex:1 1 auto;max-width:1600px;min-width:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);border:1px solid var(--ov-line2);border-radius:18px;background:var(--ov-canvas);box-shadow:var(--ov-shadow-lg);overflow:hidden;outline:0;container-type:inline-size;animation:cpb-ov-pop .26s var(--ov-ease) both}
#cpb-ov-win .trap{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none}
#cpb-ov-win .top{grid-row:1}
#cpb-ov-win .bar{grid-row:2}
#cpb-ov-win .body{grid-row:3}
#cpb-ov-win .top{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:12px 16px;border-bottom:1px solid var(--ov-line);background:var(--ov-bg)}
#cpb-ov-win .ib{display:grid;place-items:center;flex:none;width:36px;height:36px;padding:0;border:0;border-radius:11px;background:var(--ov-field);color:var(--ov-tx);cursor:pointer;transition:transform .12s}
#cpb-ov-win .ib:hover{background:var(--ov-hover)}
#cpb-ov-win .ib:active{transform:scale(.94)}
#cpb-ov-win .hd{display:flex;align-items:baseline;gap:8px;margin-right:4px}
#cpb-ov-win .hd strong{font-size:17px;font-weight:780;letter-spacing:-.025em}
#cpb-ov-win .hd em{font-style:normal;font-size:12px;color:var(--ov-tx3);font-variant-numeric:tabular-nums}
#cpb-ov-win .sch{flex:1 1 180px;max-width:320px;min-width:0;display:flex;align-items:center;gap:8px;height:36px;padding:0 6px 0 11px;border-radius:11px;background:var(--ov-field)}
#cpb-ov-win .sch:focus-within{background:var(--ov-bg);box-shadow:0 0 0 1px var(--ov-line2),0 0 0 4px var(--ov-ring)}
#cpb-ov-win .sch>svg{flex:none;color:var(--ov-tx3)}
#cpb-ov-win .sch input,#cpb-ov-win .pf input,#cpb-ov-win .fld input{flex:1;min-width:0;height:100%;margin:0;padding:0;border:0;outline:0;background:transparent;color:var(--ov-tx);font:inherit;font-size:13px}
#cpb-ov-win input::placeholder{color:var(--ov-tx3)}
#cpb-ov-win .cf{display:flex;align-items:center;gap:9px;padding:3px 10px 3px 3px;border-radius:999px;background:var(--ov-sunk)}
#cpb-ov-win .cf button{padding:0;border:0;cursor:pointer}
#cpb-ov-win .cf .all{height:26px;padding:0 11px;border-radius:999px;background:transparent;color:var(--ov-tx2);font-size:11.5px;font-weight:680}
#cpb-ov-win .cf .all[aria-pressed="true"]{background:var(--ov-bg);color:var(--ov-tx);box-shadow:0 0 0 1px var(--ov-line)}
#cpb-ov-win .cf .dot{width:16px;height:16px;border-radius:50%;background:var(--cpb-c);outline:2px solid transparent;outline-offset:0;transition:transform .2s var(--ov-spring)}
#cpb-ov-win .cf .dot:hover{transform:scale(1.15)}
#cpb-ov-win .cf .dot[aria-pressed="true"]{outline-color:var(--cpb-c);outline-offset:2px}
#cpb-ov-win .tools{display:flex;align-items:center;gap:6px;margin-left:auto}
#cpb-ov-win .seg{position:relative;display:grid;grid-template-columns:repeat(2,1fr);padding:3px;border-radius:10px;background:var(--ov-sunk);isolation:isolate}
#cpb-ov-win .seg>i{position:absolute;z-index:-1;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/2);border-radius:7px;background:var(--ov-bg);box-shadow:0 1px 3px rgba(0,0,0,.14),0 0 0 1px var(--ov-line);transition:transform .3s var(--ov-ease)}
#cpb-ov-win[data-view="dense"] .seg>i{transform:translateX(100%)}
#cpb-ov-win .seg button{padding:6px 11px;border:0;border-radius:7px;background:transparent;color:var(--ov-tx2);font-size:12px;font-weight:640;white-space:nowrap;cursor:pointer}
#cpb-ov-win .seg button[aria-pressed="true"]{color:var(--ov-tx)}
#cpb-ov-win .qa{display:flex;align-items:center;gap:4px;padding:3px;border-radius:10px;background:var(--ov-sunk)}
#cpb-ov-win .qa button{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ov-tx2);cursor:pointer;transition:transform .12s}
#cpb-ov-win .qa button:hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win .qa button:active{transform:scale(.94)}
#cpb-ov-win .qa button:disabled{opacity:.4;cursor:default;transform:none}
#cpb-ov-win .qa button[aria-pressed="true"]{background:var(--ov-bg);color:var(--ov-tx);box-shadow:0 1px 3px rgba(0,0,0,.14),0 0 0 1px var(--ov-line)}
#cpb-ov-win:not([data-multi]) .qa .sel{display:none}
#cpb-ov-win[data-nocolor] :is(.cf,.tile .more){display:none}
#cpb-ov-win .bar{display:none;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 16px;border-bottom:1px solid var(--ov-line);background:var(--ov-bg)}
#cpb-ov-win[data-selecting] .bar{display:flex}
#cpb-ov-win .bar .cnt{font-size:12.5px;font-weight:650;font-variant-numeric:tabular-nums}
#cpb-ov-win .bar .note{font-size:12px;color:var(--ov-tx3)}
#cpb-ov-win .bar .sp{flex:1}
#cpb-ov-win .btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:1px solid var(--ov-line2);border-radius:9px;background:var(--ov-bg);color:var(--ov-tx);font-size:12.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:transform .12s}
#cpb-ov-win .btn svg{flex:none}
#cpb-ov-win .btn:hover{background:var(--ov-hover)}
#cpb-ov-win .btn:active{transform:translateY(1px)}
#cpb-ov-win .btn:disabled{opacity:.45;cursor:default;transform:none}
#cpb-ov-win .btn.p{border-color:transparent;background:var(--ov-ink);color:var(--ov-ink-fg)}
#cpb-ov-win .btn.p:hover:not(:disabled){background:color-mix(in srgb,var(--ov-ink) 86%,var(--ov-bg))}
#cpb-ov-win .body{display:grid;grid-template-columns:200px minmax(0,1fr);grid-template-rows:minmax(0,1fr);min-height:0}
#cpb-ov-win .rail{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 8px;border-right:1px solid var(--ov-line);background:var(--ov-bg);scrollbar-width:thin}
#cpb-ov-win :is(.rb,.pi){display:flex;align-items:center;gap:9px;width:100%;height:34px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:var(--ov-tx2);font-size:12.5px;font-weight:620;text-align:left;cursor:pointer}
#cpb-ov-win :is(.rb,.pi):hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win .rb[aria-current="true"]{background:var(--ov-cur);color:var(--ov-tx)}
#cpb-ov-win .ri{display:grid;place-items:center;flex:none;color:var(--ov-tx3)}
#cpb-ov-win .rb[aria-current="true"] .ri{color:var(--ov-tx)}
#cpb-ov-win :is(.rb,.pi) em{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-style:normal}
#cpb-ov-win :is(.rb,.pi) b{flex:none;color:var(--ov-tx3);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
#cpb-ov-win .pi[hidden]{display:none}
#cpb-ov-win .rh{display:flex;gap:6px;margin:16px 10px 6px;color:var(--ov-tx3);font-size:11px;font-weight:600}
#cpb-ov-win .rh b{font-weight:600;font-variant-numeric:tabular-nums}
#cpb-ov-win .scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 56px;scrollbar-width:thin}
#cpb-ov-win .st{display:flex;align-items:center;gap:8px;margin:0 2px 14px;color:var(--ov-tx3);font-size:11.5px}
#cpb-ov-win :is(.st,.empty,.pop,.pick,.sheet,.mb)[hidden]{display:none}
#cpb-ov-win .grp{content-visibility:auto;contain-intrinsic-size:auto 420px}
#cpb-ov-win .gh{display:flex;align-items:center;gap:8px;margin:22px 2px 10px;font-size:13px;letter-spacing:-.01em}
#cpb-ov-win .grp:first-child .gh{margin-top:0}
#cpb-ov-win .gh .gi{display:grid;place-items:center;color:var(--ov-tx3)}
#cpb-ov-win .gh strong{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:740}
#cpb-ov-win .gh em{flex:none;font-style:normal;color:var(--ov-tx3);font-weight:600;font-size:11.5px;font-variant-numeric:tabular-nums}
#cpb-ov-win .gsel{display:none;margin-left:auto;padding:3px 10px;border:1px solid var(--ov-line2);border-radius:999px;background:transparent;color:var(--ov-tx2);font-size:11.5px;font-weight:600;cursor:pointer}
#cpb-ov-win .gsel:hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win[data-selecting] .gsel{display:inline-block}
#cpb-ov-win .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
#cpb-ov-win .tile{position:relative;display:flex;align-items:center;gap:11px;min-width:0;padding:10px 10px 10px 11px;border:1px solid var(--ov-line);border-radius:13px;background:var(--ov-bg);cursor:pointer;outline:0;transition:transform .24s var(--ov-ease)}
#cpb-ov-win .tile:hover,#cpb-ov-win .tile[data-menu]{border-color:var(--ov-line2);transform:translateY(-2px);box-shadow:var(--ov-lift)}
#cpb-ov-win .tile:active{transform:translateY(0) scale(.99)}
#cpb-ov-win .tile:focus-visible{box-shadow:0 0 0 2px var(--ov-ink)}
#cpb-ov-win .tile[data-c]{background:color-mix(in srgb,var(--cpb-c) 14%,var(--ov-bg))}
#cpb-ov-win .tile[data-cur]{border-color:var(--ov-ink);box-shadow:0 0 0 1px var(--ov-ink)}
#cpb-ov-win .th{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:50%;overflow:hidden;background:var(--ov-sunk);color:var(--ov-tx2);font-size:13px;font-weight:700;outline:2px solid transparent;outline-offset:0}
#cpb-ov-win .tile[data-c] .th{outline-color:var(--cpb-c);outline-offset:2px}
#cpb-ov-win .mn{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
#cpb-ov-win :is(.tt,.sn,.pv){overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
#cpb-ov-win .tt{font-size:13px;font-weight:620;letter-spacing:-.01em}
#cpb-ov-win .tile[data-cur] .tt{font-weight:760}
#cpb-ov-win .sn{color:var(--ov-tx2);font-size:11.5px}
#cpb-ov-win .sn:empty{display:none}
#cpb-ov-win .pv{color:var(--ov-tx3);font-size:11.5px}
#cpb-ov-win .pv:empty{display:none}
#cpb-ov-win .dt{align-self:flex-start;flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:5px;margin-top:1px;color:var(--ov-tx3);font-size:10.5px;white-space:nowrap}
#cpb-ov-win .dt .d{transition:opacity .14s}
#cpb-ov-win .tile:not([data-cur]) .now{display:none}
#cpb-ov-win .dt .now{margin:0}
#cpb-ov-win:not([data-selecting]):not([data-nocolor]) .tile:is(:hover,:focus-within,[data-menu]) .dt .d{opacity:0}
#cpb-ov-win .more{position:absolute;top:7px;right:6px;width:24px;height:24px;display:grid;place-items:center;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ov-tx2);cursor:pointer;opacity:0;transition:opacity .14s}
#cpb-ov-win .tile:is(:hover,:focus-within,[data-menu]) .more{opacity:1}
#cpb-ov-win .more:hover,#cpb-ov-win .tile[data-menu] .more{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win .pk{display:none;place-items:center;flex:none;width:22px;height:22px;color:var(--ov-tx3)}
#cpb-ov-win[data-selecting] .pk{display:grid}
#cpb-ov-win[data-selecting] .more{display:none}
#cpb-ov-win[data-selecting] .tile[data-sel]{border-color:var(--ov-ink);background:var(--ov-cur)}
#cpb-ov-win .ck rect{fill:none;stroke:currentColor;stroke-width:1.8}
#cpb-ov-win .ck path{fill:none;stroke:var(--ov-ink-fg);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:0;transform-box:fill-box;transform-origin:center;transform:scale(.6);transition:opacity .14s,transform .2s var(--ov-spring)}
#cpb-ov-win .tile[data-sel] .pk{color:var(--ov-ink)}
#cpb-ov-win .tile[data-sel] .ck rect{fill:var(--ov-ink);stroke:var(--ov-ink)}
#cpb-ov-win .tile[data-sel] .ck path{opacity:1;transform:none}
#cpb-ov-win .mb{display:block;margin:10px auto 0;padding:7px 14px;border:1px solid var(--ov-line2);border-radius:999px;background:transparent;color:var(--ov-tx2);font-size:12px;font-weight:640;cursor:pointer}
#cpb-ov-win .mb:hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win .empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 20px;color:var(--ov-tx2);font-size:13px;line-height:1.7;text-align:center}
/* 촘촘히 */
#cpb-ov-win[data-view="dense"] .grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:2px 10px}
#cpb-ov-win[data-view="dense"] .tile{padding:5px 8px;border-color:transparent;border-radius:9px;background:transparent;transform:none;box-shadow:none}
#cpb-ov-win[data-view="dense"] .tile:is(:hover,[data-menu]){background:var(--ov-hover);transform:none;box-shadow:none}
#cpb-ov-win[data-view="dense"] .tile[data-c]{background:color-mix(in srgb,var(--cpb-c) 12%,transparent)}
#cpb-ov-win[data-view="dense"] .tile[data-cur]{background:var(--ov-cur);box-shadow:inset 0 0 0 1px var(--ov-line2)}
#cpb-ov-win[data-view="dense"][data-selecting] .tile[data-sel]{background:var(--ov-cur);box-shadow:inset 0 0 0 1px var(--ov-ink)}
#cpb-ov-win[data-view="dense"] .th{width:26px;height:26px;font-size:11px}
#cpb-ov-win[data-view="dense"] .tile[data-c] .th{outline-offset:1.5px}
#cpb-ov-win[data-view="dense"] .mn{flex-direction:row;align-items:baseline;gap:6px}
#cpb-ov-win[data-view="dense"] .tt{flex:0 1 auto;font-size:12.5px}
#cpb-ov-win[data-view="dense"] .sn{flex:1 1 0;min-width:0;color:var(--ov-tx3);font-size:11px}
#cpb-ov-win[data-view="dense"] .pv{display:none}
#cpb-ov-win[data-view="dense"] .dt{align-self:center;flex-direction:row;margin:0}
#cpb-ov-win[data-view="dense"] .more{top:50%;margin-top:-12px}
/* 색 팝업 · 보관함 고르기 · 확인 칸 */
#cpb-ov-win .pop{position:absolute;z-index:6;display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--ov-line2);border-radius:12px;background:var(--ov-bg);box-shadow:var(--ov-shadow);animation:cpb-ov-in .16s var(--ov-ease)}
#cpb-ov-win .pop .lb{margin-right:2px;color:var(--ov-tx3);font-size:11.5px}
#cpb-ov-win .pop .dot{display:grid;place-items:center;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:var(--cpb-c);cursor:pointer;outline:2px solid transparent;outline-offset:0;transition:transform .18s var(--ov-spring)}
#cpb-ov-win .pop .dot:hover{transform:scale(1.18)}
#cpb-ov-win .pop .dot[aria-checked="true"]{outline-color:var(--cpb-c);outline-offset:2px}
#cpb-ov-win .pop .dot[aria-checked="true"]::after{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
#cpb-ov-win .pop .nc{display:grid;place-items:center;width:24px;height:24px;margin-left:2px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--ov-tx3);cursor:pointer}
#cpb-ov-win .pop .nc:hover{background:var(--ov-hover);color:var(--ov-tx)}
#cpb-ov-win .pick{position:absolute;z-index:6;width:280px;max-height:min(380px,70vh);display:flex;flex-direction:column;padding:6px;border:1px solid var(--ov-line2);border-radius:12px;background:var(--ov-bg);box-shadow:var(--ov-shadow);animation:cpb-ov-in .16s var(--ov-ease)}
#cpb-ov-win .pf{display:flex;align-items:center;gap:7px;flex:none;height:32px;margin:2px 2px 6px;padding:0 9px;border-radius:9px;background:var(--ov-field);color:var(--ov-tx3)}
#cpb-ov-win .pl{min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
#cpb-ov-win .pe{padding:14px 10px;color:var(--ov-tx3);font-size:12px}
#cpb-ov-win .sheet{position:absolute;inset:0;z-index:8;display:grid;place-items:center;padding:16px;background:var(--ov-scrim);animation:cpb-ov-fade .15s ease}
#cpb-ov-win .card{width:min(420px,100%);display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid var(--ov-line2);border-radius:16px;background:var(--ov-bg);box-shadow:var(--ov-shadow-lg);animation:cpb-ov-pop .22s var(--ov-ease)}
#cpb-ov-win .card>b{font-size:15px;font-weight:760}
#cpb-ov-win .card p{margin:0;color:var(--ov-tx2);font-size:13px;line-height:1.55}
#cpb-ov-win .fld{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border:1px solid var(--ov-line2);border-radius:10px;background:var(--ov-field)}
#cpb-ov-win .fld:focus-within{background:var(--ov-bg);box-shadow:0 0 0 4px var(--ov-ring)}
#cpb-ov-win .fld .ct{flex:none;color:var(--ov-tx3);font-size:11px;font-variant-numeric:tabular-nums}
#cpb-ov-win .acts{display:flex;justify-content:flex-end;gap:8px}
#cpb-ov-win :is(button,.tile,[tabindex]):focus-visible{outline:2px solid var(--ov-ink);outline-offset:2px}
#cpb-ov-win .win:focus-visible{outline:0}
@container (max-width:760px){
#cpb-ov-win .body{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
#cpb-ov-win .rail{display:flex;gap:4px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid var(--ov-line);padding:8px 10px}
#cpb-ov-win .rb{width:auto;flex:none;max-width:200px}
#cpb-ov-win .rh{display:none}
#cpb-ov-win .tools{margin-left:0}
}
/* 창이 열린 동안 알림(토스트)이 창 위에 보이게 */
body:has(> #cpb-ov-win) #cpb-toasts{z-index:2147483600}
@media (prefers-reduced-motion: reduce){.cpb-ov-line *,#cpb-ov-drop,#cpb-ov-drop *,#cpb-ov-win,#cpb-ov-win *{animation:none!important;transition:none!important}}
`;
  siteCss('chatlist-ov', ovCss);

  // ===== cl-merge.js =====
  // ── 같은 이름 보관함에 합치기('채팅 목록' ⋯ 메뉴, 옛 튜너의 '스마트 자동 정리') ──────────────
  // 크랙 자동 정리는 작품마다 새 보관함을 만든다("기존 생성된 보관함은 유지") → 같은 이름 보관함이 또 생긴다.
  // 여기서는 크랙 자동 정리 미리보기(작품별 묶음)를 받아, 이름이 같은 기존 보관함이 있으면 그리로 옮기고 없으면 새로 만든다.
  // 요청은 창을 열 때(미리보기 만들기 1번 + 미리보기 목록 + 보관함 목록)와 '정리'를 누를 때(고른 줄의 방 목록 → 옮기기/만들기)만,
  // 하나씩 차례로 사이를 두고 보낸다. 크랙 메뉴는 트리거의 React onPointerDown(triggerToggle)으로 닫는다(가짜 키 이벤트 없음).
  const MG_PV = '/crack-gen/chat-folders/auto-organize/preview';
  const MG_GAP = 120; // 요청 사이 간격(ms)
  const MG_CHUNK = 100; // 한 번에 옮기는 방 수(요청당 상한이 확인되지 않아 나눠 보낸다)
  const MG_NAME_MAX = 32; // 크랙 보관함 이름 최대 길이
  const MG_STEPS = ['불러오기', '검토', '적용', '완료'];
  const mgOn = () => clOn('on') && clOn('smart');
  const mgSingleOn = () => isObj(conf.chatlist) && conf.chatlist.smartSingle === true; // 기본 꺼짐
  const mgSleep = (ms) => new Promise((res) => setTimeout(res, ms));
  // 공용 채팅 인덱스·사이드바 새로고침(통합 때 들어오는 것). 없거나 아직 선언 전이어도 멈추지 않게 typeof + try
  function mgIndex() { try { return typeof chatIndex !== 'undefined' && chatIndex && typeof chatIndex.get === 'function' ? chatIndex : null; } catch (_) { return null; } }
  function mgCanRefresh() { try { return typeof sideRefresh === 'function'; } catch (_) { return false; } }
  function mgSideRefresh() {
    let p = null;
    try { if (typeof sideRefresh === 'function') p = sideRefresh(); } catch (_) { p = null; }
    return Promise.resolve(p).catch(() => null);
  }
  // 이름 비교: NFKC → 보이지 않는 글자 지우기 → 공백 하나로 → 소문자. 크랙 안내대로 띄어쓰기는 무시한다(비교 키 = 공백을 모두 뺀 것)
  const mgNorm = (s) => String(s == null ? '' : s).normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const mgNameKey = (s) => mgNorm(s).replace(/ /g, '');
  const mgClean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  // 새 보관함 이름은 32자까지(크랙 만들기 창 maxLength와 같은 UTF-16 길이). 이모지를 반으로 자르지 않게 글자 단위로
  function mgCut(name) {
    const s = mgClean(name);
    if (s.length <= MG_NAME_MAX) return s;
    let out = '';
    for (const ch of s) { if (out.length + ch.length > MG_NAME_MAX) break; out += ch; }
    return out.trim();
  }
  const mgImgOf = (o) => {
    const p = o && (o.portraitImage || o.profileImage);
    const u = p && (p.w200 || p.w400 || p.origin);
    return typeof u === 'string' && /^https:\/\//.test(u) ? u : '';
  };
  function mgDate(v) {
    const d = v ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
  }
  const mgChunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };

  const MG_SPARK = '<svg class="mg-spark" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path class="mg-s1" d="M11 3C11.6 7.6 14.4 10.4 19 11C14.4 11.6 11.6 14.4 11 19C10.4 14.4 7.6 11.6 3 11C7.6 10.4 10.4 7.6 11 3Z"/><path class="mg-s2" d="M19 1.8C19.2 3.2 19.8 3.8 21.2 4C19.8 4.2 19.2 4.8 19 6.2C18.8 4.8 18.2 4.2 16.8 4C18.2 3.8 18.8 3.2 19 1.8Z"/><path class="mg-s3" d="M20 17.5C20.1 18.4 20.6 18.9 21.5 19C20.6 19.1 20.1 19.6 20 20.5C19.9 19.6 19.4 19.1 18.5 19C19.4 18.9 19.9 18.4 20 17.5Z"/></svg>';
  const MG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  const MG_FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  const MG_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
  const MG_DONE = '<svg class="mg-ok" viewBox="0 0 52 52" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M16 27l7 7 14-15"/></svg>';
  const MG_TICK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5"/></svg>';
  const MG_XS = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5"/></svg>';

  // ── 요청 ──
  // 실패는 {status, msg(한국어)}로 던진다. status: 0 = 로그인 안 됨, -1 = 연결 끊김, -2 = 응답 없음, -9 = 우리 쪽 판단
  function mgFail(status, json, preview) {
    const e = new Error('mg:' + status);
    e.status = status;
    const sm = json && (typeof json.message === 'string' ? json.message : isObj(json.error) && typeof json.error.message === 'string' ? json.error.message : '');
    e.msg = status === 0 ? '로그인이 필요해요. 크랙에 로그인한 뒤 다시 시도해 주세요.'
      : status === -1 ? '연결이 끊겼어요. 잠시 뒤 다시 시도해 주세요.'
      : status === -2 ? '응답이 너무 늦어요. 잠시 뒤 다시 시도해 주세요.'
      : status === 401 ? '로그인이 만료됐어요. 새로고침한 뒤 다시 시도해 주세요.'
      : status === 429 ? '요청이 많아 잠시 막혔어요. 조금 뒤 다시 시도해 주세요.'
      : status === 400 && preview ? '미리보기가 만료되었어요. 다시 시도해 주세요.'
      : sm && sm.length <= 120 && /[가-힣]/.test(sm) ? sm // 크랙이 준 한국어 문구만 그대로
      : '요청이 실패했어요 (' + status + ')';
    return e;
  }
  const mgPlain = (msg) => { const e = new Error(msg); e.status = -9; e.msg = msg; return e; };
  // 크랙 API 한 번. 429면 1.5초 쉬고 한 번만 다시. 응답이 오래 없으면 기다리지 않고 실패로 본다
  async function mgReq(method, path, body, preview) {
    for (let i = 0; ; i++) {
      let r = null;
      try {
        r = await Promise.race([crackFetch(method, path, body), mgSleep(method === 'GET' ? 20000 : 30000).then(() => null)]);
      } catch (_) { throw mgFail(-1, null, false); }
      if (!r) throw mgFail(-2, null, false);
      if (r.ok) return isObj(r.json) ? r.json : {};
      if (r.status === 429 && i === 0) { await mgSleep(1500); continue; }
      throw mgFail(r.status, r.json, preview);
    }
  }
  // 커서 페이지를 끝까지(한 페이지 40개, 사이 120ms). live()가 false면 멈춘다
  async function mgPages(path, params, pick, preview, onPage, live) {
    const out = [];
    const seen = new Set();
    let cursor = '';
    for (let n = 0; n < 100; n++) {
      const q = new URLSearchParams(params);
      if (cursor) q.set('cursor', cursor);
      q.set('limit', '40');
      const j = await mgReq('GET', path + '?' + q.toString(), undefined, preview);
      const d = isObj(j.data) ? j.data : {};
      const list = pick(d);
      if (Array.isArray(list)) for (const x of list) if (x) out.push(x);
      cursor = d.nextCursor ? String(d.nextCursor) : '';
      if (!cursor || seen.has(cursor) || (live && !live())) break;
      seen.add(cursor);
      if (onPage) onPage(out.length);
      await mgSleep(MG_GAP);
    }
    return out;
  }
  // 보관함 목록: 크랙이 스스로 받은 첫 페이지(다음 페이지가 없으면 = 전부)를 엿들어 둔다. 보관함을 바꾸는 요청이 지나가면 버린다
  let mgHeard = null; // {at, folders}
  function mgOnFoldersXhr(method, url, status, json) {
    if (method !== 'GET') { mgHeard = null; return; }
    if (status !== 200 || !json || !isObj(json.data) || !Array.isArray(json.data.folders) || json.data.nextCursor) return;
    let u = null;
    try { u = new URL(url, location.origin); } catch (_) { return; }
    if (!/\/crack-gen\/chat-folders\/?$/.test(u.pathname) || u.searchParams.has('cursor')) return;
    mgHeard = { at: Date.now(), folders: json.data.folders.filter((f) => f && f._id) };
  }
  // 합치기가 꺼져 있으면 보관함 응답을 읽지 않는다. 그동안 들은 것은 낡을 수 있으니 버린다
  const mgWanted = () => clOn('on') && clOn('smart');
  xhrWatch.push({ test: /\/crack-gen\/chat-folders(?:[/?#]|$)/, on: mgWanted, fn: mgOnFoldersXhr });
  on('settings', () => { if (!mgWanted()) mgHeard = null; });
  // 같은 이름 판단에 쓰므로 1분 안의 목록만 믿는다(공용 인덱스 → 엿들은 응답 → 직접 받기)
  async function mgFolders(live) {
    const ix = mgIndex();
    const d = ix ? attempt(() => ix.get()) : null;
    if (d && Array.isArray(d.folders) && Date.now() - (Number(d.at) || 0) < 60000) return d.folders.filter((f) => f && f._id);
    if (mgHeard && Date.now() - mgHeard.at < 60000) return mgHeard.folders.slice();
    return mgPages('/crack-gen/chat-folders', {}, (x) => x.folders, false, null, live);
  }

  // ── 상태 ──
  const mg = { el: null, run: 0, phase: 'idle', errStep: 0, previewId: '', groups: [], folders: [], rows: [], single: '', imgs: new Map(), still: false, ff: { t: 0, n: 0 } };
  const mgLive = (run) => !!mg.el && mg.run === run;
  const mg$ = (sel) => (mg.el ? mg.el.querySelector(sel) : null);

  // 작품 이미지: 공용 인덱스의 방 + 지금 사이드바에 그려진 방 행(미리보기 묶음에 썸네일이 없을 때만 쓴다)
  function mgSeedImgs() {
    const m = mg.imgs;
    const ix = mgIndex();
    const d = ix ? attempt(() => ix.get()) : null;
    if (d && Array.isArray(d.chats)) {
      for (const c of d.chats) {
        const sid = c && c.story && c.story._id ? String(c.story._id) : '';
        if (sid && !m.has(sid)) { const u = mgImgOf(c.story); if (u) m.set(sid, u); }
      }
    }
    if (!side.root) return;
    for (const a of side.root.querySelectorAll(SIDE_ROW)) {
      const mm = String(a.getAttribute('href') || '').match(/^\/stories\/([^/]+)\//);
      const im = a.querySelector('span.rounded-full img');
      const u = im ? im.currentSrc || im.src : '';
      if (mm && u && /^https:\/\//.test(u) && !m.has(mm[1])) m.set(mm[1], u);
    }
  }
  // 1개짜리 방(설정 '1개짜리 방도 찾기'): 공용 인덱스로만 계산한다(추가 요청 없음). 인덱스가 없거나 10분보다 오래됐으면 null
  // (지난번에 저장해 둔 낡은 인덱스로 고르면 그새 다른 보관함에 넣은 방을 빼 올 수 있다)
  // 보관함 밖의 방을 작품별로 묶어 1개뿐이고, 미리보기 후보에 없고, 작품 이름과 같은 기존 보관함이 있을 때만
  function mgSingles(groups, folders) {
    const ix = mgIndex();
    const d = ix ? attempt(() => ix.get()) : null;
    if (!d || !Array.isArray(d.chats) || Date.now() - (Number(d.at) || 0) > 10 * 60000) return null;
    const names = new Set(folders.map((f) => mgNameKey(f && f.name)).filter(Boolean));
    const inPreview = new Set(groups.map((g) => String((g && g.storyId) || '')));
    const by = new Map();
    for (const c of d.chats) {
      if (!c || !c._id || !c.story || !c.story._id) continue;
      const fid = c.folderId !== undefined ? c.folderId : d.folderOf && typeof d.folderOf.get === 'function' ? d.folderOf.get(c._id) : null;
      if (fid) continue; // 이미 보관함에 있는 방
      const sid = String(c.story._id);
      if (inPreview.has(sid)) continue;
      let g = by.get(sid);
      if (!g) by.set(sid, (g = { storyId: sid, name: c.story.name || c.title || '', ids: [], img: mgImgOf(c.story) }));
      g.ids.push(String(c._id));
    }
    const out = [];
    for (const g of by.values()) {
      if (g.ids.length === 1 && names.has(mgNameKey(g.name))) out.push({ storyId: g.storyId, name: g.name, chatCount: 1, chatIds: g.ids, single: true, thumb: g.img });
    }
    return out;
  }
  // 검토 줄 만들기. 같은 이름 보관함 = 이름 키(띄어쓰기 무시)가 같은 것. 정렬: 이름이 완전히 같은 것 → 방이 많은 것 → 먼저 만든 것
  function mgBuildRows(groups, folders) {
    const byKey = new Map();
    for (const f of folders) {
      if (!f || !f._id) continue;
      const k = mgNameKey(f.name);
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(f);
    }
    const rows = [];
    for (const g of groups) {
      if (!g || !g.storyId) continue;
      const count = Math.max(0, Number(g.chatCount) || 0);
      if (!count) continue;
      const name = mgClean(g.name) || '이름 없는 작품';
      const key = mgNameKey(name);
      const nk = mgNorm(name);
      const matches = (byKey.get(key) || []).slice().sort((a, b) => (Number(mgNorm(b.name) === nk) - Number(mgNorm(a.name) === nk))
        || ((Number(b.chatCount) || 0) - (Number(a.chatCount) || 0))
        || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      const t0 = Array.isArray(g.thumbnailImageUrls) ? g.thumbnailImageUrls[0] : null;
      const tu = typeof t0 === 'string' ? t0 : isObj(t0) ? t0.w200 || t0.origin || '' : '';
      const thumb = [tu, g.thumb, mg.imgs.get(String(g.storyId))].find((u) => typeof u === 'string' && /^https:\/\//.test(u)) || '';
      rows.push({
        storyId: String(g.storyId), name, key, count, thumb, single: !!g.single,
        chatIds: Array.isArray(g.chatIds) ? g.chatIds.slice() : null, ids: null,
        matches, act: matches.length ? 'merge' : 'create', target: matches.length ? String(matches[0]._id) : '',
      });
    }
    return rows;
  }

  // ── 창 ──
  function mgOpen() {
    if (mg.el) { mgFocus(); return; }
    const run = ++mg.run;
    const el = document.createElement('div');
    el.className = 'cpb-mg'; // id 없음: 기반이 body 직계 [role=dialog]로 보고 왼쪽 사이드바를 열린 채 붙잡는다
    el.setAttribute('data-phase', 'loading');
    el.innerHTML = '<section class="mg-win" role="dialog" aria-modal="true" aria-labelledby="cpb-mg-t" aria-describedby="cpb-mg-s" tabindex="-1">'
      + '<header class="mg-hd"><span class="mg-mark">' + MG_SPARK + '</span><div class="mg-tw"><h2 class="mg-t" id="cpb-mg-t"></h2><div class="mg-s" id="cpb-mg-s"></div></div>'
      + '<button type="button" class="mg-x" data-mg="close" aria-label="닫기" title="닫기">' + MG_X + '</button></header>'
      + '<ol class="mg-steps">' + MG_STEPS.map((s) => '<li><span class="mg-ln"></span>' + s + '</li>').join('') + '</ol>'
      + '<div class="mg-bd"></div><footer class="mg-ft"></footer></section>';
    el.addEventListener('click', mgOnClick);
    el.addEventListener('change', mgOnChange);
    // 바깥(어두운 막)을 눌렀다 떼면 닫기. pointerdown에서 바로 닫으면 막이 사라진 뒤 뗀 클릭이 아래 크랙 행으로 새어 나간다
    let downOnScrim = false;
    el.addEventListener('pointerdown', (e) => { downOnScrim = e.target === el; });
    el.addEventListener('click', (e) => { const hit = downOnScrim && e.target === el; downOnScrim = false; if (hit) mgClose(); });
    el.addEventListener('wheel', (e) => { if (!(e.target.closest && e.target.closest('.mg-bd'))) e.preventDefault(); }, { passive: false });
    el.addEventListener('error', (e) => {
      const im = e.target;
      if (im && im.tagName === 'IMG' && im.parentElement && im.parentElement.classList.contains('mg-th')) im.parentElement.innerHTML = MG_FOLDER;
    }, true);
    mg.el = el;
    mg.phase = 'idle';
    mg.errStep = 0;
    mg.previewId = '';
    mg.groups = [];
    mg.folders = [];
    mg.rows = [];
    mg.single = '';
    mg.still = false;
    mg.imgs = new Map();
    document.body.appendChild(el);
    for (const t of ['keydown', 'keyup', 'keypress']) window.addEventListener(t, mgOnKey, true);
    document.addEventListener('focusin', mgOnFocusIn, true);
    requestAnimationFrame(() => { if (mg.el === el) { setAttr(el, 'data-open', ''); mgFocus(); } });
    setTimeout(() => { if (mg.el === el) mgFocus(); }, 260); // 크랙 메뉴가 닫히며 트리거로 돌려준 포커스를 다시 가져온다
    mgLoad(run);
  }
  function mgClose(force) {
    const el = mg.el;
    if (!el || (!force && mg.phase === 'applying')) return; // 옮기는 중에는 닫지 않는다
    mg.run++;
    mg.el = null;
    mg.phase = 'idle';
    mg.rows = [];
    mg.groups = [];
    mg.folders = [];
    mg.previewId = '';
    for (const t of ['keydown', 'keyup', 'keypress']) window.removeEventListener(t, mgOnKey, true);
    document.removeEventListener('focusin', mgOnFocusIn, true);
    const a = document.activeElement;
    if (a && el.contains(a) && typeof a.blur === 'function') a.blur();
    delAttr(el, 'data-open');
    setAttr(el, 'data-closing', '');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => el.remove(), reduce ? 0 : 200);
  }
  function mgFocus() {
    const w = mg$('.mg-win');
    if (w && !w.contains(document.activeElement)) { try { w.focus({ preventScroll: true }); } catch (_) { /* 포커스 불가 */ } }
  }
  // 창이 열린 동안: 키는 창 밖(크랙 단축키·다른 스크립트)으로 보내지 않는다(글자 입력·선택 같은 기본 동작은 그대로). Esc = 닫기, Tab = 창 안에서만
  function mgOnKey(e) {
    if (!mg.el) return;
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); mgClose(); return; }
    if (e.key === 'Tab') mgTrap(e);
  }
  function mgTrap(e) {
    const w = mg$('.mg-win');
    if (!w) return;
    const f = Array.from(w.querySelectorAll('button:not(:disabled),select:not(:disabled)')).filter((x) => x.getClientRects().length > 0);
    const a = document.activeElement;
    if (!f.length) { e.preventDefault(); mgFocus(); return; }
    const i = f.indexOf(a);
    if (!w.contains(a) || (e.shiftKey && i <= 0) || (!e.shiftKey && i === f.length - 1)) {
      e.preventDefault();
      f[e.shiftKey ? f.length - 1 : 0].focus();
    }
  }
  // 포커스가 창 밖으로 나가면 다시 창으로(다른 포커스 가두기와 싸우지 않게 1초에 6번까지만)
  function mgOnFocusIn(e) {
    const w = mg$('.mg-win');
    if (!w || !(e.target instanceof Node) || w.contains(e.target)) return;
    const now = Date.now();
    if (now - mg.ff.t > 1000) { mg.ff.t = now; mg.ff.n = 0; }
    if (++mg.ff.n > 6) return;
    mgFocus();
  }
  function mgOnClick(e) {
    const b = e.target && e.target.closest ? e.target.closest('[data-mg]') : null;
    if (!b || !mg.el || !mg.el.contains(b) || b.disabled) return;
    const a = b.getAttribute('data-mg');
    if (a === 'close') mgClose();
    else if (a === 'retry') { mgClose(true); setTimeout(mgOpen, 50); }
    else if (a === 'apply') mgApply();
    else if (a === 'single') mgFindSingles();
    else if (a === 'all-merge' || a === 'all-create' || a === 'only-merge') mgBulk(a);
    else if (a === 'seg') {
      const row = b.closest('.mg-row');
      const r = row ? mg.rows[Number(row.getAttribute('data-i'))] : null;
      const v = b.getAttribute('data-v');
      if (r && v && r.act !== v && mg.phase === 'review') { r.act = v; mgSyncRow(row, r); mgSum(true); }
    }
  }
  function mgOnChange(e) {
    const s = e.target;
    if (!s || s.tagName !== 'SELECT' || !s.hasAttribute('data-mg-row')) return;
    const r = mg.rows[Number(s.getAttribute('data-mg-row'))];
    if (r) r.target = s.value;
  }
  function mgHead(title, sub) {
    const t = mg$('.mg-t'), s = mg$('.mg-s');
    if (t) t.textContent = title;
    if (s) s.textContent = sub;
  }
  function mgPhase(p) {
    mg.phase = p;
    if (!mg.el) return;
    setAttr(mg.el, 'data-phase', p);
    const at = { loading: 0, review: 1, preparing: 2, applying: 2, done: 4, error: mg.errStep }[p];
    mg.el.querySelectorAll('.mg-steps li').forEach((li, i) => {
      const s = i < at ? 'done' : i === at ? (p === 'error' ? 'err' : 'now') : '';
      if (s) setAttr(li, 'data-s', s); else delAttr(li, 'data-s');
      if (s === 'now') setAttr(li, 'aria-current', 'step'); else delAttr(li, 'aria-current');
    });
    const x = mg$('.mg-x');
    if (x) x.disabled = p === 'applying';
  }
  const mgBody = (html) => { const b = mg$('.mg-bd'); if (b) { b.innerHTML = html; b.scrollTop = 0; } };
  const mgFoot = (html) => { const f = mg$('.mg-ft'); if (f) f.innerHTML = html; };
  function mgRenderBusy(phase, status) {
    mgPhase(phase);
    if (phase === 'preparing') mgHead('정리할 채팅 확인', '옮기기 전에 대상 채팅을 먼저 모두 확인해요.');
    else mgHead('같은 이름 보관함에 합치기', '크랙 자동 정리 미리보기를 불러와 기존 보관함과 비교해요.');
    mgBody('<div class="mg-pane mg-center"><div class="mg-orb">' + MG_SPARK + '</div><div class="mg-ptx" role="status"></div><div class="mg-bar" data-ind><i></i></div></div>');
    mgFoot('<span class="mg-sum"></span><button type="button" class="mg-btn" data-mg="close">취소</button>');
    mgStatus(status);
  }
  function mgStatus(text, done, total) {
    const tx = mg$('.mg-ptx');
    if (tx && tx.textContent !== text) tx.textContent = text;
    const bar = mg$('.mg-bar');
    if (bar && total) { delAttr(bar, 'data-ind'); bar.style.setProperty('--p', String(Math.max(0, Math.min(1, done / total)))); }
  }
  function mgRenderError(e, title) {
    mgPhase('error');
    mgHead('합치기 실패', '보관함은 아직 바뀌지 않았어요.');
    mgBody('<div class="mg-pane mg-center"><div class="mg-err">' + MG_ALERT + '</div><h4>' + escHtml(title) + '</h4><p class="mg-errtx">' + escHtml((e && e.msg) || '알 수 없는 오류예요.') + '</p></div>');
    mgFoot('<span class="mg-sum"></span><button type="button" class="mg-btn" data-mg="close">닫기</button><button type="button" class="mg-btn pri" data-mg="retry">다시 시도</button>');
  }

  // 1) 불러오기: 미리보기 만들기 → 미리보기 묶음 페이지 → 보관함 목록 → 검토 줄
  async function mgLoad(run) {
    const live = () => mgLive(run);
    mgRenderBusy('loading', '미리보기를 만드는 중…');
    try {
      const pv = await mgReq('POST', MG_PV, undefined, false);
      if (!live()) return;
      const pid = isObj(pv.data) && pv.data.previewId != null ? String(pv.data.previewId) : '';
      if (!pid) throw mgPlain('미리보기를 받지 못했어요. 다시 시도해 주세요.');
      mg.previewId = pid;
      mgStatus('정리 후보를 불러오는 중…');
      await mgSleep(MG_GAP);
      if (!live()) return;
      const groups = await mgPages(MG_PV, { previewId: pid }, (d) => d.folders, true, (n) => { if (live()) mgStatus('정리 후보를 불러오는 중… ' + n + '개'); }, live);
      if (!live()) return;
      mgStatus('기존 보관함과 비교하는 중…');
      await mgSleep(MG_GAP);
      if (!live()) return;
      const folders = await mgFolders(live);
      if (!live()) return;
      mg.groups = groups;
      mg.folders = folders;
      mgSeedImgs();
      let singles = [];
      if (mgSingleOn()) {
        const s = mgSingles(groups, folders);
        if (s) { singles = s; mg.single = 'ready'; } else mg.single = mgIndex() ? 'need' : '';
      }
      mg.rows = mgBuildRows(groups.concat(singles), folders);
      mgRenderReview();
    } catch (e) {
      if (!live()) return;
      mg.errStep = 0;
      mgRenderError(e, '미리보기를 준비하지 못했어요');
    }
  }

  // 2) 검토
  function mgFolderLabel(f, n, rowName) {
    const bits = [(Number(f.chatCount) || 0) + '개'];
    const d = mgDate(f.createdAt);
    if (d) bits.push(d);
    if (f.pinnedAt) bits.push('고정됨');
    const same = mgNorm(f.name) === mgNorm(rowName);
    return '기존 ' + (n + 1) + (same ? '' : ' · ' + mgClean(f.name)) + ' (' + bits.join(', ') + ')';
  }
  function mgRowHtml(r, i) {
    const has = r.matches.length > 0;
    const opts = has ? [['merge', '합치기'], ['create', '새로 만들기'], ['skip', '건너뛰기']] : [['create', '새로 만들기'], ['skip', '건너뛰기']];
    const th = '<span class="mg-th" aria-hidden="true">' + (r.thumb ? '<img src="' + escHtml(r.thumb) + '" alt="" loading="lazy" decoding="async">' : MG_FOLDER) + '</span>';
    const tags = (r.single ? '<span class="mg-tag">1개짜리</span>' : '')
      + (r.twin ? '<span class="mg-tag" title="새로 만들면 이름이 같은 후보끼리 한 보관함에 모아요">같은 이름 후보</span>' : '')
      + (mgCut(r.name) !== r.name ? '<span class="mg-tag" title="새 보관함 이름은 32자까지라 뒷부분을 잘라요">긴 이름</span>' : '');
    const meta = '새 채팅 ' + r.count + '개, ' + (has ? '같은 이름 보관함 ' + r.matches.length + '개' : '새 보관함으로');
    const seg = '<div class="mg-seg" role="group" aria-label="처리 방법" style="--n:' + opts.length + '"><span class="mg-segi"></span>'
      + opts.map(([v, l]) => '<button type="button" data-mg="seg" data-v="' + v + '" aria-pressed="false">' + l + '</button>').join('') + '</div>';
    let tg = '';
    if (has) {
      tg = r.matches.length > 1
        ? '<label class="mg-tg"><span>합칠 보관함</span><select data-mg-row="' + i + '">' + r.matches.map((f, n) => '<option value="' + escHtml(f._id) + '"' + (String(f._id) === r.target ? ' selected' : '') + '>' + escHtml(mgFolderLabel(f, n, r.name)) + '</option>').join('') + '</select></label>'
        : '<div class="mg-tg"><span>합칠 보관함</span><em>' + escHtml(mgFolderLabel(r.matches[0], 0, r.name)) + '</em></div>';
    }
    return '<div class="mg-row" data-i="' + i + '" style="--d:' + Math.min(i, 10) + '">' + th
      + '<div class="mg-main"><div class="mg-nm"><strong title="' + escHtml(r.name) + '">' + escHtml(r.name) + '</strong>' + tags + '</div><div class="mg-meta">' + meta + '</div></div>'
      + seg + tg + '</div>';
  }
  function mgSyncRow(el, r) {
    if (!el || !r) return;
    setAttr(el, 'data-act', r.act);
    let idx = 0;
    el.querySelectorAll('.mg-seg button').forEach((b, k) => { const on = b.getAttribute('data-v') === r.act; b.setAttribute('aria-pressed', String(on)); if (on) idx = k; });
    const seg = el.querySelector('.mg-seg');
    if (seg) seg.style.setProperty('--i', String(idx));
    flag(el, 'data-tg', r.act === 'merge' && r.matches.length > 0);
  }
  function mgSum(bump) {
    const pick = mg.rows.filter((r) => r.act !== 'skip');
    const chats = pick.reduce((s, r) => s + r.count, 0);
    const t = mg$('.mg-sum'), ap = mg$('[data-mg="apply"]');
    if (t) {
      t.textContent = pick.length ? '그룹 ' + pick.length + '개, 채팅 ' + chats + '개를 옮겨요' : '옮길 채팅이 없어요';
      const n = (a) => mg.rows.filter((r) => r.act === a).length;
      t.title = '합치기 ' + n('merge') + '개, 새로 만들기 ' + n('create') + '개, 건너뛰기 ' + n('skip') + '개';
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (bump && !reduce && typeof t.animate === 'function') t.animate([{ opacity: 0.4, transform: 'translateY(3px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    if (ap) {
      ap.disabled = !pick.length;
      ap.textContent = pick.length ? pick.length + '개 그룹 정리' : '정리할 항목 없음';
    }
  }
  function mgBulk(a) {
    if (mg.phase !== 'review') return;
    mg.rows.forEach((r, i) => {
      if (r.matches.length) r.act = a === 'all-create' ? 'create' : 'merge';
      else if (a === 'only-merge') r.act = 'skip';
      else return;
      mgSyncRow(mg$('.mg-row[data-i="' + i + '"]'), r);
    });
    mgSum(true);
  }
  function mgRenderReview() {
    mgPhase('review');
    mgHead('같은 이름 보관함에 합치기', '같은 이름 보관함이 있으면 그리로 옮기고, 없으면 새로 만들어요.');
    const rows = mg.rows;
    const clash = rows.filter((r) => r.matches.length).length;
    const singles = rows.filter((r) => r.single).length;
    // 기존 보관함은 없지만 이름이 같은 후보끼리(다른 작품, 같은 이름): 적용 때 처음 만든 보관함 하나에 모은다
    const twins = new Map();
    for (const r of rows) if (!r.matches.length) twins.set(r.key, (twins.get(r.key) || 0) + 1);
    for (const r of rows) r.twin = !r.matches.length && (twins.get(r.key) || 0) > 1;
    let chips = rows.length ? '<span class="mg-chip">정리 후보 ' + rows.length + '개</span>' : '';
    if (mg.single === 'ready') chips += '<span class="mg-chip">' + (singles ? '1개짜리 방 +' + singles + '개' : '1개짜리 방 추가 없음') + '</span>';
    else if (mg.single === 'need') chips += '<button type="button" class="mg-chip mg-chipbtn" data-mg="single" title="방 목록을 불러와 보관함 밖의 1개짜리 방도 찾아요">1개짜리 방도 찾기</button>';
    else if (mg.single === 'loading') chips += '<span class="mg-chip">방 목록을 불러오는 중…</span>';
    else if (mg.single === 'error') chips += '<span class="mg-chip">1개짜리 방을 찾지 못했어요</span>';
    if (clash) chips += '<span class="mg-chip clash">이름 겹침 ' + clash + '개</span>';
    const bulk = clash ? '<div class="mg-tools mg-bulk"><button type="button" class="mg-btn sm" data-mg="all-merge">겹치는 건 모두 합치기</button>'
      + '<button type="button" class="mg-btn sm" data-mg="only-merge" title="같은 이름 보관함이 없는 줄은 건너뛰어요">합치기만 하기</button>'
      + '<button type="button" class="mg-btn sm" data-mg="all-create">모두 따로 만들기</button></div>' : '';
    const tools = (chips ? '<div class="mg-tools">' + chips + '</div>' : '') + bulk;
    const pane = '<div class="mg-pane"' + (mg.still ? ' data-still' : '') + '>'; // 다시 그릴 때(1개짜리 방 추가 등)는 등장 움직임을 되풀이하지 않는다
    if (!rows.length) {
      mgBody(pane + tools + '<div class="mg-center"><h4>정리할 채팅방이 없어요</h4><p>크랙 자동 정리 후보가 하나도 없어요.</p></div></div>');
      mg.still = true;
      mgFoot('<span class="mg-sum"></span><button type="button" class="mg-btn pri" data-mg="close">닫기</button>');
      return;
    }
    const note = '이름은 띄어쓰기와 대소문자 차이를 무시하고 비교해요. '
      + (singles ? '보관함 밖의 1개짜리 방도 함께 찾았어요. ' : '')
      + '정리 버튼을 누르기 전에는 아무것도 바뀌지 않아요.';
    mgBody(pane + tools + '<div class="mg-rows">' + rows.map(mgRowHtml).join('') + '</div><p class="mg-note">' + note + '</p></div>');
    mg.still = true;
    mgFoot('<span class="mg-sum"></span><button type="button" class="mg-btn" data-mg="close">취소</button><button type="button" class="mg-btn pri" data-mg="apply"></button>');
    mg.el.querySelectorAll('.mg-row').forEach((row) => mgSyncRow(row, rows[Number(row.getAttribute('data-i'))]));
    mgSum(false);
  }
  // '1개짜리 방도 찾기'를 눌렀을 때만 공용 인덱스를 불러온다(사용자 동작). 다른 곳에서 인덱스가 다 되면 저절로 붙인다
  function mgAddSingles() {
    const s = mgSingles(mg.groups, mg.folders);
    if (!s) return false;
    mgSeedImgs();
    const have = new Set(mg.rows.map((r) => r.storyId));
    mg.rows = mg.rows.concat(mgBuildRows(s.filter((g) => !have.has(String(g.storyId))), mg.folders));
    mg.single = 'ready';
    mgRenderReview();
    return true;
  }
  async function mgFindSingles() {
    const ix = mgIndex();
    if (!ix || typeof ix.load !== 'function' || mg.phase !== 'review' || mg.single !== 'need') return;
    const run = mg.run;
    mg.single = 'loading';
    mgRenderReview();
    let ok = true;
    try { await ix.load({}); } catch (_) { ok = false; }
    if (ok && typeof ix.status === 'function' && ix.status() === 'error') ok = false; // 실패해도 예전 값을 돌려주므로 상태로 본다
    if (!mgLive(run) || mg.phase !== 'review') return;
    if (!ok || !mgAddSingles()) { mg.single = 'error'; mgRenderReview(); }
  }
  on('chatindex', () => { if (mg.el && mg.phase === 'review' && mg.single === 'need' && mgSingleOn()) mgAddSingles(); });

  // 3) 적용: 고른 줄의 방 ID를 먼저 모두 모은 뒤(중간 실패로 반쯤 바뀌는 일 방지), 줄마다 차례로 옮기기/만들기
  function mgRenderApply(rows) {
    mgPhase('applying');
    mgHead('보관함에 옮기는 중', '창을 닫지 말고 잠시만 기다려 주세요.');
    mgBody('<div class="mg-pane"><div class="mg-ptop"><span class="mg-ptx" role="status">보관함에 옮기는 중</span><b class="mg-cnt">0/' + rows.length + '</b></div><div class="mg-bar"><i></i></div><ul class="mg-ap">'
      + rows.map((r) => '<li><span class="mg-st"></span><span class="mg-an">' + escHtml(r.name) + '</span><span class="mg-aa">' + (r.act === 'merge' ? '기존에 합치기' : '새 보관함') + '</span></li>').join('')
      + '</ul></div>');
    mgFoot('<span class="mg-sum">창을 닫지 말고 기다려 주세요</span><button type="button" class="mg-btn pri" disabled><span class="mg-spin"></span>정리하는 중</button>');
  }
  function mgApRow(i, st, n, name, msg) {
    const li = mg.el ? mg.el.querySelectorAll('.mg-ap li')[i] : null;
    if (!li) return;
    setAttr(li, 'data-st', st);
    const ic = li.querySelector('.mg-st');
    if (ic) ic.innerHTML = st === 'ok' ? MG_TICK : st === 'err' ? MG_XS : '';
    if (msg) li.title = msg;
    const bar = mg$('.mg-bar');
    if (st === 'now') {
      const tx = mg$('.mg-ptx'), cnt = mg$('.mg-cnt');
      if (tx) tx.textContent = '보관함에 옮기는 중 ' + (i + 1) + '/' + n + ' · ' + name;
      if (cnt) cnt.textContent = (i + 1) + '/' + n;
      if (bar) bar.style.setProperty('--p', String(i / n));
      const bd = mg$('.mg-bd');
      if (bd && li.offsetTop + li.offsetHeight > bd.scrollTop + bd.clientHeight - 8) bd.scrollTop = li.offsetTop + li.offsetHeight - bd.clientHeight + 16;
    } else if (bar) bar.style.setProperty('--p', String((i + 1) / n));
  }
  async function mgApply() {
    if (mg.phase !== 'review') return;
    const rows = mg.rows.filter((r) => r.act === 'merge' || r.act === 'create');
    if (!rows.length) return;
    const run = mg.run;
    const live = () => mgLive(run);
    mgRenderBusy('preparing', '정리할 채팅을 확인하는 중 0/' + rows.length);
    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.chatIds && r.chatIds.length) r.ids = Array.from(new Set(r.chatIds));
        else {
          const chats = await mgPages(MG_PV, { previewId: mg.previewId, storyId: r.storyId }, (d) => d.chats, true, null, live);
          if (!live()) return;
          r.ids = Array.from(new Set(chats.map((c) => (c && c._id ? String(c._id) : '')).filter(Boolean)));
          if (i < rows.length - 1) await mgSleep(MG_GAP);
        }
        if (!live()) return;
        mgStatus('정리할 채팅을 확인하는 중 ' + (i + 1) + '/' + rows.length, i + 1, rows.length);
      }
    } catch (e) {
      if (!live()) return;
      mg.errStep = 2;
      mgRenderError(e, '정리할 채팅을 확인하지 못했어요');
      return;
    }
    if (!live()) return;
    mgRenderApply(rows);
    const res = { made: 0, merged: 0, moved: 0, fail: [], moves: [], lost: false };
    const made = new Map(); // 이번에 만든 보관함(이름 키 → id): 같은 이름 줄이 또 있으면 새로 만들지 않고 그리로
    let stop = null; // 로그인 문제면 나머지는 보내지 않는다
    for (let i = 0; i < rows.length; i++) {
      if (!live()) return;
      const r = rows[i];
      mgApRow(i, 'now', rows.length, r.name);
      let moved = 0, created = false;
      try {
        if (stop) throw stop;
        if (!r.ids || !r.ids.length) { mgApRow(i, 'ok', rows.length, r.name, '옮길 방이 없었어요'); continue; }
        const parts = mgChunks(r.ids, MG_CHUNK);
        let fid = r.act === 'merge' ? r.target : made.get(r.key) || '';
        if (r.act === 'merge' && !fid) throw mgPlain('합칠 보관함을 고르지 않았어요');
        let k = 0;
        if (!fid) {
          const j = await mgReq('POST', '/crack-gen/chat-folders', { name: mgCut(r.name), chatIds: parts[0] });
          const d = isObj(j.data) ? j.data : {};
          fid = String(d._id || (isObj(d.folder) && d.folder._id) || '');
          created = true;
          res.made++;
          moved += parts[0].length;
          if (fid) { made.set(r.key, fid); res.moves.push({ chatIds: parts[0], folderId: fid }); } else res.lost = true;
          k = 1;
        }
        for (; k < parts.length; k++) {
          if (!fid) throw mgPlain('보관함은 만들었지만 나머지 방 ' + (r.ids.length - moved) + '개를 옮기지 못했어요');
          if (k) await mgSleep(MG_GAP);
          await mgReq('PATCH', '/crack-gen/chat-folders/chats/move', { chatIds: parts[k], targetFolderId: fid });
          moved += parts[k].length;
          res.moves.push({ chatIds: parts[k], folderId: fid });
        }
        mgApRow(i, 'ok', rows.length, r.name);
      } catch (e) {
        const msg = (e && e.msg) || '알 수 없는 오류예요';
        res.fail.push({ name: r.name, msg });
        if (!stop && e && (e.status === 0 || e.status === 401)) stop = e;
        mgApRow(i, 'err', rows.length, r.name, msg);
      } finally {
        if (!created && moved) res.merged++;
        res.moved += moved;
      }
      if (i < rows.length - 1) await mgSleep(MG_GAP);
    }
    // 뒤처리: 엿들은 보관함 목록 버리기 → 공용 인덱스 고치기(보관함마다 한 번) → 크랙 사이드바 새로 받기
    mgHeard = null;
    const ix = mgIndex();
    if (ix && typeof ix.patch === 'function') {
      const byFolder = new Map();
      for (const m of res.moves) { if (!byFolder.has(m.folderId)) byFolder.set(m.folderId, []); byFolder.get(m.folderId).push(...m.chatIds); }
      for (const [folderId, chatIds] of byFolder) attempt(() => ix.patch({ moved: { chatIds, folderId } }));
    }
    const canRefresh = mgCanRefresh() && !!(side.root && side.root.isConnected);
    if (res.moved || res.made) {
      mgSideRefresh();
      // 인덱스 전체 다시 받기(요청 수십 번)는 위 고치기로 못 메울 때만: 만든 보관함 id를 못 받았거나,
      // 새 보관함을 만들었는데 크랙 보관함 칸을 못 찾아(새로 받은 보관함 목록을 인덱스가 엿듣지 못함) 인덱스에 새 보관함이 안 들어갈 때
      const needReload = res.lost || (res.made > 0 && !(side.arch && side.arch.isConnected));
      if (needReload && ix && typeof ix.load === 'function' && attempt(() => ix.get())) {
        setTimeout(() => { const p = attempt(() => ix.load({ force: true })); if (p && typeof p.catch === 'function') p.catch(() => null); }, 1500);
      }
    }
    if (live()) mgRenderDone(res, canRefresh);
  }
  // 4) 완료
  function mgRenderDone(res, refreshed) {
    mgPhase('done');
    const bad = res.fail.length;
    mgHead(bad ? '일부만 정리됨' : '정리 완료', bad ? '된 것은 적용됐고, 안 된 것은 아래에 적었어요.' : '고른 채팅을 모두 옮겼어요.');
    const said = res.made && res.merged ? '새 보관함 ' + res.made + '개를 만들고 ' + res.merged + '개 그룹을 기존 보관함에 합쳤어요.'
      : res.made ? '새 보관함 ' + res.made + '개를 만들었어요.'
      : res.merged ? res.merged + '개 그룹을 기존 보관함에 합쳤어요.'
      : '옮긴 채팅이 없어요.';
    const total = res.moved ? ' 옮긴 채팅은 모두 ' + res.moved + '개예요.' : '';
    const fails = bad ? '<ul class="mg-fail">' + res.fail.map((f) => '<li>' + escHtml(f.name) + ': ' + escHtml(f.msg) + '</li>').join('') + '</ul>' : '';
    const faint = res.moved || res.made ? '<p class="mg-faint">' + (refreshed ? '왼쪽 채팅 목록과 보관함도 새로 고쳤어요.' : '왼쪽 목록은 다른 화면으로 옮기면 새로 고쳐져요.') + '</p>' : '';
    mgBody('<div class="mg-pane mg-center">' + (bad ? '<div class="mg-err">' + MG_ALERT + '</div>' : MG_DONE)
      + '<h4>' + (bad ? '일부만 정리했어요' : '정리를 마쳤어요') + '</h4><p>' + said + total + '</p>' + fails + faint + '</div>');
    mgFoot('<span class="mg-sum"></span><button type="button" class="mg-btn pri" data-mg="close">완료</button>');
    const b = mg$('.mg-ft [data-mg="close"]');
    if (b) { try { b.focus({ preventScroll: true }); } catch (_) { /* 포커스 불가 */ } }
  }

  // ── 크랙 '채팅 목록' 머리줄 ⋯ 메뉴에 항목 넣기 ──
  // 트리거 = 사이드바(side.root) virtuoso 머리 안, '채팅 목록' 글자(크랙 클래스)와 같은 줄(div.h-7)에 있는 라벨 없는 메뉴 버튼만
  function mgHeadTrig(el) {
    const t = el && el.closest ? el.closest('button[aria-haspopup="menu"]') : null;
    if (!t || t.hasAttribute('aria-label') || !side.root || !side.root.contains(t)) return null;
    const row = t.parentElement;
    if (!row || !row.classList.contains('h-7') || !t.closest('[data-testid="virtuoso-scroller"]')) return null;
    for (const s of row.children) {
      if (s.tagName === 'SPAN' && s.classList.contains('typo-text-sm_leading-paragraph_regular') && s.textContent.trim() === '채팅 목록') return t;
    }
    return null;
  }
  // 메뉴(트리거 aria-controls로 찾은 것) 안 '자동 정리' 바로 위에. 크랙 항목 class를 빌리고, 누르면 메뉴를 닫고 창을 연다
  function mgInject(menu, t) {
    if (!mgOn() || !menu || !menu.isConnected || !trigOpen(t) || menu.querySelector('.cpb-mg-mi')) return;
    const auto = Array.from(menu.querySelectorAll('[role="menuitem"]')).find((x) => !String(x.className).includes('cpb-') && x.textContent.trim() === '자동 정리');
    if (!auto) return;
    const it = document.createElement('div');
    it.className = auto.className + ' cpb-mg-mi';
    it.setAttribute('role', 'menuitem');
    it.tabIndex = -1;
    it.innerHTML = MG_SPARK + '<span>같은 이름 보관함에 합치기</span>';
    const rs = auto.querySelector('svg');
    if (rs && rs.getAttribute('class')) it.firstChild.setAttribute('class', rs.getAttribute('class') + ' mg-spark');
    it.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
    it.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (t.isConnected && trigOpen(t)) triggerToggle(t);
      setTimeout(mgOpen, 60); // 크랙 메뉴(모달)가 닫힌 뒤
    });
    auto.before(it);
  }
  const mgArm = (t) => { for (const ms of [60, 160]) setTimeout(() => mgInject(trigMenu(t), t), ms); };
  // 사이드바 루트의 누르기 리스너(sideOnDown)가 불러 준다. 문서 전체에는 리스너를 걸지 않는다
  function mgSideDown(e) {
    if (!mgOn()) return;
    const t = mgHeadTrig(e.target);
    if (t) mgArm(t);
  }

  const MG_CSS = `
/* '채팅 목록' ⋯ 메뉴 항목: 크랙 항목 class를 빌리고 호버·반짝이만 우리 것 */
.cpb-mg-mi{cursor:pointer;user-select:none}
.cpb-mg-mi:hover{background:var(--state_hover,rgba(128,128,128,.12))}
.cpb-mg-mi>svg{flex:none}
.mg-spark path{transform-box:fill-box;transform-origin:center}
.cpb-mg-mi .mg-s1{transition:transform .45s cubic-bezier(.34,1.56,.64,1)}
.cpb-mg-mi .mg-s2,.cpb-mg-mi .mg-s3{transform:scale(0);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.cpb-mg-mi:hover .mg-s1{transform:rotate(90deg) scale(.88)}
.cpb-mg-mi:hover .mg-s2{transform:none;transition-delay:70ms}
.cpb-mg-mi:hover .mg-s3{transform:none;transition-delay:140ms}
/* 창: 크랙 테마 변수 + 먹색 한 가지 강조(옛 튜너 모양) */
.cpb-mg{--mg-bg:var(--bg_screen,#fff);--mg-tx:var(--text_primary,#1a1918);--mg-tx2:var(--text_secondary,#61605a);--mg-tx3:var(--text_tertiary,#85837d);--mg-line:var(--outline_tertiary,rgba(128,128,128,.2));--mg-line2:var(--outline_secondary,rgba(128,128,128,.32));--mg-hover:var(--state_hover,rgba(128,128,128,.12));--mg-sunk:color-mix(in srgb,var(--mg-tx) 6%,transparent);--mg-tint:color-mix(in srgb,var(--mg-tx) 2.5%,transparent);--mg-knob:var(--mg-bg);--mg-ring:color-mix(in srgb,var(--mg-tx) 14%,transparent);--mg-red:#c9566b;--mg-scrim:rgba(24,24,27,.3);--mg-shadow:0 30px 70px rgba(20,16,40,.2);--mg-ease:cubic-bezier(.2,.8,.2,1);--mg-spring:cubic-bezier(.34,1.56,.64,1);
position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:22px;background:var(--mg-scrim);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);color:var(--mg-tx);font-size:13px;line-height:1.5;pointer-events:auto;color-scheme:light;opacity:0;transition:opacity .18s}
body[data-theme=dark] .cpb-mg{--mg-red:#f08a9b;--mg-scrim:rgba(6,6,8,.55);--mg-knob:color-mix(in srgb,var(--mg-tx) 14%,var(--mg-bg));--mg-shadow:0 30px 80px rgba(0,0,0,.6);color-scheme:dark}
body[data-theme=light] .cpb-mg{--mg-red:#c9566b;--mg-scrim:rgba(24,24,27,.3);color-scheme:light}
.cpb-mg[data-open]{opacity:1}
.cpb-mg[data-closing]{pointer-events:none}
.cpb-mg *{box-sizing:border-box}
.cpb-mg button,.cpb-mg select{font:inherit;color:inherit}
.cpb-mg .mg-win{width:min(640px,100%);max-height:min(820px,calc(100vh - 44px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--mg-line2);border-radius:22px;background:var(--mg-bg);box-shadow:var(--mg-shadow);outline:none;opacity:0;transform:translateY(14px) scale(.965);transition:transform .2s var(--mg-ease),opacity .15s}
.cpb-mg[data-open] .mg-win{opacity:1;transform:none;transition:transform .36s cubic-bezier(.22,1.2,.36,1),opacity .2s}
.cpb-mg .mg-hd{display:flex;align-items:center;gap:13px;padding:18px 16px 14px 20px}
.cpb-mg .mg-mark{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:13px;background:var(--mg-sunk);color:var(--mg-tx)}
.cpb-mg .mg-mark svg{width:22px;height:22px}
.cpb-mg[data-phase=done] .mg-mark .mg-s1{animation:cpb-mg-pop .6s var(--mg-spring)}
.cpb-mg .mg-tw{flex:1;min-width:0}
.cpb-mg .mg-t{margin:0;font-size:16.5px;font-weight:760;letter-spacing:-.02em;line-height:1.3;color:var(--mg-tx)}
.cpb-mg .mg-s{margin-top:3px;font-size:12px;line-height:1.5;color:var(--mg-tx2)}
.cpb-mg .mg-x{flex:none;display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:9px;background:none;color:var(--mg-tx3);cursor:pointer}
.cpb-mg .mg-x:hover:not(:disabled){background:var(--mg-hover);color:var(--mg-tx)}
.cpb-mg .mg-x:disabled{opacity:.3;cursor:default}
.cpb-mg .mg-x svg{width:14px;height:14px}
/* 단계 점: 불러오기 · 검토 · 적용 · 완료 */
.cpb-mg .mg-steps{display:grid;grid-template-columns:repeat(4,1fr);margin:0;padding:2px 20px 16px;list-style:none;border-bottom:1px solid var(--mg-line)}
.cpb-mg .mg-steps li{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;font-size:11px;color:var(--mg-tx3)}
.cpb-mg .mg-steps li::before{content:"";position:relative;z-index:1;width:9px;height:9px;border-radius:50%;background:var(--mg-line2);transition:transform .36s var(--mg-spring)}
.cpb-mg .mg-ln{position:absolute;top:3.5px;left:calc(50% + 10px);width:calc(100% - 20px);height:2px;border-radius:2px;background:var(--mg-line);overflow:hidden}
.cpb-mg .mg-steps li:last-child .mg-ln{display:none}
.cpb-mg .mg-ln::after{content:"";position:absolute;inset:0;background:var(--mg-tx);transform:scaleX(0);transform-origin:left;transition:transform .48s var(--mg-ease)}
.cpb-mg .mg-steps li[data-s=done] .mg-ln::after{transform:none}
.cpb-mg .mg-steps li[data-s=done]{color:var(--mg-tx2)}
.cpb-mg .mg-steps li:is([data-s=done],[data-s=now])::before{background:var(--mg-tx)}
.cpb-mg .mg-steps li[data-s=now]{color:var(--mg-tx);font-weight:680}
.cpb-mg .mg-steps li[data-s=now]::before{box-shadow:0 0 0 4px var(--mg-ring);transform:scale(1.2)}
.cpb-mg .mg-steps li[data-s=err]{color:var(--mg-red);font-weight:680}
.cpb-mg .mg-steps li[data-s=err]::before{background:var(--mg-red);box-shadow:0 0 0 4px color-mix(in srgb,var(--mg-red) 22%,transparent)}
/* 본문 · 바닥 · 버튼 */
.cpb-mg .mg-bd{position:relative;flex:1;min-height:200px;overflow-y:auto;overscroll-behavior:contain;padding:14px 20px 16px;container-type:inline-size}
.cpb-mg .mg-ft{display:flex;align-items:center;gap:8px;padding:14px 16px 16px 20px;border-top:1px solid var(--mg-line)}
.cpb-mg .mg-sum{margin-right:auto;font-size:12.5px;color:var(--mg-tx2);font-variant-numeric:tabular-nums}
.cpb-mg .mg-btn{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 15px;border:1px solid var(--mg-line2);border-radius:10px;background:none;color:var(--mg-tx);font-size:12.5px;font-weight:660;white-space:nowrap;cursor:pointer;transition:transform .12s}
.cpb-mg .mg-btn:hover:not(:disabled){background:var(--mg-hover)}
.cpb-mg .mg-btn:active:not(:disabled){transform:scale(.97)}
.cpb-mg .mg-btn.pri{border-color:transparent;background:var(--mg-tx);color:var(--mg-bg)}
.cpb-mg .mg-btn.pri:hover:not(:disabled){background:color-mix(in srgb,var(--mg-tx) 86%,var(--mg-bg))}
.cpb-mg .mg-btn.sm{min-height:30px;padding:0 11px;border-radius:8px;font-size:11.5px}
.cpb-mg .mg-btn:disabled{opacity:.42;cursor:default}
.cpb-mg :is(.mg-btn,.mg-x,.mg-seg button,select,.mg-chipbtn):focus-visible{outline:2px solid var(--mg-tx);outline-offset:2px}
.cpb-mg .mg-spin{width:12px;height:12px;border-radius:50%;border:1.5px solid color-mix(in srgb,currentColor 35%,transparent);border-top-color:currentColor;animation:cpb-mg-spin .8s linear infinite}
.cpb-mg .mg-pane{animation:cpb-mg-in .3s var(--mg-ease) both}
.cpb-mg .mg-center{min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:10px 0;text-align:center;color:var(--mg-tx2)}
.cpb-mg .mg-center h4{margin:6px 0 0;font-size:16px;font-weight:740;letter-spacing:-.015em;color:var(--mg-tx)}
.cpb-mg .mg-center p{margin:0;font-size:13px;line-height:1.7}
.cpb-mg .mg-center p.mg-faint{font-size:12px;color:var(--mg-tx3)}
.cpb-mg .mg-ptx{font-size:13px;color:var(--mg-tx2)}
.cpb-mg .mg-orb{position:relative;display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:var(--mg-sunk);color:var(--mg-tx)}
.cpb-mg .mg-orb svg{width:28px;height:28px}
.cpb-mg .mg-orb::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid transparent;border-top-color:var(--mg-tx);border-right-color:var(--mg-line2);animation:cpb-mg-spin 1.1s linear infinite}
.cpb-mg .mg-bar{width:100%;height:4px;border-radius:4px;background:var(--mg-line);overflow:hidden}
.cpb-mg .mg-center .mg-bar{width:min(240px,80%)}
.cpb-mg .mg-bar>i{display:block;width:100%;height:100%;border-radius:inherit;background:var(--mg-tx);transform:scaleX(var(--p,0));transform-origin:left;transition:transform .42s var(--mg-ease)}
.cpb-mg .mg-bar[data-ind]>i{width:34%;transform:none;animation:cpb-mg-ind 1.3s var(--mg-ease) infinite}
/* 검토 */
.cpb-mg .mg-tools{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px}
.cpb-mg .mg-tools+.mg-bulk{margin-top:-4px}
.cpb-mg .mg-pane[data-still],.cpb-mg .mg-pane[data-still] .mg-row{animation:none}
.cpb-mg .mg-chip{padding:4px 9px;border:0;border-radius:999px;background:var(--mg-sunk);color:var(--mg-tx2);font-size:11px;font-weight:660;line-height:1.4}
.cpb-mg .mg-chip.clash{background:none;color:var(--mg-tx);box-shadow:inset 0 0 0 1px var(--mg-line2)}
.cpb-mg .mg-chipbtn{cursor:pointer}
.cpb-mg .mg-chipbtn:hover{background:var(--mg-hover);color:var(--mg-tx)}
.cpb-mg .mg-rows{display:flex;flex-direction:column;gap:6px}
.cpb-mg .mg-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;column-gap:12px;padding:10px 10px 10px 12px;border:1px solid var(--mg-line);border-radius:14px;background:var(--mg-tint);animation:cpb-mg-row .34s var(--mg-ease) both;animation-delay:calc(60ms + var(--d,0) * 32ms)}
.cpb-mg .mg-th{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;overflow:hidden;background:var(--mg-sunk);color:var(--mg-tx2);transition:opacity .2s}
.cpb-mg .mg-th img{display:block;width:100%;height:100%;object-fit:cover}
.cpb-mg .mg-th svg{width:15px;height:15px}
.cpb-mg .mg-main{min-width:0;transition:opacity .2s}
.cpb-mg .mg-row[data-act=skip] :is(.mg-main,.mg-th){opacity:.4}
.cpb-mg .mg-nm{display:flex;align-items:center;gap:6px;min-width:0}
.cpb-mg .mg-nm strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:660;color:var(--mg-tx)}
.cpb-mg .mg-tag{flex:none;padding:2px 6px;border-radius:5px;background:var(--mg-hover);color:var(--mg-tx2);font-size:10px;font-weight:720}
.cpb-mg .mg-meta{margin-top:4px;font-size:11.5px;color:var(--mg-tx2)}
.cpb-mg .mg-seg{position:relative;display:grid;grid-template-columns:repeat(var(--n,2),1fr);padding:3px;border-radius:10px;background:var(--mg-sunk);isolation:isolate}
.cpb-mg .mg-segi{position:absolute;z-index:-1;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / var(--n,2));border-radius:7px;background:var(--mg-knob);box-shadow:0 1px 3px rgba(0,0,0,.14),0 0 0 1px var(--mg-line);transform:translateX(calc(100% * var(--i,0)));transition:transform .3s var(--mg-ease)}
.cpb-mg .mg-seg button{padding:6px 11px;border:0;border-radius:7px;background:none;color:var(--mg-tx2);font-size:12px;font-weight:640;white-space:nowrap;cursor:pointer}
.cpb-mg .mg-seg button[aria-pressed=true]{color:var(--mg-tx)}
.cpb-mg .mg-tg{display:none;grid-column:1/-1;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:10px 0 2px 46px;font-size:11.5px;color:var(--mg-tx2)}
.cpb-mg .mg-row[data-tg] .mg-tg{display:flex;animation:cpb-mg-in .22s var(--mg-ease) both}
.cpb-mg .mg-tg em{font-style:normal;font-weight:620;color:var(--mg-tx)}
.cpb-mg .mg-tg select{height:32px;max-width:100%;min-width:0;padding:0 10px;border:1px solid var(--mg-line2);border-radius:8px;background:var(--mg-sunk);color:var(--mg-tx);font-size:12px;outline:none}
.cpb-mg .mg-tg select option{background:var(--mg-bg);color:var(--mg-tx)}
.cpb-mg .mg-note{margin:14px 2px 0;font-size:11.5px;line-height:1.6;color:var(--mg-tx3)}
@container (max-width:470px){.cpb-mg .mg-row{grid-template-columns:auto minmax(0,1fr)}.cpb-mg .mg-seg{grid-column:1/-1;margin-top:10px}.cpb-mg .mg-tg{padding-left:0}}
/* 적용 진행 */
.cpb-mg .mg-ptop{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:4px 0 9px}
.cpb-mg .mg-ptop .mg-ptx{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mg-tx)}
.cpb-mg .mg-cnt{font-size:12px;font-variant-numeric:tabular-nums}
.cpb-mg .mg-ap{display:flex;flex-direction:column;gap:2px;margin:14px 0 0;padding:0;list-style:none}
.cpb-mg .mg-ap li{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:10px;font-size:12.5px;color:var(--mg-tx3)}
.cpb-mg .mg-ap li[data-st=now]{background:var(--mg-hover);color:var(--mg-tx)}
.cpb-mg .mg-ap li[data-st=ok]{color:var(--mg-tx)}
.cpb-mg .mg-ap li[data-st=err]{color:var(--mg-red)}
.cpb-mg .mg-st{position:relative;flex:none;display:grid;place-items:center;width:16px;height:16px;border-radius:50%;border:1.5px solid var(--mg-line2)}
.cpb-mg .mg-ap li[data-st=now] .mg-st{border-top-color:var(--mg-tx);animation:cpb-mg-spin .8s linear infinite}
.cpb-mg .mg-ap li[data-st=ok] .mg-st{border-color:var(--mg-tx);background:var(--mg-tx);color:var(--mg-bg)}
.cpb-mg .mg-ap li[data-st=err] .mg-st{border-color:var(--mg-red);background:var(--mg-red);color:var(--mg-bg)}
.cpb-mg .mg-st svg{width:10px;height:10px;animation:cpb-mg-pop .3s var(--mg-spring) both}
.cpb-mg .mg-an{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cpb-mg .mg-aa{flex:none;font-size:11px;color:var(--mg-tx3)}
/* 완료 · 실패 */
.cpb-mg .mg-ok{width:60px;height:60px;color:var(--mg-tx);animation:cpb-mg-pop .5s var(--mg-spring) both}
.cpb-mg .mg-err{display:grid;place-items:center;width:60px;height:60px;border-radius:50%;background:color-mix(in srgb,var(--mg-red) 14%,transparent);color:var(--mg-red);animation:cpb-mg-shake .46s var(--mg-ease) .12s}
.cpb-mg .mg-err svg{width:26px;height:26px}
.cpb-mg .mg-center p.mg-errtx{font-size:12px;line-height:1.6;color:var(--mg-red);white-space:pre-wrap}
.cpb-mg .mg-fail{width:min(520px,100%);margin:4px 0 0;padding-left:18px;list-style:disc;text-align:left;font-size:12px;line-height:1.6;color:var(--mg-red)}
@keyframes cpb-mg-spin{to{transform:rotate(360deg)}}
@keyframes cpb-mg-ind{from{transform:translateX(-110%)}to{transform:translateX(310%)}}
@keyframes cpb-mg-in{from{opacity:0;transform:translateY(8px)}}
@keyframes cpb-mg-row{from{opacity:0;transform:translateY(6px)}}
@keyframes cpb-mg-pop{from{opacity:0;transform:scale(.5)}}
@keyframes cpb-mg-shake{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
@media (max-width:700px){.cpb-mg{align-items:flex-end;padding:0}.cpb-mg .mg-win{width:100%;max-height:92vh;border-radius:20px 20px 0 0}}
@media (prefers-reduced-motion:reduce){.cpb-mg,.cpb-mg *,.cpb-mg *::before,.cpb-mg *::after,.cpb-mg-mi *{transition:none!important;animation:none!important}}
`;
  siteCss('mg', MG_CSS);

  // ===== cl-branchmap.js =====
  // ── 갈래 지도: 분기 방 나무 창 · 지난 분기 찾기(누를 때만) · 입구 버튼(룸 상단바 · '채팅 목록' 머리줄) ──────────────
  // 데이터: 'crack-pc-base:branch:v1'(분기 기록과 같은 저장소) + 공용 채팅 인덱스(제목·작품·표지·분기 방 여부·날짜).
  // 창은 Shadow DOM(크랙·다른 확장 스타일과 섞이지 않게)이고 사이드바가 있는 모든 화면에서 열린다. 입구 버튼은 사이트 전역 스타일(siteCss 'bm').
  // 창을 열 때 요청은 인덱스가 10분 넘게 묵었을 때만(chatIndex.load). 지난 분기 찾기(방마다 대화 기록 읽기)는 확인 팝업을 거쳐 누를 때만,
  // 설정 branch.autoScan을 켰을 때만 열 때 자동. 원본 방 깃발과 도착 알림은 분기 기록 쪽(brCounts · brArrive)이 맡는다.
  const BM_KEY = 'crack-pc-base:branch:v1';
  const BM_ARRIVE_KEY = 'crack-pc-base:branch:arrive';
  const BM_ID = /^[0-9a-f]{24}$/i;
  const BM_GAP = 150; // 요청 사이 간격(쪽·방 모두)
  const BM_RETRY_MS = 6 * 3600 * 1000; // 못 찾은 방은 6시간 뒤에 다시 본다
  const BM_FAIL_MS = 10 * 60 * 1000; // 오류 난 방: 자동 찾기에서는 10분 뒤(직접 누르면 바로)
  const BM_LIMIT = 100; // 기반 turnsEnsure와 같은 쪽 크기
  const BM_MAX_PAGES = 120; // 방 하나당 최대 12,000개 메시지
  const BM_REASON = {
    same: '복사된 대화에 원본 방 정보가 없어서 찾지 못했어요',
    empty: '대화 기록이 비어 있어요',
    long: '대화가 너무 길어서 끝까지 읽지 못했어요',
  };
  const bmOn = (k) => !(isObj(conf.branch) && conf.branch[k] === false);
  const bmAutoScan = () => isObj(conf.branch) && conf.branch.autoScan === true;
  const bmSleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // ── 저장소: 읽기는 캐시, 쓰기는 같은 틱 안의 여러 번을 한 번으로 모아 바로 쓴다(분기 기록 쪽 brRead/brWrite와 순서가 엇갈리지 않게) ──
  let bmCache = null, bmQueued = false;
  function bmStore() {
    if (bmCache) return bmCache;
    const s = readJSON(BM_KEY);
    const st = isObj(s) ? s : {};
    if (!isObj(st.rooms)) st.rooms = {};
    if (!isObj(st.branches)) st.branches = {};
    if (typeof st.updatedAt !== 'number') st.updatedAt = 0;
    bmCache = st;
    return st;
  }
  function bmSave(store) {
    if (isObj(store)) bmCache = store;
    if (bmQueued) return;
    bmQueued = true;
    queueMicrotask(() => {
      bmQueued = false;
      const s = bmStore();
      s.updatedAt = Date.now();
      writeJSON(BM_KEY, s);
      bmDirty();
      emit('branch', s);
      sideSoon(); // 원본 방 깃발(사이드바)도 다시
    });
  }

  // ── 위치 · 글자 다듬기 ──
  function bmHere() {
    const p = location.pathname;
    let m = p.match(/^\/stories\/([0-9a-f]{24})(?:\/episodes\/([0-9a-f]{24}))?(?:[/?#]|$)/i);
    if (m) return { storyId: m[1], chatId: m[2] || '' };
    m = p.match(/^\/detail\/([0-9a-f]{24})(?:[/?#]|$)/i);
    return { storyId: m ? m[1] : '', chatId: '' };
  }
  function bmPlain(c) {
    return String(c == null ? '' : c)
      .replace(/^\s*\[\/\/\]: # \(.*\)\s*$/gm, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[*_~`>#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // 갈라지기 직전 장면: 끝 문장 한 줄(짧으면 앞 문장을 붙이되 90자까지)
  function bmScene(info) {
    const t = info && typeof info.tail === 'string' ? bmPlain(info.tail) : '';
    if (!t) return '';
    const ss = t.match(/[^.!?…。]+[.!?…。]+["'”’」』)]*|[^.!?…。]+$/g) || [t];
    let line = ss.pop().trim();
    while (ss.length && line.length < 24) {
      const prev = ss.pop().trim();
      if (prev.length + line.length > 90) break;
      line = prev + ' ' + line;
    }
    return line.length > 90 ? '…' + line.slice(-90) : line;
  }
  function bmDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const md = (d.getMonth() + 1) + '/' + d.getDate();
    return d.getFullYear() === new Date().getFullYear() ? md : String(d.getFullYear()).slice(2) + '/' + md;
  }
  const bmShort = (ms) => (!ms ? '' : Date.now() - ms < 3600 * 1000 ? '방금' : bmDate(ms));
  function bmStamp(ms) { const d = new Date(ms); return bmDate(ms) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function bmHue(id) { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  const bmFirst = (t) => Array.from(String(t || '').trim())[0] || '·';
  const bmTitle = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  const bmMs = (v) => (typeof v === 'number' ? v : Date.parse(v || '') || 0);
  const bmReduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function bmTheme() {
    const t = document.body && document.body.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // ── 공용 채팅 인덱스(통합 쪽 chatIndex) ──
  function bmCI() { try { return typeof chatIndex === 'object' && chatIndex ? chatIndex : null; } catch (_) { return null; } }
  function bmIndex() { const ci = bmCI(); const x = ci ? attempt(() => ci.get()) : null; return x && Array.isArray(x.chats) && x.byId ? x : null; }
  function bmIdxStatus() { const ci = bmCI(); return (ci && attempt(() => ci.status())) || 'idle'; }

  // ── 방 정보: 저장소 + 인덱스를 합친다 ──
  function bmImg(story) {
    for (const k of ['portraitImage', 'profileImage']) {
      const im = story && story[k];
      if (!isObj(im)) continue;
      for (const s of ['w200', 'w600', 'origin']) if (typeof im[s] === 'string' && /^https:\/\//.test(im[s])) return im[s];
    }
    return '';
  }
  function bmFromChat(c) {
    const st = isObj(c.story) ? c.story : {};
    return {
      id: c._id, title: bmTitle(c.title) || bmTitle(st.name) || '제목 없는 방', storyId: st._id || '', storyName: bmTitle(st.name), image: bmImg(st),
      isBranch: c.isCreatedFromBranch === true, missing: false, createdAt: bmMs(c.createdAt), messagedAt: bmMs(c.messagedAt || c.updatedAt || c.createdAt), updatedAt: 0,
    };
  }
  function bmFromStore(id, r) {
    return {
      id, title: bmTitle(r.title), storyId: typeof r.storyId === 'string' ? r.storyId : '', storyName: bmTitle(r.storyName), image: typeof r.image === 'string' ? r.image : '',
      isBranch: r.isBranch === true, missing: r.missing === true, createdAt: bmMs(r.createdAt), messagedAt: bmMs(r.messagedAt), updatedAt: Number(r.updatedAt) || 0,
    };
  }
  // 저장소에 넣을 방 정보(계약 필드 + 표지·날짜)
  const bmRoomRec = (r) => ({ id: r.id, title: r.title, storyId: r.storyId, storyName: r.storyName, isBranch: !!r.isBranch, image: r.image || '', createdAt: r.createdAt || 0, messagedAt: r.messagedAt || 0 });
  function bmRooms(st, idx) {
    const out = new Map();
    const at = idx ? Number(idx.at) || 0 : 0;
    for (const id of Object.keys(st.rooms)) {
      const r = st.rooms[id];
      if (!isObj(r) || !BM_ID.test(id)) continue;
      const c = idx ? idx.byId.get(id) : null;
      if (c) { const x = bmFromChat(c); if (r.isBranch === true) x.isBranch = true; out.set(id, x); continue; }
      const x = bmFromStore(id, r);
      if (!x.title && !x.missing) x.title = '제목 없는 방';
      // 인덱스(모든 방)에 없는데 기록이 인덱스보다 오래됐으면 지워진 방. 방금 생긴 방은 기록이 더 새것이라 그대로 둔다
      if (idx && !x.missing) { const b = st.branches[id]; if (Math.max(x.updatedAt, isObj(b) ? Number(b.at) || 0 : 0) < at) x.missing = true; }
      out.set(id, x);
    }
    if (idx) {
      for (const c of idx.chats) if (c && c.isCreatedFromBranch === true && BM_ID.test(c._id || '') && !out.has(c._id)) out.set(c._id, bmFromChat(c));
      for (const id of Object.keys(st.branches)) {
        const b = st.branches[id], p = isObj(b) ? b.parentId : '';
        if (p && !out.has(p) && idx.byId.get(p)) out.set(p, bmFromChat(idx.byId.get(p)));
      }
    }
    for (const id of Object.keys(st.branches)) { const b = st.branches[id], x = out.get(id); if (x && isObj(b) && b.parentId) x.isBranch = true; }
    return out;
  }

  // ── 숲 만들기(순수 함수): 루트 = 아는 원본이 없는 방, 자식은 턴순, 고리는 끊고, 작품별로 묶어 지금 작품을 맨 앞에 ──
  function bmBuildForest(rooms, branches, hereStory) {
    const nodes = new Map();
    const nodeOf = (id) => {
      let n = nodes.get(id);
      if (!n) { n = { id, room: rooms.get(id) || null, info: isObj(branches[id]) ? branches[id] : null, parent: null, children: [], desc: 0, latest: 0, groupKey: '_' }; nodes.set(id, n); }
      return n;
    };
    for (const room of rooms.values()) {
      if (!room.isBranch || room.missing) continue; // 지워진 분기 방은 아래 가지가 있을 때만 원본 자리(열 수 없음)로 나온다
      const node = nodeOf(room.id);
      const info = node.info;
      // 원본 id는 24자리 hex만(분기 기록 쪽은 URL에서 꺼낸 값을 그대로 적으므로, 속성에 그대로 넣기 전에 형식을 확인한다)
      const pid = info && !info.unresolved && typeof info.parentId === 'string' && BM_ID.test(info.parentId) ? info.parentId : '';
      if (pid && pid !== room.id) { const p = nodeOf(pid); node.parent = p; p.children.push(node); }
    }
    // 원본 관계가 꼬여 고리가 생기면, 루트에서 닿지 않는 방을 루트로 끊어 낸다
    const roots = [...nodes.values()].filter((n) => !n.parent);
    const seen = new Set();
    const walk = (n) => { const st = [n]; while (st.length) { const x = st.pop(); if (seen.has(x.id)) continue; seen.add(x.id); for (const c of x.children) st.push(c); } };
    roots.forEach(walk);
    for (const n of nodes.values()) {
      if (seen.has(n.id)) continue;
      if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n);
      n.parent = null;
      roots.push(n);
      walk(n);
    }
    const turnOf = (n) => (n.info && typeof n.info.turn === 'number' ? n.info.turn : Infinity);
    const finish = (n) => {
      n.children.sort((a, b) => turnOf(a) - turnOf(b) || ((a.room && a.room.createdAt) || 0) - ((b.room && b.room.createdAt) || 0));
      n.latest = (n.room && n.room.messagedAt) || 0;
      n.desc = 0;
      for (const c of n.children) { finish(c); n.desc += 1 + c.desc; if (c.latest > n.latest) n.latest = c.latest; }
    };
    const storyOf = (n) => {
      const st = [n];
      while (st.length) { const x = st.shift(); if (x.room && x.room.storyId) return { id: x.room.storyId, name: x.room.storyName }; st.push(...x.children); }
      return { id: '', name: '' };
    };
    const groups = new Map();
    for (const root of roots) {
      finish(root);
      const s = storyOf(root);
      const key = s.id || '_';
      let g = groups.get(key);
      if (!g) { g = { key, storyId: s.id, storyName: s.name || '', roots: [], latest: 0, count: 0 }; groups.set(key, g); }
      if (!g.storyName && s.name) g.storyName = s.name;
      g.roots.push(root);
      if (root.latest > g.latest) g.latest = root.latest;
      g.count += (root.room && root.room.isBranch && !root.room.missing ? 1 : 0) + root.desc;
      const st = [root];
      while (st.length) { const x = st.pop(); x.groupKey = key; for (const c of x.children) st.push(c); }
    }
    const list = [...groups.values()];
    for (const g of list) { if (!g.storyName) g.storyName = '작품 정보 없음'; g.roots.sort((a, b) => b.latest - a.latest); }
    // 지금 작품 먼저, 작품을 모르는 묶음('_')은 맨 뒤(지금 작품이 없을 때 '_'가 맨 앞에 오던 결함 수정), 나머지는 최근 순
    const here = (g) => (hereStory && g.storyId === hereStory ? 1 : 0);
    list.sort((a, b) => here(b) - here(a) || (a.storyId ? 0 : 1) - (b.storyId ? 0 : 1) || b.latest - a.latest);
    return { groups: list, nodes };
  }
  function bmAnc(id, nodes) { const ids = new Set(); let n = id ? nodes.get(id) : null; while (n && !ids.has(n.id)) { ids.add(n.id); n = n.parent; } return ids; }
  function bmDesc(id, nodes) {
    const out = [], n = nodes.get(id);
    if (!n) return out;
    const st = n.children.slice().reverse();
    while (st.length) { const x = st.pop(); out.push(x.id); for (let i = x.children.length - 1; i >= 0; i--) st.push(x.children[i]); }
    return out;
  }
  // 숲 캐시: 저장소·인덱스·경로(지금 작품)가 바뀔 때만 다시 만든다
  let bmF = null;
  function bmDirty() { bmF = null; }
  function bmForest() {
    const here = bmHere().storyId;
    if (bmF && bmF.here === here) return bmF;
    const st = bmStore();
    const f = bmBuildForest(bmRooms(st, bmIndex()), st.branches, here);
    const tree = new Set(), linked = new Set();
    let count = 0, pendingN = 0, unresN = 0;
    for (const g of f.groups) count += g.count;
    for (const n of f.nodes.values()) {
      if (n.room && !n.room.missing) tree.add(n.id);
      if (n.parent || n.children.length) linked.add(n.id);
      if (!n.parent && n.room && !n.room.missing && n.room.isBranch) { if (n.info && n.info.unresolved && !n.info.failed) unresN++; else pendingN++; }
    }
    bmF = Object.assign(f, { here, tree, linked, count, pendingN, unresN });
    return bmF;
  }

  // ── 아이콘 · 로고(옛 갈래 매듭 리본 로고를 정적 SVG로) ──
  const BM_TI = {
    refresh: '<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/>',
    radar: '<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15.51 15.56a5 5 0 1 0 -3.51 1.44"/><path d="M18.832 17.86a9 9 0 1 0 -6.832 3.14"/><path d="M12 12v9"/>',
    down: '<path d="M6 9l6 6l6 -6"/>',
    go: '<path d="M5 12l14 0"/><path d="M13 18l6 -6"/><path d="M13 6l6 6"/>',
    x: '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>',
    warn: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/>',
    help: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"/><path d="M12 16v.01"/><path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483"/>',
    check: '<path d="M5 12l5 5l10 -10"/>',
    unlink: '<path d="M17 22v-2"/><path d="M9 15l6 -6"/><path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"/><path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"/><path d="M20 17h2"/><path d="M2 7h2"/><path d="M7 2v2"/>',
    seed: '<path d="M12 10a6 6 0 0 0 -6 -6h-3v2a6 6 0 0 0 6 6h3"/><path d="M12 14a6 6 0 0 1 6 -6h3v1a6 6 0 0 1 -6 6h-3"/><path d="M12 20l0 -10"/>',
    clock: '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 12l3 2"/><path d="M12 7v5"/>',
    stop: '<path d="M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2"/>',
  };
  const bmTi = (n) => '<svg class="ti" viewBox="0 0 24 24" aria-hidden="true">' + BM_TI[n] + '</svg>';
  // 옛 갈래 매듭 로고 경로(마스크 3 · 리본 1 · 위로 지나가는 조각 3)
  const BM_KNOT = {'mask':['M64.291 56.001C66.516 56.013 68.740 56.164 70.933 56.452C73.125 56.739 75.287 57.163 77.388 57.716C79.490 58.269 81.531 58.951 83.485 59.750C85.439 60.549 87.306 61.465 89.061 62.482C90.816 63.499 92.460 64.616 93.970 65.815C95.481 67.014 96.858 68.295 98.086 69.633','M76.844 78.751C75.721 80.673 74.478 82.523 73.133 84.278C71.788 86.033 70.340 87.693 68.810 89.237C67.280 90.780 65.669 92.207 64.000 93.500C62.331 94.793 60.605 95.951 58.846 96.963C57.088 97.974 55.298 98.839 53.505 99.547C51.711 100.256 49.914 100.809 48.141 101.203','M50.865 78.248C49.763 76.315 48.782 74.313 47.934 72.270C47.087 70.228 46.373 68.144 45.802 66.047C45.230 63.951 44.800 61.842 44.514 59.750C44.229 57.659 44.089 55.584 44.092 53.555C44.095 51.527 44.242 49.545 44.525 47.637C44.808 45.730 45.228 43.896 45.773 42.164'],'ribbon':'M64.000 56.000C68.363 56.000 72.726 56.539 76.865 57.581C81.005 58.624 84.920 60.169 88.414 62.114C91.908 64.059 94.980 66.404 97.481 68.990C99.982 71.577 101.911 74.405 103.186 77.281C104.461 80.158 105.080 83.082 105.035 85.851C104.990 88.620 104.280 91.233 102.971 93.500C101.662 95.767 99.755 97.688 97.379 99.112C95.003 100.535 92.161 101.461 89.033 101.796C85.904 102.130 82.491 101.873 79.000 101.000C75.509 100.127 71.943 98.639 68.512 96.586C65.080 94.533 61.784 91.915 58.812 88.851C55.839 85.787 53.191 82.279 51.010 78.500C48.828 74.721 47.114 70.674 45.946 66.568C44.779 62.462 44.160 58.298 44.098 54.300C44.035 50.301 44.530 46.469 45.519 43.010C46.509 39.550 47.993 36.465 49.847 33.923C51.701 31.381 53.923 29.383 56.344 28.037C58.765 26.692 61.382 26.000 64.000 26.000C66.618 26.000 69.235 26.692 71.656 28.037C74.077 29.383 76.299 31.381 78.153 33.923C80.007 36.465 81.491 39.550 82.481 43.010C83.470 46.469 83.965 50.301 83.902 54.300C83.840 58.298 83.221 62.462 82.054 66.568C80.886 70.674 79.172 74.721 76.990 78.500C74.809 82.279 72.161 85.787 69.188 88.851C66.216 91.915 62.920 94.533 59.488 96.586C56.057 98.639 52.491 100.127 49.000 101.000C45.509 101.873 42.096 102.130 38.967 101.796C35.839 101.461 32.997 100.535 30.621 99.112C28.245 97.688 26.338 95.767 25.029 93.500C23.720 91.233 23.010 88.620 22.965 85.851C22.920 83.082 23.539 80.158 24.814 77.281C26.089 74.405 28.018 71.577 30.519 68.990C33.020 66.404 36.092 64.059 39.586 62.114C43.080 60.169 46.995 58.624 51.135 57.581C55.274 56.539 59.637 56.000 64.000 56.000Z','over':['M62.689 56.016C65.091 55.957 67.500 56.061 69.878 56.324C72.256 56.587 74.603 57.011 76.883 57.586C79.163 58.161 81.375 58.887 83.485 59.750C85.596 60.613 87.604 61.612 89.480 62.728C91.356 63.843 93.100 65.075 94.685 66.397C96.270 67.719 97.697 69.132 98.944 70.607','M77.632 77.356C76.482 79.466 75.188 81.501 73.771 83.428C72.354 85.356 70.813 87.177 69.176 88.864C67.538 90.551 65.803 92.104 64.000 93.500C62.198 94.896 60.328 96.136 58.424 97.203C56.520 98.270 54.581 99.164 52.644 99.876C50.706 100.587 48.769 101.116 46.869 101.459','M51.679 79.627C50.427 77.577 49.312 75.439 48.351 73.248C47.390 71.056 46.583 68.812 45.941 66.550C45.299 64.288 44.822 62.009 44.514 59.750C44.207 57.491 44.068 55.252 44.096 53.070C44.124 50.887 44.319 48.761 44.671 46.727C45.024 44.694 45.534 42.752 46.187 40.934']};
  let bmLogoN = 0;
  // 리본 매듭(교차 부분은 마스크로 위·아래를 엮는다). mask id는 문서 안에서 겹치지 않게 매번 새로
  function bmLogo(cls, fixedId, size) {
    const id = fixedId || 'cpb-bm-lw' + (++bmLogoN);
    return '<svg class="' + cls + '" viewBox="0 0 128 128"' + (size ? ' width="' + size + '" height="' + size + '"' : '') + ' fill="none" aria-hidden="true" focusable="false">'
      + '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="128" height="128"><rect width="128" height="128" fill="white"/>'
      + BM_KNOT.mask.map((d) => '<path d="' + d + '" fill="none" stroke="black" stroke-width="18"/>').join('')
      + '</mask></defs><g stroke="currentColor" stroke-width="12.8" stroke-linecap="butt" stroke-linejoin="round"><g mask="url(#' + id + ')"><path d="' + BM_KNOT.ribbon + '"/></g><g>'
      + BM_KNOT.over.map((d) => '<path d="' + d + '"/>').join('') + '</g></g></svg>';
  }
  // '확장 기능' 메뉴 행 아이콘(통합 쪽 register에서 쓴다)
  const BM_MENU_ICON = bmLogo('cpb-bm-menu-lg', 'cpb-bm-lw-menu', 24);

  // ── 창 스타일(Shadow DOM 안). 색은 크랙 토큰(없으면 옛 값), 강조색은 옛 세이지 ──
  const BM_PANEL_CSS = `
:host{all:initial}
*{box-sizing:border-box}
button{font:inherit;color:inherit;letter-spacing:inherit;cursor:pointer}
button:disabled{cursor:default}
.stage{position:fixed;inset:0;pointer-events:none;isolation:isolate;font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;font-size:14px;line-height:normal;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;text-align:left;
 --canvas:var(--bg_screen,#18181a);--text:var(--text_primary,#ededee);--text-2:var(--text_secondary,#9b9ba1);--text-3:var(--text_tertiary,#66666c);
 --rule:var(--outline_tertiary,rgba(255,255,255,.08));--rule-2:var(--outline_secondary,rgba(255,255,255,.16));--surface:var(--surface_tertiary,rgba(255,255,255,.05));--hover:var(--state_hover,rgba(255,255,255,.07));
 --surface-2:color-mix(in srgb,var(--text) 9%,transparent);--surface-3:color-mix(in srgb,var(--text) 13%,transparent);--rail:color-mix(in srgb,var(--text) 24%,var(--canvas));
 --accent:#8cc59e;--accent-soft:rgba(140,197,158,.13);--accent-on:#122018;--danger:#ee8a8a;
 --ring:0 0 0 1px rgba(255,255,255,.08);--ring-hover:0 0 0 1px rgba(255,255,255,.14);--lift:0 0 0 1px rgba(255,255,255,.1),0 28px 64px -16px rgba(0,0,0,.75);--dim:rgba(0,0,0,.55);
 --out:cubic-bezier(.2,0,0,1);--spring:cubic-bezier(.34,1.4,.64,1);color:var(--text)}
.stage[data-theme=light]{--canvas:var(--bg_screen,#fff);--text:var(--text_primary,#1c1c1b);--text-2:var(--text_secondary,#6b6b68);--text-3:var(--text_tertiary,#a3a3a0);
 --rule:var(--outline_tertiary,rgba(0,0,0,.08));--rule-2:var(--outline_secondary,rgba(0,0,0,.15));--surface:var(--surface_tertiary,rgba(0,0,0,.035));--hover:var(--state_hover,rgba(0,0,0,.05));
 --accent:#4f8a63;--accent-soft:rgba(79,138,99,.1);--accent-on:#fff;--danger:#c4545a;
 --ring:0 0 0 1px rgba(0,0,0,.06),0 1px 2px -1px rgba(0,0,0,.06),0 2px 4px 0 rgba(0,0,0,.04);--ring-hover:0 0 0 1px rgba(0,0,0,.09),0 1px 2px -1px rgba(0,0,0,.08),0 2px 4px 0 rgba(0,0,0,.06);--lift:0 0 0 1px rgba(0,0,0,.06),0 28px 64px -18px rgba(0,0,0,.32);--dim:rgba(0,0,0,.34)}
.ti{display:block;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
@keyframes bm-fade{from{opacity:0}}
@keyframes bm-out{to{opacity:0}}
@keyframes bm-pn{from{opacity:0;transform:translateY(8px) scale(.985)}}
@keyframes bm-pnout{to{opacity:0;transform:translateY(4px)}}
@keyframes bm-spin{to{transform:rotate(360deg)}}
@keyframes bm-in{from{opacity:0;transform:translateY(4px)}}
@keyframes bm-pop{from{transform:scale(0)}}
@keyframes bm-cf{from{opacity:0;transform:translateY(4px) scale(.97)}}
@keyframes bm-ind{to{transform:translateX(360%)}}
@keyframes bm-toast{0%{opacity:0;transform:translate(-50%,6px)}10%,82%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}
@keyframes bm-new{from{opacity:1}}
@keyframes bm-jgo{50%{transform:scale(1.6)}}
/* 창 */
.ov{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:var(--dim);pointer-events:auto;animation:bm-fade .18s var(--out) both}
.ov.out{animation:bm-out .15s var(--out) forwards}
.pn{width:min(720px,calc(100% - 24px));height:min(640px,calc(100% - 48px));display:flex;flex-direction:column;overflow:hidden;background:var(--canvas);color:var(--text);border-radius:20px;box-shadow:var(--lift);animation:bm-pn .24s var(--out) both}
.ov.out .pn{animation:bm-pnout .15s var(--out) forwards}
.pn:focus{outline:none}
.hd{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;background:var(--surface)}
.mark{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:10px;background:var(--canvas);box-shadow:var(--ring);color:var(--text)}
.mark .lg{display:block;width:22px;height:22px;overflow:visible;transition:transform .35s var(--spring)}
.mark:hover .lg{transform:rotate(120deg)}
.ttl{display:flex;flex-direction:column;gap:1px;min-width:0}
.ttl b{font-size:15.5px;font-weight:700;letter-spacing:-.025em;line-height:1.25}
.ttl small{font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.grow{flex:1 1 auto;min-width:0}
.ib{width:32px;height:32px;flex:0 0 32px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:none;color:var(--text-2);transition:background-color .15s var(--out),color .15s var(--out)}
.ib:hover{background:var(--hover);color:var(--text)}
.ib:active{transform:scale(.96)}
.ib .ti{width:18px;height:18px}
.tb{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 14px 10px 16px;background:var(--surface)}
.seg{position:relative;display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:color-mix(in srgb,var(--accent) 7%,var(--surface-2));isolation:isolate}
.seg>i{position:absolute;z-index:-1;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:7px;background:var(--canvas);box-shadow:var(--ring);transform:translateX(calc(100% * var(--i)));transition:transform .25s var(--out)}
.seg button{min-width:78px;height:30px;padding:0 12px;border:0;background:none;color:var(--text-2);font-size:12.5px;font-weight:600;transition:color .15s var(--out)}
.seg button.on{color:var(--text)}
.seg button:disabled{opacity:.4}
.btn{height:32px;display:inline-flex;align-items:center;gap:6px;padding:0 12px 0 10px;border:0;border-radius:9px;background:var(--canvas);box-shadow:var(--ring);color:var(--text);font-size:12.5px;font-weight:600;white-space:nowrap;transition:box-shadow .15s var(--out),background-color .15s var(--out)}
.btn:hover{box-shadow:var(--ring-hover);background:var(--hover)}
.btn:active{transform:scale(.96)}
.btn:disabled{opacity:.45;transform:none}
.btn .ti{width:16px;height:16px;color:var(--text-2)}
.btn.solid{background:var(--text);color:var(--canvas);box-shadow:none;padding:0 12px}
.btn.solid:hover{background:var(--text);opacity:.88}
.btn.accent{background:var(--accent);color:var(--accent-on);box-shadow:none}
.btn.accent .ti{color:inherit}
.btn:focus-visible,.ib:focus-visible,.seg button:focus-visible,.gh:focus-visible,.fold:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.busy .rf .ti{animation:bm-spin .9s linear infinite}
/* 상태 줄 */
[data-st]{background:var(--surface);border-bottom:1px solid var(--rule);margin-bottom:4px}
.st{display:flex;align-items:center;gap:7px;min-height:28px;margin:0 16px;padding-bottom:9px;font-size:12px;line-height:1.45;color:var(--text-2);font-variant-numeric:tabular-nums}
.st b{color:var(--text);font-weight:600}
.st .ti{width:15px;height:15px}
.st[data-tone=err]{color:var(--danger)}
.st[data-tone=err] .btn{height:26px;font-size:12px}
.st .sp{width:12px;height:12px;flex:0 0 12px;border:2px solid var(--rule-2);border-top-color:var(--text);border-radius:50%;animation:bm-spin .8s linear infinite}
.st.found,.st.found b{color:var(--accent)}
.prog{position:relative;height:2px;margin:-4px 16px 7px;border-radius:2px;background:var(--rule);overflow:hidden}
.prog i{position:absolute;inset:0;background:var(--text);transform-origin:0 50%;transform:scaleX(var(--p,0));transition:transform .3s var(--out)}
.prog.ind i{right:auto;width:28%;transform:translateX(-100%);transition:none;animation:bm-ind 1.1s ease-in-out infinite}
/* 본문 · 바닥 줄 · 확인 팝업 · 창 안 알림 */
.bd{flex:1 1 auto;min-height:0;overflow:auto;padding:2px 16px 16px;overscroll-behavior:contain;position:relative;scrollbar-width:thin;scrollbar-color:var(--rail) transparent}
.ft{position:relative;display:flex;align-items:center;gap:8px;padding:10px 14px 12px 16px;border-top:1px solid var(--rule);background:var(--surface);font-size:12px;color:var(--text-3)}
.ft>span:first-child{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ft .btn{height:30px;font-size:12px}
.ft .btn .ti{transition:transform .3s var(--out)}
.ft .btn:hover .ti{transform:rotate(30deg)}
.cf{position:absolute;right:14px;bottom:calc(100% + 8px);z-index:5;width:300px;padding:14px;border-radius:16px;background:var(--canvas);box-shadow:var(--lift);color:var(--text);transform-origin:90% 100%;animation:bm-cf .18s var(--out) both}
.cf b{display:block;font-size:13.5px;margin-bottom:5px}
.cf p{margin:0 0 10px;font-size:12px;line-height:1.55;color:var(--text-2)}
.ck{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:12px;color:var(--text-2);cursor:pointer;user-select:none}
.ck input{width:15px;height:15px;margin:0;accent-color:var(--accent);cursor:pointer}
.cfb{display:flex;justify-content:flex-end;gap:6px}
.toast{position:absolute;left:50%;bottom:22px;z-index:60;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:9px 14px 9px 12px;border-radius:999px;background:var(--text);color:var(--canvas);font-size:12.5px;font-weight:600;white-space:nowrap;box-shadow:0 10px 26px rgba(0,0,0,.28);animation:bm-toast 2.4s var(--out) both;pointer-events:none}
.toast .ti{width:15px;height:15px}
/* 작품 묶음 */
.grp+.grp{margin-top:8px}
.gh{position:sticky;top:-2px;z-index:3;display:flex;align-items:center;gap:8px;width:100%;margin:0;padding:10px 2px 8px;border:0;background:var(--canvas);color:var(--text);font-size:13px;font-weight:700;text-align:left}
.gh .ti{width:16px;height:16px;color:var(--text-3);transition:transform .2s var(--out)}
.grp.closed .gh>.ti{transform:rotate(-90deg)}
.gh .nm{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n{font-size:12px;font-weight:600;color:var(--text-3);font-variant-numeric:tabular-nums}
.gh .here{margin-left:2px;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--accent);white-space:nowrap}
.gh::after{content:'';flex:1;height:1px;background:var(--rule);margin-left:4px}
.gb{padding:0 4px;margin:0 -4px}
.grp.closed .gb{display:none}
/* 나무: 원본 카드 + 레일 위의 분기 줄 */
.tree{position:relative;padding:4px 0 6px;isolation:isolate}
.tree>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1}
.tree .rl{fill:none;stroke:var(--rail);stroke-width:1.5;stroke-linecap:round;animation:bm-fade .3s var(--out) backwards;animation-delay:calc(var(--k) * 25ms + 60ms);transition:opacity .15s var(--out)}
.tree .rl.lv2{opacity:.8}
.tree .rl.lv3{opacity:.6;stroke-width:1.25}
.tree .rl.hot{stroke:var(--accent);stroke-width:2;opacity:1}
.tree .jn{fill:var(--canvas);stroke:var(--text-2);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:bm-pop .28s var(--spring) backwards;animation-delay:calc(var(--k) * 25ms + 200ms);transition:opacity .15s var(--out)}
.tree .jn.lv2{stroke:var(--text-3)}
.tree .jn.lv3{stroke:var(--rail);fill:var(--rail)}
.tree .jn.hot{stroke:var(--accent)}
.tree .jn.cur{fill:var(--accent);stroke:var(--accent)}
.tree .ring{fill:none;stroke:var(--accent);stroke-width:1.5;opacity:.45;transition:opacity .15s var(--out)}
.nd{position:relative;animation:bm-in .3s var(--out) backwards;animation-delay:calc(var(--k) * 25ms)}
.quiet .rl,.quiet .jn,.quiet .nd{animation:none}
.quiet .rl.fresh{animation:bm-fade .25s var(--out) backwards;animation-delay:calc(var(--k) * 25ms + 40ms)}
.quiet .jn.fresh{animation:bm-pop .26s var(--spring) backwards;animation-delay:calc(var(--k) * 25ms + 120ms)}
.quiet .nd.fresh{animation:bm-in .22s var(--out) backwards;animation-delay:calc(var(--k) * 25ms)}
.nd.top{margin:0 0 4px}
.nd.top+.nd.top,.nd.br+.nd.top{margin-top:12px}
.card{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 10px 8px 8px;border:0;border-radius:16px;background:var(--canvas);box-shadow:var(--ring);color:var(--text);text-align:left;cursor:pointer;outline:0;transition:box-shadow .15s var(--out),background-color .15s var(--out)}
.card:hover{box-shadow:var(--ring-hover);background:var(--hover)}
.card:active{transform:scale(.99)}
.card:focus-visible,.nd.br:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card.cur{box-shadow:0 0 0 1.5px var(--accent);background:var(--accent-soft)}
.card.missing{cursor:default;background:none;box-shadow:none;outline:1.5px dashed var(--rule-2);outline-offset:-1.5px}
.card.missing:active{transform:none}
.cover{position:relative;width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:8px;background:linear-gradient(150deg,hsl(var(--h) 20% 58%),hsl(calc(var(--h) + 30) 16% 40%));color:rgba(255,255,255,.92);font-size:15px;font-weight:700;overflow:hidden}
.cover::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.stage[data-theme=light] .cover::after{box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:inherit}
.card.missing .cover,.card.unres .cover{background:var(--surface-2);color:var(--text-3)}
.cover .ti{width:18px;height:18px}
.card .cb b{font-size:14px;font-weight:650}
.card .cb small{color:var(--text-3)}
.nd.br{display:flex;align-items:center;gap:10px;min-height:46px;margin:1px 0;padding:6px 8px 6px calc(var(--d) * 20px + 44px);color:var(--text);cursor:pointer;outline:0}
.nd.br::before{content:'';position:absolute;inset:0 0 0 calc(var(--d) * 20px + 36px);z-index:-1;border-radius:10px;background:transparent;transition:background-color .15s var(--out)}
.nd.br:hover::before{background:var(--hover)}
.nd.br:active{transform:scale(.995)}
.nd.br.cur::before{background:var(--accent-soft)}
.nd.br.new::after{content:'';position:absolute;inset:0 0 0 calc(var(--d) * 20px + 36px);z-index:-1;border-radius:10px;background:color-mix(in srgb,var(--accent) 28%,transparent);opacity:0;animation:bm-new 2.4s var(--out)}
.turn{width:38px;flex:0 0 38px;font-size:11.5px;font-weight:700;color:var(--text-2);font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.nd.br.cur .turn{color:var(--accent)}
.cb{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cb b{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;font-weight:600;line-height:1.35}
.cb b span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cb small{font-size:12px;line-height:1.4;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nd.br.lv2 .cb b{font-weight:550;color:color-mix(in srgb,var(--text) 86%,var(--canvas))}
.nd.br.lv2 .cb small,.nd.br.lv2 .turn{color:var(--text-3)}
.nd.br.lv3 .cb b{font-weight:500;font-size:13px;color:color-mix(in srgb,var(--text) 72%,var(--canvas))}
.nd.br.lv3 .cb small{display:none}
.nd.br.lv3 .turn{color:var(--text-3)}
.nd.br.cur .cb b{color:var(--text)}
.nd.br.cur .cb small{color:var(--text-2);display:block}
.now{font-style:normal;flex:0 0 auto;display:inline-flex;align-items:center;gap:5px;height:19px;padding:0 7px;border-radius:999px;background:var(--accent);color:var(--accent-on);font-size:11px;font-weight:700}
.live{display:inline-block;width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:currentColor;font-style:normal}
.newchip{font-style:normal;flex:0 0 auto;height:19px;padding:0 7px;display:inline-flex;align-items:center;border-radius:999px;box-shadow:inset 0 0 0 1px var(--accent);color:var(--accent);font-size:11px;font-weight:700;animation:bm-fade .25s var(--out) both}
.dt{flex:0 0 auto;font-size:11.5px;color:var(--text-3);font-variant-numeric:tabular-nums}
.go{flex:0 0 18px;width:18px;height:18px;color:var(--text-3);opacity:0;transform:translateX(-4px);transition:opacity .15s var(--out),transform .2s var(--out)}
.go .ti{width:18px;height:18px}
.card:hover .go,.nd.br:hover .go{opacity:1;transform:none}
.fold{position:relative;z-index:2;flex:0 0 auto;height:24px;display:inline-flex;align-items:center;gap:2px;padding:0 6px 0 4px;border:0;border-radius:7px;background:var(--canvas);box-shadow:var(--ring);color:var(--text-2);font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;transition:background-color .15s var(--out)}
.nd.br .fold{background:var(--surface-2);box-shadow:none}
.fold:hover{background:var(--surface-3)}
.fold:active{transform:scale(.96)}
.fold .ti{width:14px;height:14px;transition:transform .2s var(--out)}
.fold.closed .ti{transform:rotate(-90deg)}
.card:has(.fold) .go,.nd.br:has(.fold) .go{display:none}
/* 빈 상태 · 처음 */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:100%;padding:24px;text-align:center;color:var(--text-2);font-size:13px;line-height:1.6}
.empty b{color:var(--text);font-size:15px;font-weight:700}
.empty .btn{margin-top:8px}
.art{width:84px;height:84px;margin-bottom:6px;display:grid;place-items:center;border-radius:24px;background:var(--surface);color:var(--text)}
.art .ti{width:40px;height:40px;stroke-width:1.5}
.art .lg{display:block;width:44px;height:44px}
.skel{display:flex;flex-direction:column;gap:6px;width:100%;max-width:420px;margin-top:10px}
.skel i{height:52px;border-radius:12px;background:var(--surface)}
.skel i:nth-child(2){margin-left:28px}
.skel i:nth-child(3){margin-left:56px}
/* 마우스를 올리면 원본에서 그 방까지 길만 또렷하게 */
.nd.br .cb,.nd.br .turn,.nd.br .dt{transition:opacity .15s var(--out)}
.tree.tracing .rl:not(.tr){opacity:.22}
.tree.tracing .jn:not(.tr),.tree.tracing .ring:not(.tr){opacity:.3}
.tree.tracing .rl.tr:not(.hot){stroke:var(--text-2);stroke-width:2;opacity:1}
.tree.tracing .jn.tr:not(.hot):not(.cur){stroke:var(--text);opacity:1}
.tree.tracing .nd.br:not(.tr) :is(.cb,.turn,.dt){opacity:.42}
/* 이동: 원본에서 그 방까지 길이 강조색으로 */
.tree .rl.go{stroke:var(--accent);stroke-width:2.2;opacity:1!important}
.tree .jn.go{fill:var(--accent);stroke:var(--accent);opacity:1!important;animation:bm-jgo .26s var(--spring) both!important}
.nd.br.going::before,.card.going{background:var(--accent-soft)}
@media (prefers-reduced-motion:reduce){.stage *,.stage *::before,.stage *::after{animation-duration:1ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
`;

  // ── 입구 버튼 스타일(사이트 전역) ──
  const BM_SITE_CSS = `
/* 갈래 지도 입구: 룸 상단바(모델 버튼 묶음 맨 앞) · 사이드바 '채팅 목록' 머리줄(⋯ 앞) */
.cpb-bm-btn,.cpb-bm-mini{position:relative;display:inline-grid;place-items:center;flex:none;margin:0;padding:0;border:0;background:none;color:inherit;cursor:pointer;opacity:.75;transition:background-color .15s,opacity .15s}
.cpb-bm-btn{width:32px;height:32px;border-radius:8px}
.cpb-bm-mini{width:24px;height:24px;padding:4px;border-radius:6px}
.cpb-bm-btn:hover,.cpb-bm-mini:hover,.cpb-bm-btn:focus-visible,.cpb-bm-mini:focus-visible{opacity:1;background:var(--state_hover,rgba(128,128,128,.14))}
.cpb-bm-btn:focus-visible,.cpb-bm-mini:focus-visible{outline:2px solid var(--text_tertiary,#85837d);outline-offset:1px}
.cpb-bm-btn:active,.cpb-bm-mini:active{transform:scale(.96)}
.cpb-bm-lg{display:block;flex:0 0 auto;overflow:visible;transition:transform .35s cubic-bezier(.34,1.4,.64,1)}
.cpb-bm-btn .cpb-bm-lg{width:20px;height:20px}
.cpb-bm-mini .cpb-bm-lg{width:16px;height:16px}
.cpb-bm-btn:hover .cpb-bm-lg,.cpb-bm-mini:hover .cpb-bm-lg{transform:rotate(120deg)}
/* 이 방이 지도에서 다른 방과 이어져 있으면 점 */
.cpb-bm-btn[data-dot]::before{content:"";position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:#4f8a63;box-shadow:0 0 0 2px var(--bg_screen,#fff)}
body[data-theme=dark] .cpb-bm-btn[data-dot]::before{background:#8cc59e;box-shadow:0 0 0 2px var(--bg_screen,#141413)}
/* 풍선 도움말 */
.cpb-bm-btn::after,.cpb-bm-mini::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);z-index:60;padding:5px 8px;border-radius:7px;background:#1b1b1b;color:#fff;font-size:11.5px;font-weight:600;line-height:1.2;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}
.cpb-bm-btn::after{left:50%;transform:translate(-50%,-2px)}
.cpb-bm-btn:hover::after{opacity:1;transform:translate(-50%,0)}
.cpb-bm-mini::after{right:0;transform:translateY(-2px)}
.cpb-bm-mini:hover::after{opacity:1;transform:none}
body[data-theme=dark] :is(.cpb-bm-btn,.cpb-bm-mini)::after{background:#ececec;color:#131313}
@media (hover:none){.cpb-bm-btn::after,.cpb-bm-mini::after{display:none}}
@media (prefers-reduced-motion: reduce){.cpb-bm-btn,.cpb-bm-mini,.cpb-bm-lg,.cpb-bm-btn::after,.cpb-bm-mini::after{transition:none}}
`;

  // ── 창 상태(열 때마다 새로 그리고, 접힘·닫힌 묶음은 이 페이지 동안 기억) ──
  const bm = {
    host: null, root: null, stage: null, open: false, scope: 'all', confirm: false, recheck: false, error: '', note: '',
    found: 0, newIds: null, fresh: null, foundT: 0, closed: new Set(), folded: new Set(), ret: null, downOv: false, traceId: '',
    themeMo: null, scan: null, autoTried: false, keys: false, eatEsc: false, railsRaf: 0,
  };
  const bmQ = (s) => (bm.stage ? bm.stage.querySelector(s) : null);
  const bmQA = (s) => (bm.stage ? Array.from(bm.stage.querySelectorAll(s)) : []);
  function bmStage() {
    if (!bm.stage) {
      const host = document.createElement('div');
      host.id = 'cpb-bm-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
      const sh = host.attachShadow({ mode: 'open' });
      sh.innerHTML = '<style>' + BM_PANEL_CSS + '</style><div class="stage"></div>';
      bm.host = host;
      bm.root = sh;
      bm.stage = sh.querySelector('.stage');
      bmBind(sh);
    }
    if (!bm.host.isConnected) document.body.appendChild(bm.host);
    bm.stage.setAttribute('data-theme', bmTheme());
    return bm.stage;
  }
  // 진행 중인 일: 찾기 > 목록 받기
  function bmBusy() {
    const s = bm.scan;
    const loading = bmIdxStatus() === 'loading';
    if (s && !(s.idx && loading && !s.stop)) return { text: s.stop ? '멈추는 중…' : s.text || '갈라진 지점 찾는 중…', p: s.p };
    if (loading) {
      const ci = bmCI();
      const pr = (ci && attempt(() => ci.progress())) || {};
      const t = Number(pr.total) || 0, d = Number(pr.done) || 0;
      return { text: '채팅방 목록 확인 중…' + (t > 1 ? ' ' + Math.min(d, t) + '/' + t : ''), p: t > 1 ? Math.min(1, d / t) : null };
    }
    return null;
  }
  function bmStatusHtml() {
    if (bm.error) return '<div class="st" data-tone="err">' + bmTi('warn') + '<span class="grow">' + escHtml(bm.error) + '</span><button type="button" class="btn" data-act="refresh">' + bmTi('refresh') + '다시 시도</button></div>';
    const b = bmBusy();
    if (b) return '<div class="st"><span class="sp" aria-hidden="true"></span><span class="grow" data-tx>' + escHtml(b.text) + '</span></div><div class="prog' + (b.p == null ? ' ind' : '') + '"><i style="--p:' + (b.p || 0) + '"></i></div>';
    if (bm.found) return '<div class="st found">' + bmTi('check') + '<span>갈라진 지점 <b>' + bm.found + '</b>개를 찾았어요</span></div>';
    if (bm.note) return '<div class="st">' + bmTi('help') + '<span class="grow">' + escHtml(bm.note) + '</span></div>';
    const f = bmForest();
    const idx = bmIndex();
    const at = idx ? Number(idx.at) || 0 : 0;
    if (!f.groups.length && !at) return '<div class="st"></div>';
    let s = '분기 방 <b>' + f.count + '</b>개, 작품 <b>' + f.groups.length + '</b>개';
    if (f.pendingN) s += ' · 확인 전 <b>' + f.pendingN + '</b>개';
    if (at) s += ' · ' + bmStamp(at) + '에 확인';
    return '<div class="st">' + bmTi('check') + '<span>' + s + '</span></div>';
  }
  function bmCfHtml() {
    const idx = bmIndex();
    const n = idx ? bmTargets(bm.recheck, true).length : -1;
    let p;
    if (n < 0) p = '채팅방 목록부터 확인한 뒤, 확인 전인 분기 방의 대화 기록을 하나씩 읽어서 어느 방 몇 턴에서 갈라졌는지 찾아요.';
    else if (n) p = '분기 방 ' + n + '개의 대화 기록을 하나씩 읽어서 어느 방 몇 턴에서 갈라졌는지 찾아요. 방이 많거나 대화가 길면 몇 분 걸릴 수 있어요.';
    else p = '새로 확인할 분기 방이 없어요. 이미 찾은 방을 다시 확인하려면 아래를 켜 주세요.';
    if (bm.recheck) p += ' 분기할 때 바로 기록된 방은 그대로 둬요.';
    return '<div class="cf" role="alertdialog" aria-label="갈라진 지점 찾기"><b>갈라진 지점을 찾을까요?</b><p>' + escHtml(p) + '</p>'
      + '<label class="ck"><input type="checkbox" data-act="recheck"' + (bm.recheck ? ' checked' : '') + '><span>이미 찾은 방도 다시 확인</span></label>'
      + '<div class="cfb"><button type="button" class="btn" data-act="cfno">취소</button><button type="button" class="btn solid" data-act="cfyes"' + (n === 0 ? ' disabled' : '') + '>찾기</button></div></div>';
  }
  function bmFootHtml() {
    const f = bmForest();
    const btn = bm.scan
      ? '<button type="button" class="btn" data-act="stop"' + (bm.scan.stop ? ' disabled' : '') + '>' + bmTi('stop') + (bm.scan.stop ? '멈추는 중…' : '멈추기') + '</button>'
      : '<button type="button" class="btn' + (f.pendingN ? ' accent' : '') + '" data-act="scan" aria-expanded="' + !!bm.confirm + '">' + bmTi('radar') + '갈라진 지점 찾기</button>';
    return '<span>방을 누르면 그 방으로 이동해요</span><span class="grow"></span>' + btn + (bm.confirm && !bm.scan ? bmCfHtml() : '');
  }
  function bmPanelHtml() {
    const here = bmHere();
    const i = bm.scope === 'story' ? 0 : 1;
    return '<div class="ov" data-ov><div class="pn" role="dialog" aria-modal="true" aria-label="갈래 지도" tabindex="-1">'
      + '<div class="hd"><span class="mark">' + bmLogo('lg') + '</span><span class="ttl"><b>갈래 지도</b><small>v' + escHtml(VERSION) + '</small></span><span class="grow"></span>'
      + '<button type="button" class="ib" data-act="close" aria-label="닫기" title="닫기">' + bmTi('x') + '</button></div>'
      + '<div class="tb"><div class="seg" style="--i:' + i + '"><i></i>'
      + '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-act="scope" data-arg="story" aria-pressed="' + (i === 0) + '"' + (here.storyId ? '' : ' disabled') + '>이 작품</button>'
      + '<button type="button" class="' + (i === 1 ? 'on' : '') + '" data-act="scope" data-arg="all" aria-pressed="' + (i === 1) + '">전체</button></div>'
      + '<span class="grow"></span><button type="button" class="btn rf" data-act="refresh" title="채팅방 목록을 다시 받아요">' + bmTi('refresh') + '새로고침</button></div>'
      + '<div data-st>' + bmStatusHtml() + '</div>'
      + '<div class="bd" data-body>' + bmBodyHtml() + '</div>'
      + '<div class="ft" data-ft>' + bmFootHtml() + '</div>'
      + '</div></div>';
  }
  function bmBodyHtml() {
    const here = bmHere();
    const f = bmForest();
    if (!f.groups.length && !bmIndex()) {
      if (bmIdxStatus() === 'loading') return '<div class="empty"><span class="art">' + bmLogo('lg') + '</span><b>처음 한 번은 조금 걸려요</b><span>채팅방 목록을 훑어서 분기 방을 모으고 있어요.<br>다음부터는 바로 열려요.</span><div class="skel"><i></i><i></i><i></i></div></div>';
      return '<div class="empty"><span class="art">' + bmTi('seed') + '</span><b>지도를 아직 그리지 못했어요</b><span>[새로고침]을 누르면 채팅방을 훑어서 지도를 그려요.</span></div>';
    }
    const groups = bm.scope === 'story' ? f.groups.filter((g) => !!g.storyId && g.storyId === here.storyId) : f.groups;
    if (!groups.length) {
      const story = bm.scope === 'story';
      return '<div class="empty"><span class="art">' + bmTi('seed') + '</span><b>' + (story ? '이 작품에는 아직 분기 방이 없어요' : '분기로 만든 방이 아직 없어요') + '</b>'
        + '<span>답변 메뉴의 [분기]로 새 가지를 만들 수 있어요.</span>' + (story ? '<button type="button" class="btn" data-act="scope" data-arg="all">전체 지도 보기</button>' : '') + '</div>';
    }
    let k = 0;
    return groups.map((g) => {
      const rows = [];
      const walk = (n, d) => { rows.push([n, d]); if (!bm.folded.has(n.id)) for (const c of n.children) walk(c, d + 1); };
      for (const r of g.roots) walk(r, 0);
      const closed = bm.closed.has(g.key);
      const isHere = !!here.storyId && g.storyId === here.storyId;
      return '<section class="grp' + (closed ? ' closed' : '') + '"><button type="button" class="gh" data-act="grp" data-arg="' + escHtml(g.key) + '" aria-expanded="' + !closed + '">' + bmTi('down')
        + '<span class="nm">' + escHtml(g.storyName) + '</span><span class="n">' + g.count + '</span>' + (isHere ? '<span class="here"><i class="live"></i>지금 작품</span>' : '') + '</button>'
        + '<div class="gb"><div class="tree" data-tree><svg aria-hidden="true"></svg>' + rows.map(([n, d]) => bmNodeHtml(n, d, k++, here)).join('') + '</div></div></section>';
    }).join('');
  }
  // 원본은 표지 카드, 분기는 레일 위의 줄
  function bmNodeHtml(node, depth, k, here) {
    const id = node.id, room = node.room, info = node.info;
    const isCur = !!here.chatId && id === here.chatId;
    const kk = Math.min(k, 16);
    const folded = bm.folded.has(id);
    const fw = folded ? '펼치기' : '접기';
    const fold = node.desc ? '<button type="button" class="fold' + (folded ? ' closed' : '') + '" data-act="fold" data-arg="' + id + '" aria-label="가지 ' + fw + '" title="가지 ' + fw + '">' + bmTi('down') + node.desc + '</button>' : '';
    const now = isCur ? '<i class="now"><i class="live"></i>지금</i>' : '';
    const dt = room && room.messagedAt && !room.missing ? '<span class="dt">' + bmShort(room.messagedAt) + '</span>' : '';
    const go = '<span class="go">' + bmTi('go') + '</span>';
    const fr = bm.fresh && bm.fresh.has(id) ? ' fresh' : '';
    if (!depth) {
      const missing = !room || room.missing;
      const pending = !missing && room.isBranch;
      const unres = pending && !!info && !!info.unresolved && !info.failed;
      let cover = escHtml(bmFirst(room && room.title)) + (room && room.image && !missing ? '<img src="' + escHtml(room.image) + '" alt="" loading="lazy" decoding="async">' : '');
      let sub = node.desc ? '원본 · 분기 ' + node.desc + '개' : '원본';
      let tip = '';
      if (missing) { cover = bmTi('unlink'); sub = '지워졌거나 열 수 없는 방이에요'; }
      else if (unres) { cover = bmTi('help'); sub = '갈라진 지점을 찾지 못했어요'; tip = BM_REASON[info.reason] || ''; }
      else if (pending) { cover = bmTi('clock'); sub = '갈라진 지점을 아직 확인하지 못했어요'; }
      const title = missing ? ((room && room.title) || '원본 방을 열 수 없어요') : room.title;
      const cls = 'card' + (missing ? ' missing' : '') + (pending ? ' unres' : '') + (isCur ? ' cur' : '');
      const act = missing ? '' : ' role="button" tabindex="0" data-act="goto" data-arg="' + id + '" aria-label="' + escHtml(title + ', ' + sub) + '"';
      return '<div class="nd top' + fr + '" style="--k:' + kk + '" data-id="' + id + '" data-depth="0"><div class="' + cls + '"' + act + (tip ? ' title="' + escHtml(tip) + '"' : '') + '>'
        + '<span class="cover" style="--h:' + bmHue(id) + '">' + cover + '</span><span class="cb"><b><span>' + escHtml(title) + '</span>' + now + '</b><small>' + escHtml(sub) + '</small></span>'
        + (missing ? '' : dt) + fold + (missing ? '' : go) + '</div></div>';
    }
    const lv = Math.min(depth, 3);
    const isNew = !!(bm.newIds && bm.newIds.has(id));
    const t = info && typeof info.turn === 'number' && info.turn >= 0 ? info.turn : null;
    const turn = t == null ? '' : t > 0 ? t + '턴' : '시작';
    const line = bmScene(info);
    const title = room ? room.title : '제목 없는 방';
    const label = title + (t == null ? ', 갈라진 방' : ', ' + (t > 0 ? t + '턴에서' : '시작에서') + ' 갈라짐');
    return '<div class="nd br lv' + lv + (isCur ? ' cur' : '') + (isNew ? ' new' : '') + fr + '" style="--d:' + depth + ';--k:' + kk + '" data-id="' + id + '" data-parent="' + (node.parent ? node.parent.id : '') + '" data-depth="' + depth + '"'
      + ' role="button" tabindex="0" data-act="goto" data-arg="' + id + '" aria-label="' + escHtml(label) + '">'
      + '<span class="turn">' + turn + '</span><span class="cb"><b><span>' + escHtml(title) + '</span>' + now + (isNew ? '<i class="newchip">새로</i>' : '') + '</b>' + (line ? '<small>' + escHtml(line) + '</small>' : '') + '</span>'
      + dt + fold + go + '</div>';
  }
  // 원본 카드 아래로 이어지는 레일과 갈림점: 열 때·다시 그릴 때·접고 펼 때만 실제 줄 위치(offset)로 잰다
  function bmRails() {
    if (!bm.open || !bm.stage) return;
    const f = bmForest();
    const cur = bmHere().chatId;
    const hot = bmAnc(cur, f.nodes);
    const fresh = bm.fresh;
    for (const tree of bmQA('[data-tree]')) {
      const svg = tree.querySelector(':scope > svg');
      if (!svg || !tree.offsetParent) continue; // 닫힌 묶음은 펼 때 그린다
      const pos = Object.create(null);
      for (const row of tree.querySelectorAll(':scope > .nd')) {
        const d = Number(row.getAttribute('data-depth')) || 0;
        const card = d ? null : row.querySelector('.card');
        const y = d ? row.offsetTop + row.offsetHeight / 2 : row.offsetTop + (card ? card.offsetTop + card.offsetHeight : row.offsetHeight);
        pos[row.getAttribute('data-id')] = { d, x: 28 + d * 20, y, top: !d };
      }
      let lines = '', dots = '', k = 0, fi = 0;
      for (const row of tree.querySelectorAll(':scope > .nd.br')) {
        const id = row.getAttribute('data-id'), pid = row.getAttribute('data-parent');
        const p = pos[pid], c = pos[id];
        if (!p || !c) continue;
        const isHot = hot.has(id) && hot.has(pid);
        const lv = Math.min(c.d, 3);
        const isFresh = !!(fresh && fresh.has(id));
        const kk = Math.min(isFresh ? fi++ : k++, 16);
        const y0 = p.top ? p.y : p.y + 5;
        const cls = ' lv' + lv + (isHot ? ' hot' : '') + (isFresh ? ' fresh' : '');
        lines += '<path class="rl' + cls + '" data-c="' + id + '" style="--k:' + kk + '" d="M' + p.x + ' ' + y0 + 'V' + (c.y - 9) + 'Q' + p.x + ' ' + c.y + ' ' + (p.x + 9) + ' ' + c.y + 'H' + c.x + '"/>';
        if (id === cur) dots += '<circle class="ring" data-c="' + id + '" cx="' + c.x + '" cy="' + c.y + '" r="7.5"/>';
        dots += '<circle class="jn' + cls + (id === cur ? ' cur' : '') + '" data-c="' + id + '" style="--k:' + kk + '" cx="' + c.x + '" cy="' + c.y + '" r="' + (lv === 1 ? 4.5 : lv === 2 ? 3.75 : 3) + '"/>';
      }
      svg.innerHTML = lines + dots;
    }
    bm.fresh = null;
  }
  function bmRailsSoon() { if (!bm.railsRaf) bm.railsRaf = requestAnimationFrame(() => { bm.railsRaf = 0; attempt(bmRails); }); }
  function bmRedrawBody(quiet) {
    const body = bmQ('[data-body]');
    if (!body) return;
    const top = body.scrollTop;
    bm.traceId = '';
    body.innerHTML = bmBodyHtml();
    body.classList.toggle('quiet', !!quiet);
    body.scrollTop = top;
    attempt(bmRails); // 같은 프레임에 그려서 레일이 한 번 비었다 생기는 깜빡임이 없게
  }
  function bmRedrawStatus() {
    const h = bmQ('[data-st]');
    if (!h) return;
    const b = !bm.error && bmBusy();
    const tx = h.querySelector('[data-tx]'), bar = h.querySelector('.prog');
    if (b && tx && bar) {
      // 진행 글자와 막대만 고쳐서 도는 표시가 처음으로 돌아가지 않게
      if (tx.textContent !== b.text) tx.textContent = b.text;
      bar.classList.toggle('ind', b.p == null);
      if (bar.firstElementChild) bar.firstElementChild.style.setProperty('--p', String(b.p || 0));
    } else h.innerHTML = bmStatusHtml();
    const pn = bmQ('.pn');
    if (pn) pn.classList.toggle('busy', !!b);
    const lock = !!bm.scan || bmIdxStatus() === 'loading';
    for (const x of bmQA('[data-act="refresh"]')) x.disabled = lock;
  }
  function bmRedrawFoot() { const ft = bmQ('[data-ft]'); if (ft) ft.innerHTML = bmFootHtml(); }
  function bmRedrawCf() {
    const cf = bmQ('.cf');
    if (!cf) return;
    cf.outerHTML = bmCfHtml();
    const ck = bmQ('.cf input[data-act="recheck"]');
    if (ck) ck.focus({ preventScroll: true });
  }
  // 창 안 알림(기반 토스트는 창 아래에 가려지므로)
  function bmToastIn(msg) {
    const stage = bm.stage;
    if (!stage || !bm.open) return;
    for (const n of stage.querySelectorAll('.toast')) n.remove();
    stage.insertAdjacentHTML('beforeend', '<div class="toast" role="status">' + bmTi('check') + escHtml(msg) + '</div>');
    const n = stage.lastElementChild;
    setTimeout(() => n.remove(), 2500);
  }
  function bmScrollTo(sel) {
    setTimeout(() => {
      const body = bmQ('[data-body]');
      const t = body && body.querySelector(sel);
      if (!t) return;
      const b = body.getBoundingClientRect(), r = t.getBoundingClientRect();
      body.scrollTo({ top: body.scrollTop + r.top - b.top - b.height / 2 + r.height / 2, behavior: bmReduce() ? 'auto' : 'smooth' });
    }, 200);
  }

  // ── 열기 · 닫기 ──
  // scope: 'story'(이 작품) | 'all'(전체). 작품 경로(/stories/<id>/…, /detail/<id>)가 아니면 전체
  function bmOpen(scope) {
    if (!document.body) return;
    const here = bmHere();
    const stage = bmStage();
    bm.scope = scope === 'all' || !here.storyId ? 'all' : 'story';
    bm.confirm = false;
    bm.recheck = false;
    bm.autoTried = false;
    // 지난번 오류·안내는 새로 열 때 지운다(찾는 중이면 그대로 둔다). 목록을 다시 못 받으면 bmLoadIndex가 다시 띄운다
    if (!bm.scan) { bm.error = ''; bm.note = ''; }
    if (!bm.open) bm.ret = document.activeElement;
    bm.open = true;
    const old = bmQ('[data-ov]');
    if (old) old.remove();
    stage.insertAdjacentHTML('beforeend', bmPanelHtml());
    const pn = bmQ('.pn');
    if (pn) pn.focus({ preventScroll: true });
    attempt(bmRails);
    bmScrollTo('.card.cur,.nd.br.cur');
    bmKeysOn();
    bmThemeWatch(true);
    window.addEventListener('resize', bmRailsSoon);
    bmRedrawStatus();
    // 목록: 10분이 지났을 때만 새로 받는다(chatIndex가 판단). 받은 뒤 자동 찾기(설정)
    bmLoadIndex(false).then(() => bmAutoMaybe());
  }
  function bmClose(after) {
    const ov = bmQ('[data-ov]');
    bmThemeWatch(false);
    window.removeEventListener('resize', bmRailsSoon);
    const ret = bm.ret;
    bm.ret = null;
    // 자동 숨김 사이드바·룸 상단바 안의 버튼으로는 포커스를 돌려주지 않는다(돌려주면 오버레이가 열린 채 남는다)
    const inRegion = (el) => !!((side.root && side.root.contains(el)) || (els.roomBar && els.roomBar.contains(el)));
    if (bm.open && !after && ret && ret.isConnected && ret !== document.body && !inRegion(ret)) attempt(() => ret.focus({ preventScroll: true }));
    bm.open = false;
    bm.confirm = false;
    bm.traceId = '';
    if (!ov) { if (after) attempt(after); return; }
    ov.classList.add('out');
    setTimeout(() => { ov.remove(); if (after) attempt(after); }, 150);
  }
  function bmThemeWatch(onoff) {
    if (bm.themeMo) { bm.themeMo.disconnect(); bm.themeMo = null; }
    if (!onoff || !document.body) return;
    // 열려 있는 동안 크랙 테마를 바꾸면 따라간다(body 속성 하나만 본다)
    bm.themeMo = new MutationObserver(() => { if (bm.stage) bm.stage.setAttribute('data-theme', bmTheme()); });
    bm.themeMo.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  }
  function bmLoadIndex(force) {
    const ci = bmCI();
    if (!ci) return Promise.resolve(null);
    let p = null;
    try { p = ci.load(force ? { force: true } : undefined); } catch (e) { warn(e); }
    if (bm.open) bmRedrawStatus();
    return Promise.resolve(p).catch(() => null).then((x) => {
      if (bm.open && bmIdxStatus() === 'error') bm.error = '채팅방 목록을 다 받지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      bmDirty();
      bmSoon();
      return x;
    });
  }
  function bmAutoMaybe() {
    if (!bm.open || bm.autoTried || bm.scan || !bmAutoScan() || !bmIndex()) return;
    bm.autoTried = true;
    if (bmTargets(false, false).length) bmScan({});
  }

  // ── 이동: 원본에서 그 방까지 길이 강조된 뒤 창을 닫고 옮긴다. 도착 알림은 분기 기록 쪽(brArrive)이 'route'에서 띄운다 ──
  function bmNav(room) {
    try { sessionStorage.setItem(BM_ARRIVE_KEY, JSON.stringify({ id: room.id, title: room.title, at: Date.now() })); } catch (_) { /* 저장 불가여도 이동은 한다 */ }
    goto('/stories/' + room.storyId + '/episodes/' + room.id);
  }
  function bmGoto(id, el) {
    const f = bmForest();
    const n = f.nodes.get(id);
    const room = n && n.room;
    if (!room || room.missing || !room.storyId) return;
    if (id === bmHere().chatId) { bmClose(); return; }
    const tree = el.closest('[data-tree]');
    if (tree) {
      bmUntrace(tree);
      const ids = bmAnc(id, f.nodes);
      for (const m of tree.querySelectorAll('.rl,.jn')) if (ids.has(m.getAttribute('data-c'))) m.classList.add('go');
    }
    el.classList.add('going');
    const pn = bmQ('.pn');
    if (pn) pn.style.pointerEvents = 'none';
    setTimeout(() => bmClose(() => bmNav(room)), bmReduce() ? 0 : 220);
  }
  function bmTrace(tree, id) {
    if (bm.traceId === id && tree.classList.contains('tracing')) return;
    bm.traceId = id;
    const ids = bmAnc(id, bmForest().nodes);
    tree.classList.add('tracing');
    for (const m of tree.querySelectorAll('.rl,.jn,.ring')) m.classList.toggle('tr', ids.has(m.getAttribute('data-c')));
    for (const r of tree.querySelectorAll(':scope > .nd.br')) r.classList.toggle('tr', ids.has(r.getAttribute('data-id')));
  }
  function bmUntrace(tree) {
    bm.traceId = '';
    if (!tree.classList.contains('tracing')) return;
    tree.classList.remove('tracing');
    for (const x of tree.querySelectorAll('.tr')) x.classList.remove('tr');
  }

  // ── 창 동작 ──
  const bmAct = {
    close: () => bmClose(),
    refresh() {
      bm.error = '';
      bm.note = '';
      bmLoadIndex(true).then(() => { if (bm.open && !bm.error && bmIdxStatus() !== 'error') bmToastIn('지도를 새로 고쳤어요'); });
    },
    scope(b) {
      const s = b.getAttribute('data-arg') === 'story' && bmHere().storyId ? 'story' : 'all';
      if (bm.scope === s) return;
      bm.scope = s;
      const seg = bmQ('.seg');
      if (seg) seg.style.setProperty('--i', s === 'story' ? '0' : '1');
      for (const x of bmQA('.seg button')) { const on = x.getAttribute('data-arg') === s; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }
      const body = bmQ('[data-body]');
      if (!body) return;
      const done = () => { bmRedrawBody(false); bmScrollTo('.card.cur,.nd.br.cur'); };
      if (bmReduce() || typeof body.animate !== 'function') { done(); return; }
      const dir = s === 'all' ? 1 : -1;
      const a = body.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(' + (-dir * 10) + 'px)' }], { duration: 110, easing: 'ease-in', fill: 'forwards' });
      // 탭이 그려지지 않는 동안에는 애니메이션이 끝나지 않으므로 시간으로도 마무리한다(한 번만)
      let fin = false;
      const finish = () => { if (fin) return; fin = true; done(); a.cancel(); };
      a.onfinish = finish;
      setTimeout(finish, 200);
    },
    scan() {
      bm.confirm = !bm.confirm;
      bmRedrawFoot();
      if (bm.confirm) { const y = bmQ('.cf [data-act="cfyes"]'); const c = bmQ('.cf [data-act="cfno"]'); const t = y && !y.disabled ? y : c; if (t) t.focus({ preventScroll: true }); }
    },
    cfno() { bm.confirm = false; bmRedrawFoot(); },
    cfyes() {
      const re = bm.recheck;
      bm.confirm = false;
      bm.recheck = false;
      bmScan({ recheck: re, manual: true });
    },
    stop() { if (bm.scan) { bm.scan.stop = true; bmRedrawFoot(); bmRedrawStatus(); } },
    grp(b) {
      const key = b.getAttribute('data-arg');
      if (bm.closed.has(key)) bm.closed.delete(key); else bm.closed.add(key);
      const c = bm.closed.has(key);
      const sec = b.closest('.grp');
      if (sec) sec.classList.toggle('closed', c);
      b.setAttribute('aria-expanded', String(!c));
      if (!c) attempt(bmRails);
    },
    // 접기·펼치기는 바로 다시 그린다(높이 애니메이션 없음). 펼친 가지만 짧게 나타난다
    fold(b) {
      const id = b.getAttribute('data-arg');
      if (bm.folded.has(id)) { bm.folded.delete(id); bm.fresh = new Set(bmDesc(id, bmForest().nodes)); } else bm.folded.add(id);
      bmRedrawBody(true);
    },
    goto: (el) => bmGoto(el.getAttribute('data-arg'), el),
  };
  function bmBind(sh) {
    sh.addEventListener('pointerdown', (e) => { bm.downOv = !!(e.target && e.target.matches && e.target.matches('[data-ov]')); });
    sh.addEventListener('click', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (el && el.tagName !== 'INPUT') {
        e.preventDefault();
        if (el.disabled) return;
        const fn = bmAct[el.getAttribute('data-act')];
        if (fn) attempt(() => fn(el, e));
        return;
      }
      // 배경: 누르기 시작한 곳도 배경일 때만 닫는다(창 안에서 끌다가 밖에서 놓으면 그대로)
      if (e.target && e.target.matches && e.target.matches('[data-ov]') && bm.downOv) bmClose();
    });
    sh.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.matches && t.matches('input[data-act="recheck"]')) { bm.recheck = !!t.checked; bmRedrawCf(); }
    });
    // 창 안의 키는 크랙 단축키로 가지 않게 전파만 멈춘다(가짜 키 이벤트는 만들지 않는다). Esc는 문서 캡처에서 먼저 처리
    for (const type of ['keydown', 'keyup', 'keypress']) {
      sh.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type !== 'keydown') return;
        const row = e.target && e.target.closest ? e.target.closest('[data-act="goto"]') : null;
        if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); bmGoto(row.getAttribute('data-arg'), row); }
      });
    }
    // 표지를 못 불러오면 그림을 치우고 첫 글자를 보여 준다
    sh.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest && t.closest('.cover')) t.remove(); }, true);
    sh.addEventListener('pointerover', (e) => {
      if (!bmOn('hoverPath') || e.pointerType === 'touch') return;
      const tree = e.target && e.target.closest ? e.target.closest('[data-tree]') : null;
      if (!tree) return;
      const row = e.target.closest('.nd.br');
      if (row && !row.classList.contains('going')) bmTrace(tree, row.getAttribute('data-id')); else bmUntrace(tree);
    });
    sh.addEventListener('pointerout', (e) => {
      const tree = e.target && e.target.closest ? e.target.closest('[data-tree]') : null;
      if (tree && !(e.relatedTarget && tree.contains(e.relatedTarget))) bmUntrace(tree);
    });
  }
  // 열려 있는 동안: Esc = 확인 팝업 먼저, 그다음 창 닫기. 창 밖으로 빠진 포커스의 키는 막고 창으로 포커스를 돌린다.
  // Esc로 닫으면 그 Esc의 keyup도 크랙에 가지 않게 한 번 먹는다(눌림만 남는 상태 방지)
  function bmDocKey(e) {
    if (!bm.open) {
      if (bm.eatEsc && e.type === 'keyup' && e.key === 'Escape') { bm.eatEsc = false; e.stopPropagation(); }
      return;
    }
    if (e.type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (bm.confirm) bmAct.cfno();
      else { bm.eatEsc = true; setTimeout(() => { bm.eatEsc = false; }, 1500); bmClose(); }
      return;
    }
    if (bm.host && typeof e.composedPath === 'function' && e.composedPath().includes(bm.host)) return;
    e.stopPropagation();
    if (e.type === 'keydown') { const pn = bmQ('.pn'); if (pn) pn.focus({ preventScroll: true }); }
  }
  function bmKeysOn() {
    if (bm.keys) return;
    bm.keys = true;
    for (const type of ['keydown', 'keyup', 'keypress']) document.addEventListener(type, bmDocKey, true);
  }

  // ── 지난 분기 찾기: 인덱스의 분기 방 중 기록이 없는 방만. 최신 메시지부터 100개씩 읽다가 처음 나오는 '다른 방 chatId'를 원본으로 본다 ──
  // (가정: 분기 때 복사된 메시지는 원본 방 chatId를 그대로 갖는다 — 실측 전. 모든 메시지가 이 방 chatId면 '못 찾음(same)'으로 남긴다)
  // 턴 = 그 지점부터 가장 오래된 메시지까지의 사용자 메시지 수(= 원본 방에서 몇 턴째에 갈라졌는지, 옛 갈래 매듭과 같음).
  // 기반 턴 캐시('crack-pc-base:turns')의 최신 메시지가 같으면 끝까지 읽지 않고 '전체 − 지점보다 최근' 으로 센다.
  // 요청 사이 150ms, 401·403이면 모두 멈춤, 바로 기록된(live) 방은 건드리지 않음, 못 찾은 방은 6시간 뒤에 다시.
  function bmErr(msg, auth) { const e = new Error(msg); e.bmMsg = msg; if (auth) e.bmAuth = true; return e; }
  async function bmGet(path) {
    for (let a = 0; a < 3; a++) {
      let r = null;
      try { r = await crackFetch('GET', path); } catch (_) { r = null; }
      if (r && r.ok) {
        const j = r.json;
        if (isObj(j) && j.result && j.result !== 'SUCCESS') throw bmErr('크랙 서버가 실패 응답을 보냈어요.');
        return isObj(j) && j.data !== undefined ? j.data : j;
      }
      if (r && (r.status === 0 || r.status === 401 || r.status === 403)) throw bmErr('로그인 정보를 읽지 못했어요. 크랙을 새로고침한 뒤 다시 시도해 주세요.', true);
      if (r && r.status === 404) return 404;
      if (r && r.status >= 400 && r.status < 500 && r.status !== 429) throw bmErr('크랙 서버가 요청을 받지 않았어요 (' + r.status + ').');
      if (a < 2) await bmSleep(700 * (a + 1)); // 네트워크·429·5xx는 조금 쉬고 다시
    }
    throw bmErr('크랙 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  }
  // 찾을 방: recheck = 이미 찾은 방(scan)도 다시, manual = 직접 눌렀음(오류 난 방 바로 다시)
  function bmTargets(recheck, manual) {
    const idx = bmIndex();
    if (!idx) return [];
    const st = bmStore(), now = Date.now(), out = [];
    for (const c of idx.chats) {
      if (!c || c.isCreatedFromBranch !== true || !BM_ID.test(c._id || '')) continue;
      const b = st.branches[c._id];
      if (isObj(b) && b.src === 'live') continue;
      let need;
      if (!isObj(b) || recheck) need = true;
      else if (b.failed) need = manual || now - (Number(b.triedAt) || 0) > BM_FAIL_MS;
      else if (b.unresolved || !b.parentId) need = now - (Number(b.triedAt) || Number(b.at) || 0) > BM_RETRY_MS;
      else need = false;
      if (need) out.push(bmFromChat(c));
    }
    out.sort((a, b) => b.messagedAt - a.messagedAt); // 최근에 대화한 방부터
    return out;
  }
  // 한 방 읽기 → 기록 | null(방이 지워짐) | undefined(멈춤)
  async function bmScanRoom(room, run, report) {
    const seen = new Set(), cursors = new Set();
    let cursor = '', point = null, turn = 0, newer = 0, total = null, capped = true;
    const tc = readJSON(TURN_KEY);
    const cache = isObj(tc) && isObj(tc[room.id]) ? tc[room.id] : null;
    for (let pg = 0; pg < BM_MAX_PAGES; pg++) {
      if (run.stop) return undefined;
      if (pg) await bmSleep(BM_GAP);
      if (run.stop) return undefined;
      const d = await bmGet('/crack-gen/v3/chats/' + room.id + '/messages?limit=' + BM_LIMIT + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      if (d === 404) return null;
      const ms = isObj(d) && Array.isArray(d.messages) ? d.messages : [];
      if (!pg && ms[0] && cache && cache.top === ms[0]._id && Number(cache.n) >= 0) total = Number(cache.n);
      for (const m of ms) {
        const id = m && m._id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const user = String(m.role || '').toLowerCase() === 'user';
        if (!point) {
          const owner = String(m.chatId || '');
          if (BM_ID.test(owner) && owner !== room.id) point = { parentId: owner, messageId: id, tail: bmPlain(m.content).slice(-300) };
          else if (user) newer++;
        }
        if (point && user) turn++;
      }
      report(seen.size);
      if (point && total != null) { turn = Math.max(0, total - newer); capped = false; break; }
      if (!ms.length || !isObj(d) || !d.hasNext || !d.nextCursor || cursors.has(d.nextCursor)) { capped = false; break; }
      cursors.add(d.nextCursor);
      cursor = d.nextCursor;
    }
    const now = Date.now();
    if (!point) return { childId: room.id, parentId: '', unresolved: true, reason: capped ? 'long' : seen.size ? 'same' : 'empty', src: 'scan', at: now, triedAt: now };
    return { childId: room.id, parentId: point.parentId, messageId: point.messageId, turn, tail: point.tail, src: 'scan', at: now, triedAt: now };
  }
  function bmRecord(room, rec, run) {
    const st = bmStore();
    const old = st.branches[room.id];
    if (isObj(old) && old.src === 'live') return; // 그사이 바로 기록됐으면 그쪽이 맞다
    st.branches[room.id] = rec;
    const now = Date.now();
    st.rooms[room.id] = Object.assign({}, isObj(st.rooms[room.id]) ? st.rooms[room.id] : {}, bmRoomRec(room), { isBranch: true, updatedAt: now });
    delete st.rooms[room.id].missing;
    if (rec.parentId) {
      const idx = bmIndex();
      const pc = idx ? idx.byId.get(rec.parentId) : null;
      if (pc) { const x = Object.assign({}, isObj(st.rooms[rec.parentId]) ? st.rooms[rec.parentId] : {}, bmRoomRec(bmFromChat(pc)), { updatedAt: now }); delete x.missing; st.rooms[rec.parentId] = x; }
      if (!(isObj(old) && old.parentId === rec.parentId)) run.found.add(room.id);
    } else if (rec.reason === 'same') run.same++;
    if (!rec.failed) run.done++;
    bmSave(st);
  }
  // 인덱스에 없는 원본 방: 한 번씩 물어 404면 '열 수 없음'
  async function bmFillParents(run, recheck) {
    const idx = bmIndex();
    if (!idx) return;
    const st = bmStore(), want = [], seen = new Set();
    for (const id of Object.keys(st.branches)) {
      const b = st.branches[id], p = isObj(b) ? b.parentId : '';
      if (!p || !BM_ID.test(p) || seen.has(p)) continue;
      seen.add(p);
      if (idx.byId.get(p)) continue;
      const r = st.rooms[p];
      if (isObj(r) && r.missing && !recheck) continue;
      if (isObj(r) && (Number(r.updatedAt) || 0) > (Number(idx.at) || 0) && r.storyId) continue; // 목록보다 새 정보(방금 기록된 원본)
      want.push(p);
    }
    for (let i = 0; i < want.length && !run.stop; i++) {
      const id = want[i];
      run.text = '원본 방 확인 중 ' + (i + 1) + '/' + want.length;
      run.p = (i + 0.5) / want.length;
      bmRedrawStatus();
      let d = null;
      try { d = await bmGet('/crack-gen/v3/chats/' + id); } catch (e) { if (e && e.bmAuth) throw e; warn(e); d = null; }
      const s2 = bmStore(), now = Date.now();
      const old = isObj(s2.rooms[id]) ? s2.rooms[id] : {};
      if (d === 404) s2.rooms[id] = Object.assign({}, old, { id, missing: true, updatedAt: now });
      else {
        const c = isObj(d) && isObj(d.chat) ? d.chat : d;
        if (isObj(c) && c._id === id) { const x = Object.assign({}, old, bmRoomRec(bmFromChat(c)), { updatedAt: now }); delete x.missing; s2.rooms[id] = x; }
      }
      if (d) bmSave(s2);
      if (i < want.length - 1) await bmSleep(BM_GAP);
    }
  }
  async function bmScan(opt) {
    if (bm.scan) return;
    const o = isObj(opt) ? opt : {};
    const run = { stop: false, idx: false, text: '채팅방 목록 확인 중…', p: null, found: new Set(), same: 0, done: 0, n: 0 };
    bm.scan = run;
    bm.error = '';
    bm.note = '';
    bm.found = 0;
    bm.confirm = false;
    if (bm.open) { bmRedrawStatus(); bmRedrawFoot(); }
    let err = '';
    try {
      const ci = bmCI();
      run.idx = true; // 이 동안 상태 줄은 목록 받기 진행(n/m)을 보여 준다
      if (ci) { try { await ci.load(); } catch (e) { warn(e); } } // 10분 안이면 캐시 그대로
      run.idx = false;
      if (!bmIndex()) throw bmErr('채팅방 목록을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      const list = bmTargets(!!o.recheck, !!o.manual);
      run.n = list.length;
      for (let i = 0; i < list.length && !run.stop; i++) {
        const room = list[i];
        const head = '갈라진 지점 찾는 중 ' + (i + 1) + '/' + list.length + ' · ' + room.title;
        run.text = head;
        run.p = i / list.length;
        bmRedrawStatus();
        let rec;
        try {
          rec = await bmScanRoom(room, run, (n) => { run.text = head + ' · 메시지 ' + n + '개 확인'; run.p = (i + 0.5) / list.length; bmRedrawStatus(); });
        } catch (e) {
          if (e && e.bmAuth) throw e;
          warn(e);
          const now = Date.now();
          rec = { childId: room.id, parentId: '', unresolved: true, failed: true, src: 'scan', at: now, triedAt: now };
        }
        if (rec === undefined) break; // 멈춤(이 방은 기록하지 않음)
        if (rec) bmRecord(room, rec, run);
        if (i < list.length - 1 && !run.stop) await bmSleep(BM_GAP);
      }
      if (!run.stop) await bmFillParents(run, !!o.recheck);
    } catch (e) {
      err = e && e.bmMsg ? e.bmMsg : '크랙 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      if (!(e && e.bmMsg)) warn(e);
    } finally {
      bm.scan = null;
      attempt(() => bmScanDone(run, err));
    }
  }
  function bmScanDone(run, err) {
    const n = run.found.size;
    bm.error = err || '';
    bm.found = err ? 0 : n;
    bm.newIds = n ? new Set(run.found) : null;
    bm.fresh = n ? new Set(run.found) : null;
    bm.note = !err && !n && run.done > 0 && run.same >= run.done
      ? '복사된 대화에 원본 방 정보가 없어 지난 분기는 찾지 못했어요. 앞으로 만드는 분기는 바로 기록돼요.' : '';
    bmDirty();
    if (n) {
      // 새로 찾은 가지가 보이게: 조상 펼치기 + 그 묶음 열기
      const f = bmForest();
      for (const id of run.found) {
        const node = f.nodes.get(id);
        if (!node) continue;
        for (let p = node.parent; p; p = p.parent) bm.folded.delete(p.id);
        bm.closed.delete(node.groupKey);
      }
    }
    const msg = err || (n ? '갈라진 지점 ' + n + '개를 찾았어요' : run.stop ? '찾기를 멈췄어요' : run.n ? '새로 찾은 곳이 없어요' : '새로 확인할 방이 없어요');
    if (bm.open) {
      bmRedrawStatus();
      bmRedrawBody(true);
      bmRedrawFoot();
      if (n) { bmScrollTo('.nd.br.new'); bmToastIn('갈라진 지점을 찾았어요'); } else if (!err) bmToastIn(msg);
    } else toast(msg, { key: 'bm-scan' });
    clearTimeout(bm.foundT);
    if (n) {
      bm.foundT = setTimeout(() => {
        bm.found = 0;
        bm.newIds = null;
        if (!bm.open) return;
        bmRedrawStatus();
        for (const r of bmQA('.nd.br.new')) r.classList.remove('new');
        for (const c of bmQA('.newchip')) c.remove();
      }, 4200);
    }
    bmSoon();
  }

  // ── 입구 버튼: 우리 것만 WeakSet으로 구별(다른 확장의 비슷한 버튼은 건드리지 않는다). 자리는 '그 앞 어딘가'면 그대로 둬서 남과 자리다툼하지 않는다 ──
  const bmOwn = new WeakSet();
  let bmListEl = null, bmRoomEl = null, bmRoomMo = null, bmRoomBar = null, bmRoomRaf = 0;
  function bmMakeBtn(kind) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = kind === 'room' ? 'cpb-bm-btn' : 'cpb-bm-mini';
    b.setAttribute('data-tip', kind === 'room' ? '갈래 지도' : '갈래 지도 · 전체');
    b.setAttribute('aria-label', kind === 'room' ? '갈래 지도 열기' : '갈래 지도 전체 열기');
    b.innerHTML = bmLogo('cpb-bm-lg');
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); bmOpen(kind === 'room' ? 'story' : 'all'); });
    bmOwn.add(b);
    return b;
  }
  // 사이드바 '채팅 목록' 머리줄(div.h-7 > span.typo-text-sm_leading-paragraph_regular '채팅 목록')의 크랙 ⋯(라벨 없는 메뉴 버튼, React 소유)
  function bmHeadMenu(root) {
    const sc = root.querySelector('[data-testid="virtuoso-scroller"]');
    if (!sc) return null;
    for (const s of sc.querySelectorAll('div.h-7 > span.typo-text-sm_leading-paragraph_regular')) {
      if (s.childElementCount || s.textContent.trim() !== '채팅 목록') continue;
      for (const b of s.parentElement.children) {
        if (b.tagName === 'BUTTON' && b.getAttribute('aria-haspopup') === 'menu' && !b.hasAttribute('aria-label') && !bmOwn.has(b) && reactProps(b)) return b;
      }
    }
    return null;
  }
  function bmListButton() {
    const r = side.root && side.root.isConnected ? side.root : null;
    const menuBtn = r && bmOn('on') && bmOn('listBtn') ? bmHeadMenu(r) : null;
    if (r) for (const x of r.querySelectorAll('.cpb-bm-mini')) if (x !== bmListEl || !menuBtn) x.remove();
    if (!menuBtn) { if (bmListEl && bmListEl.isConnected) bmListEl.remove(); return; }
    if (!bmListEl) bmListEl = bmMakeBtn('list');
    const row = menuBtn.parentElement;
    if (bmListEl.parentNode !== row || !(bmListEl.compareDocumentPosition(menuBtn) & 4)) row.insertBefore(bmListEl, menuBtn);
  }
  // 룸 상단바 모델 버튼(model-icon 그림이 든 dialog 버튼, React 소유). 다른 확장이 같은 속성 버튼을 앞에 끼워 넣으므로 그림과 React 소유로 고른다
  function bmModelBtn(bar) {
    for (const b of bar.querySelectorAll('button[aria-haspopup="dialog"]')) {
      if (bmOwn.has(b) || !b.querySelector('img[src*="model-icon"]') || !reactProps(b)) continue;
      return b;
    }
    return null;
  }
  // 지금 방이 분기 방이거나 분기가 있는 원본일 때만(저장소·인덱스 기준) 모델 버튼 묶음 맨 앞에
  function bmRoomButton() {
    const bar = page && els.roomBar && els.roomBar.isConnected ? els.roomBar : null;
    const id = bar ? roomId() : '';
    const want = !!bar && bmOn('on') && bmOn('roomBtn') && BM_ID.test(id) && bmForest().tree.has(id);
    const model = want ? bmModelBtn(bar) : null;
    if (bar) for (const x of bar.querySelectorAll('.cpb-bm-btn')) if (x !== bmRoomEl || !model) x.remove();
    bmRoomWatch(want ? bar : null);
    if (!model) { if (bmRoomEl && bmRoomEl.isConnected) bmRoomEl.remove(); return; }
    if (!bmRoomEl) bmRoomEl = bmMakeBtn('room');
    const grp = model.parentElement;
    if (bmRoomEl.parentNode !== grp || !(bmRoomEl.compareDocumentPosition(model) & 4)) grp.insertBefore(bmRoomEl, grp.firstChild);
    flag(bmRoomEl, 'data-dot', bmForest().linked.has(id));
  }
  // 크랙이 상단바를 다시 그려 버튼이 빠지면(또는 모델 버튼이 늦게 생기면) 다시 붙인다. 상단바 안만 보고 연결 여부만 확인한다
  function bmRoomWatch(bar) {
    if (bmRoomBar === bar) return;
    if (bmRoomMo) bmRoomMo.disconnect();
    bmRoomMo = null;
    bmRoomBar = bar;
    if (!bar) return;
    bmRoomMo = new MutationObserver(() => {
      if ((bmRoomEl && bmRoomEl.isConnected && bmRoomBar && bmRoomBar.contains(bmRoomEl)) || bmRoomRaf) return;
      bmRoomRaf = requestAnimationFrame(() => { bmRoomRaf = 0; attempt(bmRoomButton); });
    });
    bmRoomMo.observe(bar, { childList: true, subtree: true });
  }
  // 두 버튼 다시 확인(사이드바 그리기·영역·경로·설정·저장소가 바뀔 때)
  function bmEnsure() { attempt(bmListButton); attempt(bmRoomButton); }
  let bmRaf = 0;
  function bmSoon() {
    if (bmRaf) return;
    bmRaf = requestAnimationFrame(() => {
      bmRaf = 0;
      if (bm.open) { bmRedrawStatus(); if (!bm.scan) { bmRedrawBody(true); bmRedrawFoot(); } }
      bmEnsure();
    });
  }

  // '확장 기능' 메뉴 하위 행(통합 쪽 register에서 children으로)
  function bmMenuChildren() {
    const tg = (k) => ({ get: () => bmOn(k), set: (v) => settings.set('branch.' + k, !!v) });
    return [
      { id: 'openStory', label: '이 작품 지도 열기', onClick: () => bmOpen('story') },
      { id: 'openAll', label: '전체 지도 열기', onClick: () => bmOpen('all') },
      { id: 'on', label: '갈래 지도 (분기 기록 · 깃발 · 버튼 전체)', toggle: tg('on') },
      { id: 'live', label: '분기할 때 바로 기록', toggle: tg('live') },
      { id: 'flags', label: '채팅 목록 원본 방 깃발 (분기 수)', toggle: tg('flags') },
      { id: 'listBtn', label: "'채팅 목록' 머리줄 버튼 (전체 지도)", toggle: tg('listBtn') },
      { id: 'roomBtn', label: '방 위쪽 막대 버튼 (분기 방·원본 방에서만)', toggle: tg('roomBtn') },
      { id: 'arrive', label: '지도에서 옮긴 뒤 도착 알림', toggle: tg('arrive') },
      { id: 'hoverPath', label: '마우스를 올리면 원본까지 길 강조', toggle: tg('hoverPath') },
      { id: 'autoScan', label: '지도를 열 때 갈라진 지점 자동으로 찾기 (요청이 많아요)', toggle: { get: () => bmAutoScan(), set: (v) => settings.set('branch.autoScan', !!v) } },
    ];
  }

  // 옛 갈래 매듭의 '지금 방 확인'을 요청 없이: 크랙이 방에 들어갈 때 스스로 받는 방 정보(GET /v3/chats/<id>)를 엿들어,
  // 인덱스·저장소에 아직 없는 분기 방이면 저장소에 '확인 전' 분기 방으로 한 번만 적는다(상단 버튼·지도에 바로 보이게)
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/[0-9a-f]{24}(?:\?|$)/i, fn: (m, url, st, j) => {
    if (m !== 'GET' || st !== 200 || !bmOn('on') || !isObj(j) || !isObj(j.data)) return;
    const c = isObj(j.data.chat) ? j.data.chat : j.data;
    if (c.isCreatedFromBranch !== true || !BM_ID.test(c._id || '')) return;
    const idx = bmIndex();
    if (idx && idx.byId.get(c._id)) return; // 인덱스에 있으면 지도에 이미 나온다
    const s = bmStore();
    const old = isObj(s.rooms[c._id]) ? s.rooms[c._id] : null;
    if (old && old.isBranch === true && !old.missing) return;
    const x = Object.assign({}, old || {}, bmRoomRec(bmFromChat(c)), { isBranch: true, updatedAt: Date.now() });
    delete x.missing;
    s.rooms[c._id] = x;
    bmSave(s);
  } });

  siteCss('bm', BM_SITE_CSS);
  // 저장소가 바뀌면(우리 저장 · 분기 기록 쪽 brWrite · 다른 탭) 캐시를 맞추고 창·버튼을 다시
  on('branch', (s) => { bmCache = isObj(s) && isObj(s.rooms) && isObj(s.branches) ? s : null; bmDirty(); bmSoon(); });
  window.addEventListener('storage', (e) => { if (e.key === BM_KEY) { bmCache = null; bmDirty(); bmSoon(); } });
  on('chatindex', () => { bmDirty(); bmSoon(); bmAutoMaybe(); });
  on('chatindex:progress', () => { if (bm.open) bmRedrawStatus(); });
  on('settings', (p) => { const k = p && typeof p.key === 'string' ? p.key : ''; if (k === '*' || k === 'branch' || k.indexOf('branch.') === 0) bmSoon(); });
  on('route', () => { bmDirty(); bmSoon(); });
  on('regions', () => bmSoon());

  // ===== settings =====
  // 설정창: 입력창 도구 줄의 설정 버튼(크랙 ✳ 버튼의 클래스를 그대로 빌려 모양이 똑같다)으로 연다.
  // 가운데 큰 글라스 창. 왼쪽 분류(화면 위치 기준) · 오른쪽 기능 카드. 바꾸면 바로 적용(저장 버튼 없음).
  // 바꾼 항목은 이름이 진해지고 옆에 기본값이 흐리게, 그 분류 아이콘이 은은하게 빛난다(E+B).
  // 위치 그림: 크랙 화면을 줄여 그린 것. 카드에 마우스를 올리면 그 기능 자리가 빛나고 동작을 짧게 반복 재생한다.
  // 엿보기: 스위치·칩·숫자에 0.4초 머물면 창이 비워지고 그 줄만 떠 있고, 진짜 크랙 화면의 그 자리만 밝게 짚는다.
  //   그 상태로 누르면 진짜 화면이 바로 바뀐다. 마우스를 떼거나 스크롤·키·바깥 클릭이면 바로 돌아온다
  const SP = {
    key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9M15.5 7.5l2.5 2.5M13 10l2 2"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    ok: '<path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/>',
    fold:'<path d="M5 5h14M5 19h14"/><path d="M9 9.5l3 3 3-3"/><path d="M12 12.5V9"/>',
    lockscroll: '<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M12 8v5M9.5 10.5L12 13l2.5-2.5"/><path d="M9 17h6"/>',
    eyeoff: '<path pathLength="1" d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16.6 16.6 0 0 1-3.1 3.8M6.6 7.6A16.4 16.4 0 0 0 2.5 12S6 18 12 18a9 9 0 0 0 4-.9"/>',
    keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8"/>',
    quote: '<path d="M9.5 7H6.5A1.5 1.5 0 0 0 5 8.5v3A1.5 1.5 0 0 0 6.5 13H9v1.5A2.5 2.5 0 0 1 6.5 17M19 7h-3a1.5 1.5 0 0 0-1.5 1.5v3A1.5 1.5 0 0 0 16 13h2.5v1.5A2.5 2.5 0 0 1 16 17"/>',
    dash: '<rect x="3" y="5" width="18" height="5" rx="1.5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><path d="M6.5 7.5h.01M9.5 7.5h.01M12.5 7.5h.01"/>',
    pulse: '<path pathLength="1" d="M3 12h3.5l2-5 3 10 2.5-7 1.5 2H21"/>',
    tag: '<path d="M4 12V5h7l9 9-7 7z"/><circle cx="8" cy="8.5" r="1.3"/>',
    dots: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/><rect x="3" y="7" width="18" height="10" rx="3"/>',
    reroll: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
    chart: '<path d="M4 20V10M10 20V5M16 20v-7M21 20H3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    merge: '<path d="M6 4v5a5 5 0 0 0 5 5h7"/><path d="M15 10.5l3.5 3.5-3.5 3.5"/><path d="M6 20v-3"/>',
    bellcheck: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/><path d="M9.5 11l1.8 1.8 3.2-3.3"/>',
    lines: '<path d="M4 6h11M4 10.5h7M4 15h5"/><circle cx="15.5" cy="15" r="3.5"/><path d="M18 17.5l2.5 2.5"/>',
    frame: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 15l5-4.5 4 3.5 3-2.5 5 4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    type: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.8V19h12V9.8"/>',
    monitor: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
    input: '<rect x="3" y="13" width="18" height="7" rx="2"/><path d="M6 9h12M8 5.5h8"/>',
    message: '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H10l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0 4.8 4.8L13 17.6a2 2 0 0 1-2.8 0l-.8-.8a2 2 0 0 1 0-2.8z"/><path d="M5 19l3-3"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    box: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    branch: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-10.5 6"/>',
    open: '<path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    arrow: '<path d="M9 6l6 6-6 6"/>',
    reset: '<path d="M4.5 9.5A8 8 0 1 1 4 13"/><path d="M4 4.5V9.5h5"/>',
    minus: '<path d="M6 12h12"/>', plus: '<path d="M12 6v12M6 12h12"/>',
    trash: '<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12.5h8L17 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
    up: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  };
  const sic = (k, w, sw) => '<svg width="' + (w || 18) + '" height="' + (w || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (SP[k] || '') + '</svg>';

  const ST_CATS = [
    { id: 'home', name: '처음 화면', icon: 'home', desc: '자주 여는 것과 자주 바꾸는 것' },
    { id: 'screen', name: '채팅 화면', icon: 'monitor', desc: '가장자리, 스크롤, 오래된 대화' },
    { id: 'input', name: '입력창 주변', icon: 'input', desc: '입력창과 그 위 대시보드·라디오존데' },
    { id: 'message', name: '메시지', icon: 'message', desc: '메시지 옆 표시, 메시지 메뉴, 다시 생성' },
    { id: 'model', name: '모델', icon: 'chip', desc: '통계 카드와 숨길 모델' },
    { id: 'chatlist', name: '채팅 목록', icon: 'sidebar', desc: '왼쪽 사이드바와 한눈에 보기, 갈래 지도' },
    { id: 'tools', name: '도구', icon: 'tool', desc: '로그 검색, 이미지 보관함' },
    { id: 'notify', name: '알림', icon: 'bell', desc: '답변 완성, 크랙 알림, 출석' },
    { id: 'keys', name: 'API 키', icon: 'key', desc: '다른 확장에 넣을 키를 모아 두고 눌러서 복사', gap: true },
    { id: 'backup', name: '백업·초기화', icon: 'box', desc: '설정 파일과 초기화' },
  ];
  // 칩 아이콘: 대시보드는 대시보드 버튼의 크랙 공식 아이콘 그대로, 모델은 크랙 모델 이미지
  const stDashSvg = (k) => {
    const b = DASH_BTNS.find((x) => x.k === k) || DASH_EXT.find((x) => x.k === k);
    if (b) return b.svg;
    if (k === 'logsearch') return XSVG('<path d="M4 5h11M4 9.5h7M4 14h5"/><circle cx="15.5" cy="14.5" r="4"/><path d="M18.5 17.5L21 20"/>');
    if (k === 'theme') return SUN_SVG;
    if (k === 'layout') return BUBBLE_SVG;
    return '';
  };
  const stT = (key, label, def, more) => Object.assign({ t: 'toggle', key, label, def: def !== false }, more);
  const stDash = (ks) => ks.map((k) => ['dash.btn.' + k, k === 'model' ? '모델 버튼' : k === 'logsearch' ? '로그 검색' : k === 'theme' ? '테마 (라이트/다크)' : k === 'layout' ? '작품 화면 (소설/채팅)'
    : ((DASH_BTNS.find((x) => x.k === k) || DASH_EXT.find((x) => x.k === k) || {}).label || k), true]);
  const ST_F = [
    { cat: 'screen', id: 'edges', name: '가장자리 자동 숨김', desc: '마우스를 올릴 때만 보여요', items: [
      stT('autoHide.top', '상단 헤더'), stT('autoHide.bar', '모델 선택 바'), stT('autoHide.left', '왼쪽 사이드바'), stT('autoHide.right', '오른쪽 메뉴')] },
    { cat: 'screen', id: 'fold', name: '오래된 대화 숨기기', desc: '긴 방도 가볍게', master: 'perf.fold', items: [
      { t: 'stepper', key: 'perf.keep', label: '남길 최근 대화', def: KEEP.def, min: KEEP.min, max: KEEP.max, unit: '턴' }] },
    { cat: 'screen', id: 'lock', name: '답변 완성 때 자동 스크롤 막기', desc: '읽던 자리에 그대로', master: 'perf.scrollLock' },
    { cat: 'screen', id: 'rs', name: '화면 밖 메시지 그리기 생략', desc: '스크롤이 부드러워져요', master: 'perf.renderSkip' },
    { cat: 'input', id: 'inputTools', name: '입력창 도구', items: [
      stT('input.counter', '글자수'), stT('input.expand', '넘치면 펼치기 버튼'), stT('input.draft', '임시저장', true, { sub: '방마다 자동 저장·복구' }),
      stT('input.emptyGuard', '빈 입력 전송 막기', true, { sub: '스토리가 저절로 진행되지 않게' }), stT('input.hideHint', '엔딩 힌트 버튼 숨기기')] },
    { cat: 'input', id: 'wrap', name: '감싸기 도구', desc: '글을 드래그하면 기호로 감싸요', master: 'wrap.enabled', items: [
      { t: 'button', label: '도구 고르기·순서', btn: '편집', icon: 'open', act: 'wrap' }] },
    { cat: 'input', id: 'dash', name: '대시보드', desc: '입력창 위 두 줄', master: 'dash.on', items: [
      { t: 'chips', label: '모델 · 오른쪽 메뉴 바로가기', keys: stDash(['model', 'guide', 'profile', 'note', 'prose', 'output', 'summary', 'image', 'archive']) },
      { t: 'chips', label: '테마 · 화면', keys: stDash(['theme', 'layout']) },
      { t: 'chips', label: '확장 바로가기', sub: '로그 검색과, 지금 이 브라우저에서 켜져 있는 확장만 보여요', dyn: 'ext' },
      stT('dash.row2', '정보 줄'),
      { t: 'chips', label: '정보 줄에 보일 것', keys: [['dash.info.turns', '진행 턴', true], ['dash.info.total', '누적 크래커', true], ['dash.info.balance', '잔여 크래커', true], ['dash.info.last', '직전 차감', true]] }] },
    { cat: 'input', id: 'radio', name: '라디오존데', desc: '모델별 지금 상태와 응답 속도', master: 'radio.on', items: [
      stT('radio.latency', '첫 토큰 지연 시간'), { t: 'chips', label: '보일 모델', dyn: 'radio' }] },
    { cat: 'message', id: 'marks', name: '메시지 옆 표시', items: [
      { t: 'chips', label: '보일 것', help: 'msg.marks', keys: [['msg.chars', '글자수', true], ['msg.time', '생성 시각', true], ['msg.cost', '크래커', true], ['msg.model', '모델 아이콘', true]] }, stT('msg.user', '내 메시지에도')] },
    { cat: 'message', id: 'tools', name: '메시지 메뉴·수정창', items: [
      stT('tools.rightClick', '우클릭으로 메뉴 열기', true, { sub: 'Shift+우클릭은 브라우저 메뉴' }), stT('tools.copy', "메뉴에 '복사'"), stT('tools.cleaner', "메뉴에 '반복 표현 정리'", true, { sub: '고르면 메시지에 바로 저장' }),
      stT('tools.multiDelete', "메뉴에 '여러 개 지우기'"), stT('tools.variantDelete', "메뉴에 '다른 답변 지우기'", true, { sub: '답변 비교가 있을 때' }),
      stT('tools.pasteFix', '붙여넣을 때 줄바꿈 그대로'), stT('tools.cleanerEdit', "수정창에 '반복 표현 정리' 버튼", true, { sub: "수정창 글만 바꾸고 저장은 '수정 완료'로" })] },
    { cat: 'message', id: 'reroll', name: '다시 생성', items: [
      stT('reroll.hold', '최신 답변 길게 눌러 다시 생성'), stT('reroll.skipInstr', '지침 창 건너뛰기', false),
      stT('reroll.guard', '버튼은 길게 눌러야 동작', false, { sub: '실수로 크래커가 나가지 않게' }), stT('reroll.compareNav', '답변 비교 좌우 넘기기')] },
    { cat: 'model', id: 'stats', name: '모델별 통계 카드', desc: '오른쪽 메뉴에 이 방 사용량', master: 'models.stats', items: [
      { t: 'button', label: '이 방 통계', btn: '비우기', icon: 'trash', danger: true, act: 'mstats' }] },
    { cat: 'model', id: 'hide', name: '모델 숨기기', desc: '모델 선택창에서 가려요', master: 'models.hide', items: [
      { t: 'chips', label: '숨길 모델', sub: '지금 쓰는 모델은 가리지 않아요', dyn: 'models' }] },
    { cat: 'chatlist', id: 'cl', name: '채팅 목록', desc: '왼쪽 사이드바, 모든 화면', master: 'chatlist.on', items: [
      stT('chatlist.search', '방 찾기'), stT('chatlist.current', '지금 방 강조'), stT('chatlist.color', '방 색'), stT('chatlist.rightClick', '우클릭으로 방 메뉴'),
      stT('chatlist.resize', '보관함 칸 높이 조절'), stT('chatlist.countArchive', '보관함 방 수'), stT('chatlist.countRoot', '분류 안 된 방 수')] },
    { cat: 'chatlist', id: 'ov', name: '한눈에 보기', desc: '모든 방을 넓게', master: 'chatlist.overview', items: [
      stT('chatlist.multi', '여러 방 한꺼번에 옮기기'), stT('chatlist.dense', '촘촘히', false), { t: 'button', label: '한눈에 보기', btn: '열기', icon: 'open', act: 'ov' }] },
    { cat: 'chatlist', id: 'merge', name: '보관함 합치기', desc: '비슷한 이름끼리 묶어요', master: 'chatlist.smart', items: [stT('chatlist.smartSingle', '방 1개짜리 보관함도', false)] },
    { cat: 'chatlist', id: 'branch', name: '갈래 지도', desc: '분기한 방의 갈라진 곳', master: 'branch.on', items: [
      stT('branch.live', '분기할 때 바로 기록'), stT('branch.flags', '원본 방에 깃발'), stT('branch.listBtn', "'채팅 목록' 머리줄 버튼"), stT('branch.roomBtn', '방 위쪽 버튼'),
      stT('branch.arrive', '도착 알림'), stT('branch.hoverPath', '원본까지 길 강조'), stT('branch.autoScan', '열 때 갈라진 곳 자동으로 찾기', false, { warn: '요청 많음' }),
      { t: 'button', label: '갈래 지도', btn: '열기', icon: 'open', act: 'bm' }] },
    { cat: 'tools', id: 'ls', name: '로그 검색', desc: '방 전체 대화에서 찾고 그 턴으로', master: 'logsearch.on', items: [
      { t: 'button', label: '로그 검색', btn: '열기', icon: 'open', act: 'ls' }] },
    { cat: 'tools', id: 'vault', name: '이미지 보관함', items: [
      stT('vault.on', '한 번에 다 불러오기'), stT('vault.collectedFirst', '해금한 이미지 먼저'), stT('vault.fixCount', '해금 수 바로잡기')] },
    { cat: 'notify', id: 'done', name: '답변 완성 알림', desc: '다른 탭에 있을 때', master: 'notify.done', items: [stT('notify.doneSound', '소리', false)] },
    { cat: 'notify', id: 'others', name: '그 밖의 알림', items: [
      stT('notify.summary', '요약 메모리 업데이트'), stT('notify.crack', '크랙 새 알림'), stT('notify.attend', '출석 버튼', true, { sub: '안 했을 때만, 누르면 바로 출석' }), stT('notify.settings', '설정을 바꿨을 때')] },
  ];
  const ST_FICON = { edges: 'monitor', fold: 'fold', lock: 'lockscroll', rs: 'eyeoff', inputTools: 'keyboard', wrap: 'quote', dash: 'dash', radio: 'pulse', marks: 'tag', tools: 'dots', reroll: 'reroll',
    stats: 'chart', hide: 'eyeoff', cl: 'list', ov: 'grid', merge: 'merge', branch: 'branch', ls: 'lines', vault: 'frame', done: 'bellcheck', others: 'bell' };
  const ST_CHIPICON = { 'msg.chars': 'type', 'msg.time': 'clock', 'msg.model': 'chip' };
  const ST_HELP = {
    'perf.renderSkip': ['화면 밖 메시지 그리기 생략', '화면에 안 보이는 메시지는 브라우저가 그리지 않게 해요. 긴 방에서 스크롤과 입력이 부드러워져요. 보이는 내용은 그대로예요.'],
    'perf.scrollLock': ['자동 스크롤 막기', '위쪽 대화를 읽는 중에 답변이 끝나도 맨 아래로 끌려가지 않아요. 맨 아래에 있을 때는 평소처럼 따라 내려가요.'],
    'perf.keep': ['남길 최근 대화', '최근 이만큼의 턴만 펼쳐 두고 그 위는 접어요. 위로 올리면 다시 펼쳐져요. 로그 검색에서 턴으로 갈 때도 이만큼만 펼쳐요.'],
    'input.emptyGuard': ['빈 입력 전송 막기', '입력창이 비었을 때 보내기를 누르면 스토리가 저절로 다음으로 진행돼요. 그걸 실수로 하지 않게 막아요.'],
    'wrap.enabled': ['감싸기 도구', '입력창이나 수정창에서 글을 드래그하면 작은 막대가 떠요. 누르면 고른 글을 따옴표·괄호·굵게 같은 기호로 감싸요.'],
    'reroll.skipInstr': ['지침 창 건너뛰기', "'다시 생성'을 누르면 원래 뜨는 '재생성 지침' 창 없이 바로 다시 만들어요."],
    'reroll.guard': ['길게 눌러야 동작', '다시 생성 버튼을 잠깐 눌러서는 동작하지 않게 해요. 실수로 눌러 크래커가 나가는 것을 막아요.'],
    'chatlist.smart': ['보관함 합치기', "보관함 메뉴에 '합치기'가 생겨요. 이름이 비슷한 보관함을 찾아 하나로 묶어 줘요. 묶기 전에 미리 보여 줘요."],
    'branch.autoScan': ['갈라진 곳 자동으로 찾기', '지도를 열 때 아직 모르는 분기 방들의 갈라진 지점을 한꺼번에 찾아요. 방이 많으면 크랙에 요청이 많이 가요.'],
    'vault.fixCount': ['해금 수 바로잡기', '크랙 이미지 보관함의 해금 수가 실제보다 적게 나오는 문제가 있어요. 보관함을 열 때 실제로 세서 맞는 수로 고쳐 보여요.'],
    'radio.on': ['라디오존데', '모델마다 지금 정상인지, 느린지, 장애인지를 입력창 위 한 줄로 보여 줘요. 5분마다 새로 받아요.'],
    'models.hide': ['모델 숨기기', '모델 선택창과 답변 길이 창에서 안 쓰는 모델을 가려요. 가리기만 하고 크랙 설정은 바꾸지 않아요.'],
    'dash.row2': ['정보 줄', '진행 턴 · 이 방 누적 크래커 · 잔여 크래커 · 직전 차감. 숫자를 누르면 이름이 펼쳐져요.'],
    'msg.marks': ['메시지 옆 표시', '글자수·생성 시각은 답변 아래 줄 오른쪽에, 크래커·모델 아이콘은 왼쪽 맨 앞에 붙어요. 모델 아이콘은 소설형에서만 보여요(채팅형은 크랙이 이미 보여 줘요). 크래커는 설치한 뒤 생성된 답변부터 기록돼요.'],
    'tools.cleaner': ['반복 표현 정리', '답변에 자주 나온 말(말버릇, 되풀이되는 묘사)을 모아 보여 줘요. 골라서 한꺼번에 지우거나 다른 말로 바꾸고, 바꾸기 전에 미리보기로 확인해요. 메시지 메뉴에서 열면 고른 대로 메시지에 바로 저장돼요.'],
    'tools.cleanerEdit': ['수정창의 반복 표현 정리', "크랙 수정창 버튼 줄('취소' · '수정 완료') 앞에 버튼이 생겨요. 같은 정리 창이 열리고, 수정창 글만 바뀌어요. 저장은 평소처럼 '수정 완료'로 해요."],
  };
  const ST_HOME = ['perf.fold', 'perf.keep', 'dash.on', 'radio.on', 'notify.done', 'reroll.skipInstr'];
  // 기능마다 크랙 화면에서 붙는 자리(위치 그림의 data-a)
  const ST_AREA = { edges: ['top', 'bar', 'left', 'right'], fold: ['old'], lock: ['msg', 'last'], rs: ['old', 'msg'], inputTools: ['input'], wrap: ['input'], dash: ['dash'], radio: ['radio'],
    marks: ['marks', 'marksl'], tools: ['msg', 'last'], reroll: ['last'], stats: ['stats'], hide: ['bar'], cl: ['left'], ov: ['float'], merge: ['left'], branch: ['left'], ls: ['float'], vault: ['float'],
    done: ['toast'], others: ['toast'] };
  const ST_KEYAREA = { 'input.draft': ['input.draft'], 'input.hideHint': ['input.hideHint'], 'input.counter': ['input.counter'], 'input.expand': ['input.expand'], 'input.emptyGuard': ['input.emptyGuard'],
    'autoHide.top': ['top'], 'autoHide.bar': ['bar'], 'autoHide.left': ['left'], 'autoHide.right': ['right'], 'branch.roomBtn': ['bar'], 'branch.flags': ['left'], 'branch.listBtn': ['left'], 'branch.arrive': ['toast'],
    'notify.attend': ['notify'], 'notify.crack': ['toast'], 'reroll.hold': ['last'], 'reroll.compareNav': ['last'], 'msg.user': ['marks'], 'tools.cleanerEdit': ['last'], 'tools.pasteFix': ['last'],
    'chatlist.multi': ['float'], 'chatlist.dense': ['float'], 'dash.row2': ['dash'] };
  const ST_PLACE = { top: '상단 헤더', bar: '모델 선택 바', left: '왼쪽 채팅 목록', right: '오른쪽 메뉴', stats: '오른쪽 메뉴 아래', old: '오래된 대화', msg: '메시지', last: '최신 답변',
    marks: '답변 아래 줄', radio: '입력창 위 한 줄', dash: '입력창 위 두 줄', input: '입력창', float: '따로 뜨는 창', notify: '오른쪽 위', toast: '위 가운데 알림', marksl: '답변 아래 줄 왼쪽', ovbtn: '한눈에 보기 버튼', vaultrow: '오른쪽 메뉴 · 이미지 보관함' };
  const ST_PLAYKEY = { 'autoHide.top': 'edge-top', 'autoHide.bar': 'edge-bar', 'autoHide.left': 'edge-left', 'autoHide.right': 'edge-right', 'perf.keep': 'fold', 'reroll.hold': 'reroll' };
  const ST_PLAYFID = { edges: 'edges', fold: 'fold', lock: 'lock', rs: 'rs', inputTools: 'input', wrap: 'input', dash: 'dash', radio: 'radio', marks: 'marks', tools: 'reroll', reroll: 'reroll',
    stats: 'stats', hide: 'bar', cl: 'left', merge: 'left', branch: 'left', ov: 'float', ls: 'float', vault: 'float', done: 'toast', others: 'toast' };
  const ST_MAP = '<rect data-a="top" x="4" y="4" width="104" height="5" rx="1.5"/><rect data-a="notify" x="94" y="5" width="11" height="3" rx="1.5"/><rect data-a="toast" x="44" y="5" width="24" height="3" rx="1.5"/>'
    + '<rect data-a="left" x="4" y="12" width="20" height="52" rx="2"/><rect data-a="right" x="88" y="12" width="20" height="38" rx="2"/><rect data-a="stats" x="88" y="53" width="20" height="11" rx="2"/>'
    + '<rect data-a="bar" x="28" y="12" width="56" height="3" rx="1.5"/><rect data-a="old" x="31" y="18" width="44" height="4" rx="2"/><rect data-a="old" x="31" y="24" width="36" height="4" rx="2"/>'
    + '<rect data-a="msg" x="31" y="30" width="46" height="4" rx="2"/><rect data-a="last" x="31" y="36" width="40" height="4" rx="2"/><rect data-a="marks" x="64" y="41.5" width="13" height="2" rx="1"/><rect data-a="marksl" x="31" y="41.5" width="7" height="2" rx="1"/>'
    + '<rect data-a="radio" x="30" y="46" width="52" height="1.6" rx=".8"/><rect data-a="dash" x="30" y="49" width="52" height="2.4" rx="1"/><rect data-a="dash" x="30" y="52.6" width="30" height="2" rx="1"/>'
    + '<rect data-a="input" x="30" y="56" width="52" height="8" rx="2"/><rect data-a="input.draft" x="32" y="57.3" width="11" height="1.4" rx=".7"/><rect data-a="input.hideHint" x="32" y="61.2" width="8" height="1.6" rx=".8"/>'
    + '<rect data-a="input.counter" x="66" y="61.2" width="5" height="1.6" rx=".8"/><rect data-a="input.expand" x="72.5" y="60.5" width="3" height="3" rx=".8"/><rect data-a="input.emptyGuard" x="77" y="60.5" width="3.2" height="3" rx="1.5"/>'
    + '<rect data-a="float" x="57" y="15" width="28" height="23" rx="2.5"/>';
  const ST_FX = '<rect class="fx" id="cpb-st-vp" x="29.5" y="16.5" width="49" height="19"/><rect class="fx" id="cpb-st-newmsg" x="31" y="41" width="38" height="4" rx="2"/>'
    + '<rect class="fx" id="cpb-st-caret" x="33" y="59" width="22" height="2" rx="1"/><circle class="fx" id="cpb-st-press" cx="51" cy="38" r="3"/><rect class="fx" id="cpb-st-rowhl" x="6" y="15" width="16" height="3" rx="1.5"/>';

  // ── 값 읽기·쓰기: 실제 설정 저장소에 그대로 묶인다 ──
  // 칩 가운데 모델 목록(라디오존데 'radio.m.<이름>', 숨길 모델 'models.h.<코드>')·대시보드 칸·촘촘히 보기는 저장 모양이 달라 따로 다룬다
  function stGet(k) {
    if (k.startsWith('radio.m.')) return !radHidden().has(k.slice(8));
    if (k.startsWith('models.h.')) return modelHidden().has(k.slice(9));
    if (k === 'chatlist.dense') return ovView() === 'dense';
    if (k === 'wrap.enabled') return wrapConf().enabled;
    if (k === 'perf.keep') return foldKeep();
    const v = pathGet(conf, k);
    if (v === undefined) { const d = stDef(k); return d; }
    return typeof stDef(k) === 'boolean' ? (stDef(k) ? v !== false : v === true) : v;
  }
  function stSet(k, v) {
    if (k.startsWith('radio.m.')) { const h = radHidden(), s = k.slice(8); if (v) h.delete(s); else h.add(s); settings.set('radio.hidden', [...h]); return; }
    if (k.startsWith('models.h.')) { modelSetHidden(k.slice(9), !!v); return; }
    if (k === 'chatlist.dense') { settings.set('chatlist.view', v ? 'dense' : 'grid'); return; }
    settings.set(k, v);
  }
  let stDefs = null, stItems = null, stLabels = null;
  function stIndex() {
    if (stDefs) return;
    stDefs = {}; stItems = {}; stLabels = {};
    for (const f of ST_F) {
      if (f.master) { stDefs[f.master] = true; stLabels[f.master] = f.name; }
      for (const it of f.items || []) {
        if (it.key) { stDefs[it.key] = it.def; stItems[it.key] = it; stLabels[it.key] = it.label; }
        if (it.keys) for (const [k, l, d] of it.keys) { stDefs[k] = d !== false; stLabels[k] = l; }
      }
    }
  }
  function stDef(k) {
    stIndex();
    if (k in stDefs) return stDefs[k];
    if (k.startsWith('radio.m.')) return true;
    if (k.startsWith('models.h.')) return false;
    const d = pathGet(DEFAULTS, k);
    return d === undefined ? true : d;
  }
  const stMod = (k) => stGet(k) !== stDef(k);
  // 칩 목록이 실제 데이터에서 오는 것: 라디오존데 모델(크랙 모델 이미지가 있으면 그것, 없으면 회사별 점), 숨길 모델(크랙 모델 이미지 + 크래커 배지)
  const stRadIcon = (s) => {
    for (const t of Object.keys(models)) if (!models[t].dead && engineSlugs(models[t].engine).includes(s)) return models[t].icon;
    return '';
  };
  function stDynKeys(it) {
    if (it.dyn === 'radio') return radList().map((s) => ['radio.m.' + s, radName(s), true]);
    if (it.dyn === 'models') return Object.keys(models).filter((t) => !models[t].dead).map((t) => ['models.h.' + t, models[t].name, false]);
    // 확장 바로가기: 우리 로그 검색 + 지금 페이지에서 찾아지는(= 설치돼 켜져 있는) 확장만
    if (it.dyn === 'ext') return stDash(['logsearch', ...DASH_EXT.filter((x) => attempt(x.find)).map((x) => x.k)]);
    return it.keys || [];
  }
  const stKeysOf = (f) => { const k = f.master ? [f.master] : []; for (const it of f.items || []) { if (it.key) k.push(it.key); for (const [x] of stDynKeys(it)) k.push(x); } return k; };
  const stItemKeys = (it) => (it.key ? [it.key] : stDynKeys(it).map((k) => k[0]));
  let stFeatOf = null;
  function stAreaOf(it) {
    if (!stFeatOf) { stFeatOf = {}; for (const f of ST_F) for (const k of stKeysOf(f)) stFeatOf[k] = f.id; }
    const k = it.key || (stItemKeys(it)[0] || '');
    return ST_KEYAREA[k] || ST_AREA[stFeatOf[k] || (ST_F.find((f) => (f.items || []).includes(it)) || {}).id] || [];
  }
  const stCatArea = (id) => [...new Set(ST_F.filter((f) => f.cat === id).flatMap((f) => ST_AREA[f.id] || []))];

  // ── 창 ──
  const setUI = { el: null, open: false, cur: 'home', q: '', only: false, peek: null, hoverT: 0, mapBase: null, mapCard: null, opener: null };
  const stEsc = escHtml;
  const stHl = (s) => { const t = stEsc(s); const q = setUI.q; if (!q) return t; const i = t.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? t : t.slice(0, i) + '<mark>' + t.slice(i, i + q.length) + '</mark>' + t.slice(i + q.length); };
  const stHelpBtn = (k) => (ST_HELP[k] ? '<button type="button" class="help" data-help="' + k + '" aria-label="도움말" tabindex="-1">?</button>' : '');
  const stResetBtn = (keys) => '<button type="button" class="reset" data-reset="' + keys.join(',') + '" title="기본값으로" aria-label="기본값으로">' + sic('reset', 14) + '</button>';
  const stOnOff = (v) => (v ? '기본 켬' : '기본 끔');
  const stBadge = (n) => '<span class="cbadge"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + CRACKER_D + '"/></svg>' + NUMF.format(n) + '개</span>';
  function stChipHtml(k, l) {
    let ic = '';
    if (k.startsWith('dash.btn.')) ic = k === 'dash.btn.model' ? (() => { const c = currentModel(), mi = c && modelInfo(c); return mi && mi.icon ? '<img src="' + stEsc(mi.icon) + '" alt="">' : sic('chip', 15); })() : stDashSvg(k.slice(9));
    else if (k.startsWith('dash.info.')) ic = INFO_SVG[k.slice(10)] || '';
    else if (k.startsWith('radio.m.')) { const src = stRadIcon(k.slice(8)); ic = src ? '<img src="' + stEsc(src) + '" alt="">' : '<i class="vdot v-' + (k.slice(8).split('-')[0]) + '"></i>'; }
    else if (k.startsWith('models.h.')) { const mi = models[k.slice(9)]; ic = mi && mi.icon ? '<img src="' + stEsc(mi.icon) + '" alt="">' : ''; }
    else if (k === 'msg.cost') ic = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="' + CRACKER_D + '"/></svg>';
    else ic = sic(ST_CHIPICON[k] || 'dot', 15);
    const mi = k.startsWith('models.h.') ? models[k.slice(9)] : null;
    const ca = k === 'msg.cost' || k === 'msg.model' ? ' data-area="marksl"' : k === 'msg.chars' || k === 'msg.time' ? ' data-area="marks"' : '';
    return '<button type="button" class="chip' + (k.startsWith('models.h.') ? ' hidechip' : '') + '" data-k="' + stEsc(k) + '"' + ca + '><span class="ci">' + ic + '</span>' + stHl(l)
      + (mi && mi.engine ? '<span class="eng">' + stEsc(mi.engine) + '</span>' : '') + (mi && mi.cost ? stBadge(mi.cost) : '') + '</button>';
  }
  function stRowHtml(it) {
    const keys = stItemKeys(it);
    const sub = it.sub ? '<small>' + stHl(it.sub) + '</small>' : '';
    const warn = it.warn ? '<span class="badge warn">' + stEsc(it.warn) + '</span>' : '';
    const dv = it.t === 'toggle' ? stOnOff(stDef(it.key)) : it.t === 'stepper' ? '기본 ' + stDef(it.key) + it.unit : '';
    const lb = '<em class="lb">' + stHl(it.label) + '</em>' + stHelpBtn(it.key || it.help) + (it.t === 'chips' ? '<span class="dv" data-dvc="' + stEsc(keys.join(',')) + '"></span>' : dv ? '<span class="dv">' + dv + '</span>' : '');
    const head = '<div class="rt"><span>' + lb + warn + '</span>' + sub + '</div>';
    const ar = ' data-area="' + stAreaOf(it).join(',') + '"';
    if (it.t === 'toggle') return '<div class="row" data-mk="' + it.key + '"' + ar + '>' + head + '<button type="button" class="sw" role="switch" data-k="' + it.key + '" aria-label="' + stEsc(it.label) + '"></button></div>';
    if (it.t === 'stepper') return '<div class="row" data-mk="' + it.key + '"' + ar + '>' + head + stResetBtn(keys)
      + '<div class="step"><button type="button" data-step="' + it.key + '" data-d="-1" aria-label="줄이기">' + sic('minus', 13, 2) + '</button><div class="num" data-num="' + it.key + '"><span></span></div><button type="button" data-step="' + it.key + '" data-d="1" aria-label="늘리기">' + sic('plus', 13, 2) + '</button></div></div>';
    if (it.t === 'chips') {
      const ks = stDynKeys(it);
      if (!ks.length) return '<div class="row"><div class="rt"><span><em class="lb">' + stHl(it.label) + '</em></span><small>' + (it.dyn === 'models' ? '모델 목록은 채팅방에 한 번 들어가면 채워져요' : '목록이 아직 없어요') + '</small></div></div>';
      const top = '<div class="row block" data-mk="' + stEsc(keys.join(',')) + '"' + ar + '><div class="rt rth"><div class="rtg"><span>' + lb + '</span>' + sub + '</div>' + stResetBtn(keys) + '</div>';
      if (it.dyn === 'radio') {
        // 라디오존데 모델은 회사별로 묶고, 칩에는 회사 이름을 빼고 짧게. 묶음 이름을 누르면 그 회사 것을 한꺼번에 켜고 끈다
        const VEND = [['claude', 'Claude', /^/], ['gemini', 'Gemini', /^Gemini /], ['gpt', 'GPT', /^GPT-/], ['deepseek', 'DeepSeek', /^DeepSeek /]];
        const groups = [];
        for (const [k, l] of ks) {
          const slug = k.slice(8), v = VEND.find((x) => slug.startsWith(x[0] + '-')) || ['etc', '기타', /^/];
          let g = groups.find((x) => x.id === v[0]);
          if (!g) groups.push((g = { id: v[0], name: v[1], items: [] }));
          g.items.push([k, l.replace(v[2], '')]);
        }
        return top + groups.map((g) => '<div class="cgrp"><button type="button" class="cgl" data-grp="' + stEsc(g.items.map((x) => x[0]).join(',')) + '"><i class="vdot v-' + g.id + '"></i>' + stEsc(g.name)
          + '<span class="cgn"></span></button><div class="chips">' + g.items.map(([k, l]) => stChipHtml(k, l)).join('') + '</div></div>').join('') + '</div>';
      }
      return top + '<div class="chips">' + ks.map(([k, l]) => stChipHtml(k, l)).join('') + '</div></div>';
    }
    if (it.t === 'button') return '<div class="row">' + head + '<button type="button" class="btn' + (it.danger ? ' danger' : '') + '" data-act="' + it.act + '">' + sic(it.icon, 14) + stEsc(it.btn) + '</button></div>';
    return '';
  }
  function stCardHtml(f) {
    const items = f.items || [];
    const hint = f.master && items.length ? '<div class="hint"><span>' + items.map((it) => stEsc(it.label)).slice(0, 3).join(' · ') + (items.length > 3 ? ' …' : '') + '</span></div>' : '';
    const ico = ST_FICON[f.id] || 'dot';
    return '<div class="card" data-fid="' + f.id + '" data-card="' + (f.master || '') + '"><div class="ch"' + (f.master ? ' data-mk="' + f.master + '"' : '') + '>'
      + '<div class="tile" data-ico="' + ico + '">' + sic(ico, 19) + '</div><div class="ct"><b>' + stHl(f.name) + stHelpBtn(f.master) + (f.master ? '<span class="dv">' + stOnOff(stDef(f.master)) + '</span>' : '') + '</b>' + (f.desc ? '<p>' + stHl(f.desc) + '</p>' : '') + hint + '</div>'
      + (f.master ? '<div class="ctl"><button type="button" class="sw" role="switch" data-k="' + f.master + '" aria-label="' + stEsc(f.name) + '"></button></div>' : '') + '</div>'
      + (items.length ? '<div class="cbw"><div class="cb"><div>' + items.map(stRowHtml).join('') + '</div></div></div>' : '') + '</div>';
  }
  const stAllKeys = () => [...new Set(ST_F.flatMap(stKeysOf))];
  function stRender() {
    const w = setUI.el;
    if (!w) return;
    const body = w.querySelector('[data-body]');
    let html = '';
    const ttl = w.querySelector('[data-title]'), desc = w.querySelector('[data-desc]');
    if (setUI.q || setUI.only) {
      const s = setUI.q.toLowerCase();
      const fs = ST_F.filter((f) => (!setUI.only || stKeysOf(f).some(stMod)) && (!s || [f.name, f.desc || '', ...(f.items || []).flatMap((it) => [it.label, it.sub || '', ...stDynKeys(it).map((k) => k[1])])].join(' ').toLowerCase().includes(s)));
      ttl.textContent = setUI.q ? '찾기' : '바꾼 설정';
      desc.textContent = setUI.q ? "'" + setUI.q + "' · " + fs.length + '개' : '기본값과 다른 것만';
      let last = '';
      for (const f of fs) { if (f.cat !== last) { const c = ST_CATS.find((x) => x.id === f.cat); html += '<div class="from">' + sic(c.icon, 13) + c.name + '</div>'; last = f.cat; } html += stCardHtml(f); }
      if (!fs.length) html = '<div class="empty">' + (setUI.q ? '맞는 설정이 없어요' : '모두 기본값이에요') + '</div>';
    } else {
      const c = ST_CATS.find((x) => x.id === setUI.cur);
      ttl.textContent = c.name; desc.textContent = c.desc;
      if (setUI.cur === 'home') {
        const qa = (icon, t, act) => '<button type="button" class="qa" data-act="' + act + '">' + sic(icon) + t + '<span class="ar">' + sic('arrow', 14, 2) + '</span></button>';
        stIndex();
        const picks = ST_HOME.map((k) => { const f = ST_F.find((x) => x.master === k); return f ? { t: 'toggle', key: k, label: f.name } : stItems[k]; }).filter(Boolean);
        const on = ST_F.filter((x) => !x.master || stGet(x.master)).length, nmod = stAllKeys().filter(stMod).length;
        let wi = 0;
        html = '<div class="hero"><svg viewBox="0 0 112 68" aria-hidden="true">' + ST_MAP.replace(/<rect /g, () => '<rect style="--i:' + (wi++) + '" ') + '</svg>'
          + '<div><h2>Crack PC Base</h2><p>크랙을 더 가볍고 편하게. 바꾸면 바로 적용돼요.</p><div class="meta"><span>켜진 기능 <b>' + on + '</b> / ' + ST_F.length + '</span><span>바꾼 설정 <b>' + nmod + '</b></span><span>' + stEsc(VERSION) + '</span></div></div></div>'
          + '<div class="label">바로 열기</div><div class="quick">' + qa('search', '로그 검색', 'ls') + qa('grid', '한눈에 보기', 'ov') + qa('branch', '갈래 지도', 'bm') + '</div>'
          + '<div class="label">자주 바꾸는 것</div><div class="card"><div>' + picks.map(stRowHtml).join('') + '</div></div>';
      } else if (setUI.cur === 'backup') {
        const r = (t, s, b) => '<div class="row"><div class="rt"><span>' + t + '</span><small>' + s + '</small></div>' + b + '</div>';
        html = '<div class="card"><div>' + r('내보내기', '지금 설정을 파일 하나로', '<button type="button" class="btn" data-act="export">' + sic('down', 14) + '내보내기</button>')
          + r('가져오기', '내보낸 파일로 덮어써요', '<button type="button" class="btn" data-act="import">' + sic('up', 14) + '파일 고르기</button>')
          + r('다른 기기와 맞추기 <span class="badge soon">준비 중</span>', '계정으로 설정을 동기화', '<button type="button" class="btn" disabled>켜기</button>') + '</div></div>'
          + '<div class="label">되돌릴 수 없어요</div><div class="danger-zone card"><div>' + r('모든 설정 기본값으로', '켜고 끈 것, 숫자, 고른 모델 전부', '<button type="button" class="btn danger" data-act="factory">기본값으로</button>') + '</div></div>';
      } else if (setUI.cur === 'keys') html = stKeysHtml();
      else html = ST_F.filter((f) => f.cat === setUI.cur).map(stCardHtml).join('');
    }
    setUI.mapCard = null;
    setUI.mapBase = setUI.q || setUI.only ? [] : setUI.cur === 'home' || setUI.cur === 'backup' || setUI.cur === 'keys' ? null : stCatArea(setUI.cur);
    stLightMap(setUI.mapBase);
    stSetPlay(null);
    body.innerHTML = '<div class="page">' + html + '</div>';
    body.scrollTop = 0;
    stSync(true);
  }
  // 상태만 고친다(움직임이 끊기지 않게 DOM은 그대로)
  function stSync(first) {
    const w = setUI.el;
    if (!w) return;
    const scope = [w, document.getElementById('cpb-st-hud')].filter(Boolean);
    const all = (sel) => scope.flatMap((r) => Array.from(r.querySelectorAll(sel)));
    for (const el of all('[data-k]')) { const on = !!stGet(el.dataset.k); if (el.classList.contains('sw')) setAttr(el, 'aria-checked', String(on)); else setAttr(el, 'aria-pressed', String(on)); }
    for (const el of all('[data-mk]')) el.classList.toggle('mod', el.dataset.mk.split(',').some(stMod));
    for (const el of all('[data-card]')) el.classList.toggle('off', !!el.dataset.card && !stGet(el.dataset.card));
    stIndex();
    for (const el of all('[data-num]')) {
      const k = el.dataset.num, it = stItems[k], s = el.firstElementChild, v = stGet(k) + it.unit;
      if (first || s.textContent !== v) s.textContent = v;
      for (const b of el.parentElement.querySelectorAll('[data-step]')) b.disabled = Number(b.dataset.d) < 0 ? stGet(k) <= it.min : stGet(k) >= it.max;
    }
    for (const c of ST_CATS) { const b = w.querySelector('[data-cat="' + c.id + '"]'); if (b) b.classList.toggle('has', ST_F.some((f) => f.cat === c.id && stKeysOf(f).some(stMod))); }
    for (const el of all('[data-grp]')) { const ks = el.dataset.grp.split(','), n = ks.filter((k) => stGet(k)).length, c = el.querySelector('.cgn'), tx = n + '/' + ks.length; if (c && c.textContent !== tx) c.textContent = tx; }
    for (const el of all('[data-dvc]')) { const n = el.dataset.dvc.split(',').filter(stMod).length; el.textContent = n ? '기본에서 ' + n + '개 바꿈' : ''; }
    for (const b of w.querySelectorAll('[data-cat]')) setAttr(b, 'aria-current', String(!setUI.q && !setUI.only && b.dataset.cat === setUI.cur));
    stPill();
    const p = setUI.peek && document.getElementById('cpb-st-pvstate');
    if (p) p.textContent = stStateText(setUI.peek.key);
    const n = stAllKeys().filter(stMod).length;
    const foot = w.querySelector('[data-foot]');
    const fh = n ? '<span class="grow">바꾼 설정 ' + n + '개</span><button type="button" class="link" data-only>보기</button><button type="button" class="link" data-all-reset>되돌리기</button>' : '<span class="grow">모두 기본값</span>';
    if (foot.dataset.sig !== fh) { foot.dataset.sig = fh; foot.innerHTML = fh; }
  }
  function stPill() {
    const w = setUI.el, a = w.querySelector('[data-cat][aria-current="true"]'), p = w.querySelector('.pill');
    p.style.opacity = a ? '1' : '0';
    if (a) p.style.transform = 'translateY(' + a.offsetTop + 'px)';
  }
  function stStep(k, d) {
    stIndex();
    const it = stItems[k], prev = stGet(k);
    const next = Math.max(it.min, Math.min(it.max, keepStep(prev, d)));
    if (next === prev) return;
    for (const el of [setUI.el, document.getElementById('cpb-st-hud')].filter(Boolean).flatMap((r) => Array.from(r.querySelectorAll('[data-num="' + k + '"]')))) {
      const s = document.createElement('span'); s.className = d > 0 ? 'up' : 'down'; s.textContent = next + it.unit; el.replaceChildren(s);
    }
    stSet(k, next);
  }
  function stLightMap(areas) {
    const m = setUI.el && setUI.el.querySelector('.map');
    if (!m) return;
    m.classList.toggle('none', !areas);
    m.classList.toggle('focus', !!(areas && areas.length));
    for (const r of m.querySelectorAll('[data-a]')) r.classList.toggle('lit', !!areas && areas.includes(r.dataset.a));
  }
  function stSetPlay(el) {
    const m = setUI.el && setUI.el.querySelector('.map');
    if (!m) return;
    let play = '';
    if (el) {
      const k = (el.dataset.mk || '').split(',')[0];
      if (k && ST_PLAYKEY[k]) play = ST_PLAYKEY[k];
      else { if (!stFeatOf) stAreaOf({ key: '' }); const fc = el.closest('[data-fid]'); play = ST_PLAYFID[el.dataset.fid || stFeatOf[k] || (fc ? fc.dataset.fid : '')] || ''; }
    }
    if (m.dataset.play !== play) m.dataset.play = play;
    m.classList.toggle('off', play === 'lock' && !stGet('perf.scrollLock'));
  }
  function stMapFor(t) {
    const r = t && t.closest ? t.closest('[data-area]') : null;
    const c = r && r.dataset.area ? r : t && t.closest ? t.closest('[data-fid]') : null;
    if (c === setUI.mapCard) return;
    setUI.mapCard = c;
    stLightMap(!c ? setUI.mapBase : c.dataset.area ? c.dataset.area.split(',') : ST_AREA[c.dataset.fid] || []);
    stSetPlay(c);
  }

  // ── 엿보기: 진짜 크랙 화면의 그 자리 ──
  const stStateText = (k) => { stIndex(); return stItems[k] && stItems[k].t === 'stepper' ? stGet(k) + stItems[k].unit : stGet(k) ? '켬' : '꺼짐'; };
  // 화면 안에 보이는 부분만(0이면 null)
  // 넘쳐서 잘리는 부모(overflow가 visible이 아닌 것) 안쪽만 센다: 가로로 넘치는 줄의 안 보이는 칸까지 짚지 않게
  function stVis(el) {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    let l = Math.max(0, r.left), t = Math.max(0, r.top), rr = Math.min(innerWidth, r.right), b = Math.min(innerHeight, r.bottom);
    for (let p = el.parentElement, i = 0; p && p !== document.body && i < 10; p = p.parentElement, i++) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      l = Math.max(l, q.left); t = Math.max(t, q.top); rr = Math.min(rr, q.right); b = Math.min(b, q.bottom);
    }
    return rr - l > 2 && b - t > 2 ? { l, t, w: rr - l, h: b - t } : null;
  }
  function stGroups() {
    if (!foldList || !foldList.isConnected) return [];
    const out = [];
    for (const g of foldList.children) { if (!g.hasAttribute('data-message-group-id') || g.hasAttribute('data-cpb-fold')) continue; const r = stVis(g); if (r) out.push({ g, r }); }
    return out;
  }
  const stUnion = (rs) => { rs = rs.filter(Boolean); if (!rs.length) return null; const l = Math.min(...rs.map((r) => r.l)), t = Math.min(...rs.map((r) => r.t)); return { l, t, w: Math.max(...rs.map((r) => r.l + r.w)) - l, h: Math.max(...rs.map((r) => r.t + r.h)) - t }; };
  // 자리 이름 → 화면 사각형들. 자동 숨김으로 숨어 있는 가장자리는 엿보는 동안만 연다(opened에 적어 두고 끝나면 닫는다)
  function stRects(a, opened) {
    const reg = { top: 'top', bar: 'bar', left: 'left', right: 'right' }[a];
    if (reg) {
      if (active && autoHide(reg) && R[reg] && !R[reg].open) { open(reg, 'api'); opened.add(reg); }
      const r = stVis(regionEl(reg));
      return r ? [r] : [];
    }
    const gs = stGroups(), last = gs.length ? gs[gs.length - 1] : null;
    const lastAi = gs.slice().reverse().find((x) => !isUserMsg(x.g)) || last;
    const q1 = (sel) => (lastAi ? stVis(lastAi.g.querySelector(sel)) : null);
    if (a === 'old') return gs.length > 1 ? [gs[0].r] : [];
    if (a === 'msg') return gs.length > 2 ? [gs[Math.floor((gs.length - 1) / 2)].r] : gs.length ? [gs[0].r] : [];
    if (a === 'last') return lastAi ? [lastAi.r] : [];
    // 답변 아래 줄: 글자수·시각은 오른쪽 묶음(.cpb-info), 크래커·모델 아이콘은 왼쪽 칸 맨 앞. 화면에 보이는 답변 가운데 그 표시가 있는 가장 최신 것
    const ais = gs.filter((x) => !isUserMsg(x.g)).reverse();
    const findIn = (sel) => { for (const x of ais) { const r = stVis(x.g.querySelector(sel)); if (r) return r; } return null; };
    const leftCell = () => { for (const x of ais) { const m = msgActions(x.g); const r = m && m.left && stVis(m.left); if (r) return r; } return null; };
    if (a === 'marks' || a === 'msg.chars' || a === 'msg.time') { const r = findIn('.cpb-info'); return r ? [r] : lastAi ? [lastAi.r] : []; }
    if (a === 'marksl') { const r = stUnion([findIn('.cpb-model'), findIn('.cpb-cost')]) || leftCell(); return r ? [r] : []; }
    if (a === 'msg.cost') { const r = findIn('.cpb-cost') || leftCell(); return r ? [r] : []; }
    if (a === 'msg.model') { const r = findIn('.cpb-model') || findIn('img[alt="model"]') || leftCell(); return r ? [r] : []; }
    if (a === 'stats') { const r = stVis(statsEl); if (r) return [r]; return stRects('right', opened); }
    if (a === 'radio') { const r = stVis(radEl); return r ? [r] : []; }
    if (a.startsWith('radio.m.')) {
      const nm = radShort(a.slice(8));
      const it = radEl && Array.from(radEl.querySelectorAll('.bitem')).find((x) => (x.querySelector('.bname') || {}).textContent === nm);
      const r = stVis(it) || stVis(radEl);
      return r ? [r] : [];
    }
    if (a === 'radio.latency') { const r = stUnion(radEl ? Array.from(radEl.querySelectorAll('.blat')).map(stVis) : []) || stVis(radEl); return r ? [r] : []; }
    if (a === 'dash' || a === 'dash.row2') { const r = stVis(a === 'dash.row2' && dashEl ? dashEl.querySelector('.d2') : dashEl) || stVis(dashEl); return r ? [r] : []; }
    if (a.startsWith('dash.btn.')) { const r = dashEl && stVis(dashEl.querySelector('[data-k="' + a.slice(9) + '"]')); return r ? [r] : stRects('dash', opened); }
    if (a.startsWith('dash.info.')) { const r = dashEl && stVis(dashEl.querySelector('[data-p="' + a.slice(10) + '"]')); return r ? [r] : stRects('dash', opened); }
    if (a === 'input' || a === 'input.draft' || a === 'input.hideHint') { const r = stVis(cmp.box); return r ? [r] : []; }
    if (a === 'input.counter') { const r = stVis(cntEl) || stVis(cmp.box); return r ? [r] : []; }
    if (a === 'input.expand') { const r = stVis(expBtn) || stVis(cmp.box); return r ? [r] : []; }
    if (a === 'input.emptyGuard') { const r = stVis(cmp.send) || stVis(cmp.box); return r ? [r] : []; }
    if (a === 'notify') { const r = stVis(attendBtn) || { l: innerWidth - 300, t: 60, w: 270, h: 44 }; return [r]; }
    // 알림(토스트)은 화면 위 가운데에 뜬다
    if (a === 'toast') { const w = Math.min(420, innerWidth - 32); return [{ l: (innerWidth - w) / 2, t: 58, w, h: 52 }]; }
    // 따로 뜨는 창은 여는 자리를 짚는다: 한눈에 보기 = 채팅 목록 위 버튼, 이미지 보관함 = 오른쪽 메뉴 줄
    if (a === 'ovbtn') { const l = stRects('left', opened); if (opened.has('left')) return l; const r = stVis(ovL.grid); return r ? [r] : l; }
    if (a === 'vaultrow') { const l = stRects('right', opened); if (opened.has('right')) return l; const r = stVis(panelRow('이미지 보관함')); return r ? [r] : l; }
    if (a.startsWith('models.h.')) return stRects('bar', opened);
    return [];
  }
  const stPlaceKey = (a) => (a === 'msg.cost' || a === 'msg.model' ? 'marksl' : a.startsWith('msg.') ? 'marks' : a.startsWith('models.h.') ? 'bar' : a.split('.')[0] in ST_PLACE ? a.split('.')[0] : a);
  function stPvShow(areas, title, key) {
    const opened = new Set();
    const collect = (op) => { const out = []; for (const a of areas) for (const r of stRects(a, op)) out.push(Object.assign({ a: stPlaceKey(a) }, r)); return out; };
    const rs = collect(opened);
    if (!rs.length && !opened.size) return null;
    const hud = document.getElementById('cpb-st-hud');
    const draw = () => {
      // 숨어 있던 가장자리를 열었으면 미끄러져 들어온 뒤에 잰다
      const got = opened.size ? collect(new Set()) : rs;
      if (!got.length) return;
      const pad = 7, zr = got.map((r) => ({ a: r.a, l: r.l - pad, t: r.t - pad, w: r.w + pad * 2, h: r.h + pad * 2, rw: Math.round(r.w), rh: Math.round(r.h) }));      const svg = hud.querySelector('.spot');
      svg.querySelector('[data-holes]').innerHTML = zr.map((r) => '<rect x="' + r.l + '" y="' + r.t + '" width="' + r.w + '" height="' + r.h + '" rx="12" fill="#000"/>').join('');
      svg.querySelector('[data-rings]').innerHTML = zr.map((r) => '<rect class="ring" pathLength="100" x="' + r.l + '" y="' + r.t + '" width="' + r.w + '" height="' + r.h + '" rx="12"/>').join('');
      for (const el of hud.querySelectorAll('.hudbox,.callout')) el.remove();
      const big = zr.slice().sort((x, y) => y.w * y.h - x.w * x.h)[0];
      const rightRoom = innerWidth - (big.l + big.w), leftSide = rightRoom < 300 && big.l > rightRoom;
      const cy = Math.max(70, Math.min(innerHeight - 90, big.t + big.h / 2));
      // 작은 자리(버튼·칩 하나)는 꼬리표를 바로 위에 띄운다: 옆에 두면 이웃 버튼을 가린다
      const above = big.h < 80 && big.t > 150;
      hud.insertAdjacentHTML('afterbegin', zr.map((r) => '<div class="hudbox" style="left:' + r.l + 'px;top:' + r.t + 'px;width:' + r.w + 'px;height:' + r.h + 'px"><i></i><i></i><i></i><i></i></div>').join('')
        + '<div class="callout' + (above ? ' above' : leftSide ? ' left' : '') + '" style="' + (above ? 'bottom:' + (innerHeight - big.t) + 'px;left:' + Math.max(12, Math.min(innerWidth - 320, big.l + big.w / 2 - 24)) + 'px' : 'top:' + (cy - 40) + 'px;' + (leftSide ? 'right:' + (innerWidth - big.l) + 'px' : 'left:' + (big.l + big.w) + 'px')) + '"><span class="lead"></span><div class="tag">'
        + '<div class="cap"><b>' + stEsc(ST_PLACE[big.a] || '') + '</b><code>' + big.rw + '×' + big.rh + '</code></div><div class="ttl">' + stEsc(title) + '</div>'
        + '<div class="st"><em>지금</em><em class="now" id="cpb-st-pvstate">' + stStateText(key) + '</em></div></div></div>');
    };
    if (opened.size) setTimeout(() => { if (setUI.peek) draw(); }, 320); else draw();
    return opened;
  }
  function stPeekStart(ctrl) {
    if (setUI.peek || calmMotion()) return;
    const key = ctrl.dataset.k || ctrl.dataset.step;
    const row = ctrl.closest('[data-mk]'), card = ctrl.closest('[data-fid]'), isChip = ctrl.classList.contains('chip');
    const own = /^(dash\.(btn|info)\.|radio\.m\.|msg\.(chars|time|cost|model)$|radio\.latency$|dash\.row2$)/.test(key) ? [key] : null;
    const fid = card ? card.dataset.fid : '';
    let areas = own || (row && row.dataset.area ? row.dataset.area.split(',') : null) || (card ? ST_AREA[fid] : null);
    if (!areas || !areas.length) return;
    // 위치 그림의 '따로 뜨는 창'은 진짜 화면에선 그 창을 여는 자리로 짚는다
    const FLOAT = { ov: ['ovbtn'], ls: ['dash.btn.logsearch'], vault: ['vaultrow'] };
    areas = [...new Set(areas.flatMap((a) => (a === 'float' ? FLOAT[fid] || [] : [a])))];
    if (!areas.length) return;
    stIndex();
    const nm = stLabels[key] || (key.startsWith('radio.m.') ? radName(key.slice(8)) : key.startsWith('models.h.') && models[key.slice(9)] ? models[key.slice(9)].name : key);
    const title = isChip ? ((row && row.querySelector('.lb')) || {}).textContent + ' · ' + nm : nm;
    const src = isChip ? ctrl : row || ctrl, r = src.getBoundingClientRect();
    setUI.peek = { key, clone: null, opened: new Set() };
    const opened = stPvShow(areas, title, key);
    if (!opened) { setUI.peek = null; return; }
    setUI.peek.opened = opened;
    // 그 줄(칩)만 같은 자리에 띄운다: 같은 data-k라 누르면 원래 것과 똑같이 동작하고 상태도 같이 따라간다
    const clone = src.cloneNode(true);
    clone.classList.add('peek-float');
    clone.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;min-height:' + r.height + 'px';
    const hud = document.getElementById('cpb-st-hud');
    hud.appendChild(clone);
    clone.addEventListener('pointerleave', stPeekEnd);
    setUI.peek.clone = clone;
    flag(setUI.el, 'data-pv', true);
    flag(hud, 'data-pv', true);
    // 알림 설정: 그 알림이 어떻게 뜨는지 위 가운데에 한 번 보여 준다
    const PREVIEW = { 'notify.summary': ['요약 메모리가 업데이트됐어요', 'memory'], 'notify.crack': ['크랙에 새 알림이 있어요', 'bell'], 'notify.settings': ['상단 헤더 자동 숨김 · 켬', 'on'],
      'notify.done': ['답변이 완성됐어요', 'ok'], 'notify.doneSound': ['답변이 완성됐어요', 'ok'], 'branch.arrive': ['갈래에 도착했어요', 'ok'] };
    if (areas.includes('toast') && PREVIEW[key]) toast(PREVIEW[key][0], { icon: PREVIEW[key][1], key: 'st-preview', duration: 2400 });
  }
  function stPeekEnd() {
    clearTimeout(setUI.hoverT);
    const p = setUI.peek;
    if (!p) return;
    setUI.peek = null;
    for (const n of p.opened) forceClose(n);
    const hud = document.getElementById('cpb-st-hud');
    if (setUI.el) delAttr(setUI.el, 'data-pv');
    if (hud) delAttr(hud, 'data-pv');
    if (p.clone) p.clone.classList.add('out');
    setTimeout(() => {
      if (p.clone) p.clone.remove();
      if (!setUI.peek && hud) for (const el of hud.querySelectorAll('.hudbox,.callout')) el.remove();
    }, 260);
  }

  // ── 백업 ──
  function stExport() {
    const blob = new Blob([JSON.stringify({ app: 'crack-pc-base', v: VERSION, at: new Date().toISOString(), settings: conf }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crack-pc-base-settings.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('설정을 파일로 내보냈어요', { icon: 'ok', key: 'st' });
  }
  function stImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      f.text().then((t) => {
        const j = JSON.parse(t), s = isObj(j) && isObj(j.settings) ? j.settings : j;
        if (!isObj(s) || !Object.keys(s).some((k) => k in DEFAULTS)) throw new Error('bad');
        const prev = clone(conf);
        conf = deepMerge(DEFAULTS, s);
        writeJSON(SETTINGS_KEY, conf);
        settingsChanged('*');
        toast('설정을 가져왔어요 · 눌러서 되돌리기', { icon: 'ok', key: 'st', duration: 6000, onClick: () => { conf = prev; writeJSON(SETTINGS_KEY, conf); settingsChanged('*'); } });
      }).catch(() => toast('이 파일은 설정 파일이 아니에요', { icon: 'err', key: 'st' }));
    });
    inp.click();
  }
  function stFactory() {
    const prev = clone(conf);
    toast('한 번 더 누르면 모든 설정을 기본값으로 돌려요', { key: 'st', duration: 5000, action: '기본값으로', onClick: () => {
      conf = clone(DEFAULTS);
      writeJSON(SETTINGS_KEY, conf);
      settingsChanged('*');
      toast('모두 기본값으로 돌렸어요 · 눌러서 되돌리기', { icon: 'ok', key: 'st', duration: 6000, onClick: () => { conf = prev; writeJSON(SETTINGS_KEY, conf); settingsChanged('*'); } });
    } });
  }
  // ── API 키 보관함: 다른 확장에 넣을 키를 모아 두고 눌러서 복사 ──
  // 설정과 따로 저장한다('crack-pc-base:keys:v1' = [{id, name, v, at}]). 그래서 설정 내보내기·가져오기·기본값으로에 섞이지 않는다.
  // 이 브라우저의 crack.wrtn.ai 저장소(localStorage)라 같은 사이트에서 도는 다른 스크립트도 읽을 수 있다 → 화면에 그대로 적어 둔다.
  // 우리는 키를 어디에도 보내지 않는다(복사만)
  const KEYS_KEY = 'crack-pc-base:keys:v1';
  const keyList = () => { const a = readJSON(KEYS_KEY); return Array.isArray(a) ? a.filter((k) => isObj(k) && typeof k.v === 'string' && k.id) : []; };
  const keySave = (a) => writeJSON(KEYS_KEY, a);
  const keyShown = new Set(); // 창을 연 동안만 보이게 한 키(닫으면 다시 가린다)
  // 이름을 안 적었을 때만: 앞글자로 어디 키인지 짐작
  const KEY_GUESS = [[/^sk-ant-/, 'Claude'], [/^sk-or-/, 'OpenRouter'], [/^sk-/, 'OpenAI'], [/^AIza/, 'Gemini'], [/^xai-/, 'Grok'], [/^gsk_/, 'Groq'], [/^hf_/, 'Hugging Face']];
  // 같은 회사 키가 이미 있으면 'Gemini API 2'처럼 번호를 붙인다
  const keyGuess = (v, list) => {
    const g = (KEY_GUESS.find(([re]) => re.test(v)) || [0, ''])[1];
    if (!g) return '';
    const base = g + ' API', names = new Set(list.map((k) => k.name));
    let n = 1, name = base;
    while (names.has(name)) name = base + ' ' + ++n;
    return name;
  };
  const keyMask = (v) => (v.length <= 12 ? '•'.repeat(v.length) : v.slice(0, 4) + '•'.repeat(Math.min(14, v.length - 8)) + v.slice(-4));
  function stKeyRowHtml(k) {
    const on = keyShown.has(k.id), id = stEsc(k.id);
    return '<div class="row key" data-krow="' + id + '"><div class="rt"><span><button type="button" class="kname" data-kact="rename" data-kid="' + id + '" title="눌러서 이름 바꾸기">' + stEsc(k.name) + '</button></span><small class="kv' + (on ? ' on' : '') + '">' + stEsc(on ? k.v : keyMask(k.v)) + '</small></div>'
      + '<button type="button" class="icon-btn" data-kact="eye" data-kid="' + id + '" title="' + (on ? '가리기' : '보기') + '" aria-label="' + (on ? '가리기' : '보기') + '">' + sic(on ? 'eyeoff' : 'eye', 16) + '</button>'
      + '<button type="button" class="btn kcopy" data-kact="copy" data-kid="' + id + '"><span class="i1">' + sic('copy', 14) + '</span><span class="i2">' + sic('ok', 14, 2.2) + '</span><span class="kt">복사</span></button>'
      + '<button type="button" class="icon-btn kdel" data-kact="del" data-kid="' + id + '" title="지우기" aria-label="지우기">' + sic('trash', 15) + '</button></div>';
  }
  function stKeysHtml() {
    const list = keyList();
    return '<div class="card"><div>' + (list.length ? list.map(stKeyRowHtml).join('') : '<div class="empty kempty">아직 저장한 키가 없어요</div>') + '</div></div>'
      + '<div class="label">새 키 넣기</div><div class="card"><div class="kadd">'
      + '<input type="text" data-kname placeholder="이름 (예: Gemini API)" maxlength="40" autocomplete="off" spellcheck="false" aria-label="키 이름">'
      + '<input type="text" data-kval placeholder="키 붙여넣기" autocomplete="off" spellcheck="false" aria-label="키">'
      + '<button type="button" class="btn pri" data-kact="add">' + sic('plus', 14, 2) + '저장</button></div></div>'
      + '<p class="knote">이름을 비우면 키 앞글자를 보고 ‘Gemini API’ · ‘OpenAI API’ · ‘Claude API’처럼 붙여요.<br>키는 이 브라우저의 크랙 사이트 저장소에만 있고, 어디로도 보내지 않아요. 설정 내보내기 파일에도 들어가지 않아요.<br>'
      + '다만 같은 사이트에서 도는 다른 확장은 읽을 수 있으니, 믿는 확장만 쓰는 브라우저에서 쓰세요.</p>';
  }
  async function keyCopy(v) {
    try { await navigator.clipboard.writeText(v); return true; } catch (_) { /* 아래 방법으로 */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = v; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }
  function stKeyAct(act, id, btn) {
    const w = setUI.el, list = keyList(), k = list.find((x) => x.id === id);
    if (act === 'add') {
      const ni = w.querySelector('[data-kname]'), vi = w.querySelector('[data-kval]');
      const v = vi.value.replace(/\s+/g, '');
      if (!v) { vi.focus(); toast('키를 붙여넣어 주세요', { key: 'keys' }); return; }
      if (list.some((x) => x.v === v)) { toast('이미 저장한 키예요', { key: 'keys' }); return; }
      list.push({ id: 'k' + Date.now().toString(36), name: ni.value.trim() || keyGuess(v, list) || 'API 키 ' + (list.length + 1), v, at: Date.now() });
      keySave(list);
      stRender();
      toast('키를 저장했어요', { icon: 'ok', key: 'keys' });
      return;
    }
    if (!k) return;
    if (act === 'copy') {
      keyCopy(k.v).then((ok) => {
        if (ok && btn.isConnected) {
          btn.classList.add('done'); btn.querySelector('.kt').textContent = '복사됨';
          clearTimeout(btn._t); btn._t = setTimeout(() => { btn.classList.remove('done'); btn.querySelector('.kt').textContent = '복사'; }, 1600);
        }
        toast(ok ? "'" + k.name + "' 키를 복사했어요" : '복사가 막혔어요 · 눈 버튼으로 보이게 한 뒤 직접 골라 복사해 주세요', { icon: ok ? 'ok' : 'err', key: 'keys' });
      });
      return;
    }
    if (act === 'rename') {
      // 이름 자리에 입력칸: Enter·바깥 누르기 = 저장, Esc = 그대로
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'kren'; inp.value = k.name; inp.maxLength = 40; inp.spellcheck = false;
      inp.setAttribute('aria-label', '키 이름');
      btn.replaceWith(inp);
      inp.focus(); inp.select();
      let done = false;
      const finish = (save) => {
        if (done) return;
        done = true;
        const name = inp.value.trim();
        if (save && name && name !== k.name) { const a = keyList(), x = a.find((y) => y.id === id); if (x) { x.name = name; keySave(a); k.name = name; } }
        const row = inp.closest('[data-krow]');
        if (row) row.outerHTML = stKeyRowHtml(k);
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
      inp.addEventListener('blur', () => finish(true));
      return;
    }
    if (act === 'eye') {
      if (keyShown.has(id)) keyShown.delete(id); else keyShown.add(id);
      const row = btn.closest('[data-krow]');
      if (row) row.outerHTML = stKeyRowHtml(k); // 그 줄만 다시(페이지 움직임 없이)
      return;
    }
    if (act === 'del') {
      const i = list.indexOf(k);
      list.splice(i, 1);
      keySave(list);
      keyShown.delete(id);
      stRender();
      toast("'" + k.name + "' 키를 지웠어요 · 눌러서 되돌리기", { key: 'keys', duration: 6000, onClick: () => {
        const a = keyList();
        if (a.some((x) => x.id === k.id)) return;
        a.splice(Math.min(i, a.length), 0, k);
        keySave(a);
        if (setUI.open && setUI.cur === 'keys' && !setUI.q && !setUI.only) stRender();
      } });
    }
  }
  function stAct(act) {
    if (act === 'ls') { stClose(); lsOpen(); return; }
    if (act === 'ov') { stClose(); ovOpen(); return; }
    if (act === 'bm') { stClose(); bmOpen('story'); return; }
    if (act === 'wrap') { stClose(); wrapOpenWin(); return; }
    if (act === 'export') return stExport();
    if (act === 'import') return stImport();
    if (act === 'factory') return stFactory();
    if (act === 'mstats') {
      toast('한 번 더 누르면 이 방 모델 통계를 비워요', { key: 'mstats', duration: 5000, action: '비우기', onClick: () => {
        const s = mstatsRead(); delete s.rooms[roomId()]; writeJSON(MSTATS_KEY, s); statsSoon(0); toast('이 방 모델 통계를 비웠어요', { key: 'mstats' });
      } });
    }
  }

  function stBuild() {
    const w = document.createElement('div');
    w.id = 'cpb-set';
    w.setAttribute('aria-label', '설정');
    w.innerHTML = '<div class="win" role="document">'
      + '<aside class="side"><h2>설정</h2><label class="search">' + sic('search', 15, 1.9) + '<input type="text" data-q placeholder="찾기" autocomplete="off" spellcheck="false" aria-label="설정 찾기"><kbd>/</kbd></label>'
      + '<nav class="nav"><div class="pill"></div>' + ST_CATS.map((c) => (c.gap ? '<div class="gap"></div>' : '') + '<button type="button" data-cat="' + c.id + '">' + sic(c.icon) + '<span class="nm">' + c.name + '</span></button>').join('') + '</nav>'
      + '<div class="foot" data-foot></div></aside>'
      + '<section class="main"><header class="head"><div class="grow"><h1 data-title></h1><p data-desc></p></div>'
      + '<svg class="map none" viewBox="0 0 112 68" aria-hidden="true">' + ST_MAP + ST_FX + '</svg>'
      + '<button type="button" class="icon-btn" data-close aria-label="닫기">' + sic('x', 16, 2) + '</button></header><div class="body" data-body></div></section></div>';
    const hud = document.createElement('div');
    hud.id = 'cpb-st-hud';
    hud.innerHTML = '<svg class="spot" width="100%" height="100%" aria-hidden="true"><defs><mask id="cpb-st-mask"><rect width="100%" height="100%" fill="#fff"/><g data-holes></g></mask></defs>'
      + '<rect width="100%" height="100%" fill="rgba(10,10,12,.62)" mask="url(#cpb-st-mask)"/><g data-rings></g></svg><div class="tip" data-tip role="tooltip"></div>';
    const q = w.querySelector('[data-q]');
    let comp = false;
    q.addEventListener('compositionstart', () => { comp = true; });
    q.addEventListener('compositionend', () => { comp = false; setUI.q = q.value.trim(); setUI.only = false; stRender(); });
    q.addEventListener('input', () => { if (comp) return; setUI.q = q.value.trim(); setUI.only = false; stRender(); });
    // 우리 창의 키는 크랙 단축키로 새지 않게(가짜 키 이벤트는 만들지 않는다)
    for (const ty of ['keydown', 'keyup', 'keypress']) w.addEventListener(ty, (e) => {
      e.stopPropagation();
      if (ty !== 'keydown') return;
      if (setUI.peek) stPeekEnd();
      if (e.key === 'Escape') { if (setUI.q || setUI.only) { setUI.q = ''; q.value = ''; setUI.only = false; stRender(); } else stClose(); return; }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-kname],[data-kval]')) { e.preventDefault(); stKeyAct('add'); return; }
      // '/' = 찾기 칸으로. 다른 입력칸(API 키 이름 등)에 글을 쓰는 중이면 그대로 둔다
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); q.focus(); }
    });
    const onClick = (e) => {
      const t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.hasAttribute('data-close')) return stClose();
      if (t.dataset.cat) { if (setUI.cur === t.dataset.cat && !setUI.q && !setUI.only) return; setUI.cur = t.dataset.cat; setUI.q = ''; q.value = ''; setUI.only = false; stRender(); return; }
      if (t.hasAttribute('data-only')) { setUI.only = true; setUI.q = ''; q.value = ''; stRender(); return; }
      if (t.hasAttribute('data-all-reset')) {
        const prev = clone(conf);
        for (const k of stAllKeys()) if (stMod(k)) stSet(k, stDef(k));
        toast('바꾼 설정을 모두 기본값으로 돌렸어요 · 눌러서 되돌리기', { icon: 'ok', key: 'st', duration: 6000, onClick: () => { conf = prev; writeJSON(SETTINGS_KEY, conf); settingsChanged('*'); } });
        return;
      }
      if (t.dataset.reset) {
        t.classList.add('spin'); setTimeout(() => t.classList.remove('spin'), 520);
        for (const k of t.dataset.reset.split(',')) { if (!stMod(k)) continue; if (stItems[k] && stItems[k].t === 'stepper') { const d = stDef(k) > stGet(k) ? 1 : -1; while (stGet(k) !== stDef(k)) { const b = stGet(k); stStep(k, d); if (stGet(k) === b) break; } } else stSet(k, stDef(k)); }
        return;
      }
      if (t.dataset.kact) { stKeyAct(t.dataset.kact, t.dataset.kid, t); return; }
      if (t.dataset.step) { stStep(t.dataset.step, Number(t.dataset.d)); return; }
      if (t.dataset.grp) {
        // 라디오존데 회사 묶음: 다 켜져 있으면 다 끄고, 아니면 다 켠다(저장은 한 번)
        const ks = t.dataset.grp.split(','), on = !ks.every((k) => stGet(k)), h = radHidden();
        for (const k of ks) { if (on) h.delete(k.slice(8)); else h.add(k.slice(8)); }
        settings.set('radio.hidden', [...h]);
        return;
      }
      if (t.dataset.k) { stSet(t.dataset.k, !stGet(t.dataset.k)); return; }
      if (t.dataset.act) stAct(t.dataset.act);
    };
    w.addEventListener('click', onClick);
    hud.addEventListener('click', onClick);
    const body = w.querySelector('[data-body]');
    body.addEventListener('mouseover', (e) => stMapFor(e.target));
    body.addEventListener('focusin', (e) => stMapFor(e.target));
    body.addEventListener('mouseleave', () => stMapFor(null));
    body.addEventListener('scroll', () => { if (setUI.peek) stPeekEnd(); }, { passive: true });
    // 잠깐(0.4초) 머물러야 엿보기가 시작된다: 그냥 지나가는 마우스엔 반응하지 않게
    const CTRL = '.sw[data-k], .step button[data-step]'; // 칩은 엿보지 않는다: 여러 개를 고를 때 거슬린다
    w.addEventListener('pointerover', (e) => {
      const c = e.target.closest && e.target.closest(CTRL);
      if (!c || setUI.peek) return;
      clearTimeout(setUI.hoverT);
      setUI.hoverT = setTimeout(() => { if (c.isConnected && c.matches(':hover')) stPeekStart(c); }, 400);
    });
    w.addEventListener('pointerout', (e) => { const c = e.target.closest && e.target.closest(CTRL); if (c && !c.contains(e.relatedTarget)) clearTimeout(setUI.hoverT); });
    // '?'에 마우스를 올리면 유리 말풍선
    const tip = hud.querySelector('[data-tip]');
    w.addEventListener('pointerover', (e) => {
      const h = e.target.closest && e.target.closest('[data-help]');
      if (!h) return;
      const [ttl, txt] = ST_HELP[h.dataset.help];
      tip.innerHTML = '<b>' + stEsc(ttl) + '</b>' + stEsc(txt);
      const r = h.getBoundingClientRect(), tw = Math.min(260, tip.offsetWidth || 260);
      tip.style.left = Math.max(12, Math.min(innerWidth - tw - 12, r.left + r.width / 2 - tw / 2)) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      if (r.bottom + 8 + tip.offsetHeight > innerHeight - 12) tip.style.top = (r.top - tip.offsetHeight - 8) + 'px';
      tip.classList.add('on');
    });
    w.addEventListener('pointerout', (e) => { if (e.target.closest && e.target.closest('[data-help]')) tip.classList.remove('on'); });
    stDragInit(w);
    setUI.hud = hud;
    return w;
  }
  // 창 옮기기: 제목줄(오른쪽 머리줄·왼쪽 '설정' 글자, 버튼 말고)을 끌면 따라온다. 자리는 가운데에서 떨어진 거리로 기억하고
  // 열 때마다 화면 안으로 맞춘다. 두 번 누르면 가운데로. 이동은 CSS translate 속성만 써서 여닫는 움직임(transform)과 겹치지 않는다
  const ST_POS_KEY = 'crack-pc-base:set-pos';
  function stPlace(p) {
    const win = setUI.el && setUI.el.querySelector('.win');
    if (!win) return null;
    if (!p) { win.style.translate = ''; return null; }
    const mx = Math.max(0, (innerWidth - win.offsetWidth) / 2 - 8), my = Math.max(0, (innerHeight - win.offsetHeight) / 2 - 8);
    const x = Math.round(Math.max(-mx, Math.min(mx, p.x))), y = Math.round(Math.max(-my, Math.min(my, p.y)));
    win.style.translate = x + 'px ' + y + 'px';
    return { x, y };
  }
  function stDragInit(w) {
    const HANDLE = '.head, .side h2';
    w.addEventListener('pointerdown', (e) => {
      const hd = e.target.closest && e.target.closest(HANDLE);
      if (!hd || e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      const t = (w.querySelector('.win').style.translate || '').split(' ').map(parseFloat);
      const cur = { x: t[0] || 0, y: t[1] || 0 }, sx = e.clientX, sy = e.clientY;
      let raf = 0, last = null;
      flag(w, 'data-drag', true);
      hd.setPointerCapture(e.pointerId);
      const mv = (ev) => { last = { x: cur.x + ev.clientX - sx, y: cur.y + ev.clientY - sy }; if (!raf) raf = requestAnimationFrame(() => { raf = 0; stPlace(last); }); };
      const up = () => {
        hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
        cancelAnimationFrame(raf); raf = 0;
        flag(w, 'data-drag', false);
        if (last) writeJSON(ST_POS_KEY, stPlace(last));
      };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
    w.addEventListener('dblclick', (e) => {
      if (!(e.target.closest && e.target.closest(HANDLE)) || e.target.closest('button')) return;
      stPlace(null); writeJSON(ST_POS_KEY, null);
    });
  }
  // 스크롤·키·띄운 것 밖 클릭이면 엿보기를 바로 끝낸다
  function stGlobalDown(e) { clearTimeout(setUI.hoverT); if (setUI.peek && !(setUI.peek.clone && setUI.peek.clone.contains(e.target))) stPeekEnd(); }
  function stGlobalWheel() { if (setUI.peek) stPeekEnd(); }
  function stOpen(cat) {
    if (!setUI.el) setUI.el = stBuild();
    if (!setUI.el.isConnected) { document.body.appendChild(setUI.el); document.body.appendChild(setUI.hud); }
    if (cat) { setUI.cur = cat; setUI.q = ''; setUI.only = false; setUI.el.querySelector('[data-q]').value = ''; }
    setUI.open = true;
    delAttr(setUI.el, 'data-out');
    stPlace(readJSON(ST_POS_KEY));
    stRender();
    addEventListener('pointerdown', stGlobalDown, true);
    addEventListener('wheel', stGlobalWheel, { capture: true, passive: true });
    setBtnState();
    setTimeout(() => { if (setUI.open) setUI.el.querySelector('[data-q]').focus({ preventScroll: true }); }, 60);
  }
  function stClose() {
    if (!setUI.open) return;
    stPeekEnd();
    setUI.open = false;
    keyShown.clear(); // 보이게 해 둔 키는 닫으면 다시 가린다
    removeEventListener('pointerdown', stGlobalDown, true);
    removeEventListener('wheel', stGlobalWheel, { capture: true });
    const w = setUI.el, hud = setUI.hud;
    flag(w, 'data-out', true);
    if (hud) { const tip = hud.querySelector('[data-tip]'); if (tip) tip.classList.remove('on'); }
    setTimeout(() => { if (!setUI.open) { w.remove(); if (hud) hud.remove(); w.querySelector('[data-body]').innerHTML = ''; } }, 220);
    setBtnState();
    if (cmp.el && cmp.el.isConnected) attempt(() => cmp.el.focus({ preventScroll: true }));
  }
  on('settings', () => { if (setUI.open) stSync(); });
  on('models', () => { if (setUI.open && !setUI.peek) stRender(); });
  on('route', () => { if (!page) stClose(); });

  // ── 진입 버튼: 입력창 도구 줄, 크랙 ✳ 버튼 바로 뒤. 크랙 버튼의 클래스를 그대로 빌려 크기·테두리·색·호버가 똑같다 ──
  // 찾는 기준(넓게 잡지 않음): 크랙 ✳ 아이콘 path(d가 'm12.8 10.62'로 시작)를 품은 button, 그 부모가 '.flex.items-center.gap-2',
  // 조부모가 '.flex.items-center.justify-between'. 다른 확장이 같은 줄에 끼워 넣는 버튼과 헷갈리지 않는다
  // 톱니 8개(45°마다 같은 모양): 올리면 한 칸(45°) 돌고, 열려 있으면 두 칸 돌아 멈춘 채 가운데가 찬다
  const SET_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g class="gear">'
    + '<path class="cog" d="M10.2 5.03L10.5 2.52A9.6 9.6 0 0 1 13.5 2.52L13.8 5.03A7.2 7.2 0 0 1 15.65 5.8L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L18.2 8.35A7.2 7.2 0 0 1 18.97 10.2'
    + 'L21.48 10.5A9.6 9.6 0 0 1 21.48 13.5L18.97 13.8A7.2 7.2 0 0 1 18.2 15.65L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.65 18.2A7.2 7.2 0 0 1 13.8 18.97L13.5 21.48'
    + 'A9.6 9.6 0 0 1 10.5 21.48L10.2 18.97A7.2 7.2 0 0 1 8.35 18.2L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L5.8 15.65A7.2 7.2 0 0 1 5.03 13.8L2.52 13.5A9.6 9.6 0 0 1 2.52 10.5'
    + 'L5.03 10.2A7.2 7.2 0 0 1 5.8 8.35L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.35 5.8A7.2 7.2 0 0 1 10.2 5.03Z"/>'
    + '<circle class="hub" cx="12" cy="12" r="2.9"/></g></svg>';
  let setBtn = null;
  function setAnchor() {
    const box = cmp.box;
    const scope = box && box.parentElement ? box.parentElement : document;
    const p = scope.querySelector('button > svg > path[d^="m12.8 10.62"]');
    const b = p && p.closest('button');
    const row = b && b.parentElement;
    if (!row || !row.matches('.flex.items-center.gap-2') || !row.parentElement || !row.parentElement.matches('.flex.items-center.justify-between')) return null;
    return b;
  }
  function setBtnState() { if (setBtn) setAttr(setBtn, 'aria-expanded', String(!!setUI.open)); }
  function setBtnEnsure() {
    if (!page) { if (setBtn && setBtn.isConnected) setBtn.remove(); return; }
    if (setBtn && setBtn.isConnected && setBtn.previousElementSibling && setBtn.previousElementSibling.querySelector('path[d^="m12.8 10.62"]')) return;
    const a = setAnchor();
    if (!a) return;
    if (!setBtn) {
      setBtn = document.createElement('button');
      setBtn.type = 'button';
      setBtn.setAttribute('aria-label', '설정');
      setBtn.title = '설정';
      setBtn.innerHTML = SET_SVG;
      setBtn.addEventListener('mousedown', (e) => e.preventDefault()); // 입력창 포커스 유지
      setBtn.addEventListener('click', (e) => { e.stopPropagation(); if (setUI.open) stClose(); else stOpen(); });
    }
    const cls = a.className.replace(/\bcpb-[\w-]+/g, '').trim() + ' cpb-setbtn';
    if (setBtn.className !== cls) setBtn.className = cls;
    a.insertAdjacentElement('afterend', setBtn);
    setBtnState();
  }
  on('composer', () => setBtnEnsure());
  // 안전망: 자리를 못 찾으면 1.5초마다 다시 보되, 경로마다 40번(1분)까지만. 그 뒤는 입력창이 새로 붙을 때('composer')만
  let setMiss = 0;
  on('route', () => { setMiss = 0; setTimeout(setBtnEnsure, 300); });
  setInterval(() => { if (page && !(setBtn && setBtn.isConnected) && setMiss++ < 40) setBtnEnsure(); }, 1500);

  const SET_CSS = `
.cpb-setbtn svg{overflow:visible;fill:none!important;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transition:transform .5s linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1)}
.cpb-setbtn .gear{transform-box:view-box;transform-origin:12px 12px;transform:rotate(var(--r,0deg));transition:transform .75s linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1),filter .3s;animation:cpbSetIn .8s cubic-bezier(.23,1,.32,1) backwards}
@keyframes cpbSetIn{from{opacity:0;transform:rotate(-90deg) scale(.6)}}
.cpb-setbtn .hub{fill:currentColor!important;fill-opacity:var(--hf,0);transform-box:view-box;transform-origin:12px 12px;transform:scale(var(--hs,1));transition:transform .45s linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1),fill-opacity .3s}
.cpb-setbtn:hover .gear{--r:45deg}
.cpb-setbtn:hover .hub{--hs:.72}
.cpb-setbtn:active svg{transform:scale(.86);transition:transform .12s cubic-bezier(.23,1,.32,1)}
.cpb-setbtn:active .gear{--r:60deg}
.cpb-setbtn[aria-expanded="true"]{color:var(--surface_brand_primary,#ff4432)}
.cpb-setbtn[aria-expanded="true"] .gear{--r:90deg;filter:drop-shadow(0 0 2px currentColor)}
.cpb-setbtn[aria-expanded="true"] .hub{--hf:1;--hs:.62}
.cpb-setbtn[aria-expanded="true"]:hover .gear{--r:135deg}
@media (prefers-reduced-motion: reduce){.cpb-setbtn *,.cpb-setbtn svg{animation:none!important;transition:none!important}}

#cpb-set{--st-win:#1e1e21;--st-card:#242428;--st-line:rgba(255,255,255,.06);--st-line2:rgba(255,255,255,.11);--st-tx:#edece9;--st-tx2:#a9a8a3;--st-tx3:#73726e;--st-hover:rgba(255,255,255,.045);--st-sel:rgba(255,255,255,.075);
  --st-brand:#ff5848;--st-brand-soft:rgba(255,88,72,.14);--st-warn:#e8ad3a;--st-warn-soft:rgba(232,173,58,.13);--st-danger:#ff6767;--st-danger-soft:rgba(255,103,103,.1);--st-sw-off:rgba(255,255,255,.16);
  --st-glass-side:rgba(24,24,27,.34);--st-glass-main:rgba(30,30,33,.62);--st-glass-line:rgba(255,255,255,.1);--st-glass-hi:rgba(255,255,255,.12);
  --st-shadow:0 30px 80px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.3);--ease:cubic-bezier(.23,1,.32,1);--spring:linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1)}
body[data-theme=light] #cpb-set{--st-win:#fff;--st-card:#fff;--st-line:rgba(0,0,0,.07);--st-line2:rgba(0,0,0,.12);--st-tx:#1b1a19;--st-tx2:#5f5e59;--st-tx3:#94928c;--st-hover:rgba(0,0,0,.04);--st-sel:rgba(0,0,0,.06);
  --st-brand:#ff4432;--st-brand-soft:rgba(255,68,50,.1);--st-warn:#b8740a;--st-warn-soft:rgba(255,170,0,.13);--st-danger:#e03535;--st-danger-soft:rgba(224,53,53,.08);--st-sw-off:rgba(0,0,0,.14);
  --st-glass-side:rgba(250,249,247,.38);--st-glass-main:rgba(255,255,255,.66);--st-glass-line:rgba(255,255,255,.7);--st-glass-hi:rgba(255,255,255,.9);
  --st-shadow:0 30px 80px rgba(20,18,15,.22),0 2px 6px rgba(20,18,15,.06)}
#cpb-set{position:fixed;inset:0;z-index:2147483000;pointer-events:none;color:var(--st-tx);font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased}
#cpb-set *{box-sizing:border-box}
#cpb-set button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
#cpb-set svg{flex-shrink:0;display:block}
#cpb-set :focus{outline:none}
#cpb-set :focus-visible{outline:1.5px solid color-mix(in srgb,var(--st-brand) 55%,transparent);outline-offset:2px;border-radius:9px}
#cpb-set .win{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(880px,calc(100vw - 32px));height:min(620px,calc(100vh - 80px));display:grid;grid-template-columns:212px 1fr;pointer-events:auto;
  background:var(--st-win);border:1px solid var(--st-glass-line);border-radius:18px;
  box-shadow:inset 0 1px 0 var(--st-glass-hi),var(--st-shadow);overflow:hidden;animation:cpbStIn .32s var(--ease);transition:opacity .22s var(--ease),transform .3s var(--ease),filter .22s var(--ease)}
@keyframes cpbStIn{from{opacity:0;transform:translate(-50%,-50%) scale(.97)}}
#cpb-set[data-out] .win{opacity:0;transform:translate(-50%,-50%) scale(.97)}
#cpb-set[data-pv] .win{opacity:0;transform:translate(-50%,-50%) scale(.94);filter:blur(6px);pointer-events:none}
#cpb-set .head,#cpb-set .side h2{cursor:grab;user-select:none}
#cpb-set[data-drag],#cpb-set[data-drag] *{cursor:grabbing!important}
#cpb-set[data-drag] .win{box-shadow:inset 0 1px 0 var(--st-glass-hi),0 36px 90px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.3)}
#cpb-set .side{position:relative;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--st-line);background:var(--st-glass-side)}
#cpb-set .side h2{margin:0;padding:18px 18px 12px;font-size:15px;font-weight:700;letter-spacing:-.01em;color:var(--st-tx)}
#cpb-set .search{margin:0 10px 8px;display:flex;align-items:center;gap:7px;height:32px;padding:0 9px;border-radius:9px;background:var(--st-sel);color:var(--st-tx3);transition:background .2s var(--ease),box-shadow .2s var(--ease)}
#cpb-set .search:focus-within{background:var(--st-card);box-shadow:0 0 0 1px var(--st-line2),0 2px 8px rgba(0,0,0,.06);color:var(--st-tx2)}
#cpb-set .search input{flex:1;min-width:0;border:0;outline:0;background:none;color:var(--st-tx);font:inherit;padding:0}
#cpb-set .search input::placeholder{color:var(--st-tx3)}
#cpb-set .search kbd{font:inherit;font-size:10.5px;line-height:16px;padding:0 5px;border-radius:4px;background:var(--st-line);color:var(--st-tx3);transition:opacity .15s}
#cpb-set .search:focus-within kbd{opacity:0}
#cpb-set .nav{position:relative;flex:1;min-height:0;overflow-y:auto;padding:2px 10px 10px;scrollbar-width:none}
#cpb-set .pill{position:absolute;left:10px;right:10px;top:0;height:34px;border-radius:9px;background:var(--st-sel);transition:transform .34s var(--ease),opacity .2s;pointer-events:none}
#cpb-set .nav button{position:relative;display:flex;align-items:center;gap:10px;width:100%;height:34px;border:0;background:none;padding:0 10px;border-radius:9px;text-align:left;color:var(--st-tx2);transition:color .2s}
#cpb-set .nav button:hover{color:var(--st-tx)}
#cpb-set .nav button[aria-current="true"]{color:var(--st-tx);font-weight:600}
#cpb-set .nav button svg{width:17px;height:17px;opacity:.7;transition:opacity .25s,color .25s,filter .35s var(--ease)}
#cpb-set .nav button[aria-current="true"] svg{opacity:1}
#cpb-set .nav .nm{flex:1}
#cpb-set .nav button.has{color:var(--st-tx)}
#cpb-set .nav button.has .nm{font-weight:600}
#cpb-set .nav button.has svg{opacity:1;color:var(--st-brand);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--st-brand) 55%,transparent))}
#cpb-set .nav .gap{height:10px}
#cpb-set .foot{display:flex;align-items:center;gap:4px;padding:10px 12px 12px 18px;font-size:11.5px;color:var(--st-tx3);border-top:1px solid var(--st-line);min-height:42px}
#cpb-set .grow{flex:1;min-width:0}
#cpb-set .link{border:0;background:none;padding:3px 6px;border-radius:6px;color:var(--st-tx2);font-size:11.5px;transition:background .15s,color .15s,transform .16s var(--ease)}
#cpb-set .link:hover{background:var(--st-hover);color:var(--st-tx)}
#cpb-set .link:active{transform:scale(.96)}
#cpb-set .main{position:relative;display:flex;flex-direction:column;min-height:0;background:var(--st-glass-main)}
#cpb-set .main::before{content:"";position:absolute;inset:0 0 auto 0;height:220px;pointer-events:none;background:radial-gradient(60% 100% at 85% 0%,color-mix(in srgb,var(--st-brand) 9%,transparent),transparent 70%)}
#cpb-set .main>*{position:relative}
#cpb-set .head{display:flex;align-items:flex-start;gap:12px;padding:20px 22px 14px 26px}
#cpb-set .head h1{margin:0;font-size:19px;font-weight:700;letter-spacing:-.02em;color:var(--st-tx)}
#cpb-set .head p{margin:3px 0 0;color:var(--st-tx3);font-size:12.5px}
#cpb-set .icon-btn{width:30px;height:30px;border:0;background:none;border-radius:8px;display:grid;place-items:center;color:var(--st-tx3);transition:background .15s,color .15s,transform .16s var(--ease)}
#cpb-set .icon-btn:hover{background:var(--st-hover);color:var(--st-tx)}
#cpb-set .icon-btn:active{transform:scale(.94)}
#cpb-set .body{flex:1;min-height:0;overflow-y:auto;padding:4px 22px 30px 26px;scrollbar-width:thin}
#cpb-set .page{animation:cpbStPage .26s var(--ease)}
@keyframes cpbStPage{from{opacity:0;transform:translateY(6px)}}
#cpb-set .label{font-size:11.5px;font-weight:600;color:var(--st-tx3);margin:22px 2px 8px}
#cpb-set .label:first-child{margin-top:4px}
#cpb-set .empty{padding:70px 0;text-align:center;color:var(--st-tx3)}
#cpb-set .map{width:132px;height:80px;flex-shrink:0;margin:-2px 2px 0 0;border-radius:9px;background:color-mix(in srgb,var(--st-tx) 4%,transparent);box-shadow:inset 0 0 0 1px var(--st-line);transition:opacity .25s var(--ease),transform .25s var(--ease)}
#cpb-set .map.none{opacity:0;transform:scale(.96)}
#cpb-set .map [data-a]{fill:color-mix(in srgb,var(--st-tx) 12%,transparent);transition:fill .3s var(--ease),opacity .3s var(--ease)}
#cpb-set .map [data-a="float"]{opacity:0}
#cpb-set .map .lit{fill:var(--st-brand)}
#cpb-set .map .lit[data-a="float"]{opacity:1}
#cpb-set .map.focus [data-a]:not(.lit){opacity:.5}
#cpb-set .map.focus [data-a="float"]:not(.lit){opacity:0}
#cpb-set .map .fx{opacity:0;transition:opacity .3s var(--ease)}
#cpb-set .map [data-a],#cpb-set .map .fx{transform-box:fill-box}
#cpb-set .map #cpb-st-vp{fill:none;stroke:var(--st-brand);stroke-width:1;rx:2.5}
#cpb-set .map #cpb-st-newmsg{fill:var(--st-brand);transform-origin:top}
#cpb-set .map #cpb-st-caret{fill:var(--st-brand);transform-origin:left}
#cpb-set .map #cpb-st-press{fill:none;stroke:var(--st-brand);stroke-width:1;transform-origin:center}
#cpb-set .map #cpb-st-rowhl{fill:var(--st-brand)}
#cpb-set .map[data-play="lock"] #cpb-st-vp,#cpb-set .map[data-play="lock"] #cpb-st-newmsg,#cpb-set .map[data-play="rs"] #cpb-st-vp{opacity:1}
#cpb-set .map[data-play="lock"] #cpb-st-newmsg{animation:cpbMGrow 2.6s var(--ease) infinite}
#cpb-set .map[data-play="lock"].off #cpb-st-vp{animation:cpbMFollow 2.6s var(--ease) infinite}
#cpb-set .map[data-play="lock"]:not(.off) #cpb-st-vp{animation:cpbMHold 2.6s var(--ease) infinite}
#cpb-set .map[data-play="lock"] [data-a="marks"]{opacity:0}
#cpb-set .map[data-play="fold"] [data-a="old"]{transform-origin:top;animation:cpbMFold 2.8s var(--ease) infinite}
#cpb-set .map[data-play="rs"] [data-a="old"],#cpb-set .map[data-play="rs"] [data-a="last"]{stroke:var(--st-brand);stroke-width:.6;stroke-dasharray:1.6 1.2;animation:cpbMSkip 2.6s var(--ease) infinite}
#cpb-set .map[data-play="edges"] [data-a="top"],#cpb-set .map[data-play="edge-top"] [data-a="top"]{animation:cpbMUp 2.6s var(--ease) infinite}
#cpb-set .map[data-play="edges"] [data-a="bar"],#cpb-set .map[data-play="edge-bar"] [data-a="bar"]{animation:cpbMUp 2.6s var(--ease) infinite .1s}
#cpb-set .map[data-play="edges"] [data-a="left"],#cpb-set .map[data-play="edge-left"] [data-a="left"]{animation:cpbMLeft 2.6s var(--ease) infinite .15s}
#cpb-set .map[data-play="edges"] [data-a="right"],#cpb-set .map[data-play="edge-right"] [data-a="right"],#cpb-set .map[data-play="edge-right"] [data-a="stats"],#cpb-set .map[data-play="edges"] [data-a="stats"]{animation:cpbMRight 2.6s var(--ease) infinite .2s}
#cpb-set .map[data-play="dash"] [data-a="dash"]{transform-origin:left;animation:cpbMPop 2.4s var(--ease) infinite}
#cpb-set .map[data-play="dash"] [data-a="dash"]+[data-a="dash"]{animation-delay:.15s}
#cpb-set .map[data-play="radio"] [data-a="radio"]{animation:cpbMBlink 1.2s ease-in-out infinite}
#cpb-set .map[data-play="marks"] [data-a="marksl"]{transform-origin:left;animation:cpbMPop 2.4s var(--ease) infinite}
#cpb-set .map[data-play="marks"] [data-a="marks"]{transform-origin:right;animation:cpbMPop 2.4s var(--ease) infinite}
#cpb-set .map[data-play="reroll"] #cpb-st-press{opacity:1;animation:cpbMPress 2.4s var(--ease) infinite}
#cpb-set .map[data-play="reroll"] [data-a="last"]{animation:cpbMRegen 2.4s var(--ease) infinite}
#cpb-set .map[data-play="input"] #cpb-st-caret{opacity:1;animation:cpbMType 2.4s steps(8) infinite}
#cpb-set .map[data-play="float"] [data-a="float"]{transform-origin:center;animation:cpbMFloat 2.6s var(--ease) infinite}
#cpb-set .map[data-play="left"] #cpb-st-rowhl{opacity:1;animation:cpbMRows 2.4s var(--ease) infinite}
#cpb-set .map[data-play="notify"] [data-a="notify"],#cpb-set .map[data-play="toast"] [data-a="toast"],#cpb-set .map[data-play="stats"] [data-a="stats"],#cpb-set .map[data-play="bar"] [data-a="bar"]{animation:cpbMBlink 1.4s ease-in-out infinite}
@keyframes cpbMGrow{0%,20%{transform:scaleY(0)}60%,100%{transform:scaleY(1)}}
@keyframes cpbMFollow{0%,30%{transform:none}65%,100%{transform:translateY(12px)}}
@keyframes cpbMHold{0%,40%{transform:none}52%{transform:translateY(1.2px)}62%,100%{transform:none}}
@keyframes cpbMFold{0%,25%{transform:none;opacity:1}55%,80%{transform:scaleY(.15);opacity:.1}100%{transform:none;opacity:1}}
@keyframes cpbMSkip{0%,25%{fill-opacity:1}50%,80%{fill-opacity:0}100%{fill-opacity:1}}
@keyframes cpbMUp{0%,20%{transform:none;opacity:1}40%,70%{transform:translateY(-4px);opacity:0}90%,100%{transform:none;opacity:1}}
@keyframes cpbMLeft{0%,20%{transform:none;opacity:1}40%,70%{transform:translateX(-8px);opacity:0}90%,100%{transform:none;opacity:1}}
@keyframes cpbMRight{0%,20%{transform:none;opacity:1}40%,70%{transform:translateX(8px);opacity:0}90%,100%{transform:none;opacity:1}}
@keyframes cpbMPop{0%,15%{transform:scaleX(0)}45%,100%{transform:scaleX(1)}}
@keyframes cpbMBlink{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes cpbMPress{0%,10%{transform:scale(.2);opacity:1}45%,100%{transform:scale(2.4);opacity:0}}
@keyframes cpbMRegen{0%,30%{opacity:1}45%{opacity:.25}70%,100%{opacity:1}}
@keyframes cpbMType{0%{transform:scaleX(0)}80%,100%{transform:scaleX(1)}}
@keyframes cpbMFloat{0%,15%{transform:scale(.85);opacity:0}40%,80%{transform:none;opacity:1}100%{transform:scale(.95);opacity:0}}
@keyframes cpbMRows{0%,25%{transform:none}35%,60%{transform:translateY(6px)}70%,100%{transform:translateY(12px)}}
#cpb-set .hero{display:flex;align-items:center;gap:20px;padding:18px 20px;margin-bottom:6px;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--st-brand) 10%,var(--st-card)),var(--st-card) 60%);box-shadow:0 0 0 1px var(--st-line),inset 0 1px 0 color-mix(in srgb,#fff 6%,transparent)}
#cpb-set .hero svg{width:176px;height:107px;flex-shrink:0;border-radius:10px;background:color-mix(in srgb,var(--st-tx) 4%,transparent);box-shadow:inset 0 0 0 1px var(--st-line)}
#cpb-set .hero svg [data-a]{fill:color-mix(in srgb,var(--st-tx) 12%,transparent);animation:cpbHero 5s var(--ease) infinite;animation-delay:calc(var(--i) * .18s)}
#cpb-set .hero svg [data-a="float"]{display:none}
@keyframes cpbHero{0%,12%,100%{fill:color-mix(in srgb,var(--st-tx) 12%,transparent)}6%{fill:color-mix(in srgb,var(--st-brand) 85%,transparent)}}
#cpb-set .hero h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--st-tx)}
#cpb-set .hero p{margin:4px 0 0;color:var(--st-tx2);font-size:12.5px}
#cpb-set .hero .meta{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
#cpb-set .hero .meta span{font-size:11.5px;padding:3px 9px;border-radius:999px;background:var(--st-sel);color:var(--st-tx2)}
#cpb-set .hero .meta b{color:var(--st-tx);font-weight:600}
#cpb-set .card{position:relative;border-radius:12px;background:color-mix(in srgb,var(--st-card) 82%,transparent);margin-bottom:10px;box-shadow:0 0 0 1px var(--st-line),inset 0 1px 0 color-mix(in srgb,#fff 5%,transparent);transition:box-shadow .25s var(--ease)}
#cpb-set .card:hover{box-shadow:0 0 0 1px var(--st-line2),inset 0 1px 0 color-mix(in srgb,#fff 7%,transparent),0 6px 22px rgba(0,0,0,.08)}
#cpb-set .card .ch{position:relative;display:flex;align-items:center;gap:14px;padding:14px 16px;min-height:56px}
#cpb-set .card .ct{flex:1;min-width:0}
#cpb-set .card .ct b{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px}
#cpb-set .card .ct p{margin:2px 0 0;color:var(--st-tx3);font-size:12px}
#cpb-set .tile{width:22px;height:22px;flex-shrink:0;display:grid;place-items:center;color:var(--st-tx2);transition:color .3s,opacity .3s}
#cpb-set .card.off .tile{color:var(--st-tx3);opacity:.6}
#cpb-set .card:hover .tile{color:var(--st-tx)}
#cpb-set .tile svg,#cpb-set .tile svg *{transform-box:fill-box}
#cpb-set .tile svg *{transform-origin:center}
#cpb-set .tile svg{transition:transform .5s var(--ease)}
#cpb-set .card:hover .tile[data-ico="bell"] svg,#cpb-set .card:hover .tile[data-ico="bellcheck"] svg{transform-origin:50% 12%;animation:cpbIcWobble .5s ease-in-out}
#cpb-set .card:hover .tile[data-ico="reroll"] svg{transform:rotate(180deg);transition:transform .7s var(--spring)}
#cpb-set .card:hover .tile[data-ico="eyeoff"] svg path:first-child,#cpb-set .card:hover .tile[data-ico="pulse"] svg path{stroke-dasharray:1;animation:cpbIcDraw .55s var(--ease)}
#cpb-set .card:hover .tile[data-ico="fold"] svg path:nth-child(n+2){animation:cpbIcDrop .5s var(--ease)}
#cpb-set .card:hover .tile[data-ico="lockscroll"] svg path:nth-child(2){animation:cpbIcBump .55s var(--ease)}
#cpb-set .card:hover .tile[data-ico="dash"] svg rect{transform-origin:left;animation:cpbIcGrowX .4s var(--ease) backwards}
#cpb-set .card:hover .tile[data-ico="dash"] svg rect:nth-child(2){animation-delay:.08s}
#cpb-set .card:hover .tile[data-ico="dots"] svg circle{animation:cpbIcHop .4s var(--ease)}
#cpb-set .card:hover .tile[data-ico="dots"] svg circle:nth-child(2){animation-delay:.07s}
#cpb-set .card:hover .tile[data-ico="dots"] svg circle:nth-child(3){animation-delay:.14s}
#cpb-set .card:hover .tile[data-ico="chart"] svg path{transform-origin:bottom;animation:cpbIcRise .45s var(--ease)}
#cpb-set .card:hover .tile[data-ico="grid"] svg rect,#cpb-set .card:hover .tile[data-ico="branch"] svg circle{animation:cpbIcPop .35s var(--spring) backwards}
#cpb-set .card:hover .tile[data-ico="grid"] svg rect:nth-child(2),#cpb-set .card:hover .tile[data-ico="branch"] svg circle:nth-child(2){animation-delay:.06s}
#cpb-set .card:hover .tile[data-ico="grid"] svg rect:nth-child(3),#cpb-set .card:hover .tile[data-ico="branch"] svg circle:nth-child(3){animation-delay:.12s}
#cpb-set .card:hover .tile[data-ico="grid"] svg rect:nth-child(4){animation-delay:.18s}
#cpb-set .card:hover .tile[data-ico="merge"] svg path:nth-child(2),#cpb-set .card:hover .tile[data-ico="list"] svg path{animation:cpbIcNudgeX .45s var(--ease)}
#cpb-set .card:hover .tile[data-ico="lines"] svg circle,#cpb-set .card:hover .tile[data-ico="lines"] svg path:last-child{animation:cpbIcPeek .5s var(--ease)}
#cpb-set .card:hover .tile[data-ico="frame"] svg path{animation:cpbIcRiseY .45s var(--ease)}
#cpb-set .card:hover .tile[data-ico="tag"] svg{transform-origin:25% 25%;animation:cpbIcWobble .5s ease-in-out}
#cpb-set .card:hover .tile[data-ico="monitor"] svg rect,#cpb-set .card:hover .tile[data-ico="quote"] svg path,#cpb-set .card:hover .tile[data-ico="keyboard"] svg rect{animation:cpbIcPress .4s var(--ease)}
@keyframes cpbIcWobble{0%,100%{transform:rotate(0)}20%{transform:rotate(-10deg)}45%{transform:rotate(10deg)}70%{transform:rotate(-6deg)}}
@keyframes cpbIcDraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes cpbIcDrop{0%,100%{transform:none}45%{transform:translateY(2.5px)}}
@keyframes cpbIcBump{0%,100%{transform:none}40%{transform:translateY(2px)}60%{transform:translateY(-.6px)}}
@keyframes cpbIcGrowX{from{transform:scaleX(.2)}}
@keyframes cpbIcHop{0%,100%{transform:none}45%{transform:translateY(-2.5px)}}
@keyframes cpbIcRise{from{transform:scaleY(.35)}}
@keyframes cpbIcPop{from{transform:scale(.4);opacity:0}}
@keyframes cpbIcNudgeX{0%,100%{transform:none}45%{transform:translateX(2px)}}
@keyframes cpbIcPeek{0%,100%{transform:none}45%{transform:translate(-1.5px,-1.5px)}}
@keyframes cpbIcRiseY{from{transform:translateY(3px);opacity:.3}}
@keyframes cpbIcPress{0%,100%{transform:none}40%{transform:scale(.9)}}
#cpb-set .hint{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .26s var(--ease),opacity .2s}
#cpb-set .hint>span{overflow:hidden;font-size:11.5px;color:var(--st-tx3)}
#cpb-set .card.off .hint{grid-template-rows:1fr;opacity:1}
#cpb-set .card.off .hint>span{padding-top:4px}
#cpb-set .cbw{display:grid;grid-template-rows:1fr;transition:grid-template-rows .3s var(--ease)}
#cpb-set .card.off .cbw{grid-template-rows:0fr}
#cpb-set .cb{min-height:0;overflow:hidden}
#cpb-set .cb>div{border-top:1px solid var(--st-line)}
#cpb-set .from{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:var(--st-tx3);margin:20px 2px 8px}
#cpb-set .from:first-child{margin-top:4px}
#cpb-set .from svg{width:13px;height:13px}
#cpb-set .badge{font-size:10.5px;font-weight:600;padding:0 6px;border-radius:5px;line-height:17px}
#cpb-set .badge.warn{background:var(--st-warn-soft);color:var(--st-warn)}
#cpb-set .badge.soon{background:var(--st-sel);color:var(--st-tx3)}
#cpb-set mark{background:color-mix(in srgb,#ffd54a 50%,transparent);color:inherit;border-radius:3px}
#cpb-set .row{position:relative;display:flex;align-items:center;gap:10px;min-height:46px;padding:9px 16px}
#cpb-set .row+.row{box-shadow:inset 16px 1px 0 -15.5px var(--st-line)}
#cpb-set .row .rt{flex:1;min-width:0}
#cpb-set .row .rt span{display:flex;align-items:center;gap:6px}
#cpb-set .row .rt small{display:block;color:var(--st-tx3);font-size:11.5px;margin-top:1px}
#cpb-set .row.block{display:block}
#cpb-set .row.block .rt{margin-bottom:10px}
#cpb-set .rth{display:flex;align-items:flex-start;gap:8px}
#cpb-set .rtg{flex:1}
#cpb-set em{font-style:normal}
#cpb-set .row .lb{color:var(--st-tx2);transition:color .2s}
#cpb-set .row.mod .lb{color:var(--st-tx);font-weight:600}
#cpb-set .dv{font-size:11px;font-weight:400;color:var(--st-tx3);opacity:0;transform:translateX(-4px);transition:opacity .22s,transform .3s var(--ease);white-space:nowrap}
#cpb-set .mod .dv,#cpb-set .mod>.ct .dv{opacity:1;transform:none}
#cpb-set .card .ch .dv{margin-left:2px}
#cpb-set .reset{width:26px;height:26px;border:0;background:none;border-radius:7px;display:grid;place-items:center;color:var(--st-tx3);opacity:0;pointer-events:none;transform:scale(.8);transition:opacity .2s,transform .25s var(--ease),background .15s,color .15s}
#cpb-set .mod:hover>.reset,#cpb-set .mod:hover>.rt .reset,#cpb-set .mod .reset:focus-visible{opacity:1;pointer-events:auto;transform:none}
#cpb-set .reset:hover{background:var(--st-hover);color:var(--st-tx)}
#cpb-set .reset svg{transition:transform .5s var(--ease)}
#cpb-set .reset.spin svg{transform:rotate(-360deg)}
#cpb-set .ctl{display:flex;align-items:center;gap:6px}
#cpb-set .sw,#cpb-st-hud .sw{position:relative;flex-shrink:0;width:36px;height:22px;border:0;padding:0;border-radius:999px;background:var(--st-sw-off);transition:background-color .25s var(--ease),box-shadow .25s}
#cpb-set .sw::after,#cpb-st-hud .sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:999px;background:linear-gradient(180deg,#fff,#f1f0ee);box-shadow:0 1px 2px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);transition:transform .36s var(--spring),width .2s var(--ease)}
#cpb-set .sw:active::after,#cpb-st-hud .sw:active::after{width:20px}
#cpb-set .sw[aria-checked="true"],#cpb-st-hud .sw[aria-checked="true"]{background:var(--st-brand);box-shadow:inset 0 1px 2px rgba(0,0,0,.15),0 0 0 1px color-mix(in srgb,var(--st-brand) 40%,transparent),0 0 12px color-mix(in srgb,var(--st-brand) 25%,transparent)}
#cpb-set .sw[aria-checked="true"]::after,#cpb-st-hud .sw[aria-checked="true"]::after{transform:translateX(14px)}
#cpb-set .sw[aria-checked="true"]:active::after,#cpb-st-hud .sw[aria-checked="true"]:active::after{transform:translateX(10px)}
#cpb-set .step,#cpb-st-hud .step{display:flex;align-items:center;height:28px;border-radius:8px;background:var(--st-sel)}
#cpb-set .step button,#cpb-st-hud .step button{width:28px;height:28px;border:0;background:none;border-radius:8px;color:var(--st-tx2);display:grid;place-items:center;transition:background .15s,transform .16s var(--ease)}
#cpb-set .step button:hover,#cpb-st-hud .step button:hover{background:var(--st-hover);color:var(--st-tx)}
#cpb-set .step button:active,#cpb-st-hud .step button:active{transform:scale(.9)}
#cpb-set .step button:disabled,#cpb-st-hud .step button:disabled{opacity:.3;cursor:default}
#cpb-set .step .num,#cpb-st-hud .step .num{position:relative;min-width:44px;height:28px;overflow:hidden;text-align:center;font-weight:600;font-variant-numeric:tabular-nums;line-height:28px}
#cpb-set .num span,#cpb-st-hud .num span{display:block}
#cpb-set .num .up,#cpb-st-hud .num .up{animation:cpbNumUp .28s var(--ease)}
#cpb-set .num .down,#cpb-st-hud .num .down{animation:cpbNumDown .28s var(--ease)}
@keyframes cpbNumUp{from{transform:translateY(70%);opacity:0}}
@keyframes cpbNumDown{from{transform:translateY(-70%);opacity:0}}
#cpb-set .chips{display:flex;flex-wrap:wrap;gap:6px}
#cpb-set .cgrp+.cgrp{margin-top:10px}
#cpb-set .cgl{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:2px 6px;margin:0 0 6px -6px;border-radius:6px;font-size:11.5px;font-weight:600;color:var(--st-tx2);transition:background .15s,color .15s}
#cpb-set .cgl:hover{background:var(--st-hover);color:var(--st-tx)}
#cpb-set .cgl .vdot{width:7px;height:7px}
#cpb-set .cgn{font-weight:400;color:var(--st-tx3);font-variant-numeric:tabular-nums}
#cpb-set .chip,#cpb-st-hud .chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px 0 10px;border:0;border-radius:999px;background:var(--st-sel);font-size:12.5px;color:var(--st-tx3);transition:background .2s var(--ease),color .2s,transform .16s var(--ease)}
#cpb-set .chip:hover,#cpb-st-hud .chip:hover{color:var(--st-tx)}
#cpb-set .chip:active,#cpb-st-hud .chip:active{transform:scale(.96)}
#cpb-set .chip .ci,#cpb-st-hud .chip .ci{display:inline-flex;width:16px;height:16px;align-items:center;justify-content:center;color:var(--st-tx3);opacity:.6;transition:color .25s,opacity .25s,transform .35s var(--spring),filter .25s}
#cpb-set .chip .ci svg,#cpb-st-hud .chip .ci svg{width:15px;height:15px}
#cpb-set .chip .ci img,#cpb-st-hud .chip .ci img{width:16px;height:16px;border-radius:4px;object-fit:cover;display:block}
#cpb-set .chip:not([aria-pressed="true"]) .ci img,#cpb-st-hud .chip:not([aria-pressed="true"]) .ci img{filter:grayscale(1)}
#cpb-set .chip[aria-pressed="true"],#cpb-st-hud .chip[aria-pressed="true"]{background:var(--st-brand-soft);color:var(--st-tx);font-weight:600}
#cpb-set .chip[aria-pressed="true"] .ci,#cpb-st-hud .chip[aria-pressed="true"] .ci{color:var(--st-brand);opacity:1;transform:scale(1.12)}
#cpb-set .chip.hidechip,#cpb-st-hud .chip.hidechip{color:var(--st-tx2)}
#cpb-set .chip.hidechip .ci,#cpb-st-hud .chip.hidechip .ci{opacity:1}
#cpb-set .chip.hidechip:not([aria-pressed="true"]) .ci img,#cpb-st-hud .chip.hidechip:not([aria-pressed="true"]) .ci img{filter:none}
#cpb-set .chip.hidechip[aria-pressed="true"],#cpb-st-hud .chip.hidechip[aria-pressed="true"]{background:none;box-shadow:inset 0 0 0 1px var(--st-line2);color:var(--st-tx3);font-weight:400;text-decoration:line-through;text-decoration-color:color-mix(in srgb,var(--st-tx) 45%,transparent)}
#cpb-set .chip.hidechip[aria-pressed="true"] .ci,#cpb-st-hud .chip.hidechip[aria-pressed="true"] .ci{transform:none;opacity:.45}
#cpb-set .chip.hidechip[aria-pressed="true"] .ci img,#cpb-st-hud .chip.hidechip[aria-pressed="true"] .ci img{filter:grayscale(1)}
#cpb-set .chip.hidechip[aria-pressed="true"] .cbadge,#cpb-st-hud .chip.hidechip[aria-pressed="true"] .cbadge{opacity:.5}
#cpb-set .chip .eng,#cpb-st-hud .chip .eng{font-weight:400;font-size:11.5px;color:var(--st-tx3)}
#cpb-set .cbadge,#cpb-st-hud .cbadge{display:inline-flex;align-items:center;gap:4px;height:16px;padding:0 4px;border-radius:4px;border:1px solid var(--st-line2);background:var(--st-win);color:var(--st-tx2);font-size:10px;font-weight:500;line-height:1;text-decoration:none}
#cpb-set .cbadge svg,#cpb-st-hud .cbadge svg{width:10px;height:10px}
#cpb-set .vdot,#cpb-st-hud .vdot{display:block;width:8px;height:8px;border-radius:50%;background:currentColor}
#cpb-set .v-claude,#cpb-st-hud .v-claude{color:#d97757}#cpb-set .v-gemini,#cpb-st-hud .v-gemini{color:#4f8df5}#cpb-set .v-gpt,#cpb-st-hud .v-gpt{color:#10a37f}#cpb-set .v-deepseek,#cpb-st-hud .v-deepseek{color:#4d6bfe}
#cpb-set .btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:8px;background:var(--st-sel);font-size:12.5px;white-space:nowrap;color:var(--st-tx);transition:background .15s,transform .16s var(--ease)}
#cpb-set .btn:hover{background:color-mix(in srgb,var(--st-tx) 10%,transparent)}
#cpb-set .btn:active{transform:scale(.97)}
#cpb-set .btn.danger{background:var(--st-danger-soft);color:var(--st-danger)}
#cpb-set .btn.danger:hover{background:color-mix(in srgb,var(--st-danger) 16%,transparent)}
#cpb-set .btn:disabled{opacity:.4;cursor:default;transform:none}
#cpb-set .btn svg{width:14px;height:14px}
#cpb-set .quick{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#cpb-set .qa{display:flex;align-items:center;gap:10px;height:46px;padding:0 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--st-card) 82%,transparent);box-shadow:0 0 0 1px var(--st-line);text-align:left;font-weight:600;transition:box-shadow .2s var(--ease),transform .16s var(--ease)}
#cpb-set .qa:hover{box-shadow:0 0 0 1px var(--st-line2),0 4px 14px rgba(0,0,0,.06)}
#cpb-set .qa:active{transform:scale(.98)}
#cpb-set .qa svg{width:18px;height:18px;color:var(--st-tx2)}
#cpb-set .qa .ar{margin-left:auto;color:var(--st-tx3);transition:transform .2s var(--ease)}
#cpb-set .qa:hover .ar{transform:translateX(2px)}
#cpb-set .row.key{gap:6px}
#cpb-set .kname{border:0;background:none;padding:1px 5px;margin:-1px -5px;border-radius:6px;font-weight:600;color:var(--st-tx);cursor:text;transition:background .15s}
#cpb-set .kname:hover{background:var(--st-hover)}
#cpb-set .kren{height:24px;width:min(220px,100%);padding:0 6px;margin:-2px -6px;border:0;border-radius:6px;background:var(--st-card);color:var(--st-tx);font:inherit;font-weight:600;outline:0;box-shadow:0 0 0 1px var(--st-line2),0 0 0 3px var(--st-brand-soft)}
#cpb-set .row.key .kv{display:block;margin-top:2px;font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:11.5px;letter-spacing:.03em;color:var(--st-tx3);word-break:break-all}
#cpb-set .row.key .kv.on{color:var(--st-tx2);user-select:all}
#cpb-set .kdel:hover{background:var(--st-danger-soft);color:var(--st-danger)}
#cpb-set .kcopy{min-width:76px;justify-content:center}
#cpb-set .kcopy .i1,#cpb-set .kcopy .i2{display:inline-flex}
#cpb-set .kcopy .i2,#cpb-set .kcopy.done .i1{display:none}
#cpb-set .kcopy.done{background:var(--st-brand-soft);color:var(--st-brand)}
#cpb-set .kcopy.done .i2{display:inline-flex}
#cpb-set .kcopy.done .i2 path{stroke-dasharray:1;animation:cpbIcDraw .35s var(--ease)}
#cpb-set .kempty{padding:26px 0}
#cpb-set .kadd{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.4fr) auto;gap:8px;padding:12px}
#cpb-set .kadd input{height:32px;min-width:0;padding:0 10px;border:0;border-radius:8px;background:var(--st-sel);color:var(--st-tx);font:inherit;outline:0;transition:box-shadow .2s var(--ease),background .2s}
#cpb-set .kadd input::placeholder{color:var(--st-tx3)}
#cpb-set .kadd input:focus{background:var(--st-card);box-shadow:0 0 0 1px var(--st-line2),0 0 0 3px var(--st-brand-soft)}
#cpb-set .kadd input[data-kval]{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:12px;-webkit-text-security:disc}
#cpb-set .btn.pri{background:var(--st-brand);color:#fff}
#cpb-set .btn.pri:hover{background:color-mix(in srgb,var(--st-brand) 86%,#000)}
#cpb-set .knote{margin:10px 4px 0;font-size:11.5px;line-height:1.65;color:var(--st-tx3)}
@media (max-width:720px){#cpb-set .kadd{grid-template-columns:1fr}}
#cpb-set .danger-zone{box-shadow:0 0 0 1px color-mix(in srgb,var(--st-danger) 25%,transparent);overflow:hidden}
#cpb-set .help{display:inline-grid;place-items:center;width:16px;height:16px;margin-left:2px;border:0;padding:0;border-radius:50%;background:var(--st-sel);color:var(--st-tx3);font-size:10.5px;font-weight:700;line-height:1;cursor:help;transition:background .15s,color .15s}
#cpb-set .help:hover{background:color-mix(in srgb,var(--st-brand) 18%,transparent);color:var(--st-brand)}
@media (max-width:720px){#cpb-set .win{grid-template-columns:1fr}#cpb-set .side{display:none}#cpb-set .quick{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){#cpb-set *,#cpb-set *::before,#cpb-set *::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
#cpb-st-hud{position:fixed;inset:0;z-index:2147483001;pointer-events:none;color:var(--st-tx);font-size:13px;line-height:1.45;
  --st-card:#242428;--st-win:#1e1e21;--st-line:rgba(255,255,255,.06);--st-line2:rgba(255,255,255,.11);--st-tx:#edece9;--st-tx2:#a9a8a3;--st-tx3:#73726e;--st-hover:rgba(255,255,255,.045);--st-sel:rgba(255,255,255,.075);--st-brand:#ff5848;--st-brand-soft:rgba(255,88,72,.14);--st-sw-off:rgba(255,255,255,.16);--ease:cubic-bezier(.23,1,.32,1);--spring:linear(0,.18,.42,.72,.95,1.06,1.04,1.01,.99,1)}
body[data-theme=light] #cpb-st-hud{--st-card:#fff;--st-win:#fff;--st-line:rgba(0,0,0,.07);--st-line2:rgba(0,0,0,.12);--st-tx:#1b1a19;--st-tx2:#5f5e59;--st-tx3:#94928c;--st-hover:rgba(0,0,0,.04);--st-sel:rgba(0,0,0,.06);--st-brand:#ff4432;--st-brand-soft:rgba(255,68,50,.1);--st-sw-off:rgba(0,0,0,.14)}
#cpb-st-hud *{box-sizing:border-box}
#cpb-st-hud button{font:inherit;color:inherit;cursor:pointer}
#cpb-st-hud svg{display:block;flex-shrink:0}
#cpb-st-hud .spot{position:absolute;inset:0;opacity:0;transition:opacity .2s var(--ease)}
#cpb-st-hud[data-pv] .spot{opacity:1}
#cpb-st-hud .spot .ring{fill:none;stroke:var(--st-brand);stroke-width:1.5;stroke-dasharray:100;stroke-dashoffset:100;filter:drop-shadow(0 0 6px var(--st-brand));animation:cpbRing .35s var(--ease) .08s forwards}
@keyframes cpbRing{to{stroke-dashoffset:0}}
#cpb-st-hud .hudbox{position:absolute;border-radius:12px;overflow:hidden}
#cpb-st-hud .hudbox::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-45%;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--st-brand) 22%,transparent),transparent);animation:cpbSweep .55s var(--ease) .15s forwards}
@keyframes cpbSweep{to{left:110%}}
#cpb-st-hud .hudbox i{position:absolute;width:10px;height:10px;border-color:var(--st-brand);border-style:solid;opacity:0;animation:cpbStShow .2s .2s forwards;filter:drop-shadow(0 0 3px var(--st-brand))}
#cpb-st-hud .hudbox i:nth-child(1){top:-2px;left:-2px;border-width:2px 0 0 2px;border-top-left-radius:6px}
#cpb-st-hud .hudbox i:nth-child(2){top:-2px;right:-2px;border-width:2px 2px 0 0;border-top-right-radius:6px}
#cpb-st-hud .hudbox i:nth-child(3){bottom:-2px;left:-2px;border-width:0 0 2px 2px;border-bottom-left-radius:6px}
#cpb-st-hud .hudbox i:nth-child(4){bottom:-2px;right:-2px;border-width:0 2px 2px 0;border-bottom-right-radius:6px}
@keyframes cpbStShow{to{opacity:1}}
#cpb-st-hud .callout{position:absolute;display:flex;align-items:center;opacity:0;animation:cpbStShow .01s .2s forwards}
#cpb-st-hud .callout .lead{height:1px;width:0;background:var(--st-brand);box-shadow:0 0 6px var(--st-brand);animation:cpbLead .2s var(--ease) .2s forwards}
@keyframes cpbLead{to{width:44px}}
#cpb-st-hud .callout .tag{padding:10px 14px;border-radius:14px;background:color-mix(in srgb,#0d0d10 82%,transparent);color:#fff;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 0 1px color-mix(in srgb,var(--st-brand) 40%,transparent),0 10px 30px rgba(0,0,0,.4);opacity:0;transform:translateX(-6px);animation:cpbTag .25s var(--ease) .3s forwards}
#cpb-st-hud .callout.left{flex-direction:row-reverse}
#cpb-st-hud .callout.above{flex-direction:column-reverse;align-items:flex-start}
#cpb-st-hud .callout.above .lead{width:1px;height:0;margin-left:24px;animation:cpbLeadV .2s var(--ease) .2s forwards}
@keyframes cpbLeadV{to{height:22px}}
#cpb-st-hud .callout.above .tag{transform:translateY(6px)}
#cpb-st-hud .callout.left .tag{transform:translateX(6px)}
@keyframes cpbTag{to{opacity:1;transform:none}}
#cpb-st-hud .callout .cap{display:flex;align-items:center;gap:8px;font-size:10.5px;letter-spacing:.06em;color:rgba(255,255,255,.55)}
#cpb-st-hud .callout .cap b{font-weight:600;color:color-mix(in srgb,var(--st-brand) 70%,#fff)}
#cpb-st-hud .callout .cap code{font-family:ui-monospace,"SF Mono",Consolas,monospace;font-size:10px;color:rgba(255,255,255,.4)}
#cpb-st-hud .callout .ttl{font-size:14px;font-weight:700;margin-top:3px;letter-spacing:-.01em}
#cpb-st-hud .callout .st{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;color:rgba(255,255,255,.6)}
#cpb-st-hud .callout .st em{font-style:normal;padding:1px 8px;border-radius:999px;background:rgba(255,255,255,.1)}
#cpb-st-hud .callout .st em.now{background:var(--st-brand);color:#fff;font-weight:600}
#cpb-st-hud .peek-float{position:fixed!important;pointer-events:auto;margin:0;border-radius:12px;background:color-mix(in srgb,var(--st-card) 94%,transparent);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--st-brand) 45%,transparent),0 0 24px color-mix(in srgb,var(--st-brand) 22%,transparent),0 12px 30px rgba(0,0,0,.35);animation:cpbFloatIn .25s var(--ease)}
#cpb-st-hud .peek-float.chip{border-radius:999px}
#cpb-st-hud .peek-float.out{opacity:0;transform:scale(.98);transition:opacity .2s,transform .2s}
@keyframes cpbFloatIn{from{opacity:0;transform:scale(.97)}}
#cpb-st-hud .row{display:flex;align-items:center;gap:10px;min-height:46px;padding:9px 16px}
#cpb-st-hud .ch{display:flex;align-items:center;gap:14px;padding:14px 16px;min-height:56px}
#cpb-st-hud .tile{width:22px;height:22px;flex-shrink:0;display:grid;place-items:center;color:var(--st-tx2)}
#cpb-st-hud .tile svg{width:19px;height:19px}
#cpb-st-hud .ct{flex:1;min-width:0}
#cpb-st-hud .ct b{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px}
#cpb-st-hud .ct p{margin:2px 0 0;color:var(--st-tx3);font-size:12px}
#cpb-st-hud .hint{display:none}
#cpb-st-hud .ctl{display:flex;align-items:center;gap:6px}
#cpb-st-hud .row.block{display:block}
#cpb-st-hud .row .rt{flex:1;min-width:0}
#cpb-st-hud .row .rt span{display:flex;align-items:center;gap:6px}
#cpb-st-hud .row .rt small{display:block;color:var(--st-tx3);font-size:11.5px;margin-top:1px}
#cpb-st-hud .row .lb{font-style:normal;color:var(--st-tx)}
#cpb-st-hud .help,#cpb-st-hud .reset,#cpb-st-hud .dv,#cpb-st-hud .badge{display:none}
#cpb-st-hud .chips{display:flex;flex-wrap:wrap;gap:6px}
#cpb-st-hud .tip{position:fixed;max-width:260px;padding:10px 12px;border-radius:12px;font-size:12px;line-height:1.55;color:var(--st-tx);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .16s var(--ease),transform .2s var(--ease);
  background:color-mix(in srgb,var(--st-card) 88%,transparent);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);box-shadow:0 0 0 1px var(--st-line2),inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent),0 12px 30px rgba(0,0,0,.25)}
#cpb-st-hud .tip.on{opacity:1;transform:none}
#cpb-st-hud .tip b{display:block;margin-bottom:2px;font-size:12.5px}
body:has(> #cpb-set) #cpb-toasts{z-index:2147483600}
`;
  cssAdd('settings', SET_CSS);
  // ===== logsearch =====
  // ── 로그 검색: 지금 스토리 방의 전체 대화를 키워드로 찾는다(스토리 채팅만) ──────────────────────────
  // 열 때만 받는다: GET /crack-gen/v3/chats/<id>/messages?limit=500(최신→과거, 커서). 실측 1,314턴 방 = 6번·1.2초.
  // 방마다 메모리에 두고(최근 3개 방), 다시 열면 최신 100개만 받아 새 메시지를 붙인다. 크랙의 메시지 수정·삭제 요청을 엿들어 고친다.
  // 결과를 누르면 그 메시지 전문(앞뒤로 넘기기). '채팅에서 보기'를 누를 때만 크랙의 '이전 대화 불러오기'를 돌려 그 자리로 간다
  // (그동안만 크랙의 이전 쪽 요청을 우리가 200개씩 대신 받아 단계를 1/10로 줄인다)
  const lsOn = (k) => !(isObj(conf.logsearch) && conf.logsearch[k] === false);
  const LS_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h11M4 9.5h7M4 14h5"/><circle cx="15.5" cy="14.5" r="4"/><path d="M18.5 17.5L21 20"/></svg>';
  const LS_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const LS_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  const LS_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const lsCache = new Map(); // chatId → {msgs (과거→최신), byId, at, raw, cursors}. 지금 방 하나만 둔다
  const lsUI = { el: null, open: false, chatId: '', q: '', role: 'all', order: 'new', shown: 120, detail: null, busy: false, tracing: null };
  const lsNorm = (s) => String(s || '').normalize('NFKC').toLowerCase();
  const lsTime = (id) => { const n = parseInt(String(id).slice(0, 8), 16); return n ? n * 1000 : 0; };
  // 쪽마다 '이 메시지 다음(더 과거) 쪽 커서'를 기억해 둔다 → '채팅에서 보기'를 한 번에 넘겨줄 때 크랙이 이어 받을 커서로 쓴다
  async function lsPages(chatId, stopAt, max, cursors) {
    const out = [];
    let cur = '';
    for (let i = 0; i < 200; i++) {
      const r = await crackFetch('GET', '/crack-gen/v3/chats/' + encodeURIComponent(chatId) + '/messages?limit=' + max + (cur ? '&cursor=' + encodeURIComponent(cur) : ''));
      const d = r.json && r.json.data;
      if (!r.ok || !d || !Array.isArray(d.messages)) throw new Error('메시지를 받지 못했어요 (' + r.status + ')');
      let hit = false;
      for (const m of d.messages) { if (stopAt && stopAt.has(m._id)) { hit = true; break; } out.push(m); }
      if (cursors && !hit && d.messages.length && d.hasNext && d.nextCursor) cursors.set(d.messages[d.messages.length - 1]._id, d.nextCursor);
      if (hit || !d.hasNext || !d.nextCursor || d.nextCursor === cur) break;
      cur = d.nextCursor;
      if (lsUI.open) lsStatus('불러오는 중 · 메시지 ' + out.length.toLocaleString() + '개');
    }
    return out; // 최신→과거
  }
  // 턴 번호: 과거부터 사용자 메시지마다 +1. 사용자 메시지 없이 이어진 AI 메시지(이어서 진행)는 새 턴, 리롤은 같은 턴
  function lsNumber(c) {
    let turn = 0, prevUser = false, lastParent = null;
    for (const m of c.msgs) {
      if (m.role === 'user') { turn++; prevUser = true; m.turn = turn; continue; }
      if (!prevUser && !m.reroll && turn > 0 && m.parentTurnId && m.parentTurnId !== lastParent) turn++;
      m.turn = turn;
      prevUser = false;
      lastParent = m.parentTurnId;
    }
    c.turns = turn;
  }
  const lsSlim = (m) => ({ _id: m._id, role: m.role, content: String(m.content || ''), reroll: !!m.reroll, turnId: m.turnId || '', parentTurnId: m.parentTurnId || '', t: lsTime(m._id), n: lsNorm(m.content) });
  const lsJobs = new Map(); // 방 → 진행 중인 불러오기(첫 불러오기 중에 또 열어도 같은 걸 기다린다: 두 번 받지 않게)
  async function lsLoad(chatId) {
    if (lsJobs.has(chatId)) return lsJobs.get(chatId);
    let c = lsCache.get(chatId);
    const job = (async () => {
      if (!c || !c.raw) {
        // 원본 메시지(크랙 응답 그대로)는 지금 방 하나만 들고 있는다(채팅에서 보기를 한 번에 넘겨줄 때 쓴다). 다른 방은 검색용 줄인 것만
        const cursors = new Map();
        const all = await lsPages(chatId, null, 500, cursors);
        c = { msgs: all.slice().reverse().map(lsSlim), byId: new Map(), at: Date.now(), raw: new Map(all.map((m) => [m._id, m])), cursors };
      } else {
        // 다시 열 때: 화면(크랙 저장소)의 가장 새 메시지가 이미 기록에 있으면 받을 게 없다(요청 0. 고침·지움은 따로 엿들어 고친다).
        // 아니면 최신 100개씩 받다가 이미 있는 메시지를 만나면 멈춘다(보통 1번)
        const st = chatId === roomId() ? chatCtx() : null;
        let newest = '';
        if (st && st.store) for (const k of st.store.getState().messages.keys()) if (typeof k === 'string' && k > newest) newest = k;
        if (!(newest && c.byId.has(newest))) {
          const fresh = await lsPages(chatId, c.byId, 100);
          if (fresh.length) { c.msgs.push(...fresh.slice().reverse().map(lsSlim)); for (const m of fresh) c.raw.set(m._id, m); }
        }
        c.at = Date.now();
      }
      c.byId = new Map(c.msgs.map((m) => [m._id, m]));
      lsNumber(c);
      lsCache.delete(chatId);
      lsCache.set(chatId, c);
      // 다른 방 기록은 지운다: 원본이 없으면 그 방을 다시 열 때 어차피 전부 새로 받아서 쓰이지 않고 메모리만 차지한다
      for (const k of [...lsCache.keys()]) if (k !== chatId) lsCache.delete(k);
      return c;
    })();
    lsJobs.set(chatId, job);
    try { return await job; } finally { lsJobs.delete(chatId); }
  }
  // 크랙이 메시지를 고치거나 지우면 받아 둔 기록도 고친다(추가 요청 없음)
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/[^/?#]+\/messages\/[^/?#]+/, fn: (m, url, st, j, b) => {
    if (st < 200 || st >= 300) return;
    const mm = url.match(/\/v3\/chats\/([^/?#]+)\/messages\/([^/?#]+)/);
    const c = mm && lsCache.get(mm[1]);
    if (!c) return;
    const msg = c.byId.get(mm[2]);
    if (!msg) return;
    if (m === 'DELETE') { c.msgs = c.msgs.filter((x) => x !== msg); c.byId.delete(mm[2]); if (c.raw) c.raw.delete(mm[2]); lsNumber(c); }
    else if (m === 'PATCH' && b && typeof (b.message || b.content) === 'string') {
      msg.content = b.message || b.content;
      msg.n = lsNorm(msg.content);
      const r = c.raw && c.raw.get(mm[2]);
      if (r) r.content = msg.content;
    }
    if (lsUI.open && lsUI.chatId === mm[1]) lsRender();
  } });

  function lsBuild() {
    const el = document.createElement('div');
    el.id = 'cpb-ls';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '로그 검색');
    el.innerHTML = '<div class="hd"><b>로그 검색</b><span class="st" data-st></span><button type="button" class="x" data-x aria-label="닫기">' + LS_X + '</button></div>'
      + '<div class="bar"><div class="box">' + LS_ICON + '<input type="text" data-q placeholder="대화에서 찾을 말" aria-label="대화에서 찾을 말" spellcheck="false" autocomplete="off"></div>'
      + '<div class="chips"><button type="button" data-role="all" aria-pressed="true">전체</button><button type="button" data-role="user" aria-pressed="false">내 메시지</button><button type="button" data-role="assistant" aria-pressed="false">답변</button>'
      + '<span class="sp"></span><button type="button" data-order aria-label="정렬 바꾸기">최신 순</button></div></div>'
      + '<div class="list" data-list></div>'
      + '<div class="det" data-det hidden><div class="dh"><button type="button" data-back>' + LS_PREV + '<span>목록</span></button><span class="dm" data-dm></span>'
      + '<button type="button" class="nv" data-nv="-1" aria-label="이전 메시지">' + LS_PREV + '</button><button type="button" class="nv" data-nv="1" aria-label="다음 메시지">' + LS_NEXT + '</button></div>'
      + '<div class="dt" data-dt></div><div class="df"><button type="button" data-copy>복사</button><button type="button" class="pri" data-trace>채팅에서 보기</button></div></div>';
    const q = el.querySelector('[data-q]');
    let comp = false, t = 0;
    q.addEventListener('compositionstart', () => { comp = true; });
    q.addEventListener('compositionend', () => { comp = false; lsUI.q = q.value; lsUI.shown = 120; lsRender(); });
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { lsUI.q = q.value; lsUI.shown = 120; lsRender(); }, comp ? 160 : 60); });
    // 우리 입력칸의 키는 크랙 단축키로 새지 않게(가짜 키 이벤트는 만들지 않는다)
    for (const ty of ['keydown', 'keyup', 'keypress']) el.addEventListener(ty, (e) => { e.stopPropagation(); if (ty === 'keydown' && e.key === 'Escape') { if (lsUI.detail) lsDetail(null); else lsClose(); } });
    // 이어 읽기: 끝에 닿으면 더 붙이기(프레임당 한 번), 메시지를 누르면 그걸 고른 메시지로(글을 고르는 중이면 그대로)
    lsDragInit(el);
    let rf = 0;
    el.querySelector('[data-dt]').addEventListener('scroll', () => { if (!rf) rf = requestAnimationFrame(() => { rf = 0; lsReaderScroll(); }); }, { passive: true });
    el.addEventListener('click', (e) => {
      const lm = e.target.closest ? e.target.closest('.lm') : null;
      if (lm && !e.target.closest('button')) {
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || sel.isCollapsed) lsDetail(lm.dataset.mid);
        return;
      }
      const b = e.target.closest ? e.target.closest('button,[data-id]') : null;
      if (!b) return;
      if (b.hasAttribute('data-x')) return lsClose();
      if (b.dataset.role) { lsUI.role = b.dataset.role; for (const x of el.querySelectorAll('[data-role]')) x.setAttribute('aria-pressed', String(x === b)); lsUI.shown = 120; return lsRender(); }
      if (b.hasAttribute('data-order')) { lsUI.order = lsUI.order === 'new' ? 'old' : 'new'; b.textContent = lsUI.order === 'new' ? '최신 순' : '오래된 순'; return lsRender(); }
      if (b.hasAttribute('data-more')) { lsUI.shown += 1000; return lsRender(); }
      if (b.dataset.id) return lsDetail(b.dataset.id);
      if (b.hasAttribute('data-back')) return lsDetail(null);
      if (b.dataset.nv) return lsStep(Number(b.dataset.nv));
      if (b.hasAttribute('data-copy')) return lsCopy(b);
      if (b.hasAttribute('data-trace')) return lsUI.tracing ? lsTraceStop() : lsGo(lsUI.detail);
      if (b.hasAttribute('data-retry')) return lsOpen();
    });
    return el;
  }
  // 창 옮기기: 머리줄(버튼 말고)을 끌면 따라온다. 놓은 자리는 기억해 두고 열 때마다 화면 안으로 맞춰 놓는다
  const LS_POS_KEY = 'crack-pc-base:ls-pos';
  function lsPlace(el, p) {
    if (!p) { el.style.left = el.style.top = ''; el.style.right = ''; return; }
    const w = el.offsetWidth || 440, h = el.offsetHeight || 200;
    const x = Math.max(8, Math.min(innerWidth - w - 8, p.x)), y = Math.max(8, Math.min(innerHeight - h - 8, p.y));
    el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.right = 'auto';
  }
  function lsDragInit(el) {
    const hd = el.querySelector('.hd');
    hd.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      let raf = 0, last = null;
      el.classList.add('drag');
      hd.setPointerCapture(e.pointerId);
      const mv = (ev) => { last = { x: ev.clientX - dx, y: ev.clientY - dy }; if (!raf) raf = requestAnimationFrame(() => { raf = 0; lsPlace(el, last); }); };
      const up = () => {
        hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); hd.removeEventListener('pointercancel', up);
        el.classList.remove('drag');
        if (last) { lsPlace(el, last); writeJSON(LS_POS_KEY, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }); }
      };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    });
    // 두 번 누르면 원래 자리로
    hd.addEventListener('dblclick', (e) => { if (e.target.closest('button')) return; lsPlace(el, null); writeJSON(LS_POS_KEY, null); });
  }
  function lsStatus(t) { if (lsUI.el) { const s = lsUI.el.querySelector('[data-st]'); if (s.textContent !== t) s.textContent = t; } }
  async function lsOpen() {
    if (!page || !lsOn('on')) return;
    const chatId = roomId();
    if (!chatId) return;
    if (!lsUI.el) lsUI.el = lsBuild();
    if (!lsUI.el.isConnected) document.body.appendChild(lsUI.el);
    if (lsUI.chatId !== chatId) { lsUI.chatId = chatId; lsUI.detail = null; lsUI.q = ''; lsUI.shown = 120; lsUI.el.querySelector('[data-q]').value = ''; }
    lsUI.open = true;
    lsUI.el.hidden = false;
    lsPlace(lsUI.el, readJSON(LS_POS_KEY));
    setTimeout(() => lsUI.el && lsUI.el.querySelector('[data-q]').focus(), 30);
    lsDetail(lsUI.detail);
    lsStatus('불러오는 중…');
    lsUI.el.querySelector('[data-list]').innerHTML = '';
    try { await lsLoad(chatId); } catch (e) {
      lsStatus('');
      lsUI.el.querySelector('[data-list]').innerHTML = '<div class="em">' + escHtml(e.message || '불러오지 못했어요') + ' <button type="button" data-retry>다시 시도</button></div>';
      return;
    }
    if (lsUI.chatId === chatId) lsRender();
  }
  function lsClose() {
    lsTraceStop();
    lsUI.open = false;
    if (!lsUI.el) return;
    lsUI.el.hidden = true;
    // 닫힌 창에 목록(수천 줄)과 이어 읽기를 남겨 두지 않는다(실측: 2,631줄 = 페이지 요소의 79%). 열 때 다시 그린다
    lsUI.el.querySelector('[data-list]').innerHTML = '';
    lsUI.el.querySelector('[data-dt]').innerHTML = '';
    lsUI.win = null;
    lsUI.shown = 120; // 다시 열 때 '더 보기'로 늘린 수천 줄을 한꺼번에 그리지 않게
  }
  // 끄면 열린 창을 닫고 받아 둔 방 대화도 메모리에서 버린다(다시 켜고 열면 새로 받는다)
  on('settings', () => { if (!lsOn('on')) { if (lsUI.open) lsClose(); lsCache.clear(); } });
  function lsMatches(c) {
    const words = lsNorm(lsUI.q).split(/\s+/).filter(Boolean);
    const out = [];
    for (const m of c.msgs) {
      if (lsUI.role !== 'all' && m.role !== lsUI.role) continue;
      if (words.length && !words.every((w) => m.n.includes(w))) continue;
      out.push(m);
    }
    if (lsUI.order === 'new') out.reverse();
    return { out, words };
  }
  // 찾은 말 둘레 글(앞뒤 50자) + 강조
  function lsSnippet(m, words) {
    const s = m.content.replace(/\s+/g, ' ');
    if (!words.length) return escHtml(s.slice(0, 140));
    const low = lsNorm(s);
    const at = Math.max(0, low.indexOf(words[0]));
    const a = Math.max(0, at - 50), z = Math.min(s.length, at + 110);
    let part = escHtml((a ? '…' : '') + s.slice(a, z) + (z < s.length ? '…' : ''));
    for (const w of words) {
      const re = new RegExp(escHtml(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      part = part.replace(re, (x) => '<mark>' + x + '</mark>');
    }
    return part;
  }
  const lsWhen = (t) => { if (!t) return ''; const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  function lsRender() {
    if (!lsUI.open || !lsUI.el) return;
    const c = lsCache.get(lsUI.chatId);
    if (!c) return;
    const { out, words } = lsMatches(c);
    lsStatus('메시지 ' + c.msgs.length.toLocaleString() + '개 · ' + (c.turns || 0).toLocaleString() + '턴' + (words.length ? ' · ' + out.length.toLocaleString() + '개 찾음' : ''));
    const list = lsUI.el.querySelector('[data-list]');
    if (words.length && !out.length) { list.innerHTML = '<div class="em">찾는 말이 들어간 메시지가 없어요</div>'; return; }
    const rows = out.slice(0, lsUI.shown).map((m) => '<button type="button" class="it" data-id="' + m._id + '"><span class="mt"><b class="' + (m.role === 'user' ? 'u' : 'a') + '">' + (m.role === 'user' ? '나' : '답변') + '</b>' + (m.turn ? m.turn.toLocaleString() + '턴' : '시작') + (m.reroll ? ' · 다시 생성' : '') + '<i>' + lsWhen(m.t) + '</i></span><span class="sn">' + lsSnippet(m, words) + '</span></button>').join('');
    list.innerHTML = rows + (out.length > lsUI.shown ? '<button type="button" class="more" data-more>' + (out.length - lsUI.shown).toLocaleString() + '개 더 보기</button>' : '');
  }
  // ── 이어 읽기: 고른 메시지의 앞뒤 대화를 이 창 안에서 이어서 본다(받아 둔 기록만, 요청 0).
  // 처음엔 앞뒤 20개씩, 위·아래 끝에 닿으면 40개씩 더 붙인다. 고른 메시지는 테두리
  const LS_WIN = 20, LS_MORE = 40;
  const lsEscRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function lsFmt(t, words) {
    let h = escHtml(t).replace(/!\[[^\]]*\]\([^)]*\)/g, '[이미지]').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    for (const w of words) h = h.replace(new RegExp('(?![^<]*>)' + lsEscRe(escHtml(w)), 'gi'), (x) => '<mark>' + x + '</mark>');
    return h;
  }
  const lsHead = (m) => (m.role === 'user' ? '나' : '답변') + ' · ' + (m.turn ? m.turn.toLocaleString() + '턴' : '시작') + (m.reroll ? ' · 다시 생성' : '') + ' · ' + lsWhen(m.t);
  function lsBlock(m, words) {
    return '<div class="lm ' + (m.role === 'user' ? 'u' : 'a') + (m._id === lsUI.detail ? ' cur' : '') + '" data-mid="' + m._id + '"><div class="lh"><b>' + (m.role === 'user' ? '나' : '답변') + '</b>' + (m.turn ? m.turn.toLocaleString() + '턴' : '시작') + (m.reroll ? ' · 다시 생성' : '') + '<i>' + lsWhen(m.t) + '</i></div><div class="lt">' + lsFmt(m.content, words) + '</div></div>';
  }
  function lsDetail(id) {
    lsUI.detail = id;
    if (!lsUI.el) return;
    const det = lsUI.el.querySelector('[data-det]');
    const c = lsCache.get(lsUI.chatId);
    const m = id && c ? c.byId.get(id) : null;
    det.hidden = !m;
    lsUI.el.querySelector('[data-list]').hidden = !!m;
    if (!m) return;
    const i = c.msgs.indexOf(m);
    const dt = lsUI.el.querySelector('[data-dt]');
    const words = lsNorm(lsUI.q).split(/\s+/).filter(Boolean);
    // 지금 보이는 구간 안이면 테두리만 옮기고, 아니면 그 메시지 둘레로 새로 그린다
    const w = lsUI.win;
    if (!w || w.chat !== lsUI.chatId || i < w.a || i > w.b || !dt.querySelector('[data-mid="' + id + '"]')) {
      const a = Math.max(0, i - LS_WIN), b = Math.min(c.msgs.length - 1, i + LS_WIN);
      lsUI.win = { chat: lsUI.chatId, a, b };
      dt.innerHTML = c.msgs.slice(a, b + 1).map((x) => lsBlock(x, words)).join('');
    }
    for (const x of dt.querySelectorAll('.lm.cur')) x.classList.remove('cur');
    const el = dt.querySelector('[data-mid="' + id + '"]');
    if (el) {
      el.classList.add('cur');
      // 메시지가 창보다 길 수 있어 가운데 맞추기 대신: 찾은 글자가 있으면 그 글자를 위에서 1/3쯤, 없으면 메시지 맨 위를 창 맨 위에
      const mk = el.querySelector('mark');
      const top = dt.getBoundingClientRect().top;
      dt.scrollTop += mk ? mk.getBoundingClientRect().top - top - dt.clientHeight / 3 : el.getBoundingClientRect().top - top - 6;
    }
    lsUI.el.querySelector('[data-dm]').textContent = lsHead(m);
    lsUI.el.querySelector('[data-nv="-1"]').disabled = i <= 0;
    lsUI.el.querySelector('[data-nv="1"]').disabled = i >= c.msgs.length - 1;
    const tb = lsUI.el.querySelector('[data-trace]');
    tb.textContent = lsUI.tracing ? '멈추기' : '이 턴으로 가기';
  }
  // 위·아래 끝에 닿으면 더 붙인다(위에 붙일 때는 보던 자리가 그대로 있게 스크롤을 보정)
  function lsReaderScroll() {
    const c = lsCache.get(lsUI.chatId), w = lsUI.win;
    if (!c || !w || !lsUI.detail) return;
    const dt = lsUI.el.querySelector('[data-dt]');
    const words = lsNorm(lsUI.q).split(/\s+/).filter(Boolean);
    if (dt.scrollTop < 300 && w.a > 0) {
      const a = Math.max(0, w.a - LS_MORE);
      const h0 = dt.scrollHeight;
      dt.insertAdjacentHTML('afterbegin', c.msgs.slice(a, w.a).map((x) => lsBlock(x, words)).join(''));
      dt.scrollTop += dt.scrollHeight - h0;
      w.a = a;
    } else if (dt.scrollHeight - dt.scrollTop - dt.clientHeight < 300 && w.b < c.msgs.length - 1) {
      const b = Math.min(c.msgs.length - 1, w.b + LS_MORE);
      dt.insertAdjacentHTML('beforeend', c.msgs.slice(w.b + 1, b + 1).map((x) => lsBlock(x, words)).join(''));
      w.b = b;
    }
  }
  function lsStep(d) {
    const c = lsCache.get(lsUI.chatId);
    const m = c && c.byId.get(lsUI.detail);
    if (!m) return;
    const i = c.msgs.indexOf(m) + d;
    if (i >= 0 && i < c.msgs.length) lsDetail(c.msgs[i]._id);
  }
  async function lsCopy(b) {
    const c = lsCache.get(lsUI.chatId);
    const m = c && c.byId.get(lsUI.detail);
    if (!m) return;
    let ok = false;
    try { await navigator.clipboard.writeText(m.content); ok = true; } catch (_) { ok = false; }
    b.textContent = ok ? '복사됨' : '복사 실패';
    setTimeout(() => { b.textContent = '복사'; }, 1200);
  }
  // ── 채팅에서 보기(추적): 그 메시지가 든 그룹이 화면 목록에 생길 때까지 크랙의 '이전 대화 불러오기'를 돌린다
  // 그룹 찾기: 그룹 id가 메시지 id·턴 id와 같으면 바로. 아니면 아직 안 본 그룹만 메시지 id를 읽어 본다(그룹마다 한 번)
  function lsFindGroup(m, seen) {
    if (!foldList || !foldList.isConnected) attempt(perfAttach);
    const list = foldList || (document.querySelector('.flex-col-reverse > [data-message-group-id]') || {}).parentElement;
    if (!list) return null;
    for (const key of [m._id, m.turnId]) {
      if (!key) continue;
      const g = list.querySelector(':scope > [data-message-group-id="' + key + '"]');
      if (g) return g;
    }
    for (const g of list.children) {
      if (!g.hasAttribute('data-message-group-id') || seen.has(g)) continue;
      const ids = groupIds(g);
      if (ids.length) seen.add(g); // 아직 내용이 안 붙은 그룹은 다음에 다시 본다
      if (ids.includes(m._id)) return g;
    }
    return null;
  }
  function lsScroller() {
    if (foldSc && foldSc.isConnected) return foldSc;
    const list = (document.querySelector('.flex-col-reverse > [data-message-group-id]') || {}).parentElement;
    let sc = list && list.parentElement;
    while (sc && sc !== document.body && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    return sc && sc !== document.body ? sc : null;
  }
  // 추적하는 동안만: 크랙의 이전 쪽 요청(cursor 있음)을 200개 쪽으로 대신 받아 준다
  const LS_PAGE_RE = /\/crack-gen\/v3\/chats\/([^/?#]+)\/messages\?/;
  xhrRespond.push({
    test: LS_PAGE_RE,
    on: () => !!lsUI.tracing,
    respond: async ({ url }) => {
      const u = new URL(url, location.href);
      const mm = u.pathname.match(/\/v3\/chats\/([^/?#]+)\/messages/);
      if (!mm || mm[1] !== lsUI.chatId || !u.searchParams.get('cursor')) return null;
      u.searchParams.set('limit', '200');
      const r = await crackFetch('GET', u.pathname + u.search);
      return r.ok && r.json && r.json.data ? r.json : null;
    },
  });
  async function lsTrace(id) {
    if (!id || lsUI.tracing) return;
    const c = lsCache.get(lsUI.chatId);
    const m = c && c.byId.get(id);
    if (!m) return;
    const run = { id, stop: false };
    lsUI.tracing = run;
    lsDetail(lsUI.detail);
    // 접어 둔 오래된 대화는 모두 펼친다(읽기 모드. unfoldAll이 reading을 끄므로 그 뒤에 켠다)
    unfoldAll();
    reading = true;
    const seen = new WeakSet();
    let g = lsFindGroup(m, seen), steps = 0, lastCount = -1, still = 0;
    while (!g && !run.stop && steps < 120) {
      const sc = lsScroller();
      if (!sc) break;
      const ctx = chatCtx();
      const count = ctx && ctx.store ? ctx.store.getState().messages.size : 0;
      lsStatus('채팅에서 찾는 중 · ' + count.toLocaleString() + '개 불러옴 · ' + (m.turn ? m.turn.toLocaleString() + '턴' : '시작') + ' 찾는 중');
      if (count === lastCount) { if (++still > 6) break; } else still = 0;
      lastCount = count;
      sc.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 700));
      steps++;
      g = lsFindGroup(m, seen);
    }
    const stopped = run.stop;
    if (lsUI.tracing === run) lsUI.tracing = null;
    if (!g) { if (!stopped) toast('채팅에서 그 메시지를 찾지 못했어요', { key: 'ls' }); lsRender(); lsDetail(lsUI.detail); return; }
    lsLand(g); // 바로 이동과 같게: 그 턴부터 '남길 최근 대화'만 펴고 나머지는 접는다(불러온 전체를 펴 두지 않게)
  }
  function lsTraceStop() {
    if (lsUI.tracing) lsUI.tracing.stop = true;
  }
  // ── 이 턴으로 가기 (요청 0)
  // 크랙 화면(iS)은 최신 쪽 불러오기(rW)와 '처음부터' 불러오기(rQ, 켜짐 값 x가 true일 때만)를 함께 쓴다. ^ 버튼 = x를 true로.
  // rQ는 SWR 무한 목록의 쪽들을 '이미 넣은 개수'(ref)보다 많아질 때만 그 차이를 저장소 목록 위에 끼워 넣는다.
  // 처음(x=false): x를 직접 켠다(못 찾으면 ^를 대신 누른다). 크랙이 '처음부터 20개'를 달라고 하면 그 턴부터 준다(받아 둔 기록에서. 이어지는 쪽도 같음).
  // 이미 '처음부터 보기' 중(x=true): ^는 스크롤만 한다 → rQ의 '넣은 개수'를 0으로 돌리고 그 SWR 데이터를 우리 첫 쪽으로 바꾼다.
  // 다 막히면(크랙 구조 변경) 예전 추적 방식, 그것도 안 되면 새로고침한 뒤 자동으로 다시
  let lsJumpTo = null; // {chatId, start, used}
  let lsJumpCache = null; // {chatId, cache}: 그 방을 떠날 때 '처음부터' 캐시를 지운다(남으면 돌아와 누른 ^가 옛 이동 구간을 쓴다)
  let lsServed = 0; // 크랙의 '처음부터' 첫 쪽 요청에 우리가 답한 횟수(켰는데 이게 안 늘면 크랙이 새로 안 받은 것)
  const lsTopBtn = () => { for (const b of document.querySelectorAll('main button')) if (isCrackBtn(b, CRACK_TOP_D)) return b; return null; };
  const lsTag = (chatId) => '/v3/chats/' + chatId + '/messages';
  // 우리 '처음부터' 쪽: from번째 메시지부터 lim개, 다음 쪽 표시는 'cpb-asc-<끝 번호>'
  function lsAscPage(c, from, lim) {
    const end = from + lim, more = end < c.msgs.length;
    const messages = c.msgs.slice(from, end).map((m) => c.raw.get(m._id)).filter(Boolean);
    return { result: 'SUCCESS', data: { messages, hasNext: more, nextCursor: more ? 'cpb-asc-' + end : null } };
  }
  const LS_EMPTY = () => ({ result: 'SUCCESS', data: { messages: [], hasNext: false, nextCursor: null } });
  // 파이버는 두 벌(지금 것/옛것)이고 DOM에 붙은 쪽이 옛것일 수 있다: 뿌리까지 올라가 그 뿌리가 지금 트리면 그대로, 아니면 짝
  function lsCurrent(f) {
    if (!f || !f.alternate) return f;
    let r = f;
    while (r.return) r = r.return;
    return r.stateNode && r.stateNode.current === r ? f : f.alternate;
  }
  // 메시지 화면 컴포넌트의 훅 목록(위로 올라가며 SWR 설정 ref가 있는 첫 함수 컴포넌트)
  const lsIsRef = (h) => !h.queue && h.memoizedState && typeof h.memoizedState === 'object' && !Array.isArray(h.memoizedState) && 'current' in h.memoizedState && Object.keys(h.memoizedState).length === 1;
  const lsIsCfg = (h) => lsIsRef(h) && h.memoizedState.current && typeof h.memoizedState.current === 'object' && h.memoizedState.current.cache instanceof Map;
  function lsChatHooks() {
    const list = foldList && foldList.isConnected ? foldList : (document.querySelector('.flex-col-reverse > [data-message-group-id]') || {}).parentElement;
    for (let f = list ? fiberOf(list) : null, d = 0; f && d < 40; f = f.return, d++) {
      if (typeof f.type !== 'function') continue;
      const cur = lsCurrent(f), H = [];
      for (let h = cur.memoizedState, j = 0; h && typeof h === 'object' && 'next' in h && j < 400; h = h.next, j++) H.push(h);
      if (H.some(lsIsCfg)) return H;
    }
    return null;
  }
  // 크랙 SWR 캐시(Map, 전역 하나): SWR 설정 ref(current.cache)
  function lsSwr(H) {
    const h = H && H.find(lsIsCfg);
    return h ? h.memoizedState.current.cache : null;
  }
  // 훅 위치: [x] → rW(… [넣은 개수 ref, 방 ref], 끝 id state, 겹침 state …) → rQ(같은 모양). 쌍이 정확히 2개일 때만 믿는다.
  // {flag: x 훅, ascSeen: rQ '넣은 개수' ref, descOverlap: rW 겹침 훅, descEdge: rW 끝 id(불러온 최신 쪽에서 가장 오래된 메시지)}
  // 최신 쪽 첫 20개는 크랙이 서버에서 그려 넘겨서(SWR fallback) 캐시에 없다 → 끝 id는 rW의 state에서 읽는다
  function lsParts(H, chatId) {
    if (!H) return null;
    const pairs = [];
    for (let x = 0; x + 1 < H.length; x++) if (lsIsRef(H[x]) && typeof H[x].memoizedState.current === 'number' && lsIsRef(H[x + 1]) && H[x + 1].memoizedState.current === chatId) pairs.push(x);
    if (pairs.length !== 2) return null;
    const isState = (h, t) => !!(h && h.queue && typeof h.queue.dispatch === 'function' && typeof h.memoizedState === t);
    let flag = null;
    for (let x = pairs[0] - 1; x >= 0 && !flag; x--) if (isState(H[x], 'boolean')) flag = H[x];
    const edge = H[pairs[0] + 2], ov = H[pairs[0] + 3];
    return { flag, ascSeen: H[pairs[1]].memoizedState, descOverlap: isState(ov, 'boolean') ? ov : null, descEdge: isState(edge, 'string') ? edge.memoizedState : '' };
  }
  // '처음부터 보기' 중이면 rQ의 손잡이: {key, seen: '넣은 개수' ref, overlap: '겹침' setState, mutate: 무한 목록 mutate}. 아니면 null.
  // 키 ref는 꺼진 뒤에도 옛 키가 남을 수 있어(방을 옮긴 직후 등), mutate의 deps[0](지금 키)가 그 키와 같을 때만 켜진 것으로 본다
  function lsAscHooks(H, chatId) {
    if (!H) return null;
    const tag = lsTag(chatId);
    const k = H.findIndex((h) => lsIsRef(h) && typeof h.memoizedState.current === 'string' && h.memoizedState.current.startsWith('$inf$') && h.memoizedState.current.includes(tag) && h.memoizedState.current.includes('sortOrder=asc'));
    if (k < 0) return null;
    const key = H[k].memoizedState.current;
    let i = -1;
    for (let x = k - 1; x > 0 && i < 0; x--) if (lsIsRef(H[x]) && typeof H[x].memoizedState.current === 'number' && lsIsRef(H[x + 1]) && H[x + 1].memoizedState.current === chatId) i = x;
    let mutate = null;
    for (let x = k + 1; x < Math.min(H.length, k + 40) && !mutate; x++) {
      const v = H[x].memoizedState;
      if (!(Array.isArray(v) && typeof v[0] === 'function')) continue;
      const s = String(v[0]);
      if (!(s.includes('_i:') && s.includes('arguments.length') && s.includes('revalidate'))) continue;
      if (!(Array.isArray(v[1]) && v[1][0] === key)) return null;
      mutate = v[0];
    }
    if (i < 0 || !mutate) return null;
    const ov = H[i + 3];
    return { key, seen: H[i].memoizedState, overlap: ov && ov.queue && typeof ov.memoizedState === 'boolean' ? ov.queue.dispatch : null, mutate };
  }
  // 그 방의 '처음부터' 캐시를 지운다(남아 있으면 ^를 눌러도 크랙이 새로 받지 않고 옛 쪽을 다시 쓴다)
  function lsAscForget(cache, chatId) {
    if (!cache) return;
    const tag = lsTag(chatId);
    for (const k of [...cache.keys()]) if (typeof k === 'string' && k.includes(tag) && k.includes('sortOrder=asc')) cache.delete(k);
  }
  // 이미 불러온 최신 쪽(rW) 가운데 가장 오래된 메시지의 번호(c.msgs 기준). 없으면 -1
  function lsDescStart(parts, c) {
    const m = parts && parts.descEdge ? c.byId.get(parts.descEdge) : null;
    return m ? c.msgs.indexOf(m) : -1;
  }
  // 우리 가짜 쪽 표시(cpb-asc-)가 붙은 요청은 언제나 우리가 답한다(이동이 끝났거나 방을 옮겼다 와도 절대 서버로 보내지 않는다). 맨 앞에 둔다
  xhrRespond.unshift({
    test: /\/crack-gen\/v3\/chats\/[^/?#]+\/messages\?[^#]*cursor=cpb-asc-/,
    on: () => true,
    respond: ({ url }) => {
      const u = new URL(url, location.href);
      const id = (u.pathname.match(/\/v3\/chats\/([^/?#]+)\/messages/) || [])[1];
      const c = id ? lsCache.get(id) : null, from = Number((u.searchParams.get('cursor') || '').slice(8));
      const lim = Math.max(1, Math.min(100, Number(u.searchParams.get('limit')) || 20));
      return c && c.raw && from >= 0 ? lsAscPage(c, from, lim) : LS_EMPTY();
    },
  });
  // 이동 중 크랙의 '처음부터' 첫 쪽(커서 없음) 요청: 그 턴부터 준다(한 번만. 나중에 직접 누르는 ^는 진짜 처음부터)
  xhrRespond.push({
    test: /\/crack-gen\/v3\/chats\/[^/?#]+\/messages\?/,
    on: () => !!lsJumpTo && !lsJumpTo.used,
    respond: ({ url }) => {
      const u = new URL(url, location.href);
      const mm = u.pathname.match(/\/v3\/chats\/([^/?#]+)\/messages/);
      if (!mm || !lsJumpTo || lsJumpTo.used || mm[1] !== lsJumpTo.chatId || u.searchParams.get('sortOrder') !== 'asc' || u.searchParams.get('cursor')) return null;
      const c = lsCache.get(mm[1]);
      if (!c || !c.raw) return null;
      lsServed++;
      lsJumpTo.used = true;
      return lsAscPage(c, lsJumpTo.start, Math.max(1, Math.min(100, Number(u.searchParams.get('limit')) || 20)));
    },
  });
  function lsLand(g) {
    // 답변으로 찾았으면 그 턴의 내 메시지부터 보이게(바로 위 같은 턴 질문이 접히지 않게). 같은 역할끼리는 그룹이 갈리므로 바로 위 그룹만 본다
    let a = g;
    if (!isUserMsg(g)) for (let s = g.nextElementSibling; s; s = s.nextElementSibling) {
      if (!s.hasAttribute('data-message-group-id')) continue;
      if (isUserMsg(s)) a = s;
      break;
    }
    foldFocusOn(a); // 그 턴부터 '남길 최근 대화' 턴 수만 펴고 나머지는 접는다(아래로 내리면 더 편다)
    a.scrollIntoView({ block: 'start' });
    if (foldSc) foldTop = foldSc.scrollTop;
    g.classList.remove('cpb-ls-hit');
    void g.offsetWidth;
    g.classList.add('cpb-ls-hit');
    setTimeout(() => g.classList.remove('cpb-ls-hit'), 2400);
    lsClose();
  }
  // 이미 '처음부터 보기' 중일 때 바꿔 넣기: 첫 쪽 캐시를 우리 쪽으로, 쪽 수를 1로, 전에 간 구간은 저장소에서만 빼고, rQ '넣은 개수'를 0으로 → mutate.
  // 돌려주는 값: 실제로 바뀌었는지
  async function lsAscSwap(H, asc, c, chatId, start, descEdge) {
    const page = lsAscPage(c, start, 20), sw = lsSwr(H), tag = lsTag(chatId);
    if (sw) {
      // 첫 쪽 단독 캐시도 같이 바꾼다(다르면 SWR이 다음 쪽을 받을 때 첫 쪽을 진짜로 다시 받는다)
      for (const k of [...sw.keys()]) if (typeof k === 'string' && !k.startsWith('$') && k.includes(tag) && k.includes('sortOrder=asc') && !k.includes('cursor=')) sw.set(k, Object.assign({}, sw.get(k), { data: structuredClone(page) }));
      // 쪽 수도 1로(안 하면 다음 불러오기 때 예전 쪽 수+1만큼 한꺼번에 넣는다)
      if (sw.has(asc.key)) sw.set(asc.key, Object.assign({}, sw.get(asc.key), { _l: 1 }));
    }
    // 전에 간 구간은 화면 목록(크랙 저장소)에서만 뺀다(서버 요청 없음). 남겨 두면 무거워지고, 새 구간 아래에 엉뚱한 구간이 이어 보인다.
    // 최신 쪽(rW 끝 id와 그보다 새 것: 메시지 id는 시간순)은 남긴다. 끝 id를 모르면 지우지 않는다
    const st = chatCtx();
    if (sw && st && st.store && descEdge) {
      const del = st.store.getState().deleteMessage;
      for (const k of [...sw.keys()]) {
        if (typeof k !== 'string' || !k.startsWith('$inf$') || !k.includes(tag) || !k.includes('sortOrder=asc')) continue;
        const pages = (sw.get(k) || {}).data;
        if (Array.isArray(pages) && typeof del === 'function') for (const p of pages) for (const x of (p && p.data && p.data.messages) || []) if (x && x._id && x._id < descEdge) del(x._id);
      }
    }
    asc.seen.current = 0;
    if (asc.overlap) asc.overlap(false);
    try { await asc.mutate([structuredClone(page)], false); } catch (_) { return false; }
    // mutate는 지금 키가 아니면 아무것도 안 하고 끝난다 → 캐시가 정말 우리 쪽인지 본다
    const now = sw ? (sw.get(asc.key) || {}).data : null, first = page.data.messages[0];
    if (!sw || !first) return true;
    const got = Array.isArray(now) && now[0] && now[0].data && Array.isArray(now[0].data.messages) ? now[0].data.messages[0] : null;
    return !!got && got._id === first._id;
  }
  async function lsGo(id) {
    const c = lsCache.get(lsUI.chatId), m = c && c.byId.get(id);
    if (!m) return;
    const seen = new WeakSet();
    let g = lsFindGroup(m, seen);
    if (g) return lsLand(g); // 이미 화면에 있으면 바로
    if (!c.raw) return lsTrace(id); // 원본이 없으면(다른 방 기록) 예전 방식
    let start = c.msgs.indexOf(m);
    while (start > 0 && c.msgs[start - 1].turn === m.turn) start--; // 그 턴의 처음부터
    const chatId = lsUI.chatId, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // 모든 길이 막혔을 때만(크랙 화면 구조가 바뀐 경우): 새로고침한 뒤 자동으로 다시. 새로고침 뒤에도 안 되면 멈춘다(무한 새로고침 방지)
    const again = () => {
      if (lsUI.resumed) { toast('그 턴으로 가지 못했어요', { key: 'ls' }); return; }
      try { sessionStorage.setItem('crack-pc-base:ls:go', JSON.stringify({ chatId, id, at: Date.now() })); } catch (_) { /* 저장 불가 */ }
      lsStatus('새로고침한 뒤 그 턴으로 가요…');
      location.reload();
    };
    const H = lsChatHooks(), parts = lsParts(H, chatId), sw = lsSwr(H);
    // 이미 불러온 최신 쪽과 겹치거나 맞닿으면: 우리 쪽이 그 바로 위에서 끝나게 당긴다(목표는 그대로 그 쪽 안). 안 그러면 크랙의
    // '이전 쪽 불러오기'가 실제 요청을 보내고, 목표보다 오래된 메시지가 목표 구간 아래에 끼어든다
    const edge = (parts && parts.descEdge) || '', d = lsDescStart(parts, c), abut = d > 0 && start + 20 >= d;
    if (abut) start = Math.max(0, d - 20);
    lsJumpTo = { chatId, start, used: false };
    if (sw) lsJumpCache = { chatId, cache: sw };
    lsStatus('그 턴으로 가는 중…');
    const asc = lsAscHooks(H, chatId);
    if (asc) { // 이미 '처음부터 보기' 중
      lsJumpTo.used = true;
      if (!(await lsAscSwap(H, asc, c, chatId, start, edge))) return again();
    } else {
      lsAscForget(sw, chatId);
      const served = lsServed;
      if (parts && parts.flag && parts.flag.memoizedState === false) { // ^를 누른 것과 같다(버튼·스크롤·클릭 통계 없이 켜짐 값만)
        parts.ascSeen.current = 0;
        parts.flag.queue.dispatch(true);
        for (let k = 0; k < 50 && lsServed === served; k++) await wait(30);
        if (lsServed === served) { // 켜졌는데 요청이 없었다(캐시가 남아 있던 경우 등) → 켜진 상태에서 바꿔 넣기
          const H2 = lsChatHooks(), a2 = lsAscHooks(H2, chatId);
          lsJumpTo.used = true;
          if (!a2 || !(await lsAscSwap(H2, a2, c, chatId, start, edge))) return again();
        }
      } else { // 켜짐 값을 못 찾았을 때만: 크랙의 ^ 버튼을 대신 누른다
        let b = lsTopBtn();
        for (let k = 0; k < 12 && !b; k++) { // ^ 버튼은 맨 아래에서 조금 올라가 있을 때만 나온다
          const sc = lsScroller();
          if (sc) sc.scrollTop = Math.max(0, sc.scrollHeight - sc.clientHeight - 1500);
          await wait(150);
          b = lsTopBtn();
        }
        if (b) {
          b.click();
          for (let k = 0; k < 10 && lsServed === served; k++) await wait(100);
        }
        // 그래도 크랙이 받지 않았다: 새로고침 없이 예전 방식(위로 불러 올라가며 찾기). ^가 눌렸으면 '처음부터 보기'라 이 방식이 안 돼 새로고침
        if (lsServed === served) { if (b) return again(); lsJumpTo = null; return lsTrace(id); }
      }
    }
    // 맞닿았으면 크랙의 '이전 쪽 불러오기'(rW 위쪽 감지 칸)를 끈다: 그 위는 우리 쪽이라 받을 게 없다(요청 0)
    if (abut && parts && parts.descOverlap) parts.descOverlap.queue.dispatch(true);
    for (let k = 0; k < 80 && !(g = lsFindGroup(m, seen)); k++) await wait(50);
    if (g) lsLand(g); else again();
  }
  // 이동 뒤 같은 방에서 크랙 ^: 크랙은 이미 '처음부터 보기'라 스크롤만 해서 이동한 구간 맨 위에 멈춘다 → 진짜 처음(첫 메시지)을 바꿔 넣는다(요청 0)
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !lsJumpTo || lsJumpTo.chatId !== roomId()) return;
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b || !isCrackBtn(b, CRACK_TOP_D)) return;
    const c = lsCache.get(lsJumpTo.chatId);
    if (!c || !c.raw || !c.msgs.length || !lsAscHooks(lsChatHooks(), lsJumpTo.chatId)) return;
    e.preventDefault();
    e.stopPropagation();
    lsUI.chatId = lsJumpTo.chatId;
    lsGo(c.msgs[0]._id).catch(() => null);
  }, true);
  async function lsResume() {
    let v = null;
    try { v = JSON.parse(sessionStorage.getItem('crack-pc-base:ls:go') || 'null'); } catch (_) { v = null; }
    if (!v) return;
    try { sessionStorage.removeItem('crack-pc-base:ls:go'); } catch (_) { /* 무시 */ }
    if (v.chatId !== roomId() || Date.now() - v.at > 60000) return;
    lsUI.chatId = v.chatId;
    try { await lsLoad(v.chatId); } catch (_) { return; }
    lsUI.chatId = v.chatId;
    lsUI.resumed = true;
    try { await lsGo(v.id); } finally { lsUI.resumed = false; }
  }
  on('route', () => {
    const now = roomId();
    if (lsJumpTo && lsJumpTo.chatId !== now) lsJumpTo = null;
    if (lsJumpCache && lsJumpCache.chatId !== now) { lsAscForget(lsJumpCache.cache, lsJumpCache.chatId); lsJumpCache = null; }
    if (lsUI.open && now !== lsUI.chatId) lsClose();
    setTimeout(() => attempt(lsResume), 2500);
  });
  const LS_CSS = `
#cpb-ls{position:fixed;top:72px;right:24px;z-index:2147482990;display:flex;flex-direction:column;width:min(440px,calc(100vw - 48px));height:min(640px,calc(100vh - 120px));border:1px solid var(--outline_tertiary,rgba(128,128,128,.22));border-radius:14px;background:var(--bg_screen,#fff);color:var(--text_primary,#1a1918);box-shadow:0 18px 48px rgba(0,0,0,.28);font-size:13px;overflow:hidden}
#cpb-ls[hidden]{display:none}
#cpb-ls .hd{display:flex;align-items:center;gap:8px;padding:12px 12px 8px 16px;cursor:grab;user-select:none;touch-action:none}
#cpb-ls.drag{transition:none!important;box-shadow:0 18px 50px rgba(0,0,0,.28)}
#cpb-ls.drag .hd{cursor:grabbing}
#cpb-ls .hd b{font-size:14px;font-weight:700}
#cpb-ls .st{flex:1;min-width:0;font-size:12px;color:var(--text_tertiary,#85837d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cpb-ls button{font:inherit;color:inherit;cursor:pointer}
#cpb-ls .x,#cpb-ls .nv{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:none;color:var(--text_tertiary,#85837d)}
#cpb-ls .x:hover,#cpb-ls .nv:hover{background:var(--state_hover,rgba(128,128,128,.12));color:var(--text_primary,#1a1918)}
#cpb-ls .x svg,#cpb-ls .nv svg{width:16px;height:16px}
#cpb-ls .nv:disabled{opacity:.35;cursor:default;background:none}
#cpb-ls .bar{padding:0 12px 8px;border-bottom:1px solid var(--outline_tertiary,rgba(128,128,128,.18))}
#cpb-ls .box{display:flex;align-items:center;gap:8px;height:36px;padding:0 10px;border:1px solid var(--outline_tertiary,rgba(128,128,128,.25));border-radius:10px;background:color-mix(in srgb,var(--text_primary,#1a1918) 4%,transparent)}
#cpb-ls .box svg{width:16px;height:16px;flex:none;color:var(--text_tertiary,#85837d)}
#cpb-ls .box input{flex:1;min-width:0;border:0;outline:0;background:none;color:inherit;font:inherit;font-size:13.5px}
#cpb-ls .chips{display:flex;align-items:center;gap:4px;margin-top:8px}
#cpb-ls .chips button{height:26px;padding:0 10px;border:1px solid var(--outline_tertiary,rgba(128,128,128,.25));border-radius:999px;background:none;font-size:12px;color:var(--text_secondary,#61605a)}
#cpb-ls .chips button[aria-pressed="true"]{border-color:var(--text_primary,#1a1918);color:var(--text_primary,#1a1918);font-weight:600}
#cpb-ls .chips .sp{flex:1}
#cpb-ls .list{flex:1;min-height:0;overflow-y:auto;padding:6px}
#cpb-ls .it{display:flex;flex-direction:column;gap:4px;width:100%;padding:9px 10px;border:0;border-radius:10px;background:none;text-align:left;content-visibility:auto;contain-intrinsic-size:auto 72px}
#cpb-ls .it:hover{background:var(--state_hover,rgba(128,128,128,.12))}
#cpb-ls .mt{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text_tertiary,#85837d)}
#cpb-ls .mt b{padding:1px 6px;border-radius:5px;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--text_primary,#1a1918) 8%,transparent);color:var(--text_secondary,#61605a)}
#cpb-ls .mt b.u{background:color-mix(in srgb,var(--surface_brand_primary,#ff4432) 14%,transparent);color:var(--surface_brand_primary,#ff4432)}
#cpb-ls .mt i{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums}
#cpb-ls .sn{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5;color:var(--text_secondary,#61605a)}
#cpb-ls mark{padding:0 1px;border-radius:3px;background:color-mix(in srgb,#ffd54a 55%,transparent);color:inherit}
#cpb-ls .more{display:block;width:100%;margin:6px 0;padding:8px;border:0;border-radius:10px;background:color-mix(in srgb,var(--text_primary,#1a1918) 5%,transparent);font-size:12.5px}
#cpb-ls .em{padding:24px 12px;text-align:center;color:var(--text_tertiary,#85837d)}
#cpb-ls .em button{margin-left:6px;padding:4px 10px;border:1px solid var(--outline_tertiary,rgba(128,128,128,.3));border-radius:8px;background:none}
#cpb-ls .det{flex:1;min-height:0;display:flex;flex-direction:column}
#cpb-ls .det[hidden]{display:none}
#cpb-ls .dh{display:flex;align-items:center;gap:4px;padding:8px 10px;border-bottom:1px solid var(--outline_tertiary,rgba(128,128,128,.18))}
#cpb-ls [data-back]{display:inline-flex;align-items:center;gap:2px;height:28px;padding:0 8px 0 4px;border:0;border-radius:8px;background:none;color:var(--text_secondary,#61605a)}
#cpb-ls [data-back]:hover{background:var(--state_hover,rgba(128,128,128,.12))}
#cpb-ls [data-back] svg{width:16px;height:16px}
#cpb-ls .dm{flex:1;min-width:0;font-size:12px;color:var(--text_tertiary,#85837d);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#cpb-ls .dt{flex:1;min-height:0;overflow-y:auto;padding:6px 10px;overscroll-behavior:contain}
#cpb-ls .lm{margin:6px 0;padding:10px 12px;border:1px solid transparent;border-radius:12px;cursor:pointer}
#cpb-ls .lm.u{background:color-mix(in srgb,var(--surface_brand_primary,#ff4432) 7%,transparent)}
#cpb-ls .lm.a{background:color-mix(in srgb,var(--text_primary,#1a1918) 4%,transparent)}
#cpb-ls .lm.cur{border-color:var(--surface_brand_primary,#ff4432)}
#cpb-ls .lh{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11.5px;color:var(--text_tertiary,#85837d)}
#cpb-ls .lh b{padding:1px 6px;border-radius:5px;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--text_primary,#1a1918) 8%,transparent);color:var(--text_secondary,#61605a)}
#cpb-ls .lm.u .lh b{background:color-mix(in srgb,var(--surface_brand_primary,#ff4432) 14%,transparent);color:var(--surface_brand_primary,#ff4432)}
#cpb-ls .lh i{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums}
#cpb-ls .lt{white-space:pre-wrap;word-break:break-word;line-height:1.65;font-size:13.5px;cursor:text}
#cpb-ls .df{display:flex;justify-content:flex-end;gap:6px;padding:10px 12px;border-top:1px solid var(--outline_tertiary,rgba(128,128,128,.18))}
#cpb-ls .df button{height:32px;padding:0 14px;border:1px solid var(--outline_tertiary,rgba(128,128,128,.3));border-radius:9px;background:none;font-size:12.5px}
#cpb-ls .df .pri{border-color:transparent;background:var(--text_primary,#1a1918);color:var(--bg_screen,#fff);font-weight:600}
[data-message-group-id].cpb-ls-hit{animation:cpb-ls-hit 2.4s ease}
@keyframes cpb-ls-hit{0%,40%{box-shadow:0 0 0 2px var(--surface_brand_primary,#ff4432);border-radius:12px}100%{box-shadow:0 0 0 2px transparent}}
@media (prefers-reduced-motion: reduce){[data-message-group-id].cpb-ls-hit{animation:none;box-shadow:0 0 0 2px var(--surface_brand_primary,#ff4432)}}
`;
  cssAdd('logsearch', LS_CSS);

  // ── 시작 ──────────────────────────────────────────────
  try { if (localStorage.getItem(OLD_PINS_KEY) !== null) localStorage.removeItem(OLD_PINS_KEY); } catch (_) { /* 저장소 없음 */ }
  cssAdd('base', BASE_CSS);
  cssAdd('base:zones', zoneCss());
  siteCss('toast', TOAST_CSS);
  siteCss('chatlist', CHATLIST_CSS);
  siteMount();
  register({
    id: 'cpb-chatlist',
    label: '채팅 목록',
    icon: CHATLIST_ICON,
    order: 1.8,
    children: [
      { id: 'on', label: '채팅 목록 기능 (왼쪽 사이드바, 모든 화면)', toggle: { get: () => clOn('on'), set: (v) => settings.set('chatlist.on', !!v) } },
      { id: 'resize', label: '보관함 칸 높이 조절 (구분선 끌기)', toggle: { get: () => clOn('resize'), set: (v) => settings.set('chatlist.resize', !!v) } },
      { id: 'current', label: '지금 방 강조', toggle: { get: () => clOn('current'), set: (v) => settings.set('chatlist.current', !!v) } },
      { id: 'color', label: '방 색 표시 (방 ⋯ 메뉴의 색 점)', toggle: { get: () => clOn('color'), set: (v) => settings.set('chatlist.color', !!v) } },
      { id: 'rightClick', label: '방 줄 우클릭으로 방 메뉴 열기', toggle: { get: () => clOn('rightClick'), set: (v) => settings.set('chatlist.rightClick', !!v) } },
      { id: 'countArchive', label: "'보관함' 옆 채팅방 수", toggle: { get: () => clOn('countArchive'), set: (v) => settings.set('chatlist.countArchive', !!v) } },
      { id: 'countRoot', label: "'채팅 목록' 옆 채팅방 수 (검색·한눈에 보기를 한 번 열면)", toggle: { get: () => clOn('countRoot'), set: (v) => settings.set('chatlist.countRoot', !!v) } },
      { id: 'search', label: '방 찾기 (사이드바 검색 줄)', toggle: { get: () => clOn('search'), set: (v) => settings.set('chatlist.search', !!v) } },
      { id: 'overview', label: '한눈에 보기 (넓은 창)', toggle: { get: () => clOn('overview'), set: (v) => settings.set('chatlist.overview', !!v) } },
      { id: 'multi', label: '한눈에 보기에서 여러 방 옮기기', toggle: { get: () => clOn('multi'), set: (v) => settings.set('chatlist.multi', !!v) } },
      { id: 'dense', label: '한눈에 보기 촘촘히 보기', toggle: { get: () => ovView() === 'dense', set: (v) => settings.set('chatlist.view', v ? 'dense' : 'grid') } },
      { id: 'ovOpen', label: '한눈에 보기 열기', onClick: () => ovOpen() },
      { id: 'smart', label: "'같은 이름 보관함에 합치기' (채팅 목록 ⋯ 메뉴)", toggle: { get: () => clOn('smart'), set: (v) => settings.set('chatlist.smart', !!v) } },
      { id: 'smartSingle', label: '합치기 때 1개짜리 방도 찾기 (불러온 방 목록으로)', toggle: { get: () => mgSingleOn(), set: (v) => settings.set('chatlist.smartSingle', !!v) } },
    ],
  });
  register({ id: 'cpb-branch', label: '갈래 지도', icon: BM_MENU_ICON, order: 1.85, children: bmMenuChildren() });
  register({ id: 'cpb-logsearch', label: '로그 검색', icon: LS_ICON, order: 1.9, children: [
    { id: 'open', label: '로그 검색 열기 (지금 방 전체 대화에서 찾기)', onClick: () => lsOpen() },
    { id: 'on', label: '로그 검색', toggle: { get: () => lsOn('on'), set: (v) => settings.set('logsearch.on', !!v) } },
  ] });
  on('route', () => { side.tries = 0; sideEval(); setTimeout(brArrive, 600); });
  on('chatindex', () => sideSoon());
  on('settings', () => { if (side.root) sideSoon(); else sideEval(); });
  register({
    id: 'cpb-layout',
    label: '레이아웃',
    icon: LAYOUT_ICON,
    order: 0,
    layoutOnly: true,
    children: [
      { id: 'top', label: '상단 헤더 자동 숨김', toggle: { get: () => autoHide('top'), set: (v) => settings.set('autoHide.top', !!v) } },
      { id: 'bar', label: '모델 선택 바 자동 숨김', toggle: { get: () => autoHide('bar'), set: (v) => settings.set('autoHide.bar', !!v) } },
      { id: 'left', label: '좌측 자동 숨김', toggle: { get: () => autoHide('left'), set: (v) => settings.set('autoHide.left', !!v) } },
      { id: 'right', label: '우측 자동 숨김', toggle: { get: () => autoHide('right'), set: (v) => settings.set('autoHide.right', !!v) } },
    ],
  });
  register({
    id: 'cpb-chat',
    label: '채팅',
    icon: CHAT_ICON,
    order: 1,
    layoutOnly: true,
    children: [
      { id: 'lock', label: '답변 완성 때 자동 스크롤 막기', toggle: { get: () => perfOn('scrollLock'), set: (v) => settings.set('perf.scrollLock', !!v) } },
      { id: 'rs', label: '화면 밖 메시지 그리기 생략', toggle: { get: () => perfOn('renderSkip'), set: (v) => settings.set('perf.renderSkip', !!v) } },
      { id: 'fold', label: '오래된 대화 숨기기', toggle: { get: () => perfOn('fold'), set: (v) => settings.set('perf.fold', !!v) } },
      { id: 'keep', label: '남길 최근 대화', stepper: { get: foldKeep, set: (v) => settings.set('perf.keep', v), min: KEEP.min, max: KEEP.max, step: keepStep, format: (v) => v + '턴' } },
    ],
  });
  register({
    id: 'cpb-input',
    label: '입력창',
    icon: INPUT_ICON,
    order: 1.5,
    children: [
      { id: 'counter', label: '글자수 표시', toggle: { get: () => inputOn('counter'), set: (v) => settings.set('input.counter', !!v) } },
      { id: 'expand', label: '넘치면 펼치기 버튼', toggle: { get: () => inputOn('expand'), set: (v) => settings.set('input.expand', !!v) } },
      { id: 'draft', label: '임시저장 (방마다 자동 저장·복구)', toggle: { get: () => inputOn('draft'), set: (v) => settings.set('input.draft', !!v) } },
      { id: 'emptyGuard', label: '빈 입력 전송 막기 (스토리 자동 진행 방지)', toggle: { get: () => inputOn('emptyGuard'), set: (v) => settings.set('input.emptyGuard', !!v) } },
      { id: 'hideHint', label: '엔딩 힌트 버튼 숨기기', toggle: { get: () => inputOn('hideHint'), set: (v) => settings.set('input.hideHint', !!v) } },
      { id: 'wrap', label: '감싸기 도구', toggle: { get: () => wrapConf().enabled, set: (v) => settings.set('wrap.enabled', !!v) } },
      { id: 'wrapWin', label: '감싸기 도구 설정 열기', onClick: () => wrapOpenWin() },
    ],
  });
  register({
    id: 'cpb-msg',
    label: '메시지 옆 표시',
    icon: MSG_ICON,
    order: 1.6,
    children: [
      { id: 'chars', label: '글자수', toggle: { get: () => msgOn('chars'), set: (v) => settings.set('msg.chars', !!v) } },
      { id: 'time', label: '생성 시각', toggle: { get: () => msgOn('time'), set: (v) => settings.set('msg.time', !!v) } },
      { id: 'cost', label: '답변별 크래커 (설치 뒤 생성분부터)', toggle: { get: () => msgOn('cost'), set: (v) => settings.set('msg.cost', !!v) } },
      { id: 'model', label: '답변 모델 아이콘', toggle: { get: () => msgOn('model'), set: (v) => settings.set('msg.model', !!v) } },
      { id: 'user', label: '사용자 메시지에도 표시', toggle: { get: () => msgOn('user'), set: (v) => settings.set('msg.user', !!v) } },
    ],
  });
  // 모델 메뉴: 통계 카드·숨기기 스위치 + 모델마다 '보이기' 스위치(크랙 모델 목록에서 자동으로 채움)
  function modelMenuChildren() {
    const kids = [
      { id: 'stats', label: '모델별 통계 카드 (우측 메뉴)', toggle: { get: () => modelOn('stats'), set: (v) => settings.set('models.stats', !!v) } },
      { id: 'reset', label: '이 방 모델 통계 비우기', onClick: () => toast('한 번 더 누르면 이 방 모델 통계를 비워요', { key: 'mstats', duration: 5000, onClick: () => {
        const s = mstatsRead(); delete s.rooms[roomId()]; writeJSON(MSTATS_KEY, s); statsSoon(0); toast('이 방 모델 통계를 비웠어요', { key: 'mstats' });
      } }) },
      { id: 'hide', label: '숨긴 모델 가리기 (모델 선택창·답변 길이 창)', toggle: { get: () => modelOn('hide'), set: (v) => settings.set('models.hide', !!v) } },
    ];
    for (const t of Object.keys(models)) {
      const mi = models[t];
      if (mi.dead) continue; // 서비스 종료 모델은 크랙 창에 안 나오니 숨기기 목록에서 뺀다
      const img = document.createElement('img');
      img.src = mi.icon;
      img.alt = '';
      kids.push({ id: 'm:' + t, label: mi.name + (mi.engine ? ' · ' + mi.engine : ''), icon: img, toggle: { get: () => !modelHidden().has(t), set: (v) => modelSetHidden(t, !v) } });
    }
    return kids;
  }
  const modelMenu = register({ id: 'cpb-models', label: '모델', icon: MODEL_ICON, order: 1.7, children: modelMenuChildren() });
  // 대시보드: 전체 · 줄 · 버튼 하나하나 · 숫자 하나하나 켜고 끄기
  const dashBtnItem = (k, label) => ({ id: 'b:' + k, label, toggle: { get: () => dashBtnOn(k), set: (v) => settings.set('dash.btn.' + k, !!v) } });
  const dashInfoItem = (k, label) => ({ id: 'i:' + k, label, toggle: { get: () => dashInfoOn(k), set: (v) => settings.set('dash.info.' + k, !!v) } });
  register({
    id: 'cpb-dash',
    label: '대시보드',
    icon: DASH_ICON,
    order: 1.55,
    children: [
      { id: 'on', label: '대시보드 (입력창 위 두 줄)', toggle: { get: () => dashOn('on'), set: (v) => settings.set('dash.on', !!v) } },
      dashBtnItem('model', '모델 버튼 (빠른 선택)'),
      ...DASH_BTNS.map((x) => dashBtnItem(x.k, x.label + ' 바로가기')),
      dashBtnItem('theme', '테마 버튼 (라이트/다크)'),
      dashBtnItem('layout', '작품 화면 버튼 (소설형/채팅형)'),
      dashBtnItem('logsearch', '로그 검색 버튼'),
      ...DASH_EXT.map((x) => dashBtnItem(x.k, '다른 확장: ' + x.label + ' (켜져 있을 때만 보임)')),
      { id: 'row2', label: '정보 줄', toggle: { get: () => dashOn('row2'), set: (v) => settings.set('dash.row2', !!v) } },
      dashInfoItem('turns', '진행 턴'),
      dashInfoItem('total', '이 방 누적 크래커 (설치 뒤 생성분)'),
      dashInfoItem('balance', '잔여 크래커 (남은 턴 추정)'),
      dashInfoItem('last', '직전 차감'),
    ],
  });
  register({
    id: 'cpb-tools',
    label: '메시지 메뉴·수정창',
    icon: TOOLS_ICON,
    order: 1.65,
    children: [
      { id: 'rightClick', label: '메시지 우클릭으로 메뉴 열기 (Shift+우클릭은 브라우저 메뉴)', toggle: { get: () => toolOn('rightClick'), set: (v) => settings.set('tools.rightClick', !!v) } },
      { id: 'copy', label: "메시지 메뉴에 '복사' 추가", toggle: { get: () => toolOn('copy'), set: (v) => settings.set('tools.copy', !!v) } },
      { id: 'pasteFix', label: '수정창 붙여넣기 줄바꿈 그대로', toggle: { get: () => toolOn('pasteFix'), set: (v) => settings.set('tools.pasteFix', !!v) } },
      { id: 'cleaner', label: "메시지 메뉴에 '반복 표현 정리' 추가 (바로 저장)", toggle: { get: () => toolOn('cleaner'), set: (v) => settings.set('tools.cleaner', !!v) } },
      { id: 'cleanerEdit', label: "크랙 수정창에 '반복 표현 정리' 버튼", toggle: { get: () => toolOn('cleanerEdit'), set: (v) => settings.set('tools.cleanerEdit', !!v) } },
      { id: 'multiDelete', label: "메시지 메뉴에 '여러 개 지우기' 추가", toggle: { get: () => toolOn('multiDelete'), set: (v) => settings.set('tools.multiDelete', !!v) } },
      { id: 'variantDelete', label: "메시지 메뉴에 '다른 답변 지우기' 추가 (답변 비교가 있을 때)", toggle: { get: () => toolOn('variantDelete'), set: (v) => settings.set('tools.variantDelete', !!v) } },
    ],
  });
  register({
    id: 'cpb-reroll',
    label: '다시 생성',
    icon: REROLL_ICON,
    order: 1.66,
    children: [
      { id: 'hold', label: '최신 답변 길게 눌러 다시 생성', toggle: { get: () => rrOn('hold'), set: (v) => settings.set('reroll.hold', !!v) } },
      { id: 'skipInstr', label: '재생성 지침 창 건너뛰기 (바로 다시 생성)', toggle: { get: () => rrFlag('skipInstr'), set: (v) => settings.set('reroll.skipInstr', !!v) } },
      { id: 'guard', label: '다시 생성 버튼은 길게 눌러야 동작', toggle: { get: () => rrFlag('guard'), set: (v) => settings.set('reroll.guard', !!v) } },
      { id: 'compareNav', label: '답변 비교 좌우 넘기기 (답변 옆 화살표)', toggle: { get: () => rrOn('compareNav'), set: (v) => settings.set('reroll.compareNav', !!v) } },
    ],
  });
  radMenu = register({ id: 'cpb-radio', label: '라디오존데', icon: RADAR_ICON, order: 1.75, children: radMenuChildren() });
  register({
    id: 'cpb-vault',
    label: '이미지 보관함',
    icon: VAULT_ICON,
    order: 1.78,
    children: [
      { id: 'on', label: '탭마다 이미지 한 번에 다 불러오기 (중간 멈춤·중복 없음)', toggle: { get: () => vaultOn('on'), set: (v) => settings.set('vault.on', !!v) } },
      { id: 'collectedFirst', label: '해금한 이미지 먼저 보기', toggle: { get: () => vaultOn('collectedFirst'), set: (v) => settings.set('vault.collectedFirst', !!v) } },
      { id: 'fixCount', label: '해금 수 바로잡기 (보관함을 열 때 실제로 세기)', toggle: { get: () => vaultOn('fixCount'), set: (v) => settings.set('vault.fixCount', !!v) } },
    ],
  });
  on('route', () => vaultCache.clear());
  on('settings', () => vaultCache.clear());
  on('composer', () => radRender());
  on('route', () => setTimeout(radRender, 300));
  on('models', () => { radRender(); radMenuUpdate(); });
  on('settings', () => radRender());
  on('composer', () => dashSoon(0));
  on('models', () => dashSoon(100));
  on('route', () => { pickClose(); dashSoon(300); setTimeout(() => dashSoon(0), 1800); setTimeout(() => dashSoon(0), 5000); }); // 다른 확장은 늦게 붙으니 조금 뒤 다시 본다
  on('regions', () => dashSoon(200));
  on('settings', () => dashSoon(50));
  on('models', () => { modelMenu.update({ children: modelMenuChildren() }); modelHideCss(); statsSoon(100); });
  on('regions', () => statsSoon(200));
  on('route', () => statsSoon(400));
  attempt(mstatsMigrate);
  modelHideCss();
  attempt(wrapMigrate);
  document.addEventListener('selectionchange', onWrapSelChange);
  document.addEventListener('mousedown', onWrapDown, true);
  document.addEventListener('keydown', onWrapKey, true);
  for (const t of ['pointerdown', 'mousedown', 'click']) document.addEventListener(t, onGuardPointer, true);
  document.addEventListener('keydown', onGuardKey, true);
  on('composer', () => { inputRender(); if (cmp.el) draftEnter(); });
  on('composer:change', () => { inputRender(); onDraftChange(); });
  on('composer:send', onDraftSend);
  on('route', () => { if (cmp.el) draftEnter(); });
  window.addEventListener('pagehide', draftFlush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) draftFlush(); });
  setTimeout(draftCleanup, 10000);
  register({
    id: 'cpb-notify',
    label: '알림',
    icon: BELL_ICON,
    order: 2,
    layoutOnly: true,
    children: [
      { id: 'done', label: '답변 완성 알림 (다른 탭에 있을 때)', toggle: { get: () => noteOn('done'), set: (v) => settings.set('notify.done', !!v) } },
      { id: 'doneSound', label: '답변 완성 소리', toggle: { get: () => noteOn('doneSound'), set: (v) => settings.set('notify.doneSound', !!v) } },
      { id: 'summary', label: '요약 메모리 업데이트 알림', toggle: { get: () => noteOn('summary'), set: (v) => settings.set('notify.summary', !!v) } },
      { id: 'settings', label: '설정 변경 알림', toggle: { get: () => noteOn('settings'), set: (v) => settings.set('notify.settings', !!v) } },
      { id: 'crack', label: '크랙 새 알림 (팔로우·좋아요·댓글 등)', toggle: { get: () => noteOn('crack'), set: (v) => settings.set('notify.crack', !!v) } },
      { id: 'attend', label: '출석 버튼 (안 했을 때만, 누르면 바로 출석)', toggle: { get: () => noteOn('attend'), set: (v) => settings.set('notify.attend', !!v) } },
    ],
  });
  on('settings', () => renderMenu());

  window.CrackPcBase = api;
  hookHistory();
  if (mql.addEventListener) mql.addEventListener('change', evaluate); else if (mql.addListener) mql.addListener(evaluate);
  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS_KEY) { conf = deepMerge(DEFAULTS, readJSON(SETTINGS_KEY)); settingsChanged('*'); }
  });
  setInterval(tick, 1000);
  xhrWatch.push({ test: /\/crack-api\/alarm\/check(?:\?|$)/, fn: onAlarmCheck });
  xhrWatch.push({ test: /\/crack-cash\/attendance(?:\?|$)/, fn: onAttendXhr });
  xhrWatch.push({ test: /\/crack-gen\/v3\/chat-models\?/, fn: onModelsXhr });
  // 잔여 크래커를 안 보이면 잔액 응답을 읽지 않고, 다시 켜면 새로 묻도록 값을 비운다
  const balWanted = () => dashOn('on') && dashInfoOn('balance');
  xhrWatch.push({ test: /\/crack-cash\/cash(?:\?|$)/, on: balWanted, fn: onCashXhr });
  on('settings', () => { if (!balWanted()) { balance = null; balAsked = false; } });
  xhrWatch.push({ test: /\/crack-gen\/v3\/chats\/[^/]+\/messages\/[^/?#]+/, fn: onMsgXhr });
  document.addEventListener('click', onMsgClick, true);
  attempt(hookXhr);
  setTimeout(() => { alarmFirstCheck(); attendCheck(); }, 3000);
  on('route', () => { attendCheck(); if (page) alarmFirstCheck(); }); // 둘 다 문서당 한 번만 묻는다(attendCheck는 이미 물었으면 그리기만)
  on('settings', () => attendCheck()); // 홈에서도(다른 탭에서 출석 버튼을 켜고 끈 경우)
  window.addEventListener('focus', onBack);
  document.addEventListener('visibilitychange', onBack);
  // 준비 신호를 첫 판단보다 먼저 보내서, ready에서 구독한 모듈도 첫 'route'/'regions'를 받게 한다
  attempt(() => window.dispatchEvent(new CustomEvent('crack-pc-base:ready', { detail: api })));
  evaluate();
})();
