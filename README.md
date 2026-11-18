# 像素挂机ARPG · MVP Demo（H5 先行版）

设计文档：`桌面/demo-design.md`（MVP 定稿 v4：回合制对打）。本工程为该文档的可玩实现，
纯原生 Canvas + 原生 JS，零依赖、无构建步骤；逻辑与渲染分离，便于后续移植微信小游戏。

## 运行

- 方式一：直接双击 `index.html`（Chrome/Edge 本地文件即可运行，存档可用）
- 方式二：`node serve.js` 后打开 <http://127.0.0.1:8123>

## 操作

- 选职业 → 进地图；`WASD/方向键` 移动，`J` 普攻，点「挂机」自动打怪
- 消消战斗：拖动交换相邻方块（无消除不耗回合）；大招按钮按职业不同手势
  - 战士：在棋盘上划一条线
  - 牧师：点一个方块定中心 → 长按，外圈收缩到与中心重合时松手（拖动手指=Miss）
  - 法师：点大招 → 游标进入金色区再点一下

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `js/config.js` | **全部数值默认表**（设计文档未定数值都在这里调） |
| `js/board.js` | 消消棋盘纯逻辑（生成/匹配/下落/重排/锁块），无渲染无输入 |
| `js/battle.js` | 回合制对打场景：结算顺序、三职业大招、判定 |
| `js/world.js` | 俯视角挂机：寻怪/技能CD/讨伐任务/掉落成长/死亡回城 |
| `js/save.js` | localStorage 存档（移植小游戏时换成 `wx.setStorageSync`） |
| `js/pixel.js` | 字符画像素精灵（无外部图片素材） |
| `js/main.js` | 画布缩放、输入路由、场景切换 |

## 移植微信小游戏要点

- 渲染同为 Canvas 2D，`requestAnimationFrame` 原生可用
- 输入：pointer 事件 → `wx.onTouchStart/Move/End`，坐标换算一致
- 存储：`localStorage` → `wx.setStorageSync`（仅 `save.js` 一处）
- 文本/UI 全部 canvas 绘制，无 DOM 依赖
