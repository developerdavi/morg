import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { theme } from '../ui/theme';

/**
 * Signal the morg shell wrapper (installed via `morg shell-init`) to cd
 * into `targetPath` after the CLI process exits.
 *
 * Works by writing the path to a temp file named after the parent shell's
 * PID. The wrapper reads and deletes this file, then runs `cd` in the shell.
 *
 * Also prints a status line:
 * - With wrapper active (MORG_SHELL_INIT=1): "Moving shell to <path>"
 * - Without wrapper: "cd <path>" + install hint
 */
export function signalWorktreeCd(worktreePath: string): void {
  try {
    writeFileSync(join(tmpdir(), `morg_chdir_${process.ppid}`), worktreePath);
  } catch {
    // Ignore — fallback message is shown regardless
  }

  if (process.env['MORG_SHELL_INIT'] === '1') {
    console.log(theme.muted(`  Moving shell to ${worktreePath}`));
  } else {
    console.log(theme.muted(`  cd ${worktreePath}`));
    console.log(
      theme.muted(`  Tip: add eval "$(morg shell-init zsh)" to ~/.zshrc to switch automatically`),
    );
  }
}
