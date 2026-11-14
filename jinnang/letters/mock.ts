import type { LetterInput, LetterWriter } from "./types";

/** M2 之前用：开头先回应上一封与应验的预言，再接难题的预写降级信。不调任何模型。 */
export class MockLetterWriter implements LetterWriter {
  async write(input: LetterInput): Promise<{ letter: string }> {
    if (!input.callbacks.length) return { letter: input.fallbackLetter };
    const body = input.fallbackLetter.startsWith(input.opening) ? input.fallbackLetter.slice(input.opening.length) : input.fallbackLetter;
    return { letter: `${input.opening}${input.callbacks.join("")}\n${body}` };
  }
}
