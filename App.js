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
  { key: 'settings', icon: 'cog-outline', Screen: SettingsScreen },
];

function Root() {
  const { status, me, isAdmin, levelOf } = useSession();
  const { t } = useI18n();
  const [route, setRoute] = useState({ key: 'dashboard', params: null });
  const active = route.key;
  const navigate = (key, params = null) => setRoute({ key, params });

  const sections = useMemo(() => {
    if (!me) return [];
    const list = isAdmin ? ADMIN_SECTIONS : USER_SECTIONS.filter((s) => levelOf(s.key) !== 'HIDDEN');
    return list.map((s) => ({ ...s, label: t(`sections.${s.key}`) }));
  }, [me, isAdmin, levelOf, t]);

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
      <ActiveScreen key={`${current?.key}:${JSON.stringify(route.params)}`} params={route.params} onNavigate={navigate} />
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
