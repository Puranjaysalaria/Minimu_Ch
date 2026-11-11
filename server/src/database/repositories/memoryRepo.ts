import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryRecord {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  category: 'preference' | 'budget' | 'plan' | 'decision' | 'fact' | 'correction';
  confidence: number;
  source_type: 'explicit_statement' | 'reasonable_inference' | 'uncertain';
  source_message_id?: string | null;
  source_conversation_id?: string | null;
  valid_from: string;
  valid_until?: string | null;
  recorded_at: string;
  supersedes_id?: string | null;
}

export class MemoryRepository {
  constructor(private db: IDatabase) {}

  create(record: Omit<MemoryRecord, 'id' | 'recorded_at'> & { id?: string; recorded_at?: string }): MemoryRecord {
    const id = record.id || uuidv4();
    const recorded_at = record.recorded_at || new Date().toISOString();
    const valid_from = record.valid_from || recorded_at;
    const valid_until = record.valid_until || null;
    const supersedes_id = record.supersedes_id || null;

    const full_text = `${record.subject} ${record.predicate} ${record.value} ${record.category}`;

    const insertMem = this.db.prepare(`
      INSERT INTO memories (
        id, subject, predicate, value, category, confidence,
        source_type, source_message_id, source_conversation_id,
        valid_from, valid_until, recorded_at, supersedes_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO memory_fts (memory_id, subject, predicate, value, category, full_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateSuperseded = this.db.prepare(`
      UPDATE memories
      SET valid_until = ?
      WHERE id = ? AND (valid_until IS NULL OR valid_until > ?)
    `);

    this.db.transaction(() => {
      // If this record supersedes an older record, set old record's valid_until
      if (supersedes_id) {
        updateSuperseded.run(valid_from, supersedes_id, valid_from);
      }

      insertMem.run(
        id,
        record.subject,
        record.predicate,
        record.value,
        record.category,
        record.confidence,
        record.source_type,
        record.source_message_id || null,
        record.source_conversation_id || null,
        valid_from,
        valid_until,
        recorded_at,
        supersedes_id
      );

      insertFts.run(
        id,
        record.subject,
        record.predicate,
        record.value,
        record.category,
        full_text
      );
    })();

    return {
      id,
      subject: record.subject,
      predicate: record.predicate,
      value: record.value,
      category: record.category,
      confidence: record.confidence,
      source_type: record.source_type,
      source_message_id: record.source_message_id || null,
      source_conversation_id: record.source_conversation_id || null,
      valid_from,
      valid_until,
      recorded_at,
      supersedes_id,
    };
  }

  getById(id: string): MemoryRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM memories WHERE id = ?`);
    const row = stmt.get(id) as MemoryRecord | undefined;
    return row || null;
  }

  getAll(options: { onlyActive?: boolean; limit?: number; offset?: number } = {}): MemoryRecord[] {
    const { onlyActive = false, limit = 100, offset = 0 } = options;
    let sql = 'SELECT * FROM memories';
    if (onlyActive) {
      sql += ' WHERE valid_until IS NULL';
    }
    sql += ' ORDER BY recorded_at DESC LIMIT ? OFFSET ?';
    return this.db.prepare(sql).all(limit, offset) as MemoryRecord[];
  }

  getBySubjectAndPredicate(subject: string, predicate: string, onlyActive = false): MemoryRecord[] {
    let sql = `
      SELECT * FROM memories
      WHERE LOWER(subject) = LOWER(?) AND LOWER(predicate) = LOWER(?)
    `;
    if (onlyActive) {
      sql += ' AND valid_until IS NULL';
    }
    sql += ' ORDER BY valid_from DESC, recorded_at DESC';
    return this.db.prepare(sql).all(subject, predicate) as MemoryRecord[];
  }

  searchFTS(query: string, limit = 20): MemoryRecord[] {
    const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
    if (!sanitized) return [];

    // Format query terms for FTS MATCH (e.g. "term1* OR term2*")
    const words = sanitized.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const ftsQuery = words.map(w => `"${w}"*`).join(' OR ');

    try {
      const stmt = this.db.prepare(`
        SELECT m.* FROM memories m
        JOIN memory_fts f ON m.id = f.memory_id
        WHERE memory_fts MATCH ?
        ORDER BY bm25(memory_fts) ASC, m.recorded_at DESC
        LIMIT ?
      `);
      return stmt.all(ftsQuery, limit) as MemoryRecord[];
    } catch {
      // Fallback to LIKE if FTS expression has syntax quirk
      const fallbackStmt = this.db.prepare(`
        SELECT * FROM memories
        WHERE subject LIKE ? OR predicate LIKE ? OR value LIKE ?
        ORDER BY recorded_at DESC
        LIMIT ?
      `);
      const likeTerm = `%${sanitized}%`;
      return fallbackStmt.all(likeTerm, likeTerm, likeTerm, limit) as MemoryRecord[];
    }
  }

  getMemoriesInTimeRange(startTime: string, endTime: string): MemoryRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE (valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?))
         OR (recorded_at BETWEEN ? AND ?)
      ORDER BY valid_from DESC, recorded_at DESC
    `);
    return stmt.all(endTime, startTime, startTime, endTime) as MemoryRecord[];
  }

  getAuditHistory(memoryId: string): MemoryRecord[] {
    // Traverse the chain of supersedes_id backwards and forwards
    const records: MemoryRecord[] = [];
    let current = this.getById(memoryId);
    if (!current) return records;

    records.push(current);

    // Follow supersedes chain backward
    let prevId = current.supersedes_id;
    while (prevId) {
      const prev = this.getById(prevId);
      if (!prev) break;
      records.unshift(prev);
      prevId = prev.supersedes_id;
    }

    // Follow superseding chain forward
    let nextId = current.id;
    while (nextId) {
      const next = this.db.prepare(`SELECT * FROM memories WHERE supersedes_id = ?`).get(nextId) as MemoryRecord | undefined;
      if (!next) break;
      records.push(next);
      nextId = next.id;
    }

    return records;
  }
}
