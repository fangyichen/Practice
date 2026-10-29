"""跑验收实验，把结果写进 results/。用法：python experiments/run_all.py"""
from __future__ import annotations

import json
import sys
from collections import Counter
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from loophole.__main__ import summarize          # noqa: E402
from loophole.content.text import VILLAGE_TYPES  # noqa: E402
from loophole.log import write_jsonl             # noqa: E402
from loophole.sim import run_game                # noqa: E402

OUT = ROOT / "results"
NO_SHOP = {i: None for i in range(40)}


def _one(args):
    seed, strategy = args
    return run_game(seed=seed, strategy=strategy).summary()


def save_run(name, res, laws=None):
    (OUT / f"{name}.txt").write_text(res.text + "\n", encoding="utf-8")
    write_jsonl(OUT / f"{name}.jsonl", {"seed": res.seed, "strategy": res.strategy, "laws": laws or []},
                res.logs, res.summary())


def main():
    OUT.mkdir(exist_ok=True)
    # 1. 示例局
    save_run("run_seed42_greedy", run_game(seed=42, strategy="greedy"))
    save_run("run_seed42_random", run_game(seed=42, strategy="random"))
    # 2. 设计中埋的场景
    scen = {
        "scenario_b08_w04": dict(laws=["b08", "w04"]),
        "scenario_b08_w04_g02": dict(laws=["b08", "w04", "g02"]),
        "scenario_b01": dict(laws=["w01", "b01"]),
        "scenario_b01_b10_p01": dict(laws=["w01", "b01", "b10", "p01"]),
        "scenario_b05_w10_p01": dict(laws=["w01", "b05", "w10", "p01"]),
        "scenario_p02_b03": dict(laws=["w01", "p02", "b03"]),
    }
    for name, kw in scen.items():
        save_run(name, run_game(seed=1, force=NO_SHOP, **kw), kw["laws"])

    # 3. 批量：三种策略各 20 局（seed 0–19），random 再加到 60 局看村子类型
    jobs = [(s, st) for st in ("greedy", "cautious", "random") for s in range(20)]
    jobs += [(s, "random") for s in range(20, 60)]
    jobs += [(s, "greedy_nogold") for s in range(20)]
    with Pool() as pool:
        rows = pool.map(_one, jobs)
    by = {"greedy": rows[0:20], "cautious": rows[20:40], "random": rows[40:60]}
    random60 = rows[40:100]
    nogold = rows[100:120]
    lines = []
    for st, rs in by.items():
        lines.append(summarize(st, rs))
        (OUT / f"batch_{st}_20.json").write_text(json.dumps(rs, ensure_ascii=False, indent=1), encoding="utf-8")
    lines.append(summarize("random（60 局）", random60))
    (OUT / "batch_random_60.json").write_text(json.dumps(random60, ensure_ascii=False, indent=1), encoding="utf-8")
    lines.append(summarize("greedy_nogold（诊断）", nogold))
    (OUT / "batch_greedy_nogold_20.json").write_text(json.dumps(nogold, ensure_ascii=False, indent=1), encoding="utf-8")
    types_all = Counter(r["village_type"] for r in rows[:60])
    lines.append("三种策略合计 60 局村子类型：" + "，".join(f"{VILLAGE_TYPES[k][0]}×{v}" for k, v in types_all.most_common()))
    (OUT / "batch_summary.txt").write_text("\n\n".join(lines) + "\n", encoding="utf-8")
    print("\n\n".join(lines))


if __name__ == "__main__":
    main()
