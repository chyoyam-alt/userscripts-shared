// ==UserScript==
// @name         🗃️ Crack Archive (기록보관소)
// @namespace    https://chatgpt.local/coa
// @version      5.8.6
// @description  크랙 OOC·로그 저장, 메시지 범위 저장, 검색, 즐겨찾기, 백업과 HTML·PNG·DC 내보내기를 위한 아카이브
// @author       Crack Archive
// @downloadURL  https://gist.github.com/chyoyam-alt/4ae1c7902ab15f5fce867bbf8b8ecae3/raw/COA.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/4ae1c7902ab15f5fce867bbf8b8ecae3/raw/COA.user.js
// @match        https://crack.wrtn.ai/*
// @match        https://crack.wrtn.ai/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM_xmlhttpRequest
// @connect      crack-api.wrtn.ai
// @connect      wrtn-image-ai-character.static.wrtn.ai
// @connect      d394jeh9729epj.cloudfront.net
// @connect      p4m.uk
// @connect      fonts.googleapis.com
// @connect      fonts.gstatic.com
// @connect      cdn.jsdelivr.net
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/marked@18.0.5/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.4.11/dist/purify.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/modern-screenshot@4.7.0/dist/index.js
// ==/UserScript==

(() => {
  'use strict';

  const COA_VERSION = '5.8.6';
  const COA_EXPORT_MAX_WIDTH = 840;
  const COA_PNG_MAX_HEIGHT = 30000;
  const COA_PNG_SPLIT_SOFT_HEIGHT = 28500;
  const COA_PNG_DOWNLOAD_DELAY = 180;

  // 유지보수 메모: 사용자에게 보이는 이름은 "Crack Archive"다.
  // 저장 키, DOM/CSS 접두사, 공개 디버그 API, 콘솔 태그의 `COA`는 기존 데이터·패치 호환을 위해 유지한다.

  const COA_CHAT_API = Object.freeze({
    base: 'https://crack-api.wrtn.ai/crack-gen/v3',
    pageSize: 300,
    hardLimit: 20000,
    retryCount: 3,
    retryDelay: 900,
    paginationDelay: 120,
  });


  const ARCHIVE_TYPES = Object.freeze(['ooc', 'log']);
  const ARCHIVE_LABELS = Object.freeze({
    ooc: 'OOC',
    log: '로그',
  });

  const CONTENT_FORMATS = Object.freeze(['markdown', 'html', 'text']);

  const STORAGE = Object.freeze({
    CARD_PREFIX: 'coa:card:',
    INDEX: 'coa:index',
    SETTINGS: 'coa:settings',
    LS_PREFIX: '__coa_tm_fallback__:',
  });

  const DEFAULT_SETTINGS = Object.freeze({
    theme: 'auto',
    viewMode: 'card',
    sortBy: 'created',
    sortDirection: 'down',
    exportReplacements: [],
  });
  const VIEWER_SORTS = Object.freeze({
    created: { label: '저장일순' },
    updated: { label: '수정일순' },
    title: { label: '제목순' },
  });
  let coaIndexRuntimeCache = [];
  let coaIndexRuntimeCacheReady = false;
  let coaStorageAPI = null;
  let coaStorageAPIResolved = false;
  const COA_SEARCH_CORPUS_CACHE_LIMIT = 3_000_000;
  const coaSearchCorpusCache = new Map();
  let coaSearchCorpusCacheSize = 0;



  // DC 공통 인라인 팔레트. 현재는 비테마 본문 변환과 구버전 외부 호출의 안전한 기본값으로만 사용한다.
  // 실제 OOC 문서/로그 테마는 아래 전용 레지스트리와 팔레트에서 별도로 관리한다.
  const DC_THEME_INLINE = Object.freeze({
    clean: {
      label: '기본',
      fg: '#2f2b27',
      bg: '#f4f1ec',
      paper: '#fffefa',
      accent: '#806455',
      border: '#ddd7cf',
      muted: '#7d756e',
      italic: '#6f6761',
      chip: '#f3eee8',
      codeBg: '#f0ece7',
      codeFg: '#2f2b27',
    },
  });

  // 실제 DC 에디터에서 한글·영문 표시를 확인한 글꼴만 노출한다.
  // Dotum/돋움처럼 같은 글꼴의 영문명·한글명은 별도 옵션으로 중복하지 않고 family 폴백에 함께 둔다.
  const DC_FONT_PRESETS = Object.freeze({
    malgun: {
      label: '맑은 고딕',
      family: "'Malgun Gothic','맑은 고딕',sans-serif",
    },
    nanumgothic: {
      label: '나눔고딕',
      family: "NanumGothic,'나눔고딕','Malgun Gothic','맑은 고딕',sans-serif",
    },
    notosanskr: {
      label: 'Noto Sans KR',
      family: "'Noto Sans KR','Malgun Gothic','맑은 고딕',sans-serif",
    },
    dotum: {
      label: '돋움',
      family: "Dotum,'돋움','Malgun Gothic','맑은 고딕',sans-serif",
    },
    dotumche: {
      label: '돋움체',
      family: "DotumChe,'돋움체',Dotum,'돋움',monospace",
    },
    gulim: {
      label: '굴림',
      family: "Gulim,'굴림','Malgun Gothic','맑은 고딕',sans-serif",
    },
    gulimche: {
      label: '굴림체',
      family: "GulimChe,'굴림체',Gulim,'굴림',monospace",
    },
    notoserifkr: {
      label: 'Noto Serif KR',
      family: "'Noto Serif KR',Batang,'바탕',serif",
    },
    batang: {
      label: '바탕',
      family: "Batang,'바탕',serif",
    },
    batangche: {
      label: '바탕체',
      family: "BatangChe,'바탕체',Batang,'바탕',serif",
    },
    gungsuh: {
      label: '궁서',
      family: "Gungsuh,'궁서',Batang,'바탕',serif",
    },
  });

  // 저장함 분류별 DC 내보내기 뼈대. 로그는 로그 테마를 바로 고른다.
  const DC_EXPORT_STYLES = Object.freeze({
    ooc: Object.freeze({
      specsheet: { label: '스펙시트' },
      gwedo: { label: '궤도' },
      muji: { label: '무지' },
      yeobaek: { label: '여백' },
      baekjimeok: { label: '백지먹' },
      newspaper: { label: '호외 신문' },
      airmail: { label: '항공우편' },
      library: { label: '대출 카드' },
      onair: { label: '온에어 큐시트' },
      quest: { label: '퀘스트 저널' },
      midnight: { label: '심야 기록국' },
      diagnosis: { label: '진단서' },
      dossier: { label: '기밀 보고서' },
      receipt: { label: '영수증' },
      timeline: { label: '타임라인' },
      board: { label: '익명 게시판' },
      wiki: { label: '위키 문서' },
      messenger: { label: '메신저' },
      livechat: { label: '방송 채팅' },
      riftchat: { label: '협곡 채팅' },
      diary: { label: '다이어리' },
    }),
    log: Object.freeze({
      layout: { label: '로그 테마' },
    }),
  });

  // DC 로그도 일반 HTML과 동일하게 "구조(테마)"와 "색상 변형"을 분리한다.
  // 예전 hanji/sumuk/mungo/twoink/nangdok/yahwa 값은 교차 기록의 색상값으로 자동 이관한다.
  const DC_LOG_THEMES = Object.freeze({
    specsheet:  { label: '00 · 스펙시트' },
    baekjimeok: { label: '01 · 백지먹' },
    simya:      { label: '02 · 심야' },
    yeonji:     { label: '03 · 연지' },
    cheongram:  { label: '04 · 청람' },
    wongo:      { label: '05 · 원고' },
    silentfilm: { label: '06 · 무성영화' },
    tajeon:     { label: '07 · 타전' },
    seongjwa:   { label: '08 · 성좌' },
    makgan:     { label: '09 · 막간' },
    crosslog:   { label: '10 · 교차 기록' },
    airmail:    { label: '11 · 항공우편' },
    gwedo:      { label: '12 · 궤도' },
    heugyo:     { label: '13 · 흑요' },
    cheongin:   { label: '14 · 청인' },
    yeobaek:    { label: '15 · 여백' },
    muji:       { label: '16 · 무지' },
  });

  function normalizeDCLogTheme(value) {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    if (text === 'specsheetdark') return 'specsheet';
    if (text === 'hoerok') return 'baekjimeok';
    if (Object.prototype.hasOwnProperty.call(LOG_SIMPLE_PALETTES, text)) return 'crosslog';
    return DC_LOG_THEMES[text] ? text : 'specsheet';
  }

  function getDCLogThemeOptionsHTML(selected = 'specsheet') {
    const clean = normalizeDCLogTheme(selected);
    return Object.keys(DC_LOG_THEMES)
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(DC_LOG_THEMES[key].label || key)}</option>`)
      .join('');
  }

  function normalizeDCLogColor(value, themeValue = 'specsheet') {
    const rawTheme = toStringValue(themeValue).trim().toLocaleLowerCase();
    const layoutKey = normalizeDCLogTheme(rawTheme);
    const variants = getLogHTMLVariantMap(layoutKey);
    let requested = toStringValue(value).trim().toLocaleLowerCase();
    const legacyColor = Object.prototype.hasOwnProperty.call(LOG_SIMPLE_PALETTES, rawTheme) ? rawTheme : '';
    if (rawTheme === 'specsheetdark' && !requested) requested = 'dark';
    if ((!requested || !Object.prototype.hasOwnProperty.call(variants, requested)) && legacyColor) requested = legacyColor;
    return normalizeLogHTMLColor(requested, layoutKey);
  }

  function getDCLogColorOptionsHTML(selected, themeValue = 'specsheet') {
    const layoutKey = normalizeDCLogTheme(themeValue);
    const clean = normalizeDCLogColor(selected, layoutKey);
    return getLogHTMLColorOptionsHTML(clean, layoutKey);
  }



  // 일반 HTML/PNG 로그 내지는 구조(테마)와 색상 변형을 분리한다.
  // 기존 '교차 기록'은 호환용으로 유지하고, 책·기록물·극장 콘셉트의 내지를 함께 제공한다.
  const LOG_HTML_LAYOUTS = Object.freeze({
    specsheet:  { label: '00 · 스펙시트', defaultColor: 'light' },
    baekjimeok: { label: '01 · 백지먹', defaultColor: 'ivory' },
    simya:      { label: '02 · 심야', defaultColor: 'goldnavy' },
    yeonji:     { label: '03 · 연지', defaultColor: 'dustyrose' },
    cheongram:  { label: '04 · 청람', defaultColor: 'slate' },
    wongo:      { label: '05 · 원고', defaultColor: 'vermilion' },
    silentfilm: { label: '06 · 무성영화', defaultColor: 'mono' },
    tajeon:     { label: '07 · 타전', defaultColor: 'gray' },
    seongjwa:   { label: '08 · 성좌', defaultColor: 'indigo' },
    makgan:     { label: '09 · 막간', defaultColor: 'creamgold' },
    crosslog:   { label: '10 · 교차 기록', defaultColor: 'mungo' },
    airmail:    { label: '11 · 항공우편', defaultColor: 'builtin', builtIn: true },
    gwedo:      { label: '12 · 궤도', defaultColor: 'light' },
    heugyo:     { label: '13 · 흑요', defaultColor: 'bone' },
    cheongin:   { label: '14 · 청인', defaultColor: 'klein' },
    yeobaek:    { label: '15 · 여백', defaultColor: 'cream' },
    muji:       { label: '16 · 무지', defaultColor: 'warm' },
  });

  // OOC 일반 HTML/PNG는 스펙시트를 기본으로 문서형 테마를 제공한다.
  // 구버전 default/card/coa/archive 저장값은 specsheet로 자동 이관한다.
  const OOC_HTML_LAYOUTS = Object.freeze({
    specsheet: { label: '00 · 스펙시트' },
    gwedo:     { label: '01 · 궤도' },
    muji:      { label: '02 · 무지' },
    yeobaek:   { label: '03 · 여백' },
    baekjimeok:{ label: '04 · 백지먹' },
    newspaper: { label: '05 · 호외 신문' },
    airmail:   { label: '06 · 항공우편' },
    library:   { label: '07 · 대출 카드' },
    onair:     { label: '08 · 온에어' },
    quest:     { label: '09 · 퀘스트 저널' },
    midnight:  { label: '10 · 심야 기록국' },
    diagnosis: { label: '11 · 진단서' },
    dossier:   { label: '12 · 기밀 보고서' },
    receipt:   { label: '13 · 영수증' },
    timeline:  { label: '14 · 타임라인' },
    board:     { label: '15 · 익명 게시판' },
    wiki:      { label: '16 · 위키 문서' },
    messenger: { label: '17 · 메신저' },
    livechat:  { label: '18 · 방송 채팅' },
    riftchat:  { label: '19 · 협곡 채팅' },
    diary:     { label: '20 · 다이어리' },
  });

  const OOC_HTML_LAYOUT_ALIASES = Object.freeze({
    default: 'specsheet',
    card: 'specsheet',
    coa: 'specsheet',
    archive: 'specsheet',
    medical: 'diagnosis',
    classified: 'dossier',
    stream: 'livechat',
  });

  function normalizeOOCHTMLLayout(value) {
    const raw = toStringValue(value).trim().toLocaleLowerCase();
    const clean = OOC_HTML_LAYOUT_ALIASES[raw] || raw;
    return OOC_HTML_LAYOUTS[clean] ? clean : 'specsheet';
  }

  function getOOCHTMLLayoutOptionsHTML(selected = 'specsheet') {
    const clean = normalizeOOCHTMLLayout(selected);
    return Object.keys(OOC_HTML_LAYOUTS)
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(OOC_HTML_LAYOUTS[key].label)}</option>`)
      .join('');
  }

  function isBuiltInLogLayout(value) {
    return LOG_HTML_LAYOUTS[normalizeLogHTMLLayout(value)]?.builtIn === true;
  }

  // 교차 기록 색상 변형 6종. 구버전 DC 테마값을 색상값으로 이관하기 위해 키를 유지한다.
  const LOG_SIMPLE_PALETTES = Object.freeze({
    hanji: {
      bg: '#e9e0cd', paper: '#f8f1df', fg: '#2c241a', muted: '#6b5d47', border: '#cdbf9f',
      aiBg: '#f8f1df', aiAccent: '#8a3a34', userBg: '#e3dcc6', userAccent: '#a98a3f',
      italic: '#7a6650', quoteBg: '#f2ead8', quoteAccent: '#9a7650',
    },
    sumuk: {
      bg: '#edeeef', paper: '#f5f6f7', fg: '#2a2e33', muted: '#68727c', border: '#c6cdd4',
      aiBg: '#f5f6f7', aiAccent: '#3c4650', userBg: '#e2e5e9', userAccent: '#b3402e',
      italic: '#657789', quoteBg: '#e7eaed', quoteAccent: '#6f7f8d',
    },
    mungo: {
      bg: '#faf7f0', paper: '#fffdf8', fg: '#33302a', muted: '#6b6256', border: '#d9d2c4',
      aiBg: '#fffdf8', aiAccent: '#6b4a3a', userBg: '#f5efe5', userAccent: '#7a5b48',
      italic: '#7d6c5d', quoteBg: '#f7f1e7', quoteAccent: '#8a6a52',
    },
    twoink: {
      bg: '#fbf8f1', paper: '#fffdf8', fg: '#33302a', muted: '#625b50', border: '#d9d2c4',
      aiBg: '#fffdf8', aiAccent: '#8a4a2e', userBg: '#f3f1ec', userAccent: '#596777',
      italic: '#6b5d77', quoteBg: '#f3f0ea', quoteAccent: '#596777',
    },
    nangdok: {
      bg: '#f7f4ec', paper: '#fbfaf6', fg: '#37332c', muted: '#6a6255', border: '#d6cfc0',
      aiBg: '#fbfaf6', aiAccent: '#755f45', userBg: '#eee9db', userAccent: '#31456b',
      italic: '#7b6a55', quoteBg: '#f1ede3', quoteAccent: '#755f45',
    },
    yahwa: {
      bg: '#211e1a', paper: '#292520', fg: '#d8d0c2', muted: '#958b7a', border: '#3d3830',
      aiBg: '#292520', aiAccent: '#b29a68', userBg: '#2b281f', userAccent: '#e8c56a',
      italic: '#b5a58e', quoteBg: '#24211d', quoteAccent: '#b29a68',
    },
  });

  function getLogSimplePalette(colorKey) {
    return LOG_SIMPLE_PALETTES[toStringValue(colorKey).trim().toLocaleLowerCase()] || LOG_SIMPLE_PALETTES.mungo;
  }

  const LOG_CROSSLOG_VARIANT_LABELS = Object.freeze({
    hanji: '한지',
    sumuk: '수묵',
    mungo: '문고',
    twoink: '이색잉크',
    nangdok: '낭독',
    yahwa: '야화',
  });

  // 일반 HTML 로그 내지는 공통 6토큰(bg/text/title/accent/dialogue/line)만 교체해 색상 변형을 만든다.
  const LOG_HTML_VARIANTS = Object.freeze({
    specsheet: Object.freeze({
      light: { label:'LIGHT', bg:'#F5F5F1', text:'#161513', title:'#161513', accent:'#57544D', dialogue:'#161513', line:'#161513' },
      dark:  { label:'DARK',  bg:'#161614', text:'#EDEBE4', title:'#EDEBE4', accent:'#B8B5AC', dialogue:'#EDEBE4', line:'#EDEBE4' },
    }),
    baekjimeok: Object.freeze({
      ivory:      { label:'기본 · 아이보리', bg:'#faf8f2', text:'#2b2a26', title:'#26241f', accent:'#9a8f75', dialogue:'#6e6350', line:'#b5a98c' },
      snow:       { label:'설백', bg:'#f8f9fa', text:'#33363a', title:'#24272b', accent:'#8a9098', dialogue:'#5c6670', line:'#c3c8ce' },
      kraft:      { label:'갱지', bg:'#f3ead8', text:'#4a3f2e', title:'#3c3222', accent:'#a08b5f', dialogue:'#7d6a45', line:'#c4ad82' },
      blackpaper: { label:'흑지 · 다크', bg:'#1e1d1a', text:'#d8d4c8', title:'#ece8dc', accent:'#a3987e', dialogue:'#c0b394', line:'#4a463c' },
    }),
    simya: Object.freeze({
      goldnavy:  { label:'기본 · 골드네이비', bg:'#161b24', text:'#d6dae2', title:'#eef0f4', accent:'#c2a468', dialogue:'#c2a468', line:'#3a4152' },
      purple:    { label:'자정보라', bg:'#1b1722', text:'#d8d4e0', title:'#efecf5', accent:'#a68bc9', dialogue:'#b9a3d6', line:'#3d3550' },
      silverblue:{ label:'흑청은사', bg:'#14181c', text:'#ccd3d8', title:'#e8edf1', accent:'#9db3bf', dialogue:'#a9c0cc', line:'#333d44' },
      wine:      { label:'와인나이트', bg:'#201619', text:'#ddd2d4', title:'#f2e9eb', accent:'#c98a94', dialogue:'#d19aa3', line:'#493339' },
    }),
    yeonji: Object.freeze({
      dustyrose: { label:'기본 · 더스티로즈', bg:'#f8f2f1', text:'#3a2f30', title:'#332728', accent:'#a56b6f', dialogue:'#a56b6f', line:'#e0c8ca' },
      wine:      { label:'와인', bg:'#f6efee', text:'#3d2a2e', title:'#332226', accent:'#8e4a57', dialogue:'#8e4a57', line:'#d9bcc2' },
      apricot:   { label:'살구', bg:'#faf3ec', text:'#40342a', title:'#362b21', accent:'#c08a5e', dialogue:'#a9743f', line:'#e8d2bc' },
      mauve:     { label:'모브 · 연보라', bg:'#f5f1f6', text:'#38313d', title:'#2e2833', accent:'#8f7aa3', dialogue:'#7d6693', line:'#d9cde2' },
    }),
    cheongram: Object.freeze({
      slate:     { label:'기본 · 슬레이트', bg:'#eef1f5', text:'#2c3440', title:'#242c38', accent:'#5d708e', dialogue:'#4e6488', line:'#8fa0ba' },
      deepsea:   { label:'심해 · 다크', bg:'#131a24', text:'#c8d2de', title:'#e6edf5', accent:'#7d9cc4', dialogue:'#8fadd2', line:'#35455c' },
      teal:      { label:'청록', bg:'#ecf4f3', text:'#263a3a', title:'#1e3131', accent:'#4e8583', dialogue:'#3d6f6d', line:'#a5c6c4' },
      graycloud: { label:'잿빛하늘', bg:'#f0f1f3', text:'#363a41', title:'#2b2f36', accent:'#7e8796', dialogue:'#626a78', line:'#b8bdc7' },
    }),
    wongo: Object.freeze({
      vermilion:{ label:'기본 · 주홍교정', bg:'#f9f6ef', text:'#3a352c', title:'#2f2a21', accent:'#a35138', dialogue:'#a35138', line:'#c3b899' },
      blueink:  { label:'청먹 · 파란 잉크', bg:'#f6f7f4', text:'#34383c', title:'#292d32', accent:'#3f5e8c', dialogue:'#3f5e8c', line:'#b3bdc9' },
      greenproof:{ label:'초고녹 · 녹색 펜', bg:'#f7f7f0', text:'#363a30', title:'#2b2f26', accent:'#5d7a4e', dialogue:'#5d7a4e', line:'#bfc7ab' },
      midnight: { label:'심야원고 · 다크', bg:'#201e1a', text:'#d5d0c4', title:'#eae5d8', accent:'#c97a5e', dialogue:'#d18a70', line:'#4e483c' },
    }),
    silentfilm: Object.freeze({
      mono:     { label:'기본 · 흑백', bg:'#101010', text:'#e6e4de', title:'#f2f0ea', accent:'#9a9a92', dialogue:'#b8b6ae', line:'#4c4c48' },
      sepia:    { label:'세피아필름', bg:'#171310', text:'#e3d8c8', title:'#f0e7d8', accent:'#a89478', dialogue:'#c4b298', line:'#55483a' },
      cyanfilm: { label:'청화필름', bg:'#0f1416', text:'#d8e2e4', title:'#eaf2f3', accent:'#8aa4a8', dialogue:'#a8c0c4', line:'#3c4c50' },
      silver:   { label:'은막 · 라이트', bg:'#f2f1ee', text:'#33322f', title:'#232220', accent:'#7a7972', dialogue:'#5c5b55', line:'#c6c4be' },
    }),
    tajeon: Object.freeze({
      gray:      { label:'기본 · 회백', bg:'#ededeb', text:'#38383a', title:'#2c2c30', accent:'#5f6570', dialogue:'#55606e', line:'#9aa0a8' },
      kraft:     { label:'갱지전보', bg:'#f2ead9', text:'#453c2e', title:'#372f22', accent:'#8c6f45', dialogue:'#7a6038', line:'#bfa87e' },
      officeblue:{ label:'관청청색', bg:'#e9eef2', text:'#313a44', title:'#262e38', accent:'#4a6280', dialogue:'#3f5872', line:'#92a6ba' },
      night:     { label:'야간교신 · 다크', bg:'#1b1d20', text:'#cfd2d6', title:'#e8eaee', accent:'#8f9aa8', dialogue:'#a3b2c4', line:'#464b52' },
    }),
    seongjwa: Object.freeze({
      indigo: { label:'기본 · 감청', bg:'#0e1220', text:'#cfd6e6', title:'#e9eef8', accent:'#7286ad', dialogue:'#9db1dd', line:'#54648a' },
      nebula: { label:'보랏빛성운', bg:'#151022', text:'#d5cee4', title:'#efeaf8', accent:'#8d7ab0', dialogue:'#ab97d2', line:'#5c4e80' },
      dawn:   { label:'새벽여명', bg:'#101a22', text:'#cdd9de', title:'#e8f1f4', accent:'#6f96a4', dialogue:'#8fb8c6', line:'#3f5a66' },
      ground: { label:'지상관측 · 라이트', bg:'#eef1f7', text:'#303748', title:'#252b3a', accent:'#6a7aa0', dialogue:'#52679a', line:'#b4bdd2' },
    }),
    makgan: Object.freeze({
      creamgold:{ label:'기본 · 크림골드', bg:'#f7efe4', text:'#43313a', title:'#37232e', accent:'#ab8a55', dialogue:'#8a4a5e', line:'#c4a97e' },
      velvet:   { label:'벨벳 · 다크 버건디', bg:'#251419', text:'#e4d5cc', title:'#f4e9dd', accent:'#c69b6b', dialogue:'#d1919e', line:'#5a3a40' },
      operablue:{ label:'오페라블루', bg:'#eff1f6', text:'#37404e', title:'#2a3242', accent:'#9a8250', dialogue:'#4a5e86', line:'#b8a983' },
      greenroom:{ label:'그린룸 · 다크 그린', bg:'#14201b', text:'#d7ddd4', title:'#ecf1ea', accent:'#c2a36a', dialogue:'#9cc0a6', line:'#3a4c42' },
    }),
    gwedo: Object.freeze({
      light:   { label:'기본 · 라이트', bg:'#FAFAF8', text:'#201F1C', title:'#161512', accent:'#201F1C', dialogue:'#77746C', line:'#E4E2DC' },
      dark:    { label:'흑지 · 다크', bg:'#171714', text:'#E9E7E0', title:'#F2F0EA', accent:'#E9E7E0', dialogue:'#98948A', line:'#33322D' },
      blueink: { label:'청잉크', bg:'#F7F8FA', text:'#2A2F38', title:'#232C3E', accent:'#33415C', dialogue:'#7C8494', line:'#DDE1E6' },
      sepia:   { label:'세피아', bg:'#FAF6EE', text:'#373127', title:'#2A241B', accent:'#4E4638', dialogue:'#8C8272', line:'#E4DDCE' },
    }),
    heugyo: Object.freeze({
      bone:  { label:'기본 · 본블랙', bg:'#131210', text:'#DDD9CF', title:'#F0EDE4', accent:'#D8D3C6', dialogue:'#C9B788', line:'#2A2925' },
      ember: { label:'잔불', bg:'#171210', text:'#E0D6CE', title:'#F2E8E0', accent:'#D8C8BC', dialogue:'#CF8A62', line:'#33291F' },
      moss:  { label:'이끼', bg:'#121411', text:'#D6DCD2', title:'#EAF0E6', accent:'#C6D0C0', dialogue:'#9CB88A', line:'#272B25' },
      ivory: { label:'백요 · 라이트', bg:'#F1EFE9', text:'#2C2A24', title:'#191813', accent:'#55524A', dialogue:'#8A7141', line:'#DCD9CF' },
    }),
    cheongin: Object.freeze({
      klein:     { label:'기본 · 클라인블루', bg:'#F6F5F0', text:'#26251F', title:'#1D1C17', accent:'#2B3FB0', dialogue:'#6B6858', line:'#E2E0D8' },
      vermilion: { label:'주인 · 붉은 인장', bg:'#F8F5EF', text:'#2A2620', title:'#1E1B15', accent:'#C2402A', dialogue:'#6E6759', line:'#E6E1D6' },
      jade:      { label:'옥인 · 초록 인장', bg:'#F3F6F3', text:'#24302C', title:'#1A2622', accent:'#17796B', dialogue:'#67746E', line:'#DCE4DF' },
      night:     { label:'야인 · 다크', bg:'#14151A', text:'#D9DBE2', title:'#EEF0F6', accent:'#6E82E8', dialogue:'#9AA0AE', line:'#2E3038' },
    }),
    yeobaek: Object.freeze({
      cream:    { label:'기본 · 크림', bg:'#FCFBF7', text:'#262521', title:'#1C1B17', accent:'#9C988C', dialogue:'#9C988C', line:'#E0DDD3' },
      coolgray: { label:'한랭지 · 쿨그레이', bg:'#F7F8F8', text:'#2C2E30', title:'#202224', accent:'#94989C', dialogue:'#94989C', line:'#DADDDF' },
      dark:     { label:'묵지 · 다크', bg:'#191917', text:'#DFDCD4', title:'#F0EEE6', accent:'#8F8C82', dialogue:'#8F8C82', line:'#3A3934' },
      blush:    { label:'담홍', bg:'#FBF7F5', text:'#322B2A', title:'#241E1D', accent:'#A08D89', dialogue:'#A08D89', line:'#E7DCD8' },
    }),
    muji: Object.freeze({
      warm:      { label:'기본 · 미색', bg:'#F8F5EF', text:'#3A362E', title:'#2C2922', accent:'#7A6A50', dialogue:'#9A6A54', line:'#E5E0D4' },
      grove:     { label:'초록등', bg:'#F3F5F0', text:'#333830', title:'#262B24', accent:'#587050', dialogue:'#8C7346', line:'#DDE2D7' },
      nightlamp: { label:'남등 · 다크', bg:'#1A1B1E', text:'#D6D7DA', title:'#ECEDF0', accent:'#A8B4C8', dialogue:'#C8A87E', line:'#33353A' },
      mono:      { label:'무채', bg:'#FBFAF7', text:'#2A2925', title:'#1B1A17', accent:'#55534C', dialogue:'#8B887F', line:'#E3E1D9' },
    }),
  });

  function getLogHTMLVariantMap(layoutValue) {
    const raw = toStringValue(layoutValue).trim().toLocaleLowerCase();
    const layoutKey = raw === 'hoerok' ? 'baekjimeok' : (LOG_HTML_LAYOUTS[raw] ? raw : 'crosslog');
    if (layoutKey === 'crosslog') {
      return Object.fromEntries(Object.keys(LOG_CROSSLOG_VARIANT_LABELS).map((key) => [key, {
        label: LOG_CROSSLOG_VARIANT_LABELS[key],
        ...LOG_SIMPLE_PALETTES[key],
      }]));
    }
    if (LOG_HTML_LAYOUTS[layoutKey]?.builtIn) return { builtin: { label: '고정 색상' } };
    return LOG_HTML_VARIANTS[layoutKey] || LOG_HTML_VARIANTS.baekjimeok;
  }

  function getLogHTMLPalette(layoutValue, colorValue) {
    const layoutKey = normalizeLogHTMLLayout(layoutValue);
    const colorKey = normalizeLogHTMLColor(colorValue, layoutKey);
    const raw = getLogHTMLVariantMap(layoutKey)[colorKey];
    if (layoutKey === 'crosslog') {
      return {
        ...raw,
        text: raw.fg,
        title: raw.fg,
        accent: raw.aiAccent,
        dialogue: raw.userAccent,
        line: raw.border,
      };
    }
    return {
      ...raw,
      fg: raw.text,
      paper: raw.bg,
      muted: raw.accent,
      border: raw.line,
      aiBg: raw.bg,
      userBg: raw.bg,
      aiAccent: raw.accent,
      userAccent: raw.dialogue,
      italic: raw.dialogue,
      quoteBg: raw.bg,
      quoteAccent: raw.line,
    };
  }

  function getLogHTMLVariantLabel(layoutValue, colorValue) {
    const layoutKey = normalizeLogHTMLLayout(layoutValue);
    const colorKey = normalizeLogHTMLColor(colorValue, layoutKey);
    return getLogHTMLVariantMap(layoutKey)[colorKey]?.label || colorKey;
  }

  const COA_CORE_GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
  const COA_PRETENDARD_FONT_URL = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';

  // 일반 HTML/PNG 전용 폰트. DC 폰트 목록과 완전히 분리한다.
  // 웹폰트는 선택했을 때만 별도 stylesheet를 불러와 미리보기·HTML 파일·PNG를 같은 폰트로 맞춘다.
  const COA_FONT_PRESETS = Object.freeze({
    pretendard: {
      label: '프리텐다드', group: 'sans',
      family: "'Pretendard Variable',Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    notosanskr: {
      label: 'Noto Sans KR', group: 'sans',
      family: "'Noto Sans KR','Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap',
    },
    gowundodum: {
      label: '고운돋움', group: 'sans',
      family: "'Gowun Dodum','Noto Sans KR','Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap',
    },
    nanumgothic: {
      label: '나눔고딕', group: 'sans',
      family: "'Nanum Gothic','Noto Sans KR','Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap',
    },
    sans: {
      label: '기본 고딕', group: 'sans',
      family: "Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    dotum: {
      label: '돋움', group: 'sans',
      family: "Dotum,'돋움','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    notoserifkr: {
      label: 'Noto Serif KR', group: 'serif',
      family: "'Noto Serif KR','Gowun Batang',Batang,'바탕',serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700;800&display=swap',
    },
    gowunbatang: {
      label: '고운바탕', group: 'serif',
      family: "'Gowun Batang','Noto Serif KR',Batang,'바탕',serif",
    },
    nanummyeongjo: {
      label: '나눔명조', group: 'serif',
      family: "'Nanum Myeongjo','Noto Serif KR',Batang,'바탕',serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap',
    },
    songmyung: {
      label: '송명', group: 'serif',
      family: "'Song Myung','Noto Serif KR',Batang,'바탕',serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Song+Myung&display=swap',
    },
    batang: {
      label: '바탕', group: 'serif',
      family: "Batang,'바탕','AppleMyungjo','Malgun Gothic',serif",
    },
    nanumpen: {
      label: '나눔손글씨 펜', group: 'hand',
      family: "'Nanum Pen Script','Noto Sans KR','Malgun Gothic',cursive",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap',
    },
    nanumbrush: {
      label: '나눔손글씨 붓', group: 'hand',
      family: "'Nanum Brush Script','Noto Sans KR','Malgun Gothic',cursive",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Brush+Script&display=swap',
    },
    blackhan: {
      label: '검은고딕', group: 'display',
      family: "'Black Han Sans','Noto Sans KR','Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap',
    },
    dohyeon: {
      label: '도현', group: 'display',
      family: "'Do Hyeon','Noto Sans KR','Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Do+Hyeon&display=swap',
    },
    jua: {
      label: '주아', group: 'display',
      family: "Jua,'Noto Sans KR','Malgun Gothic',sans-serif",
      stylesheet: 'https://fonts.googleapis.com/css2?family=Jua&display=swap',
    },
    ibmplexmono: {
      label: 'IBM Plex Mono', group: 'mono',
      family: "'IBM Plex Mono',Consolas,Menlo,'Courier New','Malgun Gothic',monospace",
    },
    mono: {
      label: '기본 고정폭', group: 'mono',
      family: "Consolas,Menlo,'Courier New','Malgun Gothic',monospace",
    },
  });

  const COA_FONT_GROUPS = Object.freeze([
    ['sans', '고딕'],
    ['serif', '명조 · 소설'],
    ['hand', '손글씨'],
    ['display', '제목 · 장식'],
    ['mono', '고정폭'],
  ]);


  function normalizeLogHTMLLayout(value) {
    const clean = toStringValue(value).trim().toLocaleLowerCase();
    if (clean === 'specsheetdark') return 'specsheet';
    if (clean === 'hoerok') return 'baekjimeok';
    return LOG_HTML_LAYOUTS[clean] ? clean : 'specsheet';
  }

  function normalizeLogHTMLColor(value, layoutValue = 'crosslog') {
    const layoutKey = normalizeLogHTMLLayout(layoutValue);
    const variants = getLogHTMLVariantMap(layoutKey);
    const clean = toStringValue(value).trim().toLocaleLowerCase();
    if (variants[clean]) return clean;
    return LOG_HTML_LAYOUTS[layoutKey].defaultColor;
  }

  function normalizeCOAFont(value) {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    if (COA_FONT_PRESETS[text]) return text;
    if (/noto\s*serif/.test(text)) return 'notoserifkr';
    if (/noto\s*sans/.test(text)) return 'notosanskr';
    if (/gowun\s*dodum|고운\s*돋움/.test(text)) return 'gowundodum';
    if (/gowun\s*batang|고운\s*바탕/.test(text)) return 'gowunbatang';
    if (/nanum\s*myeongjo|나눔\s*명조/.test(text)) return 'nanummyeongjo';
    if (/nanum\s*gothic|나눔\s*고딕/.test(text)) return 'nanumgothic';
    if (/song\s*myung|송명/.test(text)) return 'songmyung';
    if (/nanum\s*pen|나눔.*펜/.test(text)) return 'nanumpen';
    if (/nanum\s*brush|나눔.*붓/.test(text)) return 'nanumbrush';
    if (/black\s*han|검은\s*고딕/.test(text)) return 'blackhan';
    if (/do\s*hyeon|도현/.test(text)) return 'dohyeon';
    if (/ibm.*plex.*mono/.test(text)) return 'ibmplexmono';
    return 'pretendard';
  }

  function getLogHTMLLayoutOptionsHTML(selected = 'specsheet') {
    const clean = normalizeLogHTMLLayout(selected);
    return Object.keys(LOG_HTML_LAYOUTS)
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(LOG_HTML_LAYOUTS[key].label)}</option>`)
      .join('');
  }

  function getLogHTMLColorOptionsHTML(selected, layoutValue = 'crosslog') {
    const layoutKey = normalizeLogHTMLLayout(layoutValue);
    const clean = normalizeLogHTMLColor(selected, layoutKey);
    const variants = getLogHTMLVariantMap(layoutKey);
    return Object.keys(variants)
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(variants[key].label || key)}</option>`)
      .join('');
  }

  function getCOAFontOptionsHTML(selected = 'pretendard') {
    const clean = normalizeCOAFont(selected);
    return COA_FONT_GROUPS.map(([groupKey, groupLabel]) => {
      const options = Object.keys(COA_FONT_PRESETS)
        .filter((key) => COA_FONT_PRESETS[key].group === groupKey)
        .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(COA_FONT_PRESETS[key].label)}</option>`)
        .join('');
      return options ? `<optgroup label="${escapeHTML(groupLabel)}">${options}</optgroup>` : '';
    }).join('');
  }

  function getCOAFontFamily(fontKey) {
    return COA_FONT_PRESETS[normalizeCOAFont(fontKey)].family;
  }

  const DC_ALLOWED_TAGS = Object.freeze([
    'p','div','span','br','hr','b','strong','i','em','u','s','strike',
    'a','img','blockquote','pre','code',
    'ul','ol','li','table','thead','tbody','tr','th','td',
    'h1','h2','h3','h4','h5','h6'
  ]);

  const DC_ALLOWED_STYLES = Object.freeze([
    'color','background-color',
    'font-size','font-weight','font-style','font-family',
    'text-align','text-decoration','line-height','white-space',
    'padding','padding-left','padding-right','padding-top','padding-bottom',
    'margin','margin-left','margin-right','margin-top','margin-bottom',
    'border','border-left','border-right','border-top','border-bottom',
    'width','max-width','min-width','height','max-height',
    'border-collapse','border-spacing','table-layout','vertical-align',
    'word-break','overflow-wrap','word-wrap','line-break'
  ]);

  const EXPORT_META_DEFAULTS = Object.freeze({
    showTitle: true,
    showTags: true,
    showDate: true,
    showReference: true,
  });

  function getExportMetaOptions(options = {}) {
    return {
      showTitle: options.showTitle !== false,
      showTags: options.showTags !== false,
      showDate: options.showDate !== false,
      showReference: options.showReference !== false,
    };
  }

  function normalizeExportTitleMatchText(value) {
    return toStringValue(value)
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function applyExportTitleVisibilityHTML(html, card, options = {}) {
    if (getExportMetaOptions(options).showTitle) return toStringValue(html);

    const normalized = normalizeCard(card);
    const fallback = normalized.archiveType === 'log' ? '기록' : 'OOC ARCHIVE';
    const title = normalizeExportTitleMatchText(
      stripSmartMarkdown(normalized.title || fallback).trim() || fallback
    );
    if (!title) return toStringValue(html);

    const template = document.createElement('template');
    template.innerHTML = toStringValue(html);
    const root = template.content;

    const wrappedForms = [
      `『${title}』`,
      `「${title}」`,
      `“${title}”`,
      `"${title}"`,
    ];

    const isTitleCandidate = (element) => {
      const text = normalizeExportTitleMatchText(element.textContent);
      if (!text) return false;
      if (text === title) return true;

      // 익명 게시판처럼 제목 앞에 작은 OOC 배지가 함께 들어가는 형태.
      if (/^H[1-6]$/.test(element.tagName) && text.endsWith(title)) {
        const prefix = text.slice(0, -title.length).replace(/[\s·:|/\-]+/g, '');
        if (!prefix || prefix === 'OOC') return true;
      }

      // 협곡 채팅·공지형 테마처럼 제목이 한 줄의 시스템 문구 안에 들어간 형태.
      if (wrappedForms.some((form) => text.includes(form)) && text.length <= title.length + 120) {
        return true;
      }
      return false;
    };

    const candidates = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,td,div')];
    const target = candidates.find(isTitleCandidate);
    if (!target) return template.innerHTML;

    const targetText = normalizeExportTitleMatchText(target.textContent);
    const parent = target.parentElement;
    const parentText = normalizeExportTitleMatchText(parent?.textContent);

    // 진단서의 '진단명 | 제목'처럼 제목이 표의 한 행을 차지하면 행 전체를 제거한다.
    if (target.tagName === 'TD' && target.parentElement?.tagName === 'TR') {
      target.parentElement.remove();
    // 방송 채팅의 고정 기록 카드는 제목 전용 영역이므로 카드 자체를 제거한다.
    } else if (
      parent &&
      /고정된 기록/.test(parentText) &&
      parentText.length <= title.length + 80
    ) {
      parent.remove();
    // 시스템 알림 한 줄 안에 제목이 포함된 경우 빈 알림 껍데기까지 함께 제거한다.
    } else if (
      wrappedForms.some((form) => targetText.includes(form)) &&
      targetText !== title
    ) {
      target.remove();
    } else {
      const next = target.nextElementSibling;
      target.remove();
      if (next?.style?.marginTop) next.style.marginTop = '6px';
    }

    // 제목 제거 후 완전히 비어 버린 얕은 래퍼만 정리한다.
    [...root.querySelectorAll('header,div,td,tr')].reverse().forEach((element) => {
      if (element.querySelector('img,svg,table,hr')) return;
      if (normalizeExportTitleMatchText(element.textContent)) return;
      if (element.children.length) return;
      element.remove();
    });

    return template.innerHTML;
  }

  // DC가 안정적으로 문자형으로 표시하는 BMP 기호는 이모지 제거 모드에서도 남긴다.
  // 기존 로직은 광범위한 범주 치환 때문에 DC에서 이미 잘 보이는 이모지까지 과하게 텍스트로 바꿨다.
  // 아래 호환층은 실측 결과를 기준으로 ① 그대로 보이는 이모지는 유지, ② VS/피부색/키캡/국기 조합만 정리,
  // ③ ZWJ 결합은 가능한 한 지원되는 구성요소로 풀어 쓰고, ④ 본체가 자주 깨지는 일부만 선택적으로 치환한다.
  const DC_SAFE_TEXT_SYMBOLS = new Set(Array.from(
    '★☆●○■□▲△▼▽◆◇♥♡♠♣♦※✦✧✓✔✕✖→←↑↓↔↕☺☹☀☁☂☃☎☕⚠✈✉⌛⏰⏳❣❗❓⭕❌⚡❄♪♫☾✎❀❦☑⚕⚖⚒⚙⛩☯☮✝☪☸✡♀♂⚧'
  ));

  const DC_EMOJI_CLUSTER_REPLACEMENTS = Object.freeze({
    '🙂‍↕': '☺',
    '🙂‍↔': '☺',
    '😶‍🌫': '😶',
    '😵‍💫': '😵✦',
    '👁‍🗨': '👀💬',
    '❤‍🔥': '❤♨',
    '❤‍🩹': '❤',
    '🐻‍❄': '🐻❄',
    '🐕‍🦺': '🐕',
    '🐈‍⬛': '🐈⬛',
    '🏳‍🌈': '🌈',
    '🏳‍⚧': '⚧',
    '🏴‍☠': '💀',
    '🐦‍🔥': '🐦🔥',
    '🍋‍🟩': '🍋',
    '🍄‍🟫': '🍄',
    '⛓‍💥': '⛓💥',
  });

  const DC_EMOJI_REPLACEMENTS = Object.freeze({
    '🙂': '☺', '🙃': '☺', '🥰': '♥', '🤪': '?', '🤨': '?', '🧐': '?', '🤓': '?', '🥸': '?', '🤩': '★', '🥳': '✦',
    '🥺': '☹', '🤬': '!', '🤯': '!', '🥵': '!', '🥶': '!', '🤗': '☺', '🤔': '?', '🫣': '?', '🤭': '☺', '🫢': '!',
    '🫡': '※', '🤫': '·', '🫠': '·', '🫨': '!', '🙄': '·', '🥱': 'zZ', '🤤': '·', '🫥': '·', '🤐': '·', '🥴': '·',
    '🤢': '☹', '🤮': '☹', '🤧': '☹', '🤒': '☹', '🤕': '☹', '🤑': '$', '🤠': '☺', '🤡': '◇', '🤖': '◇', '☠': '💀',

    '🤚': '✋', '🖐': '✋', '🖖': '✋', '🫱': '✋', '🫲': '✋', '🫳': '✋', '🫴': '✋', '🫷': '✋', '🫸': '✋',
    '🤌': '👌', '🤏': '👌', '🤞': '※', '🫰': '♥', '🤟': '✌', '🤘': '✌', '🤙': '✋', '🖕': '↑', '🫵': '👉',
    '🤛': '👊', '🤜': '👊', '🫶': '♥', '🤲': '👐', '🤝': '👐', '🤳': '📷', '🦾': '💪',

    '🧒': '👶', '🧑': '👤', '🧔': '👨', '🧓': '👴', '🗣': '👤', '👁': '👀', '🫦': '👄', '🦻': '👂',
    '🦷': '◇', '🦴': '◇', '🧠': '◇', '🫀': '♥', '🫁': '◇', '🩸': '💧', '🧏': '👤', '🤦': '👤', '🤷': '👤',
    '🧍': '👤', '🧎': '👤', '🕺': '💃', '🥷': '👤', '🕵': '👤',

    '🖤': '♥', '🤍': '♥', '🤎': '♥', '🩷': '♥', '🩵': '♥', '🩶': '♥',

    '🦊': '🐺', '🦁': '🐯', '🦆': '🐦', '🦅': '🐦', '🦉': '🐦', '🦇': '🐾', '🦄': '🐴', '🫎': '🐴', '🫏': '🐴',
    '🪲': '🐞', '🦋': '🐞', '🪰': '🐜', '🪱': '🐛', '🦗': '🐛', '🕷': '🐜', '🦎': '🐢', '🦕': '🐲', '🦖': '🐲',
    '🦭': '🐬', '🦈': '🐟', '🪸': '🌊', '🪼': '🐙', '🦢': '🐦', '🦩': '🐦', '🦚': '🐦', '🦜': '🐦', '🪽': '✈',
    '🪿': '🐦', '🦮': '🐕', '🪶': '🐾',

    '🪴': '🌿', '🪨': '◇', '🪵': '🌿', '🥀': '🌹', '🪐': '⭐', '🌪': '💨', '🌤': '☀', '🌥': '☁', '🌦': '☔',
    '🌧': '☔', '🌩': '⚡', '🌨': '❄', '🌬': '💨', '🌫': '☁',

    '🫐': '🍇', '🥭': '🍑', '🥥': '🌰', '🥝': '🍏', '🥑': '🍅', '🥦': '🌽', '🥬': '🌿', '🥒': '🍅', '🌶': '🍅',
    '🫑': '🍅', '🥕': '🍠', '🫒': '🍎', '🧄': '🍠', '🧅': '🍠', '🥔': '🍠', '🫘': '🍠', '🥐': '🍞', '🥯': '🍞',
    '🥖': '🍞', '🥨': '🍞', '🧀': '🍞', '🥚': '🍳', '🧈': '🍞', '🥞': '🍰', '🧇': '🍰', '🥓': '🍖', '🥩': '🍖',
    '🌭': '🍔', '🫓': '🍞', '🥪': '🍔', '🥙': '🍔', '🧆': '🍔', '🌮': '🍔', '🌯': '🍔', '🫔': '🍔', '🥗': '🍚',
    '🥘': '🍲', '🫕': '🍲', '🥟': '🍜', '🦪': '🐚', '🥠': '🍘', '🥮': '🍰', '🥧': '🍰', '🧁': '🍰', '🍿': '🍬', '🥜': '🌰',

    '🥛': '☕', '🫖': '☕', '🍾': '🍷', '🥂': '🍻', '🥃': '🍺', '🫗': '🍶', '🥤': '☕', '🧋': '☕', '🧃': '☕', '🧉': '☕',
    '🥢': '🍴', '🍽': '🍴', '🥄': '🍴', '🫙': '📦',
  });

  const DC_FACE_POSITIVE = new Set(Array.from('😀😃😄😁😆😂🤣😉😊😇😍😘😗😙😚😋😛😜😎'));
  const DC_FACE_NEGATIVE = new Set(Array.from('😢😭😞😔😟😕🙁😣😖😫😩'));
  const DC_FACE_ANGER = new Set(Array.from('😠😡'));
  const DC_FACE_SURPRISE = new Set(Array.from('😮😯😲😱😨😰😳'));
  const DC_FACE_SLEEP = new Set(Array.from('😴😪'));
  const DC_FACE_QUESTION = new Set(Array.from('❓❔'));

  let DC_EMOJI_CLUSTER_RE = null;

  function getDCEmojiClusterRE() {
    if (DC_EMOJI_CLUSTER_RE) {
      DC_EMOJI_CLUSTER_RE.lastIndex = 0;
      return DC_EMOJI_CLUSTER_RE;
    }
    try {
      DC_EMOJI_CLUSTER_RE = new RegExp(
        '(?:[#*0-9]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2}|\\p{Extended_Pictographic}(?:\\uFE0E|\\uFE0F)?(?:[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0E|\\uFE0F)?(?:[\\u{1F3FB}-\\u{1F3FF}])?)*)',
        'gu',
      );
    } catch (_) {
      // 최신 Chrome/Firefox에서는 위 패턴을 사용한다. 혹시 속성 이스케이프가 없는 환경이면
      // 보조 평면 이모지 + VS/ZWJ 조합만이라도 잡는 보수적 폴백을 사용한다.
      DC_EMOJI_CLUSTER_RE = /(?:[#*0-9]\uFE0F?\u20E3|[\uD83C-\uDBFF][\uDC00-\uDFFF](?:[\uFE0E\uFE0F])?(?:\u200D[\uD83C-\uDBFF][\uDC00-\uDFFF](?:[\uFE0E\uFE0F])?)*)/g;
    }
    return DC_EMOJI_CLUSTER_RE;
  }

  function regionalIndicatorsToASCII(value) {
    const chars = Array.from(value);
    if (chars.length !== 2) return '';
    const letters = chars.map((char) => {
      const cp = char.codePointAt(0);
      return cp >= 0x1F1E6 && cp <= 0x1F1FF ? String.fromCharCode(65 + cp - 0x1F1E6) : '';
    }).join('');
    return letters.length === 2 ? `[${letters}]` : '';
  }

  function normalizeDCEmojiClusterText(value) {
    return toStringValue(value)
      .replace(/&(?:amp;)?(?:zwj|zwnj);/gi, '')
      .replace(/[\uFE0E\uFE0F]/g, '')
      .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
      .replace(/[\u{E0020}-\u{E007F}]/gu, '');
  }

  function replaceDCSingleEmojiUnit(unit) {
    const base = normalizeDCEmojiClusterText(unit).replace(/\u200D/g, '');
    if (!base) return '';
    if (DC_SAFE_TEXT_SYMBOLS.has(base)) return base;
    if (Object.prototype.hasOwnProperty.call(DC_EMOJI_REPLACEMENTS, base)) {
      return DC_EMOJI_REPLACEMENTS[base];
    }
    if (DC_FACE_POSITIVE.has(base)) return base;
    if (DC_FACE_NEGATIVE.has(base)) return base;
    if (DC_FACE_ANGER.has(base)) return base;
    if (DC_FACE_SURPRISE.has(base)) return base;
    if (DC_FACE_SLEEP.has(base)) return base;
    if (DC_FACE_QUESTION.has(base)) return base;
    return base;
  }

  function replaceDCEmojiCluster(cluster) {
    const original = toStringValue(cluster);
    const flag = regionalIndicatorsToASCII(original);
    if (flag) return flag;

    if (/^[#*0-9]\uFE0F?\u20E3$/u.test(original)) return original[0];

    const normalized = normalizeDCEmojiClusterText(original);
    if (!normalized) return '';

    if (Object.prototype.hasOwnProperty.call(DC_EMOJI_CLUSTER_REPLACEMENTS, normalized)) {
      return DC_EMOJI_CLUSTER_REPLACEMENTS[normalized];
    }

    if (normalized.includes('\u200D')) {
      const parts = normalized.split('\u200D').map((part) => replaceDCSingleEmojiUnit(part)).filter(Boolean);
      if (!parts.length) return '◇';
      return parts.join('');
    }

    return replaceDCSingleEmojiUnit(normalized);
  }

  function transformDCEmojiText(value, mode) {

    const text = toStringValue(value);
    if (!text || !mode) return text;
    const re = getDCEmojiClusterRE();
    re.lastIndex = 0;
    let output = text.replace(re, (cluster) => {
      const plain = cluster
        .replace(/[\uFE0E\uFE0F]/g, '')
        .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
        .replace(/[\u{E0020}-\u{E007F}]/gu, '');
      if (mode === 'remove') return DC_SAFE_TEXT_SYMBOLS.has(plain) ? plain : '';
      return replaceDCEmojiCluster(cluster);
    });
    output = output
      .replace(/[\uFE0E\uFE0F\u200D]/g, '')
      .replace(/[\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu, '')
      .replace(/&(?:amp;)?(?:zwj|zwnj);/gi, '');
    return output;
  }

  function applyDCEmojiCompatibilityToHTML(html, options = {}) {
    const mode = options.removeEmoji === true ? 'remove' : (options.replaceEmoji === true ? 'replace' : '');
    if (!mode || !toStringValue(html).trim()) return toStringValue(html);
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div data-coa-dc-emoji-root="1">${html}</div>`, 'text/html');
      const root = doc.querySelector('[data-coa-dc-emoji-root]');
      if (!root) return html;
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const parent = node.parentElement;
        if (parent && parent.closest('script,style,pre,code')) return;
        node.nodeValue = transformDCEmojiText(node.nodeValue, mode);
      });
      return root.innerHTML.trim();
    } catch (error) {
      console.warn('[COA:DC] emoji compatibility failed:', error);
      return html;
    }
  }

  const DC_DEFAULT_OPTIONS = Object.freeze({
    // 저장함 분류별 기본값. OOC와 로그는 절대 서로의 렌더러를 타지 않는다.
    oocStyle: 'specsheet',
    logStyle: 'layout',
    logTheme: 'specsheet',
    logColor: 'light',
    exportStyle: '',
    theme: 'clean',
    font: 'sans',
    fontSizePt: 0,
    includeTables: true,
    excludeImages: false,
    excludeCodeBlocks: true,
    excludeComments: true,
    replaceEmoji: false,
    removeEmoji: false,
    autoStructure: true,
    forceWordWrap: false,
    maxWidth: 760,
  });

  // 규칙: 크랙 DOM 셀렉터는 여기만 둔다. 실제 주입 로직은 4단계에서 사용.
  const SELECTORS = Object.freeze({
    chatTitleCandidates: [
      '[data-crack-chat-title]',
      'h1',
      'title',
    ],
    root: '#coa-root',
  });


  const viewerState = {
    open: false,
    mounted: false,
    root: null,
    filters: {
      text: '',
      archiveType: '',
      tags: [],
      favoriteOnly: false,
    },
    readerId: null,
    readerCard: null,
    editCard: null,
    lastSearchFocus: false,
    searchTimer: null,
    tagScrollLeft: 0,
    cardScrollTop: 0,
    rackScrollTop: 0,
    readerScrollTop: 0,
    theme: 'auto',
    themeLoaded: false,
    viewMode: 'card',
    sortBy: 'created',
    sortDirection: 'down',
    selectionMode: false,
    selectedIds: new Set(),
    visibleIds: [],
    bulkTagOpen: false,
    rackOpenId: '',
    rackPreviewCache: new Map(),
    rackAnimate: false,
    hostThemeObserver: null,
    hostThemeMedia: null,
    hostThemeMediaListener: null,
    tagResizeObserver: null,
    cardScrollCleanup: null,
    readerScrollCleanup: null,
    rackCleanup: null,
    renderToken: 0,
  };


  const collectorState = {
    pasteModalOpen: false,
    logImportOpen: false,
    sidebarObserver: null,
    sidebarTimer: null,
    messageObserver: null,
    messageObserverRoot: null,
    messageEventRoot: null,
    messageEventHandler: null,
    messageScanTimer: null,
    rangeStartId: '',
    rangeEndId: '',
    rangeToken: 0,
    rangeBusy: false,
    rangePrepared: null,
    routeObserver: null,
    routeURL: '',
    routeListenerInstalled: false,
    observersSuspended: false,
  };

  // Tampermonkey의 레거시 GM_* 함수는 userscript sandbox의 lexical binding으로
  // 주입될 수 있어 globalThis[name] 검사로는 놓칠 수 있다. 레거시/현대 API를 직접 감지한다.
  function resolveGMStorageAPI() {
    const legacyGet = typeof GM_getValue === 'function' ? GM_getValue : null;
    const legacySet = typeof GM_setValue === 'function' ? GM_setValue : null;
    const legacyDelete = typeof GM_deleteValue === 'function' ? GM_deleteValue : null;
    const legacyList = typeof GM_listValues === 'function' ? GM_listValues : null;
    if (legacyGet && legacySet && legacyDelete && legacyList) {
      return {
        getValue: (key, fallback) => legacyGet(key, fallback),
        setValue: (key, value) => legacySet(key, value),
        deleteValue: (key) => legacyDelete(key),
        listValues: () => legacyList(),
      };
    }

    const modern = typeof GM === 'object' && GM ? GM : null;
    if (modern && typeof modern.getValue === 'function' && typeof modern.setValue === 'function'
      && typeof modern.deleteValue === 'function' && typeof modern.listValues === 'function') {
      return {
        getValue: (key, fallback) => modern.getValue(key, fallback),
        setValue: (key, value) => modern.setValue(key, value),
        deleteValue: (key) => modern.deleteValue(key),
        listValues: () => modern.listValues(),
      };
    }
    return null;
  }

  function getGMStorageAPI() {
    if (!coaStorageAPIResolved) {
      coaStorageAPI = resolveGMStorageAPI();
      coaStorageAPIResolved = true;
    }
    return coaStorageAPI;
  }


  function safeJSONParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  async function gmGet(key, fallback = null) {
    const api = getGMStorageAPI();
    if (api) {
      const value = await Promise.resolve(api.getValue(key, fallback));
      return value === undefined ? fallback : value;
    }
    const raw = localStorage.getItem(STORAGE.LS_PREFIX + key);
    return raw == null ? fallback : safeJSONParse(raw, fallback);
  }

  async function gmSet(key, value) {
    const api = getGMStorageAPI();
    if (api) {
      await Promise.resolve(api.setValue(key, value));
      return;
    }
    try {
      localStorage.setItem(STORAGE.LS_PREFIX + key, JSON.stringify(value));
    } catch (error) {
      if (error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        throw new Error('브라우저 localStorage 용량이 가득 찼습니다. Tampermonkey 저장 API가 감지되지 않아 임시 저장소를 사용하던 상태입니다. 현재 Crack Archive 버전으로 다시 실행하면 기존 데이터를 Tampermonkey 저장소로 자동 이전합니다.');
      }
      throw error;
    }
  }

  async function gmDelete(key) {
    const api = getGMStorageAPI();
    if (api) {
      await Promise.resolve(api.deleteValue(key));
      return;
    }
    localStorage.removeItem(STORAGE.LS_PREFIX + key);
  }

  async function gmList() {
    const api = getGMStorageAPI();
    if (api) {
      const values = await Promise.resolve(api.listValues());
      return Array.isArray(values) ? values : [];
    }
    const out = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE.LS_PREFIX)) {
        out.push(key.slice(STORAGE.LS_PREFIX.length));
      }
    }
    return out;
  }

  async function migrateFallbackStorageToGM() {
    const api = getGMStorageAPI();
    if (!api) return { migrated: 0, skipped: 0 };

    const prefixedKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE.LS_PREFIX)) prefixedKeys.push(key);
    }
    if (!prefixedKeys.length) return { migrated: 0, skipped: 0 };

    // 카드부터 옮겨 한 건씩 localStorage 공간을 비운 뒤, index/settings는 마지막에 처리한다.
    prefixedKeys.sort((a, b) => {
      const ak = a.slice(STORAGE.LS_PREFIX.length);
      const bk = b.slice(STORAGE.LS_PREFIX.length);
      const aw = ak.startsWith(STORAGE.CARD_PREFIX) ? 0 : (ak === STORAGE.INDEX ? 2 : 1);
      const bw = bk.startsWith(STORAGE.CARD_PREFIX) ? 0 : (bk === STORAGE.INDEX ? 2 : 1);
      return aw - bw;
    });

    let migrated = 0;
    let skipped = 0;
    for (const storageKey of prefixedKeys) {
      const key = storageKey.slice(STORAGE.LS_PREFIX.length);
      const raw = localStorage.getItem(storageKey);
      if (raw == null) continue;
      let fallbackValue;
      try { fallbackValue = JSON.parse(raw); }
      catch (_) { skipped += 1; continue; }

      try {
        const existing = await Promise.resolve(api.getValue(key, undefined));
        let nextValue = fallbackValue;
        if (existing !== undefined && key.startsWith(STORAGE.CARD_PREFIX)) {
          const oldUpdated = Number(existing?.updatedAt || existing?.createdAt || 0);
          const fallbackUpdated = Number(fallbackValue?.updatedAt || fallbackValue?.createdAt || 0);
          nextValue = fallbackUpdated >= oldUpdated ? fallbackValue : existing;
        } else if (existing !== undefined && key === STORAGE.INDEX) {
          const merged = new Map();
          for (const item of Array.isArray(existing) ? existing : []) { if (item?.id) merged.set(item.id, item); }
          for (const item of Array.isArray(fallbackValue) ? fallbackValue : []) { if (item?.id) merged.set(item.id, item); }
          nextValue = [...merged.values()];
        }
        await Promise.resolve(api.setValue(key, nextValue));
        localStorage.removeItem(storageKey);
        migrated += 1;
      } catch (error) {
        console.warn('[COA:STORE] fallback storage migration failed:', key, error);
        skipped += 1;
      }
    }
    return { migrated, skipped };
  }

  function nowMs() {
    return Date.now();
  }

  function rand4() {
    return Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  }

  function makeId() {
    return `coa_${nowMs()}_${rand4()}`;
  }

  function cardKey(id) {
    return STORAGE.CARD_PREFIX + String(id || '').trim();
  }

  function toStringValue(value) {
    return value == null ? '' : String(value);
  }

  function normalizeText(value) {
    return toStringValue(value).replace(/\r\n?/g, '\n').trim();
  }

  function splitLoose(value) {
    if (Array.isArray(value)) return value;
    return toStringValue(value)
      .split(/[#,，、,\n]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function uniqueStrings(value) {
    const seen = new Set();
    const out = [];
    for (const raw of splitLoose(value)) {
      const item = toStringValue(raw).trim();
      const key = item.toLocaleLowerCase();
      if (!item || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }


  function normalizeArchiveType(value, fallback = 'ooc') {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    if (ARCHIVE_TYPES.includes(text)) return text;
    return ARCHIVE_TYPES.includes(fallback) ? fallback : 'ooc';
  }

  function normalizeFormat(value, fallback = 'markdown') {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    if (text === 'md') return 'markdown';
    if (CONTENT_FORMATS.includes(text)) return text;
    return CONTENT_FORMATS.includes(fallback) ? fallback : 'markdown';
  }

  function hasSignificantHTMLTags(body) {
    const text = toStringValue(body).trim();
    if (!text) return false;
    const noFence = text.replace(/```[\s\S]*?```/g, '');
    const tagHits = (noFence.match(/<\/?(?:!doctype|html|head|body|main|section|article|div|p|span|br|hr|h[1-6]|blockquote|pre|code|table|thead|tbody|tr|th|td|ul|ol|li|img|a|style)\b[^>]*>/gi) || []).length;
    return /^\s*<(?:!doctype|html|body|div|section|article|table|p|h[1-6])\b/i.test(text) || tagHits >= 1 || /style=|<br\s*\/?\s*>|<p\b|<div\b/i.test(noFence);
  }

  function hasMarkdownSyntax(body) {
    const text = toStringValue(body).trim();
    if (!text) return false;
    const noFence = text.replace(/```[\s\S]*?```/g, '\n```\n');
    return (
      /^\s{0,3}#{1,6}\s+\S/m.test(noFence) ||
      /^\s{0,3}>\s+\S/m.test(noFence) ||
      /^\s*[-*+]\s+\S/m.test(noFence) ||
      /^\s*\d+\.\s+\S/m.test(noFence) ||
      /^\s*```/m.test(text) ||
      /\*\*[^*\n][\s\S]*?\*\*/.test(noFence) ||
      /__[^_\n][\s\S]*?__/.test(noFence) ||
      /`[^`\n]+`/.test(noFence) ||
      /!\[[^\]]*\]\([^)]+\)/.test(noFence) ||
      /\[[^\]]+\]\([^)]+\)/.test(noFence) ||
      /^\s*\|.+\|\s*$/m.test(noFence)
    );
  }

  function detectContentFormat(body) {
    const text = toStringValue(body).trim();
    if (!text) return 'markdown';
    const noFence = text.replace(/```[\s\S]*?```/g, '');
    const markdownish = hasMarkdownSyntax(text);
    const htmlish = hasSignificantHTMLTags(text);
    // 마크다운 표식이 확실하고 HTML 태그가 아니라면 무조건 Markdown 우선.
    // 디시/리더에서 **굵게**, # 제목이 그대로 노출되는 걸 방지한다.
    if (markdownish && !htmlish) return 'markdown';
    if (htmlish) return 'html';
    if (!markdownish && !/[#*_`>\[\]|]/.test(noFence) && noFence.includes('\n')) return 'text';
    return 'markdown';
  }

  function shouldRenderHTMLThroughMarkdown(body) {
    const text = toStringValue(body);
    if (!text.trim()) return false;
    // HTML로 저장된 카드 안에 Markdown 조각(**굵게**, |표|, >인용)이 섞이면
    // HTML sanitizer만 태우지 말고 marked를 한 번 통과시킨다. 기존 HTML 태그는 marked가 그대로 통과시키고,
    // DOMPurify가 마지막에 정화하므로 원본 저장값은 건드리지 않으면서 보기/디시 변환만 구제된다.
    if (!hasSignificantHTMLTags(text)) return false;
    return hasMarkdownSyntax(text);
  }

  function resolveRenderFormat(card) {
    const normalized = normalizeCard(card);
    const body = normalized.body || '';
    if (normalized.format === 'markdown') return 'markdown';
    // 사용자가 HTML/Text로 저장했더라도, 실제 내용이 순수 마크다운이면 렌더는 Markdown으로 구제.
    // 원본 format 값은 유지하므로 데이터 스키마/백업은 깨지지 않는다.
    if (hasMarkdownSyntax(body) && !hasSignificantHTMLTags(body)) return 'markdown';
    if (normalized.format === 'html') return 'html';
    if (normalized.format === 'text') return 'text';
    return detectContentFormat(body);
  }


  function getDCTheme(theme) {
    return DC_THEME_INLINE.clean;
  }


  function normalizeDCFont(font) {
    const text = toStringValue(font).trim().toLocaleLowerCase();
    if (Object.prototype.hasOwnProperty.call(DC_FONT_PRESETS, text)) return text;

    // 구버전 저장값, 한글/영문 별칭, 테마 추천값 호환.
    if (/noto\s*serif\s*kr|notoserifkr/.test(text)) return 'notoserifkr';
    if (/noto\s*sans\s*kr|notosanskr/.test(text)) return 'notosanskr';
    if (/nanum\s*gothic|nanumgothic|나눔\s*고딕/.test(text)) return 'nanumgothic';
    if (/dotumche|돋움체/.test(text)) return 'dotumche';
    if (/batangche|바탕체/.test(text)) return 'batangche';
    if (/gulimche|굴림체/.test(text)) return 'gulimche';
    if (/gungsuh|궁서/.test(text)) return 'gungsuh';
    if (/dotum|돋움/.test(text)) return 'dotum';
    if (/gulim|굴림/.test(text)) return 'gulim';
    if (!text || text === 'sans' || /malgun|맑은\s*고딕|gothic|고딕/.test(text)) return 'malgun';
    if (text === 'serif' || /batang|바탕|명조|newspaper|document/.test(text)) return 'batang';
    if (text === 'mono' || /mono|consolas|code|receipt|log|로그|고정/.test(text)) return 'gulimche';
    return 'malgun';
  }

  function getDCFont(font) {
    return DC_FONT_PRESETS[normalizeDCFont(font)] || DC_FONT_PRESETS.malgun;
  }

  function getDCFontOptionsHTML(selected = 'sans') {
    const clean = normalizeDCFont(selected);
    return Object.keys(DC_FONT_PRESETS)
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(DC_FONT_PRESETS[key].label)}</option>`)
      .join('');
  }

  function getSuggestedDCFontForTheme(themeKey) {
    const key = normalizeDCLogTheme(themeKey);
    if (['wongo','tajeon'].includes(key)) return 'mono';
    if (['baekjimeok','yeonji','silentfilm','seongjwa','makgan','airmail'].includes(key)) return 'serif';
    return 'sans';
  }


  function validMs(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function normalizeSource(source) {
    const input = source && typeof source === 'object' ? source : {};
    const legacyFrom = input.from === 'append' ? 'api' : input.from;
    const allowedFrom = new Set(['button', 'paste', 'api']);
    const from = allowedFrom.has(legacyFrom) ? legacyFrom : 'paste';
    return {
      url: toStringValue(input.url || location.href),
      chatTitle: toStringValue(input.chatTitle || document.title || ''),
      from,
    };
  }

  function stripMarkdown(md) {
    return toStringValue(md)
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/[*_~]+/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function makeExcerpt(body) {
    return stripMarkdown(stripDCCommentSyntax(body)).replace(/\s+/g, ' ').slice(0, 120);
  }

  function normalizeLogRole(value) {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    return /^(?:user|human|유저|사용자)$/.test(text) ? 'user' : 'assistant';
  }

  function extractAPIImagePart(part) {
    if (!part || typeof part !== 'object') return null;
    const candidates = [
      ['url', part.url],
      ['imageUrl', part.imageUrl],
      ['image_url', part.image_url],
      ['src', part.src],
      ['image.url', part.image && part.image.url],
      ['image.src', part.image && part.image.src],
      ['content.url', part.content && typeof part.content === 'object' && part.content.url],
      ['content.src', part.content && typeof part.content === 'object' && part.content.src],
    ];
    const type = toStringValue(part.type || part.kind || part.contentType || part.mimeType).toLocaleLowerCase();
    const found = candidates.find(([, value]) => typeof value === 'string' && /^https?:\/\//i.test(value.trim()));
    if (!found) return null;
    const imageLike = /image|photo|picture|media/.test(type)
      || /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#].*)?$/i.test(found[1].trim())
      || /image/i.test(found[0]);
    if (!imageLike) return null;
    return found[1].trim();
  }

  function extractAPIMessageContent(message) {
    if (!message || typeof message !== 'object') return '';
    const renderPart = (part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const imageURL = extractAPIImagePart(part);
      if (imageURL) return `![](${imageURL})`;
      const textValue = [part.text, part.content, part.value].find((value) => typeof value === 'string');
      return toStringValue(textValue || '');
    };
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content.map(renderPart).filter(Boolean).join('\n');
    }
    if (message.content && typeof message.content === 'object') {
      return renderPart(message.content);
    }
    return toStringValue(message.text || message.body || '');
  }

  // 로어 확장 기능이 삽입한 <ooc_lore_context>...</ooc_lore_context>를
  // 로그 본문/메시지에서 통째로 제거한다. 한 줄·여러 줄·미종료·자기닫힘 태그를 처리한다.
  // OOC 저장함 카드 자체에는 적용하지 않는다.
  function stripCOALoreContextBlocks(value) {
    return toStringValue(value)
      .replace(/<ooc_lore_context\b[^>]*>[\s\S]*?<\/ooc_lore_context\s*>/gi, '')
      .replace(/<ooc_lore_context\b[^>]*\/\s*>/gi, '')
      .replace(/<ooc_lore_context\b[^>]*>[\s\S]*$/gi, '')
      .replace(/<\/ooc_lore_context\s*>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeLogMessage(input, index = 0, fallbackSpeaker = 'AI') {
    const raw = input && typeof input === 'object' ? input : {};
    const role = normalizeLogRole(raw.role || raw.author || raw.type);
    const content = stripCOALoreContextBlocks(typeof raw.content === 'string' ? raw.content : extractAPIMessageContent(raw));
    const sourceId = normalizeText(raw.id || raw._id || raw.messageId);
    const speaker = role === 'user'
      ? 'USER'
      : normalizeText(raw.speaker || raw.characterName || raw.name) || fallbackSpeaker || 'AI';
    return {
      id: sourceId || `coa_msg_${index}_${Math.random().toString(36).slice(2, 8)}`,
      role,
      speaker,
      content,
      createdAt: (() => { const value = raw.createdAt || raw.created_at || raw.timestamp; const parsed = typeof value === 'string' ? Date.parse(value) : Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; })(),
    };
  }

  function buildLogBody(messages) {
    return (Array.isArray(messages) ? messages : []).map((message) => {
      const role = normalizeLogRole(message.role) === 'user' ? 'User' : 'AI';
      return `[${role}]\n${toStringValue(message.content)}`;
    }).join('\n\n===\n\n');
  }

  function normalizeLogData(value, fallbackBody = '') {
    const raw = value && typeof value === 'object' ? value : null;
    if (!raw || !Array.isArray(raw.messages)) return null;
    const fallbackSpeaker = normalizeText(raw.characterName || raw.speaker) || 'AI';
    const seen = new Set();
    const messages = [];
    raw.messages.forEach((message, index) => {
      const normalized = normalizeLogMessage(message, index, fallbackSpeaker);
      if (!normalizeText(normalized.content) || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      messages.push(normalized);
    });
    if (!messages.length && !normalizeText(fallbackBody)) return null;
    return {
      schema: 1,
      chatroomId: normalizeText(raw.chatroomId || raw.chatRoomId),
      characterId: normalizeText(raw.characterId),
      characterName: fallbackSpeaker,
      firstMessageId: normalizeText(raw.firstMessageId) || (messages[0]?.id || ''),
      lastMessageId: normalizeText(raw.lastMessageId) || (messages[messages.length - 1]?.id || ''),
      messageCount: messages.length,
      messages,
      importedAt: validMs(raw.importedAt, nowMs()),
    };
  }

  function getStructuredLogMessages(card) {
    const normalized = card && typeof card === 'object' ? card : {};
    return Array.isArray(normalized.log?.messages) ? normalized.log.messages : [];
  }

  function normalizeCard(input, options = {}) {
    const base = input && typeof input === 'object' ? input : {};
    const createdAt = validMs(base.createdAt, nowMs());
    const updatedAt = validMs(base.updatedAt, createdAt);
    const id = options.forceNewId ? makeId() : normalizeText(base.id) || makeId();
    const title = normalizeText(base.title) || '제목 없음';
    const archiveType = normalizeArchiveType(base.archiveType || base.bucket || base.archive, 'ooc');
    const rawBodyInput = toStringValue(base.body || '');
    const rawBody = archiveType === 'log' ? stripCOALoreContextBlocks(rawBodyInput) : rawBodyInput;
    const log = archiveType === 'log' ? normalizeLogData(base.log || base.logData, rawBody) : null;
    const body = rawBody || (log?.messages?.length ? buildLogBody(log.messages) : '');
    const format = normalizeFormat(base.format || base.contentFormat, detectContentFormat(body));
    const rawView = base.view && typeof base.view === 'object' ? base.view : {};
    const rawDC = base.dc && typeof base.dc === 'object' ? base.dc : {};
    const rawHtmlLayout = rawView.htmlLayout || base.htmlLayout;
    const htmlLayout = archiveType === 'log'
      ? normalizeLogHTMLLayout(rawHtmlLayout)
      : normalizeOOCHTMLLayout(rawHtmlLayout);
    const migratedSpecColor = toStringValue(rawHtmlLayout).trim().toLocaleLowerCase() === 'specsheetdark' ? 'dark' : '';
    const htmlColor = archiveType === 'log'
      ? normalizeLogHTMLColor(migratedSpecColor || rawView.htmlColor || rawView.colorTheme || rawView.htmlTheme || base.htmlColor || base.htmlTheme || base.theme, htmlLayout)
      : 'default';
    const view = {
      htmlLayout,
      htmlColor,
      // 구버전 백업/외부 코드 호환용 별칭. 새 UI와 렌더는 htmlColor를 사용한다.
      htmlTheme: htmlColor,
      fontFamily: normalizeCOAFont(rawView.fontFamily || base.fontFamily),
      smartTable: false,
    };
    const rawDCTheme = rawDC.logTheme || base.logTheme || DC_DEFAULT_OPTIONS.logTheme;
    const normalizedDCTheme = normalizeDCLogTheme(rawDCTheme);
    const rawDCColor = rawDC.logColor || base.logColor || (toStringValue(rawDCTheme).trim().toLocaleLowerCase() === 'specsheetdark' ? 'dark' : '');
    const dc = {
      logTheme: normalizedDCTheme,
      logColor: normalizeDCLogColor(rawDCColor, rawDCTheme),
    };

    const migratedTags = uniqueStrings([
      ...uniqueStrings(base.tags),
      ...uniqueStrings(base.characters),
      normalizeText(base.world),
    ]);

    return {
      id,
      v: 3,
      archiveType,
      format,
      title,
      characters: [],
      world: '',
      tags: migratedTags,
      favorite: Boolean(base.favorite ?? base.starred ?? base.pinned),
      body,
      log,
      view,
      dc,
      createdAt,
      updatedAt,
      source: normalizeSource(base.source),
    };
  }


  function normalizeExportReplacementRules(value) {
    const source = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const item of source) {
      const raw = item && typeof item === 'object' ? item : {};
      const from = toStringValue(raw.from ?? raw.find ?? raw.source).trim();
      const to = toStringValue(raw.to ?? raw.replace ?? raw.target);
      if (!from || seen.has(from)) continue;
      seen.add(from);
      out.push({ from, to });
    }
    return out.slice(0, 100);
  }

  function replaceExportText(value, rules) {
    let text = toStringValue(value);
    const cleanRules = normalizeExportReplacementRules(rules);
    if (!text || !cleanRules.length) return text;

    // 이미지/링크가 깨지지 않게 실제 주소만 잠시 보호한다.
    // 보이는 링크 문구·alt·본문·코드 내용은 치환 대상이다.
    const protectedValues = [];
    const protect = (match) => {
      const token = `\uE000COAURL${protectedValues.length}\uE001`;
      protectedValues.push(match);
      return token;
    };
    text = text.replace(/\b(?:src|href)\s*=\s*(["'])[\s\S]*?\1/gi, protect);
    text = text.replace(/https?:\/\/[^\s<>"']+/gi, protect);

    for (const rule of cleanRules) {
      if (!rule.from) continue;
      text = text.split(rule.from).join(rule.to);
    }
    return text.replace(/\uE000COAURL(\d+)\uE001/g, (_, index) => protectedValues[Number(index)] || '');
  }

  function applyExportReplacementsToCard(card, rules) {
    const normalized = normalizeCard(card);
    const cleanRules = normalizeExportReplacementRules(rules);
    if (!cleanRules.length) return normalized;
    const next = JSON.parse(JSON.stringify(normalized));
    next.title = replaceExportText(next.title, cleanRules);
    next.tags = (next.tags || []).map((tag) => replaceExportText(tag, cleanRules));
    next.body = replaceExportText(next.body, cleanRules);
    if (next.log && typeof next.log === 'object') {
      next.log.characterName = replaceExportText(next.log.characterName, cleanRules);
      if (Array.isArray(next.log.messages)) {
        next.log.messages = next.log.messages.map((message) => ({
          ...message,
          speaker: replaceExportText(message?.speaker, cleanRules),
          content: replaceExportText(message?.content, cleanRules),
        }));
      }
    }
    return next;
  }

  async function getExportReplacementRules() {
    const settings = await coaLoadSettings();
    return normalizeExportReplacementRules(settings.exportReplacements);
  }

  async function prepareCardForExport(card, options = {}) {
    const normalized = normalizeCard(card);
    if (options.applyReplacements !== true) return normalized;
    const rules = Array.isArray(options.replacementRules)
      ? normalizeExportReplacementRules(options.replacementRules)
      : await getExportReplacementRules();
    return applyExportReplacementsToCard(normalized, rules);
  }

  function metaFromCard(card) {
    const normalized = normalizeCard(card);
    return {
      id: normalized.id,
      archiveType: normalized.archiveType,
      format: normalized.format,
      title: normalized.title,
      characters: [],
      world: '',
      tags: normalized.tags,
      favorite: normalized.favorite,
      excerpt: makeExcerpt(normalized.body),
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };
  }

  function normalizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const id = normalizeText(meta.id);
    if (!id) return null;
    return {
      id,
      archiveType: normalizeArchiveType(meta.archiveType || meta.bucket || meta.archive, 'ooc'),
      format: normalizeFormat(meta.format || meta.contentFormat, 'markdown'),
      title: normalizeText(meta.title) || '제목 없음',
      characters: [],
      world: '',
      tags: uniqueStrings([
        ...uniqueStrings(meta.tags),
        ...uniqueStrings(meta.characters),
        normalizeText(meta.world),
      ]),
      favorite: Boolean(meta.favorite ?? meta.starred ?? meta.pinned),
      excerpt: toStringValue(meta.excerpt).slice(0, 120),
      createdAt: validMs(meta.createdAt, 0),
      updatedAt: validMs(meta.updatedAt, validMs(meta.createdAt, 0)),
    };
  }

  function sortIndexDefault(index) {
    return [...index].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function syncIndexRuntimeCache(index) {
    const sorted = sortIndexDefault(Array.isArray(index) ? index : []);
    coaIndexRuntimeCache = sorted.slice();
    coaIndexRuntimeCacheReady = true;
    return coaIndexRuntimeCache.slice();
  }

  function mergeIndexMetas(index, metas) {
    const replacements = new Map();
    for (const meta of Array.isArray(metas) ? metas : []) {
      if (meta?.id) replacements.set(meta.id, meta);
    }
    const out = [];
    const placed = new Set();
    for (const item of index) {
      if (!item?.id) continue;
      const replacement = replacements.get(item.id);
      if (replacement) {
        if (!placed.has(item.id)) out.push(replacement);
        placed.add(item.id);
        continue;
      }
      out.push(item);
    }
    replacements.forEach((meta, id) => { if (!placed.has(id)) out.push(meta); });
    return sortIndexDefault(out);
  }

  function replaceIndexMeta(index, meta) {
    return mergeIndexMetas(index, [meta]);
  }

  function removeIndexMeta(index, id) {
    return index.filter((item) => item && item.id !== id);
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
      reader.readAsText(file, 'utf-8');
    });
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stampForFilename() {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  function escapeHTML(value) {
    return toStringValue(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadAllCardsFromKeys() {
    const keys = await gmList();
    const cards = [];
    for (const key of keys) {
      if (!key.startsWith(STORAGE.CARD_PREFIX)) continue;
      const raw = await gmGet(key, null);
      if (!raw || typeof raw !== 'object') continue;
      const storageId = normalizeText(key.slice(STORAGE.CARD_PREFIX.length));
      const card = normalizeCard({ ...raw, id: storageId || raw.id });
      if (!card.id) continue;
      cards.push(card);
    }
    return cards.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function coaLoadIndex(options = {}) {
    if (!options.force && coaIndexRuntimeCacheReady) return coaIndexRuntimeCache.slice();
    const raw = await gmGet(STORAGE.INDEX, []);
    if (!Array.isArray(raw)) {
      console.warn('[COA:STORE] invalid index detected; rebuilding from card keys.');
      return coaRebuildIndex();
    }
    const out = [];
    const seen = new Set();
    const repairIds = new Set();
    let indexNeedsCleanup = false;
    for (const item of raw) {
      const meta = normalizeMeta(item);
      if (!meta || seen.has(meta.id)) {
        indexNeedsCleanup = true;
        continue;
      }
      seen.add(meta.id);
      out.push(meta);
      if (!validMs(item?.updatedAt, 0)) repairIds.add(meta.id);
    }

    // 구버전 인덱스에는 updatedAt이 없으므로 카드 원본에서 한 번만 복구한다.
    // 복구한 메타를 즉시 저장해 이후 보관함 열기에서는 카드 전체를 다시 읽지 않는다.
    if (repairIds.size) {
      const repaired = [];
      for (const meta of out) {
        if (!repairIds.has(meta.id)) {
          repaired.push(meta);
          continue;
        }
        const card = await coaLoadCard(meta.id);
        repaired.push(card ? metaFromCard(card) : meta);
      }
      const sorted = sortIndexDefault(repaired);
      try {
        await gmSet(STORAGE.INDEX, sorted);
      } catch (error) {
        console.warn('[COA:STORE] index updatedAt repair save failed:', error);
      }
      return syncIndexRuntimeCache(sorted);
    }
    if (indexNeedsCleanup) {
      const sorted = sortIndexDefault(out);
      try {
        await gmSet(STORAGE.INDEX, sorted);
      } catch (error) {
        console.warn('[COA:STORE] duplicate/invalid index cleanup save failed:', error);
      }
      return syncIndexRuntimeCache(sorted);
    }
    return syncIndexRuntimeCache(out);
  }

  async function coaLoadRawCard(id) {
    const cleanId = normalizeText(id);
    if (!cleanId) return null;
    const raw = await gmGet(cardKey(cleanId), null);
    return raw && typeof raw === 'object' ? raw : null;
  }

  async function coaLoadCard(id) {
    const cleanId = normalizeText(id);
    if (!cleanId) return null;
    const raw = await coaLoadRawCard(cleanId);
    if (!raw) return null;
    const card = normalizeCard(raw);
    return card.id === cleanId ? card : { ...card, id: cleanId };
  }

  function clearSearchCorpusCache(id = '') {
    const cleanId = normalizeText(id);
    if (!cleanId) {
      coaSearchCorpusCache.clear();
      coaSearchCorpusCacheSize = 0;
      return;
    }
    const cached = coaSearchCorpusCache.get(cleanId);
    if (!cached) return;
    coaSearchCorpusCacheSize = Math.max(0, coaSearchCorpusCacheSize - cached.size);
    coaSearchCorpusCache.delete(cleanId);
  }

  function cacheSearchCorpus(meta, text) {
    const id = normalizeText(meta?.id);
    const corpus = toStringValue(text);
    const size = corpus.length;
    if (!id || !corpus) return corpus;
    clearSearchCorpusCache(id);
    if (size > COA_SEARCH_CORPUS_CACHE_LIMIT) return corpus;
    while (coaSearchCorpusCache.size && coaSearchCorpusCacheSize + size > COA_SEARCH_CORPUS_CACHE_LIMIT) {
      const oldestId = coaSearchCorpusCache.keys().next().value;
      clearSearchCorpusCache(oldestId);
    }
    coaSearchCorpusCache.set(id, {
      updatedAt: validMs(meta?.updatedAt, validMs(meta?.createdAt, 0)),
      text: corpus,
      size,
    });
    coaSearchCorpusCacheSize += size;
    return corpus;
  }

  async function getCardSearchCorpus(meta) {
    const id = normalizeText(meta?.id);
    const updatedAt = validMs(meta?.updatedAt, validMs(meta?.createdAt, 0));
    const cached = coaSearchCorpusCache.get(id);
    if (cached && cached.updatedAt === updatedAt) {
      coaSearchCorpusCache.delete(id);
      coaSearchCorpusCache.set(id, cached);
      return cached.text;
    }
    if (cached) clearSearchCorpusCache(id);
    const raw = await coaLoadRawCard(id);
    const body = typeof raw?.body === 'string' ? raw.body : toStringValue(meta?.excerpt);
    const corpus = [
      meta?.title,
      stripDCCommentSyntax(body),
      Array.isArray(meta?.tags) ? meta.tags.join(' ') : '',
    ].join(' ').toLocaleLowerCase();
    return cacheSearchCorpus(meta, corpus);
  }

  async function coaSaveCard(card) {
    const normalized = normalizeCard(card);
    const key = cardKey(normalized.id);
    const oldCard = await coaLoadRawCard(normalized.id);
    const oldIndex = await coaLoadIndex();
    const nextIndex = replaceIndexMeta(oldIndex, metaFromCard(normalized));

    try {
      await gmSet(key, normalized);
      await gmSet(STORAGE.INDEX, nextIndex);
      syncIndexRuntimeCache(nextIndex);
      viewerState.rackPreviewCache.delete(normalized.id);
      clearSearchCorpusCache(normalized.id);
      return normalized;
    } catch (error) {
      try {
        if (oldCard) await gmSet(key, oldCard);
        else await gmDelete(key);
        await gmSet(STORAGE.INDEX, oldIndex);
      } catch (rollbackError) {
        console.warn('[COA:STORE] save rollback failed:', rollbackError);
      }
      throw error;
    }
  }

  async function coaDeleteCard(id) {
    const cleanId = normalizeText(id);
    if (!cleanId) return false;
    const key = cardKey(cleanId);
    const oldCard = await coaLoadRawCard(cleanId);
    const oldIndex = await coaLoadIndex();
    const nextIndex = removeIndexMeta(oldIndex, cleanId);

    try {
      await gmDelete(key);
      await gmSet(STORAGE.INDEX, nextIndex);
      syncIndexRuntimeCache(nextIndex);
      viewerState.rackPreviewCache.delete(cleanId);
      clearSearchCorpusCache(cleanId);
      return Boolean(oldCard || oldIndex.some((item) => item.id === cleanId));
    } catch (error) {
      try {
        if (oldCard) await gmSet(key, oldCard);
        await gmSet(STORAGE.INDEX, oldIndex);
      } catch (rollbackError) {
        console.warn('[COA:STORE] delete rollback failed:', rollbackError);
      }
      throw error;
    }
  }

  async function coaSaveCardsBatch(cards) {
    const normalizedCards = (Array.isArray(cards) ? cards : []).map((card) => normalizeCard(card));
    if (!normalizedCards.length) return [];
    const oldIndex = await coaLoadIndex();
    const oldCards = new Map(await Promise.all(normalizedCards.map(async (card) => [card.id, await coaLoadRawCard(card.id)])));
    const nextIndex = mergeIndexMetas(oldIndex, normalizedCards.map(metaFromCard));

    const writtenIds = [];
    try {
      for (const card of normalizedCards) {
        await gmSet(cardKey(card.id), card);
        writtenIds.push(card.id);
      }
      await gmSet(STORAGE.INDEX, nextIndex);
      syncIndexRuntimeCache(nextIndex);
      normalizedCards.forEach((card) => {
        viewerState.rackPreviewCache.delete(card.id);
        clearSearchCorpusCache(card.id);
      });
      return normalizedCards;
    } catch (error) {
      try {
        for (const id of writtenIds) {
          const oldCard = oldCards.get(id);
          if (oldCard) await gmSet(cardKey(id), oldCard);
          else await gmDelete(cardKey(id));
        }
        await gmSet(STORAGE.INDEX, oldIndex);
        syncIndexRuntimeCache(oldIndex);
      } catch (rollbackError) {
        console.warn('[COA:STORE] batch save rollback failed:', rollbackError);
      }
      throw error;
    }
  }

  async function coaDeleteCardsBatch(ids) {
    const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map(normalizeText).filter(Boolean))];
    if (!cleanIds.length) return 0;
    const idSet = new Set(cleanIds);
    const oldIndex = await coaLoadIndex();
    const oldCards = new Map(await Promise.all(cleanIds.map(async (id) => [id, await coaLoadRawCard(id)])));
    const nextIndex = oldIndex.filter((item) => item && !idSet.has(item.id));
    const oldIndexIds = new Set(oldIndex.map((item) => item?.id).filter(Boolean));
    const deletedIds = [];
    try {
      for (const id of cleanIds) {
        await gmDelete(cardKey(id));
        deletedIds.push(id);
      }
      await gmSet(STORAGE.INDEX, nextIndex);
      syncIndexRuntimeCache(nextIndex);
      cleanIds.forEach((id) => {
        viewerState.rackPreviewCache.delete(id);
        clearSearchCorpusCache(id);
      });
      return cleanIds.filter((id) => oldCards.get(id) || oldIndexIds.has(id)).length;
    } catch (error) {
      try {
        for (const id of deletedIds) {
          const oldCard = oldCards.get(id);
          if (oldCard) await gmSet(cardKey(id), oldCard);
        }
        await gmSet(STORAGE.INDEX, oldIndex);
        syncIndexRuntimeCache(oldIndex);
      } catch (rollbackError) {
        console.warn('[COA:STORE] batch delete rollback failed:', rollbackError);
      }
      throw error;
    }
  }

  async function coaRebuildIndex() {
    const cards = await loadAllCardsFromKeys();
    const metas = sortIndexDefault(cards.map(metaFromCard));
    await gmSet(STORAGE.INDEX, metas);
    clearSearchCorpusCache();
    return syncIndexRuntimeCache(metas);
  }

  async function coaExportJSON() {
    const cards = await loadAllCardsFromKeys();
    const payload = {
      schema: 2,
      exportedAt: nowMs(),
      cards,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadBlob(`crack-archive-backup-${stampForFilename()}.json`, blob);
    return payload;
  }

  async function coaExportSelectedJSON(ids) {
    const cleanIds = [...new Set((Array.isArray(ids) ? ids : []).map(normalizeText).filter(Boolean))];
    const cards = [];
    for (const id of cleanIds) {
      const card = await coaLoadCard(id);
      if (card) cards.push(card);
    }
    if (!cards.length) throw new Error('백업할 선택 카드가 없습니다.');
    const payload = {
      schema: 2,
      exportedAt: nowMs(),
      selection: true,
      cards,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    downloadBlob(`crack-archive-selected-${cards.length}-${stampForFilename()}.json`, blob);
    return payload;
  }

  async function coaImportJSON(file) {
    if (!file) throw new Error('불러올 JSON 파일이 없습니다.');
    const text = await readFileAsText(file);
    const parsed = JSON.parse(text);
    const incomingCards = Array.isArray(parsed?.cards)
      ? parsed.cards
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (!incomingCards.length) {
      return { imported: 0, skipped: 0, reassignedIds: [] };
    }

    const index = await coaLoadIndex();
    const knownIds = new Set(index.map((item) => item.id));
    const existingKeys = await gmList();
    for (const key of existingKeys) {
      if (key.startsWith(STORAGE.CARD_PREFIX)) {
        knownIds.add(key.slice(STORAGE.CARD_PREFIX.length));
      }
    }

    let skipped = 0;
    const reassignedIds = [];
    const preparedCards = [];

    for (const rawCard of incomingCards) {
      if (!rawCard || typeof rawCard !== 'object') {
        skipped += 1;
        continue;
      }

      const rawLogMessages = rawCard.log?.messages || rawCard.logData?.messages;
      if (!normalizeText(rawCard.title) && !normalizeText(rawCard.body)
        && !(Array.isArray(rawLogMessages) && rawLogMessages.length)) {
        skipped += 1;
        continue;
      }

      let card = normalizeCard(rawCard);
      const originalId = card.id;

      if (!card.id || knownIds.has(card.id)) {
        card = normalizeCard({ ...card, id: makeId() });
        while (knownIds.has(card.id)) {
          card = normalizeCard({ ...card, id: makeId() });
        }
        reassignedIds.push({ from: originalId || null, to: card.id });
      }

      knownIds.add(card.id);
      preparedCards.push(card);
    }

    if (preparedCards.length) await coaSaveCardsBatch(preparedCards);
    return { imported: preparedCards.length, skipped, reassignedIds };
  }


  async function coaQuery(filters = {}, indexOverride = null) {
    const index = Array.isArray(indexOverride) ? indexOverride : await coaLoadIndex();
    const text = normalizeText(filters.text).toLocaleLowerCase();
    const archiveType = normalizeArchiveType(filters.archiveType, '');
    const hasArchiveFilter = ARCHIVE_TYPES.includes(normalizeText(filters.archiveType).toLocaleLowerCase());
    const tags = uniqueStrings(filters.tags).map((item) => item.toLocaleLowerCase());
    const favoriteOnly = filters.favoriteOnly === true;

    const candidates = index.filter((meta) => {
      if (hasArchiveFilter && meta.archiveType !== archiveType) return false;
      if (favoriteOnly && !meta.favorite) return false;
      const metaTags = meta.tags.map((item) => item.toLocaleLowerCase());
      return !tags.length || tags.every((item) => metaTags.includes(item));
    });
    if (!text) return candidates;

    const matched = [];
    for (const meta of candidates) {
      const haystack = await getCardSearchCorpus(meta);
      if (haystack.includes(text)) matched.push(meta);
    }
    return matched;
  }

  function splitMarkdownTableRow(line) {
    let text = toStringValue(line).trim();
    if (!text.includes('|')) return [];
    if (text.startsWith('|')) text = text.slice(1);
    if (text.endsWith('|')) text = text.slice(0, -1);
    const cells = [];
    let buf = '';
    let escaped = false;
    for (const ch of text) {
      if (escaped) {
        buf += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '|') {
        cells.push(buf.trim());
        buf = '';
        continue;
      }
      buf += ch;
    }
    cells.push(buf.trim());
    return cells;
  }

  function isMarkdownTableSeparator(line) {
    const cells = splitMarkdownTableRow(line);
    if (!cells.length) return false;
    return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
  }

  function isMarkdownPipeLikeLine(line) {
    const text = toStringValue(line).trim();
    if (!text.includes('|')) return false;
    if (/^\s*(?:```|>|#{1,6}\s+)/.test(text)) return false;
    return splitMarkdownTableRow(text).length >= 1;
  }

  function isMarkdownPipeTableStart(lines, index) {
    const header = splitMarkdownTableRow(lines[index] || '');
    if (header.length < 1) return false;
    if (!isMarkdownTableSeparator(lines[index + 1] || '')) return false;
    // | 항목 | 관찰 기록 | 다음 줄이 |---| 처럼 느슨하게 와도 표로 본다.
    // AI 출력에서 구분선 칸 수가 틀어지는 경우가 잦아서, header 기준으로 보정한다.
    return header.some(Boolean);
  }

  function renderMarkdownInlineLite(value) {
    // marked가 차단되어 내장 렌더러로 내려가도 이미지/링크를 평문으로
    // 흘리지 않는다. 특히 크랙 상황 이미지 URL은 확장자가 없는 경우가 많으므로
    // ![alt](https://...) 형식 자체를 기준으로 이미지인지 판별한다.
    let source = toStringValue(value);
    const inlineTokens = [];
    const stash = (html) => {
      const token = `\uE000COAINLINE${inlineTokens.length}\uE001`;
      inlineTokens.push(html);
      return token;
    };

    // 인라인 코드를 가장 먼저 보호해 코드 안의 Markdown 이미지/링크를 렌더하지 않는다.
    source = source.replace(/`([^`\n]+)`/g, (_m, code) => stash(`<code>${escapeHTML(code)}</code>`));

    // 주석 이미지 복원기가 만들어 둔 안전한 raw <img>도 fallback에서 다시 평문이 되지 않게 보호한다.
    source = source.replace(/<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi, (match, url) => {
      const altMatch = match.match(/\balt\s*=\s*["']([^"']*)["']/i);
      const alt = altMatch ? altMatch[1] : '첨부 이미지';
      return stash(`<img src="${escapeHTML(url)}" alt="${escapeHTML(alt)}">`);
    });

    // Markdown 이미지. URL 확장자 유무와 무관하게 표시한다.
    source = source.replace(/!\[([^\]\n]*)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/gi, (_m, alt, url) => (
      stash(`<img src="${escapeHTML(url)}" alt="${escapeHTML(alt || '첨부 이미지')}">`)
    ));

    // 일반 Markdown 링크도 fallback에서 클릭 가능한 링크로 유지한다.
    source = source.replace(/(^|[^!])\[([^\]\n]+)\]\(\s*(https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/gi, (_m, prefix, label, url) => (
      `${prefix}${stash(`<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(label)}</a>`)}`
    ));

    let out = escapeHTML(source);
    out = out
      .replace(/\*\*([^*\n][\s\S]*?[^*\n])\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n][\s\S]*?[^_\n])__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

    inlineTokens.forEach((html, i) => {
      out = out.replace(`\uE000COAINLINE${i}\uE001`, html);
    });
    return out;
  }

  function renderMarkdownPipeTableHTML(tableLines) {
    const header = splitMarkdownTableRow(tableLines[0] || '');
    const separators = splitMarkdownTableRow(tableLines[1] || '');
    const colCount = Math.max(header.length, 1);
    const alignOf = (cell) => {
      const text = toStringValue(cell).replace(/\s+/g, '');
      if (/^:-+:$/.test(text)) return 'center';
      if (/-+:$/.test(text)) return 'right';
      if (/^:-+/.test(text)) return 'left';
      return '';
    };
    const normalizeCells = (cells) => Array.from({ length: colCount }, (_, i) => cells[i] || '');
    const aligns = normalizeCells(separators).map(alignOf);
    const ths = normalizeCells(header).map((cell, i) => {
      const align = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
      return `<th${align}>${renderMarkdownInlineLite(cell) || '&nbsp;'}</th>`;
    }).join('');
    const bodyRows = tableLines.slice(2)
      .map((line) => splitMarkdownTableRow(line))
      .filter((cells) => cells.length >= 1);
    const trs = bodyRows.map((cells) => {
      // AI가 | 항목 | 관찰 기록 | / |---| 뒤에 |긴 문장|만 주는 식으로
      // 칸 수를 깨뜨리면, 한 칸짜리 행은 colspan으로 자연스럽게 보정한다.
      if (cells.length === 1 && colCount > 1) {
        const align = aligns[0] ? ` style="text-align:${aligns[0]}"` : '';
        return `<tr><td${align} colspan="${colCount}">${renderMarkdownInlineLite(cells[0]) || '&nbsp;'}</td></tr>`;
      }
      const tds = normalizeCells(cells).map((cell, i) => {
        const align = aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
        return `<td${align}>${renderMarkdownInlineLite(cell) || '&nbsp;'}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('\n');
    return `<table>\n<thead><tr>${ths}</tr></thead>\n<tbody>${trs}</tbody>\n</table>`;
  }

  function stripMarkdownQuoteMarker(line) {
    const match = toStringValue(line).match(/^\s*>\s?(.*)$/);
    return match ? match[1] : toStringValue(line);
  }

  function isMarkdownQuoteStart(line) {
    return /^\s*>\s?.*/.test(toStringValue(line));
  }

  function renderMarkdownQuoteHTML(quoteLines) {
    // 인용문 안의 ### 제목, 표, 목록, 이미지, 인라인 코드를 평문으로 낮추지 않는다.
    // 바깥의 > 한 겹만 벗긴 뒤 동일 Markdown 렌더러로 다시 처리한다. >> 중첩 인용은
    // 호출마다 한 겹씩 줄어드므로 재귀가 유한하게 끝난다.
    const source = quoteLines.map(stripMarkdownQuoteMarker).join('\n').trim();
    if (!source) return '<blockquote>&nbsp;</blockquote>';
    const body = coaRenderMarkdown(source) || '<p>&nbsp;</p>';
    return `<blockquote>${body}</blockquote>`;
  }

  function preprocessMarkdownPipeTables(md) {
    const lines = toStringValue(md).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let inFence = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        out.push(line);
        continue;
      }
      // GFM 파이프 표가 환경에 따라 평문으로 남는 경우를 피하려고
      // | 제목 | 제목 | + |---|---| 블록은 직접 HTML table로 먼저 바꾼다.
      if (!inFence && isMarkdownPipeTableStart(lines, i)) {
        const tableLines = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length) {
          const row = lines[i];
          if (!row.trim() || /^\s*```/.test(row) || !isMarkdownPipeLikeLine(row)) break;
          tableLines.push(row);
          i += 1;
        }
        i -= 1;
        out.push('', renderMarkdownPipeTableHTML(tableLines), '');
        continue;
      }
      // 인용도 직접 HTML blockquote로 보정한다.
      // > 인용 / > **굵게** 가 자동 구조화나 디시 변환에서 평문으로 새는 것을 방지한다.
      if (!inFence && isMarkdownQuoteStart(line)) {
        const quoteLines = [line];
        i += 1;
        while (i < lines.length) {
          const row = lines[i];
          if (!isMarkdownQuoteStart(row)) break;
          quoteLines.push(row);
          i += 1;
        }
        i -= 1;
        out.push('', renderMarkdownQuoteHTML(quoteLines), '');
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  function coaRenderMarkdownFallback(md) {
    // marked CDN이 차단/미로드되면 **굵게**, *톤다운*, >인용, |표|가
    // 평문으로 새던 문제를 막는 COA 내장 최소 Markdown 렌더러.
    // 저장 원문은 절대 바꾸지 않고, 보기/PNG/DC 내보내기 렌더 단계에서만 쓴다.
    const lines = toStringValue(md).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = null;
    let inFence = false;
    let fenceLang = '';
    let fenceLines = [];

    const closeList = () => {
      if (!list) return;
      out.push(`<${list.type}>${list.items.map((item) => `<li>${renderMarkdownInlineLite(item)}</li>`).join('')}</${list.type}>`);
      list = null;
    };
    const flushParagraph = () => {
      const text = paragraph.join('\n').trim();
      paragraph = [];
      if (!text) return;
      closeList();
      out.push(`<p>${text.split('\n').map((line) => renderMarkdownInlineLite(line)).join('<br>')}</p>`);
    };
    const flushFence = () => {
      const body = escapeHTML(fenceLines.join('\n'));
      const cls = fenceLang ? ` data-lang="${escapeHTML(fenceLang)}"` : '';
      out.push(`<pre${cls}><code>${body}</code></pre>`);
      fenceLines = [];
      fenceLang = '';
      inFence = false;
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();

      const fence = line.match(/^\s*```\s*([^`]*)$/);
      if (fence) {
        if (inFence) {
          flushFence();
        } else {
          flushParagraph();
          closeList();
          inFence = true;
          fenceLang = (fence[1] || '').trim();
          fenceLines = [];
        }
        continue;
      }
      if (inFence) {
        fenceLines.push(line);
        continue;
      }

      if (!trimmed) {
        flushParagraph();
        closeList();
        continue;
      }

      if (isMarkdownPipeTableStart(lines, i)) {
        flushParagraph();
        closeList();
        const tableLines = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length) {
          const row = lines[i];
          if (!row.trim() || /^\s*```/.test(row) || !isMarkdownPipeLikeLine(row)) break;
          tableLines.push(row);
          i += 1;
        }
        i -= 1;
        out.push(renderMarkdownPipeTableHTML(tableLines));
        continue;
      }

      if (isMarkdownQuoteStart(line)) {
        flushParagraph();
        closeList();
        const quoteLines = [line];
        i += 1;
        while (i < lines.length && isMarkdownQuoteStart(lines[i])) {
          quoteLines.push(lines[i]);
          i += 1;
        }
        i -= 1;
        out.push(renderMarkdownQuoteHTML(quoteLines));
        continue;
      }

      if (/^\s*(?:---|===|___)\s*$/.test(trimmed)) {
        flushParagraph();
        closeList();
        out.push('<hr>');
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = Math.min(6, heading[1].length);
        out.push(`<h${level}>${renderMarkdownInlineLite(heading[2])}</h${level}>`);
        continue;
      }

      const ul = line.match(/^\s*[-*+]\s+(.+)$/);
      const ol = line.match(/^\s*\d+\.\s+(.+)$/);
      if (ul || ol) {
        flushParagraph();
        const type = ul ? 'ul' : 'ol';
        if (!list || list.type !== type) {
          closeList();
          list = { type, items: [] };
        }
        list.items.push((ul || ol)[1]);
        continue;
      }

      closeList();
      paragraph.push(line);
    }

    if (inFence) flushFence();
    flushParagraph();
    closeList();
    return out.join('\n') || '<p>&nbsp;</p>';
  }

  function normalizeMarkdownImageParagraphs(html) {
    // marked({ breaks:true })는 아래처럼 이미지 다음의 단순 줄바꿈도 <br>로 만든다.
    // <p><img ...><br><strong>화자</strong>...</p>
    // img를 display:block으로 렌더하면 그 <br>가 사실상 빈 줄 하나가 되어 보인다.
    // 픽셀 margin 보정 대신 이미지와 후속 텍스트를 실제 별도 문단으로 분리한다.
    const template = document.createElement('template');
    template.innerHTML = toStringValue(html);

    [...template.content.querySelectorAll('p')].forEach((paragraph) => {
      const isWhitespaceText = (node) => node?.nodeType === Node.TEXT_NODE && !toStringValue(node.nodeValue).trim();
      let first = paragraph.firstChild;
      while (first && isWhitespaceText(first)) {
        const next = first.nextSibling;
        first.remove();
        first = next;
      }
      if (!(first instanceof HTMLImageElement)) return;

      // 이미지 직후의 공백 + marked가 만든 첫 번째 <br>만 제거한다.
      let cursor = first.nextSibling;
      while (cursor && isWhitespaceText(cursor)) {
        const next = cursor.nextSibling;
        cursor.remove();
        cursor = next;
      }
      if (cursor?.nodeName === 'BR') {
        const next = cursor.nextSibling;
        cursor.remove();
        cursor = next;
        while (cursor && isWhitespaceText(cursor)) {
          const after = cursor.nextSibling;
          cursor.remove();
          cursor = after;
        }
      }

      const hasFollowingContent = [...paragraph.childNodes].some((node) => {
        if (node === first) return false;
        if (isWhitespaceText(node)) return false;
        if (node.nodeName === 'BR') return false;
        return node.nodeType === Node.ELEMENT_NODE || Boolean(toStringValue(node.nodeValue).trim());
      });

      if (!hasFollowingContent) {
        // 이미지 단독 문단이면 whitespace/잔여 BR만 치워 :only-child 스타일이 확실히 먹게 한다.
        [...paragraph.childNodes].forEach((node) => {
          if (node === first) return;
          if (isWhitespaceText(node) || node.nodeName === 'BR') node.remove();
        });
        return;
      }

      const imageParagraph = document.createElement('p');
      imageParagraph.appendChild(first);
      paragraph.parentNode?.insertBefore(imageParagraph, paragraph);

      // 분리 후 텍스트 문단 앞에 남은 whitespace/BR도 제거한다.
      let leading = paragraph.firstChild;
      while (leading && (isWhitespaceText(leading) || leading.nodeName === 'BR')) {
        const next = leading.nextSibling;
        leading.remove();
        leading = next;
      }
      if (!paragraph.textContent?.trim() && !paragraph.querySelector('*')) paragraph.remove();
    });

    return template.innerHTML;
  }

  function coaRenderMarkdown(md) {
    let rawHTML;
    const prepared = preprocessMarkdownPipeTables(md);
    const api = globalThis.marked;

    if (api && typeof api.parse === 'function') {
      try {
        rawHTML = api.parse(prepared, { gfm: true, breaks: true });
      } catch (err) {
        rawHTML = coaRenderMarkdownFallback(md);
      }
    } else if (typeof api === 'function') {
      try {
        rawHTML = api(prepared);
      } catch (err) {
        rawHTML = coaRenderMarkdownFallback(md);
      }
    } else {
      rawHTML = coaRenderMarkdownFallback(md);
    }

    let safeHTML = rawHTML;
    if (globalThis.DOMPurify && typeof DOMPurify.sanitize === 'function') {
      safeHTML = DOMPurify.sanitize(rawHTML, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'colspan', 'rowspan', 'align', 'data-lang'],
      });
    }

    return normalizeMarkdownImageParagraphs(safeHTML);
  }

  function coaRenderHTML(html) {
    const rawHTML = toStringValue(html);
    if (globalThis.DOMPurify && typeof DOMPurify.sanitize === 'function') {
      return DOMPurify.sanitize(rawHTML, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['script', 'style', 'link', 'meta', 'iframe', 'object', 'embed'],
        ADD_ATTR: ['target', 'rel', 'style'],
      });
    }
    return rawHTML
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
  }

  function coaRenderPlainText(text) {
    return `<p>${escapeHTML(text).replace(/\n/g, '<br>')}</p>`;
  }

  function stripSmartMarkdown(value) {
    return stripMarkdown(toStringValue(value))
      .replace(/^\s*[▸▶•·]\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function renderMarkdownInline(value) {
    const html = coaRenderMarkdown(toStringValue(value).trim());
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return escapeHTML(value);
    if (root.children.length === 1 && root.firstElementChild && root.firstElementChild.tagName.toLowerCase() === 'p') {
      return root.firstElementChild.innerHTML;
    }
    return root.innerHTML;
  }

  function stripOuterMarkdownEmphasisForKV(line) {
    let s = toStringValue(line).trim();

    // 자동 구조화 KV 후보 줄만 대상으로, 줄 전체를 감싼 강조 마크다운을 먼저 벗긴다.
    // 예: *대상: 값* / **관찰자: 값** → 대상: 값 / 관찰자: 값
    // 일반 문장 중간의 *강조*는 여기서 처리하지 않는다.
    s = s.replace(/^\*\*([\s\S]+?)\*\*$/g, '$1');
    s = s.replace(/^__([\s\S]+?)__$/g, '$1');
    s = s.replace(/^\*([\s\S]+?)\*$/g, '$1');
    s = s.replace(/^_([\s\S]+?)_$/g, '$1');

    return s.trim();
  }

  function cleanKvEdgeMarkdown(value) {
    return toStringValue(value)
      .trim()
      // key/value 가장자리에 남은 마크다운 잔재만 제거한다.
      // 문장 내부의 *강조*나 곱셈 기호는 건드리지 않는다.
      .replace(/^(\*\*|__|\*|_)+/, '')
      .replace(/(\*\*|__|\*|_)+$/, '')
      .trim();
  }

  function parseSmartKVLine(line) {
    let text = toStringValue(line).trim();
    if (!text || /^[-_=*]{3,}$/.test(text)) return null;
    // Markdown 인용문(> key: value)을 KV 표로 오인식하지 않는다.
    // 인용은 인용으로 렌더링해야 하므로 leading > 는 여기서 벗기지 않는다.
    if (/^>\s?/.test(text)) return null;
    text = stripOuterMarkdownEmphasisForKV(text);

    // 일반 목록 문장("- key: value — *em*")을 자동 구조화 표로 오인식하지 않는다.
    // 특정 문구가 아니라 Markdown 목록 문법 전체를 배제하는 범용 처리다.
    if (/^[-*+]\s+/.test(text)) return null;

    // OOC 메타데이터에 자주 쓰는 장식 불릿만 KV 후보로 허용.
    text = text
      .replace(/^[▸▶•·]\s*/, '')
      .trim();
    const match = text.match(/^(?:\*\*)?([^:：\n]{1,42}?)(?:\*\*)?\s*[:：]\s*([\s\S]*)$/);
    if (!match) return null;
    const key = stripSmartMarkdown(cleanKvEdgeMarkdown(match[1]));
    const value = cleanKvEdgeMarkdown(match[2]);
    if (!key || key.length > 32) return null;
    if (/^https?:\/\//i.test(key)) return null;
    if (/^["'“‘]/.test(key)) return null;
    return { key, value };
  }

  function hasSmartStructure(card) {
    const normalized = normalizeCard(card);
    const body = normalized.body || '';
    if (!body.trim()) return false;
    const renderFormat = resolveRenderFormat(normalized);
    if (renderFormat === 'html' && hasSignificantHTMLTags(body) && !hasMarkdownSyntax(body)) return false;
    const kvHits = body.split(/\r?\n/).filter((line) => parseSmartKVLine(line)).length;
    if (kvHits >= 2) return true;
    if (/^\s*(?:---|===)\s*$/m.test(body) && kvHits >= 1) return true;
    return false;
  }

  function renderSmartKVTable(rows) {
    if (!rows.length) return '';
    return `<table class="coa-smart-kv"><tbody>${rows.map((row) => `
      <tr>
        <th>${escapeHTML(row.key)}</th>
        <td>${row.value ? renderMarkdownInline(row.value) : '&nbsp;'}</td>
      </tr>
    `).join('')}</tbody></table>`;
  }

  function renderSmartDocument(card) {
    const normalized = normalizeCard(card);
    const lines = (normalized.body || '').replace(/\r\n?/g, '\n').split('\n');
    const parts = [];
    let kvRows = [];
    let paragraph = [];

    const flushKV = () => {
      if (!kvRows.length) return;
      parts.push(renderSmartKVTable(kvRows));
      kvRows = [];
    };
    const flushParagraph = () => {
      const text = paragraph.join('\n').trim();
      paragraph = [];
      if (!text) return;
      parts.push(`<div class="coa-smart-paragraph">${coaRenderMarkdown(text)}</div>`);
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trimEnd();
      const trimmed = line.trim();
      if (!trimmed) {
        flushKV();
        flushParagraph();
        continue;
      }

      // 자동 구조화가 켜져 있어도 Markdown 표/인용은 KV 표보다 먼저 보존한다.
      // 이전에는 | 항목 | 관찰 기록 | 이 paragraph로 밀려서 DC 미리보기에서 평문처럼 새는 경우가 있었다.
      if (isMarkdownPipeTableStart(lines, i)) {
        flushKV();
        flushParagraph();
        const tableLines = [lines[i], lines[i + 1]];
        i += 2;
        while (i < lines.length) {
          const row = lines[i];
          if (!row.trim() || /^\s*```/.test(row) || !isMarkdownPipeLikeLine(row)) break;
          tableLines.push(row);
          i += 1;
        }
        i -= 1;
        parts.push(renderMarkdownPipeTableHTML(tableLines));
        continue;
      }

      if (isMarkdownQuoteStart(line)) {
        flushKV();
        flushParagraph();
        const quoteLines = [line];
        i += 1;
        while (i < lines.length && isMarkdownQuoteStart(lines[i])) {
          quoteLines.push(lines[i]);
          i += 1;
        }
        i -= 1;
        parts.push(renderMarkdownQuoteHTML(quoteLines));
        continue;
      }

      const heading = trimmed.match(/^#{1,6}\s+(.+)$/) || trimmed.match(/^##?\s*([📦🧾📹🗂️📝🔎📌]?.{1,80})$/);
      if (heading && !parseSmartKVLine(trimmed)) {
        flushKV();
        flushParagraph();
        parts.push(`<h2 class="coa-smart-heading">${renderMarkdownInline(heading[1])}</h2>`);
        continue;
      }
      if (/^\s*(?:---|===|___)\s*$/.test(trimmed)) {
        flushKV();
        flushParagraph();
        parts.push('<hr>');
        continue;
      }
      const kv = parseSmartKVLine(line);
      if (kv) {
        flushParagraph();
        kvRows.push(kv);
        continue;
      }
      flushKV();
      paragraph.push(line);
    }
    flushKV();
    flushParagraph();
    return parts.join('\n') || coaRenderMarkdown(normalized.body || '');
  }

  function coaRenderSmartBody(card, options = {}) {
    const normalized = normalizeCard(card);
    const cleanBody = options.preserveComments ? normalized.body : prepareGeneralVisibleContent(normalized.body || '');
    const renderCard = { ...normalized, body: cleanBody };
    const smartEnabled = false;
    if (smartEnabled && hasSmartStructure(renderCard)) return renderSmartDocument(renderCard);
    return coaRenderCardBody(renderCard, { ...options, smart: false });
  }

  function coaRenderCardBody(card, options = {}) {
    const normalized = normalizeCard(card);
    const cleanBody = options.preserveComments ? normalized.body : prepareGeneralVisibleContent(normalized.body || '');
    const renderCard = { ...normalized, body: cleanBody };
    const smartEnabled = false;
    if (options.smart !== false && smartEnabled && hasSmartStructure(renderCard)) return renderSmartDocument(renderCard) || '<p>본문 없음</p>';
    const renderFormat = resolveRenderFormat(renderCard);
    if (renderFormat === 'html') {
      if (shouldRenderHTMLThroughMarkdown(renderCard.body || '')) return coaRenderMarkdown(renderCard.body || '') || '<p>본문 없음</p>';
      return coaRenderHTML(renderCard.body || '') || '<p>본문 없음</p>';
    }
    if (renderFormat === 'text') return coaRenderPlainText(renderCard.body || '') || '<p>본문 없음</p>';
    return coaRenderMarkdown(renderCard.body || '') || '<p>본문 없음</p>';
  }

  // OOC 일반 HTML/PNG는 저장 당시 format이 text여도 Markdown 문법이 있으면
  // 제목·인용·표·코드블록·목록·이미지를 온전히 렌더한다. 스마트 표는 카드 설정이 켜진 경우만 유지한다.
  function renderOOCExportBodyHTML(card, options = {}) {
    const normalized = normalizeCard(card);
    let cleanBody = prepareGeneralVisibleContent(normalized.body || '');
    if (options.excludeCodeBlocks === true) cleanBody = stripDCRPCodeBlocks(cleanBody).trim();
    const renderCard = { ...normalized, body: cleanBody };
    if (hasSignificantHTMLTags(cleanBody) && !hasMarkdownSyntax(cleanBody)) {
      return coaRenderHTML(cleanBody) || '<p>본문 없음</p>';
    }
    return coaRenderMarkdown(cleanBody) || '<p>본문 없음</p>';
  }


  function ensureExportStylesheetLink(id, href) {
    if (!href) return null;
    let link = document.getElementById(id);
    if (link) return link;
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    return link;
  }

  function ensureExportFonts(fontKey = 'pretendard') {
    ensureExportStylesheetLink('coa-export-google-fonts', COA_CORE_GOOGLE_FONTS_URL);
    ensureExportStylesheetLink('coa-export-pretendard-font', COA_PRETENDARD_FONT_URL);
    const clean = normalizeCOAFont(fontKey);
    const stylesheet = COA_FONT_PRESETS[clean]?.stylesheet;
    if (stylesheet) ensureExportStylesheetLink(`coa-export-selected-font-${clean}`, stylesheet);
  }

  function waitWithTimeout(promise, timeout = 8000) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => { timer = setTimeout(resolve, Math.max(0, Number(timeout) || 0)); }),
    ]).finally(() => clearTimeout(timer));
  }


  async function waitForExportFont(fontKey = 'pretendard') {
    const clean = normalizeCOAFont(fontKey);
    ensureExportFonts(clean);
    const links = [
      document.getElementById('coa-export-google-fonts'),
      document.getElementById('coa-export-pretendard-font'),
      document.getElementById(`coa-export-selected-font-${clean}`),
    ].filter(Boolean);
    await Promise.allSettled(links.map((link) => waitForStylesheetLink(link, 6000)));
    try {
      if (document.fonts?.load) {
        const family = getCOAFontFamily(clean);
        await Promise.allSettled([
          waitWithTimeout(document.fonts.load(`400 16px ${family}`, '가Aa01'), 8000),
          waitWithTimeout(document.fonts.load(`700 24px ${family}`, '가Aa01'), 8000),
        ]);
      }
      if (document.fonts?.ready) await waitWithTimeout(document.fonts.ready, 8000);
    } catch (_) {}
  }

  function getCardExportRef(card) {
    const normalized = normalizeCard(card);
    const map = buildCardRefMap(coaIndexRuntimeCache);
    return map.get(normalized.id) || `${normalized.archiveType === 'log' ? 'LOG' : 'OOC'}-001`;
  }

  // 궤도의 대형 SVG 대신 일반 HTML/PNG와 DC에서 함께 살아남는 선·마름모 장식을 사용한다.
  // 선과 심볼 색은 호출부 팔레트를 그대로 받아 모든 색상 변형에 자동 대응한다.
  function renderLogDiamondRule(symbolColor, lineColor, width = 190, symbol = '◆') {
    const safeWidth = Math.max(72, Math.min(320, Math.round(Number(width) || 190)));
    return `<table width="${safeWidth}" cellpadding="0" cellspacing="0" border="0" align="center" aria-hidden="true" style="width:${safeWidth}px;max-width:100%;border-collapse:collapse;table-layout:fixed;margin:0 auto;"><tbody><tr><td width="42%" valign="middle" style="width:42%;padding:0 8px 0 0;vertical-align:middle;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td height="1" bgcolor="${lineColor}" style="height:1px;padding:0;background-color:${lineColor};font-size:0;line-height:0;">&#8203;</td></tr></tbody></table></td><td width="16%" align="center" valign="middle" style="width:16%;padding:0;color:${symbolColor};font-family:'IBM Plex Mono',Consolas,Menlo,monospace;font-size:13px;font-weight:700;line-height:1;text-align:center;vertical-align:middle;white-space:nowrap;">${symbol}</td><td width="42%" valign="middle" style="width:42%;padding:0 0 0 8px;vertical-align:middle;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td height="1" bgcolor="${lineColor}" style="height:1px;padding:0;background-color:${lineColor};font-size:0;line-height:0;">&#8203;</td></tr></tbody></table></td></tr></tbody></table>`;
  }

  function renderHeugyoMarkSVG(fill, bg, size = 58) {
    const s = Math.max(20, Math.round(Number(size) || 58));
    return `<svg width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true" style="display:block;width:${s}px;height:${s}px;"><path d="M10 92 L90 92 C66 80 58 54 54 14 C46 56 32 80 10 92 Z" fill="${fill}"/><path d="M40 57 C39 70 33 73 23 74 C33 75 39 78 40 91 C41 78 47 75 57 74 C47 73 41 70 40 57 Z" fill="${bg}"/><circle cx="63" cy="80" r="6.5" fill="${bg}"/></svg>`;
  }

  // 청인의 인장 표식. SVG·한자 없이 DC에서도 안정적인 BMP 특문만 사용한다.
  function renderCheonginGlyphMark(accent, line, compact = false) {
    const symbolFont = "'Segoe UI Symbol','Arial Unicode MS','Malgun Gothic',sans-serif";
    if (compact) {
      return `<span aria-hidden="true" style="display:inline-block;color:${accent};font-family:${symbolFont};font-size:14px;font-weight:400;line-height:1;">⊹</span>`;
    }
    return `<table width="76" cellpadding="0" cellspacing="0" border="0" align="center" aria-hidden="true" style="width:76px;border-collapse:collapse;table-layout:fixed;margin:0 auto;"><tbody><tr><td width="20" align="right" valign="middle" style="width:20px;padding:0;color:${line};font-family:${symbolFont};font-size:10px;line-height:1;text-align:right;vertical-align:middle;">·</td><td width="36" align="center" valign="middle" style="width:36px;padding:0;color:${accent};font-family:${symbolFont};font-size:25px;font-weight:400;line-height:1;text-align:center;vertical-align:middle;">⊹</td><td width="20" align="left" valign="middle" style="width:20px;padding:0;color:${line};font-family:${symbolFont};font-size:10px;line-height:1;text-align:left;vertical-align:middle;">·</td></tr></tbody></table>`;
  }

  function renderSpecBarcodeSVG(color = 'currentColor') {
    // currentColor는 SVG를 data URL 이미지로 고정하는 순간 부모 색 상속이 끊겨 검정으로 바뀔 수 있다.
    // 스펙시트처럼 색이 정해진 호출부는 실제 HEX를 SVG fill에 직접 기록한다.
    const requested = toStringValue(color).trim();
    const fill = /^#[0-9a-f]{3,8}$/i.test(requested) ? requested : 'currentColor';
    return `<svg width="118" height="30" viewBox="0 0 118 30" aria-hidden="true" style="display:block;width:118px;height:30px;max-width:none;overflow:visible;"><g fill="${fill}"><rect x="0" width="3" height="30"/><rect x="5" width="1.5" height="30"/><rect x="9" width="4" height="30"/><rect x="15" width="1.5" height="30"/><rect x="19" width="2" height="30"/><rect x="24" width="5" height="30"/><rect x="31" width="1.5" height="30"/><rect x="35" width="3" height="30"/><rect x="40" width="1.5" height="30"/><rect x="44" width="4" height="30"/><rect x="50" width="2" height="30"/><rect x="54" width="1.5" height="30"/><rect x="58" width="5" height="30"/><rect x="65" width="1.5" height="30"/><rect x="69" width="3" height="30"/><rect x="74" width="2" height="30"/><rect x="79" width="1.5" height="30"/><rect x="83" width="4" height="30"/><rect x="89" width="1.5" height="30"/><rect x="93" width="3" height="30"/><rect x="98" width="5" height="30"/><rect x="105" width="1.5" height="30"/><rect x="109" width="2" height="30"/><rect x="114" width="4" height="30"/></g></svg>`;
  }

  // 크랙위키 전용 표식. 나무/연결 구조의 인상만 빌리고 원본 로고를 복제하지 않은 독자 도형이다.
  // 일반 HTML·PNG에서는 선명한 SVG를 사용하고, DC 템플릿은 에디터 호환성을 위해 표 셀 도형을 사용한다.
  function renderCrackWikiMarkSVG(size = 22, color = '#FFFFFF') {
    const s = Math.max(16, Math.min(44, Math.round(Number(size) || 22)));
    const requested = toStringValue(color).trim();
    const ink = /^#[0-9a-f]{3,8}$/i.test(requested) ? requested : '#FFFFFF';
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:block;width:${s}px;height:${s}px;flex:none;overflow:visible;"><g fill="none" stroke="${ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20v-7.1M12 12.9 6.4 9.5M12 12.9l5.6-3.4M6.4 9.5V5.2M17.6 9.5V5.2"/><path d="M8.6 18.7 12 20.8l3.4-2.1"/></g><g fill="${ink}"><rect x="3.7" y="2.5" width="5.4" height="5.4" rx="1.25"/><rect x="14.9" y="2.5" width="5.4" height="5.4" rx="1.25"/><path d="M8.8 10.9h6.4v6.4H8.8z"/></g><path d="m10.2 13.9 1.15 1.15 2.45-2.55" fill="none" stroke="#00A495" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderCrackWikiMarkDCTable() {
    return `<table width="22" height="22" cellpadding="0" cellspacing="0" border="0" aria-hidden="true" style="width:22px;height:22px;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td width="7" height="7" bgcolor="#FFFFFF" style="width:7px;height:7px;padding:0;background-color:#FFFFFF;font-size:0;line-height:0;">&#8203;</td><td width="8" style="width:8px;padding:0;font-size:0;line-height:0;">&#8203;</td><td width="7" height="7" bgcolor="#FFFFFF" style="width:7px;height:7px;padding:0;background-color:#FFFFFF;font-size:0;line-height:0;">&#8203;</td></tr><tr><td height="7" style="height:7px;padding:0;font-size:0;line-height:0;">&#8203;</td><td width="8" height="8" bgcolor="#FFFFFF" style="width:8px;height:8px;padding:0;background-color:#FFFFFF;font-size:0;line-height:0;">&#8203;</td><td style="padding:0;font-size:0;line-height:0;">&#8203;</td></tr><tr><td colspan="3" align="center" style="height:7px;padding:0;text-align:center;vertical-align:top;font-size:0;line-height:0;"><table width="2" height="7" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#FFFFFF" style="width:2px;height:7px;border-collapse:collapse;margin:0 auto;background-color:#FFFFFF;"><tbody><tr><td style="padding:0;font-size:0;line-height:0;">&#8203;</td></tr></tbody></table></td></tr></tbody></table>`;
  }

  function renderAirmailStampSVG() {
    return `<svg width="72" height="88" viewBox="0 0 72 88" aria-hidden="true"><rect x="4" y="4" width="64" height="80" fill="#FFFDF6" stroke="#D9CDB4" stroke-width="1" stroke-dasharray="0.1 6" stroke-linecap="round" stroke-dashoffset="3"/><rect x="4" y="4" width="64" height="80" fill="#FFFDF6"/><rect x="9" y="9" width="54" height="70" fill="#EEF1F6" stroke="#34508C" stroke-width="1.4"/><rect x="31" y="46" width="10" height="22" fill="#B23A34" opacity=".85"/><path d="M36 28 C31 36,31 41,36 45 C41 41,41 36,36 28 Z" fill="#B23A34"/><line x1="36" y1="45" x2="36" y2="47" stroke="#34508C" stroke-width="1.4"/><text x="36" y="23" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="6.4" letter-spacing="1.6" fill="#34508C">CA POST</text><text x="36" y="76" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="7.2" font-weight="600" fill="#34508C">2026</text></svg>`;
  }

  function renderAirmailPostmarkSVG(dateText) {
    return `<svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="30" fill="none" stroke="#5A5245" stroke-width="1.4" opacity=".85"/><circle cx="42" cy="42" r="22" fill="none" stroke="#5A5245" stroke-width="1" opacity=".7"/><text x="42" y="38" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="7.4" letter-spacing="1.4" fill="#5A5245">CRACK</text><text x="42" y="50" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="6.6" letter-spacing="1" fill="#5A5245">${escapeHTML(dateText)}</text><path d="M4 60 q10 -5 20 0 t20 0 t20 0 t20 0" fill="none" stroke="#5A5245" stroke-width="1.2" opacity=".6"/><path d="M4 67 q10 -5 20 0 t20 0 t20 0 t20 0" fill="none" stroke="#5A5245" stroke-width="1.2" opacity=".5"/></svg>`;
  }


  const AIRMAIL_FRAME_TILE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADQAAAA0CAYAAADFeBvrAAABMElEQVR4nN3YK24DQRAE0GefKcTBIc4RDHw4Ax8gICHmvksOEBKQkAWr1X5mFk1N45ZaT0VKffh4ffmzY86Pz6r90+W254zn/Vq1f9xzpFXM19t7PahlDJUJtY6hApSAoRCUgqEAlIRhA5SGYQWUiGEBlIphBpSMYQJKxzAC9YBhAPWCgcPvz3dV224ZQ2WXax1zfnyWgxIwFCaUgqEAlIRhA5SGYQWUiGEBlIphBpSMYQJKxzAC9YBhAPWCgWNPGHZ+TlvFnC63elDLGCoTah1DBSgBQyEoBUMBKAnDBigNwwooEcMCKBXDDCgZwwSUjmEE6gHDAOoFw47PacsYKrtc65jn/VoOSsBQmFAKhgJQEoYNUBqGFVAihgVQKoYZUDKGCSgdwwjUA4YB1AsG/gGIoj19fJsnfwAAAABJRU5ErkJggg==';

  function getAirmailFrameStyle() {
    // 원본 repeating-linear-gradient를 52px PNG 타일로 래스터화한 값.
    // HTML 미리보기·HTML 파일·html2canvas PNG에서 같은 연속 사선 액자를 유지한다.
    return `background-color:#FBF6EA;background-image:url(${AIRMAIL_FRAME_TILE_URL});background-repeat:repeat;background-size:52px 52px;background-position:0 0;`;
  }

  function ensureExportStyle() {
    ensureExportFonts();
    if (document.getElementById('coa-export-style')) return;
    const style = document.createElement('style');
    style.id = 'coa-export-style';
    style.textContent = `
      .coa-render-stage{position:fixed;left:-100000px;top:0;width:940px;z-index:-1;pointer-events:none;background:transparent;padding:0;margin:0;}
      .coa-png-shell{width:880px;margin:0 auto;padding:20px;background:transparent;box-sizing:border-box;}
      .coa-html-log,.coa-ooc-export{width:100%;margin:0 auto;box-sizing:border-box;}
      .coa-html-log,.coa-html-log *,.coa-ooc-export,.coa-ooc-export *{box-sizing:border-box;max-width:100%;}
      .coa-html-log table,.coa-ooc-export table{max-width:100%;}
      .coa-ooc-rich-body{font-size:15px;line-height:1.85;color:inherit;overflow-wrap:break-word;word-break:keep-all;}
      .coa-ooc-rich-body>:first-child{margin-top:0!important;}.coa-ooc-rich-body>:last-child{margin-bottom:0!important;}
      .coa-ooc-rich-body h1,.coa-ooc-rich-body h2,.coa-ooc-rich-body h3{margin:1.35em 0 .65em;padding-bottom:.28em;border-bottom:1px solid currentColor;line-height:1.35;letter-spacing:-.025em;}
      .coa-ooc-rich-body h1{font-size:1.72em}.coa-ooc-rich-body h2{font-size:1.48em}.coa-ooc-rich-body h3{font-size:1.25em}
      .coa-ooc-rich-body h4,.coa-ooc-rich-body h5,.coa-ooc-rich-body h6{margin:1.15em 0 .45em;line-height:1.4;}
      .coa-ooc-rich-body p{margin:.72em 0;}.coa-ooc-rich-body ul,.coa-ooc-rich-body ol{margin:.8em 0;padding-left:1.7em;}.coa-ooc-rich-body li{margin:.25em 0;}
      .coa-ooc-rich-body blockquote{margin:1em 0;padding:11px 15px;border-left:4px solid currentColor;background:rgba(127,127,127,.09);}
      .coa-ooc-rich-body blockquote>:first-child{margin-top:0}.coa-ooc-rich-body blockquote>:last-child{margin-bottom:0}
      .coa-ooc-rich-body pre{margin:1em 0;padding:14px 16px;overflow:auto;white-space:pre;background:#20201e;color:#f3f1ea;border:1px solid currentColor;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
      .coa-ooc-rich-body code{padding:2px 5px;background:rgba(127,127,127,.14);font:0.92em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}
      .coa-ooc-rich-body pre code{padding:0;background:transparent;color:inherit;font:inherit;}
      .coa-ooc-rich-body table{display:table;width:100%;border-collapse:collapse;table-layout:auto;margin:1em 0;font-size:.92em;}
      .coa-ooc-rich-body th,.coa-ooc-rich-body td{border:1px solid currentColor;padding:8px 10px;vertical-align:top;overflow-wrap:break-word;}
      .coa-ooc-rich-body th{background:rgba(127,127,127,.12);font-weight:800;}.coa-ooc-rich-body hr{border:0;border-top:1px solid currentColor;margin:1.4em 0;opacity:.45;}
      .coa-ooc-rich-body img{display:block;max-width:100%;height:auto;margin:6px auto 0;border:1px solid currentColor;}.coa-ooc-rich-body p:has(> img:only-child){margin:0;line-height:0;}.coa-ooc-rich-body p:has(> img:only-child)+p{margin-top:2px;}.coa-ooc-rich-body a{color:inherit;text-decoration:underline;text-underline-offset:2px;}
      .coa-ooc-rich-body em,.coa-ooc-rich-body i{font-style:normal;opacity:.72;}
      [data-coa-ooc-layout="newspaper"] .coa-ooc-rich-body>p:first-child::first-letter{float:left;margin:.08em .14em 0 0;font-size:3.2em;font-weight:700;line-height:.82;}
      [data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h3{color:#49796e;border-bottom-color:#9cb9b2;}
      [data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h3{border-bottom-color:#777361;}
      [data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h3{font-size:1.18em;margin:1em 0 .45em;padding-bottom:.2em;}
      [data-coa-ooc-layout="receipt"] .coa-ooc-rich-body pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;font-size:11px;}
      [data-coa-ooc-layout="library"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="library"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="library"] .coa-ooc-rich-body h3{color:#A5372D;border-bottom-color:#D5C79E;}
      [data-coa-ooc-layout="library"] .coa-ooc-rich-body pre{background:#F2EBD4;color:#3A3222;border-color:#D5C79E;}
      [data-coa-ooc-layout="onair"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="onair"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="onair"] .coa-ooc-rich-body h3{color:#E8B25A;border-bottom-color:#2A3550;}
      [data-coa-ooc-layout="onair"] .coa-ooc-rich-body blockquote{border-left-color:#E8B25A;background:#1B2340;}
      [data-coa-ooc-layout="onair"] .coa-ooc-rich-body pre{background:#090E19;color:#D9DCE8;border-color:#2A3550;}
    `;
    document.head.appendChild(style);
  }

  function normalizeCOAHexColor(value, fallback = '#777777') {
    const clean = toStringValue(value).trim();
    const short = /^#([0-9a-f]{3})$/i.exec(clean);
    if (short) return `#${short[1].split('').map((ch) => ch + ch).join('')}`.toLowerCase();
    const full = /^#([0-9a-f]{6})$/i.exec(clean);
    return full ? `#${full[1].toLowerCase()}` : fallback;
  }

  function mixCOAHexColors(baseValue, mixValue, ratio = 0.5) {
    const base = normalizeCOAHexColor(baseValue);
    const mix = normalizeCOAHexColor(mixValue);
    const t = Math.max(0, Math.min(1, Number(ratio) || 0));
    const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const a = parse(base);
    const b = parse(mix);
    const rgb = a.map((channel, i) => Math.round(channel * (1 - t) + b[i] * t));
    return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function getCOAHexLuminance(value) {
    const hex = normalizeCOAHexColor(value);
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }

  function getLogCodePalette(palette = {}) {
    const surface = palette.paper || palette.bg || '#f5f5f1';
    const text = palette.fg || palette.text || '#161513';
    const accent = palette.aiAccent || palette.accent || palette.dialogue || text;
    const line = palette.border || palette.line || accent;
    const dark = getCOAHexLuminance(surface) < 0.24;
    return {
      bg: mixCOAHexColors(surface, dark ? '#ffffff' : '#000000', dark ? 0.09 : 0.045),
      inlineBg: mixCOAHexColors(surface, dark ? '#ffffff' : '#000000', dark ? 0.13 : 0.07),
      fg: text,
      accent,
      line: mixCOAHexColors(line, dark ? '#ffffff' : '#000000', dark ? 0.12 : 0.05),
    };
  }

  function renderSimpleLogContentHTML(value, options = {}) {
    const palette = options.palette || getLogSimplePalette(options.color || options.theme || 'mungo');
    const codePalette = getLogCodePalette(palette);
    let source = stripCOALoreContextBlocks(toStringValue(value)).replace(/\r\n?/g, '\n').trim();
    if (options.excludeComments) source = prepareGeneralVisibleContent(source).trim();
    if (options.excludeCodeBlocks) source = stripDCRPCodeBlocks(source).trim();
    if (!source) return '<p style="margin:0;">&nbsp;</p>';

    const html = coaRenderMarkdown(source);
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild || doc.body;

    root.querySelectorAll('script,style,link,meta,iframe,object,embed').forEach((node) => node.remove());
    if (options.excludeComments) removeHTMLCommentNodes(root);
    if (options.excludeImages) root.querySelectorAll('img').forEach((node) => node.remove());
    if (options.excludeCodeBlocks) root.querySelectorAll('pre').forEach((node) => node.remove());

    // 제목만 본문형 굵은 문단으로 낮춘다. 이탤릭과 인용은 의미가 있으므로 보존한다.
    root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((node) => {
      const p = doc.createElement('p');
      const strong = doc.createElement('strong');
      while (node.firstChild) strong.appendChild(node.firstChild);
      p.appendChild(strong);
      node.replaceWith(p);
    });

    root.querySelectorAll('*').forEach((node) => {
      node.removeAttribute('class');
      node.removeAttribute('id');
      node.removeAttribute('style');
    });

    // DC sanitizer는 style 속성을 제거하므로 먼저 태그를 정리하고 마지막에 스타일을 입힌다.
    if (options.dc) sanitizeForDC(root, options);

    const setStyle = (selector, style) => {
      root.querySelectorAll(selector).forEach((node) => node.setAttribute('style', style));
    };
    setStyle('p', 'margin:0 0 12px;line-height:1.9;font-size:15px;overflow-wrap:break-word;word-break:keep-all;');
    setStyle('div', 'margin:0 0 12px;line-height:1.9;font-size:15px;overflow-wrap:break-word;word-break:keep-all;');
    setStyle('ul,ol', 'margin:0 0 12px;padding-left:22px;line-height:1.9;font-size:15px;');
    setStyle('li', 'margin:3px 0;line-height:1.9;overflow-wrap:break-word;word-break:keep-all;');
    // 일반 HTML 로그의 모든 내지에서 코드블록/인라인 코드를 현재 팔레트에 맞춰 표시한다.
    setStyle('pre', `margin:14px 0;padding:12px 14px;white-space:pre-wrap;line-height:1.7;font-family:Consolas,Menlo,'Courier New','Malgun Gothic',monospace;font-size:13.5px;overflow:auto;overflow-wrap:anywhere;word-break:normal;tab-size:2;background-color:${codePalette.bg};color:${codePalette.fg};border:1px solid ${codePalette.line};border-left:4px solid ${codePalette.accent};border-radius:4px;`);
    setStyle('code', `padding:2px 5px;background-color:${codePalette.inlineBg};color:${codePalette.fg};border:1px solid ${codePalette.line};border-radius:4px;font-family:Consolas,Menlo,'Courier New','Malgun Gothic',monospace;font-size:.92em;overflow-wrap:anywhere;`);
    setStyle('pre code', `padding:0;background-color:transparent;color:inherit;border:0;border-radius:0;font-family:inherit;font-size:inherit;`);
    setStyle('a', 'color:inherit;text-decoration:underline;');
    setStyle('img', 'display:block;max-width:100%;height:auto;margin:6px auto 0;');
    root.querySelectorAll('p').forEach((node) => {
      const children = [...node.children];
      if (children.length === 1 && children[0].tagName === 'IMG' && !toStringValue(node.textContent).trim()) {
        node.setAttribute('style', 'margin:0;line-height:0;font-size:0;');
      }
    });
    setStyle('hr', 'margin:16px 0;border:0;border-top:1px solid currentColor;opacity:.22;');
    setStyle('table', 'width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0;font-size:14px;');
    setStyle('th,td', 'padding:7px 8px;border:1px solid currentColor;vertical-align:top;overflow-wrap:break-word;word-break:keep-all;');
    setStyle('strong,b', 'font-weight:800;');
    setStyle('em,i', `color:${palette.italic || palette.muted};font-style:normal;`);
    setStyle('blockquote', `margin:13px 0;padding:9px 12px;border-left:3px solid ${palette.quoteAccent || palette.aiAccent};background-color:${palette.quoteBg || palette.paper};color:${palette.muted};line-height:1.85;overflow-wrap:break-word;word-break:keep-all;`);
    setStyle('blockquote p', `margin:0 0 8px;color:${palette.muted};line-height:1.85;font-size:14.5px;overflow-wrap:break-word;word-break:keep-all;`);

    // 일부 DC 스킨은 p/li/td 등에 자체 글자색을 직접 지정해 부모 td의 color 상속을 덮어쓴다.
    // 필요한 테마만 forceTextColor를 넘겨 본문 요소에 인라인 색상을 고정한다.
    if (options.forceTextColor) {
      const forced = toStringValue(options.forceTextColor).trim();
      if (forced) {
        root.querySelectorAll('p,div,li,pre,code,td,th,a,strong,b,span').forEach((node) => {
          if (node.closest('blockquote')) return;
          const current = node.getAttribute('style') || '';
          if (!/(?:^|;)\s*color\s*:/i.test(current)) node.setAttribute('style', `${current}${current && !current.trim().endsWith(';') ? ';' : ''}color:${forced};`);
        });
      }
    }

    root.querySelectorAll('blockquote p:last-child').forEach((node) => {
      const current = node.getAttribute('style') || '';
      node.setAttribute('style', current.replace(/margin:\s*0 0 8px;?/g, 'margin:0;'));
    });

    const last = root.lastElementChild;
    if (last) {
      const current = last.getAttribute('style') || '';
      last.setAttribute('style', current.replace(/margin-bottom:\s*12px;?/g, 'margin-bottom:0;'));
    }

    return root.innerHTML || '<p style="margin:0;">&nbsp;</p>';
  }

  function toLogHanjaNumber(value) {
    const n = Math.max(1, Math.floor(Number(value) || 1));
    const d = ['零','一','二','三','四','五','六','七','八','九'];
    if (n < 10) return d[n];
    if (n === 10) return '十';
    if (n < 20) return `十${d[n - 10]}`;
    if (n < 100) return `${d[Math.floor(n / 10)]}十${n % 10 ? d[n % 10] : ''}`;
    return String(n);
  }

  function renderSpecSheetLogHTML(card, blocks, options = {}) {
    const normalized = normalizeCard(card);
    const meta = getExportMetaOptions(options);
    const layoutKey = normalizeLogHTMLLayout(options.layout || normalized.view?.htmlLayout);
    const colorKey = normalizeLogHTMLColor(options.color || normalized.view?.htmlColor || normalized.view?.htmlTheme, layoutKey);
    const dark = colorKey === 'dark';
    const maxWidth = Math.max(360, Math.min(900, Number(options.maxWidth) || 760));
    const title = escapeHTML(stripSmartMarkdown(normalized.title || '기록').trim() || '기록');
    const tags = meta.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
    const turnsCount = blocks.length;
    const date = new Date(normalized.createdAt || nowMs());
    const dateLabel = `${date.getFullYear()} · ${String(date.getMonth()+1).padStart(2,'0')} · ${String(date.getDate()).padStart(2,'0')}`;
    const fontFamily = getCOAFontFamily(options.font || normalized.view?.fontFamily);
    const c = dark ? {
      bg:'#161614', grid:'rgba(240,238,230,.05)', paper:'#201F1D', ink:'#EDEBE4', sub:'#B8B5AC', muted:'#7E7B73', strip:'#2A2926', fill:'#EDEBE4', fillText:'#161614', shadow:'rgba(237,235,228,.82)'
    } : {
      bg:'#F5F5F1', grid:'rgba(22,21,19,.05)', paper:'#FBFBF8', ink:'#161513', sub:'#57544D', muted:'#87847C', strip:'#E6E5E0', fill:'#161513', fillText:'#F5F5F1', shadow:'rgba(22,21,19,.9)'
    };
    const barcodeColor = dark ? '#FFFFFF' : c.ink;
    const palette = { fg:c.ink, muted:c.sub, italic:c.sub, aiAccent:c.ink, paper:c.paper, quoteBg:c.strip, quoteAccent:c.ink };
    const turns = blocks.map((block, index) => {
      const isUser = block.type === 'user';
      const body = renderSimpleLogContentHTML(block.raw || block.text || '', { excludeComments:true, palette });
      return `<article style="border:1.5px solid ${c.ink};background:${c.paper};margin:0 0 20px;"><div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid ${c.ink};background:${isUser ? c.fill : c.strip};color:${isUser ? c.fillText : c.ink};padding:5px 13px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;font-weight:600;letter-spacing:.2em;"><span style="white-space:nowrap;flex:0 0 auto;">${isUser ? 'USER' : 'AI'}</span><span style="white-space:nowrap;flex:0 0 auto;">T-${String(index+1).padStart(2,'0')}</span></div><div style="padding:16px 18px;font-family:${fontFamily};font-size:14px;line-height:1.95;">${body}</div></article>`;
    }).join('');
    return `<section class="coa-html-log" data-coa-log-layout="specsheet" data-coa-log-color="${colorKey}" style="width:100%;max-width:${maxWidth}px;margin:0 auto;background:linear-gradient(${c.grid} 1px,transparent 1px),linear-gradient(90deg,${c.grid} 1px,transparent 1px),${c.bg};background-size:20px 20px;border:2px solid ${c.ink};box-shadow:6px 6px 0 ${c.shadow};color:${c.ink};box-sizing:border-box;overflow:hidden;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;background:${c.strip};border-bottom:2px solid ${c.ink};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:clamp(7px,1.1vw,10px);font-weight:600;letter-spacing:clamp(.06em,.16vw,.16em);color:${c.sub};"><tbody><tr><td style="width:50%;padding:8px 9px 8px 18px;text-align:left;white-space:nowrap;vertical-align:middle;">${meta.showReference ? `REF: ${escapeHTML(getCardExportRef(normalized))}` : '&nbsp;'}</td><td style="width:50%;padding:8px 18px 8px 9px;text-align:right;white-space:nowrap;vertical-align:middle;">CRACK ARCHIVE</td></tr></tbody></table><header style="padding:30px 30px 24px;border-bottom:2px solid ${c.ink};background:${c.bg};"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:0 18px 0 0;vertical-align:bottom;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.32em;color:${c.muted};margin-bottom:12px;white-space:nowrap;">ROLEPLAY LOG</div><h1 style="margin:0;font-family:${fontFamily};font-size:27px;font-weight:900;letter-spacing:-.015em;line-height:1.25;color:${c.ink};">${title}</h1><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;color:${c.sub};margin-top:12px;letter-spacing:.08em;">${tags ? `${tags} · ` : ''}<span style="white-space:nowrap;">${turnsCount} TURNS</span></div></td><td width="132" style="width:132px;padding:0;vertical-align:bottom;text-align:center;color:${c.ink};"><div style="width:118px;margin:0 auto;">${renderSpecBarcodeSVG(barcodeColor)}</div><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.16em;color:${c.sub};margin-top:5px;text-align:center;white-space:nowrap;">${meta.showDate ? dateLabel : '&nbsp;'}</div></td></tr></tbody></table></header><div style="padding:26px 30px 10px;">${turns}</div><table style="width:100%;border-collapse:collapse;table-layout:auto;border-top:2px solid ${c.ink};background:${c.strip};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;font-weight:600;letter-spacing:.22em;color:${c.sub};"><tbody><tr><td style="padding:8px 9px 8px 18px;text-align:left;white-space:nowrap;vertical-align:middle;">END OF LOG</td><td style="padding:8px 18px 8px 9px;text-align:right;white-space:nowrap;vertical-align:middle;">${turnsCount} TURNS RECORDED</td></tr></tbody></table></section>`;
  }

  function renderAirmailLogHTML(card, blocks, options = {}) {
    const normalized = normalizeCard(card);
    const meta = getExportMetaOptions(options);
    const maxWidth = Math.max(360, Math.min(900, Number(options.maxWidth) || 760));
    const title = escapeHTML(stripSmartMarkdown(normalized.title || '기록').trim() || '기록');
    const tags = meta.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
    const date = new Date(normalized.createdAt || nowMs());
    const mmdd = `${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')}`;
    const fontFamily = getCOAFontFamily(options.font || normalized.view?.fontFamily);
    const palette = { fg:'#3A342B', muted:'#8C8270', italic:'#8C8270', aiAccent:'#34508C', paper:'#FFFDF6', quoteBg:'#F4EEE2', quoteAccent:'#34508C' };
    const letters = blocks.map((block, index) => {
      const isUser = block.type === 'user';
      const body = renderSimpleLogContentHTML(block.raw || block.text || '', { excludeComments:true, palette });
      return `<article style="background:#FFFDF6;border:1px solid #E2D8C2;box-shadow:0 2px 10px rgba(60,45,25,.09);padding:20px 24px 18px;background-image:repeating-linear-gradient(transparent 0 31px,rgba(52,80,140,.10) 31px 32px);background-position:0 54px;transform:rotate(${isUser ? '.4deg' : '-.35deg'});"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 13px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;font-weight:600;letter-spacing:.18em;color:${isUser ? '#B23A34' : '#34508C'};"><tbody><tr><td style="padding:0;text-align:left;">FROM : ${isUser ? 'USER' : 'AI'}</td><td width="82" align="right" style="width:82px;padding:0;text-align:right;white-space:nowrap;color:#B4A98F;font-weight:400;letter-spacing:.1em;">№ ${String(index+1).padStart(2,'0')}</td></tr></tbody></table><div style="font-family:${fontFamily};font-size:14.4px;line-height:2.14;color:#3A342B;">${body}</div></article>`;
    }).join('');
    return `<section class="coa-html-log" data-coa-log-layout="airmail" data-coa-log-color="builtin" style="position:relative;width:100%;max-width:${maxWidth}px;margin:0 auto;${getAirmailFrameStyle()}padding:12px;box-shadow:0 10px 34px rgba(60,45,25,.18);color:#3A342B;box-sizing:border-box;overflow:hidden;"><div style="position:relative;background:#FBF6EA;padding:34px 38px 40px;"><header style="display:grid;grid-template-columns:1fr 150px;gap:20px;align-items:start;border-bottom:1px solid #D9CDB4;padding-bottom:22px;margin-bottom:28px;"><div><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;font-weight:600;letter-spacing:.3em;color:#34508C;margin-bottom:14px;">PAR AVION — VIA AIR MAIL</div><h1 style="margin:0;font-family:${fontFamily};font-size:25px;font-weight:700;letter-spacing:-.01em;line-height:1.4;">${title}</h1><div style="font-size:12px;color:#8C8270;margin-top:11px;letter-spacing:.04em;">${tags ? `${tags} · ` : ''}편지 ${blocks.length}통</div></div><div style="position:relative;width:150px;height:104px;"><div style="position:absolute;top:0;right:0;transform:rotate(2deg);">${renderAirmailStampSVG()}</div>${meta.showDate ? `<div style="position:absolute;top:16px;right:66px;transform:rotate(-9deg);opacity:.82;">${renderAirmailPostmarkSVG(mmdd)}</div>` : ''}</div></header><div style="display:flex;flex-direction:column;gap:26px;">${letters}</div><footer style="margin-top:30px;padding-top:18px;border-top:1px solid #D9CDB4;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;letter-spacing:.24em;color:#B4A98F;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;color:#B4A98F;font:inherit;letter-spacing:inherit;"><tbody><tr><td style="padding:0;text-align:left;">FIN.</td><td width="240" align="right" style="width:240px;padding:0;text-align:right;white-space:nowrap;">CA POST · ${blocks.length} LETTERS</td></tr></tbody></table></footer></div></section>`;
  }

  function getOOCExportContext(card, options = {}) {
    const normalized = normalizeCard(card);
    const requestedMaxWidth = Math.max(360, Math.min(900, Number(options.maxWidth) || COA_EXPORT_MAX_WIDTH));
    const date = new Date(normalized.createdAt || nowMs());
    const tagValues = normalized.tags.slice(0, 10);
    const meta = getExportMetaOptions(options);
    return {
      normalized,
      requestedMaxWidth,
      ...meta,
      title: escapeHTML(stripSmartMarkdown(normalized.title || 'OOC ARCHIVE').trim() || 'OOC ARCHIVE'),
      tags: meta.showTags ? tagValues.map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '',
      tagPlain: meta.showTags ? tagValues.map((tag) => escapeHTML(tag)).join(', ') : '',
      body: renderOOCExportBodyHTML(normalized, options),
      ref: meta.showReference ? escapeHTML(getCardExportRef(normalized)) : '',
      code: meta.showReference ? escapeHTML(makeDCDocCode(normalized, 8)) : '',
      dateText: meta.showDate ? escapeHTML(formatDate(normalized.createdAt, false)) : '',
      dateTimeText: meta.showDate ? escapeHTML(formatDate(normalized.createdAt, true)) : '',
      dateLabel: meta.showDate ? `${date.getFullYear()} · ${String(date.getMonth() + 1).padStart(2, '0')} · ${String(date.getDate()).padStart(2, '0')}` : '',
      mmdd: meta.showDate ? `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : '',
      sourceTitle: escapeHTML(normalized.source?.chatTitle || 'Crack Archive'),
    };
  }

  function renderOOCHTMLTheme(card, options = {}) {
    const ctx = getOOCExportContext(card, options);
    const layoutKey = normalizeOOCHTMLLayout(options.layout || ctx.normalized.view?.htmlLayout);
    const selectedFont = getCOAFontFamily(options.font || ctx.normalized.view?.fontFamily);
    // OOC도 로그와 동일하게 제목·본문에는 사용자가 고른 폰트를 적용한다.
    // 관리번호·영문 라벨처럼 테마 구조를 이루는 작은 표식만 IBM Plex Mono를 유지한다.
    const sans = selectedFont;
    const serif = selectedFont;
    const mono = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
    const width = (cap) => Math.min(ctx.requestedMaxWidth, cap);
    const richBody = (style = '') => `<div class="coa-ooc-rich-body" style="${style}">${ctx.body}</div>`;

    if (layoutKey === 'specsheet') {
      const maxWidth = width(840);
      const specMetaLine = `${ctx.showTags ? (ctx.tags || '#미분류') + ' · ' : ''}<span style="white-space:nowrap;">OOC 1 CARD</span>`;
      const specInfoRow = ctx.showDate
        ? `<tr><th style="width:22%;border:1.5px solid #161513;background:#E6E5E0;padding:8px 10px;text-align:left;">TYPE</th><td style="border:1.5px solid #161513;background:#FBFBF8;padding:8px 10px;">OOC</td><th style="width:22%;border:1.5px solid #161513;background:#E6E5E0;padding:8px 10px;text-align:left;">CREATED</th><td style="border:1.5px solid #161513;background:#FBFBF8;padding:8px 10px;white-space:nowrap;">${ctx.dateText}</td></tr>`
        : `<tr><th style="width:22%;border:1.5px solid #161513;background:#E6E5E0;padding:8px 10px;text-align:left;">TYPE</th><td style="border:1.5px solid #161513;background:#FBFBF8;padding:8px 10px;">OOC</td></tr>`;
      return `<section class="coa-ooc-export" data-coa-ooc-layout="specsheet" style="width:100%;max-width:${maxWidth}px;margin:0 auto;background:linear-gradient(rgba(22,21,19,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(22,21,19,.05) 1px,transparent 1px),#F5F5F1;background-size:20px 20px;border:2px solid #161513;box-shadow:6px 6px 0 rgba(22,21,19,.9);color:#161513;overflow:hidden;font-family:${sans};"><table style="width:100%;border-collapse:collapse;table-layout:fixed;background:#E6E5E0;border-bottom:2px solid #161513;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.16em;color:#57544D;"><tbody><tr><td style="width:50%;padding:8px 9px 8px 18px;text-align:left;white-space:nowrap;vertical-align:middle;">${ctx.showReference ? `REF: ${ctx.ref}` : '&nbsp;'}</td><td style="width:50%;padding:8px 18px 8px 9px;text-align:right;white-space:nowrap;vertical-align:middle;">OOC SPEC SHEET</td></tr></tbody></table><header style="padding:30px 30px 24px;border-bottom:2px solid #161513;background:#F5F5F1;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:0 18px 0 0;vertical-align:bottom;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:${mono};font-size:10px;letter-spacing:.32em;color:#87847C;margin-bottom:12px;white-space:nowrap;">ARCHIVE DOCUMENT</div><h1 style="margin:0;font-size:27px;font-weight:900;letter-spacing:-.015em;line-height:1.25;">${ctx.title}</h1><div style="font-family:${mono};font-size:10.5px;color:#57544D;margin-top:12px;letter-spacing:.08em;">${specMetaLine}</div></td><td width="132" style="width:132px;padding:0;vertical-align:bottom;text-align:center;"><div style="width:118px;margin:0 auto;">${renderSpecBarcodeSVG('#161513')}</div><div style="font-family:${mono};font-size:9px;letter-spacing:.16em;color:#57544D;margin-top:5px;text-align:center;white-space:nowrap;">${ctx.showDate ? ctx.dateLabel : '&nbsp;'}</div></td></tr></tbody></table></header><div style="padding:26px 30px 30px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 20px;font-family:${mono};font-size:10px;"><tbody>${specInfoRow}</tbody></table><article style="border:1.5px solid #161513;background:#FBFBF8;"><div style="display:flex;justify-content:space-between;padding:5px 13px;border-bottom:1.5px solid #161513;background:#161513;color:#F5F5F1;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.2em;"><span style="white-space:nowrap;">CONTENT</span><span style="white-space:nowrap;">S-01</span></div>${richBody('padding:18px 20px;')}</article></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:2px solid #161513;background:#E6E5E0;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.2em;color:#57544D;"><tbody><tr><td style="width:50%;padding:8px 9px 8px 18px;text-align:left;white-space:nowrap;vertical-align:middle;">END OF SHEET</td><td style="width:50%;padding:8px 18px 8px 9px;text-align:right;white-space:nowrap;vertical-align:middle;">1 CARD RECORDED</td></tr></tbody></table></section>`;
    }


    if (layoutKey === 'gwedo') {
      const maxWidth = width(760);
      const p = getLogHTMLPalette('gwedo', LOG_HTML_LAYOUTS.gwedo.defaultColor);
      const metaLine = [ctx.showDate ? ctx.dateText : '', ctx.showReference ? ctx.ref : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="gwedo" style="width:100%;max-width:${maxWidth}px;margin:0 auto;box-sizing:border-box;overflow:hidden;background:${p.bg};color:${p.text};font-family:${sans};border:1px solid ${p.line};"><header style="padding:42px 34px 28px;text-align:center;"><div style="font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.32em;color:${p.accent};white-space:nowrap;">ORBITAL ARCHIVE</div><div style="margin-top:17px;">${renderLogDiamondRule(p.accent, p.line, 210, '◆')}</div><h1 style="margin:18px 0 0;font-size:29px;font-weight:800;line-height:1.45;color:${p.title};">${ctx.title}</h1>${ctx.tags ? `<div style="margin-top:10px;font-size:11.5px;line-height:1.7;color:${p.accent};">${ctx.tags}</div>` : ''}</header><article style="padding:8px 38px 35px;">${richBody(`font-size:14.5px;line-height:2;color:${p.text};`)}<div style="margin-top:34px;">${renderLogDiamondRule(p.accent, p.line, 116, '◆')}</div>${metaLine ? `<div style="margin-top:13px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.13em;color:${p.accent};">${metaLine}</div>` : ''}</article></section>`;
    }

    if (layoutKey === 'muji') {
      const maxWidth = width(740);
      const p = getLogHTMLPalette('muji', LOG_HTML_LAYOUTS.muji.defaultColor);
      const metaLine = [ctx.showDate ? ctx.dateText : '', ctx.showReference ? ctx.ref : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="muji" style="width:100%;max-width:${maxWidth}px;margin:0 auto;box-sizing:border-box;overflow:hidden;background:${p.bg};color:${p.text};font-family:${sans};border:1px solid ${p.line};"><header style="padding:39px 34px 27px;text-align:center;"><div style="font-family:${mono};font-size:9.5px;font-weight:600;letter-spacing:.3em;color:${p.accent};white-space:nowrap;">OOC NOTE</div><h1 style="margin:13px 0 0;font-size:27px;font-weight:800;line-height:1.5;color:${p.title};">${ctx.title}</h1>${ctx.tags ? `<div style="margin-top:9px;font-size:11.5px;line-height:1.7;color:${p.accent};">${ctx.tags}</div>` : ''}</header><article style="padding:0 38px 33px;">${richBody(`font-size:14.5px;line-height:1.95;color:${p.text};`)}<div style="margin-top:32px;text-align:center;font-family:${mono};font-size:10px;letter-spacing:.22em;color:${p.accent};">끝</div>${metaLine ? `<div style="margin-top:9px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.12em;color:${p.accent};">${metaLine}</div>` : ''}</article></section>`;
    }

    if (layoutKey === 'yeobaek') {
      const maxWidth = width(760);
      const p = getLogHTMLPalette('yeobaek', LOG_HTML_LAYOUTS.yeobaek.defaultColor);
      const metaLine = [ctx.showDate ? ctx.dateText : '', ctx.showReference ? ctx.ref : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="yeobaek" style="width:100%;max-width:${maxWidth}px;margin:0 auto;box-sizing:border-box;overflow:hidden;background:${p.bg};color:${p.text};font-family:${sans};border:1px solid ${p.line};"><header style="padding:47px 46px 30px;text-align:left;"><div style="font-family:${mono};font-size:9.5px;font-weight:600;letter-spacing:.34em;color:${p.accent};white-space:nowrap;">ARCHIVE NOTE</div><h1 style="margin:15px 0 0;font-size:30px;font-weight:800;line-height:1.45;color:${p.title};">${ctx.title}</h1>${ctx.tags ? `<div style="margin-top:10px;font-size:11.5px;line-height:1.75;color:${p.accent};">${ctx.tags}</div>` : ''}</header><article style="padding:0 46px 42px;">${richBody(`font-size:14.5px;line-height:2.08;color:${p.text};`)}<div style="width:46px;margin:39px auto 0;border-top:1px solid ${p.line};"></div>${metaLine ? `<div style="margin-top:13px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.12em;color:${p.accent};">${metaLine}</div>` : ''}</article></section>`;
    }

    if (layoutKey === 'baekjimeok') {
      const maxWidth = width(760);
      const p = getLogHTMLPalette('baekjimeok', LOG_HTML_LAYOUTS.baekjimeok.defaultColor);
      const metaLine = [ctx.showDate ? ctx.dateText : '', ctx.showReference ? ctx.ref : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="baekjimeok" style="width:100%;max-width:${maxWidth}px;margin:0 auto;box-sizing:border-box;overflow:hidden;background:${p.bg};color:${p.text};font-family:${serif};border-top:4px double ${p.line};border-bottom:4px double ${p.line};"><header style="padding:44px 36px 27px;text-align:center;"><div style="font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.44em;color:${p.accent};white-space:nowrap;">BOOK ARCHIVE</div><h1 style="margin:16px 0 0;font-size:29px;font-weight:800;line-height:1.48;color:${p.title};">${ctx.title}</h1>${ctx.tags ? `<div style="margin-top:10px;font-size:11.5px;line-height:1.7;color:${p.accent};">${ctx.tags}</div>` : ''}<div style="margin-top:22px;color:${p.accent};font-size:12px;">◆</div></header><article style="padding:8px 38px 36px;">${richBody(`font-size:14.5px;line-height:2.02;color:${p.text};`)}<div style="margin-top:37px;text-align:center;font-family:${mono};font-size:10px;letter-spacing:.25em;color:${p.accent};">— FIN —</div>${metaLine ? `<div style="margin-top:9px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.12em;color:${p.accent};">${metaLine}</div>` : ''}</article></section>`;
    }

    if (layoutKey === 'newspaper') {
      const maxWidth = width(820);
      const newspaperTop = (ctx.showReference || ctx.showDate) ? `<table style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:4px double #211F1A;font-family:${mono};font-size:9.5px;letter-spacing:.14em;color:#6C6351;"><tbody><tr><td style="padding:0 0 8px;text-align:left;white-space:nowrap;">${ctx.showReference ? `EXTRA EDITION · ${ctx.ref}` : '&nbsp;'}</td><td style="padding:0 0 8px;text-align:right;white-space:nowrap;">${ctx.showDate ? ctx.dateText : '&nbsp;'}</td></tr></tbody></table>` : '';
      const issueLine = [ctx.showReference ? `제 ${ctx.code} 호` : '', '오늘의 기록', '호외'].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="newspaper" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:24px;background:#D8D0BC;color:#211F1A;font-family:${serif};"><article style="position:relative;padding:28px 34px 32px;background:radial-gradient(circle at 20% 10%,rgba(255,255,255,.55),transparent 35%),#F5EEDC;border:1px solid #514B3E;box-shadow:5px 7px 0 rgba(44,40,31,.24);">${newspaperTop}<header style="padding:13px 0 17px;text-align:center;border-bottom:1px solid #211F1A;"><div style="font-family:${mono};font-size:10px;letter-spacing:.34em;color:#6C6351;">ARCHIVE GAZETTE</div><div style="margin:6px 0 0;font-size:36px;font-weight:700;letter-spacing:.12em;line-height:1.15;">기 록 일 보</div><div style="margin-top:7px;font-family:${mono};font-size:9.5px;letter-spacing:.12em;color:#6C6351;">${issueLine}</div></header><div style="padding:18px 0 14px;text-align:center;border-bottom:3px double #211F1A;"><span style="display:inline-block;padding:4px 12px;border:1px solid #211F1A;background:#E8DEC5;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.2em;">속 보</span><h1 style="margin:12px auto 0;max-width:90%;font-size:31px;line-height:1.35;letter-spacing:-.02em;">${ctx.title}</h1>${ctx.tags ? `<div style="margin-top:10px;font-family:${mono};font-size:10px;color:#6C6351;">${ctx.tags}</div>` : ''}</div><div style="padding:22px 2px 4px;">${richBody('font-family:'+serif+';font-size:15px;line-height:2;color:#2D2922;text-align:justify;')}</div><footer style="margin-top:21px;padding-top:9px;border-top:2px solid #211F1A;font-family:${mono};font-size:9.5px;color:#6C6351;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:0;text-align:left;">${ctx.showTags ? `KEYWORDS · ${ctx.tags || 'ARCHIVE'}` : '&nbsp;'}</td><td style="padding:0;text-align:right;white-space:nowrap;">ARCHIVE PRESS</td></tr></tbody></table></footer></article></section>`;
    }

    if (layoutKey === 'diagnosis') {
      const maxWidth = width(720);
      const targetRow = ctx.showTags ? `<tr><th style="width:20%;padding:9px 10px;border:1px solid #9CB9B2;background:#E7F1EE;text-align:left;">대상</th><td style="padding:9px 10px;border:1px solid #9CB9B2;">${ctx.tagPlain || '미기재'}</td></tr>` : '';
      const dateRow = ctx.showDate ? `<tr><th style="padding:9px 10px;border:1px solid #9CB9B2;background:#E7F1EE;text-align:left;">기록일</th><td style="padding:9px 10px;border:1px solid #9CB9B2;">${ctx.dateTimeText}</td></tr>` : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="diagnosis" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:22px;background:linear-gradient(135deg,#DCEBE7,#C8DDD8);color:#253733;font-family:${sans};"><article style="position:relative;padding:29px 30px 26px;background:#FBFEFD;border:2px solid #49796E;box-shadow:0 10px 26px rgba(43,81,72,.16);"><div style="position:absolute;right:25px;top:24px;width:74px;height:74px;border:3px double #B3423A;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#B3423A;font-family:${serif};font-size:19px;font-weight:700;transform:rotate(-9deg);opacity:.82;">記 錄</div><header style="padding:0 96px 18px 0;border-bottom:2px solid #49796E;"><div style="font-family:${mono};font-size:9.5px;letter-spacing:.18em;color:#6D8E86;">RECORD FORM${ctx.showReference ? ` · ${ctx.code}` : ''}</div><h1 style="margin:12px 0 0;font-family:${serif};font-size:34px;letter-spacing:.28em;line-height:1.3;">진 단 서</h1></header><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:20px 0 18px;font-size:13px;"><tbody>${targetRow}<tr><th style="padding:9px 10px;border:1px solid #9CB9B2;background:#E7F1EE;text-align:left;">진단명</th><td style="padding:9px 10px;border:1px solid #9CB9B2;font-weight:800;">${ctx.title}</td></tr>${dateRow}</tbody></table><section style="border:1px solid #9CB9B2;background:linear-gradient(#fff,#F6FBF9);"><div style="padding:7px 12px;border-bottom:1px solid #9CB9B2;background:#E7F1EE;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.14em;color:#49796E;">DIAGNOSIS &amp; OBSERVATION</div>${richBody('padding:18px 20px;font-size:14.5px;line-height:1.95;color:#253733;')}</section><div style="margin-top:18px;text-align:center;font-size:13px;line-height:1.8;">위와 같이 기록함.${ctx.showDate ? `<br>${ctx.dateText}` : ''}</div><footer style="display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:16px;font-size:12px;color:#5F7A74;"><span>${ctx.sourceTitle} · 담당 기록자</span><span style="display:inline-flex;width:42px;height:42px;align-items:center;justify-content:center;border:2px solid #B3423A;color:#B3423A;font-family:${serif};font-size:16px;font-weight:700;">認</span></footer></article></section>`;
    }

    if (layoutKey === 'dossier') {
      const maxWidth = width(760);
      const dossierRows = [
        ctx.showReference ? `<tr><th style="width:22%;padding:7px 8px;border:1px solid #777361;background:#C2B99D;text-align:left;">관리번호</th><td colspan="3" style="padding:7px 8px;border:1px solid #777361;background:#E7E0C9;">${ctx.code}</td></tr>` : '',
        ctx.showDate ? `<tr><th style="width:22%;padding:7px 8px;border:1px solid #777361;background:#C2B99D;text-align:left;">작성일</th><td colspan="3" style="padding:7px 8px;border:1px solid #777361;background:#E7E0C9;white-space:nowrap;">${ctx.dateText}</td></tr>` : '',
        ctx.showTags ? `<tr><th style="width:22%;padding:7px 8px;border:1px solid #777361;background:#C2B99D;text-align:left;">관련 표식</th><td colspan="3" style="padding:7px 8px;border:1px solid #777361;background:#E7E0C9;">${ctx.tagPlain || '미지정'}</td></tr>` : '',
        `<tr><th style="width:22%;padding:7px 8px;border:1px solid #777361;background:#C2B99D;text-align:left;">열람등급</th><td colspan="3" style="padding:7px 8px;border:1px solid #777361;background:#E7E0C9;">Ⅱ급 이상</td></tr>`,
      ].join('');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="dossier" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:30px;background:#2D2E28;color:#24241F;font-family:${sans};"><article style="position:relative;background:#D8D0B5;border:2px solid #181914;box-shadow:10px 12px 0 rgba(0,0,0,.38);overflow:hidden;"><div style="height:14px;background:repeating-linear-gradient(135deg,#1A1B17 0 14px,#B79B45 14px 28px);"></div><header style="padding:28px 30px 21px;border-bottom:2px solid #181914;background:linear-gradient(100deg,rgba(255,255,255,.24),transparent 52%),#D8D0B5;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:0 18px 0 0;vertical-align:top;"><div style="font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.22em;color:#5D5C4F;">CLASSIFIED ARCHIVE${ctx.showReference ? ` · ${ctx.ref}` : ''}</div><h1 style="margin:11px 0 0;font-size:29px;line-height:1.35;letter-spacing:-.02em;">${ctx.title}</h1></td><td width="116" style="width:116px;padding:0;text-align:right;vertical-align:top;"><span style="display:inline-block;padding:7px 12px;border:4px double #8E2F2B;color:#8E2F2B;font-family:${mono};font-size:13px;font-weight:600;letter-spacing:.16em;transform:rotate(5deg);">대 외 비</span></td></tr></tbody></table></header><div style="padding:22px 28px 28px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:18px;font-family:${mono};font-size:10px;"><tbody>${dossierRows}</tbody></table><section style="position:relative;padding:23px 24px;background:#EEE8D4;border:1px solid #777361;box-shadow:inset 0 0 25px rgba(85,76,53,.08);"><span style="position:absolute;left:30px;top:-10px;width:86px;height:20px;background:rgba(220,205,153,.82);transform:rotate(-2deg);"></span>${richBody('font-size:14.5px;line-height:1.95;color:#292821;')}</section><div style="margin-top:18px;padding-top:10px;border-top:1px dashed #777361;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.08em;color:#666252;">무단 복제 및 외부 반출 금지 · 열람 후 지정 위치에 반환</div></div></article></section>`;
    }

    if (layoutKey === 'receipt') {
      const maxWidth = width(460);
      const receiptMeta = [ctx.showTags ? (ctx.tags || 'OOC ARCHIVE') : '', ctx.showDate ? ctx.dateTimeText : '', ctx.showReference ? `NO.${ctx.code}` : ''].filter(Boolean).join('<br>');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="receipt" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:26px 20px;background:#DDDCD6;color:#25241F;font-family:${selectedFont};"><article style="position:relative;padding:28px 25px 24px;background:repeating-linear-gradient(0deg,rgba(62,59,50,.025) 0 1px,transparent 1px 4px),#FFFDF5;filter:drop-shadow(0 8px 12px rgba(0,0,0,.18));clip-path:polygon(0 0,100% 0,100% calc(100% - 10px),97% 100%,94% calc(100% - 10px),91% 100%,88% calc(100% - 10px),85% 100%,82% calc(100% - 10px),79% 100%,76% calc(100% - 10px),73% 100%,70% calc(100% - 10px),67% 100%,64% calc(100% - 10px),61% 100%,58% calc(100% - 10px),55% 100%,52% calc(100% - 10px),49% 100%,46% calc(100% - 10px),43% 100%,40% calc(100% - 10px),37% 100%,34% calc(100% - 10px),31% 100%,28% calc(100% - 10px),25% 100%,22% calc(100% - 10px),19% 100%,16% calc(100% - 10px),13% 100%,10% calc(100% - 10px),7% 100%,4% calc(100% - 10px),0 100%);"><header style="text-align:center;"><div style="font-size:10px;letter-spacing:.24em;color:#79756A;">CRACK ARCHIVE</div><h1 style="margin:10px 0 0;font-family:${sans};font-size:22px;line-height:1.4;">${ctx.title}</h1><div style="margin-top:6px;font-size:10px;line-height:1.65;color:#79756A;">${receiptMeta}</div></header><div style="margin:16px 0;border-top:1px dashed #817D72;"></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:13px;font-size:10px;"><tbody><tr><td style="padding:0;text-align:left;">ITEM</td><td style="padding:0;text-align:right;">QTY</td></tr><tr><td style="padding:7px 0;border-bottom:1px dotted #A5A197;">ARCHIVE CONTENT</td><td style="padding:7px 0;border-bottom:1px dotted #A5A197;text-align:right;">1</td></tr></tbody></table>${richBody('font-family:'+sans+';font-size:13.5px;line-height:1.8;color:#2C2A24;')}<div style="margin:16px 0 13px;border-top:1px dashed #817D72;"></div><table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;"><tbody><tr><td style="padding:2px 0;">TOTAL RECORDS</td><td style="padding:2px 0;text-align:right;font-weight:600;">1 CARD</td></tr><tr><td style="padding:2px 0;">STATUS</td><td style="padding:2px 0;text-align:right;">ARCHIVED</td></tr></tbody></table>${ctx.showReference ? `<div style="width:118px;margin:18px auto 0;color:#25241F;">${renderSpecBarcodeSVG('#25241F')}</div><div style="margin-top:4px;text-align:center;font-size:9px;letter-spacing:.18em;color:#79756A;">${ctx.ref}</div>` : ''}<div style="margin-top:13px;text-align:center;font-size:10px;color:#79756A;">THANK YOU FOR YOUR RECORD</div></article></section>`;
    }

    if (layoutKey === 'library') {
      const maxWidth = width(650);
      const libraryMeta = [ctx.showReference ? `CARD NO. ${ctx.code}` : '', ctx.showTags ? (ctx.tags || 'OOC ARCHIVE') : ''].filter(Boolean).join(' · ');
      const stamp = `<span style="display:inline-block;padding:3px 11px;border:2px double #A5372D;color:#A5372D;font-family:${mono};font-size:11px;font-weight:700;letter-spacing:.12em;transform:rotate(-4deg);white-space:nowrap;">${ctx.dateLabel}</span>`;
      const dueRows = [stamp, '', ''].map((mark) => `<tr><td style="height:32px;border:1px solid #D5C79E;padding:3px 8px;text-align:center;vertical-align:middle;">${mark}</td><td style="height:32px;border:1px solid #D5C79E;padding:3px 8px;text-align:center;vertical-align:middle;font-family:${mono};font-size:10px;letter-spacing:.14em;color:#A99A73;">${mark ? 'IN ARCHIVE' : ''}</td></tr>`).join('');
      const dueTable = ctx.showDate
        ? `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:18px 0 20px;background:#FDF9E9;"><tbody><tr><th style="width:50%;border:1px solid #D5C79E;background:#F1E7C9;padding:6px 8px;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.2em;color:#8A7C5E;text-align:center;">DATE DUE</th><th style="border:1px solid #D5C79E;background:#F1E7C9;padding:6px 8px;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.2em;color:#8A7C5E;text-align:center;">STATUS</th></tr>${dueRows}</tbody></table>`
        : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="library" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:30px 26px;background:#AC9C7C;color:#3A3222;font-family:${sans};"><article style="position:relative;padding:26px 30px 24px;background:repeating-linear-gradient(transparent 0 27px,rgba(90,120,160,.14) 27px 28px),#FBF4DC;border:1px solid #8F8060;border-radius:3px;box-shadow:0 9px 22px rgba(52,44,26,.28);"><div style="position:absolute;left:18px;top:18px;width:13px;height:13px;border:1px solid #B7A77E;border-radius:50%;background:#E8DCB9;box-shadow:inset 0 1px 2px rgba(72,60,35,.2);"></div><header style="text-align:center;border-bottom:3px double #A5372D;padding-bottom:16px;"><div style="font-family:${mono};font-size:10px;letter-spacing:.34em;color:#8A7C5E;">ARCHIVE LIBRARY</div><h1 style="margin:11px 0 0;font-family:${serif};font-size:26px;font-weight:700;line-height:1.45;">${ctx.title}</h1>${libraryMeta ? `<div style="margin-top:8px;font-family:${mono};font-size:10px;letter-spacing:.14em;color:#8A7C5E;">${libraryMeta}</div>` : ''}</header>${dueTable}${richBody('font-size:14.3px;line-height:1.97;color:#3A3222;')}<footer style="margin-top:22px;padding-top:12px;border-top:1px solid #D5C79E;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.2em;color:#A99A73;">KEEP THIS CARD IN THE BOOK POCKET${ctx.showReference ? ` · ${ctx.ref}` : ''}</footer></article></section>`;
    }

    if (layoutKey === 'onair') {
      const maxWidth = width(780);
      const onairCue = ctx.showDate
        ? `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 18px;font-family:${mono};font-size:10px;letter-spacing:.12em;"><tbody><tr><th style="width:18%;border:1px solid #2A3550;background:#1B2340;color:#9AA4C0;padding:7px 9px;text-align:left;">CUE</th><td style="border:1px solid #2A3550;color:#D9DCE8;padding:7px 9px;">Q-01</td><th style="width:18%;border:1px solid #2A3550;background:#1B2340;color:#9AA4C0;padding:7px 9px;text-align:left;">TIME</th><td style="border:1px solid #2A3550;color:#D9DCE8;padding:7px 9px;white-space:nowrap;">${ctx.dateTimeText}</td></tr></tbody></table>`
        : `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 18px;font-family:${mono};font-size:10px;letter-spacing:.12em;"><tbody><tr><th style="width:24%;border:1px solid #2A3550;background:#1B2340;color:#9AA4C0;padding:7px 9px;text-align:left;">CUE</th><td style="border:1px solid #2A3550;color:#D9DCE8;padding:7px 9px;">Q-01</td></tr></tbody></table>`;
      return `<section class="coa-ooc-export" data-coa-ooc-layout="onair" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:26px 22px;background:radial-gradient(circle at 50% -20%,#202B48 0,#0B101D 48%);color:#D9DCE8;font-family:${sans};"><article style="background:#131A2C;border:1px solid #2A3550;border-radius:4px;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.45);"><div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 20px;background:#0F1526;border-bottom:1px solid #2A3550;"><span style="display:inline-flex;align-items:center;gap:8px;padding:5px 13px;background:#C24A3F;color:#FFF4EF;font-family:${mono};font-size:10px;font-weight:700;letter-spacing:.24em;border-radius:2px;white-space:nowrap;"><span style="width:7px;height:7px;border-radius:50%;background:#FFE2DB;box-shadow:0 0 8px rgba(255,226,219,.9);"></span>ON AIR</span><span style="font-family:${mono};font-size:10px;letter-spacing:.2em;color:#7C86A0;white-space:nowrap;">MIDNIGHT FREQUENCY${ctx.showReference ? ` · ${ctx.ref}` : ''}</span></div><header style="padding:28px 30px 22px;border-bottom:1px solid #2A3550;"><div style="font-family:${mono};font-size:10px;letter-spacing:.32em;color:#E8B25A;">TONIGHT'S CUE SHEET</div><h1 style="margin:12px 0 0;font-size:27px;font-weight:800;line-height:1.4;color:#F2E9D8;">${ctx.title}</h1>${ctx.showTags ? `<div style="margin-top:10px;font-size:12px;color:#7C86A0;">${ctx.tags || 'OOC ARCHIVE'}</div>` : ''}</header><div style="padding:22px 26px 26px;">${onairCue}<article style="padding:18px 21px;background:#0F1526;border:1px solid #2A3550;border-left:3px solid #E8B25A;">${richBody('font-size:14.3px;line-height:2.02;color:#D9DCE8;')}</article><div style="margin-top:20px;text-align:center;font-family:${mono};font-size:10px;letter-spacing:.3em;color:#7C86A0;">— SIGNAL ENDS · STAY TUNED —</div></div></article></section>`;
    }


    if (layoutKey === 'quest') {
      const maxWidth = width(720);
      const questMeta = [
        ctx.showReference ? `<span style="display:inline-block;padding:4px 11px;border:1px solid rgba(196,169,106,.55);white-space:nowrap;">QUEST ${ctx.code}</span>` : '',
        ctx.showDate ? `<span style="display:inline-block;padding:4px 11px;border:1px solid rgba(196,169,106,.55);white-space:nowrap;">${ctx.dateLabel}</span>` : '',
      ].filter(Boolean).join('<span style="display:inline-block;width:6px;"></span>');
      const questTags = ctx.showTags ? `<div style="margin-top:9px;font-size:11.5px;letter-spacing:.05em;color:#8E93A7;">표식 · ${ctx.tags || '#OOC'}</div>` : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="quest" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:28px 22px;background:radial-gradient(circle at 50% -30%,#282D3E 0,#11141C 48%,#090B10 100%);color:#D7D2C5;font-family:${sans};"><article style="position:relative;padding:31px 34px 27px;background:linear-gradient(155deg,#1B1F2B,#12151D 66%);border:1px solid #363C50;box-shadow:0 18px 44px rgba(0,0,0,.52);overflow:hidden;"><span style="position:absolute;left:-1px;top:-1px;width:22px;height:22px;border-left:2px solid #C4A96A;border-top:2px solid #C4A96A;"></span><span style="position:absolute;right:-1px;top:-1px;width:22px;height:22px;border-right:2px solid #C4A96A;border-top:2px solid #C4A96A;"></span><span style="position:absolute;left:-1px;bottom:-1px;width:22px;height:22px;border-left:2px solid #C4A96A;border-bottom:2px solid #C4A96A;"></span><span style="position:absolute;right:-1px;bottom:-1px;width:22px;height:22px;border-right:2px solid #C4A96A;border-bottom:2px solid #C4A96A;"></span><table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:${mono};font-size:9.5px;letter-spacing:.22em;color:#737A90;"><tbody><tr><td style="padding:0;text-align:left;white-space:nowrap;">QUEST JOURNAL</td><td style="padding:0;text-align:right;white-space:nowrap;">${ctx.showReference ? ctx.ref : 'TRACKING ACTIVE'}</td></tr></tbody></table><header style="padding:24px 10px 22px;text-align:center;border-bottom:1px solid #303548;"><div style="font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.38em;color:#C4A96A;white-space:nowrap;">◆&nbsp;&nbsp;MAIN QUEST&nbsp;&nbsp;◆</div><h1 style="margin:14px 0 0;font-family:${serif};font-size:28px;font-weight:700;line-height:1.46;color:#F0E9D8;">${ctx.title}</h1>${questTags}</header><div style="position:relative;margin-top:23px;padding:3px 5px 3px 21px;border-left:2px solid rgba(196,169,106,.62);"><span style="position:absolute;left:-5px;top:16px;width:8px;height:8px;background:#C4A96A;transform:rotate(45deg);"></span>${richBody('font-size:14.2px;line-height:2.04;color:#D0CABB;')}</div><footer style="margin-top:26px;padding-top:16px;border-top:1px solid #303548;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:0;vertical-align:middle;">${questMeta || '<span style="font-family:'+mono+';font-size:9.5px;letter-spacing:.24em;color:#737A90;">OOC ARCHIVE</span>'}</td><td width="150" style="width:150px;padding:0;text-align:right;vertical-align:middle;font-family:${mono};font-size:9px;letter-spacing:.18em;color:#5B6173;white-space:nowrap;">OBJECTIVE SAVED</td></tr></tbody></table></footer></article></section>`;
    }

    if (layoutKey === 'midnight') {
      const maxWidth = width(660);
      const midnightMeta = [
        ctx.showTags ? `수신 표식: ${ctx.tags || '#OOC'}` : '',
        ctx.showDate ? `접수 시각: ${ctx.dateTimeText}` : '',
      ].filter(Boolean);
      const midnightMetaHTML = midnightMeta.length ? `<div style="margin-top:10px;font-size:11px;line-height:1.8;letter-spacing:.08em;color:#817A6B;">${midnightMeta.join('<br>')}</div>` : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="midnight" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:27px 22px;background:#050506;color:#D6CFBD;font-family:${selectedFont};"><article style="position:relative;padding:25px 30px 27px;background:radial-gradient(circle at 82% 3%,rgba(255,255,255,.045),transparent 39%),radial-gradient(circle at 10% 94%,rgba(255,255,255,.03),transparent 34%),#141311;border:1px solid #302D27;box-shadow:0 18px 46px rgba(0,0,0,.66);overflow:hidden;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid #38342D;font-size:9.5px;letter-spacing:.18em;color:#8E8779;"><tbody><tr><td style="padding:0 0 10px;text-align:left;white-space:nowrap;">심야 기록국 · 내부 문서</td><td style="padding:0 0 10px;text-align:right;white-space:nowrap;">${ctx.showReference ? `문서번호 O-${ctx.code} · ` : ''}1／1 면</td></tr></tbody></table><header style="position:relative;padding:27px 112px 22px 0;border-bottom:1px solid #302D27;"><span style="position:absolute;right:0;top:20px;display:inline-block;padding:6px 12px;border:3px double #A63A31;color:#B84439;font-size:12px;font-weight:700;letter-spacing:.24em;transform:rotate(5deg);white-space:nowrap;">열람 제한</span><div style="font-size:9.5px;letter-spacing:.28em;color:#767064;">NIGHT RECORD BUREAU</div><h1 style="margin:11px 0 0;font-family:inherit;font-size:27px;font-weight:700;line-height:1.5;color:#EFE7D4;">${ctx.title}</h1>${midnightMetaHTML}</header><div style="position:relative;margin-top:23px;padding:18px 20px;background:#0D0C0B;border:1px solid #302D27;border-left:3px solid #7F2923;">${richBody('font-family:inherit;font-size:13.5px;line-height:2.06;color:#CCC4B1;')}</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:24px;"><tbody><tr><td style="padding:0;vertical-align:bottom;"><div style="font-size:9.5px;line-height:1.85;letter-spacing:.14em;color:#5F594F;">검열 구간&nbsp;&nbsp;<span style="display:inline-block;width:118px;height:10px;background:#070707;vertical-align:middle;"></span></div><div style="margin-top:5px;font-size:9.5px;line-height:1.85;letter-spacing:.14em;color:#5F594F;">보존 등급&nbsp;&nbsp;PERMANENT</div></td><td width="118" style="width:118px;padding:0;text-align:center;vertical-align:bottom;"><div style="width:92px;height:92px;margin:0 auto;border:1.5px dashed #8E8779;border-radius:50%;display:flex;align-items:center;justify-content:center;transform:rotate(-7deg);opacity:.78;"><div style="width:68px;height:68px;border:1px solid #8E8779;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:8px;letter-spacing:.18em;line-height:1.8;color:#B8B09E;">심야<br>기록국<br>보존 인장</div></div></td></tr></tbody></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:22px;font-size:10px;"><tbody><tr><th style="width:33.3%;border:1px solid #3B372F;background:#1C1A17;padding:6px 8px;font-weight:400;letter-spacing:.22em;color:#8E8779;text-align:center;">담&nbsp;당</th><th style="width:33.3%;border:1px solid #3B372F;background:#1C1A17;padding:6px 8px;font-weight:400;letter-spacing:.22em;color:#8E8779;text-align:center;">검&nbsp;토</th><th style="border:1px solid #3B372F;background:#1C1A17;padding:6px 8px;font-weight:400;letter-spacing:.22em;color:#8E8779;text-align:center;">승&nbsp;인</th></tr><tr><td style="height:56px;border:1px solid #3B372F;padding:6px;text-align:center;vertical-align:middle;"><span style="display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border:1.5px solid #A63A31;border-radius:50%;color:#B84439;font-family:${serif};font-size:13px;transform:rotate(-8deg);">記</span></td><td style="height:56px;border:1px solid #3B372F;padding:6px;text-align:center;vertical-align:middle;color:#514B41;font-size:10px;letter-spacing:.18em;">(서명란)</td><td style="height:56px;border:1px solid #3B372F;padding:6px;text-align:center;vertical-align:middle;"><span style="display:inline-block;width:34px;height:42px;background:repeating-radial-gradient(ellipse at 50% 55%,rgba(214,207,189,.45) 0 1px,transparent 1px 3.5px);border:1px solid #49443B;box-shadow:inset 0 0 0 3px #141311;"></span></td></tr></tbody></table><footer style="margin-top:18px;padding-top:11px;border-top:1px solid #302D27;text-align:center;font-size:9px;letter-spacing:.24em;color:#5E584D;">본 문서는 폐기 대상이 아님 · 심야 기록국 보존서고 이관</footer></article></section>`;
    }

    if (layoutKey === 'airmail') {
      const maxWidth = width(840);
      return `<section class="coa-ooc-export coa-html-log" data-coa-ooc-layout="airmail" style="position:relative;width:100%;max-width:${maxWidth}px;margin:0 auto;${getAirmailFrameStyle()}padding:12px;box-shadow:0 10px 34px rgba(60,45,25,.18);color:#3A342B;overflow:hidden;font-family:${selectedFont};"><div style="position:relative;background:#FBF6EA;padding:34px 38px 40px;"><header style="display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:20px;align-items:start;border-bottom:1px solid #D9CDB4;padding-bottom:22px;margin-bottom:28px;"><div><div style="font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.3em;color:#34508C;margin-bottom:14px;white-space:nowrap;">PAR AVION — VIA AIR MAIL</div><h1 style="margin:0;font-family:${serif};font-size:25px;font-weight:700;line-height:1.4;">${ctx.title}</h1><div style="font-size:12px;color:#8C8270;margin-top:11px;">${ctx.showTags ? `${ctx.tags || 'OOC ARCHIVE'} · ` : ''}편지 1통</div></div><div style="position:relative;width:150px;height:104px;"><div style="position:absolute;top:0;right:0;transform:rotate(2deg);">${renderAirmailStampSVG()}</div>${ctx.showDate ? `<div style="position:absolute;top:16px;right:66px;transform:rotate(-9deg);opacity:.82;">${renderAirmailPostmarkSVG(ctx.mmdd)}</div>` : ''}</div></header><article style="background:#FFFDF6;border:1px solid #E2D8C2;box-shadow:0 2px 10px rgba(60,45,25,.09);padding:20px 24px 18px;background-image:repeating-linear-gradient(transparent 0 31px,rgba(52,80,140,.10) 31px 32px);background-position:0 54px;transform:rotate(.18deg);"><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 13px;font-family:${mono};font-size:10px;font-weight:600;letter-spacing:.18em;color:#B23A34;"><tbody><tr><td style="padding:0;text-align:left;">FROM : OOC</td><td width="82" style="width:82px;padding:0;text-align:right;white-space:nowrap;color:#B4A98F;font-weight:400;">№ 01</td></tr></tbody></table>${richBody('font-family:'+serif+';font-size:14.4px;line-height:2.14;color:#3A342B;')}</article><footer style="margin-top:30px;padding-top:18px;border-top:1px solid #D9CDB4;font-family:${mono};font-size:10px;letter-spacing:.24em;color:#B4A98F;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;color:#B4A98F;font:inherit;letter-spacing:inherit;"><tbody><tr><td style="padding:0;text-align:left;">FIN.</td><td width="220" style="width:220px;padding:0;text-align:right;white-space:nowrap;">CA POST · 1 LETTER</td></tr></tbody></table></footer></div></section>`;
    }

    if (layoutKey === 'timeline') {
      const maxWidth = width(620);
      const handle = ctx.showReference ? `@archive_${ctx.code}` : '@crack_archive';
      const headMeta = [handle, ctx.showDate ? ctx.dateText : ''].filter(Boolean).join(' · ');
      const statLead = ctx.showDate ? `${ctx.dateTimeText} · ` : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="timeline" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:26px 18px;background:#E8ECEF;color:#0F1419;font-family:${sans};box-sizing:border-box;"><article style="background:#FFFFFF;border:1px solid #E1E8ED;border-radius:16px;overflow:hidden;box-shadow:0 3px 12px rgba(15,20,25,.07);"><div style="display:flex;align-items:center;gap:12px;padding:18px 20px 0;"><span style="display:inline-flex;flex:none;width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#1D9BF0,#7CCBFF);color:#FFFFFF;font-family:${mono};font-size:15px;font-weight:700;align-items:center;justify-content:center;letter-spacing:.04em;">OC</span><span style="min-width:0;"><span style="display:block;font-size:15px;font-weight:800;line-height:1.35;">${ctx.sourceTitle}</span><span style="display:block;margin-top:2px;font-size:12.5px;color:#536471;line-height:1.4;">${headMeta}</span></span><span style="margin-left:auto;color:#536471;font-size:17px;letter-spacing:2px;">···</span></div><div style="padding:14px 20px 0;"><h1 style="margin:0 0 10px;font-size:19px;font-weight:800;line-height:1.5;">${ctx.title}</h1>${richBody('font-size:14.8px;line-height:1.85;color:#0F1419;')}${ctx.tags ? `<div style="margin-top:13px;font-size:13.5px;line-height:1.7;color:#1D9BF0;">${ctx.tags}</div>` : ''}</div><div style="margin:15px 20px 0;padding:11px 2px 10px;border-top:1px solid #EFF3F4;border-bottom:1px solid #EFF3F4;font-size:12.5px;color:#536471;">${statLead}<strong style="color:#0F1419;">1</strong> 카드 보관됨</div><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:10px 0 14px 24px;font-family:${mono};font-size:11px;color:#536471;">◌ 답글 0</td><td align="center" style="padding:10px 0 14px;text-align:center;font-family:${mono};font-size:11px;color:#00BA7C;">⇄ 재게시 0</td><td align="center" style="padding:10px 0 14px;text-align:center;font-family:${mono};font-size:11px;color:#F91880;">♥ 보관</td><td align="right" style="padding:10px 24px 14px 0;text-align:right;font-family:${mono};font-size:11px;color:#536471;">↗ 공유</td></tr></tbody></table></article><div style="margin-top:12px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.24em;color:#8A959E;">OOC TIMELINE${ctx.showReference ? ` · ${ctx.ref}` : ''}</div></section>`;
    }

    if (layoutKey === 'board') {
      const maxWidth = width(820);
      const infoRight = [ctx.showDate ? ctx.dateTimeText : '', '조회 1', '★ 개념 ∞', '댓글 0'].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="board" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:24px 18px;background:#F4F4F4;color:#333333;font-family:${sans};box-sizing:border-box;"><article style="background:#FFFFFF;border:1px solid #D5D7DE;overflow:hidden;"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 17px;background:#3B4890;color:#FFFFFF;"><span style="font-size:15px;font-weight:800;white-space:nowrap;">OOC 갤러리</span><span style="font-family:${mono};font-size:9px;letter-spacing:.15em;color:#D8DCF2;white-space:nowrap;">OOC BOARD${ctx.showReference ? ` · ${ctx.ref}` : ''}</span></div><header style="padding:17px 18px 14px;border-bottom:1px solid #D9D9D9;"><h1 style="margin:0;font-size:17px;font-weight:800;line-height:1.5;color:#222222;"><span style="display:inline-block;margin-right:7px;padding:1px 6px;border:1px solid #BFC7E8;background:#F7F8FE;color:#3B4890;font-size:10.5px;font-weight:700;vertical-align:2px;white-space:nowrap;">OOC</span>${ctx.title}</h1><table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:9px;font-size:11.5px;color:#777777;"><tbody><tr><td style="padding:0;text-align:left;"><strong style="color:#333333;">ㅇㅇ</strong>(기록자)</td><td style="padding:0;text-align:right;white-space:nowrap;">${infoRight}</td></tr></tbody></table></header><div style="min-height:180px;padding:25px 20px 28px;">${richBody('font-size:13.6px;line-height:1.82;color:#333333;')}${ctx.tags ? `<div style="margin-top:18px;padding-top:13px;border-top:1px solid #E3E3E3;font-size:12px;color:#3B4890;">${ctx.tags}</div>` : ''}</div><div style="width:262px;max-width:calc(100% - 36px);margin:0 auto 21px;border:1px solid #C8C8C8;background:#FFFFFF;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="height:80px;padding:0;text-align:right;vertical-align:middle;font-size:12px;color:#DB2B18;">0&nbsp;&nbsp;</td><td width="96" style="width:96px;padding:0;text-align:center;vertical-align:middle;"><span style="display:inline-flex;width:52px;height:52px;border-radius:50%;background:#6C70D9;color:#FFFFFF;align-items:center;justify-content:center;flex-direction:column;font-size:22px;line-height:1;">★<small style="display:block;margin-top:3px;font-size:9px;font-weight:700;">개념</small></span></td><td style="padding:0;"></td></tr></tbody></table><table style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid #C8C8C8;font-size:11px;color:#666666;"><tbody><tr><td style="padding:9px 0;text-align:center;border-right:1px solid #C8C8C8;">↗ 공유</td><td style="padding:9px 0;text-align:center;border-right:1px solid #C8C8C8;">＋ 스크랩</td><td style="padding:9px 0;text-align:center;">♨ 신고</td></tr></tbody></table></div><div style="padding:0 18px 8px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid #4D58C7;font-size:11.5px;color:#555555;"><tbody><tr><td style="padding:9px 0;text-align:left;white-space:nowrap;"><strong style="color:#222222;">전체 댓글 <span style="color:#C62917;">0</span>개</strong>&nbsp;&nbsp;✓ 등록순&nbsp;&nbsp;✓ 최신순&nbsp;&nbsp;답글순</td><td style="padding:9px 0;text-align:right;white-space:nowrap;"><span style="display:inline-block;padding:3px 8px;border:1px solid #4D58C7;color:#3B4890;font-weight:700;">댓글 등록</span>&nbsp;&nbsp;본문 보기&nbsp;&nbsp;새로고침</td></tr></tbody></table><div style="padding:14px 0 17px;font-size:11.5px;color:#999999;">등록된 댓글이 없습니다.</div></div></article></section>`;
    }

    if (layoutKey === 'wiki') {
      const maxWidth = width(840);
      const wikiTags = ctx.tags
        ? ctx.tags.split('·').map((tag) => `<span style="color:#0275D8;">${tag.trim().replace(/^#/, '')}</span>`).join('&nbsp;<span style="color:#B8BFC6;">|</span>&nbsp;')
        : '';
      const wikiDateOnly = ctx.dateTimeText ? ctx.dateTimeText.replace(/(오전|오후).*$/, '').trim() : '';
      const wikiRef = ctx.showReference ? ctx.ref : 'OOC DOCUMENT';
      const wikiSource = 'USER';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="wiki" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:20px 14px;background:#E9EBEE;color:#212529;font-family:${sans};box-sizing:border-box;"><article style="background:#FFFFFF;border:1px solid #D5D9DD;border-radius:7px;overflow:hidden;box-shadow:0 2px 8px rgba(33,37,41,.06);"><div style="display:flex;align-items:center;gap:9px;padding:9px 16px;background:#00A495;"><span style="display:inline-flex;align-items:center;gap:7px;font-size:16px;font-weight:800;color:#FFFFFF;white-space:nowrap;">${renderCrackWikiMarkSVG(22, '#FFFFFF')}<span>크랙위키</span></span><span style="margin-left:auto;display:flex;align-items:center;gap:8px;width:216px;max-width:46%;padding:6px 10px;background:#FFFFFF;border:1px solid rgba(0,0,0,.08);border-radius:4px;font-size:11.5px;color:#98A0A8;"><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">여기에서 검색</span><span style="flex:none;color:#657078;font-family:${mono};font-size:13px;">⌕</span></span></div><div style="padding:18px 22px 0;"><div class="coa-wiki-titlebar" style="display:flex;align-items:flex-end;gap:10px;border-bottom:1px solid #D5D9DD;padding-bottom:7px;"><h1 style="flex:1;min-width:0;margin:0;font-size:29px;font-weight:700;line-height:1.35;overflow-wrap:break-word;word-break:keep-all;">${ctx.title}</h1><span class="coa-wiki-actions" style="flex:none;display:flex;gap:5px;padding-bottom:3px;"><span style="padding:4px 9px;border:1px solid #D5D9DD;border-radius:4px;background:#FFFFFF;font-size:11px;color:#555C62;white-space:nowrap;">역링크</span><span style="padding:4px 9px;border:1px solid #D5D9DD;border-radius:4px;background:#FFFFFF;font-size:11px;color:#555C62;white-space:nowrap;">토론</span><span style="padding:4px 9px;border:1px solid #D5D9DD;border-radius:4px;background:#FFFFFF;font-size:11px;color:#555C62;white-space:nowrap;">편집</span><span style="padding:4px 9px;border:1px solid #D5D9DD;border-radius:4px;background:#FFFFFF;font-size:11px;color:#555C62;white-space:nowrap;">역사</span></span></div>${ctx.showDate ? `<div style="margin-top:7px;text-align:right;font-size:11.5px;color:#86909A;">최근 수정 시각: ${ctx.dateTimeText}</div>` : ''}${wikiTags ? `<div style="margin-top:10px;padding:8px 12px;border:1px solid #D5D9DD;border-radius:5px;font-size:12.5px;line-height:1.7;color:#212529;">분류:&nbsp;${wikiTags}</div>` : ''}</div><div style="padding:14px 22px 24px;"><table class="coa-wiki-infobox" style="float:right;width:225px;margin:2px 0 14px 18px;border-collapse:collapse;border:1px solid #C8CDD2;font-size:12px;"><tbody><tr><td colspan="2" style="padding:8px 10px;background:#00A495;color:#FFFFFF;font-weight:800;text-align:center;font-size:12.5px;">OOC 기록 문서</td></tr><tr><td style="width:64px;padding:6px 9px;background:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;white-space:nowrap;">출처</td><td style="padding:6px 9px;border-top:1px solid #E1E5E8;overflow-wrap:anywhere;">${wikiSource}</td></tr>${ctx.showDate ? `<tr><td style="padding:6px 9px;background:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;white-space:nowrap;">기록일</td><td style="padding:6px 9px;border-top:1px solid #E1E5E8;">${wikiDateOnly}</td></tr>` : ''}${ctx.showReference ? `<tr><td style="padding:6px 9px;background:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;white-space:nowrap;">관리번호</td><td style="padding:6px 9px;border-top:1px solid #E1E5E8;font-family:${mono};font-size:11px;">${ctx.ref}</td></tr>` : ''}<tr><td style="padding:6px 9px;background:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;white-space:nowrap;">보관처</td><td style="padding:6px 9px;border-top:1px solid #E1E5E8;">CRACK ARCHIVE</td></tr></tbody></table><div class="coa-wiki-toc" style="display:inline-block;min-width:170px;margin:2px 0 14px;padding:10px 18px 12px;border:1px solid #D5D9DD;background:#FFFFFF;"><div style="font-size:14.5px;font-weight:700;">목차</div><div style="margin-top:7px;font-size:13px;line-height:2;color:#0275D8;">1. 개요<br>2. 기록 내용</div></div><div style="clear:both;height:0;overflow:hidden;"></div><h2 style="margin:8px 0 11px;padding:0 0 6px;border-bottom:1px solid #D5D9DD;font-size:21px;font-weight:600;line-height:1.45;">1. 개요&nbsp;<span style="font-size:11.5px;font-weight:400;color:#0275D8;">[편집]</span></h2><p style="margin:9px 0;font-size:14.5px;line-height:1.85;"><strong>${wikiSource}</strong>가 저장한 OOC 기록을 정리한 문서이다.</p><div style="display:flex;gap:10px;align-items:flex-start;margin:12px 0 18px;padding:10px 13px;background:#F4F6F7;border:1px solid #E1E5E8;border-left:4px solid #00A495;border-radius:4px;font-size:12.5px;line-height:1.7;color:#6E7880;"><span style="flex:none;color:#00A495;font-weight:800;">ⓘ</span><span>이 문서는 보관된 카드의 제목·본문·분류 정보를 바탕으로 구성됩니다.</span></div><h2 style="margin:18px 0 11px;padding:0 0 6px;border-bottom:1px solid #D5D9DD;font-size:21px;font-weight:600;line-height:1.45;">2. 기록 내용&nbsp;<span style="font-size:11.5px;font-weight:400;color:#0275D8;">[편집]</span></h2>${richBody('font-size:14.5px;line-height:1.85;color:#212529;')}<div style="clear:both;"></div></div><footer style="padding:11px 22px 13px;border-top:1px solid #E7EAEC;background:#FAFBFB;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px;color:#86909A;"><tbody><tr><td style="padding:0;text-align:left;">문서 출처 : ${wikiSource}</td><td style="padding:0;text-align:right;white-space:nowrap;font-family:${mono};letter-spacing:.11em;">CRACK ARCHIVE WIKI · ${wikiRef}</td></tr></tbody></table><div style="margin-top:8px;text-align:center;font-size:10.5px;color:#9AA2AB;">이 문서는 Crack Archive에서 내보낸 개인 기록 문서입니다.</div></footer></article></section>`;
    }

    if (layoutKey === 'messenger') {
      const maxWidth = width(560);
      const timeOnly = ctx.showDate ? ctx.dateTimeText.split(' ').pop() : '';
      return `<section class="coa-ooc-export" data-coa-ooc-layout="messenger" style="width:100%;max-width:${maxWidth}px;margin:0 auto;background:#B2C7D9;color:#1F1F1F;font-family:${sans};box-sizing:border-box;border:1px solid #9DB4C7;border-radius:10px;overflow:hidden;box-shadow:0 6px 18px rgba(55,78,96,.13);"><header style="display:flex;align-items:center;gap:10px;padding:14px 17px 12px;color:#3C5468;"><span style="flex:none;font-size:21px;line-height:1;">‹</span><span style="min-width:0;font-size:15.5px;font-weight:800;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">OOC ARCHIVE</span><span style="flex:none;font-size:11.5px;color:#5B7284;">2</span><span style="margin-left:auto;flex:none;font-size:17px;line-height:1;letter-spacing:2px;">≡</span></header>${ctx.showDate ? `<div style="padding:2px 0 13px;text-align:center;"><span style="display:inline-block;padding:4px 13px;background:rgba(80,104,124,.3);border-radius:999px;font-size:10.5px;color:#FFFFFF;">${ctx.dateText}</span></div>` : ''}<div style="display:flex;gap:9px;align-items:flex-start;padding:0 15px 1px;"><span style="display:inline-flex;flex:none;width:40px;height:40px;border-radius:16px;background:linear-gradient(135deg,#7B92A6,#5C7488);color:#FFFFFF;font-family:${mono};font-size:13px;font-weight:700;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(40,60,75,.16);">OC</span><div style="min-width:0;flex:1;"><div style="margin:1px 0 5px;font-size:12px;color:#4A6070;">기록자</div><div style="display:flex;align-items:flex-end;gap:6px;"><article style="min-width:0;flex:1;background:#FFFFFF;border-radius:4px 16px 16px 16px;padding:12px 15px;box-shadow:0 1px 2px rgba(40,60,75,.14);"><h1 style="margin:0 0 7px;font-size:15px;font-weight:800;line-height:1.5;color:#1F1F1F;overflow-wrap:break-word;word-break:keep-all;">${ctx.title}</h1>${richBody('font-size:13.8px;line-height:1.8;color:#1F1F1F;')}${ctx.tags ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid #EEF1F3;font-size:12px;line-height:1.65;color:#4A6E8C;">${ctx.tags}</div>` : ''}</article>${ctx.showDate ? `<span style="flex:none;padding-bottom:1px;font-size:10px;line-height:1.55;color:#5B7284;white-space:nowrap;"><span style="display:block;color:#D2AA00;font-weight:800;">1</span>${timeOnly}</span>` : '<span style="flex:none;padding-bottom:1px;font-size:10px;color:#D2AA00;font-weight:800;">1</span>'}</div></div></div><div style="display:flex;align-items:center;gap:10px;margin-top:17px;padding:10px 13px;background:#FFFFFF;border-top:1px solid rgba(92,116,136,.12);"><span style="flex:none;font-size:18px;color:#8A99A6;">＋</span><span style="flex:1;padding:8px 13px;background:#F2F4F6;border-radius:999px;font-size:12.5px;color:#9AA8B3;">메시지 입력</span><span style="flex:none;display:inline-flex;width:31px;height:31px;border-radius:50%;background:#F7E600;color:#3A2E00;font-size:13px;align-items:center;justify-content:center;font-weight:800;">#</span></div></section>`;
    }


    if (layoutKey === 'livechat') {
      const maxWidth = width(440);
      const liveCaption = ['LIVE CHAT LOG', ctx.showReference ? ctx.ref : '', ctx.showDate ? ctx.dateText : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="livechat" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:18px 12px;background:#0A0A0B;color:#DFE2E6;font-family:${sans};box-sizing:border-box;"><article style="background:#141517;border:1px solid #2E3033;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.28);"><header style="display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid #26282C;"><span style="flex:none;font-size:14px;color:#848890;">|→</span><span style="flex:1;text-align:center;font-size:14.5px;font-weight:800;color:#EDEFF2;">채팅</span><span style="flex:none;font-size:14px;letter-spacing:2px;color:#848890;">≡</span></header><div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:#1A1B1E;border-bottom:1px solid #26282C;font-size:11px;white-space:nowrap;overflow:hidden;"><span style="flex:none;color:#FFCE3D;font-weight:800;">🧀 TOP 165,000</span><span style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#C9CDD3;">${ctx.sourceTitle}</span><span style="flex:none;color:#848890;">시청 1</span></div><div style="margin:12px 12px 0;padding:10px 12px;background:#1E2023;border:1px solid #35373B;border-radius:8px;"><div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:#00FFA3;">📌 고정된 기록</div><div style="margin-top:5px;font-size:14.5px;font-weight:800;line-height:1.5;color:#EDEFF2;overflow-wrap:break-word;word-break:keep-all;">${ctx.title}</div>${ctx.showDate ? `<div style="margin-top:5px;font-size:10.5px;color:#848890;">${ctx.dateTimeText}</div>` : ''}</div><div style="padding:12px 14px 3px;font-size:12.5px;line-height:1.55;"><div style="margin:0 0 7px;"><strong style="color:#61B9F2;">새벽두시반</strong>&nbsp;<span>드디어 올라옴</span></div><div style="margin:0 0 10px;"><span>💜</span> <strong style="color:#C69BF8;">복선수집가</strong>&nbsp;<span>정독 중</span></div><article style="margin:0 0 10px;padding:11px 12px;background:#1A1B1E;border:1px solid #2E3033;border-radius:8px;"><div style="font-size:12.5px;"><span style="display:inline-block;margin-right:5px;padding:1px 6px;background:#00FFA3;color:#0A0A0B;border-radius:4px;font-size:9px;font-weight:800;vertical-align:1px;">기록자</span><strong style="color:#00FFA3;">archive_ooc</strong></div><div style="margin-top:7px;">${richBody('font-size:13px;line-height:1.85;color:#DFE2E6;')}</div>${ctx.tags ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid #2E3033;font-size:11.5px;line-height:1.7;color:#00FFA3;">${ctx.tags}</div>` : ''}</article><div style="margin:0 0 9px;padding:9px 12px;background:#2A2410;border:1px solid #4A3F14;border-radius:8px;font-size:11.5px;color:#F2E2A0;">🧀 <strong style="color:#FFCE3D;">ㅇㅇ</strong>님이 치즈 <strong style="color:#FFCE3D;">1,000개</strong>를 후원하며 이 기록을 응원했습니다!</div><div style="margin:0 0 7px;"><span>💜</span> <strong style="color:#4ED6B1;">감상러버</strong>&nbsp;<span>이건 저장해야지</span></div><div style="margin:0 0 3px;"><strong style="color:#F09EC1;">마감의노예</strong>&nbsp;<span>다음 기록도 기대됨</span></div></div><div style="padding:9px 14px 0;"><div style="display:flex;align-items:center;gap:9px;padding:8px 12px;background:#26282C;border-radius:999px;"><span style="flex:none;display:inline-flex;width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#3D4046,#26282C);border:1px solid #35373B;align-items:center;justify-content:center;font-size:11px;">🙂</span><span style="flex:1;font-size:12px;color:#848890;">채팅을 입력해주세요</span><span style="flex:none;font-size:13px;">😊</span></div></div><footer style="display:flex;align-items:center;gap:10px;padding:10px 14px 13px;"><span style="flex:none;font-size:12px;font-weight:800;color:#FFCE3D;">🧀 후원하기</span><span style="flex:none;display:inline-flex;width:20px;height:20px;border:1px solid #35373B;border-radius:50%;align-items:center;justify-content:center;font-size:10px;color:#848890;">$</span><span style="margin-left:auto;flex:none;padding:7px 15px;background:#00FFA3;color:#0A0A0B;border-radius:8px;font-size:12px;font-weight:800;">채팅</span></footer></article>${liveCaption ? `<div style="margin-top:11px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.2em;color:#5E6470;">${liveCaption}</div>` : ''}</section>`;
    }


    if (layoutKey === 'riftchat') {
      const maxWidth = width(500);
      const gameTime = ctx.showDate ? ctx.dateTimeText.split(' ').slice(-2).join(' ') : '21:41';
      const riftCaption = ['RIFT CHAT LOG', ctx.showReference ? ctx.ref : '', ctx.showDate ? ctx.dateText : ''].filter(Boolean).join(' · ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="riftchat" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:18px 14px;background:#0E1114;color:#D8CFA8;font-family:Dotum,'돋움','Malgun Gothic',sans-serif;box-sizing:border-box;"><article style="background:#15181B;border:1px solid #2A2D31;border-radius:4px;overflow:hidden;box-shadow:0 5px 18px rgba(0,0,0,.3);"><header style="display:flex;align-items:center;gap:9px;padding:9px 13px;border-bottom:1px solid #2A2D31;background:#111417;"><span style="font-size:10px;color:#C8AA6E;">◆</span><span style="font-size:12px;font-weight:800;color:#E5D6A0;">협곡 채팅</span><span style="margin-left:auto;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:#8A937F;">${ctx.sourceTitle}</span></header><div style="padding:11px 13px 6px;font-size:12px;line-height:1.78;color:#C9BE8F;"><div>[${gameTime}] <span style="color:#8A937F;">[전체]</span> <strong style="color:#E5D6A0;">관전자 (정찰자)</strong>: 새 기록 확인 중</div><div style="color:#6EC8E8;">[${gameTime}] 복선수집가님이 기록 위치를 표시했습니다.</div><div style="margin:7px 0;color:#E8543F;font-weight:800;overflow-wrap:break-word;word-break:keep-all;">[${gameTime}] 기록자 (아카이브) 님이 목표를 완료했습니다 — 『${ctx.title}』</div><div>[${gameTime}] <span style="color:#8A937F;">[전체]</span> <strong style="color:#E5D6A0;">기록자 (아카이브)</strong>:</div><article style="margin:5px 0 8px;padding:10px 11px;background:#1B1E22;border:1px solid #3C3623;border-radius:4px;">${richBody('font-size:12.5px;line-height:1.82;color:#D8CFA8;')}${ctx.tags ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid #3C3623;font-size:11px;line-height:1.7;color:#C8AA6E;">${ctx.tags}</div>` : ''}</article><div style="color:#F0B254;font-weight:800;">[${gameTime}] 기록 카드가 보관되었습니다. (보상: 검색 가능 상태)</div><div style="margin-top:2px;color:#6EC8E8;">[${gameTime}] 다음 회차로 이동할 준비가 완료되었습니다.</div></div><footer style="padding:6px 13px 12px;"><div style="font-size:10.5px;line-height:1.7;color:#8A8468;">/help · 제목과 태그를 활용하면 기록을 빠르게 다시 찾을 수 있습니다.</div><div style="display:flex;align-items:center;gap:8px;margin-top:7px;padding:7px 10px;background:#1E2124;border:1px solid #3A3E44;border-radius:3px;"><span style="flex:none;font-size:10px;color:#8A937F;">▼</span><span style="flex:none;font-size:11.5px;color:#C9BE8F;">[전체]</span><span style="flex:1;font-size:11.5px;color:#5A5F52;">메시지를 입력하세요</span></div></footer></article>${riftCaption ? `<div style="margin-top:10px;text-align:center;font-family:${mono};font-size:9.5px;letter-spacing:.2em;color:#5E6470;">${riftCaption}</div>` : ''}</section>`;
    }

    if (layoutKey === 'diary') {
      const maxWidth = width(700);
      const diaryMeta = [
        ctx.showDate ? ctx.dateTimeText : '',
        ctx.showReference ? ctx.ref : '',
      ].filter(Boolean).join(' / ');
      return `<section class="coa-ooc-export" data-coa-ooc-layout="diary" style="width:100%;max-width:${maxWidth}px;margin:0 auto;padding:24px 18px;background:#EDF0F3;color:#20252A;font-family:${sans};box-sizing:border-box;"><article style="background:#FFFFFF;border:1px solid #CED4DA;border-left:5px solid #536C7C;box-shadow:0 7px 22px rgba(35,45,55,.08);"><header style="padding:22px 24px 19px;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td width="92" style="width:92px;padding:0 20px 0 0;border-right:1px solid #DCE1E5;vertical-align:top;"><div style="font-family:${mono};font-size:9px;font-weight:700;letter-spacing:.22em;color:#7A858E;">ENTRY</div><div style="margin-top:5px;font-family:${mono};font-size:31px;font-weight:700;line-height:1;color:#536C7C;">20</div><div style="margin-top:8px;font-family:${mono};font-size:8.5px;letter-spacing:.16em;color:#A0A8AF;">DIARY</div></td><td style="padding:0 0 0 20px;vertical-align:top;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:${mono};font-size:9.5px;letter-spacing:.16em;color:#7A858E;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ctx.sourceTitle}</div><h1 style="margin:9px 0 0;font-size:25px;font-weight:800;line-height:1.35;letter-spacing:-.015em;color:#20252A;">${ctx.title}</h1>${diaryMeta ? `<div style="margin-top:11px;font-family:${mono};font-size:9.5px;letter-spacing:.07em;color:#7A858E;">${diaryMeta}</div>` : ''}</td></tr></tbody></table></header><div style="border-top:1px solid #E3E7EA;padding:22px 24px 25px;">${richBody('font-size:14.5px;line-height:1.95;color:#20252A;')}</div>${ctx.tags || ctx.showReference ? `<footer style="display:flex;align-items:flex-start;gap:18px;padding:13px 24px 15px;border-top:1px solid #E3E7EA;background:#F8F9FA;font-size:11px;line-height:1.65;color:#7A858E;">${ctx.tags ? `<div style="min-width:0;flex:1;color:#536C7C;">${ctx.tags}</div>` : '<div style="flex:1;"></div>'}${ctx.showReference ? `<div style="flex:none;font-family:${mono};font-size:9.5px;letter-spacing:.1em;white-space:nowrap;">PRIVATE ENTRY · ${ctx.ref}</div>` : ''}</footer>` : ''}</article></section>`;
    }

    // normalizeOOCHTMLLayout가 항상 지원 테마로 정규화하므로 여기에는 도달하지 않는다.
    return renderOOCHTMLTheme(card, { ...options, layout: 'specsheet' });
  }

  function renderLogHTMLTheme(card, options = {}) {
    const normalized = prepareCardForGeneralVisibleRender(card);
    const layoutKey = normalizeLogHTMLLayout(options.layout || normalized.view?.htmlLayout);
    const colorKey = normalizeLogHTMLColor(options.color || options.theme || normalized.view?.htmlColor || normalized.view?.htmlTheme, layoutKey);
    const palette = getLogHTMLPalette(layoutKey, colorKey);
    const meta = getExportMetaOptions(options);
    const fontKey = normalizeCOAFont(options.font || normalized.view?.fontFamily);
    const fontFamily = getCOAFontFamily(fontKey);
    const maxWidth = Math.max(360, Math.min(900, Number(options.maxWidth) || 820));
    const parsedBlocks = parseDCRPLogBlocks(normalized, { excludeCodeBlocks: options.excludeCodeBlocks === true, excludeComments: false });
    const blocks = parsedBlocks.length ? parsedBlocks : [{ type: 'ai', raw: normalized.body || '', text: normalized.body || '' }];
    if (layoutKey === 'specsheet') return renderSpecSheetLogHTML(normalized, blocks, { ...options, layout: layoutKey, color: colorKey });
    if (layoutKey === 'airmail') return renderAirmailLogHTML(normalized, blocks, options);

    const title = escapeHTML(stripSmartMarkdown(normalized.title || '기록').trim() || '기록');
    const rawTagText = getDCRPLogTagText(normalized);
    const tagText = rawTagText === '크랙 · 로그' ? '' : escapeHTML(rawTagText);
    const bodyLength = toStringValue(normalized.body || '').length;
    const chapterNo = toLogHanjaNumber(1 + (bodyLength % 12));
    const pageNo = 1 + (bodyLength % 320);

    const turnData = blocks.map((block) => {
      const isUser = block.type === 'user';
      return {
        isUser,
        role: isUser ? 'USER' : 'AI',
        accent: isUser ? palette.dialogue : palette.accent,
        body: renderSimpleLogContentHTML(block.raw || block.text || '', {
          excludeImages: false,
          excludeCodeBlocks: options.excludeCodeBlocks === true,
          excludeComments: true,
          palette,
          color: colorKey,
        }),
      };
    });

    const commonRoot = `width:100%;max-width:${maxWidth}px;margin:0 auto;box-sizing:border-box;overflow:hidden;background:${palette.bg};color:${palette.text};font-family:${fontFamily};font-size:15px;line-height:1.95;letter-spacing:.01em;word-break:keep-all;`;
    const tagLine = meta.showTags && tagText ? `<div style="margin-top:10px;font-size:12px;line-height:1.7;color:${palette.accent};">${tagText}</div>` : '';
    let html = '';

    if (layoutKey === 'crosslog') {
      const turns = turnData.map((turn) => {
        const bg = turn.isUser ? palette.userBg : palette.aiBg;
        const side = turn.isUser ? 'right' : 'left';
        const align = turn.isUser ? 'right' : 'left';
        return `<article style="width:100%;margin:0 0 16px;padding:16px 18px;box-sizing:border-box;background:${bg};color:${palette.text};border-${side}:4px solid ${turn.accent};"><div style="margin:0 0 10px;text-align:${align};font-size:11px;font-weight:900;letter-spacing:.08em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></article>`;
      }).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:34px 28px 24px;text-align:center;border-bottom:1px solid ${palette.line};"><div style="font-size:11px;letter-spacing:.28em;color:${palette.accent};">ROLEPLAY LOG</div><h1 style="margin:12px 0 0;font-size:29px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:22px 24px 28px;">${turns}</div></section>`;
    } else if (layoutKey === 'baekjimeok') {
      const turns = turnData.map((turn, index) => `<section style="padding:0 2px ${index === turnData.length - 1 ? '0' : '22px'};margin:0 0 ${index === turnData.length - 1 ? '0' : '22px'};${index === turnData.length - 1 ? '' : `border-bottom:1px solid ${palette.line};`}"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-size:11px;font-weight:800;letter-spacing:.18em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border-top:4px double ${palette.line};border-bottom:4px double ${palette.line};"><header style="padding:43px 30px 26px;text-align:center;"><div style="font-size:11px;letter-spacing:.46em;color:${palette.accent};">BOOK LOG</div><h1 style="margin:15px 0 0;font-size:28px;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}<div style="margin-top:22px;color:${palette.accent};font-size:12px;">◆</div></header><div style="padding:8px 34px 34px;">${turns}<div style="margin-top:38px;text-align:center;font-size:11px;letter-spacing:.28em;color:${palette.accent};">— ${pageNo} —</div></div></section>`;
    } else if (layoutKey === 'simya') {
      const turns = turnData.map((turn) => `<section style="width:92%;margin:0 ${turn.isUser ? '0 24px' : '24px 0'} 28px;padding:${turn.isUser ? '0 15px 0 0' : '0 0 0 15px'};box-sizing:border-box;border-${turn.isUser ? 'right' : 'left'}:2px solid ${turn.accent};"><div style="margin:0 0 8px;text-align:${turn.isUser ? 'right' : 'left'};font-size:11px;font-weight:900;letter-spacing:.2em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border-left:8px solid ${palette.accent};border-right:1px solid ${palette.line};"><header style="padding:40px 34px 26px;border-bottom:1px solid ${palette.line};"><div style="font-size:11px;letter-spacing:.42em;color:${palette.accent};">MIDNIGHT RECORD</div><h1 style="margin:14px 0 0;font-size:30px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:28px 32px 24px;">${turns}<div style="padding-top:16px;border-top:1px solid ${palette.line};text-align:right;font-size:11px;letter-spacing:.3em;color:${palette.accent};">FIN</div></div></section>`;
    } else if (layoutKey === 'yeonji') {
      const turns = turnData.map((turn, index) => `<section style="margin:0;padding:0 4px;"><div style="margin:0 0 8px;text-align:${turn.isUser ? 'right' : 'left'};font-size:11px;font-weight:900;letter-spacing:.16em;color:${turn.accent};">〔${turn.role}〕</div><div>${turn.body}</div></section>${index < turnData.length - 1 ? `<div style="margin:27px 0;text-align:center;color:${palette.line};font-size:12px;letter-spacing:.6em;">❀</div>` : ''}`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:44px 30px 25px;text-align:center;"><div style="font-size:11px;letter-spacing:.48em;color:${palette.accent};">第 ${chapterNo} 章</div><h1 style="margin:16px 0 0;font-size:29px;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}<div style="margin-top:22px;color:${palette.accent};font-size:14px;">❀</div></header><div style="padding:10px 35px 38px;">${turns}<div style="margin-top:38px;text-align:center;color:${palette.accent};font-size:13px;">❀ 終 ❀</div></div></section>`;
    } else if (layoutKey === 'cheongram') {
      const turns = turnData.map((turn, index) => `<section style="padding:0 0 20px;margin:0 0 20px;${index === turnData.length - 1 ? '' : `border-bottom:1px solid ${palette.line};`}"><span style="display:inline-block;margin:0 0 11px;padding:4px 10px;border:1px solid ${turn.accent};color:${turn.accent};font-size:10px;font-weight:900;letter-spacing:.14em;">${turn.role}</span><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:26px 28px 23px;border-bottom:2px solid ${palette.accent};"><div style="display:flex;align-items:flex-start;gap:15px;"><span style="display:inline-block;padding:7px 10px;background:${palette.accent};color:${palette.bg};font-size:10px;font-weight:900;letter-spacing:.14em;">LOG</span><div style="min-width:0;flex:1;"><h1 style="margin:0;font-size:28px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</div><span style="font-size:11px;color:${palette.accent};">NO.${String(pageNo).padStart(3,'0')}</span></div></header><div style="padding:28px 30px 30px;">${turns}<div style="padding-top:14px;border-top:1px solid ${palette.line};text-align:right;font-size:10px;letter-spacing:.24em;color:${palette.accent};">END OF RECORD</div></div></section>`;
    } else if (layoutKey === 'wongo') {
      const turns = turnData.map((turn) => `<section style="padding:0 0 20px;margin:0 0 20px;"><div style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:.18em;color:${turn.accent};">${turn.isUser ? '→' : '✎'} ${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border-top:2px dashed ${palette.line};border-bottom:2px dashed ${palette.line};"><header style="padding:34px 32px 22px;border-bottom:1px dashed ${palette.line};"><div style="font-size:11px;letter-spacing:.34em;color:${palette.accent};">✎ MANUSCRIPT</div><h1 style="margin:13px 0 0;font-size:28px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:27px 32px 28px;">${turns}<div style="padding-top:15px;border-top:1px dashed ${palette.line};text-align:right;font-size:11px;letter-spacing:.25em;color:${palette.accent};">校了</div></div></section>`;
    } else if (layoutKey === 'silentfilm') {
      const turns = turnData.map((turn) => `<section style="margin:0 0 22px;padding:18px 20px;border:1px solid ${palette.line};"><div style="margin:0 0 12px;text-align:center;font-size:10px;font-weight:900;letter-spacing:.3em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}padding:12px;border:1px solid ${palette.line};"><div style="border:1px solid ${palette.line};"><header style="padding:38px 28px 24px;text-align:center;"><div style="font-size:11px;letter-spacing:.5em;color:${palette.accent};">SILENT PICTURE</div><div style="margin-top:18px;color:${palette.line};font-size:11px;letter-spacing:.35em;">·—·—·</div><h1 style="margin:18px 0 0;font-size:29px;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:12px 28px 31px;">${turns}<div style="text-align:center;color:${palette.line};font-size:12px;letter-spacing:.7em;">◦◦◦</div></div></div></section>`;
    } else if (layoutKey === 'tajeon') {
      const turns = turnData.map((turn) => `<section style="padding:0 0 18px;margin:0 0 18px;"><span style="display:inline-block;margin:0 0 10px;padding:3px 9px;border:1px dashed ${palette.line};color:${turn.accent};font-size:10px;font-weight:900;letter-spacing:.15em;">${turn.role}</span><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:2px dashed ${palette.line};"><header style="padding:30px 30px 22px;border-bottom:1px dashed ${palette.line};"><span style="display:inline-block;padding:5px 10px;border:1px dashed ${palette.line};color:${palette.accent};font-size:10px;font-weight:900;letter-spacing:.17em;">TRANSMISSION</span><h1 style="margin:15px 0 0;font-size:27px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:26px 30px 27px;">${turns}<div style="padding-top:13px;border-top:1px dashed ${palette.line};font-size:11px;font-weight:900;letter-spacing:.35em;color:${palette.accent};">=== STOP ===</div></div></section>`;
    } else if (layoutKey === 'seongjwa') {
      const turns = turnData.map((turn, index) => `<section style="margin:0;padding:0 3px;"><div style="margin:0 0 8px;text-align:${turn.isUser ? 'right' : 'left'};font-size:11px;font-weight:900;letter-spacing:.18em;color:${turn.accent};">✦ ${turn.role}</div><div>${turn.body}</div></section>${index < turnData.length - 1 ? `<div style="margin:27px 0;text-align:center;color:${palette.line};font-size:11px;letter-spacing:.12em;">✦───✧───✦</div>` : ''}`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}"><header style="padding:42px 30px 25px;text-align:center;"><div style="font-size:14px;letter-spacing:.35em;color:${palette.accent};">˚✦˚</div><div style="margin-top:15px;font-size:10px;letter-spacing:.48em;color:${palette.accent};">CONSTELLATION LOG</div><h1 style="margin:15px 0 0;font-size:29px;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:13px 35px 38px;">${turns}<div style="margin-top:38px;text-align:center;color:${palette.accent};font-size:13px;letter-spacing:.4em;">✦ ✦ ✦</div></div></section>`;
    } else if (layoutKey === 'gwedo') {
      const turns = turnData.map((turn, index) => `<section style="margin:0 0 ${index === turnData.length - 1 ? '0' : '36px'};"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;font-weight:700;letter-spacing:.3em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      const orbitRule = renderLogDiamondRule(palette.accent, palette.line, 210, '◆');
      const orbitEnd = renderLogDiamondRule(palette.accent, palette.line, 118, '◆');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:47px 34px 32px;text-align:center;"><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9px;font-weight:600;letter-spacing:.42em;color:${palette.accent};">ORBITAL LOG</div><div style="margin-top:17px;">${orbitRule}</div><h1 style="margin:20px 0 0;font-size:28px;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:10px 48px 43px;">${turns}<footer style="margin-top:43px;text-align:center;">${orbitEnd}</footer></div></section>`;
    } else if (layoutKey === 'heugyo') {
      const turns = turnData.map((turn, index) => `<section style="margin:0 0 ${index === turnData.length - 1 ? '0' : '34px'};"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;font-weight:700;letter-spacing:.28em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:46px 42px 30px;border-bottom:1px solid ${palette.line};">${renderHeugyoMarkSVG(palette.title, palette.bg, 58)}<h1 style="margin:22px 0 0;font-size:30px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:34px 42px 42px;">${turns}<footer style="margin-top:42px;text-align:right;">${renderLogDiamondRule(palette.dialogue, palette.line, 92, '◆')}</footer></div></section>`;
    } else if (layoutKey === 'cheongin') {
      const turns = turnData.map((turn, index) => `<section style="margin:0 0 ${index === turnData.length - 1 ? '0' : '34px'};"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;font-weight:700;letter-spacing:.26em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};border-top:5px solid ${palette.accent};"><header style="padding:48px 34px 34px;text-align:center;">${renderCheonginGlyphMark(palette.accent, palette.line)}<h1 style="margin:20px 0 0;font-size:27px;font-weight:800;line-height:1.45;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:8px 46px 44px;">${turns}<footer style="margin-top:42px;text-align:center;">${renderCheonginGlyphMark(palette.accent, palette.line, true)}</footer></div></section>`;
    } else if (layoutKey === 'yeobaek') {
      const turns = turnData.map((turn, index) => `<section style="margin:0 0 ${index === turnData.length - 1 ? '0' : '38px'};"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;font-weight:700;letter-spacing:.32em;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:56px 50px 40px;"><div style="font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9px;letter-spacing:.42em;color:${palette.accent};">LOG</div><h1 style="margin:18px 0 0;font-size:31px;letter-spacing:-.015em;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:0 50px 50px;">${turns}<footer style="margin-top:48px;"><div style="width:44px;margin:0 auto;border-top:1px solid ${palette.line};"></div></footer></div></section>`;
    } else if (layoutKey === 'muji') {
      const turns = turnData.map((turn, index) => `<section style="display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;align-items:start;margin:0 0 ${index === turnData.length - 1 ? '0' : '32px'};"><div style="padding-top:5px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10px;font-weight:700;letter-spacing:.2em;color:${turn.accent};white-space:nowrap;">${turn.role}&nbsp;·</div><div style="min-width:0;">${turn.body}</div></section>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border:1px solid ${palette.line};"><header style="padding:54px 40px 40px;text-align:center;"><h1 style="margin:0;font-size:24px;line-height:1.5;color:${palette.title};">${title}</h1>${tagLine}</header><div style="padding:0 52px 50px;">${turns}<footer style="margin-top:44px;text-align:center;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:9.5px;letter-spacing:.3em;color:${palette.accent};">끝</footer></div></section>`;
    } else {
      const turns = turnData.map((turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 22px;"><tbody><tr><td width="78" align="right" style="width:78px;padding:3px 14px 0 0;vertical-align:top;text-align:right;white-space:nowrap;font-size:10px;font-weight:900;letter-spacing:.16em;color:${turn.accent};">${turn.role}</td><td style="padding:0 0 0 14px;border-left:1px solid ${palette.line};vertical-align:top;">${turn.body}</td></tr></tbody></table>`).join('');
      html = `<section class="coa-html-log" style="${commonRoot}border-top:3px solid ${palette.accent};border-bottom:3px solid ${palette.accent};"><header style="padding:39px 30px 24px;text-align:center;"><div style="font-size:11px;letter-spacing:.48em;color:${palette.accent};">ACT Ⅱ</div><h1 style="margin:15px 0 0;font-size:30px;line-height:1.4;color:${palette.title};">${title}</h1>${tagLine}<div style="margin-top:20px;color:${palette.line};font-size:12px;">─❖─</div></header><div style="padding:10px 34px 33px 32px;">${turns}<div style="margin-top:34px;padding-top:15px;border-top:1px solid ${palette.line};text-align:center;font-size:11px;letter-spacing:.34em;color:${palette.accent};">CURTAIN</div></div></section>`;
    }

    return html.replace('<section class="coa-html-log"', `<section class="coa-html-log" data-coa-log-layout="${escapeHTML(layoutKey)}" data-coa-log-color="${escapeHTML(colorKey)}"`);
  }

  const EXPORT_FONT_SIZE_PT_MIN = -4;
  const EXPORT_FONT_SIZE_PT_MAX = 6;
  const EXPORT_FONT_SIZE_PT_DEFAULT = 0;

  function normalizeExportFontSizePt(value) {
    const number = Math.round(Number(value) || 0);
    return Math.max(EXPORT_FONT_SIZE_PT_MIN, Math.min(EXPORT_FONT_SIZE_PT_MAX, number));
  }

  function getExportFontSizeScale(value) {
    const deltaPt = normalizeExportFontSizePt(value);
    // 일반 본문 12pt를 기준으로 비율을 계산해 제목·본문·라벨의 서열을 보존한다.
    return Math.max(0.6, (12 + deltaPt) / 12);
  }

  function scaleExportFontSizeValue(value, factor) {
    const source = toStringValue(value);
    if (!source || factor === 1) return source;
    // em/%/vw는 부모 크기나 반응형 폭을 따르므로 그대로 두고 절대 단위만 비례 조정한다.
    return source.replace(/(-?\d*\.?\d+)(px|pt|rem)\b/gi, (match, amount, unit) => {
      const number = Number(amount);
      if (!Number.isFinite(number)) return match;
      const scaled = Math.max(0.1, number * factor);
      const rounded = Math.round(scaled * 1000) / 1000;
      return `${rounded}${unit}`;
    });
  }

  function applyExportFontSizeScaleHTML(html, value) {
    const deltaPt = normalizeExportFontSizePt(value);
    if (!deltaPt) return toStringValue(html);
    const factor = getExportFontSizeScale(deltaPt);
    const template = document.createElement('template');
    template.innerHTML = toStringValue(html);

    template.content.querySelectorAll('[style]').forEach((element) => {
      const current = element.style.fontSize;
      if (current) element.style.fontSize = scaleExportFontSizeValue(current, factor);
    });

    // OOC 본문 일부는 공용 CSS의 15px을 사용하므로 인라인 값이 없는 루트만 명시적으로 보강한다.
    template.content.querySelectorAll('.coa-ooc-rich-body').forEach((element) => {
      if (!element.style.fontSize) element.style.fontSize = `${Math.round(15 * factor * 1000) / 1000}px`;
    });
    // 코드블록은 공용 CSS의 절대 크기를 사용하므로 테마별 기본값을 유지한 채 함께 조절한다.
    template.content.querySelectorAll('.coa-ooc-rich-body pre').forEach((element) => {
      if (element.style.fontSize) return;
      const receipt = Boolean(element.closest('[data-coa-ooc-layout="receipt"]'));
      const base = receipt ? 11 : 13;
      element.style.fontSize = `${Math.round(base * factor * 1000) / 1000}px`;
    });

    return template.innerHTML;
  }

  // DC HTML도 제목·본문·라벨의 상대적 크기 서열을 유지한 채 같은 pt 증감 규칙을 사용한다.
  // 완성된 DC HTML의 style 속성만 조정하므로 카드 원문과 일반 HTML/PNG 설정에는 영향을 주지 않는다.
  function applyDCFontSizeScaleHTML(html, value) {
    const deltaPt = normalizeExportFontSizePt(value);
    if (!deltaPt) return toStringValue(html);
    const factor = getExportFontSizeScale(deltaPt);
    const template = document.createElement('template');
    template.innerHTML = toStringValue(html);
    const root = template.content.firstElementChild;
    if (!root) return toStringValue(html);

    const styled = [root, ...template.content.querySelectorAll('[style]')];
    const seen = new Set();
    styled.forEach((element) => {
      if (!element || seen.has(element)) return;
      seen.add(element);
      const current = element.style.fontSize;
      if (current) element.style.fontSize = scaleExportFontSizeValue(current, factor);
    });

    // 본문 중 명시 크기가 없는 요소는 바깥 루트의 기본 크기를 상속받게 한다.
    if (!root.style.fontSize) root.style.fontSize = `${Math.round(14 * factor * 1000) / 1000}px`;
    return template.innerHTML;
  }

  function renderExportHTML(card, options = {}) {
    const normalized = normalizeCard(card);
    const baseHTML = normalized.archiveType === 'log'
      ? renderLogHTMLTheme(normalized, options)
      : renderOOCHTMLTheme(normalized, {
          ...options,
          layout: normalizeOOCHTMLLayout(options.layout || normalized.view?.htmlLayout),
        });
    const titleAdjustedHTML = applyExportTitleVisibilityHTML(baseHTML, normalized, options);
    return applyExportFontSizeScaleHTML(titleAdjustedHTML, options.fontSizePt);
  }

  function renderPNGHTML(card, options = {}) {
    const normalized = normalizeCard(card);
    const content = renderExportHTML(normalized, {
      layout: options.layout || normalized.view?.htmlLayout,
      color: options.color || options.theme || normalized.view?.htmlColor || normalized.view?.htmlTheme,
      font: options.font || normalized.view?.fontFamily,
      fontSizePt: options.fontSizePt,
      showTitle: options.showTitle,
      showTags: options.showTags,
      showDate: options.showDate,
      showReference: options.showReference,
      excludeCodeBlocks: options.excludeCodeBlocks === true,
      maxWidth: COA_EXPORT_MAX_WIDTH,
    });
    return `<div class="coa-png-shell">${content}</div>`;
  }

  function blobToPNGDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(toStringValue(reader.result));
      reader.onerror = () => reject(reader.error || new Error('이미지 변환 실패'));
      reader.readAsDataURL(blob);
    });
  }

  async function normalizePNGImageBlob(blob) {
    if (!(blob instanceof Blob) || blob.size < 1) return null;
    const declared = toStringValue(blob.type).toLocaleLowerCase();
    if (/^image\//.test(declared)) return blob;
    try {
      const bytes = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
      let type = '';
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) type = 'image/png';
      else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'image/jpeg';
      else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) type = 'image/gif';
      else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) type = 'image/webp';
      else if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        const brand = String.fromCharCode(...bytes.slice(8, 16));
        if (/avif|avis/i.test(brand)) type = 'image/avif';
      }
      return type ? new Blob([blob], { type }) : null;
    } catch (_) {
      return null;
    }
  }

  function gmFetchPNGResourceBlob(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('GM_xmlhttpRequest unavailable'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        anonymous: true,
        timeout: 20000,
        onload: (response) => {
          const raw = response?.response;
          const blob = raw instanceof Blob ? raw : raw instanceof ArrayBuffer ? new Blob([raw]) : null;
          if (response?.status >= 200 && response.status < 400 && blob) resolve(blob);
          else reject(new Error(`GM resource request failed: ${response?.status || 0}`));
        },
        onerror: () => reject(new Error('GM resource request error')),
        ontimeout: () => reject(new Error('GM resource request timeout')),
      });
    });
  }

  const PNG_RESOURCE_CACHE_LIMIT = 24;
  const PNG_RESOURCE_CACHE_MAX_BYTES = 12 * 1024 * 1024;
  const pngResourceBlobCache = new Map();

  function fetchPNGResourceBlob(url) {
    const source = toStringValue(url).trim();
    if (!/^https?:\/\//i.test(source)) return Promise.resolve(null);
    if (pngResourceBlobCache.has(source)) return pngResourceBlobCache.get(source);
    while (pngResourceBlobCache.size >= PNG_RESOURCE_CACHE_LIMIT) {
      pngResourceBlobCache.delete(pngResourceBlobCache.keys().next().value);
    }
    const task = (async () => {
      try {
        const response = await fetch(source, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) return blob;
        }
      } catch (_) {}
      try {
        const blob = await gmFetchPNGResourceBlob(source);
        if (blob instanceof Blob && blob.size > 0) return blob;
      } catch (_) {}
      return null;
    })();
    pngResourceBlobCache.set(source, task);
    void task.then((blob) => {
      if (!blob || blob.size > PNG_RESOURCE_CACHE_MAX_BYTES) pngResourceBlobCache.delete(source);
    });
    return task;
  }

  async function fetchPNGImageBlob(url) {
    const blob = await fetchPNGResourceBlob(url);
    return normalizePNGImageBlob(blob);
  }

  async function inlinePNGSVGElements(target) {
    // 캡처 엔진과 브라우저 조합에 따라 인라인 SVG가 누락되거나 폰트 메트릭이 달라질 수 있다.
    // 캡처 대상 안의 SVG를 실제 렌더 크기의 data URL 이미지로 바꿔 우표·소인·바코드를 고정한다.
    const svgs = [...target.querySelectorAll('svg')];
    await Promise.all(svgs.map(async (svg) => {
      try {
        const box = svg.getBoundingClientRect();
        const width = Math.max(1, Math.ceil(box.width || Number(svg.getAttribute('width')) || 1));
        const height = Math.max(1, Math.ceil(box.height || Number(svg.getAttribute('height')) || 1));
        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const markup = new XMLSerializer().serializeToString(clone);
        const img = document.createElement('img');
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.width = width;
        img.height = height;
        img.style.cssText = svg.style.cssText;
        img.style.width = `${width}px`;
        img.style.height = `${height}px`;
        img.style.maxWidth = 'none';
        img.style.display = 'block';
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
        await new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
        svg.replaceWith(img);
      } catch (error) {
        console.warn('[COA:PNG] SVG 고정 실패:', error);
      }
    }));
  }

  async function inlinePNGImageSources(target) {
    // DOM 기반 캡처는 외부 이미지 URL을 그대로 둔 경우 브라우저/서버 CORS에 따라
    // 누락될 수 있다. 가능한 이미지만 data URL로 바꿔 캡처 DOM 안에 고정한다.
    const images = [...target.querySelectorAll('img')];
    await Promise.all(images.map(async (img) => {
      const src = toStringValue(img.currentSrc || img.getAttribute('src')).trim();
      if (!/^https?:\/\//i.test(src)) return;
      try {
        const blob = await fetchPNGImageBlob(src);
        if (!blob) return;
        img.removeAttribute('crossorigin');
        img.src = await blobToPNGDataURL(blob);
        if (typeof img.decode === 'function') await img.decode();
      } catch (_) {
        // fetch와 GM 요청이 모두 실패하면 원래 URL을 유지하고 html2canvas useCORS에 맡긴다.
      }
    }));
  }

  function getModernScreenshotAPI() {
    if (globalThis.modernScreenshot && typeof globalThis.modernScreenshot.domToCanvas === 'function') {
      return globalThis.modernScreenshot;
    }
    if (typeof modernScreenshot !== 'undefined' && modernScreenshot && typeof modernScreenshot.domToCanvas === 'function') {
      return modernScreenshot;
    }
    return null;
  }

  async function pngLibraryFetchAdapter(url) {
    const source = toStringValue(url).trim();
    if (!/^https?:\/\//i.test(source)) return false;
    try {
      const blob = await fetchPNGResourceBlob(source);
      if (blob instanceof Blob && blob.size > 0) return await blobToPNGDataURL(blob);
    } catch (_) {}
    return false;
  }

  function canvasHasVisiblePixels(canvas) {
    try {
      if (!canvas || canvas.width < 1 || canvas.height < 1) return false;
      const probe = document.createElement('canvas');
      probe.width = 96;
      probe.height = 96;
      const ctx = probe.getContext('2d', { willReadFrequently: true });
      if (!ctx) return true;
      ctx.clearRect(0, 0, 96, 96);
      ctx.drawImage(canvas, 0, 0, 96, 96);
      const data = ctx.getImageData(0, 0, 96, 96).data;
      let visible = 0;
      let minLum = 255;
      let maxLum = 0;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a <= 3) continue;
        visible += 1;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = (r * 299 + g * 587 + b * 114) / 1000;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
        colors.add(`${r >> 4},${g >> 4},${b >> 4},${a >> 5}`);
      }
      if (visible < 24) return false;
      if (colors.size <= 2 && maxLum - minLum < 8) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  async function capturePNGCanvas(target, options) {
    const width = Math.max(1, Math.ceil(Number(options?.width) || target.scrollWidth || target.getBoundingClientRect().width));
    const height = Math.max(1, Math.ceil(Number(options?.height) || target.scrollHeight || target.getBoundingClientRect().height));
    const scale = Math.max(0.1, Number(options?.scale) || 1);
    const modern = getModernScreenshotAPI();

    if (modern) {
      try {
        const canvas = await modern.domToCanvas(target, {
          width,
          height,
          scale,
          backgroundColor: options?.backgroundColor ?? null,
          timeout: Number(options?.imageTimeout) || 30000,
          fetchFn: pngLibraryFetchAdapter,
          fetch: {
            requestInit: {
              mode: 'cors',
              credentials: 'omit',
              cache: 'force-cache',
            },
            bypassingCache: false,
          },
          font: { preferredFormat: 'woff2' },
          features: {
            copyScrollbar: false,
            removeAbnormalAttributes: true,
            removeControlCharacter: true,
            fixSvgXmlDecode: true,
            restoreScrollPosition: false,
          },
          drawImageInterval: 60,
          debug: false,
        });
        if (canvasHasVisiblePixels(canvas)) return canvas;
        console.warn('[COA:PNG] modern-screenshot returned a blank/flat canvas; retrying with html2canvas.');
      } catch (error) {
        console.warn('[COA:PNG] modern-screenshot capture fallback:', error);
      }
    } else {
      console.warn('[COA:PNG] modern-screenshot is unavailable; using html2canvas fallback.');
    }

    const canvas = await html2canvas(target, {
      ...options,
      foreignObjectRendering: false,
      removeContainer: true,
    });
    if (!canvasHasVisiblePixels(canvas)) {
      throw new Error('PNG 캡처 결과가 비어 있습니다. 이미지와 폰트 로딩 상태를 확인한 뒤 다시 시도해줘.');
    }
    return canvas;
  }

  function waitForStylesheetLink(link, timeout = 8000) {
    if (!link || link.sheet) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        link.removeEventListener('load', finish);
        link.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeout);
      link.addEventListener('load', finish, { once: true });
      link.addEventListener('error', finish, { once: true });
    });
  }

  async function waitForPNGFonts(target) {
    ensureExportFonts();
    const links = [
      document.getElementById('coa-export-google-fonts'),
      document.getElementById('coa-export-pretendard-font'),
      ...document.querySelectorAll('link[id^="coa-export-selected-font-"]'),
    ].filter(Boolean);
    await Promise.allSettled(links.map((link) => waitForStylesheetLink(link)));

    try { if (document.fonts?.ready) await waitWithTimeout(document.fonts.ready, 8000); } catch (_) {}
    if (!document.fonts || typeof document.fonts.load !== 'function') return;

    const specs = new Set([
      '400 15px "IBM Plex Mono"',
      '500 15px "IBM Plex Mono"',
      '600 10px "IBM Plex Mono"',
      '400 15px "Gowun Batang"',
      '700 24px "Gowun Batang"',
      '400 15px "Pretendard Variable"',
      '600 15px "Pretendard Variable"',
      '700 24px "Pretendard Variable"',
    ]);

    const samples = [target, ...target.querySelectorAll('[style*="font-family"],h1,h2,h3,h4,h5,h6')].slice(0, 48);
    for (const element of samples) {
      try {
        const style = getComputedStyle(element);
        if (!style.fontFamily || !style.fontSize) continue;
        const weight = /^\d+$/.test(style.fontWeight) ? style.fontWeight : '400';
        const fontStyle = style.fontStyle && style.fontStyle !== 'normal' ? `${style.fontStyle} ` : '';
        specs.add(`${fontStyle}${weight} ${style.fontSize} ${style.fontFamily}`);
      } catch (_) {}
    }

    await Promise.allSettled([...specs].map((spec) => waitWithTimeout(document.fonts.load(spec, '가Aa01'), 8000)));
    try { if (document.fonts?.ready) await waitWithTimeout(document.fonts.ready, 8000); } catch (_) {}
  }

  async function waitForPNGAssets(target) {
    await waitForPNGFonts(target);
    await inlinePNGSVGElements(target);
    await inlinePNGImageSources(target);
    const images = [...target.querySelectorAll('img')];
    await Promise.all(images.map(async (img) => {
      try {
        if (!img.complete) {
          if (typeof img.decode === 'function') await img.decode();
          else await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        } else if (typeof img.decode === 'function') {
          await img.decode();
        }
      } catch (_) {}
    }));
    void target.offsetHeight;
    target.getBoundingClientRect();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }

  // PNG 캡처 뒤 바깥의 완전 투명 영역만 자동으로 잘라낸다.
  // 그림자·회전 장식처럼 알파값이 조금이라도 있는 픽셀은 보존하고,
  // 잘림 방지를 위해 CSS 픽셀 기준의 얇은 안전 여백만 다시 남긴다.
  function cropTransparentPNGCanvas(canvas, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) return canvas;
    const width = Math.max(0, canvas.width | 0);
    const height = Math.max(0, canvas.height | 0);
    if (!width || !height) return canvas;

    const alphaThreshold = Math.max(0, Math.min(254, Number(options.alphaThreshold) || 0));
    const captureScale = Math.max(0.1, Number(options.scale) || 1);
    const safePadding = Math.max(0, Math.ceil((Number(options.padding) || 0) * captureScale));

    let context;
    try {
      context = canvas.getContext('2d', { willReadFrequently: true });
    } catch (_) {
      context = canvas.getContext('2d');
    }
    if (!context) return canvas;

    const rowBlockSize = 64;
    const columnBlockSize = 16;
    const hasAlpha = (value) => value > alphaThreshold;

    try {
      let top = -1;
      for (let blockY = 0; blockY < height && top < 0; blockY += rowBlockSize) {
        const blockHeight = Math.min(rowBlockSize, height - blockY);
        const data = context.getImageData(0, blockY, width, blockHeight).data;
        for (let localY = 0; localY < blockHeight && top < 0; localY += 1) {
          let alphaIndex = localY * width * 4 + 3;
          for (let x = 0; x < width; x += 1, alphaIndex += 4) {
            if (hasAlpha(data[alphaIndex])) {
              top = blockY + localY;
              break;
            }
          }
        }
      }
      if (top < 0) return canvas;

      let bottom = top;
      for (let blockEnd = height; blockEnd > top; blockEnd -= rowBlockSize) {
        const blockY = Math.max(top, blockEnd - rowBlockSize);
        const blockHeight = blockEnd - blockY;
        const data = context.getImageData(0, blockY, width, blockHeight).data;
        let found = false;
        for (let localY = blockHeight - 1; localY >= 0 && !found; localY -= 1) {
          let alphaIndex = localY * width * 4 + 3;
          for (let x = 0; x < width; x += 1, alphaIndex += 4) {
            if (hasAlpha(data[alphaIndex])) {
              bottom = blockY + localY;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      const contentHeight = bottom - top + 1;
      let left = -1;
      for (let blockX = 0; blockX < width && left < 0; blockX += columnBlockSize) {
        const blockWidth = Math.min(columnBlockSize, width - blockX);
        const data = context.getImageData(blockX, top, blockWidth, contentHeight).data;
        for (let localX = 0; localX < blockWidth && left < 0; localX += 1) {
          for (let y = 0; y < contentHeight; y += 1) {
            if (hasAlpha(data[(y * blockWidth + localX) * 4 + 3])) {
              left = blockX + localX;
              break;
            }
          }
        }
      }
      if (left < 0) return canvas;

      let right = left;
      for (let blockEnd = width; blockEnd > left; blockEnd -= columnBlockSize) {
        const blockX = Math.max(left, blockEnd - columnBlockSize);
        const blockWidth = blockEnd - blockX;
        const data = context.getImageData(blockX, top, blockWidth, contentHeight).data;
        let found = false;
        for (let localX = blockWidth - 1; localX >= 0 && !found; localX -= 1) {
          for (let y = 0; y < contentHeight; y += 1) {
            if (hasAlpha(data[(y * blockWidth + localX) * 4 + 3])) {
              right = blockX + localX;
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      const cropLeft = Math.max(0, left - safePadding);
      const cropTop = Math.max(0, top - safePadding);
      const cropRight = Math.min(width - 1, right + safePadding);
      const cropBottom = Math.min(height - 1, bottom + safePadding);
      const cropWidth = cropRight - cropLeft + 1;
      const cropHeight = cropBottom - cropTop + 1;

      if (
        cropLeft === 0 && cropTop === 0
        && cropWidth === width && cropHeight === height
      ) return canvas;

      const cropped = document.createElement('canvas');
      cropped.width = cropWidth;
      cropped.height = cropHeight;
      const croppedContext = cropped.getContext('2d');
      if (!croppedContext) return canvas;
      croppedContext.drawImage(
        canvas,
        cropLeft, cropTop, cropWidth, cropHeight,
        0, 0, cropWidth, cropHeight,
      );
      return cropped;
    } catch (error) {
      // 외부 이미지 때문에 캔버스가 오염된 예외 상황에서는 기존 캡처본을 그대로 저장한다.
      console.warn('[COA:PNG] transparent margin crop skipped:', error);
      return canvas;
    }
  }

  function getPNGRenderOptions(card, renderOptions = {}) {
    const directLogPNG = card.archiveType === 'log' && !renderOptions.layout;
    const pngLayout = directLogPNG ? 'specsheet' : renderOptions.layout;
    const pngColor = directLogPNG
      ? (resolveViewerTheme(viewerState.theme) === 'dark' ? 'dark' : 'light')
      : (renderOptions.color || renderOptions.theme);
    return {
      layout: pngLayout,
      color: pngColor,
      font: renderOptions.font,
      fontSizePt: renderOptions.fontSizePt,
      showTitle: renderOptions.showTitle,
      showTags: renderOptions.showTags,
      showDate: renderOptions.showDate,
      showReference: renderOptions.showReference,
      excludeCodeBlocks: renderOptions.excludeCodeBlocks === true,
    };
  }

  function createPNGStage(card, renderOptions = {}) {
    const stage = document.createElement('div');
    stage.className = 'coa-render-stage';
    stage.innerHTML = renderPNGHTML(card, getPNGRenderOptions(card, renderOptions));
    document.body.appendChild(stage);
    const target = stage.querySelector('.coa-png-shell');
    if (!target) {
      stage.remove();
      throw new Error('PNG 렌더 대상을 만들지 못했습니다.');
    }
    return { stage, target };
  }

  function getPNGHeight(target) {
    return Math.max(target.scrollHeight, target.getBoundingClientRect().height);
  }

  function getPNGScale(height) {
    return height > 16000 ? 1 : height > 9000 ? 1.35 : 2;
  }

  async function captureAndDownloadPNGTarget(target, height, filename) {
    const scale = getPNGScale(height);
    const canvas = await capturePNGCanvas(target, {
      backgroundColor: null,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 20000,
      width: Math.ceil(target.scrollWidth),
      height: Math.ceil(height),
      windowWidth: Math.max(940, Math.ceil(target.scrollWidth)),
      windowHeight: Math.ceil(height),
      scrollX: 0,
      scrollY: 0,
    });
    const outputCanvas = cropTransparentPNGCanvas(canvas, {
      alphaThreshold: 0,
      padding: 3,
      scale,
    });
    await new Promise((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (!blob) reject(new Error('PNG 변환에 실패했습니다.'));
        else {
          downloadBlob(filename, blob);
          resolve();
        }
      }, 'image/png');
    });
  }

  function getPNGSplitLogBlocks(card, renderOptions = {}) {
    return parseDCRPLogBlocks(card, {
      excludeCodeBlocks: renderOptions.excludeCodeBlocks === true,
      excludeComments: false,
    });
  }

  function buildLogBodyFromBlocks(blocks) {
    return (Array.isArray(blocks) ? blocks : []).map((block) => {
      const role = block?.type === 'user' || block?.role === 'user' ? 'User' : 'AI';
      return `[${role}]\n${toStringValue(block?.raw || block?.text || '')}`;
    }).join('\n\n===\n\n');
  }

  function cloneCardWithLogBlocks(card, blocks) {
    const normalized = normalizeCard(card);
    const next = JSON.parse(JSON.stringify(normalized));
    const safeBlocks = Array.isArray(blocks) ? blocks.map((block) => ({ ...block })) : [];
    next.archiveType = 'log';
    next.body = buildLogBodyFromBlocks(safeBlocks);

    // 구조화 메시지가 있던 카드라면 분할본에도 유지한다.
    // 구형/본문형 로그는 body의 [User]/[AI] 마커만으로 렌더러가 다시 파싱한다.
    if (next.log && Array.isArray(next.log.messages)) {
      const sourceMessages = getStructuredLogMessages(normalized);
      if (sourceMessages.length === safeBlocks.length) {
        next.log.messages = sourceMessages.map((message) => ({ ...message }));
      } else {
        next.log = null;
      }
    }
    return normalizeCard(next);
  }

  async function measurePNGCardHeight(card, renderOptions = {}) {
    const { stage, target } = createPNGStage(card, renderOptions);
    try {
      await waitForPNGAssets(target);
      return getPNGHeight(target);
    } finally {
      stage.remove();
    }
  }

  async function exportSinglePNGCard(card, renderOptions = {}, filename) {
    const { stage, target } = createPNGStage(card, renderOptions);
    try {
      await waitForPNGAssets(target);
      const height = getPNGHeight(target);
      if (height > COA_PNG_MAX_HEIGHT) throw new Error('로그가 너무 길어 단일 PNG 한도를 넘습니다. 구간을 나눠 저장해줘.');
      await captureAndDownloadPNGTarget(target, height, filename);
    } finally {
      stage.remove();
    }
  }

  function findLastAssistantBoundary(blocks, start, endExclusive) {
    for (let index = endExclusive; index > start; index -= 1) {
      const block = blocks[index - 1];
      if (block?.type === 'ai' || block?.role === 'ai' || block?.role === 'assistant') return index;
    }
    return start;
  }

  async function splitLogCardForPNG(card, renderOptions = {}) {
    const blocks = getPNGSplitLogBlocks(card, renderOptions);
    if (!blocks.length) throw new Error('자동 분할할 USER/AI 로그 턴을 찾지 못했습니다.');
    const parts = [];
    let start = 0;
    while (start < blocks.length) {
      let low = start + 1;
      let high = blocks.length;
      let best = start;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const candidate = cloneCardWithLogBlocks(card, blocks.slice(start, mid));
        const height = await measurePNGCardHeight(candidate, renderOptions);
        if (height <= COA_PNG_SPLIT_SOFT_HEIGHT) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      if (best <= start) {
        const singleBlockCard = cloneCardWithLogBlocks(card, [blocks[start]]);
        const singleHeight = await measurePNGCardHeight(singleBlockCard, renderOptions);
        if (singleHeight > COA_PNG_MAX_HEIGHT) {
          throw new Error('로그 한 턴 자체가 PNG 한도를 넘어서 자동 분할할 수 없습니다. 해당 턴을 더 짧게 나눠 저장해줘.');
        }
        best = start + 1;
      }

      let end = best;
      if (best < blocks.length) {
        const assistantBoundary = findLastAssistantBoundary(blocks, start, best);
        if (assistantBoundary > start) end = assistantBoundary;
      }

      parts.push(cloneCardWithLogBlocks(card, blocks.slice(start, end)));
      start = end;
    }
    return parts;
  }

  async function coaExportPNG(id, renderOptions = {}) {
    const sourceCard = await coaLoadCard(id);
    if (!sourceCard) throw new Error('PNG로 저장할 카드를 찾지 못했습니다.');
    const card = await prepareCardForExport(sourceCard, renderOptions);
    if (!getModernScreenshotAPI() && !globalThis.html2canvas) throw new Error('PNG 캡처 라이브러리가 로드되지 않았습니다.');
    ensureExportFonts(renderOptions.font);
    ensureExportStyle();
    const baseFilename = `crack-archive-${safeFilename(card.title)}-${stampForFilename()}`;

    const { stage, target } = createPNGStage(card, renderOptions);
    try {
      await waitForPNGAssets(target);
      const height = getPNGHeight(target);
      if (height <= COA_PNG_MAX_HEIGHT) {
        await captureAndDownloadPNGTarget(target, height, `${baseFilename}.png`);
        return;
      }
    } finally {
      stage.remove();
    }

    const splitBlocks = getPNGSplitLogBlocks(card, renderOptions);
    if (!splitBlocks.length) {
      throw new Error('내용이 너무 길고 USER/AI 로그 턴을 찾지 못해 자동 분할할 수 없습니다.');
    }

    const parts = await splitLogCardForPNG(card, renderOptions);
    const total = String(parts.length).padStart(2, '0');
    for (let index = 0; index < parts.length; index += 1) {
      const seq = String(index + 1).padStart(2, '0');
      await exportSinglePNGCard(parts[index], renderOptions, `${baseFilename}-${seq}_of_${total}.png`);
      if (index < parts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, COA_PNG_DOWNLOAD_DELAY));
      }
    }
  }

  function safeFilename(value) {
    return (normalizeText(value) || 'card').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60);
  }

  function styleToString(styleObj) {
    const allowed = new Set(DC_ALLOWED_STYLES);
    return Object.entries(styleObj || {})
      .filter(([key, value]) => allowed.has(key) && value !== '' && value != null)
      .map(([key, value]) => `${key}:${String(value)}`)
      .join(';');
  }

  function unwrapNode(node) {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  }

  function sanitizeForDC(root, opts = {}) {
    const allowed = new Set(DC_ALLOWED_TAGS);
    const walker = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const tag = node.tagName.toLowerCase();
      if (!allowed.has(tag)) {
        unwrapNode(node);
        continue;
      }
      if (!opts.includeTables && ['table','thead','tbody','tr','th','td'].includes(tag)) {
        unwrapNode(node);
        continue;
      }
      if (opts.excludeImages && tag === 'img') {
        node.remove();
        continue;
      }
      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name === 'href' || name === 'src' || name === 'alt' || name === 'title' || name === 'colspan' || name === 'rowspan' || name === 'align') return;
        node.removeAttribute(attr.name);
      });
      if (tag === 'a') {
        const href = node.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(href)) node.removeAttribute('href');
        else node.setAttribute('target', '_blank');
      }
      if (tag === 'img') {
        const src = node.getAttribute('src') || '';
        if (!/^https?:\/\//i.test(src)) node.remove();
      }
    }
  }

  function applyDCInlineStyles(root, card, opts = {}) {
    const theme = opts.themeObject || getDCTheme(opts.theme || DC_DEFAULT_OPTIONS.theme);
    const font = opts.fontFamilyOverride ? { family: opts.fontFamilyOverride } : getDCFont(opts.font || DC_DEFAULT_OPTIONS.font);
    const shouldForceWrap = opts.forceWordWrap !== false;
    root.querySelectorAll('*').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const base = {
        color: theme.fg,
        'line-height': '1.75',
        'font-family': font.family,
      };
      // "단어 단위 줄바꿈 강제"를 끄면 WJ뿐 아니라 줄바꿈 관련 인라인 CSS도 빼서
      // DC 코드 길이를 줄이고, 강제 줄바꿈 보정 자체를 완전히 비활성화한다.
      if (shouldForceWrap) Object.assign(base, {
        'word-break': 'keep-all',
        'overflow-wrap': 'normal',
        'word-wrap': 'normal',
        'line-break': 'strict',
      });
      if (/^h[1-6]$/.test(tag)) Object.assign(base, {
        color: theme.accent,
        'font-weight': '800',
        'border-bottom': `1px solid ${theme.border}`,
        'padding': '0 0 6px 0',
        'margin': '22px 0 10px 0',
      });
      else if (tag === 'p') Object.assign(base, { margin: '10px 0' });
      else if (tag === 'blockquote') Object.assign(base, {
        color: theme.muted,
        'border-left': `3px solid ${theme.accent}`,
        'background-color': theme.chip,
        padding: '8px 12px',
        margin: '12px 0',
      });
      else if (tag === 'pre') Object.assign(base, {
        color: theme.codeFg,
        'background-color': theme.codeBg,
        border: `1px solid ${theme.border}`,
        padding: '10px 12px',
        margin: '12px 0',
        'font-family': 'Consolas, Menlo, monospace',
        'white-space': 'pre-wrap',
      });
      else if (tag === 'code') Object.assign(base, {
        color: theme.codeFg,
        'background-color': theme.codeBg,
        padding: '2px 5px',
        'font-family': 'Consolas, Menlo, monospace',
      });
      else if (tag === 'table') Object.assign(base, {
        width: '100%',
        'border-collapse': 'collapse',
        'border-spacing': '0',
        'table-layout': 'auto',
        margin: '12px 0',
      });
      else if (tag === 'th') Object.assign(base, {
        border: `1px solid ${theme.border}`,
        padding: '8px 10px',
        'background-color': theme.chip,
        'font-weight': '800',
        'vertical-align': 'top',
      });
      else if (tag === 'td') Object.assign(base, {
        border: `1px solid ${theme.border}`,
        padding: '8px 10px',
        'vertical-align': 'top',
      });
      else if (tag === 'hr') Object.assign(base, {
        border: 'none',
        'border-top': `1px solid ${theme.border}`,
        margin: '18px 0',
      });
      else if (tag === 'ul' || tag === 'ol') Object.assign(base, { margin: '10px 0', padding: '0 0 0 24px' });
      else if (tag === 'li') Object.assign(base, { margin: '4px 0' });
      else if (tag === 'strong' || tag === 'b') Object.assign(base, { color: theme.fg, 'font-weight': '900' });
      else if (tag === 'em' || tag === 'i') Object.assign(base, { color: theme.italic || theme.muted, 'font-style': 'normal' });
      else if (tag === 'a') Object.assign(base, { color: theme.accent, 'text-decoration': 'underline' });
      else if (tag === 'img') Object.assign(base, { width: 'auto', 'max-width': '100%', height: 'auto', border: `1px solid ${theme.border}`, margin: '10px 0' });
      el.setAttribute('style', styleToString(base));
    });
  }

  function stabilizeDCAlignment(root) {
    // DC 편집기가 일부 text-align/margin:auto를 지워도 정렬이 유지되도록
    // 구형 HTML align 속성을 함께 부여한다. 내보내기 결과에만 적용한다.
    root.querySelectorAll('[style]').forEach((el) => {
      const style = (el.getAttribute('style') || '').toLowerCase();
      if (/text-align\s*:\s*center/.test(style)) el.setAttribute('align', 'center');
      else if (/text-align\s*:\s*right/.test(style)) el.setAttribute('align', 'right');
      else if (/text-align\s*:\s*left/.test(style)) el.setAttribute('align', 'left');
      if (el.tagName === 'TABLE' && /margin\s*:\s*[^;]*auto/.test(style)) el.setAttribute('align', 'center');
    });
    root.querySelectorAll('td[align="center"],th[align="center"]').forEach((cell) => {
      const current = cell.getAttribute('style') || '';
      if (!/text-align\s*:/i.test(current)) cell.setAttribute('style', `${current}${current && !current.trim().endsWith(';') ? ';' : ''}text-align:center;`);
    });
  }

  function wrapDCWordsNoBreak(root) {
    // WORD JOINER를 글자 사이에 삽입하면 모바일에서 문장이 한쪽으로 몰리고
    // 어색한 지점에서만 줄이 바뀐다. 기존 문자를 먼저 제거하고, 요소 단위의 반응형
    // 줄바꿈만 적용해 PC/모바일 폭에 자연스럽게 맞춘다.
    stripDCWordJoiners(root);
    const nodes = [root, ...root.querySelectorAll('td,th,div,p,li,blockquote,h1,h2,h3,h4,h5,h6')];
    for (const el of nodes) {
      const current = el.getAttribute('style') || '';
      const suffix = 'word-break:normal;overflow-wrap:break-word;word-wrap:break-word;line-break:auto;';
      el.setAttribute('style', current && !current.trim().endsWith(';') ? `${current};${suffix}` : `${current}${suffix}`);
    }
  }

  function stripDCWordJoiners(root) {
    // 옵션을 끈 경우, 혹시 이전 출력/붙여넣기에서 섞인 WORD JOINER가 있더라도
    // DC 내보내기 결과에서는 제거한다. 저장 원문은 건드리지 않는다.
    const doc = root.ownerDocument || document;
    const WJ = /\u2060/g;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeValue && node.nodeValue.includes('\u2060')) targets.push(node);
    }
    for (const node of targets) node.nodeValue = node.nodeValue.replace(WJ, '');
  }
  // DC 내보내기에서 선택적으로 제거할 주석 문법.
  // 로어 컨텍스트 제거와는 별개이며, 체크 해제 시 원문을 보존한다.
  function stripDCCommentSyntax(value) {
    return toStringValue(value)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/^\s*\[\/\/\]:\s*#\s*\([^\n]*\)\s*$/gmi, '')
      .replace(/^\s*\[(?:comment|\/\/)\]:\s*<>\s*\([^\n]*\)\s*$/gmi, '')
      .replace(/\n{3,}/g, '\n\n');
  }


  // 크랙/확장 기능이 이미지 주소를 Markdown·HTML 주석 안에 숨긴 경우,
  // 일반 보관함 보기와 일반 HTML/PNG에서는 그 이미지만 꺼내 보여준다.
  // DC 내보내기의 '주석 제외' 의미는 바꾸지 않기 위해 DC 경로에서는 사용하지 않는다.
  function extractCommentImageURLs(fragment) {
    const source = toStringValue(fragment);
    const urls = [];
    const seen = new Set();
    const add = (value) => {
      const url = toStringValue(value).trim().replace(/&amp;/g, '&');
      if (!/^https?:\/\//i.test(url) || seen.has(url)) return;
      seen.add(url);
      urls.push(url);
    };

    // 명시적인 Markdown 이미지: ![alt](URL)
    source.replace(/!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/gi, (_m, url) => {
      add(url);
      return _m;
    });
    // HTML 이미지: <img src="URL">
    source.replace(/<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi, (_m, url) => {
      add(url);
      return _m;
    });
    // 주석 안에 URL만 적힌 경우. 확장자가 이미지인 주소만 승격한다.
    source.replace(/https?:\/\/[^\s<>"']+?\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?[^\s<>"']*)?/gi, (url) => {
      add(url.replace(/[),.;]+$/g, ''));
      return url;
    });
    return urls;
  }

  function restoreCommentImageLinks(value) {
    let source = toStringValue(value).replace(/\r\n?/g, '\n');
    const toImages = (fragment) => {
      const urls = extractCommentImageURLs(fragment);
      if (!urls.length) return '\n';
      return `\n${urls.map((url) => `<img src="${escapeHTML(url)}" alt="첨부 이미지">`).join('\n')}\n`;
    };

    source = source.replace(/<!--([\s\S]*?)-->/g, (_m, inner) => toImages(inner));
    source = source.replace(/^\s*\[\/\/\]:\s*#\s*\(([^\n]*)\)\s*$/gmi, (_m, inner) => toImages(inner));
    source = source.replace(/^\s*\[(?:comment|\/\/)\]:\s*<>\s*\(([^\n]*)\)\s*$/gmi, (_m, inner) => toImages(inner));
    return source.replace(/\n{3,}/g, '\n\n');
  }

  function prepareGeneralVisibleContent(value) {
    return stripDCCommentSyntax(restoreCommentImageLinks(value));
  }

  function prepareCardForGeneralVisibleRender(card) {
    const normalized = normalizeCard(card);
    const log = normalized.log && Array.isArray(normalized.log.messages)
      ? {
          ...normalized.log,
          messages: normalized.log.messages.map((message) => ({
            ...message,
            content: prepareGeneralVisibleContent(message?.content || ''),
          })),
        }
      : normalized.log;
    return {
      ...normalized,
      body: prepareGeneralVisibleContent(normalized.body || ''),
      log,
    };
  }

  function removeHTMLCommentNodes(root) {
    const doc = root?.ownerDocument || document;
    if (!root || !doc.createTreeWalker) return;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    targets.forEach((node) => node.remove());
  }

  function prepareCardForDCRender(card, opts = {}) {
    const normalized = normalizeCard(card);
    if (!opts.excludeComments) return normalized;
    return { ...normalized, body: stripDCCommentSyntax(normalized.body || '') };
  }

  function stripDCLogNoiseLines(body, opts = {}) {
    // <ooc_lore_context>는 항상 제거한다. 이미지/주석은 DC 체크박스 설정을 따른다.
    let source = stripCOALoreContextBlocks(body).replace(/\r\n?/g, '\n');
    if (opts.excludeComments) source = stripDCCommentSyntax(source);

    const lines = source.split('\n');
    const out = [];
    for (const raw of lines) {
      const line = raw.trimEnd();
      const t = line.trim();
      if (!t) {
        if (out.length && out[out.length - 1] !== '') out.push('');
        continue;
      }
      if (opts.excludeImages && /^!\[[^\]]*]\([^)]+\)\s*$/.test(t)) continue;
      if (opts.excludeImages && /^<img\b/i.test(t)) continue;
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripDCRPCodeBlocks(value) {
    // 로그 파서는 Markdown을 HTML로 렌더링하기 전에 동작하므로, 여러 줄 코드블록은 원문 단계에서 먼저 제거한다.
    // fenced block(``` / ~~~)과 HTML <pre>만 제외하고, `인라인 코드`와 단독 <code>는 본문에 유지한다.
    return toStringValue(value)
      .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, '')
      .replace(/~~~[^\n]*\n[\s\S]*?(?:~~~|$)/g, '')
      .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, '')
      .replace(/\n{3,}/g, '\n\n');
  }
  function parseDCRPLogBlocks(card, opts = {}) {
    // API 메시지/[AI]/[USER] 단위만 턴으로 나눈다.
    // 대사·서술·인용·화자 표식은 본문 안에서 다시 분해하지 않는다.
    const structuredMessages = getStructuredLogMessages(card);
    const chunks = structuredMessages.length
      ? structuredMessages.map((message) => ({
          role: message.role === 'user' ? 'user' : 'ai',
          text: message.content || '',
          speaker: message.speaker || (message.role === 'user' ? 'USER' : 'AI'),
        }))
      : [];

    if (!structuredMessages.length) {
      const sourceBody = opts.excludeCodeBlocks ? stripDCRPCodeBlocks(card.body || '') : (card.body || '');
      const body = stripDCLogNoiseLines(stripCOALoreContextBlocks(sourceBody), opts);
      const lines = body.replace(/\r\n?/g, '\n').split('\n');
      let current = null;
      const markerRE = /^\s*\[\s*(User|유저|사용자|AI|Assistant|봇|모델)\s*\]\s*(?::|：)?\s*(.*)$/i;
      const flush = () => {
        if (!current) return;
        const text = current.lines.join('\n').trim();
        if (text) chunks.push({ role: current.role, text, speaker: current.speaker });
        current = null;
      };

      for (const raw of lines) {
        const line = raw.trimEnd();
        const trimmed = line.trim();
        if (/^={3,}$/.test(trimmed)) {
          flush();
          continue;
        }
        const marker = trimmed.match(markerRE);
        if (marker) {
          flush();
          const isUser = /user|유저|사용자/i.test(marker[1] || '');
          current = { role: isUser ? 'user' : 'ai', speaker: isUser ? 'USER' : 'AI', lines: [] };
          if (marker[2] && marker[2].trim()) current.lines.push(marker[2].trim());
          continue;
        }
        if (!current) current = { role: 'user', speaker: 'USER', lines: [] };
        current.lines.push(line);
      }
      flush();
    }

    return chunks.map((chunk) => {
      let raw = stripDCLogNoiseLines(stripCOALoreContextBlocks(chunk.text || ''), opts).trim();
      if (opts.excludeCodeBlocks) raw = stripDCRPCodeBlocks(raw).trim();
      if (!raw) return null;
      const type = chunk.role === 'user' ? 'user' : 'ai';
      return {
        type,
        role: type,
        speaker: chunk.speaker || (type === 'user' ? 'USER' : 'AI'),
        raw,
        text: raw,
        dialogue: [],
        narration: [],
        parts: [{ type: 'content', text: raw }],
      };
    }).filter(Boolean);
  }


  function getDCRPLogTagText(card) {
    const tags = uniqueStrings(card.tags)
      .map((tag) => toStringValue(tag).trim())
      .filter(Boolean)
      .filter((tag) => !/^(log|auto-capture|script|ooc|markdown|html|text)$/i.test(tag));
    if (tags.length) return tags.slice(0, 3).join(' · ');
    return '크랙 · 로그';
  }

  function normalizeDCExportStyle(archiveType, value) {
    const type = normalizeArchiveType(archiveType, 'ooc');
    let key = toStringValue(value).trim().toLocaleLowerCase();

    // 구버전 값을 받아도 현재 구조로 안전 변환한다.
    if (type === 'log') {
      if (DC_LOG_THEMES[key] || key === 'ooc-clean' || key === 'theme-linked' || key === 'clean') key = 'layout';
    } else {
      if (key === 'none') key = 'specsheet';
      else if (key === 'archive' || key === 'dc-paper' || key === 'theme-linked' || key === 'clean') key = 'specsheet';
    }

    const styles = DC_EXPORT_STYLES[type];
    if (Object.prototype.hasOwnProperty.call(styles, key)) return key;
    return type === 'log' ? DC_DEFAULT_OPTIONS.logStyle : DC_DEFAULT_OPTIONS.oocStyle;
  }

  function resolveDCExportStyle(card, opts = {}) {
    const normalized = normalizeCard(card);
    const type = normalized.archiveType;

    if (opts.exportStyle) return normalizeDCExportStyle(type, opts.exportStyle);

    // 구버전 외부 호출 호환. 저장함 분류는 바꾸지 않고 값만 새 서식으로 대응한다.
    if (type === 'log') {
      if (opts.logLayout === false) return 'layout';
      if (opts.logStyle) return normalizeDCExportStyle(type, opts.logStyle);
      return normalizeDCExportStyle(type, DC_DEFAULT_OPTIONS.logStyle);
    }

    if (opts.docTemplate) return normalizeDCExportStyle(type, opts.docTemplate);
    if (opts.oocStyle) return normalizeDCExportStyle(type, opts.oocStyle);
    return normalizeDCExportStyle(type, DC_DEFAULT_OPTIONS.oocStyle);
  }

  function getDCExportStyleOptionsHTML(archiveType, selected) {
    const type = normalizeArchiveType(archiveType, 'ooc');
    const clean = normalizeDCExportStyle(type, selected);
    return Object.keys(DC_EXPORT_STYLES[type])
      .map((key) => `<option value="${escapeHTML(key)}"${key === clean ? ' selected' : ''}>${escapeHTML(DC_EXPORT_STYLES[type][key].label)}</option>`)
      .join('');
  }

  // SVG·배경 그라데이션 없이도 DC 편집기에서 남는 고정 셀 바코드.
  // 빈 셀 + bgcolor + 고정 폭/높이만 사용해 게시 후에도 막대 굵기와 간격을 유지한다.
  function renderDCSpecBarcode(color = '#161513') {
    const bars = [
      [0, 3], [5, 2], [9, 4], [15, 2], [19, 2], [24, 5],
      [31, 2], [35, 3], [40, 2], [44, 4], [50, 2], [54, 2],
      [58, 5], [65, 2], [69, 3], [74, 2], [79, 2], [83, 4],
      [89, 2], [93, 3], [98, 5], [105, 2], [109, 2], [114, 4],
    ];
    let cursor = 0;
    const cells = [];
    for (const [x, width] of bars) {
      if (x > cursor) {
        const gap = x - cursor;
        cells.push(`<td width="${gap}" height="28" style="width:${gap}px;height:28px;padding:0;font-size:0;line-height:0;">&#8203;</td>`);
      }
      cells.push(`<td width="${width}" height="28" bgcolor="${color}" style="width:${width}px;height:28px;padding:0;background-color:${color};font-size:0;line-height:0;">&#8203;</td>`);
      cursor = x + width;
    }
    if (cursor < 118) {
      const gap = 118 - cursor;
      cells.push(`<td width="${gap}" height="28" style="width:${gap}px;height:28px;padding:0;font-size:0;line-height:0;">&#8203;</td>`);
    }
    return `<table width="118" height="28" cellpadding="0" cellspacing="0" border="0" align="right" style="width:118px;height:28px;border-collapse:collapse;table-layout:fixed;margin:0 0 0 auto;"><tbody><tr>${cells.join('')}</tr></tbody></table>`;
  }

  // DC 항공우편 인장. 날짜를 테두리 밖 아래에 두어 우표 상자가 쓸데없이 길어지지 않게 한다.
  // div의 text-align 상속에 기대지 않고 모든 행을 고정 표 셀로 중앙 정렬해 DC 게시 후에도 위치를 유지한다.
  function renderDCAirmailStamp(dateText, opts = {}) {
    const width = Math.max(58, Math.min(82, Number(opts.width) || 70));
    const accent = opts.accent || '#34508C';
    const chip = opts.chip || '#EEF1F6';
    const star = opts.star || '#B23A34';
    const muted = opts.muted || '#8C8270';
    const safeDate = toStringValue(dateText).trim() || '&nbsp;';
    const showDate = opts.showDate !== false;
    const mono = "'Malgun Gothic','맑은 고딕',Arial,sans-serif";
    const dateRow = showDate ? `<tr><td align="center" nowrap="nowrap" style="padding:5px 0 0;text-align:center;white-space:nowrap;color:${muted};font-family:${mono};font-size:8.5px;font-weight:400;line-height:1.25;letter-spacing:.02em;">${safeDate}</td></tr>` : '';
    return `<table width="${width}" cellpadding="0" cellspacing="0" border="0" align="center" style="width:${width}px;border-collapse:collapse;table-layout:fixed;margin:0 auto;"><tbody><tr><td align="center" style="padding:0;text-align:center;vertical-align:top;"><table width="${width}" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="${chip}" style="width:${width}px;border-collapse:collapse;table-layout:fixed;margin:0 auto;background-color:${chip};border:1px solid ${accent};"><tbody><tr><td align="center" nowrap="nowrap" style="padding:6px 3px 0;text-align:center;white-space:nowrap;color:${accent};font-family:${mono};font-size:9px;font-weight:700;line-height:1.25;letter-spacing:.04em;">CA</td></tr><tr><td align="center" nowrap="nowrap" style="padding:0 3px;text-align:center;white-space:nowrap;color:${accent};font-family:${mono};font-size:9px;font-weight:700;line-height:1.25;letter-spacing:.04em;">POST</td></tr><tr><td align="center" style="padding:1px 3px 5px;text-align:center;color:${star};font-family:${mono};font-size:10px;font-weight:700;line-height:1.2;">✦</td></tr></tbody></table></td></tr>${dateRow}</tbody></table>`;
  }

  // DC 편집기는 붙여넣은 표/블록 안쪽 요소에 자체 font-family를 다시 지정할 수 있다.
  // 부모 표의 상속만으로는 선택 폰트가 사라질 수 있으므로, 폰트가 명시되지 않은 실제 텍스트 요소에 직접 박는다.
  // 테마 장식용 모노 라벨과 pre/code의 고정폭 폰트는 이미 font-family가 있으므로 그대로 보존한다.
  function stabilizeDCSelectedFont(root, fontFamily) {
    if (!root) return;
    const family = toStringValue(fontFamily).trim();
    if (!family) return;
    const selector = 'table,thead,tbody,tfoot,tr,td,th,div,p,span,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,a,strong,b,em,i';
    const targets = [root, ...root.querySelectorAll(selector)];
    targets.forEach((el) => {
      if (!el || el.closest('pre,code')) return;
      const current = toStringValue(el.getAttribute('style')).trim();
      if (/(?:^|;)\s*font-family\s*:/i.test(current)) return;
      el.setAttribute('style', `${current}${current && !current.endsWith(';') ? ';' : ''}font-family:${family};`);
    });
  }

  // DC 로그 내보내기는 로그 테마를 바로 사용한다. 모든 꾸밈은 내부 문서 셀만 채우고 자동 폭에 대응한다.
  function coaToDCLogLayoutHTML(card, opts = {}) {
    const normalized = normalizeCard(card);
    const options = { ...DC_DEFAULT_OPTIONS, ...opts };
    const meta = getExportMetaOptions(options);
    const blocks = parseDCRPLogBlocks(normalized, options);
    if (!blocks.length) return '';
    const exportStyle = normalizeDCExportStyle('log', options.exportStyle || options.logStyle || DC_DEFAULT_OPTIONS.logStyle);

    const rawLogTheme = options.logTheme || normalized.dc?.logTheme || DC_DEFAULT_OPTIONS.logTheme;
    const logTheme = normalizeDCLogTheme(rawLogTheme);
    const layoutKey = logTheme;
    const isLegacy = layoutKey === 'crosslog';
    const colorKey = normalizeDCLogColor(options.logColor || normalized.dc?.logColor || DC_DEFAULT_OPTIONS.logColor, rawLogTheme);
    const specColor = layoutKey === 'specsheet' ? colorKey : 'light';
    const palette = layoutKey === 'airmail'
      ? { bg:'#FBF6EA', text:'#3A342B', title:'#3A342B', accent:'#34508C', dialogue:'#B23A34', line:'#D9CDB4', fg:'#3A342B', muted:'#8C8270', border:'#D9CDB4', aiBg:'#FFFDF6', userBg:'#FFFDF6', aiAccent:'#34508C', userAccent:'#B23A34', italic:'#8C8270', quoteBg:'#F4EEE2', quoteAccent:'#34508C' }
      : getLogHTMLPalette(layoutKey, colorKey);
    const suggestedFontKey = getSuggestedDCFontForTheme(layoutKey);
    const font = getDCFont(options.font || suggestedFontKey);
    const maxWidth = Math.max(320, Math.min(760, Number(options.maxWidth) || 700));
    const pageWidth = Math.min(maxWidth, 700);
    const title = escapeHTML(stripSmartMarkdown(normalized.title || '기록').trim() || '기록');
    const rawTagText = getDCRPLogTagText(normalized);
    const tagText = meta.showTags && rawTagText !== '크랙 · 로그' ? escapeHTML(rawTagText) : '';
    const ref = meta.showReference ? escapeHTML(getCardExportRef(normalized)) : '';
    const dateText = meta.showDate ? escapeHTML(formatDate(normalized.createdAt, false)) : '';
    const turnsCount = blocks.length;

    const turnRows = blocks.map((block, index) => {
      const isUser = block.type === 'user';
      const role = isUser ? 'USER' : 'AI';
      const accent = isUser ? (palette.userAccent || palette.dialogue) : (palette.aiAccent || palette.accent);
      const bg = isUser ? (palette.userBg || palette.bg) : (palette.aiBg || palette.bg);
      const body = renderSimpleLogContentHTML(block.raw || block.text || '', {
        dc: true, includeTables: options.includeTables, excludeImages: options.excludeImages,
        excludeCodeBlocks: options.excludeCodeBlocks, excludeComments: options.excludeComments,
        palette, theme: colorKey || logTheme,
        forceTextColor: layoutKey === 'silentfilm' || (['gwedo','heugyo','cheongin','yeobaek','muji'].includes(layoutKey) && getCOAHexLuminance(palette.bg) < 0.32) ? palette.text : '',
      });
      return { isUser, role, accent, bg, body, no: String(index + 1).padStart(2, '0') };
    });

    let inner = '';
    if (isLegacy) {
      const turns = turnRows.map((turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 15px;"><tbody><tr><td bgcolor="${turn.bg}" style="padding:15px 17px;background-color:${turn.bg};color:${palette.fg};border-${turn.isUser ? 'right' : 'left'}:4px solid ${turn.accent};overflow-wrap:break-word;word-break:keep-all;"><div style="margin:0 0 9px;text-align:${turn.isUser ? 'right' : 'left'};font-size:11px;font-weight:900;line-height:1.6;color:${turn.accent};">${turn.role}</div><div>${turn.body}</div></td></tr></tbody></table>`).join('');
      inner = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:31px 22px 21px;border-bottom:1px solid ${palette.border};"><div align="center" style="font-size:11px;color:${palette.muted};text-align:center;">ROLEPLAY LOG</div><div align="center" style="margin-top:10px;font-size:28px;font-weight:900;line-height:1.45;color:${palette.fg};text-align:center;">${title}</div>${tagText ? `<div align="center" style="margin-top:9px;font-size:12px;color:${palette.muted};text-align:center;">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:20px 21px 24px;">${turns}</div>`;
    } else if (layoutKey === 'specsheet') {
      const darkSpec = specColor === 'dark';
      const specPaper = darkSpec ? '#201F1D' : '#FBFBF8';
      const specBase = darkSpec ? '#161614' : '#F5F5F1';
      const specStrip = darkSpec ? '#2A2926' : '#E6E5E0';
      const specInk = darkSpec ? '#EDEBE4' : '#161513';
      const specSub = darkSpec ? '#B8B5AC' : '#57544D';
      const specMuted = darkSpec ? '#7E7B73' : '#87847C';
      const specFill = darkSpec ? '#EDEBE4' : '#161513';
      const specFillText = darkSpec ? '#161614' : '#F5F5F1';
      const specHeaderMeta = `${tagText ? `${tagText} · ` : ''}${turnsCount} TURNS`;
      const specBarcodeRows = `<tr><td align="right" style="padding:0;text-align:right;">${renderDCSpecBarcode(darkSpec ? '#FFFFFF' : specInk)}</td></tr>${meta.showDate ? `<tr><td align="center" nowrap="nowrap" style="padding:5px 0 0;font-size:9px;color:${specSub};text-align:center;white-space:nowrap;">${dateText}</td></tr>` : ''}`;
      const turns = turnRows.map((turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${specPaper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${specPaper};border:1px solid ${specInk};margin:0 0 16px;"><tbody><tr><td colspan="2" bgcolor="${turn.isUser ? specFill : specStrip}" style="padding:5px 10px;background-color:${turn.isUser ? specFill : specStrip};color:${turn.isUser ? specFillText : specInk};font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;color:${turn.isUser ? specFillText : specInk};"><tbody><tr><td style="color:${turn.isUser ? specFillText : specInk};">${turn.role}</td><td align="right" style="color:${turn.isUser ? specFillText : specInk};text-align:right;">T-${turn.no}</td></tr></tbody></table></td></tr><tr><td colspan="2" align="left" style="padding:14px 15px;color:${specInk};font-family:${font.family};text-align:left;overflow-wrap:break-word;word-break:normal;">${turn.body}</td></tr></tbody></table>`).join('');
      inner = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${specStrip}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${specStrip};border-bottom:2px solid ${specInk};"><tbody><tr><td width="50%" align="left" nowrap="nowrap" style="width:50%;padding:7px 13px;font-family:Consolas,Menlo,monospace;font-size:10px;color:${specSub};text-align:left;white-space:nowrap;">${meta.showReference ? `REF: ${ref}` : '&nbsp;'}</td><td width="50%" align="right" nowrap="nowrap" style="width:50%;padding:7px 13px;font-family:Consolas,Menlo,monospace;font-size:10px;color:${specSub};text-align:right;white-space:nowrap;">CRACK ARCHIVE</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${specBase}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${specBase};border-bottom:2px solid ${specInk};"><tbody><tr><td style="padding:24px 22px;vertical-align:middle;"><div style="font-family:Consolas,Menlo,monospace;font-size:10px;color:${specMuted};">ROLEPLAY LOG</div><div style="margin-top:9px;font-family:${font.family};font-size:26px;font-weight:900;color:${specInk};">${title}</div><div style="margin-top:9px;font-size:11px;color:${specSub};">${specHeaderMeta}</div></td><td width="142" align="right" valign="middle" style="width:142px;padding:20px 16px 20px 8px;vertical-align:middle;text-align:right;font-family:Consolas,Menlo,monospace;color:${specInk};"><table width="118" cellpadding="0" cellspacing="0" border="0" align="right" style="width:118px;border-collapse:collapse;margin:0 0 0 auto;"><tbody>${specBarcodeRows}</tbody></table></td></tr></tbody></table><div style="padding:20px;background-color:${specBase};">${turns}</div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${specStrip}" style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:2px solid ${specInk};background-color:${specStrip};"><tbody><tr><td width="50%" align="left" nowrap="nowrap" style="width:50%;padding:7px 13px;font-family:Consolas,Menlo,monospace;font-size:10px;color:${specSub};text-align:left;white-space:nowrap;">END OF LOG</td><td width="50%" align="right" nowrap="nowrap" style="width:50%;padding:7px 13px;font-family:Consolas,Menlo,monospace;font-size:10px;color:${specSub};text-align:right;white-space:nowrap;">${turnsCount} TURNS RECORDED</td></tr></tbody></table>`;
    } else if (layoutKey === 'airmail') {
      const turns = turnRows.map((turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFDF6" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#FFFDF6;border:1px solid #E2D8C2;margin:0 0 18px;"><tbody><tr><td style="padding:15px 17px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:9px;"><tbody><tr><td width="70%" align="left" style="width:70%;font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;color:${turn.isUser ? '#B23A34' : '#34508C'};text-align:left;">FROM : ${turn.role}</td><td width="30%" align="right" style="width:30%;font-family:Consolas,Menlo,monospace;font-size:10px;color:#B4A98F;text-align:right;white-space:nowrap;">№ ${turn.no}</td></tr></tbody></table><div align="left" style="font-family:${font.family};color:#3A342B;text-align:left;">${turn.body}</div></td></tr></tbody></table>`).join('');
      inner = `<div style="padding:9px;background-color:#B23A34;"><div style="padding:9px;background-color:#34508C;"><div style="padding:20px;background-color:#FBF6EA;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-bottom:1px solid #D9CDB4;margin-bottom:18px;"><tbody><tr><td style="padding:0 8px 14px 0;"><div style="font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;color:#34508C;">PAR AVION · VIA AIR MAIL</div><div style="margin-top:9px;font-size:25px;font-weight:900;color:#3A342B;">${title}</div><div style="margin-top:8px;font-size:11px;color:#8C8270;">${tagText ? `${tagText} · ` : ''}편지 ${turnsCount}통</div></td><td width="84" align="center" style="width:84px;padding:0 0 14px 4px;text-align:center;vertical-align:top;">${renderDCAirmailStamp(dateText, { width:70, accent:'#34508C', chip:'#EEF1F6', star:'#B23A34', muted:'#8C8270', showDate: meta.showDate })}</td></tr></tbody></table>${turns}<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid #D9CDB4;margin-top:18px;"><tbody><tr><td width="45%" align="left" style="width:45%;padding-top:9px;font-family:Consolas,Menlo,monospace;font-size:10px;color:#B4A98F;text-align:left;">FIN.</td><td width="55%" align="right" style="width:55%;padding-top:9px;font-family:Consolas,Menlo,monospace;font-size:10px;color:#B4A98F;text-align:right;white-space:nowrap;">CA POST · ${turnsCount} LETTERS</td></tr></tbody></table></div></div></div>`;
    } else {
      const themeLabel = DC_LOG_THEMES[logTheme]?.label || logTheme;
      const chapter = toLogHanjaNumber(1 + (toStringValue(normalized.body).length % 12));
      const roleTurn = (turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 17px;"><tbody><tr><td style="padding:0 0 7px;color:${turn.accent};font-size:10px;font-weight:900;">${turn.role}</td></tr><tr><td align="left" style="padding:13px 15px;border-${turn.isUser ? 'right' : 'left'}:3px solid ${turn.accent};border-top:1px solid ${palette.line};border-bottom:1px solid ${palette.line};color:${palette.text};text-align:left;">${turn.body}</td></tr></tbody></table>`;
      const roleTurnWithoutDivider = (turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 17px;"><tbody><tr><td style="padding:0 0 7px;color:${turn.accent};font-size:10px;font-weight:900;">${turn.role}</td></tr><tr><td align="left" style="padding:13px 15px;border-${turn.isUser ? 'right' : 'left'}:3px solid ${turn.accent};color:${palette.text};text-align:left;">${turn.body}</td></tr></tbody></table>`;
      const plainRoleTurn = (turn, isLast = false, gap = 25) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 ${isLast ? '0' : `${gap}px`};"><tbody><tr><td align="${turn.isUser ? 'right' : 'left'}" style="padding:0 2px 7px;color:${turn.accent};font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:10px;font-weight:900;letter-spacing:.16em;text-align:${turn.isUser ? 'right' : 'left'};">${turn.role}</td></tr><tr><td align="left" style="padding:0 2px;color:${palette.text};text-align:left;vertical-align:top;">${turn.body}</td></tr></tbody></table>`;
      const makganRoleTurn = (turn) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 17px;"><tbody><tr><td width="78" align="right" nowrap="nowrap" style="width:78px;padding:3px 14px 0 0;color:${turn.accent};font-size:10px;font-weight:900;text-align:right;white-space:nowrap;vertical-align:top;">${turn.role}</td><td align="left" style="padding:0 0 0 14px;border-left:1px solid ${palette.line};color:${palette.text};text-align:left;vertical-align:top;">${turn.body}</td></tr></tbody></table>`;
      const metaParts = [ref ? `REF ${ref}` : '', dateText].filter(Boolean);
      const metaLine = metaParts.length ? `<div align="center" style="margin-top:12px;color:${palette.accent};font-size:9.5px;letter-spacing:.08em;text-align:center;">${metaParts.join(' · ')}</div>` : '';

      if (layoutKey === 'gwedo') {
        const turns = turnRows.map((turn, index) => plainRoleTurn(turn, index === turnRows.length - 1, 27)).join('');
        inner = `<div style="border:1px solid ${palette.line};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:34px 24px 25px;text-align:center;"><div style="font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:9px;font-weight:700;letter-spacing:.3em;color:${palette.accent};">ORBITAL LOG</div><div style="margin-top:15px;">${renderLogDiamondRule(palette.accent, palette.line, 200, '◆')}</div><div style="margin-top:18px;font-size:26px;font-weight:900;line-height:1.5;color:${palette.title};">${title}</div>${tagText ? `<div style="margin-top:8px;font-size:11px;color:${palette.accent};">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:8px 32px 29px;">${turns}<div style="margin-top:31px;">${renderLogDiamondRule(palette.accent, palette.line, 116, '◆')}</div>${metaLine}</div></div>`;
      } else if (layoutKey === 'heugyo') {
        const turns = turnRows.map((turn, index) => plainRoleTurn(turn, index === turnRows.length - 1, 25)).join('');
        inner = `<div style="border:1px solid ${palette.line};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid ${palette.line};"><tbody><tr><td width="64" align="center" valign="middle" style="width:64px;padding:27px 4px 23px;text-align:center;vertical-align:middle;color:${palette.title};font-size:29px;line-height:1;">◆</td><td align="left" style="padding:27px 24px 23px 7px;text-align:left;vertical-align:middle;"><div style="font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:9px;letter-spacing:.24em;color:${palette.accent};">OBSIDIAN RECORD</div><div style="margin-top:8px;font-size:27px;font-weight:900;line-height:1.45;color:${palette.title};">${title}</div>${tagText ? `<div style="margin-top:7px;font-size:11px;color:${palette.accent};">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:27px 31px 29px;">${turns}<div style="margin-top:30px;">${renderLogDiamondRule(palette.dialogue, palette.line, 92, '◆')}</div>${metaLine}</div></div>`;
      } else if (layoutKey === 'cheongin') {
        const turns = turnRows.map((turn, index) => plainRoleTurn(turn, index === turnRows.length - 1, 25)).join('');
        inner = `<div style="border:1px solid ${palette.line};border-top:5px solid ${palette.accent};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:31px 24px 24px;text-align:center;">${renderCheonginGlyphMark(palette.accent, palette.line)}<div style="margin-top:14px;font-size:26px;font-weight:900;line-height:1.5;color:${palette.title};">${title}</div>${tagText ? `<div style="margin-top:8px;font-size:11px;color:${palette.accent};">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:7px 31px 28px;">${turns}<div align="center" style="margin-top:30px;text-align:center;">${renderCheonginGlyphMark(palette.accent, palette.line, true)}</div>${metaLine}</div></div>`;
      } else if (layoutKey === 'yeobaek') {
        const turns = turnRows.map((turn, index) => plainRoleTurn(turn, index === turnRows.length - 1, 29)).join('');
        inner = `<div style="border:1px solid ${palette.line};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="left" style="padding:38px 38px 28px;text-align:left;"><div style="font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:9px;letter-spacing:.34em;color:${palette.accent};">LOG</div><div style="margin-top:14px;font-size:29px;font-weight:900;line-height:1.45;color:${palette.title};">${title}</div>${tagText ? `<div style="margin-top:8px;font-size:11px;color:${palette.accent};">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:0 38px 35px;">${turns}<table width="44" cellpadding="0" cellspacing="0" border="0" align="center" style="width:44px;border-collapse:collapse;table-layout:fixed;margin:35px auto 0;"><tbody><tr><td height="1" bgcolor="${palette.line}" style="height:1px;padding:0;background-color:${palette.line};font-size:0;line-height:0;">&#8203;</td></tr></tbody></table>${metaLine}</div></div>`;
      } else if (layoutKey === 'muji') {
        const turns = turnRows.map((turn, index) => `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 ${index === turnRows.length - 1 ? '0' : '23px'};"><tbody><tr><td width="58" align="right" valign="top" nowrap="nowrap" style="width:58px;padding:4px 10px 0 0;color:${turn.accent};font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:10px;font-weight:900;letter-spacing:.08em;text-align:right;vertical-align:top;white-space:nowrap;">${turn.role} ·</td><td align="left" valign="top" style="padding:0;color:${palette.text};text-align:left;vertical-align:top;">${turn.body}</td></tr></tbody></table>`).join('');
        inner = `<div style="border:1px solid ${palette.line};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:38px 28px 29px;text-align:center;"><div style="font-size:23px;font-weight:900;line-height:1.5;color:${palette.title};">${title}</div>${tagText ? `<div style="margin-top:8px;font-size:11px;color:${palette.accent};">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:0 35px 33px;">${turns}<div style="margin-top:31px;text-align:center;font-family:DotumChe,'돋움체',Dotum,'돋움',monospace;font-size:10px;letter-spacing:.22em;color:${palette.accent};">끝</div>${metaLine}</div></div>`;
      } else {
        let turns = '';
        let headLabel = themeLabel;
        let outerStyle = `border:1px solid ${palette.line};`;
        let headerRule = `border-bottom:1px solid ${palette.line};`;
        let footerRule = `border-top:1px solid ${palette.line};`;
        let footer = 'END';
        if (layoutKey === 'baekjimeok') { turns = turnRows.map(roleTurn).join(''); outerStyle = `border-top:4px double ${palette.line};border-bottom:4px double ${palette.line};`; headLabel='BOOK LOG'; footer='— FIN —'; }
        else if (layoutKey === 'simya') { turns = turnRows.map(roleTurn).join(''); outerStyle=`border-left:8px solid ${palette.accent};border-right:1px solid ${palette.line};`; headLabel='MIDNIGHT RECORD'; footer='FIN'; }
        else if (layoutKey === 'yeonji') { turns = turnRows.map((t,i)=>roleTurn(t)+(i<turnRows.length-1?`<div style="text-align:center;color:${palette.line};margin:13px 0;">❀</div>`:'')).join(''); headLabel=`第 ${chapter} 章`; footer='❀ 終 ❀'; }
        else if (layoutKey === 'cheongram') { turns = turnRows.map(roleTurn).join(''); outerStyle=`border:1px solid ${palette.line};border-top:3px solid ${palette.accent};`; headLabel='LOG / RECORD'; footer='END OF RECORD'; }
        else if (layoutKey === 'wongo') { turns = turnRows.map(roleTurnWithoutDivider).join(''); outerStyle=`border-top:2px dashed ${palette.line};border-bottom:2px dashed ${palette.line};`; headLabel='✎ MANUSCRIPT'; footer='校了'; }
        else if (layoutKey === 'silentfilm') { turns = turnRows.map((t)=>`<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.bg}" style="width:100%;border-collapse:collapse;border:1px solid ${palette.line};margin:0 0 16px;background-color:${palette.bg};color:${palette.text};"><tbody><tr><td align="center" bgcolor="${palette.bg}" style="padding:7px;background-color:${palette.bg};color:${t.accent};font-size:10px;font-weight:900;">${t.role}</td></tr><tr><td align="left" bgcolor="${palette.bg}" style="padding:13px 15px;background-color:${palette.bg};color:${palette.text};text-align:left;">${t.body}</td></tr></tbody></table>`).join(''); outerStyle=`padding:9px;border:3px double ${palette.line};`; headLabel='SILENT PICTURE'; footer='◦◦◦'; }
        else if (layoutKey === 'tajeon') { turns = turnRows.map(roleTurnWithoutDivider).join(''); outerStyle=`border:2px dashed ${palette.line};`; headLabel='TRANSMISSION'; footer='=== STOP ==='; }
        else if (layoutKey === 'seongjwa') { turns = turnRows.map((t,i)=>plainRoleTurn(t, true)+(i<turnRows.length-1?`<div style="text-align:center;color:${palette.line};margin:13px 0;">✦───✧───✦</div>`:'')).join(''); outerStyle='border:0;'; headerRule=''; footerRule=''; headLabel='˚✦˚ CONSTELLATION LOG'; footer='✦ ✦ ✦'; }
        else if (layoutKey === 'makgan') { turns = turnRows.map(makganRoleTurn).join(''); outerStyle=`border-top:3px solid ${palette.accent};border-bottom:3px solid ${palette.accent};`; headLabel='ACT Ⅱ'; footer='CURTAIN'; }
        else { turns = turnRows.map(roleTurn).join(''); }
        const bodyPadding = layoutKey === 'makgan' ? '20px 20px 20px 18px' : '20px';
        inner = `<div style="${outerStyle}"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;${headerRule}"><tbody><tr><td align="center" style="padding:28px 22px 20px;"><div align="center" style="font-size:10px;color:${palette.accent};text-align:center;">${headLabel}</div><div align="center" style="margin-top:10px;font-size:27px;font-weight:900;color:${palette.title};text-align:center;">${title}</div>${tagText ? `<div align="center" style="margin-top:8px;font-size:11px;color:${palette.accent};text-align:center;">${tagText}</div>` : ''}</td></tr></tbody></table><div style="padding:${bodyPadding};">${turns}<div style="${footerRule}padding-top:11px;text-align:center;font-size:10px;color:${palette.accent};">${footer}</div></div></div>`;
      }
    }

    const baseBg = palette.bg;
    const baseFg = palette.fg || palette.text;
    const baseBorder = palette.border || palette.line;
    const baseOuterRule = layoutKey === 'seongjwa' ? 'border:0;' : `border:1px solid ${baseBorder};`;
    const html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:${font.family};line-height:1.9;"><tbody><tr><td align="left" style="padding:0;text-align:left;"><table width="100%" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="${baseBg}" style="width:100%;max-width:${pageWidth}px;margin:0 auto;border-collapse:collapse;table-layout:fixed;background-color:${baseBg};color:${baseFg};${baseOuterRule}text-align:left;"><tbody><tr><td style="padding:0;overflow-wrap:break-word;word-break:keep-all;">${inner}</td></tr></tbody></table></td></tr></tbody></table>`;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return html.trim();
    if (options.excludeImages) root.querySelectorAll('img').forEach((node) => node.remove());
    if (options.excludeCodeBlocks) root.querySelectorAll('pre').forEach((node) => node.remove());
    if (options.excludeComments) removeHTMLCommentNodes(root);
    stabilizeDCSelectedFont(root, font.family);
    stabilizeDCAlignment(root);
    if (options.forceWordWrap !== false) wrapDCWordsNoBreak(root); else stripDCWordJoiners(root);
    return root.outerHTML;
  }


  // OOC DC 문서 키는 DC_EXPORT_STYLES.ooc를 단일 레지스트리로 사용한다.
  // 팔레트와 실제 렌더러는 아래에서 같은 키를 공유한다.

  const DC_DOC_PALETTES = Object.freeze({
    specsheet: {
      fg: '#161513', bg: '#F5F5F1', paper: '#FBFBF8', accent: '#161513',
      border: '#161513', muted: '#57544D', italic: '#57544D', chip: '#E6E5E0',
      codeBg: '#20201e', codeFg: '#f3f1ea', font: "Arial,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    gwedo: {
      fg: '#201F1C', bg: '#FAFAF8', paper: '#FAFAF8', accent: '#201F1C',
      border: '#E4E2DC', muted: '#77746C', italic: '#77746C', chip: '#F0EFEB',
      codeBg: '#F2F1ED', codeFg: '#201F1C', font: "Arial,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    muji: {
      fg: '#3A362E', bg: '#F8F5EF', paper: '#F8F5EF', accent: '#7A6A50',
      border: '#E5E0D4', muted: '#9A6A54', italic: '#8B715F', chip: '#F0EBE1',
      codeBg: '#F1ECE3', codeFg: '#3A362E', font: "Batang,'바탕','AppleMyungjo','Malgun Gothic',serif",
    },
    yeobaek: {
      fg: '#262521', bg: '#FCFBF7', paper: '#FCFBF7', accent: '#9C988C',
      border: '#E0DDD3', muted: '#9C988C', italic: '#7D796F', chip: '#F3F1EB',
      codeBg: '#F4F2ED', codeFg: '#262521', font: "Arial,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif",
    },
    baekjimeok: {
      fg: '#2B2A26', bg: '#FAF8F2', paper: '#FAF8F2', accent: '#9A8F75',
      border: '#B5A98C', muted: '#6E6350', italic: '#6E6350', chip: '#F0EBDD',
      codeBg: '#F1ECDD', codeFg: '#2B2A26', font: "Batang,'바탕','AppleMyungjo','Malgun Gothic',serif",
    },
    newspaper: {
      fg: '#1c1a15', bg: '#f3efe1', paper: '#faf7ea', accent: '#7b2424',
      border: '#c6bfa8', muted: '#5c574a', italic: '#6b6455', chip: '#e8e2cf',
      codeBg: '#eae4d0', codeFg: '#1c1a15', font: "Batang,'바탕','AppleMyungjo','Malgun Gothic',serif",
    },
    diagnosis: {
      fg: '#22211d', bg: '#f4f5f6', paper: '#ffffff', accent: '#33404e',
      border: '#9aa0a8', muted: '#66707c', italic: '#5c6470', chip: '#eef0f3',
      codeBg: '#eef0f3', codeFg: '#22211d', font: "Batang,'바탕','AppleMyungjo','Malgun Gothic',serif",
    },
    dossier: {
      fg: '#26241f', bg: '#ece9df', paper: '#f7f4ea', accent: '#9d2b20',
      border: '#aaa594', muted: '#6b675a', italic: '#7f796b', chip: '#e2ddce',
      codeBg: '#e6e1d2', codeFg: '#26241f', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    receipt: {
      fg: '#26241f', bg: '#f4f3ee', paper: '#fdfdfa', accent: '#26241f',
      border: '#d3d0c6', muted: '#77746a', italic: '#77746a', chip: '#efede4',
      codeBg: '#f1efe6', codeFg: '#26241f', font: "Consolas,Menlo,'Courier New','Malgun Gothic',monospace",
    },
    airmail: {
      fg: '#3A342B', bg: '#FBF6EA', paper: '#FFFDF6', accent: '#34508C',
      border: '#D9CDB4', muted: '#8C8270', italic: '#8C8270', chip: '#EEF1F6',
      codeBg: '#F4EEE2', codeFg: '#3A342B', font: "'Gowun Batang',Batang,'바탕','AppleMyungjo',serif",
    },
    library: {
      fg: '#3A3222', bg: '#EFE6C8', paper: '#FBF4DC', accent: '#A5372D',
      border: '#D5C79E', muted: '#8A7C5E', italic: '#8A7C5E', chip: '#F1E7C9',
      codeBg: '#F2EBD4', codeFg: '#3A3222', font: "Batang,'바탕','Malgun Gothic',serif",
    },
    onair: {
      fg: '#D9DCE8', bg: '#0B101D', paper: '#131A2C', accent: '#E8B25A',
      border: '#2A3550', muted: '#7C86A0', italic: '#9AA4C0', chip: '#1B2340',
      codeBg: '#0F1526', codeFg: '#D9DCE8', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    quest: {
      fg: '#D0CABB', bg: '#0E1118', paper: '#151923', accent: '#C4A96A',
      border: '#363C50', muted: '#7D8398', italic: '#A49D8A', chip: '#202535',
      codeBg: '#0D1017', codeFg: '#D0CABB', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    midnight: {
      fg: '#CCC4B1', bg: '#070708', paper: '#141311', accent: '#A63A31',
      border: '#3B372F', muted: '#8E8779', italic: '#A09889', chip: '#1C1A17',
      codeBg: '#0D0C0B', codeFg: '#CCC4B1', font: "DotumChe,'돋움체',Dotum,'돋움',monospace",
    },
    timeline: {
      fg: '#0F1419', bg: '#EFF3F4', paper: '#FFFFFF', accent: '#1D9BF0',
      border: '#E1E8ED', muted: '#536471', italic: '#536471', chip: '#F7F9F9',
      codeBg: '#F7F9F9', codeFg: '#0F1419', font: "Dotum,'돋움','Malgun Gothic','Apple SD Gothic Neo',sans-serif",
    },
    board: {
      fg: '#333333', bg: '#F4F4F4', paper: '#FFFFFF', accent: '#3B4890',
      border: '#D5D7DE', muted: '#777777', italic: '#666666', chip: '#F5F6F8',
      codeBg: '#F5F6F8', codeFg: '#333333', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    wiki: {
      fg: '#212529', bg: '#E9EBEE', paper: '#FFFFFF', accent: '#00A495',
      border: '#D5D9DD', muted: '#6E7880', italic: '#555C62', chip: '#F4F6F7',
      codeBg: '#F4F6F7', codeFg: '#212529', font: "Dotum,'돋움','Malgun Gothic','Apple SD Gothic Neo',sans-serif",
    },
    messenger: {
      fg: '#1F1F1F', bg: '#B2C7D9', paper: '#B2C7D9', accent: '#4A6E8C',
      border: '#9DB4C7', muted: '#5B7284', italic: '#6E828F', chip: '#F2F4F6',
      codeBg: '#F1F3F5', codeFg: '#1F1F1F', font: "Dotum,'돋움','Malgun Gothic','Apple SD Gothic Neo',sans-serif",
    },
    livechat: {
      fg: '#DFE2E6', bg: '#0A0A0B', paper: '#141517', accent: '#00FFA3',
      border: '#2E3033', muted: '#848890', italic: '#A8ADB5', chip: '#1A1B1E',
      codeBg: '#0A0A0B', codeFg: '#DFE2E6', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    riftchat: {
      fg: '#D8CFA8', bg: '#0E1114', paper: '#15181B', accent: '#C8AA6E',
      border: '#2A2D31', muted: '#8A937F', italic: '#A09B84', chip: '#1B1E22',
      codeBg: '#1A1D20', codeFg: '#D8CFA8', font: "Dotum,'돋움','Malgun Gothic',sans-serif",
    },
    diary: {
      fg: '#20252A', bg: '#EDF0F3', paper: '#FFFFFF', accent: '#536C7C',
      border: '#CED4DA', muted: '#7A858E', italic: '#66727B', chip: '#F3F5F7',
      codeBg: '#F1F3F5', codeFg: '#20252A', font: "Dotum,'돋움','Malgun Gothic','Apple SD Gothic Neo',sans-serif",
    },
  });

  function normalizeDCDocTemplate(value) {
    const text = toStringValue(value).trim().toLocaleLowerCase();
    if (text === 'none') return 'specsheet';
    if (text === 'stream') return 'livechat';
    return Object.prototype.hasOwnProperty.call(DC_EXPORT_STYLES.ooc, text) ? text : 'specsheet';
  }


  function makeDCDocCode(card, length = 8) {
    const normalized = normalizeCard(card);
    const compact = normalized.id.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const fallback = String(normalized.createdAt || nowMs());
    return (compact || fallback).slice(-Math.max(4, length)).padStart(Math.max(4, length), '0');
  }

  function appendDCStyle(el, styleObj) {
    if (!el) return;
    const next = styleToString(styleObj);
    if (!next) return;
    const prev = toStringValue(el.getAttribute('style')).trim().replace(/;+$/g, '');
    el.setAttribute('style', prev ? `${prev};${next}` : next);
  }

  function tuneDCDocBody(root, templateKey, palette) {
    if (!root) return;
    const all = (selector) => [...root.querySelectorAll(selector)];

    if (templateKey === 'specsheet') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '14px', 'line-height': '1.85', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '17px', 'line-height': '1.5', margin: '15px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('pre').forEach((el) => appendDCStyle(el, { padding: '10px', 'font-size': '12px', 'line-height': '1.6' }));
      all('table').forEach((el) => appendDCStyle(el, { margin: '9px 0', 'font-size': '12.5px' }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12.5px', padding: '6px 8px' }));
    } else if (['gwedo', 'muji', 'yeobaek', 'baekjimeok'].includes(templateKey)) {
      const bodyConfig = {
        gwedo: { size: '14px', line: '1.95', heading: '16.5px' },
        muji: { size: '14px', line: '1.9', heading: '16.5px' },
        yeobaek: { size: '14px', line: '2.02', heading: '16px' },
        baekjimeok: { size: '14px', line: '1.98', heading: '16.5px' },
      }[templateKey];
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': bodyConfig.size, 'line-height': bodyConfig.line, margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': bodyConfig.heading, 'line-height': '1.55', margin: '16px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('table').forEach((el) => appendDCStyle(el, { margin: '9px 0', 'font-size': '12.5px' }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12.5px', padding: '6px 8px' }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, 'border-left': `3px solid ${palette.accent}`, background: palette.chip,
      }));
    } else if (templateKey === 'newspaper') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '15px', 'line-height': '1.85', margin: '9px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        'font-size': '18px', 'line-height': '1.55', margin: '18px 0 8px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 5px 0', color: palette.fg,
      }));
    } else if (templateKey === 'diagnosis') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '13.5px', 'line-height': '1.8', margin: '8px 0' }));
      all('table').forEach((el) => appendDCStyle(el, { margin: '8px 0' }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12.5px', padding: '6px 8px' }));
    } else if (templateKey === 'dossier') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '13.5px', 'line-height': '1.82', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        'font-size': '16px', margin: '16px 0 7px 0', 'border-bottom': `1px solid ${palette.border}`,
      }));
    } else if (templateKey === 'airmail') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '14px', 'line-height': '2', margin: '7px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '16px', 'line-height': '1.6', margin: '13px 0 6px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
    } else if (templateKey === 'receipt') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '12px', 'line-height': '1.6', margin: '4px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '13px', 'line-height': '1.5', margin: '8px 0 4px 0',
        'border-bottom': `1px dashed ${palette.border}`, padding: '0 0 3px 0',
      }));
      all('table').forEach((el) => appendDCStyle(el, { margin: '6px 0', 'font-size': '11.5px' }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '11.5px', padding: '4px 5px' }));
      all('blockquote').forEach((el) => appendDCStyle(el, { padding: '6px 8px', margin: '6px 0', 'font-size': '11.5px' }));
    } else if (templateKey === 'library') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '13.5px', 'line-height': '1.85', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.accent, 'font-size': '16px', 'line-height': '1.55', margin: '15px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12.5px', padding: '6px 8px' }));
      all('pre').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'onair') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13.5px', 'line-height': '1.9', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.accent, 'font-size': '16px', 'line-height': '1.55', margin: '15px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('li,blockquote,td,th,span,em,strong,a').forEach((el) => appendDCStyle(el, { color: palette.fg }));
      all('blockquote').forEach((el) => appendDCStyle(el, { color: palette.italic, 'border-left': `3px solid ${palette.accent}`, background: palette.chip }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'quest') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13.5px', 'line-height': '1.98', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.accent, 'font-size': '16px', 'line-height': '1.55', margin: '15px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('li,blockquote,td,th,span,em,strong,a').forEach((el) => appendDCStyle(el, { color: palette.fg }));
      all('blockquote').forEach((el) => appendDCStyle(el, { color: palette.italic, 'border-left': `3px solid ${palette.accent}`, background: palette.chip }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'midnight') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13px', 'line-height': '2.02', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: '#EFE7D4', 'font-size': '16px', 'line-height': '1.55', margin: '15px 0 7px 0',
        'border-bottom': `1px solid ${palette.border}`, padding: '0 0 4px 0',
      }));
      all('li,blockquote,td,th,span,em,strong,a').forEach((el) => appendDCStyle(el, { color: palette.fg }));
      all('blockquote').forEach((el) => appendDCStyle(el, { color: palette.italic, 'border-left': `3px solid ${palette.accent}`, background: palette.chip }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'timeline') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '14.5px', 'line-height': '1.8', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '16px', 'line-height': '1.5', margin: '14px 0 6px 0', 'font-weight': '800',
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.muted, border: `1px solid ${palette.border}`,
        background: palette.chip, padding: '10px 14px', margin: '10px 0',
      }));
      all('a').forEach((el) => appendDCStyle(el, { color: palette.accent }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12.5px', padding: '6px 8px' }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'board') {
      all('p').forEach((el) => appendDCStyle(el, { 'font-size': '13.5px', 'line-height': '1.8', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.accent, 'font-size': '15px', 'line-height': '1.5', margin: '14px 0 7px 0',
        'border-left': `3px solid ${palette.accent}`, 'border-bottom': `1px solid ${palette.border}`, padding: '2px 0 3px 8px',
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: palette.chip, 'border-left': `3px solid ${palette.border}`, padding: '7px 11px', margin: '9px 0',
      }));
      all('a').forEach((el) => appendDCStyle(el, { color: palette.accent }));
      all('em,i').forEach((el) => appendDCStyle(el, { 'font-style': 'normal' }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12px', padding: '5px 7px' }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'wiki') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13.5px', 'line-height': '1.85', margin: '8px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => {
        appendDCStyle(el, {
          color: palette.fg, 'font-size': '15.5px', 'line-height': '1.5', margin: '16px 0 8px 0',
          'border-bottom': `1px solid ${palette.border}`, padding: '0 0 5px 0', 'font-weight': '600',
        });
        el.insertAdjacentHTML('beforeend', '&nbsp;<span style="font-size:10px;font-weight:400;color:#0275D8;">[편집]</span>');
      });
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: palette.chip, 'border-left': `4px solid ${palette.accent}`, padding: '9px 13px', margin: '10px 0',
      }));
      all('a').forEach((el) => appendDCStyle(el, { color: '#0275D8' }));
      all('em,i').forEach((el) => appendDCStyle(el, { 'font-style': 'normal', color: palette.italic }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12px', padding: '6px 8px' }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'messenger') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13.5px', 'line-height': '1.75', margin: '6px 0' }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '14.5px', 'line-height': '1.5', margin: '11px 0 5px 0', 'font-weight': '800',
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: '#F5F6F8', 'border-left': '3px solid #C3CFD9',
        padding: '8px 11px', margin: '8px 0',
      }));
      all('a').forEach((el) => appendDCStyle(el, { color: palette.accent }));
      all('em,i').forEach((el) => appendDCStyle(el, { 'font-style': 'normal', color: palette.italic }));
      all('th,td').forEach((el) => appendDCStyle(el, { 'font-size': '12px', padding: '5px 7px' }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'livechat') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '13px', 'line-height': '1.85', margin: '7px 0' }));
      all('li,td,th,span,strong,a').forEach((el) => appendDCStyle(el, { color: palette.fg }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.accent, 'font-size': '13.5px', 'line-height': '1.55', margin: '12px 0 6px 0', 'font-weight': '800',
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: '#1D1F22', 'border-left': `3px solid ${palette.accent}`, padding: '8px 11px', margin: '8px 0',
      }));
      all('em,i').forEach((el) => appendDCStyle(el, { 'font-style': 'normal', color: palette.italic }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'riftchat') {
      all('p').forEach((el) => appendDCStyle(el, { color: palette.fg, 'font-size': '12.5px', 'line-height': '1.82', margin: '6px 0' }));
      all('li,td,th,span,strong,a').forEach((el) => appendDCStyle(el, { color: palette.fg }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: '#F0B254', 'font-size': '12.5px', 'line-height': '1.6', margin: '10px 0 5px 0', 'font-weight': '800',
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: palette.codeBg, 'border-left': '3px solid #785A28', padding: '7px 10px', margin: '7px 0',
      }));
      all('em,i').forEach((el) => appendDCStyle(el, { 'font-style': 'normal', color: palette.italic }));
      all('pre,code').forEach((el) => appendDCStyle(el, { background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}` }));
    } else if (templateKey === 'diary') {
      all('p').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '14px', 'line-height': '1.95', margin: '9px 0',
      }));
      all('h1,h2,h3,h4,h5,h6').forEach((el) => appendDCStyle(el, {
        color: palette.fg, 'font-size': '15.5px', 'line-height': '1.55',
        margin: '17px 0 8px 0', padding: '0 0 0 9px',
        'border-left': `3px solid ${palette.accent}`,
      }));
      all('blockquote').forEach((el) => appendDCStyle(el, {
        color: palette.italic, background: palette.chip,
        'border-left': `3px solid ${palette.border}`, padding: '8px 11px', margin: '10px 0',
      }));
      all('em,i').forEach((el) => appendDCStyle(el, {
        'font-style': 'normal', color: palette.italic,
      }));
      all('table').forEach((el) => appendDCStyle(el, { margin: '10px 0' }));
      all('th,td').forEach((el) => appendDCStyle(el, {
        'font-size': '12.5px', padding: '6px 8px',
      }));
      all('pre,code').forEach((el) => appendDCStyle(el, {
        background: palette.codeBg, color: palette.codeFg, border: `1px solid ${palette.border}`,
      }));
    }
  }

  function renderDCDocBodyHTML(card, opts, palette, templateKey) {
    const preparedCard = prepareCardForDCRender(card, opts);
    const smart = opts.autoStructure !== false;
    const rawHTML = coaRenderCardBody(preparedCard, { smart, forceSmart: smart, preserveComments: true });
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${rawHTML}</div>`, 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    sanitizeForDC(root, opts);
    if (opts.excludeCodeBlocks) root.querySelectorAll('pre').forEach((node) => node.remove());
    if (opts.excludeComments) removeHTMLCommentNodes(root);
    applyDCInlineStyles(root, preparedCard, {
      ...opts,
      themeObject: palette,
      fontFamilyOverride: palette.font,
    });
    tuneDCDocBody(root, templateKey, palette);
    return root.innerHTML;
  }

  function wrapDCDocShell(innerHTML, palette, maxWidth) {
    // 바깥 페이지는 투명. 네모 문서 안쪽만 팔레트 배경을 칠한다.
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;color:${palette.fg};font-family:${palette.font};line-height:1.8;">
<tbody><tr><td align="center" style="padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${palette.paper}" style="width:100%;max-width:${maxWidth}px;border-collapse:collapse;table-layout:fixed;background-color:${palette.paper};color:${palette.fg};border:1px solid ${palette.border};">
<tbody><tr><td style="padding:0;overflow-wrap:break-word;word-break:keep-all;">${innerHTML}</td></tr></tbody>
</table>
</td></tr></tbody>
</table>`;
  }

  function coaToDCDocTemplateHTML(card, opts = {}) {
    const normalized = normalizeCard(card);
    const metaOptions = getExportMetaOptions(opts);
    const templateKey = normalizeDCDocTemplate(opts.docTemplate);
    const p = { ...DC_DOC_PALETTES[templateKey], font: getDCFont(opts.font || DC_DEFAULT_OPTIONS.font).family };
    const bodyHTML = renderDCDocBodyHTML(normalized, opts, p, templateKey);
    const title = escapeHTML(normalized.title);
    const dateText = metaOptions.showDate ? escapeHTML(formatDate(normalized.createdAt, false)) : '';
    const dateTimeText = metaOptions.showDate ? escapeHTML(formatDate(normalized.createdAt, true)) : '';
    const world = metaOptions.showTags ? escapeHTML(normalized.world || '') : '';
    const chars = metaOptions.showTags ? escapeHTML(normalized.characters.join(', ')) : '';
    const code = metaOptions.showReference ? escapeHTML(makeDCDocCode(normalized, 8)) : '';
    let inner = '';
    let maxWidth = 620;

    if (templateKey === 'specsheet') {
      maxWidth = 680;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const ref = metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : '';
      const specMetaLine = `${metaOptions.showTags ? (tags || '#미분류') + ' · ' : ''}OOC 1 CARD`;
      const specInfoRow = metaOptions.showDate
        ? `<tr><th bgcolor="${p.chip}" style="width:20%;border:1px solid ${p.border};background-color:${p.chip};padding:7px 8px;text-align:left;">TYPE</th><td style="border:1px solid ${p.border};padding:7px 8px;">OOC</td><th bgcolor="${p.chip}" style="width:20%;border:1px solid ${p.border};background-color:${p.chip};padding:7px 8px;text-align:left;">CREATED</th><td style="border:1px solid ${p.border};padding:7px 8px;">${dateText}</td></tr>`
        : `<tr><th bgcolor="${p.chip}" style="width:20%;border:1px solid ${p.border};background-color:${p.chip};padding:7px 8px;text-align:left;">TYPE</th><td style="border:1px solid ${p.border};padding:7px 8px;">OOC</td></tr>`;
      inner = `<div style="padding:16px;background-color:${p.bg};color:${p.fg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.bg}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.bg};border:2px solid ${p.border};"><tbody><tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.chip};border-bottom:2px solid ${p.border};"><tbody><tr><td style="padding:7px 12px;font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.14em;color:${p.muted};">${metaOptions.showReference ? `REF: ${ref}` : '&nbsp;'}</td><td align="right" style="padding:7px 12px;font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.14em;color:${p.muted};">OOC SPEC SHEET</td></tr></tbody></table><div style="padding:22px 22px 18px;border-bottom:2px solid ${p.border};"><div style="font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:.28em;color:${p.muted};">ARCHIVE DOCUMENT</div><div style="margin-top:9px;font-size:26px;font-weight:900;line-height:1.4;">${title}</div><div style="margin-top:9px;font-family:Consolas,Menlo,monospace;font-size:10.5px;color:${p.muted};">${specMetaLine}</div></div><div style="padding:19px 21px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:14px;font-family:Consolas,Menlo,monospace;font-size:10px;"><tbody>${specInfoRow}</tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td bgcolor="${p.fg}" style="padding:6px 10px;background-color:${p.fg};color:${p.paper};font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.16em;">CONTENT&nbsp;&nbsp;&nbsp;S-01</td></tr><tr><td style="padding:15px 17px;">${bodyHTML}</td></tr></tbody></table></div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.chip};border-top:2px solid ${p.border};"><tbody><tr><td style="padding:7px 12px;font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.15em;color:${p.muted};">END OF SHEET</td><td align="right" style="padding:7px 12px;font-family:Consolas,Menlo,monospace;font-size:10px;color:${p.muted};">1 CARD RECORDED</td></tr></tbody></table></td></tr></tbody></table></div>`;

    } else if (templateKey === 'gwedo') {
      maxWidth = 640;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const metaLine = [metaOptions.showDate ? dateText : '', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:31px 30px 27px;background-color:${p.paper};color:${p.fg};font-family:${p.font};border:1px solid ${p.border};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:0 0 22px;text-align:center;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:Consolas,Menlo,monospace;font-size:9px;font-weight:800;letter-spacing:.28em;color:${p.accent};">ORBITAL ARCHIVE</div><div style="margin-top:14px;">${renderLogDiamondRule(p.accent, p.border, 190, '◆')}</div><div style="margin-top:15px;font-size:25px;font-weight:900;line-height:1.5;color:${p.fg};">${title}</div>${tags ? `<div style="margin-top:8px;font-size:11px;color:${p.muted};">${tags}</div>` : ''}</td></tr></tbody></table><div style="padding:3px 4px 2px;">${bodyHTML}</div><div style="margin-top:27px;">${renderLogDiamondRule(p.accent, p.border, 104, '◆')}</div>${metaLine ? `<div style="margin-top:10px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9.5px;letter-spacing:.11em;color:${p.muted};">${metaLine}</div>` : ''}</div>`;
    } else if (templateKey === 'muji') {
      maxWidth = 620;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const metaLine = [metaOptions.showDate ? dateText : '', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:34px 32px 27px;background-color:${p.paper};color:${p.fg};font-family:${p.font};border:1px solid ${p.border};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:0 0 24px;text-align:center;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:Consolas,Menlo,monospace;font-size:9.5px;font-weight:800;letter-spacing:.28em;color:${p.accent};">OOC NOTE</div><div style="margin-top:10px;font-size:24px;font-weight:900;line-height:1.5;color:${p.fg};">${title}</div>${tags ? `<div style="margin-top:8px;font-size:11px;color:${p.muted};">${tags}</div>` : ''}</td></tr></tbody></table><div>${bodyHTML}</div><div style="margin-top:27px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:.2em;color:${p.accent};">끝</div>${metaLine ? `<div style="margin-top:8px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9.5px;letter-spacing:.11em;color:${p.muted};">${metaLine}</div>` : ''}</div>`;
    } else if (templateKey === 'yeobaek') {
      maxWidth = 640;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const metaLine = [metaOptions.showDate ? dateText : '', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:39px 38px 32px;background-color:${p.paper};color:${p.fg};font-family:${p.font};border:1px solid ${p.border};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="left" style="padding:0 0 25px;text-align:left;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:Consolas,Menlo,monospace;font-size:9px;font-weight:800;letter-spacing:.32em;color:${p.accent};">ARCHIVE NOTE</div><div style="margin-top:12px;font-size:27px;font-weight:900;line-height:1.5;color:${p.fg};">${title}</div>${tags ? `<div style="margin-top:8px;font-size:11px;color:${p.muted};">${tags}</div>` : ''}</td></tr></tbody></table><div>${bodyHTML}</div><table width="44" cellpadding="0" cellspacing="0" border="0" align="center" style="width:44px;border-collapse:collapse;table-layout:fixed;margin:31px auto 0;"><tbody><tr><td height="1" bgcolor="${p.border}" style="height:1px;padding:0;background-color:${p.border};font-size:0;line-height:0;">&#8203;</td></tr></tbody></table>${metaLine ? `<div style="margin-top:11px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9.5px;letter-spacing:.11em;color:${p.muted};">${metaLine}</div>` : ''}</div>`;
    } else if (templateKey === 'baekjimeok') {
      maxWidth = 640;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const metaLine = [metaOptions.showDate ? dateText : '', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:35px 32px 29px;background-color:${p.paper};color:${p.fg};font-family:${p.font};border-top:4px double ${p.border};border-bottom:4px double ${p.border};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td align="center" style="padding:0 0 24px;text-align:center;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:Consolas,Menlo,monospace;font-size:9.5px;font-weight:800;letter-spacing:.4em;color:${p.accent};">BOOK ARCHIVE</div><div style="margin-top:12px;font-size:25px;font-weight:900;line-height:1.5;color:${p.fg};">${title}</div>${tags ? `<div style="margin-top:8px;font-size:11px;color:${p.muted};">${tags}</div>` : ''}<div style="margin-top:17px;color:${p.accent};font-size:12px;">◆</div></td></tr></tbody></table><div>${bodyHTML}</div><div style="margin-top:29px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:.22em;color:${p.accent};">— FIN —</div>${metaLine ? `<div style="margin-top:8px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9.5px;letter-spacing:.11em;color:${p.muted};">${metaLine}</div>` : ''}</div>`;

    } else if (templateKey === 'newspaper') {
      maxWidth = 660;
      const keywords = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const issueLine = [metaOptions.showReference ? `제 ${code} 호` : '', metaOptions.showDate ? dateText : '', '호외'].filter(Boolean).join(' · ');
      inner = `<div style="padding:22px 20px 18px;color:${p.fg};font-family:${p.font};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border-bottom:4px double ${p.fg};table-layout:fixed;">
<tbody><tr><td align="center" style="padding:0 0 10px 0;text-align:center;overflow-wrap:break-word;word-break:keep-all;">
<div style="font-size:11px;color:${p.muted};text-align:center;">오늘의 기록 · 특별호</div>
<div style="font-size:32px;font-weight:900;line-height:1.3;margin:4px 0;text-align:center;">${world || '기 록 일 보'}</div>
<div style="font-size:11.5px;line-height:1.7;color:${p.muted};text-align:center;">${issueLine}</div>
</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid ${p.fg};"><tbody><tr><td align="center" style="padding:15px 0 11px;text-align:center;overflow-wrap:break-word;word-break:keep-all;">
<table cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" align="center" style="border-collapse:collapse;background-color:${p.chip};border:1px solid ${p.fg};margin:0 auto;"><tbody><tr><td align="center" style="padding:3px 9px;color:${p.fg};font-size:12px;font-weight:800;text-align:center;">속 보</td></tr></tbody></table>
<div style="margin:9px 0 0;color:${p.fg};font-size:26px;font-weight:900;line-height:1.4;text-align:center;">${title}</div>
</td></tr></tbody></table>
<div style="padding:12px 0 2px;text-align:justify;">${bodyHTML}</div>
${keywords ? `<div style="border-top:2px solid ${p.fg};margin-top:13px;padding-top:8px;color:${p.muted};font-size:11.5px;"><b>핵심어</b> · ${keywords}</div>` : ''}
</div>`;
    } else if (templateKey === 'diagnosis') {
      maxWidth = 610;
      const targetRow = metaOptions.showTags ? `<tr><th bgcolor="${p.chip}" style="width:22%;border:1px solid ${p.border};background-color:${p.chip};padding:7px 9px;font-weight:800;">대 상</th><td style="border:1px solid ${p.border};padding:7px 9px;">${chars || '미기재'}</td></tr>` : '';
      inner = `<div style="padding:13px;background-color:${p.bg};color:${p.fg};font-family:${p.font};">
<div style="padding:23px 22px 18px;background-color:${p.paper};border:2px solid ${p.accent};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:10px;"><tbody><tr><td align="center" style="padding:0;text-align:center;font-size:11px;line-height:1.7;color:${p.muted};overflow-wrap:break-word;word-break:keep-all;">기록용 서식${metaOptions.showReference ? `&nbsp;·&nbsp;발행번호&nbsp;${code}` : ''}</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:5px 0 19px;"><tbody><tr><td align="center" style="padding:0;text-align:center;color:${p.fg};font-size:29px;font-weight:900;line-height:1.4;">진 단 서</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:14px;"><tbody>
${targetRow}<tr><th bgcolor="${p.chip}" style="border:1px solid ${p.border};background-color:${p.chip};padding:7px 9px;font-weight:800;">진단명</th><td style="border:1px solid ${p.border};padding:7px 9px;"><b>${title}</b></td></tr>
</tbody></table>
<div style="border:1px solid ${p.border};padding:11px 13px;margin-bottom:16px;"><div style="font-size:12px;font-weight:800;color:${p.muted};margin-bottom:5px;">진단 및 관찰 소견</div>${bodyHTML}</div>
<p style="text-align:center;margin:16px 0 5px;font-size:13.5px;">위와 같이 기록함.</p>
${metaOptions.showDate ? `<p style="text-align:center;margin:0 0 15px;font-size:13.5px;">${dateText}</p>` : ''}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;"><tbody><tr>
<td align="right" style="padding:2px 10px 2px 0;vertical-align:middle;text-align:right;">기록 기관 : ${world || 'Crack Archive'}<br>담당 기록자 (인)</td>
<td width="56" align="center" valign="middle" style="width:56px;padding:0;vertical-align:middle;text-align:center;"><table width="46" height="46" cellpadding="0" cellspacing="0" border="0" align="center" style="width:46px;height:46px;border-collapse:collapse;table-layout:fixed;border:2px solid #b33a30;margin:0 auto;"><tbody><tr><td width="46" height="46" align="center" valign="middle" style="width:46px;height:46px;padding:0;color:#b33a30;font-weight:900;font-size:16px;line-height:1;text-align:center;vertical-align:middle;">認</td></tr></tbody></table></td>
</tr></tbody></table>
</div></div>`;
    } else if (templateKey === 'dossier') {
      maxWidth = 630;
      const dossierRows = [
        metaOptions.showReference ? `<tr><th bgcolor="${p.chip}" style="width:22%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 7px;font-weight:800;">관리번호</th><td colspan="3" style="border:1px solid ${p.border};padding:6px 7px;">${code}</td></tr>` : '',
        metaOptions.showDate ? `<tr><th bgcolor="${p.chip}" style="width:22%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 7px;font-weight:800;">작성일</th><td colspan="3" style="border:1px solid ${p.border};padding:6px 7px;">${dateText}</td></tr>` : '',
        metaOptions.showTags ? `<tr><th bgcolor="${p.chip}" style="width:22%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 7px;font-weight:800;">관련 인물</th><td colspan="3" style="border:1px solid ${p.border};padding:6px 7px;">${chars || '-'}</td></tr>` : '',
        `<tr><th bgcolor="${p.chip}" style="width:22%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 7px;font-weight:800;">열람등급</th><td colspan="3" style="border:1px solid ${p.border};padding:6px 7px;">Ⅱ급 이상</td></tr>`,
      ].join('');
      inner = `<div style="padding:21px;color:${p.fg};font-family:${p.font};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:13px;"><tbody><tr><td align="center" style="padding:0;text-align:center;vertical-align:top;overflow-wrap:break-word;word-break:keep-all;">
<div style="font-size:12px;line-height:1.7;color:${p.muted};text-align:center;">${world || '기록국 내부 문서'} · 제한 열람</div>
<div style="font-size:21px;font-weight:900;line-height:1.45;margin-top:4px;text-align:center;">${title}</div>
<table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;border:3px solid ${p.accent};margin:10px auto 0;"><tbody><tr><td align="center" style="padding:5px 8px;color:${p.accent};font-weight:900;font-size:15px;text-align:center;">대외비</td></tr></tbody></table>
</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:15px;"><tbody>${dossierRows}</tbody></table>
<div>${bodyHTML}</div>
<div style="border-top:1px dashed ${p.border};margin-top:16px;padding-top:9px;color:${p.italic};font-size:11.5px;text-align:center;">무단 복제 및 외부 반출 금지 · 열람 후 지정 위치에 반환</div>
</div>`;
    } else if (templateKey === 'airmail') {
      maxWidth = 640;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      inner = `<div style="padding:10px;background-color:#B23A34;color:${p.fg};font-family:${p.font};"><div style="padding:10px;background-color:#34508C;"><div style="padding:22px 20px;background-color:${p.bg};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid ${p.border};margin-bottom:19px;"><tbody><tr><td style="padding:0 10px 16px 0;vertical-align:top;"><div style="font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.2em;color:${p.accent};">PAR AVION · VIA AIR MAIL</div><div style="margin-top:9px;font-size:24px;font-weight:900;line-height:1.45;color:${p.fg};">${title}</div><div style="margin-top:8px;font-size:11.5px;color:${p.muted};">${metaOptions.showTags ? `${tags || 'OOC ARCHIVE'} · ` : ''}편지 1통</div></td><td width="84" align="center" style="width:84px;padding:0 0 16px 4px;text-align:center;vertical-align:top;">${renderDCAirmailStamp(dateText, { width:70, accent:p.accent, chip:p.chip, star:'#B23A34', muted:p.muted, showDate:metaOptions.showDate })}</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td style="padding:17px 18px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:12px;"><tbody><tr><td style="font-family:Consolas,Menlo,monospace;font-size:10px;font-weight:800;letter-spacing:.15em;color:#B23A34;">FROM : OOC</td><td align="right" style="font-family:Consolas,Menlo,monospace;font-size:10px;color:${p.muted};">№ 01</td></tr></tbody></table><div>${bodyHTML}</div></td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid ${p.border};margin-top:20px;"><tbody><tr><td width="50%" align="left" style="width:50%;padding-top:10px;font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:.2em;color:${p.muted};text-align:left;">FIN.</td><td width="50%" align="right" style="width:50%;padding-top:10px;font-family:Consolas,Menlo,monospace;font-size:10px;letter-spacing:.15em;color:${p.muted};text-align:right;white-space:nowrap;">CA POST · 1 LETTER</td></tr></tbody></table></div></div></div>`;
    } else if (templateKey === 'receipt') {
      maxWidth = 380;
      const receiptTags = metaOptions.showTags ? [world, chars].filter(Boolean).join(' · ') : '';
      const receiptMeta = [receiptTags, metaOptions.showDate ? dateTimeText : '', metaOptions.showReference ? `NO.${code}` : ''].filter(Boolean).join('<br>');
      const receiptBarcode = metaOptions.showReference ? `<div style="text-align:center;margin-top:9px;font-size:18px;color:${p.fg};">|||| ||| |||||| || |||||</div><div style="text-align:center;font-size:10px;color:${p.muted};">${code}</div>` : '';
      inner = `<div style="padding:19px 17px;color:${p.fg};font-family:${p.font};font-size:12.5px;line-height:1.65;">
<div style="text-align:center;"><div style="font-size:18px;font-weight:900;line-height:1.4;">${title}</div>${receiptMeta ? `<div style="font-size:11px;color:${p.muted};margin-top:3px;">${receiptMeta}</div>` : ''}</div>
<div style="border-top:1px dashed #8f8c80;margin:11px 0;"></div>
<div>${bodyHTML}</div>
<div style="border-top:1px dashed #8f8c80;margin:11px 0;"></div>
${receiptBarcode}
</div>`;
    } else if (templateKey === 'library') {
      maxWidth = 560;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const libraryMeta = [metaOptions.showReference ? `CARD NO. ${code}` : '', metaOptions.showTags ? tags : ''].filter(Boolean).join(' · ');
      const dueTable = metaOptions.showDate ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:16px 0 18px;font-size:11px;"><tbody>
<tr><th bgcolor="${p.chip}" style="width:50%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;font-weight:800;letter-spacing:.16em;color:${p.muted};text-align:center;">DATE DUE</th><th bgcolor="${p.chip}" style="border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;font-weight:800;letter-spacing:.16em;color:${p.muted};text-align:center;">STATUS</th></tr>
<tr><td align="center" style="height:30px;border:1px solid ${p.border};padding:5px 8px;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;border:2px solid ${p.accent};margin:0 auto;"><tbody><tr><td align="center" style="padding:2px 9px;color:${p.accent};font-weight:900;font-size:11px;letter-spacing:.1em;text-align:center;">${dateText}</td></tr></tbody></table></td><td align="center" style="border:1px solid ${p.border};padding:5px 8px;text-align:center;color:${p.muted};letter-spacing:.14em;">IN ARCHIVE</td></tr>
</tbody></table>` : '';
      inner = `<div style="padding:22px 24px 20px;background-color:${p.paper};color:${p.fg};font-family:${p.font};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:3px double ${p.accent};"><tbody><tr><td align="center" style="padding:0 0 14px;text-align:center;overflow-wrap:break-word;word-break:keep-all;">
<div style="font-size:10.5px;letter-spacing:.3em;color:${p.muted};text-align:center;">ARCHIVE LIBRARY</div>
<div style="margin-top:8px;font-size:23px;font-weight:900;line-height:1.45;color:${p.fg};text-align:center;">${title}</div>
${libraryMeta ? `<div style="margin-top:7px;font-size:11px;color:${p.muted};text-align:center;">${libraryMeta}</div>` : ''}
</td></tr></tbody></table>
${dueTable}
<div>${bodyHTML}</div>
<div style="border-top:1px solid ${p.border};margin-top:17px;padding-top:9px;color:${p.muted};font-size:10px;letter-spacing:.16em;text-align:center;">KEEP THIS CARD IN THE BOOK POCKET</div>
</div>`;
    } else if (templateKey === 'onair') {
      maxWidth = 620;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const cueTable = metaOptions.showDate
        ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:14px;font-size:10.5px;"><tbody><tr><th bgcolor="${p.chip}" style="width:18%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;color:${p.muted};font-weight:800;text-align:left;">CUE</th><td style="border:1px solid ${p.border};padding:6px 8px;color:${p.fg};">Q-01</td><th bgcolor="${p.chip}" style="width:18%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;color:${p.muted};font-weight:800;text-align:left;">TIME</th><td style="border:1px solid ${p.border};padding:6px 8px;color:${p.fg};">${dateTimeText}</td></tr></tbody></table>`
        : `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:14px;font-size:10.5px;"><tbody><tr><th bgcolor="${p.chip}" style="width:24%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;color:${p.muted};font-weight:800;text-align:left;">CUE</th><td style="border:1px solid ${p.border};padding:6px 8px;color:${p.fg};">Q-01</td></tr></tbody></table>`;
      inner = `<div style="padding:0;background-color:${p.paper};color:${p.fg};font-family:${p.font};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.codeBg}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.codeBg};border-bottom:1px solid ${p.border};"><tbody><tr>
<td style="padding:9px 14px;"><table cellpadding="0" cellspacing="0" border="0" bgcolor="#C24A3F" style="border-collapse:collapse;background-color:#C24A3F;"><tbody><tr><td align="center" style="padding:4px 11px;color:#FFF4EF;font-size:10px;font-weight:900;letter-spacing:.2em;text-align:center;">● ON AIR</td></tr></tbody></table></td>
<td align="right" style="padding:9px 14px;font-size:10px;letter-spacing:.16em;color:${p.muted};text-align:right;">MIDNIGHT FREQUENCY</td>
</tr></tbody></table>
<div style="padding:20px 20px 16px;border-bottom:1px solid ${p.border};">
<div style="font-size:10px;letter-spacing:.26em;color:${p.accent};">TONIGHT'S CUE SHEET</div>
<div style="margin-top:9px;font-size:23px;font-weight:900;line-height:1.45;color:#F2E9D8;">${title}</div>
${metaOptions.showTags ? `<div style="margin-top:8px;font-size:11.5px;color:${p.muted};">${tags || 'OOC ARCHIVE'}</div>` : ''}
</div>
<div style="padding:17px 18px 20px;">
${cueTable}
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.codeBg}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.codeBg};border:1px solid ${p.border};border-left:3px solid ${p.accent};"><tbody><tr><td style="padding:14px 16px;color:${p.fg};">${bodyHTML}</td></tr></tbody></table>
<div style="margin-top:16px;text-align:center;font-size:10px;letter-spacing:.26em;color:${p.muted};">— SIGNAL ENDS · STAY TUNED —</div>
</div>
</div>`;
    } else if (templateKey === 'quest') {
      maxWidth = 620;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const questBadgeValues = [
        metaOptions.showReference ? `QUEST ${code}` : '',
        metaOptions.showDate ? dateText : '',
      ].filter(Boolean);
      const questBadges = questBadgeValues.map((value, index) => `${index ? '<td style="width:6px;"></td>' : ''}<td style="padding:4px 11px;border:1px solid ${p.accent};color:#D9CFA8;font-size:10.5px;white-space:nowrap;">${value}</td>`).join('');
      inner = `<div style="padding:1px;background-color:#8A784F;color:${p.fg};font-family:${p.font};"><div style="padding:3px;background-color:${p.paper};"><div style="border:1px solid ${p.border};padding:22px 24px 21px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:9.5px;letter-spacing:.18em;color:${p.muted};"><tbody><tr><td style="padding:0;text-align:left;">QUEST JOURNAL</td><td align="right" style="padding:0;text-align:right;">${metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : 'TRACKING ACTIVE'}</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px;border-bottom:1px solid ${p.border};"><tbody><tr><td align="center" style="padding:0 0 18px;text-align:center;overflow-wrap:break-word;word-break:keep-all;">
<div style="font-size:10px;font-weight:800;letter-spacing:.36em;color:${p.accent};text-align:center;">◆&nbsp;&nbsp;MAIN QUEST&nbsp;&nbsp;◆</div>
<div style="margin-top:11px;font-size:23px;font-weight:900;line-height:1.5;color:#EFE8D5;text-align:center;">${title}</div>
${metaOptions.showTags ? `<div style="margin-top:8px;font-size:11px;color:${p.muted};text-align:center;">표식 · ${tags || '#OOC'}</div>` : ''}
</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:18px;"><tbody><tr><td style="padding:2px 3px 2px 15px;border-left:2px solid ${p.accent};color:${p.fg};">${bodyHTML}</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid ${p.border};margin-top:19px;"><tbody><tr><td style="padding:12px 0 0;font-size:9.5px;letter-spacing:.25em;color:${p.muted};">OBJECTIVE SAVED</td><td align="right" style="padding:12px 0 0;text-align:right;font-size:9px;letter-spacing:.16em;color:${p.muted};">OOC ARCHIVE</td></tr></tbody></table>
${questBadges ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;margin-top:9px;"><tbody><tr>${questBadges}</tr></tbody></table>` : ''}
</div></div></div>`;
    } else if (templateKey === 'midnight') {
      maxWidth = 600;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const midnightMeta = [
        metaOptions.showTags ? `수신 표식: ${tags || '#OOC'}` : '',
        metaOptions.showDate ? `접수 시각: ${dateTimeText}` : '',
      ].filter(Boolean).join('<br>');
      inner = `<div style="padding:23px 25px;background-color:${p.paper};color:${p.fg};font-family:${p.font};">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid ${p.border};"><tbody><tr>
<td style="padding:0 0 9px;font-size:9.5px;letter-spacing:.18em;color:${p.muted};">심야 기록국 · 내부 문서</td>
<td align="right" style="padding:0 0 9px;text-align:right;font-size:9.5px;letter-spacing:.14em;color:${p.muted};">${metaOptions.showReference ? `문서번호 O-${code} · ` : ''}1／1 면</td>
</tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:20px;border-bottom:1px solid ${p.border};"><tbody><tr>
<td style="padding:0 12px 17px 0;vertical-align:top;overflow-wrap:break-word;word-break:keep-all;"><div style="font-size:9.5px;letter-spacing:.24em;color:${p.muted};">NIGHT RECORD BUREAU</div><div style="margin-top:8px;font-size:23px;font-weight:900;line-height:1.5;color:#EFE7D4;">${title}</div>${midnightMeta ? `<div style="margin-top:8px;font-size:10.5px;line-height:1.75;letter-spacing:.07em;color:${p.muted};">${midnightMeta}</div>` : ''}</td>
<td width="94" align="center" style="width:94px;padding:0 0 17px;text-align:center;vertical-align:top;"><table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;border:3px double ${p.accent};margin:0 auto;"><tbody><tr><td align="center" style="padding:5px 9px;color:${p.accent};font-size:11.5px;font-weight:900;letter-spacing:.22em;text-align:center;white-space:nowrap;">열람 제한</td></tr></tbody></table></td>
</tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.codeBg}" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:18px;background-color:${p.codeBg};border:1px solid ${p.border};border-left:3px solid ${p.accent};"><tbody><tr><td style="padding:14px 16px;color:${p.fg};">${bodyHTML}</td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:17px;"><tbody><tr><td style="padding:0;vertical-align:bottom;font-size:9.5px;line-height:1.85;letter-spacing:.12em;color:${p.muted};">검열 구간&nbsp;&nbsp;████████<br>보존 등급&nbsp;&nbsp;PERMANENT</td><td width="112" align="center" style="width:112px;padding:0;text-align:center;vertical-align:bottom;"><table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tbody><tr><td style="border:1.5px dashed ${p.muted};padding:8px;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td align="center" style="width:68px;height:68px;border:1px solid ${p.muted};text-align:center;vertical-align:middle;font-size:8px;letter-spacing:.16em;line-height:1.8;color:#B8B09E;">심야<br>기록국<br>보존 인장</td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:19px;font-size:10px;"><tbody><tr>
<th bgcolor="${p.chip}" style="width:33.3%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;font-weight:400;letter-spacing:.2em;color:${p.muted};text-align:center;">담&nbsp;당</th><th bgcolor="${p.chip}" style="width:33.3%;border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;font-weight:400;letter-spacing:.2em;color:${p.muted};text-align:center;">검&nbsp;토</th><th bgcolor="${p.chip}" style="border:1px solid ${p.border};background-color:${p.chip};padding:6px 8px;font-weight:400;letter-spacing:.2em;color:${p.muted};text-align:center;">승&nbsp;인</th>
</tr><tr><td align="center" style="height:54px;border:1px solid ${p.border};padding:6px;text-align:center;vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tbody><tr><td align="center" style="width:31px;height:31px;border:1.5px solid ${p.accent};color:${p.accent};font-size:12px;text-align:center;vertical-align:middle;">記</td></tr></tbody></table></td><td align="center" style="height:54px;border:1px solid ${p.border};padding:6px;text-align:center;vertical-align:middle;color:#514B41;font-size:10px;letter-spacing:.16em;">(서명란)</td><td align="center" style="height:54px;border:1px solid ${p.border};padding:6px;text-align:center;vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;margin:0 auto;"><tbody><tr><td style="border:1px solid ${p.muted};padding:5px;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td style="width:14px;height:18px;border:1px solid #5D574D;"></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table>
<div style="margin-top:16px;padding-top:9px;border-top:1px solid ${p.border};text-align:center;font-size:9px;letter-spacing:.22em;color:#5E584D;">본 문서는 폐기 대상이 아님 · 심야 기록국 보존서고 이관</div>
</div>`;
    } else if (templateKey === 'timeline') {
      maxWidth = 560;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const handle = metaOptions.showReference ? `@archive_${code}` : '@crack_archive';
      const headMeta = [handle, metaOptions.showDate ? dateText : ''].filter(Boolean).join(' · ');
      const statLead = metaOptions.showDate ? `${dateTimeText} · ` : '';
      inner = `<div style="padding:14px;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td style="padding:16px 18px 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td bgcolor="${p.accent}" align="center" style="width:44px;height:44px;background-color:${p.accent};color:#FFFFFF;font-family:Consolas,Menlo,monospace;font-size:14px;font-weight:700;text-align:center;vertical-align:middle;">OC</td><td style="padding:0 0 0 11px;vertical-align:middle;"><div style="font-size:14.5px;font-weight:800;line-height:1.35;color:${p.fg};">${escapeHTML(normalized.source?.chatTitle || 'Crack Archive')}</div><div style="margin-top:2px;font-size:12px;color:${p.muted};line-height:1.45;">${headMeta}</div></td></tr></tbody></table></td></tr><tr><td style="padding:13px 18px 0;"><div style="font-size:17px;font-weight:800;line-height:1.5;color:${p.fg};">${title}</div><div style="margin-top:8px;">${bodyHTML}</div>${tags ? `<div style="margin-top:11px;font-size:13px;line-height:1.7;color:${p.accent};">${tags}</div>` : ''}</td></tr><tr><td style="padding:14px 18px 4px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-top:1px solid ${p.chip};border-bottom:1px solid ${p.chip};"><tbody><tr><td style="padding:9px 2px;font-size:12px;color:${p.muted};">${statLead}<span style="font-weight:800;color:${p.fg};">1</span> 카드 보관됨</td></tr></tbody></table></td></tr><tr><td style="padding:6px 18px 13px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Consolas,Menlo,monospace;font-size:10.5px;"><tbody><tr><td style="padding:3px 0;color:${p.muted};">◌ 답글 0</td><td align="center" style="padding:3px 0;text-align:center;color:#00BA7C;">⇄ 재게시 0</td><td align="center" style="padding:3px 0;text-align:center;color:#F91880;">♥ 보관</td><td align="right" style="padding:3px 0;text-align:right;color:${p.muted};">↗ 공유</td></tr></tbody></table></td></tr></tbody></table><div style="margin-top:10px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.2em;color:${p.muted};">OOC TIMELINE${metaOptions.showReference ? ` · ${escapeHTML(getCardExportRef(normalized))}` : ''}</div></div>`;
    } else if (templateKey === 'board') {
      maxWidth = 660;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const infoRight = [metaOptions.showDate ? dateTimeText : '', '조회 1', '★ 개념 ∞', '댓글 0'].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');
      inner = `<div style="padding:14px;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.accent}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.accent};"><tbody><tr><td style="padding:11px 16px;font-size:14px;font-weight:800;color:#FFFFFF;white-space:nowrap;">OOC 갤러리</td><td align="right" style="padding:11px 16px;text-align:right;font-family:Consolas,Menlo,monospace;font-size:8.5px;letter-spacing:.14em;color:#D8DCF2;white-space:nowrap;">OOC BOARD${metaOptions.showReference ? ` · ${escapeHTML(getCardExportRef(normalized))}` : ''}</td></tr></tbody></table><div style="padding:15px 17px 12px;border-bottom:1px solid #D9D9D9;"><div style="font-size:16.5px;font-weight:800;line-height:1.5;color:${p.fg};"><span style="display:inline-block;margin-right:7px;padding:1px 6px;background-color:#F7F8FE;border:1px solid #BFC7E8;color:${p.accent};font-size:10.5px;font-weight:700;white-space:nowrap;">OOC</span>${title}</div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:9px;font-size:11px;color:${p.muted};"><tbody><tr><td style="padding:0;text-align:left;"><span style="font-weight:800;color:${p.fg};">ㅇㅇ</span>(기록자)</td><td align="right" style="padding:0;text-align:right;white-space:nowrap;">${infoRight}</td></tr></tbody></table></div><div style="min-height:150px;padding:21px 18px 24px;">${bodyHTML}${tags ? `<div style="margin-top:15px;padding-top:11px;border-top:1px solid #E3E3E3;font-size:11.5px;color:${p.accent};">${tags}</div>` : ''}</div><table width="262" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#FFFFFF" style="width:262px;max-width:90%;border-collapse:collapse;table-layout:fixed;margin:0 auto 19px;background-color:#FFFFFF;border:1px solid #C8C8C8;"><tbody><tr><td style="height:78px;padding:0;text-align:right;vertical-align:middle;font-size:12px;color:#DB2B18;">0&nbsp;&nbsp;</td><td width="92" align="center" style="width:92px;padding:0;text-align:center;vertical-align:middle;"><table width="52" height="52" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#6C70D9" style="width:52px;height:52px;border-collapse:collapse;margin:0 auto;background-color:#6C70D9;"><tbody><tr><td align="center" style="padding:0;text-align:center;vertical-align:middle;color:#FFFFFF;font-size:21px;line-height:1;">★<div style="margin-top:3px;font-size:8.5px;font-weight:700;line-height:1;">개념</div></td></tr></tbody></table></td><td style="padding:0;"></td></tr><tr><td colspan="3" style="padding:0;border-top:1px solid #C8C8C8;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px;color:#666666;"><tbody><tr><td align="center" style="padding:8px 0;text-align:center;border-right:1px solid #C8C8C8;">↗ 공유</td><td align="center" style="padding:8px 0;text-align:center;border-right:1px solid #C8C8C8;">＋ 스크랩</td><td align="center" style="padding:8px 0;text-align:center;">♨ 신고</td></tr></tbody></table></td></tr></tbody></table><div style="padding:0 17px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid #4D58C7;font-size:11px;color:#555555;"><tbody><tr><td style="padding:8px 0;text-align:left;white-space:nowrap;"><span style="font-weight:800;color:${p.fg};">전체 댓글 <span style="color:#C62917;">0</span>개</span>&nbsp;&nbsp;✓ 등록순&nbsp;&nbsp;✓ 최신순&nbsp;&nbsp;답글순</td><td align="right" style="padding:8px 0;text-align:right;white-space:nowrap;"><span style="display:inline-block;padding:2px 7px;border:1px solid #4D58C7;color:${p.accent};font-weight:700;">댓글 등록</span>&nbsp;&nbsp;본문 보기&nbsp;&nbsp;새로고침</td></tr></tbody></table><div style="padding:12px 0 15px;font-size:11px;color:#999999;">등록된 댓글이 없습니다.</div></div></td></tr></tbody></table></div>`;
    }

    else if (templateKey === 'wiki') {
      maxWidth = 660;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `<span style="color:#0275D8;">${escapeHTML(tag)}</span>`).join('&nbsp;<span style="color:#B8BFC6;">|</span>&nbsp;') : '';
      const sourceTitle = 'USER';
      const ref = metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : 'OOC DOCUMENT';
      inner = `<div style="background-color:${p.paper};color:${p.fg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#00A495" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#00A495;"><tbody><tr><td style="padding:7px 14px;white-space:nowrap;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td width="24" style="width:24px;padding:0 7px 0 0;vertical-align:middle;">${renderCrackWikiMarkDCTable()}</td><td style="padding:0;vertical-align:middle;font-size:14.5px;font-weight:800;color:#FFFFFF;white-space:nowrap;">크랙위키</td></tr></tbody></table></td><td width="190" align="right" style="width:190px;padding:7px 12px;text-align:right;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#FFFFFF;"><tbody><tr><td style="padding:5px 10px;font-size:10.5px;color:#98A0A8;text-align:left;">여기에서 검색</td><td width="26" align="right" style="width:26px;padding:5px 9px 5px 0;text-align:right;font-family:Consolas,Menlo,monospace;font-size:11px;color:#657078;">⌕</td></tr></tbody></table></td></tr></tbody></table><div style="padding:16px 18px 0;"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid ${p.border};"><tbody><tr><td style="padding:0 0 8px;vertical-align:bottom;overflow-wrap:break-word;word-break:keep-all;"><span style="font-size:22px;font-weight:800;line-height:1.35;">${title}</span></td><td width="196" align="right" style="width:196px;padding:0 0 9px;text-align:right;vertical-align:bottom;white-space:nowrap;"><span style="display:inline-block;padding:3px 8px;border:1px solid ${p.border};background-color:#FFFFFF;font-size:10px;color:#555C62;">토론</span> <span style="display:inline-block;padding:3px 8px;border:1px solid ${p.border};background-color:#FFFFFF;font-size:10px;color:#555C62;">편집</span> <span style="display:inline-block;padding:3px 8px;border:1px solid ${p.border};background-color:#FFFFFF;font-size:10px;color:#555C62;">역사</span></td></tr></tbody></table>${metaOptions.showDate ? `<div style="padding:6px 0 0;text-align:right;font-size:10.5px;color:${p.muted};">최근 수정 시각: ${dateTimeText}</div>` : ''}${tags ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:9px;border:1px solid ${p.border};"><tbody><tr><td style="padding:7px 11px;font-size:11.5px;line-height:1.7;color:${p.fg};">분류:&nbsp;${tags}</td></tr></tbody></table>` : ''}</div><div style="padding:13px 18px 20px;"><table align="right" width="205" cellpadding="0" cellspacing="0" border="0" style="width:205px;border-collapse:collapse;border:1px solid #C8CDD2;margin:2px 0 12px 14px;"><tbody><tr><td colspan="2" bgcolor="#00A495" align="center" style="padding:7px 9px;background-color:#00A495;color:#FFFFFF;font-weight:800;text-align:center;font-size:11.5px;">OOC 기록 문서</td></tr><tr><td width="58" bgcolor="#F5F6F7" style="width:58px;padding:5px 8px;background-color:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;font-size:10.5px;white-space:nowrap;">출처</td><td style="padding:5px 8px;border-top:1px solid #E1E5E8;font-size:11px;overflow-wrap:anywhere;">${sourceTitle}</td></tr>${metaOptions.showDate ? `<tr><td bgcolor="#F5F6F7" style="padding:5px 8px;background-color:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;font-size:10.5px;white-space:nowrap;">기록일</td><td style="padding:5px 8px;border-top:1px solid #E1E5E8;font-size:11px;">${dateText}</td></tr>` : ''}${metaOptions.showReference ? `<tr><td bgcolor="#F5F6F7" style="padding:5px 8px;background-color:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;font-size:10.5px;white-space:nowrap;">관리번호</td><td style="padding:5px 8px;border-top:1px solid #E1E5E8;font-family:Consolas,Menlo,monospace;font-size:10px;">${ref}</td></tr>` : ''}<tr><td bgcolor="#F5F6F7" style="padding:5px 8px;background-color:#F5F6F7;border-top:1px solid #E1E5E8;color:#555C62;font-weight:700;font-size:10.5px;white-space:nowrap;">보관처</td><td style="padding:5px 8px;border-top:1px solid #E1E5E8;font-size:11px;">CRACK ARCHIVE</td></tr></tbody></table><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid ${p.border};margin:2px 0 12px;"><tbody><tr><td style="padding:9px 16px 11px;"><div style="font-size:13px;font-weight:700;color:${p.fg};">목차</div><div style="margin-top:6px;font-size:11.5px;line-height:2;color:#0275D8;">1. 개요<br>2. 기록 내용</div></td></tr></tbody></table><br clear="all"><div style="margin:6px 0 10px;padding:0 0 6px;border-bottom:1px solid ${p.border};font-size:17px;font-weight:600;line-height:1.45;color:${p.fg};">1. 개요&nbsp;<span style="font-size:10.5px;font-weight:400;color:#0275D8;">[편집]</span></div><p style="font-size:13.5px;line-height:1.85;margin:8px 0;"><strong>${sourceTitle}</strong>가 저장한 OOC 기록을 정리한 문서이다.</p><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:10px 0 15px;background-color:${p.chip};border:1px solid #E1E5E8;border-left:4px solid ${p.accent};"><tbody><tr><td style="padding:9px 12px;font-size:11.5px;line-height:1.7;color:${p.italic};"><span style="color:${p.accent};font-weight:800;">ⓘ</span>&nbsp;이 문서는 보관된 카드의 제목·본문·분류 정보를 바탕으로 구성됩니다.</td></tr></tbody></table><div style="margin:15px 0 10px;padding:0 0 6px;border-bottom:1px solid ${p.border};font-size:17px;font-weight:600;line-height:1.45;color:${p.fg};">2. 기록 내용&nbsp;<span style="font-size:10.5px;font-weight:400;color:#0275D8;">[편집]</span></div>${bodyHTML}<br clear="all"></div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAFBFB" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#FAFBFB;border-top:1px solid #E7EAEC;"><tbody><tr><td style="padding:9px 18px 4px;font-size:10.5px;color:${p.muted};">문서 출처 : ${sourceTitle}</td><td align="right" style="padding:9px 18px 4px;text-align:right;font-family:Consolas,Menlo,monospace;font-size:9.5px;letter-spacing:.1em;color:${p.muted};white-space:nowrap;">CRACK ARCHIVE WIKI · ${ref}</td></tr><tr><td colspan="2" align="center" style="padding:2px 18px 10px;text-align:center;font-size:9.5px;color:#9AA2AB;">이 문서는 Crack Archive에서 내보낸 개인 기록 문서입니다.</td></tr></tbody></table></div>`;
    } else if (templateKey === 'messenger') {
      maxWidth = 520;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const timeMatch = metaOptions.showDate ? dateTimeText.match(/(?:오전|오후)\s*\d{1,2}:\d{2}|\d{1,2}:\d{2}$/) : null;
      const timeOnly = timeMatch ? timeMatch[0] : '';
      inner = `<div style="padding:0;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td style="padding:13px 16px 11px;font-size:14.5px;font-weight:800;color:#3C5468;overflow-wrap:break-word;word-break:keep-all;">‹&nbsp;&nbsp;OOC ARCHIVE&nbsp;<span style="font-size:11px;font-weight:400;color:#5B7284;">2</span></td><td width="46" align="right" style="width:46px;padding:13px 16px 11px;text-align:right;font-size:14px;color:#3C5468;">≡</td></tr></tbody></table>${metaOptions.showDate ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tbody><tr><td align="center" style="padding:0 0 12px;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#8CA2B4" style="border-collapse:collapse;margin:0 auto;background-color:#8CA2B4;"><tbody><tr><td style="padding:4px 13px;font-size:10px;color:#FFFFFF;white-space:nowrap;">${dateText}</td></tr></tbody></table></td></tr></tbody></table>` : ''}<table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td width="54" style="width:54px;padding:0 0 0 14px;vertical-align:top;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tbody><tr><td bgcolor="#5C7488" align="center" style="width:40px;height:40px;background-color:#5C7488;color:#FFFFFF;font-family:Consolas,Menlo,monospace;font-size:12px;font-weight:700;text-align:center;vertical-align:middle;">OC</td></tr></tbody></table></td><td style="padding:0 14px 0 0;vertical-align:top;"><div style="margin:1px 0 5px;font-size:11.5px;color:#4A6070;">기록자</div><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:11px 14px;"><div style="font-size:14.5px;font-weight:800;line-height:1.5;color:${p.fg};margin-bottom:6px;">${title}</div>${bodyHTML}${tags ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid #EEF1F3;font-size:11.5px;color:${p.accent};">${tags}</div>` : ''}</td><td width="52" style="width:52px;padding:0 0 2px 6px;vertical-align:bottom;font-size:9.5px;line-height:1.6;color:#5B7284;"><span style="color:#B7960B;font-weight:800;">1</span>${timeOnly ? `<br>${timeOnly}` : ''}</td></tr></tbody></table></td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:16px;background-color:#FFFFFF;"><tbody><tr><td width="34" align="center" style="width:34px;padding:10px 0 10px 12px;text-align:center;font-size:15px;color:#8A99A6;">＋</td><td style="padding:10px 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F4F6" style="width:100%;border-collapse:collapse;background-color:#F2F4F6;"><tbody><tr><td style="padding:7px 13px;font-size:11.5px;color:#9AA8B3;">메시지 입력</td></tr></tbody></table></td><td width="44" align="center" style="width:44px;padding:10px 12px 10px 0;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#F7E600" style="border-collapse:collapse;margin:0 auto;background-color:#F7E600;"><tbody><tr><td align="center" style="width:29px;height:29px;text-align:center;vertical-align:middle;font-size:12px;font-weight:800;color:#3A2E00;">#</td></tr></tbody></table></td></tr></tbody></table></div>`;

    } else if (templateKey === 'livechat') {
      maxWidth = 400;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const liveCaption = ['LIVE CHAT LOG', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : '', metaOptions.showDate ? dateText : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:12px 9px;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;border-bottom:1px solid #26282C;"><tbody><tr><td width="40" style="width:40px;padding:10px 0 10px 13px;font-size:13px;color:${p.muted};">|→</td><td align="center" style="padding:10px 0;text-align:center;font-size:13.5px;font-weight:800;color:#EDEFF2;">채팅</td><td width="40" align="right" style="width:40px;padding:10px 13px 10px 0;text-align:right;font-size:13px;letter-spacing:2px;color:${p.muted};">≡</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.chip};border-bottom:1px solid #26282C;"><tbody><tr><td width="100" style="width:100px;padding:7px 0 7px 13px;font-size:10.5px;font-weight:800;color:#FFCE3D;white-space:nowrap;">◆ TOP 165,000</td><td style="padding:7px 8px;font-size:10.5px;color:#C9CDD3;overflow:hidden;white-space:nowrap;">${escapeHTML(normalized.source?.chatTitle || 'Crack Archive')}</td><td width="48" align="right" style="width:48px;padding:7px 13px 7px 0;text-align:right;font-size:10.5px;color:${p.muted};white-space:nowrap;">1명</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1E2023" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#1E2023;border-bottom:1px solid #35373B;"><tbody><tr><td style="padding:9px 12px;"><div style="font-size:9.5px;font-weight:800;color:${p.accent};">※ 고정된 기록</div><div style="margin-top:4px;font-size:13.5px;font-weight:800;line-height:1.5;color:#EDEFF2;overflow-wrap:break-word;word-break:keep-all;">${title}</div>${metaOptions.showDate ? `<div style="margin-top:4px;font-size:10px;color:${p.muted};">${dateText}</div>` : ''}</td></tr></tbody></table><div style="padding:10px 12px 2px;"><div style="margin:0 0 6px;font-size:12px;line-height:1.55;"><span style="font-weight:800;color:#61B9F2;">새벽두시반</span>&nbsp;<span style="color:${p.fg};">드디어 올라옴</span></div><div style="margin:0 0 8px;font-size:12px;line-height:1.55;"><span style="color:#C69BF8;">♥</span> <span style="font-weight:800;color:#C69BF8;">복선수집가</span>&nbsp;<span style="color:${p.fg};">정독 중</span></div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px;background-color:${p.chip};border:1px solid ${p.border};"><tbody><tr><td style="padding:9px 11px;"><div style="font-size:12px;"><span style="display:inline-block;margin-right:5px;padding:1px 6px;background-color:${p.accent};color:#0A0A0B;font-size:8.5px;font-weight:800;">기록자</span><span style="font-weight:800;color:${p.accent};">archive_ooc</span></div><div style="margin-top:6px;">${bodyHTML}</div>${tags ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid ${p.border};font-size:11px;line-height:1.7;color:${p.accent};">${tags}</div>` : ''}</td></tr></tbody></table><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2A2410" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 8px;background-color:#2A2410;border:1px solid #4A3F14;"><tbody><tr><td style="padding:8px 11px;font-size:11px;color:#F2E2A0;">◆ <span style="font-weight:800;color:#FFCE3D;">ㅇㅇ</span>님이 치즈 <span style="font-weight:800;color:#FFCE3D;">1,000개</span>로 이 기록을 응원했습니다.</td></tr></tbody></table><div style="margin:0 0 3px;font-size:12px;line-height:1.55;"><span style="color:#4ED6B1;">♥</span> <span style="font-weight:800;color:#4ED6B1;">감상러버</span>&nbsp;<span style="color:${p.fg};">이건 저장해야지</span></div></div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#26282C" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#26282C;border-top:1px solid #35373B;"><tbody><tr><td width="32" style="width:32px;padding:8px 0 8px 11px;font-size:12px;color:${p.fg};">☺</td><td style="padding:8px 4px;font-size:11.5px;color:${p.muted};">채팅을 입력해주세요</td><td width="58" align="right" style="width:58px;padding:8px 11px 8px 0;text-align:right;font-size:11px;font-weight:800;color:${p.accent};">채팅</td></tr></tbody></table></td></tr></tbody></table>${liveCaption ? `<div style="margin-top:9px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.16em;color:#5E6470;">${liveCaption}</div>` : ''}</div>`;

    } else if (templateKey === 'riftchat') {
      maxWidth = 470;
      const tags = metaOptions.showTags ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ') : '';
      const gameTime = metaOptions.showDate ? dateTimeText.split(' ').slice(-2).join(' ') : '21:41';
      const riftCaption = ['RIFT CHAT LOG', metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : '', metaOptions.showDate ? dateText : ''].filter(Boolean).join(' · ');
      inner = `<div style="padding:13px 10px;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};"><tbody><tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111417" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#111417;border-bottom:1px solid ${p.border};"><tbody><tr><td width="28" align="center" style="width:28px;padding:8px 0;text-align:center;font-size:10px;color:${p.accent};">◆</td><td style="padding:8px 0;font-size:11.5px;font-weight:800;color:#E5D6A0;">협곡 채팅</td><td align="right" style="padding:8px 11px;text-align:right;font-size:10px;color:${p.muted};white-space:nowrap;">전체</td></tr></tbody></table><div style="padding:10px 12px 5px;font-size:11.5px;line-height:1.78;color:#C9BE8F;"><div style="color:#C9BE8F;">[${gameTime}] <span style="color:${p.muted};">[전체]</span> <span style="font-weight:800;color:#E5D6A0;">관전자 (정찰자)</span>: 새 기록 확인 중</div><div style="color:#6EC8E8;">[${gameTime}] 복선수집가님이 기록 위치를 표시했습니다.</div><div style="margin:7px 0;color:#E8543F;font-weight:800;overflow-wrap:break-word;word-break:keep-all;">[${gameTime}] 기록자 (아카이브) 님이 목표를 완료했습니다 — 『${title}』</div><div style="color:#C9BE8F;">[${gameTime}] <span style="color:${p.muted};">[전체]</span> <span style="font-weight:800;color:#E5D6A0;">기록자 (아카이브)</span>:</div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.chip}" style="width:100%;border-collapse:collapse;table-layout:fixed;margin:5px 0 8px;background-color:${p.chip};border:1px solid #3C3623;"><tbody><tr><td style="padding:8px 10px;">${bodyHTML}${tags ? `<div style="margin-top:7px;padding-top:6px;border-top:1px solid #3C3623;font-size:10.5px;line-height:1.7;color:${p.accent};">${tags}</div>` : ''}</td></tr></tbody></table><div style="color:#F0B254;font-weight:800;">[${gameTime}] 기록 카드가 보관되었습니다. (보상: 검색 가능 상태)</div><div style="margin-top:2px;color:#6EC8E8;">[${gameTime}] 다음 회차로 이동할 준비가 완료되었습니다.</div></div><div style="padding:5px 12px 10px;"><div style="font-size:10.5px;line-height:1.7;color:#8A8468;">/help · 제목과 태그를 활용하면 기록을 빠르게 다시 찾을 수 있습니다.</div><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1E2124" style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:7px;background-color:#1E2124;border:1px solid #3A3E44;"><tbody><tr><td width="22" style="width:22px;padding:7px 0 7px 9px;font-size:9.5px;color:${p.muted};">▼</td><td width="46" style="width:46px;padding:7px 0;font-size:11px;color:#C9BE8F;">[전체]</td><td style="padding:7px 9px 7px 0;font-size:11px;color:#5A5F52;">메시지를 입력하세요</td></tr></tbody></table></div></td></tr></tbody></table>${riftCaption ? `<div style="margin-top:9px;text-align:center;font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.16em;color:#5E6470;">${riftCaption}</div>` : ''}</div>`;
    } else if (templateKey === 'diary') {
      maxWidth = 660;
      const tags = metaOptions.showTags
        ? normalized.tags.slice(0, 8).map((tag) => `#${escapeHTML(tag)}`).join(' · ')
        : '';
      const diaryMeta = [
        metaOptions.showDate ? dateTimeText : '',
        metaOptions.showReference ? escapeHTML(getCardExportRef(normalized)) : '',
      ].filter(Boolean).join(' / ');
      inner = `<div style="padding:18px 14px;background-color:${p.bg};font-family:${p.font};"><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:${p.paper};border:1px solid ${p.border};border-left:5px solid ${p.accent};"><tbody><tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;table-layout:fixed;"><tbody><tr><td width="86" style="width:86px;padding:18px 15px 16px 18px;border-right:1px solid #DCE1E5;vertical-align:top;"><div style="font-family:Consolas,Menlo,monospace;font-size:8.5px;font-weight:700;letter-spacing:.18em;color:${p.muted};">ENTRY</div><div style="margin-top:5px;font-family:Consolas,Menlo,monospace;font-size:27px;font-weight:700;line-height:1;color:${p.accent};">20</div><div style="margin-top:7px;font-family:Consolas,Menlo,monospace;font-size:8px;letter-spacing:.13em;color:#A0A8AF;">DIARY</div></td><td style="padding:18px 18px 16px;vertical-align:top;overflow-wrap:break-word;word-break:keep-all;"><div style="font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.12em;color:${p.muted};">${escapeHTML(normalized.source?.chatTitle || 'Crack Archive')}</div><div style="margin-top:8px;font-size:21px;font-weight:800;line-height:1.4;color:${p.fg};">${title}</div>${diaryMeta ? `<div style="margin-top:9px;font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.05em;color:${p.muted};">${diaryMeta}</div>` : ''}</td></tr></tbody></table><div style="padding:18px 20px 21px;border-top:1px solid #E3E7EA;">${bodyHTML}</div>${tags || metaOptions.showReference ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8F9FA" style="width:100%;border-collapse:collapse;table-layout:fixed;background-color:#F8F9FA;border-top:1px solid #E3E7EA;"><tbody><tr><td style="padding:10px 18px;font-size:10.5px;line-height:1.65;color:${p.accent};">${tags || '&nbsp;'}</td><td width="190" align="right" style="width:190px;padding:10px 18px;text-align:right;font-family:Consolas,Menlo,monospace;font-size:9px;letter-spacing:.08em;color:${p.muted};white-space:nowrap;">${metaOptions.showReference ? `PRIVATE ENTRY · ${escapeHTML(getCardExportRef(normalized))}` : '&nbsp;'}</td></tr></tbody></table>` : ''}</td></tr></tbody></table></div>`;
    }

    if (!inner) return '';
    const html = wrapDCDocShell(inner, p, maxWidth);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root) return html.trim();
    root.querySelectorAll('[style]').forEach((el) => {
      el.style.removeProperty('border-radius');
      el.style.removeProperty('border-top-left-radius');
      el.style.removeProperty('border-top-right-radius');
      el.style.removeProperty('border-bottom-left-radius');
      el.style.removeProperty('border-bottom-right-radius');
      if (!toStringValue(el.getAttribute('style')).trim()) el.removeAttribute('style');
    });
    stabilizeDCSelectedFont(root, p.font);
    if (opts.forceWordWrap !== false) wrapDCWordsNoBreak(root);
    else stripDCWordJoiners(root);
    return root.outerHTML;
  }


  function renderDCBodyFragment(card, opts = {}, smart = true, fontKey = 'sans') {
    const normalized = prepareCardForDCRender(card, opts);
    const options = { ...DC_DEFAULT_OPTIONS, ...opts };
    const theme = getDCTheme('clean');
    const font = getDCFont(options.font || fontKey);
    const rawHTML = coaRenderCardBody(normalized, { smart, forceSmart: smart, preserveComments: true });
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${rawHTML}</div>`, 'text/html');
    const root = doc.body.firstElementChild || doc.body;
    sanitizeForDC(root, options);
    if (options.excludeCodeBlocks) root.querySelectorAll('pre').forEach((node) => node.remove());
    if (options.excludeComments) removeHTMLCommentNodes(root);
    applyDCInlineStyles(root, normalized, {
      ...options,
      themeObject: theme,
      fontFamilyOverride: font.family,
    });
    stabilizeDCSelectedFont(root, font.family);
    if (options.forceWordWrap !== false) wrapDCWordsNoBreak(root);
    else stripDCWordJoiners(root);
    return root;
  }

  function coaToDCBareHTML(card, opts = {}) {
    const normalized = normalizeCard(card);
    // 로그의 "없음"은 로그 파싱·자동 구조화를 전혀 하지 않은 원문 렌더다.
    const smart = normalized.archiveType === 'ooc' && opts.autoStructure !== false;
    const root = renderDCBodyFragment(normalized, opts, smart, opts.font || 'sans');
    return root.innerHTML.trim() || '<p>&nbsp;</p>';
  }

  function coaToInlineHTML(card, opts = {}) {
    const normalized = normalizeCard(card);
    const options = { ...DC_DEFAULT_OPTIONS, ...opts };
    const exportStyle = resolveDCExportStyle(normalized, options);
    options.exportStyle = exportStyle;

    let inlineHTML = '';
    // 핵심: 저장함 분류가 OOC면 OOC 렌더러만, 로그면 로그 렌더러만 탄다.
    if (normalized.archiveType === 'log') {
      const logHTML = coaToDCLogLayoutHTML(normalized, options);
      inlineHTML = logHTML || coaToDCBareHTML(normalized, options);
    } else {
      const docHTML = coaToDCDocTemplateHTML(normalized, {
        ...options,
        docTemplate: exportStyle,
      });
      inlineHTML = docHTML || coaToDCDocTemplateHTML(normalized, { ...options, docTemplate: 'specsheet' });
    }

    // 일반 HTML/PNG 원본에는 손대지 않고, 완성된 DC HTML의 표시 텍스트 노드만 후처리한다.
    // URL·style·코드블록은 건드리지 않아 이미지 링크와 코드가 깨지지 않는다.
    const titleAdjustedHTML = applyExportTitleVisibilityHTML(inlineHTML, normalized, options);
    const emojiSafeHTML = applyDCEmojiCompatibilityToHTML(titleAdjustedHTML, options);
    return applyDCFontSizeScaleHTML(emojiSafeHTML, options.fontSizePt);
  }

  async function writePlainText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-99999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('복사에 실패했습니다.');
    return true;
  }

  async function copyRichHTMLFallback(inlineHTML) {
    const box = document.createElement('div');
    box.contentEditable = 'true';
    box.style.position = 'fixed';
    box.style.left = '-99999px';
    box.style.top = '0';
    box.innerHTML = inlineHTML;
    document.body.appendChild(box);
    const range = document.createRange();
    range.selectNodeContents(box);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    box.remove();
    if (!ok) throw new Error('서식 복사에 실패했습니다.');
    return true;
  }

  async function coaCopyRichHTML(id, opts = {}) {
    const card = await coaLoadCard(id);
    if (!card) throw new Error('복사할 카드를 찾지 못했습니다.');
    const inlineHTML = coaToInlineHTML(card, opts);
    if (navigator.clipboard && navigator.clipboard.write && globalThis.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([inlineHTML], { type: 'text/html' }),
          'text/plain': new Blob([card.body || ''], { type: 'text/plain' }),
        })]);
        return inlineHTML;
      } catch (error) {
        console.warn('[COA:DC] rich clipboard failed, fallback:', error);
      }
    }
    await copyRichHTMLFallback(inlineHTML);
    return inlineHTML;
  }

  function getStandaloneExportCSS() {
    return `
      *{box-sizing:border-box}html,body{margin:0;padding:0}body{min-height:100vh;padding:32px 16px;background:#e7e6e1;color:#161513;font-family:'Pretendard Variable',Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif}.coa-export-page{width:100%;margin:0 auto}.coa-html-log,.coa-ooc-export{width:100%;margin:0 auto;box-sizing:border-box}.coa-html-log,.coa-html-log *,.coa-ooc-export,.coa-ooc-export *{box-sizing:border-box;max-width:100%}.coa-html-log table,.coa-ooc-export table{max-width:100%}.coa-ooc-rich-body{font-size:15px;line-height:1.85;color:inherit;overflow-wrap:break-word;word-break:keep-all}.coa-ooc-rich-body>:first-child{margin-top:0!important}.coa-ooc-rich-body>:last-child{margin-bottom:0!important}.coa-ooc-rich-body h1,.coa-ooc-rich-body h2,.coa-ooc-rich-body h3{margin:1.35em 0 .65em;padding-bottom:.28em;border-bottom:1px solid currentColor;line-height:1.35;letter-spacing:-.025em}.coa-ooc-rich-body h1{font-size:1.72em}.coa-ooc-rich-body h2{font-size:1.48em}.coa-ooc-rich-body h3{font-size:1.25em}.coa-ooc-rich-body h4,.coa-ooc-rich-body h5,.coa-ooc-rich-body h6{margin:1.15em 0 .45em;line-height:1.4}.coa-ooc-rich-body p{margin:.72em 0}.coa-ooc-rich-body ul,.coa-ooc-rich-body ol{margin:.8em 0;padding-left:1.7em}.coa-ooc-rich-body li{margin:.25em 0}.coa-ooc-rich-body blockquote{margin:1em 0;padding:11px 15px;border-left:4px solid currentColor;background:rgba(127,127,127,.09)}.coa-ooc-rich-body blockquote>:first-child{margin-top:0}.coa-ooc-rich-body blockquote>:last-child{margin-bottom:0}.coa-ooc-rich-body pre{margin:1em 0;padding:14px 16px;overflow:auto;white-space:pre;background:#20201e;color:#f3f1ea;border:1px solid currentColor;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.coa-ooc-rich-body code{padding:2px 5px;background:rgba(127,127,127,.14);font:.92em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.coa-ooc-rich-body pre code{padding:0;background:transparent;color:inherit;font:inherit}.coa-ooc-rich-body table{display:table;width:100%;border-collapse:collapse;table-layout:auto;margin:1em 0;font-size:.92em}.coa-ooc-rich-body th,.coa-ooc-rich-body td{border:1px solid currentColor;padding:8px 10px;vertical-align:top;overflow-wrap:break-word}.coa-ooc-rich-body th{background:rgba(127,127,127,.12);font-weight:800}.coa-ooc-rich-body hr{border:0;border-top:1px solid currentColor;margin:1.4em 0;opacity:.45}.coa-ooc-rich-body img{display:block;max-width:100%;height:auto;margin:6px auto 0;border:1px solid currentColor}.coa-ooc-rich-body p:has(> img:only-child){margin:0;line-height:0}.coa-ooc-rich-body p:has(> img:only-child)+p{margin-top:2px}.coa-ooc-rich-body a{color:inherit;text-decoration:underline;text-underline-offset:2px}.coa-ooc-rich-body em,.coa-ooc-rich-body i{font-style:normal;opacity:.72}[data-coa-ooc-layout="newspaper"] .coa-ooc-rich-body>p:first-child::first-letter{float:left;margin:.08em .14em 0 0;font-size:3.2em;font-weight:700;line-height:.82}[data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="diagnosis"] .coa-ooc-rich-body h3{color:#49796e;border-bottom-color:#9cb9b2}[data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="dossier"] .coa-ooc-rich-body h3{border-bottom-color:#777361}[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body h3{font-size:1.18em;margin:1em 0 .45em;padding-bottom:.2em}[data-coa-ooc-layout="receipt"] .coa-ooc-rich-body pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;font-size:11px}[data-coa-ooc-layout="library"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="library"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="library"] .coa-ooc-rich-body h3{color:#A5372D;border-bottom-color:#D5C79E}[data-coa-ooc-layout="library"] .coa-ooc-rich-body pre{background:#F2EBD4;color:#3A3222;border-color:#D5C79E}[data-coa-ooc-layout="onair"] .coa-ooc-rich-body h1,[data-coa-ooc-layout="onair"] .coa-ooc-rich-body h2,[data-coa-ooc-layout="onair"] .coa-ooc-rich-body h3{color:#E8B25A;border-bottom-color:#2A3550}[data-coa-ooc-layout="onair"] .coa-ooc-rich-body blockquote{border-left-color:#E8B25A;background:#1B2340}[data-coa-ooc-layout="onair"] .coa-ooc-rich-body pre{background:#090E19;color:#D9DCE8;border-color:#2A3550}@media(max-width:640px){body{padding:12px 6px}.coa-ooc-rich-body table{display:block;overflow-x:auto}.coa-ooc-rich-body pre{white-space:pre-wrap;overflow-wrap:anywhere}[data-coa-ooc-layout="airmail"]>div{padding:25px 20px 30px!important}[data-coa-ooc-layout="airmail"] header{grid-template-columns:1fr!important}[data-coa-ooc-layout="airmail"] header>div:last-child{display:none}[data-coa-ooc-layout="receipt"]{padding:12px 6px!important}[data-coa-ooc-layout="library"]{padding:14px 8px!important}[data-coa-ooc-layout="library"]>article{padding:22px 18px 20px!important}[data-coa-ooc-layout="onair"]{padding:12px 6px!important}[data-coa-ooc-layout="onair"]>article>div:first-child{display:block!important}[data-coa-ooc-layout="onair"]>article>div:first-child>span{display:block!important;margin:2px 0!important;white-space:normal!important}}
    `;
  }

  function getStandaloneFontLinks(fontKey = 'pretendard') {
    const clean = normalizeCOAFont(fontKey);
    const urls = [COA_CORE_GOOGLE_FONTS_URL, COA_PRETENDARD_FONT_URL];
    const selected = COA_FONT_PRESETS[clean]?.stylesheet;
    if (selected && !urls.includes(selected)) urls.push(selected);
    return urls.map((href) => `<link rel="stylesheet" href="${escapeHTML(href)}">`).join('\n');
  }

  function buildStandaloneHTMLDocument(card, innerHTML, fontKey = 'pretendard') {
    const normalized = normalizeCard(card);
    const title = escapeHTML(normalized.title || 'Crack Archive');
    return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${title}</title>\n<link rel="preconnect" href="https://fonts.googleapis.com">\n${getStandaloneFontLinks(fontKey)}\n<style>${getStandaloneExportCSS()}</style>\n</head>\n<body>\n<main class="coa-export-page">${innerHTML}</main>\n</body>\n</html>`;
  }

  function exportStandaloneHTMLFile(card, innerHTML, fontKey = 'pretendard') {
    const documentHTML = buildStandaloneHTMLDocument(card, innerHTML, fontKey);
    const blob = new Blob([documentHTML], { type: 'text/html;charset=utf-8' });
    downloadBlob(`crack-archive-${safeFilename(card.title)}-${stampForFilename()}.html`, blob);
    return documentHTML;
  }

  async function coaCopyHTMLSource(id, opts = {}) {
    const sourceCard = await coaLoadCard(id);
    if (!sourceCard) throw new Error('복사할 카드를 찾지 못했습니다.');
    const card = await prepareCardForExport(sourceCard, opts);
    const inlineHTML = coaToInlineHTML(card, opts);
    await writePlainText(inlineHTML);
    return inlineHTML;
  }

  async function coaOpenReplacementSettingsModal() {
    ensureViewerStyle();
    document.querySelector('.coa-replace-modal')?.remove();
    const settings = await coaLoadSettings();
    const initialRules = normalizeExportReplacementRules(settings.exportReplacements);
    const modal = document.createElement('section');
    modal.className = 'coa-modal coa-replace-modal';
    applyViewerThemeToElement(modal);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '내보내기 단어 치환 설정');

    const renderRows = (rules) => rules.map((rule) => `<div class="coa-replace-row" data-replace-row>
      <input class="coa-input" data-replace-from value="${escapeHTML(rule.from)}" placeholder="바꿀 단어">
      <span class="coa-replace-arrow">→</span>
      <input class="coa-input" data-replace-to value="${escapeHTML(rule.to)}" placeholder="바뀔 단어 · 빈칸이면 삭제">
      <button type="button" class="coa-btn sm" data-replace-remove aria-label="규칙 삭제">×</button>
    </div>`).join('');

    modal.innerHTML = `<form class="coa-replace-panel" data-replace-form>
      <header class="coa-edit-head"><h2>내보내기 단어 치환</h2><button type="button" class="coa-btn ghost" data-replace-close>닫기</button></header>
      <div class="coa-replace-body">
        <p class="coa-replace-help">카드 원본과 보관함 화면은 바꾸지 않습니다. HTML·PNG·DC HTML 내보내기에서 <b>단어 치환 적용</b>을 체크한 경우에만 아래 규칙을 순서대로 적용합니다.</p>
        <div class="coa-replace-list" data-replace-list>${renderRows(initialRules.length ? initialRules : [{ from: '', to: '■■' }])}</div>
        <button type="button" class="coa-btn" data-replace-add>＋ 규칙 추가</button>
        <p class="coa-replace-help">문자 그대로, 대소문자를 구분해 치환합니다. 이미지 주소와 링크 주소는 깨짐 방지를 위해 보존됩니다.</p>
      </div>
      <footer class="coa-edit-foot"><button type="button" class="coa-btn ghost" data-replace-close>취소</button><button type="submit" class="coa-btn primary">저장</button></footer>
    </form>`;

    const list = modal.querySelector('[data-replace-list]');
    const addRow = (rule = { from: '', to: '' }) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = renderRows([rule]);
      list.appendChild(wrap.firstElementChild);
    };
    modal.querySelector('[data-replace-add]')?.addEventListener('click', () => addRow());
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-replace-close]')) modal.remove();
      const remove = event.target.closest('[data-replace-remove]');
      if (remove) {
        remove.closest('[data-replace-row]')?.remove();
        if (!list.querySelector('[data-replace-row]')) addRow({ from: '', to: '■■' });
      }
    });
    modal.querySelector('[data-replace-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (form.dataset.coaBusy === '1') return;
      const submit = form.querySelector('button[type="submit"]');
      form.dataset.coaBusy = '1';
      if (submit) submit.disabled = true;
      try {
        const rules = [...list.querySelectorAll('[data-replace-row]')].map((row) => ({
          from: row.querySelector('[data-replace-from]')?.value || '',
          to: row.querySelector('[data-replace-to]')?.value || '',
        }));
        const cleanRules = normalizeExportReplacementRules(rules);
        const current = await coaLoadSettings();
        await coaSaveSettings({ ...current, exportReplacements: cleanRules });
        modal.remove();
        alert(`단어 치환 규칙 ${cleanRules.length}개 저장 완료.`);
      } catch (error) {
        console.error('[COA:STORE] replacement settings save failed:', error);
        alert(`단어 치환 설정 저장 실패: ${error.message || error}`);
      } finally {
        form.dataset.coaBusy = '0';
        if (submit?.isConnected) submit.disabled = false;
      }
    });
    (viewerState.root || getViewerRoot()).appendChild(modal);
  }


  async function coaOpenHTMLPreview(id) {
    const card = await coaLoadCard(id);
    if (!card) throw new Error('HTML로 볼 카드를 찾지 못했습니다.');
    ensureViewerStyle();
    ensureExportStyle();
    document.querySelector('.coa-html-preview-backdrop')?.remove();
    const replacementRules = await getExportReplacementRules();

    const isLog = card.archiveType === 'log';
    const state = {
      layout: isLog ? normalizeLogHTMLLayout(card.view?.htmlLayout) : normalizeOOCHTMLLayout(card.view?.htmlLayout),
      color: isLog ? normalizeLogHTMLColor(card.view?.htmlColor || card.view?.htmlTheme, card.view?.htmlLayout) : 'default',
      font: normalizeCOAFont(card.view?.fontFamily),
      fontSizePt: EXPORT_FONT_SIZE_PT_DEFAULT,
      ...EXPORT_META_DEFAULTS,
      excludeCodeBlocks: true,
      applyReplacements: false,
    };
    const backdrop = document.createElement('div');
    backdrop.className = 'coa-paste-backdrop coa-html-preview-backdrop';
    applyViewerThemeToElement(backdrop);
    backdrop.innerHTML = `<section class="coa-html-preview-modal" role="dialog" aria-modal="true" aria-label="일반 HTML 미리보기">
      <header class="coa-html-preview-head">
        <h2 data-html-title>일반 HTML 미리보기${isLog ? ` · ${escapeHTML(LOG_HTML_LAYOUTS[state.layout].label)}${isBuiltInLogLayout(state.layout) ? '' : ` / ${escapeHTML(getLogHTMLVariantLabel(state.layout, state.color))}`}` : ` · OOC / ${escapeHTML(OOC_HTML_LAYOUTS[state.layout].label)}`}</h2>
        <div class="coa-html-preview-actions">
          <button type="button" class="coa-btn" data-html-export>HTML로 내보내기</button>
          <button type="button" class="coa-btn" data-html-png>현재 설정으로 PNG</button>
          <button type="button" class="coa-btn ghost" data-html-close>닫기</button>
        </div>
      </header>
      <div class="coa-html-preview-controls">
        <label class="coa-html-control-item"><span class="coa-html-control-label">테마</span><select class="coa-select" data-html-layout>${isLog ? getLogHTMLLayoutOptionsHTML(state.layout) : getOOCHTMLLayoutOptionsHTML(state.layout)}</select></label>
        ${isLog ? `<label class="coa-html-control-item"><span class="coa-html-control-label">색상 변형</span><select class="coa-select" data-html-color>${getLogHTMLColorOptionsHTML(state.color, state.layout)}</select></label>` : ''}
        <label class="coa-html-control-item"><span class="coa-html-control-label">폰트</span><select class="coa-select" data-html-font>${getCOAFontOptionsHTML(state.font)}</select></label>
        <div class="coa-html-font-size-control" role="group" aria-label="글자 크기 조절"><span class="coa-html-control-label">크기</span><div class="coa-html-font-size-stepper"><button type="button" class="coa-btn sm" data-html-font-size-minus aria-label="글자 크기 1포인트 줄이기">−</button><output data-html-font-size-output>0 pt</output><button type="button" class="coa-btn sm" data-html-font-size-plus aria-label="글자 크기 1포인트 늘리기">＋</button></div></div>
        <label class="coa-check coa-html-replace-check"><input type="checkbox" data-html-replace${replacementRules.length ? '' : ' disabled'}><span>단어 치환 적용${replacementRules.length ? ` · ${replacementRules.length}개` : ' · 규칙 없음'}</span></label>
        <div class="coa-html-meta-options"><span class="coa-html-meta-title">표시 항목</span><label class="coa-check" title="카드 제목 영역을 표시합니다. 끄면 테마 장식은 유지하고 제목 부분만 정리합니다."><input type="checkbox" data-html-meta="showTitle" checked><span>제목</span></label><label class="coa-check"><input type="checkbox" data-html-meta="showTags" checked><span>태그</span></label><label class="coa-check"><input type="checkbox" data-html-meta="showDate" checked><span>날짜·시간</span></label><label class="coa-check"><input type="checkbox" data-html-meta="showReference" checked><span>참조·관리번호</span></label><label class="coa-check" title="여러 줄 코드블록만 숨기고 한 줄 인라인 코드는 유지합니다."><input type="checkbox" data-html-exclude-code checked><span>코드블록 제외</span></label></div>
        <span class="coa-html-control-note">${isLog && isBuiltInLogLayout(state.layout) ? '고정 색상 테마 · 폰트는 자유 변경 · 카드 저장값은 유지' : '미리보기에서만 임시 변경 · 카드 저장값은 유지'}</span>
      </div>
      <div class="coa-html-preview-body"><div class="coa-html-preview-canvas" data-html-canvas></div></div>
    </section>`;

    const canvas = backdrop.querySelector('[data-html-canvas]');
    let currentExportCard = card;
    let previewRenderToken = 0;
    const paintPreview = () => {
      currentExportCard = state.applyReplacements ? applyExportReplacementsToCard(card, replacementRules) : card;
      canvas.innerHTML = renderExportHTML(currentExportCard, {
        layout: state.layout,
        color: state.color,
        font: state.font,
        fontSizePt: state.fontSizePt,
        showTitle: state.showTitle,
        showTags: state.showTags,
        showDate: state.showDate,
        showReference: state.showReference,
        excludeCodeBlocks: state.excludeCodeBlocks,
        maxWidth: COA_EXPORT_MAX_WIDTH,
      });
      const title = backdrop.querySelector('[data-html-title]');
      if (title) title.textContent = isLog
        ? `일반 HTML 미리보기 · ${LOG_HTML_LAYOUTS[state.layout].label}${isBuiltInLogLayout(state.layout) ? '' : ` / ${getLogHTMLVariantLabel(state.layout, state.color)}`}`
        : `일반 HTML 미리보기 · OOC / ${OOC_HTML_LAYOUTS[state.layout].label}`;
      const colorSelect = backdrop.querySelector('[data-html-color]');
      if (colorSelect) colorSelect.disabled = false;
      const fontSelect = backdrop.querySelector('[data-html-font]');
      if (fontSelect) fontSelect.disabled = false;
    };
    const syncFontSizeControl = () => {
      const output = backdrop.querySelector('[data-html-font-size-output]');
      const minus = backdrop.querySelector('[data-html-font-size-minus]');
      const plus = backdrop.querySelector('[data-html-font-size-plus]');
      if (output) output.textContent = `${state.fontSizePt > 0 ? '+' : ''}${state.fontSizePt} pt`;
      if (minus) minus.disabled = state.fontSizePt <= EXPORT_FONT_SIZE_PT_MIN;
      if (plus) plus.disabled = state.fontSizePt >= EXPORT_FONT_SIZE_PT_MAX;
    };
    const render = () => {
      const token = ++previewRenderToken;
      ensureExportFonts(state.font);
      syncFontSizeControl();
      paintPreview();
      // 처음 선택한 웹폰트는 stylesheet가 도착하기 전 폴백으로 잠깐 보일 수 있다.
      // 로드가 끝난 시점에 최신 상태만 한 번 다시 그려 확실히 실제 폰트로 바꾼다.
      void waitForExportFont(state.font).then(() => {
        if (token !== previewRenderToken || !backdrop.isConnected) return;
        paintPreview();
      });
    };
    render();

    const close = () => backdrop.remove();
    backdrop.querySelector('[data-html-close]')?.addEventListener('click', close);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    backdrop.querySelector('[data-html-layout]')?.addEventListener('change', (event) => {
      state.layout = isLog ? normalizeLogHTMLLayout(event.target.value) : normalizeOOCHTMLLayout(event.target.value);
      if (isLog) {
        state.color = normalizeLogHTMLColor(state.color, state.layout);
        const colorSelect = backdrop.querySelector('[data-html-color]');
        if (colorSelect) colorSelect.innerHTML = getLogHTMLColorOptionsHTML(state.color, state.layout);
      }
      render();
    });
    backdrop.querySelector('[data-html-color]')?.addEventListener('change', (event) => {
      state.color = normalizeLogHTMLColor(event.target.value, state.layout);
      render();
    });
    backdrop.querySelector('[data-html-font]')?.addEventListener('change', (event) => {
      state.font = normalizeCOAFont(event.target.value);
      render();
    });
    backdrop.querySelector('[data-html-font-size-minus]')?.addEventListener('click', () => {
      state.fontSizePt = normalizeExportFontSizePt(state.fontSizePt - 1);
      render();
    });
    backdrop.querySelector('[data-html-font-size-plus]')?.addEventListener('click', () => {
      state.fontSizePt = normalizeExportFontSizePt(state.fontSizePt + 1);
      render();
    });
    backdrop.querySelector('[data-html-font-size-output]')?.addEventListener('click', () => {
      state.fontSizePt = EXPORT_FONT_SIZE_PT_DEFAULT;
      render();
    });
    backdrop.querySelector('[data-html-replace]')?.addEventListener('change', (event) => {
      state.applyReplacements = event.target.checked === true;
      render();
    });
    backdrop.querySelector('[data-html-exclude-code]')?.addEventListener('change', (event) => {
      state.excludeCodeBlocks = event.target.checked === true;
      render();
    });
    backdrop.querySelectorAll('[data-html-meta]').forEach((field) => {
      field.addEventListener('change', () => {
        const key = field.getAttribute('data-html-meta');
        if (Object.prototype.hasOwnProperty.call(EXPORT_META_DEFAULTS, key)) state[key] = field.checked;
        render();
      });
    });
    backdrop.querySelector('[data-html-export]')?.addEventListener('click', (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try {
        const source = canvas.innerHTML || '';
        exportStandaloneHTMLFile(currentExportCard, source, state.font);
      } catch (error) {
        console.error('[COA:HTML] export failed:', error);
        alert(`HTML 저장 실패: ${error?.message || error}`);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
    backdrop.querySelector('[data-html-png]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true;
      try {
        await coaExportPNG(card.id, { layout: state.layout, color: state.color, font: state.font, fontSizePt: state.fontSizePt, showTitle: state.showTitle, showTags: state.showTags, showDate: state.showDate, showReference: state.showReference, excludeCodeBlocks: state.excludeCodeBlocks, applyReplacements: state.applyReplacements, replacementRules });
      } catch (error) {
        console.error('[COA:PNG] export failed:', error);
        alert(`PNG 저장 실패: ${error.message || error}`);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
    getBodyMount().appendChild(backdrop);
  }

  async function coaOpenDCPreview(id) {
    const card = await coaLoadCard(id);
    if (!card) {
      alert('DC로 내보낼 카드를 찾지 못했습니다.');
      return;
    }

    const existing = document.querySelector('.coa-dc-modal');
    if (existing) existing.remove();
    ensureViewerStyle();
    const replacementRules = await getExportReplacementRules();

    const archiveType = normalizeArchiveType(card.archiveType, 'ooc');
    const rawInitialDCTheme = card.dc?.logTheme || DC_DEFAULT_OPTIONS.logTheme;
    const initialDCTheme = normalizeDCLogTheme(rawInitialDCTheme);
    const state = {
      exportStyle: normalizeDCExportStyle(
        archiveType,
        archiveType === 'log' ? DC_DEFAULT_OPTIONS.logStyle : DC_DEFAULT_OPTIONS.oocStyle,
      ),
      logTheme: initialDCTheme,
      logColor: normalizeDCLogColor(card.dc?.logColor || DC_DEFAULT_OPTIONS.logColor, rawInitialDCTheme),
      font: normalizeDCFont(card.dc?.font || (archiveType === 'log' ? getSuggestedDCFontForTheme(initialDCTheme) : DC_DEFAULT_OPTIONS.font)),
      fontSizePt: normalizeExportFontSizePt(DC_DEFAULT_OPTIONS.fontSizePt),
      includeTables: DC_DEFAULT_OPTIONS.includeTables,
      excludeImages: DC_DEFAULT_OPTIONS.excludeImages,
      excludeCodeBlocks: DC_DEFAULT_OPTIONS.excludeCodeBlocks,
      excludeComments: DC_DEFAULT_OPTIONS.excludeComments,
      replaceEmoji: DC_DEFAULT_OPTIONS.replaceEmoji,
      removeEmoji: DC_DEFAULT_OPTIONS.removeEmoji,
      autoStructure: DC_DEFAULT_OPTIONS.autoStructure,
      forceWordWrap: DC_DEFAULT_OPTIONS.forceWordWrap,
      ...EXPORT_META_DEFAULTS,
      maxWidth: DC_DEFAULT_OPTIONS.maxWidth,
      advancedOpen: false,
      applyReplacements: false,
    };

    const modal = document.createElement('section');
    modal.className = 'coa-modal coa-dc-modal';
    applyViewerThemeToElement(modal);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '디시 HTML 내보내기');

    const render = () => {
      const exportCard = state.applyReplacements ? applyExportReplacementsToCard(card, replacementRules) : card;
      const html = coaToInlineHTML(exportCard, state);
      const htmlLength = html.length;
      const isLog = archiveType === 'log';
      const styleLabel = isLog ? '로그 출력' : 'OOC 문서 서식';

      modal.innerHTML = `
        <div class="coa-dc-panel">
          <header class="coa-edit-head">
            <h2>디시 HTML 내보내기</h2>
            <button type="button" class="coa-btn ghost" data-dc-action="close">닫기</button>
          </header>
          <div class="coa-dc-body">
            <iframe class="coa-dc-preview" sandbox="allow-same-origin" srcdoc="${escapeHTML(html)}"></iframe>
            <aside class="coa-dc-options">
              ${isLog ? `<div class="coa-dc-choice-grid"><div class="coa-field"><label>테마</label><select class="coa-select" data-dc-field="logTheme">${getDCLogThemeOptionsHTML(state.logTheme)}</select></div><div class="coa-field"><label>색상</label><select class="coa-select" data-dc-field="logColor">${getDCLogColorOptionsHTML(state.logColor, state.logTheme)}</select></div></div>` : `<div class="coa-field"><label>${styleLabel}</label><select class="coa-select" data-dc-field="exportStyle">${getDCExportStyleOptionsHTML(archiveType, state.exportStyle)}</select></div>`}
              <div class="coa-field"><label>폰트</label><select class="coa-select" data-dc-field="font">${getDCFontOptionsHTML(state.font)}</select><div class="coa-dc-field-hint">실제 DC에서 한글·영문 표시를 확인한 글꼴만 표시됩니다.</div></div>
              <div class="coa-dc-font-size-control" role="group" aria-label="DC 글자 크기 조절"><span class="coa-dc-option-title">글자 크기</span><div class="coa-dc-font-size-stepper"><button type="button" class="coa-btn sm" data-dc-font-size-minus aria-label="DC 글자 크기 1포인트 줄이기"${state.fontSizePt <= EXPORT_FONT_SIZE_PT_MIN ? ' disabled' : ''}>−</button><output data-dc-font-size-output title="기본 크기로 초기화">${state.fontSizePt > 0 ? '+' : ''}${state.fontSizePt} pt</output><button type="button" class="coa-btn sm" data-dc-font-size-plus aria-label="DC 글자 크기 1포인트 늘리기"${state.fontSizePt >= EXPORT_FONT_SIZE_PT_MAX ? ' disabled' : ''}>＋</button></div></div>
              <label class="coa-check"><input type="checkbox" data-dc-field="applyReplacements" ${state.applyReplacements ? 'checked' : ''}${replacementRules.length ? '' : ' disabled'}> 단어 치환 적용${replacementRules.length ? ` · ${replacementRules.length}개 규칙` : ' · 설정된 규칙 없음'}</label>
              <div class="coa-dc-note"><b>저장함 분류: ${escapeHTML(ARCHIVE_LABELS[archiveType])}</b><br>${isLog ? '선택한 테마·색상·폰트로 DC용 HTML 코드를 생성합니다.' : 'OOC 서식만 표시됩니다. 내용이 대화형이어도 로그로 자동 판정하지 않습니다.'}<br>출력 코드 ${htmlLength.toLocaleString()}자${htmlLength > 60000 ? ' · 매우 길어서 디시 등록 시 잘릴 수 있음' : ''}</div>
              <details class="coa-dc-advanced"${state.advancedOpen ? ' open' : ''}>
                <summary>고급 설정</summary>
                <div class="coa-dc-option-group"><div class="coa-dc-option-title">고정 정보 표시</div><label class="coa-check" title="카드 제목 영역을 표시합니다. 끄면 빈 제목 틀과 제목 전용 알림도 함께 정리됩니다."><input type="checkbox" data-dc-field="showTitle" ${state.showTitle ? 'checked' : ''}> 제목</label><label class="coa-check"><input type="checkbox" data-dc-field="showTags" ${state.showTags ? 'checked' : ''}> 태그</label><label class="coa-check"><input type="checkbox" data-dc-field="showDate" ${state.showDate ? 'checked' : ''}> 날짜·시간</label><label class="coa-check"><input type="checkbox" data-dc-field="showReference" ${state.showReference ? 'checked' : ''}> 참조·관리번호</label></div>
                ${!isLog ? '<label class="coa-check" title="key:value 목록과 표를 DC용 구조로 정리합니다."><input type="checkbox" data-dc-field="autoStructure" ' + (state.autoStructure ? 'checked' : '') + '> 표/목록 자동 정리</label>' : ''}
                <label class="coa-check" title="디시에서 한글이 한 글자씩 끊기는 현상을 줄입니다."><input type="checkbox" data-dc-field="forceWordWrap" ${state.forceWordWrap ? 'checked' : ''}> 줄바꿈 깨짐 방지</label>
                <label class="coa-check" title="표를 그대로 포함합니다."><input type="checkbox" data-dc-field="includeTables" ${state.includeTables ? 'checked' : ''}> 본문 표 포함</label>
                <label class="coa-check" title="본문 안의 이미지를 제외합니다."><input type="checkbox" data-dc-field="excludeImages" ${state.excludeImages ? 'checked' : ''}> 이미지 제외</label>
                <label class="coa-check" title="여러 줄 코드블록만 제외하고 한 줄 인라인 코드는 유지합니다."><input type="checkbox" data-dc-field="excludeCodeBlocks" ${state.excludeCodeBlocks ? 'checked' : ''}> 코드블록 제외</label>
                <label class="coa-check" title="HTML 주석과 Markdown 숨김 주석을 제외합니다."><input type="checkbox" data-dc-field="excludeComments" ${state.excludeComments ? 'checked' : ''}> 주석 제외</label>
                <div class="coa-dc-option-group"><div class="coa-dc-option-title">DC 이모지 처리</div><label class="coa-check" title="DC에서 깨지는 복합·최신 이모지를 안전 기호나 짧은 한글 표식으로 바꿉니다. 확인된 문자형 기호는 유지합니다."><input type="checkbox" data-dc-field="replaceEmoji" ${state.replaceEmoji ? 'checked' : ''}> 이모지 치환</label><label class="coa-check" title="컬러·복합 이모지를 삭제합니다. ★, ♥, ✦ 같은 안전한 문자 기호는 남깁니다."><input type="checkbox" data-dc-field="removeEmoji" ${state.removeEmoji ? 'checked' : ''}> 이모지 제거</label><div class="coa-dc-field-hint">둘 중 하나만 사용할 수 있으며, 둘 다 끄면 원문을 그대로 둡니다.</div></div>
              </details>
            </aside>
          </div>
          <footer class="coa-edit-foot">
            <button type="button" class="coa-btn primary" data-dc-action="copy-code">DC HTML 코드 복사</button>
            <button type="button" class="coa-btn ghost" data-dc-action="close">닫기</button>
          </footer>
        </div>
      `;
      bind();
    };

    const bind = () => {
      const advanced = modal.querySelector('.coa-dc-advanced');
      if (advanced) {
        advanced.addEventListener('toggle', () => {
          state.advancedOpen = advanced.open;
        });
      }

      modal.querySelector('[data-dc-font-size-minus]')?.addEventListener('click', () => {
        state.fontSizePt = normalizeExportFontSizePt(state.fontSizePt - 1);
        render();
      });
      modal.querySelector('[data-dc-font-size-plus]')?.addEventListener('click', () => {
        state.fontSizePt = normalizeExportFontSizePt(state.fontSizePt + 1);
        render();
      });
      modal.querySelector('[data-dc-font-size-output]')?.addEventListener('click', () => {
        state.fontSizePt = EXPORT_FONT_SIZE_PT_DEFAULT;
        render();
      });

      modal.querySelectorAll('[data-dc-field]').forEach((field) => {
        const evtName = field.tagName === 'TEXTAREA' ? 'input' : 'change';
        field.addEventListener(evtName, () => {
          const key = field.getAttribute('data-dc-field');
          if (key === 'exportStyle') state.exportStyle = normalizeDCExportStyle(archiveType, field.value);
          else if (key === 'logTheme') { state.logTheme = normalizeDCLogTheme(field.value); state.logColor = normalizeDCLogColor(state.logColor, state.logTheme); state.font = normalizeDCFont(getSuggestedDCFontForTheme(state.logTheme)); }
          else if (key === 'logColor') state.logColor = normalizeDCLogColor(field.value, state.logTheme);
          else if (key === 'font') state.font = normalizeDCFont(field.value);
          else if (key === 'includeTables') state.includeTables = field.checked;
          else if (key === 'excludeImages') state.excludeImages = field.checked;
          else if (key === 'excludeCodeBlocks') state.excludeCodeBlocks = field.checked;
          else if (key === 'excludeComments') state.excludeComments = field.checked;
          else if (key === 'replaceEmoji') { state.replaceEmoji = field.checked; if (field.checked) state.removeEmoji = false; }
          else if (key === 'removeEmoji') { state.removeEmoji = field.checked; if (field.checked) state.replaceEmoji = false; }
          else if (key === 'autoStructure') state.autoStructure = field.checked;
          else if (key === 'forceWordWrap') state.forceWordWrap = field.checked;
          else if (key === 'showTitle') state.showTitle = field.checked;
          else if (key === 'showTags') state.showTags = field.checked;
          else if (key === 'showDate') state.showDate = field.checked;
          else if (key === 'showReference') state.showReference = field.checked;
          else if (key === 'applyReplacements') state.applyReplacements = field.checked;
          render();
        });
      });

      modal.querySelectorAll('[data-dc-action]').forEach((button) => {
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const action = button.getAttribute('data-dc-action');
          if (button.disabled) return;
          try {
            if (action === 'close') modal.remove(); else if (action === 'copy-code') {
              button.disabled = true;
              await coaCopyHTMLSource(card.id, { ...state, applyReplacements: state.applyReplacements, replacementRules });
              alert('DC HTML 코드 복사 완료. 디시 HTML 모드에 붙여넣으면 됨.');
            }
          } catch (error) {
            console.error('[COA:DC] action failed:', error);
            alert(`DC 복사 실패: ${error.message || error}`);
          } finally {
            if (button.isConnected) button.disabled = false;
          }
        });
      });
    };

    render();
    const root = viewerState.root || getViewerRoot();
    root.appendChild(modal);
  }


  function getArchiveOptionsHTML(selected = 'ooc') {
    const clean = normalizeArchiveType(selected, 'ooc');
    return ARCHIVE_TYPES.map((type) => `<option value="${escapeHTML(type)}"${type === clean ? ' selected' : ''}>${escapeHTML(ARCHIVE_LABELS[type] || type)}</option>`).join('');
  }

  function getArchiveChoiceBoxesHTML(selected = 'ooc', inputName = 'archiveType') {
    const clean = normalizeArchiveType(selected, 'ooc');
    const descriptions = {
      ooc: '글 한 편을 그대로 보관',
      log: 'USER와 AI 대화를 시간순 로그로 보관',
    };
    return `<div class="coa-archive-choice" role="radiogroup" aria-label="저장 형식">${ARCHIVE_TYPES.map((type) => `
      <label class="coa-archive-option">
        <input type="radio" name="${escapeHTML(inputName)}" value="${escapeHTML(type)}"${type === clean ? ' checked' : ''}>
        <span class="coa-archive-option-card">
          <b>${escapeHTML(ARCHIVE_LABELS[type] || type)}</b>
          <small>${escapeHTML(descriptions[type] || '')}</small>
        </span>
      </label>`).join('')}</div>`;
  }


  function getChatTitle() {
    for (const selector of SELECTORS.chatTitleCandidates) {
      try {
        const el = document.querySelector(selector);
        if (!el) continue;
        const text = selector === 'title' ? document.title : normalizeText(el.textContent || el.getAttribute('content') || '');
        if (text) return text;
      } catch (_) {}
    }
    return document.title || '';
  }

  function removeCOAElement(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function isCOAEpisodePage(url = location.href) {
    try {
      const parsed = new URL(url, location.origin);
      return parsed.hostname === 'crack.wrtn.ai'
        && /^\/stories\/[^/]+\/episodes\/[^/]+\/?$/.test(parsed.pathname);
    } catch (_) {
      return false;
    }
  }

  function coaUnmountCollectorButton() {
    removeCOAElement(document.getElementById('coa-sidebar-button'));
    removeCOAElement(document.getElementById('coa-launcher-fallback'));
    coaResetMessageRangeSelection({ removeBar: true });
    document.querySelectorAll('.coa-message-range-btn,.coa-message-range-user-row,.coa-message-range-fallback-row').forEach(removeCOAElement);
    document.querySelectorAll('[data-coa-range-start],[data-coa-range-end]').forEach((group) => {
      group.removeAttribute('data-coa-range-start');
      group.removeAttribute('data-coa-range-end');
    });

    if (collectorState.sidebarObserver) {
      collectorState.sidebarObserver.disconnect();
      collectorState.sidebarObserver = null;
    }
    if (collectorState.sidebarTimer) {
      clearTimeout(collectorState.sidebarTimer);
      collectorState.sidebarTimer = null;
    }
    if (collectorState.messageObserver) {
      collectorState.messageObserver.disconnect();
      collectorState.messageObserver = null;
    }
    collectorState.messageObserverRoot = null;
    if (collectorState.messageEventRoot && collectorState.messageEventHandler) {
      collectorState.messageEventRoot.removeEventListener('click', collectorState.messageEventHandler);
    }
    collectorState.messageEventRoot = null;
    collectorState.messageEventHandler = null;
    if (collectorState.messageScanTimer) {
      clearTimeout(collectorState.messageScanTimer);
      collectorState.messageScanTimer = null;
    }
  }

  function syncCOACollectorRoute() {
    const nextURL = location.href;
    if (collectorState.routeURL && collectorState.routeURL !== nextURL) {
      coaResetMessageRangeSelection({ removeBar: true });
    }
    collectorState.routeURL = nextURL;

    if (isCOAEpisodePage(nextURL)) {
      coaMountCollectorButton();
    } else {
      coaUnmountCollectorButton();
    }
  }

  function installCOACollectorRouteWatcher() {
    if (collectorState.routeListenerInstalled) {
      syncCOACollectorRoute();
      return;
    }
    collectorState.routeListenerInstalled = true;
    collectorState.routeURL = location.href;

    let routeFrame = 0;
    const scheduleRouteSync = () => {
      if (routeFrame) return;
      routeFrame = requestAnimationFrame(() => {
        routeFrame = 0;
        if (collectorState.routeURL !== location.href) syncCOACollectorRoute();
      });
    };
    ['pushState', 'replaceState'].forEach((method) => {
      try {
        const original = history[method];
        if (typeof original !== 'function' || original.__coaWrapped) return;
        const wrapped = function (...args) {
          const before = location.href;
          const result = original.apply(this, args);
          if (before !== location.href) scheduleRouteSync();
          return result;
        };
        Object.defineProperty(wrapped, '__coaWrapped', { value: true });
        history[method] = wrapped;
      } catch (_) {}
    });

    window.addEventListener('popstate', scheduleRouteSync, { passive: true });
    window.addEventListener('hashchange', scheduleRouteSync, { passive: true });
    syncCOACollectorRoute();
  }

  function ensureCollectorStyle() {
    if (document.getElementById('coa-collector-style')) return;
    const style = document.createElement('style');
    style.id = 'coa-collector-style';
    style.textContent = `
      #coa-sidebar-button{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;}
      #coa-sidebar-button button{font:inherit;}
      #coa-launcher-fallback{position:fixed;left:0;top:45%;z-index:2147483300;font-family:'IBM Plex Mono',ui-monospace,monospace;}
      .coa-launcher-fallback-btn{appearance:none;border:1.5px solid #161513;border-left:0;border-radius:0;background:#F7F7F4;color:#161513;padding:10px 8px;box-shadow:3px 3px 0 rgba(22,21,19,.85);font:600 .68rem/1.2 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em;cursor:pointer;writing-mode:vertical-rl;}
      .coa-launcher-fallback-btn:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 rgba(22,21,19,.88);}
      .coa-launcher-fallback-btn:active{transform:none;box-shadow:none;}
      .coa-message-range-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;min-width:22px;min-height:22px;margin:0 2px;padding:0;border:0;border-radius:6px;background:rgba(110,118,132,.08);color:var(--icon_tertiary,var(--text_tertiary,#777));opacity:.12;cursor:pointer;box-shadow:none;line-height:1;vertical-align:middle;transition:opacity .15s ease,background-color .15s ease,color .15s ease,transform .15s ease;-webkit-tap-highlight-color:transparent;}
      .coa-message-range-btn svg{display:block;width:14px;height:14px;pointer-events:none;}
      main [data-message-group-id]:hover .coa-message-range-btn,.coa-message-range-btn:focus-visible{opacity:.46;}
      .coa-message-range-btn:hover{opacity:.72!important;background:rgba(110,118,132,.16);}
      .coa-message-range-btn:active{transform:scale(.92);}
      .coa-message-range-btn[data-state="start"],.coa-message-range-btn[data-state="end"]{opacity:.82!important;color:#657793;background:rgba(101,119,147,.16);}
      .coa-message-range-btn[data-state="busy"]{opacity:.5!important;cursor:wait;}
      .coa-message-range-user-row{display:flex;justify-content:flex-end;align-items:center;height:0;min-height:0;overflow:visible;position:relative;z-index:2;pointer-events:none;}
      .coa-message-range-user-row>.coa-message-range-btn{position:relative;top:2px;pointer-events:auto;}
      .coa-message-range-fallback-row{display:flex;justify-content:flex-end;align-items:center;height:0;min-height:0;overflow:visible;position:relative;z-index:2;pointer-events:none;}
      .coa-message-range-fallback-row>.coa-message-range-btn{position:relative;top:2px;pointer-events:auto;}
      #coa-message-range-bar{position:fixed;left:50%;bottom:max(88px,calc(env(safe-area-inset-bottom,0px) + 76px));z-index:2147483290;display:flex;align-items:center;gap:7px;max-width:calc(100vw - 24px);min-height:34px;padding:6px 7px 6px 0;border:1.5px solid rgba(22,21,19,.5);border-radius:0;background:rgba(247,247,244,.86);color:#161513;box-shadow:3px 3px 0 rgba(22,21,19,.2);backdrop-filter:blur(10px) saturate(108%);-webkit-backdrop-filter:blur(10px) saturate(108%);transform:translateX(-50%);font:600 10.5px/1.25 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.025em;}
      #coa-message-range-bar[data-status="loading"]{opacity:.8;}
      .coa-message-range-kicker{align-self:stretch;display:inline-flex;align-items:center;justify-content:center;min-width:44px;padding:0 7px;border-right:1.5px solid rgba(22,21,19,.5);background:rgba(22,21,19,.88);color:#F7F7F4;font-size:8.5px;font-weight:600;letter-spacing:.13em;white-space:nowrap;}
      .coa-message-range-text{min-width:0;max-width:min(52vw,280px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .coa-message-range-action{appearance:none;border:1.5px solid rgba(22,21,19,.48);border-radius:0;background:rgba(247,247,244,.46);color:inherit;padding:5px 8px;font:600 9.5px/1.15 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.04em;white-space:nowrap;cursor:pointer;box-shadow:none;transition:transform .08s,box-shadow .08s,background .08s;-webkit-tap-highlight-color:transparent;}
      .coa-message-range-action:hover{background:rgba(228,227,222,.72);box-shadow:2px 2px 0 rgba(22,21,19,.18);transform:translate(-1px,-1px);}
      .coa-message-range-action:active{box-shadow:none;transform:none;}
      .coa-message-range-action.primary{border-color:rgba(22,21,19,.72);background:rgba(22,21,19,.88);color:#F7F7F4;}
      .coa-message-range-action:disabled{opacity:.38;cursor:default;}
      #coa-message-range-toast{position:fixed;left:50%;bottom:max(88px,calc(env(safe-area-inset-bottom,0px) + 76px));z-index:2147483291;display:flex;align-items:stretch;max-width:calc(100vw - 28px);min-height:32px;padding:0;border:1.5px solid rgba(22,21,19,.48);border-radius:0;background:rgba(247,247,244,.87);color:#161513;box-shadow:3px 3px 0 rgba(22,21,19,.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transform:translateX(-50%);font:600 10.5px/1.3 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.025em;pointer-events:none;}
      .coa-message-range-toast-mark{display:inline-flex;align-items:center;padding:0 8px;border-right:1.5px solid rgba(22,21,19,.48);background:rgba(22,21,19,.88);color:#F7F7F4;font-size:8.5px;letter-spacing:.14em;}
      .coa-message-range-toast-text{display:inline-flex;align-items:center;padding:7px 10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      @media(prefers-color-scheme:dark){
        .coa-launcher-fallback-btn{border-color:#EDEBE4;background:#201F1D;color:#EDEBE4;box-shadow:3px 3px 0 rgba(237,235,228,.8);}
        .coa-launcher-fallback-btn:hover{box-shadow:4px 4px 0 rgba(237,235,228,.84);}
        #coa-message-range-bar,#coa-message-range-toast{border-color:rgba(237,235,228,.46);background:rgba(32,31,29,.86);color:#EDEBE4;box-shadow:3px 3px 0 rgba(237,235,228,.14);}
        .coa-message-range-kicker,.coa-message-range-toast-mark{border-color:rgba(237,235,228,.46);background:rgba(237,235,228,.88);color:#161614;}
        .coa-message-range-action{border-color:rgba(237,235,228,.42);background:rgba(32,31,29,.42);}
        .coa-message-range-action:hover{background:rgba(42,41,38,.82);box-shadow:2px 2px 0 rgba(237,235,228,.13);}
        .coa-message-range-action.primary{border-color:rgba(237,235,228,.7);background:rgba(237,235,228,.88);color:#161614;}
      }
      #coa-message-range-bar[data-theme="dark"],#coa-message-range-toast[data-theme="dark"]{border-color:rgba(237,235,228,.46);background:rgba(32,31,29,.86);color:#EDEBE4;box-shadow:3px 3px 0 rgba(237,235,228,.14);}
      #coa-message-range-bar[data-theme="dark"] .coa-message-range-kicker,#coa-message-range-toast[data-theme="dark"] .coa-message-range-toast-mark{border-color:rgba(237,235,228,.46);background:rgba(237,235,228,.88);color:#161614;}
      #coa-message-range-bar[data-theme="dark"] .coa-message-range-action{border-color:rgba(237,235,228,.42);background:rgba(32,31,29,.42);}
      #coa-message-range-bar[data-theme="dark"] .coa-message-range-action:hover{background:rgba(42,41,38,.82);box-shadow:2px 2px 0 rgba(237,235,228,.13);}
      #coa-message-range-bar[data-theme="dark"] .coa-message-range-action.primary{border-color:rgba(237,235,228,.7);background:rgba(237,235,228,.88);color:#161614;}
      @media(hover:none),(pointer:coarse){
        .coa-message-range-btn{width:24px;height:24px;min-width:24px;min-height:24px;opacity:.2;}
        .coa-message-range-btn svg{width:14px;height:14px;}
        #coa-message-range-bar{bottom:max(82px,calc(env(safe-area-inset-bottom,0px) + 70px));}
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getBodyMount() {
    return document.body || document.documentElement;
  }


  const COA_MESSAGE_GROUP_SELECTOR = 'main [data-message-group-id]';
  const COA_MESSAGE_COMPARE_RE = /답변\s*비교\s*(\d+)\s*\/\s*(\d+)/;
  const COA_MESSAGE_RANGE_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 5.5h14v13H5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
      <path d="M8 5.5v5l4-2.1 4 2.1v-5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path>
    </svg>`;

  function coaGetMessageGroupId(group) {
    return normalizeText(group?.getAttribute?.('data-message-group-id'));
  }

  function coaParseMessageCompare(group) {
    const button = [...(group?.querySelectorAll?.('button') || [])]
      .find((candidate) => COA_MESSAGE_COMPARE_RE.test(normalizeText(candidate.textContent)));
    const match = normalizeText(button?.textContent).match(COA_MESSAGE_COMPARE_RE);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    return Number.isFinite(current) && Number.isFinite(total) && current > 0 && total > 1
      ? { current, total }
      : null;
  }

  function coaFindMessageActionAnchor(group) {
    const buttons = [...(group?.querySelectorAll?.('button') || [])];
    const compare = buttons.find((button) => COA_MESSAGE_COMPARE_RE.test(normalizeText(button.textContent)));
    if (compare) return compare;

    const option = group?.querySelector?.('button[aria-label="메시지 옵션"]');
    const reroll = buttons.find((button) => {
      if (!button || button === option || button.closest('.dropdown-button')) return false;
      const html = button.innerHTML || '';
      return html.includes('M3.8 12') || html.includes('A9.8 9.8') || /viewBox="0 0 24 24"[\s\S]*?M3\.8\s+12/.test(html);
    });
    if (reroll) return reroll;
    return option?.closest('.dropdown-button') || option || null;
  }

  function coaIsUserMessageGroup(group) {
    return Boolean(group?.querySelector?.('div.relative.mb-5.w-full.items-end,div.relative.mb-5.items-end,div[class*="border-y"][class*="py-5"]'));
  }

  function coaSyncMessageRangeMarker(group) {
    if (!(group instanceof Element)) return;
    const id = coaGetMessageGroupId(group);
    const isStart = Boolean(id) && id === collectorState.rangeStartId;
    const isEnd = Boolean(id) && id === collectorState.rangeEndId;
    if (isStart) group.setAttribute('data-coa-range-start', '1');
    else group.removeAttribute('data-coa-range-start');
    if (isEnd) group.setAttribute('data-coa-range-end', '1');
    else group.removeAttribute('data-coa-range-end');

    const button = group.querySelector('.coa-message-range-btn');
    if (!button) return;
    button.dataset.state = isStart ? 'start' : (isEnd ? 'end' : 'idle');
    button.setAttribute('aria-pressed', isStart || isEnd ? 'true' : 'false');
    button.title = '저장할 로그 선택';
  }

  function coaSyncMessageRangeMarkers() {
    document.querySelectorAll(COA_MESSAGE_GROUP_SELECTOR).forEach(coaSyncMessageRangeMarker);
  }

  function coaResetMessageRangeSelection(options = {}) {
    collectorState.rangeToken += 1;
    collectorState.rangeStartId = '';
    collectorState.rangeEndId = '';
    collectorState.rangeBusy = false;
    collectorState.rangePrepared = null;
    document.querySelectorAll('[data-coa-range-start],[data-coa-range-end]').forEach((group) => {
      group.removeAttribute('data-coa-range-start');
      group.removeAttribute('data-coa-range-end');
    });
    document.querySelectorAll('.coa-message-range-btn').forEach((button) => {
      button.dataset.state = 'idle';
      button.setAttribute('aria-pressed', 'false');
      button.title = '저장할 로그 선택';
    });
    if (options.removeBar !== false) removeCOAElement(document.getElementById('coa-message-range-bar'));
  }

  function coaShowMessageRangeToast(text) {
    ensureCollectorStyle();
    let toast = document.getElementById('coa-message-range-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'coa-message-range-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      getBodyMount().appendChild(toast);
    }
    applyViewerThemeToElement(toast);
    const cleanText = normalizeText(text);
    toast.setAttribute('aria-label', cleanText);
    toast.innerHTML = `<span class="coa-message-range-toast-mark">CA</span><span class="coa-message-range-toast-text">${escapeHTML(cleanText)}</span>`;
    clearTimeout(coaShowMessageRangeToast._timer);
    coaShowMessageRangeToast._timer = setTimeout(() => removeCOAElement(toast), 1800);
  }

  function coaRenderMessageRangeBar({ text, status = 'ready', canSave = false } = {}) {
    ensureCollectorStyle();
    let bar = document.getElementById('coa-message-range-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'coa-message-range-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      getBodyMount().appendChild(bar);
    }
    applyViewerThemeToElement(bar);
    bar.dataset.status = status;
    const statusLabel = ({ start: 'RANGE', loading: 'READ', ready: 'READY', error: 'ERROR' })[status] || 'RANGE';
    bar.innerHTML = `
      <span class="coa-message-range-kicker">${statusLabel}</span>
      <span class="coa-message-range-text">${escapeHTML(text || '')}</span>
      ${canSave ? '<button type="button" class="coa-message-range-action primary" data-coa-range-save>저장</button>' : ''}
      <button type="button" class="coa-message-range-action" data-coa-range-cancel>취소</button>`;
    bar.querySelector('[data-coa-range-cancel]')?.addEventListener('click', () => coaResetMessageRangeSelection({ removeBar: true }));
    bar.querySelector('[data-coa-range-save]')?.addEventListener('click', () => { void coaSavePreparedMessageRange(); });
    return bar;
  }

  function coaCreateMessageRangeButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'coa-message-range-btn';
    button.dataset.state = 'idle';
    button.setAttribute('aria-label', '저장할 로그 선택');
    button.setAttribute('aria-pressed', 'false');
    button.title = '저장할 로그 선택';
    button.innerHTML = COA_MESSAGE_RANGE_ICON;
    return button;
  }

  function coaEnsureMessageRangeButton(group) {
    if (!isCOAEpisodePage() || !(group instanceof HTMLElement)) return null;
    const messageId = coaGetMessageGroupId(group);
    if (!messageId) return null;
    const existing = group.querySelector('.coa-message-range-btn');
    if (existing) return existing;

    const button = coaCreateMessageRangeButton();
    if (coaIsUserMessageGroup(group)) {
      const wrap = group.querySelector('div.relative.mb-5.w-full.items-end,div.relative.mb-5.items-end') || group;
      let row = [...wrap.children].find((child) => child.classList?.contains('coa-message-range-user-row')) || null;
      if (!row) {
        row = document.createElement('div');
        row.className = 'coa-message-range-user-row';
        wrap.appendChild(row);
      }
      row.appendChild(button);
      button.dataset.placement = 'user';
    } else {
      const anchor = coaFindMessageActionAnchor(group);
      if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(button, anchor);
        button.dataset.placement = 'actions';
      } else {
        let row = [...group.children].find((child) => child.classList?.contains('coa-message-range-fallback-row')) || null;
        if (!row) {
          row = document.createElement('div');
          row.className = 'coa-message-range-fallback-row';
          group.appendChild(row);
        }
        row.appendChild(button);
        button.dataset.placement = 'fallback';
      }
    }
    coaSyncMessageRangeMarker(group);
    return button;
  }

  function coaCollectMessageGroups(root) {
    const groups = new Set();
    if (!(root instanceof Element)) return groups;
    // 보관함 자체 UI 변경은 크랙 채팅 메시지와 무관하다. 대량 로그 목록을 그릴 때
    // 각 행마다 채팅 메시지 선택 버튼 탐색을 반복하지 않도록 즉시 제외한다.
    if (root.closest?.('#coa-root,.coa-paste-backdrop,#coa-message-range-bar,#coa-message-range-toast')) return groups;
    if (root.matches(COA_MESSAGE_GROUP_SELECTOR)) groups.add(root);
    const closest = root.closest?.('[data-message-group-id]');
    if (closest?.closest('main')) groups.add(closest);
    root.querySelectorAll?.('[data-message-group-id]').forEach((group) => {
      if (group.closest('main')) groups.add(group);
    });
    return groups;
  }

  function coaMountMessageRangeButtons() {
    if (!isCOAEpisodePage() || collectorState.observersSuspended) return;
    ensureCollectorStyle();
    const main = document.querySelector('main');
    if (!main) return;
    if (collectorState.messageObserver && collectorState.messageObserverRoot === main && main.isConnected) return;
    if (collectorState.messageObserver) collectorState.messageObserver.disconnect();
    if (collectorState.messageEventRoot && collectorState.messageEventHandler) {
      collectorState.messageEventRoot.removeEventListener('click', collectorState.messageEventHandler);
    }
    collectorState.messageObserver = null;
    collectorState.messageObserverRoot = main;
    collectorState.messageEventRoot = main;
    collectorState.messageEventHandler = (event) => {
      const button = event.target instanceof Element ? event.target.closest('.coa-message-range-btn') : null;
      if (!button || !main.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const group = button.closest('[data-message-group-id]');
      if (group) void coaHandleMessageRangeClick(group);
    };
    main.addEventListener('click', collectorState.messageEventHandler);
    main.querySelectorAll('[data-message-group-id]').forEach(coaEnsureMessageRangeButton);
    collectorState.messageObserver = new MutationObserver((mutations) => {
      if (collectorState.observersSuspended) return;
      const groups = new Set();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => coaCollectMessageGroups(node).forEach((group) => groups.add(group)));
        const removedRangeUI = [...mutation.removedNodes].some((node) => node instanceof Element
          && (node.matches?.('.coa-message-range-btn,.coa-message-range-user-row,.coa-message-range-fallback-row')
            || node.querySelector?.('.coa-message-range-btn')));
        if (removedRangeUI && mutation.target instanceof Element) {
          const ownerGroup = mutation.target.closest?.('[data-message-group-id]');
          if (ownerGroup?.closest('main')) groups.add(ownerGroup);
        }
      });
      if (!groups.size) return;
      clearTimeout(collectorState.messageScanTimer);
      collectorState.messageScanTimer = setTimeout(() => {
        collectorState.messageScanTimer = null;
        if (!isCOAEpisodePage()) return;
        groups.forEach(coaEnsureMessageRangeButton);
      }, 80);
    });
    collectorState.messageObserver.observe(main, { childList: true, subtree: true });
  }

  function coaSuspendCollectorObservers() {
    collectorState.observersSuspended = true;
    if (collectorState.sidebarObserver) collectorState.sidebarObserver.disconnect();
    collectorState.sidebarObserver = null;
    if (collectorState.messageObserver) collectorState.messageObserver.disconnect();
    collectorState.messageObserver = null;
    collectorState.messageObserverRoot = null;
    if (collectorState.messageEventRoot && collectorState.messageEventHandler) {
      collectorState.messageEventRoot.removeEventListener('click', collectorState.messageEventHandler);
    }
    collectorState.messageEventRoot = null;
    collectorState.messageEventHandler = null;
    if (collectorState.messageScanTimer) clearTimeout(collectorState.messageScanTimer);
    collectorState.messageScanTimer = null;
    if (collectorState.sidebarTimer) clearTimeout(collectorState.sidebarTimer);
    collectorState.sidebarTimer = null;
  }

  function coaResumeCollectorObservers() {
    if (!collectorState.observersSuspended) return;
    collectorState.observersSuspended = false;
    if (isCOAEpisodePage()) coaMountCollectorButton();
  }

  function coaGetSelectedDOMRange(startId, endId) {
    const groups = [...document.querySelectorAll(COA_MESSAGE_GROUP_SELECTOR)];
    const startIndex = groups.findIndex((group) => coaGetMessageGroupId(group) === startId);
    const endIndex = groups.findIndex((group) => coaGetMessageGroupId(group) === endId);
    if (startIndex < 0 || endIndex < 0) throw new Error('선택한 메시지가 현재 화면에서 사라졌습니다. 범위를 다시 선택해줘.');
    const from = Math.min(startIndex, endIndex);
    const to = Math.max(startIndex, endIndex);
    const seen = new Set();
    return groups.slice(from, to + 1).map((group) => ({
      group,
      id: coaGetMessageGroupId(group),
      compare: coaParseMessageCompare(group),
    })).filter((item) => item.id && !seen.has(item.id) && seen.add(item.id));
  }

  function coaRawMessageId(message) {
    return normalizeText(message?._id || message?.id || message?.messageId);
  }

  async function coaFetchDOMRangeMessages(descriptors, info, token) {
    const wantedIds = new Set(descriptors.map((item) => item.id));
    const needsCompareTail = descriptors.some((item) => item.compare?.total > 1);
    const rawMessages = [];
    const rawIds = new Set();
    const seenCursors = new Set();
    const appendPage = (raw) => {
      (Array.isArray(raw) ? raw : []).forEach((message) => {
        const id = coaRawMessageId(message);
        if (!id || rawIds.has(id)) return;
        rawIds.add(id);
        rawMessages.push(message);
      });
    };

    const [detail, firstPage] = await Promise.all([
      coaFetchChatDetail(info.chatroomId),
      coaFetchMessagePage(info.chatroomId),
    ]);
    if (token !== collectorState.rangeToken) return null;
    appendPage(firstPage.raw);
    let nextCursor = firstPage.nextCursor;
    let fetchedCompareTail = false;

    while (true) {
      const allFound = [...wantedIds].every((id) => rawIds.has(id));
      if (allFound && (!needsCompareTail || fetchedCompareTail || !nextCursor)) break;
      if (!nextCursor) break;
      if (rawMessages.length >= COA_CHAT_API.hardLimit) break;
      if (seenCursors.has(nextCursor)) throw new Error('메시지 페이지 커서가 반복되어 범위 불러오기를 중단했습니다.');
      seenCursors.add(nextCursor);
      coaRenderMessageRangeBar({ text: `범위 확인 중 · ${rawMessages.length.toLocaleString()}개 불러옴`, status: 'loading' });
      const page = await coaFetchMessagePage(info.chatroomId, nextCursor);
      if (token !== collectorState.rangeToken) return null;
      appendPage(page.raw);
      nextCursor = page.nextCursor;
      if (allFound) fetchedCompareTail = true;
      if (nextCursor) await new Promise((resolve) => setTimeout(resolve, COA_CHAT_API.paginationDelay));
    }

    const missing = [...wantedIds].filter((id) => !rawIds.has(id));
    if (missing.length) throw new Error(`선택한 메시지 ${missing.length}개를 API 로그에서 찾지 못했습니다.`);

    const characterName = coaGetCharacterName(detail);
    const indexed = rawMessages.map((message, index) => ({ message, index, id: coaRawMessageId(message) }));
    const byId = new Map(indexed.map((item) => [item.id, item]));
    const resolved = [];
    const resolvedIds = new Set();

    descriptors.forEach((descriptor, descriptorIndex) => {
      const anchor = byId.get(descriptor.id);
      if (!anchor) return;
      let picked = anchor;
      const compare = descriptor.compare;
      const parentTurnId = normalizeText(anchor.message?.parentTurnId);
      if (compare && parentTurnId && String(anchor.message?.role || '').toLocaleLowerCase() === 'assistant') {
        const variants = indexed
          .filter((item) => String(item.message?.role || '').toLocaleLowerCase() === 'assistant'
            && normalizeText(item.message?.parentTurnId) === parentTurnId)
          .sort((a, b) => b.index - a.index);
        if (variants[compare.current - 1]) picked = variants[compare.current - 1];
      }
      if (resolvedIds.has(picked.id)) return;
      resolvedIds.add(picked.id);
      const normalized = normalizeLogMessage({
        id: picked.id,
        role: picked.message?.role,
        speaker: String(picked.message?.role || '').toLocaleLowerCase() === 'user' ? 'USER' : characterName,
        content: extractAPIMessageContent(picked.message),
        createdAt: picked.message?.createdAt || picked.message?.created_at || picked.message?.timestamp,
      }, descriptorIndex, characterName);
      if (normalizeText(normalized.content)) resolved.push({ message: normalized, index: picked.index });
    });

    resolved.sort((a, b) => b.index - a.index);
    const messages = resolved.map((item) => item.message);
    if (!messages.length) throw new Error('저장할 수 있는 로그 내용이 없습니다.');
    return { info, detail, characterName, messages };
  }

  async function coaPrepareMessageRange(startId, endId) {
    const token = ++collectorState.rangeToken;
    collectorState.rangeBusy = true;
    collectorState.rangePrepared = null;
    coaSyncMessageRangeMarkers();
    coaRenderMessageRangeBar({ text: '선택 범위를 확인하는 중…', status: 'loading' });
    try {
      const descriptors = coaGetSelectedDOMRange(startId, endId);
      const info = coaGetCurrentChatInfo();
      if (!info) throw new Error('현재 채팅방 정보를 찾지 못했습니다.');
      const prepared = await coaFetchDOMRangeMessages(descriptors, info, token);
      if (!prepared || token !== collectorState.rangeToken) return;
      collectorState.rangePrepared = prepared;
      collectorState.rangeBusy = false;
      coaRenderMessageRangeBar({ text: `${prepared.messages.length.toLocaleString()}개 로그 선택`, status: 'ready', canSave: true });
    } catch (error) {
      if (token !== collectorState.rangeToken) return;
      console.error('[COA:MESSAGE-RANGE] prepare failed:', error);
      coaResetMessageRangeSelection({ removeBar: true });
      alert(`로그 범위 확인 실패: ${error.message || error}`);
    }
  }

  async function coaHandleMessageRangeClick(group) {
    if (!isCOAEpisodePage() || collectorState.rangeBusy) return;
    const messageId = coaGetMessageGroupId(group);
    if (!messageId) return;

    if (!collectorState.rangeStartId) {
      collectorState.rangeStartId = messageId;
      collectorState.rangeEndId = '';
      collectorState.rangePrepared = null;
      coaSyncMessageRangeMarkers();
      coaRenderMessageRangeBar({ text: '시작점 선택됨', status: 'start' });
      return;
    }

    // 시작점과 같은 메시지를 다시 눌러도 취소하지 않는다.
    // start === end인 1개짜리 범위로 처리하면 기존 범위 저장 파이프라인을 그대로 재사용할 수 있다.
    collectorState.rangeEndId = messageId;
    collectorState.rangePrepared = null;
    coaSyncMessageRangeMarkers();
    await coaPrepareMessageRange(collectorState.rangeStartId, collectorState.rangeEndId);
  }

  async function coaSavePreparedMessageRange() {
    const prepared = collectorState.rangePrepared;
    if (!prepared || collectorState.rangeBusy || !prepared.messages?.length) return;
    collectorState.rangeBusy = true;
    coaRenderMessageRangeBar({ text: `${prepared.messages.length.toLocaleString()}개 로그 저장 중…`, status: 'loading' });
    try {
      const savedAt = nowMs();
      const messages = prepared.messages;
      const logData = normalizeLogData({
        chatroomId: prepared.info.chatroomId,
        characterId: prepared.info.characterId,
        characterName: prepared.characterName,
        firstMessageId: messages[0].id,
        lastMessageId: messages[messages.length - 1].id,
        messages,
        importedAt: savedAt,
      });
      const body = buildLogBody(messages);
      const card = normalizeCard({
        id: makeId(),
        archiveType: 'log',
        format: detectContentFormat(body),
        title: `${prepared.characterName} 로그 · ${formatDate(savedAt, true)}`,
        tags: [prepared.characterName],
        body,
        log: logData,
        dc: { logTheme: 'mungo' },
        createdAt: savedAt,
        updatedAt: savedAt,
        source: { url: location.href, chatTitle: getChatTitle(), from: 'api' },
      });
      const saved = await coaSaveCard(card);
      const count = saved.log?.messageCount || messages.length;
      coaResetMessageRangeSelection({ removeBar: true });
      coaShowMessageRangeToast(`로그 ${count.toLocaleString()}개 저장 완료`);
    } catch (error) {
      console.error('[COA:MESSAGE-RANGE] save failed:', error);
      collectorState.rangeBusy = false;
      coaRenderMessageRangeBar({ text: '로그 저장 실패', status: 'error', canSave: true });
      alert(`로그 저장 실패: ${error.message || error}`);
    }
  }


  function coaMountCollectorButton() {
    if (collectorState.observersSuspended) return document.getElementById('coa-sidebar-button');
    if (!isCOAEpisodePage()) {
      coaUnmountCollectorButton();
      return null;
    }

    ensureCollectorStyle();
    coaMountMessageRangeButtons();

    const inject = () => {
      if (!isCOAEpisodePage()) {
        coaUnmountCollectorButton();
        return null;
      }
      const existing = document.getElementById('coa-sidebar-button');
      if (existing?.isConnected) return existing;

      const anchors = Array.from(document.querySelectorAll('span')).filter((span) => {
        const text = normalizeText(span.textContent);
        return text === '나의 크래커' || text === '북마크';
      });
      const targetContainer = anchors.length ? anchors[anchors.length - 1].parentElement : null;
      if (!targetContainer) return null;

      const wrapper = document.createElement('div');
      wrapper.id = 'coa-sidebar-button';
      wrapper.className = 'px-2.5 h-4 box-content py-[18px]';
      wrapper.innerHTML = `
        <button type="button" class="w-full flex h-4 items-center justify-between typo-text-base_leading-none_medium space-x-2 ring-offset-4 ring-offset-sidebar" style="cursor:pointer;color:var(--text_primary);background:none;border:0;padding:0;">
          <span class="flex space-x-2 items-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" width="18" height="18" stroke="var(--icon_tertiary,#888)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z"></path><path d="M8 4v6l4-2 4 2V4"></path></svg>
            <span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">기록보관소</span>
          </span>
        </button>`;
      wrapper.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try { await coaOpenViewer(); }
        catch (error) {
          console.error('[COA:UI] open viewer failed:', error);
          alert(`Crack Archive 작업 실패: ${error.message || error}`);
        }
      });
      targetContainer.appendChild(wrapper);
      const fallback = document.getElementById('coa-launcher-fallback');
      if (fallback) fallback.remove();
      return wrapper;
    };

    const ensureFallback = () => {
      if (!isCOAEpisodePage()) {
        coaUnmountCollectorButton();
        return;
      }
      if (document.getElementById('coa-sidebar-button') || document.getElementById('coa-launcher-fallback')) return;
      const fallback = document.createElement('div');
      fallback.id = 'coa-launcher-fallback';
      fallback.innerHTML = '<button type="button" class="coa-launcher-fallback-btn" title="Crack Archive">CA</button>';
      fallback.querySelector('button').addEventListener('click', () => coaOpenViewer());
      getBodyMount().appendChild(fallback);
    };

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!isCOAEpisodePage()) {
          coaUnmountCollectorButton();
          return;
        }
        inject();
        coaMountMessageRangeButtons();
      });
    };
    if (!collectorState.sidebarObserver) {
      collectorState.sidebarObserver = new MutationObserver((mutations) => {
        if (collectorState.observersSuspended) return;
        const sidebarReady = document.getElementById('coa-sidebar-button')?.isConnected;
        const messageReady = collectorState.messageObserverRoot?.isConnected && collectorState.messageObserver;
        if (sidebarReady && messageReady) return;
        const hostChanged = mutations.some((mutation) => {
          const target = mutation.target;
          return !(target instanceof Element)
            || !target.closest('#coa-root,.coa-paste-backdrop,#coa-message-range-bar,#coa-message-range-toast');
        });
        if (hostChanged) schedule();
      });
      collectorState.sidebarObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    [150, 700, 1800].forEach((delay) => setTimeout(() => {
      if (collectorState.observersSuspended) return;
      inject();
      coaMountMessageRangeButtons();
    }, delay));
    clearTimeout(collectorState.sidebarTimer);
    collectorState.sidebarTimer = setTimeout(ensureFallback, 3200);
    return inject();
  }

  function coaOpenPasteModal(prefill = {}) {
    if (collectorState.pasteModalOpen) return;
    ensureCollectorStyle();
    ensureViewerStyle();
    collectorState.pasteModalOpen = true;

    const initial = {
      title: normalizeText(prefill.title),
      archiveType: normalizeArchiveType(prefill.archiveType || prefill.bucket || prefill.archive, 'ooc'),
      format: normalizeFormat(prefill.format || prefill.contentFormat, detectContentFormat(prefill.body || '')),
      tags: uniqueStrings([
        ...uniqueStrings(prefill.tags),
        ...uniqueStrings(prefill.characters),
        normalizeText(prefill.world),
      ]).join(', '),
      body: toStringValue(prefill.body || ''),
      sourceFrom: prefill.sourceFrom === 'button' ? 'button' : 'paste',
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'coa-paste-backdrop';
    applyViewerThemeToElement(backdrop);
    backdrop.innerHTML = `
      <form class="coa-paste-modal" data-coa-paste-form="1">
        <div class="coa-paste-head">
          <h2>Crack Archive 붙여넣기 저장</h2>
          <button type="button" class="coa-mini-btn" data-coa-paste="close">닫기</button>
        </div>
        <div class="coa-paste-body">
          <div class="coa-form-row">
            <label>제목</label>
            <input name="title" value="${escapeHTML(initial.title)}" autocomplete="off">
          </div>
          <div class="coa-form-row">
            <label>저장 형식</label>
            ${getArchiveChoiceBoxesHTML(initial.archiveType, 'archiveType')}
          </div>
          <div class="coa-form-row">
            <label>태그</label>
            <input name="tags" value="${escapeHTML(initial.tags)}" placeholder="쉼표로 구분" autocomplete="off">
          </div>
          <div class="coa-form-row">
            <label>본문 (형식은 자동으로 인식됨)</label>
            <textarea name="body" placeholder="여기에 OOC 산출물 원문을 붙여넣기">${escapeHTML(initial.body)}</textarea>
          </div>
        </div>
        <div class="coa-paste-foot">
          <div class="coa-actions">
            <button type="button" class="coa-mini-btn" data-coa-paste="close">취소</button>
            <button type="submit" class="coa-mini-btn primary">저장</button>
          </div>
        </div>
      </form>
    `;

    function close() {
      collectorState.pasteModalOpen = false;
      removeCOAElement(backdrop);
    }

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close();
    });
    backdrop.querySelectorAll('[data-coa-paste="close"]').forEach((button) => {
      button.addEventListener('click', close);
    });
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });

    const form = backdrop.querySelector('[data-coa-paste-form="1"]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.coaBusy === '1') return;
      const fd = new FormData(form);
      const body = toStringValue(fd.get('body'));
      if (!normalizeText(body)) {
        alert('본문이 비어있음. OOC 산출물을 붙여넣어줘.');
        return;
      }
      const title = normalizeText(fd.get('title')) || makeExcerpt(body).slice(0, 36) || '제목 없음';
      const card = normalizeCard({
        id: makeId(),
        archiveType: fd.get('archiveType'),
        format: detectContentFormat(body),
        title,
        tags: fd.get('tags'),
        body,
        view: normalizeArchiveType(fd.get('archiveType'), 'ooc') === 'log' ? {
          htmlLayout: 'specsheet',
          htmlColor: resolveViewerTheme() === 'dark' ? 'dark' : 'light',
          fontFamily: 'pretendard',
          smartTable: false,
        } : {
          htmlLayout: 'specsheet',
          fontFamily: 'pretendard',
          smartTable: false,
        },
        createdAt: nowMs(),
        updatedAt: nowMs(),
        source: {
          url: location.href,
          chatTitle: getChatTitle(),
          from: initial.sourceFrom,
        },
      });

      const submit = form.querySelector('button[type="submit"]');
      form.dataset.coaBusy = '1';
      if (submit) submit.disabled = true;
      try {
        const saved = await coaSaveCard(card);
        close();
        if (viewerState.mounted && viewerState.open) await coaRenderViewer();
        alert(`Crack Archive 저장 완료\n${saved.title}`);
      } catch (error) {
        console.error('[COA:STORE] paste save failed:', error);
        alert(`Crack Archive 저장 실패: ${error.message || error}`);
      } finally {
        form.dataset.coaBusy = '0';
        if (submit?.isConnected) submit.disabled = false;
      }
    });

    getBodyMount().appendChild(backdrop);
    const titleInput = backdrop.querySelector('input[name="title"]');
    const bodyInput = backdrop.querySelector('textarea[name="body"]');
    setTimeout(() => (initial.body ? titleInput : bodyInput)?.focus(), 0);
  }

  function coaGetCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? decodeURIComponent(parts.pop().split(';').shift()) : null;
  }

  function coaGetCurrentChatInfo() {
    const match = location.pathname.match(/\/stories\/([^/]+)\/episodes\/([^/?#]+)/i);
    return match ? { characterId: match[1], chatroomId: match[2] } : null;
  }

  function coaRawAPIRequest(endpoint) {
    const token = coaGetCookie('access_token');
    if (!token) return Promise.reject(new Error('로그인이 필요합니다. 페이지를 새로고침해줘.'));
    const url = `${COA_CHAT_API.base}${endpoint}`;
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: { Authorization: `Bearer ${token}`, platform: 'web' },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              try { resolve(JSON.parse(response.responseText)); }
              catch (_) { reject(new Error('채팅 데이터 JSON 파싱에 실패했습니다.')); }
            } else if (response.status === 429) reject(new Error('서버 요청 제한에 걸렸습니다. 잠시 후 다시 시도해줘.'));
            else reject(new Error(`채팅 API 오류: ${response.status}`));
          },
          onerror: () => reject(new Error('채팅 API 네트워크 오류')),
        });
      });
    }
    return fetch(url, { headers: { Authorization: `Bearer ${token}`, platform: 'web' }, credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`채팅 API 오류: ${response.status}`);
        return response.json();
      });
  }

  async function coaAPIRequest(endpoint) {
    let lastError;
    for (let attempt = 0; attempt < COA_CHAT_API.retryCount; attempt += 1) {
      try { return await coaRawAPIRequest(endpoint); }
      catch (error) {
        lastError = error;
        if (attempt + 1 < COA_CHAT_API.retryCount) await new Promise((resolve) => setTimeout(resolve, COA_CHAT_API.retryDelay * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async function coaFetchChatDetail(chatroomId) {
    return (await coaAPIRequest(`/chats/${encodeURIComponent(chatroomId)}`)).data || {};
  }

  function coaGetCharacterName(detail) {
    return normalizeText(detail?.story?.name || detail?.character?.name || detail?.name) || 'AI';
  }

  async function coaFetchMessagePage(chatroomId, cursor = '') {
    const query = `/chats/${encodeURIComponent(chatroomId)}/messages?limit=${COA_CHAT_API.pageSize}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await coaAPIRequest(query);
    const raw = Array.isArray(data?.data?.messages) ? data.data.messages : [];
    return { raw, nextCursor: normalizeText(data?.data?.nextCursor) };
  }

  function coaNormalizeAPIMessages(rawMessages, characterName) {
    return (Array.isArray(rawMessages) ? rawMessages : []).map((message, index) => normalizeLogMessage({
      id: message?._id || message?.id,
      role: message?.role,
      speaker: message?.role === 'user' ? 'USER' : characterName,
      content: extractAPIMessageContent(message),
      createdAt: message?.createdAt || message?.created_at || message?.timestamp,
    }, index, characterName)).filter((message) => normalizeText(message.content));
  }

  function coaMessageTimeText(value) {
    const ms = validMs(value, 0);
    if (!ms) return '';
    try { return new Date(ms).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  function coaOpenLogImportModal() {
    if (collectorState.logImportOpen) return;
    const info = coaGetCurrentChatInfo();
    if (!info) {
      alert('현재 채팅방에서만 로그를 가져올 수 있음. 채팅방 안에서 다시 눌러줘.');
      return;
    }
    ensureCollectorStyle();
    ensureViewerStyle();
    collectorState.logImportOpen = true;
    coaSuspendCollectorObservers();
    const suspendedViewerRoot = document.getElementById('coa-root');
    if (suspendedViewerRoot) suspendedViewerRoot.dataset.coaSuspended = '1';
    const state = {
      info,
      detail: null,
      characterName: 'AI',
      messages: [],
      messageById: new Map(),
      nextCursor: '',
      selected: new Set(),
      selectedUserCount: 0,
      anchorId: '',
      suppressRowClickId: '',
      suppressRowClickUntil: 0,
      archiveType: 'log',
      autoTitle: '',
      busy: false,
      loadingAll: false,
      loadFailed: false,
      cancelled: false,
      hitHardLimit: false,
      allLoaded: false,
      previewMessageId: '',
      importSearchQuery: '',
      importSearchResults: [],
      importSearchIndex: -1,
      importSearchSource: null,
      importSearchToken: 0,
      importSearchBusy: false,
      renderPage: 0,
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'coa-paste-backdrop coa-log-import-backdrop';
    applyViewerThemeToElement(backdrop);
    backdrop.innerHTML = `
      <section class="coa-log-import-modal" role="dialog" aria-modal="true">
        <div class="coa-paste-head"><h2>현재 채팅에서 가져오기</h2><button type="button" class="coa-mini-btn" data-log-close>닫기</button></div>
        <div class="coa-log-import-summary">
          <div class="coa-log-status" data-log-status>채팅 메시지를 불러오는 중...</div>
          <div class="coa-log-quick" data-log-toolbar style="display:none;"></div>
          <div class="coa-log-import-search" data-log-import-search-wrap hidden>
            <label class="coa-log-import-search-field">
              <span>FIND:</span>
              <input type="search" data-log-import-search placeholder="현재 채팅 로그 내용 검색" autocomplete="off" spellcheck="false">
            </label>
            <div class="coa-log-import-search-actions">
              <button type="button" class="coa-mini-btn" data-log-import-search-run>검색</button>
              <button type="button" class="coa-mini-btn" data-log-import-search-prev disabled>이전</button>
              <button type="button" class="coa-mini-btn" data-log-import-search-next disabled>다음</button>
              <button type="button" class="coa-mini-btn" data-log-import-search-clear disabled>초기화</button>
            </div>
            <div class="coa-log-import-search-status" data-log-import-search-status>현재 불러온 로그 내용만 검색 · Enter 실행</div>
          </div>
        </div>
        <div class="coa-log-list"><div class="coa-log-loading">불러오는 중...</div></div>
        <div class="coa-log-import-foot">
          <div class="coa-log-import-fields">
            <div class="coa-log-import-options">
              <div class="coa-log-option-block">
                <span class="coa-log-option-title">저장 형식</span>
                ${getArchiveChoiceBoxesHTML('log', 'logImportArchiveType')}
              </div>
            </div>
            <div class="coa-log-meta-grid">
              <input data-log-title placeholder="제목">
              <input data-log-tags placeholder="쉼표로 구분">
            </div>
          </div>
          <div class="coa-actions"><button type="button" class="coa-mini-btn" data-log-close>취소</button><button type="button" class="coa-mini-btn primary" data-log-save disabled>로그 저장</button></div>
        </div>
      </section>

      <section class="coa-log-preview-modal" data-log-preview-modal hidden>
        <div class="coa-log-preview-panel" data-log-preview-panel role="dialog" aria-modal="true" aria-label="로그 전체 보기" tabindex="-1">
          <div class="coa-paste-head">
            <h2>전체 로그 보기</h2>
            <button type="button" class="coa-mini-btn" data-log-preview-close>닫기</button>
          </div>

          <div class="coa-log-preview-meta-wrap">
            <div class="coa-log-preview-meta" data-log-preview-meta>메시지 정보</div>
            <div class="coa-log-preview-counter" data-log-preview-counter>0 / 0</div>
          </div>

          <div class="coa-log-preview-body" data-log-preview-body>
            <div class="coa-log-preview-content" data-log-preview-content></div>
          </div>

          <div class="coa-log-preview-foot">
            <div class="coa-actions">
              <button type="button" class="coa-mini-btn" data-log-preview-prev>▲ 위 로그</button>
              <button type="button" class="coa-mini-btn" data-log-preview-next>▼ 아래 로그</button>
            </div>
          </div>
        </div>
      </section>`;

    const listEl = backdrop.querySelector('.coa-log-list');
    const statusEl = backdrop.querySelector('[data-log-status]');
    const toolbarEl = backdrop.querySelector('[data-log-toolbar]');
    const importSearchWrapEl = backdrop.querySelector('[data-log-import-search-wrap]');
    const importSearchInput = backdrop.querySelector('[data-log-import-search]');
    const importSearchRunBtn = backdrop.querySelector('[data-log-import-search-run]');
    const importSearchPrevBtn = backdrop.querySelector('[data-log-import-search-prev]');
    const importSearchNextBtn = backdrop.querySelector('[data-log-import-search-next]');
    const importSearchClearBtn = backdrop.querySelector('[data-log-import-search-clear]');
    const importSearchStatusEl = backdrop.querySelector('[data-log-import-search-status]');
    const saveBtn = backdrop.querySelector('[data-log-save]');
    const titleInput = backdrop.querySelector('[data-log-title]');
    const tagsInput = backdrop.querySelector('[data-log-tags]');
    const archiveInputs = [...backdrop.querySelectorAll('input[name="logImportArchiveType"]')];
    const previewModalEl = backdrop.querySelector('[data-log-preview-modal]');
    const previewPanelEl = backdrop.querySelector('[data-log-preview-panel]');
    const previewMetaEl = backdrop.querySelector('[data-log-preview-meta]');
    const previewCounterEl = backdrop.querySelector('[data-log-preview-counter]');
    const previewBodyEl = backdrop.querySelector('[data-log-preview-body]');
    const previewContentEl = backdrop.querySelector('[data-log-preview-content]');
    const previewPrevBtn = backdrop.querySelector('[data-log-preview-prev]');
    const previewNextBtn = backdrop.querySelector('[data-log-preview-next]');
    const previewCloseBtn = backdrop.querySelector('[data-log-preview-close]');

    const getImportArchiveType = () => normalizeArchiveType(archiveInputs.find((input) => input.checked)?.value, 'log');
    const makeImportAutoTitle = () => `${state.characterName} ${state.archiveType === 'log' ? '로그' : 'OOC'} · ${formatDate(nowMs(), false)}`;
    const syncImportArchiveUI = ({ updateTitle = true } = {}) => {
      const previousAutoTitle = state.autoTitle;
      state.archiveType = getImportArchiveType();
      saveBtn.textContent = state.archiveType === 'log' ? '로그 저장' : 'OOC 저장';
      titleInput.placeholder = state.archiveType === 'log' ? '로그 제목' : 'OOC 제목';
      const nextAutoTitle = makeImportAutoTitle();
      if (updateTitle && (!normalizeText(titleInput.value) || titleInput.value === previousAutoTitle)) titleInput.value = nextAutoTitle;
      state.autoTitle = nextAutoTitle;
    };
    archiveInputs.forEach((input) => input.addEventListener('change', () => syncImportArchiveUI()));
    syncImportArchiveUI({ updateTitle: false });

    const close = () => {
      state.cancelled = true;
      collectorState.logImportOpen = false;
      backdrop.remove();
      if (suspendedViewerRoot) delete suspendedViewerRoot.dataset.coaSuspended;
      coaResumeCollectorObservers();
    };
    backdrop.querySelectorAll('[data-log-close]').forEach((button) => button.addEventListener('click', close));
    backdrop.addEventListener('click', (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-log-tool-menu]')) {
        backdrop.querySelector('[data-log-tool-menu]')?.removeAttribute('open');
      }
      if (event.target === backdrop && !state.busy) close();
    });

    // state.messages는 항상 과거→현재의 정방향을 유지한다.
    // 최신순 배열은 원본 배열이 교체될 때만 다시 만들어 대량 로그에서 반복 복사를 피한다.
    let displayMessagesCacheSource = null;
    let displayMessagesCache = [];
    let displayMessageIndexById = new Map();
    const LOG_RENDER_PAGE_SIZE = 200;
    const displayMessages = () => {
      if (displayMessagesCacheSource !== state.messages) {
        displayMessagesCacheSource = state.messages;
        displayMessagesCache = [...state.messages].reverse();
        displayMessageIndexById = new Map(displayMessagesCache.map((message, index) => [message.id, index]));
      }
      return displayMessagesCache;
    };
    const getDisplayMessageIndex = (messageId) => {
      displayMessages();
      const index = displayMessageIndexById.get(messageId);
      return Number.isInteger(index) ? index : -1;
    };
    const getRenderPageCount = () => Math.max(1, Math.ceil(displayMessages().length / LOG_RENDER_PAGE_SIZE));
    const clampRenderPage = () => {
      state.renderPage = Math.max(0, Math.min(getRenderPageCount() - 1, Number(state.renderPage) || 0));
      return state.renderPage;
    };
    const renderedMessages = () => {
      const visible = displayMessages();
      const page = clampRenderPage();
      const start = page * LOG_RENDER_PAGE_SIZE;
      return visible.slice(start, start + LOG_RENDER_PAGE_SIZE);
    };
    const selectedMessages = () => state.messages.filter((message) => state.selected.has(message.id));

    const LOG_PREVIEW_ICON = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
        <path d="M15.4 15.4L20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"></path>
      </svg>
    `;

    const getDisplayMessageById = (messageId) => {
      const visible = displayMessages();
      const index = getDisplayMessageIndex(messageId);
      return { visible, index, message: index >= 0 ? visible[index] : null };
    };

    const closePreview = () => {
      state.previewMessageId = '';
      previewModalEl.hidden = true;
      previewContentEl.textContent = '';
    };

    const syncPreview = () => {
      const { visible, index, message } = getDisplayMessageById(state.previewMessageId);
      if (!message) {
        closePreview();
        return;
      }

      const role = message.role === 'user' ? 'USER' : (message.speaker || state.characterName);
      const timeText = coaMessageTimeText(message.createdAt);
      previewMetaEl.textContent = timeText ? `${role} · ${timeText}` : role;
      previewCounterEl.textContent = `${index + 1} / ${visible.length}`;
      previewContentEl.textContent = toStringValue(message.content) || '(빈 메시지)';
      previewPrevBtn.disabled = index <= 0;
      previewNextBtn.disabled = index >= visible.length - 1;
      if (previewBodyEl) previewBodyEl.scrollTop = 0;
    };

    const openPreview = (messageId) => {
      state.previewMessageId = messageId;
      previewModalEl.hidden = false;
      syncPreview();
      requestAnimationFrame(() => previewPanelEl?.focus());
    };

    const movePreview = (direction) => {
      const { visible, index } = getDisplayMessageById(state.previewMessageId);
      if (index < 0) return;
      const target = visible[index + direction];
      if (!target) return;
      state.previewMessageId = target.id;
      syncPreview();
    };

    previewCloseBtn?.addEventListener('click', closePreview);
    previewPrevBtn?.addEventListener('click', () => movePreview(-1));
    previewNextBtn?.addEventListener('click', () => movePreview(1));
    previewModalEl?.addEventListener('click', (event) => {
      if (event.target === previewModalEl) closePreview();
    });
    previewPanelEl?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        movePreview(-1);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        movePreview(1);
      }
    });


    // 가져오기 화면의 내용 검색은 API를 다시 호출하지 않고 현재 메모리에 불러온 로그만 훑는다.
    // 입력할 때마다 돌리지 않고 Enter/검색 버튼으로만 실행해 대량 로그에서도 불필요한 재검색을 막는다.
    const IMPORT_SEARCH_YIELD_EVERY = 240;
    const normalizeImportSearch = (value) => toStringValue(value).trim().toLocaleLowerCase();
    const yieldImportSearch = () => new Promise((resolve) => setTimeout(resolve, 0));

    const findLogRowById = (messageId) => {
      if (!messageId) return null;
      if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') {
        return listEl.querySelector(`.coa-log-row[data-message-id="${globalThis.CSS.escape(messageId)}"]`);
      }
      return [...listEl.querySelectorAll('.coa-log-row')]
        .find((row) => row.getAttribute('data-message-id') === messageId) || null;
    };

    const clearImportSearchRowHighlight = () => {
      listEl.querySelectorAll('.coa-log-row[data-search-current="1"]')
        .forEach((row) => { row.dataset.searchCurrent = '0'; });
    };

    const syncImportSearchControls = () => {
      const hasResults = state.importSearchResults.length > 0;
      const hasInput = Boolean(importSearchInput.value.trim());
      const sourceValid = state.importSearchSource === state.messages && Boolean(state.importSearchQuery);
      const unavailable = state.loadingAll || !state.messages.length;
      importSearchRunBtn.disabled = state.importSearchBusy || unavailable;
      importSearchPrevBtn.disabled = state.importSearchBusy || unavailable || !hasResults || state.importSearchIndex <= 0;
      importSearchNextBtn.disabled = state.importSearchBusy || unavailable || !hasResults || state.importSearchIndex >= state.importSearchResults.length - 1;
      importSearchClearBtn.disabled = state.importSearchBusy || (!hasInput && !state.importSearchQuery && !hasResults);

      if (state.importSearchBusy) return;
      if (state.loadingAll) {
        importSearchStatusEl.textContent = '전체 로그 불러오는 중… 완료 후 검색 가능';
        return;
      }
      if (!state.messages.length) {
        importSearchStatusEl.textContent = '검색할 로그가 없음';
        return;
      }
      if (!sourceValid) {
        importSearchStatusEl.textContent = hasInput
          ? '검색어 입력됨 · Enter 또는 검색 버튼으로 실행'
          : '현재 불러온 로그 내용만 검색 · Enter 실행';
        return;
      }
      if (!hasResults) {
        importSearchStatusEl.textContent = `일치 로그 없음 · ${state.messages.length.toLocaleString()}개 검색`;
        return;
      }
      importSearchStatusEl.textContent = `${state.importSearchIndex + 1} / ${state.importSearchResults.length.toLocaleString()}개 일치 · 현재 ${state.messages.length.toLocaleString()}개 검색`;
    };

    const invalidateImportSearch = ({ keepQueryInput = true, message = '' } = {}) => {
      state.importSearchToken += 1;
      state.importSearchBusy = false;
      state.importSearchQuery = '';
      state.importSearchResults = [];
      state.importSearchIndex = -1;
      state.importSearchSource = null;
      clearImportSearchRowHighlight();
      if (!keepQueryInput) importSearchInput.value = '';
      syncImportSearchControls();
      if (message) importSearchStatusEl.textContent = message;
    };

    const focusImportSearchResult = (index, { scroll = true } = {}) => {
      if (!state.importSearchResults.length) return;
      const nextIndex = Math.max(0, Math.min(state.importSearchResults.length - 1, index));
      const messageId = state.importSearchResults[nextIndex];
      state.importSearchIndex = nextIndex;
      const messageIndex = getDisplayMessageIndex(messageId);
      const targetPage = messageIndex >= 0 ? Math.floor(messageIndex / LOG_RENDER_PAGE_SIZE) : state.renderPage;
      if (targetPage !== state.renderPage) {
        state.renderPage = targetPage;
        render();
      } else {
        clearImportSearchRowHighlight();
      }
      const row = findLogRowById(messageId);
      if (row) {
        row.dataset.searchCurrent = '1';
        if (scroll) row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      syncImportSearchControls();
    };

    const runImportSearch = async ({ direction = 0, force = false } = {}) => {
      const rawQuery = importSearchInput.value.trim();
      const query = normalizeImportSearch(rawQuery);
      if (!query) {
        invalidateImportSearch({ keepQueryInput: false });
        importSearchInput.focus();
        return;
      }

      const cacheValid = !force
        && query === state.importSearchQuery
        && state.importSearchSource === state.messages;
      if (cacheValid) {
        if (!state.importSearchResults.length) {
          syncImportSearchControls();
          return;
        }
        const nextIndex = direction < 0
          ? Math.max(0, state.importSearchIndex - 1)
          : (direction > 0
            ? Math.min(state.importSearchResults.length - 1, state.importSearchIndex + 1)
            : Math.max(0, state.importSearchIndex));
        focusImportSearchResult(nextIndex);
        return;
      }

      const token = ++state.importSearchToken;
      const source = state.messages;
      const visible = displayMessages();
      const results = [];
      state.importSearchBusy = true;
      state.importSearchQuery = query;
      state.importSearchResults = [];
      state.importSearchIndex = -1;
      state.importSearchSource = null;
      clearImportSearchRowHighlight();
      importSearchStatusEl.textContent = `검색 중… 0 / ${visible.length.toLocaleString()}`;
      syncImportSearchControls();

      try {
        for (let index = 0; index < visible.length; index += 1) {
          if (state.cancelled || token !== state.importSearchToken) return;
          if (toStringValue(visible[index].content).toLocaleLowerCase().includes(query)) {
            results.push(visible[index].id);
          }
          if ((index + 1) % IMPORT_SEARCH_YIELD_EVERY === 0) {
            importSearchStatusEl.textContent = `검색 중… ${(index + 1).toLocaleString()} / ${visible.length.toLocaleString()}`;
            await yieldImportSearch();
          }
        }
        if (state.cancelled || token !== state.importSearchToken) return;
        state.importSearchSource = source;
        state.importSearchResults = results;
        state.importSearchIndex = results.length ? (direction < 0 ? results.length - 1 : 0) : -1;
      } finally {
        if (token === state.importSearchToken) {
          state.importSearchBusy = false;
          if (state.importSearchResults.length) focusImportSearchResult(state.importSearchIndex);
          else syncImportSearchControls();
        }
      }
    };

    importSearchRunBtn?.addEventListener('click', () => { void runImportSearch({ force: true }); });
    importSearchPrevBtn?.addEventListener('click', () => { void runImportSearch({ direction: -1 }); });
    importSearchNextBtn?.addEventListener('click', () => { void runImportSearch({ direction: 1 }); });
    importSearchClearBtn?.addEventListener('click', () => {
      invalidateImportSearch({ keepQueryInput: false });
      importSearchInput.focus();
    });
    importSearchInput?.addEventListener('input', () => {
      if (!state.importSearchQuery && state.importSearchSource === null && !state.importSearchBusy) {
        syncImportSearchControls();
        return;
      }
      invalidateImportSearch({ keepQueryInput: true });
    });
    importSearchInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        invalidateImportSearch({ keepQueryInput: false });
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void runImportSearch({ direction: event.shiftKey ? -1 : 0 });
    });
    const recountSelectedUsers = () => {
      let count = 0;
      state.selected.forEach((id) => {
        if (state.messageById.get(id)?.role === 'user') count += 1;
      });
      state.selectedUserCount = count;
    };
    const setRecent = (count) => {
      state.anchorId = '';
      state.renderPage = 0;
      state.selected.clear();
      state.messages.slice(Math.max(0, state.messages.length - count)).forEach((message) => state.selected.add(message.id));
      recountSelectedUsers();
      render();
    };
    const setAllLoaded = () => {
      state.anchorId = '';
      state.selected = new Set(state.messages.map((message) => message.id));
      recountSelectedUsers();
      syncRenderedSelection();
      renderSelectionControls();
    };
    const syncMessageRowSelection = (row, messageId) => {
      if (!row?.isConnected) return;
      const selected = state.selected.has(messageId);
      row.dataset.selected = selected ? '1' : '0';
      row.dataset.anchor = state.anchorId === messageId ? '1' : '0';
      row.setAttribute('aria-checked', selected ? 'true' : 'false');
      const checkbox = row.querySelector('.coa-log-check');
      if (checkbox) checkbox.checked = selected;
    };
    const syncRenderedSelection = () => {
      listEl.querySelectorAll('.coa-log-row[data-message-id]').forEach((row) => {
        syncMessageRowSelection(row, row.getAttribute('data-message-id') || '');
      });
    };
    const toggleOne = (messageId, row = null) => {
      state.anchorId = '';
      const wasSelected = state.selected.has(messageId);
      if (wasSelected) state.selected.delete(messageId);
      else state.selected.add(messageId);
      if (state.messageById.get(messageId)?.role === 'user') {
        state.selectedUserCount = Math.max(0, state.selectedUserCount + (wasSelected ? -1 : 1));
      }
      syncMessageRowSelection(row, messageId);
      renderSelectionControls();
    };
    const beginRangeAt = (messageId) => {
      state.anchorId = messageId;
      state.selected = new Set([messageId]);
      recountSelectedUsers();
      syncRenderedSelection();
      renderSelectionControls();
    };
    const selectRangeTo = (messageId) => {
      if (!state.anchorId) {
        toggleOne(messageId);
        return;
      }
      // 사용자가 보는 최신순 목록 기준으로 시작점↔끝점 사이를 선택한다.
      // 선택 결과는 id Set이라 저장할 때는 다시 state.messages의 시간순으로 정렬된다.
      const visible = displayMessages();
      const a = getDisplayMessageIndex(state.anchorId);
      const b = getDisplayMessageIndex(messageId);
      if (a >= 0 && b >= 0) {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        state.selected = new Set(visible.slice(start, end + 1).map((message) => message.id));
      }
      state.anchorId = '';
      recountSelectedUsers();
      syncRenderedSelection();
      renderSelectionControls();
    };
    const excludeSelectedUserLogs = () => {
      state.anchorId = '';
      state.messages.forEach((message) => {
        if (message.role === 'user') state.selected.delete(message.id);
      });
      state.selectedUserCount = 0;
      syncRenderedSelection();
      renderSelectionControls();
    };


    // 로그 행마다 다수의 이벤트를 붙이지 않고 목록 하나에서 위임 처리한다.
    // 수천 개 로그를 전부 불러와도 리스너 수가 늘어나지 않아 스크롤·전체보기 반응이 가벼워진다.
    const listPress = {
      timer: null,
      pointerId: null,
      messageId: '',
      row: null,
      x: 0,
      y: 0,
      moved: false,
      handled: false,
    };
    const clearListPressTimer = () => {
      if (listPress.timer) clearTimeout(listPress.timer);
      listPress.timer = null;
    };
    const resetListPress = () => {
      clearListPressTimer();
      listPress.pointerId = null;
      listPress.messageId = '';
      listPress.row = null;
      listPress.moved = false;
      listPress.handled = false;
    };
    const getLogRowFromEvent = (event) => event.target instanceof Element
      ? event.target.closest('.coa-log-row')
      : null;
    const getPreviewButtonFromEvent = (event) => event.target instanceof Element
      ? event.target.closest('[data-log-preview]')
      : null;
    const handleShortSelection = (messageId, row = null) => {
      if (state.anchorId) selectRangeTo(messageId);
      else toggleOne(messageId, row);
    };

    listEl.addEventListener('pointerdown', (event) => {
      if (getPreviewButtonFromEvent(event)) return;
      const row = getLogRowFromEvent(event);
      const id = row?.getAttribute('data-message-id') || '';
      if (!row || !id || (event.pointerType === 'mouse' && event.button !== 0)) return;
      resetListPress();
      listPress.pointerId = event.pointerId;
      listPress.messageId = id;
      listPress.row = row;
      listPress.x = event.clientX;
      listPress.y = event.clientY;
      listPress.timer = setTimeout(() => {
        listPress.timer = null;
        listPress.handled = true;
        state.suppressRowClickId = id;
        state.suppressRowClickUntil = Date.now() + 1400;
        try { navigator.vibrate?.(24); } catch (_) {}
        beginRangeAt(id);
      }, 800);
    });
    listEl.addEventListener('pointermove', (event) => {
      if (listPress.pointerId !== event.pointerId || listPress.handled || listPress.moved) return;
      if (Math.hypot(event.clientX - listPress.x, event.clientY - listPress.y) > 12) {
        listPress.moved = true;
        clearListPressTimer();
      }
    });
    listEl.addEventListener('pointerup', (event) => {
      if (getPreviewButtonFromEvent(event) || listPress.pointerId !== event.pointerId) return;
      const id = listPress.messageId;
      const row = listPress.row;
      const shouldSelect = Boolean(id) && !listPress.moved && !listPress.handled;
      clearListPressTimer();
      if (shouldSelect) {
        event.preventDefault();
        state.suppressRowClickId = id;
        state.suppressRowClickUntil = Date.now() + 700;
        handleShortSelection(id, row);
      }
      listPress.pointerId = null;
      listPress.messageId = '';
      listPress.row = null;
      listPress.moved = false;
      listPress.handled = false;
    });
    listEl.addEventListener('pointercancel', resetListPress);
    listEl.addEventListener('pointerout', (event) => {
      if (event.pointerType !== 'mouse' || listPress.handled) return;
      const row = getLogRowFromEvent(event);
      if (row && !row.contains(event.relatedTarget)) resetListPress();
    });
    listEl.addEventListener('contextmenu', (event) => {
      if (!getPreviewButtonFromEvent(event) && !getLogRowFromEvent(event)) return;
      event.preventDefault();
    });
    listEl.addEventListener('click', (event) => {
      const previewButton = getPreviewButtonFromEvent(event);
      if (previewButton) {
        event.preventDefault();
        event.stopPropagation();
        const row = previewButton.closest('.coa-log-row');
        const id = row?.getAttribute('data-message-id') || previewButton.getAttribute('data-log-preview') || '';
        if (id) openPreview(id);
        return;
      }
      const row = getLogRowFromEvent(event);
      const id = row?.getAttribute('data-message-id') || '';
      if (!row || !id) return;
      event.preventDefault();
      clearListPressTimer();
      if (state.suppressRowClickId === id && Date.now() < state.suppressRowClickUntil) {
        state.suppressRowClickId = '';
        return;
      }
      state.suppressRowClickId = '';
      handleShortSelection(id, row);
    });
    listEl.addEventListener('keydown', (event) => {
      if (getPreviewButtonFromEvent(event)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = getLogRowFromEvent(event);
      const id = row?.getAttribute('data-message-id') || '';
      if (!row || !id) return;
      event.preventDefault();
      handleShortSelection(id, row);
    });

    const renderSelectionControls = () => {
      const count = state.selected.size;
      const visibleCount = displayMessages().length;
      const pageCount = getRenderPageCount();
      const page = clampRenderPage();
      const rangeStart = visibleCount ? page * LOG_RENDER_PAGE_SIZE + 1 : 0;
      const rangeEnd = Math.min(visibleCount, rangeStart + LOG_RENDER_PAGE_SIZE - 1);
      const loadStateText = state.loadingAll
        ? ' · 전체 로그 수집 중'
        : (state.hitHardLimit
          ? ` · 안전 제한 ${COA_CHAT_API.hardLimit.toLocaleString()}개 도달`
          : (state.allLoaded ? ' · 첫 턴까지 불러옴' : ' · 일부만 불러옴'));
      statusEl.textContent = state.anchorId
        ? `범위 시작점 체크됨 · 다른 쪽으로 이동해 끝 메시지를 눌러도 됨 · 선택 ${count.toLocaleString()}개 · 화면 ${rangeStart.toLocaleString()}~${rangeEnd.toLocaleString()} / ${visibleCount.toLocaleString()}${loadStateText}`
        : `로그 ${state.messages.length.toLocaleString()}개 · 화면 ${rangeStart.toLocaleString()}~${rangeEnd.toLocaleString()} · 선택 ${count.toLocaleString()}개 · 화면 최신순 / 저장 시간순${loadStateText}`;

      toolbarEl.style.display = 'flex';
      importSearchWrapEl.hidden = false;
      if (toolbarEl.dataset.bound !== '1') {
        toolbarEl.dataset.bound = '1';
        toolbarEl.innerHTML = `
          <button type="button" class="coa-mini-btn" data-log-nav="newest">최신</button>
          <button type="button" class="coa-mini-btn coa-log-nav-arrow" data-log-nav="newer" aria-label="최신 쪽">←</button>
          <span class="coa-log-page-label" data-log-page-label></span>
          <button type="button" class="coa-mini-btn coa-log-nav-arrow" data-log-nav="older" aria-label="오래된 쪽">→</button>
          <button type="button" class="coa-mini-btn" data-log-nav="oldest">첫 턴</button>
          <button type="button" class="coa-mini-btn" data-log-load-all hidden>전체 불러오기 재개</button>
          <details class="coa-log-tool-menu" data-log-tool-menu>
            <summary data-log-selection-summary>선택 옵션</summary>
            <div class="coa-log-tool-menu-pop">
              <button type="button" class="coa-mini-btn" data-log-recent="10">최근 10개</button>
              <button type="button" class="coa-mini-btn" data-log-recent="30">최근 30개</button>
              <button type="button" class="coa-mini-btn" data-log-recent="100">최근 100개</button>
              <button type="button" class="coa-mini-btn" data-log-all-loaded>불러온 전체</button>
              <button type="button" class="coa-mini-btn" data-log-exclude-user>USER 로그 제외</button>
              <button type="button" class="coa-mini-btn" data-log-reset-range>범위 다시 선택</button>
            </div>
          </details>`;
        toolbarEl.addEventListener('click', (event) => {
          const button = event.target instanceof Element ? event.target.closest('button') : null;
          if (!button || button.disabled) return;
          button.closest('[data-log-tool-menu]')?.removeAttribute('open');
          if (button.hasAttribute('data-log-recent')) {
            setRecent(Number(button.dataset.logRecent) || 30);
            return;
          }
          const nav = button.dataset.logNav;
          if (nav) {
            const jumpToFirstTurn = nav === 'oldest';
            if (nav === 'newest') state.renderPage = 0;
            else if (nav === 'newer') state.renderPage = Math.max(0, state.renderPage - 1);
            else if (nav === 'older') state.renderPage = Math.min(getRenderPageCount() - 1, state.renderPage + 1);
            else if (nav === 'oldest') state.renderPage = getRenderPageCount() - 1;
            render();
            listEl.scrollTop = jumpToFirstTurn ? listEl.scrollHeight : 0;
          } else if (button.hasAttribute('data-log-all-loaded')) setAllLoaded();
          else if (button.hasAttribute('data-log-reset-range')) {
            state.anchorId = '';
            state.selected.clear();
            state.selectedUserCount = 0;
            syncRenderedSelection();
            renderSelectionControls();
          } else if (button.hasAttribute('data-log-exclude-user')) excludeSelectedUserLogs();
          else if (button.hasAttribute('data-log-load-all')) void loadAllRemaining();
        });
      }

      const newestBtn = toolbarEl.querySelector('[data-log-nav="newest"]');
      const newerBtn = toolbarEl.querySelector('[data-log-nav="newer"]');
      const olderBtn = toolbarEl.querySelector('[data-log-nav="older"]');
      const oldestBtn = toolbarEl.querySelector('[data-log-nav="oldest"]');
      if (newestBtn) newestBtn.disabled = page <= 0;
      if (newerBtn) newerBtn.disabled = page <= 0;
      if (olderBtn) olderBtn.disabled = page >= pageCount - 1;
      if (oldestBtn) oldestBtn.disabled = page >= pageCount - 1 || !state.allLoaded;
      const pageLabel = toolbarEl.querySelector('[data-log-page-label]');
      if (pageLabel) pageLabel.textContent = `${(page + 1).toLocaleString()} / ${pageCount.toLocaleString()}`;
      const loadAllBtn = toolbarEl.querySelector('[data-log-load-all]');
      if (loadAllBtn) {
        loadAllBtn.hidden = !state.loadFailed || state.loadingAll || !state.nextCursor;
        loadAllBtn.disabled = state.loadingAll || !state.nextCursor;
      }
      const excludeBtn = toolbarEl.querySelector('[data-log-exclude-user]');
      if (excludeBtn) excludeBtn.hidden = state.selectedUserCount <= 0;
      const allLoadedSelectionBtn = toolbarEl.querySelector('[data-log-all-loaded]');
      if (allLoadedSelectionBtn) allLoadedSelectionBtn.disabled = state.loadingAll;
      const selectionSummary = toolbarEl.querySelector('[data-log-selection-summary]');
      if (selectionSummary) selectionSummary.textContent = count ? `선택 옵션 · ${count.toLocaleString()}` : '선택 옵션';
      saveBtn.disabled = !count || state.busy || state.loadingAll;
      syncImportSearchControls();
    };

    const render = () => {
      renderSelectionControls();
      listEl.innerHTML = renderedMessages().map((message) => {
        const selected = state.selected.has(message.id);
        const role = message.role === 'user' ? 'USER' : message.speaker || state.characterName;
        const snippet = toStringValue(message.content).slice(0, 280);
        const searchCurrent = state.importSearchResults[state.importSearchIndex] === message.id;
        return `<div class="coa-log-row" data-message-id="${escapeHTML(message.id)}" data-selected="${selected ? '1' : '0'}" data-anchor="${state.anchorId === message.id ? '1' : '0'}" data-search-current="${searchCurrent ? '1' : '0'}" role="checkbox" aria-checked="${selected ? 'true' : 'false'}" tabindex="0">
          <input type="checkbox" class="coa-log-check" data-log-check="${escapeHTML(message.id)}" tabindex="-1" aria-hidden="true" ${selected ? 'checked' : ''}>
          <span class="coa-log-role ${message.role === 'user' ? 'user' : 'ai'}">${escapeHTML(role)}</span>
          <div class="coa-log-main">
            <button type="button" class="coa-log-preview-btn" data-log-preview="${escapeHTML(message.id)}" aria-label="전체 로그 보기" title="전체 로그 보기">${LOG_PREVIEW_ICON}</button>
            <span class="coa-log-snippet">${escapeHTML(snippet)}</span>
          </div>
          <time class="coa-log-time">${escapeHTML(coaMessageTimeText(message.createdAt))}</time>
        </div>`;
      }).join('') || '<div class="coa-log-loading">메시지가 없습니다.</div>';

    };

    const loadAllRemaining = async () => {
      if (state.loadingAll || !state.nextCursor || state.cancelled) return;
      state.loadingAll = true;
      state.loadFailed = false;
      state.hitHardLimit = false;
      renderSelectionControls();
      const loadedIds = new Set(state.messageById.keys());
      const olderPages = [];
      let loadedCount = state.messages.length;
      try {
        const seenCursors = new Set();
        while (state.nextCursor && !state.cancelled) {
          if (loadedCount >= COA_CHAT_API.hardLimit) {
            state.hitHardLimit = true;
            state.nextCursor = '';
            break;
          }
          const cursor = state.nextCursor;
          if (seenCursors.has(cursor)) throw new Error('메시지 페이지 커서가 반복되어 안전하게 중단했습니다.');
          seenCursors.add(cursor);
          statusEl.textContent = `첫 턴까지 불러오는 중… 현재 ${loadedCount.toLocaleString()}개`;
          const page = await coaFetchMessagePage(state.info.chatroomId, cursor);
          const older = coaNormalizeAPIMessages([...page.raw].reverse(), state.characterName)
            .filter((message) => {
              if (loadedIds.has(message.id)) return false;
              loadedIds.add(message.id);
              state.messageById.set(message.id, message);
              return true;
            });
          if (older.length) {
            const remaining = Math.max(0, COA_CHAT_API.hardLimit - loadedCount);
            const accepted = older.slice(Math.max(0, older.length - remaining));
            if (accepted.length) olderPages.push(accepted);
            loadedCount += accepted.length;
          }
          state.nextCursor = page.nextCursor;
          if (!page.raw.length) state.nextCursor = '';
          if (loadedCount >= COA_CHAT_API.hardLimit && state.nextCursor) {
            state.hitHardLimit = true;
            state.nextCursor = '';
          }
          if (state.nextCursor && !state.cancelled) {
            await new Promise((resolve) => setTimeout(resolve, COA_CHAT_API.paginationDelay));
          }
        }
      } catch (error) {
        state.loadFailed = true;
        console.error('[COA:API] full log pagination failed:', error);
        if (!state.cancelled) alert(`전체 로그 불러오기가 중단됐습니다.
${error.message || error}

상단의 '전체 불러오기 재개'로 다시 시도할 수 있습니다.`);
      } finally {
        if (!state.cancelled && olderPages.length) {
          const olderMessages = [];
          for (let index = olderPages.length - 1; index >= 0; index -= 1) olderMessages.push(...olderPages[index]);
          state.messages = [...olderMessages, ...state.messages];
          if (state.importSearchQuery || state.importSearchResults.length || state.importSearchBusy) {
            invalidateImportSearch({ keepQueryInput: true, message: '전체 로그가 갱신됨 · 다시 검색해줘' });
          }
        }
        state.allLoaded = !state.nextCursor && !state.hitHardLimit;
        state.loadingAll = false;
        if (!state.cancelled) render();
      }
    };

    saveBtn.addEventListener('click', async () => {
      // 화면 표시 순서와 무관하게 저장은 반드시 과거→현재 순서.
      const chosen = selectedMessages();
      if (!chosen.length || state.busy || state.loadingAll) return;
      state.busy = true;
      saveBtn.disabled = true;
      try {
        const archiveType = getImportArchiveType();
        state.archiveType = archiveType;
        const title = normalizeText(titleInput.value) || `${state.characterName} ${archiveType === 'log' ? '로그' : 'OOC'} · ${formatDate(nowMs(), false)}`;
        const logData = archiveType === 'log' ? normalizeLogData({
          chatroomId: state.info.chatroomId,
          characterId: state.info.characterId,
          characterName: state.characterName,
          firstMessageId: chosen[0].id,
          lastMessageId: chosen[chosen.length - 1].id,
          messages: chosen,
          importedAt: nowMs(),
        }) : null;
        const body = archiveType === 'ooc' && chosen.length === 1
          ? toStringValue(chosen[0].content)
          : buildLogBody(chosen);
        const card = normalizeCard({
          id: makeId(),
          archiveType,
          format: detectContentFormat(body),
          title,
          tags: tagsInput.value,
          body,
          log: logData,
          // 채팅 가져오기는 별도 테마/폰트 입력 없이 normalizeCard의 안정 기본값을 사용한다.
          dc: archiveType === 'log' ? { logTheme: 'mungo' } : undefined,
          createdAt: nowMs(),
          updatedAt: nowMs(),
          source: { url: location.href, chatTitle: getChatTitle(), from: 'api' },
        });
        const saved = await coaSaveCard(card);
        close();
        viewerState.open = true;
        viewerState.readerId = saved.id;
        viewerState.readerCard = saved;
        await coaMountViewer({ open: true });
      } catch (error) {
        console.error('[COA:STORE] log import save failed:', error);
        alert(`로그 저장 실패: ${error.message || error}`);
        state.busy = false;
        render();
      }
    });

    getBodyMount().appendChild(backdrop);
    (async () => {
      try {
        state.detail = await coaFetchChatDetail(info.chatroomId);
        state.characterName = coaGetCharacterName(state.detail);
        syncImportArchiveUI();
        tagsInput.value = state.characterName;
        const page = await coaFetchMessagePage(info.chatroomId);
        state.messages = coaNormalizeAPIMessages([...page.raw].reverse(), state.characterName);
        state.messageById = new Map(state.messages.map((message) => [message.id, message]));
        state.nextCursor = page.nextCursor;
        state.allLoaded = !state.nextCursor;
        setRecent(30);
        if (state.nextCursor) await loadAllRemaining();
      } catch (error) {
        console.error('[COA:API] log import load failed:', error);
        statusEl.textContent = `불러오기 실패: ${error.message || error}`;
        listEl.innerHTML = '<div class="coa-log-loading">채팅 로그를 불러오지 못했습니다.</div>';
      }
    })();
  }

  async function coaLoadSettings() {
    const raw = await gmGet(STORAGE.SETTINGS, DEFAULT_SETTINGS);
    const next = raw && typeof raw === 'object' ? { ...raw } : {};
    next.theme = 'auto';
    next.viewMode = normalizeViewerViewMode(next.viewMode);
    next.sortBy = normalizeViewerSortBy(next.sortBy);
    next.sortDirection = normalizeViewerSortDirection(next.sortDirection);
    next.exportReplacements = normalizeExportReplacementRules(next.exportReplacements);
    return next;
  }
  async function coaSaveSettings(settings) {
    const next = settings && typeof settings === 'object' ? { ...settings } : {};
    next.theme = 'auto';
    next.viewMode = normalizeViewerViewMode(next.viewMode);
    next.sortBy = normalizeViewerSortBy(next.sortBy);
    next.sortDirection = normalizeViewerSortDirection(next.sortDirection);
    next.exportReplacements = normalizeExportReplacementRules(next.exportReplacements);
    await gmSet(STORAGE.SETTINGS, next);
    return next;
  }

  function openImportPicker(afterDone) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      let settled = false;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener('focus', handleWindowFocus);
        input.remove();
      };
      const handleWindowFocus = () => {
        setTimeout(() => {
          if (!(input.files && input.files.length)) {
            cleanup();
            finish();
          }
        }, 200);
      };
      window.addEventListener('focus', handleWindowFocus, { once: true });
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        cleanup();
        if (!file) {
          finish();
          return;
        }
        try {
          const result = await coaImportJSON(file);
          alert(`Crack Archive 불러오기 완료\n- 추가: ${result.imported}개\n- 건너뜀: ${result.skipped}개\n- ID 재부여: ${result.reassignedIds.length}개`);
          if (typeof afterDone === 'function') await afterDone(result);
        } catch (error) {
          console.error('[COA:STORE] import failed:', error);
          alert(`Crack Archive 불러오기 실패: ${error.message || error}`);
        } finally {
          finish();
        }
      }, { once: true });
      document.documentElement.appendChild(input);
      input.click();
    });
  }

  function formatDate(ms, withTime = false) {
    const date = new Date(validMs(ms, 0));
    if (!date.getTime()) return '-';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    if (!withTime) return `${y}.${m}.${d}`;
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${d} ${hh}:${mm}`;
  }

  function countValues(index, field) {
    const counts = new Map();
    for (const meta of index) {
      const raw = meta && meta[field];
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        const text = normalizeText(value);
        if (!text) continue;
        counts.set(text, (counts.get(text) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  }

  function normalizeViewerSortBy(value) {
    const key = toStringValue(value).trim().toLocaleLowerCase();
    if (key === 'updated' || key === 'updatedat' || key === 'modified') return 'updated';
    if (key === 'title' || key === 'name') return 'title';
    return 'created';
  }

  function normalizeViewerSortDirection(value) {
    const key = toStringValue(value).trim().toLocaleLowerCase();
    return key === 'up' || key === 'asc' || key === 'ascending' ? 'up' : 'down';
  }

  function getViewerSortDirectionLabel(sortBy, direction) {
    const key = normalizeViewerSortBy(sortBy);
    const dir = normalizeViewerSortDirection(direction);
    if (key === 'title') return dir === 'down' ? '가나다순' : '제목 역순';
    if (key === 'updated') return dir === 'down' ? '최근 수정순' : '오래된 수정순';
    return dir === 'down' ? '최신 저장순' : '오래된 저장순';
  }

  function renderViewerSortOptions(selected) {
    const current = normalizeViewerSortBy(selected);
    return Object.entries(VIEWER_SORTS).map(([key, item]) => (
      `<option value="${escapeHTML(key)}"${key === current ? ' selected' : ''}>${escapeHTML(item.label)}</option>`
    )).join('');
  }

  function sortMetas(metas, sortBy = viewerState.sortBy, sortDirection = viewerState.sortDirection) {
    const key = normalizeViewerSortBy(sortBy);
    const direction = normalizeViewerSortDirection(sortDirection);
    return [...metas].sort((a, b) => {
      const favoriteCompared = Number(Boolean(b?.favorite)) - Number(Boolean(a?.favorite));
      if (favoriteCompared) return favoriteCompared;
      let compared = 0;
      if (key === 'title') {
        compared = toStringValue(a?.title).localeCompare(toStringValue(b?.title), 'ko', {
          numeric: true,
          sensitivity: 'base',
        });
        if (direction === 'up') compared *= -1;
      } else {
        const field = key === 'updated' ? 'updatedAt' : 'createdAt';
        const left = validMs(a?.[field], validMs(a?.createdAt, 0));
        const right = validMs(b?.[field], validMs(b?.createdAt, 0));
        compared = direction === 'down' ? right - left : left - right;
      }
      if (compared) return compared;
      const createdTie = (b?.createdAt || 0) - (a?.createdAt || 0);
      if (createdTie) return createdTie;
      return toStringValue(a?.id).localeCompare(toStringValue(b?.id));
    });
  }

  function hasActiveFilters() {
    const f = viewerState.filters;
    return Boolean(
      normalizeText(f.text) ||
      normalizeText(f.archiveType) ||
      f.tags.length ||
      f.favoriteOnly
    );
  }

  function toggleInArray(arr, value) {
    const clean = normalizeText(value);
    if (!clean) return arr;
    const key = clean.toLocaleLowerCase();
    const exists = arr.some((item) => item.toLocaleLowerCase() === key);
    return exists ? arr.filter((item) => item.toLocaleLowerCase() !== key) : [...arr, clean];
  }


  function normalizeViewerViewMode(value) {
    const key = toStringValue(value).trim().toLocaleLowerCase();
    return key === 'stack' || key === 'list' ? 'stack' : 'card';
  }

  function detectHostTheme() {
    const candidates = [
      document.body?.getAttribute('data-theme'),
      document.documentElement?.getAttribute('data-theme'),
      document.body?.dataset?.theme,
      document.documentElement?.dataset?.theme,
    ];
    for (const value of candidates) {
      const key = toStringValue(value).trim().toLocaleLowerCase();
      if (key === 'dark' || key === 'light') return key;
    }
    const classText = `${document.documentElement?.className || ''} ${document.body?.className || ''}`.toLocaleLowerCase();
    if (/(^|\s)dark(\s|$)/.test(classText)) return 'dark';
    if (/(^|\s)light(\s|$)/.test(classText)) return 'light';
    try {
      return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
    } catch (_) {
      return 'light';
    }
  }

  function resolveViewerTheme() {
    return detectHostTheme();
  }

  function applyViewerThemeToElement(element) {
    if (!element) return element;
    element.dataset.theme = resolveViewerTheme();
    element.dataset.themeMode = 'auto';
    return element;
  }

  function syncViewerThemeToOpenUI() {
    const theme = resolveViewerTheme();
    const targets = [
      document.getElementById('coa-root'),
      document.getElementById('coa-message-range-bar'),
      document.getElementById('coa-message-range-toast'),
      ...document.querySelectorAll('.coa-paste-backdrop,.coa-html-preview-backdrop,.coa-modal.coa-dc-modal'),
    ].filter(Boolean);
    for (const target of targets) {
      target.dataset.theme = theme;
      target.dataset.themeMode = 'auto';
    }
  }

  function ensureHostThemeSync() {
    if (!viewerState.hostThemeObserver && typeof MutationObserver === 'function') {
      viewerState.hostThemeObserver = new MutationObserver(() => syncViewerThemeToOpenUI());
      if (document.documentElement) viewerState.hostThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
      if (document.body) viewerState.hostThemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    }
    if (!viewerState.hostThemeMedia && globalThis.matchMedia) {
      try {
        const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
        const listener = () => syncViewerThemeToOpenUI();
        if (typeof media.addEventListener === 'function') media.addEventListener('change', listener);
        else if (typeof media.addListener === 'function') media.addListener(listener);
        viewerState.hostThemeMedia = media;
        viewerState.hostThemeMediaListener = listener;
      } catch (_) {}
    }
    syncViewerThemeToOpenUI();
  }

  function ensureViewerMonoFont() {
    ensureExportFonts();
  }

  function buildCardRefMap(index) {
    const map = new Map();
    for (const type of ['log', 'ooc']) {
      const rows = (Array.isArray(index) ? index : [])
        .filter((item) => normalizeArchiveType(item?.archiveType, 'ooc') === type)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || toStringValue(a.id).localeCompare(toStringValue(b.id)));
      rows.forEach((item, i) => map.set(item.id, `${type.toUpperCase()}-${String(i + 1).padStart(3, '0')}`));
    }
    return map;
  }

  function renderViewerBarcode() {
    return `<div class="coa-barcode" aria-hidden="true">
      <svg width="132" height="34" viewBox="0 0 132 34">
        <g fill="currentColor">
          <rect x="0" width="3" height="34"/><rect x="5" width="1.5" height="34"/><rect x="9" width="4" height="34"/>
          <rect x="15" width="1.5" height="34"/><rect x="19" width="2" height="34"/><rect x="24" width="5" height="34"/>
          <rect x="31" width="1.5" height="34"/><rect x="35" width="3" height="34"/><rect x="40" width="1.5" height="34"/>
          <rect x="44" width="4" height="34"/><rect x="50" width="2" height="34"/><rect x="54" width="1.5" height="34"/>
          <rect x="58" width="5" height="34"/><rect x="65" width="1.5" height="34"/><rect x="69" width="3" height="34"/>
          <rect x="74" width="2" height="34"/><rect x="79" width="1.5" height="34"/><rect x="83" width="4" height="34"/>
          <rect x="89" width="1.5" height="34"/><rect x="93" width="3" height="34"/><rect x="98" width="5" height="34"/>
          <rect x="105" width="1.5" height="34"/><rect x="109" width="2" height="34"/><rect x="114" width="4" height="34"/>
          <rect x="120" width="1.5" height="34"/><rect x="124" width="3" height="34"/><rect x="129" width="3" height="34"/>
        </g>
      </svg>
    </div>`;
  }

  function prepareViewerContentHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = toStringValue(html);

    template.content.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('coa-reader-table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'coa-reader-table-wrap';
      table.parentNode?.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    template.content.querySelectorAll('img').forEach((img) => {
      img.classList.add('coa-reader-image');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
      if (!img.getAttribute('alt')) img.setAttribute('alt', '첨부 이미지');
    });

    template.content.querySelectorAll('a[href]').forEach((link) => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });

    return template.innerHTML;
  }

  function renderViewerTurnContent(value) {
    const source = prepareGeneralVisibleContent(stripCOALoreContextBlocks(toStringValue(value))).trim();
    return source ? prepareViewerContentHTML(coaRenderMarkdown(source)) : '<p>&nbsp;</p>';
  }

  function renderViewerLogBody(card) {
    const normalized = prepareCardForGeneralVisibleRender(card);
    const turns = parseDCRPLogBlocks(normalized, {
      excludeComments: false,
      excludeImages: false,
      excludeCodeBlocks: false,
    });
    if (!turns.length) return '<div class="coa-empty"><p>표시할 로그가 없음.</p></div>';
    return turns.map((turn, index) => {
      const role = turn.type === 'user' ? 'user' : 'ai';
      return `<section class="coa-turn ${role}">
        <div class="coa-turn-strip"><span class="coa-turn-who">${role === 'user' ? 'USER' : 'AI'}</span><span class="coa-turn-no">T-${String(index + 1).padStart(2, '0')}</span></div>
        <div class="coa-turn-body coa-reader-content coa-md">${renderViewerTurnContent(turn.raw || turn.text || '')}</div>
      </section>`;
    }).join('');
  }
  function ensureViewerStyle() {
    ensureViewerMonoFont();
    if (document.getElementById('coa-viewer-style')) return;
    const style = document.createElement('style');
    style.id = 'coa-viewer-style';
    style.textContent = `
      #coa-root.coa-overlay-root,
      .coa-paste-backdrop,
      .coa-html-preview-backdrop,
      .coa-modal.coa-dc-modal{
        --bg:#EDEDEA;--grid:rgba(20,20,18,.055);--paper:#F7F7F4;--ink:#161513;--sub:#4C4A45;--muted:#87847C;
        --line:#161513;--hairline:#D6D4CE;--strip:#E4E3DE;--fill:#161513;--fill-text:#F7F7F4;
        --shadow:5px 5px 0 rgba(22,21,19,.9);--shadow-soft:3px 3px 0 rgba(22,21,19,.85);
        --mono:'IBM Plex Mono',ui-monospace,monospace;
        --sans:'Pretendard Variable',Pretendard,'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;
      }
      #coa-root.coa-overlay-root[data-theme="dark"],
      .coa-paste-backdrop[data-theme="dark"],
      .coa-html-preview-backdrop[data-theme="dark"],
      .coa-modal.coa-dc-modal[data-theme="dark"]{
        --bg:#161614;--grid:rgba(240,238,230,.05);--paper:#201F1D;--ink:#EDEBE4;--sub:#B8B5AC;--muted:#7E7B73;
        --line:#EDEBE4;--hairline:#3A3935;--strip:#2A2926;--fill:#EDEBE4;--fill-text:#161614;
        --shadow:5px 5px 0 rgba(237,235,228,.85);--shadow-soft:3px 3px 0 rgba(237,235,228,.8);
      }
      #coa-root.coa-overlay-root{position:fixed;inset:0;z-index:2147483200;display:none;overflow:hidden;overscroll-behavior:none;color:var(--ink);font-family:var(--sans);background:rgba(12,12,10,.58);backdrop-filter:blur(2px);padding:16px;transition:background-color .2s,color .2s;align-items:flex-start;justify-content:center;}
      #coa-root.coa-overlay-root[data-open="1"]{display:flex;}
      #coa-root.coa-overlay-root[data-coa-suspended="1"]{display:none!important;}
      #coa-root *{box-sizing:border-box;}
      #coa-root button{font:inherit;color:inherit;}
      #coa-root .coa-mono{font-family:var(--mono);}
      #coa-root .coa-btn,#coa-root .coa-tab,#coa-root .coa-kind,#coa-root .coa-tag,#coa-root .coa-theme-toggle,#coa-root .coa-menu-pop button{-webkit-text-fill-color:currentColor;}
      .coa-app-shell{position:relative;width:min(1120px,calc(100vw - 32px));height:min(960px,calc(100vh - 32px));height:min(960px,calc(100dvh - 32px));max-height:none;overflow:hidden;background:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px),var(--bg);background-size:22px 22px,22px 22px,auto;border:2px solid var(--line);box-shadow:var(--shadow);}
      .coa-viewer-close{position:absolute;top:12px;right:12px;width:30px;height:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:var(--paper);border:1.5px solid var(--line);box-shadow:none;font-family:var(--mono);font-size:.82rem;font-weight:700;line-height:1;cursor:pointer;z-index:2;transition:transform .08s,box-shadow .08s,background-color .08s;}
      .coa-viewer-close:hover{box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-viewer-close:active{box-shadow:none;transform:translate(0,0);}
      .coa-viewer-close:focus-visible{outline:2px dashed var(--line);outline-offset:3px;}
      .coa-app{max-width:1060px;height:100%;min-height:0;margin:0 auto;padding:22px 26px 18px;display:flex;flex-direction:column;}

      .coa-masthead{background:var(--paper);border:2px solid var(--line);box-shadow:var(--shadow);padding:26px 58px 24px 28px;display:grid;grid-template-columns:1fr auto;gap:20px;margin-bottom:34px;position:relative;}
      .coa-masthead-ref{position:absolute;top:9px;left:12px;font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;color:var(--muted);}
      .coa-masthead h1{font-size:clamp(1.9rem,4.5vw,2.6rem);font-weight:900;letter-spacing:-.02em;line-height:1.02;margin:10px 0 0;text-transform:uppercase;}
      .coa-masthead-tagline{font-family:var(--mono);font-size:.72rem;letter-spacing:.18em;color:var(--sub);margin:12px 0 0;text-transform:uppercase;}
      .coa-mast-actions{display:flex;gap:8px;margin-top:18px;flex-wrap:wrap;}
      .coa-mast-side{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:14px;border-left:2px solid var(--line);padding-left:22px;}
      .coa-barcode svg{display:block;color:var(--ink);}
      .coa-barcode-code{font-family:var(--mono);font-size:.6rem;letter-spacing:.22em;color:var(--sub);text-align:center;margin-top:4px;white-space:nowrap;}

      .coa-btn,.coa-mini-btn{appearance:none;background:var(--paper);border:1.5px solid var(--line);border-radius:0;font-family:var(--mono);font-size:.74rem;font-weight:600;letter-spacing:.06em;padding:9px 15px;cursor:pointer;transition:transform .08s,box-shadow .08s;white-space:nowrap;line-height:1.2;}
      .coa-btn:hover,.coa-mini-btn:hover{box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-btn:active,.coa-mini-btn:active{box-shadow:none;transform:translate(0,0);}
      .coa-btn:focus-visible,.coa-mini-btn:focus-visible{outline:2px dashed var(--line);outline-offset:3px;}
      .coa-btn.primary,.coa-btn.fill,.coa-mini-btn.primary{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-btn.danger{color:var(--ink);background:var(--paper);}
      .coa-btn.ghost{background:var(--paper);}
      .coa-btn.sm{font-size:.68rem;padding:7px 11px;}
      .coa-theme-toggle{border:1.5px solid var(--line);background:var(--paper);font-family:var(--mono);font-size:.68rem;font-weight:600;letter-spacing:.08em;padding:7px 12px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;}
      .coa-theme-toggle:hover{box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-theme-toggle-sw{width:9px;height:9px;border:1.5px solid var(--line);background:var(--fill);}
      .coa-menu-wrap{position:relative;display:inline-block;}
      .coa-menu-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:70;background:var(--paper);border:1.5px solid var(--line);box-shadow:var(--shadow-soft);min-width:184px;display:none;}
      .coa-menu-pop[data-open="1"]{display:block;}
      .coa-menu-pop button{display:block;width:100%;text-align:left;border:0;background:none;font-family:var(--mono);font-size:.72rem;padding:10px 13px;border-bottom:1px solid var(--hairline);cursor:pointer;}
      .coa-menu-pop button:last-child{border-bottom:0;}
      .coa-menu-pop button:hover{background:var(--strip);}

      .coa-controls{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap;margin-bottom:14px;}
      .coa-search-cluster{flex:1 1 460px;min-width:0;display:flex;align-items:stretch;gap:8px;}
      .coa-tabs{display:flex;border:1.5px solid var(--line);background:var(--paper);}
      .coa-favorite-tab{min-width:52px;}
      .coa-tab{appearance:none;border:0;background:none;border-radius:0;padding:10px 18px;font-family:var(--mono);font-size:.74rem;font-weight:600;letter-spacing:.08em;cursor:pointer;}
      .coa-tab + .coa-tab{border-left:1.5px solid var(--line);}
      .coa-tab[data-active="1"]{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-tab[data-active="1"] small{color:var(--fill-text)!important;opacity:.78;}
      .coa-tab small{opacity:.55;margin-left:5px;font-size:.66rem;}
      .coa-search{flex:1 1 auto;min-width:220px;display:flex;align-items:center;gap:10px;border:1.5px solid var(--line);background:var(--paper);padding:0 14px;}
      .coa-search-prefix{font-family:var(--mono);font-size:.72rem;color:var(--muted);letter-spacing:.1em;}
      .coa-search input{border:0;background:none;font:inherit;font-size:.86rem;flex:1;color:var(--ink);padding:10px 0;outline:none;min-width:0;}
      .coa-search input::placeholder{color:var(--muted);}
      .coa-sort-group{flex:0 0 auto;display:inline-flex;align-items:stretch;border:1.5px solid var(--line);background:var(--paper);color:var(--ink);min-width:0;}
      .coa-sort-prefix{display:none;align-items:center;padding:0 0 0 10px;font-family:var(--mono);font-size:.68rem;font-weight:600;letter-spacing:.04em;color:var(--muted);white-space:nowrap;}
      .coa-sort-select{appearance:auto;min-width:118px;max-width:150px;border:0;background:var(--paper);color:var(--ink);padding:0 8px 0 11px;outline:none;font-family:var(--mono);font-size:.7rem;font-weight:600;letter-spacing:.03em;cursor:pointer;}
      .coa-sort-select option{background:var(--paper);color:var(--ink);}
      .coa-sort-direction{flex:0 0 40px;width:40px;border:0;border-left:1.5px solid var(--line);background:var(--paper);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-family:var(--mono);font-size:1rem;font-weight:700;line-height:1;cursor:pointer;box-shadow:none;}
      .coa-sort-select:hover,.coa-sort-select:focus,.coa-sort-direction:hover,.coa-sort-direction:focus-visible{background:var(--strip);}
      .coa-sort-direction:active{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-sort-select:focus-visible,.coa-sort-direction:focus-visible{outline:2px dashed var(--line);outline-offset:-4px;}
      .coa-selection-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-14px 0 16px;padding:10px;border:1.5px solid var(--line);background:var(--strip);}
      .coa-selection-count{margin-right:auto;font-family:var(--mono);font-size:.68rem;letter-spacing:.12em;color:var(--sub);white-space:nowrap;}
      .coa-selection-count b{color:var(--ink);font-size:.8rem;}
      .coa-selection-bar .coa-btn:disabled{opacity:.35;cursor:default;box-shadow:none;transform:none;}
      .coa-tag-strip{display:flex;align-items:center;gap:8px;min-width:0;margin-bottom:30px;}
      .coa-tag-row{display:flex;flex:1 1 auto;min-width:0;flex-wrap:nowrap;gap:8px;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior-inline:contain;padding:3px 1px 5px;}
      .coa-tag-row::-webkit-scrollbar{display:none;width:0;height:0;}
      .coa-tag-scroll{display:none;flex:0 0 30px;width:30px;height:30px;padding:0;align-items:center;justify-content:center;border:1.5px solid var(--line);background:var(--paper);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-family:var(--mono);font-size:.66rem;font-weight:600;line-height:1;cursor:pointer;box-shadow:none;transition:transform .08s,box-shadow .08s,opacity .08s;}
      .coa-tag-strip[data-overflow="1"] .coa-tag-scroll{display:inline-flex;}
      .coa-tag-scroll:hover:not(:disabled){box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-tag-scroll:active:not(:disabled){box-shadow:none;transform:translate(0,0);}
      .coa-tag-scroll:disabled{opacity:.28;cursor:default;}
      .coa-tag-scroll:focus-visible{outline:2px dashed var(--line);outline-offset:2px;}
      .coa-tag{flex:0 0 auto;white-space:nowrap;appearance:none;border:1.5px solid var(--line);background:var(--paper);border-radius:0;font-family:var(--mono);font-size:.68rem;font-weight:500;letter-spacing:.04em;padding:5px 11px;cursor:pointer;transition:transform .08s,box-shadow .08s;}
      .coa-tag:hover{box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-tag[data-active="1"]{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-tag[data-active="1"] b{color:inherit;opacity:.75;}
      .coa-tag b{font-weight:400;opacity:.55;margin-left:4px;}
      .coa-tag-empty{font-family:var(--mono);font-size:.68rem;color:var(--muted);}

      /* CARD는 카드 영역만 실제 내부 스크롤하고, 네이티브 스크롤바는 숨긴다. */
      .coa-card-viewport{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none;padding:4px 7px 20px 2px;margin:0 -7px 0 -2px;}
      .coa-card-viewport::-webkit-scrollbar{display:none;width:0;height:0;}
      .coa-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px;align-content:start;}
      .coa-card-viewport[hidden],.coa-gallery[hidden],.coa-rack[hidden]{display:none!important;}
      .coa-card-progress{flex:0 0 20px;min-height:20px;display:flex;align-items:flex-end;padding:7px 2px 0;user-select:none;pointer-events:none;}
      .coa-card-progress[hidden]{display:none!important;}
      .coa-card-progress-track{position:relative;display:block;width:100%;height:2px;background:var(--hairline);overflow:visible;}
      .coa-card-progress-track::before,.coa-card-progress-track::after{content:"";position:absolute;top:-2px;width:1.5px;height:6px;background:var(--line);opacity:.45;}
      .coa-card-progress-track::before{left:0;}.coa-card-progress-track::after{right:0;}
      .coa-card-progress-thumb{position:absolute;left:0;top:-2px;width:62px;max-width:24%;height:6px;background:var(--fill);box-shadow:1px 1px 0 var(--line);transform:translateX(0);will-change:transform;}

      .coa-view-toggle{border:1.5px solid var(--line);background:var(--paper);font-family:var(--mono);font-size:.68rem;font-weight:600;letter-spacing:.12em;padding:7px 12px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;}
      .coa-view-toggle:hover{box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-view-toggle-sw{width:9px;height:9px;border:1.5px solid var(--line);background:var(--fill);}

      .coa-rack{position:relative;flex:1 1 auto;min-height:0;}
      .coa-rack-viewport{height:100%;min-height:280px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;touch-action:pan-y;scroll-behavior:auto;border:2px solid var(--line);background:linear-gradient(180deg,var(--strip),var(--paper));box-shadow:var(--shadow);padding:38px 30px 70px 26px;scrollbar-width:none;-ms-overflow-style:none;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 18px,#000 calc(100% - 14px),transparent 100%);mask-image:linear-gradient(to bottom,transparent 0,#000 18px,#000 calc(100% - 14px),transparent 100%);cursor:grab;}
      .coa-rack-viewport.coa-rack-dragging{cursor:grabbing;user-select:none;}
      .coa-rack-viewport::-webkit-scrollbar{display:none;width:0;height:0;}
      /* STACK의 실제 스크롤은 숨긴 채, 오른쪽에 장식형 세로 위치 표시만 둔다. */
      .coa-rack-progress{position:absolute;z-index:3200;top:46px;right:10px;bottom:20px;width:16px;display:flex;justify-content:flex-end;user-select:none;pointer-events:none;}
      .coa-rack-progress[hidden]{display:none!important;}
      .coa-rack-progress-track{position:relative;display:block;width:2px;height:100%;background:var(--hairline);overflow:visible;}
      .coa-rack-progress-track::before,.coa-rack-progress-track::after{content:"";position:absolute;left:-2px;width:6px;height:1.5px;background:var(--line);opacity:.45;}
      .coa-rack-progress-track::before{top:0;}.coa-rack-progress-track::after{bottom:0;}
      .coa-rack-progress-thumb{position:absolute;left:-2px;top:0;width:6px;height:62px;max-height:24%;background:var(--fill);box-shadow:1px 1px 0 var(--line);transform:translateY(0);will-change:transform;}
      .coa-rack-deck{position:relative;padding:10px 8px 34px;}
      .coa-rack-label{position:absolute;right:14px;top:-13px;z-index:3000;border:1.5px solid var(--line);background:var(--paper);box-shadow:var(--shadow-soft);font-family:var(--mono);font-size:.6rem;font-weight:600;letter-spacing:.18em;padding:5px 13px;text-transform:uppercase;}
      .coa-rack-empty{text-align:center;color:var(--sub);border:2px dashed var(--line);padding:34px;background:var(--paper);font-size:.86rem;}

      /* 카드 자체는 가로형·정면을 유지하고, 숨김 스크롤 위에서 아이폰 Safari 탭처럼 세로로 겹쳐 이동한다. */
      .coa-rk-panel{--rk-shift:0px;--rk-hover:0px;--rk-scale:1;position:relative;margin-bottom:-180px;z-index:calc(var(--i) + 1);transform-origin:center top;transform:translateY(calc(var(--rk-shift) + var(--rk-hover))) scale(var(--rk-scale));transition:margin-bottom .34s cubic-bezier(.22,.82,.3,1),transform .2s cubic-bezier(.2,.82,.25,1),opacity .2s ease;will-change:transform;}
      .coa-rk-panel:last-child{margin-bottom:0;}
      .coa-rk-pane{position:relative;background:var(--paper);border:2px solid var(--line);box-shadow:0 -6px 15px rgba(22,21,19,.13);transition:box-shadow .2s ease,filter .2s ease;background-clip:padding-box;}
      .coa-rk-pane::before{content:"";position:absolute;left:18px;right:18px;top:-8px;height:7px;border:2px solid var(--line);border-bottom:0;background:var(--paper);pointer-events:none;}
      .coa-rk-panel:not(.open):hover{--rk-hover:-4px;}
      .coa-rk-panel:not(.open):hover .coa-rk-pane{box-shadow:0 -8px 18px rgba(22,21,19,.18),var(--shadow-soft);}

      .coa-rk-titlebar{display:grid;grid-template-columns:42px minmax(0,1fr) 38px 52px;min-height:38px;align-items:stretch;border-bottom:2px solid var(--line);background:var(--strip);}
      .coa-rk-close{position:relative;z-index:2;border:0;border-right:1.5px solid var(--line);background:none;box-shadow:none;font-family:var(--mono);font-size:.8rem;cursor:pointer;color:var(--ink);transition:transform .08s,box-shadow .08s,background-color .08s;}
      .coa-rk-close:hover{background:var(--paper);box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;}
      .coa-rk-close:active{box-shadow:none;transform:translate(0,0);}
      .coa-rk-close:focus-visible{outline:2px dashed var(--line);outline-offset:-4px;}
      .coa-rk-title{display:flex;align-items:center;justify-content:center;text-align:center;padding:8px 10px;font-family:var(--mono);font-size:.64rem;font-weight:600;letter-spacing:.16em;color:var(--sub);text-transform:uppercase;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;}
      .coa-rk-star{display:flex;align-items:center;justify-content:center;border:0;border-left:1.5px solid var(--line);background:transparent;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-family:var(--mono);font-size:.9rem;cursor:pointer;box-shadow:none;}
      .coa-rk-star:hover{background:var(--paper);}
      .coa-rk-star:focus-visible{outline:2px dashed var(--line);outline-offset:-4px;}
      .coa-rk-kind{display:flex;align-items:center;justify-content:center;border-left:1.5px solid var(--line);font-family:var(--mono);font-size:.56rem;font-weight:600;letter-spacing:.08em;}
      .coa-rk-kind.log{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}

      .coa-rk-body{height:232px;padding:19px 24px 0;cursor:pointer;position:relative;overflow:hidden;transition:height .34s cubic-bezier(.22,.82,.3,1),padding-bottom .34s cubic-bezier(.22,.82,.3,1);}
      .coa-rk-body h2{font-size:1.24rem;font-weight:900;letter-spacing:-.02em;line-height:1.25;margin:0;}
      .coa-rk-meta{font-family:var(--mono);font-size:.62rem;color:var(--muted);letter-spacing:.1em;margin:7px 0 0;}
      .coa-rk-excerpt{font-size:.83rem;line-height:1.85;color:var(--sub);margin:12px 0 0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
      .coa-rk-watermark{position:absolute;right:-10px;bottom:-24px;font-family:var(--mono);font-weight:600;font-size:4.2rem;letter-spacing:-.04em;color:var(--ink);opacity:.05;pointer-events:none;white-space:nowrap;user-select:none;}
      .coa-rk-foot{display:none;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--hairline);padding:8px 14px;font-family:var(--mono);font-size:.62rem;color:var(--muted);letter-spacing:.06em;}
      .coa-rk-foot-side{display:flex;gap:10px;align-items:center;}
      .coa-rk-open{border:1.5px solid var(--line);background:var(--paper);font-family:inherit;font-size:.62rem;font-weight:600;padding:4px 12px;cursor:pointer;color:var(--ink);}
      .coa-rk-open:hover{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}

      /* 첫 클릭: 덱에서 선택 카드만 앞으로 드러냄. 두 번째 클릭: 실제 리더를 연다. */
      .coa-rk-panel.open{--rk-hover:-10px;--rk-scale:1.012;margin-bottom:-104px;z-index:2900;}
      .coa-rk-panel.open .coa-rk-pane{box-shadow:0 12px 28px rgba(22,21,19,.28),var(--shadow);}
      .coa-rk-panel.open .coa-rk-pane::before{background:var(--fill);}
      .coa-rk-panel.open .coa-rk-foot{display:flex;}
      .coa-rk-panel.open .coa-rk-body{height:302px;padding-bottom:18px;}
      .coa-rk-panel.open .coa-rk-excerpt{-webkit-line-clamp:8;}
      .coa-rk-panel.open .coa-rk-titlebar{background:var(--fill);}
      .coa-rk-panel.open .coa-rk-title{color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-rk-panel.open .coa-rk-close{color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;border-right-color:var(--fill-text);}
      .coa-rk-panel.open .coa-rk-close:hover{background:var(--paper);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;border-right-color:var(--line);}
      .coa-rk-panel.open .coa-rk-star{color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;border-left-color:var(--fill-text);}
      .coa-rk-panel.open .coa-rk-star:hover{background:var(--paper);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;}
      .coa-rk-panel.open .coa-rk-kind{color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;border-left-color:var(--fill-text);}
      .coa-rk-panel.open .coa-rk-kind.log{background:var(--paper);color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;}

      @keyframes coaRkStandIn{from{opacity:0;transform:translateY(30px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}
      .coa-rack.enter .coa-rk-panel{animation:coaRkStandIn .42s cubic-bezier(.2,.85,.3,1) both;animation-delay:calc(var(--i) * 34ms);}
      .coa-card{background:var(--paper);border:2px solid var(--line);text-align:left;padding:0;display:flex;flex-direction:column;min-height:210px;cursor:pointer;transition:transform .1s,box-shadow .1s;}
      .coa-card.selected,.coa-rk-panel.selected .coa-rk-pane{box-shadow:var(--shadow);}
      .coa-card:hover{box-shadow:var(--shadow);transform:translate(-2px,-2px);}
      .coa-card:focus-visible{outline:2px dashed var(--line);outline-offset:3px;}
      .coa-card-strip{display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid var(--line);background:var(--strip);padding:7px 12px;}
      .coa-card-strip-left,.coa-card-strip-actions{display:inline-flex;align-items:center;gap:8px;min-width:0;}
      .coa-select-mark{display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border:1.5px solid var(--line);background:var(--paper);font-family:var(--mono);font-size:.7rem;font-weight:800;line-height:1;}
      .coa-card-star{width:24px;height:24px;padding:0;border:0;background:transparent;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-family:var(--mono);font-size:.95rem;line-height:1;cursor:pointer;}
      .coa-card-star:hover{background:var(--paper);box-shadow:var(--shadow-soft);transform:translate(-1px,-1px);}
      .coa-card-star:active{box-shadow:none;transform:none;}
      .coa-card-star:focus-visible{outline:2px dashed var(--line);outline-offset:1px;}
      .coa-card-ref{font-family:var(--mono);font-size:.64rem;font-weight:600;letter-spacing:.12em;color:var(--sub);}
      .coa-kind{font-family:var(--mono);font-size:.62rem;font-weight:600;letter-spacing:.14em;border:1.5px solid var(--line);padding:2px 8px;background:var(--paper);}
      .coa-kind.log{background:var(--fill);color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-card-body{padding:16px 16px 14px;display:flex;flex-direction:column;gap:10px;flex:1;}
      .coa-card-title{font-size:1.03rem;font-weight:800;line-height:1.45;letter-spacing:-.01em;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .coa-card-excerpt{font-size:.82rem;line-height:1.72;color:var(--sub);margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
      .coa-card-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid var(--hairline);margin-top:auto;padding:9px 12px;}
      .coa-card-tags{font-family:var(--mono);font-size:.66rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.02em;}
      .coa-card-foot time{font-family:var(--mono);font-size:.66rem;color:var(--muted);white-space:nowrap;}
      .coa-empty{grid-column:1/-1;align-self:center;justify-self:center;text-align:center;color:var(--sub);border:2px dashed var(--line);padding:34px;max-width:460px;background:var(--paper);}
      .coa-bulk-tag-panel{width:min(640px,100%);background:var(--paper);border:2px solid var(--line);box-shadow:var(--shadow);overflow:hidden;}
      .coa-bulk-tag-body{display:grid;gap:14px;padding:18px;}
      .coa-bulk-tag-help{margin:0;color:var(--sub);font-size:.78rem;line-height:1.65;}

      .coa-reader{position:fixed;inset:0;z-index:2147483250;background:rgba(12,12,10,.62);display:flex;align-items:flex-start;justify-content:center;padding:44px 20px;overflow:hidden;}
      .coa-reader-panel{width:min(800px,100%);max-height:calc(100vh - 88px);max-height:calc(100dvh - 88px);background:var(--paper);border:2px solid var(--line);box-shadow:var(--shadow);display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;}
      .coa-reader-strip{display:flex;align-items:center;gap:12px;background:var(--strip);border-bottom:2px solid var(--line);padding:9px 16px;}
      .coa-reader-strip-ref,.coa-reader-strip-date{font-family:var(--mono);font-size:.66rem;font-weight:600;letter-spacing:.14em;color:var(--sub);}
      .coa-reader-strip-spacer{flex:1;}
      .coa-reader-top{display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;padding:20px 24px 16px;border-bottom:1px solid var(--hairline);}
      .coa-reader-title h2{font-size:1.2rem;font-weight:900;letter-spacing:-.01em;margin:0;}
      .coa-reader-title p{font-family:var(--mono);font-size:.68rem;color:var(--muted);margin:7px 0 0;letter-spacing:.05em;}
      .coa-reader-actions{margin-left:auto;display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;}
      .coa-reader-scroll-shell{position:relative;min-height:0;overflow:hidden;}
      .coa-reader-body{height:100%;min-height:0;padding:28px 42px 38px 30px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none;-ms-overflow-style:none;color:var(--ink);}
      .coa-reader-body::-webkit-scrollbar{display:none;width:0;height:0;}
      .coa-reader-progress{position:absolute;z-index:3;top:18px;right:10px;bottom:18px;width:16px;display:flex;justify-content:flex-end;user-select:none;pointer-events:none;}
      .coa-reader-progress[hidden]{display:none!important;}
      .coa-reader-progress-track{position:relative;display:block;width:2px;height:100%;background:var(--hairline);overflow:visible;}
      .coa-reader-progress-track::before,.coa-reader-progress-track::after{content:"";position:absolute;left:-2px;width:6px;height:1.5px;background:var(--line);opacity:.45;}
      .coa-reader-progress-track::before{top:0;}.coa-reader-progress-track::after{bottom:0;}
      .coa-reader-progress-thumb{position:absolute;left:-2px;top:0;width:6px;height:62px;max-height:24%;background:var(--fill);box-shadow:1px 1px 0 var(--line);transform:translateY(0);will-change:transform;}
      .coa-ooc-view{font-size:.9rem;line-height:1.9;}
      .coa-reader-content{min-width:0;overflow-wrap:anywhere;word-break:normal;}
      .coa-reader-content > :first-child{margin-top:0!important;}
      .coa-reader-content > :last-child{margin-bottom:0!important;}
      .coa-reader-content h1,.coa-reader-content h2,.coa-reader-content h3,.coa-reader-content h4,.coa-reader-content h5,.coa-reader-content h6{margin:1.5em 0 .7em;padding-bottom:.34em;border-bottom:1px solid var(--hairline);line-height:1.4;color:var(--ink);}
      .coa-reader-content h1{font-size:1.55rem}.coa-reader-content h2{font-size:1.32rem}.coa-reader-content h3{font-size:1.16rem}.coa-reader-content h4,.coa-reader-content h5,.coa-reader-content h6{font-size:1rem}
      .coa-reader-content p{margin:.75em 0;}
      .coa-reader-content strong,.coa-reader-content b{font-weight:850;color:var(--ink);}
      .coa-reader-content em,.coa-reader-content i{font-style:normal;color:var(--sub);}
      .coa-reader-content s,.coa-reader-content del{color:var(--muted);text-decoration-thickness:1px;}
      .coa-reader-content ul,.coa-reader-content ol{margin:.8em 0;padding-left:1.65em;}
      .coa-reader-content li + li{margin-top:.34em;}
      .coa-reader-content hr{border:0;border-top:1.5px solid var(--line);margin:1.55em 0;}
      .coa-reader-content a{color:var(--ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere;}
      .coa-reader-content :not(pre)>code{display:inline;padding:2px 5px;border:1px solid var(--hairline);background:var(--strip);color:var(--ink);font-family:var(--mono);font-size:.88em;overflow-wrap:anywhere;}
      .coa-reader-content pre{max-width:100%;overflow:visible;margin:14px 0;padding:13px 15px;border:1.5px solid var(--line);background:var(--strip);line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;tab-size:2;}
      .coa-reader-content pre code{padding:0;border:0;background:transparent;color:inherit;font-family:var(--mono);font-size:.86rem;white-space:inherit;overflow-wrap:inherit;word-break:inherit;}
      .coa-reader-content blockquote{margin:14px 0;padding:12px 15px;border-left:4px solid var(--line);background:var(--strip);color:var(--sub);}
      .coa-reader-content blockquote > :first-child{margin-top:0!important;}
      .coa-reader-content blockquote > :last-child{margin-bottom:0!important;}
      .coa-reader-content blockquote h1,.coa-reader-content blockquote h2,.coa-reader-content blockquote h3,.coa-reader-content blockquote h4,.coa-reader-content blockquote h5,.coa-reader-content blockquote h6{margin:.15em 0 .65em;padding-bottom:.3em;border-bottom:1px solid var(--hairline);color:var(--ink);}
      .coa-reader-table-wrap{width:100%;overflow-x:auto;margin:16px 0;border:1.5px solid var(--line);background:var(--paper);scrollbar-width:thin;}
      .coa-reader-table-wrap table{width:max-content!important;min-width:100%;border-collapse:collapse!important;table-layout:auto!important;margin:0!important;font-size:.84rem;}
      .coa-reader-table-wrap th,.coa-reader-table-wrap td{min-width:112px;border:0!important;border-right:1px solid var(--hairline)!important;border-bottom:1px solid var(--hairline)!important;padding:9px 11px!important;vertical-align:top;white-space:normal;overflow-wrap:break-word;}
      .coa-reader-table-wrap th{background:var(--strip);font-family:var(--mono);font-size:.72rem;letter-spacing:.04em;text-align:left;}
      .coa-reader-table-wrap tr:last-child td{border-bottom:0!important;}
      .coa-reader-table-wrap th:last-child,.coa-reader-table-wrap td:last-child{border-right:0!important;}
      .coa-reader-image{display:block;max-width:100%!important;width:auto!important;height:auto!important;max-height:70vh;object-fit:contain;margin:7px auto 0;padding:0;border:0;background:transparent;box-shadow:var(--shadow-soft);}
      .coa-reader-content figure{margin:7px 0 0;text-align:center;}
      .coa-reader-content p:has(> .coa-reader-image:only-child),.coa-reader-content p:has(> img:only-child){margin:0;line-height:0;}.coa-reader-content p:has(> .coa-reader-image:only-child)+p,.coa-reader-content p:has(> img:only-child)+p,.coa-reader-content figure+p{margin-top:2px;}
      .coa-reader-content figcaption{margin-top:7px;font-family:var(--mono);font-size:.68rem;color:var(--muted);}
      .coa-turn{border:1.5px solid var(--line);margin-bottom:20px;background:var(--paper);}
      .coa-turn-strip{display:flex;align-items:center;justify-content:space-between;background:var(--strip);border-bottom:1.5px solid var(--line);padding:5px 12px;}
      .coa-turn-who{font-family:var(--mono);font-size:.62rem;font-weight:600;letter-spacing:.18em;}
      .coa-turn-no{font-family:var(--mono);font-size:.6rem;color:var(--muted);letter-spacing:.1em;}
      .coa-turn.user .coa-turn-strip{background:var(--fill);border-bottom-color:var(--line);}
      .coa-turn.user .coa-turn-who,.coa-turn.user .coa-turn-no{color:var(--fill-text);}
      .coa-turn-body{padding:15px 17px;font-size:.87rem;line-height:1.9;}
      .coa-turn-body p{margin:0;}
      .coa-turn-body p + p{margin-top:9px;}
      .coa-turn-body em,.coa-turn-body i,.coa-ooc-view em,.coa-ooc-view i{color:var(--sub);font-style:normal;}

      .coa-modal{position:fixed;inset:0;z-index:2147483350;background:rgba(12,12,10,.55);display:flex;align-items:flex-start;justify-content:center;padding:44px 20px;overflow:auto;}
      .coa-edit-panel,.coa-paste-modal,.coa-log-import-modal,.coa-html-preview-modal,.coa-dc-panel{background:var(--paper)!important;color:var(--ink);border:2px solid var(--line)!important;border-radius:0!important;box-shadow:var(--shadow)!important;overflow:hidden;}
      .coa-edit-panel{width:min(880px,100%);max-height:calc(100vh - 88px);display:grid;grid-template-rows:auto 1fr auto;}
      .coa-paste-modal{width:min(880px,100%);max-height:calc(100vh - 36px);display:grid;grid-template-rows:auto 1fr auto;}
      .coa-log-import-modal{width:min(940px,100%);height:min(920px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;}
      .coa-paste-head,.coa-edit-head,.coa-html-preview-head{background:var(--strip)!important;color:var(--ink)!important;border-bottom:2px solid var(--line)!important;padding:10px 14px!important;display:flex;align-items:center;justify-content:space-between;gap:12px;}
      .coa-paste-head h2,.coa-edit-head h2,.coa-html-preview-head h2{font-family:var(--mono);font-size:.78rem!important;letter-spacing:.12em;text-transform:uppercase;margin:0!important;}
      .coa-paste-body,.coa-edit-form{padding:18px;background:var(--paper);color:var(--ink);}
      .coa-paste-body{overflow:auto;display:grid;gap:12px;}
      .coa-edit-form{overflow:auto;display:grid;gap:14px;}
      .coa-edit-form > .coa-form-grid,.coa-edit-form > .coa-field{min-width:0;}
      .coa-paste-foot,.coa-edit-foot{padding:12px 16px!important;border-top:1.5px solid var(--line)!important;background:var(--strip)!important;display:flex;justify-content:flex-end;gap:8px;}
      .coa-paste-foot .coa-actions,.coa-edit-foot .coa-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;}
      .coa-form-grid{display:grid;grid-template-columns:1fr 160px;gap:10px;}
      .coa-form-row{display:grid;gap:6px;}
      .coa-archive-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
      .coa-archive-option{position:relative;display:block;min-width:0;cursor:pointer;}
      .coa-archive-option input{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;padding:0;margin:0;}
      .coa-archive-option-card{display:grid;gap:3px;min-height:62px;box-sizing:border-box;padding:11px 12px;transition:background .08s,border-color .08s,box-shadow .08s;}
      .coa-archive-option-card b{font-size:14px;line-height:1.2;}
      .coa-archive-option-card small{font-size:11px;line-height:1.4;overflow-wrap:anywhere;}
      .coa-log-import-fields{display:grid;gap:10px;min-width:0;}
      .coa-log-option-block{display:grid;gap:5px;min-width:0;}
      .coa-log-meta-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:8px;}
      .coa-log-meta-select{display:grid;gap:4px;min-width:0;}
      .coa-html-preview-actions{display:flex;gap:8px;flex-wrap:wrap;}
      .coa-html-preview-controls .coa-select{min-width:0;}
      .coa-form-grid.three{grid-template-columns:1fr 1fr 1fr;}
      .coa-field label,.coa-form-row label,.coa-log-option-title,.coa-log-meta-select span{display:block;margin:0 0 6px;font-family:var(--mono);font-size:.68rem;font-weight:600;letter-spacing:.05em;color:var(--sub);}
      .coa-input,.coa-select,.coa-textarea,.coa-paste-backdrop input,.coa-paste-backdrop select,.coa-paste-backdrop textarea{box-sizing:border-box;width:100%;border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;padding:10px 12px;font-family:var(--sans);font-size:14px;outline:none;}
      .coa-select,.coa-paste-backdrop select,.coa-sort-select{-webkit-appearance:auto!important;appearance:auto!important;background-image:none!important;padding-right:30px!important;}
      .coa-input:focus,.coa-select:focus,.coa-textarea:focus,.coa-paste-backdrop input:focus,.coa-paste-backdrop select:focus,.coa-paste-backdrop textarea:focus{outline:2px dashed var(--line);outline-offset:2px;box-shadow:none!important;}
      .coa-textarea{min-height:320px;resize:vertical;line-height:1.55;font-family:var(--mono);}
      .coa-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--sub);}
      .coa-dc-option-group{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:9px 0 10px;border-bottom:1px solid var(--line);margin-bottom:8px;}
      .coa-dc-option-title{width:100%;font-family:var(--mono);font-size:.68rem;font-weight:800;letter-spacing:.08em;color:var(--ink);}
      .coa-archive-option-card{border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;}
      .coa-archive-option input:checked + .coa-archive-option-card{background:var(--fill)!important;color:var(--fill-text)!important;}
      .coa-archive-option input:focus-visible + .coa-archive-option-card{outline:2px dashed var(--line);outline-offset:2px;}
      /* 채팅 가져오기 모달을 현 보관함 UI와 동일한 하드 보더/모노 톤으로 통일. */
      .coa-paste-backdrop .coa-log-import-modal{background:var(--paper)!important;color:var(--ink)!important;border:2px solid var(--line)!important;border-radius:0!important;box-shadow:none!important;font-family:system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif!important;}
      .coa-paste-backdrop .coa-log-import-summary{padding:12px 16px!important;background:var(--strip)!important;border-bottom:1.5px solid var(--line)!important;border-radius:0!important;display:grid;gap:10px;}
      .coa-paste-backdrop .coa-log-status{font-family:var(--mono)!important;font-size:.66rem!important;line-height:1.55;color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;letter-spacing:.03em;}
      .coa-paste-backdrop .coa-log-quick{display:flex!important;gap:7px!important;flex-wrap:wrap!important;align-items:center!important;}
      .coa-paste-backdrop .coa-log-page-label{display:inline-flex!important;align-items:center!important;min-height:32px!important;padding:0 4px!important;font-family:var(--mono)!important;font-size:.63rem!important;font-weight:700!important;color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-nav-arrow{min-width:34px!important;padding-left:8px!important;padding-right:8px!important;}
      .coa-paste-backdrop .coa-log-tool-menu{position:relative!important;margin:0!important;padding:0!important;}
      .coa-paste-backdrop .coa-log-tool-menu > summary{list-style:none!important;min-height:32px!important;display:inline-flex!important;align-items:center!important;padding:8px 11px!important;border:1.5px solid var(--line)!important;background:var(--paper)!important;color:var(--ink)!important;font-family:var(--mono)!important;font-size:.68rem!important;font-weight:600!important;letter-spacing:.04em!important;line-height:1.15!important;cursor:pointer!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-tool-menu > summary::-webkit-details-marker{display:none!important;}
      .coa-paste-backdrop .coa-log-tool-menu > summary::after{content:' ▾';margin-left:5px!important;color:var(--muted)!important;}
      .coa-paste-backdrop .coa-log-tool-menu[open] > summary{background:var(--strip)!important;}
      .coa-paste-backdrop .coa-log-tool-menu-pop{position:absolute!important;z-index:30!important;right:0!important;top:calc(100% + 5px)!important;min-width:170px!important;display:grid!important;gap:0!important;padding:5px!important;border:1.5px solid var(--line)!important;background:var(--paper)!important;}
      .coa-paste-backdrop .coa-log-tool-menu-pop .coa-mini-btn{width:100%!important;text-align:left!important;border-width:0 0 1px!important;padding:9px 10px!important;}
      .coa-paste-backdrop .coa-log-tool-menu-pop .coa-mini-btn:last-child{border-bottom-width:0!important;}
      .coa-paste-backdrop .coa-log-quick .coa-mini-btn[hidden]{display:none!important;}
      .coa-paste-backdrop .coa-log-import-search[hidden]{display:none!important;}
      .coa-paste-backdrop .coa-log-import-search{
        display:grid!important;grid-template-columns:minmax(220px,1fr) auto!important;gap:7px 10px!important;align-items:center!important;
        padding-top:10px!important;border-top:1.5px solid var(--line)!important;
      }
      .coa-paste-backdrop .coa-log-import-search-field{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;gap:8px!important;align-items:center!important;min-width:0!important;}
      .coa-paste-backdrop .coa-log-import-search-field > span{font-family:var(--mono)!important;font-size:.66rem!important;font-weight:800!important;letter-spacing:.08em!important;color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;}
      .coa-paste-backdrop .coa-log-import-search-field input{height:34px!important;padding:7px 10px!important;font-family:var(--sans)!important;font-size:.78rem!important;}
      .coa-paste-backdrop .coa-log-import-search-actions{display:flex!important;gap:6px!important;align-items:center!important;justify-content:flex-end!important;}
      .coa-paste-backdrop .coa-log-import-search .coa-mini-btn{padding:7px 9px!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-import-search .coa-mini-btn:disabled{opacity:.38!important;cursor:not-allowed!important;box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-import-search-status{grid-column:1/-1!important;font-family:var(--mono)!important;font-size:.63rem!important;line-height:1.35!important;color:var(--muted)!important;-webkit-text-fill-color:var(--muted)!important;}
      .coa-paste-backdrop .coa-log-quick .coa-mini-btn,
      .coa-paste-backdrop .coa-log-import-search .coa-mini-btn,
      .coa-paste-backdrop .coa-paste-head .coa-mini-btn,
      .coa-paste-backdrop .coa-log-import-foot .coa-mini-btn{
        appearance:none!important;border:1.5px solid var(--line)!important;border-radius:0!important;
        background:var(--paper)!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;
        font-family:var(--mono)!important;font-size:.68rem!important;font-weight:600!important;letter-spacing:.04em!important;
        padding:8px 11px!important;line-height:1.15!important;box-shadow:none!important;cursor:pointer!important;
        transition:none!important;
      }
      .coa-paste-backdrop .coa-log-quick .coa-mini-btn:hover,
      .coa-paste-backdrop .coa-log-import-search .coa-mini-btn:hover,
      .coa-paste-backdrop .coa-paste-head .coa-mini-btn:hover,
      .coa-paste-backdrop .coa-log-import-foot .coa-mini-btn:hover{background:var(--strip)!important;box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-quick .coa-mini-btn:active,
      .coa-paste-backdrop .coa-log-import-search .coa-mini-btn:active,
      .coa-paste-backdrop .coa-paste-head .coa-mini-btn:active,
      .coa-paste-backdrop .coa-log-import-foot .coa-mini-btn:active{box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-import-foot .coa-mini-btn.primary{background:var(--fill)!important;color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-paste-backdrop .coa-log-import-foot .coa-mini-btn:disabled{opacity:.38!important;cursor:not-allowed!important;box-shadow:none!important;transform:none!important;}

      .coa-paste-backdrop .coa-log-list{
        min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;
        padding:8px 10px!important;display:block!important;background:var(--bg)!important;scroll-behavior:auto!important;
      }
      .coa-paste-backdrop .coa-log-row{
        display:grid!important;grid-template-columns:26px 72px minmax(0,1fr) auto!important;gap:10px!important;align-items:start!important;
        border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;
        margin:0 0 6px!important;padding:8px 10px!important;cursor:pointer!important;box-shadow:none!important;
        touch-action:pan-y!important;-webkit-user-select:none!important;user-select:none!important;
      }
      .coa-paste-backdrop .coa-log-row:last-child{margin-bottom:0!important;}
      .coa-paste-backdrop .coa-log-row:hover{background:var(--strip)!important;box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-row[data-selected="1"]{background:var(--strip)!important;border-left-width:5px!important;padding-left:6px!important;box-shadow:none!important;}
      .coa-paste-backdrop .coa-log-row[data-anchor="1"]{outline:2px dashed var(--line)!important;outline-offset:2px!important;}
      .coa-paste-backdrop .coa-log-row[data-search-current="1"]{outline:3px double var(--line)!important;outline-offset:2px!important;box-shadow:none!important;}
      .coa-paste-backdrop .coa-log-role{
        display:inline-flex!important;justify-content:center!important;align-items:center!important;min-height:22px!important;
        border:1.5px solid var(--line)!important;border-radius:0!important;padding:3px 7px!important;
        background:var(--paper)!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;
        font-family:var(--mono)!important;font-size:.61rem!important;font-weight:600!important;letter-spacing:.1em!important;line-height:1.15!important;
      }
      .coa-paste-backdrop .coa-log-role.user{background:var(--fill)!important;color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-paste-backdrop .coa-log-main{position:relative!important;min-width:0!important;padding-right:40px!important;}
      .coa-paste-backdrop .coa-log-preview-btn{
        appearance:none!important;position:absolute!important;top:0!important;right:0!important;width:30px!important;height:30px!important;
        display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0!important;
        border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;
        color:var(--muted)!important;-webkit-text-fill-color:currentColor!important;cursor:pointer!important;box-shadow:none!important;
        transition:none!important;
      }
      .coa-paste-backdrop .coa-log-preview-btn:hover{background:var(--strip)!important;color:var(--ink)!important;box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-preview-btn:active{box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-log-preview-btn:focus-visible{outline:2px dashed var(--line)!important;outline-offset:2px!important;}
      .coa-paste-backdrop .coa-log-preview-btn svg{display:block!important;width:15px!important;height:15px!important;overflow:visible!important;pointer-events:none!important;}
      .coa-paste-backdrop .coa-log-snippet{display:-webkit-box!important;min-width:0!important;font-size:.82rem!important;line-height:1.5!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;white-space:pre-wrap!important;overflow:hidden!important;overflow-wrap:anywhere!important;-webkit-line-clamp:3!important;-webkit-box-orient:vertical!important;}
      .coa-paste-backdrop .coa-log-time{font-family:var(--mono)!important;font-size:.61rem!important;color:var(--muted)!important;-webkit-text-fill-color:var(--muted)!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-check{width:17px!important;height:17px!important;margin:2px 0 0!important;accent-color:var(--fill)!important;pointer-events:none!important;}
      .coa-paste-backdrop .coa-log-loading{color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;font-family:var(--mono)!important;font-size:.72rem!important;}

      .coa-paste-backdrop .coa-log-preview-modal[hidden]{display:none!important;}
      .coa-paste-backdrop .coa-log-preview-modal{
        position:fixed!important;inset:0!important;z-index:20!important;display:grid!important;place-items:center!important;
        padding:18px!important;background:rgba(12,12,10,.66)!important;backdrop-filter:blur(2px)!important;
      }
      .coa-paste-backdrop .coa-log-preview-panel{
        width:min(960px,calc(100vw - 36px))!important;max-height:min(84vh,calc(100dvh - 36px))!important;
        display:grid!important;grid-template-rows:auto auto minmax(0,1fr) auto!important;overflow:hidden!important;
        background:var(--paper)!important;color:var(--ink)!important;border:2px solid var(--line)!important;border-radius:0!important;box-shadow:var(--shadow)!important;
      }
      .coa-paste-backdrop .coa-log-preview-meta-wrap{
        display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;align-items:center!important;
        padding:12px 16px!important;background:var(--strip)!important;border-bottom:1.5px solid var(--line)!important;
      }
      .coa-paste-backdrop .coa-log-preview-meta{min-width:0!important;font-family:var(--mono)!important;font-size:.68rem!important;font-weight:600!important;letter-spacing:.05em!important;color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-preview-counter{font-family:var(--mono)!important;font-size:.66rem!important;font-weight:700!important;color:var(--muted)!important;-webkit-text-fill-color:var(--muted)!important;white-space:nowrap!important;}
      .coa-paste-backdrop .coa-log-preview-body{
        min-height:0!important;overflow:auto!important;padding:16px!important;
        background:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px),var(--bg)!important;
        background-size:20px 20px,20px 20px,auto!important;
      }
      .coa-paste-backdrop .coa-log-preview-content{
        min-height:100%!important;padding:16px 18px!important;border:1.5px solid var(--line)!important;background:var(--paper)!important;
        color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-size:.88rem!important;line-height:1.78!important;
        white-space:pre-wrap!important;overflow-wrap:anywhere!important;word-break:break-word!important;user-select:text!important;-webkit-user-select:text!important;
      }
      .coa-paste-backdrop .coa-log-preview-foot{padding:12px 16px!important;background:var(--strip)!important;border-top:1.5px solid var(--line)!important;}
      .coa-paste-backdrop .coa-log-preview-foot .coa-actions{display:flex!important;gap:8px!important;justify-content:flex-end!important;flex-wrap:wrap!important;}
      .coa-paste-backdrop .coa-log-preview-foot .coa-mini-btn:disabled{opacity:.38!important;cursor:not-allowed!important;box-shadow:none!important;transform:none!important;}

      .coa-paste-backdrop .coa-log-import-foot{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:12px!important;align-items:end!important;padding:12px 16px!important;background:var(--strip)!important;border-top:1.5px solid var(--line)!important;border-radius:0!important;}
      .coa-paste-backdrop .coa-log-import-options{display:grid!important;grid-template-columns:minmax(250px,.9fr) minmax(280px,1.1fr)!important;gap:10px!important;align-items:end!important;padding:10px!important;border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;}
      .coa-paste-backdrop .coa-log-option-title{font-family:var(--mono)!important;font-size:.65rem!important;font-weight:600!important;letter-spacing:.08em!important;color:var(--sub)!important;-webkit-text-fill-color:var(--sub)!important;}
      .coa-paste-backdrop .coa-log-meta-grid input,
      .coa-paste-backdrop .coa-log-meta-grid select{border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;font-family:var(--sans)!important;}
      .coa-paste-backdrop .coa-log-meta-grid input::placeholder{color:var(--muted)!important;-webkit-text-fill-color:var(--muted)!important;opacity:1!important;}
      .coa-paste-backdrop .coa-archive-option-card{border:1.5px solid var(--line)!important;border-radius:0!important;background:var(--paper)!important;color:var(--ink)!important;-webkit-text-fill-color:var(--ink)!important;box-shadow:none!important;}
      .coa-paste-backdrop .coa-archive-option-card b,
      .coa-paste-backdrop .coa-archive-option-card small{color:inherit!important;-webkit-text-fill-color:currentColor!important;}
      .coa-paste-backdrop .coa-archive-option-card small{opacity:.68!important;}
      .coa-paste-backdrop .coa-archive-option:hover .coa-archive-option-card{background:var(--strip)!important;border-color:var(--line)!important;}
      .coa-paste-backdrop .coa-archive-option input:checked + .coa-archive-option-card{background:var(--fill)!important;color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;border-color:var(--line)!important;box-shadow:var(--shadow-soft)!important;}
      .coa-paste-backdrop .coa-archive-option input:checked + .coa-archive-option-card b,
      .coa-paste-backdrop .coa-archive-option input:checked + .coa-archive-option-card small{color:var(--fill-text)!important;-webkit-text-fill-color:var(--fill-text)!important;}
      .coa-paste-backdrop .coa-log-import-foot .coa-actions{display:flex!important;gap:7px!important;justify-content:flex-end!important;align-items:center!important;}

      .coa-paste-backdrop,.coa-html-preview-backdrop{position:fixed;inset:0;z-index:2147483350;display:flex;align-items:flex-start;justify-content:center;padding:18px;background:rgba(12,12,10,.55)!important;backdrop-filter:none!important;font-family:var(--sans);color:var(--ink);overflow:auto;}
      .coa-log-import-backdrop{padding:12px!important;background:var(--bg)!important;overflow:hidden!important;}
      .coa-paste-backdrop .coa-html-preview-modal{width:min(960px,100%);height:min(92vh,980px);display:flex;flex-direction:column;}
      .coa-paste-backdrop .coa-html-preview-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(150px,max-content) max-content;align-items:center;gap:10px 14px;padding:10px 16px;border-bottom:1.5px solid var(--line);background:var(--paper);}
      .coa-paste-backdrop .coa-html-control-item{display:grid!important;grid-template-columns:max-content minmax(100px,1fr);align-items:center;gap:8px;min-width:0;margin:0;font-family:var(--mono);font-size:.68rem;font-weight:600;color:var(--sub);white-space:nowrap;}
      .coa-paste-backdrop .coa-html-control-label{font-family:var(--mono);font-size:.68rem;font-weight:600;color:var(--sub);white-space:nowrap;}
      .coa-paste-backdrop .coa-html-control-item .coa-select{width:100%;min-width:0;max-width:none;}
      .coa-paste-backdrop .coa-html-font-size-control{display:grid;grid-template-columns:max-content auto;align-items:center;gap:8px;min-width:0;margin:0;font-family:var(--mono);font-size:.68rem;font-weight:600;color:var(--sub);white-space:nowrap;}
      .coa-paste-backdrop .coa-html-font-size-stepper{display:grid;grid-template-columns:32px 58px 32px;align-items:stretch;min-width:122px;height:38px;}
      .coa-paste-backdrop .coa-html-font-size-stepper .coa-btn{min-width:0;width:32px;height:38px;padding:0!important;border-width:1.5px!important;font-family:var(--mono)!important;font-size:15px!important;line-height:1!important;box-shadow:none!important;}
      .coa-paste-backdrop .coa-html-font-size-stepper .coa-btn:hover:not(:disabled){box-shadow:var(--shadow-soft)!important;transform:translate(-1px,-1px)!important;}
      .coa-paste-backdrop .coa-html-font-size-stepper .coa-btn:disabled{opacity:.35!important;cursor:not-allowed!important;box-shadow:none!important;transform:none!important;}
      .coa-paste-backdrop .coa-html-font-size-stepper output{display:flex;align-items:center;justify-content:center;height:38px;border-top:1.5px solid var(--line);border-bottom:1.5px solid var(--line);background:var(--strip);color:var(--ink);font-family:var(--mono);font-size:.68rem;font-weight:700;letter-spacing:.03em;cursor:pointer;user-select:none;}
      .coa-paste-backdrop .coa-html-replace-check{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;gap:6px!important;min-width:max-content;margin:0;white-space:nowrap;font-family:var(--mono);font-size:.68rem;font-weight:600;color:var(--sub);}
      .coa-paste-backdrop .coa-html-replace-check input{flex:0 0 auto;width:15px;height:15px;margin:0;}
      .coa-paste-backdrop .coa-html-replace-check span{font-family:var(--mono);font-size:.68rem;color:var(--sub);white-space:nowrap;}
      .coa-paste-backdrop .coa-html-meta-options{grid-column:1/-1;display:flex;align-items:center;gap:9px 15px;flex-wrap:wrap;padding-top:2px;font-family:var(--mono);font-size:.68rem;color:var(--sub);}
      .coa-paste-backdrop .coa-html-meta-title{font-weight:800;letter-spacing:.06em;color:var(--ink);}
      .coa-paste-backdrop .coa-html-meta-options .coa-check{display:inline-flex!important;gap:6px!important;margin:0;white-space:nowrap;font-family:var(--mono);font-size:.68rem;}
      .coa-paste-backdrop .coa-html-meta-options input{width:15px;height:15px;margin:0;}
      .coa-paste-backdrop .coa-html-control-note{grid-column:1/-1;font-family:var(--mono);font-size:.65rem;color:var(--muted);}
      .coa-paste-backdrop .coa-html-preview-body{flex:1;overflow:auto;padding:24px;background:var(--bg)!important;}
      .coa-paste-backdrop .coa-html-preview-canvas{max-width:860px;margin:0 auto;}

      .coa-dc-panel{width:min(1120px,100%);height:min(840px,calc(100vh - 88px));display:grid;grid-template-rows:auto 1fr auto;}
      .coa-dc-body{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 260px;background:var(--bg)!important;}
      .coa-dc-preview{width:100%;height:100%;border:0;background:#fff;}
      .coa-dc-options{min-height:0;overflow:auto;padding:16px;border-left:1.5px solid var(--line)!important;background:var(--paper)!important;color:var(--ink);display:flex;flex-direction:column;gap:12px;}
      .coa-dc-help,.coa-dc-note,.coa-dc-field-hint{color:var(--sub)!important;}
      .coa-dc-options .coa-field{min-width:0;}
      .coa-dc-choice-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:end;}
      .coa-dc-options .coa-select{display:block;width:100%;min-width:0;max-width:100%;height:40px;line-height:1.35;padding:8px 30px 8px 10px;font-family:var(--sans)!important;font-size:13px!important;letter-spacing:0!important;white-space:nowrap;text-overflow:ellipsis;}
      .coa-dc-options .coa-select option{font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;color:#161513;background:#fff;}
      .coa-dc-font-size-control{display:grid;grid-template-columns:max-content auto;align-items:center;gap:8px;min-width:0;font-family:var(--mono);font-size:.68rem;font-weight:600;color:var(--sub);white-space:nowrap;}
      .coa-dc-font-size-stepper{display:grid;grid-template-columns:32px 58px 32px;align-items:stretch;min-width:122px;height:38px;}
      .coa-dc-font-size-stepper .coa-btn{min-width:0;width:32px;height:38px;padding:0!important;border-width:1.5px!important;font-family:var(--mono)!important;font-size:15px!important;line-height:1!important;box-shadow:none!important;}
      .coa-dc-font-size-stepper .coa-btn:hover:not(:disabled){box-shadow:var(--shadow-soft)!important;transform:translate(-1px,-1px)!important;}
      .coa-dc-font-size-stepper .coa-btn:disabled{opacity:.35!important;cursor:not-allowed!important;box-shadow:none!important;transform:none!important;}
      .coa-dc-font-size-stepper output{display:flex;align-items:center;justify-content:center;height:38px;border-top:1.5px solid var(--line);border-bottom:1.5px solid var(--line);background:var(--strip);color:var(--ink);font-family:var(--mono);font-size:.68rem;font-weight:700;letter-spacing:.03em;cursor:pointer;user-select:none;}
      .coa-dc-field-hint{margin-top:6px;font-size:.68rem;line-height:1.45;}
      .coa-dc-note{margin:0;padding:0;border:0!important;border-radius:0!important;background:transparent!important;font-size:.72rem;line-height:1.6;}


      .coa-replace-panel{width:min(780px,100%);max-height:calc(100vh - 88px);display:grid;grid-template-rows:auto 1fr auto;background:var(--paper);color:var(--ink);border:2px solid var(--line);box-shadow:var(--shadow);overflow:hidden;}
      .coa-replace-body{padding:18px;overflow:auto;background:var(--paper);}
      .coa-replace-help{margin:0 0 14px;color:var(--sub);font-size:.78rem;line-height:1.65;}
      .coa-replace-list{display:flex;flex-direction:column;gap:9px;margin-bottom:12px;}
      .coa-replace-row{display:grid;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr) 38px;gap:8px;align-items:center;}
      .coa-replace-arrow{text-align:center;font-family:var(--mono);font-weight:600;color:var(--muted);}
      @media(max-width:660px){
        #coa-root.coa-overlay-root{padding:6px;}
        .coa-app-shell{width:min(100vw - 12px,1120px);height:calc(100vh - 12px);height:calc(100dvh - 12px);max-height:none;}
        .coa-app{padding:14px 12px 12px;}
        .coa-controls{gap:10px;}
        .coa-tabs{max-width:100%;overflow-x:auto;scrollbar-width:none;}
        .coa-tabs::-webkit-scrollbar{display:none;}
        .coa-search-cluster{flex:1 1 100%;flex-wrap:wrap;gap:8px;}
        .coa-search{flex:1 1 100%;min-width:0;}
        .coa-sort-group{margin-left:auto;}
        .coa-sort-prefix{display:inline-flex;}
        .coa-sort-select{min-width:112px;}
        .coa-viewer-close{top:9px;right:9px;width:28px;height:28px;}
        .coa-masthead{grid-template-columns:1fr;padding:24px 18px 20px;}
        .coa-mast-side{border-left:0;padding-left:0;flex-direction:row;align-items:center;justify-content:space-between;}
        .coa-card-viewport{padding-right:5px;margin-right:-5px;}
        .coa-card-progress-thumb{width:48px;}
        .coa-rack-progress{right:5px;top:40px;bottom:16px;width:13px;}
        .coa-rack-progress-thumb{height:48px;}
        .coa-gallery{grid-template-columns:1fr;}
        .coa-rk-panel{margin-bottom:-174px;}
        .coa-rk-body{height:226px;padding:15px 16px 0;}
        .coa-rk-body h2{font-size:1.05rem;}
        .coa-rk-watermark{font-size:3rem;}
        .coa-rack-viewport{padding:30px 10px 62px;height:100%;min-height:220px;}
        .coa-reader{padding:18px 8px;}
        .coa-reader-panel{max-height:calc(100vh - 36px);max-height:calc(100dvh - 36px);}
        .coa-reader-body{padding:20px 30px 28px 14px;}
        .coa-reader-progress{right:5px;top:14px;bottom:14px;width:13px;}
        .coa-reader-progress-thumb{height:48px;}
        .coa-form-grid,.coa-form-grid.three,.coa-archive-choice,.coa-log-meta-grid{grid-template-columns:1fr;}
        .coa-paste-backdrop .coa-html-preview-controls{grid-template-columns:1fr;}
        .coa-paste-backdrop .coa-html-control-item{grid-template-columns:82px minmax(0,1fr);}
        .coa-paste-backdrop .coa-html-control-item .coa-select{max-width:none;}
        .coa-paste-backdrop .coa-html-font-size-control{grid-template-columns:82px auto;justify-content:start;}
        .coa-paste-backdrop .coa-html-control-note{grid-column:auto;}
        .coa-paste-backdrop .coa-log-import-options{grid-template-columns:1fr!important;}
        .coa-paste-backdrop .coa-log-import-search{grid-template-columns:1fr!important;padding-top:9px!important;}
        .coa-paste-backdrop .coa-log-import-search-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;}
        .coa-paste-backdrop .coa-log-import-search .coa-mini-btn{min-width:0!important;padding:7px 4px!important;}
        .coa-paste-backdrop .coa-log-import-foot{grid-template-columns:1fr!important;}
        .coa-paste-backdrop .coa-log-row{grid-template-columns:24px 58px minmax(0,1fr)!important;}
        .coa-paste-backdrop .coa-log-main{padding-right:36px!important;}
        .coa-paste-backdrop .coa-log-time{display:none!important;}
        .coa-paste-backdrop .coa-log-preview-modal{padding:7px!important;}
        .coa-paste-backdrop .coa-log-preview-panel{width:calc(100vw - 14px)!important;max-height:calc(100dvh - 14px)!important;}
        .coa-paste-backdrop .coa-log-preview-meta-wrap{padding:10px 12px!important;}
        .coa-paste-backdrop .coa-log-preview-body{padding:10px!important;}
        .coa-paste-backdrop .coa-log-preview-content{padding:13px!important;font-size:.84rem!important;}
        .coa-paste-backdrop .coa-log-preview-foot .coa-actions{display:grid!important;grid-template-columns:1fr 1fr!important;}
        .coa-paste-backdrop .coa-log-import-foot .coa-actions{justify-content:stretch!important;}
        .coa-paste-backdrop .coa-log-import-foot .coa-actions .coa-mini-btn{flex:1!important;}
        .coa-dc-body{grid-template-columns:1fr;}
        .coa-dc-options{border-left:0!important;border-top:1.5px solid var(--line);}
        .coa-dc-choice-grid{grid-template-columns:1fr;}
      }
      @media(prefers-reduced-motion:reduce){#coa-root *{transition:none!important;} .coa-rack.enter .coa-rk-panel{animation:none!important;}}
    `;
    document.head.appendChild(style);
  }

  function getViewerRoot() {
    let root = document.querySelector(SELECTORS.root);
    if (!root) {
      root = document.createElement('div');
      root.id = 'coa-root';
      document.body.appendChild(root);
    }
    root.classList.add('coa-overlay-root');
    return root;
  }

  async function runViewerTask(task, context = '작업') {
    try {
      return await task();
    } catch (error) {
      console.error(`[COA:UI] ${context} failed:`, error);
      alert(`Crack Archive ${context} 실패: ${error?.message || error}`);
      return null;
    }
  }

  async function coaToggleFavorite(id) {
    const card = await coaLoadCard(id);
    if (!card) throw new Error('즐겨찾기를 바꿀 카드를 찾지 못했습니다.');
    const next = normalizeCard({ ...card, favorite: !card.favorite, updatedAt: card.updatedAt });
    const saved = await coaSaveCard(next);
    if (viewerState.readerId === saved.id) viewerState.readerCard = saved;
    if (viewerState.editCard?.id === saved.id) viewerState.editCard = saved;
    return saved;
  }

  function toggleViewerSelection(id) {
    const cleanId = normalizeText(id);
    if (!cleanId) return;
    if (viewerState.selectedIds.has(cleanId)) viewerState.selectedIds.delete(cleanId);
    else viewerState.selectedIds.add(cleanId);
  }

  function clearViewerSelection() {
    viewerState.selectedIds.clear();
  }

  function renderSelectionToolbar() {
    if (!viewerState.selectionMode) return '';
    const selectedCount = viewerState.selectedIds.size;
    const visible = Array.isArray(viewerState.visibleIds) ? viewerState.visibleIds : [];
    const allVisibleSelected = visible.length > 0 && visible.every((id) => viewerState.selectedIds.has(id));
    const disabled = selectedCount ? '' : ' disabled';
    return `<div class="coa-selection-bar" role="toolbar" aria-label="선택 카드 작업">
      <span class="coa-selection-count"><b>${selectedCount.toLocaleString()}</b> SELECTED</span>
      <button type="button" class="coa-btn sm" data-coa-action="select-visible">${allVisibleSelected ? '표시 선택 해제' : '표시 전체 선택'}</button>
      <button type="button" class="coa-btn sm" data-coa-action="bulk-tags"${disabled}>태그 편집</button>
      <button type="button" class="coa-btn sm" data-coa-action="export-selected"${disabled}>선택 백업</button>
      <button type="button" class="coa-btn sm danger" data-coa-action="delete-selected"${disabled}>선택 삭제</button>
      <button type="button" class="coa-btn sm" data-coa-action="clear-selection"${disabled}>선택 해제</button>
    </div>`;
  }

  function renderBulkTagModal() {
    if (!viewerState.bulkTagOpen) return '';
    return `<section class="coa-modal" role="dialog" aria-modal="true" aria-label="선택 카드 태그 편집">
      <form class="coa-bulk-tag-panel" data-coa-bulk-tag-form="1">
        <header class="coa-edit-head"><h2>선택 카드 태그 편집</h2><button type="button" class="coa-btn ghost" data-coa-action="close-bulk-tags">닫기</button></header>
        <div class="coa-bulk-tag-body">
          <p class="coa-bulk-tag-help">선택한 ${viewerState.selectedIds.size.toLocaleString()}개 카드에 같은 태그 변경을 적용합니다. 쉼표로 여러 개를 구분할 수 있습니다.</p>
          <div class="coa-field"><label>추가할 태그</label><input class="coa-input" name="addTags" placeholder="예: 핵심, 주요 사건"></div>
          <div class="coa-field"><label>제거할 태그</label><input class="coa-input" name="removeTags" placeholder="예: 임시, 미분류"></div>
        </div>
        <footer class="coa-edit-foot"><button type="button" class="coa-btn" data-coa-action="close-bulk-tags">취소</button><button type="submit" class="coa-btn primary">적용</button></footer>
      </form>
    </section>`;
  }

  async function coaApplyBulkTags(ids, addTags, removeTags) {
    const add = uniqueStrings(addTags);
    const removeSet = new Set(uniqueStrings(removeTags).map((tag) => tag.toLocaleLowerCase()));
    if (!add.length && !removeSet.size) return 0;
    const cards = [];
    for (const id of ids) {
      const card = await coaLoadCard(id);
      if (!card) continue;
      const kept = card.tags.filter((tag) => !removeSet.has(tag.toLocaleLowerCase()));
      const tags = uniqueStrings([...kept, ...add]);
      if (tags.join('\u0000') === card.tags.join('\u0000')) continue;
      cards.push(normalizeCard({ ...card, tags, updatedAt: nowMs() }));
    }
    if (!cards.length) return 0;
    await coaSaveCardsBatch(cards);
    if (viewerState.readerCard && cards.some((card) => card.id === viewerState.readerCard.id)) {
      viewerState.readerCard = cards.find((card) => card.id === viewerState.readerCard.id) || viewerState.readerCard;
    }
    return cards.length;
  }

  function renderArchiveTabs(index) {
    const counts = new Map([['', index.length], ['log', 0], ['ooc', 0]]);
    let favoriteCount = 0;
    for (const meta of index) {
      counts.set(meta.archiveType, (counts.get(meta.archiveType) || 0) + 1);
      if (meta.favorite) favoriteCount += 1;
    }
    const tabs = [
      { value: '', label: '전체' },
      { value: 'log', label: '로그' },
      { value: 'ooc', label: 'OOC' },
    ];
    const archiveTabs = tabs.map((tab) => {
      const active = (viewerState.filters.archiveType || '') === tab.value ? '1' : '0';
      return `<button type="button" class="coa-tab" data-coa-filter-archive="${escapeHTML(tab.value)}" data-active="${active}">${escapeHTML(tab.label)}<small>${counts.get(tab.value) || 0}</small></button>`;
    }).join('');
    return `${archiveTabs}<button type="button" class="coa-tab coa-favorite-tab" data-coa-filter-favorite="1" data-active="${viewerState.filters.favoriteOnly ? '1' : '0'}" title="즐겨찾기만 보기">★<small>${favoriteCount}</small></button>`;
  }
  function renderTagChips(items, selectedValues = []) {
    if (!items.length) return '<span class="coa-tag-empty">NO TAGS</span>';
    const selected = new Set(selectedValues.map((item) => item.toLocaleLowerCase()));
    return items.slice(0, 64).map(([value, count]) => {
      const active = selected.has(value.toLocaleLowerCase()) ? '1' : '0';
      return `<button type="button" class="coa-tag" data-coa-filter-tag="${escapeHTML(value)}" data-active="${active}" title="${escapeHTML(value)}">#${escapeHTML(value)}<b>${count}</b></button>`;
    }).join('');
  }
  function renderSidebar(index) {
    return renderTagChips(countValues(index, 'tags'), viewerState.filters.tags);
  }
  function renderGallery(metas, refMap = new Map()) {
    if (!metas.length) {
      return `<div class="coa-empty"><h2 style="margin:0 0 8px;font-size:18px;">카드가 안 보임</h2><p style="margin:0;">${hasActiveFilters() ? '검색어나 필터를 조금 풀어봐.' : '아직 저장된 카드가 없어. 상단의 ＋ 새 카드 또는 채팅에서 가져오기로 저장하면 여기 쌓임.'}</p></div>`;
    }
    return metas.map((meta) => {
      const isLog = meta.archiveType === 'log';
      const ref = refMap.get(meta.id) || `${isLog ? 'LOG' : 'OOC'}-000`;
      const tagText = meta.tags.slice(0, 4).map((tag) => `#${tag}`).join(' ');
      const selected = viewerState.selectionMode && viewerState.selectedIds.has(meta.id);
      const pressedAttr = viewerState.selectionMode ? ` aria-pressed="${selected ? 'true' : 'false'}"` : '';
      return `<article class="coa-card${selected ? ' selected' : ''}" role="button" tabindex="0" data-coa-card-id="${escapeHTML(meta.id)}"${pressedAttr}>
        <div class="coa-card-strip"><span class="coa-card-strip-left">${viewerState.selectionMode ? `<span class="coa-select-mark" aria-hidden="true">${selected ? '✓' : ''}</span>` : ''}<span class="coa-card-ref">${escapeHTML(ref)}</span></span><span class="coa-card-strip-actions"><button type="button" class="coa-card-star" data-coa-action="toggle-favorite" data-card-id="${escapeHTML(meta.id)}" aria-pressed="${meta.favorite ? 'true' : 'false'}" aria-label="${meta.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}" title="${meta.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${meta.favorite ? '★' : '☆'}</button><span class="coa-kind${isLog ? ' log' : ''}">${isLog ? '로그' : 'OOC'}</span></span></div>
        <div class="coa-card-body"><h3 class="coa-card-title">${escapeHTML(meta.title)}</h3><p class="coa-card-excerpt">${escapeHTML(meta.excerpt || '본문 미리보기가 없습니다.')}</p></div>
        <div class="coa-card-foot"><span class="coa-card-tags" title="${escapeHTML(tagText)}">${escapeHTML(tagText || '#미분류')}</span><time>${escapeHTML(formatDate(meta.createdAt))}</time></div>
      </article>`;
    }).join('');
  }

  function makeRackExpandedExcerpt(card, maxLength = 460) {
    const normalized = normalizeCard(card);
    return stripMarkdown(stripDCCommentSyntax(normalized.body || ''))
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, Math.max(120, Number(maxLength) || 460));
  }

  function cacheRackExpandedExcerpt(id, excerpt) {
    const cleanId = normalizeText(id);
    const cleanExcerpt = toStringValue(excerpt).trim();
    if (!cleanId || !cleanExcerpt) return;
    viewerState.rackPreviewCache.set(cleanId, cleanExcerpt);
    while (viewerState.rackPreviewCache.size > 32) {
      const oldest = viewerState.rackPreviewCache.keys().next().value;
      if (!oldest) break;
      viewerState.rackPreviewCache.delete(oldest);
    }
  }

  function renderRack(metas, refMap = new Map()) {
    if (!metas.length) return '<div class="coa-rack-empty">표시할 카드가 없습니다.</div>';
    return metas.map((meta, index) => {
      const isLog = meta.archiveType === 'log';
      const ref = refMap.get(meta.id) || `${isLog ? 'LOG' : 'OOC'}-000`;
      const tagText = meta.tags.slice(0, 5).map((tag) => `#${tag}`).join(' ');
      const isOpen = !viewerState.selectionMode && viewerState.rackOpenId === meta.id;
      const selected = viewerState.selectionMode && viewerState.selectedIds.has(meta.id);
      const expandedExcerpt = isOpen ? viewerState.rackPreviewCache.get(meta.id) : '';
      const leftAction = viewerState.selectionMode ? 'select' : 'close';
      const leftText = viewerState.selectionMode ? (selected ? '✓' : '□') : '×';
      return `<article class="coa-rk-panel${isOpen ? ' open' : ''}${selected ? ' selected' : ''}" style="--i:${index}" data-rk-card-id="${escapeHTML(meta.id)}">
        <div class="coa-rk-pane">
          <div class="coa-rk-titlebar">
            <button type="button" class="coa-rk-close" data-rk-action="${leftAction}" aria-label="${viewerState.selectionMode ? '선택 전환' : '선택 카드 닫기'}" title="${viewerState.selectionMode ? '선택 전환' : 'Close'}">${leftText}</button>
            <span class="coa-rk-title" data-rk-action="toggle">${escapeHTML(ref)} — ${escapeHTML(meta.title)}</span>
            <button type="button" class="coa-rk-star" data-rk-action="favorite" aria-pressed="${meta.favorite ? 'true' : 'false'}" aria-label="${meta.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}" title="${meta.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${meta.favorite ? '★' : '☆'}</button>
            <span class="coa-rk-kind${isLog ? ' log' : ''}">${isLog ? 'LOG' : 'OOC'}</span>
          </div>
          <div class="coa-rk-body" data-rk-action="body" tabindex="0" role="button" aria-expanded="${isOpen ? 'true' : 'false'}"${viewerState.selectionMode ? ` aria-pressed="${selected ? 'true' : 'false'}"` : ''}>
            <h2>${escapeHTML(meta.title)}</h2>
            <p class="coa-rk-meta">${escapeHTML(tagText || '#UNTAGGED')} · ${isLog ? 'LOG' : 'OOC'}</p>
            <p class="coa-rk-excerpt">${escapeHTML(expandedExcerpt || meta.excerpt || '본문 미리보기가 없습니다.')}</p>
            <span class="coa-rk-watermark">${escapeHTML(ref)}</span>
          </div>
          <footer class="coa-rk-foot"><span>${escapeHTML(tagText || '#UNTAGGED')}</span><span class="coa-rk-foot-side"><button type="button" class="coa-rk-open" data-rk-action="open">OPEN ▸</button><span>${escapeHTML(formatDate(meta.createdAt))}</span></span></footer>
        </div>
      </article>`;
    }).join('');
  }


  function bindRackEvents(root) {
    const rack = root.querySelector('.coa-rack');
    const viewport = rack?.querySelector('.coa-rack-viewport');
    const deck = rack?.querySelector('.coa-rack-deck');
    const progress = rack?.querySelector('[data-coa-rack-progress]');
    const progressTrack = rack?.querySelector('[data-coa-rack-progress-track]');
    const progressThumb = rack?.querySelector('[data-coa-rack-progress-thumb]');
    if (!rack || !viewport || !deck || rack.hidden) return;

    const panels = [...deck.querySelectorAll('.coa-rk-panel')];
    const useDepthEffects = panels.length <= 80;
    let scrollTarget = viewport.scrollTop;
    let scrollFrame = 0;
    let depthFrame = 0;
    let progressFrame = 0;
    let progressObserver = null;
    let dragPointerId = null;
    let dragStartY = 0;
    let dragStartScrollTop = 0;
    let dragMoved = false;
    let dragCaptureActive = false;
    let suppressClickUntil = 0;
    let setupFrame = 0;
    let enterTimer = 0;
    let previewRequestToken = 0;

    viewport.tabIndex = 0;

    const maxScrollTop = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const clampScroll = (value) => Math.max(0, Math.min(maxScrollTop(), Number(value) || 0));

    const syncRackProgress = () => {
      progressFrame = 0;
      if (!progress || !progressTrack || !progressThumb) return;
      const maxScroll = maxScrollTop();
      const overflow = maxScroll > 2;
      progress.hidden = !overflow;
      if (!overflow) {
        viewerState.rackScrollTop = 0;
        progressThumb.style.transform = 'translateY(0px)';
        return;
      }
      const current = clampScroll(viewport.scrollTop);
      viewerState.rackScrollTop = current;
      const maxTravel = Math.max(0, progressTrack.clientHeight - progressThumb.offsetHeight);
      const y = maxScroll > 0 ? (current / maxScroll) * maxTravel : 0;
      progressThumb.style.transform = `translateY(${y.toFixed(2)}px)`;
    };

    const queueRackProgressSync = () => {
      if (!progressFrame) progressFrame = requestAnimationFrame(syncRackProgress);
    };

    // 겹친 카드의 음수 margin 때문에 짧아질 수 있는 scrollHeight만 보정한다.
    // 마지막 카드를 화면 맨 위까지 밀어 올리는 인위적인 여분은 만들지 않고,
    // 마지막 카드 하단과 작은 마감 여백이 보이는 지점에서 스크롤이 끝나게 한다.
    const ensureRackScrollRange = () => {
      if (!panels.length) return;
      const last = panels[panels.length - 1];
      const measuredBottom = last.offsetTop + last.offsetHeight;
      const bottomGap = Math.max(24, Math.min(52, viewport.clientHeight * .08));
      const desiredBottom = Math.max(viewport.clientHeight - 2, measuredBottom + bottomGap);
      deck.style.minHeight = `${Math.ceil(desiredBottom)}px`;
      scrollTarget = clampScroll(Math.max(viewport.scrollTop, scrollTarget));
      queueRackProgressSync();
    };

    const syncRackDepth = () => {
      depthFrame = 0;
      const viewportRect = viewport.getBoundingClientRect();
      const focusY = viewportRect.top + Math.min(150, viewportRect.height * .26);
      const distanceRange = Math.max(240, viewportRect.height * .72);
      panels.forEach((panel) => {
        if (panel.classList.contains('open')) {
          panel.style.setProperty('--rk-scale', '1.012');
          panel.style.setProperty('--rk-shift', '0px');
          panel.style.opacity = '1';
          return;
        }
        const rect = panel.getBoundingClientRect();
        const distance = Math.min(1, Math.abs(rect.top - focusY) / distanceRange);
        const scale = 1 - distance * .018;
        const shift = Math.max(-3, Math.min(3, (focusY - rect.top) * .008));
        panel.style.setProperty('--rk-scale', scale.toFixed(4));
        panel.style.setProperty('--rk-shift', `${shift.toFixed(2)}px`);
        panel.style.opacity = String(1 - distance * .08);
      });
    };

    const queueDepthSync = () => {
      if (useDepthEffects && !depthFrame) depthFrame = requestAnimationFrame(syncRackDepth);
      queueRackProgressSync();
    };

    const stopScrollAnimation = () => {
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
      scrollTarget = viewport.scrollTop;
    };

    const animateScroll = () => {
      const current = viewport.scrollTop;
      const delta = scrollTarget - current;
      if (Math.abs(delta) < .45) {
        viewport.scrollTop = clampScroll(scrollTarget);
        scrollFrame = 0;
        queueDepthSync();
        return;
      }
      viewport.scrollTop = clampScroll(current + delta * .2);
      queueDepthSync();
      scrollFrame = requestAnimationFrame(animateScroll);
    };

    const scrollRackTo = (value) => {
      ensureRackScrollRange();
      scrollTarget = clampScroll(value);
      if (!scrollFrame) scrollFrame = requestAnimationFrame(animateScroll);
    };

    // 캡처 단계에서 이벤트를 받아 크랙 본문/외부 스크롤 핸들러보다 먼저 처리한다.
    viewport.addEventListener('wheel', (event) => {
      const dy = Number(event.deltaY) || 0;
      const dx = Number(event.deltaX) || 0;
      const rawDelta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (!rawDelta) return;
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      const delta = rawDelta * unit;
      ensureRackScrollRange();
      const base = scrollFrame ? scrollTarget : viewport.scrollTop;
      const next = clampScroll(base + delta * .9);
      if (next === viewport.scrollTop && !scrollFrame) return;
      event.preventDefault();
      event.stopPropagation();
      scrollRackTo(next);
    }, { passive: false, capture: true });

    viewport.addEventListener('scroll', () => {
      if (!scrollFrame && dragPointerId === null) scrollTarget = viewport.scrollTop;
      viewerState.rackScrollTop = viewport.scrollTop;
      queueDepthSync();
      queueRackProgressSync();
    }, { passive: true });

    // 마우스로 카드/빈 공간을 잡아 끌 수는 있지만, 단순 클릭 때는 포인터를 캡처하지 않는다.
    // pointerdown 즉시 setPointerCapture를 호출하면 Chromium에서 후속 click 대상이 카드가 아니라
    // viewport로 바뀌어 첫 클릭/두 번째 클릭이 사라질 수 있다. 실제 드래그가 시작된 뒤에만 캡처한다.
    viewport.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target.closest('button,select,input,textarea,a')) return;
      stopScrollAnimation();
      dragPointerId = event.pointerId;
      dragStartY = event.clientY;
      dragStartScrollTop = viewport.scrollTop;
      dragMoved = false;
      dragCaptureActive = false;
    });

    viewport.addEventListener('pointermove', (event) => {
      if (dragPointerId !== event.pointerId) return;
      const delta = event.clientY - dragStartY;
      if (!dragMoved && Math.abs(delta) > 7) {
        dragMoved = true;
        viewport.classList.add('coa-rack-dragging');
        try {
          viewport.setPointerCapture(event.pointerId);
          dragCaptureActive = true;
        } catch (_) {}
      }
      if (!dragMoved) return;
      event.preventDefault();
      viewport.scrollTop = clampScroll(dragStartScrollTop - delta);
      scrollTarget = viewport.scrollTop;
      queueDepthSync();
    }, { passive: false });

    const finishPointerDrag = (event) => {
      if (dragPointerId !== event.pointerId) return;
      if (dragMoved) suppressClickUntil = performance.now() + 280;
      if (dragCaptureActive) {
        try {
          if (!viewport.hasPointerCapture || viewport.hasPointerCapture(event.pointerId)) {
            viewport.releasePointerCapture(event.pointerId);
          }
        } catch (_) {}
      }
      dragPointerId = null;
      dragMoved = false;
      dragCaptureActive = false;
      viewport.classList.remove('coa-rack-dragging');
      scrollTarget = viewport.scrollTop;
    };
    viewport.addEventListener('pointerup', finishPointerDrag);
    viewport.addEventListener('pointercancel', finishPointerDrag);

    viewport.addEventListener('keydown', (event) => {
      const step = Math.max(72, viewport.clientHeight * .22);
      let next = null;
      if (event.key === 'ArrowDown') next = viewport.scrollTop + step;
      else if (event.key === 'ArrowUp') next = viewport.scrollTop - step;
      else if (event.key === 'PageDown') next = viewport.scrollTop + viewport.clientHeight * .82;
      else if (event.key === 'PageUp') next = viewport.scrollTop - viewport.clientHeight * .82;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = maxScrollTop();
      if (next === null) return;
      event.preventDefault();
      scrollRackTo(next);
    });

    const closeAllExcept = (keep = null) => {
      deck.querySelectorAll('.coa-rk-panel.open').forEach((panel) => {
        if (panel === keep) return;
        panel.classList.remove('open');
        panel.querySelector('.coa-rk-body')?.setAttribute('aria-expanded', 'false');
        panel.style.opacity = '';
      });
    };

    const focusPanel = (panel) => {
      const top = panel.offsetTop - Math.max(24, viewport.clientHeight * .08);
      scrollRackTo(top);
    };

    const hydrateOpenPanelPreview = async (panel) => {
      if (!panel || panel.dataset.rkPreviewState === 'ready' || panel.dataset.rkPreviewState === 'loading') return;
      const id = panel.getAttribute('data-rk-card-id') || '';
      if (!id) return;
      const excerpt = panel.querySelector('.coa-rk-excerpt');
      const cachedExcerpt = viewerState.rackPreviewCache.get(id) || '';
      if (cachedExcerpt) {
        if (excerpt) excerpt.textContent = cachedExcerpt;
        panel.dataset.rkPreviewState = 'ready';
        return;
      }
      const requestToken = ++previewRequestToken;
      panel.dataset.rkPreviewState = 'loading';
      try {
        const card = await coaLoadCard(id);
        if (requestToken !== previewRequestToken || !card || !panel.isConnected
          || viewerState.rackOpenId !== id || !panel.classList.contains('open')) {
          if (panel.isConnected && panel.dataset.rkPreviewState === 'loading') panel.dataset.rkPreviewState = '';
          return;
        }
        const expandedExcerpt = makeRackExpandedExcerpt(card);
        if (expandedExcerpt) {
          cacheRackExpandedExcerpt(id, expandedExcerpt);
          if (excerpt) excerpt.textContent = expandedExcerpt;
        }
        panel.dataset.rkPreviewState = 'ready';
      } catch (error) {
        if (requestToken === previewRequestToken) console.warn('[COA:STACK] preview load failed:', error);
        if (panel.isConnected) panel.dataset.rkPreviewState = '';
      }
    };

    const openPanel = async (panel) => {
      closeAllExcept(panel);
      panel.classList.add('open');
      viewerState.rackOpenId = panel.getAttribute('data-rk-card-id') || '';
      panel.querySelector('.coa-rk-body')?.setAttribute('aria-expanded', 'true');
      panel.style.opacity = '1';
      ensureRackScrollRange();
      focusPanel(panel);
      queueDepthSync();
      await hydrateOpenPanelPreview(panel);
      ensureRackScrollRange();
      queueDepthSync();
    };

    const closePanel = (panel) => {
      previewRequestToken += 1;
      panel.classList.remove('open');
      panel.querySelector('.coa-rk-body')?.setAttribute('aria-expanded', 'false');
      panel.style.opacity = '';
      if (viewerState.rackOpenId === panel.getAttribute('data-rk-card-id')) viewerState.rackOpenId = '';
      ensureRackScrollRange();
      queueDepthSync();
    };

    // X뿐 아니라 랙 안의 빈 공간을 눌러도 현재 펼친 카드를 접는다.
    // 다른 카드를 누르면 현재 선택만 해제하고, 새 카드는 다음 클릭에서 펼친다.
    viewport.addEventListener('click', (event) => {
      if (viewerState.selectionMode || performance.now() < suppressClickUntil) return;
      if (event.target.closest('.coa-rk-panel')) return;
      const active = deck.querySelector('.coa-rk-panel.open');
      if (!active) return;
      event.preventDefault();
      event.stopPropagation();
      closePanel(active);
    });

    deck.addEventListener('click', async (event) => {
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const panel = event.target.closest('.coa-rk-panel');
      if (!panel) return;
      const actionEl = event.target.closest('[data-rk-action]');
      const action = actionEl?.getAttribute('data-rk-action') || '';
      const id = panel.getAttribute('data-rk-card-id') || '';

      if (action === 'favorite') {
        event.preventDefault();
        event.stopPropagation();
        await runViewerTask(async () => {
          await coaToggleFavorite(id);
          await coaRenderViewer();
        }, 'STACK 즐겨찾기');
        return;
      }

      if (viewerState.selectionMode || action === 'select') {
        event.preventDefault();
        event.stopPropagation();
        await runViewerTask(async () => {
          toggleViewerSelection(id);
          await coaRenderViewer();
        }, 'STACK 카드 선택');
        return;
      }

      if (action === 'close') {
        event.preventDefault();
        event.stopPropagation();
        closePanel(panel);
        return;
      }

      if (action === 'open') {
        event.preventDefault();
        event.stopPropagation();
        const active = deck.querySelector('.coa-rk-panel.open');
        if (active && active !== panel) closePanel(active);
        await runViewerTask(() => coaOpenReader(id), 'STACK 카드 열기');
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const active = deck.querySelector('.coa-rk-panel.open');
      if (active && active !== panel) {
        closePanel(active);
        return;
      }
      if (panel.classList.contains('open')) {
        closePanel(panel);
        return;
      }
      await runViewerTask(() => openPanel(panel), 'STACK 카드 미리보기');
    });

    deck.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const body = event.target.closest('.coa-rk-body');
      if (!body) return;
      event.preventDefault();
      const panel = body.closest('.coa-rk-panel');
      if (!panel) return;
      const id = panel.getAttribute('data-rk-card-id') || '';
      if (viewerState.selectionMode) {
        await runViewerTask(async () => {
          toggleViewerSelection(id);
          await coaRenderViewer();
        }, 'STACK 카드 선택');
      } else {
        const active = deck.querySelector('.coa-rk-panel.open');
        if (active && active !== panel) closePanel(active);
        else if (panel.classList.contains('open')) closePanel(panel);
        else await runViewerTask(() => openPanel(panel), 'STACK 카드 미리보기');
      }
    });

    if (typeof ResizeObserver === 'function' && progress && progressTrack && progressThumb) {
      progressObserver = new ResizeObserver(() => {
        ensureRackScrollRange();
        queueRackProgressSync();
      });
      progressObserver.observe(rack);
      progressObserver.observe(viewport);
      progressObserver.observe(deck);
      progressObserver.observe(progressTrack);
    }

    setupFrame = requestAnimationFrame(() => {
      ensureRackScrollRange();
      const active = viewerState.rackOpenId ? panels.find((panel) => panel.getAttribute('data-rk-card-id') === viewerState.rackOpenId) : null;
      if (active) {
        focusPanel(active);
        void hydrateOpenPanelPreview(active).then(() => {
          if (!active.isConnected || !active.classList.contains('open')) return;
          ensureRackScrollRange();
          queueDepthSync();
        });
      } else {
        const restored = clampScroll(Number(viewerState.rackScrollTop) || 0);
        viewport.scrollTop = restored;
        scrollTarget = restored;
      }
      if (useDepthEffects) syncRackDepth();
      syncRackProgress();
    });

    if (viewerState.rackAnimate) {
      rack.classList.add('enter');
      const duration = Math.min(3200, panels.length * 42 + 720);
      enterTimer = window.setTimeout(() => {
        rack.classList.remove('enter');
        viewerState.rackAnimate = false;
        ensureRackScrollRange();
        queueDepthSync();
      }, duration);
    }

    viewerState.rackCleanup = () => {
      previewRequestToken += 1;
      viewerState.rackScrollTop = viewport.scrollTop;
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
      if (depthFrame) cancelAnimationFrame(depthFrame);
      if (progressFrame) cancelAnimationFrame(progressFrame);
      if (setupFrame) cancelAnimationFrame(setupFrame);
      if (enterTimer) clearTimeout(enterTimer);
      progressObserver?.disconnect();
      viewport.classList.remove('coa-rack-dragging');
    };
  }

  function coaRenderReaderBody(card) {
    const normalized = normalizeCard(card);
    if (normalized.archiveType === 'log') return renderViewerLogBody(normalized);
    return `<div class="coa-ooc-view coa-reader-content coa-md">${prepareViewerContentHTML(coaRenderCardBody(normalized) || '<p>본문 없음</p>')}</div>`;
  }
  function renderReader(card, refMap = new Map()) {
    if (!card) return '';
    const ref = refMap.get(card.id) || `${card.archiveType === 'log' ? 'LOG' : 'OOC'}-000`;
    const tagText = card.tags.slice(0, 8).map((tag) => `#${tag}`).join(' ');
    const bodyHTML = coaRenderReaderBody(card);
    return `<section class="coa-reader" role="dialog" aria-modal="true" aria-label="카드 읽기">
      <article class="coa-reader-panel">
        <div class="coa-reader-strip"><span class="coa-reader-strip-ref">${escapeHTML(ref)}</span><span class="coa-reader-strip-spacer"></span><span class="coa-reader-strip-date">${escapeHTML(formatDate(card.createdAt, true))}</span></div>
        <header class="coa-reader-top">
          <div class="coa-reader-title"><h2>${escapeHTML(card.title)}</h2><p>${escapeHTML(ARCHIVE_LABELS[card.archiveType] || card.archiveType || 'OOC')} · ${escapeHTML(tagText || '#미분류')}</p></div>
          <div class="coa-reader-actions">
            <button type="button" class="coa-btn sm" data-coa-action="toggle-favorite" data-card-id="${escapeHTML(card.id)}" aria-pressed="${card.favorite ? 'true' : 'false'}" aria-label="${card.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${card.favorite ? '★ 고정됨' : '☆ 즐겨찾기'}</button>
            <button type="button" class="coa-btn sm" data-coa-action="edit-card" data-card-id="${escapeHTML(card.id)}">수정</button>
            <span class="coa-menu-wrap"><button type="button" class="coa-btn sm fill" data-coa-menu-toggle="reader-export">내보내기 ▾</button><span class="coa-menu-pop" data-coa-menu="reader-export" data-open="0">
              <button type="button" data-coa-action="open-html" data-card-id="${escapeHTML(card.id)}">HTML 미리보기</button>
              <button type="button" data-coa-action="open-dc" data-card-id="${escapeHTML(card.id)}">DC HTML 보기 / 복사</button>
              <button type="button" data-coa-action="copy-md" data-card-id="${escapeHTML(card.id)}">원문 복사</button>
            </span></span>
            <span class="coa-menu-wrap"><button type="button" class="coa-btn sm" data-coa-menu-toggle="reader-etc">⋯</button><span class="coa-menu-pop" data-coa-menu="reader-etc" data-open="0"><button type="button" data-coa-action="delete-card" data-card-id="${escapeHTML(card.id)}">삭제</button></span></span>
            <button type="button" class="coa-btn sm" data-coa-action="close-reader">닫기</button>
          </div>
        </header>
        <div class="coa-reader-scroll-shell"><div class="coa-reader-body" data-coa-reader-scroll>${bodyHTML || '<p>본문 없음</p>'}</div><div class="coa-reader-progress" data-coa-reader-progress hidden aria-hidden="true"><span class="coa-reader-progress-track" data-coa-reader-progress-track><span class="coa-reader-progress-thumb" data-coa-reader-progress-thumb></span></span></div></div>
      </article>
    </section>`;
  }

  function renderEditModal(card) {
    if (!card) return '';
    const archiveOptions = getArchiveOptionsHTML(card.archiveType || 'ooc');
    return `
      <section class="coa-modal" role="dialog" aria-modal="true" aria-label="카드 수정">
        <form class="coa-edit-panel" data-coa-edit-form="1">
          <header class="coa-edit-head">
            <h2>카드 수정</h2>
            <button type="button" class="coa-btn ghost" data-coa-action="close-edit">닫기</button>
          </header>
          <div class="coa-edit-form">
            <div class="coa-form-grid">
              <div class="coa-field">
                <label>제목</label>
                <input class="coa-input" name="title" value="${escapeHTML(card.title)}" required>
              </div>
              <div class="coa-field">
                <label>저장함</label>
                <select class="coa-select" name="archiveType">${archiveOptions}</select>
              </div>
            </div>
            <div class="coa-field">
              <label>태그</label>
              <input class="coa-input" name="tags" value="${escapeHTML(card.tags.join(', '))}" placeholder="쉼표로 구분">
            </div>
            ${card.archiveType === 'ooc' ? `<div class="coa-form-grid"><div class="coa-field"><label>HTML · PNG 테마</label><select class="coa-select" name="oocHtmlLayout">${getOOCHTMLLayoutOptionsHTML(card.view?.htmlLayout)}</select></div></div>` : ''}
            ${card.archiveType === 'log' ? `<div class="coa-form-grid">
              <div class="coa-field">
                <label>HTML · PNG 테마</label>
                <select class="coa-select" name="htmlLayout">${getLogHTMLLayoutOptionsHTML(card.view?.htmlLayout)}</select>
              </div>
              <div class="coa-field">
                <label>HTML · PNG 폰트</label>
                <select class="coa-select" name="fontFamily">${getCOAFontOptionsHTML(card.view?.fontFamily)}</select>
              </div>
            </div>` : ''}
            <div class="coa-field">
              <label>본문 원문</label>
              <textarea class="coa-textarea" name="body">${escapeHTML(card.body || '')}</textarea>
            </div>
          </div>
          <footer class="coa-edit-foot">
            <button type="button" class="coa-btn" data-coa-action="close-edit">취소</button>
            <button type="submit" class="coa-btn primary">저장</button>
          </footer>
        </form>
      </section>
    `;
  }
  function cleanupViewerTransientBindings(options = {}) {
    if (viewerState.tagResizeObserver) {
      try { viewerState.tagResizeObserver.disconnect(); } catch (_) {}
      viewerState.tagResizeObserver = null;
    }
    if (typeof viewerState.cardScrollCleanup === 'function') {
      try { viewerState.cardScrollCleanup(); } catch (_) {}
      viewerState.cardScrollCleanup = null;
    }
    if (typeof viewerState.readerScrollCleanup === 'function') {
      try { viewerState.readerScrollCleanup(); } catch (_) {}
      viewerState.readerScrollCleanup = null;
    }
    if (typeof viewerState.rackCleanup === 'function') {
      try { viewerState.rackCleanup(); } catch (_) {}
      viewerState.rackCleanup = null;
    }
    if (options.clearSearchTimer && viewerState.searchTimer) {
      clearTimeout(viewerState.searchTimer);
      viewerState.searchTimer = null;
    }
  }

  function bindViewerRootEvents(root) {
    if (!root || root.dataset.coaRootEventsBound === '1') return;
    root.dataset.coaRootEventsBound = '1';
    root.addEventListener('click', (event) => {
      root.querySelectorAll('[data-coa-menu]').forEach((menu) => { menu.dataset.open = '0'; });
      if (event.target === root) coaCloseViewer();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const transientModal = root.querySelector('.coa-dc-modal,.coa-replace-modal');
      if (transientModal) {
        transientModal.remove();
        return;
      }
      if (viewerState.bulkTagOpen) viewerState.bulkTagOpen = false;
      else if (viewerState.editCard) viewerState.editCard = null;
      else if (viewerState.readerId) {
        viewerState.readerId = null;
        viewerState.readerCard = null;
      } else {
        coaCloseViewer();
        return;
      }
      void runViewerTask(() => coaRenderViewer(), '화면 닫기');
    });
  }

  async function coaRenderViewer() {
    const renderToken = ++viewerState.renderToken;
    const isCurrentRender = () => renderToken === viewerState.renderToken;
    cleanupViewerTransientBindings();
    const root = getViewerRoot();
    viewerState.root = root;
    bindViewerRootEvents(root);
    ensureViewerStyle();
    if (!viewerState.themeLoaded) {
      const settings = await coaLoadSettings();
      if (!isCurrentRender()) return;
      viewerState.theme = 'auto';
      viewerState.viewMode = normalizeViewerViewMode(settings.viewMode);
      viewerState.sortBy = normalizeViewerSortBy(settings.sortBy);
      viewerState.sortDirection = normalizeViewerSortDirection(settings.sortDirection);
      viewerState.themeLoaded = true;
    }
    applyViewerThemeToElement(root);
    root.dataset.open = viewerState.open ? '1' : '0';
    if (!viewerState.open) return;

    const allIndex = await coaLoadIndex();
    if (!isCurrentRender() || !viewerState.open) return;
    const queried = await coaQuery({ text: viewerState.filters.text, archiveType: viewerState.filters.archiveType, tags: viewerState.filters.tags, favoriteOnly: viewerState.filters.favoriteOnly }, allIndex);
    if (!isCurrentRender() || !viewerState.open) return;
    const sortBy = normalizeViewerSortBy(viewerState.sortBy);
    const sortDirection = normalizeViewerSortDirection(viewerState.sortDirection);
    const metas = sortMetas(queried, sortBy, sortDirection);
    viewerState.visibleIds = metas.map((meta) => meta.id);
    const refMap = buildCardRefMap(allIndex);
    const searchText = viewerState.filters.text || '';
    const sortArrow = sortDirection === 'down' ? '↓' : '↑';
    const sortDirectionLabel = getViewerSortDirectionLabel(sortBy, sortDirection);
    const viewMode = normalizeViewerViewMode(viewerState.viewMode);
    const viewModeLabel = viewMode === 'stack' ? 'CARD' : 'STACK';
    // 보이지 않는 다른 보기까지 같은 카드 수만큼 DOM을 만들지 않는다.
    // 보기 전환 시 전체 렌더가 이미 다시 실행되므로 현재 모드만 생성하면 충분하다.
    const galleryHTML = viewMode === 'card' ? renderGallery(metas, refMap) : '';
    const rackHTML = viewMode === 'stack' ? renderRack(metas, refMap) : '';

    root.innerHTML = `<section class="coa-app-shell" data-view-mode="${escapeHTML(viewMode)}" role="dialog" aria-modal="true" aria-label="Crack Archive">
      <button type="button" class="coa-viewer-close" data-coa-action="close-viewer" aria-label="보관함 닫기">×</button>
      <div class="coa-app">
      <header class="coa-masthead">
        <span class="coa-masthead-ref">REF: CA-2026</span>
        <div>
          <h1>Crack—<br>Archive</h1>
          <p class="coa-masthead-tagline">Roleplay log &amp; OOC storage unit</p>
          <div class="coa-mast-actions">
            <button type="button" class="coa-btn fill" data-coa-action="new-card">＋ 새 카드</button>
            <button type="button" class="coa-btn" data-coa-action="import-chat-log">채팅에서 가져오기</button>
            <button type="button" class="coa-btn${viewerState.selectionMode ? ' fill' : ''}" data-coa-action="toggle-selection-mode">${viewerState.selectionMode ? '선택 종료' : '선택'}</button>
            <span class="coa-menu-wrap"><button type="button" class="coa-btn" data-coa-menu-toggle="mast-menu">⋯</button><span class="coa-menu-pop" data-coa-menu="mast-menu" data-open="0">
              <button type="button" data-coa-action="export-json">백업 저장</button>
              <button type="button" data-coa-action="import-json">백업 불러오기</button>
              <button type="button" data-coa-action="open-replacements">단어 치환 설정</button>
            </span></span>
          </div>
        </div>
        <div class="coa-mast-side">
          <div>${renderViewerBarcode()}<p class="coa-barcode-code">${allIndex.length} CARDS · V${escapeHTML(COA_VERSION)}</p></div>
          <button type="button" class="coa-view-toggle" data-coa-action="toggle-view-mode" title="Switch to ${escapeHTML(viewModeLabel)} view"><span class="coa-view-toggle-sw"></span><span>${escapeHTML(viewModeLabel)}</span></button>
        </div>
      </header>
      <div class="coa-controls">
        <div class="coa-tabs" role="tablist">${renderArchiveTabs(allIndex)}</div>
        <div class="coa-search-cluster">
          <label class="coa-search"><span class="coa-search-prefix">Q:</span><input type="search" data-coa-action="search" value="${escapeHTML(searchText)}" placeholder="제목 · 내용 · 태그 검색"></label>
          <div class="coa-sort-group" title="${escapeHTML(sortDirectionLabel)}">
            <span class="coa-sort-prefix">정렬:</span>
            <select class="coa-sort-select" data-coa-sort-by aria-label="정렬 기준">${renderViewerSortOptions(sortBy)}</select>
            <button type="button" class="coa-sort-direction" data-coa-action="toggle-sort-direction" aria-label="정렬 방향: ${escapeHTML(sortDirectionLabel)}" title="${escapeHTML(sortDirectionLabel)}">${sortArrow}</button>
          </div>
        </div>
      </div>
      ${renderSelectionToolbar()}
      <div class="coa-tag-strip" data-coa-tag-strip data-overflow="0">
        <button type="button" class="coa-tag-scroll" data-coa-tag-scroll-dir="prev" aria-label="태그 목록 왼쪽으로 이동" title="태그 왼쪽">◀</button>
        <div class="coa-tag-row" data-coa-tag-scroll>${renderSidebar(allIndex)}</div>
        <button type="button" class="coa-tag-scroll" data-coa-tag-scroll-dir="next" aria-label="태그 목록 오른쪽으로 이동" title="태그 오른쪽">▶</button>
      </div>
      <section class="coa-card-viewport" data-coa-card-scroll aria-label="Crack Archive card list"${viewMode === 'stack' ? ' hidden' : ''}>
        <section class="coa-gallery" aria-label="Crack Archive cards">${galleryHTML}</section>
      </section>
      <div class="coa-card-progress" data-coa-card-progress hidden aria-hidden="true"><span class="coa-card-progress-track" data-coa-card-progress-track><span class="coa-card-progress-thumb" data-coa-card-progress-thumb></span></span></div>
      <section class="coa-rack${viewerState.rackAnimate && viewMode === 'stack' ? ' enter' : ''}" aria-label="Crack Archive stacked folders"${viewMode === 'stack' ? '' : ' hidden'}>
        <span class="coa-rack-label">ARCHIVE RACK · WHEEL / SWIPE</span>
        <div class="coa-rack-viewport"><div class="coa-rack-deck">${rackHTML}</div></div>
        <div class="coa-rack-progress" data-coa-rack-progress hidden aria-hidden="true"><span class="coa-rack-progress-track" data-coa-rack-progress-track><span class="coa-rack-progress-thumb" data-coa-rack-progress-thumb></span></span></div>
      </section>
    </div>
    </section>
    ${renderReader(viewerState.readerCard, refMap)}
    ${renderEditModal(viewerState.editCard)}
    ${renderBulkTagModal()}`;

    bindViewerEvents(root);
    if (viewerState.lastSearchFocus) {
      const input = root.querySelector('[data-coa-action="search"]');
      if (input) { input.focus(); const end = input.value.length; input.setSelectionRange(end, end); }
      viewerState.lastSearchFocus = false;
    }
  }

  function bindViewerTagScroller(root) {
    const strip = root.querySelector('[data-coa-tag-strip]');
    const track = strip?.querySelector('[data-coa-tag-scroll]');
    const prev = strip?.querySelector('[data-coa-tag-scroll-dir="prev"]');
    const next = strip?.querySelector('[data-coa-tag-scroll-dir="next"]');
    if (!strip || !track || !prev || !next) return;

    let updateFrame = 0;
    const maxScrollLeft = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const update = () => {
      cancelAnimationFrame(updateFrame);
      updateFrame = requestAnimationFrame(() => {
        const max = maxScrollLeft();
        const overflow = max > 2;
        strip.dataset.overflow = overflow ? '1' : '0';
        if (!overflow) {
          track.scrollLeft = 0;
          viewerState.tagScrollLeft = 0;
        }
        const current = Math.max(0, Math.min(track.scrollLeft, max));
        prev.disabled = !overflow || current <= 1;
        next.disabled = !overflow || current >= max - 1;
      });
    };
    const scrollByPage = (direction) => {
      const amount = Math.max(150, Math.round(track.clientWidth * .72));
      track.scrollBy({ left: direction * amount, behavior: 'smooth' });
      window.setTimeout(update, 260);
    };

    prev.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollByPage(-1);
    });
    next.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollByPage(1);
    });
    track.addEventListener('scroll', () => {
      viewerState.tagScrollLeft = track.scrollLeft;
      update();
    }, { passive: true });

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    viewerState.tagResizeObserver = observer;
    observer?.observe(strip);
    observer?.observe(track);

    requestAnimationFrame(() => {
      const max = maxScrollLeft();
      track.scrollLeft = Math.max(0, Math.min(Number(viewerState.tagScrollLeft) || 0, max));
      update();
    });
  }

  function bindViewerCardScroller(root) {
    const viewport = root.querySelector('[data-coa-card-scroll]');
    const progress = root.querySelector('[data-coa-card-progress]');
    const track = root.querySelector('[data-coa-card-progress-track]');
    const thumb = root.querySelector('[data-coa-card-progress-thumb]');
    const gallery = viewport?.querySelector('.coa-gallery');
    if (!viewport || viewport.hidden || !progress || !track || !thumb || !gallery) return;

    let frame = 0;
    let observer = null;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const overflow = maxScroll > 2;
        progress.hidden = !overflow;
        if (!overflow) {
          viewport.scrollTop = 0;
          viewerState.cardScrollTop = 0;
          thumb.style.transform = 'translateX(0px)';
          return;
        }
        const current = Math.max(0, Math.min(viewport.scrollTop, maxScroll));
        viewerState.cardScrollTop = current;
        const maxTravel = Math.max(0, track.clientWidth - thumb.offsetWidth);
        const x = maxScroll > 0 ? (current / maxScroll) * maxTravel : 0;
        thumb.style.transform = `translateX(${x.toFixed(2)}px)`;
      });
    };

    viewport.addEventListener('scroll', update, { passive: true });
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(update);
      observer.observe(viewport);
      observer.observe(gallery);
      observer.observe(track);
    }

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = Math.max(0, Math.min(Number(viewerState.cardScrollTop) || 0, maxScroll));
      update();
    });

    viewerState.cardScrollCleanup = () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport.removeEventListener('scroll', update);
    };
  }

  function bindViewerReaderScroller(root) {
    const viewport = root.querySelector('[data-coa-reader-scroll]');
    const progress = root.querySelector('[data-coa-reader-progress]');
    const track = root.querySelector('[data-coa-reader-progress-track]');
    const thumb = root.querySelector('[data-coa-reader-progress-thumb]');
    if (!viewport || !progress || !track || !thumb) return;

    let frame = 0;
    let observer = null;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const overflow = maxScroll > 2;
        progress.hidden = !overflow;
        if (!overflow) {
          viewport.scrollTop = 0;
          viewerState.readerScrollTop = 0;
          thumb.style.transform = 'translateY(0px)';
          return;
        }
        const current = Math.max(0, Math.min(viewport.scrollTop, maxScroll));
        viewerState.readerScrollTop = current;
        const maxTravel = Math.max(0, track.clientHeight - thumb.offsetHeight);
        const y = maxScroll > 0 ? (current / maxScroll) * maxTravel : 0;
        thumb.style.transform = `translateY(${y.toFixed(2)}px)`;
      });
    };

    viewport.addEventListener('scroll', update, { passive: true });
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(update);
      observer.observe(viewport);
      observer.observe(track);
      const content = viewport.firstElementChild;
      if (content) observer.observe(content);
    }

    requestAnimationFrame(() => {
      const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = Math.max(0, Math.min(Number(viewerState.readerScrollTop) || 0, maxScroll));
      update();
    });

    viewerState.readerScrollCleanup = () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport.removeEventListener('scroll', update);
    };
  }

  function bindViewerEvents(root) {
    const closeMenus = (except = null) => root.querySelectorAll('[data-coa-menu]').forEach((menu) => {
      if (menu !== except) menu.dataset.open = '0';
    });
    root.querySelectorAll('[data-coa-menu-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const menu = root.querySelector(`[data-coa-menu="${button.getAttribute('data-coa-menu-toggle') || ''}"]`);
        if (!menu) return;
        const willOpen = menu.dataset.open !== '1';
        closeMenus(menu);
        menu.dataset.open = willOpen ? '1' : '0';
      });
    });
    const readerOverlay = root.querySelector('.coa-reader');
    readerOverlay?.addEventListener('click', async (event) => {
      if (event.target !== readerOverlay) return;
      await runViewerTask(async () => {
        viewerState.readerId = null;
        viewerState.readerCard = null;
        await coaRenderViewer();
      }, '리더 닫기');
    });

    root.querySelectorAll('[data-coa-card-id]').forEach((cardEl) => {
      const activate = async () => {
        await runViewerTask(async () => {
          const id = cardEl.getAttribute('data-coa-card-id') || '';
          if (viewerState.selectionMode) {
            toggleViewerSelection(id);
            await coaRenderViewer();
          } else {
            await coaOpenReader(id);
          }
        }, '카드 열기');
      };
      cardEl.addEventListener('click', activate);
      cardEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
    });

    bindRackEvents(root);
    bindViewerTagScroller(root);
    bindViewerCardScroller(root);
    bindViewerReaderScroller(root);

    root.querySelectorAll('[data-coa-filter-archive]').forEach((button) => {
      button.addEventListener('click', async () => {
        await runViewerTask(async () => {
          viewerState.filters.archiveType = button.getAttribute('data-coa-filter-archive') || '';
          await coaRenderViewer();
        }, '저장함 필터');
      });
    });



    root.querySelector('[data-coa-filter-favorite]')?.addEventListener('click', async () => {
      await runViewerTask(async () => {
        viewerState.filters.favoriteOnly = !viewerState.filters.favoriteOnly;
        await coaRenderViewer();
      }, '즐겨찾기 필터');
    });

    root.querySelectorAll('[data-coa-filter-tag]').forEach((button) => {
      button.addEventListener('click', async () => {
        await runViewerTask(async () => {
          viewerState.filters.tags = toggleInArray(viewerState.filters.tags, button.getAttribute('data-coa-filter-tag') || '');
          await coaRenderViewer();
        }, '태그 필터');
      });
    });

    const searchInput = root.querySelector('[data-coa-action="search"]');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        viewerState.filters.text = searchInput.value;
        clearTimeout(viewerState.searchTimer);
        viewerState.searchTimer = setTimeout(() => {
          viewerState.lastSearchFocus = true;
          void runViewerTask(() => coaRenderViewer(), '검색');
        }, 160);
      });
    }

    const sortSelect = root.querySelector('[data-coa-sort-by]');
    sortSelect?.addEventListener('change', async () => {
      await runViewerTask(async () => {
        viewerState.sortBy = normalizeViewerSortBy(sortSelect.value);
        const settings = await coaLoadSettings();
        await coaSaveSettings({
          ...settings,
          sortBy: viewerState.sortBy,
          sortDirection: viewerState.sortDirection,
        });
        await coaRenderViewer();
      }, '정렬 변경');
    });

    root.querySelectorAll('[data-coa-action]').forEach((button) => {
      const action = button.getAttribute('data-coa-action');
      if (action === 'search') return;
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled || button.dataset.coaBusy === '1') return;
        button.dataset.coaBusy = '1';
        button.disabled = true;
        const id = button.getAttribute('data-card-id') || '';
        try {
          if (action === 'close-viewer') coaCloseViewer();
          else if (action === 'toggle-sort-direction') {
            viewerState.sortDirection = normalizeViewerSortDirection(viewerState.sortDirection) === 'down' ? 'up' : 'down';
            const settings = await coaLoadSettings();
            await coaSaveSettings({
              ...settings,
              sortBy: viewerState.sortBy,
              sortDirection: viewerState.sortDirection,
            });
            await coaRenderViewer();
          } else if (action === 'toggle-selection-mode') {
            viewerState.selectionMode = !viewerState.selectionMode;
            viewerState.bulkTagOpen = false;
            viewerState.rackOpenId = '';
            clearViewerSelection();
            await coaRenderViewer();
          } else if (action === 'toggle-view-mode') {
            const currentMode = normalizeViewerViewMode(viewerState.viewMode);
            viewerState.viewMode = currentMode === 'card' ? 'stack' : 'card';
            viewerState.rackAnimate = viewerState.viewMode === 'stack';
            viewerState.rackOpenId = '';
            const settings = await coaLoadSettings();
            await coaSaveSettings({ ...settings, viewMode: viewerState.viewMode });
            await coaRenderViewer();
          } else if (action === 'new-card') {
            coaOpenPasteModal();
          } else if (action === 'import-chat-log') {
            coaOpenLogImportModal();
          } else if (action === 'select-visible') {
            const visible = viewerState.visibleIds || [];
            const allSelected = visible.length > 0 && visible.every((visibleId) => viewerState.selectedIds.has(visibleId));
            visible.forEach((visibleId) => { if (allSelected) viewerState.selectedIds.delete(visibleId); else viewerState.selectedIds.add(visibleId); });
            await coaRenderViewer();
          } else if (action === 'clear-selection') {
            clearViewerSelection();
            await coaRenderViewer();
          } else if (action === 'bulk-tags') {
            if (!viewerState.selectedIds.size) return;
            viewerState.bulkTagOpen = true;
            await coaRenderViewer();
          } else if (action === 'close-bulk-tags') {
            viewerState.bulkTagOpen = false;
            await coaRenderViewer();
          } else if (action === 'export-selected') {
            await coaExportSelectedJSON([...viewerState.selectedIds]);
          } else if (action === 'delete-selected') {
            const ids = [...viewerState.selectedIds];
            if (!ids.length || !confirm(`선택한 카드 ${ids.length}개를 정말 삭제할까?`)) return;
            const deleted = await coaDeleteCardsBatch(ids);
            const deletedSet = new Set(ids);
            if (viewerState.readerId && deletedSet.has(viewerState.readerId)) { viewerState.readerId = null; viewerState.readerCard = null; }
            if (viewerState.editCard && deletedSet.has(viewerState.editCard.id)) viewerState.editCard = null;
            clearViewerSelection();
            alert(`${deleted}개 카드 삭제 완료.`);
            await coaRenderViewer();
          } else if (action === 'export-json') {
            await coaExportJSON();
          } else if (action === 'import-json') {
            await openImportPicker(async () => coaRenderViewer());
          } else if (action === 'open-replacements') {
            await coaOpenReplacementSettingsModal();
          } else if (action === 'close-reader') {
            viewerState.readerId = null;
            viewerState.readerCard = null;
            await coaRenderViewer();
          } else if (action === 'edit-card') {
            await coaOpenEditModal(id);
          } else if (action === 'delete-card') {
            await coaDeleteCardFromViewer(id);
          } else if (action === 'toggle-favorite') {
            await coaToggleFavorite(id);
            await coaRenderViewer();
          } else if (action === 'open-html') {
            await coaOpenHTMLPreview(id);
          } else if (action === 'open-dc') {
            await coaOpenDCPreview(id);
          } else if (action === 'copy-md') {
            const card = await coaLoadCard(id);
            if (!card) throw new Error('복사할 카드를 찾지 못했습니다.');
            await writePlainText(card.body || '');
            alert('원문 복사 완료.');
          } else if (action === 'close-edit') {
            viewerState.editCard = null;
            await coaRenderViewer();
          }
        } catch (error) {
          console.error(`[COA:UI] action failed: ${action}`, error);
          alert(`Crack Archive 작업 실패: ${error.message || error}`);
        } finally {
          button.dataset.coaBusy = '0';
          if (button.isConnected) button.disabled = false;
        }
      });
    });

    const bulkTagForm = root.querySelector('[data-coa-bulk-tag-form="1"]');
    if (bulkTagForm) {
      bulkTagForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (bulkTagForm.dataset.coaBusy === '1') return;
        const submit = bulkTagForm.querySelector('button[type="submit"]');
        bulkTagForm.dataset.coaBusy = '1';
        if (submit) submit.disabled = true;
        try {
          const fd = new FormData(bulkTagForm);
          const changed = await coaApplyBulkTags([...viewerState.selectedIds], fd.get('addTags'), fd.get('removeTags'));
          viewerState.bulkTagOpen = false;
          alert(changed ? `${changed}개 카드의 태그를 수정했어.` : '바뀐 태그가 없어.');
          await coaRenderViewer();
        } catch (error) {
          console.error('[COA:STORE] bulk tag update failed:', error);
          alert(`태그 일괄 수정 실패: ${error.message || error}`);
        } finally {
          bulkTagForm.dataset.coaBusy = '0';
          if (submit?.isConnected) submit.disabled = false;
        }
      });
    }

    const editForm = root.querySelector('[data-coa-edit-form="1"]');
    if (editForm) {
      editForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (editForm.dataset.coaBusy === '1') return;
        const submit = editForm.querySelector('button[type="submit"]');
        editForm.dataset.coaBusy = '1';
        if (submit) submit.disabled = true;
        try {
          await coaSaveEditForm(editForm);
        } catch (error) {
          console.error('[COA:STORE] edit save failed:', error);
          alert(`카드 수정 저장 실패: ${error.message || error}`);
        } finally {
          editForm.dataset.coaBusy = '0';
          if (submit?.isConnected) submit.disabled = false;
        }
      });
    }
  }

  async function coaOpenReader(id) {
    const card = await coaLoadCard(id);
    if (!card) {
      alert('카드를 찾지 못했습니다. 목록 새로고침를 한 번 돌려봐.');
      return;
    }
    if (viewerState.viewMode === 'stack' && viewerState.rackOpenId === card.id) {
      cacheRackExpandedExcerpt(card.id, makeRackExpandedExcerpt(card));
    }
    viewerState.readerId = card.id;
    viewerState.readerCard = card;
    viewerState.readerScrollTop = 0;
    viewerState.editCard = null;
    await coaRenderViewer();
  }

  async function coaOpenEditModal(id) {
    const card = await coaLoadCard(id || viewerState.readerId);
    if (!card) {
      alert('수정할 카드를 찾지 못했습니다.');
      return;
    }
    viewerState.editCard = card;
    await coaRenderViewer();
  }

  async function coaSaveEditForm(form) {
    const current = viewerState.editCard;
    if (!current) return;
    const fd = new FormData(form);
    const body = toStringValue(fd.get('body'));
    const bodyChanged = body !== toStringValue(current.body);
    const format = bodyChanged ? detectContentFormat(body) : current.format;
    const next = normalizeCard({
      ...current,
      title: fd.get('title'),
      archiveType: fd.get('archiveType'),
      format,
      tags: fd.get('tags'),
      body,
      log: bodyChanged ? null : current.log,
      view: current.archiveType === 'log' || normalizeArchiveType(fd.get('archiveType'), 'ooc') === 'log'
        ? {
            htmlLayout: fd.get('htmlLayout') || current.view?.htmlLayout,
            htmlColor: normalizeLogHTMLColor(current.view?.htmlColor || current.view?.htmlTheme, fd.get('htmlLayout') || current.view?.htmlLayout),
            fontFamily: fd.get('fontFamily') || current.view?.fontFamily,
            smartTable: false,
          }
        : { ...current.view, htmlLayout: fd.get('oocHtmlLayout') || current.view?.htmlLayout, smartTable: false },
      dc: current.dc,
      updatedAt: nowMs(),
    });
    if (bodyChanged && current.log?.messages?.length) {
      alert('본문을 직접 수정해서 채팅 가져오기용 메시지 구조는 해제됨.');
    }

    const saved = await coaSaveCard(next);
    viewerState.editCard = null;
    if (viewerState.readerId === saved.id) viewerState.readerCard = saved;
    await coaRenderViewer();
  }

  async function coaDeleteCardFromViewer(id) {
    const card = await coaLoadCard(id);
    if (!card) {
      alert('삭제할 카드를 찾지 못했습니다.');
      return;
    }
    if (!confirm(`정말 삭제할까?

${card.title}`)) return;
    await coaDeleteCard(id);
    viewerState.selectedIds.delete(id);
    if (viewerState.readerId === id) {
      viewerState.readerId = null;
      viewerState.readerCard = null;
    }
    if (viewerState.editCard && viewerState.editCard.id === id) viewerState.editCard = null;
    await coaRenderViewer();
  }

  async function coaMountViewer(options = {}) {
    if (typeof options.open === 'boolean') viewerState.open = options.open;
    viewerState.mounted = true;
    await coaRenderViewer();
  }

  async function coaOpenViewer() {
    // 다른 탭에서 저장된 변경은 다음 보관함 열기 때 한 번 새로 읽는다.
    coaIndexRuntimeCacheReady = false;
    viewerState.open = true;
    await coaMountViewer({ open: true });
  }

  function coaCloseViewer() {
    viewerState.renderToken += 1;
    cleanupViewerTransientBindings({ clearSearchTimer: true });
    viewerState.open = false;
    viewerState.readerId = null;
    viewerState.readerCard = null;
    viewerState.editCard = null;
    viewerState.selectionMode = false;
    viewerState.bulkTagOpen = false;
    viewerState.visibleIds = [];
    clearViewerSelection();
    clearSearchCorpusCache();
    const root = getViewerRoot();
    root.dataset.open = '0';
    root.innerHTML = '';
  }


  function validateCOAConfiguration() {
    const warnings = [];
    const expectedLogKeys = ['specsheet','baekjimeok','simya','yeonji','cheongram','wongo','silentfilm','tajeon','seongjwa','makgan','crosslog','airmail','gwedo','heugyo','cheongin','yeobaek','muji'];
    const expectedOOCHTMLKeys = ['specsheet','gwedo','muji','yeobaek','baekjimeok','newspaper','airmail','library','onair','quest','midnight','diagnosis','dossier','receipt','timeline','board','wiki','messenger','livechat','riftchat','diary'];
    const expectedOOCDCKeys = ['specsheet','gwedo','muji','yeobaek','baekjimeok','newspaper','airmail','library','onair','quest','midnight','diagnosis','dossier','receipt','timeline','board','wiki','messenger','livechat','riftchat','diary'];
    const htmlOnlyOOCKeys = new Set();
    const oocHTMLKeys = Object.keys(OOC_HTML_LAYOUTS);
    const oocDCKeys = Object.keys(DC_EXPORT_STYLES.ooc);
    const oocPaletteKeys = Object.keys(DC_DOC_PALETTES);
    const logHTMLKeys = Object.keys(LOG_HTML_LAYOUTS);
    const logDCKeys = Object.keys(DC_LOG_THEMES);
    const sameOrder = (actual, expected) => actual.length === expected.length && actual.every((key, index) => key === expected[index]);

    if (!sameOrder(logHTMLKeys, expectedLogKeys)) warnings.push('일반 HTML 로그 테마 00~16 키 또는 순서가 다름');
    if (!sameOrder(logDCKeys, expectedLogKeys)) warnings.push('DC 로그 테마 00~16 키 또는 순서가 다름');
    if (!sameOrder(oocHTMLKeys, expectedOOCHTMLKeys)) warnings.push('일반 HTML OOC 테마 00~20 키 또는 순서가 다름');
    if (!sameOrder(oocDCKeys, expectedOOCDCKeys)) warnings.push('DC OOC 테마 00~20 키 또는 순서가 다름');

    for (const key of oocHTMLKeys) {
      if (htmlOnlyOOCKeys.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(DC_EXPORT_STYLES.ooc, key)) warnings.push(`OOC HTML 테마 '${key}'의 DC 서식이 없음`);
      if (!Object.prototype.hasOwnProperty.call(DC_DOC_PALETTES, key)) warnings.push(`OOC 테마 '${key}'의 DC 팔레트가 없음`);
    }
    for (const key of oocDCKeys) {
      if (!Object.prototype.hasOwnProperty.call(OOC_HTML_LAYOUTS, key)) warnings.push(`OOC DC 서식 '${key}'의 일반 HTML 테마가 없음`);
      if (!Object.prototype.hasOwnProperty.call(DC_DOC_PALETTES, key)) warnings.push(`OOC DC 서식 '${key}'의 팔레트가 없음`);
    }
    for (const key of oocPaletteKeys) {
      if (!Object.prototype.hasOwnProperty.call(DC_EXPORT_STYLES.ooc, key)) warnings.push(`사용되지 않는 OOC DC 팔레트 '${key}'`);
    }
    for (const [alias, target] of Object.entries(OOC_HTML_LAYOUT_ALIASES)) {
      if (!Object.prototype.hasOwnProperty.call(OOC_HTML_LAYOUTS, target)) warnings.push(`OOC 구버전 별칭 '${alias}'의 대상 '${target}'이 없음`);
    }

    for (const [key, config] of Object.entries(LOG_HTML_LAYOUTS)) {
      const variants = getLogHTMLVariantMap(key);
      if (!variants || !Object.prototype.hasOwnProperty.call(variants, config.defaultColor)) {
        warnings.push(`로그 테마 '${key}'의 기본 색상 '${config.defaultColor}'이 없음`);
      }
      if (!Object.prototype.hasOwnProperty.call(DC_LOG_THEMES, key)) warnings.push(`로그 HTML 테마 '${key}'의 DC 테마가 없음`);
    }
    for (const key of Object.keys(DC_LOG_THEMES)) {
      if (!Object.prototype.hasOwnProperty.call(LOG_HTML_LAYOUTS, key)) warnings.push(`DC 로그 테마 '${key}'의 일반 HTML 테마가 없음`);
    }

    const fontGroups = new Set(COA_FONT_GROUPS.map(([key]) => key));
    for (const [key, preset] of Object.entries(COA_FONT_PRESETS)) {
      if (!fontGroups.has(preset.group)) warnings.push(`일반 HTML 폰트 '${key}'의 그룹 '${preset.group}'이 없음`);
      if (!preset.family) warnings.push(`일반 HTML 폰트 '${key}'의 family가 비어 있음`);
    }
    for (const [key, preset] of Object.entries(DC_FONT_PRESETS)) {
      if (!preset.family) warnings.push(`DC 폰트 '${key}'의 family가 비어 있음`);
    }
    if (!Object.prototype.hasOwnProperty.call(OOC_HTML_LAYOUTS, DC_DEFAULT_OPTIONS.oocStyle)) warnings.push('DC 기본 OOC 서식이 유효하지 않음');
    if (!Object.prototype.hasOwnProperty.call(LOG_HTML_LAYOUTS, DC_DEFAULT_OPTIONS.logTheme)) warnings.push('DC 기본 로그 테마가 유효하지 않음');
    if (!Object.prototype.hasOwnProperty.call(DC_FONT_PRESETS, normalizeDCFont(DC_DEFAULT_OPTIONS.font))) warnings.push('DC 기본 폰트가 유효하지 않음');

    if (warnings.length) console.warn('[COA] configuration check:', warnings);
    return warnings;
  }

  function exposeAPI() {
    const api = Object.freeze({
      version: COA_VERSION,
      storage: STORAGE,
      selectors: SELECTORS,
      coaLoadIndex,
      coaLoadCard,
      coaSaveCard,
      coaDeleteCard,
      coaRebuildIndex,
      coaExportJSON,
      coaImportJSON,
      coaQuery,
      coaRenderMarkdown,
      coaRenderHTML,
      resolveRenderFormat,
      hasMarkdownSyntax,
      hasSignificantHTMLTags,
      shouldRenderHTMLThroughMarkdown,
      coaRenderCardBody,
      coaExportPNG,
      coaToInlineHTML,
      coaCopyRichHTML,
      coaCopyHTMLSource,
      coaOpenDCPreview,
      coaOpenPasteModal,
      coaOpenLogImportModal,
      coaExportSelectedJSON,
      coaMountCollectorButton,
      coaLoadSettings,
      coaSaveSettings,
      coaMountViewer,
      coaOpenViewer,
      coaCloseViewer,
      coaOpenReader,
      coaOpenEditModal,
      _internals: Object.freeze({
        normalizeCard,
        metaFromCard,
        detectContentFormat,
        stripMarkdown,
        makeExcerpt,
        makeId,
        validateCOAConfiguration,
      }),
    });

    globalThis.COA = api;
    globalThis.coaLoadIndex = coaLoadIndex;
    globalThis.coaLoadCard = coaLoadCard;
    globalThis.coaSaveCard = coaSaveCard;
    globalThis.coaDeleteCard = coaDeleteCard;
    globalThis.coaRebuildIndex = coaRebuildIndex;
    globalThis.coaExportJSON = coaExportJSON;
    globalThis.coaImportJSON = coaImportJSON;
    globalThis.coaQuery = coaQuery;
    globalThis.coaRenderMarkdown = coaRenderMarkdown;
    globalThis.coaResolveRenderFormat = resolveRenderFormat;
    globalThis.coaShouldRenderHTMLThroughMarkdown = shouldRenderHTMLThroughMarkdown;
    globalThis.coaRenderHTML = coaRenderHTML;
    globalThis.coaRenderCardBody = coaRenderCardBody;
    globalThis.coaRenderSmartBody = coaRenderSmartBody;
    globalThis.coaExportPNG = coaExportPNG;
    globalThis.coaToInlineHTML = coaToInlineHTML;
    globalThis.coaCopyRichHTML = coaCopyRichHTML;
    globalThis.coaCopyHTMLSource = coaCopyHTMLSource;
    globalThis.coaOpenDCPreview = coaOpenDCPreview;
    globalThis.coaOpenPasteModal = coaOpenPasteModal;
    globalThis.coaOpenLogImportModal = coaOpenLogImportModal;
    globalThis.coaExportSelectedJSON = coaExportSelectedJSON;
    globalThis.coaIsEpisodePage = isCOAEpisodePage;
    globalThis.coaMountCollectorButton = coaMountCollectorButton;
    globalThis.coaUnmountCollectorButton = coaUnmountCollectorButton;
    globalThis.coaMountViewer = coaMountViewer;
    globalThis.coaOpenViewer = coaOpenViewer;
    globalThis.coaCloseViewer = coaCloseViewer;
    globalThis.coaOpenReader = coaOpenReader;
    globalThis.coaOpenEditModal = coaOpenEditModal;
  }

  async function boot() {
    exposeAPI();
    validateCOAConfiguration();
    const migration = await migrateFallbackStorageToGM();
    if (migration.migrated > 0) {
      await coaRebuildIndex();
      console.info(`[COA] fallback → Tampermonkey storage migrated: ${migration.migrated}, skipped: ${migration.skipped}`);
    }

    const settings = await coaLoadSettings();
    await coaSaveSettings(settings);
    viewerState.theme = 'auto';
    viewerState.viewMode = normalizeViewerViewMode(settings.viewMode);
    viewerState.sortBy = normalizeViewerSortBy(settings.sortBy);
    viewerState.sortDirection = normalizeViewerSortDirection(settings.sortDirection);
    viewerState.themeLoaded = true;

    getViewerRoot();
    ensureHostThemeSync();
    installCOACollectorRouteWatcher();

  }

  boot().catch((error) => {
    console.error('[COA] boot failed:', error);
  });
})();
