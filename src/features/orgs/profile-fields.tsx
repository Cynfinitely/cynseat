"use client";

import { useLocale, useTranslations } from "next-intl";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { controlProps, Field, Select, Textarea } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { UpdateOrgProfileInput } from "@/domain/orgs/schemas";
import { countryOptions } from "@/lib/countries";
import { useErrorText } from "@/lib/use-error-text";

// The form's raw values: every control holds a string until the schema parses it.
export type ProfileFormValues = {
  [Key in keyof UpdateOrgProfileInput]-?: string;
};

type Props<Values extends ProfileFormValues> = {
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
  serverErrors: Record<string, string>;
};

/** Contact and legal fields shared by registration and settings. */
export function ProfileFields<Values extends ProfileFormValues>(props: Props<Values>) {
  // The fields are common to every form that uses this component.
  const { register, errors, serverErrors } = props as unknown as Props<ProfileFormValues>;
  const t = useTranslations("dashboard.register");
  const optional = useTranslations("common")("optional");
  const locale = useLocale();
  const errorText = useErrorText();
  const error = (name: keyof ProfileFormValues) =>
    errorText(errors[name]?.message ?? serverErrors[name]);

  return (
    <>
      <Field
        id="contactEmail"
        label={t("contactEmail")}
        hint={t("contactEmailHint")}
        error={error("contactEmail")}
      >
        <Input
          type="email"
          autoComplete="email"
          {...controlProps("contactEmail", {
            error: error("contactEmail"),
            hint: t("contactEmailHint"),
          })}
          {...register("contactEmail")}
        />
      </Field>
      <Field id="country" label={t("country")} error={error("country")}>
        <Select
          autoComplete="country"
          {...controlProps("country", { error: error("country") })}
          {...register("country")}
        >
          <option value="">{t("countryPlaceholder")}</option>
          {countryOptions(locale).map(({ code, name }) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="legalName" label={t("legalName")} optional={optional} error={error("legalName")}>
        <Input
          autoComplete="organization"
          {...controlProps("legalName", { error: error("legalName") })}
          {...register("legalName")}
        />
      </Field>
      <Field
        id="businessId"
        label={t("businessId")}
        optional={optional}
        error={error("businessId")}
      >
        <Input
          {...controlProps("businessId", { error: error("businessId") })}
          {...register("businessId")}
        />
      </Field>
      <Field id="website" label={t("website")} optional={optional} error={error("website")}>
        <Input
          type="url"
          placeholder="https://"
          autoComplete="url"
          {...controlProps("website", { error: error("website") })}
          {...register("website")}
        />
      </Field>
      <Field
        id="description"
        label={t("description")}
        optional={optional}
        hint={t("descriptionHint")}
        error={error("description")}
      >
        <Textarea
          {...controlProps("description", {
            error: error("description"),
            hint: t("descriptionHint"),
          })}
          {...register("description")}
        />
      </Field>
    </>
  );
}
