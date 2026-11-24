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
  const [visible, setVisible] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const callbackURL = `/${locale}${returnUrl}`;
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
      // Where the confirmation link lands once the address is verified.
      callbackURL,
    });
    if (error) {
      setFormError(authErrorText(error.code));
      return;
    }
    setSentTo(values.email);
  });

  if (sentTo) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={t("checkEmailTitle")}>
          {t("checkEmailBody", { email: sentTo })}
        </Alert>
        {formError && <Alert tone="danger">{formError}</Alert>}
        {resent ? (
          <p role="status">{t("resent")}</p>
        ) : (
          <Button
            variant="secondary"
            disabled={resending}
            onClick={async () => {
              setResending(true);
              setFormError(undefined);
              try {
                const { error } = await authClient.sendVerificationEmail({
                  email: sentTo,
                  callbackURL,
                });
                if (error) setFormError(authErrorText(error.code));
                else setResent(true);
              } catch {
                setFormError(authErrorText(undefined));
              } finally {
                setResending(false);
              }
            }}
          >
            {t("resend")}
          </Button>
        )}
      </div>
    );
  }

  const nameError = errorText(errors.name?.message);
  const emailError = errorText(errors.email?.message);
  const passwordError = errorText(errors.password?.message);
  const confirmError = errorText(errors.confirmPassword?.message);
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
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          {...controlProps("password", { error: passwordError, hint: passwordHint })}
          {...register("password")}
        />
      </Field>
      <Field id="confirmPassword" label={t("confirmPassword")} error={confirmError}>
        <Input
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          {...controlProps("confirmPassword", { error: confirmError })}
          {...register("confirmPassword")}
        />
      </Field>
      <label className="text-body flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="accent-brand-600 size-4"
          checked={visible}
          onChange={(event) => setVisible(event.target.checked)}
        />
        {t("showPasswords")}
      </label>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
