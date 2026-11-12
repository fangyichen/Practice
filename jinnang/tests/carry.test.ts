import { describe, expect, it } from "vitest";
import { rollBirth, tier } from "../engine";
import { CARRY_BONUS } from "../engine/endowments";
import { carryRevealLine } from "../lib/render";
import { loadContent } from "../lib/pack";
import { ENDOWMENT_KEYS } from "../schemas";
import { pack, persona, start } from "./helpers";

describe("带一样过去（盲选加成）", () => {
  it("被选项加成前恒 ≤79；加成恰好升一档；不含加成的总和恒为 150；每项 10–90", () => {
    let n = 0;
    for (const carry of ENDOWMENT_KEYS) {
      for (let i = 0; i < 3000; i++) {
        const params = { persona: persona("INFP"), carry, gender: "m" as const, seed: `carry-${carry}-${i}` };
        const b = rollBirth(params, pack);
        const base = b.baseEndowments;
        expect(base[carry]).toBeLessThanOrEqual(79);
        expect(base.physique + base.wit + base.looks).toBe(150);
        for (const k of ENDOWMENT_KEYS) {
          expect(base[k]).toBeGreaterThanOrEqual(10);
          expect(base[k]).toBeLessThanOrEqual(90);
        }
        const s = start(params.persona, carry, b);
        const e = s.twin.endowments;
        expect(e[carry]).toBe(base[carry] + CARRY_BONUS);
        expect(tier(e[carry])).toBe(tier(base[carry]) + 1);
        for (const k of ENDOWMENT_KEYS) if (k !== carry) expect(e[k]).toBe(base[k]);
        expect(s.twin.boosted).toBe(carry);
        expect(s.persona.carryChoices.at(-1)).toBe(carry);
        n++;
      }
    }
    expect(n).toBe(9000);
  });

  it("投生揭晓的加成句只用形容词", () => {
    const content = loadContent<{ carryReveal: Record<string, { low: string; mid: string; high: string }> }>("birth");
    const s = start(persona("INFP"), "physique", { location: "xinye", station: "tenant", baseEndowments: { physique: 15, wit: 70, looks: 65 }, name: "李大" });
    const line = carryRevealLine(s, pack, content);
    expect(line).toBe("生来羸弱，因你所愿，略胜一分，仍是单薄。");
    expect(line).not.toMatch(/\d/);
  });
});
