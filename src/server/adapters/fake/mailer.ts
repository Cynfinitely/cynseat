import type { MailMessage, Mailer } from "../../ports/mailer";

/** Development mailer: prints instead of sending. */
export function createConsoleMailer(log: (line: string) => void = console.log): Mailer {
  return {
    async send(message) {
      log(`[mail] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    },
  };
}

/** Test mailer: keeps everything it was asked to send. */
export function createMemoryMailer(): Mailer & {
  sent: MailMessage[];
  failNext(error: Error): void;
} {
  const sent: MailMessage[] = [];
  let failure: Error | undefined;
  return {
    sent,
    failNext(error) {
      failure = error;
    },
    async send(message) {
      if (failure) {
        const error = failure;
        failure = undefined;
        throw error;
      }
      sent.push(message);
    },
  };
}
