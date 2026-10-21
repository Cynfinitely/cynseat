"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/app/_lib/action";
import { useErrorText } from "@/lib/use-error-text";
import { mergeVenuesAction, setVenueHiddenAction } from "./venue-actions";

type Venue = {
  id: string;
  name: string;
  address: string;
  status: "active" | "hidden" | "merged";
  createdBy: string | null;
  events: number;
};

export function VenueModeration({ venues }: { venues: Venue[] }) {
  const t = useTranslations("admin.venues");
  const errorText = useErrorText();
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string }>();
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  /** Runs an admin action, shows its outcome, and reloads the list. */
  async function run<T>(action: () => Promise<ActionResult<T>>, describe: (data: T) => string) {
    setPending(true);
    setMessage(undefined);
    const result = await action();
    setPending(false);
    setMessage(
      result.ok
        ? { tone: "success", text: describe(result.data) }
        : { tone: "danger", text: errorText(result.reason) ?? "" },
    );
    router.refresh();
  }

  if (venues.length === 0) return <p className="text-muted mt-6">{t("empty")}</p>;

  return (
    <div className="mt-6 space-y-4">
      <div aria-live="polite">
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      </div>
      <ul className="space-y-3">
        {venues.map((venue) => {
          const keepId = targets[venue.id] ?? "";
          const keep = venues.find((other) => other.id === keepId);
          return (
            <li key={venue.id}>
              <Card className="space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-ink font-semibold">{venue.name}</h2>
                    <p className="text-sm">{venue.address}</p>
                    <p className="text-muted text-sm">
                      {venue.createdBy ? `${t("by", { organization: venue.createdBy })} · ` : ""}
                      {t("events", { count: venue.events })}
                    </p>
                  </div>
                  {venue.status === "hidden" ? <Badge tone="warning">{t("hidden")}</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          setVenueHiddenAction({
                            venueId: venue.id,
                            hidden: venue.status === "active",
                          }),
                        () => (venue.status === "active" ? t("hidden") : t("restore")),
                      )
                    }
                  >
                    {venue.status === "active" ? t("hide") : t("restore")}
                    <span className="sr-only"> {venue.name}</span>
                  </Button>
                  <Select
                    aria-label={`${t("mergeInto")}: ${venue.name}`}
                    className="w-auto py-1.5"
                    value={keepId}
                    onChange={(event) => setTargets({ ...targets, [venue.id]: event.target.value })}
                  >
                    <option value="">{t("mergeChoose")}</option>
                    {venues
                      .filter((other) => other.id !== venue.id)
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.name} · {other.address}
                        </option>
                      ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending || !keep}
                    onClick={() => {
                      if (
                        !keep ||
                        !window.confirm(
                          t("mergeConfirm", { duplicate: venue.name, keep: keep.name }),
                        )
                      )
                        return;
                      void run(
                        () => mergeVenuesAction({ duplicateId: venue.id, keepId: keep.id }),
                        (moved) => t("merged", { events: moved.events, maps: moved.seatMaps }),
                      );
                    }}
                  >
                    {t("merge")}
                    <span className="sr-only"> {venue.name}</span>
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
