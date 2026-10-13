"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { Button, buttonVariants } from "./ui/button";

/** Client-side so that public pages stay cacheable: the session is read in the browser. */
export function AccountMenu() {
  const t = useTranslations("common.nav");
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div className="h-8 w-20" aria-hidden />;

  if (!session) {
    return (
      <Link href="/sign-in" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        {t("signIn")}
      </Link>
    );
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <nav aria-label={t("account")} className="flex items-center gap-1">
      <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {t("dashboard")}
      </Link>
      <Button variant="ghost" size="sm" onClick={signOut}>
        {t("signOut")}
      </Button>
    </nav>
  );
}
