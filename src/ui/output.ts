import Table from 'cli-table3';
import boxen from 'boxen';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from './theme';
import type { Task } from '../config/schemas';

function statusLabel(task: Task): string {
  switch (task.status) {
    case 'active':   return theme.primary('active');
    case 'pr_open':  return theme.warning('pr open');
    case 'pr_merged':return theme.success('merged');
    case 'done':     return theme.success('done');
    case 'abandoned':return theme.muted('abandoned');
    default:         return theme.muted(task.status);
  }
}

function prStatusLabel(task: Task): string {
  if (!task.prStatus) return theme.muted('—');
  switch (task.prStatus) {
    case 'open':               return theme.primary('open');
    case 'ready':              return theme.success('ready');
    case 'needs_review':       return theme.warning('needs review');
    case 'changes_requested':  return theme.error('changes req.');
    case 'approved':           return theme.success('✓ approved');
    case 'merged':             return theme.success('merged');
    case 'closed':             return theme.muted('closed');
    default:                   return theme.muted(task.prStatus);
  }
}

const TABLE_CHARS = {
  top: '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
  bottom: '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
  left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
  right: '│', 'right-mid': '┤', middle: '│',
};

export async function renderStatus(opts?: { branch?: string; short?: boolean }): Promise<void> {
  let projectId: string;
  try {
    projectId = await requireTrackedRepo();
  } catch {
    console.log(theme.muted('Not in a morg-tracked repo.'), theme.muted('Run: morg init'));
    return;
  }

  const [tasks, currentBranch] = await Promise.all([
    configManager.getTasks(projectId),
    getCurrentBranch(),
  ]);

  // Short mode for shell prompt integration
  if (opts?.short) {
    const task = tasks.tasks.find((t) => t.branchName === (opts.branch ?? currentBranch));
    if (task?.ticketId) process.stdout.write(theme.muted(`[${task.ticketId}]`));
    return;
  }

  const activeTasks = tasks.tasks.filter((t) =>
    ['active', 'pr_open', 'pr_merged'].includes(t.status),
  );

  if (activeTasks.length === 0) {
    console.log(
      boxen(
        `${theme.muted('No active tasks.')}\n\n` +
          `  ${symbols.arrow} ${theme.primary('morg start <branch|ticket>')}  start a new task\n` +
          `  ${symbols.arrow} ${theme.primary('morg track')}                  track current branch`,
        { padding: 1, borderStyle: 'round', borderColor: 'gray', title: theme.primaryBold('morg status'), titleAlignment: 'left' },
      ),
    );
    return;
  }

  const table = new Table({
    head: [
      theme.primaryBold('branch'),
      theme.primaryBold('ticket'),
      theme.primaryBold('status'),
      theme.primaryBold('PR'),
    ],
    style: { head: [], border: ['gray'] },
    chars: TABLE_CHARS,
  });

  for (const task of activeTasks) {
    const isCurrent = task.branchName === currentBranch;
    const branch = isCurrent
      ? theme.primaryBold(`${symbols.arrow} ${task.branchName}`)
      : theme.muted(`  ${task.branchName}`);
    const ticket = task.ticketId ? theme.primary(task.ticketId) : theme.muted('—');
    const pr = task.prNumber
      ? `${prStatusLabel(task)} ${theme.muted(`#${task.prNumber}`)}`
      : theme.muted('—');

    table.push([branch, ticket, statusLabel(task), pr]);
  }

  console.log('');
  console.log(theme.primaryBold('  morg status'));
  console.log(table.toString());
  console.log('');
}
