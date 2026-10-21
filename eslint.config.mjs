import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Layer boundaries: domain is pure, server knows nothing about Next.js,
// and only repositories talk to the database client.
const restrict = (patterns) => ["error", { patterns }];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/server/db/migrations/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": restrict([
        {
          group: [
            "@/server/*",
            "@/app/*",
            "@/features/*",
            "@/components/*",
            "next",
            "next/*",
            "react",
          ],
          message: "src/domain must stay pure: no I/O, framework or UI imports.",
        },
      ]),
    },
  },
  {
    files: ["src/server/**"],
    rules: {
      "no-restricted-imports": restrict([
        {
          group: [
            "@/app/*",
            "@/features/*",
            "@/components/*",
            "next",
            "next/*",
            "next-intl",
            "next-intl/*",
          ],
          message: "src/server must not depend on Next.js or UI code.",
        },
      ]),
    },
  },
  {
    files: ["src/app/**", "src/features/**", "src/components/**"],
    rules: {
      "no-restricted-imports": restrict([
        {
          group: ["@/server/db/*", "@/server/modules/*/repo"],
          message: "Call a use-case in src/server/modules/*/service instead of the database.",
        },
      ]),
    },
  },
]);
