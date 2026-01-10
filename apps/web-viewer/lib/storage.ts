import { PromptSession } from './types';

const STORAGE_KEY = 'promptvc_sessions';
const VIEWED_FILES_PREFIX = 'promptvc_viewed_';

/**
 * Storage manager for PromptVC sessions in localStorage
 */
export class SessionStorage {
  /**
   * Get all sessions from localStorage
   */
  static getSessions(): PromptSession[] {
    if (typeof window === 'undefined') return [];

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading sessions from localStorage:', error);
      return [];
    }
  }

  /**
   * Save sessions to localStorage
   */
  static saveSessions(sessions: PromptSession[]): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving sessions to localStorage:', error);
    }
  }

  /**
   * Add a single session
   */
  static addSession(session: PromptSession): void {
    const sessions = this.getSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);

    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }

    this.saveSessions(sessions);
  }

  /**
   * Add multiple sessions (merge)
   */
  static addSessions(newSessions: PromptSession[]): void {
    const existingSessions = this.getSessions();
    const sessionMap = new Map(existingSessions.map(s => [s.id, s]));

    // Add or update sessions
    newSessions.forEach(session => {
      sessionMap.set(session.id, session);
    });

    this.saveSessions(Array.from(sessionMap.values()));
  }

  /**
   * Get a single session by ID
   */
  static getSession(id: string): PromptSession | null {
    const sessions = this.getSessions();
    return sessions.find(s => s.id === id) || null;
  }

  /**
   * Delete a session
   */
  static deleteSession(id: string): void {
    const sessions = this.getSessions();
    const filtered = sessions.filter(s => s.id !== id);
    this.saveSessions(filtered);
  }

  /**
   * Clear all sessions
   */
  static clearAll(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Export sessions as JSON string
   */
  static exportSessions(): string {
    const sessions = this.getSessions();
    return JSON.stringify(sessions, null, 2);
  }

  /**
   * Import sessions from JSON string
   */
  static importSessions(jsonString: string, merge: boolean = true): void {
    try {
      const newSessions = JSON.parse(jsonString);

      if (!Array.isArray(newSessions)) {
        throw new Error('Invalid format: expected an array of sessions');
      }

      if (merge) {
        this.addSessions(newSessions);
      } else {
        this.saveSessions(newSessions);
      }
    } catch (error) {
      console.error('Error importing sessions:', error);
      throw error;
    }
  }

  /**
   * Get viewed files for a session/prompt
   */
  static getViewedFiles(key: string): Set<string> {
    if (typeof window === 'undefined') return new Set();

    try {
      const data = localStorage.getItem(`${VIEWED_FILES_PREFIX}${key}`);
      return data ? new Set(JSON.parse(data)) : new Set();
    } catch (error) {
      return new Set();
    }
  }

  /**
   * Set viewed files for a session/prompt
   */
  static setViewedFiles(key: string, files: Set<string>): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(
        `${VIEWED_FILES_PREFIX}${key}`,
        JSON.stringify(Array.from(files))
      );
    } catch (error) {
      console.error('Error saving viewed files:', error);
    }
  }

  /**
   * Toggle a file's viewed status
   */
  static toggleFileViewed(key: string, fileName: string): void {
    const viewed = this.getViewedFiles(key);

    if (viewed.has(fileName)) {
      viewed.delete(fileName);
    } else {
      viewed.add(fileName);
    }

    this.setViewedFiles(key, viewed);
  }
}
