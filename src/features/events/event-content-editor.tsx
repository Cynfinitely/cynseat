"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { eventTranslationSchema } from "@/domain/events/schemas";
import { contentLocales, type ContentLocale } from "@/domain/events/types";
import { useRouter } from "@/i18n/navigation";
import { removeTranslationAction, saveTranslationAction } from "./actions";
import { useActionForm } from "./use-action-form";

export type TranslationValues = { title: string; summary: string; description: string };

type Props = {
  orgSlug: string;
  eventId: string;
  defaultLocale: ContentLocale;
  translations: Partial<Record<ContentLocale, TranslationValues>>;
  disabled: boolean;
};

const empty: TranslationValues = { title: "", summary: "", description: "" };

export function EventContentEditor(props: Props) {
  const t = useTranslations("events.content");
  const tCommon = useTranslations("common");
  const [locale, setLocale] = useState<ContentLocale>(props.defaultLocale);

  return (
    <div className="space-y-4">
      <p className="text-muted text-sm">{t("intro")}</p>
      <Field id="content-locale" label={t("choose")} className="max-w-xs">
        <Select
          id="content-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value as ContentLocale)}
        >
          {contentLocales.map((value) => (
            <option key={value} value={value}>
              {tCommon(`contentLanguages.${value}`)}
              {value === props.defaultLocale ? ` (${t("main")})` : ""}
              {props.translations[value] ? "" : ` (${t("missing")})`}
            </option>
          ))}
        </Select>
      </Field>
      {/* Keyed by language so each one gets its own form state. */}
      <TranslationForm key={locale} locale={locale} {...props} />
    </div>
  );
}

function TranslationForm({
  orgSlug,
  eventId,
  defaultLocale,
  translations,
  disabled,
  locale,
}: Props & { locale: ContentLocale }) {
  const t = useTranslations("events");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const form = useActionForm();
  const existing = translations[locale];
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TranslationValues>({
    resolver: zodResolver(eventTranslationSchema.omit({ locale: true })) as never,
    defaultValues: existing ?? empty,
  });

  const onSubmit = handleSubmit(async (values) => {
    await form.submit(() => saveTranslationAction(orgSlug, eventId, { ...values, locale }));
    router.refresh();
  });
  const error = (name: keyof TranslationValues) => form.fieldError(name, errors[name]?.message);

  return (
    <form onSubmit={onSubmit} noValidate lang={locale}>
      <fieldset disabled={disabled} className="space-y-4">
        {form.saved ? <Alert tone="success">{t("content.saved")}</Alert> : null}
        {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
        <Field id="title" label={t("create.name")} error={error("title")}>
          <Input {...controlProps("title", { error: error("title") })} {...register("title")} />
        </Field>
        <Field
          id="summary"
          label={t("content.summary")}
          optional={tCommon("optional")}
          hint={t("content.summaryHint")}
          error={error("summary")}
        >
          <Input
            maxLength={200}
            {...controlProps("summary", {
              error: error("summary"),
              hint: t("content.summaryHint"),
            })}
            {...register("summary")}
          />
        </Field>
        <Field
          id="description"
          label={t("content.description")}
          optional={tCommon("optional")}
          hint={t("content.descriptionHint")}
          error={error("description")}
        >
          <Textarea
            className="min-h-48"
            {...controlProps("description", {
              error: error("description"),
              hint: t("content.descriptionHint"),
            })}
            {...register("description")}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {t("content.save")}
          </Button>
          {existing && locale !== defaultLocale ? (
            <Button
              variant="ghost"
              onClick={async () => {
                await form.submit(() => removeTranslationAction(orgSlug, eventId, locale));
                router.refresh();
              }}
            >
              {t("content.remove")}
            </Button>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
