import type { EngineConfig, EraPack, GameState, Location, NodeCondition, TimelineEntry } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import { tiers } from "./endowments";
import { seasonIndex } from "./util";

export function ageOf(state: GameState): number {
  return state.year - state.twin.birthYear;
}

export function findDilemma(pack: EraPack, id: string) {
  const d = pack.dilemmas.find((x) => x.id === id);
  if (!d) throw new Error(`unknown dilemma: ${id}`);
  return d;
}

export function findStation(pack: EraPack, id: string) {
  const s = pack.stations.find((x) => x.id === id);
  if (!s) throw new Error(`unknown station: ${id}`);
  return s;
}

/** 某地某时的归属势力；数据里未填写时返回 null。 */
export function controllerOf(locations: Location[], locId: string, year: number, season: number): string | null {
  const loc = locations.find((l) => l.id === locId);
  if (!loc) return null;
  let current: string | null = null;
  const now = seasonIndex(year, season);
  for (const c of loc.control) {
    if (seasonIndex(c.fromYear, c.fromSeason) <= now) current = c.faction;
  }
  return current;
}

/** 替身此刻已经听说的大事（受 publicKnowledgeDelay 限制，单位：季）。 */
export function knownEvents(timeline: TimelineEntry[], year: number, season: number): TimelineEntry[] {
  const now = seasonIndex(year, season);
  return timeline.filter((e) => seasonIndex(e.year, e.season ?? 1) + (e.publicKnowledgeDelay ?? 0) <= now);
}

export function conditionHolds(cond: NodeCondition, state: GameState, cfg: EngineConfig = DEFAULT_CONFIG): boolean {
  const t = state.twin;
  const age = ageOf(state);
  if (cond.alive !== undefined && cond.alive !== t.alive) return false;
  if (cond.where && !cond.where.includes(t.location)) return false;
  if (cond.station && !cond.station.includes(t.station)) return false;
  if (cond.spouse !== undefined && cond.spouse !== t.household.spouse) return false;
  if (cond.minAge !== undefined && age < cond.minAge) return false;
  if (cond.maxAge !== undefined && age > cond.maxAge) return false;
  if (cond.hasFlag && !cond.hasFlag.every((f) => t.flags.includes(f))) return false;
  if (cond.notFlag && cond.notFlag.some((f) => t.flags.includes(f))) return false;
  const tr = tiers(t.endowments, age, cfg);
  for (const [k, v] of Object.entries(cond.tierAtLeast ?? {})) {
    if (tr[k as keyof typeof tr] < (v as number)) return false;
  }
  for (const [k, v] of Object.entries(cond.tierBelow ?? {})) {
    if (tr[k as keyof typeof tr] >= (v as number)) return false;
  }
  return true;
}
