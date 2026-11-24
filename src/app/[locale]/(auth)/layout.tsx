import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="border-line bg-surface mx-auto my-8 w-[calc(100%_-_2rem)] max-w-md rounded-lg border px-6 py-8 sm:my-16 sm:p-10">
      {children}
    </div>
  );
}
