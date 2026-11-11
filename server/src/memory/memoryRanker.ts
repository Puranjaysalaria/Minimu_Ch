import { MemoryRecord } from '../database/repositories/memoryRepo.js';
import { TemporalResolution } from './temporalResolver.js';

export interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
  matchReasons: string[];
}

export class MemoryRanker {
  rank(
    candidates: MemoryRecord[],
    query: string,
    temporal: TemporalResolution,
    limit = 5
  ): ScoredMemory[] {
    const scored: ScoredMemory[] = [];
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\W+/).filter(t => t.length > 2);

    const seenIds = new Set<string>();

    for (const mem of candidates) {
      if (seenIds.has(mem.id)) continue;
      seenIds.add(mem.id);

      let score = 0;
      const matchReasons: string[] = [];

      // 1. Text overlap with subject and predicate
      const subjectTokens = mem.subject.toLowerCase().split(/\W+/);
      const predicateTokens = mem.predicate.toLowerCase().split(/\W+/);
      const valueTokens = mem.value.toLowerCase().split(/\W+/);

      let tokenMatches = 0;
      for (const token of queryTokens) {
        if (subjectTokens.includes(token)) {
          score += 15;
          tokenMatches++;
          matchReasons.push(`Subject matches '${token}'`);
        }
        if (predicateTokens.includes(token)) {
          score += 20;
          tokenMatches++;
          matchReasons.push(`Predicate matches '${token}'`);
        }
        if (valueTokens.includes(token)) {
          score += 10;
          tokenMatches++;
          matchReasons.push(`Value matches '${token}'`);
        }
      }

      // 2. High relevance semantic intent keywords
      if (/brand|prefer|like/i.test(queryLower) && /brand|prefer/i.test(mem.predicate)) {
        score += 30;
        matchReasons.push('Intent: brand preference');
      }
      if (/budget|cost|price|amount|fee/i.test(queryLower) && /budget|price|cost/i.test(mem.predicate)) {
        score += 30;
        matchReasons.push('Intent: price/budget inquiry');
      }
      if (/subscription/i.test(queryLower) && /subscription/i.test(mem.subject)) {
        score += 25;
        matchReasons.push('Intent: subscription subject');
      }
      if (/laptop/i.test(queryLower) && (/laptop/i.test(mem.subject) || /laptop/i.test(mem.predicate))) {
        score += 25;
        matchReasons.push('Intent: laptop product');
      }

      // 3. Temporal relevance
      if (temporal.isTemporal) {
        const memValidFrom = new Date(mem.valid_from).getTime();
        const memRecorded = new Date(mem.recorded_at).getTime();

        if (temporal.startDate && temporal.endDate) {
          const rangeStart = new Date(temporal.startDate).getTime();
          const rangeEnd = new Date(temporal.endDate).getTime();

          const isInRange =
            (memRecorded >= rangeStart && memRecorded <= rangeEnd) ||
            (memValidFrom >= rangeStart && memValidFrom <= rangeEnd);

          if (isInRange) {
            score += 40;
            matchReasons.push(`Within requested timeframe (${temporal.term})`);
          } else if (temporal.term === 'previously') {
            // "previously" should favor any past recorded fact
            if (memRecorded <= rangeEnd) {
              score += 20;
              matchReasons.push('Valid in previous history');
            }
          } else {
            // Penalize facts outside specific time range if user asked for a specific time like "yesterday"
            score -= 15;
          }
        }
      } else {
        // When no temporal filter is specified, active records (valid_until IS NULL) get a slight recency boost
        if (!mem.valid_until) {
          score += 10;
          matchReasons.push('Active current fact');
        }
      }

      // 4. Confidence weighting
      score = score * (mem.confidence || 1.0);

      if (score > 0) {
        scored.push({
          memory: mem,
          score,
          matchReasons,
        });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }
}
