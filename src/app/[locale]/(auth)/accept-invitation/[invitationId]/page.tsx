import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requireUserOrRedirect } from "@/app/_lib/session";
import { Alert } from "@/components/ui/alert";
import { InvitationActions } from "@/features/auth/invitation-actions";
import { getApp } from "@/server";
import { isOrgRole } from "@/server/auth/roles";

type Props = { params: Promise<{ invitationId: string }> };

export const metadata: Metadata = { robots: { index: false } };

export default async function AcceptInvitationPage({ params }: Props) {
  const { invitationId } = await params;
  const user = await requireUserOrRedirect(`/accept-invitation/${invitationId}`);
  const invitation = await getApp().findInvitation(await headers(), invitationId);
  const t = await getTranslations("auth.invitation");
  const tRoles = await getTranslations("common.roles");

  if (!invitation) {
    return (
      <Alert tone="warning" title={t("unavailableTitle")}>
        {t("unavailableBody", { email: user.email })}
      </Alert>
    );
  }

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">
        {t("title", { organization: invitation.organizationName })}
      </h1>
      <p className="text-muted mt-2 mb-8">
        {t("body", {
          inviter: invitation.inviterEmail,
          organization: invitation.organizationName,
          role: isOrgRole(invitation.role) ? tRoles(invitation.role) : invitation.role,
        })}
      </p>
      <InvitationActions invitationId={invitation.id} orgSlug={invitation.organizationSlug} />
    </>
  );
}
