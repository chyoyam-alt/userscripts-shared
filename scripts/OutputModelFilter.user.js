// ==UserScript==
// @name         ⚙️ Crack Output Model Filter (출력 모델 필터)
// @namespace    https://crack.wrtn.ai/
// @version      1.1.2
// @description  답변 길이/생각 조절 창에 표시할 모델을 고르고, 새 모델은 자동으로 감지해 표시합니다.
// @downloadURL  https://gist.github.com/chyoyam-alt/d1268f9a1c73ab876e5c398d7aab018b/raw/OutputModelFilter.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/d1268f9a1c73ab876e5c398d7aab018b/raw/OutputModelFilter.user.js
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const SETTINGS_TITLE = '답변 길이 및 생각 조절';
  const STORAGE_KEY = 'crack-output-model-filter-v2';
  const LEGACY_STORAGE_KEY = 'crack-output-model-filter-v1';
  const GEAR_ATTR = 'data-crack-model-filter-gear';
  const MANAGED_ATTR = 'data-crack-model-filter-managed';
  const HIDDEN_CLASS = 'crack-model-filter-hidden';
  const PANEL_ID = 'crack-model-filter-panel';
  const STYLE_ID = 'crack-model-filter-style';

  let prefs = loadPrefs();
  let openPanel = null;
  let openGear = null;
  let openDialog = null;

  const pendingDialogs = new Set();
  let flushQueued = false;

  function readStoredValue(key) {
    try {
      const value = GM_getValue(key, null);
      if (value !== null && value !== undefined) return value;
    } catch (_) {}

    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) {}

    return null;
  }

  function loadPrefs() {
    const current = readStoredValue(STORAGE_KEY);
    if (current && typeof current === 'object') {
      return {
        hidden: Array.isArray(current.hidden)
          ? current.hidden.filter(v => typeof v === 'string')
          : [],
        migrationPending: false,
        legacyVisible: [],
      };
    }

    // v1.0.x는 "보이는 모델"을 저장했다.
    // v1.1.0부터는 "숨긴 모델"만 저장해서 새 모델이 자동으로 보이게 한다.
    const legacy = readStoredValue(LEGACY_STORAGE_KEY);
    if (legacy && typeof legacy === 'object' && legacy.configured === true) {
      return {
        hidden: [],
        migrationPending: true,
        legacyVisible: Array.isArray(legacy.visible)
          ? legacy.visible.filter(v => typeof v === 'string')
          : [],
      };
    }

    return {
      hidden: [],
      migrationPending: false,
      legacyVisible: [],
    };
  }

  function savePrefs() {
    const value = {
      hidden: Array.from(new Set(prefs.hidden)).sort(),
    };

    try {
      GM_setValue(STORAGE_KEY, value);
    } catch (_) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (_) {}
    }
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function migrateLegacyIfNeeded(names) {
    if (!prefs.migrationPending) return;

    const visible = new Set(prefs.legacyVisible);
    prefs.hidden = names.filter(name => !visible.has(name));
    prefs.migrationPending = false;
    prefs.legacyVisible = [];
    savePrefs();
  }

  function isOpenDialog(dialog) {
    if (!(dialog instanceof HTMLElement)) return false;
    if (dialog.getAttribute('role') !== 'dialog') return false;
    if (dialog.getAttribute('data-state') === 'closed') return false;
    return dialog.isConnected;
  }

  function directChildByTag(parent, tagName) {
    if (!(parent instanceof Element)) return null;
    return Array.from(parent.children).find(el => el.tagName === tagName) || null;
  }

  function getEntryTrigger(item) {
    if (!(item instanceof HTMLElement)) return null;

    const heading = directChildByTag(item, 'H3');
    if (!heading) return null;

    return Array.from(heading.children).find(el =>
      el.tagName === 'BUTTON' &&
      el.hasAttribute('aria-expanded') &&
      el.getAttribute('data-orientation') === 'vertical'
    ) || null;
  }

  function readModelName(trigger) {
    if (!(trigger instanceof HTMLElement)) return '';

    const directSpans = Array.from(trigger.children).filter(el => el.tagName === 'SPAN');
    const preferred = directSpans.find(el => el.classList.contains('flex-1'));
    const candidate = preferred || directSpans[0];

    return normalizeText(candidate?.textContent);
  }

  function getAccordionCandidate(dialog) {
    if (!(dialog instanceof HTMLElement)) return null;

    const roots = Array.from(dialog.querySelectorAll('div[data-orientation="vertical"]'));
    let best = null;

    for (const root of roots) {
      const children = Array.from(root.children).filter(el => el instanceof HTMLElement);
      if (children.length < 3) continue;

      const entries = [];
      let iconCount = 0;
      let collectionTriggerCount = 0;

      // 모델이 추가되거나 중간에 보조 노드가 생겨도
      // 유효한 모델 항목만 자동 수집한다.
      for (const item of children) {
        const trigger = getEntryTrigger(item);
        if (!trigger) continue;

        const name = readModelName(trigger);
        if (!name) continue;

        if (Array.from(trigger.children).some(el => el.tagName === 'IMG')) {
          iconCount += 1;
        }
        if (trigger.hasAttribute('data-radix-collection-item')) {
          collectionTriggerCount += 1;
        }

        entries.push({ item, trigger, name });
      }

      if (entries.length < 3) continue;

      const iconRatio = iconCount / entries.length;
      const collectionRatio = collectionTriggerCount / entries.length;
      if (iconRatio < 0.6 || collectionRatio < 0.6) continue;

      if (!best || entries.length > best.entries.length) {
        best = { root, entries };
      }
    }

    return best;
  }

  function findHelpButton(header) {
    if (!(header instanceof HTMLElement)) return null;

    const buttons = Array.from(header.querySelectorAll('button')).filter(button =>
      !button.hasAttribute(GEAR_ATTR)
    );

    const labelled = buttons.find(button =>
      button.getAttribute('aria-label') === '도움말' &&
      button.getAttribute('aria-haspopup') === 'dialog'
    );
    if (labelled) return labelled;

    return buttons.find(button =>
      button.getAttribute('aria-haspopup') === 'dialog' &&
      button.getAttribute('type') === 'button'
    ) || null;
  }

  function getSettingsContextFromDialog(dialog) {
    if (!isOpenDialog(dialog)) return null;

    // 안전장치 1: 정확히 이 설정창 제목일 때만 동작한다.
    // 다른 dialog가 우연히 같은 accordion/help 구조를 가져도 절대 관리하지 않는다.
    const header = Array.from(dialog.children).find(child => {
      if (!(child instanceof HTMLElement)) return false;

      const title = child.querySelector('h2');
      if (!(title instanceof HTMLElement)) return false;
      if (normalizeText(title.textContent) !== SETTINGS_TITLE) return false;

      return Boolean(findHelpButton(child));
    });
    if (!(header instanceof HTMLElement)) return null;

    const helpButton = findHelpButton(header);
    if (!helpButton) return null;

    // 안전장치 2: 제목뿐 아니라 실제 모델 accordion 구조까지 모두 맞아야 한다.
    const accordion = getAccordionCandidate(dialog);
    if (!accordion) return null;

    return {
      dialog,
      header,
      helpButton,
      ...accordion,
    };
  }

  function applyFilter(context) {
    if (!context?.entries?.length) return;

    const names = context.entries.map(entry => entry.name);
    migrateLegacyIfNeeded(names);

    const hidden = new Set(prefs.hidden);
    for (const entry of context.entries) {
      entry.item.classList.toggle(HIDDEN_CLASS, hidden.has(entry.name));
    }

    // 새 모델이 생긴 경우 prefs.hidden에는 없으므로 자동 표시된다.
    // 팝업이 열려 있으면 새 항목도 즉시 목록에 추가한다.
    if (openPanel && openDialog === context.dialog) {
      syncPanel(context);
    }
  }

  function getOpaqueBackground(element) {
    let node = element;

    while (node instanceof Element) {
      const color = getComputedStyle(node).backgroundColor;
      if (
        color &&
        color !== 'transparent' &&
        color !== 'rgba(0, 0, 0, 0)'
      ) {
        return color;
      }
      node = node.parentElement;
    }

    return matchMedia('(prefers-color-scheme: dark)').matches
      ? 'rgb(20, 20, 20)'
      : 'rgb(255, 255, 255)';
  }

  function parseRgb(color) {
    const match = String(color || '').match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  function isDarkColor(color) {
    const rgb = parseRgb(color);
    if (!rgb) return matchMedia('(prefers-color-scheme: dark)').matches;
    const [r, g, b] = rgb;
    return (r * 299 + g * 587 + b * 114) / 1000 < 145;
  }

  function syncPanelTheme(context) {
    if (!openPanel || !context?.dialog) return;

    const bg = getOpaqueBackground(context.dialog);
    const dark = isDarkColor(bg);
    const dialogColor = getComputedStyle(context.dialog).color;

    openPanel.style.setProperty('--cgmf-bg', bg);
    openPanel.style.setProperty('--cgmf-fg', dialogColor || (dark ? '#f3f3f3' : '#171717'));
    openPanel.style.setProperty('--cgmf-muted', dark ? 'rgba(255,255,255,.58)' : 'rgba(0,0,0,.55)');
    openPanel.style.setProperty('--cgmf-hover', dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)');
    openPanel.style.setProperty('--cgmf-border', dark ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.13)');
  }

  function makeGearButton(helpButton) {
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = `${helpButton.className || ''} crack-model-filter-gear`;
    gear.setAttribute(GEAR_ATTR, '1');
    gear.setAttribute('aria-label', '표시할 모델 설정');
    gear.setAttribute('aria-haspopup', 'dialog');
    gear.setAttribute('aria-expanded', 'false');
    gear.title = '표시할 모델 설정';
    gear.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.36.7.68.94.3.23.67.36 1.05.36H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"></path>
      </svg>`;

    gear.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const dialog = gear.closest('[role="dialog"]');
      const context = getSettingsContextFromDialog(dialog);
      if (!context) return;

      if (openGear === gear && openPanel) {
        closePanel();
      } else {
        openModelPanel(gear, context);
      }
    });

    return gear;
  }

  function ensureDialog(dialog) {
    const context = getSettingsContextFromDialog(dialog);
    if (!context) return false;

    context.dialog.setAttribute(MANAGED_ATTR, '1');

    let gear = context.header.querySelector(`button[${GEAR_ATTR}]`);
    if (!gear || !gear.isConnected) {
      gear = makeGearButton(context.helpButton);
      context.helpButton.insertAdjacentElement('afterend', gear);

      if (openDialog === context.dialog && openGear && !openGear.isConnected) {
        closePanel();
      }
    }

    applyFilter(context);
    return true;
  }

  function openModelPanel(gear, context) {
    closePanel();

    openGear = gear;
    openDialog = context.dialog;
    gear.setAttribute('aria-expanded', 'true');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', '표시할 모델 설정');
    panel.innerHTML = `
      <div class="cgmf-title-row">
        <strong>표시할 모델</strong>
        <button type="button" class="cgmf-show-all">전체 표시</button>
      </div>
      <div class="cgmf-note">체크 해제한 모델만 숨겨요 · 새 모델은 자동 표시</div>
      <div class="cgmf-list"></div>
      <div class="cgmf-status"></div>`;

    // 기존 설정 dialog 안에 두어 Radix의 모달 focus/inert 처리와 충돌하지 않는다.
    // 자체 배경을 강제로 불투명하게 만들어 원본 모델 목록과 시각적으로 섞이지 않게 한다.
    context.dialog.appendChild(panel);
    openPanel = panel;

    panel.querySelector('.cgmf-show-all').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      prefs.hidden = [];
      prefs.migrationPending = false;
      prefs.legacyVisible = [];
      savePrefs();

      const currentContext = getSettingsContextFromDialog(openDialog) || context;
      applyFilter(currentContext);
      syncPanel(currentContext, true);
    });

    syncPanelTheme(context);
    syncPanel(context, true);
    positionPanel();
    requestAnimationFrame(() => {
      syncPanelTheme(context);
      positionPanel();
    });
  }

  function syncPanel(context, forceRebuild = false) {
    if (!openPanel || !context?.entries || openDialog !== context.dialog) return;

    const list = openPanel.querySelector('.cgmf-list');
    if (!list) return;

    const names = context.entries.map(entry => entry.name);
    migrateLegacyIfNeeded(names);

    const existingNames = Array.from(
      list.querySelectorAll('input[type="checkbox"][data-model-name]')
    ).map(input => input.dataset.modelName || '');

    const sameList =
      !forceRebuild &&
      names.length === existingNames.length &&
      names.every((name, index) => name === existingNames[index]);

    if (!sameList) {
      list.replaceChildren();

      for (const entry of context.entries) {
        const label = document.createElement('label');
        label.className = 'cgmf-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.modelName = entry.name;

        const text = document.createElement('span');
        text.textContent = entry.name;

        checkbox.addEventListener('change', event => {
          event.stopPropagation();

          const currentContext = getSettingsContextFromDialog(openDialog) || context;
          const hidden = new Set(prefs.hidden);

          if (checkbox.checked) hidden.delete(entry.name);
          else hidden.add(entry.name);

          prefs.hidden = Array.from(hidden);
          prefs.migrationPending = false;
          prefs.legacyVisible = [];
          savePrefs();

          applyFilter(currentContext);
          syncPanel(currentContext);
        });

        label.append(checkbox, text);
        list.appendChild(label);
      }
    }

    const hidden = new Set(prefs.hidden);
    for (const checkbox of list.querySelectorAll('input[type="checkbox"][data-model-name]')) {
      checkbox.checked = !hidden.has(checkbox.dataset.modelName);
    }

    const shown = context.entries.filter(entry => !hidden.has(entry.name)).length;
    const status = openPanel.querySelector('.cgmf-status');
    if (status) status.textContent = `${shown} / ${context.entries.length}개 표시`;

    syncPanelTheme(context);
    requestAnimationFrame(positionPanel);
  }

  function positionPanel() {
    if (!openPanel || !openGear?.isConnected || !openDialog?.isConnected) return;

    const gap = 8;
    const margin = 10;
    const gearRect = openGear.getBoundingClientRect();
    const dialogRect = openDialog.getBoundingClientRect();
    const panelRect = openPanel.getBoundingClientRect();

    // panel은 dialog 내부 absolute 요소다.
    // 우선 톱니 아래에 배치하고 dialog 영역 안으로만 clamp한다.
    let left = gearRect.left - dialogRect.left - 10;
    let top = gearRect.bottom - dialogRect.top + gap;

    const maxLeft = Math.max(margin, dialogRect.width - panelRect.width - margin);
    left = Math.min(Math.max(left, margin), maxLeft);

    if (top + panelRect.height > dialogRect.height - margin) {
      top = gearRect.top - dialogRect.top - panelRect.height - gap;
    }
    if (top < margin) top = margin;

    openPanel.style.left = `${Math.round(left)}px`;
    openPanel.style.top = `${Math.round(top)}px`;
  }

  function closePanel() {
    if (openGear?.isConnected) {
      openGear.setAttribute('aria-expanded', 'false');
    }
    if (openPanel?.isConnected) {
      openPanel.remove();
    }

    openPanel = null;
    openGear = null;
    openDialog = null;
  }

  function enqueueDialog(dialog) {
    if (!isOpenDialog(dialog)) return;
    pendingDialogs.add(dialog);

    if (flushQueued) return;
    flushQueued = true;

    requestAnimationFrame(() => {
      flushQueued = false;
      const dialogs = Array.from(pendingDialogs);
      pendingDialogs.clear();

      for (const item of dialogs) {
        if (isOpenDialog(item)) ensureDialog(item);
      }

      if (openGear && !openGear.isConnected) {
        closePanel();
      }
    });
  }

  function scanOpenDialogs(root = document) {
    if (!root) return;

    if (root instanceof Element && root.matches('[role="dialog"]')) {
      enqueueDialog(root);
    }

    if (root.querySelectorAll) {
      for (const dialog of root.querySelectorAll('[role="dialog"]')) {
        enqueueDialog(dialog);
      }
    }
  }

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      const target = mutation.target instanceof Element ? mutation.target : null;

      // 우리가 만든 팝업 변경은 다시 모델 dialog를 탐색할 이유가 없다.
      if (target?.closest?.(`#${PANEL_ID}`)) continue;

      // 모델 추가/삭제/교체가 생기면 해당 dialog만 다시 분석한다.
      const ownerDialog = target?.closest?.('[role="dialog"]');
      if (ownerDialog) enqueueDialog(ownerDialog);

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.id === PANEL_ID || node.closest?.(`#${PANEL_ID}`)) continue;

        if (node.matches?.('[role="dialog"]')) {
          enqueueDialog(node);
        }

        for (const dialog of node.querySelectorAll?.('[role="dialog"]') || []) {
          enqueueDialog(dialog);
        }
      }
    }

    if (openGear && !openGear.isConnected) {
      closePanel();
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${HIDDEN_CLASS} {
        display: none !important;
      }

      .crack-model-filter-gear svg {
        fill: none !important;
        stroke: currentColor !important;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      #${PANEL_ID} {
        position: absolute;
        z-index: 2147483647;
        width: min(230px, calc(100% - 20px));
        max-height: none;
        overflow: visible;
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid var(--cgmf-border, rgba(127,127,127,.25));
        border-radius: 12px;
        background-color: var(--cgmf-bg, #fff) !important;
        color: var(--cgmf-fg, #111) !important;
        box-shadow: 0 12px 34px rgba(0,0,0,.32);
        font-family: inherit;
        font-size: 13px;
        line-height: 1.4;
        isolation: isolate;
        opacity: 1 !important;
        backdrop-filter: none !important;
      }

      #${PANEL_ID} * {
        box-sizing: border-box;
      }

      #${PANEL_ID} .cgmf-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }

      #${PANEL_ID} .cgmf-title-row strong {
        min-width: 0;
        font-size: 13px;
        line-height: 1.3;
        white-space: nowrap;
      }

      #${PANEL_ID} .cgmf-show-all {
        flex: 0 0 auto;
        border: 1px solid var(--cgmf-border, rgba(127,127,127,.25));
        border-radius: 7px;
        padding: 4px 7px;
        background: var(--cgmf-hover, rgba(127,127,127,.10));
        color: inherit;
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        line-height: 1.3;
      }

      #${PANEL_ID} .cgmf-show-all:hover {
        filter: brightness(1.08);
      }

      #${PANEL_ID} .cgmf-note {
        margin-bottom: 7px;
        color: var(--cgmf-muted, #777);
        font-size: 10px;
        line-height: 1.4;
        white-space: normal;
      }

      #${PANEL_ID} .cgmf-list {
        max-height: none;
        overflow: visible;
        padding: 2px 0;
      }

      #${PANEL_ID} .cgmf-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding: 4px 5px;
        border-radius: 7px;
        cursor: pointer;
        user-select: none;
      }

      #${PANEL_ID} .cgmf-row:hover {
        background: var(--cgmf-hover, rgba(127,127,127,.10));
      }

      #${PANEL_ID} .cgmf-row input {
        flex: 0 0 auto;
        width: 15px;
        height: 15px;
        margin: 0;
        accent-color: currentColor;
      }

      #${PANEL_ID} .cgmf-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }

      #${PANEL_ID} .cgmf-status {
        margin-top: 7px;
        padding-top: 7px;
        border-top: 1px solid var(--cgmf-border, rgba(127,127,127,.18));
        color: var(--cgmf-muted, #777);
        font-size: 10px;
        text-align: right;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function init() {
    injectStyle();
    scanOpenDialogs(document);

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener('pointerdown', event => {
      if (!openPanel) return;
      if (openPanel.contains(event.target)) return;
      if (openGear?.contains(event.target)) return;
      closePanel();
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && openPanel) {
        closePanel();
      }
    }, true);

    window.addEventListener('resize', () => {
      if (openPanel) positionPanel();
    }, { passive: true });

    document.addEventListener('scroll', event => {
      if (!openPanel) return;
      if (openPanel.contains(event.target)) return;
      closePanel();
    }, true);
  }

  function start() {
    if (document.body) {
      init();
      return;
    }

    const bootObserver = new MutationObserver(() => {
      if (!document.body) return;
      bootObserver.disconnect();
      init();
    });

    bootObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  start();
})();
