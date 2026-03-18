import { Command } from 'commander';
import { handleError } from './utils/errors';
import { requireConfig, requireTrackedRepo } from './utils/detect';
import { registerConfigCommand } from './commands/config';
import { registerInitCommand } from './commands/init';
import { registerStartCommand } from './commands/start';
import { registerTrackCommand } from './commands/track';
import { registerUntrackCommand } from './commands/untrack';
import { registerSwitchCommand } from './commands/switch';
import { registerPrCommand } from './commands/pr';
import { registerSyncCommand } from './commands/sync';
import { registerStatusCommand, runStatusDetail } from './commands/status';
import { registerLsCommand } from './commands/ls';
import { registerStandupCommand } from './commands/standup';
import { registerPromptCommand } from './commands/prompt';
import { registerUpdateCommand } from './commands/update';
import { registerCompleteCommand } from './commands/complete';
import { registerDeleteCommand } from './commands/delete';
import { registerCleanCommand } from './commands/clean';
import { registerTicketsCommand } from './commands/tickets';
import { registerInstallClaudeSkillCommand } from './commands/install-claude-skill';
import { registerShellInitCommand } from './commands/shell-init';
import { registerWorktreeCommand } from './commands/worktree';
import { registerCompletionsCommand } from './commands/completions';
import { getCurrentBranch } from './git/index';
import { configManager } from './config/manager';
import { findBranchCaseInsensitive } from './utils/ticket';
import { renderBranches } from './ui/output';
import { theme } from './ui/theme';

const program = new Command();

program.name('morg').description('Developer productivity assistant').version('0.1.0');

program.action(async () => {
  try {
    const projectId = await requireTrackedRepo();
    const [currentBranch, branchesFile, projectConfig] = await Promise.all([
      getCurrentBranch(),
      configManager.getBranches(projectId),
      configManager.getProjectConfig(projectId),
    ]);
    const trackedBranch = findBranchCaseInsensitive(branchesFile.branches, currentBranch);

    if (trackedBranch) {
      await runStatusDetail(currentBranch, projectId);
    } else {
      await renderBranches();
      if (currentBranch !== projectConfig.defaultBranch) {
        console.log(
          theme.muted(`\nCurrent branch "${currentBranch}" is not being tracked. → morg track`),
        );
      }
    }
  } catch {
    await renderBranches();
  }
});

const NO_CONFIG_COMMANDS = new Set([
  'config',
  'install-claude-skill',
  'shell-init',
  '_completions',
]);
program.hook('preAction', async (_thisCommand, actionCommand) => {
  if (!NO_CONFIG_COMMANDS.has(actionCommand.name())) await requireConfig();
});

registerConfigCommand(program);
registerInitCommand(program);
registerStartCommand(program);
registerTrackCommand(program);
registerUntrackCommand(program);
registerSwitchCommand(program);
registerPrCommand(program);
registerSyncCommand(program);
registerStatusCommand(program);
registerLsCommand(program);
registerStandupCommand(program);
registerPromptCommand(program);
registerUpdateCommand(program);
registerCompleteCommand(program);
registerDeleteCommand(program);
registerCleanCommand(program);
registerTicketsCommand(program);
registerInstallClaudeSkillCommand(program);
registerShellInitCommand(program);
registerWorktreeCommand(program);
registerCompletionsCommand(program);

program.parseAsync(process.argv).catch(handleError);
