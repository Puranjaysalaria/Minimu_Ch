import { describe, it, expect, afterEach } from 'vitest';
import { getDatabase } from '../../server/src/database/connection.js';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '../../server/src/database/migrations/migrator.js';
import { ConversationService } from '../../server/src/conversations/conversationService.js';

describe('Conversation and Memory Persistence across DB Restarts', () => {
  const testDbDir = path.resolve(process.cwd(), 'data/test_data');
  const testDbPath = path.join(testDbDir, 'test_persistence.db');

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
        if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
      } catch {
        // ignore
      }
    }
  });

  it('preserves conversations, messages, and extracted memories across backend restarts', () => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }

    // --- SESSION 1: Startup 1 ---
    let db = getDatabase(testDbPath);
    runMigrations(db);

    let service = new ConversationService(db);

    const conv = service.createConversation('Laptop Selection');
    const userTurn = service.addMessage({
      conversationId: conv.id,
      role: 'user',
      content: 'I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS.',
    });

    expect(userTurn.extractedMemories.length).toBeGreaterThanOrEqual(2);

    service.addMessage({
      conversationId: conv.id,
      role: 'assistant',
      content: 'Understood. ASUS laptops within ₹80,000 are solid performers. What display size do you need?',
    });

    // Close Database to simulate backend shutdown/restart
    db.close();

    // --- SESSION 2: Startup 2 (Backend Restart) ---
    db = getDatabase(testDbPath);
    runMigrations(db);

    service = new ConversationService(db);

    // Verify conversation still exists
    const restoredConv = service.getConversation(conv.id);
    expect(restoredConv).not.toBeNull();
    expect(restoredConv?.title).toBe('Laptop Selection');

    // Verify messages still exist in order
    const restoredMsgs = service.getMessages(conv.id);
    expect(restoredMsgs.length).toBe(2);
    expect(restoredMsgs[0].role).toBe('user');
    expect(restoredMsgs[0].content).toContain('budget is ₹80,000');
    expect(restoredMsgs[1].role).toBe('assistant');

    // Verify memories survived restart and can be retrieved
    const brandMemories = service.memoryRepo.getBySubjectAndPredicate('user', 'preferred_laptop_brand');
    expect(brandMemories.length).toBe(1);
    expect(brandMemories[0].value).toBe('ASUS');

    const budgetMemories = service.memoryRepo.getBySubjectAndPredicate('laptop', 'budget');
    expect(budgetMemories.length).toBe(1);
    expect(budgetMemories[0].value).toContain('80,000');

    db.close();
  });
});
