// Vitest global setup — runs once per worker before any test file.
// Keep this minimal; per-suite state lives in beforeEach / beforeAll of each file.

// Silence noisy "expected" logs from modules under test.
const origError = console.error;
console.error = (...args: unknown[]) => {
  const first = args[0];
  if (typeof first === 'string' && first.includes('[OllamaError:')) return;
  origError(...args);
};
