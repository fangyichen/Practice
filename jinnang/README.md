# 锦囊（暂定名）· M1

设计文档：[`../design/DESIGN.md`](../design/DESIGN.md)。已实现 **M0（引擎最小闭环）** 和 **M1（第一卷内容与结局）**，仍不接任何模型 API。M2 及以后未做。

```bash
npm install
npm test                 # 全部验收测试（vitest）
npm run typecheck
npm run validate-era     # 纪律检查（文档完整标准）
npm run simulate         # 10,000 局，打印 M1 验收指标；加 --brief 只看指标
npm run dev              # 人工测试页 http://localhost:4321
npm run build:static     # 同一页面打包成不需要服务器的单页 dist/jinnang-devtools.html
```

## 人工测试页

`npm run dev` 后打开 http://localhost:4321（`PORT=xxxx` 可换端口）。这是调试工具，不是正式界面，会显示全部数值：

- 设定人格（MBTI 起点 + 六项滑杆）、带一样过去、性别；投生可按种子随机，也可手动指定出生地、身份、三项禀赋。
- 每封信：可点 fixture 样本回复，也可自由输入；「分类方式」可以直接指定他把这句话读成哪个选项（因为自由输入多半不在 fixture 里，会被均分）。
- 每轮显示原因说明、exec、分数拆解（信任 − 冲突 + 紧迫）、信任变化和原始原因码。
- 撤回一封、同一投生再活一次、导出/导入存档 JSON。
- 结局：3:4 结局卡片（留痕物 + 记载 + 姓名生卒 + 墓志），可生成 PNG；下面是一生时间线，并排标出同年演义大事。

`npm run build:static` 把引擎、数据包、fixture 分类和 mock 写信一起打包进页面（`devtools/browser.ts`），不需要服务器，可以发布成网页在手机上打开。接口逻辑两边共用 `devtools/api.ts`。打包版的「导出存档」改为复制到剪贴板。

## 调参

改 `config/engine.json`，然后跑 `npm test` 和 `npm run simulate`。想在不改文件的情况下做对比实验，可以在代码里传入另一份配置：

```ts
import { birth, step, withConfig } from "./engine";
const cfg = withConfig({ trust: { initialBase: 45 }, willingness: { willing: 55 } });
let s = birth(params, pack, cfg);
s = step(s, input, pack, { config: cfg });
```

难题自身的数值（`urgency`、门槛档位、结果）和身份权重是内容，不在这里，在 `eras/` 下。

## 目录

| 目录 | 内容 |
|---|---|
| `config/engine.json` | **引擎可调参数**：信任、肯不肯门槛、读法、性情阈值、标签冲突表、禀赋规则、字数预算、MBTI 调整表。以 `_` 开头的键是说明。加载时严格校验，拼错的键会报错 |
| `engine/` | 纯函数引擎：`birth` `advance` `resolve`（8.2）`ending`（8.4）`traits` `endowments` `budget` `randomness` `reasons` `world` `rng` |
| `schemas/` | zod schema（状态、分类结果、数据包） |
| `eras/sanguo-yanyi/` | 时代包：`era` `timeline`（全程 34 条） `locations` `stations` `traces`（留痕规则、记载模板、墓志规则），以及第一卷 `slices/jingzhou-180`（14 个难题、102 个结果） |
| `classifier/` | `ReplyClassifier` 接口、`FixtureClassifier`、降级 |
| `letters/` | `LetterWriter` 接口、`MockLetterWriter`、写信输入的组装 |
| `lib/` | 数据包加载、纪律检查、一局的编排（引擎 + 分类 + 写信） |
| `content/` | 建档题库（9 道）、原因说明模板、投生加成句模板 |
| `fixtures/replies.json` | 手工标注的回复分布（每题 16–18 条，四类） |
| `scripts/` | `validate-era.ts`、`simulate.ts`、`devserver.ts`（人工测试页的服务器）、`build-static.ts`（打包单页） |
| `devtools/` | 人工测试页（`index.html`）、共用接口逻辑 `api.ts`、浏览器入口 `browser.ts` |
| `tests/` | M0 与 M1 验收测试 |

## M1 验收结果（`npm run simulate`，10,000 局）

| 指标 | 目标 | 结果 |
|---|---|---|
| 留痕分布 T0 / T1 / T2 / T3 | 约 70 / 22 / 7 / <1 | 69.7 / 23.4 / 6.5 / 0.5 |
| 前 3 个难题的死亡 | 0 | 0 |
| 「带一样过去」卷末存活率极差 | ≤ 15 个百分点 | 7.7（体魄 92.7%，机敏 86.1%，相貌 85.1%） |
| 「带一样过去」T1 以上留痕率极差 | ≤ 15 个百分点 | 5.0 |
| 结局重复率（record + epitaph 完全相同） | < 5% | 2.0% |
| 每局难题数（分支枚举） | 9–12 | 9–12 |

## 第一卷的难题（全部【待作者核对】，每个选项的后果需要作者逐条过目）

| 年 | 难题 | 谁会遇到 | 门槛 |
|---|---|---|---|
| 197 | 学艺 `apprentice_offer` | 所有人 | 机敏 |
| 199 | 婚配 `matchmaker_call` | 所有人 | 相貌 |
| 201 | 刘皇叔屯新野 `liu_garrison_201` | 襄阳、新野 | 体魄 |
| 202 | 灾年借贷 `lean_year_debt` | 所有人 | 体魄 |
| 204 | 征发 `county_levy` | 所有人 | 机敏 |
| 207 | 旧友相邀（三顾茅庐的传闻） `old_friend_invite` | 所有人 | 相貌 |
| 208 | 曹军南下，去留 `cao_marches_south` | 襄阳、新野 | 体魄 |
| 208 | 荆州降曹，南边的去留 `south_surrender_208` | 江陵、长沙 | 相貌 |
| 208 | 赤壁：征发与疫病 `chibi_aftermath` | 所有人 | 体魄 |
| 209 | 新主家造户籍 `new_master_209` | 江陵、长沙、江夏 | 机敏 |
| 212 | 亲人病重 `parent_illness_212` | 所有人 | 机敏 |
| 219 | 水淹七军 `fan_flood_219` | 襄阳、新野 | 体魄 |
| 219 | 白衣渡江 `white_robe_219` | 江陵 | 相貌 |
| 222 | 夷陵 `yiling_222` | 江陵、长沙、江夏 | 无 |

演义里的半句话（T3）只有四个来源：长坂桥东拴枝扬尘、黄盖的火船、曹营的连环船、夷陵之后江上接应先主的小船。

## M1 的实现取舍（需要作者过目）

1. **「每局 9–12 个难题」只对活到卷末的分支要求下限**，中途死亡的分支自然更短。否则第 9 个难题之前不能有任何致死结果。
2. **记载与墓志从多条模板里挑哪一条，用「种子 + 姓名」的哈希决定**，不是 RNG 调用，确定性不变（有测试断言结局阶段没有 RNG 调用）。
3. **墓志的统计规则是通用的**（看日志、exec、标签、flag），放在 `engine/ending.ts`；具体文字和顺序在 `traces.json`。共 29 条规则加兜底。
4. **余生概要**（卷末仍在世的人活到几岁、几个儿孙）的系数放在 `traces.json` 的 `afterlife`。
5. **为了让分支长度落在 9–12**：被拉进曹营水军的人（会被带到江陵）不再遇到「南边的去留」；白衣渡江时往西走的人不再遇到夷陵。往西走的人所在地仍记为江陵（数据里没有益州的地点）。
6. **身份名里的括注不进记载**（「匠人（陶、砖、船）」在记载里写作「匠人」）。
7. 记载和墓志里的「他/她」按性别替换；结果文字和信仍只有一套（男性口吻），见 M0 第 10 条。
8. 结局卡片做在人工测试页上（正式界面属于 M3）。卡片字体用系统自带的宋体；生成的 PNG 在手机上长按保存。
9. 人格可分、禀赋可分的「稳健性」统计改为在 M0 的三个难题上隔一取一地遍历回复（其余难题沉默），否则一次测试要跑几分钟。
10. 出生地恢复为襄阳、新野、江陵、长沙四处（M0 第 2 条不再适用）。

## M0 的实现取舍（需要作者过目）

1. **保护规则在 M0 只覆盖前 2 个难题。** M0 只有 3 个难题，第 3 个就是 208 年去留，而文档样例里 `collapsed_on_road` 本身是致死结果。`--profile full` 仍按「前 3 个」检查。
2. **出生地暂时只开襄阳、新野。** 去留一题的条件是 `where: [xiangyang, xinye]`，若出生在江陵、长沙，一局只有 2 个难题，不满足「M0 放宽为 3」。M1 补齐难题后恢复四个出生地。
3. **新增两个标签** `settle_down`（冲突来自低 rootedness）和 `disappoint_family`（rootedness、loyalty），供婚配节点使用。
4. **初始信任基数由 40 改为 50**（作者决定；见 `config/engine.json` 的 `trust.initialBase`）。
5. **新增两个字段**：难题的 `urgency`（即 8.2 的 urgencyBonus：婚配 10、征发 15、去留 20），选项的 `urgent`（时机判定只作用于需要赶时间的选项）。
6. **折中（PARTIAL）不检查本人门槛**：折中的含义是他自己不全做（如只把家人送走）。
7. **人格默认会排除刚被拒绝的那个选项**；误了时机时再排除 `urgent` 选项。
8. **没照做时的「后悔」**：按建议选项的反事实结果判断（他做得到就查 DONE，做不到就查 ATTEMPT_FAILED）。
9. 结局在 M0 只记录 `{cause, year, age}`；留痕、`record`、`epitaph` 属于 M1。分类缓存、限流、HMAC 属于 M4。Next.js 前端属于 M3，所以 M0 没有安装。
10. 身份表按第 16 节的权重录入，性别只做一套（数据结构保留 `gender`）。
11. 年表、纪年、地点归属全部标注「待作者核对」。
