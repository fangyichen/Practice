import { ageOf, knownEvents, tiers } from "../engine";
import type { EraPack, GameState } from "../schemas";
import type { LetterInput } from "./types";

const LEVEL = ["极差", "差", "一般", "尚可", "好"];
const level = (v: number) => LEVEL[Math.min(4, Math.floor(v / 20))] as string;
const CRAFT = ["生疏", "粗通", "熟手", "好手", "名匠"];

function traitSummary(t: Record<string, number>): string[] {
  const out: string[] = [];
  const hi = (k: string) => (t[k] ?? 50) >= 65;
  const lo = (k: string) => (t[k] ?? 50) <= 35;
  if (hi("boldness")) out.push("胆大，敢冒险");
  if (lo("boldness")) out.push("胆小谨慎");
  if (hi("loyalty")) out.push("重义守诺");
  if (hi("impulsiveness")) out.push("性急，说做就做，句子短");
  if (lo("impulsiveness")) out.push("迟缓，反复掂量");
  if (hi("rootedness")) out.push("恋土顾家，常提田和屋");
  if (lo("rootedness")) out.push("不恋故土");
  if (hi("skepticism")) out.push("多疑，会追问来信者是谁");
  if (lo("skepticism")) out.push("容易相信人");
  if (hi("sociability")) out.push("爱结交人");
  if (lo("sociability")) out.push("不爱与人打交道");
  return out;
}

export function buildLetterInput(state: GameState, pack: EraPack): LetterInput {
  const pending = state.pendingDilemma;
  if (!pending) throw new Error("no pending dilemma");
  const d = pack.dilemmas.find((x) => x.id === pending.dilemmaId);
  if (!d) throw new Error(`unknown dilemma ${pending.dilemmaId}`);
  const t = state.twin;
  const age = ageOf(state);
  const tr = tiers(t.endowments, age);
  const labels = pack.era.endowmentLabels;
  const prev = state.log[state.log.length - 1] ?? null;
  const station = pack.stations.find((s) => s.id === t.station)?.name ?? t.station;
  const location = pack.locations.find((l) => l.id === t.location)?.name ?? t.location;
  return {
    twin: {
      name: t.name,
      gender: t.gender,
      age,
      station,
      location,
      household: t.household,
      status: { health: level(t.health), wealth: level(t.wealth), standing: level(t.standing) },
    },
    traits: { values: { ...state.persona.traits }, summary: traitSummary(state.persona.traits) },
    endowments: {
      physique: labels.physique[tr.physique] as string,
      wit: labels.wit[tr.wit] as string,
      looks: labels.looks[tr.looks] as string,
      craft: CRAFT[Math.min(4, Math.floor(t.craft / 20))] as string,
    },
    previous: prev ? { exec: prev.exec, reasons: prev.reasons, facts: prev.facts } : null,
    dilemma: {
      id: d.id,
      situationFacts: d.situationFacts,
      selfKnownLimits: d.selfKnownLimits.map((k) => ({ stat: k, label: labels[k][tr[k]] as string })),
    },
    knownEvents: knownEvents(pack.timeline, state.year, state.season)
      .filter((e) => e.year >= pack.slice.startYear)
      .map((e) => ({ title: e.title, facts: e.facts })),
    style: { hints: pack.era.styleHints, playerAddress: pack.era.playerAddress },
    fallbackLetter: d.fallbackLetter,
  };
}
