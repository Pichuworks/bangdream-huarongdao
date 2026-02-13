// 在这里自由调整角色使用的图片路径。
// 规则：角色ID -> 图片路径（相对 index.html）。
export const SKIN_PRESETS = {
  default: {
    name: "默认角色",
    mapping: {
      caocao: "img/1.JPG",
      guanyu: "img/2.JPG",
      zhangfei: "img/3.JPG",
      zhaoyun: "img/4.JPG",
      machao: "img/5.JPG",
      huangzhong: "img/6.JPG",
      soldier1: "img/7.JPG",
      soldier2: "img/8.JPG",
      soldier3: "img/9.JPG",
      soldier4: "img/10.JPG",
    },
  },
  all_img1: {
    name: "全员 img1",
    mapping: {
      caocao: "img/1.JPG",
      guanyu: "img/1.JPG",
      zhangfei: "img/1.JPG",
      zhaoyun: "img/1.JPG",
      machao: "img/1.JPG",
      huangzhong: "img/1.JPG",
      soldier1: "img/1.JPG",
      soldier2: "img/1.JPG",
      soldier3: "img/1.JPG",
      soldier4: "img/1.JPG",
    },
  },
};

export const ACTIVE_SKIN_PRESET = "default";

export function getSkinMapping(presetId) {
  const fallback = SKIN_PRESETS[ACTIVE_SKIN_PRESET] ?? SKIN_PRESETS.default;
  return (SKIN_PRESETS[presetId] ?? fallback).mapping;
}

export function listSkinPresets() {
  return Object.entries(SKIN_PRESETS).map(([id, preset]) => ({
    id,
    name: preset.name,
  }));
}
