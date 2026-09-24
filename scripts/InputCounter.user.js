// ==UserScript==
// @name         🔢 Crack Input Counter (입력 글자수)
// @namespace    crack-input-character-counter
// @version      1.0.7
// @description  크랙 채팅 입력창의 현재 글자수를 실시간 표시합니다. 2,000자에 가까워질수록 노랑→주황→빨강으로 변하고, 초과 순간 흔들림/진동으로 알립니다.
// @author       Assistant
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__CRACK_INPUT_COUNTER_102_LOADED__) return;
  window.__CRACK_INPUT_COUNTER_102_LOADED__ = true;

  /*****************************************************************
   * 사용자 조정값
   *****************************************************************/
  const LIMIT = 2000;
  const YELLOW_START = 1400;
  const ORANGE_START = 1750;
  const HOT_START = 1900;
  const SCAN_INTERVAL_MS = 700;

  const ID = {
    style: 'cic-style',
    wrap: 'cic-wrap',
    count: 'cic-count',
  };

  const state = {
    editor: null,
    editorObserver: null,
    previousCount: null,
    updateFrame: 0,
  };

  /*****************************************************************
   * 스타일
   *****************************************************************/
  function injectStyle() {
    if (document.getElementById(ID.style)) return;

    const style = document.createElement('style');
    style.id = ID.style;
    style.textContent = `
      /*
       * v1.0.2: 카운터를 flex 흐름에서 완전히 분리한다.
       * 다른 확프가 버튼 순서를 재정렬해도 카운터가 자리를 놓고 싸우지 않는다.
       */
      #${ID.wrap} {
        position: absolute !important;
        z-index: 2 !important;
        top: var(--cic-top, 0px) !important;
        left: var(--cic-left, 100%) !important;
        right: auto !important;
        transform: translate(-50%, -100%) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 30px !important;
        height: 28px !important;
        margin: 0 !important;
        padding: 0 4px !important;
        box-sizing: border-box !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      #${ID.count} {
        display: inline-block !important;
        color: var(--cic-color, var(--text_tertiary, var(--icon_tertiary, rgba(128, 128, 128, .78)))) !important;
        font-family: inherit !important;
        font-size: 11px !important;
        font-weight: 650 !important;
        line-height: 1 !important;
        letter-spacing: -0.02em !important;
        font-variant-numeric: tabular-nums !important;
        white-space: nowrap !important;
        opacity: .74 !important;
        text-shadow: none !important;
        transition: color 150ms ease, opacity 150ms ease, transform 150ms ease !important;
      }

      #${ID.count}[data-empty="true"] {
        opacity: .42 !important;
      }

      #${ID.count}[data-warning="true"] {
        opacity: .96 !important;
      }

      #${ID.count}[data-limit="true"] {
        opacity: 1 !important;
        font-weight: 750 !important;
      }

      #${ID.count}.cic-over-pulse {
        animation: cic-over-shake 520ms cubic-bezier(.36,.07,.19,.97) both !important;
      }

      @keyframes cic-over-shake {
        0%, 100% { transform: translateX(0) scale(1); }
        12% { transform: translateX(-3px) rotate(-4deg) scale(1.08); }
        24% { transform: translateX(3px) rotate(4deg) scale(1.08); }
        36% { transform: translateX(-3px) rotate(-3deg) scale(1.07); }
        48% { transform: translateX(3px) rotate(3deg) scale(1.07); }
        62% { transform: translateX(-2px) rotate(-2deg) scale(1.05); }
        76% { transform: translateX(2px) rotate(2deg) scale(1.03); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${ID.count} { transition: color 150ms ease, opacity 150ms ease !important; }
        #${ID.count}.cic-over-pulse { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  /*****************************************************************
   * 입력창 탐색/텍스트 읽기
   *****************************************************************/
  function isVisibleElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const css = getComputedStyle(el);
    return css.display !== 'none' && css.visibility !== 'hidden';
  }

  function findEditor() {
    const selectors = [
      'main div.__chat_input_textarea[contenteditable="true"]',
      'main div.tiptap.ProseMirror[contenteditable="true"]',
      'main div.ProseMirror[contenteditable="true"]',
      'main textarea.__chat_input_textarea',
      'main textarea[placeholder*="메시지"]',
      'main textarea[placeholder*="Message"]',
      'div.__chat_input_textarea[contenteditable="true"]',
      'div.tiptap.ProseMirror[contenteditable="true"]',
      'textarea.__chat_input_textarea',
    ];

    for (const selector of selectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        if (isVisibleElement(candidates[i])) return candidates[i];
      }
    }
    return null;
  }

  function getEditorText(editor) {
    if (!editor) return '';

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      return String(editor.value || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u200b/g, '');
    }

    let text = String(editor.innerText ?? editor.textContent ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/\u200b/g, '');

    // ProseMirror의 완전 빈 문단이 브라우저에 따라 "\n"으로 잡히는 경우만 정리한다.
    const hasVisibleTextNode = String(editor.textContent || '').replace(/\u200b/g, '').length > 0;
    const markedEmpty = !!editor.querySelector?.('.is-editor-empty');
    if (!hasVisibleTextNode && (markedEmpty || /^\n*$/.test(text))) text = '';

    return text;
  }

  function countCharacters(text) {
    // 한글/일반 문자는 1자, 기본 이모지도 화면에 보이는 단위에 가깝게 계산한다.
    return Array.from(String(text || '')).length;
  }

  /*****************************************************************
   * 입력창 하단 액션 줄 탐색
   *****************************************************************/
  function isActionRowCandidate(row) {
    if (!(row instanceof HTMLElement)) return false;
    if (!row.classList.contains('flex')) return false;
    if (!row.classList.contains('items-center')) return false;
    if (!row.classList.contains('justify-between')) return false;

    const visibleButtons = Array.from(row.querySelectorAll('button')).filter((button) => {
      if (!(button instanceof HTMLElement)) return false;
      if (button.closest(`#${ID.wrap}`)) return false;
      return isVisibleElement(button);
    });

    if (visibleButtons.length === 0) return false;

    const hasLeftButtonGroup = Array.from(row.children || []).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      return child.classList.contains('space-x-2') || !!child.querySelector?.('.space-x-2');
    });

    return hasLeftButtonGroup || row.children.length >= 2;
  }

  function findActionRow(editor) {
    if (!editor) return null;

    let node = editor;
    for (let depth = 0; depth < 10 && node; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (isActionRowCandidate(node)) return node;

      const rows = Array.from(node.querySelectorAll?.('div.flex.items-center.justify-between') || [])
        .filter(isActionRowCandidate);

      if (rows.length > 0) return rows[rows.length - 1];
    }

    return null;
  }

  function getSendAnchor(actionRow) {
    if (!(actionRow instanceof HTMLElement)) return null;

    const children = Array.from(actionRow.children || []).filter((child) => (
      child instanceof HTMLElement && child.id !== ID.wrap
    ));

    return children.length ? children[children.length - 1] : null;
  }

  function visibleButtonsInside(root) {
    if (!(root instanceof HTMLElement)) return [];
    return Array.from(root.querySelectorAll('button')).filter(isVisibleElement);
  }

  function firstDirectChildContaining(root, node) {
    if (!(root instanceof HTMLElement) || !(node instanceof HTMLElement)) return null;
    let current = node;
    while (current.parentElement && current.parentElement !== root) {
      current = current.parentElement;
    }
    return current.parentElement === root ? current : null;
  }

  function findRightButtonGroup(actionRow, anchor) {
    if (!(actionRow instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return null;

    // 현재 크랙/다른 확프 구성처럼 마지막 직계 자식 하나가
    // 클립보드·보기·✨·전송 버튼 묶음을 품는 구조를 우선한다.
    if (!anchor.matches('button') && visibleButtonsInside(anchor).length >= 2) return anchor;

    const children = Array.from(actionRow.children || []).filter((child) => (
      child instanceof HTMLElement && child.id !== ID.wrap
    ));

    for (let i = children.length - 1; i >= 0; i -= 1) {
      const child = children[i];
      if (!child.matches('button') && visibleButtonsInside(child).length >= 2) return child;
    }

    return null;
  }

  function ensurePositioningHost(host) {
    if (!(host instanceof HTMLElement)) return;

    // position:static인 flex 그룹에만 기준점을 부여한다.
    // relative는 일반 배치 크기/순서를 바꾸지 않으므로 버튼 확프와 충돌하지 않는다.
    if (getComputedStyle(host).position === 'static') {
      host.style.setProperty('position', 'relative', 'important');
      host.dataset.cicPositionHost = 'true';
    }
  }

  function ensureCounterPlacement(editor) {
    const actionRow = findActionRow(editor);
    if (!actionRow) return null;

    let wrap = document.getElementById(ID.wrap);
    let countEl = document.getElementById(ID.count);

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = ID.wrap;
      wrap.setAttribute('aria-hidden', 'true');
    }

    if (!countEl) {
      countEl = document.createElement('span');
      countEl.id = ID.count;
      countEl.textContent = '0';
    }

    if (!wrap.contains(countEl)) wrap.replaceChildren(countEl);

    /*
     * v1.0.6 핵심
     * 메모장/✨/기타 확프의 DOM 그룹 존재 여부를 위치 기준으로 쓰지 않는다.
     *
     * 1) 입력창 하단 actionRow 자체를 좌표 기준으로 삼는다.
     * 2) 왼쪽 툴바(space-x-2 계열)는 제외한다.
     * 3) 남은 '전송 쪽 버튼들' 중 가장 오른쪽 버튼을 전송 버튼으로 본다.
     * 4) 그 전송 버튼의 중앙 바로 위 4px에 카운터를 절대좌표로 둔다.
     *
     * 따라서 다른 확프 버튼이 전송 버튼 왼쪽에 추가되어도
     * 카운터는 항상 전송 버튼 위쪽을 따라간다.
     */
    ensurePositioningHost(actionRow);

    if (wrap.parentNode !== actionRow) {
      actionRow.prepend(wrap);
    }

    const directChildren = Array.from(actionRow.children || []).filter(
      (child) => child instanceof HTMLElement && child.id !== ID.wrap
    );

    const leftToolbar = directChildren.find((child) => (
      child.classList.contains('space-x-2')
      || !!child.querySelector?.('.space-x-2')
    )) || null;

    let rightButtons = Array.from(actionRow.querySelectorAll('button')).filter((button) => {
      if (!(button instanceof HTMLElement)) return false;
      if (!isVisibleElement(button)) return false;
      if (wrap.contains(button)) return false;
      if (leftToolbar && leftToolbar.contains(button)) return false;
      return true;
    });

    /*
     * 혹시 크랙 DOM이 바뀌어 왼쪽 툴바를 못 잡았더라도,
     * 가장 오른쪽 버튼(보통 전송)을 기준으로 같은 높이에 있는 버튼만 남긴다.
     */
    if (rightButtons.length > 0) {
      const rightmostButton = rightButtons.reduce((best, button) => {
        if (!best) return button;
        return button.getBoundingClientRect().right > best.getBoundingClientRect().right
          ? button
          : best;
      }, null);

      const sendRect = rightmostButton.getBoundingClientRect();
      const sendCenterY = sendRect.top + sendRect.height / 2;

      const sameRowButtons = rightButtons.filter((button) => {
        const rect = button.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        return Math.abs(centerY - sendCenterY) <= 12;
      });

      if (sameRowButtons.length > 0) rightButtons = sameRowButtons;
    }

    if (rightButtons.length === 0) return null;

    const rowRect = actionRow.getBoundingClientRect();

    const sendButton = rightButtons.reduce((best, button) => {
      if (!best) return button;
      return button.getBoundingClientRect().right > best.getBoundingClientRect().right
        ? button
        : best;
    }, null);

    if (!sendButton) return null;

    const sendRect = sendButton.getBoundingClientRect();
    const centerX = sendRect.left + sendRect.width / 2;
    const left = centerX - rowRect.left;
    const top = sendRect.top - rowRect.top - 4;

    if (wrap.style.getPropertyValue('--cic-left') !== `${left}px`) wrap.style.setProperty('--cic-left', `${left}px`);
    if (wrap.style.getPropertyValue('--cic-top') !== `${top}px`) wrap.style.setProperty('--cic-top', `${top}px`);

    return countEl;
  }

  /*****************************************************************
   * 색상/초과 알림
   *****************************************************************/
  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  function warningColor(count) {
    if (count < YELLOW_START) return '';
    if (count >= LIMIT) return '#ef4444';

    if (count < ORANGE_START) {
      const t = (count - YELLOW_START) / (ORANGE_START - YELLOW_START);
      const hue = lerp(47, 30, t);
      const light = lerp(48, 52, t);
      return `hsl(${hue.toFixed(1)} 92% ${light.toFixed(1)}%)`;
    }

    const t = (count - ORANGE_START) / (LIMIT - ORANGE_START);
    const hue = lerp(30, 0, t);
    const light = count >= HOT_START ? lerp(52, 48, (count - HOT_START) / (LIMIT - HOT_START)) : 52;
    return `hsl(${hue.toFixed(1)} 91% ${Math.max(48, light).toFixed(1)}%)`;
  }

  function alertOverLimit(countEl) {
    countEl.classList.remove('cic-over-pulse');
    void countEl.offsetWidth;
    countEl.classList.add('cic-over-pulse');

    window.setTimeout(() => {
      countEl.classList.remove('cic-over-pulse');
    }, 560);

    try {
      if (typeof navigator.vibrate === 'function') {
        navigator.vibrate([35, 30, 55]);
      }
    } catch (_) {
      // 데스크톱/미지원 브라우저에서는 시각적 흔들림만 사용한다.
    }
  }

  function renderCount() {
    state.updateFrame = 0;

    const editor = state.editor && document.contains(state.editor) ? state.editor : findEditor();
    if (!editor) return;

    if (editor !== state.editor) bindEditor(editor);

    const countEl = ensureCounterPlacement(editor);
    if (!countEl) return;

    const count = countCharacters(getEditorText(editor));
    const label = count.toLocaleString('ko-KR');
    const title = `현재 ${label}자 · 최대 ${LIMIT.toLocaleString('ko-KR')}자`;
    if (countEl.textContent !== label) countEl.textContent = label;
    if (countEl.title !== title) countEl.title = title;

    const color = warningColor(count);
    if (color) {
      if (countEl.style.getPropertyValue('--cic-color') !== color) countEl.style.setProperty('--cic-color', color);
    } else if (countEl.style.getPropertyValue('--cic-color')) countEl.style.removeProperty('--cic-color');

    if (countEl.dataset.empty !== String(count === 0)) countEl.dataset.empty = String(count === 0);
    if (countEl.dataset.warning !== String(count >= YELLOW_START)) countEl.dataset.warning = String(count >= YELLOW_START);
    if (countEl.dataset.limit !== String(count >= LIMIT)) countEl.dataset.limit = String(count >= LIMIT);

    // 처음 연결했을 때 이미 초과된 임시저장 글이라면 갑자기 울리지 않는다.
    if (state.previousCount !== null && state.previousCount <= LIMIT && count > LIMIT) {
      alertOverLimit(countEl);
    }

    state.previousCount = count;
  }

  function scheduleRender() {
    if (state.updateFrame) return;
    state.updateFrame = requestAnimationFrame(renderCount);
  }

  /*****************************************************************
   * 이벤트 연결/SPA 재탐색
   *****************************************************************/
  function bindEditor(editor) {
    if (!(editor instanceof HTMLElement)) return;
    if (editor === state.editor) return;

    if (state.editorObserver) {
      state.editorObserver.disconnect();
      state.editorObserver = null;
    }

    state.editor = editor;
    state.previousCount = null;

    editor.addEventListener('input', scheduleRender, true);
    editor.addEventListener('keyup', scheduleRender, true);
    editor.addEventListener('cut', () => setTimeout(scheduleRender, 0), true);
    editor.addEventListener('paste', () => setTimeout(scheduleRender, 0), true);
    editor.addEventListener('compositionend', scheduleRender, true);

    // 전송 후 React가 입력창을 비우거나 임시저장 확프가 내용을 복구하는 경우까지 추적한다.
    state.editorObserver = new MutationObserver(scheduleRender);
    state.editorObserver.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleRender();
  }

  function ensure(forceFind = false) {
    if (document.hidden) return;
    injectStyle();
    const cached = state.editor;
    const editor = !forceFind && cached?.isConnected &&
      cached.matches('.__chat_input_textarea') && isVisibleElement(cached) ? cached : findEditor();
    if (!editor) return;
    if (editor !== state.editor) bindEditor(editor);
    // renderCount already performs placement; do not measure the same row twice.
    scheduleRender();
  }

  function hookHistory() {
    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function' || original.__cicWrapped) return;

      function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        setTimeout(() => ensure(true), 0);
        return result;
      }

      wrappedHistoryMethod.__cicWrapped = true;
      history[methodName] = wrappedHistoryMethod;
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');
    window.addEventListener('popstate', () => setTimeout(() => ensure(true), 0));
  }

  injectStyle();
  hookHistory();
  ensure();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensure(true); });
  window.setInterval(ensure, SCAN_INTERVAL_MS);
})();