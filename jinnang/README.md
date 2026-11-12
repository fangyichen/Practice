# 锦囊（暂定名）· M0

设计文档：[`../design/DESIGN.md`](../design/DESIGN.md)。这里只实现了 **M0：引擎最小闭环，不接任何模型 API**。

```bash
npm install
npm test                 # 全部验收测试（vitest）
npm run typecheck
npm run validate-era     # 纪律检查，M0 profile
npx tsx scripts/validate-era.ts --profile full   # 按文档完整标准检查（M0 内容必然不通过：难题数不够）
npm run simulate -- --n 3000
npm run dev              # 人工测试页 http://localhost:4321
```

## 人工测试页

`npm run dev` 后打开 http://localhost:4321（`PORT=xxxx` 可换端口）。这是调试工具，不是正式界面，会显示全部数值：

- 设定人格（MBTI 起点 + 六项滑杆）、带一样过去、性别；投生可按种子随机，也可手动指定出生地、身份、三项禀赋。
- 每封信：可点 fixture 样本回复，也可自由输入；「分类方式」可以直接指定他把这句话读成哪个选项（因为自由输入多半不在 fixture 里，会被均分）。
- 每轮显示原因说明、exec、分数拆解（信任 − 冲突 + 紧迫）、信任变化和原始原因码。
- 撤回一封、同一投生再活一次、导出/导入存档 JSON。

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
| `engine/` | 纯函数引擎：`birth` `advance` `resolve`（8.2）`traits` `endowments` `budget` `randomness` `reasons` `world` `rng` |
| `schemas/` | zod schema（状态、分类结果、数据包） |
| `eras/sanguo-yanyi/` | 时代包：`era` `timeline`（全程 34 条） `locations` `stations`，以及第一卷 `slices/jingzhou-180`（3 个难题） |
| `classifier/` | `ReplyClassifier` 接口、`FixtureClassifier`、降级 |
| `letters/` | `LetterWriter` 接口、`MockLetterWriter`、写信输入的组装 |
| `lib/` | 数据包加载、纪律检查、一局的编排（引擎 + 分类 + 写信） |
| `content/` | 建档题库（9 道）、原因说明模板、投生加成句模板 |
| `fixtures/replies.json` | 手工标注的回复分布（每题 16–17 条，四类） |
| `scripts/` | `validate-era.ts`、`simulate.ts`、`devserver.ts`（人工测试页的服务器） |
| `devtools/` | 人工测试页（单个 HTML，无需构建） |
| `tests/` | M0 验收测试 |

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
