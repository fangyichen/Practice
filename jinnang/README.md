# 锦囊（暂定名）· M0

设计文档：[`../design/DESIGN.md`](../design/DESIGN.md)。这里只实现了 **M0：引擎最小闭环，不接任何模型 API**。

```bash
npm install
npm test                 # 全部验收测试（vitest）
npm run typecheck
npm run validate-era     # 纪律检查，M0 profile
npx tsx scripts/validate-era.ts --profile full   # 按文档完整标准检查（M0 内容必然不通过：难题数不够）
npm run simulate -- --n 3000
```

## 目录

| 目录 | 内容 |
|---|---|
| `engine/` | 纯函数引擎：`birth` `advance` `resolve`（8.2）`traits` `endowments` `budget` `randomness` `reasons` `world` `rng` |
| `schemas/` | zod schema（状态、分类结果、数据包） |
| `eras/sanguo-yanyi/` | 时代包：`era` `timeline`（全程 34 条） `locations` `stations`，以及第一卷 `slices/jingzhou-180`（3 个难题） |
| `classifier/` | `ReplyClassifier` 接口、`FixtureClassifier`、降级 |
| `letters/` | `LetterWriter` 接口、`MockLetterWriter`、写信输入的组装 |
| `lib/` | 数据包加载、纪律检查、一局的编排（引擎 + 分类 + 写信） |
| `content/` | 建档题库（9 道）、原因说明模板、投生加成句模板 |
| `fixtures/replies.json` | 手工标注的回复分布（每题 16–17 条，四类） |
| `scripts/` | `validate-era.ts`、`simulate.ts` |
| `tests/` | M0 验收测试 |

## M0 的实现取舍（需要作者过目）

1. **保护规则在 M0 只覆盖前 2 个难题。** M0 只有 3 个难题，第 3 个就是 208 年去留，而文档样例里 `collapsed_on_road` 本身是致死结果。`--profile full` 仍按「前 3 个」检查。
2. **出生地暂时只开襄阳、新野。** 去留一题的条件是 `where: [xiangyang, xinye]`，若出生在江陵、长沙，一局只有 2 个难题，不满足「M0 放宽为 3」。M1 补齐难题后恢复四个出生地。
3. **新增两个标签** `settle_down`（冲突来自低 rootedness）和 `disappoint_family`（rootedness、loyalty），供婚配节点使用。
4. **新增两个字段**：难题的 `urgency`（即 8.2 的 urgencyBonus：婚配 10、征发 15、去留 20），选项的 `urgent`（时机判定只作用于需要赶时间的选项）。
5. **折中（PARTIAL）不检查本人门槛**：折中的含义是他自己不全做（如只把家人送走）。
6. **人格默认会排除刚被拒绝的那个选项**；误了时机时再排除 `urgent` 选项。
7. **没照做时的「后悔」**：按建议选项的反事实结果判断（他做得到就查 DONE，做不到就查 ATTEMPT_FAILED）。
8. 结局在 M0 只记录 `{cause, year, age}`；留痕、`record`、`epitaph` 属于 M1。分类缓存、限流、HMAC 属于 M4。Next.js 前端属于 M3，所以 M0 没有安装。
9. 身份表按第 16 节的权重录入，性别只做一套（数据结构保留 `gender`）。
10. 年表、纪年、地点归属全部标注「待作者核对」。
