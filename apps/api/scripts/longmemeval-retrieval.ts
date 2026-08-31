import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { hostname, platform, release } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { OllamaClient } from '../src/server/llm/ollama';
import { runMemoryEval, type PerStrategyResult } from '../src/server/memory/eval/harness';
import {
  selectStratifiedInstances,
  toEvalDataset,
  type LongMemEvalInstance,
} from '../src/server/memory/eval/longMemEval';

const SOURCE_URL = 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CACHE_DIR = resolve(REPO_ROOT, '.cache/eval');
const DATA_PATH = resolve(CACHE_DIR, 'longmemeval_s_cleaned.json');
const EMBED_CACHE_PATH = resolve(CACHE_DIR, 'longmemeval-embeddings.jsonl');
const REPORT_DIR = resolve(REPO_ROOT, 'docs/reports/data');
const JSON_OUT = resolve(REPORT_DIR, 'longmemeval-s-retrieval.json');
const MD_OUT = resolve(REPORT_DIR, 'longmemeval-s-retrieval.md');

function numberArg(name: string, fallback: number): number {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1];
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`--${name} must be a positive integer`);
  return value;
}

async function downloadDataset(): Promise<void> {
  try {
    await access(DATA_PATH);
    return;
  } catch {
    // Continue to download.
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const temp = `${DATA_PATH}.part`;
  process.stdout.write(`Downloading LongMemEval-S to ${DATA_PATH}\n`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok || !response.body) throw new Error(`dataset download failed: HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) chunks.push(chunk);
  await writeFile(temp, Buffer.concat(chunks));
  await rename(temp, DATA_PATH);
}

interface EmbeddingCache {
  model: string;
  vectors: Map<string, number[]>;
}

async function loadEmbeddingCache(model: string): Promise<EmbeddingCache> {
  try {
    await access(EMBED_CACHE_PATH);
  } catch {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(EMBED_CACHE_PATH, `${JSON.stringify(['__meta__', model])}\n`, 'utf8');
    return { model, vectors: new Map() };
  }

  const vectors = new Map<string, number[]>();
  let cacheModel: string | undefined;
  const lines = createInterface({ input: createReadStream(EMBED_CACHE_PATH), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const [key, value] = JSON.parse(line) as [string, string | number[]];
    if (key === '__meta__') cacheModel = String(value);
    else vectors.set(key, value as number[]);
  }
  if (cacheModel !== model) {
    await writeFile(EMBED_CACHE_PATH, `${JSON.stringify(['__meta__', model])}\n`, 'utf8');
    return { model, vectors: new Map() };
  }
  return { model, vectors };
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1000) / 1000;
}

function markdown(result: BenchmarkResult): string {
  const rows = result.perStrategy
    .map((row) => `| ${row.name} | ${row.recallAtK.toFixed(3)} | ${row.latencyMs.toFixed(1)} | ${row.tokenCost.toFixed(1)} |`)
    .join('\n');
  const typeRows = result.recallByQuestionType
    .map((row) => `| ${row.questionType} | ${row.sampleSize} | ${row.recency.toFixed(3)} | ${row.summary.toFixed(3)} | ${row.semantic.toFixed(3)} | ${row.hybrid.toFixed(3)} |`)
    .join('\n');
  return `# LongMemEval-S Turn Retrieval\n\n` +
    `> External benchmark run over ${result.sampleSize} stratified, non-abstention questions from ` +
    `[LongMemEval-S](${SOURCE_URL}). Official answer-session IDs and has_answer turn labels are used for Recall@${result.k}.\n\n` +
    `| Strategy | Recall@${result.k} | Mean latency (ms) | Mean retrieved tokens |\n|---|---:|---:|---:|\n${rows}\n\n` +
    `| Question type | n | Recency | Summary | Semantic | Hybrid |\n|---|---:|---:|---:|---:|---:|\n${typeRows}\n\n` +
    `- Dataset: LongMemEval-S cleaned (${result.datasetQuestionCount} total questions before filtering)\n` +
    `- Dataset SHA-256: ${result.datasetSha256}\n` +
    `- Adapter: one source conversation turn = one Popcorn ConversationSummary candidate; turns over 2,000 characters are chunked\n` +
    `- Embedding model: ${result.embeddingModel} (${result.embeddingModelDigest})\n` +
    `- Git commit: ${result.gitCommit}${result.worktreeDirty ? ' + dirty worktree' : ''}\n` +
    `- Run time: ${result.runAt}\n` +
    `- Host: ${result.host}\n\n` +
    `This is a retrieval-only external validity check. It does not evaluate answer generation, ` +
    `memory extraction, or educational effectiveness.\n`;
}

interface BenchmarkCase {
  questionId: string;
  questionType: string;
  sessionCount: number;
  candidateCount: number;
  evidenceSessionCount: number;
  evidenceCandidateCount: number;
  perStrategy: PerStrategyResult[];
}

interface QuestionTypeResult {
  questionType: string;
  sampleSize: number;
  recency: number;
  summary: number;
  semantic: number;
  hybrid: number;
}

interface BenchmarkResult {
  benchmark: 'LongMemEval-S';
  sourceUrl: string;
  runAt: string;
  gitCommit: string;
  worktreeDirty: boolean;
  host: string;
  embeddingModel: string;
  embeddingModelDigest: string;
  datasetSha256: string;
  datasetQuestionCount: number;
  sampleSize: number;
  k: number;
  selection: string;
  perStrategy: PerStrategyResult[];
  recallByQuestionType: QuestionTypeResult[];
  cases: BenchmarkCase[];
}

async function main(): Promise<void> {
  const limit = numberArg('limit', 24);
  const k = numberArg('k', 5);
  const embeddingModel = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
  await downloadDataset();
  const datasetText = await readFile(DATA_PATH, 'utf8');
  const datasetSha256 = createHash('sha256').update(datasetText).digest('hex');
  const instances = JSON.parse(datasetText) as LongMemEvalInstance[];
  const selected = selectStratifiedInstances(instances, limit);
  if (selected.length === 0) throw new Error('no non-abstention LongMemEval cases selected');

  const ollama = new OllamaClient({ embedModel: embeddingModel, keepAlive: -1 });
  const cache = await loadEmbeddingCache(embeddingModel);
  const cachedOllama = {
    embed: async (text: string): Promise<number[]> => {
      const key = createHash('sha256').update(text).digest('hex');
      const cached = cache.vectors.get(key);
      if (cached) return cached;
      const vector = await ollama.embed(text);
      cache.vectors.set(key, vector);
      await appendFile(EMBED_CACHE_PATH, `${JSON.stringify([key, vector])}\n`, 'utf8');
      return vector;
    },
  };

  const prisma = new PrismaClient();
  const caller = await prisma.user.create({
    data: { username: `__longmemeval__${randomUUID()}`, password: 'x' },
  });
  const cases: BenchmarkCase[] = [];
  try {
    const lily = await prisma.npc.findUnique({ where: { id: 'lily' }, select: { id: true } });
    if (!lily) throw new Error('seeded NPC "lily" is required; run npm run db:seed first');
    for (let index = 0; index < selected.length; index++) {
      const instance = selected[index];
      process.stdout.write(`[${index + 1}/${selected.length}] ${instance.question_type} ${instance.question_id}\n`);
      const dataset = toEvalDataset(instance, k);
      const evaluation = await runMemoryEval(prisma, cachedOllama, caller.id, {
        dataset,
        k,
        writeLogs: false,
        recallOllama: ollama,
      });
      cases.push({
        questionId: instance.question_id,
        questionType: instance.question_type,
        sessionCount: instance.haystack_sessions.length,
        candidateCount: dataset.corpus.length,
        evidenceSessionCount: instance.answer_session_ids.length,
        evidenceCandidateCount: dataset.probes[0].relevantKeys.length,
        perStrategy: evaluation.perStrategy,
      });
    }
  } finally {
    await prisma.user.delete({ where: { id: caller.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  const names = ['recency', 'summary', 'semantic', 'hybrid'] as const;
  const perStrategy = names.map((name) => {
    const rows = cases.map((item) => item.perStrategy.find((row) => row.name === name)!);
    return {
      name,
      recallAtK: average(rows.map((row) => row.recallAtK)),
      latencyMs: average(rows.map((row) => row.latencyMs)),
      tokenCost: average(rows.map((row) => row.tokenCost)),
    };
  });
  const recallByQuestionType = [...new Set(cases.map((item) => item.questionType))].sort().map((questionType) => {
    const rows = cases.filter((item) => item.questionType === questionType);
    const recallFor = (name: typeof names[number]) => average(rows.map((item) =>
      item.perStrategy.find((strategy) => strategy.name === name)!.recallAtK));
    return {
      questionType,
      sampleSize: rows.length,
      recency: recallFor('recency'),
      summary: recallFor('summary'),
      semantic: recallFor('semantic'),
      hybrid: recallFor('hybrid'),
    };
  });
  const modelResponse = await fetch(`${process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}/api/tags`);
  const modelData = modelResponse.ok
    ? await modelResponse.json() as { models?: Array<{ name: string; digest?: string }> }
    : {};
  const modelMatch = modelData.models?.find((model) =>
    model.name === embeddingModel || model.name.startsWith(`${embeddingModel}:`) || embeddingModel.startsWith(`${model.name}:`));
  const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const worktreeDirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  const result: BenchmarkResult = {
    benchmark: 'LongMemEval-S',
    sourceUrl: SOURCE_URL,
    runAt: new Date().toISOString(),
    gitCommit,
    worktreeDirty,
    host: `${hostname()} / ${platform()} ${release()} / Node ${process.version}`,
    embeddingModel,
    embeddingModelDigest: modelMatch?.digest ?? 'unknown',
    datasetSha256,
    datasetQuestionCount: instances.length,
    sampleSize: cases.length,
    k,
    selection: 'Deterministic round-robin across question_type after excluding abstention cases; question_id ascending.',
    perStrategy,
    recallByQuestionType,
    cases,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(JSON_OUT, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(MD_OUT, markdown(result), 'utf8');
  process.stdout.write(`${markdown(result)}\nRaw results: ${JSON_OUT}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
