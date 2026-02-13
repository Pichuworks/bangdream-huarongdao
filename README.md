# BanG Dream! 华容道

一个基于 BanG Dream! 角色素材的经典华容道（4x5）网页小游戏。  
项目是纯前端静态站点，无构建依赖，适合直接部署到 GitHub Pages / Vercel / Netlify。

## 功能概览
- 经典 4x5 异形棋盘（2x2 / 2x1 / 1x2 / 1x1 棋子）。
- 目标角色可切换（按 `img/1.JPG -> img/10.JPG` 顺序展示角色名）。
- 目标位模式：
  - `原位目标`
  - `与米歇尔换位（保留块大小）`（使用可解模板，且非米歇尔模板默认预留底部中间出口）。
- 棋盘拟合：
  - `自然拟合`（综合图片比例与棋子尺寸）
  - `严格比例`（更严格按图片比例）
- 自动求解（BFS 最短步，经典模式）。
- 角色名显示开关、步数统计、计时、重开与重置计时。
- 底部通知栏（从配置文件读取，支持定时刷新与轮播）。

## 在线规则
- 出口固定为底部中间 `2x1`，不随目标角色变化。
- 胜利判定：
  - 目标棋子宽度为 `2`：需要完整占据底部中间两格。
  - 目标棋子宽度为 `1`：到达底部中间任一格即可。

## 本地运行
任选一种方式启动静态服务（不要直接双击 `index.html`，避免 `fetch` 受限）：

```bash
# 方式 1
python3 -m http.server 5173

# 方式 2
npx serve . -l 5173
```

浏览器访问：`http://localhost:5173`

## 部署
### GitHub Pages（推荐）
1. 推送仓库到 GitHub。
2. 打开仓库 `Settings -> Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. Branch 选择 `main`（或你的发布分支），目录选择 `/ (root)`。
5. 保存后等待发布完成。

说明：
- 本项目是静态文件站点，根目录已有 `index.html`，无需打包。
- 资源路径使用相对路径，可直接用于 GitHub Pages 项目页。

### Vercel / Netlify
- 直接导入仓库即可。
- Build Command 留空，Output Directory 设为仓库根目录（或默认静态检测）。

## 配置说明
### 1) 应用配置
文件：`data/app-config.json`

- `version`：页面标题上方显示的版本号（例如 `0.0.2`）。
- `license`：项目许可证标识（当前 `GPL-2.0-only`）。
- `footer`：页面最下方信息栏配置。
  - `developer`：开发者名称。
  - `model`：模型版本号。
  - `reasoning`：推理等级（如 `high`）。
  - `summaries`：摘要模式（如 `auto`）。
  - `lastUpdated`：最后更新时间（`YYYY-MM-DD`）。

示例：
```json
{
  "version": "0.0.2",
  "license": "GPL-2.0-only",
  "footer": {
    "developer": "PichuTheLolitaNeko",
    "model": "gpt-5.3-codex",
    "reasoning": "high",
    "summaries": "auto",
    "lastUpdated": "2026-02-13"
  }
}
```

### 2) 角色名映射
文件：`data/image-role-map.json`

- `showRoleNamesDefault`：是否默认显示棋子角色名。
- `roles`：图片路径到角色名映射。

示例：
```json
{
  "showRoleNamesDefault": false,
  "roles": {
    "img/1.JPG": { "roleName": "米歇尔" }
  }
}
```

### 3) 棋子与图片绑定
文件：`data/piece-layout.json`

- `pieceImage`：`棋子ID -> 图片路径`。
- 当前已按角色尺寸关系锁定：
  - `2x2`：米歇尔（`caocao` -> `img/1.JPG`）
  - `2x1`：友希那（`guanyu` -> `img/5.JPG`）
  - `1x2`：若麦/摩卡/有咲/伊芙（`zhangfei/zhaoyun/machao/huangzhong`）
  - `1x1`：其余角色（`soldier1-4`）

### 4) 换位模板
文件：`src/config/swap_layouts.js`

- 用于“与米歇尔换位（保留块大小）”模式。
- 每个模板定义一个目标角色的初始可解布局。
- 当前非米歇尔模板默认满足：底部中间 `2x1` 出口初始留空。

### 5) 通知栏配置
文件：`data/notice-config.json`

- `refreshIntervalSec`：重新拉取配置的间隔秒数（默认 `60`）。
- `rotateIntervalSec`：多条通知轮播间隔秒数（默认 `10`，用于重复事件轮换）。
- `themeColor`：每条通知主题色（十六进制，如 `#7799CC`），会覆盖默认主题样式。
- `notices`：通知列表，支持两种写法：
  - 字符串：`"text"`（常驻通知）
  - 对象：可配置时间窗口与年度日期规则
    - `text`：通知文案
    - `type`：通知类型（默认类型：`节日` / `生日` / `系统` / `自定义通知`）
    - `level`：`info|success|warn`
    - `themeColor`：通知主题色（`#RRGGBB` 或 `#RGB`）
    - `startAt` / `endAt`：绝对生效时间（建议 ISO 8601）
    - `annualDate`：每年固定日期（`MM-DD`）
    - `annualDates`：每年多个固定日期（`["MM-DD", ...]`）
    - `annualStart` / `annualEnd`：每年固定日期区间（`MM-DD`，含首尾）
    - `lunarAnnualDate`：每年农历固定日期（`MM-DD`）
    - `lunarAnnualDates`：每年多个农历固定日期（`["MM-DD", ...]`）
    - `lunarAnnualStart` / `lunarAnnualEnd`：每年农历日期区间（`MM-DD`，含首尾，支持跨年）

说明：
- 历史示例配置已保留在 `data/notice-config.demo.json`。
- 线上实际使用 `data/notice-config.json`。
- 生日通知推荐文案格式：`【🎂 日期】内容`（例如 `【🎂 02-22】乐奈生日快乐！`）。

示例：
```json
{
  "refreshIntervalSec": 60,
  "rotateIntervalSec": 10,
  "notices": [
    {
      "text": "系统维护公告",
      "type": "系统",
      "level": "info",
      "themeColor": "#7799CC",
      "startAt": "2026-02-13T00:00:00+08:00",
      "endAt": "2026-02-28T23:59:59+08:00"
    },
    {
      "text": "【🎂 02-22】乐奈生日快乐！猫之日快乐！今天要吃抹茶芭菲！",
      "type": "生日",
      "level": "success",
      "themeColor": "#77DD77",
      "annualDate": "02-22"
    },
    {
      "text": "每年 02-14 限定通知",
      "type": "节日",
      "level": "success",
      "annualDate": "02-14"
    },
    {
      "text": "春节通知（农历腊月20到正月初七）",
      "type": "节日",
      "level": "warn",
      "themeColor": "#E60012",
      "lunarAnnualStart": "12-20",
      "lunarAnnualEnd": "01-07"
    }
  ]
}
```

## 项目结构
```text
.
├─ index.html
├─ data/
│  ├─ app-config.json
│  ├─ image-role-map.json
│  ├─ piece-layout.json
│  ├─ notice-config.json
│  └─ notice-config.demo.json
├─ img/
├─ src/
│  ├─ main.js
│  ├─ config/
│  ├─ game/
│  └─ ui/
└─ docs/
```

## 开发说明
- 核心引擎：`src/game/engine.js`
- 自动求解：`src/game/solver.js`
- 页面逻辑与控制：`src/main.js`
- 样式：`src/ui/styles.css`

语法自检示例：
```bash
node --check src/main.js
node --check src/game/engine.js
node --check src/game/solver.js
```

## 常见问题
- 图片不显示：检查路径与大小写（当前使用大写扩展名 `.JPG`）。
- 角色名不对：编辑 `data/image-role-map.json` 的 `roles`。
- 换位模式想调布局：编辑 `src/config/swap_layouts.js`，并用自动求解验证可解性。

## License
- 本项目采用 `GPL-2.0-only` 协议发布。
- 许可证全文见仓库根目录 `LICENSE`。

## 致谢
- 素材版权归原作者/版权方所有，本仓库仅用于学习与交流。
