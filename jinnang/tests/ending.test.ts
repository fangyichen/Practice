import { describe, expect, it } from "vitest";
import { birth, eraYear, zhNumber } from "../engine";
import { rngDrawCount } from "../engine/rng";
import { ENDOWMENT_KEYS } from "../schemas";
import { fixedBirth, pack, persona, play, PERSONA_REPLIES, start } from "./helpers";

describe("结局与留痕（M1）", () => {
  it("中文数字与纪年", () => {
    expect([0, 3, 10, 11, 20, 43, 100, 105, 120].map(zhNumber)).toEqual(["〇", "三", "十", "十一", "二十", "四十三", "一百", "一百零五", "一百二十"]);
    const first = pack.era.eraNames.find((e) => !e.faction && e.endYear - e.startYear >= 12)!;
    expect(eraYear(pack, first.startYear, null)).toBe(`${first.name}元年`);
    expect(eraYear(pack, first.startYear + 12, null)).toBe(`${first.name}十三年`);
  });

  it("每一局都有完整的结局：等级、留痕物、记载、墓志，且没有残留槽位与数字", () => {
    const tiers = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const p = { persona: persona(["INTJ", "ESFP", "ISFJ", "ENTP"][i % 4]!), carry: ENDOWMENT_KEYS[i % 3]!, gender: (i % 2 ? "f" : "m") as "m" | "f", seed: `end-${i}` };
      const s = play(birth(p, pack), i % 3 === 0 ? {} : PERSONA_REPLIES);
      const e = s.ending!;
      expect(e).toBeTruthy();
      expect(e.record.length).toBeGreaterThan(6);
      expect(e.epitaph.length).toBeGreaterThan(4);
      expect(e.record + e.epitaph).not.toMatch(/\{\w+\}/);
      expect(e.record + e.epitaph).not.toMatch(/[0-9]/);
      expect(e.record).toContain(s.twin.name.slice(0, 1));
      if (p.gender === "f") expect(e.epitaph).not.toMatch(/他/);
      expect(e.deathYear).toBe(s.twin.birthYear + e.lifespan);
      if (s.twin.alive) expect(e.lifespan).toBeGreaterThan(e.age);
      tiers.add(e.tier);
    }
    expect(tiers.size).toBeGreaterThanOrEqual(2);
  });

  it("结局是确定性的，计算结局不调用 RNG", () => {
    const b = fixedBirth({ location: "jiangling", station: "boatman" });
    const s0 = start(persona("ESTP"), "physique", b);
    const before = rngDrawCount();
    const a = play(s0, PERSONA_REPLIES);
    const c = play(s0, PERSONA_REPLIES);
    expect(rngDrawCount()).toBe(before);
    expect(a.ending).toEqual(c.ending);
  });
});
