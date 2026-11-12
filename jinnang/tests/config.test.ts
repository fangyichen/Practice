import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseEngineConfig, withConfig } from "../engine/config";
import { initialTrust } from "../engine/traits";
import { ROOT } from "../lib/pack";
import { fixedBirth, pack, persona, play, PERSONA_REPLIES, start } from "./helpers";
import { startLife } from "../engine";

const raw = JSON.parse(readFileSync(join(ROOT, "config/engine.json"), "utf8"));

describe("config/engine.json", () => {
  it("能通过校验；初始信任基数为 50", () => {
    expect(() => parseEngineConfig(raw)).not.toThrow();
    expect(DEFAULT_CONFIG.trust.initialBase).toBe(50);
    expect(initialTrust({ boldness: 50, loyalty: 50, impulsiveness: 50, rootedness: 50, skepticism: 50, sociability: 50 })).toBe(50);
    expect(initialTrust({ boldness: 50, loyalty: 50, impulsiveness: 50, rootedness: 50, skepticism: 75, sociability: 50 })).toBe(40);
  });

  it("拼错的键、不合理的组合会被拒绝", () => {
    const typo = structuredClone(raw);
    typo.trust.initalBase = 50;
    expect(() => parseEngineConfig(typo)).toThrow();
    const badOrder = structuredClone(raw);
    badOrder.willingness.floor = 70;
    expect(() => parseEngineConfig(badOrder)).toThrow(/floor/);
    const badCarry = structuredClone(raw);
    badCarry.endowments.carryPreMax = 70;
    expect(() => parseEngineConfig(badCarry)).toThrow(/carryPreMax/);
    const bigTag = structuredClone(raw);
    bigTag.tagConflict.leave_home[0].w = 0.9;
    expect(() => parseEngineConfig(bigTag)).toThrow(/40/);
  });

  it("引擎确实读配置：传入不同配置会改变结果，而默认配置不受影响", () => {
    const harsh = withConfig({ trust: { initialBase: 20 } });
    expect(harsh.trust.initialBase).toBe(20);
    expect(DEFAULT_CONFIG.trust.initialBase).toBe(50);
    const params = { persona: persona("ESFP"), carry: "physique" as const, gender: "m" as const, seed: "fixed" };
    const soft = play(start(params.persona, "physique", fixedBirth()), PERSONA_REPLIES);
    const s0 = startLife(params, fixedBirth(), pack, harsh);
    expect(s0.twin.trust).toBe(22);
    expect(soft.log[0]!.trustBefore).toBe(52);
    const budget = withConfig({ budget: { lifetime: 30 } });
    expect(startLife(params, fixedBirth(), pack, budget).charBudgetLeft).toBe(30);
  });
});
