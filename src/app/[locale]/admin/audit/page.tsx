import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { getActor, pageResult } from "@/app/_lib/session";
import { getApp } from "@/server";
import { listAuditLog } from "@/server/modules/audit/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

export default async function AuditLogPage() {
  const entries = await pageResult("/admin/audit", async () =>
    listAuditLog(getApp().db, await getActor()),
  );
  const t = await getTranslations("admin.audit");
  const format = await getFormatter();

  return (
    <>
      <h1 className="text-ink text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted mt-2 text-sm">{t("intro")}</p>
      {entries.length === 0 ? (
        <p className="text-muted mt-6">{t("empty")}</p>
      ) : (
        <div className="border-line mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-muted">
              <tr>
                {[t("when"), t("who"), t("action"), t("organization"), t("what")].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {format.dateTime(entry.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td className="px-4 py-2">{entry.actorEmail ?? t("system")}</td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.action}</td>
                  <td className="px-4 py-2">{entry.organizationName ?? "—"}</td>
                  <td className="text-muted px-4 py-2 font-mono text-xs">
                    {entry.entityType}:{entry.entityId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
