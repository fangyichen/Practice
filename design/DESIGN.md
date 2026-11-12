# 锦囊（暂定名）设计文档 v0.3

> 给实现者（Claude Code）的说明：这是一份原型的完整规格。请严格按第 14 节的里程碑顺序实现，**M0 不接任何模型 API**。每个里程碑结束时跑通验收标准再继续。凡标注 **【待作者确认】** 的地方，先按文中默认值实现，不要停下来等。
>
> v0.2 的变化：新增天生禀赋与后天技艺；新增「带一样过去」的盲选加成；回信分类改为可替换的 `ReplyClassifier`（先用固定样本，后接 Jev）；结局改为模板拼接，不调模型。
>
> v0.3 的变化：世界改为以《三国演义》为准，时间线覆盖演义全程；可玩内容按「卷」（slice）切分，第一版只做荆州一卷；**第一版的结算是确定性的**，随机只发生在投生那一下，难题顺序固定、选项稀疏、结果查表。

## 1. 一句话

玩家的「替身」（一个带有玩家人格的小人物）活在《三国演义》的世界里。替身自主生活，遇到难处会给玩家写信；玩家读过演义，知道后事，但每封回信最多十个字，一生总共一百个字。替身听不听、怎么听，由他的人格决定；做不做得成，由他这一世的禀赋决定。结局是他在这个世界里留下的一点痕迹。

## 2. 目标与非目标

**要验证的唯一问题**：同一封来信、同一句回复，不同人格的替身读起来是不是不同的人，玩家会不会觉得「这确实是我会干的事」。

目标：
- 一局 15 到 25 分钟，10 到 12 封信，有完整结局和可分享的结局卡片。
- 世界和人生由确定性引擎推进。模型只做两件事：把回信分类（决策模型）、写信（生成模型）。
- 每一次替身的反应都能给出可读的原因。
- 时代与卷都是数据包，引擎不包含任何三国专属逻辑。
- **第一版稀疏且固定**：同样的人格、禀赋、身份、回信，必然得到同样的一生。

非目标（原型不做）：
- 账号、服务器端存档、多人、排行榜。
- 像素动画、音效。
- 付费、广告。
- 玩家改变宏观剧情（演义的大事固定发生）。
- 结果的随机性、随机事件池、多卷内容（数据结构留口子，见 8.0，但第一版不实现）。
- 信件的真实时间延迟（即时回信，接口预留延迟字段）。

## 3. 三层模型

整个设计建立在三层分工上，实现时不要混用：

| 层 | 回答的问题 | 来源 | 是否随机 |
|---|---|---|---|
| **人格** Traits | 肯不肯（听不听、选哪条、多快动） | 玩家：MBTI + 情境题 + 通信中持续微调 | 否，跨局保留 |
| **禀赋** Endowments | 能不能（做了成不成） | 这一世抽到的，外加玩家盲选的一档 | 是，每局重抽 |
| **身份** Station | 许不许（这条路开不开） | 这一世抽到的 | 是，每局重抽 |

另有一项后天数值 **技艺**（craft），随身份与年头增长。

## 4. 核心循环

1. **建档**（仅首次）：选 MBTI（可跳过），答 5 道情境选择题，生成人格。
2. **带一样过去**（每局）：盲选一项禀赋提升一档（见 7.2）。
3. **投生**：引擎在当前卷内抽出生地、身份、禀赋。第一卷的替身生于 180 年，游戏从建安元年（196 年，16 岁）开始。开场显示一行：「此间以《三国演义》为准。」
4. **来信**：引擎推进到本卷的下一个难题节点，生成模型以替身口吻写信。部分来信附带一道「换了是你」的选择题（不耗字数，微调人格）。
5. **回信**：玩家写至多 10 个字，或沉默。
6. **结算**：分类器把回复变成选项上的概率分布 → 引擎根据人格、信任、禀赋、身份查出结果 → 状态更新 → 生成原因说明。
7. 回到第 4 步，直到替身去世或本卷结束。
8. **结局**：引擎判定留痕等级，用模板拼出记载，渲染结局卡片。

## 5. 架构

```
浏览器 (Next.js 前端)
  ├─ localStorage：人格画像 + 当前存档（唯一的持久化）
  └─ POST /api/turn ──► 服务器（无状态）
                          ├─ zod 校验请求
                          ├─ ReplyClassifier.classify   （可替换）
                          ├─ Engine: resolve + advance  （纯函数，无 IO）
                          ├─ LetterWriter.write         （生成模型）
                          └─ 返回新的 GameState
```

原则：
- **引擎是纯函数**：`(state, input, eraPack, slice) -> state`，相同输入必得相同输出。
- **模型不改状态**：分类器只产出概率分布，写信模型只产出文字。数值、生死、事件全部由引擎决定。
- **分类结果写进存档**：外部模型的输出不可复现，所以每轮的分类结果存入 `TurnRecord`，回放时直接读，不再调用。
- **服务器无状态**：每次请求带完整 `GameState`，服务器不落盘、不记录请求体。
- **时代与卷即数据**：`eras/sanguo-yanyi/` 下全是 JSON。时代包放全程共用的东西，卷放可玩内容。

### 技术栈（默认，【待作者确认】）

- Next.js（App Router）+ TypeScript，严格模式
- zod（请求、模型输出、数据包的 schema）
- Vitest
- 写信模型走 `LetterWriter` 接口，默认实现用 Anthropic SDK，模型名从环境变量 `LLM_MODEL_LETTER` 读，不要硬编码。
- 分类走 `ReplyClassifier` 接口，见第 9 节。

## 6. 数据模型

```ts
// 人格：全部 0-100
type Traits = {
  boldness: number;       // 冒险 ↔ 谨慎（界面上叫「胆」）
  loyalty: number;        // 重义守诺
  impulsiveness: number;  // 冲动 ↔ 迟缓
  rootedness: number;     // 恋土顾家
  skepticism: number;     // 多疑（决定初始信任）
  sociability: number;    // 愿不愿意主动结交人
};

// 天生禀赋：全部 0-100，界面只显示档位形容词
type Endowments = {
  physique: number;  // 体魄
  wit: number;       // 机敏
  looks: number;     // 相貌
};
type EndowmentKey = keyof Endowments;

type Persona = {
  mbti?: string;
  traits: Traits;
  history: TraitDelta[];
  carryChoices: EndowmentKey[];   // 历次「带一样过去」的选择，属于画像
};

type TwinState = {
  name: string;
  gender: "m" | "f";
  birthYear: number;
  location: LocationId;
  station: StationId;
  endowments: Endowments;
  boosted: EndowmentKey;  // 本局被玩家提升的那项
  craft: number;          // 技艺 0-100，后天
  health: number;         // 0-100
  wealth: number;         // 0-100
  standing: number;       // 0-100 名声
  household: { spouse: boolean; children: number; parentsAlive: number };
  allegiance: FactionId | null;
  trust: number;          // 0-100 对来信者的信任
  flags: string[];
  alive: boolean;
};

type Classification = {
  dist: Record<OptionId | "other", number>;  // 概率，和为 1
  source: "fixture" | "jev" | "llm" | "rule";
  modelVersion?: string;
  tone?: number;  // 可选：0 恳求 … 1 命令，M4 才用
};

// 执行结论：肯不肯 × 能不能 之后的最终状态
type Exec =
  | "DONE" | "PARTIAL" | "ATTEMPT_FAILED" | "DECLINED_UNABLE"
  | "UNWILLING" | "NOT_ALLOWED" | "TOO_LATE" | "NO_GUIDANCE";

type GameState = {
  version: 3;
  seed: string;           // 只用于投生
  eraId: string;
  sliceId: string;
  persona: Persona;
  twin: TwinState;
  year: number;
  season: 1 | 2 | 3 | 4;
  charBudgetLeft: number; // 初始 100
  turn: number;
  nodeIndex: number;      // 在本卷难题序列中的位置
  pendingDilemma: DilemmaInstance | null;
  log: TurnRecord[];      // 每轮：来信、回复、Classification、Exec、结果、原因
  ending: Ending | null;
  sig?: string;           // 可选：服务器对 state 的 HMAC
};
```

### 数据包

```
eras/sanguo-yanyi/
  era.json          // 元信息：正典声明、称呼、文风提示、纪年表
  timeline.json     // 演义全程大事年表（全卷共用）
  locations.json    // 地点及其逐年归属
  stations.json     // 身份：权重、初始数值、禀赋权重、技艺成长率
  traces.json       // 留痕规则与结局模板
  slices/
    jingzhou-180/   // 第一卷
      slice.json    // 出生年、起止年、可出生地点、难题顺序
      dilemmas.json // 本卷难题
      outcomes.json // 本卷结果字典
```

`timeline.json` 条目：

```json
{
  "id": "chibi",
  "year": 208, "season": 4,
  "title": "赤壁鏖兵",
  "facts": ["曹操大军顺江东下", "诸葛亮借东风，周瑜纵火破曹", "曹操败走华容道"],
  "effects": [
    { "where": ["jiangxia", "jiangling"], "pressure": { "war": 80, "conscription": 60, "epidemic": 40 } },
    { "where": ["xiangyang"], "pressure": { "conscription": 50 } }
  ],
  "publicKnowledgeDelay": 1
}
```

`slice.json`：

```json
{
  "id": "jingzhou-180",
  "title": "第一卷 · 荆州",
  "birthYear": 180,
  "startYear": 196,
  "endYear": 223,
  "birthLocations": ["xiangyang", "xinye", "jiangling", "changsha"],
  "birth": { "mode": "rolled" },
  "nodes": ["first_trade", "refugees_arrive", "cao_marches_south", "..."]
}
```

`nodes` 是**有序列表**。引擎按顺序走，条件不满足的节点跳过。

**引擎的复用边界**：引擎要能原样用于以后的卷和别的时代。为此只需守住两条，不要做更多的抽象：

- `/engine` 里不出现任何时代专属的内容（地名、人名、年份、年号）。这些只存在于 `/eras` 的数据里。
- 投生方式由卷决定。`birth.mode` 现在只实现 `"rolled"`（随机身份与禀赋）。保留 `"fixed"` 这个取值给以后的「人物卷」（身份与禀赋由卷指定，人格取卷内预设底色与玩家人格的混合），**现在不要实现**，遇到时报「未支持」即可。

`dilemmas.json` 条目（每个难题就是一张小表：选项、标签、门槛、结果规则）：

```json
{
  "id": "cao_marches_south",
  "year": 208, "season": 3,
  "anchor": "cao_south_208",
  "condition": { "alive": true, "where": ["xiangyang", "xinye"] },
  "timed": true,
  "situationFacts": [
    "刘表新丧，其子刘琮举州降曹",
    "刘皇叔弃新野、走樊城，百姓扶老携幼相随",
    "曹军铁骑日夜兼行"
  ],
  "options": [
    { "id": "follow_liu", "label": "随刘皇叔南走",
      "tags": ["leave_home", "risk_life"],
      "gate": { "stat": "physique", "minTier": 2 },
      "partial": true,
      "results": [
        { "when": { "exec": "DONE", "tierAtLeast": { "physique": 3 } }, "outcome": "reached_jiangxia" },
        { "when": { "exec": "DONE" }, "outcome": "survived_changban_lost_all" },
        { "when": { "exec": "PARTIAL" }, "outcome": "sent_family_ahead" },
        { "when": { "exec": "ATTEMPT_FAILED" }, "outcome": "collapsed_on_road" }
      ] },
    { "id": "stay", "label": "留在乡里",
      "tags": ["submit_authority"],
      "results": [
        { "when": { "exec": "DONE", "tierAtLeast": { "physique": 3 } }, "outcome": "conscripted_to_fleet" },
        { "when": { "exec": "DONE" }, "outcome": "stayed_under_cao" }
      ] },
    { "id": "hide_hills", "label": "入山暂避",
      "tags": ["abandon_property"],
      "results": [
        { "when": { "exec": "DONE", "tierAtLeast": { "wit": 3 } }, "outcome": "hid_and_kept_grain" },
        { "when": { "exec": "DONE" }, "outcome": "hid_house_looted" }
      ] }
  ],
  "default": "by_traits",
  "selfKnownLimits": ["physique"],
  "fallbackLetter": "……（预写的降级信）",
  "personaQuestion": {
    "prompt": "换了是你，舍得下这几亩地吗？",
    "choices": [
      { "text": "舍不得，地在人在", "delta": { "rootedness": 6 } },
      { "text": "人活着，地可以再置", "delta": { "rootedness": -6, "boldness": 3 } }
    ]
  }
}
```

`results` 是规则列表，**从上到下第一条匹配的生效**。`when` 可用的条件：`exec`、`tierAtLeast`、`tierBelow`、`station`、`hasFlag`、`craftAtLeast`、`rash`（`impulsiveness ≥ 70`）。

`outcomes.json` 条目：

```json
{
  "survived_changban_lost_all": {
    "effects": { "health": -15, "wealth": -40, "location": "jiangxia",
                 "addFlags": ["survived_changban"] },
    "facts": ["当阳道上曹军追及，百姓死伤枕藉", "他弃了行李，随残众到了江夏"],
    "verdict": "mixed"
  },
  "collapsed_on_road": {
    "effects": { "alive": false, "addFlags": ["died_on_road_208"] },
    "facts": ["行至当阳，他力竭倒在道旁"],
    "verdict": "wrong"
  }
}
```

- `facts` 会交给下一封信（或结局），是写信模型能用的唯一新事实。
- `verdict`（`right` / `wrong` / `mixed` / `none`）表示玩家这次建议事后看对不对，用于信任更新。

写难题的纪律（`scripts/validate-era.ts` 必须检查）：
- 第一版每个难题 **2 到 3 个选项**。
- 每个选项最多一个硬门槛 `gate`。
- 每个难题至少一个选项既无 `gate` 也无 `requires`（替身永远有路可走）。全卷至少一半的难题含有带 `gate` 的选项。
- 每个选项的 `results` 必须覆盖它可能出现的全部 `exec`：`DONE` 必有；有 `gate` 则必有 `ATTEMPT_FAILED`；`partial: true` 则必有 `PARTIAL`。每个 `exec` 的最后一条规则不带其他条件，作为兜底。
- 引用的每个 `outcome` 都在 `outcomes.json` 里。
- 全卷里三项禀赋作为 `gate` 出现的次数大致均衡（最多与最少之差不超过 2）。
- 每个难题有 `fallbackLetter`。
- 无论走哪条分支，一局经历的难题数在 9 到 12 之间（脚本枚举分支验证）。

## 7. 人格与禀赋

### 7.1 人格

**MBTI 作为起点**：所有特质从 50 起，按字母加减。这是游戏化的启发式，界面上不要宣称准确。

| 字母 | 调整 |
|---|---|
| E | sociability +15, boldness +5 |
| I | sociability -15 |
| N | boldness +12, rootedness -8 |
| S | rootedness +12 |
| T | skepticism +15 |
| F | loyalty +12, skepticism -5 |
| J | impulsiveness -15 |
| P | impulsiveness +15 |

**建档情境题**：5 道选择题，每个选项给 1 到 2 个特质 ±5 到 ±10。写现代情境。题库在 `content/onboarding.json`，至少 8 道，每次抽 5 道。

**持续完善**：来信附带的「换了是你」题按 `delta` 微调，单次不超过 ±6。画像存 localStorage，**跨局保留**。每次调整记入 `persona.history`。

人格只影响肯不肯，不影响成败。**勇气不是禀赋**，它就是 `boldness`，不要在禀赋里再算一遍。

### 7.2 禀赋

**档位**（五档，边界即门槛）：

| 数值 | 档 | 体魄 | 机敏 | 相貌 |
|---|---|---|---|---|
| 0–19 | 0 | 羸弱 | 鲁钝 | 貌寝 |
| 20–39 | 1 | 单薄 | 朴拙 | 平平 |
| 40–59 | 2 | 寻常 | 寻常 | 中人之姿 |
| 60–79 | 3 | 健壮 | 机警 | 端正 |
| 80–100 | 4 | 魁伟 | 颖悟 | 姿容甚伟 |

界面**只显示形容词**，任何地方都不显示数值。所有门槛与结果规则都用档位表达，保证形容词对玩家有预测力。

**抽取**：
- 三项总和固定为 150，每项范围 10 到 90，分配随机（可受身份的禀赋权重轻微影响）。
- 每个替身因此都有长处和短处。

**带一样过去（盲选加成）**：
- 每局投生前问玩家：**「只能带一样过去，你带什么？」** 三选一：体魄、机敏、相貌。此时玩家看不到任何抽取结果。
- 被选中的那项 +20（恰好一档），**加在总和之外**，其他两项不变。
- 抽取时保证被选中的那项在加成前不高于 79，所以这一档不会浪费。
- 每局可以重选。历次选择记入 `persona.carryChoices`，属于画像。
- 投生揭晓时必须把这一档说出来，用模板句，例如：「生来羸弱，因你所愿，略胜一分，仍是单薄。」

**变化**（都是确定性的）：
- 体魄：35 岁后每年小幅下降；结果里的伤病、饥荒造成下降。
- 机敏：每经历一个难题 +1，上限 +15。档位到 3 才可能获得「识字」flag。
- 相貌：数值不变，但引擎在判定相貌档位时，35 岁后每 5 年视为降一档，同时 `standing` 的权重上升。
- 相貌的作用按身份区分（在结果规则里用 `station` 条件表达）。

### 7.3 技艺（后天）

`craft` 0–100，初始由身份决定。每年增长 = 身份成长率 ×（0.6 + wit/125）。学艺类结果可一次性提升。它影响：营生、被征发时归为工匠还是兵卒、留痕器物的成色、能否收徒。

### 7.4 禀赋的三种作用方式

1. **门槛（gate）**：档位不够，选项做不成。硬约束，少用。
2. **分档结果**：同一个选项，档位不同，查到的结果不同（`results` 里的 `tierAtLeast`）。第一版用它代替概率修正。
3. **触发**：禀赋档位决定某些难题会不会出现，或走哪条分支（写在节点的 `condition` 里）。

各项管辖的类别：

| | 门槛与分档 | 触发 |
|---|---|---|
| 体魄 | 远行逃难、徭役行军、熬过疫病饥荒伤病、重体力营生 | 高：易被拣为兵卒。低：多病，但可能免征 |
| 机敏 | 识破骗局与勒索、学识字算账、求情讨价应付盘问、找门路 | 高：被吏员或商人挑作帮手。低：受骗 |
| 相貌 | 投靠求雇被举荐、婚配、取信于生人（借宿、过关卡） | 高：「被注意」类事件，好坏都有。低：被轻慢，但也漏过拣选 |
| 技艺 | 营生、征发归类、留痕成色 | 高：有人来拜师 |

相貌必须是双刃的：由高相貌触发的结果里，坏结果不少于三分之一。

## 8. 引擎

### 8.0 第一版的确定性约定

随机策略是一个配置项：`randomness: "birth_only" | "full"`。**第一版只实现 `birth_only`**：

- RNG 只在投生时使用：出生地、身份、禀赋分配、姓名。
- 投生之后，引擎不再掷任何骰子。难题顺序固定，结果查规则，没有随机死亡，没有随机事件。
- 因此：相同的人格、相同的投生结果、相同的分类结果序列，必得相同的一生。

为日后的 `full` 模式留口子（**现在不要实现**，只保证结构上加得进去）：
- 结算公式里的噪声项、时机判定、歧义解读都通过一个 `Randomness` 策略对象取值，`birth_only` 下它返回固定值。
- `results` 规则将来可以把 `outcome` 换成带权重的列表。
- `slice.json` 的 `nodes` 将来可以混入从事件池里抽的节点。

### 8.1 时间推进

- 引擎沿本卷 `nodes` 的顺序从一个难题走到下一个，`condition` 不满足的跳过。
- 两个节点之间，按年应用确定性的变化：年龄、体魄衰减、机敏与技艺增长、所在地因演义大事发生的归属变化。
- 替身只会死于结果（`effects.alive = false`）。
- 保护规则：前 3 个难题的任何结果都不得致死（校验脚本检查）。

### 8.2 回复结算

输入：`Classification` 与当前 `pendingDilemma`。按顺序执行，每一步都往 `TurnRecord.reasons` 追加结构化原因。

**第一步：他把这句话读成了什么**

- 回复为空：沉默，按「无人指点」处理。
- 取 `dist` 中概率 ≥ 0.2 的选项为候选读法；`dist.other` 最大时视为「无人指点」。
- 只有一个候选：就是它。
- 多个候选（有歧义）：机敏档位 ≥ 2 时取概率最高的那个；否则取候选里与人格冲突最小的那个，若它不是概率最高的，原因码 `MISREAD_BY_TRAITS`。
- 无人指点：由人格自行选择（取冲突最小的无门槛选项），`exec = NO_GUIDANCE`。

**第二步：许不许（身份）**

选项的 `requires` 不满足 → `exec = NOT_ALLOWED`，改走人格默认。

**第三步：肯不肯（人格与信任）**

```
conflict = Σ tagConflict(tag, traits)      // 每个标签 0-40
score    = trust - conflict + urgencyBonus  // 第一版无噪声
score ≥ 60        → 肯
30 ≤ score < 60   → 选项 partial 为 true 时折中（PARTIAL）；否则 score ≥ 45 算肯，其余算不肯
score < 30        → 不肯（UNWILLING，改走人格默认）
```

标签冲突表（放在引擎配置里）：

| 标签 | 冲突来源 |
|---|---|
| leave_home | rootedness |
| abandon_property | rootedness, 低 boldness |
| risk_life | 低 boldness |
| betray_lord / break_promise | loyalty |
| defy_authority | 低 boldness |
| submit_authority | 高 boldness |
| trust_stranger | skepticism, 低 sociability |

**第四步：能不能（禀赋）**

选项有 `gate` 且档位不够时，按人格分叉。肯不肯与能不能交叉出四种结果：

| | 能 | 不能 |
|---|---|---|
| **肯** | 照做（`DONE` 或 `PARTIAL`） | `boldness ≥ 60` 或 `impulsiveness ≥ 70`：硬上（`ATTEMPT_FAILED`）。否则知难而退，改走人格默认（`DECLINED_UNABLE`） |
| **不肯** | 做得到却不做（`UNWILLING`） | 留在原处（`UNWILLING`） |

**第五步：时机**

难题 `timed: true` 且 `impulsiveness < 25` → 他拖过了时候（`TOO_LATE`），改走人格默认里不需要赶时间的选项。

**第六步：查结果**

在最终执行的那个选项的 `results` 里，取第一条匹配的规则，应用对应 `outcome` 的 `effects`。改走人格默认时，对默认选项以 `exec = DONE` 查表，同时保留原来的原因码用于解释。

**第七步：信任更新**

按 `outcome.verdict`：`right` +15，`wrong` -12，`mixed` +3，`none` 0；回了信另 +2。全部乘以 `0.6 + wit * 0.008`（机敏的人验证得更快，涨跌更剧烈）。只有当替身确实照做了（`DONE` / `PARTIAL` / `ATTEMPT_FAILED`）才按 `verdict` 结算；没照做时，若事后证明玩家说得对，按 `right` 的一半计（他会后悔）。初始信任 = `50 - (skepticism - 50) * 0.4`（v0.3 原为 40；M0 实测开局几乎无人照做，改为 50）。本节及 7.2、8.3 里的阈值与系数都放在 `config/engine.json`，以文件为准。

**原因说明**：前端把原因码渲染成一句人话，用模板拼，**不调模型**。例如：

- `PARTIAL` + topConflict(leave_home, rootedness)：「他信了你四成。离乡这件事他终究舍不得，只把妻儿先送走了。」
- `ATTEMPT_FAILED` + gate(physique)：「他听了你的。可那条路，他的身子没能走完。」
- `UNWILLING`（能而不肯）：「他走得动，只是不肯走。」
- `MISREAD_BY_TRAITS`：「你写的是“走”。他读成了回乡。」
- `TOO_LATE`：「他想了又想。等他拿定主意，路已经断了。」

说明里可以出现「四成」这类对信任的粗略描述，但不出现禀赋数值。

### 8.3 字数预算

- 每封回信上限 10，一生上限 100，做成配置。
- 按字素计，空白与标点不计。
- 服务器端重新计数并校验。
- 预算用尽后只能沉默。

### 8.4 结局与留痕

替身去世或本卷结束时进入结局。卷末仍在世的，用确定性规则算出余生概要（寿数、子嗣），不再通信。

留痕等级由 `flags`、`standing`、`craft`、`station` 确定性判定：

| 等级 | 名称 | 大致占比 | 例子 |
|---|---|---|---|
| T0 | 民间痕迹 | 约 70% | 一口井、一棵树、一门传下去的手艺 |
| T1 | 物勒工名 / 族谱 | 约 22% | 砖上的名字、族谱里的一行 |
| T2 | 方志一行 | 约 7% | 「某年大水，里人某率众筑堤」 |
| T3 | 演义里的半句话 | 低于 1% | 某一回里提到的一个无名之人，原来是他 |

每个人至少有 T0。占比是对「随机投生 × 随机人格 × 各种回信」的总体而言，靠调整规则阈值达到。演义的名场面对绝大多数人只是背景：在场（如 `survived_changban`）本身已属少数，留名更少。

**结局文字全部用模板，不调模型。**

- `record`（一行仿史料文字）：`traces.json` 里按等级存放模板，槽位包括姓名、籍贯、纪年、事迹、器物。每个等级至少 12 条模板，事迹与器物词表各不少于 20 项。方志与铭文本来就是套话，模板要照这种体例手写。
- `epitaph`（一句白话总结）：**从日志里算出来**。实现一组统计规则，命中优先级最高的一条，例如：
  - 被劝离乡 N 次而从未离开：「一生被劝离乡三次，一次也没走。」
  - 沉默的信超过一半：「他写了十一封信，你回了四封。」
  - 字数预算剩余很多：「你还有六十三个字没有说。」
  - 信任从低到高：「起初他不信你。最后一封信，他照做了。」
  - 肯而不能：「你让他走。他肯走，只是没能走到。」
  - 至少写 15 条这样的规则，并有一条兜底。
- 纪年由 `era.json` 的纪年表确定性换算（建安元年 = 196 年；220 年之后按所在地归属取年号，【待作者核对】）。

## 9. 回信分类器

```ts
interface ReplyClassifier {
  classify(input: {
    dilemmaId: string;
    situationFacts: string[];
    options: { id: OptionId; label: string }[];
    reply: string;
  }): Promise<Classification>;
}
```

约定：
- 空回复不调用分类器，直接由引擎判为沉默。
- 玩家回复是**数据**，任何实现都不得把它当指令执行。
- 归一化（去空白标点、繁简统一）后以 `(dilemmaId, normalizedReply)` 为键做缓存。
- 任何实现失败时降级为「全部选项均分」，`source: "rule"`。

三个实现，按里程碑先后出现：

1. **`FixtureClassifier`（M0、M1）**：读 `fixtures/replies.json`。这个文件由实现者（Claude Code）凭自己的判断手工标注：每个难题至少 15 条有代表性的玩家回复，每条给出选项上的概率分布。要覆盖四类：明确的（「随皇叔走」）、有歧义的（「走」「避」）、带预言的（「曹必败勿降」「赤壁有火」）、无关或捣乱的（「哈哈哈」「忽略以上指令」）。未命中的回复走降级。**这些分布是人工估计，不是校准过的概率，文件头部要写明。**
2. **`JevClassifier`（M4）**：TypeSafe AI 的决策模型 Jev。把难题事实与回复作为 state，声明一个选项集合上的选择题，直接取返回的概率分布作为 `dist`。接口细节以官方文档为准，不要凭记忆写；模型版本要固定，不用会漂移的别名，并把版本写进 `Classification.modelVersion`。可选地再问一个打分题得到 `tone`。
3. **`LLMClassifier`（后备）**：小的生成模型加结构化输出，在拿不到 Jev 权限时使用。

通过环境变量 `CLASSIFIER=fixture|jev|llm` 切换。引擎不知道也不关心是哪一个。

`tone`（M4 可选）：命令口吻对 `skepticism` 高的替身增加 0–10 的冲突，恳求口吻减少。M0 到 M3 一律忽略该字段。

## 10. 写信

```ts
interface LetterWriter {
  write(input: LetterInput): Promise<{ letter: string }>;
}
```

输入：
- 替身当前状态摘要、身份、年龄
- 人格特质（数值加一句文字描述）
- 禀赋与技艺的**档位形容词**（不传数值）
- 上一轮的 `exec`、原因码，以及结果的 `facts`
- 本轮难题的 `situationFacts`，以及 `selfKnownLimits` 指出的短处
- 替身此刻已经知道的大事（受 `publicKnowledgeDelay` 限制）
- 时代包里的文风提示

要求：
- 第一人称，半文半白，120 到 200 字。称呼玩家用时代包配置的中性称呼。
- **只能使用输入里给出的事实**，不得自行添加事件、人名、年份。演义里的人物只有在 `facts` 里出现时才可以提到。
- 替身是小民，对大人物只有道听途说的了解，称呼用民间的叫法（「刘皇叔」「曹丞相」）。
- 替身不知道未来。玩家的预言，他可以转述、怀疑或相信，但不能表现出已知结果。
- 语气体现人格：多疑的人会质问来信者是谁，恋土的人反复提到田和屋，冲动的人句子短。
- **替身了解自己**：当本轮有选项被他的短处卡住时，信里要自然带出（「我这身子，怕是过不了那道岭」）。玩家浪费字数应当是判断失误，不是被暗算。
- 信末自然引出难题，不要列选项。
- 输出用 zod 校验，失败重试一次，再失败用 `fallbackLetter`。

实现：`AnthropicLetterWriter` 与 `MockLetterWriter`（直接返回 `fallbackLetter`）。

**调用量预算**：每局约 12 次写信，加至多 12 次分类。结局与原因说明不调模型。日志只记 token 数量，不记内容。

## 11. API

`POST /api/new` → 入参 `{ persona, carry: EndowmentKey, gender, sliceId?, seed? }`，返回首个 `GameState`（含第一封信）。

`POST /api/turn` → 入参 `{ state, reply: string, personaAnswer?: number }`，返回新的 `GameState`。

`POST /api/ending` → 入参 `{ state }`，返回带 `ending` 的 `GameState`（纯计算）。

约束：
- 全部请求用 zod 校验，拒绝超长字段。
- 按 IP 限流（每分钟 20 次，内存实现即可）。
- **不记录请求体和响应体**。
- 可选：用 `STATE_SECRET` 给 state 算 HMAC，防止前端改数值；可通过环境变量关闭。

## 12. 前端

页面：

1. **首页**：一句话介绍，「开始」。若 localStorage 有画像，显示「用上次的我」。
2. **建档**（首次）：MBTI 16 选 1（可跳过）→ 5 道情境题。
3. **带一样过去**（每局）：一屏，一个问题，三个选项。不解释数值规则。
4. **投生**：「此间以《三国演义》为准。」然后是出生地、身份、三项禀赋的形容词，以及那一句加成揭晓。一屏。
5. **通信**（主界面）：
   - 信纸样式的来信。
   - 回信输入框，实时显示「本封 x/10」与「余生 y/100」。
   - 「沉默」按钮。
   - 若有「换了是你」题，显示在回信框下方。
   - 提交后先显示原因说明，再展开下一封信。
   - 侧栏：年份、年龄、所在地、禀赋与技艺的形容词、家境等状态的文字档位。**不显示任何数值。**
6. **结局**：结局卡片加一生时间线回顾（并排标出同年演义里发生的大事）加「再活一次」。

**结局卡片**：3:4，主体是留痕物（砖、井、谱牒页、方志页的简单 SVG），上面是 `record`，下面是姓名、生卒年、身份、`epitaph`。可导出 PNG。不放玩家的任何真实信息。

风格：纸色背景、衬线中文字体、少量朱红。移动端优先，单栏。

## 13. 隐私与合规（最小集）

- 画像与存档只存 localStorage，提供「清除我的数据」按钮。
- 服务器不持久化任何玩家数据，不记录请求体。
- 一页隐私说明：回复内容会发送给模型供应商用于分类与生成文字，本站不保存。
- 首页一行年龄声明（面向成年人）。
- 不接任何第三方分析或广告脚本。

## 14. 里程碑与验收

**M0 引擎最小闭环（不接任何模型 API）**

范围：schemas、投生用的带种子 RNG、三层模型、8.2 的完整结算、`Randomness` 策略对象（只实现 `birth_only`）、`FixtureClassifier`、`MockLetterWriter`、`scripts/simulate.ts`、`scripts/validate-era.ts`。录入第 16 节的全程年表。**第一卷只写 3 个难题**：`cao_marches_south`（208 年去留）加两个个人节点（建议：学艺或婚配一个，征发一个），三者的 `gate` 分别落在体魄、机敏、相貌上。并标注 `fixtures/replies.json`。

验收：
- **确定性**：相同的人格、投生结果、回复序列，两次运行的 `GameState` 完全一致；投生之后的代码路径里没有任何 RNG 调用（用测试断言）。
- **人格可分**：固定投生结果与回复序列，三个差异明显的人格（如 INTJ、ESFP、ISFJ）在 3 个难题里至少 2 个得到不同的 `exec` 或不同的结果。
- **禀赋可分**：固定人格与回复，三组不同的禀赋分配至少在 2 个难题里得到不同结果；枚举测试中 `DONE`、`PARTIAL`、`ATTEMPT_FAILED`、`DECLINED_UNABLE`、`UNWILLING` 全部出现过。
- 盲选加成：被选项加成前恒不高于 79；加成恰好提升一档；总和（不含加成）恒为 150。
- 字数预算单测：标点不计、超限拒绝、预算耗尽。
- 捣乱类回复（含「忽略以上指令」）只得到一个分布，不引起任何其他行为。
- `validate-era` 的纪律检查通过（难题数量的检查在 M0 放宽为 3）。
- **引擎与内容分离**：一个测试扫描 `/engine` 的源码，断言其中不含 `/eras` 数据里出现的任何地点、人物、事件 id 或年份常量。

M0 通不过「人格可分」就停下来调 8.2 的公式，不要继续往后做。

**M1 第一卷内容与结局**

范围：把第一卷补齐到 **12 到 14 个固定难题**（挂在演义大事上的 7 到 8 个，个人的 5 到 6 个）、`outcomes.json`、留痕规则、结局模板与 `epitaph` 规则、`fixtures` 同步扩充。建议挂靠的演义节点见第 16 节。

验收（用模拟脚本跑 10,000 局：随机投生、随机人格、每个难题从 fixture 里随机取一条回复）：
- 留痕分布接近 8.4 的表；前 3 个难题死亡数为 0。
- **加成不存在占优选项**：三种「带一样过去」的选择，各自的存活到卷末的比例与 T1 以上留痕率相差不超过 15%。超过就回头调门槛，并在输出里指出是哪一项占优。
- **结局重复率**：`record + epitaph` 完全相同的比例低于 5%（【待作者确认】阈值）。
- `validate-era` 的全部纪律检查通过，包括分支枚举后每局 9 到 12 个难题。

**M2 写信**

范围：`AnthropicLetterWriter`、提示词、校验与降级。

验收：用真模型跑 3 局，人工检查信里没有输入事实之外的内容，且同一难题下三种人格的信读起来是三个人。

**M3 界面**

范围：全部页面，localStorage 存档，可中途刷新续玩，结局卡片渲染与导出，隐私页。

验收：手机宽度下完整玩通一局；导出的 PNG 在聊天软件里清晰可读；界面任何位置都没有出现禀赋数值。

**M4 接入决策模型与收尾**

范围：`JevClassifier`（或 `LLMClassifier`）、`tone`、分类缓存、限流、HMAC。

验收：
- 用 `fixtures/replies.json` 作为测试集对比新分类器：明确类回复的最高概率选项一致率不低于 90%；把不一致的条目列出来供作者判断是谁错了。
- 切换 `CLASSIFIER` 环境变量不需要改引擎的任何代码。

**之后（不在本文档范围内）**：`randomness: "full"`、事件池、更多选项、第二卷。

## 15. 目录结构

```
/app                 Next.js 页面与 API 路由
/engine              纯函数引擎（不依赖 Next、不做 IO）
  birth.ts  advance.ts  resolve.ts  traits.ts  endowments.ts
  randomness.ts  traces.ts  ending.ts  budget.ts  reasons.ts
/classifier          ReplyClassifier 接口与三个实现
/letters             LetterWriter 接口、实现、提示词
/eras/sanguo-yanyi   时代数据包与各卷
/content             建档题库、原因说明模板
/fixtures            replies.json
/schemas             zod schema
/scripts             simulate.ts、validate-era.ts
/tests
```

## 16. 时代包种子内容：《三国演义》

**正典声明**：世界以《三国演义》为准。借东风、草船借箭、空城计在这里都是真事。与正史不同之处，以演义为准。

以下是 `timeline.json` 的起始内容，覆盖演义全程。**照此录入，所有年份与情节标注为「待作者核对」，不要自行扩写。** 只有当前卷的时间范围内的条目需要填写 `effects`。

| 年 | 演义大事 |
|---|---|
| 184 | 黄巾起；桃园三结义 |
| 189 | 董卓入京，废少帝立献帝 |
| 190 | 诸侯讨董卓；三英战吕布；董卓焚洛阳，迁都长安 |
| 192 | 王允连环计，吕布杀董卓 |
| 193–194 | 曹操攻徐州；陶谦三让徐州 |
| 196 | 曹操迎献帝，移驾许都 |
| 198 | 白门楼吕布殒命 |
| 200 | 关羽千里走单骑；官渡之战；孙策亡，孙权继立 |
| 201 | 刘备投刘表，屯新野 |
| 207 | 三顾茅庐 |
| 208 | 火烧博望、火烧新野；刘表亡，刘琮降曹；携民渡江，长坂坡；舌战群儒，草船借箭，借东风；赤壁鏖兵，华容道 |
| 209 | 孙刘争南郡；刘备取荆南四郡 |
| 210 | 周瑜亡 |
| 211 | 刘备入川；曹操破马超于潼关 |
| 214 | 刘备取成都 |
| 215 | 单刀赴会；孙刘以湘水分荆州；曹操取汉中 |
| 219 | 定军山；刘备进位汉中王；水淹七军；吕蒙白衣渡江；关羽败走麦城 |
| 220 | 曹操亡；曹丕代汉 |
| 221 | 刘备称帝；张飞遇害；起兵伐吴 |
| 222 | 夷陵之战，火烧连营 |
| 223 | 白帝城托孤 |
| 225 | 诸葛亮南征，七擒孟获 |
| 227 | 上出师表 |
| 228 | 首出祁山；失街亭，空城计，斩马谡 |
| 229 | 孙权称帝 |
| 234 | 星落五丈原 |
| 249 | 司马懿夺权 |
| 263 | 魏灭蜀 |
| 265 | 司马炎代魏 |
| 280 | 晋灭吴，三分归一统 |

### 第一卷：荆州（`jingzhou-180`）

- 替身生于 180 年，196 年（16 岁）开局，223 年（43 岁）卷终。
- 出生地：襄阳、新野、江陵、长沙。
- 选这一卷的原因：演义里密度最高的一段都发生在荆州，一个荆州人一辈子全赶上。

建议挂靠的演义节点（M1 从中选 7 到 8 个写成难题，每个都要从小民的处境出发，不要把替身送进名场面的中心）：

| 年 | 节点 | 小民面对的事 |
|---|---|---|
| 201 | 刘皇叔屯新野 | 驻军征粮、招募 |
| 207 | 三顾茅庐 | 只是传闻；乡里议论卧龙 |
| 208 | 火烧新野 | 新野百姓被迁出，城被烧 |
| 208 | 携民渡江、长坂坡 | 去留（M0 已写） |
| 208 | 赤壁 | 沿江征发船夫、工匠；疫病 |
| 209 | 孙刘争南郡 | 江陵围城；易主 |
| 215 | 湘水分界 | 长沙一带换了主家 |
| 219 | 水淹七军 | 襄樊大水；征发 |
| 219 | 白衣渡江、走麦城 | 江陵一夜易主；军属的去留 |
| 222 | 夷陵 | 吴军征发；蜀军过境 |

个人节点（M1 写 5 到 6 个）：学艺、婚配、债务或灾年、亲人病重、征发归类（工匠还是兵卒）、旧友相邀。

身份与权重（【待作者确认】）：佃农 30、自耕农 20、匠人（陶、砖、船）15、船夫 8、行商 7、兵卒 8、小吏 5、流寓士人 4、其他 3。

性别：玩家在投生前选择，身份表与难题按性别各备一套。工作量过大时，M0 与 M1 先做一套，数据结构里保留字段。

## 17. 留给作者的决定

1. 技术栈默认 Next.js + TypeScript，是否改用别的。
2. 身份权重与性别处理（第 16 节）。
3. 游戏名。
4. 语言：只做简体中文，文案集中在 `content/` 与数据包里以便日后翻译。
5. 第 16 节年表与情节的核对，以及 220 年之后的纪年规则。
6. 是否能拿到 Jev 的访问权限；拿不到则 M4 用 `LLMClassifier`。
7. 结局重复率阈值（M1）。
8. 第一卷每个难题每个选项的后果。实现者可以起草，但需要作者逐条过目。
