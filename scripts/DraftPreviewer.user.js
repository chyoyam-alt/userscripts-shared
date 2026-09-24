// ==UserScript==
// @name         👁️ Crack Draft Previewer (크랙 전송 미리보기)
// @namespace    crack draft previewer
// @version      0.1.10
// @description  크랙 채팅 입력창의 마크다운을 전송 전에 유저 말풍선 형태로 미리보기합니다. 채팅방 안에서만 버튼이 표시됩니다.
// @author       ChatGPT
// @downloadURL  https://gist.github.com/chyoyam-alt/e62b51ec1c94e2e0c50388f7dd592b36/raw/DraftPreviewer.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/e62b51ec1c94e2e0c50388f7dd592b36/raw/DraftPreviewer.user.js
// @match        https://crack.wrtn.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const IDS = {
    wrap: 'crack-draft-preview-wrap',
    btn: 'crack-draft-preview-btn',
    panel: 'crack-draft-preview-panel',
    body: 'crack-draft-preview-body',
    close: 'crack-draft-preview-close',
    refresh: 'crack-draft-preview-refresh',
    copy: 'crack-draft-preview-copy',
    status: 'crack-draft-preview-status',
  };

  const PANEL_STATE_KEY = 'crack_draft_preview_panel_state_v015';
  let lastUrl = location.href;
  let renderTimer = null;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragInitLeft = 0;
  let dragInitTop = 0;

  // ------------------------------------------------------------------
  // 1) 스타일
  // ------------------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    #${IDS.wrap} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* 미리보기 버튼이 메모 버튼 '왼쪽'에 설 때, 메모가 갖는 margin-left:auto가
       둘 사이를 벌려놓지 않도록 메모쪽 auto를 무력화한다.
       (이 규칙은 미리보기 wrap이 메모 wrap '앞'의 형제일 때만 적용되므로,
        프리뷰 확프가 없거나 위치가 다르면 메모는 평소대로 동작한다.) */
    #${IDS.wrap} ~ #crac-memo-wrap { margin-left: 0 !important; }

    #${IDS.btn} {
      height: 1.75rem;
      width: 1.75rem;
      min-width: 1.75rem;
      border-radius: 9999px;
      border: none;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #fff;
      font-size: 0.95rem;
      line-height: 1;
      background: linear-gradient(180deg, #8f7450 0%, #776042 100%);
      box-shadow: 0 6px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.12);
      transition: transform .15s ease, background-color .15s ease, opacity .15s ease, box-shadow .15s ease, filter .15s ease;
      vertical-align: middle;
      flex-shrink: 0;
    }
    #${IDS.btn}:hover { transform: scale(1.06); background: linear-gradient(180deg, #9b7d56 0%, #816646 100%); box-shadow: 0 10px 24px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.16); }
    #${IDS.btn}:active { opacity: .9; transform: scale(.98); filter: saturate(.96); }

    #${IDS.panel} {
      position: fixed;
      right: 20px;
      bottom: 88px;
      z-index: 999999;
      width: min(680px, calc(100vw - 28px));
      height: min(760px, calc(100vh - 120px));
      min-width: 280px;
      min-height: 260px;
      display: none;
      flex-direction: column;
      overflow: hidden;
      resize: both;
      color: var(--text_primary, #fafafa);
      background: linear-gradient(180deg, rgba(30, 29, 28, .72) 0%, rgba(19, 19, 18, .78) 100%);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 18px;
      box-shadow: 0 22px 56px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08);
      backdrop-filter: blur(16px) saturate(1.08);
      -webkit-backdrop-filter: blur(16px) saturate(1.08);
      font-family: Pretendard, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .cdp-header {
      flex-shrink: 0;
      height: 46px;
      padding: 0 12px 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: linear-gradient(180deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.03) 100%);
      border-bottom: 1px solid rgba(255,255,255,.08);
      user-select: none;
      cursor: grab;
    }
    .cdp-header:active { cursor: grabbing; }
    .cdp-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
      font-size: 14px;
      color: var(--text_primary, #fafafa);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cdp-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .cdp-action-btn {
      height: 28px;
      min-width: 28px;
      padding: 0 8px;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 999px;
      color: var(--text_secondary, #c7c5bd);
      background: rgba(255,255,255,.03);
      cursor: pointer;
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
    }
    .cdp-action-btn:hover { background: rgba(255,255,255,.10); color: var(--text_primary, #fff); }
    #${IDS.close}:hover { color: #ff6b6b; }

    #${IDS.status} {
      min-height: 22px;
      padding: 6px 16px;
      color: var(--text_secondary, #c7c5bd);
      font-size: 12px;
      line-height: 1.35;
      border-bottom: 1px solid rgba(255,255,255,.06);
      background: rgba(255,255,255,.045);
    }

    #${IDS.body} {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 18px;
      box-sizing: border-box;
      background: linear-gradient(180deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,.01) 100%);
    }
    #${IDS.body}::-webkit-scrollbar { width: 8px; height: 8px; }
    #${IDS.body}::-webkit-scrollbar-thumb { background: rgba(255,255,255,.22); border-radius: 999px; }
    #${IDS.body}::-webkit-scrollbar-track { background: transparent; }

    .cdp-preview-shell {
      width: 100%;
      max-width: 620px;
      margin: 0 auto;
    }
    .cdp-bubble {
      background: linear-gradient(180deg, rgba(46, 45, 43, .68) 0%, rgba(38, 37, 35, .72) 100%);
      color: var(--text_primary, #fafafa);
      border-radius: 18px;
      padding: 12px 20px;
      border: 1px solid rgba(255,255,255,.06);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
      box-sizing: border-box;
      overflow-wrap: anywhere;
      word-break: break-all;
      width: 100%;
    }
    .cdp-empty {
      color: var(--text_secondary, #c7c5bd);
      margin: 0 !important;
    }

    /* 크랙 wrtn-markdown이 안 먹을 때를 위한 보정용 스타일 */
    #${IDS.panel} .wrtn-markdown {
      color: var(--text_primary, #fafafa);
      font-size: 16px;
      line-height: 28px;
      overflow-wrap: anywhere;
      word-break: break-all;
    }
    #${IDS.panel} .wrtn-markdown p {
      margin: 0 0 20px 0;
      white-space: pre-wrap;
      line-height: 24px;
    }
    #${IDS.panel} .wrtn-markdown p:last-child { margin-bottom: 0; }
    #${IDS.panel} .wrtn-markdown h1,
    #${IDS.panel} .wrtn-markdown h2,
    #${IDS.panel} .wrtn-markdown h3,
    #${IDS.panel} .wrtn-markdown h4,
    #${IDS.panel} .wrtn-markdown h5,
    #${IDS.panel} .wrtn-markdown h6 {
      font-weight: 800;
      line-height: 1.2;
      margin: 0 0 24px 0;
      color: var(--text_primary, #fff);
    }
    #${IDS.panel} .wrtn-markdown h1 { font-size: 30px; }
    #${IDS.panel} .wrtn-markdown h2 { font-size: 24px; }
    #${IDS.panel} .wrtn-markdown h3 { font-size: 20px; }
    #${IDS.panel} .wrtn-markdown h4 { font-size: 17px; }
    #${IDS.panel} .wrtn-markdown h5 { font-size: 14px; }
    #${IDS.panel} .wrtn-markdown h6 { font-size: 12px; }
    #${IDS.panel} .wrtn-markdown blockquote {
      margin: 0 0 20px 0;
      padding-left: 20px;
      border-left: 2px solid rgb(66, 65, 61);
      white-space: normal;
    }
    #${IDS.panel} .wrtn-markdown blockquote > p {
      margin: 0 0 20px 0;
      white-space: pre-wrap;
      line-height: 24px;
    }
    #${IDS.panel} .wrtn-markdown blockquote > p:last-child {
      margin-bottom: 0;
    }
    #${IDS.panel} .wrtn-markdown blockquote > *:last-child {
      margin-bottom: 0;
    }
    #${IDS.panel} .wrtn-markdown blockquote blockquote { margin-top: 14px; margin-bottom: 14px; }
    #${IDS.panel} .wrtn-markdown strong { font-weight: 800; }
    #${IDS.panel} .wrtn-markdown em { color: var(--text_secondary, #c7c5bd); }
    #${IDS.panel} .wrtn-markdown del { opacity: .85; }
    #${IDS.panel} .wrtn-markdown a { color: var(--text_action_blue_primary, #40a9ff); text-decoration: underline; }
    #${IDS.panel} .wrtn-markdown img {
      display: block;
      width: 100%;
      max-width: 100%;
      border-radius: 8px;
      margin: 10px 0;
      cursor: default;
    }
    #${IDS.panel} .wrtn-markdown ul,
    #${IDS.panel} .wrtn-markdown ol { margin: 0 0 20px 1.35em; padding-left: 1.1em; }
    #${IDS.panel} .wrtn-markdown li { margin: 0; }
    #${IDS.panel} .wrtn-markdown li > ul,
    #${IDS.panel} .wrtn-markdown li > ol { margin-top: 0; margin-bottom: 0; }
    #${IDS.panel} .wrtn-markdown ul { list-style-type: disc; }
    #${IDS.panel} .wrtn-markdown ol { list-style-type: decimal; }
    #${IDS.panel} .wrtn-markdown ul ul { list-style-type: circle; }
    #${IDS.panel} .wrtn-markdown .contains-task-list { list-style: none; margin-left: 0; padding-left: .2em; }
    #${IDS.panel} .wrtn-markdown .task-list-item { list-style: none; }
    #${IDS.panel} .wrtn-markdown li > p { margin: 0; }
    #${IDS.panel} .wrtn-markdown hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,.24);
      margin: 28px 0;
    }
    #${IDS.panel} .wrtn-markdown code:not(pre code),
    #${IDS.panel} .wrtn-markdown :not(pre) > code {
      padding: 2px 5px;
      border-radius: 4px;
      background: rgba(255,255,255,.12);
      color: #ff8c75 !important;
      font-size: .9em;
      line-height: 1.45;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-style: normal !important;
      font-weight: 500;
      text-decoration: none !important;
      white-space: break-spaces;
    }
    #${IDS.panel} .not-wrtn-markdown.wrtn-codeblock {
      margin: 16px 0 20px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 12px;
      background: rgba(36, 35, 33, .82);
    }
    #${IDS.panel} [data-sgb-codeblock-head] {
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      background: rgba(70, 58, 66, .72);
      border-bottom: 1px solid rgba(255,255,255,.12);
    }
    #${IDS.panel} [data-sgb-codeblock-head] span {
      color: #aaa39b;
      font-weight: 700;
      font-size: 12px;
    }
    #${IDS.panel} [data-sgb-codeblock-head] button {
      border: 0;
      background: transparent;
      color: #aaa39b;
      cursor: pointer;
      width: 24px;
      height: 24px;
      padding: 0;
    }
    #${IDS.panel} [data-sgb-codeblock-body] pre {
      margin: 0;
      padding: 16px;
      background: rgba(36, 35, 33, .84);
      color: #e1e4e8;
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.45;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    #${IDS.panel} .wrtn-markdown-table {
      overflow-x: auto;
      margin: 16px 0 20px;
      border: 1px solid rgba(255,255,255,.15);
    }
    #${IDS.panel} .wrtn-markdown-table table {
      width: 100%;
      min-width: 520px;
      border-collapse: collapse;
    }
    #${IDS.panel} .wrtn-markdown-table th,
    #${IDS.panel} .wrtn-markdown-table td {
      border: 1px solid rgba(255,255,255,.16);
      padding: 10px 12px;
      vertical-align: top;
      line-height: 1.55;
    }
    #${IDS.panel} .wrtn-markdown-table th { font-weight: 800; }
    #${IDS.panel} .contains-task-list { list-style: none; margin-left: 0; padding-left: .2em; }
    #${IDS.panel} .task-list-item input { margin-right: 6px; vertical-align: middle; }
    #${IDS.panel} .katex-display { display: block; text-align: center; margin: 18px 0; }
    #${IDS.panel} .cdp-katex-fallback {
      font-family: Georgia, 'Times New Roman', serif;
      font-style: italic;
      white-space: pre-wrap;
    }
    #${IDS.panel} .footnotes {
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 16px;
      line-height: 28px;
      color: var(--text_primary, #fafafa);
    }
    #${IDS.panel} .footnotes ol {
      margin: 0 0 20px 0;
      padding-left: 26px;
      list-style-type: decimal;
    }
    #${IDS.panel} .footnotes li {
      margin: 0;
      padding-left: 6px;
    }
    #${IDS.panel} .footnotes li > p {
      margin-top: 20px;
      margin-bottom: 20px;
      line-height: 24px;
      white-space: pre-wrap;
    }
    #${IDS.panel} .wrtn-markdown sup {
      position: relative;
      font-size: 12px;
      line-height: 0;
      vertical-align: baseline;
    }
    #${IDS.panel} .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }
  `;
  document.head.appendChild(style);

  // ------------------------------------------------------------------
  // 2) 패널 / 버튼 생성
  // ------------------------------------------------------------------
  const btn = document.createElement('button');
  btn.id = IDS.btn;
  btn.type = 'button';
  btn.textContent = '👁';
  btn.title = '전송 미리보기';
  btn.setAttribute('aria-label', '전송 미리보기');

  const panel = document.createElement('div');
  panel.id = IDS.panel;
  panel.innerHTML = `
    <div class="cdp-header" id="crack-draft-preview-drag">
      <div class="cdp-title"><span>👁</span><span>전송 미리보기</span></div>
      <div class="cdp-actions">
        <button type="button" class="cdp-action-btn" id="${IDS.refresh}" title="다시 렌더링">↻</button>
        <button type="button" class="cdp-action-btn" id="${IDS.copy}" title="현재 미리보기 HTML 복사">HTML</button>
        <button type="button" class="cdp-action-btn" id="${IDS.close}" title="닫기">✕</button>
      </div>
    </div>
    <div id="${IDS.status}">입력창 내용을 Crack 실제 렌더 규칙에 가깝게 미리보기합니다. 실제 전송은 하지 않습니다.</div>
    <div id="${IDS.body}"></div>
  `;
  document.body.appendChild(panel);

  const body = document.getElementById(IDS.body);
  const status = document.getElementById(IDS.status);
  const dragHandle = document.getElementById('crack-draft-preview-drag');
  const closeBtn = document.getElementById(IDS.close);
  const refreshBtn = document.getElementById(IDS.refresh);
  const copyBtn = document.getElementById(IDS.copy);

  // ------------------------------------------------------------------
  // 3) 라우트 / 입력창 / 전송 버튼 탐색
  // ------------------------------------------------------------------
  function isAllowedStoryChatPath() {
    return /^\/stories\/[^/]+\/episodes\/[^/]+(?:\/|$)/.test(location.pathname);
  }

  function isStoryUnavailable() {
    return Array.from(document.querySelectorAll('p')).some((p) => {
      const text = p.textContent || '';
      return text.includes('스토리가 삭제되어') || text.includes('삭제된 스토리');
    });
  }

  function getInputEl() {
    const selectors = [
      'div[contenteditable="true"].__chat_input_textarea',
      'div[contenteditable="true"].ProseMirror',
      'div[contenteditable="true"][translate="no"]',
      '[contenteditable="true"][data-placeholder]',
      'textarea.__chat_input_textarea',
      'textarea',
    ];

    const candidates = Array.from(document.querySelectorAll(selectors.join(','))).filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.closest(`#${IDS.panel}`)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      return true;
    });

    if (!candidates.length) return null;
    const preferred = candidates.find((el) => el.classList.contains('__chat_input_textarea'));
    if (preferred) return preferred;

    candidates.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return candidates[0];
  }

  function getInputText() {
    const input = getInputEl();
    if (!input) return '';

    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      return input.value || '';
    }

    // innerText는 <p> 경계에 빈 줄을 더한다. 편집기의 실제 블록/BR만 읽는다.
    const text = readEditorText(input);
    return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trimEnd();
  }

  function readEditorText(root) {
    const isBlock = (node) => node.nodeType === 1 && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(node.tagName);
    const read = (node) => {
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      if (node.matches('.ProseMirror-trailingBreak, .ProseMirror-widget, [contenteditable="false"]')) return '';
      if (node.tagName === 'BR') return '\n';
      const children = Array.from(node.childNodes).filter((child) =>
        child.nodeType === 3 || (child.nodeType === 1 &&
          !child.matches('.ProseMirror-trailingBreak, .ProseMirror-widget, [contenteditable="false"]')));
      // 빈 편집 문단의 자리표시 BR은 개행 한 개를 추가하는 문자가 아니다.
      if (/^(P|DIV)$/.test(node.tagName) && children.length === 1 && children[0].nodeName === 'BR') return '';
      const chunks = [];
      let inline = null;
      for (const child of children) {
        if (isBlock(child)) {
          if (inline !== null) { chunks.push(inline); inline = null; }
          chunks.push(read(child));
        } else {
          inline = (inline ?? '') + read(child);
        }
      }
      if (inline !== null) chunks.push(inline);
      return chunks.join('\n');
    };
    return read(root);
  }

  function findSendButton() {
    const input = getInputEl();
    if (!input) return null;

    const inRect = input.getBoundingClientRect();
    const inputMidY = inRect.top + inRect.height / 2;
    const inputCx = inRect.left + inRect.width / 2;

    const isComposerButton = (b) => {
      if (!b || !(b instanceof HTMLElement) || b.contains(input)) return false;
      const id = b.id || '';
      if (id.startsWith('crack-') || id === IDS.btn || id === 'crac-memo-btn') return false;
      if (b.closest(`#${IDS.wrap}`) || b.closest('#crac-memo-wrap') || b.closest(`#${IDS.panel}`)) return false;

      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;

      const cy = r.top + r.height / 2;
      if (cy < inputMidY - 40) return false;
      if (r.left + r.width / 2 < inputCx) return false;

      let p = b;
      for (let i = 0; i < 6 && p && p !== document.body; i++, p = p.parentElement) {
        if (p.id === 'crack-pure-send-left-group') return false;
        if (getComputedStyle(p).position === 'fixed') return false;
      }
      return true;
    };

    let node = input;
    for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || !node.querySelectorAll) continue;
      const rows = Array.from(node.querySelectorAll('div.justify-between'));
      for (let r = rows.length - 1; r >= 0; r--) {
        const btns = Array.from(rows[r].children || []).filter((c) => c.tagName === 'BUTTON' && isComposerButton(c));
        if (btns.length > 0) return btns[btns.length - 1];
      }
    }

    node = input;
    for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || !node.querySelectorAll) continue;
      const rows = Array.from(node.querySelectorAll('div.flex')).filter((d) => !d.classList.contains('space-x-2'));
      for (let r = rows.length - 1; r >= 0; r--) {
        const btns = Array.from(rows[r].children || []).filter((c) => c.tagName === 'BUTTON' && isComposerButton(c));
        if (btns.length > 0) return btns[btns.length - 1];
      }
    }

    node = input.parentElement;
    for (let i = 0; i < 10 && node; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || !node.querySelectorAll) continue;
      const cands = Array.from(node.querySelectorAll('button')).filter(isComposerButton);
      if (cands.length > 0) {
        cands.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right);
        return cands[0];
      }
    }

    return null;
  }

  function injectPreviewButton() {
    if (!isAllowedStoryChatPath() || isStoryUnavailable()) return cleanupInjectedButton();

    const sendBtn = findSendButton();
    if (!sendBtn || !sendBtn.parentNode) return;

    const sendParent = sendBtn.parentNode;
    const magicGroup = document.getElementById('crack-pure-send-left-group');
    const useMagicGroup = magicGroup && magicGroup.parentNode === sendParent;

    let wrap = document.getElementById(IDS.wrap);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = IDS.wrap;
      wrap.appendChild(btn);
    } else if (!wrap.contains(btn)) {
      wrap.replaceChildren(btn);
    }

    if (useMagicGroup) {
      wrap.style.marginLeft = '';
      wrap.style.marginRight = '';
      const memoWrap = document.getElementById('crac-memo-wrap');
      if (memoWrap && memoWrap.parentNode === magicGroup) {
        if (wrap.parentNode === magicGroup && wrap.previousElementSibling === memoWrap) return;
        magicGroup.insertBefore(wrap, memoWrap.nextSibling);
      } else {
        if (wrap.parentNode === magicGroup && magicGroup.firstElementChild === wrap) return;
        magicGroup.insertBefore(wrap, magicGroup.firstElementChild);
      }
    } else {
      const memoWrap = document.getElementById('crac-memo-wrap');
      const memoIsSibling = memoWrap && memoWrap.parentNode === sendParent;
      const isSpread = sendParent.classList && sendParent.classList.contains('justify-between');

      // ✨ 핵심 수정: 미리보기 버튼은 '항상 메모 버튼의 왼쪽'에 자리잡는다.
      // 메모 확프는 "memoWrap이 전송 버튼 바로 왼쪽"을 매 루프마다 고집하므로,
      // 우리가 메모와 전송 사이(메모 오른쪽)에 끼어들면 서로 밀어내며 0.8초마다
      // 위치가 뒤바뀐다(=깜빡임). 메모 왼쪽에 서면 두 확프의 요구가 모두 충족돼
      // 위치가 영구히 고정된다.  →  [👁][📋][전송]
      // 미리보기가 묶음(클러스터)의 왼쪽 앵커가 되어 우측 정렬을 책임진다.
      wrap.style.marginLeft = isSpread ? 'auto' : '';
      wrap.style.marginRight = '6px';

      if (memoIsSibling) {
        if (wrap.parentNode === sendParent && wrap.nextElementSibling === memoWrap) return;
        sendParent.insertBefore(wrap, memoWrap);
      } else {
        if (wrap.parentNode === sendParent && wrap.nextElementSibling === sendBtn) return;
        sendParent.insertBefore(wrap, sendBtn);
      }
    }
  }

  function cleanupInjectedButton() {
    const wrap = document.getElementById(IDS.wrap);
    if (wrap) wrap.remove();
    if (panel.style.display === 'flex') panel.style.display = 'none';
  }

  // ------------------------------------------------------------------
  // 4) 마크다운 렌더러
  // ------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function safeUrl(url, isImage = false) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw, location.href);
      const allowed = ['http:', 'https:'];
      if (!isImage) allowed.push('mailto:');
      if (isImage && raw.startsWith('data:image/')) return raw;
      if (!allowed.includes(u.protocol)) return '';
      return u.href;
    } catch (_) {
      return '';
    }
  }

  function makePlaceholderStore() {
    const store = [];
    return {
      put(html) {
        const key = `\uE000CDP${store.length}\uE001`;
        store.push([key, html]);
        return key;
      },
      restore(text) {
        let out = text;
        for (const [key, html] of store) out = out.split(key).join(html);
        return out;
      },
    };
  }

  function renderMath(tex, displayMode) {
    const clean = String(tex || '').trim();
    if (!clean) return '';
    const katexObj = window.katex;
    if (katexObj && typeof katexObj.renderToString === 'function') {
      try {
        return katexObj.renderToString(clean, { displayMode, throwOnError: false, strict: 'ignore' });
      } catch (_) {
        // fallback below
      }
    }
    const fallback = `<span class="katex cdp-katex-fallback">${escapeHtml(clean)}</span>`;
    return displayMode ? `<span class="katex-display">${fallback}</span>` : fallback;
  }

  function renderInline(raw, ctx) {
    const ph = makePlaceholderStore();
    let text = String(raw ?? '');

    // escape 문자 보호
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!|>~$])/g, (_, ch) => ph.put(escapeHtml(ch)));

    // inline code 보호
    // Crack/Markdown 계열 코드 span은 `...`뿐 아니라 ``...``처럼
    // 여러 backtick fence도 쓸 수 있으므로, 같은 길이의 backtick 쌍을 보호한다.
    // 코드 span 안에서는 emphasis가 먹지 않아야 하므로 가장 먼저 placeholder로 뺀다.
    text = text.replace(/(`+)([\s\S]*?)\1/g, (match, fence, code) => {
      // 빈 코드 또는 문단을 가로지르는 과한 매칭은 원문 유지
      if (!code || /\n\s*\n/.test(code)) return match;
      return ph.put(`<code>${escapeHtml(String(code).replace(/\n/g, ' '))}</code>`);
    });

    // inline math 보호
    text = text.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      return ph.put(renderMath(tex, false));
    });

    // Crack 실제 렌더처럼 HTML 태그는 실행하지 않고 문자로 보여준다.
    // 단, <ooc_lore_context> 같은 태그형 텍스트 안의 underscore가
    // _기울임_ 으로 오인되지 않도록 emphasis 처리 전에 보호한다.
    text = text.replace(/<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s+[^<>\n]*)?>/g, (tag) => {
      return ph.put(escapeHtml(tag));
    });

    // image 보호
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, url) => {
      const src = safeUrl(url, true);
      if (!src) return ph.put(escapeHtml(`![${alt}](${url})`));
      return ph.put(`<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`);
    });

    // link 보호
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, url) => {
      const href = safeUrl(url, false);
      const safeLabel = escapeHtml(label);
      if (!href) return ph.put(safeLabel);
      return ph.put(`<a data-incomplete="false" data-streamdown="link" href="${escapeAttr(href)}" rel="noopener noreferrer" target="_blank">${safeLabel}</a>`);
    });

    // footnote ref 보호
    text = text.replace(/\[\^([^\]]+)\]/g, (_, id) => {
      const safeId = String(id).trim();
      if (!safeId) return '';
      if (!ctx.footRefOrder.includes(safeId)) ctx.footRefOrder.push(safeId);
      const n = ctx.footRefOrder.indexOf(safeId) + 1;
      const domId = footnoteDomId(safeId);
      const refId = `user-content-fnref-${escapeAttr(domId)}`;
      const fnId = `user-content-fn-${escapeAttr(domId)}`;
      return ph.put(`<sup><a data-incomplete="false" data-streamdown="link" href="#${fnId}" rel="noopener noreferrer" target="_blank" id="${refId}" data-footnote-ref="true" aria-describedby="footnote-label">${n}</a></sup>`);
    });

    // 자동 링크 보호
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<>()]+)/g, (m, prefix, url) => {
      const cleanUrl = url.replace(/[.,!?;:]+$/g, '');
      const tail = url.slice(cleanUrl.length);
      const href = safeUrl(cleanUrl, false);
      if (!href) return m;
      return `${prefix}${ph.put(`<a data-incomplete="false" data-streamdown="link" href="${escapeAttr(href)}" rel="noopener noreferrer" target="_blank">${escapeHtml(cleanUrl)}</a>`)}${escapeHtml(tail)}`;
    });

    text = escapeHtml(text);

    // emphasis 계열. placeholder는 escape되지 않으므로 그대로 보존됨.
    text = text.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
    text = text.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    text = text.replace(/(^|[^\p{L}\p{N}_])___([\s\S]+?)___(?=$|[^\p{L}\p{N}_])/gu, '$1<strong><em>$2</em></strong>');
    text = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^\p{L}\p{N}_])__([\s\S]+?)__(?=$|[^\p{L}\p{N}_])/gu, '$1<strong>$2</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^\p{L}\p{N}_])_([^_\n]+?)_(?=$|[^\p{L}\p{N}_])/gu, '$1<em>$2</em>');

    return ph.restore(text);
  }

  function renderCodeBlock(code, lang) {
    const label = escapeHtml((lang || 'txt').trim() || 'txt');
    const lines = String(code || '').replace(/\n$/g, '').split('\n');
    const lineHtml = lines.map((line) => {
      return `<span class="line"><span style="--shiki-dark:#E1E4E8;--shiki-light:#E1E4E8">${escapeHtml(line)}</span></span>`;
    }).join('\n');

    return `<div class="not-wrtn-markdown wrtn-codeblock css-esy8ci" data-sgb-codeblock=""><div class="css-71xn2b" data-sgb-codeblock-head=""><span class="css-1ywuktj">${label}</span><div><button tabindex="-1" type="button" aria-label="copy code" class="css-wi6y4n" data-cdp-copy-code="${escapeAttr(String(code || ''))}">⧉</button></div></div><div class="css-vhnxen" data-sgb-codeblock-body=""><pre class="shiki shiki-themes github-dark github-dark" style="--shiki-dark:#e1e4e8;--shiki-light:#e1e4e8;--shiki-dark-bg:#24292e;--shiki-light-bg:#24292e" tabindex="0"><code>${lineHtml}</code></pre></div></div>`;
  }

  function isFence(line) {
    return /^\s*```([A-Za-z0-9_-]+)?\s*$/.exec(line || '');
  }

  function isHr(line) {
    return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line || '');
  }

  function headingMatch(line) {
    return /^(#{1,6})\s+(.+?)\s*$/.exec(line || '');
  }

  function isRawHtmlTagLine(line) {
    return /^\s*<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s+[^<>\n]*)?>\s*$/.test(line || '');
  }

  function isStandaloneLabelLine(line) {
    return /^\s*\[[^\]\n]+\]\s*$/.test(line || '');
  }

  function isBlockBoundaryLine(lines, i) {
    const line = lines[i] || '';
    return isFence(line) ||
      isBlockquoteLine(line) ||
      isTableStart(lines, i) ||
      headingMatch(line) ||
      isHr(line) ||
      /^\s*\$\$\s*$/.test(line) ||
      isRawHtmlTagLine(line);
  }

  function isBlockquoteLine(line) {
    return /^ {0,3}>/.test(String(line || ''));
  }

  function stripQuote(line) {
    // 인용 기호 한 단계와 선택적 공백 한 칸만 제거해 목록 들여쓰기를 보존한다.
    return String(line || '').replace(/^ {0,3}>[ \t]?/, '');
  }

  function tableSeparator(line) {
    const t = String(line || '').trim();
    if (!t.includes('|')) return false;
    const cells = trimPipes(t).split('|').map((s) => s.trim());
    return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
  }

  function trimPipes(line) {
    return String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  }

  function splitTableRow(line) {
    return trimPipes(line).split('|').map((s) => s.trim());
  }

  function isTableStart(lines, i) {
    return i + 1 < lines.length && String(lines[i]).includes('|') && tableSeparator(lines[i + 1]);
  }

  function renderTable(lines, i, ctx) {
    const header = splitTableRow(lines[i]);
    const sep = splitTableRow(lines[i + 1]);
    const aligns = sep.map((s) => {
      if (/^:-+:$/.test(s)) return 'center';
      if (/^-+:$/.test(s)) return 'right';
      if (/^:-+$/.test(s)) return 'left';
      return '';
    });

    let j = i + 2;
    const rows = [];
    while (j < lines.length && String(lines[j]).includes('|') && String(lines[j]).trim()) {
      rows.push(splitTableRow(lines[j]));
      j++;
    }

    const ths = header.map((cell, idx) => {
      const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
      return `<th${align}>${renderInline(cell, ctx)}</th>`;
    }).join('');
    const trs = rows.map((row) => {
      const tds = header.map((_, idx) => {
        const align = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
        return `<td${align}>${renderInline(row[idx] || '', ctx)}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    return {
      html: `<div class="wrtn-markdown-table"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`,
      next: j,
    };
  }

  function listToken(line) {
    const m = /^(\s*)([-+*]|\d+[.)])\s+([\s\S]*)$/.exec(line || '');
    if (!m) return null;
    const body = m[3] || '';
    const task = /^\[( |x|X)\]\s+([\s\S]*)$/.exec(body);
    return {
      indent: m[1].replace(/\t/g, '    ').length,
      kind: /^\d/.test(m[2]) ? 'ol' : 'ul',
      start: /^\d/.test(m[2]) ? parseInt(m[2], 10) : 1,
      text: task ? task[2] : body,
      task: !!task,
      checked: task ? /x/i.test(task[1]) : false,
    };
  }

  function renderListTokens(tokens, start, indent, kind, ctx) {
    let idx = start;
    const tag = kind === 'ol' ? 'ol' : 'ul';
    const hasTask = kind === 'ul' && tokens.slice(start).some((t) => t.indent === indent && t.kind === kind && t.task);
    const startAttr = tag === 'ol' && tokens[start].start !== 1 ? ` start="${tokens[start].start}"` : '';
    let html = `<${tag}${startAttr}${hasTask ? ' class="contains-task-list"' : ''}>`;

    while (idx < tokens.length) {
      const t = tokens[idx];
      if (t.indent < indent) break;
      if (t.indent > indent) break;
      if (t.kind !== kind) break;

      const liClass = t.task ? ' class="task-list-item"' : '';
      const checkbox = t.task ? `<input type="checkbox" disabled=""${t.checked ? ' checked=""' : ''}> ` : '';
      let li = `${checkbox}${renderInline(t.text, ctx)}`;
      idx++;

      while (idx < tokens.length && tokens[idx].indent > indent) {
        const nested = renderListTokens(tokens, idx, tokens[idx].indent, tokens[idx].kind, ctx);
        li += nested.html;
        idx = nested.next;
      }

      html += `<li${liClass}>${li}</li>`;
    }

    html += `</${tag}>`;
    return { html, next: idx };
  }

  function renderList(lines, i, ctx) {
    const tokens = [];
    let j = i;
    while (j < lines.length) {
      const raw = lines[j];
      const t = listToken(raw);
      if (t) {
        tokens.push(t);
        j++;
        continue;
      }

      // CommonMark 계열처럼, 리스트 바로 다음의 일반 텍스트는
      // 빈 줄이나 새 블록이 나오기 전까지 직전 li의 continuation으로 붙는다.
      // 실제 Crack에서도 OOC 연속성 블록의 [호칭] 줄이 앞 li 안으로 들어간다.
      if (tokens.length && String(raw || '').trim() && !isBlockBoundaryLine(lines, j)) {
        tokens[tokens.length - 1].text += `\n${raw}`;
        j++;
        continue;
      }

      break;
    }
    // ul → ol → 체크리스트처럼 종류가 바뀌어도 수집한 토큰을 전부 출력한다.
    let html = '';
    let idx = 0;
    while (idx < tokens.length) {
      const rendered = renderListTokens(tokens, idx, tokens[idx].indent, tokens[idx].kind, ctx);
      html += rendered.html;
      idx = rendered.next;
    }
    return { html, next: j };
  }

  function extractFootnotes(lines) {
    const out = [];
    const footnotes = new Map();
    for (let i = 0; i < lines.length; i++) {
      const m = /^\s*\[\^([^\]]+)\]:\s*([\s\S]*)$/.exec(lines[i]);
      if (m) {
        const key = m[1].trim();
        const chunks = [m[2] || ''];
        let j = i + 1;
        while (j < lines.length && /^\s{2,}\S/.test(lines[j])) {
          chunks.push(lines[j].replace(/^\s+/, ''));
          j++;
        }
        footnotes.set(key, chunks.join('\n'));
        i = j - 1;
      } else {
        out.push(lines[i]);
      }
    }
    return { lines: out, footnotes };
  }

  function renderBlocks(lines, ctx) {
    let html = '';
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (String(line).trim() === '') {
        i++;
        continue;
      }

      const fence = isFence(line);
      if (fence) {
        const lang = fence[1] || 'txt';
        const codeLines = [];
        i++;
        while (i < lines.length && !isFence(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length && isFence(lines[i])) i++;
        html += renderCodeBlock(codeLines.join('\n'), lang);
        continue;
      }

      if (/^\s*\$\$\s*$/.test(line)) {
        const mathLines = [];
        i++;
        while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        html += renderMath(mathLines.join('\n'), true);
        continue;
      }

      if (isRawHtmlTagLine(line)) {
        html += `<p>${renderInline(line, ctx)}</p>`;
        i++;
        continue;
      }

      if (isStandaloneLabelLine(line)) {
        html += `<p>${renderInline(line, ctx)}</p>`;
        i++;
        continue;
      }

      if (isBlockquoteLine(line)) {
        const quoteLines = [];
        while (i < lines.length && isBlockquoteLine(lines[i])) {
          quoteLines.push(stripQuote(lines[i]));
          i++;
        }
        html += `<blockquote>${renderBlocks(quoteLines, ctx)}</blockquote>`;
        continue;
      }

      if (isTableStart(lines, i)) {
        const table = renderTable(lines, i, ctx);
        html += table.html;
        i = table.next;
        continue;
      }

      const hm = headingMatch(line);
      if (hm) {
        const level = hm[1].length;
        html += `<h${level}>${renderInline(hm[2], ctx)}</h${level}>`;
        i++;
        continue;
      }

      if (isHr(line)) {
        html += '<hr>';
        i++;
        continue;
      }

      if (listToken(line)) {
        const list = renderList(lines, i, ctx);
        html += list.html;
        i = list.next;
        continue;
      }

      const para = [];
      while (i < lines.length) {
        const cur = lines[i];
        if (String(cur).trim() === '') break;
        if (isFence(cur) || isBlockquoteLine(cur) || isTableStart(lines, i) || headingMatch(cur) || isHr(cur) || listToken(cur) || isRawHtmlTagLine(cur) || /^\s*\$\$\s*$/.test(cur)) break;
        if (para.length && isStandaloneLabelLine(cur)) break;
        para.push(cur);
        i++;
      }
      html += `<p>${renderInline(para.join('\n'), ctx)}</p>`;
    }

    return html;
  }

  function footnoteDomId(id) {
    return String(id || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]+/gi, '-').replace(/^-+|-+$/g, '') || '1';
  }

  function renderFootnotes(ctx) {
    const ids = ctx.footRefOrder.filter((id) => ctx.footnotes.has(id));
    if (!ids.length) return '';
    const items = ids.map((id, index) => {
      const domId = footnoteDomId(id);
      const fnId = `user-content-fn-${escapeAttr(domId)}`;
      const refId = `user-content-fnref-${escapeAttr(domId)}`;
      const bodyHtml = renderInline(ctx.footnotes.get(id) || '', ctx);
      return `<li id="${fnId}">\n<p>${bodyHtml} <a data-incomplete="false" data-streamdown="link" href="#${refId}" rel="noopener noreferrer" target="_blank" data-footnote-backref="" aria-label="Back to reference ${index + 1}" class="data-footnote-backref">↩</a></p>\n</li>`;
    }).join('\n');
    return `<section data-footnotes="true" class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>\n<ol>\n${items}\n</ol>\n</section>`;
  }

  function renderMarkdown(source) {
    const text = String(source || '').replace(/\r\n?/g, '\n');
    const { lines, footnotes } = extractFootnotes(text.split('\n'));
    const ctx = {
      uid: `cdp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      footnotes,
      footRefOrder: [],
    };
    const html = renderBlocks(lines, ctx) + renderFootnotes(ctx);
    return html || '<p class="cdp-empty">입력창이 비어있습니다.</p>';
  }

  // ------------------------------------------------------------------
  // 5) 미리보기 렌더 / 패널 조작
  // ------------------------------------------------------------------
  function updateStatus(text, muted = false) {
    status.textContent = text;
    status.style.color = muted ? 'var(--text_secondary, #c7c5bd)' : 'var(--text_primary, #fafafa)';
  }

  function renderPreview() {
    const inputText = getInputText();
    const html = inputText.trim()
      ? renderMarkdown(inputText)
      : '<p class="cdp-empty">입력창이 비어있습니다.</p>';

    body.innerHTML = `
      <div class="cdp-preview-shell">
        <div class="cdp-bubble flex flex-col gap-4 px-5 w-full break-all py-3 rounded-[18px] bg-surface_chat_secondary" style="overflow-wrap:anywhere;" data-sgb-bubble="chat">
          <div class="wrtn-markdown css-cbn3z5">${html}</div>
        </div>
      </div>
    `;

    const charCount = inputText.length;
    updateStatus(`현재 입력 ${charCount.toLocaleString()}자 · v0.1.10 줄바꿈·인용 목록 보정 미리보기`, true);
  }

  function schedulePreviewRender() {
    if (panel.style.display !== 'flex') return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreview, 120);
  }

  function showPanel() {
    if (!isAllowedStoryChatPath()) return;
    loadPanelState();
    panel.style.display = 'flex';
    clampPanelIntoViewport();
    renderPreview();
  }

  function hidePanel() {
    panel.style.display = 'none';
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function copyPreviewHtml() {
    const md = body.querySelector('.wrtn-markdown');
    if (!md) return;
    copyText(md.innerHTML).then(() => {
      updateStatus('미리보기 HTML을 복사했습니다.', true);
      setTimeout(() => schedulePreviewRender(), 900);
    });
  }

  // 코드블록 내부 복사 버튼
  body.addEventListener('click', (e) => {
    const target = e.target.closest?.('[data-cdp-copy-code]');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    copyText(target.getAttribute('data-cdp-copy-code') || '').then(() => {
      updateStatus('코드블록 내용을 복사했습니다.', true);
    });
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.style.display === 'flex') hidePanel();
    else showPanel();
  });

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hidePanel();
  });

  refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    renderPreview();
  });

  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyPreviewHtml();
  });

  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  panel.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('input', (e) => {
    if (e.target && (e.target.closest?.('.__chat_input_textarea') || e.target.matches?.('textarea'))) {
      schedulePreviewRender();
    }
  }, true);

  document.addEventListener('keyup', (e) => {
    if (e.target && (e.target.closest?.('.__chat_input_textarea') || e.target.matches?.('textarea'))) {
      schedulePreviewRender();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.style.display === 'flex') hidePanel();
  });

  // ------------------------------------------------------------------
  // 6) 패널 드래그/상태 저장
  // ------------------------------------------------------------------
  function savePanelState() {
    const rect = panel.getBoundingClientRect();
    const state = {
      width: panel.style.width || `${rect.width}px`,
      height: panel.style.height || `${rect.height}px`,
      left: panel.style.left || '',
      top: panel.style.top || '',
      right: panel.style.right || '20px',
      bottom: panel.style.bottom || '88px',
    };
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify(state));
  }

  function loadPanelState() {
    const raw = localStorage.getItem(PANEL_STATE_KEY);
    if (!raw) return;
    try {
      const state = JSON.parse(raw);
      if (state.width) panel.style.width = state.width;
      if (state.height) panel.style.height = state.height;
      if (state.left && state.top) {
        panel.style.left = state.left;
        panel.style.top = state.top;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      } else {
        panel.style.right = state.right || '20px';
        panel.style.bottom = state.bottom || '88px';
        panel.style.left = 'auto';
        panel.style.top = 'auto';
      }
    } catch (_) {
      localStorage.removeItem(PANEL_STATE_KEY);
    }
  }

  function clampPanelIntoViewport() {
    const rect = panel.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    let changed = false;

    if (rect.width > window.innerWidth) {
      panel.style.width = `${Math.max(280, window.innerWidth - 20)}px`;
      changed = true;
    }
    if (rect.height > window.innerHeight) {
      panel.style.height = `${Math.max(260, window.innerHeight - 20)}px`;
      changed = true;
    }

    const next = panel.getBoundingClientRect();
    if (next.left < 0) { left = 0; changed = true; }
    if (next.top < 0) { top = 0; changed = true; }
    if (next.right > window.innerWidth) { left = Math.max(0, window.innerWidth - next.width); changed = true; }
    if (next.bottom > window.innerHeight) { top = Math.max(0, window.innerHeight - next.height); changed = true; }

    if (changed) {
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      savePanelState();
    }
  }

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.cdp-actions')) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragInitLeft = rect.left;
    dragInitTop = rect.top;
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    let left = dragInitLeft + (e.clientX - dragStartX);
    let top = dragInitTop + (e.clientY - dragStartY);
    left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    savePanelState();
  });

  let resizeTimer = null;
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (panel.style.display === 'flex') savePanelState();
    }, 160);
  });
  resizeObserver.observe(panel);

  window.addEventListener('resize', () => {
    if (panel.style.display === 'flex') clampPanelIntoViewport();
  });

  // ------------------------------------------------------------------
  // 7) SPA 대응
  // ------------------------------------------------------------------
  function tick() {
    if (!isAllowedStoryChatPath() || isStoryUnavailable()) {
      cleanupInjectedButton();
    } else {
      injectPreviewButton();
    }

    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (!isAllowedStoryChatPath()) cleanupInjectedButton();
      else if (panel.style.display === 'flex') renderPreview();
    }
  }

  function initialInject() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isAllowedStoryChatPath() && !isStoryUnavailable()) injectPreviewButton();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialInject, { once: true });
  } else {
    initialInject();
  }

  setInterval(tick, 800);
})();