import { TRAIT_KEYS, type Persona, type TraitDeltaMap, type TraitKey, type Traits } from "../schemas";
import { createRng } from "./rng";
import { clamp } from "./util";

// ---------------------------------------------------------------------------
// MBTI 起点（7.1）。游戏化启发式，不代表准确。
// ---------------------------------------------------------------------------

export const MBTI_ADJUST: Record<string, TraitDeltaMap> = {
  E: { sociability: 15, boldness: 5 },
  I: { sociability: -15 },
  N: { boldness: 12, rootedness: -8 },
  S: { rootedness: 12 },
  T: { skepticism: 15 },
  F: { loyalty: 12, skepticism: -5 },
  J: { impulsiveness: -15 },
  P: { impulsiveness: 15 },
};

export function neutralTraits(): Traits {
  return { boldness: 50, loyalty: 50, impulsiveness: 50, rootedness: 50, skepticism: 50, sociability: 50 };
}

export function applyDelta(traits: Traits, delta: TraitDeltaMap, cap = Infinity): Traits {
  const out = { ...traits };
  for (const k of TRAIT_KEYS) {
    const d = delta[k];
    if (d === undefined) continue;
    out[k] = clamp(out[k] + clamp(d, -cap, cap));
  }
  return out;
}

export function traitsFromMbti(mbti?: string): Traits {
  let t = neutralTraits();
  if (!mbti) return t;
  for (const letter of mbti) {
    const adj = MBTI_ADJUST[letter];
    if (adj) t = applyDelta(t, adj);
  }
  return t;
}

// ---------------------------------------------------------------------------
// 建档情境题（7.1）
// ---------------------------------------------------------------------------

export type OnboardingQuestion = {
  id: string;
  prompt: string;
  choices: { text: string; delta: TraitDeltaMap }[];
};

/** 从题库抽 n 道。发生在投生之前，与对局 RNG 无关。 */
export function pickOnboardingQuestions(
  bank: readonly OnboardingQuestion[],
  seed: string,
  n = 5,
): OnboardingQuestion[] {
  const rng = createRng(`onboarding:${seed}`);
  const pool = [...bank];
  const out: OnboardingQuestion[] = [];
  while (out.length < n && pool.length > 0) {
    out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0] as OnboardingQuestion);
  }
  return out;
}

export function createPersona(input: {
  mbti?: string;
  answers?: { question: OnboardingQuestion; choice: number }[];
}): Persona {
  let traits = traitsFromMbti(input.mbti);
  const history: Persona["history"] = [];
  for (const a of input.answers ?? []) {
    const c = a.question.choices[a.choice];
    if (!c) throw new Error(`onboarding: bad choice ${a.choice} for ${a.question.id}`);
    traits = applyDelta(traits, c.delta, 10);
    history.push({ source: `onboarding:${a.question.id}`, delta: c.delta });
  }
  return { ...(input.mbti ? { mbti: input.mbti } : {}), traits, history, carryChoices: [] };
}

/** 「换了是你」题：单次每项不超过 ±6。 */
export const PERSONA_QUESTION_CAP = 6;

// ---------------------------------------------------------------------------
// 标签冲突（8.2 第三步）。每个标签 0–40。
// dir = 1：特质越高越冲突；dir = -1：特质越低越冲突。
// ---------------------------------------------------------------------------

type ConflictPart = { trait: TraitKey; dir: 1 | -1; w: number };

export const TAG_CONFLICT: Record<string, ConflictPart[]> = {
  leave_home: [{ trait: "rootedness", dir: 1, w: 0.4 }],
  abandon_property: [
    { trait: "rootedness", dir: 1, w: 0.25 },
    { trait: "boldness", dir: -1, w: 0.15 },
  ],
  risk_life: [{ trait: "boldness", dir: -1, w: 0.4 }],
  betray_lord: [{ trait: "loyalty", dir: 1, w: 0.4 }],
  break_promise: [{ trait: "loyalty", dir: 1, w: 0.4 }],
  defy_authority: [{ trait: "boldness", dir: -1, w: 0.4 }],
  submit_authority: [{ trait: "boldness", dir: 1, w: 0.4 }],
  trust_stranger: [
    { trait: "skepticism", dir: 1, w: 0.25 },
    { trait: "sociability", dir: -1, w: 0.15 },
  ],
  // 以下两个是 M0 个人节点需要而文档表里没有的标签
  settle_down: [{ trait: "rootedness", dir: -1, w: 0.4 }],
  disappoint_family: [
    { trait: "rootedness", dir: 1, w: 0.25 },
    { trait: "loyalty", dir: 1, w: 0.15 },
  ],
};

export function isKnownTag(tag: string): boolean {
  return tag in TAG_CONFLICT;
}

export type ConflictBreakdown = {
  total: number;
  /** 冲突最大的那个标签，以及其中贡献最大的特质；没有冲突时为 null */
  top: { tag: string; trait: TraitKey; amount: number } | null;
};

export function tagConflict(tag: string, traits: Traits): number {
  const parts = TAG_CONFLICT[tag];
  if (!parts) return 0;
  return parts.reduce((s, p) => s + (p.dir === 1 ? traits[p.trait] : 100 - traits[p.trait]) * p.w, 0);
}

export function optionConflict(tags: readonly string[], traits: Traits): ConflictBreakdown {
  let total = 0;
  let top: ConflictBreakdown["top"] = null;
  for (const tag of tags) {
    const amount = tagConflict(tag, traits);
    total += amount;
    if (amount > 0 && (top === null || amount > top.amount)) {
      const parts = TAG_CONFLICT[tag] ?? [];
      let best = parts[0];
      for (const p of parts) {
        const v = (p.dir === 1 ? traits[p.trait] : 100 - traits[p.trait]) * p.w;
        const bv = best ? (best.dir === 1 ? traits[best.trait] : 100 - traits[best.trait]) * best.w : -1;
        if (v > bv) best = p;
      }
      if (best) top = { tag, trait: best.trait, amount };
    }
  }
  return { total, top };
}

/** 8.2 第七步：初始信任 */
export function initialTrust(traits: Traits): number {
  return clamp(40 - (traits.skepticism - 50) * 0.4);
}

/** when.rash / 硬上判定用 */
export const RASH_IMPULSIVENESS = 70;
export const BOLD_ENOUGH = 60;
export const SLOW_IMPULSIVENESS = 25;
