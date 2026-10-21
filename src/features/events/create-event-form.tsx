"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { TimeZoneSelect } from "@/components/time-zone-select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createEventSchema, type CreateEventInput } from "@/domain/events/schemas";
import { contentLocales, eventCategories, type ContentLocale } from "@/domain/events/types";
import { useRouter } from "@/i18n/navigation";
import { createEventAction } from "./actions";
import { useActionForm } from "./use-action-form";

export function CreateEventForm({
  orgSlug,
  locale,
  timezone,
}: {
  orgSlug: string;
  locale: ContentLocale;
  timezone: string;
}) {
  const t = useTranslations("events.create");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const form = useActionForm();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateEventInput>({
    resolver: zodResolver(createEventSchema),
    defaultValues: { title: "", locale, category: "music", timezone, startsAt: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const created = await form.submit(() => createEventAction(orgSlug, values));
    if (created) router.push(`/dashboard/${orgSlug}/events/${created.id}`);
  });

  const titleError = form.fieldError("title", errors.title?.message);
  const startsError = form.fieldError("startsAt", errors.startsAt?.message);
  const zoneError = form.fieldError("timezone", errors.timezone?.message);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
      <Field id="title" label={t("name")} error={titleError}>
        <Input {...controlProps("title", { error: titleError })} {...register("title")} />
      </Field>
      <Field id="locale" label={t("language")} hint={t("languageHint")}>
        <Select {...controlProps("locale", { hint: t("languageHint") })} {...register("locale")}>
          {contentLocales.map((value) => (
            <option key={value} value={value}>
              {tCommon(`contentLanguages.${value}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="category" label={t("category")}>
        <Select {...controlProps("category", {})} {...register("category")}>
          {eventCategories.map((value) => (
            <option key={value} value={value}>
              {tCommon(`categories.${value}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="startsAt" label={t("startsAt")} error={startsError}>
        <Input
          type="datetime-local"
          {...controlProps("startsAt", { error: startsError })}
          {...register("startsAt")}
        />
      </Field>
      <Field id="timezone" label={t("timezone")} hint={t("timezoneHint")} error={zoneError}>
        <TimeZoneSelect
          {...controlProps("timezone", { error: zoneError, hint: t("timezoneHint") })}
          {...register("timezone")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
