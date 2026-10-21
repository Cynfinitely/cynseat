import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale routing only. This is not a security boundary: every use-case authorizes itself.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
