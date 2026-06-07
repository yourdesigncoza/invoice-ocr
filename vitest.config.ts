import { defineConfig } from "vitest/config";

export default defineConfig({
  // resolve `@/*` from tsconfig paths natively (no plugin needed)
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
