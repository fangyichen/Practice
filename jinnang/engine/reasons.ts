/**
 * 把一轮的结构化原因渲染成一句人话（8.2「原因说明」）。只用模板，不调模型。
 * 模板文字在 content/reasons.json，这里只做选择与填空。
 */
import type { Dilemma, TurnRecord } from "../schemas";

export type ReasonTemplates = {
  trustWords: string[];
  tagPhrases: Record<string, string>;
  statFail: Record<string, string>;
  statKnow: Record<string, string>;
  templates: Record<string, string>;
};

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function trustWord(trust: number, words: string[]): string {
  const i = Math.max(0, Math.min(words.length - 1, Math.round(trust / 10)));
  return words[i] ?? "";
}

/** 选模板键，按优先级。返回 null 表示没有可说的。 */
function templateKey(rec: TurnRecord): string {
  const codes = new Set(rec.reasons.map((r) => r.code));
  if (codes.has("SILENCE")) return "NO_GUIDANCE.silence";
  if (codes.has("NO_READING")) return "NO_GUIDANCE.unclear";
  if (codes.has("MISREAD_BY_TRAITS") && rec.exec === "DONE") return "MISREAD_BY_TRAITS";
  switch (rec.exec) {
    case "NOT_ALLOWED":
      return "NOT_ALLOWED";
    case "TOO_LATE":
      return "TOO_LATE";
    case "ATTEMPT_FAILED":
      return "ATTEMPT_FAILED";
    case "DECLINED_UNABLE":
      return "DECLINED_UNABLE";
    case "PARTIAL":
      return "PARTIAL";
    case "UNWILLING": {
      const u = rec.reasons.find((r) => r.code === "UNWILLING");
      const w = rec.reasons.find((r) => r.code === "WEIGH");
      if (u?.able === true && w?.topTag) return "UNWILLING.conflict";
      if (u?.able === true) return "UNWILLING.able";
      return "UNWILLING.unable";
    }
    case "DONE":
      return codes.has("MISREAD_BY_TRAITS") ? "MISREAD_BY_TRAITS" : "DONE";
    default:
      return "NO_GUIDANCE.unclear";
  }
}

export function renderReason(rec: TurnRecord, dilemma: Dilemma, t: ReasonTemplates): string {
  const label = (id: unknown) => dilemma.options.find((o) => o.id === id)?.label ?? "";
  const weigh = rec.reasons.find((r) => r.code === "WEIGH");
  const misread = rec.reasons.find((r) => r.code === "MISREAD_BY_TRAITS");
  const gateStat = rec.reasons.find((r) => r.code === "ATTEMPT_FAILED" || r.code === "DECLINED_UNABLE")?.stat;
  const vars: Record<string, string> = {
    trust: trustWord(rec.trustBefore, t.trustWords),
    reply: rec.reply.trim(),
    option: label(rec.chosen),
    advised: label(rec.read),
    read: label(misread?.read ?? rec.read),
    tagPhrase: (weigh?.topTag && t.tagPhrases[String(weigh.topTag)]) || t.tagPhrases["_default"] || "",
    statFail: gateStat ? (t.statFail[String(gateStat)] ?? "") : "",
    statKnow: gateStat ? (t.statKnow[String(gateStat)] ?? "") : "",
  };
  const key = templateKey(rec);
  const tpl = t.templates[key] ?? t.templates["NO_GUIDANCE.unclear"] ?? "";
  return fill(tpl, vars);
}
