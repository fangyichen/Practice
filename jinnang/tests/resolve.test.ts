import { describe, expect, it } from "vitest";
import { renderReason, resolveTurn, step } from "../engine";
import { loadContent } from "../lib/pack";
import type { Classification, Traits } from "../schemas";
import { fixedBirth, pack, personaFromTraits, play, start } from "./helpers";

const T = (o: Partial<Traits>): Traits => ({ boldness: 50, loyalty: 50, impulsiveness: 50, rootedness: 50, skepticism: 50, sociability: 50, ...o });
const sure = (id: string): Classification => ({ dist: { [id]: 1 }, source: "fixture" });
const templates = loadContent<Parameters<typeof renderReason>[2]>("reasons");

/** 两封沉默，走到 208 年去留那一题 */
function toCao(traits: Traits, base = { physique: 50, wit: 30, looks: 50 }, station = "smallholder") {
  let s = start(personaFromTraits(traits), "looks", fixedBirth({ baseEndowments: base, station }));
  s = step(s, { reply: "", classification: null }, pack);
  s = step(s, { reply: "", classification: null }, pack);
  expect(s.pendingDilemma?.dilemmaId).toBe("cao_marches_south");
  return s;
}

describe("8.2 各步", () => {
  it("沉默 → NO_GUIDANCE，取冲突最小的无门槛选项", () => {
    const s = toCao(T({ boldness: 90, rootedness: 10 }));
    const r = step(s, { reply: "", classification: null }, pack).log.at(-1)!;
    expect(r.exec).toBe("NO_GUIDANCE");
    // stay(submit_authority) 冲突 36，hide_hills(abandon_property) 冲突 4 → 入山
    expect(r.chosen).toBe("hide_hills");
  });

  it("信任高、无冲突 → DONE；门槛不够且胆大 → ATTEMPT_FAILED（可致死）；胆小 → DECLINED_UNABLE", () => {
    const strong = toCao(T({ skepticism: 0, boldness: 100, rootedness: 0 }), { physique: 70, wit: 30, looks: 50 });
    expect(step(strong, { reply: "随皇叔走", classification: sure("follow_liu") }, pack).log.at(-1)!.exec).toBe("DONE");

    const weakBold = toCao(T({ skepticism: 0, boldness: 100, rootedness: 0 }), { physique: 10, wit: 70, looks: 70 });
    const a = step(weakBold, { reply: "随皇叔走", classification: sure("follow_liu") }, pack);
    expect(a.log.at(-1)!.exec).toBe("ATTEMPT_FAILED");
    expect(a.log.at(-1)!.outcome).toBe("collapsed_on_road");
    expect(a.twin.alive).toBe(false);
    expect(a.ending?.cause).toBe("death");

    const weakTimid = toCao(T({ skepticism: 0, boldness: 59, impulsiveness: 50, rootedness: 0 }), { physique: 10, wit: 70, looks: 70 });
    const b = step(weakTimid, { reply: "随皇叔走", classification: sure("follow_liu") }, pack).log.at(-1)!;
    expect(["DECLINED_UNABLE", "PARTIAL"]).toContain(b.exec);
  });

  it("score 在 30–60 且选项可折中 → PARTIAL（不受本人门槛限制）", () => {
    const s = toCao(T({ rootedness: 25, boldness: 55 }), { physique: 10, wit: 70, looks: 70 });
    const r = step(s, { reply: "随皇叔走", classification: sure("follow_liu") }, pack).log.at(-1)!;
    const w = r.reasons.find((x) => x.code === "WEIGH")!;
    expect(w.score as number).toBeGreaterThanOrEqual(30);
    expect(w.score as number).toBeLessThan(60);
    expect(r.exec).toBe("PARTIAL");
    expect(r.outcome).toBe("sent_family_ahead");
  });

  it("迟缓（impulsiveness<25）在 timed 难题的 urgent 选项上 → TOO_LATE，退守非赶时间的选项", () => {
    const s = toCao(T({ skepticism: 0, boldness: 100, rootedness: 0, impulsiveness: 10 }), { physique: 70, wit: 30, looks: 50 });
    const r = step(s, { reply: "随皇叔走", classification: sure("follow_liu") }, pack).log.at(-1)!;
    expect(r.exec).toBe("TOO_LATE");
    expect(r.chosen).not.toBe("follow_liu");
  });

  it("身份不许 → NOT_ALLOWED", () => {
    let s = start(personaFromTraits(T({ skepticism: 0 })), "wit", fixedBirth({ station: "tenant" }));
    s = step(s, { reply: "", classification: null }, pack);
    const r = step(s, { reply: "雇人替你去", classification: sure("pay_substitute") }, pack).log.at(-1)!;
    expect(r.exec).toBe("NOT_ALLOWED");
    expect(r.chosen).not.toBe("pay_substitute");
  });

  it("歧义：机敏 ≥2 档取概率最高者；机敏低时按人格读，可能 MISREAD_BY_TRAITS", () => {
    const amb: Classification = { dist: { follow_liu: 0.5, hide_hills: 0.4, stay: 0, other: 0.1 }, source: "fixture" };
    const t = T({ rootedness: 90, boldness: 20 }); // 不愿离乡、胆小 → follow_liu 冲突大
    const smart = toCao(t, { physique: 50, wit: 50, looks: 50 });
    expect(resolveTurn(smart, { reply: "走", classification: amb }, pack).log.at(-1)!.read).toBe("follow_liu");
    const dull = toCao(t, { physique: 70, wit: 10, looks: 70 });
    const r = resolveTurn(dull, { reply: "走", classification: amb }, pack).log.at(-1)!;
    expect(r.read).toBe("hide_hills");
    expect(r.reasons.some((x) => x.code === "MISREAD_BY_TRAITS")).toBe(true);
  });

  it("dist.other 最大 → 读不懂，按人格自行选择", () => {
    const s = toCao(T({}));
    const r = step(s, { reply: "哈哈哈", classification: { dist: { follow_liu: 0.02, stay: 0.02, hide_hills: 0.02, other: 0.94 }, source: "fixture" } }, pack).log.at(-1)!;
    expect(r.exec).toBe("NO_GUIDANCE");
    expect(r.read).toBeNull();
  });

  it("信任：照做且结果 right 时上涨，乘以机敏系数；回了信另 +2", () => {
    const s = toCao(T({ skepticism: 0, boldness: 100, rootedness: 0 }), { physique: 70, wit: 30, looks: 50 });
    const wit = s.twin.endowments.wit;
    const r = step(s, { reply: "随皇叔走", classification: sure("follow_liu") }, pack).log.at(-1)!;
    expect(r.outcome).toBe("reached_jiangxia");
    expect(r.trustAfter - r.trustBefore).toBeCloseTo(Math.min(100 - r.trustBefore, (15 + 2) * (0.6 + wit * 0.008)), 1);
  });

  it("非空回复必须带分类；分类里不得有未知选项", () => {
    const s = toCao(T({}));
    expect(() => resolveTurn(s, { reply: "走", classification: null }, pack)).toThrow();
    expect(() => resolveTurn(s, { reply: "走", classification: { dist: { rm_rf: 1 }, source: "llm" } }, pack)).toThrow(/unknown option/);
  });

  it("原因说明用模板拼成，不出现任何数字", () => {
    const grid = [T({ skepticism: 0, boldness: 100, rootedness: 0 }), T({ rootedness: 60 }), T({ rootedness: 90, boldness: 20, impulsiveness: 10 }), T({ skepticism: 100 })];
    const bases = [{ physique: 70, wit: 30, looks: 50 }, { physique: 10, wit: 70, looks: 70 }, { physique: 50, wit: 10, looks: 90 }];
    const seenKeys = new Set<string>();
    for (const t of grid) for (const b of bases) for (const reply of [["去相看", "托人说情", "随皇叔走"], ["", "哈哈哈", "走"]]) {
      const s = play(start(personaFromTraits(t), "physique", fixedBirth({ baseEndowments: b })), reply);
      for (const r of s.log) {
        const d = pack.dilemmas.find((x) => x.id === r.dilemmaId)!;
        const text = renderReason(r, d, templates);
        expect(text.length).toBeGreaterThan(4);
        expect(text).not.toMatch(/[0-9０-９]/);
        expect(text).not.toMatch(/\{\w+\}/);
        seenKeys.add(r.exec);
      }
    }
    expect(seenKeys.size).toBeGreaterThanOrEqual(5);
  });
});

