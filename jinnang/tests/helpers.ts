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

export type Replies = string[] | Record<string, string>;

/**
 * 用 fixture 分类同步地打完一局；"" 表示沉默。
 * replies 可以是按难题 id 的表（没写到的难题沉默），也可以是按顺序的数组。
 */
export function play(state: GameState, replies: Replies, answers: (number | null)[] = []): GameState {
  let s = state;
  let i = 0;
  while (s.pendingDilemma) {
    const d = pack.dilemmas.find((x) => x.id === s.pendingDilemma!.dilemmaId)!;
    const reply = (Array.isArray(replies) ? replies[i] : replies[d.id]) ?? "";
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

/** 一路沉默，直到轮到指定的难题 */
export function silentUntil(state: GameState, dilemmaId: string): GameState {
  let s = state;
  while (s.pendingDilemma && s.pendingDilemma.dilemmaId !== dilemmaId) s = step(s, { reply: "", classification: null }, pack);
  if (s.pendingDilemma?.dilemmaId !== dilemmaId) throw new Error(`没有走到 ${dilemmaId}`);
  return s;
}

/** 人格可分 / 禀赋可分测试用的固定回复：每个难题都给一句明确的建议 */
export const PERSONA_REPLIES: Record<string, string> = {
  apprentice_offer: "学手艺",
  matchmaker_call: "去相看",
  liu_garrison_201: "去当乡勇",
  lean_year_debt: "去码头",
  county_levy: "托人说情",
  old_friend_invite: "去投皇叔",
  cao_marches_south: "随皇叔走",
  south_surrender_208: "去江夏",
  chibi_aftermath: "去做工",
  new_master_209: "少报几口",
  parent_illness_212: "请名医",
  fan_flood_219: "上堤",
  white_robe_219: "往西走",
  yiling_222: "给蜀军带路",
};

/** 按难题 id 比较几局：返回出现过的难题，以及每局在该难题上的格子（没经历过为 "-"） */
export function compareRuns(runs: GameState[], cell: (r: GameState["log"][number]) => string) {
  const ids = pack.slice.nodes.filter((id) => runs.some((s) => s.log.some((r) => r.dilemmaId === id)));
  return ids.map((id) => ({ id, cells: runs.map((s) => { const r = s.log.find((x) => x.dilemmaId === id); return r ? cell(r) : "-"; }) }));
}
