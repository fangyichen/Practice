import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  DilemmaSchema,
  EraSchema,
  LocationSchema,
  OutcomeSchema,
  SliceSchema,
  StationSchema,
  TimelineEntrySchema,
  type EraPack,
} from "../schemas";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** 读取并用 zod 校验一个时代包 + 一卷。 */
export function loadEraPack(eraId = "sanguo-yanyi", sliceId = "jingzhou-180"): EraPack {
  const dir = join(ROOT, "eras", eraId);
  const sdir = join(dir, "slices", sliceId);
  return {
    era: EraSchema.parse(readJson(join(dir, "era.json"))),
    timeline: z.array(TimelineEntrySchema).parse(readJson(join(dir, "timeline.json"))),
    locations: z.array(LocationSchema).parse(readJson(join(dir, "locations.json"))),
    stations: z.array(StationSchema).parse(readJson(join(dir, "stations.json"))),
    slice: SliceSchema.parse(readJson(join(sdir, "slice.json"))),
    dilemmas: z.array(DilemmaSchema).parse(readJson(join(sdir, "dilemmas.json"))),
    outcomes: z.record(z.string(), OutcomeSchema).parse(readJson(join(sdir, "outcomes.json"))),
  };
}

export function loadContent<T = unknown>(name: string): T {
  return readJson(join(ROOT, "content", `${name}.json`)) as T;
}
