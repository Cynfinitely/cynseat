"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { ActionFailure } from "@/app/_lib/action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ticketTypeSchema } from "@/domain/events/schemas";
import { useRouter } from "@/i18n/navigation";
import { createTicketTypeAction, removeTicketTypeAction, updateTicketTypeAction } from "./actions";
import { useActionForm } from "./use-action-form";

export type TicketTypeValues = {
  name: string;
  description: string;
  price: string;
  capacity: string;
  salesStartAt: string;
  salesEndAt: string;
  maxPerOrder: string;
};

export type TicketTypeView = {
  id: string;
  /** Price already formatted for the reader. */
  priceLabel: string;
  sold: number;
  values: TicketTypeValues;
};

type Props = {
  orgSlug: string;
  eventId: string;
  currency: string;
  ticketTypes: TicketTypeView[];
  disabled: boolean;
};

const blank: TicketTypeValues = {
  name: "",
  description: "",
  price: "",
  capacity: "",
  salesStartAt: "",
  salesEndAt: "",
  maxPerOrder: "",
};

export function TicketTypesManager({ orgSlug, eventId, currency, ticketTypes, disabled }: Props) {
  const t = useTranslations("events.tickets");
  const router = useRouter();
  const removal = useActionForm();
  const [editing, setEditing] = useState<string>();

  return (
    <div className="space-y-8">
      <p className="text-muted text-sm">{t("intro")}</p>
      {removal.formError ? <Alert tone="danger">{removal.formError}</Alert> : null}

      {ticketTypes.length === 0 ? (
        <p className="text-muted text-sm">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {ticketTypes.map((type) => (
            <li key={type.id}>
              <Card className="p-5">
                {editing === type.id ? (
                  <TicketTypeForm
                    title={t("editTitle", { name: type.values.name })}
                    currency={currency}
                    initial={type.values}
                    submitLabel={t("save")}
                    onCancel={() => setEditing(undefined)}
                    onSubmit={(values) => updateTicketTypeAction(orgSlug, eventId, type.id, values)}
                    onDone={() => {
                      setEditing(undefined);
                      router.refresh();
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-ink font-semibold">{type.values.name}</p>
                      <p className="text-muted text-sm">
                        {type.priceLabel}
                        {" · "}
                        {t("sold", { sold: type.sold, capacity: type.values.capacity })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={disabled}
                        onClick={() => setEditing(type.id)}
                      >
                        {t("edit")}
                        <span className="sr-only"> {type.values.name}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={disabled}
                        onClick={async () => {
                          if (!window.confirm(t("removeConfirm", { name: type.values.name })))
                            return;
                          await removal.submit(() =>
                            removeTicketTypeAction(orgSlug, eventId, type.id),
                          );
                          router.refresh();
                        }}
                      >
                        {t("remove")}
                        <span className="sr-only"> {type.values.name}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {disabled ? null : (
        <TicketTypeForm
          // Remount after each add so the form starts empty again.
          key={ticketTypes.length}
          title={t("addTitle")}
          currency={currency}
          initial={blank}
          submitLabel={t("add")}
          onSubmit={(values) => createTicketTypeAction(orgSlug, eventId, values)}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}

function TicketTypeForm({
  title,
  currency,
  initial,
  submitLabel,
  onSubmit,
  onDone,
  onCancel,
}: {
  title: string;
  currency: string;
  initial: TicketTypeValues;
  submitLabel: string;
  onSubmit(values: TicketTypeValues): Promise<{ ok: true } | ActionFailure>;
  onDone(): void;
  onCancel?: () => void;
}) {
  const t = useTranslations("events.tickets");
  const tCommon = useTranslations("common");
  const form = useActionForm();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TicketTypeValues, unknown, TicketTypeValues>({
    resolver: zodResolver(ticketTypeSchema) as never,
    defaultValues: initial,
  });
  // Ids are prefixed so several of these forms can be on the page at once.
  const prefix = `tt-${initial.name ? initial.name.replace(/\W+/g, "-") : "new"}`;
  const error = (name: keyof TicketTypeValues) => form.fieldError(name, errors[name]?.message);
  const optional = tCommon("optional");

  const submit = handleSubmit(async (values) => {
    const done = await form.submit(async () => {
      const outcome = await onSubmit(values);
      return outcome.ok ? { ok: true as const, data: true } : outcome;
    });
    if (done) onDone();
  });

  return (
    <section aria-label={title} className="max-w-xl">
      <h2 className="text-ink text-lg font-semibold">{title}</h2>
      <form onSubmit={submit} noValidate className="mt-3 space-y-4">
        {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}
        <Field id={`${prefix}-name`} label={t("name")} hint={t("nameHint")} error={error("name")}>
          <Input
            {...controlProps(`${prefix}-name`, { error: error("name"), hint: t("nameHint") })}
            {...register("name")}
          />
        </Field>
        <Field
          id={`${prefix}-description`}
          label={t("description")}
          optional={optional}
          error={error("description")}
        >
          <Input
            {...controlProps(`${prefix}-description`, { error: error("description") })}
            {...register("description")}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${prefix}-price`}
            label={t("price", { currency: currency.toUpperCase() })}
            hint={t("priceHint")}
            error={error("price")}
          >
            <Input
              inputMode="decimal"
              {...controlProps(`${prefix}-price`, { error: error("price"), hint: t("priceHint") })}
              {...register("price")}
            />
          </Field>
          <Field id={`${prefix}-capacity`} label={t("capacity")} error={error("capacity")}>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              {...controlProps(`${prefix}-capacity`, { error: error("capacity") })}
              {...register("capacity")}
            />
          </Field>
          <Field
            id={`${prefix}-salesStartAt`}
            label={t("salesStartAt")}
            optional={optional}
            hint={t("salesHint")}
            error={error("salesStartAt")}
          >
            <Input
              type="datetime-local"
              {...controlProps(`${prefix}-salesStartAt`, {
                error: error("salesStartAt"),
                hint: t("salesHint"),
              })}
              {...register("salesStartAt")}
            />
          </Field>
          <Field
            id={`${prefix}-salesEndAt`}
            label={t("salesEndAt")}
            optional={optional}
            error={error("salesEndAt")}
          >
            <Input
              type="datetime-local"
              {...controlProps(`${prefix}-salesEndAt`, { error: error("salesEndAt") })}
              {...register("salesEndAt")}
            />
          </Field>
          <Field
            id={`${prefix}-maxPerOrder`}
            label={t("maxPerOrder")}
            optional={optional}
            error={error("maxPerOrder")}
          >
            <Input
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              {...controlProps(`${prefix}-maxPerOrder`, { error: error("maxPerOrder") })}
              {...register("maxPerOrder")}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
