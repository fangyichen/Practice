/**
 * 模拟：随机投生、随机人格、每个难题从 fixture 里随机取一条回复（或沉默）。
 * 用法：tsx scripts/simulate.ts [--n 10000] [--seed sim] [--brief]
 * 随机只发生在本脚本里（选人格、选回复）和投生；引擎结算本身是确定性的。
 * 输出 M1 的验收指标：留痕分布、前 3 个难题的死亡、「带一样过去」是否有占优项、结局重复率。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureClassifier, type FixtureFile } from "../classifier";
import { createRng } from "../engine/rng";
import { MockLetterWriter } from "../letters";
import { newGame, playTurn } from "../lib/game";
import { loadContent, loadEraPack, ROOT } from "../lib/pack";
import { countChars, createPersona, pickOnboardingQuestions } from "../engine";
import type { OnboardingQuestion } from "../engine/traits";
import { ENDOWMENT_KEYS, EXECS } from "../schemas";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? dflt) : dflt;
}

const N = Number(arg("n", "10000"));
const BRIEF = process.argv.includes("--brief");
const rng = createRng(`sim:${arg("seed", "sim")}`);
const pack = loadEraPack();
const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures/replies.json"), "utf8")) as FixtureFile;
const bank = loadContent<OnboardingQuestion[]>("onboarding");
const deps = { pack, classifier: new FixtureClassifier(fixtures), writer: new MockLetterWriter() };
const LETTERS = ["EI", "NS", "TF", "JP"];

const execCount: Record<string, number> = Object.fromEntries(EXECS.map((e) => [e, 0]));
const perDilemma: Record<string, Record<string, number>> = {};
const outcomeCount: Record<string, number> = {};
const byCarry: Record<string, { n: number; alive: number; t1: number }> = {};
const tierCount = [0, 0, 0, 0];
const epitaphCount: Record<string, number> = {};
const endings = new Map<string, number>();
const pathLen: Record<number, number> = {};
const deathAt: Record<string, number> = {};
let earlyDeaths = 0;
let deaths = 0;
let turns = 0;
let followed = 0;

async function main() {
  for (let g = 0; g < N; g++) {
    const mbti = rng.next() < 0.15 ? undefined : LETTERS.map((p) => p[rng.int(0, 1)]).join("");
    const qs = pickOnboardingQuestions(bank, `sim${g}`);
    const persona = createPersona({ mbti, answers: qs.map((q) => ({ question: q, choice: rng.int(0, q.choices.length - 1) })) });
    const carry = rng.pick(ENDOWMENT_KEYS);
    let s = await newGame({ persona, carry, gender: rng.next() < 0.5 ? "m" : "f", seed: `sim-${g}` }, deps);
    while (s.pendingDilemma) {
      const id = s.pendingDilemma.dilemmaId;
      const pool = fixtures.dilemmas[id] ?? [];
      let reply = rng.next() < 0.15 ? "" : (rng.pick(pool).reply ?? "");
      if (countChars(reply) > s.charBudgetLeft) reply = ""; // 字数用尽只能沉默
      const q = pack.dilemmas.find((d) => d.id === id)?.personaQuestion;
      const personaAnswer = q && rng.next() < 0.7 ? rng.int(0, q.choices.length - 1) : null;
      s = await playTurn(s, { reply, personaAnswer }, deps);
    }
    for (const r of s.log) {
      turns++;
      execCount[r.exec] = (execCount[r.exec] ?? 0) + 1;
      perDilemma[r.dilemmaId] ??= {};
      perDilemma[r.dilemmaId]![r.exec] = (perDilemma[r.dilemmaId]![r.exec] ?? 0) + 1;
      outcomeCount[r.outcome] = (outcomeCount[r.outcome] ?? 0) + 1;
      if (["DONE", "PARTIAL", "ATTEMPT_FAILED"].includes(r.exec)) followed++;
    }
    if (!s.twin.alive) {
      deaths++;
      const last = s.log.at(-1)!;
      deathAt[last.dilemmaId] = (deathAt[last.dilemmaId] ?? 0) + 1;
      if (s.log.length <= 3) earlyDeaths++;
    } else {
      pathLen[s.log.length] = (pathLen[s.log.length] ?? 0) + 1;
    }
    const e = s.ending!;
    tierCount[e.tier]!++;
    epitaphCount[e.epitaphRule] = (epitaphCount[e.epitaphRule] ?? 0) + 1;
    const k = `${e.record}|${e.epitaph}`;
    endings.set(k, (endings.get(k) ?? 0) + 1);
    byCarry[carry] ??= { n: 0, alive: 0, t1: 0 };
    byCarry[carry]!.n++;
    if (s.twin.alive) byCarry[carry]!.alive++;
    if (e.tier >= 1) byCarry[carry]!.t1++;
  }

  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  console.log(`模拟 ${N} 局，共 ${turns} 封信`);
  console.log(`死亡 ${deaths}（${pct(deaths, N)}）；替身照做（DONE/PARTIAL/ATTEMPT_FAILED）${pct(followed, turns)}`);
  console.log(`前 3 个难题内的死亡：${earlyDeaths}`);
  console.log(`死在哪个难题：${JSON.stringify(deathAt)}`);
  console.log(`活到卷末的局，一局经历的难题数：${JSON.stringify(pathLen)}`);
  console.log("\n留痕等级（目标约 70 / 22 / 7 / <1）：");
  const TARGET = ["约 70%", "约 22%", "约 7%", "低于 1%"];
  tierCount.forEach((n, t) => console.log(`  T${t}  ${pct(n, N).padStart(6)}   目标 ${TARGET[t]}`));
  const dup = [...endings.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  console.log(`\n结局重复率（record + epitaph 与别的局完全相同）：${pct(dup, N)}（目标 < 5%）；不同的结局 ${endings.size} 种`);
  console.log(`墓志规则命中：${JSON.stringify(Object.fromEntries(Object.entries(epitaphCount).sort((a, b) => b[1] - a[1])))}`);
  console.log("\n「带一样过去」分组（两项各自的极差都应 ≤ 15 个百分点）：");
  const rows = Object.entries(byCarry).map(([k, v]) => ({ k, alive: (100 * v.alive) / v.n, t1: (100 * v.t1) / v.n, n: v.n }));
  for (const r of rows) console.log(`  ${r.k.padEnd(9)} 卷末存活 ${r.alive.toFixed(1)}%   T1 以上 ${r.t1.toFixed(1)}%   (n=${r.n})`);
  for (const [name, key] of [["存活", "alive"], ["T1 以上", "t1"]] as const) {
    const vals = rows.map((r) => r[key]);
    const spread = Math.max(...vals) - Math.min(...vals);
    const top = rows.find((r) => r[key] === Math.max(...vals))!.k;
    console.log(`  ${name}极差 ${spread.toFixed(1)} 个百分点${spread > 15 ? `  ← 超标，占优项：${top}` : ""}`);
  }
  if (BRIEF) return;
  console.log("\nexec 分布：");
  for (const e of EXECS) console.log(`  ${e.padEnd(16)} ${String(execCount[e]).padStart(6)}  ${pct(execCount[e] ?? 0, turns)}`);
  console.log("\n各难题 exec：");
  for (const [d, m] of Object.entries(perDilemma)) console.log(`  ${d}: ${JSON.stringify(m)}`);
  console.log("\n结果出现次数：");
  for (const [o, n] of Object.entries(outcomeCount).sort((a, b) => b[1] - a[1])) console.log(`  ${o.padEnd(28)} ${n}`);
}

main();
