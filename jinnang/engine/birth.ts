import type { EndowmentKey, Endowments, EngineConfig, EraPack, GameState, Persona } from "../schemas";
import { advance } from "./advance";
import { DEFAULT_CONFIG } from "./config";
import { applyCarry, drawEndowments } from "./endowments";
import { createRng } from "./rng";
import { initialTrust } from "./traits";
import { clone } from "./util";
import { findStation } from "./world";

export type BirthParams = {
  persona: Persona;
  carry: EndowmentKey;
  gender: "m" | "f";
  seed: string;
};

/** 投生抽出来的东西。M0 里这是唯一用到 RNG 的地方。 */
export type BirthResult = {
  location: string;
  station: string;
  /** 加成前的三项，总和 150 */
  baseEndowments: Endowments;
  name: string;
};

export function rollBirth(params: BirthParams, pack: EraPack, cfg: EngineConfig = DEFAULT_CONFIG): BirthResult {
  if (pack.slice.birth.mode !== "rolled") {
    throw new Error(`birth mode "${pack.slice.birth.mode}" is not supported`);
  }
  const rng = createRng(`birth:${params.seed}`);
  const location = rng.pick(pack.slice.birthLocations);
  const station = rng.weighted(pack.stations, (s) => s.weight);
  const baseEndowments = drawEndowments(rng, params.carry, station.endowmentWeights, cfg);
  const surname = rng.pick(pack.era.names.surnames);
  const given = rng.pick(pack.era.names.given[params.gender]);
  return { location, station: station.id, baseEndowments, name: surname + given };
}

/** 由投生结果建立初始状态，并推进到第一个难题。不使用 RNG。 */
export function startLife(
  params: BirthParams,
  birth: BirthResult,
  pack: EraPack,
  cfg: EngineConfig = DEFAULT_CONFIG,
): GameState {
  const station = findStation(pack, birth.station);
  const persona = clone(params.persona);
  persona.carryChoices = [...persona.carryChoices, params.carry];
  const state: GameState = {
    version: 3,
    seed: params.seed,
    eraId: pack.era.id,
    sliceId: pack.slice.id,
    persona,
    twin: {
      name: birth.name,
      gender: params.gender,
      birthYear: pack.slice.birthYear,
      location: birth.location,
      station: station.id,
      endowments: applyCarry(birth.baseEndowments, params.carry, cfg),
      boosted: params.carry,
      craft: station.initial.craft,
      health: station.initial.health,
      wealth: station.initial.wealth,
      standing: station.initial.standing,
      household: { spouse: false, children: 0, parentsAlive: station.household.parentsAlive },
      allegiance: null,
      trust: initialTrust(persona.traits, cfg),
      flags: [],
      alive: true,
    },
    year: pack.slice.startYear,
    season: 1,
    charBudgetLeft: cfg.budget.lifetime,
    turn: 0,
    nodeIndex: 0,
    pendingDilemma: null,
    log: [],
    ending: null,
    prophecies: [],
  };
  return advance(state, pack, cfg);
}

export function birth(params: BirthParams, pack: EraPack, cfg: EngineConfig = DEFAULT_CONFIG): GameState {
  return startLife(params, rollBirth(params, pack, cfg), pack, cfg);
}
