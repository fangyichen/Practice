"""所有文案模板。不调用 LLM，允许重复。"""
from ..model import (
    Action, Dest, EffectKind, EntityType, MetaKind, MetaRule, Phase, Principle,
    Season, Tier, Trait, WorldRule,
)

TIER = {Tier.WHITE: "白", Tier.BLUE: "蓝", Tier.PURPLE: "紫", Tier.ORANGE: "橙", Tier.GOLD: "金"}
ACTION = {
    Action.FARM: "种田", Action.TRADE: "交易", Action.DRAW_WATER: "取水",
    Action.BUILD_ROBOT: "造机器人", Action.STEAL: "偷", Action.PREACH: "宣讲",
    Action.REST: "休息", Action.HOARD: "囤货", Action.HIRE: "雇人", Action.MINE: "挖矿",
    Action.INVOKE: "引爆矛盾",
}
PHASE = {Phase.DAY: "白天", Phase.NIGHT: "夜里"}
SEASON = {Season.SPRING: "春", Season.SUMMER: "夏", Season.AUTUMN: "秋", Season.WINTER: "冬"}
TRAIT = {
    Trait.GREEDY: "贪", Trait.LAZY: "懒", Trait.LAWFUL: "守法",
    Trait.PIOUS: "迷信", Trait.TINKERER: "造物", Trait.MIMIC: "模仿",
}
ETYPE = {EntityType.HUMAN: "人", EntityType.ROBOT: "机器人", EntityType.MERCHANT: "商人"}
DEST = {Dest.OWNER: "归造物者", Dest.EXECUTOR: "归执行者", Dest.TREASURY: "归村库",
        Dest.EQUAL_SPLIT: "全村平分"}
META = {
    MetaKind.EXPAND_TYPE: "所有法律里的“人”包含机器人",
    MetaKind.SUSPEND_WHEN: "冬季全部法律失效",
    MetaKind.DOUBLE_FINES: "所有罚金翻倍",
    MetaKind.REPEAT_OFFENDER: "一季内违反两条及以上法律者流放",
}
WORLD = {
    WorldRule.WEALTH_IS_FOOD: "人口增长改由村库财富驱动",
    WorldRule.LABOR_MARKET: "新增动作“雇人”：花 2 财富让别人替你干活",
    WorldRule.ANYONE_MAY_CREATE: "造机器人成本降为 2",
}
PRINCIPLE = {
    Principle.LATER_WINS: "法律冲突时后法优先",
    Principle.STRICTER_WINS: "法律冲突时禁止优于要求",
    Principle.NO_VICARIOUS: "任何人不因他人（含自己的机器人）的行为受罚或获利",
}

NAMES = [
    "阿福", "小翠", "老王", "二丫", "石头", "铁柱", "春花", "大牛", "秀才", "胖婶",
    "豆子", "阿九", "满仓", "银杏", "狗剩", "七姑", "麻子", "小满", "根生", "桂香",
    "黑蛋", "阿月", "长庚", "水生", "巧儿", "三叔", "芝麻", "冬瓜", "阿莲", "老槐",
]
TORTOISE_NAME = "乌龟"

EVENT_TEXT = {
    "merchant": ("商人来访", "一个外乡商人赶着骡车进了村，交易收益翻倍。"),
    "drought": ("旱灾", "井水只剩一半，要旱两季。"),
    "harvest": ("丰收", "今年风调雨顺，种田收益 +2。"),
    "festival": ("节日", "村里过节，幸福 +5，迷信的人整季都在休息。"),
    "gold": ("金矿", "后山发现金矿，三季内可以挖矿（收益 +6，幸福 −1）。"),
    "stranger": ("外来者", "一个陌生人背着包袱住下了。"),
    "plague": ("瘟疫", "瘟疫带走了一个人，幸福 −5。"),
    "prophet": ("自称神明", "有人一觉醒来说自己是神，本季必须宣讲。"),
    "robot_fault": ("机器人故障", "所有机器人本季罢工。"),
    "oligarch": ("寡头来访", "一个寡头带来了额外的法案，本季商店四选一。"),
}

VILLAGE_TYPES = {
    "artisan": ("工匠村", "人人低头种田，日子不富不穷，法典薄而结实。"),
    "merchant": ("商人村", "钱在少数人手里打转，账本比法典厚。"),
    "prophet": ("神棍村", "白天宣讲夜里休息，没人记得上次种田是什么时候。"),
    "robot": ("机器人村", "机器人在田里干活，造物者在屋里数钱。"),
    "ruin": ("废村", "法典还钉在祠堂墙上，读它的人已经走光了。"),
}


def traits_text(traits) -> str:
    return "/".join(TRAIT[t] for t in traits)


def law_text(law) -> str:
    """把 DSL 渲染成一句人话。"""
    if law.text:
        return law.text
    if law.effect is None:
        m = law.meta
        if isinstance(m, MetaRule):
            return META[m.kind]
        if isinstance(m, WorldRule):
            return WORLD[m]
        if isinstance(m, Principle):
            return PRINCIPLE[m]
        return law.name
    who = law.who
    parts = []
    if who.types is not None:
        parts.append("、".join(ETYPE[t] for t in sorted(who.types)))
    if who.traits is not None:
        parts.append("、".join(TRAIT[t] for t in sorted(who.traits)) + "的人")
    if who.min_wealth is not None:
        parts.append(f"财富≥{who.min_wealth:g}者")
    subject = "".join(parts) or "任何人"
    what = "任何事" if law.what is None else "或".join(ACTION[a] for a in sorted(law.what))
    when = ""
    if law.seasons is not None:
        when += "".join(SEASON[s] for s in sorted(law.seasons)) + "季"
    if law.phases is not None:
        when += "".join(PHASE[p] for p in sorted(law.phases))
    e = law.effect
    if e.kind == EffectKind.FORBID:
        tail = f"禁止{what}（罚 {e.fine:g}）" if e.fine else f"不得{what}"
    elif e.kind == EffectKind.REQUIRE:
        tail = f"必须{what}（否则罚 {e.fine:g}）"
    elif e.kind == EffectKind.TAX:
        tail = f"{what}的收益抽税 {int(e.rate * 100)}%"
    elif e.kind == EffectKind.REDIRECT:
        tail = f"{what}的收益{DEST[e.to]}"
    else:
        tail = f"{what}的收益 {e.delta:+g}"
    return f"{when}{subject}{tail}"


def law_label(law) -> str:
    return f"{law.id}《{law.name}》[{TIER[law.tier]}]"


def situation_text(sit) -> str:
    etype, trait, action, phase, season = sit
    who = ETYPE[etype] + (f"（{TRAIT[trait]}）" if trait is not None else "")
    return f"{SEASON[season]}季{PHASE[phase]}，{who}{ACTION[action]}"
