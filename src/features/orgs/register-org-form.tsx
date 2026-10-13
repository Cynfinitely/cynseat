"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { ActionFailure } from "@/app/_lib/action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerOrganizationSchema } from "@/domain/orgs/schemas";
import { slugify } from "@/domain/slug/slug";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { registerOrganizationAction } from "./actions";
import { ProfileFields, type ProfileFormValues } from "./profile-fields";

type Values = ProfileFormValues & { name: string; slug: string };

const defaults: Values = {
  name: "",
  slug: "",
  contactEmail: "",
  country: "",
  legalName: "",
  businessId: "",
  website: "",
  description: "",
};

export function RegisterOrgForm({ contactEmail }: { contactEmail: string }) {
  const t = useTranslations("dashboard.register");
  const errorText = useErrorText();
  const router = useRouter();
  const [failure, setFailure] = useState<ActionFailure>();
  // The address follows the name until the user edits it themselves.
  const [slugEdited, setSlugEdited] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, Values>({
    resolver: zodResolver(registerOrganizationSchema) as never,
    defaultValues: { ...defaults, contactEmail },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    const result = await registerOrganizationAction(values);
    if (!result.ok) {
      setFailure(result);
      return;
    }
    router.push(`/dashboard/${result.data.slug}`);
  });

  const serverErrors = failure?.fields ?? {};
  const nameError = errorText(errors.name?.message ?? serverErrors.name);
  const slugError = errorText(errors.slug?.message ?? serverErrors.slug);
  const slug = useWatch({ control, name: "slug" });
  const slugHint = t("slugHint", { slug: slug || "…" });
  const nameField = register("name");

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {failure && Object.keys(failure.fields).length === 0 ? (
        <Alert tone="danger">{errorText(failure.reason)}</Alert>
      ) : null}
      <Field id="name" label={t("name")} error={nameError}>
        <Input
          autoComplete="organization"
          {...controlProps("name", { error: nameError })}
          {...nameField}
          onChange={(event) => {
            void nameField.onChange(event);
            if (!slugEdited) setValue("slug", slugify(event.target.value));
          }}
        />
      </Field>
      <Field id="slug" label={t("slug")} hint={slugHint} error={slugError}>
        <Input
          autoCapitalize="none"
          spellCheck={false}
          {...controlProps("slug", { error: slugError, hint: slugHint })}
          {...register("slug", { onChange: () => setSlugEdited(true) })}
        />
      </Field>
      <ProfileFields register={register} errors={errors} serverErrors={serverErrors} />
      <Button type="submit" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
