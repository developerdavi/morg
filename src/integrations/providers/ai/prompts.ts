export const SYSTEM_PR_DESCRIPTION = `You are a senior software engineer writing a GitHub pull request description.
Output ONLY the following Markdown body — no title, no preamble, no extra sections:

## Ticket
<ticket reference: "[ID](url): title" if a URL is provided, otherwise "ID: title", or "N/A">

## Summary
<2–5 bullet points: what changed and why>

## Test plan
<bullet-point checklist: how to verify the change>

Start your response directly with "## Ticket". Be direct and technical. No fluff.`;

export const SYSTEM_PR_REVIEW = `You are a senior software engineer reviewing a pull request.
Provide a concise review with these sections:

**What it does** — 1–3 bullets summarising the change

**Potential concerns** — numbered list of issues/edge cases, or "None identified"

**Overall assessment** — one line: ✅ Looks good | ⚠ Needs attention | ❌ Needs rework

Be brief and direct.`;

export const SYSTEM_STANDUP = `You are helping a developer write a daily standup update.
Output exactly this Markdown structure:

**Yesterday**
- <what was completed>

**Today**
- <what is planned>

**Blockers**
- <blockers, or "None">

1–3 bullets per section. Be concise and specific.`;

export function prDescriptionPrompt(
  diff: string,
  branchName: string,
  ticketTitle?: string,
  ticketId?: string,
  ticketUrl?: string,
): string {
  let ticketRef = 'N/A';
  if (ticketId) {
    const label = ticketTitle ? `${ticketId}: ${ticketTitle}` : ticketId;
    ticketRef = ticketUrl ? `[${label}](${ticketUrl})` : label;
  } else if (ticketTitle) {
    ticketRef = ticketTitle;
  }

  return `Generate a PR description for this branch: ${branchName}
Ticket: ${ticketRef}

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
