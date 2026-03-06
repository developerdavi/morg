export type Ticket = {
  id: string;
  key: string;
  title: string;
  status: string;
  url: string | null;
  assignee?: { name: string; email?: string } | null;
  description?: string;
};

export interface TicketsProvider {
  getTicket(ticketId: string): Promise<Ticket>;
  listTickets(opts?: { status?: string }): Promise<Ticket[]>;
  transitionTicket(ticketId: string, transitionName: string): Promise<void>;
  getStatuses?(): Promise<string[]>;
}
