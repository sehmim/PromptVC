'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/lib/store';

export function Providers({ children }: { children: React.ReactNode }) {
  const loadSessions = useSessionStore((state) => state.loadSessions);

  useEffect(() => {
    // Load sessions from localStorage on mount
    loadSessions();
  }, [loadSessions]);

  return <>{children}</>;
}
