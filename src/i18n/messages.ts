import type account from "../../messages/en/account.json";
import type admin from "../../messages/en/admin.json";
import type auth from "../../messages/en/auth.json";
import type checkout from "../../messages/en/checkout.json";
import type common from "../../messages/en/common.json";
import type dashboard from "../../messages/en/dashboard.json";
import type events from "../../messages/en/events.json";
import type seating from "../../messages/en/seating.json";
import type storefront from "../../messages/en/storefront.json";
import type { Locale } from "./routing";

// One file per feature under messages/<locale>/. Add the namespace here and in `Messages`.
// (emails.json is read by the server's email templates, and legal.json by the privacy and
// terms pages, not through next-intl.)
export const namespaces = [
  "common",
  "auth",
  "dashboard",
  "admin",
  "events",
  "storefront",
  "checkout",
  "seating",
  "account",
] as const;

export type Messages = {
  common: typeof common;
  auth: typeof auth;
  dashboard: typeof dashboard;
  admin: typeof admin;
  events: typeof events;
  storefront: typeof storefront;
  checkout: typeof checkout;
  seating: typeof seating;
  account: typeof account;
};

// Fails to compile if a namespace is declared in `Messages` but missing from the list
// above (its pages would render without text), or the other way round.
type Unlisted = Exclude<keyof Messages, (typeof namespaces)[number]>;
type Undeclared = Exclude<(typeof namespaces)[number], keyof Messages>;
export const namespacesMatchMessages: [Unlisted, Undeclared] extends [never, never] ? true : never =
  true;

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
