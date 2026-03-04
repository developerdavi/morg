import chalk from 'chalk';

export const theme = {
  primary: chalk.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  muted: chalk.gray,
  bold: chalk.bold,
  dim: chalk.dim,
  // Combined
  successBold: chalk.green.bold,
  errorBold: chalk.red.bold,
  primaryBold: chalk.cyan.bold,
};

export const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  bullet: '•',
  dot: '·',
};
