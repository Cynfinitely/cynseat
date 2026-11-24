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
      className="border-line bg-surface overflow-x-auto rounded-lg border px-2 py-1.5"
    >
      <ul className="flex gap-1 text-sm font-medium">
        {items.map((item) => {
          // The first item is the section's root and matches exactly; the rest also match
          // the pages beneath them.
          const active =
            pathname === item.href || (item !== items[0] && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 whitespace-nowrap",
                  active
                    ? "bg-brand-100 text-brand-700"
                    : "text-muted hover:text-ink hover:bg-surface-muted",
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
