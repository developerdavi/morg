import { describe, it, expect } from 'vitest';
import { isTicketId, extractTicketId, branchNameFromTicket } from '../src/utils/ticket';

describe('isTicketId', () => {
  it('recognises standard ticket IDs', () => {
    expect(isTicketId('MORG-42')).toBe(true);
    expect(isTicketId('ABC-1')).toBe(true);
    expect(isTicketId('TM-123')).toBe(true);
  });

  it('rejects branch names and free text', () => {
    expect(isTicketId('feat/my-feature')).toBe(false);
    expect(isTicketId('just-a-string')).toBe(false);
    expect(isTicketId('123-ABC')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isTicketId('morg-42')).toBe(true);
  });
});

describe('extractTicketId', () => {
  it('extracts ticket from branch name', () => {
    expect(extractTicketId('feat/MORG-42-add-feature')).toBe('MORG-42');
    expect(extractTicketId('fix/TM-7-fix-bug')).toBe('TM-7');
  });

  it('returns null when no ticket found', () => {
    expect(extractTicketId('feat/no-ticket')).toBeNull();
    expect(extractTicketId('main')).toBeNull();
  });
});

describe('branchNameFromTicket', () => {
  it('generates branch without title', () => {
    expect(branchNameFromTicket('MORG-42')).toBe('feat/morg-42');
  });

  it('generates branch with title', () => {
    const branch = branchNameFromTicket('MORG-42', 'Add PR review command');
    expect(branch).toBe('feat/morg-42-add-pr-review-command');
  });

  it('slugifies special characters in title', () => {
    const branch = branchNameFromTicket('ABC-1', 'Fix bug: crash on startup!');
    expect(branch).toBe('feat/abc-1-fix-bug-crash-on-startup');
  });

  it('truncates long titles', () => {
    const title = 'A'.repeat(100);
    const branch = branchNameFromTicket('MORG-1', title);
    expect(branch.length).toBeLessThanOrEqual('feat/morg-1-'.length + 40);
  });
});
