"""CLI：python -m loophole run / batch / replay"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

from .combos import REGISTRY, detect_all
from .content.laws import LAWS_BY_ID
from .content.text import VILLAGE_TYPES, law_label, law_text
from .log import format_season, read_jsonl, write_jsonl
from .sim import run_game


def human_chooser(offers, state, rng):
    print("\n本季法案：")
    for i, law in enumerate(offers, 1):
        print(f"  {i}. {law_label(law)}：{law_text(law)}")
    print(f"  s. 跳过    r <id>. 花 5 财富废除一条（村库 {state.treasury:.1f}）")
    while True:
        try:
            cmd = input("> ").strip()
        except EOFError:
            return ("skip", None)
        if cmd == "s":
            return ("skip", None)
        if cmd.startswith("r "):
            lid = cmd[2:].strip()
            if any(law.id == lid for law in state.laws):
                return ("repeal", lid)
            print("法典里没有这条")
            continue
        if cmd.isdigit() and 1 <= int(cmd) <= len(offers):
            return ("pick", offers[int(cmd) - 1])
        print("输入 1-%d / s / r <id>" % len(offers))


def cmd_run(args):
    laws = [x for x in (args.laws or "").split(",") if x]
    chooser = None if args.auto else human_chooser
    res = run_game(seed=args.seed, strategy=args.strategy if args.auto else "human",
                   seasons=args.seasons, laws=laws, chooser=chooser, out=print)
    if args.jsonl:
        write_jsonl(args.jsonl, {"seed": args.seed, "strategy": res.strategy, "laws": laws},
                    res.logs, res.summary())
        print(f"\n日志已导出：{args.jsonl}")


def batch(strategy, n, seed, seasons=12):
    results = [run_game(seed=seed + i, strategy=strategy, seasons=seasons) for i in range(n)]
    return [r.summary() for r in results]


def summarize(strategy, rows) -> str:
    n = len(rows)
    combos = Counter(c for r in rows for c in r["combos"])
    acted = sum(r["tortoise_acted"] for r in rows)
    success = sum(r["tortoise_success"] for r in rows)
    calm = [r for r in rows if r["collapses"] == 0]
    types = Counter(r["village_type"] for r in rows)
    L = [f"策略 {strategy}：{n} 局",
         f"  平均文明 {sum(r['civ'] for r in rows) / n:.2f}"
         f"（无崩塌局 {len(calm)} 局，平均文明 {sum(r['civ'] for r in calm) / max(1, len(calm)):.2f}）",
         f"  崩塌总数 {sum(r['collapses'] for r in rows)}（{sum(1 for r in rows if r['collapses'])} 局发生过），"
         f"化解 {sum(r['resolutions'] for r in rows)}",
         f"  平均幸福 {sum(r['happiness'] for r in rows) / n:.1f}，平均人口 {sum(r['pop'] for r in rows) / n:.1f}，"
         f"提前结束 {sum(1 for r in rows if r['seasons'] < 12)} 局",
         f"  乌龟出手 {acted} 次，找到漏洞 {success} 次，成功率 {success / max(1, acted):.0%}",
         f"  组合卡种类 {len(combos)}/{len(REGISTRY)}：" + "，".join(f"{k}×{v}" for k, v in combos.most_common()),
         "  村子类型：" + "，".join(f"{VILLAGE_TYPES[k][0]}×{v}" for k, v in types.most_common())]
    return "\n".join(L)


def cmd_batch(args):
    rows = batch(args.strategy, args.n, args.seed, args.seasons)
    print(summarize(args.strategy, rows))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)


def cmd_replay(args):
    header, logs, footer = read_jsonl(args.path)
    print(f"重放 seed={header['seed']} 策略={header['strategy']}，共 {len(logs)} 季")
    history, seen = [], set()
    for log in logs:
        history.append(log)
        if args.verbose:
            print(format_season(log))
        for c in detect_all(history):
            if c.key not in seen:
                seen.add(c.key)
                print(f"  第{log.season + 1}季 {c.text()}")
    print(f"重跑组合检测：{len(seen)} 个图鉴条目（原局记录 {len(footer['compendium'])} 个）")


def cmd_serve(args):
    from .server import serve
    serve(args.host, args.port)


def main(argv=None):
    p = argparse.ArgumentParser(prog="loophole")
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--seed", type=int, default=42)
    r.add_argument("--auto", action="store_true", help="用自动立法策略代替人")
    r.add_argument("--strategy", default="greedy", choices=["greedy", "cautious", "random", "greedy_nogold"])
    r.add_argument("--seasons", type=int, default=12)
    r.add_argument("--laws", help="开局法典，逗号分隔，如 b08,w04")
    r.add_argument("--jsonl", help="导出 JSONL 日志")
    b = sub.add_parser("batch")
    b.add_argument("--strategy", default="greedy", choices=["greedy", "cautious", "random", "greedy_nogold"])
    b.add_argument("--n", type=int, default=20)
    b.add_argument("--seed", type=int, default=0)
    b.add_argument("--seasons", type=int, default=12)
    b.add_argument("--json", help="把每局汇总写成 JSON")
    rp = sub.add_parser("replay")
    rp.add_argument("path")
    rp.add_argument("-v", "--verbose", action="store_true")
    sv = sub.add_parser("serve", help="启动像素风网页界面")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8000)
    args = p.parse_args(argv)
    {"run": cmd_run, "batch": cmd_batch, "replay": cmd_replay, "serve": cmd_serve}[args.cmd](args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
