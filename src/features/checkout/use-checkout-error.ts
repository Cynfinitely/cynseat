"use client";

import { useTranslations } from "next-intl";
import type { ActionFailure } from "@/app/_lib/action";

/** Message for a failed cart or checkout action. */
export function useCheckoutErrorText(): (failure: ActionFailure) => string {
  const t = useTranslations("checkout.errors");
  return (failure) => {
    const key = failure.reason as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : t("try_again");
  };
}
