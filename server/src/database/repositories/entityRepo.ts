import { IDatabase } from '../connection.js';
import { v4 as uuidv4 } from 'uuid';

export interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  aliases: string[];
}

export class EntityRepository {
  constructor(private db: IDatabase) {}

  upsert(canonical_name: string, entity_type: string, aliases: string[] = []): Entity {
    const existing = this.findByName(canonical_name);
    if (existing) {
      const mergedAliases = Array.from(new Set([...existing.aliases, ...aliases]));
      const stmt = this.db.prepare(`
        UPDATE entities
        SET aliases = ?
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(mergedAliases), existing.id);
      return {
        ...existing,
        aliases: mergedAliases,
      };
    }

    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO entities (id, canonical_name, entity_type, aliases)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, canonical_name.toLowerCase().trim(), entity_type, JSON.stringify(aliases));
    return {
      id,
      canonical_name: canonical_name.toLowerCase().trim(),
      entity_type,
      aliases,
    };
  }

  findByName(name: string): Entity | null {
    const normalized = name.toLowerCase().trim();
    const stmt = this.db.prepare(`
      SELECT * FROM entities
      WHERE canonical_name = ?
    `);
    const row = stmt.get(normalized) as { id: string; canonical_name: string; entity_type: string; aliases: string } | undefined;
    if (!row) return null;

    let aliases: string[] = [];
    try {
      aliases = JSON.parse(row.aliases || '[]');
    } catch {
      aliases = [];
    }

    return {
      id: row.id,
      canonical_name: row.canonical_name,
      entity_type: row.entity_type,
      aliases,
    };
  }

  linkToMessage(message_id: string, entity_id: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO message_entities (message_id, entity_id)
      VALUES (?, ?)
    `);
    stmt.run(message_id, entity_id);
  }

  getEntitiesForMessage(message_id: string): Entity[] {
    const stmt = this.db.prepare(`
      SELECT e.* FROM entities e
      JOIN message_entities me ON e.id = me.entity_id
      WHERE me.message_id = ?
    `);
    const rows = stmt.all(message_id) as Array<{ id: string; canonical_name: string; entity_type: string; aliases: string }>;
    return rows.map(r => ({
      id: r.id,
      canonical_name: r.canonical_name,
      entity_type: r.entity_type,
      aliases: JSON.parse(r.aliases || '[]'),
    }));
  }
}
