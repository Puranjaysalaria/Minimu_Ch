import { MemoryRecord, MemoryRepository } from '../database/repositories/memoryRepo.js';
import { MessageRepository } from '../database/repositories/messageRepo.js';
import { EntityRepository } from '../database/repositories/entityRepo.js';
import { TemporalResolver, TemporalResolution } from './temporalResolver.js';
import { MemoryRanker, ScoredMemory } from './memoryRanker.js';

export interface RetrievalResult {
  temporal: TemporalResolution;
  scoredMemories: ScoredMemory[];
  contextString: string;
  hasRelevantMemory: boolean;
}

export class MemoryRetriever {
  private ranker = new MemoryRanker();

  constructor(
    private memoryRepo: MemoryRepository,
    private messageRepo: MessageRepository,
    private entityRepo: EntityRepository,
    private temporalResolver: TemporalResolver
  ) {}

  retrieve(query: string, referenceDate?: string): RetrievalResult {
    // 1. Resolve temporal expressions
    const temporal = this.temporalResolver.resolve(query, referenceDate);

    const candidates: MemoryRecord[] = [];

    // 2. FTS5 Search on memories
    const ftsMemories = this.memoryRepo.searchFTS(query, 20);
    candidates.push(...ftsMemories);

    // 3. Time range query if temporal constraint identified
    if (temporal.isTemporal && temporal.startDate && temporal.endDate) {
      const timeRangeMemories = this.memoryRepo.getMemoriesInTimeRange(
        temporal.startDate,
        temporal.endDate
      );
      candidates.push(...timeRangeMemories);
    }

    // 4. Intent-specific structured lookups
    const lower = query.toLowerCase();
    if (/brand|prefer|laptop/i.test(lower)) {
      const brandMems = this.memoryRepo.getBySubjectAndPredicate('user', 'preferred_laptop_brand');
      candidates.push(...brandMems);
    }
    if (/budget|price|cost|amount/i.test(lower)) {
      const budgetMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'budget');
      const subMems = this.memoryRepo.getBySubjectAndPredicate('subscription', 'price_per_month');
      candidates.push(...budgetMems, ...subMems);
    }
    if (/subscription/i.test(lower)) {
      const subMems = this.memoryRepo.getBySubjectAndPredicate('subscription', 'price_per_month');
      candidates.push(...subMems);
    }
    // Broad recall for user needs, plans, preferences, or general memory inquiry
    if (
      /need|requirement|plan|prefer|discussed|told you|what do you know|remember|conservations|conversations|everything|about me|history/i.test(
        lower
      ) ||
      candidates.length === 0
    ) {
      const activeMems = this.memoryRepo.getAll({ onlyActive: true, limit: 10 });
      candidates.push(...activeMems);
    }

    // 5. Rank and filter top candidates
    const scoredMemories = this.ranker.rank(candidates, query, temporal, 6);

    // 6. Build structured context string for Gemini
    const hasRelevantMemory = scoredMemories.length > 0;
    let contextString = '';

    if (hasRelevantMemory) {
      contextString += `=== RETRIEVED CONVERSATIONAL MEMORIES (IMMUTABLE AUDIT LOG) ===\n`;
      if (temporal.isTemporal && temporal.description) {
        contextString += `Temporal Filter: ${temporal.description}\n`;
      }

      for (const item of scoredMemories) {
        const mem = item.memory;
        const status = mem.valid_until ? `Superseded on ${mem.valid_until}` : 'Current / Active';
        contextString += `- Fact ID: ${mem.id}\n`;
        contextString += `  Subject: ${mem.subject}\n`;
        contextString += `  Predicate: ${mem.predicate}\n`;
        contextString += `  Value: ${mem.value}\n`;
        contextString += `  Category: ${mem.category}\n`;
        contextString += `  Source Type: ${mem.source_type} (Confidence: ${mem.confidence})\n`;
        contextString += `  Recorded Date: ${mem.recorded_at} [Status: ${status}]\n`;
        if (mem.source_conversation_id) {
          contextString += `  Source Conversation: ${mem.source_conversation_id}\n`;
        }
        if (mem.supersedes_id) {
          contextString += `  Supersedes Earlier Fact ID: ${mem.supersedes_id}\n`;
        }
        contextString += `\n`;
      }
      contextString += `=== END RETRIEVED MEMORIES ===\n`;
    } else {
      contextString += `=== RETRIEVED CONVERSATIONAL MEMORIES ===\n`;
      contextString += `No relevant historical memories found in database.\n`;
      contextString += `=== END RETRIEVED MEMORIES ===\n`;
    }

    return {
      temporal,
      scoredMemories,
      contextString,
      hasRelevantMemory,
    };
  }
}
