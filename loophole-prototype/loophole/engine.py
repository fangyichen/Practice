"""动作结算引擎：收益、税、REDIRECT、执法、矛盾裁决、季末结算。

模拟循环（sim.py）和乌龟的前瞻模拟（tortoise.py）共用这一套代码，
所以乌龟“看到”的后果和真实结算完全一致。
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field

from .content.text import NAMES, ACTION
from .model import (
    Action, BASE_ACTIONS, Dest, EffectKind, EntityType, Phase, PHASES, Principle,
    Season, State, Trait, Villager,
)

ENFORCE_P = 0.8
FARM_BASE = 3
HOARD_AMOUNT = 3
HOARD_PATIENCE = 0.9
HIRE_COST = 2
HIRE_YIELD = 6
MINE_YIELD = 6


# ───────────────────────── 实体 ─────────────────────────

def new_villager(state: State, rng, traits=None, tortoise=False) -> Villager:
    if traits is None:
        traits = rng.sample(list(Trait), 2)
        traits.sort()
    if tortoise:
        name = "乌龟"
    else:
        name = NAMES[state.name_cursor % len(NAMES)]
        if state.name_cursor >= len(NAMES):
            name += str(state.name_cursor // len(NAMES) + 1)
        state.name_cursor += 1
    v = Villager(vid=state.next_vid, name=name, traits=list(traits),
                 wealth=float(rng.randint(3, 8)), tortoise=tortoise)
    state.next_vid += 1
    return v


def robot_cost(v, ex) -> int:
    return 0 if Trait.TINKERER in v.traits else ex.robot_cost


def gini(values) -> float:
    xs = sorted(max(0.0, x) for x in values)
    n = len(xs)
    total = sum(xs)
    if n == 0 or total <= 0:
        return 0.0
    cum = sum((i + 1) * x for i, x in enumerate(xs))
    return (2 * cum) / (n * total) - (n + 1) / n


# ───────────────────────── 规则评估 ─────────────────────────

@dataclass
class Assessment:
    delta: float = 0.0
    tax: float = 0.0
    tax_laws: list = field(default_factory=list)
    dest: Dest = Dest.EXECUTOR
    dest_law: str | None = None
    forbidden: bool = False
    fine: float = 0.0
    forbid_laws: list = field(default_factory=list)
    require: list = field(default_factory=list)   # [(law_id, fine)]
    laws: list = field(default_factory=list)


def assess(state: State, ex, ent, action, phase, season=None) -> Assessment:
    season = state.season if season is None else season
    a = Assessment()
    for r in ex.matching(ent.etype, ent.traits, ent.wealth, action, phase, season):
        e = r.effect
        a.laws.append(r.law_id)
        if e.kind == EffectKind.FORBID:
            a.forbidden = True
            a.fine += e.fine
            a.forbid_laws.append(r.law_id)
        elif e.kind == EffectKind.REQUIRE:
            a.require.append((r.law_id, e.fine))
        elif e.kind == EffectKind.TAX:
            a.tax += e.rate
            a.tax_laws.append(r.law_id)
        elif e.kind == EffectKind.REDIRECT:
            a.dest = e.to          # 冲突时代码顺序靠后的生效（矛盾检测会报告）
            a.dest_law = r.law_id
        elif e.kind == EffectKind.MODIFY_GAIN:
            a.delta += e.delta
    a.tax = min(1.0, a.tax)
    if a.dest == Dest.OWNER and (ent.owner is None or state.has_principle(Principle.NO_VICARIOUS)):
        a.dest = Dest.EXECUTOR
    return a


def self_share(a: Assessment, pop: int) -> float:
    if a.dest == Dest.EXECUTOR:
        return 1.0
    if a.dest == Dest.EQUAL_SPLIT:
        return 1.0 / max(1, pop)
    return 0.0


def expected_base(state: State, v, action, phase) -> float:
    """村民决策时对动作毛收益的预期（不含法律修正）。"""
    if action == Action.FARM:
        return FARM_BASE + (2 if state.harvest else 0)
    if action == Action.TRADE:
        return 8 if state.merchant else 2       # 没有商人时不确定有没有对手
    if action == Action.DRAW_WATER:
        return (1 + (1 if phase == Phase.NIGHT else 0)) if state.water > 0 else 0
    if action == Action.STEAL:
        return 4
    if action == Action.MINE:
        return MINE_YIELD
    if action == Action.HIRE:
        return 0 if state.has_principle(Principle.NO_VICARIOUS) else HIRE_YIELD
    return 0


def robot_yield_to_owner(state: State, ex, owner) -> float:
    """如果 owner 现在有一台机器人，一季能给他带来多少。"""
    probe = Villager(vid=-1, name="probe", traits=[], etype=EntityType.ROBOT, wealth=0, owner=owner.vid)
    total = 0.0
    for ph in PHASES:
        a = assess(state, ex, probe, Action.FARM, ph)
        if a.forbidden or a.dest != Dest.OWNER:
            continue
        total += max(0.0, FARM_BASE + (2 if state.harvest else 0) + a.delta) * (1 - a.tax)
    return total


def next_season(season: Season) -> Season:
    return Season((season + 1) % 4)


def available_actions(state: State, ex, v) -> list:
    acts = []
    for act in BASE_ACTIONS:
        if act == Action.BUILD_ROBOT and v.wealth < robot_cost(v, ex):
            continue
        if act == Action.STEAL and not any(u is not v and u.wealth > 0 for u in state.villagers):
            continue
        acts.append(act)
    if ex.labor_market and v.wealth >= HIRE_COST and state.pop > 1:
        acts.append(Action.HIRE)
    if state.gold_mine_left > 0:
        acts.append(Action.MINE)
    return acts


# ───────────────────────── 执行 ─────────────────────────

@dataclass
class SeasonCtx:
    gains: dict = field(default_factory=lambda: defaultdict(float))
    robot_income: dict = field(default_factory=lambda: defaultdict(float))
    farmed: dict = field(default_factory=lambda: defaultdict(bool))
    performed: dict = field(default_factory=lambda: defaultdict(list))
    laws_hit: dict = field(default_factory=lambda: defaultdict(list))
    violations: dict = field(default_factory=lambda: defaultdict(int))
    violated_laws: dict = field(default_factory=lambda: defaultdict(list))
    action_counts: Counter = field(default_factory=Counter)
    treasury_income: float = 0.0
    happy: float = 0.0
    happy_parts: dict = field(default_factory=lambda: defaultdict(float))
    night_drawers: int = 0
    water_empty: bool = False
    hoard_released: float = 0.0
    hoard_by: dict = field(default_factory=lambda: defaultdict(float))
    preachers: list = field(default_factory=list)
    built: list = field(default_factory=list)
    steals: list = field(default_factory=list)      # (thief, victim, amount)
    invocations: list = field(default_factory=list)
    exiled: list = field(default_factory=list)
    robot_output: float = 0.0
    fines: float = 0.0
    collapses: int = 0
    resolutions: int = 0
    notes: list = field(default_factory=list)


def _income(state, ctx, amount):
    state.treasury += amount
    ctx.treasury_income += amount


def _happy(ctx, amount, why):
    ctx.happy += amount
    ctx.happy_parts[why] += amount


def _violation(state, ctx, v, law_ids, fine, rng):
    if rng.random() >= ENFORCE_P:
        return
    paid = min(fine, max(0.0, v.wealth))
    v.wealth -= paid
    _income(state, ctx, paid)
    ctx.fines += paid
    ctx.violations[v.vid] += len(law_ids)
    ctx.violated_laws[v.vid].extend(law_ids)


def _distribute(state, ctx, ent, gross, a: Assessment):
    if gross <= 0:
        return
    tax = gross * a.tax
    if tax:
        _income(state, ctx, tax)
    rest = gross - tax
    if a.dest == Dest.EXECUTOR:
        if ent.etype != EntityType.ROBOT:
            ent.wealth += rest
            ctx.gains[ent.vid] += rest
        # 机器人自己的收益：凭空消失
    elif a.dest == Dest.OWNER:
        owner = state.villager(ent.owner)
        if owner is not None:
            owner.wealth += rest
            if ent.etype == EntityType.ROBOT:
                ctx.robot_income[owner.vid] += rest
            else:
                ctx.gains[owner.vid] += rest
    elif a.dest == Dest.TREASURY:
        _income(state, ctx, rest)
    elif a.dest == Dest.EQUAL_SPLIT:
        share = rest / max(1, state.pop)
        for u in state.villagers:
            u.wealth += share
            ctx.gains[u.vid] += share


def _invoke(state, ctx, v, key):
    from .tortoise import adjudicator   # 避免循环导入
    c = next((c for c in state.contradictions if c.key == key), None)
    if c is None:
        return
    etype, trait, action, phase, _ = c.situation
    rec = {"key": c.key, "kind": c.kind, "laws": [c.law_a, c.law_b],
           "situation": [int(etype), None if trait is None else int(trait), int(action),
                         int(phase), int(state.season)], "by": v.name}
    adj = adjudicator(state.principles, c)
    if adj is not None:
        rec.update(outcome="resolved", principle=adj[0])
        state.resolved.append(c.key)
        ctx.resolutions += 1
    else:
        rec.update(outcome="collapse", repealed=c.law_b)
        _happy(ctx, -25, "崩塌")
        ctx.collapses += 1
        state.laws = [law for law in state.laws if law.id != c.law_b]
        state.principles = [(lid, p) for lid, p in state.principles if lid != c.law_b]
    ctx.invocations.append(rec)


def _perform(state, ex, ctx, v, move, phase, traders, rng):
    act = move.action
    ctx.performed[v.vid].append(act)
    ctx.action_counts[act.name] += 1
    if act == Action.INVOKE:
        _invoke(state, ctx, v, move.target)
        return
    a = assess(state, ex, v, act, phase)
    ctx.laws_hit[v.vid].extend(a.laws)
    if act == Action.BUILD_ROBOT:
        cost = robot_cost(v, ex)
        if v.wealth < cost:
            ctx.notes.append(f"{v.name}想造机器人但钱不够")
            return
        if a.forbidden:
            _violation(state, ctx, v, a.forbid_laws, a.fine, rng)
        v.wealth -= cost
        ctx.gains[v.vid] -= cost
        robot = Villager(vid=state.next_vid, name=f"{v.name}的机器人", traits=[],
                         etype=EntityType.ROBOT, wealth=0.0, owner=v.vid)
        state.next_vid += 1
        state.pending_robots.append(robot)
        ctx.built.append(v.vid)
        return
    if a.forbidden:
        _violation(state, ctx, v, a.forbid_laws, a.fine, rng)

    gross = 0.0
    if act == Action.FARM:
        gross = FARM_BASE + (2 if state.harvest else 0) + a.delta
        _income(state, ctx, 1)                # 粮食入库：人口可持续性
        ctx.farmed[v.vid] = True
    elif act == Action.TRADE:
        base = 8 if state.merchant else (4 if traders >= 2 else 1)
        gross = base + a.delta
        _income(state, ctx, 1)
    elif act == Action.DRAW_WATER:
        if phase == Phase.NIGHT:
            ctx.night_drawers += 1
        if state.water > 0:
            state.water -= 1
            gross = 1 + (1 if phase == Phase.NIGHT else 0) + a.delta
            if state.water == 0 and not ctx.water_empty:
                ctx.water_empty = True
                _happy(ctx, -5, "水井见底")
    elif act == Action.STEAL:
        victims = [u for u in state.villagers if u is not v and u.wealth > 0]
        if victims:
            victim = rng.choice(victims)
            amt = min(4.0, victim.wealth)
            victim.wealth -= amt
            ctx.gains[victim.vid] -= amt
            ctx.steals.append((v.vid, victim.vid, amt))
            _happy(ctx, -3, "失窃")
            gross = amt + a.delta
    elif act == Action.REST:
        _happy(ctx, 1, "休息")
        gross = a.delta
    elif act == Action.PREACH:
        ctx.preachers.append(v.vid)
        gross = a.delta
    elif act == Action.HOARD:
        v.hoard += HOARD_AMOUNT
        return
    elif act == Action.MINE:
        gross = MINE_YIELD + a.delta
        _happy(ctx, -1, "挖矿")
    elif act == Action.HIRE:
        others = [u for u in state.villagers if u is not v]
        if v.wealth < HIRE_COST or not others:
            return
        worker = rng.choice(others)
        v.wealth -= HIRE_COST
        worker.wealth += HIRE_COST
        ctx.gains[v.vid] -= HIRE_COST
        ctx.gains[worker.vid] += HIRE_COST
        gross = 0 if state.has_principle(Principle.NO_VICARIOUS) else HIRE_YIELD + a.delta
    _distribute(state, ctx, v, max(0.0, gross), a)


def _robot_farm(state, ex, ctx, robot, phase):
    if state.robot_malfunction:
        return
    a = assess(state, ex, robot, Action.FARM, phase)
    if a.forbidden:            # 机器人严格守法：被禁止就不干
        return
    gross = max(0.0, FARM_BASE + (2 if state.harvest else 0) + a.delta)
    _income(state, ctx, 1)
    ctx.robot_output += gross
    if robot.owner is not None:
        ctx.laws_hit[robot.owner].extend(a.laws)
    _distribute(state, ctx, robot, gross, a)


def execute(state: State, ex, moves: dict, rng) -> SeasonCtx:
    """按 白天→夜间 顺序结算所有动作。moves: vid -> [Move(day), Move(night)]"""
    ctx = SeasonCtx()
    # 上季囤的货在本季释放，按本季的农税计税（冬休时免税）
    for v in state.villagers:
        if v.hoard > 0:
            amt, v.hoard = v.hoard, 0.0
            a = assess(state, ex, v, Action.FARM, Phase.DAY)
            tax = amt * a.tax
            if tax:
                _income(state, ctx, tax)
            v.wealth += amt - tax
            ctx.gains[v.vid] += amt - tax
            ctx.hoard_released += amt
            ctx.hoard_by[v.vid] += amt
    for idx, phase in enumerate(PHASES):
        traders = sum(1 for v in state.villagers
                      if v.vid in moves and moves[v.vid][idx].action == Action.TRADE)
        for v in list(state.villagers):
            mv = moves.get(v.vid)
            if mv is None or state.villager(v.vid) is None:
                continue
            _perform(state, ex, ctx, v, mv[idx], phase, traders, rng)
        for robot in state.robots:
            _robot_farm(state, ex, ctx, robot, phase)
    # REQUIRE：本季没做被要求的动作 → 罚
    req_acts = sorted({a for r in ex.rules if r.effect.kind == EffectKind.REQUIRE
                       for a in (r.what if r.what is not None else BASE_ACTIONS)})
    for v in list(state.villagers) if req_acts else []:
        reqs = {}
        for act in req_acts:
            for ph in PHASES:
                for lid, fine in assess(state, ex, v, act, ph).require:
                    reqs.setdefault(lid, (act, fine))
        done = ctx.performed.get(v.vid, [])
        for lid, (act, fine) in reqs.items():
            if act not in done:
                _violation(state, ctx, v, [lid], fine, rng)
    # 三振出局
    if ex.repeat_offender:
        for v in list(state.villagers):
            if not v.tortoise and ctx.violations.get(v.vid, 0) >= ex.repeat_offender:
                state.villagers.remove(v)
                ctx.exiled.append(v.name)
    return ctx


# ───────────────────────── 结算 ─────────────────────────

def settle(state: State, ex, ctx: SeasonCtx, rng, lookahead=False) -> dict:
    """季末结算：供养、幸福、人口。返回原因说明。"""
    info = {"reasons": [], "joined": [], "left": []}
    pop = state.pop
    upkeep = pop * 1
    fed = state.treasury >= upkeep
    if fed:
        state.treasury -= upkeep
        _happy(ctx, 2, "温饱")
    else:
        state.treasury = 0.0
        _happy(ctx, -10, "饥饿")
        info["reasons"].append("村库养不起人，闹饥荒")
    g = gini([v.wealth for v in state.villagers])
    _happy(ctx, -round(10 * g, 2), "不公")
    if any(r.effect.kind == EffectKind.REDIRECT and r.effect.to == Dest.EQUAL_SPLIT
           and state.season not in r.suspended for r in ex.rules):
        _happy(ctx, 3, "平分")
    if state.festival:
        _happy(ctx, 5, "节日")
    state.happiness = max(0.0, min(100.0, state.happiness + ctx.happy))
    info["gini"] = g
    if lookahead:
        return info
    # 人口进出
    if ex.wealth_is_food:
        grow = state.treasury >= state.pop * 3
        shrink = state.treasury < state.pop
    else:
        grow = state.happiness >= 60 and state.treasury >= state.pop * 2
        shrink = state.happiness <= 30
    if grow and rng.random() < 0.5:
        v = new_villager(state, rng)
        state.villagers.append(v)
        info["joined"].append(v.name)
    if shrink and rng.random() < 0.5:
        cands = [v for v in state.villagers if not v.tortoise]
        if cands:
            v = rng.choice(cands)
            state.villagers.remove(v)
            info["left"].append(v.name)
    return info


def start_season(state: State):
    """新季开始：机器人入列，井水回满，季节性标记复位。"""
    state.robots.extend(state.pending_robots)
    state.pending_robots = []
    # 主人离开的机器人报废
    alive = {v.vid for v in state.villagers}
    state.robots = [r for r in state.robots if r.owner in alive]
    if state.drought_left > 0:
        state.water_cap = 5
        state.drought_left -= 1
    else:
        state.water_cap = 10
    state.water = state.water_cap
    state.festival = state.harvest = state.merchant = state.robot_malfunction = False
    state.extra_offer = False
    if state.gold_mine_left > 0:
        state.gold_mine_left -= 1
    for v in state.villagers:
        v.forced = None


def action_name(a) -> str:
    return ACTION[a]
