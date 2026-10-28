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
  { key: 'settings', icon: 'cog-outline', Screen: SettingsScreen },
];

function Root() {
  const { status, me, isAdmin, levelOf } = useSession();
  const { t, lang } = useI18n();
  const custom = useCustomSections(status === 'signedIn' && !isAdmin);
  const [route, setRoute] = useState({ key: 'dashboard', params: null });
  const active = route.key;
  const navigate = (key, params = null) => setRoute({ key, params });

  const sections = useMemo(() => {
    if (!me) return [];
    if (isAdmin) return ADMIN_SECTIONS.map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
    const builtIn = USER_SECTIONS.filter((s) => levelOf(s.key) !== 'HIDDEN').map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
    // sections created by the platform team, shown before "Users" and "Settings" when the plan and role allow them
    const extra = custom
      .filter((c) => !c.parentId && levelOf(`cs_${c.key}`) !== 'HIDDEN')
      .map((c) => ({ key: `cs_${c.key}`, icon: c.icon, label: sectionName(c, lang), tabLabel: sectionName(c, lang), sectionKey: c.key, Screen: CustomSectionScreen }));
    const tailFrom = builtIn.findIndex((s) => s.key === 'users' || s.key === 'settings');
    return tailFrom < 0 ? [...builtIn, ...extra] : [...builtIn.slice(0, tailFrom), ...extra, ...builtIn.slice(tailFrom)];
  }, [me, isAdmin, levelOf, t, custom, lang]);

  // If the current section disappears (e.g. permissions changed), fall back to the dashboard.
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.key === active)) setRoute({ key: 'dashboard', params: null });
  }, [sections, active]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (status !== 'signedIn') return <LoginScreen />;

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
