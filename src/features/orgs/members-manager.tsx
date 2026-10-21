"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlProps, Field, Select } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { inviteMemberSchema, type InviteMemberInput } from "@/domain/auth/schemas";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { useErrorText } from "@/lib/use-error-text";
import { orgRoles, type OrgRole } from "@/server/auth/roles";

type Member = { memberId: string; userId: string; name: string; email: string; role: OrgRole };
type Invitation = { id: string; email: string; role: OrgRole; expiresAt: string };

type Props = {
  organizationId: string;
  currentUserId: string;
  canManage: boolean;
  members: Member[];
  invitations: Invitation[];
};

export function MembersManager({
  organizationId,
  currentUserId,
  canManage,
  members,
  invitations,
}: Props) {
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("common.roles");
  const tErrors = useTranslations("common.errors");
  const format = useFormatter();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const adminCount = members.filter((member) => member.role === "admin").length;

  /** Runs a membership change, then reloads the server-rendered lists. */
  async function change(run: () => Promise<{ error: unknown }>, done?: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    const result = await run();
    setBusy(false);
    if (result.error) {
      setError(tErrors("generic"));
      return false;
    }
    if (done) setNotice(done);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-10">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="border-line overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-muted text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("name")}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("email")}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t("role")}
              </th>
              {canManage ? (
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t("actions")}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const isLastAdmin = member.role === "admin" && adminCount === 1;
              return (
                <tr key={member.memberId}>
                  <td className="text-ink px-4 py-3 font-medium">
                    {member.name}
                    {isSelf ? <span className="text-muted font-normal"> ({t("you")})</span> : null}
                  </td>
                  <td className="px-4 py-3">{member.email}</td>
                  <td className="px-4 py-3">
                    {canManage && !isLastAdmin ? (
                      <Select
                        aria-label={t("roleFor", { name: member.name })}
                        className="w-auto py-1.5"
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          change(() =>
                            authClient.organization.updateMemberRole({
                              organizationId,
                              memberId: member.memberId,
                              role: event.target.value as OrgRole,
                            }),
                          )
                        }
                      >
                        {orgRoles.map((role) => (
                          <option key={role} value={role}>
                            {tRoles(role)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      tRoles(member.role)
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3 text-right">
                      {isLastAdmin ? (
                        <span className="text-muted text-xs">{t("lastAdmin")}</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(t("removeConfirm", { name: member.name }))) return;
                            void change(() =>
                              authClient.organization.removeMember({
                                organizationId,
                                memberIdOrEmail: member.memberId,
                              }),
                            );
                          }}
                        >
                          {t("remove")}
                          <span className="sr-only"> {member.name}</span>
                        </Button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invitations.length > 0 ? (
        <section aria-labelledby="pending-invitations">
          <h2 id="pending-invitations" className="text-ink text-lg font-semibold">
            {t("pendingTitle")}
          </h2>
          <ul className="border-line divide-line mt-3 divide-y rounded-xl border text-sm">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span>
                  <span className="text-ink font-medium">{invitation.email}</span>
                  <span className="text-muted">
                    {" · "}
                    {tRoles(invitation.role)}
                    {" · "}
                    {t("expires", {
                      date: format.dateTime(new Date(invitation.expiresAt), {
                        dateStyle: "medium",
                      }),
                    })}
                  </span>
                </span>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      change(() =>
                        authClient.organization.cancelInvitation({ invitationId: invitation.id }),
                      )
                    }
                  >
                    {t("cancel")}
                    <span className="sr-only"> {invitation.email}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <InviteForm
          busy={busy}
          onInvite={(values) =>
            change(
              () => authClient.organization.inviteMember({ organizationId, ...values }),
              t("inviteSent", { email: values.email }),
            )
          }
        />
      ) : null}
    </div>
  );
}

function InviteForm({
  busy,
  onInvite,
}: {
  busy: boolean;
  onInvite(values: InviteMemberInput): Promise<boolean>;
}) {
  const t = useTranslations("dashboard.members");
  const tRoles = useTranslations("common.roles");
  const errorText = useErrorText();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { email: "", role: "member" },
  });
  const emailError = errorText(errors.email?.message);
  const roleHelp = {
    admin: t("roleHelpAdmin"),
    member: t("roleHelpMember"),
    door_staff: t("roleHelpDoorStaff"),
  }[useWatch({ control, name: "role" })];

  return (
    <section aria-labelledby="invite-title" className="max-w-xl">
      <h2 id="invite-title" className="text-ink text-lg font-semibold">
        {t("inviteTitle")}
      </h2>
      <form
        noValidate
        className="mt-3 space-y-4"
        onSubmit={handleSubmit(async (values) => {
          if (await onInvite(values)) reset();
        })}
      >
        <Field id="invite-email" label={t("inviteEmail")} error={emailError}>
          <Input
            type="email"
            {...controlProps("invite-email", { error: emailError })}
            {...register("email")}
          />
        </Field>
        <Field id="invite-role" label={t("inviteRole")} hint={roleHelp}>
          <Select {...controlProps("invite-role", { hint: roleHelp })} {...register("role")}>
            {orgRoles.map((role) => (
              <option key={role} value={role}>
                {tRoles(role)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={busy}>
          {t("inviteSubmit")}
        </Button>
      </form>
    </section>
  );
}
