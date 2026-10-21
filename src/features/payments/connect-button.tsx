"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorText } from "@/lib/use-error-text";
import { startPaymentOnboardingAction } from "./actions";

export function ConnectButton({ orgSlug, label }: { orgSlug: string; label: string }) {
  const errorText = useErrorText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function connect() {
    setPending(true);
    setError(undefined);
    const result = await startPaymentOnboardingAction(orgSlug);
    if (!result.ok) {
      setPending(false);
      setError(errorText(result.reason));
      return;
    }
    // Onboarding happens on the payment provider's site.
    window.location.assign(result.data.url);
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button disabled={pending} onClick={connect}>
        {label}
      </Button>
    </div>
  );
}
