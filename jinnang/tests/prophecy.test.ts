import { describe, expect, it } from "vitest";
import { detectProphecies, step } from "../engine";
import { buildLetterInput, MockLetterWriter } from "../letters";
import { fixedBirth, pack, personaFromTraits, silentUntil, start } from "./helpers";

const traits = { boldness: 50, loyalty: 50, impulsiveness: 50, rootedness: 50, skepticism: 50, sociability: 50 };

describe("预言", () => {
  it("说中尚未发生的演义后事才算；已经发生的不算；每条只记一次", () => {
    const s = start(personaFromTraits(traits), "wit", fixedBirth());
    expect(detectProphecies("赤壁有火", s, pack)).toEqual(["p_chibi"]);
    expect(detectProphecies("哈哈哈", s, pack)).toEqual([]);
    const late = { ...s, year: 210, season: 1 as const };
    expect(detectProphecies("赤壁有火", late, pack)).toEqual([]);
    const already = { ...s, prophecies: [{ id: "p_chibi", turn: 0, reply: "x", status: "pending" as const }] };
    expect(detectProphecies("赤壁有火", already, pack)).toEqual([]);
  });

  it("应验时信任大涨，下一封信开头先回应；没说的不加", async () => {
    const s = silentUntil(start(personaFromTraits(traits), "wit", fixedBirth({ location: "jiangling" })), "old_friend_invite");
    const said = step(s, { reply: "赤壁有火", classification: { dist: { decline: 1 }, source: "fixture" } }, pack);
    const quiet = step(s, { reply: "", classification: null }, pack);
    expect(said.prophecies[0]).toMatchObject({ id: "p_chibi", status: "pending" });
    // 一直沉默到赤壁之后的第一封信
    const after = (x: typeof s) => silentUntil(x, "new_master_209");
    const a = after(said);
    const b = after(quiet);
    expect(a.prophecies[0]!.status).toBe("hit");
    expect(a.prophecies[0]!.trustAfter! - a.prophecies[0]!.trustBefore!).toBeGreaterThan(10);
    expect(a.twin.trust).toBeGreaterThan(b.twin.trust);
    const letter = (await new MockLetterWriter().write(buildLetterInput(a, pack))).letter;
    expect(letter.startsWith("足下见字。")).toBe(true);
  });

  it("应验后的那封信，开头是预言应验的话", async () => {
    let s = silentUntil(start(personaFromTraits(traits), "wit", fixedBirth({ location: "jiangling" })), "old_friend_invite");
    s = step(s, { reply: "赤壁有火", classification: { dist: { decline: 1 }, source: "fixture" } }, pack);
    s = silentUntil(s, "chibi_aftermath"); // 赤壁那一季的信
    expect(s.pendingDilemma!.fulfilled).toEqual(["p_chibi"]);
    const letter = (await new MockLetterWriter().write(buildLetterInput(s, pack))).letter;
    expect(letter).toContain("江上要起大火");
  });
});
