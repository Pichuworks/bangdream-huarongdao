# 图片与角色映射（可编辑）

来源配置：`data/image-role-map.json`

| 图片 | 角色名 | 当前尺寸分组 |
|---|---|---|
| `img/1.JPG` | 米歇尔 | `2x2` |
| `img/2.JPG` | 山吹沙绫 | `1x1` |
| `img/3.JPG` | 一个纸箱 | `1x1` |
| `img/4.JPG` | 花园多惠 | `1x1` |
| `img/5.JPG` | 凑友希那 | `2x1` |
| `img/6.JPG` | 祐天寺若麦 | `1x2` |
| `img/7.JPG` | 青叶摩卡 | `1x2` |
| `img/8.JPG` | 市谷有咲 | `1x2` |
| `img/9.JPG` | 二叶筑紫 | `1x1` |
| `img/10.JPG` | 若宫伊芙 | `1x2` |

## 修改方式
- 角色名：改 `data/image-role-map.json`。
- 棋子位与图片对应：改 `data/piece-layout.json` 的 `pieceImage`。
- 默认使用原始图片比例参与自然拟合；如需重新做比例裁切，可基于 `img/_backup_before_ratio_fix_20260213/` 重新导出。
