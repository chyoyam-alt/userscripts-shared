// ==UserScript==
// @name         🪶 Crack Transcript (대화록)
// @namespace    https://crack.wrtn.ai/
// @version      1.3.0
// @description  크랙 대화 로그를 TXT · HTML · Markdown · JSON · EPUB 중 하나로 저장해요. 메시지 청소와 장기기억 함께 저장도 돼요. 오른쪽 패널의 「로그 저장」을 누를 때만 동작해요.
// @match        https://crack.wrtn.ai/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-idle
// @noframes
// ==/UserScript==

/*
 * 평소에는 일하지 않아요. 페이지를 감시하거나 주기적으로 도는 코드가 없고, 네트워크 요청도 하지 않아요.
 * 하는 일은 두 가지뿐이에요.
 *   - 클릭할 때(채팅방 이동, 오른쪽 패널 열기 등) 패널에 「로그 저장」 줄이 없으면 한 번 넣어요.
 *   - 그 줄이나 Tampermonkey 메뉴의 「로그 저장」을 눌러 저장할 때만 크랙 공식 API(읽기 전용)를 불러요.
 *       GET /crack-gen/v3/chats/:chatId/messages?limit&cursor   대화 (최신 메시지부터, 커서로 이전 페이지)
 *       GET /crack-gen/v3/chats/:chatId                          방 정보 (작품명, 유저노트, 모델)
 *       GET /crack-gen/v3/chats/:chatId/summaries?limit=20&type=longTerm&orderBy=newest&filter=all&cursor
 *                                                                장기기억 (20개씩, 커서로 다음 페이지)
 */
(() => {
    'use strict';

    const APP = { name: 'Crack Transcript', version: '1.3.0' };
    const API = 'https://crack-api.wrtn.ai/crack-gen';
    const PAGE_LIMITS = [500, 200, 100, 20], PAGE_GAP_MS = 120;
    const MEMORY_PAGE = 20, MEMORY_MAX_PAGES = 500; // the summaries API refuses more than 20 per page
    const DEFAULTS = Object.freeze({
        mode: 'all', recent: 50, from: 1, to: 100, format: 'txt',
        info: true, memory: true, stats: true, alts: false,
        split: false, splitSize: 1000, zip: false,
        clean: { on: true, imageMarkdown: true, imageUrls: true, comments: true, blankLines: true, markdown: false, wishInject: true, loreOoc: true, codeFence: 'keep' },
    });
    const net = { fetch: (...args) => fetch(...args) };
    const hasDom = typeof document !== 'undefined';

    // ---------- small helpers ----------
    const wait = (ms, signal) => new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
    });
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = n => String(n).padStart(2, '0');
    const stamp = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const fmtDate = d => d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
    const num = n => Number(n || 0).toLocaleString('ko-KR');
    // Cut by characters, not UTF-16 units, so an emoji is never split in half.
    const fileSafe = s => Array.from(String(s || '크랙 대화').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 60).join('').trim() || '크랙 대화';
    const oneLine = s => String(s ?? '').replace(/\s*\n\s*/g, ' ').trim();
    const cancelled = () => new DOMException('cancelled', 'AbortError');
    // Long jobs (cleaning and writing a huge chat) pause about every 50 ms, so the page keeps painting and taking
    // input, and 취소 gets through. The pause is a posted message, not a timer: a hidden tab runs timers once a second
    // (once a minute after 5 minutes), which would stretch a big save to minutes.
    let breath = 0;
    async function breathe(signal) {
        if (performance.now() - breath < 50) return;
        await new Promise(resolve => { const ch = new MessageChannel(); ch.port1.onmessage = () => { ch.port1.close(); resolve(); }; ch.port2.postMessage(0); });
        if (signal?.aborted) throw cancelled();
        breath = performance.now();
    }
    // File text is collected as string pieces, never one huge string (a very long chat would hit the browser's maximum
    // string length). Every ~2M characters the pieces so far become one Blob part, so a long chat is not held twice
    // (as strings and as Blob data) while its file is made. done() returns the Blob parts.
    function pieces(...first) {
        const parts = [], cur = [];
        let chars = 0;
        const flush = () => { if (cur.length) parts.push(new Blob(cur)); cur.length = 0; chars = 0; };
        const push = (...xs) => { for (const x of xs) { cur.push(x); chars += x.length; } if (chars > 1 << 21) flush(); };
        push(...first);
        return { push, done() { flush(); return parts; } };
    }
    // A Mongo-style id starts with its creation time in seconds; messages carry no other timestamp.
    const idTime = id => /^[0-9a-f]{24}$/i.test(id || '') ? new Date(parseInt(id.slice(0, 8), 16) * 1000) : null;

    function readToken() {
        if (!hasDom) return '';
        const m = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }
    function routeChat(path = hasDom ? location.pathname : '') {
        const m = String(path).match(/\/stories\/([^/]+)\/episodes\/([0-9a-f]{24})/i);
        return m ? { storyId: m[1], chatId: m[2] } : null;
    }

    // ---------- API ----------
    async function api(path, { signal } = {}) {
        for (let attempt = 0; ; attempt++) {
            let res;
            try {
                res = await net.fetch(API + path, { headers: { accept: 'application/json, text/plain, */*', authorization: `Bearer ${readToken()}`, platform: 'web', 'wrtn-locale': 'ko-KR' }, signal });
            } catch (error) {
                if (signal?.aborted) throw error;
                if (attempt >= 5) throw new Error(`네트워크 오류로 받지 못했어요 (${error.message})`);
                await wait(Math.min(15000, 800 * 2 ** attempt), signal);
                continue;
            }
            if (res.ok) { const body = await res.json(); return body && typeof body === 'object' && 'data' in body ? body.data : body; }
            if (res.status === 401 && attempt < 1) { await wait(1500, signal); continue; } // the page may refresh its token meanwhile
            if ((res.status === 429 || res.status >= 500) && attempt < 6) {
                const after = Number(res.headers.get('retry-after'));
                await wait(after > 0 ? Math.min(after, 30) * 1000 : Math.min(15000, 800 * 2 ** attempt), signal);
                continue;
            }
            const error = new Error(res.status === 401 ? '로그인이 풀렸어요. 크랙을 새로고침한 뒤 다시 눌러 주세요.' : `크랙 서버가 요청을 거절했어요 (HTTP ${res.status}).`);
            error.status = res.status;
            throw error;
        }
    }

    // Only what the files need is kept; the rest of each page is dropped as it arrives (long chats stay light).
    const slim = m => ({ _id: m._id, role: m.role, content: m.content, turnId: m.turnId, parentTurnId: m.parentTurnId, status: m.status, reroll: m.reroll, isPrologue: m.isPrologue, crackerModel: m.crackerModel, situationImages: m.situationImages, images: m.images, imageUrls: m.imageUrls });

    // Pages from newest to oldest until `enough(all)` says so or the history ends. A failure after retries keeps
    // what was already received on the error, so it can still be saved. A server that repeats a page (same cursor,
    // nothing new) stops the paging the same way instead of being asked again and again.
    async function fetchMessages(chatId, { enough, onProgress, signal } = {}) {
        const all = [], ids = new Set(), cursors = new Set();
        let cursor = null, step = 0, pages = 0;
        for (;;) {
            let data;
            try {
                data = await api(`/v3/chats/${chatId}/messages?limit=${PAGE_LIMITS[step]}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
            } catch (error) {
                // A smaller page size if the server ever refuses a big one (not when it is only busy).
                if (!pages && step < PAGE_LIMITS.length - 1 && [400, 413, 422].includes(error.status)) { step++; continue; }
                error.partial = all;
                throw error;
            }
            const list = Array.isArray(data?.messages) ? data.messages : [];
            const before = all.length;
            for (const m of list) if (m && m._id && !ids.has(m._id)) { ids.add(m._id); all.push(slim(m)); }
            pages++;
            onProgress?.(all.length, pages);
            const next = data?.nextCursor ? String(data.nextCursor) : '';
            const end = !data?.hasNext || !next || !list.length;
            if (end || enough?.(all)) return { messages: all, complete: end };
            if (all.length === before || cursors.has(next)) {
                const error = new Error('크랙 서버가 같은 페이지를 되풀이해서 받기를 멈췄어요.');
                error.partial = all;
                throw error;
            }
            cursors.add(next);
            cursor = next;
            await wait(PAGE_GAP_MS, signal);
        }
    }

    async function fetchChat(chatId, opts, signal) {
        if (!opts.info) return { chat: null };
        try { return { chat: await api(`/v3/chats/${chatId}`, { signal }) }; }
        catch (error) { if (signal?.aborted) throw error; return { chat: null, chatError: error.message }; }
    }

    // Long-term memories, 20 per page: each page names the next one until there is none. Returned oldest first, so
    // they read in story order. When a later page fails, the pages already received are kept (`failure` says why).
    async function fetchMemories(chatId, { signal } = {}) {
        const list = [], ids = new Set(), cursors = new Set();
        let cursor = null, total = 0, failure = '';
        for (let page = 0; page < MEMORY_MAX_PAGES; page++) {
            let data;
            try {
                data = await api(`/v3/chats/${chatId}/summaries?limit=${MEMORY_PAGE}&type=longTerm&orderBy=newest&filter=all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
            } catch (error) {
                if (signal?.aborted || !list.length) throw error;
                failure = error.message;
                break;
            }
            const items = Array.isArray(data?.summaries) ? data.summaries : [];
            total = Math.max(total, Number(data?.totalCount) || 0);
            for (const s of items) {
                if (!s || !s._id || ids.has(s._id)) continue;
                ids.add(s._id);
                const at = s.createdAt ? new Date(s.createdAt) : idTime(s._id);
                list.push({ id: s._id, title: oneLine(s.title), summary: oneLine(s.summary), createdAt: at && !isNaN(at) ? at : null });
            }
            const next = data?.nextCursor ? String(data.nextCursor) : '';
            if (!next || !items.length || cursors.has(next)) break;
            cursors.add(next);
            cursor = next;
            await wait(PAGE_GAP_MS, signal);
        }
        // Pages are newest first: reversed, the stable sort keeps memories with the same time oldest first too.
        list.reverse().sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
        return { memories: list, total: Math.max(total, list.length), failure };
    }

    // ---------- thread ----------
    // The list is newest first. Following parentTurnId back from the newest message gives the line the chat really
    // took; other assistant messages with the same parent are rerolls (other versions).
    function buildThread(messages) {
        const byTurn = new Map(), children = new Map();
        for (const m of messages) {
            if (m.turnId && !byTurn.has(m.turnId)) byTurn.set(m.turnId, m);
            const key = m.parentTurnId || '';
            if (!children.has(key)) children.set(key, []);
            children.get(key).push(m);
        }
        const chain = [], seen = new Set();
        let cur = messages[0] || null;
        while (cur && !seen.has(cur.turnId)) { seen.add(cur.turnId); chain.push(cur); cur = cur.parentTurnId ? byTurn.get(cur.parentTurnId) : null; }
        chain.reverse();
        const rooted = Boolean(chain.length && !chain[0].parentTurnId);
        return { chain, children, rooted, onChain: seen };
    }

    function normalize(m) {
        const images = [];
        for (const src of [m.situationImages, m.images, m.imageUrls]) {
            if (!Array.isArray(src)) continue;
            for (const it of src) { const url = typeof it === 'string' ? it : it?.url || it?.imageUrl || it?.src; if (url) images.push(String(url)); }
        }
        return {
            id: m._id, turnId: m.turnId || '', parentTurnId: m.parentTurnId || '', role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.content ?? ''), createdAt: idTime(m._id), status: m.status || '', reroll: m.reroll === true,
            prologue: m.isPrologue === true, model: m.crackerModel || '', images,
        };
    }

    // Turn = a user message and the replies that follow it. The opening message of the chat (no parent) is the
    // prologue; a reply at the head of a cut-off history is not, it is the tail of a turn whose start was not read.
    function toTurns(thread) {
        const turns = [];
        let cur = null;
        for (const raw of thread.chain) {
            const m = normalize(raw);
            if (m.role === 'user' || !cur) {
                cur = { no: null, user: m.role === 'user' ? m : null, replies: [], alts: [], prologue: m.role !== 'user' && (m.prologue || !m.parentTurnId) };
                turns.push(cur);
                if (m.role === 'user') continue;
            }
            cur.replies.push(m);
        }
        // Other versions: off-line assistant messages under the same parent as any reply of the turn (a reroll of a
        // continuation hangs under the reply before it).
        for (const t of turns) {
            if (!t.replies.length) continue;
            const parents = new Set(t.replies.map(r => r.parentTurnId || ''));
            t.alts = [...parents].flatMap(p => thread.children.get(p) || [])
                .filter(x => x.role !== 'user' && !thread.onChain.has(x.turnId))
                .map(normalize)
                .sort((a, b) => (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
        }
        return turns;
    }

    function numberTurns(turns, base) {
        // base = the number the first user turn gets (null when unknown: the history before it was not read).
        let n = base;
        for (const t of turns) {
            if (t.prologue) { t.no = n === null ? null : 0; t.label = '프롤로그'; continue; }
            t.no = n === null ? null : n;
            if (n !== null) n++;
        }
        // `rel` is the order within the selection; files use it when the real number is unknown, so split parts and
        // every format count the same way.
        let rel = 1;
        for (const t of turns) if (!t.prologue) { t.rel = rel; t.label = t.no === null ? `최근 ${rel}` : `${t.no}턴`; rel++; }
        return turns;
    }
    const turnNo = t => t.no !== null ? t.no : t.prologue ? 0 : t.rel;

    // ---------- selection by mode ----------
    function pickTurns(mode, opts, fetched, checkpoint) {
        const thread = buildThread(fetched.messages);
        const turns = toTurns(thread);
        const note = [];
        if (mode === 'all' || mode === 'range') {
            if (!thread.rooted) note.push('대화 처음까지 다 받지 못해서 번호를 확정하지 못했어요.');
            numberTurns(turns, thread.rooted ? 1 : null);
            if (mode === 'range') {
                const a = Math.max(0, Number(opts.from) || 0), b = Math.max(a, Number(opts.to) || a);
                return { turns: turns.filter(t => t.no !== null && t.no >= a && t.no <= b), note, newest: false };
            }
            return { turns, note, newest: true };
        }
        if (mode === 'recent') {
            const want = Math.max(1, Number(opts.recent) || 1);
            const keep = turns.filter(t => !t.prologue).slice(-want);
            // Without the start of the chat, real numbers can still come from the saved point when it was received.
            const at = !thread.rooted && Number.isFinite(checkpoint.no) && checkpoint.userTurnId ? turns.findIndex(t => t.user?.turnId === checkpoint.userTurnId) : -1;
            if (thread.rooted) numberTurns(turns, 1);
            else if (at >= 0) numberTurns(turns, checkpoint.no - turns.slice(0, at).filter(t => !t.prologue).length);
            else numberTurns(keep, null); // unknown numbers: count within the file
            if (keep.length && keep[0].no === null) {
                note.push('대화 처음까지 받지 않아서 턴 번호는 이번 파일 안의 순서예요.');
                // A saved point with a real number is worth more than one without: keep it.
                if (Number.isFinite(checkpoint.no)) return { turns: keep, note, newest: false };
            }
            return { turns: keep, note, newest: true };
        }
        // mode === 'new': everything after the saved point.
        const idx = turns.findIndex(t => (checkpoint.userTurnId && t.user?.turnId === checkpoint.userTurnId) || (!checkpoint.userTurnId && t.prologue));
        if (idx < 0) return { turns: [], note: ['저장해 둔 지점을 대화에서 찾지 못했어요. 「전체」로 한 번 저장해 주세요.'], newest: false, lost: true };
        const savedTurn = turns[idx];
        const lastReply = savedTurn.replies[savedTurn.replies.length - 1];
        // The saved last turn counts again when its reply was regenerated or continued after saving.
        const from = lastReply && lastReply.turnId !== checkpoint.leafTurnId ? idx : idx + 1;
        if (from === idx) note.push('저장 뒤에 마지막 턴의 답변이 바뀌어서 그 턴도 다시 넣었어요.');
        // The prologue opens the chat, so the turn after it is always 1, whatever number was stored with it.
        const baseNo = savedTurn.prologue ? 1 : Number.isFinite(checkpoint.no) ? checkpoint.no : null;
        numberTurns(baseNo === null ? turns.slice(from) : turns.slice(idx), baseNo);
        if (baseNo === null) note.push('이전 저장의 턴 번호를 몰라서 이번 파일 안의 순서로 표시했어요.');
        return { turns: turns.slice(from), note, newest: true };
    }

    // ---------- cleaning (applied to every message before saving) ----------
    const FENCE = /^\s*```/;
    // ```text``` opening and closing on one line is an inline span (bots use it for status lines), not a fence.
    const FENCE_SPAN = /^\s*```(.*?)```(.*)$/;
    // Whole ``` blocks; an opening fence that never closes is kept as it is, and so is a line that only starts with
    // an inline span.
    function dropCodeBlocks(text) {
        const kept = [];
        let held = null;
        for (const line of text.split('\n')) {
            if (held) { held.push(line); if (/^\s*```\s*$/.test(line)) held = null; continue; }
            if (FENCE.test(line)) { if (/^\s*```.+```\s*$/.test(line)) continue; if (!FENCE_SPAN.test(line)) { held = [line]; continue; } }
            kept.push(line);
        }
        if (held) kept.push(...held);
        return kept.join('\n');
    }
    // An image address may hold one level of (parentheses).
    const IMG_DEST = String.raw`(?:[^()\n]|\([^()\n]*\))*`;
    // Pieces the decoration rule leaves alone: linked images, images, links (their text is still cleaned), inline
    // code (its marks go) and bare addresses, whose _ and * belong to the address. A private-use character already in
    // the text is kept the same way, so the placeholders below always come back in order.
    const SLOT = '';
    const KEEP = new RegExp(`(${[
        String.raw`\[!\[[^\]\n]*\]\(${IMG_DEST}\)\]\(${IMG_DEST}\)`,
        String.raw`!\[[^\]\n]*\]\(${IMG_DEST}\)`,
        String.raw`\[[^\]\n]+\]\([^)\n]+\)`,
        '`[^`\\n]+`',
        String.raw`https?:\/\/[^\s<>]+`,
        SLOT,
    ].join('|')})`, 'g');
    // Keeps the words, drops the decoration: headings, quotes, links, inline code, bold, italic, strike. _x_ counts
    // as italic only on word edges, so ㅠ_ㅠ or snake_case stay as written.
    // [mark, rule, replacement]: a rule runs only when its mark is in the text (most pieces have few or none), so a
    // new rule must come with its mark.
    const PLAIN = [
        ['**', /\*\*([^*\n]+)\*\*/g, '$1'],
        ['__', /(^|[^\p{L}\p{N}_])__([^_\n]+)__(?![\p{L}\p{N}_])/gu, '$1$2'],
        ['*', /(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2'],
        ['_', /(^|[^\p{L}\p{N}_])_([^_\n]+)_(?![\p{L}\p{N}_])/gu, '$1$2'],
        ['~~', /~~([^~\n]+)~~/g, '$1'],
    ];
    const plainText = s => PLAIN.reduce((t, [mark, re, to]) => t.includes(mark) ? t.replace(re, to) : t, s);
    // The kept pieces are parked as placeholders while the rules run over the whole line, so a mark that wraps a link
    // or code (**[링크](주소)**, *`코드`*) still pairs up. An address gives back trailing * _ ~, which close such a mark
    // (autolinks end before them too).
    const keepBack = p => p[0] === '`' ? p.slice(1, -1) : p[0] === '[' && p[1] !== '!' ? plainText(p.replace(/^\[([^\]\n]+)\]\([^)\n]+\)$/, '$1').replace(/`([^`\n]+)`/g, '$1')) : p;
    const plainLine = line => {
        const kept = [];
        const body = line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s{0,3}>\s?/, '').replace(KEEP, p => {
            const tail = p[0] === 'h' ? /[*_~]+$/.exec(p)?.[0] || '' : '';
            kept.push(tail ? p.slice(0, -tail.length) : p);
            return SLOT + tail;
        });
        let i = 0;
        return plainText(body).replace(new RegExp(SLOT, 'g'), () => keepBack(kept[i++]));
    };
    const IMAGE_URL_LINE = /^\s*https?:\/\/\S+\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?\S*)?\s*$/i;
    const IMAGE_URL_LINES = /^[ \t]*https?:\/\/\S+\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?\S*)?[ \t]*$/gim;
    // An image, or an image wrapped in a link (counted and removed as one).
    const IMAGE_MD = new RegExp(String.raw`\[!\[[^\]\n]*\]\((${IMG_DEST})\)\]\(${IMG_DEST}\)|!\[[^\]\n]*\]\((${IMG_DEST})\)`, 'g');
    const COMMENT_LINE = /^\s*\[(?:\/\/|comment)\]:\s*#\s*\(.*\)\s*$/i;
    const urlOf = inner => { const s = String(inner).trim(); const u = s[0] === '<' ? s.slice(1, s.indexOf('>') > 0 ? s.indexOf('>') : undefined) : s.split(/\s+/)[0]; return /^https?:\/\//i.test(u) ? u : ''; };

    // Reference blocks other extensions hide inside messages. Only whole blocks go (an opening marker with its own
    // closing marker), and a block never reaches across another opening marker of the same kind, so a lone broken
    // marker cannot swallow the story around it. Markers may be raw or HTML-escaped (&lt;!-- … --&gt;), and a \ or ?
    // in front of a marker at the start of a line belongs to it (one ending a sentence stays).
    const OPEN = '(?:<|&lt;)', CLOSE = '(?:>|&gt;)';
    const WISH_FAMILIES = 'RP_CONTEXT_MANAGER|WISH_SESSION_SETUP|RP_CTX';
    const hiddenComment = families => new RegExp(`(?:(^|\\n)[\\\\?])?${OPEN}!--\\s*(${families})(?:_START)?\\b(?:(?!${OPEN}!--\\s*\\2(?:_START)?\\b)[\\s\\S])*?\\2_END\\s*--${CLOSE}`, 'gi');
    const tagBlock = name => new RegExp(`${OPEN}${name}\\b(?:(?!${OPEN}${name}\\b)[\\s\\S])*?${OPEN}\\/${name}\\s*${CLOSE}`, 'gi');
    // Wish RP Manager · Core: context/memory notes, the first-message session setup, cognition notes and their
    // older one-line form. [rule, replacement]
    const WISH_RULES = [
        [hiddenComment(WISH_FAMILIES), (all, nl) => nl || ''],
        [tagBlock('rp_context_manager'), ''],
        [/^[ \t]*\[\/\/\]:[ \t]*#[ \t]*\(RP_COG_V1\|[^\n]*\)[ \t]*(?:\n|$)/gim, ''],
    ];
    const LORE_RULES = [[tagBlock('ooc_lore_context'), '']];
    // Nested blocks of one kind come off from the inside out, a few passes at most.
    const stripBlocks = (text, rules) => {
        for (let pass = 0; pass < 8; pass++) {
            const before = text;
            for (const [re, to] of rules) text = text.replace(re, to);
            if (text === before) break;
        }
        return text;
    };
    // Plain HTML comments. While the Wish rule is on, a Wish marker left in the text is a broken block kept on
    // purpose, so no comment may start there (it would run to any later --> and take the story with it).
    const COMMENTS = /<!--[\s\S]*?-->/g;
    const COMMENTS_NOT_WISH = new RegExp(`<!--(?!\\s*(?:${WISH_FAMILIES})(?![A-Za-z0-9]))[\\s\\S]*?-->`, 'gi');

    // `cut` (optional) collects the addresses of images taken out of the text, so the statistics still count them.
    function cleanContent(input, c, cut) {
        let text = String(input ?? '').replace(/\r\n?/g, '\n').replace(/﻿/g, '');
        if (!c?.on) return text;
        if (c.wishInject) text = stripBlocks(text, WISH_RULES);
        if (c.loreOoc) text = stripBlocks(text, LORE_RULES);
        if (c.codeFence === 'blocks') text = dropCodeBlocks(text);
        if (c.comments) text = text.replace(c.wishInject ? COMMENTS_NOT_WISH : COMMENTS, '');
        const lines = [];
        let inFence = false;
        for (let line of text.split('\n')) {
            if (c.comments && COMMENT_LINE.test(line)) continue;
            if (c.imageMarkdown && line.includes('![')) line = line.replace(IMAGE_MD, (all, a, b) => { const u = urlOf(a ?? b); if (u) cut?.push(u); return ''; });
            if (c.imageUrls && IMAGE_URL_LINE.test(line)) { cut?.push(line.trim()); continue; }
            if (FENCE.test(line)) {
                const span = FENCE_SPAN.exec(line);
                if (!span) { inFence = !inFence; if (c.codeFence === 'fences') continue; } // a fence line: ``` or ```lang
                else if (c.codeFence === 'fences') { line = `${span[1].trim()} ${span[2].trim()}`.trim(); if (!line) continue; } // ```x``` keeps x
            } else if (c.markdown && !inFence && !IMAGE_URL_LINE.test(line)) line = plainLine(line);
            // Trailing spaces and tabs off in one pass from the end (a regex here is quadratic on long space runs).
            // Only ASCII space and tab: trimEnd() would also take NBSP and U+3000.
            let end = line.length;
            while (end && (line.charCodeAt(end - 1) === 32 || line.charCodeAt(end - 1) === 9)) end--;
            if (end < line.length) line = line.slice(0, end);
            lines.push(line.trim() ? line : '');
        }
        text = lines.join('\n');
        if (c.blankLines) text = text.replace(/\n{3,}/g, '\n\n').trim();
        return text;
    }
    // Cleans the chosen turns in place; returns how many characters went away. Other versions are cleaned only when
    // they go into the file.
    function cleanTurns(turns, c, { alts = true } = {}) {
        let removed = 0;
        if (!c?.on) return removed;
        for (const t of turns) for (const m of [t.user, ...t.replies, ...(alts ? t.alts : [])]) {
            if (!m) continue;
            const before = m.content.length, cut = [];
            m.content = cleanContent(m.content, c, cut);
            if (cut.length) m.cut = [...(m.cut || []), ...cut];
            removed += before - m.content.length;
        }
        return removed;
    }
    // Text formats: images attached to a message (situation images) are listed as links unless the cleaning drops
    // image URL lines, and images written in the text stay or go with the text.
    const showImages = opts => !(opts.clean?.on && opts.clean.imageUrls);
    // The HTML file shows every image as a picture where it is written, so its cleaning leaves images in the text and
    // the HTML builder turns them into pictures in place.
    const cleaningFor = opts => opts.format === 'html' && opts.clean?.on ? { ...opts.clean, imageMarkdown: false, imageUrls: false } : opts.clean;

    // ---------- stats ----------
    function computeStats(turns) {
        let userChars = 0, aiChars = 0, rerolls = 0, images = 0, first = null, last = null;
        for (const t of turns) {
            for (const m of [t.user, ...t.replies]) {
                if (!m) continue;
                if (m.role === 'user') userChars += m.content.length; else aiChars += m.content.length;
                images += m.images.length + (m.cut?.length || 0) + (m.content.match(IMAGE_MD)?.length || 0) + (m.content.match(IMAGE_URL_LINES)?.length || 0);
                if (m.createdAt) { if (!first || m.createdAt < first) first = m.createdAt; if (!last || m.createdAt > last) last = m.createdAt; }
            }
            rerolls += t.alts.length;
        }
        return { turns: turns.filter(t => !t.prologue).length, userChars, aiChars, totalChars: userChars + aiChars, rerolls, images, first, last };
    }

    // ---------- shared document parts ----------
    function describe(ctx) {
        const c = ctx.chat || {};
        const story = c.story || {};
        return {
            title: story.name || c.title || ctx.pageTitle || '크랙 대화',
            chatTitle: c.title || '',
            model: c.crackerModel || (typeof c.model === 'string' ? c.model : c.model?.name) || '',
            created: c.createdAt ? new Date(c.createdAt) : null,
            userNote: typeof story.userNote === 'string' ? story.userNote : story.userNote?.content || '',
        };
    }
    const rangeLabel = turns => {
        const nums = turns.filter(t => !t.prologue).map(t => t.no).filter(n => n !== null);
        if (nums.length) return `${nums[0]}-${nums[nums.length - 1]}턴`;
        const n = turns.filter(t => !t.prologue).length;
        return n ? `${n}턴` : '프롤로그';
    };
    const statsLine = s => `${num(s.turns)}턴 · 내 글 ${num(s.userChars)}자 · AI ${num(s.aiChars)}자 · 리롤 ${num(s.rerolls)}${s.images ? ` · 이미지 ${num(s.images)}` : ''} · ${fmtDate(s.first)} ~ ${fmtDate(s.last)}`;
    const whoOf = (t, m) => m.role === 'user' ? '나' : t.prologue ? '프롤로그' : 'AI';
    const memoriesOf = ctx => ctx.memories || [];

    // Image markdown (also wrapped in a link) as the HTML file draws it; the address ends at the first space.
    const HTML_URL = String.raw`(https?:\/\/(?:[^\s()]|\([^\s()]*\))+)(?:\s${IMG_DEST})?`;
    const HTML_IMG = new RegExp(String.raw`\[!\[[^\]\n]*\]\(\s*${HTML_URL}\)\]\(${IMG_DEST}\)|!\[[^\]\n]*\]\(\s*${HTML_URL}\)`, 'g');
    // Markdown-lite for display: **bold** and *narration*, on already-escaped text.
    const inline = s => s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    // Every builder is async, pauses now and then (breathe) and returns the file as Blob parts (see pieces), except
    // EPUB, which returns its finished Blob.

    // ---------- TXT ----------
    // Turn blocks, so a tool reading the file can split it by whole turns:
    //   ===== TURN 12 =====
    //   [USER] / [CHARACTER]       (the other-version label is plain text inside the turn)
    // Attached image addresses sit on their own lines.
    async function buildTxt(ctx, turns, part, signal) {
        const d = describe(ctx), out = pieces('﻿');
        out.push(`${d.title}\n`);
        if (ctx.opts.info && d.chatTitle && d.chatTitle !== d.title) out.push(`대화: ${d.chatTitle}\n`);
        out.push(`범위: ${rangeLabel(turns)}${part ? ` (${part})` : ''} · 저장 ${fmtDate(ctx.now)}\n`);
        if (ctx.opts.stats) out.push(`통계: ${statsLine(computeStats(turns))}\n`);
        for (const n of ctx.notes) out.push(`※ ${n}\n`);
        if (ctx.opts.info && d.userNote) out.push(`\n유저노트:\n${d.userNote}\n`);
        const mem = memoriesOf(ctx);
        if (mem.length) out.push(`\n장기기억 ${num(mem.length)}개:\n${mem.map(m => `- ${m.title ? `${m.title}: ` : ''}${m.summary}`).join('\n')}\n`);
        const links = showImages(ctx.opts);
        const imgs = m => links && m.images.length ? `\n${m.images.join('\n')}` : '';
        for (const [i, t] of turns.entries()) {
            await breathe(signal);
            const blocks = [];
            if (t.user) blocks.push(`[USER]\n${t.user.content}${imgs(t.user)}`);
            for (const m of t.replies) blocks.push(`[CHARACTER]\n${m.content}${imgs(m)}`);
            if (ctx.opts.alts) t.alts.forEach((m, k) => blocks.push(`(다른 버전 ${k + 1})\n${m.content}`));
            out.push(`\n===== TURN ${turnNo(t) ?? i + 1} =====\n${blocks.join('\n\n')}\n`);
        }
        return out.done();
    }

    // ---------- HTML ----------
    // A browser cannot lay out a page taller than about 33.5M px (Chrome, Safari) or 17.9M px (Firefox): past that the
    // end of a long chat piles up on one spot and cannot be reached. 2,000 turns of ~3.5k characters on a phone in
    // Firefox measure about 12.6M px, so one HTML file holds at most this many turns.
    const HTML_PART = 2000;
    async function buildHtml(ctx, turns, part, signal) {
        const d = describe(ctx), s = ctx.opts.stats ? computeStats(turns) : null, mem = memoriesOf(ctx);
        // Pictures, not links, loading lazily: image markdown and bare image addresses in the text show right where they
        // are written (see cleaningFor), and the message's attached situation images show under it. Each picture is
        // parked as <n> while *emphasis* is applied, so a * inside an address cannot break it (escaped text has no <).
        const pic = u => `<a class="pic" href="${u}" target="_blank" rel="noopener"><img src="${u}" loading="lazy" decoding="async" alt=""></a>`;
        const body = text => {
            const parked = [];
            const park = u => `<${parked.push(pic(u)) - 1}>`;
            return inline(esc(text).replace(HTML_IMG, (all, a, b) => park(a ?? b)).replace(IMAGE_URL_LINES, line => park(line.trim())))
                .replace(/<(\d+)>/g, (all, i) => parked[+i]);
        };
        const pics = m => { const list = [...new Set([...m.images, ...(m.cut || [])])].filter(u => /^https?:\/\//i.test(u)); return list.length ? `<div class="pics">${list.map(u => pic(esc(u))).join('')}</div>` : ''; };
        const msg = (m, who) => `<div class="m ${m.role === 'user' ? 'u' : 'a'}"><div class="who">${who}${m.status && m.status !== 'end' ? ` <span class="st">(${esc(m.status)})</span>` : ''}<time>${fmtDate(m.createdAt)}</time></div><div class="tx">${body(m.content)}</div>${pics(m)}</div>`;
        const info = `<table class="meta">${ctx.opts.info && d.chatTitle && d.chatTitle !== d.title ? `<tr><th>대화</th><td>${esc(d.chatTitle)}</td></tr>` : ''}<tr><th>범위</th><td>${esc(rangeLabel(turns))}${part ? ` · ${part}` : ''}</td></tr><tr><th>저장</th><td>${fmtDate(ctx.now)}</td></tr></table>${ctx.opts.info && d.userNote ? `<details class="box" open><summary>유저노트</summary><div class="tx">${body(d.userNote)}</div></details>` : ''}${mem.length ? `<details class="box"><summary>장기기억 ${num(mem.length)}개</summary><ol class="mem">${mem.map(m => `<li>${m.title ? `<b>${esc(m.title)}</b> ` : ''}${esc(m.summary)}</li>`).join('')}</ol></details>` : ''}`;
        const stats = s ? `<div class="stats"><span><b>${num(s.turns)}</b>턴</span><span>내 글 <b>${num(s.userChars)}</b>자</span><span>AI <b>${num(s.aiChars)}</b>자</span><span>리롤 <b>${num(s.rerolls)}</b></span>${s.images ? `<span>이미지 <b>${num(s.images)}</b></span>` : ''}<span>${fmtDate(s.first)} ~ ${fmtDate(s.last)}</span></div>` : '';
        const notes = ctx.notes.length ? `<p class="note">${ctx.notes.map(esc).join('<br>')}</p>` : '';
        const out = pieces(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)} · ${esc(rangeLabel(turns))}</title>
<style>
:root{--bg:#fff;--ink:#1a1918;--sub:#61605a;--mute:#85837d;--line:#e5e5e1;--u:#f5f5f2;--acc:#0c6acf}
@media(prefers-color-scheme:dark){:root{--bg:#141413;--ink:#f0efeb;--sub:#a8a69f;--mute:#85837d;--line:#2c2b29;--u:#1e1e1c;--acc:#6aa7ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.75 Pretendard,'Apple SD Gothic Neo',system-ui,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:28px 20px 80px}header{padding-bottom:16px;border-bottom:1px solid var(--line)}
.k{font-size:12px;font-weight:500;color:var(--mute)}h1{font-size:24px;font-weight:600;margin:6px 0 12px;line-height:1.35}
.meta{border-collapse:collapse;font-size:13px}.meta th{text-align:left;color:var(--sub);font-weight:500;padding:2px 16px 2px 0;white-space:nowrap}.meta td{padding:2px 0}
.stats{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--sub);margin-top:10px}.stats b{color:var(--ink);font-weight:600}
.box{border:1px solid var(--line);border-radius:12px;padding:10px 14px;margin-top:12px}.box summary{cursor:pointer;font-weight:600;font-size:14px}
.mem{margin:8px 0 0;padding-left:22px;font-size:14px;line-height:1.6}.mem li{margin:4px 0}.mem b{font-weight:600}
.bar{position:sticky;top:0;z-index:2;display:flex;gap:8px;padding:12px 0;background:var(--bg);border-bottom:1px solid var(--line)}
.bar input{flex:1;min-width:0;height:40px;font:inherit;font-size:14px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}.bar #go{flex:0 0 120px}.bar span{font-size:12px;color:var(--sub);align-self:center;white-space:nowrap}
.t{padding:16px 0;border-bottom:1px solid var(--line);scroll-margin-top:68px}.blk{content-visibility:auto;contain-intrinsic-size:80000px;contain-intrinsic-size:auto 80000px}.blk.part{content-visibility:visible}.t h2{font-size:12px;font-weight:600;color:var(--mute);margin:0 0 8px}
.m{border-radius:12px;padding:12px 16px;margin:8px 0}.m.u{background:var(--u)}.m.a{border:1px solid var(--line)}
.who{font-size:12px;font-weight:600;color:var(--sub);display:flex;gap:8px;margin-bottom:4px}.who time{margin-left:auto;font-weight:400;color:var(--mute)}.st{color:#e5432a}
.tx{white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}.tx em{color:var(--sub)}
.pic{display:inline-block;max-width:100%;vertical-align:top}.pic img{display:block;max-width:100%;max-height:480px;height:auto;border-radius:10px;background:var(--u)}
.pics{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.pics .pic img{max-height:360px}
.alt{margin-top:6px;font-size:14px}.alt summary{cursor:pointer;color:var(--acc);font-size:13px}.note{font-size:13px;color:var(--sub)}.hide{display:none}
</style></head><body><div class="wrap"><header><div class="k">크랙 대화 로그 · ${esc(APP.name)} ${APP.version}</div><h1>${esc(d.title)}</h1>${info}${stats}${notes}</header>
<div class="bar"><input id="q" type="search" placeholder="내용 검색"><input id="go" type="number" placeholder="턴 번호로 이동"><span id="n"></span></div>
<main>
`);
        // 50 turns per block: the browser lays out and paints only the blocks near the screen. The search hides blocks
        // without a hit and draws partly hidden ones normally; a jump gives its block and the one before it real height.
        for (const [i, t] of turns.entries()) {
            await breathe(signal);
            const id = t.no !== null ? `t${t.no}` : t.prologue ? 'p' : `r${t.rel ?? i}`;
            const alts = ctx.opts.alts && t.alts.length ? `<details class="alt"><summary>다른 버전 ${t.alts.length}개</summary>${t.alts.map((m, k) => msg(m, `버전 ${k + 1}`)).join('')}</details>` : '';
            out.push(`${i % 50 ? '' : i ? '</div><div class="blk">' : '<div class="blk">'}<section class="t" id="${id}"><h2>${esc(t.label)}</h2>${[t.user, ...t.replies].filter(Boolean).map(m => msg(m, whoOf(t, m))).join('')}${alts}</section>\n`);
        }
        out.push(`${turns.length ? '</div>' : ''}</main></div>
<script>
(function(){var q=document.getElementById('q'),go=document.getElementById('go'),n=document.getElementById('n'),ts=[].slice.call(document.querySelectorAll('.t')),bs=[].slice.call(document.querySelectorAll('.blk')),timer=0;
function run(){var v=q.value.trim().toLowerCase(),c=0,cs=v!==v.toUpperCase();ts.forEach(function(t){var hit=!v||(cs?t.textContent.toLowerCase():t.textContent).indexOf(v)>=0;t.classList.toggle('hide',!hit);if(hit)c++;});
bs.forEach(function(b){var k=b.querySelectorAll('.t:not(.hide)').length;b.classList.toggle('hide',!k);b.classList.toggle('part',k>0&&k<b.children.length);});n.textContent=v?c+'턴':'';}
q.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(run,200);});
go.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var el=document.getElementById('t'+go.value)||document.getElementById('r'+go.value);if(el){q.value='';run();var b=el.parentNode;[b,b.previousElementSibling].forEach(function(x){if(x)x.style.contentVisibility='visible';});el.scrollIntoView();}});})();
</script></body></html>`);
        return out.done();
    }

    // ---------- Markdown ----------
    async function buildMd(ctx, turns, part, signal) {
        const d = describe(ctx), out = pieces(`# ${d.title}\n\n`), mem = memoriesOf(ctx);
        if (ctx.opts.info && d.chatTitle && d.chatTitle !== d.title) out.push(`- 대화: ${d.chatTitle}\n`);
        out.push(`- 범위: ${rangeLabel(turns)}${part ? ` · ${part}` : ''}\n- 저장: ${fmtDate(ctx.now)}\n\n`);
        if (ctx.opts.stats) out.push(`> ${statsLine(computeStats(turns))}\n\n`);
        for (const n of ctx.notes) out.push(`> ${n}\n\n`);
        if (ctx.opts.info && d.userNote) out.push('## 유저노트\n\n', d.userNote.split('\n').map(l => `> ${l}`).join('\n'), '\n\n');
        if (mem.length) out.push(`## 장기기억 (${num(mem.length)}개)\n\n`, mem.map(m => `- ${m.title ? `**${m.title}** — ` : ''}${m.summary}`).join('\n'), '\n\n');
        out.push('---\n\n');
        const links = showImages(ctx.opts);
        const imgs = m => links && m.images.length ? `\n\n${m.images.map((u, i) => `[이미지 ${i + 1}](${u})`).join(' · ')}` : '';
        // A <!-- with no --> after it in the same message would make Markdown viewers hide the rest of the file.
        const md = s => { const end = s.lastIndexOf('-->'); return s.replace(/<!--/g, (o, i) => i > end ? '&lt;!--' : o); };
        for (const t of turns) {
            await breathe(signal);
            out.push(`## ${t.label}\n\n`);
            for (const m of [t.user, ...t.replies]) if (m) out.push(`**${whoOf(t, m)}**\n\n${md(m.content)}${imgs(m)}\n\n`);
            if (ctx.opts.alts && t.alts.length) {
                out.push(`<details><summary>다른 버전 ${t.alts.length}개</summary>\n\n`);
                t.alts.forEach((m, i) => out.push(`**버전 ${i + 1}**\n\n${md(m.content)}\n\n`));
                out.push('</details>\n\n');
            }
        }
        return out.done();
    }

    // ---------- JSON ----------
    // A plain `title` + `messages[].role/content` shape that other tools can read; the rest rides along.
    async function buildJson(ctx, turns, part, signal) {
        const d = describe(ctx), s = computeStats(turns), mem = memoriesOf(ctx);
        const brief = x => ({ id: x.id, content: x.content, createdAt: x.createdAt?.toISOString() || null, model: x.model || undefined });
        const head = JSON.stringify({
            title: d.title,
            meta: {
                title: d.title, chatTitle: d.chatTitle || undefined, model: d.model || undefined, chatId: ctx.chatId, storyId: ctx.storyId,
                savedAt: ctx.now.toISOString(), app: `${APP.name} ${APP.version}`, range: rangeLabel(turns), part: part || undefined,
                userNote: ctx.opts.info && d.userNote ? d.userNote : undefined, notes: ctx.notes.length ? ctx.notes : undefined,
                stats: ctx.opts.stats ? { turns: s.turns, userChars: s.userChars, aiChars: s.aiChars, rerolls: s.rerolls, images: s.images, first: s.first?.toISOString() || null, last: s.last?.toISOString() || null } : undefined,
                memories: mem.length ? mem.map(m => ({ title: m.title, summary: m.summary, createdAt: m.createdAt?.toISOString() || null })) : undefined,
                // The text below went through these cleaning rules (so the file says it is not the raw text).
                cleaned: ctx.opts.clean?.on ? Object.entries(cleaningFor(ctx.opts)).filter(([k, v]) => k !== 'on' && v && v !== 'keep').map(([k, v]) => v === true ? k : `${k}:${v}`) : undefined,
            },
        }, null, 2);
        const out = pieces(head.slice(0, -2), ',\n  "messages": [\n');
        const links = showImages(ctx.opts);
        // One row per line, written as it is made (", " goes in front of every row but the first).
        let rows = 0;
        for (const [i, t] of turns.entries()) {
            await breathe(signal);
            const no = turnNo(t) ?? i + 1;
            for (const m of [t.user, ...t.replies]) {
                if (!m) continue;
                const row = { role: m.role, content: m.content, turn: no, id: m.id, createdAt: m.createdAt?.toISOString() || null };
                if (m.role !== 'user' && m.model) row.model = m.model;
                if (links && m.images.length) row.images = m.images;
                if (m.status && m.status !== 'end') row.status = m.status;
                if (t.prologue) row.prologue = true;
                // Other versions ride on the reply they stand in for.
                const mine = ctx.opts.alts && m.role !== 'user' ? t.alts.filter(a => a.parentTurnId === m.parentTurnId) : [];
                if (mine.length) row.alternates = mine.map(brief);
                out.push(`${rows++ ? ',\n' : ''}    ${JSON.stringify(row)}`);
            }
        }
        out.push(rows ? '\n  ]\n}\n' : '  ]\n}\n');
        return out.done();
    }

    // ---------- ZIP (stored, no compression) ----------
    // Slicing-by-8: table k (at k * 256) advances a byte through k more zero bytes, so 8 bytes take 8 lookups.
    const CRC_TABLE = (() => { const t = new Uint32Array(2048); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } for (let i = 256; i < 2048; i++) t[i] = t[t[i - 256] & 255] ^ (t[i - 256] >>> 8); return t; })();
    const crcStep = (c, u8) => {
        const T = CRC_TABLE;
        let i = 0;
        for (const end = u8.length - 7; i < end; i += 8) {
            const a = c ^ (u8[i] | u8[i + 1] << 8 | u8[i + 2] << 16 | u8[i + 3] << 24);
            c = T[1792 + (a & 255)] ^ T[1536 + (a >>> 8 & 255)] ^ T[1280 + (a >>> 16 & 255)] ^ T[1024 + (a >>> 24)] ^ T[768 + u8[i + 4]] ^ T[512 + u8[i + 5]] ^ T[256 + u8[i + 6]] ^ T[u8[i + 7]];
        }
        for (; i < u8.length; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8);
        return c;
    };
    const crc32 = u8 => (crcStep(0xFFFFFFFF, u8) ^ 0xFFFFFFFF) >>> 0;
    async function crcOf(data) {
        if (!(data instanceof Blob)) return crc32(data);
        let c = 0xFFFFFFFF;
        for (let off = 0; off < data.size; off += 4 << 20) c = crcStep(c, new Uint8Array(await data.slice(off, off + (4 << 20)).arrayBuffer()));
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    // Entries may be strings, bytes or Blobs; Blobs are read in 4 MB slices for the checksum and then referenced as
    // they are, so bundling big files does not copy them into memory.
    async function makeZip(entries, type = 'application/zip') {
        const enc = new TextEncoder(), parts = [], central = [];
        let offset = 0, centralSize = 0;
        const d = new Date();
        const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        for (const e of entries) {
            await breathe();
            const name = enc.encode(e.name), data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
            const size = data instanceof Blob ? data.size : data.length, crc = await crcOf(data);
            const flags = /^[\x20-\x7e]*$/.test(e.name) ? 0 : 0x0800; // UTF-8 names
            const h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, flags, true); h.setUint16(8, 0, true);
            h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
            h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
            parts.push(h.buffer, name, data);
            const c = new DataView(new ArrayBuffer(46));
            c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, flags, true); c.setUint16(10, 0, true);
            c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
            c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
            central.push(c.buffer, name);
            centralSize += 46 + name.length;
            offset += 30 + name.length + size;
        }
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, centralSize, true); end.setUint32(16, offset, true);
        return new Blob([...parts, ...central, end.buffer], { type });
    }

    // ---------- EPUB ----------
    async function buildEpub(ctx, turns, part, signal) {
        const d = describe(ctx), s = ctx.opts.stats ? computeStats(turns) : null, mem = memoriesOf(ctx);
        // XML forbids most control characters: a vertical tab or form feed becomes a line break, the rest go.
        const x = v => esc(String(v ?? '').replace(/[\u000B\u000C]/g, '\n').replace(/[\u0000-\u0008\u000E-\u001F￾￿]/g, '')).replace(/&#39;/g, '&#x27;');
        const para = text => inline(x(text)).replace(/\n/g, '<br/>');
        const page = (title, inner) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko" lang="ko"><head><meta charset="utf-8"/><title>${x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${inner}</body></html>`;
        // 50 turns per chapter; the prologue rides with the first chapter without counting as a turn.
        const CH = 50, chapters = [], lead = turns[0]?.prologue ? 1 : 0;
        for (let i = lead; i < turns.length; i += CH) chapters.push(turns.slice(i === lead ? 0 : i, i + CH));
        if (!chapters.length) chapters.push(turns);
        // Without real numbers every chapter would read "50턴": name it by its first and last turn instead.
        const chLabel = list => {
            const ts = list.filter(t => !t.prologue);
            if (!ts.length || ts.some(t => t.no !== null)) return rangeLabel(list);
            const a = ts[0].label, b = ts[ts.length - 1].label;
            return a === b ? a : `${a} – ${b}`;
        };
        const links = showImages(ctx.opts);
        const msg = (m, who) => `<div class="m ${m.role === 'user' ? 'u' : 'a'}"><p class="who">${x(who)}</p><p>${para(m.content)}</p>${links && m.images.length ? `<p class="img">${m.images.map((u, i) => `<a href="${x(u)}">이미지 ${i + 1}</a>`).join(' · ')}</p>` : ''}</div>`;
        const files = [];
        const info = `<h1>${x(d.title)}</h1><p class="sub">${x(rangeLabel(turns))}${part ? ` · ${x(part)}` : ''} · ${x(fmtDate(ctx.now))} 저장</p>${s ? `<p class="sub">${x(statsLine(s))}</p>` : ''}${ctx.notes.map(n => `<p class="sub">${x(n)}</p>`).join('')}${ctx.opts.info && d.userNote ? `<h2>유저노트</h2><p>${para(d.userNote)}</p>` : ''}${mem.length ? `<h2>장기기억 ${x(num(mem.length))}개</h2><ol class="mem">${mem.map(m => `<li>${m.title ? `<b>${x(m.title)}</b> ` : ''}${x(m.summary)}</li>`).join('')}</ol>` : ''}`;
        files.push({ name: 'OEBPS/info.xhtml', data: page(d.title, info) });
        for (const [i, list] of chapters.entries()) {
            await breathe(signal);
            const inner = list.map(t => `<section class="t"><h2>${x(t.label)}</h2>${[t.user, ...t.replies].filter(Boolean).map(m => msg(m, whoOf(t, m))).join('')}${ctx.opts.alts && t.alts.length ? `<div class="alt"><p class="who">다른 버전 ${t.alts.length}개</p>${t.alts.map((m, k) => msg(m, `버전 ${k + 1}`)).join('')}</div>` : ''}</section>`).join('');
            // A Blob per chapter right away: the book is never held as strings and bytes at once (makeZip takes Blobs).
            files.push({ name: `OEBPS/c${String(i + 1).padStart(5, '0')}.xhtml`, data: new Blob([page(chLabel(list), inner)]) });
        }
        const css = 'body{font-family:serif;line-height:1.7;margin:0 4%}h1{font-size:1.5em}h2{font-size:.85em;color:#777;margin:1.6em 0 .4em}.sub{color:#777;font-size:.85em;margin:.2em 0}.m{margin:.6em 0}.who{font-size:.8em;font-weight:bold;color:#777;margin:0}.u p{color:#3a3a8a}em{color:#666}.alt{border-left:2px solid #ccc;padding-left:.8em;margin-top:.6em}.img{font-size:.8em}.mem{font-size:.9em;padding-left:1.4em}.mem li{margin:.3em 0}';
        const ids = files.map((f, i) => ({ id: i === 0 ? 'info' : `c${i}`, href: f.name.replace('OEBPS/', '') }));
        const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
        const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ko"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:uuid:${uid}</dc:identifier><dc:title>${x(d.title)} · ${x(rangeLabel(turns))}</dc:title><dc:language>ko</dc:language><dc:creator>크랙</dc:creator><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${ids.map(i => `<item id="${i.id}" href="${i.href}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${ids.map(i => `<itemref idref="${i.id}"/>`).join('')}</spine></package>`;
        const nav = page('목차', `<nav epub:type="toc" id="toc"><h1>목차</h1><ol><li><a href="info.xhtml">정보</a></li>${chapters.map((list, i) => `<li><a href="${ids[i + 1].href}">${x(chLabel(list))}</a></li>`).join('')}</ol></nav>`);
        const container = '<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
        return makeZip([
            { name: 'mimetype', data: 'application/epub+zip' },
            { name: 'META-INF/container.xml', data: container },
            { name: 'OEBPS/content.opf', data: opf },
            { name: 'OEBPS/nav.xhtml', data: nav },
            { name: 'OEBPS/style.css', data: css },
            ...files,
        ], 'application/epub+zip');
    }

    // ---------- export ----------
    const FORMATS = {
        txt: { label: 'TXT', ext: 'txt', type: 'text/plain;charset=utf-8', build: buildTxt, hint: '턴 단위로 나눈 텍스트' },
        html: { label: 'HTML', ext: 'html', type: 'text/html;charset=utf-8', build: buildHtml, hint: '브라우저로 여는 읽기용 파일 (이미지 표시, 검색, 턴 번호로 이동)' },
        md: { label: 'MD', ext: 'md', type: 'text/markdown;charset=utf-8', build: buildMd, hint: 'Markdown · 노션, 옵시디언 같은 메모 앱용' },
        json: { label: 'JSON', ext: 'json', type: 'application/json;charset=utf-8', build: buildJson, hint: '다른 도구로 다시 가공하기 좋은 데이터 (청소 설정이 적용돼요)' },
        epub: { label: 'EPUB', ext: 'epub', type: 'application/epub+zip', build: buildEpub, hint: '전자책 앱으로 소설처럼 읽기' },
    };

    async function makeFiles(ctx, turns, signal) {
        const chunks = [];
        // N turns per file (HTML at most HTML_PART); the prologue rides with the first file without counting as a turn.
        let size = ctx.opts.split ? Math.max(10, Number(ctx.opts.splitSize) || 1000) : Infinity;
        if (ctx.opts.format === 'html') size = Math.min(size, HTML_PART);
        const lead = turns[0]?.prologue ? 1 : 0;
        if (turns.length - lead > size) for (let i = lead; i < turns.length; i += size) chunks.push(turns.slice(i === lead ? 0 : i, i + size));
        else chunks.push(turns);
        const base = `${fileSafe(describe(ctx).title)}_${stamp(ctx.now)}`, f = FORMATS[ctx.opts.format] || FORMATS.txt;
        const files = [];
        for (let i = 0; i < chunks.length; i++) {
            const list = chunks[i], part = chunks.length > 1 ? `${i + 1}/${chunks.length}` : '';
            const out = await f.build(ctx, list, part, signal);
            files.push({ name: `${base}_${rangeLabel(list)}${chunks.length > 1 ? `_${i + 1}of${chunks.length}` : ''}.${f.ext}`, blob: out instanceof Blob ? out : new Blob(out, { type: f.type }) });
        }
        return files;
    }

    async function bundle(files, ctx) {
        if (!ctx.opts.zip || files.length < 2) return files;
        return [{ name: `${fileSafe(describe(ctx).title)}_${stamp(ctx.now)}.zip`, blob: await makeZip(files.map(f => ({ name: f.name, data: f.blob }))) }];
    }

    // Files go out 400 ms apart (browsers drop downloads that start too close together). A cancel stops before the
    // next file is handed to the browser; the save is done as soon as the last file is out.
    async function download(files, signal) {
        for (const [i, f] of files.entries()) {
            if (i) await wait(400);
            if (signal?.aborted) throw cancelled();
            const url = URL.createObjectURL(f.blob), a = document.createElement('a');
            a.href = url; a.download = f.name; a.style.display = 'none';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 120000);
        }
    }
    const io = { download };

    // ---------- saved point ----------
    const CK_PREFIX = 'checkpoint:';
    const ckKey = chatId => `${CK_PREFIX}${chatId}`;
    const getCheckpoint = chatId => { try { return GM_getValue(ckKey(chatId), null); } catch { return null; } };
    function setCheckpoint(chatId, turns) {
        const last = turns[turns.length - 1];
        if (!last) return;
        const leaf = last.replies[last.replies.length - 1] || last.user;
        const no = last.prologue ? 0 : last.no;
        try { GM_setValue(ckKey(chatId), { userTurnId: last.user?.turnId || null, leafTurnId: leaf?.turnId || null, no: Number.isFinite(no) ? no : null, at: Date.now() }); } catch {}
    }
    // Saved points of every room (the saved options stay).
    const savedKeys = () => { try { return (GM_listValues() || []).filter(k => String(k).startsWith(CK_PREFIX)); } catch { return []; } };
    const wipeSaved = () => { const keys = savedKeys(); for (const k of keys) { try { GM_deleteValue(k); } catch {} } return keys.length; };
    const pageTitle = () => hasDom ? document.title.replace(/\s*\|\s*크랙\s*$/, '').trim() : '';

    // `route` is the room the dialog was opened in, so a save never picks up another room after the page moved.
    async function runSave(opts, ui, signal, route = routeChat()) {
        if (!route) throw new Error('채팅방 안에서 눌러 주세요.');
        const title = pageTitle(); // read before the first await: the page may move to another room meanwhile
        const checkpoint = getCheckpoint(route.chatId);
        if (opts.mode === 'new' && !checkpoint) throw new Error('아직 이 방을 저장한 적이 없어요. 먼저 「전체」로 저장해 주세요.');
        const now = new Date(), started = Date.now();
        ui.progress('대화를 받는 중…');
        let enough = null;
        if (opts.mode === 'recent') { const want = Math.max(1, Number(opts.recent) || 1); enough = all => all.reduce((n, m) => n + (m.role === 'user' ? 1 : 0), 0) > want; }
        if (opts.mode === 'new') { const anchor = checkpoint.userTurnId || checkpoint.leafTurnId; enough = all => all.some(m => m.turnId === anchor); }
        let fetched, partial = false;
        try {
            fetched = await fetchMessages(route.chatId, { enough, signal, onProgress: (n, pages) => ui.progress(`메시지 ${num(n)}개 받는 중… (${pages}페이지 · ${Math.round((Date.now() - started) / 1000)}초)`) });
        } catch (error) {
            // A cut-off history can serve 「전체」 and 「최근」. 「구간」 needs real numbers and 「새 턴만」 its saved point,
            // which a cut-off history never reached, so those show the real error instead.
            if (signal.aborted || !error.partial?.length || opts.mode === 'range' || opts.mode === 'new') throw error;
            if (!(await ui.confirmPartial(error.message, error.partial.length))) throw error;
            fetched = { messages: error.partial, complete: false };
            partial = true;
        }
        if (!fetched.messages.length) throw new Error('받은 메시지가 없어요.');
        const { chat, chatError } = await fetchChat(route.chatId, opts, signal);
        const picked = pickTurns(opts.mode, opts, fetched, checkpoint || {});
        fetched = null; // the raw pages are no longer needed; on a very long chat this frees the text before cleaning copies it
        if (picked.lost) throw new Error(picked.note[0]);
        if (!picked.turns.length) throw new Error(opts.mode === 'new' ? '저장한 뒤로 새로 생긴 턴이 없어요.' : '고른 범위에 해당하는 턴이 없어요.');
        const notes = [...picked.note];
        if (partial) notes.push('중간에 받기가 끊겨서 받은 데까지만 저장했어요.');
        if (chatError) notes.push(`작품 정보를 받지 못했어요: ${chatError}`);
        let memories = [];
        if (opts.memory) {
            ui.progress('장기기억을 받는 중…');
            try {
                const got = await fetchMemories(route.chatId, { signal });
                memories = got.memories;
                if (got.failure || got.total > memories.length) notes.push(`장기기억 ${num(got.total)}개 중 ${num(memories.length)}개만 받았어요.${got.failure ? ` (${got.failure})` : ''}`);
            } catch (error) {
                if (signal.aborted) throw error;
                notes.push(`장기기억을 받지 못했어요: ${error.message}`);
            }
        }
        const ctx = { opts, now, chat, notes, memories, chatId: route.chatId, storyId: route.storyId, pageTitle: title };
        ui.progress(`파일을 만드는 중… (${num(picked.turns.length)}턴)`);
        await wait(30, signal);
        // Cleaned 500 turns at a time with pauses in between, so the page stays responsive on huge chats.
        const clean = cleaningFor(opts);
        let removed = 0;
        for (let i = 0; i < picked.turns.length; i += 500) { await breathe(signal); removed += cleanTurns(picked.turns.slice(i, i + 500), clean, { alts: Boolean(opts.alts) }); }
        const files = await bundle(await makeFiles(ctx, picked.turns, signal), ctx);
        await io.download(files, signal);
        // Notes below this line only go to the dialog: the files are already made.
        if (picked.newest && !partial) setCheckpoint(route.chatId, picked.turns);
        else notes.push('이번 저장은 「새 턴만」의 기준 지점을 바꾸지 않았어요.');
        // Several downloads in a row may wait behind the browser's "download multiple files" question.
        if (files.length > 1) notes.unshift(`파일 ${files.length}개를 차례로 내려받아요. 브라우저가 여러 파일 받기를 물으면 허용해 주세요.`);
        const total = picked.turns.filter(t => !t.prologue).length;
        if (opts.format === 'html' && total > HTML_PART && !(opts.split && opts.splitSize <= HTML_PART)) notes.push(`HTML은 한 파일이 너무 길면 브라우저가 끝부분을 보여 주지 못해서 ${num(HTML_PART)}턴씩 나눠 저장했어요.`);
        return `${num(total)}턴을 파일 ${files.length}개로 저장했어요.${memories.length ? ` 장기기억 ${num(memories.length)}개도 넣었어요.` : ''}${removed > 0 ? ` 청소로 ${num(removed)}자를 덜어냈어요.` : ''}${notes.length ? `\n${notes.join('\n')}` : ''}`;
    }

    // ---------- dialog (built only when opened) ----------
    const loadOpts = () => {
        let v = null;
        try { v = GM_getValue('options', null); } catch {}
        const o = { ...DEFAULTS, ...(v || {}), clean: { ...DEFAULTS.clean, ...(v?.clean || {}) } };
        // 1.0/1.1 kept several formats and a reroll mode; keep the first chosen format and the reroll choice.
        if (!v?.format && v?.formats) o.format = Object.keys(FORMATS).find(k => v.formats[k]) || DEFAULTS.format;
        if (v?.rerolls && v.alts === undefined) o.alts = v.rerolls === 'all';
        if (!FORMATS[o.format]) o.format = DEFAULTS.format;
        // 1.3 changed two defaults that 1.2 stored with every save: ZIP now starts off (kept on for anyone who splits
        // files, so they do not get a burst of downloads) and lore blocks are now removed (1.2 started that rule off,
        // so a stored "off" is almost always just the old default). Image links follow the image cleaning rules.
        if (v && !v.rev) {
            if (!v.split) o.zip = DEFAULTS.zip;
            o.clean.loreOoc = DEFAULTS.clean.loreOoc;
        }
        o.rev = 2;
        delete o.formats; delete o.rerolls; delete o.showButton; delete o.images;
        return o;
    };
    const saveOpts = o => { try { GM_setValue('options', o); } catch {} };

    // Material Symbols (Outlined, weight 400), the same family as Crack's own panel icons.
    const ICONS = {
        arrow: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200Z',
        tray: 'M240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
        error: 'M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
        article: 'M280-280h280v-80H280v80Zm0-160h400v-80H280v80Zm0-160h400v-80H280v80Zm-80 480q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z',
        clean: 'M120-40v-280q0-83 58.5-141.5T320-520h40v-320q0-33 23.5-56.5T440-920h80q33 0 56.5 23.5T600-840v320h40q83 0 141.5 58.5T840-320v280H120Zm80-80h80v-120q0-17 11.5-28.5T320-280q17 0 28.5 11.5T360-240v120h80v-120q0-17 11.5-28.5T480-280q17 0 28.5 11.5T520-240v120h80v-120q0-17 11.5-28.5T640-280q17 0 28.5 11.5T680-240v120h80v-200q0-50-35-85t-85-35H320q-50 0-85 35t-35 85v200Zm320-400v-320h-80v320h80Zm0 0h-80 80Z',
        tune: 'M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z',
        hideImage: 'm840-234-80-80v-446H314l-80-80h526q33 0 56.5 23.5T840-760v526ZM792-56l-64-64H200q-33 0-56.5-23.5T120-200v-528l-64-64 56-56 736 736-56 56ZM240-280l120-160 90 120 33-44-283-283v447h447l-80-80H240Zm297-257ZM424-424Z',
        linkOff: 'm770-302-60-62q40-11 65-42.5t25-73.5q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 57-29.5 105T770-302ZM634-440l-80-80h86v80h-6ZM792-56 56-792l56-56 736 736-56 56ZM440-280H280q-83 0-141.5-58.5T80-480q0-69 42-123t108-71l74 74h-24q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h65l79 80H320Z',
        codeOff: 'M791-55 280-566l-87 87 183 183-56 56L80-480l143-143L55-791l57-57 736 736-57 57Zm-54-282-57-57 87-87-183-183 56-56 240 240-143 143Z',
        lineSpacing: 'M240-160 80-320l56-56 64 62v-332l-64 62-56-56 160-160 160 160-56 56-64-62v332l64-62 56 56-160 160Zm240-40v-80h400v80H480Zm0-240v-80h400v80H480Zm0-240v-80h400v80H480Z',
        formatClear: 'm528-546-93-93-121-121h486v120H568l-40 94ZM792-56 460-388l-80 188H249l119-280L56-792l56-56 736 736-56 56Z',
        code: 'M320-240 80-480l240-240 57 57-184 184 183 183-56 56Zm320 0-57-57 184-184-183-183 56-56 240 240-240 240Z',
        notesOff: 'M280-400q-17 0-28.5-11.5T240-440q0-17 11.5-28.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400Zm548 154-74-74h46v-480H274l-80-80h606q33 0 56.5 23.5T880-800v480q0 26-14.5 45.5T828-246ZM554-520l-80-80h246v80H554ZM820-28 606-240H240L80-80v-688l-52-52 56-56L876-84l-56 56ZM344-504Zm170-56Zm-234 40q-17 0-28.5-11.5T240-560q0-17 11.5-28.5T280-600q17 0 28.5 11.5T320-560q0 17-11.5 28.5T280-520Zm154-120-34-34v-46h320v80H434Zm-274-48v413l46-45h322L160-688Z',
        book: 'M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z',
        info: 'M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
        memory: 'M390-120q-51 0-88-35.5T260-241q-60-8-100-53t-40-106q0-21 5.5-41.5T142-480q-11-18-16.5-38t-5.5-42q0-61 40-105.5t99-52.5q3-51 41-86.5t90-35.5q26 0 48.5 10t41.5 27q18-17 41-27t49-10q52 0 89.5 35t40.5 86q59 8 99.5 53T840-560q0 22-5.5 42T818-480q11 18 16.5 38.5T840-400q0 62-40.5 106.5T699-241q-5 50-41.5 85.5T570-120q-25 0-48.5-9.5T480-156q-19 17-42 26.5t-48 9.5Zm130-590v460q0 21 14.5 35.5T570-200q20 0 34.5-16t15.5-36q-21-8-38.5-21.5T550-306q-10-14-7.5-30t16.5-26q14-10 30-7.5t26 16.5q11 16 28 24.5t37 8.5q33 0 56.5-23.5T760-400q0-5-.5-10t-2.5-10q-17 10-36.5 15t-40.5 5q-17 0-28.5-11.5T640-440q0-17 11.5-28.5T680-480q33 0 56.5-23.5T760-560q0-33-23.5-56T680-640q-11 18-28.5 31.5T613-587q-16 6-31-1t-20-23q-5-16 1.5-31t22.5-20q15-5 24.5-18t9.5-30q0-21-14.5-35.5T570-760q-21 0-35.5 14.5T520-710Zm-80 460v-460q0-21-14.5-35.5T390-760q-21 0-35.5 14.5T340-710q0 16 9 29.5t24 18.5q16 5 23 20t2 31q-6 16-21 23t-31 1q-21-8-38.5-21.5T279-640q-32 1-55.5 24.5T200-560q0 33 23.5 56.5T280-480q17 0 28.5 11.5T320-440q0 17-11.5 28.5T280-400q-21 0-40.5-5T203-420q-2 5-2.5 10t-.5 10q0 33 23.5 56.5T280-320q20 0 37-8.5t28-24.5q10-14 26-16.5t30 7.5q14 10 16.5 26t-7.5 30q-14 19-32 33t-39 22q1 20 16 35.5t35 15.5q21 0 35.5-14.5T440-250Zm40-230Z',
        chart: 'M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z',
        layers: 'M480-118 120-398l66-50 294 228 294-228 66 50-360 280Zm0-202L120-600l360-280 360 280-360 280Zm0-280Zm0 178 230-178-230-178-230 178 230 178Z',
        split: 'M200-520q-33 0-56.5-23.5T120-600v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v160q0 33-23.5 56.5T760-520H200Zm0-80h560v-160H200v160Zm0 480q-33 0-56.5-23.5T120-200v-160q0-33 23.5-56.5T200-440h560q33 0 56.5 23.5T840-360v160q0 33-23.5 56.5T760-120H200Zm0-80h560v-160H200v160Zm0-400v-160 160Zm0 400v-160 160Z',
        zip: 'M640-480v-80h80v80h-80Zm0 80h-80v-80h80v80Zm0 80v-80h80v80h-80ZM447-640l-80-80H160v480h400v-80h80v80h160v-400H640v80h-80v-80H447ZM160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80v-480 480Z',
    };
    const svg = (name, cls) => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 -960 960 960" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

    // One glass layer only (the dialog). The scrim is a plain tint, sections are translucent fills without blur, and
    // every animation moves only transform/opacity (only the one-shot check mark draws a stroke). Nothing keeps running
    // once the dialog has opened. Crack's own
    // theme variables (set on body[data-theme]) pass into the shadow root; the values after the commas are fallbacks.
    const UI_CSS = `
:host{all:initial}
.v{
 --ink:var(--text_primary,#1a1918);--sub:var(--text_secondary,#61605a);--mute:var(--text_tertiary,#85837d);
 --key:var(--surface_primary,#0d0d0c);--on-key:var(--bg_screen,#fff);
 --glass:rgba(250,250,248,.74);--solid:#f7f7f5;--sheen:rgba(255,255,255,.6);--rim:rgba(0,0,0,.07);
 --spec:linear-gradient(165deg,rgba(255,255,255,.95),rgba(255,255,255,.3) 26%,rgba(255,255,255,0) 52%,rgba(255,255,255,.45));
 --fill:rgba(255,255,255,.58);--line:rgba(13,13,12,.075);--well:rgba(13,13,12,.06);
 --thumb:#fff;--thumb-sh:0 1px 1px rgba(0,0,0,.04),0 3px 10px rgba(0,0,0,.10);
 --track:rgba(13,13,12,.15);--knob:#fff;--knob-on:#fff;--knob-sh:0 1px 2px rgba(0,0,0,.14),0 3px 8px rgba(0,0,0,.10);
 --scrim:rgba(12,12,11,.32);--shadow:0 30px 70px -18px rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.08);
 --err:#cf3a22;--err-soft:rgba(207,58,34,.09);
 font-family:Pretendard,"Pretendard Variable","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;line-height:1.45;color:var(--ink);
 -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;color-scheme:light}
.v[data-theme=dark]{
 --ink:var(--text_primary,#f0efeb);--sub:var(--text_secondary,#a8a69f);--mute:var(--text_tertiary,#85837d);
 --key:var(--surface_primary,#fcfcfa);--on-key:var(--bg_screen,#141413);
 --glass:rgba(30,30,28,.68);--solid:#1d1d1b;--sheen:rgba(255,255,255,.06);--rim:rgba(0,0,0,.55);
 --spec:linear-gradient(165deg,rgba(255,255,255,.30),rgba(255,255,255,.07) 28%,rgba(255,255,255,0) 55%,rgba(255,255,255,.12));
 --fill:rgba(255,255,255,.045);--line:rgba(255,255,255,.075);--well:rgba(0,0,0,.30);
 --thumb:rgba(255,255,255,.16);--thumb-sh:inset 0 1px 0 rgba(255,255,255,.14),0 3px 10px rgba(0,0,0,.35);
 --track:rgba(255,255,255,.17);--knob:#dcdbd6;--knob-on:#141413;--knob-sh:0 2px 6px rgba(0,0,0,.4);
 --scrim:rgba(0,0,0,.5);--shadow:0 30px 80px -16px rgba(0,0,0,.75),0 6px 18px rgba(0,0,0,.35);
 --err:#ff7d66;--err-soft:rgba(255,125,102,.12);color-scheme:dark}
.v *,.v *::before,.v *::after{box-sizing:border-box}
.scrim{position:fixed;inset:0;z-index:2147483600;background:var(--scrim);animation:fade .22s ease-out backwards}
.wrap{position:fixed;inset:0;z-index:2147483601;display:grid;place-items:center;padding:16px}
.dlg{position:relative;width:min(460px,100%);height:min(620px,calc(100vh - 32px));height:min(620px,calc(100dvh - 32px));display:flex;flex-direction:column;overflow:hidden;border-radius:28px;
 background:linear-gradient(180deg,var(--sheen),transparent 150px),var(--glass);
 -webkit-backdrop-filter:blur(24px) saturate(1.7);backdrop-filter:blur(24px) saturate(1.7);
 box-shadow:var(--shadow),0 0 0 1px var(--rim);animation:rise .34s cubic-bezier(.2,.9,.3,1.06) backwards}
.dlg::before{content:"";position:absolute;inset:0;z-index:3;border-radius:inherit;padding:1px;background:var(--spec);pointer-events:none;
 -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.dlg{background:var(--solid)}}
@media (prefers-reduced-transparency:reduce){.dlg{background:var(--solid);-webkit-backdrop-filter:none;backdrop-filter:none}}
.v.out .scrim{opacity:0;transition:opacity .18s ease}
.v.out .dlg{opacity:0;transform:translateY(10px) scale(.97);transition:opacity .18s ease,transform .18s ease}

.hd{display:flex;align-items:center;gap:12px;padding:20px 20px 14px}
/* Header icon = the save state: the arrow drops in on open, keeps falling into the tray while saving (with a ring
   running around the tile), turns into a drawn check when done, and shakes into an alert on errors. */
.ic{position:relative;flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink)}
.ic::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 2px var(--key);opacity:0;pointer-events:none}
.ic>.glyph,.ic>.arrow{grid-area:1/1}
.glyph{display:block;width:22px;height:22px;overflow:visible}
.glyph path{transform-box:fill-box;transform-origin:center;transition:opacity .2s,transform .3s cubic-bezier(.3,1.4,.5,1)}
.glyph .tray,.arrow,.glyph .bad{fill:currentColor}
/* The arrow and the ring move whole boxes, not SVG geometry, so the compositor runs them while saving (an animated
   SVG shape would re-layout and repaint Crack's whole page every frame). */
.arrow{transform-origin:50% 41.7%;transition:opacity .2s,transform .3s cubic-bezier(.3,1.4,.5,1);animation:drop .55s cubic-bezier(.3,1.5,.5,1) .15s backwards}
.glyph .ok{fill:none;stroke:currentColor;stroke-width:96;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;opacity:0}
.glyph .bad{opacity:0;transform:scale(.6)}
.ring{position:absolute;inset:-4px;border-radius:16px;padding:2px;overflow:hidden;opacity:0;transition:opacity .25s;pointer-events:none;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.ring::before{content:"";position:absolute;inset:-50%;background:conic-gradient(var(--key) 0 .24turn,transparent 0)}
.dlg[data-state=busy] .ring{opacity:1}
.dlg[data-state=busy] .ring::before{animation:orbit 1.3s linear infinite}
.dlg[data-state=busy] .arrow{animation:fall 1.05s cubic-bezier(.5,0,.4,1) infinite}
.dlg[data-state=done] .arrow,.dlg[data-state=done] .glyph .tray,.dlg[data-state=error] .arrow,.dlg[data-state=error] .glyph .tray{opacity:0;transform:scale(.6)}
.dlg[data-state=done] .glyph .ok{opacity:1;animation:draw .5s .08s cubic-bezier(.6,0,.2,1) forwards}
.dlg[data-state=done] .ic::after{animation:pulse .75s ease-out}
.dlg[data-state=error] .glyph .bad{opacity:1;transform:none}
.dlg[data-state=error] .ic{color:var(--err);animation:shake .45s ease}
.ttl{min-width:0}
.ttl h2{margin:0;font-size:19px;font-weight:700;letter-spacing:-.2px;line-height:1.3}
.ttl p{margin:2px 0 0;font-size:12px;font-weight:500;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.tabbar{--i:0;position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));margin:0 20px;border-bottom:1px solid var(--line)}
.tabbar .thumb{position:absolute;left:0;bottom:-1px;height:2px;width:calc(100% / var(--n));border-radius:2px;background:var(--key);transform:translateX(calc(var(--i) * 100%));transition:transform .34s cubic-bezier(.3,1.2,.45,1)}
.tabbar label{position:relative;height:42px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:600;color:var(--mute);cursor:pointer;user-select:none;transition:color .2s}
.tabbar .ti{flex:none;width:18px;height:18px;fill:currentColor}
.tabbar label.on .ti{animation:pop .45s cubic-bezier(.3,1.6,.5,1)}
.tabbar label.on[data-k=clean] .ti{transform-origin:50% 90%;animation:sweep .6s ease}
.tabbar label.on{color:var(--ink)}
.tabbar input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
/* Focus rings are drawn on a box right after the (hidden) radio, so they work without :has(). */
.tabbar .fx,.seg .fx{position:absolute;inset:0;border-radius:inherit;pointer-events:none}
.tabbar input:focus-visible+.fx{outline:2px solid var(--key);outline-offset:-5px;border-radius:10px}

/* Fixed-height dialog; tabs share one grid cell and each scrolls on its own (only 청소 is long enough to). The body
   clips sideways, so a tab sliding in never adds a horizontal scrollbar for a frame. */
.bd{flex:1;min-height:0;display:grid;overflow:hidden}
.pane{grid-area:1/1;min-width:0;min-height:0;overflow:hidden auto;padding:16px 16px 6px;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--track) transparent;visibility:hidden;pointer-events:none}
.dlg[data-tab=main] [data-pane=main],.dlg[data-tab=clean] [data-pane=clean],.dlg[data-tab=more] [data-pane=more]{visibility:visible;pointer-events:auto;animation:pane .28s cubic-bezier(.2,.8,.2,1) backwards}
.sec{margin:0 0 16px}
.sec>h3{margin:0 6px 7px;font-size:12px;font-weight:600;color:var(--mute);letter-spacing:.2px}
.hint{margin:8px 6px 0;font-size:12.5px;font-weight:500;color:var(--sub)}

.seg{--i:0;position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));padding:3px;border-radius:14px;background:var(--well)}
.seg .thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px) / var(--n));border-radius:11px;background:var(--thumb);box-shadow:var(--thumb-sh);
 transform:translateX(calc(var(--i) * 100%));transition:transform .34s cubic-bezier(.3,1.3,.45,1)}
.seg:active .thumb{transform:translateX(calc(var(--i) * 100%)) scale(.96)}
.seg label{position:relative;z-index:1;min-width:0;height:36px;display:grid;place-items:center;padding:0 4px;border-radius:11px;font-size:13px;font-weight:600;color:var(--sub);white-space:nowrap;cursor:pointer;user-select:none;transition:color .2s}
.seg label.on{color:var(--ink)}
.seg label.off{opacity:.35;cursor:not-allowed}
.seg input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.seg input:focus-visible+.fx{outline:2px solid var(--key);outline-offset:-2px}
.seg.sm label{height:30px;font-size:12px}
.seg.sm{border-radius:12px}.seg.sm .thumb{border-radius:9px}

.extra{display:grid;align-items:center;min-height:38px;margin-top:8px;padding:0 6px}
.extra>*{grid-area:1/1;display:none;margin:0;align-items:center;gap:8px;font-size:13.5px;font-weight:500}
.extra>p{font-size:12.5px;color:var(--sub)}
.dlg[data-mode=all] [data-for=all],.dlg[data-mode=new] [data-for=new],.dlg[data-mode=recent] [data-for=recent],.dlg[data-mode=range] [data-for=range]{display:flex;animation:in .22s ease-out backwards}

.num{width:70px;height:34px;padding:0 8px;border:0;border-radius:10px;background:var(--well);color:var(--ink);font:inherit;font-size:14px;font-weight:600;text-align:center;box-shadow:inset 0 0 0 1px var(--line);transition:box-shadow .15s}
.num:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--key)}

.card{border-radius:16px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.card>*{position:relative}
.card>*+*::before{content:"";position:absolute;left:56px;right:0;top:0;height:1px;background:var(--line);pointer-events:none}
/* Row icons: dimmed while the row is off, full colour with a small spring when it is on. */
.ri{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--well);color:var(--mute);transition:color .25s}
.ri svg{width:18px;height:18px;fill:currentColor;transform:scale(.86);transition:transform .4s cubic-bezier(.3,1.7,.5,1)}
.row.lit .ri,.row.fence .ri{color:var(--ink)}
.row.lit .ri svg,.row.fence .ri svg{transform:none}
.row{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 14px;font-size:14px;font-weight:500;cursor:pointer;user-select:none}
.row .t{flex:1;min-width:0}
.row .t small{display:block;margin-top:1px;font-size:12px;font-weight:500;color:var(--mute)}
.row.split{cursor:default}
.row.split .lbl{flex:1;display:flex;align-items:center;gap:12px;align-self:stretch;cursor:pointer}
.row.fence{flex-wrap:wrap;cursor:default;row-gap:8px}
.row.fence .seg{flex:1 1 calc(100% - 42px);margin-left:42px}

.sw-in{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.sw{flex:none;position:relative;width:44px;height:26px;border-radius:13px;background:var(--track);transition:background-color .2s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:11px;background:var(--knob);box-shadow:var(--knob-sh);transition:transform .3s cubic-bezier(.3,1.35,.5,1),width .16s ease}
.sw-in:checked+.sw{background:var(--key)}
.sw-in:checked+.sw::after{transform:translateX(18px);background:var(--knob-on)}
.row:active .sw::after,.lbl:active .sw::after{width:27px}
.row:active .sw-in:checked+.sw::after,.lbl:active .sw-in:checked+.sw::after{transform:translateX(13px)}
.sw-in:focus-visible+.sw{outline:2px solid var(--key);outline-offset:2px}

[data-clean]{transition:opacity .2s}
[data-clean].dim{opacity:.45}

/* Clearing saved history: red row, the bin lid tips open on hover, opens wide when armed, and snaps shut when done. */
.row.danger{width:100%;border:0;background:none;font:inherit;text-align:left;color:var(--err);transition:background-color .2s}
.row.danger .ri{background:var(--err-soft);color:var(--err)}
.row.danger .ri svg{transform:none;overflow:visible}
.row.danger .t small{color:var(--err);opacity:.72}
.row.danger[data-armed]{background:var(--err-soft)}
.row.danger[data-armed] .ri{animation:nudge .4s ease}
.row.danger[data-done] .ri{animation:pop .45s cubic-bezier(.3,1.6,.5,1)}
.row.danger:disabled{cursor:default}
.row.danger:disabled .t,.row.danger:disabled .ri{opacity:.5}
.row.danger[data-done]:disabled .ri{opacity:1}
.row.danger:focus-visible{outline:2px solid var(--err);outline-offset:-2px;border-radius:16px}
.lid{transform-box:fill-box;transform-origin:100% 100%;transition:transform .32s cubic-bezier(.3,1.5,.5,1)}
@media (hover:hover){.row.danger:not(:disabled):hover .lid{transform:rotate(-10deg)}}
.row.danger[data-armed] .lid,.row.danger[data-armed]:hover .lid{transform:rotate(-24deg)}
.hint.warn{color:var(--err);opacity:.85}

.ft{position:relative;display:flex;align-items:center;gap:8px;padding:12px 16px 16px}
.ft::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:var(--line)}
.bar{position:absolute;left:0;right:0;top:0;height:2px;overflow:hidden;opacity:0;transition:opacity .2s}
.bar::before{content:"";position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(90deg,transparent,var(--key),transparent);transform:translateX(-100%)}
.dlg[data-state=busy] .bar{opacity:1}
.dlg[data-state=busy] .bar::before{animation:run 1.1s cubic-bezier(.45,0,.2,1) infinite}
.dlg:focus{outline:none}
.msg{flex:1;min-width:0;max-height:54px;overflow:auto;overscroll-behavior:contain;font-size:12.5px;font-weight:500;color:var(--sub);white-space:pre-line;line-height:1.45}
.msg.err{color:var(--err)}
.btn{flex:none;height:46px;min-width:84px;padding:0 20px;border:0;border-radius:23px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;transition:transform .14s ease,opacity .15s}
.btn.ghost{background:var(--fill);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.btn.key{background:var(--key);color:var(--on-key);box-shadow:0 8px 18px -8px rgba(0,0,0,.5)}
.btn:active{transform:scale(.96)}
.btn:disabled{opacity:.5;cursor:default;transform:none}
.btn:focus-visible{outline:2px solid var(--key);outline-offset:2px}

@keyframes fade{from{opacity:0}}
@keyframes rise{from{opacity:0;transform:translateY(16px) scale(.96)}}
@keyframes in{from{opacity:0;transform:translateY(-4px)}}
@keyframes pane{from{opacity:0;transform:translateX(var(--dx,0px))}}
@keyframes pop{0%{transform:scale(.7)}60%{transform:scale(1.14)}100%{transform:none}}
@keyframes sweep{0%,100%{transform:none}20%{transform:rotate(-16deg)}45%{transform:rotate(12deg)}70%{transform:rotate(-6deg)}}
@keyframes drop{from{opacity:0;transform:translateY(-6.9px)}}
@keyframes fall{0%{opacity:0;transform:translateY(-4.6px)}30%{opacity:1}70%{opacity:1;transform:translateY(.7px)}100%{opacity:0;transform:translateY(1.4px)}}
@keyframes orbit{to{transform:rotate(1turn)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pulse{from{opacity:.55;transform:scale(1)}to{opacity:0;transform:scale(1.5)}}
@keyframes shake{20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
@keyframes run{to{transform:translateX(300%)}}
@keyframes nudge{25%{transform:rotate(-7deg)}50%{transform:rotate(5deg)}75%{transform:rotate(-2deg)}}
@media (max-width:480px){.wrap{padding:10px;align-items:end}.dlg{border-radius:26px;height:min(690px,calc(100dvh - 20px))}
 .ft{flex-wrap:wrap;justify-content:flex-end}.msg{flex-basis:100%;order:-1;max-height:72px}.msg:empty{display:none}}
@media (prefers-reduced-motion:reduce){.v *,.v *::before,.v *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}`;

    const CLEAN_ROWS = [['imageMarkdown', '이미지 마크다운 제거', '', 'hideImage'], ['imageUrls', '이미지 URL 줄 제거', '', 'linkOff'], ['comments', 'HTML · 마크다운 주석 제거', '', 'codeOff'], ['blankLines', '빈 줄 정리', '', 'lineSpacing'], ['markdown', '마크다운 장식 제거', '굵게, 기울임 같은 표시만 빼고 내용은 남겨요', 'formatClear']];
    const INJECT_ROWS = [['wishInject', 'Wish 매니저 주입 블록 제거', 'Wish RP Manager · Core가 숨겨 넣은 기억·인지·시작 설정', 'notesOff'], ['loreOoc', '로어 주입 블록 제거', '&lt;ooc_lore_context&gt; 참고 블록', 'book']];
    const INCLUDE_ROWS = [['info', '작품 정보 · 유저노트', '', 'info'], ['memory', '장기기억', '요약 메모리의 장기 기억 전부', 'memory'], ['stats', '통계', '턴 수, 글자 수, 기간, 이미지 수', 'chart'], ['alts', '리롤된 다른 버전', '', 'layers']];
    const CLEAN_KEYS = ['on', 'imageMarkdown', 'imageUrls', 'comments', 'blankLines', 'markdown', 'wishInject', 'loreOoc'];
    const NEED_SAVE = '「전체」나 「최근」으로 저장하면 쓸 수 있어요';
    const tile = name => `<span class="ri">${svg(name)}</span>`;
    const sw = (name, label, sub = '', icon = '') => `<label class="row">${icon ? tile(icon) : ''}<span class="t">${label}${sub ? `<small>${sub}</small>` : ''}</span><input class="sw-in" type="checkbox" name="${name}"><span class="sw" aria-hidden="true"></span></label>`;
    // Segmented control (also the tab bar): items are [value, label, disabled, icon]; `group` names it for screen readers.
    const seg = (name, items, cls = '', kind = 'seg', group = '') => `<div class="${kind} ${cls}" style="--n:${items.length}" role="radiogroup"${group ? ` aria-label="${group}"` : ''}><i class="thumb" aria-hidden="true"></i>${items.map(([v, l, off, icon]) => `<label class="${off ? 'off' : ''}" data-k="${v}"${off ? ` title="${NEED_SAVE}"` : ''}><input type="radio" name="${name}" value="${v}"${off ? ' disabled' : ''}><i class="fx" aria-hidden="true"></i>${icon ? svg(icon, 'ti') : ''}${l}</label>`).join('')}</div>`;
    // Header glyph: tray + arrow (idle/busy), a drawn check (done), an alert (error), plus a ring that orbits while busy.
    const GLYPH = `<span class="ic"><svg class="glyph" viewBox="0 -960 960 960" aria-hidden="true"><path class="tray" d="${ICONS.tray}"/><path class="ok" d="M250-470 410-310 720-620" pathLength="100"/><path class="bad" d="${ICONS.error}"/></svg><i class="arrow"><svg class="glyph" viewBox="0 -960 960 960" aria-hidden="true"><path d="${ICONS.arrow}"/></svg></i><i class="ring" aria-hidden="true"></i></span>`;
    // Bin with a separate lid so the lid can tip open.
    const BIN = `<span class="ri"><svg viewBox="0 -960 960 960" aria-hidden="true"><path class="lid" d="M160-720v-80h200v-40h240v40h200v80H160Z"/><path d="M200-720h80v520h400v-520h80v520q0 33-23.5 56.5T680-120H280q-33 0-56.5-23.5T200-200v-520Zm160 440h80v-360h-80v360Zm160 0h80v-360h-80v360Z"/></svg></span>`;
    const ckLine = c => `${pageTitle() || '현재 채팅방'} · ${c ? `마지막 저장 ${fmtDate(new Date(c.at))}${Number.isFinite(c.no) ? ` · ${c.no}턴까지` : ''}` : '이어 저장할 기준 지점이 아직 없어요'}`;
    const newHint = c => c ? `마지막 저장${Number.isFinite(c.no) ? `(${c.no}턴)` : ''} 뒤로 새로 생긴 턴만 저장해요.` : '';

    function dialogHtml(ck, theme) {
        return `<style>${UI_CSS}</style><div class="v" data-theme="${theme}"><div class="scrim"></div><div class="wrap"><div class="dlg" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="t">
<div class="hd">${GLYPH}<div class="ttl"><h2 id="t">로그 저장</h2><p data-sub>${esc(ckLine(ck))}</p></div></div>
${seg('tab', [['main', '기본', false, 'article'], ['clean', '청소', false, 'clean'], ['more', '옵션', false, 'tune']], '', 'tabbar', '설정 탭')}
<div class="bd">
<div class="pane" data-pane="main">
<section class="sec"><h3>범위</h3>${seg('mode', [['all', '전체'], ['new', '새 턴만', !ck], ['recent', '최근'], ['range', '구간']], '', 'seg', '범위')}
<div class="extra"><p data-for="all">대화 처음부터 지금까지 모두 저장해요.</p><p data-for="new" data-new-hint>${esc(newHint(ck))}</p>
<div data-for="recent">최근 <input class="num" type="number" name="recent" min="1" inputmode="numeric" aria-label="최근 몇 턴"> 턴</div>
<div data-for="range"><input class="num" type="number" name="from" min="0" inputmode="numeric" aria-label="시작 턴"> 턴부터 <input class="num" type="number" name="to" min="0" inputmode="numeric" aria-label="끝 턴"> 턴까지</div></div></section>
<section class="sec"><h3>형식</h3>${seg('format', Object.entries(FORMATS).map(([k, f]) => [k, f.label]), '', 'seg', '형식')}<p class="hint" data-format-hint></p></section>
<section class="sec"><h3>로컬 데이터</h3><div class="card"><button type="button" class="row danger" data-act="wipe">${BIN}<span class="t"><span data-wipe-label></span><small data-wipe-sub></small></span></button></div>
<p class="hint warn">지금까지 저장한 턴 정보(마지막 저장 지점)를 모든 방에서 지워요. 지운 뒤에는 「새 턴만」을 못 쓰고, 처음부터 다시 저장해야 해요.</p></section>
</div>
<div class="pane" data-pane="clean">
<section class="sec"><div class="card">${sw('c-on', '메시지 청소', '저장할 때 아래 규칙으로 메시지를 정리해요', 'clean')}</div></section>
<section class="sec"><h3>기본 정리</h3><div class="card" data-clean>${CLEAN_ROWS.map(([k, l, s, i]) => sw(`c-${k}`, l, s, i)).join('')}
<div class="row fence">${tile('code')}<span class="t">코드블록</span>${seg('c-codeFence', [['keep', '유지'], ['fences', '경계만 삭제'], ['blocks', '블록 전체 삭제']], 'sm', 'seg', '코드블록')}</div></div></section>
<section class="sec"><h3>확장 프로그램 주입</h3><div class="card" data-clean>${INJECT_ROWS.map(([k, l, s, i]) => sw(`c-${k}`, l, s, i)).join('')}</div>
<p class="hint">RP에는 안 보이지만 메시지 원문에 숨어 있는 참고 블록이에요. 대화 내용은 건드리지 않아요.</p></section>
</div>
<div class="pane" data-pane="more">
<section class="sec"><h3>함께 넣기</h3><div class="card">${INCLUDE_ROWS.map(([k, l, s, i]) => sw(k, l, s, i)).join('')}</div></section>
<section class="sec"><h3>파일</h3><div class="card"><div class="row split">${tile('split')}<input class="num" type="number" name="splitSize" min="10" inputmode="numeric" aria-label="한 파일에 넣을 턴 수"><label class="lbl"><span class="t">턴마다 나눠 저장<small>큰 방은 나누면 파일이 가벼워요</small></span><input class="sw-in" type="checkbox" name="split"><span class="sw" aria-hidden="true"></span></label></div>${sw('zip', '여러 파일은 ZIP 하나로', '', 'zip')}</div></section>
</div>
</div>
<div class="ft"><i class="bar" aria-hidden="true"></i><div class="msg" aria-live="polite"></div><button type="button" class="btn ghost" data-act="close">닫기</button><button type="button" class="btn key" data-act="save">저장</button></div>
</div></div></div>`;
    }

    let openDialog = null;
    function openSaver() {
        if (openDialog?.isConnected) return; // a dialog removed by the page itself does not block a new one
        const route = routeChat();
        if (!route) { alert(`${APP.name}: 채팅방 안에서 눌러 주세요.`); return; }
        const opts = loadOpts(), ck = getCheckpoint(route.chatId);
        if (opts.mode === 'new' && !ck) opts.mode = 'all';
        const theme = document.body?.dataset.theme === 'dark' ? 'dark' : 'light';
        const prevFocus = document.activeElement;
        const host = document.createElement('div'), root = host.attachShadow({ mode: 'open' });
        root.innerHTML = dialogHtml(ck, theme);
        const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
        const v = $('.v'), dlg = $('.dlg'), msg = $('.msg'), saveBtn = $('[data-act="save"]'), closeBtn = $('[data-act="close"]'), wipeBtn = $('[data-act="wipe"]');
        const set = (name, value) => { for (const el of $$(`[name="${name}"]`)) { if (el.type === 'radio') el.checked = el.value === value; else if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = value; } };
        // The sliding thumb follows the checked option; only a CSS variable and a class change.
        const syncSeg = s => { const labels = [...s.querySelectorAll('label')], i = Math.max(0, labels.findIndex(l => l.querySelector('input').checked)); s.style.setProperty('--i', i); labels.forEach((l, k) => l.classList.toggle('on', k === i)); };
        const hint = animate => { const el = $('[data-format-hint]'); el.textContent = FORMATS[($$('[name="format"]').find(x => x.checked) || {}).value]?.hint || ''; if (animate) el.animate([{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' }); };
        const syncClean = () => { const on = $('[name="c-on"]').checked; $$('[data-clean]').forEach(el => el.classList.toggle('dim', !on)); };
        // A row whose switch is on shows its icon at full colour (a class, so it works without :has()).
        const syncLit = () => $$('.row').forEach(r => r.classList.toggle('lit', Boolean(r.querySelector('.sw-in:checked'))));
        set('mode', opts.mode); set('recent', opts.recent); set('from', opts.from); set('to', opts.to); set('format', opts.format); set('splitSize', opts.splitSize);
        for (const k of ['info', 'memory', 'stats', 'alts', 'split', 'zip']) set(k, opts[k]);
        for (const k of CLEAN_KEYS) set(`c-${k}`, opts.clean[k]);
        set('c-codeFence', opts.clean.codeFence);
        set('tab', 'main');
        dlg.dataset.mode = opts.mode; dlg.dataset.tab = 'main';
        const TABS = ['main', 'clean', 'more'];
        $$('.seg, .tabbar').forEach(syncSeg); hint(false); syncClean(); syncLit();
        root.addEventListener('change', e => {
            const t = e.target, s = t.closest('.seg, .tabbar');
            if (s) syncSeg(s);
            if (t.name === 'tab') {
                // The new tab slides in from the side it sits on.
                dlg.style.setProperty('--dx', `${TABS.indexOf(t.value) > TABS.indexOf(dlg.dataset.tab) ? 18 : -18}px`);
                dlg.dataset.tab = t.value;
                return;
            }
            if (t.name === 'mode') dlg.dataset.mode = t.value;
            if (t.name === 'format') hint(true);
            if (t.name === 'c-on') syncClean();
            if (t.classList.contains('sw-in')) syncLit();
        });
        $('[name="splitSize"]').addEventListener('input', () => { set('split', true); syncLit(); });
        // Wheel outside a scrollable tab or message must not scroll the chat behind (that would also re-blur the glass).
        $('.wrap').addEventListener('wheel', e => { const box = e.target.closest('.pane, .msg'); if (!box || box.scrollHeight <= box.clientHeight) e.preventDefault(); }, { passive: false });
        const read = () => {
            const val = n => $(`[name="${n}"]`), radio = n => ($$(`[name="${n}"]`).find(el => el.checked) || {}).value;
            return {
                ...opts, mode: radio('mode') || 'all', recent: Number(val('recent').value) || 50, from: Number(val('from').value) || 0, to: Number(val('to').value) || 0, format: radio('format') || 'txt',
                info: val('info').checked, memory: val('memory').checked, stats: val('stats').checked, alts: val('alts').checked, split: val('split').checked, splitSize: Number(val('splitSize').value) || 1000, zip: val('zip').checked,
                clean: { ...Object.fromEntries(CLEAN_KEYS.map(k => [k, val(`c-${k}`).checked])), codeFence: radio('c-codeFence') || 'keep' },
            };
        };
        // 「새 턴만」 follows whether this room has a saved point.
        const syncSaved = c => {
            const label = $('.seg [data-k="new"]');
            label.classList.toggle('off', !c); label.querySelector('input').disabled = !c;
            if (c) label.removeAttribute('title'); else label.title = NEED_SAVE;
            if (!c && dlg.dataset.mode === 'new') { set('mode', 'all'); dlg.dataset.mode = 'all'; }
            $('[data-sub]').textContent = ckLine(c);
            $('[data-new-hint]').textContent = newHint(c);
            syncSeg(label.parentElement);
        };

        let controller = null, settle = 0, disarm = 0, armedAt = 0, saved = savedKeys().length;
        // A control that gets disabled while it has focus drops focus out of the dialog (and Escape with it).
        const keepFocus = el => { if (root.activeElement === el) dlg.focus({ preventScroll: true }); };
        // Header glyph state: busy while saving, done (check) or error (alert) for a moment, then back to idle.
        const setState = s => { clearTimeout(settle); if (s) dlg.dataset.state = s; else delete dlg.dataset.state; if (s === 'done' || s === 'error') settle = setTimeout(() => setState(''), 2600); };
        // Clearing saved history takes two taps: the first arms it (lid opens) for 3 s, the second clears. The second
        // click of a double-click (or a bouncing button) comes too soon to count.
        const wipeText = (label, sub) => { $('[data-wipe-label]').textContent = label; $('[data-wipe-sub]').textContent = sub; };
        const wipeIdle = () => { clearTimeout(disarm); delete wipeBtn.dataset.armed; delete wipeBtn.dataset.done; if (!saved) keepFocus(wipeBtn); wipeBtn.disabled = !saved; wipeText('저장 기록 비우기', saved ? `방 ${num(saved)}곳의 마지막 저장 지점` : '비울 기록이 없어요'); };
        const onWipe = () => {
            if (!('armed' in wipeBtn.dataset)) { wipeBtn.dataset.armed = ''; armedAt = performance.now(); wipeText('한 번 더 누르면 지워져요', '3초 안에 다시 누르세요'); disarm = setTimeout(wipeIdle, 3000); return; }
            if (performance.now() - armedAt < 500) return;
            clearTimeout(disarm);
            const n = wipeSaved();
            saved = savedKeys().length;
            keepFocus(wipeBtn);
            delete wipeBtn.dataset.armed; wipeBtn.dataset.done = ''; wipeBtn.disabled = true;
            wipeText('비웠어요', `방 ${num(n)}곳의 저장 기록을 지웠어요`);
            syncSaved(null);
        };
        wipeIdle();
        // The dialog belongs to the room it was opened in: going back to another chat closes it.
        const onRoute = () => { if (!controller && routeChat()?.chatId !== route.chatId) close(); };
        const close = () => {
            window.removeEventListener('popstate', onRoute);
            controller?.abort(); clearTimeout(settle); clearTimeout(disarm); openDialog = null;
            v.classList.add('out'); setTimeout(() => host.remove(), 200);
            if (prevFocus?.isConnected) prevFocus.focus?.({ preventScroll: true });
        };
        const ui = {
            progress: text => { msg.classList.remove('err'); msg.textContent = text; },
            confirmPartial: (why, n) => Promise.resolve(confirm(`${why}\n\n받은 메시지 ${num(n)}개만이라도 저장할까요?`)),
        };
        // The backdrop closes the dialog only when the press also started there (a drag out of the dialog does not).
        let pressedBackdrop = false;
        root.addEventListener('pointerdown', e => { pressedBackdrop = e.target === $('.wrap'); });
        root.addEventListener('click', async e => {
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'wipe') { if (!controller) onWipe(); return; }
            if (act === 'close') { if (controller) controller.abort(); else close(); return; }
            if (e.target === $('.wrap') && pressedBackdrop && !controller) return close();
            if (act !== 'save' || controller) return;
            if (routeChat()?.chatId !== route.chatId) return close();
            const o = read();
            if (o.mode === 'range' && o.to < o.from) { msg.classList.add('err'); msg.textContent = '턴 범위를 다시 확인해 주세요.'; return; }
            saveOpts(o);
            controller = new AbortController();
            keepFocus(saveBtn);
            setState('busy'); saveBtn.disabled = true; saveBtn.textContent = '저장 중'; closeBtn.textContent = '취소';
            try {
                msg.classList.remove('err');
                msg.textContent = await runSave(o, ui, controller.signal, route);
                setState('done');
                // After a save, 「새 턴만」 and the history count are up to date without reopening the dialog.
                const c = getCheckpoint(route.chatId);
                if (c) syncSaved(c);
                saved = savedKeys().length; wipeIdle();
            } catch (error) {
                const cancelled = error.name === 'AbortError';
                msg.classList.add('err'); msg.textContent = cancelled ? '취소했어요.' : error.message;
                setState(cancelled ? '' : 'error');
            } finally {
                controller = null; saveBtn.disabled = false; saveBtn.textContent = '저장'; closeBtn.textContent = '닫기';
                if (routeChat()?.chatId !== route.chatId) return close(); // the page moved to another room while saving
                if (!root.activeElement || root.activeElement === dlg) saveBtn.focus({ preventScroll: true });
            }
        });
        // Escape closes; Tab stays inside the dialog (it is modal).
        root.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !controller) close();
            if (e.repeat && e.key === 'Enter' && e.target === wipeBtn) e.preventDefault(); // a held Enter is not a second tap
            if (e.key !== 'Tab') return;
            const first = $('[name="tab"]:checked'), last = saveBtn.disabled ? closeBtn : saveBtn, a = root.activeElement;
            if (e.shiftKey && (!a || a === first || a === dlg)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (!a || a === last)) { e.preventDefault(); first.focus(); }
        });
        document.body.appendChild(host);
        openDialog = host;
        window.addEventListener('popstate', onRoute);
        saveBtn.focus({ preventScroll: true });
    }

    // ---------- 「로그 저장」 row in Crack's right panel ----------
    // Material Symbols "download", the same family as Crack's own panel icons.
    const ICON = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_secondary)" viewBox="0 -960 960 960" width="24" height="24" aria-hidden="true"><path d="${ICONS.arrow}${ICONS.tray}"/></svg>`;
    const ROW_MARK = 'data-crack-transcript';
    const isPanel = el => /\bborder-l\b/.test(el.className) && /\bbg-background\b/.test(el.className);
    function placeRow() {
        if (!routeChat()) return;
        for (const panel of document.querySelectorAll('div.bg-background.border-l')) {
            if (!isPanel(panel) || panel.querySelector(`[${ROW_MARK}]`)) continue;
            // Last row of the 「채팅방 설정」 group, else the row of a known item.
            let anchor = null;
            const heading = [...panel.querySelectorAll('span,p')].find(e => !e.children.length && e.textContent.trim() === '채팅방 설정');
            for (let el = heading?.nextElementSibling; el && el.querySelector?.('[role="button"]'); el = el.nextElementSibling) anchor = el;
            if (!anchor) anchor = [...panel.querySelectorAll('[role="button"]')].find(r => /^(키보드 단축키|요약 메모리|유저 노트)$/.test(r.textContent.trim()))?.parentElement || null;
            const sample = anchor?.querySelector('[role="button"]');
            if (!sample) continue;
            const wrap = document.createElement('div');
            wrap.className = anchor.className;
            wrap.setAttribute(ROW_MARK, '');
            const row = document.createElement('div');
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            row.className = sample.className;
            const inner = document.createElement('span');
            inner.className = sample.firstElementChild?.className || 'flex space-x-2 items-center';
            inner.innerHTML = `${ICON}<span class="${esc(sample.querySelector('span span')?.className || 'whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium')}">로그 저장</span>`;
            row.appendChild(inner);
            // Our own handler only: the event stops here, so Crack's handlers never see a click on this row.
            row.addEventListener('click', e => { e.stopPropagation(); openSaver(); });
            row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openSaver(); } });
            wrap.appendChild(row);
            anchor.after(wrap);
        }
    }

    // The Node test hook (module.exports) loads the script without wiring the page.
    if (hasDom && !(typeof module === 'object' && module.exports)) {
        // The panel row needs no GM API, so it is placed even where the manager has no menu commands.
        if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('로그 저장', openSaver);
        // No observers or intervals: a click (opening the panel, moving to another room) may re-render the panel, so
        // the row is checked shortly after each click, plus a few times while the page first loads.
        let pending = 0;
        const soon = () => { if (!pending) pending = setTimeout(() => { pending = 0; placeRow(); }, 400); };
        document.addEventListener('click', soon, true);
        document.addEventListener('keyup', e => { if (e.ctrlKey || e.metaKey || e.altKey) soon(); }, true);
        window.addEventListener('popstate', soon);
        for (const ms of [0, 1500, 4000]) setTimeout(placeRow, ms);
    }

    // Test hook: Node, or a page that set window.__CT_TEST before loading (never set by the userscript itself).
    const hook = { net, io, runSave, api, fetchMessages, fetchChat, fetchMemories, buildThread, toTurns, numberTurns, pickTurns, computeStats, cleanContent, cleanTurns, cleaningFor, loadOpts, buildTxt, buildHtml, buildMd, buildJson, buildEpub, makeZip, crc32, makeFiles, bundle, routeChat, idTime, placeRow, openSaver, savedKeys, wipeSaved, DEFAULTS };
    if (typeof module === 'object' && module.exports) module.exports = hook;
    else if (hasDom && window.__CT_TEST) window.__CT_TEST = hook;
})();
