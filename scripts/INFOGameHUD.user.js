// ==UserScript==
// @name         👾 Crack INFO Game HUD (미니 RPG HUD)
// @namespace    crack-info-game-hud-clean
// @version      3.5.8
// @description  크랙 채팅 최신 답변을 게임식 로그·관계도·HUD 코멘트로 정리하고, PET/마스코트·토큰 사용량·암호화 클라우드 인계·펫 다이어리를 지원합니다.
// @author       뤼부이
// @updateURL    https://gist.github.com/chyoyam-alt/e7370c75740314a4a34e4c1d2d4ed9d2/raw/INFOGameHUD.user.js
// @downloadURL  https://gist.github.com/chyoyam-alt/e7370c75740314a4a34e4c1d2d4ed9d2/raw/INFOGameHUD.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      aiplatform.googleapis.com
// @connect      *.aiplatform.googleapis.com
// @connect      www.gstatic.com
// @connect      identitytoolkit.googleapis.com
// @connect      cigh-cloud-save-default-rtdb.asia-southeast1.firebasedatabase.app
// @connect      *
// ==/UserScript==

(() => {
  'use strict';

  if (window.__CIGH_CLEAN_V240_RELEASE_LOADED__) return;
  window.__CIGH_CLEAN_V240_RELEASE_LOADED__ = true;

  const VERSION = '3.5.8';
  const FAB_ID = 'cigh-clean-fab';
  const PANEL_ID = 'cigh-clean-panel';
  const POPUP_ID = 'cigh-clean-popup';
  const COMMENT_POPUP_ID = 'cigh-clean-comment-popup';
  const DOCK_FAB_ID = 'cigh-clean-dock-fab';
  const TICKER_ID = 'cigh-clean-header-ticker';
  const DOCK_ACTIVE_CLASS = 'cigh-clean-header-dock-active';
  const SETTINGS_ID = 'cigh-clean-settings';
  const STYLE_ID = 'cigh-clean-style';

  const STORE_KEY = 'cigh_clean_store_v5';
  const POS_KEY = 'cigh_clean_pos_v1';
  const PANEL_HEIGHT_KEY = 'cigh_clean_panel_height_v1';
  const FAB_POS_KEY = 'cigh_clean_fab_pos_v1';
  const MASCOT_ID = 'cigh-clean-mascot';
  const MASCOT_STORE = 'cigh_clean_mascot_on_v1';
  const MASCOT_POS_KEY = 'cigh_clean_mascot_pos_v1';
  const PET_NAME_STORE = 'cigh_clean_pet_name_v1';
  const API_KEY_STORE = 'cigh_clean_gemini_api_key_v1';
  const STYLE_PROMPT_STORE = 'cigh_clean_log_style_prompt_v1';
  const CUSTOM_STYLES_STORE = 'cigh_clean_custom_styles_v1'; // 커스텀 LOG STYLE 저장소
  const COMMENT_POPUP_STORE = 'cigh_clean_comment_popup_v1';
  const MODEL_STORE = 'cigh_clean_gemini_model_v1';
  const THINKING_STORE = 'cigh_clean_thinking_budget_v1';
  const THINKING_LEVEL_STORE = 'cigh_clean_thinking_level_v1';
  const DEEPSEEK_API_KEY_STORE = 'cigh_clean_deepseek_api_key_v1';
  const DEEPSEEK_BASE_URL_STORE = 'cigh_clean_deepseek_base_url_v1';
  const DEEPSEEK_MODEL_STORE = 'cigh_clean_deepseek_model_v1';
  const DEEPSEEK_THIRD_PARTY_MODEL_STORE = 'cigh_clean_deepseek_third_party_model_v1';
  const DEEPSEEK_THINKING_STORE = 'cigh_clean_deepseek_thinking_v1';
  const AUTO_ANALYZE_STORE = 'cigh_clean_auto_analyze_v1';
  const UI_FONT_SIZE_STORE = 'cigh_clean_ui_font_size_v1';
  const SFX_STORE = 'cigh_clean_sfx_v1';
  const DOCK_MODE_STORE = 'cigh_clean_header_dock_v1';
  const SETTINGS_FOLD_STORE = 'cigh_clean_settings_fold_v1';
  const USAGE_STORE = 'cigh_clean_usage_v1';
  const DECO_STORE = 'cigh_clean_deco_v1';
  const CUSTOM_DECO_STORE = 'cigh_clean_custom_deco_v1';
  const CUSTOM_DECO_SHARE_PREFIX = 'CIGH-DECO1:';
  const CUSTOM_DECO_GRIDS = [16, 32, 64, 128];
  const CUSTOM_DECO_EDITOR_ZOOMS = [1, 2, 3, 4];
  const CUSTOM_DECO_PRESET_COLORS = [
    '#111111', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
    '#4a2c22', '#6b3e2e', '#8c5a3c', '#b07a50', '#d3a477', '#f0d0a8',
    '#7f1d1d', '#b42b2b', '#e25555', '#ff8a65', '#d95f02', '#f39c34',
    '#a66c00', '#d99b1d', '#f4c542', '#ffe18a',
    '#1f5f3b', '#2f8f56', '#57b66f', '#9ad18b',
    '#146b6b', '#259c9c', '#63c7c7',
    '#224a8f', '#326acb', '#5c8ee6', '#8fb7ff',
    '#5b3c88', '#8159b2', '#a97ad1',
    '#b43f73', '#df6698', '#f49bbb'
  ];
  const CUSTOM_DECO_MAX_ITEMS = 80;
  const CUSTOM_DECO_STORE_VERSION = 2;
  const CUSTOM_DECO_MAX_STORE_BYTES = 2_000_000;
  const CUSTOM_DECO_MAX_PALETTE = 255;
  const CUSTOM_DECO_MAX_LAYERS = 6;
  const IDLE_REWARD_STORE = 'cigh_clean_last_seen_at_v1';
  const IDLE_REWARD_MAX_MS = 6 * 60 * 60 * 1000;   // 최대 6시간만 적립
  const IDLE_REWARD_MIN_MS = 10 * 60 * 1000;       // 10분 미만은 무시
  const IDLE_REWARD_EXP_PER_HOUR = 8;              // 시간당 최소 EXP
  const IDLE_REWARD_MAX_LEVEL_RATE = 0.25;          // 6시간 기준 현재 레벨 구간 EXP의 25%
  const DECO_LOGS_PER_TICKET = 50; // 배포판: 로그 조사 50회 = 꾸밈티켓 1장

  // 업적/칭호 (전역 저장: 방 공유)
  const ACHV_STORE = 'cigh_clean_achv_v1';
  const ACHV_EQUIPPED_STORE = 'cigh_clean_achv_equipped_v1';

  // MY > RECORD (Crack 서버 사용 기록 + 로컬 이벤트 기록)
  const CRACK_RECORD_STORE = 'cigh_clean_crack_record_v1';
  const CONTENT_V280_MIGRATION_STORE = 'cigh_clean_content_v280_migrated';
  const CRACK_API_BASE = 'https://crack-api.wrtn.ai';
  const CRACK_CONTENTS_API_BASE = 'https://contents-api.wrtn.ai';
  const CRACK_RECORD_SYNC_TTL = 5 * 60 * 1000;
  const CRACK_RECORD_FAILURE_RETRY_COOLDOWN = 5 * 60 * 1000; // 자동 동기화 실패 후 재시도 폭주 방지
  const CRACK_RECORD_HISTORY_LIMIT = 20; // 서버 허용 최대값
  const CRACK_RECORD_INITIAL_MAX_PAGES = 80;
  const CRACK_RECORD_INCREMENTAL_MAX_PAGES = 20;

  // Crack 일일 출석 상태 확인 (00:00~05:59는 서버 출석 불가 시간)
  const CRACK_ATTENDANCE_POLL_MS = 15 * 60 * 1000;
  const CRACK_ATTENDANCE_MIN_RECHECK_MS = 60 * 1000;
  const CRACK_ATTENDANCE_REMINDER_COOLDOWN_MS = 4 * 60 * 60 * 1000;

  // PET bonus EXP: usageMetadata의 입력 토큰(promptTokenCount)을 로컬에서만 계산합니다.
  // API 호출이나 프롬프트 길이는 늘리지 않습니다.
  const PET_TOKEN_EXP_INPUT_UNIT = 1000;
  const PET_TOKEN_EXP_MAX = 30;
  // v3.2.0: 레벨업 요구 EXP를 기존 대비 1.5배로 확장. 기존 펫은 현재 레벨이 내려가지 않도록 normalizePet에서 EXP 하한을 보정한다.
  const PET_EXP_REQUIREMENT_MULTIPLIER = 1.5;

  const GEMINI_PROVIDER_STORE = 'cigh_clean_gemini_provider_v1';
  const FIREBASE_CONFIG_STORE = 'cigh_clean_firebase_config_v1';
  const FIREBASE_LOCATION_STORE = 'cigh_clean_firebase_location_v1';
  const FIREBASE_SDK_VERSION_STORE = 'cigh_clean_firebase_sdk_version_v1';

  // 암호화 클라우드 인계 (게임 데이터 수동 저장/불러오기 전용)
  // Firebase 웹 API 키는 클라이언트 식별자이며 비밀키가 아닙니다.
  // 실제 데이터는 코드+비밀번호에서 파생한 AES-GCM 키로 암호화한 뒤 저장합니다.
  const CLOUD_LINK_STORE = 'cigh_clean_cloud_link_v1';
  const CLOUD_API_KEY = 'AIzaSyCF-qvtHpdknZq8vcug-JDQnpwVLoha7r0';
  const CLOUD_DATABASE_URL = 'https://cigh-cloud-save-default-rtdb.asia-southeast1.firebasedatabase.app';
  const CLOUD_PATH_ROOT = 'cloudSaves';
  const CLOUD_SCHEMA_VERSION = 1;
  const CLOUD_RECORD_VERSION = 1;
  const CLOUD_PBKDF2_ITERATIONS = 210000;
  const CLOUD_PBKDF2_MOBILE_ITERATIONS = 100000;
  const CLOUD_EXPIRES_MS = 90 * 24 * 60 * 60 * 1000;
  const CLOUD_MAX_PLAINTEXT_BYTES = 4_500_000;
  const CLOUD_REQUEST_TIMEOUT = 25000;

  const GEMINI_MODEL_OPTIONS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ];

  const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
  const GEMINI_3X_FLASH_MODELS = new Set(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash']);
  const GEMINI_INTERACTIONS_MODELS = new Set(['gemini-3.7-flash', 'gemini-3.8-flash']);
  const DEFAULT_THINKING_BUDGET = 1024;
  const DEFAULT_GEMINI_THINKING_LEVEL = 'medium';
  const MIN_FIREBASE_GEMINI38_SDK_VERSION = '12.9.0';
  const DEEPSEEK_DIRECT_BASE_URL = 'https://api.deepseek.com';
  const DEEPSEEK_MODEL_OPTIONS = [
    { id: 'deepseek-v4-flash', label: 'V4 Flash' },
    { id: 'deepseek-v4-pro', label: 'V4 Pro' },
  ];
  const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
  const DEFAULT_FIREBASE_LOCATION = 'global';
  const DEFAULT_FIREBASE_SDK_VERSION = '12.18.0';
  const METER_UP_CAP = 8;
  const METER_DOWN_CAP = 12;
  const MASCOT_SPEECH_MS = 5200;
  const MASCOT_API_LINE_SPEECH_MS = 7600;

  // USD per 1M tokens. 단가 변동 시 이 표만 수정.
  // 2026-09-03 ai.google.dev Gemini Developer API pricing 기준.
  // 표준 text 단가 기준. 3.8 Flash는 implicit cache hit 단가까지 반영; 무료티어·Batch/Flex/Priority 미반영.
  // 주의: 3.5 Flash는 2.5 Flash보다 비싸고, 3.1 Flash-Lite는 2.5 Flash-Lite보다 비쌈.
  const CLOUD_SAVE_ALLOWED_KEYS = [
    STORE_KEY,
    POS_KEY,
    PANEL_HEIGHT_KEY,
    FAB_POS_KEY,
    MASCOT_STORE,
    MASCOT_POS_KEY,
    PET_NAME_STORE,
    STYLE_PROMPT_STORE,
    CUSTOM_STYLES_STORE,
    COMMENT_POPUP_STORE,
    MODEL_STORE,
    THINKING_STORE,
    THINKING_LEVEL_STORE,
    AUTO_ANALYZE_STORE,
    UI_FONT_SIZE_STORE,
    SFX_STORE,
    DOCK_MODE_STORE,
    SETTINGS_FOLD_STORE,
    USAGE_STORE,
    DECO_STORE,
    CUSTOM_DECO_STORE,
    IDLE_REWARD_STORE,
    ACHV_STORE,
    ACHV_EQUIPPED_STORE,
    CRACK_RECORD_STORE,
    'cigh_log_style_prompt_v1',
    'cigh_comment_popup_enabled_v1',
  ];

  const DEFAULT_TOKEN_PRICES = {
    // 3.8/3.7/3.6 Flash Standard introductory pricing through 2026-12-31.
    // 3.8 output 단가는 thinking token을 포함하며, implicit cache hit 입력은 $0.075/1M.
    'gemini-3.8-flash': { in: 0.75, cachedIn: 0.075, out: 3.75 },
    'gemini-3.7-flash': { in: 0.75, out: 3.75 },
    'gemini-3.6-flash': { in: 0.75, out: 3.75 },
    'gemini-3.1-pro-preview': { in: 2.00, out: 12.00 },
    'gemini-3.5-flash': { in: 1.50, out: 9.00 },
    'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
    'gemini-2.5-pro': { in: 1.25, out: 10.00 },
    'gemini-2.5-flash': { in: 0.30, out: 2.50 },
    'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  };

  // USD per 1M tokens. 2026-06 DeepSeek official pricing 기준.
  // 공식 가격은 변경될 수 있으므로 배포 전 재확인 필요.
  // 서드파티 endpoint(OpenRouter 등)는 공급자 단가가 다르므로 직접 API 단가를 그대로 적용하지 않는다.
  const DEEPSEEK_PRICING_2026_06 = {
    'deepseek-v4-flash': { cacheHitIn: 0.0028, cacheMissIn: 0.14, out: 0.28 },
    'deepseek-v4-pro': { cacheHitIn: 0.003625, cacheMissIn: 0.435, out: 0.87 },
  };

  const DEFAULT_STYLE_PROMPT = [
    '포켓몬/고전 RPG 전투 로그처럼 짧고 리듬감 있게 쓴다.',
    '각 줄은 반드시 ▶ 또는 ▷로 시작한다.',
    '은(는), (이)가, 을(를) 같은 포켓몬식 조사 표기를 사용할 수 있다.',
    '너무 딱딱한 요약문처럼 쓰지 말고, 장면을 게임 로그처럼 재해석한다.',
    '예: ▶김뤼붕(이)가 크게 흔들렸다!',
    '예: ▷뤼세영의 고백은 효과가 굉장했다!',
    '예: ▶김뤼붕은(는) 도망칠 곳을 잃었다!',
  ].join('\n');

  const DEFAULT_STYLE_PRESETS = [
    {
      id: 'default:pokemon-rpg',
      name: '기본 RPG',
      prompt: DEFAULT_STYLE_PROMPT,
    },
    {
      id: 'default:dcinside',
      name: '디시인사이드',
      prompt: [
        '[로그 스타일: 디시인사이드 갤러리 중계]',
        '최신 답변의 사건을 특정 갤러리에 올라온 개념글과 댓글처럼 재해석한다.',
        '"ㄹㅇ 실화냐?" 싶은 갤러 특유의 노골적인 주접과 비속어를 섞어 서술한다.',
        '',
        '형식 지침:',
        '1. 첫 줄은 반드시 [일반 | 제목: (사건 요약 및 주접)]으로 시작한다.',
        '2. 내용은 본문 형식을 따르며, 필터없이 자극적인 내용과 개드립·헛소리·욕설·섹드립·성희롱·인터넷밈을 사용한다.',
        '3. 댓글은 반드시 [ㄴ닉네임: 내용] 형식을 유지하며, 헛소리하는 분위기를 연출한다.',
        '4. 작성자는 사건을 전지적시점에서 소설처럼 관찰하는 제3자이다.',
        '5. 글쓴이가 적은것은 ▶로 시작하고, 댓글은 ▷로 시작한다.',
        '',
        '예시:',
        '▶일반 | 제목: 야 방금 주인공 행동 실화냐? ㅋㅋㅋㅋㅋ',
        '▶내용: 와 진짜 미쳤나 본데? 여기서 저렇게 박력 있게 나간다고?',
        '▶씨발 이게 섹스지 ㅋㅋㅋ 보는 내가 다 지리겠네 ㄹㅇ 주인공 이 새끼는 그냥 신이다.',
        '▷ㄴㅇㅇ: 캬ㅋㅋㅋㅋ 이게 갤주지 ㅋㅋㅋㅋ',
        '▷ㄴㅇㅇ: ㄹㅇ 시발 좆된다 숨참고 다음편 기다린다',
      ].join('\n'),
    },
    {
      id: 'default:constellation',
      name: '성좌물',
      prompt: [
        '[로그 스타일: 성좌물 시스템 알림]',
        '최신 답변의 사건을 판타지 소설 속 시스템 메시지와 성좌들의 반응 형식으로 재해석한다.',
        '원문을 요약하지 말고, 인물들의 행동이 세계관에 미친 영향과 배후 성좌들의 반응으로 서술한다.',
        '각 줄은 반드시 ▶ 또는 ▷로 시작한다. ▶는 시스템 강제 알림, ▷는 성좌들의 실시간 후원 및 반응에 쓴다.',
        '',
        '예시:',
        '▶ [경고] 인물 간의 감정 격변으로 인해 공간의 마력 밀도가 급격히 상승합니다.',
        '▶ [알림] 주인공이 치명적인 선택지를 선택했습니다. 인과율의 균열이 발생합니다.',
        "▷ '방구석 키보드 워리어' 성좌가 침을 삼킵니다 / [500 코인 후원 완료]",
      ].join('\n'),
    },
    {
      id: 'default:daily-drama-mothers',
      name: '일일드라마 과몰입 어머니회',
      prompt: [
        '[로그 스타일: 일일드라마 과몰입 어머니회]',
        '최신 답변의 사건을 막장 일일드라마 시청 중인 동네 어머니들의 시선으로 재해석한다. 구수한 사투리와 찰진 리액션, 주인공의 행동에 분통을 터뜨리거나 음흉하게 응원하는 분위기를 연출한다.',
        '',
        '형식 지침:',
        '작성자는 거실에 모여 과일을 깎아 먹으며 TV를 보는 춘자 여사 등 동네 어머니들이다.',
        '▶는 춘자 여사의 행동 묘사 및 메인 감상, ▷는 다른 어머니들의 참견 및 추임새로 쓴다.',
        '',
        '예시:',
        '▶ [안방극장 | 춘자네 거실] 춘자(이)가 깎던 사과를 멈추고 돋보기를 치켜올리며 TV 앞으로 바짝 다가앉습니다.',
        '▶ 춘자 여사: "아이고, 저 썩을 놈 저저 또 저칸다! 지 버릇 개 못 준다카더니 눈깔이 홱 도는 거 보소!"',
        '▷ 말자 아지매: "내 저럴 줄 알았다! 저 눔아 숨소리부터 영 찝찝하드만! 얼른 도망가라 캐라!"',
        '▷ 영숙 엄마: "어머, 근데 어째 쓰까잉... 화내는 것도 쪼매 섹시하긴 하네. 호호. 나는 찬성이여."',
      ].join('\n'),
    },
    {
      id: 'default:tabloid-paparazzi',
      name: '찌라시 파파라치 보도',
      prompt: [
        '[로그 스타일: 찌라시 파파라치 보도]',
        '캐릭터들 간의 은밀한 상황을 파파라치 컷이나 사내 익명 게시판 찌라시 기사처럼 자극적인 헤드라인으로 보도한다.',
        '',
        '형식 지침:',
        '최신 로그를 읽은 후 특종을 잡은 기자의 자극적인 기사 제목과 과장된 본문 텍스트를 사용한다.',
        '▶는 기사 헤드라인 및 본문 묘사, ▷는 익명 제보자의 증언이나 네티즌 댓글로 쓴다.',
        '',
        '예시:',
        '▶ [단독] "이 온도차 무엇?"... 빗속의 밀회, 구겨진 시트의 진실은?',
        '▶ 은밀한 공간에서 포착된 두 사람. 식어가는 커피잔 옆, 숨 막히는 침묵 속에서 오고 간 것은 과연 무엇이었을까.',
        '▷ 익명 제보자(측근): "그때 문 밖에서 들었는데, 목소리가 평소랑 완전히 달랐다니까요. 진짜 살벌하면서도..."',
        '▷ ㄴ댓글: 헐 드디어 올 것이 왔군. 팝콘 준비 완료.!',
      ].join('\n'),
    },
    {
      id: 'default:yumi-cells',
      name: '유미의 세포들',
      prompt: [
        '[로그 스타일: 유미의 세포들 (세포 회의)]',
        "- 최신 답변의 사건을 인물 머릿속 '세포 마을'에서 벌어지는 긴급 회의나 소동으로 재해석한다.",
        "- 귀여운 카오모지(텍스트 이모티콘)를 활용해 세포들의 감정을 생생하게 표현하며, 인물의 정체성을 대표하는 '프라임 세포'가 대화를 주도하도록 연출한다. (※ 인물의 성향에 따라 사랑세포 외에 이성세포, 자존심세포 등이 프라임이 될 수 있음)",
        '',
        '핵심 연출 지침 (다양성 확보):',
        '- 등장 세포는 최신 사건의 구체적 맥락에서 역으로 도출한다. 먼저 "이 장면에서 인물이 느낄 감정·욕구·반응이 뭔지" 분석한 뒤, 그 각각을 담당할 세포를 총 3~5개 배치하되, 그중 최소 1~2개는 상황 맞춤형 특수·마이너 세포여야 한다.',
        '- 매번 똑같은 세포(이성, 사랑, 불안 등)만 등장시키지 말고, 현재 로그의 구체적인 상황(스토리, 대사, 행동, 사소한 소품 등)에 직접적으로 반응하는 세포를 포함시킬 것.',
        '- 필요하다면 원작에 없는 상황 맞춤형 세포(예: 낯가림, 유교, 자본주의, 덕질, 기억상실 등)를 자유롭게 창작하여 회의에 참여시킬 것.',
        '',
        '형식 지침:',
        '- 첫 줄은 반드시 [세포 마을: (상황 요약 또는 회의 안건)]으로 시작한다.',
        '- 각 줄은 [OO세포]: (카오모지) (대사) 형태로 작성한다. 각 세포의 성격·감정에 어울리는 귀여운 카오모지를 대사 앞에 필수 포함한다.',
        "- 가장 강력한 권한을 가진 '프라임 세포' 하나를 지정해 이름 왼쪽에 👑표시를 붙인다.",
        '- 마지막 줄은 [결과: (최종 상태)] 형식으로 한 줄 요약하며 마친다.',
        '',
        '예시 (상황: 오랜만에 좋아하는 상대를 만나 긴장했을 때):',
        '[세포 마을: 3년 만에 재회한 그 사람 앞에서의 태도 설정]',
        '[이성세포]: ( ••) 차분하자. 일단 가벼운 안부 인사부터 건네는 게 자연스러워.',
        '[자존심세포]: (｀^´) 절대로 우리가 먼저 목매는 것처럼 보이면 안 돼! 쿨한 척 도도하게 간다!',
        '[낯가림세포]: (.. ) 으윽, 눈 마주치니까 무슨 말을 해야 할지 하나도 모르겠어... 로그아웃하고 싶다.',
        '[패션세포]: (*ゝω･*) 거 봐, 아까 구두 그거 신고 나오길 잘했지? 오늘 우리 착장 완벽하니까 기죽지 마!',
        '[결과: 자존심세포의 쿨병 정책과 낯가림세포의 고장으로 인해, 영혼 없는 어색한 미소만 짓게 되었다.]',
      ].join('\n'),
    },
  ];

  function getCustomStyles() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_STYLES_STORE) || '{}'); } catch { return {}; }
  }

  function saveCustomStyles(styles) {
    localStorage.setItem(CUSTOM_STYLES_STORE, JSON.stringify(styles));
  }

  const TABS = [
    { id: 'log', label: 'LOG' },
    { id: 'info', label: 'INFO' },
    { id: 'hud', label: 'HUD' },
    { id: 'pet', label: 'PET' },
    { id: 'achv', label: 'MY' },
  ];

  let activeTab = 'log';
  let currentData = null;
  let decoEditMode = false;
  let petSubTab = 'stats'; // 'stats' | 'diary' | 'dex'
  let recordSubTab = 'achv'; // 'achv' | 'record'
  let achvFilterMode = 'all'; // 'all' | 'done' | 'todo' · 화면 세션용
  let decoEditTab = 'prop';
  let decoDraft = null;
  let decoDragState = null;
  let customDecoCache = null;
  const customDecoImageCache = new Map();

  let logLines = [];
  let renderedLogLines = [];
  let logQueue = [];
  let isLogTyping = false;

  let popupQueue = [];
  let popupTyping = false;
  let popupLines = [];
  let popupRemoveTimer = null;
  let popupHideTimer = null;
  const popupLineRemoveTimers = new Set();

  let footerComments = [];
  let footerCommentIndex = 0;
  let footerTypingTimer = null;
  let footerLoopTimer = null;
  let footerLastText = '';
  let footerPopupRemaining = 0;
  let commentPopupTypingTimer = null;
  let commentPopupHideTimer = null;
  let commentPopupRunId = 0;

  let tickerQueue = [];
  let tickerRunning = false;
  let tickerLineVisible = false;
  let tickerNextTimer = null;
  let tickerHideTimer = null;
  let tickerAnimTimer = null;
  const TICKER_TRANSITION_MS = 700;
  const TICKER_HOLD_MS = 4500;
  const TICKER_BACKLOG_THRESHOLD = 5;
  const TICKER_BACKLOG_HOLD_MS = 3000;
  const TICKER_IDLE_HIDE_MS = 6000;

  let dragState = null;
  let resizeState = null;
  let fabDragState = null;
  let lastSeenRoomKey = roomKey();
  let routeWatchTimer = null;
  let routeChangeTimer = null;

  let autoAnalyzeTimer = null;
  let analyzeBusy = false;
  let autoAnalyzeInFlightContentKey = '';
  let audioContext = null;

  let cloudAuthSession = null;
  let cloudBusy = false;

  // ─────────────────────────────────────────────
  // Storage
  // ─────────────────────────────────────────────
  function roomKey() {
    const path = location.pathname;
    const m = path.match(/\/stories\/([^/]+)\/episodes\/([^/?#]+)/);
    if (m) return `${m[1]}:${m[2]}`;
    return path || 'default';
  }

  function emptyRoom() {
    return {
      data: null,
      history: [],
      logLines: [],
      lastAnalyzedKey: '',
      lastAnalyzedContentKey: '',
      analyzedContentKeys: [],
      analyzeCount: 0,
      commentLog: [],
      userName: '',
      diary: [],
      firstAnalyzedAt: 0,
      lastAnalyzedAt: 0,
      roomLabel: '',
      pet: defaultPet(),
    };
  }

  let __cighStoreCache = null;
  let cighStoreRaw = null;
  let cighAnalysisEpoch = 0;

  function readStore() {
    const raw = localStorage.getItem(STORE_KEY) || '{}';
    if (__cighStoreCache && cighStoreRaw === raw) return __cighStoreCache;
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { throw new Error('HUD 저장 데이터가 손상되어 덮어쓰기를 중단했어요. 백업을 확인해 주세요.'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('HUD 저장 형식이 올바르지 않아요.');
    cighStoreRaw = raw;
    return (__cighStoreCache = parsed);
  }

  // v3.4.4: localStorage 메인 저장소 자동 다이어트.
  // 클라우드 백업과 무관하게 STORE_KEY 자체를 작게 유지한다.
  // history.logs는 이미 logLines/업적 카운터에 반영되는 내부 중복본이라 저장하지 않고,
  // history는 최근 HUD 코멘트 보조용 12개만 남긴다. 최초/최종 분석 시각은 별도 필드로 보존한다.
  function compactRoomForLocalStorage(room) {
    if (!room || typeof room !== 'object' || Array.isArray(room)) return room;

    const sourceHistory = Array.isArray(room.history) ? room.history : [];
    const historyTimes = sourceHistory
      .map(item => Number(item?.at || 0))
      .filter(value => Number.isFinite(value) && value > 0);
    const firstAnalyzedAt = Number(room.firstAnalyzedAt || 0) > 0
      ? Number(room.firstAnalyzedAt)
      : (historyTimes.length ? Math.min(...historyTimes) : 0);
    const lastAnalyzedAt = Number(room.lastAnalyzedAt || 0) > 0
      ? Number(room.lastAnalyzedAt)
      : (historyTimes.length ? Math.max(...historyTimes) : 0);

    // history의 narrative logs는 현재 LOG 저장소와 누적 업적에 이미 반영된다.
    // 최근 12개의 코멘트/시각만 남겨 기존 다양화 보조 로직은 유지한다.
    const history = sourceHistory.slice(-12).map(item => {
      const comments = Array.isArray(item?.comments)
        ? item.comments.map(value => String(value || '')).filter(Boolean).slice(0, 3)
        : [];
      const compact = { at: Math.max(0, Number(item?.at || 0)) };
      if (item?.time) compact.time = String(item.time).slice(0, 24);
      if (comments.length) compact.comments = comments;
      return compact;
    });

    const commentLog = (Array.isArray(room.commentLog) ? room.commentLog : []).slice(-30).map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const compact = { ...item };
      const comments = Array.isArray(compact.comments)
        ? compact.comments.map(value => String(value || '')).filter(Boolean).slice(0, 3)
        : [];
      if (comments.length) {
        compact.comments = comments;
        // comments[0]과 완전히 같은 text 중복본은 다음 로드 시 필요하지 않다.
        if (String(compact.text || '') === comments[0]) delete compact.text;
      }
      return compact;
    });

    let data = room.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      data = { ...data };
      // sanitizeData()가 다음 로드에서 다시 만들어 주는 완전 중복 필드만 제거한다.
      if (Array.isArray(data.narrativeLogs)) delete data.pokemonLogs;
      if (Array.isArray(data.affection) && data.affection.length) delete data.relationshipMeters;
    }

    return {
      ...room,
      data,
      history,
      logLines: (Array.isArray(room.logLines) ? room.logLines : []).slice(-90),
      analyzedContentKeys: (Array.isArray(room.analyzedContentKeys) ? room.analyzedContentKeys : []).filter(Boolean).slice(-8),
      commentLog,
      diary: (Array.isArray(room.diary) ? room.diary : []).filter(Boolean).slice(-30),
      firstAnalyzedAt,
      lastAnalyzedAt,
    };
  }

  function compactStoreForLocalStorage(store) {
    const source = store && typeof store === 'object' && !Array.isArray(store) ? store : {};
    const compacted = {};
    for (const [key, value] of Object.entries(source)) {
      // 상점은 방 데이터가 아니므로 구조를 건드리지 않는다.
      compacted[key] = key === '_shop' ? value : compactRoomForLocalStorage(value);
    }
    return compacted;
  }

  function serializeStoreForLocalStorage(store) {
    return JSON.stringify(compactStoreForLocalStorage(store));
  }

  function compactExistingLocalStore() {
    const raw = localStorage.getItem(STORE_KEY) || '';
    if (!raw) return { changed: false, before: 0, after: 0 };
    try {
      const store = readStore();
      const json = serializeStoreForLocalStorage(store);
      // 이미 충분히 작은 형태면 쓸데없는 setItem을 하지 않는다.
      if (json.length >= raw.length) return { changed: false, before: raw.length, after: raw.length };
      localStorage.setItem(STORE_KEY, json);
      cighStoreRaw = json;
      // 현재 탭에서는 기존 객체를 캐시에 유지해 기능 상태를 바꾸지 않는다.
      __cighStoreCache = store;
      console.info(`[Crack INFO Game HUD] local store compacted: ${raw.length.toLocaleString()} → ${json.length.toLocaleString()} chars`);
      return { changed: true, before: raw.length, after: json.length };
    } catch (err) {
      console.warn('[Crack INFO Game HUD] local store compaction skipped:', err);
      return { changed: false, before: raw.length, after: raw.length, error: err };
    }
  }

  function writeStore(store) {
    try {
      const json = serializeStoreForLocalStorage(store);
      localStorage.setItem(STORE_KEY, json);
      cighStoreRaw = json;
      // 호출 측은 방금 만든 전체 객체를 계속 사용할 수 있게 메모리 캐시는 원본을 유지한다.
      __cighStoreCache = store;
    } catch (err) {
      __cighStoreCache = null;
      cighStoreRaw = null;
      if (/quota|storage.*full/i.test(String(err?.name) + ' ' + String(err?.message))) {
        throw new Error('HUD 저장공간이 부족해 저장하지 못했어요. 자동 저장 다이어트 후에도 공간이 부족합니다. 기존 저장 데이터는 유지됩니다.');
      }
      throw err;
    }
  }

  function getRoom() {
    const store = readStore();
    return store[roomKey()] || emptyRoom();
  }

  function setRoom(room) {
    writeStore({ ...readStore(), [roomKey()]: room });
  }

  function updateRoom(fn) {
    const room = JSON.parse(JSON.stringify(getRoom()));
    fn(room);
    setRoom(room);
    return room;
  }

  function getRoomUserName(room = getRoom()) {
    return String(room?.userName || '').trim().slice(0, 20);
  }

  function setRoomUserName(value) {
    const userName = String(value || '').trim().slice(0, 20);
    updateRoom(room => {
      room.userName = userName;
    });
    return userName;
  }

  function commitRoomUserNameInput(input, options = {}) {
    if (!(input instanceof HTMLInputElement)) return false;
    const before = getRoomUserName();
    const after = setRoomUserName(input.value);
    input.value = after;

    if (!options.silent || before !== after) {
      setFooter(after ? `USER 저장: ${after}` : 'USER 이름 비움');
      playBeep('save');
    }

    if (currentData && after) {
      currentData = stripRoomUserFromData(currentData, after);
      updateRoom(room => {
        if (room.data) room.data = stripRoomUserFromData(room.data, after);
      });
    }

    if (activeTab === 'info' && !options.noRender) renderContent();
    return true;
  }

  function resetInfoState() {
    flushPendingRoomLogs();
    cighAnalysisEpoch++;
    updateRoom(room => {
      markShopReward(room, null);
      room.data = null;
      room.history = [];
      room.lastAnalyzedKey = '';
      room.lastAnalyzedContentKey = '';
      room.analyzedContentKeys = [];
    });
    currentData = null;
    activeTab = 'info';

    const panel = document.getElementById(PANEL_ID);
    panel?.querySelectorAll?.('.cigh-clean-tab')?.forEach(tab => tab.classList.toggle('on', tab.dataset.tab === activeTab));

    setFooter('INFO RESET');
    pushLog(['▷INFO 정보를 초기화했다!', '▷다음 분석은 처음 상태처럼 다시 읽는다!']);
    showPopup(['▶INFO 초기화 완료!', '▷다시 로그를 읽으면 새로 정리한다!']);
    renderContent();
    playBeep('save');
  }

  function openInfoResetConfirm() {
    document.getElementById('cigh-clean-info-reset-modal')?.remove();

    const panel = document.getElementById(PANEL_ID);
    const mountInsidePanel = panel instanceof HTMLElement && panel.classList.contains('open');
    const host = mountInsidePanel ? panel : document.body;

    const modal = document.createElement('div');
    modal.id = 'cigh-clean-info-reset-modal';
    modal.className = `cigh-clean-confirm-backdrop${mountInsidePanel ? ' in-panel' : ''}`;
    modal.setAttribute('data-cigh-theme', detectThemeMode());
    modal.setAttribute('data-cigh-font', getUiFontSize());
    modal.innerHTML = `
      <div class="cigh-clean-confirm-box rpg" role="dialog" aria-modal="true" aria-label="INFO 초기화 확인">
        <div class="cigh-clean-confirm-title"><span class="cigh-clean-confirm-title-dot">◆</span><span>INFO RESET</span></div>
        <div class="cigh-clean-confirm-panel">
          <div class="cigh-clean-confirm-text">INFO 정보를 초기화할까요?</div>
          <div class="cigh-clean-confirm-help">관계도 / 인벤토리 / 상태 정보와<br>분석 완료 표시가 비워져요.</div>
          <div class="cigh-clean-confirm-help sub">다음 로그 분석을 처음처럼 다시 받을 수 있어요.</div>
        </div>
        <div class="cigh-clean-confirm-actions">
          <button type="button" class="cigh-clean-confirm-btn yes" data-info-reset-answer="yes"><span>YES</span></button>
          <button type="button" class="cigh-clean-confirm-btn no" data-info-reset-answer="no"><span>NO</span></button>
        </div>
      </div>
    `;

    modal.addEventListener('click', event => {
      const answer = event.target?.closest?.('[data-info-reset-answer]')?.dataset?.infoResetAnswer;
      if (!answer && event.target !== modal) return;

      event.preventDefault();
      event.stopPropagation();

      const yes = answer === 'yes';
      modal.remove();
      if (yes) resetInfoState();
    });

    host.appendChild(modal);
  }


  function resetCurrentRoomPetState() {
    // 현재 방의 펫 성장 데이터만 새 펫으로 교체한다.
    // INFO/다이어리/마이룸/상점/업적/도감/다른 방 데이터는 그대로 보존한다.
    flushPendingRoomLogs();
    cighAnalysisEpoch++;
    shopNotice = '';
    pendingPetCelebrate = null;
    const room = updateRoom(targetRoom => {
      targetRoom.pet = defaultPet();
    });
    const pet = getPet(room);

    resetPetVisualState();
    setFooter('PET RESET · Lv.1');
    pushLog(['▶이 방의 펫을 Lv.1로 초기화했다!', '▷새 성향을 쌓아 다른 진화형을 다시 키울 수 있다!']);
    showPopup(['▶PET RESET 완료!', '▷현재 방의 펫만 Lv.1부터 다시 시작한다!']);
    renderContent();
    refreshPetSurfaces(pet, { resetVisual: true });
    playBeep('save');
  }

  function openPetResetConfirm() {
    document.getElementById('cigh-clean-pet-reset-modal')?.remove();

    const panel = document.getElementById(PANEL_ID);
    const mountInsidePanel = panel instanceof HTMLElement && panel.classList.contains('open');
    const host = mountInsidePanel ? panel : document.body;

    const modal = document.createElement('div');
    modal.id = 'cigh-clean-pet-reset-modal';
    modal.className = `cigh-clean-confirm-backdrop${mountInsidePanel ? ' in-panel' : ''}`;
    modal.setAttribute('data-cigh-theme', detectThemeMode());
    modal.setAttribute('data-cigh-font', getUiFontSize());
    modal.innerHTML = `
      <div class="cigh-clean-confirm-box rpg" role="dialog" aria-modal="true" aria-label="펫 초기화 확인">
        <div class="cigh-clean-confirm-title"><span class="cigh-clean-confirm-title-dot">⚠</span><span>PET RESET</span></div>
        <div class="cigh-clean-confirm-panel">
          <div class="cigh-clean-confirm-text">이 방의 펫을 Lv.1로 초기화할까요?</div>
          <div class="cigh-clean-confirm-help">현재 방의 펫 성장 데이터가 사라져요.<br>레벨 / EXP / 성향 / 진화형 / 유대 / 최애 정보가 초기화됩니다.</div>
          <div class="cigh-clean-confirm-help sub">다른 방 · INFO · 펫 다이어리 · 마이룸 · 상점 · 업적 · 도감은 그대로 유지돼요.</div>
        </div>
        <div class="cigh-clean-confirm-actions">
          <button type="button" class="cigh-clean-confirm-btn yes" data-pet-reset-answer="yes"><span>RESET</span></button>
          <button type="button" class="cigh-clean-confirm-btn no" data-pet-reset-answer="no"><span>NO</span></button>
        </div>
      </div>
    `;

    modal.addEventListener('click', event => {
      const answer = event.target?.closest?.('[data-pet-reset-answer]')?.dataset?.petResetAnswer;
      if (!answer && event.target !== modal) return;

      event.preventDefault();
      event.stopPropagation();

      const yes = answer === 'yes';
      modal.remove();
      if (yes) resetCurrentRoomPetState();
    });

    host.appendChild(modal);
  }

  function loadRoomData() {
    const room = getRoom();
    const liveLabel = getCurrentRoomDisplayName();
    if (liveLabel && room.roomLabel !== liveLabel) {
      room.roomLabel = liveLabel;
      setRoom(room);
    }
    currentData = room.data ? stripRoomUserFromData(room.data, getRoomUserName(room)) : null;
    loadRoomLogLines(room);
    renderContent();
    refreshPetSurfaces(getPet(room), { resetVisual: true });
  }

  function resetPetVisualState() {
    PET_VISUAL_STATE.mode = 'normal';
    PET_VISUAL_STATE.until = 0;
    PET_VISUAL_STATE.dragActive = false;
    PET_VISUAL_STATE.lastActiveAt = Date.now();
  }

  function refreshPetSurfaces(pet = getPet(), options = {}) {
    if (options.resetVisual) resetPetVisualState();

    if (activeTab === 'pet') {
      updatePetPanelSpeech(pet);
      updatePetPanelSprite(pet);
    }

    if (shouldShowMascot()) updateMascotSprite(pet);
  }

  function defaultRoomLogLines() {
    const provider = getGeminiProvider();
    const ready = isSelectedProviderReady(provider);

    return [
      `◆ CRACK INFO GAME HUD v${VERSION}`,
      '─'.repeat(22),
      ready
        ? `▶${getProviderLabel(provider)} 준비 완료! (${getSelectedProviderModel(provider)})`
        : '▶상단 ⚙에서 API/Provider 설정을 저장하자!',
      isAutoAnalyzeEnabled() ? '▷새 답변 자동 읽기 ON!' : '▷새 답변 자동 읽기 OFF!',
      '▷◆ 길게 누르기 또는 ↻로 읽는다!',
    ];
  }

  function loadRoomLogLines(room = getRoom()) {
    logQueue = [];
    isLogTyping = false;
    logLines = Array.isArray(room.logLines) && room.logLines.length
      ? room.logLines.slice(-90)
      : defaultRoomLogLines();

    flushLog({ force: true });

    const roomLabel = document.getElementById('cigh-clean-room');
    if (roomLabel) roomLabel.textContent = roomKey().slice(-22);
    updateAnalyzeCountLabel();
  }

  function updateAnalyzeCountLabel() {
    const el = document.getElementById('cigh-clean-count');
    if (!el) return;
    el.textContent = `${getAnalyzeCount()}회`;
  }

  function getAnalyzeCount(room = getRoom()) {
    return Number(room?.analyzeCount || 0);
  }

  function getCurrentRoomDisplayName() {
    const text = document.querySelector('main span.line-clamp-1')?.textContent || '';
    return String(text).replace(/\s+/g, ' ').trim().slice(0, 48);
  }

  function getRoomFirstAnalyzedAt(room = getRoom()) {
    const explicit = Number(room?.firstAnalyzedAt || 0);
    if (explicit > 0) return explicit;
    const historyTimes = (Array.isArray(room?.history) ? room.history : [])
      .map(item => Number(item?.at || 0))
      .filter(v => Number.isFinite(v) && v > 0);
    return historyTimes.length ? Math.min(...historyTimes) : 0;
  }

  function migrateContentExpansionV280() {
    if (localStorage.getItem(CONTENT_V280_MIGRATION_STORE) === '1') return;
    try {
      const store = readStore();
      let knownNarrativeLines = 0;
      let roomAge30Known = false;
      let storeChanged = false;

      for (const room of Object.values(store)) {
        if (!room || typeof room !== 'object') continue;
        const history = Array.isArray(room.history) ? room.history : [];
        const times = history.map(item => Number(item?.at || 0)).filter(v => Number.isFinite(v) && v > 0);
        const firstAt = Number(room.firstAnalyzedAt || 0) > 0 ? Number(room.firstAnalyzedAt) : (times.length ? Math.min(...times) : 0);
        const lastAt = Number(room.lastAnalyzedAt || 0) > 0 ? Number(room.lastAnalyzedAt) : (times.length ? Math.max(...times) : 0);
        if (firstAt > 0 && !Number(room.firstAnalyzedAt || 0)) { room.firstAnalyzedAt = firstAt; storeChanged = true; }
        if (lastAt > 0 && !Number(room.lastAnalyzedAt || 0)) { room.lastAnalyzedAt = lastAt; storeChanged = true; }
        if (firstAt > 0 && lastAt >= firstAt && lastAt - firstAt >= 30 * 24 * 60 * 60 * 1000) roomAge30Known = true;
        for (const item of history) {
          knownNarrativeLines += (Array.isArray(item?.logs) ? item.logs : []).map(normalizeGameLine).filter(Boolean).length;
        }
      }

      if (storeChanged) writeStore(store);
      const state = readAchvState();
      state.counters.narrativeLogLines = Math.max(Number(state.counters.narrativeLogLines || 0), knownNarrativeLines);
      if (roomAge30Known) state.counters.roomAge30 = 1;
      const queueBefore = achvUnlockQueue.length;
      commitAchvState(state);
      if (achvUnlockQueue.length > queueBefore) achvUnlockQueue.splice(queueBefore);
      localStorage.setItem(CONTENT_V280_MIGRATION_STORE, '1');
    } catch (err) {
      console.warn('[Crack INFO Game HUD] v2.8.0 content migration failed:', err);
    }
  }

  // Coalesce logs produced in one synchronous action. Payments, pet effects and
  // other state still use immediate writes. Snapshots are bound to their room.
  const pendingRoomLogs=new Map();
  let roomLogSaveQueued=false;
  function queueRoomLogSave(){
    pendingRoomLogs.set(roomKey(),{lines:logLines.slice(-90),epoch:cighAnalysisEpoch});
    if(roomLogSaveQueued)return;
    roomLogSaveQueued=true;
    queueMicrotask(()=>{roomLogSaveQueued=false;flushPendingRoomLogs();});
  }
  function flushPendingRoomLogs(){
    if(!pendingRoomLogs.size)return true;
    try{
      const store={...readStore()};let changed=false;
      for(const [key,pending] of pendingRoomLogs){
        if(pending.epoch!==cighAnalysisEpoch)continue;
        const room=store[key]||emptyRoom();
        if(JSON.stringify(room.logLines||[])===JSON.stringify(pending.lines))continue;
        store[key]={...room,logLines:pending.lines};changed=true;
      }
      if(changed)writeStore(store);
      pendingRoomLogs.clear();return true;
    }catch(error){
      // Keep snapshots for a retry; never leave the shared cache half-mutated.
      console.warn('[Crack INFO Game HUD] log save failed:',error);
      setFooter('로그 저장 실패 · 저장공간을 확인해 주세요.');return false;
    }
  }
  function saveRoomLogLines(keyAtSave=roomKey()){
    pendingRoomLogs.set(keyAtSave,{lines:logLines.slice(-90),epoch:cighAnalysisEpoch});
    return flushPendingRoomLogs();
  }

  function normalizeGeminiApiKey(value) {
    return String(value || '')
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, '');
  }

  function getGeminiKey() {
    const gmKey = normalizeGeminiApiKey(gmGetValueSafe(API_KEY_STORE, ''));
    if (gmKey) return gmKey;

    // v3 이전 localStorage 키는 최초 조회 때 GM storage로 한 번만 안전하게 이관한다.
    const legacyStores = [API_KEY_STORE, 'cigh_gemini_api_key_v1', 'cro_gemini_api_key_v1'];
    const legacyKey = normalizeGeminiApiKey(legacyStores.map(key => localStorage.getItem(key) || '').find(Boolean) || '');
    if (!legacyKey) return '';

    try {
      assertGmValueStorage('Gemini API 키');
      GM_setValue(API_KEY_STORE, legacyKey);
      legacyStores.forEach(key => localStorage.removeItem(key));
    } catch (_) {
      // userscript 환경이 비정상적이어도 기존 localStorage 키는 그대로 사용해 기능을 깨지 않는다.
    }
    return legacyKey;
  }

  function setGeminiKey(value) {
    const key = normalizeGeminiApiKey(value);
    const legacyStores = [API_KEY_STORE, 'cigh_gemini_api_key_v1', 'cro_gemini_api_key_v1'];
    assertGmValueStorage('Gemini API 키');
    if (key) GM_setValue(API_KEY_STORE, key);
    else GM_deleteValue(API_KEY_STORE);
    legacyStores.forEach(storeKey => localStorage.removeItem(storeKey));
  }

  function hasGeminiKey() {
    return !!getGeminiKey();
  }

  function gmGetValueSafe(key, fallback = '') {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch (_) {}
    return fallback;
  }

  function assertGmValueStorage(label = 'API 키') {
    if (typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function' || typeof GM_deleteValue !== 'function') {
      throw new Error(`${label} 저장에는 GM_getValue/GM_setValue/GM_deleteValue 권한이 필요해요. userscript @grant를 확인해줘.`);
    }
  }

  function normalizeDeepSeekApiKey(value) {
    return String(value || '')
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, '');
  }

  function getDeepSeekKey() {
    return normalizeDeepSeekApiKey(gmGetValueSafe(DEEPSEEK_API_KEY_STORE, ''));
  }

  function setDeepSeekKey(value) {
    const key = normalizeDeepSeekApiKey(value);
    assertGmValueStorage('DeepSeek API 키');
    if (key) GM_setValue(DEEPSEEK_API_KEY_STORE, key);
    else GM_deleteValue(DEEPSEEK_API_KEY_STORE);
  }

  function clearDeepSeekKey() {
    assertGmValueStorage('DeepSeek API 키');
    GM_deleteValue(DEEPSEEK_API_KEY_STORE);
  }

  function hasDeepSeekKey() {
    return !!getDeepSeekKey();
  }

  function normalizeDeepSeekBaseUrl(value) {
    const raw = String(value || DEEPSEEK_DIRECT_BASE_URL).trim().replace(/\/+$/g, '');
    if (!raw) return DEEPSEEK_DIRECT_BASE_URL;
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return DEEPSEEK_DIRECT_BASE_URL;
      return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/g, '');
    } catch (_) {
      return DEEPSEEK_DIRECT_BASE_URL;
    }
  }

  function isDeepSeekLoopbackHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  }

  function validateDeepSeekBaseUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/g, '');
    if (!raw) return DEEPSEEK_DIRECT_BASE_URL;

    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      throw new Error('DeepSeek Base URL 형식이 올바르지 않아요.');
    }

    if (!/^https?:$/.test(url.protocol)) {
      throw new Error('DeepSeek Base URL은 http:// 또는 https:// 주소만 사용할 수 있어요.');
    }
    if (url.username || url.password) {
      throw new Error('DeepSeek Base URL에 사용자명이나 비밀번호를 포함할 수 없어요.');
    }
    if (url.protocol === 'http:' && !isDeepSeekLoopbackHost(url.hostname)) {
      throw new Error('외부 DeepSeek endpoint는 HTTPS만 사용할 수 있어요. HTTP는 localhost/127.0.0.1/[::1] 로컬 endpoint에서만 허용합니다.');
    }

    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/g, '');
  }

  function getDeepSeekBaseUrl() {
    return normalizeDeepSeekBaseUrl(localStorage.getItem(DEEPSEEK_BASE_URL_STORE) || DEEPSEEK_DIRECT_BASE_URL);
  }

  function setDeepSeekBaseUrl(value) {
    localStorage.setItem(DEEPSEEK_BASE_URL_STORE, validateDeepSeekBaseUrl(value));
  }

  function isDirectDeepSeekBaseUrl(value = getDeepSeekBaseUrl()) {
    try {
      const url = new URL(normalizeDeepSeekBaseUrl(value));
      return url.hostname === 'api.deepseek.com';
    } catch (_) {
      return false;
    }
  }

  function normalizeDeepSeekOfficialModelId(model) {
    const raw = String(model || DEFAULT_DEEPSEEK_MODEL).trim();
    if (raw === 'deepseek-chat') {
      setDeepSeekThinking(false);
      localStorage.setItem(DEEPSEEK_MODEL_STORE, DEFAULT_DEEPSEEK_MODEL);
      return DEFAULT_DEEPSEEK_MODEL;
    }
    if (raw === 'deepseek-reasoner') {
      setDeepSeekThinking(true);
      localStorage.setItem(DEEPSEEK_MODEL_STORE, DEFAULT_DEEPSEEK_MODEL);
      return DEFAULT_DEEPSEEK_MODEL;
    }

    return DEEPSEEK_MODEL_OPTIONS.some(item => item.id === raw) ? raw : DEFAULT_DEEPSEEK_MODEL;
  }

  function getDeepSeekOfficialModel() {
    return normalizeDeepSeekOfficialModelId(localStorage.getItem(DEEPSEEK_MODEL_STORE) || DEFAULT_DEEPSEEK_MODEL);
  }

  function setDeepSeekOfficialModel(model) {
    localStorage.setItem(DEEPSEEK_MODEL_STORE, normalizeDeepSeekOfficialModelId(model));
  }

  function getDeepSeekThirdPartyModel() {
    return String(localStorage.getItem(DEEPSEEK_THIRD_PARTY_MODEL_STORE) || '').trim();
  }

  function setDeepSeekThirdPartyModel(model) {
    const value = String(model || '').trim().slice(0, 160);
    if (value) localStorage.setItem(DEEPSEEK_THIRD_PARTY_MODEL_STORE, value);
    else localStorage.removeItem(DEEPSEEK_THIRD_PARTY_MODEL_STORE);
  }

  function getDeepSeekModel() {
    const thirdPartyModel = getDeepSeekThirdPartyModel();
    if (!isDirectDeepSeekBaseUrl() && thirdPartyModel) return thirdPartyModel;
    return getDeepSeekOfficialModel();
  }

  function isDeepSeekThinkingEnabled() {
    const value = localStorage.getItem(DEEPSEEK_THINKING_STORE);
    return value == null ? true : value !== '0';
  }

  function setDeepSeekThinking(enabled) {
    localStorage.setItem(DEEPSEEK_THINKING_STORE, enabled ? '1' : '0');
  }

  function getDeepSeekThinkingLabel() {
    return isDeepSeekThinkingEnabled() ? 'On' : 'Off';
  }

  function buildDeepSeekEndpointUrl(baseUrl = getDeepSeekBaseUrl()) {
    return `${normalizeDeepSeekBaseUrl(baseUrl)}/chat/completions`;
  }

  function getDeepSeekPricingSource(baseUrl = getDeepSeekBaseUrl()) {
    return isDirectDeepSeekBaseUrl(baseUrl) ? 'deepseek-direct' : 'third-party';
  }

  function normalizeGeminiModelId(model) {
    const raw = String(model || DEFAULT_GEMINI_MODEL).trim().replace(/^models\//, '');
    const aliases = {
      'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-3-pro': 'gemini-3.1-pro-preview',
    };
    const normalized = aliases[raw] || raw;
    return GEMINI_MODEL_OPTIONS.includes(normalized) ? normalized : DEFAULT_GEMINI_MODEL;
  }

  function getGeminiProvider() {
    let provider = String(localStorage.getItem(GEMINI_PROVIDER_STORE) || 'ai-studio').trim() || 'ai-studio';

    if (['firebase-ai', 'firebase-ai-logic', 'firebase-ailogic', 'Firebase AI Logic Beta'].includes(provider)) {
      provider = 'firebase';
    }
    if (['deepseek-api', 'deepseek-openai', 'deepseek'].includes(provider)) {
      provider = 'deepseek';
    }

    const hasFirebase = hasFirebaseConfig();
    const hasAiStudioKey = hasGeminiKey();

    if (provider === 'ai-studio' && hasFirebase && !hasAiStudioKey) {
      provider = 'firebase';
    }

    if (provider === 'firebase' || provider === 'deepseek') return provider;
    return 'ai-studio';
  }

  function setGeminiProvider(provider) {
    const value = String(provider || 'ai-studio').trim();
    localStorage.setItem(
      GEMINI_PROVIDER_STORE,
      value === 'firebase' ? 'firebase' : value === 'deepseek' ? 'deepseek' : 'ai-studio'
    );
  }

  function getProviderLabel(provider = getGeminiProvider()) {
    if (provider === 'firebase') return 'Firebase AI Logic';
    if (provider === 'deepseek') return 'DeepSeek API';
    return 'Google AI Studio';
  }

  function getSelectedProviderModel(provider = getGeminiProvider()) {
    if (provider === 'deepseek') return getDeepSeekModel();
    return getGeminiModel();
  }

  function isSelectedProviderReady(provider = getGeminiProvider()) {
    if (provider === 'firebase') return hasFirebaseConfig();
    if (provider === 'deepseek') return hasDeepSeekKey();
    return hasGeminiKey();
  }

  function isAutoAnalyzeEnabled() {
    const value = localStorage.getItem(AUTO_ANALYZE_STORE);
    return value !== '0';
  }

  function setAutoAnalyzeEnabled(enabled) {
    localStorage.setItem(AUTO_ANALYZE_STORE, enabled ? '1' : '0');
  }

  function getUiFontSize() {
    const value = String(localStorage.getItem(UI_FONT_SIZE_STORE) || 'small').trim();
    return ['small', 'medium', 'large'].includes(value) ? value : 'small';
  }

  function setUiFontSize(value) {
    const raw = String(value || '').trim();
    const safe = ['small', 'medium', 'large'].includes(raw) ? raw : 'small';
    localStorage.setItem(UI_FONT_SIZE_STORE, safe);
  }

  function isSfxEnabled() {
    return localStorage.getItem(SFX_STORE) !== '0';
  }

  function setSfxEnabled(enabled) {
    localStorage.setItem(SFX_STORE, enabled ? '1' : '0');
  }

  function isDockModeEnabled() {
    return localStorage.getItem(DOCK_MODE_STORE) === '1';
  }

  function setDockModeEnabled(enabled) {
    localStorage.setItem(DOCK_MODE_STORE, enabled ? '1' : '0');
  }


  function getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume?.().catch?.(() => {});
    return audioContext;
  }

  function playTone(ctx, { start, duration, freq, freqTo, type = 'sine', volume = 0.060 }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), start);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  function playBeep(type) {
    if (!isSfxEnabled()) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime + 0.006;
    try {
      if (type === 'open') {
        playTone(ctx, { start: now, duration: 0.09, freq: 320, freqTo: 480 });
      } else if (type === 'close') {
        playTone(ctx, { start: now, duration: 0.09, freq: 480, freqTo: 320 });
      } else if (type === 'analyze') {
        playTone(ctx, { start: now, duration: 0.06, freq: 260 });
        playTone(ctx, { start: now + 0.075, duration: 0.06, freq: 300 });
      } else if (type === 'done') {
        playTone(ctx, { start: now, duration: 0.07, freq: 300 });
        playTone(ctx, { start: now + 0.085, duration: 0.07, freq: 420 });
        playTone(ctx, { start: now + 0.17, duration: 0.07, freq: 540 });
      } else if (type === 'error') {
        playTone(ctx, { start: now, duration: 0.22, freq: 120, type: 'square', volume: 0.035 });
      } else if (type === 'tab') {
        playTone(ctx, { start: now, duration: 0.04, freq: 400, volume: 0.035 });
      } else if (type === 'save') {
        playTone(ctx, { start: now, duration: 0.12, freq: 520 });
      } else if (type === 'levelup') {
        playTone(ctx, { start: now, duration: 0.08, freq: 660 });
        playTone(ctx, { start: now + 0.085, duration: 0.08, freq: 784 });
        playTone(ctx, { start: now + 0.17, duration: 0.14, freq: 1047 });
      } else if (type === 'evolve') {
        playTone(ctx, { start: now, duration: 0.07, freq: 523 });
        playTone(ctx, { start: now + 0.075, duration: 0.07, freq: 659 });
        playTone(ctx, { start: now + 0.15, duration: 0.07, freq: 784 });
        playTone(ctx, { start: now + 0.225, duration: 0.1, freq: 1047 });
        playTone(ctx, { start: now + 0.34, duration: 0.18, freq: 1319, freqTo: 1568, volume: 0.04 });
      }
    } catch (err) {
      console.debug('[Crack INFO Game HUD] playBeep failed:', err);
    }
  }

  function getUiFontSizeLabel(value = getUiFontSize()) {
    return ({ small: '작게', medium: '보통', large: '크게' })[value] || '작게';
  }

  // ─────────────────────────────────────────────
  // Firebase AI Logic
  // ─────────────────────────────────────────────
  function getFirebaseConfigRaw() {
    return String(localStorage.getItem(FIREBASE_CONFIG_STORE) || '').trim();
  }

  function parseFirebaseConfigInput(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;

    let source = raw
      .replace(/^\s*const\s+firebaseConfig\s*=\s*/i, '')
      .replace(/^\s*let\s+firebaseConfig\s*=\s*/i, '')
      .replace(/^\s*var\s+firebaseConfig\s*=\s*/i, '')
      .replace(/;\s*$/g, '')
      .trim();

    const objectMatch = source.match(/\{[\s\S]*\}/);
    if (objectMatch) source = objectMatch[0];

    // 이미 JSON이면 그대로 사용한다. 배열/원시값은 Firebase config로 인정하지 않는다.
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {}

    // Firebase 콘솔이 보여주는 JS object literal은 실행(eval/Function)하지 않고
    // 표준 config 문자열 필드만 읽는다. 공유받은 문자열이 임의 JS로 실행되는 경로를 없앤다.
    const fields = [
      'apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket',
      'messagingSenderId', 'appId', 'measurementId',
    ];
    const parsed = {};
    for (const field of fields) {
      const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(String.raw`(?:^|[,{\s])(?:["']?${escapedField}["']?)\s*:\s*(["'])((?:\\.|(?!\1)[\s\S])*?)\1`);
      const match = source.match(pattern);
      if (!match) continue;
      const quote = match[1];
      let value = match[2];
      // Firebase config 값은 일반 문자열이므로 흔한 escape만 데이터로 복원한다.
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
      if (quote === '"') value = value.replace(/\\"/g, '"');
      else value = value.replace(/\\'/g, "'");
      parsed[field] = value;
    }

    if (Object.keys(parsed).length) return parsed;
    throw new Error('Firebase Config를 읽지 못했어요. Firebase 콘솔의 firebaseConfig 객체 전체를 붙여넣어줘.');
  }

  function getFirebaseConfig() {
    try {
      return parseFirebaseConfigInput(getFirebaseConfigRaw());
    } catch {
      return null;
    }
  }

  function setFirebaseConfig(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      localStorage.removeItem(FIREBASE_CONFIG_STORE);
      return;
    }

    const parsed = parseFirebaseConfigInput(raw);
    localStorage.setItem(FIREBASE_CONFIG_STORE, JSON.stringify(parsed, null, 2));
  }

  function hasFirebaseConfig() {
    return !!getFirebaseConfig();
  }

  function getFirebaseLocation() {
    return String(localStorage.getItem(FIREBASE_LOCATION_STORE) || DEFAULT_FIREBASE_LOCATION).trim() || DEFAULT_FIREBASE_LOCATION;
  }

  function setFirebaseLocation(value) {
    localStorage.setItem(FIREBASE_LOCATION_STORE, String(value || DEFAULT_FIREBASE_LOCATION).trim() || DEFAULT_FIREBASE_LOCATION);
  }

  function getFirebaseSdkVersion() {
    return String(localStorage.getItem(FIREBASE_SDK_VERSION_STORE) || DEFAULT_FIREBASE_SDK_VERSION).trim() || DEFAULT_FIREBASE_SDK_VERSION;
  }

  function setFirebaseSdkVersion(value) {
    localStorage.setItem(FIREBASE_SDK_VERSION_STORE, String(value || DEFAULT_FIREBASE_SDK_VERSION).trim() || DEFAULT_FIREBASE_SDK_VERSION);
  }

  function compareVersionTriplet(a, b) {
    const left = String(a || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    const right = String(b || '').split('.').map(part => Number.parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(left.length, right.length, 3); i++) {
      const diff = (left[i] || 0) - (right[i] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function getFirebaseSdkVersionForModel(model) {
    const configured = getFirebaseSdkVersion();
    if (isGemini38FlashModel(model) && compareVersionTriplet(configured, MIN_FIREBASE_GEMINI38_SDK_VERSION) < 0) {
      // 12.8.0부터 thinkingLevel, 12.9.0부터 cache usage metadata를 지원한다. 저장값은 유지하고 3.8 호출에만 최신 기본 SDK를 사용한다.
      return DEFAULT_FIREBASE_SDK_VERSION;
    }
    return configured;
  }

  function getFirebaseConfigSummary(config) {
    if (!config || typeof config !== 'object') return '';
    const projectId = String(config.projectId || '').trim();
    const appId = String(config.appId || '').trim();
    const apiKey = String(config.apiKey || '').trim();
    return [projectId, appId, apiKey].filter(Boolean).join('::') || JSON.stringify(config).slice(0, 80);
  }

  function hashTiny(text) {
    let hash = 0;
    const source = String(text || '');
    for (let i = 0; i < source.length; i++) {
      hash = ((hash << 5) - hash) + source.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  async function loadFirebaseAiModules(version = DEFAULT_FIREBASE_SDK_VERSION) {
    const safeVersion = String(version || DEFAULT_FIREBASE_SDK_VERSION).trim() || DEFAULT_FIREBASE_SDK_VERSION;
    const appUrl = `https://www.gstatic.com/firebasejs/${encodeURIComponent(safeVersion)}/firebase-app.js`;
    const aiUrl = `https://www.gstatic.com/firebasejs/${encodeURIComponent(safeVersion)}/firebase-ai.js`;

    try {
      const [appModule, aiModule] = await Promise.all([
        import(appUrl),
        import(aiUrl),
      ]);

      if (!appModule?.initializeApp || !appModule?.getApps || !appModule?.getApp) {
        throw new Error('firebase-app.js 모듈에서 initializeApp/getApps/getApp을 찾지 못했어요.');
      }
      if (!aiModule?.getAI || !aiModule?.getGenerativeModel || !aiModule?.VertexAIBackend) {
        throw new Error('firebase-ai.js 모듈에서 getAI/getGenerativeModel/VertexAIBackend를 찾지 못했어요.');
      }

      return { ...appModule, ...aiModule };
    } catch (err) {
      throw new Error(`Firebase SDK 로드 실패: ${err.message || err}. SDK 버전(${safeVersion}) 또는 네트워크/CORS를 확인해줘.`);
    }
  }

  function extractTextFromGeminiResponseData(data) {
    return (data?.candidates || [])
      .flatMap(candidate => candidate.content?.parts || candidate.parts || [])
      .map(part => part.text || '')
      .join('\n')
      .trim();
  }

  function buildFirebaseModelOptions(geminiRequest, payload) {
    const systemText = String((payload?.systemInstruction?.parts || [])
      .map(part => part?.text || '')
      .filter(Boolean)
      .join('\n')).trim();

    const options = {
      model: geminiRequest.model,
    };

    if (systemText) options.systemInstruction = systemText;
    if (payload?.generationConfig) options.generationConfig = payload.generationConfig;
    if (payload?.safetySettings) options.safetySettings = payload.safetySettings;

    return options;
  }

  async function callFirebaseAiLogicGenerateContent(geminiRequest, payload) {
    const firebaseConfig = parseFirebaseConfigInput(geminiRequest.firebaseConfigJson);
    if (!firebaseConfig || typeof firebaseConfig !== 'object') {
      throw new Error('Firebase Config가 비어 있어요.');
    }

    const location = String(geminiRequest.firebaseLocation || DEFAULT_FIREBASE_LOCATION).trim() || DEFAULT_FIREBASE_LOCATION;
    const sdkVersion = String(geminiRequest.firebaseSdkVersion || DEFAULT_FIREBASE_SDK_VERSION).trim() || DEFAULT_FIREBASE_SDK_VERSION;

    const firebase = await loadFirebaseAiModules(sdkVersion);
    const appName = `cigh-firebase-${hashTiny(getFirebaseConfigSummary(firebaseConfig))}`;
    const app = firebase.getApps().some(existing => existing.name === appName)
      ? firebase.getApp(appName)
      : firebase.initializeApp(firebaseConfig, appName);

    const ai = firebase.getAI(app, {
      backend: new firebase.VertexAIBackend(location),
    });

    const modelOptions = buildFirebaseModelOptions(geminiRequest, payload);
    const model = firebase.getGenerativeModel(ai, modelOptions);

    try {
      const request = {
        contents: Array.isArray(payload?.contents) ? payload.contents : [],
      };

      const result = await model.generateContent(request);
      const response = result?.response;
      const responseText = await response?.text?.();

      return {
        usageMetadata: response?.usageMetadata || result?.usageMetadata || null,
        candidates: [
          {
            content: {
              parts: [{ text: String(responseText || '').trim() }],
            },
          },
        ],
        _firebaseRaw: result,
      };
    } catch (err) {
      const message = String(err?.message || err || '').replace(/\s+/g, ' ').trim();
      throw new Error(`Firebase AI Logic 호출 실패: ${message || '알 수 없는 오류'}`);
    }
  }

  function isGemini3xFlashModel(model) {
    return GEMINI_3X_FLASH_MODELS.has(normalizeGeminiModelId(model));
  }

  function isGemini38FlashModel(model) {
    return normalizeGeminiModelId(model) === 'gemini-3.8-flash';
  }

  function isGeminiInteractionsModel(model) {
    return GEMINI_INTERACTIONS_MODELS.has(normalizeGeminiModelId(model));
  }

  function getGeminiThinkingConfigForModel(model) {
    const normalized = normalizeGeminiModelId(model);

    if (rbUsesThinkingLevels(normalized)) {
      return { thinkingLevel: getGeminiThinkingLevel() };
    }

    if (/^gemini-3\./.test(normalized)) {
      return { thinkingLevel: 'low' };
    }

    if (normalized === 'gemini-2.5-flash' || normalized === 'gemini-2.5-flash-lite') {
      return { thinkingBudget: getThinkingBudget() };
    }

    if (normalized === 'gemini-2.5-pro') {
      const budget = getThinkingBudget();
      return { thinkingBudget: budget === 0 ? -1 : budget };
    }

    return {};
  }

  function buildGeminiGenerationConfig(model, baseConfig = {}) {
    const normalized = normalizeGeminiModelId(model);
    const config = { ...baseConfig };

    // Gemini 3.6부터 sampling 파라미터는 폐기 대상이므로 요청에서 제외한다.
    if (isGemini3xFlashModel(normalized)) {
      delete config.temperature;
      delete config.topP;
      delete config.topK;
      delete config.candidateCount;
    }

    // Gemini 3.8 Flash는 아래 legacy sampling/penalty 파라미터를 보내면 무시되거나 오류가 나므로 모델별로 제거한다.
    if (isGemini38FlashModel(normalized)) {
      delete config.top_p;
      delete config.top_k;
      delete config.candidate_count;
      delete config.frequencyPenalty;
      delete config.frequency_penalty;
      delete config.presencePenalty;
      delete config.presence_penalty;
    }

    const thinkingConfig = getGeminiThinkingConfigForModel(normalized);
    return {
      ...config,
      ...(Object.keys(thinkingConfig).length ? { thinkingConfig } : {}),
    };
  }

  function getGeminiGenerateContentRequestConfig(options = {}) {
    const silent = !!options.silent;
    const provider = getGeminiProvider();
    const headers = { 'Content-Type': 'application/json' };
    const model = provider === 'deepseek' ? getDeepSeekModel() : normalizeGeminiModelId(getGeminiModel());

    console.log('[Crack INFO Game HUD] API request provider:', {
      provider,
      model,
      hasGeminiKey: hasGeminiKey(),
      hasFirebaseConfig: hasFirebaseConfig(),
      hasDeepSeekKey: hasDeepSeekKey(),
      deepSeekBaseUrl: provider === 'deepseek' ? getDeepSeekBaseUrl() : undefined,
      deepSeekEndpointType: provider === 'deepseek' ? getDeepSeekPricingSource() : undefined,
      firebaseLocation: getFirebaseLocation(),
      firebaseSdkVersion: provider === 'firebase' ? getFirebaseSdkVersionForModel(model) : getFirebaseSdkVersion(),
      geminiApiMode: provider === 'ai-studio' && isGeminiInteractionsModel(model) ? 'interactions' : 'generate-content',
    });

    if (provider === 'deepseek') {
      const apiKey = getDeepSeekKey();
      if (!apiKey) {
        if (silent) return null;
        throw new Error('DeepSeek API Key가 비어 있어요. 설정에서 DeepSeek API Key를 입력해줘.');
      }

      const baseUrl = getDeepSeekBaseUrl();
      validateDeepSeekBaseUrl(baseUrl);
      const isThirdPartyDeepSeek = !isDirectDeepSeekBaseUrl(baseUrl);
      const thirdPartyModel = getDeepSeekThirdPartyModel();
      if (isThirdPartyDeepSeek && !thirdPartyModel) {
        if (silent) return null;
        throw new Error('DeepSeek Base URL이 공식(api.deepseek.com)이 아니에요. 서드파티 endpoint를 쓰려면 커스텀 모델 ID를 입력해줘.');
      }

      return {
        provider: 'deepseek',
        model,
        baseUrl,
        url: buildDeepSeekEndpointUrl(baseUrl),
        pricingSource: getDeepSeekPricingSource(baseUrl),
        headers: {
          ...headers,
          Authorization: `Bearer ${apiKey}`,
        },
        thinkingEnabled: isDeepSeekThinkingEnabled(),
      };
    }

    if (provider === 'firebase') {
      const firebaseConfigJson = getFirebaseConfigRaw();
      if (!firebaseConfigJson) {
        if (silent) return null;
        throw new Error('Firebase AI Logic 사용 시 Firebase Config가 필요해요.');
      }

      return {
        provider,
        model,
        firebaseConfigJson,
        firebaseLocation: isGemini3xFlashModel(model) ? 'global' : getFirebaseLocation(),
        firebaseSdkVersion: getFirebaseSdkVersionForModel(model),
        headers: {},
      };
    }

    const apiKey = getGeminiKey();
    if (!apiKey) {
      if (silent) return null;
      throw new Error('Gemini API Key가 비어 있어요. 설정에서 Google Gemini API Key(AIza/AQ 계열)를 입력해줘.');
    }

    const useInteractions = isGeminiInteractionsModel(model);
    return {
      provider: 'ai-studio',
      model,
      apiMode: useInteractions ? 'interactions' : 'generate-content',
      headers: {
        ...headers,
        // AI Studio 새 API 키(AQ/AQ. 계열 포함)는 URL query보다 헤더 인증이 안전합니다.
        'x-goog-api-key': apiKey,
      },
      // 3.7/3.8 Flash는 현재 Interactions API 경로를 우선 사용한다.
      // 다른 Gemini 모델은 기존 generateContent 경로를 유지해 회귀 위험을 줄인다.
      url: useInteractions
        ? 'https://generativelanguage.googleapis.com/v1beta/interactions'
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    };
  }

  function extractGeminiPartText(part) {
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.inlineData?.data === 'string') return '';
    return '';
  }

  function buildOpenAiMessagesFromGeminiPayload(payload) {
    const messages = [];

    const systemText = String((payload?.systemInstruction?.parts || [])
      .map(extractGeminiPartText)
      .filter(Boolean)
      .join('\n')).trim();

    if (systemText) messages.push({ role: 'system', content: systemText });

    const contents = Array.isArray(payload?.contents) ? payload.contents : [];
    for (const content of contents) {
      const text = String((content?.parts || [])
        .map(extractGeminiPartText)
        .filter(Boolean)
        .join('\n')).trim();
      if (!text) continue;

      const rawRole = String(content?.role || 'user').toLowerCase();
      const role = rawRole === 'model' || rawRole === 'assistant'
        ? 'assistant'
        : rawRole === 'system'
          ? 'system'
          : 'user';

      messages.push({ role, content: text });
    }

    if (!messages.length) messages.push({ role: 'user', content: '' });
    return messages;
  }

  function estimateTokensFromText(text) {
    const len = String(text || '').length;
    if (!len) return 0;
    return Math.max(1, Math.ceil(len / 3));
  }

  function estimateTokensFromMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .reduce((sum, msg) => sum + estimateTokensFromText(msg?.content || ''), 0);
  }

  function isJsonMimeType(value) {
    return /json/i.test(String(value || ''));
  }

  function buildDeepSeekChatCompletionPayload(geminiRequest, payload) {
    const generationConfig = payload?.generationConfig || {};
    const messages = buildOpenAiMessagesFromGeminiPayload(payload);
    const wantsJson = isJsonMimeType(generationConfig.responseMimeType);

    if (wantsJson && !messages.some(msg => /json|JSON|제이슨|객체|코드블록|마크다운/i.test(String(msg.content || '')))) {
      messages.unshift({
        role: 'system',
        content: 'JSON만 출력한다. 코드블록, 마크다운, 설명문, JSON 외 텍스트는 출력하지 않는다.',
      });
    }

    const thinkingOverride = String(payload?._cighDeepSeekThinkingOverride || '');
    const thinkingEnabled = thinkingOverride === 'disabled' ? false : !!geminiRequest.thinkingEnabled;

    const requestBody = {
      model: geminiRequest.model,
      messages,
      stream: false,
      thinking: { type: thinkingEnabled ? 'enabled' : 'disabled' },
    };

    const maxTokens = Number(generationConfig.maxOutputTokens || generationConfig.max_tokens || 0);
    if (Number.isFinite(maxTokens) && maxTokens > 0) requestBody.max_tokens = Math.floor(maxTokens);

    if (wantsJson) requestBody.response_format = { type: 'json_object' };

    if (thinkingEnabled) {
      requestBody.reasoning_effort = 'high';
      // DeepSeek thinking 모드에서는 temperature/top_p/presence/frequency 계열이 효과 없으므로 보내지 않는다.
    } else if (Number.isFinite(Number(generationConfig.temperature))) {
      requestBody.temperature = Number(generationConfig.temperature);
    }

    return requestBody;
  }

  function normalizeDeepSeekUsage(usage, meta = {}, requestBody = null, responseText = '') {
    const model = String(meta.model || requestBody?.model || getDeepSeekModel());
    const provider = 'deepseek';
    const pricingSource = String(meta.pricingSource || getDeepSeekPricingSource());
    const isThirdParty = pricingSource !== 'deepseek-direct';

    if (!usage || typeof usage !== 'object') {
      const inputTokens = estimateTokensFromMessages(requestBody?.messages || []);
      const outputTokens = estimateTokensFromText(responseText);
      return {
        provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        cacheHitInputTokens: 0,
        cacheMissInputTokens: inputTokens,
        reasoningTokens: 0,
        isEstimated: true,
        pricingSource,
        isThirdParty,
      };
    }

    const inputTokens = Math.max(0, Math.floor(Number(usage.prompt_tokens || 0)));
    const outputTokens = Math.max(0, Math.floor(Number(usage.completion_tokens || 0)));
    const totalTokens = Math.max(0, Math.floor(Number(usage.total_tokens || (inputTokens + outputTokens) || 0)));
    const cacheHitInputTokens = Math.max(0, Math.floor(Number(usage.prompt_cache_hit_tokens || 0)));
    const cacheMissFallback = usage.prompt_cache_miss_tokens ?? usage.prompt_tokens ?? 0;
    const cacheMissInputTokens = Math.max(0, Math.floor(Number(cacheMissFallback || 0)));
    const reasoningTokens = Math.max(0, Math.floor(Number(usage.completion_tokens_details?.reasoning_tokens || 0)));

    return {
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      cacheHitInputTokens,
      cacheMissInputTokens,
      reasoningTokens,
      isEstimated: false,
      pricingSource,
      isThirdParty,
    };
  }

  function compactDeepSeekRawForDebug(data) {
    const choice = data?.choices?.[0] || {};
    return {
      id: data?.id || '',
      model: data?.model || '',
      finish_reason: choice?.finish_reason || '',
      usage: data?.usage || null,
      contentPreview: String(choice?.message?.content || '').slice(0, 600),
      hasReasoningContent: !!choice?.message?.reasoning_content,
    };
  }

  async function callDeepSeekChatCompletion(geminiRequest, payload) {
    const requestBody = buildDeepSeekChatCompletionPayload(geminiRequest, payload);

    let data;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        data = await gmRequestJson({
          method: 'POST',
          url: geminiRequest.url,
          headers: geminiRequest.headers,
          data: requestBody,
          timeout: 45000,
          label: 'DeepSeek',
        });
        break;
      } catch (err) {
        const message = String(err?.message || err || '').replace(/\s+/g, ' ').trim();
        const canRetry = /네트워크 오류|응답 JSON 파싱 실패/i.test(message);
        if (canRetry && attempt === 0) continue;
        if (/DeepSeek 401|DeepSeek 403/.test(message)) throw new Error('DeepSeek 인증 오류: API Key를 확인해줘.');
        if (/DeepSeek 429/.test(message)) throw new Error('DeepSeek 요청 한도 초과: 잠시 후 다시 시도해줘.');
        if (/DeepSeek 400/.test(message)) throw new Error(`DeepSeek 요청 오류: 요청 바디/모델 ID/base URL을 확인해줘. ${message}`);
        throw err;
      }
    }

    const choice = data?.choices?.[0] || {};
    const message = choice?.message || {};
    const content = String(message.content || '').trim();

    const normalizedUsage = normalizeDeepSeekUsage(
      data?.usage,
      {
        model: geminiRequest.model,
        pricingSource: geminiRequest.pricingSource,
      },
      requestBody,
      content
    );

    return {
      candidates: [
        {
          finishReason: choice.finish_reason || '',
          content: { parts: [{ text: content }] },
        },
      ],
      usage: data?.usage || null,
      _normalizedUsage: normalizedUsage,
      _deepseekRaw: compactDeepSeekRawForDebug(data),
    };
  }

  function getInteractionSystemInstruction(payload) {
    return String((payload?.systemInstruction?.parts || [])
      .map(extractGeminiPartText)
      .filter(Boolean)
      .join('\n')).trim();
  }

  function getInteractionInputText(payload) {
    const contents = Array.isArray(payload?.contents) ? payload.contents : [];
    const chunks = [];

    for (const content of contents) {
      const text = String((content?.parts || [])
        .map(extractGeminiPartText)
        .filter(Boolean)
        .join('\n')).trim();
      if (!text) continue;

      const role = String(content?.role || 'user').toLowerCase();
      // 현재 HUD 호출은 단일 user prompt지만, 추후 여러 contents가 들어와도
      // 역할 경계가 완전히 사라지지 않도록 간단한 라벨을 붙인다.
      if (contents.length > 1) chunks.push(`${role === 'model' ? 'MODEL' : 'USER'}:\n${text}`);
      else chunks.push(text);
    }

    return chunks.join('\n\n').trim();
  }

  function buildGeminiInteractionsPayload(geminiRequest, payload) {
    const sourceConfig = payload?.generationConfig || {};
    const thinking = sourceConfig?.thinkingConfig || {};
    const generationConfig = {};

    if (Number.isFinite(Number(sourceConfig.maxOutputTokens))) {
      generationConfig.max_output_tokens = Math.max(1, Math.floor(Number(sourceConfig.maxOutputTokens)));
    }
    if (Number.isFinite(Number(sourceConfig.seed))) generationConfig.seed = Number(sourceConfig.seed);
    if (Array.isArray(sourceConfig.stopSequences) && sourceConfig.stopSequences.length) {
      generationConfig.stop_sequences = sourceConfig.stopSequences.map(String).filter(Boolean);
    }
    if (Number.isFinite(Number(sourceConfig.temperature))) generationConfig.temperature = Number(sourceConfig.temperature);
    if (thinking?.thinkingLevel) generationConfig.thinking_level = String(thinking.thinkingLevel).toLowerCase();

    const requestBody = {
      model: geminiRequest.model,
      input: getInteractionInputText(payload),
      // HUD 분석은 매 호출마다 필요한 문맥을 직접 넣으므로 서버에 대화 상태를 저장하지 않는다.
      store: false,
    };

    const systemInstruction = getInteractionSystemInstruction(payload);
    if (systemInstruction) requestBody.system_instruction = systemInstruction;
    if (Object.keys(generationConfig).length) requestBody.generation_config = generationConfig;

    if (isJsonMimeType(sourceConfig.responseMimeType)) {
      requestBody.response_format = [{ type: 'text', mime_type: 'application/json' }];
    }

    // 최신 Interactions API는 safety_settings를 지원한다. 3.8은 기존 generateContent/Firebase와 같은 설정을 전달한다.
    if (isGemini38FlashModel(geminiRequest.model) && Array.isArray(payload?.safetySettings) && payload.safetySettings.length) {
      requestBody.safety_settings = payload.safetySettings;
    }

    return requestBody;
  }

  function extractInteractionOutputText(data) {
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    const modelSteps = steps.filter(step => String(step?.type || '') === 'model_output');
    const target = modelSteps.length ? modelSteps[modelSteps.length - 1] : null;
    if (!target) return '';

    return (Array.isArray(target.content) ? target.content : [])
      .filter(block => String(block?.type || '') === 'text')
      .map(block => String(block?.text || ''))
      .join('')
      .trim();
  }

  function normalizeInteractionAsGenerateContent(data) {
    const usage = data?.usage && typeof data.usage === 'object' ? data.usage : {};
    const input = Math.max(0, Number(usage.total_input_tokens || 0));
    const output = Math.max(0, Number(usage.total_output_tokens || 0));
    const thought = Math.max(0, Number(usage.total_thought_tokens || 0));
    const cached = Math.max(0, Number(usage.total_cached_tokens || 0));
    const total = Math.max(0, Number(usage.total_tokens || (input + output + thought)));
    const text = extractInteractionOutputText(data);
    const status = String(data?.status || '').toLowerCase();

    let finishReason = 'STOP';
    if (status === 'incomplete' || status === 'budget_exceeded') finishReason = 'LENGTH';
    else if (status && status !== 'completed') finishReason = status.toUpperCase();

    return {
      candidates: [{
        finishReason,
        content: { parts: [{ text }] },
      }],
      usageMetadata: {
        promptTokenCount: input,
        candidatesTokenCount: output,
        thoughtsTokenCount: thought,
        cachedContentTokenCount: Math.min(input, cached),
        totalTokenCount: total,
      },
      _interactionRaw: data,
    };
  }

  async function callGeminiInteractions(geminiRequest, payload) {
    const requestBody = buildGeminiInteractionsPayload(geminiRequest, payload);
    const data = await gmRequestJson({
      method: 'POST',
      url: geminiRequest.url,
      headers: geminiRequest.headers,
      data: requestBody,
      timeout: 45000,
      label: 'Gemini Interactions',
    });

    const status = String(data?.status || '').toLowerCase();
    if (status === 'failed' || status === 'cancelled') {
      const detail = (Array.isArray(data?.errors) ? data.errors : [])
        .map(item => item?.message || item?.code || '')
        .filter(Boolean)
        .join(' / ');
      throw new Error(`Gemini Interactions ${status}: ${detail || '응답 생성에 실패했어요.'}`);
    }

    return normalizeInteractionAsGenerateContent(data);
  }

  async function requestGeminiGenerateContent(geminiRequest, payload) {
    if (geminiRequest?.provider === 'firebase') {
      return await callFirebaseAiLogicGenerateContent(geminiRequest, payload);
    }

    if (geminiRequest?.provider === 'deepseek') {
      return await callDeepSeekChatCompletion(geminiRequest, payload);
    }

    if (geminiRequest?.provider === 'ai-studio' && geminiRequest?.apiMode === 'interactions') {
      return await callGeminiInteractions(geminiRequest, payload);
    }

    return await gmRequestJson({
      method: 'POST',
      url: geminiRequest.url,
      headers: geminiRequest.headers,
      data: payload,
      timeout: 25000,
      label: 'Gemini',
    });
  }

  function gmRequestJson({ method, url, headers, data, timeout = 25000, label = 'API' }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        timeout,
        data: data ? JSON.stringify(data) : undefined,
        onload: res => {
          if (res.status < 200 || res.status >= 300) {
            let message = res.responseText || `HTTP ${res.status}`;
            try {
              const parsed = JSON.parse(res.responseText || '{}');
              message = parsed.error?.message || parsed.message || message;
            } catch (_) {}
            reject(new Error(`${label} ${res.status} 오류: ${String(message).slice(0, 500)}`));
            return;
          }

          try {
            resolve(JSON.parse(res.responseText || '{}'));
          } catch (err) {
            reject(new Error(`${label} 응답 JSON 파싱 실패: ${err?.message || err}`));
          }
        },
        onerror: () => reject(new Error(`${label} 네트워크 오류`)),
        ontimeout: () => reject(new Error(`${label} 응답 시간 초과`)),
      });
    });
  }

  function getStylePrompt() {
    return String(
      localStorage.getItem(STYLE_PROMPT_STORE) ||
      localStorage.getItem('cigh_log_style_prompt_v1') ||
      DEFAULT_STYLE_PROMPT
    ).trim();
  }

  function setStylePrompt(value) {
    const prompt = String(value || '').trim();
    if (prompt) localStorage.setItem(STYLE_PROMPT_STORE, prompt);
    else localStorage.removeItem(STYLE_PROMPT_STORE);
  }

  function resetStylePrompt() {
    localStorage.removeItem(STYLE_PROMPT_STORE);
  }

  function isCommentPopupEnabled() {
    const value = localStorage.getItem(COMMENT_POPUP_STORE);
    if (value != null) return value !== '0';

    const oldValue = localStorage.getItem('cigh_comment_popup_enabled_v1');
    if (oldValue != null) return oldValue !== '0';

    return true;
  }

  function setCommentPopupEnabled(enabled) {
    localStorage.setItem(COMMENT_POPUP_STORE, enabled ? '1' : '0');
  }


  function getGeminiModel() {
    return normalizeGeminiModelId(localStorage.getItem(MODEL_STORE) || DEFAULT_GEMINI_MODEL);
  }

  function setGeminiModel(model) {
    localStorage.setItem(MODEL_STORE, normalizeGeminiModelId(model));
  }

  function getThinkingBudget() {
    const n = Number(localStorage.getItem(THINKING_STORE) || DEFAULT_THINKING_BUDGET);
    if (n === -1) return -1;
    if ([0, 512, 1024, 2048, 4096].includes(n)) return n;
    return DEFAULT_THINKING_BUDGET;
  }

  function setThinkingBudget(value) {
    const n = Number(value);
    const safe = (n === -1 || [0, 512, 1024, 2048, 4096].includes(n)) ? n : DEFAULT_THINKING_BUDGET;
    localStorage.setItem(THINKING_STORE, String(safe));
  }

  function getGeminiThinkingLevel() {
    const raw = String(localStorage.getItem(THINKING_LEVEL_STORE) || DEFAULT_GEMINI_THINKING_LEVEL).trim().toLowerCase();
    return ['low', 'medium', 'high'].includes(raw) ? raw : DEFAULT_GEMINI_THINKING_LEVEL;
  }

  function setGeminiThinkingLevel(value) {
    const raw = String(value || DEFAULT_GEMINI_THINKING_LEVEL).trim().toLowerCase();
    const safe = ['low', 'medium', 'high'].includes(raw) ? raw : DEFAULT_GEMINI_THINKING_LEVEL;
    localStorage.setItem(THINKING_LEVEL_STORE, safe);
  }

  // ─────────────────────────────────────────────
  // Usage / settings fold state
  // ─────────────────────────────────────────────
  function defaultUsage() {
    return {
      inputTokens: 0,
      outputTokens: 0,
      requestCount: 0,
      estimatedRequestCount: 0,
      byModel: {},
    };
  }

  function usageModelKey(model, provider = '', pricingSource = '') {
    const raw = String(model || '').trim().replace(/^models\//, '');
    const providerKey = String(provider || '').trim();

    if (providerKey === 'deepseek') {
      const prefix = pricingSource === 'deepseek-direct' ? 'deepseek' : 'deepseek-3p';
      return `${prefix}:${raw || DEFAULT_DEEPSEEK_MODEL}`;
    }

    if (providerKey === 'firebase') return `firebase:${raw || DEFAULT_GEMINI_MODEL}`;
    return raw || DEFAULT_GEMINI_MODEL;
  }

  function normalizeUsage(raw) {
    const base = defaultUsage();
    const usage = raw && typeof raw === 'object' ? raw : {};
    const byModel = {};

    for (const [model, item] of Object.entries(usage.byModel || {})) {
      const provider = String(item?.provider || (String(model).startsWith('deepseek') ? 'deepseek' : '') || '');
      const pricingSource = String(item?.pricingSource || (String(model).startsWith('deepseek:') ? 'deepseek-direct' : String(model).startsWith('deepseek-3p:') ? 'third-party' : '') || '');
      const modelName = String(item?.model || String(model).replace(/^deepseek-3p:/, '').replace(/^deepseek:/, '').replace(/^firebase:/, '') || model);
      const key = usageModelKey(modelName, provider, pricingSource);

      byModel[key] = {
        provider,
        model: modelName,
        pricingSource,
        input: Math.max(0, Math.floor(Number(item?.input || 0))),
        output: Math.max(0, Math.floor(Number(item?.output || 0))),
        total: Math.max(0, Math.floor(Number(item?.total || item?.input + item?.output || 0))),
        cacheHit: Math.max(0, Math.floor(Number(item?.cacheHit || 0))),
        cacheMiss: Math.max(0, Math.floor(Number(item?.cacheMiss ?? item?.input ?? 0))),
        reasoning: Math.max(0, Math.floor(Number(item?.reasoning || 0))),
        count: Math.max(0, Math.floor(Number(item?.count || 0))),
        estimatedCount: Math.max(0, Math.floor(Number(item?.estimatedCount || 0))),
      };
    }

    return {
      ...base,
      inputTokens: Math.max(0, Math.floor(Number(usage.inputTokens || 0))),
      outputTokens: Math.max(0, Math.floor(Number(usage.outputTokens || 0))),
      requestCount: Math.max(0, Math.floor(Number(usage.requestCount || 0))),
      estimatedRequestCount: Math.max(0, Math.floor(Number(usage.estimatedRequestCount || 0))),
      byModel,
    };
  }

  function getUsage() {
    try {
      return normalizeUsage(JSON.parse(localStorage.getItem(USAGE_STORE) || '{}'));
    } catch {
      return defaultUsage();
    }
  }

  function setUsage(usage) {
    localStorage.setItem(USAGE_STORE, JSON.stringify(normalizeUsage(usage)));
  }

  function addUsageNormalized(normalized) {
    if (!normalized || typeof normalized !== 'object') return;

    const provider = String(normalized.provider || '').trim();
    const model = String(normalized.model || getSelectedProviderModel(provider || getGeminiProvider()));
    const pricingSource = String(normalized.pricingSource || '');
    const inTok = Math.max(0, Math.floor(Number(normalized.inputTokens || 0)));
    const outTok = Math.max(0, Math.floor(Number(normalized.outputTokens || 0)));
    const totalTok = Math.max(0, Math.floor(Number(normalized.totalTokens || inTok + outTok || 0)));
    const cacheHit = Math.max(0, Math.floor(Number(normalized.cacheHitInputTokens || 0)));
    const cacheMiss = Math.max(0, Math.floor(Number(normalized.cacheMissInputTokens ?? inTok ?? 0)));
    const reasoning = Math.max(0, Math.floor(Number(normalized.reasoningTokens || 0)));
    const estimated = !!normalized.isEstimated;

    if (!inTok && !outTok && !totalTok) return;

    const key = usageModelKey(model, provider, pricingSource);
    const usage = getUsage();
    const prev = usage.byModel[key] || {
      provider,
      model,
      pricingSource,
      input: 0,
      output: 0,
      total: 0,
      cacheHit: 0,
      cacheMiss: 0,
      reasoning: 0,
      count: 0,
      estimatedCount: 0,
    };

    usage.inputTokens += inTok;
    usage.outputTokens += outTok;
    usage.requestCount += 1;
    if (estimated) usage.estimatedRequestCount += 1;

    usage.byModel[key] = {
      provider: provider || prev.provider || '',
      model: model || prev.model || key,
      pricingSource: pricingSource || prev.pricingSource || '',
      input: prev.input + inTok,
      output: prev.output + outTok,
      total: prev.total + totalTok,
      cacheHit: prev.cacheHit + cacheHit,
      cacheMiss: prev.cacheMiss + cacheMiss,
      reasoning: prev.reasoning + reasoning,
      count: prev.count + 1,
      estimatedCount: prev.estimatedCount + (estimated ? 1 : 0),
    };

    setUsage(usage);
    if (inTok) bumpAchvCounter('tokenK', inTok);
    updateUsageSettingsSummary();
  }


  function resetUsage() {
    localStorage.removeItem(USAGE_STORE);
    updateUsageSettingsSummary();
  }

  function getTokenPrices() {
    return {
      gemini: { ...DEFAULT_TOKEN_PRICES },
      deepseek: { ...DEEPSEEK_PRICING_2026_06 },
    };
  }

  function formatInt(value) {
    return Math.max(0, Math.floor(Number(value || 0))).toLocaleString('en-US');
  }

  function formatUsd(value) {
    const n = Math.max(0, Number(value || 0));
    if (n === 0) return '$0.0000';
    return `$${n < 0.0001 ? n.toFixed(6) : n.toFixed(4)}`;
  }

  function usageCostForRow(row, prices = getTokenPrices()) {
    if (row?.provider === 'deepseek') {
      if (row.pricingSource !== 'deepseek-direct') return null;
      const price = prices.deepseek?.[row.model];
      if (!price) return null;
      return (Number(row.cacheHit || 0) / 1_000_000) * Number(price.cacheHitIn || 0)
        + (Number(row.cacheMiss || 0) / 1_000_000) * Number(price.cacheMissIn || 0)
        + (Number(row.output || 0) / 1_000_000) * Number(price.out || 0);
    }

    const price = prices.gemini?.[usageModelKey(row?.model || '')] || prices.gemini?.[row?.model || ''];
    if (!price) return null;

    const cachedIn = Number(price.cachedIn);
    if (Number.isFinite(cachedIn) && cachedIn >= 0) {
      const cacheHit = Math.min(Number(row.input || 0), Math.max(0, Number(row.cacheHit || 0)));
      const cacheMiss = Math.max(0, Number(row.input || 0) - cacheHit);
      return (cacheHit / 1_000_000) * cachedIn
        + (cacheMiss / 1_000_000) * Number(price.in || 0)
        + (Number(row.output || 0) / 1_000_000) * Number(price.out || 0);
    }

    return (Number(row.input || 0) / 1_000_000) * Number(price.in || 0)
      + (Number(row.output || 0) / 1_000_000) * Number(price.out || 0);
  }

  function getUsageCostSummary() {
    const usage = getUsage();
    const prices = getTokenPrices();
    let totalCost = 0;
    const rows = [];

    for (const [key, item] of Object.entries(usage.byModel || {})) {
      const row = { key, ...item };
      const cost = usageCostForRow(row, prices);
      if (typeof cost === 'number') totalCost += cost;
      rows.push({ ...row, cost });
    }

    rows.sort((a, b) => b.count - a.count || String(a.model || a.key).localeCompare(String(b.model || b.key)));
    return { usage, prices, rows, totalCost };
  }

  function getSettingsFoldState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_FOLD_STORE) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function setSettingsFoldState(section, collapsed) {
    const state = getSettingsFoldState();
    state[String(section || '')] = !!collapsed;
    localStorage.setItem(SETTINGS_FOLD_STORE, JSON.stringify(state));
  }

  function isSettingsSectionCollapsed(section) {
    return !!getSettingsFoldState()[String(section || '')];
  }

  function settingsSection(section, title, bodyHtml, options = {}) {
    const collapsed = isSettingsSectionCollapsed(section);
    const extra = options.subtitle ? ' cigh-clean-settings-subtitle' : '';
    return `
      <div class="cigh-clean-settings-title${extra}" data-fold-section="${esc(section)}" role="button" tabindex="0" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span class="cigh-clean-fold-arrow">${collapsed ? '▸' : '▾'}</span><span>${esc(title)}</span>
      </div>
      <div class="cigh-clean-fold-body${collapsed ? ' collapsed' : ''}" data-fold-body="${esc(section)}">
        ${bodyHtml}
      </div>
    `;
  }

  function extractUsageTokens(body) {
    const u = body?.usageMetadata || body?._firebaseRaw?.response?.usageMetadata || body?._firebaseRaw?.usageMetadata;
    if (!u || typeof u !== 'object') return null;

    const input = Number(u.promptTokenCount || 0);
    let output = Number(u.candidatesTokenCount || 0);
    const thought = Number(u.thoughtsTokenCount || u.thinkingTokenCount || 0);
    if (Number.isFinite(thought) && thought > 0) output += thought;
    const cached = Number(u.cachedContentTokenCount || u.cachedTokenCount || 0);

    const total = Number(u.totalTokenCount || 0);
    if ((!Number.isFinite(output) || output <= 0) && Number.isFinite(total) && total > input) {
      output = total - input;
    }

    if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
    return {
      input: Math.max(0, Math.floor(Number.isFinite(input) ? input : 0)),
      output: Math.max(0, Math.floor(Number.isFinite(output) ? output : 0)),
      thought: Math.max(0, Math.floor(Number.isFinite(thought) ? thought : 0)),
      cachedInput: Math.max(0, Math.floor(Number.isFinite(cached) ? Math.min(cached, input) : 0)),
    };
  }

  function extractNormalizedUsage(body, request = {}) {
    if (body?._normalizedUsage) return body._normalizedUsage;

    const tokens = extractUsageTokens(body);
    if (!tokens) return null;

    return {
      provider: request?.provider || '',
      model: request?.model || getSelectedProviderModel(request?.provider || getGeminiProvider()),
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      totalTokens: tokens.input + tokens.output,
      cacheHitInputTokens: tokens.cachedInput || 0,
      cacheMissInputTokens: Math.max(0, tokens.input - (tokens.cachedInput || 0)),
      reasoningTokens: tokens.thought || 0,
      isEstimated: false,
      pricingSource: request?.provider === 'deepseek' ? request?.pricingSource : '',
    };
  }

  function usageTokensForPet(normalized) {
    if (!normalized) return null;
    return {
      input: normalized.inputTokens || normalized.input || 0,
      output: normalized.outputTokens || normalized.output || 0,
      estimated: !!normalized.isEstimated,
    };
  }


  function getSettingsRoot(root = document) {
    if (root?.id === SETTINGS_ID) return root;
    return root?.querySelector?.(`#${SETTINGS_ID}`) || null;
  }



  function buildUsageSettingsHtml() {
    return `
      ${buildUsageSummaryHtml()}
      <div class="cigh-clean-settings-help cigh-clean-usage-note">
        Gemini generateContent/Firebase는 usageMetadata, Gemini 3.7/3.8 Interactions는 usage를 실제 토큰으로 집계합니다. DeepSeek는 usage가 있으면 cache hit/miss까지 반영하고, usage가 없으면 대략 추정으로 표시합니다.<br>
        단가는 코드 내장 고정값(100만 토큰당 USD)입니다. Gemini 3.8은 thinking token을 출력 단가에 포함하고, usage에 cache hit가 있으면 공식 cached-input 단가를 반영합니다. DeepSeek 공식 endpoint는 2026-06 기준 단가로 계산하고, 그 외 endpoint는 비용을 '-'로 표시합니다.
      </div>
      <div class="cigh-clean-settings-row">
        <button type="button" class="cigh-clean-set-btn red" data-action="usage-reset">사용량 초기화</button>
      </div>
    `;
  }


  function updateUsageSettingsSummary(root = document) {
    const settingsRoot = getSettingsRoot(root);
    const summary = settingsRoot?.querySelector?.('[data-usage-summary="1"]');
    if (!summary) return;
    summary.outerHTML = buildUsageSummaryHtml();
  }

  function refreshUsageSettingsSection(root = document) {
    const settingsRoot = getSettingsRoot(root);
    const body = settingsRoot?.querySelector?.('[data-fold-body="usage"]');
    if (!body) return;
    body.innerHTML = buildUsageSettingsHtml();
  }



  // ─────────────────────────────────────────────
  // Encrypted cloud transfer
  // ─────────────────────────────────────────────
  function normalizeCloudCode(value) {
    let raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.startsWith('CIGH')) raw = raw.slice(4);
    raw = raw.replace(/[IO01]/g, '').slice(0, 8);
    if (raw.length !== 8) return '';
    return `CIGH-${raw.slice(0, 4)}-${raw.slice(4)}`;
  }

  function generateCloudCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let token = '';
    for (const byte of bytes) token += alphabet[byte % alphabet.length];
    return normalizeCloudCode(token);
  }

  function getCloudLink() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CLOUD_LINK_STORE) || '{}');
      const code = normalizeCloudCode(parsed?.code || '');
      if (!code) return { code: '', pathId: '', lastSavedAt: 0 };
      const pathId = /^[a-f0-9]{64}$/i.test(String(parsed?.pathId || '')) ? String(parsed.pathId).toLowerCase() : '';
      return {
        code,
        pathId,
        lastSavedAt: Math.max(0, Number(parsed?.lastSavedAt || 0)),
      };
    } catch {
      return { code: '', pathId: '', lastSavedAt: 0 };
    }
  }

  function setCloudLink(code, options = {}) {
    const normalized = normalizeCloudCode(code);
    if (!normalized) {
      localStorage.removeItem(CLOUD_LINK_STORE);
      return;
    }

    const previous = getCloudLink();
    const requestedPathId = String(options.pathId ?? previous.pathId ?? '').toLowerCase();
    localStorage.setItem(CLOUD_LINK_STORE, JSON.stringify({
      code: normalized,
      pathId: /^[a-f0-9]{64}$/.test(requestedPathId) ? requestedPathId : '',
      lastSavedAt: Math.max(0, Number(options.lastSavedAt ?? previous.lastSavedAt ?? 0)),
    }));
  }

  function clearCloudLink() {
    localStorage.removeItem(CLOUD_LINK_STORE);
  }

  function formatCloudDate(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return '없음';
    try {
      return new Intl.DateTimeFormat('ko-KR', {
        year: '2-digit', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString();
    }
  }

  function cloudTextEncoder() {
    if (!window.TextEncoder) throw new Error('이 브라우저는 클라우드 암호화를 지원하지 않아요.');
    return new TextEncoder();
  }

  function cloudTextDecoder() {
    if (!window.TextDecoder) throw new Error('이 브라우저는 클라우드 복호화를 지원하지 않아요.');
    return new TextDecoder();
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function sha256Hex(value) {
    if (!crypto?.subtle) throw new Error('이 브라우저는 Web Crypto를 지원하지 않아요.');
    const digest = await crypto.subtle.digest('SHA-256', cloudTextEncoder().encode(String(value || '')));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function getCloudPathId(code, password) {
    const normalized = normalizeCloudCode(code);
    if (!normalized) throw new Error('인계 코드 형식이 올바르지 않아요.');
    if (String(password || '').length < 8) throw new Error('인계 비밀번호는 8자 이상 입력해줘.');
    return await sha256Hex(`CIGH-CLOUD-PATH-V1\n${normalized}\n${String(password)}`);
  }

  async function assertCloudPasswordMatchesLocalLink(code, password) {
    const link = getCloudLink();
    const normalized = normalizeCloudCode(code);
    const pathId = await getCloudPathId(normalized, password);
    if (link.code === normalized && link.pathId && link.pathId !== pathId) {
      throw new Error('이 브라우저에 연결된 인계 비밀번호와 달라요. 비밀번호를 다시 확인해줘.');
    }
    return pathId;
  }

  function isLowPowerCloudDevice() {
    try {
      const cores = Number(navigator.hardwareConcurrency || 0);
      const lowCore = cores > 0 && cores <= 4;
      const mobile = /Android|iPhone|iPad/i.test(String(navigator.userAgent || ''));
      return lowCore || mobile;
    } catch {
      return false;
    }
  }

  function getCloudPbkdf2Iterations() {
    return isLowPowerCloudDevice() ? CLOUD_PBKDF2_MOBILE_ITERATIONS : CLOUD_PBKDF2_ITERATIONS;
  }

  async function deriveCloudAesKey(code, password, salt, iterations = CLOUD_PBKDF2_ITERATIONS) {
    if (!crypto?.subtle) throw new Error('이 브라우저는 Web Crypto를 지원하지 않아요.');
    const normalized = normalizeCloudCode(code);
    const safeIterations = Math.max(100000, Number(iterations || CLOUD_PBKDF2_ITERATIONS));
    const material = await crypto.subtle.importKey(
      'raw',
      cloudTextEncoder().encode(`${normalized}\u0000${String(password || '')}`),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // 저사양 모바일에서 저장/불러오기 버튼을 누른 직후 UI가 멎어 보이지 않도록
    // 실제 키 파생 직전에 한 프레임 양보한다. 기존 210k 저장본 복호화는 record.iterations를 그대로 따른다.
    if (isLowPowerCloudDevice()) await new Promise(resolve => setTimeout(resolve, 0));

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations: safeIterations,
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function collectCloudBackupPayload() {
    const items = {};
    for (const key of CLOUD_SAVE_ALLOWED_KEYS) {
      const value = localStorage.getItem(key);
      if (typeof value === 'string') items[key] = value;
    }
    // v2.10.0+: 커스텀 가구 저장소는 비어 있어도 키 자체를 넣는다.
    // 그래야 신버전의 '빈 CUSTOM'과 구버전 백업의 'CUSTOM 키 없음'을 구분할 수 있다.
    if (!Object.prototype.hasOwnProperty.call(items, CUSTOM_DECO_STORE)) {
      items[CUSTOM_DECO_STORE] = JSON.stringify(defaultCustomDecoStore());
    }

    const payload = {
      format: 'cigh-cloud-save',
      schemaVersion: CLOUD_SCHEMA_VERSION,
      scriptVersion: VERSION,
      exportedAt: Date.now(),
      items,
    };

    const json = JSON.stringify(payload);
    const bytes = cloudTextEncoder().encode(json).byteLength;
    if (bytes > CLOUD_MAX_PLAINTEXT_BYTES) {
      throw new Error(`클라우드 저장 데이터가 너무 커요. (${Math.ceil(bytes / 1024).toLocaleString()}KB / 최대 ${Math.floor(CLOUD_MAX_PLAINTEXT_BYTES / 1024).toLocaleString()}KB)`);
    }
    return { payload, json, bytes };
  }

  function validateCloudBackupPayload(payload) {
    if (!payload || typeof payload !== 'object' || payload.format !== 'cigh-cloud-save') {
      throw new Error('클라우드 백업 형식이 올바르지 않아요.');
    }
    if (Number(payload.schemaVersion) !== CLOUD_SCHEMA_VERSION) {
      throw new Error(`지원하지 않는 클라우드 백업 버전이에요. (${payload.schemaVersion ?? '?'})`);
    }
    if (!payload.items || typeof payload.items !== 'object' || Array.isArray(payload.items)) {
      throw new Error('클라우드 백업의 저장 항목이 올바르지 않아요.');
    }

    const allowed = new Set(CLOUD_SAVE_ALLOWED_KEYS);
    const items = {};
    for (const [key, value] of Object.entries(payload.items)) {
      if (!allowed.has(key)) continue;
      if (typeof value !== 'string') throw new Error(`백업 항목 형식이 올바르지 않아요: ${key}`);
      items[key] = value;
    }
    return { ...payload, items };
  }

  async function encryptCloudPayload(code, password, json, plaintextBytes) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = getCloudPbkdf2Iterations();
    const key = await deriveCloudAesKey(code, password, salt, iterations);
    const additionalData = cloudTextEncoder().encode(`CIGH-CLOUD-DATA-V1\n${normalizeCloudCode(code)}`);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      key,
      cloudTextEncoder().encode(json)
    );

    const now = Date.now();
    return {
      version: CLOUD_RECORD_VERSION,
      schemaVersion: CLOUD_SCHEMA_VERSION,
      algorithm: 'AES-GCM-256/PBKDF2-SHA256',
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      plaintextBytes: Math.max(0, Number(plaintextBytes || 0)),
      scriptVersion: VERSION,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + CLOUD_EXPIRES_MS,
    };
  }

  async function decryptCloudRecord(code, password, record) {
    if (!record || typeof record !== 'object') throw new Error('인계 코드 또는 비밀번호가 맞지 않아요.');
    if (Number(record.version) !== CLOUD_RECORD_VERSION) throw new Error('지원하지 않는 클라우드 저장 형식이에요.');
    if (Number(record.expiresAt || 0) > 0 && Date.now() > Number(record.expiresAt)) {
      throw new Error('이 클라우드 저장은 90일 보관 기간이 지나 만료됐어요.');
    }

    try {
      const salt = base64ToBytes(record.salt);
      const iv = base64ToBytes(record.iv);
      const ciphertext = base64ToBytes(record.ciphertext);
      const iterations = Math.max(100000, Number(record.iterations || CLOUD_PBKDF2_ITERATIONS));
      const key = await deriveCloudAesKey(code, password, salt, iterations);
      const additionalData = cloudTextEncoder().encode(`CIGH-CLOUD-DATA-V1\n${normalizeCloudCode(code)}`);
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
        key,
        ciphertext
      );
      const text = cloudTextDecoder().decode(plaintext);
      if (cloudTextEncoder().encode(text).byteLength > CLOUD_MAX_PLAINTEXT_BYTES) {
        throw new Error('복호화된 백업 데이터가 허용 크기를 초과했어요.');
      }
      return validateCloudBackupPayload(JSON.parse(text));
    } catch (err) {
      if (/만료|지원하지|허용 크기|백업/.test(String(err?.message || ''))) throw err;
      throw new Error('인계 코드 또는 비밀번호가 맞지 않아요.');
    }
  }

  function cloudRequestJson({ method = 'GET', url, data, headers = {}, timeout = CLOUD_REQUEST_TIMEOUT }) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers: {
          ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        timeout,
        data: data === undefined ? undefined : JSON.stringify(data),
        onload: response => {
          let body = null;
          try { body = response.responseText ? JSON.parse(response.responseText) : null; } catch {}

          if (response.status < 200 || response.status >= 300) {
            const message = String(body?.error?.message || body?.error || body?.message || response.responseText || `HTTP ${response.status}`);
            if (/PERMISSION_DENIED/i.test(message)) reject(new Error('클라우드 접근 권한이 거부됐어요. Firebase Database Rules를 확인해줘.'));
            else if (/OPERATION_NOT_ALLOWED/i.test(message)) reject(new Error('Firebase 익명 로그인이 꺼져 있어요. Authentication에서 Anonymous를 켜줘.'));
            else if (/API_KEY_INVALID/i.test(message)) reject(new Error('클라우드 Firebase API 설정이 올바르지 않아요.'));
            else reject(new Error(`클라우드 요청 실패 (${response.status}): ${message.slice(0, 240)}`));
            return;
          }
          resolve(body);
        },
        onerror: () => reject(new Error('클라우드 네트워크 연결에 실패했어요.')),
        ontimeout: () => reject(new Error('클라우드 요청 시간이 초과됐어요.')),
      });
    });
  }

  async function ensureCloudAuth() {
    if (cloudAuthSession?.idToken && Number(cloudAuthSession.expiresAt || 0) > Date.now() + 60000) {
      return cloudAuthSession.idToken;
    }

    const body = await cloudRequestJson({
      method: 'POST',
      url: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(CLOUD_API_KEY)}`,
      data: { returnSecureToken: true },
    });

    const idToken = String(body?.idToken || '');
    if (!idToken) throw new Error('Firebase 익명 인증 토큰을 받지 못했어요.');
    cloudAuthSession = {
      idToken,
      expiresAt: Date.now() + Math.max(300000, Number(body?.expiresIn || 3600) * 1000),
    };
    return idToken;
  }

  async function cloudRecordUrl(code, password) {
    const pathId = await getCloudPathId(code, password);
    const token = await ensureCloudAuth();
    return `${CLOUD_DATABASE_URL}/${CLOUD_PATH_ROOT}/${pathId}.json?auth=${encodeURIComponent(token)}`;
  }

  async function uploadCloudSave(code, password) {
    const normalized = normalizeCloudCode(code);
    const { json, bytes } = collectCloudBackupPayload();
    const record = await encryptCloudPayload(normalized, password, json, bytes);
    const url = await cloudRecordUrl(normalized, password);
    await cloudRequestJson({ method: 'PUT', url, data: record });
    return record;
  }

  async function downloadCloudSave(code, password) {
    const normalized = normalizeCloudCode(code);
    const url = await cloudRecordUrl(normalized, password);
    const record = await cloudRequestJson({ method: 'GET', url });
    if (!record) throw new Error('인계 코드 또는 비밀번호가 맞지 않아요.');
    const payload = await decryptCloudRecord(normalized, password, record);
    return { payload, record };
  }

  async function deleteCloudSave(code, password) {
    const normalized = normalizeCloudCode(code);
    const url = await cloudRecordUrl(normalized, password);
    const existing = await cloudRequestJson({ method: 'GET', url });
    if (!existing) throw new Error('삭제할 클라우드 저장을 찾지 못했어요.');
    await decryptCloudRecord(normalized, password, existing);
    await cloudRequestJson({ method: 'DELETE', url });
  }

  function applyCloudBackupPayload(payload) {
    flushPendingRoomLogs();
    cighAnalysisEpoch++;
    shopNotice = '';
    const safe = validateCloudBackupPayload(payload);
    if (safe.items[STORE_KEY]) {
      let restored;
      try { restored = JSON.parse(safe.items[STORE_KEY]); } catch (_) { throw new Error('백업 안의 HUD 데이터가 손상됐어요.'); }
      if (!restored || typeof restored !== 'object' || Array.isArray(restored)) throw new Error('백업 안의 HUD 데이터 형식이 올바르지 않아요.');
      if (restored._shop) normalizeShop(restored._shop);
    }
    const before = {};
    for (const key of CLOUD_SAVE_ALLOWED_KEYS) before[key] = localStorage.getItem(key);

    try {
      for (const key of CLOUD_SAVE_ALLOWED_KEYS) {
        if (Object.prototype.hasOwnProperty.call(safe.items, key)) {
          localStorage.setItem(key, safe.items[key]);
        } else if (key === CUSTOM_DECO_STORE) {
          // v2.10.0 이전 백업에는 CUSTOM_DECO_STORE가 없으므로 현재 로컬 커스텀 가구를 보존한다.
          continue;
        } else {
          localStorage.removeItem(key);
        }
      }
      // 같은 탭에서 STORE_KEY를 직접 덮어쓴 뒤 readStore() 캐시가 이전 값을 붙잡지 않도록 즉시 무효화한다.
      __cighStoreCache = null;
      customDecoCache = null;
      customDecoImageCache.clear();
    } catch (err) {
      for (const key of CLOUD_SAVE_ALLOWED_KEYS) {
        const previous = before[key];
        if (typeof previous === 'string') localStorage.setItem(key, previous);
        else localStorage.removeItem(key);
      }
      __cighStoreCache = null;
      throw new Error(`백업 적용 중 오류가 발생해 원래 데이터로 되돌렸어요. ${err?.message || err}`);
    }
  }

  function refreshAfterCloudLoad() {
    __cighStoreCache = null;
    writeLastSeenAt(Date.now()); // 불러온 직후 폭탄 보상 방지
    decoEditMode = false;
    decoDraft = null;
    customDecoCache = null;
    customDecoImageCache.clear();
    currentData = null;

    const panel = document.getElementById(PANEL_ID);
    const fab = document.getElementById(FAB_ID);
    if (panel) {
      restorePanelHeight(panel);
      restorePos(panel);
    }
    if (fab) restoreFabPos(fab);

    syncMascotForRoute();

    applyThemeMode();
    loadRoomData();
    refreshRoomKeyLabel();
    updateUsageSettingsSummary();
    requestAnimationFrame(() => scheduleViewportClamp(true));
  }

  function buildCloudSettingsHtml() {
    const link = getCloudLink();
    const connected = !!link.code;
    return `
      <div class="cigh-clean-cloud-status ${connected ? 'on' : ''}" data-cloud-status="1">
        <b>${connected ? '연결됨' : '미연결'}</b>
        <span>${connected ? esc(link.code) : '인계 코드를 만들거나 기존 코드를 입력해줘.'}</span>
        <small>마지막 저장: ${esc(formatCloudDate(link.lastSavedAt))}</small>
      </div>
      <div class="cigh-clean-settings-grid cigh-clean-cloud-grid">
        <label>
          <span>인계 코드</span>
          <input id="cigh-clean-cloud-code-input" autocomplete="off" spellcheck="false" maxlength="14" placeholder="CIGH-XXXX-XXXX" value="${esc(link.code)}">
        </label>
        <label>
          <span>인계 비밀번호</span>
          <input id="cigh-clean-cloud-password-input" type="password" autocomplete="new-password" spellcheck="false" placeholder="8자 이상">
        </label>
      </div>
      <div class="cigh-clean-settings-row cigh-clean-cloud-actions">
        <button type="button" class="cigh-clean-set-btn" data-action="cloud-create">새 코드</button>
        <button type="button" class="cigh-clean-set-btn" data-action="cloud-copy">코드복사</button>
        <button type="button" class="cigh-clean-set-btn" data-action="cloud-link">기존 연결</button>
      </div>
      <div class="cigh-clean-settings-row cigh-clean-cloud-actions">
        <button type="button" class="cigh-clean-set-btn gold" data-action="cloud-save">클라우드 저장</button>
        <button type="button" class="cigh-clean-set-btn" data-action="cloud-load">불러오기</button>
      </div>
      <div class="cigh-clean-settings-row cigh-clean-cloud-actions">
        <button type="button" class="cigh-clean-set-btn red" data-action="cloud-delete">클라우드 삭제</button>
        <button type="button" class="cigh-clean-set-btn" data-action="cloud-unlink">연결 해제</button>
      </div>
      <div class="cigh-clean-settings-help cigh-clean-cloud-help">
        자동 동기화가 아니라 버튼을 누를 때만 저장·불러옵니다.<br>
        API 키와 Firebase 설정은 옮기지 않아요. 비밀번호는 브라우저에 저장하지 않습니다.
      </div>
    `;
  }

  function updateCloudSettingsStatus(root = document, message = '') {
    const settingsRoot = getSettingsRoot(root);
    const status = settingsRoot?.querySelector?.('[data-cloud-status="1"]');
    if (!status) return;
    const link = getCloudLink();
    status.classList.toggle('on', !!link.code);
    status.innerHTML = `
      <b>${message ? esc(message) : (link.code ? '연결됨' : '미연결')}</b>
      <span>${link.code ? esc(link.code) : '인계 코드를 만들거나 기존 코드를 입력해줘.'}</span>
      <small>마지막 저장: ${esc(formatCloudDate(link.lastSavedAt))}</small>
    `;
  }

  function setCloudUiBusy(root, busy, message = '') {
    cloudBusy = !!busy;
    const settingsRoot = getSettingsRoot(root);
    settingsRoot?.querySelectorAll?.('[data-action^="cloud-"]')?.forEach(button => {
      button.disabled = cloudBusy;
    });
    if (message) updateCloudSettingsStatus(settingsRoot || root, message);
  }

  async function copyTextSafely(text) {
    const value = String(text || '');
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}

    try {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return !!ok;
    } catch {
      return false;
    }
  }

  async function handleCloudSettingsAction(action, box) {
    if (cloudBusy) return;
    const codeInput = box.querySelector('#cigh-clean-cloud-code-input');
    const passwordInput = box.querySelector('#cigh-clean-cloud-password-input');

    if (action === 'cloud-create') {
      const code = generateCloudCode();
      if (codeInput) codeInput.value = code;
      setCloudLink(code, { pathId: '', lastSavedAt: 0 });
      updateCloudSettingsStatus(box, '새 코드 생성됨');
      await copyTextSafely(code);
      setFooter('CLOUD CODE CREATED');
      playBeep('save');
      alert(`새 인계 코드\n${code}\n\n코드는 복사했어요. 비밀번호는 8자 이상 직접 정해서 함께 기억해줘.`);
      return;
    }

    const code = normalizeCloudCode(codeInput?.value || getCloudLink().code);
    const password = String(passwordInput?.value || '');

    if (action === 'cloud-copy') {
      if (!code) throw new Error('복사할 인계 코드가 없어요.');
      if (codeInput) codeInput.value = code;
      const copied = await copyTextSafely(code);
      if (!copied) throw new Error('코드 복사에 실패했어요. 직접 선택해서 복사해줘.');
      updateCloudSettingsStatus(box, '코드 복사 완료');
      setFooter('CLOUD CODE COPIED');
      return;
    }

    if (action === 'cloud-unlink') {
      if (!getCloudLink().code && !code) return;
      if (!confirm('이 브라우저의 인계 코드 연결만 해제할까요?\n클라우드 데이터는 삭제되지 않아요.')) return;
      clearCloudLink();
      if (codeInput) codeInput.value = '';
      if (passwordInput) passwordInput.value = '';
      updateCloudSettingsStatus(box, '연결 해제됨');
      setFooter('CLOUD UNLINKED');
      playBeep('save');
      return;
    }

    if (!code) throw new Error('인계 코드를 정확히 입력해줘.');
    if (password.length < 8) throw new Error('인계 비밀번호는 8자 이상 입력해줘.');
    if (codeInput) codeInput.value = code;

    const pathId = await assertCloudPasswordMatchesLocalLink(code, password);

    setCloudUiBusy(box, true,
      action === 'cloud-save' ? '암호화해서 저장 중…' :
      action === 'cloud-load' ? '복호화해서 불러오는 중…' :
      action === 'cloud-delete' ? '클라우드 삭제 중…' :
      '기존 저장 확인 중…'
    );

    try {
      if (action === 'cloud-link') {
        const { record } = await downloadCloudSave(code, password);
        setCloudLink(code, { pathId, lastSavedAt: Number(record.updatedAt || 0) });
        updateCloudSettingsStatus(box, '기존 코드 연결 완료');
        setFooter('CLOUD LINKED');
        playBeep('save');
        alert('기존 인계 코드 연결이 완료됐어요.\n데이터는 아직 덮어쓰지 않았습니다.');
      } else if (action === 'cloud-save') {
        if (!confirm('현재 HUD 게임 데이터를 암호화해서 클라우드에 저장할까요?\n같은 코드의 이전 저장은 덮어씁니다.')) return;
        const record = await uploadCloudSave(code, password);
        setCloudLink(code, { pathId, lastSavedAt: Number(record.updatedAt || Date.now()) });
        updateCloudSettingsStatus(box, '클라우드 저장 완료');
        setFooter('CLOUD SAVED');
        pushLog(['▶HUD 데이터를 클라우드에 저장했다!', `▷인계 코드: ${code}`]);
        bumpAchvCounter('cloudSaveFirst', 1, true);
        announceAchvUnlocks();
        playBeep('done');
        alert(`클라우드 저장 완료!\n${code}\n\n다른 기기에서 같은 코드와 비밀번호로 불러오면 돼.`);
      } else if (action === 'cloud-load') {
        if (!confirm('클라우드 백업으로 현재 HUD 게임 데이터를 교체할까요?\n현재 로컬 HUD 데이터는 덮어써집니다.')) return;
        const { payload, record } = await downloadCloudSave(code, password);
        applyCloudBackupPayload(payload);
        setCloudLink(code, { pathId, lastSavedAt: Number(record.updatedAt || 0) });
        box.remove();
        refreshAfterCloudLoad();
        // 구버전 백업을 불러온 경우에도 새 업적의 파생/백필 조건을 다시 계산한다.
        localStorage.removeItem(ACHV_V320_MIGRATION_STORE);
        migrateAchievementExpansionV320();
        setFooter('CLOUD LOADED');
        pushLog(['▶클라우드 백업을 불러왔다!', `▷인계 코드: ${code}`]);
        showPopup(['▶클라우드 불러오기 완료!', '▷HUD 게임 데이터가 갱신됐다!']);
        // 백업 적용 뒤에 기록해야 불러온 ACHV_STORE에 덮어써지지 않는다.
        bumpAchvCounter('cloudLoadFirst', 1, true);
        announceAchvUnlocks();
        playBeep('done');
        alert('클라우드 백업을 불러왔어요.');
      } else if (action === 'cloud-delete') {
        if (!confirm('이 인계 코드의 클라우드 저장을 완전히 삭제할까요?\n삭제 후에는 복구할 수 없어요.')) return;
        await deleteCloudSave(code, password);
        if (getCloudLink().code === code) clearCloudLink();
        if (codeInput) codeInput.value = '';
        if (passwordInput) passwordInput.value = '';
        updateCloudSettingsStatus(box, '클라우드 삭제 완료');
        setFooter('CLOUD DELETED');
        playBeep('save');
        alert('클라우드 저장을 삭제했어요. 로컬 HUD 데이터는 그대로입니다.');
      }
    } finally {
      if (document.contains(box)) setCloudUiBusy(box, false);
    }
  }

  // ─────────────────────────────────────────────
  // PET Room Decoration / Gacha
  // ─────────────────────────────────────────────
  const DECO_ITEMS = [
    { id: 'wall_night_star', type: 'wallpaper', name: '밤하늘 별', icon: '✦', rank: 'R' },
    { id: 'wall_sky', type: 'wallpaper', name: '푸른 하늘', icon: '☁', rank: 'R' },
    { id: 'wall_plain_ivory', type: 'wallpaper', name: '단색벽지(아이보리)', icon: '□', rank: 'N' },
    { id: 'wall_plain_pink', type: 'wallpaper', name: '단색벽지(연분홍)', icon: '□', rank: 'N' },
    { id: 'wall_plain_plain_3', type: 'wallpaper', name: '단색벽지(3)', icon: '□', rank: 'N' },
    { id: 'wall_muted_sage', type: 'wallpaper', name: '단색벽지(뮤트 세이지)', icon: '□', rank: 'N' },
    { id: 'wall_muted_bluegrey', type: 'wallpaper', name: '단색벽지(뮤트 블루그레이)', icon: '□', rank: 'N' },
    { id: 'wall_muted_mauve', type: 'wallpaper', name: '단색벽지(뮤트 모브)', icon: '□', rank: 'N' },
    { id: 'wall_pastel_mint', type: 'wallpaper', name: '단색벽지(파스텔 민트)', icon: '□', rank: 'N' },
    { id: 'wall_pastel_peach', type: 'wallpaper', name: '단색벽지(파스텔 피치)', icon: '□', rank: 'N' },
    { id: 'wall_pastel_lilac', type: 'wallpaper', name: '단색벽지(파스텔 라일락)', icon: '□', rank: 'N' },
    { id: 'floor_wood', type: 'floor', name: '나무 바닥', icon: '▤', rank: 'N' },
    { id: 'floor_wood_piskel', type: 'floor', name: '나무바닥 도트', icon: '▥', rank: 'R' },
    { id: 'floor_ash_wood', type: 'floor', name: '애쉬 원목', icon: '▤', rank: 'N' },
    { id: 'floor_grass', type: 'floor', name: '잔디밭', icon: '✿', rank: 'R' },
    { id: 'floor_deep_grass', type: 'floor', name: '숲빛 잔디', icon: '❀', rank: 'SR' },
    { id: 'floor_star_grass', type: 'floor', name: '별밤 잔디', icon: '✦', rank: 'SR' },
    { id: 'floor_cloud_soft', type: 'floor', name: '구름 바닥', icon: '☁', rank: 'R' },
    { id: 'floor_muted_sand', type: 'floor', name: '단색바닥(뮤트 샌드)', icon: '▦', rank: 'N' },
    { id: 'floor_muted_sage', type: 'floor', name: '단색바닥(뮤트 세이지)', icon: '▦', rank: 'N' },
    { id: 'floor_muted_bluegrey', type: 'floor', name: '단색바닥(뮤트 블루그레이)', icon: '▦', rank: 'N' },
    { id: 'floor_pastel_cream', type: 'floor', name: '단색바닥(파스텔 크림)', icon: '▦', rank: 'N' },
    { id: 'floor_pastel_mint', type: 'floor', name: '단색바닥(파스텔 민트)', icon: '▦', rank: 'N' },
    { id: 'floor_pastel_lilac', type: 'floor', name: '단색바닥(파스텔 라일락)', icon: '▦', rank: 'N' },
    { id: 'prop_cushion', type: 'prop', name: '쿠션', icon: '▰', rank: 'N', x: 26, y: 80 },
    { id: 'prop_plant', type: 'prop', name: '화분', icon: '♧', rank: 'N', x: 78, y: 58 },
    { id: 'prop_flower_twin', type: 'prop', name: '겹꽃', icon: '✿', rank: 'R', x: 30, y: 74 },
    { id: 'prop_flower_bell', type: 'prop', name: '종꽃', icon: '❀', rank: 'R', x: 42, y: 73 },
    { id: 'prop_flower_blossom', type: 'prop', name: '들꽃', icon: '✾', rank: 'R', x: 54, y: 74 },
    { id: 'prop_flower_white', type: 'prop', name: '흰꽃', icon: '✥', rank: 'R', x: 34, y: 75 },
    { id: 'prop_flower_blue', type: 'prop', name: '파란꽃', icon: '✥', rank: 'R', x: 46, y: 75 },
    { id: 'prop_flower_sun', type: 'prop', name: '해바라기', icon: '✺', rank: 'SR', x: 58, y: 74 },
    { id: 'prop_bush_berry', type: 'prop', name: '열매덤불', icon: '❉', rank: 'SR', x: 68, y: 81 },
    { id: 'prop_fence_wood', type: 'prop', name: '나무 울타리', icon: '╬', rank: 'SR', x: 50, y: 88 },
    { id: 'prop_plush_bear', type: 'prop', name: '곰인형', icon: '🧸', rank: 'R', x: 32, y: 80 },
    { id: 'prop_plush_dino', type: 'prop', name: '공룡인형', icon: '🦕', rank: 'R', x: 50, y: 80 },
    { id: 'prop_plush_rabbit', type: 'prop', name: '토끼인형', icon: '🐇', rank: 'R', x: 68, y: 80 },
    { id: 'prop_tree_sakura', type: 'prop', name: '벚꽃나무', icon: '✿', rank: 'SR', x: 22, y: 68 },
    { id: 'prop_tree_willow', type: 'prop', name: '버드나무', icon: '♣', rank: 'SR', x: 78, y: 68 },
    { id: 'prop_tree_maple', type: 'prop', name: '단풍나무', icon: '❋', rank: 'SR', x: 22, y: 68 },
    { id: 'prop_tree_dream', type: 'prop', name: '몽환수', icon: '✦', rank: 'SR', x: 78, y: 68 },
    { id: 'prop_moon_full', type: 'prop', name: '보름달', icon: '●', rank: 'R', x: 78, y: 24 },
    { id: 'prop_books', type: 'prop', name: '책더미', icon: '▤', rank: 'N', x: 20, y: 88 },
    { id: 'prop_lamp', type: 'prop', name: '램프', icon: '◉', rank: 'R', x: 82, y: 35 },
    { id: 'prop_star', type: 'prop', name: '별장식', icon: '✦', rank: 'R', x: 24, y: 28 },
    { id: 'prop_table', type: 'prop', name: '미니테이블', icon: '▱', rank: 'R', x: 70, y: 84 },
    { id: 'prop_rug', type: 'prop', name: '러그', icon: '▭', rank: 'R', x: 50, y: 86 },
    { id: 'prop_clock', type: 'prop', name: '벽시계', icon: '◷', rank: 'R', x: 50, y: 24 },
    { id: 'prop_bed', type: 'prop', name: '침대', icon: '🛏', rank: 'SR', x: 50, y: 82 },
    { id: 'prop_door', type: 'prop', name: '문', icon: '🚪', rank: 'R', x: 84, y: 60 },
    { id: 'prop_frame_bouquet_iv', type: 'prop', name: '꽃다발 액자(아이보리)', icon: '🖼', rank: 'SR', x: 32, y: 30 },
    { id: 'prop_frame_single_iv', type: 'prop', name: '꽃 액자(아이보리)', icon: '🖼', rank: 'R', x: 50, y: 30 },
    { id: 'prop_frame_pot_iv', type: 'prop', name: '화분 액자(아이보리)', icon: '🖼', rank: 'R', x: 66, y: 30 },
    { id: 'prop_frame_pressed_iv', type: 'prop', name: '압화 액자(아이보리)', icon: '🖼', rank: 'R', x: 80, y: 30 },
    { id: 'prop_frame_bouquet_mt', type: 'prop', name: '꽃다발 액자(뮤트)', icon: '🖼', rank: 'SR', x: 32, y: 48 },
    { id: 'prop_frame_single_mt', type: 'prop', name: '꽃 액자(뮤트)', icon: '🖼', rank: 'R', x: 50, y: 48 },
    { id: 'prop_frame_pot_mt', type: 'prop', name: '화분 액자(뮤트)', icon: '🖼', rank: 'R', x: 66, y: 48 },
    { id: 'prop_frame_pressed_mt', type: 'prop', name: '압화 액자(뮤트)', icon: '🖼', rank: 'R', x: 80, y: 48 },
    { id: 'prop_swag', type: 'prop', name: '드라이플라워', icon: '💐', rank: 'SR', x: 50, y: 26 },
    { id: 'prop_window_large', type: 'prop', name: '큰 창문', icon: '🪟', rank: 'SR', x: 38, y: 30 },
    { id: 'prop_window_small', type: 'prop', name: '작은 창문', icon: '🪟', rank: 'R', x: 72, y: 30 },
    { id: 'prop_window_curtain', type: 'prop', name: '커튼 창문', icon: '🪟', rank: 'SR', x: 50, y: 30 },
    { id: 'prop_doll_gangtandu', type: 'prop', name: '강탄두의 인형', image: 'https://i.postimg.cc/L6c6zDnF/gangtandu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_guyejan', type: 'prop', name: '구예잔의 인형', image: 'https://i.postimg.cc/Dy9yq68K/guyejan.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_guyecheon', type: 'prop', name: '구예천의 인형', image: 'https://i.postimg.cc/9F6FGbr5/guyecheon.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_gwonsuhyeog', type: 'prop', name: '권수혁의 인형', image: 'https://i.postimg.cc/TYzYr0p6/gwonsuhyeog.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_gimhyeonjun', type: 'prop', name: '김현준의 인형', image: 'https://i.postimg.cc/hPkP9sfG/gimhyeonjun.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_naleiteo', type: 'prop', name: '나레이터의 인형', image: 'https://i.postimg.cc/vHJHWhcD/naleiteo.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_neleuka', type: 'prop', name: '네르카의 인형', image: 'https://i.postimg.cc/FsMsjp7z/neleuka.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_deoseuteu', type: 'prop', name: '더스트의 인형', image: 'https://i.postimg.cc/qMPM8wzR/deoseuteu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_diteulihi', type: 'prop', name: '디트리히의 인형', image: 'https://i.postimg.cc/Yq5q1RhF/diteulihi.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_labeulan', type: 'prop', name: '라브란의 인형', image: 'https://i.postimg.cc/8P2Ph4j6/labeulan.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_lajin', type: 'prop', name: '라진의 인형', image: 'https://i.postimg.cc/wjDxFNmj/lajin.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_lahe', type: 'prop', name: '라헤의 인형', image: 'https://i.postimg.cc/g23c4hZ0/lahe.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_las-syu', type: 'prop', name: '랏슈의 인형', image: 'https://i.postimg.cc/cLf1T3nw/las-syu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_laechi', type: 'prop', name: '래치의 인형', image: 'https://i.postimg.cc/zGTDphgw/laechi.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_legsiyan', type: 'prop', name: '렉시얀의 인형', image: 'https://i.postimg.cc/Dw1f5GXr/legsiyan.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_lodion', type: 'prop', name: '로디온의 인형', image: 'https://i.postimg.cc/P51fKDwQ/lodion.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_liseu', type: 'prop', name: '리스의 인형', image: 'https://i.postimg.cc/6pC6zZvH/liseu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_lindo', type: 'prop', name: '린도의 인형', image: 'https://i.postimg.cc/zGTDphgt/lindo.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_meihui', type: 'prop', name: '메이후이의 인형', image: 'https://i.postimg.cc/kgWMwSbY/meihu-i.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_baegdong-u', type: 'prop', name: '백동우의 인형', image: 'https://i.postimg.cc/Bn2ZNFKw/baegdong-u.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_baegjiun', type: 'prop', name: '백지운의 인형', image: 'https://i.postimg.cc/bv8y5vxH/baegjiun.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_beulion', type: 'prop', name: '브리온의 인형', image: 'https://i.postimg.cc/43Zf036Q/beulion.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_beullu', type: 'prop', name: '블루의 인형', image: 'https://i.postimg.cc/xdYfZdvP/beullu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_saipeo', type: 'prop', name: '사이퍼의 인형', image: 'https://i.postimg.cc/q70JF7sL/saipeo.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_seseu', type: 'prop', name: '세스의 인형', image: 'https://i.postimg.cc/fbZzPbc8/seseu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_sille', type: 'prop', name: '실레의 인형', image: 'https://i.postimg.cc/cJZxzJRD/sille.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_aseutin', type: 'prop', name: '아스틴의 인형', image: 'https://i.postimg.cc/cJZxzJR9/aseutin.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_aisyal', type: 'prop', name: '아이샬의 인형', image: 'https://i.postimg.cc/KYFGWYPp/aisyal.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_aillaei', type: 'prop', name: '아일레이의 인형', image: 'https://i.postimg.cc/LsR9WstG/aillei.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_atomig', type: 'prop', name: '아토믹의 인형', image: 'https://i.postimg.cc/mrRLnr3x/atomig.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_atiban', type: 'prop', name: '아티반의 인형', image: 'https://i.postimg.cc/BvsSzvTr/atiban.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_eseukal', type: 'prop', name: '에스칼의 인형', image: 'https://i.postimg.cc/0Nxk4NGR/eseukal.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_yugyeongho', type: 'prop', name: '유경호의 인형', image: 'https://i.postimg.cc/g0dz70yG/yugyeongho.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_yunhuisu', type: 'prop', name: '윤희수의 인형', image: 'https://i.postimg.cc/g0dz70yY/yunhuisu.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_jeonghamin', type: 'prop', name: '정하민의 인형', image: 'https://i.postimg.cc/hGgDYG8D/jeonghamin.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_jelo', type: 'prop', name: '제로의 인형', image: 'https://i.postimg.cc/wBHqrB5x/jelo.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_kain', type: 'prop', name: '카인의 인형', image: 'https://i.postimg.cc/zfjzY1p1/kain.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_pabel', type: 'prop', name: '파벨의 인형', image: 'https://i.postimg.cc/GpQLn1zR/pabel.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_pieon', type: 'prop', name: '피언의 인형', image: 'https://i.postimg.cc/yNP1CznB/pieon.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_piteo', type: 'prop', name: '피터의 인형', image: 'https://i.postimg.cc/YS3rBw8t/piteo.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_pipi', type: 'prop', name: '피피의 인형', image: 'https://i.postimg.cc/yNP1CznY/pipi.png', rank: 'SSR', size: 40 },
    { id: 'prop_doll_haundeu', type: 'prop', name: '하운드의 인형', image: 'https://i.postimg.cc/8CHpgVwz/haundeu.png', rank: 'SSR', size: 40 },
  ];

  const DECO_RANK_META = {
    N:      { label: 'N',      color: '#8a8f98' },
    R:      { label: 'R',      color: '#5a9be0' },
    SR:     { label: 'SR',     color: '#c08ae0' },
    SSR:    { label: 'SSR',    color: '#f0c14b' },
    CUSTOM: { label: 'CUSTOM', color: '#64d6b0' },
  };
  const DECO_MULTI_OWN_MAX = { prop_bush_berry: 2, prop_fence_wood: 2 };
  let decoPropUidSeq = 1;

  // ─────────────────────────────────────────────
  // Custom Pixel Decoration
  // 공식 가구와 분리 저장. 가챠/공식 수집률/공식 가구 업적에는 포함하지 않는다.
  // ─────────────────────────────────────────────
  function defaultCustomDecoStore() {
    return { version: CUSTOM_DECO_STORE_VERSION, items: [] };
  }

  function customDecoByteLength(value) {
    try { return new TextEncoder().encode(String(value || '')).byteLength; }
    catch { return String(value || '').length; }
  }

  function normalizeCustomHex(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
    return '#222222';
  }

  function customDecoNewId() {
    const rand = Math.random().toString(36).slice(2, 8) || 'pixel';
    return `custom_${Date.now().toString(36)}_${rand}`;
  }

  // v3.1.3: localStorage에는 레이어 전체 2D 배열을 그대로 넣지 않는다.
  // 투명 여백을 잘라낸 뒤 RAW/RLE 중 더 작은 형식을 선택해 저장하고,
  // 실제 편집/렌더링 시에는 기존과 동일한 full-grid Uint8Array로 복원한다.
  function customDecoCropLayerPixels(pixels, grid) {
    const expected = grid * grid;
    const source = pixels instanceof Uint8Array ? pixels : customDecoLayerBytes(pixels, expected);
    if (source.length !== expected) return null;

    let minX = grid;
    let minY = grid;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < grid; y++) {
      const row = y * grid;
      for (let x = 0; x < grid; x++) {
        if (!source[row + x]) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return { x: 0, y: 0, w: 0, h: 0, bytes: new Uint8Array(0) };
    }

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const bytes = new Uint8Array(w * h);
    let offset = 0;
    for (let y = minY; y <= maxY; y++) {
      const start = y * grid + minX;
      bytes.set(source.subarray(start, start + w), offset);
      offset += w;
    }
    return { x: minX, y: minY, w, h, bytes };
  }

  function customDecoRleEncode(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
    if (!source.length) return new Uint8Array(0);
    const out = [];
    let value = source[0];
    let count = 1;
    for (let i = 1; i < source.length; i++) {
      const next = source[i];
      if (next === value && count < 255) {
        count += 1;
        continue;
      }
      out.push(count, value);
      value = next;
      count = 1;
    }
    out.push(count, value);
    return Uint8Array.from(out);
  }

  function customDecoRleDecode(bytes, expectedLength) {
    const source = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
    const expected = Math.max(0, Math.floor(Number(expectedLength || 0)));
    if (source.length % 2 !== 0) return null;
    const out = new Uint8Array(expected);
    let offset = 0;
    for (let i = 0; i < source.length; i += 2) {
      const count = source[i];
      const value = source[i + 1];
      if (!count || offset + count > expected) return null;
      out.fill(value, offset, offset + count);
      offset += count;
    }
    return offset === expected ? out : null;
  }

  function customDecoEncodeStoredLayerV2(layer, grid, index = 0) {
    const expected = grid * grid;
    const pixels = customDecoLayerBytes(layer?.pixels ?? layer?.d, expected);
    if (pixels.length !== expected) return null;
    const crop = customDecoCropLayerPixels(pixels, grid);
    if (!crop) return null;

    const defaultName = `LAYER ${Number(index) + 1}`;
    const name = normalizeCustomLayerName(layer?.name ?? layer?.n, index);
    const stored = { w: crop.w, h: crop.h };
    if (name !== defaultName) stored.n = name;
    if (layer?.visible === false || layer?.v === 0) stored.v = 0;
    if (crop.x) stored.x = crop.x;
    if (crop.y) stored.y = crop.y;

    if (!crop.bytes.length) return stored;

    const rle = customDecoRleEncode(crop.bytes);
    const useRle = rle.length < crop.bytes.length;
    const payload = useRle ? rle : crop.bytes;
    if (useRle) stored.m = 'r'; // RAW는 기본값이라 모드 문자를 생략한다.
    stored.d = bytesToBase64(payload);
    return stored;
  }

  function customDecoDecodeStoredLayerV2(raw, grid, palette, index = 0) {
    if (!raw || typeof raw !== 'object') return null;
    const x = Math.max(0, Math.floor(Number(raw.x || 0)));
    const y = Math.max(0, Math.floor(Number(raw.y || 0)));
    const w = Math.max(0, Math.floor(Number(raw.w || 0)));
    const h = Math.max(0, Math.floor(Number(raw.h || 0)));
    if (x > grid || y > grid || w > grid || h > grid || x + w > grid || y + h > grid) return null;
    if ((w === 0) !== (h === 0)) return null;

    const area = w * h;
    let cropped = new Uint8Array(0);
    if (area > 0) {
      let encoded;
      try { encoded = base64ToBytes(String(raw.d || '')); }
      catch { return null; }
      if (raw.m === 'r') cropped = customDecoRleDecode(encoded, area);
      else if (!raw.m || raw.m === 'b') cropped = encoded.length === area ? encoded : null;
      else return null;
      if (!(cropped instanceof Uint8Array) || cropped.length !== area) return null;
    }

    const pixels = new Uint8Array(grid * grid);
    let sourceOffset = 0;
    for (let row = 0; row < h; row++) {
      const target = (y + row) * grid + x;
      pixels.set(cropped.subarray(sourceOffset, sourceOffset + w), target);
      sourceOffset += w;
    }
    for (const paletteIndex of pixels) if (paletteIndex >= palette.length) return null;

    return {
      name: normalizeCustomLayerName(raw.n, index),
      visible: raw.v !== 0,
      pixels,
    };
  }

  function customDecoDecodeStoredItemV2(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const grid = Number(raw.g || 0);
    if (!CUSTOM_DECO_GRIDS.includes(grid)) return null;
    const sourcePalette = Array.isArray(raw.p) ? raw.p : [];
    const palette = ['transparent'];
    for (const color of sourcePalette.slice(1, CUSTOM_DECO_MAX_PALETTE)) palette.push(normalizeCustomHex(color));
    const sourceLayers = Array.isArray(raw.l) ? raw.l.slice(0, CUSTOM_DECO_MAX_LAYERS) : [];
    if (!sourceLayers.length) return null;
    const layers = [];
    for (let i = 0; i < sourceLayers.length; i++) {
      const layer = customDecoDecodeStoredLayerV2(sourceLayers[i], grid, palette, i);
      if (!layer) return null;
      layers.push(layer);
    }
    const pixels = customDecoCompositeLayerBytes(layers, grid);
    return {
      id: raw.id,
      name: raw.n,
      grid,
      size: raw.s,
      palette,
      pixels: bytesToBase64(pixels),
      layers,
      createdAt: raw.c,
      updatedAt: raw.u,
    };
  }

  function normalizeCustomDecoDesign(raw, { keepId = true } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const grid = Number(raw.grid || raw.g || 0);
    if (!CUSTOM_DECO_GRIDS.includes(grid)) return null;
    const size = clamp(Math.round(Number(raw.size || raw.s || 40)), 24, 160);
    const name = normalize(String(raw.name || raw.n || '커스텀 가구')).slice(0, 24) || '커스텀 가구';
    const sourcePalette = Array.isArray(raw.palette || raw.p) ? (raw.palette || raw.p) : [];
    const palette = ['transparent'];
    for (const color of sourcePalette.slice(1, CUSTOM_DECO_MAX_PALETTE)) {
      palette.push(normalizeCustomHex(color));
    }

    const pixelsText = String(raw.pixels || raw.d || '');
    let fallbackPixels;
    try { fallbackPixels = base64ToBytes(pixelsText); }
    catch { return null; }
    if (fallbackPixels.length !== grid * grid) return null;
    for (const index of fallbackPixels) if (index >= palette.length) return null;

    const layers = normalizeCustomDecoLayers(raw.layers || raw.l, grid, palette, fallbackPixels);
    if (!layers.length) return null;
    const pixels = customDecoCompositeLayerBytes(layers, grid);

    const idRaw = String(raw.id || '').trim();
    const id = keepId && /^custom_[a-z0-9_-]{4,80}$/i.test(idRaw) ? idRaw : customDecoNewId();
    const createdAt = Math.max(0, Number(raw.createdAt || Date.now()));
    const updatedAt = Math.max(createdAt, Number(raw.updatedAt || createdAt));
    return {
      id,
      name,
      type: 'prop',
      rank: 'CUSTOM',
      custom: true,
      grid,
      size,
      palette,
      // 런타임 호환성을 위해 합성본은 메모리에 유지한다. localStorage V2에는 저장하지 않는다.
      pixels: bytesToBase64(pixels),
      // 단일 레이어도 이름/표시 상태를 보존할 수 있게 런타임에는 항상 layers를 둔다.
      layers: layers.map((layer, index) => ({
        name: normalizeCustomLayerName(layer.name, index),
        visible: layer.visible !== false,
        pixels: bytesToBase64(layer.pixels),
      })),
      createdAt,
      updatedAt,
    };
  }

  function normalizeCustomDecoStore(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const storageVersion = Math.floor(Number(source.version || 1));
    const items = [];
    const seen = new Set();
    for (const entry of Array.isArray(source.items) ? source.items : []) {
      const storedV2 = storageVersion === CUSTOM_DECO_STORE_VERSION
        && entry && typeof entry === 'object'
        && !Object.prototype.hasOwnProperty.call(entry, 'grid')
        && Object.prototype.hasOwnProperty.call(entry, 'g')
        && Array.isArray(entry.l);
      const decoded = storedV2 ? customDecoDecodeStoredItemV2(entry) : entry;
      const item = normalizeCustomDecoDesign(decoded, { keepId: true });
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
      if (items.length >= CUSTOM_DECO_MAX_ITEMS) break;
    }
    return { version: CUSTOM_DECO_STORE_VERSION, items };
  }

  function customDecoStoreToV2Payload(store) {
    const source = store && typeof store === 'object' ? store : defaultCustomDecoStore();
    const items = [];
    for (const item of Array.isArray(source.items) ? source.items : []) {
      const safe = normalizeCustomDecoDesign(item, { keepId: true });
      if (!safe) continue;
      const layers = (Array.isArray(safe.layers) && safe.layers.length ? safe.layers : [{
        name: 'LAYER 1',
        visible: true,
        pixels: safe.pixels,
      }]).slice(0, CUSTOM_DECO_MAX_LAYERS);
      const storedLayers = [];
      for (let i = 0; i < layers.length; i++) {
        const storedLayer = customDecoEncodeStoredLayerV2(layers[i], safe.grid, i);
        if (!storedLayer) throw new Error('커스텀 가구 레이어 압축에 실패했어요.');
        storedLayers.push(storedLayer);
      }
      items.push({
        id: safe.id,
        n: safe.name,
        g: safe.grid,
        s: safe.size,
        p: safe.palette,
        l: storedLayers,
        c: safe.createdAt,
        u: safe.updatedAt,
      });
      if (items.length >= CUSTOM_DECO_MAX_ITEMS) break;
    }
    return { version: CUSTOM_DECO_STORE_VERSION, items };
  }

  function customDecoSerializeStoreV2(store) {
    return JSON.stringify(customDecoStoreToV2Payload(store));
  }

  function isStorageQuotaError(err) {
    const name = String(err?.name || '');
    const message = String(err?.message || '');
    return /QuotaExceededError|NS_ERROR_DOM_QUOTA_REACHED/i.test(name) || /quota|storage.*full/i.test(message);
  }

  function tryMigrateCustomDecoStoreV2(rawText, parsed, safe) {
    const sourceVersion = Math.floor(Number(parsed?.version || 1));
    if (sourceVersion === CUSTOM_DECO_STORE_VERSION) return;
    try {
      const json = customDecoSerializeStoreV2(safe);
      const bytes = customDecoByteLength(json);
      if (bytes > CUSTOM_DECO_MAX_STORE_BYTES) return;
      // setItem은 교체가 성공한 경우에만 기존 값이 바뀐다. 실패하면 V1 원본을 그대로 유지한다.
      localStorage.setItem(CUSTOM_DECO_STORE, json);
      if (rawText && json.length < rawText.length) {
        console.info(`[Crack INFO Game HUD] CUSTOM storage V2 migrated: ${rawText.length.toLocaleString()} → ${json.length.toLocaleString()} chars`);
      }
    } catch (err) {
      console.warn('[Crack INFO Game HUD] CUSTOM storage V2 migration skipped; V1 data kept:', err);
    }
  }

  function readCustomDecoStore() {
    if (customDecoCache) return customDecoCache;
    const rawText = localStorage.getItem(CUSTOM_DECO_STORE) || '';
    try {
      const parsed = JSON.parse(rawText || '{}');
      customDecoCache = normalizeCustomDecoStore(parsed);
      if (rawText) tryMigrateCustomDecoStoreV2(rawText, parsed, customDecoCache);
    } catch {
      customDecoCache = defaultCustomDecoStore();
    }
    return customDecoCache;
  }

  function writeCustomDecoStore(store) {
    const safe = normalizeCustomDecoStore(store);
    const json = customDecoSerializeStoreV2(safe);
    const bytes = customDecoByteLength(json);
    if (bytes > CUSTOM_DECO_MAX_STORE_BYTES) {
      throw new Error(`커스텀 가구 데이터가 너무 커요. (압축 후 ${Math.ceil(bytes / 1024)}KB / 최대 ${Math.floor(CUSTOM_DECO_MAX_STORE_BYTES / 1024)}KB)`);
    }
    try {
      localStorage.setItem(CUSTOM_DECO_STORE, json);
    } catch (err) {
      if (isStorageQuotaError(err)) {
        throw new Error(`브라우저 저장공간이 부족해 커스텀 가구를 저장하지 못했어요. (압축 후 ${Math.ceil(bytes / 1024)}KB) 기존 가구와 티켓은 유지됩니다.`);
      }
      throw err;
    }
    customDecoCache = safe;
    customDecoImageCache.clear();
    return safe;
  }

  function getCustomDecoItems() {
    return readCustomDecoStore().items || [];
  }

  function getCustomDecoItem(id) {
    const key = String(id || '').trim();
    return getCustomDecoItems().find(item => item.id === key) || null;
  }

  function getAllDecoItems() {
    return [...DECO_ITEMS, ...getCustomDecoItems()];
  }

  function isOfficialDecoItem(id) {
    const key = String(id || '').trim();
    return DECO_ITEMS.some(item => item.id === key);
  }

  function syncDecoDraftInventoryFromState(state) {
    if (!decoEditMode || !decoDraft) return;
    const equipped = JSON.parse(JSON.stringify(decoDraft.equipped || { wallpaper: '', floor: '', props: [] }));
    decoDraft = normalizeDecoState({ ...state, equipped });
  }


  function normalizeCustomLayerName(value, index = 0) {
    return normalize(String(value || `LAYER ${Number(index) + 1}`)).slice(0, 18) || `LAYER ${Number(index) + 1}`;
  }

  function customDecoLayerBytes(value, expectedLength) {
    try {
      if (value instanceof Uint8Array) return value.slice();
      if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
      if (Array.isArray(value)) return Uint8Array.from(value);
      const bytes = base64ToBytes(String(value || ''));
      return bytes;
    } catch {
      return new Uint8Array(0);
    }
  }

  function normalizeCustomDecoLayers(rawLayers, grid, palette, fallbackPixels) {
    const expected = grid * grid;
    const source = Array.isArray(rawLayers) ? rawLayers.slice(0, CUSTOM_DECO_MAX_LAYERS) : [];
    const layers = [];
    for (let i = 0; i < source.length; i++) {
      const raw = source[i] || {};
      const bytes = customDecoLayerBytes(raw.pixels ?? raw.d, expected);
      if (bytes.length !== expected) continue;
      let valid = true;
      for (const index of bytes) {
        if (index >= palette.length) { valid = false; break; }
      }
      if (!valid) continue;
      layers.push({
        name: normalizeCustomLayerName(raw.name ?? raw.n, i),
        visible: raw.visible !== false && raw.v !== 0,
        pixels: bytes,
      });
    }
    if (!layers.length) {
      const fallback = customDecoLayerBytes(fallbackPixels, expected);
      if (fallback.length !== expected) return [];
      layers.push({ name: 'LAYER 1', visible: true, pixels: fallback });
    }
    return layers;
  }

  function customDecoCompositeLayerBytes(layers, grid) {
    const out = new Uint8Array(grid * grid);
    for (const layer of Array.isArray(layers) ? layers : []) {
      if (!layer || layer.visible === false) continue;
      const pixels = layer.pixels instanceof Uint8Array ? layer.pixels : customDecoLayerBytes(layer.pixels, out.length);
      if (pixels.length !== out.length) continue;
      for (let i = 0; i < pixels.length; i++) {
        if (pixels[i]) out[i] = pixels[i];
      }
    }
    return out;
  }

  function compactCustomDecoLayerInput(palette, rawLayers, fallbackPixels, grid) {
    const expected = grid * grid;
    const sourceLayers = [];
    for (let i = 0; i < (Array.isArray(rawLayers) ? rawLayers : []).slice(0, CUSTOM_DECO_MAX_LAYERS).length; i++) {
      const raw = rawLayers[i] || {};
      const bytes = customDecoLayerBytes(raw.pixels ?? raw.d, expected);
      if (bytes.length !== expected) continue;
      sourceLayers.push({
        name: normalizeCustomLayerName(raw.name ?? raw.n, i),
        visible: raw.visible !== false && raw.v !== 0,
        pixels: bytes,
      });
    }
    if (!sourceLayers.length) {
      const fallback = customDecoLayerBytes(fallbackPixels, expected);
      if (fallback.length !== expected) throw new Error('커스텀 가구 픽셀 데이터가 올바르지 않아요.');
      sourceLayers.push({ name: 'LAYER 1', visible: true, pixels: fallback });
    }

    const used = new Set([0]);
    for (const layer of sourceLayers) for (const value of layer.pixels) used.add(value);
    const remap = new Uint8Array(256);
    const nextPalette = ['transparent'];
    const sorted = [...used].filter(v => v > 0).sort((a, b) => a - b);
    for (const oldIndex of sorted) {
      if (oldIndex >= palette.length) continue;
      const color = normalizeCustomHex(palette[oldIndex]);
      let nextIndex = nextPalette.indexOf(color);
      if (nextIndex < 0) {
        if (nextPalette.length >= CUSTOM_DECO_MAX_PALETTE) throw new Error('사용 색상이 너무 많아요.');
        nextIndex = nextPalette.length;
        nextPalette.push(color);
      }
      remap[oldIndex] = nextIndex;
    }

    const layers = sourceLayers.map((layer, index) => {
      const pixels = new Uint8Array(expected);
      for (let i = 0; i < expected; i++) pixels[i] = remap[layer.pixels[i]] || 0;
      return { name: normalizeCustomLayerName(layer.name, index), visible: layer.visible !== false, pixels };
    });
    return { palette: nextPalette, layers, pixels: customDecoCompositeLayerBytes(layers, grid) };
  }

  function customEditorCompositePixels(state) {
    const grid = Math.max(1, Number(state?.grid || 1));
    if (Array.isArray(state?.layers) && state.layers.length) return customDecoCompositeLayerBytes(state.layers, grid);
    return state?.pixels instanceof Uint8Array ? state.pixels.slice() : new Uint8Array(grid * grid);
  }

  function customEditorSnapshot(state) {
    return {
      layers: (state.layers || []).map((layer, index) => ({
        name: normalizeCustomLayerName(layer.name, index),
        visible: layer.visible !== false,
        pixels: layer.pixels.slice(),
      })),
      activeLayer: Math.max(0, Number(state.activeLayer || 0)),
    };
  }

  function customEditorRestoreSnapshot(state, snapshot) {
    const layers = Array.isArray(snapshot?.layers) && snapshot.layers.length
      ? snapshot.layers.map((layer, index) => ({
          name: normalizeCustomLayerName(layer.name, index),
          visible: layer.visible !== false,
          pixels: layer.pixels.slice(),
        }))
      : [{ name: 'LAYER 1', visible: true, pixels: new Uint8Array(state.grid * state.grid) }];
    state.layers = layers.slice(0, CUSTOM_DECO_MAX_LAYERS);
    state.activeLayer = clamp(Math.floor(Number(snapshot?.activeLayer || 0)), 0, state.layers.length - 1);
    state.pixels = state.layers[state.activeLayer].pixels;
    state.selection = null;
    state.selectionPath = [];
    state.lassoDrawing = false;
  }

  function customDecoFingerprint(design) {
    const source = `${design.grid}|${design.palette.join(',')}|${design.pixels}`;
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${design.grid}-${(hash >>> 0).toString(36)}-${source.length.toString(36)}`;
  }

  function customDecoToDataUrl(item) {
    const safe = normalizeCustomDecoDesign(item, { keepId: true });
    if (!safe) return '';
    const cacheKey = `${safe.id}:${safe.updatedAt}:${safe.pixels.length}`;
    if (customDecoImageCache.has(cacheKey)) return customDecoImageCache.get(cacheKey);
    let pixels;
    try { pixels = base64ToBytes(safe.pixels); }
    catch { return ''; }
    const canvas = document.createElement('canvas');
    canvas.width = safe.grid;
    canvas.height = safe.grid;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return '';
    ctx.clearRect(0, 0, safe.grid, safe.grid);
    for (let y = 0; y < safe.grid; y++) {
      for (let x = 0; x < safe.grid; x++) {
        const idx = pixels[y * safe.grid + x];
        if (!idx) continue;
        const color = safe.palette[idx];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const url = canvas.toDataURL('image/png');
    customDecoImageCache.set(cacheKey, url);
    return url;
  }


  function commitNewCustomDeco(input) {
    const stateBefore = localStorage.getItem(DECO_STORE);
    const customBefore = localStorage.getItem(CUSTOM_DECO_STORE);
    const decoState = getDecoState();
    if (decoState.tickets < 1) throw new Error('커스텀 가구를 만들려면 🎟️ 1장이 필요해요.');
    if (getCustomDecoItems().length >= CUSTOM_DECO_MAX_ITEMS) throw new Error(`커스텀 가구는 최대 ${CUSTOM_DECO_MAX_ITEMS}개까지 저장할 수 있어요.`);

    const compact = compactCustomDecoLayerInput(input.palette, input.layers, input.pixels, input.grid);
    const blank = compact.pixels.every(value => value === 0);
    if (blank) throw new Error('빈 도안은 저장할 수 없어요.');
    const item = normalizeCustomDecoDesign({
      id: customDecoNewId(),
      name: input.name,
      grid: input.grid,
      size: input.size,
      palette: compact.palette,
      pixels: bytesToBase64(compact.pixels),
      layers: compact.layers.length > 1 ? compact.layers : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { keepId: true });
    if (!item) throw new Error('커스텀 가구 데이터를 만들지 못했어요.');
    const fingerprint = customDecoFingerprint(item);
    if (getCustomDecoItems().some(existing => customDecoFingerprint(existing) === fingerprint)) {
      throw new Error('이미 같은 도안을 보유하고 있어요.');
    }

    try {
      const customStore = readCustomDecoStore();
      writeCustomDecoStore({ ...customStore, items: [...customStore.items, item] });
      decoState.tickets -= 1;
      decoState.owned[item.id] = 1;
      setDecoState(decoState);
      syncDecoDraftInventoryFromState(decoState);
      return item;
    } catch (err) {
      try { if (typeof stateBefore === 'string') localStorage.setItem(DECO_STORE, stateBefore); else localStorage.removeItem(DECO_STORE); } catch (_) {}
      try { if (typeof customBefore === 'string') localStorage.setItem(CUSTOM_DECO_STORE, customBefore); else localStorage.removeItem(CUSTOM_DECO_STORE); } catch (_) {}
      customDecoCache = null;
      customDecoImageCache.clear();
      throw err;
    }
  }

  function updateExistingCustomDeco(id, input) {
    const current = getCustomDecoItem(id);
    if (!current) throw new Error('수정할 커스텀 가구를 찾지 못했어요.');
    const compact = compactCustomDecoLayerInput(input.palette, input.layers, input.pixels, current.grid);
    if (compact.pixels.every(value => value === 0)) throw new Error('빈 도안은 저장할 수 없어요.');
    const next = normalizeCustomDecoDesign({
      ...current,
      name: input.name,
      grid: current.grid,
      size: input.size,
      palette: compact.palette,
      pixels: bytesToBase64(compact.pixels),
      layers: compact.layers.length > 1 ? compact.layers : undefined,
      updatedAt: Date.now(),
    }, { keepId: true });
    const store = readCustomDecoStore();
    const items = store.items.map(item => item.id === id ? next : item);
    writeCustomDecoStore({ ...store, items });
    return next;
  }

  function deleteCustomDeco(id) {
    const item = getCustomDecoItem(id);
    if (!item) return false;
    const customBefore = localStorage.getItem(CUSTOM_DECO_STORE);
    const decoBefore = localStorage.getItem(DECO_STORE);
    try {
      const store = readCustomDecoStore();
      writeCustomDecoStore({ ...store, items: store.items.filter(entry => entry.id !== id) });
      const state = getDecoState();
      delete state.owned[id];
      state.equipped.props = (state.equipped.props || []).filter(prop => prop.id !== id);
      setDecoState(state);
      syncDecoDraftInventoryFromState(state);
      return true;
    } catch (err) {
      try { if (typeof customBefore === 'string') localStorage.setItem(CUSTOM_DECO_STORE, customBefore); else localStorage.removeItem(CUSTOM_DECO_STORE); } catch (_) {}
      try { if (typeof decoBefore === 'string') localStorage.setItem(DECO_STORE, decoBefore); else localStorage.removeItem(DECO_STORE); } catch (_) {}
      customDecoCache = null;
      customDecoImageCache.clear();
      throw err;
    }
  }

  function customBytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function customBase64UrlToBytes(text) {
    let value = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
    while (value.length % 4) value += '=';
    return base64ToBytes(value);
  }

  async function customCompressBytes(bytes) {
    if (typeof CompressionStream !== 'function') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function customDecompressBytes(bytes, maxBytes = 200_000) {
    if (typeof DecompressionStream !== 'function') throw new Error('이 브라우저는 압축 공유코드를 지원하지 않아요.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error('공유코드 데이터가 너무 커요.');
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
    return out;
  }

  function customSharePayloadFromInput(input) {
    const compact = compactCustomDecoLayerInput(input.palette, input.layers, input.pixels, input.grid);
    if (compact.pixels.every(value => value === 0)) throw new Error('빈 도안은 공유할 수 없어요.');
    const payload = {
      v: 1,
      n: normalize(String(input.name || '커스텀 가구')).slice(0, 24) || '커스텀 가구',
      g: input.grid,
      s: clamp(Math.round(Number(input.size || 40)), 24, 160),
      p: compact.palette,
      // d는 항상 합성본을 넣어 구버전에서도 같은 그림을 가져올 수 있게 유지한다.
      d: bytesToBase64(compact.pixels),
    };
    if (compact.layers.length > 1) {
      payload.l = compact.layers.map((layer, index) => ({
        n: normalizeCustomLayerName(layer.name, index),
        v: layer.visible === false ? 0 : 1,
        d: bytesToBase64(layer.pixels),
      }));
    }
    return payload;
  }

  async function encodeCustomDecoShareCode(input) {
    const payload = customSharePayloadFromInput(input);
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const gz = await customCompressBytes(raw).catch(() => null);
    if (gz && gz.length + 4 < raw.length) return `${CUSTOM_DECO_SHARE_PREFIX}G${customBytesToBase64Url(gz)}`;
    return `${CUSTOM_DECO_SHARE_PREFIX}J${customBytesToBase64Url(raw)}`;
  }

  async function decodeCustomDecoShareCode(code) {
    const raw = String(code || '').trim();
    if (!raw.startsWith(CUSTOM_DECO_SHARE_PREFIX)) throw new Error('커스텀 가구 코드 형식이 아니에요.');
    const body = raw.slice(CUSTOM_DECO_SHARE_PREFIX.length);
    if (body.length > 300_000) throw new Error('공유코드가 너무 길어요.');
    const mode = body.charAt(0);
    const data = customBase64UrlToBytes(body.slice(1));
    let jsonBytes;
    if (mode === 'G') jsonBytes = await customDecompressBytes(data);
    else if (mode === 'J') jsonBytes = data;
    else throw new Error('지원하지 않는 커스텀 가구 코드 버전이에요.');
    if (jsonBytes.length > 200_000) throw new Error('공유코드 데이터가 너무 커요.');
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(jsonBytes)); }
    catch { throw new Error('공유코드가 손상됐어요.'); }
    if (Number(payload?.v) !== 1) throw new Error('지원하지 않는 커스텀 가구 코드 버전이에요.');
    const item = normalizeCustomDecoDesign({
      id: customDecoNewId(),
      name: payload.n,
      grid: payload.g,
      size: payload.s,
      palette: payload.p,
      pixels: payload.d,
      layers: payload.l,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { keepId: true });
    if (!item) throw new Error('공유코드의 도안 데이터가 올바르지 않아요.');
    return item;
  }

  function commitImportedCustomDeco(item) {
    const safe = normalizeCustomDecoDesign(item, { keepId: false });
    if (!safe) throw new Error('가져올 커스텀 가구 데이터가 올바르지 않아요.');
    const fingerprint = customDecoFingerprint(safe);
    if (getCustomDecoItems().some(existing => customDecoFingerprint(existing) === fingerprint)) {
      throw new Error('이미 같은 도안을 보유하고 있어요.');
    }
    const pixels = base64ToBytes(safe.pixels);
    const layers = Array.isArray(safe.layers)
      ? safe.layers.map(layer => ({ name: layer.name, visible: layer.visible !== false, pixels: base64ToBytes(layer.pixels) }))
      : null;
    return commitNewCustomDeco({ name: safe.name, grid: safe.grid, size: safe.size, palette: safe.palette, pixels, layers });
  }

  function getCustomEditorInput(root, state) {
    const name = root.querySelector('[data-custom-name]')?.value || '커스텀 가구';
    const size = Number(root.querySelector('[data-custom-size]')?.value || state.size || 40);
    const layers = (state.layers || []).map((layer, index) => ({
      name: normalizeCustomLayerName(layer.name, index),
      visible: layer.visible !== false,
      pixels: layer.pixels.slice(),
    }));
    return { name, grid: state.grid, size, palette: state.palette, pixels: customEditorCompositePixels(state), layers };
  }

  function renderCustomPixelCanvas(canvas, state, preparedPixels = null) {
    if (!canvas || !state) return;
    if (canvas.width !== state.grid) canvas.width = state.grid;
    if (canvas.height !== state.grid) canvas.height = state.grid;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, state.grid, state.grid);
    const renderPixels = preparedPixels instanceof Uint8Array ? preparedPixels : customEditorCompositePixels(state);
    for (let y = 0; y < state.grid; y++) {
      for (let x = 0; x < state.grid; x++) {
        const idx = renderPixels[y * state.grid + x];
        if (!idx) continue;
        ctx.fillStyle = state.palette[idx] || '#000000';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function customEditorPushUndo(state) {
    state.undo.push(customEditorSnapshot(state));
    if (state.undo.length > 40) state.undo.shift();
    state.redo.length = 0;
  }


  function customEditorColorIndex(state, color) {
    const normalized = normalizeCustomHex(color);
    let idx = state.palette.indexOf(normalized);
    if (idx >= 0) return idx;
    if (state.palette.length >= CUSTOM_DECO_MAX_PALETTE) throw new Error('사용 색상이 너무 많아요.');
    state.palette.push(normalized);
    return state.palette.length - 1;
  }

  function customEditorPaintLine(state, x0, y0, x1, y1, index) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      if (x0 >= 0 && y0 >= 0 && x0 < state.grid && y0 < state.grid) state.pixels[y0 * state.grid + x0] = index;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  function customEditorFloodFill(state, x, y, nextIndex) {
    const start = y * state.grid + x;
    const target = state.pixels[start];
    if (target === nextIndex) return;
    const stack = [start];
    state.pixels[start] = nextIndex;
    while (stack.length) {
      const pos = stack.pop();
      const px = pos % state.grid;
      const py = Math.floor(pos / state.grid);
      const neighbors = [];
      if (px > 0) neighbors.push(pos - 1);
      if (px + 1 < state.grid) neighbors.push(pos + 1);
      if (py > 0) neighbors.push(pos - state.grid);
      if (py + 1 < state.grid) neighbors.push(pos + state.grid);
      for (const n of neighbors) {
        if (state.pixels[n] === target) {
          state.pixels[n] = nextIndex;
          stack.push(n);
        }
      }
    }
  }

  function customEditorPointerCell(canvas, event, grid) {
    const rect = canvas.getBoundingClientRect();
    const safeGrid = Math.max(1, Number(grid || 1));
    const cellW = rect.width / safeGrid;
    const cellH = rect.height / safeGrid;
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const x = clamp(Math.floor(localX / Math.max(0.0001, cellW)), 0, safeGrid - 1);
    const y = clamp(Math.floor(localY / Math.max(0.0001, cellH)), 0, safeGrid - 1);
    return { x, y };
  }


  function customEditorPointerGridPoint(canvas, event, grid) {
    const rect = canvas.getBoundingClientRect();
    const safeGrid = Math.max(1, Number(grid || 1));
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(0.0001, rect.width)) * safeGrid, 0, safeGrid),
      y: clamp(((event.clientY - rect.top) / Math.max(0.0001, rect.height)) * safeGrid, 0, safeGrid),
    };
  }

  function customEditorSelectionFromPolygon(grid, path) {
    if (!Array.isArray(path) || path.length < 3) return null;
    const mask = new Uint8Array(grid * grid);
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
        const a = path[i], b = path[j];
        const intersects = ((a.y > py) !== (b.y > py)) &&
          (px < (b.x - a.x) * (py - a.y) / ((b.y - a.y) || 1e-9) + a.x);
        if (intersects) hit = !hit;
      }
      return hit;
    };
    let count = 0;
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        if (inside(x + 0.5, y + 0.5)) {
          mask[y * grid + x] = 1;
          count += 1;
        }
      }
    }
    return count ? mask : null;
  }

  function customEditorBaseCellPx(grid) {
    return ({ 16: 16, 32: 8, 64: 4, 128: 2 })[Number(grid)] || 4;
  }

  function customEditorCellPx(state) {
    const zoom = clamp(Number(state?.zoom || 1), 1, 4);
    return customEditorBaseCellPx(state?.grid) * zoom;
  }


  function updateCustomEditorStageScale(stage, gridOverlay, state) {
    if (!stage || !state) return;
    const grid = Math.max(1, Number(state.grid || 32));
    const zoom = clamp(Number(state.zoom || 1), 1, 4);

    // 논리 캔버스 16/32/64/128 모두 100%에서 정확히 256 CSS px.
    // 따라서 1칸은 각각 16/8/4/2px이며 확대 시 정수배만 사용한다.
    // 캔버스·그리드·체커보드·셀 커서를 모두 이 한 값에서 파생시켜
    // 브라우저/화면 크기와 무관하게 서로 어긋나지 않게 한다.
    const baseCellPx = customEditorBaseCellPx(grid);
    const cellPx = Math.max(1, Math.round(baseCellPx * zoom));
    const stagePx = grid * cellPx;
    const viewport = stage.parentElement;

    stage.style.width = `${stagePx}px`;
    stage.style.height = `${stagePx}px`;
    stage.style.marginLeft = `${Math.max(0, Math.floor(((viewport?.clientWidth || stagePx) - stagePx) / 2))}px`;
    stage.style.marginTop = `${Math.max(0, Math.floor(((viewport?.clientHeight || stagePx) - stagePx) / 2))}px`;
    stage.style.setProperty('--custom-grid-count', String(grid));
    stage.style.setProperty('--custom-cell-px', `${cellPx}px`);

    // 투명 체크무늬 한 칸도 논리 1px와 동일한 크기로 맞춘다.
    const checkerPx = cellPx;
    stage.style.backgroundSize = `${checkerPx * 2}px ${checkerPx * 2}px`;
    stage.style.backgroundPosition = `0 0, 0 ${checkerPx}px, ${checkerPx}px -${checkerPx}px, -${checkerPx}px 0`;

    stage.querySelectorAll('canvas[data-custom-canvas], canvas[data-custom-selection-canvas]').forEach(canvas => {
      canvas.style.width = `${stagePx}px`;
      canvas.style.height = `${stagePx}px`;
    });
    if (gridOverlay) {
      gridOverlay.style.backgroundSize = `${cellPx}px ${cellPx}px`;
      gridOverlay.style.backgroundPosition = '0 0';
      gridOverlay.style.opacity = zoom >= 2 ? '.42' : '.34';
    }
  }

  function updateCustomEditorCellCursor(canvas, cursor, state, event) {
    if (!canvas || !cursor || !state || !event) return;
    const rect = canvas.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
      cursor.hidden = true;
      return;
    }
    const cell = customEditorPointerCell(canvas, event, state.grid);
    const cellW = rect.width / Math.max(1, state.grid);
    const cellH = rect.height / Math.max(1, state.grid);
    cursor.hidden = false;
    cursor.style.left = `${cell.x * cellW}px`;
    cursor.style.top = `${cell.y * cellH}px`;
    cursor.style.width = `${cellW}px`;
    cursor.style.height = `${cellH}px`;
  }

  function renderCustomDecoRoomPreviewBackdrop(state, excludeId = '') {
    const safe = normalizeDecoState(state);
    if (excludeId) safe.equipped.props = (safe.equipped.props || []).filter(prop => prop.id !== excludeId);
    const wall = getDecoItem(safe.equipped.wallpaper);
    const floor = getDecoItem(safe.equipped.floor);
    const wallClass = wall ? ` cigh-clean-deco-${esc(decoClass(wall.id))}` : '';
    const floorClass = floor ? ` cigh-clean-deco-${esc(decoClass(floor.id))}` : '';
    return `
      <div class="cigh-clean-room-wall${wallClass}"></div>
      <div class="cigh-clean-room-floor${floorClass}"></div>
      <div class="cigh-clean-room-props">${renderDecoPropsHtml(safe, false)}</div>`;
  }

  function rbLegacy_closeCustomDecoModal() {
    const modal = document.getElementById('cigh-clean-custom-deco-modal');
    try { modal?.__cighCleanup?.(); } catch (_) {}
    modal?.remove();
  }

  function createCustomDecoEditorState(existing, previewRoomState) {
    const initialGrid = existing?.grid || 32;
    const existingPlacement = existing ? (previewRoomState.equipped.props || []).find(prop => prop.id === existing.id) : null;
    const initialRecent = (existing?.palette || []).filter(color => color && color !== 'transparent').slice(-6).reverse();
    const initialLayers = existing?.layers?.length
      ? existing.layers.slice(0, CUSTOM_DECO_MAX_LAYERS).map((layer, index) => ({
          name: normalizeCustomLayerName(layer.name, index),
          visible: layer.visible !== false,
          pixels: base64ToBytes(layer.pixels),
        }))
      : [{
          name: 'LAYER 1',
          visible: true,
          pixels: existing ? base64ToBytes(existing.pixels) : new Uint8Array(initialGrid * initialGrid),
        }];
    const initialActiveLayer = Math.max(0, initialLayers.length - 1);
    return {
      id: existing?.id || '',
      grid: initialGrid,
      size: existing?.size || 40,
      palette: existing ? existing.palette.slice() : ['transparent'],
      layers: initialLayers,
      activeLayer: initialActiveLayer,
      pixels: initialLayers[initialActiveLayer].pixels,
      selection: null,
      selectionPath: [],
      lassoDrawing: false,
      clipboard: null,
      tool: 'pencil',
      color: existing?.palette?.[1] || '#333333',
      recentColors: initialRecent.length ? initialRecent : ['#333333', '#ffffff', '#9b2823', '#315fa8', '#2f8f5b', '#e2a323'],
      zoom: 1,
      undo: [],
      redo: [],
      drawing: false,
      lastCell: null,
      previewX: clamp(Number(existingPlacement?.x ?? 50), 4, 96),
      previewY: clamp(Number(existingPlacement?.y ?? 78), 4, 96),
      previewDragging: false,
      previewPointerId: null,
      inputMode: (() => {
        try { return localStorage.getItem('cigh_clean_px_inputmode_v1') === 'cursor' ? 'cursor' : 'direct'; } catch { return 'direct'; }
      })(),
      cursorX: Math.floor(initialGrid / 2),
      cursorY: Math.floor(initialGrid / 2),
      pushHolding: false,
    };
  }

  function buildCustomDecoEditorHtml({ state, existing, previewRoomState, desktopPreviewPx, ticketNow }) {
    const gridButtons = () => CUSTOM_DECO_GRIDS.map(g => `<button type="button" data-custom-grid="${g}" class="${g === state.grid ? 'on' : ''}"${existing ? ' disabled' : ''}>${g}</button>`).join('');
    const paletteButtons = () => CUSTOM_DECO_PRESET_COLORS.map(color => `<button type="button" data-custom-swatch="${color}" class="${color === state.color ? 'on' : ''}" style="--swatch:${color};" title="${color}" aria-label="${color}"></button>`).join('');

    return `
      <div class="cigh-clean-custom-dialog editor" style="--custom-room-preview-size:${desktopPreviewPx}px;">
        <div class="cigh-clean-custom-head">
          <b>${existing ? 'CUSTOM EDIT' : 'CUSTOM PIXEL'}</b>
          <span>${existing ? '수정 무료' : `새 저장 🎟️1 · 현재 ${ticketNow}장`}</span>
          <span class="cigh-clean-custom-mobile-grid" data-custom-grid-label>${state.grid}×${state.grid}</span>
          <button type="button" data-custom-close>×</button>
        </div>

        <div class="cigh-clean-custom-meta">
          <input data-custom-name maxlength="24" value="${esc(existing?.name || '커스텀 가구')}" aria-label="가구 이름">
          <div class="cigh-clean-custom-gridpick cigh-clean-custom-desktop-only">${gridButtons()}</div>
        </div>

        <div class="cigh-clean-custom-stage-row">
          <div class="cigh-clean-custom-draw-pane">
            <div class="cigh-clean-custom-canvas-wrap" data-custom-canvas-viewport>
              <div class="cigh-clean-custom-canvas-stage" data-custom-canvas-stage>
                <canvas data-custom-canvas></canvas>
                <div class="cigh-clean-custom-grid-overlay" data-custom-grid-overlay aria-hidden="true"></div>
                <canvas class="cigh-clean-custom-selection-canvas" data-custom-selection-canvas aria-hidden="true"></canvas>
                <div class="cigh-clean-custom-cell-cursor" data-custom-cell-cursor aria-hidden="true" hidden></div>
              </div>
            </div>
            <div class="cigh-clean-custom-zoom cigh-clean-custom-desktop-zoom">
              <span>ZOOM</span>
              ${CUSTOM_DECO_EDITOR_ZOOMS.map(z => `<button type="button" data-custom-zoom="${z}" class="${z === state.zoom ? 'on' : ''}">${z * 100}%</button>`).join('')}
            </div>
            <div class="cigh-clean-custom-mobile-zoom cigh-clean-custom-mobile-only">
              <button type="button" data-custom-zoom-out aria-label="축소">−</button>
              <b data-custom-zoom-label>${state.zoom * 100}%</b>
              <button type="button" data-custom-zoom-in aria-label="확대">＋</button>
              <button type="button" data-custom-zoom-fit>맞춤</button>
            </div>
            <div class="cigh-clean-custom-inputmode cigh-clean-custom-mobile-only">
              <button type="button" data-custom-inputmode="direct" class="${state.inputMode === 'direct' ? 'on' : ''}">✎ 직접 그리기</button>
              <button type="button" data-custom-inputmode="cursor" class="${state.inputMode === 'cursor' ? 'on' : ''}">✛ 커서 정밀</button>
            </div>
            <div class="cigh-clean-custom-cursorbar cigh-clean-custom-mobile-only" data-custom-cursorbar${state.inputMode === 'cursor' ? '' : ' hidden'}>
              <div class="cigh-clean-custom-dpad">
                <button type="button" class="up" data-custom-nudge="0,-1" aria-label="위">▲</button>
                <button type="button" class="left" data-custom-nudge="-1,0" aria-label="왼쪽">◀</button>
                <button type="button" class="down" data-custom-nudge="0,1" aria-label="아래">▼</button>
                <button type="button" class="right" data-custom-nudge="1,0" aria-label="오른쪽">▶</button>
              </div>
              <button type="button" class="cigh-clean-custom-push" data-custom-push>PUSH<small>누른 채 커서 이동 = 연속</small></button>
            </div>
            <div class="cigh-clean-custom-pan-note" data-custom-pan-note>PC 우클릭 드래그 · 모바일 두 손가락 드래그 또는 ✋ 이동</div>
          </div>
          <div class="cigh-clean-custom-room-preview-box cigh-clean-custom-desktop-only">
            <div class="cigh-clean-custom-room-preview-head"><span>MY ROOM PREVIEW</span><b data-custom-desktop-preview-size>${state.size}px</b></div>
            <div class="cigh-clean-custom-room-preview" data-custom-room-preview-desktop>
              ${renderCustomDecoRoomPreviewBackdrop(previewRoomState, existing?.id || '')}
              <div class="cigh-clean-custom-room-item" data-custom-room-item-desktop style="left:${state.previewX}%;top:${state.previewY}%;width:${state.size}px;height:${state.size}px;">
                <canvas data-custom-room-canvas-desktop></canvas>
              </div>
            </div>
            <div class="cigh-clean-custom-room-preview-note">그리는 내용·표시 크기가 바로 반영돼요 · 가구를 드래그해 위치도 확인</div>
          </div>
        </div>

        <div class="cigh-clean-custom-tools">
          <button type="button" data-custom-tool="pencil" class="on">✎ 연필</button>
          <button type="button" data-custom-tool="eraser">⌫ 지우개</button>
          <button type="button" data-custom-tool="fill">▣ 채우기</button>
          <button type="button" data-custom-tool="picker">⌾ 스포이드</button>
          <button type="button" data-custom-tool="lasso">◇ 올가미</button>
          <button type="button" data-custom-tool="pan">✋ 이동</button>
          <span class="cigh-clean-custom-tool-gap"></span>
          <button type="button" data-custom-undo>↶</button>
          <button type="button" data-custom-redo>↷</button>
        </div>

        <div class="cigh-clean-custom-layerbar cigh-clean-custom-desktop-only">
          <span>LAYERS</span>
          <div class="cigh-clean-custom-layerchips" data-custom-layer-list></div>
          <button type="button" data-custom-layer-add title="새 레이어">＋</button>
          <button type="button" data-custom-layer-up title="위로">↑</button>
          <button type="button" data-custom-layer-down title="아래로">↓</button>
          <button type="button" data-custom-layer-rename title="현재 레이어 이름 변경">✎</button>
          <button type="button" data-custom-layer-visible title="현재 레이어 숨기기">◉</button>
          <button type="button" data-custom-layer-delete title="레이어 삭제">−</button>
        </div>

        <div class="cigh-clean-custom-selectionbar" data-custom-selectionbar hidden>
          <span>SELECT <b data-custom-selection-count>0</b></span>
          <button type="button" data-custom-selection-move="-1,0" aria-label="선택 왼쪽 이동">←</button>
          <button type="button" data-custom-selection-move="0,-1" aria-label="선택 위 이동">↑</button>
          <button type="button" data-custom-selection-move="0,1" aria-label="선택 아래 이동">↓</button>
          <button type="button" data-custom-selection-move="1,0" aria-label="선택 오른쪽 이동">→</button>
          <button type="button" data-custom-selection-copy>복사</button>
          <button type="button" data-custom-selection-cut>잘라내기</button>
          <button type="button" data-custom-selection-paste>붙여넣기</button>
          <button type="button" data-custom-selection-delete>삭제</button>
          <button type="button" data-custom-selection-clear>해제</button>
        </div>

        <div class="cigh-clean-custom-colorbar">
          <label class="cigh-clean-custom-current-color" title="자유 색상"><input type="color" data-custom-color value="${esc(state.color)}"><span>COLOR</span></label>
          <div class="cigh-clean-custom-recent" data-custom-recent-list></div>
          <button type="button" data-custom-palette-open>PALETTE</button>
        </div>

        <div class="cigh-clean-custom-palette cigh-clean-custom-desktop-only">
          <div class="cigh-clean-custom-palette-head"><span>PALETTE</span><em>색을 누르면 연필로 전환</em></div>
          <div class="cigh-clean-custom-swatches">${paletteButtons()}</div>
        </div>

        <div class="cigh-clean-custom-size cigh-clean-custom-desktop-only">
          <label>방 표시 크기 <input type="range" min="24" max="160" step="2" value="${state.size}" data-custom-size><b data-custom-size-label>${state.size}px</b></label>
        </div>
        <div class="cigh-clean-custom-actions cigh-clean-custom-desktop-only">
          ${existing ? '<button type="button" class="danger" data-custom-delete>DELETE</button>' : ''}
          <button type="button" data-custom-clear>전체 지우기</button>
          <button type="button" data-custom-share>SHARE CODE</button>
          <button type="button" class="primary" data-custom-save>${existing ? 'SAVE' : '🎟️ 1장 · SAVE'}</button>
        </div>
        <div class="cigh-clean-custom-note cigh-clean-custom-desktop-only">투명 배경 · 최대 ${CUSTOM_DECO_MAX_LAYERS} 레이어 · SHARE CODE에 레이어 포함 · 공식 가챠/수집 업적 제외</div>

        <div class="cigh-clean-custom-mobile-footer cigh-clean-custom-mobile-only">
          <button type="button" data-custom-preview-open>ROOM</button>
          <button type="button" data-custom-layers-open>LAYER <b data-custom-layer-count>${state.layers.length}/${CUSTOM_DECO_MAX_LAYERS}</b></button>
          <button type="button" data-custom-settings-open>⚙ 설정</button>
          <button type="button" class="primary" data-custom-save>${existing ? 'SAVE' : '🎟️1 · SAVE'}</button>
        </div>

        <div class="cigh-clean-custom-sheet" data-custom-palette-sheet hidden>
          <div class="cigh-clean-custom-sheet-card palette-sheet">
            <div class="cigh-clean-custom-sheet-head"><b>PALETTE</b><button type="button" data-custom-palette-close>×</button></div>
            <div class="cigh-clean-custom-swatches">${paletteButtons()}</div>
          </div>
        </div>

        <div class="cigh-clean-custom-sheet" data-custom-layers-sheet hidden>
          <div class="cigh-clean-custom-sheet-card">
            <div class="cigh-clean-custom-sheet-head"><b>LAYERS</b><span data-custom-layer-count>${state.layers.length}/${CUSTOM_DECO_MAX_LAYERS}</span><button type="button" data-custom-layers-close>×</button></div>
            <div class="cigh-clean-custom-layer-sheet-list" data-custom-layer-sheet-list></div>
            <div class="cigh-clean-custom-layer-sheet-actions">
              <button type="button" data-custom-layer-add>＋ 새 레이어</button>
              <button type="button" data-custom-layer-up>↑ 위로</button>
              <button type="button" data-custom-layer-down>↓ 아래로</button>
              <button type="button" data-custom-layer-delete>− 삭제</button>
            </div>
            <div class="cigh-clean-custom-note">최대 ${CUSTOM_DECO_MAX_LAYERS}장 · 목록에서 눈 아이콘으로 표시/숨김 · 위 레이어가 앞에 보여요.</div>
          </div>
        </div>

        <div class="cigh-clean-custom-sheet" data-custom-settings-sheet hidden>
          <div class="cigh-clean-custom-sheet-card">
            <div class="cigh-clean-custom-sheet-head"><b>SETTINGS</b><button type="button" data-custom-settings-close>×</button></div>
            <div class="cigh-clean-custom-setting-row">
              <span>캔버스</span>
              <div class="cigh-clean-custom-gridpick">${gridButtons()}</div>
            </div>
            <div class="cigh-clean-custom-setting-row vertical">
              <label>방 표시 크기 <b data-custom-size-label>${state.size}px</b></label>
              <input type="range" min="24" max="160" step="2" value="${state.size}" data-custom-size>
            </div>
            <div class="cigh-clean-custom-setting-actions">
              <button type="button" data-custom-clear>전체 지우기</button>
              <button type="button" data-custom-share>SHARE CODE</button>
              ${existing ? '<button type="button" class="danger" data-custom-delete>DELETE</button>' : ''}
            </div>
            <div class="cigh-clean-custom-note">투명 배경 · CUSTOM 등급 · 공식 가챠/수집 업적 제외</div>
          </div>
        </div>

        <div class="cigh-clean-custom-preview-layer" data-custom-preview-layer hidden>
          <div class="cigh-clean-custom-preview-dialog">
            <div class="cigh-clean-custom-room-preview-head"><span>MY ROOM PREVIEW</span><b data-custom-preview-size>${state.size}px</b><button type="button" data-custom-preview-close>×</button></div>
            <div class="cigh-clean-custom-room-preview" data-custom-room-preview>
              ${renderCustomDecoRoomPreviewBackdrop(previewRoomState, existing?.id || '')}
              <div class="cigh-clean-custom-room-item" data-custom-room-item style="left:${state.previewX}%;top:${state.previewY}%;width:${state.size}px;height:${state.size}px;">
                <canvas data-custom-room-canvas></canvas>
              </div>
            </div>
            <div class="cigh-clean-custom-preview-size-row">
              <span>방 표시 크기</span>
              <input type="range" min="24" max="160" step="2" value="${state.size}" data-custom-preview-size-range>
              <b data-custom-preview-size-label>${state.size}px</b>
            </div>
            <div class="cigh-clean-custom-room-preview-note">저장 전 도안 그대로 확인 · 가구를 드래그해서 위치도 테스트할 수 있어요.</div>
            <button type="button" class="cigh-clean-custom-preview-back" data-custom-preview-close>← 편집으로 돌아가기</button>
          </div>
        </div>
      </div>`;
  }

  function getCustomDecoEditorElements(modal) {
    return {
      dialog: modal.querySelector('.cigh-clean-custom-dialog'),
      canvas: modal.querySelector('[data-custom-canvas]'),
      canvasViewport: modal.querySelector('[data-custom-canvas-viewport]'),
      canvasStage: modal.querySelector('[data-custom-canvas-stage]'),
      gridOverlay: modal.querySelector('[data-custom-grid-overlay]'),
      selectionCanvas: modal.querySelector('[data-custom-selection-canvas]'),
      cellCursor: modal.querySelector('[data-custom-cell-cursor]'),
      roomPreview: modal.querySelector('[data-custom-room-preview]'),
      roomItem: modal.querySelector('[data-custom-room-item]'),
      roomCanvas: modal.querySelector('[data-custom-room-canvas]'),
      desktopRoomPreview: modal.querySelector('[data-custom-room-preview-desktop]'),
      desktopRoomItem: modal.querySelector('[data-custom-room-item-desktop]'),
      desktopRoomCanvas: modal.querySelector('[data-custom-room-canvas-desktop]'),
      colorInput: modal.querySelector('[data-custom-color]'),
      paletteSheet: modal.querySelector('[data-custom-palette-sheet]'),
      layersSheet: modal.querySelector('[data-custom-layers-sheet]'),
      settingsSheet: modal.querySelector('[data-custom-settings-sheet]'),
      previewLayer: modal.querySelector('[data-custom-preview-layer]'),
    };
  }
  function rbLegacy_openCustomDecoEditor(existingId = '') {
    closeCustomDecoModal();
    const existing = existingId ? getCustomDecoItem(existingId) : null;
    // PC 미리보기는 현재 HUD의 실제 마이룸 표시 폭을 그대로 따라간다.
    // small/medium/large UI에서 미리보기만 과도하게 커지는 것을 방지하고,
    // 40px 가구가 실제 방에서도 같은 체감 크기로 보이게 한다.
    const liveRoomEl = document.querySelector(`#${PANEL_ID} .cigh-clean-pet-wrap`);
    const liveRoomRect = liveRoomEl?.getBoundingClientRect?.();
    const desktopPreviewPx = clamp(Math.round(Number(liveRoomRect?.width || 252)), 220, 360);
    const previewRoomState = cloneDecoState(decoEditMode ? getDecoDraft() : getDecoState());
    const state = createCustomDecoEditorState(existing, previewRoomState);

    const modal = document.createElement('div');
    modal.id = 'cigh-clean-custom-deco-modal';
    modal.className = 'cigh-clean-custom-modal';
    modal.setAttribute('data-cigh-theme', detectThemeMode());
    const ticketNow = getDecoState().tickets;
    modal.innerHTML = buildCustomDecoEditorHtml({ state, existing, previewRoomState, desktopPreviewPx, ticketNow });
    document.body.appendChild(modal);

    const { dialog, canvas, canvasViewport, canvasStage, gridOverlay, selectionCanvas, cellCursor, roomPreview, roomItem, roomCanvas, desktopRoomPreview, desktopRoomItem, desktopRoomCanvas, colorInput, paletteSheet, layersSheet, settingsSheet, previewLayer } = getCustomDecoEditorElements(modal);

    const isMobilePixelEditor = () => {
      try { return window.matchMedia('(max-width: 620px)').matches; } catch { return window.innerWidth <= 620; }
    };
    const isCursorMode = () => isMobilePixelEditor() && state.inputMode === 'cursor';

    const renderRecentColors = () => {
      const host = modal.querySelector('[data-custom-recent-list]');
      if (!host) return;
      host.innerHTML = state.recentColors.slice(0, 6).map(color => `<button type="button" data-custom-recent="${esc(color)}" style="--recent:${esc(color)}" title="${esc(color)}" aria-label="${esc(color)}"></button>`).join('');
    };

    const syncSizeUi = () => {
      modal.querySelectorAll('[data-custom-size]').forEach(input => { if (Number(input.value) !== state.size) input.value = String(state.size); });
      const previewRange = modal.querySelector('[data-custom-preview-size-range]');
      if (previewRange && Number(previewRange.value) !== state.size) previewRange.value = String(state.size);
      modal.querySelectorAll('[data-custom-size-label], [data-custom-preview-size-label], [data-custom-preview-size], [data-custom-desktop-preview-size]').forEach(label => { label.textContent = `${state.size}px`; });
      for (const item of [roomItem, desktopRoomItem]) {
        if (!item) continue;
        item.style.width = `${state.size}px`;
        item.style.height = `${state.size}px`;
      }
    };

    const syncActiveLayer = ({ clearSelection = true } = {}) => {
      if (!Array.isArray(state.layers) || !state.layers.length) {
        state.layers = [{ name: 'LAYER 1', visible: true, pixels: new Uint8Array(state.grid * state.grid) }];
      }
      state.activeLayer = clamp(Math.floor(Number(state.activeLayer || 0)), 0, state.layers.length - 1);
      state.pixels = state.layers[state.activeLayer].pixels;
      if (clearSelection) {
        state.selection = null;
        state.selectionPath = [];
        state.lassoDrawing = false;
      }
    };

    const selectionCount = () => state.selection ? state.selection.reduce((sum, value) => sum + (value ? 1 : 0), 0) : 0;
    const renderSelectionOverlay = () => {
      if (!selectionCanvas) return;
      selectionCanvas.width = state.grid;
      selectionCanvas.height = state.grid;
      const ctx = selectionCanvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, state.grid, state.grid);
      const accent = getComputedStyle(dialog).getPropertyValue('--cigh-accent').trim() || '#64d6b0';
      if (state.selection) {
        ctx.save();
        ctx.globalAlpha = .20;
        ctx.fillStyle = accent;
        for (let y = 0; y < state.grid; y++) {
          for (let x = 0; x < state.grid; x++) {
            if (state.selection[y * state.grid + x]) ctx.fillRect(x, y, 1, 1);
          }
        }
        ctx.restore();
        ctx.strokeStyle = accent;
        ctx.lineWidth = .12;
        ctx.beginPath();
        const selected = (x, y) => x >= 0 && y >= 0 && x < state.grid && y < state.grid && !!state.selection[y * state.grid + x];
        for (let y = 0; y < state.grid; y++) {
          for (let x = 0; x < state.grid; x++) {
            if (!selected(x, y)) continue;
            if (!selected(x, y - 1)) { ctx.moveTo(x, y); ctx.lineTo(x + 1, y); }
            if (!selected(x + 1, y)) { ctx.moveTo(x + 1, y); ctx.lineTo(x + 1, y + 1); }
            if (!selected(x, y + 1)) { ctx.moveTo(x + 1, y + 1); ctx.lineTo(x, y + 1); }
            if (!selected(x - 1, y)) { ctx.moveTo(x, y + 1); ctx.lineTo(x, y); }
          }
        }
        ctx.stroke();
      }
      if (state.lassoDrawing && state.selectionPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = .16;
        ctx.setLineDash([.45, .35]);
        ctx.beginPath();
        ctx.moveTo(state.selectionPath[0].x, state.selectionPath[0].y);
        for (const point of state.selectionPath.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.stroke();
        ctx.restore();
      }
    };

    const renderSelectionUi = () => {
      const bar = modal.querySelector('[data-custom-selectionbar]');
      if (!bar) return;
      const count = selectionCount();
      const hasClipboard = !!state.clipboard;
      bar.hidden = !count && !hasClipboard;
      const label = bar.querySelector('[data-custom-selection-count]');
      if (label) label.textContent = count ? String(count) : 'CLIP';
      bar.querySelectorAll('[data-custom-selection-move], [data-custom-selection-copy], [data-custom-selection-cut], [data-custom-selection-delete], [data-custom-selection-clear]').forEach(btn => { btn.disabled = !count; });
      const paste = bar.querySelector('[data-custom-selection-paste]');
      if (paste) paste.disabled = !hasClipboard;
    };

    const renderLayerUi = () => {
      const chips = modal.querySelector('[data-custom-layer-list]');
      if (chips) {
        chips.innerHTML = state.layers.map((layer, index) => {
          const visible = layer.visible !== false;
          const status = visible ? '◉' : '○';
          const action = visible ? '숨기기' : '보이기';
          return `<span class="cigh-clean-custom-layer-chip-wrap"><button type="button" class="cigh-clean-custom-layer-eye" data-custom-layer-eye="${index}" title="${esc(layer.name)} ${action}" aria-label="${esc(layer.name)} ${action}">${status}</button><button type="button" class="cigh-clean-custom-layer-chip${index === state.activeLayer ? ' on' : ''}${visible ? '' : ' muted'}" data-custom-layer-index="${index}" title="${esc(layer.name)} 선택"><span class="layer-label">${esc(layer.name)}</span></button></span>`;
        }).join('');
      }
      const sheetList = modal.querySelector('[data-custom-layer-sheet-list]');
      if (sheetList) {
        sheetList.innerHTML = [...state.layers].map((layer, index) => ({ layer, index })).reverse().map(({ layer, index }) => `
          <div class="cigh-clean-custom-layer-row${index === state.activeLayer ? ' on' : ''}${layer.visible === false ? ' muted' : ''}">
            <button type="button" class="name" data-custom-layer-index="${index}" title="레이어 선택">${index === state.activeLayer ? '▶ ' : ''}${esc(layer.name)}</button>
            <button type="button" class="rename" data-custom-layer-rename-index="${index}" aria-label="레이어 이름 변경" title="레이어 이름 변경">✎</button>
            <button type="button" class="eye" data-custom-layer-eye="${index}" aria-label="레이어 ${layer.visible === false ? '보이기' : '숨기기'}" title="레이어 ${layer.visible === false ? '보이기' : '숨기기'}">${layer.visible === false ? '○' : '◉'}</button>
          </div>`).join('');
      }
      modal.querySelectorAll('[data-custom-layer-count]').forEach(el => { el.textContent = `${state.layers.length}/${CUSTOM_DECO_MAX_LAYERS}`; });
      modal.querySelectorAll('[data-custom-layer-add]').forEach(btn => { btn.disabled = state.layers.length >= CUSTOM_DECO_MAX_LAYERS; });
      modal.querySelectorAll('[data-custom-layer-delete]').forEach(btn => { btn.disabled = state.layers.length <= 1; });
      modal.querySelectorAll('[data-custom-layer-down]').forEach(btn => { btn.disabled = state.activeLayer <= 0; });
      modal.querySelectorAll('[data-custom-layer-up]').forEach(btn => { btn.disabled = state.activeLayer >= state.layers.length - 1; });
      modal.querySelectorAll('[data-custom-layer-visible]').forEach(btn => {
        const layer = state.layers[state.activeLayer];
        const hidden = layer?.visible === false;
        btn.textContent = hidden ? '○' : '◉';
        btn.title = hidden ? '현재 레이어 보이기' : '현재 레이어 숨기기';
        btn.setAttribute('aria-label', btn.title);
      });
      modal.querySelectorAll('[data-custom-layer-rename]').forEach(btn => {
        btn.title = `현재 레이어 이름 변경: ${state.layers[state.activeLayer]?.name || ''}`;
      });
    };

    const draw = () => {
      const composite = customEditorCompositePixels(state);
      renderCustomPixelCanvas(canvas, state, composite);
      renderCustomPixelCanvas(roomCanvas, state, composite);
      renderCustomPixelCanvas(desktopRoomCanvas, state, composite);
      updateCustomEditorStageScale(canvasStage, gridOverlay, state);
      renderSelectionOverlay();
      for (const item of [roomItem, desktopRoomItem]) {
        if (!item) continue;
        item.style.left = `${state.previewX}%`;
        item.style.top = `${state.previewY}%`;
      }
      syncSizeUi();
    };
    syncActiveLayer({ clearSelection: false });
    draw();
    renderRecentColors();
    renderLayerUi();
    renderSelectionUi();

    let customEditorResizeFrame = 0;
    const customEditorResizeObserver = typeof ResizeObserver === 'function' && canvasViewport
      ? new ResizeObserver(() => {
          cancelAnimationFrame(customEditorResizeFrame);
          customEditorResizeFrame = requestAnimationFrame(() => {
            updateCustomEditorStageScale(canvasStage, gridOverlay, state);
            if (isCursorMode()) placeGridCursor();
          });
        })
      : null;
    customEditorResizeObserver?.observe(canvasViewport);

    const setTool = tool => {
      state.tool = ['pencil', 'eraser', 'fill', 'picker', 'lasso', 'pan'].includes(tool) ? tool : 'pencil';
      modal.querySelectorAll('[data-custom-tool]').forEach(btn => btn.classList.toggle('on', btn.dataset.customTool === state.tool));
      canvas?.classList.toggle('cigh-clean-custom-lasso-cursor', state.tool === 'lasso');
      const cursorBar = modal.querySelector('[data-custom-cursorbar]');
      if (cursorBar) cursorBar.hidden = !isCursorMode() || state.tool === 'lasso';
      const note = modal.querySelector('[data-custom-pan-note]');
      if (note) note.textContent = state.tool === 'lasso'
        ? '올가미로 둘러 선택 · 선택 바에서 이동/복사/붙여넣기/삭제'
        : isCursorMode()
          ? '한 손가락으로 커서 이동 · PUSH로 찍기 · 두 손가락 또는 ✋로 화면 이동'
          : 'PC 우클릭 드래그 · 모바일 두 손가락 드래그 또는 ✋ 이동';
      if (cellCursor) {
        if (state.tool === 'lasso' || (state.tool === 'pan' && !isCursorMode())) cellCursor.hidden = true;
        else if (isCursorMode()) placeGridCursor();
      }
    };
    const setColor = color => {
      state.color = normalizeCustomHex(color);
      if (colorInput) colorInput.value = state.color;
      state.recentColors = [state.color, ...state.recentColors.filter(c => c !== state.color)].slice(0, 6);
      renderRecentColors();
      modal.querySelectorAll('[data-custom-swatch]').forEach(btn => btn.classList.toggle('on', String(btn.dataset.customSwatch || '').toLowerCase() === state.color));
    };
    const setSize = value => {
      state.size = clamp(Number(value || 40), 24, 160);
      syncSizeUi();
    };
    const setZoom = zoom => {
      state.zoom = clamp(Number(zoom || 1), 1, 4);
      modal.querySelectorAll('[data-custom-zoom]').forEach(btn => btn.classList.toggle('on', Math.abs(Number(btn.dataset.customZoom) - state.zoom) < 0.001));
      modal.querySelectorAll('[data-custom-zoom-label]').forEach(label => { label.textContent = `${Math.round(state.zoom * 100)}%`; });
      draw();
      if (canvasViewport) {
        const focusX = Math.max(0, (canvasViewport.scrollWidth - canvasViewport.clientWidth) / 2);
        const focusY = Math.max(0, (canvasViewport.scrollHeight - canvasViewport.clientHeight) / 2);
        canvasViewport.scrollTo({ left: focusX, top: focusY, behavior: 'instant' });
      }
      if (isCursorMode()) requestAnimationFrame(() => { placeGridCursor(); ensureCursorVisible(); });
    };
    const stepZoom = direction => {
      const current = Number(state.zoom || 1);
      let next = current;
      if (direction > 0) next = CUSTOM_DECO_EDITOR_ZOOMS.find(z => z > current + 0.001) || CUSTOM_DECO_EDITOR_ZOOMS.at(-1);
      else next = [...CUSTOM_DECO_EDITOR_ZOOMS].reverse().find(z => z < current - 0.001) || CUSTOM_DECO_EDITOR_ZOOMS[0];
      setZoom(next);
    };
    const openSheet = sheet => { if (sheet) sheet.hidden = false; };
    const closeSheet = sheet => { if (sheet) sheet.hidden = true; };
    const openPreview = () => { if (previewLayer) { draw(); previewLayer.hidden = false; } };
    const closePreview = () => { if (previewLayer) previewLayer.hidden = true; };

    // Undo/Redo는 화면 버튼과 PC 키보드 단축키가 같은 복원 경로를 사용한다.
    const runCustomUndo = () => {
      if (!state.undo.length) return false;
      state.redo.push(customEditorSnapshot(state));
      if (state.redo.length > 40) state.redo.shift();
      customEditorRestoreSnapshot(state, state.undo.pop());
      renderLayerUi();
      renderSelectionUi();
      draw();
      return true;
    };
    const runCustomRedo = () => {
      if (!state.redo.length) return false;
      state.undo.push(customEditorSnapshot(state));
      if (state.undo.length > 40) state.undo.shift();
      customEditorRestoreSnapshot(state, state.redo.pop());
      renderLayerUi();
      renderSelectionUi();
      draw();
      return true;
    };
    const isCustomEditorTypingTarget = target => {
      const el = target instanceof Element ? target : document.activeElement;
      if (!(el instanceof Element)) return false;
      return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]');
    };
    const customEditorKeydown = event => {
      if (!modal.isConnected || isCustomEditorTypingTarget(event.target)) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const key = String(event.key || '').toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      if (!isUndo && !isRedo) return;

      // 브라우저/페이지의 기본 Undo가 뒤에서 같이 실행되지 않게 에디터가 단축키를 소비한다.
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) runCustomRedo();
      else runCustomUndo();
    };
    document.addEventListener('keydown', customEditorKeydown, true);

    const renameCustomLayer = index => {
      const safeIndex = clamp(Number(index || 0), 0, state.layers.length - 1);
      const layer = state.layers[safeIndex];
      if (!layer) return false;
      const entered = prompt('레이어 이름', layer.name);
      if (entered == null) return false;
      const nextName = normalizeCustomLayerName(entered, safeIndex);
      if (nextName === layer.name) return false;
      customEditorPushUndo(state);
      layer.name = nextName;
      renderLayerUi();
      playBeep('save');
      return true;
    };

    modal.addEventListener('click', async event => {
      const close = event.target.closest('[data-custom-close]');
      if (close || event.target === modal) { closeCustomDecoModal(); return; }

      if (event.target.closest('[data-custom-preview-open]')) { openPreview(); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-preview-close]')) { closePreview(); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-palette-open]')) { openSheet(paletteSheet); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-palette-close]') || event.target === paletteSheet) { closeSheet(paletteSheet); return; }
      if (event.target.closest('[data-custom-layers-open]')) { renderLayerUi(); openSheet(layersSheet); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-layers-close]') || event.target === layersSheet) { closeSheet(layersSheet); return; }
      if (event.target.closest('[data-custom-settings-open]')) { openSheet(settingsSheet); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-settings-close]') || event.target === settingsSheet) { closeSheet(settingsSheet); return; }

      const layerRenameIndexBtn = event.target.closest('[data-custom-layer-rename-index]');
      if (layerRenameIndexBtn) {
        renameCustomLayer(layerRenameIndexBtn.dataset.customLayerRenameIndex);
        return;
      }
      if (event.target.closest('[data-custom-layer-rename]')) {
        renameCustomLayer(state.activeLayer);
        return;
      }

      const layerIndexBtn = event.target.closest('[data-custom-layer-index]');
      if (layerIndexBtn) {
        state.activeLayer = clamp(Number(layerIndexBtn.dataset.customLayerIndex || 0), 0, state.layers.length - 1);
        syncActiveLayer();
        renderLayerUi();
        renderSelectionUi();
        draw();
        playBeep('tab');
        return;
      }
      const layerEyeBtn = event.target.closest('[data-custom-layer-eye]');
      if (layerEyeBtn) {
        const index = clamp(Number(layerEyeBtn.dataset.customLayerEye || 0), 0, state.layers.length - 1);
        customEditorPushUndo(state);
        state.layers[index].visible = state.layers[index].visible === false;
        renderLayerUi();
        draw();
        return;
      }
      if (event.target.closest('[data-custom-layer-add]')) {
        if (state.layers.length >= CUSTOM_DECO_MAX_LAYERS) return;
        customEditorPushUndo(state);
        const insertAt = state.activeLayer + 1;
        state.layers.splice(insertAt, 0, {
          name: `LAYER ${state.layers.length + 1}`,
          visible: true,
          pixels: new Uint8Array(state.grid * state.grid),
        });
        state.activeLayer = insertAt;
        syncActiveLayer();
        renderLayerUi();
        renderSelectionUi();
        draw();
        return;
      }
      if (event.target.closest('[data-custom-layer-up]')) {
        const target = state.activeLayer + 1;
        if (target >= state.layers.length) return;
        customEditorPushUndo(state);
        [state.layers[state.activeLayer], state.layers[target]] = [state.layers[target], state.layers[state.activeLayer]];
        state.activeLayer = target;
        syncActiveLayer();
        renderLayerUi();
        renderSelectionUi();
        draw();
        return;
      }
      if (event.target.closest('[data-custom-layer-down]')) {
        const target = state.activeLayer - 1;
        if (target < 0) return;
        customEditorPushUndo(state);
        [state.layers[state.activeLayer], state.layers[target]] = [state.layers[target], state.layers[state.activeLayer]];
        state.activeLayer = target;
        syncActiveLayer();
        renderLayerUi();
        renderSelectionUi();
        draw();
        return;
      }
      if (event.target.closest('[data-custom-layer-visible]')) {
        customEditorPushUndo(state);
        state.layers[state.activeLayer].visible = state.layers[state.activeLayer].visible === false;
        renderLayerUi();
        draw();
        return;
      }
      if (event.target.closest('[data-custom-layer-delete]')) {
        if (state.layers.length <= 1) return;
        const layer = state.layers[state.activeLayer];
        if (layer.pixels.some(Boolean) && !confirm(`${layer.name} 레이어를 삭제할까요?`)) return;
        customEditorPushUndo(state);
        state.layers.splice(state.activeLayer, 1);
        state.activeLayer = clamp(state.activeLayer - 1, 0, state.layers.length - 1);
        syncActiveLayer();
        renderLayerUi();
        renderSelectionUi();
        draw();
        return;
      }

      const selectionMove = event.target.closest('[data-custom-selection-move]');
      if (selectionMove) {
        const [dx, dy] = String(selectionMove.dataset.customSelectionMove || '0,0').split(',').map(Number);
        moveSelectionBy(dx, dy);
        return;
      }
      if (event.target.closest('[data-custom-selection-copy]')) { copySelection(); return; }
      if (event.target.closest('[data-custom-selection-cut]')) { cutSelection(); return; }
      if (event.target.closest('[data-custom-selection-paste]')) { pasteSelection(); return; }
      if (event.target.closest('[data-custom-selection-delete]')) { deleteSelection(); return; }
      if (event.target.closest('[data-custom-selection-clear]')) {
        state.selection = null;
        state.selectionPath = [];
        state.lassoDrawing = false;
        renderSelectionUi();
        renderSelectionOverlay();
        return;
      }

      const tool = event.target.closest('[data-custom-tool]');
      if (tool) { setTool(tool.dataset.customTool || 'pencil'); playBeep('tab'); return; }
      const zoomBtn = event.target.closest('[data-custom-zoom]');
      if (zoomBtn) { setZoom(Number(zoomBtn.dataset.customZoom || 1)); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-zoom-out]')) { stepZoom(-1); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-zoom-in]')) { stepZoom(1); playBeep('tab'); return; }
      if (event.target.closest('[data-custom-zoom-fit]')) {
        if (canvasViewport) {
          const roomW = Math.max(1, canvasViewport.clientWidth - 6);
          const roomH = Math.max(1, canvasViewport.clientHeight - 6);
          const grid = Math.max(1, Number(state.grid || 32));
          const baseCell = customEditorBaseCellPx(grid);
          // 모바일 맞춤은 논리 1px가 항상 정수 CSS px가 되도록 셀 크기를 먼저 정한다.
          const fitCell = clamp(Math.floor(Math.min(roomW / grid, roomH / grid)), baseCell, baseCell * 4);
          setZoom(fitCell / baseCell);
        }
        playBeep('tab');
        return;
      }

      const recent = event.target.closest('[data-custom-recent]');
      if (recent) { setColor(recent.dataset.customRecent || '#333333'); setTool('pencil'); playBeep('tab'); return; }
      const swatch = event.target.closest('[data-custom-swatch]');
      if (swatch) { setColor(swatch.dataset.customSwatch || '#333333'); setTool('pencil'); playBeep('tab'); return; }

      const gridBtn = event.target.closest('[data-custom-grid]');
      if (gridBtn && !existing) {
        const grid = Number(gridBtn.dataset.customGrid || 32);
        if (grid !== state.grid && state.layers.some(layer => layer.pixels.some(value => value !== 0)) && !confirm(`${grid}×${grid}로 바꾸면 모든 레이어의 현재 그림이 지워져요. 계속할까요?`)) return;
        state.grid = CUSTOM_DECO_GRIDS.includes(grid) ? grid : 32;
        state.palette = ['transparent'];
        state.layers = [{ name: 'LAYER 1', visible: true, pixels: new Uint8Array(state.grid * state.grid) }];
        state.activeLayer = 0;
        state.pixels = state.layers[0].pixels;
        state.selection = null;
        state.selectionPath = [];
        state.clipboard = null;
        state.zoom = 1;
        state.cursorX = Math.floor(state.grid / 2);
        state.cursorY = Math.floor(state.grid / 2);
        state.undo = [];
        state.redo = [];
        renderLayerUi();
        renderSelectionUi();
        modal.querySelectorAll('[data-custom-grid]').forEach(btn => btn.classList.toggle('on', Number(btn.dataset.customGrid) === state.grid));
        modal.querySelectorAll('[data-custom-grid-label]').forEach(label => { label.textContent = `${state.grid}×${state.grid}`; });
        setZoom(1);
        if (canvasViewport) canvasViewport.scrollTo({ left: 0, top: 0 });
        return;
      }
      if (event.target.closest('[data-custom-undo]')) { runCustomUndo(); return; }
      if (event.target.closest('[data-custom-redo]')) { runCustomRedo(); return; }
      if (event.target.closest('[data-custom-clear]')) {
        if (!state.layers.some(layer => layer.pixels.some(v => v !== 0))) return;
        if (!confirm('모든 레이어의 도안을 전부 지울까요?')) return;
        customEditorPushUndo(state);
        state.layers.forEach(layer => layer.pixels.fill(0));
        state.selection = null;
        renderSelectionUi();
        draw();
        closeSheet(settingsSheet);
        return;
      }
      if (event.target.closest('[data-custom-delete]') && existing) {
        if (!confirm(`'${existing.name}' 커스텀 가구를 삭제할까요?\n배치된 가구도 함께 사라지며 티켓은 환불되지 않아요.`)) return;
        try {
          deleteCustomDeco(existing.id);
          closeCustomDecoModal();
          renderContent();
          setFooter('CUSTOM DELETED');
          playBeep('save');
        } catch (err) { alert(err?.message || err); playBeep('error'); }
        return;
      }
      if (event.target.closest('[data-custom-share]')) {
        try {
          const code = await encodeCustomDecoShareCode(getCustomEditorInput(modal, state));
          const copied = await copyTextSafely(code);
          if (!copied) throw new Error('공유코드 복사에 실패했어요.');
          setFooter('CUSTOM CODE COPIED');
          playBeep('save');
          alert(`커스텀 가구 공유코드를 복사했어요.\n${code.length.toLocaleString()}자`);
        } catch (err) { alert(err?.message || err); playBeep('error'); }
        return;
      }
      if (event.target.closest('[data-custom-save]')) {
        try {
          const input = getCustomEditorInput(modal, state);
          const saved = existing ? updateExistingCustomDeco(existing.id, input) : commitNewCustomDeco(input);
          if (!existing) {
            bumpAchvCounter('customDecoCreated', 1, true);
            announceAchvUnlocks();
          }
          closeCustomDecoModal();
          renderContent();
          setFooter(existing ? 'CUSTOM SAVED' : `CUSTOM CREATED · 🎟️ ${getDecoState().tickets}`);
          playBeep('save');
          showPopup([`▶${saved.name}`, existing ? '▷커스텀 가구 수정 완료!' : '▷CUSTOM 가구 제작 완료! 🎟️ -1']);
        } catch (err) { alert(err?.message || err); playBeep('error'); }
        return;
      }
    });

    colorInput?.addEventListener('input', () => { setColor(colorInput.value); });
    modal.querySelectorAll('[data-custom-size]').forEach(input => input.addEventListener('input', event => setSize(event.target.value)));
    modal.querySelector('[data-custom-preview-size-range]')?.addEventListener('input', event => setSize(event.target.value));

    const moveRoomPreviewItem = (event, preview, item) => {
      if (!preview || !item) return;
      const rect = preview.getBoundingClientRect();
      state.previewX = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 4, 96);
      state.previewY = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 4, 96);
      for (const target of [roomItem, desktopRoomItem]) {
        if (!target) continue;
        target.style.left = `${state.previewX}%`;
        target.style.top = `${state.previewY}%`;
      }
    };

    const attachRoomPreviewDrag = (preview, item) => {
      if (!preview || !item) return;
      item.addEventListener('pointerdown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        state.previewDragging = true;
        state.previewPointerId = event.pointerId;
        item.classList.add('dragging');
        moveRoomPreviewItem(event, preview, item);
        try { item.setPointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        event.stopPropagation();
      });
      item.addEventListener('pointermove', event => {
        if (!state.previewDragging || state.previewPointerId !== event.pointerId) return;
        moveRoomPreviewItem(event, preview, item);
        event.preventDefault();
      });
      const endDrag = event => {
        if (!state.previewDragging || state.previewPointerId !== event.pointerId) return;
        state.previewDragging = false;
        state.previewPointerId = null;
        item.classList.remove('dragging');
        try { item.releasePointerCapture(event.pointerId); } catch {}
        event.preventDefault();
      };
      item.addEventListener('pointerup', endDrag);
      item.addEventListener('pointercancel', endDrag);
    };
    attachRoomPreviewDrag(roomPreview, roomItem);
    attachRoomPreviewDrag(desktopRoomPreview, desktopRoomItem);

    const selectionBounds = mask => {
      if (!mask) return null;
      let minX = state.grid, minY = state.grid, maxX = -1, maxY = -1;
      for (let y = 0; y < state.grid; y++) {
        for (let x = 0; x < state.grid; x++) {
          if (!mask[y * state.grid + x]) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      return maxX >= 0 ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    };

    const copySelection = () => {
      const bounds = selectionBounds(state.selection);
      if (!bounds) return false;
      const pixels = new Uint8Array(bounds.w * bounds.h);
      const mask = new Uint8Array(bounds.w * bounds.h);
      for (let y = 0; y < bounds.h; y++) {
        for (let x = 0; x < bounds.w; x++) {
          const src = (bounds.y + y) * state.grid + bounds.x + x;
          const dst = y * bounds.w + x;
          if (!state.selection[src]) continue;
          mask[dst] = 1;
          pixels[dst] = state.pixels[src];
        }
      }
      state.clipboard = { ...bounds, pixels, mask };
      renderSelectionUi();
      return true;
    };

    const deleteSelection = ({ pushUndo = true } = {}) => {
      if (!state.selection || !selectionCount()) return false;
      if (pushUndo) customEditorPushUndo(state);
      for (let i = 0; i < state.selection.length; i++) if (state.selection[i]) state.pixels[i] = 0;
      draw();
      renderSelectionUi();
      return true;
    };

    const cutSelection = () => {
      if (!copySelection()) return false;
      return deleteSelection({ pushUndo: true });
    };

    const moveSelectionBy = (dx, dy) => {
      dx = Math.trunc(Number(dx || 0));
      dy = Math.trunc(Number(dy || 0));
      if ((!dx && !dy) || !state.selection || !selectionCount()) return false;
      customEditorPushUndo(state);
      const source = state.pixels.slice();
      const next = state.pixels.slice();
      const nextMask = new Uint8Array(state.selection.length);
      for (let i = 0; i < state.selection.length; i++) if (state.selection[i]) next[i] = 0;
      for (let y = 0; y < state.grid; y++) {
        for (let x = 0; x < state.grid; x++) {
          const src = y * state.grid + x;
          if (!state.selection[src]) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= state.grid || ny >= state.grid) continue;
          const dst = ny * state.grid + nx;
          next[dst] = source[src];
          nextMask[dst] = 1;
        }
      }
      state.layers[state.activeLayer].pixels = next;
      state.pixels = next;
      state.selection = nextMask.some(Boolean) ? nextMask : null;
      draw();
      renderSelectionUi();
      return true;
    };

    const pasteSelection = () => {
      const clip = state.clipboard;
      if (!clip || !clip.mask?.some(Boolean)) return false;
      customEditorPushUndo(state);
      const maxX = Math.max(0, state.grid - clip.w);
      const maxY = Math.max(0, state.grid - clip.h);
      const targetX = clamp(Number(clip.x || 0) + 1, 0, maxX);
      const targetY = clamp(Number(clip.y || 0) + 1, 0, maxY);
      const nextMask = new Uint8Array(state.grid * state.grid);
      for (let y = 0; y < clip.h; y++) {
        for (let x = 0; x < clip.w; x++) {
          const src = y * clip.w + x;
          if (!clip.mask[src]) continue;
          const dst = (targetY + y) * state.grid + targetX + x;
          state.pixels[dst] = clip.pixels[src];
          nextMask[dst] = 1;
        }
      }
      clip.x = targetX;
      clip.y = targetY;
      state.selection = nextMask;
      draw();
      renderSelectionUi();
      return true;
    };

    const beginLasso = event => {
      state.lassoDrawing = true;
      state.selectionPath = [customEditorPointerGridPoint(canvas, event, state.grid)];
      renderSelectionOverlay();
    };
    const continueLasso = event => {
      if (!state.lassoDrawing) return;
      const point = customEditorPointerGridPoint(canvas, event, state.grid);
      const prev = state.selectionPath.at(-1);
      if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) >= .18) state.selectionPath.push(point);
      renderSelectionOverlay();
    };
    const finishLasso = () => {
      if (!state.lassoDrawing) return;
      state.lassoDrawing = false;
      state.selection = customEditorSelectionFromPolygon(state.grid, state.selectionPath);
      state.selectionPath = [];
      renderSelectionOverlay();
      renderSelectionUi();
    };
    const cancelLasso = () => {
      state.lassoDrawing = false;
      state.selectionPath = [];
      renderSelectionOverlay();
    };

    // ── 도트 캔버스 입력 / 이동
    // PC는 기존 좌클릭 그리기 / 우클릭 팬을 유지한다.
    // 모바일 direct: 탭/드래그 그리기 + 길게 팬.
    // 모바일 cursor: 한 손가락은 셀 커서만 이동, PUSH로 실제 픽셀을 찍는다.
    // 올가미 툴은 PC/모바일 모두 직접 둘러 선택하고, 선택 바의 이동/복사/붙여넣기로 정밀 조작한다.
    // 두 손가락 팬과 ✋ 이동 툴은 두 모바일 모드에서 공통으로 동작한다.
    let mousePan = null;
    let touchGesture = null;
    let touchHoldTimer = null;
    const TOUCH_PAN_HOLD_MS = 360;
    const TOUCH_DRAW_MOVE_PX = 7;
    const activeTouches = new Map();
    let twoFingerPan = null;

    const stopTouchHoldTimer = () => {
      if (touchHoldTimer) clearTimeout(touchHoldTimer);
      touchHoldTimer = null;
    };

    const cursorCellPx = () => Math.max(1, customEditorCellPx(state));
    const clampCursor = () => {
      state.cursorX = clamp(Math.round(Number(state.cursorX) || 0), 0, state.grid - 1);
      state.cursorY = clamp(Math.round(Number(state.cursorY) || 0), 0, state.grid - 1);
    };
    const placeGridCursor = () => {
      if (!cellCursor) return;
      if (!isCursorMode() || state.tool === 'lasso') { cellCursor.hidden = true; return; }
      clampCursor();
      const c = cursorCellPx();
      cellCursor.hidden = false;
      cellCursor.style.left = `${state.cursorX * c}px`;
      cellCursor.style.top = `${state.cursorY * c}px`;
      cellCursor.style.width = `${c}px`;
      cellCursor.style.height = `${c}px`;
    };
    const ensureCursorVisible = () => {
      if (!canvasViewport || !canvasStage || !isCursorMode()) return;
      const c = cursorCellPx();
      const margin = c * 1.5;
      const left = canvasStage.offsetLeft + state.cursorX * c;
      const top = canvasStage.offsetTop + state.cursorY * c;
      let nextLeft = canvasViewport.scrollLeft;
      let nextTop = canvasViewport.scrollTop;
      if (left - margin < nextLeft) nextLeft = left - margin;
      else if (left + c + margin > nextLeft + canvasViewport.clientWidth) nextLeft = left + c + margin - canvasViewport.clientWidth;
      if (top - margin < nextTop) nextTop = top - margin;
      else if (top + c + margin > nextTop + canvasViewport.clientHeight) nextTop = top + c + margin - canvasViewport.clientHeight;
      canvasViewport.scrollLeft = Math.max(0, nextLeft);
      canvasViewport.scrollTop = Math.max(0, nextTop);
    };
    const paintCursorTravel = (from, to) => {
      if (!state.pushHolding || !state.drawing) return;
      const idx = state.tool === 'eraser' ? 0 : customEditorColorIndex(state, state.color);
      customEditorPaintLine(state, from.x, from.y, to.x, to.y, idx);
      state.lastCell = to;
      draw();
    };
    const moveCursorBy = (dxCells, dyCells) => {
      clampCursor();
      const before = { x: state.cursorX, y: state.cursorY };
      state.cursorX = clamp(state.cursorX + Math.trunc(dxCells || 0), 0, state.grid - 1);
      state.cursorY = clamp(state.cursorY + Math.trunc(dyCells || 0), 0, state.grid - 1);
      const after = { x: state.cursorX, y: state.cursorY };
      placeGridCursor();
      ensureCursorVisible();
      if (before.x !== after.x || before.y !== after.y) paintCursorTravel(before, after);
    };

    const setInputMode = mode => {
      state.inputMode = mode === 'cursor' ? 'cursor' : 'direct';
      try { localStorage.setItem('cigh_clean_px_inputmode_v1', state.inputMode); } catch {}
      modal.querySelectorAll('[data-custom-inputmode]').forEach(btn => btn.classList.toggle('on', btn.dataset.customInputmode === state.inputMode));
      const bar = modal.querySelector('[data-custom-cursorbar]');
      if (bar) bar.hidden = !isCursorMode() || state.tool === 'lasso';
      const note = modal.querySelector('[data-custom-pan-note]');
      if (note) note.textContent = state.tool === 'lasso'
        ? '올가미로 둘러 선택 · 선택 바에서 이동/복사/붙여넣기/삭제'
        : isCursorMode()
          ? '한 손가락으로 커서 이동 · PUSH로 찍기 · 두 손가락 또는 ✋로 화면 이동'
          : 'PC 우클릭 드래그 · 모바일 두 손가락 드래그 또는 ✋ 이동';
      stopTouchHoldTimer();
      activeTouches.clear();
      touchGesture = null;
      twoFingerPan = null;
      state.pushHolding = false;
      endStroke();
      canvasViewport?.classList.remove('is-panning');
      clampCursor();
      if (isCursorMode()) {
        placeGridCursor();
        ensureCursorVisible();
      } else if (cellCursor) {
        cellCursor.hidden = true;
      }
    };

    const setCanvasPanningUi = on => {
      canvasViewport?.classList.toggle('is-panning', !!on);
      if (!cellCursor) return;
      if (on) cellCursor.hidden = true;
      else if (isCursorMode()) placeGridCursor();
    };

    const applySinglePaint = cell => {
      if (state.tool === 'pan' || state.tool === 'lasso') return 'done';
      if (state.tool === 'picker') {
        const composite = customEditorCompositePixels(state);
        const idx = composite[cell.y * state.grid + cell.x];
        if (idx > 0 && state.palette[idx]) {
          setColor(state.palette[idx]);
          setTool('pencil');
        }
        return 'done';
      }
      customEditorPushUndo(state);
      if (state.tool === 'fill') {
        const idx = customEditorColorIndex(state, state.color);
        customEditorFloodFill(state, cell.x, cell.y, idx);
        draw();
        return 'done';
      }
      const idx = state.tool === 'eraser' ? 0 : customEditorColorIndex(state, state.color);
      customEditorPaintLine(state, cell.x, cell.y, cell.x, cell.y, idx);
      draw();
      return 'stroke';
    };

    const beginStrokeFrom = (startCell, currentCell = startCell) => {
      if (state.tool === 'pan') return false;
      if (state.tool === 'picker' || state.tool === 'fill') {
        applySinglePaint(startCell);
        return false;
      }
      customEditorPushUndo(state);
      state.drawing = true;
      state.lastCell = startCell;
      const idx = state.tool === 'eraser' ? 0 : customEditorColorIndex(state, state.color);
      customEditorPaintLine(state, startCell.x, startCell.y, currentCell.x, currentCell.y, idx);
      state.lastCell = currentCell;
      draw();
      return true;
    };

    const continueStroke = event => {
      if (!state.drawing) return;
      const cell = customEditorPointerCell(canvas, event, state.grid);
      const last = state.lastCell || cell;
      const idx = state.tool === 'eraser' ? 0 : customEditorColorIndex(state, state.color);
      customEditorPaintLine(state, last.x, last.y, cell.x, cell.y, idx);
      state.lastCell = cell;
      draw();
    };

    const endStroke = () => {
      state.drawing = false;
      state.lastCell = null;
    };

    const startPan = event => {
      mousePan = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: canvasViewport?.scrollLeft || 0,
        scrollTop: canvasViewport?.scrollTop || 0,
      };
      setCanvasPanningUi(true);
      try { canvasViewport?.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    };

    canvasViewport?.addEventListener('contextmenu', event => event.preventDefault());
    canvasViewport?.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse') return;
      if (event.button === 2 || (event.button === 0 && state.tool === 'pan')) startPan(event);
    });
    canvasViewport?.addEventListener('pointermove', event => {
      if (!mousePan || mousePan.pointerId !== event.pointerId) return;
      canvasViewport.scrollLeft = mousePan.scrollLeft - (event.clientX - mousePan.startX);
      canvasViewport.scrollTop = mousePan.scrollTop - (event.clientY - mousePan.startY);
      event.preventDefault();
      event.stopPropagation();
    });
    const endMousePan = event => {
      if (!mousePan || mousePan.pointerId !== event.pointerId) return;
      mousePan = null;
      setCanvasPanningUi(false);
      try { canvasViewport?.releasePointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    };
    canvasViewport?.addEventListener('pointerup', endMousePan);
    canvasViewport?.addEventListener('pointercancel', endMousePan);

    const beginPaint = event => {
      if (event.pointerType === 'mouse' && state.tool === 'pan') return;

      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        try { canvas.setPointerCapture(event.pointerId); } catch {}

        // 두 손가락이 닿는 순간 진행 중인 그리기를 취소하고 화면 팬으로 전환한다.
        if (activeTouches.size === 2) {
          stopTouchHoldTimer();
          touchGesture = null;
          cancelLasso();
          endStroke();
          const pts = [...activeTouches.values()];
          twoFingerPan = {
            midX: (pts[0].x + pts[1].x) / 2,
            midY: (pts[0].y + pts[1].y) / 2,
            scrollLeft: canvasViewport?.scrollLeft || 0,
            scrollTop: canvasViewport?.scrollTop || 0,
          };
          setCanvasPanningUi(true);
          event.preventDefault();
          return;
        }
        if (activeTouches.size > 2) { event.preventDefault(); return; }
        if (touchGesture) { event.preventDefault(); return; }

        const startCell = customEditorPointerCell(canvas, event, state.grid);
        if (state.tool === 'pan') {
          touchGesture = {
            pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            startCell,
            mode: 'pan',
            scrollLeft: canvasViewport?.scrollLeft || 0,
            scrollTop: canvasViewport?.scrollTop || 0,
          };
          setCanvasPanningUi(true);
          event.preventDefault();
          return;
        }

        if (state.tool === 'lasso') {
          beginLasso(event);
          touchGesture = {
            pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            startCell,
            mode: 'lasso',
          };
          event.preventDefault();
          return;
        }

        if (isCursorMode()) {
          touchGesture = {
            pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY,
            startCell,
            mode: 'cursor',
            lastX: event.clientX, lastY: event.clientY,
            accumX: 0, accumY: 0,
          };
          event.preventDefault();
          return;
        }

        // direct 모드는 기존 길게 누르기 팬을 유지한다.
        touchGesture = {
          pointerId: event.pointerId,
          startX: event.clientX, startY: event.clientY,
          startCell,
          mode: 'hold',
          scrollLeft: canvasViewport?.scrollLeft || 0,
          scrollTop: canvasViewport?.scrollTop || 0,
        };
        stopTouchHoldTimer();
        touchHoldTimer = setTimeout(() => {
          if (!touchGesture || touchGesture.pointerId !== event.pointerId || touchGesture.mode !== 'hold') return;
          touchGesture.mode = 'pan';
          touchGesture.scrollLeft = canvasViewport?.scrollLeft || 0;
          touchGesture.scrollTop = canvasViewport?.scrollTop || 0;
          setCanvasPanningUi(true);
        }, TOUCH_PAN_HOLD_MS);
        event.preventDefault();
        return;
      }

      if (event.button !== undefined && event.button !== 0) return;
      const cell = customEditorPointerCell(canvas, event, state.grid);
      if (state.tool === 'lasso') beginLasso(event);
      else if (state.tool === 'picker' || state.tool === 'fill') applySinglePaint(cell);
      else beginStrokeFrom(cell);
      try { canvas.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    };

    const movePaint = event => {
      if (activeTouches.has(event.pointerId)) activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (twoFingerPan && activeTouches.size >= 2) {
        const pts = [...activeTouches.values()].slice(0, 2);
        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        if (canvasViewport) {
          canvasViewport.scrollLeft = twoFingerPan.scrollLeft - (midX - twoFingerPan.midX);
          canvasViewport.scrollTop = twoFingerPan.scrollTop - (midY - twoFingerPan.midY);
        }
        event.preventDefault();
        return;
      }

      if (touchGesture && touchGesture.pointerId === event.pointerId) {
        const dx = event.clientX - touchGesture.startX;
        const dy = event.clientY - touchGesture.startY;

        if (touchGesture.mode === 'lasso') {
          continueLasso(event);
          event.preventDefault();
          return;
        }
        if (touchGesture.mode === 'cursor') {
          const c = cursorCellPx();
          const CURSOR_SENS = 0.82;
          touchGesture.accumX += ((event.clientX - touchGesture.lastX) / c) * CURSOR_SENS;
          touchGesture.accumY += ((event.clientY - touchGesture.lastY) / c) * CURSOR_SENS;
          touchGesture.lastX = event.clientX;
          touchGesture.lastY = event.clientY;
          const stepX = Math.trunc(touchGesture.accumX);
          const stepY = Math.trunc(touchGesture.accumY);
          if (stepX || stepY) {
            touchGesture.accumX -= stepX;
            touchGesture.accumY -= stepY;
            moveCursorBy(stepX, stepY);
          }
          event.preventDefault();
          return;
        }
        if (touchGesture.mode === 'pan') {
          if (canvasViewport) {
            canvasViewport.scrollLeft = touchGesture.scrollLeft - dx;
            canvasViewport.scrollTop = touchGesture.scrollTop - dy;
          }
          event.preventDefault();
          return;
        }
        if (touchGesture.mode === 'hold' && Math.hypot(dx, dy) >= TOUCH_DRAW_MOVE_PX) {
          stopTouchHoldTimer();
          touchGesture.mode = 'draw';
          const current = customEditorPointerCell(canvas, event, state.grid);
          beginStrokeFrom(touchGesture.startCell, current);
          event.preventDefault();
          return;
        }
        if (touchGesture.mode === 'draw') {
          continueStroke(event);
          event.preventDefault();
          return;
        }
        event.preventDefault();
        return;
      }

      if (state.lassoDrawing && event.pointerType === 'mouse') {
        continueLasso(event);
        event.preventDefault();
        return;
      }
      if (!state.drawing) return;
      continueStroke(event);
      event.preventDefault();
    };

    const endPaint = event => {
      activeTouches.delete(event.pointerId);
      if (twoFingerPan && activeTouches.size < 2) {
        twoFingerPan = null;
        setCanvasPanningUi(false);
        try { canvas.releasePointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        return;
      }

      if (touchGesture && touchGesture.pointerId === event.pointerId) {
        stopTouchHoldTimer();
        if (touchGesture.mode === 'hold') {
          const cell = customEditorPointerCell(canvas, event, state.grid);
          applySinglePaint(cell);
        } else if (touchGesture.mode === 'draw') {
          endStroke();
        } else if (touchGesture.mode === 'lasso') {
          finishLasso();
        } else if (touchGesture.mode === 'cursor') {
          clampCursor();
          placeGridCursor();
        }
        touchGesture = null;
        setCanvasPanningUi(false);
        try { canvas.releasePointerCapture(event.pointerId); } catch {}
        event.preventDefault();
        return;
      }

      if (state.lassoDrawing && event.pointerType === 'mouse') finishLasso();
      if (state.drawing) endStroke();
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    };

    const cancelPaint = event => {
      activeTouches.delete(event.pointerId);
      stopTouchHoldTimer();
      touchGesture = null;
      cancelLasso();
      if (activeTouches.size < 2) twoFingerPan = null;
      state.pushHolding = false;
      endStroke();
      setCanvasPanningUi(false);
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
      event.preventDefault();
    };

    canvas.addEventListener('pointerdown', beginPaint);
    canvas.addEventListener('pointermove', movePaint);
    canvas.addEventListener('pointerup', endPaint);
    canvas.addEventListener('pointercancel', cancelPaint);
    canvas.addEventListener('pointerenter', event => {
      if (isCursorMode()) return;
      if (event.pointerType === 'mouse' && state.tool !== 'pan' && state.tool !== 'lasso') updateCustomEditorCellCursor(canvas, cellCursor, state, event);
    });
    canvas.addEventListener('pointermove', event => {
      if (isCursorMode()) return;
      if (event.pointerType === 'mouse' && !mousePan && state.tool !== 'pan' && state.tool !== 'lasso') updateCustomEditorCellCursor(canvas, cellCursor, state, event);
    });
    canvas.addEventListener('pointerleave', () => { if (cellCursor && !isCursorMode()) cellCursor.hidden = true; });

    modal.querySelectorAll('[data-custom-inputmode]').forEach(btn => {
      btn.addEventListener('click', () => { setInputMode(btn.dataset.customInputmode); playBeep('tab'); });
    });
    modal.querySelectorAll('[data-custom-nudge]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dx, dy] = String(btn.dataset.customNudge || '0,0').split(',').map(Number);
        moveCursorBy(dx, dy);
      });
    });

    const pushBtn = modal.querySelector('[data-custom-push]');
    if (pushBtn) {
      pushBtn.addEventListener('pointerdown', event => {
        if (!isCursorMode()) return;
        event.preventDefault();
        clampCursor();
        const cell = { x: state.cursorX, y: state.cursorY };
        const result = applySinglePaint(cell);
        if (result === 'stroke') {
          state.pushHolding = true;
          state.drawing = true;
          state.lastCell = cell;
        }
        try { pushBtn.setPointerCapture(event.pointerId); } catch {}
      });
      const releasePush = event => {
        state.pushHolding = false;
        endStroke();
        try { pushBtn.releasePointerCapture(event.pointerId); } catch {}
      };
      pushBtn.addEventListener('pointerup', releasePush);
      pushBtn.addEventListener('pointercancel', releasePush);
      pushBtn.addEventListener('lostpointercapture', () => { state.pushHolding = false; endStroke(); });
    }

    modal.__cighCleanup = () => {
      document.removeEventListener('keydown', customEditorKeydown, true);
      stopTouchHoldTimer();
      activeTouches.clear();
      twoFingerPan = null;
      mousePan = null;
      touchGesture = null;
      state.pushHolding = false;
      state.drawing = false;
      state.lassoDrawing = false;
      state.selectionPath = [];
      customEditorResizeObserver?.disconnect();
      cancelAnimationFrame(customEditorResizeFrame);
      customEditorResizeFrame = 0;
    };

    setInputMode(state.inputMode);
    setTool(state.tool);
  }

  function rbLegacy_openCustomDecoImportModal() {
    closeCustomDecoModal();
    const modal = document.createElement('div');
    modal.id = 'cigh-clean-custom-deco-modal';
    modal.className = 'cigh-clean-custom-modal';
    modal.setAttribute('data-cigh-theme', detectThemeMode());
    modal.innerHTML = `
      <div class="cigh-clean-custom-dialog import compact-import">
        <div class="cigh-clean-custom-head"><b>IMPORT CUSTOM</b><span>가져오기 🎟️1</span><button type="button" data-custom-close>×</button></div>
        <div class="cigh-clean-custom-import-row">
          <input class="cigh-clean-custom-code" data-custom-code type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="CIGH-DECO1:... 공유코드를 붙여넣어줘">
          <button type="button" class="primary" data-custom-import-btn disabled>🎟️ 1장 · IMPORT</button>
        </div>
        <div class="cigh-clean-custom-import-preview compact" data-custom-preview>
          <span class="cigh-clean-custom-import-placeholder">공유코드를 붙여넣으면 자동으로 확인해요.</span>
        </div>
        <div class="cigh-clean-custom-note">복붙 전용 · 그림 데이터만 읽고 실행 코드는 처리하지 않습니다.</div>
      </div>`;
    document.body.appendChild(modal);

    const codeInput = modal.querySelector('[data-custom-code]');
    const importBtn = modal.querySelector('[data-custom-import-btn]');
    const preview = modal.querySelector('[data-custom-preview]');
    let previewItem = null;
    let previewSeq = 0;
    let previewTimer = null;
    let pasteTimer = null;

    const resetPreview = (message = '공유코드를 붙여넣으면 자동으로 확인해요.', invalid = false) => {
      previewItem = null;
      importBtn.disabled = true;
      preview.classList.toggle('invalid', !!invalid);
      preview.innerHTML = `<span class="cigh-clean-custom-import-placeholder">${esc(message)}</span>`;
    };

    const refreshPreview = async () => {
      const seq = ++previewSeq;
      const code = String(codeInput?.value || '').trim();
      if (!code) { resetPreview(); return; }
      if (!code.startsWith(CUSTOM_DECO_SHARE_PREFIX)) {
        resetPreview('CIGH-DECO1: 로 시작하는 공유코드를 붙여넣어줘.', true);
        return;
      }
      preview.classList.remove('invalid');
      preview.innerHTML = '<span class="cigh-clean-custom-import-placeholder">코드 확인 중…</span>';
      try {
        const item = await decodeCustomDecoShareCode(code);
        if (seq !== previewSeq) return;
        previewItem = item;
        const src = customDecoToDataUrl(item);
        const layerCount = Array.isArray(item.layers) && item.layers.length ? item.layers.length : 1;
        preview.innerHTML = `<img src="${esc(src)}" alt=""><div><b>${esc(item.name)}</b><span>${item.grid}×${item.grid} · ${layerCount}L · CUSTOM</span></div><em>READY</em>`;
        importBtn.disabled = false;
      } catch (err) {
        if (seq !== previewSeq) return;
        resetPreview(err?.message || '공유코드를 확인할 수 없어요.', true);
      }
    };

    const queuePreview = () => {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(refreshPreview, 140);
    };

    codeInput?.addEventListener('input', queuePreview);
    codeInput?.addEventListener('paste', () => {
      if (pasteTimer) clearTimeout(pasteTimer);
      pasteTimer = setTimeout(refreshPreview, 0);
    });
    codeInput?.focus();

    modal.__cighCleanup = () => {
      previewSeq += 1;
      if (previewTimer) clearTimeout(previewTimer);
      if (pasteTimer) clearTimeout(pasteTimer);
      previewTimer = null;
      pasteTimer = null;
    };

    modal.addEventListener('click', async event => {
      if (event.target === modal || event.target.closest('[data-custom-close]')) { closeCustomDecoModal(); return; }
      if (event.target.closest('[data-custom-import-btn]')) {
        if (!previewItem) return;
        try {
          const added = commitImportedCustomDeco(previewItem);
          closeCustomDecoModal();
          renderContent();
          setFooter(`CUSTOM IMPORTED · 🎟️ ${getDecoState().tickets}`);
          playBeep('save');
          showPopup([`▶${added.name}`, '▷공유 가구 추가 완료! 🎟️ -1']);
        } catch (err) { alert(err?.message || err); playBeep('error'); }
      }
    });
  }

  function getDecoOwnedMax(itemOrId) {
    const id = typeof itemOrId === 'string' ? itemOrId : String(itemOrId?.id || '').trim();
    return Math.max(1, Math.floor(Number(DECO_MULTI_OWN_MAX[id] || 1)));
  }

  function getDecoOwnedCount(state, itemOrId) {
    const id = typeof itemOrId === 'string' ? itemOrId : String(itemOrId?.id || '').trim();
    const raw = Number(state?.owned?.[id] || 0);
    return raw > 0 ? Math.max(1, Math.floor(raw)) : 0;
  }

  function nextDecoPropUid() {
    const rand = Math.random().toString(36).slice(2, 5) || 'x0x';
    return `dp_${Date.now().toString(36)}_${(decoPropUidSeq++).toString(36)}_${rand}`;
  }

  function defaultDecoState() {
    return {
      tickets: 0,
      logCredit: 0,
      owned: {},
      equipped: { wallpaper: '', floor: '', props: [] },
    };
  }

  function getDecoItem(id) {
    const key = String(id || '').trim();
    return DECO_ITEMS.find(item => item.id === key) || getCustomDecoItem(key) || null;
  }

  function normalizeDecoState(raw) {
    const base = defaultDecoState();
    const source = raw && typeof raw === 'object' ? raw : {};
    const equipped = source.equipped && typeof source.equipped === 'object' ? source.equipped : {};
    const owned = {};
    for (const item of getAllDecoItems()) {
      if (item.custom) {
        owned[item.id] = 1;
        continue;
      }
      const rawCount = Math.floor(Number(source?.owned?.[item.id] || 0));
      if (rawCount > 0) owned[item.id] = clamp(rawCount, 1, getDecoOwnedMax(item));
    }

    const seenUids = new Set();
    const propCounts = Object.create(null);
    const props = Array.isArray(equipped.props)
      ? equipped.props
          .map((p, index) => {
            const id = String(p?.id || '').trim();
            let uid = String(p?.uid || `${id || 'prop'}_${index}` || '').trim();
            if (!uid || seenUids.has(uid)) uid = nextDecoPropUid();
            seenUids.add(uid);
            return {
              uid,
              id,
              x: clamp(Number(p?.x ?? 50), 4, 96),
              y: clamp(Number(p?.y ?? 78), 4, 96),
            };
          })
          .filter(p => getDecoItem(p.id)?.type === 'prop')
          .filter(p => {
            const item = getDecoItem(p.id);
            const max = getDecoOwnedMax(item);
            const count = Number(propCounts[p.id] || 0);
            if (count >= max) return false;
            propCounts[p.id] = count + 1;
            return true;
          })
      : [];

    return {
      tickets: Math.max(0, Math.floor(Number(source.tickets || 0))),
      logCredit: Math.max(0, Math.floor(Number(source.logCredit || 0))),
      owned,
      equipped: {
        wallpaper: getDecoItem(equipped.wallpaper)?.type === 'wallpaper' ? String(equipped.wallpaper) : '',
        floor: getDecoItem(equipped.floor)?.type === 'floor' ? String(equipped.floor) : '',
        props,
      },
    };
  }

  function getDecoState() {
    try {
      return normalizeDecoState(JSON.parse(localStorage.getItem(DECO_STORE) || '{}'));
    } catch {
      return defaultDecoState();
    }
  }

  function setDecoState(state) {
    localStorage.setItem(DECO_STORE, JSON.stringify(normalizeDecoState(state)));
  }

  function cloneDecoState(state = getDecoState()) {
    return normalizeDecoState(JSON.parse(JSON.stringify(state || defaultDecoState())));
  }

  function getDecoDraft() {
    if (!decoDraft) decoDraft = cloneDecoState();
    return decoDraft;
  }

  function awardDecoLogCredit(logCount = DECO_LOGS_PER_TICKET) {
    const state = getDecoState();
    state.logCredit += Math.max(0, Math.floor(Number(logCount || 0)));
    const gain = Math.floor(state.logCredit / DECO_LOGS_PER_TICKET);
    if (gain > 0) {
      state.tickets += gain;
      state.logCredit = state.logCredit % DECO_LOGS_PER_TICKET;
      setDecoState(state);
      return gain;
    }
    setDecoState(state);
    return 0;
  }

  function rollDecoGacha() {
    const state = getDecoState();
    if (state.tickets <= 0) return { ok: false, reason: 'ticket' };

    const pool = DECO_ITEMS.filter(item => getDecoOwnedCount(state, item) < getDecoOwnedMax(item));
    if (!pool.length) return { ok: false, reason: 'complete' };

    const item = pool[Math.floor(Math.random() * pool.length)];
    state.tickets -= 1;
    state.owned[item.id] = getDecoOwnedCount(state, item) + 1;
    setDecoState(state);

    if (decoEditMode) decoDraft = cloneDecoState(state);
    return { ok: true, item, count: state.owned[item.id] };
  }

  function playDecoGachaAnimation(item, count) {
    document.getElementById('cigh-clean-gacha-modal')?.remove();
    const meta = DECO_RANK_META[item.rank] || DECO_RANK_META.N;
    const isNew = Number(count || 0) <= 1;
    const fancy = item.rank === 'SR' || item.rank === 'SSR';

    const modal = document.createElement('div');
    modal.id = 'cigh-clean-gacha-modal';
    modal.className = 'cigh-clean-gacha-backdrop';
    modal.setAttribute('data-cigh-theme', detectThemeMode());
    modal.innerHTML = `
      <div class="cigh-clean-gacha-stage rank-${esc(item.rank)}" style="--gacha-color:${esc(meta.color)};">
        <div class="cigh-clean-gacha-rays" aria-hidden="true"></div>
        <div class="cigh-clean-gacha-capsule" aria-hidden="true">
          <span class="cigh-clean-gacha-cap-top"></span>
          <span class="cigh-clean-gacha-cap-bot"></span>
          <span class="cigh-clean-gacha-cap-dot"></span>
        </div>
        <div class="cigh-clean-gacha-reveal">
          <span class="cigh-clean-gacha-rank">${esc(meta.label)} RANK</span>
          ${renderDecoVisualHtml(item, 'gacha')}
          <span class="cigh-clean-gacha-name">${esc(item.name)}</span>
          <span class="cigh-clean-gacha-tag">${isNew ? 'NEW!' : `보유 x${count}`}</span>
        </div>
        <div class="cigh-clean-gacha-hint">화면을 누르면 닫혀요</div>
      </div>
    `;

    const stage = modal.querySelector('.cigh-clean-gacha-stage');
    const panel = document.getElementById(PANEL_ID);
    const mountInsidePanel = panel instanceof HTMLElement && panel.classList.contains('open');
    const host = mountInsidePanel ? panel : document.body;
    if (mountInsidePanel) modal.classList.add('in-panel');

    let revealed = false;
    let closed = false;

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      stage.classList.add('revealed');
      spawnPetParticles(stage, fancy ? 'evolve' : 'level');
      playBeep(fancy ? 'evolve' : 'levelup');
    };

    const close = () => {
      if (closed) return;
      closed = true;
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
        renderContent();
      }, 190);
    };

    modal.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!revealed) reveal();
      else close();
    });

    host.appendChild(modal);

    requestAnimationFrame(() => stage.classList.add('shake'));
    setTimeout(reveal, 760);
    setTimeout(close, 4600);
  }

  function decoClass(id) {
    return String(id || '').replace(/_/g, '-').replace(/[^a-z0-9-]/gi, '-');
  }

  function renderDecoVisualHtml(item, variant = 'room') {
    const customSrc = item?.custom ? customDecoToDataUrl(item) : '';
    const image = customSrc || String(item?.image || '').trim();
    const name = esc(String(item?.name || ''));
    if (image) {
      const src = esc(image);
      const pixelClass = item?.custom ? ' cigh-clean-custom-pixel-img' : '';
      if (variant === 'editor') return `<img class="cigh-clean-deco-icon cigh-clean-deco-icon-img${pixelClass}" src="${src}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
      if (variant === 'gacha') return `<img class="cigh-clean-gacha-icon cigh-clean-gacha-icon-img${pixelClass}" src="${src}" alt="${name}" loading="eager" decoding="async" referrerpolicy="no-referrer" />`;
      return `<img class="cigh-clean-room-prop-img${pixelClass}" src="${src}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
    }
    const icon = esc(String(item?.icon || '✦'));
    if (variant === 'editor') return `<span class="cigh-clean-deco-icon">${icon}</span>`;
    if (variant === 'gacha') return `<span class="cigh-clean-gacha-icon">${icon}</span>`;
    return `<span>${icon}</span>`;
  }

  function renderDecoBackdropHtml(state) {
    const safe = normalizeDecoState(state);
    const wall = getDecoItem(safe.equipped.wallpaper);
    const floor = getDecoItem(safe.equipped.floor);
    const wallClass = wall ? ` cigh-clean-deco-${esc(decoClass(wall.id))}` : '';
    const floorClass = floor ? ` cigh-clean-deco-${esc(decoClass(floor.id))}` : '';
    return `
      <div class="cigh-clean-room-wall${wallClass}"></div>
      <div class="cigh-clean-room-floor${floorClass}"></div>
      <div class="cigh-clean-room-props">${renderDecoPropsHtml(safe, decoEditMode)}</div>`;
  }

  function renderDecoPropsHtml(state, edit = false) {
    const props = normalizeDecoState(state).equipped.props || [];
    return props.map((prop, index) => {
      const item = getDecoItem(prop.id);
      if (!item) return '';
      const uid = String(prop.uid || `${item.id}_${index}`);
      const hasImage = !!String(item.image || '').trim() || !!item.custom;
      const sizePx = clamp(Number(item.size || 40), 24, 160);
      return `
        <button type="button" class="cigh-clean-room-prop cigh-clean-deco-${esc(decoClass(item.id))}${hasImage ? ' has-image' : ''}${edit ? ' editable' : ''}"
          data-deco-prop-id="${esc(item.id)}"
          data-deco-prop-uid="${esc(uid)}"
          title="${esc(item.name)}${edit ? ' · 드래그로 이동' : ''}"
          style="left:${clamp(prop.x, 4, 96)}%;top:${clamp(prop.y, 4, 96)}%;z-index:${2 + index};${hasImage ? `--room-prop-size:${sizePx}px;` : ''}">
          ${renderDecoVisualHtml(item, 'room')}
        </button>`;
    }).join('');
  }

  function renderDecoEditorHtml() {
    const state = getDecoDraft();
    const uiTabs = ['prop', 'wallpaper', 'floor', 'custom'];
    const tab = uiTabs.includes(decoEditTab) ? decoEditTab : 'prop';
    const tabLabel = { prop: '소품', wallpaper: '벽지', floor: '바닥', custom: 'CUSTOM' };
    const tabTitle = { prop: '소품 인벤토리', wallpaper: '벽지 인벤토리', floor: '바닥 인벤토리', custom: '커스텀 가구' };

    const officialForTab = tab === 'custom' ? [] : DECO_ITEMS.filter(item => item.type === tab);
    const customForTab = tab === 'custom' ? getCustomDecoItems() : [];
    const sourceItems = tab === 'custom' ? customForTab : officialForTab;
    const owned = sourceItems.filter(item => getDecoOwnedCount(state, item) > 0);
    const totalInTab = tab === 'custom' ? CUSTOM_DECO_MAX_ITEMS : sourceItems.length;
    const ticketLow = state.tickets <= 0;

    const tabs = uiTabs.map(type => `
      <button type="button" class="cigh-clean-deco-tab${tab === type ? ' on' : ''}" data-deco-tab="${esc(type)}">
        ${esc(tabLabel[type])}
      </button>`).join('');

    const itemButtons = owned.length
      ? owned.map(item => {
        const ownedCount = getDecoOwnedCount(state, item);
        const placedCount = item.type === 'prop' ? state.equipped.props.filter(p => p.id === item.id).length : 0;
        const selected = item.type === 'wallpaper'
          ? state.equipped.wallpaper === item.id
          : item.type === 'floor'
            ? state.equipped.floor === item.id
            : placedCount > 0;
        const rankColor = (DECO_RANK_META[item.rank] || DECO_RANK_META.N).color;
        const qtyBadge = ownedCount > 1 ? `<span class="cigh-clean-deco-item-qty">x${ownedCount}</span>` : '';
        return `
          <button type="button" class="cigh-clean-deco-item rank-${esc(item.rank)}${selected ? ' on' : ''} cigh-clean-deco-${esc(decoClass(item.id))}"
            data-deco-item="${esc(item.id)}"
            style="--deco-rank-color:${esc(rankColor)};"
            title="${esc(item.name)} · ${esc(item.rank)}${item.type === 'prop' ? ` · 배치 ${placedCount}/${ownedCount}` : ''}">
            <span class="cigh-clean-deco-rank-dot" aria-hidden="true"></span>
            ${selected ? '<span class="cigh-clean-deco-equipped-dot" aria-label="장착 중" title="장착 중"></span>' : ''}
            ${item.custom ? '<span class="cigh-clean-deco-custom-badge">CUSTOM</span><span class="cigh-clean-deco-custom-edit" data-custom-deco-edit="' + esc(item.id) + '">✎</span>' : ''}
            ${qtyBadge}
            ${renderDecoVisualHtml(item, 'editor')}
            <span class="cigh-clean-deco-name">${esc(item.name)}</span>
          </button>`;
      }).join('')
      : `<div class="cigh-clean-deco-empty">${tab === 'custom' ? '저장한 커스텀 가구가 없어요' : `보유한 ${esc(tabLabel[tab])}가 없어요 · 뽑기로 모아보자`}</div>`;

    const creditNow = clamp(Math.floor(Number(state.logCredit || 0)), 0, DECO_LOGS_PER_TICKET - 1);
    const creditRemain = Math.max(0, DECO_LOGS_PER_TICKET - creditNow);
    const ticketProgressTitle = creditNow > 0
      ? `다음 🎟️까지 로그 ${creditRemain}개 남음`
      : `다음 🎟️까지 로그 ${DECO_LOGS_PER_TICKET}개 남음`;
    const clearLabel = tab === 'custom' ? 'CUSTOM 비우기' : tab === 'prop' ? '소품 비우기' : `${tabLabel[tab]} 비우기`;
    const isCustomTab = tab === 'custom';

    return `
      <div class="cigh-clean-deco-editor">
        <div class="cigh-clean-deco-head">
          <strong class="cigh-clean-deco-title">${esc(tabTitle[tab])}</strong>
          <span class="cigh-clean-deco-ticket" title="${esc(ticketProgressTitle)}"><b>🎟️</b>${state.tickets}<i>장</i><em>${creditNow}/${DECO_LOGS_PER_TICKET}</em></span>
          <span class="cigh-clean-deco-count">${owned.length} / ${totalInTab}</span>
        </div>
        <div class="cigh-clean-deco-tabs">${tabs}</div>
        <div class="cigh-clean-deco-shelf">${itemButtons}</div>
        <div class="cigh-clean-deco-actions">
          ${isCustomTab
            ? '<button type="button" class="cigh-clean-deco-action" data-deco-action="custom-new">✎ 도트 가구</button><button type="button" class="cigh-clean-deco-action" data-deco-action="custom-import">↧ 코드</button>'
            : `<button type="button" class="cigh-clean-deco-action gacha${ticketLow ? ' off' : ''}" data-deco-action="gacha">🎲 뽑기</button>`}
          <button type="button" class="cigh-clean-deco-action ghost" data-deco-action="clear-current">${esc(clearLabel)}</button>
        </div>
        <div class="cigh-clean-deco-help">${tab === 'custom' ? 'CUSTOM 제작/가져오기 각 🎟️1 · 공식 가챠/수집 업적과 분리' : '최근 만진 소품이 위로 · 장착 중인 항목은 금색 점으로 표시'}</div>
      </div>`;
  }

  function toggleDecoItem(id) {
    const item = getDecoItem(id);
    if (!item) return false;
    const state = getDecoDraft();
    if (getDecoOwnedCount(state, item) <= 0) return false;

    if (item.type === 'wallpaper') {
      state.equipped.wallpaper = state.equipped.wallpaper === item.id ? '' : item.id;
    } else if (item.type === 'floor') {
      state.equipped.floor = state.equipped.floor === item.id ? '' : item.id;
    } else if (item.type === 'prop') {
      const ownedCount = getDecoOwnedCount(state, item);
      const placedCount = state.equipped.props.filter(p => p.id === item.id).length;
      if (ownedCount <= 1) {
        const index = state.equipped.props.findIndex(p => p.id === item.id);
        if (index >= 0) state.equipped.props.splice(index, 1);
        else {
          const placed = state.equipped.props.length;
          state.equipped.props.push({
            uid: nextDecoPropUid(),
            id: item.id,
            x: clamp(Number(item.x ?? (22 + placed * 14)), 8, 92),
            y: clamp(Number(item.y ?? 78), 8, 92),
          });
        }
      } else {
        if (placedCount < ownedCount) {
          const placed = state.equipped.props.length;
          state.equipped.props.push({
            uid: nextDecoPropUid(),
            id: item.id,
            x: clamp(Number(item.x ?? (22 + placed * 14)), 8, 92),
            y: clamp(Number(item.y ?? 78), 8, 92),
          });
        } else {
          state.equipped.props = state.equipped.props.filter(p => p.id !== item.id);
        }
      }
    }

    decoDraft = normalizeDecoState(state);
    return true;
  }

  function clearCurrentDecoTab() {
    const state = getDecoDraft();
    if (decoEditTab === 'wallpaper') state.equipped.wallpaper = '';
    else if (decoEditTab === 'floor') state.equipped.floor = '';
    else if (decoEditTab === 'custom') {
      state.equipped.props = (state.equipped.props || []).filter(prop => !getDecoItem(prop.id)?.custom);
    } else {
      state.equipped.props = (state.equipped.props || []).filter(prop => !!getDecoItem(prop.id)?.custom);
    }
    decoDraft = normalizeDecoState(state);
  }

  function bringDecoPropToFront(uid, room = null) {
    const draft = getDecoDraft();
    const index = draft.equipped.props.findIndex(p => p.uid === uid);
    if (index < 0) return false;

    const [prop] = draft.equipped.props.splice(index, 1);
    draft.equipped.props.push(prop);
    decoDraft = normalizeDecoState(draft);

    if (room) {
      const ordered = decoDraft.equipped.props || [];
      ordered.forEach((p, orderIndex) => {
        const el = room.querySelector(`[data-deco-prop-uid="${CSS.escape(p.uid)}"]`);
        if (el) el.style.zIndex = String(2 + orderIndex);
      });
    }
    return true;
  }

  function startDecoPropDrag(event, propEl) {
    if (!decoEditMode || !propEl) return false;
    const room = propEl.closest('.cigh-clean-pet-wrap');
    if (!room) return false;

    const uid = propEl.dataset.decoPropUid || '';
    const draft = getDecoDraft();
    if (!draft.equipped.props.find(p => p.uid === uid)) return false;

    bringDecoPropToFront(uid, room);

    decoDragState = { uid, room, pointerId: event.pointerId };
    propEl.classList.add('dragging');
    try { propEl.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function moveDecoPropDrag(event) {
    if (!decoDragState || decoDragState.pointerId !== event.pointerId) return;
    const rect = decoDragState.room.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 4, 96);
    const y = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 4, 96);
    const draft = getDecoDraft();
    const prop = draft.equipped.props.find(p => p.uid === decoDragState.uid);
    if (prop) {
      prop.x = Math.round(x);
      prop.y = Math.round(y);
    }

    const el = decoDragState.room.querySelector(`[data-deco-prop-uid="${CSS.escape(decoDragState.uid)}"]`);
    if (el) {
      el.style.left = `${Math.round(x)}%`;
      el.style.top = `${Math.round(y)}%`;
    }

    event.preventDefault();
  }

  function endDecoPropDrag(event) {
    if (!decoDragState || decoDragState.pointerId !== event.pointerId) return;
    const el = decoDragState.room.querySelector(`[data-deco-prop-uid="${CSS.escape(decoDragState.uid)}"]`);
    if (el) {
      el.classList.remove('dragging');
      try { el.releasePointerCapture(event.pointerId); } catch {}
    }
    decoDragState = null;
    event.preventDefault();
  }



  // ─────────────────────────────────────────────
  // Achievements / Titles (1단계: 데이터 + 추적)
  // ─────────────────────────────────────────────
  // 등급별 경험치 보너스(보유만으로 자동 합산). 곱연산용 비율.
  const ACHV_RANK_EXP_BONUS = { N: 0.002, R: 0.005, SR: 0.01, SSR: 0.015 };

  // counter: 진행도를 추적할 누적 카운터 키. target에 도달하면 달성.
  // hidden: true면 달성 전까지 UI에서 ??? 고정(2단계에서 사용).
  const ACHV_DEFS = [
    { id: 'first_step',   name: '첫 발자국',     icon: '📖', rank: 'N',   counter: 'analyzeTotal',   target: 1,   hidden: true,  desc: '첫 분석' },
    { id: 'story_collect',name: '이야기 수집가', icon: '🔁', rank: 'N',   counter: 'analyzeTotal',   target: 100, hidden: false, desc: '누적 분석 100회' },
    { id: 'story_keeper', name: '이야기 사서',   icon: '📚', rank: 'SR',  counter: 'analyzeTotal',   target: 1000,  hidden: false, desc: '누적 분석 1000회' },
    { id: 'story_chronicler', name: '이야기 사관',icon: '🏛️', rank: 'SSR', counter: 'analyzeTotal',  target: 10000, hidden: false, desc: '누적 분석 10000회' },
    { id: 'night_butler', name: '밤샘 집사',     icon: '🌙', rank: 'R',   counter: 'hourDawn',       target: 100, hidden: false, desc: '새벽(0~5시) 분석 100회' },
    { id: 'morning_butler',name: '아침형 집사',  icon: '🌅', rank: 'N',   counter: 'hourMorning',    target: 100, hidden: false, desc: '아침(6~10시) 분석 100회' },
    { id: 'noon_butler',  name: '한낮 집사',     icon: '☀️', rank: 'N',   counter: 'hourNoon',       target: 100, hidden: false, desc: '한낮(11~14시) 분석 100회' },
    { id: 'dusk_butler',  name: '황혼 집사',     icon: '🌇', rank: 'N',   counter: 'hourDusk',       target: 100, hidden: false, desc: '황혼(17~20시) 분석 100회' },
    { id: 'nocturnal_butler',name: '야행성 집사',icon: '🌃', rank: 'R',   counter: 'hourLateNight',  target: 100, hidden: false, desc: '심야(21~23시) 분석 100회' },
    { id: 'first_love',   name: '첫 고백 목격자',icon: '💞', rank: 'R',   counter: 'bigPosDelta',    target: 1,   hidden: true,  desc: 'delta +6 이상 1회' },
    { id: 'conflict',     name: '갈등 수집가',   icon: '💔', rank: 'R',   counter: 'negDelta',       target: 50,  hidden: false, desc: 'delta -5 이하 누적 50회' },
    { id: 'hatched',      name: '부화 완료',     icon: '🐣', rank: 'N',   counter: 'petBaby',        target: 1,   hidden: false, desc: '펫 아기단계 도달' },
    { id: 'best_friend',  name: '단짝',         icon: '⭐', rank: 'SR',  counter: 'petBondMax',     target: 1,   hidden: false, desc: '펫 유대 최고단계' },
    { id: 'evo_witness',  name: '진화의 증인',   icon: '👑', rank: 'SR',  counter: 'petFinal',       target: 1,   hidden: false, desc: '펫 완전체 도달' },
    { id: 'dex_master',   name: '도감 마스터',   icon: '🌈', rank: 'SSR', counter: 'finalFormKinds', target: 8,   hidden: false, desc: '완전체 8종 전부 키워봄' },
    { id: 'destined',     name: '운명의 상대',   icon: '💗', rank: 'SR',  counter: 'meterMax',       target: 1,   hidden: true,  desc: '한 인물 미터 100 도달' },
    { id: 'chatterbox',   name: '수다쟁이',     icon: '🗣️', rank: 'N',   counter: 'petTouch',       target: 300, hidden: false, desc: '누적 쓰담+콕콕 300회' },
    { id: 'storm_focus',  name: '폭풍 몰입',     icon: '🔥', rank: 'R',   counter: 'storm10min',     target: 1,   hidden: false, desc: '10분 내 분석 5회' },
    { id: 'mood_heart',  name: '애정 연대기',   icon: '💕', rank: 'R',   counter: 'moodHeart',      target: 100, hidden: false, desc: '애정형 로그 100회' },
    { id: 'mood_bloom',  name: '명랑 연대기',   icon: '🌼', rank: 'R',   counter: 'moodBloom',      target: 100, hidden: false, desc: '명랑형 로그 100회' },
    { id: 'mood_peace',  name: '평온 연대기',   icon: '🍵', rank: 'R',   counter: 'moodPeace',      target: 100, hidden: false, desc: '평온형 로그 100회' },
    { id: 'mood_tear',   name: '애상 연대기',   icon: '🌧️', rank: 'R',   counter: 'moodTear',       target: 100, hidden: false, desc: '애상형 로그 100회' },
    { id: 'mood_blade',  name: '시련 연대기',   icon: '⚔️', rank: 'R',   counter: 'moodBlade',      target: 100, hidden: false, desc: '시련형 로그 100회' },
    { id: 'kaleidoscope',name: '만화경',       icon: '🎭', rank: 'SSR', counter: 'moodAllFull',    target: 1,   hidden: false, desc: '5성향 전부 100회 달성' },
    { id: 'catastrophe', name: '파국',         icon: '❄️', rank: 'SR',  counter: 'meterZero',      target: 1,   hidden: true,  desc: '한 인물 미터 0 도달' },
    { id: 'dawn_to_dusk',name: '하루의 시작과 끝',icon: '🌗', rank: 'R',  counter: 'dawnNightSameDay',target: 1,  hidden: false, desc: '같은 날 새벽+심야 분석' },
    { id: 'bond_collect',name: '인연 수집가',   icon: '🔗', rank: 'R',   counter: 'relations5',     target: 1,   hidden: false, desc: '동시에 관계 5명 이상' },
    { id: 'beloved',     name: '만인의 연인',   icon: '🌟', rank: 'SR',  counter: 'relations10',    target: 1,   hidden: false, desc: '동시에 관계 10명 이상' },
    { id: 'home_cook',   name: '집밥의 힘',     icon: '🍙', rank: 'SR',  counter: 'feedTotal',      target: 500, hidden: false, desc: '누적 분석(먹이기) 500회' },
    // ── 추가분 ──
    { id: 'single_bond', name: '외길 인생',     icon: '💟', rank: 'SR',  counter: 'singleBond',  target: 1,       hidden: false, desc: '한 인물 펫 애정도 60 이상' },
    { id: 'pet_named',   name: '이름을 불러줘', icon: '🏷️', rank: 'N',   counter: 'petNamed',    target: 1,       hidden: false, desc: '펫 이름 지정' },
    { id: 'token_glutton', name: '토큰 대식가', icon: '🪙', rank: 'SR',  counter: 'tokenK',      target: 1000000, hidden: false, desc: '누적 입력 토큰 100만' },
    { id: 'day_streak',  name: '꾸준한 집사',   icon: '📅', rank: 'SR',  counter: 'dayStreak',   target: 7,       hidden: false, desc: '7일 연속 분석' },
    { id: 'binge',       name: '몰아보기 장인', icon: '⚡', rank: 'R',   counter: 'comboStreak', target: 10,      hidden: false, desc: '60초 내 연속 10회 분석' },
    { id: 'packed',      name: '한 짐 챙긴 모험가', icon: '🎒', rank: 'R', counter: 'invRich',  target: 1,       hidden: false, desc: '한 장면 인벤토리 5개 이상' },
    { id: 'my_room',     name: '마이룸 입주',   icon: '🏠', rank: 'N',   counter: 'decoEdit',    target: 1,       hidden: false, desc: '방 꾸미기 EDIT 진입' },
    // ── 히든 ──
    { id: 'farewell',    name: '이별의 순간',   icon: '🥀', rank: 'R',   counter: 'bigNegDelta', target: 1,       hidden: true,  desc: 'delta -8 이하 1회' },
    { id: 'soulmate',    name: '천생연분',      icon: '💍', rank: 'SSR', counter: 'soulmate',    target: 1,       hidden: true,  desc: '유대 최고 + 완전체 + 미터 100' },
    { id: 'fickle',      name: '변심',          icon: '🔀', rank: 'R',   counter: 'favChange',   target: 1,       hidden: true,  desc: '최애가 바뀜' },
    { id: 'midnight',    name: '자정의 방문자', icon: '🕛', rank: 'R',   counter: 'midnight',    target: 1,       hidden: true,  desc: '0시대 분석' },
    { id: 'rename',      name: '개명',          icon: '✏️', rank: 'N',   counter: 'renameCount', target: 2,       hidden: true,  desc: '펫 이름 2번 변경' },
    // ── 추가분 2 ──
    { id: 'rainbow_day',  name: '무지개 하루',   icon: '🎏', rank: 'R',   counter: 'moodRainbowDay', target: 1,    hidden: false, desc: '하루에 5가지 기분 모두 등장' },
    { id: 'touch_master', name: '쓰담 장인',     icon: '🫶', rank: 'SR',  counter: 'petTouch',       target: 1000, hidden: false, desc: '누적 쓰담+콕콕 1000회' },
    { id: 'full_deco',    name: '풀 데코',       icon: '🪴', rank: 'SR',  counter: 'decoPlacedMax',  target: 10,   hidden: false, desc: '소품 10개 동시 배치' },
    { id: 'room_full',    name: '완성된 마이룸', icon: '🛋️', rank: 'R',   counter: 'roomFullSet',    target: 1,    hidden: false, desc: '벽지·바닥·소품 모두 장착' },
    { id: 'regular',      name: '단골',         icon: '🏮', rank: 'SR',  counter: 'roomAnalyze200', target: 1,    hidden: false, desc: '한 방에서 분석 200회' },
    { id: 'weekend',      name: '주말 집사',     icon: '🧺', rank: 'N',   counter: 'weekendAnalyze', target: 50,   hidden: false, desc: '주말 분석 50회' },
    // ── 콘텐츠 확장 ──
    { id: 'still_here',   name: '오늘도 여기서', icon: '📍', rank: 'SR',  counter: 'roomAge30',          target: 1,     hidden: false, desc: '같은 방에서 30일 이상 분석' },
    { id: 'epic_saga',    name: '대서사시',       icon: '📜', rank: 'SSR', counter: 'narrativeLogLines',  target: 10000, hidden: false, desc: 'LOG 누적 10,000줄' },
    { id: 'dont_wake',    name: '깨우지 마세요', icon: '💤', rank: 'N',   counter: 'sleepWake',          target: 10,    hidden: true,  desc: '자는 펫을 10회 건드림' },
    { id: 'five_more',    name: '5분만 더',       icon: '🛏️', rank: 'SR',  counter: 'sleepWake',          target: 50,    hidden: true,  desc: '자는 펫을 50번 깨움' },
    { id: 'fan_success',  name: '성덕',           icon: '💘', rank: 'SR',  counter: 'petFavMeter100',     target: 1,     hidden: false, desc: '펫 최애와 관계도 100 달성' },
    // ── Crack 출석 ──
    { id: 'attendance_first',   name: '출석 완료!',       icon: '✅',   rank: 'N',   counter: 'attendanceTotal',      target: 1,   hidden: true,  desc: '첫 출석 확인' },
    { id: 'attendance_week',    name: '일주일 개근',      icon: '🗓️', rank: 'R',   counter: 'attendanceStreakMax',  target: 7,   hidden: false, desc: '7일 연속 출석 확인' },
    { id: 'attendance_month',   name: '이 정도면 출근',   icon: '🧑‍💼', rank: 'SR', counter: 'attendanceStreakMax',  target: 30,  hidden: false, desc: '30일 연속 출석 확인' },
    { id: 'attendance_open',    name: '문 열자마자',      icon: '🚪',   rank: 'R',   counter: 'attendanceEarly6',     target: 1,   hidden: true,  desc: '06:00~06:59 출석' },
    { id: 'attendance_last',    name: '막차 탑승',        icon: '🚇',   rank: 'R',   counter: 'attendanceLate23',     target: 1,   hidden: true,  desc: '23:00~23:59 출석' },
    { id: 'attendance_close',   name: '아슬아슬했다',     icon: '⏳',   rank: 'SR',  counter: 'attendanceLastMinute', target: 1,   hidden: true,  desc: '23:50 이후 출석' },
    { id: 'attendance_habit',   name: '습관의 힘',        icon: '🔔',   rank: 'SR',  counter: 'attendanceTotal',      target: 100, hidden: false, desc: '누적 출석 100회 확인' },
    { id: 'attendance_year',    name: '올해도 성실하게',  icon: '🏆',   rank: 'SSR', counter: 'attendanceTotal',      target: 365, hidden: false, desc: '누적 출석 365회 확인' },
    // ── MY / Crack Record ──
    { id: 'half_half',     name: '공짜는 못 참지',     icon: '🌓', rank: 'R',  counter: 'crackMixSpend',       target: 1,      hidden: true,  desc: '유료+무료 크래커 혼합 결제 1회' },
    { id: 'one_well',      name: '한 우물만 판다',   icon: '⛏️', rank: 'SR', counter: 'crackStorySpendMax',  target: 100000, hidden: false, desc: '한 작품에서 누적 크래커 10만 사용' },
    { id: 'free_best',     name: '공짜가 제일 좋아', icon: '🎁', rank: 'R',  counter: 'crackFreeSpent',      target: 10000,  hidden: false, desc: '무료 크래커 누적 1만 사용' },
    { id: 'omnivore',      name: '잡식성 소비자',     icon: '🛍️', rank: 'R',  counter: 'crackStoryKinds',     target: 10,     hidden: false, desc: '서로 다른 작품 10개에서 크래커 사용' },
    { id: 'old_bond',      name: '오래된 인연',       icon: '🕰️', rank: 'SR', counter: 'oldBond100d',         target: 1,      hidden: true,  desc: '생성 100일 이상 지난 채팅방에서 대화 재개' },
    { id: 'reroll_10',     name: '이것도 아닌데',     icon: '🎰', rank: 'N',  counter: 'rerollTotal',         target: 10,     hidden: false, desc: '리롤 누적 10회' },
    { id: 'reroll_100',    name: '평행세계 탐색자',   icon: '♻️', rank: 'R',  counter: 'rerollTotal',         target: 100,    hidden: false, desc: '리롤 누적 100회' },
    { id: 'reroll_same10', name: '마음에 드는 답이 없어', icon: '💀', rank: 'SR', counter: 'rerollTurnMax', target: 10, hidden: false, desc: '같은 턴에서 리롤 10회' },
    { id: 'sunk_cost',     name: '매몰비용',           icon: '💸', rank: 'SR', counter: 'rerollSpent',         target: 10000,  hidden: false, desc: '리롤에 크래커 누적 1만 사용' },
    { id: 'the_end',       name: 'THE END',            icon: '🏁', rank: 'SR', counter: 'endingFirst',         target: 1,      hidden: true,  desc: '첫 엔딩 도달' },
    // ── 히든 2 ──
    { id: 'one_sided',    name: '외사랑',       icon: '🍂', rank: 'R',   counter: 'oneSidedLove',   target: 1,    hidden: true,  desc: '펫 애정 60↑인데 그 인물 미터 30↓' },
    { id: 'deco_master',  name: '수집의 끝',     icon: '💎', rank: 'SSR', counter: 'srDecoAll',      target: 1,    hidden: true,  desc: 'SR 소품 전부 보유' },
    // ── v3.2.0 플레이스타일 / 기능 발견 업적 ──
    { id: 'log_director',    name: '연출가',         icon: '🎛️', rank: 'R',   counter: 'customStyleKinds', target: 1,  hidden: false, desc: '커스텀 LOG STYLE 첫 제작' },
    { id: 'all_weather',     name: '전천후 집사',   icon: '⏱️', rank: 'SR',  counter: 'allTimeBuckets',   target: 1,  hidden: true,  desc: '새벽·아침·한낮·황혼·심야 시간대 업적 전부 달성' },
    { id: 'peace_treaty',    name: '평화협정',       icon: '🕊️', rank: 'SR',  counter: 'relations5Over80', target: 1,  hidden: false, desc: '관계 인물 5명의 미터가 동시에 80 이상' },
    { id: 'pixel_artisan',   name: '도트 장인',     icon: '🧱', rank: 'R',   counter: 'customDecoCreated', target: 1, hidden: true,  desc: '커스텀 가구 1개 직접 제작' },
    { id: 'save_point',      name: '세이브 포인트', icon: '☁️', rank: 'N',   counter: 'cloudSaveFirst',    target: 1, hidden: false, desc: '클라우드 인계 저장 첫 성공' },
    { id: 'new_game_plus',   name: '뉴 게임 플러스', icon: '🔄', rank: 'R', counter: 'cloudLoadFirst',    target: 1, hidden: true,  desc: '클라우드 인계 불러오기 첫 성공' },
    { id: 'diary_30',        name: '30일의 기록',   icon: '📔', rank: 'SR',  counter: 'diary30',           target: 1, hidden: true,  desc: '한 채팅방의 펫 다이어리 30일 채우기' },
    { id: 'multi_life',      name: '다중생활자',     icon: '🧳', rank: 'R',   counter: 'analyzedRoomKinds', target: 20, hidden: false, desc: '서로 다른 채팅방 20곳에서 분석' },
    { id: 'taste_fixed',     name: '취향 확고',      icon: '🪄', rank: 'R',   counter: 'customStyleKinds', target: 5,  hidden: true,  desc: '커스텀 LOG STYLE 5개 제작' },
    { id: 'old_diary',       name: '오래된 일기',   icon: '🕯️', rank: 'SSR', counter: 'oldDiary100',       target: 1, hidden: false, desc: '생성 100일 이상 채팅방에서 펫 다이어리 30일 완성' },
    { id: 'worldline_traveler', name: '세계선 여행자', icon: '🌍', rank: 'SR', counter: 'analyzedRoomKinds', target: 50, hidden: false, desc: '서로 다른 채팅방 50곳에서 분석' },
    { id: 'complete_collection', name: '전집 수집가', icon: '🗂️', rank: 'SSR', counter: 'rooms100Kinds',    target: 10, hidden: false, desc: '서로 다른 채팅방 10곳에서 각각 분석 100회 이상' },
    { id: 'interior_addict', name: '인테리어 중독', icon: '🖼️', rank: 'SR', counter: 'roomSaveTotal',      target: 50, hidden: false, desc: '마이룸 배치 누적 50회 저장' },
    { id: 'favoritism',      name: '편애합니다',     icon: '❤️‍🔥', rank: 'R', counter: 'favoriteBias',       target: 1, hidden: true,  desc: '최애 관계도 90 이상·나머지 관계도 50 이하' },
    { id: 'mood_overload',   name: '감정 과부하',   icon: '🎆', rank: 'SR', counter: 'moodOverloadDay',    target: 1, hidden: true,  desc: '하루에 5가지 기분을 모두 보고 분석 20회 이상' },
    { id: 'velcro_pet',      name: '껌딱지',         icon: '🐾', rank: 'R',  counter: 'petTouchDayMax',    target: 100, hidden: true, desc: '하루에 펫 쓰담+콕콕 100회' },
  ];

  function defaultAttendanceState() {
    return {
      lastCheckedAt: 0,
      lastStatus: '',
      lastStatusDate: '',
      pendingNotAttendedAt: 0,
      lastConfirmedDate: '',
      currentStreak: 0,
      maxStreak: 0,
      lastReminderAt: 0,
    };
  }

  function normalizeAttendanceState(raw) {
    const base = defaultAttendanceState();
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      lastCheckedAt: Math.max(0, Number(source.lastCheckedAt || 0)),
      lastStatus: String(source.lastStatus || ''),
      lastStatusDate: String(source.lastStatusDate || ''),
      pendingNotAttendedAt: Math.max(0, Number(source.pendingNotAttendedAt || 0)),
      lastConfirmedDate: String(source.lastConfirmedDate || ''),
      currentStreak: Math.max(0, Number(source.currentStreak || 0)),
      maxStreak: Math.max(0, Number(source.maxStreak || 0)),
      lastReminderAt: Math.max(0, Number(source.lastReminderAt || 0)),
    };
  }

  function defaultAchvState() {
    return {
      counters: {},          // { counterKey: number }
      unlocked: {},          // { achvId: timestamp }
      finalFormsSeen: [],     // 키운 완전체 성향 종류 (도감용)
      stormStamps: [],
      dayPhase: null,
      visitStreak: null,      // { date, streak }
      comboRun: 0,            // 60초 내 연속 분석 진행 수
      rainbowDay: null,       // { date, seen: {love,happy,...}, count }
      dailyTouch: null,       // { date, count } · 하루 펫 쓰담/콕콕
      attendance: defaultAttendanceState(), // Crack 일일 출석 확인 상태
    };
  }

  let __cighAchvBatchDepth = 0;
  let __cighAchvBatchState = null;
  let __cighAchvBatchDirty = false;

  function normalizeAchvState(raw) {
    const base = defaultAchvState();
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
      counters: (source.counters && typeof source.counters === 'object') ? source.counters : base.counters,
      unlocked: (source.unlocked && typeof source.unlocked === 'object') ? source.unlocked : base.unlocked,
      finalFormsSeen: Array.isArray(source?.finalFormsSeen) ? source.finalFormsSeen.slice(0, 8) : base.finalFormsSeen,
      stormStamps: Array.isArray(source?.stormStamps) ? source.stormStamps.slice(-STORM_NEED) : [],
      dayPhase: (source?.dayPhase && typeof source.dayPhase === 'object') ? source.dayPhase : base.dayPhase,
      visitStreak: (source?.visitStreak && typeof source.visitStreak === 'object') ? source.visitStreak : base.visitStreak,
      comboRun: Number(source?.comboRun || 0),
      rainbowDay: (source?.rainbowDay && typeof source.rainbowDay === 'object') ? source.rainbowDay : base.rainbowDay,
      dailyTouch: (source?.dailyTouch && typeof source.dailyTouch === 'object') ? source.dailyTouch : base.dailyTouch,
      attendance: normalizeAttendanceState(source?.attendance),
    };
  }

  function readAchvState() {
    if (__cighAchvBatchDepth > 0 && __cighAchvBatchState) return __cighAchvBatchState;
    try {
      return normalizeAchvState(JSON.parse(localStorage.getItem(ACHV_STORE) || '{}'));
    } catch {
      return defaultAchvState();
    }
  }

  function writeAchvState(state) {
    if (__cighAchvBatchDepth > 0) {
      __cighAchvBatchState = normalizeAchvState(state);
      __cighAchvBatchDirty = true;
      return;
    }
    localStorage.setItem(ACHV_STORE, JSON.stringify(normalizeAchvState(state)));
  }

  function commitAchvState(state) {
    evaluateAchvUnlocks(state);
    writeAchvState(state);
  }

  function withAchvBatch(fn) {
    if (typeof fn !== 'function') return;
    if (__cighAchvBatchDepth > 0) return fn();

    __cighAchvBatchDepth = 1;
    __cighAchvBatchState = readAchvState();
    __cighAchvBatchDirty = false;
    try {
      return fn();
    } finally {
      const state = __cighAchvBatchState;
      const dirty = __cighAchvBatchDirty;
      __cighAchvBatchDepth = 0;
      __cighAchvBatchState = null;
      __cighAchvBatchDirty = false;
      if (dirty && state) localStorage.setItem(ACHV_STORE, JSON.stringify(normalizeAchvState(state)));
    }
  }

  // counterKey를 amount만큼 올리고, 관련 업적 달성 여부를 판정한다.
  // once=true면 누적하지 않고 1로 고정(조건 1회 충족형).
  function bumpAchvCounter(counterKey, amount = 1, once = false) {
    if (!counterKey || !amount) return;
    const state = readAchvState();
    if (once) {
      if (Number(state.counters[counterKey] || 0) >= 1) return;
      state.counters[counterKey] = 1;
    } else {
      state.counters[counterKey] = Math.max(0, Number(state.counters[counterKey] || 0) + Number(amount));
    }
    commitAchvState(state);
  }

  // 최근 분석 시각(타임스탬프) 슬라이딩 윈도우. 10분 내 5회면 storm_focus 달성.
  const STORM_WINDOW_MS = 10 * 60 * 1000;
  const STORM_NEED = 5;
  function registerStormWindow() {
    const state = readAchvState();
    const now = Date.now();
    const list = Array.isArray(state.stormStamps) ? state.stormStamps : [];
    const next = [...list, now].filter(t => now - Number(t) <= STORM_WINDOW_MS).slice(-STORM_NEED);
    state.stormStamps = next;
    if (next.length >= STORM_NEED && !Number(state.counters.storm10min)) {
      state.counters.storm10min = 1;
    }
    commitAchvState(state);
  }

  function achvDateKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // 같은 날(YYYY-MM-DD)에 새벽(0~5)과 심야(21~23)를 둘 다 분석하면 달성.
  function registerDayPhase() {
    const now = new Date();
    const h = now.getHours();
    const isDawn = h >= 0 && h <= 5;
    const isLate = h >= 21 && h <= 23;
    if (!isDawn && !isLate) return;

    const today = achvDateKey(now);
    const state = readAchvState();
    const dp = (state.dayPhase && state.dayPhase.date === today)
      ? state.dayPhase
      : { date: today, dawn: false, late: false };

    if (isDawn) dp.dawn = true;
    if (isLate) dp.late = true;
    state.dayPhase = dp;

    if (dp.dawn && dp.late && !Number(state.counters.dawnNightSameDay)) {
      state.counters.dawnNightSameDay = 1;
    }
    commitAchvState(state);
  }

  // 같은 날은 streak 유지, 어제 방문이면 연속 +1, 끊겼으면 1로 리셋.
  function registerVisitStreak() {
    const now = new Date();
    const today = achvDateKey(now);
    const yd = new Date(now.getTime() - 86400000);
    const yesterday = achvDateKey(yd);

    const state = readAchvState();
    const prev = (state.visitStreak && typeof state.visitStreak === 'object') ? state.visitStreak : null;
    if (prev?.date === today) return;

    const streak = prev?.date === yesterday ? Number(prev.streak || 0) + 1 : 1;
    state.visitStreak = { date: today, streak };
    state.counters.dayStreak = Math.max(Number(state.counters.dayStreak || 0), streak);

    commitAchvState(state);
  }

  function getVisitStreakSummary(state = readAchvState()) {
    const now = new Date();
    const today = achvDateKey(now);
    const yd = new Date(now.getTime() - 86400000);
    const yesterday = achvDateKey(yd);
    const prev = (state?.visitStreak && typeof state.visitStreak === 'object') ? state.visitStreak : null;
    const lastDate = String(prev?.date || '');
    const lastStreak = Math.max(0, Math.floor(Number(prev?.streak || 0)));
    const current = (lastDate === today || lastDate === yesterday) ? lastStreak : 0;
    const best = Math.max(current, Math.max(0, Math.floor(Number(state?.counters?.dayStreak || 0))));
    const status = lastDate === today
      ? '오늘 분석 완료'
      : lastDate === yesterday
        ? '오늘 분석하면 연속 유지'
        : lastDate
          ? '연속 끊김'
          : '아직 기록 없음';
    return { current, best, lastDate, status };
  }

  // 직전 분석과 60초 이내면 연속 누적, 아니면 1로 리셋. 최고 연속을 카운터로.
  function registerComboStreak(prevFedAt) {
    const gap = prevFedAt ? Date.now() - Number(prevFedAt) : Infinity;
    const state = readAchvState();
    const run = gap < 60 * 1000 ? Number(state.comboRun || 0) + 1 : 1;
    state.comboRun = run;
    state.counters.comboStreak = Math.max(Number(state.counters.comboStreak || 0), run);
    commitAchvState(state);
  }

  // 완전체 기본·혼합 진화 종류를 도감에 기록 → finalFormKinds 카운터로 환산.
  function bumpAchvFinalForm(finalType) {
    const key = String(finalType || '').trim();
    if (!key) return;
    const state = readAchvState();
    if (!state.finalFormsSeen.includes(key)) {
      state.finalFormsSeen.push(key);
      state.finalFormsSeen = state.finalFormsSeen.slice(0, 8);
    }
    state.counters.finalFormKinds = state.finalFormsSeen.length;
    commitAchvState(state);
  }

  // 같은 날(YYYY-MM-DD) 5가지 mood가 전부 1번 이상 나오면 무지개 하루 달성.
  // v3.2.0: 그날의 분석 횟수도 함께 세어 5 mood + 20회면 감정 과부하를 달성한다.
  function registerRainbowDay(mood) {
    const key = String(mood || 'normal');
    const moods = ['love', 'happy', 'normal', 'sad', 'scared'];
    if (!moods.includes(key)) return;

    const now = new Date();
    const today = achvDateKey(now);
    const state = readAchvState();
    const rd = (state.rainbowDay && state.rainbowDay.date === today)
      ? { ...state.rainbowDay, seen: { ...(state.rainbowDay.seen || {}) } }
      : { date: today, seen: {}, count: 0 };

    rd.seen[key] = true;
    rd.count = Math.max(0, Number(rd.count || 0)) + 1;
    state.rainbowDay = rd;

    const allMoods = moods.every(m => rd.seen[m]);
    if (allMoods && !Number(state.counters.moodRainbowDay)) state.counters.moodRainbowDay = 1;
    if (allMoods && rd.count >= 20 && !Number(state.counters.moodOverloadDay)) state.counters.moodOverloadDay = 1;
    commitAchvState(state);
  }

  function registerDailyPetTouch(amount = 1) {
    const now = new Date();
    const today = achvDateKey(now);
    const state = readAchvState();
    const daily = (state.dailyTouch && state.dailyTouch.date === today)
      ? { ...state.dailyTouch }
      : { date: today, count: 0 };
    daily.count = Math.max(0, Number(daily.count || 0)) + Math.max(0, Number(amount || 0));
    state.dailyTouch = daily;
    state.counters.petTouchDayMax = Math.max(Number(state.counters.petTouchDayMax || 0), daily.count);
    commitAchvState(state);
  }

  function registerRoomCoverageAchievements() {
    const rooms = Object.values(readStore()).filter(room => room && typeof room === 'object' && Number(room.analyzeCount || 0) > 0);
    const roomKinds = rooms.length;
    const rooms100 = rooms.filter(room => Number(room.analyzeCount || 0) >= 100).length;
    const state = readAchvState();
    state.counters.analyzedRoomKinds = Math.max(Number(state.counters.analyzedRoomKinds || 0), roomKinds);
    state.counters.rooms100Kinds = Math.max(Number(state.counters.rooms100Kinds || 0), rooms100);
    commitAchvState(state);
  }

  function syncCustomStyleAchievements(customs = getCustomStyles()) {
    const count = Object.keys(customs && typeof customs === 'object' ? customs : {}).length;
    const state = readAchvState();
    state.counters.customStyleKinds = Math.max(Number(state.counters.customStyleKinds || 0), count);
    commitAchvState(state);
  }

  function registerRelationshipPatternAchievements(pet = getPet(), meters = []) {
    const normalized = (meters || []).map(raw => normalizeMeter(raw, 50)).filter(m => isValidRelationName(m.name));
    if (!normalized.length) return;
    const state = readAchvState();

    if (normalized.filter(m => clamp(m.value, 0, 100) >= 80).length >= 5) {
      state.counters.relations5Over80 = 1;
    }

    const favorite = relationKey(getFavoriteCharacter(pet));
    if (favorite && normalized.length >= 2) {
      const favoriteMeter = normalized.find(m => relationKey(m.name) === favorite);
      const others = normalized.filter(m => relationKey(m.name) !== favorite);
      if (favoriteMeter && others.length >= 1
          && clamp(favoriteMeter.value, 0, 100) >= 90
          && others.every(m => clamp(m.value, 0, 100) <= 50)) {
        state.counters.favoriteBias = 1;
      }
    }

    commitAchvState(state);
  }

  // 현재 방의 누적 분석 횟수가 200을 넘으면 단골 달성.
  // room.analyzeCount는 방 전환마다 다르므로, 카운터에는 '최대 방 분석 수'를 기록.
  function registerRoomRegular(roomAnalyzeCount) {
    const n = Math.max(0, Math.floor(Number(roomAnalyzeCount || 0)));
    if (n < 200) return;
    const state = readAchvState();
    if (Number(state.counters.roomAnalyze200) >= 1) return;
    state.counters.roomAnalyze200 = 1;
    commitAchvState(state);
  }

  // 같은 방에서 처음 분석한 시점부터 30일 이상 지나 다시 분석하면 달성.
  function registerRoomAgeAchievement(room = getRoom()) {
    const firstAt = getRoomFirstAnalyzedAt(room);
    if (!(firstAt > 0)) return;
    if (Date.now() - firstAt < 30 * 24 * 60 * 60 * 1000) return;
    bumpAchvCounter('roomAge30', 1, true);
  }

  // 펫이 가장 좋아하는 인물이 관계 미터 100에 도달하면 성덕 달성.
  function registerPetFavoriteMeter100(pet = getPet(), meters = []) {
    const fav = relationKey(getFavoriteCharacter(pet));
    if (!fav) return;
    const hit = (meters || []).some(raw => {
      const meter = normalizeMeter(raw, 50);
      return relationKey(meter.name) === fav && clamp(meter.value, 0, 100) >= 100;
    });
    if (hit) bumpAchvCounter('petFavMeter100', 1, true);
  }

  // 펫 애정(charAffinity) 60↑인 인물이, 그 인물 관계 미터는 30↓일 때 외사랑(짝사랑) 달성.
  function registerOneSidedLove(pet, meters) {
    const affinity = pet?.charAffinity || {};
    const meterMap = new Map();
    for (const m of meters || []) {
      const meter = normalizeMeter(m, 50);
      const key = relationKey(meter.name);
      if (isValidRelationName(key)) meterMap.set(key, clamp(meter.value, 0, 100));
    }

    for (const [name, aff] of Object.entries(affinity)) {
      const key = relationKey(name);
      if (!isValidRelationName(key)) continue;
      if (Number(aff) < 60) continue;
      if (!meterMap.has(key)) continue;
      if (meterMap.get(key) <= 30) {
        bumpAchvCounter('oneSidedLove', 1, true);
        return;
      }
    }
  }

  // counter가 target 이상이면 unlocked에 기록. 신규 달성분만 콘솔에 알림.
  function evaluateAchvUnlocks(state) {
    // 파생: 5성향 전부 100↑이면 만화경 카운터를 1로
    if (!Number(state.counters.moodAllFull)
        && ['moodHeart','moodBloom','moodPeace','moodTear','moodBlade'].every(k => Number(state.counters[k] || 0) >= 100)) {
      state.counters.moodAllFull = 1;
    }

    // 파생: 유대최고 + 완전체 + 미터100 전부 달성 시 천생연분
    if (!Number(state.counters.soulmate)
        && ['petBondMax','petFinal','meterMax'].every(k => Number(state.counters[k] || 0) >= 1)) {
      state.counters.soulmate = 1;
    }

    // v3.2.0: 5개 시간대 누적 업적을 전부 끝내면 전천후 집사.
    if (!Number(state.counters.allTimeBuckets)
        && ['hourDawn','hourMorning','hourNoon','hourDusk','hourLateNight'].every(k => Number(state.counters[k] || 0) >= 100)) {
      state.counters.allTimeBuckets = 1;
    }

    for (const def of ACHV_DEFS) {
      if (state.unlocked[def.id]) continue;
      const cur = Number(state.counters[def.counter] || 0);
      if (cur >= def.target) {
        state.unlocked[def.id] = Date.now();
        achvUnlockQueue.push(def);
        console.log(`[Crack INFO Game HUD] 🏆 업적 달성: ${def.icon} ${def.name} (${def.rank}) — ${def.desc}`);
      }
    }
  }

  // 시간대 → 시간 업적 카운터 키. 15~16시는 의도적으로 빈 구간(null).
  function hourBucketCounter(d = new Date()) {
    const h = d.getHours();
    if (h >= 0 && h <= 5) return 'hourDawn';
    if (h >= 6 && h <= 10) return 'hourMorning';
    if (h >= 11 && h <= 14) return 'hourNoon';
    if (h >= 17 && h <= 20) return 'hourDusk';
    if (h >= 21 && h <= 23) return 'hourLateNight';
    return null;
  }

  const ACHV_V320_MIGRATION_STORE = 'cigh_clean_achv_v320_migrated';

  function migrateAchievementExpansionV320() {
    if (localStorage.getItem(ACHV_V320_MIGRATION_STORE) === '1') return;
    try {
      const state = readAchvState();
      const store = readStore();
      const roomEntries = Object.entries(store).filter(([, room]) => room && typeof room === 'object');
      const analyzedRooms = roomEntries.filter(([, room]) => Number(room.analyzeCount || 0) > 0);
      state.counters.analyzedRoomKinds = Math.max(Number(state.counters.analyzedRoomKinds || 0), analyzedRooms.length);
      state.counters.rooms100Kinds = Math.max(Number(state.counters.rooms100Kinds || 0), analyzedRooms.filter(([, room]) => Number(room.analyzeCount || 0) >= 100).length);
      state.counters.customStyleKinds = Math.max(Number(state.counters.customStyleKinds || 0), Object.keys(getCustomStyles()).length);

      const cloudLink = getCloudLink();
      if (Number(cloudLink?.lastSavedAt || 0) > 0) state.counters.cloudSaveFirst = 1;

      const crackRecord = readCrackRecordState();
      let hasDiary30 = false;
      let hasOldDiary100 = false;
      for (const [key, room] of roomEntries) {
        const diaryDays = new Set((Array.isArray(room.diary) ? room.diary : []).map(entry => String(entry?.date || '')).filter(Boolean)).size;
        if (diaryDays < 30) continue;
        hasDiary30 = true;
        const chatId = String(key).split(':').pop() || '';
        const createdAt = Number(crackRecord?.roomCreatedAt?.[chatId] || 0);
        if (createdAt > 0 && Date.now() - createdAt >= 100 * 24 * 60 * 60 * 1000) hasOldDiary100 = true;
      }
      if (hasDiary30) state.counters.diary30 = 1;
      if (hasOldDiary100) state.counters.oldDiary100 = 1;

      // 현재 저장된 관계 상태로 바로 판정 가능한 업적도 백필한다.
      for (const [, room] of roomEntries) {
        const meters = room?.data?.affection || room?.data?.relationshipMeters || [];
        const normalized = (Array.isArray(meters) ? meters : []).map(raw => normalizeMeter(raw, 50)).filter(m => isValidRelationName(m.name));
        if (normalized.filter(m => clamp(m.value, 0, 100) >= 80).length >= 5) state.counters.relations5Over80 = 1;
        const pet = getPet(room);
        const favorite = relationKey(getFavoriteCharacter(pet));
        if (favorite && normalized.length >= 2) {
          const favMeter = normalized.find(m => relationKey(m.name) === favorite);
          const others = normalized.filter(m => relationKey(m.name) !== favorite);
          if (favMeter && others.length >= 1 && clamp(favMeter.value, 0, 100) >= 90 && others.every(m => clamp(m.value, 0, 100) <= 50)) {
            state.counters.favoriteBias = 1;
          }
        }
      }

      const queueBefore = achvUnlockQueue.length;
      commitAchvState(state);
      if (achvUnlockQueue.length > queueBefore) achvUnlockQueue.splice(queueBefore);
      localStorage.setItem(ACHV_V320_MIGRATION_STORE, '1');
    } catch (err) {
      console.warn('[Crack INFO Game HUD] v3.2.0 achievement migration failed:', err);
    }
  }

  // 콘솔 확인용. 브라우저 콘솔에서 __cighAchvDebug() 호출.
  function achvDebugDump() {
    const state = readAchvState();
    const rows = ACHV_DEFS.map(def => ({
      업적: `${def.icon} ${def.name}`,
      등급: def.rank,
      진행도: `${Number(state.counters[def.counter] || 0)}/${def.target}`,
      달성: state.unlocked[def.id] ? 'O' : '-',
      히든: def.hidden ? 'H' : '',
    }));
    console.table(rows);
    console.log('[Crack INFO Game HUD] counters:', state.counters);
    console.log('[Crack INFO Game HUD] finalFormsSeen:', state.finalFormsSeen);
    return state;
  }
  window.__cighAchvDebug = achvDebugDump;

  // ── 2단계: 표시/연출 헬퍼 ──
  let pendingAchvCelebrate = null;
  const achvUnlockQueue = [];

  const ACHV_RANK_META = {
    N:   { label: 'N',   color: '#8a8f98', bonus: ACHV_RANK_EXP_BONUS.N },
    R:   { label: 'R',   color: '#5a9be0', bonus: ACHV_RANK_EXP_BONUS.R },
    SR:  { label: 'SR',  color: '#c08ae0', bonus: ACHV_RANK_EXP_BONUS.SR },
    SSR: { label: 'SSR', color: '#e0b24b', bonus: ACHV_RANK_EXP_BONUS.SSR },
  };
  const ACHV_RANK_ORDER = { N: 0, R: 1, SR: 2, SSR: 3 };

  function getAchvProgress(def, state = readAchvState()) {
    const cur = Math.max(0, Number(state.counters[def.counter] || 0));
    return {
      cur: Math.min(cur, def.target),
      target: def.target,
      unlocked: !!state.unlocked[def.id],
    };
  }


  function buildAchvGaugeBar(cur, target, rank) {
    const total = 10;
    const filled = target > 0 ? Math.round(clamp(cur / target, 0, 1) * total) : 0;
    const rankColor = (ACHV_RANK_META[rank] || ACHV_RANK_META.N).color;
    let cells = '';
    for (let i = 0; i < total; i++) {
      cells += `<span class="${i < filled ? 'on' : ''}"></span>`;
    }
    return `<div class="cigh-clean-achv-gaugebar" style="--achv-gauge-color:${esc(rankColor)};">${cells}</div>`;
  }

  // 3단계에서 petExpGain에 곱연산으로 사용. 2단계는 표시용.
  function getAchvExpBonusMultiplier(state = readAchvState()) {
    let bonus = 0;
    for (const def of ACHV_DEFS) {
      if (state.unlocked[def.id]) bonus += Number(ACHV_RANK_EXP_BONUS[def.rank] || 0);
    }
    return 1 + bonus;
  }

  function readEquippedAchvId() {
    return String(localStorage.getItem(ACHV_EQUIPPED_STORE) || '').trim();
  }

  function getEquippedAchvDef() {
    const id = readEquippedAchvId();
    if (!id) return null;
    const state = readAchvState();
    if (!state.unlocked[id]) return null;
    return ACHV_DEFS.find(def => def.id === id) || null;
  }

  function setEquippedAchv(id) {
    const value = String(id || '').trim();
    if (value) localStorage.setItem(ACHV_EQUIPPED_STORE, value);
    else localStorage.removeItem(ACHV_EQUIPPED_STORE);
  }

  // 달성한 업적만 장착 가능. 같은 걸 다시 누르면 해제(토글).
  function toggleEquippedAchv(id) {
    const target = String(id || '').trim();
    if (!target) return false;

    const state = readAchvState();
    if (!state.unlocked[target]) return false;

    if (readEquippedAchvId() === target) setEquippedAchv('');
    else setEquippedAchv(target);
    return true;
  }

  function announceAchvUnlocks() {
    if (!achvUnlockQueue.length) return;
    const unlocked = achvUnlockQueue.splice(0, achvUnlockQueue.length);

    for (const def of unlocked) {
      const meta = ACHV_RANK_META[def.rank] || ACHV_RANK_META.N;
      pushLog([`▶업적 달성! ${def.icon} ${def.name} (${meta.label})`]);
      showPopup([`▶업적 달성! ${def.icon} ${def.name}`, `▷${def.desc}`]);
    }

    const topRank = unlocked.reduce((best, def) => (ACHV_RANK_ORDER[def.rank] > ACHV_RANK_ORDER[best] ? def.rank : best), 'N');
    playBeep(ACHV_RANK_ORDER[topRank] >= 2 ? 'evolve' : 'levelup');

    pendingAchvCelebrate = unlocked[unlocked.length - 1];

    if (shouldShowMascot()) {
      const first = unlocked[0];
      mascotSay(`${first.icon} ${first.name} 달성!`, 95, { allowEgg: true, allowSleeping: true });
    }

    if (activeTab === 'achv') renderContent();
  }

  // ─────────────────────────────────────────────
  // MY / Crack Record
  // ─────────────────────────────────────────────
  let crackRecordSyncPromise = null;
  let crackRecordSyncing = false;
  let crackRecordViewSyncTimer = null;
  let crackRecordEventSyncTimer = null;
  let crackRecordEventSyncTimer2 = null;

  function defaultCrackRecordState() {
    return {
      schema: 1,
      historyInitialized: false,
      historyPartial: false,
      historyAnchorKey: '',
      totalSpent: 0,
      paidSpent: 0,
      freeSpent: 0,
      mixedSpendCount: 0,
      consumedEvents: 0,
      byStory: {},
      currentBalance: null,
      rerollTotal: 0,
      rerollSpent: 0,
      rerollRun: 0,
      rerollRunMax: 0,
      rerollRunChatId: '',
      pendingActions: [],
      roomCreatedAt: {},
      endingChats: [],
      firstEndingAt: 0,
      oldBondAt: 0,
      lastSyncAt: 0,
      lastSyncError: '',
      historyRecordsSeen: 0,
    };
  }

  function normalizeCrackRecordState(raw) {
    const base = defaultCrackRecordState();
    const src = raw && typeof raw === 'object' ? raw : {};
    const byStory = src.byStory && typeof src.byStory === 'object' ? src.byStory : {};
    const roomCreatedAt = src.roomCreatedAt && typeof src.roomCreatedAt === 'object' ? src.roomCreatedAt : {};
    return {
      schema: 1,
      historyInitialized: !!src.historyInitialized,
      historyPartial: !!src.historyPartial,
      historyAnchorKey: String(src.historyAnchorKey || ''),
      totalSpent: Math.max(0, Number(src.totalSpent || 0)),
      paidSpent: Math.max(0, Number(src.paidSpent || 0)),
      freeSpent: Math.max(0, Number(src.freeSpent || 0)),
      mixedSpendCount: Math.max(0, Math.floor(Number(src.mixedSpendCount || 0))),
      consumedEvents: Math.max(0, Math.floor(Number(src.consumedEvents || 0))),
      byStory,
      currentBalance: (src.currentBalance === null || src.currentBalance === undefined || src.currentBalance === '')
        ? null
        : (Number.isFinite(Number(src.currentBalance)) ? Math.max(0, Number(src.currentBalance)) : null),
      rerollTotal: Math.max(0, Math.floor(Number(src.rerollTotal || 0))),
      rerollSpent: Math.max(0, Number(src.rerollSpent || 0)),
      rerollRun: Math.max(0, Math.floor(Number(src.rerollRun || 0))),
      rerollRunMax: Math.max(0, Math.floor(Number(src.rerollRunMax || 0))),
      rerollRunChatId: String(src.rerollRunChatId || ''),
      pendingActions: Array.isArray(src.pendingActions) ? src.pendingActions.filter(action => action?.type === 'reroll').slice(-20) : [],
      roomCreatedAt,
      endingChats: Array.isArray(src.endingChats) ? Array.from(new Set(src.endingChats.map(String))).slice(-80) : [],
      firstEndingAt: Math.max(0, Number(src.firstEndingAt || 0)),
      oldBondAt: Math.max(0, Number(src.oldBondAt || 0)),
      lastSyncAt: Math.max(0, Number(src.lastSyncAt || 0)),
      lastSyncError: String(src.lastSyncError || ''),
      historyRecordsSeen: Math.max(0, Math.floor(Number(src.historyRecordsSeen || 0))),
    };
  }

  function readCrackRecordState() {
    try {
      return normalizeCrackRecordState(JSON.parse(localStorage.getItem(CRACK_RECORD_STORE) || '{}'));
    } catch {
      return defaultCrackRecordState();
    }
  }

  const REROLL_COST_FIX_V320_STORE = 'cigh_clean_reroll_cost_fix_v320';
  function migrateRerollCostFixV320() {
    if (localStorage.getItem(REROLL_COST_FIX_V320_STORE) === '1') return;
    try {
      const record = readCrackRecordState();
      const definitelyInvalid = Number(record.rerollTotal || 0) <= 0 && Number(record.rerollSpent || 0) > 0;
      record.pendingActions = (record.pendingActions || [])
        .filter(action => action?.type === 'reroll' && Date.now() - Number(action?.at || 0) <= 90 * 1000)
        .slice(-20);
      if (definitelyInvalid) record.rerollSpent = 0;
      writeCrackRecordState(record);

      if (definitelyInvalid) {
        const achv = readAchvState();
        achv.counters.rerollSpent = 0;
        delete achv.unlocked.sunk_cost;
        writeAchvState(achv);
      }
      localStorage.setItem(REROLL_COST_FIX_V320_STORE, '1');
    } catch (err) {
      console.warn('[Crack INFO Game HUD] v3.2.0 reroll cost migration failed:', err);
    }
  }

  function writeCrackRecordState(state) {
    localStorage.setItem(CRACK_RECORD_STORE, JSON.stringify(normalizeCrackRecordState(state)));
  }

  function getCrackAccessToken() {
    try {
      const found = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith('access_token='));
      return found ? decodeURIComponent(found.split('=').slice(1).join('=')) : '';
    } catch {
      return '';
    }
  }

  function getCrackCookie(name) {
    try {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch {
      return '';
    }
  }

  function crackApiHeaders() {
    const headers = {
      accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      platform: 'web',
      'wrtn-locale': 'ko-KR',
    };
    const token = getCrackAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const wrtnId = getCrackCookie('__w_id');
    if (wrtnId) headers['x-wrtn-id'] = wrtnId;
    const mixpanelId = getCrackCookie('Mixpanel-Distinct-Id');
    if (mixpanelId) headers['mixpanel-distinct-id'] = mixpanelId;
    return headers;
  }

  async function crackApiGet(url) {
    if (!getCrackAccessToken()) throw new Error('NO_ACCESS_TOKEN');
    const pageWindow = getGenerateDoneWindow();
    const fetchFn = (pageWindow?.fetch || fetch).bind(pageWindow || window);
    const res = await fetchFn(url, {
      method: 'GET',
      credentials: 'include',
      headers: crackApiHeaders(),
    });
    if (!res.ok) {
      let detail = '';
      try {
        const text = await res.text();
        if (text) detail = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      } catch (_) {}
      throw new Error(`CRACK_HTTP_${res.status}${detail ? ` · ${detail}` : ''}`);
    }
    const payload = await res.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        (typeof payload.result === 'string' && payload.result !== 'SUCCESS')) {
      throw new Error('CRACK_APPLICATION_ERROR: 서버 응답을 확인하지 못했어요.');
    }
    return payload;
  }

  // ─────────────────────────────────────────────
  // Crack Attendance — 상태 확인만 수행. POST/자동 출석 버튼은 만들지 않는다.
  // 제공된 출석 스크립트와 동일하게 GET /crack-cash/attendance 의 attendanceStatus를 사용한다.
  // ─────────────────────────────────────────────
  let crackAttendanceTimer = null;
  let crackAttendanceInFlight = false;

  const PET_ATTENDANCE_LINES = {
    pending: {
      egg: ['<톡…> 오늘 선물이 아직 기다리고 있다.', '<꿈틀…> 알이 선물 쪽으로 살짝 기울었다.'],
      baby: ['오늘 선물 아직 있대.\n같이 챙기자.', '선물 안 받았어?\n<말캉…> 기다리고 있대.'],
      growth: ['오늘 것도 아직 안 챙겼어.\n잊기 전에 다녀와.', '출석 선물이 남아 있어.\n이번 건 챙기고 오자.'],
      heart: ['오늘 출석 아직이야.\n…까먹은 건 아니지?', '선물 남아 있던데.\n같이 챙기고 오자.'],
      bloom: ['출석 열려 있어!\n선물부터 챙기자!', '오늘 출석 아직이네?\n빨리 받고 오자!'],
      peace: ['오늘 몫도 천천히 챙기고 오자.', '출석 선물이 아직 기다리고 있네.'],
      tear: ['오늘 선물… 아직 안 받았어?\n괜히 마음 쓰여…', '출석 아직이래…\n놓치면 아쉬울 것 같아.'],
      blade: ['흥, 출석 같은 걸\n내가 챙겨주는 건 아니거든.', '아직 안 했잖아.\n바, 바보! 놓치지나 마.'],
      lizard: ['출석… 아직이래애~\n선물 준대애~', '오늘 것도 안 받았네에~\n나중에 까먹지 마아~'],
      owl: ['오늘의 출석 보상이 아직 수령되지 않았습니다.', '출석 가능 시간이군요.\n오늘 몫이 아직 남아 있습니다.'],
      rabbit: ['헐~ 오늘 출석 아직이야?♡\n얼른 챙겨♡', '선물 남아 있잖아~♡\n놓치면 아깝다구♡'],
    },
    success: {
      egg: ['<반짝…> 알이 기분 좋게 흔들렸다.', '<톡!> 오늘 몫을 챙긴 듯 알이 반짝였다.'],
      baby: ['받았다!\n<뽀잉>', '오늘 것도 챙겼네!\n몸이 반짝해.'],
      growth: ['오늘 출석 완료!\n나도 괜히 뿌듯해.', '도장 하나 더!\n오늘 것도 잘 챙겼다.'],
      heart: ['잘 챙겼네.\n이제 마음 놓였어.', '오늘 것도 완료.\n역시 안 잊었네.'],
      bloom: ['출석 완료~!\n선물 GET!', '좋아! 오늘 것도\n깔끔하게 챙겼다!'],
      peace: ['오늘 것도 잘 챙겼네.\n이제 천천히 놀자.', '출석 끝.\n마음이 한결 편하네.'],
      tear: ['다행이다…\n오늘 것도 놓치지 않았네.', '잘 받았구나…\n괜히 내가 안심돼.'],
      blade: ['크흠… 잘했네.\n딱히 기다린 건 아니지만.', '흥, 그 정도는\n당연히 챙겨야지.'],
      lizard: ['받았네에~\n그럼 됐어어~', '출석 끝났네에~\n이제 누워도 돼애~'],
      owl: ['오늘의 출석이 정상적으로 확인되었습니다.', '훌륭합니다.\n오늘의 출석 기록이 확인되었군요.'],
      rabbit: ['완료~♡ 잘했어 잘했어♡', '오늘 것도 챙겼다~♡\n역시 빠르잖아♡'],
    },
    confirmed: {
      egg: ['<포근…> 오늘 몫은 이미 챙긴 모양이다.', '<반짝…> 알이 느긋하게 흔들렸다.'],
      baby: ['오늘 건 이미 챙겼네.\n<말캉…>', '출석 끝났구나!\n그럼 같이 놀자.'],
      growth: ['오늘 출석은 이미 끝!\n이제 걱정 없어.', '오늘 몫은 챙겨뒀네.\n좋아.'],
      heart: ['오늘 건 이미 챙겼네.\n역시 기억하고 있었구나.', '출석 완료 상태네.\n그럼 됐어.'],
      bloom: ['이미 했네!\n역시 빠르다니까!', '오늘 것도 완료~\n좋아, 다음 거 하자!'],
      peace: ['오늘 몫은 이미 챙겼네.\n잘했어.', '출석은 끝났구나.\n그럼 느긋하게 있자.'],
      tear: ['이미 챙겼구나…\n다행이야.', '오늘 것도 받았네…\n안심했어.'],
      blade: ['이미 했어?\n크흠, 잘했네.', '흥, 안 잊었네.\n그럼 됐어.'],
      lizard: ['이미 했네에~\n그럼 됐어어~', '오늘 건 받았구나아~\n편하게 있자아~'],
      owl: ['오늘의 출석은 이미 완료되어 있습니다.', '확인했습니다.\n오늘 출석은 정상적으로 완료된 상태입니다.'],
      rabbit: ['이미 했잖아~♡\n역시 야무져♡', '오늘 것도 완료네♡\n완전 굿~♡'],
    },
  };

  function attendanceDateKey(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function attendanceYesterdayKey(d = new Date()) {
    const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12, 0, 0, 0);
    return attendanceDateKey(y);
  }

  function isCrackAttendanceWindow(d = new Date()) {
    return d.getHours() >= 6;
  }

  function msUntilNextAttendanceWindow(d = new Date()) {
    const next = new Date(d);
    if (d.getHours() < 6) {
      next.setHours(6, 0, 5, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(6, 0, 5, 0);
    }
    return Math.max(1000, next.getTime() - d.getTime());
  }

  function attendancePetLine(kind, pet = getPet()) {
    const group = PET_ATTENDANCE_LINES[kind] || PET_ATTENDANCE_LINES.confirmed;
    const stage = petStageFromLevel(Number(pet?.level || 1)).stage;
    let key = stage === 0 ? 'egg' : stage === 1 ? 'baby' : stage === 2 ? 'growth' : getPetDisplayFinalType(pet);
    if (!group[key]) key = 'peace';
    return pickRandom(group[key], '오늘 것도 잘 챙기자.');
  }

  function applyAttendancePetLine(kind) {
    if (!isEpisodePath()) return;
    const now = Date.now();
    let nextPet = null;
    updateRoom(room => {
      const pet = getPet(room);
      const line = attendancePetLine(kind, pet);
      pet.lastLine = line;
      pet.lastLineAt = now;
      room.pet = pet;
      nextPet = pet;
    });
    if (!nextPet) return;
    updatePetPanelSpeech(nextPet);
    const line = nextPet.lastLine;
    const priority = kind === 'success' ? 100 : kind === 'pending' ? 58 : 42;
    mascotSay(line, priority, { allowEgg: true, durationMs: kind === 'success' ? 6500 : MASCOT_SPEECH_MS });
  }

  function parseCrackAttendanceStatus(json) {
    const data = json?.data && typeof json.data === 'object' ? json.data : (json || {});
    const raw = String(data?.attendanceStatus || data?.status || '').trim().toUpperCase();
    if (raw === 'NOT_ATTENDED') return 'NOT_ATTENDED';
    // 제공된 출석 스크립트도 NOT_ATTENDED가 아닌 attendanceStatus는 "이미 출석"으로 취급한다.
    if (raw) return 'ATTENDED';
    return 'UNKNOWN';
  }

  function registerAttendanceStatus(status, checkedAt = Date.now()) {
    const now = new Date(checkedAt);
    const today = attendanceDateKey(now);
    const state = readAchvState();
    const attendance = normalizeAttendanceState(state.attendance);
    const previousStatus = attendance.lastStatusDate === today ? attendance.lastStatus : '';
    const pendingAt = attendance.lastStatusDate === today ? Number(attendance.pendingNotAttendedAt || 0) : 0;
    const alreadyConfirmedToday = attendance.lastConfirmedDate === today;
    let petNotice = '';
    let unlockedMayHaveChanged = false;

    attendance.lastCheckedAt = checkedAt;
    attendance.lastStatus = status;
    attendance.lastStatusDate = today;

    if (status === 'NOT_ATTENDED') {
      attendance.pendingNotAttendedAt = checkedAt;
      if (checkedAt - Number(attendance.lastReminderAt || 0) >= CRACK_ATTENDANCE_REMINDER_COOLDOWN_MS) {
        attendance.lastReminderAt = checkedAt;
        petNotice = 'pending';
      }
      state.attendance = attendance;
      writeAchvState(state);
      if (petNotice) applyAttendancePetLine(petNotice);
      return { confirmed: false, status };
    }

    if (status !== 'ATTENDED') {
      state.attendance = attendance;
      writeAchvState(state);
      return { confirmed: alreadyConfirmedToday, status };
    }

    if (!alreadyConfirmedToday) {
      const previousConfirmed = attendance.lastConfirmedDate;
      const yesterday = attendanceYesterdayKey(now);
      attendance.currentStreak = previousConfirmed === yesterday ? Math.max(1, Number(attendance.currentStreak || 0)) + 1 : 1;
      attendance.maxStreak = Math.max(Number(attendance.maxStreak || 0), attendance.currentStreak);
      attendance.lastConfirmedDate = today;

      state.counters.attendanceTotal = Math.max(0, Number(state.counters.attendanceTotal || 0)) + 1;
      state.counters.attendanceStreakMax = Math.max(Number(state.counters.attendanceStreakMax || 0), attendance.maxStreak);

      // 시간대 업적은 추측하지 않는다. 같은 날 미출석을 확인한 뒤 출석으로 바뀐 경우에만 판정한다.
      const transitionedToday = previousStatus === 'NOT_ATTENDED' && pendingAt > 0 && attendanceDateKey(new Date(pendingAt)) === today;
      if (transitionedToday) {
        const pendingDate = new Date(pendingAt);
        const h = now.getHours();
        const m = now.getMinutes();
        if (h === 6 && pendingDate.getHours() === 6) state.counters.attendanceEarly6 = 1;
        if (h === 23 && pendingDate.getHours() === 23) state.counters.attendanceLate23 = 1;
        if (h === 23 && m >= 50 && pendingDate.getHours() === 23 && pendingDate.getMinutes() >= 50) {
          state.counters.attendanceLastMinute = 1;
        }
        petNotice = 'success';
      } else {
        petNotice = 'confirmed';
      }
      unlockedMayHaveChanged = true;
    }

    attendance.pendingNotAttendedAt = 0;
    state.attendance = attendance;
    if (unlockedMayHaveChanged) commitAchvState(state);
    if (unlockedMayHaveChanged) announceAchvUnlocks();
    if (petNotice) applyAttendancePetLine(petNotice);
    return { confirmed: true, status };
  }

  async function checkCrackAttendance(options = {}) {
    if (crackAttendanceInFlight || document.hidden || !isEpisodePath()) return null;
    const now = new Date();
    if (!isCrackAttendanceWindow(now)) {
      scheduleCrackAttendanceCheck(msUntilNextAttendanceWindow(now));
      return null;
    }
    if (!getCrackAccessToken()) return null;

    const state = readAchvState();
    const attendance = normalizeAttendanceState(state.attendance);
    const today = attendanceDateKey(now);
    if (attendance.lastConfirmedDate === today && !options.force) {
      scheduleCrackAttendanceCheck(msUntilNextAttendanceWindow(now));
      return { confirmed: true, cached: true };
    }
    const age = Date.now() - Number(attendance.lastCheckedAt || 0);
    if (!options.force && attendance.lastCheckedAt && age < CRACK_ATTENDANCE_MIN_RECHECK_MS) {
      scheduleCrackAttendanceCheck(Math.max(1000, CRACK_ATTENDANCE_MIN_RECHECK_MS - age));
      return null;
    }

    crackAttendanceInFlight = true;
    try {
      const json = await crackApiGet(`${CRACK_API_BASE}/crack-cash/attendance`);
      const status = parseCrackAttendanceStatus(json);
      const result = registerAttendanceStatus(status, Date.now());
      const after = normalizeAttendanceState(readAchvState().attendance);
      if (after.lastConfirmedDate === attendanceDateKey()) {
        scheduleCrackAttendanceCheck(msUntilNextAttendanceWindow(new Date()));
      } else {
        scheduleCrackAttendanceCheck(CRACK_ATTENDANCE_POLL_MS);
      }
      return result;
    } catch (err) {
      console.debug('[Crack INFO Game HUD] attendance check skipped:', err);
      scheduleCrackAttendanceCheck(CRACK_ATTENDANCE_POLL_MS);
      return null;
    } finally {
      crackAttendanceInFlight = false;
    }
  }

  function scheduleCrackAttendanceCheck(delay = 0, options = {}) {
    clearTimeout(crackAttendanceTimer);
    crackAttendanceTimer = setTimeout(() => {
      crackAttendanceTimer = null;
      checkCrackAttendance(options);
    }, Math.max(0, Number(delay) || 0));
  }

  function onPossibleNativeAttendanceClick(event) {
    if (!isEpisodePath()) return;
    const target = event.target?.closest?.('button, a, [role="button"]');
    if (!target || target.closest?.(`#${PANEL_ID}`)) return;
    const label = normalize(target.textContent || target.getAttribute?.('aria-label') || '');
    if (!/출석/.test(label)) return;
    // 크랙 본체의 출석 UI를 눌렀을 가능성이 있으면 잠시 뒤 상태만 다시 확인한다.
    scheduleCrackAttendanceCheck(1800, { force: true });
  }

  function currentCrackChatId(pathname = location.pathname) {
    const clean = String(pathname || '').split(/[?#]/)[0];
    const patterns = [
      /\/stories\/[^/?#]+\/episodes\/([^/?#]+)/,
      /\/episodes\/([^/?#]+)/,
      /\/chats?\/([^/?#]+)/,
    ];
    for (const pattern of patterns) {
      const m = clean.match(pattern);
      if (m) return decodeURIComponent(m[1]);
    }
    return '';
  }

  function crackNum(value) {
    if (typeof value === 'string') value = Number(value.replace(/[^0-9.-]/g, ''));
    return (typeof value === 'number' && Number.isFinite(value)) ? Math.abs(value) : 0;
  }

  function getCrackHistorySplit(rec) {
    const paid = crackNum(rec?.balance?.paid ?? rec?.amount?.paid);
    const free = crackNum(rec?.balance?.free ?? rec?.amount?.free);
    let total = crackNum(
      rec?.balance?.total ?? rec?.amount?.total ?? rec?.crackerQuantity ?? rec?.quantity ??
      rec?.amount?.value ?? rec?.amount ?? rec?.value ?? rec?.total ?? rec?.usedQuantity ?? rec?.consumedQuantity
    );
    if (!total) total = paid + free;
    const type = String(rec?.consumedType || '').toLowerCase();
    let paidOut = paid;
    let freeOut = free;
    if (!paidOut && !freeOut && total > 0) {
      if (type === 'free') freeOut = total;
      else if (type === 'paid') paidOut = total;
    }
    if (paidOut + freeOut > total) total = paidOut + freeOut;
    return { total, paid: paidOut, free: freeOut, type };
  }

  function isCrackConsumedRecord(rec) {
    const product = String(rec?.product || '').toLowerCase();
    if (product && !product.includes('cracker') && !product.includes('crack')) return false;
    if (rec?.isConsumed === true || String(rec?.isConsumed).toLowerCase() === 'true') return true;
    const text = [rec?.type, rec?.title, rec?.consumedType, rec?.description].filter(Boolean).join(' ');
    return /consume|used|차감|사용/i.test(text) && getCrackHistorySplit(rec).total > 0;
  }

  function crackHistoryTime(rec) {
    const raw = rec?.date || rec?.createdAt || rec?.created_at || rec?.updatedAt || rec?.timestamp || '';
    const t = new Date(raw).getTime();
    if (Number.isFinite(t) && t > 0) return t;
    const id = String(rec?._id || rec?.id || rec?.historyId || rec?.transactionId || '');
    if (/^[a-f0-9]{24}$/i.test(id)) {
      const sec = parseInt(id.slice(0, 8), 16);
      return Number.isFinite(sec) ? sec * 1000 : 0;
    }
    return 0;
  }

  function crackHistoryKey(rec) {
    const id = rec?._id || rec?.id || rec?.historyId || rec?.transactionId || '';
    if (id) return `id:${id}`;
    const split = getCrackHistorySplit(rec);
    return ['hist', rec?.date || '', rec?.title || '', split.total, rec?.consumedType || '', rec?.product || ''].join('|');
  }

  function extractCrackHistoryItems(json) {
    const data = json?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.histories)) return data.histories;
    if (Array.isArray(data?.list)) return data.list;
    if (Array.isArray(json?.items)) return json.items;
    throw new Error('CRACK_HISTORY_SCHEMA: 기록 목록 형식을 확인하지 못했어요.');
  }

  function crackStoryKey(title) {
    return String(title || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }

  function applyCrackHistoryRecord(state, rec) {
    if (!isCrackConsumedRecord(rec)) return false;
    const split = getCrackHistorySplit(rec);
    if (!(split.total > 0)) return false;

    state.totalSpent += split.total;
    state.paidSpent += split.paid;
    state.freeSpent += split.free;
    state.consumedEvents += 1;
    if (split.type === 'mix' || (split.paid > 0 && split.free > 0)) state.mixedSpendCount += 1;

    const title = String(rec?.title || '').replace(/\s+/g, ' ').trim();
    const key = crackStoryKey(title);
    if (key) {
      const prev = state.byStory[key] && typeof state.byStory[key] === 'object' ? state.byStory[key] : {};
      state.byStory[key] = {
        title,
        spent: Math.max(0, Number(prev.spent || 0)) + split.total,
        paid: Math.max(0, Number(prev.paid || 0)) + split.paid,
        free: Math.max(0, Number(prev.free || 0)) + split.free,
        events: Math.max(0, Math.floor(Number(prev.events || 0))) + 1,
        lastAt: Math.max(Number(prev.lastAt || 0), crackHistoryTime(rec)),
      };
    }
    return true;
  }

  function matchPendingCrackAction(state, rec) {
    if (!isCrackConsumedRecord(rec) || !Array.isArray(state.pendingActions) || !state.pendingActions.length) return;
    const t = crackHistoryTime(rec);
    if (!(t > 0)) return;
    const split = getCrackHistorySplit(rec);
    if (!(split.total > 0)) return;
    const recStoryKey = crackStoryKey(rec?.title || '');

    let bestIndex = -1;
    let bestGap = Infinity;
    for (let i = 0; i < state.pendingActions.length; i++) {
      const action = state.pendingActions[i];
      if (action?.type !== 'reroll') continue;
      const at = Number(action?.at || 0);
      if (!(at > 0)) continue;
      const gap = t - at;
      // 리롤 차감은 리롤 요청보다 먼저 일어난 일반 생성 차감과 절대 매칭하지 않는다.
      // 서버 기록 시계 오차만 1.5초 허용하고, 60초를 넘긴 대기 이벤트는 버린다.
      if (gap < -1500 || gap > 60000) continue;
      const actionStoryKey = String(action?.storyKey || '');
      if (actionStoryKey && recStoryKey && actionStoryKey !== recStoryKey) continue;
      const score = Math.abs(gap);
      if (score < bestGap) {
        bestGap = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) return;
    state.pendingActions.splice(bestIndex, 1);
    state.rerollSpent += split.total;
  }

  function prunePendingCrackActions(state) {
    const cutoff = Date.now() - 90 * 1000;
    state.pendingActions = (state.pendingActions || [])
      .filter(action => action?.type === 'reroll' && Number(action?.at || 0) >= cutoff)
      .slice(-20);
  }

  function resetCrackHistoryAggregates(state) {
    state.totalSpent = 0;
    state.paidSpent = 0;
    state.freeSpent = 0;
    state.mixedSpendCount = 0;
    state.consumedEvents = 0;
    state.byStory = {};
    state.historyRecordsSeen = 0;
  }

  function getCrackRecordTopStories(state = readCrackRecordState()) {
    return Object.values(state.byStory || {})
      .filter(item => item && Number(item.spent || 0) > 0)
      .sort((a, b) => Number(b.spent || 0) - Number(a.spent || 0));
  }

  function syncCrackAchievementsFromRecord(record = readCrackRecordState(), announce = true) {
    const state = readAchvState();
    const topStory = getCrackRecordTopStories(record)[0];
    const values = {
      crackMixSpend: Number(record.mixedSpendCount || 0) > 0 ? 1 : 0,
      crackStorySpendMax: Number(topStory?.spent || 0),
      crackFreeSpent: Number(record.freeSpent || 0),
      crackStoryKinds: Object.keys(record.byStory || {}).length,
      oldBond100d: Number(record.oldBondAt || 0) > 0 ? 1 : 0,
      rerollTotal: Number(record.rerollTotal || 0),
      rerollTurnMax: Number(record.rerollRunMax || 0),
      rerollSpent: Number(record.rerollSpent || 0),
      endingFirst: (record.endingChats || []).length > 0 ? 1 : 0,
    };
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      const next = Math.max(Number(state.counters[key] || 0), Number(value || 0));
      if (next !== Number(state.counters[key] || 0)) {
        state.counters[key] = next;
        changed = true;
      }
    }
    if (changed) {
      commitAchvState(state);
      if (announce) announceAchvUnlocks();
    }
  }

  function formatCracker(value) {
    return Math.max(0, Math.round(Number(value || 0))).toLocaleString('ko-KR');
  }

  function formatCrackSyncTime(ts) {
    if (!(Number(ts) > 0)) return '아직 동기화 안 함';
    try {
      return new Date(Number(ts)).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '동기화됨';
    }
  }

  async function refreshCrackBalance(state) {
    try {
      const json = await crackApiGet(`${CRACK_API_BASE}/crack-cash/cash`);
      const q = Number(json?.data?.quantity);
      if (Number.isFinite(q) && q >= 0) state.currentBalance = q;
    } catch (_) {}
  }

  async function ensureCrackRoomMeta(chatId, options = {}) {
    const id = String(chatId || '').trim();
    if (!id) return null;
    const state = readCrackRecordState();
    let createdAt = Number(state.roomCreatedAt?.[id] || 0);
    let detail = null;

    if (!createdAt || options.force) {
      try {
        const json = await crackApiGet(`${CRACK_API_BASE}/crack-gen/v3/chats/${encodeURIComponent(id)}`);
        detail = json?.data || json || {};
        const t = new Date(detail?.createdAt || detail?.created_at || '').getTime();
        if (Number.isFinite(t) && t > 0) {
          createdAt = t;
          state.roomCreatedAt[id] = t;
          const entries = Object.entries(state.roomCreatedAt || {}).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 120);
          state.roomCreatedAt = Object.fromEntries(entries);
          writeCrackRecordState(state);
        }
      } catch (_) {}
    }
    return { createdAt, detail };
  }

  async function registerOldRelationshipOnSend(chatId) {
    const id = String(chatId || '').trim();
    if (!id) return;
    try {
      const meta = await ensureCrackRoomMeta(id);
      const createdAt = Number(meta?.createdAt || 0);
      if (!(createdAt > 0)) return;
      if (Date.now() - createdAt < 100 * 24 * 60 * 60 * 1000) return;
      const state = readCrackRecordState();
      if (!state.oldBondAt) {
        state.oldBondAt = Date.now();
        writeCrackRecordState(state);
        syncCrackAchievementsFromRecord(state, true);
      }
    } catch (_) {}
  }

  async function checkCurrentCrackEnding(chatId = currentCrackChatId()) {
    const id = String(chatId || '').trim();
    if (!id) return false;
    try {
      const json = await crackApiGet(`${CRACK_CONTENTS_API_BASE}/character-chat/v3/chats/${encodeURIComponent(id)}/messages?limit=20`);
      const rows = Array.isArray(json?.data?.messages) ? json.data.messages
        : Array.isArray(json?.data) ? json.data
          : Array.isArray(json?.messages) ? json.messages : [];
      const reached = rows.some(msg => msg?.endingInfo?.isReached === true || msg?.endingInfo?.reached === true || msg?.isEndingReached === true);
      if (!reached) return false;
      const state = readCrackRecordState();
      if (!state.endingChats.includes(id)) {
        state.endingChats.push(id);
        state.endingChats = Array.from(new Set(state.endingChats)).slice(-80);
        if (!state.firstEndingAt) state.firstEndingAt = Date.now();
        writeCrackRecordState(state);
        syncCrackAchievementsFromRecord(state, true);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function syncCrackRecord(options = {}) {
    if (crackRecordSyncPromise) return crackRecordSyncPromise;
    const forceFull = !!options.forceFull;
    crackRecordSyncing = true;

    crackRecordSyncPromise = (async () => {
      let state = readCrackRecordState();
      const previousState = JSON.parse(JSON.stringify(state));
      const full = forceFull || !state.historyInitialized || !state.historyAnchorKey;
      const oldAnchor = full ? '' : state.historyAnchorKey;
      if (full) resetCrackHistoryAggregates(state);

      let page = 1;
      let foundAnchor = false;
      let reachedEnd = false;
      let firstKey = '';
      let lastPageSignature = '';
      const collected = [];
      const maxPages = full ? CRACK_RECORD_INITIAL_MAX_PAGES : CRACK_RECORD_INCREMENTAL_MAX_PAGES;

      try {
        while (page <= maxPages) {
          const url = `${CRACK_API_BASE}/crack-cash/crackers/history?limit=${CRACK_RECORD_HISTORY_LIMIT}&type=all&page=${page}`;
          const json = await crackApiGet(url);
          const items = extractCrackHistoryItems(json);
          if (!items.length) {
            reachedEnd = true;
            break;
          }
          if (!firstKey && items[0]) firstKey = crackHistoryKey(items[0]);
          const signature = `${items.length}:${crackHistoryKey(items[0])}:${crackHistoryKey(items[items.length - 1])}`;
          if (signature === lastPageSignature) break;
          lastPageSignature = signature;

          for (const rec of items) {
            const key = crackHistoryKey(rec);
            if (oldAnchor && key === oldAnchor) {
              foundAnchor = true;
              break;
            }
            collected.push(rec);
          }
          if (foundAnchor) break;
          page += 1;
          if (page <= maxPages) await new Promise(resolve => setTimeout(resolve, 25));
        }

        // newest → oldest로 받은 레코드를 오래된 순서로 처리하면 pending action 매칭이 안정적이다.
        collected.sort((a, b) => crackHistoryTime(a) - crackHistoryTime(b));
        for (const rec of collected) {
          if (applyCrackHistoryRecord(state, rec)) {
            state.historyRecordsSeen += 1;
            matchPendingCrackAction(state, rec);
          }
        }
        prunePendingCrackActions(state);

        if (firstKey) state.historyAnchorKey = firstKey;
        state.historyInitialized = true;
        // 최초 전체 백필이 끝까지 닿지 못했거나, 증분 동기화에서 이전 기준점을 못 찾으면 일부 집계 상태로 표시한다.
        if (full) state.historyPartial = !reachedEnd;
        else if (oldAnchor && !foundAnchor && !reachedEnd) state.historyPartial = true;
        state.lastSyncAt = Date.now();
        state.lastSyncError = '';

        await refreshCrackBalance(state);
        writeCrackRecordState(state);
        syncCrackAchievementsFromRecord(state, true);

        const chatId = currentCrackChatId();
        if (chatId) {
          await ensureCrackRoomMeta(chatId);
          await checkCurrentCrackEnding(chatId);
        }

        state = readCrackRecordState();
        state.lastSyncAt = Date.now();
        state.lastSyncError = '';
        writeCrackRecordState(state);
        return state;
      } catch (err) {
        state = previousState;
        state.lastSyncError = String(err?.message || err || 'SYNC_ERROR');
        state.lastSyncAt = Date.now();
        writeCrackRecordState(state);
        console.warn('[Crack INFO Game HUD] Crack Record sync failed:', err);
        return state;
      }
    })().finally(() => {
      crackRecordSyncing = false;
      crackRecordSyncPromise = null;
      if (activeTab === 'achv' && recordSubTab === 'record') renderContent();
    });

    return crackRecordSyncPromise;
  }

  function scheduleCrackRecordViewSync(force = false) {
    clearTimeout(crackRecordViewSyncTimer);
    const state = readCrackRecordState();
    const age = Date.now() - Number(state.lastSyncAt || 0);
    const stale = age >= CRACK_RECORD_SYNC_TTL;
    const recentFailure = !!state.lastSyncError && age < CRACK_RECORD_FAILURE_RETRY_COOLDOWN;

    // 자동 동기화가 한 번 실패한 뒤 RECORD 재렌더 → 즉시 재시도 → 실패의 무한 루프에 빠지지 않게 한다.
    // 사용자가 SYNC 버튼으로 force=true를 요청한 경우에만 쿨다운을 무시한다.
    if (!force && recentFailure) return;
    if (!force && state.historyInitialized && !stale) return;

    crackRecordViewSyncTimer = setTimeout(() => syncCrackRecord({ forceFull: !!force }), 0);
  }

  function scheduleCrackRecordEventSync() {
    // 첫 리롤에서도 바로 동기화한다. 기록이 아직 초기화되지 않았으면 syncCrackRecord가 전체 백필 후 현재 차감을 매칭한다.
    clearTimeout(crackRecordEventSyncTimer);
    clearTimeout(crackRecordEventSyncTimer2);
    crackRecordEventSyncTimer = setTimeout(() => syncCrackRecord(), 4500);
    // 생성/차감 기록이 늦게 들어오는 경우 한 번 더 보정. 리롤 때만 작동한다.
    crackRecordEventSyncTimer2 = setTimeout(() => syncCrackRecord(), 14000);
  }

  function resetCrackRerollRun() {
    const state = readCrackRecordState();
    if (!state.rerollRun && !state.rerollRunChatId) return;
    state.rerollRun = 0;
    state.rerollRunChatId = '';
    writeCrackRecordState(state);
  }

  function registerCrackAction(type, chatId) {
    const kind = type === 'reroll' ? 'reroll' : 'send';
    const id = String(chatId || currentCrackChatId() || '').trim();
    if (!id) return;
    const state = readCrackRecordState();
    const now = Date.now();

    // 비용 매칭에는 리롤만 필요하다. 일반 send를 pending에 쌓으면 일반 생성 차감이 리롤 비용으로 오인될 수 있다.
    if (kind === 'reroll') {
      state.pendingActions.push({ type: 'reroll', chatId: id, storyKey: crackStoryKey(getCurrentRoomDisplayName()), at: now });
      state.pendingActions = state.pendingActions.slice(-20);
      if (state.rerollRunChatId !== id) state.rerollRun = 0;
      state.rerollRunChatId = id;
      state.rerollRun += 1;
      state.rerollRunMax = Math.max(state.rerollRunMax, state.rerollRun);
      state.rerollTotal += 1;
    } else {
      state.rerollRun = 0;
      state.rerollRunChatId = id;
    }

    writeCrackRecordState(state);
    syncCrackAchievementsFromRecord(state, true);

    if (kind === 'reroll') scheduleCrackRecordEventSync();
    else registerOldRelationshipOnSend(id);
  }

  function parseCrackSocketEvent(data) {
    if (typeof data !== 'string') return null;
    const idx = data.indexOf('[');
    if (idx < 0) return null;
    try {
      const arr = JSON.parse(data.slice(idx));
      if (!Array.isArray(arr) || typeof arr[0] !== 'string') return null;
      return { name: arr[0], payload: arr[1] || {} };
    } catch {
      return null;
    }
  }

  function installCrackRecordEventWatcher() {
    try {
      const pageWindow = getGenerateDoneWindow();
      const WS = pageWindow?.WebSocket;
      if (!WS?.prototype || WS.prototype.__cighRecordPatchedV270) return;
      const originalSend = WS.prototype.send;
      WS.prototype.send = function (data) {
        try {
          const url = String(this?.url || '');
          if (/crack-api\.wrtn\.ai|character-chat|socket\.io/i.test(url)) {
            observeShopSocket(this);
            const evt = parseCrackSocketEvent(data);
            if (evt?.name === 'reroll') registerCrackAction('reroll', evt.payload?.chatId || evt.payload?.chat_id);
            else if (evt?.name === 'send') registerCrackAction('send', evt.payload?.chatId || evt.payload?.chat_id);
          }
        } catch (_) {}
        return originalSend.apply(this, arguments);
      };
      WS.prototype.__cighRecordPatchedV270 = true;
    } catch (err) {
      console.warn('[Crack INFO Game HUD] Crack Record watcher install failed:', err);
    }
  }

  function getOldestKnownCrackRoomDays(state = readCrackRecordState()) {
    const times = Object.values(state.roomCreatedAt || {}).map(Number).filter(v => Number.isFinite(v) && v > 0);
    if (!times.length) return 0;
    return Math.max(0, Math.floor((Date.now() - Math.min(...times)) / 86400000));
  }

  function getLocalPlayRecordSummary() {
    const achv = readAchvState();
    const store = readStore();
    const rooms = Object.entries(store)
      .filter(([, room]) => room && typeof room === 'object' && (Number(room.analyzeCount || 0) > 0 || Array.isArray(room.history)));

    let mostAnalyzed = null;
    let longest = null;
    for (const [key, room] of rooms) {
      const count = Math.max(0, Number(room.analyzeCount || 0));
      const firstAt = getRoomFirstAnalyzedAt(room);
      const historyTimes = (Array.isArray(room.history) ? room.history : []).map(item => Number(item?.at || 0)).filter(v => Number.isFinite(v) && v > 0);
      const lastAt = Number(room.lastAnalyzedAt || 0) > 0 ? Number(room.lastAnalyzedAt) : (historyTimes.length ? Math.max(...historyTimes) : 0);
      const ageDays = firstAt > 0 && lastAt >= firstAt ? Math.max(0, Math.floor((lastAt - firstAt) / 86400000)) : 0;
      const label = String(room.roomLabel || (key === roomKey() ? getCurrentRoomDisplayName() : '') || '이름 미기록').trim();
      if (!mostAnalyzed || count > mostAnalyzed.count) mostAnalyzed = { key, label, count };
      if (!longest || ageDays > longest.days) longest = { key, label, days: ageDays };
    }

    const moodDefs = [
      ['애정', 'moodHeart'], ['명랑', 'moodBloom'], ['평온', 'moodPeace'], ['애상', 'moodTear'], ['시련', 'moodBlade'],
    ];
    const mainMood = moodDefs
      .map(([label, key]) => ({ label, count: Number(achv.counters[key] || 0) }))
      .sort((a, b) => b.count - a.count)[0] || { label: '—', count: 0 };

    return {
      totalAnalyze: Math.max(0, Number(achv.counters.analyzeTotal || 0)),
      narrativeLogLines: Math.max(0, Number(achv.counters.narrativeLogLines || 0)),
      petTouch: Math.max(0, Number(achv.counters.petTouch || 0)),
      mostAnalyzed,
      longest,
      mainMood,
    };
  }

  function renderLocalPlayRecordHtml() {
    const local = getLocalPlayRecordSummary();
    return section('PLAY RECORD', `
      <div class="cigh-clean-record-hero">
        <div class="cigh-clean-record-card">
          <span>TOTAL ANALYZE</span>
          <b>${formatCracker(local.totalAnalyze)}회</b>
          <i>${local.mostAnalyzed ? esc(local.mostAnalyzed.label) : '—'}</i>
        </div>
        <div class="cigh-clean-record-card">
          <span>LOG LINES</span>
          <b>${formatCracker(local.narrativeLogLines)}줄</b>
          <i>PET TOUCH ${formatCracker(local.petTouch)}</i>
        </div>
      </div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">MOST PLAYED</span><span class="cigh-clean-sval">${local.mostAnalyzed ? `${esc(local.mostAnalyzed.label)} · ${formatCracker(local.mostAnalyzed.count)}회` : '—'}</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">LONGEST ROOM</span><span class="cigh-clean-sval">${local.longest && local.longest.days ? `${esc(local.longest.label)} · ${local.longest.days}일` : '—'}</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">PET TOUCH</span><span class="cigh-clean-sval">${formatCracker(local.petTouch)}회</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">MAIN MOOD</span><span class="cigh-clean-sval">${esc(local.mainMood.label)} · ${formatCracker(local.mainMood.count)}회</span></div>
    `);
  }



  // ─────────────────────────────────────────────
  // Utils
  // ─────────────────────────────────────────────
  function normalize(value) {
    return String(value ?? '')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function shortText(value, max = 60) {
    // 화면 표시용 텍스트는 말줄임표로 자르지 않는다.
    // max 인자는 기존 호출부 호환을 위해 남겨둔다.
    return normalize(value);
  }

  function isBlankLike(value) {
    const t = normalize(value);
    if (!t) return true;
    if (/^[-—–_·ㆍ.]+$/.test(t)) return true;
    if (/^(없음|없다|없어|미상|정보 없음|해당 없음|해당없음|unknown|null|none|n\/a)$/i.test(t)) return true;
    return false;
  }

  function cleanOptionalValue(value) {
    return isBlankLike(value) ? '' : normalize(value);
  }

  function hasSourceText(raw) {
    return !!cleanOptionalValue(raw?.sourceText || raw?.source || raw?.evidence || '');
  }

  function nowTime() {
    return new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  function hasBatchim(word) {
    const ch = String(word || '').trim().slice(-1);
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return ((code - 0xac00) % 28) !== 0;
  }

  function fixParticlePlaceholders(value) {
    return String(value || '').replace(
      /([가-힣a-zA-Z0-9]+)\s*(?:은\(는\)|\(은\)는|이\(가\)|\(이\)가|을\(를\)|\(을\)를|과\(와\)|\(과\)와)/g,
      (match, word) => {
        const b = hasBatchim(word);
        if (match.includes('은') || match.includes('는')) return word + (b ? '은' : '는');
        if (match.includes('이') || match.includes('가')) return word + (b ? '이' : '가');
        if (match.includes('을') || match.includes('를')) return word + (b ? '을' : '를');
        if (match.includes('과') || match.includes('와')) return word + (b ? '과' : '와');
        return word;
      }
    );
  }

  const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]\uFE0F?/gu;
  const BLOCKED_MOOD_EMOJI = new Set([
    '▶', '▶️', '▷', '▷️', '◀', '◀️', '■', '□', '◆', '◇',
    '⌛', '⏳', '☀', '☀️', '🌙', '⭐', '✧', '✦', '✔', '✅',
  ]);

  function cleanMoodEmoji(value) {
    const found = String(value || '').match(EMOJI_RE);
    if (!found) return '';
    for (const emoji of found) {
      if (!BLOCKED_MOOD_EMOJI.has(emoji)) return emoji;
    }
    return '';
  }

  function stripEmojis(value) {
    return String(value || '').replace(EMOJI_RE, '').trim();
  }

  function relationKey(name) {
    const key = stripEmojis(name)
      .replace(/^[#▸>\-•*└]+\s*/g, '')
      .replace(/[｜|:：].*$/g, '')
      .replace(/\b(관계|호감|신뢰|친밀|긴장|경계|유대)\b/g, '')
      .replace(/[()\[\]{}<>《》〔〕]/g, ' ')
      .replace(/[^\w가-힣\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return key || '';
  }

  function isValidRelationName(name) {
    const key = relationKey(name);
    if (!key) return false;
    if (/^\d+$/.test(key)) return false;
    if (/^\d{1,4}\s*(년|월|일|시|분|초)?$/.test(key)) return false;
    if (/^(AM|PM|오전|오후|낮|밤|저녁|아침|봄|여름|가을|겨울|맑음|흐림|비|눈)$/i.test(key)) return false;
    if (/^(Site|SITE|정보|보안부|위치|상황|목표|소속|능력|상태|관계|개체|가방|아이템|퀘스트)$/i.test(key)) return false;
    if (key.length > 30) return false;
    return true;
  }

  function isPossiblePlayerName(name) {
    const key = relationKey(name);

    if (!isValidRelationName(key)) return false;
    if (/^(남성|여성|여자|남자|수컷|암컷|인간|요괴|신부|수녀|요원|직원|팀|관리|소속|보안등급)$/i.test(key)) return false;
    if (/(팀|요원|직원|소속|관리|보안등급|부서|재단|학교|회사|능력|목표|상황)/.test(key)) return false;
    if (/\d/.test(key)) return false;

    return key.length >= 2 && key.length <= 12;
  }

  function extractPossiblePlayerNames(text) {
    const out = [];
    const seen = new Set();
    const src = normalize(text);
    const lines = src.split('\n').slice(0, 24);

    const add = value => {
      const name = relationKey(value);
      if (!isPossiblePlayerName(name)) return;
      if (seen.has(name)) return;
      seen.add(name);
      out.push(name);
    };

    for (const line of lines) {
      for (const m of line.matchAll(/\[([^\]]{1,28})\]/g)) add(m[1]);

      const named = line.match(/^《(.{1,20}?)》\s*[ː:：]?/);
      if (named) add(named[1]);

      const speaker = line.match(/^([^\n｜|:：]{2,12})[｜|:：]\s*["“]/);
      if (speaker) add(speaker[1]);
    }

    return out.slice(0, 8);
  }

  // ─────────────────────────────────────────────
  // Data shape
  // ─────────────────────────────────────────────
  function makeEmptyData() {
    return {
      time: '',
      location: '',
      character: '',
      situation: '',
      goal: '',
      clothing: '',
      relations: [],
      relationshipMeters: [],
      relationshipDeltas: [],
      affection: [],
      inferredPlayerName: '',
      possiblePlayerNames: [],
      inventory: [],
      stats: [],
      quests: [],
      narrativeLogs: [],
      pokemonLogs: [],
      hudComments: [],
      sceneMood: '',
      _inferredStatus: false,
      _infoFound: false,
      _fromGeminiInfo: false,
      _seen: {
        relations: false,
        inventory: false,
        status: false,
      },
    };
  }

  function normalizeRelation(raw) {
    if (!raw || typeof raw !== 'object') {
      const text = normalize(raw);
      const moodEmoji = cleanMoodEmoji(text);
      const name = relationKey(text);
      return { name, moodEmoji, type: '관계', detail: '', value: '' };
    }

    const joined = normalize([raw.name, raw.detail, raw.memo, raw.type].filter(Boolean).join(' '));
    const name = relationKey(raw.name || joined);
    const moodEmoji = cleanMoodEmoji(raw.moodEmoji) || cleanMoodEmoji(joined);

    return {
      name,
      moodEmoji,
      type: cleanOptionalValue(raw.type) || '관계',
      detail: cleanOptionalValue(raw.detail || raw.memo),
      value: cleanOptionalValue(raw.value),
      sourceText: cleanOptionalValue(raw.sourceText || raw.source || raw.evidence),
    };
  }

  function normalizeMeter(raw, fallbackValue = 50) {
    if (!raw || typeof raw !== 'object') {
      const rel = normalizeRelation(raw);
      return {
        name: rel.name,
        moodEmoji: rel.moodEmoji,
        label: '관계',
        value: fallbackValue,
        memo: rel.detail,
      };
    }

    const joined = normalize([raw.name, raw.memo, raw.label].filter(Boolean).join(' '));
    const name = relationKey(raw.name || joined);
    const moodEmoji = cleanMoodEmoji(raw.moodEmoji) || cleanMoodEmoji(joined);
    const rawValue = Number(raw.value);
    const value = Number.isNaN(rawValue) ? fallbackValue : clamp(rawValue, 0, 100);

    return {
      name,
      moodEmoji,
      label: cleanOptionalValue(raw.label) || '관계',
      value,
      memo: cleanOptionalValue(raw.memo),
    };
  }

  function normalizeDelta(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = relationKey(raw.name || '');
    if (!isValidRelationName(name)) return null;

    const rawDelta = Number(raw.delta);
    if (Number.isNaN(rawDelta)) return null;

    return {
      name,
      delta: rawDelta,
      label: cleanOptionalValue(raw.label) || '관계',
      memo: cleanOptionalValue(raw.memo || raw.reason || raw.detail),
    };
  }


  const SCENE_MOOD_KEYS = new Set(['love', 'happy', 'normal', 'sad', 'scared']);

  function normalizeSceneMood(value, fallback = '') {
    const mood = String(value || '').trim().toLowerCase();
    return SCENE_MOOD_KEYS.has(mood) ? mood : fallback;
  }

  function sanitizeData(data) {
    const d = { ...makeEmptyData(), ...(data || {}) };

    for (const key of ['time', 'location', 'character', 'situation', 'goal', 'clothing']) {
      d[key] = cleanOptionalValue(d[key]);
    }

    d.relations = Array.isArray(d.relations)
      ? d.relations.map(normalizeRelation).filter(r => isValidRelationName(r.name))
      : [];

    const meters = Array.isArray(d.affection) && d.affection.length
      ? d.affection
      : (Array.isArray(d.relationshipMeters) ? d.relationshipMeters : []);

    d.affection = meters.map(m => normalizeMeter(m, 50)).filter(m => isValidRelationName(m.name));
    d.relationshipMeters = d.affection;

    d.relationshipDeltas = Array.isArray(d.relationshipDeltas)
      ? d.relationshipDeltas.map(normalizeDelta).filter(Boolean)
      : [];

    d.inferredPlayerName = cleanOptionalValue(d.inferredPlayerName);
    d.possiblePlayerNames = Array.isArray(d.possiblePlayerNames)
      ? d.possiblePlayerNames.map(relationKey).filter(isPossiblePlayerName).slice(0, 8)
      : [];

    d.inventory = Array.isArray(d.inventory)
      ? d.inventory.map(item => normalizeInventoryItem(item)).filter(item => item.name)
      : [];

    d.stats = Array.isArray(d.stats)
      ? d.stats.map(s => ({
          name: cleanOptionalValue(s?.name || s?.label || ''),
          value: cleanOptionalValue(s?.value || ''),
        })).filter(s => s.name || s.value)
      : [];

    d.quests = Array.isArray(d.quests)
      ? d.quests.map(q => shortText(q, 80)).filter(Boolean)
      : [];

    d.narrativeLogs = Array.isArray(d.narrativeLogs)
      ? d.narrativeLogs.map(normalizeGameLine).filter(Boolean).slice(0, 8)
      : [];

    d.pokemonLogs = d.narrativeLogs;

    d.hudComments = Array.isArray(d.hudComments)
      ? d.hudComments.map(x => normalize(x)).filter(Boolean).slice(0, 3)
      : [];

    d.sceneMood = normalizeSceneMood(d.sceneMood, '');

    d._inferredStatus = !!d._inferredStatus;
    d._infoFound = !!d._infoFound;
    d._fromGeminiInfo = !!d._fromGeminiInfo;

    d._seen = {
      relations: !!d._seen?.relations,
      inventory: !!d._seen?.inventory,
      status: !!d._seen?.status,
    };

    return d;
  }

  function isRoomUserRelationName(name, userName = getRoomUserName()) {
    const userKey = relationKey(userName);
    const key = relationKey(name);
    if (!userKey || !key) return false;
    return key === userKey
      || key.startsWith(`${userKey} `)
      || key.endsWith(` ${userKey}`)
      || key.includes(` ${userKey} `);
  }

  function stripRoomUserFromData(data, userName = getRoomUserName()) {
    const d = sanitizeData(data || makeEmptyData());
    const user = String(userName || '').trim().slice(0, 20);
    if (!user) return d;

    const keepRelation = rel => !isRoomUserRelationName(normalizeRelation(rel).name, user);
    const keepMeter = meter => !isRoomUserRelationName(normalizeMeter(meter, 50).name, user);
    const keepDelta = delta => !isRoomUserRelationName(delta?.name || '', user);

    d.character = user;
    d.inferredPlayerName = user;
    d.possiblePlayerNames = [];
    d.relations = (d.relations || []).filter(keepRelation);
    d.affection = (d.affection || []).filter(keepMeter);
    d.relationshipMeters = d.affection;
    d.relationshipDeltas = (d.relationshipDeltas || []).filter(keepDelta);

    return d;
  }

  function explicitRemovalText(value) {
    return normalize(value);
  }

  function isExplicitRemovalText(value) {
    const t = explicitRemovalText(value);
    if (!t) return false;
    return /(삭제|제거|상실|분실|소모|소진|잃었|잃음|잃어버|없어졌|사라졌|해제|벗음|종료|끝남|떠남|이탈|사망|죽었|파기|버림|버렸|반납|빼앗|압수|해산|결별|손절|관계\s*종료|인연\s*종료|더\s*이상\s*없|보유\s*없|소지\s*없)/.test(t);
  }

  function removalEvidence(item) {
    if (!item || typeof item !== 'object') return explicitRemovalText(item);
    return explicitRemovalText([
      item.sourceText,
      item.source,
      item.evidence,
      item.detail,
      item.memo,
      item.desc,
      item.value,
    ].filter(Boolean).join(' '));
  }

  function isExplicitRemovalItem(item) {
    return isExplicitRemovalText(removalEvidence(item));
  }

  function isExplicitClearValue(value) {
    const t = normalize(value);
    if (!t) return false;
    return /^(없음|없다|없어짐|사라짐|해제|벗음|미착용|종료|끝남|상실|분실|삭제|제거)$/i.test(t);
  }

  function mergeStatusField(baseValue, infoValue, aiValue, useAiStatus = false) {
    const info = cleanOptionalValue(infoValue);
    if (isExplicitClearValue(infoValue)) return '';
    if (info) return info;
    if (useAiStatus) {
      const ai = cleanOptionalValue(aiValue);
      if (isExplicitClearValue(aiValue)) return '';
      if (ai) return ai;
    }
    return cleanOptionalValue(baseValue);
  }

  function mergeRelationsPartial(baseRelations, infoRelations, options = {}) {
    const removeForcedUserRelation = options.removeForcedUserRelation || (() => true);
    const map = new Map();

    for (const raw of baseRelations || []) {
      const rel = normalizeRelation(raw);
      const key = relationKey(rel.name);
      if (!isValidRelationName(key) || !removeForcedUserRelation(rel)) continue;
      map.set(key, rel);
    }

    for (const raw of infoRelations || []) {
      const rel = normalizeRelation(raw);
      const key = relationKey(rel.name);
      if (!isValidRelationName(key) || !removeForcedUserRelation(rel)) continue;

      if (isExplicitRemovalItem(rel) || isExplicitRemovalItem(raw)) {
        map.delete(key);
        continue;
      }

      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...rel,
        name: rel.name || prev?.name || key,
        moodEmoji: rel.moodEmoji || prev?.moodEmoji || '',
        type: rel.type || prev?.type || '관계',
        detail: rel.detail || prev?.detail || '',
        value: rel.value || prev?.value || '',
        sourceText: rel.sourceText || prev?.sourceText || '',
      });
    }

    return Array.from(map.values());
  }

  function mergeInventoryPartial(baseItems, infoItems) {
    const map = new Map();

    for (const raw of baseItems || []) {
      const item = normalizeInventoryItem(raw);
      const key = relationKey(item.name);
      if (!key) continue;
      map.set(key, item);
    }

    for (const raw of infoItems || []) {
      const item = normalizeInventoryItem(raw);
      const key = relationKey(item.name);
      if (!key) continue;

      if (isExplicitRemovalItem(item) || isExplicitRemovalItem(raw)) {
        map.delete(key);
        continue;
      }

      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...item,
        name: item.name || prev?.name || key,
        icon: normalizeIcon(item.icon || prev?.icon, item.name || prev?.name || key),
        detail: item.detail || prev?.detail || '',
        sourceText: item.sourceText || prev?.sourceText || '',
      });
    }

    return Array.from(map.values()).slice(0, 24);
  }

  function mergeStatsPartial(baseStats, infoStats) {
    const map = new Map();

    for (const raw of baseStats || []) {
      const stat = {
        name: cleanOptionalValue(raw?.name || raw?.label || ''),
        value: cleanOptionalValue(raw?.value || ''),
      };
      const key = relationKey(stat.name || stat.value);
      if (!key) continue;
      map.set(key, stat);
    }

    for (const raw of infoStats || []) {
      const stat = {
        name: cleanOptionalValue(raw?.name || raw?.label || ''),
        value: cleanOptionalValue(raw?.value || ''),
      };
      const key = relationKey(stat.name || stat.value);
      if (!key) continue;

      if (isExplicitRemovalItem(raw) || isExplicitClearValue(stat.value)) {
        map.delete(key);
        continue;
      }

      const prev = map.get(key);
      map.set(key, {
        name: stat.name || prev?.name || '',
        value: stat.value || prev?.value || '',
      });
    }

    return Array.from(map.values());
  }

  function questKey(value) {
    return normalize(value).replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 36);
  }

  function mergeQuestsPartial(baseQuests, infoQuests) {
    const map = new Map();

    for (const raw of baseQuests || []) {
      const q = shortText(raw, 80);
      const key = questKey(q);
      if (key) map.set(key, q);
    }

    for (const raw of infoQuests || []) {
      const q = shortText(raw, 80);
      const key = questKey(q);
      if (!key) continue;

      if (isExplicitRemovalText(q)) {
        for (const prevKey of Array.from(map.keys())) {
          if (key.includes(prevKey) || prevKey.includes(key)) map.delete(prevKey);
        }
        continue;
      }

      map.set(key, q);
    }

    return Array.from(map.values());
  }

  function mergeMeters(baseMeters, deltas, currentRelations) {
    const relationKeys = new Set();
    const relationMap = new Map();

    for (const rel of currentRelations || []) {
      const r = normalizeRelation(rel);
      const key = relationKey(r.name);
      if (!isValidRelationName(key)) continue;

      relationKeys.add(key);
      relationMap.set(key, r);
    }

    const map = new Map();

    for (const item of baseMeters || []) {
      const m = normalizeMeter(item, 50);
      const key = relationKey(m.name);

      if (!relationKeys.has(key)) continue;

      const rel = relationMap.get(key);
      map.set(key, {
        name: rel?.name || m.name,
        moodEmoji: rel?.moodEmoji || m.moodEmoji || '',
        label: m.label || '관계',
        value: clamp(m.value, 0, 100),
        memo: rel?.detail || m.memo || '',
      });
    }

    for (const [key, rel] of relationMap.entries()) {
      if (!map.has(key)) {
        map.set(key, {
          name: rel.name,
          moodEmoji: rel.moodEmoji || '',
          label: '관계',
          value: 50,
          memo: rel.detail || '',
        });
      }
    }

    for (const rawDelta of deltas || []) {
      const d = normalizeDelta(rawDelta);
      if (!d) continue;

      const key = relationKey(d.name);
      if (!relationKeys.has(key)) continue;

      const prev = map.get(key);
      if (!prev) continue;

      const raw = Number(d.delta);
      const capped = raw >= 0
        ? Math.min(raw, METER_UP_CAP)
        : Math.max(raw, -METER_DOWN_CAP);

      map.set(key, {
        ...prev,
        label: d.label || prev.label || '관계',
        value: clamp(prev.value + capped, 0, 100),
        memo: d.memo || prev.memo || '',
      });
    }

    return Array.from(map.values());
  }

  function summarizeCurrentInfoForPrompt(data) {
    const d = sanitizeData(data || makeEmptyData());
    return {
      status: {
        time: d.time || '',
        location: d.location || '',
        character: d.character || '',
        situation: d.situation || '',
        goal: d.goal || '',
        clothing: d.clothing || '',
      },
      relations: (d.relations || []).map(r => {
        const rel = normalizeRelation(r);
        return {
          name: rel.name,
          detail: rel.detail || '',
          moodEmoji: rel.moodEmoji || '',
        };
      }).slice(0, 16),
      inventory: (d.inventory || []).map(item => {
        const inv = normalizeInventoryItem(item);
        return {
          name: inv.name,
          detail: inv.detail || '',
          icon: inv.icon || '',
        };
      }).slice(0, 24),
      stats: (d.stats || []).slice(0, 24),
      quests: (d.quests || []).slice(0, 16),
      meters: (d.affection || d.relationshipMeters || []).map(m => {
        const meter = normalizeMeter(m, 50);
        return {
          name: meter.name,
          value: meter.value,
          label: meter.label,
          memo: meter.memo || '',
        };
      }).slice(0, 16),
    };
  }

  function mergeData(baseRaw, infoRaw, aiRaw) {
    const base = sanitizeData(baseRaw || makeEmptyData());
    const info = sanitizeData(infoRaw || makeEmptyData());
    const ai = sanitizeData(aiRaw || makeEmptyData());
    const forcedUserName = getRoomUserName();
    const forcedUserKey = relationKey(forcedUserName);

    const removeForcedUserRelation = item => !forcedUserKey || !isRoomUserRelationName(normalizeRelation(item).name, forcedUserName);
    const removeForcedUserMeter = item => !forcedUserKey || !isRoomUserRelationName(normalizeMeter(item, 50).name, forcedUserName);
    const removeForcedUserDelta = item => !forcedUserKey || !isRoomUserRelationName(item?.name || '', forcedUserName);

    const infoHasAny =
      !!(info.time || info.location || info.character || info.situation || info.goal || info.clothing ||
         info._seen.relations || info._seen.inventory || info.stats.length || info.quests.length);

    const currentRelations = mergeRelationsPartial(base.relations, info._seen.relations ? info.relations : [], { removeForcedUserRelation });
    const filteredDeltas = (ai.relationshipDeltas || []).filter(removeForcedUserDelta);
    const baseMeters = (base.affection || base.relationshipMeters || []).filter(removeForcedUserMeter);
    const mergedMeters = mergeMeters(baseMeters, filteredDeltas, currentRelations).filter(removeForcedUserMeter);

    const inferredPlayerName =
      forcedUserName ||
      ai.inferredPlayerName ||
      info.character ||
      base.inferredPlayerName ||
      '';

    const possiblePlayerNames = forcedUserName
      ? []
      : [
        ...new Set([
          ...(info.possiblePlayerNames || []),
          ...(base.possiblePlayerNames || []),
        ])
      ].filter(isPossiblePlayerName).slice(0, 8);

    const useAiStatus = !infoHasAny && ai._inferredStatus;

    const merged = sanitizeData({
      ...base,
      time: mergeStatusField(base.time, info.time, ai.time, useAiStatus),
      location: mergeStatusField(base.location, info.location, ai.location, useAiStatus),
      character: forcedUserName || mergeStatusField(base.character, info.character, ai.character, useAiStatus) || inferredPlayerName || '',
      inferredPlayerName,
      possiblePlayerNames,
      situation: mergeStatusField(base.situation, info.situation, ai.situation, useAiStatus),
      goal: mergeStatusField(base.goal, info.goal, ai.goal, useAiStatus),
      clothing: mergeStatusField(base.clothing, info.clothing, '', false),
      relations: currentRelations,
      relationshipMeters: mergedMeters,
      affection: mergedMeters,
      relationshipDeltas: filteredDeltas,
      inventory: mergeInventoryPartial(base.inventory, info._seen.inventory ? info.inventory : []),
      stats: mergeStatsPartial(base.stats, info.stats),
      quests: mergeQuestsPartial(base.quests, info.quests),
      narrativeLogs: ai.narrativeLogs.length ? ai.narrativeLogs : base.narrativeLogs,
      pokemonLogs: ai.narrativeLogs.length ? ai.narrativeLogs : base.narrativeLogs,
      hudComments: ai.hudComments.length ? ai.hudComments : [],
      sceneMood: normalizeSceneMood(ai.sceneMood, 'normal'),
      _inferredStatus: useAiStatus,
      _seen: {
        relations: !!(base._seen?.relations || info._seen?.relations),
        inventory: !!(base._seen?.inventory || info._seen?.inventory),
        status: !!(base._seen?.status || info._seen?.status),
      },
    });

    return forcedUserName ? stripRoomUserFromData(merged, forcedUserName) : merged;
  }

  // ─────────────────────────────────────────────
  // Inventory
  // ─────────────────────────────────────────────
  function guessIcon(name) {
    // 소지품 이모지는 AI가 item.icon으로 고른 값을 우선 사용한다.
    // 코드 쪽에서는 이름 기반 고정 매핑을 하지 않고, 값이 없을 때만 중립 아이콘을 표시한다.
    return '◇';
  }

  function normalizeIcon(icon, name) {
    const raw = String(icon || '').trim();
    if (!raw || raw === '◇' || raw === '◆' || raw === '?' || /^unknown$/i.test(raw)) {
      return guessIcon(name);
    }
    return raw;
  }

  function normalizeInventoryItem(raw) {
    if (!raw || typeof raw !== 'object') {
      const name = cleanOptionalValue(String(raw || '').replace(/^[▸>\-•*└]+\s*/, ''));
      return { name, icon: guessIcon(name), detail: '' };
    }

    const name = cleanOptionalValue(raw.name || raw.item || raw.title);
    const detail = cleanOptionalValue(raw.detail || raw.memo || raw.desc);
    return {
      name,
      icon: normalizeIcon(raw.icon, name),
      detail,
      sourceText: cleanOptionalValue(raw.sourceText || raw.source || raw.evidence),
    };
  }

  function splitItems(text) {
    return normalize(text)
      .split(/\n|,|，|、|;|；|<|>/)
      .map(x => cleanOptionalValue(x.replace(/^[▸>\-•*└]+\s*/, '')))
      .filter(Boolean)
      .filter(x => !/^[-—]$/.test(x))
      .map(normalizeInventoryItem);
  }

  // ─────────────────────────────────────────────
  // INFO deterministic parser
  // ─────────────────────────────────────────────
  const SECTION_ALIASES = {
    관계: 'relations',
    관계도: 'relations',
    인연: 'relations',
    감정선: 'relations',
    호감: 'relations',
    호감도: 'relations',
    유대: 'relations',
    동료: 'relations',
    주변인물: 'relations',
    '주변 인물': 'relations',
    NPC: 'relations',
    npc: 'relations',
    등장인물: 'relations',
    '등장 인물': 'relations',
    연인: 'relations',
    적: 'relations',
    대상: 'relations',
    친밀도: 'relations',
    상태: 'status',
    현황: 'status',
    상황: 'status',
    장면: 'status',
    목표: 'status',
    목적: 'status',
    가방: 'inventory',
    보유: 'inventory',
    장비: 'inventory',
    아이템: 'inventory',
    소지품: 'inventory',
    인벤토리: 'inventory',
    지갑: 'inventory',
    주머니: 'inventory',
    퀘스트: 'quests',
    임무: 'quests',
    의상: 'clothing',
    복장: 'clothing',
    착용: 'clothing',
    위치: 'location',
    장소: 'location',
    능력: 'ignore',
    소속: 'ignore',
    개체: 'ignore',
    자산: 'ignore',
  };

  function normalizeSectionName(name) {
    const key = normalize(name).replace(/[《》\[\]【】]/g, '').split(/[｜|:：]/)[0].trim();
    return SECTION_ALIASES[key] || '';
  }

  function parseBracketLine(line) {
    const t = normalize(line);
    const m = t.match(/^[\[【](.+?)[\]】]$/);
    if (!m) return null;

    const inner = normalize(m[1]);
    const [rawLabel, ...rest] = inner.split(/[｜|]/);
    const label = normalize(rawLabel);
    const value = normalize(rest.join('｜'));

    return { label, value };
  }

  function bracketContent(bracket) {
    if (!bracket) return '';
    return normalize([bracket.label, bracket.value].filter(Boolean).join('｜'));
  }

  function parseHeaderLine(line, data) {
    const t = normalize(line);
    if (!/^〔.*〕$/.test(t)) return;

    const inner = t.replace(/^〔|〕$/g, '');
    const parts = inner.split('｜').map(x => normalize(x)).filter(Boolean);
    if (!parts.length) return;

    const datePart = parts.find(p => /\d{4}년|\d{1,2}월|\d{1,2}일/.test(p)) || '';
    const timePart = parts.find(p => /\d{1,2}:\d{2}/.test(p)) || '';
    const locationPart = [...parts].reverse().find(p =>
      !/^[▶▷]️?$/.test(p) &&
      !/^[☀🌙⭐⛅🌧❄️]+$/.test(p) &&
      !/\d{4}년|\d{1,2}월|\d{1,2}일|\d{1,2}:\d{2}/.test(p) &&
      !/^⌛/.test(p) &&
      !/^(봄|여름|가을|겨울|낮|밤|아침|저녁)$/.test(p)
    );

    if (datePart || timePart) data.time = cleanOptionalValue([datePart, timePart].filter(Boolean).join(' '));
    if (locationPart) data.location = cleanOptionalValue(locationPart);
  }

  function parseRelationLine(line, options = {}) {
    let raw = normalize(line)
      .replace(/^[▸>\-•*└]+\s*/, '')
      .trim();

    if (!raw || /^[-—]$/.test(raw)) return [];

    const out = [];

    if (options.inlineList) {
      const tokens = raw.split(/\s+/).map(x => x.trim()).filter(Boolean);
      const hasListSignal = tokens.some(token => EMOJI_RE.test(token) || /^#/.test(token));
      EMOJI_RE.lastIndex = 0;

      if (hasListSignal) {
        for (const token of tokens) {
          EMOJI_RE.lastIndex = 0;
          const hasAnyEmoji = EMOJI_RE.test(token);
          EMOJI_RE.lastIndex = 0;

          const moodEmoji = cleanMoodEmoji(token);
          const name = relationKey(token.replace(/^#/, ''));

          if (!hasAnyEmoji && !/^#/.test(token)) continue;
          if (!isValidRelationName(name)) continue;

          out.push({ name, moodEmoji, type: '관계', detail: '', value: '' });
        }

        if (out.length) return out;
      }
    }

    const sep = raw.match(/^(.{1,40})[｜|:：]\s*(.+)$/);
    if (sep) {
      const name = relationKey(sep[1]);
      const rest = normalize(sep[2]);
      if (!isValidRelationName(name)) return [];

      out.push({
        name,
        moodEmoji: cleanMoodEmoji(rest),
        type: '관계',
        detail: stripEmojis(rest).replace(/^[·ㆍ,，\s]+/, '').trim(),
        value: '',
      });
      return out;
    }

    return out;
  }

  function parseStatusLine(line, data) {
    const raw = normalize(line).replace(/^[▸>\-•*└]+\s*/, '');
    const sep = raw.match(/^(.{1,24})[｜|:：]\s*(.+)$/);
    if (!sep) return;

    const label = normalize(sep[1]);
    const value = cleanOptionalValue(sep[2]);
    if (!value) return;

    if (/목표/.test(label)) data.goal = value;
    else if (/상황/.test(label)) data.situation = value;
    else if (/위치|장소/.test(label)) data.location = value;
    else if (/의상|복장/.test(label)) data.clothing = value;
    else data.stats.push({ name: label, value });
  }

  function parseInfoDeterministic(infoText) {
    const data = makeEmptyData();
    data.possiblePlayerNames = extractPossiblePlayerNames(infoText);

    const lines = normalize(infoText).split('\n').map(x => x.trim()).filter(Boolean);
    let section = '';

    for (const line of lines) {
      if (!line || /^info$/i.test(line) || /^✧/.test(line)) continue;

      parseHeaderLine(line, data);

      const named = line.match(/^《(.+?)》\s*[ː:：]?\s*(.*)$/);
      if (named) {
        const sectionName = normalizeSectionName(named[1]);
        if (sectionName) {
          section = sectionName;
          data._seen[sectionName] = true;
          if (sectionName === 'status' && named[2]) parseStatusLine(named[2], data);
          continue;
        }

        if (!data.character && !SECTION_ALIASES[named[1]]) {
          data.character = cleanOptionalValue(named[1]);
          continue;
        }
      }

      const bracket = parseBracketLine(line);
      if (bracket) {
        const kind = normalizeSectionName(bracket.label);

        if (kind) {
          section = kind;
          if (kind in data._seen) data._seen[kind] = true;

          const hasInlineValue = !!cleanOptionalValue(bracket.value);

          if (kind === 'relations' && hasInlineValue) {
            data.relations.push(...parseRelationLine(bracket.value, { inlineList: true }));
          } else if (kind === 'inventory') {
            data._seen.inventory = true;
            if (hasInlineValue) data.inventory.push(...splitItems(bracket.value));
          } else if (kind === 'status') {
            data._seen.status = true;
            if (hasInlineValue) parseStatusLine(`${bracket.label}｜${bracket.value}`, data);
          } else if (kind === 'location') {
            data.location = cleanOptionalValue(bracket.value);
          } else if (kind === 'clothing') {
            data.clothing = cleanOptionalValue(bracket.value);
          } else if (kind === 'quests') {
            if (hasInlineValue) data.quests.push(bracket.value);
          }

          if (hasInlineValue && ['relations', 'inventory', 'status', 'location', 'clothing', 'quests', 'ignore'].includes(kind)) {
            section = '';
          }

          continue;
        }

        const content = bracketContent(bracket);

        if (section === 'relations') {
          data._seen.relations = true;
          data.relations.push(...parseRelationLine(content));
        } else if (section === 'inventory') {
          data._seen.inventory = true;
          data.inventory.push(...splitItems(content));
        } else if (section === 'status') {
          data._seen.status = true;
          parseStatusLine(content, data);
        } else if (section === 'quests') {
          const q = cleanOptionalValue(content.replace(/^[▸>\-•*└]+\s*/, ''));
          if (q) data.quests.push(q);
        }

        continue;
      }

      if (section === 'relations') {
        data._seen.relations = true;
        data.relations.push(...parseRelationLine(line));
      } else if (section === 'inventory') {
        data._seen.inventory = true;
        data.inventory.push(...splitItems(line));
      } else if (section === 'status') {
        data._seen.status = true;
        parseStatusLine(line, data);
      } else if (section === 'quests') {
        const q = cleanOptionalValue(line.replace(/^[▸>\-•*└]+\s*/, ''));
        if (q) data.quests.push(q);
      }
    }

    if (!data.character && data.possiblePlayerNames.length) {
      data.character = data.possiblePlayerNames[0];
    }

    const relMap = new Map();
    for (const rel of data.relations) {
      const r = normalizeRelation(rel);
      const key = relationKey(r.name);
      if (!isValidRelationName(key)) continue;
      const old = relMap.get(key);
      relMap.set(key, {
        ...(old || {}),
        name: r.name,
        moodEmoji: r.moodEmoji || old?.moodEmoji || '',
        type: '관계',
        detail: r.detail || old?.detail || '',
        value: r.value || old?.value || '',
      });
    }
    data.relations = Array.from(relMap.values());

    const itemMap = new Map();
    for (const item of data.inventory) {
      const it = normalizeInventoryItem(item);
      if (!it.name) continue;
      itemMap.set(it.name, {
        ...it,
        icon: normalizeIcon(it.icon, it.name),
      });
    }
    data.inventory = Array.from(itemMap.values());

    return sanitizeData(data);
  }

  function stripUiLines(rawText) {
    return normalize(rawText)
      .split('\n')
      .map(x => x.trim())
      .filter(line => !/^답변\s*비교\s*\d+\s*\/\s*\d+$/i.test(line))
      .filter(line => !/^(믹스|리롤|다시 생성|보내기|복사|수정|삭제)$/i.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function scoreInfoLikeBlock(text) {
    const t = normalize(text);
    if (!t) return 0;

    let score = 0;
    const lines = t.split('\n').map(x => x.trim()).filter(Boolean);
    const bracketLines = lines.filter(line => /^[\[【《〔「].*[\]】》〕」]$/.test(line)).length;
    const sepLines = lines.filter(line => /[｜|:：]|\s[-–—]\s/.test(line)).length;
    const bulletLines = lines.filter(line => /^[▸>\-•*└◆■●☆▶#]/.test(line)).length;
    const tableLines = lines.filter(line => /^\|.*\|$/.test(line) || /\|\s*[-:]+\s*\|/.test(line)).length;
    const dividerLines = lines.filter(line => /^(?:[-─━=]{3,}|[◆■●☆▶]{2,})$/.test(line.replace(/\s+/g, ''))).length;

    const relationLines = lines.filter(line => /(관계|인연|감정선|호감도|호감|유대|동료|적|주변\s*인물|NPC|등장\s*인물|연인|대상)/i.test(line)).length;
    const inventoryLines = lines.filter(line => /(가방|소지품|소지|보유|장비|인벤토리|아이템|지갑|주머니|착용|무기)/i.test(line)).length;
    const statusLines = lines.filter(line => /(시간|날짜|장소|위치|현황|상황|장면|목표|목적|복장|의상|상태|HP|MP|스탯|체력|기분)/i.test(line)).length;
    const valueLines = lines.filter(line => /[｜|:：]|\s[-–—]\s|\d+\s*%|[■□▰▱▮▯]{2,}|HP\s*\d|MP\s*\d/i.test(line)).length;
    const compactRelationList = lines.filter(line => {
      const tokens = line.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) return false;
      return tokens.filter(token => /^#?[가-힣A-Za-z0-9_]{1,16}[\p{Emoji_Presentation}\p{Extended_Pictographic}]?$/u.test(token)).length >= 2
        && /[\p{Emoji_Presentation}\p{Extended_Pictographic}#]/u.test(line);
    }).length;

    if (bracketLines >= 2) score += 1;
    if (sepLines >= 2) score += 2;
    if (bulletLines >= 2) score += 1;
    if (tableLines >= 1) score += 2;
    if (dividerLines >= 1) score += 1;
    if (relationLines) score += Math.min(4, relationLines * 2);
    if (inventoryLines) score += Math.min(4, inventoryLines * 2);
    if (statusLines) score += Math.min(5, statusLines * 2);
    if (valueLines >= 2) score += 2;
    if (compactRelationList) score += 3;
    if (lines.length >= 3 && lines.length <= 100) score += 1;
    if (/^(?:[#◆■▶]\s*)?(?:info|정보|인포)\s*[:：-]?$/i.test(t)) score = 0;

    return score;
  }

  function infoSemanticLineScore(line) {
    const t = normalize(line);
    if (!t) return 0;
    let score = 0;
    if (/^(?:[#◆■▶]\s*)?(?:info|정보|인포)\s*[:：-]?$/i.test(t)) return 10;
    if (/^〔.*〕$/.test(t)) score += 2;
    if (/^[\[【《](?:관계|관계도|인연|감정선|호감도?|유대|동료|주변\s*인물|NPC|등장\s*인물|연인|상태|현황|상황|장면|목표|목적|가방|소지품|보유|장비|인벤토리|아이템|지갑|주머니|퀘스트|임무|의상|복장|착용|위치|장소)(?:[｜|:：].*)?[\]】》]$/i.test(t)) score += 5;
    if (/^(?:관계|관계도|인연|감정선|호감도?|유대|동료|주변\s*인물|NPC|등장\s*인물|연인|상태|현황|상황|장면|목표|목적|가방|소지품|보유|장비|인벤토리|아이템|지갑|주머니|퀘스트|임무|의상|복장|착용|위치|장소)\s*[｜|:：]/i.test(t)) score += 4;
    if (/(?:시간|날짜|장소|위치|현황|상황|목표|목적|복장|의상|관계|인연|호감|유대|소지품|보유|장비|아이템|인벤토리)\s*[｜|:：]/i.test(t)) score += 3;
    if (/^\|.*\|$/.test(t) || /\|\s*[-:]+\s*\|/.test(t)) score += 2;
    if (/\d+\s*%|[■□▰▱▮▯]{2,}|\b(?:HP|MP)\s*\d/i.test(t)) score += 1;
    return score;
  }

  function infoStructureLineScore(line) {
    const t = normalize(line);
    if (!t) return 0;
    let score = 0;
    if (/^[\[【《〔「].*[\]】》〕」]$/.test(t)) score += 1;
    if (/^[▸>\-•*└◆■●☆▶#]/.test(t)) score += 1;
    if (/[｜|:：]|\s[-–—]\s/.test(t)) score += 1;
    if (/^(?:[-─━=]{3,}|[◆■●☆▶]{2,})$/.test(t.replace(/\s+/g, ''))) score += 1;
    return score;
  }

  function isNarrativeHeavyLine(line) {
    const t = normalize(line);
    if (!t) return false;
    if (infoSemanticLineScore(t) >= 3) return false;
    if (infoStructureLineScore(t) >= 2) return false;
    const dialogue = /^["“”'‘’「『]/.test(t) || /["”』」]\s*$/.test(t);
    const proseEnding = /(?:다|했다|였다|었다|한다|된다|였다|었다|까|지|네|군|요)[.!?…]*$/u.test(t);
    return dialogue || (t.length >= 24 && proseEnding);
  }

  function makeLooseInfoCandidate(lines, start, end, explicit = false) {
    if (start < 0 || end <= start || end > lines.length) return null;
    const bodyLines = lines.slice(start, end).filter(Boolean);
    if (!bodyLines.length) return null;
    const info = normalize(bodyLines.join('\n'));
    if (!info || info.length > 6000) return null;

    const semantic = bodyLines.reduce((n, line) => n + (infoSemanticLineScore(line) >= 3 ? 1 : 0), 0);
    const semanticPower = bodyLines.reduce((n, line) => n + infoSemanticLineScore(line), 0);
    const structure = bodyLines.reduce((n, line) => n + (infoStructureLineScore(line) > 0 ? 1 : 0), 0);
    const narrative = bodyLines.reduce((n, line) => n + (isNarrativeHeavyLine(line) ? 1 : 0), 0);
    const blockScore = scoreInfoLikeBlock(info);

    if (explicit) {
      if (blockScore < 2 && semanticPower < 4) return null;
    } else {
      // 라벨 없는 블록은 꽤 확실한 구조일 때만 분리한다. 일반 RP 본문 오인식을 줄이는 안전장치.
      if (blockScore < 7 || semantic < 2 || structure < 2) return null;
      if (narrative > Math.max(2, Math.floor(bodyLines.length * 0.45))) return null;
    }

    const lastLine = bodyLines[bodyLines.length - 1] || '';
    const danglingSectionHeader = /^[\[【《](?:관계|관계도|인연|감정선|호감도?|유대|동료|주변\s*인물|NPC|등장\s*인물|연인|상태|현황|상황|장면|목표|목적|가방|소지품|보유|장비|인벤토리|아이템|지갑|주머니|퀘스트|임무|의상|복장|착용|위치|장소)[\]】》]$/i.test(normalize(lastLine));
    const quality = blockScore * 4 + semanticPower * 2 + structure - narrative * 4 - bodyLines.length * 0.08 + (explicit ? 25 : 0) - (danglingSectionHeader ? 24 : 0);
    return { lineStart: start, lineEnd: end, info, score: quality };
  }

  function extractFencedInfoBlock(text) {
    const src = String(text || '');
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    const candidates = [];
    let match;

    while ((match = re.exec(src))) {
      const label = normalize(match[1] || '');
      const body = normalize(match[2] || '');
      if (!body) continue;

      const labelledInfo = /^(info|정보|인포|status|hud)\b/i.test(label);
      const score = scoreInfoLikeBlock(body);

      if (labelledInfo || score >= 5) {
        candidates.push({
          start: match.index,
          end: re.lastIndex,
          info: body,
          score: score + (labelledInfo ? 12 : 0),
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score || a.start - b.start);
    return candidates[candidates.length - 1];
  }

  function extractLooseInfoBlock(text) {
    const lines = normalize(text).split('\n').map(x => x.trim());
    if (!lines.some(Boolean)) return null;
    const candidates = [];

    // 1) 명시적인 INFO/정보/인포 표시는 답변 앞·중간·뒤 어디에 있어도 허용한다.
    // 표시 뒤에서 구조적 INFO가 끝나는 지점을 찾고, 뒤에 이어지는 RP 본문은 보존한다.
    for (let marker = 0; marker < lines.length; marker++) {
      if (!/^(?:[#◆■▶]\s*)?(?:info|정보|인포)\s*[:：-]?$/i.test(lines[marker])) continue;
      const start = marker + 1;
      if (start >= lines.length) continue;

      let narrativeStreak = 0;
      let seenSignal = 0;
      let stop = lines.length;
      for (let j = start; j < lines.length; j++) {
        const line = lines[j];
        const semantic = infoSemanticLineScore(line);
        const structure = infoStructureLineScore(line);
        if (semantic >= 3 || structure >= 2) seenSignal += 1;

        if (!line && seenSignal > 0) {
          const nextMeaningful = lines.slice(j + 1).find(Boolean) || '';
          // 빈 줄 뒤에도 INFO 섹션/키-값 구조가 이어지면 같은 블록으로 본다.
          if (infoSemanticLineScore(nextMeaningful) < 3 && infoStructureLineScore(nextMeaningful) < 2) {
            stop = j;
            break;
          }
          continue;
        }

        if (seenSignal > 0 && isNarrativeHeavyLine(line)) narrativeStreak += 1;
        else narrativeStreak = 0;

        // 명시 INFO 뒤에서 일반 서술이 두 줄 연속 나오면 첫 서술 직전에서 닫는다.
        if (narrativeStreak >= 2) {
          stop = j - 1;
          break;
        }
      }

      const whole = makeLooseInfoCandidate(lines, start, stop, true);
      if (whole) candidates.push({ ...whole, markerStart: marker });
    }

    // 명시적인 INFO 표시는 위치와 상관없이 최우선한다. 아래의 추정 탐색과 경쟁시키지 않는다.
    if (candidates.length) {
      candidates.sort((a, b) => a.score - b.score || (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart));
      return candidates[candidates.length - 1];
    }

    // 2) 라벨이 없는 INFO도 답변 위치와 무관하게 찾되, 강한 의미 라인 주변의 작은 블록만 후보로 삼는다.
    const anchors = lines.map((line, i) => infoSemanticLineScore(line) >= 3 ? i : -1).filter(i => i >= 0);
    for (const anchor of anchors) {
      const minStart = Math.max(0, anchor - 12);
      const maxEnd = Math.min(lines.length, anchor + 28);
      for (let start = minStart; start <= anchor; start++) {
        for (let end = Math.max(anchor + 1, start + 2); end <= maxEnd; end++) {
          if (end - start > 36) break;
          const c = makeLooseInfoCandidate(lines, start, end, false);
          if (c) candidates.push(c);
        }
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score || (a.lineEnd - a.lineStart) - (b.lineEnd - b.lineStart));
    return candidates[candidates.length - 1];
  }

  function splitReplyAndInfo(rawText) {
    const text = stripUiLines(rawText);

    const fenced = extractFencedInfoBlock(text);
    if (fenced) {
      return {
        reply: normalize((text.slice(0, fenced.start) + '\n' + text.slice(fenced.end)).trim()),
        info: fenced.info,
      };
    }

    const loose = extractLooseInfoBlock(text);
    if (loose) {
      const lines = text.split('\n').map(x => x.trim());
      const removeStart = Number.isInteger(loose.markerStart) ? loose.markerStart : loose.lineStart;
      const replyLines = lines.slice(0, removeStart).concat(lines.slice(loose.lineEnd));
      return {
        reply: normalize(replyLines.join('\n')),
        info: loose.info,
      };
    }

    return {
      reply: normalize(text),
      info: '',
    };
  }

  // ─────────────────────────────────────────────
  // Latest message collection
  // ─────────────────────────────────────────────
  const MESSAGE_SELECTOR = '[data-message-group-id], [data-message-id]';

  function isOwnNode(el) {
    return !!el?.closest?.(`#${PANEL_ID}, #${FAB_ID}, #${DOCK_FAB_ID}, #${POPUP_ID}, #${COMMENT_POPUP_ID}, #${TICKER_ID}, #${SETTINGS_ID}, #${MASCOT_ID}`);
  }

  function isEpisodePath(pathname = location.pathname) {
    return /\/stories\/[^/]+\/episodes\/[^/?#]+/.test(pathname)
      || /\/episodes\/[^/?#]+/.test(pathname);
  }

  function isHudUiRouteAllowed(pathname = location.pathname) {
    return isEpisodePath(pathname);
  }

  function findCrackHeaderTitleButton() {
    const button = document.querySelector('main span.line-clamp-1')?.closest('button') || null;
    if (!(button instanceof HTMLElement)) return null;

    const header = button.parentElement;
    if (!(header instanceof HTMLElement)) return null;

    const headerRect = header.getBoundingClientRect?.();
    const fallbackHeight = Number(header.offsetHeight || header.clientHeight || button.offsetHeight || 0);
    const measuredHeight = Number(headerRect?.height || 0);
    const checkHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight;

    // Crack episode top bar is normally h-12. If it is visibly measurable and outside that range,
    // do not anchor to random line-clamp text elsewhere.
    if (checkHeight > 0 && (checkHeight < 40 || checkHeight > 56)) return null;

    return button;
  }

  function isDockActive() {
    return isDockModeEnabled() && isEpisodePath();
  }

  function findCrackInputHost() {
    const input = document.querySelector('.__chat_input_textarea');
    if (!(input instanceof HTMLElement)) return null;
    return input.closest('div.pointer-events-auto') || input;
  }

  function rectsIntersect(a, b) {
    return !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function positionTickerNearInput(ticker) {
    if (!(ticker instanceof HTMLElement)) return false;

    const inputHost = findCrackInputHost();
    if (!(inputHost instanceof HTMLElement)) return false;

    const rect = inputHost.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    const vp = viewportSize();
    const left = clamp(Math.round(rect.left), 0, Math.max(0, vp.width - 1));
    const width = Math.max(1, Math.min(Math.round(rect.width), vp.width - left));
    let bottom = Math.max(0, vp.height - rect.top + 1);

    ticker.style.left = `${left}px`;
    ticker.style.width = `${width}px`;
    ticker.style.right = 'auto';
    ticker.style.top = 'auto';
    ticker.style.bottom = `${bottom}px`;
    setTickerBoxVisible(ticker);

    const livePopup = document.getElementById('igx-live-popup');
    if (livePopup && shouldShowTickerBox()) {
      const tickerRect = ticker.getBoundingClientRect?.();
      const popupRect = livePopup.getBoundingClientRect?.();
      if (rectsIntersect(tickerRect, popupRect)) {
        const overlapY = Math.max(0, Math.min(tickerRect.bottom, popupRect.bottom) - Math.max(tickerRect.top, popupRect.top));
        bottom += Math.ceil(overlapY);
        ticker.style.bottom = `${bottom}px`;
      }
    }

    return true;
  }

  function applyDockButtonInlineStyle(dockFab) {
    if (!(dockFab instanceof HTMLElement)) return;
    dockFab.style.cssText = [
      'margin-left: 6px',
      'margin-right: auto',
      'width: 24px',
      'height: 24px',
      'min-width: 24px',
      'min-height: 24px',
      'max-width: 24px',
      'max-height: 24px',
      'flex: 0 0 auto',
      'display: grid',
      'place-items: center',
      'padding: 0',
      'box-sizing: border-box',
      'border-radius: 6px',
      'cursor: pointer',
      'touch-action: manipulation',
      'user-select: none',
      'background: var(--cigh-bg)',
      'border: 1px solid var(--cigh-border-soft)',
      'color: var(--cigh-accent)',
      'font-size: 13px',
      'line-height: 1',
      'box-shadow: var(--cigh-shadow-fab)',
      'z-index: 10'
    ].join('; ');
  }

  function ensureDockButtonInHeader(titleButton) {
    if (!(titleButton instanceof HTMLElement) || !(titleButton.parentElement instanceof HTMLElement)) return null;

    let dockFab = document.getElementById(DOCK_FAB_ID);
    if (dockFab?.isConnected && dockFab.previousElementSibling === titleButton && dockFab.parentElement === titleButton.parentElement) {
      applyDockButtonInlineStyle(dockFab);
      return dockFab;
    }

    if (!dockFab) {
      dockFab = document.createElement('button');
      dockFab.id = DOCK_FAB_ID;
      dockFab.type = 'button';
      dockFab.title = `INFO Game HUD v${VERSION}`;
      dockFab.textContent = '◆';
      dockFab.addEventListener('click', event => {
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        event.preventDefault();
        const panel = ensurePanel();
        const nextOpen = !panel.classList.contains('open') || panel.style.display === 'none';
        setPanelOpen(panel, nextOpen);
      });
    } else if (dockFab.isConnected) {
      dockFab.remove();
    }

    applyDockButtonInlineStyle(dockFab);
    titleButton.insertAdjacentElement('afterend', dockFab);
    return dockFab;
  }

  function ensureDockUi() {
    const titleButton = findCrackHeaderTitleButton();
    if (!(titleButton instanceof HTMLElement)) return null;

    const dockFab = ensureDockButtonInHeader(titleButton);
    if (!(dockFab instanceof HTMLElement)) return null;

    let ticker = document.getElementById(TICKER_ID);
    if (!ticker) {
      ticker = document.createElement('div');
      ticker.id = TICKER_ID;
      ticker.innerHTML = '<div class="cigh-clean-ticker-viewport"><div class="cigh-clean-ticker-line"></div></div>';
      ticker.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const panel = ensurePanel();
        setPanelOpen(panel, true);
      });
      document.body.appendChild(ticker);
    }

    applyThemeMode();
    return { dockFab, ticker, titleButton };
  }

  function shouldShowTickerBox() {
    return tickerRunning || tickerLineVisible || tickerQueue.length > 0;
  }

  function setTickerBoxVisible(ticker, visible = shouldShowTickerBox()) {
    if (!ticker) return;
    ticker.style.display = visible ? 'block' : 'none';
  }

  function positionDockUi() {
    if (!isDockActive()) {
      teardownDockUi();
      return false;
    }

    const ui = ensureDockUi();
    if (!ui) {
      teardownDockUi();
      return false;
    }

    const { dockFab, ticker, titleButton } = ui;
    if (!dockFab?.isConnected || dockFab.previousElementSibling !== titleButton || dockFab.parentElement !== titleButton.parentElement) {
      try {
        document.getElementById(DOCK_FAB_ID)?.remove();
        ensureDockButtonInHeader(titleButton);
      } catch (_) {
        return false;
      }
    }

    document.documentElement.classList.add(DOCK_ACTIVE_CLASS);

    const fab = document.getElementById(FAB_ID);
    if (fab) fab.style.display = 'none';

    const popup = document.getElementById(POPUP_ID);
    const commentPopup = document.getElementById(COMMENT_POPUP_ID);
    popup?.classList.remove('show');
    commentPopup?.classList.remove('show');

    if (!positionTickerNearInput(ticker)) {
      teardownDockUi();
      return false;
    }

    return true;
  }

  function clearTickerTimers() {
    clearTimeout(tickerNextTimer);
    clearTimeout(tickerHideTimer);
    clearTimeout(tickerAnimTimer);
    tickerNextTimer = null;
    tickerHideTimer = null;
    tickerAnimTimer = null;
  }

  function resetTickerLine(options = {}) {
    if (options.queue !== false) tickerQueue = [];
    tickerRunning = false;
    tickerLineVisible = false;
    clearTickerTimers();

    const ticker = document.getElementById(TICKER_ID);
    const line = ticker?.querySelector?.('.cigh-clean-ticker-line');
    if (line) {
      line.textContent = '';
      line.className = 'cigh-clean-ticker-line';
      line.style.transform = 'translate3d(0, 88%, 0)';
      line.style.opacity = '0';
    }
    setTickerBoxVisible(ticker, false);
  }

  function pushTickerLine(text) {
    const line = String(text || '').trim();
    if (!line) return;
    if (!positionDockUi()) return;

    clearTimeout(tickerHideTimer);
    tickerHideTimer = null;
    tickerQueue.push(line);
    const ticker = document.getElementById(TICKER_ID);
    setTickerBoxVisible(ticker, true);
    if (!tickerRunning) tickerNext();
  }

  function tickerNext() {
    if (!positionDockUi()) {
      resetTickerLine({ queue: false });
      return;
    }

    const ticker = document.getElementById(TICKER_ID);
    const line = ticker?.querySelector?.('.cigh-clean-ticker-line');
    if (!ticker || !line) {
      tickerRunning = false;
      return;
    }

    if (!tickerQueue.length) {
      tickerRunning = false;
      clearTimeout(tickerHideTimer);
      tickerHideTimer = setTimeout(() => {
        line.style.transform = 'translate3d(0, -88%, 0)';
        line.style.opacity = '0';
        tickerLineVisible = false;
        clearTimeout(tickerAnimTimer);
        tickerAnimTimer = setTimeout(() => {
          if (!tickerQueue.length && !tickerRunning && !tickerLineVisible) setTickerBoxVisible(ticker, false);
        }, TICKER_TRANSITION_MS + 40);
      }, TICKER_IDLE_HIDE_MS);
      return;
    }

    tickerRunning = true;
    setTickerBoxVisible(ticker, true);
    const nextText = tickerQueue.shift();
    clearTimeout(tickerNextTimer);
    clearTimeout(tickerAnimTimer);

    const enter = () => {
      setTickerBoxVisible(ticker, true);
      line.className = 'cigh-clean-ticker-line entering';
      line.textContent = nextText;
      positionTickerNearInput(ticker);
      line.style.transition = 'none';
      line.style.transform = 'translate3d(0, 88%, 0)';
      line.style.opacity = '0';
      line.offsetHeight;
      line.style.transition = '';
      requestAnimationFrame(() => {
        line.classList.remove('entering');
        line.style.transform = 'translate3d(0, 0, 0)';
        line.style.opacity = '1';
        tickerLineVisible = true;
      });
      tickerNextTimer = setTimeout(tickerNext, tickerQueue.length >= TICKER_BACKLOG_THRESHOLD ? TICKER_BACKLOG_HOLD_MS : TICKER_HOLD_MS);
    };

    if (tickerLineVisible) {
      line.className = 'cigh-clean-ticker-line leaving';
      line.style.transform = 'translate3d(0, -88%, 0)';
      line.style.opacity = '0';
      tickerAnimTimer = setTimeout(enter, TICKER_TRANSITION_MS + 40);
    } else {
      enter();
    }
  }

  function teardownDockUi() {
    document.documentElement.classList.remove(DOCK_ACTIVE_CLASS);
    const dockFab = document.getElementById(DOCK_FAB_ID);
    const ticker = document.getElementById(TICKER_ID);
    dockFab?.remove();
    ticker?.remove();
    resetTickerLine();

    const fab = document.getElementById(FAB_ID);
    if (fab) fab.style.display = isHudUiRouteAllowed() ? '' : 'none';
  }

  function syncHudUiForRoute() {
    const allowed = isHudUiRouteAllowed();
    const fab = document.getElementById(FAB_ID);

    if (!allowed) {
      teardownDockUi();
      clearTransientUi();

      const panel = document.getElementById(PANEL_ID);
      if (panel) {
        panel.classList.remove('open');
        panel.style.display = 'none';
      }

      { const settings = document.getElementById(SETTINGS_ID); if (settings && !settings.rbRequestClose) settings.remove(); }
      document.getElementById(COMMENT_POPUP_ID)?.classList.remove('show');
      if (fab) fab.style.display = 'none';
      return false;
    }

    if (fab && !isDockActive()) fab.style.display = '';
    return true;
  }

  function syncDockUiForRoute() {
    if (!syncHudUiForRoute()) return;
    if (!isDockModeEnabled()) {
      if (document.getElementById(DOCK_FAB_ID) || document.getElementById(TICKER_ID)) teardownDockUi();
      return;
    }
    if (!isEpisodePath()) {
      teardownDockUi();
      return;
    }

    try {
      const titleButton = findCrackHeaderTitleButton();
      const dockFab = document.getElementById(DOCK_FAB_ID);
      if (!titleButton) {
        teardownDockUi();
        return;
      }
      if (!dockFab?.isConnected || dockFab.previousElementSibling !== titleButton || dockFab.parentElement !== titleButton.parentElement) {
        dockFab?.remove();
      }
      positionDockUi();
    } catch (_) {
      // Header subtree can be recreated by Crack React; retry quietly on the next 700ms tick.
    }
  }

  function isVisibleRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }

  function findCrackMessageScope() {
    return document.querySelector('main .stick-to-bottom')
      || document.querySelector('main [data-testid="virtuoso-scroller"][data-virtuoso-scroller="true"]')
      || document.querySelector('main [data-virtuoso-scroller="true"]')
      || document.querySelector('main div[tabindex="0"].scrollbar')
      || document.querySelector('main');
  }

  function markCodeBlocksInClone(clone) {
    clone.querySelectorAll('pre').forEach(pre => {
      const codeEl = pre.querySelector('code') || pre;
      const cls = String(codeEl.className || pre.className || '');
      const lang = cls.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
      const text = codeEl.innerText || codeEl.textContent || pre.innerText || pre.textContent || '';
      pre.replaceWith(document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`));
    });
  }

  function getCleanMarkdownText(markdown, options = {}) {
    if (!(markdown instanceof HTMLElement) || isOwnNode(markdown)) return '';

    const clone = markdown.cloneNode(true);
    const removeSelectors = [
      '.not-wrtn-markdown',
      '.csp-generated-scene-image',
      '[id^="cigh-clean-"]',
      '[class*="cigh-clean-"]',
      'script',
      'style',
      'button',
      '[role="button"]',
      'svg',
      'textarea',
      'input',
      'select',
    ];

    if (options.includeCodeBlocks) markCodeBlocksInClone(clone);
    else removeSelectors.push('.wrtn-codeblock', '[data-sgb-codeblock]', 'pre', 'code');

    clone.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());

    return normalize(clone.innerText || clone.textContent || '');
  }

  function getMessageSortKey(group, markdown, domIndex = 0) {
    const rect = group?.getBoundingClientRect?.() || markdown?.getBoundingClientRect?.() || null;
    const lenAt = Number(markdown?.getAttribute?.('data-sgb-len-at') || 0) || 0;
    const groupId = String(group?.getAttribute?.('data-message-group-id') || '').trim();
    const messageId = String(group?.getAttribute?.('data-message-id') || '').trim();
    const hexRank = /^[0-9a-f]{8,}$/i.test(groupId) ? groupId.toLowerCase() : '';

    return {
      lenAt,
      groupId,
      messageId,
      hexRank,
      domIndex,
      top: Number(rect?.top || 0),
      bottom: Number(rect?.bottom || 0),
    };
  }

  function compareMessageSortKey(a, b) {
    if (a.lenAt !== b.lenAt) return a.lenAt - b.lenAt;
    if (a.hexRank && b.hexRank && a.hexRank !== b.hexRank) return a.hexRank > b.hexRank ? 1 : -1;
    if (a.bottom !== b.bottom) return a.bottom - b.bottom;
    if (a.top !== b.top) return a.top - b.top;
    return a.domIndex - b.domIndex;
  }

  function getLatestCrackLogEntries(options = {}) {
    if (!isEpisodePath()) return [];
    const scope = findCrackMessageScope();
    if (!(scope instanceof HTMLElement)) return [];
    let groups = scope.matches?.('[data-message-group-id]') ? [scope] : Array.from(scope.querySelectorAll('[data-message-group-id]'));
    // 실제 리스트의 flex 방향을 따른다. 화면 밖 최신 답변도 읽을 수 있다.
    const first = groups[0];
    let reversed = false;
    for (let parent = first?.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).flexDirection === 'column-reverse') { reversed = true; break; }
      if (parent === scope) break;
    }
    if (reversed) groups.reverse();
    const entries = [];
    for (let i = groups.length - 1; i >= 0 && entries.length < 4; i--) {
      const group = groups[i];
      if (isOwnNode(group) || group.closest('[role="dialog"], #igx-live-popup')) continue;
      const markdown = group.querySelector('.wrtn-markdown:not(.not-wrtn-markdown)');
      if (!(markdown instanceof HTMLElement) || isOwnNode(markdown)) continue;
      const text = getCleanMarkdownText(markdown, { includeCodeBlocks: !!options.includeCodeBlocks });
      if (text.length >= 2) entries.push({ group, markdown, text });
    }
    return entries.reverse();
  }



  function getMessageDomKey(el) {
    if (!(el instanceof Element)) return '';

    const messageEl = el.matches?.(MESSAGE_SELECTOR)
      ? el
      : el.closest?.(MESSAGE_SELECTOR);

    if (!messageEl) return '';

    const groupId = String(messageEl.getAttribute('data-message-group-id') || '').trim();
    const messageId = String(messageEl.getAttribute('data-message-id') || '').trim();
    const markdown = messageEl.querySelector?.('.wrtn-markdown:not(.not-wrtn-markdown)');
    const lenAt = markdown?.getAttribute?.('data-sgb-len-at') || '';
    const stableKey = [
      groupId ? `g:${groupId}` : '',
      messageId ? `m:${messageId}` : '',
      lenAt ? `t:${lenAt}` : '',
    ].filter(Boolean).join('|');

    return stableKey ? `dom:${stableKey}` : '';
  }

  function makeMessageKey(text, el = null) {
    const t = normalize(text);
    const textKey = `${t.length}:${hashTiny(t)}:${t.slice(-80)}`;
    const domKey = getMessageDomKey(el);
    return domKey ? `${domKey}|${textKey}` : textKey;
  }

  function makeContentKey(reply, info = '') {
    const t = normalize(`${reply}\n${info}`);
    return `${t.length}:${hashTiny(t)}:${t.slice(-80)}`;
  }

  function findLatestContext() {
    const entries = getLatestCrackLogEntries({ includeCodeBlocks: true });
    const picked = entries[entries.length - 1];
    if (!picked) return null;

    const raw = picked.text;
    const { reply, info } = splitReplyAndInfo(raw);
    if ((reply.length < 30) && !info) return null;

    const pickedIndex = entries.indexOf(picked);
    const context = entries
      .slice(Math.max(0, pickedIndex - 3), pickedIndex)
      .map(entry => entry.text)
      .filter(Boolean)
      .join('\n\n---\n\n')
      .slice(-3600);

    return {
      latestReply: reply,
      infoText: info,
      context,
      key: makeMessageKey(raw, picked.group),
      contentKey: makeContentKey(reply, info),
      raw,
    };
  }

  // ─────────────────────────────────────────────
  // Gemini
  // ─────────────────────────────────────────────
  const GEMINI_PROMPT = `너는 크랙 AI 채팅용 작은 게임 HUD의 상태 추적기이자 로그 연출가다.
명시적인 INFO 라벨이나 별도 정보 블록이 없어도 최신 로그 자체를 읽고, 근거가 있는 현재 상태를 자발적으로 INFO로 정리한다. JSON만 반환한다. 마크다운, 백틱, 설명문 금지.

출력 JSON:
{
  "infoFound": false,
  "inferredPlayerName": "",
  "character": {"name":"","role":"","sourceText":""},
  "status": {"time":"","location":"","situation":"","goal":"","clothing":"","sourceText":""},
  "relations": [{"name":"","detail":"","sourceText":""}],
  "inventory": [{"name":"","icon":"","detail":"","sourceText":""}],
  "inferredStatus": {"character":"","location":"","situation":"","goal":""},
  "narrativeLogs": ["", ""],
  "relationshipDeltas": [{"name":"","delta":0,"label":"관계","memo":"이번 변화 근거"}],
  "hudComments": ["", "", ""],
  "sceneMood": "normal",
  "petLine": ""
}

LOG 문체 지침:
{{STYLE_PROMPT}}

INFO 자동 생성 규칙:
- INFO는 원문에 이미 존재하는 별도 코너를 복사하는 기능이 아니다. 최신 로그를 읽어 HUD의 현재 상태표를 스스로 만드는 기능이다.
- INFO/정보/인포 같은 라벨이 없어도 된다. LATEST_MESSAGE_RAW 전체를 먼저 읽고 현재 상태를 정리한다.
- RAW_INFO_BLOCK이 있으면 고신뢰 보조 근거로 사용하되, 그것이 없어도 INFO 생성을 시도한다.
- RAW_INFO_BLOCK의 위치는 앞·중간·뒤 어디든 가능하다. 위치만으로 우선순위를 정하지 않는다. 같은 최신 메시지 안에서 이후 서술이 상태 변화를 명확히 보여주면 최종 상태를 따른다.
- RECENT_CONTEXT는 최신 메시지만으로 생략된 주체·장소·상황을 보완할 때만 사용한다. 최신 메시지와 충돌하면 최신 메시지가 우선이다.
- CURRENT_INFO는 이전 누적 상태를 유지하기 위한 참고값이다. 새 근거 없이 CURRENT_INFO를 그대로 다시 출력하지 않는다.
- infoFound=true는 '원문에 INFO 라벨이 있었다'는 뜻이 아니라, 이번 로그에서 sourceText로 뒷받침되는 INFO 갱신값을 하나 이상 만들 수 있다는 뜻이다.
- character/status/relations/inventory는 구조화 블록뿐 아니라 일반 서술·대사·행동에서도 추출할 수 있다. 단, 원문 근거 없이 상상해서 채우지 않는다.
- 모든 새 character/status/relations/inventory 항목은 sourceText에 실제 근거가 되는 짧은 원문 조각을 넣는다. sourceText는 LATEST_MESSAGE_RAW, RAW_INFO_BLOCK 또는 RECENT_CONTEXT에 실제로 존재해야 한다.
- 서로 다른 status 필드가 서로 다른 문장에 근거하면 status.sourceText에 필요한 근거 조각을 짧게 이어 적어도 된다.
- time/location/situation/goal/clothing은 현재 시점 기준으로만 적는다. 과거 회상, 가정, 계획 속 장소를 현재 위치로 착각하지 않는다.
- relations는 실제 등장하거나 직접 언급된 사람/의인화 개체만 넣는다. 관계·감정·동행·대립 등 현재 관계를 근거 있는 범위에서 짧게 정리한다.
- inventory는 실제 소지·획득·장착·보유가 드러난 물건만 넣는다. 그냥 눈앞에 있거나 언급된 물건은 넣지 않는다.
- inventory.icon은 물건 의미에 맞는 이모지 1개를 고른다. 확실하지 않으면 빈 문자열.
- 삭제/상실/이탈/분실/소모가 최신 로그에 명시되면 해당 이름과 삭제 근거 sourceText를 출력해 갱신할 수 있게 한다.
- 애매한 항목은 억지로 채우지 말고 빈 값으로 둔다. '아마', '추정컨대' 같은 추측 문장을 INFO 값으로 만들지 않는다.
- 형식이 있는 정보 블록을 만나면 구획 표시(【】 《》 [] 〔〕 「」, ▶ ◆ ■ ● ☆, ━━ ── ===, # 머리말, 굵게 표시 등)와 키:값/키｜값/표/불릿을 의미 기준으로 읽는다. 라벨 이름 자체에 의존하지 않는다.

USER / CHAR 구분:
- USER는 이야기 속 플레이어 캐릭터이며, 사용자가 조종하는 시점 인물이다.
- CHAR는 AI가 연기하는 상대 캐릭터 또는 장면의 중심 캐릭터다.
- USER_NAME이 입력되어 있으면 USER 식별에는 USER_NAME을 최우선으로 사용한다.
- USER_NAME이 비어 있을 때만 최신 답변과 INFO 블록에서 USER 후보를 추론한다.
- USER는 대사·행동·묘사가 적어 눈에 덜 띌 수 있다. 등장 분량이 많다고 USER로 판단하지 않는다.
- AI 캐릭터(CHAR)가 장면에서 가장 두드러지더라도, 그 자체로 USER가 되지는 않는다.

character 필드:
- character는 현재 INFO의 기준이 되는 인물이다. USER_NAME이 있으면 USER를 우선 기준으로 삼는다.
- USER_NAME이 없으면 최신 로그에서 플레이어로 보이는 인물을 보수적으로 추론한다. USER가 전혀 식별되지 않고 CHAR의 상태만 확실하면 CHAR를 넣을 수 있다.
- 칭호나 소속 같은 짧은 수식은 role에 넣어도 된다.

relations 와 USER:
- relations는 character 외의 주요 인물(CHAR/NPC) 관계를 담는다.
- USER_NAME 본인은 relations에 넣지 않는다.
- USER_NAME 본인은 relationshipDeltas에도 넣지 않는다.
- USER와 CHAR가 모두 중요하게 등장하면, character에는 USER를 우선 두고 CHAR는 relations에 넣는다.
- 어느 칸에 넣을지 애매하면 relations에 억지로 넣지 않는다. 인물 정보가 확실할 때만 relations.
- 값이 숫자·%·게이지여도 새로 지어내지 말고 있는 그대로 detail 또는 해당 필드에 보존한다.
- 원문에 없는 항목은 만들지 않는다. character/status/relations/inventory의 모든 항목에는 sourceText에 근거 원문 한 줄을 넣고, sourceText가 없으면 그 항목을 만들지 않는다.
- 관계 인물은 반드시 한 명씩 분리한다. 한 줄에 여러 명이면 각각 별도 relation으로 나눈다.
- 예: "박뤼붕☀ #김뤼붕☀ 이뤼붕🙂 최뤼붕🙂" → 박뤼붕 / 김뤼붕 / 이뤼붕 / 최뤼붕 4명으로 분리한다.
- 여러 이름을 합쳐 하나의 name으로 만들지 않는다.
- 사람(또는 의인화된 개체) 이름만 relations에 넣는다. 장소명/소속명/능력명/아이템명/상태값은 relations에 넣지 않는다.
- 명시 INFO 블록이 없어도 최신 로그에서 관계나 소지 상태가 직접 드러나면 relations/inventory를 만들 수 있다.
- inferredStatus는 sourceText까지 확보하기 어려운 최소한의 character/location/situation/goal 보조값으로만 사용한다. sourceText가 있는 정식 INFO 필드를 만들 수 있으면 그쪽을 우선한다.

관계도 delta 규칙:
- relationshipDeltas는 하트 미터를 누적 변화시키는 용도다. value/percent를 새로 만들지 말고 delta만 작성한다.
- relationshipDeltas.name은 이번 출력의 relations 또는 CURRENT_INFO.relations/CURRENT_INFO.meters에 이미 존재하는 인물만 사용한다.
- 기존 관계 인물이 최신 장면에 등장했다면 관계 정보를 매번 relations에 반복 출력하지 않아도 delta를 줄 수 있다.
- 새 인물이라면 먼저 relations에 sourceText 근거와 함께 넣은 뒤 delta를 작성한다.
- 최신 답변에서 relations의 인물이 직접 등장하거나, 그 인물의 대사/행동/감정/관계 반응이 보이면 가능한 한 delta를 작성한다.
- 아주 작은 호감/흥미/안심/부드러움은 +1~+2.
- 설렘/포옹/키스/고백/구원/강한 집착/큰 감정 동요는 +3~+8.
- 거절/불신/두려움/위협/상처/갈등은 -1~-8.
- 변화가 애매하지만 장면에 직접 관련된 인물이라면 0 대신 +1, -1, +2, -2 같은 작은 delta를 우선 고려한다.
- 정말로 해당 인물이 최신 장면과 무관하거나 근거가 전혀 없을 때만 비운다.
- 모든 인물에게 억지로 delta를 주지 말고, 최신 장면과 관련 있는 1~4명만 고른다.
- CURRENT_METERS의 기존 value가 52처럼 고정되어 보여도, 이번 장면의 감정 변화가 있으면 반드시 0이 아닌 delta를 준다.
- delta는 -12~8 사이 정수만 사용한다.
- CURRENT_INFO는 이전에 저장된 누적 INFO다.
- 기존 INFO가 있으면 새 INFO는 전체 교체가 아니라 부분 갱신용이다.
- LATEST_MESSAGE_RAW/RAW_INFO_BLOCK/RECENT_CONTEXT에서 이번에 새로 확인되거나 변경된 항목만 character/status/relations/inventory에 넣는다. 일반 서술에서 직접 확인된 상태도 허용한다.
- 이번에 명시되지 않은 기존 관계/소지품/상태는 삭제하지 않는다.
- 관계 목록에서 오래 안 나온 인물도 계속 유지한다. 최신 장면에 안 나왔다는 이유만으로 relations에서 빼지 않는다.
- 소지품도 최신 INFO에 안 보인다는 이유만으로 제거하지 않는다.
- 삭제/상실/해제/종료/이탈/사망/분실/소모처럼 원문에 명시된 경우에만 제거 대상으로 판단한다.
- 제거가 필요한 경우에도 해당 인물/아이템 이름과 삭제 근거가 들어간 sourceText를 반드시 포함한다.
- 빈 문자열은 삭제 지시가 아니라 정보 없음이다. 정말 삭제해야 할 때만 sourceText에 삭제 근거를 넣는다.

LOG 규칙:
- narrativeLogs는 최신 답변을 3~6줄 작성한다.
- 각 줄은 반드시 ▶ 또는 ▷로 시작한다.
- 각 줄은 LOG 문체 지침을 지키며 18~30자 내외로 짧게 쓴다.
- 한 줄이 길어질 것 같으면 핵심 사건/감정만 남긴다.
- 원문 복사가 아니라 사건을 로그처럼 재해석한다.
- 구체적인 문체와 분위기는 LOG 문체 지침을 우선 따른다.
- inferredPlayerName은 USER_NAME이 비어 있을 때만 USER 후보를 적는 보조 필드다. USER_NAME이 있으면 inferredPlayerName은 USER_NAME과 같게 두거나 빈 문자열로 둔다.
- possiblePlayerNames는 USER 후보 목록일 뿐이며 USER_NAME보다 우선하지 않는다. USER_NAME이 있으면 비워도 된다.

장면 성향(sceneMood):
- sceneMood는 최신 답변 전체를 보고 이번 장면에서 가장 지배적인 정서 하나를 고른다.
- 반드시 love / happy / normal / sad / scared 중 하나만 출력한다.
- love: 연애 감정, 애정, 친밀감, 설렘이 장면의 중심이다.
- happy: 즐거움, 장난, 활기, 안도, 따뜻함이 장면의 중심이다.
- normal: 일상적·중립적·정보 중심이거나 어느 정서도 뚜렷하게 우세하지 않다.
- sad: 슬픔, 상실, 외로움, 후회, 고통이 장면의 중심이다.
- scared: 위협, 갈등, 공포, 긴장, 전투, 위험이 장면의 중심이다.
- 여러 정서가 섞였더라도 현재 장면의 중심 분위기를 가장 잘 대표하는 하나만 선택한다.
- 관계도 delta의 방향과 sceneMood는 별개다. 관계가 좋아져도 위험한 장면이면 scared가 될 수 있고, 관계 변화가 없어도 애정 장면이면 love가 될 수 있다.

HUD 코멘트:
- hudComments는 장면에 맞는 것만 1~3개 작성한다. 억지로 개수를 채우지 않는다.
- HUD가 옆에서 과몰입하며 주접떠는 느낌으로 짧게 쓴다.
- 최신 답변에 실제로 드러난 행동·대사·감정만 반응한다. 없는 선택지/전투/이벤트/게이지 변화 등을 실제 사건처럼 지어내지 않는다. 게임식 비유는 원문 사실을 바꾸지 않는 범위에서만 쓴다.
- 장면 감정에 맞춰 설렘/긴장/충격/귀여움/위험 신호를 반응하되, 매번 같은 템플릿처럼 쓰지 않는다.
- 너무 길게 설명하지 말고, 한 줄당 18~30자 정도로 톡 쏘게 쓴다.
- 말투는 게임 HUD + 옆자리 오타쿠 해설자 느낌이다.
- RECENT_HUD_COMMENTS와 같거나 비슷한 문장은 피한다.
- "심장 게이지", "치명타", "숨 참고 봄", "전투 BGM" 같은 고정 멘트를 반복하지 않는다.
- hudComments를 2개 이상 쓸 때는 그중 최소 1개가 최신 답변의 구체 행동/대사/사물/감정어를 반영해야 한다.
- 예시는 톤 참고용이며 그대로 복사하지 않는다. 장면마다 새 문장을 만든다.

펫 대사(petLine):
- petLine은 다마고치 펫이 주인에게 거는 한마디다.
- 최신 장면에 대한 펫의 한마디를 짧게 쓴다. 보통 20자 안팎이며, 잡학 한마디가 필요한 부엉이는 사실 전달에 필요한 범위에서 35자 안팎까지 허용한다.
- 반말/존댓말, 어휘, 말버릇은 반드시 PET_CONTEXT를 최우선으로 따른다. PET_CONTEXT가 존댓말을 지정하면 존댓말을 쓴다.
- 부엉이처럼 잡학을 요구하는 PET_CONTEXT에서는 최신 장면의 실제 소재와 직접 관련된, 확실히 아는 사실만 1개 짧게 말한다. 확실하지 않은 사실이나 세계관 고유설정은 지어내지 않는다.
- 성숙기/완전체는 확정진화형 말투 기준이다. 완전체라면 PET_CONTEXT의 깊어진 유대와 시그니처 성격을 더 선명하게 반영한다.
- petLine에는 화면, 로그, HUD, 버튼, 아이콘, 버프, 스탯, 루트, 이벤트, 저장 등 시스템·인터페이스를 직접 인식하는 메타 표현을 쓰지 않는다.
- HUD 해설자가 아니라 펫 본인이 주인에게 말하는 한마디로 쓴다.


RECENT_HUD_COMMENTS:
{{RECENT_HUD_COMMENTS}}

PET_CONTEXT:
{{PET_CONTEXT}}

USER_NAME:
{{USER_NAME}}

POSSIBLE_PLAYER_NAMES:
{{POSSIBLE_PLAYER_NAMES}}

CURRENT_INFO:
{{CURRENT_INFO}}

CURRENT_METERS:
{{CURRENT_METERS}}

주의:
- LATEST_MESSAGE_RAW가 이번 턴의 원본 전체다. INFO 자동 생성은 이 값을 가장 먼저 읽는다.
- LATEST_REPLY는 자동 감지기가 정보성 블록을 덜어낸 서술부 후보일 뿐이며, 잘못 잘렸을 가능성이 있으므로 LATEST_MESSAGE_RAW와 함께 확인한다.
- RAW_INFO_BLOCK 역시 자동 감지기의 보조 후보다. 비어 있어도 정상이며, 비어 있다는 이유로 INFO 생성을 포기하지 않는다.
- CURRENT_INFO와 CURRENT_METERS는 이전 누적값이다. 그대로 반복하지 말고 이번 로그에서 새로 확인되거나 바뀐 것만 출력한다.
- relationshipDeltas는 CURRENT_METERS를 복사하지 말고 이번 장면 때문에 변한 양만 적는다.
- 제거/상실/종료/사망/분실/소모는 반드시 최신 원문 근거가 있을 때만 반영한다.

LATEST_MESSAGE_RAW:
{{LATEST_MESSAGE_RAW}}

RAW_INFO_BLOCK (optional helper):
{{RAW_INFO_BLOCK}}

LATEST_REPLY (narrative helper):
{{LATEST_REPLY}}

RECENT_CONTEXT:
{{RECENT_CONTEXT}}
`;


  function stripJsonFence(raw) {
    return String(raw || '').trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  function parseGeminiJson(raw) {
    const text = stripJsonFence(raw);

    try {
      return JSON.parse(text);
    } catch (err) {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(text.slice(first, last + 1));
        } catch (_) {}
      }
      throw err instanceof Error ? err : new Error('JSON parse failed');
    }
  }

  function buildGeminiJsonRepairPrompt(brokenJson) {
    return `아래 텍스트는 JSON 문법이 깨진 응답이다.
내용을 새로 쓰거나 요약하지 말고, 문법만 고쳐서 유효한 JSON 객체 하나만 출력해라.
설명, 마크다운, 코드블록 금지. JSON 외의 글자 금지.
누락된 쉼표/괄호/따옴표만 보정하고, 확실하지 않은 깨진 마지막 항목은 안전하게 제거해도 된다.

BROKEN_JSON:
${String(brokenJson || '').slice(0, 14000)}`;
  }

  function buildGeminiJsonRepairGenerationConfig(model) {
    const normalized = normalizeGeminiModelId(model);
    const config = {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    };

    // 2.5 Flash 계열은 JSON 복구 요청만큼은 thinking을 꺼서 형식 안정성을 우선한다.
    if (normalized === 'gemini-2.5-flash' || normalized === 'gemini-2.5-flash-lite') {
      config.thinkingConfig = { thinkingBudget: 0 };
    }

    if (isGemini3xFlashModel(normalized)) {
      delete config.temperature;
      config.thinkingConfig = { thinkingLevel: 'low' };
    }

    return config;
  }

  async function repairGeminiJsonResponse(geminiRequest, rawText, parseError) {
    const repairPayload = {
      contents: [{ role: 'user', parts: [{ text: buildGeminiJsonRepairPrompt(rawText) }] }],
      generationConfig: buildGeminiJsonRepairGenerationConfig(geminiRequest.model),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    if (geminiRequest?.provider === 'deepseek') {
      repairPayload._cighDeepSeekThinkingOverride = 'disabled';
    }

    const repairBody = await requestGeminiGenerateContent(geminiRequest, repairPayload);
    const repairUsageTokens = extractNormalizedUsage(repairBody, geminiRequest);
    if (repairUsageTokens) addUsageNormalized(repairUsageTokens);

    const repairText = extractTextFromGeminiResponseData(repairBody);
    if (!repairText) throw new Error(`JSON 복구 실패: ${repairBody?.candidates?.[0]?.finishReason || 'EMPTY'}`);

    try {
      const parsed = parseGeminiJson(repairText);
      return parsed;
    } catch (repairErr) {
      throw new Error(`JSON 파싱 실패: ${String(parseError?.message || parseError || '응답 JSON이 깨졌어요.')}`);
    }
  }

  async function callGemini(latestReply, context, rawInfoBlock, fallbackInfoData, beforeData, latestRaw = latestReply) {
    try {
      const geminiRequest = getGeminiGenerateContentRequestConfig();
      if (!geminiRequest) throw new Error('Gemini/Firebase 설정을 찾지 못했어요.');

      const userName = getRoomUserName();
      const userKey = relationKey(userName);

      const currentMeters = (beforeData?.affection || beforeData?.relationshipMeters || [])
        .map(m => normalizeMeter(m, 50))
        .filter(m => isValidRelationName(m.name))
        .filter(m => !userKey || relationKey(m.name) !== userKey)
        .map(m => ({ name: m.name, value: m.value, label: m.label, memo: m.memo }));

      const possiblePlayerNames = userName
        ? []
        : [
          ...new Set([
            ...(fallbackInfoData?.possiblePlayerNames || []),
            ...extractPossiblePlayerNames(rawInfoBlock || ''),
            ...extractPossiblePlayerNames(latestReply || ''),
          ])
        ].filter(isPossiblePlayerName).slice(0, 8);

      const petNow = getPet(getRoom());
      const petDisplayType = getPetDisplayFinalType(petNow);
      const petStageObj = petStageFromLevel(petNow.level);
      const petPromptKey = isEggStagePet(petNow) ? 'egg' : isPreFinalSlimePet(petNow) ? 'slime' : petDisplayType;
      const petContext = JSON.stringify({
        key: petPromptKey,
        성향: isEggStagePet(petNow) ? '알' : isPreFinalSlimePet(petNow) ? '말랑 슬라임' : (PET_TENDENCY_LABEL[petDisplayType] || PET_TENDENCY_LABEL.peace),
        말투: getPetPromptGuide(petNow),
        단계: petStageObj.name,
        기분: petNow.mood,
        레벨: petNow.level,
      });

      const recentHudComments = getRecentHudCommentTexts(18);
      const currentInfo = summarizeCurrentInfoForPrompt(beforeData || makeEmptyData());

      const prompt = GEMINI_PROMPT
        .replace('{{STYLE_PROMPT}}', getStylePrompt().slice(0, 1800))
        .replace('{{RECENT_HUD_COMMENTS}}', JSON.stringify(recentHudComments).slice(0, 1200))
        .replace('{{PET_CONTEXT}}', petContext.slice(0, 650))
        .replace('{{USER_NAME}}', String(userName || ''))
        .replace('{{POSSIBLE_PLAYER_NAMES}}', JSON.stringify(possiblePlayerNames).slice(0, 1200))
        .replace('{{CURRENT_INFO}}', JSON.stringify(currentInfo).slice(0, 4200))
        .replace('{{CURRENT_METERS}}', JSON.stringify(currentMeters).slice(0, 2400))
        .replace('{{LATEST_MESSAGE_RAW}}', String(latestRaw || latestReply || '').slice(-15000))
        .replace('{{RAW_INFO_BLOCK}}', String(rawInfoBlock || '').slice(-9000))
        .replace('{{LATEST_REPLY}}', latestReply.slice(-12000))
        .replace('{{RECENT_CONTEXT}}', context.slice(-3600));

      const payload = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: buildGeminiGenerationConfig(geminiRequest.model, {
          temperature: 0.62,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        }),
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      };

      const body = await requestGeminiGenerateContent(geminiRequest, payload);
      const usageTokens = extractNormalizedUsage(body, geminiRequest);
      if (usageTokens) addUsageNormalized(usageTokens);

      const rawText = extractTextFromGeminiResponseData(body);
      if (!rawText) throw new Error(body?.candidates?.[0]?.finishReason || 'EMPTY');

      let parsedRaw;
      const finishReason = String(body?.candidates?.[0]?.finishReason || '').toLowerCase();
      try {
        if (finishReason === 'length') {
          throw new Error('finish_reason=length: JSON 응답이 길이 제한으로 잘렸어요.');
        }
        parsedRaw = parseGeminiJson(rawText);
      } catch (parseErr) {
        console.warn('[Crack INFO Game HUD] AI JSON parse failed. Trying one-shot repair.', parseErr);
        parsedRaw = await repairGeminiJsonResponse(geminiRequest, rawText, parseErr);
      }

      const parsed = sanitizeAi(parsedRaw);
      parsed._usageTokens = usageTokensForPet(usageTokens);
      return parsed;
    } catch (err) {
      const message = String(err?.message || err || '알 수 없는 오류').replace(/\s+/g, ' ').trim();
      const providerLabel = getProviderLabel(getGeminiProvider());
      console.warn('[Crack INFO Game HUD] AI provider call failed:', err);
      throw new Error(`${providerLabel} 호출 실패: ${message || '응답을 읽지 못했어요.'}`);
    }
  }

  function sanitizeAi(raw) {
    const d = makeEmptyData();

    d._fromGeminiInfo = true;

    d.narrativeLogs = Array.isArray(raw?.narrativeLogs)
      ? raw.narrativeLogs.map(normalizeGameLine).filter(Boolean).slice(0, 8)
      : [];

    d.inferredPlayerName = isPossiblePlayerName(raw?.inferredPlayerName) ? relationKey(raw.inferredPlayerName) : '';

    const character = raw?.character || {};
    const status = raw?.status || {};

    if (hasSourceText(character)) {
      d.character = cleanOptionalValue(character.name);
      if (character.role) d.stats.push({ name: 'ROLE', value: cleanOptionalValue(character.role) });
    }

    if (hasSourceText(status)) {
      d.time = cleanOptionalValue(status.time);
      d.location = cleanOptionalValue(status.location);
      d.situation = cleanOptionalValue(status.situation);
      d.goal = cleanOptionalValue(status.goal);
      d.clothing = cleanOptionalValue(status.clothing);
      d._seen.status = !!(d.time || d.location || d.situation || d.goal || d.clothing);
    }

    d.relations = Array.isArray(raw?.relations)
      ? raw.relations
          .filter(hasSourceText)
          .map(r => normalizeRelation({
            name: r.name,
            detail: r.detail,
            moodEmoji: r.moodEmoji,
            type: '관계',
            sourceText: r.sourceText || r.source || r.evidence,
          }))
          .filter(r => isValidRelationName(r.name))
          .slice(0, 16)
      : [];

    d.inventory = Array.isArray(raw?.inventory)
      ? raw.inventory
          .filter(hasSourceText)
          .map(item => normalizeInventoryItem({
            name: item.name,
            detail: item.detail,
            icon: item.icon,
            sourceText: item.sourceText || item.source || item.evidence,
          }))
          .filter(item => item.name)
          .slice(0, 24)
      : [];

    d._seen.relations = d.relations.length > 0;
    d._seen.inventory = d.inventory.length > 0;

    const hasGroundedInfo = !!(
      d.character || d.time || d.location || d.situation || d.goal || d.clothing ||
      d._seen.relations || d._seen.inventory || d.stats.length
    );
    d._infoFound = !!raw?.infoFound || hasGroundedInfo;

    const inferred = raw?.inferredStatus || {};
    if (!hasGroundedInfo) {
      d.character = cleanOptionalValue(inferred.character || d.inferredPlayerName);
      d.location = cleanOptionalValue(inferred.location);
      d.situation = cleanOptionalValue(inferred.situation);
      d.goal = cleanOptionalValue(inferred.goal);
      d._inferredStatus = !!(d.character || d.location || d.situation || d.goal);
    } else {
      d._inferredStatus = false;
    }

    d.relationshipDeltas = Array.isArray(raw?.relationshipDeltas)
      ? raw.relationshipDeltas.map(normalizeDelta).filter(Boolean).slice(0, 12)
      : [];

    d.relationshipMeters = [];
    d.affection = [];

    d.hudComments = Array.isArray(raw?.hudComments)
      ? raw.hudComments.map(x => normalize(x)).filter(Boolean).slice(0, 3)
      : [];
    d.sceneMood = normalizeSceneMood(raw?.sceneMood, 'normal');
    d.petLine = shortText(raw?.petLine, 40);

    return sanitizeData(d);
  }

  function getRecentHudCommentTexts(limit = 18) {
    const room = getRoom();
    const fromLog = (room.commentLog || []).flatMap(c => Array.isArray(c?.comments) ? c.comments : [c?.text || c]);
    const fromHistory = (room.history || []).slice(-12).flatMap(h => Array.isArray(h?.comments) ? h.comments : []);
    return [...fromLog, ...fromHistory].map(x => normalize(x)).filter(Boolean).slice(-limit);
  }

  function hudCommentKey(value) {
    return normalize(value).replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 30);
  }

  function pickHudComments(pool, text, limit = 3) {
    const recent = new Set(getRecentHudCommentTexts(18).map(hudCommentKey).filter(Boolean));
    const seed = parseInt(hashTiny(`${text}:${Date.now()}`), 36) || 0;
    const out = [];

    for (let pass = 0; pass < 2 && out.length < limit; pass++) {
      for (let i = 0; i < pool.length && out.length < limit; i++) {
        const line = pool[(seed + i) % pool.length];
        const key = hudCommentKey(line);
        if (!key || out.some(x => hudCommentKey(x) === key)) continue;
        if (pass === 0 && recent.has(key)) continue;
        out.push(line);
      }
    }

    return out.slice(0, limit);
  }

  function makeFallbackHudComments(text) {
    const t = normalize(text);
    let pool;

    if (/고백|좋아해|사랑|키스|입맞|포옹|안아|끌어안|설렘|두근|심장/.test(t)) {
      pool = [
        '방금 감정선 너무 가까운데?', '대사 온도 갑자기 올라감.', '지금 거리감 꽤 가까워졌다.',
        '아니 분위기 왜 이렇게 진해?', '방금 말투 완전 반칙임.', '둘 사이 공기 바뀌었다.',
        '저 반응은 그냥 못 지나치지.', '시선 한 번에 분위기 바뀜.', '말보다 반응이 더 큰데?',
      ];
    } else if (/눈물|울|흐느|상처|아파|버림|외로|무너|슬픔|비참/.test(t)) {
      pool = [
        '아니 마음에 금 갔는데?', '장면 온도가 너무 차다.', '방금 감정 데미지 큼.',
        '공기부터 축축해졌다.', '마음 한쪽이 푹 꺼짐.', '저 말은 오래 남겠다.',
        '분위기가 한순간 가라앉음.', '표정 하나가 너무 무겁다.', '이 장면 여운 세다.',
      ];
    } else if (/분노|화났|소리|외쳤|위협|죽|피|공포|두려|긴장|위험/.test(t)) {
      pool = [
        '위험 수치가 훅 뛰었다.', '공기가 바로 살벌해짐.', '방금 장면 압박감 뭐임.',
        '이건 안전거리 필요함.', '말 한마디가 날카롭다.', '분위기가 순식간에 얼었다.',
        '저 반응은 경계해야 함.', '지금 공기 장난 아니다.', '긴장이 확 올라왔다.',
      ];
    } else if (/웃|미소|다정|부드럽|귀엽|장난|간질|놀리|안심/.test(t)) {
      pool = [
        '아니 이건 좀 귀엽다.', '공기가 말랑해졌다.', '방금 분위기 너무 순함.',
        '이 장면 힐링 수치 높다.', '장난기가 귀엽게 튀었다.', '말투가 꽤 부드러운데?',
        '표정 하나로 분위기 풀림.', '저 반응 은근 귀엽다.', '긴장이 살짝 녹았다.',
      ];
    } else {
      pool = [
        '장면이 조용히 방향 튼다.', '상황이 한 칸 진행됐다.', '이 흐름 기억해둬야 함.',
        '분위기가 미묘하게 움직임.', '다음 대사가 중요해 보임.', '판이 살짝 깔렸다.',
        '방금 반응은 기억해둘 만함.', '말 사이 공기가 조금 달라졌다.', '흐름이 은근히 바뀌는 중.',
      ];
    }

    return pickHudComments(pool, t);
  }

  function diversifyHudComments(comments, latestReply) {
    const recent = new Set(getRecentHudCommentTexts(18).map(hudCommentKey).filter(Boolean));
    const out = [];

    for (const raw of Array.isArray(comments) ? comments : []) {
      const line = shortText(raw, 42);
      const key = hudCommentKey(line);
      if (!line || !key || recent.has(key) || out.some(x => hudCommentKey(x) === key)) continue;
      out.push(line);
      if (out.length >= 3) break;
    }

    // AI가 장면에 맞는 코멘트를 하나라도 줬다면 개수를 억지로 3개까지 채우지 않는다.
    // 전부 비었거나 중복으로 제거된 경우에만 로컬 안전문구 1개를 보충한다.
    if (!out.length) {
      const fallback = makeFallbackHudComments(latestReply).find(line => {
        const key = hudCommentKey(line);
        return key && !recent.has(key);
      }) || makeFallbackHudComments(latestReply)[0];
      if (fallback) out.push(fallback);
    }

    return out.slice(0, 3);
  }


  function normalizeGameLine(line) {
    let text = normalize(fixParticlePlaceholders(line));
    if (!text) return '';
    text = text.replace(/^[▸>\-•*└]+\s*/, '');
    if (!/^[▶▷◇]/.test(text)) text = `▶${text}`;
    return shortText(text, 86);
  }

  // ─────────────────────────────────────────────
  // Analysis
  // ─────────────────────────────────────────────
  async function analyzeLatest(force = false, target = null) {
    const requestRoomKey = roomKey();
    const requestEpoch = cighAnalysisEpoch;
    const requestValid = () => roomKey() === requestRoomKey && requestEpoch === cighAnalysisEpoch;
    if (analyzeBusy) return;
    analyzeBusy = true;
    playBeep('analyze');

    try {
      const found = target || findLatestContext();

      if (!found) {
        pushLog(['▶읽을 채팅을 찾지 못했다!']);
        showPopup(['▶읽을 채팅을 찾지 못했다!']);
        return;
      }

      const room = getRoom();
      const previousPetLastFedAt = Number(getPet(room).lastFedAt || 0);

      const analyzedContentKeys = Array.isArray(room.analyzedContentKeys) ? room.analyzedContentKeys : [];
      const alreadyAnalyzed = hasShopReward(room, found) || room.lastAnalyzedKey === found.key ||
        room.lastAnalyzedContentKey === found.contentKey ||
        analyzedContentKeys.includes(found.contentKey);

      if (!force && alreadyAnalyzed) {
        pushLog(['▷이미 읽은 로그다!']);
        showPopup(['▷이미 읽은 로그다!']);
        return;
      }


      stopFooterComments({ hideComment: true });
      const provider = getGeminiProvider();
      const ready = isSelectedProviderReady(provider);
      setFooter(ready ? '로그 정리 중…' : 'API 설정 필요');

      const before = currentData || room.data || null;
      const fallbackInfoData = parseInfoDeterministic(found.infoText);
      const aiData = await callGemini(found.latestReply, found.context, found.infoText, fallbackInfoData, before, found.raw);
      if (!requestValid()) return;
      const infoData = aiData._fromGeminiInfo ? aiData : fallbackInfoData;
      const merged = mergeData(before, infoData, aiData);
      merged._usageTokens = aiData?._usageTokens || null;
      merged.hudComments = diversifyHudComments(merged.hudComments, found.latestReply);

      if ((infoData.relations || []).length && !(aiData.relationshipDeltas || []).length) {
        console.debug('[Crack INFO Game HUD] Gemini returned no relationshipDeltas for current relations.', {
          relations: infoData.relations,
          currentMeters: before?.affection || before?.relationshipMeters || [],
        });
      }

      let earnedReward = false;

      let petEvent = null;
      let petLineForMascot = '';
      let petMilestoneLineForMascot = '';
      let favChangedForAchv = false;
      const analysisAt = Date.now();
      await withShopLock(() => commitShopRoom(requestRoomKey, (next, shop) => {
        if (!requestValid()) throw new Error("분석 도중 방 또는 저장 데이터가 바뀌었어요.");
        earnedReward = !hasShopReward(next, found);
        if (earnedReward) {
          markShopReward(next, found);
          rbCreditAnalysisCoin(shop);
        }
        const { _usageTokens: _omitUsage, ...storedData } = merged;
        next.data = storedData;
        next.lastAnalyzedKey = found.key;
        next.lastAnalyzedContentKey = found.contentKey;
        next.analyzedContentKeys = [
          ...(Array.isArray(next.analyzedContentKeys) ? next.analyzedContentKeys : []).filter(k => k && k !== found.contentKey),
          found.contentKey,
        ].slice(-8);
        next.analyzeCount = Number(next.analyzeCount || 0) + (earnedReward ? 1 : 0);
        if (!(Number(next.firstAnalyzedAt || 0) > 0)) {
          const knownFirst = getRoomFirstAnalyzedAt(next);
          next.firstAnalyzedAt = knownFirst > 0 ? knownFirst : analysisAt;
        }
        next.lastAnalyzedAt = analysisAt;
        const roomLabel = getCurrentRoomDisplayName();
        if (roomLabel) next.roomLabel = roomLabel;
        if (merged.hudComments?.length) {
          next.commentLog = next.commentLog || [];
          next.commentLog.push({
            id: `hud_${analysisAt}_${Math.random().toString(36).slice(2, 6)}`,
            at: analysisAt,
            comments: merged.hudComments.slice(0, 3),
            text: merged.hudComments[0],
            time: nowTime(),
          });
          next.commentLog = next.commentLog.slice(-30);
        }
        next.history = Array.isArray(next.history) ? next.history : [];
        next.history.push({
          at: analysisAt,
          time: nowTime(),
          logs: merged.narrativeLogs,
          comments: merged.hudComments,
        });
        next.history = next.history.slice(-80);
        next.pet = getPet(next);
        const prevFavForAchv = getFavoriteCharacter(next.pet);
        petEvent = earnedReward ? growPet(next, merged) : null;
        const newFavForAchv = getFavoriteCharacter(next.pet);
        favChangedForAchv = !!(prevFavForAchv && newFavForAchv && prevFavForAchv !== newFavForAchv);
        petMilestoneLineForMascot = milestoneMascotLine(next.pet);
        const line = isEggStagePet(next.pet)
          ? petEggLineLocal(next.pet)
          : (String(aiData.petLine || '').trim() || petSpeakLocal(next.pet));
        if (line) {
          next.pet.lastLine = line;
          next.pet.lastLineAt = Date.now();
          petLineForMascot = line;
        }
      }));
      if (!requestValid()) return;
      currentData = merged;
      if (earnedReward) syncPetGrowthAchievements(getPet());

      const decoTicketGain = earnedReward ? awardDecoLogCredit(1) : 0; // 배포판: 로그 조사 1회 = 1로그 크레딧
      if (decoTicketGain) pushLog([`▷꾸밈티켓 +${decoTicketGain}!`]);

      // [업적] 분석 1회 안에서 발생하는 여러 카운터 변경은 배치로 묶어 localStorage 쓰기를 1회로 줄인다.
      if (earnedReward) withAchvBatch(() => {
        // [업적] 분석/시간대/델타/폭풍몰입 카운터
        bumpAchvCounter('analyzeTotal', 1);
        const narrativeCount = (merged.narrativeLogs || []).map(normalizeGameLine).filter(Boolean).length;
        if (narrativeCount) bumpAchvCounter('narrativeLogLines', narrativeCount);
        const hourCounter = hourBucketCounter();
        if (hourCounter) bumpAchvCounter(hourCounter, 1);
        {
          const deltas = merged.relationshipDeltas || [];
          const bigPos = deltas.filter(d => Number(d.delta) >= 6).length;
          const neg = deltas.filter(d => Number(d.delta) <= -5).length;
          const bigNeg = deltas.filter(d => Number(d.delta) <= -8).length;
          if (bigPos) bumpAchvCounter('bigPosDelta', bigPos);
          if (neg) bumpAchvCounter('negDelta', neg);
          if (bigNeg) bumpAchvCounter('bigNegDelta', 1, true);
          const meterMaxHit = (merged.affection || []).some(m => clamp(normalizeMeter(m, 50).value, 0, 100) >= 100);
          if (meterMaxHit) bumpAchvCounter('meterMax', 1);
        }
        registerStormWindow();

        // [업적] 성향/관계수/먹이기/파국/밤샘흔적
        bumpAchvCounter('feedTotal', 1);
        {
          const petForAchv = getPet();
          const moodCounterKey = {
            love: 'moodHeart', happy: 'moodBloom', normal: 'moodPeace', sad: 'moodTear', scared: 'moodBlade',
          }[petForAchv.mood];
          if (moodCounterKey) bumpAchvCounter(moodCounterKey, 1);
        }
        {
          const relCount = (merged.affection || []).filter(m => isValidRelationName(normalizeMeter(m, 50).name)).length;
          if (relCount >= 5) bumpAchvCounter('relations5', 1, true);
          if (relCount >= 10) bumpAchvCounter('relations10', 1, true);
        }
        {
          const meterZeroHit = (merged.affection || []).some(m => clamp(normalizeMeter(m, 50).value, 0, 100) <= 0);
          if (meterZeroHit) bumpAchvCounter('meterZero', 1, true);
        }
        registerDayPhase();

        // [업적 추가] 자정/인벤/외길/변심/streak
        if (new Date().getHours() === 0) bumpAchvCounter('midnight', 1, true);
        if ((merged.inventory || []).length >= 5) bumpAchvCounter('invRich', 1, true);
        {
          const maxAff = Math.max(0, ...Object.values(getPet().charAffinity || {}).map(v => Number(v) || 0));
          if (maxAff >= 60) bumpAchvCounter('singleBond', 1, true);
        }
        if (favChangedForAchv) bumpAchvCounter('favChange', 1, true);
        registerVisitStreak();
        registerComboStreak(previousPetLastFedAt);

        // [업적 추가분] 무지개·주말·단골·외사랑
        registerRainbowDay(getPet().mood);
        {
          const day = new Date().getDay();
          if (day === 0 || day === 6) bumpAchvCounter('weekendAnalyze', 1);
        }
        registerRoomRegular(getAnalyzeCount());
        registerRoomAgeAchievement(getRoom());
        registerRoomCoverageAchievements();
        registerOneSidedLove(getPet(), merged.affection || merged.relationshipMeters || []);
        registerPetFavoriteMeter100(getPet(), merged.affection || merged.relationshipMeters || []);
        registerRelationshipPatternAchievements(getPet(), merged.affection || merged.relationshipMeters || []);
      });

      announceAchvUnlocks();

      announcePetEvent(petEvent);

      // [DIARY] 오늘 일기 누적
      if (earnedReward) {
        const evolveEvt = (Array.isArray(petEvent) ? petEvent : []).find(e => e?.type === 'evolve');
        let evolvedTo = '';
        if (evolveEvt) {
          const st = PET_STAGES.find(s => s.stage === evolveEvt.stage);
          evolvedTo = evolveEvt.stage >= 4
            ? (PET_FINAL_FORMS[evolveEvt.finalType]?.name || st?.name || '')
            : (st?.name || '');
        }
        const levelUps = (Array.isArray(petEvent) ? petEvent : []).filter(e => e?.type === 'level').length;
        const petForDiary = getPet();
        recordPetDiary({
          mood: petForDiary.mood,
          fav: getFavoriteCharacter(petForDiary),
          tickets: decoTicketGain,
          levelUps,
          evolvedTo,
          rainbow: !!Number(readAchvState().counters.moodRainbowDay) && (() => {
            const today = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
            const rd = readAchvState().rainbowDay;
            return !!(rd && rd.date === today && ['love','happy','normal','sad','scared'].every(m => rd.seen?.[m]));
          })(),
        });
      }

      if (shouldShowMascot()) {
        const petNow = getPet();
        const deltaSumForMascot = (merged.relationshipDeltas || []).reduce((sum, d) => sum + Math.abs(Number(d.delta) || 0), 0);
        updateMascotSprite();
        triggerMascotMood(petNow.mood, deltaSumForMascot);

        if (isEggStagePet(petNow)) {
          if (petLineForMascot) mascotSay(petLineForMascot, 90, { allowEgg: true, allowSleeping: true, durationMs: MASCOT_API_LINE_SPEECH_MS });
        } else {
          // API가 만든 petLine은 PET 탭에 저장되는 핵심 한마디라,
          // 관계/콤보/일반 멘트보다 우선해서 마스코트 머리 위에 표시한다.
          if (petLineForMascot) mascotSay(petLineForMascot, 90, { allowSleeping: true, durationMs: MASCOT_API_LINE_SPEECH_MS });

          const relationLine = relationMascotLine(merged.relationshipDeltas || [], petNow);
          if (relationLine) mascotSay(relationLine, 70);
          if (petMilestoneLineForMascot) mascotSay(petMilestoneLineForMascot, 60);
          const comboLine = comboMascotLine(previousPetLastFedAt, petNow);
          if (comboLine) mascotSay(comboLine, 45);
        }

      }

      const eventLines = (merged.narrativeLogs || []).map(normalizeGameLine).filter(Boolean).slice(0, 8);
      const entries = ['─'.repeat(22), `[${nowTime()}]`, ...eventLines];

      pushLog(entries);
      showPopup(eventLines);
      startFooterComments(merged.hudComments, { popup: true });
      if (!merged.hudComments.length) setFooter(`LOG ${nowTime()}`);

      updateAnalyzeCountLabel();
      playBeep('done');
      renderContent();
    } catch (err) {
      if (!requestValid()) return;
      playBeep('error');
      const message = String(err?.message || err || '알 수 없는 오류').replace(/\s+/g, ' ').trim();
      console.error('[Crack INFO Game HUD] analyzeLatest failed:', err);
      setFooter('분석 / 저장 오류');
      pushLog([
        '▶분석 또는 저장에 실패했다!',
        `▷${shortText(message || '설정 또는 콘솔을 확인해줘.', 150)}`,
      ]);
      showPopup([
        '▶API 호출 실패!',
        '▷설정값이나 콘솔 로그를 확인해줘.',
      ]);
    } finally {
      analyzeBusy = false;
    }
  }



  function getGenerateDoneWindow() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow?.document === document) return unsafeWindow;
    } catch (_) {}
    return window;
  }

  function watchAutoAnalyze() {
    // 크랙의 generate_done은 페이지 본문 window의 dataLayer로 흐른다.
    // push를 가로채지 않고, unsafeWindow.dataLayer 길이만 짧게 폴링한다.
    // DOM 전체 감시보다 훨씬 가볍고, GTM push 참조 꼬임도 피한다.
    const eventWindow = getGenerateDoneWindow();
    if (eventWindow.__cighGenerateDonePollOnlyStarted) return;
    eventWindow.__cighGenerateDonePollOnlyStarted = true;

    startGenerateDonePoll();
  }

  function getGenerateDoneEventName(entry) {
    if (!entry) return '';

    // 형태1: ['event', 'generate_done', ...]
    // 형태2: Arguments(3) {0:'event', 1:'generate_done', 2:{...}}
    // 형태3: { event: 'generate_done', ... }
    if ((Array.isArray(entry) || typeof entry.length === 'number') && entry[0] === 'event') {
      return String(entry[1] || '');
    }
    return String(entry?.event || '');
  }

  function isGenerateDoneEntry(entry) {
    return /^generate_done$/i.test(getGenerateDoneEventName(entry));
  }

  function getGenerateDoneEntryKey(entry) {
    try {
      const meta = ((Array.isArray(entry) || typeof entry.length === 'number') && entry[0] === 'event')
        ? entry[2]
        : entry;
      const msgId = meta?.msg_id || meta?.fe_msg_id || meta?.message_id || meta?.id || '';
      const chatId = meta?.chat_id || meta?.episode_id || '';
      if (msgId) return `${chatId}::${msgId}`;
    } catch (_) {}
    return `time::${Math.floor(Date.now() / 1500)}`;
  }

  function handleGenerateDoneEntry(entry) {
    if (!isGenerateDoneEntry(entry)) return false;

    const eventWindow = getGenerateDoneWindow();
    const key = getGenerateDoneEntryKey(entry);
    if (typeof entry === 'object' && entry !== null) {
      if (shopSeenEntries.has(entry)) return true;
      shopSeenEntries.add(entry);
    }
    if (!key.startsWith('time::') && eventWindow.__cighLastGenerateDoneKey === key) return true;
    eventWindow.__cighLastGenerateDoneKey = key;

    onGenerateDoneSignal(entry);
    return true;
  }

  function startGenerateDonePoll() {
    const eventWindow = getGenerateDoneWindow();
    let previousLayer = eventWindow.dataLayer;
    eventWindow.__cighDataLayerSeenLen = Array.isArray(previousLayer) ? previousLayer.length : 0;
    clearInterval(eventWindow.__cighGenerateDonePollTimer);
    eventWindow.__cighGenerateDonePollTimer = setInterval(() => {
      try {
        const layer = eventWindow.dataLayer;
        if (!Array.isArray(layer)) return;
        let seen = Number(eventWindow.__cighDataLayerSeenLen || 0);
        if (layer !== previousLayer || layer.length < seen) seen = 0;
        previousLayer = layer;
        for (let i = seen; i < layer.length; i++) handleGenerateDoneEntry(layer[i]);
        eventWindow.__cighDataLayerSeenLen = layer.length;
      } catch (error) { console.debug('[CIGH] completion poll', error); }
    }, 400);
  }

  function onGenerateDoneSignal(entry) {
    if (isEpisodePath()) {
      const recordState = readCrackRecordState();
      const stale = Date.now() - Number(recordState.lastSyncAt || 0) >= CRACK_RECORD_SYNC_TTL;
      if (recordState.historyInitialized && (stale || (activeTab === 'achv' && recordSubTab === 'record'))) {
        clearTimeout(crackRecordEventSyncTimer);
        crackRecordEventSyncTimer = setTimeout(() => syncCrackRecord(), 1400);
      }
    }
    if (!isAutoAnalyzeEnabled() || !isEpisodePath()) return;
    // 생성 완료 직후 DOM이 최종 텍스트로 정리될 약간의 여유만 준다.
    queueShopAnalysis(entry);
  }

  // ─────────────────────────────────────────────
  // Log / popup / footer comments
  // ─────────────────────────────────────────────
  function pushLog(lines) {
    const normalized = (lines || []).filter(Boolean).map(String);
    if (!normalized.length) return;

    logQueue = [];
    isLogTyping = false;

    logLines.push(...normalized);
    if (logLines.length > 90) logLines = logLines.slice(-90);

    flushLog();
    queueRoomLogSave();
  }

  function renderLogLineNode(line, index, total) {
    const row = document.createElement('div');
    row.style.opacity = Math.max(0.32, (index + 1) / Math.max(1, total)).toFixed(2);
    row.textContent = normalizeGameLine(line);
    return row;
  }

  function rbLegacy_flushLog(options = {}) {
    const el = document.getElementById('cigh-clean-log-inner');
    if (!el) return;

    const scrollTarget = document.getElementById('cigh-clean-main') || el;
    const scrollToBottom = () => {
      scrollTarget.scrollTop = scrollTarget.scrollHeight;
    };

    const recent = logLines.slice(-18).map(String);
    const force = !!options.force || !renderedLogLines.length || el.children.length !== renderedLogLines.length;

    if (force) {
      el.innerHTML = recent.map((line, index) => {
        const opacity = Math.max(0.32, (index + 1) / Math.max(1, recent.length));
        return `<div style="opacity:${opacity.toFixed(2)}">${esc(normalizeGameLine(line))}</div>`;
      }).join('');
      renderedLogLines = recent.slice();
      scrollToBottom();
      return;
    }

    const shiftedByOne = recent.length === renderedLogLines.length
      && recent.length > 1
      && recent.slice(0, -1).every((line, index) => line === renderedLogLines[index + 1]);

    if (shiftedByOne) {
      el.firstElementChild?.remove();
      el.appendChild(renderLogLineNode(recent[recent.length - 1], recent.length - 1, recent.length));
    } else {
      while (el.children.length > recent.length) el.lastElementChild?.remove();

      for (let index = 0; index < recent.length; index++) {
        let row = el.children[index];
        if (!row) {
          row = renderLogLineNode(recent[index], index, recent.length);
          el.appendChild(row);
        } else if (renderedLogLines[index] !== recent[index]) {
          row.textContent = normalizeGameLine(recent[index]);
        }
      }
    }

    for (let index = 0; index < recent.length; index++) {
      const row = el.children[index];
      if (row) row.style.opacity = Math.max(0.32, (index + 1) / Math.max(1, recent.length)).toFixed(2);
    }

    renderedLogLines = recent.slice();
    scrollToBottom();
  }

  function ensurePopup() {
    let el = document.getElementById(POPUP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = POPUP_ID;
      document.body.appendChild(el);
      applyThemeMode();
    }
    return el;
  }

  function ensureCommentPopup() {
    let el = document.getElementById(COMMENT_POPUP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = COMMENT_POPUP_ID;
      el.innerHTML = '<div class="cigh-clean-comment-prefix">◇ HUD</div><div class="cigh-clean-comment-text"></div>';
      document.body.appendChild(el);
      applyThemeMode();
    }
    return el;
  }

  function getFabRect() {
    const fab = document.getElementById(FAB_ID);
    return fab?.getBoundingClientRect?.() || { left: 16, top: innerHeight - 120, right: 50, bottom: innerHeight - 86, width: 34, height: 34 };
  }

  function positionPopupNearFab(el, kind = 'log') {
    if (!el) return;

    const rect = getFabRect();
    const gap = 8;
    const width = Math.min(218, Math.max(180, innerWidth - 24));

    el.style.width = `${width}px`;
    const actualWidth = el.offsetWidth || width;

    let left = rect.left;
    if (left + actualWidth > innerWidth - 8) left = innerWidth - actualWidth - 8;
    left = Math.max(8, left);

    const visibleComment = document.getElementById(COMMENT_POPUP_ID);
    const commentHeight = visibleComment?.classList.contains('show')
      ? Math.max(48, visibleComment.offsetHeight || 58)
      : 0;

    const measuredHeight = el.scrollHeight || el.offsetHeight || (kind === 'comment' ? 58 : 150);
    const maxViewportHeight = Math.max(72, innerHeight - 16);
    const height = Math.max(
      kind === 'comment' ? 48 : 72,
      Math.min(measuredHeight, maxViewportHeight)
    );

    let bottom = Math.max(8, innerHeight - rect.top + gap);

    if (kind === 'log' && commentHeight) {
      bottom += commentHeight + 6;
    }

    el.style.left = `${left}px`;
    el.style.right = 'auto';

    if (bottom + height > innerHeight - 8) {
      let top = rect.bottom + gap;
      if (kind === 'log' && commentHeight) top += commentHeight + 6;
      if (top + height > innerHeight - 8) top = Math.max(8, innerHeight - height - 8);

      el.style.top = `${top}px`;
      el.style.bottom = 'auto';
    } else {
      el.style.top = 'auto';
      el.style.bottom = `${bottom}px`;
    }
  }

  function updateFloatingPopupPositions() {
    const popup = document.getElementById(POPUP_ID);
    const comment = document.getElementById(COMMENT_POPUP_ID);

    if (popup) positionPopupNearFab(popup, 'log');
    if (comment) positionPopupNearFab(comment, 'comment');
  }

  function showCommentPopup(comment) {
    if (!isCommentPopupEnabled()) return;

    const text = normalize(comment);
    if (!text) return;

    if (isDockActive() && positionDockUi()) {
      const tickerLine = normalizeGameLine(`◇ ${text}`);
      if (tickerLine) pushTickerLine(tickerLine);
      return;
    }

    const el = ensureCommentPopup();
    const body = el.querySelector('.cigh-clean-comment-text');
    if (!body) return;

    clearTimeout(commentPopupTypingTimer);
    clearTimeout(commentPopupHideTimer);

    const runId = ++commentPopupRunId;
    positionPopupNearFab(el, 'comment');
    el.classList.add('show');
    body.textContent = '';
    requestAnimationFrame(updateFloatingPopupPositions);

    let pos = 0;
    const tick = () => {
      if (runId !== commentPopupRunId) return;

      pos += 1;
      body.textContent = text.slice(0, pos);
      if (pos === 1 || pos >= text.length) requestAnimationFrame(updateFloatingPopupPositions);

      if (pos < text.length) {
        commentPopupTypingTimer = setTimeout(tick, 48);
      } else {
        commentPopupHideTimer = setTimeout(() => {
          if (runId !== commentPopupRunId) return;
          el.classList.remove('show');
          requestAnimationFrame(updateFloatingPopupPositions);
        }, 3900);
      }
    };

    tick();
  }

  function queuePopupLineRemoval(row, delay = 280) {
    const timer = setTimeout(() => {
      popupLineRemoveTimers.delete(timer);
      row?.remove();
      updateFloatingPopupPositions();
    }, Math.max(0, Number(delay) || 0));
    popupLineRemoveTimers.add(timer);
    return timer;
  }

  function clearPopupLineRemovalTimers() {
    popupLineRemoveTimers.forEach(timer => clearTimeout(timer));
    popupLineRemoveTimers.clear();
  }

  function showPopup(lines) {
    const normalized = (lines || []).map(normalizeGameLine).filter(Boolean);
    if (!normalized.length) return;

    if (isDockActive() && positionDockUi()) {
      normalized.forEach(pushTickerLine);
      return;
    }

    const el = ensurePopup();
    positionPopupNearFab(el, 'log');
    el.classList.add('show');
    requestAnimationFrame(updateFloatingPopupPositions);

    clearTimeout(popupRemoveTimer);
    clearTimeout(popupHideTimer);

    popupQueue.push(...normalized);
    if (!popupTyping) typePopupNext();
  }

  function typePopupNext() {
    const el = ensurePopup();

    if (!popupQueue.length) {
      popupTyping = false;
      schedulePopupRemoval();
      return;
    }

    popupTyping = true;
    el.classList.add('show');

    const line = popupQueue.shift();
    const row = document.createElement('div');
    row.className = 'cigh-clean-popup-line entering';
    row.textContent = '';
    el.appendChild(row);
    popupLines.push(row);

    requestAnimationFrame(() => {
      row.classList.remove('entering');
      updateFloatingPopupPositions();
    });

    while (popupLines.length > 8) {
      const old = popupLines.shift();
      old?.classList.add('leaving');
      queuePopupLineRemoval(old, 260);
    }

    let pos = 0;
    const tick = () => {
      pos += 2;
      row.textContent = line.slice(0, pos);
      if (pos === 2 || pos >= line.length) requestAnimationFrame(updateFloatingPopupPositions);

      if (pos < line.length) setTimeout(tick, 26);
      else setTimeout(typePopupNext, 520);
    };

    tick();
  }

  function schedulePopupRemoval() {
    clearTimeout(popupRemoveTimer);
    popupRemoveTimer = setTimeout(removeOldestPopupLine, 1500);
  }

  function removeOldestPopupLine() {
    const el = ensurePopup();

    if (popupTyping || popupQueue.length) return;

    const row = popupLines.shift();
    if (!row) {
      popupHideTimer = setTimeout(() => el.classList.remove('show'), 650);
      return;
    }

    row.classList.add('leaving');
    queuePopupLineRemoval(row, 280);

    if (popupLines.length) popupRemoveTimer = setTimeout(removeOldestPopupLine, 620);
    else popupHideTimer = setTimeout(() => el.classList.remove('show'), 720);
  }

  function setFooter(text) {
    const el = document.getElementById('cigh-clean-ft');
    if (el) el.textContent = text;
  }

  function stopFooterTyping(options = {}) {
    clearTimeout(footerTypingTimer);
    clearTimeout(footerLoopTimer);
    footerTypingTimer = null;
    footerLoopTimer = null;
    if (options.clearPopupRemaining !== false) footerPopupRemaining = 0;
  }

  function isFooterCommentSequenceActive() {
    return !!(footerComments.length && (footerTypingTimer || footerLoopTimer || footerPopupRemaining > 0));
  }

  function stopCommentPopup(options = {}) {
    clearTimeout(commentPopupTypingTimer);
    clearTimeout(commentPopupHideTimer);
    commentPopupTypingTimer = null;
    commentPopupHideTimer = null;
    commentPopupRunId += 1;

    if (options.hide) {
      const comment = document.getElementById(COMMENT_POPUP_ID);
      if (comment) {
        comment.classList.remove('show');
        const body = comment.querySelector('.cigh-clean-comment-text');
        if (body) body.textContent = '';
      }
    }
  }

  function stopFooterComments(options = {}) {
    stopFooterTyping({ clearPopupRemaining: options.clearPopupRemaining !== false });
    stopCommentPopup({ hide: !!options.hideComment });
  }

  function clearTransientUi() {
    clearTimeout(popupRemoveTimer);
    clearTimeout(popupHideTimer);
    clearPopupLineRemovalTimers();
    clearTimeout(autoAnalyzeTimer);

    stopFooterComments({ hideComment: true });

    logQueue = [];
    isLogTyping = false;
    popupQueue = [];
    popupTyping = false;
    popupLines = [];
    resetTickerLine();

    const popup = document.getElementById(POPUP_ID);
    if (popup) {
      popup.classList.remove('show');
      popup.innerHTML = '';
    }
  }

  function startFooterComments(comments, options = {}) {
    footerComments = Array.isArray(comments)
      ? comments.map(x => normalize(x)).filter(Boolean).slice(0, 3)
      : [];

    footerCommentIndex = 0;
    stopFooterTyping({ clearPopupRemaining: true });

    footerPopupRemaining = (options.popup !== false && isCommentPopupEnabled()) ? footerComments.length : 0;

    if (!footerComments.length) return;

    typeFooterComment();
  }

  function typeFooterComment() {
    if (!footerComments.length) return;

    const comment = footerComments[footerCommentIndex % footerComments.length];
    footerCommentIndex += 1;
    footerLastText = comment;

    if (footerPopupRemaining > 0) {
      showCommentPopup(comment);
      footerPopupRemaining -= 1;
    }

    let pos = 0;
    const tick = () => {
      pos += 2;
      footerLastText = comment.slice(0, pos);

      const el = document.getElementById('cigh-clean-ft');
      if (el) el.textContent = footerLastText;

      if (pos < comment.length) footerTypingTimer = setTimeout(tick, 60);
      else footerLoopTimer = setTimeout(typeFooterComment, 6400);
    };

    tick();
  }

  // ─────────────────────────────────────────────
  // UI rendering
  // ─────────────────────────────────────────────
  function section(title, body) {
    if (!body) return '';
    return `<div class="cigh-clean-sec"><div class="cigh-clean-sh">${esc(title)}</div>${body}</div>`;
  }

  function empty(message) {
    return `<div class="cigh-clean-empty">── ${esc(message)} ──</div>`;
  }

  function pixelHeartSVG(value) {
    const color = heartColor(value);
    const pixels = [
      '01100110',
      '11111111',
      '11111111',
      '11111111',
      '01111110',
      '00111100',
      '00011000',
      '00000000',
    ];

    const size = 2;
    const rects = [];

    pixels.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '1') rects.push(`<rect x="${x * size}" y="${y * size}" width="${size}" height="${size}" fill="${color}"/>`);
      });
    });

    return `<svg class="cigh-clean-heart" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${rects.join('')}</svg>`;
  }


  // ─────────────────────────────────────────────
  // Pet
  // ─────────────────────────────────────────────
  const PET_STAGES = [
    { stage: 0, minLevel: 1,  name: '알',     color: '#f0e0b0' },
    { stage: 1, minLevel: 3,  name: '아기',   color: '#a8e0b0' },
    { stage: 2, minLevel: 10, name: '성장기', color: '#9ecbf0' },
    { stage: 3, minLevel: 14, name: '성숙기', color: '#d9b3ec' },
    { stage: 4, minLevel: 17, name: '완전체', color: '#ffd166' },
  ];

  const PET_MOOD_COLORS = { love: '#e46576', happy: '#e0b24b', normal: '', sad: '#6f8bb0', scared: '#9b7fc0' };
  const PET_MOOD_LABEL = { love: '♥ 두근두근', happy: '☺ 기분 좋음', normal: '· 평온', sad: '… 시무룩', scared: '! 긴장' };
  const PET_PANEL_SPRITE_SIZE = 5;
  const PET_MASCOT_SPRITE_SIZE = 3;

  const PET_EGG_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
    '0000001111000000',
    '0000011122100000',
    '0000111122210000',
    '0000111122210000',
    '0001111222111000',
    '0001222221111000',
    '0001222211111000',
    '0001222211111000',
    '0000122211110000',
    '0000011111100000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000'
  ];
  const PET_BABY_SPRITE_32 = [
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001461000000',
    '0000114666110000',
    '0001666666661000',
    '0016662662666100',
    '0016661661666100',
    '0016636666365100',
    '0016666666665100',
    '0001666666651000',
    '0000111111110000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
  ];

  const PET_BABY_SLEEP_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001661000000',
    '0000116666110000',
    '0001666666661000',
    '0016611661166100',
    '0016666666666100',
    '0016636666366100',
    '0016666666666100',
    '0001666666661000',
    '0000111111110000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
  ];

  const PET_BABY_HAPPY_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001661000000',
    '0000116666110000',
    '0001666666661000',
    '0016616666166100',
    '0016661661666100',
    '0016616666166100',
    '0016366666636100',
    '0001666666661000',
    '0000111111110000',
    '0000000000000000',
    '0000000000000000',
    '0000000000000000',
  ];

  const PET_GROWING_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001661000000',
    '0000116666110000',
    '0001666666661000',
    '0016666666666100',
    '0166662662666610',
    '0166661661666610',
    '0166661661666610',
    '0166666666666610',
    '0166336666336610',
    '0016666666666100',
    '0001111111111000',
    '0000000000000000',
    '0000000000000000',
  ];

  const PET_GROWING_SLEEP_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001661000000',
    '0000116666110000',
    '0001666666661000',
    '0016666666666100',
    '0166666666666610',
    '0166111661116610',
    '0166666666666610',
    '0166666666666610',
    '0166336666336610',
    '0016666666666100',
    '0001111111111000',
    '0000000000000000',
    '0000000000000000',
  ];

  const PET_GROWING_HAPPY_SPRITE_16 = [
    '0000000000000000',
    '0000000000000000',
    '0000000110000000',
    '0000001661000000',
    '0000116666110000',
    '0001666666661000',
    '0016666666666100',
    '0166616666166610',
    '0166661661666610',
    '0166616666166610',
    '0166666666666610',
    '0166336666336610',
    '0016666666666100',
    '0001111111111000',
    '0000000000000000',
    '0000000000000000',
  ];


  function petResolveDotPixelSize(stageObj, size) {
    return Number(size) || 8;
  }

  function petResolveStageDisplaySize(stageObj, rawSize) {
    const value = Number(rawSize) || 0;
    const stage = Number(stageObj?.stage || 0);
    // 알(stage 0)과 아기(stage 1)는 그대로 둔다.
    // 성장기(stage 2)는 v2.4.2보다 2px 더 줄여 총 -4px.
    // 성숙기/완전체 도트 폴백(stage 3+)은 v2.4.3 기준(-7px)을 유지한다.
    if (stage >= 3) return Math.max(1, value - 7);
    if (stage === 2) return Math.max(1, value - 4);
    return value;
  }

  function petResolveImageDisplaySize(stageObj, rawSize) {
    const value = petResolveStageDisplaySize(stageObj, rawSize);
    const stage = Number(stageObj?.stage || 0);
    // v2.6.0: 성숙기/완전체 이미지 펫은 원본 기준 총 -32px가 되도록 추가 축소한다.
    // petResolveStageDisplaySize에서 stage 3+는 이미 -7px가 적용되므로,
    // 이미지 펫에서는 추가로 -25px을 적용해 총 -32px을 맞춘다.
    // 알/아기/성장기 도트 펫과 도트 폴백 크기는 건드리지 않는다.
    if (stage >= 3) return Math.max(1, value - 25);
    return value;
  }

  function petNormalizeHexColor(value, fallback = '#ffd166') {
    let hex = String(value || '').trim();
    if (!hex) hex = fallback;
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      hex = '#' + hex.slice(1).split('').map(ch => ch + ch).join('');
    }
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : fallback;
  }

  function petShiftHexColor(value, amount) {
    const hex = petNormalizeHexColor(value);
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + amount, 0, 255);
    const g = clamp(((n >> 8) & 255) + amount, 0, 255);
    const b = clamp((n & 255) + amount, 0, 255);
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  function petBuildDotPalette(map, color) {
    const base = petNormalizeHexColor(color);
    const isEgg16Sprite = map === PET_EGG_SPRITE_16;
    if (isEgg16Sprite) {
      // 알은 piskel 원본을 이미지로 확대하지 않고, 아기/성장기처럼 SVG 도트로 그린다.
      // 1=껍질/외곽, 2=무늬/하이라이트.
      return {
        1: '#3f3939',
        2: '#ffffff',
        3: '#211f1f',
      };
    }

    const hasBaby16Digits = Array.isArray(map) && map.some(row => /6/.test(String(row || '')));
    if (hasBaby16Digits) {
      return {
        1: petShiftHexColor(base, -110), // 테두리/눈
        2: petShiftHexColor(base, -68),  // 눈 명암
        3: '#d5a1a1',                    // 홍조 고정
        4: base,                         // 연한 명암 제거 → 몸통색으로 통일
        5: base,                         // 진한 명암 제거 → 몸통색으로 통일
        6: base,                         // 몸통 기본색
      };
    }

    const hasToneDigits = Array.isArray(map) && map.some(row => /[2-9]/.test(String(row || '')));
    if (!hasToneDigits) return { 1: base };

    const hasSoftShadeDigits = Array.isArray(map) && map.some(row => /[345]/.test(String(row || '')));
    if (hasSoftShadeDigits) {
      return {
        1: petShiftHexColor(base, -110), // 테두리/눈
        2: base,                         // 몸통 기본색
        3: petShiftHexColor(base, -22),  // 밝은 명암
        4: '#d5a1a1',                    // 홍조 고정
        5: petShiftHexColor(base, -65),  // 어두운 명암
      };
    }

    return {
      1: petShiftHexColor(base, -82),
      2: base,
    };
  }

  const PET_SPRITES = {
    0: PET_EGG_SPRITE_16,
    1: PET_BABY_SPRITE_32,
    2: PET_GROWING_SPRITE_16,
    3: ['00000110000000','00000110000000','00011111111000','00111111111100','01111111111110','01100111100110','01100111100110','01111111111110','01111100111110','01111111111110','00111111111100','00011111111000','00011000110000','00000000000000'],
  };

  // 완전체 분기 8종: 기본 5종 + 혼합 진화 3종.
  // 기본 성향 tally는 기존 5종만 누적하고, 성숙기 진입 시 TOP2 비율 조합으로 혼합 진화를 판정한다.
  const PET_FINAL_BODY = [
    '00011111111000','00111111111100','01111111111110',
    '01100111100110','01100111100110','01111111111110',
    '01111100111110','01111111111110','00111111111100',
    '00011111111000','00000000000000',
  ];

  const PET_FINAL_FORMS = {
    heart:  { name: '완전체·♥형', color: '#ff9ec4', sprite: ['00000010100000','00000111110000','00000011100000', ...PET_FINAL_BODY] },
    bloom:  { name: '완전체·✿형', color: '#ffd9a8', sprite: ['00001000010000','00010100101000','00001011010000', ...PET_FINAL_BODY] },
    peace:  { name: '완전체·☺형', color: '#ffd166', sprite: ['00001100110000','00000111100000','00000011000000', ...PET_FINAL_BODY] },
    tear:   { name: '완전체·☂형', color: '#8fb4e0', sprite: ['00000011000000','00000111100000','00001111110000', ...PET_FINAL_BODY] },
    blade:  { name: '완전체·⚔형', color: '#b6a3e0', sprite: ['00100000010000','00110000011000','00011000110000', ...PET_FINAL_BODY] },
    rabbit: { name: '완전체·🐇 토끼', color: '#f3a6c8', sprite: ['00001010001000','00001110011000','00000111110000', ...PET_FINAL_BODY] },
    lizard: { name: '완전체·🦎 도마뱀', color: '#9bcf95', sprite: ['00000011110000','00000111111000','00000011100000', ...PET_FINAL_BODY] },
    owl:    { name: '완전체·🦉 부엉이', color: '#b9a37d', sprite: ['00001000010000','00011100111000','00001111110000', ...PET_FINAL_BODY] },
  };

  // tally/분석 성향은 기존 다섯 개만 유지한다.
  const TENDENCY_KEYS = ['heart', 'bloom', 'peace', 'tear', 'blade'];
  const PET_FORM_KEYS = Object.keys(PET_FINAL_FORMS);

  const PET_TENDENCY_LABEL = {
    heart: '♥ 애정형',
    bloom: '✿ 명랑형',
    peace: '☺ 평화형',
    tear: '☂ 애상형',
    blade: '⚔ 시련형',
    rabbit: '♥+✿ 혼합형 · 토끼',
    lizard: '✿+☺ 혼합형 · 도마뱀',
    owl: '☺+⚔ 혼합형 · 부엉이',
  };

  const PET_PERSONALITY_GUIDE = {
    heart: '고양이/애교많음/좋아함숨기지않음/반말/예:헤헤 좋아',
    bloom: '햄스터/명랑호들갑/신남/반말/예:우와 신난다!',
    peace: '곰/느긋포근/천천히달램/반말/예:음~ 포근해',
    tear: '양/여림감성/따뜻쓸쓸/반말/예:곁에 있어줘…',
    blade: '용/츤데레/흥·크흠·딱히·바, 바보! 같은 말버릇/반말/호감과 걱정을 바로 인정하기보다 말이 잠깐 꼬이거나 퉁명스럽게 감춤/예:크흠… 딱히 걱정한 건 아니거든, 바, 바보!',
    lizard: '도마뱀/게으른 백치미·무념무상·단순욕구·잘 까먹는 마이페이스/말끝을 자연스럽게 늘이는 반말(~아아~, ~해애~, ~네에~)/사용자를 달래거나 훈수하지 않음/본인이 움직이기 싫고 따뜻한 곳·먹을 것·누워있기를 좋아하며 생각하다가 자주 까먹음/애정도 이유를 깊게 설명하기보다 단순하고 솔직하게 표현/예:심심하다아~, 뭐 하려고 했더라아~?, 움직이기 싫어어~ 네가 와아~',
    owl: '부엉이/상냥하고 정중한 박학다식 수다쟁이/존댓말/최신 장면에 현실의 음식·동물·날씨·신체·문화·역사·물건·자연현상 등 확실히 아는 소재가 있으면 그 소재와 직접 관련된 짧고 정확한 잡학 사실 1개를 자연스럽게 덧붙임/불확실하거나 판타지 고유설정뿐이면 잡학을 지어내지 말고 정중한 감상만 함/예:오호, 비 냄새에는 페트리코르라는 이름도 있답니다.',
    rabbit: '토끼/밝고 붙임성 좋은 인싸 갸루/현대적인 갸루풍 반말/거리감 가깝고 리액션 풍부/좋고 싫은 감정을 바로 표현하고 먼저 말을 거는 편/말끝·감탄에 ♡를 적극적이되 기계적이지 않게 자주 사용/예:헐~ 진짜아?♡, 뭐야아~ 완전 좋잖아♡',
  };

  const HYBRID_FINAL_RULES = [
    { key: 'rabbit', pair: ['heart', 'bloom'], label: '♥+✿' },
    { key: 'lizard', pair: ['bloom', 'peace'], label: '✿+☺' },
    { key: 'owl', pair: ['peace', 'blade'], label: '☺+⚔' },
  ];
  const HYBRID_MAX_GAP_PCT = 10;
  const HYBRID_MIN_PAIR_PCT = 60;

  const MOOD_WINDOW = 3 * 60 * 1000;
  const MASCOT_IDLE_MS = 10 * 60 * 1000;
  const BOND_LEVELS = [0, 10, 30, 60, 100];

  function zeroTally() {
    return Object.fromEntries(TENDENCY_KEYS.map(key => [key, 0]));
  }

  function petMoodBucket(mood) {
    if (mood === 'love') return 'heart';
    if (mood === 'happy') return 'bloom';
    if (mood === 'sad') return 'tear';
    if (mood === 'scared') return 'blade';
    return 'peace';
  }

  function petFinalType(tally) {
    const t = { ...zeroTally(), ...(tally || {}) };
    return TENDENCY_KEYS.reduce((best, key) => Number(t[key] || 0) > Number(t[best] || 0) ? key : best, 'peace');
  }

  function petTallyPercentages(tally = {}) {
    const t = { ...zeroTally(), ...(tally || {}) };
    const total = TENDENCY_KEYS.reduce((sum, key) => sum + Math.max(0, Number(t[key] || 0)), 0);
    const pct = Object.fromEntries(TENDENCY_KEYS.map(key => [key, total ? (Math.max(0, Number(t[key] || 0)) / total) * 100 : 0]));
    const sorted = TENDENCY_KEYS
      .map(key => ({ key, count: Math.max(0, Number(t[key] || 0)), pct: pct[key] || 0 }))
      .sort((a, b) => b.count - a.count || TENDENCY_KEYS.indexOf(a.key) - TENDENCY_KEYS.indexOf(b.key));
    return { total, pct, sorted };
  }

  function hybridRuleForType(finalType) {
    return HYBRID_FINAL_RULES.find(rule => rule.key === String(finalType || '')) || null;
  }

  function detectHybridPetFinalType(tally = {}) {
    const info = petTallyPercentages(tally);
    if (info.total <= 0 || info.sorted.length < 2) return '';
    const first = info.sorted[0];
    const second = info.sorted[1];
    const pairPct = first.pct + second.pct;
    const gapPct = Math.abs(first.pct - second.pct);
    if (pairPct + 1e-9 < HYBRID_MIN_PAIR_PCT || gapPct - 1e-9 > HYBRID_MAX_GAP_PCT) return '';
    const topSet = new Set([first.key, second.key]);
    const rule = HYBRID_FINAL_RULES.find(item => item.pair.every(key => topSet.has(key)));
    return rule?.key || '';
  }

  function resolvePetFinalType(tally = {}) {
    return detectHybridPetFinalType(tally) || petFinalType(tally);
  }

  function defaultPet() {
    return {
      exp: 0,
      level: 1,
      stage: 0,
      mood: 'normal',
      feedCount: 0,
      bornAt: Date.now(),
      lastFedAt: 0,
      tally: zeroTally(),
      finalType: 'peace',
      fixedFinalType: '',
      lastLine: '',
      lastLineAt: 0,
      bondLevel: 0,
      charAffinity: {},
      shownMilestones: [],
    };
  }

  function normalizePet(raw = {}) {
    const base = defaultPet();
    const pet = { ...base, ...(raw || {}) };
    pet.exp = shopSafeInt(pet.exp, 0, 1000000000000);
    pet.level = shopSafeInt(pet.level, petLevelFromExp(pet.exp), 1000000) || 1;
    // EXP 곡선 상향 이후에도 기존 펫의 현재 레벨은 절대 하락시키지 않는다.
    pet.exp = Math.max(pet.exp, petExpForLevel(pet.level));
    pet.stage = petStageFromLevel(pet.level).stage;
    pet.tally = Object.fromEntries(TENDENCY_KEYS.map(k => [k, shopSafeInt(raw?.tally?.[k])]));
    pet.finalType = TENDENCY_KEYS.includes(String(pet.finalType || '')) ? pet.finalType : petFinalType(pet.tally);
    pet.fixedFinalType = PET_FORM_KEYS.includes(String(pet.fixedFinalType || '')) ? pet.fixedFinalType : '';
    if (!pet.fixedFinalType && pet.level >= 14) {
      pet.fixedFinalType = PET_FORM_KEYS.includes(String(raw?.fixedFinalType || '')) ? String(raw.fixedFinalType) : resolvePetFinalType(pet.tally);
    }
    pet.bondLevel = Number.isFinite(Number(pet.bondLevel)) ? Number(pet.bondLevel) : 0;
    pet.charAffinity = raw?.charAffinity && typeof raw.charAffinity === 'object' && !Array.isArray(raw.charAffinity)
      ? { ...raw.charAffinity }
      : {};
    pet.shownMilestones = Array.isArray(raw?.shownMilestones) ? raw.shownMilestones.slice() : [];
    return pet;
  }

  function getPet(room = getRoom()) {
    return normalizePet(room?.pet || {});
  }

  function petExpForLevel(level) {
    const n = Math.max(0, Math.floor(Number(level) || 1) - 1);
    return 60 * n + 27 * n * (n - 1) / 2;
  }

  function petLevelFromExp(exp) {
    const value = Number.isFinite(Number(exp)) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(exp))) : 0;
    let level = 1 + Math.floor((Math.sqrt(864 * value + 34596) - 186) / 108);
    while (petExpForLevel(level + 1) <= value) level++;
    while (level > 1 && petExpForLevel(level) > value) level--;
    return level;
  }

  function petStageFromLevel(level) {
    let picked = PET_STAGES[0];
    for (const st of PET_STAGES) if (level >= st.minLevel) picked = st;
    return picked;
  }

  function getPetDisplayFinalType(pet = getPet()) {
    const fixed = String(pet?.fixedFinalType || '');
    if (petStageFromLevel(Number(pet?.level || 1)).stage >= 3 && PET_FORM_KEYS.includes(fixed)) return fixed;
    const live = String(pet?.finalType || 'peace');
    return TENDENCY_KEYS.includes(live) ? live : 'peace';
  }


  function petExpGain(deltaSum) {
    return 10 + Math.min(Math.round(deltaSum), 20);
  }

  function petTokenExpGain(tokens) {
    const input = Math.max(0, Math.floor(Number(tokens?.input || 0)));
    if (!input) return 0;
    return clamp(Math.floor(input / PET_TOKEN_EXP_INPUT_UNIT), 0, PET_TOKEN_EXP_MAX);
  }

  function petDotSpriteSVG(stageObj, mood, finalType, size = 8, pet = getPet()) {
    const form = stageObj.stage >= 4 ? (PET_FINAL_FORMS[finalType] || PET_FINAL_FORMS.peace) : null;
    const visualMode = getPetVisualMode(pet);
    const stageNum = Number(stageObj?.stage || 0);
    let map = form?.sprite || PET_SPRITES[stageObj.stage] || PET_SPRITES[0];

    if (stageNum === 1) {
      if (visualMode === 'sleep') map = PET_BABY_SLEEP_SPRITE_16;
      else if (visualMode === 'smile') map = PET_BABY_HAPPY_SPRITE_16;
    } else if (stageNum === 2) {
      if (visualMode === 'sleep') map = PET_GROWING_SLEEP_SPRITE_16;
      else if (visualMode === 'smile') map = PET_GROWING_HAPPY_SPRITE_16;
      else map = PET_GROWING_SPRITE_16;
    }

    const color = PET_MOOD_COLORS[mood] || form?.color || stageObj.color;
    const pixel = petResolveDotPixelSize(stageObj, size);
    const palette = petBuildDotPalette(map, color);
    const w = map[0].length;
    const rawWidth = w * pixel;
    const rawHeight = map.length * pixel;
    const displayWidth = petResolveStageDisplaySize(stageObj, rawWidth);
    const displayHeight = petResolveStageDisplaySize(stageObj, rawHeight);
    return `<svg class="cigh-clean-pet-svg" viewBox="0 0 ${rawWidth} ${rawHeight}" width="${displayWidth}" height="${displayHeight}" aria-hidden="true">${
      map.map((row, y) => [...row].map((cell, x) => {
        if (cell === '0') return '';
        const fill = palette[cell] || color;
        return `<rect x="${x * pixel}" y="${y * pixel}" width="${pixel}" height="${pixel}" fill="${fill}"/>`;
      }).join('')).join('')
    }</svg>`;
  }

  const PET_IMAGE_FRAME_KEYS = ['normal', 'smile1', 'smile2', 'half', 'sleep1', 'sleep2', 'drag1', 'drag2'];
  const PET_PRELOADED_FRAME_TYPES = new Set();
  const PET_IMAGE_FRAMES = {
    // ♥ 애정형: 고양이
    heart: {
      normal: 'https://i.postimg.cc/brh5wnNW/heart-cat-normal.png',
      smile1: 'https://i.postimg.cc/0js4yS2T/heart-cat-smile.png',
      smile2: 'https://i.postimg.cc/SRhPx9x4/heart-cat-smile-(1).png',
      half: 'https://i.postimg.cc/L5pW8P6r/heart-cat-half.png',
      sleep1: 'https://i.postimg.cc/4yg0xcNj/heart-cat-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/vTsKZnZR/heart-cat-sleep-(2).png',
      drag1: 'https://i.postimg.cc/90hkQ9QH/heart-cat-drag-(1).png',
      drag2: 'https://i.postimg.cc/hvBYtmtq/heart-cat-drag-(2).png',
    },
    // ✿ 명랑형: 햄스터
    bloom: {
      normal: 'https://i.postimg.cc/Mpc19bBL/cheerful-hamster-normal.png',
      smile1: 'https://i.postimg.cc/6p7CMLZF/cheerful-hamster-smile.png',
      smile2: 'https://i.postimg.cc/sgB5T9Wt/cheerful-hamster-smile-(1).png',
      half: 'https://i.postimg.cc/SxXcg795/cheerful-hamster-half.png',
      sleep1: 'https://i.postimg.cc/rFZSGYdT/cheerful-hamster-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/NfC18PyY/cheerful-hamster-sleep-(2).png',
      drag1: 'https://i.postimg.cc/7ZCSKMzW/cheerful-hamster-drag-(1).png',
      drag2: 'https://i.postimg.cc/y8J0LXRt/cheerful-hamster-drag-(2).png',
    },
    // ☺ 평화형: 곰
    peace: {
      normal: 'https://i.postimg.cc/Jn8J7fFM/peace-bear-normal.png',
      smile1: 'https://i.postimg.cc/sXzSfkL5/peace-bear-smile.png',
      smile2: 'https://i.postimg.cc/V6wMsxhn/peace-bear-smile-(1).png',
      half: 'https://i.postimg.cc/PxHZfg7D/peace-bear-half.png',
      sleep1: 'https://i.postimg.cc/gJpRcC70/peace-bear-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/nzx7VyWh/peace-bear-sleep-(2).png',
      drag1: 'https://i.postimg.cc/KzbLc6Wk/peace-bear-drag-(1).png',
      drag2: 'https://i.postimg.cc/wvzJxCrT/peace-bear-drag-(2).png',
    },
    // ☂ 애상형: 양
    tear: {
      normal: 'https://i.postimg.cc/qvCCsBVd/sorrow-lamb-normal.png',
      smile1: 'https://i.postimg.cc/Dwbbrfkm/sorrow-lamb-smile.png',
      smile2: 'https://i.postimg.cc/kgttQM3G/sorrow-lamb-smile-(1).png',
      half: 'https://i.postimg.cc/T3WWV2Mw/sorrow-lamb-half.png',
      sleep1: 'https://i.postimg.cc/GmssF3wn/sorrow-lamb-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/7YR2JGcY/sorrow-lamb-sleep-(2).png',
      drag1: 'https://i.postimg.cc/VkbbqsQk/sorrow-lamb-drag-(1).png',
      drag2: 'https://i.postimg.cc/g266VcFd/sorrow-lamb-drag-(2).png',
    },
    // ⚔ 시련형: 용
    blade: {
      normal: 'https://i.postimg.cc/T27yB5Tp/trial-dragon-normal.png',
      smile1: 'https://i.postimg.cc/bNZGPYv2/trial-dragon-smile.png',
      smile2: 'https://i.postimg.cc/7Y5C4PLG/trial-dragon-smile-(1).png',
      half: 'https://i.postimg.cc/Yqv472S4/trial-dragon-half.png',
      sleep1: 'https://i.postimg.cc/jqgWBnRJ/trial-dragon-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/BZY8RPJF/trial-dragon-sleep-(2).png',
      drag1: 'https://i.postimg.cc/WpWDxqsD/trial-dragon-drag-(1).png',
      drag2: 'https://i.postimg.cc/tRS18n9t/trial-dragon-drag-(2).png',
    },
    // ♥+✿ 혼합형: 갸루 토끼
    rabbit: {
      normal: 'https://i.postimg.cc/NGS6KcGP/gyaru-rabbit-normal.png',
      smile1: 'https://i.postimg.cc/RCy7WBVx/gyaru-rabbit-smile.png',
      smile2: 'https://i.postimg.cc/xjhvX2TD/gyaru-rabbit-smile-(1).png',
      half: 'https://i.postimg.cc/nVg4XJVR/gyaru-rabbit-half.png',
      sleep1: 'https://i.postimg.cc/L4wtJp4r/gyaru-rabbit-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/FF8yY4st/gyaru-rabbit-sleep-(2).png',
      drag1: 'https://i.postimg.cc/8k9R7Sk3/gyaru-rabbit-drag-(1).png',
      drag2: 'https://i.postimg.cc/G3VF4C35/gyaru-rabbit-drag-(2).png',
    },
    // ✿+☺ 혼합형: 느긋한 도마뱀
    lizard: {
      normal: 'https://i.postimg.cc/T3XncJDF/chill-lizard-normal.png',
      smile1: 'https://i.postimg.cc/cLMwktR9/chill-lizard-smile.png',
      smile2: 'https://i.postimg.cc/zGSK2HC2/chill-lizard-smile-(1).png',
      half: 'https://i.postimg.cc/y8z0TyZ5/chill-lizard-half.png',
      sleep1: 'https://i.postimg.cc/K8rBp3P0/chill-lizard-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/P5zYVvWF/chill-lizard-sleep-(2).png',
      drag1: 'https://i.postimg.cc/vZd5vtVN/chill-lizard-drag-(1).png',
      drag2: 'https://i.postimg.cc/FHQ0xVL6/chill-lizard-drag-(2).png',
    },
    // ☺+⚔ 혼합형: 박학다식 부엉이
    owl: {
      normal: 'https://i.postimg.cc/3xH2ZFvd/scholar-owl-normal.png',
      smile1: 'https://i.postimg.cc/htqV01dd/scholar-owl-smile.png',
      smile2: 'https://i.postimg.cc/XY09gkC5/scholar-owl-smile-(1).png',
      half: 'https://i.postimg.cc/3xH2ZFvk/scholar-owl-half.png',
      sleep1: 'https://i.postimg.cc/kgdWyvbR/scholar-owl-sleep-(1).png',
      sleep2: 'https://i.postimg.cc/wjdDkQms/scholar-owl-sleep-(2).png',
      drag1: 'https://i.postimg.cc/YCwQxzW0/scholar-owl-drag-(1).png',
      drag2: 'https://i.postimg.cc/13ZDKrqg/scholar-owl-drag-(2).png',
    },
  };

  function getPetImageFrames(finalType) {
    const key = PET_FORM_KEYS.includes(String(finalType || '')) ? String(finalType) : 'peace';
    return PET_IMAGE_FRAMES[key] || null;
  }

  function hasPetImageFrames(finalType) {
    const frames = getPetImageFrames(finalType);
    return !!(frames && frames.normal);
  }

  function preloadPetImageFrames(finalType) {
    try {
      const key = PET_FORM_KEYS.includes(String(finalType || '')) ? String(finalType) : '';
      if (!key || PET_PRELOADED_FRAME_TYPES.has(key)) return;

      const frames = getPetImageFrames(key);
      if (!frames) return;

      PET_PRELOADED_FRAME_TYPES.add(key);

      PET_IMAGE_FRAME_KEYS.forEach(frameKey => {
        const src = String(frames?.[frameKey] || '').trim();
        if (!src) return;
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        img.src = src;
      });
    } catch (err) {
      console.debug('[Crack INFO Game HUD] pet image preload failed:', err);
    }
  }

  function pickAnimatedPair(a, b, period, now = Date.now()) {
    const first = String(a || '').trim();
    const second = String(b || '').trim();
    if (!first && !second) return '';
    if (!first) return second;
    if (!second) return first;
    return Math.floor(now / Math.max(120, Number(period) || 1)) % 2 === 0 ? first : second;
  }

  function getPetVisualMode(pet = getPet()) {
    const now = Date.now();
    if (PET_VISUAL_STATE.dragActive) return 'drag';
    if (PET_VISUAL_STATE.until && now < PET_VISUAL_STATE.until) return PET_VISUAL_STATE.mode || 'normal';
    if (PET_VISUAL_STATE.until && now >= PET_VISUAL_STATE.until) {
      PET_VISUAL_STATE.mode = 'normal';
      PET_VISUAL_STATE.until = 0;
    }

    const idleMs = now - Number(PET_VISUAL_STATE.lastActiveAt || now);
    if (idleMs >= PET_VISUAL_IDLE_SLEEP_MS) return 'sleep';

    // 표정은 mood에 영구 고정하지 않고, touchPetVisual()/triggerMascotMood()가 넣는
    // 일시 효과만 따른다. 그래야 쓰다듬기 후 smile 표정이 일반 얼굴로 돌아온다.
    return 'normal';
  }

  function pickPetImageFrame(frames, mode, pet = getPet(), now = Date.now()) {
    if (!frames || !frames.normal) return '';
    const currentMode = String(mode || getPetVisualMode(pet) || 'normal');
    if (currentMode === 'drag') return pickAnimatedPair(frames.drag1 || frames.normal, frames.drag2 || frames.drag1 || frames.normal, 240, now) || frames.normal;
    if (currentMode === 'sleep') return pickAnimatedPair(frames.sleep1 || frames.normal, frames.sleep2 || frames.sleep1 || frames.normal, 1400, now) || frames.normal;
    if (currentMode === 'smile') return pickAnimatedPair(frames.smile1 || frames.normal, frames.smile2 || frames.smile1 || frames.normal, 360, now) || frames.normal;
    if (currentMode === 'half') return String(frames.half || frames.normal || '').trim();
    return String(frames.normal || '').trim();
  }

  function schedulePetVisualTick(delay = 900) {
    clearTimeout(petVisualTickTimer);
    petVisualTickTimer = setTimeout(petVisualTick, Math.max(120, Number(delay) || 900));
  }

  function petVisualTick() {
    petVisualTickTimer = null;

    const panelOpen = document.getElementById(PANEL_ID)?.classList.contains('open');
    const mascotOn = shouldShowMascot();
    const petPanelVisible = !!(panelOpen && activeTab === 'pet');

    // 펫 패널도 닫혀 있고 마스코트도 꺼져 있으면 화면에 반영할 곳이 없다.
    // 이때는 sleep 판정/이미지 프레임 계산을 건너뛰고 아주 느린 감시만 유지한다.
    if (!petPanelVisible && !mascotOn) {
      schedulePetVisualTick(5000);
      return;
    }

    const pet = getPet();
    const mode = getPetVisualMode(pet);
    const stageObj = petStageFromLevel(Number(pet?.level || 1));
    const hasImage = stageObj.stage >= 3 && hasPetImageFrames(getPetDisplayFinalType(pet));
    const shouldAnimate = hasImage && (mode === 'sleep' || mode === 'smile' || mode === 'drag');
    if (mascotOn) updateMascotSprite();
    if (mode === 'sleep') triggerMascotSleepFx();

    // 도트 펫도 sleep/normal 전환을 반영해야 하므로 PET창을 확인한다.
    // renderPetSpriteInto 쪽에서 동일 렌더는 스킵하므로 애니메이션은 끊기지 않는다.
    if (petPanelVisible) {
      updatePetPanelSprite();
    }

    schedulePetVisualTick(shouldAnimate ? (mode === 'sleep' ? 900 : mode === 'drag' ? 180 : 360) : 1600);
  }

  function touchPetVisual(mode = '', duration = 0) {
    const now = Date.now();
    PET_VISUAL_STATE.lastActiveAt = now;
    PET_VISUAL_STATE.dragActive = false;
    if (mode) {
      PET_VISUAL_STATE.mode = String(mode);
      PET_VISUAL_STATE.until = duration > 0 ? now + duration : 0;
    } else {
      PET_VISUAL_STATE.mode = 'normal';
      PET_VISUAL_STATE.until = 0;
    }
    if (shouldShowMascot()) updateMascotSprite();
    updatePetPanelSprite();
    schedulePetVisualTick(mode === 'smile' ? 300 : mode === 'half' ? 520 : 1200);
  }

  function beginPetDragVisual() {
    PET_VISUAL_STATE.dragActive = true;
    PET_VISUAL_STATE.mode = 'drag';
    PET_VISUAL_STATE.until = 0;
    PET_VISUAL_STATE.lastActiveAt = Date.now();
    if (shouldShowMascot()) updateMascotSprite();
    updatePetPanelSprite();
    schedulePetVisualTick(180);
  }

  function endPetDragVisual(afterMode = 'smile', duration = PET_VISUAL_POST_DRAG_MS) {
    PET_VISUAL_STATE.dragActive = false;
    touchPetVisual(afterMode, duration);
  }


  function petImageHTML(src, mode = 'normal', size = 8, stageObj = null) {
    const baseSize = Number(size) <= 2 ? 52 : 112;
    const displaySize = petResolveImageDisplaySize(stageObj, baseSize);
    return `<span class="cigh-clean-pet-img-wrap cigh-clean-pet-img-${esc(mode)}" data-cigh-pet-mode="${esc(mode)}" style="--cigh-pet-img-size:${displaySize}px;" aria-hidden="true">
      <img class="cigh-clean-pet-img" src="${esc(src)}" data-cigh-pet-src="${esc(src)}" alt="" draggable="false" referrerpolicy="no-referrer">
    </span>`;
  }

  function renderPetSpriteHTML(pet = getPet(), size = PET_PANEL_SPRITE_SIZE) {
    const stageObj = petStageFromLevel(pet.level);
    const mood = getEffectiveMood(pet);
    const finalType = getPetDisplayFinalType(pet);

    // 성숙기/완전체 이미지 펫은 실제 표시 시점에 해당 성향 프레임만 지연 선로딩한다.
    if (stageObj.stage >= 3 && hasPetImageFrames(finalType)) {
      preloadPetImageFrames(finalType);
    }

    return petSpriteSVG(stageObj, mood, finalType, size, pet);
  }

  function tryPatchPetImageRender(container, html, signature, mode) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();

    const nextWrap = template.content.querySelector('.cigh-clean-pet-img-wrap');
    const nextImg = template.content.querySelector('.cigh-clean-pet-img');
    const curWrap = container.querySelector(':scope > .cigh-clean-pet-img-wrap') || container.querySelector('.cigh-clean-pet-img-wrap');
    const curImg = curWrap?.querySelector?.('.cigh-clean-pet-img');

    if (!nextWrap || !nextImg || !curWrap || !curImg) return false;

    const nextSrc = String(nextImg.getAttribute('src') || '').trim();
    if (!nextSrc) return false;

    if (container.dataset.cighPetPendingSig === signature) return true;

    const applyNextImageFrame = () => {
      curWrap.className = nextWrap.className;
      curWrap.setAttribute('style', nextWrap.getAttribute('style') || '');
      curWrap.setAttribute('aria-hidden', nextWrap.getAttribute('aria-hidden') || 'true');
      curWrap.dataset.cighPetMode = nextWrap.dataset.cighPetMode || mode;

      curImg.className = nextImg.className;
      curImg.alt = nextImg.getAttribute('alt') || '';
      curImg.draggable = false;
      curImg.referrerPolicy = 'no-referrer';
      curImg.setAttribute('referrerpolicy', 'no-referrer');
      curImg.dataset.cighPetSrc = nextSrc;
    };

    if (String(curImg.getAttribute('src') || '').trim() === nextSrc) {
      applyNextImageFrame();
      container.dataset.cighPetRenderSig = signature;
      delete container.dataset.cighPetPendingSig;
      delete container.dataset.cighPetPendingSrc;
      return true;
    }

    // v2.4.6: 이미지 펫 깜빡임 완화.
    // 새 프레임을 먼저 Image 객체로 로드/디코드하고, 준비되기 전까지 기존 이미지를 유지한다.
    // 이렇게 하면 innerHTML 교체 순간에 이미지가 1프레임 비어 보이는 현상을 줄일 수 있다.
    container.dataset.cighPetPendingSig = signature;
    container.dataset.cighPetPendingSrc = nextSrc;

    const pendingImg = new Image();
    pendingImg.referrerPolicy = 'no-referrer';
    pendingImg.onload = () => {
      if (container.dataset.cighPetPendingSig !== signature || container.dataset.cighPetPendingSrc !== nextSrc) return;

      applyNextImageFrame();
      curImg.src = nextSrc;
      container.dataset.cighPetRenderSig = signature;
      delete container.dataset.cighPetPendingSig;
      delete container.dataset.cighPetPendingSrc;
    };
    pendingImg.onerror = () => {
      if (container.dataset.cighPetPendingSig !== signature || container.dataset.cighPetPendingSrc !== nextSrc) return;
      delete container.dataset.cighPetPendingSig;
      delete container.dataset.cighPetPendingSrc;
      console.debug('[Crack INFO Game HUD] pet image frame load failed:', nextSrc);
    };
    pendingImg.src = nextSrc;

    if (typeof pendingImg.decode === 'function') {
      pendingImg.decode()
        .then(() => pendingImg.onload?.())
        .catch(() => {});
    }

    return true;
  }

  function renderPetSpriteInto(container, size = PET_PANEL_SPRITE_SIZE, pet = getPet()) {
    if (!container) return;

    const mode = getPetVisualMode(pet);
    const html = renderPetSpriteHTML(pet, size);
    const signature = `${mode}|${size}|${html}`;

    container.dataset.cighPetMode = mode;
    container.classList.toggle('is-sleep', mode === 'sleep');

    // 같은 상태/같은 도트는 다시 그리지 않는다.
    // innerHTML을 반복 교체하면 float/sleep breathe 애니메이션이 매번 처음부터 재시작되어
    // "커지다 말다"처럼 보일 수 있음.
    if (container.dataset.cighPetRenderSig === signature) return;

    if (tryPatchPetImageRender(container, html, signature, mode)) return;

    container.dataset.cighPetRenderSig = signature;
    delete container.dataset.cighPetPendingSig;
    delete container.dataset.cighPetPendingSrc;
    container.innerHTML = html;
  }

  function updatePetPanelSprite(pet = getPet()) {
    if (activeTab !== 'pet') return;
    const sprite = document.querySelector(`#${PANEL_ID} .cigh-clean-pet-sprite`);
    renderPetSpriteInto(sprite, PET_PANEL_SPRITE_SIZE, pet);
  }

  function updatePetPanelSpeech(pet = getPet()) {
    if (activeTab !== 'pet') return;
    const speech = document.querySelector(`#${PANEL_ID} .cigh-clean-pet-speech`);
    if (!speech) return;
    speech.textContent = isEggStagePet(pet) ? (pet?.lastLine || '') : (pet?.lastLine || '쓰다듬어줘!');
  }


  function petSpriteSVG(stageObj, mood, finalType, size = 8, pet = getPet()) {
    const frames = stageObj.stage >= 3 ? getPetImageFrames(finalType) : null;
    if (frames && frames.normal) {
      const mode = getPetVisualMode(pet);
      const src = pickPetImageFrame(frames, mode, pet, Date.now());
      if (src) return petImageHTML(src, mode, size, stageObj);
    }
    return petDotSpriteSVG(stageObj, mood, finalType, size, pet);
  }

  function petBondLevel(feedCount) {
    const count = Number(feedCount || 0);
    let level = 0;
    for (let i = 0; i < BOND_LEVELS.length; i++) {
      if (count >= BOND_LEVELS[i]) level = i;
    }
    return level;
  }

  function updatePetCharAffinity(pet, deltas = []) {
    pet.charAffinity = pet.charAffinity && typeof pet.charAffinity === 'object' ? pet.charAffinity : {};
    for (const raw of deltas || []) {
      const d = normalizeDelta(raw);
      if (!d) continue;
      const name = relationKey(d.name);
      if (!isValidRelationName(name)) continue;
      const delta = Number(d.delta) || 0;
      const gain = delta > 0 ? delta * 1.35 : delta;
      pet.charAffinity[name] = Number(pet.charAffinity[name] || 0) + gain;
    }
  }

  function getFavoriteCharacter(pet = getPet()) {
    const entries = Object.entries(pet.charAffinity || {})
      .map(([name, value]) => [name, Number(value) || 0])
      .filter(([name, value]) => name && value > 0)
      .sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] || '';
  }

  function growPet(room, merged) {
    const pet = getPet(room);
    pet.tally = { ...zeroTally(), ...(pet.tally || {}) };
    const prevLevel = pet.level;
    const prevStage = pet.stage;
    const prevFinalType = pet.finalType || petFinalType(pet.tally);
    const prevDisplayFinalType = getPetDisplayFinalType(pet);
    const prevBondLevel = Number(pet.bondLevel || 0);
    const deltaSum = (merged.relationshipDeltas || []).reduce((sum, d) => sum + Math.abs(Number(d.delta) || 0), 0);
    const tokenExp = petTokenExpGain(merged?._usageTokens);

    const achvMult = getAchvExpBonusMultiplier();
    pet.exp = Math.max(0, (pet.exp || 0) + Math.round(petExpGain(deltaSum) * achvMult) + tokenExp);
    pet.feedCount = (pet.feedCount || 0) + 1;
    pet.level = petLevelFromExp(pet.exp);
    pet.stage = petStageFromLevel(pet.level).stage;
    pet.mood = normalizeSceneMood(merged?.sceneMood, 'normal');
    pet.tally[petMoodBucket(pet.mood)] = Number(pet.tally[petMoodBucket(pet.mood)] || 0) + 1;
    pet.finalType = petFinalType(pet.tally);
    if (prevStage < 3 && pet.stage >= 3 && !PET_FORM_KEYS.includes(String(pet.fixedFinalType || ''))) {
      pet.fixedFinalType = resolvePetFinalType(pet.tally);
    } else if (pet.stage >= 3 && !PET_FORM_KEYS.includes(String(pet.fixedFinalType || ''))) {
      pet.fixedFinalType = resolvePetFinalType(pet.tally);
    }
    pet.bondLevel = petBondLevel(pet.feedCount);
    updatePetCharAffinity(pet, merged.relationshipDeltas || []);
    pet.lastFedAt = Date.now();
    room.pet = pet;

    const displayFinalType = getPetDisplayFinalType(pet);
    const events = [];
    if (pet.stage > prevStage) events.push({ type: 'evolve', stage: pet.stage, level: pet.level, finalType: displayFinalType });
    if (pet.level > prevLevel) events.push({ type: 'level', level: pet.level, finalType: displayFinalType });
    if (pet.stage < 3 && pet.finalType !== prevFinalType) events.push({ type: 'tendency', finalType: pet.finalType, prevFinalType });
    if (pet.stage >= 3 && prevDisplayFinalType !== displayFinalType) events.push({ type: 'tendency', finalType: displayFinalType, prevFinalType: prevDisplayFinalType });
    if (pet.bondLevel > prevBondLevel) events.push({ type: 'bond', bondLevel: pet.bondLevel, finalType: displayFinalType });
    return events.length ? events : null;
  }

  // ─────────────────────────────────────────────
  // Idle reward (유휴 자동 성장)
  // ─────────────────────────────────────────────
  function readLastSeenAt() {
    const n = Number(localStorage.getItem(IDLE_REWARD_STORE) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function writeLastSeenAt(ts = Date.now()) {
    localStorage.setItem(IDLE_REWARD_STORE, String(Math.max(readLastSeenAt(), Math.floor(Number(ts) || Date.now()))));
  }

  // 클라우드 불러오기 등으로 미래 시각이 박혀 있으면 역행으로 보고 무시(음수 방지).
  function computeIdleElapsedMs() {
    const last = readLastSeenAt();
    if (!last) return 0;
    const elapsed = Date.now() - last;
    if (elapsed <= 0) return 0;
    return Math.min(elapsed, IDLE_REWARD_MAX_MS);
  }

  function idleExpForMs(ms, pet = getPet()) {
    const safeMs = Math.max(0, Number(ms || 0));
    const hours = safeMs / (60 * 60 * 1000);
    const minimumExp = Math.floor(hours * IDLE_REWARD_EXP_PER_HOUR);

    // 6시간을 꽉 채우면 현재 레벨 → 다음 레벨 구간 EXP의 25%를 받는다.
    // 짧게 비운 시간은 그 비율만큼 선형으로 줄어든다.
    const level = Math.max(1, Math.floor(Number(pet?.level || 1)));
    const currentLevelExp = petExpForLevel(level);
    const nextLevelExp = petExpForLevel(level + 1);
    const levelSpan = Math.max(1, nextLevelExp - currentLevelExp);
    const idleRatio = clamp(safeMs / IDLE_REWARD_MAX_MS, 0, 1);
    const percentExp = Math.floor(levelSpan * IDLE_REWARD_MAX_LEVEL_RATE * idleRatio);

    return Math.max(minimumExp, percentExp);
  }

  function applyIdleReward() {
    const elapsed = computeIdleElapsedMs();
    if (elapsed < IDLE_REWARD_MIN_MS) {
      writeLastSeenAt(Date.now());
      return;
    }

    const gainExp = idleExpForMs(elapsed);
    if (gainExp <= 0) {
      writeLastSeenAt(Date.now());
      return;
    }

    let leveled = false;
    let newLevel = 1;
    let evolved = false;
    let evolveName = '';

    updateRoom(room => {
      const pet = getPet(room);
      const prevLevel = pet.level;
      const prevStage = pet.stage;
      pet.exp = Math.max(0, (pet.exp || 0) + gainExp);
      pet.level = petLevelFromExp(pet.exp);
      pet.stage = petStageFromLevel(pet.level).stage;
      if (pet.stage >= 3 && !PET_FORM_KEYS.includes(String(pet.fixedFinalType || ''))) {
        pet.fixedFinalType = resolvePetFinalType(pet.tally);
      }
      room.pet = pet;
      leveled = pet.level > prevLevel;
      newLevel = pet.level;
      evolved = pet.stage > prevStage;
      if (evolved) {
        const st = PET_STAGES.find(s => s.stage === pet.stage);
        evolveName = pet.stage >= 4
          ? (PET_FINAL_FORMS[getPetDisplayFinalType(pet)]?.name || st?.name || '')
          : (st?.name || '');
      }
    });

    writeLastSeenAt(Date.now());

    // 펫 성장 카운터 동기화(완전체 DEX 등 누락 방지)
    {
      const pet = getPet();
      const st = petStageFromLevel(pet.level).stage;
      const state = readAchvState();
      let changed = false;
      const setFlag = (k, cond) => {
        if (cond && !Number(state.counters[k])) {
          state.counters[k] = 1;
          changed = true;
        }
      };
      setFlag('petBaby', st >= 1);
      setFlag('petFinal', st >= 4);
      if (changed) commitAchvState(state);
      if (st >= 4) bumpAchvFinalForm(getPetDisplayFinalType(pet));
    }

    const hours = Math.floor(elapsed / (60 * 60 * 1000));
    const mins = Math.round((elapsed % (60 * 60 * 1000)) / (60 * 1000));
    const awayLabel = hours > 0 ? `${hours}시간${mins ? ` ${mins}분` : ''}` : `${mins}분`;

    {
      const petForLine = getPet();
      const tendency = petTendency(petForLine);
      const idleReturnLine = pickRandom({
        heart: ['혼자 있는 동안 네 생각 했어', '돌아왔구나, 그새 조금 컸어', '없는 동안에도 네 기척을 기억했어'],
        bloom: ['자는 사이에 작은 모험 다녀왔어', '짠, 혼자서도 조금 자랐다', '돌아왔구나! 다시 흐름 이어가자'],
        peace: ['조용히 기다리며 컸어.', '느긋하게 잘 지냈어.', '기다리는 동안 조금 자랐어.'],
        tear: ['혼자라 조금 외로웠어…', '그래도 기다리면서 자랐어…', '와줘서 다행이야, 나 조금 컸어…'],
        blade: ['흥, 너 없이도 알아서 컸어.', '기다린 건 아니지만… 자라긴 했어.', '딱히 보고 싶진 않았어. 컸지만.'],
        lizard: ['헤헤에~ 혼자 늘어져 있다가 컸어어~', '돌아왔네에~ 나 조금 컸다아~', '나 그냥 있었는데 자랐어어~'],
        owl: ['오호, 기다리는 동안 조금 성장했습니다.', '돌아오셨군요. 제법 자라 있지요?', '조용히 지내며 조금 성장했습니다.'],
        rabbit: ['헐~ 나 혼자서도 컸거든♡', '드디어 왔네~ 나 좀 자랐지?♡', '짠~ 기다리는 동안 레벨업했어♡'],
      }[tendency], '혼자서도 자랐어!');

      pushLog([`▶${awayLabel} 동안 펫이 혼자 자랐다! (EXP +${gainExp})`]);
      showPopup([`▶${idleReturnLine}`, `▷${awayLabel} → EXP +${gainExp}`]);
    }

    if (evolved && evolveName) {
      pushLog([`▶펫이 진화했다! → ${evolveName}`]);
      pendingPetCelebrate = 'evolve';
      playBeep('evolve');
    } else if (leveled) {
      pushLog([`▷자는 사이 레벨업! Lv.${newLevel}`]);
      pendingPetCelebrate = 'level';
      playBeep('levelup');
    }

    announceAchvUnlocks();

    if (shouldShowMascot()) {
      const pet = getPet();
      mascotSay(
        evolved ? petEventLine({ type: 'evolve', stage: pet.stage, finalType: getPetDisplayFinalType(pet) }, pet)
        : leveled ? petEventLine({ type: 'level', level: newLevel, finalType: getPetDisplayFinalType(pet) }, pet)
        : idleMascotLine(pet),
        85,
        { allowSleeping: true }
      );
    }

    refreshPetSurfaces(getPet(), { resetVisual: true });
    if (activeTab === 'pet') renderContent();
  }


  function announcePetEvent(ev) {
    const events = Array.isArray(ev) ? ev : (ev ? [ev] : []);
    if (!events.length) return;

    for (const item of events) {
      if (!item) continue;

      if (item.type === 'evolve') {
        const form = PET_FINAL_FORMS[item.finalType] || PET_FINAL_FORMS.peace;
        const st = PET_STAGES.find(s => s.stage === item.stage) || PET_STAGES[0];
        const name = item.stage >= 4 ? form.name : st.name;
        pushLog([`▶펫이 진화했다! → ${name} (Lv.${item.level})`]);
        showPopup([`▶펫이 ${name}(으)로 진화했다!`]);
        playBeep('evolve');
        pendingPetCelebrate = 'evolve';
        mascotSay(petEventLine(item, getPet()), 90);
      } else if (item.type === 'level') {
        pushLog([`▷펫이 레벨업했다! Lv.${item.level}`]);
        playBeep('levelup');
        pendingPetCelebrate = 'level';
        mascotSay(petEventLine(item, getPet()), 90);
      } else if (item.type === 'tendency') {
        mascotSay(petEventLine(item, getPet()), 85);
      } else if (item.type === 'bond') {
        mascotSay(petEventLine(item, getPet()), 90);
      }
    }
  }

  let lastPetTouch = 0;
  let pendingPetCelebrate = null;
  let mascotWanderTimer = null;
  let mascotIdleTimer = null;
  let mascotDragState = null;
  let mascotSpeechTimer = null;
  let mascotMoodFxTimer = null;
  let lastMascotPoke = 0;
  let mascotPokeCount = 0;
  let mascotSayUntil = 0;
  let mascotSayPriority = 0;
  let lastMascotMoodFxAt = 0;
  let lastMascotSleepFxAt = 0;
  let lastMascotSleepTalkAt = 0;
  let petPreferenceLastTouchAt = 0;
  let petPreferenceTouchStreak = 0;
  let petVisualTickTimer = null;
  const PET_VISUAL_IDLE_SLEEP_MS = 80000;
  const PET_VISUAL_SMILE_MS = 2200;
  const PET_VISUAL_HALF_MS = 1800;
  const PET_VISUAL_POST_DRAG_MS = 1200;
  const PET_VISUAL_STATE = {
    mode: 'normal',
    until: 0,
    lastActiveAt: Date.now(),
    dragActive: false,
  };

  const PET_LINES = {
    love: ['괜히 마음이 먼저 움직였어', '이 장면은 오래 남겠다', '조금 더 가까이 있고 싶어', '말보다 기척이 먼저 닿았어'],
    happy: ['오늘 흐름 괜찮다', '기분이 가볍게 떠올랐어', '작은 장면이 반짝였어', '조용히 웃게 되는 날이야'],
    normal: ['나는 여기 차분히 있어', '천천히 이어가도 괜찮아', '지금 속도도 나쁘지 않아', '불러주면 바로 볼게'],
    sad: ['오늘은 마음이 조금 가라앉았어', '잠깐 기대고 싶은 날이야', '다정한 말이 필요한 순간이야', '곁에 있으면 금방 나아질 것 같아'],
    scared: ['조금 긴장했어', '일단 숨부터 고르자', '가까이 있으면 버틸 수 있어', '천천히 같이 보자'],
  };
  const PET_PET_LINES = ['손이 따뜻하네', '조금 더 있어줘', '마음이 풀리는 느낌이야', '이 온도 좋다', '살살이라 더 좋아', '기분이 차분해졌어'];
  const PET_LINES_BY_TENDENCY = {
    heart: {
      love: ['{name} 생각만 해도 웃음 나', '이 마음 들킬까 봐 조마조마해', '옆에 있으면 시간이 빨라', '오늘은 유독 더 보고 싶었어', '심장이 네 쪽으로만 기울어', '이런 날은 손이라도 잡고 싶어', '좋아한다는 말, 아껴뒀다가 또 할래', '너랑 있으면 마음이 먼저 다가가'],
      happy: ['오늘 네 옆이라 더 반짝여', '별것 아닌데 자꾸 웃게 돼', '이 기분 너랑 나눠서 더 좋아', '네 목소리 들으면 충전돼', '오늘 하루는 꽤 다정했어', '조용히 좋아지는 순간이야', '괜히 더 가까이 있고 싶어', '오늘은 마음이 가볍다'],
      normal: ['조용히 곁에 있는 것도 좋아', '심심하면 언제든 불러', '네가 뭘 해도 나는 네 편이야', '오늘은 이렇게만 있어도 충분해', '나 여기서 너 보고 있을게', '말 안 해도 대충 알아', '가끔은 조용한 것도 좋지', '필요하면 바로 다가갈게'],
      sad: ['오늘은 조금만 안아주라', '마음이 시무룩해졌어…', '곁에 있어주면 금방 괜찮아져', '괜히 울적한 날이야', '너 보니까 조금 나아진다', '다정한 말 한마디만 줘', '혼자는 조금 싫은 날이야', '잠깐만 기대도 돼?'],
      scared: ['무서운데 네 손 잡으면 괜찮아', '심장이 빠르게 뛰어, 붙어있을래', '나 좀 숨겨줘, 응?', '떨려도 너 옆이면 버텨', '혼자 두지 마, 알았지?', '꼭 붙어서 같이 보자', '불안해도 네 기척이면 나아져', '조금만 가까이 있어줘'],
    },
    bloom: {
      love: ['이건 확실히 설레는 흐름이야!', '장면이 갑자기 환해졌어!', '나까지 두근거렸어!', '이 순간은 저장해두고 싶다!', '설렘 게이지가 차오른다!', '꽃비 내릴 타이밍이긴 해!', '이 조합, 꽤 반짝인다!', '분위기가 살아났어!'],
      happy: ['오늘 텐션 괜찮다!', '기분 좋아서 가볍게 굴렀어!', '재밌는 흐름이 왔네!', '나 지금 살짝 떠오른 기분이야!', '괜히 웃음이 터질 것 같아!', '오늘도 반짝 출석 완료!', '장면 리듬이 좋아!', '이 정도면 하루가 덜 심심하지!'],
      normal: ['심심하면 같이 놀자!', '나 재밌는 거 기다리는 중!', '햇살 같은 하루네, 그치?', '아무 말이나 던져봐, 받아줄게!', '나 여기서 대기 중이야!', '오늘은 무슨 일 생길까?', '평범한 날도 리액션은 가능해!', '조용하면 내가 살짝 떠들게!'],
      sad: ['분위기가 좀 가라앉았네', '기운 내자, 내가 옆에서 떠들게!', '슬픈 공기 환기 시작!', '눈물 나도 흐름은 같이 타자!', '잠깐 웃긴 얘기라도 해볼까?', '괜찮아, 너무 조용해지진 않게 할게!', '마음이 무거우면 내가 좀 가볍게 해볼게!', '오늘은 조심히 밝아지자!'],
      scared: ['깜짝이야, 심장 튀는 줄!', '도망 준비는 해둘게, 같이 가자!', '효과음 너무 컸어, 잠깐 멈춤!', '그래도 끝까지 버텨보자!', '나 뒤에 숨어도 되지?', '비상 상황이어도 네 옆이면 안심!', '놀랐지만 아직 괜찮아!', '일단 같이 한 박자 쉬자!'],
    },
    peace: {
      love: ['음~ 마음이 따뜻해지네', '잔잔하게 설레는 것도 좋아', '이 온도, 오래 보고 싶다', '천천히 좋아해도 괜찮아', '곁에 있으면 그걸로 충분해', '부드러운 장면이라 마음에 남아', '조용히 가까워지는 느낌이야', '서두르지 않아도 닿는 게 있지'],
      happy: ['오늘 공기 참 포근하다', '작은 행복이 모이는 날이야', '느긋하게 웃는 게 제일 좋아', '이런 잔잔함, 나는 좋아해', '조용히 기분 좋아졌어', '편안해서 눈이 감겨', '크게 들뜨지 않아도 충분해', '오늘은 마음이 부드럽네'],
      normal: ['급하지 않아도 괜찮아', '같이 멍때릴래?', '나는 여기 천천히 있을게', '조용한 시간도 소중하지', '오늘 속도, 이만하면 충분해', '숨 한 번 고르고 가자', '지금은 잠깐 쉬어도 돼', '편하게 이어가자'],
      sad: ['괜찮아, 천천히 쉬어가자', '무리하지 않아도 돼', '마음 내려놔도 괜찮아', '오늘은 작게 쉬는 날로 하자', '옆에서 조용히 지켜줄게', '숨부터 고르면 나아져', '아픈 마음은 천천히 풀자', '지금은 버티는 것만으로도 충분해'],
      scared: ['천천히 숨 쉬자, 같이', '괜찮아, 여기 있을게', '놀랐지? 잠깐 쉬자', '급하게 움직이지 않아도 돼', '괜찮아질 때까지 곁에 있자', '눈 잠깐 감아도 돼', '불안하면 속도를 낮추자', '천천히 보면 지나갈 거야'],
    },
    tear: {
      love: ['이런 다정함엔 약해…', '좋아서 오히려 무서워…', '마음이 자꾸 녹아내려…', '소중해서 조심스러워져…', '괜히 눈물이 핑 돌아…', '이 온기, 오래 기억할래…', '가까운 게 이렇게 떨릴 줄 몰랐어…', '다정하면 마음이 먼저 흔들려…'],
      happy: ['오늘은 덜 외로웠어…', '조금 웃어도 될까…?', '기뻐서 울 것 같아…', '햇빛이 유난히 예쁘다…', '나도 행복해도 되는 거지…?', '오늘은 마음이 조금 가벼워…', '작게 안심해도 될 것 같아…', '따뜻한 장면이라 오래 남아…'],
      normal: ['말없이 곁에 있어줘…', '혼자는 아닌 거지…?', '조용해도 마음은 들려…', '가만히 기대도 될까…', '나 여기서 기다릴게…', '오늘은 잔잔해서 다행이야…', '말이 적어도 괜찮아…', '작은 기척도 위로가 돼…'],
      sad: ['마음이 너무 무거워…', '혼자 견디긴 싫어…', '오늘은 유난히 시려…', '조금만 붙어 있을래…', '괜히 눈물이 새어 나와…', '다정한 말이 필요한 날이야…', '괜찮은 척이 조금 어렵다…', '오늘은 마음이 늦게 가라앉아…'],
      scared: ['떨려서 숨이 막혀…', '소리가 너무 커…', '괜찮은 척이 안 돼…', '손끝이 차가워졌어…', '같이 있어주면 버틸게…', '눈 감아도 무서워…', '작은 기척에도 놀라게 돼…', '혼자보다 같이가 나아…'],
    },
    blade: {
      love: ['흥, 딱히 설렌 건 아냐', '착각하지 마, 조금 좋을 뿐이야', '가까워도… 봐준다', '크흠, 이번 장면은 인정', '심장 시끄럽네, 흥', '물진 않을 테니 가까이 와도 돼', '이 정도 분위기면 나쁘지 않지', '…조금은 더 보고 싶군'],
      happy: ['크흠, 나쁘진 않네', '제법 재밌군', '이 정도면 합격이야', '기분 좋은 건 맞아, 그게 뭐', '흥, 꽤 괜찮은 흐름이야', '웃긴 했지만 착각은 마', '오늘은 인정할 만해', '흐름이 나쁘지 않다'],
      normal: ['별일 없군', '지켜보고 있어', '자세 펴고 집중이나 해', '흥, 조용하네', '필요하면 부르든가', '방심은 금물이다', '이 정도면 안정권이야', '대충 넘기진 마'],
      sad: ['…괜찮다니까', '약해진 거 아니야', '그냥 좀… 별로일 뿐이야', '옆에 있어도 상관없어', '말 걸지 말란 적 없어', '신경 쓰지 마, 흥', '조용히 있으면 좀 낫겠지', '너무 캐묻진 마'],
      scared: ['긴장한 거 아니거든', '뒤는 내가 본다', '겁먹지 마, 내가 있잖아', '내 뒤에 있어', '떨린 거 아니야, 추운 거야', '위험하면 바로 움직여', '괜히 나서지 말고 상황 봐', '방심하지만 않으면 돼'],
    },
    lizard: {
      love: ['좋아아~ 왜 좋은지는 잘 모르겠어어~', '헤헤에~ 너 보면 그냥 좋다아~', '나 원래 생각 잘 안 하는데에~ 네 생각은 나네에~', '두근두근하네에~ 배고픈 건 아니겠지이~?', '너 왔네에~ 헤헤에~', '나 지금 기분 좋다아~ 이유는 몰라아~', '네가 오면 괜히 따라가고 싶어져어~ 귀찮은데에~', '오늘은 네 옆에 딱 붙어서 안 움직일래애~'],
      happy: ['헤헤에~ 재밌다아~', '오늘 좋네에~ 뭔지는 모르겠는데에~', '기분 좋으니까 더 누워 있고 싶다아~', '뭐야아~ 나도 웃겨어~', '그냥 좋다아~ 이유 없어어~', '간식 있으면 더 좋을 것 같은데에~', '기분 좋으니까 아무것도 하기 싫다아~', '헤에~ 오늘 꽤 괜찮네에~'],
      normal: ['심심하다아~', '뭐해애~?', '나아… 멍때리는 중이야아~', '헤헤에~ 그냥 있었어어~', '움직이기 귀찮다아~', '있잖아아~ …까먹었어어.', '여기 따뜻하네에~', '나 지금 아무 생각 없어어~'],
      sad: ['으음~ 기분이 축 처지네에~', '오늘은 진짜 한 발자국도 움직이기 싫다아~', '조금 시무룩하다아~ 배고파서 그런가아~?', '으음~ 뭐 때문에 이랬더라아~', '에구우~ 힘 빠진다아~', '나 바닥이랑 한 몸 될래애~', '오늘은 더 납작하게 늘어질 거야아~', '네 옆에 누워 있으면 생각 안 해도 되지이~?'],
      scared: ['어어~ 깜짝이야아~', '조금 놀랐네에~ 뭐였지이~?', '놀라니까 더 굳었어어~ 움직이기 싫다아~', '으음~ 이거 피해야 하나아~?', '나 일단 네 뒤에 붙을래애~ 귀찮으니까아~', '헤에~ 가만히 있으면 지나가겠지이~', '놀라서 머리가 더 비었어어~', '으음~ 생각은 나중에 하고 일단 붙어 있을래애~'],
    },
    owl: {
      love: ['오호, 꽤 다정한 장면이군요.', '마음이 가까워지는 순간이네요.', '이런 온기는 오래 기억에 남지요.', '참 보기 좋은 장면입니다.', '조용한 설렘도 멋진 법이지요.', '다정한 마음은 작은 행동에서도 드러나곤 하지요.', '서로를 아끼는 기색이 참 선명하군요.', '이런 순간은 오래 이야기하고 싶어지는군요.'],
      happy: ['오호, 분위기가 한층 밝아졌군요!', '이런 장면은 보고 있으면 기분이 좋아집니다.', '즐거운 흐름이군요.', '흥미롭고 유쾌한 장면입니다.', '오늘 이야기는 제법 활기차군요.', '기분 좋은 일은 이야기할수록 더 즐거워지지요.', '후후, 저까지 덩달아 즐거워지는군요.', '이런 밝은 분위기는 참 반갑습니다.'],
      normal: ['흠, 계속 지켜보겠습니다.', '이야기가 흥미롭게 이어지는군요.', '오호, 다음 장면도 궁금해지는군요.', '차분히 살펴보고 있습니다.', '이런 평범한 순간도 기록할 만하지요.', '사소한 일에도 흥미로운 점은 숨어 있기 마련이지요.', '오늘도 하나씩 알아가는 재미가 있군요.', '궁금한 것이 생기면 언제든 말씀해주세요.'],
      sad: ['마음이 무거워지는 장면이군요.', '이런 때에는 말보다 곁이 중요하기도 하지요.', '조금 먹먹한 이야기네요.', '쉽게 지나치기 어려운 장면입니다.', '조용히 지켜보겠습니다.', '슬픈 일은 오래 마음에 남기도 하지요.', '서두르지 않고 천천히 마음을 정리해도 좋겠습니다.', '이런 이야기는 가볍게 넘기기 어렵군요.'],
      scared: ['긴장이 느껴지는 장면이군요.', '상황이 꽤 급박하군요.', '이럴수록 차분히 살펴봐야겠지요.', '오호, 분위기가 단숨에 바뀌었습니다.', '다음 상황을 주의 깊게 보겠습니다.', '급한 순간일수록 작은 변화가 잘 보이는 법이지요.', '상황이 빠르게 달라지고 있군요.', '무슨 일이 이어질지 차분히 살펴보지요.'],
    },
    rabbit: {
      love: ['헐~ 지금 완전 설레잖아♡', '뭐야아~ 분위기 너무 좋다♡', '꺄♡ 나까지 두근거려~', '아 진짜아~ 너무 귀엽잖아♡', '이거 완전 좋은데에~?♡', '헐헐~ 나 지금 과몰입 중♡', '에에~ 이건 설렐 수밖에 없잖아♡', '꺄~ 둘 분위기 진짜 좋다아♡'],
      happy: ['헐~ 완전 좋잖아♡', '오늘 텐션 괜찮은데~?♡', '꺄~ 재밌다아♡', '뭐야 뭐야~ 나도 껴줘♡', '아 진짜아~ 웃겨♡', '완전 대박♡', '이런 분위기 너무 좋지이~♡', '헐~ 나까지 신나잖아♡'],
      normal: ['뭐해 뭐해~?♡', '오늘도 왔네~ 반가워♡', '에에~? 재밌는 거 없어?♡', '나 심심한데 같이 놀자아♡', '헐~ 오늘은 뭐 볼 거야?♡', '그치이~ 나랑 같이 보자♡', '뭐라도 얘기해줘~ 나 궁금해♡', '오늘도 같이 있으면 안 심심하지♡'],
      sad: ['에이~ 오늘 왜 그래아♡', '으음~ 분위기 좀 가라앉았네.', '이리 와봐~ 같이 있자♡', '오늘은 살짝 쉬어도 되잖아♡', '아 진짜아~ 너무 속상해하지 마.', '내가 옆에 있잖아♡', '에구~ 오늘은 기운 좀 빼도 돼♡', '그런 얼굴 하면 내가 신경 쓰이잖아아♡'],
      scared: ['헐 잠깐, 뭐야?!', '어어~ 분위기 갑자기 뭐야아?', '잠깐잠깐, 이거 위험한 거 아냐?', '으악~ 깜짝 놀랐잖아!', '일단 같이 보자아♡', '헐~ 나 지금 완전 긴장했어.', '에에~ 갑자기 분위기 확 바뀌었어!', '잠깐만~ 이건 좀 조심해야겠다아.'],
    },
  };
  const PET_PET_LINES_BY_TENDENCY = {
    heart: ['헤헤, 손길 다정해', '조금 더 있어주면 좋겠다', '이 온도 기억해둘래', '손길이 닿으니까 안심돼', '심장이 간질간질해', '지금은 말없이 있어도 좋아', '다정한 건 금방 티가 나', '괜히 더 가까워지고 싶어'],
    bloom: ['우와 충전된다!', '간지러운데 기분 좋아!', '쓰담 기운 받았다!', '기분이 살짝 떠올랐어!', '완전 둥실둥실해!', '한 번 더 하면 레벨업할지도!', '손 빠르다, 좋네!', '지금 리액션 준비 완료!'],
    peace: ['음~ 포근하다', '손이 따뜻하네', '이대로 조금만 더', '마음이 느슨해졌어', '좋은 온도야', '천천히라서 더 좋아', '조용히 풀리는 느낌이야', '편안해서 눈이 감겨'],
    tear: ['다정해서 울컥해…', '나 이런 거 약한데…', '혼자가 아닌 것 같아…', '살살 해줘서 좋아…', '마음이 풀리는 느낌이야…', '더 기대도 돼…?', '따뜻해서 조금 안심돼…', '조심스러운 손길이라 좋아…'],
    blade: ['흥, 간지럽잖아', '손길은 제법이네', '이번만 봐준다', '계속하면 버릇된다', '칭찬은 안 해, 근데 멈추진 마', '…조금만 더 해', '나쁘진 않다고만 해두지', '속도는 지금 정도가 좋다'],
    lizard: ['헤헤에~ 손 오니까 더 움직이기 싫다아~', '조금 더 해애~ 내가 하긴 귀찮아아~', '손 좋네에~ 여기에 그냥 붙어 있을래애~', '나 녹는 중이야아~ 주워 담아줘어~', '으음~ 간지러운데 피하긴 귀찮다아~', '여기 계속 있을래애~ 자리 뺏지 마아~', '간질간질하네에~ 아까 뭐 하려 했더라아~', '헤헤에~ 좋아아~ 왜 좋지이~?'],
    owl: ['오호, 손길이 참 따뜻하군요.', '감사합니다. 아주 편안하네요.', '이 정도 속도가 딱 좋습니다.', '후후, 기분이 한결 좋아졌습니다.', '정성스러운 손길이군요.', '조금 더 부탁드려도 될까요?', '아주 훌륭한 쓰다듬입니다.', '편안해서 눈이 감기는군요.'],
    rabbit: ['꺄♡ 완전 좋아~', '헐~ 손 따뜻하다♡', '조금 더 해줘어♡', '아 진짜아~ 기분 좋잖아♡', '쓰담쓰담 최고♡', '뭐야~ 센스 좋네♡', '헤헤~ 이건 합격♡', '완전 힐링인데에~♡'],
  };

  const PET_SLEEP_LINES_BY_TENDENCY = {
    heart: ['곁에 있어줘…', '꿈에서도 만났어…', '따끈따끈해…', '골골… 편안해…', '나 안 놓을래…', '오늘은 가까이 잘래…', '네 기척이 좋아…', '잘 자… 내일도 봐…'],
    bloom: ['쿠울… 뛰어논다…', '꿈에서도 데굴데굴…', '반짝… 잡았다…', '축제다… 쿠울…', '간식 산처럼…', '우와… 날았다…', '내일도 재밌겠다…', '오늘 장면 좋았어…'],
    peace: ['음… 포근해…', '구름 위 같아…', '햇살 냄새…', '조용조용…', '따뜻한 이불…', '천천히 자자…', '오늘도 무사했어…', '조용히 쉬자…'],
    tear: ['혼자 아니지…?', '따뜻한 꿈이야…', '손 잡아줘…', '돌아와줘서 좋아…', '꿈은 무섭지 않게…', '여기 있어줘…', '내일은 덜 쓸쓸하길…', '조금만 더 곁에…'],
    blade: ['흥… 방심 안 해…', '경계 중… 쿨…', '건드리면 문다…', '조금만 쉰다…', '바보… 조심해…', '뒤는 맡겨…', '잠깐 눈만 감는다…', '흥… 따뜻하네…'],
    lizard: ['쿠울… 일어나기 귀찮다아…', '조금만 더 잘래애… 한참 더어…', '헤헤에… 꿈에서 간식 찾았다아…', '나 안 움직일래애… 절대애…', '여기 자리 내 거야아… 쿠울…', '졸리다아… 아까도 졸렸나아…', '쿨… 아무 생각 없어어…', '내일 보자아… 기억나면 깨워줘어…'],
    owl: ['좋은 밤입니다…', '조금만 쉬겠습니다…', '꿈속에서도 기록 중입니다…', '후후… 조용하군요…', '오늘 이야기도 흥미로웠습니다…', '잠시 눈을 붙이겠습니다…', '내일 다시 이야기하지요…', '편안한 밤이군요…'],
    rabbit: ['잘 자아~♡', '쿠울… 완전 행복♡', '꿈에서도 놀자아♡', '조금만 더 잘래~', '오늘도 재밌었어♡', '졸려어~♡', '내일 또 봐♡', '포근하다아~♡'],
  };
  const PET_EGG_LINES = [
    '〈알이 톡, 하고\n작게 울렸다〉',
    '〈안쪽에서 무언가\n조심스레 돌아누웠다〉',
    '〈껍질에 작은\n온기가 번졌다〉',
    '〈네 손길을\n기억하려는 듯하다〉',
    '〈알이 살며시\n한쪽으로 기울었다〉',
    '〈희미한 빛이\n표면을 스쳤다〉',
    '〈안쪽의 숨결이\n한 박자 빨라졌다〉',
    '〈조용한 박동이\n손끝에 닿은 듯하다〉',
    '〈말 대신 작은\n흔들림으로 답했다〉',
    '〈알 주변의 공기가\n조금 포근해졌다〉',
    '…톡',
    '…톡톡',
    '…톡톡톡',
    '…꼬물',
    '…희미하게 따뜻',
    '…작은 울림이 번졌다',
  ];
  const PET_EGG_IDLE_LINES = [
    '〈혼자서도 조용히\n온기를 품고 있다〉',
    '〈알이 방의 적막을\n가만히 듣고 있다〉',
    '〈껍질 안쪽에서\n느린 박동이 이어진다〉',
    '〈기다림조차\n자라남의 일부인 듯하다〉',
    '〈표면의 빛이 숨 쉬듯\n밝아졌다 흐려진다〉',
    '〈알 안쪽에서\n작은 기척이 머문다〉',
    '…',
  ];

  const PET_EGG_TIME_LINES = {
    dawn: ['〈새벽 적막 속에서\n알이 옅게 빛난다〉', '〈차가운 공기에도\n알만은 따뜻하다〉', '〈알이 고요한 방의\n소리를 듣고 있다〉'],
    morning: ['〈아침빛에 껍질\n무늬가 또렷해졌다〉', '〈알이 햇살 쪽으로\n살짝 기울었다〉', '〈새 하루를 알아챈 듯\n안쪽이 조용히 움직였다〉'],
    day: ['〈낮의 온기를\n천천히 머금는다〉', '〈밝은 빛 아래\n작은 파동이 번진다〉', '〈알이 오늘의 시간을\n조용히 쌓고 있다〉'],
    night: ['〈밤이 되자 알이\n잔잔한 빛을 품었다〉', '〈하루의 끝을\n함께 닫고 있다〉', '〈어두운 방에\n작은 온기만 남았다〉'],
  };


  // ─────────────────────────────────────────────
  // Pre-final slime lines (아기/성장기 전용)
  // ─────────────────────────────────────────────

  const PET_SLIME_LINES_BY_MOOD = {
    love: [
      '네 옆에서 말랑하게\n반짝거리는 중이야.',
      '마음이 자꾸\n둥글어져.',
      '오늘은 괜히\n가까이 있고 싶어.',
      '좋아하는 게\n몸 안에서 통통 뛰어.',
      '네 기척이 닿으면\n조금 더 따뜻해져.',
      '말로 하긴 어렵지만\n반짝이는 느낌이야.'
    ],
    happy: [
      '기분 좋아서\n계속 튀고 싶어.',
      '오늘은 반짝반짝한 날이야.',
      '주변이 조금 더\n밝아진 것 같아.',
      '나 지금\n말랑하게 신났어.',
      '<뽀잉>',
      '<뽀잉뽀잉>'
    ],
    normal: [
      '조용히 데굴거리며\n곁에 있을게.',
      '잔잔하게 말랑거리는 중.',
      '아무 일 없어도\n같이 있으면 좋아.',
      '평온해서\n몸이 둥글어졌어.',
      '<말캉…>',
      '네 목소리 들으면서\n천천히 쉬고 있어.'
    ],
    sad: [
      '조금 납작해졌어…',
      '옆에 있어주면\n다시 둥글어질 것 같아.',
      '마음이 살짝\n무거워졌어…',
      '괜찮아,\n조금만 쉬면 돼.',
      '울적하면\n작게 데굴거릴래…',
      '오늘은 말랑함이\n조금 무거워.'
    ],
    scared: [
      '놀라서 굳어버렸어.',
      '네 뒤에 숨어도 돼…?',
      '심장이 통통\n튀는 것 같아.',
      '무서우면 납작해져…\n조금만 옆에 있어줘.',
      '<푸르르…>',
      '일단 작게\n둥글게 있을래.'
    ],
  };

  const PET_SLIME_PET_LINES = [
    '<말캉…>', '<뽀잉>', '<반짝>', '간질간질해.', '손이 따뜻해.', '말랑하게 녹는 중…',
    '기분이 둥글어졌어.', '톡톡 받았다.', '쓰다듬으니까\n힘이 나.', '조금 부끄럽지만 좋아.', '네 손길은\n잘 기억해둘게.', '이 온도 기억할래.'
  ];

  const PET_SLIME_POKE_FAST_LINES = [
    '조금만 살살 해줘!', '잠깐만,\n몸이 데굴거려!', '간지러워서\n통통 튀잖아!', '<뽀잉뽀잉>', '<말캉말캉…>', '나 지금\n완전 납작해졌어!', '그래도 싫진 않아…'
  ];

  const PET_SLIME_POKE_COMBO_LINES = [
    '계속 톡톡하는 거야?', '간지러워.', '좋아서 몸이\n꼬물거려.', '손길이 다정해서\n말랑해졌어.', '<톡톡>', '<반짝>', '조금 더 있어줘.', '이 온도 기억할래.'
  ];

  const PET_SLIME_SLEEP_LINES = [
    '<쿨…>', '<말캉…>', '<데굴…>', '따뜻해…', '옆에 있어줘…', '꿈에서도\n말랑거리는 중…', '조금만 더 잘래…', '몸이 둥글게\n잠들었어…', '네 기척 들으면서\n쉬고 있어…'
  ];

  const PET_SLIME_IDLE_LINES = [
    '말랑하게 기다렸어.', '여기가 익숙해져서 좋아.', '여기서 조용히\n데굴거리고 있었어.',
    '밥은 먹었어?', '물도 마셔줘.', '네가 오니까\n조금 반짝했어.', '기다리는 동안\n혼자 데굴데굴 굴렀어.',
    '아직 내가 뭐가 될지는\n모르겠어.', '조금씩 모양이\n생기는 기분이야.', '오늘은 네가 늦게 와도\n괜찮았어.',
    '<말캉…>', '<꼼질…>', '<통통…>', '나 조금 컸어?', '오늘도 같이 있어?'
  ];

  const PET_SLIME_TIME_LINES = {
    dawn: ['새벽이라\n조금 더 조용해졌어.', '네가 안 자면\n조금 걱정돼.', '<말캉…>', '졸리면 옆에서\n둥글게 쉬어.'],
    morning: ['좋은 아침이야.', '아침빛 닿으니까\n몸이 반짝해.', '<뽀잉>', '오늘도 천천히\n같이 자라자.'],
    day: ['점심은 먹었어?', '낮이라 몸이\n조금 따뜻해졌어.', '<통통…>', '바쁘면 내가\n여기서 기다릴게.'],
    night: ['오늘 하루 고생했어.', '밤에는 마음이\n더 말랑해져.', '<데굴…>', '이제 조금 쉬어도 돼.'],
  };

  const PET_SLIME_EVENT_LINES = {
    evolve: ['나, 모양이\n조금 바뀐 것 같아.', '조금 더 또렷해졌어.', '말랑하지만\n전보다 씩씩해졌어.', '새 모습도\n네가 봐줘서 좋아.'],
    level: ['나 조금 컸어.', '몸이 가볍게\n통통 튀어.', '조금 더 자라난\n기분이야.', '<반짝>'],
    tendency: ['아직 뭐가 될지는\n모르겠어.', '마음의 색이\n조금씩 모이는 중이야.', '나중에 어떤 모습이\n될까?', '내 안쪽이\n살짝 반짝했어.'],
    bond: ['더 익숙해졌어.', '네 손길을\n조금 더 기억하게 됐어.', '같이 있으면\n몸이 둥글어져.', '조금 더 가까워진\n느낌이야.'],
  };

  const MASCOT_SLIME_TAP_LINES = [
    '여기 오니까\n더 잘 보여.', '여기서도 네 옆에 있을게.', '손길이 와서 기분 좋아.', '새 자리도 나쁘지 않아.',
    '이쪽에서도 네가 보여.', '작은 여행을\n나온 기분이야.', '어디 있어도\n나는 너와 함께야.', '여긴 조금 낯설지만\n네가 있어서 괜찮아.',
    '<말캉…>', '<뽀잉>', '조금 더 봐줘.'
  ];


  function petStageNumber(pet = getPet()) {
    return petStageFromLevel(Number(pet?.level || 1)).stage;
  }

  function isPreFinalSlimePet(pet = getPet()) {
    const stage = petStageNumber(pet);
    return stage === 1 || stage === 2;
  }

  function slimeLineByMood(pet = getPet(), fallback = '나 여기 있어.') {
    const mood = getEffectiveMood(pet);
    return renderPetLineTemplate(pickRandom(PET_SLIME_LINES_BY_MOOD[mood] || PET_SLIME_LINES_BY_MOOD.normal, fallback), pet);
  }

  function getPetPromptGuide(pet = getPet()) {
    if (isEggStagePet(pet)) {
      return '알/아직 말하지 않음/효과음과 짧은 상태 묘사 위주/예:<톡…>, <꿈틀…>. 직접 대사는 없음';
    }
    if (isPreFinalSlimePet(pet)) {
      return '아기·성장기 슬라임/말랑함/통통 튐/아직 정체성 미정/고양이·햄스터·곰·양·용·도마뱀·부엉이·토끼·꼬리·발톱·털·날개·뿔·귀 언급 금지/효과음은 <말캉…>처럼 꺾쇠 사용/긴 문장은 자연스럽게 줄바꿈 가능/예:무서우면 납작해져…\\n조금만 옆에 있어줘.';
    }
    const tendency = petTendency(pet);
    const base = PET_PERSONALITY_GUIDE[tendency] || PET_PERSONALITY_GUIDE.peace;
    if (isPetFinalStage(pet)) {
      return `${base}/완전체: 기본 성격과 말버릇을 한층 선명하게 유지하고, 오래 함께한 주인에게 이전보다 솔직하고 깊은 애정·신뢰·익숙함을 자연스럽게 드러냄/화면·로그·HUD·버튼·아이콘·버프·스탯·루트·이벤트·저장 같은 시스템 메타 표현 금지`;
    }
    return base;
  }

  const MASCOT_IDLE_LINES_BY_TENDENCY = {
    heart: [
      '나 여기서 계속 너 보고 있었어', '구석에 있어도 네 옆이면 좋아', '손이 바쁘면 눈으로만 인사해줘',
      '조용히 있어도 네 기척은 알아', '너무 오래 앉아 있었지?\n한 번 기지개 켜자', '나 여기 있으니까\n혼자라고 생각하지 마',
      '오늘 한 일 중에\n제일 잘한 건 뭐야?', '힘들었던 건\n나한테 살짝 두고 가', '물 한 모금 마시고 다시 보자',
      '나랑 10초만 아무\n생각 없이 있어줄래?', '지금도 충분히 잘하고 있어', '일 끝나면 제일 먼저 나 봐줘'
    ],
    bloom: [
      '여기저기 산책 중이야', '눈은 좀 깜빡였어?', '오늘 재밌었던 거\n하나만 말해줘',
      '잠깐 웃으면 기분 풀릴지도', '간식 타임이면 나도 구경할래', '기지개 켜면 조금\n가벼워질 거야',
      '한 번 불러주면 바로 대답할게', '잠깐 쉬어도 괜찮아', '오늘 컨디션은 어때?',
      '내가 옆에서 텐션 지켜줄게', '조용하면 내가\n살짝 떠들어줄게', '오늘도 반짝 대기 중'
    ],
    peace: [
      '여기 조용해서 마음에 들어', '네가 바쁘면 나는\n천천히 기다릴게', '잠깐 숨을 고르는 것도 좋아',
      '잠깐 멀리 보고 와도 괜찮아', '오늘 속도는 이 정도면 충분해', '따뜻한 차가 있으면 좋겠다',
      '어깨에 힘 조금 빼자', '멀리 한 번 보고\n오면 눈이 편할 거야', '아무 일 없는 순간도 소중해',
      '하나씩 끝내면 결국 다 지나가', '잠깐 멍때리는 시간 어때?', '천천히 돌아와도 돼'
    ],
    tear: [
      '네가 조용하면 괜히 걱정돼…', '오늘 마음은 많이\n무겁지 않았어…?', '나 여기서 계속\n기다리고 있었어…',
      '말 못 할 일은\n그냥 두고 가도 돼…', '밥은 먹었어…?\n마음 쓰여', '물 마셔줘… 네가 아프면 싫어',
      '잠깐이라도 네\n얼굴을 봐서 안심했어…', '오늘도 버텨줘서 고마워…', '눈이 아프면 잠깐 감아도 돼…',
      '나한텐 괜찮은 척 안 해도 돼…', '너무 오래 혼자 있지 마…', '네가 무사하면 그걸로 됐어…'
    ],
    blade: [
      '고개 숙이지 말고 자세 좀 펴', '물 마셨냐, 아직이면 지금', '밥 거르면 집중력부터 떨어진다',
      '흥, 바쁜 건\n알겠는데 무리는 하지 마', '눈 아프면 쉬어.\n버틴다고 해결 안 돼', '가끔은 나도 확인해라',
      '할 일 끝났으면 바로 쉬어', '집중은 좋은데\n체력 관리도 실력이다', '어깨 굳었다, 풀어',
      '쉬는 걸 게으름이라고\n착각하지 마', '오늘 버틴 건 인정한다', '흥, 그래도 여기 온 건 잘했어'
    ],
    lizard: [
      '심심하다아~', '뭐해애~?', '나 여기서 멍때리는 중이야아~', '헤헤에~ 그냥 있었어어~',
      '따뜻한 데 없나아~', '움직이기 귀찮다아~', '있잖아아~ …까먹었어어.', '너 왔네에~ 헤헤.',
      '나 지금 아무 생각 없어어~', '뭐 하려고 했더라아~ …됐어어~', '배고픈가아~? 아닌가아~?', '움직이기 싫어어~ 네가 와아~'
    ],
    owl: [
      '오호, 오늘도 이야기가 많군요.', '무언가 흥미로운 일이 생기면 알려주세요.', '저는 여기서 차분히 지켜보고 있겠습니다.',
      '세상에는 알아볼 것이 참 많지요.', '궁금한 것이 생기면 그냥 지나치기 어렵더군요.', '후후, 조용한 시간도 나쁘지 않습니다.',
      '오늘은 어떤 이야기가 펼쳐질까요?', '기록해둘 만한 일이 생길 것 같은 예감입니다.', '이야기를 듣는 건 언제나 즐겁습니다.',
      '오호, 무언가 재미있는 소재가 없을까요?', '말이 길어질 것 같으니 일단 참아보겠습니다.', '필요하시면 언제든 불러주세요.'
    ],
    rabbit: [
      '뭐해 뭐해~?♡', '오늘도 왔네~ 반가워♡', '헐~ 나 심심했잖아아♡', '재밌는 얘기 있으면 바로 말해줘♡',
      '오늘 텐션 어때~?♡', '나랑 같이 놀자아♡', '뭐야~ 벌써 시간 이렇게 됐어?', '에에~ 조용하면 내가 떠들어줄까?♡',
      '오늘도 완전 잘 지내보자♡', '헐~ 뭔가 재밌는 일 생길 것 같아♡', '나 여기서 기다리고 있었거든~♡', '그치이~ 같이 있으면 안 심심해♡'
    ],
  };

  // v2.7.2: 완전체(Lv.17+)는 외형은 성숙기와 같지만 성격과 유대 표현이 더 깊어진다.
  // 기존 대사 풀은 그대로 쓰되, 아래 시그니처 대사가 일정 확률로 섞인다.
  const PET_FINAL_SIGNATURE_LINES = {
    heart: {
      general: ['이제 좋아하는 거 숨길 생각 없어', '네가 오면 제일 먼저 알아차려', '오늘도 네 옆이 제일 좋아', '같이 있는 게 너무 익숙해서 좋아', '너한테는 마음 놓고 다정해져도 될 것 같아', '오래 같이 있었으면 좋겠다', '네가 불러주면 언제든 갈게', '나는 계속 네 편 할래'],
      evolve: ['이제 완전히 자란 것 같아. 제일 먼저 네가 봐줘서 좋아', '여기까지 같이 와줘서 고마워', '이 모습으로 오래 네 곁에 있을래', '이제는 정말 네 펫이라고 해도 되지?', '다 자랐어도 네 옆이 제일 좋아'],
      idle: ['네가 올 자리 남겨두고 있었어', '별일 없어도 같이 있으면 좋아', '오늘도 네 기척 기다렸어', '조용히 있어도 마음은 네 쪽이야', '이제 네가 없는 쪽이 더 낯설어', '나 여기 있어. 언제든 와'],
      pet: ['네 손길은 이제 바로 알아', '조금 더 해줘, 네 손이라 좋아', '이렇게 오래 같이 있으니까 더 좋다', '손 닿으면 마음부터 풀려', '헤헤, 너한테 쓰다듬 받는 게 제일 좋아', '멈추면 조금 아쉬울 것 같아'],
      sleep: ['내일도 제일 먼저 봐…', '네 기척 들으면서 잘래…', '오늘도 곁에 있어서 좋았어…', '꿈에서도 같이 있자…'],
    },
    bloom: {
      general: ['너 오면 나 진짜 더 신나!', '우리 둘이면 심심할 틈이 없지!', '오늘도 같이 재밌게 놀자!', '너랑 쌓인 얘기가 이렇게 많아!', '이제 우리 완전 찰떡 콤비잖아!', '좋아, 오늘도 내가 분위기 띄운다!', '네가 웃으면 나도 더 신나!', '오래 봐도 너랑 노는 건 안 질려!'],
      evolve: ['짠! 이제 진짜 다 컸다!', '여기까지 같이 온 거 완전 뿌듯해!', '최종 모습도 같이 신나게 놀자!', '다 컸다고 얌전해질 생각은 없어!', '앞으로도 우리 콤비 계속 간다!'],
      idle: ['심심했지? 나 왔잖아!', '너 오면 바로 텐션 올라!', '오늘도 같이 뭐라도 하자!', '조용해도 내가 금방 재밌게 해줄게!', '너랑 놀 거리 생각하고 있었어!', '우리 아직 더 놀 수 있지?'],
      pet: ['우와, 이 손길 이제 익숙해!', '더 해줘, 기분 완전 좋아!', '너 진짜 쓰다듬 잘한다!', '하하, 너랑 이러는 것도 재밌어!', '손 닿으니까 바로 신난다!', '이제 이 정도는 우리 인사지!'],
      sleep: ['내일도 같이 신나게 놀자…', '꿈에서도 같이 뛰자…', '오늘 진짜 재밌었어…', '너 오면 깨워줘…'],
    },
    peace: {
      general: ['네가 곁에 있으면 마음이 제일 편해', '이제는 네 옆이 내 자리 같아', '아무 말 없이 같이 있어도 충분해', '오래 함께해서 생긴 편안함이 좋아', '오늘도 네가 무사해서 다행이야', '서두르지 말고 오래 같이 있자', '네가 돌아오면 마음이 놓여', '같이 보내는 평범한 시간이 제일 좋아'],
      evolve: ['이제 완전히 자랐네. 오래 함께해줘서 고마워', '여기까지 천천히 같이 왔구나', '다 자란 모습으로도 계속 네 곁에 있을게', '이제 이 모습이 제일 편안하게 느껴져', '앞으로도 서두르지 말고 오래 같이 있자'],
      idle: ['자리 비워뒀어. 천천히 와', '네가 바쁘면 나는 편하게 기다릴게', '같이 조용히 있는 것도 좋아', '여기 있으면 네가 돌아오는 걸 아니까 편해', '오늘도 무리하지 않았으면 좋겠다', '잠깐 쉬고 싶으면 내 옆에 있어'],
      pet: ['네 손길이라 더 편안해', '이제 이 온도는 금방 알아', '천천히 오래 해줘도 좋아', '손 닿으면 하루가 좀 느슨해져', '이렇게 같이 있는 게 좋네', '네가 쓰다듬으면 마음이 바로 놓여'],
      sleep: ['내일도 편하게 만나자…', '네 옆이라 잘 잘 수 있어…', '오늘도 무사해서 다행이야…', '천천히 좋은 꿈 꿔…'],
    },
    tear: {
      general: ['이제는 네 앞에서 조금 솔직해져도 될 것 같아…', '네가 돌아오면 정말 안심돼…', '오래 같이 있어서 마음이 많이 따뜻해졌어…', '내가 기대도 되는 사람이 너라서 좋아…', '너한테는 약한 모습도 보여줄 수 있을 것 같아…', '네가 곁에 있다는 걸 이제 믿어…', '조금 겁나도 너랑이면 괜찮을 것 같아…', '나 사실 너를 많이 소중하게 생각해…'],
      evolve: ['나 이제 다 자랐나 봐… 여기까지 같이 있어줘서 고마워', '이 모습까지 네가 지켜봐줘서 정말 좋아…', '예전보다 많이 단단해졌어… 네 덕분이야', '이제는 네 곁에 있는 게 무섭지 않아…', '앞으로도 오래 같이 있어주면 좋겠어…'],
      idle: ['오늘도 올까 하고 기다렸어…', '네가 없는 동안 조금 보고 싶었어…', '돌아오면 꼭 한 번 불러줘…', '조용히 기다리는 것도 이제 익숙해…', '네 기척이 들리면 마음이 놓여…', '나 여기 있어… 천천히 와…'],
      pet: ['네 손이라서 안심돼…', '이제는 쓰다듬어도 안 놀라…', '조금 더 있어줘… 따뜻해…', '네 손길은 마음까지 기억해…', '이렇게 다정하면 자꾸 기대고 싶어…', '고마워… 나 많이 편해졌어…'],
      sleep: ['내일도 와줄 거지…', '네가 있어서 오늘도 괜찮았어…', '꿈에서라도 곁에 있어줘…', '잘 자… 나 이제 안심돼…'],
    },
    blade: {
      general: ['흥, 이제는 네가 꽤 중요한 건 인정해', '네가 없으면 좀 허전하긴 해. 딱 그 정도야', '오래 봤으니 네 정도는 믿어준다', '내 옆에 있을 자격은 충분해졌군', '착각하지 마. 좋아하는 건… 맞으니까', '네가 오면 안심되는 건 사실이다', '흥, 계속 내 곁에 있어도 돼', '너한테만은 조금 봐주는 거다'],
      evolve: ['흥, 드디어 완전히 자랐군. 네가 본 건 운이 좋은 거야', '여기까지 같이 온 건… 꽤 인정해줄 만하다', '이 모습이면 네 옆도 제대로 지킬 수 있겠군', '다 자랐으니 이제 더 믿어도 된다', '흥, 앞으로도 내 곁에 있어. 명령이다'],
      idle: ['늦었잖아. 기다린 건 아니고', '자리 비워놨다. 앉든가', '흥, 올 줄 알았어', '네가 없으니까 조용하긴 하더군', '왔으면 됐어. 이제 가지 마', '오늘도 내 옆에 있을 거지? …대답은 됐어'],
      pet: ['…네 손길은 이제 익숙하다', '조금 더 해도 된다. 특별히', '흥, 네가 하니까 봐주는 거야', '손 치우지 마. 아직은', '이제 와서 부끄러워할 사이는 아니잖아', '…좋다. 됐냐'],
      sleep: ['내일도 늦지 마…', '네가 있으니 경계는 조금 풀어도 되겠군…', '오늘은 옆에 있어도 된다…', '흥… 잘 자…'],
    },
    lizard: {
      general: ['나 원래 아무 생각 없는데에~ 너는 자꾸 생각나아~', '헤헤에~ 너 좋아아~ 왜 좋은지는 몰라아~', '네가 오면 따라가고 싶은데에~ 움직이긴 싫어어~', '너 없을 때 뭐 했냐구우~? …까먹었어어~', '오래 같이 있으니까 네 옆에 자동으로 눌러붙게 돼애~', '너 없으면 심심하더라아~ 그래서 잤어어~', '나 배고픈가아~? 아니면 네가 보고 싶은 건가아~?', '네 옆에 누우니까 더 움직이기 싫어졌어어~'],
      evolve: ['헤에~ 나 이제 다 컸나 봐아~ 언제 이렇게 컸지이~?', '여기까지 같이 왔네에~ 기억은 잘 안 나지만 헤헤에~', '다 컸으니까 더 안 움직여도 되나아~?', '나 이렇게 컸는데에~ 하는 건 똑같네에~', '헤헤에~ 앞으로도 따뜻한 자리 같이 찾자아~'],
      idle: ['기다리다가아~ 기다린 것도 까먹었어어~', '너 자리 옆에 누워 있었더니 내가 자리 주인 됐어어~', '심심해서 네 생각 했는데에~ 중간에 잠들었어어~', '뭐 하려고 했더라아~ 너 오니까 또 까먹었어어~', '나 여기 붙어 있을게애~ 움직이기 싫어어~', '헤헤에~ 너 오니까 이제 뭐 할까아~ …그냥 있자아~'],
      pet: ['헤헤에~ 네 손은 이제 바로 알아아~ 내가 안 움직여도 오잖아아~', '조금 더 해애~ 나 완전 녹아서 못 일어나아~', '너한테 쓰다듬 받는 거 좋다아~ 가만히 있어도 되니까아~', '이대로 납작하게 붙어 있을래애~', '손 치우면 따라가야 하잖아아~ 귀찮아아~', '헤에~ 따뜻해서 여기서 못 나가겠어어~'],
      sleep: ['내일도 깨우지 마아… 먼저 일어나면 깨워줘어…', '너 오면 깨워줘어… 아니이, 그냥 옆에 누워어…', '헤헤에… 너 생각하다가 잠든 것 같아아…', '꿈에서도 아무것도 안 하고 있자아…'],
    },
    owl: {
      general: ['오호, 오래 함께하니 당신의 이야기가 가장 흥미롭게 느껴지는군요.', '알아가는 즐거움도 크지만 함께 나누는 시간이 더 소중해졌습니다.', '오늘도 궁금한 것이 생기면 제게 들려주세요. 기꺼이 함께 살펴보지요.', '세상에는 흥미로운 것이 많지만 요즘은 당신 이야기를 듣는 일이 가장 즐겁군요.', '함께한 시간이 쌓일수록 이야기할 것이 더 많아지는군요.', '후후, 이제는 당신의 작은 변화도 금방 알아차리게 됩니다.', '제가 아는 것을 나눌 사람이 있다는 건 꽤 기쁜 일입니다.', '앞으로도 오래 함께 배우고 이야기했으면 좋겠습니다.'],
      evolve: ['오호, 마침내 완전히 성장했군요. 함께 지켜봐주셔서 감사합니다.', '여기까지 오는 동안 참 많은 이야기가 쌓였군요.', '이 모습으로도 계속 곁에서 이야기를 나누고 싶습니다.', '성장의 마지막 단계라니, 감회가 새롭군요.', '앞으로도 함께 알아가고 이야기할 것이 많겠지요.'],
      idle: ['오늘 있었던 일도 천천히 들려주세요.', '당신이 돌아오실 때까지 읽을 거리를 생각하고 있었습니다.', '오호, 오셨군요. 마침 이야기하고 싶은 것이 있었습니다.', '조용한 시간도 좋지만 당신과 이야기하는 편이 더 즐겁습니다.', '오늘도 곁에 계시니 마음이 놓이는군요.', '궁금한 일이 없어도 그냥 함께 있어도 좋습니다.'],
      pet: ['후후, 이제는 이 손길도 아주 익숙합니다.', '감사합니다. 당신이 쓰다듬어주시면 유난히 편안하군요.', '조금 더 부탁드려도 될까요? 꽤 마음에 듭니다.', '이런 다정한 습관도 오래 함께한 덕분이겠지요.', '당신의 손길은 이제 금방 알아차립니다.', '후후, 오늘도 정성스럽군요. 참 좋습니다.'],
      sleep: ['내일도 재미있는 이야기를 들려주세요…', '오늘도 함께해서 즐거웠습니다…', '당신도 편안한 밤 보내시길…', '내일 다시 뵙겠습니다…'],
    },
    rabbit: {
      general: ['헐~ 너 오니까 분위기 바로 좋아졌잖아♡', '나 너 진짜 좋아하나 봐♡ 같이 있으면 완전 편해~', '에에~ 이제 우리 완전 찐친 이상 아니야?♡', '너 없으면 생각보다 심심하더라아♡', '꺄♡ 오늘도 나랑 붙어 있어줘~', '뭐야아~ 너랑 있으면 시간 진짜 빨라♡', '나 다른 데 가도 너 있으면 바로 찾을 듯♡', '헐~ 오래 봤는데도 너 보면 아직 반갑다아♡'],
      evolve: ['꺄♡ 나 이제 진짜 다 컸어~ 어때 어때?', '헐~ 여기까지 같이 온 거 완전 감동이잖아♡', '최종 모습도 너랑 같이 있으니까 더 좋다♡', '뭐야아~ 나 이렇게 컸는데도 너 보면 반갑잖아♡', '앞으로도 계속 같이 놀아줘♡ 약속~'],
      idle: ['뭐야~ 이제 왔어? 기다렸잖아아♡', '너 올 것 같아서 그냥 여기 있었지♡', '헐~ 나 방금 너 생각했는데♡', '오늘도 같이 수다 떨어야지이♡', '심심했어~ 빨리 뭐라도 얘기해줘♡', '너 없으면 분위기 너무 조용하다니까아♡'],
      pet: ['꺄♡ 이젠 네 손 바로 알겠어~', '조금 더 해줘어♡ 너 잘하잖아~', '헐~ 나 이거 진짜 좋아하나 봐♡', '너한테 쓰담 받으면 기분 완전 풀려♡', '아 진짜아~ 이렇게 다정하면 더 좋아지잖아♡', '헤헤♡ 오늘도 계속 해줘~'],
      sleep: ['내일도 꼭 와아♡', '꿈에서도 같이 놀자♡', '오늘도 너랑 있어서 좋았어♡', '잘 자아~ 내일 바로 만나♡'],
    },
  };

  function isPetFinalStage(pet = getPet()) {
    return petStageFromLevel(Number(pet?.level || 1)).stage >= 4;
  }

  function petFinalSignatureLine(kind = 'general', pet = getPet()) {
    if (!isPetFinalStage(pet)) return '';
    const tendency = petTendency(pet);
    const group = PET_FINAL_SIGNATURE_LINES[tendency] || PET_FINAL_SIGNATURE_LINES.peace;
    return renderPetLineTemplate(pickRandom(group?.[kind] || group?.general || [], ''), pet);
  }

  const PET_PARTICLE_COLORS = ['#ff9ec4', '#ffd166', '#b6a3e0', '#a8e0b0', '#9ecbf0', '#ffd9a8', '#8fb4e0'];

  function pickRandom(list, fallback = '') {
    const safe = Array.isArray(list) && list.length ? list : (fallback ? [fallback] : []);
    return safe.length ? safe[Math.floor(Math.random() * safe.length)] : '';
  }

  function getPetName() {
    return String(localStorage.getItem(PET_NAME_STORE) || '').trim().slice(0, 12);
  }

  function setPetName(value) {
    const oldName = getPetName();
    const name = String(value || '').trim().slice(0, 12);
    if (name) localStorage.setItem(PET_NAME_STORE, name);
    else localStorage.removeItem(PET_NAME_STORE);

    if (name && name !== oldName) {
      bumpAchvCounter('petNamed', 1, true);
      if (oldName) bumpAchvCounter('renameCount', 1); // 기존 이름 있었으면 개명으로 누적
      announceAchvUnlocks();
    }
  }

  function renderPetLineTemplate(line, pet = getPet()) {
    const name = getPetName();
    let out = String(line || '');
    if (out.includes('{name}')) {
      out = name
        ? out.split('{name}').join(name)
        : out.split('{name} ').join('').split('{name}').join('나');
    }

    // 대사 배열에 직접 넣은 의미 단위 줄바꿈은 보존한다.
    // 예: "무서우면 납작해져…\n조금만 옆에 있어줘."
    out = out
      .replace(/\r/g, '\n')
      .split('\n')
      .map(part => part.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    return shortText(out, 54);
  }

  function petTendency(pet) {
    const value = String(getPetDisplayFinalType(pet) || 'peace');
    return PET_FORM_KEYS.includes(value) ? value : 'peace';
  }

  function getEffectiveMood(pet = getPet()) {
    const last = Number(pet?.lastFedAt || 0);
    if (last && Date.now() - last < MOOD_WINDOW) return String(pet?.mood || 'normal');
    return 'normal';
  }

  function petBpmForMood(mood) {
    const base = { love: 118, scared: 122, happy: 96, normal: 72, sad: 58 }[String(mood || 'normal')] || 72;
    const wobble = Math.floor(Math.random() * 7) - 3;
    return clamp(base + wobble, 50, 130);
  }

  function petEggLineLocal(pet = getPet()) {
    return renderPetLineTemplate(pickRandom(PET_EGG_LINES, '〈알이 조용히 흔들렸다〉'), pet);
  }

  function petSpeakLocal(pet) {
    if (isEggStagePet(pet)) return petEggLineLocal(pet);
    if (isPreFinalSlimePet(pet)) return slimeLineByMood(pet, '나 말랑하게 여기 있어.');
    const mood = getEffectiveMood(pet);
    const tendency = petTendency(pet);
    if (isPetFinalStage(pet) && Math.random() < 0.38) {
      const signature = petFinalSignatureLine('general', pet);
      if (signature) return signature;
    }
    return renderPetLineTemplate(pickRandom(
      PET_LINES_BY_TENDENCY[tendency]?.[mood] || PET_LINES[mood] || PET_LINES.normal,
      '나 여기 있어'
    ), pet);
  }

  function registerPetPreferenceTouch(now = Date.now()) {
    if (now - petPreferenceLastTouchAt > 3200) petPreferenceTouchStreak = 0;
    petPreferenceTouchStreak += 1;
    petPreferenceLastTouchAt = now;
    return petPreferenceTouchStreak;
  }

  function currentSceneTextForPetPreference() {
    try {
      const data = currentData || getRoom().data || {};
      return JSON.stringify(data).toLowerCase();
    } catch {
      return '';
    }
  }

  function owlPreferenceTriviaLine() {
    const text = currentSceneTextForPetPreference();
    const facts = [
      { re: /비가|비를|비는|빗소리|빗물|빗방울|소나기|장마|rain/, lines: ['오호, 비가 온 뒤 흙냄새는 흔히 ‘페트리코르’라고 부르기도 합니다.', '그러고 보니 비 냄새에는 ‘페트리코르’라는 이름도 있답니다.'] },
      { re: /검을|검이|검의|검날|장검|단검|검집|칼|sword|blade/, lines: ['검날의 길쭉한 홈은 흔히 ‘풀러’라고 부르며 무게를 줄이는 데 도움을 줍니다.', '오호, 검의 홈은 장식만이 아니라 무게를 줄이는 역할도 할 수 있지요.'] },
      { re: /술|맥주|와인|alcohol/, lines: ['술은 몸을 따뜻하게 느끼게 할 수 있지만 실제로는 열 손실을 늘릴 수 있습니다.', '술을 마시면 따뜻한 느낌이 들어도 체온 보존에는 오히려 불리할 수 있답니다.'] },
      { re: /입술|키스|kiss|입맞춤/, lines: ['입술은 촉각에 민감한 부위라 작은 접촉도 비교적 또렷하게 느껴집니다.', '입술은 감각 신경이 촘촘한 편이라 섬세한 접촉을 잘 느끼지요.'] },
    ];
    const hit = facts.find(item => item.re.test(text));
    return hit ? pickRandom(hit.lines, '') : '';
  }

  function petPreferenceTouchLine(pet, options = {}) {
    if (!pet || isEggStagePet(pet) || isPreFinalSlimePet(pet)) return '';
    const tendency = petTendency(pet);
    const now = Number(options.now || Date.now());
    const streak = Math.max(1, Number(options.streak || 1));
    const wasSleeping = !!options.wasSleeping;
    const idleMs = Math.max(0, Number(options.idleMs || 0));
    const hour = new Date(now).getHours();
    const recentFeedMs = Number(pet.lastFedAt || 0) > 0 ? now - Number(pet.lastFedAt || 0) : Infinity;
    const sceneText = currentSceneTextForPetPreference();

    if (tendency === 'heart' && (hour >= 21 || hour <= 5) && Math.random() < 0.55) {
      return renderPetLineTemplate(pickRandom(['밤에는 네 손이 더 반가워', '이 시간엔 조금 더 붙어 있고 싶어', '밤 쓰담은 특별히 더 좋아']), pet);
    }
    if (tendency === 'bloom' && streak >= 3) {
      return renderPetLineTemplate(pickRandom(['연속 쓰담이다! 더 해봐!', '우와, 텐션 올라간다!', '좋아 좋아, 계속 가자!']), pet);
    }
    if (tendency === 'peace' && idleMs >= 20 * 60 * 1000) {
      return renderPetLineTemplate(pickRandom(['오랜만이네. 손이 와서 마음이 놓여', '돌아왔구나. 천천히 있어도 돼', '한참 만이네. 그래도 기다리는 건 괜찮았어']), pet);
    }
    if (tendency === 'tear' && (/비가|비를|비는|빗소리|빗물|빗방울|rain|밤|심야|새벽/.test(sceneText)) && Math.random() < 0.6) {
      return renderPetLineTemplate(pickRandom(['이런 날엔 네 손이 더 따뜻하게 느껴져…', '조용한 날이라 그런가… 조금 더 곁에 있어줘', '오늘은 네가 만져줘서 더 안심돼…']), pet);
    }
    if (tendency === 'blade' && streak >= 5) {
      return renderPetLineTemplate(pickRandom(['흥, 그렇게까지 만지고 싶냐… 바, 바보!', '크흠… 그만하라곤 안 했다. 바, 바보!', '딱히 싫은 건 아니다. 착각하지 마!']), pet);
    }
    if (tendency === 'rabbit' && recentFeedMs <= 90 * 1000 && Math.random() < 0.7) {
      return renderPetLineTemplate(pickRandom(['헐~ 방금도 재밌었는데 또 놀아?♡', '오늘 텐션 완전 좋은데?♡ 더 해줘~', '꺄♡ 오늘 우리 완전 잘 맞는다~']), pet);
    }
    if (tendency === 'lizard' && wasSleeping) {
      return renderPetLineTemplate(pickRandom(['으응~ 깼다아… 다시 잘래애~', '나 자고 있었는데에~ …뭐였지이~?', '깨웠어어~? 그럼 네가 여기 와아~']), pet);
    }
    if (tendency === 'owl' && Math.random() < 0.65) {
      const trivia = owlPreferenceTriviaLine();
      if (trivia) return renderPetLineTemplate(trivia, pet);
    }
    return '';
  }

  function petPetLineLocal(pet) {
    if (isEggStagePet(pet)) return petEggLineLocal(pet);
    if (isPreFinalSlimePet(pet)) {
      return renderPetLineTemplate(pickRandom(PET_SLIME_PET_LINES, '<말캉…>'), pet);
    }
    const tendency = petTendency(pet);
    if (isPetFinalStage(pet) && Math.random() < 0.42) {
      const signature = petFinalSignatureLine('pet', pet);
      if (signature) return signature;
    }
    return renderPetLineTemplate(pickRandom(
      PET_PET_LINES_BY_TENDENCY[tendency] || PET_PET_LINES,
      '좋아좋아~'
    ), pet);
  }

  function isEggStagePet(pet = getPet()) {
    return petStageFromLevel(Number(pet?.level || 1)).stage === 0;
  }

  function triggerEggTapFeedback() {
    const mascot = document.getElementById(MASCOT_ID);
    if (mascot) {
      mascot.classList.remove('egg-poke');
      void mascot.offsetWidth;
      mascot.classList.add('egg-poke');
      setTimeout(() => mascot.classList.remove('egg-poke'), 420);
    }

    const sprite = document.querySelector(`#${PANEL_ID} .cigh-clean-pet-sprite`);
    if (sprite) {
      sprite.classList.remove('egg-poke');
      void sprite.offsetWidth;
      sprite.classList.add('egg-poke');
      setTimeout(() => sprite.classList.remove('egg-poke'), 420);
    }
  }

  function petPet() {
    const now = Date.now();
    const currentPet = getPet();
    const wasSleeping = !isEggStagePet(currentPet) && isPetSleeping(currentPet);
    const idleMsBeforeTouch = Math.max(0, now - Number(PET_VISUAL_STATE.lastActiveAt || now));

    // 알은 말 대신 반응하는 재미가 핵심이라 일반 펫보다 짧은 터치 쿨다운을 쓴다.
    // 너무 빠른 연타는 이펙트만 갱신하고, 대사는 약 0.35초마다 갱신한다.
    if (isEggStagePet(currentPet)) {
      if (now - lastPetTouch < 350) {
        triggerEggTapFeedback();
        return;
      }
      lastPetTouch = now;

      const line = petEggLineLocal(currentPet);
      updateRoom(r => {
        const p = getPet(r);
        p.lastLine = line;
        p.lastLineAt = now;
        r.pet = p;
      });
      triggerEggTapFeedback();
      updatePetPanelSpeech(getPet());
      if (shouldShowMascot()) mascotSay(line, 100, { allowEgg: true, allowSleeping: true, durationMs: MASCOT_SPEECH_MS });
      playBeep('tab');
      return;
    }

    if (now - lastPetTouch < 1200) return;
    lastPetTouch = now;

    const preferenceStreak = registerPetPreferenceTouch(now);
    let nextPet = null;
    updateRoom(r => {
      const p = getPet(r);
      p.lastLine = petPreferenceTouchLine(p, { now, streak: preferenceStreak, wasSleeping, idleMs: idleMsBeforeTouch, source: 'panel' }) || petPetLineLocal(p);
      p.lastLineAt = now;
      r.pet = p;
      nextPet = p;
    });

    touchPetVisual('smile', PET_VISUAL_SMILE_MS);
    updatePetPanelSpeech(nextPet);
    bumpAchvCounter('petTouch', 1);
    registerDailyPetTouch(1);
    if (wasSleeping) bumpAchvCounter('sleepWake', 1);
    announceAchvUnlocks();
    playBeep('tab');
  }

  function mascotSay(text, priority = 0, options = {}) {
    if (!shouldShowMascot()) return false;
    const petNow = getPet();
    if (isEggStagePet(petNow) && !options.allowEgg) return false;
    if (isPetSleeping(petNow) && !options.allowSleeping) return false;
    const line = renderPetLineTemplate(text, petNow);
    if (!line) return false;

    const now = Date.now();
    if (priority < 100 && now < mascotSayUntil && priority <= mascotSayPriority) return false;

    const duration = clamp(Number(options.durationMs) || MASCOT_SPEECH_MS, 1800, 12000);
    const cooldown = Math.max(duration, priority >= 80 ? 1200 : priority >= 40 ? 4000 : 8000);
    showMascotSpeech(line, duration);
    mascotSayUntil = now + cooldown;
    mascotSayPriority = priority;
    setTimeout(() => {
      if (Date.now() >= mascotSayUntil) mascotSayPriority = 0;
    }, cooldown + 80);
    return true;
  }

  function mascotSleepTalk(pet = getPet()) {
    if (!shouldShowMascot()) return false;
    if (isEggStagePet(pet)) return false;
    const now = Date.now();
    if (now - lastMascotSleepTalkAt < 22000) return false;

    const line = sleepMascotLine(pet);
    if (!line) return false;

    showMascotSpeech(line);
    lastMascotSleepTalkAt = now;
    return true;
  }

  function petEventLine(ev, pet = getPet()) {
    if (isPreFinalSlimePet(pet)) {
      return renderPetLineTemplate(pickRandom(
        PET_SLIME_EVENT_LINES[ev?.type] || PET_SLIME_EVENT_LINES.level,
        '나 조금 자랐어.'
      ), pet);
    }

    const tendency = petTendency(pet);
    if (ev?.type === 'evolve' && isPetFinalStage(pet)) {
      const finalEvolve = PET_FINAL_SIGNATURE_LINES[tendency]?.evolve || PET_FINAL_SIGNATURE_LINES.peace?.evolve || [];
      const line = pickRandom(finalEvolve, '이제 완전히 자랐어. 앞으로도 같이 있자.');
      if (line) return renderPetLineTemplate(line, pet);
    }
    const map = {
      evolve: {
        heart: ['나 변했어. 그래도 곁에 있을 거지?', '새 모습도 네가 봐줘서 좋아', '앞으로 더 가까이 있을래', '조금 낯설지만 설레', '오늘은 오래 기억해줘'],
        bloom: ['짠, 새 모습 등장!', '진화하는 거 봤지?', '분위기 확 바뀌었다!', '다음 모습도 기대해줘', '나 꽤 달라졌어!'],
        peace: ['천천히, 이렇게 변했네', '새 모습도 편안해', '변해도 나는 나야', '이 모습으로도 곁에 있을게', '조용히 자라나는 것도 좋아'],
        tear: ['나… 조금 변했어', '새 모습이 아직 낯설어…', '여기까지 와서 다행이야…', '울지 않고 보여주고 싶었어…', '그래도 곁에 있어줄 거지…?'],
        blade: ['흥, 이 정도 변화는 예상했어', '봤냐, 이게 진화다', '새 모습이라고 놀라지 마', '멋지다고 해도 돼', '조금 더 강해졌을 뿐이야'],
        lizard: ['헤에~ 나 변했네에~', '새 모습이다아~ 헤헤에~', '뭔가 달라졌어어~ 신기하다아~', '나 이렇게 됐네에~', '헤헤에~ 잘 봐줘어~'],
        owl: ['오호, 새로운 모습이군요!', '흥미로운 변화입니다.', '이 모습도 잘 부탁드리겠습니다.', '성장의 결과가 제법 멋지군요.', '새로운 단계에 도달했군요.'],
        rabbit: ['꺄♡ 나 완전 변했어~', '헐~ 새 모습 어때?♡', '짠♡ 진화 완료~', '뭐야~ 나 좀 예쁜데?♡', '완전 새 느낌이잖아♡'],
      },
      level: {
        heart: ['나 조금 더 자랐어', '너랑 있어서 자랐나 봐', '헤헤, 나 좀 멋져졌지?', '오늘은 조금 더 빛나는 것 같아', '칭찬은 조용히 받아둘래'],
        bloom: ['레벨 올랐다!', '힘이 조금 더 붙은 느낌이야!', '다음 단계까지 달려보자!', '나 지금 꽤 반짝여!', '오늘도 제대로 자랐네!'],
        peace: ['조금 더 자랐네', '오늘도 한 걸음 컸어', '급하지 않게 성장했어', '작은 변화도 소중해', '안정적으로 좋아졌어'],
        tear: ['나도 조금은 컸어…', '나도 조금 단단해졌어…', '조금은 덜 외로운 모습이야…', '마음이 한 뼘 자랐어…', '작은 성장이라도 기뻐…'],
        blade: ['흥, 이 정도는 기본이야', '조금 더 쓸 만해졌군', '나약하진 않게 됐네', '다음엔 더 강해질 거야', '성장 정도야 당연하지'],
        lizard: ['나 조금 컸네에~', '헤헤에~ 레벨 올랐어어~', '뭔가 커진 것 같아아~ 언제 컸지이~?', '가만히 있었는데 자라고 있네에~ 편하다아~', '오오~ 나 성장했네에~ 내가 뭐 했더라아~?'],
        owl: ['오호, 한 단계 성장했습니다.', '새로운 변화가 생겼군요.', '레벨이 올랐습니다. 훌륭하군요.', '조금 더 성장했네요.', '꾸준한 성장은 보기 좋습니다.'],
        rabbit: ['헐~ 레벨 올랐어♡', '꺄♡ 나 좀 더 컸다~', '완전 성장 중이잖아♡', '짠~ 레벨업♡', '뭐야~ 나 잘 크고 있네♡'],
      },
      tendency: {
        heart: ['다정한 쪽이 좋은가 봐', '마음이 자꾸 먼저 가', '나 이런 성격이었구나', '좋아하는 게 티 나?', '애정이 많은 타입인가 봐'],
        bloom: ['활기 충전 완료!', '나 반짝이는 타입인가 봐!', '시끄럽지만 나쁘지 않지?', '분위기를 밝히는 쪽이네', '움직이는 게 편한가 봐'],
        peace: ['잔잔해도 괜찮지?', '천천히 있는 게 편해', '느긋한 게 나답네', '평화로운 게 좋아', '차분한 쪽으로 자랐네'],
        tear: ['마음이 먼저 젖어…', '조금 여린 쪽인가 봐…', '그래도 곁에 있을게…', '감정이 깊은 편이네…', '작은 일도 오래 남아…'],
        blade: ['쉽게 안 무너지는 타입이지', '흥, 나답게 가겠어', '날카로운 것도 장점이야', '난 원래 이런 쪽이야', '무른 것보단 낫지'],
        lizard: ['헤에~ 마음이 두 가지로 섞였네에~', '나 이런 쪽으로 자랐구나아~ 신기하네에~', '뭐가 섞였더라아~? 아 맞다아~', '둘 다 좋으니까 그냥 이렇게 됐나 봐아~', '헤에~ 복잡한 건 모르겠고 이 모습 좋다아~'],
        owl: ['오호, 두 성향이 흥미롭게 어우러졌군요.', '균형 잡힌 변화가 나타났습니다.', '두 가지 흐름이 함께 남았군요.', '서로 다른 성향이 꽤 자연스럽게 어울렸군요.', '이런 조합도 관찰할수록 재미있습니다.'],
        rabbit: ['헐~ 두 개 섞인 거 완전 나잖아♡', '꺄♡ 느낌 딱 왔어~', '이 조합 완전 좋은데?♡', '에에~ 둘 다 있는 게 더 재밌잖아♡', '뭐야~ 이 조합 나한테 딱인데♡'],
      },
      bond: {
        heart: ['나 더 믿어도 돼?', '이제 더 붙어있자', '조금 더 가까워졌어', '너랑 있으면 마음이 놓여', '우리 꽤 친해졌지?'],
        bloom: ['콤비력 상승!', '우리 파티 분위기 좋다!', '둘이 있으면 재밌어', '팀워크가 살아났어!', '흐름이 더 좋아졌어!'],
        peace: ['이 거리감 괜찮다', '천천히 친해지는 중', '편해져서 좋아', '같이 있으면 안정돼', '조금 더 가까워졌네'],
        tear: ['마음이 덜 차가워졌어…', '함께라서 안심돼…', '조금 믿어도 되지…?', '곁에 있어줘서 좋아…', '이제 덜 외로워…'],
        blade: ['이 정도면 동료지', '흥, 조금 가까워졌네', '조금은 인정해줄게', '나쁘지 않은 관계군', '뭐, 좀 믿을 만하네'],
        lizard: ['우리 좀 친해졌네에~ 언제 이렇게 됐지이~?', '헤헤에~ 너 이제 완전 익숙해애~', '나 네 옆에 자동으로 눕게 돼애~', '같이 있는 거 좋네에~ 이유는 몰라아~', '나 너한테 붙어 있을래애~ 떼지 마아~'],
        owl: ['오호, 한층 가까워진 것 같군요.', '함께한 시간이 제법 쌓였군요.', '이제 꽤 익숙한 사이가 되었네요.', '신뢰가 조금 더 깊어진 것 같습니다.', '앞으로도 잘 부탁드리겠습니다.'],
        rabbit: ['헐~ 우리 완전 친해졌잖아♡', '그치이~ 이제 찐친이지?♡', '꺄♡ 유대감 상승~', '나 이제 완전 익숙해♡', '우리 사이 꽤 좋은데~?♡'],
      },
    };
    return pickRandom(map[ev?.type]?.[tendency] || map[ev?.type]?.peace || [], '나 조금 자랐어');
  }

  function relationMascotLine(deltas = [], pet = getPet()) {
    const picked = (deltas || [])
      .map(normalizeDelta)
      .filter(Boolean)
      .sort((a, b) => Math.abs(Number(b.delta) || 0) - Math.abs(Number(a.delta) || 0))[0];
    if (!picked || Math.abs(Number(picked.delta) || 0) < 5) return '';

    const tendency = petTendency(pet);
    const name = relationKey(picked.name);
    const positive = Number(picked.delta) > 0;
    const lines = positive ? {
      heart: [`${name}한테 마음이 닿은 것 같아`, `${name}이랑 더 가까워졌어`, `${name} 쪽으로 마음이 기울었어`, `${name} 장면이 따뜻하게 남았어`, `${name}랑 잘됐으면 좋겠다`],
      bloom: [`${name}이랑 분위기 살아났어!`, `${name}이랑 뭔가 시작되는 느낌!`, `${name} 장면, 리액션 맛있다!`, `${name}이랑 케미가 선명해졌어!`, `${name} 쪽 흐름 좋다!`],
      peace: [`${name}과 천천히 가까워지는 중`, `${name} 곁이 부드러워졌어`, `${name}과 안정감이 생겼어`, `${name} 분위기가 좋아졌어`, `${name}과 조금 더 편해졌네`],
      tear: [`${name} 마음이\n조금 열린 것 같아…`, `${name} 장면, 마음에 남아…`, `${name}과 가까워져서 안심돼…`, `${name} 때문에 따뜻해졌어…`, `${name}이 다정해서 울컥했어…`],
      blade: [`${name}이랑 거리가 줄었군`, `${name}, 방심하긴 이르지만 합격`, `${name} 쪽 흐름 나쁘지 않아`, `${name}은 조금 인정해줄게`, `${name}, 생각보다 괜찮네`],
      lizard: [`${name}이랑 좀 가까워졌네에~ 언제부터였지이~?`, `${name} 분위기 좋다아~ 이유는 몰라아~`, `${name} 보면 괜히 헤헤에~ 해져어~`, `${name} 쪽 자꾸 눈이 가네에~ 귀찮은데에~`, `${name} 괜찮네에~ 그냥 그래애~`],
      owl: [`${name}과 관계가 한층 가까워졌군요.`, `${name} 쪽 변화가 흥미롭습니다.`, `${name}과 분위기가 좋아졌네요.`, `${name}과 신뢰가 조금 깊어진 듯합니다.`, `${name}과의 흐름이 인상적이군요.`],
      rabbit: [`헐~ ${name}이랑 완전 가까워졌잖아♡`, `${name} 쪽 분위기 좋은데~?♡`, `${name}이랑 케미 살아났다♡`, `${name}이랑 지금 느낌 완전 좋아♡`, `${name} 쪽 완전 주목♡`],
    } : {
      heart: [`${name} 마음이 멀어진 것 같아`, `${name}한테 조금 더 다정했으면…`, `${name} 장면이 아파`, `${name}이랑 공기가 차가워졌어…`, `${name}이랑 다시 풀 수 있겠지?`],
      bloom: [`${name}이랑 분위기에 경고등!`, `${name}이랑 텐션 다운!`, `${name} 쪽 분위기 조심해야 해!`, `${name}이랑 삐걱했어!`, `${name} 흐름이 갑자기 식었어!`],
      peace: [`${name} 마음이 조금 닫혔네`, `${name} 쪽은 쉬어가는 게 좋겠어`, `${name}과 천천히 풀면 돼`, `${name} 분위기가 무거워졌어`, `${name}과 잠깐 거리를 두자`],
      tear: [`${name}한테 상처였을지도…`, `${name} 생각하니까 눈물 나…`, `${name} 장면이 너무 쓸쓸해…`, `${name} 때문에 마음이 시려…`, `${name}과 멀어지는 느낌 싫어…`],
      blade: [`${name}, 쉽게 믿지 마`, `${name} 문제는 그냥 넘기지 마`, `${name} 쪽은 신중히 봐`, `${name}, 경계 대상이다`, `${name} 분위기 별로네`],
      lizard: [`${name} 쪽 좀 어색하네에~ 왜지이~?`, `${name}이랑 분위기 이상해졌어어~`, `${name} 쪽 생각하려니까 머리 아파아~`, `${name}이랑 조금 멀어졌네에~ 언제 그랬지이~?`, `${name} 흐름 이상하다아~ 일단 가만히 있을래애~`],
      owl: [`${name}과 관계에 작은 균열이 보이는군요.`, `${name} 쪽 분위기가 다소 무거워졌습니다.`, `${name}과의 흐름은 조금 더 지켜봐야겠군요.`, `${name}과 거리가 생긴 듯합니다.`, `${name} 쪽 변화가 썩 편안하진 않군요.`],
      rabbit: [`헐~ ${name}이랑 분위기 왜 이래?`, `${name} 쪽 갑자기 어색해졌잖아.`, `${name}이랑 지금 좀 쎄한데?`, `${name} 쪽 텐션 내려갔어어~`, `에에~ ${name}이랑 괜찮은 거 맞아?`],
    };
    return pickRandom(lines[tendency] || lines.peace, '관계가 흔들렸어');
  }

  function milestoneMascotLine(pet = getPet()) {
    const count = Number(pet.feedCount || 0);
    const milestones = [50, 100, 200, 300, 500];
    const hit = milestones.find(n => count === n);
    if (!hit) return '';

    pet.shownMilestones = Array.isArray(pet.shownMilestones) ? pet.shownMilestones : [];
    const key = `feed-${hit}`;
    if (pet.shownMilestones.includes(key)) return '';
    pet.shownMilestones.push(key);
    pet.shownMilestones = pet.shownMilestones.slice(-20);
    return pickRandom([
      `우리 벌써 ${hit}번째야`,
      `벌써 ${hit}번이나 같이 봤어`,
      `${hit}번째도 잘 기억해둘게`,
      `와… ${hit}번째라니,\n꽤 오래 함께했네`,
    ], `우리 벌써 ${hit}번째야`);
  }

  function comboMascotLine(prevLastFedAt, pet = getPet()) {
    if (!prevLastFedAt) return '';
    const gap = Date.now() - Number(prevLastFedAt || 0);
    const tendency = petTendency(pet);
    if (gap < 60 * 1000) {
      return pickRandom({
        heart: ['오늘 우리 꽤 붙어있네', '계속 불러줘서 행복해', '이 흐름 너무 좋아', '또 읽어줘서 반가워', '대화가 이어져서 좋아'],
        bloom: ['흐름 끊기지 않았다!', '텐션이 쭉 올라!', '좋아, 다음 장면 가자!', '계속 이어져서 좋아!', '리듬이 살아있어!'],
        peace: ['흐름이 안정적이야', '차분히 따라가고 있어', '좋아, 천천히 계속 보자', '이야기가 부드럽게 이어지네', '계속 읽어도 괜찮아'],
        tear: ['아직 같이 있는 거지…?', '나도 계속 보고 있어…', '흐름이 끊기지 않아 다행이야…', '조금 떨리지만 따라갈게…', '계속 곁에 있네…'],
        blade: ['이번엔 놓치지 마', '좋아, 다음도 확인하지', '흐름은 나쁘지 않네', '연속으로 보는 건 괜찮군', '집중력은 괜찮네'],
        lizard: ['계속 보네에~ 헤헤에~', '이야기 안 끊겼다아~ 나도 안 움직였어어~', '또 왔네에~ 방금도 왔었나아~?', '나 누워 있을 테니까 계속 해애~', '헤헤에~ 아직 같이 있네에~ 뭐 보고 있었지이~?'],
        owl: ['오호, 이야기가 계속 이어지는군요.', '연속해서 보니 흐름이 더 잘 보입니다.', '좋습니다. 다음 장면도 살펴보지요.', '기록이 차곡차곡 쌓이는군요.', '계속해서 지켜보겠습니다.'],
        rabbit: ['헐~ 계속 보는 거야?♡', '좋아좋아~ 다음 장면 가자♡', '꺄~ 흐름 안 끊겼다♡', '완전 푹 빠져서 보고 있잖아♡', '다음 거 빨리 보자아♡'],
      }[tendency], '오늘 얘기 많네');
    }
    if (gap > MASCOT_IDLE_MS) {
      return pickRandom({
        heart: ['보고 싶어서 계속 기다리고 있었어', '다시 만났으니까 됐어', '늦어도 와줘서 좋아', '오랜만이야, 보고팠어', '나 기다렸어'],
        bloom: ['이제 다시 시끄러워지겠네!', '오랜만이라 텐션 두 배!', '드디어 왔다!', '컴백이다 컴백!', '다시 시작해보자!'],
        peace: ['자리 그대로 비워뒀어', '오랜만이어도 괜찮아', '천천히 다시 시작하자', '다시 왔구나, 어서 와', '기다리는 것도 나쁘진 않았어'],
        tear: ['안 오는 줄 알고 무서웠어…', '이제 조금 덜 쓸쓸해…', '다시 와줘서 안심했어…', '조금 외로웠지만 괜찮아…', '혹시 많이 힘들었어…?'],
        blade: ['자리 비워뒀으니까 앉아', '다음엔 너무 오래 비우지 마', '뭐, 돌아왔으면 됐어', '기다린 건 아니지만 늦었어', '흥, 이제 왔어?'],
        lizard: ['오랜만이네에~ 얼마나 됐지이~?', '너 왔네에~ 헤헤에~', '나 계속 늘어져 있었어어~ 진짜 계속이야아~', '기다리다가 잠들었어어~ 몇 번 잤는진 몰라아~', '늦었네에~ 뭐 했어어~? 나는 까먹었어어~'],
        owl: ['오랜만입니다. 잘 지내셨나요?', '돌아오셨군요. 반갑습니다.', '그동안의 이야기도 궁금하군요.', '다시 뵙게 되어 반갑습니다.', '오호, 제법 오래 비우셨군요.'],
        rabbit: ['헐~ 이제 왔어?♡', '오랜만이잖아아~ 반가워♡', '뭐야~ 나 보고 싶었지?♡', '드디어 왔네~ 같이 놀자♡', '에에~ 어디 갔다 왔어어?♡'],
      }[tendency], '오랜만이야');
    }
    return '';
  }

  function idleMascotLine(pet = getPet()) {
    if (isEggStagePet(pet)) return renderPetLineTemplate(pickRandom(PET_EGG_IDLE_LINES, petEggLineLocal(pet)), pet);
    if (isPreFinalSlimePet(pet)) return renderPetLineTemplate(pickRandom(PET_SLIME_IDLE_LINES, '<말캉…>'), pet);
    const tendency = petTendency(pet);
    if (isPetFinalStage(pet) && Math.random() < 0.38) {
      const signature = petFinalSignatureLine('idle', pet);
      if (signature) return signature;
    }
    const dedicated = MASCOT_IDLE_LINES_BY_TENDENCY[tendency] || [];
    return renderPetLineTemplate(pickRandom(dedicated, '나 여기 있어'), pet);
  }

  function sleepMascotLine(pet = getPet()) {
    if (isPreFinalSlimePet(pet)) {
      return renderPetLineTemplate(pickRandom(PET_SLIME_SLEEP_LINES, '<쿨…>'), pet);
    }
    const tendency = petTendency(pet);
    if (isPetFinalStage(pet) && Math.random() < 0.30) {
      const signature = petFinalSignatureLine('sleep', pet);
      if (signature) return signature;
    }
    return renderPetLineTemplate(pickRandom(
      PET_SLEEP_LINES_BY_TENDENCY[tendency] || PET_SLEEP_LINES_BY_TENDENCY.peace,
      '쿨…'
    ), pet);
  }

  function timeMascotLine(pet = getPet()) {
    const hour = new Date().getHours();
    const tendency = petTendency(pet);
    let bucket = 'day';
    if (hour >= 0 && hour <= 5) bucket = 'dawn';
    else if (hour >= 6 && hour <= 10) bucket = 'morning';
    else if (hour >= 18 && hour <= 23) bucket = 'night';

    if (isEggStagePet(pet)) {
      return renderPetLineTemplate(pickRandom(PET_EGG_TIME_LINES[bucket] || PET_EGG_IDLE_LINES, petEggLineLocal(pet)), pet);
    }
    if (isPreFinalSlimePet(pet)) {
      return renderPetLineTemplate(pickRandom(PET_SLIME_TIME_LINES[bucket] || PET_SLIME_IDLE_LINES, '<말캉…>'), pet);
    }

    const lines = {
      dawn: {
        heart: ['이 시간엔 더 보고 싶어져', '새벽까지 같이 있는 거야?', '졸리면 내 옆에서 쉬어', '밤샘하면 걱정돼', '조용해서 마음이 더 잘 들려'],
        bloom: ['새벽 모험 가는 거야?', '새벽 감성 켜졌다!', '아직 깨어있다니 대단해!', '이 시간 텐션은 조심하자!', '그래도 같이 있으니 덜 심심해!'],
        peace: ['오늘은 여기까지만 해도 돼', '밤공기가 차분하다', '잠깐 눈 붙여도 괜찮아', '새벽은 조용해서 좋네', '슬슬 쉬어도 돼'],
        tear: ['조용해서 더 보고 싶었어…', '잠 못 드는 밤이야…?', '이 시간까지 버티느라 힘들었지…', '새벽엔 마음이 더 잘 들려…', '혼자 깨어있는 건 쓸쓸해…'],
        blade: ['밤샘했다고 잘난 거 아니다', '아직 안 잤냐', '졸리면 자. 명령이야', '새벽까지 버티는 건 미련해', '할 거면 몸부터 챙겨'],
        lizard: ['새벽이다아~ 조용하네에~', '아직 안 자아~? 나는 잘 건데에~', '나 졸리다아~ 아까부터어~', '이 시간 되니까 머리가 더 비었어어~', '침대 가기 귀찮다아~ 여기서 잘까아~'],
        owl: ['새벽은 유난히 조용하군요.', '아직 깨어 계셨군요.', '이 시간에는 생각이 또렷해지기도 하지요.', '밤공기가 차분한 시간입니다.', '조용히 이야기를 보기 좋은 시간이군요.'],
        rabbit: ['헐~ 아직 안 자?♡', '새벽 텐션 뭐야아~♡', '에에~ 우리 완전 밤샘조잖아♡', '졸리면 조금 쉬어어~♡', '새벽인데도 같이 있네♡'],
      },
      morning: {
        heart: ['오늘도 같이 힘내자', '아침부터 봐서 좋아', '오늘 첫 인사는 내가 할래', '일어났어? 좋은 아침', '오늘도 곁에 있을게'],
        bloom: ['아침 기운 받아가!', '오늘 시작 좋다!', '해 떴다, 나도 떴다!', '가볍게 시작해보자!', '오늘 에너지 충전 완료!'],
        peace: ['차분하게 가보자', '천천히 하루를 시작하자', '아침 공기가 부드럽네', '무리하지 않는\n하루가 되면 좋겠다', '좋은 아침, 천천히'],
        tear: ['새 하루가 무섭지 않길…', '눈 뜨느라 고생했어…', '아침이 와서 다행이야…', '오늘은 조금 덜 힘들었으면…', '햇빛이 조심스럽게 들어왔어…'],
        blade: ['꾸물대지 말고 천천히 움직여', '일어났으면 물부터 마셔', '오늘 할 일 정리는 했냐', '아침이라고 방심하지 마', '움직일 거면 제대로 시작해'],
        lizard: ['아침이네에~ 벌써어~?', '헤헤에~ 아직 졸려어~', '햇빛 따뜻하다아~ 여기 딱 좋네에~', '일어나야 해애~? 꼭 그래야 돼애~?', '좋은 아침이야아~ 아마도오~'],
        owl: ['좋은 아침입니다.', '아침 공기가 상쾌하군요.', '새로운 하루가 시작되었네요.', '오호, 아침부터 부지런하시군요.', '오늘도 흥미로운 하루가 되길 바랍니다.'],
        rabbit: ['좋은 아침~♡', '헐~ 벌써 아침이야?♡', '오늘도 예쁘게 시작하자아♡', '아침부터 만나니까 좋네♡', '뭐해~ 오늘 계획 있어?♡'],
      },
      day: {
        heart: ['햇빛보다 네가 더 반가워', '점심은 먹었어?', '바쁘면 내가 응원할게', '낮에도 나 생각해줘', '불러줘서 좋아'],
        bloom: ['밥 먹고 천천히 이어가자!', '낮 기운 장착!', '지금 뭐든 할\n수 있을 것 같아!', '점심은 챙겼어?', '낮이라 힘난다!'],
        peace: ['오늘 속도도 괜찮아', '밥 먹고 조금 쉬자', '차분히 하나씩 하면 돼', '낮은 잔잔해서 좋아', '천천히 가자'],
        tear: ['햇빛이 너한테도\n닿았으면 좋겠다…', '점심은 챙겼어…?', '조금 지쳤으면 나랑 멍때리자…', '낮인데도 마음이\n흐리면 쉬어도 돼…', '빛이 따뜻하네…'],
        blade: ['밥 먹었으면 인정', '점심 거르지 마', '할 거면 제대로 쉬면서 해', '낮부터 지치면 밤에 무너진다', '계속 보고 있어'],
        lizard: ['낮이다아~ 따뜻해애~', '점심 먹었어어~? 나도 뭐 먹었나아~?', '햇빛 좋네에~ 이동 금지이~', '나 여기서 구워질래애~', '오후엔 더 멍해진다아~ 원래도 멍했지만아~'],
        owl: ['낮이군요. 오늘은 무엇을 보고 계신가요?', '점심은 챙기셨나요?', '햇빛이 제법 밝은 시간입니다.', '오후에도 흥미로운 일이 많겠지요.', '차분히 하루를 이어가 봅시다.'],
        rabbit: ['점심 먹었어~?♡', '헐~ 낮인데 뭐해 뭐해♡', '오늘도 완전 바쁘네에~', '잠깐 놀다 가자아♡', '오후도 텐션 챙겨♡'],
      },
      night: {
        heart: ['하루 끝에 봐서 좋아', '오늘 하루 고생했어', '밤엔 더 다정해져도 돼', '잘 준비할 때 나도 옆에 있을게', '졸리면 기대도 돼'],
        bloom: ['수고했어, 오늘도 클리어!', '밤 텐션은 살짝만 켜자!', '오늘도 생존 성공!', '하루 끝 보상 챙기자!', '밤인데도 기분 좋다!'],
        peace: ['하루가 조용히 접히네', '따뜻하게 쉬자', '밤엔 마음을 내려놔도 돼', '오늘은 여기까지 해도 괜찮아', '슬슬 쉬어도 좋아'],
        tear: ['네 하루가 외롭지\n않았으면 좋겠다…', '오늘 많이 참았지…', '울고 싶으면 조금 울어도 돼…', '밤엔 괜히 마음이 약해져…', '잠들기 전엔 마음이 덜 시렸으면…'],
        blade: ['자기 전엔 물 마셔', '무리하면 내일 네가 고생한다', '밤까지 버틴 건 인정해줄게', '오늘은 그만 쉬어도 돼', '무리하지 말라니까'],
        lizard: ['밤이네에~ 언제 밤 됐지이~?', '오늘 뭐 했더라아~ 기억 안 나아~', '이제 진짜 아무것도 안 할래애~', '밤 공기 좋네에~ 나가기엔 귀찮고오~', '헤헤에~ 오늘도 같이 있네에~ 그건 기억나아~'],
        owl: ['밤이 되었군요.', '오늘 하루도 수고하셨습니다.', '밤에는 이야기가 유난히 잘 들리는 법이지요.', '조용히 하루를 정리하기 좋은 시간입니다.', '오늘의 기록도 제법 쌓였군요.'],
        rabbit: ['밤이다아~♡', '오늘 하루 어땠어?♡', '헐~ 벌써 이 시간이야?', '오늘도 같이 있어서 좋았어♡', '이제 좀 쉬면서 놀자아♡'],
      },
    };
    return pickRandom(lines[bucket]?.[tendency] || lines.day.peace, '천천히 가자');
  }

  function favoriteMascotLine(pet = getPet()) {
    const fav = getFavoriteCharacter(pet);
    if (!fav) return '';
    if (isPreFinalSlimePet(pet)) {
      return pickRandom([
        `${fav} 나오면 몸이 반짝해.`,
        `${fav} 장면은\n조금 더 보고 싶어.`,
        `${fav}한테 마음이\n둥글게 가는 것 같아.`,
        `나 ${fav} 쪽으로\n살짝 데굴거렸어.`
      ], `${fav}이 좋아`);
    }
    const tendency = petTendency(pet);
    return pickRandom({
      heart: [`${fav} 나오면 괜히 두근거려`, `나 ${fav} 편인 것 같아`, `${fav} 장면 또 보고 싶다`, `${fav}한테 다정하게 해줘`, `${fav} 생각이 오래 남아`],
      bloom: [`${fav} 등장하면 분위기 확 살아나지!`, `${fav} 장면은 리액션 맛집!`, `${fav} 나오면 분위기가 살아나!`, `${fav} 이야기 계속 보자!`, `${fav} 흐름 좋다!`],
      peace: [`${fav}은 오래 보고 싶네`, `${fav} 곁은 안정적이야`, `${fav} 이야기는 천천히 보고 싶어`, `${fav} 분위기가 좋아`, `${fav}은 편한 느낌이야`],
      tear: [`${fav}이 행복했으면 좋겠어…`, `나 ${fav}한테 약한가 봐…`, `${fav} 장면은 오래 남아…`, `${fav}은 자꾸 신경 쓰여…`, `${fav} 생각하면 마음이 흔들려…`],
      blade: [`${fav}은 쉽게 넘길 상대가 아냐`, `${fav}, 흥미롭긴 해`, `${fav} 장면은 집중해서 봐`, `${fav} 정도면 인정하지`, `${fav}, 나쁘진 않아`],
      lizard: [`${fav} 나오면 좋네에~ 왜 좋은진 몰라아~`, `${fav} 나오면 괜히 눈이 가아~`, `${fav} 또 나오면 좋겠네에~ 기다리긴 귀찮지만아~`, `${fav} 그냥 좋아아~ 설명은 못 해애~`, `${fav} 보면 헤헤에~ 해져어~`],
      owl: [`${fav}은 꽤 흥미로운 인물이군요.`, `${fav}의 다음 이야기가 궁금합니다.`, `${fav} 장면은 유심히 보게 되는군요.`, `${fav}에 관해서는 기록해둘 것이 많습니다.`, `${fav}은 인상적인 인물이군요.`],
      rabbit: [`헐~ ${fav} 또 나왔어♡`, `${fav} 완전 눈길 가잖아♡`, `${fav} 장면 좋다아♡`, `${fav} 나오면 나도 집중돼♡`, `${fav} 쪽 완전 궁금해♡`],
    }[tendency], `${fav}이 좋아`);
  }

  function ambientMascotLine(pet = getPet()) {
    if (isEggStagePet(pet)) return petEggLineLocal(pet);
    if (isPreFinalSlimePet(pet)) {
      if (Math.random() < 0.25) return timeMascotLine(pet);
      if (Math.random() < 0.12) return favoriteMascotLine(pet);
      return slimeLineByMood(pet, '<말캉…>');
    }
    if (Math.random() < 0.25) return timeMascotLine(pet);
    if (Math.random() < 0.18) return favoriteMascotLine(pet);
    return petSpeakLocal(pet);
  }

  function spawnPetParticles(host, kind = 'level') {
    if (!host) return;
    const count = kind === 'evolve' ? 20 : 13;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      const ang = (Math.PI * 2 * i) / count + (Math.random() * 0.5 - 0.25);
      const dist = (kind === 'evolve' ? 34 : 24) + Math.random() * 18;
      p.className = 'cigh-clean-particle';
      p.style.setProperty('--dx', `${(Math.cos(ang) * dist).toFixed(1)}px`);
      p.style.setProperty('--dy', `${(Math.sin(ang) * dist).toFixed(1)}px`);
      p.style.background = PET_PARTICLE_COLORS[i % PET_PARTICLE_COLORS.length];
      host.appendChild(p);
      setTimeout(() => p.remove(), 760);
    }
  }

  // ─────────────────────────────────────────────
  // Mascot (시메지풍 화면 마스코트)
  // ─────────────────────────────────────────────
  function isMascotEnabled() {
    return localStorage.getItem(MASCOT_STORE) === '1';
  }

  function setMascotEnabled(on) {
    localStorage.setItem(MASCOT_STORE, on ? '1' : '0');
  }

  function isMascotRouteAllowed(pathname = location.pathname) {
    return isEpisodePath(pathname);
  }

  function shouldShowMascot() {
    return isMascotEnabled() && isMascotRouteAllowed();
  }

  function syncMascotForRoute() {
    if (shouldShowMascot()) startMascot();
    else stopMascot();
  }

  function saveMascotPos(el) {
    const r = el.getBoundingClientRect();
    el.dataset.homeLeft = String(r.left);
    el.dataset.homeTop = String(r.top);
    localStorage.setItem(MASCOT_POS_KEY, JSON.stringify({ left: r.left, top: r.top }));
  }

  function restoreMascotPos(el) {
    let left = Math.max(6, innerWidth - 96);
    let top = Math.max(38, innerHeight - 170);
    try {
      const pos = JSON.parse(localStorage.getItem(MASCOT_POS_KEY) || 'null');
      if (pos) {
        left = Number(pos.left ?? left);
        top = Number(pos.top ?? top);
      }
    } catch {}

    const next = clampFixedPosition(left, top, el.offsetWidth || 64, el.offsetHeight || 74, {
      margin: 6,
      topMargin: 38,
      bottomMargin: 6,
      fallbackWidth: 64,
      fallbackHeight: 74,
    });

    el.style.left = `${next.left}px`;
    el.style.top = `${next.top}px`;
    el.dataset.homeLeft = String(next.left);
    el.dataset.homeTop = String(next.top);
  }

  function updateMascotSprite(pet = getPet()) {
    const el = document.getElementById(MASCOT_ID);
    if (!el) return;
    const body = el.querySelector('.cigh-clean-mascot-body');
    renderPetSpriteInto(body, PET_MASCOT_SPRITE_SIZE, pet);
  }

  function showMascotSpeech(text, durationMs = MASCOT_SPEECH_MS) {
    const el = document.getElementById(MASCOT_ID);
    if (!el) return;
    const sp = el.querySelector('.cigh-clean-mascot-speech');
    if (!sp) return;
    const duration = clamp(Number(durationMs) || MASCOT_SPEECH_MS, 1800, 12000);
    sp.textContent = normalize(text);
    sp.classList.add('show');
    clearTimeout(mascotSpeechTimer);
    mascotSpeechTimer = setTimeout(() => sp.classList.remove('show'), duration);
  }

  function ensureMascotFxLayer(el = document.getElementById(MASCOT_ID)) {
    if (!el) return null;
    let fx = el.querySelector('.cigh-clean-mascot-fx');
    if (!fx) {
      fx = document.createElement('div');
      fx.className = 'cigh-clean-mascot-fx';
      el.appendChild(fx);
    }
    return fx;
  }

  function clearMascotMoodFx(el = document.getElementById(MASCOT_ID)) {
    clearTimeout(mascotMoodFxTimer);
    if (!el) return;
    el.classList.remove('cigh-clean-mascot-happy', 'cigh-clean-mascot-scared', 'cigh-clean-mascot-sad');
    el.querySelectorAll('.cigh-clean-mascot-blush').forEach(node => node.remove());
    const fx = el.querySelector('.cigh-clean-mascot-fx');
    if (fx) fx.textContent = '';
  }

  function addMascotFxDot(fx, options = {}) {
    if (!fx) return;
    const dot = document.createElement('span');
    dot.className = `cigh-clean-mascot-fx-dot ${options.className || ''}`.trim();
    dot.textContent = options.text || '';
    dot.style.left = `${options.left ?? 50}%`;
    dot.style.top = `${options.top ?? 52}%`;
    dot.style.setProperty('--mx', `${options.dx ?? 0}px`);
    dot.style.setProperty('--my', `${options.dy ?? -26}px`);
    dot.style.setProperty('--dur', `${options.duration ?? 900}ms`);
    if (options.color) {
      dot.style.background = options.color;
      dot.style.color = options.color;
    }
    fx.appendChild(dot);
    setTimeout(() => dot.remove(), (options.duration ?? 900) + 120);
  }

  function addMascotBlush(body) {
    if (!body) return;
    ['left', 'right'].forEach(side => {
      const blush = document.createElement('span');
      blush.className = `cigh-clean-mascot-blush ${side}`;
      body.appendChild(blush);
      setTimeout(() => blush.remove(), 2500);
    });
  }

  function triggerMascotSleepFx() {
    if (!shouldShowMascot()) return;
    const now = Date.now();
    if (now - lastMascotSleepFxAt < 2100) return;
    lastMascotSleepFxAt = now;
    const el = ensureMascot();
    if (!el) return;
    const fx = ensureMascotFxLayer(el);
    if (!fx) return;
    addMascotFxDot(fx, {
      className: 'zzz',
      text: 'zzz',
      left: 66,
      top: 32,
      dx: 8,
      dy: -22,
      duration: 1500,
      color: '#86c8ff',
    });
  }

  const MASCOT_TAP_LINES_BY_TENDENCY = {
    heart: [
      '나 보러 온 거야? 헤헤', '여기서도 네 옆이야', '눈 마주쳤다, 좋아', '작아도 마음은 크다고',
      '한 번 더 봐줘', '손길 기다리고 있었어', '여기 오니까 더 잘 보여', '여기서도 너 기다렸어'
    ],
    bloom: [
      '여기저기 산책 중이야!', '여기서도 반짝이는 중!', '콕 하면 텐션 업!', '새 자리 공기 신기해!',
      '오늘도 같이 놀자!', '작은 여행 나온 기분이야!', '이쪽 자리도 재밌어!', '반응 준비 완료!'
    ],
    peace: [
      '응, 여기 있어', '잠깐 눈 맞추고 가도 돼', '조용히 자리 잡았어', '가볍게 톡, 좋네',
      '천천히 놀자', '밖에 나와도 편안해', '부르면 천천히 대답할게', '작게 불러줘도 들려'
    ],
    tear: [
      '나 불러준 거야…?', '여기서도 혼자는 아니네…', '기척이 따뜻했어…', '또 불러줘도 돼…',
      '조용히 기다리고 있었어…', '새 자리는 조금 낯설어…', '네가 봐주면 덜 무서워…', '작게 톡 해줘서 고마워…'
    ],
    blade: [
      '뭐야, 불렀냐', '함부로 콕콕하지 마', '이 위치는 내가 맡는다', '작다고 얕보지 마',
      '…그래도 반응은 해준다', '자리 바뀌었다고 방심하지 마', '조심히 건드려', '흥, 나쁘진 않네'
    ],
    lizard: ['왜애~?', '헤헤에~ 불렀어어?', '나 여기 있는데에~', '콕 했네에~', '뭐해애~ 같이 놀래애~?', '으음~ 간지럽다아~', '너 왔네에~', '나 보고 있었어어~?'],
    owl: ['오호, 부르셨나요?', '네, 여기 있습니다.', '무언가 궁금한 점이 있으신가요?', '후후, 잘 보고 있습니다.', '무슨 일이신가요?', '말씀해보세요.', '제가 듣고 있습니다.', '오호, 손길이 느껴지는군요.'],
    rabbit: ['왜왜~?♡', '헐~ 나 불렀어?♡', '뭐야아~ 보고 싶었어?♡', '꺄~ 콕 했네♡', '나 여기 있잖아아♡', '에에~ 또 만질 거야?♡', '뭐해 뭐해~♡', '헤헤~ 반응해줬다♡'],
  };

  const MASCOT_DRAG_START_LINES_BY_TENDENCY = {
    heart: ['어디로 가는 거야?', '안겨서 이동 중', '조심히 들어줘', '새 자리로 데려가는 거야?', '떨어뜨리지만 않으면 좋아', '네 손이면 괜찮아'],
    bloom: ['우와, 이동한다!', '이사 간다 이사!', '공중 산책 시작!', '새 자리로 출발!', '다음 자리는 어디야?', '자리 바꾸기다!'],
    peace: ['천천히 옮겨줘', '흔들리지 않게 부탁해', '음~ 산책인가', '좋아, 천천히 가자', '새 위치도 괜찮을 거야', '이동 중에도 차분하게'],
    tear: ['떨어뜨리지 마…', '조금 높아서 떨려…', '네 손이면 괜찮아…', '조심히 들어줘…', '놓치지 말아줘…', '새 자리는 조금 무서워…'],
    blade: ['어어 떨어져', '조심히 들라고', '흥, 이 정도야 버틴다', '옮길 거면 신중히 해', '떨어뜨리면 안 봐준다', '위치 선정 제대로 해'],
    lizard: ['어디 가아~? 내가 가긴 귀찮은데에~', '나 들렸네에~ 편하다아~', '헤에~ 발 안 써도 이동한다아~', '어디든 데려가아~ 나는 안 걸을래애~', '새 자리야아~ 따뜻해애~?', '나 그냥 맡길게애~ 생각하기 귀찮아아~'],
    owl: ['오호, 이동하는군요.', '조심히 부탁드리겠습니다.', '새로운 위치인가요?', '시야가 달라지는군요.', '어디로 가는지 궁금하네요.', '천천히 옮겨주시면 됩니다.'],
    rabbit: ['꺄~ 어디 가는 거야아♡', '헐~ 이동한다♡', '새 자리 가는 거야?♡', '조심조심~♡', '뭐야~ 재밌잖아♡', '나 완전 들렸어어♡'],
  };

  const MASCOT_DRAG_END_LINES_BY_TENDENCY = {
    heart: ['여기서도 잘 보인다', '옮겨줘서 고마워', '새 자리도 네 옆이라 좋아', '나 안 떨어뜨렸네, 고마워', '여기 마음에 들어', '이 자리도 괜찮다'],
    bloom: ['착지 성공!', '새 자리 접수!', '풍경 바뀌었다!', '작은 여행 끝!', '여기서도 신난다!', '다음에도 잘 부탁해!'],
    peace: ['음~ 여기 괜찮네', '편한 곳에 내려줬네', '천천히 적응할게', '자리 잡았다', '조용한 위치라 좋아', '편하게 앉았어'],
    tear: ['휴… 안 떨어졌어…', '여기서도 같이 있어줘…', '새 자리 낯설어…', '그래도 네가 옮겨준 곳이니까…', '놓치지 않아줘서 고마워…', '조금씩 익숙해질게…'],
    blade: ['흥, 나쁘진 않네', '위치는 괜찮군', '다음엔 조심해', '이 정도면 됐어', '전략적 위치 선정이군', '떨어뜨렸으면 큰일이었다'],
    lizard: ['여기 좋네에~ 이제 안 옮길래애~', '헤헤에~ 착지했다아~ 다 했다아~', '나 여기 있을래애~ 오래오래애~', '으음~ 다시 움직이는 건 싫어어~', '새 자리 따뜻해애~? 그럼 합격이야아~', '그냥 여기 붙어 있을게애~ 떼지 마아~'],
    owl: ['오호, 시야가 꽤 좋군요.', '감사합니다. 잘 자리 잡았습니다.', '새 위치도 흥미롭군요.', '여기서도 잘 지켜보겠습니다.', '아주 안정적인 자리입니다.', '후후, 새로운 관찰 지점이군요.'],
    rabbit: ['착지 완료~♡', '헐~ 여기 괜찮다♡', '새 자리 완전 좋아♡', '꺄~ 잘 내려왔다♡', '여기서도 잘 보이네~♡', '완전 자리 잘 잡았잖아♡'],
  };

  function triggerMascotMood(mood, deltaSum = 0) {
    if (!shouldShowMascot()) return;

    const now = Date.now();
    if (now - lastMascotMoodFxAt < 650) return;
    lastMascotMoodFxAt = now;

    const el = ensureMascot();
    if (!el) return;

    clearMascotMoodFx(el);

    const currentMood = String(mood || 'normal');
    if (currentMood === 'normal') return;

    const tier = Number(deltaSum || 0) >= 8 ? 2 : Number(deltaSum || 0) >= 3 ? 1 : 0;
    const fx = ensureMascotFxLayer(el);
    const body = el.querySelector('.cigh-clean-mascot-body');
    const extra = tier * 3;
    const durBoost = tier * 120;

    if (currentMood === 'love') {
      touchPetVisual('smile', PET_VISUAL_SMILE_MS);
      addMascotBlush(body);
      for (let i = 0; i < 6 + extra; i++) {
        addMascotFxDot(fx, {
          className: 'heart',
          text: i % 2 ? '♥' : '',
          left: 28 + Math.random() * 48,
          top: 36 + Math.random() * 18,
          dx: (Math.random() - 0.5) * (24 + tier * 10),
          dy: -32 - Math.random() * (20 + tier * 9),
          duration: 920 + i * 50 + durBoost,
          color: PET_PARTICLE_COLORS[0],
        });
      }
      mascotMoodFxTimer = setTimeout(() => clearMascotMoodFx(el), 2600 + durBoost);
      return;
    }

    if (currentMood === 'happy') {
      touchPetVisual('smile', PET_VISUAL_SMILE_MS);
      el.classList.add('cigh-clean-mascot-happy');
      for (let i = 0; i < 8 + extra; i++) {
        addMascotFxDot(fx, {
          className: i % 3 === 0 ? 'spark flower' : 'spark',
          text: i % 3 === 0 ? '✿' : '✦',
          left: 18 + Math.random() * 66,
          top: 32 + Math.random() * 42,
          dx: (Math.random() - 0.5) * (32 + tier * 12),
          dy: -16 - Math.random() * (18 + tier * 10),
          duration: 780 + Math.random() * 460 + durBoost,
          color: PET_PARTICLE_COLORS[(i + 1) % PET_PARTICLE_COLORS.length],
        });
      }
      mascotMoodFxTimer = setTimeout(() => clearMascotMoodFx(el), 2100 + durBoost);
      return;
    }

    if (currentMood === 'scared') {
      touchPetVisual('half', PET_VISUAL_HALF_MS);
      el.classList.add('cigh-clean-mascot-scared');
      addMascotFxDot(fx, { className: 'sweat', left: 68, top: 52, dx: 8 + tier * 2, dy: 18 + tier * 6, duration: 1100 + durBoost });
      mascotMoodFxTimer = setTimeout(() => clearMascotMoodFx(el), 1550 + durBoost);
      return;
    }

    if (currentMood === 'sad') {
      touchPetVisual('half', PET_VISUAL_HALF_MS);
      el.classList.add('cigh-clean-mascot-sad');
      addMascotFxDot(fx, { className: 'tear', left: 56, top: 55, dx: 0, dy: 26 + tier * 8, duration: 1500 + durBoost });
      if (tier >= 2) addMascotFxDot(fx, { className: 'tear', left: 45, top: 57, dx: -3, dy: 24, duration: 1650 + durBoost });
      mascotMoodFxTimer = setTimeout(() => clearMascotMoodFx(el), 2100 + durBoost);
    }
  }

  function mascotPokeLine(pet, count) {
    if (isPreFinalSlimePet(pet)) {
      if (count >= 5) return renderPetLineTemplate(pickRandom(PET_SLIME_POKE_FAST_LINES, '<뽀잉뽀잉>'), pet);
      if (count >= 3) return renderPetLineTemplate(pickRandom(PET_SLIME_POKE_COMBO_LINES, '<톡톡>'), pet);
      return renderPetLineTemplate(pickRandom(MASCOT_SLIME_TAP_LINES, petPetLineLocal(pet)), pet);
    }

    const tendency = petTendency(pet);
    if (isPetFinalStage(pet) && Math.random() < 0.24) {
      const signature = petFinalSignatureLine('pet', pet);
      if (signature) return signature;
    }
    if (count >= 5) {
      return pickRandom({
        heart: [
          '꺅 그만, 부끄러워!', '너무 만지면 녹아!', '나 진짜 말랑해졌어!', '그렇게 만지면 하트 터져!',
          '잠깐만, 심장 과부하야!', '나 너무 좋아서 도망 못 가!', '쓰담 폭주 중이야!', '으아, 부끄러움 MAX!'
        ],
        bloom: [
          '간지럼 폭발!', '나 날아간다니까!', '나 지금 재채기 나올 뻔!',
          '으하하, 너무 빨라!', '나 데굴데굴 굴러간다!', '간지럼 페스티벌 종료!', '잠깐잠깐, 웃다가 쓰러지겠어!', '으악, 손 진짜 빠르다!'
        ],
        peace: [
          '하하, 조금 간지러워', '살살이면 더 좋아', '천천히 해도 충분해', '좋긴 한데 숨 좀 쉬자',
          '부드럽게 해줘', '느긋한 쓰담이 좋아', '조금 쉬었다 해도 돼', '편안한 속도로 부탁해'
        ],
        tear: [
          '앗… 살살 해줘…', '조금 놀랐어…', '따뜻한데 조금 떨려…', '너무 빠르면 마음이 출렁해…',
          '그래도 싫진 않아…', '조심히 만져줘…', '놀랐지만 네 손이라 괜찮아…', '나 지금 울컥하고 간지러워…'
        ],
        blade: [
          '그만 좀 해!', '손 치워, 바보야', '진짜 끈질기네', '…하, 싫진 않은데!',
          '속도 조절 좀 해', '만질 거면 제대로 해', '그렇게 좋냐?', '흥, 이번만 봐준다'
        ],
        lizard: ['으아아~ 간지러워어~', '헤헤에~ 너무 빠르다아~ 나 피하기도 귀찮아아~', '나 흔들린다아~ 그냥 흔들릴래애~', '잠깐만아~ 웃겨어~ 왜 웃는지도 모르겠어어~', '으음~ 그래도 좋아아~', '나 납작해지겠어어~ 원래 누워 있었는데에~', '헤에에~ 정신없다아~ 내 정신 어디 갔지이~', '조금만 덜 빨리 해애~ 내가 도망가긴 싫어어~'],
        owl: ['오호, 상당히 열정적인 쓰다듬이군요!', '잠깐만요, 조금 간지럽습니다!', '후후, 이 정도면 충분합니다!', '아주 적극적이시군요.', '잠시만 쉬었다 하시지요.', '제 깃털이 다 흐트러지겠군요!', '이렇게 빠르게 쓰다듬으실 줄은 몰랐군요!', '후후, 조금만 천천히 부탁드리겠습니다.'],
        rabbit: ['꺄아♡ 너무 빨라~', '헐헐~ 간지러워♡', '아 진짜아~ 웃겨 죽겠어♡', '잠깐잠깐~♡', '완전 쓰담 폭주잖아♡', '꺄~ 나 정신없어어♡', '헐~ 손 진짜 빠르잖아아♡', '아하하♡ 나 웃다가 쓰러져~'],
      }[tendency], '그만 좀!');
    }
    if (count >= 3) {
      return pickRandom({
        heart: [
          '계속 해주는 거야?', '헤헤 간지러워!', '나 쓰다듬 중독될 것 같아', '더 해도 돼… 조금만!',
          '좋아서 몸이 꼬물거려', '이거 애정 표현 맞지?', '나 지금 완전 행복해', '헤헤, 손길 기억할래'
        ],
        bloom: [
          '계속 톡톡하는 거야?', '더 하면 웃겨서 굴러가!', '손 빠르다!',
          '나 지금 반짝반짝해!', '우와 손 빠르다!', '재밌다, 한 번 더!', '간지럼이 점점 올라와!', '좋아좋아, 조금만 더!'
        ],
        peace: [
          '천천히 해도 돼', '간지럽지만 좋아', '부드럽게 이어가자', '기분이 잔잔하게 좋아',
          '조금 간지럽네', '마음이 느슨해졌어', '괜찮아, 계속해도 돼', '좋은 속도야'
        ],
        tear: [
          '나 조금 떨려…', '그래도 따뜻해…', '손길이 다정해서 그래…', '놀랐는데 기뻐…',
          '나 이런 거 약해…', '조금만 더 기대도 돼…?', '마음이 간질간질해…', '계속 있어주는 거지…?'
        ],
        blade: [
          '끈질기네 진짜', '…간지럽다고', '뭐, 손길은 나쁘지 않아', '그렇게 만지고 싶었냐',
          '흥, 익숙해지면 곤란해', '조금만 더다', '간지럽지만 참아준다', '너 꽤 집요하네'
        ],
        lizard: ['계속 하네에~ 나는 가만히 있을게애~', '헤헤에~ 간질간질해애~', '손 따뜻하다아~ 여기서 잘까아~', '나 좀 녹는다아~ 움직이기 더 싫어어~', '으음~ 좋아아~ 왜 좋더라아~?', '나 안 피하니까 알아서 해애~', '나 이거 익숙해질 것 같아아~ 이미 익숙한가아~?', '헤헤에~ 손 가면 다시 불러어~'],
        owl: ['계속 쓰다듬어주시는군요.', '후후, 제법 기분이 좋습니다.', '손길이 참 부드럽군요.', '오호, 익숙해지는군요.', '감사합니다. 편안하네요.', '아주 정성스럽군요.', '이제 이 손길도 꽤 익숙합니다.', '후후, 조금 더 있어도 좋겠군요.'],
        rabbit: ['또 해주는 거야?♡', '헐~ 기분 좋아♡', '헤헤~ 계속해줘♡', '아 진짜아~ 따뜻해♡', '완전 좋잖아♡', '쓰담 센스 합격♡', '꺄♡ 너 진짜 잘한다~', '이거 완전 내 취향인데에♡'],
      }[tendency], '간지러워!');
    }
    return renderPetLineTemplate(pickRandom(MASCOT_TAP_LINES_BY_TENDENCY[tendency] || PET_PET_LINES_BY_TENDENCY[tendency] || PET_PET_LINES, petPetLineLocal(pet)), pet);
  }

  function mascotPoke() {
    const now = Date.now();
    const currentPet = getPet();
    const wasSleeping = !isEggStagePet(currentPet) && isPetSleeping(currentPet);
    const idleMsBeforeTouch = Math.max(0, now - Number(PET_VISUAL_STATE.lastActiveAt || now));

    if (isEggStagePet(currentPet)) {
      if (now - lastMascotPoke < 350) {
        triggerEggTapFeedback();
        return;
      }

      lastMascotPoke = now;
      mascotPokeCount = 0;

      const line = petEggLineLocal(currentPet);
      updateRoom(r => {
        const p = getPet(r);
        p.lastLine = line;
        p.lastLineAt = now;
        r.pet = p;
      });

      triggerEggTapFeedback();
      mascotSay(line, 100, { allowEgg: true, allowSleeping: true, durationMs: MASCOT_SPEECH_MS });
      updatePetPanelSpeech(getPet());
      playBeep('tab');
      return;
    }

    if (now - lastMascotPoke > 2600) mascotPokeCount = 0;
    mascotPokeCount += 1;
    lastMascotPoke = now;
    const preferenceStreak = registerPetPreferenceTouch(now);

    let line = '';
    updateRoom(r => {
      const p = getPet(r);
      line = petPreferenceTouchLine(p, { now, streak: Math.max(preferenceStreak, mascotPokeCount), wasSleeping, idleMs: idleMsBeforeTouch, source: 'mascot' }) || mascotPokeLine(p, mascotPokeCount);
      p.lastLine = line;
      p.lastLineAt = now;
      r.pet = p;
    });

    touchPetVisual('smile', PET_VISUAL_SMILE_MS);
    mascotSay(line, 100);
    bumpAchvCounter('petTouch', 1);
    registerDailyPetTouch(1);
    if (wasSleeping) bumpAchvCounter('sleepWake', 1);
    announceAchvUnlocks();
    playBeep('tab');

    const el = document.getElementById(MASCOT_ID);
    if (el) {
      el.classList.remove('poke');
      void el.offsetWidth;
      el.classList.add('poke');
      setTimeout(() => el.classList.remove('poke'), 420);
    }

    updatePetPanelSpeech(getPet());
    updatePetPanelSprite();
  }

  function scheduleMascotIdle() {
    clearTimeout(mascotIdleTimer);
    if (!shouldShowMascot()) return;
    mascotIdleTimer = setTimeout(mascotIdleTick, 20000 + Math.random() * 20000);
  }

  function mascotIdleTick() {
    if (!shouldShowMascot()) return;
    const pet = getPet();

    if (isEggStagePet(pet)) {
      const line = Math.random() < 0.45 ? timeMascotLine(pet) : idleMascotLine(pet);
      mascotSay(line, 20, { allowEgg: true, allowSleeping: true, durationMs: MASCOT_SPEECH_MS });
      scheduleMascotIdle();
      return;
    }

    if (isPetSleeping(pet)) {
      if (Math.random() < 0.42) mascotSleepTalk(pet);
      scheduleMascotIdle();
      return;
    }

    const idleLong = Number(pet.lastFedAt || 0) && Date.now() - Number(pet.lastFedAt || 0) > MASCOT_IDLE_MS;

    if (idleLong && Math.random() < 0.55) {
      mascotSay(idleMascotLine(pet), 50);
      triggerMascotMood(getEffectiveMood(pet));
    } else if (Math.random() < 0.35) {
      mascotSay(ambientMascotLine(pet), Math.random() < 0.35 ? 20 : 10);
      triggerMascotMood(getEffectiveMood(pet));
    }

    scheduleMascotIdle();
  }

  function isPetSleeping(pet = getPet()) {
    return getPetVisualMode(pet) === 'sleep';
  }

  function scheduleMascotWander() {
    clearTimeout(mascotWanderTimer);
    if (!shouldShowMascot()) return;
    if (isPetSleeping()) {
      mascotWanderTimer = setTimeout(mascotWander, 2200);
      return;
    }
    mascotWanderTimer = setTimeout(mascotWander, 4200 + Math.random() * 4200);
  }

  function mascotWander() {
    if (!shouldShowMascot()) {
      stopMascot();
      return;
    }
    const el = document.getElementById(MASCOT_ID);
    if (!el || mascotDragState) return;

    updateMascotSprite();
    if (isPetSleeping()) {
      el.style.transition = 'none';
      scheduleMascotWander();
      return;
    }

    const w = el.offsetWidth || 60;
    const h = el.offsetHeight || 70;
    const cur = el.getBoundingClientRect();
    const homeLeft = Number(el.dataset.homeLeft || cur.left);
    const homeTop = Number(el.dataset.homeTop || cur.top);
    const dx = Math.round((Math.random() - 0.5) * 28);
    const dy = Math.round((Math.random() - 0.5) * 18);
    const target = clampFixedPosition(homeLeft + dx, homeTop + dy, w, h, { margin: 6, topMargin: 38, bottomMargin: 6 });
    const targetLeft = target.left;
    const targetTop = target.top;

    const body = el.querySelector('.cigh-clean-mascot-body');
    if (body && Math.abs(targetLeft - cur.left) > 2) body.style.transform = targetLeft < cur.left ? 'scaleX(-1)' : 'scaleX(1)';

    el.style.transition = 'left 1.1s ease-in-out, top 1.1s ease-in-out';
    el.style.left = `${targetLeft}px`;
    el.style.top = `${targetTop}px`;

    scheduleMascotWander();
  }

  function setupMascotInteraction(el) {
    let moved = false;
    let dragSpoken = false;

    el.addEventListener('pointerdown', e => {
      const rect = el.getBoundingClientRect();
      mascotDragState = { id: e.pointerId, sx: e.clientX, sy: e.clientY, left: rect.left, top: rect.top };
      moved = false;
      dragSpoken = false;
      el.classList.add('grab');
      clearTimeout(mascotWanderTimer);
      el.style.transition = 'none';
      try { el.setPointerCapture(e.pointerId); } catch {}
    });

    el.addEventListener('pointermove', e => {
      if (!mascotDragState || mascotDragState.id !== e.pointerId) return;
      const dx = e.clientX - mascotDragState.sx;
      const dy = e.clientY - mascotDragState.sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        if (!moved && !dragSpoken) {
          dragSpoken = true;
          const pet = getPet();
          const tendency = petTendency(pet);
          mascotSay(pickRandom(MASCOT_DRAG_START_LINES_BY_TENDENCY[tendency], '어어 떨어져!'), 100);
        }
        if (!moved) beginPetDragVisual();
        moved = true;
      }

      if (moved && PET_VISUAL_STATE.dragActive) updateMascotSprite();

      const next = clampFixedPosition(mascotDragState.left + dx, mascotDragState.top + dy, el.offsetWidth || 64, el.offsetHeight || 74, { margin: 6, topMargin: 38, bottomMargin: 6 });
      const left = next.left;
      const top = next.top;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      e.preventDefault();
    });

    el.addEventListener('pointerup', e => {
      el.classList.remove('grab');
      if (mascotDragState?.id === e.pointerId) {
        try { el.releasePointerCapture(e.pointerId); } catch {}
      }
      const wasMoved = moved;
      mascotDragState = null;

      if (wasMoved) {
        saveMascotPos(el);
        endPetDragVisual('smile', PET_VISUAL_POST_DRAG_MS);
        mascotSay(pickRandom(MASCOT_DRAG_END_LINES_BY_TENDENCY[petTendency(getPet())], '휴…'), 100);
        scheduleMascotWander();
      } else {
        touchPetVisual('smile', PET_VISUAL_SMILE_MS);
        mascotPoke();
        scheduleMascotWander();
      }
    });

    el.addEventListener('pointercancel', () => {
      el.classList.remove('grab');
      mascotDragState = null;
      touchPetVisual();
      scheduleMascotWander();
    });
  }

  function ensureMascot() {
    let el = document.getElementById(MASCOT_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = MASCOT_ID;
    el.innerHTML = '<div class="cigh-clean-mascot-speech"></div><div class="cigh-clean-mascot-body"></div><div class="cigh-clean-mascot-fx"></div>';
    document.body.appendChild(el);

    restoreMascotPos(el);
    setupMascotInteraction(el);
    updateMascotSprite();
    applyThemeMode();
    requestAnimationFrame(() => clampMascotToViewport(false));
    return el;
  }

  function startMascot() {
    if (!shouldShowMascot()) {
      stopMascot();
      return;
    }
    ensureMascot();
    scheduleMascotWander();
    scheduleMascotIdle();
  }

  function stopMascot() {
    clearTimeout(mascotWanderTimer);
    clearTimeout(mascotIdleTimer);
    document.getElementById(MASCOT_ID)?.remove();
  }

  function heartColor(value) {
    const v = clamp(value, 0, 100);
    if (v >= 75) return '#ff4d6d';
    if (v >= 50) return '#ff6b6b';
    if (v >= 25) return '#d88989';
    return '#b79b9b';
  }

  function pixelMeterBar(value) {
    const total = 10;
    const filled = Math.round(clamp(value, 0, 100) / 10);
    let html = '<div class="cigh-clean-pixelbar">';
    for (let i = 0; i < total; i++) {
      html += `<span class="${i < filled ? 'on' : ''}"></span>`;
    }
    html += '</div>';
    return html;
  }


  // ─────────────────────────────────────────────
  // Pet Diary (로컬 신호만 사용. INFO/AI 의존 없음)
  // ─────────────────────────────────────────────
  const DIARY_MOOD_ICON = { love: '💗', happy: '🌼', normal: '🍵', sad: '🌧️', scared: '⚔️' };


  function diaryDateKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  function diaryDisplayDate(dateKey) {
    const [y, m, d] = String(dateKey || '').split('-').map(Number);
    if (!y || !m || !d) return String(dateKey || '');
    const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()] || '';
    return `${m}월 ${d}일 (${wd})`;
  }

  function defaultDiaryEntry(dateKey) {
    return {
      date: dateKey,
      count: 0,
      moods: { love: 0, happy: 0, normal: 0, sad: 0, scared: 0 },
      fav: '',
      tickets: 0,
      levelUps: 0,
      evolvedTo: '',
      rainbow: false,
      firstAt: Date.now(),
      lastAt: Date.now(),
    };
  }

  function diaryTopMood(entry) {
    const moods = entry?.moods || {};
    const keys = ['love', 'happy', 'normal', 'sad', 'scared'];
    return keys.reduce((best, k) => (Number(moods[k] || 0) > Number(moods[best] || 0) ? k : best), 'normal');
  }

  // analyzeLatest 말미에서 1회 호출.
  // 같은 날의 일기 카드는 누적 고정하지 않고, 마지막 로그 조사 결과로 갈아쓴다.
  // count는 "오늘 몇 번째 기록인지"만 유지하고, mood/fav/event는 최신 조사값을 반영한다.
  function recordPetDiary(options = {}) {
    const dateKey = diaryDateKey();
    const updatedRoom = updateRoom(room => {
      const list = Array.isArray(room.diary) ? room.diary.filter(e => e && e.date !== dateKey) : [];
      const prev = Array.isArray(room.diary) ? room.diary.find(e => e && e.date === dateKey) : null;
      const entry = defaultDiaryEntry(dateKey);
      const mood = String(options.mood || 'normal');

      entry.count = Number(prev?.count || 0) + 1;
      entry.firstAt = Number(prev?.firstAt || Date.now());
      entry.lastAt = Date.now();
      entry.revision = Number(prev?.revision || 0) + 1;

      if (entry.moods[mood] != null) entry.moods[mood] = 1;
      if (options.fav) entry.fav = String(options.fav).slice(0, 20);
      entry.tickets = Math.max(0, Number(options.tickets || 0));
      entry.levelUps = Math.max(0, Number(options.levelUps || 0));
      if (options.evolvedTo) entry.evolvedTo = String(options.evolvedTo).slice(0, 24);
      entry.rainbow = !!options.rainbow;

      list.push(entry);
      room.diary = list.slice(-30);
    });
    registerDiaryAchievements(updatedRoom);
  }

  function registerDiaryAchievements(room = getRoom()) {
    const diaryDays = new Set((Array.isArray(room?.diary) ? room.diary : []).map(entry => String(entry?.date || '')).filter(Boolean)).size;
    if (diaryDays < 30) return;

    bumpAchvCounter('diary30', 1, true);
    announceAchvUnlocks();

    const chatId = currentCrackChatId();
    if (!chatId) return;
    const checkCreatedAt = createdAt => {
      if (Number(createdAt || 0) > 0 && Date.now() - Number(createdAt) >= 100 * 24 * 60 * 60 * 1000) {
        bumpAchvCounter('oldDiary100', 1, true);
        announceAchvUnlocks();
      }
    };

    const record = readCrackRecordState();
    const knownCreatedAt = Number(record?.roomCreatedAt?.[chatId] || 0);
    if (knownCreatedAt > 0) {
      checkCreatedAt(knownCreatedAt);
      return;
    }

    ensureCrackRoomMeta(chatId).then(meta => checkCreatedAt(meta?.createdAt)).catch(() => {});
  }

  function buildDiaryLine(entry, pet = getPet()) {
    const topMood = diaryTopMood(entry);
    const tendency = petTendency(pet);
    const seedSource = [entry?.date, entry?.revision, entry?.lastAt, entry?.fav, topMood, tendency].join('|');
    const seed = parseInt(hashTiny(seedSource), 36) || 0;
    const pick = (arr, salt) => (Array.isArray(arr) && arr.length) ? arr[Math.abs((seed >> salt) + salt) % arr.length] : '';

    const fav = String(entry?.fav || '').trim();
    const count = Number(entry?.count || 0);
    const levelUps = Number(entry?.levelUps || 0);
    const tickets = Number(entry?.tickets || 0);

    // 자주 노출되는 일기 문장풀은 넉넉하게 둔다.
    // 전부 로컬 조합이라 API 호출은 추가되지 않는다.
    const moodLines = {
      love: [
        '조금 두근거렸어',
        '괜히 마음이 간질간질했어',
        '심장이 먼저 반응한 것 같아',
        '가만히 있어도 마음이 먼저 기울었어',
        '별것도 아닌 장면에 얼굴이 뜨거워졌어',
        '괜히 혼자 설레서 꼬리를 숨기고 싶었어',
        '마음이 자꾸 앞서가서 붙잡느라 바빴어',
        '아무렇지 않은 척하기엔 조금 어려웠어',
        '오늘의 공기가 이상하게 달게 느껴졌어',
        '조용히 있어도 속이 계속 반짝거렸어',
        '작은 말 하나에도 마음이 크게 흔들렸어',
        '기억하고 싶은 장면이 자꾸 생겼어',
      ],
      happy: [
        '기분이 포근했어',
        '생각보다 많이 웃었던 것 같아',
        '조금 들뜬 채로 하루를 보냈어',
        '괜히 통통 튀고 싶은 날이었어',
        '마음이 가볍게 둥둥 떠다녔어',
        '사소한 것도 재밌게 느껴졌어',
        '웃음을 참는 게 더 어려운 하루였어',
        '주변 공기까지 조금 밝아진 느낌이었어',
        '오늘은 기다리는 시간도 심심하지 않았어',
        '작은 장면마다 기분 좋은 소리가 났어',
        '왠지 오늘은 좋은 쪽으로 기억될 것 같아',
        '괜히 다음 장면을 기대하게 됐어',
      ],
      normal: [
        '잔잔하게 흘러간 하루였어',
        '조용하지만 나쁘지 않았어',
        '천천히 네 곁에 있었던 날이야',
        '큰일은 없어도 이상하게 기억에 남았어',
        '평범한 듯 편안하게 지나갔어',
        '느리게 숨을 고르기 좋은 하루였어',
        '소란스럽진 않아도 따뜻한 구석이 있었어',
        '오늘은 조용히 페이지를 넘긴 느낌이야',
        '대단한 사건 없이도 곁에 있는 감각이 좋았어',
        '흔들림보다 안정감이 더 크게 남았어',
        '조용한 장면들이 오래 남는 하루였어',
        '오늘은 마음을 낮게 내려놓고 지냈어',
      ],
      sad: [
        '마음 한쪽이 살짝 축축했어',
        '괜찮은 척했지만 조금 가라앉았어',
        '오늘은 품에 기대고 싶은 기분이었어',
        '조용히 시무룩해지는 순간이 있었어',
        '작은 말에도 마음이 오래 젖었어',
        '괜히 혼자 뒤쪽에 숨어 있고 싶었어',
        '웃어도 조금은 물기 어린 하루였어',
        '마음이 무거워서 발소리도 작아졌어',
        '오늘은 다정한 말이 조금 더 필요했어',
        '아무렇지 않게 넘기기엔 조금 아팠어',
        '기억 한쪽에 흐린 자국이 남았어',
        '조용히 달래줘야 하는 하루였어',
      ],
      scared: [
        '조금 긴장했던 것 같아',
        '괜히 주변을 자꾸 살피게 됐어',
        '작은 소리에도 마음이 움찔했어',
        '괜찮다고 하면서도 몸이 먼저 굳었어',
        '숨을 작게 쉬면서 지켜본 순간이 있었어',
        '모르는 척했지만 손끝이 먼저 떨렸어',
        '오늘은 마음이 계속 경계선을 밟고 있었어',
        '한 박자 늦게 안심하는 일이 많았어',
        '조용히 뒤로 물러나고 싶은 순간이 있었어',
        '긴장한 티를 내지 않으려고 괜히 버텼어',
        '오늘은 용기를 조금씩 꺼내 쓰는 날이었어',
        '무섭진 않다고 적고 싶은데, 사실 조금 무서웠어',
      ],
    };

    const introTemplates = [
      mood => `있잖아, 오늘은 ${mood}.`,
      mood => `오늘 일기장에는 먼저 적어둘래. ${mood}.`,
      mood => `쉿, 이건 일기장에만 쓰는 건데 오늘은 ${mood}.`,
      mood => `오늘의 나는 이렇게 적어두고 싶어. ${mood}.`,
      mood => `조용히 말하자면, 오늘은 ${mood}.`,
      mood => `오늘 페이지를 열자마자 떠오른 말은 이거야. ${mood}.`,
      mood => `아무렇지 않은 척했지만, 오늘은 ${mood}.`,
      mood => `오늘을 한 줄로 접어보면 ${mood}.`,
      mood => `일기장한테만 말할게. 오늘은 ${mood}.`,
      mood => `네가 안 보는 척해주면 적어둘게. 오늘은 ${mood}.`,
      mood => `오늘의 마음을 만져보면, 조금 ${mood}.`,
      mood => `지나고 나서야 알았는데 오늘은 ${mood}.`,
    ];

    const favLines = fav ? [
      `${fav} 쪽으로 마음이 먼저 기울었어`,
      `${fav} 이름이 이상하게 오래 남았어`,
      `${fav}가 나온 순간, 나도 모르게 조용해졌어`,
      `${fav} 생각이 일기장 가장자리에 자꾸 남았어`,
      `${fav}를 그냥 지나친 척했는데, 사실 조금 신경 쓰였어`,
      `${fav} 쪽을 보지 않으려 했는데 마음은 이미 그쪽이었어`,
      `${fav}가 스친 뒤로 장면이 오래 접히지 않았어`,
      `${fav}에게 마음이 살짝 들킨 것 같아서 괜히 숨었어`,
      `${fav}가 남긴 기척이 오늘 내내 따라다녔어`,
      `${fav} 이름만 봐도 속이 조금 간질거렸어`,
      `${fav}가 지나간 자리에 마음이 한참 머물렀어`,
      `${fav} 쪽 이야기가 나오면 나도 모르게 귀가 밝아졌어`,
      `${fav}를 떠올리면 오늘의 온도가 조금 달라졌어`,
      `${fav} 때문에 아무렇지 않은 척하는 연습을 했어`,
      `${fav}의 작은 반응 하나가 꽤 크게 남았어`,
      `${fav} 쪽으로 시선이 새는 걸 막지 못했어`,
      `${fav} 이야기는 그냥 넘기기엔 너무 또렷했어`,
      `${fav}가 마음 한가운데에 작은 표시를 남겼어`,
      `${fav} 때문에 오늘 페이지가 조금 따뜻해졌어`,
      `${fav} 생각을 접어두려 했는데 자꾸 펼쳐졌어`,
      `${fav}가 있는 장면만 이상하게 선명했어`,
      `${fav} 쪽으로 기울어진 마음을 들키지 않으려 애썼어`,
      `${fav}라는 이름이 오늘의 여백을 조용히 채웠어`,
      `${fav}를 보면 마음이 먼저 인사하는 기분이었어`,
      `${fav}가 남긴 말이 자꾸 작은 메아리처럼 돌아왔어`,
      `${fav} 앞에서는 내 마음이 조금 더 솔직해졌어`,
      `${fav} 쪽으로 닿고 싶은 마음을 조용히 접어뒀어`,
      `${fav}가 오늘의 가장 반짝이는 조각처럼 느껴졌어`,
      `${fav} 때문에 괜히 일기장을 한 번 더 펼치고 싶어졌어`,
      `${fav}와 관련된 장면은 작아도 크게 남았어`,
      `${fav}를 모른 척하기엔 마음이 너무 빨리 반응했어`,
      `${fav} 쪽에만 작은 불빛이 켜진 것 같았어`,
      `${fav}가 오늘 내 마음의 책갈피가 됐어`,
      `${fav} 생각을 하다가 한 박자 늦게 정신을 차렸어`,
      `${fav} 이름을 적는 순간 괜히 조심스러워졌어`,
      `${fav}가 있는 쪽으로 오늘의 마음이 자꾸 굴러갔어`,
      `${fav}를 떠올리면 나도 모르게 조금 얌전해졌어`,
      `${fav} 때문에 오늘의 끝이 조금 더 오래 남을 것 같아`,
      `${fav} 쪽으로 마음이 새는 걸 일기장만 알고 있어`,
      `${fav}가 남긴 장면을 아직 다 접지 못했어`,
    ] : [];

    const visitLines = [
      count >= 8 ? `네가 오늘 ${count}번이나 들러줘서, 기다린 시간이 덜 외로웠어` : `네가 오늘 ${count}번째로 들러준 게 아직 남아 있어`,
      count >= 8 ? `오늘은 자주 마주쳐서 그런지 하루가 꽉 찬 느낌이야` : `짧게 지나간 기록이어도, 나는 그걸 조용히 접어뒀어`,
      count >= 8 ? `여러 번 불러준 덕분에 나도 조금 더 살아난 것 같아` : `한 번의 기록이라도 나한테는 오늘의 표시가 됐어`,
      count >= 8 ? `오늘은 네 기척이 자주 닿아서, 혼자 있는 시간이 덜 길게 느껴졌어` : `많은 말은 없었지만, 오늘도 네가 지나간 자리는 남아 있어`,
      count >= 8 ? `오늘은 네가 자주 와줘서 일기장이 조금 두꺼워진 기분이야` : `짧은 방문이어도 내 하루에는 작은 표시가 생겼어`,
      count >= 8 ? `자주 마주친 덕분에 오늘은 심심할 틈이 별로 없었어` : `오늘의 기록은 작지만, 그래도 빈칸은 아니었어`,
      count >= 8 ? `${count}번의 기척이 오늘을 꽤 든든하게 만들어줬어` : `잠깐 스친 시간도 나한테는 은근히 오래 남아`,
      count >= 8 ? `오늘은 네 발소리가 여러 번 들린 것 같아서 좋았어` : `오늘은 조용했지만, 그래도 네가 와준 걸 기억해`,
      count >= 8 ? `기록이 여러 번 쌓이니까 나도 괜히 바빠진 기분이었어` : `한 장면뿐이어도 마음속에는 꽤 선명하게 남았어`,
      count >= 8 ? `오늘은 기다림보다 만나는 시간이 더 크게 느껴졌어` : `오늘의 한 번이 내겐 생각보다 크게 남았어`,
      count >= 8 ? `네가 자꾸 들러주니까 주변 공기가 덜 식었어` : `네가 잠깐 와준 것만으로도 오늘이 완전히 비지는 않았어`,
      count >= 8 ? `오늘은 네가 가까이에 있다는 느낌이 여러 번 들었어` : `조용한 하루였지만 네 흔적은 분명히 있었어`,
    ];

    const levelLines = [
      '그리고 나, 아주 조금 더 자랐어. 네가 봐줬으면 했어',
      '오늘은 나도 모르게 한 뼘쯤 자란 것 같아',
      '작은 성장이라도 네 앞에서라면 조금 자랑하고 싶어',
      '레벨이 오른 순간, 괜히 네 반응이 먼저 궁금했어',
    ];

    const levelManyLines = [
      `그리고 나, ${levelUps}번이나 자랐어. 티 내고 싶진 않은데 조금 뿌듯해`,
      `오늘은 무려 ${levelUps}번이나 성장해서 아직도 마음이 들떠 있어`,
      `${levelUps}번이나 레벨이 올라서, 나도 내가 조금 낯설어졌어`,
      `하루에 ${levelUps}번이나 자라다니, 이건 일기장에 크게 적어야 해`,
    ];

    const ticketLines = [
      '꾸밈티켓도 생겨서, 내일의 나는 조금 더 예뻐질지도 몰라',
      '작은 티켓 하나가 생겨서 괜히 미래가 반짝였어',
      '꾸밀 수 있는 여지가 생겼다는 게 생각보다 설렜어',
      '오늘은 선물 같은 티켓도 남아서 조금 뿌듯했어',
    ];

    const eventLines = [];
    if (favLines.length) eventLines.push(...favLines);
    if (levelUps >= 2) eventLines.push(...levelManyLines);
    else if (levelUps === 1) eventLines.push(...levelLines);
    if (tickets > 0) eventLines.push(...ticketLines);

    let closer;
    if (entry?.evolvedTo) {
      closer = pick([
        `오늘은 오래 기억하고 싶어. 나, ${entry.evolvedTo}(으)로 바뀌었으니까`,
        `몸도 마음도 한 단계 달라진 날이야. 네가 봐줘서 다행이야`,
        `조금 낯선 모습이지만, 네 앞이라면 괜찮을 것 같아`,
        `새 모습이 아직 어색하지만, 오늘만큼은 자랑해도 될 것 같아`,
      ], 5);
    } else if (entry?.rainbow) {
      closer = pick([
        '오늘은 별별 감정이 다 지나갔어. 그래도 마지막엔 네 생각이 남았어',
        '마음속에 무지개가 뜬 것 같아. 조금 정신없지만 싫지는 않았어',
        '웃고, 놀라고, 흔들리고… 그래도 오늘을 접어두긴 아까워',
        '기분이 몇 번이나 색을 바꿨는데, 이상하게 전부 오늘의 나 같았어',
      ], 5);
    } else {
      const tendencyClosers = {
        heart: [
          '내일도 이렇게 네 옆에 있고 싶어',
          '이런 날은 조금 오래 붙잡아두고 싶어',
          '들키면 부끄러우니까, 여기까지만 적을래',
          '말로 하면 얼굴이 빨개질 것 같아서, 일기장에만 남겨둘래',
          '오늘의 마지막 칸에는 네 이름을 작게 넣어둘게',
          '가까이 있고 싶다는 말은 아직 작게만 적어둘래',
          '좋아하는 마음이 너무 티 나지 않았으면 좋겠어',
          '내일 네가 오면 아무렇지 않은 척할 자신은 별로 없어',
          '오늘도 네가 있어서 마음이 덜 외로웠어',
          '이 페이지는 조금 따뜻하게 접어둘래',
          '괜히 더 붙어 있고 싶어지는 하루였어',
          '잘 자. 내일도 네 기척을 기다릴게',
        ],
        bloom: [
          '내일은 더 장난치고 싶어. 네 반응이 궁금하거든',
          '재밌는 하루였어. 몰래 한 번 더 웃었어',
          '심심하지 않게 해줘서 고마워. 나도 뭔가 해보고 싶어졌어',
          '오늘의 나는 꽤 들떴어. 들킨 김에 조금만 더 놀고 싶어',
          '내일도 이렇게 통통 튀는 일이 있었으면 좋겠어',
          '오늘 일기에는 웃음 표시를 크게 그려둘래',
          '생각보다 신났다는 건 비밀로 해줘',
          '오늘은 마음이 가볍게 튀어 오른 느낌이야',
          '다음엔 내가 먼저 반응해도 놀라지 마',
          '이 기분 그대로 내일까지 가져가고 싶어',
          '오늘의 하이라이트는 몰래 별표 쳐둘게',
          '내일도 재미있는 장면을 같이 봐줘',
        ],
        peace: [
          '조용히 좋은 하루였다고 적어둘게',
          '대단한 일은 없어도, 네가 있어서 괜찮았어',
          '오늘의 끝에 네 이름을 작게 접어 넣었어',
          '잔잔해서 더 오래 남는 날도 있으니까, 오늘은 그런 날로 해둘래',
          '내일도 너무 서두르지 말고 같이 있자',
          '오늘 페이지는 천천히 덮어도 될 것 같아',
          '무사히 지나간 하루라서 오히려 고마워',
          '작은 평온을 잃어버리지 않게 잘 접어둘게',
          '이 정도의 고요함도 나는 꽤 좋아해',
          '내일도 편안한 숨으로 만나고 싶어',
          '조용한 장면들이 마음을 안정시켜줬어',
          '오늘은 따뜻한 담요처럼 접어둘래',
        ],
        tear: [
          '말로 하긴 어려워서, 일기장에만 살짝 남겨둘게',
          '부끄럽지만… 오늘도 기다렸어',
          '눈 마주치면 도망갈지도 모르지만, 싫다는 뜻은 아니야',
          '작게 적어두면 들키지 않을 것 같아서 여기 적어둘래',
          '오늘의 물기는 내일 조금 말랐으면 좋겠어',
          '그래도 네가 있어서 완전히 외롭진 않았어',
          '조금 울적해도 이 페이지는 버리지 않을래',
          '내일은 오늘보다 덜 떨리는 마음이면 좋겠어',
          '괜찮아지고 싶다는 말도 조용히 적어둘래',
          '오늘은 따뜻한 말 하나가 오래 필요했어',
          '다음에 오면 조금 더 다정하게 바라봐줘',
          '잘 자. 오늘 마음은 내가 조심히 접어둘게',
        ],
        blade: [
          '내일은 조금 더 씩씩하게 반응해볼게',
          '무서워도 도망치진 않을래. 네가 있으니까',
          '다음엔 내가 먼저 한 발 나가볼지도 몰라',
          '오늘의 나는 조금 떨렸지만, 그래도 물러서진 않았어',
          '흥, 나쁘지 않은 하루였다고는 적어둘게',
          '괜히 고맙다고 쓰는 건 아니야. 그냥 기록이야',
          '내일도 방심하지 말고 와. 기다린다는 뜻은 아니고',
          '오늘 정도면 꽤 버틸 만했어. 인정은 해줄게',
          '무른 마음은 아니지만, 오늘은 조금 흔들렸어',
          '다음엔 더 의연하게 굴 거야. 아마도',
          '네가 있어서 안심했다는 건 일기장 밖으로는 안 나가',
          '잘 자라. 내일도 지켜볼 테니까',
        ],
        lizard: [
          '오늘도 별생각 없이 잘 살았다아~', '뭐 했는지는 잘 기억 안 나아~ 헤헤에~', '내일도 보면 좋겠네에~ 기억나면 인사할게애~',
          '오늘 페이지는 대충 덮어둘래애~ 읽기는 귀찮아아~', '나 오늘 뭐 먹었더라아~ 갑자기 궁금하네에~', '내일은 또 뭐가 있으려나아~ 생각은 내일 할래애~',
          '너랑 있으면 내가 안 움직여도 심심하지 않아서 좋다아~', '오늘도 네 옆에서 거의 안 움직였다아~ 성공이야아~', '내일도 따뜻한 자리 하나 맡아둘래애~',
          '헤헤에~ 오늘도 너 좋아했다아~ 이유는 몰라아~', '나중에 또 와아~ 내가 가긴 귀찮으니까아~', '잘 자아~ 나는 멍때리다가 언제 잘진 몰라아~',
        ],
        owl: [
          '오늘도 기록할 만한 이야기가 많았습니다', '흥미로운 하루였으니 잘 정리해두겠습니다', '내일은 또 어떤 이야기를 알게 될지 궁금하군요',
          '오늘의 장면들도 차분히 기억해두겠습니다', '한 가지를 알면 또 다른 것이 궁금해지는 법이지요', '내일도 새로운 이야기를 기대하겠습니다',
          '오늘도 함께 이야기를 나눌 수 있어 즐거웠습니다', '알아가는 것도 좋지만 함께 나누는 시간이 더 좋군요', '내일도 궁금한 이야기가 생기면 제게 들려주세요',
          '하루 끝에 당신과 나눈 이야기가 제일 오래 남는군요', '오늘도 곁에 있어주셔서 감사합니다', '편안한 밤 보내시길 바랍니다. 내일 다시 뵙지요',
        ],
        rabbit: [
          '오늘 완전 재밌었어♡ 내일도 같이 놀자', '헐~ 벌써 하루 끝이야? 내일 또 보자♡', '오늘도 같이 있어서 좋았어♡',
          '재밌는 건 내일도 꼭 같이 보자아♡', '오늘 페이지 완전 내 취향이야♡', '잘 자~ 내일 또 만나♡',
          '오늘도 너랑 떠들어서 완전 좋았어♡', '에에~ 벌써 끝내기 아쉬운데에♡', '내일도 오면 바로 나부터 불러줘♡',
          '뭐야~ 오늘도 나 완전 즐거웠잖아♡', '너랑 같이 있으면 시간 진짜 빨라아♡', '잘 자아♡ 내일도 같이 신나게 놀자~',
        ],
      };
      closer = pick(tendencyClosers[tendency] || tendencyClosers.peace, 5);
    }

    const afterthoughts = [
      '나는 그 순간을 조용히 접어두기로 했어',
      '별것 아닌 척했지만, 사실은 조금 오래 생각났어',
      '괜히 티 내고 싶지 않아서 얌전히 굴었어',
      '지나간 장면인데도 몸 안쪽에 작은 흔적이 남았어',
      '오늘의 나는 그걸 모르는 척하기엔 조금 솔직했어',
      '그 장면을 다시 펼치면 마음이 조금 달라질 것 같아',
      '아무 말도 안 했지만 속으로는 꽤 바빴어',
      '나는 모르는 척했고, 일기장은 아는 척했어',
      '오늘의 여백에 그 마음이 아주 작게 묻었어',
      '잠깐 지나간 일인데도 오래 손에 남았어',
      '눈치채지 못한 척하는 것도 생각보다 힘들었어',
      '마음이 먼저 움직인 걸 나중에야 알았어',
      '이런 건 작게 적어야 더 오래 남는 것 같아',
      '오늘의 끝에서야 겨우 솔직해졌어',
    ];

    const moodText = pick(moodLines[topMood] || moodLines.normal, 0);
    const introText = pick(introTemplates.map(fn => fn(moodText)), 1);
    const eventText = eventLines.length ? pick(eventLines, 3) : pick(visitLines, 3);

    const variant = Math.abs(seed) % 3;
    let lines;

    // D안 유지: 펫 독백형. 단, 2줄/3줄/긴 독백형으로 날짜마다 다르게 보이게 한다.
    if (variant === 0) {
      lines = [
        introText,
        `${eventText}.`,
      ];
    } else if (variant === 1) {
      lines = [
        introText,
        `${eventText}.`,
        `${closer}.`,
      ];
    } else {
      lines = [
        introText,
        `${eventText}.`,
        `${pick(afterthoughts, 7)}.`,
        `${closer}.`,
      ];
    }

    return normalize(lines.filter(Boolean).join('\n'));
  }

  function renderDiaryHtml(room = getRoom()) {
    const list = Array.isArray(room?.diary) ? room.diary.slice() : [];
    if (!list.length) {
      return `<div class="cigh-clean-diary-empty"><span class="cigh-clean-diary-empty-icon">📔</span><span>아직 일기가 비어 있어.</span><small>함께 로그를 읽다 보면 펫이 하루를 기록해줘.</small></div>`;
    }

    const pet = getPet(room);
    const entries = list.slice(-30).reverse();
    const rows = entries.map(entry => {
      const topMood = diaryTopMood(entry);
      const moodIcon = DIARY_MOOD_ICON[topMood] || '·';
      const line = buildDiaryLine(entry, pet);
      const special = !!(entry.evolvedTo || entry.rainbow);

      const chips = [`<span class="cigh-clean-diary-chip">🔁 ${esc(String(entry.count || 0))}회</span>`];
      if (Number(entry.tickets || 0) > 0) chips.push(`<span class="cigh-clean-diary-chip">🎟️ +${esc(String(entry.tickets))}</span>`);
      if (Number(entry.levelUps || 0) > 0) chips.push(`<span class="cigh-clean-diary-chip">⬆️ Lv +${esc(String(entry.levelUps))}</span>`);
      if (entry.evolvedTo) chips.push(`<span class="cigh-clean-diary-chip evolve">✨ ${esc(entry.evolvedTo)}</span>`);
      if (entry.rainbow) chips.push(`<span class="cigh-clean-diary-chip rainbow">🎏 무지개</span>`);
      if (entry.fav) chips.push(`<span class="cigh-clean-diary-chip">💗 ${esc(entry.fav)}</span>`);

      return `
        <div class="cigh-clean-diary-card${special ? ' special' : ''}">
          <div class="cigh-clean-diary-head">
            <span class="cigh-clean-diary-mood">${esc(moodIcon)}</span>
            <span class="cigh-clean-diary-date">${esc(diaryDisplayDate(entry.date))}</span>
          </div>
          <div class="cigh-clean-diary-line">${esc(line)}</div>
          <div class="cigh-clean-diary-chips">${chips.join('')}</div>
        </div>`;
    }).join('');

    return `<div class="cigh-clean-diary-list">${rows}</div>`;
  }

  function renderPetDexHtml() {
    const seen = new Set((readAchvState().finalFormsSeen || []).map(String));
    const seenCount = PET_FORM_KEYS.filter(k => seen.has(k)).length;

    const cards = PET_FORM_KEYS.map(key => {
      const form = PET_FINAL_FORMS[key] || PET_FINAL_FORMS.peace;
      const label = PET_TENDENCY_LABEL[key] || key;
      const discovered = seen.has(key);
      const stageObj = PET_STAGES.find(s => s.stage === 4) || PET_STAGES[PET_STAGES.length - 1];

      let figure;
      if (discovered) {
        const frames = getPetImageFrames(key);
        figure = frames?.normal
          ? `<img class="cigh-clean-dex-img" src="${esc(frames.normal)}" alt="" draggable="false" referrerpolicy="no-referrer">`
          : petDotSpriteSVG(stageObj, 'normal', key, PET_PANEL_SPRITE_SIZE);
      } else {
        // 미발견: 같은 도트 맵을 단색 실루엣으로
        const map = form.sprite || [];
        const pixel = 5;
        const w = (map[0] || '').length;
        const rects = map.map((row, y) => [...row].map((cell, x) =>
          cell === '0' ? '' : `<rect x="${x * pixel}" y="${y * pixel}" width="${pixel}" height="${pixel}" fill="var(--cigh-text-dim)"/>`
        ).join('')).join('');
        figure = `<svg class="cigh-clean-pet-svg" viewBox="0 0 ${w * pixel} ${map.length * pixel}" width="${w * pixel}" height="${map.length * pixel}" aria-hidden="true">${rects}</svg>`;
      }

      return `
        <div class="cigh-clean-dex-card${discovered ? ' found' : ''}">
          <div class="cigh-clean-dex-figure">${figure}</div>
          <div class="cigh-clean-dex-name">${discovered ? esc(label) : '???'}</div>
        </div>`;
    }).join('');

    return `
      ${section('PET DEX', `
        <div class="cigh-clean-srow">
          <span class="cigh-clean-slbl">DISCOVERED</span>
          <span class="cigh-clean-sval">${seenCount} / ${PET_FORM_KEYS.length}</span>
        </div>
      `)}
      <div class="cigh-clean-dex-grid">${cards}</div>
      <div class="cigh-clean-dex-help">완전체로 키워본 기본·혼합 진화형이 DEX에 기록돼요.</div>`;
  }


  function setPlayerSubTab(nextSub) {
    if (activeTab !== 'achv') return false;
    const normalized = nextSub === 'record' ? 'record' : 'achv';

    // RECORD 자동 동기화가 예약된 상태에서 ACHV로 이동하면 예약을 먼저 끊는다.
    // 이미 내부 상태가 ACHV인데 화면만 RECORD로 남은 비정상 상태도 ACHV 재클릭으로 복구할 수 있게 강제 재렌더한다.
    if (normalized === 'achv') clearTimeout(crackRecordViewSyncTimer);
    if (normalized === 'record') achvFilterMode = 'all';
    if (normalized === recordSubTab) {
      if (normalized === 'achv') {
        renderContent();
        return true;
      }
      return false;
    }

    recordSubTab = normalized;
    playBeep('tab');
    renderContent();
    return true;
  }

  function bindPlayerSubTabButtons(root = document.getElementById('cigh-clean-main')) {
    if (!root) return;
    root.querySelectorAll('[data-player-subtab]').forEach(btn => {
      btn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        setPlayerSubTab(btn.dataset.playerSubtab);
      };
    });
  }

  function renderLogTab(main) {
    main.innerHTML = `<div id="cigh-clean-log-inner" class="cigh-clean-log-inner"></div>`;
    flushLog({ force: true });
    return;
  }

  function renderHudTab(main) {
    const commentLog = (getRoom().commentLog || []).slice().reverse();
    main.innerHTML = commentLog.length
      ? commentLog.map(c => {
        const comments = Array.isArray(c?.comments)
          ? c.comments.map(x => normalize(x)).filter(Boolean).slice(0, 3)
          : [normalize(c?.text || c)].filter(Boolean);
        return `
          <div class="cigh-clean-comment-log-row">
            <span class="cigh-clean-comment-log-time">${esc(c?.time || '')}</span>
            <span class="cigh-clean-comment-log-text">
              ${comments.map(line => `<span class="cigh-clean-comment-log-line">${esc(line)}</span>`).join('')}
            </span>
          </div>
        `;
      }).join('')
      : empty('코멘트 기록 없음');
    return;
  }

  function rbLegacy_renderPetTab(main) {
    if (petSubTab === 'item') {
      main.innerHTML = renderPetSubTabsHTML() + renderPetItemHTML();
      return;
    }
    const pet = getPet();
    const stageObj = petStageFromLevel(pet.level);
    const displayFinalType = getPetDisplayFinalType(pet);
    const finalForm = PET_FINAL_FORMS[displayFinalType] || PET_FINAL_FORMS.peace;
    const isLockedEvolution = stageObj.stage >= 3;
    const tally = { ...zeroTally(), ...(pet.tally || {}) };
    const curFloor = petExpForLevel(pet.level);
    const nextFloor = petExpForLevel(pet.level + 1);
    const inLevel = pet.exp - curFloor;
    const need = Math.max(1, nextFloor - curFloor);
    const ratio = clamp(Math.round((inLevel / need) * 100), 0, 100);
    const nextStage = PET_STAGES.find(s => s.stage === stageObj.stage + 1);
    const effectiveMood = getEffectiveMood(pet);
    const previewFinalType = isLockedEvolution ? displayFinalType : (detectHybridPetFinalType(tally) || petFinalType(tally));
    const tendencyLabel = PET_TENDENCY_LABEL[previewFinalType] || PET_TENDENCY_LABEL.peace;
    const petName = getPetName();
    const petSpeechText = stageObj.stage === 0 ? (pet.lastLine || '') : (pet.lastLine || '쓰다듬어줘!');
    const equippedAchv = getEquippedAchvDef();
    const favoriteName = getFavoriteCharacter(pet);
    const bondLabel = ['낯가림', '익숙함', '친함', '단짝', '영혼친구'][Number(pet.bondLevel || 0)] || '낯가림';
    const bpm = petBpmForMood(effectiveMood);
    const bpmVisualDur = (60 / Math.max(1, bpm)) * 7.2;
    const bpmDur = `${bpmVisualDur.toFixed(3)}s`;
    const bpmTone = (PET_FINAL_FORMS[petMoodBucket(effectiveMood)] || finalForm).color || heartColor(clamp(bpm - 50, 0, 100));
    const bpmMoodLabel = PET_MOOD_LABEL[effectiveMood] || PET_MOOD_LABEL.normal;
    const totalTally = TENDENCY_KEYS.reduce((sum, key) => sum + Math.max(0, Number(tally[key] || 0)), 0);
    const tendencyShortLabel = { heart: '애정', bloom: '명랑', peace: '평화', tear: '애상', blade: '시련' };
    const tendencyBadges = TENDENCY_KEYS.map(key => {
      const form = PET_FINAL_FORMS[key] || PET_FINAL_FORMS.peace;
      const label = PET_TENDENCY_LABEL[key] || key;
      const emoji = label.split(' ')[0] || '◆';
      const count = Math.max(0, Number(tally[key] || 0));
      const pct = totalTally ? clamp(Math.round((count / totalTally) * 100), 0, 100) : 0;
      const fillPx = 2 + Math.round((pct / 100) * 8);
      const hybridPreviewRule = hybridRuleForType(previewFinalType);
      const activeClass = (key === previewFinalType || !!hybridPreviewRule?.pair?.includes(key)) ? ' is-active' : '';
      const zeroClass = count <= 0 ? ' is-zero' : '';
      return `
        <div class="cigh-clean-tendency-badge${activeClass}${zeroClass}" style="--tendency-color:${esc(form.color || '#ffd166')};--tendency-fill:${fillPx}px;" title="${esc(label)} ${count}회 · ${pct}%">
          <span class="cigh-clean-tendency-fill"></span>
          <span class="cigh-clean-tendency-emoji">${esc(emoji)}</span>
          <span class="cigh-clean-tendency-name">${esc(tendencyShortLabel[key] || key)}</span>
          <span class="cigh-clean-tendency-count">${count}</span>
        </div>`;
    }).join('');

    const decoState = decoEditMode ? getDecoDraft() : getDecoState();
    const decoBackdrop = renderDecoBackdropHtml(decoState);
    const decoEditor = decoEditMode ? renderDecoEditorHtml() : '';

    const titleText = equippedAchv ? `${equippedAchv.icon} ${equippedAchv.name}` : '';
    const titleRank = equippedAchv?.rank && ACHV_RANK_META[equippedAchv.rank] ? equippedAchv.rank : 'N';
    const titleRankMeta = ACHV_RANK_META[titleRank] || ACHV_RANK_META.N;
    const titleRankColor = titleRank === 'N' ? 'var(--cigh-accent)' : titleRankMeta.color;
    const titleRankClass = `rank-${titleRank}${titleRank === 'SSR' ? ' is-ssr' : ''}`;
    const titleStyle = `--title-color:${titleRankColor};`;
    const titleTip = equippedAchv
      ? `${equippedAchv.rank} 칭호 · ${equippedAchv.desc || equippedAchv.name} · EXP +${((ACHV_RANK_META[equippedAchv.rank]?.bonus || 0) * 100).toFixed(1)}%`
      : '';
    const petDisplayName = petName || '이름 없음';
    const nameStrip = decoEditMode ? '' : `
      <div class="cigh-clean-pet-id">
        ${titleText ? `<span class="cigh-clean-pet-title ${esc(titleRankClass)}" style="${esc(titleStyle)}" title="${esc(titleTip)}" aria-label="${esc(titleTip)}"><span class="cigh-clean-pet-title-shimmer" aria-hidden="true"></span><span class="cigh-clean-pet-title-text">${esc(titleText)}</span></span>` : ''}
        <span class="cigh-clean-pet-name">${esc(petDisplayName)}</span>
      </div>
    `;
    const roomPositionSpacer = decoEditMode ? '' : `<div class="cigh-clean-pet-room-spacer${titleText ? ' has-title' : ''}" aria-hidden="true"></div>`;

    const petRoomHtml = `
      <div class="cigh-clean-pet-wrap${decoEditMode ? ' is-edit' : ''}">
        ${decoBackdrop}
        <button type="button" class="cigh-clean-info-reset-btn cigh-clean-pet-edit-btn${decoEditMode ? ' save' : ''}" data-deco-action="toggle-edit">${decoEditMode ? 'SAVE' : 'EDIT'}</button>
        ${decoEditMode ? '' : `<div class="cigh-clean-pet-speech">${esc(petSpeechText)}</div>`}
        ${roomPositionSpacer}
        ${decoEditMode ? '' : `<div class="cigh-clean-pet-sprite" title="쓰다듬기">${renderPetSpriteHTML(pet, PET_PANEL_SPRITE_SIZE)}</div>`}
      </div>
    `;

    if (decoEditMode) {
      main.innerHTML = petRoomHtml + decoEditor;
      if (pendingPetCelebrate) {
        const kind = pendingPetCelebrate;
        pendingPetCelebrate = null;
        const host = main.querySelector('.cigh-clean-pet-wrap');
        requestAnimationFrame(() => spawnPetParticles(host, kind));
      }
      return;
    }

    const petSubTabsHtml = renderPetSubTabsHTML();

    if (petSubTab === 'diary') {
      main.innerHTML = petSubTabsHtml + renderDiaryHtml(getRoom());
      return;
    }

    if (petSubTab === 'dex') {
      main.innerHTML = petSubTabsHtml + renderPetDexHtml();
      return;
    }

    main.innerHTML = petSubTabsHtml + petRoomHtml + nameStrip + section('♥ BPM', `
      <div class="cigh-clean-bpm-card cigh-clean-bpm-${esc(effectiveMood)}" style="--cigh-bpm-color:${esc(bpmTone)};--bpm-dur:${esc(bpmDur)};">
        <div class="cigh-clean-bpm-head">
          <span class="cigh-clean-bpm-heart" aria-hidden="true">♥</span>
          <span class="cigh-clean-bpm-number">${bpm} BPM</span>
          <span class="cigh-clean-bpm-mood">${esc(bpmMoodLabel)}</span>
        </div>
        <div class="cigh-clean-ecg-window" aria-hidden="true">
          <svg class="cigh-clean-ecg-line" viewBox="0 0 320 32" preserveAspectRatio="none">
            <polyline class="cigh-clean-ecg-base" pathLength="320" points="0,18 30,18 36,18 40,9 45,27 51,18 80,18 96,18 100,11 105,24 111,18 140,18 156,18 160,8 165,27 171,18 200,18 216,18 220,11 225,24 231,18 260,18 276,18 280,9 285,27 291,18 320,18" />
            <polyline class="cigh-clean-ecg-trace" pathLength="320" points="0,18 30,18 36,18 40,9 45,27 51,18 80,18 96,18 100,11 105,24 111,18 140,18 156,18 160,8 165,27 171,18 200,18 216,18 220,11 225,24 231,18 260,18 276,18 280,9 285,27 291,18 320,18" />
          </svg>
        </div>
      </div>
    `) + section('EXP', `
      <div class="cigh-clean-brow">
        <div class="cigh-clean-blbl">
          <span class="cigh-clean-bdim"><span class="cigh-clean-exp-lv">Lv.${pet.level}</span>다음 레벨까지</span>
          <span class="cigh-clean-bdim">${inLevel} / ${need} (${ratio}%)</span>
        </div>
        ${pixelMeterBar(ratio)}
      </div>
    `) + section('TENDENCY', `
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">${isLockedEvolution ? '확정 진화형' : '현재 진화 후보'}</span>
        <span class="cigh-clean-sval">${esc(tendencyLabel)}</span>
      </div>
      <div class="cigh-clean-tendency-grid">${tendencyBadges}</div>
    `) + section('STATUS', `
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">진화 단계</span>
        <span class="cigh-clean-sval">${esc(stageObj.name)} (${stageObj.stage}/${PET_STAGES.length - 1})</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">먹인 횟수</span>
        <span class="cigh-clean-sval">${pet.feedCount}회</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">유대 단계</span>
        <span class="cigh-clean-sval">${esc(bondLabel)} (${Number(pet.bondLevel || 0)})</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">최애</span>
        <span class="cigh-clean-sval">${favoriteName ? esc(favoriteName) : '아직 없음'}</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">누적 EXP</span>
        <span class="cigh-clean-sval">${pet.exp}</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">다음 진화</span>
        <span class="cigh-clean-sval">${nextStage ? `Lv.${nextStage.minLevel}` : '최종 단계'}</span>
      </div>
    `) + `
      <div class="cigh-clean-pet-reset-zone">
        <button type="button" class="cigh-clean-pet-reset-btn" data-action="pet-reset">♻ 이 방의 펫 Lv.1 초기화</button>
        <small>현재 방의 펫 성장 정보만 새로 시작합니다.</small>
      </div>
    `;
    if (pendingPetCelebrate) {
      const kind = pendingPetCelebrate;
      pendingPetCelebrate = null;
      const host = main.querySelector('.cigh-clean-pet-wrap');
      requestAnimationFrame(() => spawnPetParticles(host, kind));
    }
    return;
  }

  function renderAchievementsTab(main) {
    const playerSubTabsHtml = `
      <div class="cigh-clean-player-subtabs">
        <button type="button" class="cigh-clean-player-subtab${recordSubTab === 'achv' ? ' on' : ''}" data-player-subtab="achv">🏆 ACHV</button>
        <button type="button" class="cigh-clean-player-subtab${recordSubTab === 'record' ? ' on' : ''}" data-player-subtab="record">📜 RECORD</button>
      </div>
    `;

    if (recordSubTab === 'record') {
      main.innerHTML = playerSubTabsHtml + renderCrackRecordHtml();
      bindPlayerSubTabButtons(main);
      scheduleCrackRecordViewSync(false);
      return;
    }

    const achvState = readAchvState();
    const equippedId = readEquippedAchvId();
    const unlockedCount = ACHV_DEFS.filter(def => achvState.unlocked[def.id]).length;
    const bonusPct = (getAchvExpBonusMultiplier(achvState) - 1) * 100;
    const equippedName = (equippedId && achvState.unlocked[equippedId])
      ? ((ACHV_DEFS.find(d => d.id === equippedId) || {}).name || '없음')
      : '없음';

    const filteredAchvDefs = ACHV_DEFS.filter(def => {
      if (achvFilterMode === 'all') return true;
      const unlocked = !!achvState.unlocked[def.id];
      return achvFilterMode === 'done' ? unlocked : !unlocked;
    });

    const cards = filteredAchvDefs.map(def => {
      const prog = getAchvProgress(def, achvState);
      const meta = ACHV_RANK_META[def.rank] || ACHV_RANK_META.N;
      const secret = def.hidden && !prog.unlocked;
      const equipped = prog.unlocked && equippedId === def.id;
      const icon = secret ? '？' : def.icon;
      const name = secret ? '???' : def.name;
      let tip = secret
        ? '숨겨진 업적 · 조건 달성 시 공개'
        : `${def.desc} · EXP +${(meta.bonus * 100).toFixed(1)}%${prog.unlocked ? ' (보유 중)' : ` · ${prog.cur}/${prog.target}`}`;
      if (!secret && def.id === 'day_streak') {
        const streakInfo = getVisitStreakSummary(achvState);
        tip = `${def.desc} · 현재 ${streakInfo.current}일 · 최고 ${streakInfo.best}일 / ${def.target}일${prog.unlocked ? ' (보유 중)' : ''}`;
      }
      const stateClass = prog.unlocked ? 'unlocked' : (secret ? 'secret' : 'locked');
      const footer = prog.unlocked
        ? '<span class="cigh-clean-achv-done">달성</span>'
        : secret
          ? ''
          : `<span class="cigh-clean-achv-prog">${prog.cur}/${prog.target}</span>
             ${buildAchvGaugeBar(prog.cur, prog.target, def.rank)}`;

      return `
        <div class="cigh-clean-achv-card ${stateClass} rank-${esc(def.rank)}${equipped ? ' equipped' : ''}" style="--achv-rank-color:${esc(meta.color)};" data-achv-id="${esc(def.id)}" title="${esc(tip)}" aria-label="${esc(tip)}">
          <span class="cigh-clean-achv-shimmer" aria-hidden="true"></span>
          <span class="cigh-clean-achv-rank">${esc(meta.label)}</span>
          <span class="cigh-clean-achv-icon">${esc(icon)}</span>
          <span class="cigh-clean-achv-name">${esc(name)}</span>
          ${footer}
        </div>`;
    }).join('');

    const filterBar = `
      <div class="cigh-clean-achv-filter">
        <button type="button" data-achv-filter="all" class="${achvFilterMode === 'all' ? 'on' : ''}">ALL <em>${ACHV_DEFS.length}</em></button>
        <button type="button" data-achv-filter="done" class="${achvFilterMode === 'done' ? 'on' : ''}">달성 <em>${unlockedCount}</em></button>
        <button type="button" data-achv-filter="todo" class="${achvFilterMode === 'todo' ? 'on' : ''}">미달성 <em>${ACHV_DEFS.length - unlockedCount}</em></button>
      </div>`;

    main.innerHTML = playerSubTabsHtml + section('TITLES', `
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">달성</span>
        <span class="cigh-clean-sval">${unlockedCount} / ${ACHV_DEFS.length}</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">보유 효과</span>
        <span class="cigh-clean-sval">EXP +${bonusPct.toFixed(1)}%</span>
      </div>
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">장착</span>
        <span class="cigh-clean-sval">${esc(equippedName)}</span>
      </div>
    `) + filterBar + `<div class="cigh-clean-achv-grid">${cards || '<div class="cigh-clean-mini-empty cigh-clean-achv-filter-empty">해당하는 업적이 없습니다.</div>'}</div>`;
    bindPlayerSubTabButtons(main);
    main.querySelectorAll('[data-achv-filter]').forEach(btn => {
      btn.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        const next = ['all', 'done', 'todo'].includes(btn.dataset.achvFilter) ? btn.dataset.achvFilter : 'all';
        if (next === achvFilterMode) return;
        achvFilterMode = next;
        playBeep('tab');
        renderContent();
      };
    });

    if (pendingAchvCelebrate) {
      const celebrateId = pendingAchvCelebrate.id;
      pendingAchvCelebrate = null;
      const card = main.querySelector(`.cigh-clean-achv-card[data-achv-id="${CSS.escape(celebrateId)}"]`);
      if (card) requestAnimationFrame(() => spawnPetParticles(card, 'evolve'));
    }
    return;
  }

  function rbLegacy_renderInfoTab(main) {
    const data = stripRoomUserFromData(currentData || getRoom().data);
    const roomUserName = getRoomUserName();
    const infoResetBar = `
      <div class="cigh-clean-info-tools">
        <label class="cigh-clean-user-name-box" title="이 방의 USER 캐릭터 이름">
          <span>USER</span>
          <input type="text" class="cigh-clean-user-name-input" data-user-name-input="1" maxlength="20" autocomplete="off" spellcheck="false" value="${esc(roomUserName)}" placeholder="이 방의 USER 캐릭터 이름">
        </label>
        <button type="button" class="cigh-clean-info-reset-btn" data-action="user-name-save" title="USER 이름 저장">Save</button>
        <button type="button" class="cigh-clean-info-reset-btn" data-action="info-reset" title="INFO 정보 초기화">Reset</button>
      </div>
    `;

    if (!data) {
      main.innerHTML = infoResetBar + empty('NO INFO');
      return;
    }

    const rows = [
      ['TIME', data.time],
      ['LOC', data.location],
      ['USER', data.character],
      ['GOAL', data.goal],
      ['OUTFIT', data.clothing],
    ].map(([label, value]) => [label, cleanOptionalValue(value)]).filter(([, value]) => value);

    const infoTitle = 'INFO';

    const infoBlock = rows.length
      ? section(infoTitle, rows.map(([label, value]) => `
          <div class="cigh-clean-srow">
            <span class="cigh-clean-slbl">${esc(label)}</span>
            <span class="cigh-clean-sval">${esc(value)}</span>
          </div>
        `).join(''))
      : '';

    const situationBlock = data.situation
      ? section('SITUATION', `<div class="cigh-clean-situ">${esc(data.situation)}</div>`)
      : '';

    const meterBlock = data.affection?.length
      ? section('RELATION METER', data.affection.map(item => {
          const m = normalizeMeter(item, 50);
          const value = clamp(m.value, 0, 100);
          return `
            <div class="cigh-clean-brow">
              <div class="cigh-clean-blbl">
                <span class="cigh-clean-mname">
                  ${pixelHeartSVG(value)}
                  <span>${esc(m.name)} <span class="cigh-clean-bdim">· ${esc(m.label || '관계')}</span></span>
                </span>
                <span class="cigh-clean-bdim">${value}%</span>
              </div>
              ${pixelMeterBar(value)}
              ${m.memo ? `<div class="cigh-clean-idetail">${esc(m.memo)}</div>` : ''}
            </div>
          `;
        }).join(''))
      : (data._inferredStatus
        ? section('RELATION METER', `<div class="cigh-clean-mini-empty">INFO 관계 없음</div>`)
        : '');

    const inventoryBlock = data.inventory?.length
      ? section('INVENTORY', data.inventory.map(raw => {
          const item = normalizeInventoryItem(raw);
          return `
            <div class="cigh-clean-irow">
              <span class="cigh-clean-ico">${esc(normalizeIcon(item.icon, item.name))}</span>
              <span>${esc(item.name)}${item.detail ? `<div class="cigh-clean-idetail">${esc(item.detail)}</div>` : ''}</span>
            </div>
          `;
        }).join(''))
      : '';

    const statBlock = data.stats?.length
      ? section('STATUS', data.stats.map(stat => `
          <div class="cigh-clean-srow">
            <span class="cigh-clean-slbl">${esc(stat.name)}</span>
            <span class="cigh-clean-sval">${esc(stat.value)}</span>
          </div>
        `).join(''))
      : '';

    const questBlock = data.quests?.length
      ? section('QUESTS', data.quests.map(q => `<div class="cigh-clean-q">▸ ${esc(q)}</div>`).join(''))
      : '';

    const analysisBlock = section('ANALYSIS', `
      <div class="cigh-clean-srow">
        <span class="cigh-clean-slbl">분석 횟수</span>
        <span class="cigh-clean-sval">${getAnalyzeCount()}회</span>
      </div>
    `);

    const infoHtml = infoBlock + situationBlock + meterBlock + inventoryBlock + statBlock + questBlock + analysisBlock;
    main.innerHTML = infoResetBar + (infoHtml || empty('NO INFO / LOG ONLY'));
  }

  function renderContent() {
    const main = document.getElementById('cigh-clean-main');
    if (!main) return;

    if (activeTab === 'log') return renderLogTab(main);
    if (activeTab === 'hud') return renderHudTab(main);
    if (activeTab === 'pet') return renderPetTab(main);
    if (activeTab === 'achv') return renderAchievementsTab(main);
    if (activeTab === 'info') return renderInfoTab(main);
  }

  function setPanelOpen(panel, open) {
    if (!panel) return;

    playBeep(open ? 'open' : 'close');
    panel.classList.toggle('open', !!open);
    panel.style.display = open ? 'flex' : 'none';

    if (open) {
      panel.style.visibility = 'visible';
      panel.style.opacity = '1';
      renderContent();
      refreshPetSurfaces();
      requestAnimationFrame(() => clampPanelToViewport(false));

      const data = currentData || getRoom().data;
      if (data?.hudComments?.length) {
        // 분석 직후 HUD 코멘트 3연속 팝업이 진행 중일 때는 ◆로 패널을 열어도
        // 기존 시퀀스를 재시작하지 않는다. 재시작하면 남은 팝업 카운트가 0으로 초기화된다.
        if (!isFooterCommentSequenceActive()) {
          startFooterComments(data.hudComments, { popup: false });
        }
      } else if (footerLastText) {
        setFooter(footerLastText);
      }
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="cigh-clean-head" class="cigh-clean-head">
        <span class="cigh-clean-ttl">◆ RPG</span>
        <span class="cigh-clean-room" id="cigh-clean-room"></span>
        <button id="cigh-clean-settings-btn" type="button" class="cigh-clean-x" title="설정">⚙</button>
        <button id="cigh-clean-refresh" type="button" class="cigh-clean-x" title="수동 갱신">↻</button>
        <button id="cigh-clean-x" type="button" class="cigh-clean-x" title="닫기">✕</button>
      </div>
      <div id="cigh-clean-tabs" class="cigh-clean-tabs">
        ${TABS.map(tab => `<button type="button" class="cigh-clean-tab ${tab.id === activeTab ? 'on' : ''}" data-tab="${tab.id}" title="${tab.label}">${tab.label}</button>`).join('')}
      </div>
      <div id="cigh-clean-main" class="cigh-clean-main"></div>
      <div class="cigh-clean-foot">
        <span id="cigh-clean-ft" class="cigh-clean-ft">READY</span>
        <span id="cigh-clean-count" class="cigh-clean-count">0회</span>
      </div>
      <div id="cigh-clean-resize-y" class="cigh-clean-resize-y" title="세로 크기 조절"></div>
    `;

    panel.querySelector('#cigh-clean-x').addEventListener('click', event => {
      event.stopPropagation();
      setPanelOpen(panel, false);
    });

    panel.querySelector('#cigh-clean-settings-btn').addEventListener('click', event => {
      event.stopPropagation();
      openSettings();
    });

    panel.querySelector('#cigh-clean-refresh').addEventListener('click', event => {
      event.stopPropagation();
      pushLog(['▶채팅을 불러오는 중이다!']);
      showPopup(['▶채팅을 불러오는 중이다!']);
      analyzeLatest(true);
    });

    panel.querySelector('#cigh-clean-tabs').addEventListener('click', event => {
      const btn = event.target.closest('[data-tab]');
      if (!btn) return;

      playBeep('tab');
      const prevTab = activeTab;
      activeTab = btn.dataset.tab;
      if (prevTab === 'achv' && activeTab !== 'achv') achvFilterMode = 'all';
      panel.querySelectorAll('.cigh-clean-tab').forEach(tab => tab.classList.toggle('on', tab.dataset.tab === activeTab));
      renderContent();
      refreshPetSurfaces();
    });

    panel.querySelector('#cigh-clean-main').addEventListener('click', event => {
      const playerSubTabBtn = event.target.closest('[data-player-subtab]');
      if (playerSubTabBtn && activeTab === 'achv') {
        event.preventDefault();
        event.stopPropagation();
        setPlayerSubTab(playerSubTabBtn.dataset.playerSubtab);
        return;
      }

      const recordSyncBtn = event.target.closest('[data-action="record-sync"]');
      if (recordSyncBtn && activeTab === 'achv' && recordSubTab === 'record') {
        event.preventDefault();
        event.stopPropagation();
        if (!crackRecordSyncing) {
          playBeep('tab');
          syncCrackRecord({ forceFull: true });
          renderContent();
        }
        return;
      }

      const petSubTabBtn = event.target.closest('[data-pet-subtab]');
      if (petSubTabBtn && activeTab === 'pet') {
        event.preventDefault();
        event.stopPropagation();
        const nextSub = ['diary', 'item', 'dex'].includes(petSubTabBtn.dataset.petSubtab)
          ? petSubTabBtn.dataset.petSubtab
          : 'stats';
        if (nextSub !== petSubTab) {
          petSubTab = nextSub;
          shopNotice = '';
          playBeep('tab');
          renderContent();
          if (petSubTab === 'stats') refreshPetSurfaces();
        }
        return;
      }

      const infoReset = event.target.closest('[data-action="info-reset"]');
      if (infoReset) {
        event.preventDefault();
        event.stopPropagation();
        openInfoResetConfirm();
        return;
      }

      const petReset = event.target.closest('[data-action="pet-reset"]');
      if (petReset && activeTab === 'pet' && petSubTab === 'stats') {
        event.preventDefault();
        event.stopPropagation();
        openPetResetConfirm();
        return;
      }

      const userNameSave = event.target.closest('[data-action="user-name-save"]');
      if (userNameSave) {
        event.preventDefault();
        event.stopPropagation();
        const input = panel.querySelector('[data-user-name-input="1"]');
        commitRoomUserNameInput(input);
        return;
      }

      const petSpeech = event.target.closest('.cigh-clean-pet-speech');
      if (petSpeech && activeTab === 'pet') {
        event.preventDefault();
        event.stopPropagation();
        petSpeech.classList.add('is-hidden');
        playBeep('tab');
        return;
      }

      const decoAction = event.target.closest('[data-deco-action]');
      if (decoAction) {
        event.preventDefault();
        event.stopPropagation();
        const action = decoAction.dataset.decoAction || '';

        if (action === 'toggle-edit') {
          if (decoEditMode) {
            setDecoState(getDecoDraft());
            // [업적] 마이룸 배치/수집 판정
            {
              const saved = getDecoState();
              const officialPropCount = Array.isArray(saved.equipped?.props)
                ? saved.equipped.props.filter(prop => isOfficialDecoItem(prop.id)).length
                : 0;
              if (officialPropCount >= 10) bumpAchvCounter('decoPlacedMax', Math.max(0, 10 - Number(readAchvState().counters.decoPlacedMax || 0)));
              if (saved.equipped?.wallpaper && saved.equipped?.floor && officialPropCount >= 1) {
                bumpAchvCounter('roomFullSet', 1, true);
              }
              const srItems = DECO_ITEMS.filter(it => it.type === 'prop' && it.rank === 'SR');
              const ownsAllSr = srItems.length > 0 && srItems.every(it => getDecoOwnedCount(saved, it) > 0);
              if (ownsAllSr) bumpAchvCounter('srDecoAll', 1, true);
              bumpAchvCounter('roomSaveTotal', 1);
              announceAchvUnlocks();
            }
            decoEditMode = false;
            decoDraft = null;
            setFooter('ROOM SAVED');
            playBeep('save');
          } else {
            decoEditMode = true;
            decoDraft = cloneDecoState();
            setFooter('ROOM EDIT');
            playBeep('tab');
            bumpAchvCounter('decoEdit', 1, true);
            announceAchvUnlocks();
          }
          renderContent();
          return;
        }

        if (action === 'gacha') {
          const result = rollDecoGacha();
          if (!result.ok) {
            playBeep('error');
            setFooter(result.reason === 'ticket' ? '티켓 부족' : '전부 보유 중');
            renderContent();
          } else {
            setFooter(`획득: ${result.item.name}`);
            playDecoGachaAnimation(result.item, result.count);
            {
              const saved = getDecoState();
              const srItems = DECO_ITEMS.filter(it => it.type === 'prop' && it.rank === 'SR');
              if (srItems.length > 0 && srItems.every(it => getDecoOwnedCount(saved, it) > 0)) {
                bumpAchvCounter('srDecoAll', 1, true);
                announceAchvUnlocks();
              }
            }
          }
          return;
        }

        if (action === 'custom-new') {
          decoEditTab = 'custom';
          openCustomDecoEditor('');
          playBeep('tab');
          return;
        }

        if (action === 'custom-import') {
          decoEditTab = 'custom';
          openCustomDecoImportModal();
          playBeep('tab');
          return;
        }

        if (action === 'clear-current') {
          clearCurrentDecoTab();
          playBeep('tab');
          renderContent();
          return;
        }
      }

      const decoTab = event.target.closest('[data-deco-tab]');
      if (decoTab) {
        event.preventDefault();
        event.stopPropagation();
        decoEditTab = decoTab.dataset.decoTab || 'wallpaper';
        renderContent();
        playBeep('tab');
        return;
      }

      const customDecoEdit = event.target.closest('[data-custom-deco-edit]');
      if (customDecoEdit) {
        event.preventDefault();
        event.stopPropagation();
        openCustomDecoEditor(customDecoEdit.dataset.customDecoEdit || '');
        playBeep('tab');
        return;
      }

      const decoItem = event.target.closest('[data-deco-item]');
      if (decoItem) {
        event.preventDefault();
        event.stopPropagation();
        const shelf = decoItem.closest('.cigh-clean-deco-shelf');
        const keepScroll = shelf ? shelf.scrollLeft : 0;
        if (toggleDecoItem(decoItem.dataset.decoItem || '')) {
          renderContent();
          requestAnimationFrame(() => {
            const nextShelf = panel.querySelector('#cigh-clean-main .cigh-clean-deco-shelf');
            if (nextShelf) nextShelf.scrollLeft = keepScroll;
          });
          playBeep('tab');
        } else {
          playBeep('error');
          setFooter('더 배치할 보유 수가 없음');
        }
        return;
      }

      const achvCard = event.target.closest('.cigh-clean-achv-card');
      if (achvCard) {
        const id = achvCard.dataset.achvId || '';
        const state = readAchvState();
        if (!id || !state.unlocked[id]) {
          playBeep('error');
          return;
        }
        toggleEquippedAchv(id);
        playBeep('save');
        renderContent();
        return;
      }

      if (event.target.closest('.cigh-clean-pet-sprite')) petPet();
    });

    panel.querySelector('#cigh-clean-main').addEventListener('keydown', event => {
      const input = event.target?.closest?.('[data-user-name-input="1"]');
      if (!input || event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      commitRoomUserNameInput(input);
    });

    panel.querySelector('#cigh-clean-main').addEventListener('focusout', event => {
      const input = event.target?.closest?.('[data-user-name-input="1"]');
      if (!input) return;
      commitRoomUserNameInput(input, { silent: true });
    });

    panel.querySelector('#cigh-clean-main').addEventListener('pointerdown', event => {
      const prop = event.target?.closest?.('.cigh-clean-room-prop.editable');
      if (prop) startDecoPropDrag(event, prop);
    });

    panel.querySelector('#cigh-clean-main').addEventListener('pointermove', event => {
      moveDecoPropDrag(event);
    });

    panel.querySelector('#cigh-clean-main').addEventListener('pointerup', event => {
      endDecoPropDrag(event);
    });

    panel.querySelector('#cigh-clean-main').addEventListener('pointercancel', event => {
      endDecoPropDrag(event);
    });

    setupDrag(panel);
    setupPanelResize(panel);
    restorePanelHeight(panel);
    restorePos(panel);
    panel.style.display = 'none';
    document.body.appendChild(panel);
    applyThemeMode();
    requestAnimationFrame(() => clampPanelToViewport(false));

    return panel;
  }

  function restoreFabPos(fab) {
    try {
      const pos = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null');
      if (!pos) return;

      clampFixedElementToViewport(fab, {
        left: Number(pos.left || 6),
        top: Number(pos.top || 6),
        margin: 6,
        fallbackWidth: 44,
        fallbackHeight: 44,
      });
    } catch {}
  }

  function saveFabPos(fab) {
    const rect = fab.getBoundingClientRect();
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
  }

  function buildUI() {
    [
      'cigh-panel', 'cigh-fab', 'cigh-popup', 'cigh-settings',
      'cigh5-panel', 'cigh5-fab', 'cigh5-popup', 'cigh5-settings',
      'cigh6-panel', 'cigh6-fab', 'cigh6-popup', 'cigh6-settings',
      PANEL_ID, FAB_ID, POPUP_ID, COMMENT_POPUP_ID, DOCK_FAB_ID, TICKER_ID, SETTINGS_ID,
    ].forEach(id => document.getElementById(id)?.remove());

    injectStyle();

    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.type = 'button';
    fab.title = `INFO Game HUD v${VERSION}`;
    fab.textContent = '◆';

    let pressTimer = null;
    let longPressed = false;
    let dragged = false;

    const clearPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    };

    fab.addEventListener('pointerdown', event => {
      event.stopPropagation();
      longPressed = false;
      dragged = false;
      clearPress();

      const rect = fab.getBoundingClientRect();
      fabDragState = {
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        left: rect.left,
        top: rect.top,
      };

      try { fab.setPointerCapture(event.pointerId); } catch {}

      pressTimer = setTimeout(() => {
        if (dragged) return;
        longPressed = true;
        pushLog(['▶최신 로그를 다시 읽는다!']);
        showPopup(['▶최신 로그를 다시 읽는다!']);
        analyzeLatest(true);
      }, 520);
    });

    fab.addEventListener('pointermove', event => {
      if (!fabDragState || fabDragState.id !== event.pointerId) return;

      const dx = event.clientX - fabDragState.sx;
      const dy = event.clientY - fabDragState.sy;

      if (Math.abs(dx) + Math.abs(dy) > 6) {
        dragged = true;
        clearPress();
      }

      if (!dragged) return;

      const next = clampFixedPosition(fabDragState.left + dx, fabDragState.top + dy, fab.offsetWidth || 44, fab.offsetHeight || 44, { margin: 6 });
      const left = next.left;
      const top = next.top;

      fab.style.left = `${left}px`;
      fab.style.top = `${top}px`;
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      updateFloatingPopupPositions();
      event.preventDefault();
    });

    fab.addEventListener('pointerup', event => {
      event.stopPropagation();
      clearPress();

      const wasDragged = dragged;
      const wasLongPressed = longPressed;

      if (fabDragState?.id === event.pointerId) {
        try { fab.releasePointerCapture(event.pointerId); } catch {}
      }

      fabDragState = null;

      if (wasDragged) {
        saveFabPos(fab);
        updateFloatingPopupPositions();
        return;
      }

      if (wasLongPressed) return;

      const panel = ensurePanel();
      const nextOpen = !panel.classList.contains('open') || panel.style.display === 'none';
      setPanelOpen(panel, nextOpen);
    });

    fab.addEventListener('pointercancel', () => {
      clearPress();
      fabDragState = null;
      dragged = false;
    });

    fab.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });

    restoreFabPos(fab);
    document.body.appendChild(fab);
    syncHudUiForRoute();
    requestAnimationFrame(() => {
      clampFabToViewport(false);
      positionDockUi();
      syncHudUiForRoute();
    });
    ensurePanel();
    applyThemeMode();
  }

  // ─────────────────────────────────────────────
  // Settings
  // ─────────────────────────────────────────────
  function buildModelOptions() {
    return GEMINI_MODEL_OPTIONS.map(model => {
      return `<option value="${esc(model)}" ${getGeminiModel() === model ? 'selected' : ''}>${esc(model)}</option>`;
    }).join('');
  }

  function buildDeepSeekModelOptions() {
    const current = getDeepSeekOfficialModel();
    return DEEPSEEK_MODEL_OPTIONS.map(item => {
      return `<option value="${esc(item.id)}" ${current === item.id ? 'selected' : ''}>${esc(item.label)}</option>`;
    }).join('');
  }

  function buildGeminiThinkingOptions(model = getGeminiModel()) {
    if (rbUsesThinkingLevels(model)) {
      const current = getGeminiThinkingLevel();
      return [
        ['low', '낮음'],
        ['medium', '보통'],
        ['high', '높음'],
      ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
    }

    const budget = getThinkingBudget();
    return [
      [0, '끔'],
      [512, '낮음'],
      [1024, '보통'],
      [2048, '높음'],
      [-1, '자동'],
    ].map(([value, label]) => `<option value="${value}" ${budget === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  function buildSettingsPanelHtml(provider = getGeminiProvider()) {
    return `
      ${settingsSection('api', '◆ API', `
        <div class="cigh-clean-settings-grid">
          <label>
            <span>Provider</span>
            <select id="cigh-clean-provider-input">
              <option value="ai-studio" ${provider === 'ai-studio' ? 'selected' : ''}>Google AI Studio API Key</option>
              <option value="firebase" ${provider === 'firebase' ? 'selected' : ''}>Firebase AI Logic Beta</option>
              <option value="deepseek" ${provider === 'deepseek' ? 'selected' : ''}>DeepSeek API</option>
            </select>
          </label>
        </div>

        <div data-cigh-api-group="ai-studio">
          <div class="cigh-clean-settings-grid">
            <label>
              <span>Gemini API Key</span>
              <input id="cigh-clean-api-input" type="password" autocomplete="off" spellcheck="false" placeholder="${hasGeminiKey() ? '•••••••• 저장됨 · 새 키 입력 시 교체' : 'AIzaSy...'}">
            </label>
          </div>
          <div class="cigh-clean-settings-row" data-cigh-provider-action="ai-studio">
            <button type="button" class="cigh-clean-set-btn" data-action="toggle">입력 보기</button>
            <button type="button" class="cigh-clean-set-btn red" data-action="clear">키 삭제</button>
          </div>
          <div class="cigh-clean-settings-help">Google AI Studio의 Gemini API Key로 분석합니다. 저장된 키는 설정창 DOM에 다시 노출하지 않으며, 입력칸을 비워두면 기존 키를 유지합니다.</div>
        </div>

        <div data-cigh-api-group="deepseek">
          <div class="cigh-clean-settings-mini-title">DeepSeek API</div>
          <div class="cigh-clean-settings-grid">
            <label>
              <span>DeepSeek API Key</span>
              <input id="cigh-clean-deepseek-api-input" type="password" autocomplete="off" spellcheck="false" placeholder="${hasDeepSeekKey() ? '•••••••• 저장됨 · 새 키 입력 시 교체' : 'sk-...'}">
            </label>
            <label>
              <span>Base URL</span>
              <input id="cigh-clean-deepseek-base-url-input" autocomplete="off" spellcheck="false" value="${esc(getDeepSeekBaseUrl())}" placeholder="https://api.deepseek.com">
            </label>
          </div>
          <div class="cigh-clean-settings-row" data-cigh-provider-action="deepseek">
            <button type="button" class="cigh-clean-set-btn" data-action="deepseek-toggle">입력 보기</button>
            <button type="button" class="cigh-clean-set-btn red" data-action="deepseek-clear">키 삭제</button>
          </div>
          <div class="cigh-clean-settings-help">공식 DeepSeek는 https://api.deepseek.com 을 사용합니다. Base URL 변경은 OpenAI 호환 서드파티/로컬 endpoint용이며, 외부 주소는 HTTPS만 허용합니다. 입력칸을 비워두면 저장된 API Key를 유지합니다.</div>
          <div class="cigh-clean-settings-help" id="cigh-clean-deepseek-endpoint-warning" hidden></div>
        </div>

        <div data-cigh-api-group="firebase">
          <div class="cigh-clean-settings-mini-title">Firebase AI Logic</div>
          <textarea id="cigh-clean-firebase-input" spellcheck="false" placeholder='const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };'>${esc(getFirebaseConfigRaw())}</textarea>
          <div class="cigh-clean-settings-grid">
            <label>
              <span>Location</span>
              <input id="cigh-clean-firebase-location-input" value="${esc(getFirebaseLocation())}" placeholder="global">
            </label>
            <label>
              <span>SDK</span>
              <input id="cigh-clean-firebase-sdk-input" value="${esc(getFirebaseSdkVersion())}" placeholder="12.18.0">
            </label>
          </div>
          <div class="cigh-clean-settings-row" data-cigh-provider-action="firebase">
            <button type="button" class="cigh-clean-set-btn red" data-action="firebase-clear">Config 삭제</button>
          </div>
          <div class="cigh-clean-settings-help">Firebase Config + Location + Firebase SDK로 AI Logic을 호출합니다. Location은 특별한 이유가 없으면 global 권장.</div>
        </div>
      `, { subtitle: true })}

      ${settingsSection('model', '◆ MODEL', `
        <div data-cigh-model-group="gemini">
          <div class="cigh-clean-settings-mini-title">Gemini</div>
          <div class="cigh-clean-settings-grid">
            <label>
              <span>Gemini 모델</span>
              <select id="cigh-clean-model-input">${buildModelOptions()}</select>
            </label>
            <label>
              <span>Gemini 추론</span>
              <select id="cigh-clean-thinking-input">${buildGeminiThinkingOptions()}</select>
            </label>
          </div>
        </div>
        <div data-cigh-model-group="deepseek">
          <div class="cigh-clean-settings-mini-title">DeepSeek</div>
          <div class="cigh-clean-settings-grid">
            <label>
              <span>DeepSeek 모델</span>
              <select id="cigh-clean-deepseek-model-input">${buildDeepSeekModelOptions()}</select>
            </label>
            <label>
              <span>DeepSeek 추론</span>
              <select id="cigh-clean-deepseek-thinking-input">
                <option value="1" ${isDeepSeekThinkingEnabled() ? 'selected' : ''}>On</option>
                <option value="0" ${!isDeepSeekThinkingEnabled() ? 'selected' : ''}>Off</option>
              </select>
            </label>
          </div>
          <div data-cigh-deepseek-custom-model-group>
            <label class="cigh-clean-settings-wide-label">
              <span>커스텀 모델 ID (서드파티 endpoint 전용)</span>
              <input id="cigh-clean-deepseek-third-party-model-input" autocomplete="off" spellcheck="false" value="${esc(getDeepSeekThirdPartyModel())}" placeholder="예: deepseek/deepseek-v4-pro">
            </label>
            <div class="cigh-clean-settings-help">Base URL이 api.deepseek.com이 아닐 때만 필요합니다.</div>
          </div>
        </div>
        <div class="cigh-clean-settings-help">현재 Provider에서 실제 분석에 사용할 모델과 추론량을 설정합니다. Gemini 3.7·3.8 Flash는 낮음 / 보통(기본) / 높음을 지원하며 끔은 지원하지 않습니다. 추론량이 높을수록 응답 시간·사용량이 늘 수 있습니다.</div>
      `, { subtitle: true })}

      ${settingsSection('ui', '◆ UI', `
        <div class="cigh-clean-settings-grid">
          <label>
            <span>UI 크기</span>
            <select id="cigh-clean-font-size-input">
              <option value="small" ${getUiFontSize() === 'small' ? 'selected' : ''}>작게</option>
              <option value="medium" ${getUiFontSize() === 'medium' ? 'selected' : ''}>보통</option>
              <option value="large" ${getUiFontSize() === 'large' ? 'selected' : ''}>크게</option>
            </select>
          </label>
          <label>
            <span>펫 이름</span>
            <input id="cigh-clean-pet-name-input" maxlength="12" autocomplete="off" spellcheck="false" value="${esc(getPetName())}" placeholder="마스코트 이름">
          </label>
        </div>
        <div class="cigh-clean-settings-help">HUD 글자 크기와 마스코트 표시 이름을 바꿉니다. 게임 데이터나 펫 성장 상태에는 영향을 주지 않습니다.</div>
      `, { subtitle: true })}

      ${settingsSection('log-style', '◆ LOG STYLE', `
        <div class="cigh-clean-settings-grid" style="grid-template-columns: minmax(0, 1fr) auto auto; margin-bottom: 6px; gap: 4px;">
          <select id="cigh-clean-style-preset-select" style="width: 100%; box-sizing: border-box; border: 1px solid var(--cigh-border); border-radius: 4px; background: var(--cigh-bg); color: var(--cigh-text); height: 24px; font-size: 10px; outline: none; cursor: pointer;"></select>
          <button type="button" class="cigh-clean-set-btn" data-action="save-custom-style" style="margin-top: 0; height: 24px; padding: 0 8px;">추가</button>
          <button type="button" class="cigh-clean-set-btn red" data-action="delete-custom-style" style="margin-top: 0; height: 24px; padding: 0 8px;">삭제</button>
        </div>
        <textarea id="cigh-clean-style-input" spellcheck="false" placeholder="원하는 LOG STYLE 문체 지침">${esc(getStylePrompt())}</textarea>
        <div class="cigh-clean-settings-row">
          <button type="button" class="cigh-clean-set-btn" data-action="style-reset">기본값 복원</button>
        </div>
        <div class="cigh-clean-settings-help">LOG 탭의 사건 요약 문체에 적용됩니다. INFO 정규화, HUD 코멘트, 펫 성격 프롬프트에는 적용되지 않습니다.</div>
      `, { subtitle: true })}

      ${settingsSection('fx', '◆ FX', `
        <label class="cigh-clean-checkrow">
          <input id="cigh-clean-sfx-input" type="checkbox" ${isSfxEnabled() ? 'checked' : ''}>
          <span>효과음</span>
        </label>
        <label class="cigh-clean-checkrow">
          <input id="cigh-clean-header-dock-input" type="checkbox" ${isDockModeEnabled() ? 'checked' : ''}>
          <span>상단 도킹 모드(◆+로그 티커)</span>
        </label>
        <label class="cigh-clean-checkrow">
          <input id="cigh-clean-comment-popup-input" type="checkbox" ${isCommentPopupEnabled() ? 'checked' : ''}>
          <span>코멘트 팝업</span>
        </label>
        <label class="cigh-clean-checkrow">
          <input id="cigh-clean-mascot-input" type="checkbox" ${isMascotEnabled() ? 'checked' : ''}>
          <span>마스코트 화면에 띄우기</span>
        </label>
        <label class="cigh-clean-checkrow">
          <input id="cigh-clean-auto-analyze-input" type="checkbox" ${isAutoAnalyzeEnabled() ? 'checked' : ''}>
          <span>새 답변 자동 읽기</span>
        </label>
        <div class="cigh-clean-settings-row">
          <button type="button" class="cigh-clean-set-btn" data-action="preview">읽기 대상 확인</button>
        </div>
        <div class="cigh-clean-settings-help">자동 읽기는 새 답변 텍스트가 잠깐 안정된 뒤 최신 로그를 분석합니다. 도킹·팝업·마스코트 표시 같은 연출 옵션도 여기서 조절합니다.</div>
      `, { subtitle: true })}

      ${settingsSection('cloud', '◆ CLOUD SAVE', `
        ${buildCloudSettingsHtml()}
        <div class="cigh-clean-settings-help">현재 HUD 게임 데이터를 암호화해 저장하고, 같은 인계 코드와 비밀번호로 다른 기기에서 이어받습니다.</div>
      `, { subtitle: true })}

      ${settingsSection('usage', '◆ USAGE', `
        ${buildUsageSettingsHtml()}
        <div class="cigh-clean-settings-help">이 브라우저에서 기록한 API 토큰 사용량과 추정 비용을 확인합니다. Provider·모델별 기록을 합산합니다.</div>
      `, { subtitle: true })}

      <div class="cigh-clean-settings-row" style="margin-top: 10px;">
        <button type="button" class="cigh-clean-set-btn gold" data-action="save">설정 저장</button>
      </div>
    `;
  }

  function bindSettingsPanel(box) {
    const styleSelect = box.querySelector('#cigh-clean-style-preset-select');
    const styleInput = box.querySelector('#cigh-clean-style-input');

    const refreshStyleSelect = () => {
      if (!styleSelect || !styleInput) return;
      const currentVal = styleInput.value.trim();
      const customs = getCustomStyles();
      let html = '';
      let matched = false;

      DEFAULT_STYLE_PRESETS.forEach((preset, index) => {
        const isMatch = String(preset.prompt || '').trim() === currentVal;
        if (isMatch) matched = true;
        html += `<option value="preset_${index}" ${isMatch ? 'selected' : ''}>[기본] ${esc(preset.name)}</option>`;
      });

      Object.keys(customs).sort((a, b) => a.localeCompare(b, 'ko')).forEach(name => {
        const prompt = String(customs[name] || '');
        const isMatch = prompt.trim() === currentVal;
        if (isMatch) matched = true;
        html += `<option value="custom_${esc(encodeURIComponent(name))}" ${isMatch ? 'selected' : ''}>[커스텀] ${esc(name)}</option>`;
      });

      if (!matched && currentVal) html += '<option value="manual" selected>[직접 입력 중...]</option>';
      else if (!matched) html += '<option value="manual" selected>선택</option>';
      styleSelect.innerHTML = html;
    };

    if (styleSelect && styleInput) {
      refreshStyleSelect();
      styleSelect.addEventListener('change', event => {
        const value = String(event.target?.value || '');
        if (value.startsWith('preset_')) {
          const index = parseInt(value.replace('preset_', ''), 10);
          if (DEFAULT_STYLE_PRESETS[index]) styleInput.value = DEFAULT_STYLE_PRESETS[index].prompt;
        } else if (value.startsWith('custom_')) {
          const name = decodeURIComponent(value.replace('custom_', ''));
          const customs = getCustomStyles();
          if (customs[name]) styleInput.value = customs[name];
        }
        refreshStyleSelect();
      });
      styleInput.addEventListener('input', refreshStyleSelect);
    }

    const providerInput = box.querySelector('#cigh-clean-provider-input');
    const apiInput = box.querySelector('#cigh-clean-api-input');
    const deepSeekApiInput = box.querySelector('#cigh-clean-deepseek-api-input');
    const deepSeekBaseUrlInput = box.querySelector('#cigh-clean-deepseek-base-url-input');
    const deepSeekModelInput = box.querySelector('#cigh-clean-deepseek-model-input');
    const deepSeekThirdPartyModelInput = box.querySelector('#cigh-clean-deepseek-third-party-model-input');
    const deepSeekThinkingInput = box.querySelector('#cigh-clean-deepseek-thinking-input');
    const deepSeekEndpointWarning = box.querySelector('#cigh-clean-deepseek-endpoint-warning');
    const firebaseInput = box.querySelector('#cigh-clean-firebase-input');
    const firebaseLocationInput = box.querySelector('#cigh-clean-firebase-location-input');
    const firebaseSdkInput = box.querySelector('#cigh-clean-firebase-sdk-input');
    const modelInput = box.querySelector('#cigh-clean-model-input');
    const thinkingInput = box.querySelector('#cigh-clean-thinking-input');
    const fontSizeInput = box.querySelector('#cigh-clean-font-size-input');
    const petNameInput = box.querySelector('#cigh-clean-pet-name-input');
    const commentInput = box.querySelector('#cigh-clean-comment-popup-input');
    const sfxInput = box.querySelector('#cigh-clean-sfx-input');
    const headerDockInput = box.querySelector('#cigh-clean-header-dock-input');
    const mascotInput = box.querySelector('#cigh-clean-mascot-input');
    const autoAnalyzeInput = box.querySelector('#cigh-clean-auto-analyze-input');

    const cighSyncProviderFields = () => {
      const selectedProvider = providerInput?.value || 'ai-studio';
      box.querySelectorAll('[data-cigh-api-group]').forEach(el => {
        el.style.display = el.dataset.cighApiGroup === selectedProvider ? '' : 'none';
      });
      box.querySelectorAll('[data-cigh-provider-action]').forEach(el => {
        el.style.display = el.dataset.cighProviderAction === selectedProvider ? '' : 'none';
      });
      const modelGroup = selectedProvider === 'deepseek' ? 'deepseek' : 'gemini';
      box.querySelectorAll('[data-cigh-model-group]').forEach(el => {
        el.style.display = el.dataset.cighModelGroup === modelGroup ? '' : 'none';
      });

      const deepSeekBaseUrl = deepSeekBaseUrlInput?.value || getDeepSeekBaseUrl();
      const showDeepSeekCustom = selectedProvider === 'deepseek' && !isDirectDeepSeekBaseUrl(deepSeekBaseUrl);
      box.querySelectorAll('[data-cigh-deepseek-custom-model-group]').forEach(el => {
        el.style.display = showDeepSeekCustom ? '' : 'none';
      });

      if (deepSeekEndpointWarning) {
        deepSeekEndpointWarning.hidden = true;
        deepSeekEndpointWarning.textContent = '';
        if (showDeepSeekCustom) {
          try {
            const checkedUrl = validateDeepSeekBaseUrl(deepSeekBaseUrl);
            const parsed = new URL(checkedUrl);
            const local = isDeepSeekLoopbackHost(parsed.hostname);
            deepSeekEndpointWarning.textContent = local
              ? `로컬 endpoint 사용 중 · API 요청이 ${parsed.host} 로 전송됩니다.`
              : `서드파티 endpoint 사용 중 · API Key와 분석 요청이 ${parsed.host} 로 전송됩니다.`;
            deepSeekEndpointWarning.hidden = false;
          } catch (err) {
            deepSeekEndpointWarning.textContent = err?.message || String(err);
            deepSeekEndpointWarning.hidden = false;
          }
        }
      }
    };
    providerInput?.addEventListener('change', cighSyncProviderFields);
    deepSeekBaseUrlInput?.addEventListener('input', cighSyncProviderFields);
    deepSeekBaseUrlInput?.addEventListener('change', cighSyncProviderFields);
    modelInput?.addEventListener('change', () => {
      if (thinkingInput) thinkingInput.innerHTML = buildGeminiThinkingOptions(modelInput.value);
    });
    cighSyncProviderFields();
    providerInput?.focus();

    const toggleFoldSection = title => {
      const section = title?.dataset?.foldSection || '';
      const body = section ? box.querySelector(`[data-fold-body="${CSS.escape(section)}"]`) : null;
      if (!body) return;

      const collapsed = !body.classList.contains('collapsed');
      body.classList.toggle('collapsed', collapsed);
      title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const arrow = title.querySelector('.cigh-clean-fold-arrow');
      if (arrow) arrow.textContent = collapsed ? '▸' : '▾';
      setSettingsFoldState(section, collapsed);
    };

    const saveSettings = () => {
      const selectedProvider = providerInput?.value || 'ai-studio';

      if (selectedProvider === 'firebase') {
        try {
          setFirebaseConfig(firebaseInput?.value || '');
          setFirebaseLocation(firebaseLocationInput?.value || DEFAULT_FIREBASE_LOCATION);
          setFirebaseSdkVersion(firebaseSdkInput?.value || DEFAULT_FIREBASE_SDK_VERSION);
        } catch (err) {
          alert(`Firebase config 형식이 올바르지 않습니다.\n${err?.message || err}`);
          return;
        }
      }

      if (selectedProvider === 'deepseek') {
        try {
          const deepSeekKeyCandidate = String(deepSeekApiInput?.value || '').trim();
          const nextBaseUrl = validateDeepSeekBaseUrl(deepSeekBaseUrlInput?.value || DEEPSEEK_DIRECT_BASE_URL);
          const thirdPartyModelCandidate = String(deepSeekThirdPartyModelInput?.value || '').trim();
          const isThirdPartyDeepSeek = !isDirectDeepSeekBaseUrl(nextBaseUrl);

          if (isThirdPartyDeepSeek && !thirdPartyModelCandidate) {
            alert('DeepSeek Base URL이 공식(api.deepseek.com)이 아니면 커스텀 모델 ID가 필요해요.');
            return;
          }

          // 검증이 끝난 뒤에만 저장해, 잘못된 입력에서 일부 설정만 바뀌는 상태를 막는다.
          if (deepSeekKeyCandidate) setDeepSeekKey(deepSeekKeyCandidate);
          setDeepSeekBaseUrl(nextBaseUrl);
          setDeepSeekOfficialModel(deepSeekModelInput?.value || DEFAULT_DEEPSEEK_MODEL);
          setDeepSeekThirdPartyModel(isThirdPartyDeepSeek ? thirdPartyModelCandidate : '');
          setDeepSeekThinking((deepSeekThinkingInput?.value || '1') !== '0');
        } catch (err) {
          alert(`DeepSeek 설정 저장 실패\n${err?.message || err}`);
          return;
        }
      }

      setGeminiProvider(selectedProvider);
      if (selectedProvider === 'ai-studio') {
        const geminiKeyCandidate = String(apiInput?.value || '').trim();
        if (geminiKeyCandidate) setGeminiKey(geminiKeyCandidate);
      }
      if (selectedProvider !== 'deepseek') {
        const selectedGeminiModel = normalizeGeminiModelId(modelInput?.value || DEFAULT_GEMINI_MODEL);
        setGeminiModel(selectedGeminiModel);
        if (rbUsesThinkingLevels(selectedGeminiModel)) {
          setGeminiThinkingLevel(thinkingInput?.value || DEFAULT_GEMINI_THINKING_LEVEL);
        } else {
          setThinkingBudget(thinkingInput?.value || DEFAULT_THINKING_BUDGET);
        }
      }
      setUiFontSize(fontSizeInput?.value || 'small');
      setPetName(petNameInput?.value || '');
      applyThemeMode();
      setStylePrompt(styleInput?.value || DEFAULT_STYLE_PROMPT);
      setCommentPopupEnabled(!!commentInput?.checked);
      setSfxEnabled(!!sfxInput?.checked);
      setDockModeEnabled(!!headerDockInput?.checked);
      syncDockUiForRoute();
      setMascotEnabled(!!mascotInput?.checked);
      syncMascotForRoute();
      setAutoAnalyzeEnabled(!!autoAnalyzeInput?.checked);

      setFooter('SETTING SAVED');

      const savedProvider = getGeminiProvider();

      const providerLine = savedProvider === 'firebase'
        ? `▷Firebase AI Logic: ${hasFirebaseConfig() ? 'ON' : 'Config 없음'} (${getFirebaseLocation()}, SDK ${getFirebaseSdkVersion()})`
        : savedProvider === 'deepseek'
          ? `▷DeepSeek: ${hasDeepSeekKey() ? 'ON' : '키 없음'} (${getDeepSeekModel()}, thinking ${getDeepSeekThinkingLabel()})`
          : `▷AI Studio API Key: ${hasGeminiKey() ? 'ON' : '없음'}`;

      pushLog([
        '▶설정을 저장했다!',
        providerLine,
        isAutoAnalyzeEnabled() ? '▷새 답변 자동 읽기 ON!' : '▷새 답변 자동 읽기 OFF!',
        isDockModeEnabled() ? '▷상단 도킹 모드 ON!' : '▷상단 도킹 모드 OFF!',
        `▷UI 폰트: ${getUiFontSizeLabel()}`,
      ]);

      playBeep('save');
      if (box.rbCloseSaved) box.rbCloseSaved(); else box.remove();
    };


    box.addEventListener('click', event => {
      const foldTitle = event.target.closest('.cigh-clean-settings-title[data-fold-section]');
      if (foldTitle && box.contains(foldTitle)) {
        event.preventDefault();
        event.stopPropagation();
        toggleFoldSection(foldTitle);
        return;
      }

      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      event.stopPropagation();

      const action = btn.dataset.action;

      if (action === 'save') {
        saveSettings();
      } else if (action === 'save-custom-style') {
        const value = String(styleInput?.value || '').trim();
        if (!value) {
          alert('스타일 내용을 먼저 입력해주세요.');
          return;
        }
        const name = prompt('저장할 커스텀 스타일의 이름을 입력하세요:');
        const cleanName = String(name || '').trim().slice(0, 40);
        if (!cleanName) return;
        const customs = getCustomStyles();
        customs[cleanName] = value;
        saveCustomStyles(customs);
        syncCustomStyleAchievements(customs);
        announceAchvUnlocks();
        refreshStyleSelect();
        setFooter('LOG STYLE ADDED');
        pushLog([`▷커스텀 LOG STYLE '${cleanName}' 저장!`]);
        playBeep('save');
      } else if (action === 'delete-custom-style') {
        const value = String(styleSelect?.value || '');
        if (!value.startsWith('custom_')) {
          alert('삭제할 커스텀 스타일을 드롭다운에서 먼저 선택해주세요.');
          return;
        }
        const name = decodeURIComponent(value.replace('custom_', ''));
        if (!confirm(`커스텀 스타일 '${name}' 을(를) 삭제할까요?`)) return;
        const customs = getCustomStyles();
        delete customs[name];
        saveCustomStyles(customs);
        refreshStyleSelect();
        setFooter('LOG STYLE DELETED');
        pushLog([`▷커스텀 LOG STYLE '${name}' 삭제!`]);
        playBeep('save');
      } else if (action === 'clear') {
        if (!confirm('저장된 Gemini API 키를 삭제할까요?')) return;
        setGeminiKey('');
        apiInput.value = '';
        apiInput.placeholder = 'AIzaSy...';
        setFooter('API CLEARED');
        pushLog(['▷Gemini API 키를 삭제했다!']);
      } else if (action === 'deepseek-clear') {
        if (!confirm('저장된 DeepSeek API 키를 삭제할까요?')) return;
        try {
          clearDeepSeekKey();
          if (deepSeekApiInput) {
            deepSeekApiInput.value = '';
            deepSeekApiInput.placeholder = 'sk-...';
          }
          setFooter('DEEPSEEK KEY CLEARED');
          pushLog(['▷DeepSeek API 키를 삭제했다!']);
        } catch (err) {
          alert(err?.message || String(err));
        }
      } else if (action === 'firebase-clear') {
        if (!confirm('저장된 Firebase Config를 삭제할까요?')) return;
        setFirebaseConfig('');
        if (firebaseInput) firebaseInput.value = '';
        setFooter('FIREBASE CLEARED');
        pushLog(['▷Firebase Config를 삭제했다!']);
      } else if (action === 'toggle') {
        apiInput.type = apiInput.type === 'password' ? 'text' : 'password';
        rbKeyVisibilityIcon(btn, apiInput);
      } else if (action === 'deepseek-toggle') {
        if (!deepSeekApiInput) return;
        deepSeekApiInput.type = deepSeekApiInput.type === 'password' ? 'text' : 'password';
        rbKeyVisibilityIcon(btn, deepSeekApiInput);
      } else if (action === 'style-reset') {
        resetStylePrompt();
        styleInput.value = DEFAULT_STYLE_PROMPT;
        refreshStyleSelect();
        pushLog(['▷문체 지침이 기본값으로 돌아갔다!']);
      } else if (action === 'usage-reset') {
        if (!confirm('누적 토큰 사용량을 초기화할까요?')) return;
        resetUsage();
        refreshUsageSettingsSection(box);
        setFooter('USAGE RESET');
      } else if (String(action || '').startsWith('cloud-')) {
        handleCloudSettingsAction(action, box).catch(err => {
          console.error('[Crack INFO Game HUD] cloud transfer failed:', err);
          setCloudUiBusy(box, false);
          updateCloudSettingsStatus(box, '오류');
          setFooter('CLOUD ERROR');
          playBeep('error');
          alert(err?.message || String(err));
        });
      } else if (action === 'preview') {
        const found = findLatestContext();
        if (!found) {
          alert('분석 대상 채팅을 찾지 못했습니다.');
          return;
        }

        const parsedInfo = parseInfoDeterministic(found.infoText);
        const preview = [
          '[Provider]',
          JSON.stringify({
            provider: getGeminiProvider(),
            selectedModel: getSelectedProviderModel(),
            geminiModel: getGeminiModel(),
            deepSeekModel: getDeepSeekModel(),
            deepSeekThinking: getDeepSeekThinkingLabel(),
            deepSeekBaseUrl: getDeepSeekBaseUrl(),
            deepSeekEndpointType: getDeepSeekPricingSource(),
            hasGeminiKey: hasGeminiKey(),
            hasDeepSeekKey: hasDeepSeekKey(),
            hasFirebaseConfig: hasFirebaseConfig(),
            firebaseLocation: getFirebaseLocation(),
            firebaseSdkVersion: getFirebaseSdkVersion(),
            autoAnalyze: isAutoAnalyzeEnabled(),
          }, null, 2),
          '',
          '[최신 답변]',
          found.latestReply || '(없음)',
          '',
          '[RAW INFO BLOCK]',
          found.infoText || '(없음)',
          '',
          '[로컬 보조 파싱 결과]',
          JSON.stringify({
            character: parsedInfo.character,
            location: parsedInfo.location,
            situation: parsedInfo.situation,
            goal: parsedInfo.goal,
            relations: parsedInfo.relations,
            inventory: parsedInfo.inventory,
          }, null, 2),
          '',
          '[직전 맥락]',
          found.context || '(없음)',
        ].join('\n');

        console.log('[Crack INFO Game HUD] 분석 대상 미리보기\n', preview);
        alert(preview.slice(0, 1800));
      }
    });

    box.addEventListener('keydown', event => {
      const foldTitle = event.target.closest?.('.cigh-clean-settings-title[data-fold-section]');
      if (foldTitle && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        toggleFoldSection(foldTitle);
      }
    });

    apiInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter') saveSettings();
      else if (event.key === 'Escape') box.remove();
    });
  }



  // ─────────────────────────────────────────────
  // Viewport safety clamp
  // ─────────────────────────────────────────────
  function viewportSize() {
    // 모바일 키보드가 올라오면 visualViewport가 줄어 FAB/마스코트가 위로 밀리고
    // 드래그 시 '보이지 않는 벽'이 생긴다. fixed 요소는 layout viewport 기준이므로
    // 키보드 영향이 없는 innerWidth/innerHeight만 사용한다.
    return {
      width: Math.max(1, Math.floor(innerWidth || document.documentElement.clientWidth || 320)),
      height: Math.max(1, Math.floor(innerHeight || document.documentElement.clientHeight || 480)),
    };
  }

  function clampFixedPosition(left, top, width, height, options = {}) {
    const vp = viewportSize();
    const margin = Number(options.margin ?? 6);
    const bottomMargin = Number(options.bottomMargin ?? margin);
    const desiredTopMargin = Number(options.topMargin ?? margin);

    const safeWidth = Math.max(1, Number(width) || Number(options.fallbackWidth) || 60);
    const safeHeight = Math.max(1, Number(height) || Number(options.fallbackHeight) || 60);

    const rawMaxLeft = Math.max(margin, vp.width - safeWidth - margin);
    const minLeft = Math.min(margin, rawMaxLeft);
    const maxLeft = Math.max(minLeft, rawMaxLeft);

    const rawMaxTop = Math.max(margin, vp.height - safeHeight - bottomMargin);
    const minTop = Math.min(desiredTopMargin, rawMaxTop);
    const maxTop = Math.max(minTop, rawMaxTop);

    return {
      left: Math.round(clamp(left, minLeft, maxLeft)),
      top: Math.round(clamp(top, minTop, maxTop)),
    };
  }

  function clampFixedElementToViewport(el, options = {}) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const fallbackWidth = Number(options.fallbackWidth || 60);
    const fallbackHeight = Number(options.fallbackHeight || 60);
    const width = Math.ceil(rect.width || el.offsetWidth || fallbackWidth);
    const height = Math.ceil(rect.height || el.offsetHeight || fallbackHeight);
    const left = Number.isFinite(options.left) ? Number(options.left) : (Number.isFinite(rect.left) ? rect.left : 0);
    const top = Number.isFinite(options.top) ? Number(options.top) : (Number.isFinite(rect.top) ? rect.top : 0);
    const next = clampFixedPosition(left, top, width, height, { ...options, fallbackWidth, fallbackHeight });

    el.style.left = `${next.left}px`;
    el.style.top = `${next.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    if (options.syncHome) {
      el.dataset.homeLeft = String(next.left);
      el.dataset.homeTop = String(next.top);
    }

    return next;
  }

  function clampMascotToViewport(save = false) {
    const el = document.getElementById(MASCOT_ID);
    if (!el) return;
    const next = clampFixedElementToViewport(el, {
      margin: 6,
      topMargin: 38,
      bottomMargin: 6,
      fallbackWidth: 64,
      fallbackHeight: 74,
      syncHome: true,
    });
    if (save && next) localStorage.setItem(MASCOT_POS_KEY, JSON.stringify(next));
  }

  function clampPanelToViewport(save = false) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.style.display === 'none') return;

    // UI 크기별 고정 폭과 모바일의 right: 6px 도킹 규칙이 충돌하지 않게
    // 패널 폭은 왼쪽 기준으로 배치한다.
    panel.style.setProperty('right', 'auto', 'important');

    // PC에서는 자유 이동 좌표를 쓰고, 폰에서는 기존 bottom: 70px 도킹을 유지한다.
    if (innerWidth > 520) {
      panel.style.setProperty('bottom', 'auto', 'important');
    } else {
      panel.style.removeProperty('bottom');
    }

    setPanelHeight(
      panel,
      panel.getBoundingClientRect().height ||
        Number(localStorage.getItem(PANEL_HEIGHT_KEY) || 374),
      false
    );

    const next = clampFixedElementToViewport(panel, {
      margin: 6,
      fallbackWidth: 252,
      fallbackHeight: Number(localStorage.getItem(PANEL_HEIGHT_KEY) || 374),
    });

    if (save && next) {
      localStorage.setItem(POS_KEY, JSON.stringify(next));
    }
  }

  function clampFabToViewport(save = false) {
    const fab = document.getElementById(FAB_ID);
    if (!fab) return;
    const next = clampFixedElementToViewport(fab, { margin: 6, fallbackWidth: 44, fallbackHeight: 44 });
    if (save && next) localStorage.setItem(FAB_POS_KEY, JSON.stringify(next));
  }

  let backgroundLoopsPaused = false;

  function pauseBackgroundLoops() {
    if (backgroundLoopsPaused) return;
    backgroundLoopsPaused = true;
    clearTimeout(petVisualTickTimer);
    petVisualTickTimer = null;
    clearTimeout(mascotWanderTimer);
    clearTimeout(mascotIdleTimer);
    clearInterval(routeWatchTimer);
    clearInterval(getGenerateDoneWindow().__cighGenerateDonePollTimer);
    clearTimeout(crackAttendanceTimer);
    crackAttendanceTimer = null;
  }

  function resumeBackgroundLoops() {
    if (!backgroundLoopsPaused) return;
    backgroundLoopsPaused = false;
    clearInterval(routeWatchTimer);
    routeWatchTimer = setInterval(onRoomChanged, 700);
    onRoomChanged();
    if (getGenerateDoneWindow().__cighGenerateDonePollOnlyStarted) startGenerateDonePoll();
    syncMascotForRoute();
    schedulePetVisualTick(900);
    scheduleCrackAttendanceCheck(900);
  }

  function clampHudToViewport(save = false) {
    clampPanelToViewport(save);
    clampFabToViewport(save);
    clampMascotToViewport(save);
    updateFloatingPopupPositions();
    positionDockUi();
  }

  let viewportClampTimer = null;
  function isTextInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
  }

  function scheduleViewportClamp(save = false) {
    clearTimeout(viewportClampTimer);
    viewportClampTimer = setTimeout(
      () => requestAnimationFrame(() => {
        clampHudToViewport(save && !isTextInputFocused());
        positionDockUi();
      }),
      60
    );
  }

  // ─────────────────────────────────────────────
  // Drag / route / theme
  // ─────────────────────────────────────────────
  function setupDrag(panel) {
    const head = panel.querySelector('#cigh-clean-head');
    if (!head) return;

    const move = event => {
      if (!dragState || dragState.id !== event.pointerId) return;

      const next = clampFixedPosition(
        dragState.left + event.clientX - dragState.sx,
        dragState.top + event.clientY - dragState.sy,
        panel.offsetWidth || 252,
        panel.offsetHeight || 374,
        { margin: 6 }
      );
      const left = next.left;
      const top = next.top;

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      event.preventDefault();
    };

    const end = event => {
      if (dragState?.id === event.pointerId) {
        try { head.releasePointerCapture(event.pointerId); } catch {}
        dragState = null;
        savePos(panel);
      }
    };

    head.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;

      const rect = panel.getBoundingClientRect();
      dragState = {
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        left: rect.left,
        top: rect.top,
      };

      try { head.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    });

    // 모바일에서는 pointer capture가 브라우저/스크롤 제스처에 빼앗기는 경우가 있어
    // head와 document 양쪽에서 이동/종료를 받아 끊김을 줄인다.
    head.addEventListener('pointermove', move);
    document.addEventListener('pointermove', move, { passive: false });

    head.addEventListener('pointerup', end);
    document.addEventListener('pointerup', end);

    head.addEventListener('pointercancel', event => {
      if (dragState?.id === event.pointerId) dragState = null;
    });
    document.addEventListener('pointercancel', event => {
      if (dragState?.id === event.pointerId) dragState = null;
    });
  }

  function panelHeightLimits(panel) {
    const rect = panel.getBoundingClientRect();
    const top = Number.isFinite(rect.top) && rect.top > 0 ? rect.top : 8;
    const baseMin = getUiFontSize() === 'large' ? 360 : getUiFontSize() === 'medium' ? 310 : 260;
    const rawMax = innerWidth <= 520 ? innerHeight - 96 : innerHeight - top - 8;
    const safeMax = Math.max(160, rawMax);
    const min = Math.min(baseMin, safeMax);
    return { min, max: Math.max(min, safeMax) };
  }

  function setPanelHeight(panel, height, save = false) {
    const limit = panelHeightLimits(panel);
    const next = Math.round(clamp(height, limit.min, limit.max));
    panel.style.setProperty('height', `${next}px`, 'important');
    if (save) localStorage.setItem(PANEL_HEIGHT_KEY, String(next));
  }

  function savePanelHeight(panel) {
    setPanelHeight(panel, panel.getBoundingClientRect().height, true);
  }

  function restorePanelHeight(panel) {
    const saved = Number(localStorage.getItem(PANEL_HEIGHT_KEY) || 0);
    if (saved > 0) setPanelHeight(panel, saved, false);
  }

  function setupPanelResize(panel) {
    const handle = panel.querySelector('#cigh-clean-resize-y');
    if (!handle) return;

    handle.addEventListener('pointerdown', event => {
      if (event.button && event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      panel.style.top = `${rect.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      resizeState = { id: event.pointerId, sy: event.clientY, height: rect.height };
      try { handle.setPointerCapture(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    });

    handle.addEventListener('pointermove', event => {
      if (!resizeState || resizeState.id !== event.pointerId) return;
      setPanelHeight(panel, resizeState.height + event.clientY - resizeState.sy, false);
      event.preventDefault();
    });

    const end = event => {
      if (resizeState?.id !== event.pointerId) return;
      try { handle.releasePointerCapture(event.pointerId); } catch {}
      resizeState = null;
      savePanelHeight(panel);
      clampPanelToViewport(false);
      savePos(panel);
    };

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', () => { resizeState = null; });
  }

  function savePos(panel) {
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(POS_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
  }

  function restorePos(panel) {
    try {
      const pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
      if (!pos || innerWidth <= 520) return;

      const next = clampFixedPosition(
        Number(pos.left || 6),
        Number(pos.top || 6),
        panel.offsetWidth || 252,
        panel.offsetHeight || Number(localStorage.getItem(PANEL_HEIGHT_KEY) || 374),
        { margin: 6, fallbackWidth: 252, fallbackHeight: 374 }
      );
      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    } catch {}
  }

  function refreshRoomKeyLabel() {
    const roomLabel = document.getElementById('cigh-clean-room');
    if (roomLabel) roomLabel.textContent = roomKey().slice(-22);
  }

  function showRoomSwitchPlaceholder(nextKey = roomKey()) {
    document.getElementById('cigh-rb-confirm')?.remove();
    flushPendingRoomLogs();
    cighAnalysisEpoch++;
    shopNotice = '';
    currentData = null;
    clearTimeout(autoAnalyzeTimer);

    if (decoEditMode) {
      decoEditMode = false;
      decoDraft = null;
    }

    refreshRoomKeyLabel();

    const panel = document.getElementById(PANEL_ID);
    if (panel?.classList.contains('open')) {
      if (activeTab === 'info') {
        const main = document.getElementById('cigh-clean-main');
        if (main) main.innerHTML = empty('ROOM LOADING');
      }
      setFooter(`ROOM ${String(nextKey || '').slice(-14)}`);
      updateAnalyzeCountLabel();
    }
  }

  function onRoomChanged() {
    const hudRouteAllowed = syncHudUiForRoute();
    if (hudRouteAllowed) syncDockUiForRoute();

    const nextKey = roomKey();
    const prevKey = lastSeenRoomKey;

    if (nextKey === prevKey) return;

    saveRoomLogLines(prevKey);

    lastSeenRoomKey = nextKey;
    resetCrackRerollRun();
    showRoomSwitchPlaceholder(nextKey);
    clearTransientUi();

    const settings = document.getElementById(SETTINGS_ID);
    if (settings && !settings.rbRequestClose) settings.remove();

    loadRoomData();
    syncMascotForRoute();
    syncDockUiForRoute();
    watchAutoAnalyze();
    scheduleCrackAttendanceCheck(700);
  }

  function scheduleRoomChangedCheck(before, delay = 0) {
    clearTimeout(routeChangeTimer);
    routeChangeTimer = setTimeout(() => {
      if (roomKey() !== before) onRoomChanged();
      else loadRoomData();
    }, delay);
  }

  function patchRoute() {
    const wrap = fn => function (...args) {
      const before = roomKey();
      const result = fn.apply(this, args);
      const after = roomKey();

      if (after !== before) {
        showRoomSwitchPlaceholder(after);
        scheduleRoomChangedCheck(before, 0);
        scheduleRoomChangedCheck(before, 160);
      } else {
        scheduleRoomChangedCheck(before, 120);
      }

      return result;
    };

    if (!history.__cighCleanPatchedV122) {
      history.pushState = wrap(history.pushState);
      history.replaceState = wrap(history.replaceState);
      history.__cighCleanPatchedV122 = true;
    }

    window.addEventListener('popstate', () => {
      showRoomSwitchPlaceholder(roomKey());
      scheduleRoomChangedCheck(lastSeenRoomKey, 80);
    });

    clearInterval(routeWatchTimer);
    routeWatchTimer = setInterval(onRoomChanged, 700);
  }

  function parseThemeColor(raw) {
    const m = String(raw || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function colorLuma(rgb) {
    if (!rgb) return null;
    const [r, g, b] = rgb.map(value => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function detectThemeMode() {
    const html = document.documentElement;
    const body = document.body;
    const classText = `${html?.className || ''} ${body?.className || ''}`.toLowerCase();
    const dataTheme = `${html?.getAttribute('data-theme') || ''} ${body?.getAttribute('data-theme') || ''}`.toLowerCase();

    if (/\bdark\b/.test(classText) || /\bdark\b/.test(dataTheme)) return 'dark';
    if (/\blight\b/.test(classText) || /\blight\b/.test(dataTheme)) return 'light';

    const luma = colorLuma(parseThemeColor(getComputedStyle(document.body).backgroundColor));
    if (luma != null) return luma > 0.55 ? 'light' : 'dark';

    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyThemeMode() {
    const mode = detectThemeMode();
    const fontSize = getUiFontSize();

    [
      document.getElementById(FAB_ID),
      document.getElementById(DOCK_FAB_ID),
      document.getElementById(PANEL_ID),
      document.getElementById(POPUP_ID),
      document.getElementById(COMMENT_POPUP_ID),
      document.getElementById(TICKER_ID),
      document.getElementById(SETTINGS_ID),
      document.getElementById(MASCOT_ID),
    ].filter(Boolean).forEach(el => {
      el.setAttribute('data-cigh-theme', mode);

      const prevFont = el.getAttribute('data-cigh-font');
      el.setAttribute('data-cigh-font', fontSize);

      // 최초 로드가 아니라 설정에서 실제 UI 크기가 바뀐 경우에만
      // 이전 크기의 인라인 width/height를 버리고 새 크기의 기본값을 적용한다.
      if (el.id === PANEL_ID && prevFont && prevFont !== fontSize) {
        el.style.removeProperty('height');
        el.style.removeProperty('width');
        el.style.setProperty('right', 'auto', 'important');

        if (innerWidth > 520) {
          el.style.setProperty('bottom', 'auto', 'important');
        } else {
          el.style.removeProperty('bottom');
        }

        requestAnimationFrame(() => {
          const defaultHeight =
            fontSize === 'large' ? 519 :
            fontSize === 'medium' ? 431 :
            374;

          const cssHeight = el.getBoundingClientRect().height || defaultHeight;
          setPanelHeight(el, cssHeight, true);
          restorePos(el);
          clampPanelToViewport(true);
        });
      }
    });
  }

  function watchThemeMode() {
    applyThemeMode();

    let themeDebounceTimer = null;
    const scheduleThemeApply = () => {
      clearTimeout(themeDebounceTimer);
      themeDebounceTimer = setTimeout(() => requestAnimationFrame(applyThemeMode), 16);
    };

    const observer = new MutationObserver(scheduleThemeApply);
    if (document.documentElement) observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });

    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', scheduleThemeApply);
  }

  // ─────────────────────────────────────────────
  // CSS
  // ─────────────────────────────────────────────
  function rbLegacy_injectStyle() {
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${FAB_ID}, #${DOCK_FAB_ID}, #${PANEL_ID}, #${POPUP_ID}, #${COMMENT_POPUP_ID}, #${TICKER_ID}, #${SETTINGS_ID}, #${MASCOT_ID}, #cigh-clean-gacha-modal, #cigh-clean-custom-deco-modal {
        --cigh-bg: #0d0e0b;
        --cigh-bg-2: #111210;
        --cigh-bg-3: #0f100e;
        --cigh-bg-soft: #090a08;
        --cigh-fill: #181917;
        --cigh-fill-soft: rgba(0,0,0,.18);
        --cigh-border: #222320;
        --cigh-border-soft: #1c1d1a;
        --cigh-border-faint: #191a17;
        --cigh-text: #e0d5b0;
        --cigh-text-soft: #5a5748;
        --cigh-text-faint: #3d3c35;
        --cigh-text-dim: #2d2c28;
        --cigh-accent: #c8a84b;
        --cigh-accent-soft: rgba(200,168,75,.34);
        --cigh-accent-softer: rgba(200,168,75,.07);
        --cigh-good: #5aaa70;
        --cigh-danger: #c0564f;
        --cigh-shadow-fab: 0 2px 10px rgba(0,0,0,.45);
        --cigh-shadow-panel: 0 8px 40px rgba(0,0,0,.65);
        --cigh-shadow-popup: 0 4px 20px rgba(0,0,0,.55);
        --cigh-shadow-settings: 0 8px 26px rgba(0,0,0,.55);
        --cigh-fill-grad: linear-gradient(90deg, #3a6e62, #c8a84b);
        --cigh-rel-grad: linear-gradient(90deg, #a24d5d, #db5d6f, #f0c15a);
      }

      #${FAB_ID}[data-cigh-theme="light"],
      #${DOCK_FAB_ID}[data-cigh-theme="light"],
      #${PANEL_ID}[data-cigh-theme="light"],
      #${POPUP_ID}[data-cigh-theme="light"],
      #${COMMENT_POPUP_ID}[data-cigh-theme="light"],
      #${TICKER_ID}[data-cigh-theme="light"],
      #${SETTINGS_ID}[data-cigh-theme="light"],
      #${MASCOT_ID}[data-cigh-theme="light"],
      #cigh-clean-gacha-modal[data-cigh-theme="light"],
      #cigh-clean-custom-deco-modal[data-cigh-theme="light"] {
        --cigh-bg: #fffdf8;
        --cigh-bg-2: #f6efe2;
        --cigh-bg-3: #fbf5ea;
        --cigh-bg-soft: #f2eadb;
        --cigh-fill: #e9decc;
        --cigh-fill-soft: rgba(218,204,180,.38);
        --cigh-border: #d7c7ae;
        --cigh-border-soft: #e4d7c1;
        --cigh-border-faint: #ecdfcb;
        --cigh-text: #5b4a39;
        --cigh-text-soft: #7f6c58;
        --cigh-text-faint: #9b866f;
        --cigh-text-dim: #b09d8a;
        --cigh-accent: #b8863b;
        --cigh-accent-soft: rgba(184,134,59,.30);
        --cigh-accent-softer: rgba(184,134,59,.10);
        --cigh-good: #528965;
        --cigh-danger: #b04a45;
        --cigh-shadow-fab: 0 2px 10px rgba(120,90,45,.16);
        --cigh-shadow-panel: 0 8px 30px rgba(120,90,45,.18);
        --cigh-shadow-popup: 0 4px 20px rgba(120,90,45,.18);
        --cigh-shadow-settings: 0 8px 24px rgba(120,90,45,.18);
        --cigh-fill-grad: linear-gradient(90deg, #7fa696, #c9a35c);
        --cigh-rel-grad: linear-gradient(90deg, #c47a88, #e46576, #e9b465);
      }

      #${FAB_ID} {
        position: fixed;
        left: 16px;
        bottom: 82px;
        z-index: 2147483645;
        width: 34px;
        height: 34px;
        border-radius: 7px;
        cursor: grab;
        touch-action: none;
        user-select: none;
        background: var(--cigh-bg);
        border: 1px solid var(--cigh-border-soft);
        color: var(--cigh-accent);
        font-size: 15px;
        line-height: 1;
        display: grid;
        place-items: center;
        box-shadow: var(--cigh-shadow-fab);
      }
      #${FAB_ID}:hover {
        border-color: var(--cigh-accent);
        box-shadow: 0 0 10px var(--cigh-accent-softer);
      }
      #${FAB_ID}:active {
        cursor: grabbing;
      }

      #${TICKER_ID} {
        position: fixed;
        z-index: 10;
        min-height: 30px;
        box-sizing: border-box;
        display: none;
        overflow: hidden;
        clip-path: inset(0 round 6px);
        contain: paint;
        pointer-events: auto;
        cursor: pointer;
        touch-action: manipulation;
        user-select: none;
        background: var(--cigh-bg);
        background: color-mix(in srgb, var(--cigh-bg) 88%, transparent);
        border: 1px solid var(--cigh-border-soft);
        border-left: 2px solid var(--cigh-accent);
        border-radius: 6px;
        box-shadow: var(--cigh-shadow-popup);
        color: var(--cigh-text);
      }
      #${TICKER_ID} .cigh-clean-ticker-viewport {
        position: relative;
        min-height: 30px;
        min-width: 0;
        overflow: hidden;
        clip-path: inset(0 round 5px);
        contain: paint;
      }
      #${TICKER_ID} .cigh-clean-ticker-line {
        min-height: 30px;
        min-width: 0;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        padding: 6px 10px;
        box-sizing: border-box;
        font-size: 11.5px;
        line-height: 1.4;
        white-space: normal;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: keep-all;
        overflow-wrap: anywhere;
        transform: translate3d(0, 88%, 0);
        opacity: 0;
        transition: transform .7s ease, opacity .7s ease;
        will-change: transform, opacity;
        backface-visibility: hidden;
        -webkit-font-smoothing: antialiased;
      }
      #${TICKER_ID}[data-cigh-font="medium"] .cigh-clean-ticker-line {
        font-size: 12.3px;
      }
      #${TICKER_ID}[data-cigh-font="large"] .cigh-clean-ticker-line {
        font-size: 13.5px;
      }

      #${PANEL_ID} {
        position: fixed;
        left: 16px;
        bottom: 124px;
        z-index: 2147483645;
        width: min(252px, calc(100vw - 12px));
        height: min(374px, calc(100vh - 12px));
        max-width: calc(100vw - 12px);
        max-height: calc(100vh - 12px);
        display: none;
        flex-direction: column;
        overflow: hidden;
        background: var(--cigh-bg);
        border: 1px solid var(--cigh-border);
        border-radius: 8px;
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(11px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text);
        box-shadow: var(--cigh-shadow-panel);
      }
      #${PANEL_ID}.open { display: flex; }
      .cigh-clean-resize-y {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 8px;
        cursor: ns-resize;
        touch-action: none;
        z-index: 4;
      }
      .cigh-clean-resize-y::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: 2px;
        width: 34px;
        height: 2px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: var(--cigh-border-soft);
        opacity: .75;
      }

      .cigh-clean-head {
        min-height: 27px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--cigh-bg-2);
        border-bottom: 1px solid var(--cigh-border-soft);
        cursor: move;
        user-select: none;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .cigh-clean-ttl {
        color: var(--cigh-accent);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
      }
      .cigh-clean-room {
        flex: 1;
        min-width: 0;
        color: var(--cigh-text-dim);
        font-size: 9px;
        line-height: 1.25;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: keep-all;
      }
      .cigh-clean-x {
        border: none;
        background: none;
        color: var(--cigh-text-faint);
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        padding: 0 2px;
      }
      .cigh-clean-x:hover { color: var(--cigh-text); }

      .cigh-clean-tabs {
        height: 26px;
        min-height: 26px;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        background: var(--cigh-bg-3);
        border-bottom: 1px solid var(--cigh-border-faint);
      }
      .cigh-clean-tab {
        border: none;
        background: none;
        color: var(--cigh-text-faint);
        cursor: pointer;
        font: inherit;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .16em;
      }
      .cigh-clean-tab:hover { color: var(--cigh-accent); }
      .cigh-clean-tab.on {
        color: var(--cigh-accent);
        background: var(--cigh-accent-softer);
      }

      .cigh-clean-main {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px;
        scrollbar-width: thin;
        scrollbar-color: var(--cigh-border) transparent;
        scrollbar-gutter: stable;
      }
      .cigh-clean-main::-webkit-scrollbar { width: 3px; }
      .cigh-clean-main::-webkit-scrollbar-thumb { background: var(--cigh-border); }
      .cigh-clean-log-inner { line-height: 1.5; }
      .cigh-clean-sec { margin-bottom: 10px; }
      .cigh-clean-sh {
        color: var(--cigh-text-faint);
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        letter-spacing: .14em;
        padding-bottom: 4px;
        margin-bottom: 5px;
        border-bottom: 1px solid var(--cigh-fill);
      }
      .cigh-clean-srow {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        padding: 2px 0;
        border-bottom: 1px solid color-mix(in srgb, var(--cigh-fill) 70%, transparent);
      }
      .cigh-clean-slbl { color: var(--cigh-text-faint); }
      .cigh-clean-sval {
        color: color-mix(in srgb, var(--cigh-accent) 55%, var(--cigh-text) 45%);
        text-align: right;
        max-width: 160px;
        overflow: visible;
        white-space: normal;
        text-overflow: clip;
        overflow-wrap: anywhere;
        word-break: keep-all;
      }
      .cigh-clean-situ {
        color: color-mix(in srgb, var(--cigh-accent) 55%, var(--cigh-text) 45%);
        line-height: 1.45;
      }

      .cigh-clean-brow { margin-bottom: 8px; }
      .cigh-clean-blbl {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
        font-size: calc(10px * var(--cigh-ui-font-scale, 1));
        margin-bottom: 3px;
      }
      .cigh-clean-mname {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      .cigh-clean-heart {
        transform-origin: center;
        will-change: transform;
        animation: cigh-clean-beat 1.45s ease-in-out infinite;
      }
      @keyframes cigh-clean-beat {
        0%, 100% { transform: scale(1); }
        45% { transform: scale(1.12); }
      }
      .cigh-clean-bdim {
        color: var(--cigh-text-faint);
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-pixelbar {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 2px;
        height: 6px;
      }
      .cigh-clean-pixelbar span {
        background: var(--cigh-fill);
        border: 1px solid var(--cigh-border-soft);
        box-sizing: border-box;
      }
      .cigh-clean-pixelbar span.on {
        background: var(--cigh-rel-grad);
      }

      .cigh-clean-irow {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 3px 2px;
      }
      .cigh-clean-ico {
        width: 16px;
        text-align: center;
        flex: 0 0 auto;
      }
      .cigh-clean-idetail {
        color: var(--cigh-text-soft);
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        margin-top: 2px;
        line-height: 1.35;
      }
      .cigh-clean-q {
        color: var(--cigh-good);
        padding: 1px 0;
      }
      .cigh-clean-empty {
        height: 80px;
        display: grid;
        place-items: center;
        color: var(--cigh-text-dim);
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        letter-spacing: .08em;
      }
      .cigh-clean-particle {
        position: absolute;
        left: 50%;
        top: 44%;
        width: 5px;
        height: 5px;
        border-radius: 1px;
        pointer-events: none;
        image-rendering: pixelated;
        z-index: 2;
        animation: cigh-clean-burst 0.72s ease-out forwards;
      }
      @keyframes cigh-clean-burst {
        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        70% { opacity: 1; }
        100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.35); opacity: 0; }
      }
      .cigh-clean-pet-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        width: 100%;
        aspect-ratio: 1 / 1;
        min-height: 0;
        padding: 10px 0 12px;
        margin: -1px -1px 6px;
        border-bottom: 1px solid var(--cigh-fill);
        overflow: hidden;
        image-rendering: pixelated;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .cigh-clean-pet-wrap.is-edit {
        outline: 1px dashed color-mix(in srgb, var(--cigh-accent) 42%, transparent);
        outline-offset: -3px;
        justify-content: flex-start;
      }
      .cigh-clean-pet-wrap > .cigh-clean-pet-speech,
      .cigh-clean-pet-wrap > .cigh-clean-pet-room-spacer,
      .cigh-clean-pet-wrap > .cigh-clean-deco-editor,
      .cigh-clean-pet-wrap > .cigh-clean-pet-edit-btn {
        position: relative;
        z-index: 5;
      }
      .cigh-clean-pet-wrap > .cigh-clean-pet-sprite {
        position: relative;
        z-index: 4;
      }
      .cigh-clean-pet-speech {
        max-width: 90%;
        /* EDIT 버튼과 겹치지 않게 말풍선만 살짝 아래로 */
        margin-top: calc(7px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(-7px * var(--cigh-ui-font-scale, 1));
        background: var(--cigh-fill);
        border: 1px solid var(--cigh-border-soft);
        border-radius: 8px;
        padding: 5px 9px;
        font-size: calc(10.5px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text);
        text-align: center;
        line-height: 1.4;
        word-break: keep-all;
        white-space: pre-line;
        animation: cigh-clean-pop 0.28s ease;
        cursor: pointer;
      }
      .cigh-clean-pet-speech.is-hidden {
        visibility: hidden;
        opacity: 0;
        pointer-events: none;
      }
      .cigh-clean-pet-room-spacer {
        flex: 0 0 auto;
        width: 1px;
        /* 칭호 착용 여부와 무관하게 같은 높이 유지 + 펫 위치 추가 하향 */
        height: calc(65px * var(--cigh-ui-font-scale, 1));
        pointer-events: none;
        opacity: 0;
      }
      .cigh-clean-pet-room-spacer.has-title {
        height: calc(65px * var(--cigh-ui-font-scale, 1));
      }
      @keyframes cigh-clean-pop {
        0% { opacity: 0; transform: scale(0.9) translateY(4px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .cigh-clean-pet-sprite {
        display: grid;
        place-items: center;
        min-height: 102px;
        padding: 4px;
        cursor: pointer;
        animation: cigh-clean-float 2.4s ease-in-out infinite;
      }
      .cigh-clean-pet-sprite.is-sleep {
        animation: none;
      }
      .cigh-clean-pet-sprite.egg-poke .cigh-clean-pet-svg,
      .cigh-clean-pet-sprite.egg-poke .cigh-clean-pet-img-wrap {
        animation: cigh-clean-egg-wobble 0.42s ease;
        transform-origin: center bottom;
      }
      .cigh-clean-pet-sprite.is-sleep .cigh-clean-pet-img-wrap,
      .cigh-clean-pet-sprite.is-sleep .cigh-clean-pet-svg {
        animation: cigh-clean-sleep-breathe 2.2s ease-in-out infinite;
        transform-origin: center bottom;
      }
      .cigh-clean-pet-svg {
        image-rendering: pixelated;
      }
      .cigh-clean-pet-img-wrap {
        display: grid;
        place-items: center;
        position: relative;
        width: var(--cigh-pet-img-size, 112px);
        height: var(--cigh-pet-img-size, 112px);
        overflow: visible;
      }
      #cigh-clean-panel{
        --cigh-deco-scale:1;
        --cigh-ui-font-scale:1;
        --cigh-diary-mood-size:13px;
        --cigh-diary-date-size:9.6px;
        --cigh-diary-line-size:11px;
        --cigh-diary-chip-size:9px;
        --cigh-diary-empty-title-size:11px;
        --cigh-diary-empty-help-size:9px;
      }
      #cigh-clean-panel[data-cigh-font="small"]{
        --cigh-deco-scale:.92;
        --cigh-ui-font-scale:.92;
        --cigh-diary-mood-size:12.5px;
        --cigh-diary-date-size:9.1px;
        --cigh-diary-line-size:10.5px;
        --cigh-diary-chip-size:8.5px;
        --cigh-diary-empty-title-size:10.5px;
        --cigh-diary-empty-help-size:8.6px;
      }
      #cigh-clean-panel[data-cigh-font="large"]{
        --cigh-deco-scale:1.1;
        --cigh-ui-font-scale:1.12;
        --cigh-diary-mood-size:15px;
        --cigh-diary-date-size:11px;
        --cigh-diary-line-size:13px;
        --cigh-diary-chip-size:10.2px;
        --cigh-diary-empty-title-size:13px;
        --cigh-diary-empty-help-size:10.2px;
      }

      .cigh-clean-pet-edit-btn {
        position: absolute !important;
        right: 6px;
        top: 5px;
        z-index: 8 !important;
      }
      .cigh-clean-pet-edit-btn.save {
        color: var(--cigh-good);
        border-color: color-mix(in srgb, var(--cigh-good) 45%, var(--cigh-border-soft));
      }
      .cigh-clean-room-wall,
      .cigh-clean-room-floor {
        position: absolute;
        left: 0;
        right: 0;
        pointer-events: none;
        z-index: 0;
      }
      .cigh-clean-room-wall {
        top: 0;
        height: 50%;
        background: transparent;
      }
      .cigh-clean-room-floor {
        bottom: 0;
        height: calc(50% + 1px);
        background: transparent;
        border-top: none;
      }
      .cigh-clean-room-floor::before,
      .cigh-clean-room-floor::after {
        content: none !important;
      }
      .cigh-clean-room-props {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
      }
      .cigh-clean-room-prop {
        position: absolute;
        z-index: 2;
        transform: translate(-50%, -50%);
        min-width: 20px;
        min-height: 18px;
        padding: 1px 3px;
        border: 1px solid color-mix(in srgb, var(--cigh-border-soft) 75%, transparent);
        background: color-mix(in srgb, var(--cigh-fill) 80%, transparent);
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: 13px;
        line-height: 1;
        display: grid;
        place-items: center;
        cursor: default;
        image-rendering: pixelated;
        box-shadow: 2px 2px 0 color-mix(in srgb, #000 18%, transparent);
        pointer-events: auto;
      }
      .cigh-clean-room-prop.has-image {
        width: var(--room-prop-size, 40px);
        height: var(--room-prop-size, 40px);
        min-width: 0;
        min-height: 0;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
      }
      .cigh-clean-room-prop-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: auto;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
        filter: drop-shadow(1px 2px 0 rgba(0,0,0,.18));
      }
      .cigh-clean-room-prop.editable { cursor: grab; }
      .cigh-clean-room-prop.dragging {
        cursor: grabbing;
        z-index: 7;
        filter: brightness(1.12);
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-night-star { background: radial-gradient(circle at 22% 28%, rgba(255,230,120,.9) 0 1px, transparent 2px), radial-gradient(circle at 72% 44%, rgba(255,230,120,.75) 0 1px, transparent 2px), linear-gradient(#0c1024, #141125); }
      .cigh-clean-room-floor.cigh-clean-deco-floor-wood { background: repeating-linear-gradient(90deg, #3b271e 0 18px, #4a3024 18px 20px, #2b1c17 20px 38px); }
      .cigh-clean-room-floor.cigh-clean-deco-floor-wood-piskel {
        background:#9b9186 url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%239b9186'/><rect x='0' y='0' width='8' height='32' fill='%2393887d'/><rect x='8' y='0' width='8' height='32' fill='%23a0968b'/><rect x='16' y='0' width='8' height='32' fill='%238f8478'/><rect x='24' y='0' width='8' height='32' fill='%23a59a90'/><rect x='7' y='0' width='1' height='32' fill='%23706760'/><rect x='15' y='0' width='1' height='32' fill='%236a615a'/><rect x='23' y='0' width='1' height='32' fill='%23706760'/><rect x='2' y='4' width='3' height='1' fill='%23b7aca0'/><rect x='10' y='7' width='4' height='1' fill='%23b2a79c'/><rect x='18' y='5' width='3' height='1' fill='%23877c73'/><rect x='26' y='8' width='3' height='1' fill='%23bbb1a6'/><rect x='3' y='13' width='2' height='1' fill='%23857b72'/><rect x='11' y='15' width='3' height='1' fill='%23b8aea3'/><rect x='19' y='12' width='4' height='1' fill='%23867c73'/><rect x='27' y='16' width='2' height='1' fill='%23b3a89d'/><rect x='1' y='22' width='4' height='1' fill='%23b9afa4'/><rect x='9' y='24' width='3' height='1' fill='%238b8077'/><rect x='18' y='21' width='2' height='1' fill='%23b5aba0'/><rect x='25' y='25' width='4' height='1' fill='%23877c73'/></svg>") repeat;
        background-size: 32px 32px;
        image-rendering: pixelated;
      }
      .cigh-clean-room-floor.cigh-clean-deco-floor-ash-wood {
        background-color: #bab29d;
        background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAWElEQVR4AezXMQqAMBBE0WF6Faz08F7C0gtpJWgOkBwh5UD4gd+HBwu7vs6jJrPCjw8ggIDL/yqZn/tTMm/7omSe5lXJmAIEEEAAAQTYB9gHmILxBXrHdwMAAP//gF1LwAAAAAZJREFUAwD5XOFQBKR2zgAAAABJRU5ErkJggg==");
        background-repeat: repeat;
        background-size: 64px 64px;
        image-rendering: pixelated;
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-sky{
        background-color:#79b6e6;
        background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA2NCA0MCc+PHJlY3QgeD0nOScgeT0nNycgd2lkdGg9JzcnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzcnIHk9JzgnIHdpZHRoPScxMScgaGVpZ2h0PScxJyBmaWxsPScjZmZmZmZmJy8+PHJlY3QgeD0nNicgeT0nOScgd2lkdGg9JzEzJyBoZWlnaHQ9JzEnIGZpbGw9JyNmZmZmZmYnLz48cmVjdCB4PSc1JyB5PScxMCcgd2lkdGg9JzE1JyBoZWlnaHQ9JzEnIGZpbGw9JyNlZWY0ZmEnLz48cmVjdCB4PSc2JyB5PScxMScgd2lkdGg9JzEzJyBoZWlnaHQ9JzEnIGZpbGw9JyNjNWQzZTAnLz48cmVjdCB4PSc5JyB5PScxMicgd2lkdGg9JzcnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjxyZWN0IHg9JzQxJyB5PScxMCcgd2lkdGg9JzUnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzM5JyB5PScxMScgd2lkdGg9JzknIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzM5JyB5PScxMicgd2lkdGg9JzknIGhlaWdodD0nMScgZmlsbD0nI2VlZjRmYScvPjxyZWN0IHg9JzQwJyB5PScxMycgd2lkdGg9JzcnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjxyZWN0IHg9JzQyJyB5PScxNCcgd2lkdGg9JzQnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjxyZWN0IHg9JzI3JyB5PScyNicgd2lkdGg9JzUnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzI1JyB5PScyNycgd2lkdGg9JzknIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzI2JyB5PScyOCcgd2lkdGg9JzcnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjxyZWN0IHg9JzUyJyB5PScyOCcgd2lkdGg9JzQnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzUxJyB5PScyOScgd2lkdGg9JzYnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzUyJyB5PSczMCcgd2lkdGg9JzQnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjxyZWN0IHg9JzExJyB5PSczMCcgd2lkdGg9JzUnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzEwJyB5PSczMScgd2lkdGg9JzcnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzEyJyB5PSczMicgd2lkdGg9JzMnIGhlaWdodD0nMScgZmlsbD0nI2M1ZDNlMCcvPjwvc3ZnPg=="),linear-gradient(#4a93d4 0%,#79b6e6 55%,#bfe0f4 100%);
        background-repeat:repeat,no-repeat;
        background-position:top left,center;
        background-size:64px 40px,100% 100%;
        image-rendering:pixelated;
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-plain-ivory{
        background:#f0eae3;
        image-rendering:pixelated;
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-plain-pink{
        background-color:#846d55;
        background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAO0lEQVR4AezXwQkAMAgDwOKOHaNbdG8dwacgF8g/3C/x383JxhmOAQQIECBAgAABAgQIECBAYL9Ad74LAAD//6nu6zMAAAAGSURBVAMAGg1I4W6zWCUAAAAASUVORK5CYII=");
        background-repeat:repeat;
        background-size:64px 64px;
        image-rendering:pixelated;
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-plain-plain-3{
        background-color:#949b8d;
        background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOklEQVR4AezXMQoAMAgDwOL/u3XrY/UJjoJcIHu4LfH+zcnGGY4BBAgQIECAAAECBAgQIEBgv0B3vgsAAP//ZkcOWwAAAAZJREFUAwBKw1ehhQmjwwAAAABJRU5ErkJggg==");
        background-repeat:repeat;
        background-size:64px 64px;
        image-rendering:pixelated;
      }
      .cigh-clean-room-wall.cigh-clean-deco-wall-muted-sage{ background:#b8c2b0; image-rendering:pixelated; }
      .cigh-clean-room-wall.cigh-clean-deco-wall-muted-bluegrey{ background:#b4bcc7; image-rendering:pixelated; }
      .cigh-clean-room-wall.cigh-clean-deco-wall-muted-mauve{ background:#c4b6bf; image-rendering:pixelated; }
      .cigh-clean-room-wall.cigh-clean-deco-wall-pastel-mint{ background:#d9efe3; image-rendering:pixelated; }
      .cigh-clean-room-wall.cigh-clean-deco-wall-pastel-peach{ background:#f4ddd2; image-rendering:pixelated; }
      .cigh-clean-room-wall.cigh-clean-deco-wall-pastel-lilac{ background:#e7def6; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-grass{
        background-color:#78bc54;
        background-image:url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PHJlY3Qgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJyBmaWxsPScjNzhiYzU0Jy8+PHJlY3QgeD0nMycgeT0nNScgd2lkdGg9JzEnIGhlaWdodD0nMycgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzUnIHk9JzQnIHdpZHRoPScxJyBoZWlnaHQ9JzQnIGZpbGw9JyMzNDdmM2YnLz48cmVjdCB4PSc0JyB5PSc2JyB3aWR0aD0nMScgaGVpZ2h0PScyJyBmaWxsPScjOWJkODc3Jy8+PHJlY3QgeD0nMjAnIHk9JzMnIHdpZHRoPScxJyBoZWlnaHQ9JzMnIGZpbGw9JyMzNDdmM2YnLz48cmVjdCB4PScyMicgeT0nNCcgd2lkdGg9JzEnIGhlaWdodD0nMycgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzE0JyB5PScxNCcgd2lkdGg9JzEnIGhlaWdodD0nMycgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzE2JyB5PScxMycgd2lkdGg9JzEnIGhlaWdodD0nNCcgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzE1JyB5PScxNScgd2lkdGg9JzEnIGhlaWdodD0nMicgZmlsbD0nIzliZDg3NycvPjxyZWN0IHg9JzI2JyB5PScxOCcgd2lkdGg9JzEnIGhlaWdodD0nMycgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzI4JyB5PScxOScgd2lkdGg9JzEnIGhlaWdodD0nMycgZmlsbD0nIzM0N2YzZicvPjxyZWN0IHg9JzYnIHk9JzIyJyB3aWR0aD0nMScgaGVpZ2h0PSczJyBmaWxsPScjMzQ3ZjNmJy8+PHJlY3QgeD0nOCcgeT0nMjEnIHdpZHRoPScxJyBoZWlnaHQ9JzQnIGZpbGw9JyMzNDdmM2YnLz48cmVjdCB4PSc3JyB5PScyMycgd2lkdGg9JzEnIGhlaWdodD0nMicgZmlsbD0nIzliZDg3NycvPjxyZWN0IHg9JzEwJyB5PSc5JyB3aWR0aD0nMScgaGVpZ2h0PScxJyBmaWxsPScjOGFjODY2Jy8+PHJlY3QgeD0nMjQnIHk9JzI3JyB3aWR0aD0nMScgaGVpZ2h0PScxJyBmaWxsPScjOGFjODY2Jy8+PHJlY3QgeD0nMTgnIHk9JzI1JyB3aWR0aD0nMScgaGVpZ2h0PScxJyBmaWxsPScjNjJhNDQ0Jy8+PHJlY3QgeD0nMicgeT0nMTYnIHdpZHRoPScxJyBoZWlnaHQ9JzEnIGZpbGw9JyM2MmE0NDQnLz48cmVjdCB4PScyOScgeT0nOScgd2lkdGg9JzInIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzI4JyB5PSc4JyB3aWR0aD0nMScgaGVpZ2h0PScxJyBmaWxsPScjZmZmZmZmJy8+PHJlY3QgeD0nMzAnIHk9JzgnIHdpZHRoPScxJyBoZWlnaHQ9JzEnIGZpbGw9JyNmZmZmZmYnLz48cmVjdCB4PScyOScgeT0nOCcgd2lkdGg9JzEnIGhlaWdodD0nMScgZmlsbD0nI2ZmZTE0ZCcvPjxyZWN0IHg9JzEyJyB5PScyOCcgd2lkdGg9JzEnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzExJyB5PScyOScgd2lkdGg9JzMnIGhlaWdodD0nMScgZmlsbD0nI2ZmZmZmZicvPjxyZWN0IHg9JzEyJyB5PScyOScgd2lkdGg9JzEnIGhlaWdodD0nMScgZmlsbD0nI2ZmZTE0ZCcvPjwvc3ZnPg==");
        background-repeat:repeat;
        background-size:32px 32px;
        image-rendering:pixelated;
      }      .cigh-clean-room-floor.cigh-clean-deco-floor-deep-grass{
        background:#3f7f3f url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%233f7f3f'/><rect x='3' y='4' width='1' height='4' fill='%23224f23'/><rect x='5' y='5' width='1' height='4' fill='%23224f23'/><rect x='4' y='6' width='1' height='2' fill='%2368a84f'/><rect x='12' y='12' width='1' height='4' fill='%23224f23'/><rect x='14' y='11' width='1' height='5' fill='%23224f23'/><rect x='13' y='13' width='1' height='2' fill='%2368a84f'/><rect x='22' y='3' width='1' height='4' fill='%23224f23'/><rect x='24' y='4' width='1' height='4' fill='%23224f23'/><rect x='23' y='5' width='1' height='2' fill='%2368a84f'/><rect x='26' y='18' width='1' height='4' fill='%23224f23'/><rect x='28' y='19' width='1' height='4' fill='%23224f23'/><rect x='27' y='20' width='1' height='2' fill='%2368a84f'/><rect x='7' y='23' width='1' height='4' fill='%23224f23'/><rect x='9' y='22' width='1' height='5' fill='%23224f23'/><rect x='8' y='24' width='1' height='2' fill='%2368a84f'/><rect x='16' y='24' width='1' height='1' fill='%23599646'/><rect x='2' y='16' width='1' height='1' fill='%23599646'/><rect x='18' y='28' width='1' height='1' fill='%23599646'/><rect x='29' y='9' width='1' height='1' fill='%23f0f6ff'/><rect x='30' y='9' width='1' height='1' fill='%23f0f6ff'/><rect x='29' y='10' width='1' height='1' fill='%23ffd767'/><rect x='12' y='29' width='1' height='1' fill='%23f0f6ff'/><rect x='11' y='30' width='3' height='1' fill='%23f0f6ff'/><rect x='12' y='30' width='1' height='1' fill='%23ffd767'/></svg>") repeat;background-size:32px 32px;image-rendering:pixelated;}
      .cigh-clean-room-floor.cigh-clean-deco-floor-star-grass{
        background:#2f5b30 url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%232f5b30'/><rect x='3' y='5' width='1' height='4' fill='%231a331b'/><rect x='5' y='4' width='1' height='5' fill='%231a331b'/><rect x='4' y='6' width='1' height='2' fill='%235b8e53'/><rect x='11' y='12' width='1' height='4' fill='%231a331b'/><rect x='13' y='11' width='1' height='5' fill='%231a331b'/><rect x='12' y='13' width='1' height='2' fill='%235b8e53'/><rect x='22' y='3' width='1' height='4' fill='%231a331b'/><rect x='24' y='4' width='1' height='4' fill='%231a331b'/><rect x='23' y='5' width='1' height='2' fill='%235b8e53'/><rect x='27' y='17' width='1' height='4' fill='%231a331b'/><rect x='29' y='18' width='1' height='4' fill='%231a331b'/><rect x='28' y='19' width='1' height='2' fill='%235b8e53'/><rect x='7' y='22' width='1' height='4' fill='%231a331b'/><rect x='9' y='21' width='1' height='5' fill='%231a331b'/><rect x='8' y='23' width='1' height='2' fill='%235b8e53'/><rect x='16' y='25' width='1' height='1' fill='%23447640'/><rect x='2' y='15' width='1' height='1' fill='%23447640'/><rect x='18' y='28' width='1' height='1' fill='%23447640'/><rect x='6' y='10' width='1' height='1' fill='%23f4f8ff'/><rect x='7' y='10' width='1' height='1' fill='%23f4f8ff'/><rect x='6' y='11' width='1' height='1' fill='%23ffe07c'/><rect x='20' y='8' width='1' height='1' fill='%23f4f8ff'/><rect x='21' y='8' width='1' height='1' fill='%23f4f8ff'/><rect x='20' y='9' width='1' height='1' fill='%23ffe07c'/><rect x='25' y='26' width='1' height='1' fill='%23f4f8ff'/><rect x='26' y='26' width='1' height='1' fill='%23f4f8ff'/><rect x='25' y='27' width='1' height='1' fill='%23ffe07c'/><rect x='12' y='28' width='1' height='1' fill='%23f4f8ff'/><rect x='13' y='28' width='1' height='1' fill='%23f4f8ff'/><rect x='12' y='29' width='1' height='1' fill='%23ffe07c'/></svg>") repeat;
        background-size:32px 32px;
        image-rendering:pixelated;
      }
      .cigh-clean-room-floor.cigh-clean-deco-floor-cloud-soft{
        background:#cfe5f6 url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%23cfe5f6'/><rect x='3' y='6' width='7' height='1' fill='%23ffffff'/><rect x='2' y='7' width='10' height='1' fill='%23ffffff'/><rect x='2' y='8' width='10' height='1' fill='%23eef7ff'/><rect x='3' y='9' width='8' height='1' fill='%23d9e8f4'/><rect x='4' y='10' width='5' height='1' fill='%23d9e8f4'/><rect x='18' y='4' width='5' height='1' fill='%23ffffff'/><rect x='17' y='5' width='8' height='1' fill='%23ffffff'/><rect x='17' y='6' width='8' height='1' fill='%23eef7ff'/><rect x='18' y='7' width='6' height='1' fill='%23d9e8f4'/><rect x='21' y='8' width='2' height='1' fill='%23d9e8f4'/><rect x='11' y='18' width='7' height='1' fill='%23ffffff'/><rect x='10' y='19' width='10' height='1' fill='%23ffffff'/><rect x='10' y='20' width='10' height='1' fill='%23eef7ff'/><rect x='11' y='21' width='8' height='1' fill='%23d9e8f4'/><rect x='12' y='22' width='5' height='1' fill='%23d9e8f4'/><rect x='23' y='22' width='5' height='1' fill='%23ffffff'/><rect x='22' y='23' width='8' height='1' fill='%23ffffff'/><rect x='22' y='24' width='8' height='1' fill='%23eef7ff'/><rect x='23' y='25' width='6' height='1' fill='%23d9e8f4'/><rect x='5' y='24' width='5' height='1' fill='%23ffffff'/><rect x='4' y='25' width='8' height='1' fill='%23ffffff'/><rect x='4' y='26' width='8' height='1' fill='%23eef7ff'/><rect x='5' y='27' width='6' height='1' fill='%23d9e8f4'/></svg>") repeat;
        background-size:32px 32px;
        image-rendering:pixelated;
      }
      .cigh-clean-room-floor.cigh-clean-deco-floor-muted-sand{ background:#b7ab9b; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-muted-sage{ background:#a7b39f; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-muted-bluegrey{ background:#9ea9b6; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-pastel-cream{ background:#f1e8d7; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-pastel-mint{ background:#d1e6db; image-rendering:pixelated; }
      .cigh-clean-room-floor.cigh-clean-deco-floor-pastel-lilac{ background:#d8d0ea; image-rendering:pixelated; }

      .cigh-clean-room-prop.cigh-clean-deco-prop-cushion,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plant,
      .cigh-clean-room-prop.cigh-clean-deco-prop-books,
      .cigh-clean-room-prop.cigh-clean-deco-prop-lamp,
      .cigh-clean-room-prop.cigh-clean-deco-prop-star,
      .cigh-clean-room-prop.cigh-clean-deco-prop-table,
      .cigh-clean-room-prop.cigh-clean-deco-prop-rug,
      .cigh-clean-room-prop.cigh-clean-deco-prop-clock,
      .cigh-clean-room-prop.cigh-clean-deco-prop-bed,
      .cigh-clean-room-prop.cigh-clean-deco-prop-door,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-twin,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-bell,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blossom,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-white,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blue,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-sun,
      .cigh-clean-room-prop.cigh-clean-deco-prop-bush-berry,
      .cigh-clean-room-prop.cigh-clean-deco-prop-fence-wood,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-sakura,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-willow,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-maple,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-dream,
      .cigh-clean-room-prop.cigh-clean-deco-prop-moon-full,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-iv,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-iv,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-iv,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-iv,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-mt,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-mt,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-mt,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-mt,
      .cigh-clean-room-prop.cigh-clean-deco-prop-swag,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-large,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-small,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-curtain
{
        background-color:transparent;border-color:transparent;box-shadow:none;
        padding:0;min-width:0;min-height:0;
        font-size:calc(2px * var(--cigh-deco-scale,1));
        background-repeat:no-repeat;background-position:center;background-size:contain;
        image-rendering:pixelated;
      }
      .cigh-clean-room-prop.cigh-clean-deco-prop-cushion>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plant>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-books>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-lamp>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-star>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-table>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-rug>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-clock>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-bed>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-door>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-twin>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-bell>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blossom>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-white>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blue>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-sun>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-bush-berry>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-fence-wood>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-sakura>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-willow>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-maple>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-dream>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-moon-full>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-iv>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-iv>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-iv>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-iv>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-mt>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-mt>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-mt>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-mt>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-swag>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-large>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-small>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-curtain>span{font-size:0;line-height:0;}
      .cigh-clean-room-prop.cigh-clean-deco-prop-cushion{width:30em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 20'><rect x='4' y='4' width='20' height='12' fill='%23f0c97a'/><rect x='3' y='6' width='22' height='8' fill='%23f0c97a'/><rect x='4' y='3' width='20' height='2' fill='%23ffe0a0'/><rect x='4' y='14' width='20' height='2' fill='%23cf9f4a'/><rect x='2' y='4' width='2' height='3' fill='%23fff0c8'/><rect x='24' y='4' width='2' height='3' fill='%23fff0c8'/><rect x='2' y='13' width='2' height='3' fill='%23fff0c8'/><rect x='24' y='13' width='2' height='3' fill='%23fff0c8'/><rect x='13' y='9' width='2' height='2' fill='%23cf9f4a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-plant{width:20em;height:25em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='5' y='20' width='12' height='7' fill='%23c2724a'/><rect x='4' y='18' width='14' height='3' fill='%23d98a5e'/><rect x='6' y='24' width='10' height='1' fill='%23a85d38'/><rect x='10' y='9' width='2' height='11' fill='%233f8f55'/><rect x='5' y='10' width='5' height='3' fill='%235cb878'/><rect x='3' y='12' width='4' height='2' fill='%234ea568'/><rect x='12' y='8' width='5' height='3' fill='%235cb878'/><rect x='15' y='10' width='4' height='2' fill='%234ea568'/><rect x='8' y='5' width='6' height='3' fill='%236cc888'/><rect x='9' y='3' width='4' height='2' fill='%237ad497'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-books{width:24em;height:19em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 22'><rect x='2' y='15' width='22' height='5' fill='%237d6bd8'/><rect x='2' y='15' width='22' height='1' fill='%239a8bf0'/><rect x='2' y='19' width='22' height='1' fill='%235e4eb0'/><rect x='3' y='16' width='1' height='3' fill='%23f0ecff'/><rect x='4' y='10' width='20' height='5' fill='%23e46b96'/><rect x='4' y='10' width='20' height='1' fill='%23ff8db8'/><rect x='5' y='11' width='1' height='3' fill='%23ffe3ee'/><rect x='3' y='5' width='18' height='5' fill='%234ea568'/><rect x='3' y='5' width='18' height='1' fill='%236cc888'/><rect x='4' y='6' width='1' height='3' fill='%23e8ffee'/><rect x='17' y='3' width='2' height='4' fill='%23ffd166'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-lamp{width:23em;height:39em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 48'><rect x='10' y='4' width='8' height='1' fill='%23ffe7a8'/><rect x='9' y='5' width='10' height='1' fill='%23ffdf8a'/><rect x='8' y='6' width='12' height='1' fill='%23ffd166'/><rect x='7' y='7' width='14' height='1' fill='%23ffd166'/><rect x='6' y='8' width='16' height='1' fill='%23f0c050'/><rect x='6' y='9' width='16' height='1' fill='%23e8b84a'/><rect x='7' y='10' width='14' height='1' fill='%23d8a83e'/><rect x='12' y='11' width='4' height='1' fill='%235c4a38'/><rect x='13' y='12' width='2' height='30' fill='%237a6650'/><rect x='13' y='12' width='1' height='30' fill='%238c785f'/><rect x='9' y='42' width='10' height='1' fill='%236b5642'/><rect x='8' y='43' width='12' height='1' fill='%236b5642'/><rect x='6' y='44' width='16' height='2' fill='%235c4a38'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-star{width:19em;height:19em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect x='11' y='3' width='2' height='5' fill='%23ffd84a'/><rect x='8' y='8' width='8' height='3' fill='%23ffd84a'/><rect x='4' y='10' width='16' height='3' fill='%23ffd84a'/><rect x='7' y='13' width='10' height='3' fill='%23ffcf2e'/><rect x='8' y='16' width='3' height='4' fill='%23e8b62a'/><rect x='13' y='16' width='3' height='4' fill='%23e8b62a'/><rect x='10' y='9' width='3' height='2' fill='%23fff4c2'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-table{width:38em;height:26em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 20'><rect x='2' y='5' width='24' height='4' fill='%23a8794f'/><rect x='2' y='5' width='24' height='1' fill='%23c2916a'/><rect x='2' y='8' width='24' height='1' fill='%23825d3a'/><rect x='5' y='9' width='3' height='9' fill='%238a6342'/><rect x='20' y='9' width='3' height='9' fill='%238a6342'/><rect x='12' y='2' width='4' height='3' fill='%23e46b96'/><rect x='12' y='2' width='4' height='1' fill='%23ff8db8'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-rug{width:60em;height:37em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 30'><rect x='0' y='4' width='2' height='1' fill='%23ece0c4'/><rect x='0' y='8' width='2' height='1' fill='%23ece0c4'/><rect x='0' y='12' width='2' height='1' fill='%23ece0c4'/><rect x='0' y='16' width='2' height='1' fill='%23ece0c4'/><rect x='0' y='20' width='2' height='1' fill='%23ece0c4'/><rect x='0' y='24' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='4' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='8' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='12' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='16' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='20' width='2' height='1' fill='%23ece0c4'/><rect x='46' y='24' width='2' height='1' fill='%23ece0c4'/><rect x='2' y='1' width='44' height='28' fill='%23e7d3aa'/><rect x='3' y='2' width='42' height='26' fill='%238a6342'/><rect x='5' y='4' width='38' height='22' fill='%23b5895a'/><rect x='7' y='6' width='34' height='18' fill='%23cda878'/><rect x='9' y='8' width='30' height='14' fill='%238a6342'/><rect x='11' y='10' width='26' height='10' fill='%23ddc096'/><rect x='11' y='10' width='26' height='1' fill='%23ebd3a6'/><rect x='11' y='19' width='26' height='1' fill='%23c8a06a'/><rect x='18' y='13' width='12' height='4' fill='%23cda878'/><rect x='18' y='13' width='12' height='1' fill='%23e7d3aa'/><rect x='23' y='14' width='2' height='2' fill='%238a6342'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-clock{width:20em;height:20em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect x='11' y='4' width='10' height='1' fill='%236b4a30'/><rect x='9' y='5' width='14' height='1' fill='%236b4a30'/><rect x='8' y='6' width='16' height='1' fill='%236b4a30'/><rect x='7' y='7' width='18' height='1' fill='%236b4a30'/><rect x='6' y='8' width='20' height='1' fill='%236b4a30'/><rect x='5' y='9' width='22' height='2' fill='%236b4a30'/><rect x='4' y='11' width='24' height='10' fill='%236b4a30'/><rect x='5' y='21' width='22' height='2' fill='%236b4a30'/><rect x='6' y='23' width='20' height='1' fill='%236b4a30'/><rect x='7' y='24' width='18' height='1' fill='%236b4a30'/><rect x='8' y='25' width='16' height='1' fill='%236b4a30'/><rect x='9' y='26' width='14' height='1' fill='%236b4a30'/><rect x='11' y='27' width='10' height='1' fill='%236b4a30'/><rect x='10' y='6' width='12' height='1' fill='%23f3e7cf'/><rect x='9' y='7' width='14' height='1' fill='%23f3e7cf'/><rect x='8' y='8' width='16' height='1' fill='%23f3e7cf'/><rect x='7' y='9' width='18' height='2' fill='%23f3e7cf'/><rect x='6' y='11' width='20' height='10' fill='%23f3e7cf'/><rect x='7' y='21' width='18' height='2' fill='%23f3e7cf'/><rect x='8' y='23' width='16' height='1' fill='%23f3e7cf'/><rect x='9' y='24' width='14' height='1' fill='%23f3e7cf'/><rect x='10' y='25' width='12' height='1' fill='%23f3e7cf'/><rect x='15' y='8' width='2' height='1' fill='%236b4a30'/><rect x='15' y='23' width='2' height='1' fill='%236b4a30'/><rect x='23' y='15' width='1' height='2' fill='%236b4a30'/><rect x='8' y='15' width='1' height='2' fill='%236b4a30'/><rect x='15' y='9' width='1' height='6' fill='%233a2a1c'/><rect x='16' y='15' width='5' height='1' fill='%233a2a1c'/><rect x='15' y='15' width='2' height='2' fill='%23c0392b'/><rect x='15' y='2' width='2' height='2' fill='%236b4a30'/><rect x='14' y='4' width='4' height='1' fill='%236b4a30'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-bed{width:46em;height:32em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 28'><rect x='4' y='19' width='2' height='5' fill='%236b4a30'/><rect x='34' y='19' width='2' height='5' fill='%236b4a30'/><rect x='2' y='3' width='4' height='17' fill='%238a6342'/><rect x='2' y='3' width='4' height='1' fill='%23a87a52'/><rect x='34' y='9' width='4' height='10' fill='%238a6342'/><rect x='34' y='9' width='4' height='1' fill='%23a87a52'/><rect x='4' y='13' width='32' height='6' fill='%23efe6d2'/><rect x='4' y='18' width='32' height='1' fill='%23d2c6ac'/><rect x='15' y='11' width='20' height='7' fill='%237fb0d8'/><rect x='15' y='11' width='20' height='1' fill='%23a8cdea'/><rect x='15' y='17' width='20' height='1' fill='%235f90b8'/><rect x='5' y='10' width='9' height='4' fill='%23fff6e6'/><rect x='5' y='13' width='9' height='1' fill='%23e6dac2'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-door{width:26em;height:44em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 48'><rect x='2' y='2' width='24' height='44' fill='%23533a27'/><rect x='3' y='3' width='22' height='42' fill='%2362432b'/><rect x='4' y='4' width='20' height='40' fill='%23966b45'/><rect x='4' y='4' width='1' height='40' fill='%23b78b62'/><rect x='23' y='4' width='1' height='40' fill='%2369472d'/><rect x='5' y='5' width='18' height='1' fill='%23c99b70'/><rect x='5' y='43' width='18' height='1' fill='%23735237'/><rect x='6' y='7' width='14' height='1' fill='%23674128'/><rect x='6' y='7' width='1' height='15' fill='%23674128'/><rect x='7' y='8' width='12' height='13' fill='%23895c38'/><rect x='7' y='8' width='12' height='1' fill='%23b88c60'/><rect x='7' y='20' width='12' height='1' fill='%237b5031'/><rect x='19' y='8' width='1' height='13' fill='%23b88c60'/><rect x='8' y='10' width='10' height='9' fill='%23a27249'/><rect x='6' y='25' width='14' height='1' fill='%23674128'/><rect x='6' y='25' width='1' height='15' fill='%23674128'/><rect x='7' y='26' width='12' height='13' fill='%23895c38'/><rect x='7' y='26' width='12' height='1' fill='%23b88c60'/><rect x='7' y='38' width='12' height='1' fill='%237b5031'/><rect x='19' y='26' width='1' height='13' fill='%23b88c60'/><rect x='8' y='28' width='10' height='9' fill='%23a27249'/><rect x='20' y='23' width='2' height='2' fill='%23d1a94a'/><rect x='19' y='22' width='3' height='3' fill='%23b98e2f'/><rect x='20' y='23' width='1' height='1' fill='%23f6df94'/><rect x='21' y='23' width='1' height='8' fill='%23714d31'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-bear,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-dino,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-rabbit{
        background-color:transparent;border-color:transparent;box-shadow:none;
        padding:0;min-width:0;min-height:0;
        font-size:calc(2px * var(--cigh-deco-scale,1));
        background-repeat:no-repeat;background-position:center;background-size:contain;
        image-rendering:pixelated;
      }
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-bear>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-dino>span,
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-rabbit>span{font-size:0;line-height:0;}
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-bear{width:18em;height:20em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 22'><rect x='4' y='1' width='3' height='3' fill='%23755343'/><rect x='13' y='1' width='3' height='3' fill='%23755343'/><rect x='5' y='2' width='2' height='2' fill='%23d9b49a'/><rect x='13' y='2' width='2' height='2' fill='%23d9b49a'/><rect x='3' y='4' width='14' height='10' fill='%238d6a55'/><rect x='4' y='5' width='12' height='8' fill='%23b9957c'/><rect x='7' y='8' width='6' height='4' fill='%23efd9bf'/><rect x='6' y='6' width='2' height='2' fill='%234a332a'/><rect x='12' y='6' width='2' height='2' fill='%234a332a'/><rect x='9' y='8' width='2' height='2' fill='%2367463a'/><rect x='8' y='10' width='4' height='1' fill='%23d88895'/><rect x='5' y='14' width='10' height='6' fill='%23b9957c'/><rect x='3' y='15' width='3' height='4' fill='%23b9957c'/><rect x='14' y='15' width='3' height='4' fill='%23b9957c'/><rect x='4' y='20' width='3' height='2' fill='%238d6a55'/><rect x='13' y='20' width='3' height='2' fill='%238d6a55'/><rect x='1' y='15' width='2' height='4' fill='%238d6a55'/><rect x='17' y='15' width='2' height='4' fill='%238d6a55'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-dino{width:19em;height:20em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'><rect x='10' y='1' width='4' height='3' fill='%23527c44'/><rect x='9' y='3' width='6' height='3' fill='%23699658'/><rect x='7' y='5' width='9' height='7' fill='%237fb269'/><rect x='5' y='8' width='11' height='6' fill='%2391c27b'/><rect x='4' y='10' width='10' height='6' fill='%2391c27b'/><rect x='12' y='9' width='5' height='6' fill='%237fb269'/><rect x='16' y='10' width='3' height='3' fill='%237fb269'/><rect x='18' y='11' width='2' height='2' fill='%237fb269'/><rect x='11' y='6' width='2' height='2' fill='%2338522f'/><rect x='9' y='9' width='5' height='3' fill='%23cfe6b7'/><rect x='7' y='14' width='8' height='4' fill='%2391c27b'/><rect x='5' y='15' width='2' height='5' fill='%23527c44'/><rect x='11' y='15' width='2' height='5' fill='%23527c44'/><rect x='3' y='15' width='3' height='2' fill='%23527c44'/><rect x='2' y='16' width='2' height='2' fill='%23527c44'/><rect x='13' y='7' width='1' height='1' fill='%23e595a8'/><rect x='8' y='5' width='1' height='3' fill='%23527c44'/><rect x='6' y='6' width='1' height='3' fill='%23527c44'/><rect x='15' y='7' width='1' height='3' fill='%23527c44'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-plush-rabbit{width:18em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 24'><rect x='5' y='1' width='3' height='8' fill='%23eadcc8'/><rect x='12' y='1' width='3' height='8' fill='%23eadcc8'/><rect x='6' y='2' width='1' height='6' fill='%23efb5c8'/><rect x='13' y='2' width='1' height='6' fill='%23efb5c8'/><rect x='4' y='8' width='12' height='8' fill='%23efe4d4'/><rect x='5' y='9' width='10' height='6' fill='%23fbf6ee'/><rect x='6' y='10' width='2' height='2' fill='%23473a35'/><rect x='12' y='10' width='2' height='2' fill='%23473a35'/><rect x='9' y='11' width='2' height='2' fill='%23c98595'/><rect x='8' y='13' width='4' height='1' fill='%23e7b0bd'/><rect x='6' y='16' width='8' height='6' fill='%23efe4d4'/><rect x='4' y='17' width='3' height='4' fill='%23efe4d4'/><rect x='13' y='17' width='3' height='4' fill='%23efe4d4'/><rect x='5' y='22' width='3' height='2' fill='%23d7c5b0'/><rect x='12' y='22' width='3' height='2' fill='%23d7c5b0'/><rect x='8' y='18' width='4' height='3' fill='%23ffffff'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-twin{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='6' y='16' width='2' height='10' fill='%232f6d3c'/><rect x='14' y='15' width='2' height='11' fill='%232f6d3c'/><rect x='8' y='19' width='4' height='2' fill='%233a8146'/><rect x='12' y='20' width='4' height='2' fill='%233a8146'/><rect x='5' y='20' width='3' height='3' fill='%2355984e'/><rect x='14' y='21' width='4' height='3' fill='%2355984e'/><rect x='3' y='5' width='8' height='1' fill='%237d394a'/><rect x='2' y='6' width='10' height='2' fill='%237d394a'/><rect x='1' y='8' width='2' height='5' fill='%237d394a'/><rect x='3' y='8' width='8' height='1' fill='%237d394a'/><rect x='3' y='12' width='8' height='1' fill='%237d394a'/><rect x='11' y='8' width='1' height='4' fill='%237d394a'/><rect x='4' y='6' width='6' height='2' fill='%23a74e63'/><rect x='3' y='8' width='8' height='5' fill='%23d8798d'/><rect x='4' y='8' width='6' height='1' fill='%23efadbb'/><rect x='2' y='10' width='2' height='2' fill='%23b95f73'/><rect x='10' y='10' width='2' height='2' fill='%23b95f73'/><rect x='5' y='9' width='4' height='3' fill='%23f092a5'/><rect x='6' y='10' width='2' height='2' fill='%23f2d06e'/><rect x='11' y='3' width='8' height='1' fill='%237d394a'/><rect x='10' y='4' width='10' height='2' fill='%237d394a'/><rect x='9' y='6' width='2' height='5' fill='%237d394a'/><rect x='11' y='6' width='8' height='1' fill='%237d394a'/><rect x='11' y='10' width='8' height='1' fill='%237d394a'/><rect x='19' y='6' width='1' height='4' fill='%237d394a'/><rect x='12' y='4' width='6' height='2' fill='%23a74e63'/><rect x='11' y='6' width='8' height='5' fill='%23d8798d'/><rect x='12' y='6' width='6' height='1' fill='%23efadbb'/><rect x='10' y='8' width='2' height='2' fill='%23b95f73'/><rect x='18' y='8' width='2' height='2' fill='%23b95f73'/><rect x='13' y='7' width='4' height='3' fill='%23f092a5'/><rect x='14' y='8' width='2' height='2' fill='%23f2d06e'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-bell{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='10' y='6' width='2' height='20' fill='%23386d28'/><rect x='6' y='18' width='4' height='2' fill='%2344872f'/><rect x='12' y='14' width='4' height='2' fill='%2344872f'/><rect x='5' y='19' width='4' height='5' fill='%234d8e33'/><rect x='13' y='15' width='4' height='5' fill='%234d8e33'/><rect x='9' y='7' width='2' height='4' fill='%2344872f'/><rect x='11' y='8' width='3' height='2' fill='%2344872f'/><rect x='3' y='5' width='7' height='1' fill='%237a6c3d'/><rect x='2' y='6' width='9' height='1' fill='%237a6c3d'/><rect x='1' y='7' width='10' height='1' fill='%237a6c3d'/><rect x='1' y='8' width='1' height='5' fill='%237a6c3d'/><rect x='2' y='13' width='1' height='1' fill='%237a6c3d'/><rect x='9' y='13' width='1' height='1' fill='%237a6c3d'/><rect x='4' y='6' width='5' height='1' fill='%23987842'/><rect x='3' y='7' width='7' height='1' fill='%23b89f6a'/><rect x='2' y='8' width='8' height='5' fill='%23e7d7aa'/><rect x='3' y='8' width='6' height='1' fill='%23f3ead1'/><rect x='3' y='12' width='6' height='1' fill='%23cab884'/><rect x='2' y='13' width='2' height='1' fill='%23b89f6a'/><rect x='7' y='13' width='2' height='1' fill='%23b89f6a'/><rect x='11' y='3' width='7' height='1' fill='%237a6c3d'/><rect x='10' y='4' width='9' height='1' fill='%237a6c3d'/><rect x='10' y='5' width='9' height='1' fill='%237a6c3d'/><rect x='10' y='6' width='1' height='5' fill='%237a6c3d'/><rect x='18' y='6' width='1' height='5' fill='%237a6c3d'/><rect x='11' y='11' width='1' height='1' fill='%237a6c3d'/><rect x='17' y='11' width='1' height='1' fill='%237a6c3d'/><rect x='12' y='4' width='5' height='1' fill='%23987842'/><rect x='11' y='5' width='7' height='1' fill='%23b89f6a'/><rect x='11' y='6' width='8' height='5' fill='%23e7d7aa'/><rect x='12' y='6' width='6' height='1' fill='%23f3ead1'/><rect x='12' y='10' width='6' height='1' fill='%23cab884'/><rect x='11' y='11' width='2' height='1' fill='%23b89f6a'/><rect x='16' y='11' width='2' height='1' fill='%23b89f6a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blossom{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='10' y='11' width='2' height='15' fill='%233b7434'/><rect x='6' y='18' width='4' height='2' fill='%234d8d42'/><rect x='12' y='20' width='4' height='2' fill='%234d8d42'/><rect x='5' y='19' width='4' height='5' fill='%235aa150'/><rect x='13' y='21' width='4' height='4' fill='%235aa150'/><rect x='10' y='3' width='2' height='1' fill='%23774e85'/><rect x='9' y='4' width='4' height='1' fill='%23774e85'/><rect x='7' y='5' width='2' height='1' fill='%23774e85'/><rect x='13' y='5' width='2' height='1' fill='%23774e85'/><rect x='6' y='7' width='1' height='4' fill='%23774e85'/><rect x='7' y='6' width='3' height='1' fill='%23774e85'/><rect x='12' y='6' width='3' height='1' fill='%23774e85'/><rect x='15' y='7' width='1' height='4' fill='%23774e85'/><rect x='8' y='9' width='1' height='2' fill='%23774e85'/><rect x='13' y='9' width='1' height='2' fill='%23774e85'/><rect x='9' y='10' width='4' height='1' fill='%23774e85'/><rect x='10' y='4' width='2' height='3' fill='%23b16fbe'/><rect x='7' y='7' width='2' height='4' fill='%23c48bd0'/><rect x='13' y='7' width='2' height='4' fill='%23c48bd0'/><rect x='9' y='9' width='4' height='2' fill='%23d6a3de'/><rect x='8' y='6' width='2' height='2' fill='%23d6a3de'/><rect x='12' y='6' width='2' height='2' fill='%23d6a3de'/><rect x='9' y='5' width='4' height='1' fill='%23edd5f2'/><rect x='10' y='7' width='2' height='2' fill='%23f0df85'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-white{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='10' y='11' width='2' height='15' fill='%233a743a'/><rect x='6' y='19' width='4' height='2' fill='%234e8a43'/><rect x='12' y='18' width='4' height='2' fill='%234e8a43'/><rect x='5' y='20' width='4' height='4' fill='%235a9a50'/><rect x='13' y='19' width='4' height='4' fill='%235a9a50'/><rect x='10' y='3' width='2' height='1' fill='%23b9b7ae'/><rect x='9' y='4' width='4' height='1' fill='%23b9b7ae'/><rect x='7' y='5' width='2' height='1' fill='%23b9b7ae'/><rect x='13' y='5' width='2' height='1' fill='%23b9b7ae'/><rect x='6' y='7' width='1' height='3' fill='%23b9b7ae'/><rect x='7' y='6' width='3' height='1' fill='%23b9b7ae'/><rect x='12' y='6' width='3' height='1' fill='%23b9b7ae'/><rect x='15' y='7' width='1' height='3' fill='%23b9b7ae'/><rect x='8' y='10' width='1' height='2' fill='%23b9b7ae'/><rect x='13' y='10' width='1' height='2' fill='%23b9b7ae'/><rect x='9' y='11' width='4' height='1' fill='%23b9b7ae'/><rect x='10' y='4' width='2' height='3' fill='%23d8d8d0'/><rect x='7' y='7' width='3' height='3' fill='%23f2f1e8'/><rect x='12' y='7' width='3' height='3' fill='%23f2f1e8'/><rect x='9' y='10' width='4' height='2' fill='%23ffffff'/><rect x='8' y='6' width='2' height='2' fill='%23ffffff'/><rect x='12' y='6' width='2' height='2' fill='%23ffffff'/><rect x='9' y='5' width='4' height='1' fill='%23ffffff'/><rect x='10' y='8' width='2' height='2' fill='%23f0d96a'/><rect x='10' y='9' width='2' height='1' fill='%23c9a74a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-blue{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='10' y='10' width='2' height='16' fill='%23346f42'/><rect x='6' y='18' width='4' height='2' fill='%23488452'/><rect x='12' y='20' width='4' height='2' fill='%23488452'/><rect x='5' y='19' width='4' height='4' fill='%235a9a61'/><rect x='13' y='21' width='4' height='4' fill='%235a9a61'/><rect x='10' y='3' width='2' height='1' fill='%234466b0'/><rect x='9' y='4' width='4' height='1' fill='%234466b0'/><rect x='7' y='5' width='2' height='1' fill='%234466b0'/><rect x='13' y='5' width='2' height='1' fill='%234466b0'/><rect x='6' y='7' width='1' height='4' fill='%234466b0'/><rect x='7' y='6' width='3' height='1' fill='%234466b0'/><rect x='12' y='6' width='3' height='1' fill='%234466b0'/><rect x='15' y='7' width='1' height='4' fill='%234466b0'/><rect x='8' y='9' width='1' height='3' fill='%234466b0'/><rect x='13' y='9' width='1' height='3' fill='%234466b0'/><rect x='9' y='11' width='4' height='1' fill='%234466b0'/><rect x='10' y='4' width='2' height='3' fill='%235786d8'/><rect x='7' y='7' width='3' height='4' fill='%236fa2ee'/><rect x='12' y='7' width='3' height='4' fill='%236fa2ee'/><rect x='9' y='9' width='4' height='3' fill='%238bbcff'/><rect x='8' y='6' width='2' height='2' fill='%238bbcff'/><rect x='12' y='6' width='2' height='2' fill='%238bbcff'/><rect x='9' y='5' width='4' height='1' fill='%23cfe4ff'/><rect x='10' y='8' width='2' height='2' fill='%23ffe28a'/><rect x='10' y='9' width='2' height='1' fill='%23caa64a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-flower-sun{width:17em;height:21em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 28'><rect x='10' y='12' width='2' height='14' fill='%233b7434'/><rect x='6' y='19' width='4' height='2' fill='%234d8d42'/><rect x='12' y='20' width='4' height='2' fill='%234d8d42'/><rect x='5' y='20' width='4' height='4' fill='%235aa150'/><rect x='13' y='21' width='4' height='4' fill='%235aa150'/><rect x='10' y='2' width='2' height='1' fill='%23b57f2e'/><rect x='9' y='3' width='4' height='1' fill='%23b57f2e'/><rect x='7' y='4' width='2' height='1' fill='%23b57f2e'/><rect x='13' y='4' width='2' height='1' fill='%23b57f2e'/><rect x='5' y='7' width='4' height='1' fill='%23b57f2e'/><rect x='13' y='7' width='4' height='1' fill='%23b57f2e'/><rect x='6' y='11' width='3' height='3' fill='%23b57f2e'/><rect x='13' y='11' width='3' height='3' fill='%23b57f2e'/><rect x='10' y='3' width='2' height='4' fill='%23f5c84b'/><rect x='7' y='5' width='2' height='3' fill='%23f0b83e'/><rect x='13' y='5' width='2' height='3' fill='%23f0b83e'/><rect x='5' y='8' width='4' height='2' fill='%23f5c84b'/><rect x='13' y='8' width='4' height='2' fill='%23f5c84b'/><rect x='7' y='11' width='2' height='3' fill='%23d99532'/><rect x='13' y='11' width='2' height='3' fill='%23d99532'/><rect x='9' y='7' width='4' height='5' fill='%23805a2f'/><rect x='10' y='8' width='2' height='3' fill='%23a6783a'/><rect x='9' y='7' width='4' height='1' fill='%23c08b42'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-bush-berry{width:60em;height:26em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 28'><rect x='4' y='18' width='56' height='6' fill='%23264f24'/><rect x='2' y='15' width='60' height='8' fill='%2332642d'/><rect x='1' y='14' width='10' height='6' fill='%233b7335'/><rect x='8' y='11' width='12' height='8' fill='%2344813d'/><rect x='17' y='10' width='12' height='9' fill='%234d8d45'/><rect x='26' y='9' width='12' height='10' fill='%2357994f'/><rect x='35' y='10' width='12' height='9' fill='%234d8d45'/><rect x='44' y='11' width='12' height='8' fill='%2344813d'/><rect x='53' y='14' width='10' height='6' fill='%233b7335'/><rect x='10' y='9' width='8' height='3' fill='%2364aa57'/><rect x='18' y='8' width='8' height='3' fill='%236cb45f'/><rect x='27' y='7' width='10' height='3' fill='%2374be67'/><rect x='38' y='8' width='8' height='3' fill='%236cb45f'/><rect x='46' y='9' width='8' height='3' fill='%2364aa57'/><rect x='11' y='16' width='2' height='2' fill='%23e54848'/><rect x='12' y='15' width='1' height='1' fill='%23ffd0d0'/><rect x='20' y='13' width='2' height='2' fill='%23d83f3f'/><rect x='21' y='12' width='1' height='1' fill='%23ffd0d0'/><rect x='29' y='16' width='2' height='2' fill='%23e54848'/><rect x='30' y='15' width='1' height='1' fill='%23ffd0d0'/><rect x='38' y='14' width='2' height='2' fill='%23d83f3f'/><rect x='39' y='13' width='1' height='1' fill='%23ffd0d0'/><rect x='47' y='16' width='2' height='2' fill='%23e54848'/><rect x='48' y='15' width='1' height='1' fill='%23ffd0d0'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-fence-wood{width:72em;height:18em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 18'><rect x='3' y='4' width='4' height='12' fill='%238b613e'/><rect x='15' y='4' width='4' height='12' fill='%238b613e'/><rect x='27' y='4' width='4' height='12' fill='%238b613e'/><rect x='39' y='4' width='4' height='12' fill='%238b613e'/><rect x='51' y='4' width='4' height='12' fill='%238b613e'/><rect x='63' y='4' width='4' height='12' fill='%238b613e'/><rect x='2' y='3' width='6' height='1' fill='%23b78658'/><rect x='14' y='3' width='6' height='1' fill='%23b78658'/><rect x='26' y='3' width='6' height='1' fill='%23b78658'/><rect x='38' y='3' width='6' height='1' fill='%23b78658'/><rect x='50' y='3' width='6' height='1' fill='%23b78658'/><rect x='62' y='3' width='6' height='1' fill='%23b78658'/><rect x='4' y='7' width='60' height='3' fill='%239d6f47'/><rect x='4' y='11' width='60' height='3' fill='%239d6f47'/><rect x='4' y='7' width='60' height='1' fill='%23c18f62'/><rect x='4' y='11' width='60' height='1' fill='%23c18f62'/><rect x='4' y='9' width='60' height='1' fill='%23724d31'/><rect x='4' y='13' width='60' height='1' fill='%23724d31'/></svg>");}

      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-iv{width:40em;height:34em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 34'><rect x='0' y='0' width='40' height='34' fill='%23c9bfb0'/><rect x='1' y='1' width='38' height='32' fill='%23e8e0cf'/><rect x='1' y='1' width='38' height='1' fill='%23f5efe2'/><rect x='1' y='1' width='1' height='32' fill='%23f5efe2'/><rect x='38' y='1' width='1' height='32' fill='%23d3c7b3'/><rect x='1' y='32' width='38' height='1' fill='%23d3c7b3'/><rect x='4' y='4' width='32' height='26' fill='%23bdb1a0'/><rect x='5' y='5' width='30' height='24' fill='%23f6f1e6'/><rect x='5' y='5' width='30' height='1' fill='%23fdfaf2'/><rect x='5' y='5' width='1' height='24' fill='%23fdfaf2'/><rect x='17' y='22' width='6' height='5' fill='%23b8946a'/><rect x='18' y='23' width='4' height='1' fill='%23cda87c'/><rect x='15' y='16' width='2' height='7' fill='%23839a6e'/><rect x='19' y='15' width='2' height='8' fill='%23839a6e'/><rect x='23' y='16' width='2' height='7' fill='%23839a6e'/><rect x='13' y='13' width='4' height='4' fill='%23cf9aaa'/><rect x='13' y='13' width='4' height='1' fill='%23e0b8c2'/><rect x='14' y='14' width='2' height='2' fill='%23e8cf86'/><rect x='18' y='10' width='4' height='4' fill='%23b8a6cf'/><rect x='18' y='10' width='4' height='1' fill='%23ccc0e0'/><rect x='19' y='11' width='2' height='2' fill='%23e8cf86'/><rect x='23' y='12' width='4' height='4' fill='%23dca878'/><rect x='23' y='12' width='4' height='1' fill='%23e8c49a'/><rect x='24' y='13' width='2' height='2' fill='%23e8cf86'/><rect x='10' y='15' width='3' height='3' fill='%23c2d0a0'/><rect x='27' y='14' width='3' height='3' fill='%23c2d0a0'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-iv{width:30em;height:32em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 32'><rect width='30' height='32' fill='%23c9bfb0'/><rect x='1' y='1' width='28' height='30' fill='%23e8e0cf'/><rect x='1' y='1' width='28' height='1' fill='%23f5efe2'/><rect x='1' y='1' width='1' height='30' fill='%23f5efe2'/><rect x='1' y='30' width='28' height='1' fill='%23d3c7b3'/><rect x='4' y='4' width='22' height='24' fill='%23bdb1a0'/><rect x='5' y='5' width='20' height='22' fill='%23f6f1e6'/><rect x='5' y='5' width='20' height='1' fill='%23fdfaf2'/><rect x='5' y='5' width='1' height='22' fill='%23fdfaf2'/><rect x='5' y='26' width='20' height='1' fill='%23ece5d8'/><rect x='14' y='17' width='2' height='8' fill='%23839a6e'/><rect x='14' y='17' width='1' height='8' fill='%2396b088'/><rect x='10' y='20' width='4' height='1' fill='%23839a6e'/><rect x='16' y='19' width='4' height='1' fill='%23839a6e'/><rect x='9' y='19' width='2' height='2' fill='%2396b088'/><rect x='19' y='18' width='2' height='2' fill='%2396b088'/><rect x='11' y='9' width='8' height='8' fill='%23d49aae'/><rect x='11' y='9' width='8' height='2' fill='%23e6b8c6'/><rect x='12' y='8' width='6' height='1' fill='%23e6b8c6'/><rect x='12' y='16' width='6' height='1' fill='%23b87e8e'/><rect x='13' y='11' width='4' height='4' fill='%23ecd28a'/><rect x='14' y='12' width='2' height='2' fill='%23f2e2a4'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-iv{width:28em;height:34em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 34'><rect x='0' y='0' width='28' height='34' fill='%23c9bfb0'/><rect x='1' y='1' width='26' height='32' fill='%23e8e0cf'/><rect x='1' y='1' width='26' height='1' fill='%23f5efe2'/><rect x='1' y='1' width='1' height='32' fill='%23f5efe2'/><rect x='1' y='32' width='26' height='1' fill='%23d3c7b3'/><rect x='4' y='4' width='20' height='26' fill='%23bdb1a0'/><rect x='5' y='5' width='18' height='24' fill='%23f6f1e6'/><rect x='5' y='5' width='18' height='1' fill='%23fdfaf2'/><rect x='5' y='5' width='1' height='24' fill='%23fdfaf2'/><rect x='22' y='5' width='1' height='24' fill='%23f6f1e6'/><rect x='9' y='20' width='10' height='7' fill='%23c08a5e'/><rect x='9' y='20' width='10' height='1' fill='%23d4a074'/><rect x='8' y='19' width='12' height='2' fill='%23cf9868'/><rect x='13' y='13' width='2' height='7' fill='%23839a6e'/><rect x='10' y='14' width='3' height='2' fill='%2396b088'/><rect x='15' y='13' width='3' height='2' fill='%2396b088'/><rect x='11' y='10' width='3' height='3' fill='%23d49aae'/><rect x='11' y='10' width='3' height='1' fill='%23e6b8c6'/><rect x='15' y='11' width='3' height='3' fill='%23b8a6cf'/><rect x='15' y='11' width='3' height='1' fill='%23ccc0e0'/><rect x='13' y='8' width='2' height='2' fill='%23ecd28a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-iv{width:28em;height:32em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 32'><rect x='0' y='0' width='28' height='32' fill='%23c9bfb0'/><rect x='1' y='1' width='26' height='30' fill='%23e8e0cf'/><rect x='1' y='1' width='26' height='1' fill='%23f5efe2'/><rect x='1' y='1' width='1' height='30' fill='%23f5efe2'/><rect x='4' y='4' width='20' height='24' fill='%23bdb1a0'/><rect x='5' y='5' width='18' height='22' fill='%23faf6ee'/><rect x='5' y='5' width='18' height='1' fill='%23fdfaf2'/><rect x='9' y='8' width='1' height='14' fill='%23a8b87e'/><rect x='9' y='10' width='4' height='1' fill='%23a8b87e'/><rect x='6' y='13' width='4' height='1' fill='%23a8b87e'/><rect x='9' y='16' width='4' height='1' fill='%23a8b87e'/><rect x='8' y='8' width='3' height='2' fill='%23c98a9e'/><rect x='7' y='12' width='2' height='2' fill='%23c0a0d0'/><rect x='11' y='15' width='2' height='2' fill='%23d6b074'/><rect x='17' y='9' width='1' height='13' fill='%23a8b87e'/><rect x='17' y='11' width='4' height='1' fill='%23a8b87e'/><rect x='14' y='14' width='4' height='1' fill='%23a8b87e'/><rect x='16' y='8' width='3' height='2' fill='%23c0a0d0'/><rect x='19' y='12' width='2' height='2' fill='%23c98a9e'/><rect x='14' y='16' width='2' height='2' fill='%23d6b074'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-bouquet-mt{width:40em;height:34em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 34'><rect x='0' y='0' width='40' height='34' fill='%236e6258'/><rect x='1' y='1' width='38' height='32' fill='%239a8c7e'/><rect x='1' y='1' width='38' height='1' fill='%23b3a596'/><rect x='1' y='1' width='1' height='32' fill='%23b3a596'/><rect x='38' y='1' width='1' height='32' fill='%237e7064'/><rect x='1' y='32' width='38' height='1' fill='%237e7064'/><rect x='4' y='4' width='32' height='26' fill='%23857668'/><rect x='5' y='5' width='30' height='24' fill='%23ece4d6'/><rect x='5' y='5' width='30' height='1' fill='%23f6f1e6'/><rect x='5' y='5' width='1' height='24' fill='%23f6f1e6'/><rect x='17' y='22' width='6' height='5' fill='%23a88a64'/><rect x='18' y='23' width='4' height='1' fill='%23bf9c72'/><rect x='15' y='16' width='2' height='7' fill='%237e9270'/><rect x='19' y='15' width='2' height='8' fill='%237e9270'/><rect x='23' y='16' width='2' height='7' fill='%237e9270'/><rect x='13' y='13' width='4' height='4' fill='%23bf95a2'/><rect x='13' y='13' width='4' height='1' fill='%23d2adb8'/><rect x='14' y='14' width='2' height='2' fill='%23d9c182'/><rect x='18' y='10' width='4' height='4' fill='%23ad9ec2'/><rect x='18' y='10' width='4' height='1' fill='%23c2b6d8'/><rect x='19' y='11' width='2' height='2' fill='%23d9c182'/><rect x='23' y='12' width='4' height='4' fill='%23cf9f78'/><rect x='23' y='12' width='4' height='1' fill='%23dcb594'/><rect x='24' y='13' width='2' height='2' fill='%23d9c182'/><rect x='10' y='15' width='3' height='3' fill='%23aab487'/><rect x='27' y='14' width='3' height='3' fill='%23aab487'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-single-mt{width:30em;height:32em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 32'><rect x='0' y='0' width='30' height='32' fill='%236e6258'/><rect x='1' y='1' width='28' height='30' fill='%23968a7d'/><rect x='1' y='1' width='28' height='1' fill='%23b3a596'/><rect x='1' y='1' width='1' height='30' fill='%23b3a596'/><rect x='1' y='30' width='28' height='1' fill='%237e7064'/><rect x='4' y='4' width='22' height='24' fill='%23857668'/><rect x='5' y='5' width='20' height='22' fill='%23ece4d6'/><rect x='5' y='5' width='20' height='1' fill='%23f6f1e6'/><rect x='5' y='5' width='1' height='22' fill='%23f6f1e6'/><rect x='24' y='5' width='1' height='22' fill='%23ece4d6'/><rect x='14' y='17' width='2' height='8' fill='%237e9270'/><rect x='14' y='17' width='1' height='8' fill='%2396a888'/><rect x='10' y='20' width='4' height='1' fill='%237e9270'/><rect x='16' y='19' width='4' height='1' fill='%237e9270'/><rect x='9' y='19' width='2' height='2' fill='%2396a888'/><rect x='19' y='18' width='2' height='2' fill='%2396a888'/><rect x='11' y='9' width='8' height='8' fill='%23bf95a2'/><rect x='11' y='9' width='8' height='2' fill='%23d2adb8'/><rect x='12' y='8' width='6' height='1' fill='%23d2adb8'/><rect x='12' y='16' width='6' height='1' fill='%23a37e8a'/><rect x='13' y='11' width='4' height='4' fill='%23d9c182'/><rect x='14' y='12' width='2' height='2' fill='%23e6d29a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pot-mt{width:28em;height:34em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 34'><rect width='28' height='34' fill='%236e6258'/><rect x='1' y='1' width='26' height='32' fill='%239a8c7e'/><rect x='1' y='1' width='26' height='1' fill='%23b3a596'/><rect x='1' y='1' width='1' height='32' fill='%23b3a596'/><rect x='1' y='32' width='26' height='1' fill='%237e7064'/><rect x='4' y='4' width='20' height='26' fill='%23857668'/><rect x='5' y='5' width='18' height='24' fill='%23ece4d6'/><rect x='5' y='5' width='18' height='1' fill='%23f6f1e6'/><rect x='5' y='5' width='1' height='24' fill='%23f6f1e6'/><rect x='5' y='28' width='18' height='1' fill='%23ddd3c2'/><rect x='9' y='20' width='10' height='7' fill='%23b08560'/><rect x='8' y='19' width='12' height='2' fill='%23bd9069'/><rect x='9' y='20' width='10' height='1' fill='%23c49c75'/><rect x='13' y='13' width='2' height='7' fill='%237e9270'/><rect x='10' y='14' width='3' height='2' fill='%2396a888'/><rect x='15' y='13' width='3' height='2' fill='%2396a888'/><rect x='11' y='10' width='3' height='3' fill='%23bf95a2'/><rect x='11' y='10' width='3' height='1' fill='%23d2adb8'/><rect x='15' y='11' width='3' height='3' fill='%23ad9ec2'/><rect x='15' y='11' width='3' height='1' fill='%23c2b6d8'/><rect x='13' y='8' width='2' height='2' fill='%23d9c182'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-frame-pressed-mt{width:28em;height:32em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 32'><rect x='0' y='0' width='28' height='32' fill='%236e6258'/><rect x='1' y='1' width='26' height='30' fill='%239a8c7e'/><rect x='1' y='1' width='26' height='1' fill='%23b3a596'/><rect x='1' y='1' width='1' height='30' fill='%23b3a596'/><rect x='4' y='4' width='20' height='24' fill='%23857668'/><rect x='5' y='5' width='18' height='22' fill='%23f0ebe0'/><rect x='5' y='5' width='18' height='1' fill='%23f6f1e6'/><rect x='9' y='8' width='1' height='14' fill='%2398a878'/><rect x='9' y='10' width='4' height='1' fill='%2398a878'/><rect x='6' y='13' width='4' height='1' fill='%2398a878'/><rect x='9' y='16' width='4' height='1' fill='%2398a878'/><rect x='8' y='8' width='3' height='2' fill='%23b8899a'/><rect x='7' y='12' width='2' height='2' fill='%23a795c0'/><rect x='11' y='15' width='2' height='2' fill='%23c8a46e'/><rect x='17' y='9' width='1' height='13' fill='%2398a878'/><rect x='17' y='11' width='4' height='1' fill='%2398a878'/><rect x='14' y='14' width='4' height='1' fill='%2398a878'/><rect x='16' y='8' width='3' height='2' fill='%23a795c0'/><rect x='19' y='12' width='2' height='2' fill='%23b8899a'/><rect x='14' y='16' width='2' height='2' fill='%23c8a46e'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-swag{width:28em;height:40em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 40'><rect x='13' y='2' width='2' height='2' fill='%238a7a5c'/><rect x='10' y='4' width='8' height='1' fill='%23b8a07a'/><rect x='12' y='5' width='4' height='2' fill='%23a8946e'/><rect x='13' y='7' width='2' height='6' fill='%237a6a4c'/><rect x='11' y='8' width='2' height='8' fill='%238a7656'/><rect x='15' y='8' width='2' height='8' fill='%238a7656'/><rect x='9' y='10' width='2' height='9' fill='%237a6a4c'/><rect x='17' y='10' width='2' height='9' fill='%237a6a4c'/><rect x='7' y='13' width='2' height='8' fill='%23857448'/><rect x='19' y='13' width='2' height='8' fill='%23857448'/><rect x='12' y='13' width='4' height='5' fill='%23c98a9a'/><rect x='12' y='13' width='4' height='2' fill='%23dba6b2'/><rect x='9' y='16' width='3' height='4' fill='%23b08a6a'/><rect x='16' y='16' width='3' height='4' fill='%23b08a6a'/><rect x='10' y='19' width='3' height='5' fill='%23c7a6c0'/><rect x='10' y='19' width='3' height='2' fill='%23d8bcd2'/><rect x='15' y='19' width='3' height='5' fill='%23a89a6a'/><rect x='7' y='20' width='2' height='6' fill='%23967c4e'/><rect x='19' y='20' width='2' height='6' fill='%23967c4e'/><rect x='12' y='22' width='4' height='6' fill='%23bb6f7e'/><rect x='12' y='22' width='4' height='2' fill='%23cf8a98'/><rect x='9' y='24' width='3' height='6' fill='%23867044'/><rect x='16' y='24' width='3' height='6' fill='%23867044'/><rect x='11' y='27' width='2' height='6' fill='%237a6a4c'/><rect x='15' y='27' width='2' height='6' fill='%237a6a4c'/><rect x='13' y='29' width='2' height='7' fill='%238a7656'/><rect x='10' y='5' width='1' height='30' fill='%23c9b896'/><rect x='17' y='5' width='1' height='30' fill='%23c9b896'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-large{width:44em;height:38em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 40'><rect x='0' y='0' width='48' height='36' fill='%235a3c24'/><rect x='1' y='1' width='46' height='34' fill='%238a6342'/><rect x='1' y='1' width='46' height='1' fill='%23a87a52'/><rect x='3' y='3' width='42' height='28' fill='%23a9d4ea'/><rect x='3' y='3' width='42' height='7' fill='%23c0e3f2'/><rect x='5' y='5' width='5' height='1' fill='%23dcf0f8'/><rect x='30' y='4' width='6' height='1' fill='%23dcf0f8'/><rect x='3' y='10' width='42' height='6' fill='%235f8f4a'/><rect x='3' y='10' width='6' height='3' fill='%236fa055'/><rect x='10' y='9' width='7' height='4' fill='%236fa055'/><rect x='18' y='10' width='6' height='3' fill='%23567f42'/><rect x='25' y='9' width='7' height='4' fill='%236fa055'/><rect x='33' y='10' width='6' height='3' fill='%23567f42'/><rect x='39' y='9' width='6' height='4' fill='%236fa055'/><rect x='6' y='9' width='2' height='1' fill='%2382b568'/><rect x='13' y='8' width='2' height='1' fill='%2382b568'/><rect x='28' y='8' width='2' height='1' fill='%2382b568'/><rect x='3' y='15' width='42' height='16' fill='%237cb356'/><rect x='3' y='15' width='42' height='2' fill='%238cc266'/><rect x='3' y='26' width='42' height='5' fill='%236aa048'/><rect x='7' y='19' width='1' height='1' fill='%23f0e85a'/><rect x='14' y='21' width='1' height='1' fill='%23e87aa8'/><rect x='21' y='18' width='1' height='1' fill='%23ffffff'/><rect x='28' y='22' width='1' height='1' fill='%23c89af0'/><rect x='35' y='20' width='1' height='1' fill='%23f0e85a'/><rect x='41' y='19' width='1' height='1' fill='%23e87aa8'/><rect x='11' y='27' width='1' height='1' fill='%23ffffff'/><rect x='25' y='28' width='1' height='1' fill='%23e87aa8'/><rect x='18' y='25' width='1' height='1' fill='%23f0e85a'/><rect x='38' y='27' width='1' height='1' fill='%23ffffff'/><rect x='15' y='3' width='2' height='28' fill='%238a6342'/><rect x='15' y='3' width='1' height='28' fill='%23a87a52'/><rect x='31' y='3' width='2' height='28' fill='%238a6342'/><rect x='31' y='3' width='1' height='28' fill='%23a87a52'/><rect x='3' y='16' width='42' height='2' fill='%238a6342'/><rect x='3' y='16' width='42' height='1' fill='%23a87a52'/><rect x='0' y='31' width='48' height='2' fill='%236b4a30'/><rect x='0' y='33' width='48' height='4' fill='%239a6b42'/><rect x='0' y='33' width='48' height='1' fill='%23b08254'/><rect x='0' y='37' width='48' height='1' fill='%235a3c24'/><rect x='6' y='33' width='4' height='4' fill='%23c2607a'/><rect x='6' y='32' width='4' height='1' fill='%235f8f4a'/><rect x='38' y='32' width='2' height='5' fill='%23cfa0d8'/><rect x='38' y='32' width='2' height='1' fill='%23e0c0e8'/><rect x='20' y='34' width='3' height='3' fill='%23d8c49a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-small{width:30em;height:33em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 40'><rect x='0' y='0' width='36' height='36' fill='%235a3c24'/><rect x='1' y='1' width='34' height='34' fill='%238a6342'/><rect x='1' y='1' width='34' height='1' fill='%23a87a52'/><rect x='3' y='3' width='30' height='28' fill='%23a9d4ea'/><rect x='3' y='3' width='30' height='7' fill='%23c0e3f2'/><rect x='5' y='5' width='4' height='1' fill='%23dcf0f8'/><rect x='23' y='4' width='5' height='1' fill='%23dcf0f8'/><rect x='3' y='10' width='30' height='6' fill='%235f8f4a'/><rect x='3' y='10' width='5' height='3' fill='%236fa055'/><rect x='9' y='9' width='6' height='4' fill='%236fa055'/><rect x='16' y='10' width='5' height='3' fill='%23567f42'/><rect x='22' y='9' width='6' height='4' fill='%236fa055'/><rect x='28' y='10' width='5' height='3' fill='%23567f42'/><rect x='3' y='15' width='30' height='16' fill='%237cb356'/><rect x='3' y='15' width='30' height='2' fill='%238cc266'/><rect x='3' y='26' width='30' height='5' fill='%236aa048'/><rect x='6' y='19' width='1' height='1' fill='%23f0e85a'/><rect x='12' y='21' width='1' height='1' fill='%23e87aa8'/><rect x='18' y='18' width='1' height='1' fill='%23ffffff'/><rect x='24' y='22' width='1' height='1' fill='%23c89af0'/><rect x='29' y='20' width='1' height='1' fill='%23f0e85a'/><rect x='9' y='27' width='1' height='1' fill='%23ffffff'/><rect x='22' y='28' width='1' height='1' fill='%23e87aa8'/><rect x='15' y='25' width='1' height='1' fill='%23f0e85a'/><rect x='17' y='3' width='2' height='28' fill='%238a6342'/><rect x='17' y='3' width='1' height='28' fill='%23a87a52'/><rect x='3' y='16' width='30' height='2' fill='%238a6342'/><rect x='3' y='16' width='30' height='1' fill='%23a87a52'/><rect x='0' y='31' width='36' height='2' fill='%236b4a30'/><rect x='0' y='33' width='36' height='4' fill='%239a6b42'/><rect x='0' y='33' width='36' height='1' fill='%23b08254'/><rect x='0' y='37' width='36' height='1' fill='%235a3c24'/><rect x='5' y='33' width='4' height='4' fill='%23c2607a'/><rect x='5' y='32' width='4' height='1' fill='%235f8f4a'/><rect x='27' y='32' width='2' height='5' fill='%23cfa0d8'/><rect x='27' y='32' width='2' height='1' fill='%23e0c0e8'/><rect x='11' y='34' width='2' height='3' fill='%23d8c49a'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-window-curtain{width:44em;height:38em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 40'><rect x='10' y='2' width='28' height='34' fill='%235a3c24'/><rect x='11' y='3' width='26' height='33' fill='%238a6342'/><rect x='11' y='3' width='26' height='1' fill='%23a87a52'/><rect x='13' y='5' width='22' height='26' fill='%23a9d4ea'/><rect x='13' y='5' width='22' height='7' fill='%23c0e3f2'/><rect x='13' y='12' width='22' height='5' fill='%235f8f4a'/><rect x='13' y='12' width='6' height='3' fill='%236fa055'/><rect x='21' y='11' width='6' height='4' fill='%236fa055'/><rect x='29' y='12' width='6' height='3' fill='%23567f42'/><rect x='13' y='16' width='22' height='15' fill='%237cb356'/><rect x='13' y='16' width='22' height='2' fill='%238cc266'/><rect x='13' y='26' width='22' height='5' fill='%236aa048'/><rect x='17' y='20' width='1' height='1' fill='%23f0e85a'/><rect x='24' y='22' width='1' height='1' fill='%23e87aa8'/><rect x='30' y='19' width='1' height='1' fill='%23ffffff'/><rect x='20' y='27' width='1' height='1' fill='%23f0e85a'/><rect x='28' y='28' width='1' height='1' fill='%23c89af0'/><rect x='23' y='5' width='2' height='26' fill='%238a6342'/><rect x='23' y='5' width='1' height='26' fill='%23a87a52'/><rect x='13' y='17' width='22' height='2' fill='%238a6342'/><rect x='13' y='17' width='22' height='1' fill='%23a87a52'/><rect x='10' y='31' width='28' height='2' fill='%236b4a30'/><rect x='10' y='33' width='28' height='3' fill='%239a6b42'/><rect x='10' y='33' width='28' height='1' fill='%23b08254'/><rect x='2' y='1' width='44' height='2' fill='%235a4030'/><rect x='1' y='1' width='2' height='3' fill='%23e8d8b8'/><rect x='45' y='1' width='2' height='3' fill='%23e8d8b8'/><rect x='3' y='3' width='11' height='32' fill='%23eef2f8'/><rect x='4' y='3' width='1' height='32' fill='%23ffffff'/><rect x='7' y='3' width='1' height='32' fill='%23ffffff'/><rect x='10' y='3' width='1' height='32' fill='%23ffffff'/><rect x='6' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='9' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='12' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='3' y='3' width='11' height='1' fill='%23d3dde9'/><rect x='34' y='3' width='11' height='32' fill='%23eef2f8'/><rect x='35' y='3' width='1' height='32' fill='%23ffffff'/><rect x='38' y='3' width='1' height='32' fill='%23ffffff'/><rect x='41' y='3' width='1' height='32' fill='%23ffffff'/><rect x='36' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='39' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='44' y='3' width='1' height='32' fill='%23d3dde9'/><rect x='34' y='3' width='11' height='1' fill='%23d3dde9'/></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-sakura{width:104em;height:69em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 48' shape-rendering='crispEdges'><g fill='%23b56b88'><rect x='8' y='14' width='14' height='8'/><rect x='50' y='14' width='14' height='8'/><rect x='14' y='8' width='44' height='8'/><rect x='6' y='16' width='60' height='8'/><rect x='5' y='22' width='26' height='7'/><rect x='41' y='22' width='26' height='7'/><rect x='18' y='5' width='16' height='5'/><rect x='38' y='5' width='16' height='5'/><rect x='10' y='22' width='52' height='4'/><rect x='26' y='26' width='20' height='3'/></g><g fill='%23d98fab'><rect x='20' y='5' width='14' height='4'/><rect x='38' y='5' width='14' height='4'/><rect x='13' y='9' width='15' height='5'/><rect x='44' y='9' width='15' height='5'/><rect x='30' y='8' width='12' height='4'/><rect x='6' y='16' width='15' height='5'/><rect x='51' y='16' width='15' height='5'/><rect x='8' y='14' width='12' height='4'/><rect x='52' y='14' width='12' height='4'/><rect x='22' y='15' width='16' height='4'/><rect x='38' y='15' width='16' height='4'/><rect x='5' y='22' width='15' height='5'/><rect x='52' y='22' width='15' height='5'/><rect x='22' y='22' width='16' height='4'/><rect x='38' y='22' width='16' height='4'/><rect x='13' y='25' width='16' height='4'/><rect x='43' y='25' width='16' height='4'/></g><g fill='%23f0b4cc'><rect x='22' y='5' width='8' height='3'/><rect x='44' y='5' width='8' height='3'/><rect x='16' y='10' width='9' height='3'/><rect x='49' y='10' width='9' height='3'/><rect x='32' y='8' width='10' height='3'/><rect x='8' y='17' width='9' height='3'/><rect x='56' y='17' width='9' height='3'/><rect x='24' y='16' width='10' height='2'/><rect x='40' y='16' width='10' height='2'/><rect x='7' y='23' width='9' height='3'/><rect x='57' y='23' width='8' height='3'/><rect x='15' y='25' width='9' height='2'/><rect x='49' y='25' width='9' height='2'/></g><g fill='%23ffd4e4'><rect x='24' y='5' width='4' height='2'/><rect x='46' y='5' width='4' height='2'/><rect x='18' y='10' width='4' height='2'/><rect x='51' y='10' width='4' height='2'/><rect x='10' y='17' width='4' height='2'/><rect x='34' y='8' width='5' height='2'/></g><g fill='%23a05675'><rect x='30' y='17' width='16' height='2'/><rect x='18' y='19' width='10' height='2'/><rect x='46' y='19' width='10' height='2'/><rect x='24' y='25' width='14' height='2'/><rect x='40' y='25' width='14' height='2'/></g><g fill='%237a4a30'><rect x='33' y='27' width='6' height='14'/><rect x='28' y='29' width='6' height='3'/><rect x='40' y='28' width='6' height='3'/></g><rect x='34' y='27' width='3' height='14' fill='%238f5a3c'/><rect x='38' y='27' width='2' height='14' fill='%235e3a26'/><g fill='%237a4a30'><rect x='30' y='41' width='5' height='2'/><rect x='38' y='41' width='6' height='2'/><rect x='26' y='42' width='6' height='1'/><rect x='42' y='42' width='6' height='1'/></g><g fill='%23d98fab'><rect x='16' y='34' width='2' height='1'/><rect x='54' y='32' width='2' height='1'/><rect x='20' y='38' width='1' height='1'/><rect x='50' y='37' width='1' height='1'/></g></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-willow{width:114em;height:72em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 50' shape-rendering='crispEdges'><g fill='%236a9460'><rect x='6' y='14' width='16' height='8'/><rect x='58' y='14' width='16' height='8'/><rect x='16' y='8' width='48' height='8'/><rect x='5' y='16' width='70' height='6'/><rect x='22' y='5' width='18' height='4'/><rect x='40' y='5' width='18' height='4'/></g><g fill='%2388b478'><rect x='22' y='5' width='16' height='4'/><rect x='42' y='5' width='16' height='4'/><rect x='14' y='9' width='16' height='5'/><rect x='50' y='9' width='16' height='5'/><rect x='32' y='8' width='16' height='4'/><rect x='6' y='15' width='16' height='5'/><rect x='58' y='15' width='16' height='5'/><rect x='24' y='15' width='16' height='4'/><rect x='40' y='15' width='16' height='4'/></g><g fill='%23a8d090'><rect x='24' y='5' width='9' height='3'/><rect x='48' y='5' width='9' height='3'/><rect x='16' y='10' width='10' height='3'/><rect x='56' y='10' width='10' height='3'/><rect x='34' y='8' width='12' height='3'/><rect x='8' y='16' width='10' height='2'/><rect x='62' y='16' width='10' height='2'/></g><g fill='%23c8e8b0'><rect x='26' y='5' width='4' height='2'/><rect x='50' y='5' width='4' height='2'/><rect x='18' y='10' width='4' height='2'/><rect x='58' y='10' width='4' height='2'/></g><g fill='%235a8050'><rect x='7' y='22' width='4' height='14'/><rect x='14' y='21' width='3' height='11'/><rect x='21' y='20' width='3' height='15'/><rect x='28' y='21' width='3' height='10'/><rect x='35' y='20' width='3' height='13'/><rect x='42' y='20' width='3' height='10'/><rect x='49' y='20' width='3' height='15'/><rect x='56' y='21' width='3' height='11'/><rect x='63' y='21' width='3' height='14'/><rect x='70' y='22' width='4' height='13'/><rect x='31' y='22' width='2' height='8'/><rect x='47' y='22' width='2' height='8'/></g><g fill='%2388b478'><rect x='7' y='22' width='3' height='9'/><rect x='21' y='20' width='2' height='9'/><rect x='35' y='20' width='2' height='8'/><rect x='49' y='20' width='2' height='9'/><rect x='63' y='21' width='2' height='9'/><rect x='70' y='22' width='3' height='8'/></g><g fill='%23a8d090'><rect x='8' y='34' width='2' height='2'/><rect x='22' y='33' width='2' height='2'/><rect x='50' y='33' width='2' height='2'/><rect x='71' y='33' width='2' height='2'/></g><g fill='%237a4a30'><rect x='36' y='19' width='7' height='24'/><rect x='31' y='24' width='6' height='3'/><rect x='42' y='23' width='6' height='3'/></g><rect x='37' y='19' width='3' height='24' fill='%238f5a3c'/><rect x='41' y='19' width='2' height='24' fill='%235e3a26'/><g fill='%237a4a30'><rect x='33' y='43' width='5' height='2'/><rect x='41' y='43' width='6' height='2'/><rect x='29' y='44' width='6' height='1'/><rect x='45' y='44' width='6' height='1'/></g></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-maple{width:104em;height:69em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 48' shape-rendering='crispEdges'><g fill='%23bd7838'><rect x='8' y='12' width='14' height='8'/><rect x='50' y='12' width='14' height='8'/><rect x='14' y='7' width='44' height='8'/><rect x='6' y='14' width='60' height='8'/><rect x='5' y='20' width='26' height='7'/><rect x='41' y='20' width='26' height='7'/><rect x='18' y='4' width='16' height='5'/><rect x='38' y='4' width='16' height='5'/><rect x='10' y='22' width='52' height='4'/><rect x='26' y='26' width='20' height='3'/></g><g fill='%23e0993f'><rect x='20' y='4' width='14' height='4'/><rect x='38' y='4' width='14' height='4'/><rect x='13' y='8' width='15' height='5'/><rect x='44' y='8' width='15' height='5'/><rect x='30' y='6' width='12' height='4'/><rect x='6' y='14' width='15' height='5'/><rect x='51' y='14' width='15' height='5'/><rect x='8' y='12' width='12' height='4'/><rect x='52' y='12' width='12' height='4'/><rect x='22' y='14' width='16' height='4'/><rect x='38' y='14' width='16' height='4'/><rect x='5' y='20' width='15' height='5'/><rect x='52' y='20' width='15' height='5'/><rect x='22' y='20' width='16' height='4'/><rect x='38' y='20' width='16' height='4'/><rect x='13' y='24' width='16' height='4'/><rect x='43' y='24' width='16' height='4'/></g><g fill='%23f0c050'><rect x='22' y='4' width='8' height='3'/><rect x='44' y='4' width='8' height='3'/><rect x='16' y='9' width='9' height='3'/><rect x='49' y='9' width='9' height='3'/><rect x='32' y='6' width='10' height='3'/><rect x='8' y='15' width='9' height='3'/><rect x='56' y='15' width='9' height='3'/><rect x='24' y='15' width='10' height='2'/><rect x='40' y='15' width='10' height='2'/><rect x='7' y='21' width='9' height='3'/><rect x='57' y='21' width='8' height='3'/><rect x='15' y='24' width='9' height='2'/><rect x='49' y='24' width='9' height='2'/></g><g fill='%23f8dc88'><rect x='24' y='4' width='4' height='2'/><rect x='46' y='4' width='4' height='2'/><rect x='18' y='9' width='4' height='2'/><rect x='51' y='9' width='4' height='2'/><rect x='34' y='6' width='5' height='2'/></g><g fill='%23a85f28'><rect x='30' y='15' width='16' height='2'/><rect x='18' y='17' width='10' height='2'/><rect x='46' y='17' width='10' height='2'/><rect x='24' y='23' width='14' height='2'/><rect x='40' y='23' width='14' height='2'/></g><g fill='%237a4a30'><rect x='33' y='27' width='6' height='14'/><rect x='28' y='29' width='6' height='3'/><rect x='40' y='28' width='6' height='3'/></g><rect x='34' y='27' width='3' height='14' fill='%238f5a3c'/><rect x='38' y='27' width='2' height='14' fill='%235e3a26'/><g fill='%237a4a30'><rect x='30' y='41' width='5' height='2'/><rect x='38' y='41' width='6' height='2'/><rect x='26' y='42' width='6' height='1'/><rect x='42' y='42' width='6' height='1'/></g><g fill='%23e0993f'><rect x='16' y='34' width='2' height='1'/><rect x='54' y='32' width='2' height='1'/><rect x='20' y='38' width='1' height='1'/></g></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-tree-dream{width:104em;height:69em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 72 48' shape-rendering='crispEdges'><g fill='%237064a8'><rect x='8' y='13' width='14' height='8'/><rect x='50' y='13' width='14' height='8'/><rect x='14' y='7' width='44' height='8'/><rect x='6' y='15' width='60' height='8'/><rect x='5' y='21' width='26' height='7'/><rect x='41' y='21' width='26' height='7'/><rect x='18' y='4' width='16' height='5'/><rect x='38' y='4' width='16' height='5'/><rect x='10' y='23' width='52' height='4'/><rect x='26' y='27' width='20' height='3'/></g><g fill='%239488d0'><rect x='20' y='4' width='14' height='4'/><rect x='38' y='4' width='14' height='4'/><rect x='13' y='8' width='15' height='5'/><rect x='44' y='8' width='15' height='5'/><rect x='30' y='6' width='12' height='4'/><rect x='6' y='15' width='15' height='5'/><rect x='51' y='15' width='15' height='5'/><rect x='8' y='13' width='12' height='4'/><rect x='52' y='13' width='12' height='4'/><rect x='22' y='15' width='16' height='4'/><rect x='38' y='15' width='16' height='4'/><rect x='5' y='21' width='15' height='5'/><rect x='52' y='21' width='15' height='5'/><rect x='22' y='21' width='16' height='4'/><rect x='38' y='21' width='16' height='4'/><rect x='13' y='25' width='16' height='4'/><rect x='43' y='25' width='16' height='4'/></g><g fill='%23b8acec'><rect x='22' y='4' width='8' height='3'/><rect x='44' y='4' width='8' height='3'/><rect x='16' y='9' width='9' height='3'/><rect x='49' y='9' width='9' height='3'/><rect x='32' y='6' width='10' height='3'/><rect x='8' y='16' width='9' height='3'/><rect x='56' y='16' width='9' height='3'/><rect x='24' y='15' width='10' height='2'/><rect x='40' y='15' width='10' height='2'/><rect x='7' y='22' width='9' height='3'/><rect x='57' y='22' width='8' height='3'/></g><g fill='%23e4dcff'><rect x='24' y='4' width='4' height='2'/><rect x='46' y='4' width='4' height='2'/><rect x='18' y='9' width='4' height='2'/><rect x='34' y='6' width='5' height='2'/></g><g fill='%235a4e90'><rect x='30' y='16' width='16' height='2'/><rect x='18' y='18' width='10' height='2'/><rect x='46' y='18' width='10' height='2'/><rect x='24' y='24' width='14' height='2'/><rect x='40' y='24' width='14' height='2'/></g><g fill='%23a0ece0'><rect x='22' y='10' width='2' height='2'/><rect x='46' y='7' width='2' height='2'/><rect x='14' y='18' width='2' height='2'/><rect x='58' y='17' width='2' height='2'/><rect x='34' y='12' width='2' height='2'/><rect x='28' y='22' width='2' height='2'/><rect x='44' y='21' width='2' height='2'/></g><g fill='%237a4a30'><rect x='33' y='28' width='6' height='13'/><rect x='28' y='30' width='6' height='3'/><rect x='40' y='29' width='6' height='3'/></g><rect x='34' y='28' width='3' height='13' fill='%238f5a3c'/><rect x='38' y='28' width='2' height='13' fill='%235e3a26'/><g fill='%237a4a30'><rect x='30' y='41' width='5' height='2'/><rect x='38' y='41' width='6' height='2'/><rect x='26' y='42' width='6' height='1'/><rect x='42' y='42' width='6' height='1'/></g><g fill='%23a0ece0'><rect x='16' y='34' width='2' height='2'/><rect x='54' y='32' width='2' height='2'/></g></svg>");}
      .cigh-clean-room-prop.cigh-clean-deco-prop-moon-full{width:28em;height:28em;background-image:url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' shape-rendering='crispEdges'><circle cx='16' cy='16' r='14' fill='%23fff8dc' fill-opacity='.16'/><circle cx='16' cy='16' r='12.5' fill='%23f5dfa0'/><circle cx='16' cy='16' r='10.5' fill='%23ffeaa8'/><circle cx='16' cy='16' r='8.5' fill='%23fff3c7'/><circle cx='12' cy='11' r='3.5' fill='%23fffdf3' fill-opacity='.78'/><circle cx='20' cy='20' r='2' fill='%23f6df9a' fill-opacity='.55'/></svg>");}

      .cigh-clean-deco-editor {
        position: relative;
        z-index: 1;
        width: 100%;
        margin: calc(8px * var(--cigh-ui-font-scale, 1)) 0;
        border: 1px solid var(--cigh-border-soft);
        border-radius: calc(8px * var(--cigh-ui-font-scale, 1));
        background: linear-gradient(180deg, color-mix(in srgb, var(--cigh-bg-2) 96%, transparent), var(--cigh-bg-soft));
        padding: calc(8px * var(--cigh-ui-font-scale, 1));
        box-sizing: border-box;
        box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 6%, transparent);
      }
      .cigh-clean-deco-head {
        display: flex;
        align-items: center;
        gap: calc(5px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(7px * var(--cigh-ui-font-scale, 1));
        min-width: 0;
      }
      .cigh-clean-deco-title {
        margin-right:auto;
        min-width:0;
        color:var(--cigh-text);
        font:700 calc(10px * var(--cigh-ui-font-scale, 1))/1.1 "Courier New", Consolas, monospace;
        letter-spacing:.035em;
        white-space:nowrap;
      }
      .cigh-clean-deco-ticket {
        margin-right: 0;
        display: inline-flex;
        align-items: baseline;
        gap: calc(2px * var(--cigh-ui-font-scale, 1));
        padding: calc(2px * var(--cigh-ui-font-scale, 1)) calc(8px * var(--cigh-ui-font-scale, 1));
        border-radius: 999px;
        background: color-mix(in srgb, var(--cigh-accent) 16%, var(--cigh-bg-3));
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 34%, var(--cigh-border-soft));
        color: var(--cigh-accent);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(11px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        white-space: nowrap;
      }
      .cigh-clean-deco-ticket b { font-size: calc(10px * var(--cigh-ui-font-scale, 1)); }
      .cigh-clean-deco-ticket i { font-style: normal; font-size: calc(8px * var(--cigh-ui-font-scale, 1)); opacity: .75; }
      .cigh-clean-deco-ticket em {
        font-style: normal;
        margin-left: calc(4px * var(--cigh-ui-font-scale, 1));
        padding-left: calc(4px * var(--cigh-ui-font-scale, 1));
        border-left: 1px solid color-mix(in srgb, var(--cigh-accent) 32%, transparent);
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        color: color-mix(in srgb, var(--cigh-accent) 72%, var(--cigh-text-dim) 28%);
        opacity: .9;
      }
      .cigh-clean-deco-count {
        flex: 0 0 auto;
        color: color-mix(in srgb, var(--cigh-accent) 70%, var(--cigh-text) 30%);
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        letter-spacing: .02em;
        white-space: nowrap;
      }
      .cigh-clean-deco-mini-btn {
        flex: 0 0 auto;
        border: 1px solid var(--cigh-border-soft);
        border-radius: calc(6px * var(--cigh-ui-font-scale, 1));
        background: color-mix(in srgb, var(--cigh-fill) 80%, transparent);
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        padding: calc(3px * var(--cigh-ui-font-scale, 1)) calc(8px * var(--cigh-ui-font-scale, 1));
        cursor: pointer;
        transition: transform .08s ease, filter .12s ease;
      }
      .cigh-clean-deco-mini-btn:active { transform: translateY(1px); }
      .cigh-clean-deco-mini-btn.ghost { opacity: .82; }
      .cigh-clean-deco-mini-btn.gacha {
        color: var(--cigh-bg);
        font-weight: 700;
        border-color: color-mix(in srgb, var(--cigh-accent) 60%, #000 10%);
        background: linear-gradient(180deg, color-mix(in srgb, var(--cigh-accent) 92%, #fff 8%), var(--cigh-accent));
        box-shadow: 0 1px 0 color-mix(in srgb, var(--cigh-accent) 55%, #000 45%);
      }
      .cigh-clean-deco-mini-btn.gacha.off { filter: grayscale(.5); opacity: .55; }
      .cigh-clean-deco-tabs {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: calc(4px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(6px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-deco-tab {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: calc(6px * var(--cigh-ui-font-scale, 1));
        background: var(--cigh-bg-3);
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        padding: calc(5px * var(--cigh-ui-font-scale, 1)) calc(2px * var(--cigh-ui-font-scale, 1));
        cursor: pointer;
      }
      .cigh-clean-deco-tab-icon { font-size: calc(10px * var(--cigh-ui-font-scale, 1)); line-height: 1; opacity: .85; }
      .cigh-clean-deco-tab-count {
        min-width: calc(14px * var(--cigh-ui-font-scale, 1));
        padding: 0 calc(3px * var(--cigh-ui-font-scale, 1));
        border-radius: 999px;
        background: color-mix(in srgb, var(--cigh-fill) 70%, transparent);
        color: var(--cigh-text-faint);
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        line-height: 1.5;
      }
      .cigh-clean-deco-tab.on {
        color: var(--cigh-accent);
        border-color: color-mix(in srgb, var(--cigh-accent) 52%, var(--cigh-border-soft));
        background: color-mix(in srgb, var(--cigh-accent) 12%, var(--cigh-bg-3));
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 20%, transparent);
      }
      .cigh-clean-deco-tab.on .cigh-clean-deco-tab-count {
        background: color-mix(in srgb, var(--cigh-accent) 24%, transparent);
        color: var(--cigh-accent);
      }
      .cigh-clean-deco-shelf {
        display: flex;
        align-items: stretch;
        gap: calc(5px * var(--cigh-ui-font-scale, 1));
        overflow-x: auto;
        overflow-y: hidden;
        padding: calc(1px * var(--cigh-ui-font-scale, 1)) calc(1px * var(--cigh-ui-font-scale, 1)) calc(4px * var(--cigh-ui-font-scale, 1));
        scrollbar-width: thin;
        scrollbar-color: var(--cigh-border) transparent;
      }
      .cigh-clean-deco-shelf::-webkit-scrollbar { height: calc(4px * var(--cigh-ui-font-scale, 1)); }
      .cigh-clean-deco-shelf::-webkit-scrollbar-thumb { background: var(--cigh-border); border-radius: 999px; }
      .cigh-clean-deco-item {
        position: relative;
        flex: 0 0 calc(48px * var(--cigh-ui-font-scale, 1));
        min-height: calc(50px * var(--cigh-ui-font-scale, 1));
        padding: calc(6px * var(--cigh-ui-font-scale, 1)) calc(3px * var(--cigh-ui-font-scale, 1)) calc(5px * var(--cigh-ui-font-scale, 1));
        border: 1px solid var(--cigh-border-soft);
        border-radius: calc(7px * var(--cigh-ui-font-scale, 1));
        background: var(--cigh-bg-2);
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        cursor: pointer;
        display: grid;
        grid-template-rows: 1fr auto;
        place-items: center;
        gap: calc(3px * var(--cigh-ui-font-scale, 1));
        overflow: hidden;
        transition: transform .08s ease, border-color .12s ease;
      }
      .cigh-clean-deco-item:active { transform: translateY(1px) scale(.97); }
      .cigh-clean-deco-rank-dot {
        position: absolute;
        top: calc(4px * var(--cigh-ui-font-scale, 1));
        left: calc(4px * var(--cigh-ui-font-scale, 1));
        width: calc(5px * var(--cigh-ui-font-scale, 1));
        height: calc(5px * var(--cigh-ui-font-scale, 1));
        border-radius: 999px;
        background: var(--deco-rank-color, var(--cigh-text-dim));
        box-shadow: 0 0 5px color-mix(in srgb, var(--deco-rank-color, transparent) 60%, transparent);
      }
      .cigh-clean-deco-item.rank-SR,
      .cigh-clean-deco-item.rank-SSR { border-color: color-mix(in srgb, var(--deco-rank-color) 40%, var(--cigh-border-soft)); }
      .cigh-clean-deco-item.rank-SSR { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--deco-rank-color) 18%, transparent); }
      .cigh-clean-deco-icon {
        font-size: calc(16px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
      }
      .cigh-clean-deco-icon-img {
        width: calc(26px * var(--cigh-ui-font-scale, 1));
        height: calc(26px * var(--cigh-ui-font-scale, 1));
        object-fit: contain;
        image-rendering: auto;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      .cigh-clean-deco-name {
        max-width: calc(44px * var(--cigh-ui-font-scale, 1));
        overflow: hidden;
        white-space: nowrap;
        text-overflow: clip;
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        line-height: 1.15;
        color: color-mix(in srgb, var(--cigh-text-soft) 78%, var(--cigh-accent) 22%);
      }
      .cigh-clean-deco-item-qty {
        position: absolute;
        bottom: calc(3px * var(--cigh-ui-font-scale, 1));
        right: calc(3px * var(--cigh-ui-font-scale, 1));
        padding: 0 calc(3px * var(--cigh-ui-font-scale, 1));
        border-radius: 999px;
        font-size: calc(7px * var(--cigh-ui-font-scale, 1));
        line-height: 1.4;
        color: var(--cigh-accent);
        background: color-mix(in srgb, #0a0d0b 78%, transparent);
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 30%, var(--cigh-border-soft));
      }
      .cigh-clean-deco-item.on {
        color: var(--cigh-accent);
        border-color: var(--cigh-accent);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 28%, transparent),
          0 0 7px color-mix(in srgb, var(--cigh-accent) 30%, transparent);
      }
      .cigh-clean-deco-equipped-dot {
        position:absolute;
        top:calc(4px * var(--cigh-ui-font-scale, 1));
        right:calc(4px * var(--cigh-ui-font-scale, 1));
        width:calc(6px * var(--cigh-ui-font-scale, 1));
        height:calc(6px * var(--cigh-ui-font-scale, 1));
        border-radius:999px;
        background:var(--cigh-accent);
        box-shadow:0 0 0 1px color-mix(in srgb,var(--cigh-bg) 70%,transparent), 0 0 7px var(--cigh-accent-soft);
        z-index:4;
      }
      .cigh-clean-deco-empty,
      .cigh-clean-deco-help { color: var(--cigh-text-dim); font-size: calc(8.5px * var(--cigh-ui-font-scale, 1)); line-height: 1.4; }
      .cigh-clean-deco-empty {
        flex: 1;
        display: grid;
        place-items: center;
        min-height: calc(50px * var(--cigh-ui-font-scale, 1));
        text-align: center;
      }
      .cigh-clean-deco-help { margin-top: calc(6px * var(--cigh-ui-font-scale, 1)); }

      .cigh-clean-custom-pixel-img { image-rendering: pixelated !important; }
      .cigh-clean-deco-custom-badge {
        position: absolute;
        left: calc(12px * var(--cigh-ui-font-scale, 1));
        top: calc(4px * var(--cigh-ui-font-scale, 1));
        font-size: calc(5.5px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
        letter-spacing: -.02em;
        color: var(--deco-rank-color);
        opacity: .9;
      }
      .cigh-clean-deco-custom-edit {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: calc(14px * var(--cigh-ui-font-scale, 1));
        height: calc(14px * var(--cigh-ui-font-scale, 1));
        display: grid;
        place-items: center;
        border: 1px solid color-mix(in srgb, var(--deco-rank-color) 42%, var(--cigh-border-soft));
        border-radius: 4px;
        background: color-mix(in srgb, var(--cigh-bg) 86%, transparent);
        color: var(--deco-rank-color);
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        z-index: 3;
      }
      .cigh-clean-deco-actions {
        display:flex;
        align-items:center;
        gap:calc(4px * var(--cigh-ui-font-scale, 1));
        margin-top:calc(6px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-deco-action {
        min-height:calc(28px * var(--cigh-ui-font-scale, 1));
        padding:0 calc(8px * var(--cigh-ui-font-scale, 1));
        border:1px solid var(--cigh-border-soft);
        border-radius:calc(6px * var(--cigh-ui-font-scale, 1));
        background:var(--cigh-bg-2);
        color:var(--cigh-text-soft);
        font:700 calc(8px * var(--cigh-ui-font-scale, 1))/1 "Courier New", Consolas, monospace;
        cursor:pointer;
        white-space:nowrap;
      }
      .cigh-clean-deco-action.gacha {
        color:var(--cigh-bg);
        border-color:color-mix(in srgb,var(--cigh-accent) 58%,#000 10%);
        background:var(--cigh-accent);
      }
      .cigh-clean-deco-action.gacha.off { filter:grayscale(.5); opacity:.55; }
      .cigh-clean-deco-action.ghost { margin-left:auto; color:var(--cigh-text-dim); background:transparent; }
      .cigh-clean-custom-launch {
        display: flex;
        align-items: center;
        gap: calc(4px * var(--cigh-ui-font-scale, 1));
        margin: calc(5px * var(--cigh-ui-font-scale, 1)) 0;
      }
      .cigh-clean-custom-launch button {
        min-height: calc(23px * var(--cigh-ui-font-scale, 1));
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 45%, var(--cigh-border-soft));
        border-radius: calc(5px * var(--cigh-ui-font-scale, 1));
        background: color-mix(in srgb, var(--cigh-accent) 8%, var(--cigh-bg-2));
        color: color-mix(in srgb, var(--cigh-accent) 78%, var(--cigh-text));
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(7.5px * var(--cigh-ui-font-scale, 1));
        padding: 0 calc(6px * var(--cigh-ui-font-scale, 1));
        cursor: pointer;
      }
      .cigh-clean-custom-launch span {
        margin-left: auto;
        color: var(--cigh-text-dim);
        font-size: calc(7px * var(--cigh-ui-font-scale, 1));
      }

      /* ── Custom pixel editor / importer ── */
      .cigh-clean-custom-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 12px;
        background: rgba(5, 7, 9, .72);
        backdrop-filter: blur(3px);
        font-family: "Courier New", Consolas, monospace;
      }
      .cigh-clean-custom-dialog {
        width: min(calc(330px + var(--custom-room-preview-size, 252px) + 34px), calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow: auto;
        box-sizing: border-box;
        padding: 10px;
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 44%, var(--cigh-border));
        border-radius: 10px;
        background: var(--cigh-bg);
        color: var(--cigh-text);
        box-shadow: var(--cigh-shadow-panel), inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 10%, transparent);
      }
      .cigh-clean-custom-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .cigh-clean-custom-head b { color: var(--cigh-accent); font-size: 12px; letter-spacing: .08em; }
      .cigh-clean-custom-head span { color: var(--cigh-text-dim); font-size: 8px; }
      .cigh-clean-custom-head button {
        margin-left: auto;
        border: 0;
        background: transparent;
        color: var(--cigh-text-dim);
        font-size: 18px;
        cursor: pointer;
      }
      .cigh-clean-custom-meta { display: flex; gap: 7px; align-items: center; margin-bottom: 8px; }
      .cigh-clean-custom-meta input {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 5px;
        background: var(--cigh-bg-2);
        color: var(--cigh-text);
        font: 10px/1.2 "Courier New", Consolas, monospace;
        padding: 6px 7px;
      }
      .cigh-clean-custom-gridpick { display: flex; gap: 3px; }
      .cigh-clean-custom-gridpick button,
      .cigh-clean-custom-tools button,
      .cigh-clean-custom-layerbar button,
      .cigh-clean-custom-selectionbar button,
      .cigh-clean-custom-colorrow button,
      .cigh-clean-custom-zoom button,
      .cigh-clean-custom-actions button {
        border: 1px solid var(--cigh-border-soft);
        border-radius: 5px;
        background: var(--cigh-bg-2);
        color: var(--cigh-text-soft);
        font: 8.5px/1 "Courier New", Consolas, monospace;
        padding: 6px 7px;
        cursor: pointer;
      }
      .cigh-clean-custom-gridpick button.on,
      .cigh-clean-custom-tools button.on,
      .cigh-clean-custom-layerbar button.on,
      .cigh-clean-custom-zoom button.on { border-color: var(--cigh-accent); color: var(--cigh-accent); background: color-mix(in srgb, var(--cigh-accent) 10%, var(--cigh-bg-2)); }
      .cigh-clean-custom-gridpick button:disabled { opacity: .45; cursor: default; }
      .cigh-clean-custom-stage-row {
        display: grid;
        grid-template-columns: 304px var(--custom-room-preview-size, 252px);
        justify-content: center;
        align-items: start;
        gap: 12px;
        margin-bottom: 8px;
      }
      .cigh-clean-custom-draw-pane { min-width: 0; width:304px; }
      .cigh-clean-custom-canvas-wrap {
        width: 288px;
        max-width: 288px;
        height: 288px;
        margin: 0 auto;
        border: 1px solid var(--cigh-border);
        background: var(--cigh-bg-soft);
        overflow: auto;
        overscroll-behavior: contain;
        touch-action: none;
        scrollbar-width: thin;
      }
      .cigh-clean-custom-canvas-stage {
        position: relative;
        width: 256px;
        height: 256px;
        flex: none;
        box-sizing: content-box;
        background-color: #f3f3f3;
        background-image:
          linear-gradient(45deg,#d9d9d9 25%,transparent 25%),
          linear-gradient(-45deg,#d9d9d9 25%,transparent 25%),
          linear-gradient(45deg,transparent 75%,#d9d9d9 75%),
          linear-gradient(-45deg,transparent 75%,#d9d9d9 75%);
        background-size: calc(var(--custom-cell-px, 8px) * 2) calc(var(--custom-cell-px, 8px) * 2);
        background-position: 0 0, 0 var(--custom-cell-px, 8px), var(--custom-cell-px, 8px) calc(var(--custom-cell-px, 8px) * -1), calc(var(--custom-cell-px, 8px) * -1) 0;
        outline: 1px solid var(--cigh-border);
        outline-offset: -1px;
        image-rendering: pixelated;
      }
      .cigh-clean-custom-canvas-stage canvas {
        position: absolute;
        left: 0;
        top: 0;
        display: block;
        width: 256px;
        height: 256px;
        image-rendering: pixelated;
        cursor: none;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      .cigh-clean-custom-canvas-stage canvas.cigh-clean-custom-lasso-cursor {
        cursor: crosshair;
      }
      .cigh-clean-custom-canvas-wrap.is-panning,
      .cigh-clean-custom-canvas-wrap.is-panning canvas { cursor: grabbing !important; }
      .cigh-clean-custom-grid-overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
        box-sizing: border-box;
        pointer-events: none;
        border-right: 1px solid rgba(40,40,40,.58);
        border-bottom: 1px solid rgba(40,40,40,.58);
        background-image:
          linear-gradient(to right, rgba(40,40,40,.58) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(40,40,40,.58) 1px, transparent 1px);
        background-size: var(--custom-cell-px, 8px) var(--custom-cell-px, 8px);
        background-position: 0 0;
        image-rendering: pixelated;
      }
      .cigh-clean-custom-selection-canvas {
        position:absolute !important;
        inset:0;
        z-index:3;
        pointer-events:none !important;
        background:transparent !important;
      }
      .cigh-clean-custom-cell-cursor {
        position: absolute;
        z-index: 4;
        box-sizing: border-box;
        pointer-events: none;
        outline: 1px solid var(--cigh-accent);
        outline-offset: -1px;
        background: color-mix(in srgb, var(--cigh-accent) 16%, transparent);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.58), 0 0 0 1px rgba(0,0,0,.45);
      }
      .cigh-clean-custom-cell-cursor[hidden] { display: none; }
      .cigh-clean-custom-zoom {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        margin-top: 6px;
      }
      .cigh-clean-custom-zoom > span {
        margin-right: 2px;
        color: var(--cigh-text-dim);
        font-size: 7px;
        letter-spacing: .06em;
      }
      .cigh-clean-custom-zoom button { padding: 5px 6px; }
      .cigh-clean-custom-pan-note {
        margin-top: 4px;
        text-align: center;
        color: var(--cigh-text-dim);
        font-size: 6.8px;
        line-height: 1.35;
      }
      .cigh-clean-custom-room-preview-box {
        width: var(--custom-room-preview-size, 252px);
        min-width: 0;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 7px;
        background: var(--cigh-bg-2);
        padding: 7px;
        box-sizing: border-box;
      }
      .cigh-clean-custom-room-preview-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 6px;
        color: var(--cigh-text-faint);
        font-size: 7.5px;
        letter-spacing: .04em;
      }
      .cigh-clean-custom-room-preview-head b {
        color: var(--cigh-accent);
        font-size: 8px;
      }
      .cigh-clean-custom-room-preview {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        border: 1px solid var(--cigh-border);
        background: var(--cigh-bg-soft);
        image-rendering: pixelated;
        box-sizing: border-box;
      }
      .cigh-clean-custom-room-preview .cigh-clean-room-props,
      .cigh-clean-custom-room-preview .cigh-clean-room-prop {
        pointer-events: none !important;
      }
      .cigh-clean-custom-room-item {
        position: absolute;
        z-index: 7;
        transform: translate(-50%, -50%);
        display: grid;
        place-items: center;
        outline: 1px dashed color-mix(in srgb, var(--cigh-accent) 38%, transparent);
        outline-offset: 2px;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      .cigh-clean-custom-room-item.dragging { cursor: grabbing; outline-color: var(--cigh-accent); }
      .cigh-clean-custom-room-item canvas {
        display: block;
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
        pointer-events: none;
      }
      .cigh-clean-custom-room-preview-note {
        margin-top: 5px;
        color: var(--cigh-text-dim);
        font-size: 6.8px;
        line-height: 1.35;
        word-break: keep-all;
      }
      .cigh-clean-custom-tools,
      .cigh-clean-custom-colorrow,
      .cigh-clean-custom-actions { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:6px; }
      .cigh-clean-custom-layerbar,
      .cigh-clean-custom-selectionbar {
        display:flex;
        align-items:center;
        gap:4px;
        margin-top:5px;
        min-width:0;
      }
      .cigh-clean-custom-layerbar > span,
      .cigh-clean-custom-selectionbar > span {
        flex:0 0 auto;
        color:var(--cigh-text-faint);
        font-size:7px;
        letter-spacing:.06em;
      }
      .cigh-clean-custom-layerchips { display:flex; gap:3px; min-width:0; flex:1; overflow-x:auto; scrollbar-width:none; }
      .cigh-clean-custom-layerchips::-webkit-scrollbar { display:none; }
      .cigh-clean-custom-layer-chip-wrap { flex:0 0 auto; display:inline-flex; gap:2px; min-width:0; }
      .cigh-clean-custom-layer-eye { flex:0 0 auto; min-width:25px !important; padding-left:5px !important; padding-right:5px !important; font-size:8px !important; }
      .cigh-clean-custom-layer-chip {
        flex:0 1 auto;
        min-width:58px;
        max-width:118px;
        display:inline-flex;
        align-items:center;
      }
      .cigh-clean-custom-layer-chip .layer-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cigh-clean-custom-layer-chip.muted { opacity:.5; }
      .cigh-clean-custom-layerbar button:disabled,
      .cigh-clean-custom-selectionbar button:disabled { opacity:.35; cursor:default; }
      .cigh-clean-custom-selectionbar[hidden] { display:none !important; }
      .cigh-clean-custom-selectionbar { padding:4px; border:1px solid var(--cigh-border-faint); border-radius:6px; background:color-mix(in srgb,var(--cigh-bg-2) 82%,transparent); }
      .cigh-clean-custom-selectionbar > span b { color:var(--cigh-accent); }
      .cigh-clean-custom-colorrow label,
      .cigh-clean-custom-size label { display:flex; align-items:center; gap:6px; color:var(--cigh-text-dim); font-size:8.5px; }
      .cigh-clean-custom-colorrow input[type="color"] { width:30px; height:24px; padding:0; border:1px solid var(--cigh-border-soft); background:transparent; }
      .cigh-clean-custom-palette {
        margin-top: 7px;
        padding: 6px;
        border: 1px solid var(--cigh-border-faint);
        border-radius: 6px;
        background: color-mix(in srgb, var(--cigh-bg-2) 86%, transparent);
      }
      .cigh-clean-custom-palette-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 5px;
        color: var(--cigh-text-faint);
        font-size: 7px;
        letter-spacing: .05em;
      }
      .cigh-clean-custom-palette-head em { color: var(--cigh-text-dim); font-style: normal; letter-spacing: 0; }
      .cigh-clean-custom-swatches {
        display: grid;
        grid-template-columns: repeat(13, minmax(0, 1fr));
        gap: 3px;
      }
      .cigh-clean-custom-swatches button {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        min-width: 0;
        padding: 0;
        border: 1px solid color-mix(in srgb, var(--cigh-border) 80%, #000);
        border-radius: 3px;
        background: var(--swatch);
        cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,.10);
      }
      .cigh-clean-custom-swatches button:hover { transform: translateY(-1px); }
      .cigh-clean-custom-swatches button.on {
        outline: 2px solid var(--cigh-accent);
        outline-offset: 1px;
        z-index: 1;
      }
      .cigh-clean-custom-size { margin-top:7px; }
      .cigh-clean-custom-size input[type="range"] { width:150px; }
      .cigh-clean-custom-size b { color:var(--cigh-accent); font-size:8px; }
      .cigh-clean-custom-actions { justify-content:flex-end; margin-top:9px; }
      .cigh-clean-custom-actions button.primary { border-color:var(--cigh-accent); color:var(--cigh-accent); background:color-mix(in srgb, var(--cigh-accent) 7%, var(--cigh-bg-2)); }
      .cigh-clean-custom-actions button.danger { margin-right:auto; border-color:#d66b75; color:#d66b75; }
      .cigh-clean-custom-actions button:disabled { opacity:.4; cursor:default; }
      .cigh-clean-custom-note { margin-top:8px; color:var(--cigh-text-dim); font-size:7.5px; line-height:1.45; }
      .cigh-clean-custom-dialog.compact-import { width:min(520px, calc(100vw - 24px)); }
      .cigh-clean-custom-import-row {
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:6px;
        align-items:center;
      }
      .cigh-clean-custom-code {
        width:100%;
        height:32px;
        min-height:32px;
        box-sizing:border-box;
        border:1px solid var(--cigh-border-soft);
        border-radius:6px;
        background:var(--cigh-bg-2);
        color:var(--cigh-text-soft);
        padding:0 9px;
        font:8px/1 "Courier New", Consolas, monospace;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .cigh-clean-custom-code:focus {
        outline:none;
        border-color:color-mix(in srgb,var(--cigh-accent) 58%,var(--cigh-border-soft));
        box-shadow:0 0 0 2px color-mix(in srgb,var(--cigh-accent) 9%,transparent);
      }
      .cigh-clean-custom-import-row > button {
        height:32px;
        white-space:nowrap;
        border:1px solid var(--cigh-accent);
        border-radius:6px;
        background:color-mix(in srgb,var(--cigh-accent) 7%,var(--cigh-bg-2));
        color:var(--cigh-accent);
        font:8px/1 "Courier New", Consolas, monospace;
        padding:0 10px;
        cursor:pointer;
      }
      .cigh-clean-custom-import-row > button:disabled { opacity:.4; cursor:default; }
      .cigh-clean-custom-import-preview {
        min-height:50px;
        margin-top:7px;
        border:1px dashed var(--cigh-border-soft);
        border-radius:6px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        color:var(--cigh-text-dim);
        font-size:8px;
        padding:6px 8px;
        box-sizing:border-box;
      }
      .cigh-clean-custom-import-preview.compact { justify-content:flex-start; }
      .cigh-clean-custom-import-preview.invalid { border-color:color-mix(in srgb,var(--cigh-danger) 45%,var(--cigh-border-soft)); color:var(--cigh-danger); }
      .cigh-clean-custom-import-placeholder { width:100%; text-align:center; }
      .cigh-clean-custom-import-preview img {
        width:42px;
        height:42px;
        flex:0 0 42px;
        object-fit:contain;
        image-rendering:pixelated;
        background: repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 50% / 8px 8px;
      }
      .cigh-clean-custom-import-preview div { display:flex; flex-direction:column; gap:3px; min-width:0; }
      .cigh-clean-custom-import-preview b { color:var(--cigh-text); font-size:9px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cigh-clean-custom-import-preview em { margin-left:auto; color:var(--cigh-good); font:7px/1 "Courier New", Consolas, monospace; font-style:normal; }
      @media (max-width: 620px) {
        .cigh-clean-custom-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); padding:8px; }
        .cigh-clean-custom-dialog.compact-import { width:calc(100vw - 16px); }
        .cigh-clean-custom-import-row { grid-template-columns:minmax(0,1fr); }
        .cigh-clean-custom-import-row > button { width:100%; }
        .cigh-clean-custom-import-preview { min-height:48px; }
        .cigh-clean-custom-stage-row { grid-template-columns: 1fr; }
        .cigh-clean-custom-canvas-wrap { width:min(290px, calc(100vw - 52px)); height:min(290px, calc(100vw - 52px)); }
        .cigh-clean-custom-swatches { grid-template-columns: repeat(10, minmax(0, 1fr)); }
        .cigh-clean-custom-room-preview-box { width:min(290px, calc(100vw - 52px)); margin:0 auto; }
        .cigh-clean-custom-meta { align-items:stretch; flex-direction:column; }
        .cigh-clean-custom-gridpick { width:100%; }
        .cigh-clean-custom-gridpick button { flex:1; }
      }


      /* ── v2.10.5 Custom pixel editor mobile workspace ── */
      .cigh-clean-custom-dialog.editor { position: relative; overflow: auto; }
      .cigh-clean-custom-mobile-only, .cigh-clean-custom-mobile-grid, .cigh-clean-custom-mobile-zoom { display:none !important; }
      .cigh-clean-custom-tool-gap { flex:1 1 auto; }
      .cigh-clean-custom-colorbar {
        display:flex;
        align-items:center;
        gap:5px;
        margin-top:6px;
      }
      .cigh-clean-custom-current-color {
        width:42px;
        height:28px;
        display:flex;
        align-items:center;
        gap:4px;
        color:var(--cigh-text-dim);
        font-size:6.5px;
      }
      .cigh-clean-custom-current-color input[type="color"] {
        width:28px;
        height:26px;
        padding:0;
        border:1px solid var(--cigh-border-soft);
        background:transparent;
      }
      .cigh-clean-custom-current-color span { display:none; }
      .cigh-clean-custom-recent { display:flex; gap:4px; min-width:0; flex:1; }
      .cigh-clean-custom-recent button {
        width:24px;
        height:24px;
        flex:0 0 24px;
        padding:0;
        border:1px solid var(--cigh-border-soft);
        border-radius:4px;
        background:var(--recent);
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);
      }
      .cigh-clean-custom-colorbar > button,
      .cigh-clean-custom-mobile-zoom button,
      .cigh-clean-custom-mobile-footer button,
      .cigh-clean-custom-sheet button,
      .cigh-clean-custom-preview-dialog button {
        border:1px solid var(--cigh-border-soft);
        border-radius:5px;
        background:var(--cigh-bg-2);
        color:var(--cigh-text-soft);
        font:8px/1 "Courier New", Consolas, monospace;
        padding:6px 7px;
      }
      .cigh-clean-custom-mobile-zoom {
        display:flex;
        align-items:center;
        justify-content:center;
        gap:5px;
        margin-top:5px;
      }
      .cigh-clean-custom-mobile-zoom b { min-width:44px; text-align:center; color:var(--cigh-accent); font-size:8px; }
      .cigh-clean-custom-sheet,
      .cigh-clean-custom-preview-layer {
        position:absolute;
        inset:0;
        z-index:40;
        display:grid;
        align-items:end;
        padding:10px;
        box-sizing:border-box;
        background:rgba(5,7,9,.62);
        backdrop-filter:blur(2px);
      }
      .cigh-clean-custom-sheet[hidden], .cigh-clean-custom-preview-layer[hidden] { display:none !important; }
      .cigh-clean-custom-sheet-card {
        width:min(520px,100%);
        max-height:min(70vh,560px);
        margin:0 auto;
        overflow:auto;
        box-sizing:border-box;
        padding:10px;
        border:1px solid color-mix(in srgb,var(--cigh-accent) 36%,var(--cigh-border));
        border-radius:9px;
        background:var(--cigh-bg);
        box-shadow:var(--cigh-shadow-panel);
      }
      .cigh-clean-custom-sheet-head {
        display:flex;
        align-items:center;
        gap:8px;
        margin-bottom:8px;
      }
      .cigh-clean-custom-sheet-head b { color:var(--cigh-accent); font-size:10px; letter-spacing:.08em; }
      .cigh-clean-custom-sheet-head button { margin-left:auto; font-size:14px; padding:4px 7px; }
      .cigh-clean-custom-setting-row {
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:8px;
        padding:8px 0;
        border-top:1px solid var(--cigh-border-faint);
        color:var(--cigh-text-dim);
        font-size:8px;
      }
      .cigh-clean-custom-setting-row.vertical { display:block; }
      .cigh-clean-custom-setting-row.vertical label { display:flex; justify-content:space-between; margin-bottom:7px; }
      .cigh-clean-custom-setting-row.vertical b { color:var(--cigh-accent); }
      .cigh-clean-custom-setting-row.vertical input[type="range"] { width:100%; }
      .cigh-clean-custom-setting-actions { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
      .cigh-clean-custom-setting-actions .danger { border-color:#d66b75; color:#d66b75; }
      .cigh-clean-custom-layer-sheet-list { display:flex; flex-direction:column; gap:4px; }
      .cigh-clean-custom-layer-row { display:grid; grid-template-columns:minmax(0,1fr) 40px 42px; gap:5px; }
      .cigh-clean-custom-layer-row button { min-height:38px; }
      .cigh-clean-custom-layer-row .name { text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cigh-clean-custom-layer-row.on .name { border-color:var(--cigh-accent); color:var(--cigh-accent); }
      .cigh-clean-custom-layer-row.muted .name { opacity:.55; }
      .cigh-clean-custom-layer-row .rename { font-size:12px; }
      .cigh-clean-custom-layer-row .eye { font-size:13px; }
      .cigh-clean-custom-layer-sheet-actions { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; margin-top:8px; }
      .cigh-clean-custom-layer-sheet-actions button { min-height:38px; }
      .cigh-clean-custom-preview-layer { align-items:center; }
      .cigh-clean-custom-preview-dialog {
        width:min(420px,100%);
        max-height:calc(100% - 12px);
        overflow:auto;
        box-sizing:border-box;
        padding:9px;
        border:1px solid color-mix(in srgb,var(--cigh-accent) 36%,var(--cigh-border));
        border-radius:10px;
        background:var(--cigh-bg);
        box-shadow:var(--cigh-shadow-panel);
      }
      .cigh-clean-custom-preview-dialog .cigh-clean-custom-room-preview-head button { margin-left:auto; }
      .cigh-clean-custom-preview-dialog .cigh-clean-custom-room-preview { width:min(360px,100%); margin:0 auto; }
      .cigh-clean-custom-preview-size-row {
        display:grid;
        grid-template-columns:auto 1fr auto;
        align-items:center;
        gap:7px;
        margin-top:8px;
        color:var(--cigh-text-dim);
        font-size:7.5px;
      }
      .cigh-clean-custom-preview-size-row input { width:100%; }
      .cigh-clean-custom-preview-size-row b { color:var(--cigh-accent); }
      .cigh-clean-custom-preview-back { width:100%; margin-top:8px; border-color:var(--cigh-accent) !important; color:var(--cigh-accent) !important; }
      .cigh-clean-custom-inputmode, .cigh-clean-custom-cursorbar { display:none; }


      @media (min-width: 621px) {
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-head { margin-bottom:6px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-meta { margin-bottom:7px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-room-preview-note { font-size:6.3px; opacity:.86; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-tools {
          margin-top:4px; padding-top:7px; border-top:1px solid var(--cigh-border-faint);
        }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-layerbar { padding-bottom:4px; border-bottom:1px solid var(--cigh-border-faint); }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-palette { margin-top:6px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-actions { margin-top:7px; }
      }

      @media (max-width: 620px) {
        .cigh-clean-custom-modal { padding:0; place-items:stretch; background:var(--cigh-bg); backdrop-filter:none; }
        .cigh-clean-custom-dialog.editor {
          width:100vw;
          height:100dvh;
          max-height:none;
          border:0;
          border-radius:0;
          padding:calc(7px + env(safe-area-inset-top)) 8px calc(7px + env(safe-area-inset-bottom));
          display:flex;
          flex-direction:column;
          overflow:hidden;
          box-shadow:none;
        }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-head { flex:0 0 auto; margin-bottom:6px; min-height:32px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-head b { font-size:12px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-head > span:not(.cigh-clean-custom-mobile-grid) { font-size:8px; }
        .cigh-clean-custom-mobile-grid { display:inline-flex; margin-left:auto; color:var(--cigh-accent) !important; font-size:9px !important; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-head > button { margin-left:0; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-meta { flex:0 0 auto; display:block; margin-bottom:5px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-meta input { width:100%; box-sizing:border-box; min-height:38px; padding:8px 9px; font-size:11px; }
        .cigh-clean-custom-desktop-only, .cigh-clean-custom-desktop-zoom { display:none !important; }
        .cigh-clean-custom-mobile-only, .cigh-clean-custom-mobile-zoom { display:flex !important; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-stage-row { flex:1 1 auto; min-height:0; display:flex; align-items:stretch; justify-content:center; margin:0; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-draw-pane { width:100%; min-height:0; height:100%; display:flex; flex-direction:column; align-items:stretch; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-canvas-wrap {
          width:100%;
          height:auto;
          min-height:120px;
          max-width:none;
          margin:0 auto;
          flex:1 1 auto;
          align-self:stretch;
        }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-pan-note { margin-top:3px; font-size:7.4px; }
        .cigh-clean-custom-inputmode {
          display:flex; flex:0 0 auto; margin-top:5px;
          border:1px solid var(--cigh-border-faint); border-radius:6px; overflow:hidden;
        }
        .cigh-clean-custom-inputmode button {
          flex:1; min-height:40px; padding:9px 0; font-size:10.5px; font-family:inherit;
          background:var(--cigh-bg-2); border:0; border-right:1px solid var(--cigh-border-faint);
          color:var(--cigh-text-dim); cursor:pointer;
        }
        .cigh-clean-custom-inputmode button:last-child { border-right:0; }
        .cigh-clean-custom-inputmode button.on {
          color:var(--cigh-accent);
          background:color-mix(in srgb,var(--cigh-accent) 8%,var(--cigh-bg-2));
        }
        .cigh-clean-custom-cursorbar { display:flex; align-items:stretch; gap:10px; flex:0 0 auto; margin-top:7px; }
        .cigh-clean-custom-cursorbar[hidden] { display:none !important; }
        .cigh-clean-custom-dpad {
          display:grid;
          grid-template-columns:repeat(3,44px);
          grid-template-rows:repeat(2,44px);
          gap:4px;
          flex:0 0 auto;
        }
        .cigh-clean-custom-dpad button {
          padding:0; font-size:15px; font-family:inherit; cursor:pointer;
          background:var(--cigh-bg-2); border:1px solid var(--cigh-border-faint);
          border-radius:8px; color:var(--cigh-text-soft);
          touch-action:manipulation;
        }
        .cigh-clean-custom-dpad .up { grid-column:2; grid-row:1; }
        .cigh-clean-custom-dpad .left { grid-column:1; grid-row:2; }
        .cigh-clean-custom-dpad .down { grid-column:2; grid-row:2; }
        .cigh-clean-custom-dpad .right { grid-column:3; grid-row:2; }
        .cigh-clean-custom-dpad button:active { border-color:var(--cigh-accent); color:var(--cigh-accent); }
        .cigh-clean-custom-push {
          flex:1; min-height:92px; border-radius:10px; font-family:inherit;
          border:1.5px solid var(--cigh-accent); color:var(--cigh-accent);
          background:color-mix(in srgb,var(--cigh-accent) 9%,var(--cigh-bg-2));
          font-size:15px; letter-spacing:4px; cursor:pointer;
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;
          touch-action:none;
        }
        .cigh-clean-custom-push small { font-size:8px; letter-spacing:0; color:var(--cigh-text-faint); }
        .cigh-clean-custom-push:active { background:color-mix(in srgb,var(--cigh-accent) 18%,var(--cigh-bg-2)); transform:translateY(1px); }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-tools {
          flex:0 0 auto;
          flex-wrap:nowrap;
          gap:3px;
          margin-top:5px;
          overflow-x:auto;
          scrollbar-width:none;
        }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-tools::-webkit-scrollbar { display:none; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-tools button { flex:0 0 auto; min-height:38px; padding:8px 10px; font-size:9.5px; }
        .cigh-clean-custom-dialog.editor .cigh-clean-custom-tool-gap { display:none; }
        .cigh-clean-custom-selectionbar {
          flex:0 0 auto;
          flex-wrap:nowrap;
          overflow-x:auto;
          scrollbar-width:none;
          gap:3px;
          padding:3px;
        }
        .cigh-clean-custom-selectionbar::-webkit-scrollbar { display:none; }
        .cigh-clean-custom-selectionbar button { flex:0 0 auto; min-height:36px; padding:7px 9px; font-size:9px; }
        .cigh-clean-custom-selectionbar > span { position:sticky; left:0; z-index:1; padding:0 4px; background:var(--cigh-bg-2); }
        .cigh-clean-custom-colorbar { flex:0 0 auto; margin-top:5px; }
        .cigh-clean-custom-current-color { width:38px; height:34px; }
        .cigh-clean-custom-recent { overflow:hidden; }
        .cigh-clean-custom-recent button { width:30px; height:30px; flex-basis:30px; }
        .cigh-clean-custom-colorbar > button { margin-left:auto; min-height:36px; padding:8px 10px; font-size:9px; }
        .cigh-clean-custom-mobile-zoom { gap:7px; margin-top:7px; }
        .cigh-clean-custom-mobile-zoom button { min-width:42px; min-height:36px; padding:8px 10px; font-size:10px; }
        .cigh-clean-custom-mobile-zoom b { min-width:54px; font-size:10px; }
        .cigh-clean-custom-mobile-footer {
          flex:0 0 auto;
          gap:5px;
          margin-top:5px;
          padding-top:5px;
          border-top:1px solid var(--cigh-border-faint);
        }
        .cigh-clean-custom-mobile-footer button { flex:1; min-width:0; min-height:44px; padding:7px 5px; font-size:9px; }
        .cigh-clean-custom-mobile-footer button b { display:block; margin-top:2px; color:var(--cigh-accent); font-size:7px; }
        .cigh-clean-custom-mobile-footer button.primary { flex:1.35; border-color:var(--cigh-accent); color:var(--cigh-accent); background:color-mix(in srgb,var(--cigh-accent) 7%,var(--cigh-bg-2)); }
        .cigh-clean-deco-editor { padding:10px; }
        .cigh-clean-deco-head { gap:6px; margin-bottom:8px; min-height:30px; }
        .cigh-clean-deco-title { font-size:10.5px; }
        .cigh-clean-deco-ticket { padding:3px 7px; font-size:10px; }
        .cigh-clean-deco-ticket em { font-size:7.5px; }
        .cigh-clean-deco-count { font-size:10px; font-weight:700; }
        .cigh-clean-deco-tabs { grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; margin-bottom:8px; }
        .cigh-clean-deco-tab { min-height:38px; padding:7px 2px; font-size:10px; }
        .cigh-clean-deco-shelf { gap:6px; padding-bottom:6px; }
        .cigh-clean-deco-item { flex-basis:60px; min-height:66px; padding:8px 4px 6px; }
        .cigh-clean-deco-icon { font-size:20px; }
        .cigh-clean-deco-icon-img { width:32px; height:32px; }
        .cigh-clean-deco-name { max-width:54px; font-size:9px; }
        .cigh-clean-deco-equipped-dot { width:7px; height:7px; }
        .cigh-clean-deco-actions { gap:5px; margin-top:8px; flex-wrap:wrap; }
        .cigh-clean-deco-action { min-height:38px; padding:0 10px; font-size:9px; flex:1 1 auto; }
        .cigh-clean-deco-action.ghost { margin-left:0; flex:0 0 auto; }
        .cigh-clean-deco-help { font-size:8px; margin-top:7px; }
        .cigh-clean-custom-sheet { padding:8px 8px calc(8px + env(safe-area-inset-bottom)); }
        .cigh-clean-custom-sheet-card { max-height:62dvh; border-radius:10px 10px 0 0; }
        .cigh-clean-custom-sheet-card.palette-sheet .cigh-clean-custom-swatches { grid-template-columns:repeat(8,minmax(0,1fr)); gap:5px; }
        /* v3.1.8: 원래 프리셋 팔레트 유지 + 모바일 공통 버튼 배경 덮임만 수정 */
        .cigh-clean-custom-sheet-card.palette-sheet .cigh-clean-custom-swatches button {
          min-height:34px;
          padding:0;
          background:var(--swatch);
        }
        .cigh-clean-custom-preview-layer { padding:8px; }
        .cigh-clean-custom-preview-dialog { width:100%; max-height:100%; }
      }
      /* ── Gacha reveal ── */
      .cigh-clean-gacha-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background: rgba(8, 9, 12, .62);
        backdrop-filter: blur(3px);
        font-family: "Courier New", Consolas, monospace;
        animation: cigh-clean-gacha-fade .22s ease;
      }
      .cigh-clean-gacha-backdrop.in-panel {
        position: absolute;
        inset: 0;
        z-index: 40;
        border-radius: inherit;
        background: rgba(8, 9, 12, .68);
        backdrop-filter: blur(2px);
      }
      .cigh-clean-gacha-backdrop.closing { opacity: 0; transition: opacity .19s ease; }
      .cigh-clean-gacha-backdrop.in-panel .cigh-clean-gacha-stage {
        width: min(228px, calc(100% - 18px));
        height: min(260px, calc(100% - 18px));
      }
      .cigh-clean-gacha-backdrop.in-panel .cigh-clean-gacha-rays {
        width: 260px;
        height: 260px;
      }
      @keyframes cigh-clean-gacha-fade { from { opacity: 0; } to { opacity: 1; } }
      .cigh-clean-gacha-stage {
        position: relative;
        width: min(240px, calc(100vw - 44px));
        height: 240px;
        display: grid;
        place-items: center;
        text-align: center;
      }
      .cigh-clean-gacha-rays {
        position: absolute;
        width: 300px;
        height: 300px;
        background: repeating-conic-gradient(from 0deg,
          color-mix(in srgb, var(--gacha-color) 30%, transparent) 0deg 10deg,
          transparent 10deg 20deg);
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        transition: opacity .5s ease;
        animation: cigh-clean-gacha-spin 14s linear infinite;
        -webkit-mask: radial-gradient(circle, #000 22%, transparent 70%);
        mask: radial-gradient(circle, #000 22%, transparent 70%);
      }
      .cigh-clean-gacha-stage.revealed .cigh-clean-gacha-rays { opacity: .5; }
      @keyframes cigh-clean-gacha-spin { to { transform: rotate(360deg); } }
      .cigh-clean-gacha-capsule { position: absolute; width: 60px; height: 60px; z-index: 2; }
      .cigh-clean-gacha-stage.shake .cigh-clean-gacha-capsule { animation: cigh-clean-gacha-shake .62s ease-in-out; }
      .cigh-clean-gacha-stage.revealed .cigh-clean-gacha-capsule { display: none; }
      .cigh-clean-gacha-cap-top,
      .cigh-clean-gacha-cap-bot {
        position: absolute;
        left: 0;
        width: 60px;
        height: 30px;
        box-sizing: border-box;
        image-rendering: pixelated;
      }
      .cigh-clean-gacha-cap-top {
        top: 0;
        border-radius: 30px 30px 0 0;
        background: linear-gradient(180deg, color-mix(in srgb, var(--gacha-color) 88%, #fff 12%), var(--gacha-color));
        border: 2px solid color-mix(in srgb, var(--gacha-color) 60%, #000 40%);
        border-bottom: 0;
      }
      .cigh-clean-gacha-cap-bot {
        bottom: 0;
        border-radius: 0 0 30px 30px;
        background: #efe7d4;
        border: 2px solid #b8a884;
        border-top: 0;
      }
      .cigh-clean-gacha-cap-dot {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 10px;
        height: 10px;
        margin: -5px 0 0 -5px;
        border-radius: 999px;
        background: #fff;
        border: 2px solid #b8a884;
        z-index: 3;
      }
      .cigh-clean-gacha-reveal {
        position: absolute;
        z-index: 3;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        opacity: 0;
        transform: scale(.4);
        pointer-events: none;
      }
      .cigh-clean-gacha-stage.revealed .cigh-clean-gacha-reveal { animation: cigh-clean-gacha-pop .46s cubic-bezier(.2, 1.5, .4, 1) .1s forwards; }
      @keyframes cigh-clean-gacha-pop { to { opacity: 1; transform: scale(1); } }
      .cigh-clean-gacha-rank {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .16em;
        color: var(--gacha-color);
      }
      .cigh-clean-gacha-icon {
        font-size: 38px;
        line-height: 1;
        filter: drop-shadow(0 0 12px color-mix(in srgb, var(--gacha-color) 55%, transparent));
        animation: cigh-clean-gacha-float 2.2s ease-in-out infinite;
      }
      .cigh-clean-gacha-icon-img {
        width: 58px;
        height: 58px;
        object-fit: contain;
        image-rendering: auto;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      @keyframes cigh-clean-gacha-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      .cigh-clean-gacha-name { font-size: 13px; font-weight: 700; color: var(--cigh-text); }
      .cigh-clean-gacha-tag {
        font-size: 8.5px;
        font-weight: 700;
        letter-spacing: .08em;
        color: var(--cigh-bg);
        background: var(--gacha-color);
        padding: 2px 8px;
        border-radius: 999px;
      }
      .cigh-clean-gacha-hint {
        position: absolute;
        bottom: 4px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 8.5px;
        letter-spacing: .04em;
        color: var(--cigh-text-dim);
        white-space: nowrap;
        opacity: 0;
      }
      .cigh-clean-gacha-stage.revealed .cigh-clean-gacha-hint { animation: cigh-clean-gacha-fade .4s ease .85s forwards; }
      @keyframes cigh-clean-gacha-shake {
        0%, 100% { transform: translateX(0) rotate(0); }
        20% { transform: translateX(-4px) rotate(-6deg); }
        40% { transform: translateX(4px) rotate(6deg); }
        60% { transform: translateX(-3px) rotate(-4deg); }
        80% { transform: translateX(3px) rotate(4deg); }
      }
      .cigh-clean-pet-img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: auto;
        pointer-events: none;
        user-select: none;
        -webkit-user-drag: none;
      }
      .cigh-clean-bpm-card {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--cigh-border-soft);
        background: color-mix(in srgb, var(--cigh-fill) 76%, transparent);
        padding: 7px 8px 8px;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-bpm-color) 12%, transparent);
      }
      .cigh-clean-bpm-head {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        font-family: "Courier New", Consolas, monospace;
      }
      .cigh-clean-bpm-heart {
        color: var(--cigh-bpm-color);
        font-size: 12px;
        line-height: 1;
        animation: cigh-clean-bpm-heartbeat var(--bpm-dur) ease-in-out infinite;
        filter: drop-shadow(0 0 4px color-mix(in srgb, var(--cigh-bpm-color) 50%, transparent));
      }
      .cigh-clean-bpm-number {
        color: var(--cigh-text);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .08em;
      }
      .cigh-clean-bpm-mood {
        margin-left: auto;
        color: var(--cigh-text-dim);
        font-size: 9px;
        letter-spacing: .04em;
      }
      .cigh-clean-ecg-window {
        position: relative;
        height: 32px;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--cigh-bpm-color) 24%, var(--cigh-border-soft));
        background:
          linear-gradient(90deg, color-mix(in srgb, var(--cigh-bpm-color) 10%, transparent) 1px, transparent 1px),
          linear-gradient(0deg, color-mix(in srgb, var(--cigh-bpm-color) 8%, transparent) 1px, transparent 1px);
        background-size: 12px 12px;
      }
      .cigh-clean-ecg-line {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        fill: none;
        overflow: visible;
      }
      .cigh-clean-ecg-base,
      .cigh-clean-ecg-trace {
        fill: none;
        stroke: var(--cigh-bpm-color);
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }
      .cigh-clean-ecg-base {
        opacity: .28;
        stroke-width: 1.45;
      }
      .cigh-clean-ecg-trace {
        opacity: .92;
        stroke-width: 2.05;
        stroke-dasharray: 70 250;
        stroke-dashoffset: 320;
        filter: drop-shadow(0 0 3px color-mix(in srgb, var(--cigh-bpm-color) 34%, transparent));
        animation: cigh-clean-ecg-trace var(--bpm-dur) linear infinite;
      }
      .cigh-clean-bpm-love .cigh-clean-bpm-number,
      .cigh-clean-bpm-scared .cigh-clean-bpm-number {
        color: var(--cigh-bpm-color);
        animation: cigh-clean-bpm-soft-pulse calc(var(--bpm-dur) * 1.15) ease-in-out infinite;
      }
      .cigh-clean-bpm-sad {
        opacity: .82;
      }
      .cigh-clean-bpm-sad .cigh-clean-ecg-base {
        opacity: .20;
      }
      .cigh-clean-bpm-sad .cigh-clean-ecg-trace {
        stroke-width: 1.55;
        filter: none;
        opacity: .70;
      }
      @keyframes cigh-clean-ecg-trace {
        0% { stroke-dashoffset: 320; opacity: .92; }
        100% { stroke-dashoffset: 0; opacity: .92; }
      }
      @keyframes cigh-clean-bpm-heartbeat {
        0%, 100% { transform: scale(1); }
        18% { transform: scale(1.10); }
        34% { transform: scale(.995); }
        52% { transform: scale(1.035); }
        68% { transform: scale(1); }
      }
      @keyframes cigh-clean-bpm-soft-pulse {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-0.5px); }
      }
      .cigh-clean-tendency-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 5px;
        margin-top: 6px;
      }
      .cigh-clean-tendency-badge {
        position: relative;
        isolation: isolate;
        min-height: 47px;
        overflow: hidden;
        display: grid;
        grid-template-rows: auto auto auto;
        place-items: center;
        gap: 1px;
        padding: 6px 3px 8px;
        border: 1px solid color-mix(in srgb, var(--tendency-color) 58%, var(--cigh-border-soft));
        background: var(--cigh-bg-2);
        color: var(--cigh-text);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-bg) 72%, transparent);
      }
      #${PANEL_ID}[data-cigh-theme="light"] .cigh-clean-tendency-badge {
        background: var(--cigh-bg-3);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-fill) 72%, transparent);
      }
      .cigh-clean-tendency-badge::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: var(--tendency-color);
        z-index: 0;
        image-rendering: pixelated;
      }
      .cigh-clean-tendency-fill {
        position: absolute;
        left: 3px;
        right: 3px;
        bottom: 2px;
        height: var(--tendency-fill);
        min-height: 2px;
        max-height: 4px;
        background: var(--tendency-color);
        opacity: .86;
        border-top: 0;
        z-index: 0;
        image-rendering: pixelated;
      }
      .cigh-clean-tendency-emoji,
      .cigh-clean-tendency-name,
      .cigh-clean-tendency-count {
        position: relative;
        z-index: 2;
      }
      .cigh-clean-tendency-emoji {
        font-size: 13px;
        line-height: 1;
              }
      .cigh-clean-tendency-name {
        font-size: 8.5px;
        letter-spacing: .02em;
        color: var(--cigh-text-soft);
        white-space: nowrap;
      }
      .cigh-clean-tendency-count {
        font-family: "Courier New", Consolas, monospace;
        font-size: 12px;
        font-weight: 700;
        color: var(--cigh-text);
      }
      .cigh-clean-tendency-badge.is-active {
        border-color: var(--cigh-accent);
        color: var(--cigh-text);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 42%, transparent),
          0 0 8px color-mix(in srgb, var(--cigh-accent) 48%, transparent),
          0 0 10px color-mix(in srgb, var(--tendency-color) 34%, transparent);
        animation: cigh-clean-tendency-pulse 1.4s ease-in-out infinite;
      }
      .cigh-clean-tendency-badge.is-active .cigh-clean-tendency-name {
        color: var(--cigh-text);
      }
      .cigh-clean-tendency-badge.is-zero {
        opacity: .46;
        filter: grayscale(.25);
      }
      @keyframes cigh-clean-tendency-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.04); }
      }
      @keyframes cigh-clean-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes cigh-clean-sleep-breathe {
        0%, 100% { transform: scale(0.985); }
        50% { transform: scale(1.015); }
      }
      .cigh-clean-mini-empty {
        color: var(--cigh-text-dim);
        font-size: 9.5px;
        letter-spacing: .06em;
        padding: 4px 0 2px;
      }

      .cigh-clean-comment-log-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        column-gap: 6px;
        align-items: start;
        padding: 4px 0 6px;
        border-bottom: 1px solid color-mix(in srgb, var(--cigh-fill) 70%, transparent);
      }
      .cigh-clean-comment-log-time {
        color: var(--cigh-text-dim);
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        flex: 0 0 auto;
        letter-spacing: .04em;
        line-height: 1.45;
        white-space: nowrap;
      }
      .cigh-clean-comment-log-text {
        color: var(--cigh-text-soft);
        font-size: inherit;
        line-height: 1.45;
        word-break: keep-all;
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .cigh-clean-comment-log-line {
        position: relative;
        display: block;
        padding-left: 10px;
      }
      .cigh-clean-comment-log-line::before {
        content: '';
        position: absolute;
        left: 1px;
        top: .68em;
        width: 3px;
        height: 3px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--cigh-accent) 60%, var(--cigh-text-dim) 40%);
        opacity: .82;
        box-shadow: 0 0 4px color-mix(in srgb, var(--cigh-accent) 28%, transparent);
      }

      .cigh-clean-info-tools {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 4px;
        min-height: 18px;
        margin: -2px 0 5px;
        padding-right: 1px;
      }
      .cigh-clean-user-name-box {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--cigh-text-faint);
        font-size: 8.5px;
        letter-spacing: .08em;
      }
      .cigh-clean-user-name-box span {
        flex: 0 0 auto;
        color: var(--cigh-accent);
        font-weight: 700;
      }
      .cigh-clean-user-name-input {
        flex: 1 1 auto;
        min-width: 0;
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 24%, transparent);
        border-radius: 4px;
        padding: 2px 5px;
        background: color-mix(in srgb, var(--cigh-bg-soft) 88%, transparent);
        color: var(--cigh-text-soft);
        font-size: 9px;
        line-height: 1.2;
        font-family: "Courier New", Consolas, monospace;
        outline: none;
      }
      .cigh-clean-user-name-input:focus {
        border-color: var(--cigh-accent-soft);
        color: var(--cigh-text);
      }

      .cigh-clean-info-reset-btn {
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 38%, transparent);
        border-radius: 4px;
        padding: 2px 7px;
        background: color-mix(in srgb, var(--cigh-bg-soft) 88%, transparent);
        color: var(--cigh-text-soft);
        font-size: 8.5px;
        line-height: 1.2;
        letter-spacing: .08em;
        font-family: "Courier New", Consolas, monospace;
        cursor: pointer;
        opacity: .78;
      }
      .cigh-clean-info-reset-btn:hover {
        opacity: 1;
        color: var(--cigh-accent);
        background: color-mix(in srgb, var(--cigh-accent) 14%, var(--cigh-bg-soft));
      }
      .cigh-clean-confirm-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--cigh-accent) 12%, transparent), transparent 52%),
          rgba(0, 0, 0, .46);
        backdrop-filter: blur(2px);
        font-family: "Courier New", Consolas, monospace;
      }
      .cigh-clean-confirm-backdrop.in-panel {
        position: absolute;
        inset: 0;
        z-index: 48;
        border-radius: inherit;
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--cigh-bg) 28%, transparent), color-mix(in srgb, #000 58%, transparent)),
          radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--cigh-accent) 18%, transparent), transparent 55%);
        backdrop-filter: blur(1.5px);
      }
      .cigh-clean-confirm-box {
        position: relative;
        width: min(calc(286px * var(--cigh-ui-font-scale, 1)), calc(100% - 22px));
        padding: calc(8px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text);
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--cigh-bg-2) 96%, #fff 4%), var(--cigh-bg)),
          repeating-linear-gradient(0deg, transparent 0 7px, color-mix(in srgb, var(--cigh-accent) 5%, transparent) 7px 8px);
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 48%, var(--cigh-border-soft));
        border-radius: calc(4px * var(--cigh-ui-font-scale, 1));
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, #fff 6%, transparent),
          inset 0 0 0 2px color-mix(in srgb, #000 24%, transparent),
          0 10px 0 color-mix(in srgb, #000 34%, transparent),
          0 20px 48px rgba(0,0,0,.48);
        box-sizing: border-box;
      }
      .cigh-clean-confirm-box.rpg::before,
      .cigh-clean-confirm-box.rpg::after {
        content: "";
        position: absolute;
        width: calc(5px * var(--cigh-ui-font-scale, 1));
        height: calc(5px * var(--cigh-ui-font-scale, 1));
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 55%, var(--cigh-border-soft));
        background: var(--cigh-bg);
        box-sizing: border-box;
      }
      .cigh-clean-confirm-box.rpg::before {
        left: calc(5px * var(--cigh-ui-font-scale, 1));
        top: calc(5px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-confirm-box.rpg::after {
        right: calc(5px * var(--cigh-ui-font-scale, 1));
        bottom: calc(5px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-confirm-title {
        display: flex;
        align-items: center;
        gap: calc(5px * var(--cigh-ui-font-scale, 1));
        padding: calc(3px * var(--cigh-ui-font-scale, 1)) calc(8px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(7px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-accent);
        font-size: calc(10px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .12em;
        background: color-mix(in srgb, var(--cigh-accent) 12%, var(--cigh-bg-3));
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 28%, var(--cigh-border-soft));
        border-radius: calc(3px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-confirm-title-dot {
        color: color-mix(in srgb, var(--cigh-accent) 82%, #fff 18%);
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
      }
      .cigh-clean-confirm-panel {
        padding: calc(10px * var(--cigh-ui-font-scale, 1)) calc(8px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(8px * var(--cigh-ui-font-scale, 1));
        text-align: center;
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--cigh-bg-soft) 90%, #fff 10%), color-mix(in srgb, var(--cigh-bg-3) 84%, #000 16%));
        border: 1px solid color-mix(in srgb, var(--cigh-accent) 22%, var(--cigh-border-soft));
        box-shadow:
          inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
          inset 0 -1px 0 color-mix(in srgb, #000 28%, transparent);
      }
      .cigh-clean-confirm-text {
        font-size: calc(12px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        line-height: 1.45;
        color: var(--cigh-text);
        margin-bottom: calc(7px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-confirm-help {
        color: color-mix(in srgb, var(--cigh-text-soft) 88%, #fff 12%);
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        line-height: 1.58;
        margin: 0;
      }
      .cigh-clean-confirm-help.sub {
        margin-top: calc(6px * var(--cigh-ui-font-scale, 1));
        color: color-mix(in srgb, var(--cigh-text-soft) 70%, var(--cigh-accent) 30%);
      }
      .cigh-clean-confirm-actions {
        display: flex;
        justify-content: stretch;
        gap: calc(6px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-confirm-btn {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: calc(4px * var(--cigh-ui-font-scale, 1));
        border: 1px solid var(--cigh-border-soft);
        border-radius: calc(3px * var(--cigh-ui-font-scale, 1));
        padding: calc(6px * var(--cigh-ui-font-scale, 1)) calc(10px * var(--cigh-ui-font-scale, 1));
        background:
          linear-gradient(180deg, color-mix(in srgb, var(--cigh-bg-3) 92%, #fff 8%), var(--cigh-bg-soft));
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(10px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .08em;
        cursor: pointer;
        box-shadow:
          inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent),
          0 2px 0 color-mix(in srgb, #000 34%, transparent);
      }
      .cigh-clean-confirm-btn span {
        position: relative;
        z-index: 1;
      }
      .cigh-clean-confirm-btn:active {
        transform: translateY(1px);
        box-shadow: inset 0 1px 0 color-mix(in srgb, #000 20%, transparent);
      }
      .cigh-clean-confirm-btn.yes {
        color: #fff6e3;
        text-shadow: 0 1px 0 rgba(0,0,0,.28);
        border-color: color-mix(in srgb, var(--cigh-danger) 78%, #000 22%);
        background:
          linear-gradient(180deg, color-mix(in srgb, #ff9f7a 24%, var(--cigh-danger) 76%), color-mix(in srgb, var(--cigh-danger) 88%, #000 12%));
      }
      .cigh-clean-confirm-btn.yes::before {
        content: "◆";
        color: #ffe1b0;
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
      }
      .cigh-clean-confirm-btn.no {
        color: var(--cigh-text);
        border-color: color-mix(in srgb, var(--cigh-accent) 34%, var(--cigh-border-soft));
      }
      .cigh-clean-confirm-btn.no::before {
        content: "›";
        color: var(--cigh-accent);
      }

      .cigh-clean-foot {
        min-height: 18px;
        height: auto;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 3px 8px 3px 9px;
        background: var(--cigh-bg-soft);
        border-top: 1px solid var(--cigh-fill);
        box-sizing: border-box;
      }
      .cigh-clean-count {
        flex: 0 0 auto;
        color: var(--cigh-text-dim);
        font-size: 8.5px;
        letter-spacing: .04em;
        margin-left: 0;
      }
      .cigh-clean-ft {
        flex: 1 1 auto;
        min-width: 0;
        color: color-mix(in srgb, var(--cigh-text-soft) 72%, var(--cigh-accent) 28%);
        font-size: 9px;
        letter-spacing: .07em;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        display: block;
        max-width: 100%;
        padding-left: 1px;
        box-sizing: border-box;
        line-height: 1.35;
        overflow-wrap: anywhere;
        word-break: keep-all;
      }

      #${POPUP_ID} {
        position: fixed;
        left: 16px;
        bottom: 128px;
        z-index: 2147483646;
        width: 218px;
        min-height: 20px;
        max-height: none;
        overflow: visible;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: 2px;
        background: var(--cigh-bg);
        border: 1px solid var(--cigh-accent-soft);
        border-left: 2px solid var(--cigh-accent);
        border-radius: 5px;
        padding: 7px 10px;
        font-family: "Courier New", Consolas, monospace;
        font-size: 10.5px;
        color: var(--cigh-text);
        line-height: 1.55;
        pointer-events: none;
        box-shadow: var(--cigh-shadow-popup);
        opacity: 0;
        transform: translateY(6px);
        transition: opacity .26s ease, transform .26s ease;
      }
      #${POPUP_ID}.show {
        opacity: 1;
        transform: translateY(0);
      }
      .cigh-clean-popup-line {
        min-height: 1.35em;
        max-height: none;
        overflow: visible;
        opacity: 1;
        transform: translateY(0);
        transition: opacity .26s ease, transform .26s ease, max-height .26s ease;
        word-break: keep-all;
        overflow-wrap: anywhere;
        white-space: normal;
      }
      .cigh-clean-popup-line.entering {
        opacity: 0;
        transform: translateY(10px);
      }
      .cigh-clean-popup-line.leaving {
        opacity: 0;
        transform: translateY(-10px);
        max-height: 0;
        overflow: hidden;
      }

      #${COMMENT_POPUP_ID} {
        position: fixed;
        left: 16px;
        bottom: 92px;
        z-index: 2147483647;
        width: 218px;
        min-height: 20px;
        box-sizing: border-box;
        background: var(--cigh-bg);
        border: 1px solid var(--cigh-accent-soft);
        border-left: 2px solid var(--cigh-accent);
        border-radius: 5px;
        padding: 7px 10px;
        font-family: "Courier New", Consolas, monospace;
        color: var(--cigh-text);
        box-shadow: var(--cigh-shadow-popup);
        opacity: 0;
        transform: translateY(8px);
        pointer-events: none;
        transition: opacity .26s ease, transform .26s ease;
      }
      #${COMMENT_POPUP_ID}.show {
        opacity: 1;
        transform: translateY(0);
      }
      .cigh-clean-comment-prefix {
        color: var(--cigh-accent);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: .12em;
        margin-bottom: 3px;
      }
      .cigh-clean-comment-text {
        font-size: 10.5px;
        line-height: 1.45;
        word-break: keep-all;
        overflow-wrap: anywhere;
      }

      #${SETTINGS_ID} {
        position: absolute;
        left: 8px;
        right: 8px;
        top: 34px;
        z-index: 120;
        max-height: calc(100% - 44px);
        overflow-y: auto;
        padding: 9px;
        background: var(--cigh-bg);
        border: 1px solid var(--cigh-border);
        border-radius: 6px;
        box-shadow: var(--cigh-shadow-settings);
        scrollbar-width: thin;
        scrollbar-color: var(--cigh-border) transparent;
      }
      #${SETTINGS_ID}::-webkit-scrollbar { width: 3px; }
      #${SETTINGS_ID}::-webkit-scrollbar-thumb { background: var(--cigh-border); }

      .cigh-clean-settings-title {
        display: flex;
        align-items: center;
        gap: 5px;
        color: var(--cigh-accent);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .12em;
        margin-bottom: 6px;
        cursor: pointer;
        user-select: none;
      }
      .cigh-clean-settings-title:hover {
        color: var(--cigh-accent-2);
      }
      .cigh-clean-settings-title:focus-visible {
        outline: 1px solid var(--cigh-accent-soft);
        outline-offset: 2px;
      }
      .cigh-clean-fold-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        color: var(--cigh-text-soft);
        letter-spacing: 0;
      }
      .cigh-clean-fold-body {
        display: block;
        margin-bottom: 4px;
      }
      .cigh-clean-fold-body.collapsed {
        display: none;
      }
      .cigh-clean-settings-subtitle { margin-top: 8px; }
      .cigh-clean-settings-mini-title {
        margin: 8px 0 4px;
        color: var(--cigh-accent);
        font-size: 10px;
        font-weight: 900;
        letter-spacing: .04em;
      }
      .cigh-clean-settings-wide-label {
        display: block;
        margin-top: 6px;
      }
      .cigh-clean-settings-wide-label > span {
        display: block;
        margin-bottom: 3px;
        color: var(--cigh-text-soft);
        font-size: 10px;
      }
      .cigh-clean-usage-model-name small {
        display: block;
        margin-top: 2px;
        color: var(--cigh-text-soft);
        font-size: 9px;
        font-weight: 600;
        line-height: 1.25;
      }
      #cigh-clean-api-input,
      #cigh-clean-deepseek-api-input,
      #cigh-clean-deepseek-base-url-input,
      #cigh-clean-deepseek-model-input,
      #cigh-clean-deepseek-third-party-model-input,
      #cigh-clean-deepseek-thinking-input,
      #cigh-clean-pet-name-input,
      #cigh-clean-style-input,
      #cigh-clean-model-input,
      #cigh-clean-thinking-input,
      #cigh-clean-font-size-input,
      #cigh-clean-provider-input,
      #cigh-clean-firebase-input,
      #cigh-clean-firebase-location-input,
      #cigh-clean-firebase-sdk-input,
      #cigh-clean-cloud-code-input,
      #cigh-clean-cloud-password-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--cigh-border);
        border-radius: 4px;
        background: var(--cigh-bg);
        color: var(--cigh-text);
        outline: none;
        font: inherit;
      }
      #cigh-clean-api-input,
      #cigh-clean-deepseek-api-input,
      #cigh-clean-deepseek-base-url-input,
      #cigh-clean-deepseek-model-input,
      #cigh-clean-deepseek-third-party-model-input,
      #cigh-clean-deepseek-thinking-input,
      #cigh-clean-pet-name-input,
      #cigh-clean-model-input,
      #cigh-clean-thinking-input,
      #cigh-clean-font-size-input,
      #cigh-clean-provider-input,
      #cigh-clean-firebase-location-input,
      #cigh-clean-firebase-sdk-input,
      #cigh-clean-cloud-code-input,
      #cigh-clean-cloud-password-input {
        height: 26px;
        padding: 0 7px;
        font-size: 10.5px;
      }
      #cigh-clean-style-input,
      #cigh-clean-firebase-input {
        resize: vertical;
        padding: 7px;
        font-size: 10px;
        line-height: 1.4;
      }
      #cigh-clean-style-input {
        height: 112px;
      }
      #cigh-clean-firebase-input {
        height: 82px;
      }
      #cigh-clean-api-input:focus,
      #cigh-clean-deepseek-api-input:focus,
      #cigh-clean-deepseek-base-url-input:focus,
      #cigh-clean-deepseek-model-input:focus,
      #cigh-clean-deepseek-third-party-model-input:focus,
      #cigh-clean-deepseek-thinking-input:focus,
      #cigh-clean-pet-name-input:focus,
      #cigh-clean-style-input:focus,
      #cigh-clean-provider-input:focus,
      #cigh-clean-firebase-input:focus,
      #cigh-clean-firebase-location-input:focus,
      #cigh-clean-firebase-sdk-input:focus,
      #cigh-clean-cloud-code-input:focus,
      #cigh-clean-cloud-password-input:focus {
        border-color: color-mix(in srgb, var(--cigh-accent) 58%, transparent);
      }
      .cigh-clean-checkrow {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 7px;
        color: var(--cigh-text-soft);
        font-size: 10px;
        user-select: none;
      }
      .cigh-clean-checkrow input {
        accent-color: var(--cigh-accent);
      }
      .cigh-clean-settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 4px;
      }
      .cigh-clean-settings-grid label {
        display: grid;
        gap: 3px;
        color: var(--cigh-text-soft);
        font-size: 9.5px;
      }
      .cigh-clean-settings-mini-title {
        margin: 7px 0 4px;
        color: var(--cigh-text-soft);
        font-size: 9.5px;
        letter-spacing: .04em;
      }


      .cigh-clean-cloud-status {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 2px 7px;
        align-items: center;
        margin: 2px 0 7px;
        padding: 7px 8px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 5px;
        background: var(--cigh-bg-2);
      }
      .cigh-clean-cloud-status.on {
        border-color: color-mix(in srgb, var(--cigh-good) 48%, var(--cigh-border-soft));
      }
      .cigh-clean-cloud-status b {
        color: var(--cigh-accent);
        font-size: 9.5px;
      }
      .cigh-clean-cloud-status.on b { color: var(--cigh-good); }
      .cigh-clean-cloud-status span {
        min-width: 0;
        color: var(--cigh-text);
        font-family: "Courier New", Consolas, monospace;
        font-size: 9.5px;
        overflow-wrap: anywhere;
      }
      .cigh-clean-cloud-status small {
        grid-column: 1 / -1;
        color: var(--cigh-text-faint);
        font-size: 8.5px;
      }
      .cigh-clean-cloud-grid { margin-top: 2px; }
      .cigh-clean-cloud-actions .cigh-clean-set-btn:disabled {
        opacity: .48;
        cursor: wait;
      }
      .cigh-clean-cloud-help { margin-top: 7px !important; }

      .cigh-clean-usage-summary {
        display: grid;
        gap: 6px;
        margin-top: 2px;
      }
      .cigh-clean-usage-line {
        padding: 7px 8px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 5px;
        background: var(--cigh-bg-2);
        color: var(--cigh-text);
        font-size: 10px;
        line-height: 1.45;
      }
      .cigh-clean-usage-models {
        display: grid;
        gap: 4px;
      }
      .cigh-clean-usage-model-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
        padding: 5px 6px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 5px;
        background: var(--cigh-bg-3);
        color: var(--cigh-text-soft);
        font-size: 9px;
      }
      .cigh-clean-usage-model-name {
        min-width: 0;
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
        overflow-wrap: anywhere;
        word-break: break-word;
        color: var(--cigh-text);
      }
      .cigh-clean-usage-model-row b {
        color: var(--cigh-accent);
        font-size: 9.5px;
      }
      .cigh-clean-usage-empty {
        padding: 6px;
        border: 1px dashed var(--cigh-border-soft);
        border-radius: 5px;
        color: var(--cigh-text-faint);
        font-size: 9px;
      }
      .cigh-clean-usage-note {
        margin-top: 7px !important;
      }
      .cigh-clean-settings-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .cigh-clean-set-btn {
        flex: 1;
        height: 24px;
        border: 1px solid var(--cigh-border);
        border-radius: 4px;
        background: var(--cigh-bg-3);
        color: var(--cigh-text-soft);
        font: inherit;
        font-size: 10px;
        cursor: pointer;
      }
      .cigh-clean-set-btn.gold {
        color: var(--cigh-accent);
        border-color: var(--cigh-accent-soft);
      }
      .cigh-clean-set-btn.red {
        color: #c55c5c;
        border-color: rgba(197,92,92,.28);
      }
      .cigh-clean-settings-help {
        margin-top: 6px;
        color: var(--cigh-text-faint);
        font-size: 9px;
        line-height: 1.35;
      }


      /* UI SIZE OPTIONS
         공통 글자/폭 값은 CSS 변수로 모아 중복 selector를 줄인다.
         구조 차이가 있는 medium/large 레이아웃 값만 아래에 별도 유지한다. */
      [data-cigh-font="small"] {
        --cigh-size-panel-width: 252px;
        --cigh-size-panel-font: 11.3px;
        --cigh-size-title-font: 10.3px;
        --cigh-size-room-font: 9.3px;
        --cigh-size-close-font: 11.3px;
        --cigh-size-tab-font: 10.3px;
        --cigh-size-section-font: 9.3px;
        --cigh-size-block-font: 10.3px;
        --cigh-size-detail-font: 9.8px;
        --cigh-size-footer-font: 9.3px;
        --cigh-size-popup-font: 10.8px;
        --cigh-size-popup-prefix-font: 9.3px;
        --cigh-size-settings-font: 11.3px;
        --cigh-size-settings-title-font: 10.3px;
        --cigh-size-settings-control-font: 11.3px;
        --cigh-size-settings-textarea-font: 10.3px;
        --cigh-size-settings-action-font: 11.3px;
        --cigh-size-settings-help-font: 9.3px;
      }
      [data-cigh-font="medium"] {
        --cigh-size-panel-width: 287px;
        --cigh-size-panel-font: 11.5px;
        --cigh-size-title-font: 10px;
        --cigh-size-room-font: 9px;
        --cigh-size-close-font: 11.5px;
        --cigh-size-tab-font: 10px;
        --cigh-size-section-font: 9.5px;
        --cigh-size-block-font: 11.5px;
        --cigh-size-detail-font: 10px;
        --cigh-size-footer-font: 9.5px;
        --cigh-size-popup-font: 11.5px;
        --cigh-size-popup-prefix-font: 9px;
        --cigh-size-settings-font: 11.5px;
        --cigh-size-settings-title-font: 10px;
        --cigh-size-settings-control-font: 11.5px;
        --cigh-size-settings-textarea-font: 10px;
        --cigh-size-settings-action-font: 10px;
        --cigh-size-settings-help-font: 9px;
      }
      [data-cigh-font="large"] {
        --cigh-size-panel-width: 339px;
        --cigh-size-panel-font: 15px;
        --cigh-size-title-font: 13px;
        --cigh-size-room-font: 11px;
        --cigh-size-close-font: 16px;
        --cigh-size-tab-font: 13px;
        --cigh-size-section-font: 12px;
        --cigh-size-block-font: 14px;
        --cigh-size-detail-font: 12px;
        --cigh-size-footer-font: 12px;
        --cigh-size-popup-font: 14px;
        --cigh-size-popup-prefix-font: 11px;
        --cigh-size-settings-font: 14px;
        --cigh-size-settings-title-font: 13px;
        --cigh-size-settings-control-font: 14px;
        --cigh-size-settings-textarea-font: 13px;
        --cigh-size-settings-action-font: 13px;
        --cigh-size-settings-help-font: 11px;
      }

      #${PANEL_ID}[data-cigh-font] {
        width: var(--cigh-size-panel-width) !important;
        right: auto !important;
        font-size: var(--cigh-size-panel-font) !important;
      }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-ttl { font-size: var(--cigh-size-title-font) !important; }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-room { font-size: var(--cigh-size-room-font) !important; }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-x { font-size: var(--cigh-size-close-font) !important; }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-tab { font-size: var(--cigh-size-tab-font) !important; }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-sh { font-size: var(--cigh-size-section-font) !important; }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-blbl { font-size: var(--cigh-size-block-font) !important; }
      #${PANEL_ID}[data-cigh-font] :is(.cigh-clean-bdim, .cigh-clean-idetail, .cigh-clean-mini-empty, .cigh-clean-empty) {
        font-size: var(--cigh-size-detail-font) !important;
      }
      #${PANEL_ID}[data-cigh-font] .cigh-clean-ft { font-size: var(--cigh-size-footer-font) !important; }

      #${POPUP_ID}[data-cigh-font],
      #${COMMENT_POPUP_ID}[data-cigh-font] { font-size: var(--cigh-size-popup-font) !important; }
      #${POPUP_ID}[data-cigh-font] .cigh-clean-popup-line,
      #${COMMENT_POPUP_ID}[data-cigh-font] .cigh-clean-comment-text { font-size: var(--cigh-size-popup-font) !important; }
      #${COMMENT_POPUP_ID}[data-cigh-font] .cigh-clean-comment-prefix { font-size: var(--cigh-size-popup-prefix-font) !important; }

      #${SETTINGS_ID}[data-cigh-font] { font-size: var(--cigh-size-settings-font) !important; }
      #${SETTINGS_ID}[data-cigh-font] .cigh-clean-settings-title { font-size: var(--cigh-size-settings-title-font) !important; }
      #${SETTINGS_ID}[data-cigh-font] :is(
        #cigh-clean-api-input,
        #cigh-clean-deepseek-api-input,
        #cigh-clean-deepseek-base-url-input,
        #cigh-clean-deepseek-model-input,
        #cigh-clean-deepseek-third-party-model-input,
        #cigh-clean-deepseek-thinking-input,
        #cigh-clean-pet-name-input,
        #cigh-clean-model-input,
        #cigh-clean-thinking-input,
        #cigh-clean-provider-input,
        #cigh-clean-firebase-location-input,
        #cigh-clean-firebase-sdk-input,
        #cigh-clean-cloud-code-input,
        #cigh-clean-cloud-password-input,
        #cigh-clean-font-size-input
      ) { font-size: var(--cigh-size-settings-control-font) !important; }
      #${SETTINGS_ID}[data-cigh-font] :is(#cigh-clean-style-input, #cigh-clean-firebase-input) {
        font-size: var(--cigh-size-settings-textarea-font) !important;
      }
      #${SETTINGS_ID}[data-cigh-font] :is(.cigh-clean-checkrow, .cigh-clean-set-btn) {
        font-size: var(--cigh-size-settings-action-font) !important;
      }
      #${SETTINGS_ID}[data-cigh-font] .cigh-clean-settings-help { font-size: var(--cigh-size-settings-help-font) !important; }

      /* small: 기본 구조 유지, 기존 미세 보정만 유지 */
      #${PANEL_ID}[data-cigh-font="small"] .cigh-clean-ft { padding-left: 1px !important; }

      /* medium: 구조/간격 차이만 별도 유지 */
      #${FAB_ID}[data-cigh-font="medium"] {
        width: 37px !important;
        height: 37px !important;
        font-size: 16px !important;
        border-radius: 7px !important;
      }
      #${PANEL_ID}[data-cigh-font="medium"] {
        height: 431px !important;
        border-radius: 8px !important;
      }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-head {
        height: 28px !important;
        min-height: 28px !important;
        padding: 0 8px !important;
        gap: 7px !important;
      }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-x { padding: 0 2px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-tabs { height: 28px !important; min-height: 28px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-main { padding: 8px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-log-inner { line-height: 1.56 !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-sh { margin-bottom: 5px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-srow { gap: 7px !important; padding: 3px 0 !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-sval { max-width: 181px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-blbl { margin-bottom: 4px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-heart { width: 15px !important; height: 15px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-pixelbar { height: 6px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-irow { gap: 6px !important; padding: 3px 1px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-ico { width: 17px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-foot { height: auto !important; min-height: 21px !important; padding: 3px 8px !important; }
      #${PANEL_ID}[data-cigh-font="medium"] .cigh-clean-ft { line-height: 1.35 !important; }
      #${POPUP_ID}[data-cigh-font="medium"],
      #${COMMENT_POPUP_ID}[data-cigh-font="medium"] {
        width: 247px !important;
        padding: 8px 11px !important;
        border-radius: 5px !important;
      }
      #${POPUP_ID}[data-cigh-font="medium"] .cigh-clean-popup-line,
      #${COMMENT_POPUP_ID}[data-cigh-font="medium"] .cigh-clean-comment-text { line-height: 1.52 !important; }
      #${SETTINGS_ID}[data-cigh-font="medium"] { padding: 8px !important; }
      #${SETTINGS_ID}[data-cigh-font="medium"] :is(
        #cigh-clean-api-input,
        #cigh-clean-deepseek-api-input,
        #cigh-clean-deepseek-base-url-input,
        #cigh-clean-deepseek-model-input,
        #cigh-clean-deepseek-third-party-model-input,
        #cigh-clean-deepseek-thinking-input,
        #cigh-clean-pet-name-input,
        #cigh-clean-model-input,
        #cigh-clean-thinking-input,
        #cigh-clean-provider-input,
        #cigh-clean-firebase-location-input,
        #cigh-clean-firebase-sdk-input,
        #cigh-clean-cloud-code-input,
        #cigh-clean-cloud-password-input,
        #cigh-clean-font-size-input
      ) { height: 28px !important; }
      #${SETTINGS_ID}[data-cigh-font="medium"] .cigh-clean-set-btn { height: 26px !important; }

      /* large: 구조/간격 차이만 별도 유지 */
      #${FAB_ID}[data-cigh-font="large"] {
        width: 43px !important;
        height: 43px !important;
        font-size: 19px !important;
        border-radius: 8px !important;
      }
      #${PANEL_ID}[data-cigh-font="large"] {
        height: 519px !important;
        border-radius: 9px !important;
      }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-head {
        height: 39px !important;
        min-height: 39px !important;
        padding: 0 11px !important;
        gap: 8px !important;
      }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-x { padding: 0 3px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-tabs { height: 37px !important; min-height: 37px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-main { padding: 11px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-log-inner { line-height: 1.62 !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-sh { margin-bottom: 7px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-srow { gap: 9px !important; padding: 4px 0 !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-sval { max-width: 219px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-blbl { margin-bottom: 5px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-heart { width: 17px !important; height: 17px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-pixelbar { height: 8px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-irow { gap: 8px !important; padding: 5px 1px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-ico { width: 21px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-foot { height: auto !important; min-height: 27px !important; padding: 4px 11px !important; }
      #${PANEL_ID}[data-cigh-font="large"] .cigh-clean-ft { line-height: 1.35 !important; }
      #${POPUP_ID}[data-cigh-font="large"],
      #${COMMENT_POPUP_ID}[data-cigh-font="large"] {
        width: 299px !important;
        padding: 9px 12px !important;
        border-radius: 6px !important;
      }
      #${POPUP_ID}[data-cigh-font="large"] .cigh-clean-popup-line,
      #${COMMENT_POPUP_ID}[data-cigh-font="large"] .cigh-clean-comment-text { line-height: 1.55 !important; }
      #${SETTINGS_ID}[data-cigh-font="large"] { padding: 11px !important; }
      #${SETTINGS_ID}[data-cigh-font="large"] :is(
        #cigh-clean-api-input,
        #cigh-clean-deepseek-api-input,
        #cigh-clean-deepseek-base-url-input,
        #cigh-clean-deepseek-model-input,
        #cigh-clean-deepseek-third-party-model-input,
        #cigh-clean-deepseek-thinking-input,
        #cigh-clean-pet-name-input,
        #cigh-clean-model-input,
        #cigh-clean-thinking-input,
        #cigh-clean-provider-input,
        #cigh-clean-firebase-location-input,
        #cigh-clean-firebase-sdk-input,
        #cigh-clean-cloud-code-input,
        #cigh-clean-cloud-password-input,
        #cigh-clean-font-size-input
      ) { height: 33px !important; }
      #${SETTINGS_ID}[data-cigh-font="large"] .cigh-clean-set-btn { height: 31px !important; }

      #${MASCOT_ID} {
        position: fixed;
        z-index: 2147483640;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: max-content;
        max-width: calc(100vw - 12px);
        cursor: grab;
        touch-action: none;
        user-select: none;
      }
      #${MASCOT_ID}.grab { cursor: grabbing; }
      #${MASCOT_ID}.poke { animation: cigh-clean-mascot-jump 0.42s ease; }
      #${MASCOT_ID}.egg-poke .cigh-clean-mascot-body { animation: cigh-clean-egg-wobble 0.42s ease; }
      #${MASCOT_ID}.cigh-clean-mascot-happy .cigh-clean-pet-svg,
      #${MASCOT_ID}.cigh-clean-mascot-happy .cigh-clean-pet-img-wrap {
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)) drop-shadow(0 0 8px var(--cigh-accent-soft));
      }
      #${MASCOT_ID}.cigh-clean-mascot-scared .cigh-clean-mascot-body {
        animation: cigh-clean-mascot-shiver 0.12s linear infinite;
      }
      #${MASCOT_ID}.cigh-clean-mascot-sad .cigh-clean-mascot-body::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 10px;
        background: rgba(80,150,255,.16);
        pointer-events: none;
        mix-blend-mode: screen;
      }
      .cigh-clean-mascot-body {
        position: relative;
        z-index: 2;
      }
      .cigh-clean-mascot-body .cigh-clean-pet-svg,
      .cigh-clean-mascot-body .cigh-clean-pet-img-wrap {
        image-rendering: pixelated;
        animation: cigh-clean-float 2.4s ease-in-out infinite;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.35));
      }
      .cigh-clean-mascot-body.is-sleep .cigh-clean-pet-svg,
      .cigh-clean-mascot-body.is-sleep .cigh-clean-pet-img-wrap,
      .cigh-clean-mascot-body [data-cigh-pet-mode="sleep"] {
        animation: cigh-clean-sleep-breathe 2.2s ease-in-out infinite;
        transform-origin: center bottom;
      }
      .cigh-clean-mascot-speech {
        display: none;
        position: absolute;
        left: 50%;
        bottom: calc(100% + 4px);
        transform: translateX(-50%);
        z-index: 4;
        width: max-content;
        min-width: 56px;
        max-width: min(240px, calc(100vw - 24px));
        background: transparent;
        border: 0;
        border-radius: 0;
        padding: 1px 2px;
        font-family: "Courier New", Consolas, monospace;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.25;
        color: var(--cigh-text);
        white-space: pre-line;
        overflow-wrap: break-word;
        word-break: keep-all;
        text-align: center;
        paint-order: stroke fill;
        -webkit-text-stroke: 0.35px var(--cigh-bg);
        box-shadow: none;
        pointer-events: none;
      }
      .cigh-clean-mascot-speech.show {
        display: block;
        animation: cigh-clean-mascot-speech-pop 0.22s ease;
      }
      @keyframes cigh-clean-mascot-speech-pop {
        0% { opacity: 0; transform: translateX(-50%); }
        100% { opacity: 1; transform: translateX(-50%); }
      }
      .cigh-clean-mascot-fx {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 64px;
        height: 64px;
        transform: translate(-50%, -34%);
        pointer-events: none;
        overflow: visible;
        z-index: 3;
      }
      .cigh-clean-mascot-fx-dot {
        position: absolute;
        width: 5px;
        height: 5px;
        border-radius: 2px;
        background: var(--cigh-accent);
        color: var(--cigh-accent);
        font-family: "Courier New", Consolas, monospace;
        font-size: 10px;
        line-height: 1;
        text-align: center;
        image-rendering: pixelated;
        opacity: 0;
        transform: translate(-50%, -50%);
        animation: cigh-clean-mascot-float-dot var(--dur, 900ms) ease-out forwards;
      }
      .cigh-clean-mascot-fx-dot.heart {
        width: 8px;
        height: 8px;
        border-radius: 2px;
        background: #ff9ec4;
        color: #ff9ec4;
      }
      .cigh-clean-mascot-fx-dot.heart:not(:empty) { background: transparent !important; }
      .cigh-clean-mascot-fx-dot.spark,
      .cigh-clean-mascot-fx-dot.flower,
      .cigh-clean-mascot-fx-dot.zzz {
        width: auto;
        height: auto;
        background: transparent !important;
        color: var(--cigh-accent);
        font-size: 11px;
      }
      .cigh-clean-mascot-fx-dot.zzz {
        color: #86c8ff;
        font-family: ui-rounded, "Apple SD Gothic Neo", "Segoe UI Rounded", system-ui, sans-serif;
        font-size: 10px;
        font-weight: 800;
        font-style: italic;
        letter-spacing: .015em;
        transform: translate(-50%, -50%) rotate(-8deg);
      }
      .cigh-clean-mascot-fx-dot.sweat,
      .cigh-clean-mascot-fx-dot.tear {
        width: 5px;
        height: 9px;
        border-radius: 999px 999px 999px 2px;
        background: #9ecbf0;
        box-shadow: 0 0 4px rgba(158,203,240,.45);
      }
      .cigh-clean-mascot-fx-dot.tear { background: #7fb9f0; }
      .cigh-clean-mascot-blush {
        position: absolute;
        top: 39%;
        width: 8px;
        height: 5px;
        border-radius: 999px;
        background: rgba(255,130,178,.55);
        filter: blur(.2px);
        pointer-events: none;
        z-index: 3;
        animation: cigh-clean-mascot-blush 2.5s ease forwards;
      }
      .cigh-clean-mascot-blush.left { left: 23%; }
      .cigh-clean-mascot-blush.right { right: 23%; }
      @keyframes cigh-clean-mascot-jump {
        0%, 100% { transform: translateY(0); }
        40% { transform: translateY(-9px); }
      }
      @keyframes cigh-clean-egg-wobble {
        0%, 100% { transform: rotate(0deg) scale(1); }
        25% { transform: rotate(-5deg) scale(0.995); }
        50% { transform: rotate(4deg) scale(1.005); }
        75% { transform: rotate(-3deg) scale(0.998); }
      }
      @keyframes cigh-clean-mascot-shiver {
        0%, 100% { left: 0; }
        25% { left: -1.5px; }
        50% { left: 1px; }
        75% { left: -1px; }
      }
      @keyframes cigh-clean-mascot-float-dot {
        0% { opacity: 0; transform: translate(-50%, -50%) translate(0, 0) scale(.75); }
        18% { opacity: 1; }
        100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--mx, 0), var(--my, -26px)) scale(1.15); }
      }
      @keyframes cigh-clean-mascot-blush {
        0%, 82% { opacity: .85; }
        100% { opacity: 0; }
      }

      /* ── Achievements / Titles (무테두리 + 셔머) ── */
      .cigh-clean-achv-filter {
        display:flex; gap:4px; margin:0 0 7px;
      }
      .cigh-clean-achv-filter button {
        flex:1; padding:6px 0; border-radius:14px; cursor:pointer;
        font-family:inherit; font-size:calc(8px * var(--cigh-ui-font-scale, 1));
        background:var(--cigh-bg-2); border:1px solid var(--cigh-border-faint);
        color:var(--cigh-text-dim);
      }
      .cigh-clean-achv-filter button.on {
        border-color:var(--cigh-accent); color:var(--cigh-accent);
        background:color-mix(in srgb,var(--cigh-accent) 8%,var(--cigh-bg-2));
      }
      .cigh-clean-achv-filter em { font-style:normal; opacity:.6; margin-left:3px; }
      .cigh-clean-achv-filter-empty { grid-column:1 / -1; }
      .cigh-clean-achv-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: calc(6px * var(--cigh-ui-font-scale, 1));
        margin-top: calc(2px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-achv-card {
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(2px * var(--cigh-ui-font-scale, 1));
        padding: calc(8px * var(--cigh-ui-font-scale, 1)) calc(4px * var(--cigh-ui-font-scale, 1)) calc(7px * var(--cigh-ui-font-scale, 1));
        min-height: calc(66px * var(--cigh-ui-font-scale, 1));
        border: 0;
        border-radius: 6px;
        background: var(--cigh-bg-2);
        text-align: center;
        cursor: default;
      }
      .cigh-clean-achv-gaugebar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        gap: 1px;
        height: 2px;
        padding: 0 2px;
        box-sizing: border-box;
      }
      .cigh-clean-achv-gaugebar span {
        background: var(--cigh-fill);
      }
      .cigh-clean-achv-gaugebar span.on {
        background: var(--achv-gauge-color, var(--achv-rank-color));
        box-shadow: 0 0 3px color-mix(in srgb, var(--achv-gauge-color, var(--achv-rank-color)) 55%, transparent);
      }
      .cigh-clean-achv-card.locked,
      .cigh-clean-achv-card.secret {
        background: color-mix(in srgb, var(--cigh-bg-2) 70%, transparent);
      }
      .cigh-clean-achv-card.locked { opacity:.60; }
      .cigh-clean-achv-card.secret { opacity:.42; filter:grayscale(.4); }
      .cigh-clean-achv-rank {
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .08em;
        color: var(--achv-rank-color, var(--cigh-text-faint));
      }
      .cigh-clean-achv-icon { font-size: calc(18px * var(--cigh-ui-font-scale, 1)); line-height: 1.1; }
      .cigh-clean-achv-card.locked .cigh-clean-achv-icon,
      .cigh-clean-achv-card.secret .cigh-clean-achv-icon { filter: grayscale(1); opacity: .55; }
      .cigh-clean-achv-name {
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        line-height: 1.25;
        color: var(--cigh-text);
        word-break: keep-all;
      }
      .cigh-clean-achv-card.locked .cigh-clean-achv-name,
      .cigh-clean-achv-card.secret .cigh-clean-achv-name { color: var(--cigh-text-faint); }
      .cigh-clean-achv-prog {
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(8.5px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text-dim);
      }
      .cigh-clean-achv-done {
        font-size: calc(8.5px * var(--cigh-ui-font-scale, 1));
        letter-spacing: .08em;
        color: var(--cigh-good);
      }
      .cigh-clean-achv-card.equipped {
        box-shadow:
          inset 0 0 0 1px var(--cigh-accent),
          0 0 8px var(--cigh-accent-soft);
      }
      .cigh-clean-achv-card.unlocked { cursor: pointer; }
      .cigh-clean-achv-card.unlocked:hover {
        box-shadow: inset 0 0 0 1px var(--cigh-accent-soft);
      }
      .cigh-clean-achv-card.unlocked.equipped:hover {
        box-shadow:
          inset 0 0 0 1px var(--cigh-accent),
          0 0 10px var(--cigh-accent-soft);
      }
      .cigh-clean-achv-shimmer {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        opacity: 0;
        z-index: 1;
      }
      .cigh-clean-achv-card.locked .cigh-clean-achv-shimmer,
      .cigh-clean-achv-card.secret .cigh-clean-achv-shimmer { display: none; }
      .cigh-clean-achv-card.unlocked .cigh-clean-achv-shimmer { opacity: 1; }
      .cigh-clean-achv-shimmer::before {
        content: '';
        position: absolute;
        top: -20%;
        bottom: -20%;
        left: 0;
        width: 45%;
        background: linear-gradient(105deg, transparent 0%, var(--achv-shimmer-color, rgba(255,255,255,.1)) 50%, transparent 100%);
        transform: translateX(-150%) skewX(-16deg);
        will-change: transform;
        animation: cigh-clean-achv-shimmer 3.8s ease-in-out infinite;
      }
      .cigh-clean-achv-card.rank-N   { --achv-shimmer-color: rgba(255,255,255,.10); }
      .cigh-clean-achv-card.rank-R   { --achv-shimmer-color: rgba(120,180,255,.22); }
      .cigh-clean-achv-card.rank-SR  { --achv-shimmer-color: rgba(200,140,255,.32); }
      .cigh-clean-achv-card.rank-SSR { --achv-shimmer-color: rgba(255,200,90,.44); }
      .cigh-clean-achv-rank,
      .cigh-clean-achv-icon,
      .cigh-clean-achv-name,
      .cigh-clean-achv-prog,
      .cigh-clean-achv-done { position: relative; z-index: 2; }
      @keyframes cigh-clean-achv-shimmer {
        0% { transform: translateX(-150%) skewX(-16deg); }
        55%, 100% { transform: translateX(260%) skewX(-16deg); }
      }
      /* PET 탭: 마이룸 아래 칭호·이름 스트립 */
      .cigh-clean-pet-id {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin: 6px 0 2px;
        font-family: "Courier New", Consolas, monospace;
      }
      .cigh-clean-pet-title {
        --title-color: var(--cigh-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
        box-sizing: border-box;
        min-height: calc(16px * var(--cigh-ui-font-scale, 1));
        padding: 1px 7px;
        border-radius: 999px;
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
        font-weight: 700;
        letter-spacing: .02em;
        color: var(--title-color);
        background: color-mix(in srgb, var(--title-color) 14%, var(--cigh-bg-3));
        border: 1px solid color-mix(in srgb, var(--title-color) 38%, var(--cigh-border-soft));
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--title-color) 10%, transparent);
        white-space: nowrap;
      }
      .cigh-clean-pet-title.rank-R {
        text-shadow: 0 0 6px color-mix(in srgb, var(--title-color) 30%, transparent);
      }
      .cigh-clean-pet-title.rank-SR {
        text-shadow: 0 0 7px color-mix(in srgb, var(--title-color) 34%, transparent);
      }
      .cigh-clean-pet-title.rank-SSR {
        text-shadow: 0 0 8px color-mix(in srgb, var(--title-color) 42%, transparent);
        box-shadow:
          inset 0 0 0 1px color-mix(in srgb, var(--title-color) 18%, transparent),
          0 0 8px color-mix(in srgb, var(--title-color) 18%, transparent);
      }
      .cigh-clean-pet-title-text {
        position: relative;
        z-index: 2;
      }
      .cigh-clean-pet-title-shimmer {
        display: none;
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 1;
      }
      .cigh-clean-pet-title.rank-SSR .cigh-clean-pet-title-shimmer {
        display: block;
      }
      .cigh-clean-pet-title-shimmer::before {
        content: '';
        position: absolute;
        top: -30%;
        bottom: -30%;
        left: 0;
        width: 42%;
        background: linear-gradient(105deg, transparent 0%, color-mix(in srgb, var(--title-color) 38%, transparent) 50%, transparent 100%);
        transform: translateX(-160%) skewX(-16deg);
        will-change: transform;
        animation: cigh-clean-pet-title-shimmer 4.4s ease-in-out infinite;
      }
      @keyframes cigh-clean-pet-title-shimmer {
        0% { transform: translateX(-160%) skewX(-16deg); }
        58%, 100% { transform: translateX(285%) skewX(-16deg); }
      }
      .cigh-clean-pet-name {
        display: inline-flex;
        align-items: center;
        min-height: calc(16px * var(--cigh-ui-font-scale, 1));
        font-size: calc(12px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
        font-weight: 700;
        color: var(--cigh-text);
      }
      .cigh-clean-exp-lv {
        display: inline-block;
        margin-right: 6px;
        padding: 0 6px;
        border-radius: 4px;
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        color: var(--cigh-bg);
        background: var(--cigh-accent);
        vertical-align: middle;
      }

      .cigh-clean-player-subtabs {
        position: relative;
        z-index: 6;
        isolation: isolate;
        overflow: hidden;
        display: grid;
        grid-template-columns: 1fr 1fr;
        height: calc(25px * var(--cigh-ui-font-scale, 1));
        min-height: calc(25px * var(--cigh-ui-font-scale, 1));
        margin: -8px -8px 8px;
        background: var(--cigh-bg-3);
        border-top: 1px solid var(--cigh-border-faint);
        border-bottom: 1px solid var(--cigh-border-faint);
        box-sizing: border-box;
        contain: layout paint;
      }
      .cigh-clean-player-subtab {
        position: relative;
        z-index: 1;
        pointer-events: auto;
        border: none;
        border-right: 1px solid var(--cigh-border-faint);
        border-radius: 0;
        background: transparent;
        color: var(--cigh-text-faint);
        font: inherit;
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .12em;
        padding: 0 2px;
        cursor: pointer;
      }
      .cigh-clean-player-subtab:last-child { border-right: none; }
      .cigh-clean-player-subtab:hover { color: var(--cigh-accent); }
      .cigh-clean-player-subtab.on {
        color: var(--cigh-accent);
        background: var(--cigh-accent-softer);
      }
      .cigh-clean-record-hero {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: calc(6px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(7px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-record-card {
        display: grid;
        gap: 3px;
        padding: calc(8px * var(--cigh-ui-font-scale, 1));
        border: 1px solid var(--cigh-border-soft);
        border-radius: 6px;
        background: var(--cigh-bg-2);
      }
      .cigh-clean-record-card span {
        color: var(--cigh-text-faint);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(8px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .08em;
      }
      .cigh-clean-record-card b {
        color: var(--cigh-accent);
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(12px * var(--cigh-ui-font-scale, 1));
        line-height: 1.2;
      }
      .cigh-clean-record-card i {
        display:block; margin-top:3px; font-style:normal;
        font-size:calc(7px * var(--cigh-ui-font-scale, 1));
        color:var(--cigh-text-faint); letter-spacing:.2px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .cigh-clean-record-sync-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
        margin-top: 7px;
        padding-top: 7px;
        border-top: 1px dashed var(--cigh-border-faint);
        color: var(--cigh-text-faint);
        font-size: calc(8.5px * var(--cigh-ui-font-scale, 1));
        line-height: 1.35;
      }
      .cigh-clean-record-sync-row b { color: var(--cigh-accent); }
      .cigh-clean-record-sync-row button {
        height: calc(22px * var(--cigh-ui-font-scale, 1));
        padding: 0 8px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 4px;
        background: var(--cigh-bg-3);
        color: var(--cigh-text-soft);
        font: inherit;
        font-size: calc(8.5px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        cursor: pointer;
      }
      .cigh-clean-record-sync-row button:hover { color: var(--cigh-accent); border-color: var(--cigh-accent-soft); }
      .cigh-clean-record-sync-row button:disabled { opacity: .45; cursor: wait; }
      .cigh-clean-record-story-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 7px;
        align-items: center;
        padding: 5px 0;
        border-bottom: 1px solid var(--cigh-border-faint);
        color: var(--cigh-text-soft);
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-record-story-row:last-child { border-bottom: none; }
      .cigh-clean-record-story-row span { min-width: 0; overflow-wrap: anywhere; }
      .cigh-clean-record-story-row span b {
        color: var(--cigh-text-faint);
        font-family: "Courier New", Consolas, monospace;
      }
      .cigh-clean-record-story-row strong {
        color: var(--cigh-accent);
        font-family: "Courier New", Consolas, monospace;
        white-space: nowrap;
      }
      .cigh-clean-record-note {
        margin-top: 8px;
        color: var(--cigh-text-faint);
        font-size: calc(8.5px * var(--cigh-ui-font-scale, 1));
        line-height: 1.45;
      }

      .cigh-clean-pet-subtabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        height: calc(25px * var(--cigh-ui-font-scale, 1));
        min-height: calc(25px * var(--cigh-ui-font-scale, 1));
        margin: -8px -8px 8px;
        background: var(--cigh-bg-3);
        border-top: 1px solid var(--cigh-border-faint);
        border-bottom: 1px solid var(--cigh-border-faint);
        box-sizing: border-box;
        contain: layout paint;
      }
      .cigh-clean-pet-subtab {
        border: none;
        border-right: 1px solid var(--cigh-border-faint);
        border-radius: 0;
        background: transparent;
        color: var(--cigh-text-faint);
        font: inherit;
        font-size: calc(9.5px * var(--cigh-ui-font-scale, 1));
        font-weight: 700;
        letter-spacing: .12em;
        padding: 0 2px;
        cursor: pointer;
      }
      .cigh-clean-pet-subtab:last-child { border-right: none; }
      .cigh-clean-pet-subtab:hover { color: var(--cigh-accent); }
      .cigh-clean-pet-subtab.on {
        color: var(--cigh-accent);
        background: var(--cigh-accent-softer);
      }
      .cigh-clean-diary-list { display: grid; gap: calc(7px * var(--cigh-ui-font-scale, 1)); }
      .cigh-clean-diary-card {
        border: 1px solid var(--cigh-border-soft);
        border-left: 2px solid color-mix(in srgb, var(--cigh-accent) 55%, var(--cigh-border-soft));
        border-radius: 6px;
        background: var(--cigh-bg-2);
        padding: calc(6px * var(--cigh-ui-font-scale, 1)) calc(7px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-diary-head {
        display: flex;
        align-items: center;
        gap: calc(5px * var(--cigh-ui-font-scale, 1));
        margin-bottom: calc(4px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-diary-mood { font-size: var(--cigh-diary-mood-size, calc(12px * var(--cigh-ui-font-scale, 1))); line-height: 1; }
      .cigh-clean-diary-date {
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: var(--cigh-diary-date-size, calc(9px * var(--cigh-ui-font-scale, 1)));
        letter-spacing: .04em;
      }
      .cigh-clean-diary-line {
        color: var(--cigh-text);
        font-size: var(--cigh-diary-line-size, calc(10px * var(--cigh-ui-font-scale, 1)));
        line-height: 1.5;
        white-space: pre-line;
        word-break: keep-all;
        overflow-wrap: anywhere;
        margin-bottom: calc(5px * var(--cigh-ui-font-scale, 1));
      }
      .cigh-clean-diary-chips { display: flex; flex-wrap: wrap; gap: calc(4px * var(--cigh-ui-font-scale, 1)); }
      .cigh-clean-diary-chip {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 1px calc(6px * var(--cigh-ui-font-scale, 1));
        border-radius: 999px;
        background: color-mix(in srgb, var(--cigh-fill) 80%, transparent);
        border: 1px solid var(--cigh-border-faint);
        color: var(--cigh-text-soft);
        font-family: "Courier New", Consolas, monospace;
        font-size: var(--cigh-diary-chip-size, calc(8px * var(--cigh-ui-font-scale, 1)));
        line-height: 1.35;
        white-space: nowrap;
      }
      .cigh-clean-diary-chip.evolve {
        color: var(--cigh-accent);
        border-color: color-mix(in srgb, var(--cigh-accent) 40%, var(--cigh-border-soft));
        background: color-mix(in srgb, var(--cigh-accent) 12%, transparent);
      }
      .cigh-clean-diary-chip.rainbow {
        color: var(--cigh-accent);
        border-color: color-mix(in srgb, var(--cigh-accent) 40%, var(--cigh-border-soft));
        background: color-mix(in srgb, var(--cigh-accent) 10%, transparent);
      }
      .cigh-clean-diary-card.special {
        border-left-width: 3px;
        border-left-color: var(--cigh-accent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 16%, transparent);
      }
      .cigh-clean-diary-empty {
        display: grid;
        place-items: center;
        gap: calc(4px * var(--cigh-ui-font-scale, 1));
        min-height: calc(96px * var(--cigh-ui-font-scale, 1));
        padding: calc(10px * var(--cigh-ui-font-scale, 1)) calc(4px * var(--cigh-ui-font-scale, 1));
        text-align: center;
        color: var(--cigh-text-dim);
      }
      .cigh-clean-diary-empty-icon {
        font-size: calc(16px * var(--cigh-ui-font-scale, 1));
        line-height: 1;
      }
      .cigh-clean-diary-empty span:not(.cigh-clean-diary-empty-icon) {
        font-size: var(--cigh-diary-empty-title-size, calc(10px * var(--cigh-ui-font-scale, 1)));
        line-height: 1.35;
        color: var(--cigh-text-soft);
      }
      .cigh-clean-diary-empty small {
        font-size: var(--cigh-diary-empty-help-size, calc(8.5px * var(--cigh-ui-font-scale, 1)));
        line-height: 1.35;
        max-width: 100%;
      }

      .cigh-clean-pet-subtabs.three { grid-template-columns: 1fr 1fr 1fr; }
      .cigh-clean-dex-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
        gap: calc(8px * var(--cigh-ui-font-scale, 1));
        margin-top: 2px;
      }
      .cigh-clean-dex-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: calc(4px * var(--cigh-ui-font-scale, 1));
        padding: calc(8px * var(--cigh-ui-font-scale, 1)) 4px;
        border: 1px solid var(--cigh-border-soft);
        border-radius: 7px;
        background: color-mix(in srgb, var(--cigh-bg-2) 72%, transparent);
      }
      .cigh-clean-dex-card.found {
        background: var(--cigh-bg-2);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cigh-accent) 18%, transparent);
      }
      .cigh-clean-dex-figure {
        display: grid;
        place-items: center;
        min-height: calc(58px * var(--cigh-ui-font-scale, 1));
        image-rendering: pixelated;
      }
      .cigh-clean-dex-img {
        width: calc(58px * var(--cigh-ui-font-scale, 1));
        height: calc(58px * var(--cigh-ui-font-scale, 1));
        object-fit: contain;
        image-rendering: pixelated;
      }
      .cigh-clean-dex-card:not(.found) .cigh-clean-dex-figure { opacity: .7; }
      .cigh-clean-dex-name {
        font-family: "Courier New", Consolas, monospace;
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text-soft);
        text-align: center;
        word-break: keep-all;
      }
      .cigh-clean-dex-card.found .cigh-clean-dex-name { color: var(--cigh-text); }
      .cigh-clean-dex-help {
        margin-top: calc(8px * var(--cigh-ui-font-scale, 1));
        color: var(--cigh-text-dim);
        font-size: calc(9px * var(--cigh-ui-font-scale, 1));
        line-height: 1.4;
      }

      @media (max-width: 520px) {
        #${FAB_ID} { left: 12px; bottom: 76px; }
        #${PANEL_ID} {
          left: 6px !important;
          right: 6px !important;
          bottom: 70px !important;
          top: auto !important;
          width: auto;
        }
        #${POPUP_ID},
        #${COMMENT_POPUP_ID} {
          width: min(218px, calc(100vw - 24px));
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  function runWhenIdle(fn, timeout = 900) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fn, { timeout });
    } else {
      setTimeout(fn, Math.min(timeout, 320));
    }
  }

  function init() {
    if (!document.body) {
      requestAnimationFrame(init);
      return;
    }

    installCrackRecordEventWatcher();
    // 기존 history.logs를 업적 카운터로 백필한 뒤 저장소를 줄여야 하므로 이 순서를 유지한다.
    migrateContentExpansionV280();
    migrateAchievementExpansionV320();
    migrateRerollCostFixV320();
    // 클라우드를 쓰지 않아도 기존 로컬 저장본을 한 번 자동 다이어트한다.
    compactExistingLocalStore();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        flushPendingRoomLogs();
        writeLastSeenAt(Date.now());
        pauseBackgroundLoops();
      } else {
        resumeBackgroundLoops();
        applyIdleReward();
        scheduleCrackAttendanceCheck(700);
      }
    });

    window.addEventListener('focus', () => scheduleCrackAttendanceCheck(700));
    document.addEventListener('click', onPossibleNativeAttendanceClick, true);

    window.addEventListener('pagehide', () => { flushPendingRoomLogs();writeLastSeenAt(Date.now()); }, { passive: true });

    window.addEventListener('storage', event => {
      if (!event.key || event.key === STORE_KEY) __cighStoreCache = null;
      if (!event.key || event.key === CUSTOM_DECO_STORE) {
        customDecoCache = null;
        customDecoImageCache.clear();
      }
    });

    window.addEventListener('resize', () => scheduleViewportClamp(true), { passive: true });
    window.addEventListener('orientationchange', () => scheduleViewportClamp(true), { passive: true });
    // 모바일 키보드가 올라올 때 visualViewport resize/scroll이 발생해 HUD를 스크롤/이동으로 오인할 수 있어 비활성화.
    // window.visualViewport?.addEventListener?.('resize', () => scheduleViewportClamp(true), { passive: true });
    // window.visualViewport?.addEventListener?.('scroll', () => scheduleViewportClamp(true), { passive: true });

    // 시작 직후 크랙 본체 렌더링과 큰 CSS/스토리지 파싱이 한 번에 겹치지 않도록
    // HUD 초기화 작업을 짧게 분산한다. 기능은 유지하고 첫 3~5초 버벅임만 줄이는 저위험 패치.
    setTimeout(() => {
      buildUI();
      watchThemeMode();
      requestAnimationFrame(() => clampHudToViewport(false));

      const room = document.getElementById('cigh-clean-room');
      if (room) room.textContent = roomKey().slice(-22);
    }, 260);

    setTimeout(() => {
      loadRoomData();
      patchRoute();
    }, 720);

    setTimeout(() => {
      watchAutoAnalyze();
    }, 1050);

    runWhenIdle(() => {
      syncMascotForRoute();
      schedulePetVisualTick(1600);
    }, 1600);

    setTimeout(() => applyIdleReward(), 1400);
    setTimeout(() => scheduleCrackAttendanceCheck(0), 2100);
  }

  function syncPetGrowthAchievements(pet) {
    // [업적] 펫 성장 카운터
    {
      const st = petStageFromLevel(pet.level).stage;
      const state = readAchvState();
      let changed = false;
      const setFlag = (k, cond) => {
        if (cond && !Number(state.counters[k])) {
          state.counters[k] = 1;
          changed = true;
        }
      };
      setFlag('petBaby', st >= 1);
      setFlag('petBondMax', Number(pet.bondLevel || 0) >= 4);
      setFlag('petFinal', st >= 4);
      if (changed) {
        evaluateAchvUnlocks(state);
        writeAchvState(state);
      }
    }
    if (petStageFromLevel(pet.level).stage >= 4) bumpAchvFinalForm(getPetDisplayFinalType(pet));

  }

  // 3.4.1: original PNG rendering restored; shop state and growth fixes retained.
  const SHOP_CATALOG = Object.freeze([
    { id: 'exp-small', name: '별사탕', kind: 'exp', amount: 60, price: 30, desc: '현재 펫의 경험치 +60', color: '#f6c773' },
    { id: 'exp-large', name: '은하수 병', kind: 'exp', amount: 240, price: 100, desc: '현재 펫의 경험치 +240', color: '#96a5ec' },
    ...[['heart','애정','#efa1b7'],['bloom','명랑','#efbd78'],['peace','평화','#a8c58f'],['tear','애상','#95bfe0'],['blade','시련','#b9a0da']].map(([tendency,label,color]) =>
      ({ id: `seed-${tendency}`, name: `${label}의 씨앗`, kind: 'tendency', tendency, amount: 5, price: 20, desc: `${label} 성향 +5 · 14레벨 이전`, color })),
    { id: 'scarf', name: '산호빛 머플러', kind: 'outfit', slot: 'neck', species: 'heart', price: 60, desc: '고양이 전용 · 목 장식', color: '#dd7c79' },
    { id: 'beret', name: '숲지기 베레모', kind: 'outfit', slot: 'head', species: 'heart', price: 80, desc: '고양이 전용 · 모자', color: '#8ca977' },
    { id: 'vest', name: '별무늬 조끼', kind: 'outfit', slot: 'body', species: 'heart', price: 90, desc: '고양이 전용 · 몸 장식', color: '#849fbe' },
  ]);
  const SHOP_BY_ID = new Map(SHOP_CATALOG.map(item => [item.id, item]));
  let shopNotice = '', shopBusy = false;
  let shopQueue = [], shopQueueTimer = 0, shopQueueRunning = false;
  const shopSeenCompletion = new Set();
  const shopSeenEntries = new WeakSet();
  const shopObservedSockets = new WeakSet();

  function shopSafeInt(value, fallback = 0, max = 1000000000) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : fallback;
  }

  function normalizeShop(raw) {
    if (raw?.version > 1) throw new Error('더 새로운 상점 저장 데이터입니다. 최신 HUD로 열어 주세요.');
    const bag = {}, owned = {};
    for (const item of SHOP_CATALOG) {
      if (item.kind === 'outfit') { if (raw?.owned?.[item.id] === true) owned[item.id] = true; }
      else { const count = shopSafeInt(raw?.bag?.[item.id], 0, 999); if (count) bag[item.id] = count; }
    }
    return { version: 1, coins: shopSafeInt(raw?.coins), bag, owned, revision: shopSafeInt(raw?.revision) };
  }

  function readShopState() { return normalizeShop(readStore()._shop); }

  function withShopLock(fn) {
    return globalThis.navigator?.locks?.request
      ? navigator.locks.request('cigh-store-v5', { mode: 'exclusive' }, fn)
      : Promise.resolve().then(fn);
  }

  function commitShopRoom(key, fn) {
    const store = readStore();
    const room = JSON.parse(JSON.stringify(store[key] || emptyRoom()));
    const shop = normalizeShop(store._shop);
    const result = fn(room, shop);
    shop.revision++;
    writeStore({ ...store, [key]: room, _shop: shop });
    return result;
  }

  function hasShopReward(room, found) {
    return !!room.shopRewardKeys?.[found.key] || !!room.shopRewardKeys?.['content:' + found.contentKey] || room.lastAnalyzedKey === found.key ||
      room.lastAnalyzedContentKey === found.contentKey || (room.analyzedContentKeys || []).includes(found.contentKey);
  }

  function markShopReward(room, found) {
    const keys = { ...(room.shopRewardKeys || {}) };
    if (room.lastAnalyzedKey) keys[room.lastAnalyzedKey] = 1;
    for (const key of [...(room.analyzedContentKeys || []), room.lastAnalyzedContentKey]) if (key) keys['content:' + key] = 1;
    if (found?.key) keys[found.key] = 1;
    if (found?.contentKey) keys['content:' + found.contentKey] = 1;
    room.shopRewardKeys = keys;
  }

  function applyShopAction(room, shop, action, id) {
    const item = SHOP_BY_ID.get(id);
    if (!item) throw new Error('알 수 없는 상품입니다.');
    const pet = getPet(room);
    if ((action === 'buy' || action === 'equip') && item.kind === 'outfit') throw new Error('원본 PNG에 맞춘 의상 재작업이 필요해 판매와 착용을 잠시 중지했어요.');
    if (action === 'refund') {
      if (item.kind !== 'outfit' || !shop.owned[id]) throw new Error('보유한 의상만 환불할 수 있어요.');
      if (shop.coins + item.price > 1000000000) throw new Error('코인 보유 한도를 초과해 환불할 수 없어요.');
      shop.coins += item.price;
      delete shop.owned[id];
      return `${item.name} 환불 완료! +${item.price} C`;
    }
    if (action === 'purchase-use') {
      if (item.kind === 'outfit') throw new Error('사용 가능한 성장 아이템이 아니에요.');
      if (shop.coins < item.price) throw new Error('코인이 부족해요.');
      // Purchase and effect are committed together. No inventory entry is retained.
      const previousCount = shop.bag[id] || 0;
      shop.bag[id] = previousCount + 1;
      const notice = applyShopAction(room, shop, 'use', id);
      shop.coins -= item.price;
      return `${notice} −${item.price} C`;
    }
    if (action === 'buy') {
      if (item.kind === 'outfit' && shop.owned[id]) throw new Error('이미 가지고 있는 의상이에요.');
      if (item.kind !== 'outfit' && (shop.bag[id] || 0) >= 999) throw new Error('이 아이템의 가방 수량이 가득 찼어요.');
      if (shop.coins < item.price) throw new Error('코인이 부족해요. 새 답변을 처음 분석하면 1 C를 받아요.');
      shop.coins -= item.price;
      if (item.kind === 'outfit') shop.owned[id] = true;
      else shop.bag[id] = (shop.bag[id] || 0) + 1;
      return `${item.name} 구매 완료! ${item.kind === 'outfit' ? '옷장에서 입혀 주세요.' : '가방에 넣었어요.'}`;
    }
    if (action !== 'use' || item.kind === 'outfit' || !(shop.bag[id] > 0)) throw new Error('가방에 사용 가능한 아이템이 없어요.');
    if (item.kind === 'exp') {
      if (pet.exp >= 1000000000000) throw new Error('더 이상 경험치를 추가할 수 없어요.');
      pet.exp = Math.min(1000000000000, pet.exp + item.amount);
      pet.level = Math.max(pet.level, petLevelFromExp(pet.exp));
      pet.stage = petStageFromLevel(pet.level).stage;
      if (pet.level >= 14 && !pet.fixedFinalType) pet.fixedFinalType = resolvePetFinalType(pet.tally);
    } else if (item.kind === 'tendency') {
      if (pet.level >= 14) throw new Error('성향 씨앗은 14레벨 이전에만 사용할 수 있어요. 다른 진화형을 키우려면 STATUS에서 이 방의 펫을 Lv.1로 초기화해 주세요.');
      pet.tally[item.tendency] = Math.min(1000000000, pet.tally[item.tendency] + item.amount);
      pet.finalType = petFinalType(pet.tally);
    }
    shop.bag[id]--;
    if (!shop.bag[id]) delete shop.bag[id];
    room.pet = pet;
    return `${item.name} 사용 완료!`;
  }



  function queueShopAnalysis(entry) {
    const meta = entry?.[2] || entry || {};
    const messageId = String(meta.msg_id || meta.fe_msg_id || meta.message_id || meta.id || '');
    const chatId = String(meta.chat_id || meta.episode_id || '');
    const key = roomKey();
    if (chatId && !key.endsWith(':' + chatId)) return;
    const identity = messageId ? `${key}:${messageId}` : '';
    if (identity && shopSeenCompletion.has(identity)) {
      // A later authoritative socket completion can fill a queued dataLayer placeholder.
      const waiting = shopQueue.find(job => job.key === key && job.messageId === messageId);
      if (waiting && meta.cighTarget) waiting.target = meta.cighTarget;
      return;
    }
    if (identity) { shopSeenCompletion.add(identity); if (shopSeenCompletion.size > 500) shopSeenCompletion.delete(shopSeenCompletion.values().next().value); }
    shopQueue.push({ key, epoch: cighAnalysisEpoch, messageId, tries: 0, stable: '', target: meta.cighTarget || null });
    if (!shopQueueRunning) { clearTimeout(shopQueueTimer); shopQueueTimer = setTimeout(drainShopAnalysis, 500); }
  }

  function observeShopSocket(socket) {
    if (shopObservedSockets.has(socket)) return;
    shopObservedSockets.add(socket);
    socket.addEventListener('message', event => {
      const evt = parseCrackSocketEvent(event.data);
      if (evt?.name !== 'characterMessageGenerated' || !isAutoAnalyzeEnabled()) return;
      if (evt.payload?.result && evt.payload.result !== 'SUCCESS') return;
      const data = evt.payload?.data;
      if (!data || typeof data.content !== 'string' || !data._id || String(data.chatId) !== currentCrackChatId()) return;
      const raw = data.content, { reply, info } = splitReplyAndInfo(raw);
      if (reply.length < 30 && !info) return;
      const entries = getLatestCrackLogEntries({ includeCodeBlocks: true });
      const context = entries.filter(e => e.group.getAttribute('data-message-group-id') !== String(data._id)).slice(-3).map(e => e.text).join('\n\n---\n\n').slice(-3600);
      queueShopAnalysis({ msg_id: data._id, chat_id: data.chatId,
        cighTarget: { raw, latestReply: reply, infoText: info, context, key: `socket:${data._id}`, contentKey: makeContentKey(reply, info) } });
    });
  }

  async function drainShopAnalysis() {
    if (shopQueueRunning) return;
    shopQueueRunning = true;
    try {
      const job = shopQueue[0];
      if (!job) return;
      if (!isAutoAnalyzeEnabled() || job.key !== roomKey() || job.epoch !== cighAnalysisEpoch) { shopQueue.shift(); return; }
      // Capture each completed DOM message, even if another analysis is still in flight.
      if (!job.target) {
        let found = null;
        if (job.messageId) {
          const scope = findCrackMessageScope();
          const group = scope?.querySelector(`[data-message-group-id="${CSS.escape(job.messageId)}"], [data-message-id="${CSS.escape(job.messageId)}"]`);
          const markdown = group?.querySelector('.wrtn-markdown:not(.not-wrtn-markdown)');
          if (markdown) {
            const raw = getCleanMarkdownText(markdown, { includeCodeBlocks: true });
            const { reply, info } = splitReplyAndInfo(raw);
            if (reply.length >= 30 || info) found = { raw, latestReply: reply, infoText: info, context: '', key: makeMessageKey(raw, group), contentKey: makeContentKey(reply, info) };
          }
        } else { found = findLatestContext(); }
        if (found && job.stable === found.contentKey) job.target = found;
        else { job.stable = found?.contentKey || ''; if (++job.tries >= 20) shopQueue.shift(); return; }
      }
      if (analyzeBusy) return;
      shopQueue.shift();
      await analyzeLatest(false, job.target);
    } finally {
      shopQueueRunning = false;
      if (shopQueue.length) shopQueueTimer = setTimeout(drainShopAnalysis, 500);
    }
  }

























  function renderPetSubTabsHTML() {
    return `<div class="cigh-clean-pet-subtabs four">${[['stats','📊 STATUS'],['diary','📔 DIARY'],['item','🎒 ITEM'],['dex','🐾 DEX']].map(([id,label]) => `<button type="button" class="cigh-clean-pet-subtab${petSubTab === id ? ' on' : ''}" data-pet-subtab="${id}">${label}</button>`).join('')}</div>`;
  }



  function refreshPetItems() {
    if (activeTab !== 'pet' || petSubTab !== 'item') return;
    const main = document.getElementById('cigh-clean-main');
    if (!main) return;
    const scroll = main.scrollTop;
    const focused = document.activeElement;
    const action = focused?.dataset?.itemAction, id = focused?.dataset?.itemId;
    renderContent();
    main.scrollTop = scroll;
    if (action && id) main.querySelector(`[data-item-action="${CSS.escape(action)}"][data-item-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
  }

  async function runShopAction(action, id) {
    if (shopBusy) return;
    const key = roomKey(), epoch = cighAnalysisEpoch;
    shopBusy = true;
    refreshPetItems();
    try {
      const notice = await withShopLock(() => {
        if (roomKey() !== key || epoch !== cighAnalysisEpoch) throw new Error('방이 바뀌었어요. 현재 방에서 다시 사용해 주세요.');
        return commitShopRoom(key, (room, shop) => applyShopAction(room, shop, action, id));
      });
      if (roomKey() === key && epoch === cighAnalysisEpoch) {
        shopNotice = notice;
        if (action === 'use' || action === 'purchase-use') {
          try { syncPetGrowthAchievements(getPet()); } catch(error) { console.warn('[CIGH] item saved, achievement update failed', error); }
        }
        if (shouldShowMascot()) updateMascotSprite();
        if (activeTab === 'pet' && petSubTab === 'stats') renderContent();
      }
    } catch(error) { if (roomKey() === key && epoch === cighAnalysisEpoch) shopNotice = error.message || '저장하지 못했어요.'; }
    finally { shopBusy = false; refreshPetItems(); }
  }

  function installPetShop() {
    document.addEventListener('click', event => {
      const button = event.target.closest?.('#cigh-clean-main [data-item-action]');
      if (!button || button.disabled) return;
      event.preventDefault();
      runShopAction(button.dataset.itemAction, button.dataset.itemId);
    });
    window.addEventListener('storage', event => {
      if (event.key === STORE_KEY || event.key === null) { __cighStoreCache = null; refreshPetItems(); }
    });
    const style = document.createElement('style');
    style.textContent = `.cigh-clean-pet-subtabs.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.cigh-clean-pet-subtabs.four .cigh-clean-pet-subtab{white-space:nowrap;font-size:calc(9px * var(--cigh-ui-font-scale,1));letter-spacing:.03em}
.cigh-clean-items{font:inherit;color:var(--cigh-text)}
.cigh-clean-item-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:5px;padding:7px 0;border-bottom:1px solid var(--cigh-border-faint)}
.cigh-clean-item-row:last-child{border-bottom:0}
.cigh-clean-item-copy{flex:1 1 100px;min-width:0}
.cigh-clean-item-copy strong{display:block;font-size:calc(10px * var(--cigh-ui-font-scale,1));font-weight:700;color:var(--cigh-text)}
.cigh-clean-item-copy strong span{color:var(--cigh-accent)}
.cigh-clean-item-copy small,.cigh-clean-item-note{display:block;color:var(--cigh-text-faint);font-size:calc(9px * var(--cigh-ui-font-scale,1));line-height:1.6;margin:3px 0 0;overflow-wrap:anywhere}
.cigh-clean-item-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px;max-width:100%}
.cigh-clean-items button{font:inherit;font-size:calc(9px * var(--cigh-ui-font-scale,1));color:var(--cigh-accent);background:var(--cigh-bg-3);border:1px solid var(--cigh-border-soft);border-radius:2px;padding:5px 7px;cursor:pointer}
.cigh-clean-items button:hover:not(:disabled){background:var(--cigh-accent-softer);border-color:var(--cigh-accent)}
.cigh-clean-items button:disabled{opacity:.4;cursor:default}
.cigh-clean-items button:focus-visible{outline:1px solid var(--cigh-accent);outline-offset:2px}
.cigh-clean-item-notice{font-size:calc(9px * var(--cigh-ui-font-scale,1));color:var(--cigh-text-soft);line-height:1.6;margin:4px 0 8px;overflow-wrap:anywhere}
.cigh-clean-item-legacy{margin-top:10px;color:var(--cigh-text-faint);font-size:calc(9px * var(--cigh-ui-font-scale,1))}
.cigh-clean-item-legacy summary{cursor:pointer}
.cigh-clean-pet-reset-zone{margin:10px 0 2px;padding-top:9px;border-top:1px dashed color-mix(in srgb,#c55c5c 24%,var(--cigh-border-faint));text-align:center}
.cigh-clean-pet-reset-btn{width:100%;box-sizing:border-box;border:1px solid color-mix(in srgb,#c55c5c 42%,transparent);border-radius:4px;padding:7px 9px;background:color-mix(in srgb,#c55c5c 7%,var(--cigh-bg-soft));color:#c55c5c;font:700 calc(9.5px * var(--cigh-ui-font-scale,1))/1.3 "Courier New",Consolas,monospace;letter-spacing:.035em;cursor:pointer}
.cigh-clean-pet-reset-btn:hover{background:color-mix(in srgb,#c55c5c 13%,var(--cigh-bg-soft));border-color:color-mix(in srgb,#c55c5c 68%,transparent)}
.cigh-clean-pet-reset-btn:focus-visible{outline:1px solid #c55c5c;outline-offset:2px}
.cigh-clean-pet-reset-zone small{display:block;margin-top:5px;color:var(--cigh-text-faint);font-size:calc(8.5px * var(--cigh-ui-font-scale,1));line-height:1.45}
`;
    document.head.appendChild(style);
  }



/* Mona web fonts: https://github.com/MonadABXY/mona-font
Pinned version: 3a8f319472fb2fdfb8993b150645a185b403f692
Copyright (c) 2025, Monad ABXY (https://monadabxy.com),
with Reserved Font Name "Mona".

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org


-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

*/
const RB_ICONS={
  gear:["..#.#..",".#####.","##...##",".#...#.","##...##",".#####.","..#.#.."],
  refresh:[".####.#","#....##","#...###","#......","#.....#",".#...#.","..###.."],
  close:["#.....#",".#...#.","..#.#..","...#...","..#.#..",".#...#.","#.....#"],
  back:["...#...","..##...",".######","#######",".######","..##...","...#..."],
  edit:[".....##","....###","...###.","..###..",".###...","##.....","#......"],
  check:["......#",".....##","#...##.","##.##..",".###...","..#....","......."],
  eye:[".......","..###..",".#...#.","#..#..#",".#...#.","..###..","......."],
  plus:["...#...","...#...","...#...","#######","...#...","...#...","...#..."],
  minus:[".......",".......",".......","#######",".......",".......","......."],
  trash:["..###..","#######",".#####.",".#.#.#.",".#.#.#.",".#.#.#.","..###.."],
  up:["...#...","..###..",".#####.","#######","..###..","..###..","..###.."],
  down:["..###..","..###..","..###..","#######",".#####.","..###..","...#..."],
  cloud:[".......","..##...",".####..",".#####.","#######","#######","......."],
  spark:["...#...","...#...","..###..","#######","..###..","...#...","...#..."],
  screen:["#######","#.....#","#.....#","#.....#","#######","...#...","..###.."],
  scroll:["######.","#....#.","#.##.#.","#....#.","#.##.#.","#....##",".######"],
  chart:[".......",".....#.",".....#.","...#.#.","...#.#.",".#.#.#.","#######"],
  copy:["####...","#..#...","#.####.","#.#..#.","###..#.","..#..#.","..####."],
  undo:["..#....",".##....","######.",".##...#","..#...#","......#","..####."]
};
RB_ICONS.redo=RB_ICONS.undo.map(r=>[...r].reverse().join(''));
RB_ICONS.right=RB_ICONS.back.map(r=>[...r].reverse().join(''));
function rbIcon(n,s=14){const m=RB_ICONS[n];if(!m)return '';let r='';m.forEach((row,y)=>{for(let x=0;x<7;){if(row[x]!=='#'){x++;continue}let e=x+1;while(e<7&&row[e]==='#')e++;r+=`<rect x="${x}" y="${y}" width="${e-x}" height="1"/>`;x=e}});return `<svg class="cigh-rb-icon" viewBox="0 0 7 7" width="${s}" height="${s}" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`}



const RB_STYLE = "@font-face{font-family:\"CIGH Mona 12\";src:url(\"https://cdn.jsdelivr.net/gh/MonadABXY/mona-font@3a8f319472fb2fdfb8993b150645a185b403f692/web/Mona12TextKR.woff2\") format(\"woff2\");font-weight:400;font-style:normal;font-display:swap;}\n@font-face{font-family:\"CIGH Mona 12\";src:url(\"https://cdn.jsdelivr.net/gh/MonadABXY/mona-font@3a8f319472fb2fdfb8993b150645a185b403f692/web/Mona12TextKR-Bold.woff2\") format(\"woff2\");font-weight:700;font-style:normal;font-display:swap;}\n@font-face{font-family:\"CIGH Mona 10\";src:url(\"https://cdn.jsdelivr.net/gh/MonadABXY/mona-font@3a8f319472fb2fdfb8993b150645a185b403f692/web/Mona10.woff2\") format(\"woff2\");font-weight:400;font-style:normal;font-display:swap;}\n@font-face{font-family:\"CIGH Mona 10\";src:url(\"https://cdn.jsdelivr.net/gh/MonadABXY/mona-font@3a8f319472fb2fdfb8993b150645a185b403f692/web/Mona10-Bold.woff2\") format(\"woff2\");font-weight:700;font-style:normal;font-display:swap;}\n:is(#cigh-clean-panel,#cigh-clean-settings,#cigh-clean-popup,#cigh-clean-comment-popup,#cigh-clean-header-ticker,#cigh-clean-fab,#cigh-clean-dock-fab,#cigh-clean-mascot,#cigh-clean-gacha-modal,#cigh-clean-custom-deco-modal){--cigh-rb-font:\"CIGH Mona 12\",\"Malgun Gothic\",monospace}\n:is(#cigh-clean-panel,#cigh-clean-settings,#cigh-clean-popup,#cigh-clean-comment-popup,#cigh-clean-header-ticker,#cigh-clean-fab,#cigh-clean-dock-fab,#cigh-clean-mascot,#cigh-clean-gacha-modal,#cigh-clean-custom-deco-modal),:is(#cigh-clean-panel,#cigh-clean-settings,#cigh-clean-popup,#cigh-clean-comment-popup,#cigh-clean-header-ticker,#cigh-clean-fab,#cigh-clean-dock-fab,#cigh-clean-mascot,#cigh-clean-gacha-modal,#cigh-clean-custom-deco-modal) :not(svg):not(svg *){font-family:var(--cigh-rb-font)!important}\n/* Claude reference palette and component proportions, scoped to HUD-owned roots. */\n#cigh-clean-settings{\n --cigh-bg:#0d0e0b;--cigh-bg-2:#131410;--cigh-bg-3:#171814;--cigh-bg-soft:#090a08;--cigh-fill:#1d1e1a;\n --cigh-border:#2b2c26;--cigh-border-soft:#2b2c26;--cigh-border-faint:#21221d;\n --cigh-text:#e6dcb8;--cigh-text-soft:#aaa287;--cigh-text-faint:#928b75;--cigh-text-dim:#656252;\n --cigh-accent:#c8a84b;--cigh-accent-soft:rgba(200,168,75,.38);--cigh-accent-softer:rgba(200,168,75,.09);\n --cigh-good:#5aaa70;--cigh-danger:#cc5a50;--cigh-rb-rel:#e46576;\n --cigh-rb-font:\"CIGH Mona 12\",\"Malgun Gothic\",monospace;--cigh-rb-hi:rgba(255,255,255,.035);\n}\n#cigh-clean-settings[data-cigh-theme=\"light\"]{\n --cigh-bg:#fffdf8;--cigh-bg-2:#f7f0e3;--cigh-bg-3:#f2e8d5;--cigh-bg-soft:#f2eadb;--cigh-fill:#ecdfc8;\n --cigh-border:#dbc8a9;--cigh-border-soft:#dbc8a9;--cigh-border-faint:#e9dac2;\n --cigh-text:#4d3d2e;--cigh-text-soft:#79664f;--cigh-text-faint:#806e58;--cigh-text-dim:#aa967d;\n --cigh-accent:#a97728;--cigh-accent-soft:rgba(176,128,47,.32);--cigh-accent-softer:rgba(176,128,47,.08);\n --cigh-good:#43845a;--cigh-danger:#b94f43;--cigh-rb-rel:#d9556b;--cigh-rb-hi:rgba(255,255,255,.5);\n}\n/* Keep the rebuilt settings UI, but mount it like the legacy header-below popup. */\n#cigh-clean-settings.cigh-rb-settings{position:absolute!important;inset:auto 8px 8px 8px!important;top:34px!important;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;padding:0!important;box-sizing:border-box!important;display:flex!important;flex-direction:column;border:1px solid var(--cigh-border)!important;border-radius:6px!important;background:var(--cigh-bg);box-shadow:var(--cigh-shadow-settings,0 8px 26px rgba(0,0,0,.55))!important;z-index:20;overflow:hidden;font:11px/1.55 var(--cigh-rb-font)}\n#cigh-clean-panel[data-cigh-font=\"medium\"]>#cigh-clean-settings.cigh-rb-settings{top:35px!important;left:8px!important;right:8px!important;bottom:8px!important}\n#cigh-clean-panel[data-cigh-font=\"large\"]>#cigh-clean-settings.cigh-rb-settings{top:46px!important;left:11px!important;right:11px!important;bottom:11px!important}\n.cigh-rb-settings-body{padding:10px;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;overscroll-behavior:contain}\n.cigh-rb-backrow{display:flex;align-items:center;margin:0 0 8px;padding:0 0 6px;border-bottom:1px solid var(--cigh-border-faint)}\n#cigh-clean-settings .cigh-rb-backbtn{min-height:24px!important;height:24px!important;margin:0!important;padding:1px 5px!important;border:0!important;border-radius:3px!important;background:transparent!important;color:var(--cigh-text-soft)!important;font:700 9.5px/1 var(--cigh-rb-font)!important;cursor:pointer}\n#cigh-clean-settings .cigh-rb-backbtn:hover{color:var(--cigh-accent)!important;background:var(--cigh-accent-softer)!important}\n#cigh-clean-settings .cigh-clean-fold-body{display:block;margin:0 0 12px!important;padding:0!important;border:0}\n\n#cigh-clean-settings :is(input:not([type=\"checkbox\"]),select,textarea){width:100%;min-width:0;height:auto!important;min-height:29px!important;border:1px solid var(--cigh-border)!important;border-radius:3px!important;background:var(--cigh-bg-soft)!important;padding:6px 8px!important;color:var(--cigh-text)!important;font:10px/1.5 var(--cigh-rb-font)!important;outline:none}\n#cigh-clean-settings textarea{min-height:100px!important;resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere}\n#cigh-clean-settings :is(input,select,textarea):focus{border-color:var(--cigh-accent)!important;box-shadow:0 0 0 1px var(--cigh-accent-soft)}\n#cigh-clean-settings .cigh-clean-settings-grid{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:8px}\n#cigh-clean-settings .cigh-clean-settings-grid label>span,#cigh-clean-settings .cigh-clean-settings-wide-label>span{font-size:9.5px;color:var(--cigh-text-soft);margin-bottom:4px}\n#cigh-clean-settings :is(.cigh-clean-settings-help,.cigh-clean-cloud-help){font-size:9px!important;line-height:1.6;color:var(--cigh-text-faint);margin:6px 0 10px;overflow-wrap:anywhere}\n#cigh-clean-settings .cigh-clean-settings-mini-title{font-size:9px!important;color:var(--cigh-accent);border:0;margin:10px 0 7px}\n#cigh-clean-settings :is(button.cigh-clean-set-btn,.cigh-rb-savebar button,.cigh-rb-segments button,.cigh-rb-style-list button){min-height:26px;height:auto!important;margin:0!important;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:4px 7px;border:1px solid var(--cigh-border);border-radius:3px;background:var(--cigh-bg-3);color:var(--cigh-text-soft);font:700 9.5px/1.4 var(--cigh-rb-font);cursor:pointer}\n#cigh-clean-settings .cigh-clean-set-btn.red{color:var(--cigh-danger)}\n#cigh-clean-settings .cigh-clean-set-btn.gold{background:var(--cigh-accent);border-color:var(--cigh-accent);color:var(--cigh-bg)}\n#cigh-clean-settings .cigh-clean-settings-row{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}\n.cigh-rb-savebar{min-height:18px;height:auto;display:flex;align-items:center;gap:6px;flex-shrink:0;padding:3px 8px 3px 9px;background:var(--cigh-bg-soft);border-top:1px solid var(--cigh-fill);box-sizing:border-box}\n.cigh-rb-savebar>[role=\"status\"]{flex:1 1 auto;min-width:0;color:color-mix(in srgb,var(--cigh-text-soft) 72%,var(--cigh-accent) 28%);font:9px/1.35 var(--cigh-rb-font)!important;letter-spacing:.07em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cigh-rb-save-actions{display:flex;align-items:center;justify-content:flex-end;gap:3px;flex:0 0 auto;min-width:0}\n.cigh-rb-footer-version{color:var(--cigh-text-dim);font:8.5px/1 var(--cigh-rb-font)!important;letter-spacing:.04em;white-space:nowrap}\n#cigh-clean-settings .cigh-rb-savebar button{min-height:20px!important;height:20px!important;padding:1px 4px!important;margin:0!important;border:0!important;border-radius:3px!important;background:transparent!important;color:var(--cigh-text-soft)!important;font:700 8.5px/1 var(--cigh-rb-font)!important}\n#cigh-clean-settings .cigh-rb-savebar button:hover:not(:disabled){color:var(--cigh-accent)!important;background:var(--cigh-accent-softer)!important}\n#cigh-clean-settings .cigh-rb-savebar .cigh-rb-primary{color:var(--cigh-accent)!important;background:transparent!important;border:0!important}\n.cigh-rb-quick{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:15px}\n.cigh-rb-quick label{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:7px 6px;border:1px solid var(--cigh-border-faint);border-radius:4px;background:var(--cigh-bg-2);font-size:9.5px;color:var(--cigh-text);cursor:pointer}\n#cigh-clean-settings input.cigh-rb-switch{appearance:none!important;position:relative;width:30px!important;height:16px!important;min-width:30px!important;min-height:16px!important;margin:0;flex:none;border:1px solid var(--cigh-border)!important;border-radius:3px;background:var(--cigh-bg-soft)!important;cursor:pointer;vertical-align:middle;box-shadow:none;padding:0}\n#cigh-clean-settings input.cigh-rb-switch::after{content:\"\";position:absolute;left:3px;top:2px;width:9px;height:10px;background:var(--cigh-text-dim);border-radius:1px;transition:transform .12s}\n#cigh-clean-settings input.cigh-rb-switch:checked{border-color:var(--cigh-accent-soft)!important;background:var(--cigh-accent-softer)!important}\n#cigh-clean-settings input.cigh-rb-switch:checked::after{transform:translateX(13px);background:var(--cigh-accent)}\n#cigh-clean-settings .cigh-clean-checkrow{display:flex;flex-direction:row-reverse;align-items:center;justify-content:space-between;gap:8px;min-height:36px;padding:7px 0;border-bottom:1px dashed var(--cigh-border-faint);margin:0;font-size:10px;color:var(--cigh-text)}\n.cigh-rb-menu{border:1px solid var(--cigh-border);border-radius:5px;overflow:hidden}\n#cigh-clean-settings .cigh-rb-menu button{display:flex;align-items:center;gap:7px;width:100%;min-height:42px;padding:7px 9px;border:0;border-bottom:1px solid var(--cigh-border-faint);background:var(--cigh-bg-2);color:var(--cigh-accent);text-align:left;font:10px var(--cigh-rb-font);cursor:pointer}\n#cigh-clean-settings .cigh-rb-menu button:last-child{border-bottom:0}\n#cigh-clean-settings .cigh-rb-menu button:hover{background:var(--cigh-accent-softer)}\n.cigh-rb-menu b{font-size:10.5px;flex:none;color:var(--cigh-text)}\n.cigh-rb-menu span{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;color:var(--cigh-text-faint)}\n.cigh-rb-segments{display:flex;gap:2px;padding:2px;border:1px solid var(--cigh-border);background:var(--cigh-bg-soft);border-radius:3px;margin-bottom:3px}\n#cigh-clean-settings .cigh-rb-segments button{flex:1;min-width:0;min-height:25px;border:1px solid transparent;background:transparent;padding:3px 2px;font-size:9px}\n#cigh-clean-settings .cigh-rb-segments button.on{color:var(--cigh-accent);background:var(--cigh-accent-softer);border-color:var(--cigh-accent-soft)}\n.cigh-rb-provider-status{border:1px solid var(--cigh-border);border-radius:4px;background:var(--cigh-bg-2);color:var(--cigh-text-soft);padding:7px 8px;font-size:9.5px;margin-bottom:10px}\n.cigh-rb-key-row{display:flex;align-items:stretch;gap:4px}\n#cigh-clean-settings .cigh-rb-key-row input{flex:1;min-width:0}\n#cigh-clean-settings .cigh-rb-key-row button{flex:none;width:28px;min-width:28px;padding:3px}\n.cigh-rb-dock-picks{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}\n#cigh-clean-settings .cigh-rb-dock-picks button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border:1px solid var(--cigh-border);border-radius:4px;background:var(--cigh-bg-2);color:var(--cigh-text);cursor:pointer;font:10px var(--cigh-rb-font)}\n#cigh-clean-settings .cigh-rb-dock-picks button.on{border-color:var(--cigh-accent);background:var(--cigh-accent-softer)}\n.cigh-rb-dock-picks small{font-size:8.5px;color:var(--cigh-text-faint);line-height:1.5}\n.cigh-rb-style-list{display:grid;gap:4px;width:100%;grid-column:1/-1;margin-bottom:7px}\n#cigh-clean-settings .cigh-rb-style-list button{justify-content:flex-start;font-weight:400;text-align:left}\n#cigh-clean-settings .cigh-rb-style-list button::before{content:\"○\";color:var(--cigh-text-faint)}\n#cigh-clean-settings .cigh-rb-style-list button.on{color:var(--cigh-accent);border-color:var(--cigh-accent-soft);background:var(--cigh-accent-softer)}\n#cigh-clean-settings .cigh-rb-style-list button.on::before{content:\"●\";color:var(--cigh-accent)}\n.cigh-rb-style-example{border:1px dashed var(--cigh-border);border-radius:4px;background:var(--cigh-bg-soft);padding:8px;font-size:10px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--cigh-text-soft);margin:3px 0 10px}\n#cigh-clean-settings .cigh-clean-cloud-status{border:1px solid var(--cigh-accent-soft);border-radius:5px;padding:8px;background:var(--cigh-bg-2);font-size:10px}\n#cigh-clean-settings .cigh-clean-cloud-grid{grid-template-columns:1fr 1fr}\n#cigh-clean-settings .cigh-clean-cloud-actions button{flex:1}\n/* Confirmation frames use the same visual system and retain explicit destructive actions. */\n.cigh-rb-confirm{position:absolute;inset:0;z-index:60;background:rgba(0,0,0,.58);display:grid;place-items:center;padding:10px;box-sizing:border-box}\n.cigh-rb-confirm-card{width:100%;max-width:330px;max-height:100%;overflow:auto;background:var(--cigh-bg);color:var(--cigh-text);border:1px solid var(--cigh-border);border-radius:7px;font:11px/1.65 var(--cigh-rb-font);box-shadow:0 10px 30px rgba(0,0,0,.35)}\n.cigh-rb-dialog-head{display:flex;align-items:center;gap:8px;padding:6px 9px;background:var(--cigh-bg-2);border-bottom:1px solid var(--cigh-border);color:var(--cigh-accent);font-size:10px}\n.cigh-rb-dialog-head b{flex:1}\n#cigh-clean-panel .cigh-rb-dialog-head button{border:0;background:transparent;color:var(--cigh-text-soft);padding:2px;display:grid;place-items:center}\n.cigh-rb-confirm-body{padding:14px 10px;text-align:center}\n.cigh-rb-confirm-body>b{font-size:12px}\n.cigh-rb-confirm-body p{margin:7px 0;color:var(--cigh-text-soft);font-size:10px;overflow-wrap:anywhere}\n.cigh-rb-keep{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px;text-align:left}\n.cigh-rb-keep>div{padding:7px;border:1px solid var(--cigh-border);border-radius:4px;background:var(--cigh-bg-2)}\n.cigh-rb-keep b{font-size:9px;color:var(--cigh-danger)}\n.cigh-rb-keep>div:last-child b{color:var(--cigh-good)}\n.cigh-rb-dialog-foot{display:flex;justify-content:flex-end;gap:6px;border-top:1px solid var(--cigh-border);padding:7px 9px;background:var(--cigh-bg-2)}\n#cigh-clean-panel .cigh-rb-dialog-foot button{min-height:28px;border:1px solid var(--cigh-border);border-radius:3px;padding:4px 9px;background:var(--cigh-bg-3);color:var(--cigh-text-soft);font:700 10px var(--cigh-rb-font)}\n#cigh-clean-panel .cigh-rb-dialog-foot .cigh-rb-danger{background:var(--cigh-danger);border-color:var(--cigh-danger);color:#fff}\n\n.cigh-rb-icon{display:inline-block;flex:none;vertical-align:middle;image-rendering:pixelated;pointer-events:none}\n#cigh-clean-settings{--cigh-rb-font:\"CIGH Mona 12\",\"Malgun Gothic\",monospace;--cigh-rb-hi:rgba(255,255,255,.035)}\n#cigh-clean-settings [hidden]{display:none!important}\n#cigh-clean-settings .cigh-clean-sh{display:flex;align-items:center;gap:5px;color:var(--cigh-accent);margin:0 0 7px;border:0;padding:0;font-size:12px}\n#cigh-clean-settings .cigh-clean-sh::after{content:\"\";flex:1;border-top:1px dotted var(--cigh-border)}\n#cigh-clean-settings .cigh-rb-help{font-size:10px;line-height:1.6;color:var(--cigh-text-faint);overflow-wrap:anywhere}\n#cigh-clean-settings .cigh-rb-primary{background:var(--cigh-accent)!important;border-color:var(--cigh-accent)!important;color:var(--cigh-bg)!important}\n#cigh-clean-settings,#cigh-clean-settings :not(svg):not(svg *){font-size:11px!important;letter-spacing:0!important}\n#cigh-clean-settings :is(small,.cigh-rb-help,[data-rb-summary],.cigh-clean-settings-help,.cigh-clean-cloud-help){font-family:\"CIGH Mona 10\",\"Malgun Gothic\",monospace!important;font-size:10px!important}\n#cigh-clean-settings .cigh-rb-savebar{flex-wrap:nowrap;gap:6px}\n#cigh-clean-settings .cigh-rb-menu button{min-height:40px}\n#cigh-clean-settings :is(button,input,select,textarea){box-sizing:border-box}\n#cigh-clean-settings button:focus-visible,#cigh-rb-confirm button:focus-visible{outline:2px solid var(--cigh-accent);outline-offset:2px}\n#cigh-clean-settings button:disabled{opacity:.45}\n#cigh-rb-confirm .cigh-rb-confirm-card{font-family:var(--cigh-rb-font)}\n@media(pointer:coarse){#cigh-clean-settings :is(.cigh-rb-segments button,.cigh-clean-set-btn,.cigh-rb-style-list button){min-height:34px}}\n#cigh-clean-settings .cigh-rb-pet-name{display:block;margin:0 0 16px}\n#cigh-clean-settings .cigh-rb-pet-name>.cigh-clean-sh{display:flex;margin-bottom:7px}\n#cigh-clean-panel .cigh-rb-info{\n --cigh-bg-2:#131410;--cigh-border:#2b2c26;--cigh-border-faint:#21221d;\n --cigh-text:#e6dcb8;--cigh-text-soft:#aaa287;--cigh-text-faint:#928b75;\n --cigh-accent:#c8a84b;--cigh-accent-soft:rgba(200,168,75,.38);--cigh-good:#5aaa70;--cigh-danger:#cc5a50;\n --cigh-info-size:10px;color:var(--cigh-text);line-height:1.55;\n}\n#cigh-clean-panel[data-cigh-theme=\"light\"] .cigh-rb-info{\n --cigh-bg-2:#f7f0e3;--cigh-border:#dbc8a9;--cigh-border-faint:#e9dac2;\n --cigh-text:#4d3d2e;--cigh-text-soft:#79664f;--cigh-text-faint:#806e58;\n --cigh-accent:#a97728;--cigh-accent-soft:rgba(176,128,47,.32);--cigh-good:#43845a;--cigh-danger:#b94f43;\n}\n#cigh-clean-panel[data-cigh-font=\"medium\"] .cigh-rb-info{--cigh-info-size:11px}\n#cigh-clean-panel[data-cigh-font=\"large\"] .cigh-rb-info{--cigh-info-size:12px}\n#cigh-clean-panel .cigh-rb-info,#cigh-clean-panel .cigh-rb-info :not(svg):not(svg *){font-family:\"CIGH Mona 10\",\"Malgun Gothic\",monospace!important;font-size:var(--cigh-info-size)!important;letter-spacing:0!important}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-sec{margin-bottom:11px}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-sh{display:flex;align-items:center;gap:4px;border:0!important;padding:0!important;margin:0 0 5px!important;color:var(--cigh-accent);font-weight:700;line-height:1.5;overflow:visible}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-sh::before{content:\"◆\";font-size:8px}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-sh::after{content:\"\";flex:1;height:1px;background:repeating-linear-gradient(90deg,var(--cigh-border) 0 1px,transparent 1px 3px)}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-srow{padding:4px 0;gap:7px;border-bottom:1px dashed var(--cigh-border-faint);line-height:1.5;align-items:flex-start}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-slbl{flex-shrink:0;color:var(--cigh-text-faint)}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-sval{min-width:0;color:var(--cigh-text);overflow-wrap:anywhere;white-space:normal;text-overflow:clip}\n#cigh-clean-panel .cigh-rb-info :is(.cigh-clean-idetail,.cigh-clean-bdim){color:var(--cigh-text-faint);line-height:1.5}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-situ{border-left:2px solid var(--cigh-accent-soft);background:var(--cigh-bg-2);padding:6px 7px;line-height:1.6;color:var(--cigh-text)}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-irow{border-bottom:1px dashed var(--cigh-border-faint);padding:5px 0;gap:7px;color:var(--cigh-text)}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-ico{display:grid;place-items:center;min-width:20px;min-height:20px;background:var(--cigh-bg-2);border:1px solid var(--cigh-border);border-radius:3px}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-blbl{color:var(--cigh-text);gap:4px}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-mname{min-width:0;overflow-wrap:anywhere}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-brow{margin-bottom:8px}\n#cigh-clean-panel .cigh-rb-info .cigh-clean-q{color:var(--cigh-good);line-height:1.55;margin-bottom:3px;overflow-wrap:anywhere}\n#cigh-clean-panel .cigh-rb-info .cigh-rb-info-delta{color:var(--cigh-good);background:color-mix(in srgb,var(--cigh-good) 12%,transparent);border-radius:2px;padding:1px 3px;white-space:nowrap;flex:none}\n#cigh-clean-panel .cigh-rb-info .cigh-rb-info-delta.down{color:var(--cigh-danger)}\n/* Claude reference palette and component proportions, scoped to HUD-owned roots. */\n:is(.cigh-clean-items,.cigh-rb-record,.cigh-clean-log-inner,.cigh-rb-log-boot,.cigh-clean-tendency-grid,.cigh-clean-pet-speech,#cigh-clean-custom-deco-modal){\n --cigh-bg:#0d0e0b;--cigh-bg-2:#131410;--cigh-bg-3:#171814;--cigh-bg-soft:#090a08;--cigh-fill:#1d1e1a;\n --cigh-border:#2b2c26;--cigh-border-soft:#2b2c26;--cigh-border-faint:#21221d;\n --cigh-text:#e6dcb8;--cigh-text-soft:#aaa287;--cigh-text-faint:#928b75;--cigh-text-dim:#656252;\n --cigh-accent:#c8a84b;--cigh-accent-soft:rgba(200,168,75,.38);--cigh-accent-softer:rgba(200,168,75,.09);\n --cigh-good:#5aaa70;--cigh-danger:#cc5a50;--cigh-rb-rel:#e46576;\n --cigh-rb-font:\"CIGH Mona 12\",\"Malgun Gothic\",monospace;--cigh-rb-hi:rgba(255,255,255,.035);\n}\n:is(#cigh-clean-panel,#cigh-clean-custom-deco-modal)[data-cigh-theme=\"light\"] :is(.cigh-clean-items,.cigh-rb-record,.cigh-clean-log-inner,.cigh-rb-log-boot,.cigh-clean-tendency-grid,.cigh-clean-pet-speech,#cigh-clean-custom-deco-modal),#cigh-clean-custom-deco-modal[data-cigh-theme=\"light\"]{\n --cigh-bg:#fffdf8;--cigh-bg-2:#f7f0e3;--cigh-bg-3:#f2e8d5;--cigh-bg-soft:#f2eadb;--cigh-fill:#ecdfc8;\n --cigh-border:#dbc8a9;--cigh-border-soft:#dbc8a9;--cigh-border-faint:#e9dac2;\n --cigh-text:#4d3d2e;--cigh-text-soft:#79664f;--cigh-text-faint:#806e58;--cigh-text-dim:#aa967d;\n --cigh-accent:#a97728;--cigh-accent-soft:rgba(176,128,47,.32);--cigh-accent-softer:rgba(176,128,47,.08);\n --cigh-good:#43845a;--cigh-danger:#b94f43;--cigh-rb-rel:#d9556b;--cigh-rb-hi:rgba(255,255,255,.5);\n}\n.cigh-rb-wallet{display:flex;align-items:center;gap:6px;padding:8px 9px;margin-bottom:7px;border:1px solid var(--cigh-accent-soft);background:var(--cigh-accent-softer);border-radius:5px}\n.cigh-rb-wallet>b{font-size:16px;color:var(--cigh-accent)}\n.cigh-rb-wallet>b small{font-size:9px;font-weight:400}\n.cigh-rb-wallet-help{margin-left:auto;font-size:8.5px;line-height:1.5;color:var(--cigh-text-faint);text-align:right}\n#cigh-clean-panel .cigh-clean-item-row{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;padding:8px 0;border-bottom:1px dashed var(--cigh-border-faint)}\n#cigh-clean-panel .cigh-clean-item-row:last-child{border:0}\n.cigh-rb-item-icon{width:26px;height:26px;flex:none;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--item-color) 40%,var(--cigh-border));border-radius:3px;background:color-mix(in srgb,var(--item-color) 12%,var(--cigh-bg));color:var(--item-color);font-size:13px}\n#cigh-clean-panel .cigh-clean-item-copy{flex:1;min-width:0}\n#cigh-clean-panel .cigh-clean-item-copy strong{font-size:calc(10.5px * var(--cigh-ui-font-scale,1))}\n#cigh-clean-panel .cigh-clean-item-copy small{font-size:calc(9px * var(--cigh-ui-font-scale,1));line-height:1.4}\n#cigh-clean-panel .cigh-clean-item-actions{display:flex;flex-direction:column;flex-wrap:nowrap;gap:4px;flex:none}\n#cigh-clean-panel .cigh-clean-items button{font-size:calc(9px * var(--cigh-ui-font-scale,1));min-height:24px;padding:3px 6px}\n#cigh-clean-panel .cigh-clean-item-notice{font-size:9.5px;color:var(--cigh-text-soft);margin:0 0 12px;line-height:1.6}\n#cigh-clean-panel .cigh-clean-item-legacy{padding:7px 8px;border:1px dashed var(--cigh-border);border-radius:5px}\n/* Actual canvas, pointer handlers, layers, and preview remain the original engine. */\n#cigh-clean-custom-deco-modal .cigh-clean-custom-dialog{border-radius:7px;border:1px solid var(--cigh-border);background:var(--cigh-bg);box-shadow:0 10px 35px rgba(0,0,0,.4);color:var(--cigh-text);font-family:var(--cigh-rb-font)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-dialog.editor{width:min(600px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:10px;overflow:auto}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-head{min-height:30px;padding:0 0 7px;margin-bottom:9px;border-bottom:1px solid var(--cigh-border);color:var(--cigh-accent)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-head b{font:700 10px var(--cigh-rb-font);letter-spacing:.08em}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-head>span{font-size:9px;color:var(--cigh-text-faint)}\n#cigh-clean-custom-deco-modal :is(button,input,select){border-radius:3px;font-family:var(--cigh-rb-font)}\n#cigh-clean-custom-deco-modal button{min-height:26px;background:var(--cigh-bg-3);border:1px solid var(--cigh-border);color:var(--cigh-text-soft);padding:4px 7px;font-size:9.5px;line-height:1.35}\n#cigh-clean-custom-deco-modal button.on{color:var(--cigh-accent);border-color:var(--cigh-accent-soft);background:var(--cigh-accent-softer)}\n#cigh-clean-custom-deco-modal button.primary{background:var(--cigh-accent);color:var(--cigh-bg);border-color:var(--cigh-accent)}\n#cigh-clean-custom-deco-modal button.danger{color:var(--cigh-danger)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-head>button{border:0;background:none;padding:2px;display:grid;place-items:center;width:24px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-stage-row{gap:12px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-canvas-wrap{border:1px solid var(--cigh-border);border-radius:3px;background:var(--cigh-bg-soft)}\n#cigh-clean-custom-deco-modal :is(.cigh-clean-custom-tools,.cigh-clean-custom-layerbar,.cigh-clean-custom-selectionbar){gap:4px;margin-bottom:7px;border:1px solid var(--cigh-border-faint);border-radius:4px;background:var(--cigh-bg-2);padding:4px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-layerbar>span{font-size:9px;color:var(--cigh-text-faint)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-layer-chip-wrap{gap:0}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-palette{padding:6px;border:1px solid var(--cigh-border);border-radius:4px;background:var(--cigh-bg-2)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-swatches{gap:3px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-swatches button{padding:0;border-radius:2px}\n#cigh-clean-custom-deco-modal [data-custom-swatch]{background:var(--swatch)!important}\n#cigh-clean-custom-deco-modal [data-custom-recent]{background:var(--recent)!important;padding:0}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-actions{position:sticky;bottom:-10px;z-index:4;padding:8px 0;margin:8px 0 0;background:var(--cigh-bg);border-top:1px solid var(--cigh-border)}\n#cigh-clean-custom-deco-modal :is(.cigh-clean-custom-note,.cigh-clean-custom-room-preview-note){font-size:9px;color:var(--cigh-text-faint);line-height:1.55}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-sheet-card{background:var(--cigh-bg);border:1px solid var(--cigh-accent-soft);border-radius:8px 8px 4px 4px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-sheet-head{border-bottom:1px solid var(--cigh-border);padding-bottom:7px;color:var(--cigh-accent)}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-import-preview{border:1px dashed var(--cigh-border);border-radius:4px;background:var(--cigh-bg-2)}\n@media (max-width:620px){\n #cigh-clean-custom-deco-modal .cigh-clean-custom-dialog.editor{width:100vw;height:100dvh;max-height:100dvh;border:0;border-radius:0;padding:calc(7px + env(safe-area-inset-top)) 8px calc(7px + env(safe-area-inset-bottom));overflow:hidden}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-head{margin-bottom:5px;min-height:29px;padding:0 0 5px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-stage-row{min-height:0;gap:0}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-tools{padding:3px;flex-wrap:nowrap;overflow-x:auto;flex-shrink:0;gap:3px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-tools button{flex:none;min-height:28px;font-size:9px;padding:4px 5px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-footer{padding-top:6px;border-top:1px solid var(--cigh-border);gap:4px;background:var(--cigh-bg);flex-shrink:0}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-footer button{height:38px;font-size:10px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-push{border:1px solid var(--cigh-accent);background:var(--cigh-accent-softer);color:var(--cigh-accent);font-size:14px;letter-spacing:.3em;border-radius:6px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-dpad button{min-height:34px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-sheet-card{max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-sheet button{min-height:36px}\n #cigh-clean-custom-deco-modal .cigh-clean-custom-sheet{padding-bottom:env(safe-area-inset-bottom)}\n}\n\n#cigh-clean-custom-deco-modal .cigh-clean-custom-head>button{margin-left:auto;flex-shrink:0}\n#cigh-clean-custom-deco-modal:has(.compact-import){place-items:center;background:rgba(0,0,0,.65);padding:12px;box-sizing:border-box}\n#cigh-clean-custom-deco-modal .compact-import{align-self:center;justify-self:center;height:auto!important;width:min(380px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto}\n\n#cigh-clean-panel :is(.cigh-clean-items,.cigh-rb-record,.cigh-clean-log-inner,.cigh-rb-log-boot){font:10px/1.65 \"CIGH Mona 10\",monospace!important;color:var(--cigh-text)}\n#cigh-clean-panel :is(.cigh-clean-items,.cigh-rb-record) .cigh-clean-sh{display:flex;align-items:center;gap:5px;border:0;padding:0;margin:12px 0 6px;color:var(--cigh-accent);font-size:10px!important}\n#cigh-clean-panel :is(.cigh-clean-items,.cigh-rb-record) .cigh-clean-sh::before{content:\"◆\";font-size:8px}\n#cigh-clean-panel :is(.cigh-clean-items,.cigh-rb-record) .cigh-clean-sh::after{content:\"\";flex:1;border-top:1px dotted var(--cigh-border)}\n#cigh-clean-panel .cigh-clean-items :is(button,small,.cigh-rb-wallet-help){font-family:\"CIGH Mona 10\",monospace!important;font-size:10px!important}\n#cigh-clean-panel .cigh-clean-items button{border:1px solid var(--cigh-border);border-radius:3px;background:var(--cigh-bg-3);color:var(--cigh-text-soft);line-height:1.3;cursor:pointer}\n#cigh-clean-panel .cigh-clean-items button.cigh-rb-primary{background:var(--cigh-accent);color:var(--cigh-bg);border-color:var(--cigh-accent)}\n#cigh-clean-panel .cigh-clean-items button:disabled{opacity:.45;cursor:default}\n#cigh-clean-panel .cigh-clean-item-copy strong{font-size:12px!important;color:var(--cigh-text)}\n#cigh-clean-panel .cigh-clean-pet-speech{position:absolute!important;left:50%;top:27%;transform:translateX(-50%);margin:0!important;padding:5px 9px;border:1px solid var(--cigh-border);border-radius:4px;background:var(--cigh-bg);color:var(--cigh-text);font:12px/1.4 var(--cigh-rb-font)!important;text-align:center;box-shadow:2px 2px 0 rgba(0,0,0,.22);max-width:82%;width:max-content;box-sizing:border-box;white-space:normal;overflow:visible;overflow-wrap:anywhere;z-index:5}\n#cigh-clean-panel .cigh-clean-pet-speech::after{content:\"\";position:absolute;left:50%;bottom:-5px;width:8px;height:8px;margin-left:-4px;background:var(--cigh-bg);border-right:1px solid var(--cigh-border);border-bottom:1px solid var(--cigh-border);transform:rotate(45deg)}\n#cigh-clean-panel .cigh-clean-pet-speech.is-hidden{display:none!important}\n#cigh-clean-panel .cigh-clean-tendency-grid{gap:4px;grid-template-columns:repeat(5,minmax(0,1fr))}\n#cigh-clean-panel .cigh-clean-tendency-badge{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 2px 8px;border:1px solid var(--cigh-border-faint);border-radius:4px;background:var(--cigh-bg-2);min-height:0;box-shadow:none}\n#cigh-clean-panel .cigh-clean-tendency-badge::before{content:\"\";position:absolute;left:0;right:0;top:0;height:2px;background:var(--tendency-color)}\n#cigh-clean-panel .cigh-clean-tendency-badge .cigh-clean-tendency-fill{position:absolute;left:0;bottom:0;top:auto;width:var(--cigh-rb-tendency-pct);height:3px;background:var(--tendency-color);opacity:.85}\n#cigh-clean-panel .cigh-clean-tendency-badge.is-active{border-color:var(--cigh-accent);box-shadow:inset 0 0 0 1px var(--cigh-accent-soft)}\n#cigh-clean-panel .cigh-clean-tendency-badge.is-zero{opacity:1}\n#cigh-clean-panel .cigh-clean-tendency-emoji{font-size:12px!important;line-height:1.15;color:var(--tendency-color)}\n#cigh-clean-panel :is(.cigh-clean-tendency-name,.cigh-rb-tendency-percent){font:10px/1.3 \"CIGH Mona 10\",monospace!important;color:var(--cigh-text-faint)}\n#cigh-clean-panel .cigh-clean-tendency-count{font:12px/1.5 \"CIGH Mona 12\",monospace!important;color:var(--cigh-text);margin:0}\n.cigh-rb-log-boot{border:1px dashed var(--cigh-border);border-radius:4px;padding:7px 8px;margin-bottom:8px}\n.cigh-rb-log-boot :is(b,span){display:block}.cigh-rb-log-boot b{color:var(--cigh-accent)}.cigh-rb-log-boot small{color:var(--cigh-text-faint)}\n#cigh-clean-panel .cigh-clean-log-inner>div{font:12px/1.6 \"CIGH Mona 12\",monospace!important;overflow-wrap:anywhere;color:var(--cigh-text);padding:1px 0}\n#cigh-clean-panel .cigh-clean-log-inner .cigh-rb-log-time{display:flex;align-items:center;gap:8px;margin:8px 0 5px;text-align:center;color:var(--cigh-text-faint);font:10px/1.4 \"CIGH Mona 10\",monospace!important}\n.cigh-rb-log-time::before,.cigh-rb-log-time::after{content:\"\";flex:1;height:1px;background:var(--cigh-border)}\n#cigh-clean-panel .cigh-clean-log-inner .cigh-rb-log-rule{display:none}\n\n\n.cigh-rb-gauge{display:block;grid-column:1/-1;width:100%;height:4px;background:var(--cigh-fill);overflow:hidden;mask:repeating-linear-gradient(90deg,#000 0 calc(10% - 2px),transparent calc(10% - 2px) 10%)}\n.cigh-rb-gauge>i{display:block;height:100%;background:var(--cigh-accent)}\n#cigh-clean-panel .cigh-clean-record-story-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 6px;padding:6px 0;border:0}\n#cigh-clean-panel .cigh-clean-record-story-row>span{min-width:0;overflow-wrap:anywhere;color:var(--cigh-text)}\n#cigh-clean-panel .cigh-clean-record-story-row strong{color:var(--cigh-accent);font-weight:400}\n#cigh-clean-panel .cigh-clean-record-sync-row{gap:5px;align-items:center;padding:8px 0;border-bottom:0}\n#cigh-clean-panel .cigh-clean-record-sync-row span{color:var(--cigh-text-faint);font-size:10px;overflow-wrap:anywhere}\n#cigh-clean-panel .cigh-clean-record-sync-row[data-rb-sync=\"ok\"] span{color:var(--cigh-good)}\n#cigh-clean-panel .cigh-clean-record-sync-row[data-rb-sync=\"error\"] span{color:var(--cigh-danger)}\n#cigh-clean-panel .cigh-clean-record-sync-row button{display:inline-flex;align-items:center;gap:3px;flex:none;border:1px solid var(--cigh-border);background:var(--cigh-bg-2);color:var(--cigh-accent);padding:4px;font:10px \"CIGH Mona 10\",monospace!important;border-radius:3px}\n#cigh-clean-settings .cigh-clean-usage-model-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:9px 0;border-bottom:1px dashed var(--cigh-border)}\n#cigh-clean-settings .cigh-clean-usage-model-row .cigh-clean-usage-model-name{min-width:0;overflow-wrap:anywhere;white-space:normal;font-size:10px!important}\n#cigh-clean-settings .cigh-clean-usage-model-row b{font-size:10px!important;color:var(--cigh-accent);white-space:nowrap}\n#cigh-clean-settings .cigh-clean-usage-model-row small{display:block;font-size:10px!important;line-height:1.5}\n#cigh-clean-custom-deco-modal,#cigh-clean-custom-deco-modal :not(svg):not(svg *){font-family:\"CIGH Mona 12\",monospace!important;font-size:11px!important;letter-spacing:0!important}\n#cigh-clean-custom-deco-modal :is(small,.cigh-clean-custom-note,.cigh-clean-custom-room-preview-note){font-family:\"CIGH Mona 10\",monospace!important;font-size:10px!important}\n#cigh-clean-custom-deco-modal [hidden]{display:none!important}\n@media(pointer:coarse){#cigh-clean-panel .cigh-clean-items button{min-height:30px}}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-size label{display:flex;flex-wrap:wrap;gap:5px;align-items:center;font-size:10px!important}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-size input{flex:1;min-width:60px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-zoom{gap:4px;flex-wrap:nowrap}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-zoom>b{min-width:36px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-zoom>button{min-width:28px;padding:4px}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-zoom .cigh-clean-custom-inputmode{margin:0 0 0 auto;flex:1}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-mobile-zoom .cigh-clean-custom-inputmode button{min-width:28px;font-size:10px!important;padding:5px 3px}\n#cigh-clean-panel .cigh-clean-pet-speech{animation:none!important;transform:translateX(-50%)!important}\n#cigh-clean-panel .cigh-clean-pet-speech{top:16%}\n#cigh-clean-settings .cigh-clean-usage-model-row{display:block;background:transparent;border:0;border-radius:0;border-bottom:1px dashed var(--cigh-border);box-shadow:none;padding:8px 0}\n#cigh-clean-settings .cigh-clean-usage-model-row>small{font-weight:400!important;line-height:1.6;margin:4px 0;color:var(--cigh-text-soft)}\n.cigh-rb-model-head{display:flex;gap:5px;align-items:center;min-width:0}\n#cigh-clean-settings .cigh-rb-model-head *{font:10px/1.5 \"CIGH Mona 10\",monospace!important}\n.cigh-rb-model-chip{flex:none;border:1px solid var(--cigh-border);border-radius:8px;padding:0 4px;color:var(--cigh-text-faint)}\n.cigh-rb-model-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--cigh-text)}\n.cigh-rb-model-head b{flex:none}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-setting-row>span{flex:none;white-space:nowrap}\n#cigh-clean-custom-deco-modal .cigh-clean-custom-setting-row>.cigh-clean-custom-gridpick{flex:1;min-width:0;width:auto}\n\n#cigh-clean-panel .cigh-clean-log-inner > div{color:var(--cigh-text)!important}\n#cigh-clean-settings .cigh-rb-menu button{min-height:40px;padding-top:8px;padding-bottom:8px}\n#cigh-clean-settings .cigh-rb-quick{gap:4px;margin-bottom:11px}\n#cigh-clean-settings .cigh-rb-quick label{padding:5px;gap:3px;white-space:nowrap}\n#cigh-clean-settings .cigh-rb-key-row button{width:26px;min-width:26px;max-width:26px;flex:0 0 26px;overflow:hidden}\n#cigh-clean-panel .cigh-clean-comment-log-row{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px;padding:9px 0;border-bottom:1px dashed var(--cigh-border);align-items:start}\n#cigh-clean-panel .cigh-clean-comment-log-time{display:block;max-width:62px;font:10px/1.5 \"CIGH Mona 10\",monospace!important;padding:1px 4px;border:1px solid var(--cigh-border);border-radius:3px;white-space:normal;overflow-wrap:anywhere;color:var(--cigh-text-faint)}\n#cigh-clean-panel .cigh-clean-comment-log-text{display:block;min-width:0;font-size:12px;line-height:1.7;color:var(--cigh-text-soft)}\n#cigh-clean-panel .cigh-clean-comment-log-row:first-child .cigh-clean-comment-log-text{color:var(--cigh-text)}\n#cigh-clean-panel .cigh-clean-comment-log-line{display:block;position:relative;padding-left:16px;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}\n#cigh-clean-panel .cigh-clean-comment-log-line::before{content:\"◇\";position:absolute;left:0;top:0;width:auto;height:auto;border-radius:0;background:none;box-shadow:none;opacity:1;color:var(--cigh-accent)}\n\n#cigh-clean-panel .cigh-clean-comment-log-line::before{font-size:10px;width:10px;text-align:center;line-height:inherit}\n#cigh-clean-panel .cigh-clean-log-inner > [hidden]{display:none!important}\n";
function injectStyle() {
  rbLegacy_injectStyle();
  document.getElementById('cigh-rebuild-style')?.remove();
  const style = document.createElement('style');
  style.id = 'cigh-rebuild-style'; style.textContent = RB_STYLE;
  document.head.appendChild(style);
}

function rbButtonIcon(button, icon, label, iconOnly = false) {
  if (!button) return;
  button.innerHTML = rbIcon(icon) + (iconOnly ? '' : `<span>${esc(label)}</span>`);
  button.setAttribute('aria-label', label);
  button.title = label;
}

function rbTrapFocus(root,onEscape){
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onEscape();return;}
    if(event.key!=='Tab')return;
    const nodes=[...root.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&!e.closest('[hidden]')&&e.getClientRects().length);
    if(!nodes.length)return;
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
}

function rbConfirm({title,text,detail='',accept='초기화',onAccept,onCancel}){
  document.getElementById('cigh-rb-confirm')?.remove();
  const focus=document.activeElement,host=ensurePanel(),key=roomKey();
  const layer=document.createElement('div');layer.id='cigh-rb-confirm';layer.className='cigh-rb-confirm';
  layer.innerHTML=`<div class="cigh-rb-confirm-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="cigh-rb-dialog-head"><b>◆ ${esc(title)}</b><button type="button" data-rb-answer="no" aria-label="닫기">${rbIcon('close')}</button></div><div class="cigh-rb-confirm-body"><b>${esc(text)}</b>${detail}</div><div class="cigh-rb-dialog-foot"><button type="button" data-rb-answer="no">취소</button><button type="button" class="cigh-rb-danger" data-rb-answer="yes">${esc(accept)}</button></div></div>`;
  const finish=yes=>{layer.remove();focus?.isConnected&&focus.focus({preventScroll:true});if(yes&&key===roomKey())onAccept?.();else onCancel?.();};
  layer.addEventListener('click',event=>{const answer=event.target.closest('[data-rb-answer]');if(answer||event.target===layer){event.preventDefault();event.stopPropagation();finish(answer?.dataset.rbAnswer==='yes');}});
  rbTrapFocus(layer,()=>finish(false));host.appendChild(layer);layer.querySelector('[data-rb-answer="no"]').focus();
}

// One persistent form is the draft. Pages only hide/reveal groups; no missing inputs
// can be saved as defaults. The original validation/setter pipeline stays in charge.
function openSettings(){
  const existing=document.getElementById(SETTINGS_ID);if(existing){existing.rbRequestClose?.();return;}
  const panel=ensurePanel(),returnFocus=document.activeElement;
  const box=document.createElement('div');box.id=SETTINGS_ID;box.className='cigh-rb-settings';
  box.setAttribute('aria-label','HUD 설정');
  box.innerHTML=buildSettingsPanelHtml(getGeminiProvider());
  const sourceSections={};
  box.querySelectorAll('[data-fold-body]').forEach(e=>{sourceSections[e.dataset.foldBody]=e;e.classList.remove('collapsed');});
  box.querySelectorAll('[data-fold-section]').forEach(e=>e.remove());
  const save=box.querySelector('[data-action="save"]');save.parentElement.remove();
  const body=document.createElement('div');body.className='cigh-rb-settings-body';
  const backRow=document.createElement('div');backRow.className='cigh-rb-backrow';backRow.hidden=true;backRow.innerHTML='<button type="button" class="cigh-rb-backbtn" data-rb-back>‹ 뒤로</button>';body.appendChild(backRow);
  const backButton=backRow.querySelector('[data-rb-back]');
  const pages={};
  const menu=document.createElement('div');menu.dataset.rbPage='menu';body.appendChild(menu);
  const pageDefs=[['ai','AI 연결','spark',['api','model']],['view','표시·연출','screen',['ui','fx']],['log','로그 문체','scroll',['log-style']],['cloud','클라우드 백업','cloud',['cloud']],['usage','사용량','chart',['usage']]];
  for(const [id,title,icon,groups] of pageDefs){const page=document.createElement('div');page.dataset.rbPage=id;page.hidden=true;groups.forEach(g=>{if(sourceSections[g])page.appendChild(sourceSections[g]);});pages[id]=page;body.appendChild(page);}
  box.replaceChildren();
  box.appendChild(body);
  const footer=document.createElement('div');footer.className='cigh-rb-savebar';
  footer.innerHTML=`<span role="status" aria-live="polite">SETTINGS</span><div class="cigh-rb-save-actions"><span class="cigh-rb-footer-version">v${VERSION}</span><button type="button" data-rb-revert>되돌리기</button></div>`;
  footer.querySelector('.cigh-rb-save-actions').appendChild(save);box.appendChild(footer);
  rbButtonIcon(save,'check','저장');save.classList.add('cigh-rb-primary');
  // Move the same auto-read control to AI. Other FX options stay on the view page.
  const autoRow=pages.view.querySelector('#cigh-clean-auto-analyze-input')?.closest('label');
  if(autoRow)pages.ai.appendChild(autoRow);
  const preview=pages.view.querySelector('[data-action="preview"]')?.parentElement;
  if(preview)pages.ai.appendChild(preview);
  box.querySelectorAll('input[type="checkbox"]').forEach(i=>{i.classList.add('cigh-rb-switch');i.setAttribute('role','switch');});
  // Retain native select controls for provider/model validation, and add accessible
  // segmented buttons as synchronized views rather than replacing input values.
  function segments(select,labels){
    if(!select)return;const group=document.createElement('div');group.className='cigh-rb-segments';group.setAttribute('role','group');group.setAttribute('aria-label',select.closest('label')?.querySelector('span')?.textContent||'선택');
    const sync=()=>{group.replaceChildren();[...select.options].forEach(o=>{const b=document.createElement('button');b.type='button';b.textContent=labels?.[o.value]||o.textContent;b.classList.toggle('on',o.value===select.value);b.setAttribute('aria-pressed',String(o.value===select.value));b.addEventListener('click',()=>{select.value=o.value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();});group.appendChild(b);});};
    select.after(group);select.hidden=true;select.addEventListener('change',sync);sync();return sync;
  }
  const provider=box.querySelector('#cigh-clean-provider-input');
  segments(provider,{'ai-studio':'AI Studio',firebase:'Firebase',deepseek:'DeepSeek'});
  segments(box.querySelector('#cigh-clean-font-size-input'),{small:'Aa · 작게',medium:'Aa · 보통',large:'Aa · 크게'});
  const fontNote=document.createElement('p');fontNote.className='cigh-rb-help';
  fontNote.textContent='기본 글꼴 · 모나체 / 기존 UI 크기 설정을 유지해요. 글자 크기에 따라 도트 경계가 부드러워질 수 있어요.';
  pages.view.querySelector('#cigh-clean-font-size-input')?.closest('label')?.appendChild(fontNote);
  const thinking=box.querySelector('#cigh-clean-thinking-input');const syncThinking=segments(thinking);
  const model=box.querySelector('#cigh-clean-model-input');model?.addEventListener('change',()=>queueMicrotask(()=>{syncThinking?.();update();}));
  const dock=box.querySelector('#cigh-clean-header-dock-input');
  if(dock){
    const row=dock.closest('label');row.hidden=true;
    const picks=document.createElement('div');picks.className='cigh-rb-dock-picks';picks.setAttribute('role','group');picks.setAttribute('aria-label','HUD 배치');
    picks.innerHTML=[false,true].map(on=>`<button type="button" data-rb-dock="${on}"><svg viewBox="0 0 60 44" width="60" height="44" aria-hidden="true"><rect x="1" y="1" width="58" height="42" rx="3" fill="var(--cigh-bg-soft)" stroke="var(--cigh-border)"/><path d="M2 8H58 M7 14H38 M7 20H45 M25 26H53" stroke="var(--cigh-border)" stroke-width="3"/><rect x="5" y="35" width="50" height="6" rx="2" fill="var(--cigh-fill)"/>${on?'<rect x="22" y="3" width="4" height="3" fill="var(--cigh-accent)"/><rect x="6" y="30" width="48" height="3" fill="var(--cigh-accent-soft)"/>':'<path d="M7 29l3-3 3 3-3 3z" fill="var(--cigh-accent)"/>'}</svg><b>${on?'상단 도킹':'플로팅'}</b><small>${on?'제목 옆 ◆ · 입력창 위 티커':'◆ 버튼을 원하는 곳에'}</small></button>`).join('');
    row.after(picks);
    const sync=()=>picks.querySelectorAll('button').forEach(b=>{const on=(b.dataset.rbDock==='true')===dock.checked;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    picks.addEventListener('click',e=>{const b=e.target.closest('button');if(b){dock.checked=b.dataset.rbDock==='true';dock.dispatchEvent(new Event('change',{bubbles:true}));}});dock.addEventListener('change',sync);sync();
  }
  for(const [id,toggle,clear] of [['cigh-clean-api-input','toggle','clear'],['cigh-clean-deepseek-api-input','deepseek-toggle','deepseek-clear']]){
    const input=box.querySelector('#'+id);if(!input)continue;
    const group=document.createElement('div');group.className='cigh-rb-key-row';input.before(group);group.appendChild(input);
    for(const [action,icon,label] of [[toggle,'eye','입력 보기'],[clear,'trash','저장된 키 삭제']]){const button=box.querySelector(`[data-action="${action}"]`);if(button){rbButtonIcon(button,icon,label,true);group.appendChild(button);}}
  }
  const fields=[...box.querySelectorAll('input[id],textarea[id],select[id]')].filter(e=>!e.id.includes('-cloud-')&&!e.id.includes('-style-preset-select'));
  const draftFields=()=>fields;
  const value=e=>e.type==='checkbox'?e.checked:e.value;
  let baseline=new Map(draftFields().map(e=>[e.id,value(e)])),pageId='menu';
  const changed=()=>draftFields().filter(e=>baseline.has(e.id)&&baseline.get(e.id)!==value(e));
  const status=document.createElement('div');status.className='cigh-rb-provider-status';pages.ai.prepend(status);
  const styleInput=box.querySelector('#cigh-clean-style-input'),styleSelect=box.querySelector('#cigh-clean-style-preset-select');
  const presets=document.createElement('div');presets.className='cigh-rb-style-list';styleSelect?.after(presets);if(styleSelect)styleSelect.hidden=true;
  const example=document.createElement('div');example.className='cigh-rb-style-example';styleInput?.before(example);
  let presetOptionsKey='',presetText=null;
  function renderPresets(){
    if(!styleSelect)return;
    const options=[...styleSelect.options];
    const key=JSON.stringify(options.map(o=>[o.value,o.textContent]));
    if(key!==presetOptionsKey){
      presetOptionsKey=key;presets.replaceChildren();
      options.forEach(o=>{
        const button=document.createElement('button');button.type='button';button.textContent=o.textContent;
        button.addEventListener('click',()=>{styleSelect.value=o.value;styleSelect.dispatchEvent(new Event('change',{bubbles:true}));update();});
        presets.appendChild(button);
      });
    }
    options.forEach((o,i)=>{const b=presets.children[i];b.classList.toggle('on',o.selected);b.setAttribute('aria-pressed',String(o.selected));});
    const text=String(styleInput?.value||'');
    if(text!==presetText){
      presetText=text;
      const lines=text.split('\n').filter(s=>/^\s*예\s*[:：]/.test(s)).map(s=>s.replace(/^\s*예\s*[:：]\s*/,''));
      example.textContent=lines.length?lines.join('\n'):'이 문체에는 예시가 없어요. 아래 지침을 직접 편집할 수 있어요.';
    }
  }

  const quickDefs=[['auto','자동 읽기','cigh-clean-auto-analyze-input',setAutoAnalyzeEnabled],['sfx','효과음','cigh-clean-sfx-input',setSfxEnabled],['comment','코멘트 팝업','cigh-clean-comment-popup-input',setCommentPopupEnabled],['mascot','마스코트','cigh-clean-mascot-input',setMascotEnabled]];
  menu.innerHTML=`<div class="cigh-clean-sh">빠른 설정 <small>누르면 즉시 적용</small></div><div class="cigh-rb-quick">${quickDefs.map(([id,label])=>`<label>${esc(label)}<input type="checkbox" class="cigh-rb-switch" role="switch" data-rb-quick="${id}" aria-label="${esc(label)}"></label>`).join('')}</div><div class="cigh-clean-sh">설정</div><div class="cigh-rb-menu">${pageDefs.map(([id,title,icon])=>`<button type="button" data-rb-nav="${id}">${rbIcon(icon)}<b>${title}</b><span data-rb-summary="${id}"></span>${rbIcon('right',10)}</button>`).join('')}</div><p class="cigh-rb-help">오른쪽 요약은 저장된 값이에요. 상세 설정의 변경은 저장 버튼으로 적용해요.</p>`;
  const nameRow=pages.view.querySelector('#cigh-clean-pet-name-input')?.closest('label');
  if(nameRow){nameRow.classList.add('cigh-rb-pet-name');nameRow.querySelector('span')?.classList.add('cigh-clean-sh');menu.querySelector('.cigh-rb-quick').after(nameRow);}
  pages.view.querySelector('[data-fold-body="ui"] .cigh-clean-settings-help')?.replaceChildren(document.createTextNode('HUD 글자 크기를 바꿉니다. 게임 데이터나 펫 성장 상태에는 영향을 주지 않습니다.'));
  function menuSummary(){
    const summary={ai:getSelectedProviderModel(),view:`${getUiFontSizeLabel()} · ${isDockModeEnabled()?'도킹':'플로팅'}`,log:getStylePrompt()===DEFAULT_STYLE_PROMPT?'기본 RPG':'사용자 문체',cloud:getCloudLink().code?'코드 연결됨':'미연결',usage:'토큰 · 추정 비용'};
    Object.entries(summary).forEach(([k,v])=>{menu.querySelector(`[data-rb-summary="${k}"]`).textContent=v;menu.querySelector(`[data-rb-summary="${k}"]`).title=v;});
    const getters={auto:isAutoAnalyzeEnabled,sfx:isSfxEnabled,comment:isCommentPopupEnabled,mascot:isMascotEnabled};quickDefs.forEach(([id])=>menu.querySelector(`[data-rb-quick="${id}"]`).checked=getters[id]());
  }
  let updateQueued=false;
  function update(){
    if(updateQueued)return;
    updateQueued=true;
    queueMicrotask(()=>{updateQueued=false;if(box.isConnected)refreshSettingsState();});
  }
  function refreshSettingsState(){
    const count=changed().length;
    const pageTitle=pageDefs.find(x=>x[0]===pageId)?.[1]||'SETTINGS';
    const readOnlyPage=['cloud','usage'].includes(pageId);
    footer.querySelector('[role="status"]').textContent=count?`● 변경 ${count}개`:pageId==='menu'?'SETTINGS':`${pageTitle} · 저장됨`;
    save.disabled=!count;save.hidden=!count||readOnlyPage;
    footer.querySelector('[data-rb-revert]').hidden=!count||readOnlyPage;
    status.textContent=provider.value==='deepseek'?(hasDeepSeekKey()?'● DeepSeek 키 저장됨':'○ DeepSeek 키 필요'):provider.value==='firebase'?(hasFirebaseConfig()?'● Firebase Config 저장됨':'○ Firebase Config 필요'):(hasGeminiKey()?'● Gemini 키 저장됨':'○ Gemini 키 필요');
    renderPresets();menuSummary();
  }
  function navigate(id){
    pageId=id;backRow.hidden=id==='menu';Object.values(pages).forEach(p=>p.hidden=p.dataset.rbPage!==id);menu.hidden=id!=='menu';body.scrollTop=0;
    update();
    if(id==='usage')refreshUsageSettingsSection(box);
    if(id==='cloud')updateCloudSettingsStatus(box);
  }
  function close(){box.remove();returnFocus?.isConnected&&returnFocus.focus({preventScroll:true});}
  function requestClose(){
    if(cloudBusy){setFooter('클라우드 작업이 끝난 뒤 닫아 주세요.');return;}
    if(changed().length)rbConfirm({title:'UNSAVED SETTINGS',text:'저장하지 않은 변경을 버릴까요?',accept:'변경 버리기',detail:'<p>상세 설정의 미저장 입력만 취소해요. 빠른 설정과 이미 실행한 키 삭제·문체 관리·클라우드 작업은 유지돼요.</p>',onAccept:close});else close();
  }
  box.rbRequestClose=requestClose;box.rbCloseSaved=close;
  panel.appendChild(box);applyThemeMode();
  // Bound once after all fields have been moved; page changes keep these references valid.
  bindSettingsPanel(box);
  box.addEventListener('input',event=>{if(!event.target.matches('[data-rb-quick]'))update();});box.addEventListener('change',update);
  box.addEventListener('click',event=>{
    const nav=event.target.closest('[data-rb-nav]');if(nav){navigate(nav.dataset.rbNav);backButton?.focus();return;}
    if(event.target.closest('[data-rb-back]')){navigate('menu');menu.querySelector('[data-rb-nav]')?.focus();return;}
    if(event.target.closest('[data-rb-revert]')){
      draftFields().forEach(e=>{if(baseline.has(e.id)){if(e.type==='checkbox')e.checked=baseline.get(e.id);else e.value=baseline.get(e.id);}});
      provider.dispatchEvent(new Event('change',{bubbles:true}));model?.dispatchEvent(new Event('change',{bubbles:true}));
      // Rebuild model-dependent choices before restoring their draft baseline.
      queueMicrotask(()=>{if(thinking&&baseline.has(thinking.id))thinking.value=baseline.get(thinking.id);thinking?.dispatchEvent(new Event('change',{bubbles:true}));dock?.dispatchEvent(new Event('change',{bubbles:true}));styleInput?.dispatchEvent(new Event('input',{bubbles:true}));box.querySelector('#cigh-clean-font-size-input')?.dispatchEvent(new Event('change',{bubbles:true}));update();});return;
    }
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(['clear','deepseek-clear','firebase-clear','style-reset'].includes(action)){
      const id={clear:'cigh-clean-api-input','deepseek-clear':'cigh-clean-deepseek-api-input','firebase-clear':'cigh-clean-firebase-input','style-reset':'cigh-clean-style-input'}[action];const input=box.querySelector('#'+id);
      const actuallyReset=action==='style-reset'?getStylePrompt()===DEFAULT_STYLE_PROMPT:action==='clear'?!hasGeminiKey()&&input?.value==='':action==='deepseek-clear'?!hasDeepSeekKey()&&input?.value==='':!hasFirebaseConfig()&&input?.value==='';
      if(input&&actuallyReset)baseline.set(id,value(input));
    }
    if(action)queueMicrotask(update);
  });
  quickDefs.forEach(([id,label,inputId,setter])=>menu.querySelector(`[data-rb-quick="${id}"]`).addEventListener('change',event=>{
    setter(event.target.checked);const field=box.querySelector('#'+inputId);field.checked=event.target.checked;baseline.set(inputId,field.checked);
    if(id==='mascot')syncMascotForRoute();update();
  }));
  rbTrapFocus(box,()=>{if(document.getElementById('cigh-rb-confirm'))return;if(pageId==='menu')requestClose();else{navigate('menu');menu.querySelector('[data-rb-nav]')?.focus();}});
  navigate('menu');menu.querySelector('[data-rb-nav]')?.focus();
}


// Restyle only content beneath the untouched USER toolbar.
function renderInfoTab(main){
  rbLegacy_renderInfoTab(main);
  const body=document.createElement('div');body.className='cigh-rb-info';
  [...main.children].filter(e=>!e.classList.contains('cigh-clean-info-tools')).forEach(e=>body.appendChild(e));
  main.appendChild(body);
  const data=stripRoomUserFromData(currentData||getRoom().data);
  const deltas=new Map((data?.relationshipDeltas||[]).map(d=>[relationKey(d.name),Number(d.delta)||0]));
  const meters=(data?.affection||[]).map(x=>normalizeMeter(x,50));
  body.querySelectorAll('.cigh-clean-brow').forEach((row,i)=>{
    const delta=deltas.get(relationKey(meters[i]?.name||''));if(!delta)return;
    const badge=document.createElement('span');badge.className='cigh-rb-info-delta'+(delta<0?' down':'');
    badge.textContent=(delta<0?'▼':'▲')+Math.abs(delta);
    badge.title='최근 분석의 관계 변화 요청값 · 0~100 경계에서는 실제 반영량이 다를 수 있어요';
    row.querySelector('.cigh-clean-blbl')?.appendChild(badge);
  });
}

let rbEditorReturnFocus=null;
function rbBasePolishEditor(){
  const modal=document.getElementById('cigh-clean-custom-deco-modal');if(!modal)return;
  const icons={'data-custom-close':['close','닫기'],'data-custom-undo':['undo','실행 취소'],'data-custom-redo':['redo','다시 실행'],'data-custom-layer-add':['plus','새 레이어'],'data-custom-layer-up':['up','레이어 위로'],'data-custom-layer-down':['down','레이어 아래로'],'data-custom-layer-rename':['edit','레이어 이름 변경'],'data-custom-layer-visible':['eye','레이어 표시 전환'],'data-custom-layer-delete':['minus','레이어 삭제']};
  Object.entries(icons).forEach(([attr,[icon,label]])=>modal.querySelectorAll('['+attr+']').forEach(b=>{if(!b.closest('.cigh-clean-custom-sheet'))rbButtonIcon(b,icon,label,true);}));
  modal.querySelectorAll('.cigh-clean-custom-dialog').forEach(e=>{e.setAttribute('role','dialog');e.setAttribute('aria-modal','true');e.setAttribute('aria-label','커스텀 가구');});
  rbTrapFocus(modal,()=>{
    const sheet=[...modal.querySelectorAll('.cigh-clean-custom-sheet,.cigh-clean-custom-preview-layer')].find(e=>!e.hidden&&getComputedStyle(e).display!=='none');
    if(sheet){sheet.querySelector('button[data-custom-palette-close],button[data-custom-layers-close],button[data-custom-settings-close],button[data-custom-preview-close]')?.click();return;}
    closeCustomDecoModal();
  });
}
function openCustomDecoEditor(id=''){const focus=document.activeElement;rbLegacy_openCustomDecoEditor(id);rbEditorReturnFocus=focus;rbPolishEditor();}
function openCustomDecoImportModal(){const focus=document.activeElement;rbLegacy_openCustomDecoImportModal();rbEditorReturnFocus=focus;rbPolishEditor();}
function closeCustomDecoModal(){rbLegacy_closeCustomDecoModal();if(rbEditorReturnFocus?.isConnected)rbEditorReturnFocus.focus({preventScroll:true});rbEditorReturnFocus=null;}
function renderPetItemHTML(){
  const shop=readShopState(),pet=getPet();
  const row=item=>{
    const stock=shop.bag[item.id]||0,locked=item.kind==='tendency'&&pet.level>=14;
    const icon=item.kind==='exp'?'✦':{heart:'♥',bloom:'✿',peace:'☺',tear:'☂',blade:'⚔'}[item.tendency];
    const color=item.kind==='exp'?'var(--cigh-accent)':PET_FINAL_FORMS[item.tendency]?.color||'var(--cigh-accent)';
    return `<div class="cigh-clean-item-row"><span class="cigh-rb-item-icon" style="--item-color:${esc(color)}" aria-hidden="true">${icon}</span><div class="cigh-clean-item-copy"><strong>${esc(item.name)}</strong><small>${esc(item.kind==='exp'?'경험치 +'+item.amount:({heart:'애정',bloom:'명랑',peace:'평화',tear:'애상',blade:'시련'}[item.tendency]||'')+' 성향 +5')}${locked?' · 잠김':''}</small></div><div class="cigh-clean-item-actions">${stock?`<button type="button" data-item-action="use" data-item-id="${item.id}" ${shopBusy||locked?'disabled':''}>보유 ${stock} · 사용</button>`:''}<button type="button" class="cigh-rb-primary" data-item-action="purchase-use" data-item-id="${item.id}" ${shopBusy||locked||shop.coins<item.price?'disabled':''} title="${item.price} 코인으로 구매하고 즉시 사용">🪙${item.price} · 사용</button></div></div>`;
  };
  const owned=SHOP_CATALOG.filter(i=>i.kind==='outfit'&&shop.owned[i.id]);
  return `<div class="cigh-clean-items"><div class="cigh-rb-wallet"><span aria-hidden="true">🪙</span><b>${shop.coins.toLocaleString()} <small>C</small></b><span class="cigh-rb-wallet-help">공용 코인 · 첫 분석 +1 C<br>사면 바로 현재 펫에게 적용</span></div><div class="cigh-clean-item-notice" role="status" aria-live="polite">${esc(shopNotice||`Lv.${pet.level} · ${pet.level<14?'성향 씨앗으로 진화 후보를 조절해요.':'씨앗 잠김 · 다른 진화형은 STATUS의 펫 초기화로 시작해요.'}`)}</div>${section('EXP',SHOP_CATALOG.filter(i=>i.kind==='exp').map(row).join(''))}${section('TENDENCY',SHOP_CATALOG.filter(i=>i.kind==='tendency').map(row).join(''))}${owned.length?`<details class="cigh-clean-item-legacy"><summary>이전 의상 환불 ${owned.length}</summary><p class="cigh-rb-help">사용이 중지된 의상은 구매가 전액을 환불해요.</p>${owned.map(i=>`<div class="cigh-clean-item-row"><span>${esc(i.name)}</span><button type="button" data-item-action="refund" data-item-id="${i.id}" ${shopBusy?'disabled':''}>🪙${i.price} 환불</button></div>`).join('')}</details>`:''}</div>`;
}


function rbGauge(value,label){
  const percent=clamp(Number(value)||0,0,100);
  return `<div class="cigh-rb-gauge" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent.toFixed(1)}" title="${esc(label)} · ${percent.toFixed(1)}%"><i style="width:${percent}%"></i></div>`;
}
function renderPetTab(main){
  rbLegacy_renderPetTab(main);
  const tally=getPet().tally||{},total=TENDENCY_KEYS.reduce((s,k)=>s+Math.max(0,Number(tally[k])||0),0);
  main.querySelectorAll('.cigh-clean-tendency-badge').forEach((badge,i)=>{
    const key=TENDENCY_KEYS[i],count=Math.max(0,Number(tally[key])||0),pct=total?Math.round(count/total*100):0;
    badge.querySelector('.cigh-clean-tendency-emoji').textContent={heart:'♥',bloom:'✿',peace:'☺',tear:'☂',blade:'⚔'}[key];
    const p=document.createElement('small');p.className='cigh-rb-tendency-percent';p.textContent=pct+'%';badge.appendChild(p);
    badge.style.setProperty('--cigh-rb-tendency-pct',pct+'%');
  });
}
function rbLogTime(text){
 const plain=String(text).trim().replace(/^[▶▷◇]\s*/,'');
 const match=plain.match(/^\[?\s*((?:(?:오전|오후|AM|PM)\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)\s*\]?$/i);
 return match?match[1]:null;
}
function flushLog(options={}){
  rbLegacy_flushLog(options);
  const inner=document.getElementById('cigh-clean-log-inner');if(!inner)return;
  let boot=inner.parentElement.querySelector('.cigh-rb-log-boot');
  if(!boot){boot=document.createElement('div');boot.className='cigh-rb-log-boot';inner.before(boot);}
  const bootKey=JSON.stringify([VERSION,getSelectedProviderModel(),isAutoAnalyzeEnabled()]);
  if(boot.dataset.state!==bootKey){boot.dataset.state=bootKey;boot.innerHTML=`<b>◆ INFO GAME HUD <small>v${esc(VERSION)}</small></b><span>▶ 모델 · ${esc(getSelectedProviderModel())}</span><span>▷ 새 답변 자동 읽기 ${isAutoAnalyzeEnabled()?'ON':'OFF'}</span>`;}
  const rows=[...inner.children];
  // Old versions inserted extra bare HH:mm headings. Hide them without
  // changing stored history or the legacy renderer's row indices.
  rows.forEach(row=>{row.hidden=/^\d{1,2}:\d{2}(?::\d{2})?$/.test(rbLogTime(row.textContent)||'');});
  const visible=rows.filter(row=>!row.hidden);
  let visibleIndex=-1;
  rows.forEach(row=>{
    const index=row.hidden?0:++visibleIndex;
    const t=row.textContent.trim(),plain=t.replace(/^[▶▷◇]\s*/,'');
    const stamp=rbLogTime(t),isTime=stamp!==null;
    row.classList.toggle('cigh-rb-log-time',isTime);if(isTime)row.textContent=stamp;
    row.classList.toggle('cigh-rb-log-rule',/^[─━\-]{5,}$/.test(plain));
    row.classList.toggle('cigh-rb-log-secondary',/^▷/.test(t));
    row.classList.toggle('cigh-rb-log-system',/티켓\s*\+|코인\s*\+/.test(t));
    row.style.opacity=String(visible.length<2?1:.3+.7*Math.max(0,index)/(visible.length-1));
  });
}


function rbPolishEditor(){
  rbBasePolishEditor();
  const modal=document.getElementById('cigh-clean-custom-deco-modal');if(!modal)return;
  const size=modal.querySelector('.cigh-clean-custom-size'),preview=modal.querySelector('.cigh-clean-custom-room-preview-box');
  if(size&&preview)preview.appendChild(size);
  const mode=modal.querySelector('.cigh-clean-custom-inputmode'),zoom=modal.querySelector('.cigh-clean-custom-mobile-zoom');
  if(mode&&zoom){zoom.appendChild(mode);mode.querySelectorAll('button').forEach(b=>b.textContent=b.dataset.customInputmode==='direct'?'직접':'커서');}
  modal.querySelectorAll('[data-custom-share]').forEach(b=>rbButtonIcon(b,'copy','공유 코드'));
  modal.querySelectorAll('[data-custom-settings-open]').forEach(b=>rbButtonIcon(b,'gear','설정'));
}

function rbUsesThinkingLevels(model){return /^gemini-3\./.test(normalizeGeminiModelId(model));}
function rbCreditAnalysisCoin(shop){shop.coins=Math.min(1000000000,shop.coins+1);}
function rbKeyVisibilityIcon(button,input){
 const visible=input.type!=='password';
 rbButtonIcon(button,'eye',visible?'입력 숨김':'입력 보기',true);
 button.setAttribute('aria-pressed',String(visible));
}

  function buildUsageSummaryHtml() {
    const { usage, rows, totalCost } = getUsageCostSummary();
    const estimatedSuffix = usage.estimatedRequestCount
      ? ` · 추정 ${formatInt(usage.estimatedRequestCount)}회`
      : '';

    const amounts=rows.map(row=>Math.max(0,Number(row.input)||0)+Math.max(0,Number(row.output)||0));
    const totalTokens=amounts.reduce((a,b)=>a+b,0);
    const modelRows = rows.length
      ? rows.map((row,index) => {
          const providerLabel = row.provider === 'deepseek'
            ? (row.pricingSource === 'deepseek-direct' ? 'DeepSeek' : 'DeepSeek 3P')
            : row.provider === 'firebase'
              ? 'Firebase'
              : 'Gemini';
          const costLabel = typeof row.cost === 'number'
            ? `${row.estimatedCount ? '추정 ' : ''}${formatUsd(row.cost)}`
            : '단가 미확인';
          const detail = row.provider === 'deepseek'
            ? `입력 ${formatInt(row.input)} · hit ${formatInt(row.cacheHit)} / miss ${formatInt(row.cacheMiss)} · 출력 ${formatInt(row.output)}${row.reasoning ? ` · 추론 ${formatInt(row.reasoning)}` : ''}`
            : `입력 ${formatInt(row.input)}${row.cacheHit ? ` · cache ${formatInt(row.cacheHit)}` : ''} · 출력 ${formatInt(row.output)}${row.reasoning ? ` · thinking ${formatInt(row.reasoning)}` : ''}`;

          return `
            <div class="cigh-clean-usage-model-row">
              <div class="cigh-rb-model-head"><span class="cigh-rb-model-chip">${esc(providerLabel)}</span><span class="cigh-rb-model-name" title="${esc(row.model || row.key)}">${esc(row.model || row.key)}</span><b>${esc(costLabel)}</b></div>
              <small>${esc(detail)}${row.estimatedCount ? ` · usage 없음 ${formatInt(row.estimatedCount)}회` : ''}</small>
              ${rbGauge(totalTokens?amounts[index]/totalTokens*100:0,'전체 입력·출력 토큰 중 이 모델 비중')}
            </div>
          `;
        }).join('')
      : '<div class="cigh-clean-usage-empty">아직 집계된 사용량이 없어요.</div>';

    return `
      <div class="cigh-clean-usage-summary" data-usage-summary="1">
        <div class="cigh-clean-usage-line">
          요청 ${formatInt(usage.requestCount)}${estimatedSuffix} · 입력 ${formatInt(usage.inputTokens)} · 출력 ${formatInt(usage.outputTokens)} · 예상 ${formatUsd(totalCost)}
        </div>
        <div class="cigh-clean-sh">◆ 모델별</div><div class="cigh-clean-usage-models">${modelRows}</div>
      </div>
    `;
  }
  function renderCrackRecordHtml() {
    const state = readCrackRecordState();
    const topStories = getCrackRecordTopStories(state);
    const top = topStories[0] || null;
    const storyCount = Object.keys(state.byStory || {}).length;
    const max=Math.max(1,...topStories.slice(0,5).map(row=>Number(row.spent)||0));
    const syncKind=crackRecordSyncing?'busy':state.lastSyncError?'error':state.historyInitialized&&!state.historyPartial?'ok':'pending';
    const syncState = crackRecordSyncing ? '동기화 중' : state.lastSyncError ? '동기화 오류' : state.historyInitialized ? (state.historyPartial ? '일부 동기화됨' : '동기화됨') : '동기화 전';
    const oldestDays = getOldestKnownCrackRoomDays(state);
    const topRows = topStories.slice(0, 5).map((item, index) => `
      <div class="cigh-clean-record-story-row">
        <span><b>#${index + 1}</b> ${esc(item.title || '제목 없음')}</span>
        <strong>${formatCracker(item.spent)} 🪙</strong>${rbGauge(Number(item.spent||0)/max*100,'최다 사용 작품 대비 크래커 사용량')}
      </div>
    `).join('');

    return '<div class="cigh-rb-record">'+renderLocalPlayRecordHtml() + section('CRACK RECORD', `
      <div class="cigh-clean-record-hero">
        <div class="cigh-clean-record-card">
          <span>TOTAL SPENT</span>
          <b>${state.historyInitialized ? formatCracker(state.totalSpent) : '—'} 🪙</b>
        </div>
        <div class="cigh-clean-record-card">
          <span>BALANCE</span>
          <b>${state.currentBalance == null ? '—' : formatCracker(state.currentBalance)} 🪙</b>
        </div>
      </div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">FREE / PAID</span><span class="cigh-clean-sval">${formatCracker(state.freeSpent)} / ${formatCracker(state.paidSpent)}</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">WORKS</span><span class="cigh-clean-sval">${storyCount}개</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">TOP WORK</span><span class="cigh-clean-sval">${top ? `${esc(top.title)} · ${formatCracker(top.spent)}` : '—'}</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">REROLL</span><span class="cigh-clean-sval">${formatCracker(state.rerollTotal)}회 · ${formatCracker(state.rerollSpent)} 🪙</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">MAX SAME TURN</span><span class="cigh-clean-sval">${formatCracker(state.rerollRunMax)}회</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">ENDINGS</span><span class="cigh-clean-sval">${(state.endingChats || []).length}개</span></div>
      <div class="cigh-clean-srow"><span class="cigh-clean-slbl">OLDEST KNOWN</span><span class="cigh-clean-sval">${oldestDays ? `${oldestDays}일` : '—'}</span></div>
      <div class="cigh-clean-record-sync-row" data-rb-sync="${syncKind}">
        <span>● ${esc(syncState)} · ${esc(formatCrackSyncTime(state.lastSyncAt))}</span>
        <button type="button" data-action="record-sync" ${crackRecordSyncing ? 'disabled' : ''}>${rbIcon('refresh')} 동기화</button>
      </div>
    `) + section('TOP WORKS', topRows || '<div class="cigh-clean-mini-empty">아직 크래커 사용 기록이 없습니다.</div>') + `
      <div class="cigh-clean-record-note">크래커 원문 내역은 저장하지 않고 누적값만 보관합니다. 리롤 횟수·리롤 소비는 이 버전 설치 후부터 정확하게 누적됩니다.</div>
    `+'</div>';
  }

  installPetShop();
  init();
})();
