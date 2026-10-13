"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useErrorText } from "@/lib/use-error-text";
import { sendOrderLinksAction } from "./actions";

const schema = z.object({ email: z.email("invalid_email").max(254, "too_long") });

export function FindTicketsForm() {
  const t = useTranslations("account.find");
  const errorText = useErrorText();
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const [formError, setFormError] = useState<string>();

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(undefined);
    const result = await sendOrderLinksAction({ email });
    // The only failure shown is asking too often; whether orders exist is never revealed.
    if (!result.ok) return setFormError(errorText(result.reason));
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
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
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
