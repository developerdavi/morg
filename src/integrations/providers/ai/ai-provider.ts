export interface AIProvider {
  complete(prompt: string, systemPrompt?: string): Promise<string>;
}
