import { PIECES } from "../config/pieces.js";

const STEP = 0.25;
const EPS = 1e-6;
const SCRAMBLE_STEPS = 140;

const DIRECTIONS = {
  up: { dx: 0, dy: -STEP },
  down: { dx: 0, dy: STEP },
  left: { dx: -STEP, dy: 0 },
  right: { dx: STEP, dy: 0 },
};

const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function createInitialState(pieceRatioById) {
  const sized = PIECES.map((piece) => {
    const imageRatio = clamp(pieceRatioById[piece.id] ?? piece.width / piece.height, 0.35, 3.6);
    const logicalRatio = piece.width / piece.height;
    const distortion = Math.max(imageRatio / logicalRatio, logicalRatio / imageRatio);
    const areaScale = clamp(1 / Math.sqrt(distortion), 0.35, 1);
    const area = piece.width * piece.height * areaScale * 0.58;

    const width = round2(Math.sqrt(area * imageRatio));
    const height = round2(Math.sqrt(area / imageRatio));

    return {
      id: piece.id,
      name: piece.name,
      width,
      height,
    };
  });

  const solved = buildSolvedLayout(sized, "caocao");

  const state = {
    mode: "free_ratio",
    goalPieceId: "caocao",
    pieces: solved.pieces.map((piece) => ({ ...piece })),
    boardWidth: solved.boardWidth,
    boardHeight: solved.boardHeight,
    steps: 0,
    startedAt: null,
    wonAt: null,
    moveLog: [],
    startToSolvedPath: [],
  };

  const scrambleMoves = scrambleFromSolved(state, SCRAMBLE_STEPS);
  state.startToSolvedPath = reverseMoves(scrambleMoves);
  state.moveLog = [];
  state.steps = 0;
  state.startedAt = null;
  state.wonAt = null;

  return state;
}

export function isSolved(state) {
  const goalId = state.goalPieceId ?? "caocao";
  const piece = state.pieces.find((item) => item.id === goalId);
  if (!piece) {
    return false;
  }

  const centerX = piece.x + piece.width / 2;
  const targetCenterX = state.boardWidth / 2;
  const aligned = Math.abs(centerX - targetCenterX) <= Math.max(0.15, piece.width * 0.26);
  const atBottom = piece.y + piece.height >= state.boardHeight - 0.02;
  return aligned && atBottom;
}

export function getPieceById(state, pieceId) {
  return state.pieces.find((piece) => piece.id === pieceId) ?? null;
}

export function getValidMoves(state, pieceId) {
  const piece = getPieceById(state, pieceId);
  if (!piece) {
    return [];
  }

  return Object.entries(DIRECTIONS)
    .filter(([_, delta]) => canMove(state, piece, delta.dx, delta.dy))
    .map(([name]) => name);
}

export function movePiece(state, pieceId, directionName) {
  const piece = getPieceById(state, pieceId);
  const delta = DIRECTIONS[directionName];

  if (!piece || !delta) {
    return false;
  }

  if (!canMove(state, piece, delta.dx, delta.dy)) {
    return false;
  }

  applyMove(state, piece, delta.dx, delta.dy);

  state.steps += 1;
  appendMoveLog(state, pieceId, directionName);

  const now = Date.now();
  if (!state.startedAt) {
    state.startedAt = now;
  }
  if (isSolved(state) && !state.wonAt) {
    state.wonAt = now;
  }

  return true;
}

function buildSolvedLayout(sizedPieces, goalId) {
  const goal = sizedPieces.find((piece) => piece.id === goalId);
  const others = sizedPieces.filter((piece) => piece.id !== goalId).sort((a, b) => b.width * b.height - a.width * a.height);

  const baseWidth = Math.max(4.8, goal.width + 2.4);
  const baseHeight = Math.max(5.8, goal.height + 3.2);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const boardWidth = round2(baseWidth + attempt * 0.2);
    const boardHeight = round2(baseHeight + Math.floor(attempt / 3) * 0.2);

    const goalX = round2((boardWidth - goal.width) / 2);
    const goalY = round2(boardHeight - goal.height);
    const topLimit = round2(goalY - STEP);

    const placed = [
      {
        id: goal.id,
        name: goal.name,
        width: goal.width,
        height: goal.height,
        x: goalX,
        y: goalY,
      },
    ];

    let failed = false;
    for (const piece of others) {
      const pos = findPlacement(piece, placed, boardWidth, topLimit);
      if (!pos) {
        failed = true;
        break;
      }
      placed.push({
        id: piece.id,
        name: piece.name,
        width: piece.width,
        height: piece.height,
        x: pos.x,
        y: pos.y,
      });
    }

    if (!failed) {
      const ordered = PIECES.map((piece) => placed.find((item) => item.id === piece.id));
      return {
        boardWidth,
        boardHeight,
        pieces: ordered,
      };
    }
  }

  // Fallback（理论上不走到这里）
  const fallbackBoardWidth = round2(baseWidth + 2.4);
  const fallbackBoardHeight = round2(baseHeight + 1.8);
  const placed = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const piece of sizedPieces) {
    if (cursorX + piece.width > fallbackBoardWidth) {
      cursorX = 0;
      cursorY = round2(cursorY + rowH + STEP);
      rowH = 0;
    }

    placed.push({
      id: piece.id,
      name: piece.name,
      width: piece.width,
      height: piece.height,
      x: round2(cursorX),
      y: round2(cursorY),
    });

    cursorX = round2(cursorX + piece.width + STEP);
    rowH = Math.max(rowH, piece.height);
  }

  const goalPiece = placed.find((piece) => piece.id === goalId);
  goalPiece.x = round2((fallbackBoardWidth - goalPiece.width) / 2);
  goalPiece.y = round2(fallbackBoardHeight - goalPiece.height);

  return {
    boardWidth: fallbackBoardWidth,
    boardHeight: fallbackBoardHeight,
    pieces: PIECES.map((piece) => placed.find((item) => item.id === piece.id)),
  };
}

function findPlacement(piece, placed, boardWidth, topLimit) {
  for (let y = 0; y <= topLimit - piece.height + EPS; y += STEP) {
    for (let x = 0; x <= boardWidth - piece.width + EPS; x += STEP) {
      const rx = round2(x);
      const ry = round2(y);

      if (hasOverlap(rx, ry, piece.width, piece.height, placed)) {
        continue;
      }

      return { x: rx, y: ry };
    }
  }

  return null;
}

function scrambleFromSolved(state, maxSteps) {
  const steps = [];
  let prev = null;

  for (let i = 0; i < maxSteps; i += 1) {
    const candidates = [];

    for (const piece of state.pieces) {
      const moves = getValidMoves(state, piece.id);
      for (const direction of moves) {
        if (prev && prev.pieceId === piece.id && OPPOSITE[prev.direction] === direction) {
          continue;
        }

        candidates.push({ pieceId: piece.id, direction });
      }
    }

    if (!candidates.length) {
      break;
    }

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const piece = getPieceById(state, picked.pieceId);
    const delta = DIRECTIONS[picked.direction];
    applyMove(state, piece, delta.dx, delta.dy);
    steps.push(picked);
    prev = picked;
  }

  return steps;
}

function reverseMoves(moves) {
  return [...moves]
    .reverse()
    .map((move) => ({
      pieceId: move.pieceId,
      direction: OPPOSITE[move.direction],
    }));
}

function appendMoveLog(state, pieceId, direction) {
  if (!Array.isArray(state.moveLog)) {
    state.moveLog = [];
  }

  const last = state.moveLog[state.moveLog.length - 1];
  if (last && last.pieceId === pieceId && OPPOSITE[last.direction] === direction) {
    state.moveLog.pop();
    return;
  }

  state.moveLog.push({ pieceId, direction });
}

function applyMove(state, piece, dx, dy) {
  piece.x = round2(piece.x + dx);
  piece.y = round2(piece.y + dy);

  if (piece.x < 0) {
    piece.x = 0;
  }
  if (piece.y < 0) {
    piece.y = 0;
  }
  if (piece.x + piece.width > state.boardWidth) {
    piece.x = round2(state.boardWidth - piece.width);
  }
  if (piece.y + piece.height > state.boardHeight) {
    piece.y = round2(state.boardHeight - piece.height);
  }
}

function canMove(state, piece, dx, dy) {
  const nextX = piece.x + dx;
  const nextY = piece.y + dy;

  if (nextX < -EPS || nextY < -EPS || nextX + piece.width > state.boardWidth + EPS || nextY + piece.height > state.boardHeight + EPS) {
    return false;
  }

  for (const other of state.pieces) {
    if (other.id === piece.id) {
      continue;
    }

    if (rectOverlap(nextX, nextY, piece.width, piece.height, other.x, other.y, other.width, other.height)) {
      return false;
    }
  }

  return true;
}

function hasOverlap(x, y, w, h, placed) {
  for (const other of placed) {
    if (rectOverlap(x, y, w, h, other.x, other.y, other.width, other.height)) {
      return true;
    }
  }
  return false;
}

function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw - EPS && ax + aw > bx + EPS && ay < by + bh - EPS && ay + ah > by + EPS;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
