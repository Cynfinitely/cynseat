import type common from "../../messages/en/common.json";
import type { Locale } from "./routing";

// One file per feature under messages/<locale>/. Add the namespace here and in `Messages`.
export const namespaces = ["common"] as const;

export type Messages = {
  common: typeof common;
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
