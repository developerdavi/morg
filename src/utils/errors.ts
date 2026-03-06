export class MorgError extends Error {
  exitCode = 1;

  constructor(
    message: string,
    public readonly fix?: string,
  ) {
    super(message);
    this.name = 'MorgError';
  }
}

export class ConfigError extends MorgError {
  override exitCode = 5;

  constructor(message: string, fix?: string) {
    super(message, fix);
    this.name = 'ConfigError';
  }
}

export class IntegrationError extends MorgError {
  override exitCode = 3;

  constructor(
    message: string,
    public readonly integration: string,
    fix?: string,
  ) {
    super(message, fix);
    this.name = 'IntegrationError';
  }
}

export class GitError extends MorgError {
  override exitCode = 4;

  constructor(message: string, fix?: string) {
    super(message, fix);
    this.name = 'GitError';
  }
}

export function handleError(err: unknown): never {
  if (err instanceof MorgError) {
    console.error(`\nError: ${err.message}`);
    if (err.fix) {
      console.error(`Fix: ${err.fix}`);
    }
    process.exit(err.exitCode);
  } else if (err instanceof Error) {
    console.error(`\nUnexpected error: ${err.message}`);
  } else {
    console.error('\nUnexpected error:', err);
  }
  process.exit(1);
}
