import { Command } from 'commander';
import { handleError } from './utils/errors';
import { requireConfig } from './utils/detect';
import { registerConfigCommand } from './commands/config';
import { registerInitCommand } from './commands/init';
import { registerStartCommand } from './commands/start';
import { registerTrackCommand } from './commands/track';
import { registerUntrackCommand } from './commands/untrack';
import { registerSwitchCommand } from './commands/switch';
import { registerPrCommand } from './commands/pr';
import { registerSyncCommand } from './commands/sync';
import { registerStatusCommand, runStatus } from './commands/status';
import { registerStandupCommand } from './commands/standup';
import { registerPromptCommand } from './commands/prompt';
import { registerUpdateCommand } from './commands/update';
import { registerCompleteCommand } from './commands/complete';
import { registerDeleteCommand } from './commands/delete';
import { registerCleanCommand } from './commands/clean';
import { registerTicketsCommand } from './commands/tickets';
import { registerInstallClaudeSkillCommand } from './commands/install-claude-skill';
import { registerCompletionCommand } from './commands/completion';
import { registerWorktreeCommand } from './commands/worktree';

const program = new Command();

program.name('morg').description('Developer productivity assistant').version('0.1.0');

program.action(() => runStatus());

const NO_CONFIG_COMMANDS = new Set(['config', 'install-claude-skill', 'completion']);
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
registerStandupCommand(program);
registerPromptCommand(program);
registerUpdateCommand(program);
registerCompleteCommand(program);
registerDeleteCommand(program);
registerCleanCommand(program);
registerTicketsCommand(program);
registerInstallClaudeSkillCommand(program);
registerCompletionCommand(program);
registerWorktreeCommand(program);

program.parseAsync(process.argv).catch(handleError);
