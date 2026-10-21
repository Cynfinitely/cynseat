import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry";

export function register(): void {
  Sentry.init(sentryOptions);
}

// Errors thrown while rendering pages, in route handlers and in server actions.
export const onRequestError = Sentry.captureRequestError;
