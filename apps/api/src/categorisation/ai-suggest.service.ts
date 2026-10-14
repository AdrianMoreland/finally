import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { askGroup, type AskGroup } from '@finally/contracts';
import { ENV, type Env } from '../common/env';

const answerSchema = z.object({ askGroup, categorySlug: z.string() });

export interface AiSuggestion {
  askGroup: AskGroup;
  categorySlug: string;
}

/**
 * Optional Claude call for merchants the keyword and similarity rules cannot place. Only active when
 * ANTHROPIC_API_KEY is set; any failure returns null and the caller falls back silently.
 */
@Injectable()
export class AiSuggestService {
  private readonly log = new Logger(AiSuggestService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return Boolean(this.env.ANTHROPIC_API_KEY && this.env.ANTHROPIC_MODEL);
  }

  async suggest(input: {
    displayName: string;
    rawDescriptor: string;
    categorySlugs: readonly string[];
  }): Promise<AiSuggestion | null> {
    if (!this.enabled) return null;
    const prompt = [
      'Classify one Irish bank card payment for a personal finance app.',
      `Merchant: ${input.displayName}`,
      `Raw bank descriptor: ${input.rawDescriptor}`,
      `Reply with JSON only, no prose: {"askGroup": <FOOD|TRANSPORT|SHOPPING|BILLS|FUN|OTHER>, "categorySlug": <one of ${input.categorySlugs.join(', ')}>}`,
    ].join('\n');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.env.ANTHROPIC_MODEL,
          max_tokens: 120,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
      const json = /\{[\s\S]*\}/.exec(text)?.[0];
      if (!json) throw new Error('No JSON in reply');
      const parsed = answerSchema.parse(JSON.parse(json));
      if (!input.categorySlugs.includes(parsed.categorySlug)) throw new Error('Unknown category slug');
      return parsed;
    } catch (err) {
      this.log.debug(`AI suggestion skipped: ${(err as Error).message}`);
      return null;
    }
  }
}
