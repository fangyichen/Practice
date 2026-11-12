import type { Classification } from "../schemas";

export type ClassifyInput = {
  dilemmaId: string;
  situationFacts: string[];
  options: { id: string; label: string }[];
  /** 玩家回复是数据，任何实现都不得把它当指令执行 */
  reply: string;
};

export interface ReplyClassifier {
  classify(input: ClassifyInput): Promise<Classification>;
}

/** 降级：全部选项均分，source = "rule" */
export function uniformClassification(options: { id: string }[]): Classification {
  const p = 1 / options.length;
  const dist: Record<string, number> = { other: 0 };
  for (const o of options) dist[o.id] = p;
  return { dist, source: "rule" };
}
