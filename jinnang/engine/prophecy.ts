/**
 * 预言：玩家在回信里说出演义后来的事。
 * - 登记：回信里出现某条预言的字眼，且那件事此刻还没有发生，就记下来（每条只记一次）；
 * - 应验：那件事发生之后的第一封信（替身就在荆州，不等消息传开），替身还活着，信任 + prophecyHit，
 *   信的开头先回应这件事。
 * 纯函数，不使用 RNG；字眼与文字都在数据包 prophecies.json 里。
 */
import type { EngineConfig, EraPack, GameState, ProphecyRecord } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import { clamp, round2, seasonIndex } from "./util";

const IGNORE = /[\p{P}\p{Z}\s\p{S}]/gu;

/** 那件事发生的季序号 */
function knownAt(pack: EraPack, eventId: string): number | null {
  const e = pack.timeline.find((x) => x.id === eventId);
  if (!e) return null;
  return seasonIndex(e.year, e.season ?? 1);
}

/** 回信里说中了哪些尚未发生的事（不含已经登记过的） */
export function detectProphecies(reply: string, state: GameState, pack: EraPack): string[] {
  const text = reply.replace(IGNORE, "");
  if (!text) return [];
  const now = seasonIndex(state.year, state.season);
  const done = new Set(state.prophecies.map((p) => p.id));
  return pack.prophecies
    .filter((p) => !done.has(p.id))
    .filter((p) => {
      const at = knownAt(pack, p.event);
      return at !== null && at > now;
    })
    .filter((p) => p.any.some((group) => group.every((w) => text.includes(w))))
    .map((p) => p.id);
}

/**
 * 把已经发生的待应验预言结掉。替身在世则应验并加信任，否则作废。
 * 原地修改 state，返回这次应验的 id。
 */
export function settleProphecies(state: GameState, pack: EraPack, cfg: EngineConfig = DEFAULT_CONFIG): string[] {
  const now = seasonIndex(state.year, state.season);
  const hits: string[] = [];
  state.prophecies = state.prophecies.map((p): ProphecyRecord => {
    if (p.status !== "pending") return p;
    const def = pack.prophecies.find((x) => x.id === p.id);
    const at = def ? knownAt(pack, def.event) : null;
    if (at === null) return { ...p, status: "void" };
    if (at > now) return p;
    if (!state.twin.alive) return { ...p, status: "void" };
    const before = state.twin.trust;
    state.twin.trust = round2(clamp(before + cfg.trust.prophecyHit));
    hits.push(p.id);
    return { ...p, status: "hit", year: state.year, trustBefore: before, trustAfter: state.twin.trust };
  });
  return hits;
}
