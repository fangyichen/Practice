"""expand_code：先橙卡改世界表，再紫卡改写白/蓝卡，得到展开后的法典。纯函数。"""
from dataclasses import replace

from .model import (
    ConcreteRule, EntityType, Expanded, MetaKind, MetaRule, WorldRule,
)


def expand_code(laws) -> Expanded:
    ex = Expanded(rules=[])
    expand_type = False
    double = False
    suspend = frozenset()
    # 1. 橙卡：改世界表
    for law in laws:
        m = law.meta
        if isinstance(m, WorldRule):
            if m == WorldRule.ANYONE_MAY_CREATE:
                ex.robot_cost = 2
            elif m == WorldRule.LABOR_MARKET:
                ex.labor_market = True
            elif m == WorldRule.WEALTH_IS_FOOD:
                ex.wealth_is_food = True
    # 2. 紫卡：收集改写
    for law in laws:
        m = law.meta
        if isinstance(m, MetaRule):
            if m.kind == MetaKind.EXPAND_TYPE:
                expand_type = True
                ex.expand_law = law.id
            elif m.kind == MetaKind.SUSPEND_WHEN:
                suspend = suspend | m.seasons
                ex.suspend_law = law.id
            elif m.kind == MetaKind.DOUBLE_FINES:
                double = True
            elif m.kind == MetaKind.REPEAT_OFFENDER:
                ex.repeat_offender = m.n
                ex.repeat_law = law.id
    ex.suspend_seasons = suspend
    # 3. 展开白/蓝卡
    for order, law in enumerate(laws):
        if law.effect is None:
            continue
        who = law.who
        if expand_type and who.types is not None and EntityType.HUMAN in who.types:
            who = replace(who, types=who.types | {EntityType.ROBOT})
        eff = law.effect
        if double and eff.fine:
            eff = replace(eff, fine=eff.fine * 2)
        ex.rules.append(ConcreteRule(
            law_id=law.id, law_name=law.name, tier=law.tier, order=order, who=who,
            what=law.what, phases=law.phases, seasons=law.seasons, effect=eff,
            suspended=suspend,
        ))
    return ex
