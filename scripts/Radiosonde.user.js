// ==UserScript==
// @name         📡 Crack Radiosonde (라디오존데)
// @namespace    igx-radiosonde-live
// @version      4.3.4
// @description  크랙(wrtn) 입력창에 Fable 5와 최신 IGX 라디오존데 모델 점수를 표시합니다.
// @match        https://crack.wrtn.ai/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      rs.igx.kr
// @connect      claude-radiosonde.chyoyam.chatgpt.site
// ==/UserScript==

(() => {
  "use strict";

  /**
   * 4.3.4 - 공식 v2 simple API 우선 사용, 통계 모델 ID 전달 및 최신 기록 선택 수정
   * - 대시보드 한국어 초 파싱 수정, 내부 지연시간 단위 ms로 통일
   *
   * 4.3.3 - 신규 API 응답시간 보충 병합
   * - 새 current/status API가 점수만 반환해도 응답시간이 사라지지 않도록 통계 계열 데이터를 보충 병합
   * - 응답시간/TPS가 비어 있을 때만 보충 조회하며 5분 캐시로 불필요한 호출 방지
   * - OpenAPI에서 statistics/history/metrics 계열 경로를 자동 탐색해 신규 API 변경에도 대응
   * - latency/ttft/response_time의 sec/ms/value/avg 변형 필드 추가 지원
   * - 기본 점수/상태는 새 API 값을 유지하고 보충 데이터는 빈 metric만 채움
   *

   * 4.3.2 - 초기화 순서 치명 오류 수정
   * - looksLikeModelSlug/NON_MODEL_SLUGS를 초기 모델 로딩보다 먼저 정의하도록 이동
   * - v4.3.1에서 시작 직후 ReferenceError로 전체 스크립트가 중단되던 문제 수정
   * - 모델 오인식 방지 로직은 그대로 유지
   *
   * 4.3.1 - 모델 자동탐색 오인식 수정
   * - API 응답의 statistics/status/data/summary 같은 메타 키를 모델 slug로 오인하던 문제 수정
   * - 실제 모델처럼 보이는 slug만 자동탐색 대상으로 허용
   * - bulk API에서 정상 모델이 2개 이상 확인되지 않으면 탐색 성공으로 처리하지 않음
   * - 비정상 탐색 결과로 기존 모델 목록 전체가 사라지지 않도록 fallback 보호
   * - v4.3.0에서 오염된 모델 캐시를 자동 무효화
   *
   * 4.3.0 - IGX 신규 API 대응 + 자동 복구
   * - /docs(OpenAPI) 기준으로 현재 GET 엔드포인트를 런타임 탐색하여 API 경로 변경에 대응
   * - 신규 bulk/current/status 계열 응답을 우선 사용하고 응답 필드명 차이를 자동 정규화
   * - OpenAPI/API가 다시 변경되거나 일시 실패하면 공식 대시보드 HTML에서 현재 수치를 복구
   * - 기존 /api/simple/{model}, /api/statistics는 최후 폴백으로만 유지
   * - 공식 라디오존데 현재 모델 목록에 맞춰 fallback 갱신
   * - GPT 5.6 Sol/Terra/Luna가 설정창에서 모두 "GPT 5.6"으로 겹치던 표시 수정
   *
   * 4.2.1 - 모델 그룹 전체 ON/OFF 추가
   * - Fable/Opus/GPT/Gemini/Sonnet/Haiku/기타 그룹 제목의 체크박스로 그룹 전체 표시 전환
   * - 일부 모델만 선택된 그룹은 그룹 체크박스를 중간 상태(indeterminate)로 표시
   * - 개별 모델 체크 변경 시 그룹 체크 상태를 즉시 동기화
   *
   * 4.2.0 - YAME 정리 + 모델 설정 그룹화
   * - YAME 라디오존데는 현재 제공되는 Fable 5만 유지
   * - 설정 메뉴를 Fable/Opus/GPT/Gemini/Sonnet/Haiku/기타 자동 분류 2열 구조로 변경
   * - IGX statistics 기반 자동 모델 탐색/추가는 그대로 유지
   *
   * 4.1.1 - YAME 상태불을 점수 구간색과 동기화
   * - YAME 모델의 상태 점과 점수 숫자가 같은 색을 사용
   *
   * 4.1.0 - 입력창 인라인 전용 구조로 정리
   * - 세로 카드/가로 팝업/드래그/고정 전환 제거
   * - 입력창 라디오존데의 ↗ 버튼을 설정 톱니바퀴로 교체
   * - 설정 팝업에서 모델 표시 여부와 응답시간 표시를 제어
   * - 화면에 보이는 YAME 접미사 제거
   *
   * 4.0.2 - init-order fix for YAME score bands
   * - initialize YAME_SCORE_BANDS before the first renderBarline call
   *
   * 4.0.1 - YAME 점수 구간 색상 수정
   * - YAME 상태색(normal/slow/error)과 점수색(excellent/good/fair/poor)을 분리
   * - 세로 카드와 가로/인라인 바의 점수 숫자에 YAME 원본 구간색 적용
   *
   * 4.0.0 - YAME 라디오존데 추가
   * - Fable 5 → Claude Opus 5 → Claude Opus 4.8 순서로 상단 표시
   * - YAME 공개 status API는 갱신당 1회만 호출하고 세 모델 데이터를 함께 반영
   * - 기존 IGX 자동 모델 탐색/표시와 병행
   * - 푸터에 YAME/IGX 원문 링크 분리
   *
   * 3.9.7 - 큰 입력창에서 라디오존데 인라인 위치 안정화
   * - 55vh를 넘었다는 이유로 정상 인라인 부모를 버리던 조건 제거
   * - 현재 부모가 입력창을 포함하면 높이와 관계없이 그대로 유지
   * - 채팅창 높이 조절 확프의 즉시 동기화 이벤트 지원
   *
   * 3.9.6 - PC에서 채팅창 고정 해제 후 팝업이 마우스를 따라다니는 문제 수정
   * - 드래그 종료 시 dragging 상태가 false로 돌아가지 않던 누락 보완
   *
   * 3.9.5 - 채팅방 외 화면에서 팝업/인라인/갱신 비활성화
   *
   * 3.9.4 - 전체 코드 정리 및 경량화
   * - 중복 드래그 이벤트 제거(Pointer 우선, 미지원 환경만 Touch/Mouse 폴백)
   * - 드래그 중 localStorage 연속 쓰기 제거, 드래그 종료 시 한 번만 위치 저장
   * - 인라인 재탐색 시 불필요한 전역 DOM 정리/클래스 재적용 최소화
   * - resize 이벤트 requestAnimationFrame 단위 제한
   * - 숨겨진 탭에서는 1분 상태 조회를 건너뛰고 복귀 시 즉시 갱신
   * - 모델 UI 생성 시 DocumentFragment 사용, 반복 querySelector 축소
   * - 모델 캐시 savedAt 및 단발 호출용 discoverBusy 등 죽은 코드 제거
   * - statistics 기록 시간이 없거나 72시간을 넘긴 모델 제외를 명확화
   *
   * 3.9.3 - 새로고침 버튼의 모델 목록 재확인 및 10분 쿨타임 제거
   * - ↻ 버튼은 현재 모델의 실시간 신호만 즉시 갱신
   * - 모델 목록은 페이지 시작 시 1회만 확인
   *
   * 3.9.2 - 모델 목록 확인을 페이지 시작 시 1회로 변경
   * - 장시간 열린 탭의 6시간 주기 statistics 재확인 제거
   * - 마지막 측정 기록이 72시간 이내인 모델만 현재 목록으로 채택
   * - 과거 측정 데이터는 저장하지 않고 모델 메타 목록만 실패 대비용으로 캐시
   *
   * 3.9.1 - 인라인 재탐색/화면 갱신 시 설정창이 자동으로 닫히는 문제 수정
   *
   * 3.9.0 - IGX statistics 기반 모델 자동 추가/제거
   * - 새 모델 slug를 자동으로 이름/약자로 변환
   * - Gemini 3 Pro / 2.5 Flash / 2.5 Flash Lite 제외
   * - 모델 목록은 6시간 캐시, 수동 갱신 시 최대 10분에 한 번 재확인
   * - 목록 조회 실패 시 마지막 정상 목록 또는 기존 5개 모델 사용
   *
   * 3.8.2 - 모바일 네트워크 대응: 타임아웃 완화/실패 재시도/직전 값 유지/복귀 시 즉시 갱신
   *
   * 3.8.1
   * - 3.8.0의 과한 MutationObserver 제거
   * - 모바일 부담 줄이기 위해 전체 DOM 상시 감시 금지
   * - 채팅창 고정 시 textarea뿐 아니라 ProseMirror/contenteditable 입력창도 탐색
   * - 고정 위치를 못 찾으면 화면 맨 위로 튀지 않고 팝업 모드 유지
   * - inline 재탐색은 고정 모드 요청 상태에서만 낮은 빈도로 수행
   */

  const YAME_MODELS = [
    { slug: "yame-fable5", apiId: "fable5", source: "yame", label: "Fable 5.0", short: "F5" },
  ];

  const FALLBACK_MODELS = [
    { slug: "claude-fable-5.1", source: "igx", label: "Claude Fable 5.1", short: "F5.1" },
    { slug: "claude-opus-5", source: "igx", label: "Claude Opus 5", short: "O5" },
    { slug: "claude-opus-4.8", source: "igx", label: "Claude Opus 4.8", short: "O4.8" },
    { slug: "claude-opus-4.7", source: "igx", label: "Claude Opus 4.7", short: "O4.7" },
    { slug: "claude-opus-4.6", source: "igx", label: "Claude Opus 4.6", short: "O4.6" },
    { slug: "claude-sonnet-5", source: "igx", label: "Claude Sonnet 5", short: "S5" },
    { slug: "gemini-3.1-pro-preview", source: "igx", label: "Gemini 3.1 Pro Preview", short: "G3.1P" },
    { slug: "gemini-2.5-pro", source: "igx", label: "Gemini 2.5 Pro", short: "G2.5P" },
    { slug: "gemini-3.6-flash", source: "igx", label: "Gemini 3.6 Flash", short: "G3.6F" },
    { slug: "gemini-3.5-flash", source: "igx", label: "Gemini 3.5 Flash", short: "G3.5F" },
    { slug: "gemini-3.5-flash-lite", source: "igx", label: "Gemini 3.5 Flash Lite", short: "G3.5FL" },
    { slug: "gpt-5.6-sol", source: "igx", label: "ChatGPT 5.6 Sol", short: "G5.6S" },
    { slug: "gpt-5.6-terra", source: "igx", label: "ChatGPT 5.6 Terra", short: "G5.6T" },
    { slug: "gpt-5.6-luna", source: "igx", label: "ChatGPT 5.6 Luna", short: "G5.6L" },
  ];

  const EXCLUDED_MODELS = new Set([
    "gemini-3-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ]);

  const NON_MODEL_SLUGS = new Set([
    "statistics", "statistic", "stats",
    "status", "state", "health",
    "summary", "overview",
    "data", "result", "results",
    "models", "model",
    "metrics", "metric",
    "history", "latest", "current",
    "latency", "score", "tps",
    "api", "meta", "metadata",
  ]);

  function slugLooksValid(value) {
    return /^[a-z0-9][a-z0-9._-]*$/i.test(String(value || "").trim());
  }

  function looksLikeModelSlug(value) {
    const slug = String(value || "").trim().toLowerCase();
    if (!slugLooksValid(slug)) return false;
    if (EXCLUDED_MODELS.has(slug) || NON_MODEL_SLUGS.has(slug)) return false;
    if (!slug.includes("-") || !/\d/.test(slug)) return false;
    if (/^(?:api|stats?|statistics|status|summary|metrics?|history|latest|current|health|data|results?)-/i.test(slug)) return false;
    return true;
  }

  const MODEL_OVERRIDES = new Map(
    FALLBACK_MODELS.map(model => [model.slug, model])
  );

  let MODELS = [];

  const IGX_BASE_URL = "https://rs.igx.kr";
  const IGX_DOCS_URL = `${IGX_BASE_URL}/docs`;
  const IGX_OPENAPI_URL = `${IGX_BASE_URL}/openapi.json`;
  const IGX_DASHBOARD_URL = `${IGX_BASE_URL}/`;
  const LEGACY_API_BASE = `${IGX_BASE_URL}/api/simple/`;
  const LEGACY_STATISTICS_URL = `${IGX_BASE_URL}/api/statistics`;
  const YAME_STATUS_URL = "https://claude-radiosonde.chyoyam.chatgpt.site/api/v1/status";
  const POLL_MS = 60 * 1000;
  const ACTIVE_MODEL_WINDOW_MS = 72 * 60 * 60 * 1000;
  const VALID_STATUSES = new Set(["active", "degraded", "impacted"]);

  const STORE_KEY_VISIBILITY = "igx_rs_popup_vis_v3";
  const STORE_KEY_MODELS = "igx_rs_models_v3";
  const STORE_KEY_LATENCY = "igx_rs_show_latency_v1";
  const INLINE_RETRY_MS = 1800;

  const COMPOSER_SELECTORS = [
    ".tiptap.ProseMirror",
    "[contenteditable='true'].ProseMirror",
    "[contenteditable='true'][data-placeholder]",
    "textarea[placeholder='메시지 보내기']",
    "textarea[placeholder*='메시지']"
  ];

  function isIgxChatRoomPage() {
    const path = location.pathname || "";
    return /\/stories\/[^/?#]+\/episodes\/[^/?#]+/.test(path) ||
      /\/episodes\/[^/?#]+/.test(path) ||
      /\/chats?\/[^/?#]+/.test(path);
  }

  GM_addStyle(`
    #igx-live-popup,
    #igx-live-settings {
      --text-title: rgba(255, 255, 255, .85);
      --text-name: rgba(255, 255, 255, .88);
      --text-unknown: rgba(255, 255, 255, .72);
      --btn-border: rgba(255, 255, 255, .14);
      --btn-bg: rgba(255, 255, 255, .06);
      --btn-bg-hover: rgba(255, 255, 255, .12);
      --panel-bg: rgba(20, 20, 20, .96);
      --panel-border: rgba(255, 255, 255, .14);
      --row-border: rgba(255, 255, 255, .09);
      --c-active: #3ddc84;
      --c-degraded: #ffd54a;
      --c-impacted: #ff5c5c;
      --c-unknown: #9aa0a6;
      --y-score-excellent: #74c78f;
      --y-score-good: #74c78f;
      --y-score-fair: #aaa06b;
      --y-score-poor: #ce875f;
      --y-score-error: #ef655c;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", Arial;
      color: var(--text-title);
      box-sizing: border-box;
    }

    #igx-live-popup.igx-light,
    #igx-live-settings.igx-light {
      --text-title: rgba(0, 0, 0, .85);
      --text-name: rgba(0, 0, 0, .82);
      --text-unknown: rgba(0, 0, 0, .62);
      --btn-border: rgba(0, 0, 0, .13);
      --btn-bg: rgba(0, 0, 0, .05);
      --btn-bg-hover: rgba(0, 0, 0, .10);
      --panel-bg: rgba(250, 250, 250, .97);
      --panel-border: rgba(0, 0, 0, .14);
      --row-border: rgba(0, 0, 0, .09);
      --c-active: #1da851;
      --c-degraded: #d49500;
      --c-impacted: #e03535;
      --c-unknown: #7b8086;
      --y-score-excellent: #2f8f50;
      --y-score-good: #2f8f50;
      --y-score-fair: #897d35;
      --y-score-poor: #b85e2d;
      --y-score-error: #d9433b;
    }

    .igx-inline-overlay-host {
      position: relative !important;
    }

    #igx-live-popup {
      position: absolute !important;
      top: 6px !important;
      left: 0 !important;
      right: 0 !important;
      width: auto !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      transform: none !important;
      z-index: 3 !important;
      overflow: visible !important;
      pointer-events: none !important;
      user-select: none;
    }

    #igx-live-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 18px;
      padding: 0 4px;
      gap: 4px;
      pointer-events: auto;
      box-sizing: border-box;
    }

    #igx-live-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
      overflow: hidden;
    }

    #igx-live-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 0 0 auto;
    }

    .inline-icon {
      display: block;
      width: 14px;
      height: 14px;
      opacity: .6;
      margin-right: 2px;
      color: var(--text-title);
      flex: 0 0 auto;
    }

    .igx-btn {
      width: 18px;
      height: 18px;
      min-width: 18px;
      padding: 0;
      border-radius: 7px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-title);
      cursor: pointer;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 13px;
      line-height: 1;
      opacity: .65;
      box-sizing: border-box;
    }

    .igx-btn:hover,
    .igx-btn:focus-visible {
      background: var(--btn-bg-hover);
      border-color: var(--btn-border);
      opacity: 1;
      outline: none;
    }

    #igx-live-barline {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
      white-space: nowrap;
      color: var(--text-unknown);
      font-size: 11px;
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    #igx-live-barline::-webkit-scrollbar { display: none; }

    .bitem {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 1px 2px;
      min-height: 0;
      flex: 0 0 auto;
    }

    .bname {
      opacity: 1;
      font-weight: 700;
      color: var(--text-title);
      line-height: 1;
    }

    .bscore {
      font-weight: 900;
      line-height: 1;
    }

    .blat {
      opacity: .75;
      color: var(--text-name);
      line-height: 1;
    }

    .bdot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      display: inline-block;
      flex: 0 0 auto;
    }

    .b-active .bdot { background: var(--c-active); }
    .b-active .bscore { color: var(--c-active); }
    .b-degraded .bdot { background: var(--c-degraded); }
    .b-degraded .bscore { color: var(--c-degraded); }
    .b-impacted .bdot { background: var(--c-impacted); }
    .b-impacted .bscore { color: var(--c-impacted); }
    .b-unknown .bdot { background: var(--c-unknown); }
    .b-unknown .bscore { color: var(--text-unknown); }

    .y-score-excellent .bscore { color: var(--y-score-excellent) !important; }
    .y-score-excellent .bdot { background: var(--y-score-excellent) !important; }
    .y-score-good .bscore { color: var(--y-score-good) !important; }
    .y-score-good .bdot { background: var(--y-score-good) !important; }
    .y-score-fair .bscore { color: var(--y-score-fair) !important; }
    .y-score-fair .bdot { background: var(--y-score-fair) !important; }
    .y-score-poor .bscore { color: var(--y-score-poor) !important; }
    .y-score-poor .bdot { background: var(--y-score-poor) !important; }
    .y-score-error .bscore { color: var(--y-score-error) !important; }
    .y-score-error .bdot { background: var(--y-score-error) !important; }

    #igx-live-settings {
      display: none;
      position: fixed;
      z-index: 2147483000;
      width: min(390px, calc(100vw - 16px));
      max-height: min(480px, 72vh);
      overflow-y: auto;
      padding: 10px;
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      background: var(--panel-bg);
      box-shadow: 0 12px 34px rgba(0, 0, 0, .34);
      backdrop-filter: blur(10px);
      pointer-events: auto;
      user-select: none;
      box-sizing: border-box;
    }

    #igx-live-settings.open { display: block; }

    .igx-settings-title {
      margin: 0 0 6px;
      font-size: 12px;
      font-weight: 800;
      color: var(--text-title);
    }

    .igx-settings-desc {
      margin: 0 0 8px;
      font-size: 10px;
      color: var(--text-unknown);
    }

    .igx-settings-divider {
      height: 1px;
      margin: 6px 0 8px;
      background: var(--row-border);
    }

    .igx-set-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 28px;
      padding: 3px 2px;
      border-bottom: 1px solid var(--row-border);
      font-size: 11px;
      color: var(--text-name);
      box-sizing: border-box;
    }

    .igx-set-row:last-child { border-bottom: none; }

    .igx-set-label {
      display: flex;
      align-items: center;
      gap: 7px;
      min-width: 0;
      flex: 1;
      cursor: pointer;
    }

    .igx-set-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .igx-set-chk {
      width: 15px;
      height: 15px;
      margin: 0;
      accent-color: #3ddc84;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .igx-model-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px 10px;
      align-items: start;
    }

    .igx-model-group {
      min-width: 0;
      padding: 6px 7px 4px;
      border: 1px solid var(--row-border);
      border-radius: 9px;
      background: var(--btn-bg);
      box-sizing: border-box;
    }

    .igx-model-group-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 2px;
      padding: 0 1px 4px;
      border-bottom: 1px solid var(--row-border);
      color: var(--text-title);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .1px;
      cursor: pointer;
    }

    .igx-group-chk {
      width: 13px;
      height: 13px;
      margin: 0;
      accent-color: #3ddc84;
      cursor: pointer;
      flex: 0 0 auto;
    }

    .igx-model-group .igx-set-row {
      min-height: 25px;
      padding: 3px 1px;
      border-bottom: none;
    }

    .igx-model-group .igx-set-label {
      gap: 6px;
    }

    @media (max-width: 600px) {
      #igx-live-head { padding: 0 4px 2px; }
      #igx-live-barline { gap: 4px; }
      .bitem { gap: 5px; }
      .bname, .bscore, .blat { font-size: 11px; letter-spacing: -.3px; }
      #igx-live-settings { padding: 9px; }
      .igx-model-grid { gap: 7px 8px; }
      .igx-model-group { padding: 5px 6px 3px; }
      .igx-model-group .igx-set-row { font-size: 10.5px; }
    }
  `);

  const popup = document.createElement("div");
  popup.id = "igx-live-popup";
  popup.className = "inline";
  popup.dataset.igxStableInlineHost = "1";

  const head = document.createElement("div");
  head.id = "igx-live-head";

  const left = document.createElement("div");
  left.id = "igx-live-left";

  const inlineIcon = document.createElement("div");
  inlineIcon.className = "inline-icon";
  inlineIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%;"><path d="M2 12h4l2.25-11.25a.5.5 0 0 1 .98 0l4.54 22.5a.5.5 0 0 0 .98 0L17 12h5"/></svg>`;

  const barline = document.createElement("div");
  barline.id = "igx-live-barline";
  barline.textContent = "불러오는 중…";

  left.append(inlineIcon, barline);

  const actions = document.createElement("div");
  actions.id = "igx-live-actions";

  const btnRefresh = document.createElement("button");
  btnRefresh.className = "igx-btn";
  btnRefresh.type = "button";
  btnRefresh.title = "갱신";
  btnRefresh.setAttribute("aria-label", "라디오존데 갱신");
  btnRefresh.textContent = "↻";

  const btnSettings = document.createElement("button");
  btnSettings.className = "igx-btn";
  btnSettings.type = "button";
  btnSettings.title = "표시 설정";
  btnSettings.setAttribute("aria-label", "라디오존데 표시 설정");
  btnSettings.textContent = "⚙";

  actions.append(btnRefresh, btnSettings);
  head.append(left, actions);
  popup.appendChild(head);

  const settingsArea = document.createElement("div");
  settingsArea.id = "igx-live-settings";
  settingsArea.setAttribute("role", "dialog");
  settingsArea.setAttribute("aria-label", "라디오존데 표시 설정");

  let visibility = {};
  try {
    visibility = JSON.parse(localStorage.getItem(STORE_KEY_VISIBILITY)) || {};
  } catch {}

  // 4.2.0 이전 YAME Opus 항목은 더 이상 제공되지 않으므로 저장된 표시 설정에서도 정리한다.
  delete visibility["yame-opus5"];
  delete visibility["yame-opus48"];

  let showLatency = localStorage.getItem(STORE_KEY_LATENCY) !== "0";
  const last = new Map();

  const MODEL_GROUPS = [
    { id: "fable", label: "Fable" },
    { id: "opus", label: "Opus" },
    { id: "gpt", label: "GPT" },
    { id: "gemini", label: "Gemini" },
    { id: "sonnet", label: "Sonnet" },
    { id: "haiku", label: "Haiku" },
    { id: "other", label: "기타" },
  ];

  function modelGroupId(model) {
    const text = `${model?.slug || ""} ${model?.label || ""}`.toLowerCase();
    if (text.includes("fable")) return "fable";
    if (text.includes("opus")) return "opus";
    if (text.includes("gpt") || text.includes("openai")) return "gpt";
    if (text.includes("gemini")) return "gemini";
    if (text.includes("sonnet")) return "sonnet";
    if (text.includes("haiku")) return "haiku";
    return "other";
  }

  function settingsModelLabel(model, groupId) {
    if (model?.source === "yame" && model?.apiId === "fable5") return "Fable 5.0";

    const { version, descriptors } = parseSlug(model?.slug);
    const shownVersion = /^\d+$/.test(version) ? `${version}.0` : version;

    if (groupId === "fable" && shownVersion) return `Fable ${shownVersion}`;
    if (groupId === "opus" && shownVersion) return `Opus ${shownVersion}`;
    if (groupId === "sonnet" && shownVersion) return `Sonnet ${shownVersion}`;
    if (groupId === "haiku" && shownVersion) return `Haiku ${shownVersion}`;
    if (groupId === "gpt" && shownVersion) {
      const suffix = descriptors
        .filter(value => !["gpt", "openai"].includes(value))
        .map(titleWord)
        .join(" ");
      return `GPT ${shownVersion}${suffix ? ` ${suffix}` : ""}`;
    }

    if (groupId === "gemini" && shownVersion) {
      const suffix = descriptors
        .filter(value => !["gemini"].includes(value))
        .map(titleWord)
        .join(" ");
      return `Gemini ${shownVersion}${suffix ? ` ${suffix}` : ""}`;
    }

    return model?.label || model?.slug || "Model";
  }

  function syncGroupCheckbox(check, models) {
    const enabledCount = models.reduce((count, model) =>
      count + (visibility[model.slug] !== false ? 1 : 0), 0);

    check.checked = enabledCount === models.length;
    check.indeterminate = enabledCount > 0 && enabledCount < models.length;
    check.setAttribute("aria-checked", check.indeterminate ? "mixed" : String(check.checked));
  }

  function buildModelToggleRow(model, groupId, onVisibilityChanged) {
    if (visibility[model.slug] === undefined) visibility[model.slug] = true;

    const row = document.createElement("div");
    row.className = "igx-set-row";

    const label = document.createElement("label");
    label.className = "igx-set-label";
    label.title = `${model.label} (${model.slug})`;

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "igx-set-chk";
    check.checked = visibility[model.slug];

    const labelText = document.createElement("span");
    labelText.className = "igx-set-text";
    labelText.textContent = settingsModelLabel(model, groupId);

    check.addEventListener("change", () => {
      visibility[model.slug] = check.checked;
      localStorage.setItem(STORE_KEY_VISIBILITY, JSON.stringify(visibility));
      if (typeof onVisibilityChanged === "function") onVisibilityChanged();
      renderBarline();
    });

    label.append(check, labelText);
    row.appendChild(label);
    return row;
  }

  function buildModelUI() {
    const fragment = document.createDocumentFragment();

    const title = document.createElement("div");
    title.className = "igx-settings-title";
    title.textContent = "라디오존데 표시 설정";

    const desc = document.createElement("div");
    desc.className = "igx-settings-desc";
    desc.textContent = "입력창에 표시할 항목을 선택하세요.";

    const latencyRow = document.createElement("div");
    latencyRow.className = "igx-set-row";
    const latencyLabel = document.createElement("label");
    latencyLabel.className = "igx-set-label";
    const latencyCheck = document.createElement("input");
    latencyCheck.type = "checkbox";
    latencyCheck.className = "igx-set-chk";
    latencyCheck.checked = showLatency;
    const latencyText = document.createElement("span");
    latencyText.className = "igx-set-text";
    latencyText.textContent = "응답시간 표시";
    latencyLabel.append(latencyCheck, latencyText);
    latencyRow.appendChild(latencyLabel);
    latencyCheck.addEventListener("change", () => {
      showLatency = latencyCheck.checked;
      localStorage.setItem(STORE_KEY_LATENCY, showLatency ? "1" : "0");
      renderBarline();
    });

    const divider = document.createElement("div");
    divider.className = "igx-settings-divider";

    const grouped = new Map(MODEL_GROUPS.map(group => [group.id, []]));
    for (const model of MODELS) {
      const groupId = modelGroupId(model);
      grouped.get(groupId).push(model);
    }

    const grid = document.createElement("div");
    grid.className = "igx-model-grid";

    for (const group of MODEL_GROUPS) {
      const models = grouped.get(group.id);
      if (!models?.length) continue;

      const section = document.createElement("section");
      section.className = "igx-model-group";

      for (const model of models) {
        if (visibility[model.slug] === undefined) visibility[model.slug] = true;
      }

      const heading = document.createElement("label");
      heading.className = "igx-model-group-title";
      heading.title = `${group.label} 그룹 전체 표시 전환`;

      const groupCheck = document.createElement("input");
      groupCheck.type = "checkbox";
      groupCheck.className = "igx-group-chk";
      groupCheck.setAttribute("aria-label", `${group.label} 그룹 전체 표시`);

      const groupText = document.createElement("span");
      groupText.textContent = group.label;

      const syncThisGroup = () => syncGroupCheckbox(groupCheck, models);
      syncThisGroup();

      groupCheck.addEventListener("change", () => {
        const enabled = groupCheck.checked;
        for (const model of models) visibility[model.slug] = enabled;
        localStorage.setItem(STORE_KEY_VISIBILITY, JSON.stringify(visibility));
        buildModelUI();
        renderBarline();
      });

      heading.append(groupCheck, groupText);
      section.appendChild(heading);

      for (const model of models) {
        section.appendChild(buildModelToggleRow(model, group.id, syncThisGroup));
      }

      grid.appendChild(section);
    }

    fragment.append(title, desc, latencyRow, divider, grid);
    settingsArea.replaceChildren(fragment);
    localStorage.setItem(STORE_KEY_VISIBILITY, JSON.stringify(visibility));
  }

  function modelSignature(models) {
    return JSON.stringify(models.map(model => [
      model.slug,
      model.apiId || model.slug,
      model.source || "igx",
      model.label,
      model.short,
    ]));
  }

  function applyModels(nextModels) {
    if (!Array.isArray(nextModels) || nextModels.length === 0) return false;

    const clean = YAME_MODELS.map(model => ({ ...model }));
    const seen = new Set(clean.map(model => model.slug));

    for (const model of nextModels) {
      if (!model || typeof model.slug !== "string") continue;
      const slug = model.slug.trim();
      if (!slug || seen.has(slug) || !looksLikeModelSlug(slug)) continue;
      if (typeof model.label !== "string" || !model.label.trim()) continue;
      if (typeof model.short !== "string" || !model.short.trim()) continue;

      seen.add(slug);
      clean.push({
        slug,
        apiId: slug,
        source: "igx",
        label: model.label.trim(),
        short: model.short.trim(),
      });
    }

    if (clean.length === YAME_MODELS.length || modelSignature(clean) === modelSignature(MODELS)) return false;

    MODELS = clean;
    for (const slug of [...last.keys()]) {
      if (!seen.has(slug)) last.delete(slug);
    }

    buildModelUI();
    renderBarline();
    return true;
  }

  const YAME_SCORE_BANDS = new Set(["excellent", "good", "fair", "poor", "error"]);

  const initialCache = loadModelCache();
  applyModels(initialCache?.length ? initialCache : FALLBACK_MODELS);

  function normalizeStatus(status) {
    const value = String(status || "unknown").trim().toLowerCase();
    if (["active", "operational", "ok", "healthy", "online", "normal"].includes(value)) return "active";
    if (["degraded", "slow", "warning", "warn"].includes(value)) return "degraded";
    if (["impacted", "down", "offline", "error", "failed", "failure", "unavailable"].includes(value)) return "impacted";
    return VALID_STATUSES.has(value) ? value : "unknown";
  }

  function normalizeYameScoreBand(band, score, hasError = false) {
    if (hasError) return "error";
    const explicit = String(band || "").toLowerCase();
    if (YAME_SCORE_BANDS.has(explicit)) return explicit;

    const value = Number(score);
    if (!Number.isFinite(value)) return "";
    if (value >= 85) return "excellent";
    if (value >= 70) return "good";
    if (value >= 50) return "fair";
    return "poor";
  }

  function gmGetJson(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: timeoutMs,
        headers: { Accept: "application/json" },
        onload: (res) => {
          const status = Number(res.status) || 0;
          if (status && (status < 200 || status >= 300)) {
            reject(new Error(`HTTP ${status}`));
            return;
          }

          try {
            resolve(JSON.parse(res.responseText));
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error("network error")),
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function gmGetText(url, timeoutMs = 15000, accept = "text/plain,*/*") {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        timeout: timeoutMs,
        headers: { Accept: accept },
        onload: (res) => {
          const status = Number(res.status) || 0;
          if (status && (status < 200 || status >= 300)) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          resolve(String(res.responseText || ""));
        },
        onerror: () => reject(new Error("network error")),
        ontimeout: () => reject(new Error("timeout")),
      });
    });
  }

  function absoluteIgxUrl(value) {
    try {
      return new URL(String(value || ""), IGX_BASE_URL).href;
    } catch {
      return "";
    }
  }

  async function loadIgxOpenApiSpec() {
    const directCandidates = [
      IGX_OPENAPI_URL,
      `${IGX_BASE_URL}/api/openapi.json`,
      `${IGX_BASE_URL}/docs/openapi.json`,
    ];

    for (const url of directCandidates) {
      try {
        const spec = await gmGetJson(url, 16000);
        if (spec?.paths && typeof spec.paths === "object") return spec;
      } catch (_) {}
    }

    // /docs가 Swagger/Scalar/ReDoc 어느 쪽으로 바뀌어도 HTML 안의 OpenAPI JSON 경로를 한 번 찾는다.
    try {
      const html = await gmGetText(IGX_DOCS_URL, 16000, "text/html,application/xhtml+xml");
      const candidates = new Set();
      const patterns = [
        /https?:\/\/[^"'\s<>]+openapi[^"'\s<>]*\.json[^"'\s<>]*/gi,
        /(?:url|spec-url|specUrl|data-url)\s*[:=]\s*["']([^"']+\.json[^"']*)["']/gi,
        /["']([^"']*openapi[^"']*\.json[^"']*)["']/gi,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html))) {
          const raw = match[1] || match[0];
          const url = absoluteIgxUrl(raw);
          if (url && url.startsWith(IGX_BASE_URL)) candidates.add(url);
        }
      }

      for (const url of candidates) {
        try {
          const spec = await gmGetJson(url, 16000);
          if (spec?.paths && typeof spec.paths === "object") return spec;
        } catch (_) {}
      }
    } catch (_) {}

    throw new Error("IGX OpenAPI spec not found");
  }


  function titleWord(word) {
    const known = {
      api: "API",
      ai: "AI",
      gpt: "GPT",
      claude: "Claude",
      gemini: "Gemini",
      opus: "Opus",
      sonnet: "Sonnet",
      haiku: "Haiku",
      pro: "Pro",
      flash: "Flash",
      lite: "Lite",
      mini: "Mini",
      max: "Max",
      turbo: "Turbo",
      preview: "Preview",
      thinking: "Thinking",
      experimental: "Experimental",
      exp: "Exp",
    };
    return known[word] || (word ? word.charAt(0).toUpperCase() + word.slice(1) : "");
  }

  function parseSlug(slug) {
    const tokens = String(slug || "")
      .toLowerCase()
      .split("-")
      .map(value => value.trim())
      .filter(Boolean);

    const brand = tokens[0] || "model";
    const isNumberToken = token => /^\d+(?:\.\d+)*$/.test(token);
    const firstNumberIndex = tokens.findIndex((token, index) => index > 0 && isNumberToken(token));

    let version = "";
    if (firstNumberIndex !== -1) {
      const parts = [];
      for (let i = firstNumberIndex; i < tokens.length && isNumberToken(tokens[i]); i++) {
        parts.push(tokens[i]);
      }
      version = parts.join(".");
    }

    const descriptors = tokens.slice(1).filter(token => !isNumberToken(token));
    return { brand, version, descriptors };
  }

  function autoLabel(slug) {
    const override = MODEL_OVERRIDES.get(slug);
    if (override) return override.label;

    const { brand, version, descriptors } = parseSlug(slug);
    const brandName = titleWord(brand);
    const descriptorText = descriptors.map(titleWord).join(" ");

    if (version && descriptorText) return `${brandName} ${version} ${descriptorText}`;
    if (version) return `${brandName} ${version}`;
    if (descriptorText) return `${brandName} ${descriptorText}`;
    return brandName;
  }

  function autoShort(slug) {
    const override = MODEL_OVERRIDES.get(slug);
    if (override) return override.short;

    const { brand, version, descriptors } = parseSlug(slug);
    const descriptorInitials = descriptors
      .filter(v => !["preview", "experimental", "exp"].includes(v))
      .map(v => v.charAt(0).toUpperCase())
      .join("");

    if (brand === "claude") {
      const family = descriptors.find(v => ["opus", "sonnet", "haiku"].includes(v));
      const familyInitial = family ? family.charAt(0).toUpperCase() : "C";
      return `${familyInitial}${version || ""}`;
    }

    if (brand === "gemini") {
      const tier = descriptors.filter(v => v !== "pro").map(v => v.charAt(0).toUpperCase()).join("");
      return `G${version || ""}${tier}`;
    }

    if (version) {
      return `${brand.charAt(0).toUpperCase()}${version}${descriptorInitials}`.slice(0, 8);
    }

    if (descriptors.length) {
      return `${brand.charAt(0).toUpperCase()}${descriptorInitials}`.slice(0, 6);
    }

    return brand.slice(0, 3).toUpperCase();
  }

  function makeModelMeta(slug) {
    return {
      slug,
      apiId: slug,
      source: "igx",
      label: autoLabel(slug),
      short: autoShort(slug),
    };
  }

  function ensureUniqueShorts(models) {
    const used = new Set();

    return models.map((model) => {
      const original = String(model.short || "M").slice(0, 8) || "M";
      let candidate = original;

      if (used.has(candidate)) {
        const brandPrefix = model.slug.split("-")[0].slice(0, 2).toUpperCase() || "M";
        candidate = `${brandPrefix}${original}`.slice(0, 8);
      }

      let suffix = 2;
      while (used.has(candidate)) {
        const suffixText = String(suffix++);
        const baseLength = Math.max(1, 8 - suffixText.length);
        candidate = `${original.slice(0, baseLength)}${suffixText}`;
      }

      used.add(candidate);
      return { ...model, short: candidate };
    });
  }

  function latestRecordMs(records) {
    if (!Array.isArray(records) || !records.length) return null;
    for (let i = records.length - 1; i >= 0; i--) {
      const ms = Date.parse(records[i]?.time);
      if (Number.isFinite(ms)) return ms;
    }
    return null;
  }

  function modelsFromStatistics(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];

    const now = Date.now();
    const models = [];

    for (const [slug, records] of Object.entries(payload)) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) continue;
      if (EXCLUDED_MODELS.has(slug)) continue;
      if (!Array.isArray(records) || !records.length) continue;

      const latestMs = latestRecordMs(records);
      if (latestMs == null || now - latestMs > ACTIVE_MODEL_WINDOW_MS) continue;

      models.push(makeModelMeta(slug));
    }

    return ensureUniqueShorts(models);
  }

  function loadModelCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY_MODELS));
      const source = Array.isArray(parsed) ? parsed : parsed?.models;
      if (!Array.isArray(source)) return null;

      const models = source.filter(model =>
        model && typeof model.slug === "string" && looksLikeModelSlug(model.slug) &&
        typeof model.label === "string" && typeof model.short === "string"
      );

      return models.length ? models : null;
    } catch {
      return null;
    }
  }

  function saveModelCache(models) {
    try {
      localStorage.setItem(STORE_KEY_MODELS, JSON.stringify(models));
    } catch {}
  }

  let igxRouteCatalog = null;
  let igxRouteCatalogTried = false;
  let igxWorkingBulkRoute = null;
  let igxWorkingModelRoute = null;
  let igxSnapshotCache = null;
  let igxSnapshotCacheAt = 0;
  let igxSupplementCache = null;
  let igxSupplementCacheAt = 0;
  let igxWorkingSupplementRoute = null;
  const IGX_SUPPLEMENT_CACHE_MS = 5 * 60 * 1000;


  function firstFinite(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function secondsToMs(value) {
    const number = firstFinite(value);
    return number === null ? null : number * 1000;
  }

  function firstText(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function metricRecordFromObject(source, impliedSlug = "") {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;

    const nested = [
      source.data,
      source.metrics,
      source.metric,
      source.latest,
      source.current,
      source.result,
      source.health,
    ].filter(value => value && typeof value === "object" && !Array.isArray(value));

    const merged = Object.assign({}, source, ...nested);
    const slug = firstText(
      merged.slug,
      merged.model_slug,
      merged.modelSlug,
      merged.model_id,
      merged.modelId,
      typeof merged.model === "string" ? merged.model : "",
      typeof merged.id === "string" ? merged.id : "",
      impliedSlug,
    );

    if (!looksLikeModelSlug(slug)) return null;

    const score = firstFinite(
      merged.score,
      merged.health_score,
      merged.healthScore,
      merged.experience_score?.value,
      merged.experienceScore?.value,
      merged.rating,
    );

    const latency = firstFinite(
      merged.latency,
      merged.latency?.value,
      merged.latency?.ms,
      secondsToMs(merged.latency?.seconds),
      merged.latency_ms,
      merged.latencyMs,
      secondsToMs(merged.latency_sec),
      secondsToMs(merged.latencySec),
      secondsToMs(merged.latency_seconds),
      secondsToMs(merged.latencySeconds),
      merged.avg_latency,
      merged.avgLatency,
      merged.average_latency,
      merged.averageLatency,
      merged.ttft,
      merged.ttft?.value,
      merged.ttft?.ms,
      secondsToMs(merged.ttft?.seconds),
      merged.ttft_ms,
      merged.ttftMs,
      secondsToMs(merged.ttft_sec),
      secondsToMs(merged.ttftSec),
      secondsToMs(merged.ttft_seconds),
      secondsToMs(merged.ttftSeconds),
      merged.avg_ttft,
      merged.avgTtft,
      merged.response_time,
      merged.responseTime,
      merged.response_time?.value,
      merged.response_time?.ms,
      secondsToMs(merged.response_time?.seconds),
      merged.response_time_ms,
      merged.responseTimeMs,
      secondsToMs(merged.response_time_sec),
      secondsToMs(merged.responseTimeSec),
      secondsToMs(merged.response_time_seconds),
      secondsToMs(merged.responseTimeSeconds),
      merged.avg_response_time,
      merged.avgResponseTime,
      merged.average_response_time,
      merged.averageResponseTime,
      merged.first_token_ms,
      merged.firstTokenMs,
      merged.first_token_latency,
      merged.firstTokenLatency,
      merged.first_token_latency_ms,
      merged.firstTokenLatencyMs,
      merged.time_to_first_token,
      merged.timeToFirstToken,
      merged.time_to_first_token_ms,
      merged.timeToFirstTokenMs,
    );

    const tps = firstFinite(
      merged.tps,
      merged.tokens_per_second,
      merged.tokensPerSecond,
      merged.output_tps,
      merged.outputTps,
      merged.speed,
    );

    const rawStatus = firstText(
      merged.status,
      merged.state,
      merged.health_status,
      merged.healthStatus,
      merged.condition,
    );

    const failureCount = firstFinite(
      merged.failureCount,
      merged.failure_count,
      merged.failures,
      merged.failure,
      merged.error_count,
      merged.errorCount,
    ) ?? 0;

    if (score === null && latency === null && tps === null && !rawStatus && !merged.time && !merged.measuredAt) return null;

    return {
      slug,
      status: normalizeStatus(rawStatus),
      score,
      latency,
      tps,
      failureCount,
    };
  }

  function collectIgxMetricEntries(payload, impliedRootSlug = "") {
    const bySlug = new Map();
    const seen = new WeakSet();

    const add = (record) => {
      if (!record || EXCLUDED_MODELS.has(record.slug)) return;
      const previous = bySlug.get(record.slug);
      if (!previous) {
        bySlug.set(record.slug, record);
        return;
      }

      // 같은 모델이 여러 번 보이면 실제 수치가 더 많이 들어있는 쪽을 우선한다.
      const richness = value =>
        Number(value?.score !== null && value?.score !== undefined) +
        Number(value?.latency !== null && value?.latency !== undefined) +
        Number(value?.tps !== null && value?.tps !== undefined) +
        Number(value?.status && value.status !== "unknown");

      if (richness(record) >= richness(previous)) bySlug.set(record.slug, record);
    };

    const walk = (value, impliedSlug = "", depth = 0) => {
      if (depth > 7 || value === null || value === undefined) return;

      if (Array.isArray(value)) {
        // 응답 배열 순서에 의존하지 않고 측정 시각이 최신인 기록을 선택한다.
        const ordered = impliedSlug ? [...value].sort((a, b) =>
          (Date.parse(b?.time || b?.measuredAt || '') || 0) -
          (Date.parse(a?.time || a?.measuredAt || '') || 0)
        ) : value;
        for (const item of ordered) {
          const record = metricRecordFromObject(item, impliedSlug);
          if (record) {
            add(record);
            if (impliedSlug) break;
          }
          walk(item, impliedSlug, depth + 1);
        }
        return;
      }

      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      const direct = metricRecordFromObject(value, impliedSlug);
      if (direct) add(direct);

      const ownSlug = firstText(value.slug, value.model_slug, value.modelSlug,
        value.model_id, value.modelId, typeof value.model === 'string' ? value.model : '', value.id);
      const parentSlug = looksLikeModelSlug(ownSlug) ? ownSlug : impliedSlug;
      for (const [key, child] of Object.entries(value)) {
        if (child === null || child === undefined) continue;
        const nextImplied = looksLikeModelSlug(key) ? key : parentSlug;
        if (typeof child === "object") walk(child, nextImplied, depth + 1);
      }
    };

    walk(payload, impliedRootSlug);
    return bySlug;
  }

  function routeOperationText(path, operation) {
    const tags = Array.isArray(operation?.tags) ? operation.tags.join(" ") : "";
    return `${path} ${operation?.operationId || ""} ${operation?.summary || ""} ${operation?.description || ""} ${tags}`.toLowerCase();
  }

  function routeScore(path, operation, mode) {
    const text = routeOperationText(path, operation);
    let score = 0;

    if (text.includes("latest")) score += 10;
    if (text.includes("current")) score += 9;
    if (text.includes("status")) score += 8;
    if (text.includes("model")) score += 6;
    if (text.includes("metric")) score += 6;
    if (text.includes("health")) score += 5;
    if (text.includes("simple")) score += 4;
    if (text.includes("statistics")) score += 3;
    if (text.includes("history")) score -= 4;
    if (text.includes("badge")) score -= 10;
    if (text.includes("graph")) score -= 6;
    if (path.startsWith("/api/")) score += 4;
    if (mode === "bulk" && !path.includes("{")) score += 3;
    if (mode === "model" && path.includes("{")) score += 3;

    return score;
  }

  function requiredOperationParams(operation) {
    return [
      ...(Array.isArray(operation?.parameters) ? operation.parameters : []),
    ].filter(param => param && param.required);
  }

  function makeRoute(path, operation, mode) {
    const placeholders = [...String(path).matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
    const required = requiredOperationParams(operation);
    let modelParam = "";

    if (mode === "model") {
      if (placeholders.length === 1) {
        modelParam = placeholders[0];
      } else if (placeholders.length === 0) {
        const queryModel = required.find(param =>
          param.in === "query" && /^(model|slug|model_id|modelId)$/i.test(String(param.name || "")));
        if (queryModel) modelParam = queryModel.name;
      }
      if (!modelParam) return null;
    } else if (placeholders.length) {
      return null;
    }

    const unrelatedRequired = required.filter(param => {
      if (mode !== "model") return true;
      if (param.in === "path" && param.name === modelParam) return false;
      if (param.in === "query" && param.name === modelParam) return false;
      return true;
    });
    if (unrelatedRequired.length) return null;

    return {
      path,
      modelParam,
      modelParamInPath: placeholders.includes(modelParam),
      score: routeScore(path, operation, mode),
    };
  }

  async function loadIgxRouteCatalog() {
    if (igxRouteCatalogTried) return igxRouteCatalog;
    igxRouteCatalogTried = true;

    try {
      const spec = await loadIgxOpenApiSpec();
      const bulk = [];
      const model = [];

      for (const [path, item] of Object.entries(spec?.paths || {})) {
        const operation = item?.get;
        if (!operation || typeof path !== "string") continue;

        const bulkRoute = makeRoute(path, operation, "bulk");
        if (bulkRoute && bulkRoute.score > 0) bulk.push(bulkRoute);

        const modelRoute = makeRoute(path, operation, "model");
        if (modelRoute && modelRoute.score > 0) model.push(modelRoute);
      }

      bulk.sort((a, b) => b.score - a.score);
      model.sort((a, b) => b.score - a.score);

      igxRouteCatalog = { bulk, model };
    } catch (_) {
      igxRouteCatalog = { bulk: [], model: [] };
    }

    return igxRouteCatalog;
  }

  function routeUrl(route, slug = "") {
    let path = route.path;

    if (slug && route.modelParam) {
      if (route.modelParamInPath) {
        path = path.replace(`{${route.modelParam}}`, encodeURIComponent(slug));
      } else {
        const joiner = path.includes("?") ? "&" : "?";
        path += `${joiner}${encodeURIComponent(route.modelParam)}=${encodeURIComponent(slug)}`;
      }
    }

    return `${IGX_BASE_URL}${path}`;
  }

  async function fetchRouteJson(route, slug = "", timeoutMs = 18000) {
    return gmGetJson(routeUrl(route, slug), timeoutMs);
  }

  async function tryBulkRoute(route) {
    const payload = await fetchRouteJson(route);
    const rawEntries = collectIgxMetricEntries(payload);
    const entries = new Map(
      [...rawEntries].filter(([slug]) => looksLikeModelSlug(slug))
    );

    const hasLiveMetrics = [...entries.values()].some(record =>
      record?.score !== null && record?.score !== undefined ||
      record?.latency !== null && record?.latency !== undefined ||
      record?.tps !== null && record?.tps !== undefined
    );

    // bulk/current 계열에서 한 개짜리 가짜 메타 레코드가 잡혀
    // 전체 모델 목록을 덮어쓰는 사고를 막는다.
    if (entries.size < 2 || !hasLiveMetrics || ![...entries.values()].some(record => record.score !== null)) {
      throw new Error("bulk route returned insufficient real model metrics");
    }
    return entries;
  }

  async function fetchDashboardHtml() {
    return gmGetText(
      `${IGX_DASHBOARD_URL}?t=${Date.now()}`,
      20000,
      "text/html,application/xhtml+xml",
    );
  }

  function dashboardEntriesFromHtml(html) {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    const bySlug = new Map();
    const slugRe = /^[a-z0-9][a-z0-9._-]*$/i;
    const statusRe = /\b(Operational|Active|Degraded|Impacted|Down|Offline|Unknown)\b/i;
    const scoreRe = /(\d+(?:\.\d+)?)\s*\/\s*100\b/i;
    const latencyRe = /(\d+(?:\.\d+)?)\s*(?:초|s\b)/i;
    const tpsRe = /(\d+(?:\.\d+)?)\s*(?:tok\/s|tokens?\/s)\b/i;

    const leaves = parsed.querySelectorAll("body *");
    for (const node of leaves) {
      if (node.children.length) continue;
      const slug = String(node.textContent || "").trim();
      if (!slugRe.test(slug) || !looksLikeModelSlug(slug)) continue;

      let row = node.parentElement;
      let parsedRecord = null;

      for (let depth = 0; row && depth < 8; depth += 1, row = row.parentElement) {
        const rowText = String(row.textContent || "").replace(/\s+/g, " ").trim();
        const statusMatch = rowText.match(statusRe);
        const scoreMatch = rowText.match(scoreRe);
        const latencyMatch = rowText.match(latencyRe);
        const tpsMatch = rowText.match(tpsRe);

        if (!statusMatch || !scoreMatch) continue;

        parsedRecord = {
          slug,
          status: normalizeStatus(statusMatch[1]),
          score: Number(scoreMatch[1]),
          latency: latencyMatch ? Number(latencyMatch[1]) * 1000 : null,
          tps: tpsMatch ? Number(tpsMatch[1]) : null,
          failureCount: 0,
        };
        break;
      }

      if (parsedRecord) bySlug.set(slug, parsedRecord);
    }

    return bySlug;
  }

  async function fetchDashboardSnapshot() {
    const html = await fetchDashboardHtml();
    const entries = dashboardEntriesFromHtml(html);
    if (!entries.size) throw new Error("dashboard parse returned no model metrics");
    return entries;
  }

  async function fetchLegacyStatisticsSnapshot() {
    const payload = await gmGetJson(LEGACY_STATISTICS_URL, 22000);
    const entries = collectIgxMetricEntries(payload);
    if (!entries.size) throw new Error("legacy statistics returned no model metrics");
    return entries;
  }


  function snapshotNeedsSupplement(entries) {
    if (!(entries instanceof Map) || !entries.size) return false;
    return [...entries.values()].some(record =>
      record && (
        record.latency === null || record.latency === undefined || record.latency === "" ||
        record.tps === null || record.tps === undefined || record.tps === ""
      )
    );
  }

  function hasSupplementMetrics(entries) {
    if (!(entries instanceof Map) || !entries.size) return false;
    return [...entries.values()].some(record =>
      record && (
        record.latency !== null && record.latency !== undefined && record.latency !== "" ||
        record.tps !== null && record.tps !== undefined && record.tps !== ""
      )
    );
  }

  function mergeSupplementMetrics(primary, supplement) {
    if (!(primary instanceof Map) || !(supplement instanceof Map) || !supplement.size) return primary;

    const merged = new Map();
    for (const [slug, record] of primary) {
      const extra = supplement.get(slug);
      if (!extra) {
        merged.set(slug, record);
        continue;
      }

      merged.set(slug, {
        ...record,
        // 새 API의 점수/상태는 그대로 유지하고 비어 있는 측정값만 채운다.
        latency:
          record?.latency !== null && record?.latency !== undefined && record?.latency !== ""
            ? record.latency
            : extra.latency,
        tps:
          record?.tps !== null && record?.tps !== undefined && record?.tps !== ""
            ? record.tps
            : extra.tps,
      });
    }
    return merged;
  }

  async function trySupplementRoute(route) {
    const payload = await fetchRouteJson(route);
    const entries = collectIgxMetricEntries(payload);
    if (!hasSupplementMetrics(entries)) throw new Error("route has no supplement metrics");
    return entries;
  }

  async function fetchIgxSupplementSnapshot({ force = false } = {}) {
    const now = Date.now();
    if (!force && igxSupplementCache?.size && now - igxSupplementCacheAt < IGX_SUPPLEMENT_CACHE_MS) {
      return igxSupplementCache;
    }

    if (igxWorkingSupplementRoute) {
      try {
        const entries = await trySupplementRoute(igxWorkingSupplementRoute);
        igxSupplementCache = entries;
        igxSupplementCacheAt = Date.now();
        return entries;
      } catch (_) {
        igxWorkingSupplementRoute = null;
      }
    }

    // 새 문서의 통계/history/metrics 계열 GET 중 추가 측정값을 실제로 주는 경로를 찾는다.
    try {
      const catalog = await loadIgxRouteCatalog();
      const candidates = catalog.bulk.filter(route => {
        const text = String(route?.path || "").toLowerCase();
        return /stat|history|metric|measurement|sample|record/.test(text) &&
          route !== igxWorkingBulkRoute;
      });

      for (const route of candidates.slice(0, 8)) {
        try {
          const entries = await trySupplementRoute(route);
          igxWorkingSupplementRoute = route;
          igxSupplementCache = entries;
          igxSupplementCacheAt = Date.now();
          return entries;
        } catch (_) {}
      }
    } catch (_) {}

    // 예전 statistics가 아직 호환되는 경우 가장 저렴한 보충 소스로 사용.
    try {
      const entries = await fetchLegacyStatisticsSnapshot();
      if (hasSupplementMetrics(entries)) {
        igxSupplementCache = entries;
        igxSupplementCacheAt = Date.now();
        return entries;
      }
    } catch (_) {}

    // 공식 대시보드 HTML에 응답시간이 노출되는 배포라면 마지막으로 여기서 보충.
    try {
      const entries = await fetchDashboardSnapshot();
      if (hasSupplementMetrics(entries)) {
        igxSupplementCache = entries;
        igxSupplementCacheAt = Date.now();
        return entries;
      }
    } catch (_) {}

    return new Map();
  }

  async function finalizeIgxSnapshot(entries) {
    if (!(entries instanceof Map) || !entries.size) return entries;
    if (!showLatency || !snapshotNeedsSupplement(entries)) return entries;

    try {
      const supplement = await fetchIgxSupplementSnapshot();
      return mergeSupplementMetrics(entries, supplement);
    } catch (_) {
      return entries;
    }
  }

  let igxV2Models = null;
  let igxV2ModelsAt = 0;

  async function fetchIgxV2Snapshot() {
    if (!igxV2Models || Date.now() - igxV2ModelsAt >= 5 * 60 * 1000) {
      const payload = await gmGetJson(IGX_BASE_URL + '/api/v2/models');
      if (payload?.success !== true || !Array.isArray(payload.data)) throw new Error('invalid v2 models');
      const slugs = [...new Set(payload.data.filter(looksLikeModelSlug))];
      if (slugs.length < 2) throw new Error('insufficient v2 models');
      igxV2Models = slugs;
      igxV2ModelsAt = Date.now();
    }
    const results = await Promise.allSettled(igxV2Models.map(async slug => {
      const payload = await gmGetJson(IGX_BASE_URL + '/api/v2/simple/' + encodeURIComponent(slug));
      if (payload?.success !== true) throw new Error('v2 simple failed');
      const record = metricRecordFromObject(payload.data, slug);
      if (!record) throw new Error('invalid v2 simple');
      return [slug, record];
    }));
    // 부분 실패 시 기존 전체 스냅샷 폴백을 사용하여 모델 목록 누락을 방지한다.
    if (results.some(result => result.status !== 'fulfilled')) throw new Error('incomplete v2 snapshot');
    return new Map(results.map(result => result.value));
  }

  async function fetchIgxSnapshot({ force = false } = {}) {
    const now = Date.now();
    if (!force && igxSnapshotCache?.size && now - igxSnapshotCacheAt < 15000) {
      return igxSnapshotCache;
    }

    try {
      const entries = await fetchIgxV2Snapshot();
      igxSnapshotCache = entries;
      igxSnapshotCacheAt = Date.now();
      return entries;
    } catch (_) {}

    if (igxWorkingBulkRoute) {
      try {
        const entries = await tryBulkRoute(igxWorkingBulkRoute);
        const finalized = await finalizeIgxSnapshot(entries);
        igxSnapshotCache = finalized;
        igxSnapshotCacheAt = Date.now();
        return finalized;
      } catch (_) {
        igxWorkingBulkRoute = null;
      }
    }

    const catalog = await loadIgxRouteCatalog();
    for (const route of catalog.bulk.slice(0, 10)) {
      try {
        const entries = await tryBulkRoute(route);
        igxWorkingBulkRoute = route;
        const finalized = await finalizeIgxSnapshot(entries);
        igxSnapshotCache = finalized;
        igxSnapshotCacheAt = Date.now();
        return finalized;
      } catch (_) {}
    }

    // 새 API 경로가 또 바뀐 순간에도 대시보드 자체가 살아 있으면 현재값을 계속 보여준다.
    try {
      const entries = await fetchDashboardSnapshot();
      const finalized = await finalizeIgxSnapshot(entries);
      igxSnapshotCache = finalized;
      igxSnapshotCacheAt = Date.now();
      return finalized;
    } catch (_) {}

    // 최후 호환: 구형 statistics가 아직 살아 있으면 사용.
    const entries = await fetchLegacyStatisticsSnapshot();
    const finalized = await finalizeIgxSnapshot(entries);
    igxSnapshotCache = finalized;
    igxSnapshotCacheAt = Date.now();
    return finalized;
  }

  function modelsFromSnapshot(entries) {
    if (!(entries instanceof Map) || !entries.size) return [];
    return ensureUniqueShorts(
      [...entries.keys()]
        .filter(slug => looksLikeModelSlug(slug))
        .map(makeModelMeta)
    );
  }

  async function discoverModels(cache = null) {
    if (!isIgxChatRoomPage()) return false;

    try {
      const snapshot = await fetchIgxSnapshot({ force: true });
      const discovered = modelsFromSnapshot(snapshot);
      if (discovered.length < 2) throw new Error("insufficient model list");

      saveModelCache(discovered);
      return applyModels(discovered);
    } catch (_) {
      if (cache?.length) return applyModels(cache);
      return applyModels(FALLBACK_MODELS);
    }
  }

  async function fetchIgxModelFromDiscoveredRoute(slug) {
    if (igxWorkingModelRoute) {
      try {
        const payload = await fetchRouteJson(igxWorkingModelRoute, slug);
        const entries = collectIgxMetricEntries(payload, slug);
        const record = entries.get(slug) || [...entries.values()][0];
        if (record) return record;
      } catch (_) {
        igxWorkingModelRoute = null;
      }
    }

    const catalog = await loadIgxRouteCatalog();
    for (const route of catalog.model.slice(0, 8)) {
      try {
        const payload = await fetchRouteJson(route, slug);
        const entries = collectIgxMetricEntries(payload, slug);
        const record = entries.get(slug) || [...entries.values()][0];
        if (record) {
          igxWorkingModelRoute = route;
          return record;
        }
      } catch (_) {}
    }

    throw new Error("no working model route");
  }

  // bulk snapshot이 실패했을 때만 쓰는 모델별 최후 폴백.
  async function fetchIgxModelWithRetry(slug) {
    try {
      return await fetchIgxModelFromDiscoveredRoute(slug);
    } catch (_) {}

    try {
      const payload = await gmGetJson(LEGACY_API_BASE + encodeURIComponent(slug));
      const entries = collectIgxMetricEntries(payload, slug);
      const record = entries.get(slug) || [...entries.values()][0];
      if (record) return record;
      throw new Error("legacy simple returned no metrics");
    } catch (_) {
      await sleep(1200);
      const payload = await gmGetJson(LEGACY_API_BASE + encodeURIComponent(slug));
      const entries = collectIgxMetricEntries(payload, slug);
      const record = entries.get(slug) || [...entries.values()][0];
      if (record) return record;
      throw new Error("legacy simple returned no metrics");
    }
  }

  async function fetchYameStatusWithRetry() {
    const url = `${YAME_STATUS_URL}?t=${Date.now()}`;
    try {
      return await gmGetJson(url, 20000);
    } catch (_) {
      await sleep(1200);
      return await gmGetJson(`${YAME_STATUS_URL}?t=${Date.now()}`, 20000);
    }
  }

  function normalizeYamePayload(payload) {
    const normalized = new Map();
    if (!payload || !Array.isArray(payload.models)) return normalized;

    for (const model of payload.models) {
      if (!model || typeof model.id !== "string") continue;
      const metrics = model.metrics || {};
      const scoreInfo = model.experience_score || {};
      const hasError = Boolean(model.error);
      const status = hasError
        ? "impacted"
        : model.state === "slow"
          ? "degraded"
          : "active";
      const scoreBand = normalizeYameScoreBand(scoreInfo.band, scoreInfo.value, hasError);

      normalized.set(model.id, {
        success: true,
        data: {
          status,
          latency: metrics.ttft_ms,
          tps: metrics.tps,
          score: scoreInfo.value,
          scoreBand,
          failureCount: hasError ? 1 : 0,
        },
      });
    }

    return normalized;
  }

  function fmt0(x) {
    if (x === null || x === undefined || x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) ? Math.round(n).toString() : null;
  }

  function latencySeconds(latencyInt) {
    if (latencyInt === null || latencyInt === undefined || latencyInt === "") return null;
    const n = Number(latencyInt);
    if (!Number.isFinite(n)) return null;
    return n >= 0 ? (n / 1000).toFixed(2) : null;
  }

  let lastSuccessAt = 0;
  let refreshBusy = false;

  function renderBarline() {
    const fragment = document.createDocumentFragment();
    let visibleCount = 0;

    for (const model of MODELS) {
      if (!visibility[model.slug]) continue;
      visibleCount++;

      const data = last.get(model.slug) || { status: "unknown", score: "—", lat: "—", scoreBand: "" };
      const item = document.createElement("span");
      item.className = `bitem b-${normalizeStatus(data.status)}`;
      if (YAME_SCORE_BANDS.has(data.scoreBand)) item.classList.add(`y-score-${data.scoreBand}`);

      const dot = document.createElement("span");
      dot.className = "bdot";

      const name = document.createElement("span");
      name.className = "bname";
      name.textContent = model.short;

      const score = document.createElement("span");
      score.className = "bscore";
      score.textContent = data.score ?? "—";

      item.append(dot, name, score);

      if (showLatency) {
        const latency = document.createElement("span");
        latency.className = "blat";
        latency.textContent = `${data.lat ?? "—"}s`;
        item.appendChild(latency);
      }

      fragment.appendChild(item);
    }

    if (!visibleCount) {
      const empty = document.createElement("span");
      empty.style.cssText = "opacity:.6;padding:0 4px";
      empty.textContent = "선택된 모델 없음";
      fragment.appendChild(empty);
    }

    barline.replaceChildren(fragment);
  }

  async function refreshAll() {
    if (!isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return;
    }
    if (refreshBusy) return;
    refreshBusy = true;
    btnRefresh.disabled = true;
    btnRefresh.style.opacity = ".35";

    const modelsSnapshot = [...MODELS];
    const yameModels = modelsSnapshot.filter(model => model.source === "yame");
    const igxModels = modelsSnapshot.filter(model => model.source !== "yame");

    try {
      const yameTask = yameModels.length
        ? fetchYameStatusWithRetry().then(
            value => ({ status: "fulfilled", value }),
            reason => ({ status: "rejected", reason }),
          )
        : Promise.resolve(null);
      const igxTask = igxModels.length
        ? fetchIgxSnapshot().then(
            value => ({ status: "fulfilled", value }),
            reason => ({ status: "rejected", reason }),
          )
        : Promise.resolve(null);

      const [yameResult, igxSnapshotResult] = await Promise.all([yameTask, igxTask]);
      const resultsBySlug = new Map();

      if (yameResult?.status === "fulfilled") {
        const normalizedYame = normalizeYamePayload(yameResult.value);
        for (const model of yameModels) {
          const value = normalizedYame.get(model.apiId);
          resultsBySlug.set(
            model.slug,
            value
              ? { status: "fulfilled", value }
              : { status: "rejected", reason: new Error(`missing YAME model: ${model.apiId}`) },
          );
        }
      } else {
        for (const model of yameModels) {
          resultsBySlug.set(model.slug, yameResult || { status: "rejected" });
        }
      }

      if (igxSnapshotResult?.status === "fulfilled" && igxSnapshotResult.value instanceof Map) {
        for (const model of igxModels) {
          const record = igxSnapshotResult.value.get(model.apiId || model.slug) ||
            igxSnapshotResult.value.get(model.slug);
          resultsBySlug.set(
            model.slug,
            record
              ? { status: "fulfilled", value: { success: true, data: record } }
              : { status: "rejected", reason: new Error(`missing IGX model: ${model.slug}`) },
          );
        }
      } else {
        // bulk/current API와 대시보드 폴백까지 모두 실패한 경우에만 모델별 API를 시도한다.
        const igxResults = await Promise.allSettled(
          igxModels.map(model => fetchIgxModelWithRetry(model.apiId || model.slug))
        );
        for (let i = 0; i < igxModels.length; i++) {
          const result = igxResults[i];
          if (result?.status === "fulfilled") {
            resultsBySlug.set(igxModels[i].slug, {
              status: "fulfilled",
              value: { success: true, data: result.value },
            });
          } else {
            resultsBySlug.set(igxModels[i].slug, result);
          }
        }
      }

      let anySuccess = false;

      for (const model of modelsSnapshot) {
        const result = resultsBySlug.get(model.slug);
        if (
          !result ||
          result.status !== "fulfilled" ||
          !result.value ||
          result.value.success !== true ||
          !result.value.data ||
          typeof result.value.data !== "object"
        ) {
          if (!last.has(model.slug)) {
            last.set(model.slug, { status: "unknown", score: "—", lat: "—", scoreBand: "" });
          }
          continue;
        }

        anySuccess = true;
        const data = result.value.data;
        const status = normalizeStatus(data.status);
        const lat = latencySeconds(data.latency);
        const score = fmt0(data.score);
        const fail = Number.isFinite(Number(data.failureCount)) ? Number(data.failureCount) : 0;
        const scoreBand = model.source === "yame"
          ? normalizeYameScoreBand(data.scoreBand, data.score, fail > 0)
          : "";

        last.set(model.slug, {
          status,
          score: score ?? "—",
          lat: lat ?? "—",
          scoreBand,
        });
      }

      renderBarline();

      if (anySuccess) {
        lastSuccessAt = Date.now();
        btnRefresh.title = `갱신 · 마지막 수신 ${new Date(lastSuccessAt).toLocaleTimeString()}`;
      } else if (lastSuccessAt) {
        btnRefresh.title = `연결 실패 · 마지막 수신 ${new Date(lastSuccessAt).toLocaleTimeString()}`;
      } else {
        btnRefresh.title = "연결 실패 · 다시 갱신";
      }
    } finally {
      refreshBusy = false;
      btnRefresh.disabled = false;
      btnRefresh.style.opacity = "";
    }
  }

  let currentInlineHost = null;
  let igxLastPathname = location.pathname;

  function closeSettings() {
    settingsArea.classList.remove("open");
    btnSettings.setAttribute("aria-expanded", "false");
  }

  function positionSettingsPopover() {
    if (!settingsArea.classList.contains("open")) return;
    const rect = btnSettings.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const gap = 6;
    const right = Math.max(8, viewportWidth - rect.right);

    settingsArea.style.right = `${right}px`;
    settingsArea.style.left = "auto";
    settingsArea.style.top = "auto";
    settingsArea.style.bottom = `${Math.max(8, viewportHeight - rect.top + gap)}px`;

    requestAnimationFrame(() => {
      if (!settingsArea.classList.contains("open")) return;
      const panelRect = settingsArea.getBoundingClientRect();
      if (panelRect.top < 8) {
        settingsArea.style.bottom = "auto";
        settingsArea.style.top = `${Math.min(viewportHeight - panelRect.height - 8, rect.bottom + gap)}px`;
      }
    });
  }

  function openSettings() {
    if (!settingsArea.isConnected) document.documentElement.appendChild(settingsArea);
    settingsArea.classList.add("open");
    btnSettings.setAttribute("aria-expanded", "true");
    positionSettingsPopover();
  }

  function toggleSettings() {
    if (settingsArea.classList.contains("open")) closeSettings();
    else openSettings();
  }

  function clearInlineHost() {
    if (currentInlineHost?.isConnected) {
      currentInlineHost.classList.remove("igx-inline-overlay-host");
    }
    currentInlineHost = null;
  }

  function detachPopupOutsideChat() {
    closeSettings();
    clearInlineHost();
    if (popup.parentNode) popup.parentNode.removeChild(popup);
    if (settingsArea.parentNode) settingsArea.parentNode.removeChild(settingsArea);
  }

  function handleIgxRouteMaybeChanged(reason = "route") {
    const changed = igxLastPathname !== location.pathname;
    if (changed) igxLastPathname = location.pathname;

    if (!isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return;
    }

    attachInlineIfPossible();
    if (changed || reason === "visible") kickRefresh();
  }

  function installIgxRouteWatcher() {
    if (window.__igxRadiosondeInlineRouteWatcherV434) return;
    window.__igxRadiosondeInlineRouteWatcherV434 = true;

    const fire = () => setTimeout(() => handleIgxRouteMaybeChanged("history"), 80);
    ["pushState", "replaceState"].forEach((name) => {
      const original = history[name];
      history[name] = function () {
        const result = original.apply(this, arguments);
        fire();
        return result;
      };
    });

    window.addEventListener("popstate", fire, { passive: true });
  }

  function isVisibleEnough(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 18) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
    if (rect.right < 0 || rect.left > window.innerWidth) return false;
    return true;
  }

  function findComposerElement() {
    for (const selector of COMPOSER_SELECTORS) {
      const candidates = document.querySelectorAll(selector);
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (isVisibleEnough(candidates[i])) return candidates[i];
      }
    }
    return null;
  }

  function findInlineHost() {
    const composer = findComposerElement();
    if (!composer) return null;

    const wrapper =
      composer.closest("div.flex.w-full.flex-col.rounded-lg.border") ||
      composer.closest("div.flex.w-full.flex-col.rounded-lg") ||
      composer.closest("div[class*='rounded'][class*='border']") ||
      composer.closest("form") ||
      composer.parentElement;

    if (!(wrapper instanceof HTMLElement)) return null;

    if (
      currentInlineHost instanceof HTMLElement &&
      currentInlineHost.isConnected &&
      currentInlineHost !== document.body &&
      currentInlineHost !== document.documentElement &&
      currentInlineHost.contains(composer)
    ) {
      return currentInlineHost;
    }

    const candidates = [wrapper.parentElement, wrapper, wrapper.parentElement?.parentElement];
    const viewportWidth = window.innerWidth || 1;
    const composerRect = composer.getBoundingClientRect();
    const maxReasonableWidth = Math.min(
      viewportWidth * .9,
      Math.max(composerRect.width * 1.55, composerRect.width + 220),
    );

    for (const element of candidates) {
      if (!(element instanceof HTMLElement)) continue;
      if (element === document.body || element === document.documentElement) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 28) continue;
      if (rect.width > viewportWidth * .99 || rect.width > maxReasonableWidth) continue;
      return element;
    }

    let nearest = composer.parentElement;
    for (let depth = 0; nearest && depth < 8; depth += 1, nearest = nearest.parentElement) {
      if (!(nearest instanceof HTMLElement)) continue;
      if (nearest === document.body || nearest === document.documentElement) break;
      const rect = nearest.getBoundingClientRect();
      if (rect.width >= 180 && rect.width <= maxReasonableWidth && rect.height >= 28) return nearest;
    }
    return null;
  }

  function attachInlineIfPossible() {
    if (!isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return false;
    }

    const host = findInlineHost();
    if (!host) {
      if (popup.parentNode) popup.parentNode.removeChild(popup);
      clearInlineHost();
      closeSettings();
      return false;
    }

    if (currentInlineHost !== host) {
      clearInlineHost();
      currentInlineHost = host;
      currentInlineHost.classList.add("igx-inline-overlay-host");
    }

    if (popup.parentNode !== host) host.appendChild(popup);
    return true;
  }

  document.addEventListener("ccr:composer-layout", () => {
    if (!document.hidden && isIgxChatRoomPage()) attachInlineIfPossible();
  });

  btnSettings.setAttribute("aria-expanded", "false");
  btnSettings.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettings();
  });

  btnRefresh.addEventListener("click", (event) => {
    event.stopPropagation();
    refreshAll();
  });

  document.addEventListener("pointerdown", (event) => {
    if (!settingsArea.classList.contains("open")) return;
    if (settingsArea.contains(event.target) || btnSettings.contains(event.target)) return;
    closeSettings();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettings();
  }, true);

  window.addEventListener("scroll", (event) => {
    if (settingsArea.contains(event.target)) return;
    closeSettings();
  }, { capture: true, passive: true });
  window.visualViewport?.addEventListener("resize", positionSettingsPopover, { passive: true });

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    if (!isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return;
    }
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      attachInlineIfPossible();
      positionSettingsPopover();
    });
  }, { passive: true });

  setInterval(() => {
    if (!document.hidden && isIgxChatRoomPage()) attachInlineIfPossible();
    else if (!isIgxChatRoomPage()) detachPopupOutsideChat();
  }, INLINE_RETRY_MS);

  try {
    [
      "igx_rs_popup_layout_v3",
      "igx_rs_popup_inline_v3",
      "igx_rs_popup_top_v3",
      "igx_rs_popup_right_v3",
    ].forEach(key => localStorage.removeItem(key));
  } catch {}

  if (isIgxChatRoomPage()) attachInlineIfPossible();
  else detachPopupOutsideChat();

  function applyTheme() {
    const isDark = document.body.getAttribute("data-theme") === "dark";
    popup.classList.toggle("igx-light", !isDark);
    settingsArea.classList.toggle("igx-light", !isDark);
  }

  applyTheme();

  /**
   * body data-theme만 아주 좁게 감시.
   * class/style/subtree 감시는 모바일에서 부담되므로 금지.
   */
  const themeObserver = new MutationObserver(() => applyTheme());
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

  let lastRefreshKickAt = 0;

  function kickRefresh() {
    if (document.hidden || !isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return;
    }
    const now = Date.now();
    if (now - lastRefreshKickAt < 5000) return;
    lastRefreshKickAt = now;
    refreshAll();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    handleIgxRouteMaybeChanged("visible");
  });

  window.addEventListener("online", kickRefresh, { passive: true });

  setInterval(() => {
    if (!document.hidden && isIgxChatRoomPage()) refreshAll();
    else if (!isIgxChatRoomPage()) detachPopupOutsideChat();
  }, POLL_MS);

  installIgxRouteWatcher();

  // 채팅방에서 입력창 인라인을 찾은 뒤 모델 목록과 실시간 수치를 갱신한다.
  setTimeout(async () => {
    if (!isIgxChatRoomPage()) {
      detachPopupOutsideChat();
      return;
    }
    await discoverModels(initialCache);
    refreshAll();
  }, 800);
})();