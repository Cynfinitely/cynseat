"use client";

import { Check, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { controlProps, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { publishProblems, type EventStatus, type PublishProblem } from "@/domain/events/types";
import { Link, useRouter } from "@/i18n/navigation";
import {
  cancelEventAction,
  deleteDraftEventAction,
  publishEventAction,
  unpublishEventAction,
} from "./actions";
import { useActionForm } from "./use-action-form";

type Props = {
  orgSlug: string;
  eventId: string;
  eventSlug: string;
  status: EventStatus;
  problems: PublishProblem[];
  canPublish: boolean;
  canManage: boolean;
  /** False once the event has been public, when it can no longer simply be deleted. */
  deletable: boolean;
};

export function PublishPanel(props: Props) {
  const { orgSlug, eventId, status, problems } = props;
  const t = useTranslations("events.publish");
  const router = useRouter();
  const form = useActionForm();
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  async function run(action: () => ReturnType<typeof publishEventAction>, after?: () => void) {
    setPending(true);
    const done = await form.submit(async () => {
      const outcome = await action();
      return outcome.ok ? { ok: true as const, data: true } : outcome;
    });
    setPending(false);
    if (!done) return;
    if (after) after();
    else router.refresh();
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-ink font-semibold">{t("title")}</h2>
      {form.formError ? <Alert tone="danger">{form.formError}</Alert> : null}

      {status === "cancelled" ? <p className="text-sm">{t("cancelled")}</p> : null}

      {status === "draft" ? (
        <>
          <div>
            <p className="text-sm font-medium">
              {problems.length === 0 ? t("ready") : t("checklist")}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {publishProblems.map((problem) => {
                const done = !problems.includes(problem);
                return (
                  <li key={problem} className="flex items-start gap-2">
                    {done ? (
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-green-700" />
                    ) : (
                      <Circle aria-hidden className="text-muted mt-0.5 size-4 shrink-0" />
                    )}
                    <span className={done ? "text-muted" : "text-ink font-medium"}>
                      {t(problem)}
                      <span className="sr-only"> ({done ? t("done") : t("todo")})</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {props.canPublish ? (
            <Button
              disabled={pending || problems.length > 0}
              onClick={() => run(() => publishEventAction(orgSlug, eventId))}
            >
              {t("publish")}
            </Button>
          ) : (
            <p className="text-muted text-sm">{t("adminOnly")}</p>
          )}
          {props.canManage && props.deletable ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("deleteConfirm"))) return;
                void run(
                  () => deleteDraftEventAction(orgSlug, eventId),
                  () => router.push(`/dashboard/${orgSlug}/events`),
                );
              }}
            >
              {t("delete")}
            </Button>
          ) : null}
        </>
      ) : null}

      {status !== "draft" ? (
        <Link
          href={`/o/${orgSlug}/e/${props.eventSlug}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {t("view")}
        </Link>
      ) : null}

      {status === "published" ? (
        <>
          <p className="text-sm">{t("live")}</p>
          {props.canPublish ? (
            <div className="border-line space-y-3 border-t pt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => unpublishEventAction(orgSlug, eventId))}
              >
                {t("unpublish")}
              </Button>
              <Field id="cancel-reason" label={t("cancelReason")}>
                <Input
                  {...controlProps("cancel-reason", {})}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t("cancelConfirm"))) return;
                  void run(() => cancelEventAction(orgSlug, eventId, { reason }));
                }}
              >
                {t("cancel")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
