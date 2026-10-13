import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 hover:bg-brand-700 text-white",
        secondary: "border-brand-600 text-brand-700 hover:bg-brand-50 border bg-white",
        ghost: "text-muted hover:text-ink font-medium hover:bg-gray-100",
        danger: "bg-danger text-white hover:bg-red-800",
      },
      size: {
        sm: "px-3 py-1.5",
        md: "px-4 py-2.5",
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
