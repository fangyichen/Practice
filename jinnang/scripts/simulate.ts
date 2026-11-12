/**
 * M0 模拟：随机投生、随机人格、每个难题从 fixture 里随机取一条回复（或沉默）。
 * 用法：tsx scripts/simulate.ts [--n 2000] [--seed sim]
 * 随机只发生在本脚本里（选人格、选回复）和投生；引擎结算本身是确定性的。
 * 留痕分布属于 M1，这里只统计 exec、结果、死亡与听从率。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureClassifier, type FixtureFile } from "../classifier";
import { createRng } from "../engine/rng";
import { MockLetterWriter } from "../letters";
import { newGame, playTurn } from "../lib/game";
import { loadContent, loadEraPack, ROOT } from "../lib/pack";
import { createPersona, pickOnboardingQuestions } from "../engine";
import type { OnboardingQuestion } from "../engine/traits";
import { ENDOWMENT_KEYS, EXECS } from "../schemas";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? dflt) : dflt;
}

const N = Number(arg("n", "2000"));
const rng = createRng(`sim:${arg("seed", "sim")}`);
const pack = loadEraPack();
const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures/replies.json"), "utf8")) as FixtureFile;
const bank = loadContent<OnboardingQuestion[]>("onboarding");
const deps = { pack, classifier: new FixtureClassifier(fixtures), writer: new MockLetterWriter() };
const LETTERS = ["EI", "NS", "TF", "JP"];

const execCount: Record<string, number> = Object.fromEntries(EXECS.map((e) => [e, 0]));
const perDilemma: Record<string, Record<string, number>> = {};
const outcomeCount: Record<string, number> = {};
const byCarry: Record<string, { n: number; alive: number }> = {};
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
      const reply = rng.next() < 0.15 ? "" : (rng.pick(pool).reply ?? "");
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
    if (!s.twin.alive) deaths++;
    byCarry[carry] ??= { n: 0, alive: 0 };
    byCarry[carry]!.n++;
    if (s.twin.alive) byCarry[carry]!.alive++;
  }

  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  console.log(`模拟 ${N} 局，共 ${turns} 封信`);
  console.log(`死亡 ${deaths}（${pct(deaths, N)}）；替身照做（DONE/PARTIAL/ATTEMPT_FAILED）${pct(followed, turns)}`);
  console.log("\nexec 分布：");
  for (const e of EXECS) console.log(`  ${e.padEnd(16)} ${String(execCount[e]).padStart(6)}  ${pct(execCount[e] ?? 0, turns)}`);
  console.log("\n各难题 exec：");
  for (const [d, m] of Object.entries(perDilemma)) console.log(`  ${d}: ${JSON.stringify(m)}`);
  console.log("\n结果出现次数：");
  for (const [o, n] of Object.entries(outcomeCount).sort((a, b) => b[1] - a[1])) console.log(`  ${o.padEnd(28)} ${n}`);
  console.log("\n按「带一样过去」分组的卷末存活率：");
  for (const [k, v] of Object.entries(byCarry)) console.log(`  ${k.padEnd(9)} ${pct(v.alive, v.n)}  (n=${v.n})`);
}

main();
