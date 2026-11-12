import { describe, expect, it } from "vitest";
import { checkReply, countChars } from "../engine";
import { fixedBirth, pack, persona, start } from "./helpers";
import { step } from "../engine";

describe("字数预算", () => {
  it("按字素计，空白与标点不计", () => {
    expect(countChars("随皇叔走")).toBe(4);
    expect(countChars("随，皇叔！走。")).toBe(4);
    expect(countChars(" 随 皇 叔 走 ")).toBe(4);
    expect(countChars("“走”……")).toBe(1);
    expect(countChars("！？。，、")).toBe(0);
    expect(countChars("走👨‍👩‍👧")).toBe(2);
    expect(countChars("ok")).toBe(2);
  });

  it("单封超过 10 字拒绝，10 字正好通过", () => {
    expect(checkReply("一二三四五六七八九十", 100)).toEqual({ ok: true, chars: 10 });
    expect(checkReply("一二三四五，六七八九十。", 100)).toEqual({ ok: true, chars: 10 });
    expect(checkReply("一二三四五六七八九十一", 100)).toMatchObject({ ok: false, code: "OVER_LETTER_LIMIT" });
  });

  it("超过余生预算拒绝；预算耗尽后只能沉默", () => {
    expect(checkReply("一二三四五", 4)).toMatchObject({ ok: false, code: "OVER_BUDGET" });
    expect(checkReply("一二三四", 4)).toEqual({ ok: true, chars: 4 });
    expect(checkReply("走", 0)).toMatchObject({ ok: false, code: "BUDGET_EXHAUSTED" });
    expect(checkReply("", 0)).toEqual({ ok: true, chars: 0 });
    expect(checkReply("。。。", 0)).toEqual({ ok: true, chars: 0 });
  });

  it("超长原始字符串拒绝", () => {
    expect(checkReply("，".repeat(500), 100)).toMatchObject({ ok: false, code: "TOO_LONG_RAW" });
  });

  it("引擎扣减预算，并拒绝超限回复", () => {
    const s0 = start(persona("ISTP"), "wit", fixedBirth());
    const c = { dist: { seek_match: 1 }, source: "fixture" as const };
    const s1 = step(s0, { reply: "去，相看！", classification: c }, pack);
    expect(s1.charBudgetLeft).toBe(97);
    expect(s1.log[0]!.charsUsed).toBe(3);
    expect(() => step(s1, { reply: "一二三四五六七八九十一", classification: { dist: { answer_levy: 1 }, source: "fixture" } }, pack)).toThrow(/OVER_LETTER_LIMIT/);
    const broke = { ...s1, charBudgetLeft: 0 };
    expect(() => step(broke, { reply: "应役", classification: { dist: { answer_levy: 1 }, source: "fixture" } }, pack)).toThrow(/BUDGET_EXHAUSTED/);
    const silent = step(broke, { reply: "", classification: null }, pack);
    expect(silent.log.at(-1)!.exec).toBe("NO_GUIDANCE");
  });
});
