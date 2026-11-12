/**
 * 时代包与卷的纪律检查（第 6 节「写难题的纪律」与 8.1 保护规则）。
 *
 * profile:
 *   full —— 文档原样：每局 9–12 个难题；前 3 个难题不得致死。
 *   m0   —— M0 放宽：每局恰好经历 3 个难题；保护规则只覆盖前 2 个
 *           （M0 只有 3 个难题，第 3 个就是 208 年去留，文档样例里它本身含致死结果）。
 */
import { ENDOWMENT_KEYS, type Dilemma, type EraPack, type Outcome } from "../schemas";
import { isKnownTag, PERSONA_QUESTION_CAP } from "../engine/traits";

export type Profile = "m0" | "full";
export type Issue = { level: "error" | "warn"; where: string; msg: string };

const PROFILES: Record<Profile, { pathMin: number; pathMax: number; protectFirst: number }> = {
  full: { pathMin: 9, pathMax: 12, protectFirst: 3 },
  m0: { pathMin: 3, pathMax: 3, protectFirst: 2 },
};

type AbsState = { loc: string; alive: boolean; flags: string[]; spouse: boolean };

/** 抽象地判断节点条件：能确定的字段直接判断，档位/年龄/身份当作「两种都可能」。 */
function absCondition(d: Dilemma, s: AbsState): "yes" | "no" | "maybe" {
  const c = d.condition;
  if (c.alive !== undefined && c.alive !== s.alive) return "no";
  if (c.where && !c.where.includes(s.loc)) return "no";
  if (c.spouse !== undefined && c.spouse !== s.spouse) return "no";
  if (c.hasFlag && !c.hasFlag.every((f) => s.flags.includes(f))) return "no";
  if (c.notFlag && c.notFlag.some((f) => s.flags.includes(f))) return "no";
  if (c.station || c.tierAtLeast || c.tierBelow || c.minAge !== undefined || c.maxAge !== undefined) return "maybe";
  return "yes";
}

function applyAbs(s: AbsState, o: Outcome): AbsState {
  const e = o.effects;
  const flags = new Set(s.flags);
  for (const f of e.addFlags ?? []) flags.add(f);
  for (const f of e.addFlagsIfTier ?? []) flags.add(f.flag);
  for (const f of e.removeFlags ?? []) flags.delete(f);
  return {
    loc: e.location ?? s.loc,
    alive: e.alive ?? s.alive,
    spouse: e.spouse ?? s.spouse,
    flags: [...flags].sort(),
  };
}

/** 枚举所有分支（过近似：每个选项的每条结果规则都视为可能）。 */
export function enumeratePaths(pack: EraPack, protectFirst: number) {
  const nodes = pack.slice.nodes.map((id) => pack.dilemmas.find((d) => d.id === id)!);
  let min = Infinity;
  let max = -Infinity;
  const lethalEarly: string[] = [];
  const seen = new Set<string>();

  const walk = (i: number, s: AbsState, count: number): void => {
    const key = `${i}|${s.loc}|${s.alive}|${s.spouse}|${s.flags.join(",")}|${count}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (i >= nodes.length || !s.alive) {
      min = Math.min(min, count);
      max = Math.max(max, count);
      return;
    }
    const d = nodes[i]!;
    const cond = absCondition(d, s);
    if (cond !== "yes") walk(i + 1, s, count);
    if (cond === "no") return;
    for (const opt of d.options) {
      for (const r of opt.results) {
        const o = pack.outcomes[r.outcome];
        if (!o) continue;
        if (count < protectFirst && o.effects.alive === false) {
          lethalEarly.push(`${d.id}/${opt.id} -> ${r.outcome}（第 ${count + 1} 个难题）`);
        }
        walk(i + 1, applyAbs(s, o), count + 1);
      }
    }
  };

  for (const loc of pack.slice.birthLocations) walk(0, { loc, alive: true, flags: [], spouse: false }, 0);
  return { min, max, lethalEarly: [...new Set(lethalEarly)] };
}

export function validateEra(pack: EraPack, profile: Profile = "full"): Issue[] {
  const cfg = PROFILES[profile];
  const issues: Issue[] = [];
  const err = (where: string, msg: string) => issues.push({ level: "error", where, msg });
  const warn = (where: string, msg: string) => issues.push({ level: "warn", where, msg });

  const stationIds = new Set(pack.stations.map((s) => s.id));
  const locIds = new Set(pack.locations.map((l) => l.id));
  const factionIds = new Set(pack.era.factions.map((f) => f.id));
  const usedOutcomes = new Set<string>();

  // ---- 卷 ----
  if (pack.slice.birth.mode !== "rolled") err("slice", `birth.mode=${pack.slice.birth.mode} 未支持`);
  for (const l of pack.slice.birthLocations) if (!locIds.has(l)) err("slice", `出生地 ${l} 不在 locations.json`);
  let prevIdx = -Infinity;
  for (const id of pack.slice.nodes) {
    const d = pack.dilemmas.find((x) => x.id === id);
    if (!d) {
      err("slice", `节点 ${id} 不在 dilemmas.json`);
      continue;
    }
    const idx = d.year * 4 + d.season;
    if (idx < prevIdx) err(id, "节点顺序与年份不一致");
    prevIdx = idx;
    if (d.year < pack.slice.startYear || d.year > pack.slice.endYear) err(id, "年份不在本卷范围内");
  }
  for (const d of pack.dilemmas) if (!pack.slice.nodes.includes(d.id)) warn(d.id, "难题未出现在 slice.nodes 中");

  // ---- 每个难题 ----
  let gatedDilemmas = 0;
  const gateCount: Record<string, number> = { physique: 0, wit: 0, looks: 0 };
  let highLooksResults = 0;
  let highLooksBad = 0;

  for (const d of pack.dilemmas) {
    const w = d.id;
    if (d.options.length < 2 || d.options.length > 3) err(w, `选项数 ${d.options.length}，第一版要求 2–3 个`);
    const ids = d.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) err(w, "选项 id 重复");
    if (!d.options.some((o) => !o.gate && !o.requires)) err(w, "没有既无 gate 也无 requires 的选项");
    if (d.options.some((o) => o.gate)) gatedDilemmas++;
    if (!d.fallbackLetter.trim()) err(w, "缺少 fallbackLetter");
    if (d.timed && !d.options.some((o) => o.urgent)) warn(w, "timed 难题没有标记 urgent 的选项，时机判定不会生效");
    if (d.timed && !d.options.some((o) => !o.urgent && !o.gate && !o.requires)) err(w, "timed 难题没有可供误时后退守的选项");
    for (const q of d.personaQuestion?.choices ?? []) {
      for (const [k, v] of Object.entries(q.delta)) {
        if (Math.abs(v as number) > PERSONA_QUESTION_CAP) err(w, `「换了是你」${k} 调整 ${v} 超过 ±${PERSONA_QUESTION_CAP}`);
      }
    }
    for (const l of d.condition.where ?? []) if (!locIds.has(l)) err(w, `condition.where ${l} 不存在`);
    for (const s of d.condition.station ?? []) if (!stationIds.has(s)) err(w, `condition.station ${s} 不存在`);

    for (const opt of d.options) {
      const ow = `${w}/${opt.id}`;
      if (opt.gate) gateCount[opt.gate.stat] = (gateCount[opt.gate.stat] ?? 0) + 1;
      for (const tag of opt.tags) if (!isKnownTag(tag)) warn(ow, `标签 ${tag} 不在引擎冲突表中，冲突恒为 0`);
      for (const s of opt.requires?.station ?? []) if (!stationIds.has(s)) err(ow, `requires.station ${s} 不存在`);

      const needed = new Set<string>(["DONE"]);
      if (opt.gate) needed.add("ATTEMPT_FAILED");
      if (opt.partial) needed.add("PARTIAL");
      const present = new Set<string>(opt.results.map((r) => r.when.exec));
      for (const e of needed) if (!present.has(e)) err(ow, `results 缺少 exec=${e}`);
      for (const e of present) {
        if (!needed.has(e)) warn(ow, `results 含不会出现的 exec=${e}`);
        const rules = opt.results.filter((r) => r.when.exec === e);
        const last = rules[rules.length - 1]!;
        if (Object.keys(last.when).length !== 1) err(ow, `exec=${e} 的最后一条规则带了其他条件，缺少兜底`);
      }
      for (const r of opt.results) {
        usedOutcomes.add(r.outcome);
        const o = pack.outcomes[r.outcome];
        if (!o) {
          err(ow, `outcome ${r.outcome} 不在 outcomes.json`);
          continue;
        }
        for (const s of r.when.station ?? []) if (!stationIds.has(s)) err(ow, `when.station ${s} 不存在`);
        if ((r.when.tierAtLeast?.looks ?? 0) >= 3) {
          highLooksResults++;
          if (o.verdict === "wrong" || o.verdict === "mixed") highLooksBad++;
        }
      }
    }
  }

  if (gatedDilemmas * 2 < pack.dilemmas.length) err("slice", `含 gate 的难题 ${gatedDilemmas}/${pack.dilemmas.length}，不足一半`);
  const gc = ENDOWMENT_KEYS.map((k) => gateCount[k] ?? 0);
  if (Math.max(...gc) - Math.min(...gc) > 2) err("slice", `三项禀赋作为 gate 的次数不均衡：${JSON.stringify(gateCount)}`);
  if (highLooksResults > 0 && highLooksBad * 3 < highLooksResults) {
    err("slice", `高相貌触发的结果里坏结果 ${highLooksBad}/${highLooksResults}，不足三分之一`);
  }

  // ---- 结果 ----
  for (const [id, o] of Object.entries(pack.outcomes)) {
    if (!usedOutcomes.has(id)) warn(id, "outcome 未被任何规则引用");
    if (o.effects.location && !locIds.has(o.effects.location)) err(id, `location ${o.effects.location} 不存在`);
    if (o.effects.allegiance && !factionIds.has(o.effects.allegiance)) err(id, `allegiance ${o.effects.allegiance} 不存在`);
  }

  // ---- 分支枚举 ----
  const paths = enumeratePaths(pack, cfg.protectFirst);
  if (paths.min < cfg.pathMin || paths.max > cfg.pathMax) {
    err("slice", `一局经历的难题数 ${paths.min}–${paths.max}，要求 ${cfg.pathMin}–${cfg.pathMax}`);
  }
  for (const l of paths.lethalEarly) err("protect", `前 ${cfg.protectFirst} 个难题出现致死结果：${l}`);

  return issues;
}
