"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useAuthErrorText } from "./use-auth-error";

export function InvitationActions({
  invitationId,
  orgSlug,
}: {
  invitationId: string;
  orgSlug: string;
}) {
  const t = useTranslations("auth.invitation");
  const authErrorText = useAuthErrorText();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [declined, setDeclined] = useState(false);

  async function respond(accept: boolean) {
    setPending(true);
    setError(undefined);
    const result = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId });
    setPending(false);
    if (result.error) {
      setError(authErrorText(result.error.code));
      return;
    }
    if (accept) {
      router.replace(`/dashboard/${orgSlug}`);
      router.refresh();
    } else {
      setDeclined(true);
    }
  }

  if (declined) return <Alert>{t("declined")}</Alert>;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex gap-3">
        <Button disabled={pending} onClick={() => respond(true)}>
          {t("accept")}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => respond(false)}>
          {t("decline")}
        </Button>
      </div>
    </div>
  );
}
