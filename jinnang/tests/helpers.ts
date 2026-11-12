import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FixtureClassifier, type FixtureFile } from "../classifier";
import { createPersona, startLife, step, type BirthResult } from "../engine";
import { loadEraPack, ROOT } from "../lib/pack";
import type { EndowmentKey, GameState, Persona, Traits } from "../schemas";

export const pack = loadEraPack();
export const fixtures = JSON.parse(readFileSync(join(ROOT, "fixtures/replies.json"), "utf8")) as FixtureFile;
export const classifier = new FixtureClassifier(fixtures);

export const persona = (mbti: string): Persona => createPersona({ mbti });
export const personaFromTraits = (traits: Traits): Persona => ({ traits, history: [], carryChoices: [] });

/** 固定的投生结果（不经过 RNG） */
export function fixedBirth(over: Partial<BirthResult> = {}): BirthResult {
  return {
    location: "xiangyang",
    station: "smallholder",
    baseEndowments: { physique: 50, wit: 50, looks: 50 },
    name: "王顺",
    ...over,
  };
}

export function start(p: Persona, carry: EndowmentKey, birth: BirthResult): GameState {
  return startLife({ persona: p, carry, gender: "m", seed: "fixed" }, birth, pack);
}

/** 用 fixture 分类同步地打完一局；replies[i] 对应第 i 个难题，"" 表示沉默。 */
export function play(state: GameState, replies: string[], answers: (number | null)[] = []): GameState {
  let s = state;
  let i = 0;
  while (s.pendingDilemma) {
    const d = pack.dilemmas.find((x) => x.id === s.pendingDilemma!.dilemmaId)!;
    const reply = replies[i] ?? "";
    const classification = reply.trim()
      ? classifier.classifySync({
          dilemmaId: d.id,
          situationFacts: d.situationFacts,
          options: d.options.map((o) => ({ id: o.id, label: o.label })),
          reply,
        })
      : null;
    s = step(s, { reply, classification, personaAnswer: answers[i] ?? null }, pack);
    i++;
  }
  return s;
}

export const summary = (s: GameState) => s.log.map((r) => `${r.dilemmaId}:${r.exec}:${r.outcome}`);

/** 人格可分 / 禀赋可分测试用的固定回复序列：三封都给明确的建议 */
export const PERSONA_REPLIES = ["去相看", "托人说情", "随皇叔走"];
