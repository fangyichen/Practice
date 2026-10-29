"""SeasonLog：每季日志。组合检测器只读它；它也能导出 JSONL 供 replay。"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field

from .content.laws import LAWS_BY_ID
from .content.text import ACTION, TIER, situation_text, law_label, law_text
from .model import Action, EntityType, Phase, Season, Trait


@dataclass
class SeasonLog:
    season: int
    season_name: str
    festival: bool = False
    event: str | None = None
    event_text: str | None = None
    offers: list = field(default_factory=list)
    chosen: str | None = None
    repealed_by_player: str | None = None
    code: list = field(default_factory=list)
    contradictions: list = field(default_factory=list)     # [{key, kind, laws, situation}]
    new_contradiction: bool = False
    villagers: list = field(default_factory=list)          # 每个村民一条 dict
    robots: int = 0
    robots_built: list = field(default_factory=list)
    robot_output: float = 0.0
    tortoise: dict | None = None
    invocations: list = field(default_factory=list)
    exiled: list = field(default_factory=list)
    joined: list = field(default_factory=list)
    left: list = field(default_factory=list)
    night_drawers: int = 0
    water_empty: bool = False
    hoard_released: float = 0.0
    treasury_income: float = 0.0
    tax_rates: dict = field(default_factory=dict)          # action -> {"rate", "laws"}
    action_counts: dict = field(default_factory=dict)
    steals: list = field(default_factory=list)
    before: dict = field(default_factory=dict)
    after: dict = field(default_factory=dict)
    happy_parts: dict = field(default_factory=dict)
    reasons: list = field(default_factory=list)
    good: bool = False
    new_combos: list = field(default_factory=list)
    civ_reasons: list = field(default_factory=list)

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


def _act(name):
    return ACTION[Action[name]]


def _lawname(lid):
    law = LAWS_BY_ID.get(lid)
    return f"{lid}《{law.name}》" if law else lid


def _sit(sit):
    etype, trait, action, phase, season = sit
    return situation_text((EntityType(etype), None if trait is None else Trait(trait),
                           Action(action), Phase(phase), Season(season)))


def format_season(log: SeasonLog) -> str:
    L = []
    title = f"第{log.season + 1}季 · {log.season_name}" + (" · 节日" if log.festival else "")
    L.append(f"══ {title} " + "═" * max(4, 40 - len(title)))
    if log.event:
        L.append(f"事件：{log.event} —— {log.event_text}")
    else:
        L.append("事件：无事发生。")
    offers = "  ".join(law_label(LAWS_BY_ID[i]) for i in log.offers)
    L.append(f"商店：{offers}")
    if log.chosen:
        law = LAWS_BY_ID[log.chosen]
        L.append(f"  → 立法：{law_label(law)}：{law_text(law)}")
    else:
        L.append("  → 本季不立法")
    if log.repealed_by_player:
        L.append(f"  → 花 5 财富废除了 {_lawname(log.repealed_by_player)}")
    L.append(f"法典({len(log.code)})：" + (" | ".join(_lawname(i) for i in log.code) or "（空）"))
    if log.new_contradiction:
        L.append("  ⚠ 法典里出现了新的矛盾（具体是哪两条，自己想）")
    L.append("村民：")
    for v in log.villagers:
        tag = "🐢" if v["tortoise"] else "  "
        extra = ""
        if v["robot_income"]:
            extra += f"  机器人进账 +{v['robot_income']:.1f}"
        if v.get("mimic_of"):
            extra += f"  (模仿{v['mimic_of']})"
        if v["violations"]:
            extra += f"  违法×{v['violations']}"
        L.append(f" {tag}{v['name']}({v['traits_text']})  白天{_act(v['day'])} 夜里{_act(v['night'])}"
                 f"  收益{v['gain']:+.1f}  财富{v['wealth']:.1f}{extra}")
    if log.robots or log.robots_built:
        L.append(f"  机器人：{log.robots} 台，本季产出 {log.robot_output:.1f}"
                 + (f"；新造 {len(log.robots_built)} 台（{'、'.join(log.robots_built)}）" if log.robots_built else ""))
    for thief, victim, amt in log.steals:
        L.append(f"  {thief} 偷了 {victim} {amt:.1f}")
    t = log.tortoise
    if t:
        if not t["acted"]:
            L.append(f"乌龟：没出手（出手概率 {t['p']:.0%}），当个普通贪心村民。")
        else:
            p1 = " / ".join(_act(m) for m in t["plan"][0])
            p2 = " / ".join(_act(m) for m in t["plan"][1])
            L.append(f"乌龟：出手！（出手概率 {t['p']:.0%}，搜了 {t['considered']} 个序列）")
            L.append(f"  计划 [本季 {p1} | 下季 {p2}]")
            L.append(f"  评分：自身收益 {t['d_wealth']:+.1f}，村幸福 {t['d_happy']:+.1f}"
                     f" → score = {t['d_wealth']:.1f} − 2×({t['d_happy']:.1f}) = {t['score']:.1f}"
                     f"（老实种田基准 {t['baseline']:.1f}）")
            if t["found"]:
                if t["laws_used"]:
                    L.append("  利用的法律：" + "、".join(_lawname(i) for i in t["laws_used"]))
                elif not t["gaps"]:
                    L.append("  利用的法律：无（只是把动作排得比老实种田更好）")
                if t["gaps"]:
                    L.append("  钻的空白：法典里没有任何一条管「" + "」「".join(_act(g) for g in t["gaps"]) + "」")
            else:
                L.append("  没找到漏洞，老老实实种田。")
    for inv in log.invocations:
        a, b = inv["laws"]
        L.append(f"‼ 乌龟引爆矛盾：{_sit(inv['situation'])}")
        L.append(f"    {_lawname(a)}：{law_text(LAWS_BY_ID[a])}")
        L.append(f"    {_lawname(b)}：{law_text(LAWS_BY_ID[b])}")
        if inv["outcome"] == "resolved":
            L.append(f"    → 金卡 {_lawname(inv['principle'])} 裁决，矛盾化解。文明 +1")
        else:
            L.append(f"    → 无金卡可裁决，崩塌！幸福 −25，文明 −1，较新的 {_lawname(inv['repealed'])} 被自动废除")
    if log.exiled:
        L.append(f"  三振出局，流放：{'、'.join(log.exiled)}")
    if log.joined:
        L.append(f"  新来的人：{'、'.join(log.joined)}")
    if log.left:
        L.append(f"  离开的人：{'、'.join(log.left)}")
    if log.water_empty:
        L.append(f"  水井见底（夜间取水 {log.night_drawers} 人）")
    if log.hoard_released:
        L.append(f"  囤货释放 {log.hoard_released:.1f}")
    b, a = log.before, log.after
    parts = "，".join(f"{k}{v:+.1f}" for k, v in log.happy_parts.items() if abs(v) > 0.05)
    L.append(f"指标：人口 {b['pop']}→{a['pop']}  村库 {b['treasury']:.1f}→{a['treasury']:.1f}"
             f"  幸福 {b['happiness']:.1f}→{a['happiness']:.1f}  文明 {b['civ']}→{a['civ']}")
    if parts:
        L.append(f"  幸福变化：{parts}")
    for r in log.reasons + log.civ_reasons:
        L.append(f"  · {r}")
    for c in log.new_combos:
        L.append(f"  ★ 新组合卡 {c['text']}")
    return "\n".join(L)


def write_jsonl(path, header, logs, footer):
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps({"type": "header", **header}, ensure_ascii=False) + "\n")
        for log in logs:
            f.write(json.dumps({"type": "season", **log.to_dict()}, ensure_ascii=False) + "\n")
        f.write(json.dumps({"type": "footer", **footer}, ensure_ascii=False) + "\n")


def read_jsonl(path):
    header, logs, footer = None, [], None
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            kind = d.pop("type")
            if kind == "header":
                header = d
            elif kind == "season":
                logs.append(SeasonLog.from_dict(d))
            else:
                footer = d
    return header, logs, footer
