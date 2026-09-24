// ==UserScript==
// @name         🧹 Crack Edit Text Click Replacer (수정창 단어 청소기)
// @namespace    crack-edit-text-click-replacer
// @version      0.2.11
// @description  크랙 수정창에서 반복 단어를 자동 후보로 뽑아 클릭으로 삭제/치환하고, 미리보기 후 적용합니다.
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://gist.github.com/chyoyam-alt/7dc388369fb4bb7033501ac307070fee/raw/EditTextClickReplacer.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/7dc388369fb4bb7033501ac307070fee/raw/EditTextClickReplacer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'cerc-style';
  const PANEL_ID = 'cerc-panel';
  const TRIGGER_ATTR = 'data-cerc-trigger';
  const knownDoneButtons = new Set();
  const pendingDoneButtons = new Set();
  const EDITOR_HINT = '[contenteditable="true"].ProseMirror, [contenteditable="true"][data-history-hooked="true"]';
  const STORAGE_KEY = 'crack_edit_text_click_replacer_recent_terms_v1';
  const PREVIEW_TAB_KEY = 'crack_edit_text_click_replacer_preview_tab_v1';
  const MAX_CANDIDATES = 180;
  const MAX_PREVIEW_CHARS = 16000;

  let activeEditor = null;
  let lastEditor = null;
  let lastBeforeText = null;
  let injectScheduled = false;
  let syncScheduled = false;
  let editorInputHandler = null;
  let boundEditor = null;

  const state = {
    sourceText: '',
    candidates: [],
    rules: [],
    excludedMatches: new Map(),
    filter: '',
    status: '',
    previewTab: loadPreviewTab(),
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function makeId() {
    return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function uniqRules(rules) {
    const seen = new Set();
    return rules.filter((rule) => {
      const key = String(rule.target || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function loadRecentTerms() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 30) : [];
    } catch (_) {
      return [];
    }
  }

  function saveRecentTerms(terms) {
    try {
      const cleaned = Array.from(new Set((terms || []).map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 30);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch (_) {
      // ignore
    }
  }

  function loadPreviewTab() {
    try {
      const value = localStorage.getItem(PREVIEW_TAB_KEY);
      return value === 'after' ? 'after' : 'mark';
    } catch (_) {
      return 'mark';
    }
  }

  function savePreviewTab(tab) {
    try {
      localStorage.setItem(PREVIEW_TAB_KEY, tab === 'after' ? 'after' : 'mark');
    } catch (_) {
      // ignore
    }
  }

  function purgeLegacyRecentTerms() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // ignore
    }
  }

  function rememberTerm(term) {
    // v0.2.7부터 직접 추가/드래그 추가 단어는 저장하지 않는다.
    // 선택 항목은 현재 열린 정리창 안에서만 유지된다.
    void term;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .cerc-trigger-btn span { pointer-events: none !important; }

      #${PANEL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        background: rgba(0, 0, 0, 0.36);
      }

      #${PANEL_ID}[hidden] { display: none !important; }

      .cerc-modal {
        width: min(980px, calc(100vw - 24px));
        max-height: min(820px, calc(100vh - 24px));
        overflow: hidden;
        border: 1px solid rgba(127, 127, 127, 0.26);
        border-radius: 20px;
        background: color-mix(in srgb, var(--background, #101114) 94%, transparent);
        color: var(--text_primary, var(--foreground, #f4f4f5));
        box-shadow: 0 20px 72px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        font-family: inherit;
      }

      .cerc-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px 11px;
        border-bottom: 1px solid rgba(127, 127, 127, 0.18);
      }

      .cerc-title {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .cerc-title strong {
        font-size: 15px;
        line-height: 1.35;
      }

      .cerc-title small {
        font-size: 12px;
        line-height: 1.35;
        opacity: 0.72;
      }

      .cerc-close {
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        color: inherit;
        background: rgba(127, 127, 127, 0.16);
        font-size: 18px;
        line-height: 1;
      }

      .cerc-body {
        display: grid;
        grid-template-columns: minmax(240px, 0.85fr) minmax(290px, 1fr) minmax(320px, 1.25fr);
        gap: 12px;
        padding: 14px;
        overflow: auto;
        max-height: calc(min(820px, 100vh - 24px) - 58px);
      }

      .cerc-card {
        min-width: 0;
        border: 1px solid rgba(127, 127, 127, 0.18);
        border-radius: 16px;
        background: rgba(127, 127, 127, 0.09);
        overflow: hidden;
      }

      .cerc-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 11px 12px 8px;
        border-bottom: 1px solid rgba(127, 127, 127, 0.13);
      }

      .cerc-card-head strong {
        font-size: 13px;
        line-height: 1.35;
      }

      .cerc-card-head small {
        font-size: 11px;
        line-height: 1.35;
        opacity: 0.65;
      }

      .cerc-card-body {
        padding: 10px 12px 12px;
      }

      .cerc-input,
      .cerc-select,
      .cerc-textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(127, 127, 127, 0.24);
        border-radius: 12px;
        outline: none;
        color: inherit;
        background: rgba(0, 0, 0, 0.17);
        font: inherit;
        font-size: 12px;
      }

      /* 닫혀 있는 select 박스 디자인은 기존 톤을 유지하고,
         펼쳐지는 option 목록의 가시성만 보정한다. */
      .cerc-select option,
      .cerc-select optgroup {
        color: #f4f4f5 !important;
        background-color: #26272d !important;
      }

      .cerc-select option:checked {
        color: #ffffff !important;
        background-color: #3f63c7 !important;
      }

      .cerc-select option:disabled {
        color: #9ca3af !important;
        background-color: #26272d !important;
      }

      .cerc-input,
      .cerc-select {
        height: 36px;
        padding: 0 10px;
      }

      .cerc-textarea {
        min-height: clamp(240px, 34vh, 380px);
        resize: vertical;
        padding: 10px;
        line-height: 1.55;
        white-space: pre-wrap;
      }

      .cerc-input:focus,
      .cerc-select:focus,
      .cerc-textarea:focus {
        border-color: color-mix(in srgb, var(--ring, #8ab4ff) 62%, transparent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring, #8ab4ff) 18%, transparent);
      }

      .cerc-row {
        display: flex;
        align-items: center;
        gap: 7px;
      }

      .cerc-row + .cerc-row { margin-top: 8px; }

      .cerc-btn {
        flex: 0 0 auto;
        border: 1px solid rgba(127, 127, 127, 0.22);
        border-radius: 12px;
        padding: 9px 11px;
        cursor: pointer;
        color: inherit;
        background: rgba(127, 127, 127, 0.14);
        font: inherit;
        font-size: 12px;
        line-height: 1;
        white-space: nowrap;
      }

      .cerc-btn:hover { background: rgba(127, 127, 127, 0.23); }
      .cerc-btn:disabled { opacity: 0.45; cursor: not-allowed; }

      .cerc-primary {
        border-color: color-mix(in srgb, var(--brand, #7aa2ff) 50%, transparent);
        background: color-mix(in srgb, var(--brand, #7aa2ff) 25%, transparent);
      }

      .cerc-danger { background: rgba(255, 80, 80, 0.13); }
      .cerc-ghost { background: transparent; }

      .cerc-chip-list {
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 7px;
        max-height: 390px;
        overflow: auto;
        padding: 2px;
      }

      .cerc-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        border: 1px solid rgba(127, 127, 127, 0.22);
        border-radius: 999px;
        padding: 7px 9px;
        cursor: pointer;
        color: inherit;
        background: rgba(127, 127, 127, 0.12);
        font: inherit;
        font-size: 12px;
        line-height: 1;
      }

      .cerc-chip:hover { background: rgba(127, 127, 127, 0.22); }

      .cerc-chip[data-selected="true"] {
        border-color: color-mix(in srgb, var(--brand, #7aa2ff) 55%, transparent);
        background: color-mix(in srgb, var(--brand, #7aa2ff) 22%, transparent);
      }

      .cerc-chip-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cerc-chip-count {
        opacity: 0.68;
        font-size: 11px;
      }

      .cerc-rule-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 420px;
        overflow: auto;
      }

      .cerc-rule {
        border: 1px solid rgba(127, 127, 127, 0.18);
        border-radius: 14px;
        padding: 9px;
        background: rgba(0, 0, 0, 0.12);
      }

      .cerc-rule-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }

      .cerc-target {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 700;
      }

      .cerc-count {
        opacity: 0.7;
        font-size: 11px;
        white-space: nowrap;
      }

      .cerc-rule-grid {
        display: grid;
        grid-template-columns: minmax(86px, 1fr) minmax(112px, 1fr) 34px;
        gap: 7px;
        align-items: center;
      }

      .cerc-rule-grid .cerc-input {
        grid-column: 1 / 3;
      }

      .cerc-mini-btn {
        width: 34px;
        height: 36px;
        border: 1px solid rgba(127, 127, 127, 0.22);
        border-radius: 12px;
        cursor: pointer;
        color: inherit;
        background: rgba(127, 127, 127, 0.14);
        font: inherit;
        font-size: 14px;
        line-height: 1;
      }

      .cerc-preview-tabs {
        display: flex;
        gap: 6px;
      }

      .cerc-tab {
        border: 1px solid rgba(127, 127, 127, 0.18);
        border-radius: 999px;
        padding: 7px 9px;
        cursor: pointer;
        color: inherit;
        background: rgba(127, 127, 127, 0.10);
        font: inherit;
        font-size: 11px;
        line-height: 1;
      }

      .cerc-tab[data-active="true"] {
        background: color-mix(in srgb, var(--brand, #7aa2ff) 22%, transparent);
        border-color: color-mix(in srgb, var(--brand, #7aa2ff) 45%, transparent);
      }

      .cerc-highlight-box {
        height: clamp(240px, 34vh, 380px);
        overflow: auto;
        padding: 10px;
        border: 1px solid rgba(127, 127, 127, 0.18);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.15);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.6;
      }

      .cerc-mark {
        border: 0;
        border-radius: 5px;
        padding: 0 2px;
        background: color-mix(in srgb, #ffd166 50%, transparent);
        color: inherit;
        cursor: pointer;
        font: inherit;
        line-height: inherit;
        transition: background 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
      }

      .cerc-mark:hover {
        box-shadow: 0 0 0 2px color-mix(in srgb, #ffd166 42%, transparent);
      }

      .cerc-mark[data-excluded="true"] {
        background: rgba(127, 127, 127, 0.20);
        opacity: 0.62;
        text-decoration: line-through;
        text-decoration-thickness: 1px;
      }

      .cerc-mark[data-excluded="true"]:hover {
        box-shadow: 0 0 0 2px rgba(127, 127, 127, 0.28);
      }

      .cerc-preview-note {
        margin-top: 8px;
        min-height: 18px;
        text-align: right;
        font-size: 11px;
        line-height: 1.4;
        opacity: 0.72;
      }

      .cerc-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }

      .cerc-status {
        flex: 1 1 220px;
        min-height: 18px;
        font-size: 12px;
        line-height: 1.45;
        opacity: 0.82;
        text-align: left;
      }

      .cerc-empty {
        padding: 16px 10px;
        border: 1px dashed rgba(127, 127, 127, 0.28);
        border-radius: 14px;
        text-align: center;
        font-size: 12px;
        line-height: 1.55;
        opacity: 0.72;
      }

      .cerc-muted {
        opacity: 0.66;
        font-size: 11px;
        line-height: 1.45;
      }

      @media (max-width: 900px) {
        #${PANEL_ID} {
          align-items: center;
          padding: 8px;
        }

        .cerc-modal {
          width: 100%;
          max-height: calc(100vh - 16px);
          border-radius: 18px;
        }

        .cerc-body {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          max-height: calc(100vh - 78px);
          gap: 10px;
          padding: 10px;
        }

        .cerc-card:nth-child(3) {
          grid-column: 1 / -1;
        }

        .cerc-chip-list,
        .cerc-rule-list {
          max-height: 180px;
        }
      }

      @media (max-width: 640px) {
        #${PANEL_ID} {
          align-items: center;
          padding: 6px;
        }

        .cerc-modal {
          max-height: calc(100vh - 12px);
          border-radius: 16px;
        }

        .cerc-head {
          padding: 12px 14px 9px;
        }

        .cerc-title strong {
          font-size: 14px;
        }

        .cerc-title small {
          font-size: 11px;
        }

        .cerc-body {
          grid-template-columns: 1fr;
          max-height: calc(100vh - 70px);
          gap: 9px;
          padding: 9px;
        }

        .cerc-card-body {
          padding: 8px 10px 10px;
        }

        .cerc-chip-list {
          max-height: 126px;
        }

        .cerc-rule-list {
          max-height: 150px;
        }

        .cerc-rule-grid {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 34px;
        }

        .cerc-highlight-box {
          height: clamp(230px, 32vh, 310px);
        }

        .cerc-textarea {
          min-height: clamp(230px, 32vh, 310px);
        }

        .cerc-row {
          gap: 6px;
        }

        .cerc-btn {
          padding: 8px 9px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function getEditorText(editor) {
    return String(editor?.innerText ?? '').replace(/\n$/, '');
  }

  function buildPlainParagraphFragment(text) {
    const fragment = document.createDocumentFragment();
    const p = document.createElement('p');
    const lines = String(text ?? '').split('\n');

    if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
      p.appendChild(document.createElement('br'));
    } else {
      lines.forEach((line, index) => {
        if (index > 0) p.appendChild(document.createElement('br'));
        p.appendChild(document.createTextNode(line));
      });
    }

    fragment.appendChild(p);
    return fragment;
  }

  function notifyEditorChanged(editor, text) {
    const value = String(text ?? '');

    try {
      editor.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertFromPaste',
        data: value,
      }));
    } catch (_) {
      // 일부 브라우저는 beforeinput 생성자를 막을 수 있음.
    }

    try {
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertFromPaste',
        data: value,
      }));
    } catch (_) {
      editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }

    editor.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setEditorText(editor, text) {
    if (!(editor instanceof HTMLElement)) return false;

    const value = String(text ?? '');
    editor.focus();

    // execCommand('insertText')로 전체 텍스트를 밀어 넣으면
    // ProseMirror/Tiptap의 마크다운 입력 규칙이 ```INFO 같은 코드펜스를
    // 실제 code_block으로 자동 변환하면서 코드블록 내용이 세로로 깨지는 경우가 있다.
    // 그래서 전체 적용은 항상 DOM을 plain paragraph + <br> 구조로 재구성해서
    // 원래 수정창의 마크다운 텍스트 형태를 유지한다.
    try {
      editor.replaceChildren(buildPlainParagraphFragment(value));
    } catch (_) {
      editor.innerHTML = '';
      editor.appendChild(buildPlainParagraphFragment(value));
    }

    notifyEditorChanged(editor, value);
    return true;
  }

  function getSelectedPageText() {
    try {
      return String(window.getSelection?.().toString() || '').trim();
    } catch (_) {
      return '';
    }
  }

  function cleanForCandidateText(text) {
    return String(text || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/```[\s\S]*?```/g, (block) => block.replace(/[\w가-힣ㄱ-ㅎㅏ-ㅣ]+/g, ' '));
  }

  function getCandidateCountMap(text) {
    const source = cleanForCandidateText(text);
    const map = new Map();
    const tokenRe = /[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9_]{2,}/g;
    let match;

    while ((match = tokenRe.exec(source))) {
      const token = match[0].trim();
      if (!token) continue;
      if (/^\d+$/.test(token)) continue;
      if (/^[A-Za-z]{1,2}$/.test(token)) continue;
      if (/^[A-Za-z0-9_]{25,}$/.test(token)) continue;

      map.set(token, (map.get(token) || 0) + 1);
    }

    return map;
  }

  function extractCandidates(text) {
    const countMap = getCandidateCountMap(text);

    return Array.from(countMap.entries())
      .map(([textValue, count]) => ({ text: textValue, count, source: 'auto' }))
      .filter((item) => item.count >= 2)
      .sort((a, b) => (b.count - a.count) || (b.text.length - a.text.length) || a.text.localeCompare(b.text, 'ko'))
      .slice(0, MAX_CANDIDATES);
  }

  function countOccurrences(text, target) {
    const needle = String(target || '');
    if (!needle) return 0;
    const re = new RegExp(escapeRegExp(needle), 'g');
    let count = 0;
    String(text || '').replace(re, () => {
      count += 1;
      return '';
    });
    return count;
  }

  function getRuleSpaceMode(rule) {
    const value = String(rule?.spaceMode || '').trim();
    if (['exact', 'smart', 'left', 'right', 'both'].includes(value)) return value;
    return rule?.mode === 'delete' ? 'smart' : 'exact';
  }

  function makeRuleRegExp(rule) {
    const target = String(rule?.target || '');
    if (!target) return null;

    const word = escapeRegExp(target);
    const hSpace = '[ \t\u00A0　]';
    const spaceMode = getRuleSpaceMode(rule);

    if (spaceMode === 'smart' || spaceMode === 'both') return new RegExp(`(${hSpace}*)${word}(${hSpace}*)`, 'g');
    if (spaceMode === 'left') return new RegExp(`(${hSpace}+)${word}`, 'g');
    if (spaceMode === 'right') return new RegExp(`${word}(${hSpace}+)`, 'g');
    return new RegExp(word, 'g');
  }

  function getRuleReplacement(rule, replacement, captures) {
    const spaceMode = getRuleSpaceMode(rule);

    if (spaceMode === 'smart') {
      const left = String(captures?.[0] || '');
      const right = String(captures?.[1] || '');
      if (rule.mode === 'delete') return left && right ? ' ' : '';
      return `${left}${replacement}${right}`;
    }

    return replacement;
  }

  function getExcludedMatchSet(ruleId, create = false) {
    const id = String(ruleId || '');
    if (!id) return null;

    let set = state.excludedMatches.get(id);
    if (!set && create) {
      set = new Set();
      state.excludedMatches.set(id, set);
    }
    return set || null;
  }

  function isMatchExcluded(ruleId, matchIndex) {
    const set = getExcludedMatchSet(ruleId, false);
    return Boolean(set?.has(Number(matchIndex)));
  }

  function clearRuleExcludedMatches(ruleId) {
    state.excludedMatches.delete(String(ruleId || ''));
  }

  function clearAllExcludedMatches() {
    state.excludedMatches.clear();
  }

  function getRuleMatchStats(text, rule) {
    const re = makeRuleRegExp(rule);
    if (!re) return { total: 0, included: 0, excluded: 0 };

    let total = 0;
    let excluded = 0;
    String(text || '').replace(re, (match) => {
      if (!match) return match;
      if (isMatchExcluded(rule.id, total)) excluded += 1;
      total += 1;
      return match;
    });

    return { total, included: Math.max(0, total - excluded), excluded };
  }

  function getExcludedMatchCount(text, rules) {
    return uniqRules(rules).reduce((sum, rule) => sum + getRuleMatchStats(text, rule).excluded, 0);
  }

  function toggleExcludedMatch(ruleId, matchIndex) {
    const rule = findRule(ruleId);
    const index = Number(matchIndex);
    if (!rule || !Number.isInteger(index) || index < 0) return;

    const set = getExcludedMatchSet(rule.id, true);
    if (set.has(index)) {
      set.delete(index);
      if (!set.size) clearRuleExcludedMatches(rule.id);
      state.status = `“${rule.target}”의 이 위치를 다시 적용 대상에 넣었어.`;
    } else {
      set.add(index);
      state.status = `“${rule.target}”의 이 위치 1개만 적용에서 제외했어. 회색 표시를 다시 누르면 복구돼.`;
    }

    renderRules();
    renderPreview();
    renderStatus();
  }

  function applyRulesToText(text, rules) {
    let next = String(text ?? '');
    let total = 0;
    let skipped = 0;
    const details = [];

    for (const rule of uniqRules(rules)) {
      const target = String(rule.target || '');
      if (!target) continue;
      const replacement = rule.mode === 'replace' ? String(rule.replacement ?? '') : '';
      const re = makeRuleRegExp(rule);
      if (!re) continue;
      let count = 0;
      let skippedCount = 0;
      let matchIndex = 0;

      next = next.replace(re, (...args) => {
        const match = args[0];
        const captures = args.slice(1, -2);
        if (!match) return match;

        const currentIndex = matchIndex;
        matchIndex += 1;
        if (isMatchExcluded(rule.id, currentIndex)) {
          skippedCount += 1;
          return match;
        }

        count += 1;
        return getRuleReplacement(rule, replacement, captures);
      });

      if (count || skippedCount) {
        details.push({
          target,
          count,
          skipped: skippedCount,
          replacement,
          mode: rule.mode,
          spaceMode: getRuleSpaceMode(rule),
        });
      }
      total += count;
      skipped += skippedCount;
    }

    return { text: next, total, skipped, details };
  }

  function findEditorForButton(doneButton) {
    let node = doneButton?.parentElement;

    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      const editor = node.querySelector?.(
        '[contenteditable="true"][data-history-hooked="true"], .tiptap.ProseMirror[contenteditable="true"], [contenteditable="true"].ProseMirror'
      );

      if (editor instanceof HTMLElement) return editor;
    }

    return null;
  }

  function findDoneButtons(root = document) {
    const candidates = [];
    if (root instanceof HTMLButtonElement) candidates.push(root);
    root.querySelectorAll?.('button').forEach(button => candidates.push(button));
    return candidates.filter(button => {
      if (!(button instanceof HTMLButtonElement) || button.hasAttribute(TRIGGER_ATTR)) return false;
      if (button.closest(`#${PANEL_ID}`)) return false;
      return (button.textContent || '').replace(/\s+/g, ' ').trim().includes('수정 완료');
    });
  }

  function queueDoneButtons(root) {
    if (!root) return;
    const el = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!el || el.closest?.(`#${PANEL_ID}, [${TRIGGER_ATTR}]`)) return;
    for (const button of findDoneButtons(el)) {
      knownDoneButtons.add(button);
      pendingDoneButtons.add(button);
    }
    if (pendingDoneButtons.size) scheduleInject();
  }

  function handleCleanerMutations(records) {
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (target?.closest?.(`#${PANEL_ID}, [${TRIGGER_ATTR}]`)) continue;
      const added = Array.from(record.addedNodes);
      if (!record.removedNodes.length && added.length && added.every(node =>
          node instanceof Element && node.matches(`[${TRIGGER_ATTR}]`))) continue;
      const button = target?.closest?.('button');
      if (button) queueDoneButtons(button);
      for (const known of knownDoneButtons) {
        if (!known.isConnected) { knownDoneButtons.delete(known); pendingDoneButtons.delete(known); }
        else if (known.parentElement === target) pendingDoneButtons.add(known);
      }
      for (const node of added) {
        if (!(node instanceof Element)) continue;
        queueDoneButtons(node);
        // The editor can be mounted after its footer; retry already discovered buttons.
        if (node.matches(EDITOR_HINT) || node.querySelector(EDITOR_HINT)) {
          for (const known of knownDoneButtons) if (known.isConnected) pendingDoneButtons.add(known);
        }
      }
    }
    if (pendingDoneButtons.size) scheduleInject();
  }

  function makeTriggerButton(doneButton) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(TRIGGER_ATTR, 'true');
    button.className = `${doneButton.className || ''} cerc-trigger-btn`.trim();
    button.title = '수정창 텍스트를 보고 클릭으로 치환/삭제';
    button.innerHTML = `
      <span aria-hidden="true" style="font-size:15px;line-height:1;">🧹</span>
      <span class="typo-text-sm_leading-none_medium text-text_secondary">단어 정리</span>
    `;

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const editor = findEditorForButton(doneButton);
      if (!editor) {
        openPanel(null, '수정창을 못 찾았어. 수정창이 열린 상태에서 다시 눌러줘.');
        return;
      }

      openPanel(editor);
    }, true);

    return button;
  }

  function injectButtons() {
    injectScheduled = false;
    ensureStyle();

    const buttons = Array.from(pendingDoneButtons);
    pendingDoneButtons.clear();
    for (const doneButton of buttons) {
      if (!doneButton.isConnected || !findDoneButtons(doneButton).includes(doneButton)) continue;
      const row = doneButton.parentElement;
      if (!row) continue;
      if (row.querySelector(`[${TRIGGER_ATTR}="true"]`)) continue;

      const editor = findEditorForButton(doneButton);
      if (!editor) continue;

      const trigger = makeTriggerButton(doneButton);
      row.insertBefore(trigger, doneButton);
    }
  }

  function scheduleInject() {
    if (injectScheduled) return;
    injectScheduled = true;
    requestAnimationFrame(injectButtons);
  }

  function openPanel(editor, initialStatus = '') {
    ensureStyle();
    activeEditor = editor || activeEditor;
    bindEditorInput(activeEditor);

    state.sourceText = activeEditor ? getEditorText(activeEditor) : '';
    state.candidates = extractCandidates(state.sourceText);
    clearAllExcludedMatches();
    state.filter = '';
    state.status = initialStatus || '후보를 누르면 삭제 대상으로 들어가. 치환하려면 선택 목록에서 모드를 바꾸면 돼.';

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML = getPanelHtml();
      document.body.appendChild(panel);
      bindPanelEvents(panel);
    }

    panel.hidden = false;
    renderPanel();
  }

  function resetPanelSession() {
    state.rules = [];
    clearAllExcludedMatches();
    state.filter = '';
    state.status = '';
  }
  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.hidden = true;
    resetPanelSession();
  }

  function getPanelHtml() {
    return `
      <div class="cerc-modal" role="dialog" aria-modal="true" aria-label="단어 정리">
        <div class="cerc-head">
          <div class="cerc-title">
            <strong>🧹 수정창 클릭 정리기</strong>
            <small>자동 후보 클릭 → 삭제/치환 선택 → 미리보기 확인 → 적용</small>
          </div>
          <button type="button" class="cerc-close" aria-label="닫기">×</button>
        </div>
        <div class="cerc-body">
          <section class="cerc-card">
            <div class="cerc-card-head">
              <strong>자동 후보</strong>
              <small data-role="candidate-count"></small>
            </div>
            <div class="cerc-card-body">
              <div class="cerc-row">
                <input class="cerc-input" data-role="filter" placeholder="후보 검색" autocomplete="off">
              </div>
              <div class="cerc-row">
                <input class="cerc-input" data-role="direct" placeholder="직접 찾을 말 입력" autocomplete="off">
                <button type="button" class="cerc-btn" data-action="add-direct">추가</button>
              </div>
              <div class="cerc-row">
                <button type="button" class="cerc-btn cerc-ghost" data-action="add-selection">드래그한 글자 추가</button>
                <button type="button" class="cerc-btn cerc-ghost" data-action="refresh">새로고침</button>
              </div>
              <p class="cerc-muted">반복해서 나온 단어를 자동으로 보여줘. 누르면 선택 목록에 들어감. 삭제는 기본적으로 주변 공백을 자동 정리해.</p>
              <div class="cerc-chip-list" data-role="candidates"></div>
            </div>
          </section>

          <section class="cerc-card">
            <div class="cerc-card-head">
              <strong>선택한 단어</strong>
              <small data-role="rule-count"></small>
            </div>
            <div class="cerc-card-body">
              <div class="cerc-rule-list" data-role="rules"></div>
              <div class="cerc-footer">
                <button type="button" class="cerc-btn cerc-danger" data-action="clear-rules">선택 비우기</button>
                <button type="button" class="cerc-btn" data-action="undo">방금 적용 취소</button>
              </div>
            </div>
          </section>

          <section class="cerc-card">
            <div class="cerc-card-head">
              <strong>실시간 미리보기</strong>
              <div class="cerc-preview-tabs">
                <button type="button" class="cerc-tab" data-preview-tab="mark" data-active="true">위치 보기</button>
                <button type="button" class="cerc-tab" data-preview-tab="after">적용 후</button>
              </div>
            </div>
            <div class="cerc-card-body">
              <div class="cerc-highlight-box" data-role="mark-preview"></div>
              <textarea class="cerc-textarea" data-role="after-preview" readonly hidden></textarea>
              <div class="cerc-preview-note" data-role="preview-note"></div>
              <div class="cerc-footer">
                <div class="cerc-status" data-role="status"></div>
                <button type="button" class="cerc-btn" data-action="copy-after">미리보기 복사</button>
                <button type="button" class="cerc-btn cerc-primary" data-action="apply">수정창에 적용</button>
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function bindPanelEvents(panel) {
    panel.addEventListener('click', (event) => {
      const target = event.target;
      if (target === panel) {
        closePanel();
        return;
      }

      const close = target.closest?.('.cerc-close');
      if (close) {
        closePanel();
        return;
      }

      const chip = target.closest?.('.cerc-chip[data-term]');
      if (chip) {
        toggleRule(chip.dataset.term || '');
        return;
      }

      const previewMark = target.closest?.('.cerc-mark[data-rule-id][data-match-index]');
      if (previewMark) {
        toggleExcludedMatch(previewMark.dataset.ruleId || '', previewMark.dataset.matchIndex || '');
        return;
      }

      const remove = target.closest?.('[data-remove-rule]');
      if (remove) {
        removeRule(remove.dataset.removeRule || '');
        return;
      }

      const previewTab = target.closest?.('[data-preview-tab]');
      if (previewTab) {
        setPreviewTab(previewTab.dataset.previewTab || 'mark');
        return;
      }

      const actionButton = target.closest?.('[data-action]');
      if (!actionButton) return;

      const action = actionButton.dataset.action;
      if (action === 'add-direct') addDirectTerm();
      if (action === 'add-selection') addSelectionTerm();
      if (action === 'refresh') refreshFromEditor('수정창 내용을 다시 읽었어.');
      if (action === 'clear-rules') clearRules();
      if (action === 'undo') undoLastApply();
      if (action === 'apply') applyToActiveEditor();
      if (action === 'copy-after') copyAfterPreview();
    }, true);

    panel.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.matches('[data-role="filter"]')) {
        state.filter = target.value || '';
        renderCandidates();
        return;
      }

      if (target.matches('[data-rule-mode]')) {
        const rule = findRule(target.dataset.ruleMode || '');
        if (rule) {
          rule.mode = target.value === 'replace' ? 'replace' : 'delete';
          if (!rule.spaceMode) rule.spaceMode = rule.mode === 'delete' ? 'smart' : 'exact';
          clearRuleExcludedMatches(rule.id);
          state.status = '작업 방식을 바꿔서 이 단어의 개별 제외 기록을 초기화했어.';
          renderRules();
          renderPreview();
          renderStatus();
        }
        return;
      }

      if (target.matches('[data-rule-space]')) {
        const rule = findRule(target.dataset.ruleSpace || '');
        if (rule) {
          rule.spaceMode = ['exact', 'smart', 'left', 'right', 'both'].includes(target.value) ? target.value : 'exact';
          clearRuleExcludedMatches(rule.id);
          state.status = '공백 처리 범위를 바꿔서 이 단어의 개별 제외 기록을 초기화했어.';
          renderRules();
          renderPreview();
          renderStatus();
        }
        return;
      }

      if (target.matches('[data-rule-replacement]')) {
        const rule = findRule(target.dataset.ruleReplacement || '');
        if (rule) {
          rule.replacement = target.value || '';
          renderPreview();
        }
      }
    }, true);

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closePanel();
        return;
      }

      if (event.key === 'Enter' && event.target?.matches?.('[data-role="direct"]')) {
        event.preventDefault();
        addDirectTerm();
      }
    }, true);
  }

  function bindEditorInput(editor) {
    if (!(editor instanceof HTMLElement)) return;

    if (boundEditor && editorInputHandler) {
      boundEditor.removeEventListener('input', editorInputHandler, true);
    }

    editorInputHandler = () => scheduleEditorSync();
    boundEditor = editor;
    editor.addEventListener('input', editorInputHandler, true);
  }

  function scheduleEditorSync() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.hidden) return;
    if (syncScheduled) return;

    syncScheduled = true;
    setTimeout(() => {
      syncScheduled = false;
      refreshFromEditor('수정창 변경 감지됨. 미리보기를 갱신했어.');
    }, 120);
  }

  function refreshFromEditor(message) {
    if (activeEditor && document.contains(activeEditor)) {
      const nextSourceText = getEditorText(activeEditor);
      const sourceChanged = nextSourceText !== state.sourceText;
      state.sourceText = nextSourceText;
      state.candidates = extractCandidates(state.sourceText);

      if (sourceChanged && state.excludedMatches.size) {
        clearAllExcludedMatches();
        state.status = `${message || '수정창 내용을 다시 읽었어.'} 원문 위치가 바뀌어서 개별 제외 기록은 초기화했어.`;
      } else {
        state.status = message || state.status;
      }
      renderPanel();
    }
  }
  function addRule(term) {
    const target = String(term || '').trim();
    if (!target) return false;
    if (state.rules.some((rule) => rule.target === target)) return false;

    state.rules.push({
      id: makeId(),
      target,
      mode: 'delete',
      spaceMode: 'smart',
      replacement: '',
    });
    rememberTerm(target);
    state.status = `“${target}” 선택됨. 기본은 삭제, 치환하려면 가운데 옵션을 바꿔줘. 창을 닫으면 선택 목록은 초기화돼.`;
    renderPanel();
    return true;
  }

  function toggleRule(term) {
    const target = String(term || '').trim();
    if (!target) return;
    const found = state.rules.find((rule) => rule.target === target);
    if (found) removeRule(found.id);
    else addRule(target);
  }

  function findRule(id) {
    return state.rules.find((rule) => rule.id === id);
  }

  function removeRule(id) {
    const before = state.rules.length;
    state.rules = state.rules.filter((rule) => rule.id !== id);
    clearRuleExcludedMatches(id);
    if (state.rules.length !== before) state.status = '선택 목록에서 뺐어.';
    renderPanel();
  }
  function clearRules() {
    state.rules = [];
    clearAllExcludedMatches();
    state.status = '선택 목록을 비웠어.';
    renderPanel();
  }
  function addDirectTerm() {
    const panel = document.getElementById(PANEL_ID);
    const input = panel?.querySelector('[data-role="direct"]');
    const value = input?.value || '';

    if (!value.trim()) {
      state.status = '직접 추가할 단어를 입력해줘.';
      renderStatus();
      return;
    }

    addRule(value.trim());
    if (input) input.value = '';
  }

  function addSelectionTerm() {
    const selected = getSelectedPageText();
    if (!selected) {
      state.status = '먼저 수정창이나 페이지에서 글자를 드래그해줘.';
      renderStatus();
      return;
    }

    addRule(selected);
  }

  function undoLastApply() {
    if (!lastEditor || lastBeforeText === null || !document.contains(lastEditor)) {
      state.status = '되돌릴 적용 기록이 없어.';
      renderStatus();
      return;
    }

    setEditorText(lastEditor, lastBeforeText);
    activeEditor = lastEditor;
    refreshFromEditor('방금 적용 전 텍스트로 되돌렸어.');
  }

  function applyToActiveEditor() {
    if (!(activeEditor instanceof HTMLElement) || !document.contains(activeEditor)) {
      state.status = '수정창을 찾지 못했어. 창을 닫고 다시 “단어 정리”를 눌러줘.';
      renderStatus();
      return;
    }

    if (!state.rules.length) {
      state.status = '선택한 단어가 없어. 왼쪽 후보를 먼저 눌러줘.';
      renderStatus();
      return;
    }

    const before = getEditorText(activeEditor);
    const result = applyRulesToText(before, state.rules);

    if (!result.total || result.text === before) {
      state.status = '바뀐 내용이 없어. 선택 단어가 현재 수정창에 있는지 확인해줘.';
      renderStatus();
      return;
    }

    lastEditor = activeEditor;
    lastBeforeText = before;

    const ok = setEditorText(activeEditor, result.text);
    if (!ok) {
      state.status = '적용 실패. 수정창을 다시 열고 시도해줘.';
      renderStatus();
      return;
    }

    state.status = `${result.total}개 적용 완료. 저장하려면 크랙의 “수정 완료”를 눌러줘.`;
    refreshFromEditor(state.status);
  }

  function copyAfterPreview() {
    const result = applyRulesToText(state.sourceText, state.rules);
    const text = result.text;

    const fallback = () => {
      const panel = document.getElementById(PANEL_ID);
      const textarea = panel?.querySelector('[data-role="after-preview"]');
      if (textarea) {
        textarea.hidden = false;
        textarea.focus();
        textarea.select();
      }
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        state.status = '적용 후 미리보기를 복사했어.';
        renderStatus();
      }).catch(() => {
        state.status = '복사 권한이 막혀서 미리보기 칸을 선택해뒀어.';
        renderStatus();
        fallback();
      });
    } else {
      state.status = '복사 기능을 못 써서 미리보기 칸을 선택해뒀어.';
      renderStatus();
      fallback();
    }
  }

  function setPreviewTab(tab) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const normalized = tab === 'after' ? 'after' : 'mark';
    state.previewTab = normalized;
    savePreviewTab(normalized);

    const useAfter = normalized === 'after';
    panel.querySelectorAll('[data-preview-tab]').forEach((button) => {
      button.dataset.active = button.dataset.previewTab === normalized ? 'true' : 'false';
    });

    const mark = panel.querySelector('[data-role="mark-preview"]');
    const after = panel.querySelector('[data-role="after-preview"]');
    if (mark) mark.hidden = useAfter;
    if (after) after.hidden = !useAfter;
  }

  function renderPanel() {
    renderHeaderCounts();
    renderCandidates();
    renderRules();
    renderPreview();
    renderStatus();
    setPreviewTab(state.previewTab || 'mark');

    const panel = document.getElementById(PANEL_ID);
    const filter = panel?.querySelector('[data-role="filter"]');
    if (filter && filter.value !== state.filter) filter.value = state.filter;
  }

  function renderHeaderCounts() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const candidateCount = panel.querySelector('[data-role="candidate-count"]');
    const ruleCount = panel.querySelector('[data-role="rule-count"]');
    if (candidateCount) candidateCount.textContent = `${state.candidates.length}개`;
    if (ruleCount) ruleCount.textContent = `${state.rules.length}개 선택`;
  }

  function renderCandidates() {
    const panel = document.getElementById(PANEL_ID);
    const box = panel?.querySelector('[data-role="candidates"]');
    if (!box) return;

    const filter = String(state.filter || '').trim().toLowerCase();
    const selected = new Set(state.rules.map((rule) => rule.target));
    const shown = state.candidates
      .filter((item) => !filter || item.text.toLowerCase().includes(filter))
      .slice(0, MAX_CANDIDATES);

    if (!shown.length) {
      box.innerHTML = `<div class="cerc-empty">후보가 없어. 직접 찾을 말을 추가해줘.</div>`;
      return;
    }

    box.innerHTML = shown.map((item) => `
      <button type="button" class="cerc-chip" data-term="${escapeAttr(item.text)}" data-selected="${selected.has(item.text) ? 'true' : 'false'}" title="${escapeAttr(item.text)}">
        <span class="cerc-chip-text">${escapeHtml(item.text)}</span>
        <span class="cerc-chip-count">${item.count}</span>
      </button>
    `).join('');
  }

  function renderRules() {
    const panel = document.getElementById(PANEL_ID);
    const box = panel?.querySelector('[data-role="rules"]');
    if (!box) return;

    if (!state.rules.length) {
      box.innerHTML = `<div class="cerc-empty">왼쪽 후보를 누르면 여기에 들어와.<br>기본은 삭제, 필요하면 치환으로 변경.</div>`;
      return;
    }

    box.innerHTML = state.rules.map((rule) => {
      const stats = getRuleMatchStats(state.sourceText, rule);
      const countText = stats.excluded
        ? `적용 ${stats.included}개 · 제외 ${stats.excluded}개`
        : `현재 ${stats.total}개`;
      const disabled = rule.mode === 'delete' ? 'disabled' : '';
      return `
        <div class="cerc-rule" data-rule-id="${escapeAttr(rule.id)}">
          <div class="cerc-rule-top">
            <div class="cerc-target" title="${escapeAttr(rule.target)}">${escapeHtml(rule.target)}</div>
            <div class="cerc-count">${countText}</div>
          </div>
          <div class="cerc-rule-grid">
            <select class="cerc-select" data-rule-mode="${escapeAttr(rule.id)}" title="작업">
              <option value="delete" ${rule.mode === 'delete' ? 'selected' : ''}>삭제</option>
              <option value="replace" ${rule.mode === 'replace' ? 'selected' : ''}>치환</option>
            </select>
            <select class="cerc-select" data-rule-space="${escapeAttr(rule.id)}" title="공백 처리">
              <option value="smart" ${getRuleSpaceMode(rule) === 'smart' ? 'selected' : ''}>공백 자동</option>
              <option value="exact" ${getRuleSpaceMode(rule) === 'exact' ? 'selected' : ''}>단어만</option>
              <option value="left" ${getRuleSpaceMode(rule) === 'left' ? 'selected' : ''}>앞공백</option>
              <option value="right" ${getRuleSpaceMode(rule) === 'right' ? 'selected' : ''}>뒤공백</option>
              <option value="both" ${getRuleSpaceMode(rule) === 'both' ? 'selected' : ''}>양쪽공백</option>
            </select>
            <input class="cerc-input" data-rule-replacement="${escapeAttr(rule.id)}" value="${escapeAttr(rule.replacement || '')}" placeholder="바꿀 말" ${disabled}>
            <button type="button" class="cerc-mini-btn" data-remove-rule="${escapeAttr(rule.id)}" title="빼기">×</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPreview() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const markPreview = panel.querySelector('[data-role="mark-preview"]');
    const afterPreview = panel.querySelector('[data-role="after-preview"]');
    const note = panel.querySelector('[data-role="preview-note"]');

    const result = applyRulesToText(state.sourceText, state.rules);
    const excludedCount = getExcludedMatchCount(state.sourceText, state.rules);
    const clippedSource = clipText(state.sourceText, MAX_PREVIEW_CHARS);
    const clippedAfter = clipText(result.text, MAX_PREVIEW_CHARS);

    if (markPreview) markPreview.innerHTML = renderHighlighted(clippedSource.text, state.rules) + (clippedSource.clipped ? '\n\n…미리보기 길이 때문에 일부 생략됨' : '');
    if (afterPreview) afterPreview.value = clippedAfter.text + (clippedAfter.clipped ? '\n\n…미리보기 길이 때문에 일부 생략됨' : '');

    if (note) {
      if (!state.rules.length) note.textContent = '선택한 단어가 없어서 원문 그대로 보여줘.';
      else if (excludedCount) note.textContent = `예상 변경 ${result.total}개 · 개별 제외 ${excludedCount}개 · 적용 후 글자수 ${result.text.length.toLocaleString()}자`;
      else note.textContent = `노란 표시를 누르면 그 위치만 제외 · 예상 변경 ${result.total}개 · 적용 후 글자수 ${result.text.length.toLocaleString()}자`;
    }
  }
  function renderStatus() {
    const panel = document.getElementById(PANEL_ID);
    const status = panel?.querySelector('[data-role="status"]');
    if (status) status.textContent = state.status || '';
  }

  function clipText(text, max) {
    const value = String(text || '');
    if (value.length <= max) return { text: value, clipped: false };
    return { text: value.slice(0, max), clipped: true };
  }

  function renderHighlighted(text, rules) {
    const value = String(text || '');
    const ranges = [];

    uniqRules(rules).forEach((rule, ruleOrder) => {
      const re = makeRuleRegExp(rule);
      if (!re) return;

      let match;
      let matchIndex = 0;
      while ((match = re.exec(value))) {
        if (!match[0]) {
          re.lastIndex += 1;
          continue;
        }

        ranges.push({
          start: match.index,
          end: match.index + match[0].length,
          ruleId: rule.id,
          ruleOrder,
          matchIndex,
          excluded: isMatchExcluded(rule.id, matchIndex),
        });
        matchIndex += 1;
      }
    });

    if (!ranges.length) return escapeHtml(value);

    ranges.sort((a, b) => a.start - b.start || a.ruleOrder - b.ruleOrder || b.end - a.end);

    // 서로 겹치는 규칙은 HTML에서 동시에 표시할 수 없으므로,
    // 먼저 선택된 규칙의 개별 표시를 우선한다. 기존처럼 범위를 합치지는 않는다.
    const visibleRanges = [];
    let occupiedUntil = -1;
    for (const range of ranges) {
      if (range.start < occupiedUntil) continue;
      visibleRanges.push(range);
      occupiedUntil = range.end;
    }

    let html = '';
    let cursor = 0;
    for (const range of visibleRanges) {
      html += escapeHtml(value.slice(cursor, range.start));
      const excluded = range.excluded ? 'true' : 'false';
      const title = range.excluded
        ? '개별 제외됨 · 클릭하면 다시 적용'
        : '클릭하면 이 위치만 적용에서 제외';
      html += `<mark class="cerc-mark" data-rule-id="${escapeAttr(range.ruleId)}" data-match-index="${range.matchIndex}" data-excluded="${excluded}" title="${title}">${escapeHtml(value.slice(range.start, range.end))}</mark>`;
      cursor = range.end;
    }
    html += escapeHtml(value.slice(cursor));
    return html;
  }
  function boot() {
    purgeLegacyRecentTerms();
    ensureStyle();
    queueDoneButtons(document);

    const observer = new MutationObserver(handleCleanerMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('focusin', event => {
      const editor = event.target?.closest?.(EDITOR_HINT);
      if (!editor) return;
      queueDoneButtons(editor.closest('[data-message-group-id], [role="dialog"]') || editor.parentElement);
      for (const known of knownDoneButtons) if (known.isConnected) pendingDoneButtons.add(known);
      if (pendingDoneButtons.size) scheduleInject();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
