import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from '../providers/types';

export class ClaudeClient implements AIProvider {
  private readonly client: Anthropic;
  private readonly model = 'claude-sonnet-4-6';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    if (block?.type !== 'text') return '';
    return block.text;
  }
}
