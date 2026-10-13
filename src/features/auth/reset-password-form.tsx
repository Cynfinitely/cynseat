"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resetPasswordSchema, type ResetPasswordInput } from "@/domain/auth/schemas";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "@/lib/use-error-text";
import { useAuthErrorText } from "./use-auth-error";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const errorText = useErrorText();
  const authErrorText = useAuthErrorText();
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(undefined);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFormError(authErrorText(error.code));
      return;
    }
    setDone(true);
  });

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success" title={t("reset.doneTitle")}>
          {t("reset.doneBody")}
        </Alert>
        <Link href="/sign-in" className={buttonVariants({ className: "w-full" })}>
          {t("signIn.submit")}
        </Link>
      </div>
    );
  }

  const passwordError = errorText(errors.password?.message);
  const hint = t("signUp.passwordHint");

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="password" label={t("reset.password")} hint={hint} error={passwordError}>
        <Input
          type="password"
          autoComplete="new-password"
          {...controlProps("password", { error: passwordError, hint })}
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("reset.submit")}
      </Button>
    </form>
  );
}
