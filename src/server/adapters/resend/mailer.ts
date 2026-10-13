import type { Mailer } from "../../ports/mailer";

const ENDPOINT = "https://api.resend.com/emails";

export function createResendMailer(options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): Mailer {
  const doFetch = options.fetch ?? fetch;
  return {
    async send(message) {
      const response = await doFetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo,
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status})`);
      }
    },
  };
}
