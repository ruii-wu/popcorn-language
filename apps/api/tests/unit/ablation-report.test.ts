// tests/unit/ablation-report.test.ts
import { describe, it, expect } from 'vitest';
import { renderAblationReport } from '@/server/memory/eval/report';
import type { MemoryEvalResult } from '@/server/memory/eval/harness';

const fake: MemoryEvalResult = {
  datasetId: 'default',
  k: 3,
  perStrategy: [
    { name: 'recency', recallAtK: 0.125, latencyMs: 0, tokenCost: 5 },
    { name: 'summary', recallAtK: 0.625, latencyMs: 0, tokenCost: 7 },
    { name: 'semantic', recallAtK: 1, latencyMs: 1, tokenCost: 6 },
    { name: 'hybrid', recallAtK: 1, latencyMs: 0, tokenCost: 6 },
  ],
};

describe('renderAblationReport', () => {
  it('renders a deterministic recall@k table + interpretation + live-run command', () => {
    const md = renderAblationReport(fake);
    expect(md).toContain('# Memory-Strategy Ablation');
    expect(md).toContain('recall@3');
    // one row per strategy, recall@k value present
    expect(md).toContain('| recency | 0.125 |');
    expect(md).toContain('| summary | 0.625 |');
    expect(md).toContain('| semantic | 1 |');
    expect(md).toContain('| hybrid | 1 |');
    // live-run command for real latency/token cost
    expect(md).toContain('/api/dev/memory-eval');
    expect(md).toContain(':3100');
    // latency/token columns are NOT in the committed table (non-deterministic for the fixture)
    expect(md).not.toContain('Latency (ms)');
    expect(md).not.toContain('Token cost');
  });

  it('is byte-identical across calls (deterministic)', () => {
    expect(renderAblationReport(fake)).toBe(renderAblationReport(fake));
  });
});
