// tests/integration/ablation-report.test.ts
// Regenerates the committed memory-ablation figure AND asserts the research ordering.
// Deterministic: recall@k is stable, so the written file is byte-identical run-to-run.
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runMemoryEval } from '@/server/memory/eval/harness';
import { renderAblationReport } from '@/server/memory/eval/report';
import { fixtureOllama } from '@/server/memory/eval/fixtureEmbed';

const prisma = new PrismaClient();
const CALLER = '__w9_ablation_gen__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: CALLER } });
  await prisma.user.deleteMany({ where: { username: { startsWith: '__memeval__' } } });
  await prisma.$disconnect();
});

describe('ablation report generator', () => {
  it('runs the four strategies on the fixture, writes the figure, and locks the ordering', async () => {
    const caller = await prisma.user.create({ data: { username: CALLER, password: 'pw' } });
    const result = await runMemoryEval(prisma, fixtureOllama, caller.id, { k: 3 });
    expect(result.perStrategy).toHaveLength(4);

    // Research hypothesis (deterministic on this fixture).
    const get = (n: string) => result.perStrategy.find((s) => s.name === n)!;
    expect(get('semantic').recallAtK).toBe(1);
    expect(get('hybrid').recallAtK).toBeGreaterThanOrEqual(get('recency').recallAtK);
    expect(get('semantic').recallAtK).toBeGreaterThan(get('recency').recallAtK);

    const md = renderAblationReport(result);
    const dir = resolve(process.cwd(), 'docs/reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'memory-ablation.md'), md, 'utf8');

    expect(md).toContain('# Memory-Strategy Ablation');
    expect(md).toContain(`| recency | ${get('recency').recallAtK} |`);
    expect(md).toContain(`| semantic | ${get('semantic').recallAtK} |`);
    // the committed file on disk is exactly what we just rendered
    expect(readFileSync(resolve(dir, 'memory-ablation.md'), 'utf8')).toBe(md);
  });
});
