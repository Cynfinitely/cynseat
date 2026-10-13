import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false } };

// No sign-in check here on purpose: a layout cannot know which page was asked for, so each
// page (and the organization layout) redirects with its own return address, and every
// use-case authorizes its caller anyway.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>;
}
