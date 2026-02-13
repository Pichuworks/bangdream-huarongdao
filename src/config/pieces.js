export const BOARD_COLS = 4;
export const BOARD_ROWS = 5;

// 经典“横刀立马”布局：2个空位。
export const PIECES = [
  { id: "caocao", name: "曹操", width: 2, height: 2, x: 1, y: 0 },
  { id: "zhangfei", name: "张飞", width: 1, height: 2, x: 0, y: 0 },
  { id: "zhaoyun", name: "赵云", width: 1, height: 2, x: 3, y: 0 },
  { id: "machao", name: "马超", width: 1, height: 2, x: 0, y: 2 },
  { id: "huangzhong", name: "黄忠", width: 1, height: 2, x: 3, y: 2 },
  { id: "guanyu", name: "关羽", width: 2, height: 1, x: 1, y: 2 },
  { id: "soldier1", name: "兵一", width: 1, height: 1, x: 1, y: 3 },
  { id: "soldier2", name: "兵二", width: 1, height: 1, x: 2, y: 3 },
  { id: "soldier3", name: "兵三", width: 1, height: 1, x: 0, y: 4 },
  { id: "soldier4", name: "兵四", width: 1, height: 1, x: 3, y: 4 },
];

export function cloneInitialPieces() {
  return PIECES.map((piece) => ({ ...piece }));
}
