import { execa } from 'execa';
import type { AIProvider } from '../ai-provider';
import { IntegrationError } from '../../../../utils/errors';

export class ClaudeCLIProvider implements AIProvider {
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const args: string[] = ['--print'];
    if (systemPrompt) args.push('--system-prompt', systemPrompt);

    let result;
    try {
      result = await execa('claude', args, { input: prompt, reject: false });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IntegrationError(
          'Claude CLI binary not found.',
          'claude-cli',
          'Install the Claude CLI: https://claude.ai/download',
        );
      }
      throw err;
    }

    if (result.exitCode !== 0) {
      throw new IntegrationError(
        `Claude CLI exited with code ${result.exitCode}: ${result.stderr}`,
        'claude-cli',
        'Ensure the claude CLI is installed and authenticated. Run: claude --version',
      );
    }

    return result.stdout.trim();
  }
}
