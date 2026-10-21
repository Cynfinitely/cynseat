import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Text shown after the label for optional fields, e.g. "optional". */
  optional?: string;
  children: ReactNode;
  className?: string;
};

/** Label, control, hint and error, wired together for assistive technology. */
export function Field({ id, label, hint, error, optional, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-ink block text-sm font-medium">
        {label}
        {optional ? <span className="text-muted font-normal"> ({optional})</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-muted text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Attributes that connect a control to its `Field`. */
export function controlProps(id: string, state: { hint?: string; error?: string }) {
  const describedBy = [state.error ? `${id}-error` : null, state.hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    "aria-invalid": state.error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
}

const controlClass =
  "text-ink focus:border-brand-500 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 transition-colors placeholder:text-gray-400 aria-invalid:border-red-600";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(controlClass, "min-h-24", className)} {...props} />;
}
