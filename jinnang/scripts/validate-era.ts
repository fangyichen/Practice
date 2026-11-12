/**
 * 用法：tsx scripts/validate-era.ts [--profile m0|full] [--era sanguo-yanyi] [--slice jingzhou-180]
 * 有 error 时退出码为 1。
 */
import { loadEraPack } from "../lib/pack";
import { enumeratePaths, validateEra, type Profile } from "../lib/validate";

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? dflt) : dflt;
}

const profile = arg("profile", "full") as Profile;
const pack = loadEraPack(arg("era", "sanguo-yanyi"), arg("slice", "jingzhou-180"));
const issues = validateEra(pack, profile);
const paths = enumeratePaths(pack, profile === "m0" ? 2 : 3);

console.log(`validate-era  profile=${profile}  era=${pack.era.id}  slice=${pack.slice.id}`);
console.log(`  难题 ${pack.dilemmas.length} 个，结果 ${Object.keys(pack.outcomes).length} 个，年表 ${pack.timeline.length} 条`);
console.log(`  分支枚举：每局经历 ${paths.min}–${paths.max} 个难题`);
for (const i of issues) console.log(`  [${i.level}] ${i.where}: ${i.msg}`);
const errors = issues.filter((i) => i.level === "error").length;
console.log(errors === 0 ? "  通过" : `  失败：${errors} 个 error`);
process.exit(errors === 0 ? 0 : 1);
