"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { checkoutSchema } from "@/domain/orders/schemas";
import { useRouter } from "@/i18n/navigation";
import { useErrorText } from "@/lib/use-error-text";
import { cancelCheckoutAction, setCartAction, startCheckoutAction } from "./actions";
import { useCheckoutErrorText } from "./use-checkout-error";

type Values = { email: string; name: string };

export function CheckoutForm({
  eventId,
  eventPath,
  submitLabel,
  paying,
  defaults,
}: {
  eventId: string;
  /** Where "change tickets" goes back to. */
  eventPath: string;
  submitLabel: string;
  /** True when a payment page is already open for this cart. */
  paying: boolean;
  defaults: Values;
}) {
  const t = useTranslations("checkout.page");
  const locale = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const checkoutErrorText = useCheckoutErrorText();
  const [formError, setFormError] = useState<string>();
  const [leaving, setLeaving] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(checkoutSchema.pick({ email: true, name: true })),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await startCheckoutAction({ ...values, eventId, locale });
    if (!result.ok) {
      setFormError(checkoutErrorText(result));
      router.refresh();
      return;
    }
    // The payment page is on another site, so this is a full navigation.
    setLeaving(true);
    window.location.assign(result.data.url);
  });

  async function change() {
    setLeaving(true);
    // Give the tickets back first; otherwise the buyer's own reservation would make the
    // event look sold out to them when they return to choose again.
    if (paying) await cancelCheckoutAction(eventId);
    else await setCartAction({ eventId, lines: [] });
    router.push(eventPath);
  }

  const emailError = errorText(errors.email?.message);
  const nameError = errorText(errors.name?.message);
  const busy = isSubmitting || leaving;

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
      <Field id="email" label={t("email")} hint={t("emailHint")} error={emailError}>
        <Input
          type="email"
          autoComplete="email"
          {...controlProps("email", { error: emailError, hint: t("emailHint") })}
          {...register("email")}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={change}>
          {t("change")}
        </Button>
      </div>
    </form>
  );
}
