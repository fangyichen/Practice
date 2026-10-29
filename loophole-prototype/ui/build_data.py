"""生成 ui/data.js：法律表 + 几局录像（界面在没有本地服务时用它回放）。

用法：python ui/build_data.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from loophole.content.laws import LAWS, LAWS_BY_ID      # noqa: E402
from loophole.content.text import law_text              # noqa: E402
from loophole.server import pending_view                # noqa: E402
from loophole.sim import Game, auto_chooser             # noqa: E402

DEMOS = [
    ("theft", "偷窃潮", "第一季立了农税，没人立禁偷。乌龟带头偷，模仿者跟着偷。", 42, "greedy", []),
    ("collapse", "布道与禁言", "开局就有《法定布道》和《禁宣讲》。乌龟会怎么利用这对矛盾？", 1, None, ["b08", "w04"]),
    ("foiled", "从严", "同一对矛盾，这次法典里多了一张金卡《从严》。", 1, None, ["b08", "w04", "g02"]),
    ("robots", "机器人村", "《产出归造物者》一立，造物者们开始造机器人。", 1, None, ["w01", "b01"]),
    ("meta", "机器人也是人", "三条单独看都没问题的法律，加上一条元法律以后……", 1, None, ["w01", "b05", "w10", "p01"]),
    ("random", "随手立法", "每季随便挑一张，看看会长出什么。", 11, "random", []),
]


def record(seed, strategy, laws):
    g = Game(seed=seed, laws=laws)
    chooser = auto_chooser(strategy) if strategy else None
    frames = []
    while g.pending is not None:
        pend = pending_view(g)
        choice = chooser(g.pending.offers, g.state, g.rng) if chooser else ("skip", None)
        log = g.step(choice)
        frames.append({"pending": pend, "log": log.to_dict()})
    return frames, {"summary": g.result.summary(), "text": g.result.text}


def main():
    data = {
        "laws": [{"id": law.id, "name": law.name, "tier": int(law.tier), "text": law_text(law)}
                 for law in LAWS],
        "demos": [],
    }
    for did, title, blurb, seed, strategy, laws in DEMOS:
        frames, result = record(seed, strategy, laws)
        data["demos"].append({"id": did, "title": title, "blurb": blurb, "seed": seed,
                              "strategy": strategy or "跳过商店", "init_laws": laws,
                              "frames": frames, "result": result})
    out = Path(__file__).resolve().parent / "data.js"
    out.write_text("window.LOOPHOLE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":"))
                   + ";\n", encoding="utf-8")
    print(f"写入 {out}（{out.stat().st_size // 1024} KB）")


if __name__ == "__main__":
    main()
