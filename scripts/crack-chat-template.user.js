// ==UserScript==
// @name         📜 Crack Chat Template Manager (채팅 템플릿 매니저)
// @namespace    crack-chat-template
// @version      2.3.8
// @description  대사 / OOC 템플릿 + 퀵버튼 (순정 버튼 class 보존 + 가벼운 감지)
// @author       Gemini & User
// @match        https://crack.wrtn.ai/stories/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    "use strict";

    if (window.ctmFinalInstanceV2_13) return;
    window.ctmFinalInstanceV2_13 = true;

    const STORAGE_KEY = "cc_templates_v2";

    // --- 🎨 CSS ---
    function addStyle(css) {
        const style = document.createElement('style');
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    addStyle(`
        :root {
            --ctm-bg: rgba(15, 15, 15, 0.75);
            --ctm-text: #e5e5e5;
            --ctm-border: rgba(255, 255, 255, 0.1);
            --ctm-header-bg: rgba(0, 0, 0, 0.4);
            --ctm-header-text: #fff;
            --ctm-input-bg: rgba(0, 0, 0, 0.5);
            --ctm-input-text: #fff;
            --ctm-input-border: rgba(255, 255, 255, 0.15);
            --ctm-item-bg: rgba(255, 255, 255, 0.04);
            --ctm-item-hover: rgba(255, 255, 255, 0.08);
            --ctm-item-border-hover: rgba(255, 255, 255, 0.2);
            --ctm-title: #60a5fa;
            --ctm-content: #ccc;
            --ctm-fab-bg: rgba(20, 20, 20, 0.8);
            --ctm-fab-text: #a1a1aa;
            --ctm-fab-hover-bg: rgba(255, 255, 255, 0.1);
            --ctm-fab-hover-text: #fff;
            --ctm-fab-border: rgba(255, 255, 255, 0.15);
            --ctm-modal-overlay: rgba(0, 0, 0, 0.6);
            --ctm-modal-bg: rgba(20, 20, 20, 0.85);
            --ctm-scroll-thumb: rgba(255, 255, 255, 0.2);
            --ctm-pinned-bg: rgba(250, 204, 21, 0.05);
        }

        .ctm-light-theme {
            --ctm-bg: rgba(250, 250, 250, 0.85);
            --ctm-text: #334155;
            --ctm-border: rgba(0, 0, 0, 0.1);
            --ctm-header-bg: rgba(230, 230, 230, 0.9);
            --ctm-header-text: #1e293b;
            --ctm-input-bg: rgba(255, 255, 255, 0.8);
            --ctm-input-text: #334155;
            --ctm-input-border: rgba(0, 0, 0, 0.15);
            --ctm-item-bg: rgba(0, 0, 0, 0.03);
            --ctm-item-hover: rgba(0, 0, 0, 0.06);
            --ctm-item-border-hover: rgba(0, 0, 0, 0.2);
            --ctm-title: #3b82f6;
            --ctm-content: #64748b;
            --ctm-fab-bg: rgba(255, 255, 255, 0.9);
            --ctm-fab-text: #475569;
            --ctm-fab-hover-bg: rgba(0, 0, 0, 0.05);
            --ctm-fab-hover-text: #0f172a;
            --ctm-fab-border: rgba(0, 0, 0, 0.15);
            --ctm-modal-overlay: rgba(255, 255, 255, 0.4);
            --ctm-modal-bg: rgba(250, 250, 250, 0.95);
            --ctm-scroll-thumb: rgba(0, 0, 0, 0.2);
            --ctm-pinned-bg: rgba(250, 204, 21, 0.15);
        }

        #ctmWrapper {
            display: inline-flex !important;
            align-items: center !important;
            gap: 0.5rem !important;
            flex-shrink: 0 !important;
        }

        #ctmFab svg { width: 1rem; height: 1rem; fill: currentColor; pointer-events: none; }
        .ctm-quick-btn { line-height: 1; }

        #ctmPanel {
            position: fixed; top: 10%; left: 60%;
            width: 380px; height: 550px; max-height: 85vh;
            background: var(--ctm-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--ctm-border);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 2147483647;
            display: none; flex-direction: column; overflow: hidden;
            font-family: 'Pretendard', sans-serif; color: var(--ctm-text);
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }
        .ctm-header {
            padding: 14px 18px; background: var(--ctm-header-bg); border-bottom: 1px solid var(--ctm-border);
            display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 14px;
            cursor: move; user-select: none; color: var(--ctm-header-text);
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }
        .ctm-close { cursor: pointer; opacity: 0.7; font-size: 18px; }
        .ctm-close:hover { opacity: 1; }

        .ctm-body { padding: 14px; display: flex; flex-direction: column; gap: 12px; flex: 1; overflow: hidden; }
        .ctm-toolbar { display: flex; gap: 6px; }
        .ctm-search-box {
            flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--ctm-input-border);
            background: var(--ctm-input-bg); color: var(--ctm-input-text); outline: none; font-size: 13px;
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }
        .ctm-search-box::placeholder { color: var(--ctm-content); }
        .ctm-icon-btn {
            padding: 0 12px; border-radius: 8px; border: 1px solid var(--ctm-input-border); cursor: pointer;
            background: var(--ctm-input-bg); color: var(--ctm-input-text); display: flex; align-items: center; justify-content: center;
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }
        .ctm-icon-btn:hover { background: var(--ctm-fab-hover-bg); }

        .ctm-list {
            display: flex; flex-direction: column; gap: 8px; flex: 1; overflow-y: auto;
            border-top: 1px solid var(--ctm-border); padding-top: 12px;
        }
        .ctm-list::-webkit-scrollbar { width: 5px; }
        .ctm-list::-webkit-scrollbar-thumb { background: var(--ctm-scroll-thumb); border-radius: 5px; }

        .ctm-item {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px; background: var(--ctm-item-bg); border-radius: 8px;
            cursor: pointer; transition: 0.2s; border: 1px solid transparent; gap: 8px;
        }
        .ctm-item:hover { background: var(--ctm-item-hover); border-color: var(--ctm-item-border-hover); }
        .ctm-item.pinned { border-left: 3px solid #facc15; background: var(--ctm-pinned-bg); }

        .ctm-item-text { display: flex; flex-direction: column; gap: 4px; overflow: hidden; flex: 1; }
        .ctm-title { font-weight: bold; font-size: 14px; color: var(--ctm-title); display: flex; align-items: center; gap: 6px; }
        .ctm-badge { font-size: 11px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; }
        .ctm-content { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ctm-content); }

        .ctm-actions { display: flex; gap: 4px; }
        .ctm-action-btn { background: none; border: none; color: inherit; opacity: 0.5; cursor: pointer; font-size: 14px; padding: 4px; transition: opacity 0.2s; }
        .ctm-action-btn:hover { opacity: 1; }
        .ctm-action-btn.pin-active { opacity: 1; color: #facc15; }

        .ctm-add-main-btn {
            padding: 12px; background: rgba(59, 130, 246, 0.8); color: #fff; border: 1px solid rgba(59, 130, 246, 0.5);
            border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; text-align: center; margin-top: auto;
            backdrop-filter: blur(4px); transition: 0.2s;
        }
        .ctm-add-main-btn:hover { background: rgba(59, 130, 246, 1); }

        #ctmModal {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: var(--ctm-modal-overlay); backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            display: none; justify-content: center; align-items: center; z-index: 10;
            transition: background 0.3s;
        }
        .ctm-modal-content {
            background: var(--ctm-modal-bg); backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--ctm-border); border-radius: 12px;
            padding: 18px; width: 90%; display: flex; flex-direction: column; gap: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            transition: background 0.3s, border-color 0.3s;
        }
        .ctm-modal-content input, .ctm-modal-content textarea {
            padding: 10px; border-radius: 8px; border: 1px solid var(--ctm-input-border);
            background: var(--ctm-input-bg); color: var(--ctm-input-text); outline: none; font-size: 13px; width: 100%; box-sizing: border-box;
            transition: background 0.3s, color 0.3s, border-color 0.3s;
        }
        .ctm-modal-content textarea { height: 140px; resize: vertical; }
        .ctm-modal-btns { display: flex; gap: 10px; margin-top: 4px; }
        .ctm-modal-btn { flex: 1; padding: 10px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; font-size: 13px; }
        .ctm-btn-save { background: rgba(16, 185, 129, 0.8); color: white; border: 1px solid rgba(16, 185, 129, 0.5); }
        .ctm-btn-save:hover { background: rgba(16, 185, 129, 1); }
        .ctm-btn-cancel { background: rgba(75, 85, 99, 0.8); color: white; border: 1px solid rgba(75, 85, 99, 0.5); }
        .ctm-btn-cancel:hover { background: rgba(75, 85, 99, 1); }

        @media (max-width: 768px) {
            #ctmPanel {
                width: 92vw !important; height: 55vh !important;
                top: 5% !important; left: 50% !important;
                transform: translateX(-50%) !important;
            }
            .ctm-header { cursor: default; }
        }
    `);

    // --- 💾 데이터 관리 ---
    const getTemplates = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const setTemplates = (list) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        if (typeof window.updateQuickButtons === 'function') window.updateQuickButtons();
    };
    let currentEditId = null;

    // --- 🔍 채팅 입력창 찾기 (textarea + contenteditable 통합) ---
    function findChatInput() {
        // 1. 새 에디터(TipTap/ProseMirror) 최우선 - placeholder가 "메시지 보내기"인 contenteditable
        let el = document.querySelector('.__chat_input_textarea');
        if (el) return el;

        // 2. data-placeholder로 ProseMirror 내부 p 태그 찾고 부모 에디터로
        const editorP = document.querySelector('p[data-placeholder*="메시지"], p[data-placeholder*="Message"]');
        if (editorP) {
            const editor = editorP.closest('[contenteditable="true"]');
            if (editor) return editor;
        }

        // 3. ProseMirror/tiptap contenteditable 일반 찾기
        el = document.querySelector('div.ProseMirror[contenteditable="true"], div.tiptap[contenteditable="true"]');
        if (el && !el.closest('#ctmPanel')) return el;

        // 4. 기존 textarea (placeholder 매치)
        el = document.querySelector('textarea[placeholder*="메시지"], textarea[placeholder*="Message"]');
        if (el) return el;

        // 5. 일반 textarea fallback
        const textareas = Array.from(document.querySelectorAll('textarea')).filter(ta => {
            return !ta.closest('[role="dialog"]') && !ta.closest('#ctmPanel');
        });
        if (textareas.length > 0) return textareas[textareas.length - 1];

        // 6. 마지막 fallback: 포커스된 요소
        if (document.activeElement) {
            const ae = document.activeElement;
            if (ae.tagName === "TEXTAREA") return ae;
            if (ae.getAttribute && ae.getAttribute('contenteditable') === 'true') return ae;
        }

        return null;
    }

    // --- 🛠️ 텍스트 입력 함수 (TipTap/ProseMirror 대응) ---
    function insertTextToChat(text) {
        const input = findChatInput();
        if (!input) {
            console.warn('[CTM] 채팅 입력창을 찾지 못했습니다.');
            return;
        }

        const isTextarea = input.tagName === 'TEXTAREA';

        if (isTextarea) {
            // === 기존 textarea 처리 ===
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            const originalText = input.value;

            input.value = originalText.substring(0, start) + text + originalText.substring(end);

            const tracker = input._valueTracker;
            if (tracker) tracker.setValue(originalText);

            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        } else {
            // === contenteditable (TipTap/ProseMirror) 처리 ===
            input.focus();

            // 커서 위치 보장: 셀렉션이 에디터 내부에 없으면 끝으로 이동
            const sel = window.getSelection();
            let needsRangeFix = true;
            if (sel && sel.rangeCount > 0) {
                const r = sel.getRangeAt(0);
                if (input.contains(r.commonAncestorContainer)) needsRangeFix = false;
            }
            if (needsRangeFix) {
                const range = document.createRange();
                range.selectNodeContents(input);
                range.collapse(false); // 끝으로
                sel.removeAllRanges();
                sel.addRange(range);
            }

            // 1차 시도: beforeinput 이벤트 (ProseMirror가 가장 잘 받는 방식)
            let handled = false;
            try {
                const beforeInputEvt = new InputEvent('beforeinput', {
                    inputType: 'insertText',
                     text,
                    bubbles: true,
                    cancelable: true,
                });
                handled = !input.dispatchEvent(beforeInputEvt);
            } catch (e) {
                handled = false;
            }

            // 2차 시도: execCommand (사파리/구버전에서 가장 안정적)
            if (!handled) {
                try {
                    handled = document.execCommand('insertText', false, text);
                } catch (e) {
                    handled = false;
                }
            }

            // 3차 시도: 수동 텍스트 노드 삽입 + input 이벤트
            if (!handled) {
                const sel2 = window.getSelection();
                if (sel2 && sel2.rangeCount > 0) {
                    const range = sel2.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(text);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    sel2.removeAllRanges();
                    sel2.addRange(range);
                }
                input.dispatchEvent(new InputEvent('input', {
                    inputType: 'insertText',
                     text,
                    bubbles: true,
                }));
            }

            input.focus();
        }

        const panel = document.getElementById("ctmPanel");
        if (panel) panel.style.display = "none";
    }

    function renderList(filter = "") {
        const listEl = document.getElementById("ctmList");
        listEl.innerHTML = "";
        let templates = getTemplates();

        templates.sort((a, b) => (a.isPinned === b.isPinned) ? b.id - a.id : (a.isPinned ? -1 : 1));

        const filtered = templates.filter(t =>
            t.title.toLowerCase().includes(filter.toLowerCase()) ||
            t.content.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; opacity:0.5; font-size:12px; padding:30px 10px;">저장된 대사/노트가 없습니다.</div>`;
            return;
        }

        filtered.forEach(t => {
            const item = document.createElement("div");
            item.className = `ctm-item ${t.isPinned ? 'pinned' : ''}`;

            const itemText = document.createElement("div");
            itemText.className = "ctm-item-text";
            itemText.title = t.content;

            const titleDiv = document.createElement("div");
            titleDiv.className = "ctm-title";
            titleDiv.textContent = t.title;

            if (t.quickIcon) {
                const badge = document.createElement("span");
                badge.className = "ctm-badge";
                badge.textContent = `퀵: ${t.quickIcon}`;
                titleDiv.appendChild(badge);
            }

            const contentDiv = document.createElement("div");
            contentDiv.className = "ctm-content";
            contentDiv.textContent = t.content.replace(/\n/g, ' ');

            itemText.append(titleDiv, contentDiv);

            itemText.onclick = (e) => {
                e.preventDefault();
                insertTextToChat(t.content);
            };

            const actions = document.createElement("div");
            actions.className = "ctm-actions";
            actions.innerHTML = `
                <button class="ctm-action-btn pin-btn ${t.isPinned ? 'pin-active' : ''}">📌</button>
                <button class="ctm-action-btn edit-btn">✏️</button>
                <button class="ctm-action-btn del-btn">🗑️</button>
            `;

            actions.querySelector(".pin-btn").onclick = (e) => {
                e.stopPropagation();
                const list = getTemplates();
                const target = list.find(x => x.id === t.id);
                target.isPinned = !target.isPinned;
                setTemplates(list);
                renderList(document.getElementById("ctmSearch").value);
            };

            actions.querySelector(".edit-btn").onclick = (e) => {
                e.stopPropagation();
                openModal(t);
            };

            actions.querySelector(".del-btn").onclick = (e) => {
                e.stopPropagation();
                if (confirm(`'${t.title}'을 삭제할까요?`)) {
                    setTemplates(getTemplates().filter(x => x.id !== t.id));
                    renderList(document.getElementById("ctmSearch").value);
                }
            };

            item.append(itemText, actions);
            listEl.appendChild(item);
        });
    }

    function openModal(template = null) {
        const modal = document.getElementById("ctmModal");
        if (template) {
            currentEditId = template.id;
            document.getElementById("ctmModalTitle").value = template.title;
            document.getElementById("ctmModalIcon").value = template.quickIcon || "";
            document.getElementById("ctmModalContent").value = template.content;
        } else {
            currentEditId = null;
            document.getElementById("ctmModalTitle").value = "";
            document.getElementById("ctmModalIcon").value = "";
            document.getElementById("ctmModalContent").value = "";
        }
        modal.style.display = "flex";
    }

    function closeModal() {
        document.getElementById("ctmModal").style.display = "none";
        currentEditId = null;
    }

    function saveTemplate() {
        const title = document.getElementById("ctmModalTitle").value.trim();
        const quickIcon = document.getElementById("ctmModalIcon").value.trim();
        const content = document.getElementById("ctmModalContent").value.trim();
        if (!content) return;

        let list = getTemplates();
        if (currentEditId) {
            const idx = list.findIndex(t => t.id === currentEditId);
            if (idx > -1) {
                list[idx].title = title || content.substring(0, 10);
                list[idx].quickIcon = quickIcon;
                list[idx].content = content;
            }
        } else {
            list.push({
                id: Date.now(),
                title: title || content.substring(0, 10),
                quickIcon: quickIcon,
                content: content,
                isPinned: false
            });
        }
        setTemplates(list);
        closeModal();
        renderList();
    }

    function backupData() {
        const data = localStorage.getItem(STORAGE_KEY) || "[]";
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ctm_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    }

    function restoreData() {
        const input = document.createElement("input");
        input.type = "file";
        input.onchange = e => {
            const reader = new FileReader();
            reader.onload = ev => {
                setTemplates(JSON.parse(ev.target.result));
                renderList();
                alert("복구 완료!");
            };
            reader.readAsText(e.target.files[0]);
        };
        input.click();
    }

    function enableDrag(header, panel) {
        let isDragging = false, startX, startY, initialLeft, initialTop;
        header.onmousedown = e => {
            if (window.innerWidth <= 768) return;
            isDragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialLeft = rect.left; initialTop = rect.top;
            panel.style.transform = "none";
            panel.style.left = initialLeft + "px"; panel.style.top = initialTop + "px";
        };
        document.onmousemove = e => {
            if (!isDragging) return;
            panel.style.left = (initialLeft + e.clientX - startX) + "px";
            panel.style.top = (initialTop + e.clientY - startY) + "px";
        };
        document.onmouseup = () => isDragging = false;
    }

    // --- 🎨 테마 동기화 ---
    function syncSiteTheme() {
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const panel = document.getElementById("ctmPanel");
        const wrapper = document.getElementById("ctmWrapper");

        if (panel) panel.classList.toggle("ctm-light-theme", !isDark);
        if (wrapper) {
            Array.from(wrapper.children).forEach(child => {
                child.classList.toggle("ctm-light-theme", !isDark);
            });
        }
    }

    const CTM_NATIVE_FALLBACK_CLASS = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:fill-current min-w-7 border border-border bg-card text-line-gray-1 hover:bg-secondary p-0 size-7 justify-center';

    function ctmStripReactTracking(root) {
        if (!(root instanceof HTMLElement)) return;
        const clean = (el) => {
            ['data-state', 'aria-expanded', 'aria-controls', 'aria-haspopup', 'data-radix-collection-item'].forEach(name => el.removeAttribute(name));
            Array.from(el.attributes || []).forEach(attr => {
                if (/^data-radix/i.test(attr.name)) el.removeAttribute(attr.name);
            });
        };
        clean(root);
        root.querySelectorAll('*').forEach(el => clean(el));
    }

    function ctmIsNativeToolbarButton(btn) {
        if (!(btn instanceof HTMLButtonElement)) return false;
        if (btn.id === 'ctmFab' || btn.id === 'cwa-toolbar-btn' || btn.id === 'hlp-toolbar-btn' || btn.id === 'delete-mode-toggle-button') return false;
        if (btn.classList.contains('ctm-quick-btn')) return false;
        if (btn.closest('#ctmWrapper, #ctmPanel, [data-crack-native-toolbar-addon], [data-ctm-toolbar-button]')) return false;
        const cls = String(btn.getAttribute('class') || '');
        const label = String(btn.getAttribute('aria-label') || '');
        return cls.includes('rounded-full') && (cls.includes('size-7') || cls.includes('min-w-7') || label.includes('단축어'));
    }

    function ctmFindNativeBaseButton(toolbar) {
        if (!toolbar) return null;
        const buttons = Array.from(toolbar.querySelectorAll('button')).filter(ctmIsNativeToolbarButton);
        const iconButton = buttons.find(btn => btn.querySelector('svg'));
        const shortcut = toolbar.querySelector('button[aria-label="단축어 패널 열기"], button[aria-label*="단축어"]');
        return iconButton || (shortcut && ctmIsNativeToolbarButton(shortcut) ? shortcut : null) || buttons[0] || null;
    }

    function ctmPrepareNativeButton(btn, baseBtn) {
        if (!(btn instanceof HTMLButtonElement)) return;
        if (baseBtn instanceof HTMLButtonElement) btn.className = baseBtn.className;
        else btn.className = CTM_NATIVE_FALLBACK_CLASS;
        btn.removeAttribute('style');
        btn.type = 'button';
        btn.removeAttribute('disabled');
        ctmStripReactTracking(btn);
        btn.style.pointerEvents = 'auto';
    }

    function ctmCreateToolbarButton(baseBtn, options) {
        const btn = baseBtn ? baseBtn.cloneNode(true) : document.createElement('button');
        ctmPrepareNativeButton(btn, baseBtn);
        btn.id = options.id || '';
        btn.classList.add('ctm-native-toolbar-btn');
        btn.setAttribute('data-ctm-toolbar-button', options.kind || 'template');
        btn.title = options.title || '';
        btn.setAttribute('aria-label', options.ariaLabel || options.title || '템플릿');
        if (options.html !== undefined) btn.innerHTML = options.html;
        else btn.textContent = options.text || '';
        btn.onmousedown = (e) => { e.preventDefault(); e.stopPropagation(); };
        btn.onclick = options.onclick;
        return btn;
    }

    window.updateQuickButtons = function() {
        const wrapper = document.getElementById("ctmWrapper");
        if (!wrapper) return;

        const toolbar = wrapper.closest('.flex.items-center.space-x-2');
        const baseBtn = ctmFindNativeBaseButton(toolbar);
        wrapper.innerHTML = "";

        const mainFab = ctmCreateToolbarButton(baseBtn, {
            id: 'ctmFab',
            kind: 'template-main',
            title: '템플릿 매니저 열기',
            ariaLabel: '템플릿 매니저 열기',
            html: `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
            onclick: (e) => {
                e.preventDefault(); e.stopPropagation();
                const p = document.getElementById("ctmPanel");
                p.style.display = (p.style.display === "none" || !p.style.display) ? "flex" : "none";
                if (p.style.display === "flex") renderList();
            }
        });
        wrapper.appendChild(mainFab);

        const templates = getTemplates();
        templates.sort((a, b) => (a.isPinned === b.isPinned) ? b.id - a.id : (a.isPinned ? -1 : 1));

        templates.forEach(t => {
            if (t.quickIcon) {
                const btn = ctmCreateToolbarButton(baseBtn, {
                    id: '',
                    kind: 'template-quick',
                    title: t.title,
                    ariaLabel: `템플릿 삽입: ${t.title}`,
                    text: t.quickIcon,
                    onclick: (e) => {
                        e.preventDefault(); e.stopPropagation();
                        insertTextToChat(t.content);
                    }
                });
                btn.classList.add('ctm-quick-btn');
                wrapper.appendChild(btn);
            }
        });

        syncSiteTheme();
    };

    // --- 🖥️ UI 실행 및 감지 (가벼운 재주입 구조) ---
    // 기존 body 전체 상시 감시를 제거하고,
    // 부팅/방 이동 때만 짧게 찾은 뒤 입력창 영역만 제한적으로 감시한다.
    const CTM_BOOT_OBSERVER_MS = 6500;
    const CTM_RETRY_DELAY_MS = 220;
    const CTM_RETRY_MAX = 28;

    let ctmLastPathname = location.pathname;
    let ctmBootObserver = null;
    let ctmBootObserverTimer = 0;
    let ctmRetryTimer = 0;
    let ctmInjectTimer = 0;
    let ctmScopeObserver = null;
    let ctmObservedScope = null;

    function isChatRoomPath() {
        return /\/episodes\//.test(location.pathname);
    }

    function isToolbarRelatedMutation(mutations) {
        const wrapper = document.getElementById('ctmWrapper');
        if (wrapper && !wrapper.isConnected) return true;

        for (const mutation of mutations || []) {
            const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
            for (const node of nodes) {
                if (!(node instanceof Element)) continue;
                if (node.id === 'ctmWrapper' || node.querySelector?.('#ctmWrapper')) return true;
                if (node.matches?.('button, form, .flex.items-center.space-x-2, .flex.items-center.gap-2, [contenteditable="true"], textarea')) return true;
                if (node.querySelector?.('button, form, .flex.items-center.space-x-2, .flex.items-center.gap-2, [contenteditable="true"], textarea')) return true;
            }
        }
        return false;
    }

    function getSendButton() {
        const byLabel = Array.from(document.querySelectorAll('button[aria-label]'))
            .find(btn => /전송|보내기|send/i.test(btn.getAttribute('aria-label') || ''));
        if (byLabel) return byLabel;

        const sendPath = document.querySelector('path[d^="M18.77 11.13"]');
        return sendPath ? sendPath.closest('button') : null;
    }

    function findToolbarInfo(chatInput) {
        if (!chatInput) return null;

        const shortcutBtn = document.querySelector('button[aria-label*="단축어"]');
        if (shortcutBtn && shortcutBtn.parentElement && !shortcutBtn.closest('#ctmPanel')) {
            return { toolbar: shortcutBtn.parentElement, scope: shortcutBtn.closest('form') || shortcutBtn.parentElement.parentElement || shortcutBtn.parentElement };
        }

        const captureBtn = document.getElementById('capture-action-button');
        if (captureBtn && captureBtn.parentElement && !captureBtn.closest('#ctmPanel')) {
            return { toolbar: captureBtn.parentElement, scope: captureBtn.closest('form') || captureBtn.parentElement.parentElement || captureBtn.parentElement };
        }

        const sendBtn = getSendButton();
        if (sendBtn && sendBtn.parentElement && !sendBtn.closest('#ctmPanel')) {
            return { toolbar: sendBtn.parentElement, scope: sendBtn.closest('form') || sendBtn.parentElement.parentElement || sendBtn.parentElement };
        }

        let currentEl = chatInput;
        for (let i = 0; i < 10; i++) {
            if (!currentEl) break;
            const candidate = currentEl.querySelector('.flex.items-center.space-x-2') ||
                              currentEl.querySelector('.flex.items-center.gap-2') ||
                              currentEl.querySelector('[class*="items-center"]');
            if (candidate && !candidate.closest('#ctmPanel')) {
                return { toolbar: candidate, scope: currentEl };
            }
            currentEl = currentEl.parentElement;
        }

        return null;
    }

    function scheduleInjectUI(reason = 'schedule') {
        clearTimeout(ctmInjectTimer);
        ctmInjectTimer = setTimeout(() => {
            ctmInjectTimer = 0;
            injectUI();
        }, 120);
    }

    function watchComposerScope(scope) {
        if (!scope || !(scope instanceof Element)) return;
        if (ctmObservedScope === scope && ctmScopeObserver) return;

        if (ctmScopeObserver) ctmScopeObserver.disconnect();
        ctmObservedScope = scope;
        ctmScopeObserver = new MutationObserver((mutations) => {
            // 입력창 영역 안에서 전송 버튼/툴바가 재마운트될 때만 재주입한다.
            if (isToolbarRelatedMutation(mutations)) scheduleInjectUI('composer-scope');
        });
        ctmScopeObserver.observe(scope, { childList: true, subtree: true });
    }

    function stopBootObserver() {
        if (ctmBootObserver) {
            ctmBootObserver.disconnect();
            ctmBootObserver = null;
        }
        clearTimeout(ctmBootObserverTimer);
        ctmBootObserverTimer = 0;
    }

    function startBootObserver(reason = 'boot') {
        stopBootObserver();
        if (injectUI()) return;
        if (!document.body) return;

        ctmBootObserver = new MutationObserver((mutations) => {
            if (isToolbarRelatedMutation(mutations)) scheduleInjectUI('boot-observer');
        });
        ctmBootObserver.observe(document.body, { childList: true, subtree: true });
        ctmBootObserverTimer = setTimeout(stopBootObserver, CTM_BOOT_OBSERVER_MS);
    }

    function retryInjectUI(reason = 'retry', attempt = 0) {
        clearTimeout(ctmRetryTimer);
        if (injectUI()) {
            stopBootObserver();
            return;
        }
        if (attempt >= CTM_RETRY_MAX) return;
        ctmRetryTimer = setTimeout(() => retryInjectUI(reason, attempt + 1), CTM_RETRY_DELAY_MS);
    }

    function injectUI() {
        if (!document.getElementById("ctmPanel")) {
            const panel = document.createElement("div");
            panel.id = "ctmPanel";
            panel.innerHTML = `
                <div class="ctm-header" id="ctmHeader"><span>📜 대사 템플릿</span><span class="ctm-close" id="ctmClose">✕</span></div>
                <div class="ctm-body">
                    <div class="ctm-toolbar">
                        <input class="ctm-search-box" id="ctmSearch" placeholder="🔍 검색...">
                        <button class="ctm-icon-btn" id="ctmBackup" title="백업 (파일 저장)">💾</button>
                        <button class="ctm-icon-btn" id="ctmRestore" title="복구 (불러오기)">📂</button>
                    </div>
                    <div class="ctm-list" id="ctmList"></div>
                    <button class="ctm-add-main-btn" id="ctmOpenAdd">➕ 추가하기</button>
                </div>
                <div id="ctmModal"><div class="ctm-modal-content">
                    <input id="ctmModalTitle" placeholder="제목">
                    <input id="ctmModalIcon" placeholder="퀵 버튼 아이콘 (비우면 안 씀)" maxlength="5">
                    <textarea id="ctmModalContent" placeholder="대사 내용"></textarea>
                    <div class="ctm-modal-btns">
                        <button class="ctm-modal-btn ctm-btn-cancel" id="ctmModalCancel">취소</button>
                        <button class="ctm-modal-btn ctm-btn-save" id="ctmModalSave">저장</button>
                    </div>
                </div></div>
            `;
            document.body.appendChild(panel);
            document.getElementById("ctmClose").onclick = () => panel.style.display = "none";
            document.getElementById("ctmSearch").oninput = (e) => renderList(e.target.value);
            document.getElementById("ctmOpenAdd").onclick = () => openModal();
            document.getElementById("ctmModalCancel").onclick = closeModal;
            document.getElementById("ctmModalSave").onclick = saveTemplate;
            document.getElementById("ctmBackup").onclick = backupData;
            document.getElementById("ctmRestore").onclick = restoreData;
            enableDrag(document.getElementById("ctmHeader"), panel);
        }

        let wrapper = document.getElementById("ctmWrapper");

        if (!isChatRoomPath()) {
            if (wrapper) wrapper.style.display = 'none';
            syncSiteTheme();
            return true;
        }

        const chatInput = findChatInput();
        if (!chatInput) return false;

        const info = findToolbarInfo(chatInput);
        if (!info || !info.toolbar) return false;

        const toolbar = info.toolbar;
        if (!wrapper) {
            wrapper = document.createElement("div");
            wrapper.id = "ctmWrapper";
            wrapper.setAttribute("data-crack-native-toolbar-addon", "template");
            toolbar.prepend(wrapper);
            window.updateQuickButtons();
        } else {
            wrapper.style.display = 'flex';
            if (!toolbar.contains(wrapper)) toolbar.prepend(wrapper);
            if (wrapper.children.length === 0) window.updateQuickButtons();
        }

        watchComposerScope(info.scope || toolbar);
        syncSiteTheme();
        return true;
    }

    function onRouteMaybeChanged(reason = 'route') {
        const current = location.pathname;
        if (current !== ctmLastPathname) {
            ctmLastPathname = current;
            if (ctmScopeObserver) {
                ctmScopeObserver.disconnect();
                ctmScopeObserver = null;
                ctmObservedScope = null;
            }
            stopBootObserver();
            clearTimeout(ctmRetryTimer);
            setTimeout(() => {
                retryInjectUI(reason, 0);
                startBootObserver(reason);
            }, 120);
            return;
        }

        scheduleInjectUI(reason);
    }

    function installRouteWatcher() {
        if (window.__ctmLightRouteWatcher236) return;
        window.__ctmLightRouteWatcher236 = true;

        ['pushState', 'replaceState'].forEach(method => {
            const original = history[method];
            if (typeof original !== 'function') return;
            history[method] = function () {
                const result = original.apply(this, arguments);
                setTimeout(() => onRouteMaybeChanged(method), 0);
                return result;
            };
        });

        window.addEventListener('popstate', () => setTimeout(() => onRouteMaybeChanged('popstate'), 0), { passive: true });
        window.addEventListener('hashchange', () => setTimeout(() => onRouteMaybeChanged('hashchange'), 0), { passive: true });
        window.addEventListener('pageshow', () => onRouteMaybeChanged('pageshow'), { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) onRouteMaybeChanged('visible');
        }, { passive: true });
    }

    injectUI();
    installRouteWatcher();
    retryInjectUI('start', 0);
    startBootObserver('start');

    // 테마 감지는 attributes만 보므로 매우 가볍게 유지.
    const themeObserver = new MutationObserver(() => syncSiteTheme());
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
})();
