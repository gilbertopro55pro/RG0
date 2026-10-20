import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Automated tests (npm test): the pure logic in src/lib — money, billing, dates, scheduling,
// album rules — next to the code it checks, as *.test.ts. They run on every PR
// (.github/workflows/tests.yml) before anything reaches main.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
