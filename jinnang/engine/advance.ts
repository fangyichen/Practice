import type { EngineConfig, EraPack, GameState } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import { craftGrowthPerYear } from "./endowments";
import { computeEnding } from "./ending";
import { clamp, clone, round2, seasonIndex } from "./util";
import { conditionHolds, findDilemma, findStation } from "./world";

type Season = GameState["season"];

/** 每进入新的一年，应用确定性的变化（8.1）。 */
function applyYear(state: GameState, year: number, pack: EraPack, cfg: EngineConfig): void {
  const t = state.twin;
  if (!t.alive) return;
  const age = year - t.birthYear;
  if (age > cfg.endowments.physiqueDeclineAge) {
    t.endowments.physique = clamp(t.endowments.physique - cfg.endowments.physiqueDeclinePerYear);
  }
  const station = findStation(pack, t.station);
  t.craft = round2(clamp(t.craft + craftGrowthPerYear(station.craftGrowth, t.endowments.wit, cfg)));
}

/** 把时间推进到 (year, season)，返回新状态。不会倒退。 */
export function passTime(
  state: GameState,
  year: number,
  season: Season,
  pack: EraPack,
  cfg: EngineConfig = DEFAULT_CONFIG,
): GameState {
  const s = clone(state);
  if (seasonIndex(year, season) <= seasonIndex(s.year, s.season)) return s;
  for (let y = s.year + 1; y <= year; y++) applyYear(s, y, pack, cfg);
  s.year = year;
  s.season = season;
  return s;
}

/**
 * 沿本卷 nodes 的顺序走到下一个条件成立的难题；没有了就走到卷末并结束。
 * 已有待答难题或已结束时原样返回。纯函数，不使用 RNG。
 */
export function advance(state: GameState, pack: EraPack, cfg: EngineConfig = DEFAULT_CONFIG): GameState {
  let s = clone(state);
  if (s.ending || s.pendingDilemma) return s;

  if (!s.twin.alive) {
    s.ending = computeEnding(s, "death", pack, cfg);
    return s;
  }

  const nodes = pack.slice.nodes;
  for (let i = s.nodeIndex; i < nodes.length; i++) {
    const d = findDilemma(pack, nodes[i] as string);
    if (seasonIndex(d.year, d.season) < seasonIndex(s.year, s.season)) continue;
    const at = passTime(s, d.year, d.season, pack, cfg);
    if (conditionHolds(d.condition, at, cfg)) {
      s = at;
      s.nodeIndex = i;
      s.pendingDilemma = { dilemmaId: d.id, year: d.year, season: d.season, letter: null };
      return s;
    }
  }

  s = passTime(s, pack.slice.endYear, 4, pack, cfg);
  s.nodeIndex = nodes.length;
  s.ending = computeEnding(s, "slice_end", pack, cfg);
  return s;
}
