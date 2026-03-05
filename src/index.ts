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
import { registerTicketsCommand } from './commands/tickets';
import { registerInstallClaudeSkillCommand } from './commands/install-claude-skill';

const program = new Command();

program.name('morg').description('Developer productivity assistant').version('0.1.0');

program.action(() => runStatus());

const NO_CONFIG_COMMANDS = new Set(['config', 'install-claude-skill']);
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
registerTicketsCommand(program);
registerInstallClaudeSkillCommand(program);

program.parseAsync(process.argv).catch(handleError);
