// pages/cancel.tsx

import Link from "next/link";

export default function CancelPage() {
  return (
    <div>
      <h1>Your purchase was cancelled.</h1>
      <Link href="/tickets">Go back to tickets.</Link>
    </div>
  );
}
