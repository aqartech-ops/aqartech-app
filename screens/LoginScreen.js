import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme'; 
import { MaterialCommunityIcons } from '@expo/vector-icons'; 

export default function LoginScreen({ navigation, onLoginSuccess }) {
  const [isRegistering, setIsRegistering] = useState(false); // للتبديل بين الدخول وإنشاء حساب

  // حقول تسجيل الدخول
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // حقول إنشاء حساب جديد (شركة جديدة)
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [phone, setPhone] = useState('');
  
  // خيارات الباقات ودورة السداد الافتراضية
  const [selectedPlan, setSelectedPlan] = useState('PRO'); // BASIC, PRO, ENTERPRISE
  const [billingCycle, setBillingCycle] = useState('MONTHLY'); // MONTHLY أو YEARLY

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // روابط السيرفر
  const LOGIN_API = 'http://localhost:3000/auth/login';
  const REGISTER_API = 'http://localhost:3000/auth/register-company';

  // قائمة الباقات الافتراضية الواضحة
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
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('نجاح', 'تم تسجيل الدخول بنجاح');
        if (onLoginSuccess) onLoginSuccess(data);
      } else {
        Alert.alert('خطأ في تسجيل الدخول', data.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
      }
    } catch (error) {
      console.error('خطأ الاتصال:', error);
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم، تأكد من تشغيل السيرفر');
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
        Alert.alert('نجاح', 'تم إنشاء الحساب والشركة بنجاح، يمكنك تسجيل الدخول الآن');
        setIsRegistering(false);
      } else {
        Alert.alert('خطأ في التسجيل', data.message || 'فشل إنشاء الحساب، حاول مرة أخرى');
      }
    } catch (error) {
      console.error('خطأ الاتصال:', error);
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم، تأكد من تشغيل السيرفر');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* أيقونة أو شعار التطبيق في الأعلى */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="shield-home-outline" size={50} color={COLORS.primary} />
          </View>
          <Text style={styles.appName}>نظام AqarTech</Text>
          <Text style={styles.appSubtitle}>
            {isRegistering ? 'إنشاء حساب شركة جديدة واختيار الباقة' : 'تسجيل الدخول إلى حسابك'}
          </Text>
        </View>

        {/* نموذج تسجيل الدخول أو إنشاء حساب */}
        <View style={styles.formContainer}>
          
          {!isRegistering ? (
            /* ================= نموذج تسجيل الدخول ================= */
            <>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="email-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
                <TextInput
                  style={styles.input}
                  placeholder="البريد الإلكتروني..."
                  placeholderTextColor={COLORS.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
              </View>

              <View style={styles.inputWrapper}>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.iconRight}>
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="كلمة المرور..."
                  placeholderTextColor={COLORS.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
                <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
              </View>

              <TouchableOpacity 
                style={styles.loginButton} 
                onPress={handleLogin}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="login" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.loginButtonText}>دخول</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.switchModeButton} 
                onPress={() => setIsRegistering(true)}>
                <Text style={styles.switchModeText}>ليس لديك حساب؟ <Text style={styles.linkText}>انشئ حساب شركة جديدة</Text></Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ================= نموذج إنشاء حساب وباقات افتراضية ================= */
            <>
              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="office-building" size={22} color={COLORS.primary} style={styles.iconLeft} />
                <TextInput
                  style={styles.input}
                  placeholder="اسم الشركة العقارية..."
                  placeholderTextColor={COLORS.textMuted}
                  value={companyName}
                  onChangeText={setCompanyName}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="account-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
                <TextInput
                  style={styles.input}
                  placeholder="اسم المسؤول / المالك..."
                  placeholderTextColor={COLORS.textMuted}
                  value={ownerName}
                  onChangeText={setOwnerName}
                  textAlign="right"
                />
              </View>

              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="email-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
                <TextInput
                  style={styles.input}
                  placeholder="البريد الإلكتروني للإدارة..."
                  placeholderTextColor={COLORS.textMuted}
                  value={regEmail}
                  onChangeText={setRegEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  textAlign="right"
                />
              </View>

              <View style={styles.inputWrapper}>
                <MaterialCommunityIcons name="phone-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
                <TextInput
                  style={styles.input}
                  placeholder="رقم الهاتف..."
                  placeholderTextColor={COLORS.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textAlign="right"
                />
              </View>

              <View style={styles.inputWrapper}>
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.iconRight}>
                  <MaterialCommunityIcons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  placeholder="كلمة المرور..."
                  placeholderTextColor={COLORS.textMuted}
                  value={regPassword}
                  onChangeText={setRegPassword}
                  secureTextEntry={!showPassword}
                  textAlign="right"
                />
                <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
              </View>

              {/* اختيار دورة السداد (شهري أو سنوي) */}
              <Text style={styles.sectionLabel}>دورة السداد:</Text>
              <View style={styles.billingContainer}>
                <TouchableOpacity 
                  style={[styles.billingOption, billingCycle === 'MONTHLY' && styles.billingActive]}
                  onPress={() => setBillingCycle('MONTHLY')}
                >
                  <Text style={[styles.billingText, billingCycle === 'MONTHLY' && styles.billingTextActive]}>شهري</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.billingOption, billingCycle === 'YEARLY' && styles.billingActive]}
                  onPress={() => setBillingCycle('YEARLY')}
                >
                  <Text style={[styles.billingText, billingCycle === 'YEARLY' && styles.billingTextActive]}>سنوي (توفير)</Text>
                </TouchableOpacity>
              </View>

              {/* قسم الباقات الافتراضية الواضحة */}
              <Text style={styles.sectionLabel}>اختر الباقة المناسبة لشركتك:</Text>
              {defaultPlans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, selectedPlan === plan.id && styles.planCardActive]}
                  onPress={() => setSelectedPlan(plan.id)}
                >
                  <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.planTitle, selectedPlan === plan.id && styles.planTitleActive]}>{plan.name}</Text>
                    <Text style={[styles.planPrice, selectedPlan === plan.id && styles.planPriceActive]}>
                      {billingCycle === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly}
                    </Text>
                  </View>
                  <Text style={styles.planDetails}>{plan.maxProp}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity 
                style={styles.loginButton} 
                onPress={handleRegister}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="account-plus" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.loginButtonText}>إنشاء الحساب والاشتراك</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.switchModeButton} 
                onPress={() => setIsRegistering(false)}>
                <Text style={styles.switchModeText}>لديك حساب بالفعل؟ <Text style={styles.linkText}>تسجيل الدخول</Text></Text>
              </TouchableOpacity>
            </>
          )}

        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: SIZES.padding * 1.5, backgroundColor: COLORS.background },
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