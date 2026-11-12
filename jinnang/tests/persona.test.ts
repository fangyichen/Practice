import { describe, expect, it } from "vitest";
import { fixtures, fixedBirth, persona, play, PERSONA_REPLIES, start } from "./helpers";

const PERSONAS = ["INTJ", "ESFP", "ISFJ"] as const;

function runAll(replies: string[]) {
  return PERSONAS.map((m) => play(start(persona(m), "physique", fixedBirth()), replies));
}

describe("人格可分", () => {
  it("固定投生与回复，INTJ / ESFP / ISFJ 在 3 个难题里至少 2 个得到不同的 exec 或结果", () => {
    const runs = runAll(PERSONA_REPLIES);
    const n = runs[0]!.log.length;
    expect(n).toBe(3);
    const rows: string[] = [];
    let differing = 0;
    for (let i = 0; i < n; i++) {
      const cells = runs.map((r) => `${r.log[i]!.exec}/${r.log[i]!.chosen}->${r.log[i]!.outcome}`);
      if (new Set(cells).size > 1) differing++;
      rows.push(`  ${runs[0]!.log[i]!.dilemmaId}\n${PERSONAS.map((m, j) => `    ${m}: ${cells[j]}  (score=${runs[j]!.log[i]!.reasons.find((x) => x.code === "WEIGH")?.score ?? "-"}, trust ${runs[j]!.log[i]!.trustBefore}→${runs[j]!.log[i]!.trustAfter})`).join("\n")}`);
    }
    console.log(`[人格可分] 回复=${JSON.stringify(PERSONA_REPLIES)}，不同的难题 ${differing}/${n}\n${rows.join("\n")}`);
    expect(differing).toBeGreaterThanOrEqual(2);
  });

  it("（统计，不作断言）遍历 fixture 里所有回复组合，人格可分成立的比例", () => {
    const ids = ["matchmaker_call", "county_levy", "cao_marches_south"];
    const pools = ids.map((id) => ["", ...fixtures.dilemmas[id]!.map((e) => e.reply)]);
    let total = 0;
    let pass = 0;
    const dist = [0, 0, 0, 0];
    for (const a of pools[0]!)
      for (const b of pools[1]!)
        for (const c of pools[2]!) {
          const runs = runAll([a, b, c]);
          let differing = 0;
          for (let i = 0; i < 3; i++) {
            const cells = runs.map((r) => (r.log[i] ? `${r.log[i]!.exec}/${r.log[i]!.outcome}` : "-"));
            if (new Set(cells).size > 1) differing++;
          }
          dist[differing]!++;
          total++;
          if (differing >= 2) pass++;
        }
    console.log(`[人格可分·稳健性] ${total} 种回复组合（含沉默），不同难题数 0/1/2/3 的组合数 = ${dist.join("/")}，>=2 的比例 ${((100 * pass) / total).toFixed(1)}%`);
    expect(total).toBeGreaterThan(0);
  });
});
