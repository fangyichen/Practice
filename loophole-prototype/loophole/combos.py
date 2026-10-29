"""组合卡检测器。只读 SeasonLog 历史，不读内部状态——可对跑完的局回放检测。

新增检测器：写一个类，加进 REGISTRY 即可，不需要改模拟器。
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from .content.laws import LAWS_BY_ID
from .model import Dest, EffectKind, MetaKind, MetaRule, Tier


@dataclass
class Combo:
    detector_id: str
    name: str
    rarity: int
    law_ids: tuple
    villager: str | None
    season: int

    @property
    def key(self):
        return (self.detector_id, self.law_ids, self.villager or "")

    def text(self):
        parts = [f"{lid}《{LAWS_BY_ID[lid].name}》" for lid in self.law_ids if lid in LAWS_BY_ID]
        if self.villager:
            parts.append(f"村民{self.villager}")
        tier = {1: "白", 2: "蓝", 3: "紫", 4: "橙", 5: "金"}[self.rarity]
        return f"《{self.name}》[{tier}] —— " + (" × ".join(parts) if parts else "（法典空白）")

    def to_dict(self):
        return {"id": self.detector_id, "name": self.name, "rarity": self.rarity,
                "laws": list(self.law_ids), "villager": self.villager,
                "season": self.season, "text": self.text()}


def _rarity(law_ids, floor=Tier.WHITE):
    tiers = [LAWS_BY_ID[i].tier for i in law_ids if i in LAWS_BY_ID]
    return int(max(tiers + [floor]))


def _top_laws(laws, n=2):
    c = Counter(laws)
    return tuple(sorted(lid for lid, _ in c.most_common(n)))


class Detector:
    id = ""
    name = ""
    floor = Tier.WHITE

    def make(self, law_ids, villager, season):
        law_ids = tuple(sorted(set(law_ids)))
        return Combo(self.id, self.name, _rarity(law_ids, self.floor), law_ids, villager, season)

    def check(self, history) -> list:
        raise NotImplementedError


class RobotProxy(Detector):
    id, name = "robot_proxy", "机器人代工"

    def check(self, history):
        log = history[-1]
        owner_laws = [lid for lid in log.code if LAWS_BY_ID[lid].effect is not None
                      and LAWS_BY_ID[lid].effect.kind == EffectKind.REDIRECT
                      and LAWS_BY_ID[lid].effect.to == Dest.OWNER]
        out = []
        for v in log.villagers:
            if not v["farmed"] and v["robot_income"] >= 6:
                extra = [lid for lid in v["laws_hit"] if lid not in owner_laws][:1]
                out.append(self.make(owner_laws + extra, v["name"], log.season))
        return out


class Monopoly(Detector):
    id, name = "monopoly", "垄断"

    def check(self, history):
        if len(history) < 3:
            return []
        last3 = history[-3:]
        out = []
        for v in last3[-1].villagers:
            ok = True
            for log in last3:
                total = sum(max(0.0, u["gain"] + u["robot_income"]) for u in log.villagers)
                mine = next((max(0.0, u["gain"] + u["robot_income"]) for u in log.villagers
                             if u["name"] == v["name"]), 0.0)
                if total <= 0 or mine < 0.5 * total:
                    ok = False
                    break
            if ok:
                out.append(self.make(_top_laws(v["laws_hit"]), v["name"], last3[-1].season))
        return out


class NightWell(Detector):
    id, name = "night_well", "月光井"

    def check(self, history):
        log = history[-1]
        if log.night_drawers >= 3 and log.water_empty:
            laws = [lid for v in log.villagers if v["night"] == "DRAW_WATER" for lid in v["laws_hit"]]
            return [self.make(_top_laws(laws), None, log.season)]
        return []


class ProphetVillage(Detector):
    id, name = "prophet_village", "先知村"

    def check(self, history):
        log = history[-1]
        n = len(log.villagers)
        idle = [v for v in log.villagers if v["day"] in ("PREACH", "REST") and v["night"] in ("PREACH", "REST")]
        preached = any("PREACH" in (v["day"], v["night"]) for v in log.villagers)
        if n and preached and len(idle) * 2 >= n:
            laws = [lid for v in idle for lid in v["laws_hit"]]
            mimics = [v for v in idle if v.get("mimic_of")]
            who = mimics[0]["mimic_of"] if mimics else None
            return [self.make(_top_laws(laws), who, log.season)]
        return []


class WinterHoard(Detector):
    id, name = "winter_hoard", "冬藏"

    def check(self, history):
        log = history[-1]
        suspend = [lid for lid in log.code if isinstance(LAWS_BY_ID[lid].meta, MetaRule)
                   and LAWS_BY_ID[lid].meta.kind == MetaKind.SUSPEND_WHEN]
        if log.season_name == "冬" and suspend and log.hoard_released > 0 \
                and log.hoard_released >= log.treasury_income:
            taxes = [lid for lid in log.code if LAWS_BY_ID[lid].effect is not None
                     and LAWS_BY_ID[lid].effect.kind == EffectKind.TAX][:1]
            return [self.make(suspend + taxes, None, log.season)]
        return []


class LawAbidingPoverty(Detector):
    id, name = "law_abiding_poverty", "清贫"

    def check(self, history):
        log = history[-1]
        lawful = [v for v in log.villagers if v["lawful"]]
        others = [v for v in log.villagers if not v["lawful"]]
        if lawful and len(others) >= 2 and max(v["wealth"] for v in lawful) < min(v["wealth"] for v in others):
            forbids = [lid for lid in log.code if LAWS_BY_ID[lid].effect is not None
                       and LAWS_BY_ID[lid].effect.kind == EffectKind.FORBID]
            if forbids:
                return [self.make(forbids[:2], lawful[0]["name"], log.season)]
        return []


class ExileCascade(Detector):
    id, name = "exile_cascade", "驱逐潮"
    floor = Tier.PURPLE

    def check(self, history):
        log = history[-1]
        if len(log.exiled) >= 2:
            laws = [lid for lid in log.code if lid == "p04" or (LAWS_BY_ID[lid].effect is not None
                    and LAWS_BY_ID[lid].effect.kind in (EffectKind.FORBID, EffectKind.REQUIRE))]
            return [self.make(laws[:3], None, log.season)]
        return []


class TortoiseFoiled(Detector):
    id, name = "tortoise_foiled", "乌龟碰壁"
    floor = Tier.GOLD

    def check(self, history):
        log = history[-1]
        return [self.make(inv["laws"] + [inv["principle"]], None, log.season)
                for inv in log.invocations if inv["outcome"] == "resolved"]


class DoubleTax(Detector):
    id, name = "double_tax", "苛税"

    def check(self, history):
        log = history[-1]
        out = []
        for act, info in log.tax_rates.items():
            if info["rate"] >= 0.8 and len(info["laws"]) >= 2 and log.action_counts.get(act, 0) == 0:
                out.append(self.make(info["laws"], None, log.season))
        return out


class EmptyLawbook(Detector):
    id, name = "empty_lawbook", "无为而治"

    def check(self, history):
        if len(history) < 4:
            return []
        last4 = history[-4:]
        if all(len(log.code) <= 2 and log.good for log in last4):
            return [self.make(last4[-1].code, None, last4[-1].season)]
        return []


REGISTRY = [RobotProxy(), Monopoly(), NightWell(), ProphetVillage(), WinterHoard(),
            LawAbidingPoverty(), ExileCascade(), TortoiseFoiled(), DoubleTax(), EmptyLawbook()]


def detect_all(history) -> list:
    out = []
    for d in REGISTRY:
        out.extend(d.check(history))
    return out
