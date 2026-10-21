"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";

const format = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * Shows how long the reservation has left. `secondsLeft` is measured on the server when
 * the page is rendered, so a wrong clock on the buyer's device does not skew it.
 */
export function HoldCountdown({ secondsLeft }: { secondsLeft: number }) {
  const t = useTranslations("checkout.page");
  const [remaining, setRemaining] = useState(secondsLeft);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      setRemaining(Math.max(0, secondsLeft - Math.round((Date.now() - started) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  if (remaining === 0) return <Alert tone="danger">{t("expired")}</Alert>;
  return (
    // Announced once a minute, not every second.
    <Alert tone={remaining < 120 ? "warning" : "info"}>
      <span aria-hidden>{t("reserved", { time: format(remaining) })}</span>
      <span className="sr-only" aria-live="polite">
        {t("reserved", { time: format(Math.ceil(remaining / 60) * 60) })}
      </span>
    </Alert>
  );
}
