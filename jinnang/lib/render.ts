import { CARRY_BONUS } from "../engine/endowments";
import { tier } from "../engine";
import type { EraPack, GameState } from "../schemas";

type BirthContent = {
  carryReveal: Record<string, { low: string; mid: string; high: string }>;
};

/** 投生揭晓时那一句加成（7.2）。只用形容词。 */
export function carryRevealLine(state: GameState, pack: EraPack, content: BirthContent): string {
  const k = state.twin.boosted;
  const now = state.twin.endowments[k];
  const before = tier(now - CARRY_BONUS);
  const after = tier(now);
  const labels = pack.era.endowmentLabels[k];
  const band = after <= 1 ? "low" : after === 2 ? "mid" : "high";
  const tpl = content.carryReveal[k]?.[band] ?? "";
  return tpl.replace("{base}", labels[before] as string).replace("{now}", labels[after] as string);
}
