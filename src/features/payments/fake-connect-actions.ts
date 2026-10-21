"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getFakeGateway } from "@/server";

/** Finishes the stand-in onboarding form. Does nothing outside test mode. */
export async function completeFakeOnboardingAction(
  accountId: string,
  returnUrl: string,
): Promise<void> {
  const gateway = getFakeGateway();
  if (!gateway?.accounts.has(accountId)) redirect("/");
  gateway.setAccount(accountId, { chargesEnabled: true, detailsSubmitted: true });
  // Only ever back to this site.
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  redirect(returnUrl.startsWith(`${base}/`) ? returnUrl : "/");
}
