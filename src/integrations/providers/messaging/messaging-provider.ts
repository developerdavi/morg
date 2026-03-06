export interface MessagingProvider {
  sendMessage(channel: string, text: string): Promise<void>;
  postFile?(channel: string, filename: string, content: string): Promise<void>;
}
