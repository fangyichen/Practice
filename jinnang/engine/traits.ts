import { TRAIT_KEYS, type EngineConfig, type Persona, type TraitDeltaMap, type TraitKey, type Traits } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import { createRng } from "./rng";
import { clamp } from "./util";

// ---------------------------------------------------------------------------
// MBTI 起点（7.1）。游戏化启发式，不代表准确。调整表在 config.persona.mbtiAdjust。
// ---------------------------------------------------------------------------

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

export function traitsFromMbti(mbti?: string, cfg: EngineConfig = DEFAULT_CONFIG): Traits {
  let t = neutralTraits();
  if (!mbti) return t;
  for (const letter of mbti) {
    const adj = cfg.persona.mbtiAdjust[letter as keyof typeof cfg.persona.mbtiAdjust];
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

export function createPersona(
  input: { mbti?: string; answers?: { question: OnboardingQuestion; choice: number }[] },
  cfg: EngineConfig = DEFAULT_CONFIG,
): Persona {
  let traits = traitsFromMbti(input.mbti, cfg);
  const history: Persona["history"] = [];
  for (const a of input.answers ?? []) {
    const c = a.question.choices[a.choice];
    if (!c) throw new Error(`onboarding: bad choice ${a.choice} for ${a.question.id}`);
    traits = applyDelta(traits, c.delta, cfg.persona.onboardingCap);
    history.push({ source: `onboarding:${a.question.id}`, delta: c.delta });
  }
  return { ...(input.mbti ? { mbti: input.mbti } : {}), traits, history, carryChoices: [] };
}

// ---------------------------------------------------------------------------
// 标签冲突（8.2 第三步）。冲突表在 config.tagConflict。
// ---------------------------------------------------------------------------

export function isKnownTag(tag: string, cfg: EngineConfig = DEFAULT_CONFIG): boolean {
  return tag in cfg.tagConflict;
}

export type ConflictBreakdown = {
  total: number;
  /** 冲突最大的那个标签，以及其中贡献最大的特质；没有冲突时为 null */
  top: { tag: string; trait: TraitKey; amount: number } | null;
};

type Part = EngineConfig["tagConflict"][string][number];
const partValue = (p: Part, traits: Traits) => (p.dir === 1 ? traits[p.trait] : 100 - traits[p.trait]) * p.w;

export function tagConflict(tag: string, traits: Traits, cfg: EngineConfig = DEFAULT_CONFIG): number {
  return (cfg.tagConflict[tag] ?? []).reduce((s, p) => s + partValue(p, traits), 0);
}

export function optionConflict(tags: readonly string[], traits: Traits, cfg: EngineConfig = DEFAULT_CONFIG): ConflictBreakdown {
  let total = 0;
  let top: ConflictBreakdown["top"] = null;
  for (const tag of tags) {
    const parts = cfg.tagConflict[tag] ?? [];
    const amount = parts.reduce((s, p) => s + partValue(p, traits), 0);
    total += amount;
    if (amount > 0 && (top === null || amount > top.amount)) {
      let best = parts[0] as Part;
      for (const p of parts) if (partValue(p, traits) > partValue(best, traits)) best = p;
      top = { tag, trait: best.trait, amount };
    }
  }
  return { total, top };
}

/** 8.2 第七步：初始信任 */
export function initialTrust(traits: Traits, cfg: EngineConfig = DEFAULT_CONFIG): number {
  return clamp(cfg.trust.initialBase - (traits.skepticism - 50) * cfg.trust.skepticismWeight);
}
