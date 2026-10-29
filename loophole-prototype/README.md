# 《漏洞》原型

按《漏洞》原型设计规格（Oct 29, 2026）实现的命令行模拟器。它要回答的问题是：**不调用 LLM，法律 × 村民性格 × 乌龟搜索能不能自己长出组合事件。**

- 纯标准库 Python 3.11+，零依赖，不调用任何 LLM
- 30 条法律（白 10 / 蓝 10 / 紫 4 / 橙 3 / 金 3），8 个基础动作（另有 HIRE、MINE、INVOKE），6 种性格，10 张事件卡，10 个组合卡检测器
- 同一个 seed、同样的选择，日志逐字相同（跨进程、跨 `PYTHONHASHSEED` 也一样）

实验结果和验收对照见 [`results/REPORT.md`](results/REPORT.md)。

## 像素风界面

```bash
python -m loophole serve            # 打开 http://127.0.0.1:8000
```

- **亲自立法**：每季从三（或四）张法案里选一张、跳过，或花 5 村库废除一条。界面通过本地服务调用同一个 Python 模拟器，结果和命令行一致。
- **录像**：6 局用模拟器真实跑出来的局（偷窃潮、布道与禁言的崩塌、金卡化解、机器人村、元法律造出的矛盾、随手立法），不需要本地服务也能看。
- 画面里村民白天、夜里各走到自己动作的地点（田、集市、井、祠堂、作坊、粮仓、矿洞）。乌龟引爆矛盾时法典碑会裂开、全屏震动；新的组合卡会弹出来收进图鉴。
- 界面文件在 `ui/`：`index.html` 是页面，`data.js` 由 `python ui/build_data.py` 生成（法律表 + 录像）。

## 运行

```bash
cd loophole-prototype
python -m loophole run --seed 42 --auto                       # 自动立法（greedy）跑一局
python -m loophole run --seed 42 --auto --strategy cautious   # greedy / cautious / random / greedy_nogold
python -m loophole run --seed 42                              # 手动立法：每季输入 1/2/3、s 跳过、r <id> 废除
python -m loophole run --seed 1 --auto --laws b08,w04         # 指定开局法典（方便复现场景）
python -m loophole run --seed 42 --auto --jsonl run.jsonl     # 导出 JSONL
python -m loophole replay run.jsonl                           # 重放并重跑组合检测
python -m loophole batch --strategy greedy --n 20 --seed 0    # 批量汇总
python experiments/run_all.py                                 # 重新生成 results/ 下的全部实验
python -m unittest -v                                         # 测试（约 45 秒）
```

## 结构

```
loophole/
  __main__.py        CLI：run / batch / replay / serve
  server.py          本地网页服务（标准库 http.server）
  model.py           枚举、Law / Filter / Effect / MetaRule、ConcreteRule、Villager、State
  expand.py          expand_code(laws)：先应用橙卡，再用紫卡改写白/蓝卡（纯函数）
  engine.py          结算引擎：收益 / 税 / REDIRECT / 执法 / INVOKE 裁决 / 季末结算
  villager.py        utility()、decide()、decide_mimic()
  tortoise.py        find_contradictions()、adjudicator()、plan()（两季前瞻搜索）
  sim.py             run_season()（七步）、run_game()、村史
  combos.py          10 个 ComboDetector + REGISTRY（只读 SeasonLog）
  shop.py            按文明等级抽卡、自动立法策略
  log.py             SeasonLog、人类可读的打印、JSONL 读写
  content/laws.py    30 条法律
  content/events.py  10 张事件卡
  content/text.py    所有文案模板
tests/               test_expand / test_contradiction / test_tortoise / test_determinism
experiments/         run_all.py：生成 results/
results/             实验输出（日志、JSONL、批量汇总、报告）
ui/                  像素风网页界面（index.html、data.js、build_data.py）
```

和规格的关键对应：

- 村民、乌龟、矛盾检测都只读 `expand_code` 输出的 `ConcreteRule`，不直接读 `Law`。金卡存在 `State.principles` 里，不参与展开，乌龟也看不到。
- 乌龟的 `plan()` 不写任何漏洞规则。它只做三件事：枚举合法的两季动作序列，用和真实结算**同一套** `engine.execute/settle` 做前瞻，然后按 `Δ自身财富 − 2×Δ村幸福` 打分。
- 组合检测器只读日志。新增检测器只需要往 `combos.REGISTRY` 里加一个类，不用改模拟器。

## 和规格的偏差

规格允许数值粗糙，下面这些是为了让原型跑得通、日志读得懂而做的取舍：

| 偏差 | 原因 |
| --- | --- |
| 村民对 STEAL 有良心成本（贪 2.5，其他 3） | 没有这一项时，偷（+4）在零法律下完全压过种田（+3），每局开局都是全村互偷 |
| TINKERER 造机器人的实际成本也是 0（规格写“视为 0”） | 否则乌龟按真实经济前瞻永远不造，`b01 + TINKERER 乌龟 → BUILD_ROBOT` 不会成立 |
| HOARD = 存 3 单位粮食，下季释放，释放时按下季的农税计税 | 规格没给具体数值；这样和“冬休”元法律对接后能长出《冬藏》 |
| 吃饱时幸福 +2（“温饱”） | 否则幸福只降不升，几季内就全是废村 |
| 乌龟搜索：第一季全部枚举，第二季只展开第一季前 5 名、所有含 BUILD_ROBOT/HOARD 的序列，以及老实种田基准 | 全量 81×81 太慢；延迟回报的动作必须保留，不然会被剪掉 |
| 乌龟用未截断的幸福变化估算伤害 | 幸福已经是 0 时，崩塌在截断后的数值里是 0，乌龟就不会引爆矛盾了 |
| 机器人从建造后的下一季开始干活 | “先造再让它干”就是一个两季序列 |
| INVOKE 只能在矛盾成立的阶段和季节使用 | 例如 b04 引起的矛盾只在冬季成立 |
| `check()` 返回 `list[Combo]`；图鉴 key 带上村民名 | 规格要求“不同参与者算不同条目” |
| b02 商税的 who 写成 ALL | 原文 “MERCHANT∨TRADE” 实际作用于所有交易者 |
| 得分比老实种田至少高 1 分才算“找到漏洞” | 去掉不公项带来的 0.x 分噪声 |
