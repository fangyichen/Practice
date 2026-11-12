/**
 * 结局与留痕（8.4）。全部确定性：
 * - 等级、留痕物、事迹由 traces.json 的规则从 flags/standing/craft/station 判定；
 * - 记载与墓志的模板「挑哪一条」用种子 + 姓名的哈希决定（纯函数，不是 RNG 调用）；
 * - 墓志的统计规则是通用的（只看日志、exec、标签、flag），具体文字在数据包里。
 */
import type { EngineConfig, EpitaphRule, EraPack, GameState, TraceCond, TurnRecord } from "../schemas";
import type { Ending } from "../schemas";
import { DEFAULT_CONFIG } from "./config";
import { tier } from "./endowments";
import { clamp } from "./util";
import { ageOf, controllerOf } from "./world";


/** 字符串哈希（FNV-1a），用来在等价的模板之间做确定性挑选 */
export function hashOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashPick<T>(items: readonly T[], key: string): T {
  if (items.length === 0) throw new Error("hashPick: empty list");
  return items[hashOf(key) % items.length] as T;
}

const DIGITS = "〇一二三四五六七八九";

/** 0–999 的中文数字（十一、二十、一百零五） */
export function zhNumber(n: number): string {
  n = Math.max(0, Math.floor(n));
  if (n < 10) return DIGITS[n] as string;
  if (n < 20) return "十" + (n % 10 ? DIGITS[n % 10] : "");
  if (n < 100) return DIGITS[Math.floor(n / 10)] + "十" + (n % 10 ? DIGITS[n % 10] : "");
  if (n < 1000) {
    const rest = n % 100;
    const head = DIGITS[Math.floor(n / 100)] + "百";
    if (rest === 0) return head;
    return head + (rest < 10 ? "零" + DIGITS[rest] : rest < 20 ? "一" + zhNumber(rest) : zhNumber(rest));
  }
  return String(n);
}

/** 纪年：按年份与当地归属在 era.json 的纪年表里取年号（「某某十三年」） */
export function eraYear(pack: EraPack, year: number, faction: string | null): string {
  const cands = pack.era.eraNames.filter((e) => e.startYear <= year && year <= e.endYear);
  const pick =
    cands.filter((e) => e.faction && e.faction === faction).sort((a, b) => b.startYear - a.startYear)[0] ??
    cands.filter((e) => !e.faction).sort((a, b) => b.startYear - a.startYear)[0] ??
    cands.sort((a, b) => b.startYear - a.startYear)[0];
  if (!pick) return `${year} 年`;
  const n = year - pick.startYear + 1;
  return `${pick.name}${n === 1 ? "元" : zhNumber(n)}年`;
}

type Facts = { flags: string[]; standing: number; craft: number; wealth: number; children: number; station: string; alive: boolean; spouse: boolean };

export function traceCondHolds(c: TraceCond, f: Facts): boolean {
  if (c.hasFlag && !c.hasFlag.every((x) => f.flags.includes(x))) return false;
  if (c.anyFlag && !c.anyFlag.some((x) => f.flags.includes(x))) return false;
  if (c.standingAtLeast !== undefined && f.standing < c.standingAtLeast) return false;
  if (c.craftAtLeast !== undefined && f.craft < c.craftAtLeast) return false;
  if (c.wealthAtLeast !== undefined && f.wealth < c.wealthAtLeast) return false;
  if (c.childrenAtLeast !== undefined && f.children < c.childrenAtLeast) return false;
  if (c.station && !c.station.includes(f.station)) return false;
  if (c.alive !== undefined && c.alive !== f.alive) return false;
  if (c.spouse !== undefined && c.spouse !== f.spouse) return false;
  return true;
}

function optionOf(pack: EraPack, r: TurnRecord, id: string | null) {
  return pack.dilemmas.find((d) => d.id === r.dilemmaId)?.options.find((o) => o.id === id);
}

/** 第一次拿到某个 flag 的那一轮（用于记载里的纪年） */
function turnThatAdded(pack: EraPack, log: TurnRecord[], flag: string): TurnRecord | undefined {
  return log.find((r) => {
    const e = pack.outcomes[r.outcome]?.effects;
    return !!e && ((e.addFlags ?? []).includes(flag) || (e.addFlagsIfTier ?? []).some((x) => x.flag === flag));
  });
}

type EpitaphCtx = { state: GameState; pack: EraPack; lifespan: number; children: number };

/** 判定一条墓志规则；命中时返回槽位 */
function epitaphSlots(rule: EpitaphRule, ctx: EpitaphCtx): Record<string, string> | null {
  const { state, pack } = ctx;
  const log = state.log;
  const t = state.twin;
  const answered = log.filter((r) => r.charsUsed > 0);
  const n = rule.n ?? 0;
  const z = zhNumber;
  const base: Record<string, string> = {
    ta: t.gender === "f" ? "她" : "他",
    letters: z(log.length),
    answered: z(answered.length),
    age: z(ageOf(state)),
    lifespan: z(ctx.lifespan),
    children: z(ctx.children),
  };
  const last = log[log.length - 1];
  if (rule.alive !== undefined && rule.alive !== t.alive) return null;

  switch (rule.kind) {
    case "lastExec": {
      if (!last || last.exec !== rule.exec) return null;
      const label = optionOf(pack, last, last.read ?? last.chosen)?.label ?? "";
      return { ...base, label };
    }
    case "execCountAtLeast": {
      const k = log.filter((r) => r.exec === rule.exec).length;
      return k >= n ? { ...base, n: z(k) } : null;
    }
    case "advisedTagNeverDone": {
      const advised = log.filter((r) => r.read && optionOf(pack, r, r.read)?.tags.includes(rule.tag ?? ""));
      if (advised.length < n) return null;
      if (advised.some((r) => r.exec === "DONE" || r.exec === "PARTIAL")) return null;
      return { ...base, n: z(advised.length) };
    }
    case "silenceMajority": {
      if (log.length < Math.max(4, n)) return null;
      return answered.length * 2 < log.length ? base : null;
    }
    case "budgetLeftAtLeast":
      return state.charBudgetLeft >= n ? { ...base, k: z(state.charBudgetLeft) } : null;
    case "trustRose": {
      const first = log[0];
      if (!first || !last || first.trustBefore >= n || last.exec !== "DONE") return null;
      return base;
    }
    case "allDone":
      return answered.length >= n && answered.every((r) => r.exec === "DONE") ? base : null;
    case "noneDone":
      return answered.length >= n && answered.every((r) => r.exec !== "DONE" && r.exec !== "PARTIAL") ? base : null;
    case "regretAtLeast": {
      const k = log.filter((r) => r.reasons.some((x) => x.code === "REGRET")).length;
      return k >= n ? { ...base, n: z(k) } : null;
    }
    case "diedYoung": {
      if (t.alive || ageOf(state) > n) return null;
      const lastReply = [...answered].reverse()[0]?.reply ?? "";
      return lastReply ? { ...base, reply: lastReply } : null;
    }
    case "hasFlag":
      return rule.flag && t.flags.includes(rule.flag) ? base : null;
    case "wrongMajority": {
      const done = log.filter((r) => r.exec === "DONE");
      const wrong = done.filter((r) => pack.outcomes[r.outcome]?.verdict === "wrong");
      return done.length >= Math.max(3, n) && wrong.length * 2 >= done.length ? { ...base, n: z(wrong.length), m: z(done.length) } : null;
    }
    case "repeatedReply": {
      const count = new Map<string, number>();
      for (const r of answered) count.set(r.reply, (count.get(r.reply) ?? 0) + 1);
      const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= n ? { ...base, reply: best[0], n: z(best[1]) } : null;
    }
    case "neverMarried":
      return t.alive && !t.household.spouse ? base : null;
    case "longLife":
      return t.alive && ctx.lifespan >= n ? base : null;
    case "fallback":
      return base;
  }
}

function fill(tpl: string, slots: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => slots[k] ?? m);
}

export function computeEnding(state: GameState, cause: Ending["cause"], pack: EraPack, cfg: EngineConfig = DEFAULT_CONFIG): Ending {
  const tr = pack.traces;
  const t = state.twin;
  const age = ageOf(state);
  const key = `${state.seed}|${t.name}|${t.birthYear}`;

  // 余生概要
  const a = tr.afterlife;
  let lifespan = age;
  let children = t.household.children;
  if (t.alive) {
    const est = a.baseAge + (t.health - 50) / a.healthDivisor + tier(t.endowments.physique) * a.physiqueTierBonus;
    lifespan = Math.round(clamp(est, Math.max(a.minAge, age + 1), a.maxAge));
    if (t.household.spouse) children += a.childrenIfSpouse + Math.floor(t.wealth / a.wealthPerChild);
  } else if (t.household.spouse) {
    children += 1;
  }
  children = Math.min(children, a.maxChildren);

  const facts: Facts = {
    flags: t.flags,
    standing: t.standing,
    craft: t.craft,
    wealth: t.wealth,
    children,
    station: t.station,
    alive: t.alive,
    spouse: t.household.spouse,
  };

  // 等级
  let level = 0;
  for (const r of [...tr.rules].sort((x, y) => y.tier - x.tier)) {
    if (traceCondHolds(r.when, facts)) {
      level = r.tier;
      break;
    }
  }

  // 留痕物
  const arts = tr.artifacts.filter((x) => x.tier === level && (!x.when || traceCondHolds(x.when, facts)));
  const pool = arts.length ? arts : tr.artifacts.filter((x) => x.tier === level && !x.when);
  const art = hashPick(pool.length ? pool : tr.artifacts, `${key}|art`);

  // 事迹与纪年
  const deedHit = tr.deeds.find((d) => t.flags.includes(d.flag));
  const deedTurn = deedHit ? turnThatAdded(pack, state.log, deedHit.flag) : undefined;
  const deed = deedHit?.text ?? hashPick(tr.fallbackDeeds[t.station] ?? tr.fallbackDeeds["*"] ?? ["务农"], `${key}|deed`);
  const deedYear = deedTurn?.year ?? state.year;
  const place = pack.locations.find((l) => l.id === t.location)?.name ?? t.location;
  const faction = controllerOf(pack.locations, t.location, deedYear, deedTurn?.season ?? state.season);
  // 身份名里的括注不进记载
  const station = (pack.stations.find((s) => s.id === t.station)?.name ?? t.station).replace(/[（(][^）)]*[）)]/g, "");
  const recordTpl = hashPick(tr.records[String(level) as "0" | "1" | "2" | "3"], `${key}|rec`);
  const record = fill(recordTpl, {
    name: t.name,
    surname: [...t.name][0] ?? t.name,
    place,
    eraYear: eraYear(pack, deedYear, faction),
    deed,
    artifact: art.name,
    station,
    ta: t.gender === "f" ? "她" : "他",
  });

  // 墓志
  const ctx: EpitaphCtx = { state, pack, lifespan, children };
  let epitaph = "";
  let epitaphRule = "";
  for (const rule of tr.epitaphs) {
    const slots = epitaphSlots(rule, ctx);
    if (slots) {
      epitaph = fill(hashPick(rule.templates, `${key}|epi|${rule.id}`), { name: t.name, ...slots });
      epitaphRule = rule.id;
      break;
    }
  }

  void cfg;
  return {
    cause,
    year: state.year,
    age,
    tier: level,
    tierName: tr.tierNames[level] as string,
    artifact: art.id,
    artifactName: art.name,
    artifactKind: art.kind,
    record,
    epitaph,
    epitaphRule,
    deathYear: t.birthYear + lifespan,
    lifespan,
    children,
  };
}
