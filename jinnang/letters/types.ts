import type { Exec, Reason } from "../schemas";

/** 写信模型的输入（第 10 节）。禀赋与技艺只给档位形容词，不给数值。 */
export type LetterInput = {
  twin: {
    name: string;
    gender: "m" | "f";
    age: number;
    station: string;
    location: string;
    household: { spouse: boolean; children: number; parentsAlive: number };
    status: { health: string; wealth: string; standing: string };
  };
  traits: { values: Record<string, number>; summary: string[] };
  endowments: { physique: string; wit: string; looks: string; craft: string };
  previous: { exec: Exec; reasons: Reason[]; facts: string[] } | null;
  dilemma: { id: string; situationFacts: string[]; selfKnownLimits: { stat: string; label: string }[] };
  knownEvents: { title: string; facts: string[] }[];
  style: { hints: string[]; playerAddress: string };
  fallbackLetter: string;
};

export interface LetterWriter {
  write(input: LetterInput): Promise<{ letter: string }>;
}
