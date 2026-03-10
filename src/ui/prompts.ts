import * as clack from '@clack/prompts';
import inquirerEditor from '@inquirer/editor';

export function intro(title: string): void {
  clack.intro(title);
}

export function outro(message: string): void {
  clack.outro(message);
}

export async function text(opts: {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (v: string | undefined) => string | undefined;
}): Promise<string> {
  const result = await clack.text(opts);
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return result ?? '';
}

export async function password(opts: {
  message: string;
  validate?: (v: string | undefined) => string | undefined;
}): Promise<string> {
  const result = await clack.password(opts);
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return result ?? '';
}

export async function confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean> {
  const result = await clack.confirm(opts);
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return result;
}

export async function select<T extends string>(opts: {
  message: string;
  options: { value: T; label: string; hint?: string }[];
  initialValue?: T;
  maxItems?: number;
}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await clack.select({ maxItems: 12, ...opts } as any);
  if (clack.isCancel(result)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }
  return result as T;
}

export async function editor(opts: { message: string; initialValue?: string }): Promise<string> {
  return inquirerEditor({ message: opts.message, default: opts.initialValue });
}

export { clack };
