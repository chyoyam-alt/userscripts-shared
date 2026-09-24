// ==UserScript==
// @name         📝 크랙(crack) 자동저장 메모장
// @namespace    http://tampermonkey.net/
// @version      1.3.2
// @description  크랙 채팅방마다 개별적으로 저장되는 메모장 - 전송 버튼 옆 미니 버튼형
// @author       Gemini + ChatGPT
// @match        https://crack.wrtn.ai/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // 1) 스타일
    // ------------------------------------------------------------------
    const style = document.createElement('style');
    style.textContent = `
        /* 메모 버튼 래퍼 */
        #crac-memo-wrap {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }

        /* 입력창 옆 미니 메모 버튼 */
        #crac-memo-btn {
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
            color: white;
            font-size: 0.95rem;
            line-height: 1;
            background-color: #475569;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
            transition: transform 0.15s ease, background-color 0.15s ease, opacity 0.15s ease;
            vertical-align: middle;
            flex-shrink: 0;
        }

        #crac-memo-btn:hover {
            transform: scale(1.06);
            background-color: #334155;
        }

        #crac-memo-btn:active {
            opacity: 0.85;
            transform: scale(0.98);
        }

        /* 메모장 창 */
        #crac-memo-container {
            --cmemo-accent: #7F77DD;
            --cmemo-accent-soft: #AFA9EC;
            --cmemo-accent-text: #CECBF6;
            --cmemo-accent-bg: rgba(127, 119, 221, 0.12);
            position: fixed;
            bottom: 88px;
            right: 20px;
            width: 320px;
            height: 450px;
            min-width: 240px;
            min-height: 220px;
            border-radius: 14px;
            box-shadow: var(--cb-shadow, 0 8px 32px rgba(0,0,0,0.5));
            display: none;
            flex-direction: column;
            z-index: 99998;
            overflow: hidden;
            background-color: var(--surface_elevated, #ffffff);
            border: 1px solid var(--cmemo-accent-bg);
            -webkit-backdrop-filter: blur(12px);
            backdrop-filter: blur(12px);
            resize: both;
        }

        #crac-memo-container.crac-memo-dark {
            --cmemo-accent: #7F77DD;
            --cmemo-accent-soft: #AFA9EC;
            --cmemo-accent-text: #CECBF6;
            --cmemo-accent-bg: rgba(127, 119, 221, 0.12);
        }

        #crac-memo-container.crac-memo-light {
            --cmemo-accent: #534AB7;
            --cmemo-accent-soft: #7F77DD;
            --cmemo-accent-text: #3C3489;
            --cmemo-accent-bg: rgba(83, 74, 183, 0.08);
        }

        @supports (backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px)) {
            @supports (background-color: color-mix(in srgb, black 50%, transparent)) {
                #crac-memo-container {
                    background-color: color-mix(in srgb, var(--surface_elevated, #ffffff) 90%, transparent);
                }

                #crac-memo-header {
                    background-color: color-mix(in srgb, var(--surface_tertiary, #f7f7f5) 88%, transparent);
                }
            }
        }

        /* 상단 헤더 */
        #crac-memo-header {
            padding: 11px 12px 11px 16px;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            background-color: var(--surface_tertiary, #f7f7f5);
            color: var(--text_primary, #1a1918);
            border-bottom: 1px solid var(--divider_secondary, #dbdad5);
            cursor: grab;
            user-select: none;
            touch-action: none;
            flex-shrink: 0;
        }

        #crac-memo-header:active {
            cursor: grabbing;
        }

        #crac-memo-title {
            color: var(--cmemo-accent-text);
            letter-spacing: 0.09em;
            white-space: nowrap;
        }

        #crac-memo-header-actions {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 8px;
        }

        #crac-memo-status {
            min-width: 0;
            font-size: 12px;
            font-weight: normal;
            color: var(--cmemo-accent-soft);
            white-space: nowrap;
        }

        #crac-memo-mode-toggle {
            min-width: 58px;
            height: 26px;
            padding: 0 10px;
            border: 1px solid var(--cmemo-accent-bg);
            border-radius: 9999px;
            background-color: var(--cmemo-accent-bg);
            color: var(--cmemo-accent-text);
            font: inherit;
            font-size: 11px;
            font-weight: 700;
            line-height: 1;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }

        #crac-memo-mode-toggle:hover {
            opacity: 0.88;
        }

        #crac-memo-mode-toggle:active {
            transform: scale(0.97);
        }

        #crac-memo-textarea,
        #crac-memo-preview {
            flex: 1;
            min-height: 0;
            width: 100%;
            height: 100%;
            padding: 5px 16px !important;
            box-sizing: border-box;
            overflow: auto;
        }

        #crac-memo-textarea {
            border: none;
            resize: none;
            outline: none;
            font-family: inherit;
            font-size: 15px !important;
            line-height: 30px !important;
            color: var(--text_primary, #1a1918);
            background-color: transparent;
            background-image: linear-gradient(transparent 29px, var(--divider_secondary, #dbdad5) 29px);
            background-size: 100% 30px;
            background-position: 0 5px;
            background-attachment: local;
        }

        #crac-memo-preview {
            display: none;
            font-family: inherit;
            font-size: 15px;
            line-height: 1.75;
            color: var(--text_primary);
            overflow-wrap: anywhere;
            background-color: transparent;
        }

        #crac-memo-textarea::-webkit-scrollbar,
        #crac-memo-preview::-webkit-scrollbar {
            width: 6px;
        }

        #crac-memo-textarea::-webkit-scrollbar-track,
        #crac-memo-preview::-webkit-scrollbar-track {
            background: transparent;
        }

        #crac-memo-textarea::-webkit-scrollbar-thumb,
        #crac-memo-preview::-webkit-scrollbar-thumb {
            border-radius: 10px;
        }

        #crac-memo-textarea::-webkit-scrollbar-thumb {
            background: var(--icon_tertiary, #85837d);
        }

        #crac-memo-preview::-webkit-scrollbar-thumb {
            background: var(--icon_tertiary);
        }

        #crac-memo-preview h1,
        #crac-memo-preview h2,
        #crac-memo-preview h3,
        #crac-memo-preview p,
        #crac-memo-preview blockquote,
        #crac-memo-preview pre,
        #crac-memo-preview ul,
        #crac-memo-preview ol,
        #crac-memo-preview hr {
            color: var(--text_primary);
        }

        #crac-memo-preview h1 {
            margin: 12px 0 14px;
            padding: 0 0 7px;
            border-bottom: 2px solid var(--cmemo-accent);
            font-size: 1.35em;
            line-height: 1.35;
        }

        #crac-memo-preview h2,
        #crac-memo-preview h3 {
            margin: 12px 0 10px;
            padding-left: 8px;
            border-left: 3px solid var(--cmemo-accent);
            border-radius: 0;
            line-height: 1.4;
        }

        #crac-memo-preview h2 {
            font-size: 1.18em;
        }

        #crac-memo-preview h3 {
            font-size: 1.05em;
        }

        #crac-memo-preview p {
            margin: 0 0 10px;
        }

        #crac-memo-preview blockquote {
            margin: 8px 0 12px;
            padding: 8px 10px;
            border-left: 3px solid var(--cmemo-accent);
            background-color: var(--cmemo-accent-bg);
        }

        #crac-memo-preview pre {
            margin: 8px 0 12px;
            padding: 10px 12px;
            overflow: auto;
            background-color: var(--cmemo-accent-bg);
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            white-space: pre-wrap;
            word-break: break-word;
        }

        #crac-memo-preview code {
            padding: 0.12em 0.34em;
            background-color: var(--cmemo-accent-bg);
            color: var(--text_primary);
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }

        #crac-memo-preview pre code {
            padding: 0;
            background-color: transparent;
        }

        #crac-memo-preview hr {
            height: 0;
            margin: 14px 0;
            border: 0;
            border-top: 1px solid var(--cmemo-accent-soft);
        }

        #crac-memo-preview ul,
        #crac-memo-preview ol {
            margin: 8px 0 12px;
            padding-left: 24px;
        }

        #crac-memo-preview li {
            margin: 3px 0;
        }

        #crac-memo-preview .crac-memo-checklist {
            padding-left: 4px;
            list-style: none;
        }

        #crac-memo-preview .crac-memo-checklist input {
            margin: 0 7px 0 0;
            accent-color: var(--cmemo-accent);
            vertical-align: middle;
        }

        #crac-memo-preview .crac-memo-table-wrap {
            width: 100%;
            margin: 8px 0 12px;
            overflow-x: auto;
        }

        #crac-memo-preview table {
            width: 100%;
            min-width: max-content;
            border-collapse: collapse;
            color: var(--text_primary);
            font-size: 13px;
        }

        #crac-memo-preview th,
        #crac-memo-preview td {
            border: 1px solid var(--divider_secondary);
            padding: 6px 10px;
            vertical-align: top;
        }

        #crac-memo-preview th {
            background-color: var(--cmemo-accent-bg);
            color: var(--cmemo-accent-text);
            font-weight: 700;
        }

        #crac-memo-preview strong {
            color: var(--cmemo-accent-text);
        }
    `;
    document.head.appendChild(style);

    // ------------------------------------------------------------------
    // 2) 요소 생성
    // ------------------------------------------------------------------
    const btn = document.createElement('button');
    btn.id = 'crac-memo-btn';
    btn.type = 'button';
    btn.textContent = '📋';
    btn.title = '채팅방 메모 열기';

    const container = document.createElement('div');
    container.id = 'crac-memo-container';
    container.className = 'crac-memo-dark';

    const header = document.createElement('div');
    header.id = 'crac-memo-header';

    const title = document.createElement('span');
    title.id = 'crac-memo-title';
    title.innerText = '✦ MEMO';

    const headerActions = document.createElement('div');
    headerActions.id = 'crac-memo-header-actions';

    const status = document.createElement('span');
    status.id = 'crac-memo-status';
    status.innerText = '';

    const modeToggle = document.createElement('button');
    modeToggle.id = 'crac-memo-mode-toggle';
    modeToggle.type = 'button';
    modeToggle.innerText = '미리보기';
    modeToggle.title = '마크다운 미리보기';

    headerActions.appendChild(status);
    headerActions.appendChild(modeToggle);
    header.appendChild(title);
    header.appendChild(headerActions);

    const textarea = document.createElement('textarea');
    textarea.id = 'crac-memo-textarea';
    textarea.placeholder = '여기에 메모를 작성하세요... (자동 저장)';

    const preview = document.createElement('div');
    preview.id = 'crac-memo-preview';

    ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel']
        .forEach((eventName) => {
            textarea.addEventListener(eventName, (e) => e.stopPropagation());
        });

    ['pointerdown', 'pointerup', 'click'].forEach((eventName) => {
        modeToggle.addEventListener(eventName, (e) => e.stopPropagation());
    });

    container.appendChild(header);
    container.appendChild(textarea);
    container.appendChild(preview);
    document.body.appendChild(container);

    // ------------------------------------------------------------------
    // 3) 전송 버튼 찾기 + 메모 버튼 삽입
    // ------------------------------------------------------------------
    function getInputEl() {
        const selectors = [
            'div[contenteditable="true"].__chat_input_textarea',
            'div[contenteditable="true"].ProseMirror',
            'div[contenteditable="true"][translate="no"]',
            '[contenteditable="true"][data-placeholder]',
            'textarea.__chat_input_textarea',
            'textarea'
        ];

        const candidates = Array.from(document.querySelectorAll(selectors.join(','))).filter((el) => {
            if (!(el instanceof HTMLElement)) return false;

            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;

            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;

            return true;
        });

        if (candidates.length === 0) return null;

        const preferred = candidates.find((el) => el.classList.contains('__chat_input_textarea'));
        if (preferred) return preferred;

        candidates.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return br.bottom - ar.bottom;
        });

        return candidates[0];
    }

    // route guard: 채팅방에서만 주입
    function isAllowedStoryChatPath() {
        return /^\/stories\/[^/]+\/episodes\/[^/]+(?:\/|$)/.test(location.pathname);
    }

    // 삭제/플레이 불가 스토리 감지 (4틱마다 실제 스캔)
    let tickCount = 0;
    let storyUnavailableCache = false;
    let storyUnavailableLastScanTick = -1;

    function isStoryUnavailable() {
        if (tickCount % 4 !== 0 || storyUnavailableLastScanTick === tickCount) {
            return storyUnavailableCache;
        }

        storyUnavailableLastScanTick = tickCount;
        storyUnavailableCache = Array.from(document.querySelectorAll('p'))
            .some((p) => p.textContent && p.textContent.includes('스토리가 삭제되어'));

        return storyUnavailableCache;
    }

    // ✨ 확프 findSendButton 이식 (id 배제에 메모 wrap 포함)
    function findSendButton() {
        const input = getInputEl();
        if (!input) return null;

        const inRect = input.getBoundingClientRect();
        const inputMidY = inRect.top + inRect.height / 2;
        const inputCx = inRect.left + inRect.width / 2;

        const isComposerButton = (b) => {
            if (!b || b.contains(input)) return false;
            const id = b.id || '';
            if (id.startsWith('crack-') || id === 'crac-memo-btn') return false;
            if (b.closest('#crac-memo-wrap')) return false;

            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;

            const cy = r.top + r.height / 2;
            if (cy < inputMidY - 40) return false;           // 상단 HUD 배제
            if (r.left + r.width / 2 < inputCx) return false; // 좌측 툴바 배제

            let p = b;
            for (let i = 0; i < 6 && p && p !== document.body; i++, p = p.parentElement) {
                if (getComputedStyle(p).position === 'fixed') return false;
            }

            return true;
        };

        // 1순위: justify-between row의 검증 통과한 마지막 직계 버튼
        let node = input;
        for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
            if (!(node instanceof HTMLElement) || !node.querySelectorAll) continue;

            const rows = Array.from(node.querySelectorAll('div.justify-between'));
            for (let r = rows.length - 1; r >= 0; r--) {
                const btns = Array.from(rows[r].children || []).filter(
                    (c) => c.tagName === 'BUTTON' && isComposerButton(c)
                );

                if (btns.length > 0) return btns[btns.length - 1];
            }
        }

        // 폴백: space-x-2 제외 flex row의 마지막 검증 버튼
        node = input;
        for (let i = 0; i < 8 && node; i++, node = node.parentElement) {
            if (!(node instanceof HTMLElement) || !node.querySelectorAll) continue;

            const rows = Array.from(node.querySelectorAll('div.flex')).filter(
                (d) => !d.classList.contains('space-x-2')
            );

            for (let r = rows.length - 1; r >= 0; r--) {
                const btns = Array.from(rows[r].children || []).filter(
                    (c) => c.tagName === 'BUTTON' && isComposerButton(c)
                );

                if (btns.length > 0) return btns[btns.length - 1];
            }
        }

        // 최종 폴백: 조상 전체에서 가장 오른쪽 검증 버튼
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

    function injectMemoButton() {
        if (!isAllowedStoryChatPath()) return;
        if (isStoryUnavailable()) return;

        const sendBtn = findSendButton();
        if (!sendBtn || !sendBtn.parentNode) return;

        const sendParent = sendBtn.parentNode;
        const magicGroup = document.getElementById('crack-pure-send-left-group');
        const useMagicGroup = magicGroup && magicGroup.parentNode === sendParent;

        let memoWrap = document.getElementById('crac-memo-wrap');
        if (!memoWrap) {
            memoWrap = document.createElement('div');
            memoWrap.id = 'crac-memo-wrap';
            memoWrap.appendChild(btn);
        } else if (!memoWrap.contains(btn)) {
            memoWrap.replaceChildren(btn);
        }

        if (useMagicGroup) {
            // ✨ 그룹 안 맨 앞에 합류 → [📋][✨][전송], gap은 그룹 CSS가 처리
            memoWrap.style.marginLeft = '';
            memoWrap.style.marginRight = '';
            if (memoWrap.parentNode === magicGroup && magicGroup.firstElementChild === memoWrap) {
                return; // 이미 올바른 위치
            }
            magicGroup.insertBefore(memoWrap, magicGroup.firstElementChild);
        } else {
            // ✨ 없음: 전송 버튼 앞. 우측 정렬(auto) + 전송과 간격(margin-right)
            const isSpread = sendParent.classList && sendParent.classList.contains('justify-between');
            memoWrap.style.marginLeft = isSpread ? 'auto' : '';
            memoWrap.style.marginRight = '6px';
            if (memoWrap.parentNode === sendParent && memoWrap.nextElementSibling === sendBtn) {
                return; // 이미 올바른 위치
            }
            sendParent.insertBefore(memoWrap, sendBtn);
        }
    }

    // ------------------------------------------------------------------
    // 4) 드래그 기능 (Pointer Events 통합)
    // ------------------------------------------------------------------
    let isDragging = false;
    let dragPointerId = null;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#crac-memo-mode-toggle')) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        isDragging = true;
        dragPointerId = e.pointerId;

        const rect = container.getBoundingClientRect();

        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.style.left = rect.left + 'px';
        container.style.top = rect.top + 'px';

        startX = e.clientX;
        startY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;

        header.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    });

    header.addEventListener('pointermove', (e) => {
        if (!isDragging || e.pointerId !== dragPointerId) return;

        const maxX = Math.max(0, window.innerWidth - container.offsetWidth);
        const maxY = Math.max(0, window.innerHeight - container.offsetHeight);
        const newX = Math.min(maxX, Math.max(0, initialLeft + (e.clientX - startX)));
        const newY = Math.min(maxY, Math.max(0, initialTop + (e.clientY - startY)));

        container.style.left = newX + 'px';
        container.style.top = newY + 'px';
        e.preventDefault();
    });

    function finishMemoDrag(e) {
        if (!isDragging || e.pointerId !== dragPointerId) return;

        if (header.hasPointerCapture(e.pointerId)) {
            header.releasePointerCapture(e.pointerId);
        }

        isDragging = false;
        dragPointerId = null;
        saveMemoWindowState();
        e.stopPropagation();
    }

    header.addEventListener('pointerup', finishMemoDrag);
    header.addEventListener('pointercancel', finishMemoDrag);

    // ------------------------------------------------------------------
    // 4-1) 테마 감지 + 마크다운 미리보기
    // ------------------------------------------------------------------
    function detectMemoTheme() {
        const backgroundColor = getComputedStyle(container).backgroundColor;
        let red;
        let green;
        let blue;

        const rgbMatch = backgroundColor.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
        if (rgbMatch) {
            red = Number(rgbMatch[1]);
            green = Number(rgbMatch[2]);
            blue = Number(rgbMatch[3]);
        } else {
            const srgbMatch = backgroundColor.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
            if (srgbMatch) {
                red = Number(srgbMatch[1]) * 255;
                green = Number(srgbMatch[2]) * 255;
                blue = Number(srgbMatch[3]) * 255;
            }
        }

        const isDark = ![red, green, blue].every(Number.isFinite)
            || (0.2126 * red + 0.7152 * green + 0.0722 * blue) < 128;

        container.classList.toggle('crac-memo-dark', isDark);
        container.classList.toggle('crac-memo-light', !isDark);
    }

    function renderMemoMarkdown(text) {
        const escaped = String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const codeBlocks = [];
        const codeProtected = escaped.replace(/```(?:[^\n`]*\n)?([\s\S]*?)```/g, (_, code) => {
            const index = codeBlocks.length;
            const token = `\uE100${index}\uE101`;
            codeBlocks.push(`<pre><code>${code.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>`);
            return `\n${token}\n`;
        });

        function renderInline(value) {
            const inlineCodes = [];
            let rendered = value.replace(/`([^`\n]+)`/g, (_, code) => {
                const index = inlineCodes.length;
                inlineCodes.push(`<code>${code}</code>`);
                return `\uE200${index}\uE201`;
            });

            rendered = rendered.replace(/\*\*\*([^\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
            rendered = rendered.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
            rendered = rendered.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
            rendered = rendered.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');

            inlineCodes.forEach((code, index) => {
                rendered = rendered.replace(`\uE200${index}\uE201`, code);
            });

            return rendered;
        }

        function parseTableRow(line) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('|')) return null;

            const cells = trimmed.split('|');
            cells.shift();
            if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
                cells.pop();
            }

            return cells.map((cell) => cell.trim());
        }

        function parseTableAlignments(line, expectedColumns) {
            const cells = parseTableRow(line);
            if (!cells || cells.length !== expectedColumns || cells.length === 0) return null;
            if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;

            return cells.map((cell) => {
                const left = cell.startsWith(':');
                const right = cell.endsWith(':');
                if (left && right) return 'center';
                if (right) return 'right';
                if (left) return 'left';
                return '';
            });
        }

        function renderTableCell(tagName, value, alignment) {
            const alignStyle = alignment ? ` style="text-align:${alignment}"` : '';
            return `<${tagName}${alignStyle}>${renderInline(value)}</${tagName}>`;
        }

        const output = [];
        let paragraphLines = [];
        let listType = '';
        let listItems = [];

        const flushParagraph = () => {
            if (paragraphLines.length === 0) return;
            output.push(`<p>${renderInline(paragraphLines.join('<br>'))}</p>`);
            paragraphLines = [];
        };

        const flushList = () => {
            if (listItems.length === 0) return;

            if (listType === 'check') {
                output.push(`<ul class="crac-memo-checklist">${listItems.join('')}</ul>`);
            } else {
                output.push(`<${listType}>${listItems.join('')}</${listType}>`);
            }

            listType = '';
            listItems = [];
        };

        const openList = (nextType) => {
            flushParagraph();
            if (listType && listType !== nextType) flushList();
            listType = nextType;
        };

        const lines = codeProtected.split(/\r?\n/);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const trimmed = line.trim();
            const codeTokenMatch = trimmed.match(/^\uE100(\d+)\uE101$/);

            if (codeTokenMatch) {
                flushParagraph();
                flushList();
                output.push(trimmed);
                continue;
            }

            if (!trimmed) {
                flushParagraph();
                flushList();
                continue;
            }

            const headerCells = parseTableRow(line);
            const alignmentLine = lines[lineIndex + 1];
            const alignments = headerCells && alignmentLine !== undefined
                ? parseTableAlignments(alignmentLine, headerCells.length)
                : null;

            if (headerCells && alignments) {
                flushParagraph();
                flushList();

                const tableRows = [];
                tableRows.push(`<thead><tr>${headerCells.map((cell, index) => (
                    renderTableCell('th', cell, alignments[index])
                )).join('')}</tr></thead>`);

                const bodyRows = [];
                lineIndex += 2;

                while (lineIndex < lines.length) {
                    const rowCells = parseTableRow(lines[lineIndex]);
                    if (!rowCells) break;

                    const normalizedCells = Array.from(
                        { length: headerCells.length },
                        (_, index) => rowCells[index] ?? ''
                    );

                    bodyRows.push(`<tr>${normalizedCells.map((cell, index) => (
                        renderTableCell('td', cell, alignments[index])
                    )).join('')}</tr>`);
                    lineIndex++;
                }

                if (bodyRows.length > 0) {
                    tableRows.push(`<tbody>${bodyRows.join('')}</tbody>`);
                }

                output.push(`<div class="crac-memo-table-wrap"><table>${tableRows.join('')}</table></div>`);
                lineIndex--;
                continue;
            }

            if (/^---$/.test(trimmed)) {
                flushParagraph();
                flushList();
                output.push('<hr>');
                continue;
            }

            const headingMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
            if (headingMatch) {
                flushParagraph();
                flushList();
                const level = headingMatch[1].length;
                output.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
                continue;
            }

            const quoteMatch = line.match(/^\s*&gt;\s?(.*)$/);
            if (quoteMatch) {
                flushParagraph();
                flushList();
                output.push(`<blockquote>${renderInline(quoteMatch[1])}</blockquote>`);
                continue;
            }

            const checkboxMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
            if (checkboxMatch) {
                openList('check');
                const checked = checkboxMatch[1].toLowerCase() === 'x' ? ' checked' : '';
                listItems.push(`<li><label><input type="checkbox" disabled${checked}>${renderInline(checkboxMatch[2])}</label></li>`);
                continue;
            }

            const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
            if (unorderedMatch) {
                openList('ul');
                listItems.push(`<li>${renderInline(unorderedMatch[1])}</li>`);
                continue;
            }

            const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
            if (orderedMatch) {
                openList('ol');
                listItems.push(`<li>${renderInline(orderedMatch[1])}</li>`);
                continue;
            }

            flushList();
            paragraphLines.push(line);
        }

        flushParagraph();
        flushList();

        let html = output.join('');
        codeBlocks.forEach((block, index) => {
            html = html.replace(`\uE100${index}\uE101`, block);
        });

        return html;
    }

    let memoMode = 'edit';

    function setMemoMode(nextMode) {
        memoMode = nextMode === 'preview' ? 'preview' : 'edit';
        const isPreview = memoMode === 'preview';

        if (isPreview) {
            preview.innerHTML = renderMemoMarkdown(textarea.value);
        } else {
            preview.replaceChildren();
        }

        textarea.style.display = isPreview ? 'none' : 'block';
        preview.style.display = isPreview ? 'block' : 'none';
        modeToggle.innerText = isPreview ? '편집' : '미리보기';
        modeToggle.title = isPreview ? '편집 모드로 돌아가기' : '마크다운 미리보기';
    }

    modeToggle.addEventListener('click', () => {
        setMemoMode(memoMode === 'edit' ? 'preview' : 'edit');

        if (memoMode === 'edit') {
            textarea.focus();
        }
    });

    // ------------------------------------------------------------------
    // 5) 창 위치/크기 저장
    // ------------------------------------------------------------------
    const WINDOW_STATE_KEY = 'crac_memo_window_state';

    function saveMemoWindowState() {
        const rect = container.getBoundingClientRect();

        const state = {
            width: container.style.width || rect.width + 'px',
            height: container.style.height || rect.height + 'px',
            left: container.style.left || '',
            top: container.style.top || '',
            right: container.style.right || '20px',
            bottom: container.style.bottom || '88px'
        };

        localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
    }

    function loadMemoWindowState() {
        const raw = localStorage.getItem(WINDOW_STATE_KEY);
        if (!raw) return;

        try {
            const state = JSON.parse(raw);

            if (state.width) container.style.width = state.width;
            if (state.height) container.style.height = state.height;

            if (state.left && state.top) {
                container.style.left = state.left;
                container.style.top = state.top;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } else {
                container.style.right = state.right || '20px';
                container.style.bottom = state.bottom || '88px';
                container.style.left = 'auto';
                container.style.top = 'auto';
            }
        } catch (e) {
            console.warn('메모창 상태 복원 실패:', e);
        }
    }

    let resizeSaveTimer = null;

    const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeSaveTimer);

        resizeSaveTimer = setTimeout(() => {
            if (container.style.display === 'flex') {
                saveMemoWindowState();
            }
        }, 120);
    });

    resizeObserver.observe(container);

    // ------------------------------------------------------------------
    // 6) 메모 저장/불러오기
    // ------------------------------------------------------------------
    let currentRoomId = '';
    let saveTimeout = null;

    function getRoomIdFromUrl() {
        const match = location.href.match(/stories\/([^\/]+)\/episodes\/([^\/]+)/);

        if (match) {
            return `crac_memo_${match[1]}_${match[2]}`;
        }

        return null;
    }

    function loadMemo() {
        const newRoomId = getRoomIdFromUrl();

        if (!newRoomId) {
            setMemoMode('edit');
            textarea.value = '채팅방 안에서만 메모를 작성할 수 있습니다.';
            textarea.disabled = true;
            currentRoomId = '';
            return;
        }

        if (newRoomId !== currentRoomId) {
            setMemoMode('edit');
            currentRoomId = newRoomId;
            textarea.disabled = false;
            textarea.value = localStorage.getItem(currentRoomId) || '';
            status.innerText = '';
        }
    }

    textarea.addEventListener('input', () => {
        if (!currentRoomId) return;

        status.innerText = '저장 중...';
        clearTimeout(saveTimeout);

        saveTimeout = setTimeout(() => {
            localStorage.setItem(currentRoomId, textarea.value);
            status.innerText = '저장됨 ✓';

            setTimeout(() => {
                if (status.innerText === '저장됨 ✓') {
                    status.innerText = '';
                }
            }, 2000);
        }, 500);
    });

    // ------------------------------------------------------------------
    // 7) 화면 밖 이탈 보정
    // ------------------------------------------------------------------
    function clampMemoWindowIntoViewport() {
        const rect = container.getBoundingClientRect();

        let left = rect.left;
        let top = rect.top;
        let changed = false;

        if (rect.width > window.innerWidth) {
            container.style.width = Math.max(240, window.innerWidth - 20) + 'px';
            changed = true;
        }

        if (rect.height > window.innerHeight) {
            container.style.height = Math.max(220, window.innerHeight - 20) + 'px';
            changed = true;
        }

        const newRect = container.getBoundingClientRect();

        if (newRect.left < 0) {
            left = 0;
            changed = true;
        }

        if (newRect.top < 0) {
            top = 0;
            changed = true;
        }

        if (newRect.right > window.innerWidth) {
            left = Math.max(0, window.innerWidth - newRect.width);
            changed = true;
        }

        if (newRect.bottom > window.innerHeight) {
            top = Math.max(0, window.innerHeight - newRect.height);
            changed = true;
        }

        if (changed) {
            container.style.right = 'auto';
            container.style.bottom = 'auto';
            container.style.left = left + 'px';
            container.style.top = top + 'px';
            saveMemoWindowState();
        }
    }

    window.addEventListener('resize', () => {
        if (container.style.display === 'flex') {
            clampMemoWindowIntoViewport();
        }
    });

    // ------------------------------------------------------------------
    // 8) 토글
    // ------------------------------------------------------------------
    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        if (container.style.display === 'flex') {
            container.style.display = 'none';
            return;
        }

        setMemoMode('edit');
        loadMemo();
        loadMemoWindowState();

        container.style.display = 'flex';

        clampMemoWindowIntoViewport();

        textarea.focus();
    });

    // ------------------------------------------------------------------
    // 9) SPA 대응 (경량 루프, 전역 observer 제거)
    // ------------------------------------------------------------------
    let lastUrl = location.href;

    function tick() {
        tickCount += 1;

        // 채팅방이 아니거나 삭제된 스토리면 버튼 정리 후 중단
        if (!isAllowedStoryChatPath() || isStoryUnavailable()) {
            const memoWrap = document.getElementById('crac-memo-wrap');
            if (memoWrap) memoWrap.remove();
            if (container.style.display === 'flex') {
                container.style.display = 'none';
            }
        } else {
            injectMemoButton();
        }

        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (container.style.display === 'flex') {
                loadMemo();
            }
        }

        if (container.style.display === 'flex') {
            detectMemoTheme();

            const checkId = getRoomIdFromUrl();
            if (checkId !== currentRoomId) {
                loadMemo();
            }
        }
    }

    function initialInject() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (isAllowedStoryChatPath() && !isStoryUnavailable()) {
                    injectMemoButton();
                }
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