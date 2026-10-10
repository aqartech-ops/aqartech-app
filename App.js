import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLORS, SIZES, SHADOWS } from './theme';

import DashboardScreen from './screens/DashboardScreen';
import CompaniesScreen from './screens/CompaniesScreen';
import UsersScreen from './screens/UsersScreen';
import PropertiesScreen from './screens/PropertiesScreen';
import TenantsScreen from './screens/TenantsScreen';
import FinancialsScreen from './screens/FinancialsScreen';
import DocumentsScreen from './screens/DocumentsScreen';
import SettingsScreen from './screens/SettingsScreen';
import MaintenanceProvidersScreen from './screens/MaintenanceProvidersScreen'; // شاشة مزودي وطواقم الصيانة الجديدة

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardScreen />;
      case 'companies': return <CompaniesScreen />;
      case 'users': return <UsersScreen />;
      case 'properties': return <PropertiesScreen />;
      case 'tenants': return <TenantsScreen />;
      case 'financials': return <FinancialsScreen />;
      case 'documents': return <DocumentsScreen />;
      case 'maintenance': return <MaintenanceProvidersScreen />; // تم ربطها بالشاشة الجديدة
      case 'settings': return <SettingsScreen />;
      default: return <DashboardScreen />;
    }
  };

  const tabs = [
    { id: 'companies', label: 'الشركات', icon: 'office-building' },
    { id: 'users', label: 'المستخدمين', icon: 'account-group' },
    { id: 'properties', label: 'العقارات', icon: 'home-city' },
    { id: 'tenants', label: 'المستأجرين', icon: 'account-key' },
    { id: 'financials', label: 'المالية', icon: 'cash-multiple' },
    { id: 'documents', label: 'المستندات', icon: 'file-document' },
    { id: 'settings', label: 'الإعدادات', icon: 'cog' }
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* شريط العنوان العلوي */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.menuToggleButton} 
          onPress={() => setIsSidebarVisible(!isSidebarVisible)}
        >
          <MaterialCommunityIcons 
            name={isSidebarVisible ? "menu-open" : "menu"} 
            size={24} 
            color={COLORS.primary} 
          />
        </TouchableOpacity>

        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>AqarTech</Text>
        </View>
        
        <View style={{ width: 40 }} />
      </View>

      {/* الحاوية الرئيسية */}
      <View style={styles.mainBody}>
        
        {/* محتوى الشاشة النشطة */}
        <View style={styles.content}>
          {renderScreen()}
        </View>

        {/* طبقة الضبابية للقائمة الجانبية */}
        {isSidebarVisible && (
          <Pressable 
            style={styles.backdrop} 
            onPress={() => setIsSidebarVisible(false)} 
          />
        )}

        {/* القائمة الجانبية */}
        {isSidebarVisible && (
          <View style={styles.sidebar}>
            <ScrollView 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={styles.sidebarScroll}
            >
              {tabs.map((tab) => (
                <TouchableOpacity 
                  key={tab.id}
                  style={[styles.navButton, activeTab === tab.id && styles.activeNavButton]} 
                  onPress={() => {
                    setActiveTab(tab.id);
                    setIsSidebarVisible(false);
                  }}>
                  <MaterialCommunityIcons 
                    name={tab.icon} 
                    size={20} 
                    color={activeTab === tab.id ? COLORS.tabActiveText : COLORS.textMuted} 
                    style={{ marginBottom: 4 }}
                  />
                  <Text style={[styles.navText, activeTab === tab.id && styles.activeNavText]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

      </View>

      {/* الفوتر السفلي */}
      <View style={styles.bottomFooterWrapper}>
        <View style={styles.footerBar}>
          
          {/* 1. العقود */}
          <TouchableOpacity 
            style={styles.footerItem} 
            onPress={() => setActiveTab('documents')}
          >
            <MaterialCommunityIcons 
              name="file-document-outline" 
              size={22} 
              color={activeTab === 'documents' ? COLORS.primary : '#6E5D4F'} 
            />
            <Text style={[styles.footerText, activeTab === 'documents' && styles.footerTextActive]}>العقود</Text>
          </TouchableOpacity>

          {/* 2. الإيرادات */}
          <TouchableOpacity 
            style={styles.footerItem} 
            onPress={() => setActiveTab('financials')}
          >
            <MaterialCommunityIcons 
              name="cash-multiple" 
              size={22} 
              color={activeTab === 'financials' ? COLORS.primary : '#6E5D4F'} 
            />
            <Text style={[styles.footerText, activeTab === 'financials' && styles.footerTextActive]}>الإيرادات</Text>
          </TouchableOpacity>

          {/* مساحة فارغة ليتوسطها زر الهوم البارز */}
          <View style={{ width: 75 }} />

          {/* 3. الصيانة (مزودو الخدمة) */}
          <TouchableOpacity 
            style={styles.footerItem} 
            onPress={() => setActiveTab('maintenance')}
          >
            <MaterialCommunityIcons 
              name="tools" 
              size={22} 
              color={activeTab === 'maintenance' ? COLORS.primary : '#6E5D4F'} 
            />
            <Text style={[styles.footerText, activeTab === 'maintenance' && styles.footerTextActive]}>الصيانة</Text>
          </TouchableOpacity>

          {/* 4. حسابي (الإعدادات) */}
          <TouchableOpacity 
            style={styles.footerItem} 
            onPress={() => setActiveTab('settings')}
          >
            <MaterialCommunityIcons 
              name="account-circle-outline" 
              size={22} 
              color={activeTab === 'settings' ? COLORS.primary : '#6E5D4F'} 
            />
            <Text style={[styles.footerText, activeTab === 'settings' && styles.footerTextActive]}>حسابي</Text>
          </TouchableOpacity>

        </View>

        {/* زر الرئيسية (الهوم) في المنتصف بحجم متناسق ومضبوط تماماً */}
        <TouchableOpacity 
          style={styles.centerHomeContainer}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.9}
        >
          <View style={[styles.homeCircleButton, activeTab === 'dashboard' && styles.homeCircleActive]}>
            <MaterialCommunityIcons 
              name="home-variant" 
              size={22} 
              color={activeTab === 'dashboard' ? '#FFFFFF' : COLORS.primary} 
            />
            <Text style={[styles.homeCircleText, activeTab === 'dashboard' && styles.homeCircleTextActive]}>الرئيسية</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background, 
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.15)',
  },
  menuToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textDark,
    letterSpacing: 1,
  },
  mainBody: {
    flex: 1,
    flexDirection: 'row-reverse',
    position: 'relative',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    zIndex: 5,
  },
  sidebar: {
    width: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderLeftWidth: 1,
    borderColor: COLORS.border,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  sidebarScroll: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  navButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: SIZES.radius, 
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: COLORS.border, 
    marginBottom: 10, 
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeNavButton: {
    backgroundColor: COLORS.tabActiveBg, 
    borderColor: COLORS.tabActiveBg, 
  },
  navText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  activeNavText: {
    color: COLORS.tabActiveText, 
  },
  content: {
    flex: 1, 
    backgroundColor: COLORS.background,
  },

  // تصميم الفوتر السفلي والمحاذاة
  bottomFooterWrapper: {
    height: 70,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingBottom: 5,
  },
  footerBar: {
    width: '92%',
    height: 56,
    backgroundColor: '#E6D7C3',
    borderRadius: 28,
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.3)',
    ...SHADOWS.floating,
  },
  footerItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#6E5D4F',
    marginTop: 2,
    fontWeight: 'bold',
  },
  footerTextActive: {
    color: COLORS.primary,
  },
  centerHomeContainer: { 
    position: 'absolute', 
    top: 6, 
    alignItems: 'center', 
    justifyContent: 'center', 
  },
  homeCircleButton: { 
    width: 54, // تم تصغيره ليصبح متناسقاً تماماً مع ارتفاع شريط الأزرار (56)
    height: 54, 
    borderRadius: 27, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 0.5,
    borderColor: '#FFFDB5', 
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8, 
  },
  homeCircleActive: { 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
    transform: [{ scale: 0.95 }], 
  },
  homeCircleText: { 
    fontSize: 9, 
    fontWeight: 'bold', 
    color: '#2A1F0D', 
    marginTop: -2,
    textShadowColor: 'rgba(255, 255, 255, 0.6)', 
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  homeCircleTextActive: { 
    color: '#FFFFFF', 
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
  },
});