"use client";

import { useTranslations } from "next-intl";

/** Translates an error key from a schema or use-case, falling back to a generic message. */
export function useErrorText(): (code: string | undefined) => string | undefined {
  const t = useTranslations("common.errors");
  return (code) => {
    if (!code) return undefined;
    const key = code as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t("generic");
  };
}
