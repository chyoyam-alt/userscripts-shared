// ==UserScript==
// @name         🪛 크랙 모바일 화면 잘림 방지
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  레이아웃 유지하며 순정 마크다운 코드블록 줄바꿈 누락 수정
// @author       사용자
// @match        *://crack.wrtn.ai/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.innerHTML = `
        /* 1. KaTeX 수식/색상 폰트 해체 (정상 작동) */
        .katex, .katex-display, .katex-html { display: inline !important; }
        .katex-html * { display: inline !important; white-space: pre-wrap !important; word-break: break-all !important; }
        .katex .strut, .katex-mathml { display: none !important; }

        /* 2. 부모 상자 강제 늘림 방지 */
        .wrtn-codeblock, .wrtn-codeblock * {
            min-width: 0 !important;
        }

        /* 3. 특수 코드블록(Shiki) 텍스트 강제 줄바꿈 (정상 작동) */
        .wrtn-codeblock pre, .wrtn-codeblock code, .shiki, .shiki .line {
            white-space: pre-wrap !important;
            word-break: break-all !important;
            overflow-wrap: anywhere !important;
        }
        .shiki .line {
            display: inline-block !important;
            width: 100% !important;
        }

        /* 4. [복구됨] 순정 마크다운 코드블록 강제 줄바꿈 */
        .wrtn-markdown pre, .wrtn-markdown code {
            white-space: pre-wrap !important;
            word-break: break-all !important;
            overflow-wrap: anywhere !important;
            max-width: 100% !important;
        }
    `;
    document.head.appendChild(style);
})();