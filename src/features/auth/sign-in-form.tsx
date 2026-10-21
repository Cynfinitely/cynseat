"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signInSchema, type SignInInput } from "@/domain/auth/schemas";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "@/lib/use-error-text";
import { useAuthErrorText } from "./use-auth-error";

export function SignInForm({ returnUrl }: { returnUrl: string }) {
  const t = useTranslations("auth.signIn");
  const errorText = useErrorText();
  const authErrorText = useAuthErrorText();
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setFormError(authErrorText(error.code));
      return;
    }
    router.replace(returnUrl);
    router.refresh();
  });

  const emailError = errorText(errors.email?.message);
  const passwordError = errorText(errors.password?.message);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <Field id="email" label={t("email")} error={emailError}>
        <Input
          type="email"
          autoComplete="email"
          {...controlProps("email", { error: emailError })}
          {...register("email")}
        />
      </Field>
      <Field id="password" label={t("password")} error={passwordError}>
        <Input
          type="password"
          autoComplete="current-password"
          {...controlProps("password", { error: passwordError })}
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {t("submit")}
      </Button>
      <p className="text-sm">
        <Link href="/forgot-password" className="text-brand-700 font-medium underline">
          {t("forgot")}
        </Link>
      </p>
    </form>
  );
}
