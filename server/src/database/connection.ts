import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement<T = unknown> {
  run(...params: unknown[]): RunResult;
  get(...params: unknown[]): T | undefined;
  all(...params: unknown[]): T[];
}

export interface IDatabase {
  exec(sql: string): void;
  prepare<T = unknown>(sql: string): Statement<T>;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  pragma(pragmaStr: string): unknown;
  close(): void;
}

class NodeSqliteAdapter implements IDatabase {
  private syncDb: any;

  constructor(targetPath: string) {
    // Dynamic import/require of node:sqlite
    const { DatabaseSync } = require('node:sqlite');
    this.syncDb = new DatabaseSync(targetPath);
  }

  exec(sql: string): void {
    this.syncDb.exec(sql);
  }

  prepare<T = unknown>(sql: string): Statement<T> {
    const stmt = this.syncDb.prepare(sql);
    return {
      run: (...params: unknown[]) => {
        // Node sqlite expects primitives in run
        return stmt.run(...params) as RunResult;
      },
      get: (...params: unknown[]) => {
        const res = stmt.get(...params);
        return res ? (res as T) : undefined;
      },
      all: (...params: unknown[]) => {
        return stmt.all(...params) as T[];
      },
    };
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = (...args: Parameters<T>): ReturnType<T> => {
      this.syncDb.exec('BEGIN');
      try {
        const result = fn(...args);
        this.syncDb.exec('COMMIT');
        return result;
      } catch (err) {
        this.syncDb.exec('ROLLBACK');
        throw err;
      }
    };
    return wrapped as T;
  }

  pragma(pragmaStr: string): unknown {
    const trimmed = pragmaStr.trim();
    if (trimmed.includes('=')) {
      this.syncDb.exec(`PRAGMA ${trimmed};`);
      return null;
    } else {
      try {
        const stmt = this.syncDb.prepare(`PRAGMA ${trimmed};`);
        return stmt.get();
      } catch {
        return null;
      }
    }
  }

  close(): void {
    try {
      this.syncDb.close();
    } catch {
      // ignore
    }
  }
}

let dbInstance: IDatabase | null = null;

export function getDatabase(customPath?: string): IDatabase {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const targetPath = customPath || config.databasePath;

  if (targetPath !== ':memory:') {
    const dir = path.dirname(path.resolve(targetPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db: IDatabase;

  // Try better-sqlite3 first if available
  try {
    const BetterSqlite = require('better-sqlite3');
    const bdb = new BetterSqlite(targetPath);
    bdb.pragma('journal_mode = WAL');
    bdb.pragma('foreign_keys = ON');
    bdb.pragma('synchronous = NORMAL');
    db = bdb as IDatabase;
  } catch {
    // Fallback to native Node.js SQLite (DatabaseSync) which has built-in FTS5 & zero external deps
    const nodeDb = new NodeSqliteAdapter(targetPath);
    nodeDb.pragma('journal_mode = WAL');
    nodeDb.pragma('foreign_keys = ON');
    nodeDb.pragma('synchronous = NORMAL');
    db = nodeDb;
  }

  dbInstance = db;
  return db;
}

export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}
