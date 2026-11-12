import { ClassificationSchema, type Classification } from "../schemas";
import { FixtureClassifier, type FixtureFile } from "./fixture";
import { uniformClassification, type ClassifyInput, type ReplyClassifier } from "./types";

export { FixtureClassifier, type FixtureFile, type FixtureEntry } from "./fixture";
export { normalizeReply } from "./normalize";
export { uniformClassification, type ClassifyInput, type ReplyClassifier } from "./types";

/** 按环境变量 CLASSIFIER 选择实现。M0 只有 fixture。 */
export function createClassifier(kind: string | undefined, fixtures: FixtureFile): ReplyClassifier {
  switch (kind ?? "fixture") {
    case "fixture":
      return new FixtureClassifier(fixtures);
    case "jev":
    case "llm":
      throw new Error(`CLASSIFIER=${kind} 在 M0 中未实现（属于 M4）`);
    default:
      throw new Error(`unknown CLASSIFIER: ${kind}`);
  }
}

/**
 * 任何实现失败、或输出不合 schema、或含未知选项时，降级为均分。
 * 只返回分布，不做别的事。
 */
export async function safeClassify(classifier: ReplyClassifier, input: ClassifyInput): Promise<Classification> {
  try {
    const c = ClassificationSchema.parse(await classifier.classify(input));
    const ids = new Set([...input.options.map((o) => o.id), "other"]);
    if (Object.keys(c.dist).some((k) => !ids.has(k))) return uniformClassification(input.options);
    return c;
  } catch {
    return uniformClassification(input.options);
  }
}
