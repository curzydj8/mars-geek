# 《火星殖民地》Mars Colony —— 网页基地建造游戏

## 一、当前项目技术架构（分析结论）

| 维度 | 现状 |
|---|---|
| 前端 | 原生 HTML / CSS / JS，无构建、无框架（React/Vue/TS 均未使用） |
| 后端（可选） | Node 20+ / Express 4（唯一依赖）/ SQLite（node:sqlite 内建），JWT + refresh token + RBAC，含登录/注册/后台管理 |
| 部署 | GitHub Pages 托管纯静态站（项目站 = **子路径** `/mars-geek/`）；后端需另行部署到 Node 主机 |
| 约束 | CSP `script-src 'self'`（禁止内联脚本）；静态资源必须用**相对路径**；API Key 不得进前端 |

**选型决策**：游戏继续沿用“零依赖原生 JS”架构，理由——
1. 不引入构建步骤，`game/` 目录直接可被 Pages 托管，玩家浏览器打开即玩；
2. 地图建筑数量大 → 选用 **Canvas 2D** 渲染（地形预渲染到离屏 canvas，建筑逐帧绘制），避免大量 DOM 节点；
3. 游戏逻辑（sim）与渲染（render）、UI（ui）严格分离，sim 为纯函数模块，可在 Node 直接单元测试；
4. 存档 MVP 用 localStorage；云存档为 Phase 3，复用现有 `/api/auth` + 新增 `game_saves` 表（用户隔离天然由现有 RBAC 保证）。

## 二、新增文件

```
game/
├── index.html          # 启动屏 + 游戏主界面骨架（零内联脚本，CSP 合规）
├── css/
│   └── game.css        # 科幻火星 UI：资源栏/工具栏/侧栏/日志/弹窗
├── js/
│   ├── config.js       # 数值配置：建筑/科技/任务/资源/平衡参数（纯数据）
│   ├── state.js        # 存档数据结构定义 + 初始状态 + 序列化/反序列化
│   ├── sim.js          # 游戏模拟：tick 推进资源/电力/人口/建造/科研/任务（纯逻辑，无 DOM）
│   ├── render.js       # Canvas 渲染：地形预渲染、建筑绘制、建造幽灵、选中高亮
│   ├── input.js        # 输入：拖拽平移、滚轮缩放、点击选中、建造放置、触屏
│   ├── ui.js           # 界面：资源栏/建造菜单/建筑面板/科研/任务/日志/时间控制
│   ├── save.js         # 存档：localStorage 多槽位 + 自动保存
│   └── main.js         # 启动：屏显切换、主循环（rAF 渲染 + 定时 sim）、模块装配
└── README.md           # 本文件
```

## 三、游戏系统架构

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  input.js   │────▶│   state.js  │◀────│    sim.js    │
│ 指针/触屏/键盘 │     │ 唯一真相源   │     │ tick(dt) 纯逻辑 │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │                 ▲
              ┌────────────┼─────────┐       │ setInterval
              ▼            ▼         ▼       │
        ┌──────────┐ ┌──────────┐ ┌────────┐ │
        │ render.js│ │  ui.js   │ │ save.js│ │
        │ Canvas   │ │ DOM 面板  │ │ localS-│ │
        └──────────┘ └──────────┘ │ torage │ │
                                   └────────┘ │
        ┌─────────────────────────────────────┘
        │ main.js：装配 + rAF 主循环
        └──────────────────────────────────────
```

- **时间模型**：游戏内 1 分钟 = 现实 1 秒（1x）；支持暂停 / 1x / 2x。建造时间、生产速率统一按“游戏分钟”计。
- **电力模型**：全基地电力生产 Σ vs 消费 Σ；`效率 = min(1, 生产/消费)`，作用于除电力外所有产出；不足时警告横幅 + 建筑降效。
- **资源链**：矿石 →（采矿站）→ 金属 →（精炼厂）→ 建材 →（建筑）；水/氧气/食物/科研并行产出。
- **人口模型**：住房容量（着陆舱/居住舱）+ 食物/水/氧气消耗；短缺 → 幸福度下降 → 殖民者离开。
- **渲染性能**：地形按种子预渲染一次到离屏 canvas；每帧只重绘建筑层与特效；相机变换走 canvas transform。

## 四、核心数据结构

```js
state = {
  version: 1, seed: 12345,
  sol: 1, minute: 480,            // Sol 1, 08:00
  speed: 1, paused: false,
  camera: { x, y, zoom },
  amounts: { power, water, ore, metal, material, food, oxygen }, // 浮点
  research: 0,                    // 科技点
  population: { count, happiness },// 容量由建筑实时计算
  buildings: [                    // 建筑实例
    { id, type, tx, ty, level, status: 'active'|'constructing',
      progress, efficiency }
  ],
  techs: { <techId>: true },      // 已解锁科技
  missions: { <id>: 'active'|'done'|'claimed' },
  log: [ { sol, minute, text } ], // 事件日志（截断保留 80 条）
  stats: { builtTotal, ... }
}
```

建筑定义（config.js）示例：
```js
solar_panel: {
  name:'太阳能板', icon:'🔆', w:1, h:1, cat:'energy',
  cost:{ metal:30, material:20 }, buildTime:30,   // 游戏分钟
  produces:{ power:25 }, consumes:{},
  upgradeBase: 1.6, maxLevel: 3, desc:'...'
}
```

## 五、开发阶段

- **Phase 1（MVP，本次交付）**：火星地图（Canvas 程序化地形）/ 11 种建筑 / 资源+电力+氧气系统 / 建造+升级+拆除 / 简单人口 / 5 项科研（列表式） / 3 个任务 / 游戏时钟 / localStorage 多槽位存档+自动保存 / Build·Research·Missions UI / 事件日志。
- **Phase 2**：科技树可视化、Rover 探索 + 战争迷雾、随机事件（沙尘暴/陨石/太阳风）、更多建筑（核反应堆/温室/穹顶等）、昼夜/音效。
- **Phase 3**：云存档（后端新增 `game_saves` 表 + `/api/game/saves`，复用现有登录/RBAC 做用户隔离）、排行榜、后台游戏数据看板（在线/存档数/活跃玩家）。

## 六、本地运行

纯静态：用任意静态服务器打开 `game/` 即可（如 `npx serve game`），或随本仓库 Node 服务直接访问 `/game/`。
