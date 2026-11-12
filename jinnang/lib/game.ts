/**
 * 一局的编排：引擎（纯函数）+ 分类器 + 写信。对应第 5 节服务器里的那条流水线。
 * 这里有 IO（模型调用），引擎里没有。
 */
import { z } from "zod";
import { safeClassify, type ReplyClassifier } from "../classifier";
import { birth, checkReply, step, type BirthParams } from "../engine";
import { buildLetterInput, type LetterWriter } from "../letters";
import type { EraPack, GameState } from "../schemas";

export type GameDeps = { pack: EraPack; classifier: ReplyClassifier; writer: LetterWriter };

const LetterOut = z.object({ letter: z.string().min(1).max(2000) });

async function fillLetter(state: GameState, deps: Pick<GameDeps, "pack" | "writer">): Promise<GameState> {
  const p = state.pendingDilemma;
  if (!p || p.letter !== null) return state;
  const input = buildLetterInput(state, deps.pack);
  let letter = input.fallbackLetter;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      letter = LetterOut.parse(await deps.writer.write(input)).letter;
      break;
    } catch {
      // 重试一次，再失败用 fallbackLetter
    }
  }
  return { ...state, pendingDilemma: { ...p, letter } };
}

export async function newGame(params: BirthParams, deps: Pick<GameDeps, "pack" | "writer">): Promise<GameState> {
  return fillLetter(birth(params, deps.pack), deps);
}

export async function playTurn(
  state: GameState,
  input: { reply: string; personaAnswer?: number | null },
  deps: GameDeps,
): Promise<GameState> {
  const p = state.pendingDilemma;
  if (!p) throw new Error("no pending dilemma");
  const check = checkReply(input.reply, state.charBudgetLeft);
  if (!check.ok) throw new Error(`reply rejected: ${check.code}`);
  const d = deps.pack.dilemmas.find((x) => x.id === p.dilemmaId);
  if (!d) throw new Error(`unknown dilemma ${p.dilemmaId}`);
  // 空回复不调用分类器
  const classification =
    check.chars === 0
      ? null
      : await safeClassify(deps.classifier, {
          dilemmaId: d.id,
          situationFacts: d.situationFacts,
          options: d.options.map((o) => ({ id: o.id, label: o.label })),
          reply: input.reply,
        });
  const next = step(state, { reply: input.reply, classification, personaAnswer: input.personaAnswer ?? null }, deps.pack);
  return fillLetter(next, deps);
}
