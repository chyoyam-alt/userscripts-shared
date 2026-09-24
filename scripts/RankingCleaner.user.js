// ==UserScript==
// @name         🏆 Crack Ranking Cleaner (랭킹 클리너)
// @namespace    crack-ranking-cleaner
// @version      0.1.4
// @description  상세 페이지 사용자 랭킹 제거
// @author       GPT
// @downloadURL  https://gist.github.com/chyoyam-alt/0131998e50ef7e998b78d61aa0121ab7/raw/RankingCleaner.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/0131998e50ef7e998b78d61aa0121ab7/raw/RankingCleaner.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const NS = 'crc';
  const HIDE_ATTR = 'data-crc-ranking-hidden';
  const DIVIDER_HIDE_ATTR = 'data-crc-ranking-divider-hidden';
  const STYLE_ID = `${NS}-style`;
  const SCAN_DELAY = 80;

  let scheduled = false;
  let observer = null;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      section[${HIDE_ATTR}="1"],
      [${DIVIDER_HIDE_ATTR}="1"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function textOf(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hasExactText(root, selector, wanted) {
    return Array.from(root.querySelectorAll(selector)).some((el) => textOf(el) === wanted);
  }

  function hasAllRankingTabs(root) {
    const texts = Array.from(root.querySelectorAll('button,[role="tab"]')).map(textOf);
    return texts.includes('주간') && texts.includes('일간') && texts.includes('누적');
  }

  function isRankingSection(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName !== 'SECTION') return false;

    const hasTitle = hasExactText(el, 'h1,h2,h3,h4', '사용자 랭킹');
    if (!hasTitle) return false;

    return hasAllRankingTabs(el);
  }

  function isHorizontalDivider(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName !== 'DIV') return false;
    if (el.getAttribute('data-orientation') !== 'horizontal') return false;
    if (el.getAttribute('role') !== 'none') return false;

    const cls = String(el.className || '');
    return (
      cls.includes('shrink-0') &&
      cls.includes('bg-border') &&
      cls.includes('w-full')
    );
  }

  function hideOneAdjacentDivider(section) {
    if (!(section instanceof HTMLElement)) return false;

    const prev = section.previousElementSibling;
    const next = section.nextElementSibling;

    // 랭킹 섹션을 숨기면 보통 양옆 구분선이 붙어서 "줄 하나 더"처럼 보임.
    // 둘 다 지우면 섹션 간 구분선 자체가 사라질 수 있으니, 딱 하나만 숨긴다.
    const target = isHorizontalDivider(next)
      ? next
      : isHorizontalDivider(prev)
        ? prev
        : null;

    if (!target) return false;
    if (target.getAttribute(DIVIDER_HIDE_ATTR) === '1') return false;

    target.setAttribute(DIVIDER_HIDE_ATTR, '1');
    target.style.setProperty('display', 'none', 'important');
    target.style.setProperty('visibility', 'hidden', 'important');
    target.style.setProperty('pointer-events', 'none', 'important');
    return true;
  }

  function hideRankingSection(el) {
    if (!(el instanceof HTMLElement)) return false;

    hideOneAdjacentDivider(el);

    if (el.getAttribute(HIDE_ATTR) === '1') return false;

    el.setAttribute(HIDE_ATTR, '1');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    return true;
  }

  function looksLikeRankingPopup(el) {
    if (!(el instanceof HTMLElement)) return false;

    const role = el.getAttribute('role');
    const isDialogLike =
      role === 'dialog' ||
      role === 'alertdialog' ||
      el.hasAttribute('data-radix-dialog-content');

    if (!isDialogLike) return false;

    const body = textOf(el);
    return (
      body.includes('사용자 랭킹') &&
      body.includes('주간') &&
      body.includes('일간') &&
      body.includes('누적')
    );
  }

  function findLikelyRadixPortal(el) {
    let cur = el;

    for (let i = 0; i < 4 && cur && cur.parentElement && cur.parentElement !== document.body; i += 1) {
      cur = cur.parentElement;
    }

    if (cur && cur.parentElement === document.body) {
      return cur;
    }

    return el;
  }

  function removeRankingPopup(dialog) {
    if (!(dialog instanceof HTMLElement)) return false;

    const portal = findLikelyRadixPortal(dialog);

    const id = portal.id || '';
    const tag = portal.tagName;
    if (id === '__next' || id === 'root' || tag === 'MAIN') return false;

    const parent = portal.parentElement;
    const siblings = parent ? Array.from(parent.children) : [];

    portal.remove();

    for (const sib of siblings) {
      if (!(sib instanceof HTMLElement)) continue;
      if (sib === portal) continue;

      const role = sib.getAttribute('role');
      const cls = String(sib.className || '');
      const txt = textOf(sib);

      const overlayLike =
        sib.hasAttribute('data-radix-dialog-overlay') ||
        (
          sib.getAttribute('data-state') === 'open' &&
          (
            cls.includes('fixed') ||
            cls.includes('inset-0') ||
            cls.includes('z-') ||
            role === 'presentation'
          )
        );

      const emptyOrRankingRelated = !txt || txt.includes('사용자 랭킹');

      if (overlayLike && emptyOrRankingRelated && sib.parentElement === parent) {
        sib.remove();
      }
    }

    document.body.style.removeProperty('pointer-events');
    document.body.style.removeProperty('overflow');

    return true;
  }

  function cleanupRankingPopups(root = document) {
    if (!root.querySelectorAll) return 0;

    let count = 0;
    const dialogs = root.querySelectorAll('[role="dialog"],[role="alertdialog"],[data-radix-dialog-content]');

    for (const dialog of dialogs) {
      if (looksLikeRankingPopup(dialog)) {
        if (removeRankingPopup(dialog)) count += 1;
      }
    }

    return count;
  }

  function hideRankingSections(root = document) {
    if (!root.querySelectorAll) return 0;

    let count = 0;

    for (const section of root.querySelectorAll('section')) {
      if (isRankingSection(section)) {
        if (hideRankingSection(section)) count += 1;
      }
    }

    count += cleanupRankingPopups(root);

    return count;
  }

  function findRankingSectionFromButton(button) {
    if (!(button instanceof HTMLElement)) return null;
    if (textOf(button) !== '전체보기') return null;

    const section = button.closest('section');
    if (!section) return null;

    return isRankingSection(section) ? section : null;
  }

  function blockRankingMoreEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('button');
    const section = findRankingSectionFromButton(button);
    if (!section) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    hideRankingSection(section);
    scheduleScan();
  }

  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;

    window.setTimeout(() => {
      scheduled = false;
      injectStyle();
      hideRankingSections(document);
    }, SCAN_DELAY);
  }

  function startObserver() {
    if (observer) return;

    observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }

      if (shouldScan) scheduleScan();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function hookHistory() {
    const fire = () => {
      window.dispatchEvent(new Event(`${NS}:routechange`));
      scheduleScan();
    };

    const rawPush = history.pushState;
    const rawReplace = history.replaceState;

    history.pushState = function patchedPushState(...args) {
      const ret = rawPush.apply(this, args);
      fire();
      return ret;
    };

    history.replaceState = function patchedReplaceState(...args) {
      const ret = rawReplace.apply(this, args);
      fire();
      return ret;
    };

    window.addEventListener('popstate', fire, true);
    window.addEventListener(`${NS}:routechange`, scheduleScan, true);
  }

  function boot() {
    injectStyle();

    document.addEventListener('pointerdown', blockRankingMoreEvent, true);
    document.addEventListener('mousedown', blockRankingMoreEvent, true);
    document.addEventListener('touchstart', blockRankingMoreEvent, true);
    document.addEventListener('click', blockRankingMoreEvent, true);

    hookHistory();
    startObserver();

    scheduleScan();
    window.setTimeout(scheduleScan, 250);
    window.setTimeout(scheduleScan, 700);
    window.setTimeout(scheduleScan, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    injectStyle();
  } else {
    boot();
  }
})();
