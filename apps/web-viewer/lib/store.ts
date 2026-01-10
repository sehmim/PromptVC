import { create } from 'zustand';
import { PromptSession } from './types';
import { SessionStorage } from './storage';

interface SessionStore {
  sessions: PromptSession[];
  selectedSessionId: string | null;
  searchQuery: string;
  filterProvider: string | null;
  filterMode: 'oneshot' | 'interactive' | null;
  filterTags: string[];
  filterDateFrom: string | null;
  filterDateTo: string | null;
  diffViewMode: 'unified' | 'split';
  theme: 'light' | 'dark';

  // Actions
  loadSessions: () => void;
  addSession: (session: PromptSession) => void;
  addSessions: (sessions: PromptSession[]) => void;
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;
  setSelectedSession: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilterProvider: (provider: string | null) => void;
  setFilterMode: (mode: 'oneshot' | 'interactive' | null) => void;
  setFilterTags: (tags: string[]) => void;
  setFilterDateRange: (from: string | null, to: string | null) => void;
  setDiffViewMode: (mode: 'unified' | 'split') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  getFilteredSessions: () => PromptSession[];
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  searchQuery: '',
  filterProvider: null,
  filterMode: null,
  filterTags: [],
  filterDateFrom: null,
  filterDateTo: null,
  diffViewMode: 'split',
  theme: 'light',

  loadSessions: () => {
    const sessions = SessionStorage.getSessions();
    set({ sessions });
  },

  addSession: (session) => {
    SessionStorage.addSession(session);
    set({ sessions: SessionStorage.getSessions() });
  },

  addSessions: (newSessions) => {
    SessionStorage.addSessions(newSessions);
    set({ sessions: SessionStorage.getSessions() });
  },

  deleteSession: (id) => {
    SessionStorage.deleteSession(id);
    set({ sessions: SessionStorage.getSessions() });
  },

  clearAllSessions: () => {
    SessionStorage.clearAll();
    set({ sessions: [] });
  },

  setSelectedSession: (id) => {
    set({ selectedSessionId: id });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setFilterProvider: (provider) => {
    set({ filterProvider: provider });
  },

  setFilterMode: (mode) => {
    set({ filterMode: mode });
  },

  setFilterTags: (tags) => {
    set({ filterTags: tags });
  },

  setFilterDateRange: (from, to) => {
    set({ filterDateFrom: from, filterDateTo: to });
  },

  setDiffViewMode: (mode) => {
    set({ diffViewMode: mode });
  },

  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('promptvc_theme', theme);
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  },

  getFilteredSessions: () => {
    const {
      sessions,
      searchQuery,
      filterProvider,
      filterMode,
      filterTags,
      filterDateFrom,
      filterDateTo,
    } = get();

    return sessions.filter((session) => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesPrompt = session.prompt.toLowerCase().includes(query);
        const matchesFiles = session.files.some(f => f.toLowerCase().includes(query));
        const matchesTags = session.tags?.some(t => t.toLowerCase().includes(query));

        if (!matchesPrompt && !matchesFiles && !matchesTags) {
          return false;
        }
      }

      // Provider filter
      if (filterProvider && session.provider !== filterProvider) {
        return false;
      }

      // Mode filter
      if (filterMode && session.mode !== filterMode) {
        return false;
      }

      // Tags filter
      if (filterTags.length > 0) {
        if (!session.tags || !filterTags.every(t => session.tags!.includes(t))) {
          return false;
        }
      }

      // Date range filter
      if (filterDateFrom) {
        const sessionDate = new Date(session.createdAt);
        const fromDate = new Date(filterDateFrom);
        if (sessionDate < fromDate) {
          return false;
        }
      }

      if (filterDateTo) {
        const sessionDate = new Date(session.createdAt);
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        if (sessionDate > toDate) {
          return false;
        }
      }

      return true;
    });
  },
}));
