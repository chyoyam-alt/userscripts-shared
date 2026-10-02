// 핀셋 수정 가짜 크랙 화면 시험 (메시지 저장소·ChatActions·React fiber 흉내)
// 실행: npm i -D playwright 후 node tests/pinset.mock.js   (THEME=light 로 밝은 화면)
// 시나리오: story(스토리 채팅, 경로 A1) · character(문단별 말풍선) · nofiber(경로 C) · storeless(fiber는 있는데 저장소 없음)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'Pinset.user.js'), 'utf8');
const shot = name => path.join(OUT, name + '.png');
const THEME = process.env.THEME || 'dark';
const ONLY = process.env.ONLY || '';
const id = n => n.toString(16).padStart(24, '0');
const M = n => id(0xa000 + n);
let failures = 0;
const check = (label, ok, extra = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${extra ? ' — ' + extra : ''}`);
};

const html = () => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--bg_screen:#fff} body[data-theme=dark]{--bg_screen:#141413}
body{margin:0;font-family:sans-serif;background:var(--bg_screen);color:#111;font-size:16px;line-height:1.7} body[data-theme=dark]{color:#eee}
.hdr{height:48px;border-bottom:1px solid #8884;display:flex;align-items:center;padding:0 20px}
.stick-to-bottom{height:calc(100vh - 49px);overflow:auto}
#list{display:flex;flex-direction:column-reverse;gap:28px;max-width:720px;margin:0 auto;padding:24px}
.break-all{display:flex;flex-direction:column;gap:8px} em{opacity:.75} img{width:120px;height:40px;background:#8884;display:block}
.user .wrtn-markdown{border-top:1px solid #8884;border-bottom:1px solid #8884;padding:10px 0}
.bubble{background:#8882;border-radius:0 16px 16px 16px;padding:10px 14px;width:fit-content;max-width:640px}
.acts{font-size:12px;opacity:.5}
</style></head><body data-theme="${THEME}"><div class="hdr group/header">테스트 방</div>
<div class="stick-to-bottom"><div><div id="list"></div></div></div></body></html>`;

// 크랙 렌더러 흉내: 링크 정의 줄 숨김, HTML 주석은 글자 그대로, 목록·인용·제목·링크·문자 참조·이스케이프, 공백 옆 * 는 서식이 안 됨
const MOCK = String.raw`
(() => {
  const API = 'https://crack-api.wrtn.ai/crack-gen';
  const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&quot;': '"' };
  const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  function inline(t) {
    t = t.replace(/&(amp|lt|gt|nbsp|quot);/g, m => '\u0001' + Object.keys(ENT).indexOf(m) + '\u0002');
    t = t.replace(/\\([*_\\[\]])/g, (m, c) => '\u0003' + c.charCodeAt(0) + '\u0004');
    let h = esc(t);
    h = h.replace(/!\[[^\]]*\]\(([^)]*)\)/g, '<img src="$1" alt="">');
    h = h.replace(/\[([^\]]+)\]\(([^)]*)\)/g, '<a href="$2">$1</a>');
    h = h.replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>');
    h = h.replace(/\u0001(\d)\u0002/g, (m, i) => esc(ENT[Object.keys(ENT)[i]]));
    h = h.replace(/\u0003(\d+)\u0004/g, (m, c) => esc(String.fromCharCode(+c)));
    return h;
  }
  const LINKDEF = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<[^>\n]*>|[^\s<>]+)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?[ \t]*$/;
  function block(b) {
    const lines = b.split('\n');
    if (lines.every(l => /^- /.test(l))) return '<ul>' + lines.map(l => '<li>' + inline(l.slice(2)) + '</li>').join('') + '</ul>';
    if (lines.every(l => /^\d+\. /.test(l))) return '<ol>' + lines.map(l => '<li>' + inline(l.replace(/^\d+\. /, '')) + '</li>').join('') + '</ol>';
    if (lines.every(l => /^>/.test(l))) return '<blockquote><p>' + inline(lines.map(l => l.replace(/^> ?/, '')).join('\n')) + '</p></blockquote>';
    const hm = /^(#{1,6}) (.*)$/.exec(b);
    if (hm && lines.length === 1) return '<h3>' + inline(hm[2]) + '</h3>';
    return '<p>' + inline(b) + '</p>';
  }
  function render(src) {
    const kept = src.split('\n').filter(l => !LINKDEF.test(l)).join('\n');
    return kept.split(/\n{2,}/).filter(b => b.trim()).map(block).join('');
  }
  // 캐릭터 채팅: 이미지 먼저, 나머지는 빈 줄마다 말풍선 하나
  function segments(src) {
    const imgs = src.match(/!\[[^\]]*\]\([^)]*\)/g) || [];
    const rest = src.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
    return imgs.concat(rest.split('\n\n').map(x => x.trim()).filter(Boolean));
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
  window.__mock = { init(cfg) {
    const { chat, kind, messages, groups, selected, show = {}, nofiber, storeless } = cfg;
    const base = kind === 'character' ? '/character-chats/' : '/v3/chats/';
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
    const chatState = { status: 'IDLE', rerollingMessageId: null, selectedMessageId: selected, chatId: chat, storyId: 's1', isEdit: false, messageToEdit: null };
    const actions = {
      sendMessage() {}, autoPlay() {}, stopMessage() {}, rerollMessage() {}, removeMessage() {}, setSelectedMessageId() {}, updateStatus() {},
      async updateMessage(e, t) {
        store.getState().updateMessage(e._id, { content: t });
        try { await xhr('PATCH', API + base + chat + '/messages/' + e._id, { message: t }); }
        catch (err) { store.getState().updateMessage(e._id, e); window.__crackToast = String(err); }
      },
      async resyncMessage(id) { const r = await xhr('GET', API + base + chat + '/messages/' + id); store.getState().updateMessage(id, r.data); },
    };
    window.__store = store; window.__actions = actions; window.__chatState = chatState;
    const KEY = '__reactFiber$mock1';
    const fState = { memoizedProps: { value: chatState }, return: null };
    const fActions = { memoizedProps: { value: storeless ? {} : actions }, return: fState };
    const fStore = { memoizedProps: { value: storeless ? { notAStore: true } : store }, return: fActions };
    const fList = { memoizedProps: { className: 'list' }, return: fStore };
    const list = document.getElementById('list');
    if (!nofiber) list[KEY] = fList;
    const views = [];
    function shownId(ids) {
      if (show[ids[0]] !== undefined) return ids[show[ids[0]]];
      const i = ids.indexOf(chatState.selectedMessageId); return ids[i >= 0 ? i : ids.length - 1];
    }
    function paintGroup(v) {
      const msg = state.messages.get(shownId(v.ids));
      v.content = msg.content;
      v.body.innerHTML = '';
      const parts = kind === 'character' && msg.role !== 'user' ? segments(msg.content) : [msg.content];
      for (const part of parts) {
        const md = document.createElement('div');
        md.className = 'wrtn-markdown';
        const wrap = kind === 'character' ? Object.assign(document.createElement('div'), { className: 'bubble' }) : null;
        md.innerHTML = render(part);
        if (!nofiber) md[KEY] = { memoizedProps: { content: part, isUserMessage: msg.role === 'user' }, return: v.fIv };
        (wrap || v.body).append(md);
        if (wrap) v.body.append(wrap);
      }
    }
    for (const ids of groups) {
      const g = document.createElement('div');
      g.className = 'w-full'; g.dataset.messageGroupId = ids[0];
      if (state.messages.get(shownId(ids)).role === 'user') g.classList.add('user');
      // 크랙 MessageV2 처럼 본문 칸이 click 전파를 막습니다.
      g.innerHTML = '<div class="flex flex-col"><div class="stopper"><div class="break-all"></div><div class="acts">메시지 옵션</div></div></div>';
      g.querySelector('.stopper').addEventListener('click', e => e.stopPropagation());
      const fGroup = { memoizedProps: { 'data-message-group-id': ids[0] }, return: fList };
      const fIv = { memoizedProps: { messageIds: ids, isLastMessage: false }, return: fGroup };
      if (!nofiber) g[KEY] = fGroup;
      const v = { ids, fIv, body: g.querySelector('.break-all'), content: null };
      views.push(v);
      paintGroup(v);
      list.prepend(g);
    }
    store.subscribe(s => {
      for (const v of views) {
        const m = s.messages.get(shownId(v.ids));
        if (m && m.content !== v.content) paintGroup(v);
      }
    });
  } };
})();`;

const stub = `(()=>{const P='gm:';window.GM_getValue=(k,d)=>{const v=localStorage.getItem(P+k);return v==null?d:JSON.parse(v)};window.GM_setValue=(k,v)=>localStorage.setItem(P+k,JSON.stringify(v));window.GM_deleteValue=k=>localStorage.removeItem(P+k);window.unsafeWindow=window;})();`;

async function scenario(browser, cfg, body) {
  if (ONLY && ONLY !== cfg.name) return;
  console.log(`\n=== ${cfg.name} ===`);
  const server = Object.fromEntries(cfg.messages.map(m => [m._id, m.content]));
  const net = { failPatch: false, delay: 0, calls: [] };
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await ctx.addCookies([{ name: 'access_token', value: 'test-token', domain: 'crack.wrtn.ai', path: '/' }]);
  const cors = { 'access-control-allow-origin': 'https://crack.wrtn.ai', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,platform,wrtn-locale,accept,content-type', 'access-control-allow-methods': 'GET,PATCH,OPTIONS' };
  await ctx.route('https://crack-api.wrtn.ai/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const u = new URL(req.url());
    const m = u.pathname.match(/\/messages\/([a-f0-9]{24})$/);
    net.calls.push(req.method() + ' ' + u.pathname.replace('/crack-gen', ''));
    const json = (status, b) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(b) });
    if (!m || !(m[1] in server)) return json(404, { result: 'FAIL' });
    if (req.method() === 'PATCH') {
      if (net.delay) await new Promise(r => setTimeout(r, net.delay));
      if (net.failPatch) return json(500, { result: 'FAIL', message: '서버 점검 중' });
      server[m[1]] = JSON.parse(req.postData()).message;
    }
    const role = cfg.messages.find(x => x._id === m[1]).role;
    return json(200, { result: 'SUCCESS', data: { _id: m[1], chatId: cfg.chat, role, content: server[m[1]], status: 'done' } });
  });
  await ctx.route('https://example.com/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
  await ctx.route('https://crack.wrtn.ai/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: html() }));
  await ctx.addInitScript(`${stub}\ndocument.addEventListener('DOMContentLoaded',()=>{${MOCK}\nwindow.__mock.init(${JSON.stringify(cfg)});\n${SCRIPT}\n});`);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { failures += 1; console.log('  [pageerror]', e.message); });
  pg.on('console', msg => { if (msg.type() === 'error' && !/status of 500/.test(msg.text())) console.log('  [console]', msg.text()); });
  await pg.goto(cfg.url);
  await pg.waitForTimeout(900);
  const T = {
    pg, server, net,
    async select(gid, needle, occurrence = 0) {
      const ok = await pg.evaluate(({ gid, needle, occurrence }) => {
        const g = document.querySelector(`[data-message-group-id="${gid}"]`);
        const nodes = []; let text = '';
        for (const md of g.querySelectorAll('.wrtn-markdown')) {
          const w = document.createTreeWalker(md, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push([n, text.length]); text += n.nodeValue; }
        }
        let at = -1; for (let k = 0; k <= occurrence; k++) at = text.indexOf(needle, at + 1);
        if (at < 0) return 'not found in: ' + text;
        const loc = (p, end) => { for (let i = nodes.length - 1; i >= 0; i--) if (end ? nodes[i][1] < p : nodes[i][1] <= p) return [nodes[i][0], p - nodes[i][1]]; };
        const r = document.createRange(); const [sn, so] = loc(at, false); const [en, eo] = loc(at + needle.length, true);
        r.setStart(sn, so); r.setEnd(en, eo);
        r.startContainer.parentElement.scrollIntoView({ block: 'center' });
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        const rect = r.getBoundingClientRect();
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.right, clientY: rect.bottom }));
        return true;
      }, { gid, needle, occurrence });
      if (ok !== true) { failures += 1; console.log('  SELECT FAIL', ok); }
      await pg.waitForTimeout(150);
    },
    click: sel => pg.evaluate(sel => document.getElementById('cpn-host').shadowRoot.querySelector(sel)?.click(), sel),
    area: () => pg.evaluate(() => document.getElementById('cpn-host').shadowRoot.querySelector('textarea')?.value ?? null),
    toast: () => pg.evaluate(() => document.getElementById('cpn-host')?.shadowRoot.querySelector('.toast')?.innerText.replace(/\n/g, ' ') || ''),
    pop: () => pg.evaluate(() => document.getElementById('cpn-host')?.shadowRoot.querySelector('.pop .hd b')?.textContent || ''),
    hl: () => pg.evaluate(() => ({ edit: [...(CSS.highlights.get('cpn-edit') || [])].map(r => r.toString()), cut: CSS.highlights.get('cpn-cut')?.size || 0 })),
    badges: () => pg.evaluate(() => [...document.querySelectorAll('.cpn-badge')].map(b => b.dataset.id.slice(-2) + ':' + b.textContent)),
    records: () => pg.evaluate(() => window.CrackPinset.records()),
    async edit(gid, needle, text, occurrence = 0) {
      await this.select(gid, needle, occurrence);
      await this.click('.tb [data-act="edit"]');
      await pg.waitForTimeout(200);
      await pg.keyboard.press('Control+A');
      if (text) await pg.keyboard.type(text); else await pg.keyboard.press('Backspace');
      await pg.keyboard.press('Enter');
      await pg.waitForTimeout(700);
    },
    async erase(gid, needle, occurrence = 0) {
      await this.select(gid, needle, occurrence);
      await this.click('.tb [data-act="erase"]');
      await pg.waitForTimeout(700);
    },
    async undoToast() {
      await pg.evaluate(() => [...document.getElementById('cpn-host').shadowRoot.querySelectorAll('.toast button')].find(b => b.textContent === '되돌리기')?.click());
      await pg.waitForTimeout(800);
    },
  };
  try {
    await body(T);
  } catch (error) {
    failures += 1;
    console.log('  EXCEPTION', error.message);
  }
  console.log('  calls:', net.calls.length);
  await ctx.close();
}

const CHAT = id(0xc0ffee);
const CHAT2 = id(0xbeef01);
const msg = (n, content, role = 'assistant', chat = CHAT) => ({ _id: M(n), chatId: chat, role, content });

(async () => {
  const browser = await chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });

  const story = {
    name: 'story', chat: CHAT, kind: 'story', url: `https://crack.wrtn.ai/stories/s1/episodes/${CHAT}`, selected: M(6),
    messages: [
      msg(1, '[//]: # (ROLE-CHECK: 서윤=존댓말)\n*비가 내리기 시작했다.* 창문에 **빗방울**이 맺혔다.\n\n"오늘은 여기까지만 걸어요."'),
      msg(2, '주변을 둘러본다', 'user'),
      msg(3, '**아무개 |** 자세한 설명은 이동하면서 드리겠습니다. 여기 계속 서 계시면 곤란해요.\n\n![](https://example.com/a.png)\n\n*아무개는 서류 가방을 고쳐 들었다.*'),
      msg(5, '첫 번째 답변이다. 이건 안 보인다.'),
      msg(6, '두 번째 답변이다. 지금 보이는 답변.\n\n"같은 말, 같은 말, 같은 말."'),
      msg(7, '*그녀는 웃었다. 그리고 떠났다.*'),
      msg(8, '*첫 문장이다.* 둘째 문장이다.'),
      msg(9, '목록이다.\n\n- 첫째 항목\n- 둘째 항목'),
      msg(10, '[링크](http://a.com) 다음 글'),
      msg(11, 'Tom &amp; Jerry 놀이'),
      msg(12, '[//]: <> (서윤은 화가 났다. 오늘은 비)\n\n서윤은 화가 났다. 오늘은 비가 왔다.'),
      msg(13, '<!-- 메모 -->\n\n서윤은 웃었다.'),
    ],
    groups: [[M(1)], [M(2)], [M(3)], [M(5), M(6)], [M(7)], [M(8)], [M(9)], [M(10)], [M(11)], [M(12)], [M(13)]],
  };
  await scenario(browser, story, async T => {
    const { pg, server } = T;
    const diag = await pg.evaluate(() => window.CrackPinset.diag());
    check('diag: fiber·actions·store·state', diag.fiber && diag.actions && diag.store && diag.chatState, JSON.stringify(diag.firstMessage));

    await T.select(M(3), '자세한 설명은');
    check('막대가 뜸', await pg.evaluate(() => !!document.getElementById('cpn-host')?.shadowRoot.querySelector('.tb')));
    await pg.screenshot({ path: shot('p1-toolbar-' + THEME) });
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
    check('편집 창에 선택 글', (await T.area()) === '자세한 설명은');
    await pg.keyboard.press('Control+A'); await pg.keyboard.type('간단한 설명은');
    await pg.screenshot({ path: shot('p2-editor-' + THEME) });
    await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
    check('라벨 문단 일부 고치기', server[M(3)].startsWith('**아무개 |** 간단한 설명은 이동하면서'), server[M(3)].slice(0, 30));
    check('분홍 칠(바뀐 글자만)', JSON.stringify((await T.hl()).edit) === '["간단"]', JSON.stringify((await T.hl()).edit));

    await T.edit(M(1), '시작했다. 창문에 빗', '멈췄다. 하늘에 햇');
    check('서식 넘나드는 선택', server[M(1)].includes('*비가 내리기 멈췄다. 하늘에 햇***방울**이'), JSON.stringify(server[M(1)].split('\n')[1]));
    check('숨김 주석 줄 유지', server[M(1)].startsWith('[//]: # (ROLE-CHECK: 서윤=존댓말)\n'));

    await T.erase(M(1), '방울');
    check('굵은 단어 통째로 지우기', server[M(1)].includes('햇*이 맺혔다'), JSON.stringify(server[M(1)].split('\n')[1]));
    await T.undoToast();
    check('알림의 되돌리기', server[M(1)].includes('햇***방울**이'));

    await T.edit(M(5), '같은 말', '다른 말', 1);
    check('답변 비교 그룹: 보이는 답변의 두 번째 구절만', server[M(6)].includes('"같은 말, 다른 말, 같은 말."') && server[M(5)] === '첫 번째 답변이다. 이건 안 보인다.');

    await T.erase(M(7), '그리고 떠났다.');
    check('기울임 끝부분 지우기 → *글.*', server[M(7)] === '*그녀는 웃었다.*', JSON.stringify(server[M(7)]));
    await T.undoToast();
    await T.erase(M(7), '그녀는 웃었다.');
    check('기울임 앞부분 지우기 → *글.*', server[M(7)] === '*그리고 떠났다.*', JSON.stringify(server[M(7)]));
    await T.erase(M(8), '첫 문장이다.');
    check('기울임 문장 통째로 지우기', server[M(8)] === '둘째 문장이다.', JSON.stringify(server[M(8)]));

    await T.select(M(9), '항목둘째');
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
    const listOld = await T.area();
    await pg.keyboard.press('End'); await pg.keyboard.press('Backspace'); await pg.keyboard.press('Backspace');
    await pg.keyboard.type('두번째'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
    check('목록 두 항목에 걸친 선택, 한 단어만 바뀜', server[M(9)] === '목록이다.\n\n- 첫째 항목\n- 두번째 항목', JSON.stringify(listOld) + ' → ' + JSON.stringify(server[M(9)]));
    await T.edit(M(9), '항목두번째', '것들');
    check('목록 기호가 끼면 원문 창으로', (await T.pop()).startsWith('원문 고치기') && server[M(9)].endsWith('- 두번째 항목'), await T.toast());
    await pg.keyboard.press('Escape');

    await T.select(M(10), '링크 다음');
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
    await pg.keyboard.press('Control+A'); await pg.keyboard.type('링크 그 다음'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
    check('링크 뒤에 글 넣기', server[M(10)] === '[링크](http://a.com) 그 다음 글', JSON.stringify(server[M(10)]));

    await T.edit(M(11), 'Tom & Jerry', 'Tim & Jerry');
    check('문자 참조(&amp;)는 원문 창으로', (await T.pop()).startsWith('원문 고치기') && server[M(11)] === 'Tom &amp; Jerry 놀이');
    await pg.keyboard.press('Escape');

    await T.edit(M(12), '화가 났다', '기분이 좋았다');
    check('[//]: <> 주석은 그대로, 보이는 글만', server[M(12)] === '[//]: <> (서윤은 화가 났다. 오늘은 비)\n\n서윤은 기분이 좋았다. 오늘은 비가 왔다.', JSON.stringify(server[M(12)]));
    await T.edit(M(13), '웃었다', '울었다');
    check('글자 그대로 보이는 HTML 주석', server[M(13)] === '<!-- 메모 -->\n\n서윤은 울었다.', JSON.stringify(server[M(13)]));

    // 크랙 수정창으로 고친 것 기록
    await pg.evaluate(id => { const m = window.__store.getState().messages.get(id); return window.__actions.updateMessage(m, m.content.replace('둘러본다', '천천히 둘러본다')); }, M(2));
    await pg.waitForTimeout(800);
    const rec2 = (await T.records())[M(2)];
    check('크랙 수정창 기록', rec2 && rec2.edits[0].kind === 'native' && rec2.edits[0].after === '천천히 ');

    // 다른 곳에서 바뀐 뒤 다시 핀셋 → 되돌리기는 그 뒤 것만
    await pg.evaluate(id => { window.__store.getState().updateMessage(id, { content: '주변을 천천히 둘러본다\n\n다른 기기에서 쓴 문단.' }); }, M(2));
    server[M(2)] = '주변을 천천히 둘러본다\n\n다른 기기에서 쓴 문단.';
    await pg.waitForTimeout(500);
    check('어긋남 배지', (await T.badges()).some(b => b.includes('어긋남')));
    await T.edit(M(2), '주변을', '사방을');
    const rec2b = (await T.records())[M(2)];
    check('재시작한 기록(rebased)', rec2b && rec2b.rebased && rec2b.edits.filter(e => e.prev).length === 1);
    await pg.evaluate(id => document.querySelector(`[data-message-group-id="${id}"] .cpn-badge`).click(), M(2)); await pg.waitForTimeout(300);
    await T.click('[data-act="undo"]'); await pg.waitForTimeout(800);
    const rec2c = (await T.records())[M(2)];
    check('되돌리기 1번 뒤 남이 쓴 문단 유지', server[M(2)] === '주변을 천천히 둘러본다\n\n다른 기기에서 쓴 문단.', JSON.stringify(server[M(2)]));
    check('더 되돌릴 수 없음', !rec2c || !rec2c.edits.some(e => e.prev));

    // 흔적 창 → 처음 글로 (느리게 실패) → 기록이 남아야 함
    await T.edit(M(8), '둘째', '셋째');
    T.net.delay = 1200; T.net.failPatch = true;
    await pg.evaluate(id => document.querySelector(`[data-message-group-id="${id}"] .cpn-badge`).click(), M(8)); await pg.waitForTimeout(300);
    await pg.screenshot({ path: shot('p4-trace-' + THEME) });
    await T.click('[data-act="restore"]'); await pg.waitForTimeout(2200);
    check('느린 실패 뒤에도 기록 유지', !!(await T.records())[M(8)], await T.toast());
    T.net.delay = 0; T.net.failPatch = false;
    await pg.keyboard.press('Escape');

    // 크랙이 click 전파를 막아도 분홍 글자를 누르면 흔적 창
    await pg.evaluate(() => getSelection().removeAllRanges());
    const pt = await pg.evaluate(id => { const r = [...CSS.highlights.get('cpn-edit')].find(x => x.startContainer.parentElement.closest(`[data-message-group-id="${id}"]`)); r.startContainer.parentElement.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.left + 3, y: b.top + b.height / 2 }; }, M(3));
    await pg.waitForTimeout(300);
    await pg.mouse.click(pt.x, pt.y); await pg.waitForTimeout(300);
    check('분홍 글자 클릭 → 흔적 창', (await T.pop()).startsWith('수정 흔적'));
    await pg.keyboard.press('Escape');

    // 다른 탭이 저장한 기록을 지우지 않음
    await pg.evaluate(chat => { const k = 'gm:cpn:chat:' + chat; const v = JSON.parse(localStorage.getItem(k)); v.zzzzzzzzzzzzzzzzzzzzzzzz = { base: 'x', current: 'y', spans: [], edits: [], at: 1 }; localStorage.setItem(k, JSON.stringify(v)); }, CHAT);
    await T.edit(M(13), '울었다', '웃었다');
    check('다른 탭 기록 유지', await pg.evaluate(chat => !!JSON.parse(localStorage.getItem('gm:cpn:chat:' + chat)).zzzzzzzzzzzzzzzzzzzzzzzz, CHAT));

    // 크랙 수정 모드(캐릭터 채팅 하단 입력창) 중에는 거절
    await pg.evaluate(() => { window.__chatState.isEdit = true; });
    await T.edit(M(10), '다음', '그다음');
    check('크랙 수정 중 거절', (await T.toast()).includes('크랙 수정창') && server[M(10)] === '[링크](http://a.com) 그 다음 글', await T.toast());
    await pg.keyboard.press('Escape');
    await pg.evaluate(() => { window.__chatState.isEdit = false; });

    // Enter 로 바로 닫혀도 keyup 이 크랙으로 새지 않음
    await pg.evaluate(() => { window.__leak = 0; document.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === 'Escape') window.__leak++; }); });
    await T.select(M(1), '맺혔다');
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
    await pg.keyboard.press('Enter'); await pg.waitForTimeout(200);
    await T.select(M(1), '맺혔다');
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(200);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    check('Enter/Esc keyup 안 샘', (await pg.evaluate(() => window.__leak)) === 0);

    await pg.setViewportSize({ width: 390, height: 800 });
    await T.select(M(1), '여기까지만');
    await T.click('.tb [data-act="edit"]'); await pg.waitForTimeout(300);
    await pg.screenshot({ path: shot('p6-mobile-' + THEME) });
  });

  const character = {
    name: 'character', chat: CHAT2, kind: 'character', url: `https://crack.wrtn.ai/characters/ch1/chats/${CHAT2}`, selected: null,
    show: { [M(31)]: 0 },
    messages: [
      msg(30, '*그는 고개를 끄덕였다. 창밖에는 비가 내렸다.*\n\n"알겠어."\n\n![](https://example.com/b.png)\n\n*그는 고개를 끄덕였다. 하지만 마음은 무거웠다.*', 'assistant', CHAT2),
      msg(31, '첫 번째 변형. 같은 문장.\n\n보이는 변형이다.', 'assistant', CHAT2),
      msg(32, '두 번째 변형. 같은 문장.\n\n숨은 변형이다.', 'assistant', CHAT2),
    ],
    groups: [[M(30)], [M(31), M(32)]],
  };
  await scenario(browser, character, async T => {
    const { pg, server } = T;
    await T.edit(M(30), '고개를 끄덕였다', '고개를 저었다', 1);
    check('세 번째 말풍선만 바뀜', server[M(30)].includes('*그는 고개를 끄덕였다. 창밖에는') && server[M(30)].includes('*그는 고개를 저었다. 하지만'), JSON.stringify(server[M(30)]));
    check('배지 1개', (await T.badges()).length === 1, JSON.stringify(await T.badges()));
    check('칠은 바뀐 말풍선에만', JSON.stringify((await T.hl()).edit) === '["저었"]', JSON.stringify((await T.hl()).edit));
    await T.edit(M(31), '보이는 변형이다', '보이는 변형이었다');
    check('보이는 변형(첫째)에 저장', server[M(31)].endsWith('보이는 변형이었다.') && server[M(32)].endsWith('숨은 변형이다.'), JSON.stringify([server[M(31)], server[M(32)]]));
    await pg.screenshot({ path: shot('p7-character-' + THEME) });
  });

  const nofiber = { ...story, name: 'nofiber', nofiber: true, messages: story.messages.slice(0, 3), groups: [[M(1)], [M(2)], [M(3)]] };
  await scenario(browser, nofiber, async T => {
    const { pg, server } = T;
    const diag = await pg.evaluate(() => window.CrackPinset.diag());
    check('fiber 없음', !diag.fiber);
    await T.edit(M(3), '자세한 설명은', '간단한 설명은');
    check('경로 C 저장', server[M(3)].includes('간단한 설명은'));
    check('새로고침 안내', (await T.toast()).includes('새로고침'));
    check('배지: 새로고침하면 보여요', (await T.badges()).some(b => b.includes('새로고침')), JSON.stringify(await T.badges()));
  });

  const storeless = { ...story, name: 'storeless', storeless: true, messages: story.messages.slice(0, 3), groups: [[M(1)], [M(2)], [M(3)]] };
  await scenario(browser, storeless, async T => {
    const { pg, server } = T;
    await T.edit(M(3), '자세한 설명은', '간단한 설명은');
    await pg.waitForTimeout(400);
    check('경로 C 저장', server[M(3)].includes('간단한 설명은') && (await pg.evaluate(() => window.CrackPinset.diag().lastPath)) === 'C');
    check('기록이 지워지지 않음', !!(await T.records())[M(3)]);
  });

  await browser.close();
  console.log(failures ? `\n실패 ${failures}개` : '\n모두 통과');
  process.exitCode = failures ? 1 : 0;
})();
