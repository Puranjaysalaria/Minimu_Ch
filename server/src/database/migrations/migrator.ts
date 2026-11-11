import { IDatabase } from '../connection.js';

export function runMigrations(db: IDatabase): void {
  // Create migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const hasVersion1 = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get('001_initial_schema');

  if (!hasVersion1) {
    db.transaction(() => {
      // 1. Conversations
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
      `);

      // 2. Messages
      db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          metadata TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at ASC);
      `);

      // 3. Conversation Summaries
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_summaries (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          summary TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_summaries_conv ON conversation_summaries(conversation_id);
      `);

      // 4. Structured Memories
      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          value TEXT NOT NULL,
          category TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 1.0,
          source_type TEXT NOT NULL DEFAULT 'explicit_statement',
          source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
          valid_from TEXT NOT NULL,
          valid_until TEXT,
          recorded_at TEXT NOT NULL,
          supersedes_id TEXT REFERENCES memories(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_memories_subject_predicate ON memories(subject, predicate);
        CREATE INDEX IF NOT EXISTS idx_memories_validity ON memories(valid_from, valid_until);
        CREATE INDEX IF NOT EXISTS idx_memories_conv ON memories(source_conversation_id);
        CREATE INDEX IF NOT EXISTS idx_memories_supersedes ON memories(supersedes_id);
      `);

      // 5. Entities
      db.exec(`
        CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY,
          canonical_name TEXT NOT NULL UNIQUE,
          entity_type TEXT NOT NULL,
          aliases TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);
      `);

      // 6. Message Entities
      db.exec(`
        CREATE TABLE IF NOT EXISTS message_entities (
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
          PRIMARY KEY (message_id, entity_id)
        );
      `);

      // 7. Sources
      db.exec(`
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          retrieved_at TEXT NOT NULL,
          published_at TEXT,
          content_excerpt TEXT NOT NULL,
          query TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sources_url ON sources(url);
        CREATE INDEX IF NOT EXISTS idx_sources_query ON sources(query);
      `);

      // 8. FTS5 Virtual Tables
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          memory_id UNINDEXED,
          subject,
          predicate,
          value,
          category,
          full_text
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
          message_id UNINDEXED,
          conversation_id UNINDEXED,
          role UNINDEXED,
          content
        );
      `);

      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        '001_initial_schema',
        new Date().toISOString()
      );
    })();
  }
}
