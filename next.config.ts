import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Posters (up to 4 MB) are uploaded through a server action.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default withNextIntl(nextConfig);
