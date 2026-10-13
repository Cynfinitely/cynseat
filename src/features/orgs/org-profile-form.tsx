"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ActionFailure } from "@/app/_lib/action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updateOrgProfileSchema } from "@/domain/orgs/schemas";
import { useErrorText } from "@/lib/use-error-text";
import { updateOrgProfileAction } from "./actions";
import { ProfileFields, type ProfileFormValues } from "./profile-fields";

export function OrgProfileForm({
  orgSlug,
  initial,
}: {
  orgSlug: string;
  initial: ProfileFormValues;
}) {
  const t = useTranslations("dashboard.settings");
  const errorText = useErrorText();
  const [failure, setFailure] = useState<ActionFailure>();
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues, unknown, ProfileFormValues>({
    resolver: zodResolver(updateOrgProfileSchema) as never,
    defaultValues: initial,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(undefined);
    setSaved(false);
    const result = await updateOrgProfileAction(orgSlug, values);
    if (result.ok) setSaved(true);
    else setFailure(result);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {saved ? <Alert tone="success">{t("saved")}</Alert> : null}
      {failure && Object.keys(failure.fields).length === 0 ? (
        <Alert tone="danger">{errorText(failure.reason)}</Alert>
      ) : null}
      <ProfileFields register={register} errors={errors} serverErrors={failure?.fields ?? {}} />
      <Button type="submit" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
