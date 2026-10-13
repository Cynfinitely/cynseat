"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Textarea } from "@/components/ui/field";
import type { ReviewDecision } from "@/domain/orgs/schemas";
import { useErrorText } from "@/lib/use-error-text";
import type { ApprovalStatus } from "@/domain/orgs/status";
import { reviewOrganizationAction } from "./actions";

// Which decisions make sense from each status, and how each button is styled and labelled.
const decisionsFor: Record<
  ApprovalStatus,
  { decision: ReviewDecision; label: "approve" | "reject" | "suspend" | "reinstate" }[]
> = {
  pending: [
    { decision: "approve", label: "approve" },
    { decision: "reject", label: "reject" },
  ],
  approved: [{ decision: "suspend", label: "suspend" }],
  rejected: [{ decision: "approve", label: "approve" }],
  suspended: [{ decision: "approve", label: "reinstate" }],
};

export function ReviewForm({
  organizationId,
  organizationName,
  status,
}: {
  organizationId: string;
  organizationName: string;
  status: ApprovalStatus;
}) {
  const t = useTranslations("admin.orgs");
  const errorText = useErrorText();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const noteId = `note-${organizationId}`;

  async function decide(decision: ReviewDecision) {
    setPending(true);
    setError(undefined);
    const result = await reviewOrganizationAction({ organizationId, decision, note });
    setPending(false);
    if (!result.ok) setError(errorText(result.fields.note ?? result.reason));
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id={noteId} label={t("note")} hint={t("noteHint")}>
        <Textarea
          {...controlProps(noteId, { hint: t("noteHint") })}
          className="min-h-16"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        {decisionsFor[status].map(({ decision, label }) => (
          <Button
            key={decision}
            size="sm"
            variant={decision === "approve" ? "primary" : "danger"}
            disabled={pending}
            onClick={() => decide(decision)}
          >
            {t(label)}
            <span className="sr-only"> {organizationName}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
