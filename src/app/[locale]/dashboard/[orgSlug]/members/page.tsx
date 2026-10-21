import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { pageResult, requireOrgContext } from "@/app/_lib/session";
import { MembersManager } from "@/features/orgs/members-manager";
import { getApp } from "@/server";
import { can } from "@/server/authz/permissions";
import { listMembers } from "@/server/modules/orgs/service";

type Props = { params: Promise<{ orgSlug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.members");
  return { title: t("title") };
}

export default async function MembersPage({ params }: Props) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const { members, invitations } = await pageResult(`/dashboard/${orgSlug}/members`, () =>
    listMembers(getApp(), ctx),
  );
  const t = await getTranslations("dashboard.members");

  return (
    <>
      <h1 className="text-ink mb-4 text-xl font-semibold">{t("title")}</h1>
      <MembersManager
        organizationId={ctx.organization.id}
        currentUserId={ctx.actor.userId}
        canManage={can(ctx.role, "org.members.manage")}
        members={members.map(({ memberId, userId, name, email, role }) => ({
          memberId,
          userId,
          name,
          email,
          role,
        }))}
        invitations={invitations.map((invitation) => ({
          ...invitation,
          expiresAt: invitation.expiresAt.toISOString(),
        }))}
      />
    </>
  );
}
