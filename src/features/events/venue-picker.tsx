"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { TimeZoneSelect } from "@/components/time-zone-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { venueSchema } from "@/domain/venues/schemas";
import { useRouter } from "@/i18n/navigation";
import { countryOptions } from "@/lib/countries";
import {
  createVenueForEventAction,
  searchVenuesAction,
  setEventVenueAction,
  type VenueOption,
} from "./actions";
import { useActionForm } from "./use-action-form";

type VenueValues = {
  name: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  timezone: string;
  capacity: string;
};

type Props = {
  orgSlug: string;
  eventId: string;
  eventTimezone: string;
  defaultCountry: string;
  hasPlace: boolean;
  isOnline: boolean;
  disabled: boolean;
};

export function VenuePicker(props: Props) {
  const { orgSlug, eventId, disabled } = props;
  const t = useTranslations("events.venue");
  const router = useRouter();
  const choice = useActionForm();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VenueOption[]>();
  const [searching, setSearching] = useState(false);

  async function search() {
    setSearching(true);
    const found = await searchVenuesAction(orgSlug, { query });
    setSearching(false);
    setResults(found.ok ? found.data : []);
  }

  async function choose(input: { kind: "venue"; venueId: string } | { kind: "online" | "none" }) {
    await choice.submit(() => setEventVenueAction(orgSlug, eventId, input));
    router.refresh();
  }

  return (
    <fieldset disabled={disabled} className="space-y-8">
      {choice.saved ? <Alert tone="success">{t("chosen")}</Alert> : null}
      {choice.formError ? <Alert tone="danger">{choice.formError}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {!props.isOnline ? (
          <Button variant="secondary" size="sm" onClick={() => choose({ kind: "online" })}>
            {t("makeOnline")}
          </Button>
        ) : null}
        {props.hasPlace ? (
          <Button variant="ghost" size="sm" onClick={() => choose({ kind: "none" })}>
            {t("clear")}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="venue-search-title" className="max-w-xl space-y-3">
        <h2 id="venue-search-title" className="text-ink text-lg font-semibold">
          {t("searchLabel")}
        </h2>
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <Input
            type="search"
            aria-label={t("searchLabel")}
            aria-describedby="venue-search-hint"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={searching}>
            {t("search")}
          </Button>
        </form>
        <p id="venue-search-hint" className="text-muted text-sm">
          {t("searchHint")}
        </p>
        <div aria-live="polite">
          {results?.length === 0 ? <p className="text-muted text-sm">{t("noResults")}</p> : null}
          {results && results.length > 0 ? (
            <ul className="border-line divide-line divide-y rounded-xl border text-sm">
              {results.map((venue) => (
                <li
                  key={venue.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span>
                    <span className="text-ink font-medium">{venue.name}</span>
                    <span className="text-muted">
                      {" · "}
                      {venue.addressLine1}, {venue.city}
                      {venue.capacity ? ` · ${t("capacityValue", { count: venue.capacity })}` : ""}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => choose({ kind: "venue", venueId: venue.id })}
                  >
                    {t("choose")}
                    <span className="sr-only"> {venue.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <NewVenueForm {...props} />
    </fieldset>
  );
}

function NewVenueForm({ orgSlug, eventId, eventTimezone, defaultCountry }: Props) {
  const t = useTranslations("events.venue");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const form = useActionForm();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VenueValues, unknown, VenueValues>({
    resolver: zodResolver(venueSchema) as never,
    defaultValues: {
      name: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
      city: "",
      country: defaultCountry,
      timezone: eventTimezone,
      capacity: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await form.submit(async () => {
      const outcome = await createVenueForEventAction(orgSlug, eventId, values);
      return outcome.ok ? { ok: true as const, data: true } : outcome;
    });
    if (result) {
      reset();
      router.refresh();
    }
  });
  const error = (name: keyof VenueValues) => form.fieldError(name, errors[name]?.message);
  const text = (name: keyof VenueValues, label: string, optional = false) => (
    <Field
      id={`venue-${name}`}
      label={label}
      optional={optional ? tCommon("optional") : undefined}
      error={error(name)}
    >
      <Input {...controlProps(`venue-${name}`, { error: error(name) })} {...register(name)} />
    </Field>
  );

  return (
    <section aria-labelledby="venue-add-title" className="max-w-xl">
      <h2 id="venue-add-title" className="text-ink text-lg font-semibold">
        {t("addTitle")}
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
        {form.saved ? <Alert tone="success">{t("chosen")}</Alert> : null}
        {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
        {text("name", t("name"))}
        {text("addressLine1", t("addressLine1"))}
        {text("addressLine2", t("addressLine2"), true)}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("postalCode", t("postalCode"), true)}
          {text("city", t("city"))}
          <Field id="venue-country" label={t("country")} error={error("country")}>
            <Select
              {...controlProps("venue-country", { error: error("country") })}
              {...register("country")}
            >
              {countryOptions(locale).map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="venue-timezone" label={t("timezone")} error={error("timezone")}>
            <TimeZoneSelect
              {...controlProps("venue-timezone", { error: error("timezone") })}
              {...register("timezone")}
            />
          </Field>
          <Field
            id="venue-capacity"
            label={t("capacity")}
            optional={tCommon("optional")}
            error={error("capacity")}
          >
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              {...controlProps("venue-capacity", { error: error("capacity") })}
              {...register("capacity")}
            />
          </Field>
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {t("add")}
        </Button>
      </form>
    </section>
  );
}
