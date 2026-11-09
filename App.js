import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { COLORS } from './theme';
import { I18nProvider, useI18n } from './i18n';
import { SessionProvider, useSession } from './services/session';
import AppShell from './components/AppShell';

import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import CompaniesScreen from './screens/CompaniesScreen';
import PlansScreen from './screens/PlansScreen';
import FieldsScreen from './screens/FieldsScreen';
import SectionsScreen from './screens/SectionsScreen';
import ButtonsScreen from './screens/ButtonsScreen';
import TemplatesScreen from './screens/TemplatesScreen';
import MetricsScreen from './screens/MetricsScreen';
import TeamScreen from './screens/TeamScreen';
import PublishScreen from './screens/PublishScreen';
import OwnerPortalScreen from './screens/OwnerPortalScreen';
import { ChangePasswordCard } from './screens/SettingsScreen';
import { AdminPasswordCard } from './components/AdminSecurity';
import { Screen } from './components/ui';
import LandingScreen from './screens/LandingScreen';
import { PUBLIC_PAGES, URL_ROUTING, onLocationChange, readLocation, writeLocation } from './services/webRoute';
import CustomSectionScreen from './screens/CustomSectionScreen';
import { sectionName, useCustomSections } from './services/customSections';
import UsersScreen from './screens/UsersScreen';
import PropertiesScreen from './screens/PropertiesScreen';
import TenantsScreen from './screens/TenantsScreen';
import FinancialsScreen from './screens/FinancialsScreen';
import DocumentsScreen from './screens/DocumentsScreen';
import SettingsScreen from './screens/SettingsScreen';
import MaintenanceProvidersScreen from './screens/MaintenanceProvidersScreen';
import OwnersScreen from './screens/OwnersScreen';

// Sections of a subscriber (company / individual owner), in menu order.
// Which ones appear is decided by the server: plan features ∩ the user's role.
const USER_SECTIONS = [
  { key: 'dashboard', icon: 'view-dashboard-outline', Screen: DashboardScreen },
  { key: 'properties', icon: 'office-building-outline', Screen: PropertiesScreen },
  { key: 'tenants', icon: 'account-group-outline', Screen: TenantsScreen },
  { key: 'financials', icon: 'rial', Screen: FinancialsScreen },
  { key: 'maintenance', icon: 'tools', Screen: MaintenanceProvidersScreen },
  { key: 'documents', icon: 'file-document-multiple-outline', Screen: DocumentsScreen },
  { key: 'owners', icon: 'account-tie-outline', Screen: OwnersScreen },
  { key: 'users', icon: 'shield-account-outline', Screen: UsersScreen },
  { key: 'settings', icon: 'cog-outline', Screen: SettingsScreen },
];

// Sections of the platform team (فريق المنصة)
const ADMIN_SECTIONS = [
  { key: 'dashboard', icon: 'view-dashboard-outline', Screen: DashboardScreen },
  { key: 'companies', icon: 'domain', Screen: CompaniesScreen },
  { key: 'plans', icon: 'package-variant-closed', Screen: PlansScreen },
  { key: 'fields', icon: 'form-textbox', Screen: FieldsScreen },
  { key: 'sections', icon: 'view-grid-plus-outline', Screen: SectionsScreen },
  { key: 'buttons', icon: 'gesture-tap-button', Screen: ButtonsScreen },
  { key: 'templates', icon: 'file-document-edit-outline', Screen: TemplatesScreen },
  { key: 'metrics', icon: 'chart-box-outline', Screen: MetricsScreen },
  { key: 'publish', icon: 'publish', Screen: PublishScreen },
  { key: 'team', icon: 'account-key-outline', Screen: TeamScreen, roles: ['OWNER'] },
  { key: 'settings', icon: 'cog-outline', Screen: SettingsScreen },
];

/** A property owner signed in to the owner portal: their own view, read-only. */
const OWNER_SECTIONS = [
  { key: 'portal', icon: 'home-city-outline', Screen: OwnerPortalScreen },
  { key: 'settings', icon: 'cog-outline', Screen: SettingsScreen },
];

/** Admin pages per team role (the server enforces the same rules — this only keeps the menu tidy). */
const SUPPORT_SECTIONS = ['dashboard', 'companies', 'settings'];
function adminSectionAllowed(section, role) {
  if (section.roles) return section.roles.includes(role);
  return role !== 'SUPPORT' || SUPPORT_SECTIONS.includes(section.key);
}

function Root() {
  const { status, me, isAdmin, levelOf } = useSession();
  const { t, lang } = useI18n();
  const custom = useCustomSections(status === 'signedIn' && !isAdmin);
  // Web: the page comes from the address (refresh, links, Back / Forward); elsewhere it starts on the dashboard.
  const [route, setRoute] = useState(() => {
    const loc = readLocation();
    return loc.key && !PUBLIC_PAGES.includes(loc.key) ? loc : { key: 'dashboard', params: null };
  });
  // before signing in (web): '' = home page, 'login' | 'register' | 'admin'
  const [publicPage, setPublicPage] = useState(() => {
    const loc = readLocation();
    return URL_ROUTING ? (PUBLIC_PAGES.includes(loc.key) ? loc.key : 'login') : 'login';
  });
  const active = route.key;
  const navigate = (key, params = null) => {
    setRoute({ key, params });
    writeLocation(key, params);
  };

  useEffect(
    () =>
      onLocationChange((loc) => {
        if (PUBLIC_PAGES.includes(loc.key)) setPublicPage(loc.key);
        else setRoute({ key: loc.key, params: loc.params });
      }),
    [],
  );

  // Signed in: show the page's address (e.g. after signing in from /login); signed out: the public page's.
  useEffect(() => {
    if (status === 'signedIn') writeLocation(route.key, route.params, { replace: true });
    else if (status === 'signedOut') writeLocation(publicPage, null, { replace: true });
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = useMemo(() => {
    if (!me) return [];
    if (!isAdmin && me.user?.kind === 'OWNER') return OWNER_SECTIONS.map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
    if (isAdmin) return ADMIN_SECTIONS.filter((s) => adminSectionAllowed(s, me.admin.role ?? 'OWNER')).map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
    const builtIn = USER_SECTIONS.filter((s) => levelOf(s.key) !== 'HIDDEN').map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
    // sections created by the platform team, shown before "Users" and "Settings" when the plan and role allow them
    const extra = custom
      .filter((c) => !c.parentId && levelOf(`cs_${c.key}`) !== 'HIDDEN')
      .map((c) => ({ key: `cs_${c.key}`, icon: c.icon, label: sectionName(c, lang), tabLabel: sectionName(c, lang), sectionKey: c.key, Screen: CustomSectionScreen }));
    const tailFrom = builtIn.findIndex((s) => s.key === 'users' || s.key === 'settings');
    return tailFrom < 0 ? [...builtIn, ...extra] : [...builtIn.slice(0, tailFrom), ...extra, ...builtIn.slice(tailFrom)];
  }, [me, isAdmin, levelOf, t, custom, lang]);

  // If the current section disappears (e.g. permissions changed), fall back to the first page.
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.key === active)) {
      // the first page of the menu (the dashboard; the portal for an owner)
      const first = sections.some((s) => s.key === 'dashboard') ? 'dashboard' : sections[0].key;
      setRoute({ key: first, params: null });
      writeLocation(first, null, { replace: true });
    }
  }, [sections, active]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (status !== 'signedIn') {
    const openPublic = (page) => {
      setPublicPage(page);
      writeLocation(page);
    };
    // web: a home page that presents the service, then sign in / create an account
    if (URL_ROUTING && publicPage === '') return <LandingScreen onStart={openPublic} />;
    return <LoginScreen initialMode={{ register: 'register', admin: 'admin' }[publicPage] ?? 'signIn'} onModeChange={URL_ROUTING ? (m) => writeLocation({ register: 'register', admin: 'admin' }[m] ?? 'login', null, { replace: true }) : undefined} onHome={URL_ROUTING ? () => openPublic('') : undefined} />;
  }

  // A team member whose password was set by an owner changes it before anything else (the server enforces it too).
  if (isAdmin && me.admin.mustChangePassword) {
    return (
      <Screen title={t('team.mustChangeTitle')}>
        <View style={{ maxWidth: 520, width: '100%' }}>
          <AdminPasswordCard forced />
        </View>
      </Screen>
    );
  }

  // A password given by someone else (owner portal invitation) is changed first (the server enforces it too).
  if (!isAdmin && me.user?.mustChangePassword) {
    return (
      <Screen title={t('team.mustChangeTitle')}>
        <View style={{ maxWidth: 520, width: '100%' }}>
          <ChangePasswordCard forced />
        </View>
      </Screen>
    );
  }

  const current = sections.find((s) => s.key === active) ?? sections[0];
  const ActiveScreen = current?.Screen ?? DashboardScreen;

  return (
    <AppShell items={sections} active={current?.key} onNavigate={navigate}>
      <ActiveScreen key={`${current?.key}:${JSON.stringify(route.params)}`} params={route.params} onNavigate={navigate} sectionKey={current?.sectionKey} />
    </AppShell>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Root />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
