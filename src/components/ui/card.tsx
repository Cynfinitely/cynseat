import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-line bg-surface rounded-lg border shadow-[0_2px_8px_rgba(66,55,37,0.035)]",
        className,
      )}
      {...props}
    />
  );
}
