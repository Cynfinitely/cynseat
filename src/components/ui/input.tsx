import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "text-ink focus:border-brand-500 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 transition-colors placeholder:text-gray-400 aria-invalid:border-red-600",
        className,
      )}
      {...props}
    />
  );
}
