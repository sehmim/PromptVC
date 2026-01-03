import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { PromptSession } from '@promptvc/types';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database for a given repository
 * Creates the .promptvc directory and database if they don't exist
 */
export function initDb(repoRoot: string): Database.Database {
  const promptvcDir = path.join(repoRoot, '.promptvc');

  // Create .promptvc directory if it doesn't exist
  if (!fs.existsSync(promptvcDir)) {
    fs.mkdirSync(promptvcDir, { recursive: true });
  }

  const dbPath = path.join(promptvcDir, 'promptvc.db');
  db = new Database(dbPath);

  // Create sessions table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      repo_root TEXT NOT NULL,
      branch TEXT NOT NULL,
      pre_hash TEXT NOT NULL,
      post_hash TEXT,
      prompt TEXT NOT NULL,
      response_snippet TEXT NOT NULL,
      files TEXT NOT NULL,
      diff TEXT NOT NULL,
      created_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      auto_tagged INTEGER NOT NULL
    )
  `);

  // Create index on created_at for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_created_at ON sessions(created_at DESC)
  `);

  return db;
}

/**
 * Get the current database instance (must call initDb first)
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }
  return db;
}

/**
 * Insert a new prompt session into the database
 */
export function insertSession(session: Omit<PromptSession, 'id'>): string {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO sessions (
      id, provider, repo_root, branch, pre_hash, post_hash,
      prompt, response_snippet, files, diff, created_at, mode, auto_tagged
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    session.provider,
    session.repoRoot,
    session.branch,
    session.preHash,
    session.postHash,
    session.prompt,
    session.responseSnippet,
    JSON.stringify(session.files),
    session.diff,
    session.createdAt,
    session.mode,
    session.autoTagged ? 1 : 0
  );

  return id;
}

/**
 * Get sessions from the database
 * @param limit - Maximum number of sessions to return (default: 50)
 * @param offset - Number of sessions to skip (default: 0)
 */
export function getSessions(limit: number = 50, offset: number = 0): PromptSession[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }

  const stmt = db.prepare(`
    SELECT * FROM sessions
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(limit, offset) as any[];

  return rows.map(row => ({
    id: row.id,
    provider: row.provider,
    repoRoot: row.repo_root,
    branch: row.branch,
    preHash: row.pre_hash,
    postHash: row.post_hash,
    prompt: row.prompt,
    responseSnippet: row.response_snippet,
    files: JSON.parse(row.files),
    diff: row.diff,
    createdAt: row.created_at,
    mode: row.mode,
    autoTagged: row.auto_tagged === 1,
  }));
}

/**
 * Get a single session by ID
 */
export function getSessionById(id: string): PromptSession | null {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }

  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    repoRoot: row.repo_root,
    branch: row.branch,
    preHash: row.pre_hash,
    postHash: row.post_hash,
    prompt: row.prompt,
    responseSnippet: row.response_snippet,
    files: JSON.parse(row.files),
    diff: row.diff,
    createdAt: row.created_at,
    mode: row.mode,
    autoTagged: row.auto_tagged === 1,
  };
}

/**
 * Get sessions by provider
 */
export function getSessionsByProvider(provider: string, limit: number = 50): PromptSession[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDb first.');
  }

  const stmt = db.prepare(`
    SELECT * FROM sessions
    WHERE provider = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(provider, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    provider: row.provider,
    repoRoot: row.repo_root,
    branch: row.branch,
    preHash: row.pre_hash,
    postHash: row.post_hash,
    prompt: row.prompt,
    responseSnippet: row.response_snippet,
    files: JSON.parse(row.files),
    diff: row.diff,
    createdAt: row.created_at,
    mode: row.mode,
    autoTagged: row.auto_tagged === 1,
  }));
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
