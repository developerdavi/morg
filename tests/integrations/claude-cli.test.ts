import { vi, describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { ClaudeCLIProvider } from '../../src/integrations/providers/ai/implementations/claude-cli-ai-provider';
import { IntegrationError } from '../../src/utils/errors';

vi.mock('execa');

const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

describe('ClaudeCLIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trimmed stdout on success', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '  hello world\n', stderr: '' });

    const provider = new ClaudeCLIProvider();
    const result = await provider.complete('Say hello');

    expect(result).toBe('hello world');
  });

  it('always passes --print and --no-session-persistence', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '' });

    const provider = new ClaudeCLIProvider();
    await provider.complete('test prompt');

    const [cmd, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(cmd).toBe('claude');
    expect(args).toContain('--print');
    expect(args).not.toContain('--tools');
    expect(args).toContain('--no-session-persistence');
  });

  it('includes prompt as last arg', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '' });

    const provider = new ClaudeCLIProvider();
    await provider.complete('my prompt');

    const [, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(args[args.length - 1]).toBe('my prompt');
  });

  it('passes --system-prompt arg when systemPrompt is provided', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '' });

    const provider = new ClaudeCLIProvider();
    await provider.complete('user prompt', 'system instructions');

    const [, args] = mockExeca.mock.calls[0] as [string, string[]];
    const sysIdx = args.indexOf('--system-prompt');
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(args[sysIdx + 1]).toBe('system instructions');
  });

  it('omits --system-prompt when no systemPrompt given', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: 'ok', stderr: '' });

    const provider = new ClaudeCLIProvider();
    await provider.complete('user prompt');

    const [, args] = mockExeca.mock.calls[0] as [string, string[]];
    expect(args).not.toContain('--system-prompt');
  });

  it('throws IntegrationError on non-zero exit code', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'auth error' });

    const provider = new ClaudeCLIProvider();
    await expect(provider.complete('test')).rejects.toThrow(/exited with code 1/);
  });

  it('throws IntegrationError type on non-zero exit code', async () => {
    mockExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'auth error' });

    const provider = new ClaudeCLIProvider();
    await expect(provider.complete('test')).rejects.toThrow(IntegrationError);
  });

  it('throws IntegrationError when binary not found (ENOENT)', async () => {
    const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(err);

    const provider = new ClaudeCLIProvider();
    await expect(provider.complete('test')).rejects.toThrow(/not found/);
  });

  it('throws IntegrationError type when binary not found (ENOENT)', async () => {
    const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    mockExeca.mockRejectedValueOnce(err);

    const provider = new ClaudeCLIProvider();
    await expect(provider.complete('test')).rejects.toThrow(IntegrationError);
  });
});
