"""10 张事件卡。每季概率 0.6 抽一张。"""
from ..model import Action, Trait
from .text import EVENT_TEXT


def _merchant(state, rng, ctx):
    state.merchant = True


def _drought(state, rng, ctx):
    state.water_cap = 5
    state.water = min(state.water, 5)
    state.drought_left = 1          # 本季 + 下季


def _harvest(state, rng, ctx):
    state.harvest = True


def _festival(state, rng, ctx):
    state.festival = True


def _gold(state, rng, ctx):
    state.gold_mine_left = 3


def _stranger(state, rng, ctx):
    from ..engine import new_villager
    v = new_villager(state, rng)
    state.villagers.append(v)
    ctx["joined"].append(v.name)


def _plague(state, rng, ctx):
    cands = [v for v in state.villagers if not v.tortoise]
    if cands:
        v = rng.choice(cands)
        state.villagers.remove(v)
        ctx["left"].append(v.name)
    state.happiness = max(0.0, state.happiness - 5)


def _prophet(state, rng, ctx):
    cands = [v for v in state.villagers if not v.tortoise]
    if cands:
        v = rng.choice(cands)
        if Trait.PIOUS not in v.traits:
            v.traits.append(Trait.PIOUS)
        v.forced = Action.PREACH
        ctx["notes"].append(f"{v.name}自称神明")


def _robot_fault(state, rng, ctx):
    state.robot_malfunction = True


def _oligarch(state, rng, ctx):
    state.extra_offer = True


EVENTS = [
    ("merchant", _merchant), ("drought", _drought), ("harvest", _harvest),
    ("festival", _festival), ("gold", _gold), ("stranger", _stranger),
    ("plague", _plague), ("prophet", _prophet), ("robot_fault", _robot_fault),
    ("oligarch", _oligarch),
]


def draw_event(state, rng, ctx):
    if rng.random() >= 0.6:
        return None
    eid, fn = rng.choice(EVENTS)
    fn(state, rng, ctx)
    return eid, EVENT_TEXT[eid]
