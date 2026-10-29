"""商店：按文明等级抽卡；三种自动立法策略。"""
from __future__ import annotations

from .content.laws import LAWS
from .model import Tier

PROBS = [  # (文明上限, {等级: 概率})
    (2, {Tier.WHITE: 0.60, Tier.BLUE: 0.35, Tier.PURPLE: 0.0, Tier.ORANGE: 0.0, Tier.GOLD: 0.05}),
    (4, {Tier.WHITE: 0.40, Tier.BLUE: 0.40, Tier.PURPLE: 0.12, Tier.ORANGE: 0.0, Tier.GOLD: 0.08}),
    (6, {Tier.WHITE: 0.25, Tier.BLUE: 0.40, Tier.PURPLE: 0.20, Tier.ORANGE: 0.05, Tier.GOLD: 0.10}),
    (10, {Tier.WHITE: 0.15, Tier.BLUE: 0.35, Tier.PURPLE: 0.25, Tier.ORANGE: 0.15, Tier.GOLD: 0.10}),
]
MAX_HELD = {Tier.ORANGE: 2, Tier.GOLD: 2}
REPEAL_COST = 5


def tier_probs(civ):
    for cap, probs in PROBS:
        if civ <= cap:
            return probs
    return PROBS[-1][1]


def _eligible(code, offered):
    held = {law.id for law in code}
    counts = {t: sum(1 for law in code if law.tier == t) for t in Tier}
    return [law for law in LAWS if law.id not in held and law.id not in offered
            and counts[law.tier] < MAX_HELD.get(law.tier, 99)]


def draw_offers(civ, rng, code, n=3) -> list:
    probs = tier_probs(civ)
    tiers = [t for t in Tier if probs[t] > 0]
    weights = [probs[t] for t in tiers]
    offers = []
    for _ in range(n):
        pool = _eligible(code, {law.id for law in offers})
        if not pool:
            break
        tier = rng.choices(tiers, weights)[0]
        cands = [law for law in pool if law.tier == tier]
        if not cands:   # 该等级抽空了：退回任何允许出现的等级
            cands = [law for law in pool if probs[law.tier] > 0] or pool
        offers.append(rng.choice(cands))
    return offers


# ───────────────────────── 自动策略 ─────────────────────────

def strategy_greedy(offers, state, rng):
    if not offers:
        return None
    top = max(law.tier for law in offers)
    return rng.choice([law for law in offers if law.tier == top])


def strategy_cautious(offers, state, rng):
    gold = [law for law in offers if law.tier == Tier.GOLD]
    if gold:
        return gold[0]
    ok = [law for law in offers if law.tier in (Tier.WHITE, Tier.BLUE)]
    if not ok:
        return None
    top = max(law.tier for law in ok)
    return rng.choice([law for law in ok if law.tier == top])


def strategy_greedy_nogold(offers, state, rng):
    """诊断用：greedy 但不拿金卡，看“只堆高级法律、没有裁决原则”时崩得多凶。"""
    return strategy_greedy([law for law in offers if law.tier != Tier.GOLD], state, rng)


def strategy_random(offers, state, rng):
    return rng.choice(offers) if offers else None


STRATEGIES = {"greedy": strategy_greedy, "cautious": strategy_cautious, "random": strategy_random,
              "greedy_nogold": strategy_greedy_nogold}
