# Mars Genesis · 数据库设计文档（DATA/）V0.1

> 本目录是整个游戏的**唯一事实源（Single Source of Truth）**：
> 数值策划、游戏代码、后续 Muse 自动生成内容，全部以这里的 JSON 为准。
> GDD 描述"是什么、为什么"，DATA 定义"是多少、怎么算"。

## 1. 目标与规模

| 表 | 文件 | 目标规模 | 当前种子 |
|---|---|---|---|
| 资源 | resources.json | 200 | 30 |
| 建筑 | buildings.json | 500 | 26 |
| 科技 | technologies.json | 1000 | 18 |
| 居民 | citizens.json | 职业 40 / 特征 60 | 职业 8 / 特征 6 |
| 动物 | animals.json | 30 | 6 |
| 事件 | events.json | 100 | 8 |

**核心原则**：schema 一次设计到位、支撑全量规模；内容按 MVP 子集分批填充。
种子条目标记 `"mvp": true` 的，是 v0.2 首批接入游戏的部分。

## 2. 通用约定

- **ID 命名**：`domain.snake_case`，全小写，如 `res.power`、`bld.solar_array`、`tech.ice_mining`。ID 一旦发布永不复用，删除的 ID 进入保留名单。
- **双语**：`name: {"zh": "电力", "en": "Power"}`，`desc` 同理。游戏内显示用 zh，调试日志可用 en。
- **纪元门控**：`era` 字段，1–9，对应九大纪元。内容在所属纪元解锁前对玩家不可见。
- **MVP 标记**：`"mvp": true` 表示首批实现；缺省/ false 表示后续批次。
- **版本**：每个文件顶层 `{"version": "0.1.0", "items": [...]}`，破坏性字段变更升 minor（如 0.1→0.2），新增条目只升 patch。
- **图标**：`icon` 为字符串 key（如 `"solar"`），对应 `game/assets/icons/<key>.svg`（图标资源后续补充，前端缺失时用占位符）。

## 3. 各表 Schema

### 3.1 resources.json —— 资源

```jsonc
{
  "id": "res.steel",                 // 全局唯一
  "name": {"zh": "钢材", "en": "Steel"},
  "tier": 2,                         // 1 生存 / 2 工业 / 3 高级 / 4 生态文明
  "category": "industrial",          // survival | industrial | advanced | eco | special
  "unit": "吨",                      // 显示单位
  "stockable": true,                 // false = 瞬时型（电力/AI算力/幸福度），只算产销差
  "desc": {"zh": "...", "en": "..."},
  "icon": "steel",
  "mvp": true
}
```

- 瞬时型资源（`stockable: false`）：电力、AI 算力、幸福度、生态值——每 tick 计算 `产量 - 消耗`，不设库存。
- 可库存资源必须有配套的"容量"来源（仓库/电池站/储罐），容量定义在建筑表里（`storage: {"res.water": 500}`）。

### 3.2 buildings.json —— 建筑

```jsonc
{
  "id": "bld.solar_array",
  "name": {"zh": "太阳能阵列", "en": "Solar Array"},
  "era": 1,
  "category": "energy",              // energy | industrial | agri | habitat | eco | city | wonder | infra
  "cost": {"res.steel": 20, "res.power": 0},
  "upkeep": {"res.metal": 0.5},      // 每分钟维护消耗，可为空
  "power": 30,                       // >0 发电，<0 耗电，单位/分钟
  "inputs": {"res.regolith": 10},    // 每分钟消耗，可为空
  "outputs": {"res.steel": 0},       // 每分钟产出，可为空
  "storage": {"res.power": 200},     // 提供库存容量，可为空
  "robots": 2,                       // 需要机器人数量（纪元一~三）；人类时代改用 workers
  "workers": 0,
  "unlock": {"tech": "tech.solar_panel"},
  "size": [2, 2],                    // 地图占格
  "desc": {"zh": "...", "en": "..."},
  "icon": "solar",
  "mvp": true
}
```

- 所有速率统一为 **"单位 / 游戏分钟"**（1 游戏分钟 ≈ 1 现实秒，见第 6 节）。
- 产出效率受"电力充足率"全局系数影响（沿用现有 sim.js 机制：`eff = min(1, 发电/耗电)`）。

### 3.3 technologies.json —— 科技

```jsonc
{
  "id": "tech.ice_mining",
  "name": {"zh": "水冰开采", "en": "Ice Mining"},
  "discipline": "isru",              // survival | isru | industrial | automation | ai | eco | city | terraform
  "era": 2,
  "cost": {"res.tech_point": 50},
  "prereqs": ["tech.solar_panel"],   // 必须已存在于本表
  "effects": [
    {"op": "unlock_building", "target": "bld.water_plant"},
    {"op": "boost_output", "target": "res.water", "mode": "mult", "value": 1.25}
  ],
  "desc": {"zh": "...", "en": "..."},
  "icon": "ice",
  "mvp": true
}
```

- `prereqs` 必须形成有向无环图，校验脚本会检查环与悬空引用。

### 3.4 citizens.json —— 居民

```jsonc
{
  "occupations": [
    {"id": "occ.engineer", "name": {"zh": "工程师", "en": "Engineer"},
     "skills": ["repair", "construct"], "edu_min": 2,
     "desc": {"zh": "...", "en": "..."}, "mvp": true}
  ],
  "traits": [
    {"id": "trait.diligent", "name": {"zh": "勤奋", "en": "Diligent"},
     "effects": [{"op": "boost_work", "mode": "mult", "value": 1.15}],
     "desc": {"zh": "...", "en": "..."}, "mvp": false}
  ]
}
```

- 纪元四（殖民时代）之前本表不启用；MVP 阶段人口保持抽象（数量+幸福度），个体模拟延后——见 GDD 卷五规划。

### 3.5 animals.json —— 动物

```jsonc
{
  "id": "ani.chicken",
  "name": {"zh": "鸡", "en": "Chicken"},
  "era": 5,
  "feed": {"res.feed": 2},           // 每分钟饲料消耗
  "outputs": {"res.food": 1, "res.meat": 0.5},
  "unlock": {"tech": "tech.closed_eco"},
  "housing": "bld.livestock_center", // 饲养所需建筑
  "desc": {"zh": "...", "en": "..."},
  "mvp": false
}
```

### 3.6 events.json —— 事件

```jsonc
{
  "id": "evt.dust_storm",
  "name": {"zh": "沙尘暴", "en": "Dust Storm"},
  "kind": "negative",                // positive | negative | neutral
  "era_min": 1,
  "trigger": {"cooldown_min": 30, "chance_per_min": 0.005},
  "duration_min": 5,
  "effects": [
    {"op": "debuff_output", "target": "bld.solar_array", "mode": "mult", "value": 0.3}
  ],
  "mitigation": {"building": "bld.battery_station", "note_zh": "充足储能可度过尘暴"},
  "desc": {"zh": "...", "en": "..."},
  "mvp": true
}
```

## 4. 效果 DSL（effects 通用语法）

所有"产生效果"的地方（科技、特征、事件、建筑升级）统一使用：

| op | 含义 | target 示例 | value 示例 |
|---|---|---|---|
| `unlock_building` | 解锁建筑 | `bld.water_plant` | — |
| `unlock_resource` | 解锁资源（进入统计） | `res.methane` | — |
| `boost_output` | 某产出/资源产量加成 | `res.water` / `bld.iron_mine` | `{"mode":"mult","value":1.25}` |
| `cut_upkeep` | 维护消耗降低 | `bld.smelter` | `{"mode":"mult","value":0.8}` |
| `boost_work` | 工作效率 | 居民/机器人 | `{"mode":"mult","value":1.15}` |
| `add_storage` | 库存容量 | `res.water` | `{"mode":"add","value":500}` |
| `add_robots` | 机器人上限 | — | `{"mode":"add","value":10}` |
| `debuff_output` | 产出惩罚（事件用） | `bld.solar_array` | `{"mode":"mult","value":0.3}` |
| `boost_happiness` | 幸福度 | — | `{"mode":"add","value":5}` |
| `add_civ` | 文明点 | — | `{"mode":"add","value":50}` |

`mode`: `add`（加法）或 `mult`（乘法）。sim.js 按"先加后乘、同类叠加"顺序结算。

## 5. 字段校验规则

1. `id` 全局唯一（跨六表检查），正则 `^[a-z]+\.[a-z0-9_]+$`。
2. `prereqs` / `unlock.tech` / `housing` / `mitigation.building` 引用的 ID 必须存在。
3. `cost` / `inputs` / `outputs` 的 key 必须是 resources.json 中存在的资源 ID。
4. `era` ∈ 1..9；`tier` ∈ 1..4。
5. 同一文件内不许出现两个条目 `name.zh` 完全相同。

## 6. 数值基准（平衡锚点 v0.2）

所有"单位/分钟"数值围绕以下锚点设计，偏离超过 10 倍需在 PR 说明理由：

- **时间**：1 游戏分钟 ≈ 1 现实秒（沿用现有游戏）。
- **单人/分钟消耗**：食物 0.5、水 1.0、氧气 2.0。
- **电力基准**：太阳能阵列 30/分钟；居住舱耗电 8/分钟；激光烧结厂耗电 25/分钟。
- **机器人基准**：1 台机器人 ≈ 2 名人类工人的建造/采集速度，但 24 小时无休、无消耗。
- **AI 算力**：MARS CORE AI 可调度机器人上限 = 算力 × 1（开局 100 算力 = 100 台上限）。
- **科技点**：科研实验室 2/分钟（Lv.1）；单项纪元一科技 30–80 点。
- **文明点**：只通过"里程碑"发放（纪元跃迁/奇迹建成/生态闭环达成），不设生产线——它是胜利进度货币，不是资源。

## 7. 内容生产规范（Muse / 协作者必读）

1. 一次只生产一个表的一个批次（建议 20–50 条），不要跨表混写。
2. 每条必须填全 Schema 必填字段；`desc.zh` 不少于 20 字，要写出"火星味"（环境/工程细节），不许写"一种很好用的建筑"这类空话。
3. 数值必须落在第 6 节锚点的合理区间；新资源必须说明"谁生产、谁消耗"（至少一进一出，文明点除外）。
4. 科技必须挂在某个 `discipline` 下，且 `era` 与所属纪元玩法一致；`prereqs` 不许跨纪元倒挂（低纪元科技不许依赖高纪元）。
5. 建筑 `size` 不超过 [4,4]；奇迹建筑（`category: wonder`）全游戏限 3 座以内。
6. 提交前运行校验：`python3 DATA/scripts/validate.py`（待建，v0.2 接入脚本时一并交付），0 错误方可合入。
7. 批量生成后，抽查 10% 条目在游戏内实际跑 10 分钟，无"死资源"（只产不消/只消不产）无"死科技"（解锁的东西不存在）。

## 8. 游戏接入路线（下一步）

1. `DATA/scripts/build_data.py`：把六表 JSON 生成 `game/js/data.gen.js`（ES module），供 sim.js / config.js 读取。**现有 config.js 保持不动**，新旧数据双轨运行，v0.2 先从事件表（events.json）试点接入。
2. `DATA/scripts/validate.py`：实现第 5 节全部校验规则 + 第 7 节抽查清单。
3. 存档兼容：data.gen.js 带 `DATA_VERSION`，读档时版本不一致走迁移函数（后续补充）。

## 9. 当前种子统计

- resources.json：30 条（t1: 10 / t2: 9 / t3: 7 / t4: 4），mvp 23 条
- buildings.json：27 条（纪元一 8 / 二 6 / 三 5 / 四~五 6 / 八 1 / 九 1），mvp 15 条
- technologies.json：18 条（生存 4 / ISRU 6 / 工业自动化 3 / 生态 2 / AI 1 / 改造 2），mvp 9 条
- citizens.json：职业 8 / 特征 6
- animals.json：6 条
- events.json：8 条，mvp 5 条
