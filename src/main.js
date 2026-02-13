import { BOARD_COLS, BOARD_ROWS, PIECES } from "./config/pieces.js";
import { ACTIVE_SKIN_PRESET, getSkinMapping } from "./config/skins.js";
import { SWAP_LAYOUTS } from "./config/swap_layouts.js";
import * as classicEngine from "./game/engine.js";
import { solveKlotski } from "./game/solver.js";

const ROLE_MAP_URL = "data/image-role-map.json";
const PIECE_LAYOUT_URL = "data/piece-layout.json";
const NOTICE_CONFIG_URL = "data/notice-config.json";
const APP_CONFIG_URL = "data/app-config.json";

const FIT_MODE_DEFAULT = "balanced";
const TARGET_MODE_DEFAULT = "origin";
const NOTICE_REFRESH_SEC_DEFAULT = 60;
const NOTICE_ROTATE_SEC_DEFAULT = 10;
const APP_VERSION_DEFAULT = "0.0.0";
const APP_DEVELOPER_DEFAULT = "PichuTheLolitaNeko";
const APP_MODEL_DEFAULT = "gpt-5.3-codex";
const APP_REASONING_DEFAULT = "high";
const APP_SUMMARIES_DEFAULT = "auto";
const APP_LAST_UPDATED_DEFAULT = "2026-02-13";
const LUNAR_NUMERIC_FORMAT = createLunarNumericFormatter();
const NOTICE_TYPE_MAP = {
  festival: "节日",
  birthday: "生日",
  system: "系统",
  custom: "自定义通知",
};

const boardEl = document.querySelector("#board");
const appVersionEl = document.querySelector("#appVersion");
const footerDevEl = document.querySelector("#footerDev");
const footerPoweredEl = document.querySelector("#footerPowered");
const footerUpdatedEl = document.querySelector("#footerUpdated");
const goalTextEl = document.querySelector("#goalText");
const winTextEl = document.querySelector("#winText");
const stepsEl = document.querySelector("#steps");
const timerEl = document.querySelector("#timer");
const winPanelEl = document.querySelector("#winPanel");
const restartBtnEl = document.querySelector("#restartBtn");
const resetTimerBtnEl = document.querySelector("#resetTimerBtn");
const autoSolveBtnEl = document.querySelector("#autoSolveBtn");
const solveStatusEl = document.querySelector("#solveStatus");
const noticeBarEl = document.querySelector("#noticeBar");
const noticeTextEl = document.querySelector("#noticeText");
const noticeTagEl = noticeBarEl?.querySelector(".notice-tag") ?? null;

const targetCharEl = document.querySelector("#targetChar");
const targetModeEl = document.querySelector("#targetMode");
const fitModeEl = document.querySelector("#fitMode");
const showNamesToggleEl = document.querySelector("#showNamesToggle");

if (
  !boardEl ||
  !appVersionEl ||
  !footerDevEl ||
  !footerPoweredEl ||
  !footerUpdatedEl ||
  !goalTextEl ||
  !winTextEl ||
  !stepsEl ||
  !timerEl ||
  !winPanelEl ||
  !restartBtnEl ||
  !resetTimerBtnEl ||
  !autoSolveBtnEl ||
  !solveStatusEl ||
  !noticeBarEl ||
  !noticeTextEl ||
  !noticeTagEl ||
  !targetCharEl ||
  !targetModeEl ||
  !fitModeEl ||
  !showNamesToggleEl
) {
  throw new Error("页面元素初始化失败");
}

let state = null;
let activeEngine = classicEngine;
let fitMode = FIT_MODE_DEFAULT;
let targetMode = TARGET_MODE_DEFAULT;
let showRoleNames = false;
let resolvedSetup = null;
let targetImageOptions = [];
let appVersion = APP_VERSION_DEFAULT;
let appDeveloper = APP_DEVELOPER_DEFAULT;
let appPoweredModel = APP_MODEL_DEFAULT;
let appPoweredReasoning = APP_REASONING_DEFAULT;
let appPoweredSummaries = APP_SUMMARIES_DEFAULT;
let appLastUpdated = APP_LAST_UPDATED_DEFAULT;

let roleMap = {};
let basePieceLayout = {};
let targetImagePath = "";

let pieceDomMap = new Map();
let dragStart = null;
let selectedPieceId = null;

let timerHandle = null;
let isAutoSolving = false;
let uiLocked = false;
let fitToken = 0;
let restartToken = 0;
let noticeConfigItems = [];
let activeNoticeItems = [];
let noticeIndex = 0;
let noticeRefreshSec = NOTICE_REFRESH_SEC_DEFAULT;
let noticeRotateSec = NOTICE_ROTATE_SEC_DEFAULT;
let noticeRefreshHandle = null;
let noticeRotateHandle = null;

const imageSizeCache = new Map();

void boot();

async function loadAppConfig() {
  try {
    const response = await fetch(APP_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    appVersion = normalizeVersion(data?.version);
    const footer = typeof data?.footer === "object" && data.footer ? data.footer : {};
    appDeveloper = normalizePlainText(footer.developer, APP_DEVELOPER_DEFAULT);
    appPoweredModel = normalizePlainText(footer.model, APP_MODEL_DEFAULT);
    appPoweredReasoning = normalizePlainText(footer.reasoning, APP_REASONING_DEFAULT);
    appPoweredSummaries = normalizePlainText(footer.summaries, APP_SUMMARIES_DEFAULT);
    appLastUpdated = normalizeDateString(footer.lastUpdated, APP_LAST_UPDATED_DEFAULT);
  } catch (error) {
    appVersion = APP_VERSION_DEFAULT;
    appDeveloper = APP_DEVELOPER_DEFAULT;
    appPoweredModel = APP_MODEL_DEFAULT;
    appPoweredReasoning = APP_REASONING_DEFAULT;
    appPoweredSummaries = APP_SUMMARIES_DEFAULT;
    appLastUpdated = APP_LAST_UPDATED_DEFAULT;
  }

  renderAppMeta();
}

async function boot() {
  await loadAppConfig();
  await loadExternalConfigs();
  await initNoticeBar();
  initControls();
  await restartGame();
  updateStats();
  startTimerTick();

  window.addEventListener("resize", () => {
    if (!state) {
      return;
    }
    void fitBoardToImages();
  });
}

function renderAppMeta() {
  if (!appVersionEl || !footerDevEl || !footerPoweredEl || !footerUpdatedEl) {
    return;
  }

  appVersionEl.textContent = `v${appVersion}`;
  footerDevEl.textContent = `Developed by ${appDeveloper}`;
  footerPoweredEl.textContent = `Powered by ${appPoweredModel} (reasoning ${appPoweredReasoning}, summaries ${appPoweredSummaries})`;
  footerUpdatedEl.textContent = `Last update: ${appLastUpdated}`;
}

async function loadExternalConfigs() {
  const fallbackMapping = getSkinMapping(ACTIVE_SKIN_PRESET);

  try {
    const response = await fetch(ROLE_MAP_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    roleMap = typeof data.roles === "object" && data.roles ? data.roles : {};
    showRoleNames = typeof data.showRoleNamesDefault === "boolean" ? data.showRoleNamesDefault : false;
  } catch (error) {
    roleMap = {};
    showRoleNames = false;
    setSolveStatus("角色映射读取失败，已回退默认角色。", true);
  }

  try {
    const response = await fetch(PIECE_LAYOUT_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const pieceImage = typeof data.pieceImage === "object" && data.pieceImage ? data.pieceImage : {};

    basePieceLayout = {};
    for (const piece of PIECES) {
      basePieceLayout[piece.id] = pieceImage[piece.id] ?? fallbackMapping[piece.id] ?? fallbackMapping.caocao ?? "";
    }
  } catch (error) {
    basePieceLayout = {};
    for (const piece of PIECES) {
      basePieceLayout[piece.id] = fallbackMapping[piece.id] ?? fallbackMapping.caocao ?? "";
    }
  }

  targetImagePath = basePieceLayout.caocao || Object.keys(roleMap)[0] || "img/1.JPG";
}

async function initNoticeBar() {
  await refreshNoticeConfig();
  startNoticeTimers();
}

async function refreshNoticeConfig() {
  try {
    const response = await fetch(NOTICE_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const normalized = normalizeNoticeConfig(data);
    noticeConfigItems = normalized.items;
    noticeRefreshSec = normalized.refreshSec;
    noticeRotateSec = normalized.rotateSec;
    syncActiveNotices();
    renderNotice();
    startNoticeTimers();
  } catch (error) {
    if (!noticeConfigItems.length) {
      noticeConfigItems = [
        {
          text: "通知配置读取失败，请检查 data/notice-config.json",
          level: "warn",
          typeKey: "system",
          typeLabel: NOTICE_TYPE_MAP.system,
          startAtMs: null,
          endAtMs: null,
          annualDates: [],
          annualStart: null,
          annualEnd: null,
          lunarAnnualDates: [],
          lunarAnnualStart: null,
          lunarAnnualEnd: null,
          themeColor: null,
        },
      ];
      syncActiveNotices();
      noticeIndex = 0;
      renderNotice();
    }
  }
}

function normalizeNoticeConfig(data) {
  const source = typeof data === "object" && data ? data : {};
  const refreshSec = clampInteger(source.refreshIntervalSec, 10, 3600, NOTICE_REFRESH_SEC_DEFAULT);
  const rotateSec = clampInteger(source.rotateIntervalSec, 2, 600, NOTICE_ROTATE_SEC_DEFAULT);
  const rawItems = Array.isArray(source.notices) ? source.notices : [];
  const items = rawItems
    .map((item) => normalizeNoticeItem(item))
    .filter((item) => Boolean(item));

  if (!items.length) {
    items.push({
      text: "当前暂无通知。",
      level: "info",
      typeKey: "system",
      typeLabel: NOTICE_TYPE_MAP.system,
      startAtMs: null,
      endAtMs: null,
      annualDates: [],
      annualStart: null,
      annualEnd: null,
      lunarAnnualDates: [],
      lunarAnnualStart: null,
      lunarAnnualEnd: null,
      themeColor: null,
    });
  }

  return { refreshSec, rotateSec, items };
}

function normalizeNoticeItem(item) {
  if (typeof item === "string") {
    const text = item.trim();
    return text
      ? {
          text,
          level: "info",
          typeKey: "custom",
          typeLabel: NOTICE_TYPE_MAP.custom,
          startAtMs: null,
          endAtMs: null,
          annualDates: [],
          annualStart: null,
          annualEnd: null,
          lunarAnnualDates: [],
          lunarAnnualStart: null,
          lunarAnnualEnd: null,
          themeColor: null,
        }
      : null;
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const text = typeof item.text === "string" ? item.text.trim() : "";
  if (!text) {
    return null;
  }

  const level = item.level === "success" || item.level === "warn" ? item.level : "info";
  const normalizedType = normalizeNoticeType(item.type);
  const startAtMs = parseDateTime(item.startAt);
  const endAtMs = parseDateTime(item.endAt);
  const themeColor = normalizeHexColor(item.themeColor);

  const annualDates = [];
  if (typeof item.annualDate === "string") {
    const parsed = parseMonthDay(item.annualDate);
    if (parsed) {
      annualDates.push(parsed);
    }
  }
  if (Array.isArray(item.annualDates)) {
    for (const value of item.annualDates) {
      const parsed = parseMonthDay(value);
      if (parsed) {
        annualDates.push(parsed);
      }
    }
  }

  const uniqueAnnualDates = [];
  const seen = new Set();
  for (const dateItem of annualDates) {
    if (seen.has(dateItem.key)) {
      continue;
    }
    seen.add(dateItem.key);
    uniqueAnnualDates.push(dateItem);
  }

  let annualStart = parseMonthDay(item.annualStart);
  let annualEnd = parseMonthDay(item.annualEnd);
  if (annualStart && !annualEnd) {
    annualEnd = annualStart;
  } else if (!annualStart && annualEnd) {
    annualStart = annualEnd;
  }

  const lunarAnnualDates = [];
  if (typeof item.lunarAnnualDate === "string") {
    const parsed = parseLunarMonthDay(item.lunarAnnualDate);
    if (parsed) {
      lunarAnnualDates.push(parsed);
    }
  }
  if (Array.isArray(item.lunarAnnualDates)) {
    for (const value of item.lunarAnnualDates) {
      const parsed = parseLunarMonthDay(value);
      if (parsed) {
        lunarAnnualDates.push(parsed);
      }
    }
  }

  const uniqueLunarAnnualDates = [];
  const lunarSeen = new Set();
  for (const dateItem of lunarAnnualDates) {
    if (lunarSeen.has(dateItem.key)) {
      continue;
    }
    lunarSeen.add(dateItem.key);
    uniqueLunarAnnualDates.push(dateItem);
  }

  let lunarAnnualStart = parseLunarMonthDay(item.lunarAnnualStart);
  let lunarAnnualEnd = parseLunarMonthDay(item.lunarAnnualEnd);
  if (lunarAnnualStart && !lunarAnnualEnd) {
    lunarAnnualEnd = lunarAnnualStart;
  } else if (!lunarAnnualStart && lunarAnnualEnd) {
    lunarAnnualStart = lunarAnnualEnd;
  }

  return {
    text,
    level,
    typeKey: normalizedType.key,
    typeLabel: normalizedType.label,
    startAtMs,
    endAtMs,
    annualDates: uniqueAnnualDates,
    annualStart,
    annualEnd,
    lunarAnnualDates: uniqueLunarAnnualDates,
    lunarAnnualStart,
    lunarAnnualEnd,
    themeColor,
  };
}

function syncActiveNotices(now = new Date()) {
  const filtered = noticeConfigItems.filter((item) => isNoticeActive(item, now));
  activeNoticeItems = filtered.length
    ? filtered
    : [
        {
          text: "当前暂无有效通知。",
          level: "info",
          typeKey: "system",
          typeLabel: NOTICE_TYPE_MAP.system,
          lunarAnnualDates: [],
          lunarAnnualStart: null,
          lunarAnnualEnd: null,
          themeColor: null,
        },
      ];
  noticeIndex = activeNoticeItems.length ? noticeIndex % activeNoticeItems.length : 0;
}

function isNoticeActive(item, now) {
  const nowMs = now.getTime();

  if (item.startAtMs !== null && nowMs < item.startAtMs) {
    return false;
  }
  if (item.endAtMs !== null && nowMs > item.endAtMs) {
    return false;
  }

  const hasAnnualDates = Array.isArray(item.annualDates) && item.annualDates.length > 0;
  const hasAnnualRange = Boolean(item.annualStart && item.annualEnd);
  const hasLunarAnnualDates = Array.isArray(item.lunarAnnualDates) && item.lunarAnnualDates.length > 0;
  const hasLunarAnnualRange = Boolean(item.lunarAnnualStart && item.lunarAnnualEnd);

  if (!hasAnnualDates && !hasAnnualRange && !hasLunarAnnualDates && !hasLunarAnnualRange) {
    return true;
  }

  let matched = false;
  const monthDayKey = toMonthDayKey(now.getMonth() + 1, now.getDate());
  if (hasAnnualDates && item.annualDates.some((annualDate) => annualDate.key === monthDayKey)) {
    matched = true;
  }

  if (hasAnnualRange && isMonthDayInRange(monthDayKey, item.annualStart.key, item.annualEnd.key)) {
    matched = true;
  }

  const lunarMonthDayKey = getLunarMonthDayKey(now);
  if (lunarMonthDayKey !== null) {
    if (hasLunarAnnualDates && item.lunarAnnualDates.some((annualDate) => annualDate.key === lunarMonthDayKey)) {
      matched = true;
    }

    if (
      hasLunarAnnualRange &&
      isMonthDayInRange(lunarMonthDayKey, item.lunarAnnualStart.key, item.lunarAnnualEnd.key)
    ) {
      matched = true;
    }
  }

  return matched;
}

function renderNotice() {
  if (!noticeTextEl || !noticeBarEl || !noticeTagEl) {
    return;
  }

  const current = activeNoticeItems[noticeIndex] ?? {
    text: "当前暂无通知。",
    level: "info",
    typeKey: "system",
    typeLabel: NOTICE_TYPE_MAP.system,
    themeColor: null,
  };
  noticeTextEl.textContent = current.text;
  noticeTagEl.textContent = current.typeLabel ?? NOTICE_TYPE_MAP.custom;
  noticeBarEl.dataset.level = current.level ?? "info";
  noticeBarEl.dataset.noticeType = current.typeKey ?? "custom";
  applyNoticeTheme(current.themeColor ?? null);
}

function startNoticeTimers() {
  if (noticeRefreshHandle) {
    clearInterval(noticeRefreshHandle);
  }
  if (noticeRotateHandle) {
    clearInterval(noticeRotateHandle);
  }

  noticeRefreshHandle = setInterval(() => {
    void refreshNoticeConfig();
  }, noticeRefreshSec * 1000);

  noticeRotateHandle = setInterval(() => {
    syncActiveNotices();
    if (activeNoticeItems.length > 1) {
      noticeIndex = (noticeIndex + 1) % activeNoticeItems.length;
    } else {
      noticeIndex = 0;
    }
    renderNotice();
  }, noticeRotateSec * 1000);
}

function applyNoticeTheme(themeColor) {
  if (!noticeBarEl || !noticeTextEl || !noticeTagEl) {
    return;
  }

  if (!themeColor) {
    noticeBarEl.dataset.customTheme = "false";
    noticeBarEl.style.removeProperty("--notice-theme-border");
    noticeBarEl.style.removeProperty("--notice-theme-bg-1");
    noticeBarEl.style.removeProperty("--notice-theme-bg-2");
    noticeBarEl.style.removeProperty("--notice-theme-text");
    noticeBarEl.style.removeProperty("--notice-theme-tag-border");
    noticeBarEl.style.removeProperty("--notice-theme-tag-text");
    return;
  }

  const palette = buildNoticeTheme(themeColor);
  if (!palette) {
    noticeBarEl.dataset.customTheme = "false";
    return;
  }

  noticeBarEl.dataset.customTheme = "true";
  noticeBarEl.style.setProperty("--notice-theme-border", palette.border);
  noticeBarEl.style.setProperty("--notice-theme-bg-1", palette.bg1);
  noticeBarEl.style.setProperty("--notice-theme-bg-2", palette.bg2);
  noticeBarEl.style.setProperty("--notice-theme-text", palette.text);
  noticeBarEl.style.setProperty("--notice-theme-tag-border", palette.tagBorder);
  noticeBarEl.style.setProperty("--notice-theme-tag-text", palette.tagText);
}

function initControls() {
  populateTargetOptions();

  fitModeEl.value = fitMode;
  targetModeEl.value = targetMode;
  showNamesToggleEl.checked = showRoleNames;
  targetCharEl.value = targetImagePath;

  targetCharEl.addEventListener("change", () => {
    if (uiLocked || isAutoSolving) {
      return;
    }

    targetImagePath = targetCharEl.value;
    void restartGame();
  });

  targetModeEl.addEventListener("change", () => {
    if (uiLocked || isAutoSolving) {
      return;
    }

    targetMode = targetModeEl.value;
    renderTargetOptions();
    void restartGame();
  });

  fitModeEl.addEventListener("change", () => {
    if (uiLocked || isAutoSolving) {
      return;
    }

    fitMode = fitModeEl.value;
    void fitBoardToImages();
  });

  showNamesToggleEl.addEventListener("change", () => {
    showRoleNames = showNamesToggleEl.checked;
    syncNameVisibility();
  });

  restartBtnEl.addEventListener("click", () => {
    if (uiLocked || isAutoSolving) {
      return;
    }
    void restartGame();
  });

  resetTimerBtnEl.addEventListener("click", () => {
    if (!state || uiLocked || isAutoSolving) {
      return;
    }

    state.startedAt = null;
    state.wonAt = null;
    updateStats();
    syncWinPanel();
  });

  autoSolveBtnEl.addEventListener("click", () => {
    void autoSolveCurrentState();
  });

  syncControlState();
}

function populateTargetOptions() {
  const fromLayout = Object.values(basePieceLayout);
  targetImageOptions = [...new Set(fromLayout.filter(Boolean))];
  targetImageOptions.sort((a, b) => sortImagePathByIndex(a, b));

  if (!targetImageOptions.includes(targetImagePath)) {
    targetImagePath = targetImageOptions[0] ?? targetImagePath;
  }

  renderTargetOptions();
}

function renderTargetOptions() {
  const selected = targetImagePath;
  targetCharEl.innerHTML = "";

  for (const imagePath of targetImageOptions) {
    const option = document.createElement("option");
    option.value = imagePath;
    option.textContent = formatTargetOptionText(imagePath);
    if (imagePath === selected) {
      option.selected = true;
    }
    targetCharEl.append(option);
  }

  if (![...targetCharEl.options].some((opt) => opt.value === selected)) {
    targetImagePath = targetCharEl.value;
  }
}

function formatTargetOptionText(imagePath) {
  const fallbackName = parseImageIndex(imagePath) !== null ? `角色${parseImageIndex(imagePath)}` : "未命名角色";
  return getRoleName(imagePath, fallbackName);
}

async function restartGame() {
  const token = ++restartToken;
  setControlLock(true);

  const nextSetup = getResolvedSetup();
  const nextState = await buildInitialStateForMode(nextSetup);
  if (token !== restartToken) {
    return;
  }

  resolvedSetup = nextSetup;
  state = nextState;
  selectedPieceId = null;
  renderBoard();
  updateStats();
  syncWinPanel();
  updateGoalTexts();
  setSolveStatus("");

  setControlLock(false);
}

async function buildInitialStateForMode(setup) {
  activeEngine = classicEngine;
  return classicEngine.createInitialState({
    goalPieceId: setup.goalPieceId,
    initialPieces: setup.initialPieces,
  });
}

function getCurrentMapping() {
  const fallback = getSkinMapping(ACTIVE_SKIN_PRESET);
  const mapping = {};

  for (const piece of PIECES) {
    mapping[piece.id] = basePieceLayout[piece.id] ?? fallback[piece.id] ?? fallback.caocao ?? "";
  }

  return mapping;
}

function getResolvedSetup() {
  const mapping = getCurrentMapping();
  const targetPieceId = findPieceIdByImage(mapping, targetImagePath) ?? "caocao";
  const initialPieces = targetMode === "swap_michelle" ? getSwapInitialPieces(targetPieceId) : null;

  return {
    mapping,
    goalPieceId: targetPieceId,
    initialPieces,
  };
}

function findPieceIdByImage(mapping, imagePath) {
  if (!imagePath) {
    return null;
  }
  const piece = PIECES.find((item) => mapping[item.id] === imagePath);
  return piece?.id ?? null;
}

function getSwapInitialPieces(targetPieceId) {
  if (targetPieceId === "caocao") {
    return null;
  }

  const layout = SWAP_LAYOUTS[targetPieceId];
  if (!layout) {
    return null;
  }

  return PIECES.map((piece) => {
    const slot = layout[piece.id];
    if (!slot) {
      return { ...piece };
    }
    return {
      ...piece,
      x: slot.x,
      y: slot.y,
    };
  });
}

function renderBoard() {
  if (!state) {
    return;
  }

  boardEl.innerHTML = "";
  pieceDomMap = new Map();

  for (const piece of state.pieces) {
    const pieceEl = document.createElement("div");
    pieceEl.className = "piece";
    pieceEl.dataset.id = piece.id;

    const label = document.createElement("span");
    label.className = "piece-label";
    label.textContent = piece.name;
    pieceEl.append(label);

    attachPieceEvents(pieceEl, piece.id);
    boardEl.append(pieceEl);
    pieceDomMap.set(piece.id, pieceEl);
  }

  applySkins();
  layoutPieces();
  syncSelectableState();
  syncNameVisibility();
  syncWinPanel();
}

function applySkins() {
  if (!state) {
    return;
  }

  const mapping = resolvedSetup?.mapping ?? getCurrentMapping();

  for (const piece of state.pieces) {
    const pieceEl = pieceDomMap.get(piece.id);
    if (!pieceEl) {
      continue;
    }

    const imagePath = mapping[piece.id] ?? mapping.caocao ?? "";
    pieceEl.style.backgroundImage = imagePath ? `url("${imagePath}")` : "none";

    const labelEl = pieceEl.querySelector(".piece-label");
    if (labelEl) {
      labelEl.textContent = getRoleName(imagePath, piece.name);
    }
  }

  updateGoalTexts();
  syncNameVisibility();
  syncPieceImageFit();
  void fitBoardToImages();
}

function updateGoalTexts() {
  const targetName = getRoleName(targetImagePath, "目标角色");
  const modeSuffix = targetMode === "swap_michelle" && resolvedSetup?.initialPieces ? "（已与米歇尔换位）" : "";
  goalTextEl.textContent = `目标：将${targetName}移动到底部中间出口${modeSuffix}`;
  winTextEl.textContent = `${targetName}已到出口。`;
}

function getRoleName(imagePath, fallback) {
  const record = roleMap[imagePath];
  return record?.roleName ?? fallback;
}

function syncNameVisibility() {
  for (const pieceEl of pieceDomMap.values()) {
    const labelEl = pieceEl.querySelector(".piece-label");
    if (!labelEl) {
      continue;
    }
    labelEl.classList.toggle("hidden", !showRoleNames);
  }
}

function syncPieceImageFit() {
  const noCrop = false;

  for (const pieceEl of pieceDomMap.values()) {
    pieceEl.style.backgroundSize = noCrop ? "contain" : "cover";
    pieceEl.classList.toggle("no-crop", noCrop);
  }
}

function layoutPieces() {
  if (!state) {
    return;
  }
  layoutClassicPieces();
}

function layoutClassicPieces() {
  boardEl.classList.remove("free-board");
  boardEl.style.removeProperty("width");
  boardEl.style.removeProperty("height");

  const exitCells = 2;
  const exitLeft = 1;
  boardEl.style.setProperty("--exit-left", `calc(var(--cell-w) * ${exitLeft})`);
  boardEl.style.setProperty("--exit-width", `calc(var(--cell-w) * ${exitCells})`);

  for (const piece of state.pieces) {
    const pieceEl = pieceDomMap.get(piece.id);
    if (!pieceEl) {
      continue;
    }

    pieceEl.style.left = `calc(var(--cell-w) * ${piece.x} + var(--piece-gap) / 2)`;
    pieceEl.style.top = `calc(var(--cell-h) * ${piece.y} + var(--piece-gap) / 2)`;
    pieceEl.style.width = `calc(var(--cell-w) * ${piece.width} - var(--piece-gap))`;
    pieceEl.style.height = `calc(var(--cell-h) * ${piece.height} - var(--piece-gap))`;
  }
}

function attachPieceEvents(pieceEl, pieceId) {
  pieceEl.addEventListener("pointerdown", (event) => {
    if (!state || isAutoSolving || uiLocked) {
      return;
    }

    pieceEl.setPointerCapture(event.pointerId);
    dragStart = {
      pieceId,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    selectedPieceId = pieceId;
    syncSelectableState();
  });

  pieceEl.addEventListener("pointerup", (event) => {
    if (!state || isAutoSolving || uiLocked) {
      return;
    }

    if (!dragStart || dragStart.pointerId !== event.pointerId || dragStart.pieceId !== pieceId) {
      return;
    }

    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    let moved = false;
    const threshold = 18;

    if (absDx < threshold && absDy < threshold) {
      moved = smartClickMove(pieceId);
    } else if (absDx >= absDy) {
      moved = tryMove(pieceId, dx >= 0 ? "right" : "left");
    } else {
      moved = tryMove(pieceId, dy >= 0 ? "down" : "up");
    }

    if (!moved) {
      syncSelectableState();
    }

    dragStart = null;
  });

  pieceEl.addEventListener("pointercancel", () => {
    dragStart = null;
  });
}

function smartClickMove(pieceId) {
  const moves = activeEngine.getValidMoves(state, pieceId);
  if (moves.length === 1) {
    return tryMove(pieceId, moves[0]);
  }
  return false;
}

function tryMove(pieceId, direction) {
  const moved = activeEngine.movePiece(state, pieceId, direction);
  if (!moved) {
    return false;
  }

  selectedPieceId = pieceId;
  layoutPieces();
  updateStats();
  syncSelectableState();
  syncWinPanel();
  return true;
}

function syncSelectableState() {
  if (!state) {
    return;
  }

  for (const [pieceId, pieceEl] of pieceDomMap.entries()) {
    const shouldHighlight = !isAutoSolving && pieceId === selectedPieceId && activeEngine.getValidMoves(state, pieceId).length > 0;
    pieceEl.classList.toggle("selectable", shouldHighlight);
  }
}

function updateStats() {
  if (!state) {
    return;
  }

  stepsEl.textContent = String(state.steps);
  timerEl.textContent = formatElapsedTime();
}

function formatElapsedTime() {
  const elapsedMs = getElapsedMs();
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getElapsedMs() {
  if (!state || !state.startedAt) {
    return 0;
  }
  const end = state.wonAt ?? Date.now();
  return Math.max(0, end - state.startedAt);
}

function syncWinPanel() {
  if (!state) {
    return;
  }

  winPanelEl.classList.toggle("hidden", !activeEngine.isSolved(state));
}

function startTimerTick() {
  if (timerHandle) {
    clearInterval(timerHandle);
  }

  timerHandle = setInterval(() => {
    updateStats();
  }, 250);
}

function setSolveStatus(text, isWarning = false) {
  solveStatusEl.textContent = text;
  solveStatusEl.dataset.warning = isWarning ? "true" : "false";
}

async function autoSolveCurrentState() {
  if (!state || isAutoSolving || uiLocked) {
    return;
  }

  if (activeEngine.isSolved(state)) {
    setSolveStatus("当前已通关。");
    return;
  }

  const solution = await solveCurrentMode();
  if (!solution?.path) {
    const reasonText = solution?.reason ? `（${solution.reason}）` : "";
    setSolveStatus(`未找到解法${reasonText}。`, true);
    return;
  }

  const path = solution.path;
  if (path.length === 0) {
    setSolveStatus("当前已是目标状态。");
    return;
  }

  isAutoSolving = true;
  boardEl.classList.add("solving");
  syncControlState();
  setSolveStatus(`已找到 ${path.length} 步，正在执行...`);

  for (const step of path) {
    const moved = activeEngine.movePiece(state, step.pieceId, step.direction);
    if (moved) {
      selectedPieceId = step.pieceId;
      layoutPieces();
      updateStats();
      syncSelectableState();
      syncWinPanel();
    }

    if (activeEngine.isSolved(state)) {
      break;
    }

    await wait(120);
  }

  isAutoSolving = false;
  boardEl.classList.remove("solving");
  syncControlState();

  if (activeEngine.isSolved(state)) {
    setSolveStatus("自动求解完成。");
  } else {
    setSolveStatus("自动求解中断。", true);
  }
}

async function solveCurrentMode() {
  setSolveStatus("正在搜索解法...");
  await wait(0);

  const path = solveKlotski(state.pieces, {
    maxNodes: 300000,
    goalPieceId: state.goalPieceId ?? "caocao",
  });
  if (!path) {
    return { path: null, reason: "classic_search_failed" };
  }
  return { path, reason: "solved" };
}

function setControlLock(locked) {
  uiLocked = locked;
  syncControlState();
}

function syncControlState() {
  const lockAll = uiLocked || isAutoSolving;

  targetCharEl.disabled = lockAll;
  targetModeEl.disabled = lockAll;
  fitModeEl.disabled = lockAll;
  showNamesToggleEl.disabled = lockAll;

  restartBtnEl.disabled = lockAll;
  resetTimerBtnEl.disabled = lockAll;
  autoSolveBtnEl.disabled = lockAll;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fitBoardToImages() {
  if (!state) {
    return;
  }

  const token = ++fitToken;
  const mapping = resolvedSetup?.mapping ?? getCurrentMapping();
  const metrics = await collectPieceImageMetrics(mapping);

  if (token !== fitToken) {
    return;
  }

  const ratio = calcClassicRatio(metrics);
  const strict = fitMode === "strict";
  const { cellW, cellH } = calcClassicCellSize(ratio, strict);
  const pieceGap = calcPieceGap(cellH, strict);

  boardEl.style.setProperty("--cell-w", `${cellW.toFixed(2)}px`);
  boardEl.style.setProperty("--cell-h", `${cellH.toFixed(2)}px`);
  boardEl.style.setProperty("--piece-gap", `${pieceGap.toFixed(2)}px`);
  layoutPieces();
}

function calcClassicRatio(metrics) {
  if (fitMode === "strict") {
    return calcStrictRatio(metrics);
  }
  return calcBalancedRatio(metrics);
}

async function collectPieceImageMetrics(mapping) {
  const tasks = state.pieces.map(async (piece) => {
    const imagePath = mapping[piece.id] ?? mapping.caocao ?? "";
    const size = imagePath ? await getImageSize(imagePath) : null;
    if (!size) {
      return null;
    }

    return {
      imageRatio: size.width / size.height,
      pieceRatio: piece.width / piece.height,
      areaWeight: piece.width * piece.height,
    };
  });

  const data = await Promise.all(tasks);
  return data.filter((item) => Boolean(item));
}

function calcBalancedRatio(metrics) {
  if (!metrics.length) {
    return 1;
  }

  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const item of metrics) {
    const desiredCellRatio = item.imageRatio / item.pieceRatio;
    const safe = clamp(desiredCellRatio, 0.25, 4);
    weightedLogSum += Math.log(safe) * item.areaWeight;
    totalWeight += item.areaWeight;
  }

  return totalWeight ? clamp(Math.exp(weightedLogSum / totalWeight), 0.35, 2.85) : 1;
}

function calcStrictRatio(metrics) {
  if (!metrics.length) {
    return 1;
  }

  let weightedLogSum = 0;
  let totalWeight = 0;

  for (const item of metrics) {
    const safe = clamp(item.imageRatio, 0.25, 4);
    weightedLogSum += Math.log(safe) * item.areaWeight;
    totalWeight += item.areaWeight;
  }

  return totalWeight ? Math.exp(weightedLogSum / totalWeight) : 1;
}

function calcClassicCellSize(cellRatio, strict) {
  const ratio = strict ? Math.max(0.2, cellRatio) : clamp(cellRatio, 0.35, 2.85);

  const wrapWidth = boardEl.parentElement?.clientWidth ?? window.innerWidth;
  const maxBoardWidth = Math.max(260, Math.min(760, wrapWidth - 8));
  const maxBoardHeight = Math.max(320, Math.min(780, window.innerHeight * 0.72));

  const cellHFromWidth = maxBoardWidth / (BOARD_COLS * ratio);
  const cellHFromHeight = maxBoardHeight / BOARD_ROWS;
  let cellH = Math.min(cellHFromWidth, cellHFromHeight);
  let cellW = cellH * ratio;

  if (!strict) {
    cellH = clamp(cellH, 50, 140);
    cellW = clamp(cellW, 50, 160);
  }

  return { cellW, cellH };
}

function calcPieceGap(cellH, strict) {
  if (strict) {
    return clamp(cellH * 0.05, 4, 8);
  }
  return clamp(cellH * 0.085, 7, 12);
}

function sortImagePathByIndex(a, b) {
  const aIndex = parseImageIndex(a);
  const bIndex = parseImageIndex(b);

  if (aIndex !== null && bIndex !== null) {
    return aIndex - bIndex;
  }
  if (aIndex !== null) {
    return -1;
  }
  if (bIndex !== null) {
    return 1;
  }
  return a.localeCompare(b, "zh-CN");
}

function parseImageIndex(path) {
  const match = path.match(/img\/(\d+)\.jpe?g$/i);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

function parseDateTime(value) {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeVersion(value) {
  if (typeof value !== "string") {
    return APP_VERSION_DEFAULT;
  }

  const text = value.trim();
  if (!text) {
    return APP_VERSION_DEFAULT;
  }

  const withoutV = text.replace(/^[vV]/, "");
  const valid = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(withoutV);
  return valid ? withoutV : APP_VERSION_DEFAULT;
}

function normalizePlainText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const text = value.trim();
  return text || fallback;
}

function normalizeDateString(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  if (!text) {
    return fallback;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function normalizeNoticeType(value) {
  if (typeof value !== "string") {
    return { key: "custom", label: NOTICE_TYPE_MAP.custom };
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "festival" || normalized === "节日") {
    return { key: "festival", label: NOTICE_TYPE_MAP.festival };
  }
  if (normalized === "birthday" || normalized === "生日") {
    return { key: "birthday", label: NOTICE_TYPE_MAP.birthday };
  }
  if (normalized === "system" || normalized === "系统") {
    return { key: "system", label: NOTICE_TYPE_MAP.system };
  }
  if (normalized === "custom" || normalized === "custom_notice" || normalized === "自定义通知" || normalized === "自定义") {
    return { key: "custom", label: NOTICE_TYPE_MAP.custom };
  }

  return { key: "custom", label: NOTICE_TYPE_MAP.custom };
}

function createLunarNumericFormatter() {
  try {
    return new Intl.DateTimeFormat("zh-Hans-CN-u-ca-chinese", { month: "numeric", day: "numeric" });
  } catch (error) {
    return null;
  }
}

function getLunarMonthDayKey(date) {
  if (!LUNAR_NUMERIC_FORMAT) {
    return null;
  }

  try {
    const parts = LUNAR_NUMERIC_FORMAT.formatToParts(date);
    const monthText = parts.find((part) => part.type === "month")?.value ?? "";
    const dayText = parts.find((part) => part.type === "day")?.value ?? "";
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);

    if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 30) {
      return null;
    }

    return toMonthDayKey(month, day);
  } catch (error) {
    return null;
  }
}

function normalizeHexColor(value) {
  if (typeof value !== "string") {
    return null;
  }

  const hex = value.trim();
  const shortMatch = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const longMatch = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!longMatch) {
    return null;
  }
  return `#${longMatch[1].toUpperCase()}`;
}

function buildNoticeTheme(themeColor) {
  const normalized = normalizeHexColor(themeColor);
  if (!normalized) {
    return null;
  }

  const rgb = hexToRgb(normalized);
  if (!rgb) {
    return null;
  }

  return {
    border: normalized,
    bg1: rgbToHex(blendWithWhite(rgb, 0.92)),
    bg2: rgbToHex(blendWithWhite(rgb, 0.84)),
    text: rgbToHex(blendWithBlack(rgb, 0.45)),
    tagBorder: rgbToHex(blendWithWhite(rgb, 0.45)),
    tagText: rgbToHex(blendWithBlack(rgb, 0.38)),
  };
}

function hexToRgb(hexColor) {
  const normalized = normalizeHexColor(hexColor);
  if (!normalized) {
    return null;
  }

  const value = normalized.slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(rgb) {
  const toHex = (value) => clampInteger(value, 0, 255, 0).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

function blendWithWhite(rgb, whiteWeight) {
  const w = clamp(whiteWeight, 0, 1);
  return {
    r: Math.round(rgb.r * (1 - w) + 255 * w),
    g: Math.round(rgb.g * (1 - w) + 255 * w),
    b: Math.round(rgb.b * (1 - w) + 255 * w),
  };
}

function blendWithBlack(rgb, blackWeight) {
  const k = clamp(blackWeight, 0, 1);
  return {
    r: Math.round(rgb.r * (1 - k)),
    g: Math.round(rgb.g * (1 - k)),
    b: Math.round(rgb.b * (1 - k)),
  };
}

function parseMonthDay(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12) {
    return null;
  }

  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > maxDay) {
    return null;
  }

  return { month, day, key: toMonthDayKey(month, day) };
}

function parseLunarMonthDay(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1], 10);
  const day = Number.parseInt(match[2], 10);
  if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 30) {
    return null;
  }

  return { month, day, key: toMonthDayKey(month, day) };
}

function toMonthDayKey(month, day) {
  return month * 100 + day;
}

function isMonthDayInRange(value, start, end) {
  if (start <= end) {
    return value >= start && value <= end;
  }
  return value >= start || value <= end;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const integer = Math.floor(numeric);
  return Math.max(min, Math.min(max, integer));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function getImageSize(path) {
  if (imageSizeCache.has(path)) {
    return imageSizeCache.get(path);
  }

  const loading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = path;
  });

  imageSizeCache.set(path, loading);
  return loading;
}
