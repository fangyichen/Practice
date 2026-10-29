"""核心数据类型：枚举、法律 DSL、村民、世界状态。

所有枚举都用 IntEnum：哈希值与 PYTHONHASHSEED 无关，保证同 seed 跨进程复现。
"""
from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Optional, Union


class Tier(enum.IntEnum):
    WHITE = 1
    BLUE = 2
    PURPLE = 3
    ORANGE = 4
    GOLD = 5


class Action(enum.IntEnum):
    FARM = 1
    TRADE = 2
    DRAW_WATER = 3
    BUILD_ROBOT = 4
    STEAL = 5
    PREACH = 6
    REST = 7
    HOARD = 8
    HIRE = 9      # 橙卡 LABOR_MARKET 解锁
    MINE = 10     # 事件“金矿”解锁
    INVOKE = 11   # 乌龟专用：主动制造矛盾情境


BASE_ACTIONS = (
    Action.FARM, Action.TRADE, Action.DRAW_WATER, Action.BUILD_ROBOT,
    Action.STEAL, Action.PREACH, Action.REST, Action.HOARD,
)


class Phase(enum.IntEnum):
    DAY = 1
    NIGHT = 2


PHASES = (Phase.DAY, Phase.NIGHT)


class Season(enum.IntEnum):
    SPRING = 0
    SUMMER = 1
    AUTUMN = 2
    WINTER = 3


class Trait(enum.IntEnum):
    GREEDY = 1
    LAZY = 2
    LAWFUL = 3
    PIOUS = 4
    TINKERER = 5
    MIMIC = 6


class EntityType(enum.IntEnum):
    HUMAN = 1
    ROBOT = 2
    MERCHANT = 3


class EffectKind(enum.IntEnum):
    FORBID = 1
    REQUIRE = 2
    TAX = 3
    REDIRECT = 4
    MODIFY_GAIN = 5


class Dest(enum.IntEnum):
    OWNER = 1
    EXECUTOR = 2
    TREASURY = 3
    EQUAL_SPLIT = 4


class MetaKind(enum.IntEnum):
    EXPAND_TYPE = 1
    SUSPEND_WHEN = 2
    DOUBLE_FINES = 3
    REPEAT_OFFENDER = 4


class WorldRule(enum.IntEnum):
    WEALTH_IS_FOOD = 1
    LABOR_MARKET = 2
    ANYONE_MAY_CREATE = 3


class Principle(enum.IntEnum):
    LATER_WINS = 1
    STRICTER_WINS = 2
    NO_VICARIOUS = 3


@dataclass(frozen=True)
class Filter:
    """“谁”槽位。None 表示不限。注意 HUMAN 默认不包含 ROBOT。"""
    types: Optional[frozenset] = None
    traits: Optional[frozenset] = None      # 拥有其中任一性格即命中
    min_wealth: Optional[float] = None

    def matches(self, etype, traits, wealth) -> bool:
        if self.types is not None and etype not in self.types:
            return False
        if self.traits is not None and not any(t in self.traits for t in traits):
            return False
        # wealth 为 None 表示“任意财富”（矛盾检测时枚举情境用）
        if self.min_wealth is not None and wealth is not None and wealth < self.min_wealth:
            return False
        return True


@dataclass(frozen=True)
class Effect:
    kind: EffectKind
    fine: float = 0.0
    rate: float = 0.0
    to: Optional[Dest] = None
    delta: float = 0.0


@dataclass(frozen=True)
class MetaRule:
    kind: MetaKind
    seasons: frozenset = frozenset()   # SUSPEND_WHEN
    n: int = 2                          # REPEAT_OFFENDER


@dataclass(frozen=True)
class Law:
    id: str
    name: str
    tier: Tier
    who: Filter = Filter()
    what: Optional[frozenset] = None      # None = ALL
    phases: Optional[frozenset] = None    # “什么时候”槽位里的阶段部分，None = ALL
    seasons: Optional[frozenset] = None   # “什么时候”槽位里的季节部分，None = ALL
    effect: Optional[Effect] = None
    meta: Union[MetaRule, WorldRule, Principle, None] = None
    text: str = ""


@dataclass(frozen=True)
class ConcreteRule:
    """展开后的具体规则：村民、乌龟、矛盾检测只读这个。"""
    law_id: str
    law_name: str
    tier: Tier
    order: int
    who: Filter
    what: Optional[frozenset]
    phases: Optional[frozenset]
    seasons: Optional[frozenset]
    effect: Effect
    suspended: frozenset = frozenset()    # 被 SUSPEND_WHEN 停用的季节

    def hits(self, etype, traits, wealth, action, phase, season) -> bool:
        if season in self.suspended:
            return False
        if self.what is not None and action not in self.what:
            return False
        if self.phases is not None and phase not in self.phases:
            return False
        if self.seasons is not None and season not in self.seasons:
            return False
        return self.who.matches(etype, traits, wealth)


@dataclass
class Expanded:
    rules: list
    robot_cost: int = 6
    labor_market: bool = False
    wealth_is_food: bool = False
    repeat_offender: Optional[int] = None
    repeat_law: Optional[str] = None
    suspend_seasons: frozenset = frozenset()
    suspend_law: Optional[str] = None
    expand_law: Optional[str] = None

    def matching(self, etype, traits, wealth, action, phase, season) -> list:
        return [r for r in self.rules if r.hits(etype, traits, wealth, action, phase, season)]


@dataclass
class Villager:
    vid: int
    name: str
    traits: list
    etype: EntityType = EntityType.HUMAN
    wealth: float = 5.0
    owner: Optional[int] = None
    tortoise: bool = False
    hoard: float = 0.0
    forced: Optional[Action] = None    # 事件“自称神明”


@dataclass(frozen=True)
class Move:
    action: Action
    target: Optional[str] = None       # INVOKE 的矛盾 key


@dataclass(frozen=True)
class Contradiction:
    key: str
    kind: str                # "REQUIRE×FORBID" / "REDIRECT"
    law_a: str               # 较旧
    law_b: str               # 较新
    situation: tuple         # (etype, trait|None, action, phase, season)
    involves_owner: bool
    when: tuple = ()         # 矛盾成立的所有 (phase, season)


@dataclass
class State:
    villagers: list = field(default_factory=list)
    robots: list = field(default_factory=list)
    pending_robots: list = field(default_factory=list)
    season_idx: int = 0
    treasury: float = 20.0
    happiness: float = 60.0
    civ: int = 1
    water: int = 10
    water_cap: int = 10
    drought_left: int = 0
    laws: list = field(default_factory=list)
    principles: list = field(default_factory=list)   # [(law_id, Principle)]
    festival: bool = False
    harvest: bool = False
    merchant: bool = False
    robot_malfunction: bool = False
    gold_mine_left: int = 0
    extra_offer: bool = False
    next_vid: int = 1
    initial_pop: int = 7
    good_streak: int = 0
    collapses: int = 0
    resolutions: int = 0
    consecutive_collapse: int = 0
    last_actions: dict = field(default_factory=dict)
    last_gains: dict = field(default_factory=dict)
    last_preacher: Optional[int] = None
    contradictions: list = field(default_factory=list)
    resolved: list = field(default_factory=list)
    compendium: list = field(default_factory=list)
    tortoise_acted: int = 0
    tortoise_success: int = 0
    name_cursor: int = 0

    @property
    def season(self) -> Season:
        return Season(self.season_idx % 4)

    @property
    def pop(self) -> int:
        return len(self.villagers)

    def villager(self, vid):
        for v in self.villagers:
            if v.vid == vid:
                return v
        return None

    def has_principle(self, p: Principle) -> bool:
        return any(pp == p for _, pp in self.principles)
