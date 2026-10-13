import type admin from "../../messages/en/admin.json";
import type auth from "../../messages/en/auth.json";
import type common from "../../messages/en/common.json";
import type dashboard from "../../messages/en/dashboard.json";
import type events from "../../messages/en/events.json";
import type storefront from "../../messages/en/storefront.json";
import type { Locale } from "./routing";

// One file per feature under messages/<locale>/. Add the namespace here and in `Messages`.
// (emails.json is read by the server's email templates, not by the UI.)
export const namespaces = ["common", "auth", "dashboard", "admin", "events", "storefront"] as const;

export type Messages = {
  common: typeof common;
  auth: typeof auth;
  dashboard: typeof dashboard;
  admin: typeof admin;
  events: typeof events;
  storefront: typeof storefront;
};

export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    namespaces.map(async (namespace) => {
      const loaded = (await import(`../../messages/${locale}/${namespace}.json`)) as {
        default: unknown;
      };
      return [namespace, loaded.default] as const;
    }),
  );
  return Object.fromEntries(entries) as Messages;
}
