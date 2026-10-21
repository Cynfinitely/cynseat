import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireUserOrRedirect } from "@/app/_lib/session";
import { AdminNav } from "@/features/admin/admin-nav";

export const metadata: Metadata = { robots: { index: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireUserOrRedirect("/admin/organizations");
  // Everyone else gets the ordinary not-found page; the use-cases authorize again.
  if (!actor.isPlatformAdmin) notFound();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <AdminNav />
      {children}
    </div>
  );
}
