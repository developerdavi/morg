import { execa } from 'execa';
import boxen from 'boxen';
import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch, getCommitsOnBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { fetchTicket } from '../utils/providers';
import { findBranchCaseInsensitive } from '../utils/ticket';
import { renderStatus } from '../ui/output';
import { theme, symbols } from '../ui/theme';
import { registry } from '../services/registry';

async function runStatusDetail(targetBranch: string, projectId: string): Promise<void> {
  const [branchesFile, projectConfig] = await Promise.all([
    configManager.getBranches(projectId),
    configManager.getProjectConfig(projectId),
  ]);

  const trackedBranch = findBranchCaseInsensitive(branchesFile.branches, targetBranch);

  // Don't fetch details for untracked branches — show the all-branches table instead
  if (!trackedBranch) {
    await renderStatus();
    return;
  }

  const defaultBranch = projectConfig.defaultBranch;

  const ticketsProvider = await registry.tickets();
  const gh = projectConfig.integrations.github?.enabled !== false ? await registry.gh() : null;

  const [ticketResult, prResult, commitsResult, diffResult] = await Promise.allSettled([
    ticketsProvider && trackedBranch?.ticketId
      ? fetchTicket(ticketsProvider, trackedBranch.ticketId)
      : Promise.reject(new Error('no ticket')),
    gh ? gh.getPRForBranch(targetBranch) : Promise.reject(new Error('github not enabled')),
    getCommitsOnBranch(defaultBranch),
    execa('git', ['diff', '--stat', `${defaultBranch}...HEAD`], { reject: false }),
  ]);

  const lines: string[] = [];

  lines.push(`${theme.primaryBold('Branch:')} ${targetBranch}`);
  if (trackedBranch?.worktreePath) {
    lines.push(`${theme.muted('Worktree:')} ${trackedBranch.worktreePath}`);
  }

  if (trackedBranch?.ticketId) {
    lines.push('');
    if (ticketResult.status === 'fulfilled') {
      const t = ticketResult.value;
      lines.push(`${theme.primaryBold('Ticket:')} ${theme.primary(t.key)} ${t.title}`);
      lines.push(`${theme.muted('  Status:')} ${t.status}`);
      if (t.url) lines.push(`${theme.muted('  URL:')} ${t.url}`);
    } else {
      lines.push(`${theme.primaryBold('Ticket:')} ${theme.primary(trackedBranch.ticketId)}`);
    }
  }

  if (prResult.status === 'fulfilled' && prResult.value) {
    const pr = prResult.value;
    lines.push('');
    lines.push(`${theme.primaryBold('PR:')} #${pr.number} ${pr.title}`);
    lines.push(`${theme.muted('  URL:')} ${pr.url}`);
    if (pr.reviewDecision) {
      lines.push(`${theme.muted('  Review:')} ${pr.reviewDecision}`);
    }

    // CI status
    if (gh) {
      try {
        const checks = await gh.getPRChecks(pr.number);
        if (checks.length > 0) {
          const passing = checks.filter((c) => c.conclusion?.toUpperCase() === 'SUCCESS').length;
          const failing = checks.filter((c) => c.conclusion?.toUpperCase() === 'FAILURE').length;
          const pending = checks.filter((c) => !c.conclusion && c.state !== 'COMPLETED').length;
          let ciLine = `${theme.muted('  CI:')}     `;
          if (failing > 0) {
            ciLine += theme.error(`✗ ${failing}/${checks.length} failing`);
          } else if (pending > 0) {
            ciLine += theme.muted(`⏳ ${pending} pending`);
            if (passing > 0) ciLine += ` · ` + theme.success(`✓ ${passing} passing`);
          } else if (passing > 0) {
            ciLine += theme.success(`✓ ${passing}/${checks.length} passing`);
          }
          lines.push(ciLine);
        }
      } catch {
        // CI status is non-fatal
      }
    }
  }

  if (commitsResult.status === 'fulfilled' && commitsResult.value.length > 0) {
    const commits = commitsResult.value.slice(0, 5);
    lines.push('');
    lines.push(theme.primaryBold('Commits:'));
    for (const c of commits) {
      lines.push(`  ${theme.muted(symbols.arrow)} ${c}`);
    }
    if (commitsResult.value.length > 5) {
      lines.push(theme.muted(`  ... and ${commitsResult.value.length - 5} more`));
    }
  }

  if (
    diffResult.status === 'fulfilled' &&
    diffResult.value.exitCode === 0 &&
    diffResult.value.stdout.trim()
  ) {
    const stat = diffResult.value.stdout.trim();
    const lastLine = stat.split('\n').pop() ?? '';
    lines.push('');
    lines.push(`${theme.primaryBold('Diff:')} ${theme.muted(lastLine)}`);
  }

  console.log(
    boxen(lines.join('\n'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'gray',
      title: theme.primaryBold('morg status'),
      titleAlignment: 'left',
    }),
  );
}

export async function runStatus(): Promise<void> {
  await renderStatus();
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status [branch]')
    .description('Show branch status detail (default: current branch)')
    .option('--branch <branch>', 'Branch for shell prompt integration')
    .option('--short', 'Short output for shell prompt integration')
    .option('--json', 'Output branches as JSON')
    .action(
      async (
        branch: string | undefined,
        options: { branch?: string; short?: boolean; json?: boolean },
      ) => {
        if (options.short) {
          return renderStatus({ branch: options.branch, short: true });
        }
        let projectId: string;
        try {
          projectId = await requireTrackedRepo();
        } catch {
          if (options.json) {
            process.stdout.write(JSON.stringify({ branches: [] }, null, 2) + '\n');
            return;
          }
          console.log(theme.muted('Not in a morg-tracked repo.'), theme.muted('Run: morg init'));
          return;
        }

        if (options.json) {
          const branchesFile = await configManager.getBranches(projectId);
          process.stdout.write(JSON.stringify({ branches: branchesFile.branches }, null, 2) + '\n');
          return;
        }

        const currentBranch = await getCurrentBranch();
        const targetBranch = branch ?? currentBranch;
        await runStatusDetail(targetBranch, projectId);
      },
    );
}
