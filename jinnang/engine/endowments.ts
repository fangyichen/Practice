import { ENDOWMENT_KEYS, type EndowmentKey, type Endowments, type EngineConfig } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import type { Rng } from "./rng";

// ---------------------------------------------------------------------------
// 档位（7.2）：0–19 / 20–39 / 40–59 / 60–79 / 80–100。档宽固定，不进配置。
// ---------------------------------------------------------------------------

export const TIER_WIDTH = 20;

export function tier(v: number): number {
  return Math.max(0, Math.min(4, Math.floor(v / TIER_WIDTH)));
}

/** 相貌在 looksFadeAge 岁后每满 looksFadeStep 年视为降一档。 */
export function effectiveTier(
  endowments: Endowments,
  key: EndowmentKey,
  age: number,
  cfg: EngineConfig = DEFAULT_CONFIG,
): number {
  const t = tier(endowments[key]);
  const { looksFadeAge, looksFadeStep } = cfg.endowments;
  if (key !== "looks" || age <= looksFadeAge) return t;
  return Math.max(0, t - Math.floor((age - looksFadeAge) / looksFadeStep));
}

export function tiers(endowments: Endowments, age: number, cfg: EngineConfig = DEFAULT_CONFIG): Record<EndowmentKey, number> {
  return {
    physique: effectiveTier(endowments, "physique", age, cfg),
    wit: effectiveTier(endowments, "wit", age, cfg),
    looks: effectiveTier(endowments, "looks", age, cfg),
  };
}

// ---------------------------------------------------------------------------
// 抽取与盲选加成
// ---------------------------------------------------------------------------

/**
 * 三项总和恒为 sum，每项 [min, max]；carry 项加成前 ≤ carryPreMax。
 * 身份的禀赋权重轻微影响分配。拒绝采样，只在投生时调用。
 */
export function drawEndowments(
  rng: Rng,
  carry: EndowmentKey,
  weights: Record<EndowmentKey, number>,
  cfg: EngineConfig = DEFAULT_CONFIG,
): Endowments {
  const { sum, min, max, carryPreMax } = cfg.endowments;
  const spread = sum - min * ENDOWMENT_KEYS.length;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const raw = ENDOWMENT_KEYS.map((k) => rng.next() * weights[k]);
    const total = raw.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const vals = raw.map((r) => min + Math.floor((spread * r) / total));
    let diff = sum - vals.reduce((a, b) => a + b, 0);
    for (let i = 0; diff > 0; i = (i + 1) % vals.length, diff--) vals[i] = (vals[i] as number) + 1;
    const e: Endowments = { physique: vals[0] as number, wit: vals[1] as number, looks: vals[2] as number };
    if (ENDOWMENT_KEYS.every((k) => e[k] >= min && e[k] <= max) && e[carry] <= carryPreMax) return e;
  }
  const even = Math.round(sum / 3);
  return { physique: even, wit: even, looks: sum - 2 * even };
}

export function applyCarry(base: Endowments, carry: EndowmentKey, cfg: EngineConfig = DEFAULT_CONFIG): Endowments {
  return { ...base, [carry]: base[carry] + cfg.endowments.carryBonus };
}

/** 7.3：每年技艺增长 = 身份成长率 × (base + wit / witDivisor) */
export function craftGrowthPerYear(stationGrowth: number, wit: number, cfg: EngineConfig = DEFAULT_CONFIG): number {
  const g = cfg.endowments.craftGrowth;
  return stationGrowth * (g.base + wit / g.witDivisor);
}
