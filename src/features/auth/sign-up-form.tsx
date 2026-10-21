"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUpSchema, type SignUpInput } from "@/domain/auth/schemas";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "@/lib/use-error-text";
import { useAuthErrorText } from "./use-auth-error";

export function SignUpForm({ returnUrl }: { returnUrl: string }) {
  const t = useTranslations("auth.signUp");
  const locale = useLocale();
  const errorText = useErrorText();
  const authErrorText = useAuthErrorText();
  const [formError, setFormError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const { error } = await authClient.signUp.email({
      ...values,
      // Where the confirmation link lands once the address is verified.
      callbackURL: `/${locale}${returnUrl}`,
    });
    if (error) {
      setFormError(authErrorText(error.code));
      return;
    }
    setSentTo(values.email);
  });

  if (sentTo) {
    return (
      <Alert tone="success" title={t("checkEmailTitle")}>
        {t("checkEmailBody", { email: sentTo })}
      </Alert>
    );
  }

  const nameError = errorText(errors.name?.message);
  const emailError = errorText(errors.email?.message);
  const passwordError = errorText(errors.password?.message);
  const passwordHint = t("passwordHint");

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="name" label={t("name")} error={nameError}>
        <Input
          autoComplete="name"
          {...controlProps("name", { error: nameError })}
          {...register("name")}
        />
      </Field>
      <Field id="email" label={t("email")} error={emailError}>
        <Input
          type="email"
          autoComplete="email"
          {...controlProps("email", { error: emailError })}
          {...register("email")}
        />
      </Field>
      <Field id="password" label={t("password")} hint={passwordHint} error={passwordError}>
        <Input
          type="password"
          autoComplete="new-password"
          {...controlProps("password", { error: passwordError, hint: passwordHint })}
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
