import { describe, expect, it } from "vitest";
import { compareRuns, fixtures, fixedBirth, persona, play, PERSONA_REPLIES, start, type Replies } from "./helpers";

const PERSONAS = ["INTJ", "ESFP", "ISFJ"] as const;

function runAll(replies: Replies) {
  return PERSONAS.map((m) => play(start(persona(m), "physique", fixedBirth()), replies));
}

describe("人格可分", () => {
  it("固定投生与回复，INTJ / ESFP / ISFJ 至少在 2 个难题里得到不同的 exec 或结果", () => {
    const runs = runAll(PERSONA_REPLIES);
    const cmp = compareRuns(runs, (r) => `${r.exec}/${r.chosen}->${r.outcome}`);
    const differing = cmp.filter((c) => new Set(c.cells).size > 1).length;
    const rows = cmp.map((c) => `  ${c.id}\n${PERSONAS.map((m, j) => `    ${m}: ${c.cells[j]}`).join("\n")}`);
    console.log(`[人格可分] 不同的难题 ${differing}/${cmp.length}\n${rows.join("\n")}`);
    expect(differing).toBeGreaterThanOrEqual(2);
  });

  it("（统计，不作断言）M0 的三个难题遍历 fixture 回复组合（其余沉默），人格可分成立的比例", () => {
    const ids = ["matchmaker_call", "county_levy", "cao_marches_south"];
    const pools = ids.map((id) => ["", ...fixtures.dilemmas[id]!.map((e) => e.reply)].filter((_, i) => i % 2 === 0));
    let total = 0;
    let pass = 0;
    for (const a of pools[0]!)
      for (const b of pools[1]!)
        for (const c of pools[2]!) {
          const runs = runAll({ [ids[0]!]: a, [ids[1]!]: b, [ids[2]!]: c });
          const differing = compareRuns(runs, (r) => `${r.exec}/${r.outcome}`).filter((x) => new Set(x.cells).size > 1).length;
          total++;
          if (differing >= 2) pass++;
        }
    console.log(`[人格可分·稳健性] ${total} 种回复组合（隔一取一，含沉默），整局里 >=2 个难题不同的比例 ${((100 * pass) / total).toFixed(1)}%`);
    expect(total).toBeGreaterThan(0);
  });
});
