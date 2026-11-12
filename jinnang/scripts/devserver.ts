/**
 * 人工测试用的本地服务器（不是 M3 的正式界面）。
 *   npm run dev        → http://localhost:4321
 * 接口逻辑在 devtools/api.ts；同一套逻辑也能打包成不需要服务器的单页（npm run build:static）。
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { FixtureFile } from "../classifier";
import type { ReasonTemplates } from "../engine";
import { createApi, HttpError, type BirthContent } from "../devtools/api";
import { loadContent, loadEraPack, ROOT } from "../lib/pack";

const PORT = Number(process.env.PORT ?? 4321);
const HOST = process.env.HOST ?? "127.0.0.1";
const PAGE = join(ROOT, "devtools", "index.html");

const api = createApi({
  pack: loadEraPack(),
  fixtures: JSON.parse(readFileSync(join(ROOT, "fixtures/replies.json"), "utf8")) as FixtureFile,
  reasonTemplates: loadContent<ReasonTemplates>("reasons"),
  birthContent: loadContent<BirthContent>("birth"),
});

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new HttpError(413, "请求太大"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new HttpError(400, "JSON 格式错误"));
      }
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    const path = req.url ?? "/";
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      return send(res, 200, readFileSync(PAGE, "utf8"), "text/html; charset=utf-8");
    }
    const body = req.method === "POST" ? await readBody(req) : undefined;
    const r = await api.handle(req.method ?? "GET", path, body);
    send(res, r.status, r.body);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    send(res, 500, { error: (e as Error).message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`锦囊 · 人工测试页  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
