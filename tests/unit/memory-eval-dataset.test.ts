// tests/unit/memory-eval-dataset.test.ts
import { describe, it, expect } from 'vitest';
import { getDataset, DATASETS, DEFAULT_DATASET_ID } from '@/server/memory/eval/dataset';

describe('eval dataset', () => {
  it('getDataset returns the default dataset when id is omitted or unknown', () => {
    expect(getDataset().id).toBe(DEFAULT_DATASET_ID);
    expect(getDataset('nope').id).toBe(DEFAULT_DATASET_ID);
    expect(getDataset(DEFAULT_DATASET_ID).id).toBe(DEFAULT_DATASET_ID);
  });

  it('every dataset has unique corpus keys and probes that only reference existing keys', () => {
    for (const ds of Object.values(DATASETS)) {
      const keys = ds.corpus.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length); // unique keys
      expect(ds.probes.length).toBeGreaterThan(0);
      for (const probe of ds.probes) {
        expect(probe.relevantKeys.length).toBeGreaterThan(0);
        for (const rk of probe.relevantKeys) {
          expect(keys).toContain(rk);
        }
      }
    }
  });

  it('the default dataset has a defaultK and both fact and summary corpus items', () => {
    const ds = getDataset();
    expect(ds.defaultK).toBeGreaterThan(0);
    expect(ds.corpus.some((c) => c.kind === 'fact')).toBe(true);
    expect(ds.corpus.some((c) => c.kind === 'summary')).toBe(true);
  });
});
