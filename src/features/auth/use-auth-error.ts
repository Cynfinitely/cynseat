"use client";

import { useTranslations } from "next-intl";

/** Translates a Better Auth error code, falling back to a generic message. */
export function useAuthErrorText(): (code: string | undefined) => string {
  const t = useTranslations("auth.errors");
  return (code) => {
    const key = (code ?? "generic") as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t("generic");
  };
}
