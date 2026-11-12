import type { Classification } from "../schemas";
import { normalizeReply } from "./normalize";
import { uniformClassification, type ClassifyInput, type ReplyClassifier } from "./types";

export type FixtureEntry = {
  reply: string;
  category: "clear" | "ambiguous" | "prophecy" | "noise";
  dist: Record<string, number>;
  note?: string;
};
export type FixtureFile = { _note: string; dilemmas: Record<string, FixtureEntry[]> };

/**
 * M0/M1 用的分类器：查 fixtures/replies.json。未命中走降级（均分）。
 * 分布是实现者人工估计的，不是校准过的概率。
 */
export class FixtureClassifier implements ReplyClassifier {
  private readonly index = new Map<string, Record<string, number>>();

  constructor(fixtures: FixtureFile) {
    for (const [dilemmaId, entries] of Object.entries(fixtures.dilemmas)) {
      for (const e of entries) this.index.set(`${dilemmaId}|${normalizeReply(e.reply)}`, e.dist);
    }
  }

  /** 同步查表：命中返回分类，未命中返回 null。 */
  lookup(dilemmaId: string, reply: string): Classification | null {
    const dist = this.index.get(`${dilemmaId}|${normalizeReply(reply)}`);
    if (!dist) return null;
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const norm: Record<string, number> = {};
    for (const [k, v] of Object.entries(dist)) norm[k] = v / total;
    return { dist: norm, source: "fixture" };
  }

  classifySync(input: ClassifyInput): Classification {
    return this.lookup(input.dilemmaId, input.reply) ?? uniformClassification(input.options);
  }

  async classify(input: ClassifyInput): Promise<Classification> {
    return this.classifySync(input);
  }
}
