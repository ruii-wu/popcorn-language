// tests/unit/memory-eval-dataset.test.ts
import { describe, it, expect } from 'vitest';
import { getDataset, DATASETS, DEFAULT_DATASET_ID, REPORT_DATASET_ID } from '@/server/memory/eval/dataset';
import { fixtureEmbed } from '@/server/memory/eval/fixtureEmbed';

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

  it('the report dataset is a substantially larger controlled benchmark', () => {
    const ds = getDataset(REPORT_DATASET_ID);
    expect(ds.corpus).toHaveLength(64);
    expect(ds.probes).toHaveLength(24);
    expect(ds.corpus.filter((c) => c.key.startsWith('distractor-'))).toHaveLength(32);
    expect(ds.probes.some((p) => p.relevantKeys.length > 1)).toBe(true);
  });

  it('maps every labeled report item to the same deterministic topic as its probe', async () => {
    const ds = getDataset(REPORT_DATASET_ID);
    const byKey = new Map(ds.corpus.map((item) => [item.key, item]));
    for (const probe of ds.probes) {
      const queryVector = await fixtureEmbed(probe.queryText);
      for (const key of probe.relevantKeys) {
        const item = byKey.get(key)!;
        const text = item.kind === 'fact' ? item.value : item.summary;
        expect(await fixtureEmbed(text)).toEqual(queryVector);
      }
    }
  });
});
