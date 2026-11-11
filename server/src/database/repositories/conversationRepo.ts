import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export class ConversationRepository {
  constructor(private db: IDatabase) {}

  create(title = 'New Conversation', customId?: string): Conversation {
    const id = customId || uuidv4();
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, title, now, now);
    return { id, title, created_at: now, updated_at: now };
  }

  getById(id: string): Conversation | null {
    const stmt = this.db.prepare(`SELECT * FROM conversations WHERE id = ?`);
    const row = stmt.get(id) as Conversation | undefined;
    return row || null;
  }

  getAll(limit = 100, offset = 0): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as Conversation[];
  }

  update(id: string, updates: { title?: string; updated_at?: string }): boolean {
    const current = this.getById(id);
    if (!current) return false;

    const title = updates.title ?? current.title;
    const updated_at = updates.updated_at ?? new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
    `);
    const result = stmt.run(title, updated_at, id);
    return result.changes > 0;
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM conversations WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
