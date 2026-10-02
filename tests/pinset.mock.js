// 핀셋 수정 가짜 크랙 화면 시험 (메시지 저장소·ChatActions·React fiber 흉내)
// 실행: npm i -D playwright 후 node tests/pinset.mock.js   (THEME=light, NOFIBER=1 로 경로 C 시험)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Pinset.user.js'), 'utf8');
const shot = name => path.join(OUT, name + '.png');
const THEME = process.env.THEME || 'dark';
const NOFIBER = process.env.NOFIBER === '1';
const id = n => n.toString(16).padStart(24, '0');
const CHAT = id(0xc0ffee);
const M = n => id(0xa000 + n);

const server = {
  [M(1)]: '[//]: # (ROLE-CHECK: 서윤=존댓말)\n*비가 내리기 시작했다.* 창문에 **빗방울**이 맺혔다.\n\n"오늘은 여기까지만 걸어요."',
  [M(2)]: '주변을 둘러본다',
  [M(3)]: '**아무개 |** 자세한 설명은 이동하면서 드리겠습니다. 여기 계속 서 계시면 곤란해요.\n\n![](https://example.com/a.png)\n\n*아무개는 서류 가방을 고쳐 들었다.*',
  [M(4)]: '따라간다',
  [M(5)]: '첫 번째 답변이다. 이건 안 보인다.',
  [M(6)]: '두 번째 답변이다. 지금 보이는 답변.\n\n"같은 말, 같은 말, 같은 말."',
};
const groups = [[M(1)], [M(2)], [M(3)], [M(4)], [M(5), M(6)]];
const roles = { [M(2)]: 'user', [M(4)]: 'user' };
let failPatch = false;
const calls = [];

const html = () => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--bg_screen:#fff} body[data-theme=dark]{--bg_screen:#141413}
body{margin:0;font-family:sans-serif;background:var(--bg_screen);color:#111;font-size:16px;line-height:1.7} body[data-theme=dark]{color:#eee}
.hdr{height:48px;border-bottom:1px solid #8884;display:flex;align-items:center;padding:0 20px}
.stick-to-bottom{height:calc(100vh - 49px);overflow:auto}
#list{display:flex;flex-direction:column-reverse;gap:28px;max-width:720px;margin:0 auto;padding:24px}
.break-all{display:flex;flex-direction:column;gap:8px} em{opacity:.75} img{width:120px;height:40px;background:#8884;display:block}
.user .wrtn-markdown{border-top:1px solid #8884;border-bottom:1px solid #8884;padding:10px 0}
.acts{font-size:12px;opacity:.5}
</style></head><body data-theme="${THEME}"><div class="hdr group/header">빗속의 서윤</div>
<div class="stick-to-bottom"><div><div id="list"></div></div></div></body></html>`;

const MOCK = `
(() => {
  const NOFIBER = ${NOFIBER};
  const CHAT = '${CHAT}';
  const API = 'https://crack-api.wrtn.ai/crack-gen';
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function inline(t) {
    let h = esc(t);
    h = h.replace(/!\\[[^\\]]*\\]\\(([^)]*)\\)/g, '<img src="$1" alt="">');
    h = h.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    h = h.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    return h;
  }
  function render(src) {
    const kept = src.split('\\n').filter(l => !/^\\s*\\[[^\\]]*\\]:\\s*#/.test(l)).join('\\n');
    return kept.split(/\\n{2,}/).filter(b => b.trim()).map(b => '<p>' + inline(b) + '</p>').join('');
  }
  function xhr(method, url, body) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      x.setRequestHeader('content-type', 'application/json');
      x.onload = () => (x.status < 400 ? resolve(JSON.parse(x.responseText)) : reject(new Error('HTTP ' + x.status)));
      x.onerror = () => reject(new Error('net'));
      x.send(body ? JSON.stringify(body) : null);
    });
  }
  window.__mock = { init(messages, groups, selected) {
    let state = {
      messages: new Map(messages.map(m => [m._id, m])),
      messageGroups: groups.slice().reverse(),
      updateMessage(id, patch) {
        const cur = state.messages.get(id); if (!cur) return;
        const next = new Map(state.messages);
        next.set(id, Object.assign({}, cur, typeof patch === 'function' ? patch(cur) : patch));
        set({ messages: next });
      },
    };
    const listeners = new Set();
    function set(partial) { const prev = state; state = { ...state, ...partial }; listeners.forEach(l => l(state, prev)); }
    const store = { getState: () => state, subscribe: l => { listeners.add(l); return () => listeners.delete(l); } };
    const chatState = { status: 'IDLE', rerollingMessageId: null, selectedMessageId: selected, chatId: CHAT, storyId: 's1' };
    const actions = {
      sendMessage() {}, autoPlay() {}, stopMessage() {}, rerollMessage() {}, removeMessage() {}, setSelectedMessageId() {}, updateStatus() {},
      async updateMessage(e, t) {
        store.getState().updateMessage(e._id, { content: t });
        try { await xhr('PATCH', API + '/v3/chats/' + CHAT + '/messages/' + e._id, { message: t }); }
        catch (err) { store.getState().updateMessage(e._id, e); window.__crackToast = String(err); }
      },
      async resyncMessage(id) { const r = await xhr('GET', API + '/v3/chats/' + CHAT + '/messages/' + id); store.getState().updateMessage(id, r.data); },
    };
    window.__store = store; window.__actions = actions; window.__chatState = chatState;
    const KEY = '__reactFiber$mock1';
    const fState = { memoizedProps: { value: chatState }, return: null };
    const fActions = { memoizedProps: { value: actions }, return: fState };
    const fStore = { memoizedProps: { value: store }, return: fActions };
    const fList = { memoizedProps: { className: 'list' }, return: fStore };
    const list = document.getElementById('list');
    if (!NOFIBER) list[KEY] = fList;
    const mdFibers = new Map();
    function shownId(ids) { const i = ids.indexOf(chatState.selectedMessageId); return ids[i >= 0 ? i : ids.length - 1]; }
    for (const ids of groups) {
      const g = document.createElement('div');
      g.className = 'w-full'; g.dataset.messageGroupId = ids[0];
      const msg = state.messages.get(shownId(ids));
      if (msg.role === 'user') g.classList.add('user');
      g.innerHTML = '<div class="flex flex-col"><div class="break-all"><div class="wrtn-markdown"></div><div class="acts">메시지 옵션</div></div></div>';
      const md = g.querySelector('.wrtn-markdown');
      const fGroup = { memoizedProps: { 'data-message-group-id': ids[0] }, return: fList };
      const fIv = { memoizedProps: { messageIds: ids, isLastMessage: false }, return: fGroup };
      const fMd = { memoizedProps: { content: msg.content, isUserMessage: msg.role === 'user' }, return: fIv };
      if (!NOFIBER) { g[KEY] = fGroup; md[KEY] = fMd; }
      mdFibers.set(md, { fMd, ids });
      md.innerHTML = render(msg.content);
      list.prepend(g);
    }
    store.subscribe(s => {
      for (const [md, { fMd, ids }] of mdFibers) {
        const m = s.messages.get(shownId(ids));
        if (m && m.content !== fMd.memoizedProps.content) { fMd.memoizedProps = { ...fMd.memoizedProps, content: m.content }; md.innerHTML = render(m.content); }
      }
    });
  } };
})();`;

const stub = `(()=>{const P='gm:';window.GM_getValue=(k,d)=>{const v=localStorage.getItem(P+k);return v==null?d:JSON.parse(v)};window.GM_setValue=(k,v)=>localStorage.setItem(P+k,JSON.stringify(v));window.GM_deleteValue=k=>localStorage.removeItem(P+k);window.unsafeWindow=window;})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addCookies([{ name: 'access_token', value: 'test-token', domain: 'crack.wrtn.ai', path: '/' }]);
  const cors = { 'access-control-allow-origin': 'https://crack.wrtn.ai', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,platform,wrtn-locale,accept,content-type', 'access-control-allow-methods': 'GET,PATCH,OPTIONS' };
  await ctx.route('https://crack-api.wrtn.ai/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const m = u.pathname.match(/\/messages\/([a-f0-9]{24})$/);
    calls.push(req.method() + ' ' + u.pathname.replace('/crack-gen', '') + (req.method() === 'PATCH' ? ' ' + req.postData().slice(0, 60) : ''));
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!m || !(m[1] in server)) return json(404, { result: 'FAIL' });
    if (req.method() === 'PATCH') {
      if (failPatch) return json(500, { result: 'FAIL', message: '서버 점검 중' });
      server[m[1]] = JSON.parse(req.postData()).message;
    }
    return json(200, { result: 'SUCCESS', data: { _id: m[1], chatId: CHAT, role: roles[m[1]] || 'assistant', content: server[m[1]], status: 'done' } });
  });
  await ctx.route('https://example.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
  await ctx.route('https://crack.wrtn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html() }));
  await ctx.addInitScript(`${stub}\ndocument.addEventListener('DOMContentLoaded',()=>{${MOCK}\nwindow.__mock.init(${JSON.stringify(Object.keys(server).map(k => ({ _id: k, chatId: CHAT, role: roles[k] || 'assistant', content: server[k] })))}, ${JSON.stringify(groups)}, '${M(6)}');\n${SCRIPT}\n});`);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => console.log('[pageerror]', e.message));
  pg.on('console', msg => { if (['error', 'warning'].includes(msg.type())) console.log('[console]', msg.type(), msg.text()); });
  await pg.goto(`https://crack.wrtn.ai/stories/s1/episodes/${CHAT}`);
  await pg.waitForTimeout(900);
  const sr = fn => pg.evaluate(fn);
  const shadow = sel => `#cpn-host >>> ${sel}`;
  console.log('diag', JSON.stringify(await sr(() => window.CrackPinset.diag()), null, 0));

  // 선택 도우미: 메시지 n 의 화면 글자 중 needle 을 선택하고 pointerup
  const select = async (gid, needle, occurrence = 0) => {
    const ok = await pg.evaluate(({ gid, needle, occurrence }) => {
      const md = document.querySelector(`[data-message-group-id="${gid}"] .wrtn-markdown`);
      const w = document.createTreeWalker(md, NodeFilter.SHOW_TEXT); const nodes = []; let text = '';
      for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, text.length]); text += n.nodeValue; }
      let at = -1; for (let k = 0; k <= occurrence; k++) at = text.indexOf(needle, at + 1);
      if (at < 0) return 'not found: ' + text;
      const loc = p => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= p) return [nodes[i][0], p - nodes[i][1]]; };
      const r = document.createRange(); const [sn, so] = loc(at); const [en, eo] = loc(at + needle.length);
      r.setStart(sn, so); r.setEnd(en, eo);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      const rect = r.getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.right, clientY: rect.bottom }));
      return true;
    }, { gid, needle, occurrence });
    if (ok !== true) console.log('SELECT FAIL', ok);
    await pg.waitForTimeout(150);
  };
  const tb = () => pg.evaluate(() => !!document.getElementById('cpn-host')?.shadowRoot.querySelector('.tb'));
  const clickShadow = sel => pg.evaluate(sel => document.getElementById('cpn-host').shadowRoot.querySelector(sel).click(), sel);
  const toastText = () => pg.evaluate(() => document.getElementById('cpn-host')?.shadowRoot.querySelector('.toast')?.innerText || '');
  const hl = () => pg.evaluate(() => ({ edit: CSS.highlights.get('cpn-edit')?.size || 0, cut: CSS.highlights.get('cpn-cut')?.size || 0, text: [...(CSS.highlights.get('cpn-edit') || [])].map(r => r.toString()) }));

  // 1) 라벨 문단 일부 고치기
  await select(M(3), '자세한 설명은');
  console.log('toolbar shown', await tb());
  await pg.screenshot({ path: shot('p1-toolbar-' + THEME) });
  await clickShadow('.tb [data-act="edit"]');
  await pg.waitForTimeout(250);
  console.log('editor oldText', await pg.evaluate(() => document.getElementById('cpn-host').shadowRoot.querySelector('textarea').value));
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('간단한 설명은');
  await pg.screenshot({ path: shot('p2-editor-' + THEME) });
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(700);
  console.log('toast:', await toastText());
  console.log('server M3:', JSON.stringify(server[M(3)]));
  console.log('store M3 eq server:', await pg.evaluate(id => window.__store.getState().messages.get(id).content, M(3)) === server[M(3)]);
  console.log('highlights', JSON.stringify(await hl()));
  console.log('badges', await sr(() => [...document.querySelectorAll('.cpn-badge')].map(b => b.dataset.id.slice(-4) + ':' + b.textContent)));
  await pg.screenshot({ path: shot('p3-after-' + THEME) });

  // 2) 서식 경계를 넘는 선택 (기울임 → 일반 → 굵게)
  await select(M(1), '시작했다. 창문에 빗');
  await clickShadow('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
  console.log('editor oldText 2', JSON.stringify(await pg.evaluate(() => document.getElementById('cpn-host').shadowRoot.querySelector('textarea').value)));
  await pg.keyboard.press('Control+A'); await pg.keyboard.type('멈췄다. 하늘에 햇');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  console.log('server M1:', JSON.stringify(server[M(1)]));
  console.log('rendered M1:', await pg.evaluate(id => document.querySelector(`[data-message-group-id="${id}"] .wrtn-markdown`).innerHTML, M(1)));
  console.log('highlights', JSON.stringify(await hl()));

  // 3) 지우기 (굵은 단어 통째로)
  await select(M(1), '방울');
  await clickShadow('.tb [data-act="erase"]'); await pg.waitForTimeout(700);
  console.log('server M1 after erase:', JSON.stringify(server[M(1)]), 'toast:', await toastText());
  console.log('highlights', JSON.stringify(await hl()));
  // 토스트의 되돌리기
  await pg.evaluate(() => [...document.getElementById('cpn-host').shadowRoot.querySelectorAll('.toast button')].find(b => b.textContent === '되돌리기')?.click());
  await pg.waitForTimeout(800);
  console.log('server M1 after undo:', JSON.stringify(server[M(1)]), 'toast:', await toastText());

  // 4) 답변 비교 그룹: 보이는 답변(M6) 반복 구절 중 두 번째 고치기
  await select(M(5), '같은 말', 1);
  await clickShadow('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Control+A'); await pg.keyboard.type('다른 말');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  console.log('server M5:', JSON.stringify(server[M(5)]), '\nserver M6:', JSON.stringify(server[M(6)]));

  // 5) 크랙 수정창으로 고친 것 기록 (크랙 내부 updateMessage 직접 호출)
  await pg.evaluate(id => { const m = window.__store.getState().messages.get(id); return window.__actions.updateMessage(m, m.content.replace('주변을 둘러본다', '주변을 천천히 둘러본다')); }, M(2));
  await pg.waitForTimeout(800);
  console.log('records', JSON.stringify(Object.fromEntries(Object.entries(await sr(() => window.CrackPinset.records())).map(([k, v]) => [k.slice(-4), { edits: v.edits.map(e => e.kind + ':' + e.before + '→' + e.after), spans: v.spans }]))));
  console.log('highlights', JSON.stringify(await hl()));

  // 6) 흔적 창 열기 → 스크린샷 → 처음 글로
  await pg.evaluate(id => document.querySelector(`[data-message-group-id="${id}"] .cpn-badge`).click(), M(1));
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: shot('p4-trace-' + THEME) });
  await clickShadow('[data-act="restore"]'); await pg.waitForTimeout(800);
  console.log('server M1 restored:', JSON.stringify(server[M(1)]), 'toast:', await toastText());

  // 7) 실패 → 롤백
  failPatch = true;
  await select(M(3), '곤란해요');
  await clickShadow('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Control+A'); await pg.keyboard.type('괜찮아요'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
  console.log('fail toast:', await toastText(), '| store M3 has 곤란해요:', (await pg.evaluate(id => window.__store.getState().messages.get(id).content, M(3))).includes('곤란해요'));
  await pg.keyboard.press('Escape');
  failPatch = false;

  // 8) 흔적 칠한 글자 클릭 → 흔적 창
  await pg.evaluate(() => getSelection().removeAllRanges());
  const pt = await pg.evaluate(() => { const r = [...CSS.highlights.get('cpn-edit')][0]; r.startContainer.parentElement.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left + 4, y: b.top + b.height / 2, text: r.toString(), hits: 0 }; });
  console.log('click target', JSON.stringify(pt), await pg.evaluate(p => { const el = document.elementFromPoint(p.x, p.y); const c = document.caretRangeFromPoint(p.x, p.y); const r = [...CSS.highlights.get('cpn-edit')][0]; return [el?.tagName, el?.className, c?.startContainer?.nodeValue?.slice(0, 20), c?.startOffset, r.isPointInRange(c.startContainer, c.startOffset)]; }, pt));
  await pg.waitForTimeout(400);
  await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(300);
  console.log('trace by click:', await pg.evaluate(() => document.getElementById('cpn-host').shadowRoot.querySelector('.pop .hd b')?.textContent));
  await pg.keyboard.press('Escape');

  // 9) 원문 전체 고치기
  await select(M(3), '서류 가방');
  await clickShadow('.tb [data-act="source"]'); await pg.waitForTimeout(250);
  const selInArea = await pg.evaluate(() => { const a = document.getElementById('cpn-host').shadowRoot.querySelector('textarea'); return a.value.slice(a.selectionStart, a.selectionEnd); });
  console.log('source editor selection:', JSON.stringify(selInArea));
  await pg.screenshot({ path: shot('p5-source-' + THEME) });
  await pg.evaluate(() => { const a = document.getElementById('cpn-host').shadowRoot.querySelector('textarea'); a.setRangeText('여행 가방'); a.dispatchEvent(new Event('input')); });
  await pg.keyboard.press('Control+Enter'); await pg.waitForTimeout(700);
  console.log('server M3 after source:', JSON.stringify(server[M(3)]));

  // 10) 다른 곳에서 바뀜 → 어긋남 배지
  await pg.evaluate(id => { window.__store.getState().updateMessage(id, { content: '완전히 다른 글' }); }, M(3));
  await pg.waitForTimeout(600);
  console.log('badges', await sr(() => [...document.querySelectorAll('.cpn-badge')].map(b => b.dataset.id.slice(-4) + ':' + b.textContent)));

  // 11) Enter 키가 문서로 새는지
  await pg.evaluate(() => { window.__leak = 0; document.addEventListener('keyup', e => { if (e.key === 'Enter') window.__leak++; }); });
  await select(M(1), '맺혔다');
  await clickShadow('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Escape');
  console.log('enter leak', await sr(() => window.__leak), 'calls', calls.length);
  await pg.setViewportSize({ width: 390, height: 800 });
  await select(M(1), '여기까지만');
  await pg.waitForTimeout(100);
  await clickShadow('.tb [data-act="edit"]'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: shot('p6-mobile-' + THEME) });
  console.log('calls:\n  ' + calls.join('\n  '));
  await browser.close();
})();
