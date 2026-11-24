import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const controlClass =
  "text-ink focus:border-brand-500 bg-surface placeholder:text-muted w-full rounded-md border border-[#989486] px-3 py-2.5 transition-colors aria-invalid:border-red-600";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, className)} {...props} />;
}
