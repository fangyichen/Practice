/**
 * 随机策略（设计文档 8.0）。
 *
 * 结算里所有「将来可能带随机」的取值点都经过这个对象。第一版只实现 birth_only：
 * 每个方法返回固定值，不碰 RNG。"full" 只是占位，调用时报未支持。
 */

export type RandomnessMode = "birth_only" | "full";

export interface Randomness {
  readonly mode: RandomnessMode;
  /** 8.2 第三步 score 的噪声项 */
  scoreNoise(): number;
  /** 8.2 第五步时机判定的松紧（加在 impulsiveness 上） */
  timingSlack(): number;
  /** 8.2 第一步歧义解读：给定按规则选出的那个，返回最终读法 */
  ambiguityPick<T>(candidates: readonly T[], preferred: T): T;
}

export const birthOnly: Randomness = {
  mode: "birth_only",
  scoreNoise: () => 0,
  timingSlack: () => 0,
  ambiguityPick: (_candidates, preferred) => preferred,
};

export function getRandomness(mode: RandomnessMode): Randomness {
  if (mode === "birth_only") return birthOnly;
  throw new Error(`randomness mode "${mode}" is not supported in this version`);
}
