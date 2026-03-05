import Table from 'cli-table3';
import boxen from 'boxen';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from './theme';
import type { Branch } from '../config/schemas';

function statusLabel(branch: Branch): string {
  switch (branch.status) {
    case 'active':
      return theme.primary('active');
    case 'pr_open':
      return theme.warning('pr open');
    case 'pr_merged':
      return theme.success('merged');
    case 'done':
      return theme.success('done');
    case 'abandoned':
      return theme.muted('abandoned');
    default:
      return theme.muted(branch.status);
  }
}

function prStatusLabel(branch: Branch): string {
  if (!branch.prStatus) return theme.muted('—');
  switch (branch.prStatus) {
    case 'open':
      return theme.primary('open');
    case 'ready':
      return theme.success('ready');
    case 'needs_review':
      return theme.warning('needs review');
    case 'changes_requested':
      return theme.error('changes req.');
    case 'approved':
      return theme.success('✓ approved');
    case 'merged':
      return theme.success('merged');
    case 'closed':
      return theme.muted('closed');
    default:
      return theme.muted(branch.prStatus);
  }
}

const TABLE_CHARS = {
  top: '─',
  'top-mid': '┬',
  'top-left': '╭',
  'top-right': '╮',
  bottom: '─',
  'bottom-mid': '┴',
  'bottom-left': '╰',
  'bottom-right': '╯',
  left: '│',
  'left-mid': '├',
  mid: '─',
  'mid-mid': '┼',
  right: '│',
  'right-mid': '┤',
  middle: '│',
};

export async function renderStatus(opts?: { branch?: string; short?: boolean }): Promise<void> {
  let projectId: string;
  try {
    projectId = await requireTrackedRepo();
  } catch {
    console.log(theme.muted('Not in a morg-tracked repo.'), theme.muted('Run: morg init'));
    return;
  }

  const [branchesFile, currentBranch] = await Promise.all([
    configManager.getBranches(projectId),
    getCurrentBranch(),
  ]);

  // Short mode for shell prompt integration
  if (opts?.short) {
    const branch = branchesFile.branches.find(
      (b) => b.branchName === (opts.branch ?? currentBranch),
    );
    if (branch?.ticketId) process.stdout.write(theme.muted(`[${branch.ticketId}]`));
    return;
  }

  const activeBranches = branchesFile.branches.filter((b) =>
    ['active', 'pr_open', 'pr_merged'].includes(b.status),
  );

  if (activeBranches.length === 0) {
    console.log(
      boxen(
        `${theme.muted('No active branches.')}\n\n` +
          `  ${symbols.arrow} ${theme.primary('morg start <branch|ticket>')}  start a new branch\n` +
          `  ${symbols.arrow} ${theme.primary('morg track')}                   track current branch`,
        {
          padding: 1,
          borderStyle: 'round',
          borderColor: 'gray',
          title: theme.primaryBold('morg status'),
          titleAlignment: 'left',
        },
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

  const sortedBranches = [...activeBranches].sort((a, b) => {
    const ta = a.lastAccessedAt ?? a.updatedAt;
    const tb = b.lastAccessedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });

  for (const branch of sortedBranches) {
    const isCurrent = branch.branchName === currentBranch;
    const wtBadge = branch.worktreePath ? theme.muted(' [wt]') : '';
    const branchName = isCurrent
      ? theme.primaryBold(`${symbols.arrow} ${branch.branchName}`) + wtBadge
      : theme.muted(`  ${branch.branchName}`) + wtBadge;
    const ticketLine = branch.ticketId ? theme.primary(branch.ticketId) : theme.muted('—');
    const titleLine = branch.ticketTitle ? `\n${theme.muted(branch.ticketTitle.slice(0, 30))}` : '';
    const ticket = ticketLine + titleLine;
    const pr = branch.prNumber
      ? `${prStatusLabel(branch)} ${theme.muted(`#${branch.prNumber}`)}`
      : theme.muted('—');

    table.push([branchName, ticket, statusLabel(branch), pr]);
  }

  console.log('');
  console.log(theme.primaryBold('  morg status'));
  console.log(table.toString());
  console.log('');
}
