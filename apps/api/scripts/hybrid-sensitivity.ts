import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { OllamaClient } from '../src/server/llm/ollama';
import { cosineSimilarity } from '../src/server/memory/cosine';
import { hybridScore } from '../src/server/memory/strategies/hybrid';
import { selectStratifiedInstances, toEvalDataset, type LongMemEvalInstance } from '../src/server/memory/eval/longMemEval';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cacheDir = resolve(root, '.cache/eval');
const outDir = resolve(root, 'docs/reports/data');
const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const model = 'nomic-embed-text';
const k = 5;
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const configs = [
  { id: 'recency', alpha: 0, hours: 72 },
  ...[0.5, 0.7, 0.9].flatMap((alpha) => [24, 72, 168, 720].map((hours) => ({ id: `a${alpha}-h${hours}`, alpha, hours }))),
  { id: 'semantic', alpha: 1, hours: 72 },
];
const baseline = 'a0.7-h72';
interface CandidateScore {
  key: string; order: number; ageHours: number; semantic: number; relevant: boolean;
}
interface Ranking {
  config: string; recallAt5: number; reciprocalRankAt5: number;
  top: (CandidateScore & { score: number })[];
}
interface MemoryCase {
  id: string; type: string; question: string; queryTime: string; candidateCount: number;
  futureCandidateCount: number; relevant: CandidateScore[]; rankings: Ranking[];
  clampedRankings: (Omit<Ranking, 'top'> & { keys: string[] })[];
}

async function main() {
  const data = await readFile(resolve(cacheDir, 'longmemeval_s_cleaned.json'));
  const dataSha256 = sha(data);
  const instances = selectStratifiedInstances(JSON.parse(data.toString()) as LongMemEvalInstance[], 60);
  assert.equal(instances.length, 60);
  const datasets = instances.map((instance) => toEvalDataset(instance, k));
  const needed = new Map<string, string>();
  for (const dataset of datasets) {
    for (const item of dataset.corpus) {
      assert.equal(item.kind, 'summary');
      const text = item.summary;
      needed.set(sha(text), text);
    }
  }
  const vectors = new Map<string, number[]>();
  let legacyModel = '';
  const cacheHash = createHash('sha256');
  const lines = createInterface({ input: createReadStream(resolve(cacheDir, 'longmemeval-embeddings.jsonl')), crlfDelay: Infinity });
  for await (const line of lines) {
    cacheHash.update(`${line}\n`);
    const [key, value] = JSON.parse(line) as [string, string | number[]];
    if (key === '__meta__') legacyModel = value as string;
    else if (needed.has(key)) vectors.set(key, value as number[]);
  }
  assert.equal(legacyModel.replace(/:latest$/, ''), model);
  assert.equal(vectors.size, needed.size, 'Candidate cache incomplete; run the existing LongMemEval harness first');
  for (const vector of vectors.values()) {
    assert.equal(vector.length, 768);
    assert(vector.every(Number.isFinite) && vector.some((value) => value !== 0));
  }
  console.log(`Loaded ${vectors.size} cached candidate vectors for 60 questions.`);

  const tagsResponse = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
  assert(tagsResponse.ok);
  const tags = await tagsResponse.json() as { models: { name: string; digest: string }[] };
  const installed = tags.models.find((tag) => tag.name.replace(/:latest$/, '') === model);
  assert(installed, 'nomic-embed-text must be installed');
  const versionResponse = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(10000) });
  assert(versionResponse.ok);
  const version = await versionResponse.json();
  const ollama = new OllamaClient({ baseUrl });
  const embed = async (text: string) => {
    const vector = await ollama.embed(text, { model });
    assert.equal(vector.length, 768);
    assert(vector.every(Number.isFinite) && vector.some((value) => value !== 0));
    return vector;
  };

  // Legacy candidate caches have a model name but no digest. Re-embedding a
  // deterministic sample checks compatibility, not the provenance of every row.
  const keys = [...needed.keys()];
  const validation = [];
  for (let i = 0; i < 6; i++) {
    const key = keys[Math.floor(i * (keys.length - 1) / 5)];
    const similarity = cosineSimilarity(await embed(needed.get(key)!), vectors.get(key)!);
    validation.push({ hash: key, cosine: similarity });
    assert(similarity > 0.999, 'Legacy candidate cache does not match the installed embedder');
  }
  const queryPath = resolve(cacheDir, `sensitivity-queries-${installed.digest}.json`);
  let queryVectors: Record<string, number[]> = {};
  try {
    const cached = JSON.parse(await readFile(queryPath, 'utf8'));
    assert.equal(cached.digest, installed.digest);
    queryVectors = cached.vectors;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const cases: MemoryCase[] = [];
  for (let i = 0; i < datasets.length; i++) {
    const dataset = datasets[i];
    const instance = instances[i];
    assert(dataset.evaluationTime, 'Question timestamp required; no wall-clock fallback');
    const queryKey = sha(instance.question);
    const qv = queryVectors[queryKey] ?? await embed(instance.question);
    assert.equal(qv.length, 768);
    assert(qv.every(Number.isFinite) && qv.some((value) => value !== 0));
    queryVectors[queryKey] = qv;
    const relevant = new Set(dataset.probes[0].relevantKeys);
    const candidates = dataset.corpus.map((item, order) => {
      assert(item.createdAt, 'Candidate timestamp required');
      const ageHours = (Date.parse(dataset.evaluationTime!) - Date.parse(item.createdAt)) / 3.6e6;
      assert(Number.isFinite(ageHours), 'Invalid candidate date');
      const text = item.kind === 'summary' ? item.summary : item.value;
      return { key: item.key, order, ageHours, semantic: cosineSimilarity(qv, vectors.get(sha(text))!), relevant: relevant.has(item.key) };
    });
    const rank = (config: typeof configs[number], clampFuture: boolean) => {
      const ranked = candidates.map((candidate) => ({ ...candidate,
        // Pure recency uses timestamp ordering to avoid exponential underflow ties.
        score: config.alpha === 0 ? -candidate.ageHours : hybridScore(candidate.semantic, clampFuture ? Math.max(0, candidate.ageHours) : candidate.ageHours, {
          semanticWeight: config.alpha, recencyWeight: Number((1 - config.alpha).toFixed(1)), halfLifeHours: config.hours,
        }),
      })).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, k);
      const firstHit = ranked.findIndex((item) => item.relevant);
      return { config: config.id, recallAt5: ranked.filter((item) => item.relevant).length / relevant.size,
        reciprocalRankAt5: firstHit < 0 ? 0 : 1 / (firstHit + 1), top: ranked };
    };
    const rankings = configs.map((config) => rank(config, false));
    const clampedRankings = configs.map((config) => {
      const { top, ...metrics } = rank(config, true);
      return { ...metrics, keys: top.map((item) => item.key) };
    });
    cases.push({ id: instance.question_id, type: instance.question_type, question: instance.question,
      queryTime: dataset.evaluationTime, candidateCount: candidates.length,
      futureCandidateCount: candidates.filter((candidate) => candidate.ageHours < 0).length,
      relevant: candidates.filter((candidate) => candidate.relevant), rankings, clampedRankings });
    await writeFile(queryPath, JSON.stringify({ digest: installed.digest, vectors: queryVectors }));
    console.log(`Scored ${i + 1}/60: ${instance.question_type}`);
  }
  const getRecall = (item: MemoryCase, id: string) => item.rankings.find((rank) => rank.config === id)!.recallAt5;
  const results = configs.map((config) => ({ ...config,
    recallAt5: mean(cases.map((item) => getRecall(item, config.id))),
    clampedRecallAt5: mean(cases.map((item) => item.clampedRankings.find((rank) => rank.config === config.id)!.recallAt5)),
    noFutureQuestionSubset: {
      n: cases.filter((item) => item.futureCandidateCount === 0).length,
      recallAt5: mean(cases.filter((item) => item.futureCandidateCount === 0).map((item) => getRecall(item, config.id))),
    },
    reciprocalRankAt5: mean(cases.map((item) => item.rankings.find((rank) => rank.config === config.id)!.reciprocalRankAt5)),
    improvedVsDefault: cases.filter((item) => getRecall(item, config.id) > getRecall(item, baseline)).length,
    worseVsDefault: cases.filter((item) => getRecall(item, config.id) < getRecall(item, baseline)).length,
    improvedVsSemantic: cases.filter((item) => getRecall(item, config.id) > getRecall(item, 'semantic')).length,
    worseVsSemantic: cases.filter((item) => getRecall(item, config.id) < getRecall(item, 'semantic')).length,
    byType: Object.fromEntries([...new Set(cases.map((item) => item.type))].map((type) => {
      const subset = cases.filter((item) => item.type === type);
      return [type, { n: subset.length, recallAt5: mean(subset.map((item) => getRecall(item, config.id))) }];
    })),
  }));
  const report = { method: 'Exploratory parameter sensitivity; same 60 stratified questions as earlier evaluation, not held out.',
    source: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned',
    k, baseline, datasetSha256: dataSha256, candidateCacheSha256: cacheHash.digest('hex'),
    embeddingModel: installed, ollama: version, node: process.version,
    cacheCaveat: 'Legacy cache records model name only. Six sampled vectors were re-embedded for compatibility; full historical provenance is unavailable.',
    validation, futureDatePolicy: 'Main results preserve production negative ages. Separate clamp-to-zero control, and subset excluding entire questions with future candidates.',
    tieBreak: 'Original adapter candidate order; recency endpoint sorts age directly.',
    metrics: 'Macro-average chunk recall@5 and truncated reciprocal rank@5. Not answer accuracy or end-to-end latency.', results, cases };
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'hybrid-sensitivity.json'), JSON.stringify(report, null, 2));
  const table = results.map((r) => `| ${r.id} | ${r.recallAt5.toFixed(4)} | ${r.clampedRecallAt5.toFixed(4)} | ${r.reciprocalRankAt5.toFixed(4)} | ${r.improvedVsDefault} | ${r.worseVsDefault} |`).join('\n');
  const selected = results.filter((result) => [baseline, 'a0.9-h72', 'semantic'].includes(result.id));
  const types = Object.keys(results[0].byType);
  const byTypeTable = types.map((type) => `| ${type} | ${selected.map((r) => r.byType[type].recallAt5.toFixed(4)).join(' | ')} |`).join('\n');
  const anomalous = cases.filter((item) => item.futureCandidateCount > 0);
  await writeFile(resolve(outDir, 'hybrid-sensitivity.md'), `# Hybrid Parameter Sensitivity\n\n${report.method}\n\n` +
    `All configurations share candidate chunks, embeddings, query timestamps, k=5 and stable tie-breaking. Raw cosine is not rescaled. Each of six question types has 10 questions.\n\n` +
    `| Configuration | Recall@5 | Clamp future ages: Recall@5 | MRR@5 | Better than default (questions) | Worse than default |\n|---|---:|---:|---:|---:|---:|\n${table}\n\n` +
    `The default is a0.7-h72. Endpoints are pure recency and semantic ranking; half-life is irrelevant to them. Intermediate rows scan semantic weight and half-life (hours).\n\n` +
    `| Question type (10 each) | Default | a0.9-h72 | Semantic |\n|---|---:|---:|---:|\n${byTypeTable}\n\n` +
    `${anomalous.length}/60 questions contain sessions dated after the question; ${anomalous.filter((item) => item.relevant.some((candidate) => candidate.ageHours < 0)).length} also have labelled evidence in those sessions. Main results preserve these inputs and production negative-age behavior. The clamp control bounds the decay term at 1; it does not remove future information. Pure recency keeps timestamp ordering in both controls. A separate no-future-question subset (${60 - anomalous.length} questions) is reported in JSON. Neither control repairs the dataset or establishes temporal causality.\n\n` +
    `This scan cannot establish optimal weights or a held-out improvement. Recall measures retrieval of labelled chunks, not language-learning outcomes. No latency claim is made.\n\n${report.cacheCaveat}\n\n` +
    `Run: \`npm run eval:hybrid:sensitivity\`. Requires the existing LongMemEval-S dataset/candidate cache and Ollama nomic-embed-text. Query embeddings are cached by model digest. No database is accessed. Per-question rankings and provenance are in the companion JSON.\n`);
  console.log(JSON.stringify(results.map(({ byType, ...result }) => result), null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
