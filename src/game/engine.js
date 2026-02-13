import { BOARD_COLS, BOARD_ROWS, cloneInitialPieces } from "../config/pieces.js";

const DIRECTIONS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export function createInitialState(options = {}) {
  const goalPieceId = options.goalPieceId ?? "caocao";
  const initialPieces = Array.isArray(options.initialPieces) ? options.initialPieces : cloneInitialPieces();
  return {
    pieces: initialPieces.map((piece) => ({ ...piece })),
    goalPieceId,
    steps: 0,
    startedAt: null,
    wonAt: null,
  };
}

export function isSolved(state) {
  const goalPieceId = state.goalPieceId ?? "caocao";
  const piece = state.pieces.find((item) => item.id === goalPieceId);
  if (!piece) {
    return false;
  }

  const atBottom = piece.y + piece.height === BOARD_ROWS;
  if (!atBottom) {
    return false;
  }

  if (piece.width === 2) {
    return piece.x === 1;
  }

  return piece.x === 1 || piece.x === 2;
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
    .filter(([_, dir]) => canMove(state, piece, dir.dx, dir.dy))
    .map(([name]) => name);
}

export function movePiece(state, pieceId, directionName) {
  const piece = getPieceById(state, pieceId);
  if (!piece) {
    return false;
  }

  const direction = DIRECTIONS[directionName];
  if (!direction) {
    return false;
  }

  if (!canMove(state, piece, direction.dx, direction.dy)) {
    return false;
  }

  piece.x += direction.dx;
  piece.y += direction.dy;
  state.steps += 1;

  const now = Date.now();
  if (!state.startedAt) {
    state.startedAt = now;
  }
  if (isSolved(state) && !state.wonAt) {
    state.wonAt = now;
  }
  return true;
}

function canMove(state, piece, dx, dy) {
  const nextX = piece.x + dx;
  const nextY = piece.y + dy;

  if (nextX < 0 || nextY < 0 || nextX + piece.width > BOARD_COLS || nextY + piece.height > BOARD_ROWS) {
    return false;
  }

  const occupied = buildOccupiedMap(state.pieces, piece.id);

  for (let y = nextY; y < nextY + piece.height; y += 1) {
    for (let x = nextX; x < nextX + piece.width; x += 1) {
      const key = `${x},${y}`;
      if (occupied.has(key)) {
        return false;
      }
    }
  }

  return true;
}

function buildOccupiedMap(pieces, ignorePieceId) {
  const map = new Set();
  for (const piece of pieces) {
    if (piece.id === ignorePieceId) {
      continue;
    }

    for (let y = piece.y; y < piece.y + piece.height; y += 1) {
      for (let x = piece.x; x < piece.x + piece.width; x += 1) {
        map.add(`${x},${y}`);
      }
    }
  }
  return map;
}
