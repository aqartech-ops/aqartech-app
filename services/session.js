import { AppState } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import storage from './storage';
import { authApi, setAuthToken, setUnauthorizedHandler } from './api';
import { clearFields } from './fields';
import { clearCustomSections } from './customSections';
import { clearButtons } from './buttons';
import { clearTemplates } from './templates';

// Who is signed in: a company user (staff / owner) or a platform admin.
// `me` is the /auth/me payload: { kind: 'user', user, company, subscription, access } | { kind: 'admin', admin }

const TOKEN_KEY = 'aqartech.token';
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading'); // loading | signedOut | signedIn
  const [me, setMe] = useState(null);

  const signOut = useCallback(async () => {
    setAuthToken(null);
    clearFields();
    clearCustomSections();
    clearButtons();
    clearTemplates();
    await storage.remove(TOKEN_KEY);
    setMe(null);
    setStatus('signedOut');
  }, []);

  const applyAuth = useCallback(async ({ token, me: profile }) => {
    setAuthToken(token);
    await storage.set(TOKEN_KEY, token);
    setMe(profile);
    setStatus('signedIn');
  }, []);

  // Restore a saved session on startup
  useEffect(() => {
    setUnauthorizedHandler(() => signOut());
    (async () => {
      const token = await storage.get(TOKEN_KEY);
      if (!token) {
        setStatus('signedOut');
        return;
      }
      setAuthToken(token);
      try {
        setMe(await authApi.me());
        setStatus('signedIn');
      } catch (error) {
        // Network problem: keep the token so the user is not logged out for being offline.
        if (error.code === 'network') setStatus('signedOut');
        else await signOut();
      }
    })();
  }, [signOut]);

  // Plan or permission changes made by the platform team / the company owner apply when the app
  // comes back to the foreground — no need to sign out and in again.
  useEffect(() => {
    if (status !== 'signedIn') return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') authApi.me().then(setMe).catch(() => {});
    });
    return () => sub.remove();
  }, [status]);

  const value = useMemo(
    () => ({
      status,
      me,
      isAdmin: me?.kind === 'admin',
      signIn: async (email, password) => applyAuth(await authApi.login(email, password)),
      adminSignIn: async (email, password) => applyAuth(await authApi.adminLogin(email, password)),
      register: async (payload) => applyAuth(await authApi.register(payload)),
      refresh: async () => setMe(await authApi.me()),
      /** Change own password; this device keeps its session (others are signed out). */
      changePassword: async (currentPassword, password) => {
        const { token } = await authApi.changePassword(currentPassword, password);
        setAuthToken(token);
        await storage.set(TOKEN_KEY, token);
      },
      signOut,
      /** Access level for a section: 'EDIT' | 'VIEW' | 'HIDDEN' */
      levelOf: (section) => (me?.kind === 'user' ? me.access?.[section] ?? 'HIDDEN' : 'HIDDEN'),
      canEdit: (section) => me?.kind === 'user' && me.access?.[section] === 'EDIT',
    }),
    [status, me, applyAuth, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
