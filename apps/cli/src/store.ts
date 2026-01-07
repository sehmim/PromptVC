import * as fs from 'fs';
import * as path from 'path';
import { PromptSession } from '@promptvc/types';
import { v4 as uuidv4 } from 'uuid';

let sessionsFilePath: string | null = null;
const DEFAULT_SETTINGS = { notifySoundEnabled: true };

/**
 * Initialize the JSON storage for a given repository
 * Creates the .promptvc directory and sessions.json if they don't exist
 */
export function initDb(repoRoot: string): void {
  const promptvcDir = path.join(repoRoot, '.promptvc');

  // Create .promptvc directory if it doesn't exist
  if (!fs.existsSync(promptvcDir)) {
    fs.mkdirSync(promptvcDir, { recursive: true });
  }

  sessionsFilePath = path.join(promptvcDir, 'sessions.json');

  // Create empty sessions file if it doesn't exist
  if (!fs.existsSync(sessionsFilePath)) {
    fs.writeFileSync(sessionsFilePath, JSON.stringify([], null, 2));
  }
}

/**
 * Initialize PromptVC storage and default settings for a repository
 */
export function initRepoStorage(repoRoot: string): {
  promptvcDir: string;
  sessionsFilePath: string;
  settingsFilePath: string;
} {
  initDb(repoRoot);

  const promptvcDir = path.join(repoRoot, '.promptvc');
  const settingsFilePath = path.join(promptvcDir, 'settings.json');
  const sessionsPath = path.join(promptvcDir, 'sessions.json');

  if (!fs.existsSync(settingsFilePath)) {
    fs.writeFileSync(settingsFilePath, JSON.stringify(DEFAULT_SETTINGS, null, 2));
  }

  return {
    promptvcDir,
    sessionsFilePath: sessionsPath,
    settingsFilePath,
  };
}

/**
 * Read all sessions from the JSON file
 */
function readSessions(): PromptSession[] {
  if (!sessionsFilePath) {
    throw new Error('Storage not initialized. Call initDb first.');
  }

  try {
    const data = fs.readFileSync(sessionsFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading sessions:', error);
    return [];
  }
}

/**
 * Write sessions to the JSON file
 */
function writeSessions(sessions: PromptSession[]): void {
  if (!sessionsFilePath) {
    throw new Error('Storage not initialized. Call initDb first.');
  }

  fs.writeFileSync(sessionsFilePath, JSON.stringify(sessions, null, 2));
}

/**
 * Insert a new prompt session into the JSON file
 */
export function insertSession(session: Omit<PromptSession, 'id'>): string {
  const id = uuidv4();
  const sessions = readSessions();

  const newSession: PromptSession = {
    id,
    ...session,
  };

  sessions.unshift(newSession); // Add to beginning for reverse chronological order
  writeSessions(sessions);

  return id;
}

/**
 * Get sessions from the JSON file
 * @param limit - Maximum number of sessions to return (default: 50)
 * @param offset - Number of sessions to skip (default: 0)
 */
export function getSessions(limit: number = 50, offset: number = 0): PromptSession[] {
  const sessions = readSessions();
  return sessions.slice(offset, offset + limit);
}

/**
 * Get a single session by ID
 */
export function getSessionById(id: string): PromptSession | null {
  const sessions = readSessions();
  return sessions.find(s => s.id === id) || null;
}

/**
 * Get sessions by provider
 */
export function getSessionsByProvider(provider: string, limit: number = 50): PromptSession[] {
  const sessions = readSessions();
  return sessions.filter(s => s.provider === provider).slice(0, limit);
}
