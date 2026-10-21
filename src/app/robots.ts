import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Private or personal pages; order links in particular must never be indexed.
      disallow: [
        "/api/",
        "/*/dashboard",
        "/*/admin",
        "/*/account",
        "/*/checkout",
        "/*/orders",
        "/*/dev",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
