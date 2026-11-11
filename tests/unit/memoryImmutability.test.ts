import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase, IDatabase } from '../../server/src/database/connection.js';
import { runMigrations } from '../../server/src/database/migrations/migrator.js';
import { MemoryRepository } from '../../server/src/database/repositories/memoryRepo.js';
import { MemoryExtractor } from '../../server/src/memory/memoryExtractor.js';
import { MemoryRetriever } from '../../server/src/memory/memoryRetriever.js';
import { MessageRepository } from '../../server/src/database/repositories/messageRepo.js';
import { ConversationRepository } from '../../server/src/database/repositories/conversationRepo.js';
import { EntityRepository } from '../../server/src/database/repositories/entityRepo.js';
import { defaultTemporalResolver } from '../../server/src/memory/temporalResolver.js';

describe('Memory Immutability and Audit Trail', () => {
  let db: IDatabase;
  let memoryRepo: MemoryRepository;
  let messageRepo: MessageRepository;
  let convRepo: ConversationRepository;
  let entityRepo: EntityRepository;
  let extractor: MemoryExtractor;
  let retriever: MemoryRetriever;

  beforeEach(() => {
    db = getDatabase(':memory:');
    runMigrations(db);
    memoryRepo = new MemoryRepository(db);
    messageRepo = new MessageRepository(db);
    convRepo = new ConversationRepository(db);
    entityRepo = new EntityRepository(db);
    extractor = new MemoryExtractor(memoryRepo);
    retriever = new MemoryRetriever(memoryRepo, messageRepo, entityRepo, defaultTemporalResolver);
  });

  it('preserves historical price when a new price arrives and sets supersedes link', () => {
    const c1 = convRepo.create('January Sub', 'conv-1');
    const m1 = messageRepo.create({ conversation_id: c1.id, role: 'user', content: 'The subscription costs ₹499 per month.', customId: 'msg-jan' });

    // January turn
    const janDate = '2026-01-15T10:00:00+05:30';
    const janRecords = extractor.processAndSave(
      m1.content,
      c1.id,
      m1.id,
      janDate
    );
    expect(janRecords.length).toBe(1);
    const janRecord = janRecords[0];
    expect(janRecord.value).toBe('₹499 per month');
    expect(janRecord.supersedes_id).toBeNull();
    expect(janRecord.valid_until).toBeNull();

    // March turn: Price increased to ₹599
    const c2 = convRepo.create('March Sub', 'conv-2');
    const m2 = messageRepo.create({ conversation_id: c2.id, role: 'user', content: 'The subscription now costs ₹599 per month.', customId: 'msg-mar' });

    const marDate = '2026-03-20T10:00:00+05:30';
    const marRecords = extractor.processAndSave(
      m2.content,
      c2.id,
      m2.id,
      marDate
    );
    expect(marRecords.length).toBe(1);
    const marRecord = marRecords[0];
    expect(marRecord.value).toBe('₹599 per month');
    expect(marRecord.supersedes_id).toBe(janRecord.id);

    // Verify both records exist in DB (no overwrite!)
    const allRecords = memoryRepo.getBySubjectAndPredicate('subscription', 'price_per_month', false);
    expect(allRecords.length).toBe(2);

    // Verify the January record is preserved with valid_until set to March
    const updatedJanRecord = memoryRepo.getById(janRecord.id);
    expect(updatedJanRecord).not.toBeNull();
    expect(updatedJanRecord?.value).toBe('₹499 per month');
    expect(updatedJanRecord?.valid_until).toBe(marDate);

    // Verify only the March record is currently active
    const activeRecords = memoryRepo.getBySubjectAndPredicate('subscription', 'price_per_month', true);
    expect(activeRecords.length).toBe(1);
    expect(activeRecords[0].value).toBe('₹599 per month');

    // Audit trail should return both linked in chronological order
    const audit = memoryRepo.getAuditHistory(marRecord.id);
    expect(audit.length).toBe(2);
    expect(audit[0].id).toBe(janRecord.id);
    expect(audit[1].id).toBe(marRecord.id);
  });

  it('retrieves January record for a January temporal query', () => {
    const c1 = convRepo.create('January Sub', 'c1');
    const m1 = messageRepo.create({ conversation_id: c1.id, role: 'user', content: 'The subscription costs ₹499 per month.', customId: 'm1' });
    const janDate = '2026-01-15T10:00:00+05:30';
    extractor.processAndSave(m1.content, c1.id, m1.id, janDate);

    const c2 = convRepo.create('March Sub', 'c2');
    const m2 = messageRepo.create({ conversation_id: c2.id, role: 'user', content: 'The subscription now costs ₹599 per month.', customId: 'm2' });
    const marDate = '2026-03-20T10:00:00+05:30';
    extractor.processAndSave(m2.content, c2.id, m2.id, marDate);

    // Query asking about January
    const janQuery = retriever.retrieve('What was the subscription price in January 2026?', '2026-04-01T12:00:00+05:30');
    expect(janQuery.scoredMemories.length).toBeGreaterThan(0);
    // Highest ranked should be the January fact
    expect(janQuery.scoredMemories[0].memory.value).toBe('₹499 per month');
  });
});
