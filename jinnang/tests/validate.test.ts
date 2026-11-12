import { describe, expect, it } from "vitest";
import { validateEra } from "../lib/validate";
import { pack } from "./helpers";

describe("validate-era", () => {
  it("M0 profile 下纪律检查全部通过", () => {
    const issues = validateEra(pack, "m0");
    const errors = issues.filter((i) => i.level === "error");
    if (issues.length) console.log(issues);
    expect(errors).toEqual([]);
  });

  it("能抓到违规：删掉兜底规则、引用不存在的 outcome、去掉无门槛选项", () => {
    const bad = structuredClone(pack);
    const d = bad.dilemmas.find((x) => x.id === "cao_marches_south")!;
    d.options[0]!.results = d.options[0]!.results.filter((r) => r.when.exec !== "ATTEMPT_FAILED");
    d.options[1]!.results.push({ when: { exec: "DONE" }, outcome: "no_such_outcome" });
    const m = bad.dilemmas.find((x) => x.id === "county_levy")!;
    m.options = m.options.filter((o) => o.id === "plead_exemption" || o.id === "pay_substitute");
    const msgs = validateEra(bad, "m0").filter((i) => i.level === "error").map((i) => i.msg).join("\n");
    expect(msgs).toMatch(/缺少 exec=ATTEMPT_FAILED/);
    expect(msgs).toMatch(/no_such_outcome/);
    expect(msgs).toMatch(/没有既无 gate 也无 requires/);
  });
});
