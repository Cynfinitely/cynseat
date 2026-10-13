export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type Mailer = {
  send(message: MailMessage): Promise<void>;
};
