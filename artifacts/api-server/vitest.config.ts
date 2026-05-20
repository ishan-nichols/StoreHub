import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include:     ["src/__tests__/**/*.test.ts"],
    globals:     false,
    // Alias workspace packages so imports resolve without building
    alias: {
      "@workspace/db":     new URL("../../lib/db/src/index.ts", import.meta.url).pathname,
      "@workspace/api-zod": new URL("../../lib/api-zod/src/index.ts", import.meta.url).pathname,
    },
  },
});
