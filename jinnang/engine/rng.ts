/**
 * 带种子的 RNG（xmur3 + mulberry32）。
 *
 * 在 birth_only 模式下，只有投生（birth.ts 的 rollBirth）允许调用它。
 * 模块级计数器 rngDrawCount() 供测试断言「投生之后没有任何 RNG 调用」。
 */

let draws = 0;

export function rngDrawCount(): number {
  return draws;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max] 整数 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (t: T) => number): T;
}

export function createRng(seed: string): Rng {
  let a = xmur3(seed)();
  const next = (): number => {
    draws++;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error("rng.pick: empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items, weight) => {
      if (items.length === 0) throw new Error("rng.weighted: empty list");
      const total = items.reduce((s, t) => s + weight(t), 0);
      let r = next() * total;
      for (const it of items) {
        r -= weight(it);
        if (r < 0) return it;
      }
      return items[items.length - 1] as (typeof items)[number];
    },
  };
  return rng;
}
