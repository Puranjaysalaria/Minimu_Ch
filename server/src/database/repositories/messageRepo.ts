import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
  metadata?: string | null;
}

export class MessageRepository {
  constructor(private db: IDatabase) {}

  create(msg: {
    conversation_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown> | null;
    customId?: string;
    created_at?: string;
  }): Message {
    const id = msg.customId || uuidv4();
    const created_at = msg.created_at || new Date().toISOString();
    const metadataStr = msg.metadata ? JSON.stringify(msg.metadata) : null;

    const insertMsg = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO message_fts (message_id, conversation_id, role, content)
      VALUES (?, ?, ?, ?)
    `);

    const updateConv = this.db.prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `);

    this.db.transaction(() => {
      insertMsg.run(id, msg.conversation_id, msg.role, msg.content, created_at, metadataStr);
      insertFts.run(id, msg.conversation_id, msg.role, msg.content);
      updateConv.run(created_at, msg.conversation_id);
    })();

    return {
      id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      created_at,
      metadata: metadataStr,
    };
  }

  getByConversationId(conversation_id: string, limit = 100): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `);
    return stmt.all(conversation_id, limit) as Message[];
  }

  getById(id: string): Message | null {
    const stmt = this.db.prepare(`SELECT * FROM messages WHERE id = ?`);
    const row = stmt.get(id) as Message | undefined;
    return row || null;
  }

  search(query: string, limit = 20): Message[] {
    // Sanitize query for FTS5 (escape special chars)
    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitized) return [];

    const stmt = this.db.prepare(`
      SELECT m.* FROM messages m
      JOIN message_fts f ON m.id = f.message_id
      WHERE message_fts MATCH ?
      ORDER BY bm25(message_fts)
      LIMIT ?
    `);
    return stmt.all(sanitized, limit) as Message[];
  }
}
