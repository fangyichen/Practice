/**
 * 回复结算（设计文档 8.2）。纯函数，不使用 RNG。
 *
 * 读法 → 许不许（身份）→ 肯不肯（人格与信任）→ 能不能（禀赋）→ 时机 → 查结果 → 信任更新。
 * 每一步都往 reasons 里追加结构化原因。
 */
import type {
  Classification,
  Dilemma,
  DilemmaOption,
  EngineConfig,
  EraPack,
  Exec,
  GameState,
  Outcome,
  Reason,
  ResultWhen,
  TurnRecord,
} from "../schemas";
import { advance } from "./advance";
import { checkReply } from "./budget";
import { DEFAULT_CONFIG } from "./config";
import { effectiveTier, tiers } from "./endowments";
import { getRandomness, type Randomness } from "./randomness";
import { applyDelta, optionConflict } from "./traits";
import { clamp, clone, round2 } from "./util";
import { ageOf, findDilemma } from "./world";
import { detectProphecies } from "./prophecy";

export type TurnInput = {
  reply: string;
  /** 回复为空（沉默）时传 null；非空回复必须带分类结果 */
  classification: Classification | null;
  personaAnswer?: number | null;
};

export type ResolveOptions = {
  /** 默认 config/engine.json */
  config?: EngineConfig;
  /** 默认按 config.randomness 取 */
  randomness?: Randomness;
};

export function trustMultiplier(wit: number, cfg: EngineConfig = DEFAULT_CONFIG): number {
  return cfg.trust.witMultiplier.base + wit * cfg.trust.witMultiplier.perPoint;
}

const EXECUTING: readonly Exec[] = ["DONE", "PARTIAL", "ATTEMPT_FAILED"];

type Ctx = {
  state: GameState;
  dilemma: Dilemma;
  age: number;
  cfg: EngineConfig;
};

function allowed(opt: DilemmaOption, ctx: Ctx): boolean {
  const r = opt.requires;
  if (!r) return true;
  const t = ctx.state.twin;
  if (r.station && !r.station.includes(t.station)) return false;
  if (r.wealthAtLeast !== undefined && t.wealth < r.wealthAtLeast) return false;
  if (r.hasFlag && !t.flags.includes(r.hasFlag)) return false;
  return true;
}

function able(opt: DilemmaOption, ctx: Ctx): boolean {
  if (!opt.gate) return true;
  return effectiveTier(ctx.state.twin.endowments, opt.gate.stat, ctx.age, ctx.cfg) >= opt.gate.minTier;
}

function conflictOf(opt: DilemmaOption, ctx: Ctx) {
  return optionConflict(opt.tags, ctx.state.persona.traits, ctx.cfg);
}

/** 冲突最小者；平手取选项顺序靠前的。 */
function leastConflict(opts: DilemmaOption[], ctx: Ctx): DilemmaOption {
  let best = opts[0] as DilemmaOption;
  let bestC = conflictOf(best, ctx).total;
  for (const o of opts.slice(1)) {
    const c = conflictOf(o, ctx).total;
    if (c < bestC) {
      best = o;
      bestC = c;
    }
  }
  return best;
}

/**
 * 人格默认：冲突最小的无门槛、身份允许的选项。
 * exclude：刚被拒绝或做不成的那个；noUrgent：误了时机时排除需要赶时间的选项。
 * 若筛完为空，逐步放宽（数据校验保证至少有一个无门槛无限制的选项）。
 */
function personaDefault(ctx: Ctx, opts: { exclude?: string; noUrgent?: boolean } = {}): DilemmaOption {
  const base = ctx.dilemma.options.filter((o) => !o.gate && allowed(o, ctx));
  const tiersOfFilters: DilemmaOption[][] = [
    base.filter((o) => o.id !== opts.exclude && !(opts.noUrgent && o.urgent)),
    base.filter((o) => !(opts.noUrgent && o.urgent)),
    base,
    ctx.dilemma.options.filter((o) => !o.gate),
  ];
  for (const list of tiersOfFilters) if (list.length > 0) return leastConflict(list, ctx);
  throw new Error(`dilemma ${ctx.dilemma.id} has no ungated option`);
}

function whenMatches(w: ResultWhen, exec: Exec, ctx: Ctx): boolean {
  if (w.exec !== exec) return false;
  const t = ctx.state.twin;
  const tr = tiers(t.endowments, ctx.age, ctx.cfg);
  for (const [k, v] of Object.entries(w.tierAtLeast ?? {})) if (tr[k as keyof typeof tr] < (v as number)) return false;
  for (const [k, v] of Object.entries(w.tierBelow ?? {})) if (tr[k as keyof typeof tr] >= (v as number)) return false;
  if (w.station && !w.station.includes(t.station)) return false;
  if (w.hasFlag && !t.flags.includes(w.hasFlag)) return false;
  if (w.craftAtLeast !== undefined && t.craft < w.craftAtLeast) return false;
  if (w.rash !== undefined && (ctx.state.persona.traits.impulsiveness >= ctx.cfg.temperament.rashImpulsiveness) !== w.rash) {
    return false;
  }
  return true;
}

export function lookupOutcome(opt: DilemmaOption, exec: Exec, ctx: Ctx, pack: EraPack): { id: string; outcome: Outcome } {
  const rule = opt.results.find((r) => whenMatches(r.when, exec, ctx));
  if (!rule) throw new Error(`no result rule for ${ctx.dilemma.id}/${opt.id} exec=${exec}`);
  const outcome = pack.outcomes[rule.outcome];
  if (!outcome) throw new Error(`unknown outcome ${rule.outcome}`);
  return { id: rule.outcome, outcome };
}

function applyEffects(state: GameState, outcome: Outcome, age: number, cfg: EngineConfig): void {
  const t = state.twin;
  const e = outcome.effects;
  if (e.health !== undefined) t.health = clamp(t.health + e.health);
  if (e.wealth !== undefined) t.wealth = clamp(t.wealth + e.wealth);
  if (e.standing !== undefined) t.standing = clamp(t.standing + e.standing);
  if (e.craft !== undefined) t.craft = round2(clamp(t.craft + e.craft));
  if (e.physique !== undefined) t.endowments.physique = clamp(t.endowments.physique + e.physique);
  if (e.wit !== undefined) t.endowments.wit = clamp(t.endowments.wit + e.wit);
  if (e.location !== undefined) t.location = e.location;
  if (e.alive !== undefined) t.alive = e.alive;
  if (e.spouse !== undefined) t.household.spouse = e.spouse;
  if (e.children !== undefined) t.household.children = Math.max(0, t.household.children + e.children);
  if (e.parentsAlive !== undefined) t.household.parentsAlive = clamp(t.household.parentsAlive + e.parentsAlive, 0, 2);
  if (e.allegiance !== undefined) t.allegiance = e.allegiance;
  const add = [...(e.addFlags ?? [])];
  for (const c of e.addFlagsIfTier ?? []) {
    if (effectiveTier(t.endowments, c.stat, age, cfg) >= c.minTier) add.push(c.flag);
  }
  for (const f of add) if (!t.flags.includes(f)) t.flags.push(f);
  if (e.removeFlags) t.flags = t.flags.filter((f) => !e.removeFlags?.includes(f));
}

function argmaxOption(dilemma: Dilemma, dist: Record<string, number>): DilemmaOption {
  let best = dilemma.options[0] as DilemmaOption;
  for (const o of dilemma.options) if ((dist[o.id] ?? 0) > (dist[best.id] ?? 0)) best = o;
  return best;
}

/**
 * 结算一封回信，不推进时间。调用方通常用 step()（resolve + advance）。
 */
export function resolveTurn(
  state: GameState,
  input: TurnInput,
  pack: EraPack,
  opts: ResolveOptions = {},
): GameState {
  const cfg = opts.config ?? DEFAULT_CONFIG;
  const randomness = opts.randomness ?? getRandomness(cfg.randomness);
  if (state.ending) throw new Error("game already ended");
  if (!state.pendingDilemma) throw new Error("no pending dilemma");

  const budget = checkReply(input.reply, state.charBudgetLeft, cfg.budget);
  if (!budget.ok) throw new Error(`reply rejected: ${budget.code}`);
  const silent = budget.chars === 0;
  if (!silent && !input.classification) throw new Error("non-empty reply requires a classification");
  const classification = silent ? null : input.classification;

  const s = clone(state);
  const dilemma = findDilemma(pack, s.pendingDilemma!.dilemmaId);
  const ctx: Ctx = { state: s, dilemma, age: ageOf(s), cfg };
  const traits = s.persona.traits;
  const reasons: Reason[] = [];

  if (classification) {
    const ids = new Set([...dilemma.options.map((o) => o.id), "other"]);
    for (const k of Object.keys(classification.dist)) {
      if (!ids.has(k)) throw new Error(`classification has unknown option "${k}"`);
    }
  }

  // ---- 第一步：他把这句话读成了什么 ----
  let read: DilemmaOption | null = null;
  if (silent) {
    reasons.push({ code: "SILENCE" });
  } else {
    const dist = classification!.dist;
    const top = argmaxOption(dilemma, dist);
    const other = dist.other ?? 0;
    if (other > 0 && other >= (dist[top.id] ?? 0)) {
      reasons.push({ code: "NO_READING" });
    } else {
      let candidates = dilemma.options.filter((o) => (dist[o.id] ?? 0) >= cfg.reading.candidateMinProb);
      if (candidates.length === 0) candidates = [top];
      if (candidates.length === 1) {
        read = candidates[0] as DilemmaOption;
      } else {
        reasons.push({ code: "AMBIGUOUS", candidates: candidates.map((c) => c.id).join(",") });
        const witTier = effectiveTier(s.twin.endowments, "wit", ctx.age, cfg);
        const preferred = witTier >= cfg.reading.witTierReadsWell ? top : leastConflict(candidates, ctx);
        read = randomness.ambiguityPick(candidates, preferred);
        if (read.id !== top.id) reasons.push({ code: "MISREAD_BY_TRAITS", wrote: top.id, read: read.id });
        else reasons.push({ code: "READ_BY_WIT" });
      }
    }
  }

  let exec: Exec;
  let chosen: DilemmaOption;

  if (!read) {
    chosen = personaDefault(ctx);
    exec = "NO_GUIDANCE";
    reasons.push({ code: "NO_GUIDANCE", option: chosen.id });
  } else if (!allowed(read, ctx)) {
    // ---- 第二步：许不许 ----
    exec = "NOT_ALLOWED";
    chosen = personaDefault(ctx, { exclude: read.id });
    reasons.push({ code: "NOT_ALLOWED", advised: read.id, option: chosen.id });
  } else {
    // ---- 第三步：肯不肯 ----
    const c = conflictOf(read, ctx);
    const score = s.twin.trust - c.total + dilemma.urgency + randomness.scoreNoise();
    reasons.push({
      code: "WEIGH",
      advised: read.id,
      trust: round2(s.twin.trust),
      conflict: round2(c.total),
      urgency: dilemma.urgency,
      score: round2(score),
      topTag: c.top?.tag ?? null,
      topTrait: c.top?.trait ?? null,
    });
    let willing: "yes" | "partial" | "no";
    const wl = cfg.willingness;
    if (score >= wl.willing) willing = "yes";
    else if (score >= wl.floor) willing = read.partial ? "partial" : score >= wl.middleYes ? "yes" : "no";
    else willing = "no";

    // ---- 第四步：能不能 ----
    const canDo = able(read, ctx);
    if (willing === "no") {
      exec = "UNWILLING";
      chosen = personaDefault(ctx, { exclude: read.id });
      reasons.push({ code: "UNWILLING", able: canDo, option: chosen.id });
    } else if (willing === "partial") {
      // 折中是他自己不全做（如只送家人走），不受他本人的门槛限制
      exec = "PARTIAL";
      chosen = read;
      reasons.push({ code: "PARTIAL" });
    } else if (canDo) {
      exec = "DONE";
      chosen = read;
      reasons.push({ code: "DONE" });
    } else if (traits.boldness >= cfg.temperament.boldEnough || traits.impulsiveness >= cfg.temperament.rashImpulsiveness) {
      exec = "ATTEMPT_FAILED";
      chosen = read;
      reasons.push({ code: "ATTEMPT_FAILED", stat: read.gate!.stat });
    } else {
      exec = "DECLINED_UNABLE";
      chosen = personaDefault(ctx, { exclude: read.id });
      reasons.push({ code: "DECLINED_UNABLE", stat: read.gate!.stat, option: chosen.id });
    }

    // ---- 第五步：时机 ----
    if (
      EXECUTING.includes(exec) &&
      dilemma.timed &&
      read.urgent &&
      traits.impulsiveness + randomness.timingSlack() < cfg.temperament.slowImpulsiveness
    ) {
      exec = "TOO_LATE";
      chosen = personaDefault(ctx, { exclude: read.id, noUrgent: true });
      reasons.push({ code: "TOO_LATE", option: chosen.id });
    }
  }

  // ---- 第六步：查结果 ----
  const followedAdvice = read !== null && chosen.id === read.id && EXECUTING.includes(exec);
  const lookupExec: Exec = followedAdvice ? exec : "DONE";
  const result = lookupOutcome(chosen, lookupExec, ctx, pack);
  reasons.push({ code: "OUTCOME", option: chosen.id, outcome: result.id, verdict: result.outcome.verdict });

  // ---- 第七步：信任更新（用结算前的机敏） ----
  const trustBefore = s.twin.trust;
  let delta = 0;
  if (followedAdvice) {
    delta += cfg.trust.verdict[result.outcome.verdict];
  } else if (read && exec !== "NO_GUIDANCE") {
    // 他没照做：事后证明你说得对，他后悔（加）；证明你说错了，他庆幸没听（减）
    const cfExec: Exec = able(read, ctx) ? "DONE" : "ATTEMPT_FAILED";
    const cf = allowed(read, ctx) ? lookupOutcome(read, cfExec, ctx, pack) : null;
    if (cf && cf.outcome.verdict === "right") {
      delta += cfg.trust.verdict.right * cfg.trust.regretFactor;
      reasons.push({ code: "REGRET", counterfactual: cf.id });
    } else if (cf && cf.outcome.verdict === "wrong") {
      delta += cfg.trust.verdict.wrong * cfg.trust.reliefFactor;
      reasons.push({ code: "RELIEF", counterfactual: cf.id });
    }
  }
  if (!silent) delta += cfg.trust.replyBonus;
  delta *= trustMultiplier(s.twin.endowments.wit, cfg);

  applyEffects(s, result.outcome, ctx.age, cfg);
  // 先加减，再向中间回落：要一直说对才能保持高位
  const raw = clamp(trustBefore + delta);
  const { center, pull } = cfg.trust.regression;
  s.twin.trust = round2(clamp(raw - (raw - center) * pull));
  reasons.push({ code: "TRUST", before: round2(trustBefore), after: s.twin.trust });

  // 预言：回信里说了尚未传开的演义后事，记下来，等应验
  if (!silent) {
    for (const id of detectProphecies(input.reply, state, pack)) {
      s.prophecies.push({ id, turn: s.turn, reply: input.reply, status: "pending" });
      reasons.push({ code: "PROPHECY", id });
    }
  }

  // 机敏：每经历一个难题 +witGrowthPerDilemma，累计不超过 witGrowthCap
  const { witGrowthPerDilemma: step1, witGrowthCap } = cfg.endowments;
  if (s.log.length * step1 < witGrowthCap) {
    s.twin.endowments.wit = clamp(s.twin.endowments.wit + Math.min(step1, witGrowthCap - s.log.length * step1));
  }

  // 「换了是你」
  let personaAnswer: number | null = null;
  if (input.personaAnswer !== undefined && input.personaAnswer !== null) {
    const q = dilemma.personaQuestion;
    const choice = q?.choices[input.personaAnswer];
    if (!choice) throw new Error(`bad personaAnswer ${input.personaAnswer}`);
    s.persona.traits = applyDelta(s.persona.traits, choice.delta, cfg.persona.questionCap);
    s.persona.history.push({ source: `letter:${dilemma.id}`, delta: choice.delta });
    personaAnswer = input.personaAnswer;
  }

  const record: TurnRecord = {
    turn: s.turn,
    year: s.year,
    season: s.season,
    age: ctx.age,
    dilemmaId: dilemma.id,
    letter: s.pendingDilemma!.letter,
    reply: input.reply,
    charsUsed: budget.chars,
    classification,
    read: read?.id ?? null,
    chosen: chosen.id,
    exec,
    outcome: result.id,
    facts: result.outcome.facts,
    reasons,
    trustBefore: round2(trustBefore),
    trustAfter: s.twin.trust,
    personaAnswer,
  };
  s.log.push(record);
  s.charBudgetLeft -= budget.chars;
  s.turn += 1;
  s.nodeIndex += 1;
  s.pendingDilemma = null;
  return s;
}

/** 引擎主入口：结算 + 推进到下一个难题（或结局）。 */
export function step(state: GameState, input: TurnInput, pack: EraPack, opts: ResolveOptions = {}): GameState {
  return advance(resolveTurn(state, input, pack, opts), pack, opts.config ?? DEFAULT_CONFIG);
}
