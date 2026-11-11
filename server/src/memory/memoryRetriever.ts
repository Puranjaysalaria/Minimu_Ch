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
    if (/bookmark|saved?\s*(?:link|source|url|website)|web\s*source/i.test(lower)) {
      const bookmarkedMems = this.memoryRepo.getBySubjectAndPredicate('user', 'bookmarked_source');
      candidates.push(...bookmarkedMems);
    }
    // Specifications, GPU, CPU, RAM, and hardware requirements
    if (/spec|gpu|rtx|gtx|graphics|processor|cpu|intel|ryzen|ram|storage|ssd|display|screen|feature|hardware/i.test(lower)) {
      const specMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'gpu_specs');
      const procMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'processor');
      const genSpecMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'specs');
      const ramMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'ram');
      const storageMems = this.memoryRepo.getBySubjectAndPredicate('laptop', 'storage');
      candidates.push(...specMems, ...procMems, ...genSpecMems, ...ramMems, ...storageMems);
    }
    // Location, work, personal profile & lifestyle intents
    if (/live|location|city|based\s+in/i.test(lower)) {
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'location'));
    }
    if (/company|work|job|profession|role/i.test(lower)) {
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'profession'));
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'company'));
    }
    if (/birthday|anniversary|exam|deadline|date/i.test(lower)) {
      const allActive = this.memoryRepo.getAll({ onlyActive: true, limit: 20 });
      candidates.push(...allActive.filter(m => m.predicate.endsWith('_date')));
    }
    if (/pet|dog|cat/i.test(lower)) {
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'pet'));
    }
    if (/travel|trip|vacation|visit/i.test(lower)) {
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'travel_plan'));
    }
    if (/tech|language|code|stack|programming/i.test(lower)) {
      candidates.push(...this.memoryRepo.getBySubjectAndPredicate('user', 'tech_stack'));
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

      for (let i = 0; i < scoredMemories.length; i++) {
        const mem = scoredMemories[i].memory;
        const status = mem.valid_until ? `Superseded on ${mem.valid_until}` : 'Current / Active';
        contextString += `- Memory #${i + 1} [${mem.category.toUpperCase()}]:\n`;
        contextString += `  Subject: ${mem.subject}\n`;
        contextString += `  Predicate: ${mem.predicate.replace(/_/g, ' ')}\n`;
        contextString += `  Value: ${mem.value}\n`;
        contextString += `  Category: ${mem.category}\n`;
        contextString += `  Recorded Date: ${mem.recorded_at} [Status: ${status}]\n`;
        if (mem.supersedes_id) {
          contextString += `  Note: Supersedes an earlier recorded value\n`;
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
