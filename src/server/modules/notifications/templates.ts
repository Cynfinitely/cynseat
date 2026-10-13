import en from "../../../../messages/en/emails.json";
import fi from "../../../../messages/fi/emails.json";
import tr from "../../../../messages/tr/emails.json";
import { escapeHtml, interpolate } from "../../../domain/text/escape";

export const emailLocales = ["en", "fi", "tr"] as const;
export type EmailLocale = (typeof emailLocales)[number];

const catalogs: Record<EmailLocale, typeof en> = { en, fi, tr };

export function toEmailLocale(value: string | null | undefined): EmailLocale {
  return (emailLocales as readonly string[]).includes(value ?? "") ? (value as EmailLocale) : "en";
}

/** Every email CynSeat sends, with the data its template needs. */
export type EmailTemplate =
  | { template: "verifyEmail"; data: { name: string; url: string } }
  | { template: "resetPassword"; data: { name: string; url: string } }
  | {
      template: "orgInvitation";
      data: { inviter: string; organization: string; role: string; url: string };
    }
  | {
      template: "orgApproved" | "orgRejected" | "orgSuspended";
      data: { organization: string; url: string; note?: string };
    };

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderEmail(locale: EmailLocale, email: EmailTemplate): RenderedEmail {
  const catalog = catalogs[locale];
  const strings = catalog[email.template];
  const values: Record<string, string> = { ...email.data };
  if (email.template === "orgInvitation") {
    const roles: Record<string, string> = catalog.roles;
    values.role = roles[email.data.role] ?? email.data.role;
  }

  const paragraphs = [interpolate(strings.body, values)];
  if ("note" in email.data && email.data.note) {
    paragraphs.push(interpolate(catalog.note, { note: email.data.note }));
  }
  const heading = interpolate(strings.heading, values);
  const { url } = email.data;

  const text = [
    heading,
    "",
    ...paragraphs,
    "",
    `${strings.action}: ${url}`,
    "",
    catalog.layout.footer,
  ].join("\n");

  // Values are escaped after interpolation, so user-supplied names cannot inject markup.
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">
      <p style="margin:0 0 24px;font-weight:700;font-size:18px;color:#7e22ce">CynSeat</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#111827">${escapeHtml(heading)}</h1>
      ${paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join("\n      ")}
      <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#9333ea;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:6px">${escapeHtml(strings.action)}</a></p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280">${escapeHtml(catalog.layout.linkHelp)}</p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all"><a href="${escapeHtml(url)}" style="color:#7e22ce">${escapeHtml(url)}</a></p>
      <p style="margin:0;font-size:12px;color:#6b7280">${escapeHtml(catalog.layout.footer)}</p>
    </div>
  </body>
</html>`;

  return { subject: interpolate(strings.subject, values), html, text };
}
