// ==UserScript==
// @name         🔊 Crack Blip (재잘 말소리)
// @namespace    crack-blip
// @version      1.0.0
// @description  크랙 답변이 한 단어씩 써질 때 그 박자에 맞춰 소리를 냅니다. 대사는 캐릭터마다 다른 말소리(동물의 숲 풍·삐빅·8비트 등), 서술은 타자기·키보드 소리. 채팅방 상단 버튼에서 켜고 끄고 고릅니다.
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/Blip.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/Blip.user.js
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

// 소리 파일 없이 브라우저 안에서 바로 합성합니다. 아이콘: Lucide (ISC)

(() => {
  'use strict';

  const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (pageWindow.__crackBlipRunning) return;
  pageWindow.__crackBlipRunning = true;

  const VERSION = '1.0.0';
  const LOG = '[재잘]';
  const SETTINGS_KEY = 'cbl:settings:v1';
  const VOICES_KEY = 'cbl:voices:v1';
  const DEBUG = (() => {
    try { return pageWindow.localStorage.getItem('cbl:debug') === '1'; } catch (error) { return false; }
  })();

  // gap: 같은 소리가 너무 촘촘하게 겹치지 않게 두는 최소 간격(ms). 크랙은 40ms마다 한 단어씩 보여 줍니다.
  const KINDS = [
    { id: 'babble', name: '재잘', gap: 70 },
    { id: 'beep', name: '삐빅', gap: 55 },
    { id: 'chip', name: '8비트', gap: 60 },
    { id: 'pop', name: '톡톡', gap: 50 },
    { id: 'marimba', name: '마림바', gap: 85 },
    { id: 'typewriter', name: '타자기', gap: 40 },
    { id: 'keyboard', name: '키보드', gap: 45 },
    { id: 'off', name: '끔', gap: 0 },
  ];
  const KIND = Object.fromEntries(KINDS.map(kind => [kind.id, kind]));
  const PACE = [
    { mul: 1.9, name: '느긋' },
    { mul: 1.4, name: '조금 느긋' },
    { mul: 1, name: '보통' },
    { mul: 0.75, name: '촘촘' },
    { mul: 0.55, name: '아주 촘촘' },
  ];
  const DEFAULTS = Object.freeze({ on: true, vol: 45, dia: 'babble', narr: 'typewriter', narrVol: 55, pace: 3, vary: true, bell: true });

  // ---------- 설정 ----------

  const S = { ...DEFAULTS, ...readValue(SETTINGS_KEY, {}) };
  if (!KIND[S.dia]) S.dia = DEFAULTS.dia;
  if (!KIND[S.narr]) S.narr = DEFAULTS.narr;
  S.vol = clamp(Number(S.vol), 0, 100, DEFAULTS.vol);
  S.narrVol = clamp(Number(S.narrVol), 0, 100, DEFAULTS.narrVol);
  S.pace = clamp(Math.round(Number(S.pace)), 1, 5, DEFAULTS.pace);

  // 작품마다 { 이름: { kind, shift, at } }. 이름이 ''이면 이름표 없는 대사입니다.
  const VOICES = readValue(VOICES_KEY, {});

  function readValue(key, fallback) {
    try {
      const value = GM_getValue(key, fallback);
      return value && typeof value === 'object' ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function clamp(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  const saveTimers = {};
  function saveLater(key, value, delay = 400) {
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(() => {
      try { GM_setValue(key, value); } catch (error) { console.warn(LOG, 'save failed', error); }
    }, delay);
  }

  const saveSettings = () => saveLater(SETTINGS_KEY, { ...S });

  function route() {
    const path = location.pathname;
    let m = path.match(/^\/stories\/([^/]+)\/episodes\/([^/?#]+)/);
    if (m) return { page: 'story', key: m[1] };
    m = path.match(/^\/stories\/([^/]+)\/parties\/([^/?#]+)/);
    if (m) return { page: 'party', key: m[1] };
    m = path.match(/^\/characters\/([^/]+)\/chats\/([^/?#]+)/);
    if (m) return { page: 'character', key: `c:${m[1]}` };
    m = path.match(/^\/u\/([^/]+)\/c\/([^/?#]+)/);
    if (m) return { page: 'character', key: `c:${m[1]}` };
    return { page: '', key: '' };
  }

  function voiceConf(key, name) {
    return (key && VOICES[key] && VOICES[key][name]) || {};
  }

  function setVoiceConf(key, name, patch) {
    if (!key) return;
    const book = VOICES[key] || (VOICES[key] = {});
    book[name] = { ...(book[name] || {}), ...patch };
    pruneVoices();
    saveLater(VOICES_KEY, VOICES);
  }

  // 대사가 나온 이름을 작품별로 모아 두면 설정 창에서 목소리를 바꿀 수 있습니다.
  function touchSpeaker(key, name) {
    if (!key) return;
    const now = Date.now();
    const known = VOICES[key]?.[name];
    if (known && now - (known.at || 0) < 60000) return;
    setVoiceConf(key, name, { at: now });
    if (ui.open) renderVoices();
  }

  function pruneVoices() {
    const keys = Object.keys(VOICES);
    for (const key of keys) {
      const names = Object.keys(VOICES[key]);
      if (names.length <= 40) continue;
      names.sort((a, b) => (VOICES[key][b].at || 0) - (VOICES[key][a].at || 0));
      names.slice(40).forEach(name => {
        const conf = VOICES[key][name];
        if (!conf.kind && !conf.shift) delete VOICES[key][name];
      });
    }
    if (keys.length > 80) {
      const latest = key => Math.max(0, ...Object.values(VOICES[key]).map(conf => conf.at || 0));
      keys.sort((a, b) => latest(b) - latest(a)).slice(80).forEach(key => delete VOICES[key]);
    }
  }

  // ---------- 소리 엔진 ----------

  const A = { ctx: null, master: null, noise: null, pulse: null, last: 0, primed: false, hiddenPause: false };

  function initAudio() {
    if (A.ctx) return A.ctx;
    const AC = pageWindow.AudioContext || pageWindow.webkitAudioContext || window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (error) { return null; }
    A.ctx = ctx;
    A.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    A.master.connect(comp);
    comp.connect(ctx.destination);
    applyVolume();

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    A.noise = noise;

    // 12.5% 펄스파: 패미컴 소리의 바탕입니다.
    const size = 32;
    const real = new Float32Array(size);
    const imag = new Float32Array(size);
    for (let k = 1; k < size; k += 1) real[k] = (2 * Math.sin(Math.PI * k * 0.125)) / (Math.PI * k);
    A.pulse = ctx.createPeriodicWave(real, imag);

    ctx.onstatechange = () => paintButton();
    return ctx;
  }

  function applyVolume() {
    if (A.master) A.master.gain.value = Math.pow(S.vol / 100, 1.3) * 0.55;
  }

  const audioReady = () => Boolean(A.ctx && A.ctx.state === 'running');

  // 브라우저는 사용자가 한 번 누르기 전까지 소리를 막습니다. 전송·재생성 클릭이 곧 그 한 번이 됩니다.
  function unlock() {
    if (!S.on || document.hidden) return;
    const ctx = initAudio();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {}).finally(paintButton);
    if (!A.primed) {
      A.primed = true;
      try {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22050);
        source.connect(ctx.destination);
        source.start(0);
      } catch (error) { /* 무시 */ }
    }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(type => window.addEventListener(type, unlock, { capture: true, passive: true }));

  // 탭이 뒤로 가면 우리 소리만 멈춥니다. 다른 확프의 소리는 건드리지 않습니다.
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) {
      if (A.ctx.state === 'running') {
        A.hiddenPause = true;
        A.ctx.suspend().catch(() => {});
      }
    } else if (A.hiddenPause) {
      A.hiddenPause = false;
      if (S.on) A.ctx.resume().catch(() => {}).finally(paintButton);
    }
  });

  const semi = n => Math.pow(2, n / 12);
  const PENTA = [0, 2, 4, 7, 9];

  function pentatonic(freq) {
    const midi = 69 + 12 * Math.log2(freq / 440);
    const octave = Math.floor(midi / 12) * 12;
    let best = midi;
    let dist = Infinity;
    for (const shift of [-12, 0, 12]) {
      for (const step of PENTA) {
        const note = octave + shift + step;
        if (Math.abs(note - midi) < dist) {
          dist = Math.abs(note - midi);
          best = note;
        }
      }
    }
    return 440 * Math.pow(2, (best - 69) / 12);
  }

  function envelope(ctx, t, peak, attack, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  }

  function oscillator(ctx, type, freq, t, stop) {
    const osc = ctx.createOscillator();
    if (type === 'pulse') osc.setPeriodicWave(A.pulse);
    else osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.start(t);
    osc.stop(stop);
    return osc;
  }

  function noiseBurst(ctx, t, duration) {
    const source = ctx.createBufferSource();
    source.buffer = A.noise;
    source.start(t, Math.random() * 0.8, duration);
    return source;
  }

  function filter(ctx, type, freq, q) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = freq;
    node.Q.value = q;
    return node;
  }

  // 한국어 모음의 입 모양(포먼트, Hz). 재잘 소리가 "아/이/우"처럼 들리게 합니다.
  const FORMANTS = { a: [800, 1250], e: [480, 1900], eo: [600, 1000], o: [420, 800], u: [340, 900], eu: [380, 1450], i: [300, 2300] };
  const VOWEL_STEP = { a: 0, e: 2, eo: -2, o: -3, u: -5, eu: -1, i: 4 };
  const JUNG = ['a', 'e', 'a', 'e', 'eo', 'e', 'eo', 'e', 'o', 'a', 'e', 'e', 'o', 'u', 'eo', 'e', 'i', 'u', 'eu', 'i', 'i'];

  const SOUNDS = {
    babble(ctx, out, t, v, s) {
      const freq = v.base * semi(s.step * 0.5 + (Math.random() - 0.5) * 0.8);
      const dur = s.coda ? 0.045 : 0.065;
      const osc = oscillator(ctx, v.wave, freq, t, t + dur + 0.04);
      if (s.rise) osc.frequency.linearRampToValueAtTime(freq * 1.3, t + dur);
      const [f1, f2] = FORMANTS[s.vowel] || FORMANTS.a;
      const gain = envelope(ctx, t, 0.9 * s.amp, 0.008, dur);
      // 모음 두 개의 공명(F1·F2)에 낮은 몸통 소리를 조금 섞습니다.
      for (const [type, freqF, q, level] of [['bandpass', f1 * v.fs, 6, 1], ['bandpass', f2 * v.fs, 8, 0.7], ['lowpass', 1200, 0.7, 0.12]]) {
        const band = filter(ctx, type, freqF, q);
        const amount = ctx.createGain();
        amount.gain.value = level;
        osc.connect(band);
        band.connect(amount);
        amount.connect(gain);
      }
      gain.connect(out);
    },
    beep(ctx, out, t, v, s) {
      const freq = v.base * 1.6 * semi(s.step);
      const dur = s.coda ? 0.028 : 0.04;
      const osc = oscillator(ctx, 'square', freq, t, t + dur + 0.02);
      if (s.rise) osc.frequency.linearRampToValueAtTime(freq * 1.25, t + dur);
      const tone = filter(ctx, 'lowpass', 3500, 0.7);
      const gain = envelope(ctx, t, 0.2 * s.amp, 0.002, dur);
      osc.connect(tone);
      tone.connect(gain);
      gain.connect(out);
    },
    chip(ctx, out, t, v, s) {
      const freq = pentatonic(v.base * 2 * semi(s.step));
      const dur = s.coda ? 0.04 : 0.06;
      const osc = oscillator(ctx, 'pulse', freq, t, t + dur + 0.02);
      if (s.rise) osc.frequency.setValueAtTime(freq * semi(5), t + dur * 0.5);
      const peak = 0.16 * s.amp;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(peak, t + 0.002);
      gain.gain.setValueAtTime(peak, t + dur * 0.6);
      gain.gain.linearRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(out);
    },
    pop(ctx, out, t, v, s) {
      const freq = v.base * 3 * semi(s.step * 0.5);
      const osc = oscillator(ctx, 'sine', freq, t, t + 0.07);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.04);
      const gain = envelope(ctx, t, 0.38 * s.amp, 0.002, 0.045);
      osc.connect(gain);
      gain.connect(out);
    },
    marimba(ctx, out, t, v, s) {
      const freq = pentatonic(v.base * 2 * semi(s.step));
      const body = oscillator(ctx, 'sine', freq, t, t + 0.36);
      const ring = oscillator(ctx, 'sine', freq * 4, t, t + 0.08);
      const g1 = envelope(ctx, t, 0.3 * s.amp, 0.003, s.coda ? 0.18 : 0.28);
      const g2 = envelope(ctx, t, 0.07 * s.amp, 0.001, 0.05);
      body.connect(g1);
      ring.connect(g2);
      g1.connect(out);
      g2.connect(out);
    },
    typewriter(ctx, out, t, v, s) {
      const click = noiseBurst(ctx, t, 0.03);
      const band = filter(ctx, 'bandpass', 3000 * (0.85 + Math.random() * 0.3), 1.4);
      const g1 = envelope(ctx, t, 0.6 * s.amp, 0.001, 0.02);
      click.connect(band);
      band.connect(g1);
      g1.connect(out);
      const thud = oscillator(ctx, 'sine', 170, t, t + 0.04);
      thud.frequency.exponentialRampToValueAtTime(90, t + 0.03);
      const g2 = envelope(ctx, t, 0.22 * s.amp, 0.001, 0.025);
      thud.connect(g2);
      g2.connect(out);
    },
    keyboard(ctx, out, t, v, s) {
      const click = noiseBurst(ctx, t, 0.03);
      const band = filter(ctx, 'bandpass', 1700 * (0.9 + Math.random() * 0.2), 0.9);
      const g1 = envelope(ctx, t, 0.4 * s.amp, 0.001, 0.014);
      click.connect(band);
      band.connect(g1);
      g1.connect(out);
      const thock = oscillator(ctx, 'triangle', 130, t, t + 0.06);
      thock.frequency.exponentialRampToValueAtTime(70, t + 0.045);
      const g2 = envelope(ctx, t, 0.32 * s.amp, 0.002, 0.045);
      thock.connect(g2);
      g2.connect(out);
    },
  };

  // 타자기가 줄 끝에서 내는 "띵".
  function bell(ctx, out, t) {
    for (const [freq, level] of [[1760, 0.12], [2640, 0.05], [3520, 0.025]]) {
      const osc = oscillator(ctx, 'sine', freq, t, t + 0.75);
      const gain = envelope(ctx, t, level, 0.002, 0.7);
      osc.connect(gain);
      gain.connect(out);
    }
  }

  // 단어 첫 글자의 모음·받침과 문장부호로 소리 모양을 정합니다.
  function syllable(chunk) {
    let vowel = null;
    let coda = false;
    for (const ch of chunk) {
      const code = ch.codePointAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const index = code - 0xac00;
        vowel = JUNG[Math.floor((index % 588) / 28)];
        coda = index % 28 > 0;
        break;
      }
      if (/[a-z]/i.test(ch)) {
        const found = chunk.toLowerCase().match(/[aeiouy]/);
        vowel = found ? { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'i' }[found[0]] : 'eo';
        break;
      }
      if (/[\p{L}\p{N}]/u.test(ch)) {
        vowel = ['a', 'e', 'i', 'o', 'u'][code % 5];
        break;
      }
    }
    if (!vowel) return null;
    const bang = /[!！]/.test(chunk);
    const soft = /…|\.\.\./.test(chunk);
    return { vowel, coda, step: VOWEL_STEP[vowel], rise: /[?？]/.test(chunk), amp: bang ? 1.35 : soft ? 0.7 : 1 };
  }

  function fnv(text) {
    let hash = 0x811c9dc5;
    for (const ch of text) {
      hash ^= ch.codePointAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  // 이름마다 목소리 높이·음색이 정해집니다. 이름 없는 대사는 작품마다 다른 목소리를 씁니다.
  function voiceOf(role, speaker, key) {
    if (role === 'narr') return { kind: S.narr, base: 220, wave: 'sawtooth', fs: 1, vol: S.narrVol / 100 };
    const name = speaker || '';
    const conf = voiceConf(key, name);
    const hash = fnv(name || key || 'crack');
    const base = S.vary ? 150 + (hash % 270) : 240;
    const wave = S.vary ? ['sawtooth', 'square'][(hash >>> 9) & 1] : 'sawtooth';
    const fs = S.vary ? 0.86 + ((hash >>> 13) % 32) / 100 : 1;
    return { kind: KIND[conf.kind] ? conf.kind : S.dia, base: base * semi(Number(conf.shift) || 0), wave, fs, vol: 1 };
  }

  function playAt(voice, syl, t, options = {}) {
    const ctx = A.ctx;
    const out = ctx.createGain();
    out.gain.value = voice.vol;
    out.connect(A.master);
    SOUNDS[voice.kind](ctx, out, t, voice, syl);
    if (options.bell) bell(ctx, out, t + 0.01);
    setTimeout(() => out.disconnect(), Math.max(0, (t - ctx.currentTime) * 1000) + 1200);
  }

  function blip(role, speaker, chunk, options) {
    if (!S.on || !audioReady()) return 'locked';
    const voice = voiceOf(role, speaker, options.key);
    if (voice.kind === 'off' || !SOUNDS[voice.kind]) return 'off';
    const syl = syllable(chunk);
    if (!syl) return 'symbol';
    const now = performance.now();
    if (now - A.last < KIND[voice.kind].gap * PACE[S.pace - 1].mul) return 'gap';
    A.last = now;
    const ringBell = options.newBlock && role === 'narr' && voice.kind === 'typewriter' && S.bell;
    playAt(voice, syl, A.ctx.currentTime + 0.005, { bell: ringBell });
    return 'played';
  }

  const DEMO = {
    dia: '안녕하세요, 오늘도 와 주셨네요? 정말 반가워요!',
    narr: '창밖으로 바람이 불어와 커튼이 천천히 흔들렸다.',
  };

  // 미리듣기: 크랙이 단어를 보여 주는 박자대로 문장 하나를 들려줍니다.
  function demo(role, speaker = '', kindOverride = '') {
    unlock();
    if (!A.ctx) return;
    const run = () => {
      const key = route().key;
      const voice = voiceOf(role, speaker, key);
      if (kindOverride) voice.kind = kindOverride;
      if (voice.kind === 'off' || !SOUNDS[voice.kind]) return;
      const step = Math.max(0.07, (KIND[voice.kind].gap * PACE[S.pace - 1].mul) / 1000);
      const start = A.ctx.currentTime + 0.03;
      DEMO[role === 'narr' ? 'narr' : 'dia'].split(' ').forEach((word, index) => {
        const syl = syllable(word);
        if (syl) playAt(voice, syl, start + index * step, { bell: false });
      });
    };
    if (A.ctx.state === 'running') run();
    else A.ctx.resume().then(run).catch(() => {});
  }

  // ---------- 타이핑 감지 ----------
  // 크랙은 답변을 메시지 목록 맨 앞의 임시 칸에 span.animate로 한 단어씩 붙입니다.
  // 글자가 늘어난 만큼(앞부분이 그대로일 때만) 한 번 소리를 냅니다.

  const WAITING = ['AI가 세계관을 불러오는 중', '세계관에 사용자의 행동 반영 중', '개연성에 맞는 사건 준비 중', '스토리 진행 결과 판단 중', '세계관 내 변수 분석 중', '최종결과 정리 중'];
  const MUTE_SEL = 'pre, code, a, kbd, .wrtn-codeblock, .not-wrtn-markdown, h1, h2, h3, h4, h5, h6, table, button';
  const SKIP_SEL = 'button, svg, style, script, textarea, input, select, [contenteditable="false"]';
  const BLOCK_SEL = 'p, li, blockquote, td, th, dd, dt';
  const DUMP_CHARS = 40;

  const det = { list: null, observer: null, md: null, text: '', lastBlock: null };

  function textNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const skip = node.parentElement?.closest(SKIP_SEL);
        return skip && root.contains(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  }

  function isWaiting(text) {
    const flat = text.replace(/\s+/g, ' ').trim().replace(/[….]+$/, '').trim();
    if (!flat) return true;
    if (flat.length > 30) return false;
    return WAITING.some(phrase => phrase.startsWith(flat) || flat.startsWith(phrase)) || (/중$/.test(flat) && !/["“「]/.test(flat));
  }

  const cleanName = text => text.replace(/[|｜:：]/g, '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20);

  // 블록(문단) 안의 글자 위치 → 그 글자가 든 텍스트 노드
  function nodeAt(segments, offset) {
    for (const seg of segments) {
      if (offset >= seg.start && offset < seg.start + seg.node.nodeValue.length) return seg.node;
    }
    return segments.length ? segments[segments.length - 1].node : null;
  }

  function startOf(segments, element) {
    const seg = segments.find(item => element.contains(item.node));
    return seg ? seg.start : -1;
  }

  // 줄 맨 앞의 굵은 글씨(**이름 |**)를 찾습니다.
  function leadStrong(segments, text, block, lineStart, lineEnd) {
    const line = text.slice(lineStart, lineEnd);
    const first = lineStart + (line.length - line.trimStart().length);
    if (first >= lineEnd) return null;
    const strong = nodeAt(segments, first)?.parentElement?.closest('strong, b');
    return strong && strong !== block && block.contains(strong) ? strong : null;
  }

  // 새로 써진 단어가 대사인지 서술인지, 대사라면 누구 목소리인지 정합니다.
  function classify(md, nodes, add, page) {
    let last = null;
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      if (/\S/.test(nodes[i].nodeValue)) {
        last = nodes[i];
        break;
      }
    }
    if (!last) return { role: 'mute' };
    const block = last.parentElement?.closest(BLOCK_SEL) || md;
    const segments = [];
    let text = '';
    for (const node of nodes) {
      if (!block.contains(node)) continue;
      segments.push({ node, start: text.length });
      text += node.nodeValue;
    }
    let pos = Math.max(0, text.length - Math.min(add.length, text.length));
    const letter = /[\p{L}\p{N}]/u.exec(text.slice(pos));
    if (letter) pos += letter.index;
    const el = nodeAt(segments, pos)?.parentElement;
    if (!el || el.closest(MUTE_SEL)) return { role: 'mute', block };

    const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    const nextBreak = text.indexOf('\n', pos);
    const lineEnd = nextBreak < 0 ? text.length : nextBreak;
    const line = text.slice(lineStart, lineEnd);
    const head = line.trimStart();
    if (/^(\[|【|［|!\[|\{\{|<)/.test(head) || /\]\(|https?:\/\//.test(line)) return { role: 'mute', block };

    let speaker = '';
    let labeled = false;
    const lead = leadStrong(segments, text, block, lineStart, lineEnd);
    if (lead) {
      const name = cleanName(lead.textContent);
      if (lead.contains(el)) return { role: 'label', speaker: name, block };
      const after = text.slice(startOf(segments, lead) + lead.textContent.length).trimStart();
      if (name && (/[|｜:：]\s*$/.test(lead.textContent) || /^[|｜:：]/.test(after))) {
        speaker = name;
        labeled = true;
      }
    }
    if (!labeled && !lead) {
      const colon = /^\s*([^\s:："“'「『*]{1,12})\s?[:：]\s*/u.exec(line);
      if (colon && /\p{L}/u.test(colon[1])) {
        if (pos - lineStart < colon[0].length) return { role: 'label', speaker: colon[1], block };
        speaker = cleanName(colon[1]);
        labeled = true;
      }
    }
    // 인용문 안에서 첫 줄이 이름만 있는 굵은 글씨면(>**로건**🍙) 그 아래 줄은 그 사람의 대사로 봅니다.
    if (!labeled && block.closest('blockquote') && lineStart > 0) {
      const firstEnd = text.indexOf('\n');
      const firstLead = leadStrong(segments, text, block, 0, firstEnd);
      if (firstLead && !text.slice(0, firstEnd).replace(firstLead.textContent, '').replace(/[\s|｜:：]|\p{Extended_Pictographic}|️/gu, '')) {
        speaker = cleanName(firstLead.textContent);
        labeled = Boolean(speaker);
      }
    }

    let quote = 0;
    let bracket = 0;
    for (const ch of text.slice(lineStart, pos)) {
      if (ch === '"' || ch === '“' || ch === '”') quote ^= 1;
      else if (ch === '「' || ch === '『') bracket += 1;
      else if ((ch === '」' || ch === '』') && bracket) bracket -= 1;
    }
    let role;
    if (quote || bracket) role = 'dia';
    else if (el.closest('em, i')) role = 'narr';
    else if (labeled) role = 'dia';
    else role = page === 'character' ? 'dia' : 'narr';
    return { role, speaker: role === 'dia' ? speaker : '', block };
  }

  function streamingMarkdown(list) {
    const animated = list.querySelector('.animate');
    return animated ? animated.closest('.wrtn-markdown') : null;
  }

  function resetStream() {
    det.md = null;
    det.text = '';
    det.lastBlock = null;
  }

  function debugLog(entry) {
    if (!DEBUG) return;
    const log = pageWindow.__cblLog || (pageWindow.__cblLog = []);
    log.push({ at: Math.round(performance.now()), ...entry });
    if (log.length > 2000) log.splice(0, log.length - 2000);
  }

  function onMutations() {
    if (!det.list) return;
    const md = streamingMarkdown(det.list);
    if (!md) {
      if (det.md) resetStream();
      return;
    }
    if (md !== det.md) {
      resetStream();
      det.md = md;
    }
    const nodes = textNodes(md);
    const text = nodes.map(node => node.nodeValue).join('');
    if (text === det.text) return;
    const prev = det.text;
    det.text = text;
    // 숨김 주석이 사라지거나 대기 문구가 진짜 답으로 바뀌면 앞부분이 달라집니다. 이때는 기준만 새로 잡습니다.
    if (!text.startsWith(prev)) return;
    const add = text.slice(prev.length);
    if (!S.on || document.hidden) return;
    if (add.length > DUMP_CHARS) return debugLog({ skip: 'dump', add: add.slice(0, 20) });
    if (isWaiting(text)) return debugLog({ skip: 'waiting', add });
    const here = route();
    const info = classify(md, nodes, add, here.page);
    // 크랙이 문단 칸을 새로 그려도 같은 문단으로 보도록 몇 번째 문단인지로 비교합니다.
    const blockKey = !info.block ? null : info.block === md ? -1 : Array.prototype.indexOf.call(md.querySelectorAll(BLOCK_SEL), info.block);
    const newBlock = blockKey !== null && det.lastBlock !== null && blockKey !== det.lastBlock;
    if (blockKey !== null) det.lastBlock = blockKey;
    if (info.role === 'mute' || info.role === 'label') return debugLog({ role: info.role, speaker: info.speaker || '', add });
    if (info.role === 'dia') touchSpeaker(here.key, info.speaker);
    const result = blip(info.role, info.speaker, add, { key: here.key, newBlock });
    debugLog({ role: info.role, speaker: info.speaker, add, result, newBlock });
  }

  // 채팅방을 옮기면 크랙이 메시지 목록을 새로 만들기 때문에, 1초마다 목록이 바뀌었는지 보고 다시 붙습니다.
  function attach() {
    const group = document.querySelector('[data-message-group-id]');
    const list = group?.parentElement || (route().page ? document.querySelector('.stick-to-bottom') : null);
    if (list === det.list) return;
    det.observer?.disconnect();
    det.list = list;
    resetStream();
    if (!list) return;
    det.observer = new MutationObserver(onMutations);
    det.observer.observe(list, { childList: true, subtree: true, characterData: true });
  }

  // ---------- 화면 ----------

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"/><path class="cbl-slash" d="M3 3l18 18"/></svg>';
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>';

  const HOST_CSS = `
.cbl-hbtn{position:relative;display:inline-grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:none;color:inherit;cursor:pointer;opacity:.75;transition:background-color .15s,opacity .15s,scale .15s}
.cbl-hbtn:hover{opacity:1;background:rgba(127,127,127,.14)}
.cbl-hbtn:active{scale:.96}
.cbl-hbtn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;overflow:visible}
.cbl-hbtn .cbl-slash{display:none}
.cbl-hbtn.is-off{opacity:.45}
.cbl-hbtn.is-off .cbl-slash{display:inline}
.cbl-hbtn.is-open{opacity:1;background:rgba(127,127,127,.18)}
.cbl-hbtn.is-locked::after{content:"";position:absolute;top:5px;right:5px;width:7px;height:7px;border-radius:50%;background:#e0a03a;box-shadow:0 0 0 2px var(--bg_screen,#fff)}
body[data-theme="dark"] .cbl-hbtn.is-locked::after{box-shadow:0 0 0 2px var(--bg_screen,#141413)}
.cbl-hbtn.is-float{position:fixed;top:64px;right:14px;z-index:40;width:36px;height:36px;border-radius:12px;background:var(--bg_screen,#fff);box-shadow:0 1px 3px rgba(0,0,0,.18);opacity:.9}
.cbl-hbtn.is-blip svg{animation:cbl-bob .16s ease-out}
@keyframes cbl-bob{50%{scale:1.12}}
.cbl-tip::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;translate:-50% -2px;z-index:60;padding:5px 8px;border-radius:7px;background:#1b1b1b;color:#fff;font-size:11.5px;font-weight:600;line-height:1.2;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s cubic-bezier(.2,0,0,1),translate .15s cubic-bezier(.2,0,0,1)}
body[data-theme="dark"] .cbl-tip::after{background:#ececec;color:#131313}
.cbl-tip:hover::after{opacity:1;translate:-50% 0}
.cbl-hbtn.is-open::after,.cbl-hbtn.is-float::after{display:none}
@media (hover:none){.cbl-tip::after{display:none}}`;

  const PANEL_CSS = `
*{box-sizing:border-box}
button,select,input{font:inherit;color:inherit;letter-spacing:inherit}
button{cursor:pointer}
.stage{--canvas:#18181a;--surface:#212123;--surface-2:#2a2a2d;--text:#ededee;--text-2:#9b9ba1;--text-3:#66666c;--rule:rgba(255,255,255,.08);--rule-2:rgba(255,255,255,.16);--rail:#46464c;--accent:#8cc59e;--accent-soft:rgba(140,197,158,.13);--accent-on:#122018;--warn:#e0a03a;--ring:0 0 0 1px rgba(255,255,255,.08);--lift:0 0 0 1px rgba(255,255,255,.1),0 24px 56px -16px rgba(0,0,0,.75);--out:cubic-bezier(.2,0,0,1);position:fixed;inset:0;z-index:2147483000;pointer-events:none}
.stage[data-theme=light]{--canvas:#fff;--surface:#f5f5f4;--surface-2:#ededec;--text:#1c1c1b;--text-2:#6b6b68;--text-3:#a3a3a0;--rule:rgba(0,0,0,.08);--rule-2:rgba(0,0,0,.15);--rail:#d0d0cd;--accent:#4f8a63;--accent-soft:rgba(79,138,99,.1);--accent-on:#fff;--warn:#b7791f;--ring:0 0 0 1px rgba(0,0,0,.06),0 1px 2px -1px rgba(0,0,0,.06);--lift:0 0 0 1px rgba(0,0,0,.06),0 24px 56px -18px rgba(0,0,0,.32)}
.pn{position:absolute;width:332px;max-height:calc(100vh - 80px);overflow:auto;overscroll-behavior:contain;pointer-events:auto;background:var(--canvas);color:var(--text);border-radius:18px;box-shadow:var(--lift);font-size:13px;line-height:1.45;letter-spacing:-.01em;outline:none;animation:pnIn .24s var(--out) both;scrollbar-width:thin;scrollbar-color:var(--rail) transparent}
@keyframes pnIn{from{opacity:0;translate:0 -6px;scale:.985}}
.pn.out{animation:pnOut .14s var(--out) forwards}
@keyframes pnOut{to{opacity:0;translate:0 -4px}}
.hd{display:flex;align-items:center;gap:10px;padding:14px 14px 10px}
.mark{width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:11px;background:var(--surface);box-shadow:var(--ring)}
.mark svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mark .cbl-slash{display:none}
.ttl{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.ttl b{font-size:15px;font-weight:700;letter-spacing:-.025em}
.ttl small{font-size:11.5px;color:var(--text-3)}
.sw{position:relative;width:42px;height:24px;flex:none;padding:0;border:0;border-radius:999px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--rule);transition:background .2s var(--out)}
.sw i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--text-2);transition:translate .22s var(--out),background .2s}
.sw[aria-pressed=true]{background:var(--accent)}
.sw[aria-pressed=true] i{translate:18px 0;background:var(--accent-on)}
.lock{margin:0 14px 8px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--warn) 14%,transparent);color:var(--warn);font-size:12px;font-weight:600}
.sec{padding:10px 14px;border-top:1px solid var(--rule)}
.pn.is-off .sec{opacity:.5}
.lab{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;font-weight:700;color:var(--text-2)}
.lab .grow{flex:1}
.play{width:26px;height:26px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:var(--surface);color:var(--text-2);box-shadow:var(--ring);transition:color .15s,scale .15s}
.play:hover{color:var(--text)}
.play:active{scale:.94}
.play svg{width:12px;height:12px;fill:currentColor}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{height:28px;padding:0 11px;border:0;border-radius:999px;background:var(--surface);color:var(--text-2);box-shadow:var(--ring);font-size:12.5px;font-weight:600;transition:background .15s,color .15s,scale .15s}
.chip:hover{color:var(--text)}
.chip:active{scale:.96}
.chip[aria-pressed=true]{background:var(--accent);color:var(--accent-on);box-shadow:none}
.row{display:flex;align-items:center;gap:10px;min-height:30px}
.row+.row{margin-top:4px}
.row label{width:64px;flex:none;color:var(--text-2);font-size:12px;font-weight:600}
.row output{width:58px;flex:none;text-align:right;color:var(--text-3);font-size:11.5px;font-variant-numeric:tabular-nums}
input[type=range]{flex:1;min-width:0;height:20px;margin:0;background:none;accent-color:var(--accent);cursor:pointer}
.ck{display:flex;align-items:center;gap:8px;margin-top:6px;color:var(--text-2);font-size:12.5px;cursor:pointer}
.ck input{width:15px;height:15px;margin:0;accent-color:var(--accent)}
.vrow{display:flex;align-items:center;gap:6px;min-height:34px}
.vrow+.vrow{border-top:1px dashed var(--rule)}
.vname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.vname.anon{color:var(--text-3);font-weight:500}
select{height:26px;max-width:74px;padding:0 4px;border:0;border-radius:8px;background:var(--surface);box-shadow:var(--ring);font-size:12px;cursor:pointer}
.pitch{display:flex;align-items:center;border-radius:8px;background:var(--surface);box-shadow:var(--ring)}
.pitch button{width:22px;height:26px;padding:0;border:0;background:none;color:var(--text-2);font-size:14px;line-height:1}
.pitch button:hover{color:var(--text)}
.pitch span{min-width:22px;text-align:center;font-size:11.5px;font-variant-numeric:tabular-nums;color:var(--text-2)}
.empty{color:var(--text-3);font-size:12px}
.ft{padding:8px 14px 12px;border-top:1px solid var(--rule);color:var(--text-3);font-size:11px}
@media (max-width:520px){.pn{left:10px!important;right:10px!important;width:auto}}`;

  const ui = { host: null, shadow: null, stage: null, open: false, button: null };
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function currentTheme() {
    const theme = document.body?.dataset.theme;
    if (theme === 'light' || theme === 'dark') return theme;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return pageWindow.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function injectHostStyle() {
    if (document.getElementById('cbl-host-style')) return;
    const style = document.createElement('style');
    style.id = 'cbl-host-style';
    style.textContent = HOST_CSS;
    document.head.append(style);
  }

  function ensureStage() {
    if (ui.host?.isConnected) return ui.stage;
    ui.host = document.createElement('div');
    ui.host.id = 'cbl-host';
    ui.shadow = ui.host.attachShadow({ mode: 'open' });
    ui.shadow.innerHTML = `<style>${PANEL_CSS}</style><div class="stage"></div>`;
    ui.stage = ui.shadow.querySelector('.stage');
    document.body.append(ui.host);
    // 창 안에서 누른 키가 크랙 단축키(Enter로 입력창 이동 등)에 닿지 않게 여기서 멈춥니다.
    ['keydown', 'keyup', 'keypress'].forEach(type => ui.shadow.addEventListener(type, event => {
      if (event.type === 'keydown' && event.key === 'Escape') closePanel();
      event.stopPropagation();
    }));
    ui.shadow.addEventListener('click', onPanelClick);
    ui.shadow.addEventListener('input', onPanelInput);
    ui.shadow.addEventListener('change', onPanelInput);
    return ui.stage;
  }

  const chips = (set, value) => KINDS.map(kind => `<button class="chip" data-set="${set}" data-kind="${kind.id}" aria-pressed="${kind.id === value}">${kind.name}</button>`).join('');

  function panelHtml() {
    const locked = S.on && !audioReady();
    return `<div class="pn${S.on ? '' : ' is-off'}" role="dialog" aria-label="재잘 말소리" tabindex="-1">
  <div class="hd"><div class="mark">${ICON}</div><div class="ttl"><b>재잘 말소리</b><small>답변이 써지는 박자에 맞춰 소리를 내요</small></div>
  <button class="sw" data-act="power" aria-pressed="${S.on}" aria-label="켜기/끄기"><i></i></button></div>
  ${locked ? '<div class="lock">🔇 화면을 한 번 누르면 소리가 켜져요</div>' : ''}
  <div class="sec"><div class="row"><label for="v">전체 소리</label><input id="v" type="range" min="0" max="100" step="1" value="${S.vol}" data-set="vol"><output>${S.vol}</output></div></div>
  <div class="sec"><div class="lab">대사 소리<span class="grow"></span><button class="play" data-act="try" data-role="dia" aria-label="대사 미리듣기">${PLAY}</button></div>
  <div class="chips">${chips('dia', S.dia)}</div></div>
  <div class="sec"><div class="lab">서술 소리<span class="grow"></span><button class="play" data-act="try" data-role="narr" aria-label="서술 미리듣기">${PLAY}</button></div>
  <div class="chips">${chips('narr', S.narr)}</div>
  <div class="row" style="margin-top:8px"><label for="nv">서술 크기</label><input id="nv" type="range" min="0" max="100" step="1" value="${S.narrVol}" data-set="narrVol"><output>${S.narrVol}</output></div></div>
  <div class="sec"><div class="row"><label for="pc">촘촘함</label><input id="pc" type="range" min="1" max="5" step="1" value="${S.pace}" data-set="pace"><output>${PACE[S.pace - 1].name}</output></div>
  <label class="ck"><input type="checkbox" data-set="vary"${S.vary ? ' checked' : ''}>캐릭터마다 목소리 다르게</label>
  <label class="ck"><input type="checkbox" data-set="bell"${S.bell ? ' checked' : ''}>타자기 문단 바뀔 때 '띵'</label></div>
  <div class="sec" data-voices>${voicesHtml()}</div>
  <div class="ft">이름표(**이름 |**)·따옴표 대사는 말소리, *기울임* 서술은 서술 소리로 나뉘어요. 코드블록·상태창·숨김 주석은 조용히 지나가요.</div>
</div>`;
  }

  function voicesHtml() {
    const key = route().key;
    const book = VOICES[key] || {};
    const names = Object.keys(book).sort((a, b) => (book[b].at || 0) - (book[a].at || 0));
    const head = '<div class="lab">이 작품 목소리</div>';
    if (!key) return `${head}<div class="empty">채팅방에서 열면 캐릭터별 목소리를 바꿀 수 있어요.</div>`;
    if (!names.length) return `${head}<div class="empty">아직 대사가 없어요. 답변이 나오면 말한 사람 이름이 여기에 모여요.</div>`;
    const options = value => [`<option value=""${value ? '' : ' selected'}>기본</option>`]
      .concat(KINDS.map(kind => `<option value="${kind.id}"${kind.id === value ? ' selected' : ''}>${kind.name}</option>`)).join('');
    return head + names.map(name => {
      const conf = book[name];
      const shift = Number(conf.shift) || 0;
      const label = name ? esc(name) : '이름 없는 대사';
      return `<div class="vrow" data-name="${esc(name)}"><span class="vname${name ? '' : ' anon'}" title="${label}">${label}</span>
<select data-voice="kind" aria-label="소리 종류">${options(conf.kind || '')}</select>
<span class="pitch"><button data-voice="down" aria-label="낮게">−</button><span>${shift > 0 ? `+${shift}` : shift}</span><button data-voice="up" aria-label="높게">+</button></span>
<button class="play" data-act="try" data-role="dia" data-name="${esc(name)}" aria-label="미리듣기">${PLAY}</button></div>`;
    }).join('');
  }

  function renderVoices() {
    const box = ui.stage?.querySelector('[data-voices]');
    if (box) box.innerHTML = voicesHtml();
  }

  function placePanel() {
    const panel = ui.stage?.querySelector('.pn');
    if (!panel) return;
    const rect = ui.button?.isConnected ? ui.button.getBoundingClientRect() : { bottom: 56, right: innerWidth - 14 };
    panel.style.top = `${Math.round(rect.bottom + 8)}px`;
    panel.style.right = `${Math.max(10, Math.round(innerWidth - rect.right - 4))}px`;
    panel.style.maxHeight = `${Math.max(240, innerHeight - rect.bottom - 24)}px`;
  }

  function renderPanel() {
    const stage = ensureStage();
    stage.dataset.theme = currentTheme();
    stage.innerHTML = panelHtml();
    placePanel();
  }

  function openPanel() {
    ui.open = true;
    renderPanel();
    ui.stage.querySelector('.pn')?.focus({ preventScroll: true });
    paintButton();
  }

  function closePanel() {
    if (!ui.open) return;
    ui.open = false;
    const panel = ui.stage?.querySelector('.pn');
    if (panel) {
      panel.classList.add('out');
      setTimeout(() => { if (!ui.open) ui.stage.innerHTML = ''; }, 150);
    }
    paintButton();
  }

  function onPanelClick(event) {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.act === 'power') {
      S.on = !S.on;
      saveSettings();
      if (S.on) unlock();
      else if (A.ctx?.state === 'running') A.ctx.suspend().catch(() => {});
      renderPanel();
      paintButton();
      return;
    }
    if (target.dataset.set) {
      S[target.dataset.set] = target.dataset.kind;
      saveSettings();
      target.parentElement.querySelectorAll('.chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip === target)));
      demo(target.dataset.set, '', target.dataset.kind === 'off' ? '' : target.dataset.kind);
      return;
    }
    if (target.dataset.act === 'try') {
      const name = target.dataset.name;
      demo(target.dataset.role, name || '', '');
      return;
    }
    const voice = target.dataset.voice;
    if (voice === 'up' || voice === 'down') {
      const name = target.closest('.vrow').dataset.name;
      const key = route().key;
      const shift = clamp((Number(voiceConf(key, name).shift) || 0) + (voice === 'up' ? 1 : -1), -12, 12, 0);
      setVoiceConf(key, name, { shift });
      target.parentElement.querySelector('span').textContent = shift > 0 ? `+${shift}` : String(shift);
      demo('dia', name, '');
    }
  }

  function onPanelInput(event) {
    const target = event.target;
    if (target.dataset.voice === 'kind') {
      if (event.type !== 'change') return;
      const name = target.closest('.vrow').dataset.name;
      setVoiceConf(route().key, name, { kind: target.value });
      demo('dia', name, '');
      return;
    }
    const key = target.dataset.set;
    if (!key) return;
    if (target.type === 'checkbox') {
      S[key] = target.checked;
    } else if (target.type === 'range') {
      S[key] = Number(target.value);
      const output = target.parentElement.querySelector('output');
      if (output) output.textContent = key === 'pace' ? PACE[S.pace - 1].name : String(S[key]);
      if (key === 'vol') applyVolume();
      if (event.type === 'change' && (key === 'vol' || key === 'narrVol')) demo(key === 'vol' ? 'dia' : 'narr');
    }
    saveSettings();
  }

  // 창 밖을 누르면 닫습니다.
  document.addEventListener('pointerdown', event => {
    if (!ui.open) return;
    const path = event.composedPath();
    if (path.includes(ui.host) || path.includes(ui.button)) return;
    closePanel();
  }, true);
  window.addEventListener('resize', () => { if (ui.open) placePanel(); });

  function paintButton() {
    const button = ui.button;
    if (!button) return;
    button.classList.toggle('is-off', !S.on);
    button.classList.toggle('is-locked', S.on && !audioReady() && !document.hidden);
    button.classList.toggle('is-open', ui.open);
    const tip = !S.on ? '재잘 말소리 · 꺼짐' : audioReady() ? '재잘 말소리' : '재잘 말소리 · 화면을 한 번 누르면 켜져요';
    button.dataset.tip = tip;
    button.setAttribute('aria-label', tip);
    if (ui.open && ui.stage) {
      const panel = ui.stage.querySelector('.pn');
      const lock = ui.stage.querySelector('.lock');
      if (panel && Boolean(lock) !== (S.on && !audioReady())) renderPanel();
    }
  }

  function makeButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cbl-hbtn cbl-tip';
    button.innerHTML = ICON;
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (ui.open) closePanel();
      else openPanel();
    });
    button.cblBound = true;
    return button;
  }

  // 스토리 채팅은 상단 줄 오른쪽 묶음(모델 버튼 자리), 캐릭터 채팅은 사이드 패널 버튼 앞에 붙습니다.
  function headerAnchor() {
    const header = document.querySelector('.group\\/header');
    const group = header?.querySelector('button[aria-haspopup="dialog"]')?.parentElement;
    if (group) return { parent: group, before: group.firstChild };
    const side = document.querySelector('button[aria-label="사이드 패널 열기"]');
    if (side?.parentElement) return { parent: side.parentElement, before: side };
    return null;
  }

  let missingSince = 0;
  function ensureButton() {
    const here = route();
    if (!here.page) {
      missingSince = 0;
      if (ui.button) {
        ui.button.remove();
        ui.button = null;
      }
      closePanel();
      return;
    }
    if (ui.button && (!ui.button.isConnected || !ui.button.cblBound)) ui.button = null;
    const anchor = headerAnchor();
    if (anchor) {
      missingSince = 0;
      if (ui.button?.parentElement === anchor.parent && !ui.button.classList.contains('is-float')) return;
      ui.button?.remove();
      document.querySelectorAll('.cbl-hbtn').forEach(node => node.remove());
      ui.button = makeButton();
      anchor.parent.insertBefore(ui.button, anchor.before);
      paintButton();
      return;
    }
    // 머리 줄을 못 찾는 화면(파티챗 등)에서는 오른쪽 위에 작은 버튼을 띄웁니다.
    if (ui.button) return;
    missingSince = missingSince || Date.now();
    if (Date.now() - missingSince < 2500) return;
    ui.button = makeButton();
    ui.button.classList.add('is-float');
    document.body.append(ui.button);
    paintButton();
  }

  function tick() {
    injectHostStyle();
    attach();
    ensureButton();
  }

  tick();
  setInterval(tick, 1000);
  setInterval(paintButton, 3000);

  pageWindow.CrackBlip = {
    version: VERSION,
    state: () => ({ on: S.on, audio: A.ctx ? A.ctx.state : 'none', attached: Boolean(det.list), streaming: Boolean(det.md), settings: { ...S } }),
    demo: (role = 'dia', kind = '') => demo(role, '', kind),
    classify: md => {
      const nodes = textNodes(md);
      return classify(md, nodes, nodes.map(node => node.nodeValue).join('').slice(-6), route().page);
    },
  };
  console.info(LOG, `v${VERSION} 준비됨`);
})();
