import type { BrowserOptions, ErrorEvent } from "@sentry/nextjs";
import { env } from "@/lib/env";
import { scrubUrl } from "@/lib/scrub-url";

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  return event;
}

/** Settings shared by the server, edge and browser. Reporting is off without a DSN. */
export const sentryOptions = {
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Errors only: performance tracing would use up the free quota and is not needed.
  tracesSampleRate: 0,
  // Nothing about the visitor or the request: these can hold emails, sessions and tokens.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    stackFrameVariables: false,
  },
  beforeSend: scrubEvent,
  beforeBreadcrumb(breadcrumb) {
    const data = breadcrumb.data;
    if (data && typeof data.url === "string") data.url = scrubUrl(data.url);
    if (data && typeof data.from === "string") data.from = scrubUrl(data.from);
    if (data && typeof data.to === "string") data.to = scrubUrl(data.to);
    return breadcrumb;
  },
} satisfies BrowserOptions;
