export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 保留两位小数，避免浮点尾巴进存档。确定性不受影响。 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** (year, season) 换算成单一的季序号，便于比较先后。 */
export function seasonIndex(year: number, season: number): number {
  return year * 4 + (season - 1);
}
