"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/domain/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "@/lib/use-error-text";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgot");
  const locale = useLocale();
  const errorText = useErrorText();
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    await authClient.requestPasswordReset({ email, redirectTo: `/${locale}/reset-password` });
    // Same answer whether or not the account exists.
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <Alert tone="success" title={t("sentTitle")}>
        {t("sentBody", { email: sentTo })}
      </Alert>
    );
  }

  const emailError = errorText(errors.email?.message);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field id="email" label={t("email")} error={emailError}>
        <Input
          type="email"
          autoComplete="email"
          {...controlProps("email", { error: emailError })}
          {...register("email")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
