import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native';
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
import MaintenanceProvidersScreen from './screens/MaintenanceProvidersScreen'; 

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false); // للتبديل بين الدخول وإنشاء حساب

  // حقول تسجيل الدخول
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // حقول إنشاء حساب شركة جديدة وباقات
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('PRO'); // BASIC, PRO, ENTERPRISE
  const [billingCycle, setBillingCycle] = useState('MONTHLY'); // MONTHLY أو YEARLY

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // روابط السيرفر المحلي
  const LOGIN_API = 'http://localhost:3000/auth/login';
  const REGISTER_API = 'http://localhost:3000/auth/register-company';

  // الباقات الافتراضية للشركات
  const defaultPlans = [
    { id: 'BASIC', name: 'الباقة الأساسية', priceMonthly: '15 ر.ع', priceYearly: '150 ر.ع', maxProp: '10 عقارات' },
    { id: 'PRO', name: 'الباقة المتقدمة', priceMonthly: '35 ر.ع', priceYearly: '350 ر.ع', maxProp: '50 عقاراً' },
    { id: 'ENTERPRISE', name: 'باقة الشركات الكبرى', priceMonthly: '75 ر.ع', priceYearly: '750 ر.ع', maxProp: 'عقارات غير محدودة' },
  ];

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(LOGIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      const data = await response.json();

      if (response.ok) {
        setIsLoggedIn(true);
        setShowLoginModal(false);
        Alert.alert('نجاح', 'تم تسجيل الدخول بنجاح');
      } else {
        Alert.alert('خطأ في تسجيل الدخول', data.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }
    } catch (error) {
      console.error('خطأ الاتصال:', error);
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم، تأكد من تشغيل السيرفر المحلي');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!companyName.trim() || !ownerName.trim() || !regEmail.trim() || !regPassword.trim()) {
      Alert.alert('تنبيه', 'الرجاء تعبئة جميع الحقول الإجبارية لإنشاء الحساب');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(REGISTER_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          ownerName,
          email: regEmail,
          password: regPassword,
          phone,
          planId: selectedPlan,
          billingCycle,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('نجاح', 'تم إنشاء حساب الشركة واختيار الباقة بنجاح، يمكنك تسجيل الدخول الآن');
        setIsRegistering(false);
      } else {
        Alert.alert('خطأ في التسجيل', data.message || 'فشل إنشاء الحساب، حاول مرة أخرى');
      }
    } catch (error) {
      console.error('خطأ الاتصال:', error);
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم، تأكد من تشغيل السيرفر المحلي');
    } finally {
      setLoading(false);
    }
  };

  if (showLoginModal && !isLoggedIn) {
    return (
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1, backgroundColor: COLORS.background }}
      >
        <ScrollView contentContainerStyle={loginStyles.container} showsVerticalScrollIndicator={false}>
          <TouchableOpacity 
            style={loginStyles.backButton} 
            onPress={() => { setShowLoginModal(false); setIsRegistering(false); }}
          >
            <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
          </TouchableOpacity>

          <View style={loginStyles.logoContainer}>
            <View style={loginStyles.logoCircle}>
              <MaterialCommunityIcons name="shield-home-outline" size={50} color={COLORS.primary} />
            </View>
            <Text style={loginStyles.appName}>نظام AqarTech</Text>
            <Text style={loginStyles.appSubtitle}>
              {isRegistering ? 'إنشاء حساب شركة جديدة واختيار الباقة' : 'تسجيل الدخول إلى حسابك'}
            </Text>
          </View>

          <View style={loginStyles.formContainer}>
            {!isRegistering ? (
              /* نموذج تسجيل الدخول */
              <>
                <View style={loginStyles.inputWrapper}>
                  <MaterialCommunityIcons name="email-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                  <TextInput
                    style={loginStyles.input}
                    placeholder="البريد الإلكتروني..."
                    placeholderTextColor={COLORS.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textAlign="right"
                  />
                </View>

                <View style={loginStyles.inputWrapper}>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={loginStyles.iconRight}>
                    <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={loginStyles.input}
                    placeholder="كلمة المرور..."
                    placeholderTextColor={COLORS.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textAlign="right"
                  />
                  <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                </View>

                <View style={loginStyles.rowBetween}>
                  <Text style={loginStyles.toggleText}>ابقني متصلاً</Text>
                  <Switch
                    value={rememberMe}
                    onValueChange={setRememberMe}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  />
                </View>

                <TouchableOpacity 
                  style={loginStyles.loginButton} 
                  onPress={handleLogin}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="login" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={loginStyles.loginButtonText}>دخول</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={loginStyles.switchModeButton} 
                  onPress={() => setIsRegistering(true)}>
                  <Text style={loginStyles.switchModeText}>ليس لديك حساب؟ <Text style={loginStyles.linkText}>انشئ حساب شركة جديدة</Text></Text>
                </TouchableOpacity>
              </>
            ) : (
              /* نموذج إنشاء حساب شركة جديدة وباقات */
              <>
                <View style={loginStyles.inputWrapper}>
                  <MaterialCommunityIcons name="office-building" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                  <TextInput
                    style={loginStyles.input}
                    placeholder="اسم الشركة العقارية..."
                    placeholderTextColor={COLORS.textMuted}
                    value={companyName}
                    onChangeText={setCompanyName}
                    textAlign="right"
                  />
                </View>

                <View style={loginStyles.inputWrapper}>
                  <MaterialCommunityIcons name="account-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                  <TextInput
                    style={loginStyles.input}
                    placeholder="اسم المسؤول / المالك..."
                    placeholderTextColor={COLORS.textMuted}
                    value={ownerName}
                    onChangeText={setOwnerName}
                    textAlign="right"
                  />
                </View>

                <View style={loginStyles.inputWrapper}>
                  <MaterialCommunityIcons name="email-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                  <TextInput
                    style={loginStyles.input}
                    placeholder="البريد الإلكتروني للإدارة..."
                    placeholderTextColor={COLORS.textMuted}
                    value={regEmail}
                    onChangeText={setRegEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    textAlign="right"
                  />
                </View>

                <View style={loginStyles.inputWrapper}>
                  <MaterialCommunityIcons name="phone-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                  <TextInput
                    style={loginStyles.input}
                    placeholder="رقم الهاتف..."
                    placeholderTextColor={COLORS.textMuted}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    textAlign="right"
                  />
                </View>

                <View style={loginStyles.inputWrapper}>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={loginStyles.iconRight}>
                    <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={loginStyles.input}
                    placeholder="كلمة المرور..."
                    placeholderTextColor={COLORS.textMuted}
                    value={regPassword}
                    onChangeText={setRegPassword}
                    secureTextEntry={!showPassword}
                    textAlign="right"
                  />
                  <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} style={loginStyles.iconLeft} />
                </View>

                <Text style={loginStyles.sectionLabel}>دورة السداد:</Text>
                <View style={loginStyles.billingContainer}>
                  <TouchableOpacity 
                    style={[loginStyles.billingOption, billingCycle === 'MONTHLY' && loginStyles.billingActive]}
                    onPress={() => setBillingCycle('MONTHLY')}
                  >
                    <Text style={[loginStyles.billingText, billingCycle === 'MONTHLY' && loginStyles.billingTextActive]}>شهري</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[loginStyles.billingOption, billingCycle === 'YEARLY' && loginStyles.billingActive]}
                    onPress={() => setBillingCycle('YEARLY')}
                  >
                    <Text style={[loginStyles.billingText, billingCycle === 'YEARLY' && loginStyles.billingTextActive]}>سنوي (توفير)</Text>
                  </TouchableOpacity>
                </View>

                <Text style={loginStyles.sectionLabel}>اختر الباقة المناسبة لشركتك:</Text>
                {defaultPlans.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[loginStyles.planCard, selectedPlan === plan.id && loginStyles.planCardActive]}
                    onPress={() => setSelectedPlan(plan.id)}
                  >
                    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[loginStyles.planTitle, selectedPlan === plan.id && loginStyles.planTitleActive]}>{plan.name}</Text>
                      <Text style={[loginStyles.planPrice, selectedPlan === plan.id && loginStyles.planPriceActive]}>
                        {billingCycle === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly}
                      </Text>
                    </View>
                    <Text style={loginStyles.planDetails}>{plan.maxProp}</Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity 
                  style={loginStyles.loginButton} 
                  onPress={handleRegister}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="account-plus" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={loginStyles.loginButtonText}>إنشاء الحساب والاشتراك</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity 
                  style={loginStyles.switchModeButton} 
                  onPress={() => setIsRegistering(false)}>
                  <Text style={loginStyles.switchModeText}>لديك حساب بالفعل؟ <Text style={loginStyles.linkText}>تسجيل الدخول</Text></Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardScreen />;
      case 'companies': return <CompaniesScreen />;
      case 'users': return <UsersScreen />;
      case 'properties': return <PropertiesScreen />;
      case 'tenants': return <TenantsScreen />;
      case 'financials': return <FinancialsScreen />;
      case 'documents': return <DocumentsScreen />;
      case 'maintenance': return <MaintenanceProvidersScreen />; 
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
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {!isLoggedIn ? (
            <TouchableOpacity 
              style={styles.loginCircleButton} 
              onPress={() => { setShowLoginModal(true); setIsRegistering(false); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="login-variant" size={16} color="#FFFFFF" />
              <Text style={styles.loginCircleText}>دخول</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.menuToggleButton} 
              onPress={() => {
                setIsLoggedIn(false);
                Alert.alert('تم', 'تم تسجيل الخروج بنجاح');
              }}
            >
              <MaterialCommunityIcons name="logout" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity 
            style={[styles.menuToggleButton, { marginRight: 8 }]} 
            onPress={() => setIsSidebarVisible(!isSidebarVisible)}
          >
            <MaterialCommunityIcons 
              name={isSidebarVisible ? "menu-open" : "menu"} 
              size={24} 
              color={COLORS.primary} 
            />
          </TouchableOpacity>
        </View>

        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>AqarTech</Text>
        </View>
        
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.mainBody}>
        <View style={styles.content}>
          {renderScreen()}
        </View>

        {isSidebarVisible && (
          <Pressable 
            style={styles.backdrop} 
            onPress={() => setIsSidebarVisible(false)} 
          />
        )}

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

      <View style={styles.bottomFooterWrapper}>
        <View style={styles.footerBar}>
          <TouchableOpacity style={styles.footerItem} onPress={() => setActiveTab('documents')}>
            <MaterialCommunityIcons name="file-document-outline" size={22} color={activeTab === 'documents' ? COLORS.primary : '#6E5D4F'} />
            <Text style={[styles.footerText, activeTab === 'documents' && styles.footerTextActive]}>العقود</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.footerItem} onPress={() => setActiveTab('financials')}>
            <MaterialCommunityIcons name="cash-multiple" size={22} color={activeTab === 'financials' ? COLORS.primary : '#6E5D4F'} />
            <Text style={[styles.footerText, activeTab === 'financials' && styles.footerTextActive]}>الإيرادات</Text>
          </TouchableOpacity>

          <View style={{ width: 75 }} />

          <TouchableOpacity style={styles.footerItem} onPress={() => setActiveTab('maintenance')}>
            <MaterialCommunityIcons name="tools" size={22} color={activeTab === 'maintenance' ? COLORS.primary : '#6E5D4F'} />
            <Text style={[styles.footerText, activeTab === 'maintenance' && styles.footerTextActive]}>الصيانة</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.footerItem} onPress={() => setActiveTab('settings')}>
            <MaterialCommunityIcons name="account-circle-outline" size={22} color={activeTab === 'settings' ? COLORS.primary : '#6E5D4F'} />
            <Text style={[styles.footerText, activeTab === 'settings' && styles.footerTextActive]}>حسابي</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.centerHomeContainer}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.9}
        >
          <View style={[styles.homeCircleButton, activeTab === 'dashboard' && styles.homeCircleActive]}>
            <MaterialCommunityIcons name="home-variant" size={22} color={activeTab === 'dashboard' ? '#FFFFFF' : COLORS.primary} />
            <Text style={[styles.homeCircleText, activeTab === 'dashboard' && styles.homeCircleTextActive]}>الرئيسية</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const loginStyles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: SIZES.padding * 1.5, backgroundColor: COLORS.background, position: 'relative' },
  backButton: { position: 'absolute', top: 40, right: 20, padding: 8, backgroundColor: COLORS.card, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  logoContainer: { alignItems: 'center', marginBottom: 25 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    ...SHADOWS.floating,
  },
  appName: { fontSize: SIZES.large * 1.1, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 4 },
  appSubtitle: { fontSize: SIZES.small, color: COLORS.textMuted, textAlign: 'center' },
  formContainer: {
    backgroundColor: COLORS.card,
    padding: 20,
    borderRadius: SIZES.radius,
    ...SHADOWS.floating,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: SIZES.radius,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconLeft: { marginRight: 10 },
  iconRight: { marginLeft: 10 },
  input: {
    flex: 1,
    color: COLORS.textDark,
    paddingVertical: 12,
    fontSize: SIZES.font,
  },
  rowBetween: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  toggleText: { color: COLORS.textDark, fontSize: SIZES.font },
  sectionLabel: { color: COLORS.textDark, fontSize: SIZES.font, fontWeight: 'bold', marginBottom: 8, marginTop: 5, textAlign: 'right' },
  billingContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  billingOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  billingActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  billingText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: SIZES.font },
  billingTextActive: { color: COLORS.primary },
  planCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    padding: 12,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  planCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 2,
  },
  planTitle: { color: COLORS.textDark, fontWeight: 'bold', fontSize: SIZES.font },
  planTitleActive: { color: COLORS.primary },
  planPrice: { color: COLORS.textDark, fontWeight: 'bold', fontSize: SIZES.font },
  planPriceActive: { color: COLORS.primary },
  planDetails: { color: COLORS.textMuted, fontSize: SIZES.small, textAlign: 'right', marginTop: 4 },
  loginButton: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  loginButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.medium },
  switchModeButton: { marginTop: 15, alignItems: 'center' },
  switchModeText: { color: COLORS.textMuted, fontSize: SIZES.font },
  linkText: { color: COLORS.primary, fontWeight: 'bold' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  loginCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#FFFDB5',
    ...SHADOWS.floating,
  },
  loginCircleText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: -2,
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
  logoText: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark, letterSpacing: 1 },
  mainBody: { flex: 1, flexDirection: 'row-reverse', position: 'relative' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.35)', zIndex: 5 },
  sidebar: { width: 100, backgroundColor: 'rgba(255, 255, 255, 0.85)', borderLeftWidth: 1, borderColor: COLORS.border, position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 10 },
  sidebarScroll: { paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  navButton: { width: '100%', paddingVertical: 14, borderRadius: SIZES.radius, backgroundColor: 'rgba(255, 255, 255, 0.9)', borderWidth: 1, borderColor: COLORS.border, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  activeNavButton: { backgroundColor: COLORS.tabActiveBg, borderColor: COLORS.tabActiveBg },
  navText: { color: COLORS.textMuted, fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  activeNavText: { color: COLORS.tabActiveText },
  content: { flex: 1, backgroundColor: COLORS.background },
  bottomFooterWrapper: { height: 70, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', position: 'relative', paddingBottom: 5 },
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
    ...SHADOWS.floating 
  },
  footerItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footerText: { fontSize: 11, color: '#6E5D4F', marginTop: 2, fontWeight: 'bold' },
  footerTextActive: { color: COLORS.primary },
  centerHomeContainer: { position: 'absolute', top: 6, alignItems: 'center', justifyContent: 'center' },
  homeCircleButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#FFFDB5', shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 8 },
  homeCircleActive: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 3, transform: [{ scale: 0.95 }] },
  homeCircleText: { fontSize: 9, fontWeight: 'bold', color: '#2A1F0D', marginTop: -2 },
  homeCircleTextActive: { color: '#FFFFFF' },
});