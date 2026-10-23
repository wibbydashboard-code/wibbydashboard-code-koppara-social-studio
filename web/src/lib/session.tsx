import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setActingUser } from './api.ts';
import { can, type Permission } from '../../../shared/workflow.ts';
import type { User, WorkspaceSettings } from '../../../shared/types.ts';

export interface SessionData {
  user: User;
  users: User[];
  settings: WorkspaceSettings;
  ai: { provider: string; label: string; isAi: boolean; balance: number };
}

interface Ctx extends SessionData {
  switchUser: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get<SessionData>('/session');
      setActingUser(d.user.id);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la sesión.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error)
    return (
      <div className="loading" role="alert">
        {error}
      </div>
    );
  if (!data) return <>{fallback}</>;

  const value: Ctx = {
    ...data,
    refresh,
    switchUser: async (id) => {
      setActingUser(id);
      await refresh();
    },
    can: (p) => can(data.user.role, p),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('SessionProvider ausente');
  return c;
}
