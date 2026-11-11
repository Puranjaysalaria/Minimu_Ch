import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/index.js';
import { getDatabase, closeDatabase } from '../../server/src/database/connection.js';
import { runMigrations } from '../../server/src/database/migrations/migrator.js';
import { setMockGeminiHandler } from '../../server/src/ai/geminiClient.js';

describe('API Endpoints Integration (Supertest)', () => {
  beforeEach(() => {
    const db = getDatabase(':memory:');
    runMigrations(db);
    setMockGeminiHandler(async () => ({
      text: 'Acknowledged. Information recorded in persistent memory.',
    }));
  });

  afterEach(() => {
    setMockGeminiHandler(null);
    closeDatabase();
  });

  it('GET /api/health returns 200 and healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('healthy');
    expect(res.body.timezone).toBeDefined();
  });

  it('POST /api/conversations creates a new conversation', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ title: 'Integration Test Chat' });

    expect(res.status).toBe(201);
    expect(res.body.conversation).toBeDefined();
    expect(res.body.conversation.title).toBe('Integration Test Chat');
    expect(res.body.conversation.id).toBeDefined();
  });

  it('POST /api/chat records message and returns response', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .send({ title: 'Laptop Preference Conversation' });

    const convId = convRes.body.conversation.id;

    const chatRes = await request(app)
      .post('/api/chat')
      .send({
        conversationId: convId,
        message: 'I am planning to buy a laptop. My budget is ₹80,000, and I prefer ASUS.',
      });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.reply).toBeDefined();
    expect(chatRes.body.conversationId).toBe(convId);

    // Verify messages persisted
    const getRes = await request(app).get(`/api/conversations/${convId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.messages.length).toBe(2); // user + assistant
    expect(getRes.body.messages[0].role).toBe('user');
    expect(getRes.body.messages[1].role).toBe('assistant');
  });

  it('GET /api/memories lists extracted memories', async () => {
    // Add turn with memory
    await request(app)
      .post('/api/chat')
      .send({
        message: 'My budget is ₹80,000, and I prefer ASUS.',
      });

    const memRes = await request(app).get('/api/memories');
    expect(memRes.status).toBe(200);
    expect(memRes.body.memories.length).toBeGreaterThan(0);
    const brand = memRes.body.memories.find((m: any) => m.predicate === 'preferred_laptop_brand');
    expect(brand).toBeDefined();
    expect(brand.value).toBe('ASUS');
  });

  it('DELETE /api/conversations/:id deletes conversation and its messages', async () => {
    const convRes = await request(app)
      .post('/api/conversations')
      .send({ title: 'To Delete' });
    const convId = convRes.body.conversation.id;

    const delRes = await request(app).delete(`/api/conversations/${convId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get(`/api/conversations/${convId}`);
    expect(getRes.status).toBe(404);
  });
});
