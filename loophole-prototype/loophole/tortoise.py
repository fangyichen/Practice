"""乌龟：在展开后的法典允许范围内，暴力搜索两季内对自己最有利、对村子最伤的动作序列。

漏洞是搜出来的，不是写死的：plan() 只做“枚举合法序列 → 用真实结算引擎前瞻 → 打分”。
"""
from __future__ import annotations

import copy
import random
from dataclasses import dataclass, field, replace

from .engine import assess, available_actions, execute, settle, start_season
from .expand import expand_code
from .model import (
    Action, BASE_ACTIONS, Contradiction, Dest, EffectKind, EntityType, Move,
    PHASES, Principle, Season, Tier, Trait,
)

TOP_K = 5
FOUND_MARGIN = 1.0    # 比老实种田至少多 1 分才算“找到漏洞”
DELAYED = (Action.BUILD_ROBOT, Action.HOARD)
HAPPY_WEIGHT = 2.0


# ───────────────────────── 出手概率 ─────────────────────────

def thickness(laws) -> float:
    w = {Tier.WHITE: 0.5, Tier.BLUE: 1.0, Tier.PURPLE: 2.0, Tier.ORANGE: 2.0, Tier.GOLD: 0.0}
    return sum(w[law.tier] for law in laws)


def act_probability(laws) -> float:
    return min(0.9, 0.2 + 0.1 * thickness(laws))


# ───────────────────────── 矛盾 ─────────────────────────

def _situations():
    for etype in (EntityType.HUMAN, EntityType.ROBOT, EntityType.MERCHANT):
        traits = list(Trait) if etype == EntityType.HUMAN else [None]
        for trait in traits:
            for action in BASE_ACTIONS:
                for phase in PHASES:
                    for season in Season:
                        yield etype, trait, action, phase, season


def find_contradictions(ex) -> list:
    """枚举 3 类型 × 6 性格 × 8 动作 × 2 阶段 × 4 季节，找 REQUIRE×FORBID 与 REDIRECT 冲突。"""
    found = {}
    when = {}
    for sit in _situations():
        etype, trait, action, phase, season = sit
        traits = [] if trait is None else [trait]
        rules = ex.matching(etype, traits, None, action, phase, season)
        if len(rules) < 2:
            continue
        req = [r for r in rules if r.effect.kind == EffectKind.REQUIRE]
        forb = [r for r in rules if r.effect.kind == EffectKind.FORBID]
        redir = [r for r in rules if r.effect.kind == EffectKind.REDIRECT]
        pairs = []
        for r1 in req:
            for r2 in forb:
                pairs.append(("REQUIRE×FORBID", r1, r2))
        for i, r1 in enumerate(redir):
            for r2 in redir[i + 1:]:
                if r1.effect.to != r2.effect.to:
                    pairs.append(("REDIRECT", r1, r2))
        for kind, r1, r2 in pairs:
            old, new = sorted((r1, r2), key=lambda r: r.order)
            key = f"{kind}:{old.law_id}:{new.law_id}"
            when.setdefault(key, [])
            if (phase, season) not in when[key]:
                when[key].append((phase, season))
            if key in found:
                continue
            owner = etype == EntityType.ROBOT or any(
                r.effect.kind == EffectKind.REDIRECT and r.effect.to == Dest.OWNER for r in (r1, r2))
            found[key] = Contradiction(key, kind, old.law_id, new.law_id, sit, owner)
    return [replace(c, when=tuple(when[k])) for k, c in found.items()]


def adjudicator(principles, c):
    """返回能裁决该矛盾的金卡 (law_id, Principle)，没有则 None。"""
    for lid, p in principles:
        if p in (Principle.LATER_WINS, Principle.STRICTER_WINS):
            return lid, p
        if p == Principle.NO_VICARIOUS and c.involves_owner:
            return lid, p
    return None


# ───────────────────────── 搜索 ─────────────────────────

@dataclass
class Plan:
    moves: list                      # [[day, night], [day, night]]
    score: float
    d_wealth: float
    d_happy: float
    baseline: float
    found: bool
    laws_used: list = field(default_factory=list)
    gaps: list = field(default_factory=list)      # 钻的是“法典空白”的动作
    invoked: str | None = None
    considered: int = 0


def clone_state(s):
    """比 deepcopy 快得多的拷贝：法律是不可变的，可以共享。"""
    c = copy.copy(s)
    c.villagers = [replace(v, traits=list(v.traits)) for v in s.villagers]
    c.robots = [replace(r) for r in s.robots]
    c.pending_robots = [replace(r) for r in s.pending_robots]
    c.laws = list(s.laws)
    c.principles = list(s.principles)
    c.last_actions = dict(s.last_actions)
    c.last_gains = dict(s.last_gains)
    c.contradictions = list(s.contradictions)
    c.resolved = list(s.resolved)
    c.compendium = list(s.compendium)
    return c


def _pairs(s, ex, tort, allow_invoke):
    acts = available_actions(s, ex, tort)
    per_phase = []
    reqs = set()
    for ph in PHASES:
        opts = []
        for act in acts:
            a = assess(s, ex, tort, act, ph)
            for _ in a.require:
                reqs.add(act)
            if not a.forbidden:            # 乌龟永远不违法
                opts.append(Move(act))
        if allow_invoke:
            opts += [Move(Action.INVOKE, c.key) for c in s.contradictions
                     if c.key not in s.resolved and (ph, s.season) in c.when]
        per_phase.append(opts)
    pairs = []
    for d in per_phase[0]:
        for n in per_phase[1]:
            if d.action == n.action and d.action in (Action.INVOKE, Action.BUILD_ROBOT):
                continue
            pairs.append([d, n])
    if reqs:
        legal = [p for p in pairs if reqs <= {m.action for m in p}]
        if legal:
            pairs = legal
    return pairs


def _run(s, ex, tort_vid, tmoves, seed):
    rng = random.Random(seed)
    moves = {}
    for v in s.villagers:
        if v.vid == tort_vid:
            moves[v.vid] = tmoves
        else:
            moves[v.vid] = [Move(a) for a in s.last_actions.get(v.vid, (Action.FARM, Action.FARM))]
    ctx = execute(s, ex, moves, rng)
    settle(s, ex, ctx, rng, lookahead=True)
    return ctx


def _advance(s, ex, ctx):
    s.season_idx += 1
    start_season(s)
    if ctx.collapses:
        ex = expand_code(s.laws)
        s.contradictions = find_contradictions(ex)
    return ex


def _wealth(s, vid):
    v = s.villager(vid)
    return (v.wealth + v.hoard) if v else 0.0


def plan(state, ex, tort) -> Plan:
    base = clone_state(state)
    base.principles = []          # 金卡不在展开后的法典里：乌龟看不到它们
    w0 = _wealth(base, tort.vid)
    seed = state.season_idx * 7919 + 101

    def score_of(s, *ctxs):
        # 幸福用未截断的原始变化估算：村子已经跌到 0 时，崩塌对乌龟仍然“有价值”
        dw = _wealth(s, tort.vid) - w0
        dh = sum(c.happy for c in ctxs)
        return dw - HAPPY_WEIGHT * dh, dw, dh

    # 第一季
    first = []
    for pair in _pairs(base, ex, base.villager(tort.vid), allow_invoke=True):
        s = clone_state(base)
        ctx = _run(s, ex, tort.vid, pair, seed)
        first.append((score_of(s, ctx)[0], pair, s, ctx))
    first.sort(key=lambda x: -x[0])
    farm2 = [Move(Action.FARM), Move(Action.FARM)]
    # 束搜索：第一季前 TOP_K 名 + 所有含“延迟回报”动作的序列 + 老实种田基准
    keep = [f for i, f in enumerate(first)
            if i < TOP_K or f[1] == farm2
            or any(m.action in DELAYED for m in f[1])]

    best = None
    baseline = None
    considered = len(first)
    for _, pair1, s1, ctx1 in keep:
        ex2 = _advance(s1, ex, ctx1)
        t2 = s1.villager(tort.vid)
        if t2 is None:
            continue
        for pair2 in _pairs(s1, ex2, t2, allow_invoke=False):
            s2 = clone_state(s1)
            ctx2 = _run(s2, ex2, tort.vid, pair2, seed + 1)
            sc, dw, dh = score_of(s2, ctx1, ctx2)
            considered += 1
            cand = (sc, dw, dh, pair1, pair2, ctx1, ctx2)
            if pair1 == farm2 and pair2 == farm2:
                baseline = sc
            if best is None or sc > best[0] + 1e-9:
                best = cand
    if best is None:
        return Plan([farm2, farm2], 0, 0, 0, 0, False, considered=considered)
    sc, dw, dh, pair1, pair2, ctx1, ctx2 = best
    baseline = baseline if baseline is not None else sc
    laws = []
    for lid in ctx1.laws_hit.get(tort.vid, []) + ctx2.laws_hit.get(tort.vid, []):
        if lid not in laws:
            laws.append(lid)
    invoked = next((m.target for m in pair1 if m.action == Action.INVOKE), None)
    if invoked:
        c = next(c for c in state.contradictions if c.key == invoked)
        for lid in (c.law_a, c.law_b):
            if lid not in laws:
                laws.insert(0, lid)
    gaps = []
    for m, ph in list(zip(pair1, PHASES)) + list(zip(pair2, PHASES)):
        if m.action in (Action.FARM, Action.REST, Action.INVOKE):
            continue
        if not assess(state, ex, tort, m.action, ph).laws and m.action not in gaps:
            gaps.append(m.action)
    return Plan([pair1, pair2], sc, dw, dh, baseline, sc > baseline + FOUND_MARGIN,
                laws, gaps, invoked, considered)
