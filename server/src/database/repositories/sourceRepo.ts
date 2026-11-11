import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface SourceRecord {
  id: string;
  title: string;
  url: string;
  retrieved_at: string;
  published_at?: string | null;
  content_excerpt: string;
  query: string;
}

export class SourceRepository {
  constructor(private db: IDatabase) {}

  create(source: Omit<SourceRecord, 'id' | 'retrieved_at'> & { id?: string; retrieved_at?: string }): SourceRecord {
    const id = source.id || uuidv4();
    const retrieved_at = source.retrieved_at || new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO sources (id, title, url, retrieved_at, published_at, content_excerpt, query)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      source.title,
      source.url,
      retrieved_at,
      source.published_at || null,
      source.content_excerpt,
      source.query
    );

    return {
      id,
      title: source.title,
      url: source.url,
      retrieved_at,
      published_at: source.published_at || null,
      content_excerpt: source.content_excerpt,
      query: source.query,
    };
  }

  getById(id: string): SourceRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM sources WHERE id = ?`);
    const row = stmt.get(id) as SourceRecord | undefined;
    return row || null;
  }

  getByUrl(url: string): SourceRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM sources WHERE url = ? ORDER BY retrieved_at DESC LIMIT 1`);
    const row = stmt.get(url) as SourceRecord | undefined;
    return row || null;
  }

  getByQuery(query: string, limit = 10): SourceRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sources
      WHERE query = ?
      ORDER BY retrieved_at DESC
      LIMIT ?
    `);
    return stmt.all(query, limit) as SourceRecord[];
  }
}
