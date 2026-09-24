// ==UserScript==
// @name         🧷 Edit Paste Linebreak Fix (수정창 줄바꿈 보존)
// @namespace    crack-edit-paste-linebreak-fix
// @version      0.2.0
// @downloadURL  https://gist.github.com/chyoyam-alt/ef141cc873845eac8005dbfc27ae6653/raw/PasteLinebreakFix.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/ef141cc873845eac8005dbfc27ae6653/raw/PasteLinebreakFix.user.js
// @description  Crack의 Tiptap/ProseMirror 수정창에서 전문 붙여넣기 시 원본 줄바꿈 수를 그대로 보존합니다.
// @match        https://crack.wrtn.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const PREFIX = '[Crack Edit Paste Fix]';

  function normalizeText(value) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u0000/g, '');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function isVisible(el) {
    if (!(el instanceof HTMLElement) || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function buttonText(el) {
    return String(el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function hasEditDoneButton(root) {
    if (!(root instanceof Element)) return false;
    return Array.from(root.querySelectorAll('button, [role="button"]'))
      .some(el => isVisible(el) && buttonText(el) === '수정 완료');
  }

  function findEditorFromEventTarget(target) {
    if (!(target instanceof Element)) return null;

    const direct = target.closest?.(
      '.tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"]'
    );
    if (direct) return direct;

    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.matches?.('.tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"]')
    ) {
      return active;
    }

    return null;
  }

  function isCrackEditEditor(editor) {
    if (!(editor instanceof HTMLElement)) return false;

    if (!editor.matches(
      '.tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"]'
    )) {
      return false;
    }

    const dialog = editor.closest('[role="dialog"]');
    if (dialog && hasEditDoneButton(dialog)) return true;

    let node = editor.parentElement;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      if (hasEditDoneButton(node)) return true;
    }

    const visibleEditors = Array.from(
      document.querySelectorAll(
        '.tiptap.ProseMirror[contenteditable="true"], .ProseMirror[contenteditable="true"]'
      )
    ).filter(isVisible);

    const visibleDone = Array.from(
      document.querySelectorAll('button, [role="button"]')
    ).some(el => isVisible(el) && buttonText(el) === '수정 완료');

    return visibleDone && visibleEditors.length === 1 && visibleEditors[0] === editor;
  }

  /*
   * 핵심:
   * 절대로 줄마다 <p>를 만들지 않는다.
   *
   * Crack 저장기가 ProseMirror의 paragraph 경계를 빈 줄로 직렬화하는 것으로 보여,
   * 전문 전체를 하나의 <p> 안에 두고 원문의 모든 개행을 <br>로 표현한다.
   *
   * 원문:
   * A
   * B
   *
   * C
   *
   * DOM:
   * <p>A<br>B<br><br>C</p>
   */
  function plainTextToSingleParagraphHtml(text) {
    const value = normalizeText(text);

    if (value === '') {
      return '<p><br></p>';
    }

    return `<p>${value.split('\n').map(escapeHtml).join('<br>')}</p>`;
  }

  function insertHtmlAtSelection(editor, html, plainText) {
    editor.focus();

    try {
      if (document.queryCommandSupported?.('insertHTML')) {
        const ok = document.execCommand('insertHTML', false, html);
        if (ok) return true;
      }
    } catch (error) {
      console.warn(PREFIX, 'insertHTML 실패, fallback 사용', error);
    }

    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return false;

      range.deleteContents();

      const template = document.createElement('template');
      template.innerHTML = html;

      const fragment = template.content;
      const lastNode = fragment.lastChild;
      range.insertNode(fragment);

      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      try {
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          composed: true,
          inputType: 'insertFromPaste',
          data: plainText,
        }));
      } catch (_) {
        editor.dispatchEvent(new Event('input', {
          bubbles: true,
          composed: true,
        }));
      }

      return true;
    } catch (error) {
      console.error(PREFIX, 'fallback 삽입 실패', error);
      return false;
    }
  }

  function handlePaste(event) {
    const editor = findEditorFromEventTarget(event.target);
    if (!editor || !isCrackEditEditor(editor)) return;

    const clipboard = event.clipboardData;
    if (!clipboard) return;

    const plain = normalizeText(clipboard.getData('text/plain'));

    // 이미지/파일 붙여넣기, 단일 한 줄 텍스트는 Crack 기본 동작 유지.
    if (!plain || !plain.includes('\n')) return;

    const html = plainTextToSingleParagraphHtml(plain);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ok = insertHtmlAtSelection(editor, html, plain);

    if (ok) {
      console.debug(PREFIX, 'v0.2.0 단일 문단 줄바꿈 보존 적용');
    } else {
      console.warn(PREFIX, '보정 붙여넣기 실패');
    }
  }

  // ProseMirror의 기본 paste 처리보다 먼저 가로챈다.
  document.addEventListener('paste', handlePaste, true);

  console.debug(PREFIX, 'loaded v0.2.0');
})();