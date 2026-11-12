/**
 * 字数预算（8.3）。按字素计，空白与标点不计。上限在 config.budget。
 */
import type { EngineConfig } from "../schemas";
import { DEFAULT_CONFIG } from "./config";

export type BudgetConfig = EngineConfig["budget"];

export const DEFAULT_BUDGET: BudgetConfig = DEFAULT_CONFIG.budget;

const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const IGNORED = /^[\p{P}\p{Z}\s\p{Cc}\p{Cf}]+$/u;

export function countChars(reply: string): number {
  let n = 0;
  for (const { segment } of segmenter.segment(reply)) {
    if (!IGNORED.test(segment)) n++;
  }
  return n;
}

export type BudgetCheck =
  | { ok: true; chars: number }
  | { ok: false; code: "TOO_LONG_RAW" | "OVER_LETTER_LIMIT" | "OVER_BUDGET" | "BUDGET_EXHAUSTED"; chars: number };

export function checkReply(reply: string, budgetLeft: number, cfg: BudgetConfig = DEFAULT_BUDGET): BudgetCheck {
  if (reply.length > cfg.maxRawLength) return { ok: false, code: "TOO_LONG_RAW", chars: countChars(reply) };
  const chars = countChars(reply);
  if (chars === 0) return { ok: true, chars };
  if (budgetLeft <= 0) return { ok: false, code: "BUDGET_EXHAUSTED", chars };
  if (chars > cfg.perLetter) return { ok: false, code: "OVER_LETTER_LIMIT", chars };
  if (chars > budgetLeft) return { ok: false, code: "OVER_BUDGET", chars };
  return { ok: true, chars };
}
