import { BOARD_COLS, BOARD_ROWS, PIECES } from "./config/pieces.js";
import { ACTIVE_SKIN_PRESET, getSkinMapping } from "./config/skins.js";
import { SWAP_LAYOUTS } from "./config/swap_layouts.js";
import * as classicEngine from "./game/engine.js";
import { solveKlotski } from "./game/solver.js";

const ROLE_MAP_URL = "data/image-role-map.json";
const PIECE_LAYOUT_URL = "data/piece-layout.json";

const FIT_MODE_DEFAULT = "balanced";
const TARGET_MODE_DEFAULT = "origin";

const boardEl = document.querySelector("#board");
const goalTextEl = document.querySelector("#goalText");
const winTextEl = document.querySelector("#winText");
const stepsEl = document.querySelector("#steps");
const timerEl = document.querySelector("#timer");
const winPanelEl = document.querySelector("#winPanel");
const restartBtnEl = document.querySelector("#restartBtn");
const resetTimerBtnEl = document.querySelector("#resetTimerBtn");
const autoSolveBtnEl = document.querySelector("#autoSolveBtn");
const solveStatusEl = document.querySelector("#solveStatus");

const targetCharEl = document.querySelector("#targetChar");
const targetModeEl = document.querySelector("#targetMode");
const fitModeEl = document.querySelector("#fitMode");
const showNamesToggleEl = document.querySelector("#showNamesToggle");

if (
  !boardEl ||
  !goalTextEl ||
  !winTextEl ||
  !stepsEl ||
  !timerEl ||
  !winPanelEl ||
  !restartBtnEl ||
  !resetTimerBtnEl ||
  !autoSolveBtnEl ||
  !solveStatusEl ||
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

const imageSizeCache = new Map();

void boot();

async function boot() {
  await loadExternalConfigs();
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
