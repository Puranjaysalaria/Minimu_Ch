import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationSummary {
  id: string;
  conversation_id: string;
  summary: string;
  version: number;
  updated_at: string;
}

export class SummaryRepository {
  constructor(private db: IDatabase) {}

  getByConversationId(conversation_id: string): ConversationSummary | null {
    const stmt = this.db.prepare(`
      SELECT * FROM conversation_summaries
      WHERE conversation_id = ?
      ORDER BY version DESC
      LIMIT 1
    `);
    const row = stmt.get(conversation_id) as ConversationSummary | undefined;
    return row || null;
  }

  saveSummary(conversation_id: string, summary: string): ConversationSummary {
    const existing = this.getByConversationId(conversation_id);
    const now = new Date().toISOString();

    if (existing) {
      const newVersion = existing.version + 1;
      const stmt = this.db.prepare(`
        UPDATE conversation_summaries
        SET summary = ?, version = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(summary, newVersion, now, existing.id);
      return {
        id: existing.id,
        conversation_id,
        summary,
        version: newVersion,
        updated_at: now,
      };
    }

    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO conversation_summaries (id, conversation_id, summary, version, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, conversation_id, summary, 1, now);
    return {
      id,
      conversation_id,
      summary,
      version: 1,
      updated_at: now,
    };
  }
}
