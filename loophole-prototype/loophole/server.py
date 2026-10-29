"""本地网页服务：python -m loophole serve，然后打开 http://127.0.0.1:8000

纯标准库。界面在 ui/ 目录；游戏状态只存在这个进程的内存里。
"""
from __future__ import annotations

import json
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .content.laws import LAWS_BY_ID
from .content.text import traits_text
from .sim import Game, _snapshot

UI_DIR = Path(__file__).resolve().parent.parent / "ui"
HTML_HEAD = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
             '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
             '</head><body>\n')
TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
         ".json": "application/json; charset=utf-8", ".png": "image/png"}

GAMES: dict = {}
LOCK = threading.Lock()


def villagers_view(state):
    return [{"vid": v.vid, "name": v.name, "traits_text": traits_text(v.traits),
             "wealth": round(v.wealth, 2), "tortoise": v.tortoise} for v in state.villagers]


def pending_view(game):
    p = game.pending
    if p is None:
        return None
    s = game.state
    return {"season": p.log.season, "season_name": p.log.season_name, "festival": p.log.festival,
            "event": p.log.event, "event_text": p.log.event_text, "offers": p.log.offers,
            "code": [law.id for law in s.laws], "before": _snapshot(s),
            "villagers": villagers_view(s), "robots": len(s.robots) + len(s.pending_robots)}


def result_view(game):
    r = game.result
    if r is None:
        return None
    return {"summary": r.summary(), "text": r.text}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):   # 安静一点
        pass

    def _send(self, code, body: bytes, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), TYPES[".json"])

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/ping":
            return self._json(200, {"ok": True})
        name = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        f = (UI_DIR / name).resolve()
        if UI_DIR not in f.parents or not f.is_file():
            return self._send(404, b"not found", "text/plain")
        data = f.read_bytes()
        if f.suffix == ".html":
            return self._send(200, HTML_HEAD.encode() + data, "text/html; charset=utf-8")
        self._send(200, data, TYPES.get(f.suffix, "application/octet-stream"))

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            req = json.loads(self.rfile.read(n) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "请求不是合法的 JSON"})
        if self.path == "/api/new":
            laws = [x for x in req.get("laws", []) if x in LAWS_BY_ID]
            game = Game(seed=int(req.get("seed", 42)), laws=laws)
            gid = secrets.token_hex(6)
            with LOCK:
                GAMES[gid] = game
            return self._json(200, {"game": gid, "seed": game.seed, "init_laws": laws,
                                    "pending": pending_view(game)})
        if self.path == "/api/step":
            game = GAMES.get(req.get("game"))
            if game is None or game.pending is None:
                return self._json(404, {"error": "这局游戏不存在或已经结束，请新开一局"})
            kind = req.get("choice", "skip")
            lid = req.get("law")
            if kind == "pick" and lid in game.pending.log.offers:
                choice = ("pick", LAWS_BY_ID[lid])
            elif kind == "repeal" and any(law.id == lid for law in game.state.laws):
                choice = ("repeal", lid)
            else:
                choice = ("skip", None)
            with LOCK:
                log = game.step(choice)
            return self._json(200, {"log": log.to_dict(), "pending": pending_view(game),
                                    "result": result_view(game)})
        self._json(404, {"error": "没有这个接口"})


def serve(host="127.0.0.1", port=8000):
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"《漏洞》界面已启动：http://{host}:{port}  （Ctrl+C 退出）")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
