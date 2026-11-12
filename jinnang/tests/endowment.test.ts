import { describe, expect, it } from "vitest";
import { ENDOWMENT_KEYS, EXECS, type EndowmentKey, type Traits } from "../schemas";
import { fixedBirth, fixtures, persona, personaFromTraits, play, PERSONA_REPLIES, start } from "./helpers";

const SETS: { label: string; carry: EndowmentKey; base: { physique: number; wit: number; looks: number } }[] = [
  { label: "体魄见长", carry: "physique", base: { physique: 70, wit: 40, looks: 40 } },
  { label: "机敏见长", carry: "wit", base: { physique: 40, wit: 70, looks: 40 } },
  { label: "相貌见长", carry: "looks", base: { physique: 40, wit: 40, looks: 70 } },
];

describe("禀赋可分", () => {
  it("固定人格（ESFP）与回复，三组禀赋至少在 2 个难题里得到不同结果", () => {
    const runs = SETS.map((e) => play(start(persona("ESFP"), e.carry, fixedBirth({ baseEndowments: e.base })), PERSONA_REPLIES));
    const n = runs[0]!.log.length;
    const rows: string[] = [];
    let differing = 0;
    for (let i = 0; i < n; i++) {
      const cells = runs.map((r) => `${r.log[i]!.exec}/${r.log[i]!.chosen}->${r.log[i]!.outcome}`);
      if (new Set(runs.map((r) => r.log[i]!.outcome)).size > 1) differing++;
      rows.push(`  ${runs[0]!.log[i]!.dilemmaId}\n${SETS.map((e, j) => `    ${e.label}: ${cells[j]}`).join("\n")}`);
    }
    console.log(`[禀赋可分] 人格=ESFP，回复=${JSON.stringify(PERSONA_REPLIES)}，结果不同的难题 ${differing}/${n}\n${rows.join("\n")}`);
    expect(differing).toBeGreaterThanOrEqual(2);
  });

  it("枚举测试中 DONE、PARTIAL、ATTEMPT_FAILED、DECLINED_UNABLE、UNWILLING 全部出现", () => {
    const seen: Record<string, number> = Object.fromEntries(EXECS.map((e) => [e, 0]));
    const levels = [10, 50, 90];
    const replySets = [
      ["去相看", "托人说情", "随皇叔走"],
      ["娶同村的", "照册应役", "留下别走"],
      ["先立业后成家", "花钱雇人代役", "进山躲躲"],
      ["成家", "躲", "走"],
      ["", "哈哈哈", ""],
    ];
    const bases = [
      { physique: 10, wit: 70, looks: 70 },
      { physique: 70, wit: 10, looks: 70 },
      { physique: 70, wit: 70, looks: 10 },
      { physique: 50, wit: 50, looks: 50 },
    ];
    let runs = 0;
    for (const bold of levels)
      for (const imp of [10, 50, 90])
        for (const skep of [0, 50, 100])
          for (const root of [10, 90]) {
            const traits: Traits = { boldness: bold, impulsiveness: imp, skepticism: skep, rootedness: root, loyalty: 50, sociability: 50 };
            for (const base of bases)
              for (const carry of ENDOWMENT_KEYS) {
                if (base[carry] > 79) continue;
                for (const station of ["smallholder", "peddler"])
                  for (const replies of replySets) {
                    const s = play(start(personaFromTraits(traits), carry, fixedBirth({ baseEndowments: base, station })), replies);
                    for (const r of s.log) seen[r.exec] = (seen[r.exec] ?? 0) + 1;
                    runs++;
                  }
              }
          }
    console.log(`[禀赋枚举] ${runs} 局，exec 出现次数 ${JSON.stringify(seen)}`);
    for (const e of ["DONE", "PARTIAL", "ATTEMPT_FAILED", "DECLINED_UNABLE", "UNWILLING"]) {
      expect(seen[e], e).toBeGreaterThan(0);
    }
  });

  it("（统计，不作断言）遍历 fixture 里所有回复组合，禀赋可分成立的比例", () => {
    const ids = ["matchmaker_call", "county_levy", "cao_marches_south"];
    const pools = ids.map((id) => ["", ...fixtures.dilemmas[id]!.map((e) => e.reply)]);
    const dist = [0, 0, 0, 0];
    let total = 0;
    for (const a of pools[0]!)
      for (const b of pools[1]!)
        for (const c of pools[2]!) {
          const runs = SETS.map((e) => play(start(persona("ESFP"), e.carry, fixedBirth({ baseEndowments: e.base })), [a, b, c]));
          let differing = 0;
          for (let i = 0; i < 3; i++) if (new Set(runs.map((r) => r.log[i]?.outcome ?? "-")).size > 1) differing++;
          dist[differing]!++;
          total++;
        }
    const pass = dist[2]! + dist[3]!;
    console.log(`[禀赋可分·稳健性] ${total} 种回复组合（含沉默），结果不同的难题数 0/1/2/3 的组合数 = ${dist.join("/")}，>=2 的比例 ${((100 * pass) / total).toFixed(1)}%`);
    expect(total).toBeGreaterThan(0);
  });
});
