// 재잘 말소리 가짜 크랙 화면 시험 (40ms마다 span.animate 로 한 단어씩 타이핑 흉내)
// 실행: npm i -D playwright 후 node tests/blip.mock.js   (THEME=light)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Blip.user.js'), 'utf8');
const shot = name => path.join(OUT, name + '.png');
const THEME = process.env.THEME || 'dark';

const html = (party = false) => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--bg_screen:#fff} body[data-theme=dark]{--bg_screen:#141413}
body{margin:0;font-family:sans-serif;background:var(--bg_screen);color:#111} body[data-theme=dark]{color:#eee}
.hdr>div{display:flex;justify-content:space-between;align-items:center;height:48px;padding:0 20px;border-bottom:1px solid #8884}
.right{display:flex;gap:12px;align-items:center}.right button{background:none;border:1px solid #8886;border-radius:99px;color:inherit;height:32px}
.stick-to-bottom{height:calc(100vh - 49px);overflow:auto}
#list{display:flex;flex-direction:column-reverse;gap:24px;max-width:720px;margin:0 auto;padding:24px}
em{opacity:.7} .wrtn-codeblock{background:#8882;padding:8px;border-radius:8px}
</style></head><body data-theme="${THEME}">
<main><div class="hdr group/header"><div><button class="rm">빗속의 서윤</button><div class="right"><button aria-haspopup="dialog">슈퍼챗 3.0</button><button>⋯</button></div></div></div>
<div class="stick-to-bottom"><div><div id="list" class="flex flex-col-reverse w-full gap-10">
${party ? '<div data-message-item="i2"><div class="wrtn-markdown"><p>행동 1</p></div></div><div data-message-item="i1"><div class="wrtn-markdown"><p><em>파티 프롤로그.</em></p></div></div>' : `<div class="w-full" data-message-group-id="g2"><div class="wrtn-markdown"><p>행동 1</p></div></div>
<div class="w-full" data-message-group-id="g1"><div class="wrtn-markdown"><p><em>프롤로그. 비가 내리기 시작했다.</em></p></div></div>`}
</div></div></div></main></body></html>`;

// 크랙 스트리밍 흉내: 40ms마다 토큰 1개, span.animate / em.animate / strong.animate 로 다시 그림
const SIM = `
window.__sim = (() => {
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function inline(t) {
    let out = '', i = 0;
    while (i < t.length) {
      if (t[i] === '\`') { const j = t.indexOf('\`', i + 1); const inner = j < 0 ? t.slice(i + 1) : t.slice(i + 1, j); out += '<code class="animate">' + esc(inner) + '</code>'; i = j < 0 ? t.length : j + 1; continue; }
      if (t.startsWith('**', i)) { const j = t.indexOf('**', i + 2); const inner = j < 0 ? t.slice(i + 2) : t.slice(i + 2, j); out += '<strong class="animate">' + esc(inner) + '</strong>'; i = j < 0 ? t.length : j + 2; continue; }
      if (t[i] === '*') { const j = t.indexOf('*', i + 1); const inner = j < 0 ? t.slice(i + 1) : t.slice(i + 1, j); out += '<em class="animate">' + esc(inner) + '</em>'; i = j < 0 ? t.length : j + 1; continue; }
      let j = t.slice(i).search(/[*\`]/); j = j < 0 ? t.length : i + j;
      for (const w of (t.slice(i, j).match(/\\S+\\s*|\\s+/g) || [])) out += '<span class="animate">' + esc(w) + '</span>';
      i = j;
    }
    return out;
  }
  function render(src, done) {
    let html = '';
    for (const b of src.split(/\\n{2,}/)) {
      if (!b) continue;
      if (b.startsWith('\`\`\`')) { const body = b.replace(/^\`\`\`[^\\n]*\\n?/, '').replace(/\`\`\`$/, ''); html += '<div class="wrtn-codeblock not-wrtn-markdown"><button>복사</button><pre class="shiki"><code>' + esc(body) + '</code></pre></div>'; continue; }
      if (/^\\[\\/\\/\\]: # \\(.*\\)$/.test(b)) continue;
      html += '<p>' + inline(b) + '</p>';
    }
    return done ? html.replace(/ class="animate"/g, '') : html;
  }
  const tokens = src => src.match(/[^\\s,:.!?]+[\\s,:.!?]*|[\\s,:.!?]+/g) || [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function stream(src, opt = {}) {
    const list = document.getElementById('list');
    const holder = document.createElement('div');
    holder.className = 'flex flex-col gap-2 relative items-start w-full';
    holder.innerHTML = '<div class="flex flex-col w-full"><div class="wrtn-markdown css-wait"></div></div>';
    list.prepend(holder);
    const md = holder.querySelector('.wrtn-markdown');
    if (opt.waiting) {
      const wt = tokens('스토리 진행 결과 판단 중…');
      for (let k = 1; k <= wt.length; k++) { md.innerHTML = '<p>' + inline(wt.slice(0, k).join('')) + '</p>'; await sleep(40); }
      await sleep(300);
      md.className = 'wrtn-markdown css-real';
    }
    const tk = tokens(src);
    let k = 0;
    const box = holder.firstElementChild;
    while (k < tk.length) {
      const n = opt.dumpAt === k ? 30 : 1;
      k = Math.min(tk.length, k + n);
      const prefix = tk.slice(0, k).join('');
      if (opt.bubbles) {
        // 캐릭터 채팅: 빈 줄마다 말풍선 하나, 매번 통째로 새로 그림(앞 말풍선도 .animate 유지)
        box.innerHTML = prefix.split('\\n\\n').filter(x => x.trim()).map(seg => '<div class="bubble"><div class="wrtn-markdown">' + render(seg.trim(), false) + '</div></div>').join('');
      } else {
        md.innerHTML = render(prefix, false);
      }
      await sleep(opt.tick || 40);
    }
    await sleep(120);
    holder.remove();
    const g = document.createElement('div');
    if (opt.party) g.dataset.messageItem = 'i' + k;
    else { g.className = 'w-full'; g.dataset.messageGroupId = 'g' + Math.random().toString(16).slice(2); }
    g.innerHTML = '<div class="wrtn-markdown">' + render(src, true) + '</div>';
    list.prepend(g);
  }
  return { stream };
})();`;

const stub = `(()=>{const P='gm:';window.GM_getValue=(k,d)=>{const v=localStorage.getItem(P+k);return v==null?d:JSON.parse(v)};window.GM_setValue=(k,v)=>localStorage.setItem(P+k,JSON.stringify(v));window.unsafeWindow=window;localStorage.setItem('cbl:debug','1');})();`;

const STORY = `[//]: # (ROLE-CHECK: test)

*비가 내리기 시작했다. 창문에 빗방울이 맺혔다.*

**아무개 |** 자세한 설명은 이동하면서 드리겠습니다. 여기 계속 서 계시면 곤란해요?

**페르 |** "뭐야… 진짜야?"

그녀는 고개를 끄덕였다. "응, 진짜야!" 하고 웃었다.

악어: 축하해 주작이여

\`\`\`INFO
HP 100 / MP 30
\`\`\``;

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.route('https://crack.wrtn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html(route.request().url().includes('/parties/')) }));
  await ctx.addInitScript(`${stub}\ndocument.addEventListener('DOMContentLoaded',()=>{${SIM}\n${SCRIPT}\n});`);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', e.message));
  pg.on('console', msg => { if (['error', 'warning'].includes(msg.type())) console.log('[console]', msg.type(), msg.text()); });
  await pg.goto('https://crack.wrtn.ai/stories/s1/episodes/c1');
  await pg.waitForTimeout(1300);
  console.log('button', await pg.locator('.cbl-hbtn').count(), 'locked?', await pg.evaluate(() => document.querySelector('.cbl-hbtn').className));
  await pg.mouse.click(600, 400);
  await pg.waitForTimeout(300);
  console.log('state', JSON.stringify(await pg.evaluate(() => window.CrackBlip.state())));
  await pg.evaluate(() => window.__sim.stream(window.__STORY, { waiting: true }).then(() => (window.__done = 1)), null).catch(() => {});
  await pg.evaluate(s => { window.__STORY = s; }, STORY);
  await pg.evaluate(() => { window.__done = 0; window.__sim.stream(window.__STORY, { waiting: true }).then(() => (window.__done = 1)); });
  await pg.waitForFunction(() => window.__done === 1, null, { timeout: 30000 });
  await pg.waitForTimeout(300);
  const log = await pg.evaluate(() => window.__cblLog);
  for (const e of log) console.log(String(e.at).padStart(6), (e.skip || e.role || '').padEnd(8), (e.speaker || '').padEnd(5), (e.result || '').padEnd(7), e.newBlock ? 'NEW' : '   ', JSON.stringify(e.add));
  console.log('state after', JSON.stringify(await pg.evaluate(() => window.CrackBlip.state())));

  // 덤프(한꺼번에 쏟아짐) 확인
  await pg.evaluate(() => { window.__cblLog = []; window.__done = 0; window.__sim.stream('*' + '긴 서술이 이어진다 '.repeat(20) + '*', { dumpAt: 3 }).then(() => (window.__done = 1)); });
  await pg.waitForFunction(() => window.__done === 1, null, { timeout: 30000 });
  const dump = await pg.evaluate(() => window.__cblLog);
  console.log('dump entries:', dump.filter(e => e.skip === 'dump').length, 'played:', dump.filter(e => e.result === 'played').length, 'gap:', dump.filter(e => e.result === 'gap').length);

  // 패널
  await pg.click('.cbl-hbtn');
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: shot('b1-panel-' + THEME) });
  const sr = fn => pg.evaluate(fn);
  console.log('voices:', await sr(() => [...document.getElementById('cbl-host').shadowRoot.querySelectorAll('.vrow .vname')].map(n => n.textContent)));
  // 칩 클릭 → 설정 저장
  await pg.evaluate(() => document.getElementById('cbl-host').shadowRoot.querySelector('.chip[data-set="dia"][data-kind="chip"]').click());
  await pg.evaluate(() => { const r = document.getElementById('cbl-host').shadowRoot.querySelector('.vrow[data-name="페르"] [data-voice="up"]'); r.click(); r.click(); });
  await pg.waitForTimeout(800);
  console.log('saved settings', await sr(() => localStorage.getItem('gm:cbl:settings:v1')));
  console.log('saved voices', await sr(() => localStorage.getItem('gm:cbl:voices:v1')));
  // Enter 키가 문서로 새지 않는지
  await pg.evaluate(() => { window.__leak = 0; document.addEventListener('keyup', () => window.__leak++); });
  await pg.evaluate(() => document.getElementById('cbl-host').shadowRoot.querySelector('#v').focus());
  await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Enter');
  console.log('key leak count', await sr(() => window.__leak));
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(300);
  console.log('panel after esc', await sr(() => document.getElementById('cbl-host').shadowRoot.querySelectorAll('.pn').length));
  // 끄기
  await pg.click('.cbl-hbtn'); await pg.waitForTimeout(300);
  await pg.evaluate(() => document.getElementById('cbl-host').shadowRoot.querySelector('.sw').click());
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: shot('b2-off-' + THEME) });
  await pg.mouse.click(300, 600); await pg.waitForTimeout(300);
  console.log('btn class off', await sr(() => document.querySelector('.cbl-hbtn').className));

  // 캐릭터 채팅: 일반 글은 대사
  await pg.goto('https://crack.wrtn.ai/characters/ch1/chats/c9');
  await pg.waitForTimeout(1300);
  await pg.evaluate(() => { localStorage.setItem('gm:cbl:settings:v1', JSON.stringify({ on: true })); });
  await pg.reload(); await pg.waitForTimeout(1300);
  await pg.mouse.click(600, 400);
  await pg.evaluate(() => { window.__cblLog = []; window.__done = 0; window.__sim.stream('*웃으며* 안녕하세요 오늘 날씨 좋네요', {}).then(() => (window.__done = 1)); });
  await pg.waitForFunction(() => window.__done === 1, null, { timeout: 30000 });
  for (const e of await pg.evaluate(() => window.__cblLog)) console.log('char', (e.role || e.skip).padEnd(6), (e.speaker || '').padEnd(4), e.result || '', JSON.stringify(e.add));

  // 캐릭터 채팅 말풍선: 상태 코드 → 서술 → 대사, 말풍선이 매번 새로 그려져도 소리가 이어져야 함
  await pg.evaluate(() => { window.__cblLog = []; window.__done = 0; window.__sim.stream('`📍2턴┆2026년 9월 24일┆오후 11시`\n\n*그는 창밖을 내다보았다. 비가 그치지 않았다.*\n\n"오늘은 여기서 쉬어 가자. 내일 다시 출발하면 돼."', { bubbles: true }).then(() => (window.__done = 1)); });
  await pg.waitForFunction(() => window.__done === 1, null, { timeout: 30000 });
  const bub = await pg.evaluate(() => window.__cblLog);
  const played = bub.filter(e => e.result === 'played');
  console.log('bubbles: mute', bub.filter(e => e.role === 'mute').length, 'narr played', played.filter(e => e.role === 'narr').length, 'dia played', played.filter(e => e.role === 'dia').length, 'dump', bub.filter(e => e.skip === 'dump').length);
  console.log(played.length >= 8 && !bub.some(e => e.skip === 'dump') ? '  ✓ 말풍선 채팅도 끝까지 소리' : '  ✗ 말풍선 채팅 소리 끊김');

  // 파티챗: [data-message-item] 목록
  await pg.goto('https://crack.wrtn.ai/stories/s1/parties/p1');
  await pg.waitForTimeout(1300);
  await pg.mouse.click(600, 400);
  await pg.evaluate(() => { window.__cblLog = []; window.__done = 0; window.__sim.stream('**리나 |** "다들 준비됐어? 출발하자!"', { party: true }).then(() => (window.__done = 1)); });
  await pg.waitForFunction(() => window.__done === 1, null, { timeout: 30000 });
  const party = await pg.evaluate(() => window.__cblLog);
  console.log(party.some(e => e.result === 'played' && e.speaker === '리나') ? '  ✓ 파티챗 소리' : '  ✗ 파티챗 무음', JSON.stringify(party.map(e => (e.role || e.skip) + ':' + (e.result || ''))));
  await pg.goto('https://crack.wrtn.ai/stories/s1/parties/new');
  await pg.waitForTimeout(3200);
  console.log((await pg.locator('.cbl-hbtn').count()) === 0 ? '  ✓ 파티 만들기 화면엔 버튼 없음' : '  ✗ 파티 만들기 화면에 버튼');
  await pg.goto('https://crack.wrtn.ai/characters/ch1/chats/c9');
  await pg.waitForTimeout(1300);

  // 잠김 점: 클릭 전에는 주황 점이 보이고, 툴팁은 가리지 않음
  const ctx2 = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx2.route('https://crack.wrtn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html() }));
  await ctx2.addInitScript(`${stub}\ndocument.addEventListener('DOMContentLoaded',()=>{${SIM}\n${SCRIPT}\n});`);
  const pg2 = await ctx2.newPage();
  await pg2.goto('https://crack.wrtn.ai/stories/s1/episodes/c1');
  await pg2.waitForTimeout(1300);
  const dot = await pg2.evaluate(() => { const b = document.querySelector('.cbl-hbtn'); const st = getComputedStyle(b, '::before'); return { cls: b.className, opacity: st.opacity, bg: st.backgroundColor, w: st.width }; });
  console.log(dot.cls.includes('is-locked') && dot.opacity === '1' && dot.w === '7px' ? '  ✓ 잠김 점 보임' : '  ✗ 잠김 점', JSON.stringify(dot));
  await ctx2.close();

  // 모바일 패널
  await pg.setViewportSize({ width: 390, height: 780 });
  await pg.waitForTimeout(300);
  await pg.click('.cbl-hbtn'); await pg.waitForTimeout(400);
  await pg.screenshot({ path: shot('b3-mobile-' + THEME) });
  await browser.close();
})();
