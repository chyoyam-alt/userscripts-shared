// ==UserScript==
// @name         ↗️ Crack Composer Expander (채팅창 펼치기)
// @namespace    crack-composer-resizer
// @version      1.5.0
// @downloadURL  https://gist.github.com/chyoyam-alt/4965cf5e74f2931d26519a93daa5c30a/raw/ComposerExpander.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/4965cf5e74f2931d26519a93daa5c30a/raw/ComposerExpander.user.js
// @description  PC 크랙 채팅 입력창에 내용이 넘칠 때 ↗ 전체 펼치기와 ↙ 원래 크기 복원을 제공하며 라디오존데 v3.9.7과 즉시 동기화됩니다.
// @match        *://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__CRACK_COMPOSER_RESIZER_V1__) return;
  window.__CRACK_COMPOSER_RESIZER_V1__ = true;

  const APP = Object.freeze({
    version: '1.5.0',
    minViewportWidth: 768,
    maxViewportRatio: 0.82,
    overflowSlack: 3,
    syncDelay: 90,
    watchdogDelay: 1200,
  });

  const ID = Object.freeze({
    style: 'ccr-style',
    layer: 'ccr-controls-layer',
    toggle: 'ccr-expand-toggle',
  });

  const OWN_SELECTOR = `#${ID.layer}, #${ID.toggle}`;
  const STYLE_PROPS = ['height', 'max-height', 'overflow-y'];
  const RADIOSONDE_STYLE_PROPS = ['position', 'top', 'left', 'right', 'width', 'max-width', 'z-index'];
  const TOGGLE_ICONS = Object.freeze({
    collapsed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 16 16 8M10 8h6v6"/></svg>',
    expanded: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 8-8 8M14 16H8v-6"/></svg>',
  });

  const state = {
    input: null,
    target: null,
    host: null,
    toggle: null,
    expanded: false,
    originalStyles: null,
    collapsedHeight: 0,
    originalScrollTop: 0,
    hadContent: false,
    radiosondeHost: null,
    radiosondePopup: null,
    radiosondeStyles: null,
    radiosondeRestoreTimer: 0,
    radiosondeObserver: null,
    radiosondeRepairRaf: 0,
    radiosondeSyncRaf: 0,
    resizeObserver: null,
    contentObserver: null,
    documentObserver: null,
    syncTimer: 0,
    syncRaf: 0,
    animationRaf: 0,
    restoreTimer: 0,
    routeKey: location.href,
  };

  function isChatRoomPath() {
    return /\/stories\/[^/]+\/episodes\/[^/?#]+/.test(location.pathname);
  }

  function isPcLike() {
    if (window.innerWidth < APP.minViewportWidth) return false;
    try {
      return matchMedia('(pointer: fine)').matches || matchMedia('(hover: hover)').matches;
    } catch (_) {
      return true;
    }
  }

  function isVisibleElement(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element.closest(OWN_SELECTOR)) return false;
    if (element.closest('[role="dialog"], [aria-modal="true"], [data-radix-dialog-content]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 160 || rect.height < 18) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function hasMessagePlaceholder(element) {
    const values = [
      element?.getAttribute?.('placeholder'),
      element?.getAttribute?.('data-placeholder'),
      element?.getAttribute?.('aria-label'),
    ];
    return values.some((value) => /메시지|message/i.test(String(value || '')));
  }

  function isLikelyChatInput(element) {
    if (!isVisibleElement(element) || !element.closest('main')) return false;
    if (element.classList.contains('__chat_input_textarea')) return true;
    if (element.matches('textarea') && hasMessagePlaceholder(element)) return true;
    if (element.matches('[contenteditable="true"]') && (
      element.classList.contains('ProseMirror') ||
      element.classList.contains('tiptap') ||
      hasMessagePlaceholder(element)
    )) return true;
    return false;
  }

  function findChatInput() {
    const selectors = [
      'main .__chat_input_textarea',
      'main div.ProseMirror[contenteditable="true"]',
      'main div.tiptap[contenteditable="true"]',
      'main [contenteditable="true"][data-placeholder*="메시지"]',
      'main [contenteditable="true"][data-placeholder*="message" i]',
      'main textarea[placeholder*="메시지"]',
      'main textarea[placeholder*="message" i]',
      'main p[data-placeholder*="메시지"]',
      'main p[data-placeholder*="message" i]',
    ];

    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        const element = candidate.matches?.('p[data-placeholder]')
          ? candidate.closest('[contenteditable="true"]')
          : candidate;
        if (isLikelyChatInput(element)) return element;
      }
    }
    return null;
  }

  function findComposerShell(input) {
    if (!(input instanceof HTMLElement)) return null;
    return input.closest('[data-cmu-theme-input-box], [data-sgb-input-box]')
      || input.closest('div.flex.w-full.flex-col.rounded-lg.border')
      || input.closest('div[class*="rounded-lg"][class*="border"]')
      || input.closest('div[class*="rounded"][class*="border"]')
      || input.closest('form')
      || input.parentElement;
  }

  function elementOverflows(element) {
    if (!(element instanceof HTMLElement)) return false;
    return Number(element.scrollHeight || 0) > Number(element.clientHeight || 0) + APP.overflowSlack;
  }

  function hasExpandableContent(input) {
    if (!(input instanceof HTMLElement)) return false;
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      return String(input.value || '').replace(/\u200b/g, '').trim().length > 0;
    }
    const text = String(input.innerText || input.textContent || '')
      .replace(/\u200b/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
    if (text.length > 0) return true;
    return input.querySelectorAll(':scope > p, :scope > div').length > 1;
  }

  function findResizeTarget(input) {
    if (!(input instanceof HTMLElement)) return null;
    const shell = findComposerShell(input);
    let current = input;
    for (let depth = 0; current && current !== shell && depth < 7; depth += 1, current = current.parentElement) {
      if (elementOverflows(current)) return current;
    }
    return input;
  }

  function findUiHost(input) {
    if (!(input instanceof HTMLElement)) return null;
    const inputRect = input.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const maxReasonableWidth = Math.min(
      viewportWidth * 0.9,
      Math.max(inputRect.width * 1.5, inputRect.width + 220),
    );
    let fallback = null;
    let current = input.parentElement;

    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      if (current === document.body || current === document.documentElement || current.matches?.('main')) break;
      const rect = current.getBoundingClientRect();
      if (rect.width < Math.max(160, inputRect.width - 4) || rect.width > maxReasonableWidth) continue;
      if (rect.height < 28) continue;
      if (!fallback) fallback = current;

      const style = getComputedStyle(current);
      const classText = String(current.className || '');
      const marked = current.hasAttribute('data-cmu-theme-input-box')
        || current.hasAttribute('data-sgb-input-box')
        || /rounded|border|composer|input/i.test(classText)
        || parseFloat(style.borderTopWidth || '0') > 0
        || parseFloat(style.borderRadius || '0') > 0;
      if (marked) return current;
    }

    return fallback || input.parentElement;
  }

  function snapshotStyles(target) {
    const snapshot = {};
    for (const property of STYLE_PROPS) {
      snapshot[property] = {
        value: target.style.getPropertyValue(property),
        priority: target.style.getPropertyPriority(property),
      };
    }
    return snapshot;
  }

  function restoreStyles(target, snapshot) {
    if (!(target instanceof HTMLElement) || !snapshot) return;
    for (const property of STYLE_PROPS) {
      const saved = snapshot[property];
      if (saved?.value) target.style.setProperty(property, saved.value, saved.priority || '');
      else target.style.removeProperty(property);
    }
    target.removeAttribute('data-ccr-expanded');
    target.removeAttribute('data-ccr-animating');
  }

  function setImportantStyle(target, property, value) {
    if (!(target instanceof HTMLElement)) return;
    if (target.style.getPropertyValue(property) === value && target.style.getPropertyPriority(property) === 'important') return;
    target.style.setProperty(property, value, 'important');
  }

  function currentHeight(target = state.target) {
    if (!(target instanceof HTMLElement)) return 1;
    return Math.max(1, Math.round(target.getBoundingClientRect().height || target.clientHeight || 1));
  }

  function maximumHeight() {
    const viewportHeight = Math.max(1, Number(window.visualViewport?.height) || Number(window.innerHeight) || 800);
    return Math.max(160, Math.floor(viewportHeight * APP.maxViewportRatio));
  }

  function cancelAnimation() {
    if (state.animationRaf) cancelAnimationFrame(state.animationRaf);
    if (state.restoreTimer) clearTimeout(state.restoreTimer);
    state.animationRaf = 0;
    state.restoreTimer = 0;
  }

  function snapshotPropertyStyles(target, properties) {
    const snapshot = {};
    for (const property of properties) {
      snapshot[property] = {
        value: target.style.getPropertyValue(property),
        priority: target.style.getPropertyPriority(property),
      };
    }
    return snapshot;
  }

  function restorePropertyStyles(target, snapshot, properties) {
    if (!(target instanceof HTMLElement) || !snapshot) return;
    for (const property of properties) {
      const saved = snapshot[property];
      if (saved?.value) target.style.setProperty(property, saved.value, saved.priority || '');
      else target.style.removeProperty(property);
    }
  }

  function isSafeRadiosondeHost(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    if (element === document.body || element === document.documentElement) return false;
    const visualHost = state.host;
    if (!(visualHost instanceof HTMLElement) || !visualHost.isConnected) return false;

    const rect = element.getBoundingClientRect();
    const hostRect = visualHost.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const maxWidth = Math.min(viewportWidth * 0.9, Math.max(hostRect.width * 1.45, hostRect.width + 180));
    return rect.width >= 180 && rect.width <= maxWidth && rect.height >= 28;
  }

  function isStableRadiosondePopup(popup = document.getElementById('igx-live-popup')) {
    return popup instanceof HTMLElement && popup.dataset.igxStableInlineHost === '1';
  }

  function scheduleRadiosondeLayoutSync() {
    if (state.radiosondeSyncRaf) return;
    state.radiosondeSyncRaf = requestAnimationFrame(() => {
      state.radiosondeSyncRaf = 0;
      if (!isStableRadiosondePopup()) return;
      try { document.dispatchEvent(new CustomEvent('ccr:composer-layout')); } catch (_) {}
    });
  }

  function restoreRadiosondePin() {
    if (state.radiosondeRestoreTimer) clearTimeout(state.radiosondeRestoreTimer);
    if (state.radiosondeRepairRaf) cancelAnimationFrame(state.radiosondeRepairRaf);
    try { state.radiosondeObserver?.disconnect?.(); } catch (_) {}
    state.radiosondeRestoreTimer = 0;
    state.radiosondeRepairRaf = 0;
    state.radiosondeObserver = null;
    const popup = state.radiosondePopup;
    if (popup instanceof HTMLElement) {
      restorePropertyStyles(popup, state.radiosondeStyles, RADIOSONDE_STYLE_PROPS);
      popup.removeAttribute('data-ccr-radiosonde-pinned');
    }
    state.radiosondePopup = null;
    state.radiosondeStyles = null;
    state.radiosondeHost = null;
  }

  function ensureRadiosondeObserver(popup) {
    if (!(popup instanceof HTMLElement) || state.radiosondeObserver) return;
    state.radiosondeObserver = new MutationObserver(() => {
      if (!state.expanded) return;
      if (state.radiosondePopup !== popup || !popup.isConnected) return;
      if (popup.parentElement === document.documentElement) return;
      if (state.radiosondeRepairRaf) return;
      state.radiosondeRepairRaf = requestAnimationFrame(() => {
        state.radiosondeRepairRaf = 0;
        if (state.expanded && popup.isConnected) stabilizeRadiosondeHost();
      });
    });
    try {
      state.radiosondeObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {
      state.radiosondeObserver = null;
    }
  }

  function scheduleRadiosondeRestore() {
    if (isStableRadiosondePopup()) {
      if (state.radiosondePopup) restoreRadiosondePin();
      scheduleRadiosondeLayoutSync();
      return;
    }
    if (state.radiosondeRestoreTimer) clearTimeout(state.radiosondeRestoreTimer);
    if (!(state.radiosondePopup instanceof HTMLElement)) return;
    state.radiosondeRestoreTimer = setTimeout(() => {
      state.radiosondeRestoreTimer = 0;
      if (state.expanded) return;
      // 원본 라존데의 1.8초 재탐색이 올바른 좁은 부모로 돌아온 뒤에만 고정을 푼다.
      // 아직 넓은 form에 남아 있으면 한 주기 더 기다려 전체 폭 번쩍임을 막는다.
      if (!isSafeRadiosondeHost(state.radiosondePopup?.parentElement)) {
        scheduleRadiosondeRestore();
        return;
      }
      restoreRadiosondePin();
    }, 2100);
  }

  function captureRadiosondeHost() {
    if (state.radiosondeRestoreTimer) clearTimeout(state.radiosondeRestoreTimer);
    state.radiosondeRestoreTimer = 0;
    const popup = document.getElementById('igx-live-popup');
    if (!(popup instanceof HTMLElement) || !popup.classList.contains('inline')) {
      restoreRadiosondePin();
      return;
    }

    if (state.radiosondePopup !== popup) {
      restoreRadiosondePin();
      state.radiosondePopup = popup;
      state.radiosondeStyles = snapshotPropertyStyles(popup, RADIOSONDE_STYLE_PROPS);
    }
    ensureRadiosondeObserver(popup);

    // 세로 위치는 확장 전 라존데가 원래 붙어 있던 부모를 기억한다.
    // 좌우 폭은 아래 stabilizeRadiosondeHost()에서 실제 입력 박스를 따로 사용한다.
    if (!isSafeRadiosondeHost(state.radiosondeHost)) {
      const current = popup.parentElement;
      state.radiosondeHost = isSafeRadiosondeHost(current) ? current : state.host;
    }
  }

  function stabilizeRadiosondeHost() {
    if (isStableRadiosondePopup()) {
      if (state.radiosondePopup) restoreRadiosondePin();
      scheduleRadiosondeLayoutSync();
      return;
    }
    if (!state.expanded) {
      scheduleRadiosondeRestore();
      return;
    }
    captureRadiosondeHost();
    const popup = state.radiosondePopup;
    const host = state.radiosondeHost;
    if (!(popup instanceof HTMLElement) || !(host instanceof HTMLElement) || !host.isConnected) return;

    const anchorRect = host.getBoundingClientRect();
    const visualHost = state.host instanceof HTMLElement && state.host.isConnected ? state.host : host;
    const visualRect = visualHost.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const left = Math.max(0, Math.min(visualRect.left, viewportWidth - 180));
    const width = Math.max(180, Math.min(visualRect.width, viewportWidth - left));
    // 라존데 원본은 입력창이 55vh를 넘으면 transform이 걸린 바깥 form으로 popup을 옮긴다.
    // 그 안에서는 fixed 좌표도 form 기준으로 밀리므로, 펼친 동안만 루트에 두어 뷰포트 좌표를 보장한다.
    if (popup.parentElement !== document.documentElement) document.documentElement.appendChild(popup);
    popup.setAttribute('data-ccr-radiosonde-pinned', '1');
    popup.style.setProperty('position', 'fixed', 'important');
    popup.style.setProperty('top', `${Math.round(anchorRect.top + 6)}px`, 'important');
    popup.style.setProperty('left', `${Math.round(left)}px`, 'important');
    popup.style.setProperty('right', 'auto', 'important');
    popup.style.setProperty('width', `${Math.round(width)}px`, 'important');
    popup.style.setProperty('max-width', `${Math.round(width)}px`, 'important');
    popup.style.setProperty('z-index', '80', 'important');
  }

  function finishRestore({ scrollToEnd = false } = {}) {
    const target = state.target;
    cancelAnimation();
    if (target instanceof HTMLElement) {
      restoreStyles(target, state.originalStyles);
      if (scrollToEnd && target.isConnected) {
        requestAnimationFrame(() => {
          if (!target.isConnected) return;
          target.scrollTop = Math.max(0, Number(target.scrollHeight || 0) - Number(target.clientHeight || 0));
        });
      }
    }
    state.originalStyles = null;
    state.collapsedHeight = 0;
    state.originalScrollTop = 0;
    scheduleRadiosondeRestore();
  }

  function setButtonState(visible, expanded = state.expanded) {
    const button = state.toggle;
    if (!(button instanceof HTMLButtonElement)) return;
    button.classList.toggle('ccr-expand-visible', Boolean(visible));
    button.tabIndex = visible ? 0 : -1;
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    const nextState = expanded ? 'expanded' : 'collapsed';
    if (button.dataset.state !== nextState) {
      button.dataset.state = nextState;
      button.innerHTML = TOGGLE_ICONS[nextState];
    }
    const label = expanded ? '입력창 원래 크기로 접기' : '입력창 내용 전체 펼치기';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  }

  function updateExpandedHeight() {
    const target = state.target;
    if (!state.expanded || !(target instanceof HTMLElement) || !target.isConnected) return;
    const contentHeight = Math.max(state.collapsedHeight, Math.ceil(Number(target.scrollHeight || 0)));
    const desiredHeight = Math.max(state.collapsedHeight, Math.min(contentHeight, maximumHeight()));
    setImportantStyle(target, 'height', `${desiredHeight}px`);
    setImportantStyle(target, 'max-height', `${desiredHeight}px`);
    setImportantStyle(target, 'overflow-y', 'auto');
    if (contentHeight <= desiredHeight + APP.overflowSlack) target.scrollTop = 0;
    positionControls();
    stabilizeRadiosondeHost();
  }

  function collapseInput({ immediate = false, scrollToEnd = true } = {}) {
    if (!state.expanded && !state.originalStyles) return;
    const target = state.target;
    state.expanded = false;
    setButtonState(true, false);

    if (!(target instanceof HTMLElement) || !target.isConnected || immediate) {
      finishRestore({ scrollToEnd: false });
      return;
    }

    cancelAnimation();
    const fromHeight = Math.max(state.collapsedHeight, currentHeight(target));
    target.setAttribute('data-ccr-animating', '1');
    setImportantStyle(target, 'height', `${fromHeight}px`);
    setImportantStyle(target, 'max-height', `${fromHeight}px`);
    void target.offsetHeight;
    state.animationRaf = requestAnimationFrame(() => {
      state.animationRaf = 0;
      if (!(target instanceof HTMLElement) || !target.isConnected) {
        finishRestore({ scrollToEnd: false });
        return;
      }
      const collapsedHeight = Math.max(1, state.collapsedHeight || target.clientHeight || 1);
      setImportantStyle(target, 'height', `${collapsedHeight}px`);
      setImportantStyle(target, 'max-height', `${collapsedHeight}px`);
      positionControls();
    });
    state.restoreTimer = setTimeout(() => {
      state.restoreTimer = 0;
      finishRestore({ scrollToEnd });
      scheduleSync(20);
    }, 220);
  }

  function expandInput() {
    const input = state.input;
    const target = state.target;
    if (state.expanded || !(input instanceof HTMLElement) || !(target instanceof HTMLElement)) return;
    if (!hasExpandableContent(input) || !elementOverflows(target)) return;

    finishRestore({ scrollToEnd: false });
    state.originalStyles = snapshotStyles(target);
    state.collapsedHeight = currentHeight(target);
    state.originalScrollTop = Math.max(0, Number(target.scrollTop) || 0);
    state.expanded = true;
    captureRadiosondeHost();

    target.setAttribute('data-ccr-expanded', '1');
    target.setAttribute('data-ccr-animating', '1');
    setImportantStyle(target, 'height', `${state.collapsedHeight}px`);
    setImportantStyle(target, 'max-height', `${state.collapsedHeight}px`);
    setImportantStyle(target, 'overflow-y', 'auto');
    void target.offsetHeight;
    state.animationRaf = requestAnimationFrame(() => {
      state.animationRaf = 0;
      updateExpandedHeight();
    });
    setButtonState(true, true);
  }

  function toggleExpanded() {
    syncNow();
    if (state.expanded) collapseInput();
    else expandInput();
  }

  function compactAfterSend(previousTarget = state.target) {
    collapseInput({ immediate: true, scrollToEnd: false });

    const compactOnce = (force = false) => {
      const input = findChatInput();
      if (!force && input instanceof HTMLElement && hasExpandableContent(input)) return;

      const candidates = new Set();
      if (previousTarget instanceof HTMLElement && previousTarget.isConnected) candidates.add(previousTarget);
      if (state.target instanceof HTMLElement && state.target.isConnected) candidates.add(state.target);
      if (input instanceof HTMLElement) {
        candidates.add(input);
        const target = findResizeTarget(input);
        if (target instanceof HTMLElement) candidates.add(target);
      }

      for (const element of candidates) {
        for (const property of STYLE_PROPS) element.style.removeProperty(property);
        element.removeAttribute('data-ccr-expanded');
        element.removeAttribute('data-ccr-animating');
      }

      state.expanded = false;
      state.originalStyles = null;
      state.collapsedHeight = 0;
      state.originalScrollTop = 0;
      state.hadContent = false;
      scheduleRadiosondeRestore();
      setButtonState(false, false);
      scheduleSync(20);
    };

    compactOnce(true);
    requestAnimationFrame(compactOnce);
    for (const delay of [45, 140, 300, 650, 1200]) setTimeout(compactOnce, delay);
  }

  function disconnectContextObservers() {
    try { state.resizeObserver?.disconnect?.(); } catch (_) {}
    try { state.contentObserver?.disconnect?.(); } catch (_) {}
    state.resizeObserver = null;
    state.contentObserver = null;
  }

  function observeContext(input, target) {
    disconnectContextObservers();
    if (!(input instanceof HTMLElement) || !(target instanceof HTMLElement)) return;

    if (typeof ResizeObserver === 'function') {
      state.resizeObserver = new ResizeObserver(() => scheduleSync(30));
      try { state.resizeObserver.observe(input); } catch (_) {}
      if (target !== input) {
        try { state.resizeObserver.observe(target); } catch (_) {}
      }
    }

    state.contentObserver = new MutationObserver(() => {
      const hasContent = hasExpandableContent(input);
      const becameEmpty = state.hadContent && !hasContent;
      state.hadContent = hasContent;
      if (state.expanded && becameEmpty) {
        compactAfterSend(target);
        return;
      }
      scheduleSync(20);
    });
    try {
      state.contentObserver.observe(input, { childList: true, subtree: true, characterData: true });
    } catch (_) {}
  }

  function setContext(input, target) {
    if (state.input === input && state.target === target) return;
    if (state.expanded || state.originalStyles) collapseInput({ immediate: true, scrollToEnd: false });
    state.input = input;
    state.target = target;
    state.hadContent = hasExpandableContent(input);
    observeContext(input, target);
  }

  function restoreHostPosition() {
    const host = state.host;
    if (!(host instanceof HTMLElement)) return;
    host.removeAttribute('data-ccr-host');
  }

  function ensureControlLayer() {
    let layer = document.getElementById(ID.layer);
    if (!(layer instanceof HTMLElement)) {
      layer = document.createElement('div');
      layer.id = ID.layer;
      (document.body || document.documentElement).appendChild(layer);
    }
    return layer;
  }

  function positionControls() {
    const host = state.host;
    const button = state.toggle;
    if (!(host instanceof HTMLElement) || !host.isConnected) return;
    const rect = host.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth) || 1);
    const viewportHeight = Math.max(1, Number(window.innerHeight) || 1);
    const visible = rect.width >= 160 && rect.height >= 28
      && rect.right > 0 && rect.left < viewportWidth && rect.bottom > 0 && rect.top < viewportHeight;
    const left = Math.max(0, Math.min(rect.left, viewportWidth));
    const right = Math.max(left, Math.min(rect.right, viewportWidth));
    const top = Math.max(0, Math.min(rect.top, viewportHeight));

    if (button instanceof HTMLElement) {
      button.style.setProperty('left', `${Math.round(Math.max(left, right - 29))}px`, 'important');
      button.style.setProperty('top', `${Math.round(top + 6)}px`, 'important');
      button.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
      try {
        const source = document.querySelector('#chud-sidebar, #chud-infobar') || host;
        const color = getComputedStyle(source).color;
        if (color) button.style.setProperty('--ccr-control-color', color);
      } catch (_) {}
    }
  }

  function createToggleButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = ID.toggle;
    button.tabIndex = -1;
    button.setAttribute('aria-hidden', 'true');
    button.innerHTML = TOGGLE_ICONS.collapsed;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleExpanded();
    });
    return button;
  }

  function ensureButton() {
    const host = state.host;
    if (!(host instanceof HTMLElement)) return;
    const layer = ensureControlLayer();
    let button = document.getElementById(ID.toggle);
    if (!(button instanceof HTMLButtonElement) || button.parentElement !== layer) {
      button?.remove();
      button = createToggleButton();
      layer.appendChild(button);
    }
    state.toggle = button;
    positionControls();
  }

  function bindHost(host) {
    if (state.host === host) {
      ensureButton();
      return;
    }
    document.getElementById(ID.toggle)?.remove();
    restoreHostPosition();
    state.host = host;
    host.setAttribute('data-ccr-host', '1');
    ensureButton();
  }

  function unbindContext({ restore = true } = {}) {
    if (restore && (state.expanded || state.originalStyles)) {
      collapseInput({ immediate: true, scrollToEnd: false });
    }
    cancelAnimation();
    if (state.radiosondeSyncRaf) cancelAnimationFrame(state.radiosondeSyncRaf);
    state.radiosondeSyncRaf = 0;
    disconnectContextObservers();
    restoreRadiosondePin();
    document.getElementById(ID.layer)?.remove();
    restoreHostPosition();
    state.input = null;
    state.target = null;
    state.host = null;
    state.toggle = null;
    state.expanded = false;
    state.originalStyles = null;
    state.collapsedHeight = 0;
    state.originalScrollTop = 0;
    state.hadContent = false;
    state.radiosondeHost = null;
    state.radiosondePopup = null;
    state.radiosondeStyles = null;
    state.radiosondeRestoreTimer = 0;
    state.radiosondeObserver = null;
    state.radiosondeRepairRaf = 0;
    state.radiosondeSyncRaf = 0;
  }

  function syncNow() {
    if (state.syncTimer) clearTimeout(state.syncTimer);
    if (state.syncRaf) cancelAnimationFrame(state.syncRaf);
    state.syncTimer = 0;
    state.syncRaf = 0;

    if (!isPcLike() || !isChatRoomPath()) {
      if (state.input || state.host) unbindContext({ restore: true });
      return;
    }

    const input = findChatInput();
    if (!(input instanceof HTMLElement)) {
      if (state.input || state.host) unbindContext({ restore: true });
      return;
    }

    const host = findUiHost(input);
    if (!(host instanceof HTMLElement)) {
      if (state.input || state.host) unbindContext({ restore: true });
      return;
    }
    bindHost(host);

    if (state.expanded) {
      if (state.input !== input || !(state.target instanceof HTMLElement) || !state.target.isConnected) {
        collapseInput({ immediate: true, scrollToEnd: false });
      } else if (!hasExpandableContent(input)) {
        compactAfterSend(state.target);
        return;
      }
    }

    if (!state.expanded) {
      const target = findResizeTarget(input);
      if (!(target instanceof HTMLElement)) {
        setButtonState(false, false);
        return;
      }
      setContext(input, target);
    }

    if (state.expanded) {
      updateExpandedHeight();
      setButtonState(true, true);
      positionControls();
      return;
    }

    const visible = hasExpandableContent(input) && elementOverflows(state.target);
    setButtonState(visible, false);
    positionControls();
  }

  function scheduleSync(delay = APP.syncDelay) {
    if (state.syncTimer) clearTimeout(state.syncTimer);
    if (state.syncRaf) cancelAnimationFrame(state.syncRaf);
    state.syncTimer = setTimeout(() => {
      state.syncTimer = 0;
      state.syncRaf = requestAnimationFrame(syncNow);
    }, Math.max(0, delay));
  }

  function injectStyles() {
    if (document.getElementById(ID.style)) return;
    const style = document.createElement('style');
    style.id = ID.style;
    style.textContent = `
      #${ID.layer} {
        all: initial !important;
        position: fixed !important;
        inset: 0 !important;
        z-index: 79 !important;
        display: block !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        pointer-events: none !important;
        overflow: visible !important;
      }
      #${ID.toggle} {
        all: unset !important;
        position: absolute !important;
        top: 6px !important;
        left: 0 !important;
        right: auto !important;
        z-index: 2 !important;
        display: none !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        width: 22px !important;
        min-width: 22px !important;
        height: 22px !important;
        min-height: 22px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
        color: var(--ccr-control-color, hsl(var(--line-gray-2, 0 0% 62%))) !important;
        line-height: 1 !important;
        opacity: .72 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-tap-highlight-color: transparent !important;
        transition: color .15s, opacity .15s, transform .15s !important;
      }
      #${ID.toggle} svg {
        display: block !important;
        width: 17px !important;
        height: 17px !important;
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.9 !important;
        stroke-linecap: round !important;
        stroke-linejoin: round !important;
        pointer-events: none !important;
      }
      #${ID.toggle}.ccr-expand-visible {
        display: inline-flex !important;
      }
      #${ID.toggle}:hover, #${ID.toggle}:focus-visible {
        opacity: 1 !important;
        outline: none !important;
      }
      #${ID.toggle}:active {
        transform: scale(.92) !important;
      }
      [data-ccr-animating="1"] {
        transition: height .2s ease, max-height .2s ease !important;
      }
      @media (prefers-reduced-motion: reduce) {
        [data-ccr-animating="1"] { transition: none !important; }
      }
      @media (max-width: ${APP.minViewportWidth - 1}px), (pointer: coarse) and (hover: none) {
        #${ID.toggle} { display: none !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function hookHistory() {
    if (window.__CRACK_COMPOSER_RESIZER_HISTORY__) return;
    window.__CRACK_COMPOSER_RESIZER_HISTORY__ = true;
    const fire = () => setTimeout(() => {
      if (state.routeKey === location.href) return;
      state.routeKey = location.href;
      unbindContext({ restore: true });
      scheduleSync(50);
    }, 40);

    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = function (...args) {
      const result = originalPush.apply(this, args);
      fire();
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplace.apply(this, args);
      fire();
      return result;
    };
    window.addEventListener('popstate', fire);
  }

  function bindInputEvents() {
    const scheduleForInput = (event) => {
      if (!isLikelyChatInput(event.target)) return;
      // focusin은 내용 변화가 아니므로 빈 입력창 클릭만으로 상태를 바꾸지 않는다.
      if (event.type === 'focusin' || event.target !== state.input) {
        scheduleSync(20);
        return;
      }
      const hasContent = hasExpandableContent(event.target);
      const becameEmpty = state.hadContent && !hasContent;
      state.hadContent = hasContent;
      if (state.expanded && becameEmpty) {
        compactAfterSend(state.target);
        return;
      }
      scheduleSync(20);
    };
    document.addEventListener('input', scheduleForInput, true);
    document.addEventListener('keyup', scheduleForInput, true);
    document.addEventListener('compositionend', scheduleForInput, true);
    document.addEventListener('focusin', scheduleForInput, true);
    document.addEventListener('paste', (event) => {
      if (isLikelyChatInput(event.target)) setTimeout(() => scheduleSync(20), 0);
    }, true);
    document.addEventListener('cut', (event) => {
      if (isLikelyChatInput(event.target)) setTimeout(() => scheduleSync(20), 0);
    }, true);
  }

  function start() {
    injectStyles();
    hookHistory();
    bindInputEvents();

    state.documentObserver = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) => {
        if (mutation.target instanceof Element && mutation.target.closest?.(OWN_SELECTOR)) return false;
        return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
          if (!(node instanceof Element)) return false;
          if (node.matches?.(OWN_SELECTOR) || node.closest?.(OWN_SELECTOR)) return false;
          return node.matches?.('textarea, [contenteditable="true"], form, main, #igx-live-popup') ||
            Boolean(node.querySelector?.('textarea, [contenteditable="true"], form, main, #igx-live-popup'));
        });
      });
      if (relevant) scheduleSync(40);
    });
    state.documentObserver.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', () => scheduleSync(30), { passive: true });
    try { window.visualViewport?.addEventListener('resize', () => scheduleSync(30), { passive: true }); } catch (_) {}
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleSync(30);
    });

    setInterval(() => {
      const routeChanged = state.routeKey !== location.href;
      if (routeChanged) state.routeKey = location.href;
      const contextMissing = isChatRoomPath() && (
        !(state.input instanceof HTMLElement) ||
        !state.input.isConnected ||
        !(state.toggle instanceof HTMLButtonElement) ||
        !state.toggle.isConnected
      );
      if (routeChanged || contextMissing) scheduleSync(20);
      if (state.expanded) stabilizeRadiosondeHost();
    }, APP.watchdogDelay);

    syncNow();
    setTimeout(syncNow, 500);
    setTimeout(syncNow, 1500);
  }

  start();
})();
