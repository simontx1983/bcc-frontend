import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for the bcc-frontend test harness.
 *
 * - jsdom environment so component tests (React Testing Library) work.
 * - `@/…` alias mirrors tsconfig paths so tests import the same way the app does.
 * - setup file registers @testing-library/jest-dom matchers.
 * - only `*.test.ts(x)` / `*.spec.ts(x)` under src/ are collected.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
