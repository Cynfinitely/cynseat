import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 hover:bg-brand-700 text-white",
        secondary: "border-brand-500 text-brand-700 hover:bg-brand-50 bg-surface border",
        ghost: "text-muted hover:text-ink font-medium hover:bg-surface-muted",
        danger: "bg-danger text-white hover:bg-red-800",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5",
        md: "min-h-11 px-5 py-2.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
