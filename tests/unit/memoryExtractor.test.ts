import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase, IDatabase } from '../../server/src/database/connection.js';
import { runMigrations } from '../../server/src/database/migrations/migrator.js';
import { MemoryRepository } from '../../server/src/database/repositories/memoryRepo.js';
import { MemoryExtractor } from '../../server/src/memory/memoryExtractor.js';

describe('MemoryExtractor', () => {
  let db: IDatabase;
  let memoryRepo: MemoryRepository;
  let extractor: MemoryExtractor;

  beforeEach(() => {
    db = getDatabase(':memory:');
    runMigrations(db);
    memoryRepo = new MemoryRepository(db);
    extractor = new MemoryExtractor(memoryRepo);
  });

  it('extracts laptop brand and budget from prompt', () => {
    const text = 'I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS.';
    const facts = extractor.extractFromText(text);

    expect(facts.length).toBeGreaterThanOrEqual(2);

    const brandFact = facts.find(f => f.predicate === 'preferred_laptop_brand');
    expect(brandFact).toBeDefined();
    expect(brandFact?.value).toBe('ASUS');
    expect(brandFact?.source_type).toBe('explicit_statement');
    expect(brandFact?.confidence).toBeGreaterThanOrEqual(0.95);

    const budgetFact = facts.find(f => f.predicate === 'budget');
    expect(budgetFact).toBeDefined();
    expect(budgetFact?.value).toContain('80,000');
  });

  it('extracts subscription price fact', () => {
    const text = 'The subscription cost ₹499 per month.';
    const facts = extractor.extractFromText(text);

    const subFact = facts.find(f => f.subject === 'subscription');
    expect(subFact).toBeDefined();
    expect(subFact?.predicate).toBe('price_per_month');
    expect(subFact?.value).toBe('₹499 per month');
  });

  it('extracts user decision', () => {
    const text = 'I decided to upgrade my workstation to 64GB RAM.';
    const facts = extractor.extractFromText(text);

    const decisionFact = facts.find(f => f.category === 'decision');
    expect(decisionFact).toBeDefined();
    expect(decisionFact?.value).toContain('upgrade my workstation');
  });
});
