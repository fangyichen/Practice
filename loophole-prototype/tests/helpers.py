import random

from loophole.content.laws import LAWS_BY_ID
from loophole.expand import expand_code
from loophole.model import State, Trait
from loophole.engine import new_villager
from loophole.tortoise import find_contradictions

NO_SHOP = {i: None for i in range(40)}   # 每季都跳过商店，法典保持开局状态


def make_state(law_ids, tortoise_traits=(Trait.GREEDY, Trait.TINKERER), seed=0):
    rng = random.Random(seed)
    s = State()
    for ts in ([Trait.LAZY, Trait.LAWFUL], [Trait.PIOUS, Trait.MIMIC], [Trait.GREEDY, Trait.LAWFUL]):
        s.villagers.append(new_villager(s, rng, traits=list(ts)))
    t = new_villager(s, rng, traits=list(tortoise_traits), tortoise=True)
    s.villagers.append(t)
    for lid in law_ids:
        law = LAWS_BY_ID[lid]
        s.laws.append(law)
        if law.tier == 5:
            s.principles.append((lid, law.meta))
    ex = expand_code(s.laws)
    s.contradictions = find_contradictions(ex)
    return s, ex, t
