import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/server/**", "src/lib/**"],
      exclude: ["**/*.test.ts", "**/*.itest.ts", "src/server/db/migrations/**"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.itest.ts", "tests/integration/**/*.itest.ts"],
          globalSetup: ["./tests/integration/global-setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
