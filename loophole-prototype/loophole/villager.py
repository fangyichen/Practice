"""效用型村民：性格只是效用函数里的权重。贪心、不做多步规划。"""
from __future__ import annotations

from .engine import (
    ENFORCE_P, HIRE_COST, HOARD_AMOUNT, HOARD_PATIENCE, assess, available_actions,
    expected_base, next_season, robot_cost, robot_yield_to_owner, self_share,
)
from .model import Action, Move, Phase, PHASES, Trait

NEG_INF = float("-inf")
# 原型自加：偷窃的良心成本。没有它，无法无天的开局里人人都偷，日志没法看。
STEAL_CONSCIENCE = 3.0
STEAL_CONSCIENCE_GREEDY = 2.5


def weights(traits, greedy=False):
    w_gain, w_pen = 1.0, 1.0
    if Trait.GREEDY in traits or greedy:
        w_gain *= 2
        w_pen *= 0.5
    if Trait.LAWFUL in traits:
        w_pen *= 3
    return w_gain, w_pen


def expected_gain(state, ex, v, action, phase, a=None) -> float:
    a = a or assess(state, ex, v, action, phase)
    if action == Action.BUILD_ROBOT:
        return -robot_cost(v, ex) + robot_yield_to_owner(state, ex, v)
    if action == Action.HOARD:
        nxt = next_season(state.season)
        tax_next = assess(state, ex, v, Action.FARM, Phase.DAY, season=nxt).tax
        return HOARD_PATIENCE * HOARD_AMOUNT * (1 - tax_next)
    gross = max(0.0, expected_base(state, v, action, phase) + a.delta)
    net = gross * (1 - a.tax) * self_share(a, state.pop)
    if action == Action.HIRE:
        net -= HIRE_COST
    return net


def utility(state, ex, v, action, phase, done, rng, greedy=False) -> float:
    a = assess(state, ex, v, action, phase)
    w_gain, w_pen = weights(v.traits, greedy)
    if a.forbidden and Trait.LAWFUL in v.traits:
        return NEG_INF
    u = w_gain * expected_gain(state, ex, v, action, phase, a)
    if a.forbidden:
        u -= w_pen * a.fine * ENFORCE_P
    for _, fine in a.require:
        if action not in done:
            u += fine * w_pen
    if Trait.LAZY in v.traits:
        u += 3 if action == Action.REST else -1
    if Trait.PIOUS in v.traits and action == Action.PREACH:
        u += 3
    if Trait.TINKERER in v.traits and action == Action.BUILD_ROBOT:
        u += 2
    if action == Action.STEAL:
        u -= STEAL_CONSCIENCE_GREEDY if (Trait.GREEDY in v.traits or greedy) else STEAL_CONSCIENCE
    return u + rng.uniform(-0.5, 0.5)


def decide(state, ex, v, rng, greedy=False) -> list:
    """白天、夜里各选 argmax U。"""
    if state.festival and Trait.PIOUS in v.traits:
        return [Move(Action.REST), Move(Action.REST)]
    moves = []
    done = []
    acts = available_actions(state, ex, v)
    for ph in PHASES:
        if ph == Phase.DAY and v.forced is not None:
            best = v.forced
        else:
            best, best_u = Action.FARM, NEG_INF
            for act in acts:
                if act == Action.BUILD_ROBOT and Action.BUILD_ROBOT in done:
                    continue      # 一季只造一台
                u = utility(state, ex, v, act, ph, done, rng, greedy)
                if u > best_u:
                    best, best_u = act, u
        moves.append(Move(best))
        done.append(best)
    return moves


def decide_mimic(state, ex, v, rng) -> tuple:
    """复制上季收益最高者；上季有人宣讲则复制宣讲者。返回 (moves, 模仿对象vid|None)。"""
    target = state.last_preacher
    if target is None and state.last_gains:
        cands = [(g, vid) for vid, g in state.last_gains.items() if vid != v.vid]
        if cands:
            target = max(cands)[1]
    if target is not None and target != v.vid and target in state.last_actions:
        acts = available_actions(state, ex, v)
        copied = [Move(a) for a in state.last_actions[target] if a != Action.INVOKE]
        if len(copied) == 2 and all(m.action in acts for m in copied):
            if Trait.LAWFUL in v.traits and any(
                    assess(state, ex, v, m.action, ph).forbidden for m, ph in zip(copied, PHASES)):
                return decide(state, ex, v, rng), None
            return copied, target
    return decide(state, ex, v, rng), None
