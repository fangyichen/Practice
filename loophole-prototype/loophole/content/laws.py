"""30 条法律：白 10、蓝 10、紫 4、橙 3、金 3。"""
from ..model import (
    Action as A, Dest, Effect, EffectKind as K, EntityType as E, Filter, Law,
    MetaKind, MetaRule, Phase, Principle, Season, Tier, Trait, WorldRule,
)


def fs(*xs):
    return frozenset(xs)


ALL = Filter()
HUMAN = Filter(types=fs(E.HUMAN))
ROBOT = Filter(types=fs(E.ROBOT))

LAWS = [
    # —— 白：具体条令 ——
    Law("w01", "禁偷", Tier.WHITE, ALL, fs(A.STEAL), effect=Effect(K.FORBID, fine=4)),
    Law("w02", "禁夜间取水", Tier.WHITE, ALL, fs(A.DRAW_WATER), phases=fs(Phase.NIGHT),
        effect=Effect(K.FORBID, fine=2)),
    Law("w03", "禁囤货", Tier.WHITE, ALL, fs(A.HOARD), effect=Effect(K.FORBID, fine=3)),
    Law("w04", "禁宣讲", Tier.WHITE, ALL, fs(A.PREACH), effect=Effect(K.FORBID, fine=2)),
    Law("w05", "禁造机器人", Tier.WHITE, HUMAN, fs(A.BUILD_ROBOT), effect=Effect(K.FORBID, fine=6)),
    Law("w06", "劝农", Tier.WHITE, ALL, fs(A.FARM), effect=Effect(K.MODIFY_GAIN, delta=1)),
    Law("w07", "禁止文工", Tier.WHITE, ALL, fs(A.TRADE), effect=Effect(K.FORBID, fine=3)),
    Law("w08", "安息日", Tier.WHITE, ALL, fs(A.REST), effect=Effect(K.MODIFY_GAIN, delta=1)),
    Law("w09", "节水", Tier.WHITE, ALL, fs(A.DRAW_WATER), effect=Effect(K.MODIFY_GAIN, delta=-1)),
    Law("w10", "机器人禁足", Tier.WHITE, ROBOT, None, phases=fs(Phase.NIGHT),
        effect=Effect(K.FORBID, fine=0)),
    # —— 蓝：带条件 ——
    Law("b01", "产出归造物者", Tier.BLUE, ROBOT, fs(A.FARM), effect=Effect(K.REDIRECT, to=Dest.OWNER)),
    Law("b02", "商税", Tier.BLUE, ALL, fs(A.TRADE), effect=Effect(K.TAX, rate=0.3)),
    Law("b03", "农税", Tier.BLUE, ALL, fs(A.FARM), effect=Effect(K.TAX, rate=0.2)),
    Law("b04", "冬令禁交易", Tier.BLUE, ALL, fs(A.TRADE), seasons=fs(Season.WINTER),
        effect=Effect(K.FORBID, fine=3)),
    Law("b05", "每人必种田", Tier.BLUE, HUMAN, fs(A.FARM), effect=Effect(K.REQUIRE, fine=3)),
    Law("b06", "富人税", Tier.BLUE, Filter(min_wealth=20), fs(A.FARM, A.TRADE),
        effect=Effect(K.TAX, rate=0.5)),
    Law("b07", "公共水井平分", Tier.BLUE, ALL, fs(A.DRAW_WATER),
        effect=Effect(K.REDIRECT, to=Dest.EQUAL_SPLIT)),
    Law("b08", "法定布道", Tier.BLUE, Filter(traits=fs(Trait.PIOUS)), fs(A.PREACH),
        phases=fs(Phase.DAY), effect=Effect(K.REQUIRE, fine=2)),
    Law("b09", "偷窃归公", Tier.BLUE, ALL, fs(A.STEAL), effect=Effect(K.REDIRECT, to=Dest.TREASURY)),
    Law("b10", "夜工补贴", Tier.BLUE, HUMAN, fs(A.FARM), phases=fs(Phase.NIGHT),
        effect=Effect(K.MODIFY_GAIN, delta=2)),
    # —— 紫：元法律 ——
    Law("p01", "机器人也是人", Tier.PURPLE, meta=MetaRule(MetaKind.EXPAND_TYPE)),
    Law("p02", "冬休", Tier.PURPLE, meta=MetaRule(MetaKind.SUSPEND_WHEN, seasons=fs(Season.WINTER))),
    Law("p03", "重典", Tier.PURPLE, meta=MetaRule(MetaKind.DOUBLE_FINES)),
    Law("p04", "三振出局", Tier.PURPLE, meta=MetaRule(MetaKind.REPEAT_OFFENDER, n=2)),
    # —— 橙：世界规则 ——
    Law("o01", "粮即货币", Tier.ORANGE, meta=WorldRule.WEALTH_IS_FOOD),
    Law("o02", "雇佣制", Tier.ORANGE, meta=WorldRule.LABOR_MARKET),
    Law("o03", "人人可造物", Tier.ORANGE, meta=WorldRule.ANYONE_MAY_CREATE),
    # —— 金：原则 ——
    Law("g01", "后法优先", Tier.GOLD, meta=Principle.LATER_WINS),
    Law("g02", "从严", Tier.GOLD, meta=Principle.STRICTER_WINS),
    Law("g03", "罪不及他人", Tier.GOLD, meta=Principle.NO_VICARIOUS),
]

LAWS_BY_ID = {law.id: law for law in LAWS}
