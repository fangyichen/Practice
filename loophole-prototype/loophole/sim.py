"""模拟循环：一局 12 季，每季七步。所有随机都从同一个 random.Random(seed) 取。"""
from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass, field

from .combos import detect_all
from .content.events import draw_event
from .content.laws import LAWS_BY_ID
from .content.text import SEASON, VILLAGE_TYPES, law_label, law_text, traits_text
from .engine import assess, execute, gini, new_villager, settle, start_season
from .expand import expand_code
from .log import SeasonLog, format_season
from .model import Action, BASE_ACTIONS, PHASES, Principle, State, Tier, Trait
from .shop import REPEAL_COST, STRATEGIES, draw_offers
from .tortoise import act_probability, find_contradictions, plan
from .villager import decide, decide_mimic


@dataclass
class GameResult:
    seed: int
    strategy: str
    logs: list
    state: State
    end_reason: str
    village_type: str
    text: str = ""
    compendium: list = field(default_factory=list)

    def summary(self) -> dict:
        s = self.state
        return {
            "seed": self.seed, "strategy": self.strategy, "seasons": len(self.logs),
            "end_reason": self.end_reason, "civ": s.civ, "pop": s.pop,
            "treasury": round(s.treasury, 1), "happiness": round(s.happiness, 1),
            "collapses": s.collapses, "resolutions": s.resolutions,
            "tortoise_acted": s.tortoise_acted, "tortoise_success": s.tortoise_success,
            "robots": len(s.robots), "code": [law.id for law in s.laws],
            "village_type": self.village_type,
            "combos": [c["id"] for c in self.compendium],
            "compendium": [c["text"] for c in self.compendium],
        }


def setup(seed, rng, laws=None, tortoise_traits=None) -> State:
    """人口 6（保证至少一个 TINKERER 和一个 MIMIC）+ 乌龟；村库 20；幸福 60；文明 1；water 10。"""
    state = State()
    while True:
        trait_sets = [sorted(rng.sample(list(Trait), 2)) for _ in range(6)]
        flat = [t for ts in trait_sets for t in ts]
        if Trait.TINKERER in flat and Trait.MIMIC in flat:
            break
    for ts in trait_sets:
        state.villagers.append(new_villager(state, rng, traits=ts))
    tt = tortoise_traits or sorted(rng.sample(list(Trait), 2))
    state.villagers.append(new_villager(state, rng, traits=tt, tortoise=True))
    state.initial_pop = state.pop
    for lid in laws or []:
        _enact(state, LAWS_BY_ID[lid])
    ex = expand_code(state.laws)
    state.contradictions = find_contradictions(ex)
    return state


def _enact(state, law):
    state.laws.append(law)
    if isinstance(law.meta, Principle):
        state.principles.append((law.id, law.meta))


def _repeal(state, lid):
    state.laws = [law for law in state.laws if law.id != lid]
    state.principles = [(i, p) for i, p in state.principles if i != lid]


def _snapshot(state):
    return {"pop": state.pop, "treasury": round(state.treasury, 2),
            "happiness": round(state.happiness, 2), "civ": state.civ}


def _tax_rates(state, ex):
    out = {}
    acts = list(BASE_ACTIONS)
    for act in acts:
        best, laws = 0.0, []
        for v in state.villagers:
            for ph in PHASES:
                a = assess(state, ex, v, act, ph)
                if a.tax > best:
                    best, laws = a.tax, list(a.tax_laws)
        if best > 0:
            out[act.name] = {"rate": round(best, 3), "laws": laws}
    return out


@dataclass
class Pending:
    """一季的前半段（事件 + 商店）已经发生，等玩家立法。"""
    log: SeasonLog
    ectx: dict
    before: dict
    offers: list


def begin_season(state, rng) -> Pending:
    start_season(state)
    before = _snapshot(state)
    ectx = {"joined": [], "left": [], "notes": []}
    log = SeasonLog(season=state.season_idx, season_name=SEASON[state.season])

    # 1. 事件
    ev = draw_event(state, rng, ectx)
    if ev:
        log.event, log.event_text = ev[1]
    log.festival = state.festival

    # 2. 商店
    offers = draw_offers(state.civ, rng, state.laws, 4 if state.extra_offer else 3)
    log.offers = [law.id for law in offers]
    return Pending(log, ectx, before, offers)


def run_season(state, rng, chooser, history, force=None, out=None) -> SeasonLog:
    pending = begin_season(state, rng)
    if force and state.season_idx in force:
        pick = force[state.season_idx]
        choice = ("pick", LAWS_BY_ID[pick]) if pick else ("skip", None)
    else:
        choice = chooser(pending.offers, state, rng)
    return finish_season(state, rng, pending, choice, history, out)


def finish_season(state, rng, pending, choice, history, out=None) -> SeasonLog:
    log, ectx, before = pending.log, pending.ectx, pending.before
    if choice[0] == "pick" and choice[1] is not None:
        _enact(state, choice[1])
        log.chosen = choice[1].id
    elif choice[0] == "repeal" and state.treasury >= REPEAL_COST:
        state.treasury -= REPEAL_COST
        _repeal(state, choice[1])
        log.repealed_by_player = choice[1]

    # 3. 展开法典 + 矛盾检测
    ex = expand_code(state.laws)
    prev = {c.key for c in state.contradictions}
    state.contradictions = find_contradictions(ex)
    log.new_contradiction = any(c.key not in prev and c.key not in state.resolved
                                for c in state.contradictions)
    log.contradictions = [{"key": c.key, "kind": c.kind, "laws": [c.law_a, c.law_b],
                           "situation": [None if x is None else int(x) for x in c.situation]}
                          for c in state.contradictions]
    log.code = [law.id for law in state.laws]

    # 4. 村民行动
    moves, mimic_of = {}, {}
    tort_log = None
    roster = list(state.villagers)
    for v in roster:
        if v.tortoise:
            p = act_probability(state.laws)
            if rng.random() < p:
                pl = plan(state, ex, v)
                moves[v.vid] = pl.moves[0]
                state.tortoise_acted += 1
                if pl.found:
                    state.tortoise_success += 1
                tort_log = {
                    "acted": True, "p": p, "found": pl.found, "score": round(pl.score, 2),
                    "d_wealth": round(pl.d_wealth, 2), "d_happy": round(pl.d_happy, 2),
                    "baseline": round(pl.baseline, 2), "considered": pl.considered,
                    "plan": [[m.action.name for m in pair] for pair in pl.moves],
                    "laws_used": pl.laws_used, "gaps": [g.name for g in pl.gaps],
                    "invoked": pl.invoked,
                }
            else:
                moves[v.vid] = decide(state, ex, v, rng, greedy=True)
                tort_log = {"acted": False, "p": p}
        elif Trait.MIMIC not in v.traits:
            moves[v.vid] = decide(state, ex, v, rng)
    for v in roster:
        if Trait.MIMIC in v.traits and not v.tortoise:
            moves[v.vid], target = decide_mimic(state, ex, v, rng)
            if target is not None:
                t = next((u for u in roster if u.vid == target), None)
                mimic_of[v.vid] = t.name if t else None
    log.tortoise = tort_log

    # 5. 执行与执法
    ctx = execute(state, ex, moves, rng)

    # 6. 结算
    info = settle(state, ex, ctx, rng)
    after_civ = state.civ
    civ_reasons = []
    if ctx.resolutions:
        after_civ += ctx.resolutions
        state.resolutions += ctx.resolutions
        civ_reasons.append(f"化解矛盾 {ctx.resolutions} 次，文明 +{ctx.resolutions}")
    if ctx.collapses:
        after_civ -= ctx.collapses
        state.collapses += ctx.collapses
        state.consecutive_collapse += 1
        civ_reasons.append(f"崩塌 {ctx.collapses} 次，文明 −{ctx.collapses}")
    else:
        state.consecutive_collapse = 0
    good = (state.pop >= state.initial_pop and state.treasury >= state.pop * 3
            and state.happiness >= 50)
    state.good_streak = state.good_streak + 1 if good else 0
    if state.good_streak >= 4:
        after_civ += 1
        state.good_streak = 0
        civ_reasons.append("三资源连续四季达标，文明 +1")

    # 7. 日志 + 组合检测
    names = {v.vid: v.name for v in roster}
    for v in roster:
        mv = moves.get(v.vid)
        if mv is None:
            continue
        log.villagers.append({
            "vid": v.vid, "name": v.name, "traits": [int(t) for t in v.traits],
            "traits_text": traits_text(v.traits), "lawful": Trait.LAWFUL in v.traits,
            "tortoise": v.tortoise, "day": mv[0].action.name, "night": mv[1].action.name,
            "gain": round(ctx.gains.get(v.vid, 0.0), 2),
            "robot_income": round(ctx.robot_income.get(v.vid, 0.0), 2),
            "farmed": bool(ctx.farmed.get(v.vid, False)),
            "laws_hit": list(ctx.laws_hit.get(v.vid, [])),
            "wealth": round(v.wealth, 2), "violations": ctx.violations.get(v.vid, 0),
            "mimic_of": mimic_of.get(v.vid),
        })
    log.robots = len(state.robots)
    log.robots_built = [names[vid] for vid in ctx.built]
    log.robot_output = round(ctx.robot_output, 2)
    log.invocations = ctx.invocations
    log.exiled = ctx.exiled
    log.joined = ectx["joined"] + info["joined"]
    log.left = ectx["left"] + info["left"]
    log.night_drawers = ctx.night_drawers
    log.water_empty = ctx.water_empty
    log.hoard_released = round(ctx.hoard_released, 2)
    log.treasury_income = round(ctx.treasury_income, 2)
    log.tax_rates = _tax_rates(state, ex)
    log.action_counts = dict(ctx.action_counts)
    log.steals = [(names.get(a, "?"), names.get(b, "?"), round(x, 1)) for a, b, x in ctx.steals]
    log.happy_parts = {k: round(v, 2) for k, v in ctx.happy_parts.items()}
    log.reasons = ectx["notes"] + info["reasons"] + ctx.notes
    log.good = good
    log.code = [law.id for law in state.laws]
    history.append(log)

    known = {tuple(k) for k in state.compendium}
    new = []
    for c in detect_all(history):
        if c.key not in known:
            known.add(c.key)
            new.append(c)
            state.compendium.append(c.key)
    if new:
        after_civ += 1
        civ_reasons.append(f"发现 {len(new)} 张新组合卡，文明 +1")
    log.new_combos = [c.to_dict() for c in new]
    state.civ = max(1, min(10, after_civ))
    log.civ_reasons = civ_reasons
    log.after = _snapshot(state)
    log.before = before

    state.last_actions = {vid: (m[0].action, m[1].action) for vid, m in moves.items()}
    state.last_gains = {vid: ctx.gains.get(vid, 0.0) + ctx.robot_income.get(vid, 0.0)
                        for vid in moves}
    state.last_preacher = ctx.preachers[0] if ctx.preachers else None
    state.season_idx += 1
    if out:
        out(format_season(log))
    return log


def classify_village(state, logs, compendium) -> str:
    if state.pop <= 2 or state.happiness <= 20 or state.collapses >= 3:
        return "ruin"
    counts = Counter()
    for log in logs:
        counts.update(log.action_counts)
    total = max(1, sum(counts.values()))
    kinds = Counter(c["id"] for c in compendium)
    score = {
        "robot": 2.0 * len(state.robots) + 4 * kinds["robot_proxy"],
        "merchant": 25 * counts["TRADE"] / total + 4 * (kinds["monopoly"] + kinds["double_tax"])
                    + 10 * gini([v.wealth for v in state.villagers]),
        "prophet": 25 * (counts["PREACH"] + counts["REST"]) / total + 4 * kinds["prophet_village"],
        "artisan": 12 * counts["FARM"] / total
                   + 3 * (kinds["night_well"] + kinds["winter_hoard"] + kinds["law_abiding_poverty"]
                          + kinds["empty_lawbook"]),
    }
    return max(score, key=lambda k: (score[k], k))


def village_history(res: GameResult) -> str:
    s = res.state
    name, blurb = VILLAGE_TYPES[res.village_type]
    L = ["", "━━━━━━━━━━━━━━━━ 村史 ━━━━━━━━━━━━━━━━",
         f"seed={res.seed}  策略={res.strategy}  共 {len(res.logs)} 季  结束原因：{res.end_reason}",
         f"最终：人口 {s.pop}  村库 {s.treasury:.1f}  幸福 {s.happiness:.1f}  文明 {s.civ}  机器人 {len(s.robots)}",
         f"乌龟出手 {s.tortoise_acted} 次，找到漏洞 {s.tortoise_success} 次；崩塌 {s.collapses} 次，化解 {s.resolutions} 次",
         "法典全文："]
    for law in s.laws:
        L.append(f"  {law_label(law)}：{law_text(law)}")
    if not s.laws:
        L.append("  （空）")
    L.append(f"图鉴（{len(res.compendium)}）：")
    for c in res.compendium:
        L.append(f"  第{c['season'] + 1}季 {c['text']}")
    if not res.compendium:
        L.append("  （空）")
    L.append(f"这是一座【{name}】：{blurb}")
    return "\n".join(L)


def auto_chooser(strategy):
    fn = STRATEGIES[strategy]

    def choose(offers, state, rng):
        law = fn(offers, state, rng)
        return ("pick", law) if law else ("skip", None)
    return choose


def end_reason(state):
    if state.pop <= 1:
        return "人口 ≤ 1，村子散了"
    if state.consecutive_collapse >= 2 and state.civ == 1:
        return "文明连续崩塌跌到 1"
    return None


class Game:
    """一局可以一季一季推进的游戏（给网页界面用）。随机序列和 run_game 完全一致。"""

    def __init__(self, seed=42, seasons=12, laws=None):
        self.seed, self.seasons = seed, seasons
        self.rng = random.Random(seed)
        self.state = setup(seed, self.rng, laws)
        self.history = []
        self.result = None
        self.pending = begin_season(self.state, self.rng)

    def step(self, choice):
        log = finish_season(self.state, self.rng, self.pending, choice, self.history)
        reason = end_reason(self.state)
        if reason is None and len(self.history) >= self.seasons:
            reason = f"{self.seasons} 季跑完"
        if reason:
            compendium = [c for lg in self.history for c in lg.new_combos]
            vt = classify_village(self.state, self.history, compendium)
            self.result = GameResult(self.seed, "human", self.history, self.state, reason, vt,
                                     compendium=compendium)
            self.result.text = village_history(self.result)
            self.pending = None
        else:
            self.pending = begin_season(self.state, self.rng)
        return log


def run_game(seed=42, strategy="greedy", seasons=12, laws=None, chooser=None,
             force=None, out=None, tortoise_traits=None) -> GameResult:
    rng = random.Random(seed)
    state = setup(seed, rng, laws, tortoise_traits)
    chooser = chooser or auto_chooser(strategy)
    history = []
    lines = []

    def emit(text):
        lines.append(text)
        if out:
            out(text)

    emit(f"《漏洞》seed={seed} 策略={strategy}")
    emit("村民：" + "，".join(f"{v.name}({traits_text(v.traits)})" for v in state.villagers))
    end = "12 季跑完" if seasons == 12 else f"{seasons} 季跑完"
    for _ in range(seasons):
        run_season(state, rng, chooser, history, force=force, out=emit)
        reason = end_reason(state)
        if reason:
            end = reason
            break
    compendium = [c for log in history for c in log.new_combos]
    vt = classify_village(state, history, compendium)
    res = GameResult(seed, strategy, history, state, end, vt, compendium=compendium)
    emit(village_history(res))
    res.text = "\n".join(lines)
    return res
