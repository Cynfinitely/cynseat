"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function OrgNav({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className="border-line -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-6 text-sm font-medium">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px block border-b-2 py-3 whitespace-nowrap",
                  active
                    ? "border-brand-600 text-brand-700"
                    : "text-muted hover:text-ink border-transparent",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
