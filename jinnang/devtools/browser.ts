/**
 * 浏览器入口：把引擎、fixture 分类、mock 写信和数据包一起打包进页面，不需要服务器。
 * 由 scripts/build-static.ts 打包；页面里的 api() 发现 window.JINNANG_LOCAL 就直接调用它。
 */
import { z } from "zod";
import type { FixtureFile } from "../classifier";
import type { ReasonTemplates } from "../engine";
import {
  DilemmaSchema,
  EraSchema,
  LocationSchema,
  OutcomeSchema,
  SliceSchema,
  StationSchema,
  TimelineEntrySchema,
  TracesSchema,
  type EraPack,
} from "../schemas";
import { createApi, type BirthContent } from "./api";

import era from "../eras/sanguo-yanyi/era.json";
import timeline from "../eras/sanguo-yanyi/timeline.json";
import locations from "../eras/sanguo-yanyi/locations.json";
import stations from "../eras/sanguo-yanyi/stations.json";
import slice from "../eras/sanguo-yanyi/slices/jingzhou-180/slice.json";
import dilemmas from "../eras/sanguo-yanyi/slices/jingzhou-180/dilemmas.json";
import traces from "../eras/sanguo-yanyi/traces.json";
import outcomes from "../eras/sanguo-yanyi/slices/jingzhou-180/outcomes.json";
import fixtures from "../fixtures/replies.json";
import reasons from "../content/reasons.json";
import birth from "../content/birth.json";

const pack: EraPack = {
  era: EraSchema.parse(era),
  timeline: z.array(TimelineEntrySchema).parse(timeline),
  locations: z.array(LocationSchema).parse(locations),
  stations: z.array(StationSchema).parse(stations),
  slice: SliceSchema.parse(slice),
  dilemmas: z.array(DilemmaSchema).parse(dilemmas),
  outcomes: z.record(z.string(), OutcomeSchema).parse(outcomes),
  traces: TracesSchema.parse(traces),
};

const api = createApi({
  pack,
  fixtures: fixtures as unknown as FixtureFile,
  reasonTemplates: reasons as unknown as ReasonTemplates,
  birthContent: birth as unknown as BirthContent,
});

(globalThis as Record<string, unknown>).JINNANG_LOCAL = async (path: string, body?: unknown) => {
  // 走一遍 JSON，与经过 HTTP 时的行为一致（避免页面持有引擎内部对象）
  const r = await api.handle(body === undefined ? "GET" : "POST", path, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
  const out = JSON.parse(JSON.stringify(r.body)) as { error?: string };
  if (r.status !== 200) throw new Error(out.error ?? `HTTP ${r.status}`);
  return out;
};
