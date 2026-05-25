// src/server/memory/getStrategy.ts
import type { MemoryStrategy, StrategyDeps } from './types';
import { RecencyStrategy } from './strategies/recency';
import { SummaryStrategy } from './strategies/summary';
import { SemanticStrategy } from './strategies/semantic';
import { HybridStrategy } from './strategies/hybrid';

export function getMemoryStrategy(name: string, deps: StrategyDeps): MemoryStrategy {
  switch (name) {
    case 'recency':
      return new RecencyStrategy(deps);
    case 'summary':
      return new SummaryStrategy(deps);
    case 'semantic':
      return new SemanticStrategy(deps);
    case 'hybrid':
    default:
      return new HybridStrategy(deps);
  }
}
