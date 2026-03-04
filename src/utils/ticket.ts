// Ticket ID pattern: e.g. MORG-42, ABC-123, TM-1
const TICKET_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;
const TICKET_IN_STRING = /([A-Z][A-Z0-9]+-\d+)/;

export function isTicketId(input: string): boolean {
  return TICKET_PATTERN.test(input.trim().toUpperCase());
}

export function extractTicketId(input: string): string | null {
  const match = TICKET_IN_STRING.exec(input);
  return match?.[1] ?? null;
}

export function branchNameFromTicket(ticketId: string, title?: string): string {
  const id = ticketId.toLowerCase();
  if (!title) return `feat/${id}`;
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `feat/${id}-${slug}`;
}
