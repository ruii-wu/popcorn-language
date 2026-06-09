import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The web/ Vite app has its own vitest run (npm --prefix web run test).
// Keep the root backend suite from collecting web/ test files.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Integration tests share one SQLite dev.db file; SQLite is single-writer, so running test
  // files in parallel causes lock contention and flaky timeouts under write-heavy flows
  // (e.g. the scenario e2e). Serialize files to keep the suite deterministic.
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'web/**'],
    fileParallelism: false,
    // @popcorn/shared exports TS source; inline it so vitest transforms it.
    server: { deps: { inline: [/@popcorn\/shared/] } },
  },
});
