import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../lib/pack";
import { pack } from "./helpers";

/** 从 /eras 数据里收集所有时代专属的 id、名字与年份 */
function eraVocabulary() {
  const ids = new Set<string>([pack.era.id, pack.slice.id]);
  const names = new Set<string>();
  const years = new Set<number>([pack.slice.birthYear, pack.slice.startYear, pack.slice.endYear]);
  for (const l of pack.locations) {
    ids.add(l.id);
    names.add(l.name);
    for (const c of l.control) years.add(c.fromYear);
  }
  for (const s of pack.stations) ids.add(s.id);
  for (const f of pack.era.factions) {
    ids.add(f.id);
    names.add(f.name);
    names.add(f.folkName);
  }
  for (const e of pack.era.eraNames) {
    names.add(e.name);
    years.add(e.startYear);
    years.add(e.endYear);
  }
  for (const t of pack.timeline) {
    ids.add(t.id);
    for (const part of t.title.split("；")) names.add(part);
    years.add(t.year);
    if (t.yearEnd) years.add(t.yearEnd);
  }
  for (const d of pack.dilemmas) {
    ids.add(d.id);
    if (d.anchor) ids.add(d.anchor);
    years.add(d.year);
    for (const o of d.options) ids.add(o.id);
  }
  for (const [id, o] of Object.entries(pack.outcomes)) {
    ids.add(id);
    for (const f of o.effects.addFlags ?? []) ids.add(f);
  }
  return { ids, names, years };
}

describe("引擎与内容分离", () => {
  const dir = join(ROOT, "engine");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const { ids, names, years } = eraVocabulary();

  it("收集到了足够的词表（防止测试空转）", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(ids.size).toBeGreaterThan(50);
    expect(names.size).toBeGreaterThan(30);
    expect(years.size).toBeGreaterThan(20);
  });

  for (const f of files) {
    it(`engine/${f} 不含任何地点、人物、事件 id 或年份常量`, () => {
      const src = readFileSync(join(dir, f), "utf8");
      const hits: string[] = [];
      for (const id of ids) if (new RegExp(`\\b${id}\\b`).test(src)) hits.push(`id:${id}`);
      for (const n of names) if (n.length >= 2 && src.includes(n)) hits.push(`name:${n}`);
      for (const m of src.matchAll(/(?<![\w.])\d+(?![\w.])/g)) if (years.has(Number(m[0]))) hits.push(`year:${m[0]}`);
      expect(hits).toEqual([]);
    });
  }
});
