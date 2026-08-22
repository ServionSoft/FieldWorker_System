import { create } from 'zustand';
import { User } from './types';
import { api, setTokens, ApiError } from '@/lib/api';

interface AuthState {
  currentUser: User | null;
  company: { id: string; name: string; status: string; phone?: string; email?: string; address?: string; timezone?: string; trialEndsAt?: string | null; onboardingRequired?: boolean; onboardingComplete?: boolean } | null;
  isAuthenticated: boolean;
  darkMode: boolean;
  ready: boolean;
  impersonatedBy: string | null;
  permissions: string[];
  planFeatures: string[];
  login: (email: string, password: string) => Promise<boolean>;
  register: (companyName: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  toggleDarkMode: () => void;
  startImpersonation: (accessToken: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

function applySession(data: any) {
  const permissions = data.permissions ?? data.user?.permissions ?? [];
  const planFeatures = data.planFeatures ?? data.user?.planFeatures ?? [];
  const user = { ...data.user, permissions };
  const company = data.company
    ? { ...data.company, trialEndsAt: data.company.trialEndsAt ?? data.company.trial_ends_at ?? null }
    : null;
  return {
    currentUser: user,
    company,
    isAuthenticated: true,
    permissions,
    planFeatures,
    impersonatedBy: data.impersonatedBy ?? null,
  };
}

export const useAppStore = create<AuthState>((set, get) => ({
  currentUser: null,
  company: null,
  isAuthenticated: false,
  darkMode: false,
  ready: false,
  impersonatedBy: null,
  permissions: [],
  planFeatures: [],

  login: async (email, password) => {
    try {
      const data = await api.auth.login(email, password);
      setTokens(data.accessToken, data.refreshToken);
      set(applySession(data));
      return true;
    } catch (err) {
      if (
        (err instanceof ApiError || (typeof err === 'object' && err && 'status' in err)) &&
        ((err as ApiError).status === 401 || (err as ApiError).code === 'UNAUTHORIZED')
      ) {
        return false;
      }
      throw err;
    }
  },

  register: async (companyName, email, password) => {
    const data = await api.auth.register(companyName, email, password);
    setTokens(data.accessToken, data.refreshToken);
    set(applySession(data));
    return true;
  },

  logout: async () => {
    try {
      await api.auth.logout(localStorage.getItem('fp_refresh') || undefined);
    } catch { /* ignore */ }
    localStorage.removeItem('fp_sa_access');
    localStorage.removeItem('fp_sa_refresh');
    localStorage.removeItem('fp_impersonating');
    setTokens(null, null);
    set({ currentUser: null, company: null, isAuthenticated: false, impersonatedBy: null, permissions: [], planFeatures: [] });
  },

  hydrate: async () => {
    const token = localStorage.getItem('fp_access');
    if (!token) {
      set({ ready: true });
      return;
    }
    try {
      const data = await api.auth.me();
      set({ ...applySession(data), ready: true });
    } catch {
      setTokens(null, null);
      set({ currentUser: null, company: null, isAuthenticated: false, ready: true, impersonatedBy: null, permissions: [], planFeatures: [] });
    }
  },

  startImpersonation: async (accessToken: string) => {
    localStorage.setItem('fp_sa_access', localStorage.getItem('fp_access') || '');
    localStorage.setItem('fp_sa_refresh', localStorage.getItem('fp_refresh') || '');
    localStorage.setItem('fp_impersonating', '1');
    setTokens(accessToken, localStorage.getItem('fp_refresh'));
    const data = await api.auth.me();
    set(applySession(data));
  },

  stopImpersonation: async () => {
    const access = localStorage.getItem('fp_sa_access');
    const refresh = localStorage.getItem('fp_sa_refresh');
    localStorage.removeItem('fp_sa_access');
    localStorage.removeItem('fp_sa_refresh');
    localStorage.removeItem('fp_impersonating');
    setTokens(access, refresh);
    const data = await api.auth.me();
    set(applySession(data));
  },

  toggleDarkMode: () => {
    const newMode = !get().darkMode;
    if (newMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set({ darkMode: newMode });
  },
}));
