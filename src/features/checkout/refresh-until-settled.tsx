"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** Reloads the page's data every few seconds while a payment is being confirmed. */
export function RefreshUntilSettled({
  everyMs = 3000,
  attempts = 40,
}: {
  everyMs?: number;
  attempts?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let remaining = attempts;
    const timer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) clearInterval(timer);
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, attempts]);
  return null;
}
