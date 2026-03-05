import { configManager } from '../config/manager';
import { isWorkingTreeDirty, stash } from '../git/index';
import { theme } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm } from '../ui/prompts';

/**
 * Handles a dirty working tree before a branch switch.
 * Returns true if a stash was created (caller should stashPop after checkout).
 */
export async function handleDirtyTree(
  currentBranch: string,
  targetBranch: string,
): Promise<boolean> {
  if (!(await isWorkingTreeDirty())) return false;

  const globalConfig = await configManager.getGlobalConfig();
  const mode = globalConfig.autoStash;

  if (mode === 'never') {
    console.log(theme.muted('  Working tree is dirty — skipping stash (autoStash: never)'));
    return false;
  }

  if (mode === 'always') {
    await withSpinner(`Stashing changes on ${currentBranch}...`, () =>
      stash(`morg: stash before switching to ${targetBranch}`),
    );
    return true;
  }

  // mode === 'ask'
  const defaultValue = globalConfig.lastStashChoice !== 'skip';
  const shouldStash = await confirm({
    message: `Stash changes on ${currentBranch} before switching?`,
    initialValue: defaultValue,
  });

  await configManager.saveGlobalConfig({
    ...globalConfig,
    lastStashChoice: shouldStash ? 'stash' : 'skip',
  });

  if (!shouldStash) return false;

  await withSpinner(`Stashing changes on ${currentBranch}...`, () =>
    stash(`morg: stash before switching to ${targetBranch}`),
  );
  return true;
}
