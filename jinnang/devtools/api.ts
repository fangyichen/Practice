/**
 * 人工测试页的接口逻辑（与运行环境无关）。
 * - scripts/devserver.ts 用它做本地 HTTP 服务器；
 * - devtools/browser.ts 用它在浏览器里直接运行（打包成单个网页，手机可开）。
 * 无状态：每次请求带完整 GameState。页面会显示全部数值，正式界面不得这样做。
 */
import { z } from "zod";
import { FixtureClassifier, type FixtureFile, type ReplyClassifier } from "../classifier";
import { ageOf, controllerOf, countChars, DEFAULT_CONFIG, renderReason, startLife, rollBirth, tiers, traitsFromMbti } from "../engine";
import type { ReasonTemplates } from "../engine";
import { buildLetterInput, MockLetterWriter } from "../letters";
import { playTurn } from "../lib/game";
import { carryRevealLine } from "../lib/render";
import { EndowmentKeySchema, GameStateSchema, MBTI_RE, TraitsSchema, type EraPack, type GameState, type TurnRecord } from "../schemas";

export type BirthContent = { carryReveal: Record<string, { low: string; mid: string; high: string }> };
export type ApiDeps = { pack: EraPack; fixtures: FixtureFile; reasonTemplates: ReasonTemplates; birthContent: BirthContent };
export type ApiResult = { status: number; body: unknown };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const NewReq = z.object({
  mbti: z.string().regex(MBTI_RE).optional(),
  traits: TraitsSchema,
  carry: EndowmentKeySchema,
  gender: z.enum(["m", "f"]),
  seed: z.string().max(64).default("manual"),
  fixed: z
    .object({
      location: z.string(),
      station: z.string(),
      baseEndowments: z.object({ physique: z.number().int(), wit: z.number().int(), looks: z.number().int() }),
      name: z.string().min(1).max(8),
    })
    .optional(),
});

const TurnReq = z.object({
  state: GameStateSchema,
  reply: z.string().max(120),
  personaAnswer: z.number().int().min(0).nullable().optional(),
  /** 手动指定他把回信读成哪个选项（或 other = 读不懂）；不传则用 fixture，未命中均分 */
  override: z.string().max(64).nullable().optional(),
});

export function createApi({ pack, fixtures, reasonTemplates, birthContent }: ApiDeps) {
  const fixtureClassifier = new FixtureClassifier(fixtures);
  const writer = new MockLetterWriter();

  const nameOf = {
    location: (id: string) => pack.locations.find((l) => l.id === id)?.name ?? id,
    station: (id: string) => pack.stations.find((s) => s.id === id)?.name ?? id,
    faction: (id: string | null) => (id ? (pack.era.factions.find((f) => f.id === id)?.folkName ?? id) : "（未填写）"),
  };

  const optionLabel = (dilemmaId: string, optionId: string | null) =>
    pack.dilemmas.find((x) => x.id === dilemmaId)?.options.find((o) => o.id === optionId)?.label ?? optionId;

  const reasonText = (r: TurnRecord) => {
    const d = pack.dilemmas.find((x) => x.id === r.dilemmaId);
    return d ? renderReason(r, d, reasonTemplates) : "";
  };

  /** 给页面用的派生视图（含数值，调试专用） */
  function view(state: GameState) {
    const t = state.twin;
    const age = ageOf(state);
    const tr = tiers(t.endowments, age);
    const L = pack.era.endowmentLabels;
    const pending = state.pendingDilemma;
    const d = pending ? pack.dilemmas.find((x) => x.id === pending.dilemmaId) : null;
    return {
      canonNotice: pack.era.canonNotice,
      carryLine: carryRevealLine(state, pack, birthContent),
      age,
      locationName: nameOf.location(t.location),
      stationName: nameOf.station(t.station),
      controller: nameOf.faction(controllerOf(pack.locations, t.location, state.year, state.season)),
      allegianceName: t.allegiance ? nameOf.faction(t.allegiance) : null,
      endowmentLabels: { physique: L.physique[tr.physique], wit: L.wit[tr.wit], looks: L.looks[tr.looks] },
      tiers: tr,
      dilemma: d
        ? {
            id: d.id,
            year: d.year,
            season: d.season,
            timed: d.timed,
            urgency: d.urgency,
            situationFacts: d.situationFacts,
            selfKnownLimits: d.selfKnownLimits,
            options: d.options.map((o) => ({
              id: o.id,
              label: o.label,
              tags: o.tags,
              gate: o.gate ?? null,
              requires: o.requires ?? null,
              partial: !!o.partial,
              urgent: !!o.urgent,
            })),
            personaQuestion: d.personaQuestion ?? null,
            quickReplies: (fixtures.dilemmas[d.id] ?? []).map((e) => ({ reply: e.reply, category: e.category })),
          }
        : null,
      log: state.log.map((r) => ({ ...r, reasonText: reasonText(r), outcomeLabel: optionLabel(r.dilemmaId, r.chosen) })),
    };
  }

  async function fillLetter(state: GameState): Promise<GameState> {
    const { letter } = await writer.write(buildLetterInput(state, pack));
    return { ...state, pendingDilemma: { ...state.pendingDilemma!, letter } };
  }

  async function handleNew(body: unknown) {
    const req = NewReq.parse(body);
    const persona = { ...(req.mbti ? { mbti: req.mbti } : {}), traits: req.traits, history: [], carryChoices: [] };
    const params = { persona, carry: req.carry, gender: req.gender, seed: req.seed };
    let birth = rollBirth(params, pack);
    if (req.fixed) {
      const e = req.fixed.baseEndowments;
      const { sum, min, max, carryPreMax } = DEFAULT_CONFIG.endowments;
      const errs: string[] = [];
      if (e.physique + e.wit + e.looks !== sum) errs.push(`三项之和须为 ${sum}（现在 ${e.physique + e.wit + e.looks}）`);
      for (const [k, v] of Object.entries(e)) if (v < min || v > max) errs.push(`${k} 须在 ${min}–${max}`);
      if (e[req.carry] > carryPreMax) errs.push(`被带过去的那项加成前须 ≤ ${carryPreMax}`);
      if (!pack.locations.some((l) => l.id === req.fixed!.location)) errs.push("未知地点");
      if (!pack.stations.some((s) => s.id === req.fixed!.station)) errs.push("未知身份");
      if (errs.length) throw new HttpError(400, errs.join("；"));
      birth = { ...req.fixed };
    }
    let state = startLife(params, birth, pack);
    if (state.pendingDilemma) state = await fillLetter(state);
    return { state, view: view(state) };
  }

  async function handleTurn(body: unknown) {
    const req = TurnReq.parse(body);
    const d = req.state.pendingDilemma && pack.dilemmas.find((x) => x.id === req.state.pendingDilemma!.dilemmaId);
    if (!d) throw new HttpError(400, "没有待回复的信");
    let classifier: ReplyClassifier = fixtureClassifier;
    if (req.override) {
      const ids = [...d.options.map((o) => o.id), "other"];
      if (!ids.includes(req.override)) throw new HttpError(400, `未知选项 ${req.override}`);
      const dist = Object.fromEntries(ids.map((id) => [id, id === req.override ? 1 : 0]));
      classifier = { classify: async () => ({ dist, source: "rule" as const }) };
    }
    try {
      const state = await playTurn(req.state, { reply: req.reply, personaAnswer: req.personaAnswer ?? null }, { pack, classifier, writer });
      return { state, view: view(state) };
    } catch (e) {
      const msg = (e as Error).message;
      const map: Record<string, string> = {
        OVER_LETTER_LIMIT: "超过每封 10 字",
        OVER_BUDGET: "超过余生剩余字数",
        BUDGET_EXHAUSTED: "字数已用尽，只能沉默",
        TOO_LONG_RAW: "原文太长",
      };
      const code = Object.keys(map).find((k) => msg.includes(k));
      throw new HttpError(400, code ? map[code]! : msg);
    }
  }

  function meta() {
    return {
      canonNotice: pack.era.canonNotice,
      sliceTitle: pack.slice.title,
      locations: pack.slice.birthLocations.map((id) => ({ id, name: nameOf.location(id) })),
      stations: pack.stations.map((s) => ({ id: s.id, name: s.name, weight: s.weight })),
      endowmentLabels: pack.era.endowmentLabels,
      budget: DEFAULT_CONFIG.budget,
      config: DEFAULT_CONFIG,
    };
  }

  /** 路由。path 可带查询串。 */
  async function handle(method: string, path: string, body?: unknown): Promise<ApiResult> {
    try {
      const url = new URL(path, "http://x");
      const p = url.pathname;
      if (method === "GET" && p === "/api/meta") return { status: 200, body: meta() };
      if (method === "GET" && p === "/api/mbti") {
        const m = url.searchParams.get("m") ?? "";
        return { status: 200, body: { traits: traitsFromMbti(MBTI_RE.test(m) ? m : undefined) } };
      }
      if (method === "GET" && p === "/api/count") return { status: 200, body: { chars: countChars(url.searchParams.get("t") ?? "") } };
      if (method === "POST" && p === "/api/new") return { status: 200, body: await handleNew(body) };
      if (method === "POST" && p === "/api/turn") return { status: 200, body: await handleTurn(body) };
      if (method === "POST" && p === "/api/view") {
        const state = GameStateSchema.parse(body);
        return { status: 200, body: { state, view: view(state) } };
      }
      return { status: 404, body: { error: "not found" } };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      if (e instanceof z.ZodError)
        return { status: 400, body: { error: "请求不合法：" + e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("；") } };
      return { status: 500, body: { error: (e as Error).message } };
    }
  }

  return { handle, view, meta };
}
