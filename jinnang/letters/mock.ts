import type { LetterInput, LetterWriter } from "./types";

/** M0 用：直接返回难题的预写降级信，不调任何模型。 */
export class MockLetterWriter implements LetterWriter {
  async write(input: LetterInput): Promise<{ letter: string }> {
    return { letter: input.fallbackLetter };
  }
}
