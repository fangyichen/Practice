import { z } from "zod";

// ---------------------------------------------------------------------------
// 基础
// ---------------------------------------------------------------------------

const Score = z.number().min(0).max(100);
const Tier = z.number().int().min(0).max(4);
const Season = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const Id = z.string().min(1).max(64);

export const TRAIT_KEYS = [
  "boldness",
  "loyalty",
  "impulsiveness",
  "rootedness",
  "skepticism",
  "sociability",
] as const;
export const TraitKeySchema = z.enum(TRAIT_KEYS);
export type TraitKey = z.infer<typeof TraitKeySchema>;

export const TraitsSchema = z.object({
  boldness: Score,
  loyalty: Score,
  impulsiveness: Score,
  rootedness: Score,
  skepticism: Score,
  sociability: Score,
});
export type Traits = z.infer<typeof TraitsSchema>;

export const TraitDeltaMapSchema = z.record(TraitKeySchema, z.number());
export type TraitDeltaMap = z.infer<typeof TraitDeltaMapSchema>;

export const TraitDeltaSchema = z.object({
  source: z.string().max(64),
  delta: TraitDeltaMapSchema,
});
export type TraitDelta = z.infer<typeof TraitDeltaSchema>;

export const ENDOWMENT_KEYS = ["physique", "wit", "looks"] as const;
export const EndowmentKeySchema = z.enum(ENDOWMENT_KEYS);
export type EndowmentKey = z.infer<typeof EndowmentKeySchema>;

export const EndowmentsSchema = z.object({ physique: Score, wit: Score, looks: Score });
export type Endowments = z.infer<typeof EndowmentsSchema>;

const TierMapSchema = z.record(EndowmentKeySchema, Tier);

export const MBTI_RE = /^[EI][NS][TF][JP]$/;

export const PersonaSchema = z.object({
  mbti: z.string().regex(MBTI_RE).optional(),
  traits: TraitsSchema,
  history: z.array(TraitDeltaSchema).max(500),
  carryChoices: z.array(EndowmentKeySchema).max(500),
});
export type Persona = z.infer<typeof PersonaSchema>;

// ---------------------------------------------------------------------------
// 运行时状态
// ---------------------------------------------------------------------------

export const TwinStateSchema = z.object({
  name: z.string().max(16),
  gender: z.enum(["m", "f"]),
  birthYear: z.number().int(),
  location: Id,
  station: Id,
  endowments: EndowmentsSchema,
  boosted: EndowmentKeySchema,
  craft: Score,
  health: Score,
  wealth: Score,
  standing: Score,
  household: z.object({
    spouse: z.boolean(),
    children: z.number().int().min(0),
    parentsAlive: z.number().int().min(0).max(2),
  }),
  allegiance: Id.nullable(),
  trust: Score,
  flags: z.array(Id).max(200),
  alive: z.boolean(),
});
export type TwinState = z.infer<typeof TwinStateSchema>;

export const ClassificationSchema = z.object({
  dist: z.record(z.string().max(64), z.number().min(0).max(1)),
  source: z.enum(["fixture", "jev", "llm", "rule"]),
  modelVersion: z.string().max(64).optional(),
  tone: z.number().min(0).max(1).optional(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const EXECS = [
  "DONE",
  "PARTIAL",
  "ATTEMPT_FAILED",
  "DECLINED_UNABLE",
  "UNWILLING",
  "NOT_ALLOWED",
  "TOO_LATE",
  "NO_GUIDANCE",
] as const;
export const ExecSchema = z.enum(EXECS);
export type Exec = z.infer<typeof ExecSchema>;

/** 结构化原因：code + 若干标量参数。渲染成人话由 engine/reasons.ts + content 模板完成。 */
export const ReasonSchema = z
  .object({ code: z.string().max(32) })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));
export type Reason = z.infer<typeof ReasonSchema>;

export const DilemmaInstanceSchema = z.object({
  dilemmaId: Id,
  year: z.number().int(),
  season: Season,
  letter: z.string().max(2000).nullable(),
  /** 写这封信之前应验了的预言 id（信里要先回应） */
  fulfilled: z.array(Id).default([]),
});
export type DilemmaInstance = z.infer<typeof DilemmaInstanceSchema>;

export const TurnRecordSchema = z.object({
  turn: z.number().int().min(0),
  year: z.number().int(),
  season: Season,
  age: z.number().int(),
  dilemmaId: Id,
  letter: z.string().max(2000).nullable(),
  reply: z.string().max(120),
  charsUsed: z.number().int().min(0),
  classification: ClassificationSchema.nullable(),
  /** 他把回信读成了哪个选项；沉默或读不懂时为 null */
  read: Id.nullable(),
  /** 最终实际执行的选项 */
  chosen: Id,
  exec: ExecSchema,
  outcome: Id,
  facts: z.array(z.string()),
  reasons: z.array(ReasonSchema),
  trustBefore: Score,
  trustAfter: Score,
  personaAnswer: z.number().int().min(0).nullable(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

/** 结局（8.4）。卷末仍在世的，lifespan/children 是确定性规则算出的余生概要。 */
export const EndingSchema = z.object({
  cause: z.enum(["death", "slice_end"]),
  year: z.number().int(),
  age: z.number().int(),
  /** 留痕等级 0–3 */
  tier: z.number().int().min(0).max(3),
  tierName: z.string(),
  /** 留痕物 id（traces.json 的 artifacts），以及它的名字与画法 */
  artifact: z.string(),
  artifactName: z.string(),
  artifactKind: z.string(),
  record: z.string(),
  epitaph: z.string(),
  epitaphRule: z.string(),
  deathYear: z.number().int(),
  lifespan: z.number().int(),
  children: z.number().int().min(0),
});
export type Ending = z.infer<typeof EndingSchema>;

export const ProphecyRecordSchema = z.object({
  id: Id,
  turn: z.number().int().min(0),
  reply: z.string().max(120),
  status: z.enum(["pending", "hit", "void"]),
  /** 应验时的年份与信任变化 */
  year: z.number().int().optional(),
  trustBefore: Score.optional(),
  trustAfter: Score.optional(),
});
export type ProphecyRecord = z.infer<typeof ProphecyRecordSchema>;

export const GameStateSchema = z.object({
  version: z.literal(3),
  seed: z.string().max(128),
  eraId: Id,
  sliceId: Id,
  persona: PersonaSchema,
  twin: TwinStateSchema,
  year: z.number().int(),
  season: Season,
  charBudgetLeft: z.number().int().min(0),
  turn: z.number().int().min(0),
  nodeIndex: z.number().int().min(0),
  pendingDilemma: DilemmaInstanceSchema.nullable(),
  log: z.array(TurnRecordSchema).max(100),
  ending: EndingSchema.nullable(),
  /** 玩家在回信里说过的、指向演义后事的预言 */
  prophecies: z.array(ProphecyRecordSchema).max(50).default([]),
  sig: z.string().max(256).optional(),
});
export type GameState = z.infer<typeof GameStateSchema>;

// ---------------------------------------------------------------------------
// 数据包
// ---------------------------------------------------------------------------

export const NodeConditionSchema = z
  .object({
    alive: z.boolean().optional(),
    where: z.array(Id).optional(),
    station: z.array(Id).optional(),
    tierAtLeast: TierMapSchema.optional(),
    tierBelow: TierMapSchema.optional(),
    hasFlag: z.array(Id).optional(),
    notFlag: z.array(Id).optional(),
    spouse: z.boolean().optional(),
    minAge: z.number().int().optional(),
    maxAge: z.number().int().optional(),
  })
  .strict();
export type NodeCondition = z.infer<typeof NodeConditionSchema>;

export const ResultWhenSchema = z
  .object({
    exec: ExecSchema,
    tierAtLeast: TierMapSchema.optional(),
    tierBelow: TierMapSchema.optional(),
    station: z.array(Id).optional(),
    hasFlag: Id.optional(),
    craftAtLeast: z.number().optional(),
    rash: z.boolean().optional(),
  })
  .strict();
export type ResultWhen = z.infer<typeof ResultWhenSchema>;

export const OptionSchema = z
  .object({
    id: Id,
    label: z.string().min(1).max(40),
    tags: z.array(z.string().max(32)),
    gate: z.object({ stat: EndowmentKeySchema, minTier: Tier }).strict().optional(),
    requires: z
      .object({
        station: z.array(Id).optional(),
        wealthAtLeast: z.number().optional(),
        hasFlag: Id.optional(),
      })
      .strict()
      .optional(),
    partial: z.boolean().optional(),
    /** 需要赶时间的选项：timed 难题里，迟缓的人会错过它 */
    urgent: z.boolean().optional(),
    results: z.array(z.object({ when: ResultWhenSchema, outcome: Id }).strict()).min(1),
  })
  .strict();
export type DilemmaOption = z.infer<typeof OptionSchema>;

export const PersonaQuestionSchema = z
  .object({
    prompt: z.string(),
    choices: z.array(z.object({ text: z.string(), delta: TraitDeltaMapSchema }).strict()).min(2),
  })
  .strict();
export type PersonaQuestion = z.infer<typeof PersonaQuestionSchema>;

export const DilemmaSchema = z
  .object({
    id: Id,
    year: z.number().int(),
    season: Season,
    anchor: Id.optional(),
    condition: NodeConditionSchema,
    timed: z.boolean(),
    /** 8.2 第三步的 urgencyBonus */
    urgency: z.number().min(0).max(40).default(0),
    situationFacts: z.array(z.string()).min(1),
    options: z.array(OptionSchema).min(1),
    default: z.literal("by_traits"),
    selfKnownLimits: z.array(EndowmentKeySchema),
    fallbackLetter: z.string(),
    personaQuestion: PersonaQuestionSchema.optional(),
  })
  .strict();
export type Dilemma = z.infer<typeof DilemmaSchema>;

export const OutcomeSchema = z
  .object({
    effects: z
      .object({
        health: z.number().optional(),
        wealth: z.number().optional(),
        standing: z.number().optional(),
        craft: z.number().optional(),
        physique: z.number().optional(),
        wit: z.number().optional(),
        location: Id.optional(),
        alive: z.boolean().optional(),
        spouse: z.boolean().optional(),
        children: z.number().int().optional(),
        parentsAlive: z.number().int().optional(),
        allegiance: Id.nullable().optional(),
        addFlags: z.array(Id).optional(),
        removeFlags: z.array(Id).optional(),
        /** 只有档位够才拿得到的 flag（如「识字」要机敏三档） */
        addFlagsIfTier: z
          .array(z.object({ flag: Id, stat: EndowmentKeySchema, minTier: Tier }).strict())
          .optional(),
      })
      .strict(),
    facts: z.array(z.string()).min(1),
    verdict: z.enum(["right", "wrong", "mixed", "none"]),
  })
  .strict();
export type Outcome = z.infer<typeof OutcomeSchema>;

export const SliceSchema = z
  .object({
    id: Id,
    title: z.string(),
    birthYear: z.number().int(),
    startYear: z.number().int(),
    endYear: z.number().int(),
    birthLocations: z.array(Id).min(1),
    birth: z.object({ mode: z.enum(["rolled", "fixed"]) }).strict(),
    nodes: z.array(Id).min(1),
    note: z.string().optional(),
  })
  .strict();
export type Slice = z.infer<typeof SliceSchema>;

const LabelRow = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]);

export const EraSchema = z
  .object({
    id: Id,
    title: z.string(),
    canonNotice: z.string(),
    playerAddress: z.string(),
    styleHints: z.array(z.string()),
    eraNames: z.array(
      z
        .object({
          name: z.string(),
          startYear: z.number().int(),
          endYear: z.number().int(),
          faction: Id.optional(),
          verify: z.string().optional(),
        })
        .strict(),
    ),
    factions: z.array(z.object({ id: Id, name: z.string(), folkName: z.string() }).strict()),
    names: z
      .object({
        surnames: z.array(z.string()).min(1),
        given: z.object({ m: z.array(z.string()).min(1), f: z.array(z.string()).min(1) }).strict(),
      })
      .strict(),
    endowmentLabels: z.object({ physique: LabelRow, wit: LabelRow, looks: LabelRow }).strict(),
    verify: z.string().optional(),
  })
  .strict();
export type Era = z.infer<typeof EraSchema>;

export const TimelineEntrySchema = z
  .object({
    id: Id,
    year: z.number().int(),
    yearEnd: z.number().int().optional(),
    season: Season.optional(),
    title: z.string(),
    facts: z.array(z.string()).min(1),
    effects: z
      .array(
        z
          .object({
            where: z.array(Id),
            pressure: z.record(z.string(), z.number().min(0).max(100)),
          })
          .strict(),
      )
      .optional(),
    /** 单位：季。大事发生后多少季，小民才听说。 */
    publicKnowledgeDelay: z.number().int().min(0).optional(),
    verify: z.string().optional(),
  })
  .strict();
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const LocationSchema = z
  .object({
    id: Id,
    name: z.string(),
    control: z.array(
      z
        .object({
          fromYear: z.number().int(),
          fromSeason: Season,
          faction: Id.nullable(),
        })
        .strict(),
    ),
    verify: z.string().optional(),
  })
  .strict();
export type Location = z.infer<typeof LocationSchema>;

export const StationSchema = z
  .object({
    id: Id,
    name: z.string(),
    weight: z.number().positive(),
    initial: z.object({ health: Score, wealth: Score, standing: Score, craft: Score }).strict(),
    endowmentWeights: z
      .object({ physique: z.number().positive(), wit: z.number().positive(), looks: z.number().positive() })
      .strict(),
    craftGrowth: z.number().min(0),
    household: z.object({ parentsAlive: z.number().int().min(0).max(2) }).strict(),
  })
  .strict();
export type Station = z.infer<typeof StationSchema>;

// ---- 留痕与结局（traces.json） ----

/** 留痕规则的条件：同一对象里的字段全部满足才算命中 */
export const TraceCondSchema = z
  .object({
    hasFlag: z.array(Id).optional(),
    anyFlag: z.array(Id).optional(),
    standingAtLeast: z.number().optional(),
    craftAtLeast: z.number().optional(),
    wealthAtLeast: z.number().optional(),
    childrenAtLeast: z.number().int().optional(),
    station: z.array(Id).optional(),
    alive: z.boolean().optional(),
    spouse: z.boolean().optional(),
  })
  .strict();
export type TraceCond = z.infer<typeof TraceCondSchema>;

export const EPITAPH_KINDS = [
  "lastExec",
  "execCountAtLeast",
  "advisedTagNeverDone",
  "silenceMajority",
  "budgetLeftAtLeast",
  "trustRose",
  "allDone",
  "noneDone",
  "regretAtLeast",
  "diedYoung",
  "hasFlag",
  "wrongMajority",
  "repeatedReply",
  "neverMarried",
  "prophecyHit",
  "longLife",
  "fallback",
] as const;

export const EpitaphRuleSchema = z
  .object({
    id: Id,
    kind: z.enum(EPITAPH_KINDS),
    exec: ExecSchema.optional(),
    tag: z.string().max(32).optional(),
    flag: Id.optional(),
    n: z.number().optional(),
    alive: z.boolean().optional(),
    templates: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type EpitaphRule = z.infer<typeof EpitaphRuleSchema>;

export const TracesSchema = z
  .object({
    tierNames: z.tuple([z.string(), z.string(), z.string(), z.string()]),
    /** 从高到低逐条判定，第一条命中的给出等级；都不中为 0 */
    rules: z.array(z.object({ tier: z.number().int().min(1).max(3), when: TraceCondSchema, note: z.string().optional() }).strict()),
    artifacts: z.array(
      z
        .object({
          id: Id,
          tier: z.number().int().min(0).max(3),
          name: z.string(),
          kind: z.string(),
          when: TraceCondSchema.optional(),
        })
        .strict(),
    ),
    /** 事迹：按列表顺序，第一个命中的 flag 给出事迹；都不中按身份取兜底 */
    deeds: z.array(z.object({ flag: Id, text: z.string() }).strict()),
    fallbackDeeds: z.record(Id, z.array(z.string()).min(1)),
    records: z.object({ "0": z.array(z.string()), "1": z.array(z.string()), "2": z.array(z.string()), "3": z.array(z.string()) }).strict(),
    epitaphs: z.array(EpitaphRuleSchema).min(1),
    afterlife: z
      .object({
        baseAge: z.number().int(),
        healthDivisor: z.number(),
        physiqueTierBonus: z.number(),
        minAge: z.number().int(),
        maxAge: z.number().int(),
        childrenIfSpouse: z.number().int(),
        wealthPerChild: z.number(),
        maxChildren: z.number().int(),
      })
      .strict(),
    verify: z.string().optional(),
  })
  .strict();
export type Traces = z.infer<typeof TracesSchema>;

/** 预言：回信里出现这些字眼，就算说了这件事；等 event（年表 id）为人所知时应验 */
export const ProphecySchema = z
  .object({
    id: Id,
    event: Id,
    /** 任一组里的字全部出现即命中 */
    any: z.array(z.array(z.string().min(1)).min(1)).min(1),
    /** 应验后，下一封信开头他说的话 */
    line: z.string().min(1),
  })
  .strict();
export type Prophecy = z.infer<typeof ProphecySchema>;

export type EraPack = {
  era: Era;
  timeline: TimelineEntry[];
  locations: Location[];
  stations: Station[];
  slice: Slice;
  dilemmas: Dilemma[];
  outcomes: Record<string, Outcome>;
  traces: Traces;
  prophecies: Prophecy[];
};

// ---------------------------------------------------------------------------
// 引擎配置（config/engine.json）
// ---------------------------------------------------------------------------

/** 递归去掉以 _ 开头的说明键，其余键严格校验（拼错的键会报错）。 */
export function stripDocKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripDocKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !k.startsWith("_"))
        .map(([k, x]) => [k, stripDocKeys(x)]),
    );
  }
  return v;
}

const ConflictPartSchema = z
  .object({ trait: TraitKeySchema, dir: z.union([z.literal(1), z.literal(-1)]), w: z.number().min(0) })
  .strict();

export const EngineConfigSchema = z
  .object({
    randomness: z.enum(["birth_only", "full"]),
    trust: z
      .object({
        initialBase: Score,
        skepticismWeight: z.number().min(0),
        verdict: z.object({ right: z.number(), wrong: z.number(), mixed: z.number(), none: z.number() }).strict(),
        replyBonus: z.number(),
        regretFactor: z.number().min(0).max(1),
        reliefFactor: z.number().min(0).max(1),
        regression: z.object({ center: Score, pull: z.number().min(0).max(1) }).strict(),
        prophecyHit: z.number().min(0),
        witMultiplier: z.object({ base: z.number().min(0), perPoint: z.number().min(0) }).strict(),
      })
      .strict(),
    willingness: z.object({ willing: Score, middleYes: Score, floor: Score }).strict(),
    reading: z.object({ candidateMinProb: z.number().min(0).max(1), witTierReadsWell: Tier }).strict(),
    temperament: z.object({ boldEnough: Score, rashImpulsiveness: Score, slowImpulsiveness: Score }).strict(),
    tagConflict: z.record(z.string(), z.array(ConflictPartSchema)),
    endowments: z
      .object({
        sum: z.number().int(),
        min: z.number().int().min(0),
        max: z.number().int().max(100),
        carryBonus: z.literal(20),
        carryPreMax: z.number().int(),
        physiqueDeclineAge: z.number().int(),
        physiqueDeclinePerYear: z.number().min(0),
        witGrowthPerDilemma: z.number().min(0),
        witGrowthCap: z.number().int().min(0),
        looksFadeAge: z.number().int(),
        looksFadeStep: z.number().int().positive(),
        craftGrowth: z.object({ base: z.number(), witDivisor: z.number().positive() }).strict(),
      })
      .strict(),
    budget: z
      .object({ perLetter: z.number().int().positive(), lifetime: z.number().int().positive(), maxRawLength: z.number().int().positive() })
      .strict(),
    persona: z
      .object({
        questionCap: z.number().positive(),
        onboardingCap: z.number().positive(),
        mbtiAdjust: z.record(z.enum(["E", "I", "N", "S", "T", "F", "J", "P"]), TraitDeltaMapSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (!(c.willingness.floor <= c.willingness.middleYes && c.willingness.middleYes <= c.willingness.willing)) {
      issue("willingness 需满足 floor ≤ middleYes ≤ willing");
    }
    const e = c.endowments;
    if (e.carryPreMax + e.carryBonus > 100) issue("carryPreMax + carryBonus 不得超过 100");
    if (e.carryPreMax % 20 !== 19) issue("carryPreMax 应落在某档的上沿（…19、39、59、79），否则加成可能跨两档");
    if (e.min * 3 > e.sum || e.max * 3 < e.sum) issue("endowments.sum 与 [min, max] 不相容");
    for (const [tag, parts] of Object.entries(c.tagConflict)) {
      if (parts.reduce((s, p) => s + p.w, 0) * 100 > 40 + 1e-9) issue(`标签 ${tag} 的冲突上限超过 40`);
    }
  });
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
