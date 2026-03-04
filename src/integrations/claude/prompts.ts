export const SYSTEM_PR_DESCRIPTION = `You are a senior software engineer writing a GitHub pull request description.
Write a clear, concise PR description in markdown. Include:
- A brief summary of what the PR does
- Key changes made
- Any testing notes
Be direct and technical. No fluff.`;

export const SYSTEM_PR_REVIEW = `You are a senior software engineer reviewing a pull request.
Provide a concise summary of the diff, highlighting:
- What the change does
- Any potential concerns or edge cases
- Overall assessment (looks good / needs attention)
Be brief and direct.`;

export const SYSTEM_STANDUP = `You are helping a developer write a standup update.
Based on the recent git activity and task data, generate a brief standup:
- What I did yesterday
- What I'm doing today
- Any blockers

Keep it to 3-5 bullet points total. Be concise.`;

export function prDescriptionPrompt(diff: string, branchName: string, ticketTitle?: string): string {
  return `Generate a PR description for this branch: ${branchName}
${ticketTitle ? `Ticket: ${ticketTitle}` : ''}

Diff:
\`\`\`diff
${diff.slice(0, 8000)}
\`\`\``;
}

export function prReviewPrompt(diff: string, prTitle: string): string {
  return `Review this PR titled "${prTitle}":

\`\`\`diff
${diff.slice(0, 8000)}
\`\`\``;
}

export function standupPrompt(activity: {
  recentCommits: string[];
  activeTasks: string[];
  recentPRs: string[];
}): string {
  return `Generate a standup based on this activity:

Recent commits:
${activity.recentCommits.map((c) => `- ${c}`).join('\n')}

Active tasks:
${activity.activeTasks.map((t) => `- ${t}`).join('\n')}

Recent PRs:
${activity.recentPRs.map((p) => `- ${p}`).join('\n')}`;
}
