// ==UserScript==
// @name         🏆 Crack Ranking Cleaner (랭킹 클리너)
// @namespace    crack-ranking-cleaner
// @version      0.1.5
// @description  상세 페이지와 스토리 정보 창에서 사용자 랭킹 부분만 숨깁니다.
// @author       GPT
// @downloadURL  https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/RankingCleaner.user.js
// @updateURL    https://raw.githubusercontent.com/chyoyam-alt/userscripts-shared/main/scripts/RankingCleaner.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const HIDE_ATTR = 'data-crc-ranking-hidden';
  const DIVIDER_HIDE_ATTR = 'data-crc-ranking-divider-hidden';
  const STYLE_ID = 'crc-style';
  const SCAN_DELAY = 80;
  const IGNORE = '.wrtn-markdown,.wrtn-codeblock,[data-message-group-id],[data-testid="virtuoso-item-list"],[contenteditable="true"],textarea,script,style,noscript';
  const HEADINGS = 'h1,h2,h3,h4';
  const CONTROLS = 'button,[role="tab"]';
  const hiddenStyles = { display: 'none', visibility: 'hidden', 'pointer-events': 'none' };
  const originalStyles = new WeakMap();
  const sections = new Map();
  const dividerOwners = new Map();
  const pendingSections = new Set();
  const pendingRoots = new Set();
  let timer = 0;
  let style = null;
  let observer = null;
  let textObserver = null;

  const textOf = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const ignored = el => !!el?.closest(IGNORE);

  function injectStyle() {
    if (style?.isConnected) return;
    style = document.getElementById(STYLE_ID);
    if (style) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `section[${HIDE_ATTR}="1"],[${DIVIDER_HIDE_ATTR}="1"]{display:none!important;visibility:hidden!important;pointer-events:none!important}`;
    (document.head || document.documentElement).appendChild(style);
  }

  function markHidden(el, attr) {
    if (!originalStyles.has(el)) {
      originalStyles.set(el, Object.keys(hiddenStyles).map(key => [key, el.style.getPropertyValue(key), el.style.getPropertyPriority(key)]));
    }
    if (el.getAttribute(attr) !== '1') el.setAttribute(attr, '1');
    for (const [key, value] of Object.entries(hiddenStyles)) {
      if (el.style.getPropertyValue(key) !== value || el.style.getPropertyPriority(key) !== 'important') el.style.setProperty(key, value, 'important');
    }
  }

  function unmarkHidden(el, attr) {
    el.removeAttribute(attr);
    for (const [key, value, priority] of originalStyles.get(el) || []) {
      // Restore only properties still carrying our value; preserve later changes by other scripts.
      if (el.style.getPropertyValue(key) !== hiddenStyles[key] || el.style.getPropertyPriority(key) !== 'important') continue;
      if (value) el.style.setProperty(key, value, priority);
      else el.style.removeProperty(key);
    }
    originalStyles.delete(el);
  }

  function isHorizontalDivider(el) {
    return el instanceof HTMLElement && el.tagName === 'DIV'
      && el.getAttribute('data-orientation') === 'horizontal' && el.getAttribute('role') === 'none'
      && ['shrink-0', 'bg-border', 'w-full'].every(name => el.classList.contains(name));
  }

  function setDivider(section, state, divider) {
    if (state.divider !== divider) {
      const previous = state.divider;
      if (previous) {
        const owners = dividerOwners.get(previous);
        owners?.delete(section);
        if (!owners?.size) {
          dividerOwners.delete(previous);
          unmarkHidden(previous, DIVIDER_HIDE_ATTR);
        }
      }
      state.divider = divider;
      if (divider) {
        if (!dividerOwners.has(divider)) dividerOwners.set(divider, new Set());
        dividerOwners.get(divider).add(section);
      }
    }
    if (divider) markHidden(divider, DIVIDER_HIDE_ATTR);
  }

  function updateSection(section) {
    let state = sections.get(section);
    if (!section.isConnected || ignored(section)) {
      if (state) {
        setDivider(section, state, null);
        unmarkHidden(section, HIDE_ATTR);
        sections.delete(section);
      }
      return;
    }
    // A nested section must not make its unrelated outer section look like a ranking panel.
    const own = selector => [...section.querySelectorAll(selector)].filter(el => el.closest('section') === section && !ignored(el));
    const headings = own(HEADINGS);
    const hasTitle = headings.some(el => textOf(el) === '사용자 랭킹');
    if (!hasTitle && !state) return;
    const controls = own(CONTROLS);
    const hasTabs = ['주간', '일간', '누적'].every(label => controls.some(el => textOf(el) === label));
    if (!state) { state = { divider: null, textRoots: [] }; sections.set(section, state); }
    // Watch text-node edits only in these small headings/controls, never the chat document.
    state.textRoots = [...headings, ...controls];
    if (hasTitle && hasTabs) {
      markHidden(section, HIDE_ATTR);
      const next = section.nextElementSibling, prev = section.previousElementSibling;
      setDivider(section, state, isHorizontalDivider(next) ? next : isHorizontalDivider(prev) ? prev : null);
    } else {
      setDivider(section, state, null);
      unmarkHidden(section, HIDE_ATTR);
    }
  }

  function refreshTextWatch() {
    textObserver.disconnect();
    for (const state of sections.values()) for (const root of state.textRoots) {
      if (root.isConnected) textObserver.observe(root, { characterData: true, subtree: true });
    }
  }

  function collectSections(root) {
    if (!(root instanceof HTMLElement) || !root.isConnected || ignored(root)) return;
    if (root.tagName === 'SECTION') pendingSections.add(root);
    if (root.childElementCount) for (const section of root.querySelectorAll('section')) {
      if (!ignored(section)) pendingSections.add(section);
    }
  }

  function queueRoot(root) {
    if (!(root instanceof HTMLElement) || ignored(root)) return;
    if (root.tagName === 'SECTION') pendingSections.add(root);
    // Leaves cannot contain a section. Collapse overlapping additions before searching descendants.
    if (!root.childElementCount) return;
    for (const prior of pendingRoots) {
      if (prior.contains(root)) return;
      if (root.contains(prior)) pendingRoots.delete(prior);
    }
    pendingRoots.add(root);
  }

  function flush() {
    timer = 0;
    injectStyle();
    for (const root of pendingRoots) collectSections(root);
    pendingRoots.clear();
    for (const section of sections.keys()) if (!section.isConnected) pendingSections.add(section);
    for (const section of pendingSections) updateSection(section);
    pendingSections.clear();
    refreshTextWatch();
  }

  function schedule() {
    if (!timer) timer = window.setTimeout(flush, SCAN_DELAY);
  }

  function handleMutations(records) {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target || ignored(target)) continue;
      const section = target.closest('section');
      if (section) pendingSections.add(section);
      for (const node of record.addedNodes) queueRoot(node);
      // Keep the adjacent divider correct when the section, its parent, or its siblings change.
      if (record.addedNodes.length || record.removedNodes.length) for (const [known, state] of sections) {
        if (!known.isConnected || known.parentElement === target || state.divider && !state.divider.isConnected) pendingSections.add(known);
      }
    }
    if (pendingSections.size || pendingRoots.size || !style?.isConnected) schedule();
  }

  function blockRankingMoreEvent(event) {
    if (!(event.target instanceof Element) || ignored(event.target)) return;
    const button = event.target.closest('button');
    if (!button || textOf(button) !== '전체보기') return;
    const section = button.closest('section');
    if (!section) return;
    updateSection(section);
    if (section.getAttribute(HIDE_ATTR) !== '1') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    pendingSections.add(section);
    schedule();
  }

  function boot() {
    if (observer) return;
    injectStyle();
    textObserver = new MutationObserver(records => {
      for (const record of records) {
        const section = record.target.parentElement?.closest('section');
        if (section) pendingSections.add(section);
      }
      if (pendingSections.size) schedule();
    });
    observer = new MutationObserver(handleMutations);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    for (const event of ['pointerdown', 'mousedown', 'touchstart', 'click']) document.addEventListener(event, blockRankingMoreEvent, true);
    // One initial pass. SPA renders and late modal contents enter through the same changed-root queue.
    queueRoot(document.body || document.documentElement);
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    injectStyle();
  } else boot();
})();
