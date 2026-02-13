const OPPOSITE = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function solveFreeRatio(state) {
  if (!Array.isArray(state.startToSolvedPath)) {
    return {
      path: null,
      reason: "missing_start_solution",
      explored: 0,
    };
  }

  const backtrackToStart = reverseMoves(state.moveLog ?? []);
  const pathToSolved = state.startToSolvedPath;

  const combined = compactPath([...backtrackToStart, ...pathToSolved]);

  return {
    path: combined,
    reason: "history_reverse",
    explored: combined.length,
  };
}

function reverseMoves(moves) {
  return [...moves]
    .reverse()
    .map((move) => ({
      pieceId: move.pieceId,
      direction: OPPOSITE[move.direction],
    }));
}

function compactPath(path) {
  const result = [];

  for (const move of path) {
    const last = result[result.length - 1];

    if (last && last.pieceId === move.pieceId && OPPOSITE[last.direction] === move.direction) {
      result.pop();
      continue;
    }

    result.push(move);
  }

  return result;
}
