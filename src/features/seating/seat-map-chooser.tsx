"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { attachSeatMapAction, createSeatMapAction } from "./actions";

/** For an event without reserved seating: pick one of the venue's maps, or start a new one. */
export function SeatMapChooser({
  orgSlug,
  eventId,
  venueId,
  maps,
}: {
  orgSlug: string;
  eventId: string;
  venueId: string;
  maps: { id: string; name: string; seatCount: number }[];
}) {
  const t = useTranslations("seating");
  const errorText = useErrorText();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function attach(seatMapId: string) {
    setPending(true);
    setError(undefined);
    const result = await attachSeatMapAction(orgSlug, eventId, seatMapId);
    setPending(false);
    if (!result.ok) setError(errorText(result.reason));
    router.refresh();
  }

  async function create() {
    setPending(true);
    setError(undefined);
    const result = await createSeatMapAction(orgSlug, { venueId, name });
    if (!result.ok) {
      setPending(false);
      setError(errorText(result.fields.name ?? result.reason));
      return;
    }
    router.push(`/dashboard/${orgSlug}/seat-maps/${result.data.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {maps.length > 0 ? (
        <section aria-labelledby="choose-map">
          <h3 id="choose-map" className="text-ink font-semibold">
            {t("event.choose")}
          </h3>
          <ul className="border-line divide-line mt-2 divide-y rounded-xl border text-sm">
            {maps.map((map) => (
              <li
                key={map.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span>
                  <span className="text-ink font-medium">{map.name}</span>
                  <span className="text-muted"> · {t("maps.seats", { count: map.seatCount })}</span>
                </span>
                <span className="flex gap-2">
                  <Link
                    href={`/dashboard/${orgSlug}/seat-maps/${map.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    {t("maps.edit")}
                    <span className="sr-only"> {map.name}</span>
                  </Link>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || map.seatCount === 0}
                    onClick={() => attach(map.id)}
                  >
                    {t("event.use")}
                    <span className="sr-only"> {map.name}</span>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field id="new-map-name" label={t("event.newName")}>
          <Input
            {...controlProps("new-map-name", {})}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {t("event.create")}
        </Button>
      </form>
    </div>
  );
}
