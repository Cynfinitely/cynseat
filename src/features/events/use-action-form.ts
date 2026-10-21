"use client";

import { useState } from "react";
import type { ActionFailure, ActionResult } from "@/app/_lib/action";
import { useErrorText } from "@/lib/use-error-text";

/**
 * State shared by the dashboard forms: runs a server action, keeps its failure, and gives
 * each field its translated message (client-side validation first, then the server's).
 */
export function useActionForm() {
  const errorText = useErrorText();
  const [failure, setFailure] = useState<ActionFailure>();
  const [saved, setSaved] = useState(false);

  async function submit<T>(run: () => Promise<ActionResult<T>>): Promise<T | undefined> {
    setFailure(undefined);
    setSaved(false);
    const result = await run();
    if (!result.ok) {
      setFailure(result);
      return undefined;
    }
    setSaved(true);
    return result.data;
  }

  const fieldCount = failure ? Object.keys(failure.fields).length : 0;

  return {
    submit,
    saved,
    /** Message for the whole form, when the failure is not about a particular field. */
    formError: failure && fieldCount === 0 ? errorText(failure.reason) : undefined,
    fieldError: (name: string, clientMessage?: string) =>
      errorText(clientMessage ?? failure?.fields[name]),
  };
}
