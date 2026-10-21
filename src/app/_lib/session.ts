import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import { getApp } from "@/server";
import type { Actor, UserActor } from "@/server/authz/actor";
import { AppError } from "@/server/errors";
import { getOrgContext, type OrgContext } from "@/server/modules/orgs/service";

/** Who is making this request. Resolved once per request. */
export const getActor = cache(async (): Promise<Actor> => getApp().resolveActor(await headers()));

/** The signed-in user, or a redirect to sign-in that comes back to `returnUrl`. */
export async function requireUserOrRedirect(returnUrl: string): Promise<UserActor> {
  const actor = await getActor();
  if (actor.kind === "user") return actor;
  return redirect({
    href: { pathname: "/sign-in", query: { returnUrl } },
    locale: await getLocale(),
  });
}

/** Turns a use-case's expected failures into the matching page outcome. */
export async function pageResult<T>(returnUrl: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) {
      if (error.code === "UNAUTHENTICATED") {
        return redirect({
          href: { pathname: "/sign-in", query: { returnUrl } },
          locale: await getLocale(),
        });
      }
      // Forbidden is shown as not found: do not confirm that something exists.
      if (error.code === "NOT_FOUND" || error.code === "FORBIDDEN") notFound();
    }
    throw error;
  }
}

/** The organization in the URL, if the signed-in user belongs to it; a 404 page otherwise. */
export const requireOrgContext = cache(async (orgSlug: string): Promise<OrgContext> => {
  const returnUrl = `/dashboard/${orgSlug}`;
  return pageResult(returnUrl, async () => getOrgContext(getApp().db, await getActor(), orgSlug));
});
