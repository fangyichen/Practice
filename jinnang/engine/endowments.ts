import { ENDOWMENT_KEYS, type EndowmentKey, type Endowments } from "../schemas";
import type { Rng } from "./rng";

// ---------------------------------------------------------------------------
// 档位（7.2）：0–19 / 20–39 / 40–59 / 60–79 / 80–100
// ---------------------------------------------------------------------------

export function tier(v: number): number {
  return Math.max(0, Math.min(4, Math.floor(v / 20)));
}

/** 相貌 35 岁后每满 5 年视为降一档。 */
export const LOOKS_FADE_AGE = 35;
export const LOOKS_FADE_STEP = 5;

export function effectiveTier(endowments: Endowments, key: EndowmentKey, age: number): number {
  const t = tier(endowments[key]);
  if (key !== "looks" || age <= LOOKS_FADE_AGE) return t;
  return Math.max(0, t - Math.floor((age - LOOKS_FADE_AGE) / LOOKS_FADE_STEP));
}

export function tiers(endowments: Endowments, age: number): Record<EndowmentKey, number> {
  return {
    physique: effectiveTier(endowments, "physique", age),
    wit: effectiveTier(endowments, "wit", age),
    looks: effectiveTier(endowments, "looks", age),
  };
}

// ---------------------------------------------------------------------------
// 抽取与盲选加成
// ---------------------------------------------------------------------------

export const ENDOWMENT_SUM = 150;
export const ENDOWMENT_MIN = 10;
export const ENDOWMENT_MAX = 90;
export const CARRY_BONUS = 20;
/** 被带过去的那项加成前不得高于此值，保证加成恰好升一档且不溢出。 */
export const CARRY_PRE_MAX = 79;

/**
 * 三项总和恒为 150，每项 10–90；carry 项加成前 ≤ 79。
 * 身份的禀赋权重轻微影响分配。拒绝采样，只在投生时调用。
 */
export function drawEndowments(
  rng: Rng,
  carry: EndowmentKey,
  weights: Record<EndowmentKey, number>,
): Endowments {
  const spread = ENDOWMENT_SUM - ENDOWMENT_MIN * ENDOWMENT_KEYS.length;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const raw = ENDOWMENT_KEYS.map((k) => rng.next() * weights[k]);
    const total = raw.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    const vals = raw.map((r) => ENDOWMENT_MIN + Math.floor((spread * r) / total));
    let diff = ENDOWMENT_SUM - vals.reduce((a, b) => a + b, 0);
    for (let i = 0; diff > 0; i = (i + 1) % vals.length, diff--) vals[i] = (vals[i] as number) + 1;
    const e: Endowments = { physique: vals[0] as number, wit: vals[1] as number, looks: vals[2] as number };
    const ok =
      ENDOWMENT_KEYS.every((k) => e[k] >= ENDOWMENT_MIN && e[k] <= ENDOWMENT_MAX) && e[carry] <= CARRY_PRE_MAX;
    if (ok) return e;
  }
  return { physique: 50, wit: 50, looks: 50 };
}

export function applyCarry(base: Endowments, carry: EndowmentKey): Endowments {
  return { ...base, [carry]: base[carry] + CARRY_BONUS };
}

// ---------------------------------------------------------------------------
// 确定性的变化（7.2、7.3）
// ---------------------------------------------------------------------------

export const PHYSIQUE_DECLINE_AGE = 35;
export const PHYSIQUE_DECLINE_PER_YEAR = 2;
/** 机敏每经历一个难题 +1，累计上限 +15 */
export const WIT_GROWTH_CAP = 15;

/** 7.3：每年技艺增长 = 身份成长率 × (0.6 + wit/125) */
export function craftGrowthPerYear(stationGrowth: number, wit: number): number {
  return stationGrowth * (0.6 + wit / 125);
}
