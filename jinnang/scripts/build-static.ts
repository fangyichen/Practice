/**
 * 把人工测试页打包成一个不需要服务器的单页：dist/jinnang-devtools.html
 *   npm run build:static
 * 输出不含 <html>/<head>/<body> 外壳（发布为网页时由宿主补上），也可直接用浏览器打开。
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../lib/pack";

const out = await build({
  entryPoints: [join(ROOT, "devtools", "browser.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  charset: "utf8",
  legalComments: "none",
});
const bundle = out.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");

const html = readFileSync(join(ROOT, "devtools", "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)![1]!.replace(/<meta[^>]*>\s*/g, "");
const body = html.match(/<body>([\s\S]*?)<\/body>/)![1]!;
const page = `${head.trim()}\n<script>${bundle}</script>\n${body.trim()}\n`;

mkdirSync(join(ROOT, "dist"), { recursive: true });
const file = join(ROOT, "dist", "jinnang-devtools.html");
writeFileSync(file, page);
console.log(`${file}  ${(page.length / 1024).toFixed(0)} KB`);
