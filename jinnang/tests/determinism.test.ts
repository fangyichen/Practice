import { afterEach, describe, expect, it, vi } from "vitest";
import { birth } from "../engine";
import { rngDrawCount } from "../engine/rng";
import { GameStateSchema } from "../schemas";
import { fixedBirth, pack, persona, play, start } from "./helpers";

const REPLIES = ["去相看", "托人说情", "走"];

describe("确定性", () => {
  afterEach(() => vi.restoreAllMocks());

  it("相同的人格、投生结果、回复序列，两次运行的 GameState 完全一致", () => {
    const a = play(start(persona("INTJ"), "wit", fixedBirth()), REPLIES, [0, 1, 0]);
    const b = play(start(persona("INTJ"), "wit", fixedBirth()), REPLIES, [0, 1, 0]);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(GameStateSchema.safeParse(a).success).toBe(true);
  });

  it("相同种子投生得到相同的一生", () => {
    const p = { persona: persona("ENFP"), carry: "looks" as const, gender: "f" as const, seed: "same-seed" };
    const a = play(birth(p, pack), REPLIES);
    const b = play(birth(p, pack), REPLIES);
    expect(a).toEqual(b);
  });

  it("投生之后的代码路径里没有任何 RNG 调用", () => {
    const mathRandom = vi.spyOn(Math, "random");
    for (let i = 0; i < 50; i++) {
      const s0 = birth({ persona: persona("ESTP"), carry: "physique", gender: "m", seed: `rng-${i}` }, pack);
      const before = rngDrawCount();
      play(s0, ["随皇叔走", "", "躲"].slice(0, 3), [1, null, 0]);
      play(s0, ["哈哈哈", "照册应役", "留下别走"]);
      expect(rngDrawCount()).toBe(before);
    }
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it("投生本身确实用到 RNG（计数器有效）", () => {
    const before = rngDrawCount();
    birth({ persona: persona("ISTJ"), carry: "wit", gender: "m", seed: "x" }, pack);
    expect(rngDrawCount()).toBeGreaterThan(before);
  });
});
