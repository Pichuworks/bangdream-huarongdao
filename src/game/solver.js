import { BOARD_COLS, BOARD_ROWS, PIECES } from "../config/pieces.js";

const DIRECTIONS = [
  { name: "up", dx: 0, dy: -1 },
  { name: "down", dx: 0, dy: 1 },
  { name: "left", dx: -1, dy: 0 },
  { name: "right", dx: 1, dy: 0 },
];

const PIECE_ORDER = PIECES.map((piece) => piece.id);
const PIECE_INDEX = Object.fromEntries(PIECE_ORDER.map((id, index) => [id, index]));
const PIECE_META = Object.fromEntries(PIECES.map((piece) => [piece.id, { width: piece.width, height: piece.height }]));

export function solveKlotski(currentPieces, options = {}) {
  const maxNodes = options.maxNodes ?? 200000;
  const goalPieceId = options.goalPieceId ?? "caocao";
  const startPositions = encodeFromPieces(currentPieces);
  const startCanon = toCanonicalKey(startPositions, goalPieceId);

  if (isSolvedPositions(startPositions, goalPieceId)) {
    return [];
  }

  const queue = [startCanon];
  const parents = new Map([[startCanon, null]]);
  const actions = new Map();
  const positionsByCanon = new Map([[startCanon, startPositions]]);

  let readIndex = 0;

  while (readIndex < queue.length) {
    const canon = queue[readIndex];
    readIndex += 1;

    if (parents.size > maxNodes) {
      return null;
    }

    const positions = positionsByCanon.get(canon);
    const nextStates = generateNeighbors(positions);

    for (const next of nextStates) {
      const nextCanon = toCanonicalKey(next.positions, goalPieceId);
      if (parents.has(nextCanon)) {
        continue;
      }

      parents.set(nextCanon, canon);
      actions.set(nextCanon, { pieceId: next.pieceId, direction: next.direction });
      positionsByCanon.set(nextCanon, next.positions);

      if (isSolvedPositions(next.positions, goalPieceId)) {
        return rebuildPath(nextCanon, parents, actions);
      }

      queue.push(nextCanon);
    }
  }

  return null;
}

function rebuildPath(endCanon, parents, actions) {
  const path = [];
  let cursor = endCanon;

  while (parents.get(cursor) !== null) {
    path.push(actions.get(cursor));
    cursor = parents.get(cursor);
  }

  path.reverse();
  return path;
}

function generateNeighbors(positions) {
  const pieces = decodePositions(positions);
  const occupied = buildOccupied(pieces);
  const result = [];

  for (const pieceId of PIECE_ORDER) {
    const piece = pieces[pieceId];

    for (const dir of DIRECTIONS) {
      if (!canMove(piece, dir.dx, dir.dy, occupied)) {
        continue;
      }

      const nextPositions = positions.slice();
      nextPositions[PIECE_INDEX[pieceId]] = toPos(piece.x + dir.dx, piece.y + dir.dy);
      result.push({
        positions: nextPositions,
        pieceId,
        direction: dir.name,
      });
    }
  }

  return result;
}

function canMove(piece, dx, dy, occupied) {
  const nextX = piece.x + dx;
  const nextY = piece.y + dy;

  if (nextX < 0 || nextY < 0 || nextX + piece.width > BOARD_COLS || nextY + piece.height > BOARD_ROWS) {
    return false;
  }

  for (let y = nextY; y < nextY + piece.height; y += 1) {
    for (let x = nextX; x < nextX + piece.width; x += 1) {
      const owner = occupied.get(`${x},${y}`);
      if (owner && owner !== piece.id) {
        return false;
      }
    }
  }

  return true;
}

function buildOccupied(pieces) {
  const occupied = new Map();

  for (const pieceId of PIECE_ORDER) {
    const piece = pieces[pieceId];
    for (let y = piece.y; y < piece.y + piece.height; y += 1) {
      for (let x = piece.x; x < piece.x + piece.width; x += 1) {
        occupied.set(`${x},${y}`, pieceId);
      }
    }
  }

  return occupied;
}

function encodeFromPieces(currentPieces) {
  const pieceMap = Object.fromEntries(currentPieces.map((piece) => [piece.id, piece]));
  return PIECE_ORDER.map((pieceId) => toPos(pieceMap[pieceId].x, pieceMap[pieceId].y));
}

function decodePositions(positions) {
  const pieces = {};

  for (let i = 0; i < PIECE_ORDER.length; i += 1) {
    const pieceId = PIECE_ORDER[i];
    const pos = positions[i];
    pieces[pieceId] = {
      id: pieceId,
      x: pos % BOARD_COLS,
      y: Math.floor(pos / BOARD_COLS),
      width: PIECE_META[pieceId].width,
      height: PIECE_META[pieceId].height,
    };
  }

  return pieces;
}

function toCanonicalKey(positions, goalPieceId) {
  const safeGoalId = PIECE_INDEX[goalPieceId] !== undefined ? goalPieceId : "caocao";
  const goalIndex = PIECE_INDEX[safeGoalId];
  const groups = new Map();

  for (let i = 0; i < PIECE_ORDER.length; i += 1) {
    if (i === goalIndex) {
      continue;
    }

    const pieceId = PIECE_ORDER[i];
    const meta = PIECE_META[pieceId];
    const key = `${meta.width}x${meta.height}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(positions[i]);
  }

  const parts = [`goal:${positions[goalIndex]}`];
  const groupKeys = [...groups.keys()].sort();
  for (const key of groupKeys) {
    const packed = groups.get(key).sort((a, b) => a - b).join(".");
    parts.push(`${key}:${packed}`);
  }

  return parts.join("|");
}

function isSolvedPositions(positions, goalPieceId) {
  const safeGoalId = PIECE_INDEX[goalPieceId] !== undefined ? goalPieceId : "caocao";
  const goalIndex = PIECE_INDEX[safeGoalId];
  const pos = positions[goalIndex];
  const meta = PIECE_META[safeGoalId];

  const x = pos % BOARD_COLS;
  const y = Math.floor(pos / BOARD_COLS);
  const atBottom = y + meta.height === BOARD_ROWS;
  if (!atBottom) {
    return false;
  }

  if (meta.width === 2) {
    return x === 1;
  }

  return x === 1 || x === 2;
}

function toPos(x, y) {
  return y * BOARD_COLS + x;
}
