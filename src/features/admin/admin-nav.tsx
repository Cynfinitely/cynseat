import { useTranslations } from "next-intl";
import { OrgNav } from "@/features/orgs/org-nav";

export function AdminNav() {
  const t = useTranslations("admin.nav");
  return (
    <div className="mb-6">
      <OrgNav
        label={t("label")}
        items={[
          { href: "/admin/organizations", label: t("organizations") },
          { href: "/admin/venues", label: t("venues") },
          { href: "/admin/audit", label: t("audit") },
        ]}
      />
    </div>
  );
}
