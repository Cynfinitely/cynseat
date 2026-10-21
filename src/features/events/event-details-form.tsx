"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { TimeZoneSelect } from "@/components/time-zone-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateEventSchema } from "@/domain/events/schemas";
import { eventCategories, eventVisibilities } from "@/domain/events/types";
import { currencies } from "@/domain/money/money";
import { updateEventAction } from "./actions";
import { useActionForm } from "./use-action-form";

export type EventDetailsValues = {
  category: string;
  visibility: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  doorsAt: string;
  currency: string;
  maxTicketsPerOrder: string;
};

export function EventDetailsForm({
  orgSlug,
  eventId,
  initial,
  disabled,
}: {
  orgSlug: string;
  eventId: string;
  initial: EventDetailsValues;
  disabled: boolean;
}) {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");
  const form = useActionForm();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventDetailsValues, unknown, EventDetailsValues>({
    resolver: zodResolver(updateEventSchema) as never,
    defaultValues: initial,
  });

  const onSubmit = handleSubmit((values) =>
    form.submit(() => updateEventAction(orgSlug, eventId, values)),
  );
  const error = (name: keyof EventDetailsValues) => form.fieldError(name, errors[name]?.message);
  const dateField = (name: "startsAt" | "endsAt" | "doorsAt", label: string, optional = true) => (
    <Field
      id={name}
      label={label}
      optional={optional ? tCommon("optional") : undefined}
      error={error(name)}
    >
      <Input
        type="datetime-local"
        {...controlProps(name, { error: error(name) })}
        {...register(name)}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={disabled} className="space-y-4">
        {form.saved ? <Alert tone="success">{t("details.saved")}</Alert> : null}
        {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {dateField("startsAt", t("create.startsAt"), false)}
          {dateField("endsAt", t("details.endsAt"))}
          {dateField("doorsAt", t("details.doorsAt"))}
          <Field
            id="timezone"
            label={t("create.timezone")}
            hint={t("create.timezoneHint")}
            error={error("timezone")}
          >
            <TimeZoneSelect
              {...controlProps("timezone", {
                error: error("timezone"),
                hint: t("create.timezoneHint"),
              })}
              {...register("timezone")}
            />
          </Field>
          <Field id="category" label={t("create.category")}>
            <Select {...controlProps("category", {})} {...register("category")}>
              {eventCategories.map((value) => (
                <option key={value} value={value}>
                  {tCommon(`categories.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="visibility" label={t("details.visibility")}>
            <Select {...controlProps("visibility", {})} {...register("visibility")}>
              {eventVisibilities.map((value) => (
                <option key={value} value={value}>
                  {t(
                    value === "public" ? "details.visibilityPublic" : "details.visibilityUnlisted",
                  )}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="currency" label={t("details.currency")} error={error("currency")}>
            <Select
              {...controlProps("currency", { error: error("currency") })}
              {...register("currency")}
            >
              {currencies.map((value) => (
                <option key={value} value={value}>
                  {value.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="maxTicketsPerOrder"
            label={t("details.maxPerOrder")}
            error={error("maxTicketsPerOrder")}
          >
            <Input
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              {...controlProps("maxTicketsPerOrder", { error: error("maxTicketsPerOrder") })}
              {...register("maxTicketsPerOrder")}
            />
          </Field>
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {t("details.save")}
        </Button>
      </fieldset>
    </form>
  );
}
