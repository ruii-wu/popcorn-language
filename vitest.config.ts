import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Integration tests share one SQLite dev.db file; SQLite is single-writer, so running test
  // files in parallel causes lock contention and flaky timeouts under write-heavy flows
  // (e.g. the scenario e2e). Serialize files to keep the suite deterministic.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], fileParallelism: false },
});
